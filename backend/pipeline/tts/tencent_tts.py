from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import math
import queue
import struct
import time
import threading
import uuid
from urllib.parse import urlencode

import websockets
from loguru import logger

from config import TTSConfig
from core.event_bus import bus, Event

EMOTION_MAP = {
    "开心": {"EmotionCategory": "happy",   "EmotionIntensity": 150, "Speed": 1,  "Volume": 2},
    "悲伤": {"EmotionCategory": "sad",     "EmotionIntensity": 120, "Speed": -1, "Volume": -2},
    "愤怒": {"EmotionCategory": "angry",   "EmotionIntensity": 150, "Speed": 2,  "Volume": 4},
    "平静": {"EmotionCategory": "neutral", "EmotionIntensity": 100, "Speed": 0,  "Volume": 0},
    "惊讶": {"EmotionCategory": "fear",    "EmotionIntensity": 130, "Speed": 1,  "Volume": 2},
}


def _pcm_to_amplitude_timeline(pcm: bytes, sample_rate: int, chunk_ms: int = 30) -> list[dict]:
    """将 PCM 16-bit 单声道数据转换为幅度时间线，用于口型驱动。

    每 chunk_ms 毫秒计算一次 RMS，仅保留幅度高于静音阈值的窗口，
    相邻窗口合并为一个 timeline 条目，格式与 TTS API 字幕格式兼容。
    """
    bytes_per_sample = 2  # 16-bit
    samples_per_chunk = int(sample_rate * chunk_ms / 1000)
    bytes_per_chunk = samples_per_chunk * bytes_per_sample
    SILENCE_THRESHOLD = 0.02  # RMS 低于此值视为静音

    timeline: list[dict] = []
    n_chunks = len(pcm) // bytes_per_chunk

    for i in range(n_chunks):
        chunk = pcm[i * bytes_per_chunk: (i + 1) * bytes_per_chunk]
        n = len(chunk) // bytes_per_sample
        if n == 0:
            continue
        samples = struct.unpack(f"<{n}h", chunk[:n * bytes_per_sample])
        rms = math.sqrt(sum(s * s for s in samples) / n) / 32768.0

        if rms < SILENCE_THRESHOLD:
            continue

        begin_ms = i * chunk_ms
        end_ms = begin_ms + chunk_ms

        # 与上一条目相邻则合并（避免碎片化）
        if timeline and timeline[-1]["endTime"] >= begin_ms - chunk_ms:
            timeline[-1]["endTime"] = end_ms
        else:
            timeline.append({"char": ".", "beginTime": begin_ms, "endTime": end_ms})

    return timeline


def _sign_request(secret_id: str, secret_key: str, params: dict) -> str:
    """生成腾讯云 WebSocket TTS 鉴权 URL（HMAC-SHA1 + Base64）。"""
    host = "tts.cloud.tencent.com"
    path = "/stream_wsv2"
    timestamp = int(time.time())
    params["Timestamp"] = timestamp
    params["Expired"] = timestamp + 600

    # 签名原文：参数按 key 字典序排序，值不做 URL 编码
    query = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    sign_str = f"GET{host}{path}?{query}"

    # HMAC-SHA1 + Base64
    signature = base64.b64encode(
        hmac.new(
            secret_key.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha1,
        ).digest()
    ).decode("utf-8")

    # Signature 是 Base64 字符串，交给 urlencode 统一编码，避免双重编码
    params["Signature"] = signature
    return f"wss://{host}{path}?{urlencode(params)}"


class TencentTTSPipeline:
    def __init__(self, config: TTSConfig):
        self.config = config
        self._interrupt_flag = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._audio_queue: queue.Queue[bytes | None] = queue.Queue()
        self._player_thread = threading.Thread(target=self._player_loop, daemon=True)
        self._player_thread.start()

    def interrupt(self):
        """清空播放队列，停止当前播放。"""
        self._interrupt_flag = True
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except queue.Empty:
                break

    async def synthesize(self, text: str, emotion: str = "平静"):
        """调用腾讯云流式 TTS，接收音频帧和时间戳，推送到播放队列和事件总线。"""
        self._loop = asyncio.get_event_loop()
        self._interrupt_flag = False
        emotion_params = EMOTION_MAP.get(emotion, EMOTION_MAP["平静"])
        session_id = str(uuid.uuid4())

        params = {
            "Action": "TextToStreamAudioWSv2",
            "AppId": self.config.app_id,
            "SecretId": self.config.secret_id,
            "SessionId": session_id,
            "VoiceType": self.config.voice_type,
            "Codec": self.config.codec,
            "SampleRate": self.config.sample_rate,
            "Speed": emotion_params["Speed"],
            "Volume": emotion_params["Volume"],
            "EmotionCategory": emotion_params["EmotionCategory"],
            "EmotionIntensity": emotion_params["EmotionIntensity"],
            "SubtitleType": 1,
        }

        url = _sign_request(self.config.secret_id, self.config.secret_key, params)
        timeline: list[dict] = []
        pcm_frames: list[bytes] = []

        def _make_msg(action: str, data: str) -> str:
            return json.dumps({
                "session_id": session_id,
                "message_id": str(uuid.uuid4()),
                "action": action,
                "data": data,
            })

        try:
            async with websockets.connect(url) as ws:
                # 1. 等待服务端 READY（ready=1）再发文本
                async for msg in ws:
                    if self._interrupt_flag:
                        return
                    if isinstance(msg, bytes):
                        continue
                    resp = json.loads(msg)
                    if resp.get("code", 0) != 0:
                        logger.error(f"TTS 错误: {resp}")
                        return
                    if resp.get("ready") == 1:
                        break

                # 2. 发送文本 + 完成信号
                await ws.send(_make_msg("ACTION_SYNTHESIS", text))
                await ws.send(_make_msg("ACTION_COMPLETE", ""))

                # 3. 接收音频帧和字幕，直到 FINAL
                try:
                    async for msg in ws:
                        if self._interrupt_flag:
                            break
                        if isinstance(msg, bytes):
                            pcm_frames.append(msg)
                        else:
                            resp = json.loads(msg)
                            subs_raw = (resp.get("result") or {}).get("subtitles")
                            if resp.get("code", 0) != 0:
                                logger.error(f"TTS 错误: {resp}")
                                break
                            for sub in subs_raw or []:
                                timeline.append({
                                    "char": sub.get("Text", ""),
                                    "beginTime": sub.get("BeginTime", 0),
                                    "endTime": sub.get("EndTime", 0),
                                })
                            if resp.get("final") == 1:
                                break
                except websockets.exceptions.ConnectionClosedError:
                    # 腾讯云服务端发完数据后直接关闭 TCP，无 close frame，属正常结束
                    pass

        except websockets.exceptions.ConnectionClosedError:
            # 腾讯云服务端发完数据后直接关闭 TCP，无 close frame，属正常结束
            pass
        except Exception as e:
            logger.error(f"TTS WebSocket 错误: {e}")
            return

        if not pcm_frames or self._interrupt_flag:
            return

        # 推送字幕事件
        bus.emit(Event.TTS_SUBTITLE, {"text": text, "emotion": emotion})

        # 合并 PCM，加入播放队列
        pcm = b"".join(pcm_frames)
        t0 = time.time() + 0.05  # 预留 50ms 缓冲
        self._audio_queue.put(pcm)

        # 若 API 未返回字幕时间线，从 PCM 幅度生成备用口型时间线
        if not timeline:
            timeline = _pcm_to_amplitude_timeline(pcm, self.config.sample_rate)

        # 推送口型时间线
        if timeline:
            lip_sync_data = {"timeline": timeline, "t0": t0 * 1000, "audioDelay": 50}
            logger.debug(f"TTS_LIP_SYNC: chars={len(timeline)}, first={timeline[0]}")
            bus.emit(Event.TTS_LIP_SYNC, lip_sync_data)

    def _player_loop(self):
        """后台线程：从队列取 PCM，用 pygame 播放。"""
        import pygame
        pygame.mixer.pre_init(frequency=self.config.sample_rate, size=-16, channels=1)
        pygame.mixer.init()

        while True:
            pcm = self._audio_queue.get()
            if pcm is None:
                break
            if self._interrupt_flag:
                continue
            try:
                sound = pygame.mixer.Sound(buffer=pcm)
                channel = sound.play()
                if self._loop:
                    self._loop.call_soon_threadsafe(bus.emit, Event.PLAYBACK_STARTED, {"t0": time.time() * 1000})
                while channel.get_busy():
                    if self._interrupt_flag:
                        channel.stop()
                        break
                    time.sleep(0.02)
                if self._loop:
                    self._loop.call_soon_threadsafe(bus.emit, Event.PLAYBACK_DONE, {})
            except Exception as e:
                logger.error(f"音频播放失败: {e}")

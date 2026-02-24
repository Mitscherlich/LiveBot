from __future__ import annotations

import threading
from collections import deque

import numpy as np
import webrtcvad
from loguru import logger

from config import ASRConfig

SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30
FRAME_BYTES = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2


def _rms(frame: bytes) -> float:
    samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(samples ** 2)))


class VADProcessor:
    """帧级 VAD 检测：RMS预过滤 + webrtcvad + Pre-roll缓冲。"""

    def __init__(self, config: ASRConfig):
        self.vad = webrtcvad.Vad(config.vad_sensitivity)
        self._silence_frames = config.silence_duration_ms // FRAME_DURATION_MS
        self._min_speech_frames = config.min_speech_duration_ms // FRAME_DURATION_MS
        self._rms_threshold = config.vad_rms_threshold
        self._pre_roll: deque[bytes] = deque(maxlen=config.vad_pre_roll_frames)
        self._buffer: list[bytes] = []
        self._silent_count = 0
        self._speaking = False
        self._speech_frame_count = 0
        self._lock = threading.Lock()

    def process(self, frame: bytes) -> bytes | None:
        with self._lock:
            return self._process_locked(frame)

    def force_commit(self) -> bytes | None:
        """强制提交当前 buffer（不等静音超时）。供打断逻辑调用。"""
        with self._lock:
            if not self._speaking or not self._buffer:
                return None
            if self._speech_frame_count >= self._min_speech_frames:
                audio = b"".join(self._buffer)
                logger.debug(f"VAD: force_commit 提交 {len(audio)} bytes")
                self._reset()
                return audio
            self._reset()
            return None

    def _process_locked(self, frame: bytes) -> bytes | None:
        energy = _rms(frame)
        # RMS 预过滤：低能量帧直接视为静音，跳过 webrtcvad
        if energy < self._rms_threshold:
            is_speech = False
        else:
            is_speech = self.vad.is_speech(frame, SAMPLE_RATE)

        if is_speech:
            self._silent_count = 0
            if not self._speaking:
                pre = list(self._pre_roll)
                self._speaking = True
                self._speech_frame_count = 0
                self._buffer = pre          # 前置 pre-roll，防截断词头
                logger.debug(f"VAD: 语音开始（pre-roll={len(pre)}帧，energy={energy:.0f}）")
            self._speech_frame_count += 1
            self._buffer.append(frame)
        else:
            if not self._speaking:
                self._pre_roll.append(frame)   # 仅在静默时维护 pre-roll
            else:
                self._silent_count += 1
                self._buffer.append(frame)      # 保留尾部静音避免截断词尾
                if self._silent_count >= self._silence_frames:
                    if self._speech_frame_count >= self._min_speech_frames:
                        audio = b"".join(self._buffer)
                        logger.debug(f"VAD: 语音结束 {len(audio)} bytes")
                        self._reset()
                        return audio
                    logger.debug(f"VAD: 丢弃短噪音（{self._speech_frame_count}帧）")
                    self._reset()
        return None

    def _reset(self) -> None:
        self._buffer = []
        self._silent_count = 0
        self._speaking = False
        self._speech_frame_count = 0
        # pre-roll 不清空，供下次语音起始使用

from __future__ import annotations

import asyncio
import io
import re
import wave
from loguru import logger

from config import ASRConfig
from core.event_bus import bus, Event

SAMPLE_RATE = 16000

# SenseVoice 情感标签映射
_EMOTION_TAG_MAP = {
    "HAPPY": "happy",
    "SAD": "sad",
    "ANGRY": "angry",
    "DISGUSTED": "disgusted",
    "FEARFUL": "fearful",
    "SURPRISED": "surprised",
    "NEUTRAL": "neutral",
}

# 匹配情感标签：大写字母 + 下划线，如 <|HAPPY|> <|EMO_UNKNOWN|>
_EMOTION_PATTERN = re.compile(r"<\|([A-Z_]+)\|>")
# 匹配所有 <|...|> 标签（任意字符，如 <|Speech|> <|zh|> <|NOISE|>）
_ANY_TAG = re.compile(r"<\|[^|]+\|>")
# 判断文本是否为纯标点/空白，不含任何实质字符
_MEANINGFUL = re.compile(r"[\w\u4e00-\u9fff\u3040-\u30ff]")


def _parse_sensevoice(raw: str) -> tuple[str, str]:
    """从 SenseVoice 原始输出中提取文本和情感标签。"""
    emotion = "neutral"
    match = _EMOTION_PATTERN.search(raw)
    if match:
        tag = match.group(1)
        emotion = _EMOTION_TAG_MAP.get(tag, "neutral")
    # 移除所有 <|...|> 标签（EMO_UNKNOWN、Speech、zh、NOISE 等）
    text = _ANY_TAG.sub("", raw).strip()
    return text, emotion


def _pcm_to_wav(pcm: bytes) -> bytes:
    """将原始 PCM bytes 封装为 WAV 格式（funasr 接受文件路径或 numpy，这里用临时 wav）。"""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    return buf.getvalue()


class SenseVoiceASR:
    def __init__(self, config: ASRConfig):
        self.config = config
        self._model = None
        self._lock = asyncio.Lock()

    def _load_model(self):
        if self._model is not None:
            return
        from funasr import AutoModel
        device = self.config.device
        if device == "auto":
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"加载 SenseVoice-Small，device={device}")
        self._model = AutoModel(
            model="iic/SenseVoiceSmall",
            trust_remote_code=True,
            device=device,
        )
        logger.info("SenseVoice-Small 加载完成")

    async def preload(self) -> None:
        """服务启动时后台预热模型，避免第一句语音等待加载。"""
        async with self._lock:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._load_model)

    async def transcribe(self, pcm: bytes) -> tuple[str, str]:
        """推理，返回 (text, emotion)。"""
        async with self._lock:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._transcribe_sync, pcm)

    def _transcribe_sync(self, pcm: bytes) -> tuple[str, str]:
        self._load_model()
        import tempfile, os
        wav = _pcm_to_wav(pcm)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav)
            tmp_path = f.name
        try:
            result = self._model.generate(
                input=tmp_path,
                cache={},
                language="auto",
                use_itn=True,
            )
            raw = result[0]["text"] if result else ""
            return _parse_sensevoice(raw)
        finally:
            os.unlink(tmp_path)


def init_asr_handler(asr: SenseVoiceASR):
    """注册 MIC_VAD 事件处理，推理后发布 ASR_RESULT。"""

    @bus.on(Event.MIC_VAD)
    async def _handle_mic_vad(data: dict):
        pcm = data["pcm"]
        text, emotion = await asr.transcribe(pcm)
        if not text or not _MEANINGFUL.search(text):
            if text:
                logger.debug(f"[ASR] 丢弃纯标点结果: {text!r}")
            return
        logger.info(f"[ASR] 识别结果: {text!r}  情感: {emotion}")
        bus.emit(Event.ASR_RESULT, {"text": text, "emotion": emotion})

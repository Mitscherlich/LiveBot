from __future__ import annotations

from enum import Enum
from pyee.asyncio import AsyncIOEventEmitter


class Event(str, Enum):
    # ASR
    MIC_VAD = "mic_vad"               # {"pcm": bytes} — 麦克风采集到完整语音段
    ASR_RESULT = "asr_result"          # {"text": str, "emotion": str} — 识别完成

    # LLM
    LLM_CHUNK = "llm_chunk"            # {"text": str} — 所有原始 delta（含情感 JSON 前缀）
    LLM_TEXT_CHUNK = "llm_text_chunk"  # {"text": str} — 情感 JSON 剥离后的纯文本 delta
    LLM_SENTENCE = "llm_sentence"      # {"text": str, "emotion": str}
    LLM_DONE = "llm_done"             # {}

    # TTS
    TTS_AUDIO_FRAME = "tts_audio_frame"       # {"pcm": bytes}
    TTS_LIP_SYNC = "tts_lip_sync"            # {"timeline": list, "t0": float}
    TTS_SUBTITLE = "tts_subtitle"            # {"text": str, "emotion": str}
    PLAYBACK_STARTED = "playback_started"    # {"t0": float}
    PLAYBACK_DONE = "playback_done"          # {}

    # 控制
    INTERRUPT = "interrupt"            # 打断当前播放

    # 工具调用
    TOOL_CALL_START = "tool_call_start"  # {"tool": str, "args": dict}
    TOOL_CALL_END = "tool_call_end"      # {"tool": str, "result": str}


bus = AsyncIOEventEmitter()

from __future__ import annotations

import yaml
from pathlib import Path
from typing import Optional
from pydantic import BaseModel

CONFIG_PATH = Path(__file__).parent / "config.yaml"


class CharacterConfig(BaseModel):
    name: str = "小零"
    persona: str = "你是一个活泼开朗的虚拟主播。"
    live2d_model: str = ""


class LLMConfig(BaseModel):
    provider: str = "deepseek"
    api_key: str = ""
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"
    temperature: float = 0.8
    max_tokens: int = 512


class ASRConfig(BaseModel):
    model_size: str = "small"
    device: str = "auto"
    vad_sensitivity: int = 3
    silence_duration_ms: int = 800
    min_speech_duration_ms: int = 300
    microphone_device_index: Optional[int] = None
    vad_rms_threshold: float = 2200.0   # RMS能量预过滤阈值
    vad_pre_roll_frames: int = 3        # Pre-roll帧数（默认90ms）


class TTSConfig(BaseModel):
    app_id: int = 0
    secret_id: str = ""
    secret_key: str = ""
    voice_type: int = 603004
    codec: str = "pcm"
    sample_rate: int = 16000


class MemoryScoringConfig(BaseModel):
    """记忆重要性打分专用 LLM 配置（独立于对话 LLM，可使用更便宜的小模型）。"""
    provider: str = "deepseek"
    api_key: str = ""
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"


class MemoryConfig(BaseModel):
    short_term_window: int = 10
    short_term_max: int = 50
    long_term_score_threshold: int = 7
    chroma_db_path: str = "./data/chroma"
    sqlite_path: str = "./data/conversations.db"
    scoring: MemoryScoringConfig = MemoryScoringConfig()


class AppConfig(BaseModel):
    character: CharacterConfig = CharacterConfig()
    llm: LLMConfig = LLMConfig()
    asr: ASRConfig = ASRConfig()
    tts: TTSConfig = TTSConfig()
    memory: MemoryConfig = MemoryConfig()


def load_config(path: Path = CONFIG_PATH) -> AppConfig:
    if not path.exists():
        return AppConfig()
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return AppConfig.model_validate(data)


def save_config(config: AppConfig, path: Path = CONFIG_PATH) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(config.model_dump(), f, allow_unicode=True, default_flow_style=False)


# 全局单例，运行时可重新加载
_config: AppConfig = load_config()


def get_config() -> AppConfig:
    return _config


def reload_config() -> AppConfig:
    global _config
    _config = load_config()
    return _config

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


class OpenClawConfig(BaseModel):
    url: str = "http://localhost:18789"
    token: str = ""
    session_key: str = "main"
    agent_id: str = ""
    timeout_ms: int = 120000


class ASRConfig(BaseModel):
    model_size: str = "small"
    device: str = "auto"
    vad_sensitivity: int = 3
    silence_duration_ms: int = 800
    min_speech_duration_ms: int = 300
    microphone_device_index: Optional[int] = None
    vad_rms_threshold: float = 2200.0  # RMS能量预过滤阈值
    vad_pre_roll_frames: int = 3  # Pre-roll帧数（默认90ms）


class TTSConfig(BaseModel):
    enabled: bool = True
    app_id: int = 0
    secret_id: str = ""
    secret_key: str = ""
    voice_type: int = 603004
    codec: str = "pcm"
    sample_rate: int = 16000


class ServerConfig(BaseModel):
    bind_address: str = "127.0.0.1"  # 默认仅监听本地
    port: int = 8000


class AppConfig(BaseModel):
    character: CharacterConfig = CharacterConfig()
    openclaw: OpenClawConfig = OpenClawConfig()
    asr: ASRConfig = ASRConfig()
    tts: TTSConfig = TTSConfig()
    server: ServerConfig = ServerConfig()


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

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from config import AppConfig, TTSConfig, get_config, save_config, reload_config

router = APIRouter(prefix="/api")


def _get_bot():
    """获取全局 bot 实例，未就绪时返回 None。"""
    try:
        import main as app_module
        return getattr(app_module, 'bot', None)
    except Exception:
        return None


@router.get("/config", response_model=AppConfig)
async def read_config():
    return get_config()


@router.post("/config", response_model=AppConfig)
async def write_config(new_config: AppConfig):
    try:
        save_config(new_config)
        cfg = reload_config()
        # 热重载各模块
        try:
            bot = _get_bot()
            if bot:
                bot.reload_config()
        except Exception as e:
            from loguru import logger
            logger.warning(f"热重载模块时出错（非致命）: {e}")
        return cfg
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/status")
async def status():
    return {"status": "running"}


@router.get("/asr/status")
async def asr_status():
    """返回麦克风/VAD 是否正在采集。"""
    bot = _get_bot()
    running = bot.is_mic_running if bot else False
    return {"running": running}


@router.post("/asr/start")
async def asr_start():
    """启动麦克风 + VAD 采集。"""
    try:
        bot = _get_bot()
        if bot:
            await bot.start_mic()
        return {"running": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/asr/stop")
async def asr_stop():
    """停止麦克风 + VAD 采集。"""
    try:
        bot = _get_bot()
        if bot:
            bot.stop_mic()
        return {"running": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tts/preview")
async def preview_tts(body: Optional[TTSConfig] = None):
    """合成示例语音并通过 pygame 播放。body 有值时使用前端当前表单配置，否则使用已保存配置。"""
    from pipeline.tts.tencent_tts import TencentTTSPipeline
    tts_cfg = body if (body and body.secret_id and body.app_id) else get_config().tts
    if not tts_cfg.secret_id or not tts_cfg.secret_key or not tts_cfg.app_id:
        raise HTTPException(status_code=422, detail="TTS 凭证未配置（需填写 AppId、SecretId、SecretKey）")
    try:
        tts = TencentTTSPipeline(tts_cfg)
        await tts.synthesize("你好，我是你的虚拟主播助手！", "平静")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# System Configuration Endpoints

from pydantic import BaseModel, field_validator
import ipaddress


class ServerConfigUpdate(BaseModel):
    bind_address: str
    port: int = 8000

    @field_validator('bind_address')
    @classmethod
    def validate_bind_address(cls, v: str) -> str:
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")


class ServerConfigResponse(BaseModel):
    bind_address: str
    port: int
    restart_required: bool
    message: str


@router.get("/system/config", response_model=ServerConfigResponse)
async def get_system_config():
    """Get system server configuration."""
    cfg = get_config()
    return ServerConfigResponse(
        bind_address=cfg.server.bind_address,
        port=cfg.server.port,
        restart_required=False,
        message="Current server configuration"
    )


@router.post("/system/config", response_model=ServerConfigResponse)
async def update_system_config(update: ServerConfigUpdate):
    """Update system server configuration. Changes require restart."""
    try:
        cfg = get_config()
        cfg.server.bind_address = update.bind_address
        cfg.server.port = update.port
        save_config(cfg)
        reload_config()
        return ServerConfigResponse(
            bind_address=update.bind_address,
            port=update.port,
            restart_required=True,
            message="Configuration saved. Changes will take effect after service restart.",
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

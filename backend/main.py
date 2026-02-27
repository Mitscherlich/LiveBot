from __future__ import annotations

import asyncio
import ipaddress
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from core.bot import VTuberBot
from config import get_config

bot = VTuberBot()



@asynccontextmanager
async def lifespan(app: FastAPI):
    await bot.start()
    logger.add(log_sink, level="INFO", format="{message}")
    yield
    await bot.stop()


app = FastAPI(title="AI VTuber Bot", lifespan=lifespan)

# 路由注册
from api.ws_live2d import router as ws_router, log_sink
from api.config_api import router as config_router
from api.models_api import router as models_router
from api.chat_api import router as chat_router

app.include_router(ws_router)
app.include_router(config_router)
app.include_router(models_router)
app.include_router(chat_router)

# Live2D 模型静态文件
models_dir = Path(__file__).parent.parent / "models"
models_dir.mkdir(exist_ok=True)
app.mount("/models", StaticFiles(directory=str(models_dir)), name="models")

# 前端静态文件（生产构建）—— SPA fallback 支持
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")


def validate_bind_address(address: str) -> str:
    """验证绑定地址是否为有效 IP，无效则返回 127.0.0.1"""
    try:
        ipaddress.ip_address(address)
        return address
    except ValueError:
        logger.warning(f"Invalid bind address '{address}', falling back to 127.0.0.1")
        return "127.0.0.1"


if __name__ == "__main__":
    import uvicorn
    
    config = get_config()
    bind_address = validate_bind_address(config.server.bind_address)
    port = config.server.port
    
    logger.info(f"Starting server on {bind_address}:{port}")

    uvicorn.run("main:app", host=bind_address, port=port, reload=False)

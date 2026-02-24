from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from core.bot import VTuberBot

bot = VTuberBot()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await bot.start()
    yield
    await bot.stop()


app = FastAPI(title="AI VTuber Bot", lifespan=lifespan)

# 路由注册
from api.ws_live2d import router as ws_router
from api.config_api import router as config_router
from api.models_api import router as models_router

app.include_router(ws_router)
app.include_router(config_router)
app.include_router(models_router)

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

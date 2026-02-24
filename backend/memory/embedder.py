from __future__ import annotations

import asyncio
from loguru import logger

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
_model = None
_lock = asyncio.Lock()


def _load():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"加载 Embedding 模型: {MODEL_NAME}")
        _model = SentenceTransformer(MODEL_NAME)
        logger.info("Embedding 模型加载完成")
    return _model


class Embedder:
    async def preload(self):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _load)

    async def embed(self, text: str) -> list[float]:
        loop = asyncio.get_event_loop()
        async with _lock:
            model = await loop.run_in_executor(None, _load)
            vec = await loop.run_in_executor(None, lambda: model.encode(text).tolist())
        return vec

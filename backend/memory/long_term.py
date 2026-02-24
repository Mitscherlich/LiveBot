from __future__ import annotations

import asyncio
import json
from pathlib import Path
from loguru import logger

COLLECTION_NAME = "conversations"


class LongTermMemory:
    def __init__(self, db_path: str):
        self._path = db_path
        self._collection = None

    def _get_collection(self):
        if self._collection is None:
            import chromadb
            client = chromadb.PersistentClient(path=self._path)
            self._collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    async def add(self, text: str, vector: list[float], doc_id: str):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._add_sync, text, vector, doc_id)

    def _add_sync(self, text: str, vector: list[float], doc_id: str):
        col = self._get_collection()
        col.add(documents=[text], embeddings=[vector], ids=[doc_id])

    async def query(self, vector: list[float], top_k: int = 3) -> list[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._query_sync, vector, top_k)

    def _query_sync(self, vector: list[float], top_k: int) -> list[str]:
        col = self._get_collection()
        results = col.query(query_embeddings=[vector], n_results=top_k)
        docs = results.get("documents", [[]])[0]
        return docs

    async def maybe_add(self, text: str, ids: list[int], short_term):
        """LLM 打重要性分，≥7 时写入向量库。"""
        score = await self._score(text)
        logger.debug(f"[记忆] 重要性评分={score}: {text[:40]}...")
        if score >= 7:
            from memory.embedder import Embedder
            embedder = Embedder()
            vec = await embedder.embed(text)
            doc_id = f"conv_{min(ids)}"
            await self.add(text, vec, doc_id)
            logger.info(f"[记忆] 写入长期记忆: {text[:40]}...")
        await short_term.mark_promoted(ids)

    async def _score(self, text: str) -> int:
        """调用打分专用 LLM 对对话重要性打分（0-10）。"""
        from config import get_config
        from openai import AsyncOpenAI

        scoring = get_config().memory.scoring
        client = AsyncOpenAI(
            api_key=scoring.api_key,
            base_url=scoring.base_url or None,
        )
        prompt = f"以下是一段对话，请评估其对于长期记忆的重要性，仅返回0-10的整数：\n\n{text}"
        try:
            resp = await client.chat.completions.create(
                model=scoring.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=5,
                temperature=0,
            )
            raw = resp.choices[0].message.content.strip()
            return int("".join(c for c in raw if c.isdigit())[:2] or "0")
        except Exception as e:
            logger.warning(f"重要性评分失败: {e}")
            return 0

from __future__ import annotations

import asyncio
from pathlib import Path
import aiosqlite
from loguru import logger


class ShortTermMemory:
    def __init__(self, db_path: str):
        self._path = Path(db_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._db: aiosqlite.Connection | None = None

    async def init(self):
        self._db = await aiosqlite.connect(str(self._path))
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                emotion TEXT DEFAULT 'neutral',
                timestamp REAL NOT NULL,
                promoted INTEGER DEFAULT 0
            )
        """)
        await self._db.commit()
        logger.info(f"短期记忆数据库已初始化: {self._path}")

    async def add(self, role: str, content: str, emotion: str = "neutral"):
        import time
        await self._db.execute(
            "INSERT INTO conversations (role, content, emotion, timestamp) VALUES (?, ?, ?, ?)",
            (role, content, emotion, time.time()),
        )
        await self._db.commit()

    async def get_recent(self, n: int = 10) -> list[dict]:
        async with self._db.execute(
            "SELECT role, content, emotion FROM conversations ORDER BY id DESC LIMIT ?", (n * 2,)
        ) as cursor:
            rows = await cursor.fetchall()
        # 按时间升序返回
        return [{"role": r[0], "content": r[1], "emotion": r[2]} for r in reversed(rows)]

    async def count(self) -> int:
        async with self._db.execute("SELECT COUNT(*) FROM conversations") as cur:
            row = await cur.fetchone()
        return row[0] if row else 0

    async def get_unpromoted_oldest(self) -> list[dict]:
        """获取超出窗口且未写入长期记忆的对话对。"""
        async with self._db.execute(
            "SELECT id, role, content FROM conversations WHERE promoted=0 ORDER BY id ASC LIMIT 2"
        ) as cur:
            rows = await cur.fetchall()
        return [{"id": r[0], "role": r[1], "content": r[2]} for r in rows]

    async def mark_promoted(self, ids: list[int]):
        placeholders = ",".join("?" * len(ids))
        await self._db.execute(
            f"UPDATE conversations SET promoted=1 WHERE id IN ({placeholders})", ids
        )
        await self._db.commit()

    async def maybe_promote(self, long_term):
        """超出 50 轮时，对最老的未提升对话进行重要性评估。"""
        total = await self.count()
        if total <= 50:
            return
        turns = await self.get_unpromoted_oldest()
        if not turns:
            return
        text = " ".join(t["content"] for t in turns)
        await long_term.maybe_add(text, [t["id"] for t in turns], self)

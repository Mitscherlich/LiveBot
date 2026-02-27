from __future__ import annotations

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from core.event_bus import bus, Event

router = APIRouter()

# 连接池
_connections: set[WebSocket] = set()

# 情感标签 → Live2D expression name 映射（需与模型 .exp3.json 的 Name 字段一致）
_EMOTION_EXPRESSION_MAP: dict[str, str] = {
    "开心": "happy",
    "悲伤": "sad",
    "愤怒": "angry",
    "平静": "neutral",
    "惊讶": "surprised",
}


async def broadcast(message: dict):
    """向所有已连接的前端广播消息。"""
    if not _connections:
        return
    data = json.dumps(message, ensure_ascii=False)
    dead = set()
    for ws in _connections:
        try:
            await ws.send_text(data)
        except Exception:
            dead.add(ws)
    _connections.difference_update(dead)


@router.websocket("/ws/live2d")
async def ws_live2d(websocket: WebSocket):
    await websocket.accept()
    _connections.add(websocket)
    logger.info(f"Live2D 客户端已连接，当前连接数: {len(_connections)}")
    try:
        while True:
            # 保持连接，等待客户端消息（心跳）
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)
        logger.info(f"Live2D 客户端断开，当前连接数: {len(_connections)}")


# 监听后端事件，广播到前端
@bus.on(Event.ASR_RESULT)
async def _on_asr_result(data: dict):
    await broadcast({"type": "asr_result", **data})


@bus.on(Event.TTS_LIP_SYNC)
async def _on_lip_sync(data: dict):
    await broadcast({"type": "lip_sync", **data})


@bus.on(Event.TTS_SUBTITLE)
async def _on_subtitle(data: dict):
    emotion = data.get("emotion")
    expression = _EMOTION_EXPRESSION_MAP.get(emotion) if emotion else None
    await broadcast({"type": "subtitle", **data, "expression": expression})


@bus.on(Event.LLM_TEXT_CHUNK)
async def _on_llm_text_chunk(data: dict):
    await broadcast({"type": "llm_chunk", **data})


@bus.on(Event.LLM_SENTENCE)
async def _on_llm_sentence(data: dict):
    await broadcast({"type": "llm_sentence", **data})


@bus.on(Event.LLM_DONE)
async def _on_llm_done(_=None):
    await broadcast({"type": "llm_done"})


@bus.on(Event.PLAYBACK_DONE)
async def _on_playback_done(_=None):
    await broadcast({"type": "playback_done"})


def _derive_module(name: str) -> str:
    """将 loguru record 的 name 字段映射到模块标识。"""
    n = name.lower()
    if "asr" in n:
        return "ASR"
    if "llm" in n:
        return "LLM"
    if "tts" in n:
        return "TTS"
    return "SYSTEM"


async def log_sink(message):
    """loguru sink：将 INFO+ 日志通过 WebSocket 广播到前端。"""
    record = message.record
    await broadcast({
        "type": "log_entry",
        "level": record["level"].name,
        "module": _derive_module(record["name"]),
        "message": record["message"],
        "time": record["time"].strftime("%H:%M:%S"),
    })

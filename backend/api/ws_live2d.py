from __future__ import annotations

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from core.event_bus import bus, Event

router = APIRouter()

# 连接池
_connections: set[WebSocket] = set()


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
    await broadcast({"type": "subtitle", **data})


@bus.on(Event.PLAYBACK_DONE)
async def _on_playback_done(_=None):
    await broadcast({"type": "playback_done"})

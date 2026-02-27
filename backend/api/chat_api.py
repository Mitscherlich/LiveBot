from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.event_bus import bus, Event

router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatSendRequest(BaseModel):
    messages: list[ChatMessage]


def _get_bot():
    import main as app_module
    if not hasattr(app_module, 'bot') or app_module.bot is None:
        raise HTTPException(status_code=503, detail="Bot not ready")
    return app_module.bot


@router.post("/chat/send")
async def chat_send(body: ChatSendRequest):
    # 取最后一条 user 消息作为输入
    user_messages = [m for m in body.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="messages must contain at least one user message")
    text = user_messages[-1].content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="user message content must not be empty")
    bot = _get_bot()
    bus.emit(Event.INTERRUPT)
    # 等待 INTERRUPT handler 执行完毕（取消旧 task），再创建新 task，
    # 避免新 task 被 interrupt handler 误取消
    await asyncio.sleep(0)
    bot._current_chat_task = asyncio.create_task(
        bot.llm.generate(text, user_emotion="neutral")
    )
    return {"status": "ok"}


@router.post("/chat/stop")
async def chat_stop():
    bot = _get_bot()
    bus.emit(Event.INTERRUPT)
    return {"status": "ok"}


@router.post("/chat/stream")
async def chat_stream(body: ChatSendRequest):
    """SSE 流式端点：订阅 LLM_TEXT_CHUNK 事件，将 token 级纯文本实时推送给前端。
    TTS/lip_sync 管线仍通过事件总线正常运行。
    """
    user_messages = [m for m in body.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="messages must contain at least one user message")
    text = user_messages[-1].content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="user message content must not be empty")

    bot = _get_bot()
    queue: asyncio.Queue[tuple[str, str | None]] = asyncio.Queue()

    def on_text_chunk(data: dict):
        queue.put_nowait(("chunk", data.get("text", "")))

    def on_done(_=None):
        queue.put_nowait(("done", None))

    bus.on(Event.LLM_TEXT_CHUNK, on_text_chunk)
    bus.on(Event.LLM_DONE, on_done)

    # 打断当前生成，启动新 task（与 /chat/send 一致）
    bus.emit(Event.INTERRUPT)
    await asyncio.sleep(0)
    bot._current_chat_task = asyncio.create_task(
        bot.llm.generate(text, user_emotion="neutral")
    )

    async def stream_generator():
        try:
            while True:
                try:
                    event_type, data = await asyncio.wait_for(queue.get(), timeout=60.0)
                except asyncio.TimeoutError:
                    break
                if event_type == "done":
                    break
                if event_type == "chunk" and data:
                    yield data
        finally:
            bus.remove_listener(Event.LLM_TEXT_CHUNK, on_text_chunk)
            bus.remove_listener(Event.LLM_DONE, on_done)

    return StreamingResponse(
        stream_generator(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )

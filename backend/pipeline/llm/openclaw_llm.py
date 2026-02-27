from __future__ import annotations

import asyncio
import json
import re
from loguru import logger

import httpx

from config import OpenClawConfig
from core.event_bus import bus, Event
from pipeline.llm.base import BaseLLMPipeline

# 句子边界正则
_SENTENCE_END = re.compile(r"[。！？!?\n]")

# 用户情感映射（ASR 输出 → 附加到 user message 的中文标签）
_EMOTION_MAP = {
    "happy": "开心",
    "sad": "悲伤",
    "angry": "愤怒",
    "surprised": "惊讶",
    "fearful": "恐惧",
    "disgusted": "厌恶",
}


class OpenClawLLMPipeline(BaseLLMPipeline):
    """通过 OpenClaw Gateway HTTP 接口实现的 LLM Pipeline。

    使用 httpx.AsyncClient.stream() 消费 SSE，对外事件接口与 openai_llm.py 完全一致：
    - LLM_CHUNK：每个 SSE delta
    - LLM_SENTENCE：按句子边界切割的文本片段（含情感）
    - LLM_DONE：流结束
    """

    def __init__(self, config: OpenClawConfig):
        self.config = config

    def set_tool_registry(self, registry) -> None:
        """no-op：工具能力由 OpenClaw Gateway 内部处理。"""
        pass

    def _has_tools(self) -> bool:
        """no-op：始终返回 False，工具调用由 OpenClaw 侧处理。"""
        return False

    async def _get_long_term_context(self, user_text: str) -> str:
        """no-op：长期记忆由 OpenClaw 的 memory-lancedb 扩展处理。"""
        return ""

    async def generate(self, user_text: str, user_emotion: str = "neutral") -> None:
        """向 OpenClaw Gateway 发起流式请求，将结果通过事件总线发布。"""
        # 用户情感注入
        content = user_text
        if user_emotion and user_emotion not in ("neutral", ""):
            mapped = _EMOTION_MAP.get(user_emotion, user_emotion)
            content = f"{user_text}[用户语气：{mapped}]"

        url = f"{self.config.url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.config.token}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        payload = {
            "model": "openclaw",
            "stream": True,
            "messages": [{"role": "user", "content": content}],
        }
        timeout = httpx.Timeout(self.config.timeout_ms / 1000.0)

        buf = ""
        emotion_parsed = False
        current_emotion = "平静"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode("utf-8", errors="replace")
                        logger.error(
                            f"OpenClaw Gateway 返回 HTTP {response.status_code}，跳过本轮生成: {body[:200]}"
                        )
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        delta = ""
                        try:
                            delta = chunk["choices"][0]["delta"].get("content") or ""
                        except (KeyError, IndexError):
                            continue

                        if not delta:
                            continue

                        buf += delta
                        bus.emit(Event.LLM_CHUNK, {"text": delta})

                        just_parsed_emotion = False
                        if not emotion_parsed:
                            # 等第一个 } 出现，尝试解析情感 JSON
                            if "}" in buf:
                                try:
                                    end = buf.index("}") + 1
                                    parsed = json.loads(buf[:end].strip())
                                    current_emotion = parsed.get("emotion", current_emotion)
                                    buf = buf[end:].lstrip("\n")
                                except (ValueError, json.JSONDecodeError):
                                    logger.debug(f"情感 JSON 解析失败，fallback 为平静: {buf[:buf.index('}')+1]!r}")
                                emotion_parsed = True
                                just_parsed_emotion = True
                                # 发布情感 JSON 之后的剩余真实文本
                                if buf:
                                    bus.emit(Event.LLM_TEXT_CHUNK, {"text": buf})
                        elif not just_parsed_emotion:
                            # 后续 delta 全部是真实文本
                            bus.emit(Event.LLM_TEXT_CHUNK, {"text": delta})

                        if emotion_parsed:
                            # 按句子边界实时发出
                            while True:
                                m = _SENTENCE_END.search(buf)
                                if not m:
                                    break
                                sentence = buf[: m.end()].strip()
                                buf = buf[m.end():]
                                if sentence:
                                    bus.emit(
                                        Event.LLM_SENTENCE,
                                        {"text": sentence, "emotion": current_emotion},
                                    )

            # 流结束后处理剩余内容
            if buf.strip():
                if not emotion_parsed:
                    # fallback：整个输出都在 buf，尝试提取情感
                    try:
                        end = buf.index("}") + 1
                        parsed = json.loads(buf[:end].strip())
                        current_emotion = parsed.get("emotion", current_emotion)
                        buf = buf[end:].lstrip("\n")
                    except (ValueError, json.JSONDecodeError):
                        pass
                for sentence in _split_sentences(buf.strip()):
                    bus.emit(Event.LLM_SENTENCE, {"text": sentence, "emotion": current_emotion})

        except httpx.ConnectError:
            logger.error(
                f"无法连接到 OpenClaw Gateway（{self.config.url}），请确认 Gateway 已启动"
            )
        except httpx.TimeoutException:
            logger.warning(f"OpenClaw Gateway 请求超时（{self.config.timeout_ms}ms）")
        except asyncio.CancelledError:
            pass  # 被主动取消（用户打断），由 finally 负责清理
        except Exception as e:
            logger.error(f"OpenClaw LLM 调用失败: {e}")
        finally:
            bus.emit(Event.LLM_DONE, {})


def _split_sentences(text: str) -> list[str]:
    """按句子边界切割文本，返回非空句子列表。"""
    sentences: list[str] = []
    buf = text.strip()
    while buf:
        m = _SENTENCE_END.search(buf)
        if not m:
            sentences.append(buf)
            break
        sentence = buf[: m.end()].strip()
        buf = buf[m.end():]
        if sentence:
            sentences.append(sentence)
    return sentences

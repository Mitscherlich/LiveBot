from __future__ import annotations

import json
import re
from loguru import logger
from openai import AsyncOpenAI

from config import LLMConfig, CharacterConfig
from core.event_bus import bus, Event

# 句子边界正则
_SENTENCE_END = re.compile(r"[。！？!?\n]")

SYSTEM_PROMPT_TEMPLATE = """\
你的名字是{name}。{persona}

每次回复必须严格使用 JSON 格式，不要输出任何其他内容：
{{"emotion": "<开心|悲伤|愤怒|平静|惊讶>", "text": "<回复内容>"}}
"""


class LLMPipeline:
    def __init__(self, config: LLMConfig, character: CharacterConfig, memory_short, memory_long):
        self.config = config
        self.character = character
        self.memory_short = memory_short
        self.memory_long = memory_long
        self._client: AsyncOpenAI | None = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None or self._client.api_key != self.config.api_key:
            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
            )
        return self._client

    async def _build_messages(self, user_text: str, user_emotion: str) -> list[dict]:
        # 长期记忆检索
        long_term_ctx = ""
        try:
            from memory.embedder import Embedder
            embedder = Embedder()
            vec = await embedder.embed(user_text)
            memories = await self.memory_long.query(vec, top_k=3)
            if memories:
                long_term_ctx = "\n\n【相关记忆】\n" + "\n".join(f"- {m}" for m in memories)
        except Exception as e:
            logger.debug(f"长期记忆检索失败: {e}")

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            name=self.character.name,
            persona=self.character.persona,
        ) + long_term_ctx

        messages = [{"role": "system", "content": system_prompt}]

        # 短期对话历史（跳过内容为空的记录，避免 API 报错）
        history = await self.memory_short.get_recent(self.config.max_tokens)
        for turn in history:
            if turn["content"] and turn["content"].strip():
                messages.append({"role": turn["role"], "content": turn["content"]})

        # 用户输入：JSON 格式，与 LLM 输出格式对称
        user_content = json.dumps(
            {"emotion": user_emotion, "text": user_text},
            ensure_ascii=False,
        )
        messages.append({"role": "user", "content": user_content})

        return messages

    async def generate(self, user_text: str, user_emotion: str = "neutral"):
        client = self._get_client()
        messages = await self._build_messages(user_text, user_emotion)

        buf = ""
        full_text = ""
        current_emotion = "平静"

        try:
            stream = await client.chat.completions.create(
                model=self.config.model,
                messages=messages,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                buf += delta
                full_text += delta
                bus.emit(Event.LLM_CHUNK, {"text": delta})

                # LLM 输出为 JSON，必须等整个 JSON 完整后再提取 text 字段，
                # 否则 text 字段内的句子边界会把 JSON 截断产生乱码
                while True:
                    parsed, remainder = _try_parse_first_json(buf)
                    if parsed is None:
                        break
                    buf = remainder
                    current_emotion = parsed.get("emotion", current_emotion)
                    for sentence in _split_sentences(parsed.get("text", "")):
                        bus.emit(Event.LLM_SENTENCE, {"text": sentence, "emotion": current_emotion})

            # fallback：流结束后 buf 仍有内容（JSON 始终未闭合，或纯文本输出）
            if buf.strip():
                parsed = _parse_llm_output(buf.strip())
                current_emotion = parsed.get("emotion", current_emotion)
                for sentence in _split_sentences(parsed.get("text", buf.strip())):
                    bus.emit(Event.LLM_SENTENCE, {"text": sentence, "emotion": current_emotion})

        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
        finally:
            bus.emit(Event.LLM_DONE, {})
            # 保存本轮对话到短期记忆
            parsed_full = _parse_llm_output(full_text)
            bot_text = parsed_full.get("text", full_text)
            await self.memory_short.add("user", user_text, user_emotion)
            await self.memory_short.add("assistant", bot_text, current_emotion)
            # 触发长期记忆评估（异步后台）
            import asyncio
            asyncio.create_task(self.memory_short.maybe_promote(self.memory_long))


def _parse_llm_output(raw: str) -> dict:
    """尝试从 LLM 输出中解析 JSON，失败时返回 fallback。"""
    raw = raw.strip()
    try:
        start = raw.index("{")
        end = raw.rindex("}") + 1
        return json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError):
        return {"emotion": "平静", "text": raw}


def _try_parse_first_json(text: str) -> tuple[dict | None, str]:
    """从 text 头部尝试提取第一个完整 JSON 对象。
    返回 (解析结果, 剩余文本)；未找到完整 JSON 时返回 (None, text)。"""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end]), text[end:]
    except (ValueError, json.JSONDecodeError):
        return None, text


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

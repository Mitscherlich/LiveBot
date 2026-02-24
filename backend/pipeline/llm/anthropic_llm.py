from __future__ import annotations

import json
import re
from loguru import logger
from anthropic import AsyncAnthropic

from config import LLMConfig, CharacterConfig
from core.event_bus import bus, Event
from pipeline.llm.openai_llm import SYSTEM_PROMPT_TEMPLATE, _parse_llm_output

_SENTENCE_END = re.compile(r"[。！？!?\n]")


class AnthropicLLMPipeline:
    def __init__(self, config: LLMConfig, character: CharacterConfig, memory_short, memory_long):
        self.config = config
        self.character = character
        self.memory_short = memory_short
        self.memory_long = memory_long
        self._client: AsyncAnthropic | None = None

    def _get_client(self) -> AsyncAnthropic:
        if self._client is None or self._client.api_key != self.config.api_key:
            kwargs: dict = {"api_key": self.config.api_key}
            if self.config.base_url:
                kwargs["base_url"] = self.config.base_url
            self._client = AsyncAnthropic(**kwargs)
        return self._client

    async def _build_system_and_messages(self, user_text: str, user_emotion: str) -> tuple[str, list[dict]]:
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

        messages: list[dict] = []

        # 短期对话历史（Anthropic 要求 user/assistant 交替，且只允许 user/assistant role）
        history = await self.memory_short.get_recent(self.config.max_tokens)
        for turn in history:
            role = turn["role"]
            if role == "system":
                continue
            messages.append({"role": role, "content": turn["content"]})

        # 用户输入 + 情感注入
        user_content = user_text
        if user_emotion and user_emotion != "neutral":
            user_content += f"\n[用户语气：{user_emotion}]"
        messages.append({"role": "user", "content": user_content})

        # Anthropic 要求消息以 user 开头且严格交替，去掉开头的 assistant 消息
        while messages and messages[0]["role"] != "user":
            messages.pop(0)

        return system_prompt, messages

    async def generate(self, user_text: str, user_emotion: str = "neutral"):
        client = self._get_client()
        system_prompt, messages = await self._build_system_and_messages(user_text, user_emotion)

        buf = ""
        full_text = ""
        current_emotion = "平静"

        try:
            async with client.messages.stream(
                model=self.config.model,
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    buf += text
                    full_text += text
                    bus.emit(Event.LLM_CHUNK, {"text": text})

                    while True:
                        m = _SENTENCE_END.search(buf)
                        if not m:
                            break
                        sentence_raw = buf[: m.end()].strip()
                        buf = buf[m.end():]
                        if sentence_raw:
                            parsed = _parse_llm_output(sentence_raw)
                            current_emotion = parsed.get("emotion", current_emotion)
                            text_out = parsed.get("text", sentence_raw)
                            if text_out:
                                bus.emit(Event.LLM_SENTENCE, {"text": text_out, "emotion": current_emotion})

            if buf.strip():
                parsed = _parse_llm_output(buf.strip())
                text_out = parsed.get("text", buf.strip())
                if text_out:
                    bus.emit(Event.LLM_SENTENCE, {"text": text_out, "emotion": current_emotion})

        except Exception as e:
            logger.error(f"Anthropic LLM 调用失败: {e}")
        finally:
            bus.emit(Event.LLM_DONE, {})
            parsed_full = _parse_llm_output(full_text)
            bot_text = parsed_full.get("text", full_text)
            await self.memory_short.add("user", user_text, user_emotion)
            await self.memory_short.add("assistant", bot_text, current_emotion)
            import asyncio
            asyncio.create_task(self.memory_short.maybe_promote(self.memory_long))

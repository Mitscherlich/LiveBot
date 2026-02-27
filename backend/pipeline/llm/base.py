from __future__ import annotations

from abc import ABC, abstractmethod


class BaseLLMPipeline(ABC):
    """所有 LLM Pipeline 的抽象基类。"""

    def set_tool_registry(self, registry) -> None:
        """绑定 ToolRegistry（no-op，工具能力由 OpenClaw 内部处理）。"""
        pass

    def _has_tools(self) -> bool:
        """检查是否有可用工具（始终返回 False）。"""
        return False

    @abstractmethod
    async def generate(self, user_text: str, user_emotion: str = "neutral") -> None:
        """处理用户输入，将结果通过事件总线发布。"""
        ...

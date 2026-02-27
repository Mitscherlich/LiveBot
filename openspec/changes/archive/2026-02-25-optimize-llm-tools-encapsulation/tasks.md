## 1. 抽象基类 BaseLLMPipeline

- [x] 1.1 创建 `backend/pipeline/llm/base.py`，定义 `BaseLLMPipeline` 抽象类，声明 `generate()` 抽象方法，持有 `config / character / memory_short / memory_long`，提取公共的长期记忆检索逻辑 `_get_long_term_context()`
- [x] 1.2 更新 `backend/pipeline/llm/openai_llm.py`：`LLMPipeline` 继承 `BaseLLMPipeline`，移除重复的长期记忆检索代码
- [x] 1.3 更新 `backend/pipeline/llm/anthropic_llm.py`：`AnthropicLLMPipeline` 继承 `BaseLLMPipeline`，移除重复的长期记忆检索代码
- [x] 1.4 更新 `backend/core/bot.py`：为 `self.llm` 添加类型注释 `BaseLLMPipeline`

## 2. 工具调用数据结构（无 LangChain）

- [x] 2.1 创建 `backend/pipeline/llm/tool.py`：定义 `ToolSpec`（name/description/parameters JSON schema）和 `ToolCall`（id/name/arguments）Pydantic 数据类
- [x] 2.2 更新 `backend/config.py`：`LLMConfig` 添加 `supports_function_calling: bool = True`

## 3. OpenAI Pipeline 原生 Function Calling

- [x] 3.1 在 `LLMPipeline` 中添加 `bind_tools(tools: list[ToolSpec])` 方法，存储工具列表
- [x] 3.2 更新 `LLMPipeline.generate()`：当绑定了工具且 `config.supports_function_calling=True` 时，将 `tools` 传给 OpenAI SDK；解析 `finish_reason == "tool_calls"` 的响应，返回 `ToolCall` 列表
- [x] 3.3 在 `LLMPipeline` 中添加 `run_with_tools()` 方法，封装工具调用循环（调用→执行→`tool` role 消息反馈→继续），支持 `max_iterations=5` 保护

## 4. 清理与验证

- [x] 4.1 确认 `backend/core/bot.py` 的 `reload_config()` 与新基类结构兼容（`self.llm.config` / `self.llm.character` 仍可直接赋值）
- [x] 4.2 确认所有文件 import 正常，手动运行 `python -c "from pipeline.llm import create_llm_pipeline"` 无报错

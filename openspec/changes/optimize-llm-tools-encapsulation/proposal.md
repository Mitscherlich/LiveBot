## Why

当前 LLM 封装存在过度分层（4 层继承链）、LangChain 适配器与内部 Pipeline 耦合过紧、工具调用依赖模型自由文本输出而非原生 Function Calling 等问题，导致代码复杂度高、可维护性差、工具调用可靠性低。随着支持 OpenAI Function Calling 的模型（Kimi、DeepSeek、Doubao）成为主流，现在是简化架构、提升工具调用稳定性的最佳时机。

## What Changes

- **BREAKING** 简化 LLM Pipeline 继承链：将 `AbstractPipeline → PredictablePipeline → CommonModelPipeline → LLMSyncPipeline` 的 4 层继承压缩为 2 层（`BaseLLM → LLMClient`），消除过度抽象
- **BREAKING** 统一 `openai_format` 策略：所有云端模型（Kimi/DeepSeek/Doubao）及本地 OpenAI 兼容模型统一走 OpenAI SDK，移除 HTTP 自定义请求路径的二元分支
- **BREAKING** 工具调用改为原生 Function Calling：`ToolAgent` 不再将工具 schema 注入 system prompt 并依赖 JSON 文本解析，改为使用 OpenAI SDK 的 `tools` 参数传递，利用原生 `tool_calls` 字段解析调用意图
- 简化 `LangChainAdaptedLLM` 适配器：移除冗余的 `_call(prompt)` 接口，仅保留 `_generate(messages)` 满足 Agent 调用需求
- 统一对话历史模型：内部 `Conversation` 与 LangChain `BaseMessage` 之间的转换逻辑收敛到适配器层，避免多处分散转换
- `LLMPromptManager` 对话历史重置逻辑独立为可配置策略，支持按轮数、按 token 数两种重置模式

## Capabilities

### New Capabilities

- `llm-client`: 精简后的 LLM 通信层，两层继承（`BaseLLM → LLMClient`），统一走 OpenAI SDK，支持流式与非流式输出
- `native-function-calling`: 基于 OpenAI 原生 `tools` 参数的工具注册与调用机制，替代当前文本解析方案
- `conversation-history`: 统一的对话历史管理，支持按轮数 / token 数重置策略，历史与消息格式转换收敛至单一位置

### Modified Capabilities

<!-- 无现有 spec 需要更新 -->

## Impact

**受影响文件**：
- `pipeline/llm/llm_sync.py`、`pipeline/llm/llm_async.py` — 重写，精简继承链
- `pipeline/llm/config.py` — 移除 `openai_format` 标志，改为模型枚举内置协议类型
- `agent/adaptor.py` — 简化适配器，移除 `_call()` 接口
- `agent/tool_agent.py` — 重写工具调用逻辑，改用原生 Function Calling
- `agent/custom_agent.py` — 适配新的工具调用解析方式
- `manager/llm_prompt_manager.py` — 重构历史管理策略

**依赖变化**：
- 移除 `requests` 依赖（HTTP 自定义请求路径废弃）
- `openai` SDK 成为唯一 LLM 通信依赖
- `langchain-core` 保留（BaseChatModel / BaseTool 接口稳定）

**下游影响**：
- 所有调用 `LLMSyncPipeline` / `LLMAsyncPipeline` 的模块需迁移到新的 `LLMClient` API
- 不再支持非 OpenAI 兼容格式的纯 HTTP 本地模型端点

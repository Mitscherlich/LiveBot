## Context

ZerolanLiveRobot 当前的 LLM 封装由 4 层继承链（`AbstractPipeline → PredictablePipeline → CommonModelPipeline → LLMSyncPipeline`）构成，历史上为支持多种模型协议而引入了 `openai_format` 二元标志，工具调用则依赖将 OpenAI Function Schema 注入 system prompt 后，通过正则/JSON 解析模型的自由文本输出。

随着 Kimi、DeepSeek、Doubao 等主流云端模型全面兼容 OpenAI SDK，以及本地部署方案（vLLM/Ollama）也提供 OpenAI 兼容端点，原有的二元策略和过度抽象带来的收益已消失，而维护成本和工具调用不稳定性问题愈发突出。

**约束条件**：
- 保持对 LangChain `BaseTool` 工具生态的兼容（现有 4 个工具无需重写）
- 保持对 `langchain-core` `BaseChatModel` 接口的实现（上游 Agent 框架依赖）
- 不能要求本地模型强制支持原生 Function Calling（部分旧模型不具备此能力）

## Goals / Non-Goals

**Goals:**
- 将 Pipeline 继承层级从 4 层压缩到 2 层（`BaseLLM → LLMClient`）
- 统一所有模型通信路径为 OpenAI SDK，移除 HTTP 自定义请求代码
- 对支持 Function Calling 的模型（云端 API 及兼容端点），使用原生 `tools` 参数传递工具，通过 `tool_calls` 字段解析，提升可靠性
- 对话历史管理重构为可配置策略（按轮数 / 按 token 数重置）
- 消息格式转换逻辑收敛到适配器层单一位置

**Non-Goals:**
- 不移除 LangChain 依赖（`BaseChatModel` / `BaseTool` 接口保留）
- 不支持非 OpenAI 兼容格式的纯 HTTP 自定义协议端点
- 不重写现有 4 个工具（`BaiduBaikeTool` / `MicrophoneTool` / `LangChanger` / `GoCreator`）
- 不引入异步重构（`LLMAsyncPipeline` 保持现有结构，仅同步适配新继承链）
- 不处理流式输出（streaming）的完整重构

## Decisions

### 决策 1：两层继承结构

**选择**：`BaseLLM`（抽象基类）→ `LLMClient`（具体实现）

- `BaseLLM` 定义接口契约：`chat(messages, tools=None) → ChatCompletion`、`stream_chat(messages, tools=None) → Iterator`，以及模型标识符属性
- `LLMClient` 持有 `openai.OpenAI` / `openai.AsyncOpenAI` 实例，根据配置初始化 `base_url` 和 `api_key`，实现全部接口

**放弃的方案**：
- 保留 4 层继承 + 局部重构：历史包袱过重，`PredictablePipeline` 的 `parse_query/parse_prediction` 抽象在 OpenAI SDK 直接返回结构化对象后已无必要
- 完全扁平（单类）：失去可测试性，难以 mock 底层 HTTP 客户端

### 决策 2：工具调用策略分层

**选择**：能力检测 + 降级机制

- `LLMClient` 配置项 `function_calling: bool`（默认 `True`）标记模型是否支持原生 Function Calling
- 支持时：`tools` 参数传递 OpenAI Function Schema，解析 `response.choices[0].message.tool_calls`
- 不支持时：降级为旧有的 system prompt 注入 + JSON 文本解析（保留兼容路径，但标记为 deprecated）

**放弃的方案**：
- 强制所有模型使用原生 Function Calling：会破坏 ChatGLM3-6B、Qwen-7B 等不支持 `tools` 参数的本地模型

### 决策 3：适配器层消息转换收敛

**选择**：双向转换逻辑集中在 `LangChainAdaptedLLM` 的私有方法

- `_lc_to_openai(messages: list[BaseMessage]) → list[dict]`：LangChain 消息 → OpenAI API 格式
- `_openai_to_lc(completion: ChatCompletion) → AIMessage`：OpenAI 响应 → LangChain 消息
- 移除 `Conversation` 内部数据模型（它只是 OpenAI `dict` 的弱包装），直接使用 OpenAI SDK 的 Pydantic 模型

**放弃的方案**：
- 保留 `Conversation` 中间层：增加一次无价值的转换，且 `RoleEnum` 与 OpenAI role 字符串几乎 1:1 映射

### 决策 4：对话历史重置策略

**选择**：策略对象注入 `HistoryResetPolicy`

```python
class HistoryResetPolicy(Protocol):
    def should_reset(self, history: list[dict]) -> bool: ...

class TurnBasedReset:
    def __init__(self, max_turns: int): ...

class TokenBasedReset:
    def __init__(self, max_tokens: int, model: str): ...
```

`LLMPromptManager` 持有 `HistoryResetPolicy` 实例，每次追加消息后调用 `should_reset()`。

## Risks / Trade-offs

- **本地模型不兼容 OpenAI SDK 端点** → 文档明确要求使用 vLLM/Ollama/LM Studio 等提供 OpenAI 兼容接口的部署方案；裸 HTTP 路径不再维护
- **Function Calling 降级路径的长期维护** → 标记为 deprecated，后续版本可安全删除；降级路径代码量小，封装为单独函数便于隔离
- **LangChain 版本升级引入破坏性变更** → `LangChainAdaptedLLM` 作为隔离层，升级时只需修改该文件，不影响内部 `LLMClient`
- **TokenBasedReset 需要 tokenizer 依赖** → 初期实现使用 `tiktoken`（仅 OpenAI 模型），非 OpenAI 模型回退到 TurnBasedReset

## Migration Plan

1. 新建 `pipeline/llm/client.py`（`BaseLLM` + `LLMClient`），与旧文件并存
2. 更新 `agent/adaptor.py` 使用新 `LLMClient`，删除 `Conversation` 转换路径
3. 更新 `agent/tool_agent.py` 使用原生 Function Calling，保留降级路径
4. 更新 `manager/llm_prompt_manager.py` 注入策略对象
5. 删除 `pipeline/llm/llm_sync.py`、`llm_async.py` 中的旧继承链（保留文件，仅导出新类名以向后兼容）
6. 最终删除旧文件，更新所有 import

**回滚**：旧文件在步骤 5 之前并存，出现问题直接切回旧 import 路径。

## Open Questions

- `LLMAsyncPipeline` 是否要在此次优化范围内同步重构？（当前方案：保留现有结构，仅确保接口兼容）
- `BaiduBaikeTool` 的 HTTP 请求是否受 `requests` 依赖移除影响？（需确认工具层是否独立依赖 `requests`）

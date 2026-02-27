## ADDED Requirements

### Requirement: ToolRegistry 绑定接口
`BaseLLMPipeline` SHALL 提供 `set_tool_registry(registry: ToolRegistry) -> None` 方法和 `_has_tools() -> bool` 辅助方法；当 `registry` 不为 None 且 `registry.get_all_specs()` 非空时，`_has_tools()` 返回 `True`。

#### Scenario: 绑定 ToolRegistry 后 _has_tools 返回 True
- **WHEN** 调用 `llm.set_tool_registry(registry)` 且 registry 含有至少一个已注册工具
- **THEN** `llm._has_tools()` 返回 `True`

#### Scenario: 未绑定时 _has_tools 返回 False
- **WHEN** 从未调用 `set_tool_registry()`，或 registry 为空
- **THEN** `llm._has_tools()` 返回 `False`，`generate()` 走原有流式生成路径

---

### Requirement: 工具调用生命周期事件
系统 SHALL 在工具执行前后通过事件总线发出 `TOOL_CALL_START` 和 `TOOL_CALL_END` 事件，供外部模块监听（日志、UI 显示等）。

#### Scenario: 工具执行前发出 TOOL_CALL_START
- **WHEN** LLM 请求触发工具调用，工具执行函数即将被调用
- **THEN** `bus.emit(Event.TOOL_CALL_START, {"tool": tool_name, "args": arguments})`

#### Scenario: 工具执行后发出 TOOL_CALL_END
- **WHEN** 工具执行函数返回结果（无论成功或异常捕获后）
- **THEN** `bus.emit(Event.TOOL_CALL_END, {"tool": tool_name, "result": result_str})`

---

### Requirement: Anthropic Tool Use 支持
`AnthropicLLMPipeline` SHALL 实现与 `OpenAILLMPipeline.run_with_tools()` 等效的工具调用循环，使用 Anthropic Messages API 的 `tools` 参数，检测 `stop_reason == "tool_use"` 并回传 `tool_result` 类型的 content block。

#### Scenario: Anthropic 工具调用循环
- **WHEN** `provider` 为 `anthropic`，`_has_tools()` 为 True，LLM 返回 `stop_reason == "tool_use"`
- **THEN** 系统提取工具调用参数，执行工具，将结果以 `{"type": "tool_result", "tool_use_id": id, "content": result}` 格式追加到 messages，继续请求循环

#### Scenario: Anthropic 工具调用完成返回文本
- **WHEN** Anthropic LLM 在工具循环中返回 `stop_reason == "end_turn"`
- **THEN** 系统将最终文本响应发布为 `LLM_SENTENCE` 事件，触发 TTS

---

## MODIFIED Requirements

### Requirement: 多 Provider 对话生成
系统 SHALL 支持两类 LLM Provider：OpenAI 兼容 Provider（通过 openai SDK `base_url` 参数切换）和 Anthropic（通过 anthropic SDK 的 Messages API 调用）。

支持的 Provider 包括：DeepSeek、Moonshot、豆包、本地 Ollama（OpenAI 兼容），以及 Anthropic Claude 系列模型。

当 `_has_tools()` 为 True 时，两类 Provider 均 SHALL 支持工具调用循环。

#### Scenario: 调用 OpenAI 兼容 Provider
- **WHEN** `provider` 为 `deepseek` / `moonshot` / `doubao` / `custom`，且配置了有效的 `base_url` 和 `api_key`
- **THEN** 系统使用 openai SDK 向对应 provider 发起 Chat Completions 流式请求

#### Scenario: 调用 Anthropic Provider
- **WHEN** `provider` 为 `anthropic`，且配置了有效的 `api_key`（`sk-ant-` 前缀）
- **THEN** 系统使用 anthropic SDK 的 Messages API 发起请求；当有工具绑定时，使用非流式工具调用循环，最终输出文本通过 `LLM_SENTENCE` 事件发布

#### Scenario: 切换 Provider
- **WHEN** 用户在 Web 管理页面修改 provider 配置并保存
- **THEN** 后端热重载时检测 provider 变化，若发生变化则重建 LLM Pipeline 实例，下一次对话请求使用新的 provider，无需重启

## ADDED Requirements

### Requirement: 工具注册为 OpenAI Function Schema
`ToolAgent` SHALL 通过 OpenAI SDK 的 `tools` 参数传递工具定义，工具 schema 由 `convert_to_openai_tool()` 从 `BaseTool` 生成，不再将 schema 注入 system prompt。

#### Scenario: 绑定工具列表
- **WHEN** 调用 `ToolAgent.bind_tools(tools: list[BaseTool])`
- **THEN** 工具 schema 列表被存储，下次 `_generate()` 调用时通过 `tools` 参数传递给 OpenAI SDK，system prompt 中不包含工具定义 JSON

#### Scenario: 绑定空工具列表
- **WHEN** 调用 `ToolAgent.bind_tools([])`
- **THEN** `_generate()` 调用时不传递 `tools` 参数，模型正常返回文本响应

### Requirement: 原生 tool_calls 字段解析
支持 Function Calling 的模型返回响应时，`ToolAgent` SHALL 通过 `response.choices[0].message.tool_calls` 字段解析工具调用意图，不依赖正则或 JSON 文本解析。

#### Scenario: 模型返回工具调用意图
- **WHEN** 模型响应的 `finish_reason == "tool_calls"` 且 `message.tool_calls` 非空
- **THEN** `ToolAgent._generate()` 返回包含 `tool_calls` 的 `AIMessage`，每个调用包含 `id`、`name`、`arguments`（已解析的 dict）

#### Scenario: 模型返回普通文本响应
- **WHEN** 模型响应的 `finish_reason == "stop"` 且 `message.tool_calls` 为空
- **THEN** `ToolAgent._generate()` 返回普通 `AIMessage`，`tool_calls` 字段为空列表

#### Scenario: 工具参数 JSON 解析失败
- **WHEN** `tool_calls[].function.arguments` 不是合法 JSON 字符串
- **THEN** 抛出 `ValueError`，包含工具名称和原始参数字符串，不静默失败

### Requirement: 工具执行与结果反馈
`CustomAgent.run()` SHALL 执行工具后，将结果以 `ToolMessage` 格式追加到对话历史，并继续调用模型直到获得最终文本响应或达到最大轮次。

#### Scenario: 工具执行成功后继续对话
- **WHEN** `ToolAgent` 返回工具调用意图，`CustomAgent` 执行工具得到结果
- **THEN** 结果以 `ToolMessage(content=result, tool_call_id=id)` 追加到历史，模型在下一轮接收工具结果并生成最终回复

#### Scenario: 工具执行异常的处理
- **WHEN** 工具 `_run()` 抛出异常
- **THEN** 异常信息以字符串形式作为 `ToolMessage` 的 `content` 反馈给模型，不中断 `CustomAgent.run()` 循环

#### Scenario: 超过最大工具调用轮次
- **WHEN** 工具调用循环达到 `max_iterations`（默认 5）
- **THEN** 停止循环，返回最后一次模型响应，并在日志中记录警告

### Requirement: Function Calling 降级兼容
对于不支持原生 Function Calling 的模型（`function_calling=False`），`ToolAgent` SHALL 降级为将工具 schema 注入 system prompt 并通过文本解析获取调用意图，此路径标记为 deprecated。

#### Scenario: 降级路径激活条件
- **WHEN** `LLMClient` 配置 `function_calling=False`
- **THEN** `ToolAgent` 自动切换到 system prompt 注入方式，日志输出 deprecation 警告

#### Scenario: 降级路径解析失败的容错
- **WHEN** 降级模式下模型输出不包含合法工具调用 JSON
- **THEN** 视为普通文本响应处理，不抛出异常

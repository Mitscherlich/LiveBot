## ADDED Requirements

### Requirement: 两层继承结构
系统 SHALL 通过 `BaseLLM`（抽象基类）和 `LLMClient`（具体实现）两层结构提供 LLM 通信能力，`BaseLLM` 定义接口契约，`LLMClient` 持有 OpenAI SDK 客户端实例。

#### Scenario: 创建 LLMClient 实例
- **WHEN** 调用方传入 `model`、`api_key`、`base_url` 配置
- **THEN** `LLMClient` 初始化 `openai.OpenAI` 实例并绑定配置，无需额外参数

#### Scenario: BaseLLM 接口不可直接实例化
- **WHEN** 调用方尝试直接实例化 `BaseLLM`
- **THEN** 抛出 `TypeError`，提示需要实现抽象方法

### Requirement: 统一 OpenAI SDK 通信路径
系统 SHALL 通过 OpenAI SDK 进行所有模型通信，不再维护基于 `requests` 的自定义 HTTP 路径。所有支持 OpenAI 兼容格式的模型（Kimi、DeepSeek、Doubao、vLLM、Ollama 等）均通过配置 `base_url` 接入。

#### Scenario: 调用云端 API 模型
- **WHEN** 配置 `model=moonshot-v1-8k`、`base_url=https://api.moonshot.cn/v1`、有效 `api_key`
- **THEN** `LLMClient.chat(messages)` 通过 OpenAI SDK 返回 `ChatCompletion` 对象，响应内容可从 `choices[0].message.content` 读取

#### Scenario: 调用本地 OpenAI 兼容端点
- **WHEN** 配置 `base_url=http://localhost:11434/v1`（Ollama）、`api_key=ollama`
- **THEN** `LLMClient.chat(messages)` 正常返回响应，无需修改调用方代码

#### Scenario: API Key 无效时的错误处理
- **WHEN** `api_key` 不合法或已过期
- **THEN** `LLMClient.chat()` 抛出 `openai.AuthenticationError`，不吞咽异常

### Requirement: 同步非流式输出
`LLMClient` SHALL 实现 `chat(messages: list[dict], **kwargs) -> ChatCompletion` 方法，支持同步阻塞调用。

#### Scenario: 正常对话请求
- **WHEN** 传入包含 `user` 和 `system` 角色消息的列表
- **THEN** 返回包含完整回复的 `ChatCompletion`，`choices[0].finish_reason == "stop"`

#### Scenario: 额外参数透传
- **WHEN** 调用时传入 `temperature=0.7`、`max_tokens=512` 等参数
- **THEN** 参数通过 `**kwargs` 透传到 OpenAI SDK 调用，不被过滤

### Requirement: 流式输出
`LLMClient` SHALL 实现 `stream_chat(messages: list[dict], **kwargs) -> Iterator[ChatCompletionChunk]` 方法，支持流式输出。

#### Scenario: 流式消息逐块返回
- **WHEN** 调用 `stream_chat(messages)`
- **THEN** 返回一个迭代器，每次迭代产出一个 `ChatCompletionChunk`，内容通过 `delta.content` 累积

#### Scenario: 流式结束标志
- **WHEN** 流式响应完成
- **THEN** 最后一个 chunk 的 `finish_reason` 为 `"stop"` 或 `"tool_calls"`，迭代器随后耗尽

### Requirement: 模型能力标志
`LLMConfig` SHALL 通过 `supports_function_calling: bool` 字段声明模型是否支持原生 Function Calling，替代旧的 `openai_format` 二元标志。默认值为 `True`（所有云端 OpenAI 兼容模型均支持）。

#### Scenario: 获取模型能力配置
- **WHEN** 读取 `LLMConfig().supports_function_calling`
- **THEN** 返回 `True`（默认），不支持 Function Calling 的本地模型可在 `config.yaml` 中设为 `false`

#### Scenario: 自定义端点覆盖默认配置
- **WHEN** 在 `config.yaml` 中显式设置 `base_url`
- **THEN** `LLMClient` 使用该 `base_url` 初始化 OpenAI SDK，不依赖硬编码的模型端点

# LLM Pipeline

## Purpose

LLM Pipeline 负责接收 ASR 识别文本，注入对话历史和长期记忆，调用多 Provider LLM 生成角色回复，并以流式方式输出情感标签和回复文本，触发 TTS 合成。

## Requirements

### Requirement: 多 Provider 对话生成

系统 SHALL 支持两类 LLM Provider：OpenAI 兼容 Provider（通过 openai SDK `base_url` 参数切换）和 Anthropic（通过 anthropic SDK 的 Messages API 调用）。

支持的 Provider 包括：DeepSeek、Moonshot、豆包、本地 Ollama（OpenAI 兼容），以及 Anthropic Claude 系列模型。

#### Scenario: 调用 OpenAI 兼容 Provider
- **WHEN** `provider` 为 `deepseek` / `moonshot` / `doubao` / `custom`，且配置了有效的 `base_url` 和 `api_key`
- **THEN** 系统使用 openai SDK 向对应 provider 发起 Chat Completions 流式请求

#### Scenario: 调用 Anthropic Provider
- **WHEN** `provider` 为 `anthropic`，，且配置了有效的 `api_key`（`sk-ant-` 前缀）
- **THEN** 系统使用 anthropic SDK 的 Messages API（`client.messages.stream`）发起流式请求，system prompt 作为独立参数传入

#### Scenario: 切换 Provider
- **WHEN** 用户在 Web 管理页面修改 provider 配置并保存
- **THEN** 后端热重载时检测 provider 变化，若发生变化则重建 LLM Pipeline 实例，下一次对话请求使用新的 provider，无需重启

---

### Requirement: 流式输出与实时字幕推送

系统 SHALL 使用 `stream=True` 进行流式 LLM 调用，并将每个文本块实时通过 WebSocket 推送到前端显示字幕。

#### Scenario: 流式文本接收
- **WHEN** LLM 开始返回流式响应
- **THEN** 系统逐 chunk 接收文本，同时通过 WebSocket 事件 `llm_chunk` 推送到前端

#### Scenario: 句子边界切割
- **WHEN** 流式文本中出现句子结束符（`。！？\n`）
- **THEN** 系统将已积累的文本作为完整句子发布 `llm_sentence` 事件，触发 TTS 合成

---

### Requirement: JSON 格式情感输出

系统 SHALL 通过 system prompt 要求 LLM 以 JSON 格式输出，包含情感标签和回复文本两个字段。

#### Scenario: 正常 JSON 解析
- **WHEN** LLM 输出完整 JSON `{"emotion": "开心", "text": "你好呀～"}`
- **THEN** 系统提取 `emotion` 和 `text`，分别用于 TTS 情感映射和字幕显示

#### Scenario: JSON 解析失败 Fallback
- **WHEN** LLM 输出无法解析为合法 JSON
- **THEN** 系统将完整输出作为 `text`，`emotion` 默认为 `"平静"`，记录警告日志

#### Scenario: 用户情感注入
- **WHEN** ASR 返回了用户情感标签（如 `happy`）
- **THEN** 系统在 LLM 请求的 user message 末尾附加情感提示，如 `[用户语气：愉快]`

---

### Requirement: 对话历史管理

系统 SHALL 维护对话历史，将最近 N 轮对话作为 messages 上下文传入 LLM。

#### Scenario: 正常对话上下文
- **WHEN** 发起 LLM 请求
- **THEN** messages 包含 system prompt + 最近 10 轮对话历史（从 SQLite 读取）+ 当前用户输入

#### Scenario: 长期记忆注入
- **WHEN** ChromaDB 检索到相关长期记忆
- **THEN** 将 Top-3 记忆片段拼接到 system prompt 末尾后发起请求

---

### Requirement: 角色人设 System Prompt

系统 SHALL 在每次 LLM 请求中携带包含角色名称、人设描述和输出格式要求的 system prompt。

#### Scenario: System Prompt 构建
- **WHEN** 发起 LLM 请求
- **THEN** system prompt 包含：角色名、人设描述、JSON 输出格式要求、当前注入的长期记忆（如有）

#### Scenario: 角色配置变更
- **WHEN** 用户在 Web 管理页面修改角色人设并保存
- **THEN** 下一次对话使用新的 system prompt，历史对话记录保留

---

### Requirement: CharacterConfig 支持 injected_history 字段

`CharacterConfig` 数据模型 SHALL 包含 `injected_history: list[dict] = []` 字段，每条 dict 含 `role`（`"user"` 或 `"assistant"`）和 `content`（字符串）两个键，字段可选，默认为空列表，向后兼容。

#### Scenario: 未配置时默认为空列表
- **WHEN** `config.yaml` 的 `character` 块不含 `injected_history`
- **THEN** `get_config().character.injected_history` 返回 `[]`，LLM 请求行为与现有完全一致

#### Scenario: 配置后正确加载为列表
- **WHEN** `config.yaml` 包含格式正确的 `injected_history`（偶数条，user/assistant 交替）
- **THEN** `get_config().character.injected_history` 返回对应列表

---

### Requirement: LLMPipeline 在上下文窗口中注入示范对话

`LLMPipeline.build_messages`（或等效消息构建逻辑）SHALL 将 `character.injected_history` 中的条目，以 `{"role": ..., "content": ...}` 格式插入到系统提示词消息之后、动态短期记忆历史之前。

#### Scenario: injected_history 非空时插入示范对话
- **WHEN** `character.injected_history` 包含 2 条示范对话（1 user + 1 assistant）
- **THEN** 发送给 LLM 的 messages 数组顺序为：`[system, injected_user, injected_assistant, ...recent_history, user_input]`

#### Scenario: injected_history 为空时不影响消息结构
- **WHEN** `character.injected_history` 为 `[]`
- **THEN** 发送给 LLM 的 messages 数组顺序为：`[system, ...recent_history, user_input]`，与现有行为完全一致

#### Scenario: Anthropic 实现同样注入示范对话
- **WHEN** 使用 `anthropic_llm.py` 提供商且 `injected_history` 非空
- **THEN** 注入逻辑通过 `base.py` 统一生效，Anthropic 的 messages 数组中同样包含示范对话

---

### Requirement: injected_history 格式约束（软约束）

系统 SHOULD 在加载时检测 `injected_history` 条目数是否为偶数、role 是否交替，若不符合则输出 WARNING 日志，但不阻止启动。

#### Scenario: 奇数条时输出警告
- **WHEN** `injected_history` 包含奇数条（如 3 条）
- **THEN** 启动日志中出现 WARNING 提示格式异常，系统仍正常启动

---

## MODIFIED Requirements

### Requirement: 多 Provider 对话生成

**Original**: 系统通过硬编码的 `_ANTHROPIC_PROVIDERS` 集合判断 provider 类型

**Updated**: 系统通过查询 builtin-providers 注册表获取 `api_type` 字段判断 provider 类型

#### Scenario: 通过注册表查询 API 类型
- **WHEN** LLM Pipeline 需要确定使用哪个 SDK（openai 或 anthropic）
- **THEN** 系统查询 builtin-providers 注册表中该 provider 的 `api_type` 字段，决定使用 openai SDK 还是 anthropic SDK

#### Scenario: 注册表中无此 Provider
- **WHEN** 配置的 provider 不在 builtin-providers 注册表中
- **THEN** 系统回退到 OpenAI 兼容模式（假设自定义 provider）

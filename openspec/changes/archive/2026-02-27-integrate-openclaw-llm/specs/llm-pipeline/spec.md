## REMOVED Requirements

### Requirement: 多 Provider 对话生成
**Reason**: Livebot 不再直接调用 OpenAI/Anthropic SDK；多 Provider 路由能力委托给 OpenClaw Gateway，Gateway 内部负责管理 Provider 配置和模型选择。
**Migration**: 在 OpenClaw 的 `~/.openclaw/openclaw.json` 中配置 `agents.defaults.model`，设置所需的 Provider 和模型。Livebot 的 `llm.provider / llm.api_key / llm.model` 等字段从 `config.yaml` 中移除。

#### Scenario: 调用 OpenAI 兼容 Provider
- **WHEN** `provider` 为 `deepseek` / `moonshot` / `doubao` / `custom`，且配置了有效的 `base_url` 和 `api_key`
- **THEN** 系统使用 openai SDK 向对应 provider 发起 Chat Completions 流式请求

#### Scenario: 调用 Anthropic Provider
- **WHEN** `provider` 为 `anthropic`，且配置了有效的 `api_key`（`sk-ant-` 前缀）
- **THEN** 系统使用 anthropic SDK 的 Messages API（`client.messages.stream`）发起流式请求，system prompt 作为独立参数传入

#### Scenario: 切换 Provider
- **WHEN** 用户在 Web 管理页面修改 provider 配置并保存
- **THEN** 后端热重载时检测 provider 变化，若发生变化则重建 LLM Pipeline 实例，下一次对话请求使用新的 provider，无需重启

---

### Requirement: 对话历史管理
**Reason**: 对话历史由 OpenClaw Gateway 在 session 级别维护，Livebot 无需本地存储和检索。
**Migration**: OpenClaw 按 `session_key` 自动管理对话上下文；通过 `openclaw.session_key` 配置项指定会话标识（默认 `main`）。

#### Scenario: 正常对话上下文
- **WHEN** 发起 LLM 请求
- **THEN** messages 包含 system prompt + 最近 10 轮对话历史（从 SQLite 读取）+ 当前用户输入

#### Scenario: 长期记忆注入
- **WHEN** ChromaDB 检索到相关长期记忆
- **THEN** 将 Top-3 记忆片段拼接到 system prompt 末尾后发起请求

---

### Requirement: 角色人设 System Prompt
**Reason**: VTuber 角色人设（名称、persona、情感 JSON 输出格式要求）现在通过 OpenClaw Agent 配置管理，而非 Livebot config.yaml。
**Migration**: 将角色人设和情感 JSON 输出格式要求配置到 OpenClaw 的 Agent system prompt 中（`openclaw agent --identity set`）。`character.name` / `character.persona` 字段从 Livebot 配置中移除。

#### Scenario: System Prompt 构建
- **WHEN** 发起 LLM 请求
- **THEN** system prompt 包含：角色名、人设描述、JSON 输出格式要求、当前注入的长期记忆（如有）

#### Scenario: 角色配置变更
- **WHEN** 用户在 Web 管理页面修改角色人设并保存
- **THEN** 下一次对话使用新的 system prompt，历史对话记录保留

---

### Requirement: CharacterConfig 支持 injected_history 字段
**Reason**: 示范对话（injected_history）现在配置在 OpenClaw Agent 的会话预热或 system prompt 中，Livebot 无需维护此字段。
**Migration**: 将示范对话内容迁移到 OpenClaw Agent 配置的 system prompt 或 session injection 功能。

#### Scenario: 未配置时默认为空列表
- **WHEN** `config.yaml` 的 `character` 块不含 `injected_history`
- **THEN** `get_config().character.injected_history` 返回 `[]`，LLM 请求行为与现有完全一致

#### Scenario: 配置后正确加载为列表
- **WHEN** `config.yaml` 包含格式正确的 `injected_history`（偶数条，user/assistant 交替）
- **THEN** `get_config().character.injected_history` 返回对应列表

---

### Requirement: LLMPipeline 在上下文窗口中注入示范对话
**Reason**: 同上，委托给 OpenClaw。
**Migration**: 无需操作，OpenClaw Agent 的 system prompt 中直接配置即可。

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
**Reason**: 随 injected_history 字段一并移除。
**Migration**: 无需操作。

#### Scenario: 奇数条时输出警告
- **WHEN** `injected_history` 包含奇数条（如 3 条）
- **THEN** 启动日志中出现 WARNING 提示格式异常，系统仍正常启动

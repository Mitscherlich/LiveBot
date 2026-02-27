## ADDED Requirements

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

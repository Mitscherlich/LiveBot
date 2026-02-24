## ADDED Requirements

### Requirement: 可配置的 promote 触发阈值
`ShortTermMemory.maybe_promote` 方法 SHALL 使用可配置的 `promote_threshold`（来自 `MemoryConfig`）替代硬编码的 50，默认值为 10。

#### Scenario: 对话轮数超过阈值时触发 promote
- **WHEN** 短期记忆中对话总数 > `memory.promote_threshold`（默认 10）
- **THEN** 取出最老的未 promote 对话对，发起重要性评分

#### Scenario: 对话轮数未超过阈值时不触发
- **WHEN** 短期记忆中对话总数 <= `memory.promote_threshold`
- **THEN** `maybe_promote` 直接返回，不做任何操作

#### Scenario: promote_threshold 可通过 config.yaml 自定义
- **WHEN** `config.yaml` 中 `memory.promote_threshold: 30`
- **THEN** `maybe_promote` 在对话总数 > 30 时才触发

### Requirement: MemoryConfig 新增 promote_threshold 字段
`MemoryConfig` 数据模型 SHALL 包含 `promote_threshold: int = 10` 字段，向后兼容（已有 config.yaml 不填此字段时使用默认值 10）。

#### Scenario: 未配置时使用默认值 10
- **WHEN** `config.yaml` 的 `memory` 块不含 `promote_threshold`
- **THEN** `get_config().memory.promote_threshold` 返回 `10`

#### Scenario: 配置为自定义值时正确加载
- **WHEN** `config.yaml` 包含 `memory.promote_threshold: 20`
- **THEN** `get_config().memory.promote_threshold` 返回 `20`

### Requirement: 明确记忆关键词触发强制写入
`LLMPipeline.generate` 方法 SHALL 在对话保存到短期记忆后，检测用户输入是否包含明确记忆关键词（"请记住"、"帮我记住"、"记一下"、"记住这个"），若匹配则立即调用 `long_term.maybe_add(..., force=True)` 写入长期记忆，不受 `promote_threshold` 限制。

#### Scenario: 用户说"请记住"触发强制写入
- **WHEN** 用户输入包含"请记住"
- **THEN** 当前用户/助手对话直接写入 ChromaDB，不经过评分

#### Scenario: 用户说"帮我记住"触发强制写入
- **WHEN** 用户输入包含"帮我记住"
- **THEN** 当前用户/助手对话直接写入 ChromaDB，不经过评分

#### Scenario: 强制写入后仍调用 maybe_promote
- **WHEN** 强制写入路径被触发
- **THEN** 对话条目被标记为 promoted（不重复触发 maybe_promote 对相同条目打分）

#### Scenario: 普通对话不触发强制写入
- **WHEN** 用户输入不包含任何记忆关键词
- **THEN** 走正常 `maybe_promote` 流程，受阈值和评分限制

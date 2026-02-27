## ADDED Requirements

### Requirement: API Key 回退机制
当 `memory.scoring.api_key` 为空字符串时，`LongTermMemory._score` 方法 SHALL 自动回退使用主 LLM 配置（`llm.api_key` 和 `llm.base_url`）来发起评分调用，而不是抛出认证异常返回 0。

#### Scenario: scoring api_key 未配置时回退到主 LLM
- **WHEN** `memory.scoring.api_key` 为空字符串
- **THEN** `_score` 使用 `get_config().llm.api_key` 和 `get_config().llm.base_url` 构建 OpenAI 客户端

#### Scenario: scoring api_key 已配置时使用专用配置
- **WHEN** `memory.scoring.api_key` 非空
- **THEN** `_score` 使用 `memory.scoring.api_key` 和 `memory.scoring.base_url` 构建客户端，不发生回退

### Requirement: 评分 Prompt 格式约束
`LongTermMemory._score` 方法 SHALL 使用 system role 严格约束模型只输出纯整数，user role 提供对话内容和打分维度，以提升格式稳定性和评分准确性。

#### Scenario: system role 约束输出格式
- **WHEN** 发起评分 API 调用
- **THEN** messages 包含 `{"role": "system", "content": "你是记忆重要性评估助手。...只输出一个0到10的整数，不要输出任何其他内容。"}`

#### Scenario: user role 包含打分维度
- **WHEN** 发起评分 API 调用
- **THEN** user message 包含对话文本及打分说明，维度包括：个人信息/偏好、重要事件/约定、明确要求记住的内容

#### Scenario: LLM 返回纯数字时正确解析
- **WHEN** LLM 响应内容为 `"7"`
- **THEN** `_score` 返回整数 `7`

#### Scenario: LLM 返回带文字时提取数字
- **WHEN** LLM 响应内容为 `"7分"`
- **THEN** `_score` 提取并返回整数 `7`

#### Scenario: LLM 返回 10 时正确解析
- **WHEN** LLM 响应内容为 `"10"`
- **THEN** `_score` 返回整数 `10`（不因 `[:2]` 截断而出错）

### Requirement: 评分失败时的诊断日志
`LongTermMemory._score` 方法 SHALL 在评分调用失败时记录包含异常类型和配置状态（api_key 是否为空）的 warning 日志，而不仅仅记录异常消息。

#### Scenario: API 调用异常时输出诊断信息
- **WHEN** `client.chat.completions.create(...)` 抛出异常
- **THEN** 日志中包含异常类型名称和 `api_key_empty=True/False` 状态

#### Scenario: 评分失败时返回 0
- **WHEN** 任何异常导致评分失败
- **THEN** `_score` 返回 `0`（保持现有行为，不抛出）

### Requirement: 多维加权评分公式
`LongTermMemory` SHALL 使用本地可计算的多维加权公式替代单一 LLM 打分，仅在边界区间才发起 LLM 调用，以降低 API 开销并提升评分稳定性。

公式：`score = history_fullness(×0.3) + sentiment_intensity(×0.2) + content_filter(×0.2) + memory_value(×0.1)`，阈值 `> 0.5`。

#### Scenario: 本地分量足够高时跳过 LLM 调用
- **WHEN** `history_fullness + sentiment_intensity + content_filter > 0.5`
- **THEN** 直接写入 ChromaDB，不发起 LLM 评分 API 调用

#### Scenario: 本地分量明确不足时跳过写入
- **WHEN** `local_score + 0.1 <= 0.5`（即使 LLM 满分也不能通过）
- **THEN** 跳过写入，不发起 LLM 调用

#### Scenario: 边界区间时调用 LLM 做最终判决
- **WHEN** `0.4 < local_score <= 0.5`
- **THEN** 调用 `_score()` 获取 `memory_value`，计算 `total = local_score + memory_value/10 * 0.1`，`total > 0.5` 时写入

#### Scenario: 情感标签影响评分权重
- **WHEN** `user_emotion` 为 `"悲伤"` 或 `"愤怒"` 或 `"惊讶"`
- **THEN** `sentiment_intensity` 贡献 0.2（满权重）

#### Scenario: 对话包含个人信息关键词时提升评分
- **WHEN** 对话文本含"叫"/"喜欢"/"记住"/"约好"/"生日"等关键词
- **THEN** `content_filter` 贡献 0.2（满权重）

---

### Requirement: 强制写入路径
`LongTermMemory.maybe_add` 方法 SHALL 支持 `force: bool = False` 参数，当 `force=True` 时跳过 LLM 评分直接写入 ChromaDB。

#### Scenario: force=True 时跳过评分直接写入
- **WHEN** `maybe_add(text, ids, short_term, force=True)` 被调用
- **THEN** 跳过 `_score` 调用，直接生成 embedding 并写入 ChromaDB

#### Scenario: force=False 时走正常评分流程
- **WHEN** `maybe_add(text, ids, short_term)` 以默认参数调用
- **THEN** 正常调用 `_score`，仅当 `score >= 7` 时写入

## REMOVED Requirements

### Requirement: SQLite 短期对话记忆
**Reason**: 对话历史完全委托给 OpenClaw Gateway 按 session 管理，Livebot 不再需要本地 SQLite 存储。`aiosqlite` 依赖随之移除。
**Migration**: OpenClaw 自动维护每个 `session_key` 的对话历史。历史数据可通过 `openclaw gateway chat history` CLI 命令查看，或通过 Gateway WebSocket API `chat.history` 方法获取。

#### Scenario: 对话写入
- **WHEN** 一轮对话（ASR 输入 + LLM 回复）完成
- **THEN** 系统将 `{role, content, emotion, timestamp}` 写入 SQLite `conversations` 表

#### Scenario: 检索近期对话
- **WHEN** LLM 请求构建 messages 上下文
- **THEN** 系统从 SQLite 查询最近 10 轮对话，按时间升序排列后拼入 messages

#### Scenario: 滚动窗口清理
- **WHEN** SQLite 中对话总数超过 50 轮
- **THEN** 系统触发长期记忆评估流程，对第 51 轮及更早的记录打重要性分

---

### Requirement: ChromaDB 长期语义记忆
**Reason**: 长期记忆能力委托给 OpenClaw 的 `memory-lancedb` 扩展，Livebot 不再维护 ChromaDB 实例及本地 Embedding 模型。`chromadb` 和 `sentence-transformers` 依赖随之移除。
**Migration**: 在 OpenClaw 中启用 `@openclaw/memory-lancedb` 扩展（配置 `hooks.internal.entries.session-memory.enabled: true`），OpenClaw 将自动捕获和检索重要记忆，无需额外配置。

#### Scenario: 重要性评分与写入
- **WHEN** 对话记录触发长期记忆评估（超出短期窗口）
- **THEN** 系统异步调用 LLM 对该对话打重要性分（0-10），分数 ≥ 7 时向量化写入 ChromaDB，评分提示词仅含对话内容和评分指令，输出仅为单个数字

#### Scenario: 语义检索注入上下文
- **WHEN** 构建 LLM 请求前
- **THEN** 系统用当前用户输入查询 ChromaDB，检索语义最相关的 Top-3 记忆，拼接到 system prompt

#### Scenario: 向量化使用本地 Embedding 模型
- **WHEN** 对话写入 ChromaDB
- **THEN** 系统使用本地 `paraphrase-multilingual-MiniLM-L12-v2` 模型生成 384 维向量，不依赖外部 API

---

### Requirement: 记忆系统异步不阻塞主流程
**Reason**: 随整体记忆系统移除。OpenClaw 侧的记忆操作同样为异步非阻塞。
**Migration**: 无需操作，OpenClaw 的记忆捕获在 Agent 内部异步执行。

#### Scenario: 后台异步写入
- **WHEN** 触发长期记忆评估
- **THEN** 系统使用 `asyncio.create_task` 在后台执行，主对话流程不等待其完成

#### Scenario: Embedding 模型预加载
- **WHEN** 系统启动
- **THEN** sentence-transformers 模型在后台预加载，不阻塞 API 服务就绪

---

### Requirement: API Key 回退机制
**Reason**: 随评分 LLM 调用移除。
**Migration**: 无需操作。

#### Scenario: scoring api_key 未配置时回退到主 LLM
- **WHEN** `memory.scoring.api_key` 为空字符串
- **THEN** `_score` 使用 `get_config().llm.api_key` 和 `get_config().llm.base_url` 构建 OpenAI 客户端

#### Scenario: scoring api_key 已配置时使用专用配置
- **WHEN** `memory.scoring.api_key` 非空
- **THEN** `_score` 使用 `memory.scoring.api_key` 和 `memory.scoring.base_url` 构建客户端，不发生回退

---

### Requirement: 评分 Prompt 格式约束
**Reason**: 随评分 LLM 调用移除。
**Migration**: 无需操作。

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

---

### Requirement: 评分失败时的诊断日志
**Reason**: 随评分 LLM 调用移除。
**Migration**: 无需操作。

#### Scenario: API 调用异常时输出诊断信息
- **WHEN** `client.chat.completions.create(...)` 抛出异常
- **THEN** 日志中包含异常类型名称和 `api_key_empty=True/False` 状态

#### Scenario: 评分失败时返回 0
- **WHEN** 任何异常导致评分失败
- **THEN** `_score` 返回 `0`（保持现有行为，不抛出）

---

### Requirement: 多维加权评分公式
**Reason**: 随评分系统移除。
**Migration**: 无需操作。

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
**Reason**: 随记忆系统移除。
**Migration**: 无需操作。

#### Scenario: force=True 时跳过评分直接写入
- **WHEN** `maybe_add(text, ids, short_term, force=True)` 被调用
- **THEN** 跳过 `_score` 调用，直接生成 embedding 并写入 ChromaDB

#### Scenario: force=False 时走正常评分流程
- **WHEN** `maybe_add(text, ids, short_term)` 以默认参数调用
- **THEN** 正常调用 `_score`，仅当 `score >= 7` 时写入

---

### Requirement: 可配置的 promote 触发阈值
**Reason**: 随记忆系统移除。
**Migration**: 无需操作。

#### Scenario: 对话轮数超过阈值时触发 promote
- **WHEN** 短期记忆中对话总数 > `memory.promote_threshold`（默认 10）
- **THEN** 取出最老的未 promote 对话对，发起重要性评分

#### Scenario: 对话轮数未超过阈值时不触发
- **WHEN** 短期记忆中对话总数 <= `memory.promote_threshold`
- **THEN** `maybe_promote` 直接返回，不做任何操作

#### Scenario: promote_threshold 可通过 config.yaml 自定义
- **WHEN** `config.yaml` 中 `memory.promote_threshold: 30`
- **THEN** `maybe_promote` 在对话总数 > 30 时才触发

---

### Requirement: MemoryConfig 新增 promote_threshold 字段
**Reason**: `MemoryConfig` 随记忆系统整体移除。
**Migration**: 无需操作，`memory` 配置节点从 `config.yaml` 中移除。

#### Scenario: 未配置时使用默认值 10
- **WHEN** `config.yaml` 的 `memory` 块不含 `promote_threshold`
- **THEN** `get_config().memory.promote_threshold` 返回 `10`

#### Scenario: 配置为自定义值时正确加载
- **WHEN** `config.yaml` 包含 `memory.promote_threshold: 20`
- **THEN** `get_config().memory.promote_threshold` 返回 `20`

---

### Requirement: 明确记忆关键词触发强制写入
**Reason**: 随记忆系统移除。OpenClaw 内置记忆系统会根据对话内容自动判断是否写入长期记忆。
**Migration**: 无需操作，用户说"请记住"等关键词时，OpenClaw 的 Agent 会根据其内置规则处理。

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

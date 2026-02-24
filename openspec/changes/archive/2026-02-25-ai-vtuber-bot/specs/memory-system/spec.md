## ADDED Requirements

### Requirement: SQLite 短期对话记忆
系统 SHALL 使用 aiosqlite 将每轮对话（用户输入 + 机器人回复）实时写入 SQLite 数据库，并支持按时间倒序检索最近 N 轮。

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
系统 SHALL 使用 ChromaDB（本地文件模式）存储重要对话的语义向量，支持按语义相似度检索相关记忆。

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
系统 SHALL 确保长期记忆的评分和写入操作在后台异步执行，不阻塞当前对话的 LLM 调用和 TTS 播放。

#### Scenario: 后台异步写入
- **WHEN** 触发长期记忆评估
- **THEN** 系统使用 `asyncio.create_task` 在后台执行，主对话流程不等待其完成

#### Scenario: Embedding 模型预加载
- **WHEN** 系统启动
- **THEN** sentence-transformers 模型在后台预加载，不阻塞 API 服务就绪

## 1. 配置层扩展

- [x] 1.1 在 `backend/config.py` 的 `MemoryConfig` 中新增 `promote_threshold: int = 10` 字段
- [x] 1.2 在 `backend/config.py` 的 `CharacterConfig` 中新增 `injected_history: list[dict] = []` 字段（每条含 `role` 和 `content`）
- [x] 1.3 验证现有 `config.yaml` 不填这两个字段时均加载默认值（向后兼容）

## 2. 修复 LongTermMemory._score 方法

- [x] 2.1 在 `backend/memory/long_term.py` 的 `_score` 方法中，当 `scoring.api_key` 为空字符串时，回退使用 `get_config().llm.api_key` 和 `get_config().llm.base_url`
- [x] 2.2 将 `_score` 的 messages 改为 system + user 两条：system 约束"只输出一个0到10的整数"，user 提供对话内容和打分维度（个人信息/偏好、重要事件、明确记忆请求）
- [x] 2.3 增强错误日志：异常时输出 `type(e).__name__` 和 `api_key_empty=True/False`
- [x] 2.4 验证数字解析逻辑：确认 LLM 返回 "10" 时正确解析为 10，返回 "7分" 时提取为 7

## 3. 修复 LongTermMemory.maybe_add 强制写入

- [x] 3.1 在 `maybe_add` 方法签名中增加 `force: bool = False` 参数
- [x] 3.2 当 `force=True` 时跳过评分，直接进行 embedding + 写入 ChromaDB，记录 `score=1.0`
- [x] 3.3 `force=True` 路径写入完成后，同样调用 `short_term.mark_promoted(ids)`

## 4. 修复 ShortTermMemory.maybe_promote 触发阈值

- [x] 4.1 修改 `backend/memory/short_term.py` 的 `maybe_promote` 方法，接受 `threshold: int = 10` 参数（或从 config 读取）
- [x] 4.2 将触发条件从 `total <= 50` 改为 `total <= threshold`
- [x] 4.3 更新 `LLMPipeline` 中调用 `maybe_promote` 的代码，传入 `get_config().memory.promote_threshold`

## 5. LLM Pipeline 关键词检测

- [x] 5.1 在 `backend/pipeline/llm/openai_llm.py` 的 `generate()` finally 块中，在 `memory_short.add()` 之后，检测用户输入是否含关键词：`"请记住"、"帮我记住"、"记一下"、"记住这个"`
- [x] 5.2 若匹配，获取刚写入短期记忆的两条记录的 id，调用 `memory_long.maybe_add(text, ids, memory_short, force=True)`
- [x] 5.3 检查 `backend/pipeline/llm/anthropic_llm.py` 是否有相同的 `generate()` 结构，若有则同步修改（base.py 已统一处理则跳过）

## 6. 多维评分公式替换

- [x] 6.1 在 `backend/memory/long_term.py` 中新增 `_compute_local_score(text: str, history_len: int, emotion: str) -> float` 函数，计算三个本地分量：
  - `history_fullness = min(history_len / promote_threshold, 1.0) * 0.3`
  - `sentiment_intensity`：惊讶/悲伤/愤怒 → 0.2，开心 → 0.1，平静 → 0.04
  - `content_filter`：文本含姓名/偏好/约定/日期等关键词 → 0.2，否则 → 0.0
- [x] 6.2 在 `maybe_add` 中实现三段式判断：
  - `local_score > 0.5` → 直接写入（跳过 LLM）
  - `local_score + 0.1 <= 0.5` → 跳过写入
  - `0.4 < local_score <= 0.5` → 调用 `_score()`，`total = local_score + score/10 * 0.1`，`> 0.5` 时写入
- [x] 6.3 将写入阈值从 `score >= 7` 改为 `total > 0.5`，在注释中说明新公式含义

## 7. 注入历史机制

- [x] 7.1 在 `backend/pipeline/llm/base.py` 的消息构建逻辑中，在 system prompt 之后、`recent_history` 之前，插入 `self.character.injected_history` 转换后的消息列表
- [x] 7.2 在 `character/config.yaml` 中添加 `injected_history` 示例配置（2 条示范对话），注释说明偶数条、user/assistant 交替顺序要求

## 8. 验证与测试

- [x] 8.1 启动 bot，在 `config.yaml` 中只配置主 LLM key（不配置 memory.scoring），发送 10+ 条消息，确认日志中出现评分或本地分量通过且有内容写入 ChromaDB
- [x] 8.2 发送"请记住我叫XXX"，确认日志出现 `[记忆] 写入长期记忆` 且 ChromaDB 中有对应文档
- [x] 8.3 验证 `memory.promote_threshold: 5` 配置下，发送 6 条消息后触发评分流程
- [x] 8.4 配置 `injected_history` 两条示范对话，启动后发送消息，确认 LLM 请求 messages 数组中包含注入的示范对话
- [x] 8.5 手动检查 ChromaDB 文件（`./data/chroma`）中确实有文档被写入

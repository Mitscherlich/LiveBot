## 1. 配置层扩展

- [ ] 1.1 在 `backend/config.py` 的 `MemoryConfig` 中新增 `promote_threshold: int = 10` 字段
- [ ] 1.2 验证现有 `config.yaml` 不填此字段时加载默认值 10（向后兼容测试）

## 2. 修复 LongTermMemory._score 方法

- [ ] 2.1 在 `backend/memory/long_term.py` 的 `_score` 方法中，当 `scoring.api_key` 为空字符串时，回退使用 `get_config().llm.api_key` 和 `get_config().llm.base_url`
- [ ] 2.2 将 `_score` 的 messages 改为 system + user 两条：system 约束"只输出一个0到10的整数"，user 提供对话内容和打分维度（个人信息/偏好、重要事件、明确记忆请求）
- [ ] 2.3 增强错误日志：异常时输出 `type(e).__name__` 和 `api_key_empty=True/False`
- [ ] 2.4 验证数字解析逻辑：确认 LLM 返回 "10" 时 `[:2]` 正确解析为 10，返回 "7分" 时提取为 7

## 3. 修复 LongTermMemory.maybe_add 强制写入

- [ ] 3.1 在 `maybe_add` 方法签名中增加 `force: bool = False` 参数
- [ ] 3.2 当 `force=True` 时跳过 `_score` 调用，直接进行 embedding + 写入 ChromaDB
- [ ] 3.3 `force=True` 路径写入完成后，同样调用 `short_term.mark_promoted(ids)`

## 4. 修复 ShortTermMemory.maybe_promote 触发阈值

- [ ] 4.1 修改 `backend/memory/short_term.py` 的 `maybe_promote` 方法，接受 `threshold: int = 10` 参数（或从 config 读取）
- [ ] 4.2 将触发条件从 `total <= 50` 改为 `total <= threshold`
- [ ] 4.3 更新 `LLMPipeline` 中调用 `maybe_promote` 的代码，传入 `get_config().memory.promote_threshold`

## 5. LLM Pipeline 关键词检测

- [ ] 5.1 在 `backend/pipeline/llm/openai_llm.py` 的 `generate()` finally 块中，在 `memory_short.add()` 之后，检测用户输入是否含关键词：`"请记住"、"帮我记住"、"记一下"、"记住这个"`
- [ ] 5.2 若匹配，获取刚写入短期记忆的两条记录的 id，调用 `memory_long.maybe_add(text, ids, memory_short, force=True)`
- [ ] 5.3 检查 `backend/pipeline/llm/anthropic_llm.py` 是否有相同的 `generate()` 结构，若有则同步修改

## 6. 验证与测试

- [ ] 6.1 启动 bot，在 `config.yaml` 中只配置主 LLM key（不配置 memory.scoring），发送 10+ 条消息，确认日志中出现评分调用且分数非 0
- [ ] 6.2 发送"请记住我叫XXX"，确认日志出现 `[记忆] 写入长期记忆` 且 ChromaDB 中有对应文档
- [ ] 6.3 验证 `memory.promote_threshold: 5` 配置下，发送 6 条消息后触发评分流程
- [ ] 6.4 手动检查 ChromaDB 文件（`./data/chroma`）中确实有文档被写入

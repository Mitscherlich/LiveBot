## Context

LiveBot 的长期记忆系统通过 LLM 对每段对话打重要性分（0-10），达到阈值（≥7）才写入 ChromaDB 向量库，以供后续对话检索。当前系统完全失效，所有评分均为 0。

**当前代码路径：**

```
用户输入 → LLMPipeline.generate()
  → memory_short.add(user/assistant)
  → memory_short.maybe_promote(memory_long)   # total > 50 才触发
    → long_term.maybe_add(text, ids, short_term)
      → long_term._score(text)                 # OpenAI API 调用，失败返回 0
        → if score >= 7: 写入 ChromaDB
```

**已确认的 Bug：**

1. **根本原因 — API Key 缺失**：`MemoryScoringConfig` 的 `api_key` 默认为 `""`，当 `config.yaml` 未配置 `memory.scoring` 块时，`AsyncOpenAI(api_key="")` 调用会抛出认证异常，被 `except Exception` 捕获后静默返回 0。没有任何报警。

2. **触发阈值过高**：`maybe_promote` 仅在 `total > 50` 时触发。对于正常使用的直播机器人，短对话永远不会积累到 50 轮，长期记忆永远不会被写入。

3. **Prompt 不够严格**：当前 prompt 要求 LLM "仅返回0-10的整数"，但没有 system role 约束，模型可能返回 "7分" 或 "重要性：8" 等格式，导致数字提取到非预期字符后返回错误值。

4. **强制记忆路径缺失**：用户明确说"请记住我叫XXX"时，没有机制绕过 50 轮阈值直接触发记忆写入。

## Goals / Non-Goals

**Goals:**

- 修复 `_score` 方法，在 scoring.api_key 为空时自动回退到主 LLM 的配置
- 优化评分 prompt，使用 system role 严格约束输出格式，并增加打分维度说明
- 将 `maybe_promote` 触发阈值改为配置项（`promote_threshold`），默认值降为 10
- 在 LLM pipeline 层识别明确记忆关键词，触发强制写入路径
- 增强错误日志，确保评分失败时输出可诊断的信息

**Non-Goals:**

- 不改变 ChromaDB 向量库的存储结构或 embedding 方案
- 不修改评分阈值（仍为 ≥7），仅修复无法到达该阈值的 bug
- 不引入新的外部依赖

## Decisions

### 决策 1：api_key 回退策略

**决策**：在 `_score` 方法中，当 `scoring.api_key` 为空字符串时，使用主 LLM (`get_config().llm`) 的 `api_key` 和 `base_url` 作为回退。

**理由**：用户最常见的配置是只填主 LLM 的 key，scoring 单独配置属于高级用法。回退到主 LLM 可以让系统在未完整配置时也能正常工作，而不是静默失败。

**备选方案**：启动时检测 scoring.api_key 为空则 warn 并禁用长期记忆。弃用原因：会让已有用户的功能退化，且修复成本更高。

### 决策 2：prompt 优化方式

**决策**：将 user prompt 改为 system + user 两步，system 严格约束"只输出一个0到10的整数"，user 提供对话内容和打分维度。

**理由**：system role 对主流模型（GPT、DeepSeek）的格式约束效果显著优于 user prompt 中的指令。增加打分维度（个人信息/偏好/重要事件/明确记忆请求）可减少评分随机性。

**备选方案**：在解析层增加更宽松的正则，容忍非纯数字输出。弃用原因：治标不治本，解析层鲁棒性与 prompt 优化不互斥，两者都做。

### 决策 3：触发阈值配置化

**决策**：在 `MemoryConfig` 中新增 `promote_threshold: int = 10`，`maybe_promote` 改为 `if total > self_config.promote_threshold`（通过参数传入或从 config 读取）。

**理由**：10 轮是一个合理的默认值，适合日常使用；保持可配置让部署者根据实际场景调整。

**备选方案**：固定改为 10。弃用原因：不同场景需求不同，硬编码不够灵活。

### 决策 4：强制写入关键词识别位置

**决策**：在 `LLMPipeline.generate()` 的 `finally` 块中，保存对话到短期记忆之后，检测用户输入是否包含明确记忆关键词（"请记住"、"帮我记住"、"记一下"），若匹配则跳过 `maybe_promote` 直接调用 `long_term.maybe_add` 并传入强制写入标志（`force=True`）。

**理由**：LLM pipeline 是唯一能同时访问用户原始文本和 memory 模块的位置，改动最小，无需新增事件总线消息类型。

## Risks / Trade-offs

- **[风险] 回退到主 LLM key 可能产生额外 token 费用** → 缓解：评分调用 `max_tokens=5`，成本极低；用户也可通过正确配置 scoring 块来使用更便宜的模型
- **[风险] 降低阈值（50→10）会增加评分调用频率** → 缓解：每次 promote 只处理 2 条对话，调用开销可接受；超过 10 轮的对话通常已有足够内容值得评估
- **[权衡] 关键词匹配强制写入可能产生误触发** → 可接受：误触发只是多写入一条记忆，不影响系统正确性

## Migration Plan

1. 修改 `backend/config.py`：`MemoryConfig` 新增 `promote_threshold: int = 10`
2. 修改 `backend/memory/long_term.py`：`_score` 方法增加 api_key 回退；优化 prompt；增强日志；`maybe_add` 支持 `force=True` 参数绕过评分
3. 修改 `backend/memory/short_term.py`：`maybe_promote` 接受 `threshold` 参数
4. 修改 `backend/pipeline/llm/openai_llm.py`：`generate()` 中添加关键词检测逻辑
5. 现有已部署实例无需迁移数据，配置向后兼容（`promote_threshold` 有默认值）

**回滚**：任一文件修改均可独立回滚，无数据库结构变更。

## Open Questions

- 是否需要同步修复 `anthropic_llm.py`（若存在类似结构）？当前发现目录中有该文件，需确认是否也调用了 `maybe_promote`。
- 强制写入时的评分是否应记录为固定值（如 10）以便后续统计？

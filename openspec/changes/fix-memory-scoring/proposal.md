## Why

长期记忆系统完全失效：每条对话的 LLM 重要性评分均返回 0，导致没有任何内容写入 ChromaDB 向量库。根本原因是 `memory.scoring` 的 `api_key` 默认为空字符串，OpenAI 客户端调用必然抛出认证异常，异常被静默捕获并返回 0，同时 prompt 设计不够精确导致模型输出格式不稳定。此外 `maybe_promote` 的触发阈值（> 50 轮）对于短对话场景永远不满足。

## What Changes

- **修复 `_score` 方法**：当 `scoring.api_key` 为空时，回退使用主对话 LLM 的 `api_key` 和 `base_url`，避免因配置缺失导致静默失败
- **优化评分 Prompt**：添加 system role 约束 LLM 只输出纯数字，减少解析失败概率；prompt 中补充打分维度（个人信息、偏好、重要事件、明确记忆请求）
- **修复数字解析**：`int(... or "0")` 在空字符串时正常工作，但需确保提取逻辑正确处理 LLM 返回 "10" 的边界情况（当前 `[:2]` 已能处理）
- **增强错误日志**：评分失败时记录具体异常类型和 `api_key` 是否为空，方便排查
- **降低 `maybe_promote` 触发阈值**：将触发条件从 `> 50` 改为可配置项（默认 `>= 10`），让短对话也能触发长期记忆写入
- **新增 `force_score` 路径**：识别用户明确要求记住（"请记住"、"帮我记一下"）的内容，绕过阈值直接写入长期记忆

## Capabilities

### New Capabilities

- `memory-scoring-fix`: 修复 LLM 评分流程，包括配置回退、prompt 优化、错误处理增强和解析健壮化
- `memory-promote-trigger`: 可配置的 promote 触发策略，支持按轮数触发和关键词强制写入

### Modified Capabilities

<!-- 无已有 spec，跳过 -->

## Impact

- `backend/memory/long_term.py`：`_score` 方法（配置回退、prompt 优化、错误日志）
- `backend/memory/short_term.py`：`maybe_promote` 方法（阈值改为可配置）
- `backend/config.py`：`MemoryConfig` 新增 `promote_threshold` 字段
- `backend/pipeline/llm.py`（如存在）：识别用户明确记忆请求关键词，调用 `force_add`
- 无 API / 外部接口变更，无破坏性改动

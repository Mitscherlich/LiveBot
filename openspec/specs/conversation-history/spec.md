# Capability: conversation-history

## Purpose

管理 LLM 对话历史，支持可配置的重置策略，确保对话上下文在合理范围内维护。（TBD: 详细 Purpose 待后续独立变更补充）

## Requirements

### Requirement: 可配置的历史重置策略 [DEFERRED]
`LLMPromptManager` SHALL 支持注入 `HistoryResetPolicy` 策略对象，在每次追加消息后检查是否需要重置对话历史。

#### Scenario: 按轮数重置策略
- **WHEN** 使用 `TurnBasedReset(max_turns=20)`，对话历史达到 20 轮
- **THEN** `should_reset()` 返回 `True`，历史重置为初始状态

#### Scenario: 按 token 数重置策略
- **WHEN** 使用 `TokenBasedReset(max_tokens=4096)`，累计 token 数超过阈值
- **THEN** `should_reset()` 返回 `True`，触发历史重置

### Requirement: 历史追加与查询接口 [DEFERRED]
`LLMPromptManager` SHALL 提供 `append()`、`get_history()`、`reset()` 三个核心接口。

#### Scenario: 追加消息自动触发策略检查
- **WHEN** 调用 `append(message)`
- **THEN** 消息追加到历史末尾，自动触发重置策略检查

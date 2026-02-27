# Memory System

## Purpose

Memory System 已随 `integrate-openclaw-llm` 变更被整体移除。对话历史和长期记忆能力已委托给 OpenClaw Gateway 管理：
- 对话历史：由 OpenClaw 按 `session_key` 自动维护
- 长期语义记忆：由 OpenClaw 的 `@openclaw/memory-lancedb` 扩展处理

## Requirements


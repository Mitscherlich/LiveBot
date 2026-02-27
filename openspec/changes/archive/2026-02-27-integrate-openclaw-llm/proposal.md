## Why

Livebot 自行实现的 Agent 调度、记忆管理（SQLite + ChromaDB）和工具调用系统维护成本高、能力偏弱；OpenClaw 已将这些能力封装为稳定的网关服务，并暴露 OpenAI 兼容 HTTP 接口（`POST /v1/chat/completions`，Bearer token 认证，支持 SSE 流式输出）。本次变更将 Livebot 的 LLM 层替换为 OpenClaw 客户端，让 Livebot 专注于 VTuber 核心管道：ASR / TTS / Live2D。

## What Changes

- 新增 `pipeline/llm/openclaw_llm.py`：通过 HTTP SSE 调用 OpenClaw Gateway，替代现有 OpenAI/Anthropic LLM Pipeline
- 移除 `pipeline/llm/openai_llm.py` 和 `pipeline/llm/anthropic_llm.py`（及对应 SDK 依赖）
- **BREAKING** 移除 `memory/` 目录（short_term.py、long_term.py、embedder.py）
- **BREAKING** 移除 `tools/` 目录（registry.py、file_tool.py、web_tool.py）
- **BREAKING** 移除 `skills/` 目录（由 OpenClaw 60+ 技能取代）
- 更新 `config.py`：移除 MemoryConfig / ToolsConfig，新增 OpenClawConfig（url、token、session_key、agent_id）
- 更新 `core/bot.py`：移除记忆、工具、embedder 的初始化与事件处理逻辑
- **BREAKING** 下线 `/api/memory/*` REST 端点及 MemoryDebug 前端页面
- 精简 `requirements.txt`：移除 chromadb、sentence-transformers、aiosqlite、anthropic 等重型依赖
- OpenClaw Gateway 成为运行时外部依赖（默认 `http://localhost:18789`）

## Capabilities

### New Capabilities

- `openclaw-llm-pipeline`：通过 OpenClaw Gateway HTTP API（`/v1/chat/completions`）发送用户消息，以 SSE 流式接收 Agent 回复，解析情感 JSON 并按句子边界分割后发送到事件总线，完整替代现有 LLM Pipeline 的对外行为

### Modified Capabilities

- `llm-pipeline`：行为层变更——不再在 Livebot 侧维护对话历史、记忆检索和工具调用，全部委托给 OpenClaw；输入/输出事件格式（ASR_RESULT → LLM_SENTENCE / LLM_DONE）保持不变
- `memory-system`：**BREAKING** 规格废止——短期/长期记忆的存储、检索、提升逻辑完全移除，由 OpenClaw 内置记忆系统接管，不再对外暴露 API

## Impact

- **后端**：`backend/pipeline/llm/`、`backend/memory/`、`backend/tools/`、`backend/skills/`、`backend/config.py`、`backend/core/bot.py`、`backend/api/memory_api.py`
- **前端**：`frontend/src/pages/MemoryDebug.tsx` 及相关路由下线
- **依赖**：移除约 6 个重型 Python 包（chromadb、sentence-transformers、aiosqlite、anthropic、funasr 可选保留）；新增运行时依赖 OpenClaw Gateway（Node.js 22 进程）
- **配置**：`config.yaml` 结构变化，`memory` / `tools` 节点移除，新增 `openclaw` 节点

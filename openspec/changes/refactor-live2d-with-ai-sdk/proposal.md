## Why

现有消息模块通过 WebSocket `llm_sentence` 事件逐句推送文本，无法实现真正的 token 级 SSE Streaming，导致对话气泡出现跳跃感而非流畅打字效果；同时消息气泡样式过于简陋，缺乏现代感和视觉层次，严重影响直播互动体验。

## What Changes

- **废弃** 现有基于 WebSocket 事件的逐句消息分发机制（`llm_sentence` / `llm_done`）
- **引入** [ai-sdk](https://elements.ai-sdk.dev/docs) 接管前端消息流处理，支持真正的 token 级 SSE Streaming 渲染
- **重写** 消息气泡组件，支持文本消息和语音消息两种形态，统一视觉风格
- **重构** Live2DView 消息区域，从 641 行巨型组件中分离消息逻辑为独立模块
- 语音消息（ASR 结果）展示样式同步升级，与文本消息保持视觉一致性
- 保留 WebSocket 用于非消息事件（`subtitle`、`lip_sync`、`asr_result`、`playback_done`）

## Capabilities

### New Capabilities

- `agent-response-rendering`: 基于 ai-sdk 的 Agent 响应渲染能力——token 级 SSE 流式展示、Markdown 渲染、打字机动画、消息气泡现代化样式（文本/语音两种形态）

### Modified Capabilities

- `live2d-message-stream`: **废弃**逐句 WebSocket 推送，改为 ai-sdk SSE Streaming；消息分发接口从 `llm_sentence`/`llm_done` 迁移至 HTTP SSE 端点

## Impact

**前端文件**：
- `frontend/src/pages/Live2DView.tsx` — 消息逻辑拆分，移除 `llm_sentence`/`llm_done` 处理
- `frontend/src/components/ChatMessage.tsx` — 完全重写
- `frontend/src/components/StreamMessage.tsx` — 替换为 ai-sdk 渲染方案
- `frontend/src/hooks/useStreamdown.ts` — 替换为 ai-sdk hook
- `frontend/src/types/streamdown.ts` — 废弃，改用 ai-sdk 类型

**新增文件**：
- `frontend/src/components/MessageBubble.tsx` — 统一消息气泡组件（文本/语音）
- `frontend/src/hooks/useAgentStream.ts` — ai-sdk SSE 流式 hook

**后端文件**：
- `backend/main.py` 或新增路由 — 新增 SSE streaming 端点（`GET /api/chat/stream`）供 ai-sdk 消费

**依赖变更**：
- 新增：`ai`（Vercel AI SDK core）、`@ai-sdk/react`（或对应 ai-sdk 包）
- 废弃：`streamdown`、`@streamdown/code`

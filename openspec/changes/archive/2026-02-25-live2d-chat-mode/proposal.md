## Why

Live2D 页面目前只支持语音输入（麦克风 → ASR）与角色对话，在麦克风不可用或不方便说话的场景下无法交互。添加文本 Chat 模式，让用户可以直接在消息窗口输入文字发送消息，触发完整的 LLM → TTS → 口型同步流程。

## What Changes

- 在 Live2DView 消息窗口底部新增**输入栏**（文本框 + 发送按钮）
- 新增**模式切换**：Voice 模式（当前行为）↔ Chat 模式（文字输入）
- Chat 模式下，用户发送的文本绕过 ASR，直接进入 LLM 处理流程
- 后端新增 HTTP POST 接口 `/api/chat/send`，接收文本消息并触发 LLM → TTS 管道
- 前端将发送的文本作为用户消息立即显示在消息列表（右对齐气泡）

## Capabilities

### New Capabilities

- `live2d-chat-input`: Live2D 页面文本消息输入能力——前端输入栏 UI、模式切换逻辑、WebSocket/HTTP 消息发送，以及后端接收文本并驱动 LLM → TTS 管道的接口

### Modified Capabilities

（无需修改现有 spec 的行为契约）

## Impact

- **前端**：`frontend/src/pages/Live2DView.tsx`（主改动）、可能提取新组件 `ChatInputBar.tsx`
- **类型定义**：`frontend/src/types/live2d.d.ts`（新增 `chat_message` WebSocket 消息类型或 HTTP 请求类型）
- **后端**：新增 `backend/api/chat_api.py`（或在现有路由中增加端点），复用 `backend/pipeline/llm/` 和 `backend/pipeline/tts/` 管道
- **无破坏性变更**：Voice 模式行为保持不变

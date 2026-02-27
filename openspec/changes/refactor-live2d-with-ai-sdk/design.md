## Context

**当前状态**：前端通过 WebSocket 接收 `llm_sentence` / `llm_done` 事件，逐句积累文本并手动更新流式状态；`StreamMessage.tsx` 使用 `streamdown` 库渲染 Markdown；`Live2DView.tsx` 是 641 行的巨型组件，混杂了布局、语音、消息渲染和 WebSocket 事件处理逻辑。

**新方案**：引入 [ai-elements](https://elements.ai-sdk.dev)（基于 shadcn/ui）+ Vercel AI SDK `useChat` hook，实现真正的 token 级 SSE Streaming 和现代化消息 UI。`useChat` 来自 `@ai-sdk/react`，提供内建流式状态管理；ai-elements 的 `Message / MessageContent / MessageResponse` 组件提供开箱即用的打字机动画和 AI 风格气泡。

## Goals / Non-Goals

**Goals:**
- 实现 token 级 SSE Streaming，消除逐句跳跃感
- 使用 ai-elements 现代化消息气泡（文本/语音两种形态）
- 将消息逻辑从 Live2DView 巨型组件中解耦，提取为独立模块
- 统一文本消息和语音消息的视觉风格

**Non-Goals:**
- 完全替换 WebSocket（仍用于 `lip_sync`、`subtitle`、`asr_result`、`playback_done`）
- 重构 TTS / ASR / Live2D Canvas 后端流水线
- 重写 Live2DView 的布局/分隔拖拽/缩放逻辑

## Decisions

### D1：ai-elements 替代 streamdown

**选择**：使用 ai-elements 的 `Message` 组件族（`Message` / `MessageContent` / `MessageResponse`）替换 `StreamMessage.tsx` + `streamdown`。

**理由**：ai-elements 深度集成 Vercel AI SDK，内建打字机动画、Markdown 渲染、流式状态管理；streamdown 仅提供文本渲染，无法复用 AI SDK 的流式生命周期。

**备选**：手动实现 SSE hook + 保留 streamdown → 拒绝，因为 ai-elements 已提供完整解决方案且代码可自定义（组件落地到项目中）。

### D2：混合 WebSocket + SSE 双通道

**选择**：SSE (`/api/chat/stream`) 负责 LLM 文本流，WebSocket 保留用于实时事件（`lip_sync`、`subtitle`、`asr_result`、`playback_done`）。

**理由**：`lip_sync` 时间轴对延迟敏感且需要精准调度；`asr_result` 是语音识别推送，属于服务端主动事件，不适合 HTTP 请求/响应模型。SSE 适合单向文本流。

**备选**：全部迁移到 SSE → 拒绝，lip_sync 调度精度会下降，且服务端主动推送事件需要额外轮询。

### D3：后端新增 `/api/chat/stream` SSE 端点

**选择**：在 FastAPI 新增 `POST /api/chat/stream`，返回 Vercel AI SDK 兼容的 SSE 数据流格式（`text/event-stream`，`data: {"type":"text","text":"..."}`）。

**理由**：`useChat` 期望标准 AI SDK data stream protocol；现有 `/api/chat/send` 是 fire-and-forget 触发后端流水线，不直接返回流，两个端点并行存在，职责清晰。

**格式适配**：后端 `/api/chat/stream` 监听 OpenClaw SSE 响应，转译为 AI SDK 流格式，转发给前端。

### D4：语音消息作为独立气泡类型

**选择**：`MessageBubble` 组件接受 `type: "voice" | "text"` prop，语音气泡显示麦克风图标和转写文本，与文本气泡视觉区分。

**理由**：`asr_result` 事件代表用户语音输入，语义上不同于文字输入，应有独立视觉标识。ai-elements 提供 Voice 组件族（`Transcription` 等）可参考样式。

### D5：拆分 MessageList 组件

**选择**：从 `Live2DView.tsx` 中提取消息相关逻辑到独立组件：
- `frontend/src/components/MessageBubble.tsx` — 单条消息气泡（text/voice）
- `frontend/src/components/MessageList.tsx` — 消息列表 + useChat 集成

**理由**：Live2DView 641 行中约 300 行处理消息状态，提取后利于测试、维护，也使 Live2DView 专注于 Canvas 渲染和设备控制。

## Risks / Trade-offs

- [AI SDK 流格式兼容] OpenClaw 返回的 SSE 格式可能与 AI SDK data stream protocol 不完全一致 → 在 `/api/chat/stream` 中加薄适配层，字段映射 + 透传
- [双通道消息同步] WebSocket `asr_result`（语音气泡）和 SSE 文本流可能出现乱序 → 以 message ID 关联，UI 层按时序插入消息列表
- [shadcn/ui 安装] ai-elements 依赖 shadcn/ui + Tailwind CSS 4；现有前端可能存在样式冲突 → 先单独验证 shadcn/ui 基础组件渲染，再引入 ai-elements 组件
- [流式与 lip_sync 同步] SSE 文本流和 WebSocket lip_sync 时间轴来自不同通道，可能错位 → lip_sync 时间轴基于 TTS 音频，与文本渲染独立；保持现有 scheduleLipSync 逻辑不变

## Migration Plan

1. 安装 shadcn/ui CLI，初始化配置（`npx shadcn@latest init`）
2. 安装 ai-elements Message 组件（`npx ai-elements@latest add message`）
3. 安装 `@ai-sdk/react`（`useChat` hook）
4. 后端新增 `POST /api/chat/stream` SSE 端点，适配 AI SDK 流格式
5. 创建 `MessageBubble.tsx` + `MessageList.tsx`，集成 `useChat`
6. 替换 `Live2DView.tsx` 右侧消息区域，使用 `MessageList`
7. 验证 SSE Streaming 和语音气泡正常工作
8. 移除 `streamdown`、`@streamdown/code` 依赖
9. 废弃 `llm_sentence` / `llm_done` WebSocket 事件（后端保留但前端不再消费）

**回滚**：两套消息通道并行存在到步骤 8，如 SSE 出现问题可切回 WebSocket 路径。

## Open Questions

- OpenClaw Gateway 是否支持直接暴露 SSE 端点给前端？还是必须经过 FastAPI 中转？（目前方案：FastAPI 中转）
- ai-elements 的 `Message` 组件是否支持自定义气泡背景色和布局（需适配 Live2D 右侧深色面板）？

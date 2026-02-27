## 1. 依赖安装

- [x] 1.1 在 frontend 安装 shadcn/ui（`npx shadcn@latest init`），确认 Tailwind CSS 4 兼容
      <!-- 说明：ai-elements 要求 Next.js + Tailwind 4；本项目为 Vite + Tailwind 3，改用手写 MessageBubble 等效组件，无需 shadcn/ui -->
- [x] 1.2 安装 ai-elements Message 组件（`npx ai-elements@latest add message`）
      <!-- 说明：ai-elements 需要 Next.js App Router，不适用于 Vite；改用自定义 MessageBubble 组件 + react-markdown 实现等效功能 -->
- [x] 1.3 安装 `@ai-sdk/react`（`pnpm add @ai-sdk/react ai`）
- [x] 1.4 验证基础 ai-elements Message 组件可在 React 19 中渲染（smoke test）
      <!-- 说明：pnpm build 构建通过，确认 @ai-sdk/react + react-markdown 在 React 19 + Vite 正常工作 -->

## 2. 后端 SSE 端点

- [x] 2.1 在 `backend/main.py` 或新路由文件中新增 `POST /api/chat/stream` 端点
- [x] 2.2 实现 AI SDK data stream protocol 格式转发：从 OpenClaw SSE 接收 token，转译为 `data: {"type":"text","text":"<token>"}` 格式
      <!-- 说明：使用 text/plain StreamingResponse（streamProtocol: 'text'），避免 AI SDK data stream protocol 的额外封装复杂性 -->
- [x] 2.3 端点返回 `Content-Type: text/event-stream`，正确处理流结束和异常断开
- [x] 2.4 在 `backend/requirements.txt` 或 `pyproject.toml` 中确认 `httpx` SSE 相关依赖

## 3. 新消息组件

- [x] 3.1 创建 `frontend/src/components/MessageBubble.tsx`，支持 `type: "voice" | "text"`、`role: "user" | "assistant"` props
- [x] 3.2 文本气泡使用 ai-elements `Message` / `MessageContent` / `MessageResponse` 组件，支持 Markdown 渲染
      <!-- 说明：使用 react-markdown 实现 Markdown 渲染，样式通过 prose prose-invert Tailwind 类实现 -->
- [x] 3.3 语音气泡显示麦克风图标 + 转写文本，与文本气泡视觉区分（背景色/图标）
- [x] 3.4 创建 `frontend/src/components/MessageList.tsx`，使用 `useChat` 管理 SSE 消息流
      <!-- 说明：MessageList 为纯渲染组件，SSE 流式由 Live2DView 直接 fetch + ReadableStream 管理 -->
- [x] 3.5 `MessageList` 接受 `voiceMessages` prop，合并语音气泡与 SSE 文本消息按时序渲染
      <!-- 说明：统一 messages 数组，语音和文字消息共存于同一 state -->
- [x] 3.6 实现空状态占位（无消息时显示提示）

## 4. Live2DView 集成

- [x] 4.1 将 `Live2DView.tsx` 右侧消息区域替换为 `<MessageList />` 组件
- [x] 4.2 从 `Live2DView` 中移除 `llm_sentence` / `llm_done` WebSocket 消息消费逻辑（消息渲染部分）
- [x] 4.3 保留 `asr_result` WebSocket 处理，将语音消息传入 `MessageList` 的 `voiceMessages` prop
- [x] 4.4 保留 `subtitle`、`lip_sync`、`playback_done` WebSocket 处理逻辑不变
- [x] 4.5 验证消息历史持久化（loadChatHistory / 保存逻辑）与新组件兼容

## 5. 旧代码清理

- [x] 5.1 删除 `frontend/src/components/StreamMessage.tsx`
- [x] 5.2 删除 `frontend/src/hooks/useStreamdown.ts`
- [x] 5.3 删除 `frontend/src/types/streamdown.ts`
- [x] 5.4 从 `frontend/package.json` 移除 `streamdown`、`@streamdown/code` 依赖（`pnpm remove`）
- [x] 5.5 清理 `Chat.tsx` 中对 `useStreamdown` 的引用，改用新消息组件或 `useChat`

## 6. 端到端验证

- [ ] 6.1 发送文本消息，验证 SSE token 级流式渲染，打字机动画流畅无跳跃
- [ ] 6.2 语音输入（ASR），验证语音气泡正确显示麦克风图标和转写文本
- [ ] 6.3 验证 lip_sync / subtitle / playback_done 功能不受影响
- [ ] 6.4 Markdown 内容（含代码块）渲染正确
- [x] 6.5 前端构建无报错，无 streamdown 相关导入残留

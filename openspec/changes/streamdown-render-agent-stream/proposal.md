## Why

当前 Livebot 前端使用纯文本方式显示 Agent 返回的消息，无法渲染 Markdown 格式（如代码块、列表、表格等），影响可读性和用户体验。同时，消息以整块形式出现，缺乏流式打字效果。本次变更将引入 Streamdown 库，实现 Agent 流式消息的 Markdown 实时渲染。

## What Changes

- 新增 `frontend/src/components/StreamMessage.tsx`：基于 streamdown 的流式 Markdown 渲染组件
- 修改 `frontend/src/components/ChatMessage.tsx`：集成 StreamMessage 组件，替换纯文本渲染
- 新增 `frontend/src/hooks/useStreamdown.ts`：封装 streamdown 的 React Hook，处理 SSE 流式数据
- 更新 `frontend/src/styles/streamdown.css`：自定义 Markdown 渲染样式（代码高亮、表格、引用块等）
- 更新 `frontend/package.json`：添加 streamdown 依赖
- 修改 `frontend/src/pages/Chat.tsx`：适配流式消息的状态管理

## Capabilities

### New Capabilities

- `streamdown-render`：使用 streamdown 库实时渲染 Agent 返回的 Markdown 流式消息，支持代码块语法高亮、表格、列表、引用等 Markdown 特性

### Modified Capabilities

- `chat-message-display`：从纯文本渲染改为 Markdown 流式渲染，保持消息气泡容器样式不变

## Impact

- **前端**：新增组件和 Hook，修改 Chat 页面和消息组件
- **依赖**：新增 `streamdown` npm 包
- **样式**：新增 Markdown 渲染相关的 CSS 样式
- **用户体验**：消息以流式方式逐字出现，Markdown 格式实时渲染

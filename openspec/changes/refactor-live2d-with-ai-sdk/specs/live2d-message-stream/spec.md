## REMOVED Requirements

### Requirement: WebSocket 逐句文本推送
**Reason**: 被 HTTP SSE Streaming 取代。`llm_sentence` / `llm_done` 事件逐句推送文本，导致对话气泡出现跳跃感而非流畅打字效果，且无法利用 ai-sdk 的流式状态管理能力。
**Migration**: 前端改用 `@ai-sdk/react` 的 `useChat` hook 消费 `POST /api/chat/stream` SSE 端点；后端保留 `llm_sentence` / `llm_done` 事件用于 TTS 触发，但前端不再监听这两个事件用于消息渲染。

#### Scenario: llm_sentence 事件触发消息追加（已移除）
- **WHEN** WebSocket 收到 `llm_sentence` 事件
- **THEN** ~~前端将文本追加到当前流式气泡~~ → 此行为由 SSE `useChat` 替代

#### Scenario: llm_done 事件标记完成（已移除）
- **WHEN** WebSocket 收到 `llm_done` 事件
- **THEN** ~~前端将 streaming 标志置为 false~~ → 此行为由 SSE 流关闭事件替代

---

### Requirement: streamdown 流式渲染组件
**Reason**: 被 ai-elements `Message` / `MessageResponse` 组件替代，后者与 AI SDK 深度集成，提供更好的流式动画和 Markdown 渲染。
**Migration**: 删除 `frontend/src/components/StreamMessage.tsx`、`frontend/src/hooks/useStreamdown.ts`、`frontend/src/types/streamdown.ts`，改用 ai-elements Message 组件族。

#### Scenario: Streamdown 渲染 Markdown（已移除）
- **WHEN** assistant 消息包含 Markdown
- **THEN** ~~Streamdown 渲染格式化内容~~ → 由 ai-elements `MessageResponse` 替代

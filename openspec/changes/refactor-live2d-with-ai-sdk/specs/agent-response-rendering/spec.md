## ADDED Requirements

### Requirement: Token 级 SSE Streaming
系统 SHALL 通过 HTTP SSE 端点 `POST /api/chat/stream` 以 token 级粒度流式返回 LLM 响应，遵循 Vercel AI SDK data stream protocol 格式。

#### Scenario: 用户发送消息触发 SSE 流
- **WHEN** 用户提交文本消息到 `/api/chat/stream`
- **THEN** 服务端返回 `Content-Type: text/event-stream`，逐 token 推送 `data: {"type":"text","text":"<token>"}` 事件

#### Scenario: 流式传输完成
- **WHEN** LLM 生成完毕
- **THEN** 服务端发送结束标志并关闭 SSE 连接，前端 `useChat` 将消息标记为 `complete`

#### Scenario: 流式传输中断
- **WHEN** 网络或后端异常导致 SSE 中断
- **THEN** 前端显示已收到的部分内容，不崩溃，并记录错误状态

---

### Requirement: ai-elements 消息渲染
系统 SHALL 使用 ai-elements 的 `Message` / `MessageContent` / `MessageResponse` 组件渲染 assistant 消息，支持 Markdown 格式化和打字机动画。

#### Scenario: Markdown 内容渲染
- **WHEN** assistant 消息包含 Markdown（粗体、代码块、列表等）
- **THEN** 消息气泡内正确渲染格式化后的 HTML，代码块高亮

#### Scenario: 流式打字机动画
- **WHEN** 消息处于 streaming 状态（`useChat` isLoading=true）
- **THEN** `MessageResponse` 组件启用逐字渲染动画，新 token 追加时平滑显示

#### Scenario: 消息完成态
- **WHEN** streaming 结束（`isLoading=false`）
- **THEN** 消息显示完整内容，打字机动画停止

---

### Requirement: 语音消息气泡
系统 SHALL 将 ASR 识别结果（`asr_result` WebSocket 事件）以独立语音气泡形式展示，视觉上与文本消息区分。

#### Scenario: 语音输入显示
- **WHEN** WebSocket 收到 `asr_result` 事件
- **THEN** 消息列表插入一条带麦克风图标的 user 语音气泡，内容为识别文本

#### Scenario: 语音与文本气泡共存
- **WHEN** 消息列表同时包含语音输入（asr）和文字输入
- **THEN** 两种气泡样式独立渲染，视觉可区分（图标/背景色不同）

---

### Requirement: MessageList 组件解耦
系统 SHALL 将消息列表渲染逻辑封装为独立的 `MessageList` 组件，不依赖 `Live2DView` 内部状态。

#### Scenario: 消息列表独立渲染
- **WHEN** `MessageList` 接收 `messages` prop（来自 `useChat`）和 `voiceMessages` prop（来自 WebSocket）
- **THEN** 按时间顺序合并渲染所有消息，不需要访问 Live2DView 内部 refs

#### Scenario: 空消息列表
- **WHEN** 会话刚开始，无消息记录
- **THEN** 显示空状态占位提示

---

### Requirement: 依赖替换
系统 SHALL 移除 `streamdown` 和 `@streamdown/code` 依赖，改用 ai-elements + Vercel AI SDK 实现等效功能。

#### Scenario: streamdown 完全移除
- **WHEN** 重构完成后执行 `pnpm remove streamdown @streamdown/code`
- **THEN** 构建成功，无 streamdown 相关导入，功能正常

# Live2D Chat Input

## Purpose

Live2D Chat Input 为 Live2D 页面提供文字聊天模式支持，包括前端 Voice/Chat 模式切换 UI、文本输入栏交互、用户消息即时显示，以及后端文本消息发送接口。

## Requirements

### Requirement: 文本消息发送接口
后端 SHALL 提供 `POST /api/chat/send` HTTP 接口，接收 JSON 请求体 `{"text": str}`，在触发打断后调用 LLM 生成流程，响应 `{"status": "ok"}`。当 `text` 为空字符串时，SHALL 返回 400 错误。

#### Scenario: 发送有效文本消息
- **WHEN** 客户端 POST `/api/chat/send` 并携带非空 `text` 字段
- **THEN** 服务端返回 HTTP 200 `{"status": "ok"}`，并触发 `INTERRUPT` 事件后调用 `bot.llm.generate(text)`

#### Scenario: 发送空文本
- **WHEN** 客户端 POST `/api/chat/send` 并携带空字符串 `text`
- **THEN** 服务端返回 HTTP 400 错误，不触发 LLM 流程

---

### Requirement: 模式切换 UI
Live2D 页面 SHALL 在消息窗口顶部提供 Voice / Chat 模式切换控件。模式选择 SHALL 持久化至 `localStorage`（key: `chatMode`），页面刷新后恢复上次选择。

#### Scenario: 默认模式
- **WHEN** 用户首次访问 Live2D 页面（无 localStorage 记录）
- **THEN** 默认激活 Voice 模式，Chat 输入栏不显示

#### Scenario: 切换至 Chat 模式
- **WHEN** 用户点击 Chat 模式按钮
- **THEN** 消息窗口底部显示文本输入栏和发送按钮，localStorage 写入 `chatMode=chat`

#### Scenario: 切换回 Voice 模式
- **WHEN** 用户点击 Voice 模式按钮
- **THEN** Chat 输入栏隐藏，localStorage 写入 `chatMode=voice`

#### Scenario: 刷新后恢复模式
- **WHEN** 用户刷新页面且 localStorage 中 `chatMode=chat`
- **THEN** 页面加载后直接显示 Chat 输入栏

---

### Requirement: Chat 输入栏交互
Chat 模式下，消息窗口底部 SHALL 展示文本输入框和发送按钮。用户 SHALL 可通过点击按钮或按 `Enter` 键发送消息。发送后输入框 SHALL 立即清空。输入框为空时，发送按钮 SHALL 禁用。

#### Scenario: 点击发送按钮
- **WHEN** Chat 输入框有内容且用户点击发送按钮
- **THEN** 消息即时显示在消息列表（右对齐气泡），输入框清空，调用 POST `/api/chat/send`

#### Scenario: 按 Enter 键发送
- **WHEN** Chat 输入框有内容且用户按下 Enter 键
- **THEN** 与点击发送按钮行为相同

#### Scenario: 输入框为空时禁用发送
- **WHEN** Chat 输入框内容为空字符串（含纯空白）
- **THEN** 发送按钮处于禁用状态，Enter 键不触发发送

#### Scenario: 接口调用失败时的提示
- **WHEN** POST `/api/chat/send` 返回非 2xx 状态码
- **THEN** 在消息列表中显示错误提示消息

---

### Requirement: 用户消息即时显示
前端 SHALL 在用户发送文本后，立即将该文本以用户消息气泡（右对齐）形式添加至消息列表，无需等待 LLM 响应。消息格式 SHALL 与 Voice 模式下 ASR 结果消息（`asr_result` 类型）保持视觉一致。

#### Scenario: 即时显示用户消息
- **WHEN** 用户发送文本消息
- **THEN** 消息列表立即新增一条右对齐用户气泡，内容为发送的文本，时间戳为发送时刻

#### Scenario: 消息列表自动滚动
- **WHEN** 新的用户消息或 AI 回复消息添加至列表
- **THEN** 消息列表自动滚动至底部

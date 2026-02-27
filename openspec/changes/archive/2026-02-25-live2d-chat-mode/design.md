## Context

Live2D 页面（`Live2DView.tsx`）当前只有 Voice 模式：语音 → ASR → `ASR_RESULT` 事件 → `bot.llm.generate()` → `LLM_SENTENCE` 事件 → TTS → WebSocket 广播回前端。整个管道由事件总线（`core/event_bus.py`）编排，后端仅暴露麦克风控制接口（`/api/asr/start`、`/api/asr/stop`）。

需要在不破坏现有 Voice 模式的前提下，添加文本输入的触发路径。

## Goals / Non-Goals

**Goals:**
- 前端消息窗口新增 Chat 输入栏（文本框 + 发送按钮）
- Voice / Chat 模式可切换（切换状态本地保存）
- 后端提供接收文本消息的 HTTP 接口，复用现有 LLM → TTS 管道
- 文字消息在前端消息列表即时显示（无需等待 LLM 响应）

**Non-Goals:**
- 不修改 ASR / TTS / LLM 管道内部逻辑
- 不支持多轮打字对话并发（与 Voice 模式共享同一个 LLM 队列）
- 不做 Chat 历史与 Voice 历史的分离存储

## Decisions

### 决策 1：后端接口使用 HTTP POST 而非 WebSocket 消息

**选择**：新增 `POST /api/chat/send` 接口，直接调用 `bot.llm.generate(text)`。

**原因**：
- 现有 WebSocket（`/ws/live2d`）是单向广播（服务端 → 客户端），`receive_text()` 仅用于保持连接/心跳，没有消息路由机制
- HTTP POST 符合现有 API 风格（`/api/asr/start` 等），易于错误处理和状态码返回
- LLM 响应仍经由 WebSocket 广播返回前端，无需改变下行通道

**备选方案**：复用 WebSocket 上行通道并在 `ws_live2d` 中路由 → 需要修改现有 WS 协议，破坏性更大。

### 决策 2：Chat 消息直接调用 `llm.generate()`，不经过 `ASR_RESULT` 事件

**选择**：`/api/chat/send` 端点获取 `bot` 实例后直接调用 `bot.llm.generate(text, user_emotion="neutral")`。

**原因**：
- `ASR_RESULT` 事件处理器（`bot.py:88-96`）做的事情就是调用 `llm.generate()`，直接复用更简洁
- 避免引入新的 `CHAT_MESSAGE` 事件类型，减少变更范围
- 打断逻辑（`bus.emit(Event.INTERRUPT)`）需要在接口中同样触发，与现有 ASR 处理器行为保持一致

### 决策 3：前端模式切换状态存储在 `localStorage`

**选择**：`localStorage.setItem('chatMode', 'voice' | 'chat')`，页面刷新后恢复上次选择。

**原因**：与现有分割线位置、缩放比例的本地存储策略一致（`Live2DView.tsx` 已有此模式）。

### 决策 4：Chat 输入栏内嵌在消息窗口底部，不新增路由

**选择**：在 `Live2DView.tsx` 右侧消息面板底部添加输入栏，提取为 `ChatInputBar.tsx` 组件。

**原因**：消息窗口已有完整的布局和滚动逻辑，输入栏与消息列表的视觉关联最自然，无需新页面。

## Risks / Trade-offs

- **并发风险**：Chat 模式与 Voice 模式（麦克风开着）可以同时触发 LLM，两者共享 TTS 队列。→ 缓解：文档说明，Chat 发送时若 Voice 已在播放则自动打断（与 Voice 模式自我打断行为一致）。
- **无响应反馈**：HTTP POST 返回后前端消息已显示，但 LLM 可能因网络/配置问题静默失败。→ 缓解：接口返回 4xx/5xx 时前端显示错误提示。
- **bot 实例访问**：接口需要访问 `bot` 单例。→ 使用现有 `main.py` 中的全局 `bot` 引用（与 `config_api.py` 的 `reload_config` 调用方式相同）。

## Migration Plan

纯新增，无迁移需求。后端新增一个路由文件，前端新增一个组件 + 修改 `Live2DView.tsx`。可随时回退（删除新增文件 + 还原 `Live2DView.tsx`）。

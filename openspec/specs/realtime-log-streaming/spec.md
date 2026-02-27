# Realtime Log Streaming

## Purpose

后端通过现有 `/ws/live2d` WebSocket 连接将 loguru 日志及关键 pipeline 事件（ASR、LLM）实时推送至前端 Dashboard，前端对日志进行分模块展示与过滤。

---

## Requirements

### Requirement: Backend broadcasts loguru logs via WebSocket
后端 SHALL 在 FastAPI 应用启动时注册一个 loguru sink，将 INFO 及以上级别的日志消息捕获并通过现有 `/ws/live2d` WebSocket 连接池广播到所有已连接的前端客户端。广播的消息类型为 `log_entry`，包含 `level`、`module`、`message`、`time` 字段。

#### Scenario: Log entry is broadcast to connected clients
- **WHEN** 后端任意模块产生 INFO 或以上级别的 loguru 日志
- **THEN** 所有已连接的 `/ws/live2d` 客户端收到 `{"type": "log_entry", "level": "<LEVEL>", "module": "<MODULE>", "message": "<text>", "time": "<HH:MM:SS>"}` 格式的 JSON 消息

#### Scenario: DEBUG logs are NOT broadcast
- **WHEN** 后端模块产生 DEBUG 级别的 loguru 日志
- **THEN** 该日志不通过 WebSocket 推送到前端（仅保留本地终端输出）

#### Scenario: No connected clients
- **WHEN** loguru 产生 INFO+ 日志但 WebSocket 连接池为空
- **THEN** sink 静默丢弃该日志，不产生异常

---

### Requirement: Backend broadcasts ASR_RESULT event
后端 SHALL 在收到 `Event.ASR_RESULT` 事件时通过 `/ws/live2d` 广播 `{"type": "asr_result", "text": <str>, "emotion": <str>}` 消息到所有前端客户端。

#### Scenario: ASR recognition completes
- **WHEN** 后端 ASR 模块完成一段语音识别，发布 `ASR_RESULT` 事件
- **THEN** 前端收到 `type: "asr_result"` 消息，包含识别文本和情感字段

---

### Requirement: Backend broadcasts LLM pipeline events
后端 SHALL 在收到 `Event.LLM_SENTENCE` 和 `Event.LLM_DONE` 事件时分别广播对应消息类型到前端。

#### Scenario: LLM produces a sentence
- **WHEN** LLM 模块产出一个完整句子，发布 `LLM_SENTENCE` 事件
- **THEN** 前端收到 `{"type": "llm_sentence", "text": <str>, "emotion": <str>}` 消息

#### Scenario: LLM generation completes
- **WHEN** LLM 模块完成整轮生成，发布 `LLM_DONE` 事件
- **THEN** 前端收到 `{"type": "llm_done"}` 消息

---

### Requirement: Module field derivation from log record
后端 loguru sink SHALL 从日志 record 的 `name` 字段（Python 模块路径）派生 `module` 字段，规则如下：包含 `asr` → `ASR`；包含 `llm` → `LLM`；包含 `tts` → `TTS`；其余 → `SYSTEM`。

#### Scenario: ASR module log is tagged correctly
- **WHEN** `pipeline.asr.sensevoice` 模块产生 INFO 日志
- **THEN** 广播的 `log_entry` 消息中 `module` 字段为 `"ASR"`

#### Scenario: Unknown module log is tagged as SYSTEM
- **WHEN** `core.bot` 或 `api.ws_live2d` 模块产生 INFO 日志
- **THEN** 广播的 `log_entry` 消息中 `module` 字段为 `"SYSTEM"`

---

### Requirement: Frontend Dashboard displays log_entry messages
前端 Dashboard 实时日志区域 SHALL 订阅 `log_entry` 类型的 WebSocket 消息，并将其追加到日志列表顶部（最新在上）。日志条目按 `level` 着色：ERROR/WARNING 红色、INFO 灰色/绿色、DEBUG 灰色暗化。日志缓冲上限为 200 条，超出时自动丢弃最旧条目。

#### Scenario: log_entry message received
- **WHEN** 前端收到 `type: "log_entry"` 的 WebSocket 消息
- **THEN** 该消息以 `[MODULE] message` 格式插入日志列表顶部，按 level 着色显示

#### Scenario: Log buffer overflow
- **WHEN** 日志列表已达 200 条，再收到新的 `log_entry` 消息
- **THEN** 最旧的一条日志被丢弃，新日志插入列表顶部，总数保持 200 条

#### Scenario: Empty log state
- **WHEN** 页面刚加载或用户点击"清空"按钮
- **THEN** 日志区域显示"等待事件..."占位文本

---

### Requirement: Frontend Dashboard supports module filter
前端 Dashboard 实时日志区域 SHALL 提供按模块过滤的 UI 控件（ALL / ASR / LLM / TTS / SYSTEM），用户切换过滤器时日志列表即时刷新，仅显示匹配模块的条目。

#### Scenario: User selects ASR filter
- **WHEN** 用户点击"ASR"过滤按钮
- **THEN** 日志列表仅显示 `module` 为 `"ASR"` 的条目；其他模块条目隐藏（不删除，切回 ALL 仍可见）

#### Scenario: User selects ALL filter
- **WHEN** 用户点击"ALL"过滤按钮（默认状态）
- **THEN** 日志列表显示所有缓冲中的条目，不过滤任何模块

---

### Requirement: Frontend WsMessage type includes log_entry
前端 `WsMessage` TypeScript 类型 SHALL 包含 `log_entry` union 成员，字段为 `type: "log_entry"`, `level: string`, `module: string`, `message: string`, `time: string`。

#### Scenario: Type-safe message handling
- **WHEN** TypeScript 编译器检查 Dashboard 中对 `log_entry` 消息的处理代码
- **THEN** 编译无类型错误，`msg.level`、`msg.module`、`msg.message` 均有正确类型推断

# OpenClaw LLM Pipeline

## Purpose

OpenClaw LLM Pipeline 负责将用户语音识别结果通过 OpenClaw Gateway 的 OpenAI 兼容 HTTP 接口（`POST /v1/chat/completions`）发送给 Agent，以 SSE 流式接收回复，解析情感 JSON，按句子边界切割后发布事件，驱动 TTS 合成与前端字幕显示。

## Requirements

### Requirement: OpenClaw Gateway 连接配置
系统 SHALL 通过 `OpenClawConfig` 配置块管理与 OpenClaw Gateway 的连接参数，包含 `url`（默认 `http://localhost:18789`）、`token`（Bearer 认证令牌）、`session_key`（默认 `main`）、`agent_id`（可选，默认空，代表使用 Gateway 默认 Agent）。

#### Scenario: 使用默认配置连接本地 Gateway
- **WHEN** `config.yaml` 中 `openclaw` 节点未配置
- **THEN** Pipeline 使用 `http://localhost:18789`、空 token、`session_key="main"` 发起请求

#### Scenario: 自定义 URL 和 token
- **WHEN** `config.yaml` 中配置了 `openclaw.url` 和 `openclaw.token`
- **THEN** Pipeline 使用指定 URL 并在请求头中附加 `Authorization: Bearer <token>`

#### Scenario: 配置热重载
- **WHEN** 用户在 Web 管理页面修改 openclaw 配置并保存
- **THEN** 下一次对话请求使用新的连接参数，无需重启后端

---

### Requirement: HTTP SSE 流式请求
系统 SHALL 向 `<url>/v1/chat/completions` 发送 POST 请求（`stream: true`），以 SSE（Server-Sent Events）格式接收流式响应。

#### Scenario: 发起流式请求
- **WHEN** 收到 `ASR_RESULT` 事件，触发 `generate(user_text, user_emotion)` 调用
- **THEN** Pipeline 向 `POST <url>/v1/chat/completions` 发送如下请求体：
  `{"model": "openclaw", "stream": true, "messages": [{"role": "user", "content": "<user_text>"}]}`，
  请求头含 `Authorization: Bearer <token>`、`Accept: text/event-stream`

#### Scenario: SSE chunk 解析
- **WHEN** 服务端推送 `data: {"choices":[{"delta":{"content":"..."}}]}` 格式的 SSE 行
- **THEN** Pipeline 提取 `choices[0].delta.content` 字段累积到文本缓冲区

#### Scenario: SSE 流结束
- **WHEN** 服务端推送 `data: [DONE]`
- **THEN** Pipeline 处理缓冲区内剩余文本，发布 `LLM_DONE` 事件

---

### Requirement: 情感 JSON 解析
系统 SHALL 从流式响应的开头解析情感 JSON，格式与现有约定保持兼容：第一行为 `{"emotion": "<情感标签>"}` 或包含 `emotion` 字段的 JSON 对象，之后为回复正文。

#### Scenario: 正常情感 JSON 解析
- **WHEN** 流式响应首个 `}` 字符到达后，已缓冲内容可被解析为含 `emotion` 字段的 JSON
- **THEN** 提取 `emotion` 值（如 `"开心"`），其余内容进入句子缓冲

#### Scenario: 情感 JSON 解析失败 Fallback
- **WHEN** 缓冲内容无法解析为合法 JSON
- **THEN** `emotion` 默认为 `"平静"`，已缓冲内容全部进入句子缓冲，记录 DEBUG 日志

#### Scenario: OpenClaw 未配置情感格式时的 Fallback
- **WHEN** Agent 回复不包含情感 JSON 前缀（OpenClaw 未配置对应 system prompt 时）
- **THEN** 整个回复作为纯文本处理，`emotion` 默认 `"平静"`

---

### Requirement: 句子边界切割与事件发布
系统 SHALL 在流式接收过程中实时检测句子边界（`。！？\n`），每检测到一个完整句子立即发布 `LLM_SENTENCE` 事件，触发 TTS 合成。

#### Scenario: 实时句子切割
- **WHEN** 文本缓冲区中出现句子结束符
- **THEN** 将该句子（去除首尾空白）通过 `bus.emit(Event.LLM_SENTENCE, {"text": sentence, "emotion": emotion})` 发布

#### Scenario: 流结束时处理剩余文本
- **WHEN** SSE 流结束且文本缓冲区非空
- **THEN** 将剩余内容作为最后一个句子发布 `LLM_SENTENCE` 事件

#### Scenario: 流结束后发布 LLM_DONE
- **WHEN** 所有句子处理完毕
- **THEN** 发布 `bus.emit(Event.LLM_DONE, {})`

---

### Requirement: 连接失败与超时处理
系统 SHALL 在 OpenClaw Gateway 不可达或请求超时时，发布错误日志并发布 `LLM_DONE` 事件，不崩溃主流程。

#### Scenario: Gateway 连接拒绝
- **WHEN** HTTP 请求返回连接拒绝（`ConnectionRefusedError`）
- **THEN** 记录 ERROR 日志（含 Gateway URL），发布 `LLM_DONE`，不抛出异常

#### Scenario: HTTP 4xx/5xx 响应
- **WHEN** Gateway 返回非 2xx 状态码
- **THEN** 记录 ERROR 日志（含状态码和响应体），发布 `LLM_DONE`

#### Scenario: 请求超时
- **WHEN** 请求超过 `timeout_ms`（默认 120 000 ms）未收到首个 chunk
- **THEN** 中断请求，记录 WARNING 日志，发布 `LLM_DONE`

---

### Requirement: 用户情感注入
系统 SHALL 将 ASR 检测到的用户情感标签附加到发送给 OpenClaw 的消息内容中，与现有行为保持一致。

#### Scenario: 有用户情感时附加提示
- **WHEN** `user_emotion` 非空且非 `"neutral"`
- **THEN** user message content 末尾附加 `[用户语气：<mapped_emotion>]`，如 `[用户语气：愉快]`

#### Scenario: 无用户情感时不附加
- **WHEN** `user_emotion` 为 `"neutral"` 或空字符串
- **THEN** user message content 为原始文本，不附加任何情感标签

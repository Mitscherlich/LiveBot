# LLM Pipeline

## Purpose

LLM Pipeline 负责接收 ASR 识别文本，调用 LLM 生成角色回复，并以流式方式输出情感标签和回复文本，触发 TTS 合成。

## Requirements

### Requirement: 流式输出与实时字幕推送
系统 SHALL 使用 `stream=True` 进行流式 LLM 调用，并将每个文本块实时通过 WebSocket 推送到前端显示字幕。

#### Scenario: 流式文本接收
- **WHEN** LLM 开始返回流式响应
- **THEN** 系统逐 chunk 接收文本，同时通过 WebSocket 事件 `llm_chunk` 推送到前端

#### Scenario: 句子边界切割
- **WHEN** 流式文本中出现句子结束符（`。！？\n`）
- **THEN** 系统将已积累的文本作为完整句子发布 `llm_sentence` 事件，触发 TTS 合成

---

### Requirement: JSON 格式情感输出
系统 SHALL 通过 system prompt 要求 LLM 以 JSON 格式输出，包含情感标签和回复文本两个字段。

#### Scenario: 正常 JSON 解析
- **WHEN** LLM 输出完整 JSON `{"emotion": "开心", "text": "你好呀～"}`
- **THEN** 系统提取 `emotion` 和 `text`，分别用于 TTS 情感映射和字幕显示

#### Scenario: JSON 解析失败 Fallback
- **WHEN** LLM 输出无法解析为合法 JSON
- **THEN** 系统将完整输出作为 `text`，`emotion` 默认为 `"平静"`，记录警告日志

#### Scenario: 用户情感注入
- **WHEN** ASR 返回了用户情感标签（如 `happy`）
- **THEN** 系统在 LLM 请求的 user message 末尾附加情感提示，如 `[用户语气：愉快]`


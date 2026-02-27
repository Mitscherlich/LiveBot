# live2d-emotion-dispatch

## Purpose

将后端情感标签（emotion）映射为 Live2D expression 和 motion 的联动触发能力。覆盖后端消息携带 expression 字段、前端情感映射表维护、emotion 统一分发入口，以及向后兼容旧版后端的降级策略。

## Requirements

### Requirement: Backend subtitle message carries expression field
后端 `ws_live2d.py` 在广播 `TTS_SUBTITLE` 事件时，SHALL 在 WebSocket 消息中新增可选 `expression` 字段，其值由后端侧情感→expression 映射表（`EMOTION_EXPRESSION_MAP`）查找得出。若 emotion 标签无对应映射，`expression` 字段值为 `null`。

#### Scenario: Known emotion maps to expression name
- **WHEN** 后端收到 `TTS_SUBTITLE` 事件，`emotion` 为 `"开心"`
- **THEN** 广播消息为 `{"type": "subtitle", "text": "...", "emotion": "开心", "expression": "happy"}`

#### Scenario: Unknown emotion sends null expression
- **WHEN** 后端收到 `TTS_SUBTITLE` 事件，`emotion` 为未注册的标签
- **THEN** 广播消息中 `expression` 字段值为 `null`，前端降级为纯 motion 触发

---

### Requirement: Frontend EMOTION_MAP defines dual expression+motion mapping
前端 `Live2DCanvas.tsx` SHALL 维护 `EMOTION_MAP: Record<string, { expression: string; motionGroup: string }>` 常量，覆盖系统支持的所有情感标签（开心、悲伤、愤怒、平静、惊讶），映射到对应的 expression name 和 motion group name。

#### Scenario: All default emotions have mappings
- **WHEN** 系统初始化
- **THEN** `EMOTION_MAP` 中存在以下键的完整映射：`开心`、`悲伤`、`愤怒`、`平静`、`惊讶`

---

### Requirement: triggerEmotion dispatches expression and motion simultaneously
`Live2DCanvas` 的 `triggerEmotion(emotion: string)` 方法 SHALL 从 `EMOTION_MAP` 查找对应映射，同时调用 `setExpression(mapping.expression)` 和 `triggerMotion(mapping.motionGroup)`，两者 SHALL 在同一调用栈内触发，不引入异步延迟。若 emotion 不在映射表中，SHALL 降级为仅触发 `triggerMotion("Idle")`（motion group 名称大小写需与模型一致）。

#### Scenario: Valid emotion triggers both expression and motion
- **WHEN** `triggerEmotion("开心")` 被调用
- **THEN** `setExpression("happy")` 和 `triggerMotion("Flick")` 均被执行，面部表情和肢体动作同步启动

#### Scenario: Unknown emotion falls back to idle motion
- **WHEN** `triggerEmotion("困惑")` 被调用且 `"困惑"` 不在 `EMOTION_MAP` 中
- **THEN** 仅调用 `triggerMotion("Idle")`，不调用 `setExpression()`，控制台输出 warn 日志

---

### Requirement: Live2DView dispatches emotion on subtitle WebSocket message
`Live2DView.tsx` 接收到 `type === "subtitle"` 的 WebSocket 消息时，SHALL 调用 `canvasRef.current?.triggerEmotion(msg.emotion)`。若消息中存在 `expression` 字段（非 null），SHALL 优先调用 `canvasRef.current?.setExpression(msg.expression)` 覆盖 `triggerEmotion` 内部的 expression 触发（或直接透传，二者选其一需在 design 中明确，此处以 `triggerEmotion` 统一入口为准）。

#### Scenario: Subtitle message triggers emotion dispatch
- **WHEN** WebSocket 收到 `{"type": "subtitle", "text": "你好", "emotion": "开心", "expression": "happy"}`
- **THEN** `canvasRef.current?.triggerEmotion("开心")` 被调用，Live2D 模型开始播放 happy 表情和动作

#### Scenario: Missing emotion field in message does not crash
- **WHEN** WebSocket 收到 `{"type": "subtitle", "text": "你好"}` 且无 `emotion` 字段
- **THEN** Live2DView 跳过 emotion 触发，不抛出异常

---

### Requirement: Backward compatibility when expression field absent
当后端尚未发送 `expression` 字段时（旧版本后端），前端 SHALL 继续正常工作，`triggerEmotion` 依赖前端本地 `EMOTION_MAP` 完成双触发，不依赖后端传入的 expression 字段。

#### Scenario: Legacy backend message without expression field
- **WHEN** WebSocket 收到 `{"type": "subtitle", "text": "...", "emotion": "开心"}` 且无 `expression` 字段
- **THEN** `triggerEmotion("开心")` 被调用，前端从本地 `EMOTION_MAP` 查找 expression，行为与新版一致

## ADDED Requirements

### Requirement: Web 端 Live2D 模型渲染
系统 SHALL 在浏览器中使用官方 CubismSdkForWeb 渲染 Live2D Cubism 4 模型，支持用户上传自定义模型文件。

#### Scenario: 加载用户模型
- **WHEN** 用户在 Web 管理页面上传 `.model3.json` 及配套资源文件
- **THEN** 前端通过 CubismSdkForWeb 加载模型，在 WebGL Canvas 上渲染 Live2D 角色

#### Scenario: 模型未配置时的默认状态
- **WHEN** 用户未上传任何 Live2D 模型
- **THEN** 渲染区域显示占位提示，功能不影响其他模块正常运行

#### Scenario: 自动待机动画
- **WHEN** 系统处于空闲状态（无语音输入、无 TTS 播放）
- **THEN** CubismBreath 和 CubismEyeBlink 组件自动驱动呼吸和随机眨眼，无需后端信号

#### Scenario: 情感动作触发
- **WHEN** WebSocket 收到含 `emotion` 字段的消息（如 `"开心"`）
- **THEN** 前端调用对应 Motion Group（如 `happy`），播放预设情感动作

---

### Requirement: 基于时间戳的实时口型同步
系统 SHALL 根据后端推送的逐字时间戳数据，在对应时刻更新 Live2D 的 `ParamMouthOpenY` 参数，实现口型与语音同步。

#### Scenario: 口型张开
- **WHEN** 当前时刻达到某字的 `t0 + BeginTime`
- **THEN** 前端将 `ParamMouthOpenY` 设置为 `1.0`（全张）

#### Scenario: 口型闭合
- **WHEN** 当前时刻达到某字的 `t0 + EndTime`
- **THEN** 前端将 `ParamMouthOpenY` 设置为 `0.0`（闭合）

#### Scenario: 播放结束口型复位
- **WHEN** 收到 `playback_done` 事件
- **THEN** 前端将 `ParamMouthOpenY` 平滑过渡到 `0.0`

---

### Requirement: WebSocket 实时数据接收
系统 SHALL 通过 WebSocket 连接后端，实时接收口型时间戳、字幕文本和系统状态数据。

#### Scenario: 建立 WebSocket 连接
- **WHEN** 前端页面加载完成
- **THEN** 前端自动连接后端 `ws://localhost:8000/ws/live2d`，断线自动重连（最多 5 次，指数退避）

#### Scenario: 接收口型时间线
- **WHEN** WebSocket 收到 `{type: "lip_sync", timeline: [...], t0: ...}` 消息
- **THEN** 前端解析时间线，使用 `requestAnimationFrame` 调度口型更新

#### Scenario: 接收字幕消息
- **WHEN** WebSocket 收到 `{type: "subtitle", text: "...", emotion: "..."}` 消息
- **THEN** 前端在角色下方显示字幕文本，并根据 emotion 显示对应表情图标

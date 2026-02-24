## Why

直播助手目前缺乏字幕显示能力，用户无法在 OBS 直播画面中实时看到对话内容。通过集成 OBS WebSocket 协议，可将 ASR 识别结果和 AI 回复同步显示为字幕，提升直播互动体验和可访问性。

## What Changes

- 新增 OBS WebSocket 客户端模块，实现与 OBS Studio 的实时通信和认证
- 新增字幕控制器，支持通过 `SetInputSettings` 远程设置 OBS 文字组件内容
- 新增用户字幕显示：ASR 识别完成后立即全文推送到 `UserText` 组件
- 新增 AI 字幕流式显示：TTS 播放时逐字渲染到 `AssistantText` 组件，与音频时长对齐
- 新增字幕队列机制：通过 Queue 同步 TTS 合成完成事件与扬声器播放事件

## Capabilities

### New Capabilities
- `obs-websocket-client`: OBS WebSocket 连接、认证及请求发送能力
- `obs-subtitle-display`: 字幕内容控制，包括用户字幕即时显示和 AI 字幕流式渲染

### Modified Capabilities

（无现有能力的需求变更）

## Impact

- **新增依赖**: `websockets`（Python 异步 WebSocket 库）
- **新增文件**: `obs_client.py`（WebSocket 客户端）、`subtitle_controller.py`（字幕控制）
- **修改文件**: 主流程需在 ASR 回调和 TTS 播放回调处接入字幕调用
- **OBS 配置前提**: 用户需在 OBS 场景中预先创建 `UserText` 和 `AssistantText` 两个 Text (GDI+) 组件，并启用 WebSocket 服务（默认端口 4455）
- **无 Breaking Change**：字幕功能为可选增强，OBS 未连接时主流程不受影响

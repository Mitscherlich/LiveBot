## Context

直播助手已具备 ASR 语音识别、LLM 对话、TTS 语音合成及 Live2D 角色渲染能力。OBS Studio 通过窗口捕获展示 Live2D Qt 窗口，字幕需作为独立图层在 OBS 内合成。当前主流程无任何字幕输出，用户只能听到对话音频，无视觉文字反馈。

OBS WebSocket 协议（v5，obswebsocket.json subprotocol）提供标准化的 RPC 接口，通过 `SetInputSettings` 请求可远程修改场景中文字组件的 `text` 属性，无需修改 OBS 插件或 C++ 代码。

## Goals / Non-Goals

**Goals:**
- 实现 OBS WebSocket 连接与认证，支持密码可选
- ASR 识别完成后立即将用户输入全文显示在 `UserText` 组件
- TTS 音频播放期间，AI 回复文字与音频时长对齐，逐字流式显示在 `AssistantText` 组件
- 字幕功能降级安全：OBS 未启动或 WebSocket 未连接时，主流程继续正常运行
- 配置化：连接参数（host、port、password）通过配置文件管理

**Non-Goals:**
- 字幕样式定制（字体、颜色、位置由 OBS 内部配置决定）
- 多场景/多 Profile 管理
- OBS 录制/推流状态控制
- 字幕历史记录或持久化存储

## Decisions

### 决策 1：使用同步 `websockets` 库的异步接口 vs 第三方 OBS SDK

**选择**：直接使用 `websockets` 库手动实现协议。

**理由**：`obsws-python` 等第三方 SDK 版本碎片化，对 OBS WebSocket v5 支持参差不齐；协议层逻辑简单（握手 + SHA256 认证 + 单一 RPC 调用），自实现代码量少，依赖更轻。

### 决策 2：AI 字幕用独立线程池（ThreadPoolExecutor, max_workers=1）

**选择**：字幕流式渲染在 `ThreadPoolExecutor(max_workers=1)` 的独立线程中执行，而非主线程或 asyncio 事件循环。

**理由**：主流程中 TTS 回调和 ASR 回调均在非 asyncio 上下文中运行，使用 `run_coroutine_threadsafe` 桥接 asyncio 与同步代码；`max_workers=1` 确保字幕任务串行执行，避免并发渲染导致乱序显示。

### 决策 3：字幕渲染间隔由音频时长均分

**选择**：字符显示间隔 = `clamp(audio_duration / len(text), 0, 5秒) / len(text)`，在独立线程中 `time.sleep` 逐字显示。

**理由**：与 TTS 音频节奏对齐，视觉上更自然；时长限制在 0~5 秒防止极端值（超短/超长音频）导致显示异常；无需复杂的时间戳对齐，实现简单可靠。

### 决策 4：字幕队列（subtitles_queue）解耦 TTS 合成与播放事件

**选择**：TTS 合成完成后将文本压入 `Queue`，扬声器播放事件触发时取出并启动字幕渲染线程。

**理由**：TTS 合成与音频播放之间存在时间差（音频缓冲、队列等待），直接在合成回调启动字幕会导致字幕超前于音频；通过播放事件触发确保两者同步。

## Risks / Trade-offs

- **[风险] OBS 未启动或 WebSocket 断连** → 所有字幕 API 调用捕获异常并静默跳过，记录 warning 日志，不影响主流程
- **[风险] 文字组件不存在（名称拼写错误）** → OBS 返回错误响应，客户端记录 error 日志；文档中明确说明组件命名规范
- **[Trade-off] 逐字显示 vs 流式分词显示** → 选择逐字显示实现简单，但中文场景下词间没有停顿感；后续可优化为按标点/词边界分组
- **[风险] asyncio 事件循环在主线程未运行** → WebSocket 客户端在独立 asyncio 线程中启动，通过 `run_coroutine_threadsafe` 提交任务，规避此问题
- **[Trade-off] ThreadPoolExecutor max_workers=1 会排队** → 若前一条 AI 字幕尚未渲染完毕，新字幕任务会等待；考虑到对话轮次间隔，此情况极少发生

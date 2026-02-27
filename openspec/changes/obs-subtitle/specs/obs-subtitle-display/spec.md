## ADDED Requirements

### Requirement: 用户字幕即时显示
系统 SHALL 在 ASR 识别完成后立即将识别文本全文一次性推送到 OBS 的 `UserText` 组件。

#### Scenario: ASR 识别完成触发用户字幕
- **WHEN** ASR 模块完成语音识别，返回识别结果文本
- **THEN** 系统 SHALL 立即调用 OBS 客户端，将完整识别文本设置到 `UserText` 组件

#### Scenario: OBS 未连接时不阻塞 ASR 流程
- **WHEN** ASR 识别完成，但 OBS WebSocket 未连接
- **THEN** 字幕推送 SHALL 静默失败，ASR 后续流程（LLM 调用等）不受影响

### Requirement: AI 字幕流式渲染与音频对齐
系统 SHALL 在 TTS 音频播放期间，将 AI 回复文本逐字流式显示在 OBS 的 `AssistantText` 组件，字符显示速度与音频时长对齐。

#### Scenario: TTS 播放开始触发字幕渲染
- **WHEN** TTS 音频开始播放，且 subtitles_queue 中有待显示的文本
- **THEN** 系统 SHALL 从 subtitles_queue 取出文本，在独立线程中逐字渲染到 `AssistantText`

#### Scenario: 字符间隔由音频时长均分
- **WHEN** 文本长度为 N 个字符，音频时长为 D 秒
- **THEN** 每个字符的显示间隔 SHALL 为 `clamp(D, 0, 5) / N` 秒，逐字追加显示

#### Scenario: 字幕渲染不阻塞主流程
- **WHEN** 字幕流式渲染正在进行
- **THEN** 渲染任务 SHALL 在 ThreadPoolExecutor(max_workers=1) 的独立线程中异步执行，不阻塞 TTS 播放回调或其他主流程操作

### Requirement: 字幕队列同步 TTS 合成与播放
系统 SHALL 通过 Queue 机制，将 TTS 文本合成事件与扬声器播放事件解耦，确保字幕在音频实际播放时才开始显示。

#### Scenario: TTS 合成完成入队
- **WHEN** TTS 模块完成一段文本的语音合成
- **THEN** 系统 SHALL 将对应的文本内容压入 `subtitles_queue`

#### Scenario: 播放事件触发出队渲染
- **WHEN** 扬声器开始播放某段 TTS 音频
- **THEN** 系统 SHALL 从 `subtitles_queue` 取出对应文本，并启动字幕流式渲染任务

#### Scenario: 队列为空时跳过渲染
- **WHEN** 扬声器播放事件触发，但 subtitles_queue 为空
- **THEN** 系统 SHALL 静默跳过，不产生错误

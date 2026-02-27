## 1. 依赖与配置

- [ ] 1.1 在 `requirements.txt` 或 `pyproject.toml` 中添加 `websockets` 依赖
- [ ] 1.2 在配置文件中新增 OBS WebSocket 配置项：`obs_host`（默认 `127.0.0.1`）、`obs_port`（默认 `4455`）、`obs_password`（默认空）、`obs_enabled`（默认 `false`）

## 2. OBS WebSocket 客户端（obs_client.py）

- [ ] 2.1 创建 `obs_client.py`，实现 `OBSWebSocketClient` 类，包含 `connect()`、`disconnect()`、`set_input_text(input_name, text)` 方法
- [ ] 2.2 实现 op=0 握手解析：提取 `challenge` 和 `salt`
- [ ] 2.3 实现认证逻辑：`Base64(SHA256(Base64(SHA256(password + salt)) + challenge))`，发送 op=1
- [ ] 2.4 实现无密码时直接发送空认证 op=1
- [ ] 2.5 实现 `set_input_text`：构造 op=6 `SetInputSettings` 请求，生成 UUID 作为 requestId
- [ ] 2.6 所有网络异常（连接失败、断连、OBS 错误响应）捕获后记录日志，不向上抛出
- [ ] 2.7 在独立 asyncio 线程中运行事件循环，提供线程安全的调用接口（`run_coroutine_threadsafe`）

## 3. 字幕控制器（subtitle_controller.py）

- [ ] 3.1 创建 `subtitle_controller.py`，实现 `SubtitleController` 类
- [ ] 3.2 实现 `set_user_subtitle(text)`：直接调用 OBS 客户端设置 `UserText`
- [ ] 3.3 实现 `enqueue_ai_subtitle(text)`：将文本压入 `subtitles_queue`
- [ ] 3.4 实现 `on_audio_play_start(audio_duration_sec)`：从队列取文本，提交流式渲染任务到 `ThreadPoolExecutor(max_workers=1)`
- [ ] 3.5 实现流式渲染逻辑：按 `clamp(audio_duration, 0, 5) / len(text)` 间隔逐字追加，调用 `set_input_text('AssistantText', accumulated_text)`
- [ ] 3.6 队列为空时 `on_audio_play_start` 静默返回

## 4. 主流程集成

- [ ] 4.1 在主模块初始化时，若 `obs_enabled=true` 则创建并连接 `OBSWebSocketClient`，创建 `SubtitleController`
- [ ] 4.2 在 ASR 识别完成回调处，调用 `subtitle_controller.set_user_subtitle(text)`
- [ ] 4.3 在 TTS 合成完成回调处，调用 `subtitle_controller.enqueue_ai_subtitle(text)`
- [ ] 4.4 在扬声器开始播放回调处，调用 `subtitle_controller.on_audio_play_start(audio_duration_sec)`
- [ ] 4.5 在程序退出时调用 `obs_client.disconnect()`

## 5. 验证

- [ ] 5.1 启动 OBS，创建 `UserText` 和 `AssistantText` Text (GDI+) 组件，启用 WebSocket 服务
- [ ] 5.2 启动直播助手，验证 OBS WebSocket 连接日志无异常
- [ ] 5.3 触发一次语音输入，验证 `UserText` 组件显示识别文本
- [ ] 5.4 等待 AI 回复播放，验证 `AssistantText` 组件逐字流式显示，与音频节奏对齐
- [ ] 5.5 关闭 OBS 后触发对话，验证主流程正常运行，无崩溃

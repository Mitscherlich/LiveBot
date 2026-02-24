## 1. 重构 TencentTTSPipeline 核心结构

- [ ] 1.1 在 `__init__()` 中移除 `import queue` 相关代码（若原有 threading.Queue 仍需保留用于音频播放则保留），新增 `_tts_queue: asyncio.Queue | None = None` 和 `_worker_task: asyncio.Task | None = None` 实例属性
- [ ] 1.2 将原 `synthesize()` 中的 WebSocket 连接和合成逻辑提取为私有方法 `_do_synthesize(text: str, emotion: str)`
- [ ] 1.3 将 `synthesize()` 改为入队方法：懒初始化 `_tts_queue`（`asyncio.Queue()`），将 `(text, emotion)` 放入队列，并在首次调用时通过 `asyncio.ensure_future()` 启动 `_worker()` 协程

## 2. 实现 worker 协程

- [ ] 2.1 新增 `async def _worker()` 方法：循环从 `_tts_queue` 取 `(text, emotion)` 元组，调用 `_do_synthesize()`
- [ ] 2.2 在 `_worker()` 的循环体外层包裹 `try/except Exception`，捕获任意异常后记录 `logger.error()` 并继续循环（不中断 worker）
- [ ] 2.3 确保 worker 在 `_tts_queue` 为空时正常 `await` 阻塞，不忙等

## 3. 更新 interrupt() 方法

- [ ] 3.1 在 `interrupt()` 中，于清空音频播放队列（`_audio_queue`）的逻辑之后，追加清空 `_tts_queue` 的逻辑：循环调用 `_tts_queue.get_nowait()` 直到 `asyncio.QueueEmpty`（若 `_tts_queue` 为 None 则跳过）
- [ ] 3.2 确保 `_interrupt_flag = True` 的设置在清空 TTS 队列之前完成，使正在执行的 `_do_synthesize()` 能及时感知打断

## 4. 验证与测试

- [ ] 4.1 手动测试：触发 LLM 连续输出 5 句以上，观察日志确认 TTS WebSocket 连接串行建立，无 code 10002 错误
- [ ] 4.2 打断测试：播放第 1 句时触发新 ASR 输入，确认剩余句子不再合成，日志显示队列被清空
- [ ] 4.3 正常对话测试：单轮 1-3 句回复场景，确认功能与修改前一致，音频正常播放，口型时间线正常推送
- [ ] 4.4 异常恢复测试：模拟 TTS 服务返回错误，确认 worker 协程不崩溃，后续句子可正常处理

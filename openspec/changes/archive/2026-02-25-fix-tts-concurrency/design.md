## Context

`TencentTTSPipeline.synthesize()` 目前是一个 `async` 方法，每次调用都直接发起一个新的腾讯云 TTS WebSocket 连接。当 LLM 流式输出多个句子时，`bot.py` 的 `on_llm_sentence` 事件处理器会对每个句子 `await self.tts.synthesize(...)`，但由于事件总线中多个事件可以并发触发，实际上会产生多个并发的 WebSocket 连接。腾讯云个人账号默认并发限制通常为 2-3 路，超出后返回 code 10002 错误，导致句子丢失。

当前架构中，`_audio_queue`（threading.Queue）负责 PCM 帧的播放排队，`_player_thread`（daemon 线程）负责消费 PCM 并用 pygame 播放。但 TTS 合成本身没有串行化机制。

## Goals / Non-Goals

**Goals:**
- 同一时刻最多只有一个活跃的腾讯云 TTS WebSocket 连接
- 打断（interrupt）时同时清空 TTS 请求队列，避免旧句子在打断后继续合成和播放
- 不改变 `synthesize(text, emotion)` 的调用签名，`bot.py` 无需修改
- 无新增外部依赖

**Non-Goals:**
- 优先级队列（不同句子有不同优先级）
- 多 worker 并发（当前账号限制下无意义）
- 腾讯云账号并发限制的动态检测或退避重试

## Decisions

### 决策 1：asyncio.Queue + 单 worker 协程（选定方案）

**方案**：在 `TencentTTSPipeline.__init__()` 中创建 `asyncio.Queue`，`synthesize()` 改为 `put` 入队（非阻塞），新增 `_worker()` 协程作为单消费者循环调用原始 WebSocket 合成逻辑。

**理由**：
- 完全串行，从根本上消除并发超限
- asyncio 原生，不引入额外线程锁，符合当前代码风格（已有 asyncio event loop）
- 打断时只需清空 Queue 即可丢弃待处理句子

**备选方案 A：asyncio.Semaphore(1)**
为每次 `synthesize()` 调用加 `asyncio.Semaphore(1)`，确保同时只有一个执行。
缺点：打断时已通过 semaphore 排队的协程仍会在 interrupt 后依次获得锁并执行，需要额外在每次 acquire 后检查 interrupt_flag，逻辑更复杂。

**备选方案 B：取消挂起的 asyncio.Task**
对每个 `synthesize()` 调用创建 Task，打断时取消所有挂起的 Task。
缺点：Task 取消的时机不确定，已进入 WebSocket 连接建立阶段的 Task 需要妥善处理连接关闭，容易引入资源泄漏。

### 决策 2：worker 协程的生命周期绑定到 synthesize() 首次调用

由于 `asyncio.Queue` 必须在 event loop 运行后才能创建（`__init__` 时 loop 可能还未启动），worker 协程在 `synthesize()` 第一次入队时通过 `asyncio.ensure_future()` 懒启动，并通过 `_worker_task` 属性持有引用，避免重复启动。

**备选方案**：在 `bot.py` 的 `start()` 中显式调用 `tts.start_worker()`。
缺点：需要修改 `bot.py`，打破最小变更原则。

### 决策 3：interrupt() 使用 asyncio 线程安全接口清空 Queue

`interrupt()` 目前是同步方法，从其他线程调用（如 `_player_thread` 的回调）。`asyncio.Queue` 的 `get_nowait()` 在非 event loop 线程调用是安全的（CPython），但清空 Queue 需要循环调用 `get_nowait()` 直到 `asyncio.QueueEmpty`。

## Risks / Trade-offs

- **延迟增加**：串行化意味着后续句子必须等待前一句合成完成后才开始，总体合成耗时增加。缓解：腾讯云 TTS 流式输出，合成延迟通常 < 500ms/句，用户感知影响有限。
- **队列积压**：若 LLM 输出速度远快于 TTS 合成速度，队列可能积压。缓解：打断时清空队列，且当前场景（直播互动）对话轮次较短，积压量有限。
- **Worker 协程异常退出**：若 `_worker()` 内部发生未捕获异常，队列将永久阻塞。缓解：在 `_worker()` 外层加 `try/except Exception` 并记录日志，异常后重启 worker。

## Migration Plan

1. 修改 `TencentTTSPipeline`：添加 `_tts_queue`、`_worker_task`，重构 `synthesize()` 为入队逻辑，新增 `_worker()` 和 `_do_synthesize()` 方法，更新 `interrupt()` 同时清空 TTS 队列
2. 无需修改 `bot.py`（接口兼容）
3. 本地测试：连续发送 5+ 句 LLM 句子，确认无 code 10002 错误，句子按序播放
4. 打断测试：播放中途触发新 ASR，确认旧句子立即停止且不再继续合成

**回滚**：本次改动完全在 `tencent_tts.py` 内，回滚只需 `git revert` 单文件。

## Open Questions

- 无

## Known Limitations

- **串行化依赖调用方约定，非 pipeline 自身保证**：当前串行化逻辑实现在 `bot.py` 的 `_tts_sentence_queue` + `_tts_worker()`，`TencentTTSPipeline.synthesize()` 本身没有并发保护。若未来新增其他 TTS pipeline（如 `LocalTTSPipeline`），开发者需要了解这一约定，否则直接并发调用 `synthesize()` 仍会出现超限问题。
  - **后续修复方向**：引入 `BaseTTSPipeline` 抽象基类，在接口注释中明确串行化责任归属，或将队列逻辑下沉到基类中统一管理。

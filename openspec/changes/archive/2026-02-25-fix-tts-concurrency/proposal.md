## Why

腾讯云 TTS 个人账号默认并发上限通常仅 2-3 路 WebSocket 连接。当 LLM 流式输出多个连续句子时，每句触发一次 `synthesize()` 调用，这些调用全部并发执行，极易超过并发限制，引发 code 10002 错误（"账号当前调用并发超限"），导致部分句子无法合成，用户听到的回复残缺不全。

## What Changes

- 在 `TencentTTSPipeline` 中引入 `asyncio.Queue` 作为 TTS 请求队列，将原来的并发调用改为串行消费：同一时刻最多只有一个活跃的 TTS WebSocket 连接
- 新增一个常驻后台协程 `_worker()`，循环从队列取任务并依次执行 `synthesize()`
- `synthesize()` 方法改为将 `(text, emotion)` 入队，而非直接发起 WebSocket 连接
- `interrupt()` 方法在清空音频播放队列的同时，清空 TTS 请求队列中尚未处理的句子，避免打断后继续播放旧内容

## Capabilities

### New Capabilities

- `tts-serial-queue`: TTS 请求串行队列——通过 asyncio.Queue + 单 worker 协程保证同一时刻只有一个活跃 TTS WebSocket 连接，消除并发超限错误

### Modified Capabilities

- `tts-pipeline`: 打断行为变更——`interrupt()` 除清空播放队列外，还需清空 TTS 请求队列中的待处理句子（现有 spec 的"打断播放"场景需扩展此语义）

## Impact

- **修改文件**：`backend/pipeline/tts/tencent_tts.py`
- **接口兼容**：`synthesize(text, emotion)` 签名不变，`bot.py` 中的调用无需修改
- **并发模型**：从无限并发改为串行队列，消除腾讯云 TTS 并发超限（code 10002）
- **打断语义增强**：打断时同时清空 TTS 队列，避免旧句子在打断后继续排队合成和播放
- **依赖**：无新增外部依赖，仅使用 Python 标准库 `asyncio.Queue`

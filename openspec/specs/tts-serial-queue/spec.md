# TTS Serial Queue

## Purpose

TTS 串行队列负责将多个 TTS 合成请求串行化，保证同一时刻最多只有一个活跃的 TTS WebSocket 连接，消除并发超限错误，并在打断时清空队列避免旧内容继续合成。

## Requirements

### Requirement: TTS 请求串行队列
系统 SHALL 使用 asyncio.Queue 对 TTS 合成请求进行串行化，保证同一时刻最多只有一个活跃的腾讯云 TTS WebSocket 连接，消除并发超限错误（code 10002）。

#### Scenario: 多句并发入队时串行执行
- **WHEN** LLM 流式输出连续多个句子，触发多次 `synthesize()` 调用
- **THEN** 所有句子进入 asyncio.Queue 排队，worker 协程逐一取出并依次建立 TTS WebSocket 连接，同一时刻不超过一个活跃连接

#### Scenario: 队列空时 worker 保持等待
- **WHEN** TTS 队列中没有待处理的句子
- **THEN** worker 协程在队列上阻塞等待，不消耗 CPU，不建立任何 WebSocket 连接

#### Scenario: worker 协程异常自动恢复
- **WHEN** `_worker()` 协程在处理某个句子时发生未预期异常
- **THEN** 系统捕获异常并记录错误日志，worker 协程继续处理队列中的下一个句子，不永久阻塞队列

---

### Requirement: 打断时清空 TTS 队列
系统 SHALL 在收到打断信号时，同时清空 TTS 请求队列中所有尚未开始合成的句子，避免打断后继续合成和播放旧内容。

#### Scenario: 打断时清空待处理句子
- **WHEN** `interrupt()` 被调用（用户新语音输入触发打断）
- **THEN** TTS 请求队列中所有尚未被 worker 取出的句子被丢弃，不再合成也不再播放

#### Scenario: 打断时正在合成的句子立即停止
- **WHEN** `interrupt()` 被调用时 worker 正在执行某个句子的 WebSocket 合成
- **THEN** 当前合成通过 `_interrupt_flag` 提前终止，合成结果不加入播放队列

#### Scenario: 打断后队列接受新句子
- **WHEN** 打断完成后 LLM 重新生成新回复，产生新的句子
- **THEN** 新句子正常入队并被 worker 串行处理，系统恢复正常工作

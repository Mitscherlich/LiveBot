## MODIFIED Requirements

### Requirement: 打断播放
系统 SHALL 在收到打断信号时，停止当前音频播放、清空音频播放队列，并同时清空 TTS 合成请求队列中所有尚未处理的句子，优先处理新的用户输入。

#### Scenario: 打断时停止播放并清空所有队列
- **WHEN** 收到用户新的语音输入（VAD 触发），`interrupt()` 被调用
- **THEN** 系统同时执行：(1) 停止当前 pygame 音频播放；(2) 清空音频播放队列（threading.Queue）；(3) 清空 TTS 请求队列（asyncio.Queue）中所有待合成句子

#### Scenario: 打断后不继续合成旧句子
- **WHEN** 打断发生时 TTS 队列中存在多个待处理句子
- **THEN** 这些句子被全部丢弃，不建立新的 WebSocket 连接，不产生音频输出

#### Scenario: 打断后系统恢复正常工作
- **WHEN** 打断操作完成后新 LLM 输出句子到来
- **THEN** 新句子正常入 TTS 队列，worker 继续处理，播放流程恢复正常

# TTS Pipeline

## Purpose

TTS Pipeline 负责接收 LLM 输出的句子文本和情感标签，调用腾讯云流式 TTS WebSocket 接口合成语音，提取逐字时间戳用于口型同步，并使用 pygame 本地播放音频。

## Requirements

### Requirement: 腾讯云流式 TTS WebSocket 连接
系统 SHALL 使用腾讯云 `TextToStreamAudioWSv2` WebSocket 接口进行流式语音合成，支持逐句文本输入和实时音频输出。

#### Scenario: 建立流式会话
- **WHEN** 收到 `llm_sentence` 事件（LLM 输出完整句子）
- **THEN** 系统建立（或复用）腾讯云 TTS WebSocket 连接，发送文本帧

#### Scenario: 接收音频帧
- **WHEN** 腾讯云 TTS 返回音频二进制帧（PCM 格式）
- **THEN** 系统将音频帧追加到播放队列，实现边合成边播放

#### Scenario: 连接超时自动关闭
- **WHEN** WebSocket 连接 10 分钟内无文本发送
- **THEN** 系统主动关闭连接，下次使用时重新建立

---

### Requirement: 情感参数映射
系统 SHALL 根据 LLM 输出的情感标签，将对应的 `EmotionCategory`、`EmotionIntensity`、`Speed`、`Volume` 参数附加到 TTS 请求。

#### Scenario: 已知情感标签映射
- **WHEN** LLM 输出情感为 `开心 / 悲伤 / 愤怒 / 平静 / 惊讶` 之一
- **THEN** 系统使用预定义映射表选择对应的腾讯云 TTS 情感参数组合

#### Scenario: 未知情感标签 Fallback
- **WHEN** LLM 输出的情感标签不在映射表中
- **THEN** 系统使用 `平静` 情感参数作为默认值

---

### Requirement: 逐字时间戳提取
系统 SHALL 解析腾讯云 TTS 返回的 `subtitles` 字段，提取每个字的 `BeginTime` 和 `EndTime`，用于口型同步。

#### Scenario: 时间戳正常解析
- **WHEN** TTS 返回包含 `subtitles` 数组的 JSON 消息
- **THEN** 系统提取每字的 `{text, beginTime, endTime}`，构建口型时间线

#### Scenario: 时间戳推送到前端
- **WHEN** 音频开始播放（记录 `t0`）
- **THEN** 系统通过 WebSocket 将口型时间线推送至前端，前端按 `t0 + beginTime` 触发口型动作

---

### Requirement: 音频本地播放
系统 SHALL 使用 pygame 播放 TTS 合成的 PCM 音频，支持排队顺序播放多句话。

#### Scenario: 顺序播放
- **WHEN** 播放队列中存在多段音频
- **THEN** 系统按 FIFO 顺序依次播放，不重叠

#### Scenario: 播放完成通知
- **WHEN** 当前音频段播放完毕
- **THEN** 系统发布 `playback_done` 事件，触发下一段播放或口型复位

#### Scenario: 打断播放
- **WHEN** 收到用户新的语音输入（VAD 触发）
- **THEN** 系统清空播放队列，停止当前播放，优先处理新输入

---

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

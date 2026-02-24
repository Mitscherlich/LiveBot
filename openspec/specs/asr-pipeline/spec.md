# ASR Pipeline

## Purpose

ASR Pipeline 负责从麦克风采集 PCM 音频流，通过语音活动检测（VAD）识别语音边界，并使用 SenseVoice-Small 模型完成离线语音识别，将识别文本及用户情感标签发布到事件总线。

## Requirements

### Requirement: VAD 检测语音活动
系统 SHALL 使用 RMS 能量预过滤 + webrtcvad 双门控对麦克风 PCM 音频流进行帧级语音活动检测，识别语音开始和结束边界。

#### Scenario: 检测到语音开始
- **WHEN** 音频帧 RMS 能量 ≥ 阈值 **且** webrtcvad 判定为有语音
- **THEN** 系统将 pre-roll 缓冲帧前置到缓冲区（防截断词头），开始缓冲新音频帧，准备 ASR 推理

#### Scenario: 检测到语音结束
- **WHEN** 连续静音帧持续超过 800ms（默认）
- **THEN** 系统停止缓冲，将已缓冲的音频提交 ASR 推理

#### Scenario: RMS 能量预过滤
- **WHEN** 音频帧 RMS 能量低于配置阈值（默认 2200）
- **THEN** 系统直接判定为静音，跳过 webrtcvad 计算，不纳入 ASR 缓冲区（过滤空调、键盘等环境音）

#### Scenario: 背景噪音过滤
- **WHEN** 音频帧 RMS 能量达标但 webrtcvad 判定为非语音
- **THEN** 系统丢弃该帧，不纳入 ASR 缓冲区

#### Scenario: 短噪音丢弃
- **WHEN** 语音段结束但总语音帧数不足最小时长（默认 300ms）
- **THEN** 系统丢弃该段，不提交 ASR 推理

#### Scenario: 强制提交（打断场景）
- **WHEN** 外部调用 `force_commit()`（如打断逻辑触发）
- **THEN** 系统立即提交当前缓冲区（不等静音超时），若语音帧数达到最小时长则返回音频，否则丢弃并重置

---

### Requirement: VAD Pre-roll 缓冲
系统 SHALL 维护一个循环队列，在语音未激活时持续记录最近 N 帧（默认 3 帧 / 90ms），语音激活时将这些帧前置到缓冲区。

#### Scenario: Pre-roll 前置
- **WHEN** VAD 检测到语音起始
- **THEN** 系统将 pre-roll 队列中的帧前置到缓冲区，确保词语开头不被截断

#### Scenario: Pre-roll 不随重置清空
- **WHEN** 一段语音结束并提交 ASR 后系统重置
- **THEN** pre-roll 队列保留，可供下一段语音使用

---

### Requirement: ASR 模型预加载
系统 SHALL 在服务启动时后台异步预热 SenseVoice-Small 模型，避免第一段语音到达时的首次加载延迟。

#### Scenario: 启动时预加载
- **WHEN** 服务启动（`bot.start()` 执行）
- **THEN** `asyncio.create_task(asr.preload())` 在后台线程中完成模型加载，不阻塞主流程

#### Scenario: 推理与预加载互斥
- **WHEN** 预加载仍在进行中，第一段语音提前到达
- **THEN** 推理等待预加载完成（共享 asyncio.Lock），不重复加载模型

---

### Requirement: SenseVoice-Small 语音识别
系统 SHALL 使用 SenseVoice-Small 模型（通过 funasr 库）对缓冲的音频数据进行离线语音识别，输出识别文本。

#### Scenario: 正常识别
- **WHEN** VAD 触发并提交音频缓冲区（长度 ≥ 0.5s）
- **THEN** 系统在 500ms 内返回识别文本（CPU 模式）

#### Scenario: 识别结果为空
- **WHEN** 音频缓冲区识别结果为空字符串或纯标点
- **THEN** 系统丢弃该结果，不触发后续 LLM 流程

#### Scenario: GPU 加速推理
- **WHEN** 系统检测到可用 CUDA 设备
- **THEN** SenseVoice 自动使用 GPU 推理，识别延迟降至 ≤ 100ms

---

### Requirement: SenseVoice 情感识别结果传递
系统 SHALL 提取 SenseVoice 返回的用户情感标签，随识别文本一同发布到事件总线。

#### Scenario: 情感识别成功
- **WHEN** SenseVoice 返回包含情感标签的结果（如 `<|HAPPY|>`）
- **THEN** 系统将情感标签（如 `happy`）与识别文本一起通过 `asr_result` 事件发布

#### Scenario: 情感识别缺失
- **WHEN** SenseVoice 未返回情感标签
- **THEN** 情感字段默认为 `neutral`，识别文本正常发布

---

### Requirement: 麦克风设备配置
系统 SHALL 支持通过配置指定麦克风设备索引和采样参数。

#### Scenario: 使用默认麦克风
- **WHEN** 配置中未指定设备索引
- **THEN** 系统使用系统默认麦克风，采样率 16000Hz，单声道，16bit PCM

#### Scenario: 指定麦克风设备
- **WHEN** 配置中指定了 `device_index`
- **THEN** 系统使用指定设备进行采集

#### Scenario: 麦克风初始化失败
- **WHEN** 指定的麦克风设备不可用
- **THEN** 系统记录错误日志并回退到默认设备，不崩溃

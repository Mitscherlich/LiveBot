## Context

本项目是一个全新的 AI VTuber 机器人系统，无历史遗留代码。参考 ZerolanLiveRobot 的架构设计，采用更轻量的技术选型：
- ASR 使用本地 faster-whisper，避免对外部 ASR 服务的依赖
- TTS 使用腾讯云 API，获得丰富的中文音色和情感控制能力
- Live2D 渲染迁移到 Web 端，消除 PyQt5/OpenGL 的平台限制
- 记忆系统采用 SQLite + ChromaDB 两层架构，兼顾实时性与长期语义检索

## Goals / Non-Goals

**Goals:**
- 单机可运行的完整 VTuber 机器人，不依赖额外服务器
- 模块解耦：各 pipeline（ASR/LLM/TTS）可独立替换
- Web 管理界面：无需修改代码即可配置所有参数
- 实时口型同步：音频播放时 Live2D 口型随振幅动态响应
- 两层记忆：短期对话上下文 + 长期语义记忆检索

**Non-Goals:**
- 多用户 / 多机器人实例管理
- 直播平台集成（Bilibili / Twitch 弹幕）
- 游戏联动（Minecraft Bot 等）
- 移动端支持

## Decisions

### D1：后端框架选 FastAPI + asyncio

**决策**：使用 FastAPI 作为后端框架，全局使用 asyncio 并发模型。

**理由**：
- ASR（麦克风采集）、LLM（流式输出）、TTS（HTTP 调用）、WebSocket 推送均为 I/O 密集型，asyncio 天然适配
- FastAPI 内置 WebSocket 支持，省去独立 WS 服务器
- Pydantic 与 FastAPI 深度集成，配置校验零成本

**备选**：Flask（同步，需额外线程池）、aiohttp（无内置路由）→ 均不如 FastAPI 综合表现

---

### D2：ASR 使用 SenseVoice-Small 本地推理

**决策**：使用阿里 FunAudioLLM 开源的 `SenseVoice-Small` 替代 faster-whisper，通过 `funasr` 库调用。

**理由**：
- 中文精度优于 Whisper-Large-v3，同参数量下显著优于 Whisper-Small
- 推理速度极快：处理 10s 音频仅需 **~70ms**，比 Whisper-Small 快 5x，比 Whisper-Large 快 15x
- 模型体积小（~230MB），CPU 可流畅运行，无需 GPU
- 内置**情感识别**（愉快/悲伤/愤怒/中性等），可辅助验证 LLM 输出的情感标签
- 支持语言自动检测、语音事件检测（笑声/掌声等）

**备选**：faster-whisper（中文精度稍弱，速度慢，但多语言覆盖更广）→ 降级备用

**VAD 策略**：
- **双门控**：RMS 能量预过滤（默认阈值 2200）+ `webrtcvad` 帧级静音检测（16kHz，30ms 帧）
  - 低能量帧直接跳过 webrtcvad，过滤空调、键盘、门声等环境噪音
- **Pre-roll 缓冲**：循环队列保留最近 3 帧（90ms），语音激活时前置到缓冲区，防截断词头
- **最短时长过滤**：语音段短于 300ms 自动丢弃，避免短噪音触发 ASR
- **force_commit()**：暴露强制提交接口（带 threading.Lock），供打断逻辑在不等静音超时的情况下提交当前缓冲
- 连续静音 800ms 后触发一次 SenseVoice 推理
- SenseVoice 不擅长流式，批量推理质量更好，与 VAD 触发模式天然匹配

**情感辅助用途**：
- SenseVoice 返回的用户情感标签（如"愉快"、"愤怒"）可注入 LLM 上下文
- 示例：`用户语气：[愤怒]，请以安抚的方式回应`

---

### D3：LLM 使用 OpenAI SDK + 统一 provider 接口

**决策**：所有 LLM provider 通过 `openai` SDK 的 `base_url` 参数切换，不为每个 provider 单独实现客户端。

**理由**：
- DeepSeek / Moonshot / 豆包 / 本地 Ollama 均兼容 OpenAI Chat Completions 格式
- 一套代码覆盖所有 provider，新增 provider 只需改配置
- 流式输出（stream=True）统一处理，前端实时接收字幕

**LLM 输出格式约定**：
```json
{"emotion": "开心", "text": "你好呀，今天过得怎么样～"}
```
- system prompt 强制要求 JSON 输出
- 解析失败时 fallback 为 `{"emotion": "平静", "text": <原始输出>}`

---

### D4：TTS 使用腾讯云流式 WebSocket 接口（TextToStreamAudioWSv2）

**决策**：使用腾讯云**流式语音合成 WebSocket 接口**，而非普通 REST API。

**理由**：
- 流式接口支持逐字/逐句发送文本，与 LLM 流式输出天然对齐：LLM 输出一句，立即送入 TTS 合成，无需等待全文完成
- 返回数据同时包含**音频二进制帧** + **逐字时间戳**（`subtitles[].BeginTime/EndTime`），可精确驱动口型同步（见 D7）
- 支持 `EmotionCategory` + `EmotionIntensity` 参数控制情感（仅限多情感音色）
- 注意：流式接口**不支持 SSML**，SSML 仅限普通 REST 接口使用

**情感映射表**：
```python
EMOTION_MAP = {
    "开心": {"EmotionCategory": "happy",   "EmotionIntensity": 150, "Speed": 1.1,  "Volume": 2},
    "悲伤": {"EmotionCategory": "sad",     "EmotionIntensity": 120, "Speed": -1,   "Volume": -2},
    "愤怒": {"EmotionCategory": "angry",   "EmotionIntensity": 150, "Speed": 2,    "Volume": 4},
    "平静": {"EmotionCategory": "neutral", "EmotionIntensity": 100, "Speed": 0,    "Volume": 0},
    "惊讶": {"EmotionCategory": "fear",    "EmotionIntensity": 130, "Speed": 1,    "Volume": 2},
}
```

**流式 TTS 工作模式**：
```
LLM 流式输出（按句分割）
    ↓
建立 WSS 连接（每次对话新建 Session）
    ↓
逐句发送文本帧 → 腾讯云实时合成
    ↓
并行接收：音频二进制帧（PCM）+ 字幕 JSON（逐字时间戳）
    ↓
音频送入播放队列，时间戳用于口型同步
```

**备选**：普通 REST 接口（支持 SSML，但需等待全文合成完毕，延迟高）→ 仅作为降级方案

---

### D5：事件总线使用 pyee AsyncIOEventEmitter

**决策**：用 `pyee.AsyncIOEventEmitter` 作为模块间通信的事件总线。

**理由**：
- 解耦 pipeline 各层：ASR 只负责 emit `asr_result`，不关心谁处理
- 支持 async handler，与 asyncio 无缝集成
- 轻量（纯 Python，无额外进程/线程）

**事件流**：
```
mic_data → vad_triggered → asr_result → llm_response → tts_audio → playback_done
```

---

### D6：记忆系统两层分离

**决策**：SQLite 存短期（最近 50 轮）+ ChromaDB 存长期重要记忆。

**短期记忆（SQLite）**：
- 每轮对话立即写入
- LLM 调用时取最近 10 轮作为 messages 上下文
- 超过 50 轮的旧对话触发长期记忆评估

**长期记忆（ChromaDB）**：
- 异步后台任务：LLM 对超出窗口的对话打重要性分（0-10）
- 分数 ≥ 7 → 向量化写入 ChromaDB
- LLM 调用前：ChromaDB 语义检索 Top-3，拼接到 system prompt

**Embedding 模型**：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`（本地，支持中文，384维）

---

### D7：口型同步使用腾讯云 TTS 逐字时间戳（而非音频振幅分析）

**决策**：利用流式 TTS 接口返回的 `subtitles` 逐字时间戳数据驱动 Live2D 口型，替代音频振幅分析方案。

**理由**：
- 腾讯云流式 TTS 返回每个字的 `BeginTime` / `EndTime`（毫秒级），精确知道每个字的发音时间段
- 相比振幅分析，时间戳方案：精度更高、无需 DSP 分析、CPU 占用更低
- 可进一步扩展为口型形状（元音识别 → 对应 Live2D 口型参数）

**口型同步流程**：
```
腾讯云流式 TTS
    ├── 音频 PCM 帧 → 本地播放（pygame）
    └── subtitles JSON → 提取每字 BeginTime/EndTime
                              ↓
                     构建口型时间线：[{t: 250, open: 1.0}, {t: 570, open: 0}, ...]
                              ↓
                     WS 推送到前端（与音频播放时间对齐）
                              ↓
                     前端按时间戳更新 ParamMouthOpenY
```

**时间戳对齐策略**：
- 记录音频播放开始时刻 `t0`
- 前端收到 `{char, beginTime, endTime}` 后，在 `t0 + beginTime` 时刻驱动口型张开，`t0 + endTime` 时刻闭合

**备选**：后端推送音频振幅 → 实现简单但精度低，口型与发音不严格对齐 → 作为降级方案

---

### D8（更新）：Live2D 渲染使用官方 CubismSdkForWeb

**决策**：使用 Live2D 官方 `CubismSdkForWeb` 替代第三方库 `pixi-live2d-display`。

**理由**：
- `pixi-live2d-display` 自 2023 年起停止维护，存在长期兼容风险
- `CubismSdkForWeb` 由 Live2D 官方持续维护，跟进最新 Cubism 4 SDK
- 底层 `setParameterValueById('ParamMouthOpenY', v)` 等口型 API 与第三方库完全一致，迁移成本低
- 官方 TypeScript Sample 完备，裁剪后约 300-500 行即可覆盖本项目所需功能

**实现策略**：
- 基于官方 Sample 裁剪，保留：模型加载、WebGL 渲染循环、参数控制（口型/表情）、动作播放
- 移除不需要的部分：鼠标跟随视线、多模型管理、对话气泡
- 眨眼/呼吸：使用 Cubism SDK 内置 `CubismBreath` 和 `CubismEyeBlink` 自动驱动，无需后端控制
- 情感动作：根据 WebSocket 收到的 `emotion` 字段触发对应 Motion Group（如 `happy`、`sad`）

**备选**：`pixi-live2d-display`（接入更简单，但已停止维护）→ 仅作快速原型时考虑

---

### D8：配置热重载

**决策**：Web UI 修改配置后，通过 `POST /api/config` 写入 YAML 文件，后端监听文件变化（watchdog）或 API 触发重新加载，无需重启进程。

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| faster-whisper CPU 模式延迟高（3-5s/句） | ASR 响应慢，对话体验差 | 默认推荐 tiny/base 模型（<1s），有 GPU 时自动使用 cuda |
| LLM JSON 输出格式不稳定 | 情感解析失败 | Fallback 策略 + retry prompt；限制 temperature ≤ 0.8 |
| 腾讯云 TTS 网络延迟 | 回复播放卡顿 | TTS 调用与 LLM 流式输出并发：收到完整句子立即发 TTS，不等全文 |
| ChromaDB embedding 首次加载慢（~3s） | 启动时间长 | 后台异步预加载，不阻塞主流程 |
| SenseVoice 首次推理需加载模型（~3-5s） | 第一句响应极慢 | 服务启动时 `asyncio.create_task(asr.preload())` 后台预热，与 embedder 并发加载 |
| RMS 阈值过高误丢语音 | 正常说话被忽略 | 默认值 2200 保守，用户可在 Settings 页实时调低；日志输出 `energy=xxx` 供校准 |
| WebSocket 音频振幅数据量大 | 前端性能压力 | 降采样：每 50ms 推送一次振幅平均值，而非逐帧推送 |
| pixi-live2d-display 模型版权 | Live2D 模型需合规 | 文档说明用户需自行准备合规模型，项目不内置商业模型 |

## Open Questions

- [x] ~~faster-whisper 是否支持实时流式 VAD + 识别？~~ → 已弃用，ASR 改为 SenseVoice-Small，批量推理 ~70ms/句，延迟可接受
- [x] ~~腾讯云 TTS 是否支持 SSML 情感标签？~~ → 已确认：流式接口不支持 SSML，情感通过 `EmotionCategory` + `EmotionIntensity` API 参数控制；SSML 仅普通 REST 接口支持
- [x] ~~ChromaDB 重要性评分是调用 LLM 完成还是用简单规则？~~ → 已确认：全程使用 LLM 打分，单次消耗约 200 tokens，DeepSeek 费用可忽略（¥0.02/小时），换取语义级精度
- [x] ~~Live2D 眨眼/呼吸动画是否需要后端推送控制信号？~~ → 已确认：前端驱动，pixi-live2d-display 内置 AutoBlink/AutoBreath 效果已足够自然，无需后端介入
- [ ] 腾讯云流式 TTS 的 `subtitles` Phoneme 字段是否足以区分元音/辅音，从而实现更精细的口型形状映射？

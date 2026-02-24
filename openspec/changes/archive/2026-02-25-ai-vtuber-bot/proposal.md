## Why

开源 AI VTuber 框架（如 ZerolanLiveRobot）部署复杂、依赖繁多。本项目旨在构建一个易于部署的 AI 虚拟主播系统，ASR 采用本地 faster-whisper 离线推理保障隐私，TTS 使用腾讯云语音合成 API 获得丰富音色，结合 Web Live2D 渲染和两层记忆架构，让用户快速搭建完整 VTuber 机器人。

## What Changes

- 新增 VAD + 本地 ASR 语音识别管道（webrtcvad + SenseVoice-Small 本地离线推理）
- 新增 OpenAI 兼容 LLM 对话生成（支持 DeepSeek / Moonshot / 豆包等 provider）
- 新增情感化 TTS 语音合成（LLM 输出情感标签 → 腾讯云 TTS 音色映射）
- 新增 Web Live2D 渲染窗口，基于 Web Audio API 实现实时口型同步
- 新增两层记忆系统：SQLite 存储最近 N 轮对话，ChromaDB 向量库存储长期重要记忆
- 新增 Web 管理页面：配置 LLM provider、ASR/TTS API Key、角色人设、Live2D 模型

## Capabilities

### New Capabilities

- `asr-pipeline`: VAD 语音活动检测 + 本地 SenseVoice-Small 离线语音识别，将麦克风 PCM 流转换为文本，内置情感识别，无需 API Key
- `llm-pipeline`: 基于 OpenAI 兼容接口的流式 LLM 对话生成，支持多 provider 切换，输出 JSON 格式（含情感标签）
- `tts-pipeline`: 情感化 TTS 语音合成，根据 LLM 输出的情感标签选择对应腾讯云 TTS 音色和韵律参数
- `live2d-renderer`: Web 端 Live2D 模型渲染，通过 WebSocket 接收音频振幅数据驱动实时口型同步
- `memory-system`: 两层记忆架构——SQLite 短期对话窗口 + ChromaDB 向量长期记忆，含重要性评分与语义检索
- `web-admin-ui`: React 管理页面，支持配置 LLM/ASR/TTS provider、API Key、角色人设、Live2D 模型上传

### Modified Capabilities

（无，全新项目）

## Impact

**新增依赖**：
- Python：`fastapi`, `uvicorn`, `pydantic-settings`, `aiosqlite`, `chromadb`, `sentence-transformers`, `pyaudio`, `webrtcvad`, `funasr`, `pygame`, `httpx`, `openai`, `pyee`, `pyyaml`, `loguru`
- Node/前端：`react`, `vite`, `CubismSdkForWeb`（官方，含 WebGL 渲染）, `shadcn/ui`, `zustand`

**外部服务依赖**：
- ASR：本地 SenseVoice-Small 模型（通过 funasr 加载，~230MB，CPU 可流畅运行，无需 API Key）
- TTS：腾讯云语音合成 TTS API（需 SecretId / SecretKey）
- LLM：任意 OpenAI 兼容接口（DeepSeek / Moonshot / 豆包 / 自托管，需 API Key）

**系统边界**：
- 后端 FastAPI 服务运行在本地，通过 WebSocket 与前端 Live2D 渲染页实时通信
- 配置以 YAML 文件持久化，通过 Web UI 读写
- ChromaDB 以本地文件模式运行，无需单独部署

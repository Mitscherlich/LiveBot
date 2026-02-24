## 1. 项目初始化

- [x] 1.1 创建项目目录结构：`backend/`、`frontend/`、`models/`
- [x] 1.2 初始化 Python 项目（`pyproject.toml` 或 `requirements.txt`），添加全部依赖
- [x] 1.3 初始化 React + Vite 前端项目，配置 TypeScript
- [x] 1.4 创建 `config.yaml` 模板，定义所有配置项占位符
- [x] 1.5 实现 `config.py`：Pydantic Settings 读取 `config.yaml`，支持热重载

## 2. 事件总线与核心框架

- [x] 2.1 实现 `core/event_bus.py`：基于 `pyee.AsyncIOEventEmitter`，定义所有事件类型枚举
- [x] 2.2 实现 `core/bot.py`：`VTuberBot` 主控制器，负责启动和编排各模块
- [x] 2.3 实现 `main.py`：FastAPI 应用入口，挂载路由，启动 uvicorn
- [x] 2.4 实现 `api/ws_live2d.py`：WebSocket 端点 `/ws/live2d`，管理前端连接池，支持广播

## 3. ASR 管道

- [x] 3.1 实现 `devices/microphone.py`：pyaudio 麦克风采集，16kHz 单声道 PCM，支持设备索引配置
- [x] 3.2 实现 `pipeline/asr/vad.py`：RMS 能量预过滤 + webrtcvad 双门控（30ms 帧），Pre-roll 缓冲防截断，连续静音 800ms 触发采集结束，支持 `force_commit()` 强制提交
- [x] 3.3 实现 `pipeline/asr/sensevoice.py`：funasr 加载 SenseVoice-Small，支持 CPU/CUDA 自动选择，提供 `preload()` 方法供启动时后台预热
- [x] 3.4 实现 ASR 结果发布：识别文本 + 情感标签一并通过 `asr_result` 事件发布到事件总线
- [x] 3.5 验证：对麦克风说话，控制台正确打印识别文本和情感标签

## 4. LLM 管道

- [x] 4.1 实现 `pipeline/llm/openai_llm.py`：openai SDK 封装，支持 `base_url` 切换 provider，stream=True
- [x] 4.2 实现 `manager/prompt_manager.py`：构建 system prompt（角色名+人设+长期记忆注入）
- [x] 4.3 实现对话历史管理：从 SQLite 读取最近 10 轮，拼入 messages
- [x] 4.4 实现流式输出处理：按句子边界（`。！？\n`）切割，发布 `llm_sentence` 事件
- [x] 4.5 实现 JSON 输出解析：提取 `emotion` 和 `text`，解析失败时 fallback 到平静情感
- [x] 4.6 实现用户情感注入：将 ASR 返回的情感标签追加到 user message 末尾
- [x] 4.7 验证：输入文本后，控制台正确打印 LLM 流式输出和解析出的情感标签

## 5. TTS 管道

- [x] 5.1 实现 `pipeline/tts/tencent_tts.py`：腾讯云 `TextToStreamAudioWSv2` WebSocket 客户端
- [x] 5.2 实现情感参数映射表：5 种情感 → `EmotionCategory`、`EmotionIntensity`、`Speed`、`Volume`
- [x] 5.3 实现音频帧接收与播放队列：PCM 帧追加到 pygame 播放队列，FIFO 顺序播放
- [x] 5.4 实现逐字时间戳提取：解析 `subtitles` JSON，构建口型时间线 `[{char, beginTime, endTime}]`
- [x] 5.5 实现口型时间线推送：记录播放开始时刻 `t0`，通过 WebSocket 推送 `{type: "lip_sync", timeline, t0}`
- [x] 5.6 实现打断逻辑：VAD 触发新输入时，清空播放队列，停止当前播放
- [x] 5.7 实现字幕推送：通过 WebSocket 推送 `{type: "subtitle", text, emotion}`
- [x] 5.8 验证：LLM 输出后，语音正常播放，WebSocket 收到口型时间线和字幕消息

## 6. 记忆系统

- [x] 6.1 实现 `memory/short_term.py`：aiosqlite 建表，写入 `{role, content, emotion, timestamp}`，查询最近 10 轮
- [x] 6.2 实现滚动窗口触发：对话总数超 50 时，异步触发长期记忆评估
- [x] 6.3 实现 `memory/embedder.py`：加载 `paraphrase-multilingual-MiniLM-L12-v2`，提供 `embed(text)` 接口，启动时后台预加载
- [x] 6.4 实现 `memory/long_term.py`：ChromaDB 本地文件模式初始化，`add(text, vector)`、`query(vector, top_k=3)` 接口
- [x] 6.5 实现重要性评分：异步调用 LLM 对超窗口对话打分（0-10），分数 ≥ 7 写入 ChromaDB
- [x] 6.6 实现记忆检索注入：LLM 请求前 ChromaDB 语义检索 Top-3，拼接到 system prompt
- [ ] 6.7 验证：多轮对话后，长期记忆被正确写入，检索结果注入 LLM 上下文

## 7. Live2D 渲染（前端）

- [x] 7.1 集成 CubismSdkForWeb：下载官方 SDK，裁剪 Sample，保留模型加载、WebGL 渲染循环、参数控制
- [x] 7.2 实现 `Live2DCanvas.tsx`：WebGL Canvas 组件，封装 Cubism SDK 初始化和渲染循环
- [x] 7.3 实现模型加载：从后端 `/models/{name}/` 静态路径加载 `.model3.json` 及配套资源
- [x] 7.4 启用内置待机动画：配置 `CubismBreath` 和 `CubismEyeBlink` 自动驱动
- [x] 7.5 实现口型同步：接收 WebSocket `lip_sync` 消息，用 `requestAnimationFrame` 按时间戳调度 `ParamMouthOpenY` 更新
- [x] 7.6 实现情感动作：接收 WebSocket `subtitle` 中的 `emotion` 字段，触发对应 Motion Group
- [x] 7.7 实现 WebSocket 客户端：连接 `ws://localhost:8000/ws/live2d`，断线自动重连（指数退避，最多 5 次）
- [x] 7.8 实现字幕显示：在 Canvas 下方渲染字幕文本，淡入淡出动画
- [ ] 7.9 验证：TTS 播放时，Live2D 口型与语音同步，情感动作正确触发

## 8. Web 管理 UI（前端）

- [x] 8.1 搭建 React 路由：Dashboard / Settings / Character 三个页面
- [x] 8.2 实现 LLM 配置页：Provider 下拉（DeepSeek/Moonshot/豆包/自定义）、API Key、Base URL、模型名、测试连接按钮
- [x] 8.3 实现 ASR 配置页：模型规格选择（tiny/base/small/medium）、VAD 灵敏度滑块、环境音能量阈值滑块（500-5000）、语音前置缓冲帧数滑块（1-6 帧）、麦克风设备下拉
- [x] 8.4 实现 TTS 配置页：SecretId/SecretKey 输入、VoiceType 选择、试听按钮
- [x] 8.5 实现角色配置页：名称输入、人设文本域、Live2D 模型文件上传（zip 或多文件）
- [x] 8.6 实现配置读取：页面加载时 `GET /api/config` 拉取当前配置回填表单
- [x] 8.7 实现配置保存：`POST /api/config` 提交，后端写入 YAML，前端展示成功/错误提示
- [x] 8.8 实现后端配置 API：`GET /api/config` 读取 YAML，`POST /api/config` 校验并写入，触发模块热重载

## 9. 系统集成与联调

- [x] 9.1 集成完整事件链路：麦克风 VAD → ASR → LLM → TTS → 播放 + 口型同步端到端联通
- [x] 9.2 实现模块热重载：配置保存后，LLM/TTS/角色模块在下次调用时生效，ASR 采集线程重启
- [x] 9.3 实现模型静态文件服务：FastAPI 挂载 `/models/` 目录，供前端加载 Live2D 资源
- [x] 9.4 实现 Live2D 模型上传接口：`POST /api/models/upload`，解压到 `models/` 目录
- [ ] 9.5 验证 Dashboard 状态页：实时显示 ASR/LLM/TTS 各模块运行状态和最近日志

## 10. 收尾与打包

- [x] 10.1 编写 `README.md`：环境要求、安装步骤、配置说明、启动命令
- [x] 10.2 添加 `.env.example`：列出所有需要填写的 API Key 占位符
- [x] 10.3 前端构建：`vite build` 输出到 `backend/static/`，由 FastAPI 统一服务
- [ ] 10.4 端到端测试：完整对话流程（语音输入 → 识别 → LLM 回复 → TTS 播放 → 口型同步）无报错运行 30 分钟

# Amber

基于 SenseVoice（ASR）+ OpenAI 兼容 LLM + 腾讯云 TTS + Live2D（CubismSdkForWeb）的本地可运行虚拟主播机器人。

## 系统要求

| 组件 | 要求 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |
| 麦克风 | 支持 16kHz 采样的设备 |
| GPU（可选） | CUDA 兼容，加速 ASR 推理 |

## 安装步骤

### 1. 克隆项目

```bash
git clone <repo-url>
cd livebot
```

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

### 4. 安装 Live2D CubismSdkForWeb（可选）

> 参考 `frontend/public/live2d/SETUP.md` 安装 SDK 后，Live2D 渲染功能才可用。

### 5. 配置

复制配置模板：

```bash
cp backend/config.yaml.example backend/config.yaml
```

编辑 `backend/config.yaml`，填写必要的 API Key（或直接在 Web 界面配置）。

## 启动

### 开发模式（两个终端）

**终端 1 — 后端：**
```bash
cd backend
python main.py
```

**终端 2 — 前端（热更新）：**
```bash
cd frontend
npm run dev
```

访问 http://localhost:5173 进入管理界面。

### 生产模式

```bash
# 构建前端
cd frontend
npm run build

# 启动后端（同时服务前端静态文件）
cd backend
python main.py
```

访问 http://localhost:8000

## 配置说明

所有配置均可在 Web 管理界面（`/settings`）中完成，无需手动编辑文件。

| 配置项 | 说明 |
|--------|------|
| LLM Provider | 支持 DeepSeek / Moonshot / 豆包 / 自定义 OpenAI 兼容接口 |
| ASR 模型规格 | tiny/base/small/medium，推荐 small |
| TTS 凭证 | 腾讯云 SecretId + SecretKey |
| 角色名称/人设 | 注入 LLM system prompt |
| Live2D 模型 | 在「角色配置」页上传 .zip 或多文件 |

## 项目结构

```
livebot/
├── backend/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # Pydantic 配置模型
│   ├── config.yaml          # 运行时配置（不纳入版本控制）
│   ├── core/
│   │   ├── bot.py           # 主控制器，编排各模块
│   │   └── event_bus.py     # AsyncIO 事件总线
│   ├── pipeline/
│   │   ├── asr/             # 语音识别（SenseVoice + VAD）
│   │   ├── llm/             # LLM（OpenAI SDK）
│   │   └── tts/             # TTS（腾讯云流式）
│   ├── memory/
│   │   ├── short_term.py    # SQLite 短期记忆
│   │   ├── long_term.py     # ChromaDB 长期记忆
│   │   └── embedder.py      # 向量嵌入
│   ├── api/
│   │   ├── ws_live2d.py     # WebSocket 端点
│   │   ├── config_api.py    # 配置 REST API
│   │   └── models_api.py    # 模型上传 API
│   └── devices/
│       └── microphone.py    # 麦克风采集
├── frontend/
│   └── src/
│       ├── pages/           # Dashboard / Settings / Character / Live2DView
│       ├── components/      # Live2DCanvas / SubtitleDisplay
│       └── lib/             # WebSocket 客户端 / Cubism 渲染器
└── models/                  # Live2D 模型文件（用户上传）
```

## 技术栈

- **后端**：FastAPI + asyncio + pyee (事件总线)
- **ASR**：FunASR SenseVoice-Small + webrtcvad
- **LLM**：openai SDK（兼容多 provider）
- **TTS**：腾讯云 TextToStreamAudioWSv2 WebSocket
- **记忆**：aiosqlite（短期）+ ChromaDB（长期）+ sentence-transformers
- **前端**：React 19 + Vite + TypeScript + Tailwind CSS
- **Live2D**：CubismSdkForWeb（官方 SDK）

## 许可

本项目代码采用 MIT 许可证。Live2D 模型文件需遵守 [Live2D 专有软件许可协议](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)。

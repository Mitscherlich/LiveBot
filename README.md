# Amber

基于 SenseVoice（ASR）+ OpenClaw Gateway（LLM）+ 腾讯云 TTS + Live2D（CubismSdkForWeb）的本地可运行虚拟主播机器人。

## 系统要求

| 组件 | 要求 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |
| OpenClaw | 已安装并运行 Gateway |
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

### 5. 启动 OpenClaw Gateway

```bash
openclaw gateway --port 18789
```

Token 存储在 `~/.openclaw/openclaw.json` 的 `gateway.auth.token` 字段。

### 6. 配置

复制配置模板：

```bash
cp backend/config.yaml.example backend/config.yaml
```

编辑 `backend/config.yaml`，填写 OpenClaw Token（或直接在 Web 界面配置）。

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

所有配置均可在 Web 管理界面中完成，无需手动编辑文件。

### 应用配置 (`/settings`)

| 配置项 | 说明 |
|--------|------|
| OpenClaw URL | Gateway 地址，默认 `http://localhost:18789` |
| OpenClaw Token | Gateway 认证 Token |
| OpenClaw Session Key | 会话标识，用于区分不同对话上下文 |
| ASR 模型规格 | tiny/base/small/medium，推荐 small |
| TTS 凭证 | 腾讯云 SecretId + SecretKey |
| 角色名称/人设 | 注入 LLM system prompt |
| Live2D 模型 | 在「角色配置」页上传 .zip 或多文件 |

### 系统配置 (`/system`)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 监听地址 | HTTP 服务器绑定地址 | `127.0.0.1` |
| 端口 | HTTP 服务器端口 | `8000` |

**监听地址选项：**
- **仅本地访问 (127.0.0.1)**: 只允许本机访问，安全性最高
- **允许所有网络接口 (0.0.0.0)**: 允许局域网内其他设备访问
- **自定义 IP 地址**: 绑定到特定 IP 地址

> **注意**: 修改系统配置后需要重启服务才能生效。

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
│   │   ├── llm/             # LLM（OpenClaw Gateway SSE 流式）
│   │   └── tts/             # TTS（腾讯云流式）
│   ├── api/
│   │   ├── ws_live2d.py     # WebSocket 端点
│   │   ├── config_api.py    # 配置 REST API
│   │   └── chat_api.py      # 聊天 REST API
│   └── devices/
│       └── microphone.py    # 麦克风采集
├── frontend/
│   └── src/
│       ├── pages/           # Settings / Live2DView / Chat
│       ├── components/      # Live2DCanvas / MessageBubble
│       └── lib/             # WebSocket 客户端 / Cubism 渲染器
└── models/                  # Live2D 模型文件（用户上传）
```

## 技术栈

- **后端**：FastAPI + asyncio + pyee（事件总线）
- **ASR**：FunASR SenseVoice-Small + webrtcvad
- **LLM**：OpenClaw Gateway（HTTP `/v1/chat/completions` + SSE 流式）
- **TTS**：腾讯云 TextToStreamAudioWSv2 WebSocket
- **前端**：React 19 + Vite + TypeScript
- **Live2D**：CubismSdkForWeb（官方 SDK）

## 许可

本项目代码采用 MIT 许可证。Live2D 模型文件需遵守 [Live2D 专有软件许可协议](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)。

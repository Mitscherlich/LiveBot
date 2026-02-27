## Why

Dashboard 状态页的"实时事件日志"区域目前只能收到 `subtitle`、`lip_sync`、`playback_done` 三类 WebSocket 事件，而 ASR 识别结果、LLM 推理过程、TTS 合成中间状态以及 loguru 内部日志（INFO/DEBUG）完全无法在前端呈现，导致排查问题时只能查 Server 终端，用户体验严重缺失。

## What Changes

- 后端新增 loguru sink，将 `INFO` 及以上级别的日志捕获并通过 WebSocket 实时推送到前端（新消息类型 `log_entry`）
- 后端在 `ws_live2d.py` 中补充对 `ASR_RESULT`、`LLM_CHUNK`/`LLM_SENTENCE`/`LLM_DONE`、`TTS_AUDIO_FRAME`（可选）等事件的广播，覆盖 ASR→LLM→TTS 全链路
- 前端 Dashboard 实时日志区域订阅新增的 `log_entry` 消息，按 level（INFO/DEBUG/WARNING/ERROR）着色展示，支持按模块（ASR/LLM/TTS/SYSTEM）过滤
- 前端对日志条目做滚动缓冲（最多 200 条），超出时自动丢弃旧条目

## Capabilities

### New Capabilities

- `realtime-log-streaming`: 后端 loguru 日志实时捕获并通过现有 `/ws/live2d` WebSocket 推送到前端，前端 Dashboard 订阅展示，支持级别着色与模块过滤

### Modified Capabilities

<!-- 无现有 spec 需要修改 -->

## Impact

- **backend/api/ws_live2d.py** — 新增 loguru sink 注册逻辑和 `ASR_RESULT`、`LLM_SENTENCE`、`LLM_DONE` 事件广播
- **backend/main.py** 或启动入口 — 注册 loguru sink（在 app 启动时）
- **frontend/src/pages/Dashboard.tsx** — 消费新 `log_entry` 消息类型，增加过滤 UI
- **frontend/src/lib/websocket.ts** — `WsMessage` 类型扩展（加入 `log_entry` 类型）
- 无新依赖，不引入破坏性变更

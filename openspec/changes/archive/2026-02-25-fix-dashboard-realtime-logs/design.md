## Context

当前系统使用 loguru 记录 ASR/LLM/TTS 各模块的运行日志，这些日志仅输出到 Server 终端（stderr）。前端 Dashboard 通过现有 `/ws/live2d` WebSocket 接收部分结构化事件（`subtitle`、`lip_sync`、`playback_done`），但 `ASR_RESULT`、`LLM_SENTENCE`、`LLM_DONE` 等事件未广播，且 loguru 的内部日志（INFO/DEBUG/WARNING/ERROR）完全未传输到前端。实时日志区域因此显示"等待事件..."，无法排查问题。

项目约束：
- 后端：FastAPI + loguru + pyee 事件总线（AsyncIOEventEmitter）
- 前端：React + TypeScript，已有单例 `Live2DWebSocket`（`/ws/live2d`）
- 不引入新的外部依赖；不破坏现有 Live2D 帧同步逻辑

## Goals / Non-Goals

**Goals:**
- ASR→LLM→TTS 全链路事件均广播到前端（通过现有 `/ws/live2d`）
- loguru INFO+ 日志以新 `log_entry` 消息类型实时推送到前端
- 前端 Dashboard 展示带级别着色与模块过滤的日志列表（最多 200 条）

**Non-Goals:**
- 日志持久化或历史查询
- 新增独立的 SSE 或 Log 专用 WebSocket 端点
- DEBUG 级别日志推送到前端（避免消息风暴）
- 二进制音频帧（`TTS_AUDIO_FRAME`）推送到前端

## Decisions

### 决策 1：复用 `/ws/live2d` 而非新建日志端点

**选择**：在现有 WebSocket 连接池中新增 `log_entry` 消息类型。

**理由**：
- 前端已有单例 `Live2DWebSocket` 做断线重连，无需额外管理第二条连接
- 避免跨域、认证、端口等额外复杂度
- `broadcast()` 函数已经做连接健壮性处理（dead 连接清理）

**备选方案**：新增 `/ws/logs` 端点。被排除——增加前端连接管理复杂度，且对 Dashboard 并无额外收益。

---

### 决策 2：loguru sink 注册时机

**选择**：在 `backend/api/ws_live2d.py` 模块级别定义 sink 函数，在 `backend/main.py` lifespan 的启动阶段用 `logger.add()` 注册，`level="INFO"`。

**理由**：
- lifespan 启动时 `_connections` 连接池已初始化，sink 可安全引用 `broadcast()`
- 与现有路由注册风格一致，无需改变模块边界

**备选方案**：在模块 import 时直接 `logger.add()`。被排除——模块加载时连接池尚未运行，且测试时难以卸载 sink。

---

### 决策 3：日志消息结构

```json
{
  "type": "log_entry",
  "level": "INFO",
  "module": "asr",
  "message": "[ASR] 识别结果: hello  情感: happy",
  "time": "12:34:56"
}
```

**module 字段来源**：loguru record 中的 `name`（即 Python 模块名），通过简单映射规则提取（含 `asr` → `ASR`，含 `llm` → `LLM`，含 `tts` → `TTS`，其余 → `SYSTEM`）。

**理由**：结构化字段让前端可按 level/module 过滤，无需解析 message 字符串。

---

### 决策 4：前端日志缓冲策略

**选择**：最多保留 200 条，超出时丢弃最旧的（FIFO 队列头部）。

**理由**：50 条上限对频繁 TTS 场景不够用（一句话可产生多条 LLM_CHUNK log），200 条覆盖约 5 分钟正常对话且不引起内存压力。

## Risks / Trade-offs

- **[风险] 高频日志导致 WS 消息堆积** → 仅推送 INFO+ 级别，并在 sink 中对 DEBUG 过滤；如未来需要更细粒度控制，可在 sink 内加速率限制（asyncio.Queue + drain）
- **[风险] sink 在 WebSocket 断开时仍尝试写入** → `broadcast()` 已有 dead 连接清理逻辑，sink 异常不会崩溃主进程（loguru sink 异常被 loguru 捕获）
- **[trade-off] 日志与 Live2D 帧共用同一 WS** → 消息量增大但均为文本，不影响二进制音频帧（音频帧不经 WS 传输）；实测 100msg/s 以内无感知延迟

## Migration Plan

1. 修改 `backend/api/ws_live2d.py`：补充事件监听（ASR_RESULT, LLM_SENTENCE, LLM_DONE）+ 定义 `log_sink` 函数
2. 修改 `backend/main.py`：在 lifespan 启动处调用 `logger.add(log_sink, level="INFO")`
3. 修改 `frontend/src/lib/websocket.ts`：`WsMessage` union 类型加入 `log_entry`
4. 修改 `frontend/src/pages/Dashboard.tsx`：消费 `log_entry`，增加过滤 UI

**回滚**：移除 `logger.add()` 调用和前端对 `log_entry` 的处理即可，不影响其他功能。

## Open Questions

- 是否需要对 loguru sink 做速率限制（例如每秒最多 20 条）？当前认为 INFO 级别频率可控，暂不实现，可按需后续添加。

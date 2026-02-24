## 1. 后端：补充事件广播

- [ ] 1.1 在 `backend/api/ws_live2d.py` 中为 `Event.ASR_RESULT` 注册 `@bus.on` 监听器，广播 `{"type": "asr_result", ...data}` 消息
- [ ] 1.2 在 `backend/api/ws_live2d.py` 中为 `Event.LLM_SENTENCE` 注册监听器，广播 `{"type": "llm_sentence", ...data}` 消息
- [ ] 1.3 在 `backend/api/ws_live2d.py` 中为 `Event.LLM_DONE` 注册监听器，广播 `{"type": "llm_done"}` 消息

## 2. 后端：loguru sink 实现

- [ ] 2.1 在 `backend/api/ws_live2d.py` 中定义 `_derive_module(name: str) -> str` 辅助函数，将 loguru record 的 `name` 字段映射到 `ASR / LLM / TTS / SYSTEM`
- [ ] 2.2 在同文件中定义异步 `log_sink(message)` 函数，从 loguru record 提取 `level`、`module`（调用上一步函数）、`message`、`time`，并调用 `broadcast({"type": "log_entry", ...})`
- [ ] 2.3 在 `backend/main.py` 的 `lifespan` 启动阶段（`await bot.start()` 之后）调用 `logger.add(log_sink, level="INFO", format="{message}")`，注册 loguru sink

## 3. 前端：类型定义扩展

- [ ] 3.1 在 `frontend/src/lib/websocket.ts` 的 `WsMessage` union 类型中新增 `log_entry` 成员：`{ type: "log_entry"; level: string; module: string; message: string; time: string }`

## 4. 前端：Dashboard 日志展示

- [ ] 4.1 在 `frontend/src/pages/Dashboard.tsx` 的 `LogEntry` interface 中新增 `level` 和 `module` 字段
- [ ] 4.2 在 `ws.onMessage` 回调中处理 `msg.type === "asr_result"`，生成 `{ type: "ASR", ... }` LogEntry
- [ ] 4.3 在 `ws.onMessage` 回调中处理 `msg.type === "llm_sentence"`，生成 `{ type: "LLM", ... }` LogEntry
- [ ] 4.4 在 `ws.onMessage` 回调中处理 `msg.type === "llm_done"`，生成 `{ type: "LLM", message: "生成完成" }` LogEntry
- [ ] 4.5 在 `ws.onMessage` 回调中处理 `msg.type === "log_entry"`，使用 `msg.module` 和 `msg.message` 生成 LogEntry，按 `msg.level` 设置着色 class
- [ ] 4.6 将日志缓冲上限从 50 条（`MAX_LOGS`）调整为 200 条

## 5. 前端：模块过滤 UI

- [ ] 5.1 在 Dashboard 组件中新增 `filterModule` state（`string`，默认 `"ALL"`）
- [ ] 5.2 在实时日志区域标题行新增过滤按钮组（ALL / ASR / LLM / TTS / SYSTEM），点击更新 `filterModule`
- [ ] 5.3 日志列表渲染时按 `filterModule` 过滤（`filterModule === "ALL"` 时不过滤）

## 6. 前端：日志条目着色

- [ ] 6.1 在日志列表渲染中，根据 `log.level`（ERROR/WARNING/INFO）或 `log.type`（ASR/LLM/TTS）应用对应 Tailwind 着色 class，与现有着色逻辑合并

## 1. 配置层重构

- [x] 1.1 在 `backend/config.py` 中新增 `OpenClawConfig` Pydantic 模型，包含 `url`（默认 `http://localhost:18789`）、`token`（默认空）、`session_key`（默认 `main`）、`timeout_ms`（默认 120000）
- [x] 1.2 在 `AppConfig` 中用 `openclaw: OpenClawConfig` 替换 `llm: LLMConfig`，移除 `memory: MemoryConfig` 和 `tools: ToolsConfig` 字段
- [x] 1.3 更新 `backend/config.yaml`：移除 `llm` / `memory` / `tools` 节点，新增 `openclaw` 节点示例配置
- [x] 1.4 保存旧配置为 `config.yaml.bak`，供回滚参考

## 2. OpenClaw LLM Pipeline 实现

- [x] 2.1 新建 `backend/pipeline/llm/openclaw_llm.py`，定义 `OpenClawLLMPipeline` 类继承 `BaseLLMPipeline`，`set_tool_registry` / `_get_long_term_context` 实现为 no-op
- [x] 2.2 实现 `generate()` 方法：用 `httpx.AsyncClient.stream()` 向 `<url>/v1/chat/completions` 发起 POST，携带 `Authorization: Bearer <token>`、`stream: true`
- [x] 2.3 实现 SSE 行解析：按行读取 `data: ...`，跳过 `[DONE]`，提取 `choices[0].delta.content`
- [x] 2.4 实现"首个 `}` 探测"情感 JSON 解析：缓冲到第一个 `}` 后尝试解析，提取 `emotion`，失败时 fallback `"平静"`
- [x] 2.5 实现句子边界切割（`。！？\n`）和 `LLM_SENTENCE` 事件发布，流结束时处理剩余缓冲并发布 `LLM_DONE`
- [x] 2.6 实现用户情感注入：`user_emotion` 非 `neutral`/空时在 user message 末尾附加 `[用户语气：<mapped_emotion>]`
- [x] 2.7 实现错误处理：连接拒绝、HTTP 4xx/5xx、超时时记录 ERROR/WARNING 日志并发布 `LLM_DONE`，不抛出异常
- [x] 2.8 在 `pipeline/llm/__init__.py` 的 `create_llm_pipeline()` 工厂中增加 `provider == "openclaw"` 分支，返回 `OpenClawLLMPipeline`

## 3. Gateway 连通性探针

- [x] 3.1 在 `backend/core/bot.py` 的 `start()` 方法中，启动时向 `<openclaw.url>/probe` 发送 `GET` 请求；成功则 INFO 日志"OpenClaw Gateway 连接正常"，失败则 ERROR 日志并继续启动（降级运行）

## 4. 移除记忆系统

- [x] 4.1 删除 `backend/memory/` 目录（short_term.py、long_term.py、embedder.py、`__init__.py`）
- [x] 4.2 从 `backend/core/bot.py` 中移除 `ShortTermMemory`、`LongTermMemory`、`Embedder` 的导入与初始化逻辑
- [x] 4.3 从 `backend/core/bot.py` 中移除 `maybe_promote` 调用和 `PLAYBACK_DONE` 事件处理中的记忆逻辑
- [x] 4.4 删除 `backend/api/memory_api.py`，从 `backend/main.py` 中移除对应路由注册

## 5. 移除工具与技能系统

- [x] 5.1 删除 `backend/tools/` 目录（registry.py、file_tool.py、web_tool.py、`__init__.py`）
- [x] 5.2 删除 `backend/skills/` 目录（base.py、loader.py、builtin/、`__init__.py`）
- [x] 5.3 从 `backend/core/bot.py` 中移除 `tool_registry`、`SkillLoader` 的导入与初始化逻辑
- [x] 5.4 从 `backend/pipeline/llm/base.py` 中移除 `set_tool_registry()` 和 `_has_tools()` 的实质性实现（保留空方法签名以兼容 `OpenClawLLMPipeline`）

## 6. 移除旧 LLM Pipeline

- [x] 6.1 删除 `backend/pipeline/llm/openai_llm.py`
- [x] 6.2 删除 `backend/pipeline/llm/anthropic_llm.py`
- [x] 6.3 删除 `backend/pipeline/llm/tool.py`（ToolSpec / ToolCall 定义）
- [x] 6.4 删除 `backend/providers/__init__.py`（Provider 注册表）

## 7. 精简依赖

- [x] 7.1 从 `backend/requirements.txt` 中移除：`chromadb`、`sentence-transformers`、`aiosqlite`、`anthropic`、`torch`、`torchaudio`
- [x] 7.2 确认 `httpx` 保留在 `requirements.txt`（供 `openclaw_llm.py` 使用）
- [x] 7.3 运行 `pip install -r requirements.txt` 验证依赖可正常安装，无冲突

## 8. 前端调整

- [x] 8.1 删除 `frontend/src/pages/MemoryDebug.tsx`
- [x] 8.2 从 `frontend/src/App.tsx` 中移除 MemoryDebug 路由注册及相关导入
- [x] 8.3 在 `frontend/src/pages/Settings.tsx` 中移除 LLM Provider / Memory / Tools 配置表单，新增 OpenClaw URL / Token / SessionKey 配置表单（与 `OpenClawConfig` 对应）
- [x] 8.4 更新前端类型定义：移除 `LLMConfig`、`MemoryConfig`、`ToolsConfig` 接口，新增 `OpenClawConfig` 接口

## 9. 端到端验证

- [x] 9.1 启动 OpenClaw Gateway（`openclaw gateway --port 18789`），确认 `/probe` 返回 200
- [x] 9.2 启动 Livebot 后端，确认启动日志无报错，出现 "OpenClaw Gateway 连接正常"
- [x] 9.3 通过 `/api/chat/send` 发送测试消息，验证 `LLM_SENTENCE` 事件正常触发、TTS 合成正常播放
- [x] 9.4 验证情感 JSON 解析：在 OpenClaw Agent system prompt 中配置情感格式，确认 `emotion` 字段被正确解析并传递到 TTS
- [x] 9.5 验证 Gateway 不可达场景：停止 OpenClaw，发送消息，确认 ERROR 日志出现且后端不崩溃
- [x] 9.6 运行前端，确认 Settings 页 OpenClaw 配置可正常读写，MemoryDebug 页已不可访问

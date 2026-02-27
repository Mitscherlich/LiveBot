## Context

Livebot 当前架构在 LLM Pipeline 层内部维护了三套独立系统：

- **记忆系统**：SQLite（短期） + ChromaDB（长期）+ sentence-transformers（Embedding），重约 2 GB 磁盘，首次启动耗时 30+ 秒
- **工具系统**：ToolRegistry 单例 + 内置 file/web 工具 + 动态 skill 加载
- **多 Provider LLM 调用**：openai SDK + anthropic SDK，约 300 行胶水代码

OpenClaw Gateway 已通过标准 OpenAI 兼容 HTTP 接口（`POST /v1/chat/completions`）将这三套能力全部封装，并在实验中验证可用（延迟 ~5s，流式 SSE 正常）。

本设计描述如何以最小破坏面完成替换，保持 ASR → LLM → TTS 主链路不变。

---

## Goals / Non-Goals

**Goals:**

- 用一个轻量 `OpenClawLLMPipeline` 类替换 `openai_llm.py` / `anthropic_llm.py`，对外事件接口不变（`LLM_SENTENCE`、`LLM_DONE`）
- 移除 `memory/`、`tools/`、`skills/` 目录及其所有依赖
- 新增 `OpenClawConfig` 配置节点（url、token），其余配置节点（llm.*、memory.*、tools.*）移除
- 精简 `requirements.txt`，移除 chromadb、sentence-transformers、aiosqlite、anthropic

**Non-Goals:**

- 不修改 ASR Pipeline、TTS Pipeline、Live2D 渲染、WebSocket 广播
- 不重构前端页面（除下线 MemoryDebug 页）
- 不实现 OpenClaw 的自动启动/进程守护（由用户手动启动）
- 不迁移历史对话数据（现有 SQLite / ChromaDB 数据不做迁移）

---

## Decisions

### D1：HTTP 客户端选 `httpx.AsyncClient` + 流式响应

**选择**：使用 `httpx`（已在 requirements.txt 中）的 `AsyncClient.stream()` 方法消费 SSE。

**备选方案**：
- `aiohttp`：功能相近，但引入新依赖
- `urllib.request`（同步）：不适合 asyncio 主循环，需要 `run_in_executor` 包装
- `websockets`（WebSocket 协议）：OpenClaw WebSocket 需要设备签名认证，比 HTTP Bearer token 复杂得多

**理由**：`httpx` 已存在于依赖中（`web_tool.py` 使用），移除 `web_tool.py` 后可保留 `httpx` 供 `openclaw_llm.py` 使用，净依赖变化为零。

---

### D2：`OpenClawLLMPipeline` 继承现有 `BaseLLMPipeline` 抽象类，但不实现工具/记忆接口

**选择**：新建 `pipeline/llm/openclaw_llm.py`，继承 `BaseLLMPipeline`，只实现 `generate()` 方法。

**理由**：
- `BaseLLMPipeline` 的 `set_tool_registry()`、`_get_long_term_context()` 等方法变成空操作（no-op），不影响 `bot.py` 的调用接口
- `create_llm_pipeline()` 工厂函数增加 `provider == "openclaw"` 分支，其余代码无需修改

**备选**：完全移除 `BaseLLMPipeline`，写独立类。会导致 `bot.py` 接口修改范围扩大，不值得。

---

### D3：情感 JSON 解析策略——"首个 `}` 流式探测"保持不变

**选择**：沿用现有逻辑：在 SSE chunk 累积缓冲区中，遇到第一个 `}` 时尝试解析 JSON，提取 `emotion`，其余内容进入句子缓冲。

**理由**：
- OpenClaw 返回的是 Agent 完整回复，VTuber 情感格式（`{"emotion": "开心"}` 前缀）需要在 OpenClaw Agent 的 system prompt 中配置，但解析逻辑与 Provider 无关
- 若 Agent 未配置情感格式，fallback 为 `emotion="平静"`，不影响 TTS

---

### D4：`OpenClawConfig` 独立节点，`LLMConfig` 整体移除

**选择**：
```yaml
# 新增
openclaw:
  url: "http://localhost:18789"
  token: ""          # 对应 ~/.openclaw/openclaw.json gateway.auth.token
  session_key: "main"
  timeout_ms: 120000

# 移除
llm: ...
memory: ...
tools: ...
```

**理由**：`LLMConfig`（含 provider、api_key、model 等字段）的语义已由 OpenClaw 接管，保留会造成误解。一次性清除比保留废弃字段更干净。

---

### D5：`/api/memory/*` REST 端点和前端 MemoryDebug 页直接删除，不做兼容层

**选择**：直接删除 `backend/api/memory_api.py` 和 `frontend/src/pages/MemoryDebug.tsx`。

**理由**：这两个组件仅供内部调试，没有外部 API 使用者。过渡期兼容层的维护成本高于收益。

---

### D6：OpenClaw Gateway 作为外部进程依赖，不内嵌启动

**选择**：Livebot 在启动时检查 OpenClaw Gateway 连通性（发送一次 `GET /probe`），若不可达则打印 ERROR 日志并继续启动（降级：LLM 功能不可用，ASR/TTS 仍正常）。

**备选**：Livebot 启动时自动拉起 OpenClaw 子进程。

**理由**：OpenClaw 进程管理（守护、重启、日志）由用户或系统 service 负责，Livebot 不应承担这个职责。子进程方案的错误处理复杂度不值得。

---

## Risks / Trade-offs

**[风险] OpenClaw 成为单点依赖** → 缓解：启动时连通性检查 + 清晰的错误日志提示用户启动 OpenClaw；LLM 不可用时 ASR/TTS 保持运行，不崩溃

**[风险] 历史对话数据丢失** → 缓解：文档明确说明数据不迁移；用户可在切换前通过 `/api/memory/export` 导出现有记忆（在移除前）

**[风险] VTuber 情感 JSON 格式依赖 OpenClaw Agent 配置** → 缓解：fallback 为 `emotion="平静"`，不影响功能；在 README/迁移文档中说明需在 OpenClaw system prompt 中加入情感格式要求

**[风险] `httpx` 流式 SSE 解析与现有 `urllib.request` 测试脚本行为不一致** → 缓解：在 `openclaw_llm.py` 中写专项集成测试，对比两种实现输出

**[Trade-off] 移除 Tools/Skills 系统意味着失去本地文件访问和 web_fetch 工具** → OpenClaw 内置 web fetch 工具；本地文件访问可通过 OpenClaw skills 目录重新注册（`*_skill.py` 迁移到 OpenClaw skills 路径）

---

## Migration Plan

### 部署步骤

1. 确保 OpenClaw Gateway 在本地运行（`openclaw gateway --port 18789`）
2. 在 OpenClaw Agent system prompt 中加入情感格式要求（`{"emotion": "..."}`）
3. 备份现有 `data/conversations.db` 和 `data/chroma/`（可选）
4. 更新 `config.yaml`：移除 `llm`/`memory`/`tools` 节点，新增 `openclaw` 节点
5. 安装新 `requirements.txt`（运行 `pip install -r requirements.txt`）
6. 启动 Livebot 后端，确认日志中出现 "OpenClaw Gateway 连接正常"

### 回滚策略

保留旧版 `requirements.txt.bak` 和 `config.yaml.bak`，回滚时：
1. 恢复两个文件
2. `pip install -r requirements.txt.bak`
3. 重启后端

旧代码通过 git tag 保留，可随时检出。

---

## Open Questions

- **Q1**：OpenClaw session_key 应使用固定值（如 `"livebot"`）还是随每次启动生成？固定值可保留跨重启的对话上下文，随机值每次启动全新对话。建议默认固定，可通过配置覆盖。
- **Q2**：Web 管理页面的 Settings 页中，LLM 配置表单如何调整？是完全替换为 OpenClaw URL/token 表单，还是只做最小改动（隐藏旧字段）？建议前者，更干净。
- **Q3**：是否需要在 Livebot 侧保留一个"最近 N 条字幕"的轻量显示缓存（用于前端实时字幕历史），与记忆系统无关？当前 Dashboard 页有字幕显示，需确认是否依赖 memory_api。

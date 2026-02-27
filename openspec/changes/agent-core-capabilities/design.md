## Context

livebot 已有工具调用的基础零件：`ToolSpec`/`ToolCall` 数据模型、`run_with_tools()` 循环实现，以及 OpenAI Function Calling 的完整集成。但这些零件彼此孤立——`run_with_tools()` 从未被 `generate()` 调用，没有工具注册管理机制，Anthropic pipeline 不支持 Tool Use，也没有任何自定义工具可用。

本设计在**零破坏现有接口**的前提下，将孤立零件组装为完整的 Agent 工具调用体系，并增加文件系统访问和 web_fetch 两类内置工具，以及基于文件扫描的 skill 扩展机制。

## Goals / Non-Goals

**Goals:**
- 打通 `generate()` → 工具调用循环的完整链路（OpenAI + Anthropic 两条路径）
- 提供统一的 `ToolRegistry` 作为运行时工具容器
- 实现文件系统三件套（read/write/list）和 `web_fetch` 内置工具
- 基于文件扫描的 Skill 扩展机制（零代码热插拔）
- 工具调用事件钩子（`TOOL_CALL_START`/`TOOL_CALL_END`）供调试和 UI 展示

**Non-Goals:**
- web_search（搜索引擎 API 集成，留待后续）
- 工具调用并发执行（串行足够，Anthropic 不支持并发 tool_use）
- 工具调用结果缓存
- 工具级别的访问控制策略（OpenClaw 风格的 tool-policy-pipeline）
- 前端 UI 显示工具调用状态（事件已发出，UI 集成留待后续）

## Decisions

### 决策 1：ToolRegistry 采用模块级单例，而非依赖注入

**选择**：`tool_registry = ToolRegistry()` 模块单例，各模块直接 import。

**理由**：livebot 当前架构无 IoC 容器，强行引入依赖注入会增加大量样板代码。工具注册发生在启动阶段（`bot.start()`），运行期只读，单例无并发安全问题。`ToolsConfig.enabled` 标志提供全局开关，无需每处传参。

**备选方案**：将 `ToolRegistry` 实例作为 `VTuberBot` 的属性，通过构造函数传入 `LLMPipeline`。复杂度高，收益低，排除。

---

### 决策 2：generate() 内部分叉，而非增加新方法

**选择**：在现有 `generate(user_text, user_emotion)` 内部通过 `self._has_tools()` 判断走工具调用路径，保持方法签名不变。

**理由**：调用方（`bot.py` 事件处理链和 `chat_api.py`）无需任何改动。工具调用路径本质上是 `build_messages()` → `run_with_tools()` → `parse_and_emit_sentences()`，与纯流式路径共用消息构建和输出发布逻辑。

**工具调用路径下的流式输出处理**：`run_with_tools()` 在工具循环结束后返回最终文本字符串，再统一按标点切割为句子通过事件总线发布 `LLM_SENTENCE`。工具调用期间无流式输出（LLM 在决策工具参数时不输出用户可见文本），这与现有 TTS 队列串行模型完全兼容。

**备选方案**：新增 `generate_with_tools()` 方法。增加 API 复杂度，调用方需判断何时用哪个方法，排除。

---

### 决策 3：Anthropic 工具调用采用非流式循环

**选择**：工具调用循环使用 `client.messages.create()`（非流式），最终文本响应再切割发布事件。

**理由**：Anthropic 流式 API 的 tool_use 需要从 `input_json_delta` 事件拼接参数字符串，实现复杂且易出错。工具调用阶段（决策参数 → 执行 → 返回结果）无用户可见输出，使用非流式不影响用户体验，且代码简洁。最终文本响应通常较短（已有工具执行结果的上下文），延迟可接受。

**备选方案**：纯流式实现，需拼接 `input_json_delta` 事件。复杂度高，排除。

---

### 决策 4：Skill 通过文件扫描发现，而非注册表配置

**选择**：`SkillLoader` 扫描 `*_skill.py` 文件，提取 `SKILL: Skill` 顶层变量。

**理由**：用户新增工具只需在目录下放一个文件，无需修改任何配置文件，学习成本极低。类似 pytest 的 `conftest.py` 约定优于配置。失败隔离（单个文件 import 失败不影响其他 skill）通过 try/except 保证。

**备选方案**：在 `config.yaml` 中配置 skill 模块路径列表。需手动维护配置，排除。

---

### 决策 5：文件安全检查使用 Path.is_relative_to()

**选择**：`resolved_path.is_relative_to(PROJECT_ROOT)` 检查（Python 3.9+）。

**理由**：`Path.resolve()` 会展开符号链接，`is_relative_to()` 比字符串前缀检查更可靠，不受 `/../` 绕过影响。`PROJECT_ROOT` 定义为 `Path(__file__).resolve().parent.parent.parent`（即 `livebot/`），覆盖工作区所有目录。

---

### 决策 6：web_fetch 使用 httpx + BeautifulSoup

**选择**：`httpx.get()` 同步调用（工具执行在 executor 函数中），`BeautifulSoup` 提取正文。

**理由**：工具执行函数目前为同步 Callable，与现有 `run_with_tools()` 的 `str(executor(**args))` 调用模式一致。`httpx` 比 `requests` 更现代，支持 HTTP/2，依赖轻量。BeautifulSoup 的 `get_text()` 自动处理编码和嵌套标签，比正则方案健壮。

**截断策略**：5000 字符，足够 LLM 理解页面核心内容，避免超出上下文窗口。

## Risks / Trade-offs

**[Risk] 工具调用导致 generate() 响应延迟增加** → 每轮工具调用增加至少一次 HTTP 往返（LLM API）+ 工具执行时间。缓解：`max_iterations=5` 限制循环次数；`web_fetch` 有 10s 超时；文件操作通常 <1ms。用户体验层面，工具调用期间前端 WebSocket 暂无输出，可后续通过 `TOOL_CALL_START` 事件在 UI 显示"思考中..."。

**[Risk] Skill 文件中的恶意代码被执行** → SkillLoader 动态 import 等效于执行任意 Python 代码。缓解：skill 目录为本地开发者管理，与代码库同权限，不接受外部输入；文档说明 skill 目录信任边界。

**[Risk] 文件写入工具被 LLM 误用覆盖关键文件** → `write_file` 路径安全检查只防止越出工作区，工作区内的文件（如 `config.yaml`）仍可被写入。缓解：LLM system prompt 中可加入写文件操作的指引；后续可通过 `ToolsConfig` 独立开关 `file_write_enabled`。

**[Risk] Anthropic 非流式工具调用期间用户感知延迟** → 与流式路径相比，工具调用结束前无任何输出。缓解：通过 `TOOL_CALL_START` 事件在 WebSocket 广播"正在查询..."字幕（后续 UI 集成）。

**[Trade-off] ToolRegistry 单例在热重载时不重置** → `reload_config()` 目前重建 LLM/TTS/ASR 实例但不重载 skills。修改 skill 文件需重启进程。接受此 trade-off：skill 是开发时工件，运行期不频繁变更。

## Migration Plan

1. 安装新依赖：`pip install httpx beautifulsoup4`
2. 部署新文件（`backend/tools/`、`backend/skills/`），现有代码无变化
3. 修改 `base.py`、`openai_llm.py`、`anthropic_llm.py`、`event_bus.py`、`bot.py`、`config.py`
4. 在 `config.yaml` 中添加 `tools:` 块（可选，不配置时使用默认值 `enabled: true`）
5. 重启 livebot 后端
6. 发送"现在几点了"验证 time_skill 调用

**回滚**：在 `config.yaml` 设置 `tools.enabled: false`，`get_all_specs()` 返回空列表，`generate()` 立即退化为原有纯流式路径，无需代码回滚。

## Open Questions

- **Anthropic 工具调用与情感 JSON 输出的兼容性**：当前 system prompt 要求 LLM 以 `{"emotion": "...", "text": "..."}` 格式输出，工具调用路径下最终文本响应是否仍遵循此格式？需在实现阶段验证，若不兼容可在 system prompt 中明确说明工具调用完成后的输出格式要求。
- **async 工具支持**：`web_fetch` 使用 httpx 同步调用，若未来需要 async 工具（如异步数据库查询），需在 `run_with_tools()` 中支持 `asyncio.iscoroutinefunction()` 检测并 await。当前先用同步实现，避免过度设计。

## 1. 依赖与配置

- [x] 1.1 在 `backend/requirements.txt` 中添加 `httpx>=0.27.0` 和 `beautifulsoup4>=4.12.0`
- [x] 1.2 在 `backend/config.py` 中新增 `ToolsConfig` Pydantic 模型（`enabled`、`file_access_enabled`、`web_fetch_enabled`、`web_fetch_timeout`、`skills_dir` 字段，全部提供默认值）
- [x] 1.3 在 `AppConfig` 中添加 `tools: ToolsConfig = ToolsConfig()` 字段
- [x] 1.4 在 `backend/config.yaml` 中添加 `tools:` 示例配置块（注释说明各字段含义）

## 2. ToolRegistry

- [x] 2.1 创建 `backend/tools/__init__.py`（空文件或 `from .registry import tool_registry`）
- [x] 2.2 创建 `backend/tools/registry.py`：实现 `ToolRegistry` 类（`_specs: dict`、`_executors: dict`、`register()`、`get_all_specs()`、`get_executor_map()`）及模块级单例 `tool_registry = ToolRegistry()`
- [x] 2.3 在 `ToolRegistry.get_all_specs()` 中实现配置感知：当 `config.tools.enabled` 为 `False` 时返回空列表（需懒加载 config，避免循环 import）
- [x] 2.4 在 `register()` 中添加重复注册 WARNING 日志

## 3. 内置文件系统工具

- [x] 3.1 创建 `backend/tools/file_tool.py`，实现 `_assert_safe_path(path)` 函数：`Path(path).resolve().is_relative_to(PROJECT_ROOT)`，不满足时 raise `PermissionError`
- [x] 3.2 实现 `read_file(path: str, encoding: str = "utf-8") -> str`：读取文件内容，捕获 `UnicodeDecodeError` 时以 `latin-1` 重试，路径越出工作区返回错误字符串
- [x] 3.3 实现 `write_file(path: str, content: str) -> str`：写入文件（`Path.parent.mkdir(parents=True, exist_ok=True)`），路径越出返回错误字符串
- [x] 3.4 实现 `list_directory(path: str) -> str`：列出目录内容，区分 `[D]`/`[F]` 标签，按名称排序，路径越出或不是目录时返回错误字符串
- [x] 3.5 创建 `get_file_tools() -> list[tuple[ToolSpec, Callable]]` 函数，返回三个工具的 `(spec, executor)` 对，供 `bot.py` 批量注册

## 4. 内置 web_fetch 工具

- [x] 4.1 创建 `backend/tools/web_tool.py`，实现 `web_fetch(url: str, timeout: int = 10) -> str`：使用 `httpx.get()` 发起请求，捕获超时和 HTTP 错误
- [x] 4.2 在 `web_fetch` 中判断 `Content-Type`：`text/html` 时用 `BeautifulSoup(html, "html.parser").get_text()` 提取正文，其他类型直接使用响应文本
- [x] 4.3 将返回内容截断至 5000 字符（含截断提示 `"...[内容已截断]"`）
- [x] 4.4 创建 `get_web_tools() -> list[tuple[ToolSpec, Callable]]` 函数

## 5. Skill 系统

- [x] 5.1 创建 `backend/skills/__init__.py`（空文件）
- [x] 5.2 创建 `backend/skills/base.py`：定义 `Skill` dataclass（`name`、`description`、`parameters`、`executor` 字段）及 `to_tool_spec() -> ToolSpec` 方法
- [x] 5.3 创建 `backend/skills/loader.py`：实现 `SkillLoader.load(directory: Path)` 方法，扫描 `*_skill.py` 文件，`importlib.util.spec_from_file_location` 动态 import，提取 `SKILL` 变量，调用 `tool_registry.register()`；单文件失败记录 ERROR 并继续
- [x] 5.4 创建 `backend/skills/builtin/__init__.py`（空文件）
- [x] 5.5 创建 `backend/skills/builtin/time_skill.py`：实现 `get_current_time() -> str`（返回 `"当前时间：YYYY-MM-DD HH:MM:SS"`）并导出 `SKILL = Skill(...)`

## 6. LLM Pipeline 修改

- [x] 6.1 在 `backend/core/event_bus.py` 的 `Event` 枚举中添加 `TOOL_CALL_START = "tool_call_start"` 和 `TOOL_CALL_END = "tool_call_end"`
- [x] 6.2 在 `backend/pipeline/llm/base.py` 中添加 `set_tool_registry(registry) -> None` 方法和 `_has_tools() -> bool` 方法
- [x] 6.3 修改 `backend/pipeline/llm/openai_llm.py` 的 `run_with_tools()` 方法：在工具执行前 `bus.emit(Event.TOOL_CALL_START, {...})`，执行后 `bus.emit(Event.TOOL_CALL_END, {...})`
- [x] 6.4 修改 `backend/pipeline/llm/openai_llm.py` 的 `generate()` 方法：当 `self._has_tools()` 为 True 时，调用 `self.bind_tools(registry.get_all_specs())` 并走 `run_with_tools()` 路径；工具调用完成后将返回文本按标点切割发布 `LLM_SENTENCE` 事件
- [x] 6.5 在 `backend/pipeline/llm/anthropic_llm.py` 中实现 `run_with_tools()` 方法：使用非流式 `client.messages.create(tools=[...])` 循环，检测 `stop_reason == "tool_use"`，执行工具（含 `TOOL_CALL_START`/`END` 事件），回传 `tool_result` content block，直到 `stop_reason == "end_turn"` 返回最终文本
- [x] 6.6 修改 `backend/pipeline/llm/anthropic_llm.py` 的 `generate()` 方法：当 `self._has_tools()` 为 True 时走 `run_with_tools()` 路径，处理最终文本的情感解析和 `LLM_SENTENCE` 事件发布

## 7. Bot 集成

- [x] 7.1 在 `backend/core/bot.py` 的 `start()` 方法中初始化 `ToolRegistry`（import `tool_registry`）
- [x] 7.2 根据 `config.tools.file_access_enabled` 决定是否调用 `get_file_tools()` 并批量注册到 `tool_registry`
- [x] 7.3 根据 `config.tools.web_fetch_enabled` 决定是否调用 `get_web_tools()` 并注册
- [x] 7.4 调用 `SkillLoader().load(Path("backend/skills/builtin"))` 加载内置 skills
- [x] 7.5 若 `config.tools.skills_dir` 指向存在的目录，调用 `SkillLoader().load()` 加载用户自定义 skills；不存在时记录 WARNING 跳过
- [x] 7.6 调用 `self.llm.set_tool_registry(tool_registry)` 将注册表注入 LLM pipeline

## 8. 验证

- [ ] 8.1 启动后端，发送"现在几点了"，确认日志中出现 `TOOL_CALL_START: get_current_time` 和 `TOOL_CALL_END`，Bot 正确报时
- [ ] 8.2 发送"帮我抓取 https://example.com 的内容"，确认 `web_fetch` 被调用并返回正文摘要
- [ ] 8.3 发送"读取 ./backend/config.yaml 的第一行"，确认 `read_file` 返回文件内容
- [ ] 8.4 测试路径安全：发送"读取 ../../etc/passwd"，确认返回 `"错误：路径越出工作区限制"`
- [ ] 8.5 在 `config.yaml` 设置 `tools.enabled: false`，重启，确认 Bot 恢复纯流式生成（无工具调用日志）
- [ ] 8.6 切换 `provider: anthropic`，重复 8.1 测试，确认 Anthropic Tool Use 路径正常工作
- [ ] 8.7 在 `backend/skills/` 下创建自定义 `*_skill.py`，重启后确认工具已注册可调用

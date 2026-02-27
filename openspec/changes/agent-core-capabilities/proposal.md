## Why

livebot 的 LLM 管道目前只能被动生成文本——无法调用外部工具、访问文件或获取网络内容，导致 VTuber Bot 回答能力受限于训练知识，无法执行实时查询或与宿主环境交互。通过对齐 OpenClaw Agent 核心能力，赋予 Bot 主动行动能力。

## What Changes

- 新增 `backend/tools/` 模块：`ToolRegistry` 单例统一管理工具注册、`file_tool` 提供文件系统访问、`web_tool` 提供网页内容抓取
- 新增 `backend/skills/` 模块：`Skill` 数据类 + `SkillLoader` 自动扫描 `*_skill.py` 文件并注册工具，内置 `time_skill` 示例
- 修改 `BaseLLMPipeline`：添加 `set_tool_registry()` / `_has_tools()` 方法，`generate()` 绑定工具时自动走工具调用循环
- 修改 `OpenAILLMPipeline`：`generate()` 检测到工具注册时调用 `run_with_tools()`，工具执行前后发出 `TOOL_CALL_START` / `TOOL_CALL_END` 事件
- 修改 `AnthropicLLMPipeline`：实现 Anthropic Tool Use 支持（`stop_reason == "tool_use"` 循环）
- 修改 `EventBus`：添加 `TOOL_CALL_START`、`TOOL_CALL_END` 两个新事件类型
- 修改 `VTuberBot.start()`：初始化 ToolRegistry、注册内置工具、加载 skills
- 修改 `AppConfig`：添加 `ToolsConfig`（enabled / file_access_enabled / web_fetch_enabled 等开关）
- 修改 `requirements.txt`：添加 `httpx`、`beautifulsoup4`

## Capabilities

### New Capabilities

- `tool-registry`: 工具注册表——维护 ToolSpec + executor 映射的单例，提供统一的注册、查找接口，是所有工具和 skill 的运行时容器
- `skill-system`: Skill 自动发现与加载——`Skill` dataclass 定义、`SkillLoader` 扫描目录下 `*_skill.py` 文件并注册到 ToolRegistry，内置 `time_skill` 作为示例和验证
- `builtin-tools`: 内置工具集——`read_file` / `write_file` / `list_directory`（路径限制在工作区根目录）+ `web_fetch`（httpx + BeautifulSoup 正文提取，截断 5000 字符）

### Modified Capabilities

- `llm-pipeline`: `generate()` 行为变更——当 ToolRegistry 已绑定且含工具时，自动进入工具调用循环（而非直接流式输出）；新增 `TOOL_CALL_START` / `TOOL_CALL_END` 事件发出；Anthropic provider 新增 Tool Use 支持

## Impact

- **新增文件**：`backend/tools/__init__.py`、`backend/tools/registry.py`、`backend/tools/file_tool.py`、`backend/tools/web_tool.py`、`backend/skills/__init__.py`、`backend/skills/base.py`、`backend/skills/loader.py`、`backend/skills/builtin/__init__.py`、`backend/skills/builtin/time_skill.py`
- **修改文件**：`backend/pipeline/llm/base.py`、`backend/pipeline/llm/openai_llm.py`、`backend/pipeline/llm/anthropic_llm.py`、`backend/core/event_bus.py`、`backend/core/bot.py`、`backend/config.py`、`backend/requirements.txt`
- **依赖新增**：`httpx>=0.27.0`、`beautifulsoup4>=4.12.0`
- **API 无变化**：REST 端点、WebSocket 协议、前端接口均不受影响
- **向后兼容**：工具调用为可选路径（`_has_tools()` 为 false 时 `generate()` 行为与当前完全一致）

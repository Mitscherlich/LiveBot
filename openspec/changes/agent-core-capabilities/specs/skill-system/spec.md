## ADDED Requirements

### Requirement: Skill 数据结构
系统 SHALL 提供 `Skill` dataclass，包含 `name`（str）、`description`（str）、`parameters`（dict，JSON Schema 格式）、`executor`（Callable）四个字段，以及 `to_tool_spec() -> ToolSpec` 转换方法。

#### Scenario: Skill 转换为 ToolSpec
- **WHEN** 调用 `skill.to_tool_spec()`
- **THEN** 返回 `ToolSpec(name=skill.name, description=skill.description, parameters=skill.parameters)`，可直接传入 `ToolRegistry.register()`

---

### Requirement: Skill 文件自动发现
`SkillLoader` SHALL 扫描指定目录下所有符合 `*_skill.py` 模式的文件，动态 import 每个文件，提取顶层 `SKILL: Skill` 变量，并调用 `tool_registry.register()` 注册。

#### Scenario: 发现并注册单个 skill 文件
- **WHEN** 目录下存在 `time_skill.py`，且文件导出 `SKILL = Skill(...)`
- **THEN** `SkillLoader.load(directory)` 完成后，`tool_registry.get_all_specs()` 包含该 skill 的 `ToolSpec`

#### Scenario: 跳过不含 SKILL 变量的文件
- **WHEN** 目录下存在 `helper.py`，不含 `SKILL` 变量
- **THEN** 该文件被跳过，记录 DEBUG 日志，不影响其他 skill 加载

#### Scenario: Skill 文件 import 失败
- **WHEN** 某 `*_skill.py` 文件存在语法错误或缺少依赖
- **THEN** 记录 ERROR 日志（含文件路径和异常信息），跳过该文件，继续加载其他文件

---

### Requirement: 内置 time_skill
系统 SHALL 提供 `backend/skills/builtin/time_skill.py` 作为内置示例，实现 `get_current_time` 工具，返回当前本地日期和时间的格式化字符串。

#### Scenario: 调用 get_current_time
- **WHEN** LLM 调用工具 `get_current_time`（无参数）
- **THEN** 返回格式为 `"当前时间：2024-01-01 12:00:00"` 的字符串

---

### Requirement: Bot 启动时自动加载 skills
`VTuberBot.start()` SHALL 在初始化 ToolRegistry 后，自动加载 `backend/skills/builtin/` 目录，并根据 `ToolsConfig.skills_dir` 配置可选加载用户自定义 skill 目录。

#### Scenario: 内置 skill 自动注册
- **WHEN** Bot 启动且 `config.tools.enabled = true`
- **THEN** `backend/skills/builtin/` 下的所有 `*_skill.py` 均已注册到 ToolRegistry，LLM 可调用其工具

#### Scenario: 用户自定义 skill 目录不存在时跳过
- **WHEN** `config.tools.skills_dir` 指向不存在的路径
- **THEN** 记录 WARNING 日志并跳过，内置 skills 正常加载

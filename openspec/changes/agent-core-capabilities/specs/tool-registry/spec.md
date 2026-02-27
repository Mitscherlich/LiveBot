## ADDED Requirements

### Requirement: 工具注册与查找
`ToolRegistry` 单例 SHALL 维护工具名称到 `ToolSpec`（定义）和 `Callable`（执行函数）的映射，提供注册和查找接口，并作为所有工具和 skill 的运行时容器。

#### Scenario: 注册新工具
- **WHEN** 调用 `ToolRegistry.register(spec, executor)`
- **THEN** 工具按 `spec.name` 存储，后续 `get_all_specs()` 和 `get_executor_map()` 均可取到该工具

#### Scenario: 重复注册覆盖
- **WHEN** 以相同 `name` 再次调用 `register()`
- **THEN** 新的 spec 和 executor 覆盖旧的，记录 WARNING 日志，不抛出异常

#### Scenario: 获取所有工具定义
- **WHEN** 调用 `ToolRegistry.get_all_specs()`
- **THEN** 返回当前已注册的全部 `ToolSpec` 列表，顺序与注册顺序一致

#### Scenario: 获取执行映射
- **WHEN** 调用 `ToolRegistry.get_executor_map()`
- **THEN** 返回 `dict[str, Callable]`，可直接传入 `run_with_tools()` 的 `tool_executors` 参数

---

### Requirement: 全局单例访问
系统 SHALL 提供模块级单例 `tool_registry = ToolRegistry()`，各模块通过 `from tools.registry import tool_registry` 访问，无需手动实例化。

#### Scenario: 跨模块共享状态
- **WHEN** `file_tool.py` 和 `skill_loader.py` 分别调用 `tool_registry.register()`
- **THEN** 从同一 `tool_registry` 实例的 `get_all_specs()` 可取到全部注册工具

---

### Requirement: 配置感知启用控制
`ToolRegistry` SHALL 支持根据 `ToolsConfig.enabled` 标志决定是否生效；当 `enabled=False` 时，`get_all_specs()` 返回空列表，LLM pipeline 不走工具调用路径。

#### Scenario: 全局禁用工具
- **WHEN** `config.tools.enabled = false`
- **THEN** `tool_registry.get_all_specs()` 返回 `[]`，`generate()` 退化为纯流式生成模式

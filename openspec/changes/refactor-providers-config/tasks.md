## 1. Backend Provider 注册表模块

- [x] 1.1 创建 `backend/providers/` 目录结构
- [x] 1.2 定义 `Provider` Pydantic 模型（name、base_url、api_type、default_model）
- [x] 1.3 创建 builtin-providers 注册表，包含 DeepSeek、Moonshot、豆包、Anthropic
- [x] 1.4 实现 `get_provider(name)` 查询函数
- [x] 1.5 实现 `list_providers()` 函数返回所有 Provider 列表

## 2. 后端 Provider 路由解耦

- [x] 2.1 修改 `config_api.py`，删除 `_ANTHROPIC_PROVIDERS` 硬编码集合
- [x] 2.2 修改 `pipeline/llm/__init__.py`，改为查询注册表获取 api_type
- [x] 2.3 确保现有配置（config.yaml）仍然兼容，无需迁移

## 3. 前端 Provider 定义同步

- [x] 3.1 重构前端 `LLM_PRESETS`，与后端注册表保持一致的结构
- [x] 3.2 确保前端预设 Provider 的 base_url、default_model 与后端一致

## 4. 前端配置页高级配置折叠区

- [x] 4.1 在 LLM Provider 配置页新增【高级配置】折叠区域
- [x] 4.2 将 temperature、max_tokens 从主配置区移入折叠的高级配置区
- [x] 4.3 记忆打分 LLM 配置同样使用高级配置折叠区

## 5. 验证与测试

- [x] 5.1 验证所有预设 Provider 可以正常切换
- [x] 5.2 验证高级配置参数可以正确保存和加载
- [x] 5.3 验证前后端配置一致性

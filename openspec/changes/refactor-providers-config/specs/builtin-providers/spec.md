# Builtin Providers

## Purpose

Builtin Providers 注册表集中管理所有内置 LLM Provider 的元数据，包括名称、API 端点地址、API 类型等，供前后端统一消费，解决配置散落多处的问题。

## ADDED Requirements

### Requirement: Provider 注册表定义

系统 SHALL 在 `backend/providers/` 模块中定义 builtin-providers 注册表，包含所有内置 Provider 的以下元数据：
- `name`: Provider 标识符（如 `deepseek`、`moonshop`、`anthropic`）
- `base_url`: API 端点地址
- `api_type`: API 类型，值为 `openai` 或 `anthropic`
- `default_model`: 默认模型名称

#### Scenario: 注册表包含预设 Provider
- **WHEN** 系统启动
- **THEN** Provider 注册表包含：DeepSeek、Moonshot、豆包（OpenAI 兼容）、Anthropic Claude

#### Scenario: 查询 Provider 元数据
- **WHEN** 代码调用注册表查询某 Provider 的 `api_type`
- **THEN** 返回对应的 `openai` 或 `anthropic` 字符串

#### Scenario: 获取所有 Provider 列表
- **WHEN** 代码需要获取所有内置 Provider 列表
- **THEN** 注册表返回包含 name、base_url、default_model 的完整列表

---

### Requirement: Provider 路由解耦

后端 LLM Pipeline SHALL 通过查询 Provider 注册表获取 `api_type`，而非使用硬编码的集合判断。

#### Scenario: OpenAI 兼容 Provider 路由
- **WHEN** 配置的 provider 的 `api_type` 为 `openai`
- **THEN** 系统使用 openai SDK 的 Chat Completions API

#### Scenario: Anthropic Provider 路由
- **WHEN** 配置的 provider 的 `api_type` 为 `anthropic`
- **THEN** 系统使用 anthropic SDK 的 Messages API

#### Scenario: 新增 Provider 只需修改注册表
- **WHEN** 需要添加新的内置 Provider
- **THEN** 只需在注册表中添加条目，后端路由逻辑自动生效，无需修改 `pipeline/llm/__init__.py`

---

### Requirement: 前端 Provider 定义同步

前端 SHALL 使用与后端注册表一致的结构定义 LLM_PRESETS，确保配置一致性。

#### Scenario: 前端预设 Provider 与后端一致
- **WHEN** 用户在前端选择预设 Provider
- **THEN** 前端使用的 base_url、default_model 与后端注册表中的定义一致

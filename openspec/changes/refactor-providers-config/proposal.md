## Why

当前 Provider 配置（base_url、api_type 判断）分散硬编码在前端 `LLM_PRESETS`、后端 `_ANTHROPIC_PROVIDERS` 集合及 `create_llm_pipeline` 工厂函数中，新增或修改 Provider 需要同步修改多处；前端配置页面也将 temperature、maxTokens 等高级参数与基础连接配置混排，可读性差。现需将 Provider 元数据集中管理，并改善配置 UI 结构。

## What Changes

- **新增 builtin-providers 注册表**：在后端新建 `providers/` 模块，以结构化方式声明所有内置 Provider（name、base_url、api_type: `openai` | `anthropic`），替代多处散落的硬编码
- **前端同步内置 Provider 定义**：前端 `LLM_PRESETS` 改为从统一来源获取，或与后端 provider 注册表保持一致的结构
- **后端 Provider 路由解耦**：`config_api.py` 中的 `_ANTHROPIC_PROVIDERS` 集合及 `pipeline/llm/__init__.py` 中的判断逻辑，改为查询 provider 注册表的 `api_type` 字段
- **前端配置页新增【高级配置】折叠区域**：将 `temperature`、`max_tokens` 从主配置区移入折叠的高级配置区（同时适用于主 LLM 和记忆打分 LLM）

## Capabilities

### New Capabilities

- `builtin-providers`: 内置 Provider 注册表，集中定义所有受支持的 Provider 的 name、base_url、api_type，供前后端统一消费

### Modified Capabilities

- `llm-pipeline`: Provider 路由由硬编码集合改为查询 builtin-providers 注册表的 `api_type` 字段
- `web-admin-ui`: 配置页面新增【高级配置】折叠区域，temperature / max_tokens 移入其中

## Impact

- **后端**：`backend/config_api.py`（删除 `_ANTHROPIC_PROVIDERS`）、`backend/pipeline/llm/__init__.py`（路由逻辑改查注册表）、新增 `backend/providers/` 模块
- **前端**：`frontend/src/pages/Settings.tsx`（重构 `LLM_PRESETS`、UI 结构调整）
- **无破坏性变更**：config.yaml 格式不变，API 接口不变，用户已有配置完全兼容

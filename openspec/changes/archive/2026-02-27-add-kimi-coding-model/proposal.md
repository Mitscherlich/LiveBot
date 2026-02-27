## Why

当前用户需要通过选择「自定义」provider 来配置 Kimi Coding 模型，操作繁琐且容易出错。Kimi Coding 作为月之暗面推出的编程专用模型，使用 Anthropic Message 格式（与 Claude 相同），支持长上下文（200K tokens）。将其作为独立预设选项可以简化用户配置流程，提供更友好的开箱体验。

## What Changes

- **新增 `kimi-coding` provider 预设**：在 LLM Provider 下拉选项中添加「Kimi Coding」选项
- **自动填充配置**：选择 Kimi Coding 时自动填充 base_url=https://api.kimi.com/coding 和 model=kimi-for-coding
- **使用 Anthropic Message 格式**：后端将 kimi-coding provider 路由到 AnthropicLLMPipeline，复用现有的 Claude 消息格式支持
- **前端预设配置更新**：在 `LLM_PRESETS` 中添加 kimi-coding 的默认配置
- **后端路由逻辑更新**：在 `create_llm_pipeline` 中将 `kimi-coding` provider 映射到 AnthropicLLMPipeline

## Capabilities

### New Capabilities
- `kimi-coding-provider`: Kimi Coding 模型配置支持，包括 provider 预设、自动填充 base_url 和 model、Anthropic Message 格式兼容

### Modified Capabilities
- （无现有 spec 需要修改）

## Impact

- **前端**: `frontend/src/pages/Settings.tsx` - 添加 LLM_PRESETS 条目和下拉选项
- **后端**: `backend/pipeline/llm/__init__.py` - 添加 provider 到 pipeline 的路由映射
- **配置**: 用户现有使用 custom provider 配置 kimi coding 的方式仍然兼容
- **依赖**: 无新增依赖，复用现有的 `anthropic` Python SDK

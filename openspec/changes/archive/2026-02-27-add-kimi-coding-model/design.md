## Context

当前系统支持多种 LLM Provider：DeepSeek、Moonshot、豆包、Anthropic (Claude) 和自定义。用户选择 Provider 时，前端会自动填充对应的 base_url 和默认 model 名称。

Kimi Coding 是月之暗面推出的编程专用模型，使用与 Claude 相同的 Anthropic Message 格式，base_url 为 `https://api.kimi.com/coding`。目前用户需要通过选择「自定义」provider 手动配置，体验不佳。

后端架构上，`create_llm_pipeline` 函数根据 provider 决定实例化哪个 Pipeline 类：
- `anthropic` → `AnthropicLLMPipeline`
- 其他 → `LLMPipeline` (OpenAI 兼容格式)

## Goals / Non-Goals

**Goals:**
- 在 Provider 下拉选项中添加「Kimi Coding」预设
- 选择 Kimi Coding 时自动填充 base_url 和 model
- 复用现有 AnthropicLLMPipeline 处理 Kimi Coding 请求
- 保持向后兼容：现有 custom provider 配置方式仍然可用

**Non-Goals:**
- 修改 Anthropic Message 格式处理逻辑
- 添加新的 API 端点
- 修改 LLM 调用流程
- 支持 Kimi 的非 coding 模型

## Decisions

### Decision 1: Provider 命名
- **选择**: `kimi-coding` (kebab-case)
- **理由**: 明确区分 coding 和非 coding 模型；与现有命名风格一致（`deepseek`, `moonshot` 等）
- **备选**: `kimi` - 过于笼统，无法区分不同模型类型

### Decision 2: Pipeline 路由策略
- **选择**: 在 `create_llm_pipeline` 中将 `kimi-coding` 映射到 `AnthropicLLMPipeline`
- **理由**: Kimi Coding 使用 Anthropic Message 格式，可直接复用现有实现
- **备选**: 创建新的 KimiLLMPipeline - 不必要的代码重复

### Decision 3: 默认模型名称
- **选择**: `kimi-for-coding`
- **理由**: 这是 Kimi Coding API 的推荐模型标识符
- **备选**: 空字符串让用户自行填写 - 降低开箱体验

### Decision 4: Base URL 格式
- **选择**: `https://api.kimi.com/coding`（不含 `/v1` 后缀）
- **理由**: Kimi Coding API 文档指定此格式
- **注意**: anthropic SDK 会自动处理版本路径

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 用户混淆 Kimi Coding 和 Claude | 下拉选项使用清晰的中文标签「Kimi Coding (编程专用)」 |
| anthropic SDK 版本兼容性问题 | 使用项目现有 anthropic SDK，无需升级 |
| 用户已有 custom 配置 | 保持 custom provider 完全兼容，不强制迁移 |

## Migration Plan

无需迁移。现有使用 custom provider 配置 Kimi Coding 的用户可以继续使用，新用户可以直接选择 Kimi Coding 预设。

## Open Questions

- 是否需要同时支持记忆打分模型的 Kimi Coding 选项？（当前只添加主 LLM）

## Context

当前 Provider 配置存在多处散落硬编码的问题：
- 前端 `LLM_PRESETS` 包含 provider 名称、默认模型、base_url 等
- 后端 `config_api.py` 中有 `_ANTHROPIC_PROVIDERS` 集合
- 后端 `pipeline/llm/__init__.py` 中有 `api_type` 判断逻辑

这种分散管理导致：
1. 新增 Provider 需要同步修改多处代码
2. 前后端配置可能不一致
3. 前端配置页面将高级参数（temperature、max_tokens）与基础连接配置混排

## Goals / Non-Goals

**Goals:**
- 建立统一的 builtin-providers 注册表，集中管理所有内置 Provider 的元数据（name、base_url、api_type）
- 解耦后端 Provider 路由逻辑，改为查询注册表而非硬编码判断
- 前端配置页面新增【高级配置】折叠区域，将 temperature、max_tokens 等参数与基础配置分离

**Non-Goals:**
- 不支持用户自定义 Provider（仅内置 Provider）
- 不修改 config.yaml 格式，保持向后兼容
- 不修改现有 API 接口

## Decisions

### Decision 1: Provider 注册表使用 Python 模块 + Pydantic 模型

**Choice**: 在 `backend/providers/` 下创建 Python 模块，使用 Pydantic 模型定义 Provider 元数据

**Rationale**:
- Python 模块方式便于静态分析IDE 支持好
- Pydantic 提供运行时验证
- 避免引入额外数据库或配置文件依赖

**Alternatives Considered**:
- JSON/YAML 配置文件 → 需要额外解析逻辑，不如代码内声明类型安全
- 数据库表 → 过度设计，内置 Provider 不需要动态管理

### Decision 2: 前端 Provider 定义与后端保持同步

**Choice**: 前端直接从后端 API 获取 Provider 列表，或保持与后端注册表一致的结构

**Rationale**:
- 确保前后端配置一致
- 减少维护成本

**Alternatives Considered**:
- 前端独立维护 → 可能导致配置不一致
- 后端每次请求都返回 Provider 列表 → 增加 API 复杂度

### Decision 3: API 类型使用 `openai` | `anthropic` 字符串枚举

**Choice**: `api_type` 字段使用字符串字面量类型而非枚举类

**Rationale**:
- 简单直观，与现有代码风格一致
- 扩展性好，未来添加新类型只需添加字符串值

**Alternatives Considered**:
- Enum 类 → 过度工程化
- 整数常量 → 可读性差

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 注册表与代码分散的 LLM 调用逻辑不一致 | 高 | 编写集成测试验证路由正确性 |
| 前端需要额外 API 获取 Provider 列表 | 中 | 先保持同步，后续如有需要再添加 API |
| 迁移期间可能出现短暂不一致 | 低 | 一次性修改，前后端同时上线 |

## Migration Plan

1. **Phase 1**: 创建 `backend/providers/` 模块，定义 Provider 注册表
2. **Phase 2**: 修改 `config_api.py` 和 `pipeline/llm/__init__.py`，改为查询注册表
3. **Phase 3**: 重构前端 `LLM_PRESETS`，与后端注册表保持一致
4. **Phase 4**: 前端配置页新增【高级配置】折叠区域

**Rollback**: 如遇问题，可回滚到修改前的代码版本（硬编码逻辑保留在 git 历史中）

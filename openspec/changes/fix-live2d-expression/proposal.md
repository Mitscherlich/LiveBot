## Why

hiyori_pro_zh 模型的 `model3.json` 不包含任何 expression 定义，但每次 TTS 触发情感（如"平静"→`neutral`）时都会调用 `setExpression('neutral')`，进而在 `playExpression` 中重复打印 `[Live2D] Expression "neutral" not found` warn 日志。一次对话产生数十条噪音警告，干扰真实调试信息。

## What Changes

- 在 `VTuberModel.playExpression()` 中对"找不到 expression"的 warn 日志进行去重：每个未知 expression name 只在当前模型生命周期内警告一次
- 清理：模型重新加载时重置去重 Set，确保新模型的 expression 问题仍能被发现
- 不改变正常 expression 切换逻辑，不影响有 expression 定义的模型

## Capabilities

### New Capabilities

（无新能力）

### Modified Capabilities

- `live2d-expression-driver`: 修改 "Unknown expression name" 场景的 warn 行为——由每次调用都输出 warn，改为每个未知 name 仅输出一次 warn（去重）

## Impact

- 修改文件：`frontend/src/lib/cubism/CubismRenderer.ts`（`VTuberModel` 类）
- 无 API 变更，无破坏性修改
- 有 expression 定义的模型行为不变；无 expression 的模型静默降级更彻底

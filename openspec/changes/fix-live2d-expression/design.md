## Context

`VTuberModel.playExpression()` 在找不到指定 expression name 时会调用 `console.warn()`。由于 hiyori_pro_zh 模型不含任何 expression 定义，每次 TTS 触发情感（约每句话一次）都会打印相同的 warn，一次对话产生数十条重复日志，淹没真实调试信息。

当前调用链：`triggerEmotion("平静")` → `setExpression("neutral")` → `playExpression("neutral")` → `console.warn`（每次都触发）

## Goals / Non-Goals

**Goals:**
- 消除重复的 Expression not found warn 噪音
- 保留首次 warn，确保问题仍可被发现
- 模型重载后 warn 能再次触发（新模型可能有不同的 expression 集合）

**Non-Goals:**
- 修改模型文件本身（添加 expression 定义）
- 修改 `triggerEmotion` 调用侧逻辑
- 处理其他类型的 Live2D 警告去重

## Decisions

### 决策：在 VTuberModel 内维护去重 Set

在 `VTuberModel` 类中添加私有字段 `_warnedExpressions: Set<string>`，初始化为空 Set。

`playExpression` 逻辑修改为：
```typescript
playExpression(name: string): void {
  const expr = this._expressionMap.get(name)
  if (!expr) {
    if (!this._warnedExpressions.has(name)) {
      console.warn(`[Live2D] Expression "${name}" not found`)
      this._warnedExpressions.add(name)
    }
    return
  }
  this._expressionManager.startMotion(expr, false)
}
```

在 `loadModel()` 流程中，expression 预加载完成后清空 Set（`this._warnedExpressions.clear()`），确保模型重载时 warn 可再次触发。

**为什么不在调用侧 guard**：调用侧（`Live2DCanvas.triggerEmotion`）不持有 VTuberModel 的实例引用，无法判断 expressionMap 内容。去重逻辑属于 playExpression 的内部实现关注点，放在 VTuberModel 内最合理。

**为什么不完全静默**：完全静默会让开发者无法发现 expression name 配置错误。首次 warn 保留作为可发现性保障。

## Risks / Trade-offs

- **[Risk] 多实例 VTuberModel**：若同时存在多个模型实例，各自维护独立的 Set，行为正确。无共享状态风险。
- **[Trade-off] 首次 warn 仍然出现**：页面加载后第一次触发情感仍会有一条 warn。可接受，属预期行为。

## Migration Plan

单文件修改，无数据库/API 变更，可随时 git revert。

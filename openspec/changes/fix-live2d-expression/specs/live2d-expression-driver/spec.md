## MODIFIED Requirements

### Requirement: setExpression public interface
`CubismRenderer` SHALL 暴露 `setExpression(name: string): void` 方法；`VTuberModel` SHALL 内部实现 `playExpression(name: string): void`，通过 SDK `CubismMotionManager`（expression 专用实例）切换表情，支持 SDK 默认的淡入淡出过渡（fade-in 1.0s，fade-out 0.5s）。

当 `expressionMap` 中不存在指定 name 时，`playExpression` SHALL 仅在当前模型生命周期内对该 name 输出一次 warn 日志（去重），此后对同一 name 的调用静默忽略，不再重复打印。

#### Scenario: Valid expression name triggers switch
- **WHEN** `setExpression("happy")` 被调用且 `expressionMap` 中存在键 `"happy"`
- **THEN** ExpressionManager 开始播放对应 `CubismExpressionMotion`，模型在下一帧更新中渐变到目标表情参数

#### Scenario: Unknown expression name warns once then silently ignores
- **WHEN** `setExpression("neutral")` 被调用且 `expressionMap` 中不存在该键
- **THEN** 当前表情保持不变，控制台第一次输出 warn 日志，不抛出异常；后续对同一 name 的调用不再输出 warn

#### Scenario: Repeated setExpression resets transition
- **WHEN** 表情过渡进行中再次调用 `setExpression("sad")`
- **THEN** ExpressionManager 丢弃上一个过渡，开始新的淡入过渡

#### Scenario: Warn deduplicate resets on model reload
- **WHEN** 模型被重新加载（`loadModel` 再次调用）
- **THEN** 去重 Set 被清空，新模型的未知 expression 调用可再次触发 warn

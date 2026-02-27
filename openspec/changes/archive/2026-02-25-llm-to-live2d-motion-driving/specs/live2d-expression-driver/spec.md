## ADDED Requirements

### Requirement: Expression preload on model initialization
渲染器在加载 Live2D 模型时，SHALL 读取 `model3.json` 的 `Expressions` 字段，将所有 expression 文件（`.exp3.json`）预加载为 `CubismExpressionMotion` 实例，并以 `Name` 字段为键存入内部 Map。若 `Expressions` 字段不存在或为空，SHALL 静默跳过，不产生错误。

#### Scenario: Model with expressions loads successfully
- **WHEN** `CubismRenderer.loadModel()` 被调用且 `model3.json` 包含非空 `Expressions` 数组
- **THEN** 所有 expression 文件被异步加载完成，`expressionMap` 中包含对应条目，控制台无报错

#### Scenario: Model without expressions degrades gracefully
- **WHEN** `CubismRenderer.loadModel()` 被调用且 `model3.json` 不含 `Expressions` 字段
- **THEN** `expressionMap` 为空，控制台输出 warn 日志，模型正常渲染

---

### Requirement: setExpression public interface
`CubismRenderer` SHALL 暴露 `setExpression(name: string): void` 方法；`VTuberModel` SHALL 内部实现 `playExpression(name: string): void`，通过 SDK `CubismMotionManager`（expression 专用实例）切换表情，支持 SDK 默认的淡入淡出过渡（fade-in 1.0s，fade-out 0.5s）。

#### Scenario: Valid expression name triggers switch
- **WHEN** `setExpression("happy")` 被调用且 `expressionMap` 中存在键 `"happy"`
- **THEN** ExpressionManager 开始播放对应 `CubismExpressionMotion`，模型在下一帧更新中渐变到目标表情参数

#### Scenario: Unknown expression name is silently ignored
- **WHEN** `setExpression("unknown_expr")` 被调用且 `expressionMap` 中不存在该键
- **THEN** 当前表情保持不变，控制台输出 warn 日志，不抛出异常

#### Scenario: Repeated setExpression resets transition
- **WHEN** 表情过渡进行中再次调用 `setExpression("sad")`
- **THEN** ExpressionManager 丢弃上一个过渡，开始新的淡入过渡

---

### Requirement: Live2DCanvasHandle exposes setExpression
React 组件 `Live2DCanvas` 通过 `useImperativeHandle` 暴露的 `Live2DCanvasHandle` 接口 SHALL 新增 `setExpression(name: string): void` 方法，允许父组件（如 `Live2DView`）直接调用。

#### Scenario: Parent component calls setExpression via ref
- **WHEN** `Live2DView` 通过 `canvasRef.current?.setExpression("happy")` 调用
- **THEN** 调用被代理到 `CubismRenderer.setExpression("happy")`，模型表情更新

#### Scenario: setExpression called before model loaded
- **WHEN** 模型尚未加载完成时调用 `setExpression()`
- **THEN** 调用被静默忽略，不产生报错

---

### Requirement: Expression persists until next setExpression call
表情一旦切换，SHALL 持续保持（由 ExpressionManager 维持参数覆盖），直到下一次 `setExpression()` 调用。不自动超时或重置。

#### Scenario: Expression remains after motion completes
- **WHEN** `triggerMotion("happy")` 播放完毕，而 `setExpression("happy")` 仍在生效
- **THEN** 模型面部参数维持 happy 表情，不自动归位

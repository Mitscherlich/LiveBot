## 1. 渲染层：VTuberModel expression 支持

- [x] 1.1 在 `VTuberModel` 类中新增 `expressionMap: Map<string, CubismExpressionMotion>` 成员变量和 `expressionManager: CubismMotionManager` 实例
- [x] 1.2 在 `VTuberModel.initialize()` 中读取 `model3.json` 的 `Expressions` 数组，异步加载所有 `.exp3.json` 文件并存入 `expressionMap`（不存在时静默跳过并打印 warn）
- [x] 1.3 在 `VTuberModel` 中实现 `playExpression(name: string): void`，通过 `expressionManager` 切换表情，未知 name 时打印 warn 并静默忽略
- [x] 1.4 在 `VTuberModel.update()` 中调用 `expressionManager.updateMotion()` 推进 expression 过渡帧

## 2. 渲染层：CubismRenderer 暴露 setExpression

- [x] 2.1 在 `CubismRenderer` 中实现 `setExpression(name: string): void`，代理调用 `this.model?.playExpression(name)`
- [x] 2.2 在 `CubismRenderer.unloadModel()` 中释放 `expressionManager` 资源，防止内存泄漏

## 3. React 组件层：Live2DCanvas 接口扩展

- [x] 3.1 在 `Live2DCanvasHandle` 接口中新增 `setExpression(name: string): void` 方法声明
- [x] 3.2 在 `useImperativeHandle` 中实现 `setExpression`，调用 `rendererRef.current?.setExpression(name)`，model 未加载时静默忽略
- [x] 3.3 将 `EMOTION_MOTION_MAP` 重构为 `EMOTION_MAP: Record<string, { expression: string; motionGroup: string }>`，补全所有 5 个情感标签的双映射
- [x] 3.4 重写 `triggerEmotion(emotion: string)`：从 `EMOTION_MAP` 查找，同时调用 `setExpression(mapping.expression)` 和 `triggerMotion(mapping.motionGroup)`；未知 emotion 时降级为 `triggerMotion("Idle")` 并打印 warn

## 4. 后端：subtitle 消息携带 expression 字段

- [x] 4.1 在 `backend/api/ws_live2d.py` 中定义 `EMOTION_EXPRESSION_MAP: dict[str, str]`，覆盖 5 个情感标签到 expression name 的映射
- [x] 4.2 修改 `TTS_SUBTITLE` 事件的广播逻辑，在消息 dict 中添加 `expression` 字段（从 `EMOTION_EXPRESSION_MAP` 查找，未命中时为 `null`）

## 5. 前端页面层：Live2DView 分发 emotion

- [x] 5.1 确认 `Live2DView.tsx` 的 WebSocket `subtitle` 消息处理已调用 `canvasRef.current?.triggerEmotion(msg.emotion)`（如未实现则补充）
- [x] 5.2 处理 `msg.emotion` 为 undefined/null 的防御性判断，跳过调用不报错

## 6. 验证与测试

- [x] 6.1 确认 `hiyori_pro_zh` 模型的 `model3.json` 中存在 `Expressions` 数组，记录可用 expression name，对齐 `EMOTION_MAP` 中的 expression 取值
- [x] 6.2 在浏览器 DevTools 中验证：LLM 输出 emotion 后，WebSocket `subtitle` 消息包含正确的 `expression` 字段
- [x] 6.3 在 Live2D 渲染画面中目视验证：触发 `"开心"` 情感时，模型面部参数与 happy.exp3.json 一致，且肢体动作同步播放
- [x] 6.4 验证降级场景：将 emotion 设为未知标签（如 `"困惑"`），确认模型不崩溃、表情不异常，仅播放 idle 动作

## 7. 后置优化

- [x] 7.1 在 `VTuberModel.update()` 中，当 `_motionManager.isFinished()` 时自动以 `Priority.Idle` 重启 Idle 动作组，实现情感动作播完后自动回归待机

## 1. 实现 warn 去重

- [ ] 1.1 在 `frontend/src/lib/cubism/CubismRenderer.ts` 的 `VTuberModel` 类中新增私有字段 `_warnedExpressions: Set<string>`，初始化为 `new Set()`
- [ ] 1.2 修改 `VTuberModel.playExpression()` 方法：当 `expressionMap` 中不存在 name 时，检查 `_warnedExpressions.has(name)`，若已存在则直接 return（不打印），否则先 `console.warn` 再 `add(name)` 后 return
- [ ] 1.3 在 `VTuberModel.loadModel()` 的 expression 预加载代码之前，调用 `this._warnedExpressions.clear()` 清空去重 Set（确保模型重载后 warn 可再次触发）

## 2. 验证

- [ ] 2.1 重启前端，发送一条触发"平静"情感的消息，确认控制台只出现一次 `[Live2D] Expression "neutral" not found` warn，后续不再重复
- [ ] 2.2 确认其他情感（"开心"、"悲伤"等）调用行为不受影响

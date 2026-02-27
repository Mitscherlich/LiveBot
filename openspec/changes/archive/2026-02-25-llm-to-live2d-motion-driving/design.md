## Context

当前系统已有完整的 LLM → TTS → 口型同步链路，且 LLM 已输出结构化 JSON（`{"emotion": "...", "text": "..."}`）。前端 `Live2DCanvas` 已通过 `triggerEmotion()` → `triggerMotion(group)` 实现情感到肢体动作的映射，但缺少 expression 文件层的支持，面部表情只能依赖 motion 文件中内嵌的表情轨道，无法独立叠加。

渲染架构：CubismSdkForWeb (WebGL) + React 19 + TypeScript，后端 FastAPI + pyee 异步事件总线 + WebSocket。

## Goals / Non-Goals

**Goals:**
- 在 CubismSdkForWeb 渲染层新增 expression 文件（`.exp3.json`）的加载和切换能力
- 暴露独立的 `setExpression(name)` 接口，与现有 `triggerMotion()` 解耦
- 后端在广播 `subtitle` 消息时携带 `expression` 字段，前端同时触发 expression + motion
- 情感到 expression/motion 的映射表集中配置，易于扩展

**Non-Goals:**
- 不修改后端 LLM 输出格式（保持 `{"emotion": "...", "text": "..."}`）
- 不引入新的后端事件（复用 `TTS_SUBTITLE` 携带 expression 字段）
- 不实现参数级别的实时动画混合（眉毛、眼球位移等细粒度参数留待后续）
- 不修改 CubismSdkForWeb 渲染主循环和 WebGL 渲染架构

## Decisions

### 1. expression 与 motion 共用一个 emotion 标签驱动，还是独立信号？

**决定**：共用同一个 emotion 标签，前端负责拆分为 expression + motion 双触发。

**理由**：后端已有统一的情感标签体系，增加独立信号会引入额外的同步复杂度。前端集中维护 `EMOTION_MAP`（`emotion → { expression, motionGroup }`），修改映射只需改前端一处，无需后端配合。

**备选方案**：后端新增 `LIVE2D_EXPRESSION` 事件独立广播 → 增加事件总线维护成本，拒绝。

---

### 2. expression 加载时机：启动时预加载 vs 按需加载？

**决定**：model 初始化时预加载所有 expression，存入 `Map<name, CubismExpressionMotion>`。

**理由**：expression 文件体积小（通常 < 5KB），预加载可消除切换时的 I/O 延迟，保证表情切换的实时性。与现有 motion 预加载策略保持一致（`CubismRenderer` 已在 `loadModel` 阶段预加载所有 motion group）。

---

### 3. expression 切换方式：瞬切 vs 使用 ExpressionManager？

**决定**：使用 Cubism SDK 的 `CubismExpressionMotion` + `CubismMotionManager` 管理 expression，支持淡入淡出过渡（默认 fade-in 1s）。

**理由**：直接操控参数值会导致表情跳变，视觉体验差。SDK 的 ExpressionManager 已内置过渡逻辑，复用成本低。

---

### 4. 情感映射表放在哪里？

**决定**：前端 `Live2DCanvas.tsx` 中定义常量 `EMOTION_MAP`，结构为：

```typescript
const EMOTION_MAP: Record<string, { expression: string; motionGroup: string }> = {
  开心: { expression: 'happy',     motionGroup: 'Flick'     },
  悲伤: { expression: 'sad',       motionGroup: 'FlickDown' },
  愤怒: { expression: 'angry',     motionGroup: 'Flick'     },
  平静: { expression: 'neutral',   motionGroup: 'Idle'      },
  惊讶: { expression: 'surprised', motionGroup: 'FlickUp'   },
}
```

> motionGroup 取值基于 `hiyori_pro_zh` 模型 `model3.json` 中的实际 MotionGroups 名称（大写开头）。其他模型接入时需对齐对应模型的 motion group 名称。

**理由**：映射是纯前端渲染关注点，不涉及后端业务逻辑，放前端维护更直观。后续若需动态配置，可通过 `/api/config` 下发并缓存到 Zustand store。

---

### 5. 后端消息格式变更

**决定**：在现有 `TTS_SUBTITLE` 广播消息中新增可选 `expression` 字段：

```json
{ "type": "subtitle", "text": "...", "emotion": "开心", "expression": "happy" }
```

后端 `ws_live2d.py` 在广播时从 `EMOTION_MAP`（Python 侧镜像）取 expression name。前端收到后：
- `triggerEmotion(emotion)` → 拆分为 `setExpression(expression)` + `triggerMotion(motionGroup)`

**理由**：expression name 与 emotion 的映射可能因模型而异（不同 Live2D 模型的 expression 文件名不同），后端显式传递 expression name 让前端解耦于映射逻辑，也可在未来支持模型级别的自定义映射。

## Risks / Trade-offs

- **[Risk] 模型不含 expression 文件** → expression 列表为空时 `setExpression` 静默降级，不影响 motion 触发；前端初始化时打印 warn 日志。
- **[Risk] expression name 与模型文件名不匹配** → 映射表中的 expression name 需与 `model3.json` 的 `Expressions[].Name` 字段严格一致；提供 `/api/models/expressions` 接口供前端调试时查询可用 expression 列表（可选）。
- **[Trade-off] expression + motion 同帧触发时的视觉冲突** → motion 文件自带的表情轨道可能与 ExpressionManager 叠加产生参数覆盖；SDK 对同一参数的优先级规则（最后写入者胜）会使 motion 轨道覆盖 expression 参数。若出现问题，可在 motion 文件中移除表情相关参数轨道（模型级修改，不影响代码）。
- **[Risk] 前端 `Live2DCanvasHandle` 接口变更需同步更新使用方** → 仅 `Live2DView.tsx` 持有 `canvasRef`，影响面可控。

## Migration Plan

1. 前端变更独立发布，后端 `subtitle` 消息暂时不传 `expression` 字段时前端降级为纯 motion 触发（向后兼容）
2. 后端添加 `expression` 字段后，前端自动启用双触发
3. 无数据库 migration，无需 rollback 计划

## Open Questions

- 当前 `hiyori_pro_zh` 模型是否包含 expression 文件？需确认 `model3.json` 的 `Expressions` 字段（影响默认映射表的 expression name 取值）
- 是否需要支持 expression 的持续时长控制（如惊讶表情 3s 后自动恢复 neutral）？当前方案无超时重置逻辑

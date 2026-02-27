## Why

当前系统中 LLM 已经输出结构化情感标签（JSON `emotion` 字段），TTS 侧已利用该标签调整音色，但 Live2D 前端对 emotion 的处理仅停留于 motion group 触发，且缺少 expression 文件驱动能力，导致面部表情变化无法独立于肢体动作呈现，角色表现力受限。

## What Changes

- 在 `CubismRenderer` 和 `VTuberModel` 中新增 expression 文件加载与切换能力（`SetExpression` API）
- 在 `Live2DCanvas` React 组件中新增 `setExpression(name)` 公共接口，独立于 `triggerMotion`
- 将情感驱动拆分为两个独立信号：expression（面部表情，持续叠加）和 motion（肢体动作，一次性播放）
- 在 `Live2DView.tsx` 中分别处理 `expression` 和 `motion` 的 WebSocket 消息，支持同时触发
- 在后端事件总线中新增 `LIVE2D_EXPRESSION` 事件，与现有 `TTS_SUBTITLE` 解耦
- 扩展前端情感映射表，支持 emotion → expression + motion 双映射配置

## Capabilities

### New Capabilities

- `live2d-expression-driver`: 在 CubismSdkForWeb 渲染层新增 expression 文件的加载、切换和混合能力；在 React 组件层暴露 `setExpression()` 接口；前端维护 `emotion → expression name` 映射表，独立于 motion 触发
- `live2d-emotion-dispatch`: 后端在 `TTS_SUBTITLE` 广播时同步发出 `LIVE2D_EXPRESSION` 事件（或在现有 subtitle 消息中携带 expression 字段），前端接收后同时触发 expression 切换和 motion 播放，实现面部 + 肢体联动

### Modified Capabilities

（无现有 spec，无需列出）

## Impact

- **`frontend/src/lib/cubism/CubismRenderer.ts`**: 新增 expression 文件预加载（model3.json `Expressions` 组）、`setExpression(name)` 方法
- **`frontend/src/components/Live2DCanvas.tsx`**: 新增 `setExpression(name)` 到 `Live2DCanvasHandle` 接口；拆分 `triggerEmotion` 为独立的 expression + motion 触发
- **`frontend/src/pages/Live2DView.tsx`**: WebSocket `subtitle` 消息处理新增 expression 分发逻辑
- **`backend/core/event_bus.py`**: 新增 `LIVE2D_EXPRESSION` 事件枚举（可选，也可复用 `TTS_SUBTITLE` 携带字段）
- **`backend/api/ws_live2d.py`**: 广播消息中新增 `expression` 字段
- **渲染架构**: 完全保持现有 React + TypeScript + CubismSdkForWeb (WebGL) 方案不变
- **依赖**: 无新增依赖，使用 Live2D Cubism Core SDK 已有的 Expression Manager API

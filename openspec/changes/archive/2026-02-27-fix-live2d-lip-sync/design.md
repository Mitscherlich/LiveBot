## Context

Live2D 口型同步链路：腾讯云 TTS → 后端 Python → WebSocket → 前端 React/TypeScript → Cubism SDK → ParamMouthOpenY。

当前实现存在两处根本缺陷（经代码审查确认）：

**缺陷 1：时间基准不匹配（t0 语义错误）**

后端 `tencent_tts.py` 第 164 行：
```python
t0 = time.time() + 0.05  # Unix epoch 秒
bus.emit(Event.TTS_LIP_SYNC, {"timeline": timeline, "t0": t0 * 1000})  # 转毫秒
```

前端 `Live2DView.tsx` 第 156 行：
```typescript
const openDelay = t0 + beginTime - performance.now()
```

`t0` 是 Unix epoch 毫秒（约 1.7×10¹²），`performance.now()` 是页面加载后的相对毫秒（约 10³ ~ 10⁶）。两者相减结果为极大正数，`setTimeout` 永远不会在正确时刻触发，口型调度完全失效。

**缺陷 2：ParamMouthOpenY 被 Motion 覆盖**

`CubismRenderer.ts` 的 `VTuberModel.update()` 执行顺序：
1. `model.loadParameters()` — 从 Model 状态加载参数快照
2. `this._motionManager.updateMotion(model, deltaSeconds)` — Motion 写入参数（包含 ParamMouthOpenY）
3. `model.saveParameters()` — 保存快照，覆盖外部写入的值
4. `model.update()` — 提交最终值到 Core

外部 `setMouthOpen()` 在渲染循环之间写入 `ParamMouthOpenY`，但 `loadParameters()` 会把之前 `saveParameters()` 保存的快照（含 Motion 值）恢复回来，外部写入被覆盖，永远无效。

**缺陷 3：口型二值跳变体验差**

当前 open=1.0 / close=0.0 的离散跳变会导致嘴巴"闪烁"，即使时序修复后视觉体验也不自然。

---

## Goals / Non-Goals

**Goals:**
- 修复 t0 时间基准，使前端能用 `performance.now()` 正确计算每个字符的开口/闭口延迟
- 修复 ParamMouthOpenY 被覆盖问题，确保口型值在 Cubism update 流程中最后生效
- 实现基于时长的梯形 envelope 平滑口型，替代二值跳变
- 保持后端 WebSocket 消息格式向后兼容（不破坏现有其他消费方）

**Non-Goals:**
- 实现音素级别（phoneme-level）精细口型映射
- 修改腾讯云 TTS API 调用逻辑
- 修改 Cubism Motion 系统（不 fork framework 代码）

---

## Decisions

### 决策 1：t0 改为"相对偏移"方案而非"服务器时钟同步"

**方案 A（选定）**：后端不再发送绝对 epoch 时间，改为前端在收到 `lip_sync` 消息的瞬间记录 `receiveTime = performance.now()`，同时后端额外传入一个 `audioDelay`（音频从入队到实际播放的预估延迟，单位毫秒），前端计算：
```
openAt = receiveTime + audioDelay + beginTime
closeAt = receiveTime + audioDelay + endTime
openDelay = openAt - performance.now()
```

**方案 B**：前后端通过 NTP 或 WebSocket ping-pong 计算时钟偏差后修正。

选 A 的理由：
- 无需额外往返；
- `timeline.beginTime/endTime` 是相对于语音合成开始的偏移量（毫秒），含义清晰；
- `audioDelay` 固定为 50ms（已有缓冲逻辑），可由后端写入消息，前端无需额外逻辑；
- 实现最简单，无状态，可立即验证。

### 决策 2：ParamMouthOpenY 写入位置移至 update() 末尾

在 `VTuberModel.update()` 的 `model.update()` 调用之前，在所有 effect（eyeBlink、breath、physics、pose）之后，追加：
```typescript
if (this._mouthOpenValue !== undefined) {
  const id = CubismFramework.getIdManager().getId('ParamMouthOpenY')
  this._model.setParameterValueById(id, this._mouthOpenValue)
}
```

这样写入发生在 `saveParameters()` 之后，不会被后续流程覆盖。Cubism 内部 `model.update()` 只负责将参数提交到 Core 渲染，不会重置参数值。

**为什么不修改 Framework**：Framework 是官方 TypeScript 源码直接引入，不 fork 可保持升级兼容性。

### 决策 3：梯形 envelope 口型曲线

对每个字符的 `[beginTime, endTime]` 区间：
- 前 20% 时长：从 0 线性插值到 `peakValue`（默认 0.8，避免夸张）
- 中间 60%：保持 `peakValue`
- 后 20%：从 `peakValue` 线性插值到 0

通过 `requestAnimationFrame` 驱动的连续插值循环实现，替代当前的两个 `setTimeout`（open/close）。

`Live2DCanvas` 的 `startMouthLoop`（平滑插值）保留，作为兜底的低通滤波器（系数 0.3），与 envelope 协同——envelope 驱动目标值，`startMouthLoop` 平滑过渡。

### 决策 4：后端 lip_sync 消息新增 audioDelay 字段

```json
{
  "type": "lip_sync",
  "timeline": [...],
  "t0": <废弃，保留兼容>,
  "audioDelay": 50
}
```

`audioDelay` = 50ms（与现有 `t0 = time.time() + 0.05` 的 50ms 缓冲对应）。

---

## Risks / Trade-offs

- **[Risk] audioDelay 不准确**：实际音频队列延迟可能随系统负载浮动，固定 50ms 可能偏早或偏晚 → Mitigation：先用固定值验证流程正确性，后续可通过 PLAYBACK_STARTED 事件动态校准。
- **[Risk] 多句话同时调度冲突**：前一句话的 setTimeout 尚未触发，新一句到来 → Mitigation：在 `scheduleLipSync` 入口取消所有待执行的计时器（保存 timer id 列表并 clearTimeout）。
- **[Trade-off] 不修改 Framework**：Cubism Framework 源码直接导入，通过子类覆盖避免 fork，升级时需重新验证接入点。

---

## Migration Plan

1. 后端添加 `audioDelay` 字段（向后兼容，旧 `t0` 字段保留但前端不再使用）
2. 前端修复 `scheduleLipSync` 时间计算
3. 前端修复 `VTuberModel.update()` 写入顺序
4. 前端升级口型 envelope 逻辑
5. 本地端到端验证：观察 `ParamMouthOpenY` 在 DevTools > 断点 中的实际值变化
6. 无数据库迁移，无 API breaking change，可随时回滚（git revert）

---

## Open Questions

- `audioDelay` 是否应改为动态值（PLAYBACK_STARTED 回传实际开始时刻）？当前先固定 50ms，后续 iteration 再优化。

## 1. 后端：修复 lip_sync 消息格式

- [x] 1.1 在 `backend/pipeline/tts/tencent_tts.py` 的 `TTS_LIP_SYNC` 事件数据中新增 `audioDelay: 50` 字段（整数，毫秒），移除对绝对时间 `t0` 的依赖（保留字段但前端不再使用）
- [x] 1.2 验证后端推送的 lip_sync 消息 JSON 结构符合 `{ type, timeline, audioDelay }` 格式（可通过 WebSocket 调试工具或日志确认）

## 2. 前端：修复 VTuberModel.update() 中 ParamMouthOpenY 被覆盖问题

- [x] 2.1 在 `frontend/src/lib/cubism/CubismRenderer.ts` 的 `VTuberModel` 类中新增 `_mouthOpenValue: number` 私有字段（默认 0）
- [x] 2.2 修改 `VTuberModel.setMouthOpen(value)` 方法，改为将值存入 `_mouthOpenValue` 而非立即写入 model 参数
- [x] 2.3 在 `VTuberModel.update()` 末尾、`model.update()` 调用之前，追加 `ParamMouthOpenY` 写入代码：获取 id 并调用 `this._model.setParameterValueById(id, this._mouthOpenValue)`
- [x] 2.4 本地测试：在 DevTools Console 验证 `ParamMouthOpenY` 实际按预期变化（可在 `setMouthOpen` 调用后打断点观察）

## 3. 前端：修复 scheduleLipSync 时间对齐逻辑

- [x] 3.1 在 `frontend/src/pages/Live2DView.tsx` 的 `scheduleLipSync` 函数中，将 `t0 + beginTime - performance.now()` 改为 `receiveTime + audioDelay + beginTime - performance.now()`（其中 `receiveTime` 为收到消息时的 `performance.now()`，`audioDelay` 来自消息字段）
- [x] 3.2 修改 WebSocket 消息处理器（`msg.type === 'lip_sync'` 分支），在调用 `scheduleLipSync` 前记录 `receiveTime = performance.now()`，并将其传入
- [x] 3.3 在 `scheduleLipSync` 中对 `openDelay < 0` 的条目跳过调度（不安排 setTimeout）
- [x] 3.4 在 `scheduleLipSync` 函数内维护一个 timer id 数组，函数入口处先清除所有上一轮的计时器（`clearTimeout`），再调度新句

## 4. 前端：升级口型 envelope 为梯形平滑曲线

- [x] 4.1 在 `Live2DView.tsx` 的 `scheduleLipSync` 中，将原来的两个 setTimeout（open=1.0 / close=0.0）替换为梯形 envelope 调度：对每个字符区间 `[beginTime, endTime]` 计算三个阶段（淡入 20% / 保持 60% / 淡出 20%），通过多个 setTimeout 分阶段设置 `canvas.setMouthOpen` 目标值
- [x] 4.2 将口型峰值从 1.0 调整为 0.8，避免视觉上夸张
- [x] 4.3 确认 `Live2DCanvas.tsx` 中的 `startMouthLoop`（平滑插值系数 0.3）保持不变，作为低通滤波器协同工作

## 5. 验证与调试

- [x] 5.1 在 `Live2DView.tsx` 收到 `lip_sync` 消息时添加 `console.debug` 日志，输出 `audioDelay`、第一个字符的 `openDelay` 值，确认为合理正数（0~500ms 范围内）
- [x] 5.2 端到端测试：chat 模式发送文字触发完整链路，确认 setMouthOpen 被正常调用（86次/轮，0.24→0.8→0.4→0 梯形包络）；VoiceType 601012 不支持 SubtitleType，改为从 PCM 幅度生成备用时间线，麦克风路径代码路径相同
- [x] 5.3 测试快速连续说话场景（2条消息，8轮口型），旧句计时器被正确清除，maxConsecutiveNonZero=5（相邻字符正常衔接），cleanEnding=true，无混叠
- [x] 5.4 调试日志已为 `console.debug` 级别，已移除临时 `logger.debug` TTS 原始响应日志

## Why

TTS 播放正常、WebSocket 成功收到 `lip_sync` 消息，但 Live2D 角色嘴巴完全没有随语音同步开合。经代码审查发现存在两处根本缺陷：（1）时间基准不匹配——后端用 `time.time() * 1000`（Unix epoch 毫秒）作为 `t0`，而前端用 `performance.now()`（页面加载后的相对毫秒）做对齐计算，导致 `openDelay` 为极大负数，所有 `setTimeout` 立即退化为 0 延迟且时序完全错乱；（2）参数覆盖问题——`CubismRenderer._startLoop` 在每帧调用 `model.update(delta)`，而 `update()` 内部执行 `model.loadParameters()` 再覆盖写回，使得 `setMouthOpen` 直接写入的 `ParamMouthOpenY` 值在同帧内被 Motion 数据覆盖，口型永远无法生效。

## What Changes

- **修复时间基准对齐**：后端 `t0` 改为发送相对时间戳（以 `lip_sync` 消息被前端收到的时刻为基准，或改用消息内嵌的相对偏移量方案），确保前端 `performance.now()` 能正确计算各字符的 open/close 延迟。
- **修复 ParamMouthOpenY 被覆盖问题**：在 `VTuberModel.update()` 的 `model.loadParameters()` / `model.saveParameters()` 之后，以更高优先级追加写入 `ParamMouthOpenY`，保证口型值不被 Motion 覆盖。
- **改善口型插值策略**：将当前仅有 open=1.0 / close=0.0 的二值跳变升级为按字符时长的平滑曲线（梯形 envelope：淡入 → 保持 → 淡出），避免嘴巴"闪烁"。
- **增加调试日志**：前端在收到 `lip_sync` 消息时输出时间偏差，便于后续验证。

## Capabilities

### New Capabilities

- `lip-sync-timing`: 前后端口型同步时间对齐机制——定义 `t0` 的语义、传输格式及前端计算方式，确保每个字符的 open/close 定时精准落在音频播放时刻。

### Modified Capabilities

（无既有 spec 受到需求层面变更）

## Impact

- **后端**：`backend/pipeline/tts/tencent_tts.py` — `t0` 计算逻辑，改为发送相对偏移或改用与前端对齐的时间基准。
- **前端**：
  - `frontend/src/lib/cubism/CubismRenderer.ts` — `VTuberModel.update()` 中 `ParamMouthOpenY` 写入位置；
  - `frontend/src/pages/Live2DView.tsx` — `scheduleLipSync()` 的时间计算逻辑与插值策略；
  - `frontend/src/components/Live2DCanvas.tsx` — `startMouthLoop` 平滑插值循环（可保留，但需与新策略协同）。
- **无新增依赖**，不涉及 API 签名变更，不影响其他页面。

# Lip Sync Timing

## Purpose

Live2D 口型同步时序控制 - 确保 TTS 音频与口型动画精确对齐。

## Requirements

### Requirement: 后端 lip_sync 消息包含 audioDelay 字段
后端在推送 `lip_sync` WebSocket 消息时，消息体中 SHALL 包含 `audioDelay` 字段（整数，毫秒），表示音频从入队到实际播放的预估延迟时间。该字段与 `timeline` 配合使用，供前端计算每个字符的绝对调度时刻。

#### Scenario: 推送包含 audioDelay 的消息
- **WHEN** 后端完成 TTS 合成并将 PCM 放入播放队列
- **THEN** 推送的 `lip_sync` 消息 JSON 结构为 `{ "type": "lip_sync", "timeline": [...], "audioDelay": 50 }`，其中 `audioDelay` 为非负整数

#### Scenario: timeline 时间戳语义
- **WHEN** `lip_sync` 消息被发送
- **THEN** `timeline` 中每个条目的 `beginTime` 和 `endTime` SHALL 为相对于音频播放开始时刻的偏移量（毫秒），不依赖任何绝对时钟

### Requirement: 前端使用 performance.now() 基准对齐口型时序
前端收到 `lip_sync` 消息时，SHALL 以 `performance.now()` 记录接收时刻（`receiveTime`），并结合 `audioDelay` 计算每个字符的调度时刻，不得使用 `msg.t0` 进行时间对齐。

#### Scenario: 正确计算字符开口时刻
- **WHEN** 前端收到 `lip_sync` 消息，消息含 `timeline` 和 `audioDelay`
- **THEN** 对每个字符 entry，前端 SHALL 计算 `openAt = receiveTime + audioDelay + entry.beginTime`，并安排在 `openAt - performance.now()` 毫秒后执行开口动作

#### Scenario: 正确计算字符闭口时刻
- **WHEN** 前端收到 `lip_sync` 消息
- **THEN** 对每个字符 entry，前端 SHALL 计算 `closeAt = receiveTime + audioDelay + entry.endTime`，并安排在 `closeAt - performance.now()` 毫秒后执行闭口动作

#### Scenario: 过期条目跳过
- **WHEN** 某字符的 `openAt - performance.now()` 计算结果为负数
- **THEN** 该字符的开口/闭口调度 SHALL 被跳过，不安排 setTimeout

### Requirement: 新句到来时取消旧句待执行的口型计时器
当前端收到新的 `lip_sync` 消息时，SHALL 取消所有上一句话尚未触发的口型 setTimeout 计时器，防止旧计时器干扰新句的口型时序。

#### Scenario: 清除旧计时器
- **WHEN** 新的 `lip_sync` 消息到达，且上一句话的计时器尚未全部触发
- **THEN** 前端 SHALL 调用 `clearTimeout` 清除所有待执行的计时器，再调度新句的口型

### Requirement: ParamMouthOpenY 写入在 Cubism update 流程末尾生效
`VTuberModel.update()` 内部 SHALL 在 `model.loadParameters()` / `model.saveParameters()` 以及所有 effect 更新之后、`model.update()` 调用之前，将外部设置的口型值写入 `ParamMouthOpenY`，确保不被 Motion 数据覆盖。

#### Scenario: 口型值在帧内最终生效
- **WHEN** `scheduleLipSync` 触发 `setMouthOpen(value)` 并在下一帧 `VTuberModel.update()` 执行
- **THEN** `ParamMouthOpenY` 在该帧提交到 Cubism Core 之前的最终值 SHALL 等于 `setMouthOpen` 设置的目标值（经平滑插值后）

#### Scenario: 无口型控制时 Motion 正常驱动嘴型
- **WHEN** 没有 `lip_sync` 消息到达（口型静默状态）
- **THEN** `ParamMouthOpenY` 的值由 Motion 系统正常驱动（或保持 0），角色表现正常待机状态

### Requirement: 口型采用梯形 envelope 平滑曲线
前端调度口型时，SHALL 对每个字符的 `[beginTime, endTime]` 区间应用梯形 envelope：开口阶段（前 20% 时长）从 0 线性过渡到峰值（0.8），保持阶段（中间 60%）维持峰值，闭口阶段（后 20% 时长）从峰值线性过渡到 0，而非直接跳变到 0 或 1.0。

#### Scenario: 开口过渡平滑
- **WHEN** 口型进入字符 beginTime 时刻
- **THEN** `mouthOpenRef.current` SHALL 从 0 在约 20% 字符时长内平滑上升至 0.8，而非瞬间跳变到 1.0

#### Scenario: 闭口过渡平滑
- **WHEN** 口型进入字符 endTime 之前 20% 时长
- **THEN** `mouthOpenRef.current` SHALL 从 0.8 平滑下降至 0，而非瞬间跳变到 0.0

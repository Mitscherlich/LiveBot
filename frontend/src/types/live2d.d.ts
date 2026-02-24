/**
 * Live2D 相关类型声明
 * CubismCore 全局类型由 public/live2d/core/live2dcubismcore.d.ts 提供
 */

// Cubism Core 加载失败标志（由 index.html 的 onerror 设置）
interface Window {
  __cubismCoreError?: boolean
}

// ── WebSocket 消息类型 ──────────────────────────────────────────────────────
interface LipSyncMessage {
  type: 'lip_sync'
  timeline: Array<{ char: string; beginTime: number; endTime: number }>
  t0: number
}

interface SubtitleMessage {
  type: 'subtitle'
  text: string
  emotion: string
}

interface PlaybackDoneMessage {
  type: 'playback_done'
}

type WsMessage = LipSyncMessage | SubtitleMessage | PlaybackDoneMessage

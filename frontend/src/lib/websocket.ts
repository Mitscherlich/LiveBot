/**
 * WebSocket 客户端（任务 7.7）
 * 连接后端 ws://localhost:8000/ws/live2d
 * 断线自动重连（指数退避，最多 5 次）
 */

type MessageHandler = (msg: WsMessage) => void

const WS_URL = `ws://${window.location.host}/ws/live2d`
const MAX_RETRIES = 5
const BASE_DELAY_MS = 1000

export class Live2DWebSocket {
  private ws: WebSocket | null = null
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private handlers = new Set<MessageHandler>()
  private destroyed = false

  constructor() {
    this.connect()
  }

  private connect() {
    if (this.destroyed) return
    try {
      this.ws = new WebSocket(WS_URL)
      this.ws.onopen = () => {
        this.retryCount = 0
        console.log('[WS] 已连接到后端')
      }
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage
          this.handlers.forEach(h => h(msg))
        } catch {
          // ignore malformed messages
        }
      }
      this.ws.onclose = () => {
        if (!this.destroyed) this.scheduleReconnect()
      }
      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.retryCount >= MAX_RETRIES) {
      console.warn('[WS] 重连次数已达上限，停止重连')
      return
    }
    const delay = BASE_DELAY_MS * Math.pow(2, this.retryCount)
    this.retryCount++
    console.log(`[WS] ${delay}ms 后第 ${this.retryCount} 次重连...`)
    this.retryTimer = setTimeout(() => this.connect(), delay)
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  destroy() {
    this.destroyed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.handlers.clear()
  }
}

// 单例，整个 App 生命周期共享一个连接
let _instance: Live2DWebSocket | null = null
export function getWebSocket(): Live2DWebSocket {
  if (!_instance) _instance = new Live2DWebSocket()
  return _instance
}

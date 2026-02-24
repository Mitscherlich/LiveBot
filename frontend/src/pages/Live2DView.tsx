/**
 * Live2D 渲染页面（任务 7.2-7.9）
 * 左右布局：左侧 Live2D 模型，右侧对话信息流
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Wifi, WifiOff, Bot, Mic, MicOff, GripVertical, Loader2, Trash2 } from 'lucide-react'
import Live2DCanvas, { type Live2DCanvasHandle } from '../components/Live2DCanvas'
import SubtitleDisplay from '../components/SubtitleDisplay'
import { getWebSocket } from '../lib/websocket'
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../lib/chatStorage'

interface SubtitleState {
  text: string
  emotion: string
}

interface ChatMessage {
  id: number
  role: 'bot' | 'user'
  text: string
  emotion?: string
  timestamp: Date
}

const EMOTION_ICON: Record<string, string> = {
  开心: '😊',
  悲伤: '😢',
  愤怒: '😠',
  平静: '😌',
  惊讶: '😲',
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DIVIDER_W = 4 // px
const MIN_PCT = 15
const MAX_PCT = 85

export default function Live2DView() {
  const canvasRef = useRef<Live2DCanvasHandle>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [micRunning, setMicRunning] = useState(false)
  const [micLoading, setMicLoading] = useState(false)
  const [subtitle, setSubtitle] = useState<SubtitleState>({ text: '', emotion: '平静' })
  const [modelName, setModelName] = useState<string | undefined>(undefined)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [leftPct, setLeftPct] = useState(() => {
    const saved = localStorage.getItem('live2d-split')
    return saved ? parseFloat(saved) : 30
  })
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('live2d-scale')
    return saved ? parseFloat(saved) : 1.0
  })

  // 拖拽分隔条逻辑
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, pct))
      setLeftPct(clamped)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setLeftPct(prev => {
        localStorage.setItem('live2d-split', String(prev))
        return prev
      })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setScale(v)
    localStorage.setItem('live2d-scale', String(v))
  }

  // 拉取当前角色配置，获取模型名
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.character?.live2d_model) setModelName(cfg.character.live2d_model)
      })
      .catch(() => {})
  }, [])

  // 麦克风状态轮询
  useEffect(() => {
    const poll = () =>
      fetch('/api/asr/status')
        .then(r => r.json())
        .then(d => setMicRunning(d.running))
        .catch(() => {})
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [])

  const toggleMic = useCallback(async () => {
    setMicLoading(true)
    try {
      const r = await fetch(micRunning ? '/api/asr/stop' : '/api/asr/start', { method: 'POST' })
      const d = await r.json()
      setMicRunning(d.running)
    } catch {
      // ignore
    } finally {
      setMicLoading(false)
    }
  }, [micRunning])

  // 挂载时从 IndexedDB 恢复历史消息
  useEffect(() => {
    loadChatHistory().then(raw => {
      const parsed = (raw as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>)
        .map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
      setMessages(parsed)
    }).catch(() => {})
  }, [])

  // 消息变化时持久化到 IndexedDB
  useEffect(() => {
    saveChatHistory(messages).catch(() => {})
  }, [messages])

  // 新消息时自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 口型时间线调度（任务 7.5）
  const scheduleLipSync = useCallback(
    (timeline: Array<{ char: string; beginTime: number; endTime: number }>, t0: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      for (const { beginTime, endTime } of timeline) {
        const openDelay = t0 + beginTime - performance.now()
        const closeDelay = t0 + endTime - performance.now()
        if (openDelay > 0) setTimeout(() => canvas.setMouthOpen(1.0), openDelay)
        if (closeDelay > 0) setTimeout(() => canvas.setMouthOpen(0.0), closeDelay)
      }
    },
    []
  )

  // WebSocket 消息处理（任务 7.7）
  useEffect(() => {
    const ws = getWebSocket()
    const checkConn = setInterval(() => setWsConnected(ws.connected), 1000)
    setWsConnected(ws.connected)

    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'lip_sync') {
        scheduleLipSync(msg.timeline, msg.t0)
      } else if (msg.type === 'subtitle') {
        setSubtitle({ text: msg.text, emotion: msg.emotion })
        canvasRef.current?.triggerEmotion(msg.emotion)
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'bot',
          text: msg.text,
          emotion: msg.emotion,
          timestamp: new Date(),
        }])
      } else if (msg.type === 'asr_result') {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'user',
          text: msg.text,
          timestamp: new Date(),
        }])
      } else if (msg.type === 'playback_done') {
        canvasRef.current?.setMouthOpen(0.0)
      }
    })

    return () => {
      clearInterval(checkConn)
      unsub()
    }
  }, [scheduleLipSync])

  return (
    <div className="flex flex-col h-full">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-base font-semibold text-gray-200">Live2D 渲染</h2>
        <div className="flex items-center gap-4">
          {/* 缩放控制 */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="w-8 text-right tabular-nums">{scale.toFixed(1)}x</span>
            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.1"
              value={scale}
              onChange={handleScaleChange}
              className="w-28 accent-primary-500 cursor-pointer"
              title="调整模型大小"
            />
          </div>
          {/* 麦克风开关 */}
          <button
            onClick={toggleMic}
            disabled={micLoading}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${
              micRunning
                ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                : 'bg-green-900/40 text-green-300 hover:bg-green-900/60'
            }`}
          >
            {micLoading
              ? <Loader2 size={13} className="animate-spin" />
              : micRunning ? <MicOff size={13} /> : <Mic size={13} />
            }
            {micRunning ? '关闭麦克风' : '开启麦克风'}
          </button>

          {/* WS 连接状态 */}
          <div className="flex items-center gap-2 text-sm">
            {wsConnected ? (
              <><Wifi size={14} className="text-green-400" /><span className="text-green-400">已连接</span></>
            ) : (
              <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">未连接</span></>
            )}
          </div>
        </div>
      </div>

      {/* 主体：左右布局（可拖拽） */}
      <div ref={bodyRef} className="flex flex-1 min-h-0">
        {/* 左侧：Live2D 画布 */}
        <div
          className="relative p-4 shrink-0 overflow-hidden"
          style={{ width: `calc(${leftPct}% - ${DIVIDER_W / 2}px)` }}
        >
          <Live2DCanvas
            ref={canvasRef}
            modelName={modelName}
            scale={scale}
            className="w-full h-full"
          />
          {/* 字幕覆盖层（任务 7.8） */}
          <SubtitleDisplay text={subtitle.text} emotion={subtitle.emotion} />
        </div>

        {/* 拖拽分隔条 */}
        <div
          onMouseDown={onDividerMouseDown}
          style={{ width: DIVIDER_W }}
          className="shrink-0 flex items-center justify-center cursor-col-resize bg-gray-800 hover:bg-primary-600 transition-colors group"
          title="拖拽调整宽度"
        >
          <GripVertical size={14} className="text-gray-600 group-hover:text-white transition-colors" />
        </div>

        {/* 右侧：对话信息流 */}
        <div
          className="flex flex-col border-l border-gray-800 min-w-0 overflow-hidden"
          style={{ width: `calc(${100 - leftPct}% - ${DIVIDER_W / 2}px)` }}
        >
          {/* 面板标题 */}
          <div className="px-4 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">对话记录</span>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); clearChatHistory().catch(() => {}) }}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
                title="清空对话记录"
              >
                <Trash2 size={13} />
                清空
              </button>
            )}
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                <Bot size={32} />
                <p className="text-sm">等待对话开始…</p>
              </div>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {/* 头像行 */}
                  <div className={`flex items-center gap-1.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === 'bot' ? 'bg-primary-600' : 'bg-gray-600'
                    }`}>
                      {msg.role === 'bot'
                        ? <Bot size={12} className="text-white" />
                        : <Mic size={12} className="text-white" />
                      }
                    </div>
                    <span className="text-xs text-gray-600">{formatTime(msg.timestamp)}</span>
                    {msg.role === 'bot' && msg.emotion && (
                      <span className="text-sm" title={msg.emotion}>
                        {EMOTION_ICON[msg.emotion] ?? '💬'}
                      </span>
                    )}
                  </div>

                  {/* 气泡 */}
                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'bot'
                      ? 'bg-gray-800 text-gray-100 rounded-tl-sm'
                      : 'bg-primary-600/20 text-gray-200 rounded-tr-sm border border-primary-500/30'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

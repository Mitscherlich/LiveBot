/**
 * Live2D 渲染页面
 * 左右布局：左侧 Live2D 模型，右侧对话信息流
 *
 * 消息流架构：
 * - 文字模式：fetch POST /api/chat/stream → SSE token 级流式，直接更新 messages state
 * - 语音模式：WebSocket llm_chunk 事件（token 级）提供平滑流式显示
 * - WebSocket 保留用于：subtitle / lip_sync / asr_result / playback_done
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Wifi, WifiOff, Mic, MicOff, GripVertical, Loader2, Trash2, MessageSquare, SlidersHorizontal } from 'lucide-react'
import Live2DCanvas, { type Live2DCanvasHandle } from '../components/Live2DCanvas'
import SubtitleDisplay from '../components/SubtitleDisplay'
import ChatInputBar from '../components/ChatInputBar'
import MessageList from '../components/MessageList'
import type { BubbleMessage } from '../components/MessageBubble'
import { getWebSocket } from '../lib/websocket'
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../lib/chatStorage'
import { useStandaloneMode } from '../hooks/useStandaloneMode'

interface SubtitleState {
  text: string
  emotion: string
}

// emotion → { motionGroup, expression } 调试推导表
const EMOTION_DEBUG_MAP: Record<string, { motionGroup: string; expression: string }> = {
  开心: { motionGroup: 'Flick',     expression: 'happy'     },
  悲伤: { motionGroup: 'FlickDown', expression: 'sad'       },
  愤怒: { motionGroup: 'Flick',     expression: 'angry'     },
  平静: { motionGroup: 'Idle',      expression: 'neutral'   },
  惊讶: { motionGroup: 'FlickUp',   expression: 'surprised' },
}

const DIVIDER_W = 4
const MIN_PCT = 15
const MAX_PCT = 85

export default function Live2DView() {
  const standalone = useStandaloneMode()
  const canvasRef = useRef<Live2DCanvasHandle>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // 当前流式 bot 消息 ID（语音模式）
  const voiceStreamIdRef = useRef<number | null>(null)
  const loadingMsgIdRef = useRef<number | null>(null)
  // 文字模式 SSE 流式消息 ID
  const textStreamIdRef = useRef<number | null>(null)
  const historyLoadedRef = useRef(false)
  const lipSyncTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const chatAbortRef = useRef<AbortController | null>(null)

  const [wsConnected, setWsConnected] = useState(false)
  const [micRunning, setMicRunning] = useState(false)
  const [micLoading, setMicLoading] = useState(false)
  const [subtitle, setSubtitle] = useState<SubtitleState>({ text: '', emotion: '平静' })
  const [modelName, setModelName] = useState<string | undefined>(undefined)
  const [messages, setMessages] = useState<BubbleMessage[]>([])
  const [leftPct, setLeftPct] = useState(() => {
    const saved = localStorage.getItem('live2d-split')
    return saved ? parseFloat(saved) : 30
  })
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('live2d-scale')
    return saved ? parseFloat(saved) : 1.0
  })
  const [chatMode, setChatMode] = useState<'voice' | 'chat'>(() => {
    return (localStorage.getItem('chatMode') as 'voice' | 'chat') ?? 'voice'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [currentMotion, setCurrentMotion] = useState<string>('—')
  const [currentExpression, setCurrentExpression] = useState<string>('—')

  const switchMode = useCallback((mode: 'voice' | 'chat') => {
    setChatMode(mode)
    localStorage.setItem('chatMode', mode)
  }, [])

  // 文字模式：使用 SSE token 级流式
  const onChatSend = useCallback(async (text: string) => {
    // 终结语音模式遗留的流式气泡
    if (voiceStreamIdRef.current !== null) {
      const id = voiceStreamIdRef.current
      setMessages(prev => prev.map(m => m.id === id ? { ...m, streaming: false } : m))
      voiceStreamIdRef.current = null
    }
    if (loadingMsgIdRef.current !== null) {
      const id = loadingMsgIdRef.current
      setMessages(prev => prev.filter(m => m.id !== id))
      loadingMsgIdRef.current = null
    }

    const now = Date.now()
    const streamId = now + 1
    textStreamIdRef.current = streamId

    setMessages(prev => [...prev,
      { id: now, role: 'user', type: 'text', text, timestamp: new Date() },
      { id: streamId, role: 'bot', text: '', streaming: true, timestamp: new Date() },
    ])
    setIsGenerating(true)

    chatAbortRef.current?.abort()
    chatAbortRef.current = new AbortController()

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
        signal: chatAbortRef.current.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }))
        setMessages(prev => [
          ...prev.filter(m => m.id !== streamId),
          { id: Date.now(), role: 'error', text: `发送失败：${err.detail ?? response.statusText}`, timestamp: new Date() },
        ])
        textStreamIdRef.current = null
        setIsGenerating(false)
        return
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let firstChunk = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue
        if (firstChunk) {
          setIsGenerating(false)
          firstChunk = false
        }
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, text: m.text + chunk } : m
        ))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages(prev => [
        ...prev.filter(m => m.id !== streamId),
        { id: Date.now(), role: 'error', text: '发送失败：网络错误', timestamp: new Date() },
      ])
    } finally {
      textStreamIdRef.current = null
      setMessages(prev => prev.map(m =>
        m.id === streamId ? { ...m, streaming: false } : m
      ))
      setIsGenerating(false)
    }
  }, [])

  const onChatStop = useCallback(() => {
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    setIsGenerating(false)
    fetch('/api/chat/stop', { method: 'POST' }).catch(() => {/* 静默 */})
  }, [])

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

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.character?.live2d_model) setModelName(cfg.character.live2d_model)
      })
      .catch(() => {})
  }, [])

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

  useEffect(() => {
    loadChatHistory().then(raw => {
      const parsed = (raw as Array<Omit<BubbleMessage, 'timestamp'> & { timestamp: string }>)
        .map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
      historyLoadedRef.current = true
      setMessages(parsed)
    }).catch(() => { historyLoadedRef.current = true })
  }, [])

  useEffect(() => {
    if (!historyLoadedRef.current) return
    const toSave = messages.filter(m => !m.loading && !m.streaming)
    saveChatHistory(toSave).catch(() => {})
  }, [messages])

  // 口型时间线调度
  const scheduleLipSync = useCallback(
    (timeline: Array<{ char: string; beginTime: number; endTime: number }>, audioDelay: number, receiveTime: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      for (const id of lipSyncTimersRef.current) clearTimeout(id)
      lipSyncTimersRef.current = []

      const PEAK = 0.8

      for (const { beginTime, endTime } of timeline) {
        const baseDelay = receiveTime + audioDelay - performance.now()
        const openAt = baseDelay + beginTime
        const closeAt = baseDelay + endTime
        const duration = endTime - beginTime
        if (openAt < 0) continue

        const fadeIn = duration * 0.2
        const holdEnd = duration - duration * 0.2

        const t1 = openAt
        const t2 = openAt + fadeIn
        const t3 = openAt + holdEnd
        const t4 = closeAt

        const schedule = (delay: number, value: number) => {
          if (delay < 0) { canvas.setMouthOpen(value); return }
          const id = setTimeout(() => canvas.setMouthOpen(value), delay)
          lipSyncTimersRef.current.push(id)
        }

        schedule(t1, PEAK * 0.3)
        schedule(t2, PEAK)
        schedule(t3, PEAK * 0.5)
        schedule(t4, 0.0)
      }
    },
    []
  )

  // WebSocket 消息处理
  useEffect(() => {
    const ws = getWebSocket()
    const checkConn = setInterval(() => setWsConnected(ws.connected), 1000)
    setWsConnected(ws.connected)

    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'lip_sync') {
        const receiveTime = performance.now()
        const audioDelay = typeof msg.audioDelay === 'number' ? msg.audioDelay : 50
        scheduleLipSync(msg.timeline, audioDelay, receiveTime)

      } else if (msg.type === 'subtitle') {
        setSubtitle({ text: msg.text ?? '', emotion: msg.emotion ?? '平静' })
        if (msg.emotion) {
          canvasRef.current?.triggerEmotion(msg.emotion)
          const dbg = EMOTION_DEBUG_MAP[msg.emotion]
          if (dbg) {
            setCurrentMotion(dbg.motionGroup)
            setCurrentExpression(dbg.expression)
          }
        }

      } else if (msg.type === 'asr_result') {
        // 语音模式：用户开口 → 终结上一轮流式气泡，显示语音气泡 + loading
        if (voiceStreamIdRef.current !== null) {
          const id = voiceStreamIdRef.current
          setMessages(prev => prev.map(m => m.id === id ? { ...m, streaming: false } : m))
          voiceStreamIdRef.current = null
        }
        if (loadingMsgIdRef.current !== null) {
          const id = loadingMsgIdRef.current
          setMessages(prev => prev.filter(m => m.id !== id))
          loadingMsgIdRef.current = null
        }
        const now = Date.now()
        const loadId = now + 1
        loadingMsgIdRef.current = loadId
        setMessages(prev => [...prev,
          { id: now, role: 'user', type: 'voice', text: msg.text, timestamp: new Date() },
          { id: loadId, role: 'bot', text: '', loading: true, timestamp: new Date() },
        ])

      } else if (msg.type === 'llm_chunk') {
        // 语音模式：token 级流式文本（仅当文字模式 SSE 未激活时处理）
        if (textStreamIdRef.current !== null) return
        setIsGenerating(false)
        if (loadingMsgIdRef.current !== null) {
          // 第一个 chunk：loading 占位 → 流式气泡
          const id = loadingMsgIdRef.current
          voiceStreamIdRef.current = id
          loadingMsgIdRef.current = null
          setMessages(prev => prev.map(m => m.id === id
            ? { ...m, text: msg.text, loading: false, streaming: true }
            : m
          ))
        } else if (voiceStreamIdRef.current !== null) {
          // 后续 chunk：追加
          const id = voiceStreamIdRef.current
          setMessages(prev => prev.map(m => m.id === id
            ? { ...m, text: m.text + msg.text }
            : m
          ))
        } else {
          // 兜底：新建流式气泡
          const id = Date.now()
          voiceStreamIdRef.current = id
          setMessages(prev => [...prev, { id, role: 'bot', text: msg.text, timestamp: new Date(), streaming: true }])
        }

      } else if (msg.type === 'llm_done') {
        setIsGenerating(false)
        if (voiceStreamIdRef.current !== null) {
          const id = voiceStreamIdRef.current
          setMessages(prev => prev.map(m => m.id === id ? { ...m, streaming: false } : m))
          voiceStreamIdRef.current = null
        }
        if (loadingMsgIdRef.current !== null) {
          const id = loadingMsgIdRef.current
          setMessages(prev => prev.filter(m => m.id !== id))
          loadingMsgIdRef.current = null
        }

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
    <div className="flex flex-col h-full relative">
      {/* 顶部状态栏 */}
      {!standalone && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0 relative z-20">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold text-gray-200 shrink-0">Live2D 渲染</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <DebugChip label="模型" value={modelName ?? '—'} />
              <DebugChip label="动作" value={currentMotion} />
              <DebugChip label="表情" value={currentExpression} />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setDebugOpen(v => !v)}
              className={`flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors ${
                debugOpen
                  ? 'bg-primary-600/30 text-primary-300'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
              title="调试面板"
            >
              <SlidersHorizontal size={13} />
              调试
            </button>
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
            <div className="flex items-center gap-2 text-sm">
              {wsConnected ? (
                <><Wifi size={14} className="text-green-400" /><span className="text-green-400">已连接</span></>
              ) : (
                <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">未连接</span></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 调试抽屉 */}
      {!standalone && debugOpen && (
        <div className="absolute top-[49px] right-4 z-30 w-64 rounded-xl border border-gray-700 bg-gray-900/95 backdrop-blur-sm shadow-xl">
          <div className="px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">调试面板</span>
          </div>
          <div className="px-4 py-3 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">模型大小</span>
                <span className="text-xs tabular-nums text-gray-300 font-mono">{scale.toFixed(1)}x</span>
              </div>
              <input
                type="range" min="0.2" max="3.0" step="0.1" value={scale}
                onChange={handleScaleChange}
                className="w-full accent-primary-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* 主体 */}
      {standalone ? (
        <div className="w-full h-full">
          <Live2DCanvas ref={canvasRef} modelName={modelName} scale={scale} className="w-full h-full" />
        </div>
      ) : (
        <div ref={bodyRef} className="flex flex-1 min-h-0">
          {/* 左侧：Live2D 画布 */}
          <div
            className="relative p-4 shrink-0 overflow-hidden"
            style={{ width: `calc(${leftPct}% - ${DIVIDER_W / 2}px)` }}
          >
            <Live2DCanvas ref={canvasRef} modelName={modelName} scale={scale} className="w-full h-full" />
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
              <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-0.5">
                <button
                  onClick={() => switchMode('voice')}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                    chatMode === 'voice' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Mic size={12} />
                  语音
                </button>
                <button
                  onClick={() => switchMode('chat')}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                    chatMode === 'chat' ? 'bg-primary-600/40 text-primary-300' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <MessageSquare size={12} />
                  文字
                </button>
              </div>
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
            <MessageList messages={messages} />

            {/* Chat 模式输入栏 */}
            {chatMode === 'chat' && (
              <ChatInputBar onSend={onChatSend} isGenerating={isGenerating} onStop={onChatStop} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DebugChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-900 border border-gray-700/60 rounded px-1.5 py-0.5 font-mono">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 max-w-[10rem] truncate" title={value}>{value}</span>
    </span>
  )
}

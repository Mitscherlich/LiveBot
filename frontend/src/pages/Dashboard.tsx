/**
 * Dashboard 页面（任务 8.1, 9.5）
 * 实时显示 ASR/LLM/TTS 各模块运行状态和最近日志
 */
import { useEffect, useState, useCallback } from 'react'
import { Activity, Cpu, Mic, MicOff, MessageSquare, Volume2, RefreshCw, Loader2 } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { getWebSocket } from '../lib/websocket'

interface SystemStatus {
  status: string
}

interface LogEntry {
  time: string
  type: string
  message: string
}

const MAX_LOGS = 50

export default function Dashboard() {
  const [systemStatus, setSystemStatus] = useState<'online' | 'offline' | 'loading'>('loading')
  const [wsStatus, setWsStatus] = useState<'online' | 'offline' | 'loading'>('loading')
  const [micRunning, setMicRunning] = useState(false)
  const [micLoading, setMicLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  // 轮询后端状态 + 麦克风状态
  useEffect(() => {
    const poll = async () => {
      try {
        const [sysR, asrR] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/asr/status'),
        ])
        const sysData: SystemStatus = await sysR.json()
        setSystemStatus(sysData.status === 'running' ? 'online' : 'offline')
        const asrData = await asrR.json()
        setMicRunning(asrData.running)
      } catch {
        setSystemStatus('offline')
      }
    }
    poll()
    const timer = setInterval(poll, 3000)
    return () => clearInterval(timer)
  }, [])

  const toggleMic = useCallback(async () => {
    setMicLoading(true)
    try {
      const url = micRunning ? '/api/asr/stop' : '/api/asr/start'
      const r = await fetch(url, { method: 'POST' })
      const data = await r.json()
      setMicRunning(data.running)
    } catch {
      // ignore
    } finally {
      setMicLoading(false)
    }
  }, [micRunning])

  // WebSocket 连接状态 + 日志收集
  useEffect(() => {
    const ws = getWebSocket()
    const checkConn = setInterval(() => {
      setWsStatus(ws.connected ? 'online' : 'offline')
    }, 1000)
    setWsStatus(ws.connected ? 'online' : 'offline')

    const unsub = ws.onMessage((msg) => {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      let logEntry: LogEntry | null = null

      if (msg.type === 'subtitle') {
        logEntry = { time: now, type: 'LLM→TTS', message: `${msg.emotion} | ${msg.text}` }
      } else if (msg.type === 'lip_sync') {
        logEntry = { time: now, type: 'TTS', message: `口型时间线推送 (${msg.timeline.length} 字)` }
      } else if (msg.type === 'playback_done') {
        logEntry = { time: now, type: 'TTS', message: '播放完成' }
      }

      if (logEntry) {
        setLogs(prev => [logEntry!, ...prev].slice(0, MAX_LOGS))
      }
    })

    return () => {
      clearInterval(checkConn)
      unsub()
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">系统仪表盘</h1>
        <span className="text-xs text-gray-500">每 3 秒刷新</span>
      </div>

      {/* 模块状态卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ModuleCard icon={<Activity size={20} />} title="系统" status={systemStatus} />
        {/* ASR 卡片 — 带麦克风开关 */}
        <div className="card">
          <div className={`flex items-center gap-2 mb-2 ${micRunning ? 'text-green-400' : 'text-gray-500'}`}>
            {micRunning ? <Mic size={20} /> : <MicOff size={20} />}
            <span className={`text-xs font-semibold ${micRunning ? '' : 'text-gray-500'}`}>
              {micRunning ? '采集中' : '已停止'}
            </span>
          </div>
          <p className="text-sm text-gray-300 mb-3">ASR（语音识别）</p>
          <button
            onClick={toggleMic}
            disabled={micLoading || systemStatus !== 'online'}
            className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${
              micRunning
                ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                : 'bg-green-900/40 text-green-300 hover:bg-green-900/60'
            }`}
          >
            {micLoading
              ? <Loader2 size={12} className="animate-spin" />
              : micRunning ? <MicOff size={12} /> : <Mic size={12} />
            }
            {micRunning ? '关闭麦克风' : '开启麦克风'}
          </button>
        </div>
        <ModuleCard icon={<MessageSquare size={20} />} title="LLM（大模型）" status={systemStatus} />
        <ModuleCard icon={<Volume2 size={20} />} title="TTS（语音合成）" status={systemStatus} />
      </div>

      {/* 连接状态 */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
          <Cpu size={16} /> 连接状态
        </h2>
        <div className="space-y-3">
          <StatusBadge label="后端 API (HTTP)" status={systemStatus} />
          <StatusBadge label="WebSocket (Live2D)" status={wsStatus} />
        </div>
      </div>

      {/* 实时日志 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
            <RefreshCw size={16} /> 实时事件日志
          </h2>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            清空
          </button>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-600 text-center py-8">等待事件...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-3 text-gray-400">
                <span className="text-gray-600 flex-none">{log.time}</span>
                <span className={`flex-none font-medium ${
                  log.type === 'LLM→TTS' ? 'text-purple-400'
                  : log.type === 'TTS' ? 'text-blue-400'
                  : 'text-green-400'
                }`}>[{log.type}]</span>
                <span className="text-gray-300 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ModuleCard({
  icon,
  title,
  status,
}: {
  icon: React.ReactNode
  title: string
  status: 'online' | 'offline' | 'loading'
}) {
  const color = status === 'online' ? 'text-green-400' : status === 'loading' ? 'text-yellow-400' : 'text-red-400'
  const label = status === 'online' ? '运行中' : status === 'loading' ? '检测中' : '离线'
  return (
    <div className="card">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {icon}
        <span className={`text-xs font-semibold ${status === 'loading' ? 'animate-pulse' : ''}`}>{label}</span>
      </div>
      <p className="text-sm text-gray-300">{title}</p>
    </div>
  )
}

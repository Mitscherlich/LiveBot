/**
 * 对话记录页 — 实时显示语音对话内容
 * 语音模式下通过 WebSocket llm_chunk 事件获得 token 级流式显示
 */
import { useEffect, useState, useRef } from 'react'
import { getWebSocket } from '../lib/websocket'
import MessageList from '../components/MessageList'
import type { BubbleMessage } from '../components/MessageBubble'

const MAX_MESSAGES = 100

export default function Chat() {
  const [messages, setMessages] = useState<BubbleMessage[]>([])
  const idRef = useRef(0)
  const streamingIdRef = useRef<number | null>(null)

  useEffect(() => {
    const ws = getWebSocket()
    const unsub = ws.onMessage((msg) => {
      if (msg.type === 'asr_result') {
        const userId = ++idRef.current
        const botId = ++idRef.current
        streamingIdRef.current = botId
        setMessages(prev => ([
          ...prev,
          { id: userId, role: 'user' as const, type: 'voice' as const, text: msg.text, timestamp: new Date() },
          { id: botId, role: 'bot' as const, text: '', streaming: true, timestamp: new Date() },
        ] as BubbleMessage[]).slice(-MAX_MESSAGES))
      } else if (msg.type === 'llm_chunk') {
        const id = streamingIdRef.current
        if (id === null) return
        setMessages(prev => prev.map(m =>
          m.id === id ? { ...m, text: m.text + msg.text } : m
        ))
      } else if (msg.type === 'llm_done') {
        const id = streamingIdRef.current
        streamingIdRef.current = null
        if (id !== null) {
          setMessages(prev => prev.map(m =>
            m.id === id ? { ...m, streaming: false } : m
          ))
        }
      }
    })
    return () => { unsub() }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-gray-100">对话记录</h1>
        <p className="text-xs text-gray-500 mt-0.5">实时显示语音对话内容</p>
      </div>
      <MessageList messages={messages} className="px-3" />
    </div>
  )
}

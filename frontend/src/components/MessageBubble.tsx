/**
 * MessageBubble — 消息气泡组件
 * 使用 ai-elements MessageResponse 渲染 Markdown（含 GFM 表格、代码块、数学公式）
 * 支持 text（文字对话）和 voice（ASR 语音识别结果）两种用户消息形态
 */
import { memo } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Bot, Mic } from 'lucide-react'

export interface BubbleMessage {
  id: number
  role: 'bot' | 'user' | 'error'
  type?: 'text' | 'voice'
  text: string
  emotion?: string
  timestamp: Date
  streaming?: boolean
  loading?: boolean
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

interface MessageBubbleProps {
  msg: BubbleMessage
}

const MessageBubble = memo(function MessageBubble({ msg }: MessageBubbleProps) {
  if (msg.role === 'error') {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-red-400/80 bg-red-900/20 rounded-lg px-3 py-1.5 border border-red-900/30">
          {msg.text}
        </span>
      </div>
    )
  }

  const isUser = msg.role === 'user'
  const isVoice = msg.type === 'voice'

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* 头像行 */}
      <div className={`flex items-center gap-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? isVoice ? 'bg-violet-600' : 'bg-gray-600'
            : 'bg-primary-600'
        }`}>
          {isUser
            ? <Mic size={11} className="text-white" />
            : <Bot size={11} className="text-white" />
          }
        </div>
        <span className="text-[10px] text-gray-600 tabular-nums">{formatTime(msg.timestamp)}</span>
        {!isUser && msg.emotion && (
          <span className="text-xs leading-none" title={msg.emotion}>
            {EMOTION_ICON[msg.emotion] ?? '💬'}
          </span>
        )}
        {isVoice && (
          <span className="text-[10px] text-violet-500 font-medium">语音</span>
        )}
      </div>

      {/* 气泡 */}
      <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
        isUser
          ? isVoice
            ? 'bg-violet-900/30 text-violet-100 rounded-tr-sm border border-violet-500/20'
            : 'bg-primary-600/20 text-gray-200 rounded-tr-sm border border-primary-500/30'
          : 'bg-gray-800/90 text-gray-100 rounded-tl-sm border border-gray-700/50'
      }`}>
        {!isUser && msg.loading ? (
          <div className="flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
          </div>
        ) : !isUser ? (
          <MessageResponse
            animated
            isAnimating={msg.streaming}
            className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sm text-gray-100
              [&_table]:border-collapse [&_table]:w-full [&_table]:text-xs
              [&_th]:border [&_th]:border-gray-600 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-700/60
              [&_td]:border [&_td]:border-gray-700 [&_td]:px-2 [&_td]:py-1
              [&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs"
          >
            {msg.text || ' '}
          </MessageResponse>
        ) : (
          <span>{msg.text}</span>
        )}
      </div>
    </div>
  )
})

export default MessageBubble

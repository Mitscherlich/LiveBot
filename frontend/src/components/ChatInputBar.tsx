import { useState, useRef, useCallback } from 'react'
import { Send, Square } from 'lucide-react'

interface ChatInputBarProps {
  onSend: (text: string) => Promise<void>
  isGenerating?: boolean
  onStop?: () => void
}

export default function ChatInputBar({ onSend, isGenerating, onStop }: ChatInputBarProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = useCallback(async () => {
    const text = value.trim()
    if (!text || sending || isGenerating) return
    setSending(true)
    setValue('')
    try {
      await onSend(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [value, sending, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const showStop = isGenerating && !sending

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-800 shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息，按 Enter 发送…"
        disabled={sending}
        className="flex-1 bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-2 outline-none placeholder-gray-600 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {showStop ? (
        <button
          onClick={onStop}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors shrink-0"
          title="停止生成"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!value.trim() || sending}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title="发送 (Enter)"
        >
          <Send size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * 字幕显示组件（任务 7.8）
 * 在 Canvas 下方渲染字幕文本，淡入淡出动画
 */
import { useEffect, useState } from 'react'

const EMOTION_ICON: Record<string, string> = {
  开心: '😊',
  悲伤: '😢',
  愤怒: '😠',
  平静: '😌',
  惊讶: '😲',
}

interface Props {
  text: string
  emotion: string
}

export default function SubtitleDisplay({ text, emotion }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (text) {
      setVisible(true)
      // 字幕显示后 5 秒淡出
      const timer = setTimeout(() => setVisible(false), 5000)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [text])

  if (!text) return null

  const icon = EMOTION_ICON[emotion] ?? '💬'

  return (
    <div
      className={`
        absolute bottom-4 left-1/2 -translate-x-1/2
        max-w-lg w-full px-4 transition-opacity duration-500
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div className="bg-black/70 backdrop-blur-sm rounded-xl px-5 py-3 text-center border border-white/10">
        <span className="text-lg mr-2">{icon}</span>
        <span className="text-white text-base leading-relaxed">{text}</span>
      </div>
    </div>
  )
}

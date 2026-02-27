/**
 * MessageList — 对话列表组件
 * 使用 ai-elements Conversation 实现自动吸底滚动 + 滚动到底按钮
 */
import { Bot } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import MessageBubble, { type BubbleMessage } from './MessageBubble'

interface MessageListProps {
  messages: BubbleMessage[]
  className?: string
}

export default function MessageList({ messages, className = '' }: MessageListProps) {
  return (
    <Conversation className={className}>
      <ConversationContent className="gap-3 px-3 py-3">
        {messages.length === 0 ? (
          <ConversationEmptyState
            icon={<Bot size={32} className="text-gray-600" />}
            title="等待对话开始…"
            description=""
            className="text-gray-600"
          />
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

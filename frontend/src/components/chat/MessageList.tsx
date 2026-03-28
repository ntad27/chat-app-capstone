import { useEffect, useRef } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { ChatMessage } from './ChatMessage'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bottomRef.current?.scrollIntoView) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.length === 0 && (
        <div className="text-center text-gray-600 mt-12">
          <p className="text-lg font-medium text-gray-400">Welcome to Deep Analyst</p>
          <p className="text-sm mt-1">Enter a research topic to start a multi-agent investigation</p>
        </div>
      )}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

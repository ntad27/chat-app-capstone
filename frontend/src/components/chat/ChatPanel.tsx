import { useChatStore } from '../../stores/chat-store'
import { useSessionStore } from '../../stores/session-store'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { AskUserPrompt } from './AskUserPrompt'
import { ActivityTicker } from './ActivityTicker'

export function ChatPanel() {
  const pendingQuestion = useChatStore((s) => s.pendingQuestion)
  const activityText = useChatStore((s) => s.activityText)
  const status = useSessionStore((s) => s.status)

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300">Chat</h2>
      </div>
      <MessageList />
      {pendingQuestion && (
        <AskUserPrompt
          question={pendingQuestion.question}
          requestId={pendingQuestion.requestId}
        />
      )}
      {activityText && (status === 'running' || status === 'paused') && (
        <ActivityTicker text={activityText} />
      )}
      <ChatInput />
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useSessionStore } from '../../stores/session-store'
import { sendAnswer } from '../../lib/api'

interface Props {
  question: string
  requestId: string
}

export function AskUserPrompt({ question: _question, requestId: _requestId }: Props) {
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const sessionId = useSessionStore((s) => s.sessionId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!answer.trim() || !sessionId || sending) return

    setSending(true)
    useChatStore.getState().addUserMessage(answer)
    useChatStore.getState().clearPendingQuestion()

    try {
      await sendAnswer(sessionId, answer.trim())
    } catch {
      useChatStore.getState().addErrorMessage('Failed to send answer', 'system')
    } finally {
      setSending(false)
      setAnswer('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 mx-3 mb-2 bg-amber-950/50 border border-amber-800/50 rounded-lg">
      <p className="text-xs text-amber-400 mb-2 font-medium">Agent needs your input</p>
      <div className="flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          disabled={sending}
          autoFocus
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={sending || !answer.trim()}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {sending ? '...' : 'Answer'}
        </button>
      </div>
    </form>
  )
}

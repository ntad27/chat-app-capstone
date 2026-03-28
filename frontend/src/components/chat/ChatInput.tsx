import { useState, type FormEvent } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { useSessionStore } from '../../stores/session-store'
import { useTraceStore } from '../../stores/trace-store'
import { createSession } from '../../lib/api'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const status = useSessionStore((s) => s.status)
  const disabled = status === 'running' || status === 'paused' || loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || disabled) return

    const query = input.trim()
    setInput('')
    setLoading(true)

    useChatStore.getState().addUserMessage(query)
    useChatStore.getState().reset
    useTraceStore.getState().reset()

    try {
      const sessionId = await createSession(query)
      useSessionStore.getState().setSessionId(sessionId)
    } catch {
      useChatStore.getState().addErrorMessage('Failed to start research session', 'system')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-800">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? 'Research in progress...' : 'Enter a research topic...'}
          disabled={disabled}
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  )
}

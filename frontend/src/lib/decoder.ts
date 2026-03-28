import type { NormalizedEvent } from '../types/events'
import { useTraceStore } from '../stores/trace-store'
import { useChatStore } from '../stores/chat-store'
import { useSessionStore } from '../stores/session-store'

/**
 * Central event decoder. Routes each event type to the correct store action.
 * Called once per SSE message. Synchronous (store updates are sync).
 */
export function decodeEvent(event: NormalizedEvent): void {
  const trace = useTraceStore.getState()
  const chat = useChatStore.getState()
  const session = useSessionStore.getState()

  // All events update the trace tree
  trace.applyEvent(event)

  // Event-specific side effects
  switch (event.type) {
    case 'session_start':
      session.setStatus('running')
      chat.addSystemMessage('Research session started')
      break

    case 'thinking':
      break

    case 'tool_use_start':
      chat.updateActivity(`${event.agent_name}: using ${event.data.tool_name}...`)
      break

    case 'tool_use_end':
      break

    case 'subagent_start':
      chat.updateActivity(`Starting ${event.data.agent_name}${event.data.subtopic ? `: ${event.data.subtopic}` : ''}...`)
      break

    case 'subagent_end':
      chat.updateActivity(`${event.data.agent_name} ${event.data.status}`)
      break

    case 'agent_response':
      if (event.data.text) {
        chat.addAssistantMessage(event.data.text, event.data.artifacts)
      }
      break

    case 'ask_user':
      session.setStatus('paused')
      chat.setPendingQuestion(event.data.question, event.data.request_id)
      break

    case 'error':
      chat.addErrorMessage(event.data.message, event.data.agent_name)
      if (!event.data.recoverable) session.setStatus('failed')
      break

    case 'done':
      session.setStatus('completed')
      chat.addSystemMessage('Research complete')
      chat.updateActivity('')
      break
  }
}

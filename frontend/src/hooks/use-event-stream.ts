import { useCallback } from 'react'
import { useSSE } from './use-sse'
import { decodeEvent } from '../lib/decoder'
import { useSessionStore } from '../stores/session-store'
import { getStreamUrl } from '../lib/api'
import type { NormalizedEvent } from '../types/events'

export function useEventStream() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const mockMode = useSessionStore((s) => s.mockMode)
  const url = sessionId ? getStreamUrl(sessionId, mockMode) : null

  const handleMessage = useCallback((data: unknown) => {
    decodeEvent(data as NormalizedEvent)
  }, [])

  useSSE(url, handleMessage)
}

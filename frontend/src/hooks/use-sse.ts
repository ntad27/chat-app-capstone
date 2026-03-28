import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/session-store'

export function useSSE(
  url: string | null,
  onMessage: (data: unknown) => void,
) {
  const reconnectCount = useRef(0)
  const maxReconnects = 5
  const esRef = useRef<EventSource | null>(null)
  const setConnected = useSessionStore((s) => s.setConnected)

  const connect = useCallback(() => {
    if (!url) return undefined

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      reconnectCount.current = 0
    }

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        onMessage(data)
        if (data.type === 'done') {
          es.close()
          setConnected(false)
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e)
      }
    }

    es.onerror = () => {
      es.close()
      setConnected(false)
      if (reconnectCount.current < maxReconnects) {
        const delay = Math.min(1000 * Math.pow(2, reconnectCount.current), 30000)
        reconnectCount.current += 1
        setTimeout(connect, delay)
      }
    }

    return es
  }, [url, onMessage, setConnected])

  useEffect(() => {
    const es = connect()
    return () => {
      es?.close()
      esRef.current = null
    }
  }, [connect])
}

import { create } from 'zustand'

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

interface SessionState {
  sessionId: string | null
  status: SessionStatus
  connected: boolean
  setSessionId: (id: string) => void
  setStatus: (status: SessionStatus) => void
  setConnected: (connected: boolean) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: 'idle',
  connected: false,
  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ sessionId: null, status: 'idle', connected: false }),
}))

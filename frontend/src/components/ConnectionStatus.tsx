import { useSessionStore } from '../stores/session-store'

export function ConnectionStatus() {
  const connected = useSessionStore((s) => s.connected)
  const status = useSessionStore((s) => s.status)

  const statusLabel = status === 'idle' ? 'Ready' : status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div className="h-9 px-4 flex items-center justify-between bg-gray-900 text-white text-xs border-b border-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold tracking-tight">Deep Analyst</span>
        <span className="text-gray-500">Research Intelligence Platform</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : status === 'idle' ? 'bg-gray-500' : 'bg-yellow-400 animate-pulse'}`} />
        <span className="text-gray-400">{statusLabel}</span>
      </div>
    </div>
  )
}

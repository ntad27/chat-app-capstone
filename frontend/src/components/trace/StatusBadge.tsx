import type { AgentStatus } from '../../types/events'

const statusConfig: Record<AgentStatus, { color: string; title: string }> = {
  queued: { color: 'bg-gray-500', title: 'Queued' },
  running: { color: 'bg-blue-500 animate-pulse', title: 'Running' },
  completed: { color: 'bg-green-500', title: 'Completed' },
  failed: { color: 'bg-red-500', title: 'Failed' },
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const config = statusConfig[status]
  return (
    <span
      title={config.title}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${config.color}`}
    />
  )
}

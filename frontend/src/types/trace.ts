import type { AgentStatus, Artifact } from './events'

export interface TraceNode {
  id: string
  label: string
  type: 'agent' | 'tool' | 'thinking' | 'response' | 'ask_user'
  status: AgentStatus
  agentName: string
  agentRole: string
  parentId: string | null
  children: string[]
  startTime: number
  endTime?: number
  data: Record<string, unknown>
  artifacts: Artifact[]
}

export interface TraceTree {
  rootId: string | null
  nodes: Record<string, TraceNode>
}

export type AgentStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Artifact {
  name: string
  content: string
  type: 'markdown' | 'code' | 'table' | 'chart'
}

// Discriminated union — enables exhaustive switch on event.type
export type NormalizedEvent =
  | SessionStartEvent
  | ThinkingEvent
  | ToolUseStartEvent
  | ToolUseEndEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | AgentResponseEvent
  | AskUserEvent
  | ErrorEvent
  | DoneEvent

interface BaseEvent {
  id: string
  timestamp: number
  agent_name: string
  agent_role: string
  parent_tool_use_id: string | null
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start'
  data: { model: string; session_id: string }
}

export interface ThinkingEvent extends BaseEvent {
  type: 'thinking'
  data: { text: string }
}

export interface ToolUseStartEvent extends BaseEvent {
  type: 'tool_use_start'
  data: { tool_use_id: string; tool_name: string; input: Record<string, unknown> }
}

export interface ToolUseEndEvent extends BaseEvent {
  type: 'tool_use_end'
  data: { tool_use_id: string; tool_name: string; output: string; error?: string }
}

export interface SubagentStartEvent extends BaseEvent {
  type: 'subagent_start'
  data: { agent_name: string; agent_role: string; tool_use_id: string; subtopic?: string }
}

export interface SubagentEndEvent extends BaseEvent {
  type: 'subagent_end'
  data: { agent_name: string; status: AgentStatus; output?: string }
}

export interface AgentResponseEvent extends BaseEvent {
  type: 'agent_response'
  data: { text: string; artifacts?: Artifact[] }
}

export interface AskUserEvent extends BaseEvent {
  type: 'ask_user'
  data: { question: string; request_id: string }
}

export interface ErrorEvent extends BaseEvent {
  type: 'error'
  data: { message: string; agent_name: string; recoverable: boolean }
}

export interface DoneEvent extends BaseEvent {
  type: 'done'
  data: { exit_reason: string; total_tokens?: number }
}

import type {
  SessionStartEvent,
  ThinkingEvent,
  ToolUseStartEvent,
  ToolUseEndEvent,
  SubagentStartEvent,
  SubagentEndEvent,
  AgentResponseEvent,
  AskUserEvent,
  ErrorEvent,
  DoneEvent,
} from '../../types/events'

let counter = 0
function nextId(): string {
  return `test-${++counter}`
}

export function resetCounter() {
  counter = 0
}

export function makeSessionStart(overrides?: Partial<SessionStartEvent>): SessionStartEvent {
  return {
    id: nextId(),
    type: 'session_start',
    timestamp: Date.now(),
    agent_name: 'lead-analyst',
    agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { model: 'claude-sonnet-4-20250514', session_id: 'test-session' },
    ...overrides,
  }
}

export function makeThinking(
  agentName = 'lead-analyst',
  text = 'Analyzing...',
  parentToolUseId: string | null = null,
): ThinkingEvent {
  return {
    id: nextId(),
    type: 'thinking',
    timestamp: Date.now(),
    agent_name: agentName,
    agent_role: 'orchestrator',
    parent_tool_use_id: parentToolUseId,
    data: { text },
  }
}

export function makeToolStart(
  toolUseId: string,
  toolName: string,
  agentName = 'lead-analyst',
  parentToolUseId: string | null = null,
): ToolUseStartEvent {
  return {
    id: nextId(),
    type: 'tool_use_start',
    timestamp: Date.now(),
    agent_name: agentName,
    agent_role: 'orchestrator',
    parent_tool_use_id: parentToolUseId,
    data: { tool_use_id: toolUseId, tool_name: toolName, input: {} },
  }
}

export function makeToolEnd(
  toolUseId: string,
  toolName: string,
  output = 'done',
): ToolUseEndEvent {
  return {
    id: nextId(),
    type: 'tool_use_end',
    timestamp: Date.now(),
    agent_name: 'lead-analyst',
    agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { tool_use_id: toolUseId, tool_name: toolName, output },
  }
}

export function makeSubagentStart(
  agentName: string,
  toolUseId: string,
  parentToolUseId: string,
): SubagentStartEvent {
  return {
    id: nextId(),
    type: 'subagent_start',
    timestamp: Date.now(),
    agent_name: agentName,
    agent_role: 'researcher',
    parent_tool_use_id: parentToolUseId,
    data: { agent_name: agentName, agent_role: 'researcher', tool_use_id: toolUseId },
  }
}

export function makeSubagentEnd(
  agentName: string,
  status: 'completed' | 'failed' = 'completed',
): SubagentEndEvent {
  return {
    id: nextId(),
    type: 'subagent_end',
    timestamp: Date.now(),
    agent_name: agentName,
    agent_role: 'researcher',
    parent_tool_use_id: null,
    data: { agent_name: agentName, status },
  }
}

export function makeAskUser(
  question = 'What angle?',
  requestId = 'req-1',
): AskUserEvent {
  return {
    id: nextId(),
    type: 'ask_user',
    timestamp: Date.now(),
    agent_name: 'lead-analyst',
    agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { question, request_id: requestId },
  }
}

export function makeAgentResponse(
  text = 'Done.',
  agentName = 'lead-analyst',
): AgentResponseEvent {
  return {
    id: nextId(),
    type: 'agent_response',
    timestamp: Date.now(),
    agent_name: agentName,
    agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { text },
  }
}

export function makeError(
  message = 'Something failed',
  recoverable = false,
): ErrorEvent {
  return {
    id: nextId(),
    type: 'error',
    timestamp: Date.now(),
    agent_name: 'web-researcher',
    agent_role: 'researcher',
    parent_tool_use_id: null,
    data: { message, agent_name: 'web-researcher', recoverable },
  }
}

export function makeDone(): DoneEvent {
  return {
    id: nextId(),
    type: 'done',
    timestamp: Date.now(),
    agent_name: 'lead-analyst',
    agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { exit_reason: 'complete' },
  }
}

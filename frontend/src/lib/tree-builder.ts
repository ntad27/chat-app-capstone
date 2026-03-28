import type { NormalizedEvent } from '../types/events'
import type { TraceNode, TraceTree } from '../types/trace'

/**
 * Apply a single event to the trace tree. Called once per event.
 * Designed to work inside Immer draft (mutates in-place).
 */
export function applyEventToTree(tree: TraceTree, event: NormalizedEvent): void {
  switch (event.type) {
    case 'session_start': {
      const node = createNode(event.id, event.agent_name, 'agent', 'running', event)
      tree.nodes[node.id] = node
      tree.rootId = node.id
      break
    }
    case 'subagent_start': {
      const node = createNode(
        event.data.tool_use_id,
        event.data.agent_name,
        'agent',
        'running',
        event,
      )
      node.parentId = findParentNodeId(tree, event.parent_tool_use_id)
      tree.nodes[node.id] = node
      if (node.parentId && tree.nodes[node.parentId]) {
        tree.nodes[node.parentId].children.push(node.id)
      }
      break
    }
    case 'subagent_end': {
      const nodeId = findAgentNode(tree, event.data.agent_name, 'running')
      if (nodeId && tree.nodes[nodeId]) {
        tree.nodes[nodeId].status = event.data.status === 'completed' ? 'completed' : 'failed'
        tree.nodes[nodeId].endTime = event.timestamp
      }
      break
    }
    case 'tool_use_start': {
      const node = createNode(
        event.data.tool_use_id,
        event.data.tool_name,
        'tool',
        'running',
        event,
      )
      const parentId = findCurrentAgentNode(tree, event.agent_name)
      node.parentId = parentId
      tree.nodes[node.id] = node
      if (parentId && tree.nodes[parentId]) {
        tree.nodes[parentId].children.push(node.id)
      }
      break
    }
    case 'tool_use_end': {
      const node = tree.nodes[event.data.tool_use_id]
      if (node) {
        node.status = event.data.error ? 'failed' : 'completed'
        node.endTime = event.timestamp
        node.data = { ...node.data, output: event.data.output, error: event.data.error }
      }
      break
    }
    case 'thinking': {
      const node = createNode(event.id, 'Thinking', 'thinking', 'completed', event)
      node.data = { text: event.data.text }
      const parentId = findCurrentAgentNode(tree, event.agent_name)
      node.parentId = parentId
      tree.nodes[node.id] = node
      if (parentId && tree.nodes[parentId]) {
        tree.nodes[parentId].children.push(node.id)
      }
      break
    }
    case 'agent_response': {
      const node = createNode(event.id, 'Response', 'response', 'completed', event)
      node.data = { text: event.data.text }
      if (event.data.artifacts) {
        node.artifacts = event.data.artifacts
      }
      const parentId = findCurrentAgentNode(tree, event.agent_name)
      node.parentId = parentId
      tree.nodes[node.id] = node
      if (parentId && tree.nodes[parentId]) {
        tree.nodes[parentId].children.push(node.id)
      }
      break
    }
    case 'ask_user': {
      const node = createNode(event.id, 'User Input Needed', 'ask_user', 'running', event)
      node.data = { question: event.data.question, request_id: event.data.request_id }
      const parentId = findCurrentAgentNode(tree, event.agent_name)
      node.parentId = parentId
      tree.nodes[node.id] = node
      if (parentId && tree.nodes[parentId]) {
        tree.nodes[parentId].children.push(node.id)
      }
      break
    }
    case 'error': {
      const node = createNode(event.id, `Error: ${event.data.message}`, 'response', 'failed', event)
      const parentId = findCurrentAgentNode(tree, event.agent_name)
      node.parentId = parentId
      tree.nodes[node.id] = node
      if (parentId && tree.nodes[parentId]) {
        tree.nodes[parentId].children.push(node.id)
      }
      break
    }
    case 'done': {
      if (tree.rootId && tree.nodes[tree.rootId]) {
        tree.nodes[tree.rootId].status = 'completed'
        tree.nodes[tree.rootId].endTime = event.timestamp
      }
      break
    }
  }
}

function createNode(
  id: string,
  label: string,
  type: TraceNode['type'],
  status: TraceNode['status'],
  event: NormalizedEvent,
): TraceNode {
  return {
    id,
    label,
    type,
    status,
    agentName: event.agent_name,
    agentRole: event.agent_role,
    parentId: null,
    children: [],
    startTime: event.timestamp,
    data: event.data as Record<string, unknown>,
    artifacts: [],
  }
}

function findParentNodeId(tree: TraceTree, parentToolUseId: string | null): string | null {
  if (!parentToolUseId) return tree.rootId
  // parent_tool_use_id matches a Task tool node — subagent attaches to that tool's parent agent
  const toolNode = tree.nodes[parentToolUseId]
  return toolNode ? toolNode.parentId : tree.rootId
}

function findAgentNode(tree: TraceTree, agentName: string, status: string): string | null {
  // Search in reverse insertion order for most recent match
  const entries = Object.entries(tree.nodes)
  for (let i = entries.length - 1; i >= 0; i--) {
    const [id, node] = entries[i]
    if (node.type === 'agent' && node.label === agentName && node.status === status) {
      return id
    }
  }
  return null
}

function findCurrentAgentNode(tree: TraceTree, agentName: string): string | null {
  return findAgentNode(tree, agentName, 'running')
}

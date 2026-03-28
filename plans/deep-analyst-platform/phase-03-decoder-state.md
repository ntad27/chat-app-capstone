# Phase 03: Frontend — Event Decoder & State Management

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** [Phase 01](./phase-01-setup.md) (frontend scaffold), [Phase 02](./phase-02-backend.md) (NormalizedEvent schema)
- **Research:** [Frontend Architecture](./research/researcher-02-frontend-arch.md)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 3h |
| Status | pending |
| Description | TypeScript event types, event decoder, trace tree builder, Zustand stores, SSE consumer hook, unit tests |

## Key Insights
- **Discriminated unions** on `event.type` give exhaustive type checking in decoder
- **Trace tree** built from flat events using `parent_tool_use_id` as the linkage key
- **Zustand + Immer** enables synchronous draft mutations — prevents race conditions when parallel events arrive in same tick
- SSE hook must handle reconnection with exponential backoff
- Decoder is the highest-value test target (30% of evaluation = decode correctness)

## Requirements
1. TypeScript type definitions mirroring backend NormalizedEvent schema
2. Event decoder function that routes each event type to correct handler
3. Trace tree builder that constructs nested tree from flat event stream
4. Zustand stores: trace store, chat store, session store
5. SSE consumer hook with reconnection
6. Unit tests for decoder routing and tree construction

## Architecture

```
SSE Stream  →  useSSE hook  →  eventDecoder()  →  Zustand stores
                                    │
                                    ├── traceStore.addNode()
                                    ├── traceStore.updateNode()
                                    ├── chatStore.addMessage()
                                    └── sessionStore.setStatus()
```

### Store Separation

| Store | Responsibility | Key state |
|-------|---------------|-----------|
| `traceStore` | Trace tree structure, node expansion | `root`, `nodeMap`, `expandedIds` |
| `chatStore` | Chat messages, pending ask_user | `messages`, `pendingQuestion` |
| `sessionStore` | Session lifecycle, connection status | `sessionId`, `status`, `connected` |

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/types/events.ts` | Create | NormalizedEvent, EventType, AgentStatus types |
| `frontend/src/types/trace.ts` | Create | TraceNode, TraceTree types |
| `frontend/src/lib/decoder.ts` | Create | Event decoder — routes events to handlers |
| `frontend/src/lib/tree-builder.ts` | Create | Trace tree construction from flat events |
| `frontend/src/stores/trace-store.ts` | Create | Zustand store for trace tree state |
| `frontend/src/stores/chat-store.ts` | Create | Zustand store for chat messages |
| `frontend/src/stores/session-store.ts` | Create | Zustand store for session state |
| `frontend/src/hooks/use-sse.ts` | Create | SSE consumer hook with reconnection |
| `frontend/src/hooks/use-event-stream.ts` | Create | Combines SSE + decoder + store dispatch |
| `frontend/src/__tests__/decoder.test.ts` | Create | Decoder routing tests |
| `frontend/src/__tests__/tree-builder.test.ts` | Create | Tree construction tests |

## Implementation Steps

### Step 1: Type Definitions (`frontend/src/types/events.ts`)

```typescript
export const EventType = {
  SESSION_START: 'session_start',
  THINKING: 'thinking',
  TOOL_USE_START: 'tool_use_start',
  TOOL_USE_END: 'tool_use_end',
  SUBAGENT_START: 'subagent_start',
  SUBAGENT_END: 'subagent_end',
  AGENT_RESPONSE: 'agent_response',
  ASK_USER: 'ask_user',
  ERROR: 'error',
  DONE: 'done',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export type AgentStatus = 'queued' | 'running' | 'completed' | 'failed';

// Discriminated union — enables exhaustive switch
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
  | DoneEvent;

interface BaseEvent {
  id: string;
  timestamp: number;
  agent_name: string;
  agent_role: string;
  parent_tool_use_id: string | null;
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start';
  data: { model: string; session_id: string };
}

export interface ThinkingEvent extends BaseEvent {
  type: 'thinking';
  data: { text: string };
}

export interface ToolUseStartEvent extends BaseEvent {
  type: 'tool_use_start';
  data: { tool_use_id: string; tool_name: string; input: Record<string, unknown> };
}

export interface ToolUseEndEvent extends BaseEvent {
  type: 'tool_use_end';
  data: { tool_use_id: string; tool_name: string; output: string; error?: string };
}

export interface SubagentStartEvent extends BaseEvent {
  type: 'subagent_start';
  data: { agent_name: string; agent_role: string; tool_use_id: string; subtopic?: string };
}

export interface SubagentEndEvent extends BaseEvent {
  type: 'subagent_end';
  data: { agent_name: string; status: AgentStatus; output?: string };
}

export interface AgentResponseEvent extends BaseEvent {
  type: 'agent_response';
  data: { text: string; artifacts?: Artifact[] };
}

export interface AskUserEvent extends BaseEvent {
  type: 'ask_user';
  data: { question: string; request_id: string };
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  data: { message: string; agent_name: string; recoverable: boolean };
}

export interface DoneEvent extends BaseEvent {
  type: 'done';
  data: { exit_reason: string; total_tokens?: number };
}

export interface Artifact {
  name: string;
  content: string;
  type: 'markdown' | 'code' | 'table' | 'chart';
}
```

### Step 2: Trace Node Types (`frontend/src/types/trace.ts`)

```typescript
import type { AgentStatus, Artifact } from './events';

export interface TraceNode {
  id: string;                    // event id or tool_use_id
  label: string;                 // display name (agent name or tool name)
  type: 'agent' | 'tool' | 'thinking' | 'response' | 'ask_user';
  status: AgentStatus;
  agentName: string;
  agentRole: string;
  parentId: string | null;       // parent node id (from parent_tool_use_id)
  children: string[];            // child node ids (ordered)
  startTime: number;
  endTime?: number;
  data: Record<string, unknown>; // event-specific data
  artifacts: Artifact[];
}

export interface TraceTree {
  rootId: string | null;
  nodes: Record<string, TraceNode>;  // id -> node (flat map for O(1) lookup)
}
```

### Step 3: Trace Tree Builder (`frontend/src/lib/tree-builder.ts`)

```typescript
import type { NormalizedEvent } from '../types/events';
import type { TraceNode, TraceTree } from '../types/trace';

/**
 * Build/update trace tree from incoming event.
 * Called once per event. Mutates tree in-place (used inside Immer draft).
 *
 * Key algorithm:
 * 1. subagent_start -> create new agent node, attach to parent via parent_tool_use_id
 * 2. tool_use_start -> create tool node under current agent
 * 3. tool_use_end -> update tool node status
 * 4. subagent_end -> update agent node status
 * 5. thinking/response -> create leaf node under current agent
 */
export function applyEventToTree(tree: TraceTree, event: NormalizedEvent): void {
  switch (event.type) {
    case 'session_start':
      handleSessionStart(tree, event);
      break;
    case 'subagent_start':
      handleSubagentStart(tree, event);
      break;
    case 'subagent_end':
      handleSubagentEnd(tree, event);
      break;
    case 'tool_use_start':
      handleToolStart(tree, event);
      break;
    case 'tool_use_end':
      handleToolEnd(tree, event);
      break;
    case 'thinking':
      handleThinking(tree, event);
      break;
    case 'agent_response':
      handleResponse(tree, event);
      break;
    case 'ask_user':
      handleAskUser(tree, event);
      break;
    case 'error':
      handleError(tree, event);
      break;
    case 'done':
      handleDone(tree, event);
      break;
  }
}

function handleSessionStart(tree: TraceTree, event: SessionStartEvent): void {
  const node = createNode(event.id, event.agent_name, 'agent', 'running', event);
  tree.nodes[node.id] = node;
  tree.rootId = node.id;
}

function handleSubagentStart(tree: TraceTree, event: SubagentStartEvent): void {
  const node = createNode(
    event.data.tool_use_id,  // use tool_use_id as node id for parent linkage
    event.data.agent_name,
    'agent',
    'running',
    event,
  );
  node.parentId = findParentNodeId(tree, event.parent_tool_use_id);
  tree.nodes[node.id] = node;

  // Add to parent's children
  if (node.parentId && tree.nodes[node.parentId]) {
    tree.nodes[node.parentId].children.push(node.id);
  }
}

function handleSubagentEnd(tree: TraceTree, event: SubagentEndEvent): void {
  // Find node by agent name matching (most recent running instance)
  const nodeId = findAgentNode(tree, event.data.agent_name, 'running');
  if (nodeId && tree.nodes[nodeId]) {
    tree.nodes[nodeId].status = event.data.status === 'completed' ? 'completed' : 'failed';
    tree.nodes[nodeId].endTime = event.timestamp;
  }
}

function handleToolStart(tree: TraceTree, event: ToolUseStartEvent): void {
  const node = createNode(
    event.data.tool_use_id,
    event.data.tool_name,
    'tool',
    'running',
    event,
  );
  // Attach to current agent node
  const parentId = findCurrentAgentNode(tree, event.agent_name);
  node.parentId = parentId;
  tree.nodes[node.id] = node;
  if (parentId && tree.nodes[parentId]) {
    tree.nodes[parentId].children.push(node.id);
  }
}

function handleToolEnd(tree: TraceTree, event: ToolUseEndEvent): void {
  const node = tree.nodes[event.data.tool_use_id];
  if (node) {
    node.status = event.data.error ? 'failed' : 'completed';
    node.endTime = event.timestamp;
    node.data = { ...node.data, output: event.data.output, error: event.data.error };
  }
}

// Helper: create a TraceNode
function createNode(
  id: string, label: string, type: TraceNode['type'],
  status: TraceNode['status'], event: NormalizedEvent,
): TraceNode {
  return {
    id, label, type, status,
    agentName: event.agent_name,
    agentRole: event.agent_role,
    parentId: null,
    children: [],
    startTime: event.timestamp,
    data: event.data,
    artifacts: [],
  };
}

// Helper: find parent node from parent_tool_use_id
function findParentNodeId(tree: TraceTree, parentToolUseId: string | null): string | null {
  if (!parentToolUseId) return tree.rootId;
  // The parent_tool_use_id matches a tool node (Task tool) in the tree
  // The subagent should be attached to the agent that owns that tool
  const toolNode = tree.nodes[parentToolUseId];
  return toolNode ? toolNode.parentId : tree.rootId;
}

// Helper: find most recent agent node with given name and status
function findAgentNode(tree: TraceTree, agentName: string, status: string): string | null {
  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.type === 'agent' && node.label === agentName && node.status === status) {
      return id;
    }
  }
  return null;
}

// Helper: find the current running agent node for a given agent name
function findCurrentAgentNode(tree: TraceTree, agentName: string): string | null {
  return findAgentNode(tree, agentName, 'running');
}
```

### Step 4: Event Decoder (`frontend/src/lib/decoder.ts`)

```typescript
import type { NormalizedEvent } from '../types/events';
import { useTraceStore } from '../stores/trace-store';
import { useChatStore } from '../stores/chat-store';
import { useSessionStore } from '../stores/session-store';

/**
 * Central event decoder. Routes each event type to the correct store action.
 * This is the "router" — it does not contain business logic, only dispatch.
 *
 * Called once per SSE message. Must be synchronous (store updates are sync via Immer).
 */
export function decodeEvent(event: NormalizedEvent): void {
  const trace = useTraceStore.getState();
  const chat = useChatStore.getState();
  const session = useSessionStore.getState();

  // All events update the trace tree
  trace.applyEvent(event);

  // Event-specific side effects
  switch (event.type) {
    case 'session_start':
      session.setStatus('running');
      chat.addSystemMessage(`Research session started`);
      break;

    case 'thinking':
      // Trace tree handles this; no chat update needed
      break;

    case 'tool_use_start':
      chat.updateActivity(`${event.agent_name}: using ${event.data.tool_name}...`);
      break;

    case 'tool_use_end':
      // Check for artifacts in tool output
      if (event.data.tool_name === 'Write' || event.data.tool_name === 'write_file') {
        trace.addArtifact(event.data.tool_use_id, {
          name: extractFilename(event.data.input),
          content: event.data.output,
          type: 'markdown',
        });
      }
      break;

    case 'subagent_start':
      chat.updateActivity(`Starting ${event.data.agent_name}...`);
      break;

    case 'subagent_end':
      chat.updateActivity(`${event.data.agent_name} ${event.data.status}`);
      break;

    case 'agent_response':
      chat.addAssistantMessage(event.data.text, event.data.artifacts);
      break;

    case 'ask_user':
      session.setStatus('paused');
      chat.setPendingQuestion(event.data.question, event.data.request_id);
      break;

    case 'error':
      chat.addErrorMessage(event.data.message, event.data.agent_name);
      if (!event.data.recoverable) session.setStatus('failed');
      break;

    case 'done':
      session.setStatus('completed');
      chat.addSystemMessage(`Research complete`);
      break;
  }
}

function extractFilename(input: Record<string, unknown>): string {
  return (input?.path as string) || (input?.filename as string) || 'output';
}
```

### Step 5: Zustand Stores

**Trace Store (`frontend/src/stores/trace-store.ts`):**

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { TraceTree, TraceNode } from '../types/trace';
import type { NormalizedEvent, Artifact } from '../types/events';
import { applyEventToTree } from '../lib/tree-builder';

interface TraceState {
  tree: TraceTree;
  expandedIds: Set<string>;
  // Actions
  applyEvent: (event: NormalizedEvent) => void;
  toggleExpand: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  addArtifact: (nodeId: string, artifact: Artifact) => void;
  reset: () => void;
}

const initialTree: TraceTree = { rootId: null, nodes: {} };

export const useTraceStore = create<TraceState>()(
  immer((set) => ({
    tree: initialTree,
    expandedIds: new Set<string>(),

    applyEvent: (event) =>
      set((state) => {
        applyEventToTree(state.tree, event);
        // Auto-expand new agent nodes
        if (event.type === 'session_start' || event.type === 'subagent_start') {
          const nodeId = event.type === 'session_start'
            ? event.id
            : event.data.tool_use_id;
          state.expandedIds.add(nodeId);
        }
      }),

    toggleExpand: (nodeId) =>
      set((state) => {
        if (state.expandedIds.has(nodeId)) {
          state.expandedIds.delete(nodeId);
        } else {
          state.expandedIds.add(nodeId);
        }
      }),

    expandAll: () =>
      set((state) => {
        Object.keys(state.tree.nodes).forEach((id) => state.expandedIds.add(id));
      }),

    collapseAll: () =>
      set((state) => {
        state.expandedIds.clear();
      }),

    addArtifact: (nodeId, artifact) =>
      set((state) => {
        const node = state.tree.nodes[nodeId];
        if (node) node.artifacts.push(artifact);
      }),

    reset: () =>
      set((state) => {
        state.tree = initialTree;
        state.expandedIds = new Set();
      }),
  }))
);
```

**Chat Store (`frontend/src/stores/chat-store.ts`):**

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Artifact } from '../types/events';

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  artifacts?: Artifact[];
}

interface ChatState {
  messages: ChatMessage[];
  pendingQuestion: { question: string; requestId: string } | null;
  activityText: string;
  // Actions
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string, artifacts?: Artifact[]) => void;
  addSystemMessage: (content: string) => void;
  addErrorMessage: (message: string, agentName: string) => void;
  setPendingQuestion: (question: string, requestId: string) => void;
  clearPendingQuestion: () => void;
  updateActivity: (text: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    messages: [],
    pendingQuestion: null,
    activityText: '',

    addUserMessage: (content) =>
      set((state) => {
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'user',
          content,
          timestamp: Date.now(),
        });
      }),

    addAssistantMessage: (content, artifacts) =>
      set((state) => {
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          artifacts,
        });
      }),

    addSystemMessage: (content) =>
      set((state) => {
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'system',
          content,
          timestamp: Date.now(),
        });
      }),

    addErrorMessage: (message, agentName) =>
      set((state) => {
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'error',
          content: `[${agentName}] ${message}`,
          timestamp: Date.now(),
        });
      }),

    setPendingQuestion: (question, requestId) =>
      set((state) => {
        state.pendingQuestion = { question, requestId };
        state.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: question,
          timestamp: Date.now(),
        });
      }),

    clearPendingQuestion: () =>
      set((state) => {
        state.pendingQuestion = null;
      }),

    updateActivity: (text) =>
      set((state) => {
        state.activityText = text;
      }),

    reset: () =>
      set((state) => {
        state.messages = [];
        state.pendingQuestion = null;
        state.activityText = '';
      }),
  }))
);
```

**Session Store (`frontend/src/stores/session-store.ts`):**

```typescript
import { create } from 'zustand';

type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

interface SessionState {
  sessionId: string | null;
  status: SessionStatus;
  connected: boolean;
  setSessionId: (id: string) => void;
  setStatus: (status: SessionStatus) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: 'idle',
  connected: false,
  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (status) => set({ status }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ sessionId: null, status: 'idle', connected: false }),
}));
```

### Step 6: SSE Consumer Hook (`frontend/src/hooks/use-sse.ts`)

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../stores/session-store';

export function useSSE(
  url: string | null,
  onMessage: (data: unknown) => void,
) {
  const reconnectCount = useRef(0);
  const maxReconnects = 5;
  const setConnected = useSessionStore((s) => s.setConnected);

  const connect = useCallback(() => {
    if (!url) return;

    const es = new EventSource(url);

    es.onopen = () => {
      setConnected(true);
      reconnectCount.current = 0;
    };

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        onMessage(data);
        // Close on done event
        if (data.type === 'done') {
          es.close();
          setConnected(false);
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    es.onerror = () => {
      es.close();
      setConnected(false);
      if (reconnectCount.current < maxReconnects) {
        const delay = Math.min(1000 * Math.pow(2, reconnectCount.current), 30000);
        reconnectCount.current += 1;
        setTimeout(connect, delay);
      }
    };

    return es;
  }, [url, onMessage, setConnected]);

  useEffect(() => {
    const es = connect();
    return () => es?.close();
  }, [connect]);
}
```

### Step 7: Combined Stream Hook (`frontend/src/hooks/use-event-stream.ts`)

```typescript
import { useCallback } from 'react';
import { useSSE } from './use-sse';
import { decodeEvent } from '../lib/decoder';
import { useSessionStore } from '../stores/session-store';
import type { NormalizedEvent } from '../types/events';

export function useEventStream() {
  const sessionId = useSessionStore((s) => s.sessionId);
  const url = sessionId ? `/api/stream/${sessionId}` : null;

  const handleMessage = useCallback((data: unknown) => {
    decodeEvent(data as NormalizedEvent);
  }, []);

  useSSE(url, handleMessage);
}
```

### Step 8: Unit Tests

**`frontend/src/__tests__/decoder.test.ts`:**

Test each event type routes to the correct store action. Use Zustand's `getState()` after calling `decodeEvent()`.

Key test cases:
1. `session_start` -> sets session status to 'running', creates root trace node
2. `thinking` -> adds thinking node to trace tree
3. `tool_use_start` -> adds tool node under correct agent
4. `tool_use_end` -> updates tool node to 'completed'
5. `subagent_start` -> creates child agent node under parent
6. `subagent_end` -> updates agent node to 'completed'
7. `agent_response` -> adds assistant message to chat
8. `ask_user` -> sets pending question, pauses session
9. `error` -> adds error message to chat
10. `done` -> sets session status to 'completed'

**`frontend/src/__tests__/tree-builder.test.ts`:**

Test tree structure correctness:
1. Single agent creates root node
2. Subagent nests under parent via `parent_tool_use_id`
3. Three parallel subagents all attach to same parent
4. Sequential agent after parallel attaches correctly
5. Tool nodes nest under their agent
6. Deep nesting (agent -> tool -> subagent -> tool) works

```typescript
// Example test structure
describe('applyEventToTree', () => {
  it('creates root node on session_start', () => {
    const tree: TraceTree = { rootId: null, nodes: {} };
    applyEventToTree(tree, makeSessionStartEvent());
    expect(tree.rootId).not.toBeNull();
    expect(Object.keys(tree.nodes)).toHaveLength(1);
  });

  it('nests subagent under parent via parent_tool_use_id', () => {
    const tree = treeWithRoot();
    // Add Task tool_use_start to root agent
    applyEventToTree(tree, makeToolStartEvent('task-1', 'Task'));
    // Add subagent_start with parent_tool_use_id = 'task-1'
    applyEventToTree(tree, makeSubagentStartEvent('researcher-1', 'task-1'));
    const rootNode = tree.nodes[tree.rootId!];
    expect(rootNode.children).toContain('task-1');
  });

  it('handles three parallel subagents under same parent', () => {
    const tree = treeWithRootAndTask('task-1');
    applyEventToTree(tree, makeSubagentStartEvent('r1', 'task-1'));
    applyEventToTree(tree, makeSubagentStartEvent('r2', 'task-1'));
    applyEventToTree(tree, makeSubagentStartEvent('r3', 'task-1'));
    // All three should be siblings under the root agent
    const root = tree.nodes[tree.rootId!];
    expect(root.children.length).toBeGreaterThanOrEqual(3);
  });
});
```

## Todo List

- [ ] Create `frontend/src/types/events.ts` — discriminated union types
- [ ] Create `frontend/src/types/trace.ts` — TraceNode, TraceTree
- [ ] Implement `frontend/src/lib/tree-builder.ts` — applyEventToTree
- [ ] Implement `frontend/src/lib/decoder.ts` — event router
- [ ] Implement `frontend/src/stores/trace-store.ts` — Zustand + Immer
- [ ] Implement `frontend/src/stores/chat-store.ts`
- [ ] Implement `frontend/src/stores/session-store.ts`
- [ ] Implement `frontend/src/hooks/use-sse.ts` — SSE with reconnection
- [ ] Implement `frontend/src/hooks/use-event-stream.ts` — combined hook
- [ ] Write `frontend/src/__tests__/decoder.test.ts` (10 test cases)
- [ ] Write `frontend/src/__tests__/tree-builder.test.ts` (6 test cases)
- [ ] Create test helpers / event factories for tests

## Success Criteria

1. All 10 event types have TypeScript interfaces with discriminated union
2. `decodeEvent()` routes every event type — verified by tests
3. `applyEventToTree()` builds correct nested structure — verified by tests
4. Parallel subagents appear as siblings under same parent
5. Stores update correctly and independently
6. SSE hook reconnects with exponential backoff
7. `npm run test` passes all decoder + tree builder tests

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Immer + Set incompatibility | Medium | Low | Use plain array for expandedIds if Set fails with Immer |
| Event ordering assumptions | Medium | Medium | Tree builder must handle out-of-order events gracefully (e.g., tool_use_end before start is a no-op) |
| Store coupling in decoder | Low | Medium | Decoder uses `getState()` (sync, no hooks) — keeps it framework-agnostic |

## Next Steps
Proceed to [Phase 04: Frontend — UI Components](./phase-04-ui-components.md)

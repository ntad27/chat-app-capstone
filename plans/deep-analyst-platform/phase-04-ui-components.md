# Phase 04: Frontend — UI Components

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** [Phase 01](./phase-01-setup.md) (scaffold), [Phase 03](./phase-03-decoder-state.md) (stores + types)
- **Research:** [Frontend Architecture](./research/researcher-02-frontend-arch.md)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 4h |
| Status | pending |
| Description | Chat panel, trace panel, parallel agent visualization, ask_user flow, artifact viewer, split-pane layout |

## Key Insights
- Split-pane layout: chat (left) + trace (right) — standard for dev tools
- Trace tree uses recursive component with expand/collapse
- Parallel agents shown as side-by-side cards within their parent node
- ask_user appears as a special chat message with input field
- Activity ticker at bottom of chat panel shows real-time agent status
- Tailwind CSS for rapid iteration; no component library needed

## Requirements
1. Split-pane layout with resizable divider
2. Chat panel: message list, input box, activity ticker
3. Trace panel: expandable tree with status indicators
4. Parallel agent visualization (side-by-side cards)
5. ask_user inline prompt in chat
6. Artifact viewer (markdown rendering, code blocks)
7. Agent state badges (queued/running/completed/failed)
8. Error display (non-intrusive, contextual)
9. Loading/connecting states

## Architecture

```
App
├── Layout (split-pane)
│   ├── ChatPanel
│   │   ├── MessageList
│   │   │   ├── ChatMessage (user | assistant | system | error)
│   │   │   └── AskUserPrompt (inline input when agent asks)
│   │   ├── ActivityTicker
│   │   └── ChatInput
│   └── TracePanel
│       ├── TraceHeader (expand all / collapse all)
│       ├── TraceTree
│       │   └── TraceNodeComponent (recursive)
│       │       ├── AgentNode (with parallel swimlane)
│       │       ├── ToolNode (with input/output)
│       │       ├── ThinkingNode (collapsible text)
│       │       └── StatusBadge
│       └── ArtifactViewer (slide-out panel)
└── ConnectionStatus (top bar)
```

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/App.tsx` | Modify | Root layout with split pane |
| `frontend/src/components/Layout.tsx` | Create | Split-pane container |
| `frontend/src/components/chat/ChatPanel.tsx` | Create | Chat panel container |
| `frontend/src/components/chat/MessageList.tsx` | Create | Scrollable message list |
| `frontend/src/components/chat/ChatMessage.tsx` | Create | Single message bubble |
| `frontend/src/components/chat/ChatInput.tsx` | Create | Message input with send |
| `frontend/src/components/chat/AskUserPrompt.tsx` | Create | Inline answer input |
| `frontend/src/components/chat/ActivityTicker.tsx` | Create | Live status line |
| `frontend/src/components/trace/TracePanel.tsx` | Create | Trace panel container |
| `frontend/src/components/trace/TraceTree.tsx` | Create | Tree renderer |
| `frontend/src/components/trace/TraceNode.tsx` | Create | Recursive tree node |
| `frontend/src/components/trace/StatusBadge.tsx` | Create | Agent status indicator |
| `frontend/src/components/trace/ParallelGroup.tsx` | Create | Side-by-side parallel agents |
| `frontend/src/components/trace/ArtifactViewer.tsx` | Create | Artifact display |
| `frontend/src/components/ConnectionStatus.tsx` | Create | SSE connection indicator |

## Implementation Steps

### Step 1: Layout (`frontend/src/components/Layout.tsx`)

Split-pane with CSS Grid. Chat panel takes ~40% width, trace panel takes ~60%.

```tsx
export function Layout() {
  return (
    <div className="h-screen flex flex-col">
      <ConnectionStatus />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[40%] min-w-[320px] border-r border-gray-200 flex flex-col">
          <ChatPanel />
        </div>
        <div className="w-[60%] min-w-[400px] flex flex-col">
          <TracePanel />
        </div>
      </div>
    </div>
  );
}
```

### Step 2: Chat Panel Components

**ChatPanel.tsx:**
```tsx
export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const pendingQuestion = useChatStore((s) => s.pendingQuestion);
  const activityText = useChatStore((s) => s.activityText);
  const status = useSessionStore((s) => s.status);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b font-semibold text-sm">
        Deep Analyst
      </div>
      <MessageList messages={messages} />
      {pendingQuestion && <AskUserPrompt {...pendingQuestion} />}
      {activityText && status === 'running' && (
        <ActivityTicker text={activityText} />
      )}
      <ChatInput />
    </div>
  );
}
```

**ChatMessage.tsx** — Render based on `role`:
- `user`: right-aligned, blue background
- `assistant`: left-aligned, gray background, render markdown
- `system`: centered, muted text
- `error`: left-aligned, red border, error icon

**ChatInput.tsx:**
```tsx
export function ChatInput() {
  const [input, setInput] = useState('');
  const status = useSessionStore((s) => s.status);
  const disabled = status === 'running' || status === 'paused';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || disabled) return;

    useChatStore.getState().addUserMessage(input);

    // POST to create session
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input }),
    });
    const { session_id } = await res.json();
    useSessionStore.getState().setSessionId(session_id);

    setInput('');
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? 'Research in progress...' : 'Enter research query...'}
          disabled={disabled}
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        />
        <button type="submit" disabled={disabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
          Send
        </button>
      </div>
    </form>
  );
}
```

**AskUserPrompt.tsx** — Special inline input that POSTs answer:
```tsx
export function AskUserPrompt({ question, requestId }: { question: string; requestId: string }) {
  const [answer, setAnswer] = useState('');
  const sessionId = useSessionStore((s) => s.sessionId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !sessionId) return;

    useChatStore.getState().addUserMessage(answer);
    useChatStore.getState().clearPendingQuestion();

    await fetch(`/api/answer/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });

    setAnswer('');
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 mx-3 mb-2 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm text-amber-800 mb-2">Agent needs your input:</p>
      <div className="flex gap-2">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          className="flex-1 px-3 py-2 border rounded text-sm" autoFocus />
        <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded text-sm">
          Answer
        </button>
      </div>
    </form>
  );
}
```

**ActivityTicker.tsx:**
```tsx
export function ActivityTicker({ text }: { text: string }) {
  return (
    <div className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs flex items-center gap-2 border-t">
      <span className="animate-pulse">●</span>
      <span className="truncate">{text}</span>
    </div>
  );
}
```

### Step 3: Trace Panel Components

**TracePanel.tsx:**
```tsx
export function TracePanel() {
  const tree = useTraceStore((s) => s.tree);
  const { expandAll, collapseAll } = useTraceStore();

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <span className="font-semibold text-sm">Execution Trace</span>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-800">
            Expand All
          </button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-800">
            Collapse All
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tree.rootId ? (
          <TraceTree nodeId={tree.rootId} depth={0} />
        ) : (
          <p className="text-gray-400 text-sm">No trace yet. Send a research query to begin.</p>
        )}
      </div>
    </div>
  );
}
```

**TraceNode.tsx** — Recursive component:
```tsx
export function TraceNode({ nodeId, depth }: { nodeId: string; depth: number }) {
  const node = useTraceStore((s) => s.tree.nodes[nodeId]);
  const expanded = useTraceStore((s) => s.expandedIds.has(nodeId));
  const toggle = useTraceStore((s) => s.toggleExpand);

  if (!node) return null;

  // Detect parallel children: multiple agent children that are/were 'running' simultaneously
  const agentChildren = node.children.filter(
    (id) => useTraceStore.getState().tree.nodes[id]?.type === 'agent'
  );
  const hasParallelAgents = agentChildren.length > 1;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      {/* Node header */}
      <div className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-gray-50 rounded px-1"
           onClick={() => toggle(nodeId)}>
        {node.children.length > 0 && (
          <span className="text-gray-400 text-xs w-4">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <StatusBadge status={node.status} />
        <span className="text-sm font-medium">{node.label}</span>
        {node.type === 'agent' && (
          <span className="text-xs text-gray-400 ml-1">({node.agentRole})</span>
        )}
        {node.endTime && (
          <span className="text-xs text-gray-400 ml-auto">
            {((node.endTime - node.startTime) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ml-4">
          {/* Show thinking text for thinking nodes */}
          {node.type === 'thinking' && node.data.text && (
            <pre className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap">
              {node.data.text}
            </pre>
          )}

          {/* Show tool input/output */}
          {node.type === 'tool' && (
            <div className="text-xs mt-1 space-y-1">
              {node.data.input && (
                <details>
                  <summary className="text-gray-500 cursor-pointer">Input</summary>
                  <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(node.data.input, null, 2)}</pre>
                </details>
              )}
              {node.data.output && (
                <details>
                  <summary className="text-gray-500 cursor-pointer">Output</summary>
                  <pre className="bg-gray-50 p-2 rounded max-h-40 overflow-auto">{node.data.output}</pre>
                </details>
              )}
            </div>
          )}

          {/* Parallel agents: side-by-side layout */}
          {hasParallelAgents ? (
            <ParallelGroup nodeIds={agentChildren} depth={depth + 1} />
          ) : null}

          {/* Non-parallel children: standard nesting */}
          {node.children
            .filter((id) => !hasParallelAgents || !agentChildren.includes(id))
            .map((childId) => (
              <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
            ))}

          {/* Parallel children rendered inside ParallelGroup above */}
          {hasParallelAgents && node.children
            .filter((id) => !agentChildren.includes(id))
            .map((childId) => (
              <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}
```

### Step 4: Parallel Group (`frontend/src/components/trace/ParallelGroup.tsx`)

Side-by-side cards for concurrent agents:

```tsx
export function ParallelGroup({ nodeIds, depth }: { nodeIds: string[]; depth: number }) {
  return (
    <div className="my-2">
      <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
        <span>⫘</span> Running in parallel ({nodeIds.length} agents)
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {nodeIds.map((id) => (
          <div key={id} className="flex-1 min-w-[200px] border border-gray-200 rounded-lg p-2 bg-white">
            <TraceNode nodeId={id} depth={0} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 5: Status Badge (`frontend/src/components/trace/StatusBadge.tsx`)

```tsx
const statusConfig = {
  queued:    { color: 'bg-gray-300', label: '○', title: 'Queued' },
  running:   { color: 'bg-blue-500 animate-pulse', label: '●', title: 'Running' },
  completed: { color: 'bg-green-500', label: '✓', title: 'Completed' },
  failed:    { color: 'bg-red-500', label: '✕', title: 'Failed' },
};

export function StatusBadge({ status }: { status: AgentStatus }) {
  const config = statusConfig[status];
  return (
    <span title={config.title}
      className={`inline-block w-2.5 h-2.5 rounded-full ${config.color}`} />
  );
}
```

### Step 6: Artifact Viewer (`frontend/src/components/trace/ArtifactViewer.tsx`)

Slide-out panel for viewing collected artifacts:

```tsx
export function ArtifactViewer({ artifacts }: { artifacts: Artifact[] }) {
  const [selected, setSelected] = useState(0);

  if (!artifacts.length) return null;

  return (
    <div className="border-t mt-2 pt-2">
      <div className="flex gap-1 mb-2">
        {artifacts.map((a, i) => (
          <button key={i} onClick={() => setSelected(i)}
            className={`text-xs px-2 py-1 rounded ${i === selected ? 'bg-blue-100 text-blue-800' : 'text-gray-500'}`}>
            {a.name}
          </button>
        ))}
      </div>
      <div className="bg-gray-50 rounded p-3 max-h-60 overflow-auto">
        <pre className="text-xs whitespace-pre-wrap">
          {artifacts[selected]?.content}
        </pre>
      </div>
    </div>
  );
}
```

### Step 7: Connection Status Bar

```tsx
export function ConnectionStatus() {
  const connected = useSessionStore((s) => s.connected);
  const status = useSessionStore((s) => s.status);

  return (
    <div className="h-8 px-4 flex items-center justify-between bg-gray-900 text-white text-xs">
      <span>Deep Analyst Research Platform</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
        <span>{status === 'idle' ? 'Ready' : status}</span>
      </div>
    </div>
  );
}
```

## Todo List

- [ ] Create `Layout.tsx` — split-pane container
- [ ] Create `ChatPanel.tsx` — chat container
- [ ] Create `MessageList.tsx` — scrollable messages
- [ ] Create `ChatMessage.tsx` — message rendering by role
- [ ] Create `ChatInput.tsx` — input with session creation
- [ ] Create `AskUserPrompt.tsx` — inline answer input
- [ ] Create `ActivityTicker.tsx` — live status line
- [ ] Create `TracePanel.tsx` — trace container with controls
- [ ] Create `TraceNode.tsx` — recursive tree node
- [ ] Create `ParallelGroup.tsx` — side-by-side agent cards
- [ ] Create `StatusBadge.tsx` — colored status indicator
- [ ] Create `ArtifactViewer.tsx` — artifact display
- [ ] Create `ConnectionStatus.tsx` — SSE status bar
- [ ] Update `App.tsx` to use Layout + useEventStream hook
- [ ] Add Tailwind base styles (font, colors, scrollbar)

## Success Criteria

1. Chat panel displays messages, handles input, shows activity
2. Trace tree renders with correct nesting and expand/collapse
3. Parallel agents visually distinguished (side-by-side cards)
4. ask_user prompt appears inline, collects and sends answer
5. Status badges reflect agent state (4 states, 4 visual treatments)
6. Artifacts viewable from trace nodes
7. Connection status visible in header bar
8. No layout overflow — all panels scroll independently

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Performance with deep trees | Low | Medium | Keep trees shallow (<5 levels); virtualize if needed |
| Parallel group detection logic | Medium | Medium | Simple heuristic: >1 agent children = parallel; refine later |
| Auto-scroll conflicts | Medium | Low | Scroll to bottom on new message; pause auto-scroll if user scrolls up |
| Tailwind class bloat | Low | Low | Extract common patterns into utility components |

## Next Steps
Proceed to [Phase 05: Integration & Polish](./phase-05-integration.md)

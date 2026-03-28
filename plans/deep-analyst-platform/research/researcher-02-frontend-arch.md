# Research Report: Real-Time Agent Trace Visualization UI Architecture

**Date:** 2026-03-28

## Executive Summary

Real-time agent trace visualization requires robust patterns across SSE streaming, state management, & UI rendering. Key wins: (1) SSE w/ exponential backoff reconnection; (2) Zustand for tree mutations (fine-grained subscriptions); (3) swimlane layout for parallel visualization; (4) collapsible tree via recursive components.

## 1. SSE Stream Consumption in React

Custom hook w/ exponential backoff:

```typescript
export function useSSE(url: string, onMessage: (data: any) => void) {
  const [connected, setConnected] = useState(false);
  const reconnectRef = useRef(0);
  useEffect(() => {
    const delay = Math.min(1000 * Math.pow(2, reconnectRef.current), 30000);
    const timeout = setTimeout(() => {
      const es = new EventSource(url);
      es.onopen = () => { setConnected(true); reconnectRef.current = 0; };
      es.onmessage = (evt) => onMessage(JSON.parse(evt.data));
      es.onerror = () => { setConnected(false); reconnectRef.current += 1; es.close(); };
    }, delay);
    return () => clearTimeout(timeout);
  }, [url, onMessage]);
  return { connected };
}
```

Backoff: 1s -> 2s -> 4s -> ... -> 30s cap. SSE auto-reconnects on network failure.

## 2. State Management: Zustand + Immer

```typescript
import create from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface TraceNode {
  id: string; label: string; children: TraceNode[];
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime: number;
}

export const useTraceStore = create()(immer((set) => ({
  root: null,
  updateNode: (id, updates) => set((state) => {
    const find = (node) => {
      if (node.id === id) { Object.assign(node, updates); return true; }
      return node.children.some(find);
    };
    find(state.root);
  }),
  addChild: (parentId, node) => set((state) => {
    const find = (n) => {
      if (n.id === parentId) { n.children.push(node); return true; }
      return n.children.some(find);
    };
    find(state.root);
  }),
})));
```

Why Zustand: Fine-grained reactivity, smaller bundle than Redux, `getState()` for sync ops.

## 3. Parallel Execution Visualization

**Swimlane approach** — grid layout with time slots:
- Side-by-side columns for concurrent agents
- Color-coded status badges per agent
- Timeline bar for elapsed time

## 4. Expandable Tree Components

Recursive component pattern:

```typescript
function TreeNode({ node, depth, expanded, onToggle }) {
  const isExpanded = expanded.has(node.id);
  return (
    <>
      <div style={{ paddingLeft: depth * 16 }}>
        {node.children.length > 0 && (
          <button onClick={() => onToggle(node.id)}>
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        <span>{node.label}</span>
        <StatusBadge status={node.status} />
      </div>
      {isExpanded && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}
```

For 10k+ nodes: virtualize with react-window FixedSizeList.

## 5. Trade-offs

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| State | Zustand | Fine-grained reactivity |
| Parallel Viz | Swimlanes | Intuitive for agent forks |
| SSE vs WS | SSE | Server->client only, simpler |
| Styling | Tailwind | Fast iteration |

## Unresolved Questions

1. Exact Agent SDK event schema shape (token counts, resource usage)?
2. Expected max trace nesting depth?
3. Acceptable render delay from event to UI (100ms vs 1s)?

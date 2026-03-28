# Phase 06: Testing & Deliverables

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** All previous phases
- **Docs:** [README.md](../../README.md)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 2h |
| Status | pending |
| Description | Decoder unit tests, integration tests, final README, known limitations |

## Key Insights
- Decoder tests are a deliverable and 30% of evaluation (decode correctness)
- Test the decoder and tree builder in isolation — no SSE/network dependency
- Use factory functions for creating test events — reduces boilerplate
- Backend normalizer tests complement frontend decoder tests
- Known limitations document shows maturity and self-awareness

## Requirements
1. Frontend decoder tests — every event type routes correctly
2. Frontend tree builder tests — nested structure is correct
3. Backend normalizer tests — SDK events translate correctly
4. Integration test — mock stream produces correct final state
5. Final README with architecture, setup, limitations
6. All deliverables listed in spec are present

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/__tests__/decoder.test.ts` | Create/Complete | Decoder routing tests |
| `frontend/src/__tests__/tree-builder.test.ts` | Create/Complete | Tree construction tests |
| `frontend/src/__tests__/helpers/event-factory.ts` | Create | Test event builders |
| `backend/tests/test_normalizer.py` | Create | Normalizer unit tests |
| `backend/tests/test_mock_stream.py` | Create | Mock stream integration test |
| `README.md` | Modify | Final deliverable README |

## Implementation Steps

### Step 1: Event Factory (`frontend/src/__tests__/helpers/event-factory.ts`)

```typescript
import type {
  NormalizedEvent, SessionStartEvent, ThinkingEvent,
  ToolUseStartEvent, ToolUseEndEvent, SubagentStartEvent,
  SubagentEndEvent, AgentResponseEvent, AskUserEvent,
  ErrorEvent, DoneEvent,
} from '../../types/events';

let counter = 0;
function nextId(): string { return `test-${++counter}`; }

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
  };
}

export function makeThinking(agentName = 'lead-analyst', text = 'Analyzing...',
                              parentToolUseId: string | null = null): ThinkingEvent {
  return {
    id: nextId(), type: 'thinking', timestamp: Date.now(),
    agent_name: agentName, agent_role: 'orchestrator',
    parent_tool_use_id: parentToolUseId,
    data: { text },
  };
}

export function makeToolStart(toolUseId: string, toolName: string,
                               agentName = 'lead-analyst',
                               parentToolUseId: string | null = null): ToolUseStartEvent {
  return {
    id: nextId(), type: 'tool_use_start', timestamp: Date.now(),
    agent_name: agentName, agent_role: 'orchestrator',
    parent_tool_use_id: parentToolUseId,
    data: { tool_use_id: toolUseId, tool_name: toolName, input: {} },
  };
}

export function makeToolEnd(toolUseId: string, toolName: string,
                             output = 'done'): ToolUseEndEvent {
  return {
    id: nextId(), type: 'tool_use_end', timestamp: Date.now(),
    agent_name: 'lead-analyst', agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { tool_use_id: toolUseId, tool_name: toolName, output },
  };
}

export function makeSubagentStart(agentName: string, toolUseId: string,
                                   parentToolUseId: string): SubagentStartEvent {
  return {
    id: nextId(), type: 'subagent_start', timestamp: Date.now(),
    agent_name: agentName, agent_role: 'researcher',
    parent_tool_use_id: parentToolUseId,
    data: { agent_name: agentName, agent_role: 'researcher', tool_use_id: toolUseId },
  };
}

export function makeSubagentEnd(agentName: string,
                                 status = 'completed' as const): SubagentEndEvent {
  return {
    id: nextId(), type: 'subagent_end', timestamp: Date.now(),
    agent_name: agentName, agent_role: 'researcher',
    parent_tool_use_id: null,
    data: { agent_name: agentName, status },
  };
}

export function makeAskUser(question = 'What angle?',
                             requestId = 'req-1'): AskUserEvent {
  return {
    id: nextId(), type: 'ask_user', timestamp: Date.now(),
    agent_name: 'lead-analyst', agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { question, request_id: requestId },
  };
}

export function makeAgentResponse(text = 'Done.',
                                   agentName = 'lead-analyst'): AgentResponseEvent {
  return {
    id: nextId(), type: 'agent_response', timestamp: Date.now(),
    agent_name: agentName, agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { text },
  };
}

export function makeError(message = 'Something failed',
                           recoverable = false): ErrorEvent {
  return {
    id: nextId(), type: 'error', timestamp: Date.now(),
    agent_name: 'web-researcher', agent_role: 'researcher',
    parent_tool_use_id: null,
    data: { message, agent_name: 'web-researcher', recoverable },
  };
}

export function makeDone(): DoneEvent {
  return {
    id: nextId(), type: 'done', timestamp: Date.now(),
    agent_name: 'lead-analyst', agent_role: 'orchestrator',
    parent_tool_use_id: null,
    data: { exit_reason: 'complete' },
  };
}

export function resetCounter() { counter = 0; }
```

### Step 2: Decoder Tests (`frontend/src/__tests__/decoder.test.ts`)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { decodeEvent } from '../lib/decoder';
import { useTraceStore } from '../stores/trace-store';
import { useChatStore } from '../stores/chat-store';
import { useSessionStore } from '../stores/session-store';
import * as factory from './helpers/event-factory';

beforeEach(() => {
  useTraceStore.getState().reset();
  useChatStore.getState().reset();
  useSessionStore.getState().reset();
  factory.resetCounter();
});

describe('decodeEvent — event routing', () => {
  it('session_start sets session status to running', () => {
    decodeEvent(factory.makeSessionStart());
    expect(useSessionStore.getState().status).toBe('running');
  });

  it('session_start creates root trace node', () => {
    decodeEvent(factory.makeSessionStart());
    const tree = useTraceStore.getState().tree;
    expect(tree.rootId).not.toBeNull();
    expect(Object.keys(tree.nodes)).toHaveLength(1);
  });

  it('thinking adds node to trace tree', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeThinking());
    const tree = useTraceStore.getState().tree;
    expect(Object.keys(tree.nodes).length).toBeGreaterThan(1);
  });

  it('tool_use_start updates activity text', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeToolStart('t1', 'WebSearch'));
    expect(useChatStore.getState().activityText).toContain('WebSearch');
  });

  it('agent_response adds assistant message to chat', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeAgentResponse('Research complete.'));
    const messages = useChatStore.getState().messages;
    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Research complete.');
  });

  it('ask_user sets pending question and pauses session', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeAskUser('What angle?', 'req-1'));
    expect(useChatStore.getState().pendingQuestion).toEqual({
      question: 'What angle?',
      requestId: 'req-1',
    });
    expect(useSessionStore.getState().status).toBe('paused');
  });

  it('error adds error message to chat', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeError('Search failed'));
    const messages = useChatStore.getState().messages;
    const error = messages.find((m) => m.role === 'error');
    expect(error?.content).toContain('Search failed');
  });

  it('unrecoverable error sets session to failed', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeError('Fatal', false));
    expect(useSessionStore.getState().status).toBe('failed');
  });

  it('done sets session status to completed', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeDone());
    expect(useSessionStore.getState().status).toBe('completed');
  });

  it('done adds system message to chat', () => {
    decodeEvent(factory.makeSessionStart());
    decodeEvent(factory.makeDone());
    const messages = useChatStore.getState().messages;
    const system = messages.filter((m) => m.role === 'system');
    expect(system.length).toBeGreaterThanOrEqual(1);
  });
});
```

### Step 3: Tree Builder Tests (`frontend/src/__tests__/tree-builder.test.ts`)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { applyEventToTree } from '../lib/tree-builder';
import type { TraceTree } from '../types/trace';
import * as factory from './helpers/event-factory';

let tree: TraceTree;

beforeEach(() => {
  tree = { rootId: null, nodes: {} };
  factory.resetCounter();
});

describe('applyEventToTree', () => {
  it('creates root node on session_start', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    expect(tree.rootId).not.toBeNull();
    expect(Object.keys(tree.nodes)).toHaveLength(1);
    expect(tree.nodes[tree.rootId!].type).toBe('agent');
    expect(tree.nodes[tree.rootId!].status).toBe('running');
  });

  it('nests tool under agent', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('t1', 'Task'));
    const root = tree.nodes[tree.rootId!];
    expect(root.children).toContain('t1');
    expect(tree.nodes['t1'].type).toBe('tool');
  });

  it('nests subagent under parent via parent_tool_use_id', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'));
    applyEventToTree(tree, factory.makeSubagentStart('web-researcher', 'r1', 'task-1'));
    // r1 should be a child of root (parent of task-1 tool)
    const root = tree.nodes[tree.rootId!];
    expect(root.children).toContain('task-1');
    expect(tree.nodes['r1']).toBeDefined();
    expect(tree.nodes['r1'].type).toBe('agent');
  });

  it('handles 3 parallel subagents under same parent', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'));
    applyEventToTree(tree, factory.makeSubagentStart('researcher-1', 'r1', 'task-1'));
    applyEventToTree(tree, factory.makeSubagentStart('researcher-2', 'r2', 'task-1'));
    applyEventToTree(tree, factory.makeSubagentStart('researcher-3', 'r3', 'task-1'));

    // All 3 researchers should exist
    expect(tree.nodes['r1']).toBeDefined();
    expect(tree.nodes['r2']).toBeDefined();
    expect(tree.nodes['r3']).toBeDefined();

    // All should be agent type and running
    expect(tree.nodes['r1'].status).toBe('running');
    expect(tree.nodes['r2'].status).toBe('running');
    expect(tree.nodes['r3'].status).toBe('running');
  });

  it('marks subagent completed on subagent_end', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'));
    applyEventToTree(tree, factory.makeSubagentStart('web-researcher', 'r1', 'task-1'));
    applyEventToTree(tree, factory.makeSubagentEnd('web-researcher', 'completed'));
    // Find the researcher node
    expect(tree.nodes['r1'].status).toBe('completed');
  });

  it('marks tool completed on tool_use_end', () => {
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('t1', 'WebSearch'));
    applyEventToTree(tree, factory.makeToolEnd('t1', 'WebSearch'));
    expect(tree.nodes['t1'].status).toBe('completed');
  });

  it('handles sequential-after-parallel (data-analyst after researchers)', () => {
    // Setup: root -> task-1 -> 2 researchers (parallel) -> task-2 -> data-analyst
    applyEventToTree(tree, factory.makeSessionStart());
    applyEventToTree(tree, factory.makeToolStart('task-1', 'Task'));
    applyEventToTree(tree, factory.makeSubagentStart('researcher', 'r1', 'task-1'));
    applyEventToTree(tree, factory.makeSubagentStart('researcher', 'r2', 'task-1'));
    applyEventToTree(tree, factory.makeSubagentEnd('researcher', 'completed'));
    applyEventToTree(tree, factory.makeSubagentEnd('researcher', 'completed'));
    applyEventToTree(tree, factory.makeToolEnd('task-1', 'Task'));

    // Now data-analyst starts under a new Task
    applyEventToTree(tree, factory.makeToolStart('task-2', 'Task'));
    applyEventToTree(tree, factory.makeSubagentStart('data-analyst', 'da1', 'task-2'));

    expect(tree.nodes['da1']).toBeDefined();
    expect(tree.nodes['da1'].type).toBe('agent');
    expect(tree.nodes['da1'].label).toBe('data-analyst');
  });
});
```

### Step 4: Backend Normalizer Tests (`backend/tests/test_normalizer.py`)

```python
import pytest
from app.services.normalizer import normalize_sdk_event, extract_data
from app.models.events import EventType

class TestNormalizeSdkEvent:
    def test_maps_thinking_event(self):
        raw = {"type": "thinking", "data": {"text": "Analyzing..."}}
        ctx = {"agent_name": "lead-analyst", "agent_role": "orchestrator"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.THINKING
        assert event.agent_name == "lead-analyst"
        assert event.data["text"] == "Analyzing..."

    def test_maps_tool_use_start(self):
        raw = {"type": "tool_use.start", "data": {"id": "t1", "name": "WebSearch", "input": {"q": "test"}}}
        ctx = {"agent_name": "web-researcher", "agent_role": "researcher"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.TOOL_USE_START
        assert event.data["tool_use_id"] == "t1"
        assert event.data["tool_name"] == "WebSearch"

    def test_maps_ask_user(self):
        raw = {"type": "ask_user", "data": {"question": "What angle?", "request_id": "r1"}}
        ctx = {"agent_name": "lead-analyst", "agent_role": "orchestrator"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.ASK_USER
        assert event.data["question"] == "What angle?"

    def test_preserves_parent_tool_use_id(self):
        raw = {"type": "thinking", "data": {"text": "..."}}
        ctx = {"agent_name": "researcher", "agent_role": "researcher", "parent_tool_use_id": "task-1"}
        event = normalize_sdk_event(raw, ctx)
        assert event.parent_tool_use_id == "task-1"

    def test_unknown_event_type_maps_to_error(self):
        raw = {"type": "unknown_event", "data": {}}
        ctx = {"agent_name": "test", "agent_role": "test"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.ERROR

    def test_maps_all_ten_event_types(self):
        type_map = {
            "session.start": EventType.SESSION_START,
            "thinking": EventType.THINKING,
            "tool_use.start": EventType.TOOL_USE_START,
            "tool_use.end": EventType.TOOL_USE_END,
            "subagent.start": EventType.SUBAGENT_START,
            "subagent.end": EventType.SUBAGENT_END,
            "response": EventType.AGENT_RESPONSE,
            "ask_user": EventType.ASK_USER,
            "error": EventType.ERROR,
            "done": EventType.DONE,
        }
        ctx = {"agent_name": "test", "agent_role": "test"}
        for raw_type, expected in type_map.items():
            event = normalize_sdk_event({"type": raw_type, "data": {}}, ctx)
            assert event.type == expected, f"Failed for {raw_type}"
```

### Step 5: Final Deliverable Checklist

| Deliverable | Location | Status |
|-------------|----------|--------|
| Working application | `backend/` + `frontend/` | Runs with `docker-compose up` or manual start |
| 1-pager design document | `docs/design-doc.md` | Amazon-style format |
| README | `README.md` | Setup, architecture, limitations |
| Decoder tests | `frontend/src/__tests__/decoder.test.ts` | All 10 event types tested |
| Tree builder tests | `frontend/src/__tests__/tree-builder.test.ts` | 6 structural tests |
| Normalizer tests | `backend/tests/test_normalizer.py` | 6 normalization tests |

### Step 6: Known Limitations Section (for README)

```markdown
## Known Limitations

1. **In-memory sessions** — sessions lost on server restart; no persistence
2. **Single user** — no auth, no multi-user support
3. **No stream reconnection with replay** — if SSE drops, events between disconnect and reconnect are lost
4. **Mock-first** — mock stream is the reliable demo path; real SDK integration may have edge cases
5. **No artifact persistence** — artifacts exist only in memory during the session
6. **Agent prompts are basic** — focused on demonstrating the trace UI, not production-quality research
7. **No rate limiting** — each session creates a new agent run; no cost controls
```

## Todo List

- [ ] Create `frontend/src/__tests__/helpers/event-factory.ts`
- [ ] Complete `frontend/src/__tests__/decoder.test.ts` — 10 test cases
- [ ] Complete `frontend/src/__tests__/tree-builder.test.ts` — 6 test cases
- [ ] Create `backend/tests/test_normalizer.py` — 6 test cases
- [ ] Run all tests: `npm run test` + `pytest`
- [ ] Verify mock end-to-end flow works
- [ ] Write final README sections
- [ ] Review all deliverables against spec checklist
- [ ] Clean up unused files, dead code

## Success Criteria

1. `npm run test` passes all 16 frontend tests (10 decoder + 6 tree)
2. `pytest` passes all 6 backend tests
3. All 4 deliverables present and complete
4. Application runs end-to-end in mock mode
5. Known limitations documented honestly
6. README enables setup in <5 minutes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tests reveal decoder bugs | Medium | Low | Fix during this phase (that is the point of tests) |
| Immer store mutations break in tests | Low | Medium | Use `getState()` for assertions (no React rendering needed) |
| Time pressure from earlier phases | Medium | Medium | Prioritize decoder tests (30% eval weight); skip integration tests if needed |

## Next Steps
Deliverables complete. Submit for evaluation.

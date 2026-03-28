# Phase 05: Integration & Polish

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** [Phase 02](./phase-02-backend.md), [Phase 03](./phase-03-decoder-state.md), [Phase 04](./phase-04-ui-components.md)
- **Docs:** [README.md](../../README.md)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 3h |
| Status | pending |
| Description | Wire frontend to backend, end-to-end flow testing, mock event stream, error edge cases, design doc, README |

## Key Insights
- Mock event stream is critical for demo reliability (no API key dependency)
- End-to-end flow must test the full cycle: query -> ask_user -> parallel agents -> report
- Error handling must cover: network disconnect, agent failure, timeout, malformed events
- Design doc (1-pager) is a deliverable — write it during this phase while architecture is fresh

## Requirements
1. Frontend SSE connects to backend and renders full research pipeline
2. Mock event stream works as demo/development fallback
3. ask_user pause/resume works end-to-end
4. Error handling: disconnects, agent errors, timeouts
5. 1-pager design document
6. README with setup instructions, architecture, limitations

## Architecture

### End-to-End Data Flow

```
1. User types query in ChatInput
2. ChatInput POSTs /api/sessions { query }
3. Backend creates session, starts agent orchestrator in background
4. Backend returns { session_id }
5. Frontend sets sessionId in store -> useSSE connects to /api/stream/{session_id}
6. Backend pushes NormalizedEvents through SSE
7. useSSE receives each event -> decodeEvent() routes to stores
8. UI reactively renders from store state

ask_user interrupt:
9. Backend emits ask_user event -> stream pauses (connection stays open)
10. Frontend shows AskUserPrompt
11. User types answer -> POST /api/answer/{session_id} { answer }
12. Backend resolves Future -> agent resumes -> stream continues
```

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/services/mock_stream.py` | Create | Full mock event sequence |
| `backend/app/routes/stream.py` | Modify | Add `?mock=true` support |
| `frontend/src/App.tsx` | Modify | Wire useEventStream hook |
| `frontend/src/lib/api.ts` | Create | API client functions |
| `frontend/src/hooks/use-event-stream.ts` | Modify | Error handling, cleanup |
| `docs/design-doc.md` | Create | 1-pager design document |
| `README.md` | Modify | Setup, architecture, limitations |

## Implementation Steps

### Step 1: Mock Event Stream (`backend/app/services/mock_stream.py`)

Complete mock sequence simulating Deep Analyst research on "Anthropic's competitive position":

```python
import asyncio
import uuid
import time
from app.models.events import NormalizedEvent, EventType

async def emit_mock_events(session, on_event):
    """Emit realistic mock events for demo/development."""

    async def emit(type: EventType, agent_name: str, agent_role: str,
                   parent_tool_use_id=None, data=None):
        event = NormalizedEvent(
            type=type,
            agent_name=agent_name,
            agent_role=agent_role,
            parent_tool_use_id=parent_tool_use_id,
            data=data or {},
        )
        await on_event(event)
        await asyncio.sleep(0.3)  # simulate processing delay

    task_id_1 = str(uuid.uuid4())  # lead's Task tool for researchers
    r1_id = str(uuid.uuid4())
    r2_id = str(uuid.uuid4())
    r3_id = str(uuid.uuid4())

    # Phase 1: Session start + lead-analyst thinking
    await emit(EventType.SESSION_START, "lead-analyst", "orchestrator",
               data={"model": "claude-sonnet-4-20250514", "session_id": session.id})

    await emit(EventType.THINKING, "lead-analyst", "orchestrator",
               data={"text": "Analyzing the research request. Need to clarify the angle..."})

    # Phase 2: ask_user
    ask_request_id = str(uuid.uuid4())
    await emit(EventType.ASK_USER, "lead-analyst", "orchestrator",
               data={"question": "What angle matters most — technical capabilities, developer adoption, enterprise readiness, or funding?",
                     "request_id": ask_request_id})

    # Wait for user answer
    if session.pending_answer:
        answer = await session.pending_answer
    else:
        # Create future and wait
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        session.pending_answer = future
        session.status = "paused"
        answer = await future

    await asyncio.sleep(0.5)

    await emit(EventType.THINKING, "lead-analyst", "orchestrator",
               data={"text": f"User focused on: {answer}. Decomposing into 3 research streams."})

    # Phase 3: Spawn parallel web-researchers
    await emit(EventType.TOOL_USE_START, "lead-analyst", "orchestrator",
               data={"tool_use_id": task_id_1, "tool_name": "Task", "input": {"subtopics": 3}})

    # Researcher 1
    await emit(EventType.SUBAGENT_START, "web-researcher", "researcher",
               parent_tool_use_id=task_id_1,
               data={"agent_name": "web-researcher", "agent_role": "researcher",
                     "tool_use_id": r1_id, "subtopic": "AI agent frameworks landscape"})

    # Researcher 2
    await emit(EventType.SUBAGENT_START, "web-researcher", "researcher",
               parent_tool_use_id=task_id_1,
               data={"agent_name": "web-researcher", "agent_role": "researcher",
                     "tool_use_id": r2_id, "subtopic": "Developer adoption metrics"})

    # Researcher 3
    await emit(EventType.SUBAGENT_START, "web-researcher", "researcher",
               parent_tool_use_id=task_id_1,
               data={"agent_name": "web-researcher", "agent_role": "researcher",
                     "tool_use_id": r3_id, "subtopic": "Enterprise AI deployments"})

    # Simulate parallel research (interleaved events)
    await asyncio.sleep(1)
    for i, (rid, topic) in enumerate([(r1_id, "frameworks"), (r2_id, "adoption"), (r3_id, "enterprise")]):
        await emit(EventType.THINKING, "web-researcher", "researcher",
                   parent_tool_use_id=rid,
                   data={"text": f"Searching for {topic} data..."})
        ws_id = str(uuid.uuid4())
        await emit(EventType.TOOL_USE_START, "web-researcher", "researcher",
                   parent_tool_use_id=rid,
                   data={"tool_use_id": ws_id, "tool_name": "WebSearch",
                         "input": {"query": f"Anthropic {topic} 2026"}})
        await asyncio.sleep(0.5)
        await emit(EventType.TOOL_USE_END, "web-researcher", "researcher",
                   parent_tool_use_id=rid,
                   data={"tool_use_id": ws_id, "tool_name": "WebSearch",
                         "output": f"Found 12 results for {topic}..."})

    # End researchers
    for rid in [r1_id, r2_id, r3_id]:
        await emit(EventType.SUBAGENT_END, "web-researcher", "researcher",
                   parent_tool_use_id=rid,
                   data={"agent_name": "web-researcher", "status": "completed"})

    await emit(EventType.TOOL_USE_END, "lead-analyst", "orchestrator",
               data={"tool_use_id": task_id_1, "tool_name": "Task", "output": "All researchers complete"})

    # Phase 4: data-analyst
    da_task_id = str(uuid.uuid4())
    da_id = str(uuid.uuid4())
    await emit(EventType.TOOL_USE_START, "lead-analyst", "orchestrator",
               data={"tool_use_id": da_task_id, "tool_name": "Task", "input": {"agent": "data-analyst"}})
    await emit(EventType.SUBAGENT_START, "data-analyst", "analyst",
               parent_tool_use_id=da_task_id,
               data={"agent_name": "data-analyst", "agent_role": "analyst", "tool_use_id": da_id})
    await asyncio.sleep(1)
    await emit(EventType.SUBAGENT_END, "data-analyst", "analyst",
               parent_tool_use_id=da_task_id,
               data={"agent_name": "data-analyst", "status": "completed"})
    await emit(EventType.TOOL_USE_END, "lead-analyst", "orchestrator",
               data={"tool_use_id": da_task_id, "tool_name": "Task", "output": "Data analysis complete"})

    # Phase 5: report-writer
    rw_task_id = str(uuid.uuid4())
    rw_id = str(uuid.uuid4())
    await emit(EventType.TOOL_USE_START, "lead-analyst", "orchestrator",
               data={"tool_use_id": rw_task_id, "tool_name": "Task", "input": {"agent": "report-writer"}})
    await emit(EventType.SUBAGENT_START, "report-writer", "writer",
               parent_tool_use_id=rw_task_id,
               data={"agent_name": "report-writer", "agent_role": "writer", "tool_use_id": rw_id})
    await asyncio.sleep(1.5)

    # Final response with artifact
    await emit(EventType.AGENT_RESPONSE, "report-writer", "writer",
               parent_tool_use_id=rw_id,
               data={"text": "Research brief completed.",
                     "artifacts": [{"name": "research-brief.md", "type": "markdown",
                                    "content": "# Anthropic Competitive Analysis\n\n## Key Findings\n..."}]})

    await emit(EventType.SUBAGENT_END, "report-writer", "writer",
               parent_tool_use_id=rw_task_id,
               data={"agent_name": "report-writer", "status": "completed"})
    await emit(EventType.TOOL_USE_END, "lead-analyst", "orchestrator",
               data={"tool_use_id": rw_task_id, "tool_name": "Task", "output": "Report complete"})

    # Done
    await emit(EventType.AGENT_RESPONSE, "lead-analyst", "orchestrator",
               data={"text": "Research complete. The brief covers competitive positioning with focus on developer adoption and enterprise readiness."})
    await emit(EventType.DONE, "lead-analyst", "orchestrator",
               data={"exit_reason": "complete"})
```

### Step 2: API Client (`frontend/src/lib/api.ts`)

```typescript
const BASE_URL = '/api';

export async function createSession(query: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();
  return data.session_id;
}

export async function sendAnswer(sessionId: string, answer: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/answer/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error(`Failed to send answer: ${res.status}`);
}

export function getStreamUrl(sessionId: string, mock = false): string {
  const params = mock ? '?mock=true' : '';
  return `${BASE_URL}/stream/${sessionId}${params}`;
}
```

### Step 3: Wire Backend Mock Support

Add `?mock=true` query parameter to `GET /api/stream/{session_id}`:

```python
@router.get("/api/stream/{session_id}")
async def stream_events(session_id: str, mock: bool = False):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    if mock:
        from app.services.mock_stream import emit_mock_events
        asyncio.create_task(emit_mock_events(session, lambda e: session.event_queue.put(e)))

    async def event_generator():
        while True:
            event = await session.event_queue.get()
            yield {"data": event.model_dump_json()}
            if event.type == EventType.DONE:
                break

    return EventSourceResponse(event_generator())
```

### Step 4: Error Handling Edge Cases

**Frontend error boundaries:**
- SSE connection lost: show reconnecting banner, exponential backoff
- Malformed event: log warning, skip event, continue stream
- Agent error event: display in chat, mark trace node as failed
- Session creation failure: show error toast, re-enable input
- ask_user timeout (5 min): show timeout message, allow re-send

**Backend error handling:**
- Agent SDK exception: catch, emit error event, emit done event
- ask_user timeout: after 5 minutes, emit timeout error + done
- Malformed user answer: return 400 with clear message

### Step 5: Design Document (`docs/design-doc.md`)

Amazon-style 1-pager structure:

```markdown
# Deep Analyst — Design Document

## Title
Agent-Transparent Research Intelligence Platform

## Tenets
1. Transparency over abstraction — show all agent activity
2. Real-time over batch — events render as they arrive
3. Graceful degradation — errors are visible, not silent

## Problem
AI agent systems are opaque. Users submit a query and wait for a response
with no visibility into what agents are doing, which tools they use, or
why they make decisions.

## Proposed Solution
A chat application that consumes the Claude Agent SDK event stream and
renders a real-time trace tree alongside the chat conversation. The backend
normalizes raw SDK events; the frontend decodes them into a nested tree
with parallel agent visualization.

## Goals
- Full trace visibility for all agent events
- Real-time streaming with <200ms render latency
- ask_user pause/resume without stream interruption
- Parallel agent execution visually distinguishable

## Non-goals
- Production deployment (local dev only)
- Persistent storage (in-memory sessions)
- Agent prompt engineering (using SDK demos or basic prompts)
- Multi-user support

## Open Questions
1. Should completed agent nodes auto-collapse?
2. How to handle very long thinking text (truncate vs scroll)?
3. Should artifacts be viewable inline or in a separate panel?
```

### Step 6: README Update

Update root README.md with:
- Project description
- Quick start (3 commands: clone, backend setup, frontend setup)
- Architecture diagram (ASCII)
- Component overview
- Known limitations
- Evaluation self-assessment

## Todo List

- [ ] Implement `backend/app/services/mock_stream.py` — full mock sequence
- [ ] Add `?mock=true` to stream endpoint
- [ ] Create `frontend/src/lib/api.ts` — API client
- [ ] Wire `App.tsx` with `useEventStream` hook
- [ ] Test end-to-end: query -> ask_user -> parallel -> report
- [ ] Test mock mode end-to-end
- [ ] Add error handling: disconnects, agent errors, timeouts
- [ ] Add error boundary component for React
- [ ] Write `docs/design-doc.md`
- [ ] Update `README.md` with setup + architecture

## Success Criteria

1. Full pipeline works end-to-end with mock events
2. Full pipeline works with real Claude Agent SDK (with API key)
3. ask_user pause/resume works without disconnection
4. Parallel researchers render side-by-side in trace
5. Errors display clearly in both chat and trace
6. Design document covers all required sections
7. README enables someone to set up in <5 minutes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK integration issues | High | High | Mock stream as primary demo; real SDK as bonus |
| ask_user Future not resolving | Medium | High | Add timeout (5 min) with cleanup |
| Event ordering in mock differs from real | Medium | Medium | Study SDK demo output; match ordering patterns |

## Next Steps
Proceed to [Phase 06: Testing & Deliverables](./phase-06-testing.md)

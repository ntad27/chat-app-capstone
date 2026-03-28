# Phase 02: Backend — Agent System & Event Normalization

## Context
- **Parent plan:** [plan.md](./plan.md)
- **Dependencies:** [Phase 01](./phase-01-setup.md)
- **Research:** [SDK Events](./research/researcher-01-sdk-events.md)
- **Docs:** [Agent SDK Python](https://github.com/anthropics/claude-agent-sdk-python), [Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-03-28 |
| Priority | P1 |
| Effort | 3h |
| Status | pending |
| Description | Define 4 research agents, build event normalizer, SSE streaming endpoint, ask_user POST endpoint, session management |

## Key Insights
- Backend is the **normalization boundary** — raw SDK events never reach the browser
- `parent_tool_use_id` is the critical linkage field for tree construction
- SSE connection stays open during `ask_user` pause (no disconnect/reconnect)
- Session state must track: agent run, pending ask_user questions, collected artifacts
- Multiple `web-researcher` instances run in parallel with same agent type but different `tool_use_id`

## Requirements
1. 4 agent definitions with system prompts (lead-analyst, web-researcher, data-analyst, report-writer)
2. Event normalizer: raw SDK events -> typed `NormalizedEvent` schema
3. SSE endpoint: `GET /api/stream/{session_id}` streams normalized events
4. User answer endpoint: `POST /api/answer/{session_id}` resumes paused agent
5. Session start endpoint: `POST /api/sessions` creates new research session
6. In-memory session store (no database needed for capstone)

## Architecture

```
POST /api/sessions
  body: { query: "Research Anthropic..." }
  returns: { session_id: "uuid" }

GET /api/stream/{session_id}
  SSE stream of NormalizedEvent objects
  Connection stays open until "done" event

POST /api/answer/{session_id}
  body: { answer: "developer adoption" }
  resumes paused agent, stream continues
```

### Normalized Event Schema

```python
from enum import Enum
from pydantic import BaseModel
from typing import Any, Optional
import time

class EventType(str, Enum):
    SESSION_START = "session_start"
    THINKING = "thinking"
    TOOL_USE_START = "tool_use_start"
    TOOL_USE_END = "tool_use_end"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_END = "subagent_end"
    AGENT_RESPONSE = "agent_response"
    ASK_USER = "ask_user"
    ERROR = "error"
    DONE = "done"

class AgentStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class NormalizedEvent(BaseModel):
    id: str                              # unique event id (uuid)
    type: EventType
    timestamp: float                     # unix timestamp
    agent_name: str                      # which agent emitted this
    agent_role: str                      # orchestrator | researcher | analyst | writer
    parent_tool_use_id: Optional[str]    # links subagent to parent's Task tool call
    data: dict[str, Any]                 # event-specific payload
```

### Event-Specific Data Payloads

| Event Type | `data` fields |
|-----------|--------------|
| `session_start` | `{ model, session_id }` |
| `thinking` | `{ text }` |
| `tool_use_start` | `{ tool_use_id, tool_name, input }` |
| `tool_use_end` | `{ tool_use_id, tool_name, output, error? }` |
| `subagent_start` | `{ agent_name, agent_role, tool_use_id, subtopic? }` |
| `subagent_end` | `{ agent_name, status, output? }` |
| `agent_response` | `{ text, artifacts?: [{name, content, type}] }` |
| `ask_user` | `{ question, request_id }` |
| `error` | `{ message, agent_name, recoverable }` |
| `done` | `{ exit_reason, total_tokens? }` |

## Related Code Files

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/models/events.py` | Create | NormalizedEvent, EventType, AgentStatus Pydantic models |
| `backend/app/agents/prompts/lead_analyst.md` | Create | Lead analyst system prompt |
| `backend/app/agents/prompts/web_researcher.md` | Create | Web researcher system prompt |
| `backend/app/agents/prompts/data_analyst.md` | Create | Data analyst system prompt |
| `backend/app/agents/prompts/report_writer.md` | Create | Report writer system prompt |
| `backend/app/agents/orchestrator.py` | Create | Agent creation + orchestration logic |
| `backend/app/services/normalizer.py` | Create | Raw SDK event -> NormalizedEvent |
| `backend/app/services/session.py` | Create | In-memory session store |
| `backend/app/routes/stream.py` | Create | SSE streaming endpoint |
| `backend/app/routes/sessions.py` | Create | Session CRUD endpoints |
| `backend/tests/test_normalizer.py` | Create | Unit tests for event normalizer |

## Implementation Steps

### Step 1: Event Models (`backend/app/models/events.py`)

Define all Pydantic models from the schema above. This is the contract between backend and frontend.

```python
import uuid
import time
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field

class EventType(str, Enum):
    SESSION_START = "session_start"
    THINKING = "thinking"
    TOOL_USE_START = "tool_use_start"
    TOOL_USE_END = "tool_use_end"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_END = "subagent_end"
    AGENT_RESPONSE = "agent_response"
    ASK_USER = "ask_user"
    ERROR = "error"
    DONE = "done"

class AgentStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class NormalizedEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventType
    timestamp: float = Field(default_factory=time.time)
    agent_name: str
    agent_role: str
    parent_tool_use_id: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)
```

### Step 2: Agent Prompts

**`lead_analyst.md`** — Key instructions:
- Decompose research request into 2-4 subtopics
- Use `ask_user` when query is ambiguous (scope, angle, priority)
- Use `Task` tool to spawn web-researcher for each subtopic (parallel)
- After all researchers complete, spawn data-analyst, then report-writer
- Never do research directly — only coordinate

**`web_researcher.md`** — Key instructions:
- Focused research on assigned subtopic only
- Use `WebSearch` tool for information gathering
- Save findings as structured markdown with citations
- Output: structured findings with sources

**`data_analyst.md`** — Key instructions:
- Read all research notes from web-researchers
- Extract key metrics, comparisons, data points
- Generate summary tables
- Output: structured data summary

**`report_writer.md`** — Key instructions:
- Read all research notes + data analysis
- Produce final research brief as formatted markdown
- Include: executive summary, key findings, comparison tables, citations
- Output: final report artifact

### Step 3: Session Manager (`backend/app/services/session.py`)

```python
import asyncio
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Session:
    id: str
    query: str
    status: str = "created"  # created | running | paused | completed | failed
    events: list = field(default_factory=list)
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    pending_answer: Optional[asyncio.Future] = None

class SessionStore:
    """In-memory session store. Sufficient for capstone scope."""

    def __init__(self):
        self._sessions: dict[str, Session] = {}

    def create(self, session_id: str, query: str) -> Session:
        session = Session(id=session_id, query=query)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def set_pending_answer(self, session_id: str, future: asyncio.Future):
        session = self._sessions[session_id]
        session.pending_answer = future
        session.status = "paused"

    def resolve_answer(self, session_id: str, answer: str):
        session = self._sessions[session_id]
        if session.pending_answer and not session.pending_answer.done():
            session.pending_answer.set_result(answer)
            session.pending_answer = None
            session.status = "running"

session_store = SessionStore()
```

### Step 4: Event Normalizer (`backend/app/services/normalizer.py`)

```python
from app.models.events import NormalizedEvent, EventType

def normalize_sdk_event(raw_event: dict, agent_context: dict) -> NormalizedEvent:
    """
    Translate raw Claude Agent SDK event into NormalizedEvent.

    agent_context carries:
      - agent_name: str
      - agent_role: str
      - parent_tool_use_id: Optional[str]
    """
    event_type_map = {
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

    raw_type = raw_event.get("type", "")
    event_type = event_type_map.get(raw_type, EventType.ERROR)

    return NormalizedEvent(
        type=event_type,
        agent_name=agent_context.get("agent_name", "unknown"),
        agent_role=agent_context.get("agent_role", "unknown"),
        parent_tool_use_id=agent_context.get("parent_tool_use_id"),
        data=extract_data(raw_event, event_type),
    )

def extract_data(raw_event: dict, event_type: EventType) -> dict:
    """Extract event-specific data payload."""
    raw_data = raw_event.get("data", {})

    if event_type == EventType.THINKING:
        return {"text": raw_data.get("text", "")}
    elif event_type == EventType.TOOL_USE_START:
        return {
            "tool_use_id": raw_data.get("id", ""),
            "tool_name": raw_data.get("name", ""),
            "input": raw_data.get("input", {}),
        }
    elif event_type == EventType.TOOL_USE_END:
        return {
            "tool_use_id": raw_data.get("id", ""),
            "tool_name": raw_data.get("name", ""),
            "output": raw_data.get("output", ""),
            "error": raw_data.get("error"),
        }
    elif event_type == EventType.ASK_USER:
        return {
            "question": raw_data.get("question", ""),
            "request_id": raw_data.get("request_id", ""),
        }
    elif event_type == EventType.SUBAGENT_START:
        return {
            "agent_name": raw_data.get("agent_name", ""),
            "agent_role": raw_data.get("agent_role", ""),
            "tool_use_id": raw_data.get("tool_use_id", ""),
        }
    elif event_type == EventType.SUBAGENT_END:
        return {
            "agent_name": raw_data.get("agent_name", ""),
            "status": raw_data.get("status", "completed"),
        }
    elif event_type == EventType.AGENT_RESPONSE:
        return {
            "text": raw_data.get("text", ""),
            "artifacts": raw_data.get("artifacts", []),
        }
    elif event_type == EventType.ERROR:
        return {
            "message": raw_data.get("message", "Unknown error"),
            "recoverable": raw_data.get("recoverable", False),
        }
    elif event_type == EventType.DONE:
        return {"exit_reason": raw_data.get("exit_reason", "complete")}

    return raw_data
```

### Step 5: Agent Orchestrator (`backend/app/agents/orchestrator.py`)

```python
import asyncio
from claude_agent_sdk import Agent, Task, WebSearch, AskUserQuestion

async def run_research_session(
    query: str,
    session: "Session",
    on_event: callable,  # async callback: (NormalizedEvent) -> None
):
    """
    Run the full research pipeline:
    1. lead-analyst decomposes query (may ask_user for clarification)
    2. web-researchers run in parallel per subtopic
    3. data-analyst processes findings
    4. report-writer generates final brief

    on_event is called for every normalized event, which gets
    pushed to the SSE queue.
    """
    # Create lead analyst agent with tools:
    # - Task (to spawn subagents)
    # - AskUserQuestion (to pause for user input)

    # Hook into SDK's streaming events:
    # - PreToolUse / PostToolUse hooks for tool tracking
    # - Register callback that normalizes + emits via on_event

    # When ask_user fires:
    # 1. Emit ask_user event via on_event
    # 2. Create asyncio.Future, store in session
    # 3. await the future (blocks agent execution)
    # 4. POST /api/answer resolves the future
    # 5. Agent resumes with user's answer
    pass
```

**Key implementation detail:** The orchestrator wraps the SDK's streaming with hooks that capture every event, normalize it, and push to the session's event queue. The SSE endpoint reads from this queue.

### Step 6: SSE Streaming Route (`backend/app/routes/stream.py`)

```python
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from app.services.session import session_store

router = APIRouter()

@router.get("/api/stream/{session_id}")
async def stream_events(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    async def event_generator():
        while True:
            event = await session.event_queue.get()
            yield {"data": event.model_dump_json()}
            if event.type == "done":
                break

    return EventSourceResponse(event_generator())
```

### Step 7: Session & Answer Routes (`backend/app/routes/sessions.py`)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid
from app.services.session import session_store
from app.agents.orchestrator import run_research_session

router = APIRouter()

class CreateSessionRequest(BaseModel):
    query: str

class CreateSessionResponse(BaseModel):
    session_id: str

class AnswerRequest(BaseModel):
    answer: str

@router.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest):
    session_id = str(uuid.uuid4())
    session = session_store.create(session_id, req.query)

    async def emit(event):
        await session.event_queue.put(event)

    # Fire and forget — run in background task
    import asyncio
    asyncio.create_task(run_research_session(req.query, session, emit))

    return CreateSessionResponse(session_id=session_id)

@router.post("/api/answer/{session_id}")
async def answer_question(session_id: str, req: AnswerRequest):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.pending_answer:
        raise HTTPException(400, "No pending question")

    session_store.resolve_answer(session_id, req.answer)
    return {"status": "ok"}
```

### Step 8: Mock Event Stream (for frontend development)

Create `backend/app/services/mock_stream.py` that emits a realistic sequence of normalized events with delays, simulating the full research pipeline. This allows frontend work without API key usage.

```python
async def emit_mock_events(session: Session, on_event: callable):
    """Emit pre-scripted events simulating a full research run."""
    events = [
        # session_start
        # lead-analyst thinking
        # ask_user (scope question)
        # (pause — wait for answer)
        # web-researcher #1 start (parallel)
        # web-researcher #2 start (parallel)
        # web-researcher #3 start (parallel)
        # ... tool calls, thinking, responses ...
        # web-researcher #1 end
        # web-researcher #2 end
        # web-researcher #3 end
        # data-analyst start, work, end
        # report-writer start, work, end
        # done
    ]
    for event in events:
        await asyncio.sleep(0.3)  # simulate processing time
        await on_event(event)
```

## Todo List

- [ ] Create `backend/app/models/events.py` — NormalizedEvent + EventType enums
- [ ] Write agent system prompts (4 markdown files)
- [ ] Implement `backend/app/services/session.py` — SessionStore
- [ ] Implement `backend/app/services/normalizer.py` — SDK event normalizer
- [ ] Implement `backend/app/agents/orchestrator.py` — agent creation + run loop
- [ ] Implement `backend/app/routes/stream.py` — SSE endpoint
- [ ] Implement `backend/app/routes/sessions.py` — create session + answer
- [ ] Register routes in `backend/app/main.py`
- [ ] Create `backend/app/services/mock_stream.py` — mock event emitter
- [ ] Add `?mock=true` query param to stream endpoint for dev mode
- [ ] Write `backend/tests/test_normalizer.py`

## Success Criteria

1. `POST /api/sessions` creates session and starts agent run in background
2. `GET /api/stream/{session_id}` returns SSE stream of NormalizedEvent JSON
3. `POST /api/answer/{session_id}` resolves pending ask_user and stream resumes
4. Mock mode emits full event sequence without API key
5. All 10 event types correctly normalized from SDK events
6. Normalizer unit tests pass

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK streaming API differs from docs | Medium | High | Start with mock stream; adapt normalizer after SDK testing |
| Agent orchestration complexity | Medium | Medium | Start simple: lead-analyst with one web-researcher; add parallelism after |
| ask_user Future resolution race | Low | Medium | Use asyncio.Future with proper error handling; timeout after 5 min |
| API rate limits during dev | Medium | Low | Mock mode by default; real SDK only for integration testing |

## Next Steps
Proceed to [Phase 03: Frontend — Decoder & State](./phase-03-decoder-state.md)

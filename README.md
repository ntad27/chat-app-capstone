# Deep Analyst — Research Intelligence Platform

An agent-transparent chat application that gives users full visibility into multi-agent AI research execution. Built for the Capstone Project (Domain A: Deep Analyst).

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp ../.env.example .env    # Edit with your ANTHROPIC_API_KEY (optional for mock mode)
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the frontend proxies API requests to the backend.

### Mock Mode (Default)
No API key needed. The app uses a pre-scripted mock event stream that simulates a full research pipeline: lead-analyst -> 3 parallel web-researchers -> data-analyst -> report-writer.

### Live Mode (Real Claude API)
Set these in `backend/.env`:
```
MOCK_MODE=false
ANTHROPIC_API_KEY=sk-ant-your-key-here
MODEL_NAME=claude-sonnet-4-20250514
```

In live mode, the backend runs real multi-agent orchestration using the Anthropic Python SDK:
- **lead-analyst** uses tool calls (`ask_user`, `dispatch_researchers`) to decompose the query
- **web-researcher** agents run in parallel via `asyncio.gather()`, each making a streaming Claude API call
- **data-analyst** and **report-writer** run sequentially after researchers complete
- All API calls use `client.messages.stream()` for real-time event emission
- The `ask_user` tool pauses the agent loop, waits for user input via `asyncio.Future`, then resumes

## Architecture

```
Browser (React + TypeScript + Zustand)     Backend (FastAPI + Python)
┌──────────────────────┐                   ┌──────────────────────────┐
│  SSE Consumer Hook   │◄── SSE stream ───│ GET /api/stream/{id}     │
│  Event Decoder       │                   │ NormalizedEvent emitter  │
│  Trace Store (tree)  │                   │                          │
│  Chat Store          │── POST answer ──►│ POST /api/answer/{id}    │
│  Chat Panel | Trace  │── POST query  ──►│ POST /api/sessions       │
└──────────────────────┘                   │ Mock / Agent Orchestrator│
                                           └──────────────────────────┘
```

### Data Flow
1. User submits research query -> `POST /api/sessions` -> returns `session_id`
2. Frontend connects to `GET /api/stream/{session_id}` (SSE)
3. Backend emits `NormalizedEvent` objects through the stream
4. Frontend `decodeEvent()` routes each event to the correct Zustand store
5. `applyEventToTree()` builds nested trace tree using `parent_tool_use_id`
6. UI reactively renders chat messages, trace tree, and status indicators

### Event Types (10)
| Event | Description |
|-------|-------------|
| `session_start` | Research session initialized |
| `thinking` | Agent internal reasoning |
| `tool_use_start` | Tool invocation begins |
| `tool_use_end` | Tool invocation completes |
| `subagent_start` | Sub-agent spawned |
| `subagent_end` | Sub-agent completed/failed |
| `agent_response` | Agent text output + artifacts |
| `ask_user` | Agent pauses for user input |
| `error` | Agent error |
| `done` | Session complete |

### Agent Pipeline
```
lead-analyst (orchestrator)
  ├── [ask_user] clarify research angle
  ├── web-researcher #1 ─┐
  ├── web-researcher #2 ──┤ parallel
  ├── web-researcher #3 ─┘
  ├── data-analyst (sequential after researchers)
  └── report-writer (sequential after data-analyst)
```

## Project Structure
```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app with CORS + routes
│   │   ├── config.py            # Pydantic settings
│   │   ├── models/events.py     # NormalizedEvent schema
│   │   ├── services/
│   │   │   ├── normalizer.py    # SDK event -> NormalizedEvent
│   │   │   ├── session.py       # In-memory session store
│   │   │   └── mock_stream.py   # Mock event emitter
│   │   └── routes/
│   │       ├── sessions.py      # POST /api/sessions, /api/answer
│   │       └── stream.py        # GET /api/stream (SSE)
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── types/               # TypeScript event + trace types
│   │   ├── lib/
│   │   │   ├── decoder.ts       # Event router (30% of eval)
│   │   │   ├── tree-builder.ts  # Trace tree construction
│   │   │   └── api.ts           # API client
│   │   ├── stores/              # Zustand: trace, chat, session
│   │   ├── hooks/               # useSSE, useEventStream
│   │   ├── components/
│   │   │   ├── chat/            # ChatPanel, MessageList, AskUserPrompt
│   │   │   └── trace/           # TracePanel, TraceNode, ParallelGroup
│   │   └── __tests__/           # Decoder + tree builder tests
│   └── vitest.config.ts
├── docs/design-doc.md           # 1-pager design document
└── SPEC.md                      # Original project specification
```

## Running Tests

```bash
# Frontend (decoder + tree builder tests)
cd frontend && npm test

# Backend (normalizer + health tests)
cd backend && source .venv/bin/activate && pytest
```

## Key Design Decisions

1. **Backend normalization boundary** — Raw SDK events never reach the browser. The `NormalizedEvent` Pydantic model is the contract.
2. **SSE over WebSocket** — Server-to-client only; POST endpoint for user answers. Simpler protocol.
3. **Zustand (no Immer)** — `structuredClone` for immutable updates. Fine-grained subscriptions prevent re-render cascades.
4. **`parent_tool_use_id` for tree construction** — The critical field linking sub-agent events to their parent node.
5. **Mock-first development** — Mock stream enables reliable demos and frontend dev without API key costs.

## Known Limitations

1. **In-memory sessions** — Sessions lost on server restart; no persistence
2. **Single user** — No auth, no multi-user support
3. **No stream reconnection with replay** — If SSE drops, missed events are lost
4. **Mock-first** — Mock stream is the reliable demo path; real SDK integration may have edge cases
5. **No artifact persistence** — Artifacts exist only in memory during the session
6. **Agent prompts are basic** — Focused on demonstrating the trace UI, not production-quality research
7. **No rate limiting** — Each session creates a new agent run; no cost controls

## Deliverables

- [x] Working application (runs locally with `uvicorn` + `npm run dev`)
- [x] [1-pager design document](docs/design-doc.md)
- [x] README with setup, architecture, limitations (this file)
- [x] Decoder tests (event routing + tree construction)

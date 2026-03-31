# Deep Analyst — Research Intelligence Platform

An agent-transparent chat application that gives users full visibility into multi-agent AI research execution. Built for the Capstone Project (Domain A: Deep Analyst).

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- An Anthropic API key (optional — mock mode works without one)

### 1. Clone & Setup Backend
```bash
git clone https://github.com/ntad27/chat-app-capstone.git
cd chat-app-capstone/backend

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### 2. Configure Environment
```bash
cp ../.env.example .env
```

Edit `backend/.env`:
```env
# For mock mode (default) — no API key needed:
MOCK_MODE=true

# For live mode — real Claude API calls:
MOCK_MODE=false
ANTHROPIC_API_KEY=sk-ant-your-key-here
MODEL_NAME=claude-sonnet-4-20250514
```

### 3. Start Backend
```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Start Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the App
Navigate to **http://localhost:5173** and enter a research query.

### Docker (Alternative)
```bash
docker compose up --build
# Open http://localhost:5173
```

---

## Mock Mode vs Live Mode

| | Mock Mode (`MOCK_MODE=true`) | Live Mode (`MOCK_MODE=false`) |
|---|---|---|
| **API key** | Not required | Required (`ANTHROPIC_API_KEY`) |
| **What happens** | Pre-scripted event stream with realistic timing | Real Claude API calls via `anthropic` Python SDK |
| **Agents** | Simulated pipeline with mock data | Real multi-agent orchestration with `client.messages.stream()` |
| **ask_user** | Simulated pause/resume | Real tool use: Claude calls `ask_user` tool, pauses via `asyncio.Future` |
| **Cost** | Free | Uses API credits (~$0.10-0.50 per query) |
| **Use case** | Demo, frontend development, testing | Production evaluation, real research |

Both modes emit the same `NormalizedEvent` schema — the frontend doesn't know which mode is active.

---

## Architecture

```
Browser (React + TypeScript + Zustand)     Backend (FastAPI + Python)
┌──────────────────────┐                   ┌──────────────────────────┐
│  SSE Consumer Hook   │◄── SSE stream ───│ GET /api/stream/{id}     │
│  Event Decoder       │                   │ NormalizedEvent emitter  │
│  Trace Store (tree)  │                   │                          │
│  Chat Store          │── POST answer ──►│ POST /api/answer/{id}    │
│  Chat Panel | Trace  │── POST query  ──►│ POST /api/sessions       │
└──────────────────────┘                   │                          │
                                           │ Mock Stream (mock mode)  │
                                           │   or                     │
                                           │ Agent Orchestrator (live)│
                                           │   └─ Anthropic SDK       │
                                           └──────────────────────────┘
```

### Data Flow
1. User submits research query → `POST /api/sessions` → returns `session_id`
2. In live mode, backend starts agent orchestrator in background (`asyncio.create_task`)
3. Frontend connects to `GET /api/stream/{session_id}` (SSE)
4. Backend emits `NormalizedEvent` objects through the stream
5. Frontend `decodeEvent()` routes each event to the correct Zustand store
6. `applyEventToTree()` builds nested trace tree using `parent_tool_use_id`
7. UI reactively renders chat messages, trace tree, and status indicators

### Agent Pipeline (Live Mode)
```
lead-analyst (orchestrator) — uses tool calls to coordinate
  ├── [ask_user tool] → clarify research angle (pauses for user input)
  ├── [dispatch_researchers tool] → decompose into subtopics
  │
  ├── web-researcher #1 ─┐
  ├── web-researcher #2 ──┤ parallel (asyncio.gather)
  ├── web-researcher #3 ─┘
  │
  ├── data-analyst (sequential, after researchers complete)
  └── report-writer (sequential, produces final brief as artifact)
```

Each agent is a separate Claude API call with its own system prompt. The lead-analyst uses the Anthropic SDK's tool use feature to call `ask_user` and `dispatch_researchers`. Sub-agents use `client.messages.stream()` for real-time streaming.

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

---

## Project Structure
```
├── backend/
│   ├── app/
│   │   ├── main.py                        # FastAPI app with CORS + routes
│   │   ├── config.py                      # Pydantic settings (API key, mock mode)
│   │   ├── models/events.py               # NormalizedEvent + EventType schema
│   │   ├── agents/
│   │   │   ├── orchestrator.py            # Real agent orchestration (Anthropic SDK)
│   │   │   └── prompts/lead_analyst.py    # System prompts for all 4 agents
│   │   ├── services/
│   │   │   ├── normalizer.py              # Raw SDK event → NormalizedEvent
│   │   │   ├── session.py                 # In-memory session store + ask_user Future
│   │   │   └── mock_stream.py             # Mock event emitter (demo mode)
│   │   └── routes/
│   │       ├── sessions.py                # POST /api/sessions, POST /api/answer
│   │       └── stream.py                  # GET /api/stream (SSE endpoint)
│   └── tests/
│       ├── test_health.py                 # Health endpoint test
│       └── test_normalizer.py             # Event normalizer tests (6 cases)
├── frontend/
│   ├── src/
│   │   ├── types/events.ts                # Discriminated union event types
│   │   ├── types/trace.ts                 # TraceNode + TraceTree types
│   │   ├── lib/
│   │   │   ├── decoder.ts                 # Event decoder (routes to stores)
│   │   │   ├── tree-builder.ts            # Trace tree construction
│   │   │   └── api.ts                     # API client (createSession, sendAnswer)
│   │   ├── stores/                        # Zustand: trace-store, chat-store, session-store
│   │   ├── hooks/                         # useSSE (reconnection), useEventStream
│   │   ├── components/
│   │   │   ├── chat/                      # ChatPanel, MessageList, AskUserPrompt, ActivityTicker
│   │   │   └── trace/                     # TracePanel, TraceNode, ParallelGroup, StatusBadge
│   │   └── __tests__/
│   │       ├── decoder.test.ts            # 11 decoder routing tests
│   │       ├── tree-builder.test.ts       # 7 tree construction tests
│   │       └── helpers/event-factory.ts   # Test event builders
│   └── vitest.config.ts
├── docs/design-doc.md                     # 1-pager design document (Amazon-style)
├── docker-compose.yml                     # Single-command local startup
├── .env.example                           # Environment variable template
└── SPEC.md                                # Original project specification
```

---

## Running Tests

```bash
# Frontend — decoder routing + tree builder (19 tests)
cd frontend && npm test

# Backend — health + normalizer (7 tests)
cd backend && source .venv/bin/activate && pytest -v
```

---

## Key Design Decisions

1. **Backend normalization boundary** — Raw SDK events never reach the browser. `NormalizedEvent` (Pydantic) is the contract between backend and frontend.
2. **Real agent orchestration** — Each agent is a separate Claude API call with its own system prompt. Lead-analyst uses tool use (`ask_user`, `dispatch_researchers`) to orchestrate.
3. **SSE over WebSocket** — Server-to-client streaming; POST endpoint for user answers. Simpler protocol for unidirectional events.
4. **`parent_tool_use_id` for tree construction** — The critical field linking sub-agent events to their parent node in the trace tree.
5. **Zustand with `structuredClone`** — No Immer dependency. Fine-grained subscriptions prevent re-render cascades during rapid event streaming.
6. **Mock + Live dual mode** — Mock stream enables demos without API costs; live mode exercises real SDK integration with the same frontend.

---

## Known Limitations

1. **In-memory sessions** — Sessions lost on server restart; no persistence
2. **Single user** — No auth, no multi-user support
3. **No stream reconnection with replay** — If SSE drops, missed events are lost
4. **No artifact persistence** — Artifacts exist only in memory during the session
5. **Agent prompts are basic** — Focused on demonstrating the trace UI, not production-quality research
6. **No rate limiting** — Each session creates a new agent run; no cost controls
7. **Web researchers don't have internet access** — They use Claude's training knowledge, not live web search

---

## Deliverables

- [x] Working application (mock mode + live mode with Anthropic API key)
- [x] [1-pager design document](docs/design-doc.md) (Amazon-style: Tenets, Problem, Solution, Goals, Non-goals)
- [x] README with setup, architecture, limitations (this file)
- [x] Decoder tests — 26 total (11 decoder routing + 7 tree builder + 7 backend normalizer + 1 health)

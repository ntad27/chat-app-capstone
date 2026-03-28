# Deep Analyst — Design Document

## Title
Agent-Transparent Research Intelligence Platform

## Tenets
1. **Transparency over abstraction** — show all agent activity, never hide what's happening
2. **Real-time over batch** — events render as they arrive, not after completion
3. **Graceful degradation** — errors are visible and contextual, never silent

## Problem
AI agent systems are opaque. Users submit a query and wait for a response with no visibility into what agents are doing, which tools they use, or why they make decisions. When agents orchestrate sub-agents in parallel, the complexity is entirely hidden.

## Proposed Solution
A chat application that consumes the Claude Agent SDK event stream and renders a real-time trace tree alongside the chat conversation. The backend normalizes raw SDK events into a typed schema; the frontend decodes them into a nested tree with parallel agent visualization and interactive ask_user flow.

### Architecture

```
Browser (React+TS+Zustand)          Backend (FastAPI+Python)
┌─────────────────┐  SSE stream  ┌────────────────────────┐
│ SSE Consumer     ├─────────────│ GET /api/stream/{id}   │
│ Event Decoder    │             │ Event Normalizer        │
│ Trace Store      │  POST       │ Agent Orchestrator      │
│ Chat + Trace UI  ├─────────────│ POST /api/answer/{id}  │
└─────────────────┘             │ Claude Agent SDK        │
                                └────────────────────────┘
```

### Key Design Decisions

**Single SSE stream per session.** Each research run produces one long-lived SSE connection. Events arrive sequentially but represent parallel activity (multiple sub-agents running simultaneously). The frontend decoder routes each event to the correct tree node using `parent_tool_use_id`.

**Parallel agents render side-by-side.** When a parent agent node has multiple agent children, the UI renders them as horizontally-arranged cards within a "parallel group" container. This makes concurrent execution visually obvious.

**ask_user keeps the stream open.** When an agent pauses for user input, the SSE connection stays open — the server simply stops emitting events. The user's answer is sent via a separate POST endpoint, which resolves an asyncio Future and resumes the agent. No reconnection needed.

**Artifacts are collected in-stream.** Files and reports produced by agents are captured from `agent_response` events and attached to their trace nodes. They're viewable inline in the trace tree and in chat messages.

**Mock mode by default.** A pre-scripted mock event stream enables reliable demos and frontend development without an API key. Real SDK mode activates when `MOCK_MODE=false` and a valid `ANTHROPIC_API_KEY` is set.

## Goals
- Full trace visibility for all 10 agent event types
- Real-time streaming with incremental state building
- ask_user pause/resume without stream interruption
- Parallel agent execution visually distinguishable from sequential
- Typed event pipeline: Pydantic (backend) -> discriminated unions (frontend)

## Non-goals
- Production deployment (local development only)
- Persistent storage (in-memory sessions, lost on restart)
- Agent prompt engineering (using basic prompts; focus is on the trace UI)
- Multi-user support (single user, single session at a time)
- Stream reconnection with replay (stretch goal, not MVP)

## Open Questions
1. Should completed agent nodes auto-collapse after a delay?
2. How to handle very long thinking text — truncate with "show more" or full scroll?
3. Should artifacts be viewable in a dedicated side panel or inline only?

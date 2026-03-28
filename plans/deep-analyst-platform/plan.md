---
title: "Deep Analyst - Research Intelligence Platform"
description: "Agent-transparent chat app with real-time trace visualization for multi-agent research orchestration"
status: pending
priority: P1
effort: "16h"
branch: main
tags: [claude-agent-sdk, react, fastapi, sse, multi-agent]
created: 2026-03-28
---

# Deep Analyst — Implementation Plan

## Architecture Overview

```
Browser (React+TS+Zustand)          Backend (FastAPI+Python)
┌─────────────┐  SSE stream   ┌──────────────────────┐
│ SSE Consumer ├──────────────►│ /api/stream/{session} │
│ EventDecoder │               │ EventNormalizer       │
│ TraceStore   │  POST answer  │ AgentOrchestrator     │
│ ChatPanel    ├──────────────►│ /api/answer/{session} │
│ TracePanel   │               │ Claude Agent SDK      │
└─────────────┘               └──────────────────────┘
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 01 | Project Setup & Infrastructure | 1h | **DONE** | [phase-01-setup.md](./phase-01-setup.md) |
| 02 | Backend — Agent System & SSE | 3h | pending | [phase-02-backend.md](./phase-02-backend.md) |
| 03 | Frontend — Decoder & State | 3h | pending | [phase-03-decoder-state.md](./phase-03-decoder-state.md) |
| 04 | Frontend — UI Components | 4h | pending | [phase-04-ui-components.md](./phase-04-ui-components.md) |
| 05 | Integration & Polish | 3h | pending | [phase-05-integration.md](./phase-05-integration.md) |
| 06 | Testing & Deliverables | 2h | pending | [phase-06-testing.md](./phase-06-testing.md) |

## Critical Path

```
Phase 01 ──► Phase 02 (backend) ──┐
             Phase 03 (decoder) ──┼──► Phase 05 (integration)──► Phase 06
             Phase 04 (UI)  ──────┘
```

Phases 02, 03, 04 can partially overlap: frontend work uses mock events while backend is built.

## Key Decisions

1. **Python backend** — Claude Agent SDK Python is more mature; FastAPI has native SSE
2. **SSE over WebSocket** — server-to-client only; simpler; POST for user answers
3. **Zustand + Immer** — fine-grained subscriptions for tree mutations under streaming
4. **Event normalization** — backend translates raw SDK events into typed schema before SSE
5. **parent_tool_use_id** — the critical field linking subagent events to parent tree nodes

## Evaluation Alignment

| Criteria (weight) | Primary phases |
|---|---|
| Architecture (30%) | Phase 02 (normalization), Phase 03 (decoder/store separation) |
| Decode Correctness (30%) | Phase 03 (decoder + tree builder + tests) |
| UI/UX (20%) | Phase 04 (trace panel, parallel viz, ask_user) |
| Code Quality (20%) | Phase 03 (typed events), Phase 06 (tests) |

## Risk Summary

| Risk | Mitigation |
|------|------------|
| SDK event schema changes | Normalize at backend boundary; frontend never sees raw SDK events |
| ask_user stream stall | SSE stays open; client polls connection health; timeout UI |
| Parallel event race conditions | Immer draft mutations are synchronous; batch via queueMicrotask |
| API key cost during dev | Mock event stream for frontend dev; real SDK only for integration |

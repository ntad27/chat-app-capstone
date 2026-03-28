# Research Report: Claude Agent SDK Event Streaming & Multi-Agent Orchestration

**Date:** 2026-03-28 | **SDK:** v0.86.0+ (claude-agent-sdk-python)

## Core Event Types (10)

1. **session_start** — execution init with model/tokens config
2. **thinking** — internal reasoning (extended_thinking blocks)
3. **tool_use_start** — tool invocation begins (name, input)
4. **tool_use_end** — tool invocation completes (output, error)
5. **subagent_start** — child agent lifecycle begins (agent name, role, parent_tool_use_id)
6. **subagent_end** — child agent lifecycle ends (status, output)
7. **agent_response** — text/tool content blocks from agent
8. **ask_user** — pause execution for user input
9. **error** — execution failures
10. **done** — final event with exit_reason

## Event Streaming Protocol: SSE

- HTTP streaming, JSON per line
- Sequential guaranteed ordering
- Format: `{"event": "tool_use_start", "data": {...}}`
- Connection stays open during ask_user pause (no disconnect)

## Multi-Agent Linkage via parent_tool_use_id

- Every subagent event carries `parent_tool_use_id` linking to parent's Task tool invocation
- Task tool spawns subagents with context inheritance
- Tree reconstruction: event.parent_tool_use_id -> find parent node -> nest under it
- Multiple subagents can share same parent (parallel dispatch)

## Ask_User Flow

1. Agent emits `ask_user` event with question text
2. Stream stays open but server stops emitting events
3. Client collects user answer, sends via POST endpoint
4. Server calls `send_user_message()` to resume agent
5. Stream resumes with new events

## Key Architecture Insights

- Backend normalizes raw SDK events into clean schema before SSE to browser
- parent_tool_use_id is the critical field for tree construction
- Parallel agents: multiple subagent_start events with same parent before any subagent_end
- Sequential-after-parallel: next phase starts only after all parallel subagent_end received

## Unresolved Questions

1. Exact event ordering guarantees for concurrent tool calls?
2. Thinking content accessibility (may be filtered by API)?
3. Error recovery/continuation semantics after subagent failure?
4. Event schema versioning strategy?

"""
Real agent orchestrator using the Anthropic Python SDK.

Architecture:
- Each "agent" is a Claude API call with a specific system prompt
- The lead-analyst uses tools (ask_user, dispatch_researchers) to orchestrate
- Sub-agents (web-researcher, data-analyst, report-writer) are separate API calls
- All events are emitted as NormalizedEvent objects to the session's event queue
"""

import asyncio
import json
import uuid

import anthropic

from app.config import settings
from app.models.events import EventType, NormalizedEvent
from app.services.session import Session

from .prompts.lead_analyst import (
    DATA_ANALYST_PROMPT,
    REPORT_WRITER_PROMPT,
    SYSTEM_PROMPT as LEAD_ANALYST_PROMPT,
    TOOLS as LEAD_ANALYST_TOOLS,
    WEB_RESEARCHER_PROMPT,
)


async def run_research_session(session: Session, on_event):
    """Run the full research pipeline with real Claude API calls."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    model = settings.model_name

    # --- Phase 1: Lead Analyst — decompose query ---
    await on_event(NormalizedEvent(
        type=EventType.SESSION_START,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"model": model, "session_id": session.id},
    ))

    subtopics = await _run_lead_analyst(
        client, model, session, on_event
    )

    if not subtopics:
        await _emit_error(on_event, "Lead analyst failed to produce subtopics")
        await _emit_done(on_event, "error")
        return

    # --- Phase 2: Parallel web researchers ---
    task_id = str(uuid.uuid4())
    await on_event(NormalizedEvent(
        type=EventType.TOOL_USE_START,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"tool_use_id": task_id, "tool_name": "Task", "input": {"action": "spawn_researchers", "count": len(subtopics)}},
    ))

    research_results = await _run_parallel_researchers(
        client, model, subtopics, task_id, on_event
    )

    await on_event(NormalizedEvent(
        type=EventType.TOOL_USE_END,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"tool_use_id": task_id, "tool_name": "Task", "output": f"All {len(subtopics)} researchers completed"},
    ))

    # --- Phase 3: Data Analyst ---
    da_task_id = str(uuid.uuid4())
    data_analysis = await _run_subagent(
        client, model,
        agent_name="data-analyst",
        agent_role="analyst",
        system_prompt=DATA_ANALYST_PROMPT,
        user_content=f"Analyze these research findings:\n\n{_format_findings(research_results)}",
        parent_task_id=da_task_id,
        on_event=on_event,
    )

    # --- Phase 4: Report Writer ---
    rw_task_id = str(uuid.uuid4())
    report = await _run_subagent(
        client, model,
        agent_name="report-writer",
        agent_role="writer",
        system_prompt=REPORT_WRITER_PROMPT,
        user_content=(
            f"Original query: {session.query}\n\n"
            f"Research findings:\n{_format_findings(research_results)}\n\n"
            f"Data analysis:\n{data_analysis}"
        ),
        parent_task_id=rw_task_id,
        on_event=on_event,
        emit_as_artifact=True,
    )

    # --- Final response from lead analyst ---
    await on_event(NormalizedEvent(
        type=EventType.AGENT_RESPONSE,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={
            "text": f"Research complete. Here is the synthesized brief on: {session.query}",
            "artifacts": [{"name": "research-brief.md", "type": "markdown", "content": report}],
        },
    ))

    await _emit_done(on_event, "complete")


async def _run_lead_analyst(client, model, session: Session, on_event) -> list[str]:
    """Run lead analyst with tool use loop (ask_user + dispatch_researchers)."""
    messages = [{"role": "user", "content": session.query}]

    for _ in range(5):  # max 5 iterations
        await on_event(NormalizedEvent(
            type=EventType.THINKING,
            agent_name="lead-analyst",
            agent_role="orchestrator",
            data={"text": "Analyzing research request..."},
        ))

        response = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=LEAD_ANALYST_PROMPT,
            messages=messages,
            tools=LEAD_ANALYST_TOOLS,
        )

        # Collect text + tool_use blocks from response
        assistant_content = []
        for block in response.content:
            if block.type == "text" and block.text.strip():
                await on_event(NormalizedEvent(
                    type=EventType.THINKING,
                    agent_name="lead-analyst",
                    agent_role="orchestrator",
                    data={"text": block.text},
                ))
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        messages.append({"role": "assistant", "content": assistant_content})

        if response.stop_reason != "tool_use":
            return []

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            if block.name == "ask_user":
                question = block.input.get("question", "Could you clarify?")
                request_id = str(uuid.uuid4())

                await on_event(NormalizedEvent(
                    type=EventType.ASK_USER,
                    agent_name="lead-analyst",
                    agent_role="orchestrator",
                    data={"question": question, "request_id": request_id},
                ))

                # Wait for user answer
                loop = asyncio.get_event_loop()
                future = loop.create_future()
                session.pending_answer = future
                session.status = "paused"
                answer = await future
                session.status = "running"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": answer,
                })

            elif block.name == "dispatch_researchers":
                subtopics = block.input.get("subtopics", [])

                await on_event(NormalizedEvent(
                    type=EventType.THINKING,
                    agent_name="lead-analyst",
                    agent_role="orchestrator",
                    data={"text": f"Decomposed into {len(subtopics)} research streams: {', '.join(subtopics)}"},
                ))

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Dispatching {len(subtopics)} researchers.",
                })

                return subtopics

        messages.append({"role": "user", "content": tool_results})

    return []


async def _run_parallel_researchers(
    client, model, subtopics: list[str], parent_task_id: str, on_event
) -> dict[str, str]:
    """Run web-researcher agents in parallel, one per subtopic."""
    results = {}

    async def research_one(subtopic: str):
        rid = str(uuid.uuid4())
        await on_event(NormalizedEvent(
            type=EventType.SUBAGENT_START,
            agent_name="web-researcher",
            agent_role="researcher",
            parent_tool_use_id=parent_task_id,
            data={"agent_name": "web-researcher", "agent_role": "researcher", "tool_use_id": rid, "subtopic": subtopic},
        ))

        try:
            text = await _call_claude(
                client, model,
                system=WEB_RESEARCHER_PROMPT.format(subtopic=subtopic),
                user_content=f"Research this subtopic thoroughly: {subtopic}",
                agent_name="web-researcher",
                parent_tool_use_id=rid,
                on_event=on_event,
            )
            results[subtopic] = text

            await on_event(NormalizedEvent(
                type=EventType.SUBAGENT_END,
                agent_name="web-researcher",
                agent_role="researcher",
                parent_tool_use_id=parent_task_id,
                data={"agent_name": "web-researcher", "status": "completed"},
            ))
        except Exception as e:
            results[subtopic] = f"Research failed: {e}"
            await on_event(NormalizedEvent(
                type=EventType.SUBAGENT_END,
                agent_name="web-researcher",
                agent_role="researcher",
                parent_tool_use_id=parent_task_id,
                data={"agent_name": "web-researcher", "status": "failed"},
            ))

    # Run all researchers in parallel
    await asyncio.gather(*[research_one(st) for st in subtopics])
    return results


async def _run_subagent(
    client, model, agent_name: str, agent_role: str,
    system_prompt: str, user_content: str, parent_task_id: str,
    on_event, emit_as_artifact: bool = False,
) -> str:
    """Run a sequential sub-agent (data-analyst or report-writer)."""
    agent_id = str(uuid.uuid4())

    await on_event(NormalizedEvent(
        type=EventType.TOOL_USE_START,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"tool_use_id": parent_task_id, "tool_name": "Task", "input": {"agent": agent_name}},
    ))
    await on_event(NormalizedEvent(
        type=EventType.SUBAGENT_START,
        agent_name=agent_name,
        agent_role=agent_role,
        parent_tool_use_id=parent_task_id,
        data={"agent_name": agent_name, "agent_role": agent_role, "tool_use_id": agent_id},
    ))

    text = await _call_claude(
        client, model,
        system=system_prompt,
        user_content=user_content,
        agent_name=agent_name,
        parent_tool_use_id=agent_id,
        on_event=on_event,
    )

    if emit_as_artifact:
        await on_event(NormalizedEvent(
            type=EventType.AGENT_RESPONSE,
            agent_name=agent_name,
            agent_role=agent_role,
            parent_tool_use_id=agent_id,
            data={"text": "Analysis complete.", "artifacts": [{"name": f"{agent_name}-output.md", "type": "markdown", "content": text}]},
        ))

    await on_event(NormalizedEvent(
        type=EventType.SUBAGENT_END,
        agent_name=agent_name,
        agent_role=agent_role,
        parent_tool_use_id=parent_task_id,
        data={"agent_name": agent_name, "status": "completed"},
    ))
    await on_event(NormalizedEvent(
        type=EventType.TOOL_USE_END,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"tool_use_id": parent_task_id, "tool_name": "Task", "output": f"{agent_name} complete"},
    ))

    return text


async def _call_claude(
    client, model: str, system: str, user_content: str,
    agent_name: str, parent_tool_use_id: str | None,
    on_event,
) -> str:
    """Make a streaming Claude API call and emit events for each content block."""
    accumulated_text = ""

    async with client.messages.stream(
        model=model,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        async for event in stream:
            if hasattr(event, "type"):
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    accumulated_text += event.delta.text

    # Emit thinking event with accumulated text
    if accumulated_text.strip():
        await on_event(NormalizedEvent(
            type=EventType.THINKING,
            agent_name=agent_name,
            agent_role="researcher",
            parent_tool_use_id=parent_tool_use_id,
            data={"text": accumulated_text[:500]},  # truncate for UI
        ))

    return accumulated_text


async def _emit_error(on_event, message: str):
    await on_event(NormalizedEvent(
        type=EventType.ERROR,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"message": message, "agent_name": "lead-analyst", "recoverable": False},
    ))


async def _emit_done(on_event, exit_reason: str):
    await on_event(NormalizedEvent(
        type=EventType.DONE,
        agent_name="lead-analyst",
        agent_role="orchestrator",
        data={"exit_reason": exit_reason},
    ))


def _format_findings(results: dict[str, str]) -> str:
    parts = []
    for topic, text in results.items():
        parts.append(f"## {topic}\n\n{text}")
    return "\n\n---\n\n".join(parts)

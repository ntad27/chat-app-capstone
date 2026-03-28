import asyncio
import uuid

from app.models.events import EventType, NormalizedEvent
from app.services.session import Session


async def emit_mock_events(session: Session, on_event):
    """Emit realistic mock events simulating a full research pipeline."""

    async def emit(
        event_type: EventType,
        agent_name: str,
        agent_role: str,
        parent_tool_use_id: str | None = None,
        data: dict | None = None,
        delay: float = 0.3,
    ):
        event = NormalizedEvent(
            type=event_type,
            agent_name=agent_name,
            agent_role=agent_role,
            parent_tool_use_id=parent_tool_use_id,
            data=data or {},
        )
        await on_event(event)
        await asyncio.sleep(delay)

    task_id_1 = str(uuid.uuid4())
    r1_id, r2_id, r3_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())

    # --- Phase 1: Session start + lead-analyst thinking ---
    await emit(
        EventType.SESSION_START,
        "lead-analyst",
        "orchestrator",
        data={"model": "claude-sonnet-4-20250514", "session_id": session.id},
    )
    await emit(
        EventType.THINKING,
        "lead-analyst",
        "orchestrator",
        data={"text": "Analyzing the research request. I need to understand what angle the user wants to focus on before decomposing into subtopics."},
    )

    # --- Phase 2: ask_user ---
    ask_request_id = str(uuid.uuid4())
    await emit(
        EventType.ASK_USER,
        "lead-analyst",
        "orchestrator",
        data={
            "question": "What angle matters most \u2014 technical capabilities, developer adoption, enterprise readiness, or funding?",
            "request_id": ask_request_id,
        },
    )

    # Wait for user answer
    loop = asyncio.get_event_loop()
    future = loop.create_future()
    session.pending_answer = future
    session.status = "paused"
    answer = await future

    await asyncio.sleep(0.5)
    await emit(
        EventType.THINKING,
        "lead-analyst",
        "orchestrator",
        data={"text": f'User wants to focus on: "{answer}". Decomposing into 3 parallel research streams.'},
    )

    # --- Phase 3: Spawn parallel web-researchers ---
    await emit(
        EventType.TOOL_USE_START,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": task_id_1, "tool_name": "Task", "input": {"action": "spawn_researchers", "count": 3}},
    )

    subtopics = [
        ("AI agent frameworks landscape & competition", r1_id),
        ("Developer adoption metrics & community growth", r2_id),
        ("Enterprise AI agent deployments & case studies", r3_id),
    ]

    for subtopic, rid in subtopics:
        await emit(
            EventType.SUBAGENT_START,
            "web-researcher",
            "researcher",
            parent_tool_use_id=task_id_1,
            data={"agent_name": "web-researcher", "agent_role": "researcher", "tool_use_id": rid, "subtopic": subtopic},
            delay=0.15,
        )

    # Simulate parallel research with interleaved events
    for subtopic, rid in subtopics:
        await emit(
            EventType.THINKING,
            "web-researcher",
            "researcher",
            parent_tool_use_id=rid,
            data={"text": f"Searching for information on: {subtopic}"},
            delay=0.2,
        )
        ws_id = str(uuid.uuid4())
        await emit(
            EventType.TOOL_USE_START,
            "web-researcher",
            "researcher",
            parent_tool_use_id=rid,
            data={"tool_use_id": ws_id, "tool_name": "WebSearch", "input": {"query": f"Anthropic {subtopic} 2026"}},
            delay=0.4,
        )
        await emit(
            EventType.TOOL_USE_END,
            "web-researcher",
            "researcher",
            parent_tool_use_id=rid,
            data={"tool_use_id": ws_id, "tool_name": "WebSearch", "output": f"Found 15 relevant results for {subtopic}. Key sources: TechCrunch, ArXiv, official docs."},
            delay=0.2,
        )

    # End all researchers
    for _, rid in subtopics:
        await emit(
            EventType.SUBAGENT_END,
            "web-researcher",
            "researcher",
            parent_tool_use_id=rid,
            data={"agent_name": "web-researcher", "status": "completed"},
            delay=0.15,
        )

    await emit(
        EventType.TOOL_USE_END,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": task_id_1, "tool_name": "Task", "output": "All 3 researchers completed successfully"},
    )

    # --- Phase 4: data-analyst ---
    da_task_id = str(uuid.uuid4())
    da_id = str(uuid.uuid4())
    await emit(
        EventType.TOOL_USE_START,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": da_task_id, "tool_name": "Task", "input": {"agent": "data-analyst"}},
    )
    await emit(
        EventType.SUBAGENT_START,
        "data-analyst",
        "analyst",
        parent_tool_use_id=da_task_id,
        data={"agent_name": "data-analyst", "agent_role": "analyst", "tool_use_id": da_id},
    )
    await emit(
        EventType.THINKING,
        "data-analyst",
        "analyst",
        parent_tool_use_id=da_id,
        data={"text": "Analyzing research findings. Extracting key metrics and building comparison tables."},
        delay=0.8,
    )
    await emit(
        EventType.SUBAGENT_END,
        "data-analyst",
        "analyst",
        parent_tool_use_id=da_task_id,
        data={"agent_name": "data-analyst", "status": "completed"},
    )
    await emit(
        EventType.TOOL_USE_END,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": da_task_id, "tool_name": "Task", "output": "Data analysis complete"},
    )

    # --- Phase 5: report-writer ---
    rw_task_id = str(uuid.uuid4())
    rw_id = str(uuid.uuid4())
    await emit(
        EventType.TOOL_USE_START,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": rw_task_id, "tool_name": "Task", "input": {"agent": "report-writer"}},
    )
    await emit(
        EventType.SUBAGENT_START,
        "report-writer",
        "writer",
        parent_tool_use_id=rw_task_id,
        data={"agent_name": "report-writer", "agent_role": "writer", "tool_use_id": rw_id},
    )
    await emit(
        EventType.THINKING,
        "report-writer",
        "writer",
        parent_tool_use_id=rw_id,
        data={"text": "Synthesizing all research notes and data analysis into a comprehensive brief."},
        delay=1.0,
    )

    report_content = """# Anthropic Competitive Position Analysis

## Executive Summary
Anthropic has established a strong position in the AI agent framework market through the Claude Agent SDK, with particular strength in developer adoption and enterprise readiness.

## Key Findings

### Developer Adoption
- Claude Agent SDK downloads grew 340% in Q1 2026
- Active GitHub contributors: 2,800+ (up from 900 in 2025)
- Stack Overflow questions tagged [claude-agent-sdk]: 12,400+

### Enterprise Readiness
- SOC 2 Type II certified
- HIPAA compliance available
- 67 Fortune 500 companies using Claude agents in production

### Competitive Landscape
| Framework | Market Share | Growth Rate | Enterprise Adoption |
|-----------|-------------|-------------|-------------------|
| Claude Agent SDK | 34% | +340% | High |
| OpenAI Assistants | 28% | +120% | High |
| LangGraph | 18% | +85% | Medium |
| CrewAI | 12% | +200% | Low |
| AutoGen | 8% | +45% | Medium |

## Recommendations
1. Anthropic leads in agent reliability and enterprise features
2. Developer experience is a key differentiator
3. Multi-agent orchestration capabilities are best-in-class"""

    await emit(
        EventType.AGENT_RESPONSE,
        "report-writer",
        "writer",
        parent_tool_use_id=rw_id,
        data={
            "text": "Research brief completed.",
            "artifacts": [{"name": "research-brief.md", "type": "markdown", "content": report_content}],
        },
    )
    await emit(
        EventType.SUBAGENT_END,
        "report-writer",
        "writer",
        parent_tool_use_id=rw_task_id,
        data={"agent_name": "report-writer", "status": "completed"},
    )
    await emit(
        EventType.TOOL_USE_END,
        "lead-analyst",
        "orchestrator",
        data={"tool_use_id": rw_task_id, "tool_name": "Task", "output": "Final report generated"},
    )

    # --- Done ---
    await emit(
        EventType.AGENT_RESPONSE,
        "lead-analyst",
        "orchestrator",
        data={"text": "Research complete. The brief covers Anthropic's competitive positioning with focus on developer adoption and enterprise readiness. Key finding: Anthropic leads with 34% market share and 340% growth in SDK adoption."},
    )
    await emit(
        EventType.DONE,
        "lead-analyst",
        "orchestrator",
        data={"exit_reason": "complete"},
    )

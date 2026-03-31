import asyncio

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.models.events import EventType, NormalizedEvent
from app.services.session import session_store

router = APIRouter()


@router.get("/api/stream/{session_id}")
async def stream_events(session_id: str, mock: bool | None = None):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Determine if mock mode: explicit param overrides config
    use_mock = mock if mock is not None else settings.mock_mode

    if use_mock and session.status == "created":
        from app.services.mock_stream import emit_mock_events

        async def push_event(event):
            await session.event_queue.put(event)

        asyncio.create_task(emit_mock_events(session, push_event))

    # If not mock and session was just created (no orchestrator started yet),
    # the orchestrator was already started in POST /api/sessions

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(session.event_queue.get(), timeout=300)
                yield {"data": event.model_dump_json()}
                if event.type == EventType.DONE:
                    break
            except asyncio.TimeoutError:
                timeout_event = NormalizedEvent(
                    type=EventType.DONE,
                    agent_name="system",
                    agent_role="system",
                    data={"exit_reason": "timeout"},
                )
                yield {"data": timeout_event.model_dump_json()}
                break

    return EventSourceResponse(event_generator())

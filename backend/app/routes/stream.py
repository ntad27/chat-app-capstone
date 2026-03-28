import asyncio

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.events import EventType
from app.services.session import session_store

router = APIRouter()


@router.get("/api/stream/{session_id}")
async def stream_events(session_id: str, mock: bool = False):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    if mock or session.status == "created":
        # In mock mode, start the mock event emitter
        if mock:
            from app.services.mock_stream import emit_mock_events

            async def push_event(event):
                await session.event_queue.put(event)

            asyncio.create_task(emit_mock_events(session, push_event))

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(session.event_queue.get(), timeout=300)
                yield {"data": event.model_dump_json()}
                if event.type == EventType.DONE:
                    break
            except asyncio.TimeoutError:
                # 5 minute timeout — emit done and close
                from app.models.events import NormalizedEvent

                timeout_event = NormalizedEvent(
                    type=EventType.DONE,
                    agent_name="system",
                    agent_role="system",
                    data={"exit_reason": "timeout"},
                )
                yield {"data": timeout_event.model_dump_json()}
                break

    return EventSourceResponse(event_generator())

import asyncio
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services.session import session_store

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

    if not settings.mock_mode:
        # Start real agent orchestration in background
        from app.agents.orchestrator import run_research_session

        async def push_event(event):
            await session.event_queue.put(event)

        asyncio.create_task(run_research_session(session, push_event))

    return CreateSessionResponse(session_id=session_id)


@router.post("/api/answer/{session_id}")
async def answer_question(session_id: str, req: AnswerRequest):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.pending_answer:
        raise HTTPException(400, "No pending question for this session")

    session_store.resolve_answer(session_id, req.answer)
    return {"status": "ok"}

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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
    session_store.create(session_id, req.query)
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

import asyncio
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Session:
    id: str
    query: str
    status: str = "created"  # created | running | paused | completed | failed
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    pending_answer: Optional[asyncio.Future] = None


class SessionStore:
    """In-memory session store. Sufficient for capstone scope."""

    def __init__(self):
        self._sessions: dict[str, Session] = {}

    def create(self, session_id: str, query: str) -> Session:
        session = Session(id=session_id, query=query)
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def set_pending_answer(self, session_id: str, future: asyncio.Future):
        session = self._sessions[session_id]
        session.pending_answer = future
        session.status = "paused"

    def resolve_answer(self, session_id: str, answer: str):
        session = self._sessions[session_id]
        if session.pending_answer and not session.pending_answer.done():
            session.pending_answer.set_result(answer)
            session.pending_answer = None
            session.status = "running"


session_store = SessionStore()

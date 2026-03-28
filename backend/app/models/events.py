import time
import uuid
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    SESSION_START = "session_start"
    THINKING = "thinking"
    TOOL_USE_START = "tool_use_start"
    TOOL_USE_END = "tool_use_end"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_END = "subagent_end"
    AGENT_RESPONSE = "agent_response"
    ASK_USER = "ask_user"
    ERROR = "error"
    DONE = "done"


class AgentStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class NormalizedEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventType
    timestamp: float = Field(default_factory=time.time)
    agent_name: str
    agent_role: str
    parent_tool_use_id: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)

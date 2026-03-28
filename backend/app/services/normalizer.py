from app.models.events import EventType, NormalizedEvent

EVENT_TYPE_MAP = {
    "session.start": EventType.SESSION_START,
    "thinking": EventType.THINKING,
    "tool_use.start": EventType.TOOL_USE_START,
    "tool_use.end": EventType.TOOL_USE_END,
    "subagent.start": EventType.SUBAGENT_START,
    "subagent.end": EventType.SUBAGENT_END,
    "response": EventType.AGENT_RESPONSE,
    "ask_user": EventType.ASK_USER,
    "error": EventType.ERROR,
    "done": EventType.DONE,
}


def normalize_sdk_event(raw_event: dict, agent_context: dict) -> NormalizedEvent:
    """Translate raw Claude Agent SDK event into NormalizedEvent."""
    raw_type = raw_event.get("type", "")
    event_type = EVENT_TYPE_MAP.get(raw_type, EventType.ERROR)

    return NormalizedEvent(
        type=event_type,
        agent_name=agent_context.get("agent_name", "unknown"),
        agent_role=agent_context.get("agent_role", "unknown"),
        parent_tool_use_id=agent_context.get("parent_tool_use_id"),
        data=extract_data(raw_event, event_type),
    )


def extract_data(raw_event: dict, event_type: EventType) -> dict:
    """Extract event-specific data payload."""
    raw_data = raw_event.get("data", {})

    match event_type:
        case EventType.THINKING:
            return {"text": raw_data.get("text", "")}
        case EventType.TOOL_USE_START:
            return {
                "tool_use_id": raw_data.get("id", ""),
                "tool_name": raw_data.get("name", ""),
                "input": raw_data.get("input", {}),
            }
        case EventType.TOOL_USE_END:
            return {
                "tool_use_id": raw_data.get("id", ""),
                "tool_name": raw_data.get("name", ""),
                "output": raw_data.get("output", ""),
                "error": raw_data.get("error"),
            }
        case EventType.ASK_USER:
            return {
                "question": raw_data.get("question", ""),
                "request_id": raw_data.get("request_id", ""),
            }
        case EventType.SUBAGENT_START:
            return {
                "agent_name": raw_data.get("agent_name", ""),
                "agent_role": raw_data.get("agent_role", ""),
                "tool_use_id": raw_data.get("tool_use_id", ""),
            }
        case EventType.SUBAGENT_END:
            return {
                "agent_name": raw_data.get("agent_name", ""),
                "status": raw_data.get("status", "completed"),
            }
        case EventType.AGENT_RESPONSE:
            return {
                "text": raw_data.get("text", ""),
                "artifacts": raw_data.get("artifacts", []),
            }
        case EventType.ERROR:
            return {
                "message": raw_data.get("message", "Unknown error"),
                "agent_name": raw_data.get("agent_name", "unknown"),
                "recoverable": raw_data.get("recoverable", False),
            }
        case EventType.DONE:
            return {"exit_reason": raw_data.get("exit_reason", "complete")}
        case _:
            return raw_data

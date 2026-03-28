from app.models.events import EventType
from app.services.normalizer import normalize_sdk_event


class TestNormalizeSdkEvent:
    def test_maps_thinking_event(self):
        raw = {"type": "thinking", "data": {"text": "Analyzing..."}}
        ctx = {"agent_name": "lead-analyst", "agent_role": "orchestrator"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.THINKING
        assert event.agent_name == "lead-analyst"
        assert event.data["text"] == "Analyzing..."

    def test_maps_tool_use_start(self):
        raw = {"type": "tool_use.start", "data": {"id": "t1", "name": "WebSearch", "input": {"q": "test"}}}
        ctx = {"agent_name": "web-researcher", "agent_role": "researcher"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.TOOL_USE_START
        assert event.data["tool_use_id"] == "t1"
        assert event.data["tool_name"] == "WebSearch"

    def test_maps_ask_user(self):
        raw = {"type": "ask_user", "data": {"question": "What angle?", "request_id": "r1"}}
        ctx = {"agent_name": "lead-analyst", "agent_role": "orchestrator"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.ASK_USER
        assert event.data["question"] == "What angle?"

    def test_preserves_parent_tool_use_id(self):
        raw = {"type": "thinking", "data": {"text": "..."}}
        ctx = {"agent_name": "researcher", "agent_role": "researcher", "parent_tool_use_id": "task-1"}
        event = normalize_sdk_event(raw, ctx)
        assert event.parent_tool_use_id == "task-1"

    def test_unknown_event_type_maps_to_error(self):
        raw = {"type": "unknown_event", "data": {}}
        ctx = {"agent_name": "test", "agent_role": "test"}
        event = normalize_sdk_event(raw, ctx)
        assert event.type == EventType.ERROR

    def test_maps_all_ten_event_types(self):
        type_map = {
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
        ctx = {"agent_name": "test", "agent_role": "test"}
        for raw_type, expected in type_map.items():
            event = normalize_sdk_event({"type": raw_type, "data": {}}, ctx)
            assert event.type == expected, f"Failed for {raw_type}"

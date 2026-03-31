# Anthropic Python SDK Integration Research
## Streaming, Tool Use, and Multi-Turn Conversations

**Date:** 2026-03-31
**Focus:** anthropic package v0.42+
**Authority:** [Streaming Messages API Docs](https://platform.claude.com/docs/en/api/messages-streaming), GitHub anthropics/anthropic-sdk-python

---

## 1. Streaming API Calls — Two Methods

### Method A: `client.messages.stream()` — Context Manager (Recommended)

```python
import anthropic

client = anthropic.Anthropic(api_key="sk-...")

# Context manager handles connection lifecycle
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

**Advantages:**
- Automatic resource cleanup (context manager `__exit__`)
- Simplest API for text-only responses
- Built-in `.get_final_message()` to accumulate entire response if needed

### Method B: `client.messages.create(stream=True)` — Raw Iterator

```python
# Alternative: raw streaming without context manager
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
    stream=True  # Enable streaming
)

# Iterate over raw events
for event in response:
    print(f"Event: {event.type}")
```

**When to use:**
- Fine-grained event handling (tool use, thinking blocks)
- Integration with async/await patterns
- Custom event processing pipelines

**Key Difference:** `.stream()` is a context manager that wraps `.create(stream=True)` and adds helper methods.

---

## 2. Streaming Event Types — Complete Event Flow

All streaming responses follow this sequence:

### Event Sequence (Guaranteed Order)

1. **`message_start`** — Initial message object with empty content array
2. **Content blocks** (repeats per content block)
   - `content_block_start` — Block begins (type: text, tool_use, thinking, etc.)
   - `content_block_delta` (1+ events) — Incremental updates
   - `content_block_stop` — Block complete
3. **`message_delta`** — Top-level metadata updates (stop_reason, usage)
4. **`message_stop`** — Stream end

### Optional/Interleaved Events

- **`ping`** — Keep-alive event (safe to ignore)
- **`error`** — Error during stream (e.g., overloaded_error, rate limit)

### Event Type Details

#### message_start
```python
{
    "type": "message_start",
    "message": {
        "id": "msg_...",
        "type": "message",
        "role": "assistant",
        "content": [],  # Empty initially
        "model": "claude-opus-4-6",
        "stop_reason": None,
        "usage": {"input_tokens": 10, "output_tokens": 0}
    }
}
```

#### content_block_start
```python
{
    "type": "content_block_start",
    "index": 0,  # Position in final content array
    "content_block": {
        "type": "text",  # or "tool_use", "thinking"
        "text": "",  # Empty for text
        "id": "toolu_..." if tool_use
    }
}
```

#### content_block_delta
Three delta types exist:

**1. Text delta** (type="text_delta")
```python
{
    "type": "content_block_delta",
    "index": 0,
    "delta": {
        "type": "text_delta",
        "text": "This is "  # Incremental text chunk
    }
}
```

**2. Input JSON delta** (type="input_json_delta") — For tool_use
```python
{
    "type": "content_block_delta",
    "index": 1,
    "delta": {
        "type": "input_json_delta",
        "partial_json": "{\"location\": \"San Fra"  # Partial JSON string
    }
}
```
⚠️ **Critical:** Accumulate partial JSON strings; parse complete JSON only at `content_block_stop`.

**3. Thinking delta** (type="thinking_delta") — Extended thinking only
```python
{
    "type": "content_block_delta",
    "index": 0,
    "delta": {
        "type": "thinking_delta",
        "thinking": "Working on the problem..."
    }
}
```

#### content_block_stop
```python
{
    "type": "content_block_stop",
    "index": 0
}
```

#### message_delta
```python
{
    "type": "message_delta",
    "delta": {
        "stop_reason": "tool_use",  # or "end_turn", "max_tokens"
        "stop_sequence": None
    },
    "usage": {
        "output_tokens": 42  # Cumulative output tokens
    }
}
```

#### message_stop
```python
{
    "type": "message_stop"
}
```

---

## 3. Handling Tool Use in Streaming — Complete Flow

### Step 1: Define Tools in Request

```python
tools = [
    {
        "name": "get_weather",
        "description": "Get weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature unit"
                }
            },
            "required": ["location"]
        }
    }
]

with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What's the weather in Paris?"}],
    tools=tools  # Enable tool use
) as stream:
    # Process events (see Step 2)
    pass
```

### Step 2: Collect Tool Use Events During Streaming

```python
from anthropic.types import ContentBlockDeltaEvent, MessageStartEvent, ContentBlockStopEvent
import json

tool_use_blocks = {}  # Track accumulating tool inputs

with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What's the weather in Paris?"}],
    tools=tools
) as stream:
    for event in stream:
        if hasattr(event, 'type'):
            if event.type == "content_block_start":
                if event.content_block.type == "tool_use":
                    tool_use_blocks[event.index] = {
                        "id": event.content_block.id,
                        "name": event.content_block.name,
                        "input_parts": []
                    }

            elif event.type == "content_block_delta":
                if event.delta.type == "input_json_delta":
                    # Accumulate partial JSON strings
                    idx = event.index
                    tool_use_blocks[idx]["input_parts"].append(
                        event.delta.partial_json
                    )

            elif event.type == "content_block_stop":
                if event.index in tool_use_blocks:
                    # Parse complete JSON
                    json_str = "".join(
                        tool_use_blocks[event.index]["input_parts"]
                    )
                    tool_use_blocks[event.index]["input"] = json.loads(json_str)
                    del tool_use_blocks[event.index]["input_parts"]

            elif event.type == "message_delta":
                # Check stop_reason
                if event.delta.stop_reason == "tool_use":
                    print("Model wants to call a tool")
```

### Step 3: Implement Tool Functions

```python
def get_weather(location: str, unit: str = "celsius") -> str:
    """Simulate weather API call."""
    weather_data = {
        ("Paris", "celsius"): "Sunny, 18°C",
        ("Paris", "fahrenheit"): "Sunny, 64°F",
        ("New York", "celsius"): "Cloudy, 10°C",
        ("New York", "fahrenheit"): "Cloudy, 50°F",
    }
    return weather_data.get((location, unit), "Weather unavailable")

# Map tool names to functions
tools_map = {
    "get_weather": get_weather
}
```

### Step 4: Execute Tools and Send Results

```python
# After streaming completes, execute tools
tool_results = []
for idx, tool_block in tool_use_blocks.items():
    name = tool_block["name"]
    input_args = tool_block["input"]

    # Execute the tool
    if name in tools_map:
        result = tools_map[name](**input_args)
    else:
        result = f"Unknown tool: {name}"

    tool_results.append({
        "type": "tool_result",
        "tool_use_id": tool_block["id"],
        "content": result
    })

# Continue conversation with tool results
messages = [
    {"role": "user", "content": "What's the weather in Paris?"},
    {"role": "assistant", "content": [...]},  # From stream
    {
        "role": "user",
        "content": tool_results  # Supply tool results
    }
]
```

### Full Tool Use Example

```python
def run_tool_loop(user_query: str, max_iterations: int = 5) -> str:
    """Run agentic loop until model stops calling tools."""
    messages = [{"role": "user", "content": user_query}]

    for iteration in range(max_iterations):
        print(f"\n--- Iteration {iteration + 1} ---")

        # Call Claude
        with client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=messages,
            tools=tools
        ) as stream:
            assistant_content = []
            tool_calls = {}

            for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "tool_use":
                        tool_calls[event.index] = {
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "input_parts": []
                        }
                        assistant_content.append({
                            "type": "tool_use",
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "input": {}
                        })
                    else:
                        assistant_content.append({
                            "type": event.content_block.type,
                            "text": ""
                        })

                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        assistant_content[-1]["text"] += event.delta.text
                    elif event.delta.type == "input_json_delta":
                        tool_calls[event.index]["input_parts"].append(
                            event.delta.partial_json
                        )

                elif event.type == "content_block_stop":
                    if event.index in tool_calls:
                        json_str = "".join(
                            tool_calls[event.index]["input_parts"]
                        )
                        # Find the tool_use block and update it
                        for block in assistant_content:
                            if (block.get("type") == "tool_use" and
                                block["id"] == tool_calls[event.index]["id"]):
                                block["input"] = json.loads(json_str)

                elif event.type == "message_delta":
                    stop_reason = event.delta.stop_reason

        # Add assistant response
        messages.append({"role": "assistant", "content": assistant_content})

        # Check if we need to execute tools
        if stop_reason == "tool_use":
            # Execute tools
            tool_results = []
            for block in assistant_content:
                if block["type"] == "tool_use":
                    name = block["name"]
                    result = tools_map[name](**block["input"])
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block["id"],
                        "content": result
                    })

            # Add tool results
            messages.append({"role": "user", "content": tool_results})
        else:
            # Model finished, return final text
            for block in assistant_content:
                if block["type"] == "text":
                    return block["text"]

    return "Max iterations reached"

# Usage
result = run_tool_loop("What's the weather in Paris and New York?")
print(result)
```

---

## 4. Multi-Turn Conversations

### Basic Multi-Turn

```python
messages = [
    {"role": "user", "content": "What is 10 + 5?"},
]

# First turn
response1 = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=100,
    messages=messages
)

# Add assistant response
messages.append({
    "role": "assistant",
    "content": response1.content[0].text
})

# Second turn
messages.append({"role": "user", "content": "What is that times 2?"})

response2 = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=100,
    messages=messages
)

print(response2.content[0].text)
```

### Multi-Turn with Streaming

```python
messages = [
    {"role": "user", "content": "Tell me a short story"},
]

while True:
    print("Assistant: ", end="")

    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=200,
        messages=messages
    ) as stream:
        response_text = ""
        for text in stream.text_stream:
            print(text, end="", flush=True)
            response_text += text

    print()  # Newline

    # Add assistant response
    messages.append({
        "role": "assistant",
        "content": response_text
    })

    # Get user input
    user_input = input("You: ").strip()
    if not user_input or user_input.lower() == "exit":
        break

    # Add user message
    messages.append({"role": "user", "content": user_input})
```

### Multi-Turn with Tool Results

Already covered in Section 3, Step 4. Key point:

```python
messages = [
    {"role": "user", "content": "Get weather for Paris"},
    {
        "role": "assistant",
        "content": [
            {
                "type": "tool_use",
                "id": "toolu_123",
                "name": "get_weather",
                "input": {"location": "Paris", "unit": "celsius"}
            }
        ]
    },
    {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": "toolu_123",
                "content": "Sunny, 18°C"
            }
        ]
    }
]

# Continue conversation
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=200,
    messages=messages
)
```

**Pattern:** User → Assistant (tool_use) → User (tool_result) → Assistant (response)

---

## 5. Ask-User Pattern (Agent Pauses, Waits for Input, Resumes)

The "ask_user" pattern allows an agent to pause, request user input, then resume based on that input.

### Implementation Pattern

```python
def run_agent_with_pauses(initial_query: str) -> str:
    """Agent that can ask user for input and resume."""
    messages = [{"role": "user", "content": initial_query}]

    while True:
        # Call Claude
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=500,
            messages=messages,
            tools=[
                {
                    "name": "ask_user",
                    "description": "Ask the user a question",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "Question to ask the user"
                            }
                        },
                        "required": ["question"]
                    }
                },
                {
                    "name": "finish",
                    "description": "Finish and return final answer",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "answer": {
                                "type": "string",
                                "description": "Final answer"
                            }
                        },
                        "required": ["answer"]
                    }
                }
            ]
        )

        # Check if model called a tool
        if response.stop_reason == "tool_use":
            for block in response.content:
                if block.type == "tool_use":
                    if block.name == "ask_user":
                        # Pause and ask user
                        question = block.input["question"]
                        print(f"Agent asks: {question}")
                        user_answer = input("Your answer: ").strip()

                        # Add to conversation
                        messages.append({
                            "role": "assistant",
                            "content": response.content
                        })
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": user_answer
                                }
                            ]
                        })
                        break  # Continue loop

                    elif block.name == "finish":
                        # Return final answer
                        return block.input["answer"]
        else:
            # No tool use, return text response
            for block in response.content:
                if block.type == "text":
                    return block.text

# Usage
result = run_agent_with_pauses(
    "Help me debug a Python error. I have a SyntaxError."
)
print(f"Final result: {result}")
```

### With Streaming

```python
def run_agent_streaming_with_pauses(initial_query: str) -> str:
    """Streaming agent with user pause capability."""
    messages = [{"role": "user", "content": initial_query}]

    while True:
        with client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=500,
            messages=messages,
            tools=[
                {
                    "name": "ask_user",
                    "description": "Ask the user a question",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"}
                        },
                        "required": ["question"]
                    }
                },
                {
                    "name": "finish",
                    "description": "Return final answer",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "answer": {"type": "string"}
                        },
                        "required": ["answer"]
                    }
                }
            ]
        ) as stream:
            assistant_content = []
            stop_reason = None

            for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "text":
                        print("Agent: ", end="")
                        assistant_content.append({
                            "type": "text",
                            "text": ""
                        })
                    elif event.content_block.type == "tool_use":
                        assistant_content.append({
                            "type": "tool_use",
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "input": {}
                        })

                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        print(event.delta.text, end="", flush=True)
                        assistant_content[-1]["text"] += event.delta.text
                    elif event.delta.type == "input_json_delta":
                        # Accumulate tool input
                        pass  # (simplified for brevity)

                elif event.type == "message_delta":
                    stop_reason = event.delta.stop_reason

        if stop_reason == "tool_use":
            # Check which tool was called
            for block in assistant_content:
                if block["type"] == "tool_use":
                    if block["name"] == "ask_user":
                        print()  # Newline
                        answer = input(f"Question: {block['input'].get('question', '')}\nYour answer: ")

                        messages.append({
                            "role": "assistant",
                            "content": assistant_content
                        })
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block["id"],
                                    "content": answer
                                }
                            ]
                        })
                        break

                    elif block["name"] == "finish":
                        return block["input"]["answer"]
        else:
            # Model finished
            for block in assistant_content:
                if block["type"] == "text":
                    return block["text"]

result = run_agent_streaming_with_pauses("Help me plan a trip")
print(f"\nFinal: {result}")
```

---

## Key Implementation Notes

### Partial JSON Parsing (Tool Use)

When accumulating tool inputs from `input_json_delta` events, the deltas are **partial JSON strings**, not complete objects. Use:

1. **String concatenation** (simple): Join all `partial_json` strings until `content_block_stop`
2. **Pydantic partial JSON parsing** (robust):
   ```python
   from pydantic import TypeAdapter

   # Accumulate partial JSON
   partial_input = "".join(partial_json_strings)

   # Parse robustly
   adapter = TypeAdapter(dict)
   tool_input = adapter.validate_python(partial_input)
   ```
3. **SDK Helpers** (if available): Some SDK versions provide automatic parsing helpers

### Usage Token Tracking

Token counts in `message_delta.usage.output_tokens` are **cumulative**, not deltas:

```python
# Correct: accumulate final token count from last message_delta
total_output_tokens = None
for event in stream:
    if event.type == "message_delta":
        total_output_tokens = event.usage.output_tokens  # Use this directly
```

### Error Handling in Streams

The API may send error events mid-stream (e.g., `overloaded_error`):

```python
try:
    with client.messages.stream(...) as stream:
        for event in stream:
            if event.type == "error":
                print(f"Stream error: {event.error.type}")
                raise RuntimeError(event.error.message)
except Exception as e:
    print(f"Stream failed: {e}")
```

### Connection Timeout for Large Responses

Use streaming for responses expected to exceed ~5 minutes of generation. Non-streaming requests may timeout. Use:
- `client.messages.stream()` with `.get_final_message()` for large `max_tokens`
- Always prefer streaming for production agents

---

## Summary

| Feature | Method | Code Pattern |
|---------|--------|--------------|
| Simple text streaming | `with client.messages.stream() as stream` | `for text in stream.text_stream` |
| Raw events | `stream.create(stream=True)` | `for event in response` |
| Tool use | Accumulate `input_json_delta` → parse at `content_block_stop` | See Section 3 |
| Multi-turn | Append messages with roles (user/assistant) | See Section 4 |
| Ask-user pause | Define `ask_user` tool, pause loop on tool_use | See Section 5 |

---

## Sources

- [Streaming Messages API Docs](https://platform.claude.com/docs/en/api/messages-streaming)
- [Anthropic Python SDK GitHub](https://github.com/anthropics/anthropic-sdk-python)
- [Build Basic AI Agent Guide](https://platform.claude.com/docs/en/docs/build-a-basic-ai-agent)
- [Python SDK Documentation](https://platform.claude.com/docs/en/api/sdks/python)

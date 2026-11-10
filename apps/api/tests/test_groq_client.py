from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest

from app.groq import (
    DEFAULT_GROQ_MODEL,
    GroqClient,
    GroqError,
    GroqQuotaError,
    ResilientLlmClient,
    _tool_calls_from_response,
)
from app.tools import LlmReply, ToolCall, ToolSpec


def test_tool_calls_from_response_extracts_function_and_arguments():
    raw = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "call_123",
                            "type": "function",
                            "function": {
                                "name": "get_weather",
                                "arguments": '{"location": "Tokyo"}',
                            },
                        }
                    ]
                }
            }
        ]
    }
    calls = _tool_calls_from_response(raw)
    assert len(calls) == 1
    assert calls[0].name == "get_weather"
    assert calls[0].arguments == {"location": "Tokyo"}


def test_tool_calls_from_response_handles_empty_or_malformed():
    assert _tool_calls_from_response({}) == []
    assert _tool_calls_from_response({"choices": []}) == []
    assert _tool_calls_from_response({"choices": [{"message": {}}]}) == []
    assert (
        _tool_calls_from_response(
            {"choices": [{"message": {"tool_calls": [{"function": "not a dict"}]}}]}
        )
        == []
    )


def test_groq_client_choose_success():
    spec = ToolSpec(
        name="open_app",
        description="Launch an app",
        parameters={
            "type": "object",
            "properties": {"app": {"type": "string"}},
            "required": ["app"],
        },
        risk="low",
        requires_confirmation=False,
    )

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json={
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_abc",
                                "type": "function",
                                "function": {
                                    "name": "open_app",
                                    "arguments": '{"app": "notepad"}',
                                },
                            }
                        ]
                    }
                }
            ]
        },
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    mock_client.post.return_value = mock_response

    client = GroqClient(api_key="gsk_test", client=mock_client)
    reply = asyncio.run(client.choose("open notepad", [spec]))

    assert len(reply.calls) == 1
    assert reply.calls[0] == ToolCall("open_app", {"app": "notepad"})
    mock_client.post.assert_awaited_once()


def test_groq_client_returns_content_when_no_tool_calls():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "Which page?"}}]},
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    mock_client.post.return_value = mock_response

    client = GroqClient(api_key="gsk_test", client=mock_client)
    reply = asyncio.run(client.choose("open the page", []))

    assert reply.calls == []
    assert reply.content == "Which page?"


def test_groq_client_choose_quota_error():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        429,
        json={"error": {"message": "Rate limit exceeded"}},
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    mock_client.post.return_value = mock_response

    client = GroqClient(api_key="gsk_test", client=mock_client)
    with pytest.raises(GroqQuotaError):
        asyncio.run(client.choose("open notepad", []))


def test_groq_client_choose_server_error():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        500,
        text="Internal Server Error",
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )
    mock_client.post.return_value = mock_response

    client = GroqClient(api_key="gsk_test", client=mock_client)
    with pytest.raises(GroqError) as exc_info:
        asyncio.run(client.choose("open notepad", []))
    assert "HTTP 500" in str(exc_info.value)


def test_groq_client_retries_without_tool_on_schema_error():
    bad = ToolSpec(
        name="notion_api_patch_block_children",
        description="Append blocks.",
        parameters={"type": "object", "properties": {}, "required": []},
        risk="write",
        requires_confirmation=True,
    )
    good = ToolSpec(
        name="open_app",
        description="Launch an app",
        parameters={
            "type": "object",
            "properties": {"app": {"type": "string"}},
            "required": ["app"],
        },
        risk="read",
        requires_confirmation=False,
    )
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.side_effect = [
        httpx.Response(
            400,
            json={
                "error": {
                    "message": (
                        "invalid JSON schema for tool "
                        "notion_api_patch_block_children, tools[68]."
                        "function.parameters: ref not found"
                    )
                }
            },
            request=httpx.Request("POST", "https://api.groq.com/chat/completions"),
        ),
        httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": "open_app",
                                        "arguments": '{"app": "notepad"}',
                                    },
                                }
                            ]
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://api.groq.com/chat/completions"),
        ),
    ]

    client = GroqClient(api_key="gsk_test", client=mock_client)
    reply = asyncio.run(client.choose("open notepad", [bad, good]))

    assert reply.calls == [ToolCall("open_app", {"app": "notepad"})]
    assert mock_client.post.await_count == 2
    body = mock_client.post.call_args_list[1].kwargs["json"]
    sent = [tool["function"]["name"] for tool in body["tools"]]
    assert "notion_api_patch_block_children" not in sent
    assert "open_app" in sent


def test_groq_client_does_not_retry_an_unrelated_400():
    spec = ToolSpec(
        name="open_app",
        description="Launch an app",
        parameters={"type": "object", "properties": {}, "required": []},
        risk="read",
        requires_confirmation=False,
    )
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = httpx.Response(
        400,
        json={"error": {"message": "bad request, nothing to do with tools"}},
        request=httpx.Request("POST", "https://api.groq.com/chat/completions"),
    )

    client = GroqClient(api_key="gsk_test", client=mock_client)
    with pytest.raises(GroqError):
        asyncio.run(client.choose("open notepad", [spec]))

    assert mock_client.post.await_count == 1


def test_resilient_llm_client_falls_back_on_quota_error():
    c1 = GroqClient(api_key="gsk_1", model="openai/gpt-oss-20b")
    c2 = GroqClient(api_key="gsk_2", model="openai/gpt-oss-120b")

    c1.choose = AsyncMock(side_effect=GroqQuotaError("Quota exhausted", status=429))
    c2.choose = AsyncMock(
        return_value=LlmReply(calls=[ToolCall("open_app", {"app": "calc"})])
    )

    resilient = ResilientLlmClient([c1, c2])
    reply = asyncio.run(resilient.choose("open calc", []))

    assert reply.calls == [ToolCall("open_app", {"app": "calc"})]
    c1.choose.assert_awaited_once()
    c2.choose.assert_awaited_once()


def test_resilient_llm_client_fails_if_all_models_fail():
    c1 = GroqClient(api_key="gsk_1", model="openai/gpt-oss-20b")
    c1.choose = AsyncMock(side_effect=GroqError("Network down"))

    resilient = ResilientLlmClient([c1], attempts=1)
    with pytest.raises(GroqError) as exc_info:
        asyncio.run(resilient.choose("open calc", []))
    assert "All Groq models failed" in str(exc_info.value)

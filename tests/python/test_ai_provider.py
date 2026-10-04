import json

import httpx
import pytest

from ai_provider import DeepSeekProvider, ProviderFailure
from ai_schema import parse_action


def test_provider_uses_json_mode_model_and_server_key(monkeypatch):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"id": "res-1", "choices": [{"finish_reason": "stop", "message": {
            "content": json.dumps({"schemaVersion": 1, "action": "query", "answer": "Unknown", "references": []})}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8}})

    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-v4-pro")
    provider = DeepSeekProvider("synthetic-secret", httpx.MockTransport(respond))
    reply = provider.complete([{"role": "system", "content": "Return JSON"}], "req-12345678")
    assert parse_action(reply.content).action == "query"
    assert reply.prompt_tokens == 12 and reply.completion_tokens == 8
    assert requests[0].url.host == "api.deepseek.com"
    assert requests[0].headers["authorization"] == "Bearer synthetic-secret"
    body = json.loads(requests[0].content)
    assert body["model"] == "deepseek-v4-pro"
    assert body["response_format"] == {"type": "json_object"}
    assert body["stream"] is False


def test_timeout_is_not_retried():
    calls = []

    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout("timeout")

    provider = DeepSeekProvider("synthetic-secret", httpx.MockTransport(timeout), sleep=lambda _: None)
    with pytest.raises(ProviderFailure) as error:
        provider.complete([{"role": "user", "content": "hi"}], "req-12345678")
    assert error.value.code == "timeout" and len(calls) == 1


def test_rate_limit_retries_are_bounded(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_MAX_RETRIES", "2")
    calls = []

    def rate_limit(request):
        calls.append(request)
        return httpx.Response(429)

    provider = DeepSeekProvider("synthetic-secret", httpx.MockTransport(rate_limit), sleep=lambda _: None)
    with pytest.raises(ProviderFailure) as error:
        provider.complete([{"role": "user", "content": "hi"}], "req-12345678")
    assert error.value.code == "rate_limit" and len(calls) == 3


@pytest.mark.parametrize("response", [
    {"choices": []},
    {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]},
    {"choices": [{"finish_reason": "stop", "message": {"content": ""}}]},
])
def test_incomplete_or_empty_response_fails(response):
    provider = DeepSeekProvider("synthetic-secret", httpx.MockTransport(lambda _: httpx.Response(200, json=response)))
    with pytest.raises(ProviderFailure):
        provider.complete([{"role": "user", "content": "hi"}], "req-12345678")


@pytest.mark.parametrize("value", [
    '{"schemaVersion":1,"action":"execute","code":"x"}',
    '{"schemaVersion":1,"action":"query","answer":"hi","extraOperation":"delete"}',
    '{"schemaVersion":1,"action":"modify","entityType":"friend","entityId":"target123","expectedRevision":0,"scope":"content","oldText":"a","newText":"b","changeType":"correction"}',
])
def test_schema_rejects_unsupported_extra_and_bad_revision(value):
    with pytest.raises(Exception):
        parse_action(value)

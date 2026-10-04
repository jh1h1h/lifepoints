"""Replaceable DeepSeek Chat Completions client; no retries after uncertain timeouts."""

import os
import time
from dataclasses import dataclass
from typing import Protocol

import httpx


class ProviderFailure(Exception):
    def __init__(self, code: str, message: str, raw_response: str | None = None):
        super().__init__(message)
        self.code = code
        self.raw_response = raw_response


@dataclass(frozen=True)
class ModelReply:
    content: str
    response_id: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


class ModelProvider(Protocol):
    def complete(self, messages: list[dict[str, str]], request_id: str) -> ModelReply: ...


def bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise ProviderFailure("configuration", f"Invalid {name} configuration") from exc
    if not minimum <= value <= maximum:
        raise ProviderFailure("configuration", f"Invalid {name} configuration")
    return value


class DeepSeekProvider:
    def __init__(self, api_key: str, transport: httpx.BaseTransport | None = None, sleep=time.sleep):
        if not api_key:
            raise ProviderFailure("configuration", "DeepSeek API key is not configured")
        self._api_key = api_key
        self.model = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")
        self.timeout = bounded_int("DEEPSEEK_TIMEOUT_SECONDS", 45, 5, 180)
        self.max_tokens = bounded_int("DEEPSEEK_MAX_OUTPUT_TOKENS", 1400, 100, 4000)
        self.max_retries = bounded_int("DEEPSEEK_MAX_RETRIES", 2, 0, 3)
        self._transport = transport
        self._sleep = sleep

    def complete(self, messages: list[dict[str, str]], request_id: str) -> ModelReply:
        body = {"model": self.model, "messages": messages,
                "response_format": {"type": "json_object"}, "max_tokens": self.max_tokens,
                "thinking": {"type": "disabled"}, "stream": False}
        started = time.monotonic()
        base_url = (os.environ.get("DEEPSEEK_API_BASE_URL", "https://api.deepseek.com")
                    if os.environ.get("FIRESTORE_EMULATOR_HOST") else "https://api.deepseek.com")
        with httpx.Client(base_url=base_url, timeout=self.timeout,
                          transport=self._transport) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = client.post("/chat/completions", json=body,
                                           headers={"Authorization": f"Bearer {self._api_key}",
                                                    "X-Client-Request-Id": request_id})
                except httpx.TimeoutException as exc:
                    raise ProviderFailure("timeout", "DeepSeek timed out; check this request ID before sending a new one") from exc
                except httpx.ConnectError as exc:
                    if attempt < self.max_retries:
                        self._sleep(min(0.4 * 2**attempt, 2))
                        continue
                    raise ProviderFailure("unavailable", "DeepSeek is unreachable") from exc
                except httpx.TransportError as exc:
                    raise ProviderFailure("unavailable", "DeepSeek connection failed; request was not resent") from exc
                if response.status_code in {429, 500, 502, 503, 504} and attempt < self.max_retries:
                    self._sleep(min(0.4 * 2**attempt, 2))
                    continue
                if response.status_code == 429:
                    raise ProviderFailure("rate_limit", "DeepSeek is rate-limiting requests; try again later", response.text[:20000])
                if response.status_code >= 400:
                    raise ProviderFailure("upstream", f"DeepSeek returned HTTP {response.status_code}", response.text[:20000])
                try:
                    payload = response.json()
                    choice = payload["choices"][0]
                    if choice["finish_reason"] != "stop":
                        raise ProviderFailure("incomplete", "DeepSeek did not finish its JSON response", response.text[:20000])
                    content = choice["message"]["content"]
                    if not isinstance(content, str) or not content.strip():
                        raise ProviderFailure("empty", "DeepSeek returned an empty response", response.text[:20000])
                    usage = payload.get("usage") or {}
                    return ModelReply(content, str(payload.get("id", "")),
                                      int(usage.get("prompt_tokens", 0)),
                                      int(usage.get("completion_tokens", 0)),
                                      round((time.monotonic() - started) * 1000))
                except (ValueError, KeyError, IndexError, TypeError) as exc:
                    raise ProviderFailure("malformed", "DeepSeek returned an invalid response envelope", response.text[:20000]) from exc
        raise ProviderFailure("unavailable", "DeepSeek is unavailable")

"""Provider execution seam.

The default implementations intentionally do not perform network calls. A
transport callable is injected by the application or a test, keeping domain
evaluation deterministic and preventing accidental provider requests.
"""

from dataclasses import dataclass
import time
from typing import Any, Callable, Literal, Protocol


@dataclass(frozen=True)
class ProviderRequest:
    provider: str
    model: str
    prompt: str
    temperature: float = 0.0
    max_tokens: int | None = None


@dataclass(frozen=True)
class ProviderResponse:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    raw: Any = None


@dataclass(frozen=True)
class ProviderError:
    category: Literal["authentication", "rate_limit", "timeout", "server", "invalid_request", "unknown"]
    message: str
    retryable: bool
    status_code: int | None = None


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    backoff_seconds: float = 0.25
    max_backoff_seconds: float = 8.0

    def __post_init__(self) -> None:
        if self.max_attempts < 1 or self.backoff_seconds < 0:
            raise ValueError("invalid retry policy")


Transport = Callable[[ProviderRequest], ProviderResponse]


def classify_provider_error(error: BaseException) -> ProviderError:
    status = getattr(error, "status_code", None) or getattr(error, "status", None)
    try:
        status = int(status) if status is not None else None
    except (TypeError, ValueError):
        status = None
    message = str(error)
    lower = message.casefold()
    if status in (401, 403) or "api key" in lower or "unauthorized" in lower:
        return ProviderError("authentication", message, False, status)
    if status == 429 or "rate limit" in lower or "too many requests" in lower:
        return ProviderError("rate_limit", message, True, status)
    if isinstance(error, (TimeoutError, ConnectionError)) or "timeout" in lower:
        return ProviderError("timeout", message, True, status)
    if status is not None and status >= 500:
        return ProviderError("server", message, True, status)
    if status is not None and 400 <= status < 500:
        return ProviderError("invalid_request", message, False, status)
    return ProviderError("unknown", message, False, status)


class ProviderExecutor:
    def __init__(self, transport: Transport | None = None, retry_policy: RetryPolicy | None = None, sleeper: Callable[[float], None] = time.sleep) -> None:
        self.transport = transport
        self.retry_policy = retry_policy or RetryPolicy()
        self.sleeper = sleeper

    def execute(self, request: ProviderRequest) -> ProviderResponse:
        if self.transport is None:
            raise RuntimeError("provider transport is not configured; inject one before execution")
        last_error: ProviderError | None = None
        for attempt in range(self.retry_policy.max_attempts):
            try:
                result = self.transport(request)
                if not isinstance(result, ProviderResponse):
                    raise TypeError("provider transport must return ProviderResponse")
                return result
            except BaseException as exc:
                last_error = classify_provider_error(exc)
                if not last_error.retryable or attempt + 1 >= self.retry_policy.max_attempts:
                    raise RuntimeError(f"{last_error.category}: {last_error.message}") from exc
                delay = min(self.retry_policy.backoff_seconds * (2**attempt), self.retry_policy.max_backoff_seconds)
                if delay:
                    self.sleeper(delay)
        raise RuntimeError(last_error.message if last_error else "provider execution failed")


class OpenAIExecutor(ProviderExecutor):
    def __init__(self, transport: Transport | None = None, **kwargs: Any) -> None:
        super().__init__(transport, **kwargs)


class AnthropicExecutor(ProviderExecutor):
    def __init__(self, transport: Transport | None = None, **kwargs: Any) -> None:
        super().__init__(transport, **kwargs)


class GoogleExecutor(ProviderExecutor):
    def __init__(self, transport: Transport | None = None, **kwargs: Any) -> None:
        super().__init__(transport, **kwargs)

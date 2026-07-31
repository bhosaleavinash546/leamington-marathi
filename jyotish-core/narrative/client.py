"""LLM transport, behind a Protocol.

CLAUDE.md 6: "The LLM call is a pure function: ``ChartFacts + section + locale ->
prose``." Purity is only achievable if the transport is injectable, so the service
depends on :class:`LLMClient` and never on a concrete SDK.

Three implementations ship:

* :class:`AnthropicClient` - the real Messages API call.
* :class:`ScriptedClient` - returns canned text. Used by every test, so the whole
  narrative layer including the validator is testable with no key and no network.
* :class:`RefusingClient` - always returns the locale refusal string, for a
  deployment that wants the pipeline live with generation disabled.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Final, Protocol, runtime_checkable

#: Default model for narrative generation. Recorded in the response so a model
#: change is visible in output, and included in nothing else - the model has no
#: bearing on any computed value (CLAUDE.md N1).
DEFAULT_MODEL: Final[str] = "claude-sonnet-4-5"

#: Prose sections are short (CLAUDE.md 6 asks for two to five paragraphs), so a
#: tight cap is both cheaper and a guard against a runaway generation.
DEFAULT_MAX_TOKENS: Final[int] = 1200

#: Low but not zero. Deterministic output would be preferable, but the API does
#: not guarantee it even at 0, which is exactly why identical charts are served
#: from the cache rather than regenerated (CLAUDE.md 6).
DEFAULT_TEMPERATURE: Final[float] = 0.2


class LLMError(RuntimeError):
    """The transport failed, or returned something unusable."""


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """What a client returns. Metadata travels so the response is auditable."""

    text: str
    model: str
    #: None for clients that do not report usage.
    input_tokens: int | None = None
    output_tokens: int | None = None


@runtime_checkable
class LLMClient(Protocol):
    """The only transport surface the narrative service uses."""

    @property
    def model(self) -> str:
        """Identifier recorded in the response."""
        ...

    def complete(self, *, system: str, user: str) -> LLMResponse:
        """One turn: a system prompt and a user message in, prose out."""
        ...


class AnthropicClient:
    """The real Messages API call.

    Imports the SDK lazily so that neither the engine, the tests, nor a
    generation-disabled deployment needs ``anthropic`` installed or a key set.
    """

    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client: Any = None

    @property
    def model(self) -> str:
        return self._model

    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self._api_key:
            raise LLMError(
                "no ANTHROPIC_API_KEY set. Narrative generation needs a key; the "
                "deterministic engine does not, and every other endpoint works "
                "without one."
            )
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - import guard
            raise LLMError(
                "the 'anthropic' package is not installed; install the [api] extra"
            ) from exc
        self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def complete(self, *, system: str, user: str) -> LLMResponse:
        client = self._ensure_client()
        try:
            message = client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                temperature=self._temperature,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic Messages API call failed: {exc}") from exc

        parts = [block.text for block in message.content if getattr(block, "type", None) == "text"]
        if not parts:
            raise LLMError("the model returned no text content")
        usage = getattr(message, "usage", None)
        return LLMResponse(
            text="\n".join(parts).strip(),
            model=self._model,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
        )


@dataclass
class ScriptedClient:
    """Returns canned text. The transport every test uses.

    ``responses`` is consumed in order; when it runs out the last entry repeats,
    so a test that only cares about one section need supply only one string.
    ``calls`` records what the service actually sent, which is how the tests
    assert that the system prompt carried the CLAUDE.md 6 requirements and that
    the payload was narrowed to the section's slice.
    """

    responses: list[str] = field(default_factory=lambda: ["Placeholder narrative."])
    model_name: str = "scripted-test-client"
    calls: list[dict[str, str]] = field(default_factory=list)
    _index: int = 0

    @property
    def model(self) -> str:
        return self.model_name

    def complete(self, *, system: str, user: str) -> LLMResponse:
        self.calls.append({"system": system, "user": user})
        if not self.responses:
            raise LLMError("ScriptedClient has no responses configured")
        text = self.responses[min(self._index, len(self.responses) - 1)]
        self._index += 1
        return LLMResponse(text=text, model=self.model_name)


@dataclass(frozen=True, slots=True)
class RefusingClient:
    """Always returns the supplied text, whatever it is asked.

    For a deployment that wants the API live with generation switched off: every
    section returns the locale's refusal string, and no chart data leaves the
    process.
    """

    text: str
    model_name: str = "generation-disabled"

    @property
    def model(self) -> str:
        return self.model_name

    def complete(self, *, system: str, user: str) -> LLMResponse:
        del system, user
        return LLMResponse(text=self.text, model=self.model_name)

"""Application settings and shared dependencies.

CLAUDE.md 1: FastAPI is **orchestration only** - "validates input -> calls engine
-> assembles ChartFacts JSON". Nothing in ``api/`` computes a Jyotish quantity;
every number comes from ``core/``.
"""

from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from api.locale import DEFAULT_LOCALE
from core.version import CHARTFACTS_SCHEMA_VERSION, ENGINE_VERSION
from narrative.client import DEFAULT_MODEL, AnthropicClient, LLMClient, RefusingClient
from narrative.service import NarrativeCache, NarrativeService
from narrative.validator import refusal_string


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime configuration, read once from the environment."""

    #: Narrative generation is opt-in. Without a key the API still serves every
    #: computed endpoint - the engine has never needed one (CLAUDE.md N1).
    anthropic_api_key: str | None = field(
        default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY")
    )
    narrative_model: str = field(
        default_factory=lambda: os.environ.get("JYOTISH_NARRATIVE_MODEL", DEFAULT_MODEL)
    )
    #: Reject rather than fall back to a refusal, for a caller that wants failures.
    narrative_strict: bool = field(
        default_factory=lambda: os.environ.get("JYOTISH_NARRATIVE_STRICT") == "1"
    )
    database_url: str | None = field(default_factory=lambda: os.environ.get("DATABASE_URL"))
    #: CORS origins, comma-separated. Empty means same-origin only.
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in os.environ.get("JYOTISH_CORS_ORIGINS", "").split(",") if o.strip()
        )
    )

    @property
    def narrative_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=1)
def get_narrative_cache() -> NarrativeCache:
    """One process-wide cache, so identical charts do not drift (CLAUDE.md 6)."""
    return NarrativeCache()


def build_narrative_client(settings: Settings) -> LLMClient:
    """The real client when a key is present; an inert one otherwise.

    A deployment without a key is a valid configuration - every computed endpoint
    works, because the engine has never needed one. The service is then constructed
    with ``enabled=False`` and returns each locale's own refusal string without
    calling this client at all, so the placeholder text here is never served.
    """
    if settings.narrative_enabled:
        return AnthropicClient(model=settings.narrative_model, api_key=settings.anthropic_api_key)
    return RefusingClient(text=refusal_string(DEFAULT_LOCALE))


@lru_cache(maxsize=1)
def get_narrative_service() -> NarrativeService:
    settings = get_settings()
    return NarrativeService(
        build_narrative_client(settings),
        cache=get_narrative_cache(),
        strict=settings.narrative_strict,
        enabled=settings.narrative_enabled,
    )


def engine_metadata() -> dict[str, Any]:
    """Version stamps echoed on stored records and in health output."""
    return {
        "engine_version": ENGINE_VERSION,
        "chartfacts_schema_version": CHARTFACTS_SCHEMA_VERSION,
    }


def utc_now() -> dt.datetime:
    """The single place the API reads the clock.

    Injectable in tests, and it keeps ``datetime.now()`` out of the engine, which
    takes ``now`` as a parameter precisely so it stays a pure function.
    """
    return dt.datetime.now(dt.UTC)

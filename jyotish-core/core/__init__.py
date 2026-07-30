"""Jyotish-Core: the deterministic Jyotish computation engine.

CLAUDE.md N1: no LLM ever computes a number. Every degree, tithi, timestamp,
dasha date, koot score and bala value in this product originates here.

CLAUDE.md 1: this package has zero dependency on FastAPI, on any LLM client, and
on any locale file. It returns numbers and enum keys; translation and phrasing
happen strictly above it.
"""

from __future__ import annotations

from core.version import CHARTFACTS_SCHEMA_VERSION, ENGINE_VERSION

__all__ = ["CHARTFACTS_SCHEMA_VERSION", "ENGINE_VERSION"]

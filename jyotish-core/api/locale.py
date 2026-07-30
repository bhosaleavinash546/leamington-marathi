"""Locale loading for the API layer.

CLAUDE.md 1: `core/` never reads a locale file. This module is where keys become
strings, and it sits above the engine by design.

The API returns the glossary *alongside* ChartFacts rather than merged into it, so
the document stays free of Devanagari (CLAUDE.md 5) while a client still has
everything it needs to render in one round trip.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Final

LOCALES_DIR: Final[Path] = Path(__file__).resolve().parent.parent / "locales"

SUPPORTED_LOCALES: Final[tuple[str, ...]] = ("mr", "hi", "en")
DEFAULT_LOCALE: Final[str] = "mr"  # CLAUDE.md N5, 7

#: Namespaces a chart response needs. ``narrative`` is excluded: it holds the
#: blocklist and refusal string, which are server-side concerns.
GLOSSARY_NAMESPACES: Final[tuple[str, ...]] = (
    "rashi",
    "nakshatra",
    "graha",
    "tithi",
    "yoga",
    "karana",
    "vara",
    "month",
    "bhava",
    "panchang",
    "dasha",
    "chart",
    "milan",
    "ui",
    "legal",
)


class LocaleError(ValueError):
    """An unknown locale, or a missing namespace file."""


@lru_cache(maxsize=len(SUPPORTED_LOCALES))
def load_glossary(locale: str) -> dict[str, dict[str, str]]:
    """Every glossary namespace for a locale."""
    if locale not in SUPPORTED_LOCALES:
        raise LocaleError(f"unsupported locale {locale!r}; known: {list(SUPPORTED_LOCALES)}")
    directory = LOCALES_DIR / locale
    out: dict[str, dict[str, str]] = {}
    for namespace in GLOSSARY_NAMESPACES:
        path = directory / f"{namespace}.json"
        if not path.exists():
            raise LocaleError(f"missing locale namespace {namespace!r} for {locale!r}")
        out[namespace] = json.loads(path.read_text(encoding="utf-8"))
    return out


def disclaimer(locale: str) -> str:
    """The persistent disclaimer required in all three locales (CLAUDE.md 10).

    Assembled from the locale file so it is curated, not composed here in English
    and translated. Returned on every substantive response - CLAUDE.md 10 says
    "Lead with this in the product, do not bury it."
    """
    legal = load_glossary(locale)["legal"]
    return " ".join(
        (
            legal["disclaimer"],
            legal["not_a_forecast"],
            legal["not_medical_advice"],
        )
    )


def term(locale: str, namespace: str, key: str) -> str:
    """One glossary term, falling back to the key itself.

    Falling back to the machine key rather than to English is deliberate: an
    English word appearing mid-sentence in Marathi prose is the failure
    CLAUDE.md N5 forbids, and a visible Latin key is an obvious bug rather than a
    plausible-looking wrong translation.
    """
    return load_glossary(locale).get(namespace, {}).get(key, key)

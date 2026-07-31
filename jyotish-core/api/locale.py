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
    # The two-akshara chart abbreviations - मं, बु, गु. Their absence from this
    # tuple is why every kundali, on screen and in the exported PDF, printed
    # "Su Me Ju Ve" on a Marathi sheet: `render/adapter.py` asks the glossary for
    # `graha_abbr`, got nothing, and fell back to `key[:2].title()`. The file had
    # existed in all three locales the whole time. `tools/locale_audit.py` now
    # fails if a namespace on disk is absent from a consumer's list.
    "graha_abbr",
    "tithi",
    # The 27 *nitya* yogas of the panchang's fifth limb. Chart yogas are a
    # different vocabulary and live in `combination` - conflating the two is what
    # left 29 rule keys untranslated (audit F-005).
    "yoga",
    "karana",
    "vara",
    "month",
    "bhava",
    "panchang",
    "dasha",
    "chart",
    "combination",
    "dosha",
    "milan",
    "common",
    "warning",
    "ui",
    "legal",
)

#: Namespaces a finding key may be named in, in lookup order. A yoga and a dosha
#: are both "findings" to the UI but come from different rule files, so the label
#: resolver tries each rather than assuming one.
FINDING_NAMESPACES: Final[tuple[str, ...]] = ("combination", "dosha", "milan")


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


def finding_label(locale: str, key: str) -> str:
    """Display name for a yoga or dosha key, searched across :data:`FINDING_NAMESPACES`.

    One resolver rather than a namespace guessed at each call site. Before this
    existed, both the web list and the printed sheet looked findings up in
    ``milan`` alone, so 29 of 33 rule keys reached the reader as Latin snake_case
    (audit F-005). ``tools/locale_audit.py`` now fails the build if any rule key
    is missing from all three namespaces, in any locale.
    """
    glossary = load_glossary(locale)
    for namespace in FINDING_NAMESPACES:
        found = glossary.get(namespace, {}).get(key)
        if found:
            return str(found)
    return key

"""Devanagari numerals for printed output (CLAUDE.md 7).

> Numeral toggle: Devanagari (०–९) vs Latin (0–9).

The web has had this since Phase 5 (`web/lib/format.ts`); the PDF did not, so an
`mr` sheet printed 428 Latin digits and not one Devanagari digit (audit F-011).
A patrika with Latin numerals reads as a web page exported to A4.

**Conversion is applied per value, never to the finished HTML.** A blanket pass
over the document would also rewrite the things that must stay machine-readable -
evidence keys like ``mars_in_house_7``, the engine version, the ruleset name - and
those are printed precisely so a reader can check a claim against the engine. A
digit inside a machine key is part of the key.
"""

from __future__ import annotations

from typing import Final

#: Latin digit -> Devanagari digit. Only the digits: Devanagari punctuation is a
#: separate question and the danda has no role in a number.
_DEVANAGARI: Final[dict[int, str]] = {ord("0") + i: chr(ord("०") + i) for i in range(10)}

#: Locales whose sheets print Devanagari numerals. English keeps Latin.
DEVANAGARI_NUMERAL_LOCALES: Final[frozenset[str]] = frozenset({"mr", "hi"})


def to_devanagari(text: str) -> str:
    """Rewrite every Latin digit in ``text`` as its Devanagari counterpart."""
    return text.translate(_DEVANAGARI)


def numeral_formatter(locale: str) -> Numerals:
    """A converter bound to a locale: Devanagari for mr/hi, identity for en."""
    return Numerals(locale in DEVANAGARI_NUMERAL_LOCALES)


class Numerals:
    """Applies the locale's numeral system to one display value at a time."""

    __slots__ = ("devanagari",)

    def __init__(self, devanagari: bool) -> None:
        self.devanagari = devanagari

    def __call__(self, value: object) -> str:
        text = str(value)
        return to_devanagari(text) if self.devanagari else text

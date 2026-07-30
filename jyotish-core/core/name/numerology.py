"""Name numerology — Chaldean and Pythagorean.

**This is not Jyotish.** CLAUDE.md 3.6 admits it as an optional extra "clearly
labelled as a **separate non-Jyotish system** in a collapsed panel", and
:data:`IS_JYOTISH` is ``False`` so that a UI cannot present it as part of the
chart by accident. It shares no data, no ephemeris and no convention with
anything else in ``core/``.

The two systems disagree by design, so both are returned and neither is
preferred. Chaldean assigns values 1-8 by sound and reserves 9; Pythagorean walks
the Latin alphabet in blocks of nine.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Final

#: Flag for the presentation layer. Numerology is adjacent to this product, not
#: part of its subject matter.
IS_JYOTISH: Final[bool] = False

#: Chaldean values. 9 is deliberately absent - it is held sacred and unassigned.
CHALDEAN: Final[dict[str, int]] = {
    "a": 1,
    "b": 2,
    "c": 3,
    "d": 4,
    "e": 5,
    "f": 8,
    "g": 3,
    "h": 5,
    "i": 1,
    "j": 1,
    "k": 2,
    "l": 3,
    "m": 4,
    "n": 5,
    "o": 7,
    "p": 8,
    "q": 1,
    "r": 2,
    "s": 3,
    "t": 4,
    "u": 6,
    "v": 6,
    "w": 6,
    "x": 5,
    "y": 1,
    "z": 7,
}

#: Pythagorean values: the alphabet in three blocks of nine (the last has eight).
PYTHAGOREAN: Final[dict[str, int]] = {
    letter: (index % 9) + 1 for index, letter in enumerate("abcdefghijklmnopqrstuvwxyz")
}

#: Numbers left unreduced in the Pythagorean reading.
MASTER_NUMBERS: Final[frozenset[int]] = frozenset({11, 22, 33})

VOWELS: Final[frozenset[str]] = frozenset("aeiou")


@dataclass(frozen=True, slots=True)
class NumerologyReading:
    """One system's reading of a name."""

    system: str
    #: Sum before any reduction.
    raw_total: int
    #: Reduced to a single digit, or left at a master number where the system
    #: preserves them.
    reduced: int
    #: Per-letter contributions, so the arithmetic is auditable.
    letter_values: tuple[tuple[str, int], ...]
    #: Vowel-only and consonant-only sums, the "soul" and "personality" numbers.
    vowel_total: int
    consonant_total: int
    #: Letters that carried no value in this system.
    unmapped: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class NameNumerology:
    """Both systems' readings, with the not-Jyotish flag attached."""

    name: str
    chaldean: NumerologyReading
    pythagorean: NumerologyReading
    is_jyotish: bool = IS_JYOTISH


def _latin_letters(name: str) -> tuple[str, ...]:
    """Latin letters of a name, accents stripped, case folded.

    Devanagari input yields an empty tuple: neither system has letter values for
    Devanagari, and inventing a mapping would be exactly the kind of unsourced
    convention CLAUDE.md 11 forbids. The caller reports "not available for this
    script" instead.
    """
    decomposed = unicodedata.normalize("NFD", name)
    return tuple(ch for ch in decomposed.lower() if "a" <= ch <= "z")


def reduce_to_digit(total: int, *, keep_master: bool) -> int:
    """Repeatedly sum the digits until one digit remains.

    ``keep_master`` stops the reduction at 11, 22 or 33, which the Pythagorean
    reading preserves and the Chaldean one does not.
    """
    value = total
    while value > 9:
        if keep_master and value in MASTER_NUMBERS:
            return value
        value = sum(int(d) for d in str(value))
    return value


def _read(name: str, table: dict[str, int], system: str, *, keep_master: bool) -> NumerologyReading:
    letters = _latin_letters(name)
    values = tuple((ch, table[ch]) for ch in letters if ch in table)
    unmapped = tuple(ch for ch in letters if ch not in table)
    raw = sum(v for _, v in values)
    return NumerologyReading(
        system=system,
        raw_total=raw,
        reduced=reduce_to_digit(raw, keep_master=keep_master) if raw else 0,
        letter_values=values,
        vowel_total=sum(v for ch, v in values if ch in VOWELS),
        consonant_total=sum(v for ch, v in values if ch not in VOWELS),
        unmapped=unmapped,
    )


def compute_numerology(name: str) -> NameNumerology:
    """Both readings of a name. Empty or non-Latin input yields zero totals."""
    return NameNumerology(
        name=name,
        chaldean=_read(name, CHALDEAN, "chaldean", keep_master=False),
        pythagorean=_read(name, PYTHAGOREAN, "pythagorean", keep_master=True),
    )

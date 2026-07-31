"""Name handling: display, Namakaran syllable check, optional numerology."""

from __future__ import annotations

from core.name.namakaran import (
    NAMAKARAN_SYLLABLES,
    NamakaranCheck,
    check_namakaran,
    name_onset,
    syllables_for,
)
from core.name.numerology import (
    CHALDEAN,
    IS_JYOTISH,
    PYTHAGOREAN,
    NameNumerology,
    NumerologyReading,
    compute_numerology,
    reduce_to_digit,
)

__all__ = [
    "CHALDEAN",
    "IS_JYOTISH",
    "NAMAKARAN_SYLLABLES",
    "PYTHAGOREAN",
    "NamakaranCheck",
    "NameNumerology",
    "NumerologyReading",
    "check_namakaran",
    "compute_numerology",
    "name_onset",
    "reduce_to_digit",
    "syllables_for",
]

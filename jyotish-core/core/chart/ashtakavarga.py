"""Ashtakavarga — Bhinnashtakavarga and Sarvashtakavarga.

Each of the seven grahas has a table of *benefic houses*, counted separately from
each of eight reference points: the seven grahas and the lagna. A rashi collects
one bindu (point) for every reference point from which it falls in a benefic
house. The per-graha result is its Bhinnashtakavarga (BAV); summing the seven
BAVs rashi by rashi gives the Sarvashtakavarga (SAV).

**The tables are the invariant.** CLAUDE.md 3.3 says "Row sums are invariants -
assert them." The classical row totals are fixed numbers, so the tables below can
be checked without any ephemeris at all:

======== =====
graha    total
======== =====
Sun      48
Moon     49
Mars     39
Mercury  54
Jupiter  56
Venus    52
Saturn   39
**all**  **337**
======== =====

``tests/invariants/test_ashtakavarga.py`` asserts every row total and the grand
total, so a transcription slip in these tables fails the build rather than
quietly skewing every chart by one bindu.

Consequences of those totals, also asserted: each BAV distributes its total over
12 rashis, so ``sum(bav) == total`` for any chart, and ``sum(sav) == 337``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from core.angles import rashi_of
from core.enums import SAPTA_GRAHA, Graha

#: Reference points, in the classical order. The lagna is the eighth - hence
#: *ashta*-ka-varga, the eightfold division.
REFERENCE_POINTS: Final[tuple[Graha | None, ...]] = (*SAPTA_GRAHA, None)

#: ``BENEFIC_HOUSES[subject][reference]`` = houses, counted from ``reference``,
#: in which ``subject`` gains a bindu. ``None`` as a reference means the lagna.
BENEFIC_HOUSES: Final[dict[Graha, dict[Graha | None, frozenset[int]]]] = {
    Graha.SUN: {
        Graha.SUN: frozenset({1, 2, 4, 7, 8, 9, 10, 11}),
        Graha.MOON: frozenset({3, 6, 10, 11}),
        Graha.MARS: frozenset({1, 2, 4, 7, 8, 9, 10, 11}),
        Graha.MERCURY: frozenset({3, 5, 6, 9, 10, 11, 12}),
        Graha.JUPITER: frozenset({5, 6, 9, 11}),
        Graha.VENUS: frozenset({6, 7, 12}),
        Graha.SATURN: frozenset({1, 2, 4, 7, 8, 9, 10, 11}),
        None: frozenset({3, 4, 6, 10, 11, 12}),
    },
    Graha.MOON: {
        Graha.SUN: frozenset({3, 6, 7, 8, 10, 11}),
        Graha.MOON: frozenset({1, 3, 6, 7, 10, 11}),
        Graha.MARS: frozenset({2, 3, 5, 6, 9, 10, 11}),
        Graha.MERCURY: frozenset({1, 3, 4, 5, 7, 8, 10, 11}),
        Graha.JUPITER: frozenset({1, 2, 4, 7, 8, 10, 11}),
        Graha.VENUS: frozenset({3, 4, 5, 7, 9, 10, 11}),
        Graha.SATURN: frozenset({3, 5, 6, 11}),
        None: frozenset({3, 6, 10, 11}),
    },
    Graha.MARS: {
        Graha.SUN: frozenset({3, 5, 6, 10, 11}),
        Graha.MOON: frozenset({3, 6, 11}),
        Graha.MARS: frozenset({1, 2, 4, 7, 8, 10, 11}),
        Graha.MERCURY: frozenset({3, 5, 6, 11}),
        Graha.JUPITER: frozenset({6, 10, 11, 12}),
        Graha.VENUS: frozenset({6, 8, 11, 12}),
        Graha.SATURN: frozenset({1, 4, 7, 8, 9, 10, 11}),
        None: frozenset({1, 3, 6, 10, 11}),
    },
    Graha.MERCURY: {
        Graha.SUN: frozenset({5, 6, 9, 11, 12}),
        Graha.MOON: frozenset({2, 4, 6, 8, 10, 11}),
        Graha.MARS: frozenset({1, 2, 4, 7, 8, 9, 10, 11}),
        Graha.MERCURY: frozenset({1, 3, 5, 6, 9, 10, 11, 12}),
        Graha.JUPITER: frozenset({6, 8, 11, 12}),
        Graha.VENUS: frozenset({1, 2, 3, 4, 5, 8, 9, 11}),
        Graha.SATURN: frozenset({1, 2, 4, 7, 8, 9, 10, 11}),
        None: frozenset({1, 2, 4, 6, 8, 10, 11}),
    },
    Graha.JUPITER: {
        Graha.SUN: frozenset({1, 2, 3, 4, 7, 8, 9, 10, 11}),
        Graha.MOON: frozenset({2, 5, 7, 9, 11}),
        Graha.MARS: frozenset({1, 2, 4, 7, 8, 10, 11}),
        Graha.MERCURY: frozenset({1, 2, 4, 5, 6, 9, 10, 11}),
        Graha.JUPITER: frozenset({1, 2, 3, 4, 7, 8, 10, 11}),
        Graha.VENUS: frozenset({2, 5, 6, 9, 10, 11}),
        Graha.SATURN: frozenset({3, 5, 6, 12}),
        None: frozenset({1, 2, 4, 5, 6, 7, 9, 10, 11}),
    },
    Graha.VENUS: {
        Graha.SUN: frozenset({8, 11, 12}),
        Graha.MOON: frozenset({1, 2, 3, 4, 5, 8, 9, 11, 12}),
        Graha.MARS: frozenset({3, 5, 6, 9, 11, 12}),
        Graha.MERCURY: frozenset({3, 5, 6, 9, 11}),
        Graha.JUPITER: frozenset({5, 8, 9, 10, 11}),
        Graha.VENUS: frozenset({1, 2, 3, 4, 5, 8, 9, 10, 11}),
        Graha.SATURN: frozenset({3, 4, 5, 8, 9, 10, 11}),
        None: frozenset({1, 2, 3, 4, 5, 8, 9, 11}),
    },
    Graha.SATURN: {
        Graha.SUN: frozenset({1, 2, 4, 7, 8, 10, 11}),
        Graha.MOON: frozenset({3, 6, 11}),
        Graha.MARS: frozenset({3, 5, 6, 10, 11, 12}),
        Graha.MERCURY: frozenset({6, 8, 9, 10, 11, 12}),
        Graha.JUPITER: frozenset({5, 6, 11, 12}),
        Graha.VENUS: frozenset({6, 11, 12}),
        Graha.SATURN: frozenset({3, 5, 6, 11}),
        None: frozenset({1, 3, 4, 6, 10, 11}),
    },
}

#: Classical row totals. Asserted against :data:`BENEFIC_HOUSES` in CI.
EXPECTED_BAV_TOTALS: Final[dict[Graha, int]] = {
    Graha.SUN: 48,
    Graha.MOON: 49,
    Graha.MARS: 39,
    Graha.MERCURY: 54,
    Graha.JUPITER: 56,
    Graha.VENUS: 52,
    Graha.SATURN: 39,
}

EXPECTED_SAV_TOTAL: Final[int] = 337


@dataclass(frozen=True, slots=True)
class Ashtakavarga:
    """Bhinnashtakavarga per graha and the Sarvashtakavarga total.

    Both are indexed by rashi in the natural order, so ``bhinna[Graha.SUN][0]``
    is the Sun's bindu count in Mesha, not in the first house.
    """

    bhinna: dict[Graha, tuple[int, ...]]
    sarva: tuple[int, ...]

    def bav_total(self, graha: Graha) -> int:
        return sum(self.bhinna[graha])

    @property
    def sav_total(self) -> int:
        return sum(self.sarva)

    def sarva_for_house(self, house_1based: int, lagna_rashi: int) -> int:
        """SAV bindus of the rashi occupying a given whole-sign house."""
        rashi = (lagna_rashi - 1 + house_1based - 1) % 12 + 1
        return self.sarva[rashi - 1]


def compute_ashtakavarga(
    graha_longitudes: dict[Graha, float], lagna_sid_lon: float
) -> Ashtakavarga:
    """Bhinna and Sarva ashtakavarga for a chart.

    Only the seven grahas participate; the nodes have no BAV of their own and are
    not reference points, so they are ignored even if present in the input.
    """
    reference_rashis: dict[Graha | None, int] = {
        graha: rashi_of(graha_longitudes[graha]) for graha in SAPTA_GRAHA
    }
    reference_rashis[None] = rashi_of(lagna_sid_lon)

    bhinna: dict[Graha, tuple[int, ...]] = {}
    for subject in SAPTA_GRAHA:
        counts = [0] * 12
        table = BENEFIC_HOUSES[subject]
        for reference in REFERENCE_POINTS:
            ref_rashi = reference_rashis[reference]
            for house in table[reference]:
                # House ``h`` from the reference rashi, 1-based both ways.
                rashi = (ref_rashi - 1 + house - 1) % 12
                counts[rashi] += 1
        bhinna[subject] = tuple(counts)

    sarva = tuple(sum(bhinna[g][r] for g in SAPTA_GRAHA) for r in range(12))
    return Ashtakavarga(bhinna=bhinna, sarva=sarva)


def table_row_total(graha: Graha) -> int:
    """Sum of benefic-house counts across the eight references for one graha.

    This is the quantity that must equal :data:`EXPECTED_BAV_TOTALS`, and it
    depends only on the tables - no chart, no ephemeris.
    """
    return sum(len(houses) for houses in BENEFIC_HOUSES[graha].values())

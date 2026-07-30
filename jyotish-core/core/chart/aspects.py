"""Graha drishti (दृष्टी) — Vedic aspects.

Vedic aspects are *sign-to-sign and unidirectional*, unlike Western orb-based
aspects. Every graha casts a full aspect on the 7th house from itself. Three
grahas cast additional special aspects, and those are not reciprocal - Saturn
sees the 3rd and 10th from itself, but a graha in Saturn's 3rd does not thereby
see Saturn.

* **Mars** - 4th, 7th, 8th
* **Jupiter** - 5th, 7th, 9th
* **Saturn** - 3rd, 7th, 10th

The graded (partial) drishti values are the Parashari *drishti kona* scale used
by Drik bala: the strength of a glance depends on the exact angular separation,
not only on the sign count. Both views are returned - the discrete sign-based
one, which the yoga rules use, and the graded one, which Shadbala uses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from core.angles import norm360
from core.chart.houses import house_distance
from core.enums import Graha

#: Houses (counted from the aspecting graha) receiving a full sign-based aspect.
SPECIAL_FULL_ASPECTS: Final[dict[Graha, frozenset[int]]] = {
    Graha.MARS: frozenset({4, 7, 8}),
    Graha.JUPITER: frozenset({5, 7, 9}),
    Graha.SATURN: frozenset({3, 7, 10}),
}

#: Every graha aspects the 7th fully.
UNIVERSAL_FULL_ASPECT: Final[int] = 7

#: Three-quarter and half aspects in the common Parashari sign-count reading,
#: applied to grahas without a special aspect on that house.
THREE_QUARTER_HOUSES: Final[frozenset[int]] = frozenset({4, 8})
HALF_HOUSES: Final[frozenset[int]] = frozenset({5, 9})
QUARTER_HOUSES: Final[frozenset[int]] = frozenset({3, 10})

#: Natural benefics and malefics, for the sign of a Drik bala contribution.
#: Mercury's benefic/malefic status is context-dependent in the classics; this
#: engine treats it as benefic when not conjunct a malefic, the common
#: simplification, and records the choice in docs/DIVERGENCES.md.
NATURAL_BENEFICS: Final[frozenset[Graha]] = frozenset(
    {Graha.JUPITER, Graha.VENUS, Graha.MERCURY, Graha.MOON}
)
NATURAL_MALEFICS: Final[frozenset[Graha]] = frozenset(
    {Graha.SUN, Graha.MARS, Graha.SATURN, Graha.RAHU, Graha.KETU}
)


@dataclass(frozen=True, slots=True)
class Aspect:
    """One graha's glance at one target."""

    aspecting: Graha
    #: House of the target counted from the aspecting graha, 1-based.
    house_distance: int
    #: Discrete sign-based strength in [0, 1]: 1.0 is a full drishti.
    sign_strength: float
    #: Graded Parashari strength in virupas, 0-60, from the exact separation.
    graded_virupa: float
    is_special: bool


def sign_aspect_strength(aspecting: Graha, distance: int) -> float:
    """Discrete drishti strength for a graha looking ``distance`` houses ahead.

    A special aspect always wins: Jupiter's glance at its 5th is full, not half.
    """
    if distance == UNIVERSAL_FULL_ASPECT:
        return 1.0
    if distance in SPECIAL_FULL_ASPECTS.get(aspecting, frozenset()):
        return 1.0
    if distance in THREE_QUARTER_HOUSES:
        return 0.75
    if distance in HALF_HOUSES:
        return 0.5
    if distance in QUARTER_HOUSES:
        return 0.25
    return 0.0


def graded_drishti_virupa(separation: float) -> float:
    """Parashari graded drishti in virupas (0-60) from an exact separation.

    The classical piecewise scale, in degrees of separation:

    ====================  ================================================
    range                 value
    ====================  ================================================
    30-60                 rises 0 -> 60 linearly across the 30 degrees
    60-90                 falls 60 -> 15
    90-120                rises 15 -> 45
    120-150               60 flat
    150-180               falls 60 -> 0  (the 7th house peak sits at 180)
    ====================  ================================================

    Outside 30-180 the glance is nil, which is why a conjunction casts no
    drishti in this system.
    """
    s = norm360(separation)
    if s > 180.0:
        s = 360.0 - s  # drishti is symmetric about the opposition
    if s < 30.0:
        return 0.0
    if s <= 60.0:
        return (s - 30.0) * 2.0  # 0 -> 60
    if s <= 90.0:
        return 60.0 - (s - 60.0) * 1.5  # 60 -> 15
    if s <= 120.0:
        return 15.0 + (s - 90.0)  # 15 -> 45
    if s <= 150.0:
        return 45.0 + (s - 120.0) * 0.5  # 45 -> 60
    return 60.0 - (s - 150.0) * 2.0  # 60 -> 0


def aspects_on(
    target_sid_lon: float, graha_positions: dict[Graha, float], *, include_nodes: bool = False
) -> tuple[Aspect, ...]:
    """Every aspect falling on ``target_sid_lon``.

    The nodes are excluded by default: classical drishti is defined for the seven
    grahas, and node aspects are a modern extension. Pass ``include_nodes=True``
    to get them, labelled like any other.
    """
    out: list[Aspect] = []
    for graha, lon in graha_positions.items():
        if not include_nodes and graha in (Graha.RAHU, Graha.KETU):
            continue
        distance = house_distance(lon, target_sid_lon)
        if distance == 1:
            continue  # a graha does not aspect its own house
        strength = sign_aspect_strength(graha, distance)
        if strength == 0.0:
            continue
        out.append(
            Aspect(
                aspecting=graha,
                house_distance=distance,
                sign_strength=strength,
                graded_virupa=graded_drishti_virupa(target_sid_lon - lon),
                is_special=distance in SPECIAL_FULL_ASPECTS.get(graha, frozenset())
                and distance != UNIVERSAL_FULL_ASPECT,
            )
        )
    return tuple(out)


def aspects_on_house(
    house_1based: int, lagna_sid_lon: float, graha_positions: dict[Graha, float]
) -> tuple[Aspect, ...]:
    """Aspects falling on a whole-sign house, evaluated at its sign's start."""
    from core.angles import DEG_PER_RASHI, rashi_of

    target_rashi = (rashi_of(lagna_sid_lon) - 1 + house_1based - 1) % 12 + 1
    return aspects_on((target_rashi - 1) * DEG_PER_RASHI, graha_positions)


def is_benefic(graha: Graha) -> bool:
    """Natural benefic status, used for the sign of a Drik bala contribution."""
    return graha in NATURAL_BENEFICS

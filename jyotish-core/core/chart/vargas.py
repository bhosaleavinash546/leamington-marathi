"""Divisional charts (वर्ग) D1 through D60.

CLAUDE.md 3.3 requires all sixteen. Each function maps an absolute sidereal
longitude to the 1-based rashi the graha occupies in that varga.

Two families of rule appear. Most vargas cut the sign into N equal parts and
count forward from a *starting sign* determined by the parity, element or
movability of the natal sign. D30 is the exception: its five parts are unequal
and are keyed to planetary rulers rather than to a count.

The invariant every equal-part varga satisfies - and which
``tests/invariants/test_varga_partition.py`` asserts by sweeping each sign at
one-arcminute resolution - is that the N parts of a sign partition it exactly:
no gap, no overlap, and the part index is always in ``0..N-1``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Final

from core.angles import DEG_PER_RASHI, deg_in_rashi, norm360, rashi_of
from core.enums import RASHI_NATURE, RASHI_TATTVA, RashiNature, Tattva, Varga, is_odd_rashi


def _wrap(rashi: int) -> int:
    """Fold a possibly out-of-range 1-based rashi back into 1..12."""
    return (rashi - 1) % 12 + 1


def _part_index(sid_lon: float, divisions: int) -> int:
    """0-based index of the equal part of the sign that ``sid_lon`` falls in."""
    part_size = DEG_PER_RASHI / divisions
    idx = int(deg_in_rashi(sid_lon) / part_size)
    # Guard the closed upper edge: floating point can push 29.9999999 to N.
    return min(idx, divisions - 1)


# ---------------------------------------------------------------------------
# D1 - Rashi
# ---------------------------------------------------------------------------


def d1_rashi(sid_lon: float) -> int:
    """The natal chart itself."""
    return rashi_of(sid_lon)


# ---------------------------------------------------------------------------
# D2 - Hora (wealth). Two halves, mapped to Simha and Karka only.
# ---------------------------------------------------------------------------


def d2_hora(sid_lon: float) -> int:
    """First half of an odd sign is the Sun's hora (Simha), second the Moon's
    (Karka); reversed for an even sign."""
    first_half = _part_index(sid_lon, 2) == 0
    if is_odd_rashi(rashi_of(sid_lon)):
        return 5 if first_half else 4
    return 4 if first_half else 5


# ---------------------------------------------------------------------------
# D3 - Drekkana (siblings). Thirds, counted 1st / 5th / 9th from the sign.
# ---------------------------------------------------------------------------


def d3_drekkana(sid_lon: float) -> int:
    return _wrap(rashi_of(sid_lon) + 4 * _part_index(sid_lon, 3))


# ---------------------------------------------------------------------------
# D4 - Chaturthamsa (fortune, property). Quarters from 1st / 4th / 7th / 10th.
# ---------------------------------------------------------------------------


def d4_chaturthamsa(sid_lon: float) -> int:
    return _wrap(rashi_of(sid_lon) + 3 * _part_index(sid_lon, 4))


# ---------------------------------------------------------------------------
# D7 - Saptamsa (children). Odd signs count from the sign, even from its 7th.
# ---------------------------------------------------------------------------


def d7_saptamsa(sid_lon: float) -> int:
    rashi = rashi_of(sid_lon)
    start = rashi if is_odd_rashi(rashi) else rashi + 6
    return _wrap(start + _part_index(sid_lon, 7))


# ---------------------------------------------------------------------------
# D9 - Navamsa (spouse, inner strength). Mandatory on a Marathi sheet.
# ---------------------------------------------------------------------------


def d9_navamsa(sid_lon: float) -> int:
    """Ninths of 3 deg 20', counted continuously from Mesha.

    The classical statement - movable signs start from themselves, fixed from
    the 9th, dual from the 5th - is exactly equivalent to a single unbroken
    count of 3 deg 20' arcs from 0 deg Mesha, because 9 navamsas advance the
    starting sign by 9 and 12 signs of 9 navamsas close the cycle at 108 = 9x12.
    Implemented as the continuous count, and
    ``tests/unit/test_vargas.py::test_navamsa_matches_classical_rule``
    checks it against the three-branch form sign by sign.
    """
    return int(norm360(sid_lon) / (DEG_PER_RASHI / 9)) % 12 + 1


def _navamsa_classical(sid_lon: float) -> int:
    """The three-branch statement of the navamsa rule, kept for the test."""
    rashi = rashi_of(sid_lon)
    match RASHI_NATURE[rashi]:
        case RashiNature.CHARA:
            start = rashi
        case RashiNature.STHIRA:
            start = rashi + 8
        case RashiNature.DWISWABHAVA:
            start = rashi + 4
    return _wrap(start + _part_index(sid_lon, 9))


# ---------------------------------------------------------------------------
# D10 - Dasamsa (career). Odd signs from the sign, even from its 9th.
# ---------------------------------------------------------------------------


def d10_dasamsa(sid_lon: float) -> int:
    rashi = rashi_of(sid_lon)
    start = rashi if is_odd_rashi(rashi) else rashi + 8
    return _wrap(start + _part_index(sid_lon, 10))


# ---------------------------------------------------------------------------
# D12 - Dwadasamsa (parents). Twelfths counted from the sign itself.
# ---------------------------------------------------------------------------


def d12_dwadasamsa(sid_lon: float) -> int:
    return _wrap(rashi_of(sid_lon) + _part_index(sid_lon, 12))


# ---------------------------------------------------------------------------
# Movability- and element-keyed vargas
# ---------------------------------------------------------------------------

#: D16 and D45 share this start: movable -> Mesha, fixed -> Simha, dual -> Dhanu.
_START_BY_NATURE_FIRE: Final[dict[RashiNature, int]] = {
    RashiNature.CHARA: 1,
    RashiNature.STHIRA: 5,
    RashiNature.DWISWABHAVA: 9,
}

#: D20 differs: movable -> Mesha, fixed -> Dhanu, dual -> Simha.
_START_BY_NATURE_D20: Final[dict[RashiNature, int]] = {
    RashiNature.CHARA: 1,
    RashiNature.STHIRA: 9,
    RashiNature.DWISWABHAVA: 5,
}

#: D27 keys off the element of the sign.
_START_BY_TATTVA: Final[dict[Tattva, int]] = {
    Tattva.AGNI: 1,  # Mesha
    Tattva.PRITHVI: 4,  # Karka
    Tattva.VAYU: 7,  # Tula
    Tattva.JALA: 10,  # Makara
}


def d16_shodasamsa(sid_lon: float) -> int:
    """D16 Kalamsa - vehicles, comforts. 1 deg 52' 30" parts."""
    start = _START_BY_NATURE_FIRE[RASHI_NATURE[rashi_of(sid_lon)]]
    return _wrap(start + _part_index(sid_lon, 16))


def d20_vimsamsa(sid_lon: float) -> int:
    """D20 - spiritual practice. 1 deg 30' parts."""
    start = _START_BY_NATURE_D20[RASHI_NATURE[rashi_of(sid_lon)]]
    return _wrap(start + _part_index(sid_lon, 20))


def d24_siddhamsa(sid_lon: float) -> int:
    """D24 Chaturvimsamsa - learning. Odd signs from Simha, even from Karka."""
    start = 5 if is_odd_rashi(rashi_of(sid_lon)) else 4
    return _wrap(start + _part_index(sid_lon, 24))


def d27_bhamsa(sid_lon: float) -> int:
    """D27 Nakshatramsa - strengths and weaknesses. Element-keyed start."""
    start = _START_BY_TATTVA[RASHI_TATTVA[rashi_of(sid_lon)]]
    return _wrap(start + _part_index(sid_lon, 27))


def d40_khavedamsa(sid_lon: float) -> int:
    """D40 - maternal legacy. Odd signs from Mesha, even from Tula."""
    start = 1 if is_odd_rashi(rashi_of(sid_lon)) else 7
    return _wrap(start + _part_index(sid_lon, 40))


def d45_akshavedamsa(sid_lon: float) -> int:
    """D45 - paternal legacy, conduct. Same start family as D16."""
    start = _START_BY_NATURE_FIRE[RASHI_NATURE[rashi_of(sid_lon)]]
    return _wrap(start + _part_index(sid_lon, 45))


def d60_shashtiamsa(sid_lon: float) -> int:
    """D60 - the summary varga, past-life karma. Counted from the sign itself.

    At 30' per division this is the varga most sensitive to birth-time error:
    two minutes of clock error moves the Moon a full shashtiamsa. The confidence
    machinery in CLAUDE.md 4.6 exists largely for this.
    """
    return _wrap(rashi_of(sid_lon) + _part_index(sid_lon, 60))


# ---------------------------------------------------------------------------
# D30 - Trimsamsa. Unequal parts keyed to the five non-luminary rulers.
# ---------------------------------------------------------------------------

#: Odd sign: (upper bound in degrees, resulting rashi). Mars, Saturn, Jupiter,
#: Mercury, Venus, in their own signs Mesha, Kumbha, Dhanu, Mithuna, Tula.
_TRIMSAMSA_ODD: Final[tuple[tuple[float, int], ...]] = (
    (5.0, 1),  # Mars -> Mesha
    (10.0, 11),  # Saturn -> Kumbha
    (18.0, 9),  # Jupiter -> Dhanu
    (25.0, 3),  # Mercury -> Mithuna
    (30.0, 7),  # Venus -> Tula
)

#: Even sign: the same five rulers in reverse order, in their other signs.
_TRIMSAMSA_EVEN: Final[tuple[tuple[float, int], ...]] = (
    (5.0, 2),  # Venus -> Vrishabha
    (12.0, 6),  # Mercury -> Kanya
    (20.0, 12),  # Jupiter -> Meena
    (25.0, 10),  # Saturn -> Makara
    (30.0, 8),  # Mars -> Vrishchika
)


def d30_trimsamsa(sid_lon: float) -> int:
    """D30 - misfortunes, character. Five unequal arcs, no luminary involved.

    The Sun and Moon rule no trimsamsa: the classical division assigns the five
    arcs to Mars, Saturn, Jupiter, Mercury and Venus only, which is why this
    varga cannot be produced by the equal-part machinery above.
    """
    table = _TRIMSAMSA_ODD if is_odd_rashi(rashi_of(sid_lon)) else _TRIMSAMSA_EVEN
    within = deg_in_rashi(sid_lon)
    for upper, rashi in table:
        if within < upper:
            return rashi
    return table[-1][1]  # pragma: no cover - deg_in_rashi is always < 30


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

VARGA_FUNCTIONS: Final[dict[Varga, Callable[[float], int]]] = {
    Varga.D1: d1_rashi,
    Varga.D2: d2_hora,
    Varga.D3: d3_drekkana,
    Varga.D4: d4_chaturthamsa,
    Varga.D7: d7_saptamsa,
    Varga.D9: d9_navamsa,
    Varga.D10: d10_dasamsa,
    Varga.D12: d12_dwadasamsa,
    Varga.D16: d16_shodasamsa,
    Varga.D20: d20_vimsamsa,
    Varga.D24: d24_siddhamsa,
    Varga.D27: d27_bhamsa,
    Varga.D30: d30_trimsamsa,
    Varga.D40: d40_khavedamsa,
    Varga.D45: d45_akshavedamsa,
    Varga.D60: d60_shashtiamsa,
}

#: Number of divisions per sign, for the partition invariant test. D30's five
#: unequal arcs are excluded because the equal-part invariant does not apply.
VARGA_DIVISIONS: Final[dict[Varga, int]] = {
    Varga.D1: 1,
    Varga.D2: 2,
    Varga.D3: 3,
    Varga.D4: 4,
    Varga.D7: 7,
    Varga.D9: 9,
    Varga.D10: 10,
    Varga.D12: 12,
    Varga.D16: 16,
    Varga.D20: 20,
    Varga.D24: 24,
    Varga.D27: 27,
    Varga.D40: 40,
    Varga.D45: 45,
    Varga.D60: 60,
}

#: The seven vargas whose dignities feed Saptavargaja bala in Shadbala.
SAPTAVARGA: Final[tuple[Varga, ...]] = (
    Varga.D1,
    Varga.D2,
    Varga.D3,
    Varga.D7,
    Varga.D9,
    Varga.D12,
    Varga.D30,
)


def varga_rashi(varga: Varga, sid_lon: float) -> int:
    """Rashi occupied in ``varga`` by a graha at ``sid_lon``."""
    return VARGA_FUNCTIONS[varga](sid_lon)


def all_vargas(sid_lon: float) -> dict[Varga, int]:
    """Every required varga for one longitude."""
    return {varga: fn(sid_lon) for varga, fn in VARGA_FUNCTIONS.items()}

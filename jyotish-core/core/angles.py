"""Angle normalisation and comparison.

CLAUDE.md 4.7: every longitude passes through :func:`norm360`; angles are never
compared with ``==``.
"""

from __future__ import annotations

import math

#: Default comparison tolerance in degrees. 1e-9 deg is ~0.4 micro-arcsecond,
#: far below ephemeris accuracy, so it only absorbs float representation noise.
ANGLE_EPS = 1e-9

DEG_PER_RASHI = 30.0
DEG_PER_NAKSHATRA = 360.0 / 27.0  # 13 deg 20'
DEG_PER_PADA = DEG_PER_NAKSHATRA / 4.0  # 3 deg 20'
DEG_PER_TITHI = 12.0
DEG_PER_KARANA = 6.0


def norm360(deg: float) -> float:
    """Normalise an angle to [0, 360).

    ``math.fmod`` keeps the sign of the dividend, so negatives are shifted up.
    A value that lands exactly on 360.0 after that shift (possible for tiny
    negative inputs) is folded back to 0.0 so the range stays half-open.
    """
    v = math.fmod(deg, 360.0)
    if v < 0.0:
        v += 360.0
    if v >= 360.0:  # e.g. deg = -1e-18
        v = 0.0
    return v


def norm180(deg: float) -> float:
    """Normalise an angle to (-180, 180]. Useful for signed separations."""
    v = norm360(deg)
    return v - 360.0 if v > 180.0 else v


def separation(a: float, b: float) -> float:
    """Forward (anticlockwise) separation from ``a`` to ``b``, in [0, 360)."""
    return norm360(b - a)


def shortest_separation(a: float, b: float) -> float:
    """Unsigned angular distance between two longitudes, in [0, 180]."""
    return abs(norm180(b - a))


def angles_equal(a: float, b: float, eps: float = ANGLE_EPS) -> bool:
    """Compare two longitudes modulo 360 within ``eps`` degrees."""
    return shortest_separation(a, b) <= eps


def rashi_of(sid_lon: float) -> int:
    """1-based rashi (Mesha = 1 ... Meena = 12) containing ``sid_lon``."""
    return int(norm360(sid_lon) // DEG_PER_RASHI) + 1


def deg_in_rashi(sid_lon: float) -> float:
    """Degrees elapsed within the containing rashi, in [0, 30)."""
    return norm360(sid_lon) % DEG_PER_RASHI


def nakshatra_of(sid_lon: float) -> int:
    """1-based nakshatra (Ashwini = 1 ... Revati = 27)."""
    return int(norm360(sid_lon) // DEG_PER_NAKSHATRA) + 1


def pada_of(sid_lon: float) -> int:
    """1-based pada (1-4) within the containing nakshatra."""
    within = norm360(sid_lon) % DEG_PER_NAKSHATRA
    return int(within // DEG_PER_PADA) + 1


def nakshatra_fraction(sid_lon: float) -> float:
    """Fraction of the containing nakshatra already elapsed, in [0, 1).

    This is the quantity Vimshottari dasha balance is keyed to (CLAUDE.md 3.4).
    """
    within = norm360(sid_lon) % DEG_PER_NAKSHATRA
    return within / DEG_PER_NAKSHATRA


def dms(deg: float) -> tuple[int, int, float]:
    """Split a non-negative angle into (degrees, arcminutes, arcseconds)."""
    total = abs(deg)
    d = int(total)
    m_float = (total - d) * 60.0
    m = int(m_float)
    s = (m_float - m) * 60.0
    return d, m, s


def format_dms(deg: float, places: int = 0) -> str:
    """Format an angle as ``12°34'56"`` for display and debugging.

    ``places`` is the number of decimals on the seconds. The seconds field is
    zero-padded to two integer digits, so the width is 2 plus the decimal point
    and decimals when ``places`` is non-zero.
    """
    d, m, s = dms(deg)
    sign = "-" if deg < 0 else ""
    width = 2 if places == 0 else 3 + places
    return f"{sign}{d}°{m:02d}'{s:0{width}.{places}f}\""

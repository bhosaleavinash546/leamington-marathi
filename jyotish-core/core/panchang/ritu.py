"""ऋतू (season) and अयन (solar half-year).

**Ritu.** Two conventions are in use. The lunar one pairs consecutive amanta
months - Chaitra+Vaishakha = Vasanta, and so on round the year - and is what a
Marathi panchang prints beside the month name, so it is the default. The solar
one pairs consecutive rashis of the Sun, offset so that Vasanta begins at Meena;
it is exposed for cross-checking. They disagree by up to a fortnight.

**Ayana.** Nirayana (sidereal), not sayana (tropical): Uttarayana runs from the
Sun's ingress into Makara to its ingress into Karka. This is the panchang
convention and is why Makar Sankranti sits on 14-15 January rather than on the
December solstice - the two have drifted apart by the ayanamsa, currently about
24 degrees or 24 days.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum

from core.angles import rashi_of
from core.enums import RITU_KEYS, Ayana, Graha
from core.ephemeris.adapter import Ephemeris
from core.timeutil import jd_from_utc


class RituConvention(StrEnum):
    LUNAR_MONTH_PAIRS = "lunar_month_pairs"
    SOLAR_RASHI_PAIRS = "solar_rashi_pairs"


@dataclass(frozen=True, slots=True)
class SolarContext:
    """Where the Sun is, in the terms a panchang header prints."""

    sidereal_lon: float
    rashi: int
    ritu_index: int
    ritu_key: str
    ritu_convention: RituConvention
    ayana: Ayana


def ritu_from_lunar_month(month_index: int) -> tuple[int, str]:
    """Ritu for a 0-based amanta month index. Chaitra and Vaishakha are Vasanta."""
    if not 0 <= month_index <= 11:
        raise ValueError(f"month index out of range: {month_index}")
    idx = month_index // 2
    return idx, RITU_KEYS[idx]


def ritu_from_sun_rashi(rashi: int) -> tuple[int, str]:
    """Ritu for the Sun's 1-based rashi. Vasanta begins at Meena (rashi 12)."""
    if not 1 <= rashi <= 12:
        raise ValueError(f"rashi out of range: {rashi}")
    # Meena (12) and Mesha (1) -> Vasanta; Vrishabha (2), Mithuna (3) -> Grishma; ...
    idx = ((rashi % 12) // 2) % 6
    return idx, RITU_KEYS[idx]


def ayana_for_sun(sidereal_lon: float) -> Ayana:
    """Uttarayana while the Sun is in Makara..Mithuna (270 deg through 90 deg)."""
    return Ayana.UTTARAYANA if sidereal_lon >= 270.0 or sidereal_lon < 90.0 else Ayana.DAKSHINAYANA


def solar_context(
    eph: Ephemeris,
    when: dt.datetime,
    month_index: int,
    convention: RituConvention = RituConvention.LUNAR_MONTH_PAIRS,
) -> SolarContext:
    """Assemble the solar header fields for a panchang day."""
    sun = eph.position(Graha.SUN, jd_from_utc(when))
    rashi = rashi_of(sun.sidereal_lon)
    if convention is RituConvention.LUNAR_MONTH_PAIRS:
        ritu_index, ritu_key = ritu_from_lunar_month(month_index)
    else:
        ritu_index, ritu_key = ritu_from_sun_rashi(rashi)
    return SolarContext(
        sidereal_lon=sun.sidereal_lon,
        rashi=rashi,
        ritu_index=ritu_index,
        ritu_key=ritu_key,
        ritu_convention=convention,
        ayana=ayana_for_sun(sun.sidereal_lon),
    )

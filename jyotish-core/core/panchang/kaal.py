"""Inauspicious and auspicious periods of the day.

All of these are proportional divisions of the *actual* daylight span at the
place, not clock-hour blocks: the day from sunrise to sunset is cut into eight
equal parts and a weekday-indexed part is named. So on a short December day in
Pune each part is about 80 minutes, and in June about 96 - which is why these
cannot be tabulated as fixed times (CLAUDE.md 3.2).

The weekday->part tables below are the ones in near-universal published use.
CLAUDE.md 3.2 marks the Rahu Kaal row ``[Likely]`` and says "Verify against the
authority; do not trust this table blind" - so the tables are marked
:data:`NEEDS_AUTHORITY_VERIFICATION` and carry golden cases in
``tests/golden/`` that will confirm or refute them once दाते पंचांग values are
transcribed. They have not yet been confirmed against the authority; see
``docs/DIVERGENCES.md``.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Final

from core.panchang.solar import DayLights
from core.types import Interval

#: These tables are published convention, not yet checked against दाते पंचांग.
NEEDS_AUTHORITY_VERIFICATION: Final[bool] = True

#: Number of equal parts the daylight span is divided into for the three kaals.
KAAL_PARTS: Final[int] = 8

#: Number of equal parts for muhurta divisions. Abhijit is the 8th of 15.
MUHURTA_PARTS: Final[int] = 15
ABHIJIT_PART: Final[int] = 8

#: 1-based part of the day, indexed by weekday with Sunday = 0.
RAHU_KAAL_PART: Final[tuple[int, ...]] = (8, 2, 7, 5, 6, 4, 3)
GULIKA_KAAL_PART: Final[tuple[int, ...]] = (7, 6, 5, 4, 3, 2, 1)
YAMAGANDA_PART: Final[tuple[int, ...]] = (5, 4, 3, 2, 1, 7, 6)


@dataclass(frozen=True, slots=True)
class DayPeriods:
    """The named periods of one Hindu day."""

    rahu_kaal: Interval
    gulika_kaal: Interval
    yamaganda: Interval
    abhijit_muhurta: Interval
    #: All eight parts, so a UI can shade the day strip without recomputing.
    parts: tuple[Interval, ...]


def _equal_part(lights: DayLights, part_1based: int, total_parts: int) -> Interval:
    """The ``part_1based`` of ``total_parts`` equal divisions of daylight."""
    if not 1 <= part_1based <= total_parts:
        raise ValueError(f"part {part_1based} out of range for {total_parts} parts")
    span = lights.sunset - lights.sunrise
    unit = span / total_parts
    start = lights.sunrise + unit * (part_1based - 1)
    return Interval(start=start, end=start + unit)


def rahu_kaal(lights: DayLights, vara_index: int) -> Interval:
    """राहूकाळ. Part of the day ruled by Rahu, by weekday."""
    return _equal_part(lights, RAHU_KAAL_PART[vara_index], KAAL_PARTS)


def gulika_kaal(lights: DayLights, vara_index: int) -> Interval:
    """गुलिक काळ (also Mandi). Part of the day attributed to Gulika."""
    return _equal_part(lights, GULIKA_KAAL_PART[vara_index], KAAL_PARTS)


def yamaganda(lights: DayLights, vara_index: int) -> Interval:
    """यमगंड. The third of the three inauspicious daily parts."""
    return _equal_part(lights, YAMAGANDA_PART[vara_index], KAAL_PARTS)


def abhijit_muhurta(lights: DayLights) -> Interval:
    """अभिजित मुहूर्त. The 8th of 15 equal daytime divisions - the one
    straddling local apparent noon, and the only muhurta held auspicious
    regardless of weekday."""
    return _equal_part(lights, ABHIJIT_PART, MUHURTA_PARTS)


def compute_day_periods(lights: DayLights, vara_index: int) -> DayPeriods:
    """All named periods for a day whose lights and vara are already known."""
    if not 0 <= vara_index <= 6:
        raise ValueError(f"vara_index must be 0-6 (Sunday = 0), got {vara_index}")
    return DayPeriods(
        rahu_kaal=rahu_kaal(lights, vara_index),
        gulika_kaal=gulika_kaal(lights, vara_index),
        yamaganda=yamaganda(lights, vara_index),
        abhijit_muhurta=abhijit_muhurta(lights),
        parts=tuple(_equal_part(lights, p, KAAL_PARTS) for p in range(1, KAAL_PARTS + 1)),
    )


def hora_at(lights: DayLights, when: dt.datetime, vara_index: int) -> int:
    """0-based planetary hora index from sunrise, in the classical 24-hora day.

    Horas are unequal: the twelve day horas each span 1/12 of daylight and the
    twelve night horas 1/12 of the night. Returned as an index so the caller can
    map it through the Chaldean order; used by Kaala bala.
    """
    if when < lights.sunrise or when >= lights.next_sunrise:
        raise ValueError("instant lies outside the Hindu day")
    if when < lights.sunset:
        unit = (lights.sunset - lights.sunrise) / 12
        return int((when - lights.sunrise) / unit)
    unit = (lights.next_sunrise - lights.sunset) / 12
    return 12 + int((when - lights.sunset) / unit)

"""The five limbs (पंचांग = five limbs): tithi, vara, nakshatra, yoga, karana.

Each limb is reported as the division *running at a given instant*, with its own
start and end. CLAUDE.md 4.3 is the reason the API is shaped this way: the
headline tithi of the day (the one at sunrise) and the tithi at the moment of
birth are different quantities and must both be reportable, separately labelled.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from core.angles import (
    DEG_PER_KARANA,
    DEG_PER_NAKSHATRA,
    DEG_PER_TITHI,
    nakshatra_fraction,
    pada_of,
)
from core.enums import (
    KARANA_KEYS,
    KRISHNA_15_KEY,
    NAKSHATRA_KEYS,
    TITHI_KEYS,
    VARA_KEYS,
    VARA_LORD,
    YOGA_KEYS,
    Graha,
    Paksha,
    nakshatra_lord,
)
from core.ephemeris.adapter import Ephemeris
from core.panchang.solver import (
    DrivingAngle,
    elongation,
    index_and_bounds,
    longitude_sum,
    moon_longitude,
)
from core.timeutil import jd_from_utc

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TithiState:
    """One of the 30 lunar days of an amanta month."""

    index: int  # 1-30 across the whole lunar month
    key: str  # e.g. "panchami", "purnima", "amavasya"
    paksha: Paksha
    number_in_paksha: int  # 1-15
    start_utc: dt.datetime
    end_utc: dt.datetime


@dataclass(frozen=True, slots=True)
class NakshatraState:
    """Moon's nakshatra, its pada, and its Vimshottari lord."""

    index: int  # 1-27
    key: str
    pada: int  # 1-4
    lord: Graha
    fraction_elapsed: float  # [0, 1) - the Vimshottari dasha balance key
    start_utc: dt.datetime
    end_utc: dt.datetime


@dataclass(frozen=True, slots=True)
class YogaState:
    index: int  # 1-27
    key: str
    start_utc: dt.datetime
    end_utc: dt.datetime


@dataclass(frozen=True, slots=True)
class KaranaState:
    index: int  # 1-60 (half-tithi ordinal within the lunar month)
    key: str
    start_utc: dt.datetime
    end_utc: dt.datetime


@dataclass(frozen=True, slots=True)
class VaraState:
    """Weekday of the Hindu day. Boundary is sunrise, not midnight."""

    index: int  # 0 = Sunday
    key: str
    lord: Graha


# ---------------------------------------------------------------------------
# Limbs
# ---------------------------------------------------------------------------


def tithi_at(eph: Ephemeris, when: dt.datetime) -> TithiState:
    """Tithi running at ``when``, from ``(moon - sun) / 12 deg``."""
    idx0, start, end = index_and_bounds(elongation(eph), DEG_PER_TITHI, jd_from_utc(when))
    return _tithi_from_index(idx0, start, end)


def _tithi_from_index(idx0: int, start: dt.datetime, end: dt.datetime) -> TithiState:
    paksha = Paksha.SHUKLA if idx0 < 15 else Paksha.KRISHNA
    in_paksha = idx0 % 15  # 0-14
    key = TITHI_KEYS[in_paksha]
    if paksha is Paksha.KRISHNA and in_paksha == 14:
        # The 15th krishna tithi is Amavasya, not Purnima.
        key = KRISHNA_15_KEY
    return TithiState(
        index=idx0 + 1,
        key=key,
        paksha=paksha,
        number_in_paksha=in_paksha + 1,
        start_utc=start,
        end_utc=end,
    )


def nakshatra_at(eph: Ephemeris, when: dt.datetime) -> NakshatraState:
    """Moon's nakshatra and pada at ``when``, from ``moon / 13 deg 20'``."""
    jd = jd_from_utc(when)
    angle = moon_longitude(eph)
    idx0, start, end = index_and_bounds(angle, DEG_PER_NAKSHATRA, jd)
    moon_lon = angle(jd).value
    return NakshatraState(
        index=idx0 + 1,
        key=NAKSHATRA_KEYS[idx0],
        pada=pada_of(moon_lon),
        lord=nakshatra_lord(idx0 + 1),
        fraction_elapsed=nakshatra_fraction(moon_lon),
        start_utc=start,
        end_utc=end,
    )


def yoga_at(eph: Ephemeris, when: dt.datetime) -> YogaState:
    """Yoga running at ``when``, from ``(sun + moon) / 13 deg 20'``."""
    idx0, start, end = index_and_bounds(longitude_sum(eph), DEG_PER_NAKSHATRA, jd_from_utc(when))
    return YogaState(index=idx0 + 1, key=YOGA_KEYS[idx0], start_utc=start, end_utc=end)


def karana_at(eph: Ephemeris, when: dt.datetime) -> KaranaState:
    """Karana running at ``when``: the 60 half-tithis mapped to 11 names.

    The mapping is not uniform. Half-tithi 1 is the fixed Kimstughna; halves
    2-57 are the seven movable karanas Bava..Vishti repeating eight times; halves
    58, 59 and 60 are the fixed Shakuni, Chatushpada and Naga.
    ``1 + 56 + 3 = 60``.
    """
    idx0, start, end = index_and_bounds(elongation(eph), DEG_PER_KARANA, jd_from_utc(when))
    return KaranaState(
        index=idx0 + 1, key=KARANA_KEYS[_karana_name_index(idx0)], start_utc=start, end_utc=end
    )


def _karana_name_index(half_tithi_0based: int) -> int:
    """Map a 0-based half-tithi (0-59) onto an index into ``KARANA_KEYS``."""
    h = half_tithi_0based
    if h == 0:
        return 0  # kimstughna
    if h <= 56:
        return ((h - 1) % 7) + 1  # bava .. vishti
    return h - 49  # 57 -> 8 shakuni, 58 -> 9 chatushpada, 59 -> 10 naga


def vara_for_hindu_day(hindu_civil_date: dt.date) -> VaraState:
    """Weekday of the Hindu day that *began* on ``hindu_civil_date``.

    The caller must already have rolled a pre-dawn instant back a day via
    :func:`core.panchang.solar.resolve_hindu_date`; this function only names the
    weekday it is given (CLAUDE.md N4, 4.2).

    ``date.weekday()`` counts Monday as 0; the vara list counts Sunday as 0.
    """
    index = (hindu_civil_date.weekday() + 1) % 7
    return VaraState(index=index, key=VARA_KEYS[index], lord=VARA_LORD[index])


# ---------------------------------------------------------------------------
# Sequences across a Hindu day
# ---------------------------------------------------------------------------


#: The probe offset used when walking a day's divisions. Each boundary is solved
#: to ~1e-8 deg, so a cursor placed exactly on a boundary can land a hair *below*
#: it and re-select the division just ended. Probing one second past the cursor
#: steps over that, and is four orders of magnitude shorter than the briefest
#: division in play (a karana runs at least ~10h 45m).
_PROBE_NUDGE = dt.timedelta(seconds=1)


def _sequence(
    angle: DrivingAngle,
    step_deg: float,
    day_start: dt.datetime,
    day_end: dt.datetime,
) -> list[tuple[int, dt.datetime, dt.datetime]]:
    """Raw ``(index0, start, end)`` triples for every division touching the day.

    A printed panchang lists the limb running at sunrise plus any that begin
    before the next sunrise, which is what this enumerates.
    """
    out: list[tuple[int, dt.datetime, dt.datetime]] = []
    cursor = day_start
    while cursor < day_end:
        idx0, start, end = index_and_bounds(angle, step_deg, jd_from_utc(cursor + _PROBE_NUDGE))
        if out:
            # Adjacency by construction. The boundary between two divisions gets
            # solved twice - once as the end of one and once as the start of the
            # next - and the two solutions can differ by a few tens of
            # microseconds within the solver's 1e-8 deg tolerance. Reusing the
            # previous end makes the sequence exactly contiguous, so a consumer
            # can treat it as a partition rather than as intervals that nearly
            # touch.
            start = out[-1][2]
        out.append((idx0, start, end))
        if end <= cursor:  # pragma: no cover - defensive against a stalled solve
            raise RuntimeError(f"limb sequence stalled at {cursor}")
        cursor = end
    return out


def tithis_in_day(eph: Ephemeris, day_start: dt.datetime, day_end: dt.datetime) -> list[TithiState]:
    """Every tithi touching the Hindu day, in order. Usually one, sometimes two.

    Two entries means a tithi began after sunrise and before the next sunrise -
    the condition that makes the *following* tithi a candidate kshaya tithi.
    """
    return [
        _tithi_from_index(idx0, start, end)
        for idx0, start, end in _sequence(elongation(eph), DEG_PER_TITHI, day_start, day_end)
    ]


def nakshatras_in_day(
    eph: Ephemeris, day_start: dt.datetime, day_end: dt.datetime
) -> list[NakshatraState]:
    """Every nakshatra touching the Hindu day, in order."""
    angle = moon_longitude(eph)
    out: list[NakshatraState] = []
    for idx0, start, end in _sequence(angle, DEG_PER_NAKSHATRA, day_start, day_end):
        # Sample just inside the division so pada/fraction belong to it.
        probe = max(start, day_start)
        lon = angle(jd_from_utc(probe)).value
        out.append(
            NakshatraState(
                index=idx0 + 1,
                key=NAKSHATRA_KEYS[idx0],
                pada=pada_of(lon),
                lord=nakshatra_lord(idx0 + 1),
                fraction_elapsed=nakshatra_fraction(lon),
                start_utc=start,
                end_utc=end,
            )
        )
    return out


def yogas_in_day(eph: Ephemeris, day_start: dt.datetime, day_end: dt.datetime) -> list[YogaState]:
    """Every yoga touching the Hindu day, in order."""
    return [
        YogaState(index=idx0 + 1, key=YOGA_KEYS[idx0], start_utc=start, end_utc=end)
        for idx0, start, end in _sequence(longitude_sum(eph), DEG_PER_NAKSHATRA, day_start, day_end)
    ]


def karanas_in_day(
    eph: Ephemeris, day_start: dt.datetime, day_end: dt.datetime
) -> list[KaranaState]:
    """Every karana touching the Hindu day, in order. Typically two or three."""
    return [
        KaranaState(
            index=idx0 + 1, key=KARANA_KEYS[_karana_name_index(idx0)], start_utc=start, end_utc=end
        )
        for idx0, start, end in _sequence(elongation(eph), DEG_PER_KARANA, day_start, day_end)
    ]

"""Sunrise, sunset, moonrise, moonset.

The disc/refraction convention is the single largest source of minute-level
drift against a published panchang (CLAUDE.md 3.2), so it is never implicit: it
travels in :class:`~core.types.EngineOptions` and is echoed into ChartFacts.
See ``docs/SUNRISE_CONVENTION.md``.

Moonrise and moonset legitimately do not occur on some days - the Moon rises
roughly 50 minutes later each day, so about once a month a civil day contains no
moonrise. Those return ``None``. A *missing sunrise* is different: it means the
place is inside a polar day or night, and callers must not proceed to compute a
vara or Ishtakaal from it, so it raises.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from core.enums import Graha
from core.ephemeris.adapter import (
    CircumpolarError,
    DiscConvention,
    Ephemeris,
    RiseSetEvent,
    sunrise_convention_for_altitude,
)
from core.timeutil import jd_from_utc
from core.types import EngineOptions, Place


@dataclass(frozen=True, slots=True)
class DayLights:
    """Rise/set instants bracketing one Hindu day at one place.

    ``next_sunrise`` closes the day: the Hindu day runs sunrise to sunrise
    (CLAUDE.md N4), so every "during the day" computation - Rahu Kaal, Ishtakaal,
    vriddhi/kshaya detection - needs both ends.
    """

    sunrise: dt.datetime
    sunset: dt.datetime
    next_sunrise: dt.datetime
    moonrise: dt.datetime | None
    moonset: dt.datetime | None
    convention: DiscConvention

    @property
    def day_length_minutes(self) -> float:
        """Sunrise to sunset, in minutes. The base for the eight kaal parts."""
        return (self.sunset - self.sunrise).total_seconds() / 60.0

    @property
    def hindu_day_length_minutes(self) -> float:
        """Sunrise to next sunrise, in minutes. Rarely exactly 1440."""
        return (self.next_sunrise - self.sunrise).total_seconds() / 60.0


def _search_start(date: dt.date, place: Place) -> float:
    """Julian Day of local midnight beginning ``date`` at ``place``.

    Rise/set searches run forward from here, so "sunrise on date D" is
    unambiguously the first sunrise after local midnight of D - not the first
    after 00:00 UTC, which for India would be 05:30 local and would skip the
    sunrise entirely.
    """
    local_midnight = dt.datetime.combine(date, dt.time(0, 0), tzinfo=ZoneInfo(place.iana_tz))
    return jd_from_utc(local_midnight)


def sunrise_on(
    eph: Ephemeris, date: dt.date, place: Place, options: EngineOptions | None = None
) -> dt.datetime:
    """First sunrise after local midnight beginning ``date``.

    Raises :class:`~core.ephemeris.adapter.CircumpolarError` where the Sun does
    not cross the horizon that day.
    """
    opts = options or EngineOptions()
    return eph.rise_set(
        RiseSetEvent.RISE,
        Graha.SUN,
        _search_start(date, place),
        place.latitude,
        place.longitude,
        place.elevation_m,
        sunrise_convention_for_altitude(opts.rise_set_altitude_deg),
    )


def compute_day_lights(
    eph: Ephemeris, date: dt.date, place: Place, options: EngineOptions | None = None
) -> DayLights:
    """All four rise/set instants for ``date``, plus the following sunrise."""
    opts = options or EngineOptions()
    convention = sunrise_convention_for_altitude(opts.rise_set_altitude_deg)
    start_jd = _search_start(date, place)

    sunrise = eph.rise_set(
        RiseSetEvent.RISE,
        Graha.SUN,
        start_jd,
        place.latitude,
        place.longitude,
        place.elevation_m,
        convention,
    )
    # Sunset is searched from sunrise, not from midnight, so that a place where
    # the previous day's sunset falls after local midnight cannot be picked up.
    sunset = eph.rise_set(
        RiseSetEvent.SET,
        Graha.SUN,
        jd_from_utc(sunrise),
        place.latitude,
        place.longitude,
        place.elevation_m,
        convention,
    )
    next_sunrise = eph.rise_set(
        RiseSetEvent.RISE,
        Graha.SUN,
        jd_from_utc(sunset),
        place.latitude,
        place.longitude,
        place.elevation_m,
        convention,
    )

    return DayLights(
        sunrise=sunrise,
        sunset=sunset,
        next_sunrise=next_sunrise,
        moonrise=_optional_event(
            eph, RiseSetEvent.RISE, Graha.MOON, sunrise, next_sunrise, place, convention
        ),
        moonset=_optional_event(
            eph, RiseSetEvent.SET, Graha.MOON, sunrise, next_sunrise, place, convention
        ),
        convention=convention,
    )


def _optional_event(
    eph: Ephemeris,
    event: RiseSetEvent,
    body: Graha,
    window_start: dt.datetime,
    window_end: dt.datetime,
    place: Place,
    convention: DiscConvention,
) -> dt.datetime | None:
    """A moon event inside the Hindu day, or ``None`` if it falls outside it."""
    try:
        found = eph.rise_set(
            event,
            body,
            jd_from_utc(window_start),
            place.latitude,
            place.longitude,
            place.elevation_m,
            convention,
        )
    except CircumpolarError:
        return None
    return found if found < window_end else None


def resolve_hindu_date(
    eph: Ephemeris,
    civil_date: dt.date,
    birth_utc: dt.datetime,
    place: Place,
    options: EngineOptions | None = None,
) -> tuple[dt.date, DayLights]:
    """Roll a pre-dawn birth back to the previous Hindu day (CLAUDE.md 4.2).

    "A birth at 02:30 on 5 Shravan belongs to the vara and tithi of the 4th."
    Returns the Hindu day's civil date together with that day's lights, so the
    caller never has to recompute sunrise.
    """
    lights = compute_day_lights(eph, civil_date, place, options)
    if birth_utc >= lights.sunrise:
        return civil_date, lights
    previous = civil_date - dt.timedelta(days=1)
    return previous, compute_day_lights(eph, previous, place, options)

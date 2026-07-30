"""Time handling: Julian Day, timezone resolution, historical offsets.

CLAUDE.md 4.7: timestamps are stored UTC-aware and converted only at the
presentation edge. CLAUDE.md 4.1: never apply a fixed +05:30 to an Indian birth
time - localise the naive datetime with ``zoneinfo`` *at its own date* so the
historical Bombay/Calcutta/wartime-DST transitions in tzdata are honoured.

Julian Day is computed here rather than via ``swe.julday`` so that no module
outside ``core/ephemeris/`` touches the Swiss Ephemeris binding (CLAUDE.md 2.1).
"""

from __future__ import annotations

import datetime as dt
import math
from zoneinfo import ZoneInfo

from core.enums import TimeStandard

#: Julian Day of the Unix epoch, and of J2000.0.
JD_UNIX_EPOCH = 2440587.5
JD_J2000 = 2451545.0

SECONDS_PER_DAY = 86400.0

#: Precision floor of a Julian Day held in a float64, in seconds.
#:
#: A contemporary JD is ~2.46e6, and float64 carries ~2.2e-16 relative precision,
#: so one ulp is ~5.5e-10 days ~= 48 microseconds. A JD round trip therefore
#: cannot be exact, and :func:`utc_from_jd` after :func:`jd_from_utc` may differ
#: from its input by a few tens of microseconds.
#:
#: This is documented rather than worked around because it is seven orders of
#: magnitude below the one-minute tolerance the golden files assert
#: (CLAUDE.md 9.1), and roughly nine below the fastest quantity in the engine
#: (the yoga sum advances ~16.4 deg/day, so 48 microseconds is 9e-9 degrees).
#: Anything demanding better would need a two-part (integer day + fraction) JD,
#: which would complicate every ephemeris call for no observable gain.
JD_FLOAT_RESOLUTION_SECONDS = 5e-5

#: Gregorian calendar adoption in Britain and its colonies, including India:
#: 1752-09-14 is the first Gregorian day. Dates before this are ambiguous unless
#: the caller states which calendar the record used (CLAUDE.md 3.1).
GREGORIAN_ADOPTION_BRITISH = dt.date(1752, 9, 14)


class TimeError(ValueError):
    """Raised for time input that cannot be interpreted unambiguously."""


# ---------------------------------------------------------------------------
# Julian Day
# ---------------------------------------------------------------------------


def jd_from_utc(when: dt.datetime) -> float:
    """Julian Day (UT) from a timezone-aware UTC datetime, proleptic Gregorian.

    Uses the standard Meeus algorithm rather than ``datetime.toordinal`` so that
    the proleptic branch is explicit and testable against Julian-calendar dates.
    """
    if when.tzinfo is None:
        raise TimeError("jd_from_utc requires a timezone-aware datetime")
    u = when.astimezone(dt.UTC)
    day_fraction = (
        u.hour / 24.0
        + u.minute / 1440.0
        + (u.second + u.microsecond / 1_000_000.0) / SECONDS_PER_DAY
    )
    return _jd_from_ymd(u.year, u.month, u.day + day_fraction, gregorian=True)


def _jd_from_ymd(year: int, month: int, day: float, *, gregorian: bool) -> float:
    """Meeus, *Astronomical Algorithms* ch. 7. ``day`` may carry a fraction."""
    y, m = (year, month) if month > 2 else (year - 1, month + 12)
    if gregorian:
        a = int(y / 100) if y >= 0 else -int((-y + 99) / 100)
        b = 2 - a + int(a / 4)
    else:
        b = 0
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + day + b - 1524.5


def utc_from_jd(jd: float) -> dt.datetime:
    """Inverse of :func:`jd_from_utc`. Returns a UTC-aware datetime.

    Rounds to whole microseconds; the residual is below any panchang tolerance.
    """
    unix_seconds = (jd - JD_UNIX_EPOCH) * SECONDS_PER_DAY
    # Round to microseconds before constructing to avoid 23:59:59.999999 drift.
    micro = round(unix_seconds * 1_000_000)
    return dt.datetime(1970, 1, 1, tzinfo=dt.UTC) + dt.timedelta(microseconds=micro)


def jd_from_date_midnight_utc(date: dt.date) -> float:
    """Julian Day of 00:00 UTC on ``date``."""
    return _jd_from_ymd(date.year, date.month, float(date.day), gregorian=True)


# ---------------------------------------------------------------------------
# Timezone and historical offsets
# ---------------------------------------------------------------------------


def localise(naive: dt.datetime, iana_tz: str) -> dt.datetime:
    """Attach ``iana_tz`` to a naive local datetime at *its own date*.

    This is the load-bearing call for CLAUDE.md 4.1. ``zoneinfo`` looks the
    offset up in tzdata for that instant, so a 1948 Pune birth gets the offset
    actually in force then (Asia/Kolkata carried +05:30 from 1945-10-15, and
    +05:30/+06:30 wartime DST before that), not today's +05:30.
    """
    if naive.tzinfo is not None:
        raise TimeError("localise expects a naive datetime")
    return naive.replace(tzinfo=ZoneInfo(iana_tz))


def lmt_offset_seconds(longitude_deg: float) -> int:
    """Local Mean Time offset from UT for a longitude, in whole seconds.

    4 minutes of time per degree of longitude. Used when a birth record states
    LMT rather than a civil clock time (CLAUDE.md 4.1).
    """
    return round(longitude_deg * 240.0)


def to_utc(
    naive_local: dt.datetime,
    *,
    iana_tz: str,
    longitude_deg: float,
    standard: TimeStandard,
) -> tuple[dt.datetime, int]:
    """Convert a recorded local birth datetime to UTC.

    Returns ``(utc_datetime, applied_offset_seconds)``. The applied offset is
    echoed into ChartFacts so the reader can see exactly what was assumed
    (CLAUDE.md 5, ``input.resolved tz and offset actually applied``).
    """
    if naive_local.tzinfo is not None:
        raise TimeError("to_utc expects a naive local datetime")

    match standard:
        case TimeStandard.LMT:
            offset = lmt_offset_seconds(longitude_deg)
            aware = naive_local.replace(tzinfo=dt.timezone(dt.timedelta(seconds=offset)))
        case TimeStandard.IST:
            offset = 19800  # exactly +05:30, no historical lookup
            aware = naive_local.replace(tzinfo=dt.timezone(dt.timedelta(seconds=offset)))
        case TimeStandard.CLOCK_TIME_AS_RECORDED:
            aware = localise(naive_local, iana_tz)
            utcoff = aware.utcoffset()
            if utcoff is None:  # pragma: no cover - ZoneInfo always yields one
                raise TimeError(f"timezone {iana_tz} produced no offset")
            offset = int(utcoff.total_seconds())

    return aware.astimezone(dt.UTC), offset


def is_pre_gregorian_british(date: dt.date) -> bool:
    """True if ``date`` precedes British/Indian Gregorian adoption."""
    return date < GREGORIAN_ADOPTION_BRITISH


# ---------------------------------------------------------------------------
# Sidereal time
# ---------------------------------------------------------------------------


def greenwich_mean_sidereal_time_deg(jd_ut: float) -> float:
    """Greenwich Mean Sidereal Time in degrees (IAU 1982 series, Meeus 12.4).

    Mean, not apparent: the equation of the equinoxes is added by the ephemeris
    adapter, which owns nutation.
    """
    t = (jd_ut - JD_J2000) / 36525.0
    theta = (
        280.46061837
        + 360.98564736629 * (jd_ut - JD_J2000)
        + 0.000387933 * t * t
        - (t * t * t) / 38710000.0
    )
    return theta % 360.0


def local_mean_sidereal_time_deg(jd_ut: float, longitude_deg: float) -> float:
    """LMST in degrees for an east-positive geographic longitude."""
    return (greenwich_mean_sidereal_time_deg(jd_ut) + longitude_deg) % 360.0


# ---------------------------------------------------------------------------
# Small formatting helpers used by tools/ and tests
# ---------------------------------------------------------------------------


def iso_utc(when: dt.datetime | None) -> str | None:
    """Render a UTC-aware datetime as an ISO-8601 ``Z`` string, or None."""
    if when is None:
        return None
    return when.astimezone(dt.UTC).isoformat().replace("+00:00", "Z")


def local_hm(when: dt.datetime, iana_tz: str) -> str:
    """Render an instant as ``HH:MM`` in a target timezone, for delta tables."""
    return when.astimezone(ZoneInfo(iana_tz)).strftime("%H:%M")


def minutes_between(a: dt.datetime, b: dt.datetime) -> float:
    """Signed difference ``a - b`` in minutes. Golden deltas are reported in
    minutes because that is the resolution a printed panchang publishes."""
    return (a - b).total_seconds() / 60.0

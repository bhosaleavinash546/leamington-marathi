"""Value types crossing ``core/`` module boundaries.

Plain frozen dataclasses, not Pydantic models: ``core/`` must import nothing
from the API layer (CLAUDE.md 1). The FastAPI layer defines its own Pydantic
``BirthInput`` and converts into :class:`BirthData` here.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field, replace
from typing import Final

from core.enums import (
    CalendarVariant,
    Gender,
    NodeType,
    TimeAccuracy,
    TimeStandard,
    YearLength,
)

#: Beyond this latitude the Sun can stay below or above the horizon for a whole
#: day, so sunrise - and therefore vara, headline tithi and Ishtakaal - is
#: undefined on some dates (CLAUDE.md 3.1).
POLAR_WARN_LATITUDE = 66.5

#: The IANA zones covering India. Both names denote the same zone; `Asia/Calcutta`
#: is the older alias and turns up in older records and databases.
INDIAN_ZONES: Final[frozenset[str]] = frozenset({"Asia/Kolkata", "Asia/Calcutta"})

#: Bombay kept Bombay Time until 1955 and Calcutta kept Calcutta Time until 1948,
#: so a civil clock time recorded in India before this date may be any of three
#: standards. From here on IST is the only one in use. See
#: :attr:`BirthData.pre_1955_clock_time_is_ambiguous` and audit F-004.
INDIAN_CIVIL_TIME_UNIFIED: Final[dt.date] = dt.date(1955, 1, 1)

#: IST, as a number of seconds. Used only to size the gap against local mean time,
#: never to convert - conversion goes through `zoneinfo` (CLAUDE.md 2.2).
IST_OFFSET_SECONDS: Final[int] = 19_800

#: How far local mean time must sit from IST before the pre-1955 ambiguity is
#: worth reporting. Five minutes is about 1.25 deg of lagna; below that the doubt
#: cannot move a rashi or a pada and the warning would be noise. At 82.5 deg E -
#: the IST meridian - the gap is zero and nothing is reported.
PRE_1955_LMT_GAP_WARN_SECONDS: Final[int] = 300


class InputError(ValueError):
    """Raised loudly for silently-wrong input (CLAUDE.md 3.1)."""


@dataclass(frozen=True, slots=True)
class Place:
    """A birth place. Longitude is east-positive, latitude north-positive."""

    name: str
    latitude: float
    longitude: float
    iana_tz: str
    elevation_m: float = 0.0

    def __post_init__(self) -> None:
        if not -90.0 <= self.latitude <= 90.0:
            raise InputError(f"latitude out of range: {self.latitude}")
        if not -180.0 <= self.longitude <= 180.0:
            raise InputError(f"longitude out of range: {self.longitude}")
        if not -500.0 <= self.elevation_m <= 9000.0:
            raise InputError(f"elevation implausible: {self.elevation_m} m")
        if not self.iana_tz:
            raise InputError("iana_tz is required; offsets are never hand-coded")

    @property
    def is_polar(self) -> bool:
        """True where sunrise/sunset may be undefined for part of the year."""
        return abs(self.latitude) > POLAR_WARN_LATITUDE


@dataclass(frozen=True, slots=True)
class EngineOptions:
    """Every computational-school choice the engine can make, in one place.

    Defaults are the documented decisions in ``docs/DECISIONS.md``. Changing a
    default is a major engine version bump (CLAUDE.md 4.5).
    """

    ayanamsa: str = "lahiri"
    #: Whether the ayanamsa is measured from the *true* (nutated) equinox of date.
    #:
    #: True means the sidereal longitude is referred to the true equinox, which is
    #: what Swiss Ephemeris' own ``FLG_SIDEREAL`` mode produces and what most
    #: Vedic software reports. False refers it to the mean equinox instead.
    #:
    #: The two differ by the nutation in longitude: ~12.8 arcseconds at the 1990
    #: epoch, oscillating to about +/-17 arcseconds over the 18.6-year nodal cycle.
    #:
    #: Which panchang limbs that moves follows from what each is a function of,
    #: and it is not uniform (measured for Pune 1990-06-15, pinned by
    #: ``test_nutation_cancels_in_the_elongation_limbs``):
    #:
    #: * **tithi and karana: exactly zero.** Both are functions of the elongation
    #:   Moon - Sun, and the ayanamsa subtracts from both terms, so it cancels
    #:   identically. Not "small" - algebraically absent.
    #: * **nakshatra: ~23 seconds**, being a function of the Moon's longitude alone.
    #: * **yoga: ~44 seconds**, because it is the *sum* of the two longitudes and so
    #:   carries twice the shift.
    #: * **sunrise and every value anchored to it: zero.** Rise times are computed
    #:   from the Sun's altitude, which no ayanamsa touches.
    #:
    #: All are inside the one-minute golden tolerance, so this cannot flip a
    #: published panchang time - but it can move a graha across a pada or D60
    #: boundary it sits within 12.8 arcseconds of.
    #:
    #: Default True so that this engine's own conversion and the provider's
    #: internal one agree, which is checked in
    #: ``tests/invariants/test_cross_implementation.py``. See docs/DECISIONS.md D13.
    ayanamsa_includes_nutation: bool = True
    node_type: NodeType = NodeType.MEAN
    calendar_variant: CalendarVariant = CalendarVariant.AMANTA
    dasha_year_length: YearLength = YearLength.SOLAR_365_2425
    #: Solar altitude of the disc reference at rise/set, in degrees. -0.8333
    #: (= -50') is upper-limb-with-standard-refraction, the drik-ganit panchang
    #: convention. See docs/SUNRISE_CONVENTION.md.
    rise_set_altitude_deg: float = -50.0 / 60.0
    #: Refraction is folded into rise_set_altitude_deg above; when True the
    #: adapter additionally applies its own atmospheric model.
    apply_refraction: bool = True
    mangal_dosha_ruleset: str = "maharashtra"


@dataclass(frozen=True, slots=True)
class BirthData:
    """Resolved birth input. All ambiguity has already been settled here.

    ``time`` is ``None`` for an unknown birth time; the caller must then degrade
    per CLAUDE.md 4.6 rather than defaulting to noon.
    """

    name: str
    date: dt.date
    time: dt.time | None
    place: Place
    time_accuracy: TimeAccuracy = TimeAccuracy.EXACT
    time_standard: TimeStandard = TimeStandard.CLOCK_TIME_AS_RECORDED
    gender: Gender | None = None
    options: EngineOptions = field(default_factory=EngineOptions)

    def __post_init__(self) -> None:
        if self.time is None and self.time_accuracy is not TimeAccuracy.UNKNOWN:
            raise InputError(
                "time is None but time_accuracy is not 'unknown'; "
                "do not silently default an unknown birth time (CLAUDE.md 4.6)"
            )
        if self.time is not None and self.time_accuracy is TimeAccuracy.UNKNOWN:
            raise InputError("time_accuracy 'unknown' contradicts a supplied time")

    @property
    def has_time(self) -> bool:
        return self.time is not None

    @property
    def warnings(self) -> tuple[str, ...]:
        """Machine keys for conditions the UI must surface, not prose."""
        out: list[str] = []
        if self.place.is_polar:
            out.append("polar_latitude_sunrise_may_be_undefined")
        if self.time is None:
            out.append("birth_time_unknown_time_dependent_fields_suppressed")
        elif self.time_accuracy is not TimeAccuracy.EXACT:
            out.append("birth_time_approximate_fields_may_vary_within_window")
        from core.timeutil import is_pre_gregorian_british

        if is_pre_gregorian_british(self.date):
            out.append("date_precedes_gregorian_adoption_confirm_calendar")
        if self.pre_1955_clock_time_is_ambiguous:
            out.append("pre_1955_indian_clock_time_ambiguous")
        return tuple(out)

    @property
    def pre_1955_clock_time_is_ambiguous(self) -> bool:
        """Whether a recorded Indian clock time predates a single civil standard.

        CLAUDE.md 4.1 says ``zoneinfo`` with ``Asia/Kolkata`` "handles documented
        transitions". For the Madras/Calcutta lineage and for wartime DST it does.
        **For Bombay it cannot**: Bombay kept Bombay Time (~UTC+04:51) until 1955
        and IANA has no zone for it, because IANA distinguishes places by their
        post-1970 behaviour and India has been one zone throughout. Asking
        ``Asia/Kolkata`` for 1948 Mumbai returns +05:30 and is 39 minutes out.

        The engine cannot resolve the ambiguity, and must not pretend to: a 1948
        Bombay certificate may record Bombay Time *or* IST, since the railways and
        the government used IST while the city did not. Only whoever holds the
        record knows. So this reports the doubt rather than silently picking, and
        ``TimeStandard.LMT`` is the escape hatch - Bombay Time *was* Bombay's local
        mean time, so the engine already has the right instrument and no offset
        needs hard-coding (CLAUDE.md 2.2).

        Nothing is flagged once the caller has declared a standard, and nothing is
        flagged where the gap is immaterial - at 82.5 deg E, the IST meridian, there
        is no ambiguity to report.
        """
        from core.timeutil import lmt_offset_seconds

        if self.time is None or self.time_standard is not TimeStandard.CLOCK_TIME_AS_RECORDED:
            return False
        if self.date >= INDIAN_CIVIL_TIME_UNIFIED or self.place.iana_tz not in INDIAN_ZONES:
            return False
        gap = abs(lmt_offset_seconds(self.place.longitude) - IST_OFFSET_SECONDS)
        return gap >= PRE_1955_LMT_GAP_WARN_SECONDS

    def with_time(self, new_time: dt.time) -> BirthData:
        """Copy with a substituted clock time, for time-window bound runs."""
        accuracy = (
            TimeAccuracy.EXACT if self.time_accuracy is TimeAccuracy.UNKNOWN else self.time_accuracy
        )
        return replace(self, time=new_time, time_accuracy=accuracy)


#: Half-width in minutes of the uncertainty window implied by each accuracy
#: level. Used by the bounds run in CLAUDE.md 4.6.
ACCURACY_WINDOW_MINUTES: dict[TimeAccuracy, int] = {
    TimeAccuracy.EXACT: 0,
    TimeAccuracy.APPROX_15MIN: 15,
    TimeAccuracy.APPROX_1HR: 60,
    TimeAccuracy.UNKNOWN: 0,
}


@dataclass(frozen=True, slots=True)
class Interval:
    """A closed time interval in UTC. ``start``/``end`` may be None where the
    boundary falls outside the computed window (e.g. a tithi that began before
    the search span)."""

    start: dt.datetime | None
    end: dt.datetime | None

    def contains(self, when: dt.datetime) -> bool:
        if self.start is not None and when < self.start:
            return False
        return not (self.end is not None and when >= self.end)

    @property
    def duration_minutes(self) -> float | None:
        if self.start is None or self.end is None:
            return None
        return (self.end - self.start).total_seconds() / 60.0

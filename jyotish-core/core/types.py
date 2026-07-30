"""Value types crossing ``core/`` module boundaries.

Plain frozen dataclasses, not Pydantic models: ``core/`` must import nothing
from the API layer (CLAUDE.md 1). The FastAPI layer defines its own Pydantic
``BirthInput`` and converts into :class:`BirthData` here.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field, replace

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
        return tuple(out)

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

"""Pydantic v2 request and response models.

CLAUDE.md 3.1 gives the input contract; this is it, plus the validation CLAUDE.md
3.1 demands: "Reject silently-wrong input loudly."

Pydantic lives here and **not** in ``core/``. The engine's own input type is a
frozen dataclass (:class:`core.types.BirthData`); :meth:`BirthInput.to_engine`
converts. That is what keeps `core/` free of a web-framework dependency
(CLAUDE.md 1), and a test asserts it.
"""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Any, Literal, Self
from zoneinfo import ZoneInfo, available_timezones

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core.enums import (
    CalendarVariant,
    Gender,
    NodeType,
    TimeAccuracy,
    TimeStandard,
    YearLength,
)
from core.ephemeris.swisseph_adapter import AYANAMSA_MODES
from core.types import POLAR_WARN_LATITUDE, BirthData, EngineOptions, Place

LocaleCode = Literal["mr", "hi", "en"]

#: Cached once: ``available_timezones()`` walks the tzdata tree.
_ZONES: frozenset[str] = frozenset(available_timezones())


class PlaceRef(BaseModel):
    """A birth place. Longitude east-positive, latitude north-positive."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=200)] = "Unnamed place"
    latitude: Annotated[float, Field(ge=-90.0, le=90.0)]
    longitude: Annotated[float, Field(ge=-180.0, le=180.0)]
    elevation_m: Annotated[float, Field(ge=-500.0, le=9000.0)] = 0.0
    iana_tz: str

    @field_validator("iana_tz")
    @classmethod
    def _known_zone(cls, value: str) -> str:
        """A hand-typed offset is rejected outright (CLAUDE.md 2.2).

        "Never hand-code offsets." Accepting ``+05:30`` here would defeat the
        historical-offset handling in CLAUDE.md 4.1, because a fixed offset cannot
        express the Bombay Time or wartime-DST transitions.
        """
        if value not in _ZONES:
            raise ValueError(
                f"{value!r} is not an IANA timezone name. A fixed offset is not "
                "accepted: historical Indian offsets need a zone (CLAUDE.md 4.1)."
            )
        return value

    def to_engine(self) -> Place:
        return Place(
            name=self.name,
            latitude=self.latitude,
            longitude=self.longitude,
            iana_tz=self.iana_tz,
            elevation_m=self.elevation_m,
        )

    @property
    def is_polar(self) -> bool:
        return abs(self.latitude) > POLAR_WARN_LATITUDE


class BirthInput(BaseModel):
    """CLAUDE.md 3.1, with the engine-school options the spec exposes."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=200)]
    date: dt.date
    #: ``None`` means unknown, and is handled by degrading (CLAUDE.md 4.6) - never
    #: by defaulting to noon.
    time: dt.time | None = None
    time_accuracy: TimeAccuracy = TimeAccuracy.EXACT
    time_standard: TimeStandard = TimeStandard.CLOCK_TIME_AS_RECORDED
    place: PlaceRef
    gender: Gender | None = None
    calendar_variant: CalendarVariant = CalendarVariant.AMANTA
    ayanamsa: str = "lahiri"
    node_type: NodeType = NodeType.TRUE
    dasha_year_length: YearLength = YearLength.SOLAR_365_2425
    mangal_dosha_ruleset: Literal["maharashtra", "north_school", "south_school"] = "maharashtra"
    locale: LocaleCode = "mr"

    @field_validator("ayanamsa")
    @classmethod
    def _known_ayanamsa(cls, value: str) -> str:
        if value not in AYANAMSA_MODES:
            raise ValueError(f"unknown ayanamsa {value!r}; known: {sorted(AYANAMSA_MODES)}")
        return value

    @field_validator("date")
    @classmethod
    def _plausible_date(cls, value: dt.date) -> dt.date:
        """The engine is property-tested over +/-200 years; refuse beyond that."""
        if not dt.date(1600, 1, 1) <= value <= dt.date(2300, 1, 1):
            raise ValueError(
                f"date {value} is outside the range this engine is tested over "
                "(1600-2300). Results beyond it are not validated."
            )
        return value

    @model_validator(mode="after")
    def _time_and_accuracy_agree(self) -> Self:
        """CLAUDE.md 4.6: an unknown time must be declared, never inferred."""
        if self.time is None and self.time_accuracy is not TimeAccuracy.UNKNOWN:
            raise ValueError(
                "time is null but time_accuracy is not 'unknown'. An unknown birth "
                "time must be declared so the response can suppress the fields it "
                "invalidates, rather than defaulting to 12:00 (CLAUDE.md 4.6)."
            )
        if self.time is not None and self.time_accuracy is TimeAccuracy.UNKNOWN:
            raise ValueError("time_accuracy 'unknown' contradicts a supplied time")
        return self

    def to_engine(self) -> BirthData:
        return BirthData(
            name=self.name,
            date=self.date,
            time=self.time,
            place=self.place.to_engine(),
            time_accuracy=self.time_accuracy,
            time_standard=self.time_standard,
            gender=self.gender,
            options=EngineOptions(
                ayanamsa=self.ayanamsa,
                node_type=self.node_type,
                calendar_variant=self.calendar_variant,
                dasha_year_length=self.dasha_year_length,
                mangal_dosha_ruleset=self.mangal_dosha_ruleset,
            ),
        )

    @property
    def input_warnings(self) -> list[str]:
        """Machine keys for conditions the client must surface, not prose."""
        return list(self.to_engine().warnings)


class MilanInput(BaseModel):
    """Two births for a Guna Milan comparison.

    Both charts are computed from full birth input rather than accepting a Moon
    rashi and nakshatra directly: a caller supplying those by hand would be
    supplying computed values, and CLAUDE.md N1 puts every computed value in the
    engine's hands.
    """

    model_config = ConfigDict(extra="forbid")

    bride: BirthInput
    groom: BirthInput
    locale: LocaleCode = "mr"


class NarrativeRequest(BaseModel):
    """A prose request. The facts are recomputed server-side, never accepted."""

    model_config = ConfigDict(extra="forbid")

    birth: BirthInput
    #: Omit for every section the chart supports.
    sections: list[str] | None = None
    locale: LocaleCode | None = None


class NarrativeSectionOut(BaseModel):
    """One validated section, with the provenance a reader needs to judge it."""

    model_config = ConfigDict(extra="forbid")

    section: str
    locale: str
    text: str
    is_refusal: bool
    cached: bool
    model: str
    prompt_version: str
    warnings: list[str]


class NarrativeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sections: list[NarrativeSectionOut]
    disclaimer: str
    generation_enabled: bool


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    engine_version: str
    chartfacts_schema_version: str
    ephemeris_provider: str
    ayanamsa_constant: str
    authority: str
    narrative_generation_enabled: bool
    locales: list[str]


class ErrorDetail(BaseModel):
    """A machine-readable error. ``key`` is stable; ``message`` is for developers."""

    model_config = ConfigDict(extra="forbid")

    key: str
    message: str
    field: str | None = None


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    errors: list[ErrorDetail]


class ChartFactsResponse(BaseModel):
    """ChartFacts plus the localisation the client needs to render it.

    The document itself is passed through untouched: it is schema-validated
    (CLAUDE.md 5) and adding a field here would put this endpoint out of contract.
    Locale strings ride alongside in ``glossary`` rather than being merged in, so
    ChartFacts stays free of Devanagari.
    """

    model_config = ConfigDict(extra="forbid")

    facts: dict[str, Any]
    glossary: dict[str, dict[str, str]]
    disclaimer: str


def timezone_for(latitude: float, longitude: float) -> str | None:
    """Best-effort IANA zone for a coordinate, for the geocoder endpoint."""
    try:
        from timezonefinder import TimezoneFinder
    except ImportError:  # pragma: no cover - optional dependency
        return None
    tz = TimezoneFinder().timezone_at(lat=latitude, lng=longitude)
    if tz is None:
        return None
    try:
        ZoneInfo(tz)
    except Exception:
        return None
    return str(tz)

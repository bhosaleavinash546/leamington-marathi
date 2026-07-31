"""The one narrow seam onto an ephemeris provider.

CLAUDE.md 2.1: "the ephemeris access [is] confined behind
``core/ephemeris/adapter.py`` so it can be swapped for Skyfield without
touching any other module. **Write that adapter first.** Never call ``swe.*``
outside it."

This module defines the interface and its value types only. It imports no
provider. ``swisseph_adapter.py`` is the sole module in the repository allowed
to ``import swisseph``, and a CI test asserts that (``tests/unit/
test_adapter_boundary.py``).

Every method takes and returns plain floats and UTC-aware datetimes. Nothing
here knows about tithis, rashis or locales.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, runtime_checkable

from core.enums import Graha


class EphemerisError(RuntimeError):
    """Provider-level failure: missing data files, out-of-range epoch."""


class CircumpolarError(EphemerisError):
    """The requested rise/set event does not occur on that day at that place.

    Raised rather than returned as ``None`` so that a caller cannot mistake an
    absent sunrise for midnight (CLAUDE.md 3.1, 4.6).
    """


class RiseSetEvent(StrEnum):
    RISE = "rise"
    SET = "set"
    UPPER_TRANSIT = "upper_transit"
    LOWER_TRANSIT = "lower_transit"


class DiscConvention(StrEnum):
    """Which point of the disc, and whether refraction applies.

    This single choice is the largest source of minute-level drift against a
    published panchang (CLAUDE.md 3.2). It is recorded in ChartFacts metadata
    and documented in ``docs/SUNRISE_CONVENTION.md``.
    """

    #: Upper limb touches the true horizon, standard atmospheric refraction
    #: applied. The common almanac / drik-ganit convention.
    UPPER_LIMB_REFRACTED = "upper_limb_refracted"
    #: Geometric centre of the disc on the true horizon, no refraction. The
    #: Surya-Siddhanta / classical convention; Swiss Ephemeris calls this
    #: "Hindu rising".
    DISC_CENTRE_NO_REFRACTION = "disc_centre_no_refraction"
    #: Centre of the disc with refraction. Offered for cross-checking only.
    DISC_CENTRE_REFRACTED = "disc_centre_refracted"


@dataclass(frozen=True, slots=True)
class BodyPosition:
    """A single body at a single instant.

    ``sidereal_lon`` is already ``tropical_lon - ayanamsa``, normalised to
    [0, 360) (CLAUDE.md 3.3).
    """

    body: Graha
    tropical_lon: float
    sidereal_lon: float
    latitude: float
    speed_lon: float  # degrees per day; negative means retrograde
    distance_au: float

    @property
    def is_retrograde(self) -> bool:
        """Negative ecliptic longitude speed.

        Deliberately derived from speed, never from "it is a node" - True nodes
        can be stationary or direct (CLAUDE.md 4.8).
        """
        return self.speed_lon < 0.0

    @property
    def is_stationary(self) -> bool:
        """Speed within a hair of zero. Reported separately from retrograde."""
        return abs(self.speed_lon) < 1e-6


@dataclass(frozen=True, slots=True)
class ChartAngles:
    """Sidereal ascendant and meridian, plus the obliquity used."""

    ascendant_sid: float
    mc_sid: float
    armc: float
    obliquity: float


@dataclass(frozen=True, slots=True)
class ProviderInfo:
    """Recorded verbatim in ``ChartFacts.ephemeris`` (CLAUDE.md 5)."""

    provider: str
    version: str
    ayanamsa: str
    #: The provider's own constant for that ayanamsa, pinned so that a
    #: provider-side redefinition is caught as a breaking change (CLAUDE.md 4.5).
    ayanamsa_constant: str
    #: Whether the ayanamsa is referred to the true (nutated) equinox of date.
    #: Worth ~12.8 arcseconds and recorded because it moves published values.
    ayanamsa_includes_nutation: bool = True


@runtime_checkable
class Ephemeris(Protocol):
    """The complete surface ``core/`` may use to reach astronomical data."""

    @property
    def info(self) -> ProviderInfo:
        """Provider identity and the pinned ayanamsa selection."""
        ...

    def ayanamsa_deg(self, jd_ut: float) -> float:
        """Ayanamsa in degrees at ``jd_ut`` for the configured mode."""
        ...

    def position(self, body: Graha, jd_ut: float) -> BodyPosition:
        """Geocentric apparent position of one graha."""
        ...

    def positions(self, bodies: tuple[Graha, ...], jd_ut: float) -> dict[Graha, BodyPosition]:
        """Batch form of :meth:`position`."""
        ...

    def angles(self, jd_ut: float, latitude: float, longitude: float) -> ChartAngles:
        """Sidereal ascendant and MC for a place at an instant."""
        ...

    def rise_set(
        self,
        event: RiseSetEvent,
        body: Graha,
        jd_ut_search_from: float,
        latitude: float,
        longitude: float,
        elevation_m: float,
        convention: DiscConvention,
    ) -> dt.datetime:
        """First ``event`` for ``body`` at or after ``jd_ut_search_from``.

        Raises :class:`CircumpolarError` when the event does not occur.
        """
        ...

    def obliquity_deg(self, jd_ut: float) -> float:
        """True obliquity of the ecliptic in degrees."""
        ...


def sunrise_convention_for_altitude(altitude_deg: float) -> DiscConvention:
    """Map a configured rise/set altitude onto the nearest named convention.

    ``EngineOptions.rise_set_altitude_deg`` exists so a future authority whose
    published convention is neither of the classical two can still be matched;
    this keeps the ChartFacts label honest in that case.
    """
    if abs(altitude_deg + 50.0 / 60.0) < 1e-6:
        return DiscConvention.UPPER_LIMB_REFRACTED
    if abs(altitude_deg) < 1e-6:
        return DiscConvention.DISC_CENTRE_NO_REFRACTION
    return DiscConvention.DISC_CENTRE_REFRACTED

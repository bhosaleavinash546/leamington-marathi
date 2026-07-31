"""Ephemeris seam. Import the adapter interface from here, never a provider."""

from __future__ import annotations

from core.ephemeris.adapter import (
    BodyPosition,
    ChartAngles,
    CircumpolarError,
    DiscConvention,
    Ephemeris,
    EphemerisError,
    ProviderInfo,
    RiseSetEvent,
    sunrise_convention_for_altitude,
)
from core.ephemeris.registry import build_ephemeris

__all__ = [
    "BodyPosition",
    "ChartAngles",
    "CircumpolarError",
    "DiscConvention",
    "Ephemeris",
    "EphemerisError",
    "ProviderInfo",
    "RiseSetEvent",
    "build_ephemeris",
    "sunrise_convention_for_altitude",
]

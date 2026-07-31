"""Shared fixtures.

The ephemeris fixture is session-scoped because ``swe.set_sid_mode`` is a
process-global write; sharing one adapter keeps the global state stable across a
test run and keeps the suite fast.
"""

from __future__ import annotations

import datetime as dt

import pytest

from core.enums import Gender, TimeAccuracy
from core.ephemeris.adapter import Ephemeris
from core.ephemeris.registry import build_ephemeris
from core.types import BirthData, EngineOptions, Place


@pytest.fixture(scope="session")
def ephemeris() -> Ephemeris:
    return build_ephemeris()


@pytest.fixture(scope="session")
def pune() -> Place:
    return Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0)


@pytest.fixture(scope="session")
def tromso() -> Place:
    """A place inside the Arctic Circle, for the undefined-sunrise path."""
    return Place("Tromso", 69.6492, 18.9553, "Europe/Oslo", 10.0)


@pytest.fixture(scope="session")
def options() -> EngineOptions:
    return EngineOptions()


@pytest.fixture
def sample_birth(pune: Place) -> BirthData:
    """A fully specified birth with an exact time, used by most chart tests."""
    return BirthData(
        name="Avinash",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=pune,
        time_accuracy=TimeAccuracy.EXACT,
        gender=Gender.M,
    )


@pytest.fixture(scope="session")
def reference_now() -> dt.datetime:
    """A fixed 'now' so transit-dependent output is reproducible.

    ``compute_full_reading`` takes ``now`` as a parameter precisely so the engine
    stays a pure function; using a literal here keeps the tests deterministic.
    """
    return dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC)

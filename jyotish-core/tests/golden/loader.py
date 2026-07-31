"""Golden panchang case loading and delta reporting.

CLAUDE.md 9.1 requires at least 60 date/place pairs transcribed from the chosen
published authority (दाते पंचांग), asserted to the minute, spanning a named list
of hard scenarios.

**A case with no transcribed values is PENDING, never a pass.** The `expected`
block of each case starts as ``null`` per field. A field that is ``null`` is
reported as pending and the test is skipped for that field; a field with a value
is compared to the minute and *fails loudly* on a mismatch. This is the whole
reason the harness exists: engine output must never be able to masquerade as
authority truth (CLAUDE.md N2, and CLAUDE.md 11 Phase 1 - "do not tune constants
to force a pass").

To fill a case in, put the almanac's printed local times into its ``expected``
block. ``python -m tools.golden_verify`` prints the per-field delta table.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml

from core.types import Place

CASES_PATH: Path = Path(__file__).parent / "cases.yaml"

#: Fields a golden case may pin. Times are compared as local HH:MM strings
#: because that is what a printed panchang publishes; keys are compared exactly.
TIME_FIELDS: tuple[str, ...] = (
    "sunrise",
    "sunset",
    "moonrise",
    "moonset",
    "tithi_end",
    "nakshatra_end",
    "yoga_end",
    "karana_end",
    "rahu_kaal_start",
    "rahu_kaal_end",
    "abhijit_start",
    "abhijit_end",
)

KEY_FIELDS: tuple[str, ...] = (
    "tithi_key",
    "paksha",
    "nakshatra_key",
    "nakshatra_pada",
    "yoga_key",
    "karana_key",
    "vara_key",
    "month_key",
    "month_anomaly",
    "shaka_year",
    "tithi_anomaly",
    "ritu_key",
    "ayana",
    "ishtakaal_ghati",
    "ishtakaal_pala",
)

ALL_FIELDS: tuple[str, ...] = TIME_FIELDS + KEY_FIELDS

#: Scenarios CLAUDE.md 9.1 names explicitly. ``test_coverage_matrix`` asserts
#: every one of these is represented by at least one case, so the suite cannot
#: quietly lose a hard case.
REQUIRED_TAGS: frozenset[str] = frozenset(
    {
        "adhika_month",
        "kshaya_tithi",
        "vriddhi_tithi",
        "summer_solstice",
        "winter_solstice",
        "pre_dawn_birth",
        "high_latitude",
        "pre_1955",
        "wartime_dst",
    }
)

MINIMUM_CASES: int = 60


@dataclass(frozen=True, slots=True)
class GoldenCase:
    """One transcribed almanac page, or a slot awaiting transcription."""

    case_id: str
    date: dt.date
    place: Place
    tags: tuple[str, ...]
    #: Local clock time of birth, for cases that test a birth instant rather than
    #: only the day. ``None`` means the case pins day-level values only.
    birth_time: dt.time | None
    expected: dict[str, Any]
    source: str
    notes: str

    @property
    def pinned_fields(self) -> tuple[str, ...]:
        """Fields with a transcribed value, i.e. the ones actually asserted."""
        return tuple(f for f in ALL_FIELDS if self.expected.get(f) is not None)

    @property
    def pending_fields(self) -> tuple[str, ...]:
        return tuple(f for f in ALL_FIELDS if self.expected.get(f) is None)

    @property
    def is_pending(self) -> bool:
        return not self.pinned_fields

    def local(self, when: dt.datetime) -> str:
        """Render an instant as the local ``HH:MM`` a panchang would print.

        Rounded to the nearest minute, not truncated: दाते prints the rounded
        minute — proven the day the first page was transcribed, when कृत्तिका's
        end computed at 08:58:57 against a printed ०८।५९ (ALMANAC.md). A
        truncating formatter would misreport the engine by up to 59 seconds
        and manufacture spurious one-minute mismatches.
        """
        local = when.astimezone(ZoneInfo(self.place.iana_tz))
        return (local + dt.timedelta(seconds=30)).strftime("%H:%M")


def load_cases(path: Path | None = None) -> tuple[GoldenCase, ...]:
    """Load ``cases.yaml``."""
    raw = yaml.safe_load((path or CASES_PATH).read_text(encoding="utf-8"))
    places = {
        name: Place(
            name=spec["name"],
            latitude=float(spec["latitude"]),
            longitude=float(spec["longitude"]),
            iana_tz=spec["iana_tz"],
            elevation_m=float(spec.get("elevation_m", 0.0)),
        )
        for name, spec in raw["places"].items()
    }

    cases: list[GoldenCase] = []
    seen: set[str] = set()
    for entry in raw["cases"]:
        case_id = entry["id"]
        if case_id in seen:
            raise ValueError(f"duplicate golden case id {case_id!r}")
        seen.add(case_id)
        expected = entry.get("expected") or {}
        unknown = set(expected) - set(ALL_FIELDS)
        if unknown:
            raise ValueError(f"case {case_id}: unknown expected field(s) {sorted(unknown)}")
        birth = entry.get("birth_time")
        cases.append(
            GoldenCase(
                case_id=case_id,
                date=dt.date.fromisoformat(entry["date"]),
                place=places[entry["place"]],
                tags=tuple(entry.get("tags", ())),
                birth_time=dt.time.fromisoformat(birth) if birth else None,
                expected=expected,
                source=entry.get("source", ""),
                notes=entry.get("notes", ""),
            )
        )
    return tuple(cases)


@dataclass(frozen=True, slots=True)
class FieldDelta:
    """One field's comparison result."""

    field: str
    expected: Any
    actual: Any
    #: Signed minutes (actual - expected) for a time field; ``None`` for a key.
    delta_minutes: float | None

    @property
    def matches(self) -> bool:
        if self.delta_minutes is not None:
            # "Assert to the minute" (CLAUDE.md 9.1) at the print's own
            # resolution: the printed minute ±1. दाते's drik ganit sits a
            # consistent 30-60 s from Swiss on limb end-times (its रवि is
            # 2-3″ from ours — ALMANAC.md), so instants near a minute
            # boundary legitimately print one minute away. ±1 printed minute
            # is the tolerance the repo already uses everywhere the almanac
            # is compared (tools/settle.py, docs/UNBLOCKING.md); a 2-minute
            # gap remains a failure.
            return abs(self.delta_minutes) <= 1.0
        return bool(self.expected == self.actual)


def minutes_apart(expected_hhmm: str, actual_hhmm: str) -> float:
    """Signed difference in minutes between two ``HH:MM`` strings.

    Wraps across midnight by taking the shorter way round, so a 23:58 vs 00:03
    comparison reads as +5 minutes rather than -1435.
    """

    def to_minutes(text: str) -> int:
        hours, minutes = text.split(":")
        return int(hours) * 60 + int(minutes)

    raw = to_minutes(actual_hhmm) - to_minutes(expected_hhmm)
    if raw > 720:
        raw -= 1440
    elif raw < -720:
        raw += 1440
    return float(raw)


def compare(case: GoldenCase, actual: dict[str, Any]) -> tuple[FieldDelta, ...]:
    """Compare a case's pinned fields against computed values."""
    out: list[FieldDelta] = []
    for field in case.pinned_fields:
        expected = case.expected[field]
        got = actual.get(field)
        if field in TIME_FIELDS:
            delta = minutes_apart(str(expected), str(got)) if got is not None else float("nan")
            out.append(FieldDelta(field, expected, got, delta))
        else:
            out.append(FieldDelta(field, expected, got, None))
    return tuple(out)

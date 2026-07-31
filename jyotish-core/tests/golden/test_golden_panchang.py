"""Golden panchang regression tests against दाते पंचांग.

Three distinct things are checked here, and only the first two can pass today:

1. **Coverage** - every scenario CLAUDE.md 9.1 names is represented, and there
   are at least 60 cases. This passes.
2. **Computability** - every case computes without crashing, produces values in
   range, and self-reports the scenario its tag claims (an ``adhika_month`` case
   really lands in an adhika month, a ``vriddhi_tithi`` case really shows
   vriddhi). This passes, and it is worth having: it catches a regression in the
   month-naming or anomaly logic without needing the almanac.
3. **Authority agreement** - the printed values. This is PENDING for all 62
   cases, because no almanac page has been transcribed. Each is skipped with a
   reason rather than passed, so the suite can never report agreement it has not
   demonstrated.
"""

from __future__ import annotations

import datetime as dt
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from core.enums import MonthAnomaly, TithiAnomaly
from core.ephemeris.adapter import CircumpolarError, Ephemeris
from core.panchang.day import compute_panchang_day, panchang_for_instant
from tests.golden.loader import (
    MINIMUM_CASES,
    REQUIRED_TAGS,
    GoldenCase,
    compare,
    load_cases,
)

CASES = load_cases()


def _ids(cases: tuple[GoldenCase, ...]) -> list[str]:
    return [c.case_id for c in cases]


# ---------------------------------------------------------------------------
# 1. Coverage
# ---------------------------------------------------------------------------


def test_minimum_case_count() -> None:
    """CLAUDE.md 9.1: at least 60 date/place pairs."""
    assert len(CASES) >= MINIMUM_CASES, (
        f"only {len(CASES)} golden cases; CLAUDE.md 9.1 requires {MINIMUM_CASES}"
    )


def test_coverage_matrix() -> None:
    """Every named hard scenario is represented by at least one case."""
    present = {tag for case in CASES for tag in case.tags}
    missing = REQUIRED_TAGS - present
    assert not missing, f"golden suite has no case for: {sorted(missing)}"


def test_transcription_status_is_reported_not_hidden() -> None:
    """A snapshot of how much of the authority has actually been transcribed.

    This test never fails - its job is to print the number so it appears in
    every CI run. ``docs/GOLDEN_FILES.md`` explains why 0/62 is the honest
    starting state rather than a defect to be papered over.
    """
    pinned = [c for c in CASES if not c.is_pending]
    print(
        f"\ngolden transcription status: {len(pinned)}/{len(CASES)} cases have "
        f"at least one field transcribed from दाते पंचांग"
    )


# ---------------------------------------------------------------------------
# 2. Computability and tag self-consistency
# ---------------------------------------------------------------------------


@pytest.mark.golden
@pytest.mark.parametrize("case", CASES, ids=_ids(CASES))
def test_case_computes(case: GoldenCase, ephemeris: Ephemeris) -> None:
    """Every case computes, or fails for the one documented legitimate reason.

    A high-latitude case inside the polar day or night has no sunrise, so
    :class:`CircumpolarError` is the *correct* outcome there - CLAUDE.md 3.1
    requires the engine to say so loudly rather than fabricate a time.
    """
    try:
        actual = _compute(case, ephemeris)
    except CircumpolarError:
        assert "high_latitude" in case.tags, (
            f"{case.case_id}: sunrise undefined at "
            f"{case.place.latitude:.2f} deg - only high_latitude cases may do this"
        )
        return

    assert 1 <= int(actual["nakshatra_pada"]) <= 4
    assert actual["paksha"] in {"shukla", "krishna"}
    assert actual["ayana"] in {"uttarayana", "dakshinayana"}
    assert 1500 < int(actual["shaka_year"]) < 2100


@pytest.mark.golden
@pytest.mark.parametrize(
    "case",
    [c for c in CASES if "adhika_month" in c.tags],
    ids=_ids(tuple(c for c in CASES if "adhika_month" in c.tags)),
)
def test_adhika_cases_land_in_the_right_month_type(case: GoldenCase, ephemeris: Ephemeris) -> None:
    """An ``adhika_month`` case is either the adhika month or the nija after it."""
    actual = _compute(case, ephemeris)
    if case.case_id.startswith("nija-"):
        assert actual["month_anomaly"] == MonthAnomaly.NONE.value
    else:
        assert actual["month_anomaly"] == MonthAnomaly.ADHIKA.value, (
            f"{case.case_id} is tagged adhika_month but computed {actual['month_anomaly']!r}"
        )


@pytest.mark.golden
@pytest.mark.parametrize(
    "case, expected_anomaly",
    [
        *((c, TithiAnomaly.VRIDDHI.value) for c in CASES if "vriddhi_tithi" in c.tags),
        *((c, TithiAnomaly.KSHAYA.value) for c in CASES if "kshaya_tithi" in c.tags),
    ],
    ids=[
        *(c.case_id for c in CASES if "vriddhi_tithi" in c.tags),
        *(c.case_id for c in CASES if "kshaya_tithi" in c.tags),
    ],
)
def test_tithi_anomaly_cases_exhibit_their_anomaly(
    case: GoldenCase, expected_anomaly: str, ephemeris: Ephemeris
) -> None:
    """A vriddhi/kshaya case really shows that anomaly.

    This is the regression guard on ``_classify_tithi_anomaly``: these dates were
    selected because the engine detected the anomaly, so if the classifier
    changes behaviour the selection stops matching and this fails.
    """
    actual = _compute(case, ephemeris)
    assert actual["tithi_anomaly"] == expected_anomaly, (
        f"{case.case_id} is tagged {expected_anomaly} but computed {actual['tithi_anomaly']!r}"
    )


@pytest.mark.golden
@pytest.mark.parametrize(
    "case",
    [c for c in CASES if "pre_dawn_birth" in c.tags and c.birth_time],
    ids=_ids(tuple(c for c in CASES if "pre_dawn_birth" in c.tags and c.birth_time)),
)
def test_pre_dawn_births_roll_to_the_previous_hindu_day(
    case: GoldenCase, ephemeris: Ephemeris
) -> None:
    """CLAUDE.md 4.2: a pre-dawn birth belongs to the previous Hindu day."""
    assert case.birth_time is not None
    local = dt.datetime.combine(case.date, case.birth_time, ZoneInfo(case.place.iana_tz))
    birth_utc = local.astimezone(dt.UTC)
    day, _moment = panchang_for_instant(ephemeris, case.date, birth_utc, case.place)

    if birth_utc < day.lights.sunrise or day.hindu_civil_date != case.date:
        assert day.hindu_civil_date == case.date - dt.timedelta(days=1)
    else:
        # The boundary case (birth just after sunrise) must NOT roll.
        assert day.hindu_civil_date == case.date
        assert birth_utc >= day.lights.sunrise


# ---------------------------------------------------------------------------
# 3. Authority agreement - pending until transcribed
# ---------------------------------------------------------------------------


@pytest.mark.golden
@pytest.mark.parametrize("case", CASES, ids=_ids(CASES))
def test_matches_authority(case: GoldenCase, ephemeris: Ephemeris) -> None:
    """Assert every transcribed field to the minute against दाते पंचांग."""
    if case.is_pending:
        pytest.skip(
            f"PENDING: no दाते पंचांग values transcribed for {case.case_id}. See docs/GOLDEN_FILES.md."
        )

    actual = _compute(case, ephemeris)
    deltas = compare(case, actual)
    failures = [d for d in deltas if not d.matches]
    assert not failures, "\n".join(
        f"{case.case_id}.{d.field}: authority={d.expected!r} engine={d.actual!r}"
        + (f" (delta {d.delta_minutes:+.0f} min)" if d.delta_minutes is not None else "")
        for d in failures
    )


# ---------------------------------------------------------------------------
# Shared computation
# ---------------------------------------------------------------------------


def _compute(case: GoldenCase, ephemeris: Ephemeris) -> dict[str, Any]:
    """Compute a case's fields in the shape ``cases.yaml`` pins them."""
    if case.birth_time is not None:
        local = dt.datetime.combine(case.date, case.birth_time, ZoneInfo(case.place.iana_tz))
        day, moment = panchang_for_instant(
            ephemeris, case.date, local.astimezone(dt.UTC), case.place
        )
    else:
        day = compute_panchang_day(ephemeris, case.date, case.place)
        moment = None

    out: dict[str, Any] = {
        "sunrise": case.local(day.lights.sunrise),
        "sunset": case.local(day.lights.sunset),
        "moonrise": case.local(day.lights.moonrise) if day.lights.moonrise else None,
        "moonset": case.local(day.lights.moonset) if day.lights.moonset else None,
        "tithi_end": case.local(day.tithi_at_sunrise.end_utc),
        "nakshatra_end": case.local(day.nakshatra_at_sunrise.end_utc),
        "yoga_end": case.local(day.yoga_at_sunrise.end_utc),
        "karana_end": case.local(day.karana_at_sunrise.end_utc),
        "rahu_kaal_start": _opt_local(case, day.periods.rahu_kaal.start),
        "rahu_kaal_end": _opt_local(case, day.periods.rahu_kaal.end),
        "abhijit_start": _opt_local(case, day.periods.abhijit_muhurta.start),
        "abhijit_end": _opt_local(case, day.periods.abhijit_muhurta.end),
        "tithi_key": day.tithi_at_sunrise.key,
        "paksha": day.tithi_at_sunrise.paksha.value,
        "nakshatra_key": day.nakshatra_at_sunrise.key,
        "nakshatra_pada": day.nakshatra_at_sunrise.pada,
        "yoga_key": day.yoga_at_sunrise.key,
        "karana_key": day.karana_at_sunrise.key,
        "vara_key": day.vara.key,
        "month_key": day.hindu_date.month_key,
        "month_anomaly": day.hindu_date.month_anomaly.value,
        "shaka_year": day.hindu_date.shaka_year,
        "tithi_anomaly": day.tithi_anomaly.value,
        "ritu_key": day.solar.ritu_key,
        "ayana": day.solar.ayana.value,
    }
    if moment is not None:
        out["ishtakaal_ghati"] = moment.ishtakaal.ghati
        out["ishtakaal_pala"] = moment.ishtakaal.pala
    return out


def _opt_local(case: GoldenCase, when: dt.datetime | None) -> str | None:
    return case.local(when) if when is not None else None

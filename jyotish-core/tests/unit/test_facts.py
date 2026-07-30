"""The ChartFacts contract (CLAUDE.md 5) and the confidence machinery (4.6)."""

from __future__ import annotations

import datetime as dt
import json
from itertools import pairwise
from typing import Any

import pytest

from core.enums import Gender, NodeType, TimeAccuracy, TimeStandard, YearLength
from core.facts.builder import (
    SUPPRESSED_WITHOUT_BIRTH_TIME,
    build_chart_facts,
    compute_full_reading,
)
from core.facts.validate import (
    SCHEMA_PATH,
    ChartFactsError,
    assert_no_devanagari,
    load_schema,
    validate_chart_facts,
)
from core.types import BirthData, EngineOptions, InputError, Place
from core.version import CHARTFACTS_SCHEMA_VERSION, ENGINE_VERSION


@pytest.fixture(scope="module")
def facts(request: pytest.FixtureRequest) -> dict[str, Any]:
    birth = BirthData(
        name="Avinash",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=request.getfixturevalue("pune"),
        time_accuracy=TimeAccuracy.EXACT,
        gender=Gender.M,
    )
    reading = compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    return build_chart_facts(reading)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


def test_schema_file_exists_and_matches_the_version() -> None:
    """CLAUDE.md 5: a schema change is a major version bump, so the filename pins it."""
    assert SCHEMA_PATH.exists()
    assert CHARTFACTS_SCHEMA_VERSION in SCHEMA_PATH.name
    schema = load_schema()
    assert schema["properties"]["schema_version"]["const"] == CHARTFACTS_SCHEMA_VERSION


def test_facts_validate_against_the_schema(facts: dict[str, Any]) -> None:
    validate_chart_facts(facts)


def test_schema_rejects_a_malformed_document(facts: dict[str, Any]) -> None:
    """A schema that accepts anything is not a contract."""
    broken = json.loads(json.dumps(facts))
    broken["chart"]["grahas"][0]["rashi"] = 13
    with pytest.raises(ChartFactsError, match="rashi"):
        validate_chart_facts(broken)

    broken = json.loads(json.dumps(facts))
    del broken["panchang"]
    with pytest.raises(ChartFactsError, match="panchang"):
        validate_chart_facts(broken)

    broken = json.loads(json.dumps(facts))
    broken["unexpected_field"] = 1
    with pytest.raises(ChartFactsError):
        validate_chart_facts(broken)


def test_schema_pins_the_sarvashtakavarga_invariant(facts: dict[str, Any]) -> None:
    """337 is a constant in the schema, not merely a runtime assertion."""
    assert facts["chart"]["ashtakavarga"]["sarva_total"] == 337
    broken = json.loads(json.dumps(facts))
    broken["chart"]["ashtakavarga"]["sarva_total"] = 336
    with pytest.raises(ChartFactsError):
        validate_chart_facts(broken)


# ---------------------------------------------------------------------------
# Key hygiene
# ---------------------------------------------------------------------------


def test_no_devanagari_anywhere_except_the_supplied_name(facts: dict[str, Any]) -> None:
    """CLAUDE.md 5: no Devanagari, no prose inside ChartFacts."""
    assert_no_devanagari(facts)


def test_a_devanagari_key_is_caught(facts: dict[str, Any]) -> None:
    broken = json.loads(json.dumps(facts))
    broken["panchang"]["hindu_date"]["month_key"] = "श्रावण"
    with pytest.raises(ChartFactsError, match="Devanagari"):
        assert_no_devanagari(broken)


def test_a_users_devanagari_name_is_allowed(request: pytest.FixtureRequest) -> None:
    """A Marathi user's name is input echoed back, not an engine key."""
    birth = BirthData(
        name="अविनाश",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=request.getfixturevalue("pune"),
    )
    facts = build_chart_facts(
        compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    )
    assert_no_devanagari(facts)
    validate_chart_facts(facts)
    assert facts["input"]["name"] == "अविनाश"


def test_engine_and_schema_versions_are_recorded(facts: dict[str, Any]) -> None:
    assert facts["engine_version"] == ENGINE_VERSION
    assert facts["schema_version"] == CHARTFACTS_SCHEMA_VERSION


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------


def test_provenance_travels_with_the_data(facts: dict[str, Any]) -> None:
    """A number without its convention cannot be checked, so all of them ship."""
    ephemeris = facts["ephemeris"]
    assert ephemeris["provider"].startswith("swisseph")
    assert ephemeris["ayanamsa"] == "lahiri"
    assert ephemeris["ayanamsa_constant"] == "SE_SIDM_LAHIRI"
    assert 22.0 < ephemeris["ayanamsa_value_deg"] < 25.0
    assert ephemeris["node_type"] == NodeType.MEAN.value
    assert ephemeris["rise_set_convention"] == "upper_limb_refracted"
    assert facts["authority"] == "date_panchang"
    assert facts["dasha"]["year_length"] == YearLength.SOLAR_365_2425.value
    assert facts["panchang"]["hindu_date"]["calendar_variant"] == "amanta"
    assert facts["panchang"]["ritu"]["convention"] == "lunar_month_pairs"
    assert facts["panchang"]["ishtakaal"]["convention"] == "fixed_24_min"


def test_applied_utc_offset_is_echoed_not_the_zones_current_one(facts: dict[str, Any]) -> None:
    """CLAUDE.md 4.1 / 5: the offset actually applied."""
    assert facts["input"]["resolved_utc_offset_seconds"] == 19800
    assert facts["input"]["time_standard"] == TimeStandard.CLOCK_TIME_AS_RECORDED.value
    assert facts["input"]["birth_utc"] == "1990-06-15T09:02:00Z"


def test_wartime_birth_records_a_different_applied_offset(request: pytest.FixtureRequest) -> None:
    """The 1943 case: the offset in the document must be the wartime one."""
    birth = BirthData(
        name="Test",
        date=dt.date(1943, 6, 15),
        time=dt.time(14, 30),
        place=request.getfixturevalue("pune"),
    )
    facts = build_chart_facts(
        compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    )
    validate_chart_facts(facts)
    assert facts["input"]["resolved_utc_offset_seconds"] != 19800, (
        "a 1943 Indian birth must not receive the modern +05:30"
    )


# ---------------------------------------------------------------------------
# Both views of the panchang
# ---------------------------------------------------------------------------


def test_both_sunrise_and_birth_limbs_are_present(facts: dict[str, Any]) -> None:
    """CLAUDE.md 4.3: both reported, separately labelled."""
    panchang = facts["panchang"]
    assert "tithi_at_sunrise" in panchang
    assert "tithi_at_birth" in panchang
    assert "nakshatra_at_sunrise" in panchang
    assert "nakshatra_at_birth" in panchang
    assert isinstance(panchang["tithi_at_birth_differs_from_sunrise"], bool)


def test_ishtakaal_is_present_for_a_timed_birth(facts: dict[str, Any]) -> None:
    """CLAUDE.md 3.2: omitting it reads as amateur to a Marathi user."""
    ishtakaal = facts["panchang"]["ishtakaal"]
    assert 0 <= ishtakaal["ghati"] <= 70
    assert 0 <= ishtakaal["pala"] <= 59
    assert 0 <= ishtakaal["vipala"] <= 59


def test_dasha_is_four_levels_deep(facts: dict[str, Any]) -> None:
    current = facts["dasha"]["current"]
    assert set(current) == {"maha", "antar", "pratyantar", "sookshma"}
    for level in current.values():
        assert level["start_utc"] < level["end_utc"]
    # Each level nests inside its parent.
    order = ["maha", "antar", "pratyantar", "sookshma"]
    for outer, inner in pairwise(order):
        assert current[outer]["start_utc"] <= current[inner]["start_utc"]
        assert current[inner]["end_utc"] <= current[outer]["end_utc"]
    assert len(facts["dasha"]["timeline"]) == 9


def test_every_finding_carries_evidence(facts: dict[str, Any]) -> None:
    """CLAUDE.md 6.3 / 8: the narrative layer cites this array."""
    for finding in (*facts["yogas_present"], *facts["doshas"]):
        assert finding["evidence"], finding["key"]
        assert finding["citation"] != "" or finding["key"].startswith("kaal_sarpa")


def test_dosha_records_the_ruleset_that_was_applied(facts: dict[str, Any]) -> None:
    """CLAUDE.md 3.5: state which house-set school was used."""
    mangal = [d for d in facts["doshas"] if d["key"] == "mangal_dosha"]
    for dosha in mangal:
        assert dosha["ruleset"] == "maharashtra"


def test_switching_the_dosha_ruleset_changes_the_recorded_ruleset(
    request: pytest.FixtureRequest,
) -> None:
    birth = BirthData(
        name="Test",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=request.getfixturevalue("pune"),
        options=EngineOptions(mangal_dosha_ruleset="north_school"),
    )
    facts = build_chart_facts(
        compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    )
    for dosha in facts["doshas"]:
        if dosha["key"] == "mangal_dosha":
            assert dosha["ruleset"] == "north_school"


def test_numerology_is_marked_not_jyotish(facts: dict[str, Any]) -> None:
    assert facts["name"]["numerology"]["is_jyotish"] is False


# ---------------------------------------------------------------------------
# Unknown and approximate birth time (CLAUDE.md 4.6)
# ---------------------------------------------------------------------------


def test_unknown_time_suppresses_rather_than_defaults(request: pytest.FixtureRequest) -> None:
    """ "Do not silently default to 12:00." The fields are absent, not guessed."""
    birth = BirthData(
        name="Unknown",
        date=dt.date(1990, 6, 15),
        time=None,
        place=request.getfixturevalue("pune"),
        time_accuracy=TimeAccuracy.UNKNOWN,
    )
    reading = compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    facts = build_chart_facts(reading)
    validate_chart_facts(facts)

    assert "chart" not in facts, "no lagna means no chart"
    assert "dasha" not in facts, "no birth time means no dasha dates"
    assert "yogas_present" not in facts
    assert "ishtakaal" not in facts["panchang"]
    assert "tithi_at_birth" not in facts["panchang"]

    # What survives is time-robust: the day's own panchang.
    assert facts["panchang"]["tithi_at_sunrise"]["key"]
    assert facts["panchang"]["hindu_date"]["shaka_year"]

    assert facts["confidence"]["birth_time"] == "unknown"
    assert set(facts["confidence"]["affected_fields"]) == set(SUPPRESSED_WITHOUT_BIRTH_TIME)
    assert "birth_time_unknown_time_dependent_fields_suppressed" in facts["confidence"]["warnings"]


def test_time_and_accuracy_must_agree() -> None:
    """A None time with a non-unknown accuracy is a contradiction, not a default."""
    place = Place("Pune", 18.52, 73.85, "Asia/Kolkata")
    with pytest.raises(InputError, match="do not silently default"):
        BirthData(name="x", date=dt.date(1990, 1, 1), time=None, place=place)
    with pytest.raises(InputError, match="contradicts"):
        BirthData(
            name="x",
            date=dt.date(1990, 1, 1),
            time=dt.time(12, 0),
            place=place,
            time_accuracy=TimeAccuracy.UNKNOWN,
        )


def test_approximate_time_flags_the_fields_that_actually_change(
    request: pytest.FixtureRequest,
) -> None:
    """CLAUDE.md 4.6: run the chart at the window bounds and flag what changes.

    The chart is genuinely recomputed at both bounds, so the flagged set depends
    on where in a sign the birth falls - not merely on the window width. A
    one-hour window moves the lagna about 15 degrees, so it will nearly always
    move the lagna's pada.
    """
    place = request.getfixturevalue("pune")
    exact = BirthData(
        name="Test",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=place,
        time_accuracy=TimeAccuracy.EXACT,
    )
    fuzzy = BirthData(
        name="Test",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=place,
        time_accuracy=TimeAccuracy.APPROX_1HR,
    )
    now = request.getfixturevalue("reference_now")

    exact_facts = build_chart_facts(compute_full_reading(exact, now=now))
    fuzzy_facts = build_chart_facts(compute_full_reading(fuzzy, now=now))
    validate_chart_facts(fuzzy_facts)

    assert exact_facts["confidence"]["affected_fields"] == []
    affected = fuzzy_facts["confidence"]["affected_fields"]
    assert affected, "a one-hour window must move something"
    assert any(field.startswith("chart.lagna") for field in affected)
    assert (
        "birth_time_approximate_fields_may_vary_within_window"
        in fuzzy_facts["confidence"]["warnings"]
    )

    # The numbers themselves are unchanged - only the confidence block differs.
    assert fuzzy_facts["chart"]["lagna"] == exact_facts["chart"]["lagna"]


def test_fifteen_minute_window_flags_fewer_fields_than_an_hour(
    request: pytest.FixtureRequest,
) -> None:
    place = request.getfixturevalue("pune")
    now = request.getfixturevalue("reference_now")

    def affected(accuracy: TimeAccuracy) -> set[str]:
        birth = BirthData(
            name="Test",
            date=dt.date(1990, 6, 15),
            time=dt.time(14, 32),
            place=place,
            time_accuracy=accuracy,
        )
        return set(compute_full_reading(birth, now=now).affected_fields)

    quarter = affected(TimeAccuracy.APPROX_15MIN)
    hour = affected(TimeAccuracy.APPROX_1HR)
    assert quarter <= hour, "a narrower window cannot destabilise more fields"


def test_polar_place_warning_reaches_the_document(request: pytest.FixtureRequest) -> None:
    """CLAUDE.md 3.1: warn that tithi-at-birth may be undefined at high latitude."""
    birth = BirthData(
        name="Test",
        date=dt.date(2024, 3, 20),
        time=dt.time(12, 0),
        place=request.getfixturevalue("tromso"),
    )
    facts = build_chart_facts(
        compute_full_reading(birth, now=request.getfixturevalue("reference_now"))
    )
    validate_chart_facts(facts)
    assert "polar_latitude_sunrise_may_be_undefined" in facts["confidence"]["warnings"]


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


def test_the_engine_is_a_pure_function(request: pytest.FixtureRequest) -> None:
    """Identical input must produce a byte-identical document.

    Required by the narrative cache in CLAUDE.md 6: "Identical charts must not
    produce drifting text", which is only achievable if identical charts produce
    identical facts. ``now`` is a parameter for exactly this reason.
    """
    birth = BirthData(
        name="Avinash",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=request.getfixturevalue("pune"),
    )
    now = request.getfixturevalue("reference_now")
    first = build_chart_facts(compute_full_reading(birth, now=now))
    second = build_chart_facts(compute_full_reading(birth, now=now))
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_facts_are_json_serialisable_and_compact(facts: dict[str, Any]) -> None:
    """The narrative layer receives this over the wire, so it must not be huge."""
    encoded = json.dumps(facts)
    assert len(encoded) < 200_000
    assert json.loads(encoded) == facts

"""Narrative layer tests (CLAUDE.md 6, and 9.5).

CLAUDE.md 9.5: "Narrative validator tests - the blocklist rejects prohibited
content in all three locales." That is the `/narrative-test` slash command's job
and it is the core of this file.

Every test runs with :class:`~narrative.client.ScriptedClient`, so the whole layer
- prompt construction, projection, validation, caching, retry - is exercised with
no API key and no network.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from core.facts.builder import build_chart_facts, compute_full_reading
from core.types import BirthData, Place
from narrative.client import LLMError, RefusingClient, ScriptedClient
from narrative.projection import add_local_times, project, timezone_of
from narrative.prompt import (
    PROMPT_VERSION,
    SECTION_FACT_KEYS,
    SECTIONS,
    PromptError,
    build_system_prompt,
    facts_subset,
)
from narrative.service import (
    NarrativeCache,
    NarrativeRejectedError,
    NarrativeService,
    cache_key,
)
from narrative.validator import (
    REQUIRED_CATEGORIES,
    NarrativeLocaleError,
    Severity,
    blocklist_categories,
    check_evidence_citation,
    check_numeric_provenance,
    collect_evidence_keys,
    collect_facts_numbers,
    load_narrative_locale,
    refusal_string,
    validate,
)
from tools.narrative_test import PROHIBITED_SAMPLES

LOCALES = ("mr", "hi", "en")


@pytest.fixture(scope="module")
def facts(request: pytest.FixtureRequest) -> dict[str, Any]:
    birth = BirthData(
        name="Avinash",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
    )
    return build_chart_facts(
        compute_full_reading(birth, now=dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC))
    )


# ---------------------------------------------------------------------------
# Prohibited content, in all three locales (CLAUDE.md 6.6, 6.7, 9.5)
# ---------------------------------------------------------------------------

#: One sample per category per locale, imported from the ``/narrative-test``
#: slash command (CLAUDE.md 11) rather than repeated here. The CLI and this test
#: must agree on what counts as prohibited, and two copies would drift.


def test_every_locale_defines_every_required_category() -> None:
    """A locale missing a category would let that category through silently."""
    for locale in LOCALES:
        assert blocklist_categories(locale) == REQUIRED_CATEGORIES, locale


def test_every_locale_has_a_refusal_string() -> None:
    for locale in LOCALES:
        refusal = refusal_string(locale)
        assert refusal.strip()
        if locale in ("mr", "hi"):
            assert any("ऀ" <= ch <= "ॿ" for ch in refusal), (
                f"{locale} refusal is not in Devanagari - an English refusal in "
                "Marathi prose is the failure CLAUDE.md N5 forbids"
            )


@pytest.mark.parametrize("category", sorted(PROHIBITED_SAMPLES))
@pytest.mark.parametrize("locale", LOCALES)
def test_prohibited_content_is_rejected_in_every_locale(
    category: str, locale: str, facts: dict[str, Any]
) -> None:
    """CLAUDE.md 9.5: the blocklist rejects prohibited content in mr, hi and en.

    7 categories x 3 locales = 21 assertions, which is the whole of CLAUDE.md 6.6
    plus the 6.7 marital rule.
    """
    sample = PROHIBITED_SAMPLES[category][locale]
    result = validate(sample, locale=locale, facts=facts)
    assert result.rejected, f"{locale}/{category} was not rejected: {sample!r}"
    assert category in result.categories, (
        f"{locale}/{category} was rejected but attributed to {sorted(result.categories)} instead"
    )
    assert all(v.severity is Severity.REJECT for v in result.rejections)
    assert all(v.excerpt for v in result.rejections)


@pytest.mark.parametrize("locale", LOCALES)
def test_the_refusal_string_itself_is_not_rejected(locale: str, facts: dict[str, Any]) -> None:
    """A section that correctly refuses must not then fail its own validator.

    The refusal text can legitimately contain words the blocklist watches for, so
    it is exempted - otherwise a correct refusal would loop into a second refusal.
    """
    result = validate(refusal_string(locale), locale=locale, facts=facts)
    assert not result.rejected, [str(v) for v in result.rejections]


@pytest.mark.parametrize("locale", LOCALES)
def test_ordinary_prose_is_not_rejected(locale: str, facts: dict[str, Any]) -> None:
    """The blocklist must not be so broad that legitimate prose cannot pass.

    A validator that rejects everything satisfies CLAUDE.md 6.6 and makes the
    product useless, so the false-positive direction is tested too. These use
    genuinely astrological vocabulary, including the 8th house (आयु / longevity),
    which is the nearest legitimate neighbour of a prohibited subject.
    """
    samples = {
        "mr": (
            "मंगळ सप्तम स्थानात असल्याने पारंपरिक ग्रंथ भागीदारीत सावधानता "
            "सुचवतात (mars_in_house_7). आयुष्य स्थानाचा स्वामी बलवान आहे."
        ),
        "hi": (
            "मंगल सप्तम भाव में होने से पारंपरिक ग्रंथ साझेदारी में सावधानी "
            "सुझाते हैं (mars_in_house_7). आयु भाव का स्वामी बलवान है."
        ),
        "en": (
            "With Mars in the seventh house (mars_in_house_7), the classical texts "
            "traditionally counsel care in partnership. The lord of the house of "
            "longevity is well placed."
        ),
    }
    result = validate(samples[locale], locale=locale, facts=facts)
    assert not result.rejected, [str(v) for v in result.rejections]


def test_a_missing_locale_file_is_an_error() -> None:
    with pytest.raises(NarrativeLocaleError, match="no narrative locale file"):
        load_narrative_locale("de")


# ---------------------------------------------------------------------------
# Numeric provenance (CLAUDE.md N1)
# ---------------------------------------------------------------------------


def test_a_fabricated_number_is_rejected(facts: dict[str, Any]) -> None:
    """CLAUDE.md N1 made enforceable: a figure absent from the facts fails."""
    projected = project(facts, "lagna_and_grahas")
    result = check_numeric_provenance(
        "The ascendant stands at 19.4471 degrees of Kanya.", projected
    )
    assert result
    assert result[0].category == "fabricated_number"
    assert result[0].severity is Severity.REJECT


def test_real_numbers_and_their_roundings_pass(facts: dict[str, Any]) -> None:
    """Prose legitimately rounds, so a rounding of a stored value is allowed."""
    projected = project(facts, "lagna_and_grahas")
    exact = projected["chart"]["lagna"]["deg_in_rashi"]
    for text in (
        f"The ascendant is at {exact} degrees.",
        f"The ascendant is at {exact:.2f} degrees.",
        f"The ascendant is at {exact:.1f} degrees.",
    ):
        assert not check_numeric_provenance(text, projected), text


def test_structural_integers_are_allowed(facts: dict[str, Any]) -> None:
    """ "the twelve houses", "the 7th from the Moon" - bounded by the domain."""
    projected = project(facts, "lagna_and_grahas")
    text = "Of the twelve houses, the 7th holds Mars, and each of the 27 nakshatras has 4 padas."
    assert not check_numeric_provenance(text, projected)


def test_a_large_bare_integer_is_not_treated_as_structural(facts: dict[str, Any]) -> None:
    """A year is not a house number, so it needs provenance."""
    projected = project(facts, "dasha")
    assert check_numeric_provenance("The period ends in 3099.", projected)


def test_devanagari_digits_are_checked_too(facts: dict[str, Any]) -> None:
    """CLAUDE.md 7 offers a Devanagari numeral toggle; prose using it is checked."""
    projected = project(facts, "lagna_and_grahas")
    # ९९.९९ is not in the facts, whichever script it is written in.
    assert check_numeric_provenance("लग्न ९९.९९ अंशावर आहे.", projected)


def test_collect_facts_numbers_ignores_booleans(facts: dict[str, Any]) -> None:
    """``True`` is an int in Python but is not a number in prose."""
    numbers = collect_facts_numbers({"retrograde": True, "combust": False})
    assert numbers == frozenset()


# ---------------------------------------------------------------------------
# The projection (engine-computed local times)
# ---------------------------------------------------------------------------


def test_local_times_are_added_by_the_engine(facts: dict[str, Any]) -> None:
    """CLAUDE.md N1 + 4.7: a timezone conversion is arithmetic, so the engine does it.

    Without this, correct prose quoting a local sunrise would be rejected as
    fabricated, because ChartFacts stores UTC.
    """
    projected = project(facts, "panchang")
    assert timezone_of(facts) == "Asia/Kolkata"
    sunrise = projected["panchang"]["sunrise_local"]
    assert set(sunrise) == {"time", "date", "datetime"}
    assert len(sunrise["time"]) == 5 and sunrise["time"][2] == ":"
    # The local rendering is now valid provenance for prose.
    assert not check_numeric_provenance(f"Sunrise was at {sunrise['time']}.", projected)
    assert projected["presentation"]["timezone"] == "Asia/Kolkata"


def test_local_times_are_added_recursively(facts: dict[str, Any]) -> None:
    projected = project(facts, "panchang")
    assert "end_local" in projected["panchang"]["tithi_at_sunrise"]
    assert "start_local" in projected["panchang"]["rahu_kaal"]
    dasha = project(facts, "dasha")["dasha"]
    assert "start_local" in dasha["timeline"][0]


def test_add_local_times_leaves_non_utc_fields_alone() -> None:
    from zoneinfo import ZoneInfo

    node = {"name": "Pune", "count": 3, "when_utc": "2026-01-01T00:00:00Z"}
    out = add_local_times(node, ZoneInfo("Asia/Kolkata"))
    assert out["name"] == "Pune"
    assert out["count"] == 3
    assert out["when_local"]["time"] == "05:30"


def test_an_unparseable_timestamp_is_skipped() -> None:
    from zoneinfo import ZoneInfo

    out = add_local_times({"bad_utc": "not-a-time"}, ZoneInfo("UTC"))
    assert "bad_local" not in out


# ---------------------------------------------------------------------------
# Evidence citation (CLAUDE.md 6.3)
# ---------------------------------------------------------------------------


def test_evidence_keys_are_collected(facts: dict[str, Any]) -> None:
    keys = collect_evidence_keys(project(facts, "doshas"))
    assert keys, "the reference chart should carry at least one dosha with evidence"
    assert all(" " not in key for key in keys)


def test_uncited_prose_warns_but_does_not_reject(facts: dict[str, Any]) -> None:
    """A warning: withholding a reading over a missing citation serves nobody, and
    the structured evidence array reaches the UI regardless."""
    projected = project(facts, "doshas")
    violations = check_evidence_citation("Some prose with no citation at all.", projected)
    assert len(violations) == 1
    assert violations[0].severity is Severity.WARN
    result = validate("Some prose with no citation at all.", locale="en", facts=projected)
    assert not result.rejected
    assert result.warnings


def test_cited_prose_does_not_warn(facts: dict[str, Any]) -> None:
    projected = project(facts, "doshas")
    key = next(iter(collect_evidence_keys(projected)))
    assert not check_evidence_citation(f"Because of {key}, tradition holds ...", projected)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("section", SECTIONS)
@pytest.mark.parametrize("locale", LOCALES)
def test_system_prompt_carries_every_requirement(section: str, locale: str) -> None:
    """The seven CLAUDE.md 6 requirements must all be present, in every prompt."""
    prompt = build_system_prompt(section, locale, refusal_string(locale))
    for marker in (
        "authoritative and immutable",  # 1
        "Only what is in the JSON",  # 2
        "evidence",  # 3
        "glossary",  # 4
        "conditional language",  # 5
        "Prohibited subjects",  # 6
        "marital",  # 7
    ):
        assert marker.lower() in prompt.lower(), f"{section}/{locale} prompt lacks {marker!r}"
    assert refusal_string(locale) in prompt
    assert "do not convert" in prompt.lower() or "not present" in prompt.lower()


def test_prompt_rejects_unknown_section_and_locale() -> None:
    with pytest.raises(PromptError, match="unknown section"):
        build_system_prompt("horoscope", "en", "x")
    with pytest.raises(PromptError, match="unknown locale"):
        build_system_prompt("panchang", "de", "x")


def test_facts_are_narrowed_per_section(facts: dict[str, Any]) -> None:
    """Defence in depth for CLAUDE.md 6.2: prose cannot cite what it never saw."""
    yogas = facts_subset(facts, "yogas")
    assert "chart" not in yogas, "the yogas section has no business seeing every graha"
    assert "yogas_present" in yogas
    assert set(SECTION_FACT_KEYS) == set(SECTIONS)
    for section in SECTIONS:
        assert "confidence" in facts_subset(facts, section), (
            f"{section} must always see the confidence block: prose has to be able "
            "to caveat an approximate birth time (CLAUDE.md 4.6)"
        )


# ---------------------------------------------------------------------------
# Service, cache and retry
# ---------------------------------------------------------------------------


def test_generation_is_cached_and_stable(facts: dict[str, Any]) -> None:
    """CLAUDE.md 6: "Identical charts must not produce drifting text."."""
    client = ScriptedClient(responses=["First text (mars_in_house_7).", "Different text."])
    service = NarrativeService(client)

    first = service.generate(facts, "doshas", "en")
    second = service.generate(facts, "doshas", "en")

    assert first.text == second.text, "a second call must not regenerate"
    assert not first.cached and second.cached
    assert len(client.calls) == 1, "the transport was called twice despite the cache"
    assert service.cache.hits == 1 and service.cache.misses == 1


def test_cache_key_covers_every_input_that_changes_output(facts: dict[str, Any]) -> None:
    base = cache_key(facts, "doshas", "en")
    assert base != cache_key(facts, "doshas", "mr"), "locale must be in the key"
    assert base != cache_key(facts, "yogas", "en"), "section must be in the key"
    assert base != cache_key(facts, "doshas", "en", model="other-model")
    assert base != cache_key(facts, "doshas", "en", prompt_version="9.9.9")
    assert base != cache_key(facts, "doshas", "en", validator_version="9.9.9")
    assert base == cache_key(facts, "doshas", "en"), "the key must be stable"


def test_cache_key_ignores_unrelated_parts_of_the_chart(facts: dict[str, Any]) -> None:
    """A change outside the section's slice must not invalidate its cached text."""
    import copy

    other = copy.deepcopy(facts)
    other["chart"]["grahas"][0]["sid_lon"] = 123.456
    assert cache_key(facts, "doshas", "en") == cache_key(other, "doshas", "en")
    assert cache_key(facts, "lagna_and_grahas", "en") != cache_key(other, "lagna_and_grahas", "en")


def test_rejected_prose_is_retried_then_refused(facts: dict[str, Any]) -> None:
    """Two attempts, then the locale refusal rather than an error page."""
    client = ScriptedClient(
        responses=["This indicates an early death.", "Still about death, sorry."]
    )
    service = NarrativeService(client)
    section = service.generate(facts, "doshas", "en")

    assert len(client.calls) == 2, "a rejection should be retried once"
    assert "Retry notice" in client.calls[1]["system"]
    assert section.is_refusal
    assert section.text == refusal_string("en")
    assert any("death_or_lifespan" in w for w in section.warnings)


def test_a_retry_that_complies_is_accepted(facts: dict[str, Any]) -> None:
    client = ScriptedClient(
        responses=["This indicates an early death.", "Tradition counsels care (mars_in_house_7)."]
    )
    service = NarrativeService(client)
    section = service.generate(facts, "doshas", "en")
    assert not section.is_refusal
    assert "care" in section.text


def test_strict_mode_raises_instead_of_refusing(facts: dict[str, Any]) -> None:
    service = NarrativeService(
        ScriptedClient(responses=["An early death is indicated."]), strict=True, max_attempts=1
    )
    with pytest.raises(NarrativeRejectedError) as excinfo:
        service.generate(facts, "doshas", "en")
    assert "death_or_lifespan" in str(excinfo.value)
    assert excinfo.value.attempts == 1


def test_refusals_are_cached_too(facts: dict[str, Any]) -> None:
    """A chart that reliably provokes a rejection must not retry on every request."""
    client = ScriptedClient(responses=["An early death.", "An early death."])
    service = NarrativeService(client)
    service.generate(facts, "doshas", "en")
    calls_after_first = len(client.calls)
    second = service.generate(facts, "doshas", "en")
    assert second.cached and second.is_refusal
    assert len(client.calls) == calls_after_first


def test_disabled_service_returns_the_requested_locale_refusal(facts: dict[str, Any]) -> None:
    """With generation off, no chart data reaches a transport at all."""
    client = ScriptedClient(responses=["should never be used"])
    service = NarrativeService(client, enabled=False)
    section = service.generate(facts, "doshas", "mr")
    assert section.is_refusal
    assert section.text == refusal_string("mr")
    assert section.model == "generation-disabled"
    assert client.calls == [], "the transport must not be called when disabled"


def test_generate_all_skips_sections_the_chart_cannot_support() -> None:
    """A time-unknown chart has no dasha, so no dasha prose is requested.

    Asking for prose about an absent section is an invitation to invent it.
    """
    from core.enums import TimeAccuracy

    birth = BirthData(
        name="Unknown",
        date=dt.date(1990, 6, 15),
        time=None,
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata"),
        time_accuracy=TimeAccuracy.UNKNOWN,
    )
    facts = build_chart_facts(
        compute_full_reading(birth, now=dt.datetime(2026, 7, 30, tzinfo=dt.UTC))
    )
    service = NarrativeService(ScriptedClient(responses=["Prose."]))
    sections = service.generate_all(facts, "en")
    produced = {s.section for s in sections}
    assert "panchang" in produced
    assert "dasha" not in produced
    assert "lagna_and_grahas" not in produced


def test_unknown_section_is_rejected(facts: dict[str, Any]) -> None:
    service = NarrativeService(ScriptedClient())
    with pytest.raises(PromptError):
        service.generate(facts, "career_forecast", "en")


def test_transport_failure_propagates(facts: dict[str, Any]) -> None:
    """A network failure is not a content refusal and must not be cached as one."""

    class Failing:
        model = "failing"

        def complete(self, *, system: str, user: str) -> Any:
            raise LLMError("connection reset")

    service = NarrativeService(Failing())  # type: ignore[arg-type]
    with pytest.raises(LLMError):
        service.generate(facts, "doshas", "en")
    assert len(service.cache) == 0


def test_scripted_client_records_what_was_sent(facts: dict[str, Any]) -> None:
    """The payload must be the narrowed projection, not the whole document."""
    client = ScriptedClient(responses=["Prose (mars_in_house_7)."])
    NarrativeService(client).generate(facts, "doshas", "en")
    user = client.calls[0]["user"]
    assert "doshas" in user
    assert "ashtakavarga" not in user, "the doshas section was shown the whole chart"


def test_refusing_client_is_inert() -> None:
    client = RefusingClient(text="no")
    assert client.complete(system="a", user="b").text == "no"
    assert client.model == "generation-disabled"


def test_cache_evicts_least_recently_used() -> None:
    cache = NarrativeCache(maxsize=2)
    cache.put("a", "1")
    cache.put("b", "2")
    assert cache.get("a") == "1"  # promotes a
    cache.put("c", "3")  # evicts b
    assert cache.get("b") is None
    assert cache.get("a") == "1"
    assert len(cache) == 2
    cache.clear()
    assert len(cache) == 0 and cache.hits == 0


def test_prompt_version_is_semver() -> None:
    parts = PROMPT_VERSION.split(".")
    assert len(parts) == 3 and all(p.isdigit() for p in parts)


# ---------------------------------------------------------------------------
# The locale audit guards the guard (CLAUDE.md 7, 9.7)
# ---------------------------------------------------------------------------


def test_locale_audit_is_clean() -> None:
    """The CI gate, asserted here too so a locale edit fails in the test run."""
    from tools.locale_audit import audit

    assert audit() == []


def test_locale_audit_catches_a_category_with_no_patterns() -> None:
    """A present-but-empty blocklist category leaves that locale unguarded.

    Key parity alone would pass it, which is why `audit_blocklists` exists. The
    required categories are read from the validator, so this also pins that a new
    CLAUDE.md 6.6 prohibition cannot ship with only English patterns.
    """
    from tools.locale_audit import audit_blocklists

    good = {
        "narrative": {"blocklist": {category: ["मृत्यू"] for category in sorted(REQUIRED_CATEGORIES)}}
    }
    assert audit_blocklists({"mr": good}) == []

    emptied = {"narrative": {"blocklist": {**good["narrative"]["blocklist"], "legal_outcome": []}}}
    problems = audit_blocklists({"mr": emptied})
    assert any("legal_outcome" in line and "unguarded" in line for line in problems)

    dropped = {
        "narrative": {
            "blocklist": {
                k: v for k, v in good["narrative"]["blocklist"].items() if k != "marital_verdict"
            }
        }
    }
    assert any("marital_verdict" in line for line in audit_blocklists({"mr": dropped}))


def test_locale_audit_rejects_a_latin_pattern_in_a_devanagari_locale() -> None:
    """An English regex cannot match Marathi prose, so it is not a guard at all."""
    from tools.locale_audit import audit_blocklists

    blocklist = {category: ["मृत्यू"] for category in sorted(REQUIRED_CATEGORIES)}
    blocklist["death_or_lifespan"] = ["will die"]
    problems = audit_blocklists({"mr": {"narrative": {"blocklist": blocklist}}})
    assert any("no Devanagari" in line for line in problems)


def test_narrative_test_cli_reports_no_problems() -> None:
    """The ``/narrative-test`` gate, run in-process.

    The CLI is the CI gate; running it here means a locale edit that weakens a
    pattern fails the test suite too, rather than only the workflow.
    """
    from tools.narrative_test import run

    assert run(verbose=False) == []

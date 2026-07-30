"""Rule engine, computed doshas, Guna Milan, Namakaran and numerology."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from core.chart.assemble import Chart, compute_chart
from core.doshas.computed import (
    NAKSHATRA_GANA,
    NAKSHATRA_NADI,
    SadeSatiPhase,
    gana_of,
    kaal_sarpa,
    nadi_dosha,
    nadi_of,
    sade_sati,
)
from core.enums import Gana, Graha, Nadi, Strength
from core.ephemeris.adapter import Ephemeris
from core.milan.ashtakoot import (
    KOOT_MAX,
    MAX_POINTS,
    NAKSHATRA_YONI,
    RASHI_VARNA,
    RASHI_VASHYA,
    YONI_ENEMIES,
    bhakoot_koot,
    compute_milan,
    gana_koot,
    graha_maitri_koot,
    nadi_koot,
    tara_koot,
    varna_koot,
    vashya_koot,
    yoni_koot,
)
from core.name.namakaran import (
    NAMAKARAN_SYLLABLES,
    check_namakaran,
    name_onset,
    syllables_for,
)
from core.name.numerology import (
    CHALDEAN,
    IS_JYOTISH,
    PYTHAGOREAN,
    compute_numerology,
    reduce_to_digit,
)
from core.panchang.day import panchang_for_instant
from core.rules.engine import (
    LEAF_EVALUATORS,
    RuleContext,
    RuleError,
    evaluate,
    evaluate_rules,
    load_doshas,
    load_rules,
    load_yogas,
)


@pytest.fixture(scope="module")
def chart(request: pytest.FixtureRequest) -> Chart:
    ephemeris = request.getfixturevalue("ephemeris")
    place = request.getfixturevalue("pune")
    when = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    day, _moment = panchang_for_instant(ephemeris, dt.date(1990, 6, 15), when, place)
    return compute_chart(ephemeris, when, place, day.lights, day.vara.index)


# ---------------------------------------------------------------------------
# Rule engine
# ---------------------------------------------------------------------------


def test_rule_files_load_and_validate() -> None:
    """Every predicate key in both YAML files is known at load time."""
    yogas = load_yogas()
    doshas = load_doshas()
    assert len(yogas) >= 15
    assert len(doshas) >= 5
    for rule in (*yogas, *doshas):
        assert rule.key
        assert rule.citation, f"{rule.key} has no classical citation"
        assert rule.strength in set(Strength)


def test_required_yogas_from_the_spec_are_present() -> None:
    """CLAUDE.md 3.3 names these by name."""
    keys = {r.key for r in load_yogas()}
    assert "gajakesari" in keys
    assert "budha_aditya" in keys
    assert "kemadruma" in keys
    assert "chandra_mangal" in keys
    assert any(k.startswith("raja_yoga_") for k in keys), "Raja yogas"
    # Panchamahapurusha: the five great-person yogas.
    assert {"ruchaka", "bhadra", "hamsa", "malavya", "shasha"} <= keys


def test_mangal_dosha_has_one_rule_per_school(chart: Chart) -> None:
    """CLAUDE.md 3.5: the differing house sets are configurable rule sets, and the
    applied one is stated."""
    doshas = load_doshas()
    mangal = [r for r in doshas if r.key == "mangal_dosha"]
    assert {r.ruleset for r in mangal} == {"maharashtra", "north_school", "south_school"}

    for ruleset in ("maharashtra", "north_school", "south_school"):
        matches = evaluate_rules(doshas, chart, ruleset=ruleset)
        for match in matches:
            if match.key == "mangal_dosha":
                assert match.ruleset == ruleset


def test_house_sets_differ_between_schools_by_the_second_house() -> None:
    """The single most consequential difference between the two main schools."""
    doshas = {(r.key, r.ruleset): r for r in load_doshas()}
    maharashtra = doshas[("mangal_dosha", "maharashtra")].predicate
    north = doshas[("mangal_dosha", "north_school")].predicate
    mh_houses = set(maharashtra["graha_in_house"]["houses"])
    north_houses = set(north["graha_in_house"]["houses"])
    assert north_houses - mh_houses == {2}


def test_every_match_carries_evidence(chart: Chart) -> None:
    """CLAUDE.md 3.3, 6.3, 8: a finding without a trace is a fortune cookie."""
    for match in (*evaluate_rules(load_yogas(), chart), *evaluate_rules(load_doshas(), chart)):
        assert match.evidence, f"{match.key} fired with no evidence"
        for item in match.evidence:
            assert item == item.lower()
            assert " " not in item, f"evidence must be a machine key, got {item!r}"


def test_evidence_is_deduplicated_but_ordered(chart: Chart) -> None:
    for match in evaluate_rules(load_yogas(), chart):
        assert len(match.evidence) == len(set(match.evidence))


def test_unknown_predicate_is_a_load_error(tmp_path: Any) -> None:
    """A typo in a rule file must fail the build, not silently disable a yoga."""
    bad = tmp_path / "bad.yaml"
    bad.write_text(
        "rules:\n  - key: nonsense\n    provenance: shastra\n"
        "    when:\n      graha_in_hous: {graha: sun, houses: [1]}\n",
        encoding="utf-8",
    )
    with pytest.raises(RuleError, match="unknown predicate"):
        load_rules(bad)


def test_missing_when_clause_is_a_load_error(tmp_path: Any) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("rules:\n  - key: nonsense\n", encoding="utf-8")
    with pytest.raises(RuleError, match="missing its 'when'"):
        load_rules(bad)


def test_duplicate_key_and_ruleset_is_a_load_error(tmp_path: Any) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text(
        "rules:\n"
        "  - key: dup\n    provenance: shastra\n    when: {retrograde: {graha: mars}}\n"
        "  - key: dup\n    provenance: shastra\n    when: {retrograde: {graha: venus}}\n",
        encoding="utf-8",
    )
    with pytest.raises(RuleError, match="duplicate rule"):
        load_rules(bad)


def test_combinators(chart: Chart) -> None:
    ctx = RuleContext(chart=chart)
    always = {"graha_in_house": {"graha": "sun", "houses": list(range(1, 13))}}
    never = {"graha_in_house": {"graha": "sun", "houses": []}}

    assert evaluate({"all": [always, always]}, ctx)[0]
    assert not evaluate({"all": [always, never]}, ctx)[0]
    assert evaluate({"any": [never, always]}, ctx)[0]
    assert not evaluate({"any": [never, never]}, ctx)[0]
    assert evaluate({"not": never}, ctx)[0]
    assert not evaluate({"not": always}, ctx)[0]
    assert evaluate({"at_least": {"count": 2, "of": [always, always, never]}}, ctx)[0]
    assert not evaluate({"at_least": {"count": 3, "of": [always, always, never]}}, ctx)[0]


def test_negation_contributes_no_evidence(chart: Chart) -> None:
    """An absence cannot be pointed at, so ``not`` yields an empty trace."""
    ctx = RuleContext(chart=chart)
    matched, evidence = evaluate({"not": {"graha_in_house": {"graha": "sun", "houses": []}}}, ctx)
    assert matched
    assert evidence == []


def test_predicate_must_have_exactly_one_key(chart: Chart) -> None:
    ctx = RuleContext(chart=chart)
    with pytest.raises(RuleError, match="exactly one key"):
        evaluate({"all": [], "any": []}, ctx)


def test_bad_house_numbers_are_rejected(chart: Chart) -> None:
    ctx = RuleContext(chart=chart)
    with pytest.raises(RuleError, match="out of range"):
        evaluate({"graha_in_house": {"graha": "sun", "houses": [13]}}, ctx)
    with pytest.raises(RuleError, match="must be a list of ints"):
        evaluate({"graha_in_house": {"graha": "sun", "houses": "1"}}, ctx)


def test_bad_graha_name_is_rejected(chart: Chart) -> None:
    ctx = RuleContext(chart=chart)
    with pytest.raises(RuleError, match="bad or missing"):
        evaluate({"graha_in_house": {"graha": "pluto", "houses": [1]}}, ctx)


def test_all_leaf_predicates_are_exercised_by_the_shipped_rules() -> None:
    """Guards against a predicate that exists but no rule uses - dead grammar."""
    used: set[str] = set()

    def walk(predicate: Any) -> None:
        if not isinstance(predicate, dict):
            return
        for name, body in predicate.items():
            if name in ("all", "any"):
                for child in body:
                    walk(child)
            elif name == "not":
                walk(body)
            elif name == "at_least":
                for child in body["of"]:
                    walk(child)
            else:
                used.add(name)

    for rule in (*load_yogas(), *load_doshas()):
        walk(rule.predicate)

    unused = set(LEAF_EVALUATORS) - used
    assert not unused, (
        f"predicates defined but never used by a shipped rule: {sorted(unused)}. "
        "Either use them or remove them - unexercised grammar rots."
    )


def test_rule_context_lookups(chart: Chart) -> None:
    ctx = RuleContext(chart=chart)
    assert 1 <= ctx.house(Graha.SUN) <= 12
    assert 1 <= ctx.rashi(Graha.MOON) <= 12
    assert ctx.house_from(Graha.MOON, Graha.MOON) == 1
    assert ctx.lagna_rashi() == chart.lagna.rashi
    assert ctx.house_lord(1) == ctx.house_lord(1)
    assert set(ctx.grahas_in(range(1, 13))) == set(Graha)
    assert ctx.grahas_in([]) == ()


# ---------------------------------------------------------------------------
# Computed doshas
# ---------------------------------------------------------------------------


def test_kaal_sarpa_reports_absence_with_a_reason(chart: Chart) -> None:
    finding = kaal_sarpa(chart)
    assert finding.key == "kaal_sarpa"
    assert finding.evidence, "an absent dosha still needs its reasoning"
    if not finding.present:
        assert finding.strength is None
        assert "split_across_both_node_arcs" in finding.evidence[0]


def test_kaal_sarpa_detects_a_synthetic_complete_case(chart: Chart) -> None:
    """Constructed so all seven grahas sit in the Rahu-to-Ketu semicircle."""
    from dataclasses import replace

    rahu = chart.grahas[Graha.RAHU].point.sid_lon
    grahas = dict(chart.grahas)
    for index, graha in enumerate(
        (
            Graha.SUN,
            Graha.MOON,
            Graha.MARS,
            Graha.MERCURY,
            Graha.JUPITER,
            Graha.VENUS,
            Graha.SATURN,
        )
    ):
        from core.chart.assemble import resolve_point

        position = grahas[graha]
        grahas[graha] = replace(position, point=resolve_point(rahu + 10.0 + index * 20.0))
    synthetic = replace(chart, grahas=grahas)

    finding = kaal_sarpa(synthetic)
    assert finding.present
    assert finding.strength is Strength.STRONG
    assert finding.detail is not None
    assert finding.detail["completeness"] == "complete"
    assert finding.detail["arc"] == "rahu_to_ketu"


def test_sade_sati_phases_and_dates(
    ephemeris: Ephemeris, chart: Chart, reference_now: dt.datetime
) -> None:
    """Saturn in the 12th, 1st or 2nd rashi from the natal Moon."""
    state = sade_sati(ephemeris, chart, reference_now)
    moon_rashi = chart.grahas[Graha.MOON].point.rashi
    distance = (state.saturn_rashi - moon_rashi) % 12 + 1

    if state.active:
        assert distance in (12, 1, 2)
        assert state.phase in (
            SadeSatiPhase.RISING,
            SadeSatiPhase.PEAK,
            SadeSatiPhase.SETTING,
        )
        assert state.exit_utc is not None
        assert state.exit_utc > reference_now
        # The whole span is ~7.5 years, so an exit can never be far beyond that.
        assert (state.exit_utc - reference_now).days < 8 * 366
    else:
        assert state.phase is SadeSatiPhase.NONE
        assert distance not in (12, 1, 2)
        assert state.exit_utc is None


def test_sade_sati_over_a_saturn_circuit_is_active_about_a_quarter_of_the_time(
    ephemeris: Ephemeris, chart: Chart
) -> None:
    """Three of twelve rashis, so roughly 25% of any long window."""
    active = 0
    samples = 30
    for year in range(1996, 1996 + samples):
        state = sade_sati(ephemeris, chart, dt.datetime(year, 6, 1, tzinfo=dt.UTC))
        active += int(state.active)
    assert 0.15 < active / samples < 0.40, f"active in {active}/{samples} years"


def test_nadi_and_gana_tables_are_complete_and_balanced() -> None:
    assert len(NAKSHATRA_NADI) == 27
    assert len(NAKSHATRA_GANA) == 27
    # Nine nakshatras per nadi is the classical distribution.
    for nadi in Nadi:
        assert sum(1 for n in NAKSHATRA_NADI if n is nadi) == 9
    # Each gana holds nine nakshatras too.
    for gana in Gana:
        assert sum(1 for g in NAKSHATRA_GANA if g is gana) == 9
    with pytest.raises(ValueError):
        nadi_of(28)
    with pytest.raises(ValueError):
        gana_of(0)


def test_nadi_dosha_is_information_with_evidence() -> None:
    same = nadi_dosha(1, 7)  # Ashwini and Punarvasu are both Adi
    assert nadi_of(1) is nadi_of(7) is Nadi.ADI
    assert same.present
    assert same.detail is not None and same.detail["same_nadi"] is True
    different = nadi_dosha(1, 2)
    assert not different.present
    assert different.strength is None


# ---------------------------------------------------------------------------
# Guna Milan
# ---------------------------------------------------------------------------


def test_koot_maxima_sum_to_thirty_six() -> None:
    assert sum(KOOT_MAX.values()) == MAX_POINTS == 36
    assert KOOT_MAX == {
        "varna": 1,
        "vashya": 2,
        "tara": 3,
        "yoni": 4,
        "graha_maitri": 5,
        "gana": 6,
        "bhakoot": 7,
        "nadi": 8,
    }


def test_milan_never_returns_a_bare_total() -> None:
    """CLAUDE.md 3.5: per-koot score with the reason, never a bare total."""
    result = compute_milan(
        bride_moon_rashi=4,
        bride_moon_nakshatra=8,
        bride_moon_pada=1,
        groom_moon_rashi=7,
        groom_moon_nakshatra=15,
        groom_moon_pada=3,
    )
    assert len(result.koots) == 8
    assert {k.koot for k in result.koots} == set(KOOT_MAX)
    for koot in result.koots:
        assert koot.evidence, f"{koot.koot} scored with no reason"
        assert 0.0 <= koot.points <= koot.max_points
        assert koot.max_points == KOOT_MAX[koot.koot]
    assert 0.0 <= result.total <= MAX_POINTS
    assert result.max_total == 36


@pytest.mark.parametrize(
    "bride_rashi, groom_rashi, bride_nak, groom_nak",
    [(1, 1, 1, 1), (4, 10, 8, 22), (7, 8, 15, 19), (12, 3, 27, 5), (2, 9, 4, 20)],
)
def test_milan_totals_stay_in_range_across_pairings(
    bride_rashi: int, groom_rashi: int, bride_nak: int, groom_nak: int
) -> None:
    result = compute_milan(
        bride_moon_rashi=bride_rashi,
        bride_moon_nakshatra=bride_nak,
        bride_moon_pada=1,
        groom_moon_rashi=groom_rashi,
        groom_moon_nakshatra=groom_nak,
        groom_moon_pada=3,
    )
    assert 0.0 <= result.total <= MAX_POINTS


def test_identical_charts_score_full_marks_except_nadi() -> None:
    """The degenerate case, which is *not* a perfect 36 - and that is classical.

    Two charts with the same Moon rashi and nakshatra take full marks on seven
    koots and **zero on Nadi**, because sharing a nakshatra necessarily means
    sharing a nadi. 36 - 8 = 28.

    This is the clearest illustration of why CLAUDE.md 3.5 forbids reporting a
    bare total: the raw number understates an identical pairing, and the Nadi
    exception rule is precisely what a reader needs to see next to it.
    """
    result = compute_milan(
        bride_moon_rashi=4,
        bride_moon_nakshatra=8,
        bride_moon_pada=2,
        groom_moon_rashi=4,
        groom_moon_nakshatra=8,
        groom_moon_pada=2,
    )
    assert result.total == pytest.approx(MAX_POINTS - KOOT_MAX["nadi"]) == 28.0
    # And no Nadi exception: identical nakshatra *and* pada is the strongest form
    # of the dosha, not a cancelled one (audit F-009).
    assert not any(e.koot == "nadi" for e in result.exceptions)
    assert result.koot("nadi").points == 0.0
    assert all(k.is_full for k in result.koots if k.koot != "nadi")


def test_directional_koots_are_not_symmetric() -> None:
    """Varna, Gana and Tara are directional, which is why the API is keyword-only."""
    # Varna: groom must not rank below bride. Mithuna (shudra) bride with Karka
    # (brahmin) groom scores; the reverse does not.
    assert varna_koot(3, 4).points == 1.0
    assert varna_koot(4, 3).points == 0.0
    # Gana: Manushya bride with Rakshasa groom scores 0; the reverse scores 1.
    manushya = next(i + 1 for i, g in enumerate(NAKSHATRA_GANA) if g is Gana.MANUSHYA)
    rakshasa = next(i + 1 for i, g in enumerate(NAKSHATRA_GANA) if g is Gana.RAKSHASA)
    assert gana_koot(manushya, rakshasa).points == 0.0
    assert gana_koot(rakshasa, manushya).points == 1.0


def test_bhakoot_axes_score_zero() -> None:
    """The 6/8, 5/9 and 2/12 axes are the classical Bhakoot dosha."""
    assert bhakoot_koot(1, 6).points == 0.0  # 6/8
    assert bhakoot_koot(1, 5).points == 0.0  # 5/9
    assert bhakoot_koot(1, 2).points == 0.0  # 2/12
    assert bhakoot_koot(1, 4).points == 7.0
    assert bhakoot_koot(1, 1).points == 7.0


def test_bhakoot_is_symmetric() -> None:
    """The count is taken both ways, so a 2/12 relation is caught from either side."""
    for a in range(1, 13):
        for b in range(1, 13):
            assert bhakoot_koot(a, b).points == bhakoot_koot(b, a).points


def test_nadi_koot_and_its_exceptions() -> None:
    assert nadi_koot(1, 1).points == 0.0  # same nakshatra, same nadi
    assert nadi_koot(1, 2).points == 8.0

    result = compute_milan(
        bride_moon_rashi=1,
        bride_moon_nakshatra=1,
        bride_moon_pada=1,
        groom_moon_rashi=1,
        groom_moon_nakshatra=1,
        groom_moon_pada=4,
    )
    assert result.koot("nadi").points == 0.0
    assert any(e.koot == "nadi" for e in result.exceptions), (
        "same nakshatra with differing padas must surface the Nadi exception (CLAUDE.md 3.5)"
    )


def test_bhakoot_exceptions_are_reported_not_folded_in() -> None:
    """Exceptions sit beside the score; the total is never silently adjusted."""
    # Mesha and Vrishchika are 2/12 apart and share Mars as lord.
    result = compute_milan(
        bride_moon_rashi=1,
        bride_moon_nakshatra=3,
        bride_moon_pada=1,
        groom_moon_rashi=8,
        groom_moon_nakshatra=17,
        groom_moon_pada=1,
    )
    bhakoot = result.koot("bhakoot")
    assert bhakoot.points == 0.0
    keys = {e.key for e in result.exceptions}
    assert "bhakoot_exception_same_rashi_lord" in keys
    # The total still excludes the seven points - the exception is information.
    assert result.total == sum(k.points for k in result.koots)


def test_tara_counts_both_directions() -> None:
    score = tara_koot(5, 20)
    assert len(score.evidence) == 2
    assert {"bride_to_groom", "groom_to_bride"} <= {
        e.split("_remainder_")[0].removeprefix("tara_") for e in score.evidence
    }
    assert score.points in (0.0, 1.5, 3.0)


def test_yoni_enemy_pairs_score_zero_and_same_yoni_scores_four() -> None:
    assert len(NAKSHATRA_YONI) == 27
    ashwini, shatataraka = 1, 24  # both ashva
    assert NAKSHATRA_YONI[ashwini - 1] == NAKSHATRA_YONI[shatataraka - 1] == "ashva"
    assert yoni_koot(ashwini, shatataraka).points == 4.0

    for pair in YONI_ENEMIES:
        a, b = sorted(pair)
        nak_a = NAKSHATRA_YONI.index(a) + 1
        nak_b = NAKSHATRA_YONI.index(b) + 1
        assert yoni_koot(nak_a, nak_b).points == 0.0, f"{a} vs {b}"


def test_graha_maitri_uses_natural_friendship() -> None:
    """Same lord scores full; sworn enemies score least."""
    assert graha_maitri_koot(1, 8).points == 5.0  # both Mars-ruled
    sun_moon = graha_maitri_koot(5, 4)  # Simha (Sun) and Karka (Moon), mutual friends
    assert sun_moon.points == 5.0
    hostile = graha_maitri_koot(5, 10)  # Simha (Sun) and Makara (Saturn), mutual enemies
    assert hostile.points < 2.0


def test_varna_and_vashya_tables_are_complete() -> None:
    assert len(RASHI_VARNA) == 12
    assert len(RASHI_VASHYA) == 12
    for rashi in range(1, 13):
        assert 0.0 <= varna_koot(rashi, rashi).points <= 1.0
        assert 0.0 <= vashya_koot(rashi, rashi).points <= 2.0


def test_milan_rejects_out_of_range_input() -> None:
    with pytest.raises(ValueError, match="bride_moon_rashi"):
        compute_milan(
            bride_moon_rashi=13,
            bride_moon_nakshatra=1,
            bride_moon_pada=1,
            groom_moon_rashi=1,
            groom_moon_nakshatra=1,
            groom_moon_pada=1,
        )
    with pytest.raises(ValueError, match="groom_moon_nakshatra"):
        compute_milan(
            bride_moon_rashi=1,
            bride_moon_nakshatra=1,
            bride_moon_pada=1,
            groom_moon_rashi=1,
            groom_moon_nakshatra=28,
            groom_moon_pada=1,
        )


# ---------------------------------------------------------------------------
# Namakaran
# ---------------------------------------------------------------------------


def test_syllable_table_is_complete() -> None:
    """27 nakshatras x 4 padas = 108 traditional syllables."""
    assert len(NAMAKARAN_SYLLABLES) == 27
    assert all(len(group) == 4 for group in NAMAKARAN_SYLLABLES)
    assert sum(len(group) for group in NAMAKARAN_SYLLABLES) == 108
    assert syllables_for(1) == ("chu", "che", "cho", "la")
    assert syllables_for(27) == ("de", "do", "cha", "chi")
    with pytest.raises(ValueError):
        syllables_for(28)


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Chinmay", "chi"),
        ("Cinmay", "ci"),
        ("Avinash", "a"),
        ("Shailesh", "sha"),
        ("Bhalchandra", "bha"),
        ("Om", "o"),
        ("", ""),
        ("   ", ""),
        ("7up", "u"),  # digits are not letters and must not reach the onset
        ("O'Brien", "o"),  # nor punctuation
    ],
)
def test_name_onset_extraction(name: str, expected: str) -> None:
    assert name_onset(name) == expected


def test_devanagari_names_are_understood() -> None:
    """A Marathi user typing in Devanagari must not be told their name is unreadable."""
    assert name_onset("चिन्मय") == "chi"
    assert name_onset("अविनाश") == "a"
    assert name_onset("मंगला") == "ma"


def test_namakaran_match_is_information_not_a_defect() -> None:
    """CLAUDE.md 3.6: report match/mismatch, and never as a defect."""
    match = check_namakaran("Chinmay", 27, 4)  # Revati pada 4 -> "chi"
    assert match.matches_pada
    assert match.matches_nakshatra
    assert "onset_matches_pada_syllable" in match.evidence

    other_pada = check_namakaran("Devendra", 27, 4)  # "de" is Revati pada 1
    assert not other_pada.matches_pada
    assert other_pada.matches_nakshatra
    assert "onset_matches_another_pada_of_same_nakshatra" in other_pada.evidence

    mismatch = check_namakaran("Zubin", 27, 4)
    assert not mismatch.matches_pada
    assert not mismatch.matches_nakshatra
    assert "onset_matches_no_syllable_of_nakshatra" in mismatch.evidence


def test_namakaran_tolerates_transliteration_variants() -> None:
    """Chinmay, Cinmay: same Devanagari onset, different Latin spelling."""
    assert check_namakaran("Cinmay", 27, 4).matches_pada
    assert check_namakaran("Wasant", 4, 2).matches_pada  # Rohini pada 2 -> "va"
    assert check_namakaran("Vasant", 4, 2).matches_pada


def test_namakaran_handles_an_unreadable_name() -> None:
    blank = check_namakaran("123", 1, 1)
    assert not blank.matches_pada
    assert blank.evidence == ("name_has_no_recognisable_onset",)


def test_namakaran_rejects_bad_indices() -> None:
    with pytest.raises(ValueError, match="nakshatra"):
        check_namakaran("x", 0, 1)
    with pytest.raises(ValueError, match="pada"):
        check_namakaran("x", 1, 5)


# ---------------------------------------------------------------------------
# Numerology
# ---------------------------------------------------------------------------


def test_numerology_is_flagged_as_not_jyotish() -> None:
    """CLAUDE.md 3.6: a separate non-Jyotish system, clearly labelled."""
    assert IS_JYOTISH is False
    assert compute_numerology("Avinash").is_jyotish is False


def test_chaldean_reserves_nine() -> None:
    assert 9 not in CHALDEAN.values()
    assert max(CHALDEAN.values()) == 8
    assert len(CHALDEAN) == 26


def test_pythagorean_walks_the_alphabet_in_nines() -> None:
    assert PYTHAGOREAN["a"] == 1
    assert PYTHAGOREAN["i"] == 9
    assert PYTHAGOREAN["j"] == 1
    assert PYTHAGOREAN["r"] == 9
    assert PYTHAGOREAN["s"] == 1
    assert PYTHAGOREAN["z"] == 8


@pytest.mark.parametrize(
    "total, keep_master, expected",
    [(9, False, 9), (10, False, 1), (11, False, 2), (11, True, 11), (22, True, 22), (38, False, 2)],
)
def test_digit_reduction(total: int, keep_master: bool, expected: int) -> None:
    assert reduce_to_digit(total, keep_master=keep_master) == expected


def test_numerology_arithmetic_is_auditable() -> None:
    reading = compute_numerology("Ram").chaldean
    assert reading.letter_values == (("r", 2), ("a", 1), ("m", 4))
    assert reading.raw_total == 7
    assert reading.reduced == 7
    assert reading.vowel_total == 1
    assert reading.consonant_total == 6


def test_numerology_refuses_to_invent_a_devanagari_mapping() -> None:
    """Neither system has letter values for Devanagari, so none is invented."""
    reading = compute_numerology("अविनाश")
    assert reading.chaldean.raw_total == 0
    assert reading.chaldean.reduced == 0
    assert reading.pythagorean.raw_total == 0


def test_numerology_strips_accents_and_ignores_punctuation() -> None:
    assert (
        compute_numerology("José").chaldean.raw_total
        == compute_numerology("Jose").chaldean.raw_total
    )
    assert (
        compute_numerology("Mary-Ann").chaldean.raw_total
        == compute_numerology("MaryAnn").chaldean.raw_total
    )


# ---------------------------------------------------------------------------
# F-001 / F-002: a transit instant must not depend on when it is asked
# ---------------------------------------------------------------------------


def test_sade_sati_transit_instants_do_not_depend_on_when_they_are_asked(
    ephemeris: Ephemeris, chart: Chart, reference_now: dt.datetime
) -> None:
    """Audit F-001. Saturn's crossing is a fact about Saturn, not about the clock.

    Before the fix, ``_saturn_crossing`` phased its 30-day bracket grid on the
    caller's ``now`` and ``_bisect_saturn`` returned the midpoint of a bracket it
    stopped narrowing at one minute. The reported exit therefore moved with the
    request: sweeping ``now`` over one grid period gave a **38.67 second** spread,
    which straddled a minute boundary, so the same chart printed 23:57 or 23:58
    depending on the instant it was asked.

    The sweep covers a full 30-day grid period at 7-hour steps, which is what makes
    it a regression test rather than a coincidence: any residual dependence on the
    grid phase shows up as more than one distinct value.
    """
    exits: set[dt.datetime] = set()
    phase_starts: set[dt.datetime] = set()
    for hours in range(0, 30 * 24, 7):
        state = sade_sati(ephemeris, chart, reference_now + dt.timedelta(hours=hours))
        if state.exit_utc is not None:
            exits.add(state.exit_utc)
        if state.phase_start_utc is not None:
            phase_starts.add(state.phase_start_utc)

    assert len(exits) == 1, (
        f"exit_utc took {len(exits)} distinct values over a 30-day sweep of `now`, "
        f"spanning {(max(exits) - min(exits)).total_seconds():.2f} s: {sorted(exits)}"
    )
    assert len(phase_starts) == 1, (
        f"phase_start_utc took {len(phase_starts)} distinct values, spanning "
        f"{(max(phase_starts) - min(phase_starts)).total_seconds():.2f} s"
    )


def test_saturn_crossing_converges_far_below_its_reported_resolution(
    ephemeris: Ephemeris,
) -> None:
    """The solved instant must actually be the crossing, not the middle of a bracket.

    Checked against the quantity itself rather than against a remembered date:
    Saturn's longitude at the returned instant must equal the target. The midpoint
    of a one-minute bracket sits up to 30 s from the root, which at Saturn's
    ~0.033 deg/day is up to ~0.04 arcsec of longitude - measured at 0.0057 arcsec
    before the fix. How far short depended on where the bracket began, which is
    what made the reported instant a function of the caller's clock.
    """
    from core.angles import shortest_separation
    from core.doshas.computed import _saturn_crossing, _saturn_lon
    from core.timeutil import jd_from_utc

    target = 300.0  # 0 deg Makara
    found = _saturn_crossing(ephemeris, dt.datetime(2020, 1, 1, tzinfo=dt.UTC), target)
    assert found is not None
    residual = shortest_separation(_saturn_lon(ephemeris, jd_from_utc(found)), target)
    assert residual < 1e-6, f"Saturn is {residual * 3600:.4f} arcsec from the target"


def test_sade_sati_instants_are_reported_at_whole_seconds(
    ephemeris: Ephemeris, chart: Chart, reference_now: dt.datetime
) -> None:
    """Audit F-021. Do not publish microseconds for a solved root.

    Convergence is to well under a second but not to a microsecond, so printing six
    decimal places claimed a precision the solver does not have - and made the
    trailing float noise part of the narrative cache key.
    """
    state = sade_sati(ephemeris, chart, reference_now)
    for label, value in (("exit", state.exit_utc), ("phase_start", state.phase_start_utc)):
        if value is not None:
            assert value.microsecond == 0, f"{label}_utc carries {value.microsecond} us"


# ---------------------------------------------------------------------------
# F-009: the Nadi exception must test the pada, not only the nakshatra
# ---------------------------------------------------------------------------


def test_nadi_exception_needs_a_different_pada() -> None:
    """Audit F-009. The classical clause is "same nakshatra but *different* padas".

    Firing on a shared nakshatra alone cancels the dosha in the one case where it
    is strongest - the same nakshatra *and* the same pada - which is the worst
    direction to be wrong in. AUDIT.md 5 is blunt about this class of error:
    an app that mishandles the Bhakoot and Nadi exceptions is "doctrinally
    negligent and socially harmful".
    """
    same_pada = compute_milan(
        bride_moon_rashi=1,
        bride_moon_nakshatra=1,
        bride_moon_pada=2,
        groom_moon_rashi=1,
        groom_moon_nakshatra=1,
        groom_moon_pada=2,
    )
    keys = {e.key for e in same_pada.exceptions}
    assert "nadi_exception_same_nakshatra" not in keys, (
        "the exception fired for an identical nakshatra AND pada, which is the "
        "strongest form of Nadi dosha, not a cancelled one"
    )

    different_pada = compute_milan(
        bride_moon_rashi=1,
        bride_moon_nakshatra=1,
        bride_moon_pada=1,
        groom_moon_rashi=1,
        groom_moon_nakshatra=1,
        groom_moon_pada=3,
    )
    assert "nadi_exception_same_nakshatra" in {e.key for e in different_pada.exceptions}


def test_the_nadi_score_itself_is_unchanged_by_the_pada() -> None:
    """Only the *exception* is pada-sensitive; the koot score is not.

    Nadi is scored from the nakshatra's nadi group, which a pada does not change.
    Pinned so a future edit cannot quietly make the score depend on it.
    """
    scores = {
        compute_milan(
            bride_moon_rashi=1,
            bride_moon_nakshatra=1,
            bride_moon_pada=pada,
            groom_moon_rashi=1,
            groom_moon_nakshatra=1,
            groom_moon_pada=4,
        )
        .koot("nadi")
        .points
        for pada in (1, 2, 3, 4)
    }
    assert scores == {0.0}


def test_milan_rejects_a_pada_outside_one_to_four() -> None:
    """Same loud rejection the other inputs get (CLAUDE.md 3.1)."""
    with pytest.raises(ValueError, match="pada"):
        compute_milan(
            bride_moon_rashi=1,
            bride_moon_nakshatra=1,
            bride_moon_pada=5,
            groom_moon_rashi=1,
            groom_moon_nakshatra=1,
            groom_moon_pada=1,
        )

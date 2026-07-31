"""Chart engine unit tests: dignity, vargas, aspects, Shadbala, assembly."""

from __future__ import annotations

import datetime as dt

import pytest

from core.angles import DEG_PER_RASHI, norm360
from core.chart.aspects import (
    NATURAL_BENEFICS,
    SPECIAL_FULL_ASPECTS,
    aspects_on,
    graded_drishti_virupa,
    is_benefic,
    sign_aspect_strength,
)
from core.chart.assemble import (
    CHALDEAN_ORDER,
    compute_chart,
    hora_lord_at,
    resolve_point,
    rotate_chart,
    varga_chart,
)
from core.chart.dignity import (
    COMBUSTION_ORB,
    COMBUSTION_ORB_RETROGRADE,
    EXALTATION,
    MOOLATRIKONA,
    OWN_SIGNS,
    combine_maitri,
    debilitation_longitude,
    dignity_of,
    exaltation_longitude,
    is_combust,
    is_in_moolatrikona,
    natural_relation,
    positional_dignity,
    temporal_relation,
)
from core.chart.houses import house_distance, houses_from_rashi, whole_sign_house
from core.chart.shadbala import (
    NAISARGIKA_RANK,
    REQUIRED_RUPAS,
    VIRUPA_PER_RUPA,
    bhava_bala,
    declination_deg,
    detect_planetary_war,
    drekkana_bala,
    ishta_kashta_phala,
    kendradi_bala,
    naisargika_bala,
    ojayugma_bala,
    strongest_graha,
    uchcha_bala,
)
from core.chart.vargas import (
    SAPTAVARGA,
    Varga,
    d2_hora,
    d9_navamsa,
    d30_trimsamsa,
)
from core.enums import RASHI_LORD, SAPTA_GRAHA, Dignity, Graha
from core.ephemeris.adapter import Ephemeris
from core.panchang.day import panchang_for_instant
from core.types import Place


@pytest.fixture(scope="module")
def chart(request: pytest.FixtureRequest):  # type: ignore[no-untyped-def]
    """A single reference chart: Pune, 1990-06-15 14:32 IST."""
    ephemeris = request.getfixturevalue("ephemeris")
    place = request.getfixturevalue("pune")
    when = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    day, _moment = panchang_for_instant(ephemeris, dt.date(1990, 6, 15), when, place)
    return compute_chart(ephemeris, when, place, day.lights, day.vara.index)


# ---------------------------------------------------------------------------
# Dignity
# ---------------------------------------------------------------------------


def test_exaltation_and_debilitation_are_exactly_opposite() -> None:
    for graha in EXALTATION:
        assert norm360(
            exaltation_longitude(graha) - debilitation_longitude(graha)
        ) == pytest.approx(180.0, abs=1e-9)


def test_classical_exaltation_points() -> None:
    """The seven exaltation degrees, as BPHS gives them."""
    assert EXALTATION == {
        Graha.SUN: (1, 10.0),
        Graha.MOON: (2, 3.0),
        Graha.MARS: (10, 28.0),
        Graha.MERCURY: (6, 15.0),
        Graha.JUPITER: (4, 5.0),
        Graha.VENUS: (12, 27.0),
        Graha.SATURN: (7, 20.0),
    }
    assert Graha.RAHU not in EXALTATION, "the nodes carry no exaltation in this engine"
    assert Graha.KETU not in EXALTATION


def test_own_signs_are_derived_from_the_rashi_lord_table() -> None:
    assert OWN_SIGNS[Graha.SUN] == frozenset({5})
    assert OWN_SIGNS[Graha.MOON] == frozenset({4})
    assert OWN_SIGNS[Graha.MERCURY] == frozenset({3, 6})
    assert OWN_SIGNS[Graha.VENUS] == frozenset({2, 7})
    assert OWN_SIGNS[Graha.SATURN] == frozenset({10, 11})
    for rashi, lord in RASHI_LORD.items():
        assert rashi in OWN_SIGNS[lord]


def test_moolatrikona_arcs() -> None:
    assert is_in_moolatrikona(Graha.SUN, 4 * DEG_PER_RASHI + 5.0)  # Simha 5
    assert not is_in_moolatrikona(Graha.SUN, 4 * DEG_PER_RASHI + 25.0)  # Simha 25
    assert is_in_moolatrikona(Graha.MERCURY, 5 * DEG_PER_RASHI + 18.0)  # Kanya 18
    assert not is_in_moolatrikona(Graha.MERCURY, 5 * DEG_PER_RASHI + 10.0)
    assert not is_in_moolatrikona(Graha.RAHU, 0.0)
    for _graha, (_rashi, start, end) in MOOLATRIKONA.items():
        assert 0.0 <= start < end <= 30.0

    # Six of the seven have their moolatrikona inside a sign they own. The Moon is
    # the classical exception: its moolatrikona is Vrishabha 4-30, which Venus
    # owns and which is also the Moon's exaltation sign. Pinned here so the
    # exception cannot be "tidied away" into the general pattern.
    for graha, (rashi, _start, _end) in MOOLATRIKONA.items():
        if graha is Graha.MOON:
            assert rashi == 2
            assert rashi not in OWN_SIGNS[Graha.MOON]
            assert EXALTATION[Graha.MOON][0] == rashi
        else:
            assert rashi in OWN_SIGNS[graha], f"{graha} moolatrikona outside its own signs"


def test_positional_dignity_precedence() -> None:
    """Exaltation outranks moolatrikona, which outranks own sign."""
    # Saturn in Tula 20 is both exalted and (not) own - exaltation wins.
    assert positional_dignity(Graha.SATURN, 6 * DEG_PER_RASHI + 20.0) is Dignity.EXALTED
    # Saturn in Kumbha 5 is moolatrikona (0-20) and own sign - moolatrikona wins.
    assert positional_dignity(Graha.SATURN, 10 * DEG_PER_RASHI + 5.0) is Dignity.MOOLATRIKONA
    # Saturn in Makara is own sign only.
    assert positional_dignity(Graha.SATURN, 9 * DEG_PER_RASHI + 5.0) is Dignity.OWN_SIGN
    # Saturn in Mesha is debilitated.
    assert positional_dignity(Graha.SATURN, 5.0) is Dignity.DEBILITATED
    assert positional_dignity(Graha.RAHU, 5.0) is Dignity.NEUTRAL


def test_natural_friendship_is_asymmetric_where_the_classics_say_so() -> None:
    """The Moon has no natural enemy, yet Venus and Saturn count it an enemy."""
    assert natural_relation(Graha.MOON, Graha.VENUS) is Dignity.NEUTRAL
    assert natural_relation(Graha.VENUS, Graha.MOON) is Dignity.ENEMY
    assert natural_relation(Graha.SUN, Graha.MOON) is Dignity.FRIEND
    assert natural_relation(Graha.SATURN, Graha.SUN) is Dignity.ENEMY
    assert natural_relation(Graha.MOON, Graha.SATURN) is Dignity.NEUTRAL


def test_temporal_relation_houses() -> None:
    """2, 3, 4, 10, 11 and 12 from a graha are its temporary friends."""
    for house in (2, 3, 4, 10, 11, 12):
        assert temporal_relation(house)
    for house in (1, 5, 6, 7, 8, 9):
        assert not temporal_relation(house)


@pytest.mark.parametrize(
    "natural, temporal_friend, expected",
    [
        (Dignity.FRIEND, True, Dignity.GREAT_FRIEND),
        (Dignity.FRIEND, False, Dignity.NEUTRAL),
        (Dignity.NEUTRAL, True, Dignity.FRIEND),
        (Dignity.NEUTRAL, False, Dignity.ENEMY),
        (Dignity.ENEMY, True, Dignity.NEUTRAL),
        (Dignity.ENEMY, False, Dignity.GREAT_ENEMY),
    ],
)
def test_panchadha_maitri_composition(
    natural: Dignity, temporal_friend: bool, expected: Dignity
) -> None:
    assert combine_maitri(natural, temporal_friend) is expected


def test_combustion_orbs_and_exemptions() -> None:
    """The Sun is never combust, nor are the nodes; retrograde tightens the orb."""
    assert not is_combust(Graha.SUN, 100.0, 100.0, False)
    assert not is_combust(Graha.RAHU, 100.5, 100.0, True)
    assert is_combust(Graha.MOON, 105.0, 100.0, False)  # 5 deg, orb 12
    assert not is_combust(Graha.MOON, 115.0, 100.0, False)  # 15 deg
    # Venus: 9 deg is combust when direct (orb 10) but not when retrograde (orb 8).
    assert is_combust(Graha.VENUS, 109.0, 100.0, False)
    assert not is_combust(Graha.VENUS, 109.0, 100.0, True)
    assert COMBUSTION_ORB_RETROGRADE[Graha.VENUS] < COMBUSTION_ORB[Graha.VENUS]


def test_combustion_wraps_across_zero_degrees() -> None:
    assert is_combust(Graha.MARS, 5.0, 355.0, False)  # 10 deg apart across 0


def test_dignity_of_falls_back_to_the_dispositor_relation() -> None:
    """A graha with no positional dignity is judged against its sign lord."""
    # Sun in Mithuna (Mercury's sign) with Mercury nearby.
    others = {Graha.SUN: 2 * DEG_PER_RASHI + 5.0, Graha.MERCURY: 2 * DEG_PER_RASHI + 10.0}
    result = dignity_of(Graha.SUN, others[Graha.SUN], others)
    # Sun regards Mercury as neutral naturally; same house is a temporal enemy
    # (house distance 1), so the compound is ENEMY.
    assert result is Dignity.ENEMY


# ---------------------------------------------------------------------------
# Houses
# ---------------------------------------------------------------------------


def test_whole_sign_house_arithmetic() -> None:
    lagna = 6 * DEG_PER_RASHI + 12.0  # Tula
    assert whole_sign_house(lagna, lagna) == 1
    assert whole_sign_house(7 * DEG_PER_RASHI, lagna) == 2
    assert whole_sign_house(5 * DEG_PER_RASHI, lagna) == 12
    assert houses_from_rashi(7, 7) == 1
    assert houses_from_rashi(1, 7) == 7


def test_house_distance_counts_a_graha_as_first_from_itself() -> None:
    """The convention every classical rule in core/rules/ assumes."""
    assert house_distance(100.0, 100.0) == 1
    assert house_distance(0.0, 30.0) == 2
    assert house_distance(30.0, 0.0) == 12


# ---------------------------------------------------------------------------
# Vargas
# ---------------------------------------------------------------------------


def test_d2_hora_maps_only_to_karka_and_simha() -> None:
    for rashi in range(1, 13):
        base = (rashi - 1) * DEG_PER_RASHI
        assert d2_hora(base + 5.0) in (4, 5)
        assert d2_hora(base + 25.0) in (4, 5)
    # Odd sign: first half Simha, second Karka. Even sign: reversed.
    assert d2_hora(5.0) == 5 and d2_hora(20.0) == 4  # Mesha (odd)
    assert d2_hora(35.0) == 4 and d2_hora(50.0) == 5  # Vrishabha (even)


def test_d9_navamsa_known_values() -> None:
    """0 deg Mesha opens in Mesha; 0 deg Vrishabha opens in Makara."""
    assert d9_navamsa(0.0) == 1
    assert d9_navamsa(3.0) == 1
    assert d9_navamsa(3.5) == 2  # second navamsa of Mesha
    assert d9_navamsa(30.0) == 10  # Vrishabha is fixed, starts at its 9th
    assert d9_navamsa(60.0) == 7  # Mithuna is dual, starts at its 5th


def test_d30_excludes_the_luminaries_and_uses_unequal_arcs() -> None:
    # Odd sign (Mesha): 0-5 Mars, 5-10 Saturn, 10-18 Jupiter, 18-25 Mercury, 25-30 Venus.
    assert d30_trimsamsa(2.0) == 1  # Mesha
    assert d30_trimsamsa(7.0) == 11  # Kumbha
    assert d30_trimsamsa(15.0) == 9  # Dhanu
    assert d30_trimsamsa(20.0) == 3  # Mithuna
    assert d30_trimsamsa(28.0) == 7  # Tula
    # Even sign (Vrishabha): 0-5 Venus, 5-12 Mercury, 12-20 Jupiter, 20-25 Saturn, 25-30 Mars.
    assert d30_trimsamsa(30.0 + 2.0) == 2  # Vrishabha
    assert d30_trimsamsa(30.0 + 8.0) == 6  # Kanya
    assert d30_trimsamsa(30.0 + 15.0) == 12  # Meena
    assert d30_trimsamsa(30.0 + 22.0) == 10  # Makara
    assert d30_trimsamsa(30.0 + 28.0) == 8  # Vrishchika


def test_saptavarga_is_the_seven_shadbala_vargas() -> None:
    assert SAPTAVARGA == (
        Varga.D1,
        Varga.D2,
        Varga.D3,
        Varga.D7,
        Varga.D9,
        Varga.D12,
        Varga.D30,
    )


def test_all_sixteen_vargas_are_present() -> None:
    """CLAUDE.md 3.3 names sixteen divisional charts."""
    from core.chart.vargas import VARGA_FUNCTIONS

    assert len(VARGA_FUNCTIONS) == 16
    assert set(VARGA_FUNCTIONS) == set(Varga)


# ---------------------------------------------------------------------------
# Aspects
# ---------------------------------------------------------------------------


def test_every_graha_aspects_its_seventh_fully() -> None:
    for graha in SAPTA_GRAHA:
        assert sign_aspect_strength(graha, 7) == 1.0


def test_special_aspects_are_full_and_not_reciprocal() -> None:
    """Saturn sees its 3rd and 10th fully; nothing sees Saturn back from there."""
    assert SPECIAL_FULL_ASPECTS[Graha.MARS] == frozenset({4, 7, 8})
    assert SPECIAL_FULL_ASPECTS[Graha.JUPITER] == frozenset({5, 7, 9})
    assert SPECIAL_FULL_ASPECTS[Graha.SATURN] == frozenset({3, 7, 10})

    assert sign_aspect_strength(Graha.SATURN, 3) == 1.0
    assert sign_aspect_strength(Graha.SATURN, 10) == 1.0
    # Venus, with no special aspect, sees the 3rd only weakly and the 10th weakly.
    assert sign_aspect_strength(Graha.VENUS, 3) == 0.25
    assert sign_aspect_strength(Graha.VENUS, 10) == 0.25
    # Jupiter's 5th and 9th are full for Jupiter, half for everyone else.
    assert sign_aspect_strength(Graha.JUPITER, 5) == 1.0
    assert sign_aspect_strength(Graha.MOON, 5) == 0.5
    assert sign_aspect_strength(Graha.MOON, 2) == 0.0


def test_graded_drishti_curve() -> None:
    """The Parashari piecewise scale, at its named breakpoints."""
    assert graded_drishti_virupa(0.0) == 0.0
    assert graded_drishti_virupa(29.0) == 0.0
    assert graded_drishti_virupa(30.0) == pytest.approx(0.0)
    assert graded_drishti_virupa(60.0) == pytest.approx(60.0)
    assert graded_drishti_virupa(90.0) == pytest.approx(15.0)
    assert graded_drishti_virupa(120.0) == pytest.approx(45.0)
    assert graded_drishti_virupa(150.0) == pytest.approx(60.0)
    assert graded_drishti_virupa(180.0) == pytest.approx(0.0)
    # Symmetric about the opposition.
    assert graded_drishti_virupa(200.0) == pytest.approx(graded_drishti_virupa(160.0))


def test_aspects_on_excludes_the_nodes_by_default() -> None:
    positions = {Graha.SATURN: 0.0, Graha.RAHU: 0.0, Graha.JUPITER: 100.0}
    target = 180.0
    without = {a.aspecting for a in aspects_on(target, positions)}
    with_nodes = {a.aspecting for a in aspects_on(target, positions, include_nodes=True)}
    assert Graha.RAHU not in without
    assert Graha.RAHU in with_nodes


def test_a_graha_does_not_aspect_its_own_house() -> None:
    positions = {Graha.MARS: 10.0}
    assert aspects_on(15.0, positions) == ()


def test_benefic_classification() -> None:
    assert is_benefic(Graha.JUPITER)
    assert is_benefic(Graha.VENUS)
    assert not is_benefic(Graha.SATURN)
    assert not is_benefic(Graha.RAHU)
    assert Graha.MERCURY in NATURAL_BENEFICS


# ---------------------------------------------------------------------------
# Shadbala components
# ---------------------------------------------------------------------------


def test_uchcha_bala_peaks_at_exaltation_and_is_zero_at_debilitation() -> None:
    for graha in SAPTA_GRAHA:
        assert uchcha_bala(graha, exaltation_longitude(graha)) == pytest.approx(60.0, abs=1e-9)
        assert uchcha_bala(graha, debilitation_longitude(graha)) == pytest.approx(0.0, abs=1e-9)
    assert uchcha_bala(Graha.RAHU, 0.0) == 0.0


def test_kendradi_bala_bands() -> None:
    for house in (1, 4, 7, 10):
        assert kendradi_bala(house) == 60.0
    for house in (2, 5, 8, 11):
        assert kendradi_bala(house) == 30.0
    for house in (3, 6, 9, 12):
        assert kendradi_bala(house) == 15.0


def test_drekkana_bala_is_gendered() -> None:
    """Male grahas want the first third of a sign, neuter the second, female the third."""
    assert drekkana_bala(Graha.SUN, 5.0) == 15.0
    assert drekkana_bala(Graha.SUN, 15.0) == 0.0
    assert drekkana_bala(Graha.MERCURY, 15.0) == 15.0
    assert drekkana_bala(Graha.MERCURY, 5.0) == 0.0
    assert drekkana_bala(Graha.VENUS, 25.0) == 15.0
    assert drekkana_bala(Graha.RAHU, 5.0) == 0.0


def test_ojayugma_bala_prefers_even_signs_for_moon_and_venus() -> None:
    """15 virupas each from D1 and D9, so 30 at most."""
    even_sign = DEG_PER_RASHI + 1.0  # Vrishabha, even
    odd_sign = 1.0  # Mesha, odd
    assert ojayugma_bala(Graha.MOON, even_sign) >= 15.0
    assert ojayugma_bala(Graha.SUN, odd_sign) >= 15.0
    for graha in SAPTA_GRAHA:
        for lon in (odd_sign, even_sign):
            assert 0.0 <= ojayugma_bala(graha, lon) <= 30.0


def test_naisargika_bala_is_an_even_ladder() -> None:
    values = {g: naisargika_bala(g) for g in SAPTA_GRAHA}
    assert values[Graha.SUN] == pytest.approx(60.0)
    assert values[Graha.SATURN] == pytest.approx(60.0 / 7)
    assert naisargika_bala(Graha.RAHU) == 0.0
    ordered = sorted(SAPTA_GRAHA, key=lambda g: NAISARGIKA_RANK[g])
    strengths = [values[g] for g in ordered]
    assert strengths == sorted(strengths), "the ladder must be monotonic"


def test_declination_uses_tropical_longitude() -> None:
    """Declination is equatorial: at 90 deg tropical it equals the obliquity."""
    assert declination_deg(0.0, 0.0, 23.44) == pytest.approx(0.0, abs=1e-9)
    assert declination_deg(90.0, 0.0, 23.44) == pytest.approx(23.44, abs=1e-9)
    assert declination_deg(270.0, 0.0, 23.44) == pytest.approx(-23.44, abs=1e-9)
    assert declination_deg(180.0, 0.0, 23.44) == pytest.approx(0.0, abs=1e-6)


def test_planetary_war_excludes_the_luminaries() -> None:
    """A graha near the Sun is combust, which is a different condition."""
    close = dict.fromkeys(SAPTA_GRAHA, 100.0)
    at_war = detect_planetary_war(close)
    assert not at_war[Graha.SUN]
    assert not at_war[Graha.MOON]
    assert at_war[Graha.MARS] and at_war[Graha.SATURN]

    spread = {g: i * 40.0 for i, g in enumerate(SAPTA_GRAHA)}
    assert not any(detect_planetary_war(spread).values())


def test_ishta_kashta_phala_are_complements() -> None:
    ishta, kashta = ishta_kashta_phala(Graha.SUN, exaltation_longitude(Graha.SUN), 60.0)
    assert ishta == pytest.approx(60.0)
    assert kashta == pytest.approx(0.0)
    ishta, kashta = ishta_kashta_phala(Graha.SUN, debilitation_longitude(Graha.SUN), 60.0)
    assert ishta == pytest.approx(0.0)
    assert kashta == pytest.approx(60.0)


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def test_resolve_point_is_self_consistent() -> None:
    point = resolve_point(187.4321)
    assert point.rashi == 7
    assert point.rashi_key == "tula"
    assert point.deg_in_rashi == pytest.approx(7.4321)
    assert 1 <= point.nakshatra <= 27
    assert 1 <= point.pada <= 4


def test_chart_has_all_nine_grahas_with_shadbala_only_for_seven(chart) -> None:  # type: ignore[no-untyped-def]
    assert len(chart.grahas) == 9
    for graha in SAPTA_GRAHA:
        assert chart.grahas[graha].shadbala is not None
    for node in (Graha.RAHU, Graha.KETU):
        assert chart.grahas[node].shadbala is None, "the nodes have no Shadbala"


def test_shadbala_totals_are_the_sum_of_their_components(chart) -> None:  # type: ignore[no-untyped-def]
    """The whole point of returning components: the total must be checkable."""
    for graha in SAPTA_GRAHA:
        bala = chart.grahas[graha].shadbala
        assert bala is not None
        assert bala.sthana.total == pytest.approx(
            bala.sthana.uchcha
            + bala.sthana.saptavargaja
            + bala.sthana.ojayugma
            + bala.sthana.kendradi
            + bala.sthana.drekkana
        )
        assert bala.kaala.total == pytest.approx(
            bala.kaala.nathonnatha
            + bala.kaala.paksha
            + bala.kaala.tribhaga
            + bala.kaala.varsha_masa_dina_hora
            + bala.kaala.ayana
            + bala.kaala.yuddha
        )
        assert bala.total_virupa == pytest.approx(
            bala.sthana.total
            + bala.dig
            + bala.kaala.total
            + bala.cheshta
            + bala.naisargika
            + bala.drik
        )
        assert bala.total_rupa == pytest.approx(bala.total_virupa / VIRUPA_PER_RUPA)
        assert bala.meets_requirement == (bala.total_rupa >= REQUIRED_RUPAS[graha])


def test_yuddha_bala_is_reported_as_zero_not_guessed(chart) -> None:  # type: ignore[no-untyped-def]
    """The winner/loser rule is school-dependent, so the value stays 0 and the
    condition is flagged separately (docs/DIVERGENCES.md)."""
    for graha in SAPTA_GRAHA:
        bala = chart.grahas[graha].shadbala
        assert bala is not None
        assert bala.kaala.yuddha == 0.0
        assert isinstance(bala.kaala.in_planetary_war, bool)


def test_strongest_graha_and_bhava_bala(chart) -> None:  # type: ignore[no-untyped-def]
    balas = {g: chart.grahas[g].shadbala for g in SAPTA_GRAHA}
    assert all(b is not None for b in balas.values())
    resolved = {g: b for g, b in balas.items() if b is not None}
    winner = strongest_graha(resolved)
    assert resolved[winner].total_virupa == max(b.total_virupa for b in resolved.values())
    for house in range(1, 13):
        assert bhava_bala(house, chart.lagna.sid_lon, resolved) >= 0.0


def test_chandra_and_surya_kundali_are_rotations(chart) -> None:  # type: ignore[no-untyped-def]
    """A Moon-lagna chart is the same positions read from a different first house."""
    chandra = rotate_chart(chart, chart.chandra_lagna_rashi)
    assert chandra[Graha.MOON] == 1, "the Moon is the 1st house of its own kundali"
    surya = rotate_chart(chart, chart.surya_lagna_rashi)
    assert surya[Graha.SUN] == 1
    for graha in Graha:
        assert chart.house_from_moon(graha) == chandra[graha]


def test_varga_chart_uses_the_varga_lagna(chart) -> None:  # type: ignore[no-untyped-def]
    """A D9 chart must be drawn from the D9 ascendant, not the D1 one."""
    houses = varga_chart(chart, Varga.D9)
    lagna_rashi = chart.varga_lagnas[Varga.D9]
    for graha, house in houses.items():
        expected = (chart.grahas[graha].vargas[Varga.D9] - lagna_rashi) % 12 + 1
        assert house == expected
    assert all(1 <= h <= 12 for h in houses.values())


def test_hora_lords_walk_the_chaldean_order(ephemeris: Ephemeris, pune: Place) -> None:
    """The first hora after sunrise belongs to the weekday lord, then descends."""
    from core.enums import VARA_LORD
    from core.panchang.solar import compute_day_lights

    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 22), pune)  # a Sunday
    assert hora_lord_at(lights, lights.sunrise, 0) is VARA_LORD[0] is Graha.SUN

    # Day horas are 1/12 of *daylight*, not 60 clock minutes - about 65 minutes
    # at a Pune midsummer. Sampling must step by the real width, mid-hora.
    day_hora = (lights.sunset - lights.sunrise) / 12
    sequence = [hora_lord_at(lights, lights.sunrise + day_hora * (i + 0.5), 0) for i in range(12)]
    start = CHALDEAN_ORDER.index(Graha.SUN)
    assert sequence == [CHALDEAN_ORDER[(start + i) % 7] for i in range(12)]

    # The 25th hora opens the next day, and lands on Monday's lord - which is why
    # Sunday is followed by Monday.
    night_hora = (lights.next_sunrise - lights.sunset) / 12
    last_night_hora = hora_lord_at(lights, lights.sunset + night_hora * 11.5, 0)
    assert CHALDEAN_ORDER[(CHALDEAN_ORDER.index(last_night_hora) + 1) % 7] is Graha.MOON


def test_chart_records_the_ayanamsa_actually_used(chart) -> None:  # type: ignore[no-untyped-def]
    """CLAUDE.md 4.5: record the ayanamsa in output metadata."""
    assert 22.0 < chart.ayanamsa_deg < 25.0, "Lahiri in the late 20th century"


# ---------------------------------------------------------------------------
# F-003: moolatrikona must be reachable for every graha that declares one
# ---------------------------------------------------------------------------


def test_every_declared_moolatrikona_arc_is_reachable() -> None:
    """Audit F-003. A table row that can never be returned is not a convention.

    The Moon's moolatrikona is Vrishabha 4-30 and Mercury's is Kanya 16-20; both
    sit inside those grahas' own exaltation signs. With exaltation tested first as
    a whole sign, neither row could ever be reached, so the engine shipped a
    MOOLATRIKONA table with two entries that were dead code.

    Whichever precedence a school prefers, the number 4 in "Vrishabha 4-30" is
    there to exclude the exaltation-peak arc below it. A reading under which the
    arc never applies makes that boundary meaningless.
    """
    from core.chart.dignity import MOOLATRIKONA, positional_dignity

    unreachable = []
    for graha, (rashi, start, end) in MOOLATRIKONA.items():
        labels = {
            positional_dignity(graha, (rashi - 1) * 30.0 + start + i * (end - start) / 10.0)
            for i in range(10)
        }
        if Dignity.MOOLATRIKONA not in labels:
            unreachable.append((graha.value, sorted(v.value for v in labels)))
    assert unreachable == [], f"moolatrikona unreachable for: {unreachable}"


def test_the_moon_in_vrishabha_scores_moolatrikona_saptavargaja() -> None:
    """The numeric consequence of F-003, which is why it is not merely a label.

    ``SAPTAVARGAJA_POINTS`` pays moolatrikona 45 virupas and exaltation 30. A Moon
    reported ``exalted`` where the classical table says moolatrikona is therefore
    15 virupas short in every varga of the saptavarga that lands in Vrishabha.
    """
    from core.chart.dignity import positional_dignity
    from core.chart.shadbala import SAPTAVARGAJA_POINTS, saptavargaja_bala

    assert SAPTAVARGAJA_POINTS[Dignity.MOOLATRIKONA] == 45.0
    assert SAPTAVARGAJA_POINTS[Dignity.EXALTED] == 30.0

    from core.chart.shadbala import SAPTAVARGA
    from core.chart.vargas import varga_rashi

    vrishabha_15 = 30.0 + 15.0  # inside the Moon's moolatrikona arc (Vrishabha 4-30)
    in_vrishabha = [v for v in SAPTAVARGA if varga_rashi(v, vrishabha_15) == 2]
    assert in_vrishabha, "test premise: some varga must land back in Vrishabha"

    scored = saptavargaja_bala(Graha.MOON, vrishabha_15, {Graha.MOON: vrishabha_15})
    others_max = (len(SAPTAVARGA) - len(in_vrishabha)) * 45.0
    # Each Vrishabha varga must contribute 45, not the 30 an `exalted` label pays.
    assert scored - others_max <= len(in_vrishabha) * 45.0
    assert scored >= len(in_vrishabha) * 45.0, (
        f"saptavargaja {scored}: {len(in_vrishabha)} varga(s) land in Vrishabha and must "
        f"pay 45 each, not the 30 an 'exalted' label pays"
    )
    # The decisive check: the label those vargas resolve to.
    for varga in in_vrishabha:
        pseudo = (varga_rashi(varga, vrishabha_15) - 1) * 30.0 + 15.0
        assert positional_dignity(Graha.MOON, pseudo) is Dignity.MOOLATRIKONA, varga.value


def test_a_graha_exalted_outside_its_moolatrikona_is_still_exalted() -> None:
    """The regression the F-003 fix must not introduce.

    Exaltation is a whole *sign* with a parama-uchcha degree marking the peak - the
    Sun is uchcha anywhere in Mesha, and 10 deg is where it is strongest, which is
    what Uchcha bala scales on. Reordering moolatrikona above exaltation must not
    turn that into a degree test.
    """
    from core.chart.dignity import positional_dignity

    for deg in (0.5, 10.0, 25.0, 29.9):
        assert positional_dignity(Graha.SUN, deg) is Dignity.EXALTED, f"Sun at Mesha {deg}"
    # Mercury past its moolatrikona arc but still in Kanya: exaltation sign holds.
    assert positional_dignity(Graha.MERCURY, 150.0 + 25.0) is Dignity.EXALTED

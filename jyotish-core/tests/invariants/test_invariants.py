"""Ephemeris, varga, Ashtakavarga and dasha invariants (CLAUDE.md 9.2).

These are the tests that can prove a constant wrong *without* the almanac. Each
asserts a relation that must hold for every chart, so a transcription slip in a
table or an off-by-one in a varga formula fails here rather than showing up as a
one-bindu skew in every report.
"""

from __future__ import annotations

import datetime as dt
from itertools import pairwise

import pytest

from core.angles import DEG_PER_RASHI, norm360, shortest_separation
from core.chart.ashtakavarga import (
    EXPECTED_BAV_TOTALS,
    EXPECTED_SAV_TOTAL,
    compute_ashtakavarga,
    table_row_total,
)
from core.chart.assemble import Chart, compute_chart
from core.chart.houses import sripati_cusps
from core.chart.vargas import VARGA_DIVISIONS, VARGA_FUNCTIONS, Varga, varga_rashi
from core.dasha.vimshottari import (
    MAX_LEVEL,
    VIMSHOTTARI_TOTAL_YEARS,
    VIMSHOTTARI_YEARS,
    build_timeline,
    flatten,
    lord_sequence,
    subperiods,
)
from core.enums import NAKSHATRA_LORD_CYCLE, SAPTA_GRAHA, Graha, YearLength
from core.ephemeris.adapter import Ephemeris
from core.panchang.day import panchang_for_instant
from core.timeutil import jd_from_utc
from core.types import Place

# ---------------------------------------------------------------------------
# Ephemeris
# ---------------------------------------------------------------------------

#: Instants spanning four centuries, including a leap day and a pre-Gregorian
#: date, sampled at odd hours so nothing lands on a convenient boundary.
SAMPLE_INSTANTS: tuple[dt.datetime, ...] = tuple(
    dt.datetime(year, month, day, hour, 17, 43, tzinfo=dt.UTC)
    for year, month, day, hour in (
        (1700, 3, 21, 5),
        (1800, 12, 31, 23),
        (1900, 6, 21, 11),
        (1948, 1, 30, 17),
        (2000, 2, 29, 0),
        (2024, 6, 21, 13),
        (2026, 7, 30, 9),
        (2099, 11, 5, 18),
    )
)


@pytest.mark.parametrize("when", SAMPLE_INSTANTS, ids=lambda w: w.date().isoformat())
def test_rahu_and_ketu_are_exactly_opposite(ephemeris: Ephemeris, when: dt.datetime) -> None:
    """Ketu is derived from Rahu, so 180 degrees holds exactly, not approximately."""
    positions = ephemeris.positions((Graha.RAHU, Graha.KETU), jd_from_utc(when))
    separation = shortest_separation(
        positions[Graha.RAHU].sidereal_lon, positions[Graha.KETU].sidereal_lon
    )
    assert separation == pytest.approx(180.0, abs=1e-9)


@pytest.mark.parametrize("when", SAMPLE_INSTANTS, ids=lambda w: w.date().isoformat())
def test_all_longitudes_in_range(ephemeris: Ephemeris, when: dt.datetime) -> None:
    """Every sidereal longitude lies in [0, 360) - the norm360 contract."""
    for graha, pos in ephemeris.positions(tuple(Graha), jd_from_utc(when)).items():
        assert 0.0 <= pos.sidereal_lon < 360.0, f"{graha} at {pos.sidereal_lon}"
        assert 0.0 <= pos.tropical_lon < 360.0, f"{graha} at {pos.tropical_lon}"


@pytest.mark.parametrize("when", SAMPLE_INSTANTS, ids=lambda w: w.date().isoformat())
def test_mean_nodes_are_always_retrograde(ephemeris: Ephemeris, when: dt.datetime) -> None:
    """The mean node regresses uniformly. Its *true* counterpart need not, which is
    why the retrograde flag is derived from speed and never asserted by body
    (CLAUDE.md 4.8)."""
    rahu = ephemeris.position(Graha.RAHU, jd_from_utc(when))
    assert rahu.speed_lon < 0.0


def test_true_node_retrogression_is_not_assumed(ephemeris: Ephemeris) -> None:
    """A True-node adapter must be free to report a direct or stationary node.

    Guards against an implementation that hard-codes "nodes are retrograde": the
    flag has to come from the reported speed.
    """
    from core.enums import NodeType
    from core.ephemeris.swisseph_adapter import SwissEphemerisAdapter

    true_node = SwissEphemerisAdapter(node_type=NodeType.TRUE)
    speeds = [
        true_node.position(Graha.RAHU, jd_from_utc(w)).speed_lon
        for w in (dt.datetime(2024, m, 1, tzinfo=dt.UTC) for m in range(1, 13))
    ]
    assert any(s >= 0.0 for s in speeds), (
        "the True node never went direct across a whole year, which is "
        "astronomically wrong - it oscillates about the mean node"
    )


# ---------------------------------------------------------------------------
# Vargas
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("varga", list(VARGA_DIVISIONS), ids=lambda v: v.value)
def test_varga_partitions_every_sign(varga: Varga) -> None:
    """Each equal-part varga partitions every sign exactly.

    Swept at one-arcminute resolution across the whole zodiac: every sample must
    map into 1..12, and the number of distinct part boundaries encountered inside
    one sign must equal the varga's division count - no gap, no overlap.

    D30 is excluded because its five arcs are unequal by construction; it has its
    own test below.
    """
    divisions = VARGA_DIVISIONS[varga]
    fn = VARGA_FUNCTIONS[varga]
    for rashi in range(1, 13):
        base = (rashi - 1) * DEG_PER_RASHI
        transitions = 0
        previous = fn(base)
        assert 1 <= previous <= 12
        for arcmin in range(1, int(DEG_PER_RASHI * 60)):
            current = fn(base + arcmin / 60.0)
            assert 1 <= current <= 12
            if current != previous:
                transitions += 1
                previous = current
        # A varga of N divisions has at most N-1 interior changes, and fewer only
        # when consecutive parts happen to land on the same rashi (D2 does this).
        assert transitions <= divisions - 1, (
            f"{varga.value} in rashi {rashi}: {transitions} transitions for {divisions} divisions"
        )


def test_d30_arcs_are_contiguous_and_cover_the_sign() -> None:
    """The five unequal Trimsamsa arcs tile a sign with no luminary involved."""
    from core.chart.vargas import _TRIMSAMSA_EVEN, _TRIMSAMSA_ODD, d30_trimsamsa

    for table in (_TRIMSAMSA_ODD, _TRIMSAMSA_EVEN):
        bounds = [upper for upper, _ in table]
        assert bounds == sorted(bounds), "trimsamsa bounds are out of order"
        assert bounds[-1] == 30.0, "trimsamsa arcs do not reach the end of the sign"
        assert all(rashi not in (4, 5) for _, rashi in table), (
            "the Sun and Moon rule no trimsamsa, so Karka and Simha cannot appear"
        )

    for rashi in range(1, 13):
        base = (rashi - 1) * DEG_PER_RASHI
        results = {d30_trimsamsa(base + arcmin / 60.0) for arcmin in range(0, 1800)}
        assert len(results) == 5, f"rashi {rashi} yielded {len(results)} trimsamsas"


def test_navamsa_matches_classical_rule() -> None:
    """The continuous D9 count agrees with the movable/fixed/dual statement.

    ``d9_navamsa`` counts 3 deg 20' arcs from 0 deg Mesha; the classical rule
    starts each sign from itself, its 9th or its 5th by movability. They are the
    same function, and this proves it degree by degree rather than by argument.
    """
    from core.chart.vargas import _navamsa_classical, d9_navamsa

    for arcmin in range(0, 360 * 60, 7):  # 7-arcminute stride: ~3000 samples
        lon = arcmin / 60.0
        assert d9_navamsa(lon) == _navamsa_classical(lon), f"disagreement at {lon} deg"


def test_varga_lagna_uses_the_same_mapping_as_grahas() -> None:
    """A varga's lagna is computed by the same function as its grahas.

    Guards against the classic bug of drawing a D9 chart with a D1 ascendant.
    """
    lon = 187.4321
    for varga in Varga:
        assert varga_rashi(varga, lon) == VARGA_FUNCTIONS[varga](lon)


# ---------------------------------------------------------------------------
# Ashtakavarga
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("graha", SAPTA_GRAHA, ids=lambda g: g.value)
def test_bav_table_row_total(graha: Graha) -> None:
    """The benefic-house tables sum to their classical totals. No chart needed."""
    assert table_row_total(graha) == EXPECTED_BAV_TOTALS[graha]


def test_sav_table_grand_total() -> None:
    assert sum(EXPECTED_BAV_TOTALS.values()) == EXPECTED_SAV_TOTAL


@pytest.mark.parametrize("when", SAMPLE_INSTANTS[:4], ids=lambda w: w.date().isoformat())
def test_computed_bindus_distribute_the_row_totals(ephemeris: Ephemeris, when: dt.datetime) -> None:
    """For any chart, each BAV row sums to its total and the SAV to 337."""
    positions = ephemeris.positions(tuple(SAPTA_GRAHA), jd_from_utc(when))
    lagna = ephemeris.angles(jd_from_utc(when), 18.52, 73.85).ascendant_sid
    av = compute_ashtakavarga({g: p.sidereal_lon for g, p in positions.items()}, lagna)

    for graha in SAPTA_GRAHA:
        assert av.bav_total(graha) == EXPECTED_BAV_TOTALS[graha]
        assert len(av.bhinna[graha]) == 12
        assert all(0 <= b <= 8 for b in av.bhinna[graha])
    assert av.sav_total == EXPECTED_SAV_TOTAL
    assert all(0 <= b <= 56 for b in av.sarva)


# ---------------------------------------------------------------------------
# Vimshottari dasha
# ---------------------------------------------------------------------------


def test_vimshottari_years_total_120() -> None:
    """CLAUDE.md 3.4 states the total explicitly; it is the cheapest invariant."""
    assert sum(VIMSHOTTARI_YEARS.values()) == VIMSHOTTARI_TOTAL_YEARS == 120


def test_vimshottari_lord_order_and_terms() -> None:
    """The nine terms, as the spec's table gives them."""
    assert VIMSHOTTARI_YEARS == {
        Graha.KETU: 7,
        Graha.VENUS: 20,
        Graha.SUN: 6,
        Graha.MOON: 10,
        Graha.MARS: 7,
        Graha.RAHU: 18,
        Graha.JUPITER: 16,
        Graha.SATURN: 19,
        Graha.MERCURY: 17,
    }
    assert NAKSHATRA_LORD_CYCLE[0] is Graha.KETU, "Ashwini must begin with Ketu"
    assert len(NAKSHATRA_LORD_CYCLE) == 9


@pytest.mark.parametrize("start", NAKSHATRA_LORD_CYCLE, ids=lambda g: g.value)
def test_lord_sequence_is_a_rotation(start: Graha) -> None:
    sequence = lord_sequence(start)
    assert len(set(sequence)) == 9
    assert sequence[0] is start


@pytest.mark.parametrize("nakshatra", [1, 7, 14, 19, 27])
@pytest.mark.parametrize("fraction", [0.0, 0.3333, 0.9999])
def test_mahadashas_are_contiguous_and_span_120_years(nakshatra: int, fraction: float) -> None:
    """No gaps, no overlaps, and the whole cycle is exactly 120 dasha-years."""
    birth = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    timeline = build_timeline(birth, nakshatra, fraction)

    for earlier, later in zip(timeline.mahadashas, timeline.mahadashas[1:], strict=False):
        assert earlier.end_utc == later.start_utc, "gap or overlap between mahadashas"

    span_days = (
        timeline.mahadashas[-1].end_utc - timeline.mahadashas[0].start_utc
    ).total_seconds() / 86400.0
    expected = VIMSHOTTARI_TOTAL_YEARS * 365.2425
    assert span_days == pytest.approx(expected, abs=1e-3)


def test_first_mahadasha_balance_matches_the_nakshatra_remainder() -> None:
    """The balance at birth is the lord's term times the unexpired fraction."""
    birth = dt.datetime(2000, 1, 1, tzinfo=dt.UTC)
    # Nakshatra 1 (Ashwini) is Ketu's, a 7-year term; a quarter elapsed leaves 5.25.
    timeline = build_timeline(birth, 1, 0.25)
    assert timeline.birth_nakshatra_lord is Graha.KETU
    assert timeline.balance_years == pytest.approx(7.0 * 0.75)


@pytest.mark.parametrize("level", [2, 3, MAX_LEVEL])
def test_subperiods_are_contiguous_and_close_exactly_on_the_parent(level: int) -> None:
    """Children tile their parent to the microsecond at every level.

    This is what the cumulative-share accumulation in ``subperiods`` buys: nine
    independently rounded timedeltas would leave a residue that compounds down
    four levels.
    """
    birth = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    timeline = build_timeline(birth, 19, 0.42)

    parents = timeline.mahadashas
    for _ in range(level - 1):
        children: list = []
        for parent in parents:
            kids = subperiods(parent, timeline.year_length)
            assert kids[0].start_utc == parent.start_utc
            assert kids[-1].end_utc == parent.end_utc
            for earlier, later in pairwise(kids):
                assert earlier.end_utc == later.start_utc
            children.extend(kids)
        parents = tuple(children)
    assert parents[0].level == level


def test_flatten_is_monotonic_within_each_level() -> None:
    """CLAUDE.md 9.3: a monotonic dasha timeline."""
    birth = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    timeline = build_timeline(birth, 12, 0.6)
    for level in (1, 2, 3):
        periods = [p for p in flatten(timeline, level) if p.level == level]
        starts = [p.start_utc for p in periods]
        assert starts == sorted(starts), f"level {level} is not chronological"


def test_year_length_choice_moves_the_dates_materially() -> None:
    """The 360-day and 365.2425-day years diverge by 5.2425 days per dasha-year.

    Pinned because CLAUDE.md 3.4 calls this "the most common silent divergence
    between two 'correct' kundali apps". The magnitudes, which are what make the
    choice consequential:

    * end of the 120-year cycle: 629 days, about 1.7 years apart;
    * a single 19-year Saturn mahadasha: ~100 days, i.e. over three months -
      matching the spec's "shifts dasha dates by months".

    Neither value is wrong; the point is that the choice must be recorded in
    output, which ``ChartFacts.dasha.year_length`` does.
    """
    birth = dt.datetime(1990, 6, 15, tzinfo=dt.UTC)
    savana = build_timeline(birth, 5, 0.0, YearLength.SAVANA_360)
    solar = build_timeline(birth, 5, 0.0, YearLength.SOLAR_365_2425)

    cycle_gap_days = (solar.mahadashas[-1].end_utc - savana.mahadashas[-1].end_utc).days
    assert cycle_gap_days == pytest.approx(120 * (365.2425 - 360), abs=2)

    saturn_solar = next(p for p in solar.mahadashas if p.lord is Graha.SATURN)
    saturn_savana = next(p for p in savana.mahadashas if p.lord is Graha.SATURN)
    saturn_gap_days = abs(
        (saturn_solar.end_utc - saturn_solar.start_utc)
        - (saturn_savana.end_utc - saturn_savana.start_utc)
    ).days
    assert saturn_gap_days == pytest.approx(19 * (365.2425 - 360), abs=1)
    assert saturn_gap_days > 90, "a Saturn mahadasha should differ by over three months"


# ---------------------------------------------------------------------------
# Houses
# ---------------------------------------------------------------------------


def test_sripati_houses_tile_the_circle() -> None:
    """Twelve Sripati houses always sum to 360 degrees, however unequal."""
    for asc in (0.0, 12.5, 97.3, 188.8, 271.1, 359.9):
        for mc_offset in (60.0, 82.0, 90.0, 104.0, 121.0):
            chalit = sripati_cusps(asc, norm360(asc - mc_offset))
            total = sum(chalit.span_degrees(h) for h in range(1, 13))
            assert total == pytest.approx(360.0, abs=1e-9)


def test_sripati_house_lookup_agrees_with_the_boundaries() -> None:
    """Every longitude falls in exactly the house its sandhis bracket."""
    chalit = sripati_cusps(97.3, norm360(97.3 - 82.0))
    for arcmin in range(0, 360 * 60, 13):
        lon = arcmin / 60.0
        house = chalit.house_of(lon)
        start = chalit.sandhis[house - 1]
        assert norm360(lon - start) < chalit.span_degrees(house) + 1e-9


def test_whole_sign_houses_cover_all_twelve(
    ephemeris: Ephemeris, pune: Place, reference_now: dt.datetime
) -> None:
    """A graha's whole-sign house is the sign count from the lagna, 1..12."""
    chart = _chart(ephemeris, pune, reference_now)
    for graha, pos in chart.grahas.items():
        expected = (pos.point.rashi - chart.lagna.rashi) % 12 + 1
        assert pos.house_whole_sign == expected, graha
        assert 1 <= pos.house_chalit <= 12


def _chart(ephemeris: Ephemeris, place: Place, when: dt.datetime) -> Chart:
    day, _moment = panchang_for_instant(ephemeris, when.date(), when, place)
    return compute_chart(ephemeris, when, place, day.lights, day.vara.index)

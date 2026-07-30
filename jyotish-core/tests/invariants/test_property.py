"""Property tests over wide date ranges (CLAUDE.md 9.3).

"random dates over +/-200 years: no crash, all longitudes in [0,360), tithi index
in 1-30, monotonic dasha timeline."

Hypothesis explores the input space rather than asserting particular values, so
these catch the class of bug a hand-picked case misses: a wrap at a year
boundary, a solver that fails to converge for an unusual Moon speed, a month
naming rule that breaks in a kshaya year.

Marked ``slow`` - the ephemeris and the boundary solver dominate. Run the whole
suite in CI; ``-m "not slow"`` for a fast local loop.
"""

from __future__ import annotations

import datetime as dt
from itertools import pairwise

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from core.angles import norm360
from core.chart.ashtakavarga import EXPECTED_SAV_TOTAL, compute_ashtakavarga
from core.chart.assemble import compute_chart
from core.chart.vargas import Varga, all_vargas
from core.dasha.vimshottari import build_timeline, flatten, subperiods
from core.enums import SAPTA_GRAHA, Graha, YearLength
from core.ephemeris.adapter import CircumpolarError, Ephemeris
from core.panchang.day import compute_panchang_day, panchang_for_instant
from core.panchang.limbs import karana_at, nakshatra_at, tithi_at, yoga_at
from core.timeutil import jd_from_utc
from core.types import Place

pytestmark = pytest.mark.slow

#: +/-200 years around the present, as CLAUDE.md 9.3 specifies.
MIN_DATE = dt.date(1826, 1, 1)
MAX_DATE = dt.date(2226, 1, 1)

SLOW_SETTINGS = settings(
    max_examples=40,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

dates = st.dates(min_value=MIN_DATE, max_value=MAX_DATE)
times = st.times()
longitudes = st.floats(min_value=0.0, max_value=360.0, exclude_max=True, allow_nan=False)


# ---------------------------------------------------------------------------
# Pure functions: no ephemeris, so these can run at high volume
# ---------------------------------------------------------------------------


@given(st.floats(allow_nan=False, allow_infinity=False, min_value=-1e6, max_value=1e6))
def test_norm360_always_lands_in_range(value: float) -> None:
    assert 0.0 <= norm360(value) < 360.0


@given(longitudes)
def test_every_varga_yields_a_valid_rashi(lon: float) -> None:
    vargas = all_vargas(lon)
    assert set(vargas) == set(Varga)
    for varga, rashi in vargas.items():
        assert 1 <= rashi <= 12, f"{varga.value} gave rashi {rashi} for {lon}"


@given(
    st.dictionaries(
        keys=st.sampled_from(SAPTA_GRAHA),
        values=longitudes,
        min_size=7,
        max_size=7,
    ),
    longitudes,
)
def test_ashtakavarga_total_is_invariant_under_any_placement(
    positions: dict[Graha, float], lagna: float
) -> None:
    """337 bindus regardless of where anything is."""
    av = compute_ashtakavarga(positions, lagna)
    assert av.sav_total == EXPECTED_SAV_TOTAL
    assert all(0 <= bindu <= 8 for row in av.bhinna.values() for bindu in row)


@given(
    st.integers(min_value=1, max_value=27),
    st.floats(min_value=0.0, max_value=1.0, exclude_max=True, allow_nan=False),
    st.sampled_from(list(YearLength)),
)
def test_dasha_timeline_is_monotonic_and_contiguous_for_any_birth(
    nakshatra: int, fraction: float, year_length: YearLength
) -> None:
    """CLAUDE.md 9.3: monotonic dasha timeline, for every nakshatra and balance."""
    birth = dt.datetime(2000, 1, 1, tzinfo=dt.UTC)
    timeline = build_timeline(birth, nakshatra, fraction, year_length)

    assert len(timeline.mahadashas) == 9
    assert len({p.lord for p in timeline.mahadashas}) == 9
    for earlier, later in zip(timeline.mahadashas, timeline.mahadashas[1:], strict=False):
        assert earlier.end_utc == later.start_utc

    # The first mahadasha straddles birth: it began before and ends after.
    first = timeline.mahadashas[0]
    assert first.start_utc <= birth < first.end_utc
    assert 0.0 < timeline.balance_years <= 20.0

    # Second level, for one parent, must tile it exactly.
    children = subperiods(first, year_length)
    assert children[0].start_utc == first.start_utc
    assert children[-1].end_utc == first.end_utc


@given(st.integers(min_value=1, max_value=27), st.floats(min_value=0.0, max_value=0.999))
def test_flatten_never_produces_a_period_of_zero_or_negative_length(
    nakshatra: int, fraction: float
) -> None:
    timeline = build_timeline(dt.datetime(2000, 1, 1, tzinfo=dt.UTC), nakshatra, fraction)
    for period in flatten(timeline, depth=3):
        assert period.end_utc > period.start_utc


# ---------------------------------------------------------------------------
# Ephemeris-backed: slower, so fewer examples
# ---------------------------------------------------------------------------


@SLOW_SETTINGS
@given(dates)
def test_limbs_are_in_range_for_any_date(ephemeris: Ephemeris, date: dt.date) -> None:
    """No crash, tithi 1-30, nakshatra 1-27, yoga 1-27, karana 1-60."""
    when = dt.datetime.combine(date, dt.time(12, 0), tzinfo=dt.UTC)
    tithi = tithi_at(ephemeris, when)
    nakshatra = nakshatra_at(ephemeris, when)
    yoga = yoga_at(ephemeris, when)
    karana = karana_at(ephemeris, when)

    assert 1 <= tithi.index <= 30
    assert 1 <= tithi.number_in_paksha <= 15
    assert 1 <= nakshatra.index <= 27
    assert 1 <= nakshatra.pada <= 4
    assert 0.0 <= nakshatra.fraction_elapsed < 1.0
    assert 1 <= yoga.index <= 27
    assert 1 <= karana.index <= 60

    for limb in (tithi, nakshatra, yoga, karana):
        assert limb.start_utc <= when < limb.end_utc, f"{limb} does not contain {when}"


@SLOW_SETTINGS
@given(dates)
def test_all_graha_longitudes_stay_in_range_for_any_date(
    ephemeris: Ephemeris, date: dt.date
) -> None:
    jd = jd_from_utc(dt.datetime.combine(date, dt.time(6, 0), tzinfo=dt.UTC))
    positions = ephemeris.positions(tuple(Graha), jd)
    assert len(positions) == 9
    for graha, pos in positions.items():
        assert 0.0 <= pos.sidereal_lon < 360.0, f"{graha} at {pos.sidereal_lon}"
        assert -90.0 <= pos.latitude <= 90.0
    # Ketu stays exactly opposite Rahu at every epoch.
    assert norm360(
        positions[Graha.RAHU].sidereal_lon - positions[Graha.KETU].sidereal_lon
    ) == pytest.approx(180.0, abs=1e-9)


@SLOW_SETTINGS
@given(dates)
def test_panchang_day_never_crashes_and_is_self_consistent(
    ephemeris: Ephemeris, pune: Place, date: dt.date
) -> None:
    day = compute_panchang_day(ephemeris, date, pune)
    assert day.lights.sunrise < day.lights.sunset < day.lights.next_sunrise
    assert 1 <= day.hindu_date.tithi_index <= 30
    assert 0 <= day.hindu_date.month_index <= 11
    assert 1700 < day.hindu_date.shaka_year < 2200
    assert 0 <= day.vara.index <= 6
    assert day.tithis[0].index == day.tithi_at_sunrise.index
    # Every limb list must be non-empty and ordered.
    for sequence in (day.tithis, day.nakshatras, day.yogas, day.karanas):
        assert sequence
        for earlier, later in pairwise(sequence):
            assert earlier.end_utc == later.start_utc


@SLOW_SETTINGS
@given(dates, times)
def test_full_chart_never_crashes(
    ephemeris: Ephemeris, pune: Place, date: dt.date, time: dt.time
) -> None:
    """A chart for any instant in +/-200 years, at any time of day."""
    when = dt.datetime.combine(date, time, tzinfo=dt.UTC)
    day, moment = panchang_for_instant(ephemeris, date, when, pune)
    chart = compute_chart(ephemeris, when, pune, day.lights, day.vara.index)

    assert 0.0 <= chart.lagna.sid_lon < 360.0
    assert len(chart.grahas) == 9
    assert chart.ashtakavarga.sav_total == EXPECTED_SAV_TOTAL
    for graha, position in chart.grahas.items():
        assert 1 <= position.house_whole_sign <= 12, graha
        assert 1 <= position.house_chalit <= 12, graha
        assert 1 <= position.point.rashi <= 12
        if graha in SAPTA_GRAHA:
            assert position.shadbala is not None
            # Every component must be a real number; a NaN would poison a total.
            assert position.shadbala.total_virupa == position.shadbala.total_virupa
    assert 0.0 <= moment.nakshatra.fraction_elapsed < 1.0

    # The twelve Sripati houses always tile the circle.
    assert sum(chart.chalit.span_degrees(h) for h in range(1, 13)) == pytest.approx(360.0, abs=1e-6)


@SLOW_SETTINGS
@given(dates)
def test_high_latitude_either_computes_or_raises_circumpolar(
    ephemeris: Ephemeris, tromso: Place, date: dt.date
) -> None:
    """Inside the Arctic Circle the only two acceptable outcomes.

    Never a fabricated sunrise, and never an unhandled exception type.
    """
    try:
        day = compute_panchang_day(ephemeris, date, tromso)
    except CircumpolarError:
        return
    assert day.lights.sunrise < day.lights.sunset

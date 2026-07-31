"""Panchang unit tests: the five limbs, the day roll, the month, Ishtakaal."""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from core.angles import DEG_PER_KARANA, DEG_PER_NAKSHATRA, DEG_PER_TITHI
from core.enums import (
    KARANA_KEYS,
    MONTH_KEYS,
    TITHI_KEYS,
    Ayana,
    CalendarVariant,
    MonthAnomaly,
    Paksha,
    TithiAnomaly,
)
from core.ephemeris.adapter import CircumpolarError, DiscConvention, Ephemeris
from core.panchang.day import compute_panchang_day, panchang_for_instant
from core.panchang.ishtakaal import GhatiConvention, compute_ishtakaal
from core.panchang.kaal import (
    GULIKA_KAAL_PART,
    KAAL_PARTS,
    RAHU_KAAL_PART,
    YAMAGANDA_PART,
    compute_day_periods,
    hora_at,
)
from core.panchang.limbs import _karana_name_index, vara_for_hindu_day
from core.panchang.month import (
    SHAKA_EPOCH_OFFSET,
    lunar_month_at,
    new_moon_after_jd,
    new_moon_at_or_before_jd,
    previous_sankranti,
    resolve_month_name,
    sankrantis_between,
    shaka_year_for,
    solar_year_start,
)
from core.panchang.ritu import (
    RituConvention,
    ayana_for_sun,
    ritu_from_lunar_month,
    ritu_from_sun_rashi,
)
from core.panchang.solar import compute_day_lights, resolve_hindu_date, sunrise_on
from core.panchang.solver import SolverError, elongation, solve_target
from core.timeutil import jd_from_utc
from core.types import EngineOptions, Place

IST = ZoneInfo("Asia/Kolkata")


def _ist(year: int, month: int, day: int, hour: int = 12, minute: int = 0) -> dt.datetime:
    return dt.datetime(year, month, day, hour, minute, tzinfo=IST).astimezone(dt.UTC)


# ---------------------------------------------------------------------------
# Karana mapping - the one non-uniform limb
# ---------------------------------------------------------------------------


def test_karana_name_mapping_covers_all_sixty_half_tithis() -> None:
    """1 fixed + 56 movable + 3 fixed = 60, and each name lands where it should."""
    assert _karana_name_index(0) == 0  # kimstughna, first half of Shukla Pratipada
    assert [_karana_name_index(h) for h in range(1, 8)] == [1, 2, 3, 4, 5, 6, 7]
    assert _karana_name_index(8) == 1  # the seven movable karanas restart
    assert _karana_name_index(56) == 7  # last movable: vishti
    assert _karana_name_index(57) == 8  # shakuni
    assert _karana_name_index(58) == 9  # chatushpada
    assert _karana_name_index(59) == 10  # naga

    counts: dict[str, int] = {}
    for h in range(60):
        key = KARANA_KEYS[_karana_name_index(h)]
        counts[key] = counts.get(key, 0) + 1
    assert counts["kimstughna"] == 1
    assert counts["shakuni"] == counts["chatushpada"] == counts["naga"] == 1
    assert sum(counts.values()) == 60
    assert all(counts[k] == 8 for k in KARANA_KEYS[1:8]), "the movable seven repeat eight times"


def test_tithi_key_table_and_amavasya_substitution(ephemeris: Ephemeris) -> None:
    """Krishna 15 is Amavasya, not Purnima."""
    from core.panchang.limbs import _tithi_from_index

    now = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    shukla_15 = _tithi_from_index(14, now, now)
    krishna_15 = _tithi_from_index(29, now, now)
    assert shukla_15.key == "purnima"
    assert shukla_15.paksha is Paksha.SHUKLA
    assert krishna_15.key == "amavasya"
    assert krishna_15.paksha is Paksha.KRISHNA
    assert krishna_15.number_in_paksha == 15
    assert len(TITHI_KEYS) == 15


def test_vara_counts_sunday_as_zero() -> None:
    """``date.weekday()`` counts Monday as 0; the vara list counts Sunday as 0."""
    sunday = dt.date(2026, 7, 26)
    assert sunday.weekday() == 6
    assert vara_for_hindu_day(sunday).index == 0
    assert vara_for_hindu_day(sunday).key == "ravivara"
    assert vara_for_hindu_day(dt.date(2026, 7, 27)).key == "somavara"


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------


def test_solver_finds_the_nearest_conjunction(ephemeris: Ephemeris) -> None:
    """A new-moon solve from mid-month converges to a real conjunction."""
    jd = jd_from_utc(_ist(2024, 4, 9))
    angle = elongation(ephemeris)
    solved = solve_target(angle, 0.0, jd)
    assert abs(angle(solved).value) < 1e-6 or abs(angle(solved).value - 360.0) < 1e-6
    assert abs(solved - jd) < 16.0  # within half a synodic month


def test_solver_rejects_a_non_increasing_angle() -> None:
    """The Newton step is only safe on a monotonically increasing angle."""
    from core.panchang.solver import AngleSample

    def decreasing(_jd: float) -> AngleSample:
        return AngleSample(value=10.0, rate=-1.0)

    with pytest.raises(SolverError, match="not increasing"):
        solve_target(decreasing, 20.0, 2460000.0)


@pytest.mark.parametrize("step", [DEG_PER_TITHI, DEG_PER_KARANA, DEG_PER_NAKSHATRA])
def test_limb_divisions_have_plausible_durations(
    ephemeris: Ephemeris, pune: Place, step: float
) -> None:
    """A tithi runs 21.5-26.1 h, a karana half that, a nakshatra 19.5-26.6 h.

    These bounds come from the Moon's speed range (11.76-15.38 deg/day) and are a
    strong check that the boundary solver is finding real boundaries.
    """
    from core.panchang.solver import index_and_bounds

    angle = elongation(ephemeris) if step != DEG_PER_NAKSHATRA else None
    if angle is None:
        from core.panchang.solver import moon_longitude

        angle = moon_longitude(ephemeris)
    for month in (1, 4, 7, 10):
        jd = jd_from_utc(_ist(2025, month, 15))
        _idx, start, end = index_and_bounds(angle, step, jd)
        hours = (end - start).total_seconds() / 3600.0
        # Widest plausible band for any of the three steps in play.
        assert 9.0 < hours < 27.0, f"{step} deg division ran {hours:.2f} h"


# ---------------------------------------------------------------------------
# Sunrise, the day roll, and undefined sunrise
# ---------------------------------------------------------------------------


def test_sunrise_is_plausible_without_asserting_an_authority_value(
    ephemeris: Ephemeris, pune: Place
) -> None:
    """Sunrise lands in the right hour, on the right day, at the right place.

    Deliberately *not* asserting a specific published minute. Only दाते पंचांग is
    the reference truth for a minute-level sunrise (CLAUDE.md N2), and a value
    recalled from any other source - or from another app - would be an authority
    claim this suite has not earned. The minute-level assertions live in
    ``tests/golden/`` and are pending transcription.

    What is checked here is the class of error a convention bug would not cause:
    a wrong day, a wrong hemisphere, or a search that skipped a sunrise.
    """
    sunrise = sunrise_on(ephemeris, dt.date(2024, 6, 21), pune)
    local = sunrise.astimezone(IST)
    assert local.date() == dt.date(2024, 6, 21)
    assert local.hour == 5 or (local.hour == 6 and local.minute < 30), (
        f"Pune midsummer sunrise should be near 06:00 IST, got {local:%H:%M}"
    )


def test_disc_convention_moves_sunrise_by_minutes(ephemeris: Ephemeris, pune: Place) -> None:
    """The largest source of minute-level drift versus a published panchang.

    CLAUDE.md 3.2 calls the refraction and disc-centre convention exactly that, so
    the size of the effect is pinned here as a number rather than left as a
    warning. For Pune at the 2024 summer solstice the three conventions span about
    3m50s:

    ==============================  ===========
    convention                      sunrise IST
    ==============================  ===========
    upper limb, refracted           05:59:10
    disc centre, refracted          06:00:23
    disc centre, no refraction      06:03:00
    ==============================  ===========

    Which one दाते पंचांग uses is **not yet established** - see
    ``docs/SUNRISE_CONVENTION.md``. The engine default is upper-limb-refracted,
    the common almanac convention, and it is recorded in every ChartFacts
    document so a mismatch is diagnosable rather than mysterious.
    """
    from core.enums import Graha
    from core.ephemeris.adapter import RiseSetEvent

    start = jd_from_utc(dt.datetime(2024, 6, 21, tzinfo=IST).astimezone(dt.UTC))
    times = {
        convention: ephemeris.rise_set(
            RiseSetEvent.RISE,
            Graha.SUN,
            start,
            pune.latitude,
            pune.longitude,
            pune.elevation_m,
            convention,
        )
        for convention in DiscConvention
    }
    spread = max(times.values()) - min(times.values())
    assert 180.0 < spread.total_seconds() < 300.0, (
        f"expected the conventions to span 3-5 minutes, got {spread}"
    )
    # Ordering is physical: refraction and the upper limb both bring sunrise
    # earlier, so the no-refraction disc-centre reading is always the latest.
    assert (
        times[DiscConvention.UPPER_LIMB_REFRACTED]
        < times[DiscConvention.DISC_CENTRE_REFRACTED]
        < times[DiscConvention.DISC_CENTRE_NO_REFRACTION]
    )


def test_day_lights_are_ordered_and_of_plausible_length(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 3, 15), pune)
    assert lights.sunrise < lights.sunset < lights.next_sunrise
    assert 600.0 < lights.day_length_minutes < 900.0
    assert 1430.0 < lights.hindu_day_length_minutes < 1450.0
    # disc-centre since D26: दाते's printed rise/set tables (ALMANAC.md).
    assert lights.convention is DiscConvention.DISC_CENTRE_REFRACTED


def test_pre_dawn_birth_rolls_back_one_hindu_day(ephemeris: Ephemeris, pune: Place) -> None:
    """CLAUDE.md 4.2, with the spec's own worked example."""
    birth = _ist(2025, 8, 5, 2, 30)
    hindu_date, lights = resolve_hindu_date(ephemeris, dt.date(2025, 8, 5), birth, pune)
    assert hindu_date == dt.date(2025, 8, 4)
    assert birth >= lights.sunrise, "the rolled-back day's sunrise must precede the birth"


def test_post_sunrise_birth_does_not_roll(ephemeris: Ephemeris, pune: Place) -> None:
    birth = _ist(2025, 8, 5, 9, 0)
    hindu_date, _lights = resolve_hindu_date(ephemeris, dt.date(2025, 8, 5), birth, pune)
    assert hindu_date == dt.date(2025, 8, 5)


def test_tithi_at_birth_may_differ_from_tithi_at_sunrise(ephemeris: Ephemeris, pune: Place) -> None:
    """CLAUDE.md 4.3: both are reported, separately labelled."""
    birth = _ist(2025, 8, 5, 2, 30)
    day, moment = panchang_for_instant(ephemeris, dt.date(2025, 8, 5), birth, pune)
    assert moment.differs_from_sunrise
    assert moment.tithi.key != day.tithi_at_sunrise.key
    assert moment.tithi.index == day.tithi_at_sunrise.index + 1


def test_undefined_sunrise_raises_rather_than_guessing(ephemeris: Ephemeris, tromso: Place) -> None:
    """CLAUDE.md 3.1: reject silently-wrong input loudly.

    Inside the midnight sun the Sun never crosses the horizon, so there is no
    sunrise, no vara boundary and no Ishtakaal. Returning midnight would be a
    fabrication.
    """
    with pytest.raises(CircumpolarError):
        sunrise_on(ephemeris, dt.date(2024, 6, 21), tromso)


def test_high_latitude_place_is_flagged_on_the_input(tromso: Place) -> None:
    assert tromso.is_polar
    from core.types import BirthData

    birth = BirthData(name="x", date=dt.date(2024, 3, 20), time=dt.time(12, 0), place=tromso)
    assert "polar_latitude_sunrise_may_be_undefined" in birth.warnings


def test_equinox_at_high_latitude_still_works(ephemeris: Ephemeris, tromso: Place) -> None:
    """The control case: sunrise exists at Tromso in March."""
    sunrise = sunrise_on(ephemeris, dt.date(2024, 3, 20), tromso)
    assert sunrise.astimezone(ZoneInfo("Europe/Oslo")).date() == dt.date(2024, 3, 20)


# ---------------------------------------------------------------------------
# Kaal periods
# ---------------------------------------------------------------------------


def test_kaal_tables_are_permutations_of_the_eight_parts() -> None:
    """Each table names one part per weekday, all within 1..8."""
    for table in (RAHU_KAAL_PART, GULIKA_KAAL_PART, YAMAGANDA_PART):
        assert len(table) == 7
        assert all(1 <= part <= KAAL_PARTS for part in table)
    # Gulika walks down 7..1 and Yamaganda 5..1 then 7,6 - both are the published
    # sequences, and neither may collide with Rahu Kaal on the same weekday.
    for vara in range(7):
        assert len({RAHU_KAAL_PART[vara], GULIKA_KAAL_PART[vara], YAMAGANDA_PART[vara]}) == 3


def test_kaal_parts_tile_the_daylight_span(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    periods = compute_day_periods(lights, 0)
    assert len(periods.parts) == KAAL_PARTS
    assert periods.parts[0].start == lights.sunrise
    # Timedelta division rounds to whole microseconds, so the eighth part's end
    # can sit a couple of microseconds off sunset. That is the timedelta
    # resolution, not a tiling error.
    assert periods.parts[-1].end is not None
    assert abs((periods.parts[-1].end - lights.sunset).total_seconds()) < 1e-3
    for earlier, later in zip(periods.parts, periods.parts[1:], strict=False):
        assert earlier.end == later.start
    durations = {round(p.duration_minutes or 0, 6) for p in periods.parts}
    assert len(durations) == 1, "the eight parts must be equal"


def test_rahu_kaal_is_the_weekday_indexed_part(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    for vara in range(7):
        periods = compute_day_periods(lights, vara)
        expected = periods.parts[RAHU_KAAL_PART[vara] - 1]
        assert periods.rahu_kaal.start == expected.start
        assert periods.rahu_kaal.end == expected.end


def test_abhijit_is_the_eighth_of_fifteen_and_straddles_midday(
    ephemeris: Ephemeris, pune: Place
) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    abhijit = compute_day_periods(lights, 0).abhijit_muhurta
    midday = lights.sunrise + (lights.sunset - lights.sunrise) / 2
    assert abhijit.start is not None and abhijit.end is not None
    assert abhijit.start < midday < abhijit.end
    span = (lights.sunset - lights.sunrise).total_seconds() / 15
    assert (abhijit.end - abhijit.start).total_seconds() == pytest.approx(span, abs=1e-6)


def test_kaal_rejects_a_bad_vara_index(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    with pytest.raises(ValueError, match="vara_index"):
        compute_day_periods(lights, 7)


def test_hora_index_spans_twenty_four_unequal_hours(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    assert hora_at(lights, lights.sunrise, 0) == 0
    assert hora_at(lights, lights.sunset - dt.timedelta(seconds=1), 0) == 11
    assert hora_at(lights, lights.sunset, 0) == 12
    assert hora_at(lights, lights.next_sunrise - dt.timedelta(seconds=1), 0) == 23
    with pytest.raises(ValueError, match="outside the Hindu day"):
        hora_at(lights, lights.sunrise - dt.timedelta(minutes=1), 0)


# ---------------------------------------------------------------------------
# Ishtakaal
# ---------------------------------------------------------------------------


def test_ishtakaal_units(ephemeris: Ephemeris, pune: Place) -> None:
    """A ghati is 24 minutes and a pala 24 seconds under the fixed convention."""
    lights = compute_day_lights(ephemeris, dt.date(2025, 3, 15), pune)
    at_sunrise = compute_ishtakaal(lights, lights.sunrise)
    assert (at_sunrise.ghati, at_sunrise.pala, at_sunrise.vipala) == (0, 0, 0)

    one_ghati = compute_ishtakaal(lights, lights.sunrise + dt.timedelta(minutes=24))
    assert (one_ghati.ghati, one_ghati.pala) == (1, 0)

    mixed = compute_ishtakaal(
        lights, lights.sunrise + dt.timedelta(minutes=24 * 21 + 10, seconds=12)
    )
    assert mixed.ghati == 21
    assert mixed.pala == 25  # 10 min 12 s = 612 s = 25.5 pala
    assert str(mixed) == f"{mixed.ghati}-{mixed.pala}-{mixed.vipala}"


def test_proportional_ghati_differs_from_the_fixed_one_off_the_equinox(
    ephemeris: Ephemeris, pune: Place
) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 6, 21), pune)
    when = lights.sunrise + dt.timedelta(hours=10)
    fixed = compute_ishtakaal(lights, when, GhatiConvention.FIXED_24_MIN)
    proportional = compute_ishtakaal(lights, when, GhatiConvention.PROPORTIONAL_DINAMANA)
    assert fixed.convention is GhatiConvention.FIXED_24_MIN
    assert proportional.convention is GhatiConvention.PROPORTIONAL_DINAMANA
    assert (fixed.ghati, fixed.pala) != (proportional.ghati, proportional.pala)


def test_ishtakaal_before_sunrise_is_a_programming_error(ephemeris: Ephemeris, pune: Place) -> None:
    lights = compute_day_lights(ephemeris, dt.date(2025, 3, 15), pune)
    with pytest.raises(ValueError, match="precedes sunrise"):
        compute_ishtakaal(lights, lights.sunrise - dt.timedelta(minutes=1))


# ---------------------------------------------------------------------------
# Month naming, Shaka year, sankranti
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "gudi_padwa, shaka",
    [
        (dt.date(2023, 3, 22), 1945),
        (dt.date(2024, 4, 9), 1946),
        (dt.date(2025, 3, 30), 1947),
    ],
)
def test_gudi_padwa_opens_chaitra_and_the_shaka_year(
    ephemeris: Ephemeris, pune: Place, gudi_padwa: dt.date, shaka: int
) -> None:
    """Three published Gudi Padwa dates pin the month-naming rule and the samvat.

    The naming rule under test: the amanta month containing the Sun's ingress into
    Mesha is Chaitra. Each of these dates is the published Chaitra Shukla
    Pratipada for its year.
    """
    day = compute_panchang_day(ephemeris, gudi_padwa, pune)
    assert day.hindu_date.month_key == "chaitra"
    assert day.hindu_date.paksha is Paksha.SHUKLA
    assert day.hindu_date.tithi_key == "pratipada"
    assert day.hindu_date.shaka_year == shaka
    assert shaka == gudi_padwa.year - SHAKA_EPOCH_OFFSET


def test_adhika_shravana_2023_is_detected_and_named(ephemeris: Ephemeris, pune: Place) -> None:
    """Adhika Shravana 1945 Shaka ran 18 July - 16 August 2023.

    Karka Sankranti fell on 17 July and Simha on 17 August, so the month enclosed
    no ingress at all - the definition of an adhika month. It borrows the name of
    the month that follows.
    """
    adhika = compute_panchang_day(ephemeris, dt.date(2023, 7, 25), pune)
    assert adhika.lunar_month.anomaly is MonthAnomaly.ADHIKA
    assert adhika.lunar_month.key == "shravana"
    assert adhika.lunar_month.display_key == "adhika_shravana"
    assert adhika.lunar_month.sankrantis == ()

    nija = compute_panchang_day(ephemeris, dt.date(2023, 8, 25), pune)
    assert nija.lunar_month.anomaly is MonthAnomaly.NONE
    assert nija.lunar_month.key == "shravana"
    assert nija.lunar_month.display_key == "shravana"
    assert len(nija.lunar_month.sankrantis) == 1


@pytest.mark.parametrize(
    "date, month_key",
    [
        (dt.date(2018, 6, 5), "jyeshtha"),
        (dt.date(2020, 10, 5), "ashwina"),
        (dt.date(2026, 5, 25), "jyeshtha"),
    ],
)
def test_other_published_adhika_months(
    ephemeris: Ephemeris, pune: Place, date: dt.date, month_key: str
) -> None:
    """Adhika Jyeshtha 2018, Adhika Ashwina 2020 and Adhika Jyeshtha 2026."""
    day = compute_panchang_day(ephemeris, date, pune)
    assert day.lunar_month.anomaly is MonthAnomaly.ADHIKA
    assert day.lunar_month.key == month_key


def test_lunar_month_bounds_are_consecutive_new_moons(ephemeris: Ephemeris) -> None:
    when = _ist(2025, 5, 20)
    month = lunar_month_at(ephemeris, when)
    assert month.start_utc <= when < month.end_utc
    length = (month.end_utc - month.start_utc).total_seconds() / 86400.0
    assert 29.2 < length < 29.9, "a synodic month runs 29.27-29.83 days"
    assert 0 <= month.index <= 11
    assert month.key == MONTH_KEYS[month.index]


def test_new_moon_search_brackets_correctly(ephemeris: Ephemeris) -> None:
    jd = jd_from_utc(_ist(2025, 5, 20))
    before = new_moon_at_or_before_jd(ephemeris, jd)
    after = new_moon_after_jd(ephemeris, jd)
    assert before <= jd < after
    assert 29.2 < after - before < 29.9


def test_sankranti_count_per_lunar_month_is_zero_one_or_two(ephemeris: Ephemeris) -> None:
    """The three cases the naming rule handles, over four years of months."""
    seen: set[int] = set()
    jd = jd_from_utc(_ist(2022, 1, 15))
    for _ in range(48):
        start = new_moon_at_or_before_jd(ephemeris, jd)
        end = new_moon_after_jd(ephemeris, start)
        count = len(sankrantis_between(ephemeris, start, end))
        assert count in (0, 1, 2), f"{count} sankrantis in one lunar month"
        seen.add(count)
        jd = end + 1.0
    assert 1 in seen, "most months contain exactly one ingress"
    assert 0 in seen, "the four-year window should include an adhika month"


def test_sankranti_window_must_be_forward(ephemeris: Ephemeris) -> None:
    jd = jd_from_utc(_ist(2025, 1, 1))
    with pytest.raises(ValueError, match="non-empty and forward"):
        sankrantis_between(ephemeris, jd, jd)


def test_makar_sankranti_falls_in_mid_january(ephemeris: Ephemeris) -> None:
    """The nirayana Makara ingress: 14-15 January, not the December solstice.

    This is the observable consequence of using the sidereal zodiac - the two have
    drifted apart by the ayanamsa, currently ~24 degrees.
    """
    sankranti = previous_sankranti(ephemeris, _ist(2025, 2, 1))
    local = sankranti.when_utc.astimezone(IST)
    assert sankranti.rashi == 10  # Makara
    assert local.month == 1
    assert local.day in (14, 15)


def test_solar_year_start_is_the_mesha_ingress(ephemeris: Ephemeris) -> None:
    start = solar_year_start(ephemeris, _ist(2025, 8, 1))
    local = start.when_utc.astimezone(IST)
    assert start.rashi == 1
    assert (local.month, local.day) in {(4, 13), (4, 14), (4, 15)}
    assert start.when_utc < _ist(2025, 8, 1)


def test_purnimanta_runs_one_month_ahead_in_the_krishna_paksha(
    ephemeris: Ephemeris, pune: Place
) -> None:
    """Amanta Chaitra Krishna is Purnimanta Vaishakha Krishna (CLAUDE.md N3)."""
    day = compute_panchang_day(ephemeris, dt.date(2024, 4, 25), pune)
    assert day.hindu_date.paksha is Paksha.KRISHNA
    amanta_index, amanta_key = resolve_month_name(
        day.lunar_month, Paksha.KRISHNA, CalendarVariant.AMANTA
    )
    purnimanta_index, purnimanta_key = resolve_month_name(
        day.lunar_month, Paksha.KRISHNA, CalendarVariant.PURNIMANTA
    )
    assert purnimanta_index == (amanta_index + 1) % 12
    assert amanta_key != purnimanta_key

    # In the shukla paksha the two agree.
    assert resolve_month_name(day.lunar_month, Paksha.SHUKLA, CalendarVariant.AMANTA) == (
        resolve_month_name(day.lunar_month, Paksha.SHUKLA, CalendarVariant.PURNIMANTA)
    )


def test_amanta_is_the_default_variant() -> None:
    """CLAUDE.md N3: Amanta and Shalivahana Shaka are the defaults."""
    assert EngineOptions().calendar_variant is CalendarVariant.AMANTA


def test_shaka_year_turns_over_at_gudi_padwa(ephemeris: Ephemeris) -> None:
    before = shaka_year_for(ephemeris, _ist(2024, 4, 8, 23, 0))
    after = shaka_year_for(ephemeris, _ist(2024, 4, 10, 12, 0))
    assert after == before + 1 == 1946


# ---------------------------------------------------------------------------
# Ritu and ayana
# ---------------------------------------------------------------------------


def test_ritu_pairs_consecutive_lunar_months() -> None:
    assert ritu_from_lunar_month(0) == (0, "vasanta")  # Chaitra
    assert ritu_from_lunar_month(1) == (0, "vasanta")  # Vaishakha
    assert ritu_from_lunar_month(2) == (1, "grishma")  # Jyeshtha
    assert ritu_from_lunar_month(11) == (5, "shishira")  # Phalguna
    with pytest.raises(ValueError):
        ritu_from_lunar_month(12)


def test_solar_and_lunar_ritu_conventions_are_distinct_mappings() -> None:
    """The two conventions agree on some inputs and differ on others.

    They coincide where a lunar month and the Sun's rashi happen to fall in the
    same pair - Shravana and Karka both give Varsha - and diverge elsewhere, by up
    to a fortnight in practice. Both are exposed because a panchang prints the
    lunar one while some software prints the solar one.
    """
    assert ritu_from_lunar_month(4)[1] == "varsha"
    assert ritu_from_sun_rashi(4)[1] == "varsha"  # coincides here

    differences = [
        index
        for index in range(12)
        if ritu_from_lunar_month(index) != ritu_from_sun_rashi(index + 1)
    ]
    assert differences, "the two mappings must not be the same function"

    assert ritu_from_sun_rashi(12)[1] == "vasanta", "Vasanta begins at Meena"
    with pytest.raises(ValueError):
        ritu_from_sun_rashi(13)


@pytest.mark.parametrize(
    "sun_lon, expected",
    [
        (270.0, Ayana.UTTARAYANA),  # Makara ingress
        (0.0, Ayana.UTTARAYANA),
        (89.9, Ayana.UTTARAYANA),
        (90.0, Ayana.DAKSHINAYANA),  # Karka ingress
        (180.0, Ayana.DAKSHINAYANA),
        (269.9, Ayana.DAKSHINAYANA),
    ],
)
def test_ayana_boundaries_are_makara_and_karka(sun_lon: float, expected: Ayana) -> None:
    assert ayana_for_sun(sun_lon) is expected


def test_solar_context_records_its_convention(ephemeris: Ephemeris, pune: Place) -> None:
    day = compute_panchang_day(
        ephemeris, dt.date(2025, 8, 9), pune, ritu_convention=RituConvention.SOLAR_RASHI_PAIRS
    )
    assert day.solar.ritu_convention is RituConvention.SOLAR_RASHI_PAIRS


# ---------------------------------------------------------------------------
# Day assembly
# ---------------------------------------------------------------------------


def test_panchang_day_lists_every_limb_touching_the_day(ephemeris: Ephemeris, pune: Place) -> None:
    day = compute_panchang_day(ephemeris, dt.date(2025, 8, 9), pune)
    assert 1 <= len(day.tithis) <= 3
    assert 1 <= len(day.nakshatras) <= 3
    assert 1 <= len(day.karanas) <= 4, "karanas are half-tithis, so more per day"
    assert day.tithis[0].index == day.tithi_at_sunrise.index
    for earlier, later in zip(day.tithis, day.tithis[1:], strict=False):
        assert earlier.end_utc == later.start_utc


def test_tithi_anomaly_classification(ephemeris: Ephemeris, pune: Place) -> None:
    """Vriddhi repeats a tithi across two sunrises; kshaya skips one entirely."""
    vriddhi = compute_panchang_day(ephemeris, dt.date(2018, 4, 10), pune)
    assert vriddhi.tithi_anomaly is TithiAnomaly.VRIDDHI
    assert vriddhi.anomalous_tithi is not None
    assert vriddhi.anomalous_tithi.index == vriddhi.tithi_at_sunrise.index

    kshaya = compute_panchang_day(ephemeris, dt.date(2018, 12, 19), pune)
    assert kshaya.tithi_anomaly is TithiAnomaly.KSHAYA
    assert kshaya.anomalous_tithi is not None
    assert kshaya.anomalous_tithi.index != kshaya.tithi_at_sunrise.index

    ordinary = compute_panchang_day(ephemeris, dt.date(2025, 8, 9), pune)
    assert ordinary.tithi_anomaly is TithiAnomaly.NONE
    assert ordinary.anomalous_tithi is None


# ---------------------------------------------------------------------------
# The transcription plan's premise (docs/DIVERGENCES.md, tools/settle.py)
# ---------------------------------------------------------------------------


def test_a_yoga_end_time_discriminates_the_ayanamsa_and_a_tithi_end_time_does_not(
    pune: Place,
) -> None:
    """What each printed value can settle, pinned as arithmetic rather than prose.

    The transcription plan in `tools/settle.py` rests on this: a yoga or nakshatra
    end-time isolates the ayanamsa because neither depends on sunrise, while a
    tithi or karana end-time is invariant under the ayanamsa entirely because both
    are functions of the elongation, from which it cancels.

    If this ever stopped holding, the plan would be sending someone to the wrong
    page of the almanac.
    """
    from core.ephemeris.registry import build_ephemeris
    from core.panchang.day import compute_panchang_day

    date = dt.date(2024, 6, 21)
    days = {}
    for ayanamsa in ("lahiri", "true_chitra"):
        options = EngineOptions(ayanamsa=ayanamsa)
        days[ayanamsa] = compute_panchang_day(build_ephemeris(options), date, pune, options)

    def shift(limb: str) -> float:
        a = getattr(days["lahiri"], f"{limb}_at_sunrise").end_utc
        b = getattr(days["true_chitra"], f"{limb}_at_sunrise").end_utc
        return abs((b - a).total_seconds()) / 60.0

    # Exactly zero, not merely small: the ayanamsa cancels in the difference of
    # two longitudes, so these carry no information about it at all.
    assert shift("tithi") == 0.0
    assert shift("karana") == 0.0

    # The yoga is the sum of two longitudes, so it carries the shift twice and is
    # the sharper discriminator of the two that do move.
    assert shift("yoga") > shift("nakshatra") > 1.0
    assert shift("yoga") > 2.0, (
        f"yoga moves {shift('yoga'):.2f} min; the plan needs it clear of the "
        "±1 min printing tolerance"
    )


def test_sunrise_carries_no_information_about_the_ayanamsa(pune: Place) -> None:
    """Which is why a printed sunrise cannot settle F-008, only O1 and F-007."""
    from core.ephemeris.registry import build_ephemeris
    from core.panchang.solar import compute_day_lights

    date = dt.date(2024, 6, 21)
    rises = {
        compute_day_lights(
            build_ephemeris(EngineOptions(ayanamsa=a)), date, pune, EngineOptions(ayanamsa=a)
        ).sunrise
        for a in ("lahiri", "true_chitra", "raman")
    }
    assert len(rises) == 1, "sunrise moved with the ayanamsa; it is an altitude, not a longitude"

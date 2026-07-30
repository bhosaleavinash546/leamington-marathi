"""Angle normalisation and the time-handling traps in CLAUDE.md 4.1 and 4.7."""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo, available_timezones

import pytest

from core.angles import (
    ANGLE_EPS,
    DEG_PER_NAKSHATRA,
    angles_equal,
    deg_in_rashi,
    dms,
    format_dms,
    nakshatra_fraction,
    nakshatra_of,
    norm180,
    norm360,
    pada_of,
    rashi_of,
    separation,
    shortest_separation,
)
from core.enums import TimeStandard
from core.timeutil import (
    GREGORIAN_ADOPTION_BRITISH,
    JD_FLOAT_RESOLUTION_SECONDS,
    JD_J2000,
    TimeError,
    greenwich_mean_sidereal_time_deg,
    is_pre_gregorian_british,
    iso_utc,
    jd_from_date_midnight_utc,
    jd_from_utc,
    lmt_offset_seconds,
    local_mean_sidereal_time_deg,
    localise,
    minutes_between,
    to_utc,
    utc_from_jd,
)
from core.types import BirthData, Place

# ---------------------------------------------------------------------------
# Angles
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value, expected",
    [
        (0.0, 0.0),
        (360.0, 0.0),
        (720.0, 0.0),
        (-1.0, 359.0),
        (-360.0, 0.0),
        (-721.5, 358.5),
        (1080.25, 0.25),
        (-1e-18, 0.0),  # tiny negative must not land on 360.0
    ],
)
def test_norm360_keeps_the_range_half_open(value: float, expected: float) -> None:
    result = norm360(value)
    assert 0.0 <= result < 360.0
    assert result == pytest.approx(expected, abs=1e-9)


@pytest.mark.parametrize(
    "value, expected", [(0.0, 0.0), (180.0, 180.0), (180.1, -179.9), (359.0, -1.0), (-1.0, -1.0)]
)
def test_norm180(value: float, expected: float) -> None:
    assert norm180(value) == pytest.approx(expected, abs=1e-9)


def test_separation_is_directional_and_shortest_is_not() -> None:
    assert separation(350.0, 10.0) == pytest.approx(20.0)
    assert separation(10.0, 350.0) == pytest.approx(340.0)
    assert shortest_separation(350.0, 10.0) == pytest.approx(20.0)
    assert shortest_separation(10.0, 350.0) == pytest.approx(20.0)


def test_angles_are_compared_with_tolerance_not_equality() -> None:
    """CLAUDE.md 4.7: never compare angles with ``==``."""
    assert angles_equal(359.9999999999, 0.0, eps=1e-6)
    assert angles_equal(0.0, 360.0)
    assert not angles_equal(0.0, 0.1)
    assert ANGLE_EPS < 1e-6


@pytest.mark.parametrize(
    "lon, rashi, nakshatra, pada",
    [
        (0.0, 1, 1, 1),
        (29.9999, 1, 3, 1),
        (30.0, 2, 3, 1),
        (13.0 + 20.0 / 60.0, 1, 2, 1),
        (359.9999, 12, 27, 4),
        (186.6667, 7, 15, 1),
    ],
)
def test_rashi_nakshatra_pada_boundaries(lon: float, rashi: int, nakshatra: int, pada: int) -> None:
    assert rashi_of(lon) == rashi
    assert nakshatra_of(lon) == nakshatra
    assert pada_of(lon) == pada
    assert 0.0 <= deg_in_rashi(lon) < 30.0


def test_nakshatra_fraction_spans_zero_to_one() -> None:
    """The Vimshottari balance key: 0 at a nakshatra's start, just under 1 at its end."""
    assert nakshatra_fraction(0.0) == pytest.approx(0.0)
    assert nakshatra_fraction(DEG_PER_NAKSHATRA / 2) == pytest.approx(0.5)
    assert nakshatra_fraction(DEG_PER_NAKSHATRA - 1e-9) == pytest.approx(1.0, abs=1e-9)
    assert nakshatra_fraction(DEG_PER_NAKSHATRA) == pytest.approx(0.0)


def test_dms_and_formatting() -> None:
    d, m, s = dms(12.5125)
    assert (d, m) == (12, 30)
    assert s == pytest.approx(45.0, abs=1e-6)
    assert format_dms(12.5125) == "12°30'45\""
    assert format_dms(0.0) == "0°00'00\""
    assert format_dms(12.5125, places=2).startswith("12°30'45.0")


# ---------------------------------------------------------------------------
# Julian Day
# ---------------------------------------------------------------------------


def test_j2000_epoch() -> None:
    """2000-01-01 12:00 TT is JD 2451545.0; in UT the same civil instant."""
    assert jd_from_utc(dt.datetime(2000, 1, 1, 12, 0, tzinfo=dt.UTC)) == pytest.approx(JD_J2000)


@pytest.mark.parametrize(
    "when",
    [
        dt.datetime(1700, 3, 21, 5, 17, 43, tzinfo=dt.UTC),
        dt.datetime(1900, 1, 1, 0, 0, tzinfo=dt.UTC),
        dt.datetime(1970, 1, 1, 0, 0, tzinfo=dt.UTC),
        dt.datetime(2000, 2, 29, 23, 59, 59, tzinfo=dt.UTC),
        dt.datetime(2026, 7, 30, 12, 34, 56, tzinfo=dt.UTC),
        dt.datetime(2099, 12, 31, 23, 59, 59, tzinfo=dt.UTC),
    ],
)
def test_jd_round_trip(when: dt.datetime) -> None:
    """``utc_from_jd(jd_from_utc(t))`` recovers ``t`` to the float64 JD floor.

    Not exact, and it cannot be: see
    :data:`core.timeutil.JD_FLOAT_RESOLUTION_SECONDS`. One ulp of a
    contemporary Julian Day is about 48 microseconds, which is seven orders of
    magnitude below the one-minute golden tolerance.
    """
    recovered = utc_from_jd(jd_from_utc(when))
    assert abs((recovered - when).total_seconds()) < JD_FLOAT_RESOLUTION_SECONDS


def test_unix_epoch_jd() -> None:
    assert jd_from_utc(dt.datetime(1970, 1, 1, tzinfo=dt.UTC)) == pytest.approx(2440587.5)


def test_jd_requires_an_aware_datetime() -> None:
    """A naive datetime is an error, not an assumed UTC (CLAUDE.md 4.7)."""
    with pytest.raises(TimeError):
        jd_from_utc(dt.datetime(2000, 1, 1))


def test_jd_from_date_midnight_matches_the_datetime_form() -> None:
    assert jd_from_date_midnight_utc(dt.date(2024, 6, 21)) == pytest.approx(
        jd_from_utc(dt.datetime(2024, 6, 21, tzinfo=dt.UTC))
    )


# ---------------------------------------------------------------------------
# Historical Indian offsets (CLAUDE.md 4.1)
# ---------------------------------------------------------------------------


def test_wartime_dst_offset_is_taken_from_tzdata_not_assumed() -> None:
    """India ran DST from 1942-09-01 to 1945-10-15.

    The load-bearing assertion is that the *same* naive clock time yields a
    different UTC offset in 1943 than in 1946, because ``zoneinfo`` looked the
    date up. A hand-coded +05:30 would make these identical.
    """
    wartime = localise(dt.datetime(1943, 6, 15, 14, 30), "Asia/Kolkata")
    peacetime = localise(dt.datetime(1946, 6, 15, 14, 30), "Asia/Kolkata")
    war_offset = wartime.utcoffset()
    peace_offset = peacetime.utcoffset()
    assert war_offset is not None and peace_offset is not None
    assert war_offset != peace_offset, (
        "tzdata records Indian wartime DST; if these match, a fixed offset is "
        "being applied somewhere (CLAUDE.md 4.1)"
    )
    assert peace_offset == dt.timedelta(hours=5, minutes=30)


def test_offsets_differ_across_the_1906_bombay_transition() -> None:
    """Before 1906 Bombay ran on its own meridian time, not IST."""
    early = localise(dt.datetime(1900, 6, 15, 12, 0), "Asia/Kolkata").utcoffset()
    later = localise(dt.datetime(1910, 6, 15, 12, 0), "Asia/Kolkata").utcoffset()
    assert early != later


def test_lmt_offset_is_four_minutes_per_degree() -> None:
    """Bombay's meridian (72.88 deg E) gives about +04:51, the historical value."""
    assert lmt_offset_seconds(0.0) == 0
    assert lmt_offset_seconds(15.0) == 3600
    bombay = lmt_offset_seconds(72.8777)
    assert bombay == pytest.approx(4 * 3600 + 51 * 60, abs=60)


@pytest.mark.parametrize(
    "standard, expect_offset",
    [
        (TimeStandard.IST, 19800),
        (TimeStandard.CLOCK_TIME_AS_RECORDED, 19800),
    ],
)
def test_to_utc_reports_the_offset_actually_applied(
    standard: TimeStandard, expect_offset: int
) -> None:
    """ChartFacts echoes the applied offset, so ``to_utc`` must return it."""
    naive = dt.datetime(1990, 6, 15, 14, 32)
    utc, offset = to_utc(naive, iana_tz="Asia/Kolkata", longitude_deg=73.8567, standard=standard)
    assert offset == expect_offset
    assert utc.tzinfo == dt.UTC
    assert utc == dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)


def test_to_utc_lmt_uses_the_longitude_not_the_zone() -> None:
    naive = dt.datetime(1935, 11, 20, 12, 0)
    utc, offset = to_utc(
        naive, iana_tz="Asia/Kolkata", longitude_deg=72.8777, standard=TimeStandard.LMT
    )
    assert offset == pytest.approx(17491, abs=60)  # ~+04:51
    assert utc.hour == 7  # 12:00 LMT Bombay is ~07:09 UTC


def test_to_utc_rejects_an_aware_datetime() -> None:
    with pytest.raises(TimeError):
        to_utc(
            dt.datetime(1990, 6, 15, 14, 32, tzinfo=ZoneInfo("Asia/Kolkata")),
            iana_tz="Asia/Kolkata",
            longitude_deg=73.8567,
            standard=TimeStandard.IST,
        )


def test_localise_rejects_an_aware_datetime() -> None:
    with pytest.raises(TimeError):
        localise(dt.datetime(2000, 1, 1, tzinfo=dt.UTC), "Asia/Kolkata")


def test_gregorian_adoption_boundary() -> None:
    assert is_pre_gregorian_british(dt.date(1752, 9, 13))
    assert not is_pre_gregorian_british(GREGORIAN_ADOPTION_BRITISH)


# ---------------------------------------------------------------------------
# Sidereal time and helpers
# ---------------------------------------------------------------------------


def test_gmst_at_j2000() -> None:
    """GMST at J2000.0 is 280.46061837 degrees by definition of the series."""
    assert greenwich_mean_sidereal_time_deg(JD_J2000) == pytest.approx(280.46061837, abs=1e-6)


def test_lmst_adds_east_longitude() -> None:
    gmst = greenwich_mean_sidereal_time_deg(JD_J2000)
    assert local_mean_sidereal_time_deg(JD_J2000, 73.8567) == pytest.approx(
        (gmst + 73.8567) % 360.0, abs=1e-9
    )


def test_iso_utc_and_minutes_between() -> None:
    when = dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC)
    assert iso_utc(when) == "2026-07-30T12:00:00Z"
    assert iso_utc(None) is None
    assert minutes_between(when + dt.timedelta(minutes=7), when) == pytest.approx(7.0)


# ---------------------------------------------------------------------------
# F-004: pre-1955 Indian clock time is ambiguous and tzdata cannot say so
# ---------------------------------------------------------------------------


def test_asia_kolkata_cannot_express_bombay_time() -> None:
    """Audit F-004. The premise of CLAUDE.md 4.1 is false for Bombay.

    CLAUDE.md 4.1 says ``zoneinfo`` with ``Asia/Kolkata`` "handles documented
    transitions **if you localise the naive datetime with the historical date**".
    It does for the Madras/Calcutta lineage and for wartime DST. It cannot for
    Bombay Time (~UTC+04:51), which Bombay kept until 1955: IANA has no zone for
    it, because IANA zones distinguish places only by their post-1970 behaviour
    and all of India has been one zone since.

    Asserted rather than described, because it is the fact the warning exists for.
    """
    kolkata = ZoneInfo("Asia/Kolkata")
    offset = kolkata.utcoffset(dt.datetime(1948, 1, 30, 12, 0))
    assert offset == dt.timedelta(hours=5, minutes=30)

    indian_zones = {
        z
        for z in available_timezones()
        if z.startswith(("Asia/Ka", "Asia/Ko", "Asia/C", "Asia/M", "Asia/B"))
    }
    bombay_capable = {
        z
        for z in indian_zones
        if ZoneInfo(z).utcoffset(dt.datetime(1948, 1, 30, 12, 0))
        == dt.timedelta(hours=4, minutes=51)
    }
    assert bombay_capable == set(), f"a zone does express Bombay Time: {bombay_capable}"


def test_wartime_dst_is_reachable_even_though_bombay_time_is_not() -> None:
    """The other half of CLAUDE.md 4.1, which tzdata *does* handle correctly."""
    kolkata = ZoneInfo("Asia/Kolkata")
    assert kolkata.utcoffset(dt.datetime(1943, 6, 1, 12)) == dt.timedelta(hours=6, minutes=30)
    assert kolkata.utcoffset(dt.datetime(1946, 1, 1, 12)) == dt.timedelta(hours=5, minutes=30)


def test_lmt_recovers_bombay_time_to_within_a_minute() -> None:
    """Why the fix routes to LMT rather than inventing a `bombay_time` standard.

    Bombay Time *was* Bombay's local mean time, so the engine already has the
    right instrument. Adding a `TimeStandard.BOMBAY_TIME` would mean hard-coding an
    offset whose exact seconds published sources disagree on - and CLAUDE.md 2.2
    forbids hand-coded offsets while CLAUDE.md 11 forbids picking a convention
    silently.
    """
    mumbai_lon = 72.8777
    lmt = lmt_offset_seconds(mumbai_lon)
    bombay_time = 4 * 3600 + 51 * 60  # the commonly published +04:51
    assert abs(lmt - bombay_time) < 60, f"LMT {lmt} s vs Bombay Time {bombay_time} s"


def test_a_pre_1955_indian_birth_warns_that_its_clock_time_is_ambiguous() -> None:
    """The warning, and the magnitude it must carry."""
    mumbai = Place("Mumbai", 19.0760, 72.8777, "Asia/Kolkata", 14.0)
    birth = BirthData(name="A", date=dt.date(1948, 1, 30), time=dt.time(10, 30), place=mumbai)
    assert "pre_1955_indian_clock_time_ambiguous" in birth.warnings

    # A modern birth at the same place must not warn.
    modern = BirthData(name="A", date=dt.date(1990, 6, 15), time=dt.time(10, 30), place=mumbai)
    assert "pre_1955_indian_clock_time_ambiguous" not in modern.warnings

    # Nor may it fire when the caller has already declared the standard.
    declared = BirthData(
        name="A",
        date=dt.date(1948, 1, 30),
        time=dt.time(10, 30),
        place=mumbai,
        time_standard=TimeStandard.LMT,
    )
    assert "pre_1955_indian_clock_time_ambiguous" not in declared.warnings


def test_the_two_standards_differ_by_the_39_minutes_the_audit_measured() -> None:
    """Mumbai 1948: `clock_time_as_recorded` and `lmt` are 39 minutes apart."""
    mumbai = Place("Mumbai", 19.0760, 72.8777, "Asia/Kolkata", 14.0)
    naive = dt.datetime(1948, 1, 30, 10, 30)
    as_recorded, off_a = to_utc(
        naive,
        iana_tz=mumbai.iana_tz,
        longitude_deg=mumbai.longitude,
        standard=TimeStandard.CLOCK_TIME_AS_RECORDED,
    )
    as_lmt, off_b = to_utc(
        naive, iana_tz=mumbai.iana_tz, longitude_deg=mumbai.longitude, standard=TimeStandard.LMT
    )
    gap_minutes = (as_lmt - as_recorded).total_seconds() / 60.0
    assert 38.0 < gap_minutes < 39.5, f"gap {gap_minutes:.2f} min"
    assert off_a == 19800 and abs(off_b - (4 * 3600 + 51 * 60)) < 60

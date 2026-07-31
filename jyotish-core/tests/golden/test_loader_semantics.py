"""The golden harness's two comparison rules, pinned directly.

Both were set the day the first almanac page was transcribed
(``audit/live/ALMANAC.md``), and both would silently corrupt every future
transcription if they regressed — so they get their own tests rather than
riding along inside case data.
"""

from __future__ import annotations

import datetime as dt

from core.types import Place
from tests.golden.loader import FieldDelta, GoldenCase, minutes_apart

PUNE = Place(
    name="Pune", latitude=18.5204, longitude=73.8567, elevation_m=560, iana_tz="Asia/Kolkata"
)


def _case() -> GoldenCase:
    return GoldenCase(
        case_id="x",
        date=dt.date(2018, 5, 16),
        place=PUNE,
        tags=(),
        birth_time=None,
        expected={},
        source="",
        notes="",
    )


def test_local_rounds_to_the_printed_minute() -> None:
    """दाते prints the rounded minute: कृत्तिका computed 08:58:57 is printed
    ०८।५९. A truncating formatter would say 08:58 and manufacture a spurious
    one-minute mismatch on roughly half of all end-times."""
    ist = dt.timezone(dt.timedelta(hours=5, minutes=30))
    just_under = dt.datetime(2018, 5, 16, 8, 58, 57, tzinfo=ist)
    just_over = dt.datetime(2018, 5, 16, 8, 58, 29, tzinfo=ist)
    assert _case().local(just_under) == "08:59"
    assert _case().local(just_over) == "08:58"


def test_time_match_is_the_printed_minute_plus_minus_one() -> None:
    """±1 printed minute matches (the authority's drik ganit sits 30–60 s from
    Swiss, so boundary straddles are legitimate); ±2 is a failure."""
    assert FieldDelta("tithi_end", "09:17", "09:16", -1.0).matches
    assert FieldDelta("tithi_end", "09:17", "09:17", 0.0).matches
    assert not FieldDelta("tithi_end", "09:17", "09:15", -2.0).matches


def test_minutes_apart_wraps_past_midnight() -> None:
    """A yoga printed २९।२९ compares as 05:29 the next civil day."""
    assert minutes_apart("23:58", "00:03") == 5.0
    assert minutes_apart("00:03", "23:58") == -5.0

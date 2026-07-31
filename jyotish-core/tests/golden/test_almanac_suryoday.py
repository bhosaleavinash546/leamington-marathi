"""Golden सूर्योदय/सूर्यास्त rows transcribed from दाते पंचांग शक १९४० (2018-19).

Source: ``audit/live/ALMANAC.md`` — the monthly daily-panchang pages print
Mumbai rise/set in the दि/रउ/रअ columns (the TOC footnote and «पंचांग कसे
पहावे», book page २, both state the Mumbai convention). Transcribed here:

* PDF 33 / book (३८), अधिक ज्येष्ठ शुक्ल — 16, 19, 23 मे 2018
* PDF 67 / book (७२), पौष कृष्ण — 22, 26 जानेवारी 2019

Every printed value carries an internal consistency check the transcription
must pass before it is admitted: उदय + दिनमान = अस्त exactly, on the page.

These rows settle O1 (docs/DIVERGENCES.md) and are asserted against
**default** :class:`~core.types.EngineOptions`: दाते's printed times are the
disc-centre-refracted instants (all ten values within ±0.9 min), while the
upper-limb convention misses six of the ten by more than the ±1 minute print
tolerance. A default that cannot reproduce the authority's own rise/set table
fails here (N2).
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from core.ephemeris.registry import build_ephemeris
from core.panchang.solar import compute_day_lights
from core.types import EngineOptions, Place

IST = ZoneInfo("Asia/Kolkata")

MUMBAI = Place(
    name="Mumbai", latitude=19.0760, longitude=72.8777, elevation_m=14, iana_tz="Asia/Kolkata"
)

#: date → (printed सूर्योदय, printed सूर्यास्त), Mumbai, IST, to the minute.
PRINTED: dict[dt.date, tuple[str, str]] = {
    dt.date(2018, 5, 16): ("06:05", "19:05"),
    dt.date(2018, 5, 19): ("06:04", "19:06"),
    dt.date(2018, 5, 23): ("06:03", "19:08"),
    dt.date(2019, 1, 22): ("07:16", "18:25"),
    dt.date(2019, 1, 26): ("07:15", "18:27"),
}

#: A printed panchang time is given to the minute.
TOLERANCE = dt.timedelta(minutes=1)


def _printed_instant(day: dt.date, hhmm: str) -> dt.datetime:
    hour, minute = (int(p) for p in hhmm.split(":"))
    return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)


@pytest.fixture(scope="module")
def default_lights():
    """Defaults on purpose: the almanac rows gate what the engine *ships*."""
    eph = build_ephemeris(EngineOptions())
    return {day: compute_day_lights(eph, day, MUMBAI, EngineOptions()) for day in PRINTED}


@pytest.mark.parametrize("day", sorted(PRINTED))
@pytest.mark.parametrize("event", ["sunrise", "sunset"])
def test_mumbai_rise_set_matches_date_panchang(default_lights, day: dt.date, event: str) -> None:
    printed = _printed_instant(day, PRINTED[day][0 if event == "sunrise" else 1])
    computed = getattr(default_lights[day], event)
    delta = computed - printed
    assert abs(delta) <= TOLERANCE, (
        f"Mumbai {event} {day}: दाते prints {printed.strftime('%H:%M')} IST, engine "
        f"gives {computed.astimezone(IST).strftime('%H:%M:%S')} "
        f"(delta {delta.total_seconds() / 60.0:+.2f} min, tolerance ±1 min)"
    )


def test_transcription_is_internally_consistent() -> None:
    """उदय + दिनमान = अस्त on the printed page; दिनमान re-derived here."""
    dinamana = {
        dt.date(2018, 5, 16): (13, 0),
        dt.date(2018, 5, 19): (13, 2),
        dt.date(2018, 5, 23): (13, 5),
        dt.date(2019, 1, 22): (11, 9),
        dt.date(2019, 1, 26): (11, 12),
    }
    for day, (rise, set_) in PRINTED.items():
        h, m = dinamana[day]
        span = _printed_instant(day, set_) - _printed_instant(day, rise)
        assert span == dt.timedelta(hours=h, minutes=m), day


def test_elevation_does_not_move_rise_set() -> None:
    """F-007, settled as a documented convention (D26): दाते's own table proves
    elevation is not applied. Book page (२८) prints Pune's daily sunrise, and
    the readable cells track the sea-level disc-centre instants to the printed
    minute; Pune's 560 m would dip every one of them ~3.2 minutes earlier, and
    no printed cell shows it. The engine's inert ``elevation_m`` is therefore
    the authority's behaviour, asserted here so a future adapter change that
    starts applying the dip is caught as the convention break it would be.
    """
    eph = build_ephemeris(EngineOptions())
    day = dt.date(2018, 5, 16)
    for metres in (0.0, 560.0, 1353.0):
        place = Place(
            name="Pune", latitude=18.5204, longitude=73.8567,
            elevation_m=metres, iana_tz="Asia/Kolkata",
        )
        lights = compute_day_lights(eph, day, place, EngineOptions())
        if metres == 0.0:
            at_sea_level = lights.sunrise
        else:
            # Microseconds of numeric jitter are fine; the 560 m dip would be
            # ~3.2 *minutes*. Anything beyond a second means dip is applied.
            drift = abs((lights.sunrise - at_sea_level).total_seconds())
            assert drift < 1.0, (
                f"sunrise moved {drift:.1f}s at {metres} m - the elevation dip "
                "is being applied, which दाते पंचांग's printed tables do not do (D26)"
            )

"""Golden ग्रहस्पष्ट rows transcribed from दाते पंचांग शक १९४० (2018-19).

Source: ``audit/live/ALMANAC.md`` — PDF page 34 / book (३९), the daily table
headed «सकाळी ५।३० चे दैनिक ग्रह चंद्रक्रांति व ग्रीनिच ० ची सांपातिक वेळ»,
rows 16 and 17 मे 2018. 05:30 IST is 00:00 UT, which is why the JD below is a
midnight UT.

These rows are the F-008 resolution evidence *and* the F-027 regression net:
they are asserted against **default** :class:`~core.types.EngineOptions`, so
they pass only while the engine's defaults reproduce what the authority
prints. The राहु rows in particular match the true node to the printed minute
and sit ~1° from the mean node — a mean-node default cannot pass them (N2).

Tolerances are the print's own: bodies printed राशि।अंश।कला are asserted to
1 arcminute; रवि/चंद्र carry a विकला digit and are asserted to 10 arcseconds
(observed engine delta: Moon 0″, Sun 2–3″ — the authority's older drik ganit).
"""

from __future__ import annotations

import datetime as dt

import pytest

from core.enums import Graha
from core.ephemeris.registry import build_ephemeris
from core.timeutil import jd_from_utc
from core.types import EngineOptions

#: printed value → (rashi 0-based, degrees, minutes, seconds|None)
#: None seconds means the sheet prints that body to the arcminute only.
PRINTED: dict[str, dict[Graha, tuple[int, int, int, int | None]]] = {
    "2018-05-16": {
        Graha.SUN: (1, 0, 59, 0),
        Graha.MOON: (1, 7, 52, 55),
        Graha.MARS: (9, 5, 49, None),
        Graha.MERCURY: (0, 9, 48, None),
        Graha.JUPITER: (6, 23, 22, None),
        Graha.VENUS: (2, 1, 38, None),
        Graha.SATURN: (8, 14, 25, None),
        Graha.RAHU: (3, 14, 39, None),
    },
    "2018-05-17": {
        Graha.SUN: (1, 1, 56, 52),
        Graha.MOON: (1, 22, 32, 10),
        Graha.MARS: (9, 6, 12, None),
        Graha.MERCURY: (0, 11, 26, None),
        Graha.JUPITER: (6, 23, 14, None),
        Graha.VENUS: (2, 2, 50, None),
        Graha.SATURN: (8, 14, 23, None),
        Graha.RAHU: (3, 14, 30, None),
    },
}

ARCMIN_TOLERANCE_DEG = 1.0 / 60.0
ARCSEC10_TOLERANCE_DEG = 10.0 / 3600.0


def _printed_deg(rashi: int, d: int, m: int, s: int | None) -> float:
    return rashi * 30.0 + d + m / 60.0 + (s or 0) / 3600.0


@pytest.fixture(scope="module")
def default_ephemeris():
    """Defaults on purpose: the almanac rows gate what the engine *ships*."""
    return build_ephemeris(EngineOptions())


@pytest.mark.parametrize("date_str", sorted(PRINTED))
@pytest.mark.parametrize("graha", sorted(PRINTED["2018-05-16"], key=lambda g: g.value))
def test_daily_graha_matches_date_panchang(default_ephemeris, date_str: str, graha: Graha) -> None:
    y, mo, d = (int(part) for part in date_str.split("-"))
    jd = jd_from_utc(dt.datetime(y, mo, d, tzinfo=dt.UTC))
    rashi, deg, minute, sec = PRINTED[date_str][graha]
    expected = _printed_deg(rashi, deg, minute, sec)
    actual = default_ephemeris.position(graha, jd).sidereal_lon
    tolerance = ARCMIN_TOLERANCE_DEG if sec is None else ARCSEC10_TOLERANCE_DEG
    delta_arcsec = abs(actual - expected) * 3600.0
    assert abs(actual - expected) <= tolerance, (
        f"{graha.value} on {date_str}: दाते prints {rashi:02d}|{deg:02d}|{minute:02d}"
        f"{'' if sec is None else f'|{sec:02d}'}, engine gives {actual:.6f}° "
        f"(delta {delta_arcsec:.1f}″, tolerance {tolerance * 3600:.0f}″)"
    )


def test_ketu_is_rahu_plus_six_rashis(default_ephemeris) -> None:
    """The sheet's own footnote: «राहूमध्ये ६ राशि मिळविल्यावर केतु मिळतो»."""
    jd = jd_from_utc(dt.datetime(2018, 5, 16, tzinfo=dt.UTC))
    rahu = default_ephemeris.position(Graha.RAHU, jd).sidereal_lon
    ketu = default_ephemeris.position(Graha.KETU, jd).sidereal_lon
    assert abs((rahu + 180.0) % 360.0 - ketu) < 1e-9

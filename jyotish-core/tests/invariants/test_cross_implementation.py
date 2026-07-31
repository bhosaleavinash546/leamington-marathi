"""Cross-implementation comparison (CLAUDE.md 9.4).

"Cross-check a handful of full charts against a second independent
implementation, documenting each divergence as either a school difference or a
bug."

**What this delivers, and what it does not.** A cross-check against a second
*application* would need that application; none is available here, and asserting
agreement with a remembered figure from one would be an authority claim this suite
has not earned - the same reasoning that keeps the golden files PENDING. That
comparison remains outstanding and is recorded in ``docs/DIVERGENCES.md``.

What *is* delivered is a comparison against two independently-derived computation
paths, which catches the class of bug a second app would catch:

1. **Sidereal longitude.** The engine computes ``tropical - ayanamsa`` itself
   (CLAUDE.md 3.3). Swiss Ephemeris can also do the conversion internally via
   ``FLG_SIDEREAL``. Two different code paths, one of them not ours, so a sign
   error or a stale ayanamsa in our conversion shows up as a disagreement.
2. **Ascendant.** The engine takes the ascendant from the provider's house
   routine. Here it is recomputed from the closed-form spherical-trigonometry
   expression in ARMC, obliquity and latitude - genuinely independent arithmetic,
   sharing only the ephemeris' obliquity.

Both are asserted to arcsecond agreement. A divergence in either is a bug in this
engine, not a school difference, because neither comparison involves a
convention choice.
"""

from __future__ import annotations

import datetime as dt
import math

import pytest

from core.angles import norm360, shortest_separation
from core.chart.assemble import compute_chart
from core.enums import SAPTA_GRAHA, Graha
from core.ephemeris.adapter import Ephemeris
from core.facts.builder import FullReading, compute_full_reading
from core.panchang.day import panchang_for_instant
from core.timeutil import jd_from_utc
from core.types import BirthData, EngineOptions, Place

#: Agreement tolerance. One arcsecond is ~0.0003 deg; the Moon moves that in
#: 2 seconds of time, so it is far tighter than anything the product reports.
ARCSECOND: float = 1.0 / 3600.0

#: A handful of full charts, as CLAUDE.md 9.4 asks - spread over latitude,
#: hemisphere, epoch and time of day, since the ascendant formula is most
#: sensitive to latitude and the ayanamsa to epoch.
CHARTS: tuple[tuple[str, dt.datetime, Place], ...] = (
    (
        "pune-1990",
        dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC),
        Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
    ),
    (
        "mumbai-1948",
        dt.datetime(1948, 1, 30, 11, 47, tzinfo=dt.UTC),
        Place("Mumbai", 19.0760, 72.8777, "Asia/Kolkata", 14.0),
    ),
    (
        "nagpur-2024-midnight",
        dt.datetime(2024, 12, 21, 18, 30, tzinfo=dt.UTC),
        Place("Nagpur", 21.1458, 79.0882, "Asia/Kolkata", 310.0),
    ),
    (
        "london-2025",
        dt.datetime(2025, 3, 30, 9, 30, tzinfo=dt.UTC),
        Place("London", 51.5072, -0.1276, "Europe/London", 11.0),
    ),
    (
        "southern-hemisphere-2000",
        dt.datetime(2000, 2, 29, 3, 15, tzinfo=dt.UTC),
        Place("Melbourne", -37.8136, 144.9631, "Australia/Melbourne", 31.0),
    ),
    (
        "equator-2010",
        dt.datetime(2010, 9, 23, 15, 45, tzinfo=dt.UTC),
        Place("Nairobi", -1.2921, 36.8219, "Africa/Nairobi", 1795.0),
    ),
)

CHART_IDS = [name for name, _, _ in CHARTS]


# ---------------------------------------------------------------------------
# Path 1: the provider's own sidereal conversion
# ---------------------------------------------------------------------------


def _swisseph_sidereal(jd_ut: float) -> dict[Graha, float]:
    """Sidereal longitudes with the conversion done *inside* Swiss Ephemeris.

    Imports the binding directly, which no module in ``core/`` may do
    (``tests/unit/test_boundaries.py`` enforces that). It is legitimate here
    precisely because the point is to reach a path the engine does not use.
    """
    import swisseph as swe

    swe.set_ephe_path(None)
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0.0, 0.0)
    flags = swe.FLG_MOSEPH | swe.FLG_SPEED | swe.FLG_SIDEREAL

    bodies = {
        Graha.SUN: swe.SUN,
        Graha.MOON: swe.MOON,
        Graha.MARS: swe.MARS,
        Graha.MERCURY: swe.MERCURY,
        Graha.JUPITER: swe.JUPITER,
        Graha.VENUS: swe.VENUS,
        Graha.SATURN: swe.SATURN,
    }
    out: dict[Graha, float] = {}
    for graha, body in bodies.items():
        values, _ = swe.calc_ut(jd_ut, body, flags)
        out[graha] = norm360(float(values[0]))
    return out


@pytest.mark.parametrize("name, when, place", CHARTS, ids=CHART_IDS)
def test_our_sidereal_conversion_matches_the_providers(
    ephemeris: Ephemeris, name: str, when: dt.datetime, place: Place
) -> None:
    """``tropical - ayanamsa`` must agree with the provider's internal conversion.

    A sign error, a stale ayanamsa, or a normalisation slip in our own conversion
    would show up here. There is no convention choice involved, so a disagreement
    is a bug rather than a school difference.
    """
    del place
    jd = jd_from_utc(when)
    ours = {
        graha: pos.sidereal_lon
        for graha, pos in ephemeris.positions(tuple(SAPTA_GRAHA), jd).items()
    }
    theirs = _swisseph_sidereal(jd)

    for graha in SAPTA_GRAHA:
        delta = shortest_separation(ours[graha], theirs[graha])
        assert delta < ARCSECOND, (
            f"{name}/{graha.value}: our sidereal longitude {ours[graha]:.6f} vs the "
            f"provider's {theirs[graha]:.6f}, a difference of {delta * 3600:.2f} "
            "arcseconds. Neither path involves a convention choice, so this is a bug."
        )


# ---------------------------------------------------------------------------
# Path 2: an independent closed-form ascendant
# ---------------------------------------------------------------------------


def _independent_ascendant(armc_deg: float, latitude: float, obliquity: float) -> float:
    """The tropical ascendant from spherical trigonometry, computed from scratch.

    The ascendant is the ecliptic point rising on the eastern horizon. In terms of
    the right ascension of the meridian (ARMC), the geographic latitude phi and the
    obliquity epsilon:

        lambda = atan2( cos(ARMC),
                        -(sin(ARMC) * cos(eps) + tan(phi) * sin(eps)) )

    Note the sign arrangement: ``atan2(-A, B)`` and ``atan2(A, -B)`` differ by
    exactly 180 degrees, and the first form - which this test was written with
    initially - puts the ascendant in the descendant's place. The cross-check
    caught it.

    Shares only the obliquity with the engine's path; the rest is independent
    arithmetic, and it does not go through the provider's house routine at all.
    """
    armc = math.radians(armc_deg)
    phi = math.radians(latitude)
    eps = math.radians(obliquity)
    lam = math.atan2(
        math.cos(armc),
        -(math.sin(armc) * math.cos(eps) + math.tan(phi) * math.sin(eps)),
    )
    return norm360(math.degrees(lam))


@pytest.mark.parametrize("name, when, place", CHARTS, ids=CHART_IDS)
def test_ascendant_matches_an_independent_closed_form(
    ephemeris: Ephemeris, name: str, when: dt.datetime, place: Place
) -> None:
    """The engine's ascendant must match the closed-form expression.

    The lagna is the single most consequential number in the chart - it fixes every
    house - and the engine takes it from the provider. This checks that number
    against arithmetic the engine does not use.
    """
    jd = jd_from_utc(when)
    angles = ephemeris.angles(jd, place.latitude, place.longitude)
    ayanamsa = ephemeris.ayanamsa_deg(jd)

    # The engine reports a sidereal ascendant; the closed form yields a tropical
    # one, so the ayanamsa is added back rather than the comparison being made in
    # the sidereal frame.
    ours_tropical = norm360(angles.ascendant_sid + ayanamsa)
    theirs = _independent_ascendant(angles.armc, place.latitude, angles.obliquity)

    delta = shortest_separation(ours_tropical, theirs)
    assert delta < ARCSECOND, (
        f"{name}: engine ascendant {ours_tropical:.6f} deg (tropical) vs the "
        f"independent closed form {theirs:.6f} deg, a difference of "
        f"{delta * 3600:.2f} arcseconds."
    )


@pytest.mark.parametrize("name, when, place", CHARTS, ids=CHART_IDS)
def test_midheaven_is_consistent_with_the_ascendant(
    ephemeris: Ephemeris, name: str, when: dt.datetime, place: Place
) -> None:
    """The MC must be the ecliptic longitude of the ARMC.

    An independent relation the engine never asserts: the meridian's ecliptic
    longitude follows from the ARMC and the obliquity alone, with no latitude term.
    """
    jd = jd_from_utc(when)
    angles = ephemeris.angles(jd, place.latitude, place.longitude)
    ayanamsa = ephemeris.ayanamsa_deg(jd)

    # tan(alpha) = cos(eps) * tan(lambda), quadrant-safe as atan2.
    armc = math.radians(angles.armc)
    eps = math.radians(angles.obliquity)
    expected = norm360(math.degrees(math.atan2(math.sin(armc), math.cos(armc) * math.cos(eps))))

    ours_tropical = norm360(angles.mc_sid + ayanamsa)
    delta = shortest_separation(ours_tropical, expected)
    assert delta < ARCSECOND, (
        f"{name}: engine MC {ours_tropical:.6f} vs {expected:.6f} from the ARMC, "
        f"a difference of {delta * 3600:.2f} arcseconds"
    )


# ---------------------------------------------------------------------------
# Whole-chart consistency across the two paths
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name, when, place", CHARTS, ids=CHART_IDS)
def test_full_chart_house_placements_survive_the_cross_check(
    ephemeris: Ephemeris, name: str, when: dt.datetime, place: Place
) -> None:
    """Every graha lands in the same house under both sidereal paths.

    The end-to-end consequence of the two checks above: if our conversion and the
    provider's agree to an arcsecond, no graha can fall on the far side of a sign
    boundary from where the provider would put it.
    """
    day, _moment = panchang_for_instant(ephemeris, when.date(), when, place)
    chart = compute_chart(ephemeris, when, place, day.lights, day.vara.index)
    theirs = _swisseph_sidereal(jd_from_utc(when))

    from core.angles import rashi_of
    from core.chart.houses import whole_sign_house

    for graha in SAPTA_GRAHA:
        ours_house = chart.grahas[graha].house_whole_sign
        theirs_house = whole_sign_house(theirs[graha], chart.lagna.sid_lon)
        assert ours_house == theirs_house, (
            f"{name}/{graha.value}: house {ours_house} here, {theirs_house} via the "
            f"provider's own sidereal conversion "
            f"(rashi {chart.grahas[graha].point.rashi} vs {rashi_of(theirs[graha])})"
        )


def test_the_second_application_cross_check_is_still_outstanding() -> None:
    """A standing reminder, not a passing claim.

    CLAUDE.md 9.4 asks for a comparison against a second *independent
    implementation* - a different application, not a different path through the
    same library. That has not been done, and this test exists so the gap stays
    visible in the suite rather than being quietly satisfied by the checks above.

    It never fails. Its job is to print the shortfall on every run.
    """
    print(
        "\nCLAUDE.md 9.4 status: cross-checked against two independent computation "
        "paths (the provider's own sidereal conversion, and a closed-form "
        "ascendant). A comparison against a second *application* remains "
        "outstanding - see docs/DIVERGENCES.md O5."
    )


def test_the_nutation_convention_is_worth_about_thirteen_arcseconds(
    ephemeris: Ephemeris,
) -> None:
    """Pin the size of the D13 choice, which this cross-check is what found.

    The engine refers the ayanamsa to the *true* equinox of date, matching the
    provider's own sidereal mode. Referring it to the mean equinox instead - which
    is what the older ``get_ayanamsa_ut`` always did - shifts every sidereal
    longitude by the nutation in longitude.

    Recorded as a number so the magnitude stays visible: it is small enough to sit
    inside the one-minute golden tolerance and large enough to move a pada boundary.
    """
    from core.enums import NodeType
    from core.ephemeris.swisseph_adapter import SwissEphemerisAdapter

    with_nutation = ephemeris
    without = SwissEphemerisAdapter(node_type=NodeType.MEAN, includes_nutation=False)

    for _name, when, _place in CHARTS:
        jd = jd_from_utc(when)
        delta_arcsec = abs(with_nutation.ayanamsa_deg(jd) - without.ayanamsa_deg(jd)) * 3600
        assert 0.0 < delta_arcsec < 20.0, (
            f"nutation in longitude came out as {delta_arcsec:.2f} arcseconds; it "
            "oscillates within about +/-17 over the 18.6-year nodal cycle"
        )

    assert with_nutation.info.ayanamsa_includes_nutation is True
    assert without.info.ayanamsa_includes_nutation is False


def test_nutation_cancels_in_the_elongation_limbs() -> None:
    """The D13 shift moves the limbs unevenly, and two of them not at all.

    This is worth pinning because the naive expectation - "a 12.8 arcsecond
    ayanamsa change nudges everything a little" - is wrong in both directions:

    * **tithi and karana do not move at all.** Both are functions of the
      elongation Moon - Sun, and the ayanamsa is subtracted from both terms, so it
      cancels algebraically. Asserted as exact equality, not a tolerance, because
      an approximate result here would mean the two longitudes were converted with
      different ayanamsa values.
    * **yoga moves about twice as far as nakshatra**, because a yoga is the *sum*
      of the two longitudes and so carries the shift twice, while a nakshatra
      depends on the Moon alone.
    * **sunrise does not move**, since a rise time comes from the Sun's altitude,
      which is not a sidereal quantity at all.

    A future change that broke the cancellation - converting the Sun and Moon
    through separate ayanamsa calls, say - would show up here as a tithi boundary
    that suddenly moved.
    """
    place = Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0)
    now = dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC)

    def reading(includes_nutation: bool) -> FullReading:
        return compute_full_reading(
            BirthData(
                name="Nutation",
                date=dt.date(1990, 6, 15),
                time=dt.time(14, 32),
                place=place,
                options=EngineOptions(ayanamsa_includes_nutation=includes_nutation),
            ),
            now=now,
        )

    mean_equinox, true_equinox = reading(False), reading(True)
    a, b = mean_equinox.panchang, true_equinox.panchang

    # Exact, not approximate: the ayanamsa cancels in the difference of longitudes.
    for limb in ("tithi_at_sunrise", "karana_at_sunrise"):
        first, second = getattr(a, limb), getattr(b, limb)
        assert first.start_utc == second.start_utc, f"{limb} start moved"
        assert first.end_utc == second.end_utc, f"{limb} end moved"
    assert a.lights.sunrise == b.lights.sunrise
    assert a.lights.sunset == b.lights.sunset

    nakshatra_shift = abs(
        (b.nakshatra_at_sunrise.end_utc - a.nakshatra_at_sunrise.end_utc).total_seconds()
    )
    yoga_shift = abs((b.yoga_at_sunrise.end_utc - a.yoga_at_sunrise.end_utc).total_seconds())

    assert 10.0 < nakshatra_shift < 60.0, f"nakshatra moved {nakshatra_shift:.1f}s"
    assert 10.0 < yoga_shift < 90.0, f"yoga moved {yoga_shift:.1f}s"
    # The Moon's motion (13.18 deg/day) versus the sum's (14.16 deg/day) makes the
    # ratio a little under two rather than exactly two.
    assert 1.6 < yoga_shift / nakshatra_shift < 2.0, (
        f"yoga/nakshatra shift ratio {yoga_shift / nakshatra_shift:.2f}; the yoga "
        "carries the ayanamsa shift twice because it is a sum of longitudes"
    )

"""Doshas that need computation rather than a rule-table predicate.

Kaal Sarpa is a geometric condition on the whole chart, and Shani Sade Sati is a
*transit* with a start, a current phase and an exit date - neither fits the
static YAML predicate grammar, so they live here. The rule-table doshas (Mangal
and friends) stay in ``core/rules/data/doshas.yaml``.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from core.angles import norm360, rashi_of
from core.chart.assemble import Chart
from core.enums import SAPTA_GRAHA, Gana, Graha, Nadi, Strength
from core.ephemeris.adapter import Ephemeris
from core.timeutil import jd_from_utc, utc_from_jd


@dataclass(frozen=True, slots=True)
class DoshaFinding:
    """A computed dosha, present or absent, always with its reasoning."""

    key: str
    present: bool
    strength: Strength | None
    evidence: tuple[str, ...]
    #: Free-form machine detail (dates, phases). Never prose, never localised.
    detail: dict[str, object] | None = None


# ---------------------------------------------------------------------------
# Kaal Sarpa
# ---------------------------------------------------------------------------


def kaal_sarpa(chart: Chart) -> DoshaFinding:
    """All seven grahas inside one of the two arcs bounded by Rahu and Ketu.

    The nodes are always exactly 180 degrees apart, so they cut the zodiac into
    two semicircles. Kaal Sarpa is the condition that every one of the seven
    grahas falls in the same semicircle.

    Two readings exist and both are reported:

    * **Complete** - every graha strictly inside the arc.
    * **Partial** - one graha sits at a node's own degree, so it is on the
      boundary rather than inside. Some authorities count this, some do not.

    The engine reports which, and lets the interpretation layer say what it means.
    """
    rahu = chart.grahas[Graha.RAHU].point.sid_lon
    positions = {g: chart.grahas[g].point.sid_lon for g in SAPTA_GRAHA}

    # Offset every graha from Rahu; the "Rahu to Ketu" arc is offset in [0, 180).
    offsets = {g: norm360(lon - rahu) for g, lon in positions.items()}
    on_boundary = [g for g, off in offsets.items() if off < 1e-9 or abs(off - 180.0) < 1e-9]
    in_rahu_ketu_arc = [g for g, off in offsets.items() if 0.0 < off < 180.0]
    in_ketu_rahu_arc = [g for g, off in offsets.items() if 180.0 < off < 360.0]

    if not in_ketu_rahu_arc and not on_boundary:
        return DoshaFinding(
            key="kaal_sarpa",
            present=True,
            strength=Strength.STRONG,
            evidence=(
                "all_seven_grahas_in_rahu_to_ketu_arc",
                *(f"{g.value}_in_rahu_to_ketu_arc" for g in SAPTA_GRAHA),
            ),
            detail={"arc": "rahu_to_ketu", "completeness": "complete"},
        )
    if not in_rahu_ketu_arc and not on_boundary:
        return DoshaFinding(
            key="kaal_sarpa",
            present=True,
            strength=Strength.STRONG,
            evidence=(
                "all_seven_grahas_in_ketu_to_rahu_arc",
                *(f"{g.value}_in_ketu_to_rahu_arc" for g in SAPTA_GRAHA),
            ),
            detail={"arc": "ketu_to_rahu", "completeness": "complete"},
        )
    if on_boundary and not (in_rahu_ketu_arc and in_ketu_rahu_arc):
        return DoshaFinding(
            key="kaal_sarpa",
            present=True,
            strength=Strength.MODERATE,
            evidence=tuple(f"{g.value}_conjunct_node_boundary" for g in on_boundary),
            detail={"completeness": "partial", "on_boundary": [g.value for g in on_boundary]},
        )
    return DoshaFinding(
        key="kaal_sarpa",
        present=False,
        strength=None,
        evidence=(
            f"grahas_split_across_both_node_arcs_"
            f"{len(in_rahu_ketu_arc)}_and_{len(in_ketu_rahu_arc)}",
        ),
    )


# ---------------------------------------------------------------------------
# Shani Sade Sati
# ---------------------------------------------------------------------------

#: Saturn's mean sidereal period in days, used only to bracket the search.
SATURN_PERIOD_DAYS: Final[float] = 10759.0


class SadeSatiPhase(StrEnum):
    """Which of the three rashis Saturn currently occupies."""

    RISING = "rising"  # 12th from the Moon
    PEAK = "peak"  # over the Moon itself
    SETTING = "setting"  # 2nd from the Moon
    NONE = "none"


@dataclass(frozen=True, slots=True)
class SadeSati:
    """Saturn transiting the 12th, 1st or 2nd rashi from the natal Moon."""

    active: bool
    phase: SadeSatiPhase
    saturn_rashi: int
    moon_rashi: int
    #: When Saturn entered the current one of the three rashis, and when it
    #: leaves the whole three-rashi span. Both are transit instants, not
    #: interpretations.
    phase_start_utc: dt.datetime | None
    exit_utc: dt.datetime | None
    #: Saturn retrogrades roughly 140 days a year, so it can re-enter a rashi it
    #: has already left. When true, the exit date is provisional.
    saturn_retrograde: bool


def sade_sati(eph: Ephemeris, chart: Chart, at: dt.datetime) -> SadeSati:
    """Sade Sati state at an instant, with the phase and the exit date.

    The span is the three consecutive rashis 12th, 1st and 2nd from the natal
    Moon - roughly seven and a half years of Saturn's 29.5-year circuit, hence
    the name (साडेसाती, "seven and a half").
    """
    moon_rashi = chart.grahas[Graha.MOON].point.rashi
    saturn = eph.position(Graha.SATURN, jd_from_utc(at))
    saturn_rashi = rashi_of(saturn.sidereal_lon)

    distance = (saturn_rashi - moon_rashi) % 12 + 1
    phase = {
        12: SadeSatiPhase.RISING,
        1: SadeSatiPhase.PEAK,
        2: SadeSatiPhase.SETTING,
    }.get(distance, SadeSatiPhase.NONE)

    if phase is SadeSatiPhase.NONE:
        return SadeSati(
            active=False,
            phase=phase,
            saturn_rashi=saturn_rashi,
            moon_rashi=moon_rashi,
            phase_start_utc=None,
            exit_utc=None,
            saturn_retrograde=saturn.is_retrograde,
        )

    # The span ends when Saturn leaves the 2nd from the Moon, i.e. crosses into
    # the 3rd. Rashi indices are 1-based, so the 3rd from the Moon starts at
    # 30 * ((moon_rashi - 1 + 2) % 12).
    exit_degree = 30.0 * ((moon_rashi - 1 + 2) % 12)
    return SadeSati(
        active=True,
        phase=phase,
        saturn_rashi=saturn_rashi,
        moon_rashi=moon_rashi,
        phase_start_utc=_saturn_ingress(eph, at, saturn_rashi, backward=True),
        exit_utc=_saturn_crossing(eph, at, exit_degree),
        saturn_retrograde=saturn.is_retrograde,
    )


def _saturn_lon(eph: Ephemeris, jd: float) -> float:
    """Saturn's sidereal longitude at a Julian Day.

    Saturn's crossings are found by bracket-and-bisect rather than by the Newton
    step in ``core.panchang.solver``: those helpers require a monotonically
    increasing angle, and Saturn retrogrades for about 140 days a year.
    """
    return eph.position(Graha.SATURN, jd).sidereal_lon


#: Bisection tolerance in days. 1e-7 d is 8.6 ms - three orders of magnitude
#: below the second the result is reported at, and well above the ~48 us float64
#: resolution of a Julian Day at this epoch (``JD_FLOAT_RESOLUTION_SECONDS``), so
#: the loop converges rather than grinding against the representation floor.
#:
#: This constant is why the answer no longer depends on the caller's clock. The
#: previous 1/1440 d (one minute) tolerance meant the loop stopped while the
#: bracket was still a minute wide and returned its *midpoint*, so the reported
#: instant was an artefact of where the bracket began - and the bracket began at
#: ``now``. See docs/DECISIONS.md D18 and audit/FINDINGS.md F-001.
_SATURN_SOLVE_TOL_DAYS: Final[float] = 1e-7

#: Coarse bracketing step. Saturn covers ~1 degree in 30 days, so a 30-day probe
#: cannot step over a crossing, and the step is wide enough that a retrograde loop
#: (~140 days) is not mistaken for one.
_SATURN_PROBE_STEP_DAYS: Final[float] = 30.0


def _saturn_crossing(eph: Ephemeris, after: dt.datetime, target_deg: float) -> dt.datetime | None:
    """First instant after ``after`` at which Saturn's longitude reaches ``target``.

    Bisection on the *unwrapped* distance to the target, stepping forward in
    30-day increments until the sign of the residual flips. Saturn's retrograde
    loops mean a Newton step can walk backwards, and its five-month retrograde
    arc is much wider than a 30-day probe, so a coarse bracket then bisect is
    both simpler and safe here.

    **The returned instant is a property of Saturn, not of the request.** Two
    callers asking on different days about the same crossing get the same answer,
    which matters because these instants reach ChartFacts and therefore the
    narrative cache key: an exit date that wobbled by a second regenerated the
    reader's Sade Sati paragraph on every reload (audit F-002). Two things secure
    that, and both are needed:

    * bisection runs to :data:`_SATURN_SOLVE_TOL_DAYS`, so the result is the root
      itself rather than the middle of whatever bracket happened to contain it;
    * the result is rounded to the whole second it is reported at, which absorbs
      the residual float noise that a differently-positioned bracket still leaves
      in the last bits.

    Rounding alone would not have been a fix - it would have hidden the wobble
    mid-second and re-exposed it at a second boundary. Converging first is what
    makes the rounding safe, and the two together are what the regression test
    sweeping ``now`` over a full grid period actually pins.
    """
    jd0 = jd_from_utc(after)
    step = _SATURN_PROBE_STEP_DAYS
    prev_jd = jd0
    prev = norm360(target_deg - _saturn_lon(eph, jd0))
    # Search at most one full Saturn circuit forward.
    limit = jd0 + SATURN_PERIOD_DAYS
    jd = jd0 + step
    while jd < limit:
        current = norm360(target_deg - _saturn_lon(eph, jd))
        # The residual falls toward 0 as Saturn approaches; a wrap past 0 shows
        # up as a jump from a small value to a value close to 360.
        if current > 300.0 and prev < 60.0:
            return _to_second(utc_from_jd(_bisect_saturn(eph, prev_jd, jd, target_deg)))
        prev_jd, prev = jd, current
        jd += step
    return None


def _to_second(when: dt.datetime) -> dt.datetime:
    """Round to the nearest whole second - the resolution these instants are known at.

    Publishing microseconds for a solved root claimed a precision the solver does
    not have, and put its trailing float noise into the narrative cache key
    (audit F-021).
    """
    return (when + dt.timedelta(microseconds=500_000)).replace(microsecond=0)


def _bisect_saturn(eph: Ephemeris, lo: float, hi: float, target_deg: float) -> float:
    """Refine a bracketed Saturn crossing to :data:`_SATURN_SOLVE_TOL_DAYS`.

    The iteration cap is a backstop, not the exit condition: halving a 30-day
    bracket to 1e-7 d needs about 48 steps, so 80 leaves margin without ever
    letting a pathological bracket spin.
    """
    for _ in range(80):
        if (hi - lo) < _SATURN_SOLVE_TOL_DAYS:
            break
        mid = (lo + hi) / 2.0
        if norm360(target_deg - _saturn_lon(eph, mid)) < 180.0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def _saturn_ingress(
    eph: Ephemeris, at: dt.datetime, rashi: int, *, backward: bool
) -> dt.datetime | None:
    """When Saturn entered ``rashi``, searching backward from ``at``."""
    if not backward:  # pragma: no cover - only the backward form is used
        return _saturn_crossing(eph, at, 30.0 * (rashi - 1))
    target = 30.0 * (rashi - 1)
    jd_at = jd_from_utc(at)
    # Saturn spends ~2.5 years per rashi, so three years back always brackets it.
    start = utc_from_jd(jd_at - 3.0 * 365.25)
    found = _saturn_crossing(eph, start, target)
    return found if found is not None and found <= at else None


# ---------------------------------------------------------------------------
# Nadi dosha
# ---------------------------------------------------------------------------

#: Nadi of each nakshatra, 1-based index. The pattern is a repeating
#: Adi-Madhya-Antya cycle that reverses every three nakshatras, which is why it
#: is tabulated rather than computed: the reversal points are conventional.
NAKSHATRA_NADI: Final[tuple[Nadi, ...]] = (
    Nadi.ADI,
    Nadi.MADHYA,
    Nadi.ANTYA,  # Ashwini, Bharani, Krittika
    Nadi.ANTYA,
    Nadi.MADHYA,
    Nadi.ADI,  # Rohini, Mrigashira, Ardra
    Nadi.ADI,
    Nadi.MADHYA,
    Nadi.ANTYA,  # Punarvasu, Pushya, Ashlesha
    Nadi.ANTYA,
    Nadi.MADHYA,
    Nadi.ADI,  # Magha, P.Phalguni, U.Phalguni
    Nadi.ADI,
    Nadi.MADHYA,
    Nadi.ANTYA,  # Hasta, Chitra, Swati
    Nadi.ANTYA,
    Nadi.MADHYA,
    Nadi.ADI,  # Vishakha, Anuradha, Jyeshtha
    Nadi.ADI,
    Nadi.MADHYA,
    Nadi.ANTYA,  # Mula, P.Ashadha, U.Ashadha
    Nadi.ANTYA,
    Nadi.MADHYA,
    Nadi.ADI,  # Shravana, Dhanishtha, Shatataraka
    Nadi.ADI,
    Nadi.MADHYA,
    Nadi.ANTYA,  # P.Bhadrapada, U.Bhadrapada, Revati
)

#: Gana of each nakshatra, 1-based. Guna Milan koot 6.
NAKSHATRA_GANA: Final[tuple[Gana, ...]] = (
    Gana.DEVA,
    Gana.MANUSHYA,
    Gana.RAKSHASA,  # Ashwini, Bharani, Krittika
    Gana.MANUSHYA,
    Gana.DEVA,
    Gana.MANUSHYA,  # Rohini, Mrigashira, Ardra
    Gana.DEVA,
    Gana.DEVA,
    Gana.RAKSHASA,  # Punarvasu, Pushya, Ashlesha
    Gana.RAKSHASA,
    Gana.MANUSHYA,
    Gana.MANUSHYA,  # Magha, P.Phalguni, U.Phalguni
    Gana.DEVA,
    Gana.RAKSHASA,
    Gana.DEVA,  # Hasta, Chitra, Swati
    Gana.RAKSHASA,
    Gana.DEVA,
    Gana.RAKSHASA,  # Vishakha, Anuradha, Jyeshtha
    Gana.RAKSHASA,
    Gana.MANUSHYA,
    Gana.MANUSHYA,  # Mula, P.Ashadha, U.Ashadha
    Gana.DEVA,
    Gana.RAKSHASA,
    Gana.RAKSHASA,  # Shravana, Dhanishtha, Shatataraka
    Gana.MANUSHYA,
    Gana.MANUSHYA,
    Gana.DEVA,  # P.Bhadrapada, U.Bhadrapada, Revati
)


def nadi_of(nakshatra_1based: int) -> Nadi:
    if not 1 <= nakshatra_1based <= 27:
        raise ValueError(f"nakshatra index out of range: {nakshatra_1based}")
    return NAKSHATRA_NADI[nakshatra_1based - 1]


def gana_of(nakshatra_1based: int) -> Gana:
    if not 1 <= nakshatra_1based <= 27:
        raise ValueError(f"nakshatra index out of range: {nakshatra_1based}")
    return NAKSHATRA_GANA[nakshatra_1based - 1]


def nadi_dosha(nakshatra_a: int, nakshatra_b: int) -> DoshaFinding:
    """Nadi dosha: both charts sharing the same nadi.

    Reported as information with its evidence. CLAUDE.md 6.7 forbids presenting
    this - or anything else - as a verdict on a marriage, and
    :func:`core.milan.ashtakoot.compute_milan` carries the classical exceptions
    alongside it.
    """
    nadi_a, nadi_b = nadi_of(nakshatra_a), nadi_of(nakshatra_b)
    same = nadi_a is nadi_b
    return DoshaFinding(
        key="nadi_dosha",
        present=same,
        strength=Strength.MODERATE if same else None,
        evidence=(f"nadi_a_{nadi_a.value}", f"nadi_b_{nadi_b.value}"),
        detail={"same_nadi": same, "nadi": nadi_a.value if same else None},
    )

"""Root finding for panchang limb boundaries.

Every limb (tithi, nakshatra, yoga, karana) is "an angle has advanced past a
multiple of some step". All four therefore reduce to one problem: given an angle
that increases monotonically with time, find the instant it equals a target.

The three driving angles are monotonically increasing, which is what makes a
Newton step safe:

* **Elongation** ``moon - sun``. The Moon's mean sidereal motion (13.176 deg/d)
  exceeds the Sun's (0.986 deg/d) by far more than the Moon's speed varies
  (11.8-15.4 deg/d), so the difference is never negative. Drives tithi and
  karana.
* **Moon longitude**. The Moon never retrogrades. Drives nakshatra.
* **Sum** ``sun + moon``. Both terms increase. Drives yoga.

A pure bisection would also work but needs a bracketing pass; Newton on the
analytic rate (the ephemeris returns longitude *speed*, so the derivative is
exact rather than differenced) converges in three or four iterations to well
under a millisecond.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass

from core.angles import norm180, norm360
from core.enums import Graha
from core.ephemeris.adapter import Ephemeris
from core.timeutil import utc_from_jd

#: Convergence tolerance in degrees. The fastest driving angle is the yoga sum
#: at ~16.4 deg/day, so 1e-8 deg is ~5e-5 seconds of time.
SOLVE_TOL_DEG = 1e-8
MAX_NEWTON_ITER = 50


class SolverError(RuntimeError):
    """The Newton iteration failed to converge, or the bracket was invalid."""


@dataclass(frozen=True, slots=True)
class AngleSample:
    """An angle and its exact time derivative at one instant."""

    value: float  # degrees, normalised to [0, 360)
    rate: float  # degrees per day; must be > 0 for the solvers here


#: A driving angle: jd -> (value, rate).
DrivingAngle = Callable[[float], AngleSample]


def elongation(eph: Ephemeris) -> DrivingAngle:
    """``moon - sun``. Step 12 deg gives tithi, 6 deg gives karana."""

    def fn(jd: float) -> AngleSample:
        pos = eph.positions((Graha.SUN, Graha.MOON), jd)
        sun, moon = pos[Graha.SUN], pos[Graha.MOON]
        return AngleSample(
            value=norm360(moon.sidereal_lon - sun.sidereal_lon),
            rate=moon.speed_lon - sun.speed_lon,
        )

    return fn


def moon_longitude(eph: Ephemeris) -> DrivingAngle:
    """Moon sidereal longitude. Step 13 deg 20' gives nakshatra."""

    def fn(jd: float) -> AngleSample:
        moon = eph.position(Graha.MOON, jd)
        return AngleSample(value=moon.sidereal_lon, rate=moon.speed_lon)

    return fn


def sun_longitude(eph: Ephemeris) -> DrivingAngle:
    """Sun sidereal longitude. Step 30 deg gives sankranti (rashi ingress)."""

    def fn(jd: float) -> AngleSample:
        sun = eph.position(Graha.SUN, jd)
        return AngleSample(value=sun.sidereal_lon, rate=sun.speed_lon)

    return fn


def longitude_sum(eph: Ephemeris) -> DrivingAngle:
    """``sun + moon``. Step 13 deg 20' gives yoga."""

    def fn(jd: float) -> AngleSample:
        pos = eph.positions((Graha.SUN, Graha.MOON), jd)
        sun, moon = pos[Graha.SUN], pos[Graha.MOON]
        return AngleSample(
            value=norm360(sun.sidereal_lon + moon.sidereal_lon),
            rate=sun.speed_lon + moon.speed_lon,
        )

    return fn


def solve_target(angle: DrivingAngle, target_deg: float, jd_guess: float) -> float:
    """Julian Day at which ``angle`` equals ``target_deg`` (mod 360).

    ``jd_guess`` must be within half a revolution of the answer, which every
    caller in this package satisfies: they start from an instant inside the
    interval whose boundary they are looking for.
    """
    target = norm360(target_deg)
    jd = jd_guess
    for _ in range(MAX_NEWTON_ITER):
        sample = angle(jd)
        if sample.rate <= 0.0:
            raise SolverError(
                f"driving angle is not increasing at jd={jd} (rate={sample.rate}); "
                "the monotonicity assumption in this module is violated"
            )
        # Signed shortfall in (-180, 180]. Positive means the target is ahead.
        delta = norm180(target - sample.value)
        if abs(delta) < SOLVE_TOL_DEG:
            return jd
        jd += delta / sample.rate
    raise SolverError(
        f"no convergence for target={target_deg} from jd={jd_guess} "
        f"after {MAX_NEWTON_ITER} iterations"
    )


def solve_target_utc(angle: DrivingAngle, target_deg: float, jd_guess: float) -> dt.datetime:
    """:func:`solve_target` as a UTC-aware datetime."""
    return utc_from_jd(solve_target(angle, target_deg, jd_guess))


def index_and_bounds(
    angle: DrivingAngle, step_deg: float, jd: float
) -> tuple[int, dt.datetime, dt.datetime]:
    """Locate ``jd`` inside a ``step_deg`` division of a driving angle.

    Returns ``(zero_based_index, start_utc, end_utc)``. The index is
    ``floor(value / step)``, so a step of 12 deg on the elongation yields
    tithi 0-29 which callers offset to the 1-based traditional numbering.
    """
    sample = angle(jd)
    idx = int(sample.value // step_deg)
    start = solve_target_utc(angle, idx * step_deg, jd)
    end = solve_target_utc(angle, (idx + 1) * step_deg, jd)
    return idx, start, end


def next_boundary(angle: DrivingAngle, step_deg: float, jd: float) -> dt.datetime:
    """Instant of the next division boundary at or after ``jd``."""
    sample = angle(jd)
    idx = int(sample.value // step_deg)
    return solve_target_utc(angle, (idx + 1) * step_deg, jd)

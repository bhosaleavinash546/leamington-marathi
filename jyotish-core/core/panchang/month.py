"""Amanta lunar month naming, Shalivahana Shaka year, adhika and kshaya months.

CLAUDE.md N3: amanta (अमांत) months and Shalivahana Shaka are the defaults -
Maharashtra convention. Purnimanta is a flag, never the default.

**Naming rule (amanta).** A lunar month runs from one new moon to the next. It
takes its name from the solar rashi the Sun *enters* during it, offset so that
the month containing Mesha Sankranti is Chaitra:

    lunar month containing the Sun's ingress into rashi R  ->  MONTH_KEYS[R - 1]

Verified against three published Gudi Padwa dates: 2023-03-22, 2024-04-09 and
2025-03-30 each open a lunar month that contains the Mesha Sankranti of its year
(2023-04-14, 2024-04-13, 2025-04-14).

**Adhika (अधिक).** A lunar month in which the Sun enters no new rashi at all -
possible because the synodic month (29.53 d) is shorter than the mean solar month
(30.44 d). It is intercalary and takes the name of the *following* month with the
adhika marker; the following month is then the nija (निज, true) one. Checked
against Adhika Shravana 2023 (2023-07-18 to 2023-08-16: Karka ingress fell on
2023-07-17, Simha on 2023-08-17, so the month enclosed neither).

**Kshaya (क्षय).** The converse: two ingresses inside one lunar month, so one
month name is skipped entirely. Only possible near perihelion, when the solar
month is shortest - i.e. around Pausha/Magha/Phalguna - and only about once a
century. The month keeps the earlier name; the later name is reported as
suppressed rather than silently dropped (CLAUDE.md 4.4).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from core.angles import DEG_PER_RASHI, norm360
from core.enums import MONTH_KEYS, CalendarVariant, MonthAnomaly, Paksha
from core.ephemeris.adapter import Ephemeris
from core.panchang.solver import elongation, solve_target, sun_longitude
from core.timeutil import jd_from_utc, utc_from_jd

#: Mean synodic month, days. Used only to step the new-moon search, never as a
#: result.
SYNODIC_MONTH_DAYS = 29.530588853

#: Shalivahana Shaka epoch offset: Shaka 1 began in Gregorian 78 CE, so the
#: Shaka year is the Gregorian year of its Chaitra start minus 78.
SHAKA_EPOCH_OFFSET = 78

#: Guard on the backward walk in :func:`shaka_year_for`. A lunar year has 12 or
#: 13 months; 15 leaves headroom without allowing a runaway loop.
_MAX_MONTHS_BACK = 15


@dataclass(frozen=True, slots=True)
class Sankranti:
    """The Sun's ingress into a rashi (संक्रांती)."""

    rashi: int  # 1-12, the rashi being entered
    when_utc: dt.datetime


@dataclass(frozen=True, slots=True)
class LunarMonth:
    """One amanta month: new moon to new moon, named and classified."""

    start_utc: dt.datetime  # the conjunction that opens it
    end_utc: dt.datetime  # the next conjunction
    index: int  # 0 = Chaitra .. 11 = Phalguna
    key: str
    anomaly: MonthAnomaly
    #: For a kshaya month, the month name that is skipped. Otherwise ``None``.
    suppressed_key: str | None
    sankrantis: tuple[Sankranti, ...]

    @property
    def is_adhika(self) -> bool:
        return self.anomaly is MonthAnomaly.ADHIKA

    @property
    def display_key(self) -> str:
        """Key including the adhika marker, for locale lookup above ``core/``."""
        return f"adhika_{self.key}" if self.is_adhika else self.key


# ---------------------------------------------------------------------------
# New moon search
# ---------------------------------------------------------------------------


def nearest_new_moon_jd(eph: Ephemeris, jd: float) -> float:
    """Conjunction (elongation = 0) nearest ``jd``, within half a synodic month.

    The Newton step in :func:`~core.panchang.solver.solve_target` moves toward
    whichever conjunction is closer, because the signed shortfall is taken in
    (-180, 180].
    """
    return solve_target(elongation(eph), 0.0, jd)


def new_moon_at_or_before_jd(eph: Ephemeris, jd: float) -> float:
    """Latest conjunction at or before ``jd``."""
    nm = nearest_new_moon_jd(eph, jd)
    while nm > jd:
        nm = nearest_new_moon_jd(eph, nm - SYNODIC_MONTH_DAYS)
    return nm


def new_moon_after_jd(eph: Ephemeris, jd: float) -> float:
    """Earliest conjunction strictly after ``jd``."""
    nm = nearest_new_moon_jd(eph, jd)
    while nm <= jd:
        nm = nearest_new_moon_jd(eph, nm + SYNODIC_MONTH_DAYS)
    return nm


# ---------------------------------------------------------------------------
# Sankranti search
# ---------------------------------------------------------------------------


def sankrantis_between(eph: Ephemeris, jd_from: float, jd_to: float) -> tuple[Sankranti, ...]:
    """Every solar rashi ingress in the half-open interval ``[jd_from, jd_to)``.

    A lunar month spans 29-30 days and a solar month 29.4-31.4, so this returns
    zero, one or two entries - exactly the three cases the naming rule handles.
    """
    if jd_to <= jd_from:
        raise ValueError("sankranti window must be non-empty and forward in time")
    angle = sun_longitude(eph)
    lon = angle(jd_from).value
    next_index = int(lon // DEG_PER_RASHI) + 1  # 0-based division index to cross
    found: list[Sankranti] = []
    for _ in range(3):  # at most two can fall inside; the third exits the loop
        target = norm360(next_index * DEG_PER_RASHI)
        jd_cross = solve_target(angle, target, jd_from + 0.5 * (jd_to - jd_from))
        if jd_cross < jd_from:
            next_index += 1
            continue
        if jd_cross >= jd_to:
            break
        rashi = (next_index % 12) + 1  # crossing 30*k deg enters rashi k+1
        found.append(Sankranti(rashi=rashi, when_utc=utc_from_jd(jd_cross)))
        next_index += 1
    return tuple(found)


def previous_sankranti(eph: Ephemeris, when: dt.datetime) -> Sankranti:
    """The Sun's most recent rashi ingress strictly before ``when``.

    This is the start of the current solar month, which Shadbala's Masa-adhipati
    bala is keyed to.
    """
    angle = sun_longitude(eph)
    jd = jd_from_utc(when)
    idx = int(angle(jd).value // DEG_PER_RASHI)  # division just entered
    jd_cross = solve_target(angle, norm360(idx * DEG_PER_RASHI), jd)
    if jd_cross > jd:  # pragma: no cover - guards a boundary instant
        idx -= 1
        jd_cross = solve_target(angle, norm360(idx * DEG_PER_RASHI), jd)
    return Sankranti(rashi=(idx % 12) + 1, when_utc=utc_from_jd(jd_cross))


def solar_year_start(eph: Ephemeris, when: dt.datetime) -> Sankranti:
    """The Mesha Sankranti opening the solar year that contains ``when``.

    Keyed to the Sun crossing 0 degrees sidereal, which is the sidereal solar new
    year (Gudi Padwa is the *lunar* new year and falls up to a month earlier).
    Used by Shadbala's Varsha-adhipati bala.
    """
    angle = sun_longitude(eph)
    jd = jd_from_utc(when)
    jd_cross = solve_target(angle, 0.0, jd)
    if jd_cross > jd:
        jd_cross = solve_target(angle, 0.0, jd_cross - 365.0)
    return Sankranti(rashi=1, when_utc=utc_from_jd(jd_cross))


def next_sankranti(eph: Ephemeris, when: dt.datetime) -> Sankranti:
    """The Sun's next rashi ingress at or after ``when``."""
    angle = sun_longitude(eph)
    jd = jd_from_utc(when)
    idx = int(angle(jd).value // DEG_PER_RASHI) + 1
    jd_cross = solve_target(angle, norm360(idx * DEG_PER_RASHI), jd)
    if jd_cross < jd:  # crossed already; take the following one
        idx += 1
        jd_cross = solve_target(angle, norm360(idx * DEG_PER_RASHI), jd)
    return Sankranti(rashi=(idx % 12) + 1, when_utc=utc_from_jd(jd_cross))


# ---------------------------------------------------------------------------
# Month naming
# ---------------------------------------------------------------------------


def _month_bounds(eph: Ephemeris, jd: float) -> tuple[float, float]:
    start = new_moon_at_or_before_jd(eph, jd)
    return start, new_moon_after_jd(eph, start)


def lunar_month_at(eph: Ephemeris, when: dt.datetime) -> LunarMonth:
    """The amanta lunar month containing ``when``, named and classified."""
    return _lunar_month_from_jd(eph, jd_from_utc(when), _adhika_depth=0)


def _lunar_month_from_jd(eph: Ephemeris, jd: float, *, _adhika_depth: int) -> LunarMonth:
    start_jd, end_jd = _month_bounds(eph, jd)
    sankrantis = sankrantis_between(eph, start_jd, end_jd)
    start_utc, end_utc = utc_from_jd(start_jd), utc_from_jd(end_jd)

    if len(sankrantis) == 1:
        index = sankrantis[0].rashi - 1
        return LunarMonth(
            start_utc=start_utc,
            end_utc=end_utc,
            index=index,
            key=MONTH_KEYS[index],
            anomaly=MonthAnomaly.NONE,
            suppressed_key=None,
            sankrantis=sankrantis,
        )

    if len(sankrantis) >= 2:
        # Kshaya: this month absorbs two ingresses, so the later month name is
        # skipped from the calendar entirely.
        index = sankrantis[0].rashi - 1
        suppressed = MONTH_KEYS[sankrantis[1].rashi - 1]
        return LunarMonth(
            start_utc=start_utc,
            end_utc=end_utc,
            index=index,
            key=MONTH_KEYS[index],
            anomaly=MonthAnomaly.KSHAYA,
            suppressed_key=suppressed,
            sankrantis=sankrantis,
        )

    # Adhika: no ingress. Borrow the following month's name.
    if _adhika_depth > 0:  # pragma: no cover - two adhika months cannot adjoin
        raise RuntimeError("two consecutive adhika months are astronomically impossible")
    following = _lunar_month_from_jd(eph, end_jd + 1.0, _adhika_depth=_adhika_depth + 1)
    return LunarMonth(
        start_utc=start_utc,
        end_utc=end_utc,
        index=following.index,
        key=following.key,
        anomaly=MonthAnomaly.ADHIKA,
        suppressed_key=None,
        sankrantis=(),
    )


def resolve_month_name(
    month: LunarMonth, paksha: Paksha, variant: CalendarVariant
) -> tuple[int, str]:
    """Month index and key under the requested reckoning.

    In the shukla paksha both systems name the month identically. In the krishna
    paksha the purnimanta name runs one month ahead of the amanta name - amanta
    Chaitra Krishna Ashtami is purnimanta Vaishakha Krishna Ashtami - because a
    purnimanta month begins at the full moon in the middle of the amanta month.
    """
    if variant is CalendarVariant.AMANTA or paksha is Paksha.SHUKLA:
        return month.index, month.key
    index = (month.index + 1) % 12
    return index, MONTH_KEYS[index]


# ---------------------------------------------------------------------------
# Shaka year
# ---------------------------------------------------------------------------


def shaka_year_for(eph: Ephemeris, when: dt.datetime) -> int:
    """Shalivahana Shaka year current at ``when``.

    The Shaka year turns over at Chaitra Shukla Pratipada (Gudi Padwa), i.e. at
    the new moon that opens the first month named Chaitra. The walk goes back
    month by month to that conjunction and reads its Gregorian year.

    When a year carries an adhika Chaitra, the turnover is taken at the *first*
    month named Chaitra (the adhika one), so the Shaka year and the month name
    never disagree. Recorded in ``docs/DECISIONS.md`` D8.
    """
    month = lunar_month_at(eph, when)
    jd = jd_from_utc(month.start_utc)
    for _ in range(_MAX_MONTHS_BACK):
        if month.index == 0:  # Chaitra
            return month.start_utc.year - SHAKA_EPOCH_OFFSET
        jd = jd_from_utc(month.start_utc) - 1.0
        month = _lunar_month_from_jd(eph, jd, _adhika_depth=0)
    raise RuntimeError(  # pragma: no cover - a lunar year always contains Chaitra
        f"no Chaitra found walking back from jd={jd}"
    )

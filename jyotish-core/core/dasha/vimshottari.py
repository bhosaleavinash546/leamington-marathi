"""Vimshottari dasha — Mahadasha through Sookshma, four levels.

Keyed to the Moon's nakshatra at birth and the fraction of that nakshatra already
elapsed: the first Mahadasha belongs to the nakshatra's lord and its *unexpired*
balance is that lord's full term times the remaining fraction.

Lord order and years, totalling 120 (CLAUDE.md 3.4, hard-coded as a test vector):

====== ===== === ==== ==== ==== ======= ====== =======
Ketu   Venus Sun Moon Mars Rahu Jupiter Saturn Mercury
7      20    6   10   7    18   16      19     17
====== ===== === ==== ==== ==== ======= ====== =======

Sub-periods are strictly proportional at every level: an antardasha of lord B
inside a mahadasha of lord A runs for ``years[A] * years[B] / 120``, and the same
rule recurses to pratyantar and sookshma. So the whole tree is determined by nine
numbers and one starting fraction.

**Year length.** ``YearLength`` selects the definition and it changes the dates
materially: over a 120-year cycle, a 360-day savana year and a 365.2425-day solar
year drift apart by more than seventeen years. The default is
``solar_365.2425``, recorded in ``docs/DECISIONS.md`` D5. CLAUDE.md 3.4 calls
this "the most common silent divergence between two 'correct' kundali apps", so
the chosen value travels in every ChartFacts document.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Final

from core.enums import NAKSHATRA_LORD_CYCLE, DashaSystem, Graha, YearLength

#: Full term of each lord in years. The order is the cycle order, not the
#: classical graha order: Ketu leads because Ashwini is Ketu's nakshatra.
VIMSHOTTARI_YEARS: Final[dict[Graha, int]] = {
    Graha.KETU: 7,
    Graha.VENUS: 20,
    Graha.SUN: 6,
    Graha.MOON: 10,
    Graha.MARS: 7,
    Graha.RAHU: 18,
    Graha.JUPITER: 16,
    Graha.SATURN: 19,
    Graha.MERCURY: 17,
}

VIMSHOTTARI_TOTAL_YEARS: Final[int] = 120

#: Days per year for each definition.
YEAR_DAYS: Final[dict[YearLength, float]] = {
    YearLength.SAVANA_360: 360.0,
    YearLength.SOLAR_365_2425: 365.2425,
    YearLength.SIDEREAL_365_2563: 365.25636,
}

#: Deepest level this module computes. CLAUDE.md 3.4 requires four.
MAX_LEVEL: Final[int] = 4

LEVEL_NAMES: Final[tuple[str, ...]] = ("maha", "antar", "pratyantar", "sookshma")


class DashaError(ValueError):
    """Raised for an out-of-range level or a lord outside the cycle."""


@dataclass(frozen=True, slots=True)
class DashaPeriod:
    """One node of the dasha tree."""

    level: int  # 1 = maha .. 4 = sookshma
    lord: Graha
    start_utc: dt.datetime
    end_utc: dt.datetime
    #: Lords of the enclosing periods, outermost first. Empty for a mahadasha.
    ancestors: tuple[Graha, ...] = ()

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level - 1]

    @property
    def path(self) -> tuple[Graha, ...]:
        """Full lord chain, e.g. ``(saturn, mercury, venus)``."""
        return (*self.ancestors, self.lord)

    @property
    def duration_days(self) -> float:
        return (self.end_utc - self.start_utc).total_seconds() / 86400.0

    def contains(self, when: dt.datetime) -> bool:
        return self.start_utc <= when < self.end_utc


@dataclass(frozen=True, slots=True)
class CurrentDasha:
    """The chain of periods running at one instant, one per level."""

    periods: tuple[DashaPeriod, ...]

    @property
    def maha(self) -> DashaPeriod:
        return self.periods[0]

    def at_level(self, level: int) -> DashaPeriod | None:
        return next((p for p in self.periods if p.level == level), None)

    @property
    def lords(self) -> tuple[Graha, ...]:
        return tuple(p.lord for p in self.periods)


@dataclass(frozen=True, slots=True)
class VimshottariTimeline:
    """The full dasha tree for a birth, plus the metadata that fixes its dates."""

    system: DashaSystem
    year_length: YearLength
    #: Mahadashas in order. Each carries its own children lazily via
    #: :func:`subperiods`, so the tree is not materialised unless asked for.
    mahadashas: tuple[DashaPeriod, ...]
    #: Fraction of the birth nakshatra already elapsed, in [0, 1).
    birth_nakshatra_fraction: float
    birth_nakshatra_lord: Graha
    #: Years of the first mahadasha still to run at birth.
    balance_years: float

    def current(self, when: dt.datetime, depth: int = MAX_LEVEL) -> CurrentDasha:
        """The running period chain at ``when``, down to ``depth`` levels."""
        chain: list[DashaPeriod] = []
        candidates = self.mahadashas
        for _ in range(depth):
            found = next((p for p in candidates if p.contains(when)), None)
            if found is None:
                break
            chain.append(found)
            if found.level >= MAX_LEVEL:
                break
            candidates = subperiods(found, self.year_length)
        if not chain:
            raise DashaError(
                f"{when.isoformat()} lies outside the computed 120-year timeline "
                f"({self.mahadashas[0].start_utc.date()} to "
                f"{self.mahadashas[-1].end_utc.date()})"
            )
        return CurrentDasha(periods=tuple(chain))


def lord_sequence(start_lord: Graha) -> tuple[Graha, ...]:
    """The nine lords in cycle order beginning at ``start_lord``."""
    try:
        offset = NAKSHATRA_LORD_CYCLE.index(start_lord)
    except ValueError as exc:
        raise DashaError(f"{start_lord} is not a Vimshottari lord") from exc
    return tuple(NAKSHATRA_LORD_CYCLE[(offset + i) % 9] for i in range(9))


def _days(years: float, year_length: YearLength) -> dt.timedelta:
    """Convert a period in dasha-years to a timedelta, at microsecond resolution."""
    return dt.timedelta(microseconds=round(years * YEAR_DAYS[year_length] * 86_400_000_000))


def build_timeline(
    birth_utc: dt.datetime,
    nakshatra_index: int,
    nakshatra_fraction: float,
    year_length: YearLength = YearLength.SOLAR_365_2425,
) -> VimshottariTimeline:
    """Nine mahadashas covering the 120-year cycle from birth.

    ``nakshatra_fraction`` is the elapsed fraction of the birth nakshatra, which
    :class:`core.panchang.limbs.NakshatraState` already carries.

    The first mahadasha is *truncated*: it began before birth, at
    ``birth - elapsed_fraction * term``, and only its balance runs after birth.
    That notional start is kept as the period's ``start_utc`` so that the timeline
    is contiguous and a "dasha at birth" query returns the right lord - a
    timeline that started the first mahadasha at the birth instant would silently
    shift every later date by up to twenty years.
    """
    if not 1 <= nakshatra_index <= 27:
        raise DashaError(f"nakshatra index out of range: {nakshatra_index}")
    if not 0.0 <= nakshatra_fraction < 1.0:
        raise DashaError(f"nakshatra fraction out of range: {nakshatra_fraction}")

    first_lord = NAKSHATRA_LORD_CYCLE[(nakshatra_index - 1) % 9]
    first_term = float(VIMSHOTTARI_YEARS[first_lord])
    elapsed_years = first_term * nakshatra_fraction

    # Degenerate boundary: a birth in the last fraction of a nakshatra whose
    # remaining balance rounds away to nothing at microsecond resolution. Such a
    # birth is indistinguishable from one at fraction 0.0 of the *next*
    # nakshatra, so it is treated as exactly that - the next lord in the cycle
    # opens with a full term. Without this, the first mahadasha would end at the
    # birth instant and `current(birth)` would find no running period at all.
    if _days(first_term - elapsed_years, year_length) == dt.timedelta(0):
        first_lord = NAKSHATRA_LORD_CYCLE[nakshatra_index % 9]
        first_term = float(VIMSHOTTARI_YEARS[first_lord])
        elapsed_years = 0.0
        nakshatra_fraction = 0.0

    sequence = lord_sequence(first_lord)
    cursor = birth_utc - _days(elapsed_years, year_length)

    periods: list[DashaPeriod] = []
    for lord in sequence:
        term = float(VIMSHOTTARI_YEARS[lord])
        end = cursor + _days(term, year_length)
        periods.append(DashaPeriod(level=1, lord=lord, start_utc=cursor, end_utc=end))
        cursor = end

    return VimshottariTimeline(
        system=DashaSystem.VIMSHOTTARI,
        year_length=year_length,
        mahadashas=tuple(periods),
        birth_nakshatra_fraction=nakshatra_fraction,
        birth_nakshatra_lord=first_lord,
        balance_years=first_term - elapsed_years,
    )


def subperiods(parent: DashaPeriod, year_length: YearLength) -> tuple[DashaPeriod, ...]:
    """The nine children of a dasha period.

    Children begin with the parent's own lord and proceed in cycle order, each
    taking a share of the parent's span proportional to its Vimshottari years.

    The spans are derived by *accumulating exact rational shares of the parent's
    duration* rather than by summing nine independently rounded timedeltas, so the
    children close exactly on the parent's end instant with no drift. The
    contiguity invariant in ``tests/invariants/test_dasha.py`` checks this to the
    microsecond at all four levels.
    """
    if parent.level >= MAX_LEVEL:
        return ()
    total = parent.end_utc - parent.start_utc
    sequence = lord_sequence(parent.lord)
    ancestors = (*parent.ancestors, parent.lord)

    out: list[DashaPeriod] = []
    cumulative_years = 0
    cursor = parent.start_utc
    for lord in sequence:
        cumulative_years += VIMSHOTTARI_YEARS[lord]
        # Fraction of the parent elapsed at the END of this child.
        end = parent.start_utc + total * cumulative_years / VIMSHOTTARI_TOTAL_YEARS
        out.append(
            DashaPeriod(
                level=parent.level + 1,
                lord=lord,
                start_utc=cursor,
                end_utc=end,
                ancestors=ancestors,
            )
        )
        cursor = end
    # The accumulation above makes the last child's end exactly the parent's end,
    # because cumulative_years reaches 120. Assert it rather than trust it.
    assert out[-1].end_utc == parent.end_utc, "subperiod accumulation drifted"
    return tuple(out)


def flatten(timeline: VimshottariTimeline, depth: int = MAX_LEVEL) -> tuple[DashaPeriod, ...]:
    """Every period down to ``depth``, in chronological order within each level.

    A four-level flatten is 9 + 81 + 729 + 6561 = 7380 periods, which is small
    enough to materialise but large enough that the UI should page it - hence the
    collapsible tree in CLAUDE.md 8.
    """
    if not 1 <= depth <= MAX_LEVEL:
        raise DashaError(f"depth must be 1..{MAX_LEVEL}, got {depth}")
    out: list[DashaPeriod] = []

    def walk(period: DashaPeriod) -> None:
        out.append(period)
        if period.level < depth:
            for child in subperiods(period, timeline.year_length):
                walk(child)

    for maha in timeline.mahadashas:
        walk(maha)
    return tuple(out)


def periods_at_level(timeline: VimshottariTimeline, level: int) -> tuple[DashaPeriod, ...]:
    """All periods at exactly one level, chronologically."""
    return tuple(p for p in flatten(timeline, level) if p.level == level)

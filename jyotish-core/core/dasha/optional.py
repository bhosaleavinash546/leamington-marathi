"""Optional dasha systems behind flags: Ashtottari (108y) and Yogini (36y).

CLAUDE.md 3.4 lists these as "Optional systems behind flags". What is delivered
here is the part that is certain, and what is *not* delivered is refused loudly
rather than guessed.

**Delivered.** Both period tables, verified against their stated totals (108 and
36 years), and the generic proportional sub-period builder, which works
identically for every dasha system: a child's share of its parent is its own term
divided by the system total.

**Deliberately not delivered.** The nakshatra-to-starting-lord mapping for either
system. Vimshottari's mapping is unambiguous - nine lords over twenty-seven
nakshatras, three each, Ashwini to Ketu - and CLAUDE.md 3.4 states it outright.
Ashtottari's eight lords cover the nakshatras in groups of *unequal* size, and
published tables differ over both the starting nakshatra and the group
boundaries; Yogini's starting-yogini formula is likewise quoted several ways.

CLAUDE.md 11 is explicit: "Ask before inventing a convention. If the spec is
silent on a computational school, **stop and ask** - do not pick one silently."
So :func:`ashtottari_starting_lord` and :func:`yogini_starting_lord` raise
:class:`UnsourcedConventionError` naming exactly what has to be sourced. Supply a
table via :func:`build_generic_timeline` and the rest of the machinery works
today.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Final

from core.dasha.vimshottari import YEAR_DAYS, DashaError
from core.enums import DashaSystem, Graha, YearLength


class UnsourcedConventionError(NotImplementedError):
    """A computational school this engine refuses to guess at.

    Raised instead of returning a plausible-looking number, so that a missing
    convention surfaces as a failure at the call site rather than as wrong dates
    in a report.
    """


#: Ashtottari: eight lords, 108 years. Ketu takes no Ashtottari period.
ASHTOTTARI_YEARS: Final[dict[Graha, int]] = {
    Graha.SUN: 6,
    Graha.MOON: 15,
    Graha.MARS: 8,
    Graha.MERCURY: 17,
    Graha.SATURN: 10,
    Graha.JUPITER: 19,
    Graha.RAHU: 12,
    Graha.VENUS: 21,
}

ASHTOTTARI_TOTAL_YEARS: Final[int] = 108

#: Yogini: eight yoginis, 36 years, terms running 1 through 8. The graha
#: attribution of each yogini is stable across sources even where the starting
#: rule is not, so it is recorded here.
YOGINI_LORDS: Final[tuple[tuple[str, Graha, int], ...]] = (
    ("mangala", Graha.MOON, 1),
    ("pingala", Graha.SUN, 2),
    ("dhanya", Graha.JUPITER, 3),
    ("bhramari", Graha.MARS, 4),
    ("bhadrika", Graha.MERCURY, 5),
    ("ulka", Graha.SATURN, 6),
    ("siddha", Graha.VENUS, 7),
    ("sankata", Graha.RAHU, 8),
)

YOGINI_TOTAL_YEARS: Final[int] = 36


@dataclass(frozen=True, slots=True)
class GenericPeriod:
    """A dasha period in a system other than Vimshottari."""

    system: DashaSystem
    level: int
    lord: Graha
    #: Yogini periods carry a yogini name as well as a graha; empty otherwise.
    lord_key: str
    start_utc: dt.datetime
    end_utc: dt.datetime
    ancestors: tuple[Graha, ...] = ()

    def contains(self, when: dt.datetime) -> bool:
        return self.start_utc <= when < self.end_utc


def ashtottari_starting_lord(nakshatra_index: int) -> Graha:
    """Refuses: the Ashtottari nakshatra grouping is not sourced in this engine."""
    raise UnsourcedConventionError(
        "Ashtottari's nakshatra-to-lord grouping is not implemented. Its eight "
        "lords span the 27 nakshatras in groups of unequal size, and published "
        "tables disagree on the starting nakshatra and the group boundaries. "
        f"Supply a sourced 27-entry table (asked for nakshatra {nakshatra_index}) "
        "and record the source in docs/DECISIONS.md before enabling this system."
    )


def yogini_starting_lord(nakshatra_index: int) -> tuple[str, Graha]:
    """Refuses: the Yogini starting-yogini formula is not sourced in this engine."""
    raise UnsourcedConventionError(
        "Yogini's starting-yogini rule is not implemented. The offset applied to "
        "the birth nakshatra index is quoted several ways in the literature. "
        f"Supply a sourced 27-entry table (asked for nakshatra {nakshatra_index}) "
        "and record the source in docs/DECISIONS.md before enabling this system."
    )


def build_generic_timeline(
    system: DashaSystem,
    birth_utc: dt.datetime,
    starting_lord: Graha,
    elapsed_fraction: float,
    terms: dict[Graha, int],
    total_years: int,
    year_length: YearLength = YearLength.SOLAR_365_2425,
) -> tuple[GenericPeriod, ...]:
    """One full cycle of any proportional dasha system.

    The construction is identical to Vimshottari's: lords in cycle order from
    ``starting_lord``, the first period truncated by ``elapsed_fraction`` of its
    own term, and the notional pre-birth start retained so the timeline is
    contiguous.

    ``terms`` must sum to ``total_years``; that is checked, because a table with a
    transcription slip would otherwise produce a cycle of the wrong length and
    every date after the first period would be wrong by a plausible-looking amount.
    """
    if sum(terms.values()) != total_years:
        raise DashaError(
            f"{system.value} terms sum to {sum(terms.values())}, expected {total_years}"
        )
    if starting_lord not in terms:
        raise DashaError(f"{starting_lord} is not a lord in {system.value}")
    if not 0.0 <= elapsed_fraction < 1.0:
        raise DashaError(f"elapsed fraction out of range: {elapsed_fraction}")

    order = list(terms)
    offset = order.index(starting_lord)
    sequence = [order[(offset + i) % len(order)] for i in range(len(order))]

    def days(years: float) -> dt.timedelta:
        return dt.timedelta(microseconds=round(years * YEAR_DAYS[year_length] * 86_400_000_000))

    cursor = birth_utc - days(terms[starting_lord] * elapsed_fraction)
    out: list[GenericPeriod] = []
    for lord in sequence:
        end = cursor + days(float(terms[lord]))
        out.append(
            GenericPeriod(
                system=system,
                level=1,
                lord=lord,
                lord_key=lord.value,
                start_utc=cursor,
                end_utc=end,
            )
        )
        cursor = end
    return tuple(out)


def generic_subperiods(
    parent: GenericPeriod, terms: dict[Graha, int], total_years: int
) -> tuple[GenericPeriod, ...]:
    """Proportional children of a period in any system.

    Uses the same cumulative-share accumulation as Vimshottari so the children
    close exactly on the parent's end instant.
    """
    order = list(terms)
    offset = order.index(parent.lord)
    sequence = [order[(offset + i) % len(order)] for i in range(len(order))]
    total = parent.end_utc - parent.start_utc
    ancestors = (*parent.ancestors, parent.lord)

    out: list[GenericPeriod] = []
    cumulative = 0
    cursor = parent.start_utc
    for lord in sequence:
        cumulative += terms[lord]
        end = parent.start_utc + total * cumulative / total_years
        out.append(
            GenericPeriod(
                system=parent.system,
                level=parent.level + 1,
                lord=lord,
                lord_key=lord.value,
                start_utc=cursor,
                end_utc=end,
                ancestors=ancestors,
            )
        )
        cursor = end
    return tuple(out)

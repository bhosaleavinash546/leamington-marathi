"""``/settle`` — work out which convention a printed panchang value is consistent with.

The open questions in ``docs/DIVERGENCES.md`` are blocked on दाते पंचांग, but not
equally and not on the same page. Each printed quantity is sensitive to a
different subset of the unknowns, so a transcription plan that targets the right
four values settles more than forty ordinary days would.

Measured sensitivities, Pune 2024-06-21 (reproduce with ``--matrix``):

===================  ==================  =====================  ================
printed value        ayanamsa L -> TC    sunrise convention     observer height
===================  ==================  =====================  ================
tithi end            0.00 min            0.00 min               0.00 min
karana end           0.00 min            0.00 min               0.00 min
**nakshatra end**    **-1.48 min**       0.00 min               0.00 min
**yoga end**         **-2.76 min**       0.00 min               0.00 min
**sunrise**          0.00 min            **+3.83 min**          **-3.85 min**
===================  ==================  =====================  ================

Three things follow, and they are the whole point of this tool:

1. **A yoga or nakshatra end-time settles the ayanamsa (F-008) on its own.**
   Neither is touched by the sunrise question, so it needs no assumption about
   O1 or F-007. Prefer the yoga: at 2.76 minutes it clears the +/-1 minute
   tolerance comfortably, where the nakshatra's 1.48 leaves less room.

2. **A tithi or karana end-time settles nothing about conventions** - which makes
   it the ideal control. It should match whatever the ayanamsa turns out to be,
   so a mismatch there points at the ephemeris or the solver instead.

3. **One printed sunrise cannot separate O1 from F-007.** The two move it by
   +3.83 and -3.85 minutes respectively - opposite signs, near-equal size - so
   they very nearly cancel. A sunrise that matches the current default is equally
   consistent with "upper limb, elevation ignored" and with "disc centre without
   refraction, elevation applied". Separating them needs either two places of very
   different height, or the almanac's own स्थानिक भेद table: if its place
   corrections have no height column, elevation is not applied.

Usage::

    python -m tools.settle --matrix
    python -m tools.settle --date 2024-06-21 --place pune --yoga-end 14:23
    python -m tools.settle --date 2024-06-21 --place pune --sunrise 06:02

Every verdict is phrased as *consistent with*, never as proof: one value can rule
conventions out, and a single agreement is not agreement across the 62 cases.
"""

from __future__ import annotations

import argparse
import datetime as dt
from dataclasses import dataclass
from typing import Final
from zoneinfo import ZoneInfo

from core.ephemeris.registry import build_ephemeris
from core.panchang.day import compute_panchang_day
from core.panchang.solar import compute_day_lights
from core.types import EngineOptions, Place

#: A few reference places, so a transcription session needs no coordinates to hand.
PLACES: Final[dict[str, Place]] = {
    "pune": Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
    "mumbai": Place("Mumbai", 19.0760, 72.8777, "Asia/Kolkata", 14.0),
    "nagpur": Place("Nagpur", 21.1458, 79.0882, "Asia/Kolkata", 310.0),
    "kolhapur": Place("Kolhapur", 16.7050, 74.2433, "Asia/Kolkata", 569.0),
    "mahabaleshwar": Place("Mahabaleshwar", 17.9237, 73.6586, "Asia/Kolkata", 1353.0),
}

#: The candidate ayanamsas. Lahiri and True Chitra sit ~1 arcminute apart, which
#: is the discrimination this tool exists to make (audit F-008).
AYANAMSAS: Final[tuple[str, ...]] = ("lahiri", "true_chitra", "raman", "kp")

#: Rise/set altitudes for the three conventions in docs/SUNRISE_CONVENTION.md.
CONVENTIONS: Final[dict[str, float]] = {
    "upper_limb_refracted": -50.0 / 60.0,
    "disc_centre_refracted": -0.3,
    "disc_centre_no_refraction": 0.0,
}

#: A printed panchang is given to the minute, so agreement is judged there.
TOLERANCE_MINUTES: Final[float] = 1.0


@dataclass(frozen=True, slots=True)
class Candidate:
    """One convention setting and the value it produces."""

    label: str
    computed: dt.datetime
    delta_minutes: float

    @property
    def consistent(self) -> bool:
        return abs(self.delta_minutes) <= TOLERANCE_MINUTES


def _local(when: dt.datetime, place: Place) -> str:
    return when.astimezone(ZoneInfo(place.iana_tz)).strftime("%H:%M:%S")


def _printed(date: dt.date, hhmm: str, place: Place) -> dt.datetime:
    """Parse a printed local time into an aware instant on ``date``."""
    hour, minute = (int(part) for part in hhmm.split(":", 1))
    naive = dt.datetime.combine(date, dt.time(hour, minute))
    return naive.replace(tzinfo=ZoneInfo(place.iana_tz))


def ayanamsa_candidates(
    date: dt.date, place: Place, limb: str, printed: dt.datetime
) -> list[Candidate]:
    """What each ayanamsa gives for a limb's end-time on this date."""
    out: list[Candidate] = []
    for ayanamsa in AYANAMSAS:
        eph = build_ephemeris(EngineOptions(ayanamsa=ayanamsa))
        day = compute_panchang_day(eph, date, place, EngineOptions(ayanamsa=ayanamsa))
        node = getattr(day, f"{limb}_at_sunrise")
        out.append(
            Candidate(ayanamsa, node.end_utc, (node.end_utc - printed).total_seconds() / 60.0)
        )
    return out


def sunrise_candidates(date: dt.date, place: Place, printed: dt.datetime) -> list[Candidate]:
    """Sunrise under each disc/refraction convention, at the place's own height."""
    out: list[Candidate] = []
    for name, altitude in CONVENTIONS.items():
        eph = build_ephemeris(EngineOptions())
        lights = compute_day_lights(eph, date, place, EngineOptions(rise_set_altitude_deg=altitude))
        out.append(
            Candidate(name, lights.sunrise, (lights.sunrise - printed).total_seconds() / 60.0)
        )
    return out


def report(title: str, candidates: list[Candidate], place: Place, printed: dt.datetime) -> int:
    """Print the delta table and return the number of consistent candidates."""
    print(f"\n{title}")
    print(f"  almanac prints  {_local(printed, place)}")
    print(f"  {'candidate':30s}{'computed':>12s}{'Δ (min)':>10s}   verdict")
    for candidate in sorted(candidates, key=lambda c: abs(c.delta_minutes)):
        verdict = "consistent" if candidate.consistent else "ruled out"
        print(
            f"  {candidate.label:30s}{_local(candidate.computed, place):>12s}"
            f"{candidate.delta_minutes:>+10.2f}   {verdict}"
        )
    return sum(1 for c in candidates if c.consistent)


def print_matrix() -> None:
    """Reproduce the sensitivity table in this module's docstring."""
    date, place = dt.date(2024, 6, 21), PLACES["pune"]
    base_opts = EngineOptions()
    eph = build_ephemeris(base_opts)
    base_day = compute_panchang_day(eph, date, place, base_opts)
    chitra_opts = EngineOptions(ayanamsa="true_chitra")
    chitra = compute_panchang_day(build_ephemeris(chitra_opts), date, place, chitra_opts)

    print(f"Sensitivity matrix — {place.name} {date}, minutes\n")
    print(f"  {'printed value':22s}{'ayanamsa L→TC':>16s}{'sunrise convention':>21s}")
    for limb in ("tithi", "karana", "nakshatra", "yoga"):
        a = getattr(base_day, f"{limb}_at_sunrise").end_utc
        b = getattr(chitra, f"{limb}_at_sunrise").end_utc
        print(f"  {limb + ' end':22s}{(b - a).total_seconds() / 60:+13.2f} min{0.0:+18.2f} min")
    spread = [
        compute_day_lights(eph, date, place, EngineOptions(rise_set_altitude_deg=a)).sunrise
        for a in CONVENTIONS.values()
    ]
    worst = (max(spread) - min(spread)).total_seconds() / 60.0
    print(f"  {'sunrise':22s}{0.0:+13.2f} min{worst:+18.2f} min")
    print(
        "\n  A yoga or nakshatra end-time isolates the ayanamsa (F-008).\n"
        "  A tithi or karana end-time is the control: it should match either way.\n"
        "  Sunrise is moved by the convention (O1) and by observer height (F-007)\n"
        "  in opposite directions by near-equal amounts, so one printed sunrise\n"
        "  cannot separate them."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--matrix", action="store_true", help="print the sensitivity table and exit"
    )
    parser.add_argument("--date", help="the almanac page's date, YYYY-MM-DD")
    parser.add_argument("--place", choices=sorted(PLACES), default="pune")
    parser.add_argument("--yoga-end", help="printed yoga end time, HH:MM local")
    parser.add_argument("--nakshatra-end", help="printed nakshatra end time, HH:MM local")
    parser.add_argument("--tithi-end", help="printed tithi end time, HH:MM local (control)")
    parser.add_argument("--sunrise", help="printed sunrise, HH:MM local")
    args = parser.parse_args(argv)

    if args.matrix:
        print_matrix()
        return 0
    if not args.date:
        parser.error("--date is required unless --matrix is given")

    date = dt.date.fromisoformat(args.date)
    place = PLACES[args.place]
    print(f"{place.name} {date}  (authority: दाते पंचांग, tolerance ±{TOLERANCE_MINUTES:.0f} min)")

    surviving: dict[str, int] = {}
    for limb, value in (("yoga", args.yoga_end), ("nakshatra", args.nakshatra_end)):
        if value:
            printed = _printed(date, value, place)
            surviving[limb] = report(
                f"{limb} end-time → ayanamsa (F-008)",
                ayanamsa_candidates(date, place, limb, printed),
                place,
                printed,
            )
    if args.tithi_end:
        printed = _printed(date, args.tithi_end, place)
        report(
            "tithi end-time → CONTROL: ayanamsa-invariant, tests the ephemeris and solver",
            ayanamsa_candidates(date, place, "tithi", printed),
            place,
            printed,
        )
    if args.sunrise:
        printed = _printed(date, args.sunrise, place)
        report(
            "sunrise → disc/refraction convention (O1), CONFOUNDED with height (F-007)",
            sunrise_candidates(date, place, printed),
            place,
            printed,
        )
        print(
            "\n  Note: observer height would move sunrise by about -3.9 min at Pune if\n"
            "  applied, against +3.8 min across the conventions. A match here rules out\n"
            "  less than it appears to. See docs/DIVERGENCES.md O1 and F-007."
        )

    if not any((args.yoga_end, args.nakshatra_end, args.tithi_end, args.sunrise)):
        parser.error("give at least one printed value, or --matrix")

    if surviving and all(count == 1 for count in surviving.values()):
        print("\nOne ayanamsa survives. That settles F-008 for this date; transcribe a")
        print("second date before treating it as settled generally.")
    elif surviving:
        print("\nMore than one ayanamsa is still consistent. A yoga end-time discriminates")
        print("more sharply than a nakshatra end-time; try one on a second date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

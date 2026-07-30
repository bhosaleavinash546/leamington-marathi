"""``/facts-dump <birth>`` — print the full ChartFacts JSON for a birth input.

    python -m tools.facts_dump --name Avinash --date 1990-06-15 --time 14:32 \
        --lat 18.5204 --lon 73.8567 --tz Asia/Kolkata

Omit ``--time`` to exercise the unknown-birth-time path in CLAUDE.md 4.6 and see
which fields are suppressed rather than defaulted.

The output is validated against the JSON Schema before printing, so this doubles
as a one-shot contract check.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

from core.enums import Gender, TimeAccuracy, TimeStandard
from core.facts.builder import build_chart_facts, compute_full_reading
from core.facts.validate import ChartFactsError, assert_no_devanagari, validate_chart_facts
from core.types import BirthData, EngineOptions, InputError, Place


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="facts_dump", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--name", default="Unnamed")
    parser.add_argument("--date", required=True, help="ISO date, e.g. 1990-06-15")
    parser.add_argument("--time", help="local clock time HH:MM; omit if unknown")
    parser.add_argument(
        "--accuracy",
        choices=[a.value for a in TimeAccuracy],
        default=None,
        help="defaults to 'exact' with --time, 'unknown' without",
    )
    parser.add_argument(
        "--time-standard",
        choices=[s.value for s in TimeStandard],
        default=TimeStandard.CLOCK_TIME_AS_RECORDED.value,
        help="how to read the recorded clock time (CLAUDE.md 4.1)",
    )
    parser.add_argument("--place", default="Unnamed place")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--elev", type=float, default=0.0)
    parser.add_argument("--tz", required=True, help="IANA zone, e.g. Asia/Kolkata")
    parser.add_argument("--gender", choices=[g.value for g in Gender], default=None)
    parser.add_argument("--ayanamsa", default="lahiri")
    parser.add_argument(
        "--ruleset", default="maharashtra", help="Mangal dosha school (CLAUDE.md 3.5)"
    )
    parser.add_argument(
        "--now",
        default=None,
        help="ISO instant for transit findings; defaults to the real now",
    )
    parser.add_argument("--compact", action="store_true", help="single-line JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    has_time = args.time is not None
    accuracy = TimeAccuracy(
        args.accuracy
        if args.accuracy
        else (TimeAccuracy.EXACT.value if has_time else TimeAccuracy.UNKNOWN.value)
    )

    try:
        birth = BirthData(
            name=args.name,
            date=dt.date.fromisoformat(args.date),
            time=dt.time.fromisoformat(args.time) if has_time else None,
            place=Place(
                name=args.place,
                latitude=args.lat,
                longitude=args.lon,
                iana_tz=args.tz,
                elevation_m=args.elev,
            ),
            time_accuracy=accuracy,
            time_standard=TimeStandard(args.time_standard),
            gender=Gender(args.gender) if args.gender else None,
            options=EngineOptions(ayanamsa=args.ayanamsa, mangal_dosha_ruleset=args.ruleset),
        )
    except (InputError, ValueError) as exc:
        print(f"bad input: {exc}", file=sys.stderr)
        return 2

    now = dt.datetime.fromisoformat(args.now) if args.now else None
    if now is not None and now.tzinfo is None:
        now = now.replace(tzinfo=dt.UTC)

    facts = build_chart_facts(compute_full_reading(birth, now=now))

    try:
        validate_chart_facts(facts)
        assert_no_devanagari(facts)
    except ChartFactsError as exc:
        print(f"ChartFacts failed its own contract:\n{exc}", file=sys.stderr)
        return 1

    if args.compact:
        print(json.dumps(facts, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(facts, ensure_ascii=False, indent=2))

    for warning in facts["confidence"]["warnings"]:
        print(f"warning: {warning}", file=sys.stderr)
    if facts["confidence"]["affected_fields"]:
        print(
            "birth time is not exact; these fields are unstable or suppressed:",
            file=sys.stderr,
        )
        for field in facts["confidence"]["affected_fields"]:
            print(f"  {field}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

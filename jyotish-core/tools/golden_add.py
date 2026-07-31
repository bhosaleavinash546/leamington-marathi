"""``/golden-add <date> <place>`` — scaffold a new golden case.

    python -m tools.golden_add 2024-11-01 pune --tag ordinary --birth-time 06:15

Prints a YAML block to append to ``tests/golden/cases.yaml``. The ``expected``
block comes out **empty**, because the values have to come off an almanac page and
not out of this engine (CLAUDE.md N2). ``tools/golden_verify --show-computed``
shows the field shape once the case exists.

CLAUDE.md 11 also says "Add a golden case for every bug you fix", which is the
main reason this is a one-liner.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys

import yaml

from tests.golden.loader import ALL_FIELDS, CASES_PATH, REQUIRED_TAGS


def known_places() -> dict[str, dict[str, object]]:
    raw = yaml.safe_load(CASES_PATH.read_text(encoding="utf-8"))
    places: dict[str, dict[str, object]] = raw["places"]
    return places


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="golden_add", description=__doc__)
    parser.add_argument("date", help="ISO date of the almanac page")
    parser.add_argument("place", help="place key from cases.yaml (e.g. pune)")
    parser.add_argument(
        "--tag",
        action="append",
        default=[],
        help=f"scenario tag; the required set is {sorted(REQUIRED_TAGS)}",
    )
    parser.add_argument("--birth-time", help="local HH:MM, for a case that pins a birth instant")
    parser.add_argument("--source", default="", help="almanac page reference")
    parser.add_argument("--notes", default="", help="why this case is interesting")
    parser.add_argument("--id", dest="case_id", default=None, help="override the generated id")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        date = dt.date.fromisoformat(args.date)
    except ValueError as exc:
        print(f"bad date: {exc}", file=sys.stderr)
        return 2

    places = known_places()
    if args.place not in places:
        print(
            f"unknown place {args.place!r}. Known: {', '.join(sorted(places))}.\n"
            "Add a new entry to the 'places' block of cases.yaml first - a panchang "
            "is published for a named place, so the coordinate is part of the case.",
            file=sys.stderr,
        )
        return 2

    existing = {c["id"] for c in yaml.safe_load(CASES_PATH.read_text(encoding="utf-8"))["cases"]}
    case_id = args.case_id or f"{args.place}-{date.isoformat()}"
    if case_id in existing:
        suffix = 2
        while f"{case_id}-{suffix}" in existing:
            suffix += 1
        case_id = f"{case_id}-{suffix}"

    tags = args.tag or ["ordinary"]
    unknown = set(tags) - REQUIRED_TAGS - {"ordinary", "diaspora"}
    if unknown:
        print(
            f"note: {sorted(unknown)} are not in the required-scenario set; "
            "they will not contribute to the coverage matrix",
            file=sys.stderr,
        )

    lines = [
        f"  - id: {case_id}",
        f'    date: "{date.isoformat()}"',
        f"    place: {args.place}",
        f"    tags: [{', '.join(tags)}]",
    ]
    if args.birth_time:
        lines.append(f'    birth_time: "{args.birth_time}"')
    if args.notes:
        lines.append(f"    notes: >\n      {args.notes}")
    lines.append(f'    source: "{args.source}"' + ("" if args.source else "   # TODO"))
    lines.append("    expected: {}   # transcribe from the almanac; see docs/GOLDEN_FILES.md")

    print(f"# Append to {CASES_PATH.relative_to(CASES_PATH.parents[2])}:")
    print("\n".join(lines))
    print(
        f"\n# Fields you may pin ({len(ALL_FIELDS)}):\n#   "
        + "\n#   ".join(", ".join(ALL_FIELDS[i : i + 6]) for i in range(0, len(ALL_FIELDS), 6))
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

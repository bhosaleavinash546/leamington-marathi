"""``/golden-verify`` — run the panchang goldens and print a per-field delta table.

    python -m tools.golden_verify              # every case
    python -m tools.golden_verify --tag adhika_month
    python -m tools.golden_verify --case adhika-shravana-2023 --show-computed

CLAUDE.md 11, Phase 1: "Stop and report any golden-file mismatch with the numeric
delta before proceeding - do not tune constants to force a pass without
explaining the physical reason." This tool exists to make that report cheap.
CLAUDE.md 9.1 asks for the delta table "in minutes", which is what it prints.

``--show-computed`` prints what the engine produced for a case, formatted ready to
paste into ``cases.yaml``. **That is a transcription aid, not a source of truth**:
the values it prints are the engine's own, and pasting them in would make the
golden file assert that the engine agrees with itself. Use it to see the field
shape, then overwrite every value from the almanac page.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from core.ephemeris.adapter import CircumpolarError
from core.ephemeris.registry import build_ephemeris
from tests.golden.loader import ALL_FIELDS, TIME_FIELDS, GoldenCase, compare, load_cases
from tests.golden.test_golden_panchang import _compute


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="golden_verify", description=__doc__)
    parser.add_argument("--case", action="append", help="case id; repeatable")
    parser.add_argument("--tag", action="append", help="scenario tag; repeatable")
    parser.add_argument(
        "--show-computed",
        action="store_true",
        help="print engine output in cases.yaml shape (a transcription aid only)",
    )
    parser.add_argument(
        "--pending-only", action="store_true", help="list untranscribed cases and stop"
    )
    return parser


def select(cases: tuple[GoldenCase, ...], args: argparse.Namespace) -> list[GoldenCase]:
    chosen = list(cases)
    if args.case:
        wanted = set(args.case)
        chosen = [c for c in chosen if c.case_id in wanted]
    if args.tag:
        tags = set(args.tag)
        chosen = [c for c in chosen if tags & set(c.tags)]
    return chosen


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cases = load_cases()
    chosen = select(cases, args)
    if not chosen:
        print("no cases matched", file=sys.stderr)
        return 2

    pending = [c for c in chosen if c.is_pending]
    pinned = [c for c in chosen if not c.is_pending]

    print("authority: दाते पंचांग (Date Panchang)")
    print(f"cases selected: {len(chosen)}   transcribed: {len(pinned)}   pending: {len(pending)}")

    if args.pending_only or not pinned:
        if pending:
            print(f"\n{len(pending)} case(s) awaiting transcription:")
            for case in pending:
                tags = ",".join(case.tags) or "-"
                print(f"  {case.case_id:34s} {case.date}  {case.place.name:12s} [{tags}]")
            print(
                "\nNothing can pass until an almanac page is transcribed. "
                "See docs/GOLDEN_FILES.md for the procedure."
            )
        if args.show_computed:
            _show_computed(chosen)
        return 0 if args.pending_only else 1

    ephemeris = build_ephemeris()
    failures = 0
    print(f"\n{'case':34s} {'field':18s} {'authority':>10s} {'engine':>10s} {'delta':>8s}")
    print("-" * 86)
    for case in pinned:
        try:
            actual = _compute(case, ephemeris)
        except CircumpolarError as exc:
            print(f"{case.case_id:34s} {'<no sunrise>':18s} {exc}")
            continue
        for delta in compare(case, actual):
            mark = "" if delta.matches else "  <-- MISMATCH"
            shown = (
                f"{delta.delta_minutes:+.0f}m"
                if delta.delta_minutes is not None
                else ("ok" if delta.matches else "differs")
            )
            print(
                f"{case.case_id:34s} {delta.field:18s} "
                f"{delta.expected!s:>10s} {delta.actual!s:>10s} {shown:>8s}{mark}"
            )
            if not delta.matches:
                failures += 1

    print("-" * 86)
    if failures:
        print(
            f"{failures} field mismatch(es). Per CLAUDE.md 11: report the delta and the "
            "physical reason. Do NOT move a constant to close the gap - record a "
            "school divergence in docs/DIVERGENCES.md if that is what it is."
        )
    else:
        print("every transcribed field matches the authority to the minute")

    if args.show_computed:
        _show_computed(chosen)
    return 1 if failures else 0


def _show_computed(cases: list[GoldenCase]) -> None:
    """Print engine output in cases.yaml shape, loudly labelled as not-authority."""
    ephemeris = build_ephemeris()
    print("\n" + "=" * 78)
    print("ENGINE OUTPUT - NOT AUTHORITY VALUES")
    print("Shown so you can see the field shape. Overwrite every value from the")
    print("almanac before committing, or the golden file will merely assert that the")
    print("engine agrees with itself (CLAUDE.md N2).")
    print("=" * 78)
    for case in cases:
        try:
            actual: dict[str, Any] = _compute(case, ephemeris)
        except CircumpolarError:
            print(f"\n  # {case.case_id}: no sunrise at this latitude and date")
            continue
        print(f"\n  - id: {case.case_id}")
        print(f'    date: "{case.date.isoformat()}"')
        print("    expected:   # ENGINE OUTPUT - replace from the almanac")
        for field in ALL_FIELDS:
            value = actual.get(field)
            if value is None:
                continue
            rendered = f'"{value}"' if field in TIME_FIELDS else value
            print(f"      {field}: {rendered}")


if __name__ == "__main__":
    raise SystemExit(main())

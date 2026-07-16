#!/usr/bin/env python3
"""CostPulse — deterministic cost analysis with an auditable pipeline.

    python costpulse.py analyse <file.xlsx> [--compare <file2>]
                                            [--currency-rates rates.yaml]
                                            [--base-currency GBP]
                                            [--output-dir output]

Pipeline: ingest -> normalise -> profile (trust gate) -> deterministic
analyses -> insights.json -> narrative (words only) -> dashboard.

Every run writes /output/<run-id>/ with insights.json, summary.md,
dashboard.html, audit_log.txt (plus dataset.parquet).
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dashboard.builder import build_dashboard
from engine.analyses import run_all
from engine.insights import build_insights, write_insights
from ingestion.loader import load_file, load_report
from ingestion.normaliser import normalise
from narrative.generator import generate_narrative
from profiling.profiler import TRUST_THRESHOLD, profile

SCHEMA_MAP = Path(__file__).resolve().parent / "config" / "schema_map.yaml"


class AuditLog:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def add(self, message: str) -> None:
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.lines.append(f"[{stamp}] {message}")

    def section(self, title: str) -> None:
        self.lines.append("")
        self.lines.append(f"== {title} " + "=" * max(0, 60 - len(title)))

    def write(self, path: Path) -> None:
        path.write_text("\n".join(self.lines) + "\n", encoding="utf-8")


def _ingest(path: Path, rates: dict[str, float] | None, base_currency: str, audit: AuditLog) -> tuple[pd.DataFrame, dict]:
    audit.section(f"INGESTION — {path.name}")
    sheets = load_file(path, SCHEMA_MAP)
    for entry in load_report(sheets):
        audit.add(f"Sheet '{entry['sheet']}': header on row {entry['header_row_1based']}, "
                  f"{entry['rows']} raw rows.")
        for note in entry["notes"]:
            audit.add(f"  {note}")

    frames, reports = [], []
    for sheet in sheets:
        df, totals, report = normalise(
            sheet.df, SCHEMA_MAP, currency_rates=rates, base_currency=base_currency,
            source=f"{path.name}:{sheet.sheet_name}",
        )
        if not report.mapped_columns:
            audit.add(f"Sheet '{sheet.sheet_name}': no columns mapped to the canonical schema — skipped.")
            continue
        frames.append(df)
        reports.append(report)
        audit.add(f"Sheet '{sheet.sheet_name}': {len(report.mapped_columns)} columns mapped, "
                  f"{len(report.unmapped_columns)} unmapped {report.unmapped_columns or ''}.")
        for conv in report.unit_conversions:
            audit.add(f"  Unit conversion: {conv}")
        for note in report.currency_notes:
            audit.add(f"  Currency: {note}")
        if report.subtotal_rows_removed:
            audit.add(f"  Stripped {report.subtotal_rows_removed} subtotal/total row(s) from the body "
                      f"(kept for reconciliation).")
        for recon in report.reconciliation:
            audit.add(f"  Reconciliation '{recon['column']}': stated {recon['stated_total']:,.2f} vs "
                      f"computed {recon['computed_sum']:,.2f} -> "
                      f"{'OK' if recon['within_tolerance'] else 'MISMATCH'} ({recon['mismatch_pct']}%).")
        for warning in report.hard_warnings:
            audit.add(f"  HARD WARNING: {warning}")

    if not frames:
        raise SystemExit(f"ERROR: no sheet in {path} had columns mappable to the canonical schema. "
                         f"Extend config/schema_map.yaml with your headers.")

    combined = pd.concat(frames, ignore_index=True)
    merged_report = {
        "sheets": [r.to_dict() for r in reports],
        "mixed_currency_refused": any(r.mixed_currency for r in reports),
        "currency": next((r.currency for r in reports if r.currency), None),
    }
    return combined, merged_report


def analyse(args: argparse.Namespace) -> int:
    audit = AuditLog()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    out_dir = Path(args.output_dir) / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    audit.add(f"CostPulse run {run_id}")
    audit.add(f"Input: {args.file}" + (f" | compare: {args.compare}" if args.compare else ""))

    rates = None
    if args.currency_rates:
        with open(args.currency_rates, encoding="utf-8") as fh:
            rates = {k.upper(): float(v) for k, v in yaml.safe_load(fh).items()}
        audit.add(f"Currency rate table loaded: {rates} (units of {args.base_currency} per 1 unit).")

    df, norm_report = _ingest(Path(args.file), rates, args.base_currency, audit)
    if norm_report["mixed_currency_refused"]:
        audit.add("Money columns are in mixed currencies with no rate table: "
                  "cross-currency analyses will be refused.")

    df_compare = None
    if args.compare:
        df_compare, _ = _ingest(Path(args.compare), rates, args.base_currency, audit)

    # ---- profiling / trust gate ----
    audit.section("DATA QUALITY")
    quality = profile(df)
    audit.add(f"Trust score: {quality['trust_score']}/100 (threshold {TRUST_THRESHOLD}).")
    for check in quality["checks"]:
        if check["status"] == "fail":
            audit.add(f"CHECK FAILED — {check['name']}: {check['failing_row_count']} row(s). "
                      f"{check['description']}")
            for row in check["failing_rows"]:
                audit.add(f"    {row}")
        elif check["status"] == "skipped":
            audit.add(f"Check skipped — {check['name']}: {check['skipped_reason']}")
        else:
            audit.add(f"Check passed — {check['name']}.")

    if quality["pipeline_blocked"]:
        audit.add(f"PIPELINE STOPPED: trust score {quality['trust_score']} < {TRUST_THRESHOLD}. "
                  f"Analysing garbage produces confident garbage — fix the rows above and re-run.")
        audit.write(out_dir / "audit_log.txt")
        print(f"STOPPED: data trust score {quality['trust_score']}/100 is below {TRUST_THRESHOLD}.")
        print(f"See {out_dir / 'audit_log.txt'} for the specific failing rows.")
        return 2

    # ---- deterministic analyses ----
    audit.section("ANALYSES")
    if norm_report["mixed_currency_refused"]:
        audit.add("All spend analyses refused: mixed currency without a rate table.")
        analyses = []
    else:
        analyses = run_all(df, df_compare)
    for a in analyses:
        if a["status"] == "ok":
            audit.add(f"Ran {a['analysis']}.")
        else:
            audit.add(f"Skipped {a['analysis']} ({a['status']}): {a['reason']}")

    # ---- insights.json + dataset.parquet ----
    insights = build_insights(
        analyses=analyses,
        data_quality=quality,
        normalisation=norm_report,
        dataset_name=Path(args.file).name,
        currency=norm_report["currency"],
        run_id=run_id,
    )
    write_insights(insights, out_dir / "insights.json")
    audit.add(f"insights.json written: {len(insights['findings'])} findings, "
              f"{sum(1 for a in analyses if a['status'] == 'ok')} analyses ok, "
              f"{sum(1 for a in analyses if a['status'] != 'ok')} skipped/refused.")
    try:
        df.to_parquet(out_dir / "dataset.parquet", index=False)
        audit.add("dataset.parquet written.")
    except (ImportError, ValueError) as exc:
        df.to_csv(out_dir / "dataset.csv", index=False)
        audit.add(f"Parquet unavailable ({exc}); wrote dataset.csv instead.")

    # ---- narrative ----
    audit.section("NARRATIVE")
    narrative, validator_log = generate_narrative(insights)
    for line in validator_log:
        audit.add(line)
    (out_dir / "summary.md").write_text(narrative, encoding="utf-8")

    # ---- dashboard ----
    audit.section("DASHBOARD")
    build_dashboard(insights, df, out_dir / "dashboard.html")
    audit.add("dashboard.html written (self-contained, offline-capable).")

    audit.section("DONE")
    audit.add(f"Outputs in {out_dir}/: insights.json, summary.md, dashboard.html, audit_log.txt")
    audit.write(out_dir / "audit_log.txt")

    print(f"CostPulse run {run_id} complete.")
    print(f"  Trust score : {quality['trust_score']}/100")
    gap = insights["kpis"].get("total_addressable_gap_per_year")
    if gap is not None:
        print(f"  Addressable : {gap:,.2f}/yr")
    print(f"  Outputs     : {out_dir}/")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="costpulse", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("analyse", help="Run the full pipeline on a file.", aliases=["analyze"])
    p.add_argument("file", help="Input .xlsx/.csv/.tsv")
    p.add_argument("--compare", help="Second file/period for the cost walk.")
    p.add_argument("--currency-rates", help="YAML of {CODE: rate} in base-currency units per 1 unit.")
    p.add_argument("--base-currency", default="GBP")
    p.add_argument("--output-dir", default=str(Path(__file__).resolve().parent / "output"))
    p.set_defaults(func=analyse)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

"""Gate 1 + Gate 2 tests: loader, normaliser (mapping, currency,
reconciliation) and profiler (planted defects). Expected values hand
calculated in comments."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from ingestion.loader import load_file
from ingestion.normaliser import SchemaMapper, normalise
from profiling.profiler import profile
from tests.make_synthetic import build

SCHEMA = Path(__file__).resolve().parent.parent / "config" / "schema_map.yaml"


@pytest.fixture(scope="module")
def synthetic_sheets(tmp_path_factory):
    path = tmp_path_factory.mktemp("data") / "synthetic_messy.xlsx"
    build(path)
    return load_file(path, SCHEMA)


def test_loader_finds_header_on_row_3_and_drops_unit_row(synthetic_sheets):
    sheet = synthetic_sheets[0]
    assert sheet.header_row == 2  # 0-based -> row 3 in Excel terms
    assert sheet.dropped_unit_row is True
    assert "P/N" in sheet.df.columns
    # 13 part rows + 1 subtotal + 1 total remain after the unit row is gone.
    assert len(sheet.df) == 15


def test_header_mapping_exact_and_fuzzy():
    mapper = SchemaMapper(SCHEMA)
    assert mapper.map_header("P/N") == "part_number"
    assert mapper.map_header("EAU") == "annual_volume"
    assert mapper.map_header("Qty/yr (EAU)") == "annual_volume"
    assert mapper.map_header("Weight (g)") == "mass_kg"
    assert mapper.map_header("Anual Volume") == "annual_volume"  # fuzzy (typo)
    assert mapper.map_header("Random Nonsense Column") is None


def test_normaliser_full_report(synthetic_sheets):
    df, totals, report = normalise(synthetic_sheets[0].df, SCHEMA, currency_rates={"EUR": 0.85})
    # All 18 messy headers map; nothing left over.
    assert len(report.mapped_columns) == 18
    assert report.unmapped_columns == []
    # SUBTOTAL + TOTAL rows stripped: 15 - 2 = 13 line items.
    assert report.subtotal_rows_removed == 2
    assert len(df) == 13
    assert len(totals) == 2
    # Weight (g): P-1001 is 14200 g -> 14.2 kg.
    assert df.loc[df["part_number"] == "P-1001", "mass_kg"].iloc[0] == 14.2
    # Logistics EUR -> GBP: P-1001 is EUR 0.45 x 0.85 = 0.3825.
    assert df.loc[df["part_number"] == "P-1001", "logistics"].iloc[0] == pytest.approx(0.3825)
    # Reconciliation passes: the generator writes an arithmetically exact total row.
    recon = {r["column"]: r for r in report.reconciliation}
    assert recon["unit_cost"]["within_tolerance"] is True
    assert recon["quoted_price"]["within_tolerance"] is True
    assert report.hard_warnings == []


def test_mixed_currency_refused_without_rates(synthetic_sheets):
    _, _, report = normalise(synthetic_sheets[0].df, SCHEMA)  # no rates
    assert report.mixed_currency is True
    assert any("REFUSED" in w for w in report.hard_warnings)


def test_reconciliation_failure_flagged():
    # Hand calc: line items 10 + 20 + 30 = 60 vs stated total 61
    #   mismatch = |60 - 61| / 61 = 1.639% > 0.5% -> hard warning
    df = pd.DataFrame({
        "P/N": ["A", "B", "C", ""],
        "Description": ["a", "b", "c", "TOTAL"],
        "Unit Cost": [10.0, 20.0, 30.0, 61.0],
    })
    _, _, report = normalise(df, SCHEMA)
    recon = report.reconciliation[0]
    assert recon["within_tolerance"] is False
    assert recon["mismatch_pct"] == pytest.approx(1.6393, abs=0.001)
    assert any("RECONCILIATION FAILURE" in w for w in report.hard_warnings)


def test_profiler_catches_all_three_planted_defects(synthetic_sheets):
    df, _, _ = normalise(synthetic_sheets[0].df, SCHEMA, currency_rates={"EUR": 0.85})
    quality = profile(df)
    by_name = {c["name"]: c for c in quality["checks"]}

    # Defect 1: P-1010 has unit_cost = -3.90.
    negatives = by_name["negative_costs"]
    assert negatives["status"] == "fail"
    assert any(r.get("part_number") == "P-1010" for r in negatives["failing_rows"])

    # Defect 2: P-1007 breakdown 20+10+5+3+2 = 40 vs unit_cost 52
    #   deviation = |40-52|/52 = 23.08% > 2%.
    breakdown = by_name["breakdown_integrity"]
    assert breakdown["status"] == "fail"
    p1007 = [r for r in breakdown["failing_rows"] if r.get("part_number") == "P-1007"][0]
    assert p1007["component_sum"] == 40.0
    assert p1007["deviation_pct"] == 23.08

    # Defect 3: P-1003 appears at 9.20 and 8.40 -> conflicting duplicates.
    dupes = by_name["duplicate_conflicting_parts"]
    assert dupes["status"] == "fail"
    assert dupes["failing_rows"][0]["part_number"] == "P-1003"
    assert sorted(dupes["failing_rows"][0]["unit_costs"]) == [8.4, 9.2]

    assert 0 <= quality["trust_score"] <= 100


def test_clean_data_scores_100():
    df = pd.DataFrame({
        "part_number": ["A", "B", "C", "D", "E"],
        "commodity": ["casting"] * 5,
        "unit_cost": [10.0, 11.0, 12.0, 13.0, 14.0],
        "mass_kg": [1.0, 1.1, 1.2, 1.3, 1.4],
        "material_cost": [5.0, 5.5, 6.0, 6.5, 7.0],
        "process_cost": [3.0, 3.3, 3.6, 3.9, 4.2],
        "labour_cost": [1.0, 1.1, 1.2, 1.3, 1.4],
        "overhead": [0.6, 0.66, 0.72, 0.78, 0.84],
        "sga_profit": [0.4, 0.44, 0.48, 0.52, 0.56],
    })
    quality = profile(df)
    assert quality["trust_score"] == 100
    assert quality["pipeline_blocked"] is False


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

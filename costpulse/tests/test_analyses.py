"""Gate 3 unit tests. Every expected value is calculated BY HAND in the
comments — never with pandas — so the engine is checked against independent
arithmetic."""

from __future__ import annotations

import pandas as pd
import pytest

from engine.analyses import (
    cost_breakdown_structure,
    cost_per_kg,
    cost_vs_mass_regression,
    cost_walk,
    pareto,
    should_cost_gap,
    supplier_comparison,
    unit_cost_outliers_mad,
)


def test_pareto_by_supplier_hand_calc():
    # Hand calc:
    #   P1: 10 x 1000 = 10,000  (S1)
    #   P2:  2 x 2000 =  4,000  (S2)
    #   P3:  1 x 1000 =  1,000  (S3)
    #   total = 15,000
    #   shares: 10000/15000 = 66.67%, 4000/15000 = 26.67%, 1000/15000 = 6.67%
    #   cumulative: 66.67, 93.33(=66.67+26.67), 100.00
    #   items needed for 80%: cum<80 is only the first item -> 1 + 1 = 2
    df = pd.DataFrame({
        "part_number": ["P1", "P2", "P3"],
        "supplier": ["S1", "S2", "S3"],
        "unit_cost": [10.0, 2.0, 1.0],
        "annual_volume": [1000, 2000, 1000],
    })
    out = pareto(df, "supplier")
    assert out["status"] == "ok"
    r = out["result"]
    assert r["total_annual_spend"] == 15000.00
    assert r["items"][0] == {"label": "S1", "annual_spend": 10000.00, "share_pct": 66.67, "cumulative_pct": 66.67}
    assert r["items"][1]["annual_spend"] == 4000.00
    assert r["items"][1]["cumulative_pct"] == 93.33
    assert r["items"][2]["cumulative_pct"] == 100.00
    assert r["n_items_for_80pct"] == 2


def test_pareto_insufficient_without_volume():
    df = pd.DataFrame({"part_number": ["P1"], "unit_cost": [10.0]})
    out = pareto(df, "part")
    assert out["status"] == "insufficient_data"
    assert "annual_volume" in out["reason"]


def test_cost_breakdown_structure_hand_calc():
    # Hand calc (spend-weighted):
    #   denominator = 10x100 + 20x50 = 1000 + 1000 = 2000
    #   material:  5x100 + 8x50 = 500+400 = 900  -> 900/2000  = 45.00%
    #   process:   2x100 + 6x50 = 200+300 = 500  -> 500/2000  = 25.00%
    #   labour:    1x100 + 2x50 = 100+100 = 200  -> 200/2000  = 10.00%
    #   overhead:  1x100 + 2x50 = 200             -> 10.00%
    #   sga:       1x100 + 2x50 = 200             -> 10.00%
    df = pd.DataFrame({
        "unit_cost": [10.0, 20.0],
        "material_cost": [5.0, 8.0],
        "process_cost": [2.0, 6.0],
        "labour_cost": [1.0, 2.0],
        "overhead": [1.0, 2.0],
        "sga_profit": [1.0, 2.0],
        "annual_volume": [100, 50],
        "commodity": ["casting", "casting"],
    })
    out = cost_breakdown_structure(df)
    assert out["status"] == "ok"
    overall = out["result"]["overall_pct"]
    assert overall["material_cost"] == 45.00
    assert overall["process_cost"] == 25.00
    assert overall["labour_cost"] == 10.00
    assert overall["overhead"] == 10.00
    assert overall["sga_profit"] == 10.00
    assert out["result"]["per_commodity_pct"]["casting"]["material_cost"] == 45.00


def test_should_cost_gap_hand_calc():
    # Hand calc:
    #   P1: 10 - 8 = 2 gap, 2/10 = 20%,  2 x 100  = 200/yr
    #   P2:  5 - 6 = -1 (negative gap, excluded from addressable)
    #   P3:  4 - 3 = 1 gap, 1/4 = 25%,   1 x 500  = 500/yr
    #   total addressable = 200 + 500 = 700; positive-gap parts = 2
    #   ranked by annual gap: P3 (500) first, then P1 (200)
    df = pd.DataFrame({
        "part_number": ["P1", "P2", "P3"],
        "quoted_price": [10.0, 5.0, 4.0],
        "should_cost": [8.0, 6.0, 3.0],
        "annual_volume": [100, 1000, 500],
    })
    out = should_cost_gap(df)
    assert out["status"] == "ok"
    r = out["result"]
    assert r["total_addressable_gap_per_year"] == 700.00
    assert r["parts_with_positive_gap"] == 2
    assert r["items"][0]["part_number"] == "P3"
    assert r["items"][0]["gap"] == 1.0
    assert r["items"][0]["gap_pct"] == 25.00
    assert r["items"][0]["annual_gap"] == 500.00
    assert r["items"][1]["part_number"] == "P1"
    assert r["items"][1]["annual_gap"] == 200.00


def test_cost_per_kg_flags_vave_candidate_hand_calc():
    # Hand calc: all parts 1 kg, so cost/kg = unit_cost = [10, 12, 14, 40]
    #   median of [10,12,14,40] = (12+14)/2 = 13
    #   flag threshold = 1.5 x 13 = 19.5 -> only the 40 part flagged
    #   ratio = 40/13 = 3.0769... -> rounds to 3.08
    df = pd.DataFrame({
        "part_number": ["A", "B", "C", "D"],
        "commodity": ["casting"] * 4,
        "unit_cost": [10.0, 12.0, 14.0, 40.0],
        "mass_kg": [1.0, 1.0, 1.0, 1.0],
    })
    out = cost_per_kg(df)
    assert out["status"] == "ok"
    r = out["result"]
    assert r["commodity_median_cost_per_kg"]["casting"] == 13.00
    assert len(r["vave_candidates"]) == 1
    cand = r["vave_candidates"][0]
    assert cand["part_number"] == "D"
    assert cand["ratio"] == 3.08


def test_mad_outlier_hand_calc():
    # Hand calc for [10, 11, 10, 12, 11, 50]:
    #   sorted = [10,10,11,11,12,50], median = (11+11)/2 = 11
    #   abs deviations = [1,0,1,1,0,39], sorted = [0,0,1,1,1,39], MAD = (1+1)/2 = 1
    #   z(50) = 0.6745 x (50-11)/1 = 0.6745 x 39 = 26.3055 -> rounds to 26.31 (> 3.5)
    #   z(12) = 0.6745 x 1 = 0.6745 (not an outlier)
    df = pd.DataFrame({
        "part_number": ["A", "B", "C", "D", "E", "F"],
        "commodity": ["machining"] * 6,
        "unit_cost": [10.0, 11.0, 10.0, 12.0, 11.0, 50.0],
    })
    out = unit_cost_outliers_mad(df)
    assert out["status"] == "ok"
    outliers = out["result"]["outliers"]
    assert len(outliers) == 1
    assert outliers[0]["part_number"] == "F"
    assert outliers[0]["commodity_median"] == 11.0
    assert outliers[0]["modified_z"] == 26.31


def test_regression_perfect_line_hand_calc():
    # Hand calc: y = 5x + 2 exactly for x = 1..8
    #   slope = 5, intercept = 2, R2 = 1, residual SD = 0
    #   no residual can exceed 1 SD when SD = 0 -> no flagged parts
    x = list(range(1, 9))
    df = pd.DataFrame({
        "part_number": [f"P{i}" for i in x],
        "commodity": ["casting"] * 8,
        "mass_kg": [float(v) for v in x],
        "unit_cost": [5.0 * v + 2.0 for v in x],
    })
    out = cost_vs_mass_regression(df)
    assert out["status"] == "ok"
    fit = out["result"]["fits"][0]
    assert fit["slope_per_kg"] == 5.0
    assert fit["intercept"] == 2.0
    assert fit["r_squared"] == 1.0
    assert fit["parts_above_1sd"] == []


def test_regression_refuses_small_n_and_zero_r2():
    # Hand calc for the zero-correlation group (n = 8):
    #   x = [1,2,3,4,1,2,3,4], y = [1,2,3,4,4,3,2,1]; means 2.5 / 2.5
    #   sum((x-mx)(y-my)) = (2.25+0.25+0.25+2.25) + (-2.25-0.25-0.25-2.25) = 5 - 5 = 0
    #   -> r = 0 exactly, R2 = 0 < 0.5 -> refused
    # The 'machining' group has n = 7 < 8 -> refused on sample size.
    df = pd.DataFrame({
        "part_number": [f"Z{i}" for i in range(8)] + [f"M{i}" for i in range(7)],
        "commodity": ["casting"] * 8 + ["machining"] * 7,
        "mass_kg": [1, 2, 3, 4, 1, 2, 3, 4] + [1, 2, 3, 4, 5, 6, 7],
        "unit_cost": [1, 2, 3, 4, 4, 3, 2, 1] + [3, 6, 9, 12, 15, 18, 21],
    })
    out = cost_vs_mass_regression(df)
    assert out["status"] == "refused"
    assert "R2 = 0.000" in out["reason"]
    assert "n = 7 < 8" in out["reason"]


def test_supplier_comparison_hand_calc():
    # Hand calc: P1 quoted at 10 (S1) and 12 (S2)
    #   spread = (12 - 10) / 10 = 20.00%
    df = pd.DataFrame({
        "part_number": ["P1", "P1", "P2"],
        "supplier": ["S1", "S2", "S1"],
        "quoted_price": [10.0, 12.0, 7.0],
    })
    out = supplier_comparison(df)
    assert out["status"] == "ok"
    comps = out["result"]["comparisons"]
    assert len(comps) == 1
    assert comps[0]["part"] == "P1"
    assert comps[0]["min_price"] == 10.0
    assert comps[0]["max_price"] == 12.0
    assert comps[0]["spread_pct"] == 20.00


def test_cost_walk_hand_calc():
    # Hand calc (new-file volumes):
    #   P1: 12 - 10 = +2/pc x 100  = +200/yr
    #   P2:  4 -  5 = -1/pc x 1000 = -1000/yr
    #   total annual delta = 200 - 1000 = -800
    old = pd.DataFrame({"part_number": ["P1", "P2"], "quoted_price": [10.0, 5.0]})
    new = pd.DataFrame({"part_number": ["P1", "P2"], "quoted_price": [12.0, 4.0],
                        "annual_volume": [100, 1000]})
    out = cost_walk(old, new)
    assert out["status"] == "ok"
    r = out["result"]
    assert r["matched_parts"] == 2
    assert r["total_annual_delta"] == -800.00
    assert r["by_part"][0] == {"part_number": "P1", "old": 10.0, "new": 12.0, "delta": 2.0, "annual_delta": 200.00}
    assert r["by_part"][1]["annual_delta"] == -1000.00


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

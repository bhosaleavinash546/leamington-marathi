"""Deterministic analysis engine. All numbers shown anywhere downstream are
computed here by pandas/numpy/scipy — never by an LLM.

Every analysis returns a dict:
    {
      "analysis": <name>,
      "status": "ok" | "insufficient_data" | "refused",
      "result": ...,            # only when status == "ok"
      "method": <plain-English description of the computation>,
      "provenance": {"source": ..., "columns": [...], "computation": ...},
      "caveats": [...],
      "reason": ...,            # when not ok: exactly what was missing / why refused
    }

When the data cannot support a computation the engine says so explicitly —
it never estimates.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

MIN_REGRESSION_N = 8
MIN_REGRESSION_R2 = 0.5
MAD_Z_THRESHOLD = 3.5
COST_PER_KG_FLAG_MULTIPLIER = 1.5
BREAKDOWN_FIELDS = ["material_cost", "process_cost", "labour_cost", "overhead", "sga_profit", "logistics"]


def _provenance(df: pd.DataFrame, columns: list[str], computation: str) -> dict[str, Any]:
    sources = sorted(df["_source"].dropna().unique()) if "_source" in df.columns else []
    return {"source": sources, "columns": columns, "computation": computation}


def _insufficient(name: str, method: str, reason: str) -> dict[str, Any]:
    return {"analysis": name, "status": "insufficient_data", "method": method,
            "reason": reason, "result": None, "provenance": None, "caveats": []}


def _refused(name: str, method: str, reason: str) -> dict[str, Any]:
    return {"analysis": name, "status": "refused", "method": method,
            "reason": reason, "result": None, "provenance": None, "caveats": []}


def _require(df: pd.DataFrame, cols: list[str], name: str, method: str) -> dict[str, Any] | None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        return _insufficient(name, method, f"No {'/'.join(missing)} column mapped -> {name} skipped. "
                                           f"Map it in schema_map.yaml.")
    return None


def _spend(df: pd.DataFrame) -> pd.Series:
    return df["unit_cost"] * df["annual_volume"]


# ---------------------------------------------------------------- spend & structure

def pareto(df: pd.DataFrame, by: str) -> dict[str, Any]:
    """80/20 Pareto of annual spend (unit_cost x annual_volume) by a dimension."""
    name = f"pareto_by_{by}"
    method = f"Annual spend = unit_cost x annual_volume, grouped by {by}, sorted descending; cumulative share."
    label_col = "part_number" if by == "part" else by
    gate = _require(df, ["unit_cost", "annual_volume", label_col], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "annual_volume", label_col]).copy()
    work = work[work["unit_cost"] > 0]
    if work.empty:
        return _insufficient(name, method, "No rows with positive unit_cost and annual_volume.")
    work["annual_spend"] = _spend(work)
    grouped = work.groupby(label_col)["annual_spend"].sum().sort_values(ascending=False)
    total = float(grouped.sum())
    cumulative = grouped.cumsum() / total
    n_for_80 = int((cumulative < 0.8).sum() + 1)
    items = [
        {"label": str(k), "annual_spend": round(float(v), 2),
         "share_pct": round(float(v / total * 100), 2),
         "cumulative_pct": round(float(c * 100), 2)}
        for (k, v), c in zip(grouped.items(), cumulative)
    ]
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {
            "total_annual_spend": round(total, 2),
            "items": items,
            "n_items_for_80pct": n_for_80,
            "n_items_total": len(items),
        },
        "provenance": _provenance(work, ["unit_cost", "annual_volume", label_col],
                                  f"groupby({label_col}).sum(unit_cost*annual_volume)"),
        "caveats": (["Rows with non-positive unit_cost excluded."]
                    if (df["unit_cost"] <= 0).any() else []),
    }


def cost_breakdown_structure(df: pd.DataFrame) -> dict[str, Any]:
    """Average % split of cost elements, overall and per commodity."""
    name = "cost_breakdown_structure"
    method = ("Spend-weighted share of each cost element: sum(element x volume) / sum(unit_cost x volume), "
              "overall and per commodity; rows with a complete breakdown only.")
    present = [c for c in BREAKDOWN_FIELDS if c in df.columns]
    gate = _require(df, ["unit_cost"], name, method)
    if gate:
        return gate
    if len(present) < 3:
        return _insufficient(name, method,
                             f"Only {present or 'no'} breakdown columns mapped; need at least 3 of {BREAKDOWN_FIELDS}.")
    work = df.dropna(subset=present + ["unit_cost"]).copy()
    work = work[work["unit_cost"] > 0]
    if work.empty:
        return _insufficient(name, method, "No rows with a complete positive cost breakdown.")

    weights = work["annual_volume"] if "annual_volume" in work.columns else pd.Series(1.0, index=work.index)
    weights = weights.fillna(0)
    if float(weights.sum()) == 0:
        weights = pd.Series(1.0, index=work.index)

    def split(frame: pd.DataFrame, w: pd.Series) -> dict[str, float]:
        denom = float((frame["unit_cost"] * w).sum())
        return {c: round(float((frame[c] * w).sum()) / denom * 100, 2) for c in present}

    overall = split(work, weights)
    per_commodity = {}
    if "commodity" in work.columns:
        for commodity, group in work.groupby("commodity"):
            per_commodity[str(commodity)] = split(group, weights.loc[group.index])
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"elements": present, "overall_pct": overall, "per_commodity_pct": per_commodity,
                   "rows_used": int(len(work))},
        "provenance": _provenance(work, present + ["unit_cost", "annual_volume"],
                                  "sum(element*volume)/sum(unit_cost*volume) per group"),
        "caveats": [f"{len(df) - len(work)} rows lacked a complete breakdown and were excluded."]
        if len(work) < len(df) else [],
    }


def treemap_data(df: pd.DataFrame) -> dict[str, Any]:
    """commodity -> supplier -> part annual-spend hierarchy for the treemap."""
    name = "treemap_spend_hierarchy"
    method = "Annual spend summed along commodity -> supplier -> part_number hierarchy."
    gate = _require(df, ["unit_cost", "annual_volume", "commodity", "supplier", "part_number"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "annual_volume", "commodity", "supplier", "part_number"]).copy()
    work = work[work["unit_cost"] > 0]
    if work.empty:
        return _insufficient(name, method, "No rows with commodity, supplier, part and positive spend.")
    work["annual_spend"] = _spend(work)
    nodes = []
    for (commodity, supplier, pn), spend in work.groupby(["commodity", "supplier", "part_number"])["annual_spend"].sum().items():
        nodes.append({"commodity": str(commodity), "supplier": str(supplier),
                      "part_number": str(pn), "annual_spend": round(float(spend), 2)})
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"nodes": nodes, "total_annual_spend": round(float(work["annual_spend"].sum()), 2)},
        "provenance": _provenance(work, ["commodity", "supplier", "part_number", "unit_cost", "annual_volume"],
                                  "groupby([commodity,supplier,part_number]).sum(spend)"),
        "caveats": [],
    }


# ---------------------------------------------------------------- cost-improvement targeting

def should_cost_gap(df: pd.DataFrame) -> dict[str, Any]:
    """(quoted_price - should_cost) per part, absolute, % and annualised."""
    name = "should_cost_gap"
    method = ("Gap = quoted_price - should_cost per part; gap % of quoted price; annual gap = gap x annual_volume; "
              "ranked by annual gap. Total addressable gap = sum of positive annual gaps.")
    gate = _require(df, ["quoted_price", "should_cost"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["quoted_price", "should_cost"]).copy()
    work = work[work["quoted_price"] > 0]
    if work.empty:
        return _insufficient(name, method, "No rows with both quoted_price and should_cost.")
    work["gap"] = work["quoted_price"] - work["should_cost"]
    work["gap_pct"] = work["gap"] / work["quoted_price"] * 100
    has_volume = "annual_volume" in work.columns and work["annual_volume"].notna().any()
    if has_volume:
        work["annual_gap"] = work["gap"] * work["annual_volume"].fillna(0)
        total_addressable = float(work.loc[work["annual_gap"] > 0, "annual_gap"].sum())
        work = work.sort_values("annual_gap", ascending=False)
    else:
        work["annual_gap"] = np.nan
        total_addressable = None
        work = work.sort_values("gap", ascending=False)
    items = []
    for idx, row in work.iterrows():
        items.append({
            "part_number": str(row.get("part_number", f"row {idx}")),
            "part_name": str(row.get("part_name", "")),
            "supplier": str(row.get("supplier", "")),
            "commodity": str(row.get("commodity", "")),
            "quoted_price": round(float(row["quoted_price"]), 4),
            "should_cost": round(float(row["should_cost"]), 4),
            "gap": round(float(row["gap"]), 4),
            "gap_pct": round(float(row["gap_pct"]), 2),
            "annual_gap": (round(float(row["annual_gap"]), 2) if has_volume and pd.notna(row["annual_gap"]) else None),
        })
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {
            "items": items,
            "total_addressable_gap_per_year": (round(total_addressable, 2) if total_addressable is not None else None),
            "parts_with_positive_gap": int((work["gap"] > 0).sum()),
        },
        "provenance": _provenance(work, ["quoted_price", "should_cost", "annual_volume"],
                                  "quoted_price - should_cost, x annual_volume"),
        "caveats": [] if has_volume else ["No annual_volume mapped: gaps are per piece, not annualised."],
    }


def target_cost_gap(df: pd.DataFrame) -> dict[str, Any]:
    """(quoted_price - target_cost) where target_cost exists."""
    name = "target_cost_gap"
    method = "Gap to target = quoted_price - target_cost per part, annualised where volume exists."
    gate = _require(df, ["quoted_price", "target_cost"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["quoted_price", "target_cost"]).copy()
    if work.empty:
        return _insufficient(name, method, "target_cost column mapped but empty.")
    work["gap"] = work["quoted_price"] - work["target_cost"]
    has_volume = "annual_volume" in work.columns and work["annual_volume"].notna().any()
    work["annual_gap"] = work["gap"] * work["annual_volume"].fillna(0) if has_volume else np.nan
    work = work.sort_values("annual_gap" if has_volume else "gap", ascending=False)
    items = [{
        "part_number": str(r.get("part_number", f"row {i}")),
        "quoted_price": round(float(r["quoted_price"]), 4),
        "target_cost": round(float(r["target_cost"]), 4),
        "gap": round(float(r["gap"]), 4),
        "annual_gap": (round(float(r["annual_gap"]), 2) if has_volume else None),
        "above_target": bool(r["gap"] > 0),
    } for i, r in work.iterrows()]
    total = float(work.loc[work["gap"] > 0, "annual_gap"].sum()) if has_volume else None
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"items": items, "parts_above_target": int((work["gap"] > 0).sum()),
                   "total_gap_above_target_per_year": (round(total, 2) if total is not None else None)},
        "provenance": _provenance(work, ["quoted_price", "target_cost", "annual_volume"],
                                  "quoted_price - target_cost, x annual_volume"),
        "caveats": [] if has_volume else ["No annual_volume mapped: gaps are per piece, not annualised."],
    }


def cost_per_kg(df: pd.DataFrame) -> dict[str, Any]:
    """Cost/kg by commodity and material grade; flag parts > 1.5x commodity median."""
    name = "cost_per_kg"
    method = (f"cost_per_kg = unit_cost / mass_kg; medians per commodity (and per material grade); "
              f"parts above {COST_PER_KG_FLAG_MULTIPLIER}x their commodity median are VAVE candidates.")
    gate = _require(df, ["unit_cost", "mass_kg", "commodity"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "mass_kg", "commodity"]).copy()
    work = work[(work["mass_kg"] > 0) & (work["unit_cost"] > 0)]
    if work.empty:
        return _insufficient(name, method, "No rows with positive unit_cost and mass_kg.")
    work["cost_per_kg"] = work["unit_cost"] / work["mass_kg"]
    medians = work.groupby("commodity")["cost_per_kg"].median()
    grade_medians = {}
    if "material_grade" in work.columns:
        grade_medians = {
            f"{c} | {g}": round(float(v), 2)
            for (c, g), v in work.groupby(["commodity", "material_grade"])["cost_per_kg"].median().items()
        }
    flagged = []
    for idx, row in work.iterrows():
        median = float(medians[row["commodity"]])
        if median > 0 and row["cost_per_kg"] > COST_PER_KG_FLAG_MULTIPLIER * median:
            flagged.append({
                "part_number": str(row.get("part_number", f"row {idx}")),
                "commodity": str(row["commodity"]),
                "cost_per_kg": round(float(row["cost_per_kg"]), 2),
                "commodity_median": round(median, 2),
                "ratio": round(float(row["cost_per_kg"] / median), 2),
            })
    points = [{
        "part_number": str(r.get("part_number", f"row {i}")),
        "commodity": str(r["commodity"]),
        "material_grade": (str(r["material_grade"]) if "material_grade" in work.columns and pd.notna(r.get("material_grade")) else None),
        "mass_kg": round(float(r["mass_kg"]), 4),
        "unit_cost": round(float(r["unit_cost"]), 4),
        "cost_per_kg": round(float(r["cost_per_kg"]), 2),
    } for i, r in work.iterrows()]
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {
            "commodity_median_cost_per_kg": {str(k): round(float(v), 2) for k, v in medians.items()},
            "grade_median_cost_per_kg": grade_medians,
            "vave_candidates": sorted(flagged, key=lambda f: -f["ratio"]),
            "points": points,
        },
        "provenance": _provenance(work, ["unit_cost", "mass_kg", "commodity", "material_grade"],
                                  "unit_cost/mass_kg vs groupby(commodity).median()"),
        "caveats": ["Commodities with few parts have unstable medians."]
        if (work.groupby("commodity").size() < 4).any() else [],
    }


def unit_cost_outliers_mad(df: pd.DataFrame) -> dict[str, Any]:
    """Modified z-score (MAD-based) on unit_cost within commodity groups."""
    name = "unit_cost_outliers_mad"
    method = (f"Modified z = 0.6745 x (x - median) / MAD within each commodity; |z| > {MAD_Z_THRESHOLD} flagged. "
              f"Groups need n >= 5 and MAD > 0.")
    gate = _require(df, ["unit_cost", "commodity"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "commodity"])
    outliers = []
    groups_tested = 0
    for commodity, group in work.groupby("commodity"):
        if len(group) < 5:
            continue
        values = group["unit_cost"].to_numpy(dtype=float)
        median = float(np.median(values))
        mad = float(np.median(np.abs(values - median)))
        if mad == 0:
            continue
        groups_tested += 1
        z = 0.6745 * (values - median) / mad
        for idx, zi in zip(group.index, z):
            if abs(zi) > MAD_Z_THRESHOLD:
                outliers.append({
                    "part_number": str(df.at[idx, "part_number"]) if "part_number" in df.columns else f"row {idx}",
                    "commodity": str(commodity),
                    "unit_cost": round(float(df.at[idx, "unit_cost"]), 4),
                    "commodity_median": round(median, 4),
                    "modified_z": round(float(zi), 2),
                })
    if groups_tested == 0:
        return _insufficient(name, method, "No commodity group has n >= 5 with non-zero MAD.")
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"outliers": outliers, "groups_tested": groups_tested},
        "provenance": _provenance(work, ["unit_cost", "commodity"], "0.6745*(x-median)/MAD per commodity"),
        "caveats": [],
    }


# ---------------------------------------------------------------- comparative / benchmarking

def supplier_comparison(df: pd.DataFrame) -> dict[str, Any]:
    """Same/similar parts (same part_name or part_number) quoted by multiple suppliers."""
    name = "supplier_comparison"
    method = ("Parts appearing under more than one supplier (matched on part_number, else part_name): "
              "price spread % = (max - min) / min of quoted_price (unit_cost fallback).")
    price_col = "quoted_price" if "quoted_price" in df.columns else "unit_cost"
    gate = _require(df, [price_col, "supplier"], name, method)
    if gate:
        return gate
    key = "part_number" if "part_number" in df.columns else ("part_name" if "part_name" in df.columns else None)
    if key is None:
        return _insufficient(name, method, "No part_number or part_name column mapped.")
    work = df.dropna(subset=[key, "supplier", price_col])
    comparisons = []
    for part, group in work.groupby(key):
        suppliers = group["supplier"].nunique()
        if suppliers < 2:
            continue
        lo, hi = float(group[price_col].min()), float(group[price_col].max())
        if lo <= 0:
            continue
        comparisons.append({
            "part": str(part),
            "suppliers": sorted(group["supplier"].unique().tolist()),
            "min_price": round(lo, 4),
            "max_price": round(hi, 4),
            "spread_pct": round((hi - lo) / lo * 100, 2),
            "price_column": price_col,
        })
    if not comparisons:
        return _insufficient(name, method, "No part is quoted by more than one supplier.")
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"comparisons": sorted(comparisons, key=lambda c: -c["spread_pct"])},
        "provenance": _provenance(work, [key, "supplier", price_col], "(max-min)/min per multi-supplier part"),
        "caveats": ["Matching on part identity only; check the parts really are technically equivalent."],
    }


def regional_comparison(df: pd.DataFrame) -> dict[str, Any]:
    """Average cost level by region, per commodity where possible."""
    name = "regional_comparison"
    method = "Spend-weighted mean unit_cost and cost_per_kg by region (and per commodity where mapped)."
    gate = _require(df, ["unit_cost", "region"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "region"]).copy()
    work = work[work["unit_cost"] > 0]
    if work["region"].nunique() < 2:
        return _insufficient(name, method, "Fewer than two regions present.")
    rows = []
    for region, group in work.groupby("region"):
        entry = {"region": str(region), "parts": int(len(group)),
                 "mean_unit_cost": round(float(group["unit_cost"].mean()), 4)}
        if "mass_kg" in group.columns:
            with_mass = group[(group["mass_kg"].notna()) & (group["mass_kg"] > 0)]
            if len(with_mass) > 0:
                entry["mean_cost_per_kg"] = round(float((with_mass["unit_cost"] / with_mass["mass_kg"]).mean()), 2)
        if "annual_volume" in group.columns:
            spend = (group["unit_cost"] * group["annual_volume"]).sum(skipna=True)
            entry["annual_spend"] = round(float(spend), 2)
        rows.append(entry)
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"regions": rows},
        "provenance": _provenance(work, ["unit_cost", "region", "mass_kg", "annual_volume"],
                                  "groupby(region) means and spend"),
        "caveats": ["Regional means mix commodities unless filtered; interpret with the commodity mix in mind."],
    }


def cost_vs_mass_regression(df: pd.DataFrame) -> dict[str, Any]:
    """OLS unit_cost ~ mass_kg per commodity. Refused if n < 8 or R2 < 0.5.
    Parts more than 1 SD of residual above the fit line are opportunities."""
    name = "cost_vs_mass_regression"
    method = (f"scipy.stats.linregress(unit_cost ~ mass_kg) within commodity; refused if n < {MIN_REGRESSION_N} "
              f"or R2 < {MIN_REGRESSION_R2}; parts with residual > 1 SD above the line are flagged.")
    gate = _require(df, ["unit_cost", "mass_kg", "commodity"], name, method)
    if gate:
        return gate
    work = df.dropna(subset=["unit_cost", "mass_kg", "commodity"])
    work = work[(work["mass_kg"] > 0) & (work["unit_cost"] > 0)]
    fits, refusals = [], []
    for commodity, group in work.groupby("commodity"):
        n = len(group)
        if n < MIN_REGRESSION_N:
            refusals.append({"commodity": str(commodity), "reason": f"n = {n} < {MIN_REGRESSION_N}."})
            continue
        x = group["mass_kg"].to_numpy(dtype=float)
        y = group["unit_cost"].to_numpy(dtype=float)
        fit = stats.linregress(x, y)
        r2 = float(fit.rvalue ** 2)
        if r2 < MIN_REGRESSION_R2:
            refusals.append({"commodity": str(commodity),
                             "reason": f"R2 = {r2:.3f} < {MIN_REGRESSION_R2}: cost is not explained by mass here."})
            continue
        residuals = y - (fit.slope * x + fit.intercept)
        sd = float(np.std(residuals, ddof=1))
        above = []
        for idx, resid in zip(group.index, residuals):
            if sd > 0 and resid > sd:
                above.append({
                    "part_number": str(df.at[idx, "part_number"]) if "part_number" in df.columns else f"row {idx}",
                    "mass_kg": round(float(df.at[idx, "mass_kg"]), 4),
                    "unit_cost": round(float(df.at[idx, "unit_cost"]), 4),
                    "expected_cost": round(float(fit.slope * df.at[idx, "mass_kg"] + fit.intercept), 4),
                    "residual": round(float(resid), 4),
                })
        fits.append({
            "commodity": str(commodity), "n": int(n),
            "slope_per_kg": round(float(fit.slope), 4),
            "intercept": round(float(fit.intercept), 4),
            "r_squared": round(r2, 4),
            "residual_sd": round(sd, 4),
            "parts_above_1sd": above,
        })
    if not fits and refusals:
        return _refused(name, method, "; ".join(f"{r['commodity']}: {r['reason']}" for r in refusals))
    if not fits:
        return _insufficient(name, method, "No commodity had usable mass and cost data.")
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {"fits": fits, "refused_commodities": refusals},
        "provenance": _provenance(work, ["unit_cost", "mass_kg", "commodity"],
                                  "scipy.stats.linregress per commodity"),
        "caveats": ["Linear cost-vs-mass is a screening model; it ignores complexity and process differences."],
    }


# ---------------------------------------------------------------- variance

def cost_walk(df_old: pd.DataFrame, df_new: pd.DataFrame) -> dict[str, Any]:
    """Old -> new price walk. By cost driver where both files carry a breakdown,
    else by part."""
    name = "cost_walk"
    method = ("Parts matched on part_number; per-part delta = new - old (quoted_price, else unit_cost), "
              "annualised with new-file volume; decomposed by cost element where both files have the breakdown.")
    for frame, label in ((df_old, "old"), (df_new, "new")):
        if "part_number" not in frame.columns:
            return _insufficient(name, method, f"No part_number column in the {label} file: cannot match parts.")
    price_col = "quoted_price" if ("quoted_price" in df_old.columns and "quoted_price" in df_new.columns) else "unit_cost"
    if price_col not in df_old.columns or price_col not in df_new.columns:
        return _insufficient(name, method, "Neither quoted_price nor unit_cost present in both files.")
    old = df_old.dropna(subset=["part_number", price_col]).drop_duplicates("part_number", keep="first")
    new = df_new.dropna(subset=["part_number", price_col]).drop_duplicates("part_number", keep="first")
    merged = old.merge(new, on="part_number", suffixes=("_old", "_new"))
    if merged.empty:
        return _insufficient(name, method, "No part_number appears in both files.")
    merged["delta"] = merged[f"{price_col}_new"] - merged[f"{price_col}_old"]
    # annual_volume only gets a suffix when both files carry it; prefer the
    # new file's volumes either way.
    vol_col = next((c for c in ("annual_volume_new", "annual_volume") if c in merged.columns), None)
    merged["annual_delta"] = merged["delta"] * merged[vol_col].fillna(0) if vol_col else np.nan

    breakdown_drivers = []
    both_breakdown = [c for c in BREAKDOWN_FIELDS
                      if f"{c}_old" in merged.columns and f"{c}_new" in merged.columns
                      and merged[f"{c}_old"].notna().any() and merged[f"{c}_new"].notna().any()]
    for c in both_breakdown:
        d = (merged[f"{c}_new"] - merged[f"{c}_old"])
        annual = float((d * merged[vol_col].fillna(0)).sum()) if vol_col else None
        breakdown_drivers.append({"driver": c, "delta_per_piece_sum": round(float(d.sum(skipna=True)), 4),
                                  "annual_delta": (round(annual, 2) if annual is not None else None)})

    by_part = merged.sort_values("annual_delta" if vol_col else "delta", ascending=False)
    items = [{
        "part_number": str(r["part_number"]),
        "old": round(float(r[f"{price_col}_old"]), 4),
        "new": round(float(r[f"{price_col}_new"]), 4),
        "delta": round(float(r["delta"]), 4),
        "annual_delta": (round(float(r["annual_delta"]), 2) if vol_col and pd.notna(r["annual_delta"]) else None),
    } for _, r in by_part.iterrows()]
    total_annual = float(merged["annual_delta"].sum()) if vol_col else None
    return {
        "analysis": name, "status": "ok", "method": method,
        "result": {
            "price_column": price_col,
            "matched_parts": int(len(merged)),
            "unmatched_old": int(len(old) - len(merged)),
            "unmatched_new": int(len(new) - len(merged)),
            "total_annual_delta": (round(total_annual, 2) if total_annual is not None else None),
            "by_part": items,
            "by_driver": breakdown_drivers,
        },
        "provenance": {"source": "old + new files", "columns": [price_col, "annual_volume"] + both_breakdown,
                       "computation": "merge on part_number; new - old"},
        "caveats": ["Walk covers matched parts only."] if (len(old) != len(merged) or len(new) != len(merged)) else [],
    }


def run_all(df: pd.DataFrame, df_compare: pd.DataFrame | None = None) -> list[dict[str, Any]]:
    """Run every analysis the data supports; the rest self-report as
    insufficient_data/refused."""
    results = [
        pareto(df, "part"),
        pareto(df, "commodity"),
        pareto(df, "supplier"),
        cost_breakdown_structure(df),
        treemap_data(df),
        should_cost_gap(df),
        target_cost_gap(df),
        cost_per_kg(df),
        unit_cost_outliers_mad(df),
        supplier_comparison(df),
        regional_comparison(df),
        cost_vs_mass_regression(df),
    ]
    if df_compare is not None:
        results.append(cost_walk(df, df_compare))
    else:
        results.append(_insufficient(
            "cost_walk",
            "Old -> new price walk by driver or part.",
            "No comparison file provided (--compare). Cost walk needs two files or time periods.",
        ))
    return results

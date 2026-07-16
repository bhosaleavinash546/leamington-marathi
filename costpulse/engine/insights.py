"""Ranks analysis findings by financial impact and packages insights.json.

Severity thresholds (share of total annual spend):
    critical    > 5%
    significant   1-5%
    notable     < 1%
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CRITICAL_SHARE = 0.05
SIGNIFICANT_SHARE = 0.01


def _severity(impact: float | None, total_spend: float | None) -> str:
    if impact is None or not total_spend:
        return "notable"
    share = impact / total_spend
    if share > CRITICAL_SHARE:
        return "critical"
    if share >= SIGNIFICANT_SHARE:
        return "significant"
    return "notable"


def _get(analyses: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for a in analyses:
        if a["analysis"] == name:
            return a
    return None


def _finding(title: str, impact: float | None, total_spend: float | None,
             detail: str, analysis: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": title,
        "severity": _severity(impact, total_spend),
        "impact_per_year": (round(impact, 2) if impact is not None else None),
        "detail": detail,
        "analysis": analysis["analysis"],
        "method": analysis["method"],
        "provenance": analysis["provenance"],
        "caveats": analysis["caveats"],
    }


def build_findings(analyses: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], float | None]:
    """Extract ranked findings (with severity) from the raw analysis results."""
    findings: list[dict[str, Any]] = []

    pareto_part = _get(analyses, "pareto_by_part")
    total_spend = None
    if pareto_part and pareto_part["status"] == "ok":
        total_spend = pareto_part["result"]["total_annual_spend"]
        n80 = pareto_part["result"]["n_items_for_80pct"]
        n_all = pareto_part["result"]["n_items_total"]
        top = pareto_part["result"]["items"][0]
        findings.append(_finding(
            f"Spend concentration: {n80} of {n_all} parts carry 80% of annual spend",
            top["annual_spend"], total_spend,
            f"Largest single item is {top['label']} at {top['annual_spend']:,.2f}/yr "
            f"({top['share_pct']}% of total spend {total_spend:,.2f}/yr).",
            pareto_part,
        ))

    gap = _get(analyses, "should_cost_gap")
    if gap and gap["status"] == "ok" and gap["result"]["total_addressable_gap_per_year"] is not None:
        total_gap = gap["result"]["total_addressable_gap_per_year"]
        positive = [i for i in gap["result"]["items"] if i["gap"] > 0 and i["annual_gap"]]
        top_items = ", ".join(f"{i['part_number']} ({i['annual_gap']:,.2f}/yr)" for i in positive[:3])
        findings.append(_finding(
            f"Total addressable should-cost gap: {total_gap:,.2f}/yr across {gap['result']['parts_with_positive_gap']} parts",
            total_gap, total_spend,
            f"Largest gaps: {top_items}." if top_items else "No positive gaps.",
            gap,
        ))
        for item in positive[:5]:
            findings.append(_finding(
                f"{item['part_number']} quoted {item['gap_pct']}% above should-cost",
                item["annual_gap"], total_spend,
                f"{item['part_number']} ({item['part_name']}, {item['supplier']}): quoted {item['quoted_price']} "
                f"vs should-cost {item['should_cost']} -> {item['annual_gap']:,.2f}/yr addressable.",
                gap,
            ))

    tgap = _get(analyses, "target_cost_gap")
    if tgap and tgap["status"] == "ok" and tgap["result"]["parts_above_target"] > 0:
        total = tgap["result"]["total_gap_above_target_per_year"]
        findings.append(_finding(
            f"{tgap['result']['parts_above_target']} parts priced above target cost",
            total, total_spend,
            (f"Gap above target totals {total:,.2f}/yr." if total is not None
             else "Per-piece gaps only (no volume mapped)."),
            tgap,
        ))

    cpk = _get(analyses, "cost_per_kg")
    if cpk and cpk["status"] == "ok" and cpk["result"]["vave_candidates"]:
        cands = cpk["result"]["vave_candidates"]
        names = ", ".join(f"{c['part_number']} ({c['ratio']}x)" for c in cands[:3])
        findings.append(_finding(
            f"{len(cands)} VAVE candidates above 1.5x commodity median cost/kg",
            None, total_spend,
            f"Worst offenders: {names}. Medians per commodity in the cost_per_kg analysis.",
            cpk,
        ))

    mad = _get(analyses, "unit_cost_outliers_mad")
    if mad and mad["status"] == "ok" and mad["result"]["outliers"]:
        outs = mad["result"]["outliers"]
        findings.append(_finding(
            f"{len(outs)} statistical price outliers within commodity groups",
            None, total_spend,
            "; ".join(f"{o['part_number']} (z={o['modified_z']}, {o['unit_cost']} vs median {o['commodity_median']})"
                      for o in outs[:3]),
            mad,
        ))

    sup = _get(analyses, "supplier_comparison")
    if sup and sup["status"] == "ok":
        comps = sup["result"]["comparisons"]
        worst = comps[0]
        findings.append(_finding(
            f"Multi-supplier price spread up to {worst['spread_pct']}% on {worst['part']}",
            None, total_spend,
            f"{worst['part']}: {worst['min_price']} to {worst['max_price']} across {', '.join(worst['suppliers'])}.",
            sup,
        ))

    reg = _get(analyses, "cost_vs_mass_regression")
    if reg and reg["status"] == "ok":
        for fit in reg["result"]["fits"]:
            if fit["parts_above_1sd"]:
                parts = ", ".join(p["part_number"] for p in fit["parts_above_1sd"][:3])
                findings.append(_finding(
                    f"{len(fit['parts_above_1sd'])} {fit['commodity']} parts above the cost-vs-mass line by >1 SD",
                    None, total_spend,
                    f"R2 = {fit['r_squared']}, slope {fit['slope_per_kg']}/kg. Parts: {parts}.",
                    reg,
                ))

    walk = _get(analyses, "cost_walk")
    if walk and walk["status"] == "ok" and walk["result"]["total_annual_delta"] is not None:
        delta = walk["result"]["total_annual_delta"]
        findings.append(_finding(
            f"Net cost walk of {delta:,.2f}/yr across {walk['result']['matched_parts']} matched parts",
            abs(delta), total_spend,
            f"Direction: {'increase' if delta > 0 else 'decrease'} vs the comparison file.",
            walk,
        ))

    findings.sort(key=lambda f: (f["impact_per_year"] is None, -(f["impact_per_year"] or 0)))
    return findings, total_spend


def build_insights(
    analyses: list[dict[str, Any]],
    data_quality: dict[str, Any],
    normalisation: dict[str, Any],
    dataset_name: str,
    currency: str | None,
    run_id: str,
    run_timestamp: str | None = None,
) -> dict[str, Any]:
    findings, total_spend = build_findings(analyses)

    kpis: dict[str, Any] = {"total_annual_spend": total_spend}
    pareto_part = _get(analyses, "pareto_by_part")
    if pareto_part and pareto_part["status"] == "ok":
        kpis["parts_analysed"] = pareto_part["result"]["n_items_total"]
    pareto_supplier = _get(analyses, "pareto_by_supplier")
    if pareto_supplier and pareto_supplier["status"] == "ok":
        kpis["suppliers"] = pareto_supplier["result"]["n_items_total"]
    pareto_commodity = _get(analyses, "pareto_by_commodity")
    if pareto_commodity and pareto_commodity["status"] == "ok":
        top = pareto_commodity["result"]["items"][0]
        kpis["top_commodity"] = top["label"]
        kpis["top_commodity_share_pct"] = top["share_pct"]
    gap = _get(analyses, "should_cost_gap")
    kpis["total_addressable_gap_per_year"] = (
        gap["result"]["total_addressable_gap_per_year"] if gap and gap["status"] == "ok" else None
    )

    return {
        "meta": {
            "tool": "CostPulse",
            "run_id": run_id,
            "generated_at": run_timestamp or datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dataset": dataset_name,
            "currency": currency,
        },
        "kpis": kpis,
        "findings": findings,
        "analyses": analyses,
        "data_quality": data_quality,
        "normalisation": normalisation,
    }


def write_insights(insights: dict[str, Any], path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(insights, fh, indent=2, ensure_ascii=False)
    return path

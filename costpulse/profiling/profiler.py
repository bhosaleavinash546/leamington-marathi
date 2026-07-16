"""Data-quality profiling with a 0-100 trust score.

Runs BEFORE any analysis. If the trust score is below the threshold the
pipeline stops: analysing garbage produces confident garbage. Every failed
check names the specific rows so the user can fix the source file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

TRUST_THRESHOLD = 60
BREAKDOWN_TOLERANCE = 0.02  # 2%
BREAKDOWN_COMPONENTS = ["material_cost", "process_cost", "labour_cost", "overhead", "sga_profit"]
IQR_MULTIPLIER = 1.5

# Score deductions per check: (flat penalty if any row fails, per-row penalty, cap)
_PENALTIES = {
    "negative_costs": (10, 3, 25),
    "zero_cost_with_mass": (5, 2, 15),
    "unit_cost_iqr_outliers": (2, 1, 10),
    "breakdown_integrity": (8, 3, 20),
    "duplicate_conflicting_parts": (8, 3, 20),
}


@dataclass
class CheckResult:
    name: str
    description: str
    failing_rows: list[dict[str, Any]] = field(default_factory=list)
    skipped_reason: str | None = None

    @property
    def passed(self) -> bool:
        return self.skipped_reason is None and not self.failing_rows

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "status": "skipped" if self.skipped_reason else ("pass" if self.passed else "fail"),
            "skipped_reason": self.skipped_reason,
            "failing_row_count": len(self.failing_rows),
            "failing_rows": self.failing_rows,
        }


def _row_ref(df: pd.DataFrame, idx: int, extra: dict[str, Any]) -> dict[str, Any]:
    ref: dict[str, Any] = {"row_index": int(idx)}
    for key in ("part_number", "part_name", "supplier"):
        if key in df.columns and pd.notna(df.at[idx, key]):
            ref[key] = str(df.at[idx, key])
    ref.update(extra)
    return ref


def _column_profile(df: pd.DataFrame) -> list[dict[str, Any]]:
    profiles = []
    for col in df.columns:
        if col.startswith("_"):
            continue
        s = df[col]
        numeric = pd.api.types.is_numeric_dtype(s)
        profiles.append(
            {
                "column": col,
                "dtype": str(s.dtype),
                "null_pct": round(float(s.isna().mean() * 100), 2),
                "unique_count": int(s.nunique(dropna=True)),
                "min": (None if not numeric or s.dropna().empty else round(float(s.min()), 6)),
                "max": (None if not numeric or s.dropna().empty else round(float(s.max()), 6)),
                "suspected_unit": _suspect_unit(col),
            }
        )
    return profiles


def _suspect_unit(col: str) -> str:
    if col in ("mass_kg",):
        return "kg"
    if col in ("annual_volume",):
        return "pieces/yr"
    if col in (
        "unit_cost", "material_cost", "process_cost", "labour_cost", "overhead",
        "sga_profit", "logistics", "tooling_amortisation", "quoted_price",
        "should_cost", "target_cost",
    ):
        return "currency/piece"
    return ""


def check_negative_costs(df: pd.DataFrame) -> CheckResult:
    check = CheckResult("negative_costs", "No cost or price column may be negative.")
    cost_cols = [c for c in df.columns if _suspect_unit(c) == "currency/piece"]
    if not cost_cols:
        check.skipped_reason = "No cost columns mapped."
        return check
    for col in cost_cols:
        for idx in df.index[df[col] < 0]:
            check.failing_rows.append(_row_ref(df, idx, {"column": col, "value": float(df.at[idx, col])}))
    return check


def check_zero_cost_with_mass(df: pd.DataFrame) -> CheckResult:
    check = CheckResult("zero_cost_with_mass", "A part with non-zero mass cannot have zero unit cost.")
    if "unit_cost" not in df.columns or "mass_kg" not in df.columns:
        check.skipped_reason = "Needs both unit_cost and mass_kg."
        return check
    mask = (df["unit_cost"] == 0) & (df["mass_kg"] > 0)
    for idx in df.index[mask]:
        check.failing_rows.append(_row_ref(df, idx, {"mass_kg": float(df.at[idx, "mass_kg"])}))
    return check


def check_unit_cost_iqr_outliers(df: pd.DataFrame) -> CheckResult:
    check = CheckResult(
        "unit_cost_iqr_outliers",
        "unit_cost outliers vs commodity peers (outside Q1-1.5*IQR .. Q3+1.5*IQR within commodity).",
    )
    if "unit_cost" not in df.columns or "commodity" not in df.columns:
        check.skipped_reason = "Needs unit_cost and commodity."
        return check
    for commodity, group in df.dropna(subset=["unit_cost"]).groupby("commodity"):
        if len(group) < 4:
            continue  # IQR on tiny groups flags everything
        q1, q3 = group["unit_cost"].quantile([0.25, 0.75])
        iqr = q3 - q1
        lo, hi = q1 - IQR_MULTIPLIER * iqr, q3 + IQR_MULTIPLIER * iqr
        for idx in group.index[(group["unit_cost"] < lo) | (group["unit_cost"] > hi)]:
            check.failing_rows.append(
                _row_ref(df, idx, {
                    "commodity": str(commodity),
                    "unit_cost": float(df.at[idx, "unit_cost"]),
                    "peer_bounds": [round(float(lo), 4), round(float(hi), 4)],
                })
            )
    return check


def check_breakdown_integrity(df: pd.DataFrame) -> CheckResult:
    check = CheckResult(
        "breakdown_integrity",
        "material + process + labour + overhead + SG&A must equal unit_cost within 2% "
        "(rows with a complete breakdown only).",
    )
    present = [c for c in BREAKDOWN_COMPONENTS if c in df.columns]
    if "unit_cost" not in df.columns or len(present) < len(BREAKDOWN_COMPONENTS):
        missing = [c for c in BREAKDOWN_COMPONENTS if c not in df.columns]
        check.skipped_reason = f"Needs unit_cost and full breakdown; missing: {missing or ['unit_cost']}."
        return check
    complete = df.dropna(subset=present + ["unit_cost"])
    for idx in complete.index:
        unit = float(complete.at[idx, "unit_cost"])
        if unit == 0:
            continue
        component_sum = float(sum(complete.at[idx, c] for c in present))
        deviation = abs(component_sum - unit) / abs(unit)
        if deviation > BREAKDOWN_TOLERANCE:
            check.failing_rows.append(
                _row_ref(df, idx, {
                    "unit_cost": unit,
                    "component_sum": round(component_sum, 4),
                    "deviation_pct": round(deviation * 100, 2),
                })
            )
    return check


def check_duplicate_conflicting_parts(df: pd.DataFrame) -> CheckResult:
    check = CheckResult(
        "duplicate_conflicting_parts",
        "The same part_number must not appear with conflicting unit costs (>1% apart).",
    )
    if "part_number" not in df.columns or "unit_cost" not in df.columns:
        check.skipped_reason = "Needs part_number and unit_cost."
        return check
    grouped = df.dropna(subset=["part_number", "unit_cost"]).groupby("part_number")["unit_cost"]
    for pn, costs in grouped:
        if len(costs) < 2:
            continue
        lo, hi = float(costs.min()), float(costs.max())
        if lo != 0 and (hi - lo) / abs(lo) > 0.01:
            check.failing_rows.append({
                "part_number": str(pn),
                "occurrences": int(len(costs)),
                "unit_costs": [round(float(v), 4) for v in costs],
            })
    return check


def compute_trust_score(checks: list[CheckResult], n_rows: int) -> int:
    score = 100.0
    for check in checks:
        if check.passed or check.skipped_reason:
            continue
        flat, per_row, cap = _PENALTIES.get(check.name, (5, 2, 15))
        penalty = min(cap, flat + per_row * len(check.failing_rows))
        # Scale up when a large share of the dataset is bad.
        if n_rows > 0 and len(check.failing_rows) / n_rows > 0.25:
            penalty = min(cap * 1.5, penalty * 1.5)
        score -= penalty
    return max(0, int(round(score)))


def profile(df: pd.DataFrame) -> dict[str, Any]:
    """Full data-quality section for insights.json."""
    checks = [
        check_negative_costs(df),
        check_zero_cost_with_mass(df),
        check_unit_cost_iqr_outliers(df),
        check_breakdown_integrity(df),
        check_duplicate_conflicting_parts(df),
    ]
    trust = compute_trust_score(checks, len(df))
    return {
        "row_count": int(len(df)),
        "column_profiles": _column_profile(df),
        "checks": [c.to_dict() for c in checks],
        "trust_score": trust,
        "trust_threshold": TRUST_THRESHOLD,
        "pipeline_blocked": bool(trust < TRUST_THRESHOLD),
    }

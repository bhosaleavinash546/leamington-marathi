"""Header mapping, unit/currency normalisation, subtotal handling.

Everything here is deterministic and reported: mapped columns, unmapped
columns, currency decisions, unit conversions, rows stripped, and the
line-items-vs-total reconciliation all land in the NormalisationReport that
feeds the audit log.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

FUZZY_THRESHOLD = 0.85
RECONCILIATION_TOLERANCE = 0.005  # 0.5%

MONEY_FIELDS = [
    "unit_cost",
    "material_cost",
    "process_cost",
    "labour_cost",
    "overhead",
    "sga_profit",
    "logistics",
    "tooling_amortisation",
    "quoted_price",
    "should_cost",
    "target_cost",
]
NUMERIC_FIELDS = MONEY_FIELDS + ["annual_volume", "mass_kg"]

_CURRENCY_SYMBOLS = {"£": "GBP", "$": "USD", "€": "EUR", "₹": "INR"}
_CURRENCY_CODES = {"GBP", "USD", "EUR", "INR", "JPY", "CNY", "CZK", "PLN", "MXN"}
_TOTAL_ROW_PATTERN = re.compile(r"\b(?:sub\s*-?\s*)?total\b|\bgrand\s+total\b|\bsumme\b", re.IGNORECASE)


@dataclass
class NormalisationReport:
    mapped_columns: dict[str, str] = field(default_factory=dict)  # raw -> canonical
    unmapped_columns: list[str] = field(default_factory=list)
    unit_conversions: list[str] = field(default_factory=list)
    currency: str | None = None
    mixed_currency: bool = False
    currency_notes: list[str] = field(default_factory=list)
    subtotal_rows_removed: int = 0
    reconciliation: list[dict[str, Any]] = field(default_factory=list)
    hard_warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mapped_columns": self.mapped_columns,
            "unmapped_columns": self.unmapped_columns,
            "unit_conversions": self.unit_conversions,
            "currency": self.currency,
            "mixed_currency": self.mixed_currency,
            "currency_notes": self.currency_notes,
            "subtotal_rows_removed": self.subtotal_rows_removed,
            "reconciliation": self.reconciliation,
            "hard_warnings": self.hard_warnings,
            "notes": self.notes,
        }


def _normalise_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _strip_unit_suffix(header: str) -> str:
    """'Mass (g)' -> 'Mass'; 'Price per 1000' -> 'Price per 1000' (kept, used
    as a unit hint downstream)."""
    return re.sub(r"\s*[\[(][^\])]*[\])]\s*$", "", header).strip()


class SchemaMapper:
    def __init__(self, schema_map_path: str | Path):
        with open(schema_map_path, encoding="utf-8") as fh:
            self._schema = yaml.safe_load(fh)
        self._token_to_canonical: dict[str, str] = {}
        for canonical, spec in self._schema["canonical_fields"].items():
            self._token_to_canonical[_normalise_token(canonical)] = canonical
            for syn in spec.get("synonyms", []):
                self._token_to_canonical[_normalise_token(syn)] = canonical
        self.unit_hints: dict[str, list[str]] = self._schema.get("unit_hints", {})

    def map_header(self, raw_header: str) -> str | None:
        """Exact token match first, then fuzzy match against known tokens."""
        for candidate in (raw_header, _strip_unit_suffix(raw_header)):
            token = _normalise_token(candidate)
            if token in self._token_to_canonical:
                return self._token_to_canonical[token]
        token = _normalise_token(_strip_unit_suffix(raw_header))
        if not token:
            return None
        close = difflib.get_close_matches(token, self._token_to_canonical.keys(), n=1, cutoff=FUZZY_THRESHOLD)
        if close:
            return self._token_to_canonical[close[0]]
        return None


def _detect_cell_currency(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    for sym, code in _CURRENCY_SYMBOLS.items():
        if sym in value:
            return code
    upper = value.strip().upper()
    for code in _CURRENCY_CODES:
        if re.search(rf"\b{code}\b", upper):
            return code
    return None


def _to_number(value: Any) -> float:
    """Parse '£1,234.50', '1 234,5', 'EUR 12.30' etc. NaN if unparseable."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return np.nan
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    text = str(value).strip()
    if not text:
        return np.nan
    text = re.sub(r"[£$€₹]", "", text)
    text = re.sub(r"\b[A-Z]{3}\b", "", text)
    text = text.replace(" ", "").replace(",", "")
    text = re.sub(r"%$", "", text)
    try:
        return float(text)
    except ValueError:
        return np.nan


def _header_has_hint(raw_header: str, hints: list[str]) -> bool:
    lower = raw_header.lower()
    return any(h in lower for h in hints)


def normalise(
    df: pd.DataFrame,
    schema_map_path: str | Path,
    currency_rates: dict[str, float] | None = None,
    base_currency: str = "GBP",
    source: str = "",
) -> tuple[pd.DataFrame, pd.DataFrame, NormalisationReport]:
    """Returns (normalised line items, stripped total rows, report).

    currency_rates: units of base_currency per 1 unit of foreign currency,
    e.g. {"EUR": 0.85} means 1 EUR = 0.85 GBP.
    """
    mapper = SchemaMapper(schema_map_path)
    report = NormalisationReport()

    # 1. Map headers.
    rename: dict[str, str] = {}
    raw_header_for: dict[str, str] = {}
    for raw_col in df.columns:
        canonical = mapper.map_header(str(raw_col))
        if canonical and canonical not in rename.values():
            rename[raw_col] = canonical
            raw_header_for[canonical] = str(raw_col)
            report.mapped_columns[str(raw_col)] = canonical
        else:
            if canonical:
                report.notes.append(
                    f"Column '{raw_col}' also maps to '{canonical}' but that field is already "
                    f"taken by '{raw_header_for[canonical]}' — left unmapped."
                )
            report.unmapped_columns.append(str(raw_col))
    out = df.rename(columns=rename).copy()

    # 2. Strip subtotal/total rows before any numeric work.
    text_cols = [c for c in ("part_number", "part_name") if c in out.columns]
    if not text_cols:
        text_cols = [c for c in out.columns if out[c].dtype == object][:2]
    is_total = pd.Series(False, index=out.index)
    for col in text_cols:
        is_total |= out[col].astype(str).str.contains(_TOTAL_ROW_PATTERN, na=False)
    totals = out[is_total].copy()
    out = out[~is_total].reset_index(drop=True)
    report.subtotal_rows_removed = int(len(totals))

    # 3. Currency detection (before numeric coercion strips symbols).
    # Each money column gets its own currency: the majority marker found in
    # its values, else the row-level `currency` column, else base_currency.
    # Unmarked columns count as base currency, so ONE marked EUR column in an
    # otherwise-GBP file is correctly treated as mixed.
    per_row_currency = pd.Series(base_currency, index=out.index)
    if "currency" in out.columns:
        per_row_currency = out["currency"].map(
            lambda v: (_detect_cell_currency(str(v)) or str(v).strip().upper()) if pd.notna(v) else base_currency
        )
        per_row_currency = per_row_currency.where(per_row_currency.isin(_CURRENCY_CODES), base_currency)

    column_currency: dict[str, str | None] = {}  # None => follows per-row currency
    detected: set[str] = set(per_row_currency.unique())
    for canonical in MONEY_FIELDS:
        if canonical not in out.columns:
            continue
        markers = out[canonical].map(_detect_cell_currency).dropna()
        if len(markers) > 0:
            code = markers.mode().iloc[0]
            column_currency[canonical] = code
            detected.add(code)
            if markers.nunique() > 1:
                report.currency_notes.append(
                    f"Column '{raw_header_for.get(canonical, canonical)}' carries multiple currency "
                    f"markers {sorted(markers.unique())}; using majority '{code}'."
                )
        else:
            column_currency[canonical] = None
            detected.update(per_row_currency.unique())

    if detected == {base_currency}:
        report.currency = base_currency
        markers_seen = any(v is not None for v in column_currency.values()) or "currency" in out.columns
        if not markers_seen:
            report.currency_notes.append(f"No currency markers found; assuming {base_currency}.")
        else:
            report.currency_notes.append(f"Single currency detected: {base_currency}.")
    elif len(detected) == 1:
        report.currency = next(iter(detected))
        report.currency_notes.append(f"Single currency detected: {report.currency}.")
    else:
        report.mixed_currency = True
        report.currency_notes.append(
            f"Mixed currencies detected: {sorted(detected)} "
            f"(unmarked money columns are assumed {base_currency})."
        )

    # 4. Numeric coercion + unit conversions.
    for canonical in NUMERIC_FIELDS:
        if canonical not in out.columns:
            continue
        raw_header = raw_header_for.get(canonical, canonical)
        out[canonical] = out[canonical].map(_to_number)
        if canonical == "mass_kg" and _header_has_hint(raw_header, mapper.unit_hints.get("grams", [])):
            out[canonical] = out[canonical] / 1000.0
            report.unit_conversions.append(f"'{raw_header}' (grams) -> mass_kg (divided by 1000).")
        if canonical in MONEY_FIELDS and _header_has_hint(raw_header, mapper.unit_hints.get("per_thousand", [])):
            out[canonical] = out[canonical] / 1000.0
            report.unit_conversions.append(f"'{raw_header}' (per 1000) -> {canonical} per piece (divided by 1000).")

    # 5. Currency conversion or refusal.
    if report.mixed_currency:
        rates = currency_rates or {}
        needed = {c for c in detected if c != base_currency}
        missing = sorted(needed - set(rates))
        if missing:
            report.hard_warnings.append(
                f"Mixed currencies with no rate for {missing}: cross-currency aggregation is REFUSED. "
                f"Provide --currency-rates to enable conversion."
            )
        else:
            for canonical in MONEY_FIELDS:
                if canonical not in out.columns:
                    continue
                col_ccy = column_currency.get(canonical)
                if col_ccy is not None:
                    factor = 1.0 if col_ccy == base_currency else rates[col_ccy]
                    out[canonical] = out[canonical] * factor
                else:
                    row_factor = per_row_currency.map(lambda c: 1.0 if c == base_currency else rates[c])
                    out[canonical] = out[canonical] * row_factor
            report.mixed_currency = False
            report.currency = base_currency
            report.currency_notes.append(f"Converted all money columns to {base_currency} using provided rates.")

    # 6. Percentage breakdown columns: values that are fractions of unit_cost.
    if "unit_cost" in out.columns:
        for canonical in ("material_cost", "process_cost", "labour_cost", "overhead", "sga_profit", "logistics"):
            if canonical not in out.columns:
                continue
            raw_header = raw_header_for.get(canonical, canonical)
            if _header_has_hint(raw_header, mapper.unit_hints.get("percent", [])):
                col = out[canonical]
                scale = 100.0 if col.max(skipna=True) and col.max(skipna=True) > 1.5 else 1.0
                out[canonical] = (col / scale) * out["unit_cost"]
                report.unit_conversions.append(
                    f"'{raw_header}' (% of unit cost) -> {canonical} absolute (x unit_cost)."
                )

    # 7. Reconciliation: line items vs detected total rows.
    if len(totals) > 0:
        for canonical in MONEY_FIELDS + ["annual_volume"]:
            if canonical not in out.columns or canonical not in totals.columns:
                continue
            total_vals = totals[canonical].map(_to_number).dropna()
            if total_vals.empty:
                continue
            stated = float(total_vals.iloc[-1])
            computed = float(out[canonical].sum(skipna=True))
            if stated == 0:
                continue
            mismatch = abs(computed - stated) / abs(stated)
            entry = {
                "column": canonical,
                "stated_total": stated,
                "computed_sum": round(computed, 6),
                "mismatch_pct": round(mismatch * 100, 4),
                "within_tolerance": bool(mismatch <= RECONCILIATION_TOLERANCE),
            }
            report.reconciliation.append(entry)
            if not entry["within_tolerance"]:
                report.hard_warnings.append(
                    f"RECONCILIATION FAILURE on '{canonical}': line items sum to {computed:,.2f} "
                    f"but the file's total row says {stated:,.2f} ({mismatch:.2%} mismatch, tolerance 0.5%)."
                )

    # 8. Text field tidy-up.
    for canonical in ("part_number", "part_name", "commodity", "supplier", "region", "material_grade"):
        if canonical in out.columns:
            out[canonical] = out[canonical].astype(str).str.strip().replace({"nan": np.nan, "None": np.nan})
    if "commodity" in out.columns:
        out["commodity"] = out["commodity"].str.lower()

    if source:
        out["_source"] = source
    return out, totals, report

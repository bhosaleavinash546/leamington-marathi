"""Excel/CSV/TSV loading with automatic header-row detection.

Real-world cost files rarely have headers on row 1: they carry title blocks,
logos, merged banner cells, and unit rows under the headers. The loader's job
is to return clean raw DataFrames (one per sheet) plus a load report saying
exactly what it did — every decision lands in the audit trail.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

HEADER_SCAN_ROWS = 15

# Values that look like a unit annotation row sitting under the headers.
_UNIT_ROW_PATTERN = re.compile(
    r"^\s*[\[(]?\s*(kg|g|mm|pcs?|each|ea|%|£|\$|€|eur|usd|gbp|inr|per\s*(piece|pc|1000|k))\s*[\])]?\s*$",
    re.IGNORECASE,
)


@dataclass
class LoadedSheet:
    """One sheet of raw data with header applied but no normalisation."""

    source_file: str
    sheet_name: str
    df: pd.DataFrame
    header_row: int  # 0-based row index in the original sheet
    dropped_unit_row: bool = False
    notes: list[str] = field(default_factory=list)


def _load_synonym_tokens(schema_map_path: Path) -> set[str]:
    with open(schema_map_path, encoding="utf-8") as fh:
        schema = yaml.safe_load(fh)
    tokens: set[str] = set()
    for canonical, spec in schema["canonical_fields"].items():
        tokens.add(_normalise_token(canonical))
        for syn in spec.get("synonyms", []):
            tokens.add(_normalise_token(syn))
    return tokens


def _normalise_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _score_header_row(row: pd.Series, synonym_tokens: set[str]) -> int:
    """Score a candidate header row: count of cells matching known synonyms,
    with a small credit for any non-null string cell."""
    score = 0
    for cell in row:
        if cell is None or (isinstance(cell, float) and pd.isna(cell)):
            continue
        if isinstance(cell, str) and cell.strip():
            token = _normalise_token(cell)
            if token in synonym_tokens:
                score += 3
            else:
                score += 1
    return score


def detect_header_row(raw: pd.DataFrame, synonym_tokens: set[str]) -> int:
    """Scan the first HEADER_SCAN_ROWS rows and pick the one that best matches
    known schema synonyms. Ties go to the earliest row."""
    best_row, best_score = 0, -1
    for idx in range(min(HEADER_SCAN_ROWS, len(raw))):
        score = _score_header_row(raw.iloc[idx], synonym_tokens)
        if score > best_score:
            best_row, best_score = idx, score
    return best_row


def _is_unit_row(row: pd.Series) -> bool:
    """A unit row has at least two cells that look like unit annotations and
    no numeric data cells."""
    unit_cells = 0
    for cell in row:
        if cell is None or (isinstance(cell, float) and pd.isna(cell)):
            continue
        if isinstance(cell, (int, float)):
            return False
        if isinstance(cell, str) and _UNIT_ROW_PATTERN.match(cell):
            unit_cells += 1
    return unit_cells >= 2


def _apply_header(raw: pd.DataFrame, header_row: int) -> pd.DataFrame:
    header = raw.iloc[header_row]
    df = raw.iloc[header_row + 1 :].reset_index(drop=True)
    cols = []
    for i, cell in enumerate(header):
        if cell is None or (isinstance(cell, float) and pd.isna(cell)) or str(cell).strip() == "":
            cols.append(f"unnamed_{i}")
        else:
            cols.append(str(cell).strip())
    df.columns = cols
    # Drop columns that are entirely empty (merged-cell padding, spacer cols).
    df = df.dropna(axis=1, how="all")
    # Drop rows that are entirely empty.
    df = df.dropna(axis=0, how="all").reset_index(drop=True)
    return df


def load_file(path: str | Path, schema_map_path: str | Path) -> list[LoadedSheet]:
    """Load every sheet of an .xlsx / single table of a .csv/.tsv."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")

    synonym_tokens = _load_synonym_tokens(Path(schema_map_path))
    suffix = path.suffix.lower()

    raw_sheets: dict[str, pd.DataFrame] = {}
    if suffix in (".xlsx", ".xlsm", ".xls"):
        raw_sheets = pd.read_excel(path, sheet_name=None, header=None, engine="openpyxl")
    elif suffix == ".csv":
        raw_sheets = {"csv": pd.read_csv(path, header=None, dtype=object)}
    elif suffix == ".tsv":
        raw_sheets = {"tsv": pd.read_csv(path, sep="\t", header=None, dtype=object)}
    else:
        raise ValueError(f"Unsupported file type: {suffix} (expected .xlsx/.csv/.tsv)")

    loaded: list[LoadedSheet] = []
    for sheet_name, raw in raw_sheets.items():
        if raw.empty:
            continue
        header_row = detect_header_row(raw, synonym_tokens)
        df = _apply_header(raw, header_row)
        notes = []
        if header_row != 0:
            notes.append(f"Header detected on row {header_row + 1} (1-based), not row 1.")

        dropped_unit_row = False
        if len(df) > 0 and _is_unit_row(df.iloc[0]):
            df = df.iloc[1:].reset_index(drop=True)
            dropped_unit_row = True
            notes.append("Dropped a unit annotation row found directly under the headers.")

        loaded.append(
            LoadedSheet(
                source_file=str(path),
                sheet_name=sheet_name,
                df=df,
                header_row=header_row,
                dropped_unit_row=dropped_unit_row,
                notes=notes,
            )
        )
    if not loaded:
        raise ValueError(f"No non-empty sheets found in {path}")
    return loaded


def load_report(sheets: list[LoadedSheet]) -> list[dict[str, Any]]:
    return [
        {
            "source_file": s.source_file,
            "sheet": s.sheet_name,
            "header_row_1based": s.header_row + 1,
            "rows": int(len(s.df)),
            "columns": list(map(str, s.df.columns)),
            "dropped_unit_row": s.dropped_unit_row,
            "notes": s.notes,
        }
        for s in sheets
    ]

"""Injects insights.json + the normalised dataset into the dashboard template.

The output is one self-contained HTML file: Plotly is embedded inline from the
vendored copy (dashboard/vendor/plotly.min.js) so the dashboard works fully
offline; if the vendored file is missing it falls back to the CDN tag (works
offline after one CDN cache).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

TEMPLATE_PATH = Path(__file__).resolve().parent / "template.html"
VENDOR_PLOTLY = Path(__file__).resolve().parent / "vendor" / "plotly.min.js"
PLOTLY_CDN_TAG = '<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>'

DASHBOARD_COLUMNS = [
    "part_number", "part_name", "commodity", "supplier", "region", "annual_volume",
    "unit_cost", "material_cost", "process_cost", "labour_cost", "overhead",
    "sga_profit", "logistics", "tooling_amortisation", "quoted_price",
    "should_cost", "target_cost", "mass_kg", "material_grade",
]


def dataset_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    cols = [c for c in DASHBOARD_COLUMNS if c in df.columns]
    slim = df[cols].replace({np.nan: None})
    return slim.to_dict(orient="records")


def _json_for_html(obj: Any) -> str:
    # </script> inside a JSON string must not terminate the data block.
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def build_dashboard(insights: dict[str, Any], df: pd.DataFrame, out_path: str | Path) -> Path:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")

    if VENDOR_PLOTLY.exists():
        plotly_src = VENDOR_PLOTLY.read_text(encoding="utf-8")
        template = template.replace("<script>/*__PLOTLY_JS__*/</script>",
                                    "<script>" + plotly_src + "</script>", 1)
    else:
        template = template.replace("<script>/*__PLOTLY_JS__*/</script>", PLOTLY_CDN_TAG, 1)

    html = (
        template
        .replace("__INSIGHTS_JSON__", _json_for_html(insights), 1)
        .replace("__DATASET_JSON__", _json_for_html(dataset_records(df)), 1)
    )
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path

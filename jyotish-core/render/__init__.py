"""SVG chart rendering and the PDF kundali sheet.

Sits above `core/` and reads locale files, so it lives outside the engine
(CLAUDE.md 1). One geometry implementation serves the web view, the printed sheet
and the snapshot tests.
"""

from __future__ import annotations

from render.adapter import (
    chart_style_from_string,
    rashi_chart,
    rashi_labels,
    varga_chart,
)
from render.chart_svg import (
    CANVAS,
    ChartData,
    ChartStyle,
    GrahaMark,
    HouseCell,
    render,
    render_north_indian,
    render_south_indian,
    render_table,
)

__all__ = [
    "CANVAS",
    "ChartData",
    "ChartStyle",
    "GrahaMark",
    "HouseCell",
    "chart_style_from_string",
    "rashi_chart",
    "rashi_labels",
    "render",
    "render_north_indian",
    "render_south_indian",
    "render_table",
    "varga_chart",
]

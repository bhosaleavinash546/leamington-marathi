"""Hand-built SVG kundali charts.

CLAUDE.md 8: "Render as hand-built SVG; both layouts must be printable at A4
without reflow" and "the diamond chart needs a semantic table alternative for
screen readers." CLAUDE.md 2.2: "no chart library - Vedic diamond layout has no
library support."

**One geometry implementation.** This module is the single source of the diamond
and square layouts, and it serves the web view, the PDF sheet and the snapshot
tests alike. A React reimplementation would be a second geometry that could drift
from the printed one; instead the frontend inlines this SVG and wraps it for
interaction.

Two layouts:

* **North Indian diamond** - fixed houses, rotating signs. The Maharashtra
  convention and the default (CLAUDE.md 8). House 1 is the top kite and the houses
  run anticlockwise.
* **South Indian square** - fixed signs, rotating houses. A 4x4 grid with the
  centre 2x2 empty, Mesha in the second cell of the top row, signs clockwise.

The SVG carries no scripts, no external references and no embedded fonts: it
inherits the font from its container, so the same markup renders with Noto Sans
Devanagari in the PDF and with the web font in the browser.
"""

from __future__ import annotations

import html
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

#: Viewbox side. Unitless: the consumer scales it, which is what makes the same
#: markup print at A4 and display in a flex column without reflow.
CANVAS: Final[float] = 400.0

#: Between two grahas sharing a line. Non-breaking, so a cell never wraps
#: mid-stellium.
NBSP: Final[str] = "\u00a0"

#: Padding inside the viewbox, leaving room for the chart-style caption.
PAD: Final[float] = 8.0

#: A band below the square for the chart's own caption.
#:
#: The title used to be drawn at ``CANVAS - 1``, one pixel above the bottom of the
#: viewBox, so its cap-height crossed the square's own border at ``CANVAS - PAD``
#: and its Devanagari descenders were clipped by the viewport edge. The chart is a
#: document, and a document's caption sits outside its frame.
TITLE_BAND: Final[float] = 30.0

#: South Indian sign layout, row-major. ``None`` is one of the four empty centre
#: cells. Signs run clockwise from Mesha at row 0, column 1.
SOUTH_INDIAN_GRID: Final[tuple[tuple[int | None, ...], ...]] = (
    (12, 1, 2, 3),
    (11, None, None, 4),
    (10, None, None, 5),
    (9, 8, 7, 6),
)


class ChartStyle(StrEnum):
    NORTH_INDIAN = "north_indian"
    SOUTH_INDIAN = "south_indian"


@dataclass(frozen=True, slots=True)
class GrahaMark:
    """One graha as it appears in a house cell."""

    key: str
    #: Locale abbreviation, e.g. मं or "Ma".
    label: str
    retrograde: bool = False
    combust: bool = False
    #: Degrees within the sign, printed under the abbreviation on a full sheet.
    deg_in_rashi: float | None = None

    def render_label(self, *, show_degrees: bool, numerals: Callable[[str], str] = str) -> str:
        """The text drawn in the cell. Markers are appended, never substituted."""
        text = self.label
        if self.retrograde:
            text += " (व)" if _is_devanagari(self.label) else " (R)"
        if self.combust:
            text += " †"  # dagger: combust
        if show_degrees and self.deg_in_rashi is not None:
            # `numerals` is injected rather than assumed: this geometry is shared
            # by the printed sheet and the browser, and the two answer the
            # CLAUDE.md 7 numeral toggle separately. Latin by default, so the web
            # is unchanged and only a caller that asks gets Devanagari.
            degrees = numerals(f"{self.deg_in_rashi:.0f}")
            text += f" {degrees}°"
        return text


@dataclass(frozen=True, slots=True)
class HouseCell:
    """What one house holds. Houses are 1-based throughout."""

    house: int
    rashi: int
    grahas: tuple[GrahaMark, ...] = ()
    #: Sarvashtakavarga bindus for the rashi, printed small when supplied.
    sav: int | None = None


@dataclass(frozen=True, slots=True)
class ChartData:
    """Everything a chart drawing needs, already localised by the caller."""

    #: 12 cells, in house order 1..12.
    cells: tuple[HouseCell, ...]
    lagna_rashi: int
    #: Short caption, e.g. "राशी कुंडली" or "Navamsa (D9)". Already localised.
    title: str
    #: Rashi labels by 1-based number, already localised. Used by the table
    #: alternative and, in abbreviated form, in the cells.
    rashi_labels: dict[int, str]

    def __post_init__(self) -> None:
        if len(self.cells) != 12:
            raise ValueError(f"a chart needs exactly 12 cells, got {len(self.cells)}")
        if {c.house for c in self.cells} != set(range(1, 13)):
            raise ValueError("cells must cover houses 1..12 exactly once each")

    def cell_for_house(self, house: int) -> HouseCell:
        return next(c for c in self.cells if c.house == house)

    def cell_for_rashi(self, rashi: int) -> HouseCell | None:
        return next((c for c in self.cells if c.rashi == rashi), None)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

Point = tuple[float, float]


def _north_indian_polygons() -> dict[int, tuple[Point, ...]]:
    """The twelve regions of the diamond, keyed by house.

    Construction: the outer square, both diagonals, and the diamond joining the
    four side midpoints. The diagonals cut the diamond into four kites (houses 1,
    4, 7, 10) and the square's corners into eight triangles.

    Houses run **anticlockwise** from the top kite, which is the North Indian
    convention: 1 top, 2 upper-left, 3 left-upper, 4 left, and so on.
    """
    lo, hi = PAD, CANVAS - PAD
    mid = (lo + hi) / 2.0
    quarter_lo = lo + (hi - lo) / 4.0
    quarter_hi = lo + 3.0 * (hi - lo) / 4.0

    tl, tr, br, bl = (lo, lo), (hi, lo), (hi, hi), (lo, hi)
    top, right, bottom, left = (mid, lo), (hi, mid), (mid, hi), (lo, mid)
    centre = (mid, mid)
    # Where the diagonals cross the diamond's four edges.
    nw, ne = (quarter_lo, quarter_lo), (quarter_hi, quarter_lo)
    se, sw = (quarter_hi, quarter_hi), (quarter_lo, quarter_hi)

    return {
        1: (top, nw, centre, ne),
        2: (tl, top, nw),
        3: (tl, nw, left),
        4: (left, nw, centre, sw),
        5: (bl, left, sw),
        6: (bl, sw, bottom),
        7: (bottom, sw, centre, se),
        8: (br, bottom, se),
        9: (br, se, right),
        10: (right, se, centre, ne),
        11: (tr, right, ne),
        12: (tr, ne, top),
    }


def _centroid(points: tuple[Point, ...]) -> Point:
    return (
        sum(p[0] for p in points) / len(points),
        sum(p[1] for p in points) / len(points),
    )


#: Manual nudges, as a fraction of the canvas, pulling a label off the outer edge
#: of its region toward the chart centre. A plain centroid puts the corner
#: triangles' text too close to the border to read at A4.
_NORTH_LABEL_NUDGE: Final[dict[int, Point]] = {
    1: (0.0, 0.045),
    2: (0.02, 0.02),
    3: (0.03, 0.0),
    4: (0.045, 0.0),
    5: (0.03, 0.0),
    6: (0.02, -0.02),
    7: (0.0, -0.045),
    8: (-0.02, -0.02),
    9: (-0.03, 0.0),
    10: (-0.045, 0.0),
    11: (-0.03, 0.0),
    12: (-0.02, 0.02),
}


def _south_indian_cells() -> dict[int, tuple[Point, float, float]]:
    """Rashi -> (top-left, width, height) for the 4x4 grid's twelve outer cells."""
    lo, hi = PAD, CANVAS - PAD
    step = (hi - lo) / 4.0
    out: dict[int, tuple[Point, float, float]] = {}
    for row, cells in enumerate(SOUTH_INDIAN_GRID):
        for col, rashi in enumerate(cells):
            if rashi is None:
                continue
            out[rashi] = ((lo + col * step, lo + row * step), step, step)
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

#: ``text { fill: currentColor }`` is load-bearing, not tidiness. SVG text has an
#: initial ``fill`` of black and does *not* inherit the page's ``color``, so while
#: the frame and the diagonals followed the theme through ``stroke: currentColor``,
#: every graha glyph and both chart captions stayed black - invisible on dark
#: paper, in the one element of the sheet a reader looks at first. Measured 1.12:1
#: against ``--paper`` in dark mode. Standalone, where the page tokens are out of
#: scope, ``currentColor`` resolves to black exactly as before.
#:
#: The rashi number and the Ashtakavarga total recede behind the graha glyphs, and
#: they used to do it with ``opacity: 0.55`` and ``0.5`` over that same black fill -
#: which meant that on dark paper they were a faded black on near-black, and the
#: recession was total. ``--ink-muted`` is the token that exists for exactly this
#: (6.15:1 light, 5.52:1 dark): it recedes by hue rather than by dissolving into the
#: paper, and it holds in both themes. Measured after the change: 6.72:1 light,
#: 5.96:1 dark. The literal fallback is for the SVG served standalone, where the
#: page tokens are not in scope.
_STYLE: Final[str] = """
text { fill: currentColor; }
.k-frame { fill: none; stroke: currentColor; stroke-width: 1.6; }
.k-line  { fill: none; stroke: currentColor; stroke-width: 1.1; }
.k-house { fill: none; }
.k-rashi { font-size: 13px; fill: var(--ink-muted, #5c544a); }
.k-graha { font-size: 15px; }
.k-lagna { font-size: 13px; font-weight: 700; }
.k-sav   { font-size: 11px; fill: var(--ink-muted, #5c544a); }
.k-title { font-size: 15px; font-weight: 600; }
""".strip()


def _text(
    x: float,
    y: float,
    content: str,
    cls: str,
    anchor: str = "middle",
    house: int | None = None,
) -> str:
    """One text mark. ``house`` tags it for the draw-in's ordering.

    DESIGN.md §4.1 staggers the graha glyphs "by house order 1->12, never random -
    the order itself teaches the reading sequence". Document order in the SVG is
    house order already, but that is an accident of how the cells are emitted; the
    attribute makes the ordering explicit and survives a change to the loop.
    """
    return _markup(x, y, html.escape(content), cls, anchor, house)


def _markup(
    x: float,
    y: float,
    inner: str,
    cls: str,
    anchor: str = "middle",
    house: int | None = None,
) -> str:
    """As :func:`_text`, but ``inner`` is already-escaped markup.

    The only caller passing markup is :func:`_graha_lines`, which nests one
    ``<tspan>`` per graha; escaping happens there, per graha, so nothing raw
    reaches this.
    """
    tag = f' data-house="{house}"' if house is not None else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}"{tag}>{inner}</text>'


def _graha_lines(
    cell: HouseCell,
    x: float,
    y: float,
    *,
    show_degrees: bool,
    line_height: float = 16.0,
    numerals: Callable[[str], str] = str,
) -> list[str]:
    """Stacked graha labels, centred on ``(x, y)``.

    Up to three per line so a stellium in one house stays inside its region rather
    than overflowing into the next - the failure that makes a hand-built chart look
    broken at A4.
    """
    if not cell.grahas:
        return []
    per_line = 3 if len(cell.grahas) > 4 else 2
    chunks = [cell.grahas[i : i + per_line] for i in range(0, len(cell.grahas), per_line)]
    start = y - (len(chunks) - 1) * line_height / 2.0
    out: list[str] = []
    for index, chunk in enumerate(chunks):
        # One <tspan> per graha, rather than one joined string.
        #
        # The line still lays out as a single anchored <text>, so the printed
        # geometry is unchanged - but each graha becomes an element the browser
        # can measure. DESIGN.md §4.2 moves each graha from its D1 house to its
        # D9 house individually, and a label reading "र बु" is one node with
        # two grahas in it and no way to send them to different places.
        spans = f"{NBSP}".join(
            f'<tspan data-graha="{html.escape(g.key)}">'
            f"{html.escape(g.render_label(show_degrees=show_degrees))}</tspan>"
            for g in chunk
        )
        out.append(_markup(x, start + index * line_height, spans, "k-graha", house=cell.house))
    return out


def render_north_indian(
    data: ChartData,
    *,
    show_degrees: bool = False,
    show_sav: bool = False,
    numerals: Callable[[str], str] = str,
) -> str:
    """The North Indian diamond. Fixed houses, rotating signs."""
    polygons = _north_indian_polygons()
    lo, hi = PAD, CANVAS - PAD
    mid = (lo + hi) / 2.0

    parts: list[str] = [
        f'<rect x="{lo:.1f}" y="{lo:.1f}" width="{hi - lo:.1f}" '
        f'height="{hi - lo:.1f}" class="k-frame"/>',
        f'<line x1="{lo:.1f}" y1="{lo:.1f}" x2="{hi:.1f}" y2="{hi:.1f}" class="k-line"/>',
        f'<line x1="{hi:.1f}" y1="{lo:.1f}" x2="{lo:.1f}" y2="{hi:.1f}" class="k-line"/>',
        f'<polygon points="{mid:.1f},{lo:.1f} {hi:.1f},{mid:.1f} '
        f'{mid:.1f},{hi:.1f} {lo:.1f},{mid:.1f}" class="k-line"/>',
    ]

    for house in range(1, 13):
        cell = data.cell_for_house(house)
        points = polygons[house]
        cx, cy = _centroid(points)
        dx, dy = _NORTH_LABEL_NUDGE[house]
        cx += dx * CANVAS
        cy += dy * CANVAS

        # An invisible polygon per house, so a wrapper can attach a click target
        # and a screen reader gets a labelled region.
        label = f"{_ordinal(house)} house, {data.rashi_labels.get(cell.rashi, cell.rashi)}"
        parts.append(
            f'<polygon points="{_points(points)}" class="k-house" '
            f'data-house="{house}" data-rashi="{cell.rashi}">'
            f"<title>{html.escape(label)}</title></polygon>"
        )
        # The rashi number sits above the grahas: the sign rotates in this layout,
        # so it must be printed rather than inferred from position.
        parts.append(_text(cx, cy - 14.0, numerals(str(cell.rashi)), "k-rashi"))
        parts.extend(_graha_lines(cell, cx, cy + 4.0, show_degrees=show_degrees, numerals=numerals))
        if show_sav and cell.sav is not None:
            parts.append(_text(cx, cy + 22.0, numerals(str(cell.sav)), "k-sav"))
        if cell.rashi == data.lagna_rashi:
            parts.append(_text(cx, cy - 26.0, "▲", "k-lagna"))

    return _document(data, parts, ChartStyle.NORTH_INDIAN)


def render_south_indian(
    data: ChartData,
    *,
    show_degrees: bool = False,
    show_sav: bool = False,
    numerals: Callable[[str], str] = str,
) -> str:
    """The South Indian square. Fixed signs, rotating houses."""
    cells = _south_indian_cells()
    lo, hi = PAD, CANVAS - PAD
    parts: list[str] = [
        f'<rect x="{lo:.1f}" y="{lo:.1f}" width="{hi - lo:.1f}" '
        f'height="{hi - lo:.1f}" class="k-frame"/>'
    ]

    for rashi, ((x, y), width, height) in sorted(cells.items()):
        cell = data.cell_for_rashi(rashi)
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
            f'class="k-line"/>'
        )
        cx, cy = x + width / 2.0, y + height / 2.0
        house_label = f"{_ordinal(cell.house)} house" if cell else "empty"
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
            f'class="k-house" data-rashi="{rashi}" '
            f'data-house="{cell.house if cell else ""}">'
            f"<title>{html.escape(f'{data.rashi_labels.get(rashi, rashi)}, {house_label}')}"
            f"</title></rect>"
        )
        # The house number is what rotates here, so it is the printed label.
        if cell is not None:
            parts.append(
                _text(x + 5.0, y + 15.0, numerals(str(cell.house)), "k-rashi", anchor="start")
            )
            parts.extend(
                _graha_lines(cell, cx, cy + 2.0, show_degrees=show_degrees, numerals=numerals)
            )
            if show_sav and cell.sav is not None:
                parts.append(
                    _text(
                        x + width - 5.0, y + height - 6.0, numerals(str(cell.sav)), "k-sav", "end"
                    )
                )
            if rashi == data.lagna_rashi:
                parts.append(_text(x + width - 8.0, y + 15.0, "▲", "k-lagna", "end"))

    return _document(data, parts, ChartStyle.SOUTH_INDIAN)


def render(
    data: ChartData,
    style: ChartStyle = ChartStyle.NORTH_INDIAN,
    *,
    show_degrees: bool = False,
    show_sav: bool = False,
    numerals: Callable[[str], str] = str,
) -> str:
    """Render in the requested style. North Indian is the default (CLAUDE.md 8)."""
    if style is ChartStyle.NORTH_INDIAN:
        return render_north_indian(
            data, show_degrees=show_degrees, show_sav=show_sav, numerals=numerals
        )
    return render_south_indian(
        data, show_degrees=show_degrees, show_sav=show_sav, numerals=numerals
    )


def _document(data: ChartData, parts: list[str], style: ChartStyle) -> str:
    """Wrap the drawing in a self-contained, accessible SVG root.

    ``role="img"`` with a title and description, because the shapes alone convey
    nothing to a screen reader. The full accessible content is the table from
    :func:`render_table`, which the page pairs with this (CLAUDE.md 8).
    """
    description = f"{data.title}. " + "; ".join(
        f"{_ordinal(c.house)} house {data.rashi_labels.get(c.rashi, c.rashi)}"
        + (" holds " + ", ".join(g.label for g in c.grahas) if c.grahas else " empty")
        for c in sorted(data.cells, key=lambda c: c.house)
    )
    body = "\n  ".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {CANVAS:.0f} {CANVAS + TITLE_BAND:.0f}" '
        f'role="img" aria-labelledby="k-title-{style.value}" '
        f'data-chart-style="{style.value}" class="kundali kundali--{style.value}">\n'
        f'  <title id="k-title-{style.value}">{html.escape(data.title)}</title>\n'
        f"  <desc>{html.escape(description)}</desc>\n"
        f"  <style>{_STYLE}</style>\n"
        f"  {body}\n"
        f"  {_text(CANVAS / 2.0, CANVAS + TITLE_BAND - 9.0, data.title, 'k-title')}\n"
        f"</svg>"
    )


def _points(points: tuple[Point, ...]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def _ordinal(n: int) -> str:
    """1st, 2nd, 3rd ... Used only inside accessibility text, so English is right:
    a screen reader reading the localised page gets the localised table instead."""
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


# ---------------------------------------------------------------------------
# The accessible alternative (CLAUDE.md 8)
# ---------------------------------------------------------------------------


def render_table(
    data: ChartData,
    *,
    headers: tuple[str, str, str] | None = None,
    numerals: Callable[[str], str] = str,
) -> str:
    """A semantic HTML table carrying the same information as the chart.

    CLAUDE.md 8 requires this: a diamond of SVG polygons is unreadable to a screen
    reader however well titled. The table is the alternative, not a supplement, so
    it carries every graha, its retrogression and its degree.

    ``headers`` should be localised by the caller; the fallback is English.
    """
    house_h, rashi_h, graha_h = headers or ("House", "Rashi", "Grahas")
    rows: list[str] = []
    for cell in sorted(data.cells, key=lambda c: c.house):
        grahas = (
            ", ".join(g.render_label(show_degrees=True, numerals=numerals) for g in cell.grahas)
            or "—"
        )
        lagna = " ▲" if cell.rashi == data.lagna_rashi else ""
        rows.append(
            "<tr>"
            f'<th scope="row">{numerals(str(cell.house))}{lagna}</th>'
            f"<td>{html.escape(data.rashi_labels.get(cell.rashi, numerals(str(cell.rashi))))}</td>"
            f"<td>{html.escape(grahas)}</td>"
            "</tr>"
        )
    body = "\n    ".join(rows)
    return (
        f'<table class="kundali-table">\n'
        f"  <caption>{html.escape(data.title)}</caption>\n"
        f"  <thead><tr>"
        f'<th scope="col">{html.escape(house_h)}</th>'
        f'<th scope="col">{html.escape(rashi_h)}</th>'
        f'<th scope="col">{html.escape(graha_h)}</th>'
        f"</tr></thead>\n"
        f"  <tbody>\n    {body}\n  </tbody>\n"
        f"</table>"
    )


def _is_devanagari(text: str) -> bool:
    return any("ऀ" <= ch <= "ॿ" for ch in text)

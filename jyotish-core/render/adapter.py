"""Turn ChartFacts into localised drawing data.

This is the layer where machine keys become strings (CLAUDE.md 5: locale files map
keys to mr/hi/en). It reads ChartFacts and the glossary and produces
:class:`~render.chart_svg.ChartData`; it computes nothing.

The one thing it derives is *house from rashi* for a varga chart, which is a
subtraction of two integers already in the document, not an astronomical
computation.
"""

from __future__ import annotations

from typing import Any

from api.locale import load_glossary, term
from render.chart_svg import ChartData, ChartStyle, GrahaMark, HouseCell

#: Order used when several grahas share a house, so the sheet is stable between
#: renders and the snapshot tests are meaningful.
GRAHA_ORDER: tuple[str, ...] = (
    "sun",
    "moon",
    "mars",
    "mercury",
    "jupiter",
    "venus",
    "saturn",
    "rahu",
    "ketu",
)


def rashi_labels(locale: str) -> dict[int, str]:
    """1-based rashi number to its localised name."""
    glossary = load_glossary(locale)["rashi"]
    keys = (
        "mesha",
        "vrishabha",
        "mithuna",
        "karka",
        "simha",
        "kanya",
        "tula",
        "vrishchika",
        "dhanu",
        "makara",
        "kumbha",
        "meena",
    )
    return {index + 1: glossary.get(key, key) for index, key in enumerate(keys)}


def _graha_marks(
    entries: list[dict[str, Any]], locale: str, *, rashi_key: str
) -> dict[int, list[GrahaMark]]:
    """Group grahas by the rashi they occupy in the requested chart."""
    abbr = load_glossary(locale).get("graha_abbr", {})
    by_rashi: dict[int, list[GrahaMark]] = {}
    ordered = sorted(
        entries,
        key=lambda g: GRAHA_ORDER.index(g["key"]) if g["key"] in GRAHA_ORDER else 99,
    )
    for graha in ordered:
        rashi = int(graha[rashi_key])
        by_rashi.setdefault(rashi, []).append(
            GrahaMark(
                key=graha["key"],
                label=abbr.get(graha["key"], graha["key"][:2].title()),
                retrograde=bool(graha.get("retrograde", False)),
                combust=bool(graha.get("combust", False)),
                deg_in_rashi=graha.get("deg_in_rashi"),
            )
        )
    return by_rashi


def rashi_chart(facts: dict[str, Any], locale: str, title: str | None = None) -> ChartData:
    """The D1 chart from ChartFacts."""
    chart = facts["chart"]
    lagna_rashi = int(chart["lagna"]["rashi"])
    by_rashi = _graha_marks(chart["grahas"], locale, rashi_key="rashi")
    sav = chart.get("ashtakavarga", {}).get("sarva", [])

    cells = []
    for house in range(1, 13):
        rashi = (lagna_rashi - 1 + house - 1) % 12 + 1
        cells.append(
            HouseCell(
                house=house,
                rashi=rashi,
                grahas=tuple(by_rashi.get(rashi, ())),
                sav=sav[rashi - 1] if len(sav) == 12 else None,
            )
        )
    return ChartData(
        cells=tuple(cells),
        lagna_rashi=lagna_rashi,
        title=title or term(locale, "chart", "rashi_chart"),
        rashi_labels=rashi_labels(locale),
    )


def varga_chart(
    facts: dict[str, Any], varga: str, locale: str, title: str | None = None
) -> ChartData:
    """A divisional chart, drawn from **its own** lagna.

    A D9 drawn against the D1 ascendant is the classic error, and ChartFacts
    supplies each varga's own ``lagna_rashi`` precisely so it cannot happen here.
    """
    chart = facts["chart"]
    vargas = chart.get("vargas", {})
    if varga not in vargas:
        raise KeyError(f"ChartFacts carries no {varga} chart; available: {sorted(vargas)}")
    lagna_rashi = int(vargas[varga]["lagna_rashi"])

    entries = [
        {
            "key": graha["key"],
            "rashi": int(graha["vargas"][varga]),
            "retrograde": graha.get("retrograde", False),
            "combust": graha.get("combust", False),
            # Degrees are a D1 quantity; a varga places a graha in a sign, not at a
            # degree, so they are deliberately omitted here.
            "deg_in_rashi": None,
        }
        for graha in chart["grahas"]
    ]
    by_rashi = _graha_marks(entries, locale, rashi_key="rashi")

    cells = [
        HouseCell(
            house=house,
            rashi=(lagna_rashi - 1 + house - 1) % 12 + 1,
            grahas=tuple(by_rashi.get((lagna_rashi - 1 + house - 1) % 12 + 1, ())),
        )
        for house in range(1, 13)
    ]
    default_title = term(locale, "chart", "navamsa_chart") if varga == "D9" else f"{varga}"
    return ChartData(
        cells=tuple(cells),
        lagna_rashi=lagna_rashi,
        title=title or default_title,
        rashi_labels=rashi_labels(locale),
    )


def chart_style_from_string(value: str | None) -> ChartStyle:
    """Parse a style parameter, defaulting to the Maharashtra convention."""
    if value is None:
        return ChartStyle.NORTH_INDIAN
    try:
        return ChartStyle(value)
    except ValueError as exc:
        raise ValueError(
            f"unknown chart style {value!r}; known: {[s.value for s in ChartStyle]}"
        ) from exc

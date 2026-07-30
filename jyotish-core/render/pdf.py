"""The printable kundali sheet (CLAUDE.md 8: "PDF export ... locale-aware").

CLAUDE.md 2.2 is specific about the risk: "WeasyPrint with Devanagari-capable font
embedding (test ligature and matra rendering explicitly - **this breaks
silently**)."

Silently is the operative word. A missing glyph renders as a blank or a tofu box,
the PDF is produced without error, and nobody notices until a Marathi user opens
it. Two defences:

1. :func:`assert_devanagari_coverage` checks the bundled font actually contains
   every codepoint the locale files use, *before* rendering. It is called on every
   render of an mr/hi sheet.
2. :func:`extract_text` pulls the text layer back out of the produced PDF, so a
   test can assert that a conjunct and a matra survived the round trip rather than
   trusting that the render "looked fine".

The font is bundled rather than fetched: ``render/fonts/`` holds Noto Sans
Devanagari, self-hosted as CLAUDE.md 2.2 requires.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from api.locale import disclaimer, finding_label, load_glossary
from core.angles import format_dm
from render.adapter import rashi_chart, varga_chart
from render.chart_svg import ChartStyle, render, render_table
from render.numerals import numeral_formatter

FONTS_DIR: Final[Path] = Path(__file__).resolve().parent / "fonts"
DEVANAGARI_FONT: Final[Path] = FONTS_DIR / "NotoSansDevanagari-Variable.ttf"

#: A4 with a 14 mm margin: the traditional sheet is dense, and a wider margin
#: pushes the Navamsa chart onto a second page.
PAGE_CSS: Final[str] = """
@page {
  size: A4;
  margin: 14mm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; opacity: 0.6; }
}
""".strip()


class PdfError(RuntimeError):
    """The PDF could not be produced, or the font cannot render the locale."""


@dataclass(frozen=True, slots=True)
class GlyphCoverage:
    """Which codepoints of a sample the font can actually draw."""

    font: Path
    missing: tuple[str, ...]
    checked: int

    @property
    def complete(self) -> bool:
        return not self.missing


@lru_cache(maxsize=4)
def _font_codepoints(font_path: str) -> frozenset[int]:
    """Every codepoint in the font's cmap.

    Uses fontTools, which WeasyPrint already depends on, so this adds no
    dependency of its own.
    """
    try:
        from fontTools.ttLib import TTFont
    except ImportError as exc:  # pragma: no cover - fontTools ships with WeasyPrint
        raise PdfError("fontTools is required to verify glyph coverage") from exc
    with TTFont(font_path, lazy=True) as font:
        covered: set[int] = set()
        for table in font["cmap"].tables:
            covered.update(table.cmap.keys())
    return frozenset(covered)


def locale_sample_text(locale: str) -> str:
    """Every distinct character the locale files can put on a page.

    Built from the locale JSON rather than from a hand-written pangram: a
    hand-written sample proves only that the sample renders, whereas this proves
    that everything the product can actually print renders.
    """
    payload = json.dumps(load_glossary(locale), ensure_ascii=False)
    return "".join(sorted(set(payload)))


def assert_devanagari_coverage(locale: str, font_path: Path = DEVANAGARI_FONT) -> GlyphCoverage:
    """Verify the font covers the locale's characters. Raises if it does not.

    Latin, digits and punctuation are excluded: they come from the fallback font,
    and a Devanagari font is not expected to carry the whole of Latin.
    """
    if not font_path.exists():
        raise PdfError(
            f"no Devanagari font at {font_path}. CLAUDE.md 2.2 requires a "
            "self-hosted Devanagari-capable font for the PDF pipeline."
        )
    covered = _font_codepoints(str(font_path))
    sample = locale_sample_text(locale)
    missing = tuple(
        ch for ch in sample if ("ऀ" <= ch <= "ॿ" or "‌" <= ch <= "‍") and ord(ch) not in covered
    )
    coverage = GlyphCoverage(font=font_path, missing=missing, checked=len(sample))
    if not coverage.complete:
        raise PdfError(
            f"font {font_path.name} cannot render {len(missing)} character(s) used by "
            f"locale {locale!r}: {''.join(missing)!r}. This is the silent-failure "
            "mode CLAUDE.md 2.2 warns about - the PDF would render blanks."
        )
    return coverage


def _font_face_css() -> str:
    """An ``@font-face`` pointing at the bundled file.

    A ``file://`` URL rather than a data URI: WeasyPrint reads it directly, and a
    650 kB base64 blob in every render would be wasteful.
    """
    return f"""
@font-face {{
  font-family: 'Noto Sans Devanagari';
  src: url('file://{DEVANAGARI_FONT}');
  font-weight: 100 900;
}}
""".strip()


BASE_CSS: Final[str] = """
:root { --ink: #1a1a1a; --rule: #b9b1a4; --muted: #6b6459; }
* { box-sizing: border-box; }
body {
  color: var(--ink);
  font-family: 'Noto Sans Devanagari', 'DejaVu Sans', sans-serif;
  font-size: 9.5pt;
  line-height: 1.45;
  margin: 0;
}
h1 { font-size: 16pt; margin: 0 0 2mm; }
h2 { font-size: 11pt; margin: 5mm 0 1.5mm; border-bottom: 0.4pt solid var(--rule);
     padding-bottom: 1mm; }
.sheet-head { display: flex; justify-content: space-between; align-items: flex-end;
              border-bottom: 1pt solid var(--ink); padding-bottom: 2mm; }
.sheet-head .meta { text-align: right; font-size: 8.5pt; color: var(--muted); }
.charts { display: flex; gap: 6mm; margin-top: 3mm; }
.charts figure { flex: 1; margin: 0; }
.charts svg { width: 100%; height: auto; color: var(--ink); }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
th, td { text-align: left; padding: 0.9mm 1.6mm; border-bottom: 0.3pt solid var(--rule); }
thead th { border-bottom: 0.6pt solid var(--ink); font-weight: 600; }
caption { text-align: left; font-weight: 600; padding-bottom: 1mm; }
.grid2 { display: flex; gap: 6mm; }
.grid2 > * { flex: 1; }
.banner { border: 0.6pt solid var(--ink); padding: 2mm 2.5mm; margin: 3mm 0;
          background: #f6f3ec; font-size: 8.5pt; }
.banner ul { margin: 1mm 0 0; padding-left: 5mm; }
.disclaimer { margin-top: 5mm; padding-top: 2mm; border-top: 0.4pt solid var(--rule);
              font-size: 7.5pt; color: var(--muted); }
.evidence { color: var(--muted); font-size: 8pt; }
.page-break { break-before: page; }
""".strip()


def _kv_table(caption: str, rows: list[tuple[str, str]]) -> str:
    body = "\n".join(
        f'<tr><th scope="row">{k}</th><td>{v}</td></tr>' for k, v in rows if v not in ("", None)
    )
    return f"<table><caption>{caption}</caption><tbody>{body}</tbody></table>"


def _local(node: dict[str, Any] | None, field: str = "time") -> str:
    """Read an engine-computed local rendering, or an em dash."""
    if not isinstance(node, dict):
        return "—"
    return str(node.get(field, "—"))


def build_sheet_html(
    facts: dict[str, Any],
    locale: str,
    *,
    style: ChartStyle = ChartStyle.NORTH_INDIAN,
    narrative: dict[str, str] | None = None,
) -> str:
    """The kundali sheet as a standalone HTML document.

    Returned as HTML rather than only as bytes so the same markup can be inspected
    in a browser, snapshot-tested, and handed to WeasyPrint - three uses, one
    template.
    """
    from narrative.projection import project

    glossary = load_glossary(locale)
    num = numeral_formatter(locale)
    ui, chart_terms, panchang_terms = glossary["ui"], glossary["chart"], glossary["panchang"]
    has_chart = "chart" in facts
    panchang = project(facts, "panchang")["panchang"]
    hindu = panchang["hindu_date"]
    born_at = num(facts["input"]["time"]) if facts["input"]["time"] else ui["not_available"]

    head = f"""
<div class="sheet-head">
  <div>
    <h1>{facts["input"]["name"]}</h1>
    <div>{ui["date_of_birth"]}: {num(facts["input"]["date"])}
      &middot; {ui["time_of_birth"]}: {born_at}
      &middot; {ui["place_of_birth"]}: {facts["input"]["place"]["name"]}</div>
  </div>
  <div class="meta">
    {panchang_terms["shaka_year"]} {num(hindu["shaka_year"])}
      &middot; {glossary["month"].get(hindu["month_display_key"], hindu["month_key"])}
      &middot; {panchang_terms[hindu["paksha"]]}<br>
    {chart_terms["ayanamsa"]}: {facts["ephemeris"]["ayanamsa"]}
      ({num(f"{facts['ephemeris']['ayanamsa_value_deg']:.4f}")}°)<br>
    engine {facts["engine_version"]} &middot; {facts["authority"]}
  </div>
</div>
""".strip()

    banner = ""
    if facts["confidence"]["birth_time"] != "exact" or facts["confidence"]["warnings"]:
        label = (
            ui["birth_time_unknown"]
            if facts["confidence"]["birth_time"] == "unknown"
            else ui["birth_time_approximate"]
        )
        items = "".join(f"<li>{f}</li>" for f in facts["confidence"]["affected_fields"])
        # The warnings themselves, which this banner previously triggered on and
        # then did not print - so a pre-1955 birth produced a banner that said
        # nothing about why (audit F-004). A sheet has no affordance to tap, so the
        # sentence goes on the page.
        warning_terms = glossary["warning"]
        warnings = "".join(
            f"<li>{warning_terms.get(key, key)}</li>" for key in facts["confidence"]["warnings"]
        )
        body = f"<div>{ui['affected_fields']}:</div><ul>{items}</ul>" if items else ""
        if warnings:
            body += f"<ul>{warnings}</ul>"
        banner = f'<div class="banner"><strong>{label}</strong>{body}</div>'

    charts = ""
    if has_chart:
        d1 = render(
            rashi_chart(facts, locale), style, show_degrees=False, show_sav=True, numerals=num
        )
        d9 = render(varga_chart(facts, "D9", locale), style, numerals=num)
        # CLAUDE.md 8: "Rashi and Navamsa charts side by side."
        charts = f'<div class="charts"><figure>{d1}</figure><figure>{d9}</figure></div>'

    panchang_rows = [
        (panchang_terms["tithi"], _tithi_line(panchang, glossary, "at_sunrise", num)),
        (panchang_terms["nakshatra"], _nak_line(panchang, glossary, "at_sunrise", num)),
        (panchang_terms["yoga"], _limb_line(panchang, glossary, "yoga", "at_sunrise", num)),
        (panchang_terms["karana"], _limb_line(panchang, glossary, "karana", "at_sunrise", num)),
        (panchang_terms["vara"], glossary["vara"].get(panchang["vara"]["key"], "")),
        (panchang_terms["sunrise"], num(_local(panchang.get("sunrise_local")))),
        (panchang_terms["sunset"], num(_local(panchang.get("sunset_local")))),
        (
            panchang_terms["rahu_kaal"],
            num(
                f"{_local(panchang['rahu_kaal'].get('start_local'))}"
                f"–{_local(panchang['rahu_kaal'].get('end_local'))}"
            ),
        ),
        (
            panchang_terms["abhijit_muhurta"],
            num(
                f"{_local(panchang['abhijit_muhurta'].get('start_local'))}"
                f"–{_local(panchang['abhijit_muhurta'].get('end_local'))}"
            ),
        ),
        (panchang_terms["dinamana"], _ghati_span(panchang, "dinamana", panchang_terms, num)),
        (panchang_terms["ratrimana"], _ghati_span(panchang, "ratrimana", panchang_terms, num)),
        (panchang_terms["ritu"], glossary["panchang"].get(panchang["ritu"]["key"], "")),
        (panchang_terms["ayana"], panchang_terms[panchang["ayana"]]),
    ]
    if "ishtakaal" in panchang:
        ik = panchang["ishtakaal"]
        panchang_rows.append(
            (
                panchang_terms["ishtakaal"],
                f"{num(ik['ghati'])} {panchang_terms['ghati']} "
                f"{num(ik['pala'])} {panchang_terms['pala']}",
            )
        )
    if panchang.get("tithi_at_birth"):
        panchang_rows.insert(
            1,
            (
                f"{panchang_terms['tithi']} ({ui['time_of_birth']})",
                _tithi_line(panchang, glossary, "at_birth", num),
            ),
        )

    sections = [head, banner, charts]
    sections.append(
        f'<h2>{panchang_terms["panchang"]}</h2><div class="grid2">'
        f"{_kv_table('', panchang_rows[: len(panchang_rows) // 2])}"
        f"{_kv_table('', panchang_rows[len(panchang_rows) // 2 :])}</div>"
    )

    sections.append(_name_section(facts, locale))

    if has_chart:
        sections.append(f"<h2>{chart_terms['kundali']}</h2>{_graha_table(facts, locale)}")
        sections.append(
            f"<h2>{chart_terms['rashi_chart']}</h2>"
            + render_table(
                rashi_chart(facts, locale),
                headers=(
                    chart_terms["house"],
                    chart_terms["rashi_chart"],
                    "ग्रह" if locale in ("mr", "hi") else "Grahas",
                ),
                numerals=num,
            )
        )
    if "dasha" in facts:
        sections.append(f"<h2>{glossary['dasha']['dasha']}</h2>{_dasha_table(facts, locale)}")
    if facts.get("yogas_present") or facts.get("doshas"):
        sections.append(f"<h2>{chart_terms['kundali']}</h2>{_findings_table(facts, locale)}")
    if narrative:
        sections.append(_narrative_section(narrative, glossary))

    sections.append(f'<div class="disclaimer">{disclaimer(locale)}</div>')

    return f"""<!DOCTYPE html>
<html lang="{locale}">
<head>
<meta charset="utf-8">
<title>{facts["input"]["name"]} — {chart_terms["kundali"]}</title>
<style>{_font_face_css()}
{PAGE_CSS}
{BASE_CSS}</style>
</head>
<body>
{"".join(s for s in sections if s)}
</body>
</html>"""


def _tithi_line(
    panchang: dict[str, Any], glossary: dict[str, Any], which: str, num: Any = str
) -> str:
    node = panchang.get(f"tithi_{which}")
    if not node:
        return "—"
    name = glossary["tithi"].get(node["key"], node["key"])
    return f"{name} ({num(_local(node.get('end_local')))})"


def _nak_line(
    panchang: dict[str, Any], glossary: dict[str, Any], which: str, num: Any = str
) -> str:
    node = panchang.get(f"nakshatra_{which}")
    if not node:
        return "—"
    name = glossary["nakshatra"].get(node["key"], node["key"])
    return f"{name} {num(node['pada'])} ({num(_local(node.get('end_local')))})"


def _limb_line(
    panchang: dict[str, Any], glossary: dict[str, Any], kind: str, which: str, num: Any = str
) -> str:
    node = panchang.get(f"{kind}_{which}")
    if not node:
        return "—"
    name = glossary[kind].get(node["key"], node["key"])
    return f"{name} ({num(_local(node.get('end_local')))})"


def _ghati_span(panchang: dict[str, Any], key: str, terms: dict[str, str], num: Any) -> str:
    """दिनमान or रात्रीमान in ghati-pala. Empty if the engine did not emit it."""
    span = panchang.get("day_night_length", {}).get(key)
    if not span:
        return ""
    return f"{num(span['ghati'])} {terms['ghati']} {num(span['pala'])} {terms['pala']}"


def _name_section(facts: dict[str, Any], locale: str) -> str:
    """नामकरण syllables, and numerology in its own clearly-labelled block.

    CLAUDE.md 3.6 gives `name` three honest uses and the engine computed all
    three; the sheet printed only the first, so the Namakaran check reached
    ChartFacts and stopped there (audit F-013).

    Numerology is separated and labelled "not Jyotish" because CLAUDE.md 3.6 asks
    for exactly that, and it prints "not applicable" rather than a total for a
    Devanagari name - both systems value Latin letters only, so a zero would read
    as a result (audit F-025).
    """
    name_block = facts.get("name")
    if not name_block:
        return ""
    glossary = load_glossary(locale)
    ui, num = glossary["ui"], numeral_formatter(locale)
    rows: list[tuple[str, str]] = []

    nk = name_block.get("namakaran")
    if nk:
        nak = glossary["nakshatra"].get(nk["nakshatra_key"], nk["nakshatra_key"])
        rows += [
            (
                ui["namakaran_pada_syllable"],
                f"{nk['pada_syllable']} ({nak} {ui.get('pada', '')} {num(nk['pada'])})".replace(
                    "  ", " "
                ),
            ),
            (ui["namakaran_syllables"], ", ".join(nk["nakshatra_syllables"])),
            (ui["namakaran_match"], glossary["common"]["yes" if nk["matches_pada"] else "no"]),
        ]

    numerology = name_block.get("numerology", {})
    for system in ("chaldean", "pythagorean"):
        reading = numerology.get(system)
        if not reading:
            continue
        value = (
            f"{num(reading['raw_total'])} → {num(reading['reduced'])}"
            if reading.get("applicable")
            else ui["not_applicable_to_script"]
        )
        rows.append((f"{ui['numerology']} · {system}", value))

    if not rows:
        return ""
    return f"<h2>{ui['namakaran']}</h2>{_kv_table('', rows)}"


def _graha_table(facts: dict[str, Any], locale: str) -> str:
    glossary = load_glossary(locale)
    num = numeral_formatter(locale)
    graha_names = glossary["graha"]
    rashi_names = glossary["rashi"]
    nak_names = glossary["nakshatra"]
    chart_terms = glossary["chart"]
    rows = []
    for graha in facts["chart"]["grahas"]:
        markers = []
        if graha["retrograde"]:
            markers.append(chart_terms["retrograde"])
        if graha["combust"]:
            markers.append(chart_terms["combust"])
        bala = graha.get("shadbala", {}).get("total_rupa")
        rows.append(
            "<tr>"
            f'<th scope="row">{graha_names.get(graha["key"], graha["key"])}</th>'
            # ग्रहस्पष्ट in rashi-degree-minute, which is what a patrika prints.
            # Decimal degrees are the giveaway that a sheet came out of software
            # (audit F-010); the formatter has existed in core/angles.py all along.
            f"<td>{rashi_names.get(graha['rashi_key'], graha['rashi_key'])}"
            f" {num(format_dm(graha['deg_in_rashi']))}</td>"
            f"<td>{num(graha['house_whole_sign'])}</td>"
            f"<td>{num(graha['house_chalit'])}</td>"
            f"<td>{nak_names.get(graha['nakshatra_key'], graha['nakshatra_key'])}"
            f" {num(graha['pada'])}</td>"
            f"<td>{chart_terms.get(graha['dignity'], graha['dignity'])}</td>"
            f"<td>{'' if bala is None else num(f'{bala:.2f}')}</td>"
            f"<td>{', '.join(markers)}</td>"
            "</tr>"
        )
    return (
        f"<table><thead><tr><th>{glossary['graha'].get('sun', 'Graha')[:0] or ''}ग्रह</th>"
        if locale in ("mr", "hi")
        else "<table><thead><tr><th>Graha</th>"
    ) + (
        f"<th>{chart_terms['rashi_chart']}</th>"
        f"<th>{chart_terms['house']}</th>"
        f"<th>{chart_terms['bhava_chalit']}</th>"
        f"<th>{glossary['panchang']['nakshatra']}</th>"
        f"<th>{chart_terms['moolatrikona'][:0]}"
        + ("स्थिती" if locale in ("mr", "hi") else "Dignity")
        + "</th>"
        f"<th>{chart_terms['shadbala']}</th>"
        f"<th></th>"
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
    )


def _dasha_table(facts: dict[str, Any], locale: str) -> str:
    from narrative.projection import project

    glossary = load_glossary(locale)
    num = numeral_formatter(locale)
    graha_names, dasha_terms = glossary["graha"], glossary["dasha"]
    dasha = project(facts, "dasha")["dasha"]

    current_rows = [
        (
            dasha_terms.get(level, level),
            f"{graha_names.get(node['lord'], node['lord'])} "
            f"({num(_local(node.get('start_local'), 'date'))} – "
            f"{num(_local(node.get('end_local'), 'date'))})",
        )
        for level, node in dasha["current"].items()
    ]
    timeline_rows = "".join(
        "<tr>"
        f'<th scope="row">{graha_names.get(p["lord"], p["lord"])}</th>'
        f"<td>{num(_local(p.get('start_local'), 'date'))}</td>"
        f"<td>{num(_local(p.get('end_local'), 'date'))}</td>"
        "</tr>"
        for p in dasha["timeline"]
    )
    return (
        '<div class="grid2">'
        + _kv_table(dasha_terms["current_period"], current_rows)
        + (
            f"<table><caption>{dasha_terms['timeline']} "
            f"({dasha_terms['vimshottari']})</caption>"
            f"<thead><tr><th>{dasha_terms['lord']}</th>"
            f"<th>{dasha_terms['start']}</th><th>{dasha_terms['end']}</th></tr></thead>"
            f"<tbody>{timeline_rows}</tbody></table>"
        )
        + "</div>"
    )


def _findings_table(facts: dict[str, Any], locale: str) -> str:
    """Yogas and doshas, each with its evidence keys visible.

    CLAUDE.md 8 requires every interpretive statement to be traceable, and a
    printed sheet has no affordance to tap - so the evidence is printed inline.
    """
    glossary = load_glossary(locale)
    milan_terms = glossary["milan"]
    strength_terms = glossary["common"]
    rows = []
    for finding in [*facts.get("yogas_present", []), *facts.get("doshas", [])]:
        if finding.get("present") is False:
            continue
        label = finding_label(locale, finding["key"])
        strength = finding.get("strength")
        ruleset = finding.get("ruleset")
        rows.append(
            "<tr>"
            f'<th scope="row">{label}</th>'
            f"<td>{strength_terms.get(strength, strength or '')}</td>"
            # शास्त्र or परंपरा on the page, not only in ChartFacts. A printed
            # sheet has no tooltip, so the distinction has to be a column
            # (audit F-014).
            f"<td>{strength_terms.get(finding.get('provenance', ''), '')}</td>"
            f"<td>{f'{milan_terms["ruleset"]}: {ruleset}' if ruleset else ''}</td>"
            f'<td class="evidence">{", ".join(finding["evidence"])}</td>'
            "</tr>"
        )
    if not rows:
        return ""
    return "<table><tbody>" + "".join(rows) + "</tbody></table>"


def _narrative_section(narrative: dict[str, str], glossary: dict[str, Any]) -> str:
    blocks = "".join(
        f"<h2>{glossary['chart'].get(section, section.replace('_', ' ').title())}</h2><p>{text}</p>"
        for section, text in narrative.items()
    )
    return f'<div class="page-break">{blocks}</div>'


def render_pdf(
    facts: dict[str, Any],
    locale: str,
    *,
    style: ChartStyle = ChartStyle.NORTH_INDIAN,
    narrative: dict[str, str] | None = None,
) -> bytes:
    """The kundali sheet as PDF bytes.

    Glyph coverage is verified for a Devanagari locale *before* rendering, so a
    font problem surfaces as an exception rather than as a page of blank boxes.
    """
    if locale in ("mr", "hi"):
        assert_devanagari_coverage(locale)
    try:
        from weasyprint import HTML
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise PdfError("WeasyPrint is not installed; install the [pdf] extra") from exc

    html_text = build_sheet_html(facts, locale, style=style, narrative=narrative)
    try:
        return bytes(HTML(string=html_text, base_url=str(FONTS_DIR)).write_pdf())
    except Exception as exc:
        raise PdfError(f"PDF rendering failed: {exc}") from exc


def extract_text(pdf_bytes: bytes) -> str:
    """Pull the text layer back out of a PDF.

    CLAUDE.md 2.2 warns that Devanagari breaks silently, and rendering without an
    error proves nothing - a missing glyph produces a blank. This is one of the two
    ways that is checked.

    **Known limitation.** ``pypdf`` does not reliably reconstruct Devanagari
    *ordering* from the content stream. The i-matra ``ि`` is drawn to the left of
    the consonant it follows logically, and the reph ``र्`` is drawn above a later
    consonant, so extraction yields ``तथी`` for ``तिथी`` and ``सूयार्योदय`` for
    ``सूर्योदय``. The glyphs are present and correctly *positioned* on the page;
    only the extraction's character order is wrong.

    So a substring probe is not a valid check. Use
    :func:`assert_codepoints_present`, which asks whether the characters reached the
    document at all - the question that actually distinguishes a working font from a
    broken one. Verifying visual shaping would need a raster comparison, which this
    engine does not attempt.
    """
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - pypdf ships with WeasyPrint
        raise PdfError("pypdf is required to extract PDF text") from exc
    import io

    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def assert_codepoints_present(pdf_bytes: bytes, sample: str) -> None:
    """Assert every character of ``sample`` reached the PDF's text layer.

    Order-insensitive by necessity - see :func:`extract_text` for why. A dropped
    glyph, which is the failure CLAUDE.md 2.2 warns about, shows up here as an
    absent codepoint.
    """
    present = set(extract_text(pdf_bytes))
    missing = sorted({ch for ch in sample if not ch.isspace()} - present)
    if missing:
        raise PdfError(
            f"these characters did not reach the PDF text layer: {''.join(missing)!r}. "
            "The font is not rendering them - this is the silent failure "
            "CLAUDE.md 2.2 warns about."
        )

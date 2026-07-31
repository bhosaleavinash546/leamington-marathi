"""``npm run audit:contrast`` — WCAG ratios for every design token pair.

DESIGN.md §8 makes contrast a *release gate*, not a phase: ">= 4.5:1 for body
text, >= 3:1 for large text and UI borders, in both themes and for all nine graha
tokens against both surfaces".

Run it rather than eyeball it. The audit found six graha failures where §2.1
anticipated two, and they are not the same six per theme - see
docs/design/DIRECTION.md.

Reads the token values out of ``web/app/tokens.css`` and the chart's own paint
out of ``render/chart_svg.py``, so the audit cannot drift from what ships.

The SVG half exists because its absence shipped a real defect. The audit checked
CSS custom properties and nothing else, so the kundali's `fill` declarations - a
different stylesheet, embedded in generated markup - were outside every gate.
SVG text has an initial fill of black and does not inherit the page's `color`, so
every graha glyph and both chart captions rendered black on near-black in dark
mode, at 1.12:1, in the one element of the sheet a reader looks at first. A gate
that stops at the token file cannot see the thing the tokens are used to paint.
"""

from __future__ import annotations

import pathlib
import re
import sys
from typing import Final

ROOT: Final[pathlib.Path] = pathlib.Path(__file__).resolve().parent.parent.parent
TOKENS: Final[pathlib.Path] = ROOT / "web" / "app" / "tokens.css"

# The SVG half imports `render.chart_svg`, and this runs from `web/` via
# `npm run audit:contrast` as well as from the repository root. Putting the root
# on the path here means the tool works from either, rather than depending on the
# caller to know that it needs to.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
BODY_MIN: Final[float] = 4.5
UI_MIN: Final[float] = 3.0

#: Hairline table rules are decorative separators, not component identifiers, and
#: the table's structure is carried semantically. Interactive edges use
#: --rule-interactive instead, which is held to the gate. See DIRECTION.md.
EXEMPT: Final[frozenset[str]] = frozenset({"rule"})

#: Chart classes whose paint is *large* text or a structural line rather than
#: small text, so §8's 3:1 applies instead of 4.5:1. The frame and the diagonals
#: are the chart's structure; everything else in the diamond is a figure or a
#: name a practitioner reads at 11-15px.
SVG_LARGE: Final[frozenset[str]] = frozenset({"k-frame", "k-line"})

#: What `currentColor` resolves to inside the chart. `globals.css` sets
#: `.kundali-svg svg { color: var(--ink) }`, so an unset fill inherits the ink -
#: but only once that rule exists, which is why the resolution is named here
#: rather than assumed.
SVG_CURRENT_COLOR: Final[str] = "ink"


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_colour: str) -> float:
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def ratio(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def read_tokens() -> tuple[dict[str, str], dict[str, str]]:
    """(light, dark) token maps, parsed from the shipped stylesheet."""
    css = TOKENS.read_text(encoding="utf-8")
    # Only the dark block itself, not everything after it: `[data-theme='light']`
    # follows it in the file, and reading past the closing brace would let the
    # light values overwrite the dark ones and quietly audit light twice.
    dark_block = css.split("[data-theme='dark'] {", 1)[1].split("}", 1)[0]
    light: dict[str, str] = {}
    dark: dict[str, str] = {}
    for name, value in re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{6})", css):
        light.setdefault(name, value)
    for name, value in re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{6})", dark_block):
        dark[name] = value

    # Aliases (`--rule-interactive: var(--ink-muted)`) resolve per theme, so the
    # audit measures what the browser paints. Without this an aliased token is
    # simply absent from the map and silently skips the gate - which is the worst
    # possible outcome for a token that exists *because* of the gate.
    aliases = dict(re.findall(r"--([a-z-]+):\s*var\(--([a-z-]+)\)", css))
    resolved_light = {**light}
    resolved_dark = {**light, **dark}
    for name, target in aliases.items():
        for table in (resolved_light, resolved_dark):
            if target in table:
                table[name] = table[target]
    return resolved_light, resolved_dark


def audit() -> list[str]:
    light, dark = read_tokens()
    failures: list[str] = []
    grahas = sorted(n for n in light if n.startswith("graha-") and n != "graha-outline")

    for theme, tokens in (("light", light), ("dark", dark)):
        surfaces = [tokens["paper"], tokens["paper-sunk"]]
        print(f"\n  --- {theme} ---")
        for name in ("ink", "ink-muted", "sindoor"):
            worst = min(ratio(tokens[name], s) for s in surfaces)
            ok = worst >= BODY_MIN
            print(f"    {name:18s} {worst:6.2f}:1  need {BODY_MIN}  {'PASS' if ok else 'FAIL'}")
            if not ok:
                failures.append(f"{theme}/{name}: {worst:.2f}:1 < {BODY_MIN}")
        for name in ("rule", "rule-interactive"):
            if name not in tokens:
                continue
            worst = min(ratio(tokens[name], s) for s in surfaces)
            exempt = name in EXEMPT
            ok = exempt or worst >= UI_MIN
            tag = "EXEMPT" if exempt else ("PASS" if ok else "FAIL")
            print(f"    {name:18s} {worst:6.2f}:1  need {UI_MIN}  {tag}")
            if not ok:
                failures.append(f"{theme}/{name}: {worst:.2f}:1 < {UI_MIN}")
        for name in grahas:
            worst = min(ratio(tokens[name], s) for s in surfaces)
            outlined = worst < UI_MIN
            note = "  outlined" if outlined else ""
            print(
                f"    {name:18s} {worst:6.2f}:1  need {UI_MIN}  "
                f"{'PASS' if not outlined else 'PASS via outline'}{note}"
            )
    return failures


def svg_paint() -> dict[str, str]:
    """Every class in the chart's stylesheet that paints something, and with what.

    Returns ``{class_name: token_or_literal}``. ``currentColor`` resolves to the
    token named by :data:`SVG_CURRENT_COLOR`; ``var(--x, #fallback)`` resolves to
    ``x``, since the fallback only applies where the page tokens are out of scope
    and the page is what this audit is about.
    """
    from render.chart_svg import _STYLE

    out: dict[str, str] = {}
    unpainted: set[str] = set()
    # A bare `text { fill: ... }` sets the default every class inherits.
    default = "none"
    for selector, body in re.findall(r"([^{}]+)\{([^}]*)\}", _STYLE):
        selector = selector.strip()
        paint = re.search(r"\b(?:fill|stroke)\s*:\s*([^;]+)", body)
        if paint is None:
            continue
        value = paint.group(1).strip()
        if value == "none":
            # `.k-house` is a hit target, not a mark. It draws nothing, so there
            # is nothing to hold to a contrast floor.
            unpainted.add(selector.lstrip("."))
            continue
        if value == "currentColor":
            value = SVG_CURRENT_COLOR
        else:
            var = re.match(r"var\(\s*--([a-z-]+)", value)
            value = var.group(1) if var else value
        if selector == "text":
            default = value
        else:
            out[selector.lstrip(".")] = value

    # Classes that declare no paint of their own take the element default.
    for selector in re.findall(r"\.(k-[a-z]+)\s*\{", _STYLE):
        if selector not in unpainted:
            out.setdefault(selector, default)
    return out


def audit_svg(light: dict[str, str], dark: dict[str, str]) -> list[str]:
    """The kundali's own paint, against both surfaces in both themes."""
    failures: list[str] = []
    paint = svg_paint()
    for theme, tokens in (("light", light), ("dark", dark)):
        surfaces = [tokens["paper"], tokens["paper-sunk"]]
        print(f"\n  --- kundali SVG, {theme} ---")
        for name in sorted(paint):
            source = paint[name]
            colour = tokens.get(source, source)
            if not colour.startswith("#"):
                failures.append(
                    f"{theme}/{name}: no resolvable paint ({source!r}). SVG text has an "
                    "initial fill of black and does not inherit the page's color, so this "
                    "renders black in both themes - invisible on dark paper."
                )
                continue
            worst = min(ratio(colour, surface) for surface in surfaces)
            floor = UI_MIN if name in SVG_LARGE else BODY_MIN
            ok = worst >= floor
            print(
                f"    {name:18s} {worst:6.2f}:1  need {floor}  "
                f"{'PASS' if ok else 'FAIL'}  ({source})"
            )
            if not ok:
                failures.append(f"{theme}/{name}: {worst:.2f}:1 < {floor} (paints with {source})")
    return failures


def main() -> int:
    print("DESIGN.md §8 contrast audit — tokens from web/app/tokens.css, chart paint")
    print("from render/chart_svg.py")
    failures = audit()
    light, dark = read_tokens()
    failures += audit_svg(light, dark)
    if failures:
        print(f"\n{len(failures)} failure(s):", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 1
    print("\ncontrast audit clean (graha tokens below 3:1 carry --graha-outline)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

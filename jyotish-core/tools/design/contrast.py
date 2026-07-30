"""``npm run audit:contrast`` — WCAG ratios for every design token pair.

DESIGN.md §8 makes contrast a *release gate*, not a phase: ">= 4.5:1 for body
text, >= 3:1 for large text and UI borders, in both themes and for all nine graha
tokens against both surfaces".

Run it rather than eyeball it. The audit found six graha failures where §2.1
anticipated two, and they are not the same six per theme - see
docs/design/DIRECTION.md.

Reads the token values out of ``web/app/tokens.css`` so the audit cannot drift
from what actually ships.
"""

from __future__ import annotations

import pathlib
import re
import sys
from typing import Final

TOKENS: Final[pathlib.Path] = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "web" / "app" / "tokens.css"
)
BODY_MIN: Final[float] = 4.5
UI_MIN: Final[float] = 3.0

#: Hairline table rules are decorative separators, not component identifiers, and
#: the table's structure is carried semantically. Interactive edges use
#: --rule-interactive instead, which is held to the gate. See DIRECTION.md.
EXEMPT: Final[frozenset[str]] = frozenset({"rule"})


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


def main() -> int:
    print("DESIGN.md §8 contrast audit — tokens read from web/app/tokens.css")
    failures = audit()
    if failures:
        print(f"\n{len(failures)} failure(s):", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 1
    print("\ncontrast audit clean (graha tokens below 3:1 carry --graha-outline)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

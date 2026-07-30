"""Gates for the claims DESIGN.md's phases make about the stylesheets.

Two of Phase B's requirements are stated as absolutes, and an absolute that
nothing checks is a comment. Both are cheap to verify against the shipped CSS:

* **No ambient motion, and no hand-written durations.** Phase B's rule was "zero
  animation" and this file enforced it literally. Phase C legitimately adds the
  page-transition crossfade, so the gate moved rather than being deleted: §3.1
  bans ambient motion outright ("no idle loops, no drifting backgrounds, no
  breathing cards"), and every duration must come from a token so that the
  reduced-motion media query can collapse it. A literal `300ms` in the stylesheet
  is a duration the preference cannot reach.
* **"Every value comes from the tokens."** `globals.css` says so in its header.
  A raw colour there is a token that should exist and does not, so the
  stylesheet's own claim is worth enforcing.
"""

from __future__ import annotations

import pathlib
import re
from typing import Final

import pytest

WEB: Final[pathlib.Path] = pathlib.Path(__file__).resolve().parent.parent.parent / "web"
GLOBALS: Final[pathlib.Path] = WEB / "app" / "globals.css"
MOTION_TS: Final[pathlib.Path] = WEB / "lib" / "motion.ts"
TOKENS: Final[pathlib.Path] = WEB / "app" / "tokens.css"

#: An animation that never ends. §3.1: "Ambient motion is banned."
AMBIENT: Final[re.Pattern[str]] = re.compile(r"^\s*animation[^:]*:[^;]*\binfinite\b", re.MULTILINE)

#: A duration or delay written as a literal rather than taken from a token.
LITERAL_TIMING: Final[re.Pattern[str]] = re.compile(
    r"^\s*(?:animation|transition)(?:-duration|-delay)?\s*:[^;]*?\b\d+m?s\b", re.MULTILINE
)

HEX: Final[re.Pattern[str]] = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def _strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)


@pytest.mark.skipif(not GLOBALS.exists(), reason="web/app/globals.css is absent")
def test_no_ambient_motion() -> None:
    """DESIGN.md §3.1: "Ambient motion is banned. No idle loops"."""
    found = AMBIENT.findall(_strip_comments(GLOBALS.read_text(encoding="utf-8")))
    assert not found, (
        "globals.css declares an infinite animation. §3.1 bans ambient motion: "
        "every animation must explain a change and then stop."
    )


@pytest.mark.skipif(not GLOBALS.exists(), reason="web/app/globals.css is absent")
def test_durations_come_from_tokens() -> None:
    """A literal duration is one the reduced-motion media query cannot collapse."""
    css = _strip_comments(GLOBALS.read_text(encoding="utf-8"))
    found = LITERAL_TIMING.findall(css)
    assert not found, (
        "globals.css writes a duration as a literal. Use --dur-* so that the "
        "prefers-reduced-motion block in tokens.css can reach it (§3.4)."
    )


@pytest.mark.skipif(not MOTION_TS.exists(), reason="web/lib/motion.ts is absent")
def test_the_js_motion_tokens_mirror_the_css() -> None:
    """`lib/motion.ts` restates the tokens for Motion, which takes numbers not lengths.

    Two copies of the same value drift, so the copy is checked against the
    original rather than trusted. Both the full durations and the reduced ones:
    §3.4 is specific about which collapse to zero and which become a 120ms
    crossfade, and a mismatch there is the difference between "stiller" and
    "broken".
    """
    css = TOKENS.read_text(encoding="utf-8")
    ts = MOTION_TS.read_text(encoding="utf-8")

    def css_block(pattern: str) -> dict[str, int]:
        block = re.search(pattern, css, re.DOTALL)
        assert block is not None, f"no block matching {pattern!r} in tokens.css"
        return {
            name: int(value)
            for name, value in re.findall(r"--dur-([a-z-]+):\s*(\d+)ms", block.group(0))
        }

    def ts_block(name: str) -> dict[str, int]:
        block = re.search(rf"export const {name} = \{{(.*?)\}}", ts, re.DOTALL)
        assert block is not None, f"no {name} in motion.ts"
        return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+),", block.group(1))}

    # `chart-draw` in CSS is `chartDraw` in JS; compare on a common key.
    normalise = {
        name.replace("-", ""): value for name, value in css_block(r":root \{.*?\}").items()
    }
    reduced_css = {
        name.replace("-", ""): value
        for name, value in css_block(r"@media \(prefers-reduced-motion: reduce\).*?\}\s*\}").items()
    }

    full_ts = {k.lower(): v for k, v in ts_block("DURATION").items()}
    reduced_ts = {k.lower(): v for k, v in ts_block("REDUCED_DURATION").items()}

    assert full_ts == normalise, (
        f"lib/motion.ts DURATION {full_ts} disagrees with tokens.css {normalise}"
    )
    assert reduced_ts == reduced_css, (
        f"lib/motion.ts REDUCED_DURATION {reduced_ts} disagrees with the "
        f"prefers-reduced-motion block {reduced_css}"
    )


@pytest.mark.skipif(not GLOBALS.exists(), reason="web/app/globals.css is absent")
def test_the_patrika_sheet_uses_tokens_rather_than_literals() -> None:
    """Raw colours belong in tokens.css, where a reviewer can see the whole palette.

    The print block is the one exception and says why in the source: print has no
    theme to respond to, so it forces black on white rather than inheriting
    whichever theme the screen was in.
    """
    css = _strip_comments(GLOBALS.read_text(encoding="utf-8"))
    print_block = css.find("@media print")
    outside_print = css if print_block == -1 else css[:print_block]
    literals = HEX.findall(outside_print)
    assert not literals, (
        f"globals.css hard-codes {sorted(set(literals))} outside the print block. "
        "A colour that is not a token is a token that should exist."
    )


@pytest.mark.skipif(not TOKENS.exists(), reason="web/app/tokens.css is absent")
def test_the_sheet_and_the_chart_have_no_rounded_corners() -> None:
    """DESIGN.md §2.3: "2px maximum on controls, 0 on the chart and all tables"."""
    tokens = TOKENS.read_text(encoding="utf-8")
    control = re.search(r"--radius-control:\s*(\d+)px", tokens)
    sheet = re.search(r"--radius-sheet:\s*(\d+)", tokens)
    assert control is not None and sheet is not None, "the radius tokens are missing"
    assert int(control.group(1)) <= 2, "§2.3 caps control radius at 2px"
    assert int(sheet.group(1)) == 0, "a printed panchang has no rounded corners"

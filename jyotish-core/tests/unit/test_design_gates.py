"""Gates for the claims DESIGN.md's phases make about the stylesheets.

Two of Phase B's requirements are stated as absolutes, and an absolute that
nothing checks is a comment. Both are cheap to verify against the shipped CSS:

* **"Zero animation."** Phase B is the static patrika; Phase C is where motion
  arrives, and its own gate is "the reduced-motion test passes before any
  animation is added". This test is what makes that ordering real rather than
  remembered - it fails the moment a transition appears in the product
  stylesheet, which is exactly when the Phase C work should start instead.
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
TOKENS: Final[pathlib.Path] = WEB / "app" / "tokens.css"

#: Declarations that move something. `--dur-*` and `--ease-*` are *token
#: definitions*, not uses, so they live in tokens.css and are not matched here.
MOTION: Final[re.Pattern[str]] = re.compile(
    r"^\s*(transition|animation|transition-\w+|animation-\w+)\s*:", re.MULTILINE
)

HEX: Final[re.Pattern[str]] = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def _strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)


@pytest.mark.skipif(not GLOBALS.exists(), reason="web/app/globals.css is absent")
def test_the_patrika_sheet_has_no_animation() -> None:
    """DESIGN.md Phase B: "Zero animation"."""
    found = MOTION.findall(_strip_comments(GLOBALS.read_text(encoding="utf-8")))
    assert not found, (
        f"globals.css declares {sorted(set(found))}. DESIGN.md Phase B is the static "
        "patrika and Phase C is the motion foundation; adding motion here skips the "
        "reduced-motion gate that Phase C requires to pass first."
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

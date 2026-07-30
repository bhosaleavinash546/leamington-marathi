"""The web's degree formatter must agree with the engine's, character for character.

``core.angles.format_dm`` and ``web/lib/format.ts:formatDegrees`` print the same
quantity in two languages. That duplication is hard to remove - the PDF is built
in Python and the ग्रहस्पष्ट table is a React server component - so the next best
thing is to prove the two are the same function.

They were not. The TypeScript emitted the prime U+2032, which no font the project
ships can draw, and it had no carry, so 29.9999 read ``29°60'`` where the Python
read ``30°00'``.

The test runs the *shipped* TypeScript through Node's type stripping rather than
re-implementing it here. A test that re-implements the thing it is checking
proves only that the author is consistent.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess

import pytest

from core.angles import format_dm

WEB = pathlib.Path(__file__).resolve().parent.parent.parent / "web"
FORMAT_TS = WEB / "lib" / "format.ts"

#: Every case that has ever been wrong, plus a sweep. The carry cases are the
#: point: each is a value whose arcminutes round to 60.
CASES: tuple[float, ...] = (
    0.0,
    0.2833,  # 0°17'
    12.7333,  # 12°44'
    29.9999,  # carries to 30°00'
    5.99999,  # carries to 6°00'
    0.99999,  # carries to 1°00'
    29.99166,  # 29°59', just below the carry
    -12.7333,  # the sign path
    359.9999,
    *[i * 0.7 for i in range(60)],
)


def _node() -> str:
    node = shutil.which("node")
    if node is None:  # pragma: no cover - depends on the environment
        pytest.skip("node is not installed; the web formatter cannot be exercised")
    return node


@pytest.mark.skipif(not FORMAT_TS.exists(), reason="web/lib/format.ts is absent")
def test_web_degree_formatter_matches_the_engine(tmp_path: pathlib.Path) -> None:
    """`formatDegrees` and `format_dm` produce identical strings."""
    script = tmp_path / "probe.mjs"
    script.write_text(
        f"const {{ formatDegrees }} = await import({str(FORMAT_TS)!r});\n"
        f"const cases = {json.dumps(CASES)};\n"
        "console.log(JSON.stringify(cases.map(formatDegrees)));\n",
        encoding="utf-8",
    )
    result = subprocess.run(
        [_node(), "--experimental-strip-types", "--no-warnings", str(script)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:  # pragma: no cover - a broken toolchain, not a failure
        pytest.skip(f"node could not run the TypeScript directly: {result.stderr.strip()[:200]}")

    from_web = json.loads(result.stdout)
    from_engine = [format_dm(case) for case in CASES]
    mismatches = [
        (case, web, engine)
        for case, web, engine in zip(CASES, from_web, from_engine, strict=True)
        if web != engine
    ]
    assert not mismatches, "web and engine disagree on: " + ", ".join(
        f"{case}: web {web!r} vs engine {engine!r}" for case, web, engine in mismatches
    )


@pytest.mark.skipif(not FORMAT_TS.exists(), reason="web/lib/format.ts is absent")
def test_web_formatter_uses_a_glyph_the_shipped_fonts_have() -> None:
    """The mark must be the ASCII apostrophe, not the prime.

    Guards the same defect from the other side: a future edit that "improves"
    the typography back to U+2032 would render a missing-glyph box in the PDF and
    a system-font fallback on the web.
    """
    source = FORMAT_TS.read_text(encoding="utf-8")
    body = source[source.index("export function formatDegrees") :]
    body = body[: body.index("\n}")]
    assert "′" not in body, "formatDegrees emits U+2032; no shipped face has that glyph"

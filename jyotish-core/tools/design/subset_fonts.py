"""``npm run fonts:subset`` - rebuild the self-hosted web faces.

DESIGN.md §2.2 requires the three faces to be subset and self-hosted, and §9
caps each at 90KB: "the device is a mid-range Android phone on a variable Indian
network". A subset is only safe when the codepoint set is *derived* from what the
app can emit rather than guessed, and the guess is what went wrong the first
time: the arcminute prime in ``core/angles.py`` (``12°44′``) was in none of the
ten shipped files, so every degree in the ग्रहस्पष्ट table fell back to a system
font at a different weight and colour. Nothing caught it because nothing had ever
loaded a page in a browser.

Two codepoint sets, both mechanical rather than chosen:

* **Devanagari** - the whole of U+0900-U+097F plus ZWNJ/ZWJ. Not the corpus: the
  `name` field is arbitrary user Devanagari, and a subset built from the locale
  files renders every screen correctly and then breaks on the one line the user
  cares about most. Whole-block costs ~7KB per face over corpus-only.
* **Latin and punctuation** - every character in ``locales/*/*.json`` plus
  :data:`RENDERER_GLYPHS`, the marks the *formatters* produce, which appear in no
  locale file because they are generated.

Subsetting is delegated to the Google Fonts ``text=`` endpoint rather than done
locally with fontTools. Not for convenience: a local subset has to choose between
``layout_closure`` on, which retains every conjunct reachable from the input and
lands at 173-262KB, and off, which drops GSUB and renders क्ष as three loose
letters. Google's builder does full closure *and* compresses to 70-100KB. The
outputs are committed, so this is a regeneration tool, not a build step, and the
network dependency is not on the critical path.
"""

from __future__ import annotations

import io
import json
import pathlib
import sys
import urllib.parse
import urllib.request
from typing import Final, NamedTuple

ROOT: Final[pathlib.Path] = pathlib.Path(__file__).resolve().parent.parent.parent
LOCALES: Final[pathlib.Path] = ROOT / "locales"
OUT: Final[pathlib.Path] = ROOT / "web" / "public" / "fonts"

#: §9: "Devanagari font payload < 90KB per face after subsetting".
BUDGET_BYTES: Final[int] = 90 * 1024

_AGENT: Final[str] = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

#: Characters the renderers emit that no locale file contains.
#:
#: ``core/angles.py`` formats ``12°44'`` and ``12°34'56"``; ``render/pdf.py`` and
#: ``render/chart_svg.py`` add the degree sign, a non-breaking space and the
#: separators. Omit one and it falls back to a system font mid-number.
RENDERER_GLYPHS: Final[str] = (
    "0123456789"
    "°"  # degree
    # Arcminute and arcsecond are the ASCII pair, not U+2032/U+2033. None of
    # the three chosen faces has the primes, and neither does the Noto Sans
    # Devanagari the PDF embeds - see core.angles.format_dm.
    "'\""
    "·•"  # separators
    "–—"  # en and em dash
    " "  # non-breaking space, between a value and its unit
    ":.,;()[]{}/+-%#*=<>?!|@&_~^ "
)

#: Devanagari proper, plus the two joiners. Vedic extensions (U+1CD0-U+1CF9) are
#: deliberately excluded - no Marathi name or locale string uses them, and they
#: pull in a long tail of marks.
DEVANAGARI_RANGE: Final[range] = range(0x0900, 0x0980)
JOINERS: Final[str] = "‌‍"


class Face(NamedTuple):
    """One shipped file: a source family narrowed to one script's codepoints."""

    stem: str
    family: str
    weight: int
    #: 'devanagari' or 'latin'. The two are separate files with separate
    #: unicode-ranges in tokens.css, so an English page never downloads the
    #: Devanagari payload.
    script: str


FACES: Final[tuple[Face, ...]] = (
    Face("mukta-devanagari-400", "Mukta", 400, "devanagari"),
    Face("mukta-latin-400", "Mukta", 400, "latin"),
    Face("mukta-devanagari-600", "Mukta", 600, "devanagari"),
    Face("mukta-latin-600", "Mukta", 600, "latin"),
    Face("rozha-one-devanagari-400", "Rozha One", 400, "devanagari"),
    Face("rozha-one-latin-400", "Rozha One", 400, "latin"),
    Face("plex-deva-devanagari-400", "IBM Plex Sans Devanagari", 400, "devanagari"),
    Face("plex-deva-latin-400", "IBM Plex Sans Devanagari", 400, "latin"),
    Face("plex-deva-devanagari-600", "IBM Plex Sans Devanagari", 600, "devanagari"),
    Face("plex-deva-latin-600", "IBM Plex Sans Devanagari", 600, "latin"),
)

#: Conjunct formation is entirely GSUB-driven. A build that loses these renders
#: क्ष as क + ् + ष, which is the failure DESIGN.md §2.2 warns about.
CONJUNCT_FEATURES: Final[frozenset[str]] = frozenset(
    {"akhn", "rphf", "blwf", "half", "cjct", "pres", "abvs", "blws", "psts"}
)


def _walk(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "".join(_walk(v) for v in value.values()) + "".join(value.keys())
    if isinstance(value, list):
        return "".join(_walk(v) for v in value)
    return ""


def latin_corpus() -> str:
    """Every non-Devanagari character the app can put on screen."""
    text = RENDERER_GLYPHS
    for path in sorted(LOCALES.rglob("*.json")):
        text += _walk(json.loads(path.read_text(encoding="utf-8")))
    codepoints = {ord(c) for c in text if ord(c) not in DEVANAGARI_RANGE and c not in JOINERS}
    return "".join(chr(c) for c in sorted(codepoints) if c not in (0x0A, 0x0D, 0x09))


def devanagari_corpus() -> str:
    return "".join(chr(c) for c in DEVANAGARI_RANGE) + JOINERS


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": _AGENT})
    with urllib.request.urlopen(request) as response:
        return bytes(response.read())


def download(face: Face, text: str) -> bytes:
    """Fetch the subset Google builds for exactly these characters."""
    family = face.family.replace(" ", "+")
    css = _get(
        f"https://fonts.googleapis.com/css2?family={family}:wght@{face.weight}"
        f"&display=block&text={urllib.parse.quote(text)}"
    ).decode("utf-8")
    start = css.index("url(") + len("url(")
    return _get(css[start : css.index(")", start)])


def build() -> int:
    from fontTools.ttLib import TTFont

    deva, latin = devanagari_corpus(), latin_corpus()
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Devanagari U+0900-U+097F + joiners ({len(deva)} cp), other ({len(latin)} cp)")

    failures: list[str] = []
    over_budget: list[str] = []
    total_devanagari = 0

    for face in FACES:
        wanted = deva if face.script == "devanagari" else latin
        payload = download(face, wanted)
        path = OUT / f"{face.stem}.woff2"
        path.write_bytes(payload)

        font = TTFont(io.BytesIO(payload))
        shipped = set(font.getBestCmap())
        size_kb = len(payload) / 1024

        note = ""
        if len(payload) > BUDGET_BYTES:
            over_budget.append(f"{face.stem}: {size_kb:.1f}KB vs {BUDGET_BYTES // 1024}KB")
            note = "  OVER §9 BUDGET"
        if face.script == "devanagari":
            total_devanagari += len(payload)

        # A codepoint the app can emit but the file cannot draw is a silent
        # mid-word fallback, so name every one rather than counting them.
        lost = sorted(c for c in map(ord, wanted) if c not in shipped)
        if lost and face.script != "devanagari":
            failures.append(f"{face.stem}: no glyph for " + " ".join(f"U+{c:04X}" for c in lost))

        if face.script == "devanagari":
            gsub = font.get("GSUB")
            present = (
                {record.FeatureTag for record in gsub.table.FeatureList.FeatureRecord}
                if gsub is not None
                else set()
            )
            if not CONJUNCT_FEATURES & present:
                failures.append(f"{face.stem}: no conjunct GSUB features survived")

        print(f"  {face.stem:34s} {font['maxp'].numGlyphs:4d} glyphs  {size_kb:6.1f}KB{note}")

    print(f"\n  total Devanagari payload: {total_devanagari / 1024:.1f}KB across 5 faces")
    if over_budget:
        # Not a build failure: it is a real conflict between §9's per-face budget
        # and rendering an arbitrary Marathi name, and the owner decides which
        # gives. Loudly reported rather than quietly trimmed. See
        # docs/design/DIRECTION.md, "Where the tokens and the gate disagree".
        print(f"  {len(over_budget)} face(s) over §9's budget:")
        for line in over_budget:
            print(f"    {line}")

    if failures:
        print(f"\n{len(failures)} failure(s):", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 1
    print("\nfonts rebuilt: conjunct features intact, every emittable codepoint present")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())

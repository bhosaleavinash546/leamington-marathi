"""
Builds scripts/drawings/fonts/cv-drawing-symbols.ttf — the three ISO 1101 symbols the fixture drawings use that
DejaVu Sans does not carry: position (U+2316), the maximum-material modifier (U+24C2) and perpendicularity (U+27C2).

Every outline below is drawn here, from circles and bars: the font contains no glyph taken from any other font, so the
generated fixture PDFs embed only DejaVu Sans (Bitstream Vera licence) and this file. Dedicated to the public domain
(CC0). It is a fixture-generation tool: nothing in the product loads it.

    python3 -I scripts/drawings/make-symbol-font.py        (needs fontTools: pip install fonttools)

The output is deterministic (fixed timestamps), so re-running it gives the same bytes.
"""
import math
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
ASCENT, DESCENT = 800, -200
EPOCH = 3_866_572_800  # 2026-07-12 00:00 UTC in seconds since 1904, fixed so the file is reproducible


def circle(pen, cx, cy, r, clockwise):
    """A circle as eight quadratic arcs (TrueType outlines are quadratic)."""
    n = 8
    k = r / math.cos(math.pi / n)
    step = (-1 if clockwise else 1) * 2 * math.pi / n
    pen.moveTo((round(cx + r), round(cy)))
    for i in range(n):
        mid = step * (i + 0.5)
        end = step * (i + 1)
        pen.qCurveTo((round(cx + k * math.cos(mid)), round(cy + k * math.sin(mid))),
                     (round(cx + r * math.cos(end)), round(cy + r * math.sin(end))))
    pen.closePath()


def ring(pen, cx, cy, outer, inner):
    circle(pen, cx, cy, outer, clockwise=True)     # the body
    circle(pen, cx, cy, inner, clockwise=False)    # the hole


def poly(pen, points):
    """A filled polygon, wound clockwise (the same direction as a ring's body, so overlaps stay filled)."""
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1]))
    if area > 0:
        points = points[::-1]
    pen.moveTo(points[0])
    for p in points[1:]:
        pen.lineTo(p)
    pen.closePath()


def bar(pen, x0, y0, x1, y1):
    poly(pen, [(x0, y0), (x0, y1), (x1, y1), (x1, y0)])


def glyph_position():
    pen = TTGlyphPen(None)
    ring(pen, 500, 350, 300, 245)
    bar(pen, 60, 322, 940, 378)
    bar(pen, 472, -90, 528, 790)
    return pen.glyph()


def glyph_mmc():
    pen = TTGlyphPen(None)
    ring(pen, 500, 350, 440, 385)
    poly(pen, [(300, 140), (300, 560), (372, 560), (500, 318), (628, 560), (700, 560), (700, 140), (640, 140),
               (640, 452), (524, 232), (476, 232), (360, 452), (360, 140)])
    return pen.glyph()


def glyph_perpendicular():
    pen = TTGlyphPen(None)
    bar(pen, 110, 0, 890, 60)
    bar(pen, 470, 0, 530, 700)
    return pen.glyph()


def glyph_empty():
    return TTGlyphPen(None).glyph()


def glyph_notdef():
    pen = TTGlyphPen(None)
    bar(pen, 100, 0, 600, 700)
    return pen.glyph()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts', 'cv-drawing-symbols.ttf')
    glyphs = {
        '.notdef': glyph_notdef(), 'space': glyph_empty(),
        'uni2316': glyph_position(), 'uni24C2': glyph_mmc(), 'uni27C2': glyph_perpendicular(),
    }
    order = list(glyphs)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', 0x2316: 'uni2316', 0x24C2: 'uni24C2', 0x27C2: 'uni27C2'})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: ((700 if name == '.notdef' else 500 if name == 'space' else 1000), 0) for name in order})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({
        'familyName': 'CV Drawing Symbols', 'styleName': 'Regular', 'fullName': 'CV Drawing Symbols Regular',
        'psName': 'CVDrawingSymbols-Regular', 'uniqueFontIdentifier': 'CVDrawingSymbols-Regular-1.0', 'version': 'Version 1.0',
        'copyright': 'Drawn for the CostVision drawing-reader fixtures. Public domain (CC0). Contains no glyph from any other font.',
    })
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=DESCENT, usWinAscent=ASCENT, usWinDescent=-DESCENT)
    fb.setupPost()
    fb.setupHead(unitsPerEm=UPM, created=EPOCH, modified=EPOCH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fb.font.recalcTimestamp = False
    fb.save(out)
    print(f'{out}  {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()

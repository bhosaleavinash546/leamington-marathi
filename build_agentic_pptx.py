#!/usr/bin/env python3
"""
CostVision — the learning loop ("agentic" side), management presentation builder.

Light professional theme, CostVision logo top-left on every slide, native
(editable) shapes, speaker notes per slide. Every fact on a slide or in the notes
must agree with docs/decks/tool-facts.md or with the code under calculator/.
No accuracy %, speed multiple or savings % is quoted as a result of this tool:
no estimate has yet been compared with a price JLR paid. AI is switched off in
the JLR build; the learning features shown here are deterministic and work
with AI off, and the AI features are labelled as switched off.

Regenerate:  python3 build_agentic_pptx.py
Output:      CostVision-Agentic-AI-Management-Presentation.pptx
"""

import re
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

from pptx_fixup import finalise
from brand import rgb, hexcol   # calculator/src/brand/brand.json — shared with the app (I5)

# ── Brand palette ─────────────────────────────────────────────────────────────
# Same hex values as build_workflow_deck.mjs and build_pptx.py, so all four decks
# read as one pack. This deck was already light, but a DIFFERENT light — white
# page, near-black headings, indigo accent — which looked like a separate product
# when shown next to the other two.
#
# Note the page/card relationship inverts: the page is now the tinted colour and
# the cards are white, where before the page was white and the panels tinted.
INDIGO  = rgb('blue')   # logo badge
BLUE    = rgb('blue')   # wordmark / primary accent
DARK    = rgb('navy')   # headings — navy
BODY    = rgb('slate')   # body text — slate
MUTED   = rgb('muted')   # captions
BG      = rgb('page')   # page
PANEL   = RGBColor(0xFF, 0xFF, 0xFF)   # card
PANEL2  = rgb('blueTint')   # pale blue callout
GREEN   = rgb('green')
AMBER   = rgb('amber')
RED     = rgb('red')
VIOLET  = rgb('violet')
CYAN    = rgb('teal')
LINE    = rgb('line')
NAVY    = rgb('navy')   # dark plates (table headers, masthead)

# BG doubles as a TEXT colour wherever white type sits on a coloured fill. Now
# that BG is the tinted page, those sites need an explicit white or the type goes
# dirty against the accent behind it.
ON_DARK  = RGBColor(0xFF, 0xFF, 0xFF)
HERO_SUB = RGBColor(0xCA, 0xDC, 0xFC)   # subtitle on the navy plate
HERO_DIM = RGBColor(0x8F, 0xA3, 0xCC)   # footnote on the navy plate

# Workflow and Executive set titles in Cambria; matching that is most of what
# makes the decks look related.
TITLE_FONT = 'Cambria'

W, H = Inches(13.333), Inches(7.5)

prs = Presentation()
prs.slide_width = W
prs.slide_height = H
BLANK = prs.slide_layouts[6]


# ── Low-level helpers ──────────────────────────────────────────────────────────
def _noline(shape):
    shape.line.fill.background()
    shape.shadow.inherit = False
    return shape

def box(slide, x, y, w, h, fill=None, line=None, round_=False, radius=0.12):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if round_:
        try: shp.adjustments[0] = radius
        except Exception: pass
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line; shp.line.width = Pt(0.75)
    shp.shadow.inherit = False
    return shp

# ── Emoji font handling ──────────────────────────────────────────────────────
# A run that mixes text and emoji and is set to Calibri leaves the emoji to font
# fallback: Calibri carries no colour-emoji coverage, so the glyph resolves to
# whatever the viewing machine happens to offer — or to an empty box. Splitting
# the run and naming an emoji font for the pictographic part makes the deck
# render the same on someone else's laptop as it does on ours.
#
# Dingbats (U+2700-27BF, e.g. the tick and cross) are deliberately NOT routed
# here: Calibri draws them cleanly as typographic marks, and pushing them to an
# emoji font would turn a neat tick into a colour sticker.
# U+2700-27BF is split deliberately: the tick/cross family (U+2713-2718)
# renders as clean typographic marks in Calibri, but its neighbours (the
# pencil, the question mark) render as colour emoji on most systems and so
# belong with the pictographs.
_PICTO = re.compile('([\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u2712\u2719-\u27BF\uFE0F]+)')
EMOJI_FONT = 'Segoe UI Emoji'


def _emit_runs(p, t, size, color, bold, italic, base_font='Calibri'):
    """Add `t` to paragraph `p`, giving pictographs an emoji font."""
    for part in _PICTO.split(t):
        if not part:
            continue
        run = p.add_run()
        run.text = part
        f = run.font
        f.size = Pt(size)
        f.color.rgb = color
        f.bold = bold
        f.italic = italic
        if _PICTO.fullmatch(part):
            f.name = EMOJI_FONT
        elif base_font:
            f.name = base_font


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         space_after=4, line_spacing=1.0, font='Calibri'):
    """runs: list of paragraphs; each paragraph = list of (text, size, color, bold[, italic])."""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        p.line_spacing = line_spacing
        for r in para:
            t, size, color, bold = r[0], r[1], r[2], r[3]
            italic = r[4] if len(r) > 4 else False
            _emit_runs(p, t, size, color, bold, italic, base_font=font)
    return tb

def logo(slide, x=Inches(0.35), y=Inches(0.22), scale=1.0, on_dark=False):
    """CostVision logo — indigo rounded 'cv' badge + blue wordmark + grey tagline."""
    s = scale
    badge = box(slide, x, y, Inches(0.42 * s), Inches(0.42 * s),
                fill=ON_DARK if on_dark else INDIGO, round_=True, radius=0.28)
    tf = badge.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = 'cv'
    r.font.size = Pt(17 * s); r.font.bold = True; r.font.name = 'Calibri'
    r.font.color.rgb = NAVY if on_dark else ON_DARK
    text(slide, x + Inches(0.52 * s), y - Inches(0.03 * s), Inches(2.6), Inches(0.32),
         [[('CostVision', 18 * s, ON_DARK if on_dark else BLUE, True)]])
    text(slide, x + Inches(0.52 * s), y + Inches(0.24 * s), Inches(2.8), Inches(0.22),
         [[('SHOULD-COST  INTELLIGENCE', 7.5 * s, HERO_DIM if on_dark else MUTED, False)]])

def notes(slide, txt):
    slide.notes_slide.notes_text_frame.text = txt

def header(title, kicker=None):
    """New slide with logo header + underline + title. Returns slide."""
    slide = prs.slides.add_slide(BLANK)
    box(slide, 0, 0, W, H, fill=BG)                       # background
    logo(slide)
    box(slide, 0, Inches(0.78), W, Pt(2.2), fill=NAVY)    # header rule
    if kicker:
        text(slide, Inches(0.45), Inches(0.95), Inches(11.5), Inches(0.3),
             [[(kicker.upper(), 11, BLUE, True)]])
        ty = Inches(1.22)
    else:
        ty = Inches(1.02)
    text(slide, Inches(0.45), ty, Inches(12.4), Inches(0.6), [[(title, 27, DARK, True)]],
         font=TITLE_FONT)
    return slide

def kpi_card(slide, x, y, w, h, big, label, sub, color=BLUE):
    box(slide, x, y, w, h, fill=PANEL, round_=True, radius=0.10)
    box(slide, x, y, Inches(0.07), h, fill=color)
    text(slide, x + Inches(0.22), y + Inches(0.14), w - Inches(0.35), Inches(0.55),
         [[(big, 25, color, True)]])
    text(slide, x + Inches(0.22), y + Inches(0.68), w - Inches(0.35), Inches(0.3),
         [[(label, 12.5, DARK, True)]])
    text(slide, x + Inches(0.22), y + Inches(0.98), w - Inches(0.35), h - Inches(1.05),
         [[(sub, 10, MUTED, False)]], line_spacing=1.05)

def chevron(slide, x, y, w, h, label, sub, color):
    shp = slide.shapes.add_shape(MSO_SHAPE.CHEVRON, x, y, w, h)
    shp.adjustments[0] = 0.28
    shp.fill.solid(); shp.fill.fore_color.rgb = color
    _noline(shp)
    tf = shp.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.16); tf.margin_right = Inches(0.05)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = label
    r.font.size = Pt(12.5); r.font.bold = True; r.font.color.rgb = ON_DARK; r.font.name = 'Calibri'
    p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.LEFT
    r2 = p2.add_run(); r2.text = sub
    r2.font.size = Pt(8.5); r2.font.color.rgb = RGBColor(0xE8, 0xEE, 0xFF); r2.font.name = 'Calibri'

def style_chart(chart, series_colors):
    chart.has_legend = False
    try:
        chart.value_axis.has_major_gridlines = True
        chart.value_axis.major_gridlines.format.line.color.rgb = LINE
        chart.value_axis.format.line.color.rgb = LINE
        chart.category_axis.format.line.color.rgb = LINE
        chart.value_axis.tick_labels.font.size = Pt(10)
        chart.value_axis.tick_labels.font.color.rgb = MUTED
        chart.category_axis.tick_labels.font.size = Pt(10.5)
        chart.category_axis.tick_labels.font.color.rgb = BODY
    except Exception:
        pass
    for i, ser in enumerate(chart.plots[0].series):
        ser.format.fill.solid()
        ser.format.fill.fore_color.rgb = series_colors[i % len(series_colors)]
        ser.format.line.fill.background()
    plot = chart.plots[0]
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.font.size = Pt(10.5); dl.font.bold = True; dl.font.color.rgb = DARK




def step_stack(slide, x, y, w, items, row_h=Inches(1.2), gap=Inches(0.2)):
    """Vertical stack of cards (label, body, colour) — used where a demo chart used to be.

    The charts on slides 7 and 8 plotted numbers from a seeded demo run. They were
    removed because no estimate has yet been compared with a price JLR paid; this
    shows HOW the mechanism switches on instead, with no invented figures."""
    for i, (label, body, col) in enumerate(items):
        yy = y + i * (row_h + gap)
        box(slide, x, yy, w, row_h, fill=PANEL, round_=True, radius=0.08)
        box(slide, x, yy, Inches(0.09), row_h, fill=col)
        text(slide, x + Inches(0.3), yy + Inches(0.14), w - Inches(0.5), Inches(0.35),
             [[(label, 13.5, col, True)]])
        text(slide, x + Inches(0.3), yy + Inches(0.5), w - Inches(0.5), row_h - Inches(0.55),
             [[(body, 11.5, BODY, False)]], line_spacing=1.1)


# ════════════════════════════════════════════════════════════════════════════
# 1 — TITLE
# ════════════════════════════════════════════════════════════════════════════
# A navy plate, as the Workflow and Executive decks open on. This is the only
# slide in the deck where white type is correct.
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=NAVY)
box(s, 0, 0, W, Inches(0.16), fill=BLUE)
logo(s, x=Inches(0.5), y=Inches(0.45), scale=1.25, on_dark=True)
text(s, Inches(0.9), Inches(2.35), Inches(11.5), Inches(1.0),
     [[('How CostVision learns', 46, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.9), Inches(3.35), Inches(11.0), Inches(0.6),
     [[('It remembers our parts, learns from real prices and watches for gaps.', 19, HERO_SUB, False)],
      [('The learning is plain arithmetic, so it works with AI switched off.', 19, HERO_SUB, False)]])
for i, (t, c) in enumerate([('Remembers', BLUE), ('Recognises', CYAN), ('Corrects itself', VIOLET), ('Keeps watch', GREEN)]):
    x = Inches(0.9 + i * 2.85)
    chip = box(s, x, Inches(4.6), Inches(2.6), Inches(0.52), fill=ON_DARK, round_=True, radius=0.5)
    tf = chip.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = t; r.font.size = Pt(13); r.font.bold = True; r.font.color.rgb = c; r.font.name = 'Calibri'
text(s, Inches(0.9), Inches(6.5), Inches(11), Inches(0.4),
     [[('Management briefing  ·  September 2026  ·  AI is switched off in the JLR build', 12, HERO_DIM, False)]])
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=BLUE)

# ════════════════════════════════════════════════════════════════════════════
# 2 — EXECUTIVE SUMMARY
# ════════════════════════════════════════════════════════════════════════════
s = header('What we built — in one slide', 'Executive summary')
kpi_card(s, Inches(0.45), Inches(2.0), Inches(3.0), Inches(1.75), '3', 'Real prices to learn',
         'After 3 logged real prices for a process, it corrects its estimate and its range.', GREEN)
kpi_card(s, Inches(3.65), Inches(2.0), Inches(3.0), Inches(1.75), 'Every 6 h', 'Background check',
         'Stored parts are re-checked for price gaps while the tool is running.', RED)
kpi_card(s, Inches(6.85), Inches(2.0), Inches(3.0), Inches(1.75), 'AI off', 'Nothing here needs AI',
         'The learning is arithmetic: medians, matches and gaps. It works at JLR today.', CYAN)
kpi_card(s, Inches(10.05), Inches(2.0), Inches(2.85), Inches(1.75), '2,438', 'Automated tests',
         'Plus a hand-calc match to under 0.01% and 6 real parts pinned.', VIOLET)
box(s, Inches(0.45), Inches(4.1), Inches(12.45), Inches(2.7), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(4.35), Inches(11.9), Inches(2.3),
     [[('The idea, in plain words', 15, DARK, True)],
      [('Costing used to start from zero each time, and the answer depended on who did it. ', 13.5, BODY, False),
       ('Now the tool remembers. ', 13.5, DARK, True),
       ('Every costing is kept, every real price teaches it, and every new part is compared with what we have costed before.', 13.5, BODY, False)],
      [('Honest limit: ', 13.5, DARK, True),
       ('it starts empty. No estimate has yet been compared with a price JLR paid. That begins when we log real prices.', 13.5, BODY, False)]],
     space_after=8, line_spacing=1.15)

# ════════════════════════════════════════════════════════════════════════════
# 3 — WHAT "LEARNING" MEANS
# ════════════════════════════════════════════════════════════════════════════
s = header('What "learning" means here — four plain words', 'The concept')
cards = [
    ('1', 'Remembers', 'Every costing is saved: the part, its inputs, its result and any real price. Shared by everyone on the same installation.', BLUE),
    ('2', 'Recognises', 'Cost a new part and it shows up to three similar parts costed before, and says why they match.', CYAN),
    ('3', 'Corrects itself', 'Log the real price. After 3 for a process, it corrects its estimate and shows its own error.', VIOLET),
    ('4', 'Keeps watch', 'Every 6 hours it re-checks stored parts and flags where a real price is far from the should-cost.', GREEN),
]
for i, (num, t, d, c) in enumerate(cards):
    x = Inches(0.45 + i * 3.24)
    box(s, x, Inches(2.1), Inches(3.02), Inches(3.6), fill=PANEL, round_=True, radius=0.07)
    box(s, x, Inches(2.1), Inches(3.02), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(2.35), Inches(2.5), Inches(0.6), [[(num, 28, c, True)]])
    text(s, x + Inches(0.25), Inches(3.05), Inches(2.55), Inches(0.45), [[(t, 17, c, True)]])
    text(s, x + Inches(0.25), Inches(3.55), Inches(2.55), Inches(2.0), [[(d, 11.5, BODY, False)]], line_spacing=1.15)
text(s, Inches(0.45), Inches(6.0), Inches(12.4), Inches(0.9),
     [[('Deliberate design choice: ', 12.5, DARK, True),
       ('none of this uses AI. It is simple statistics over our own data: medians, match scores and price gaps. '
        'Every suggestion shows its source parts and its arithmetic, so it can be defended in front of a supplier.', 12.5, BODY, False)]],
     line_spacing=1.15)

# ════════════════════════════════════════════════════════════════════════════
# 4 — THE LEARNING LOOP
# ════════════════════════════════════════════════════════════════════════════
s = header('How it works — the learning loop', 'How it works')
steps = [
    ('1 · Cost', 'Engineer costs a part as usual', BLUE),
    ('2 · Remember', 'Saved to the knowledge base', INDIGO),
    ('3 · Recognise', 'Similar past parts shown', CYAN),
    ('4 · Suggest', 'Median cost, material, real prices', VIOLET),
    ('5 · Learn', 'Real price logged → corrects after 3', AMBER),
    ('6 · Watch', 'Background check flags gaps', GREEN),
]
cw = Inches(2.24)
for i, (t, d, c) in enumerate(steps):
    chevron(s, Inches(0.4) + int(cw * 0.86) * i, Inches(2.4), cw, Inches(1.15), t, d, c)
# feedback arrow
arr = s.shapes.add_shape(MSO_SHAPE.BENT_UP_ARROW, Inches(5.6), Inches(3.85), Inches(6.2), Inches(0.85))
arr.rotation = 180
arr.fill.solid(); arr.fill.fore_color.rgb = LINE
_noline(arr)
text(s, Inches(4.7), Inches(4.9), Inches(4.6), Inches(0.35),
     [[('…each real price feeds the next estimate', 12, MUTED, False, True)]], align=PP_ALIGN.CENTER)
box(s, Inches(0.45), Inches(5.5), Inches(12.45), Inches(1.35), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(5.72), Inches(11.9), Inches(1.0),
     [[('Very little extra work. ', 13, DARK, True),
       ('Steps 2, 3, 4 and 6 happen by themselves when you are signed in. The one new habit is one click, '
        '"Log Actual £", when a real supplier price arrives. That click is what the whole loop learns from.', 13, BODY, False)]],
     line_spacing=1.2)

# ════════════════════════════════════════════════════════════════════════════
# 5 — MEMORY: KNOWLEDGE BASE
# ════════════════════════════════════════════════════════════════════════════
s = header('The memory — a shared knowledge base', 'Capability 1 of 5')
box(s, Inches(0.45), Inches(2.0), Inches(6.0), Inches(4.6), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.25), Inches(5.5), Inches(0.4), [[('What is stored for every costing', 15, DARK, True)]])
rows = [
    ('Part fingerprint', 'process, material, weight, size, region, volume'),
    ('The cost result', 'the total and the 8 cost buckets'),
    ('Real prices', 'the supplier quote or PO price, once logged'),
    ('When it was costed', 'so old, unchecked estimates can be flagged'),
    ('CAD shape data', 'size, volume and hole count, when a CAD file was used'),
]
for i, (a, b) in enumerate(rows):
    y = Inches(2.75 + i * 0.72)
    box(s, Inches(0.75), y, Inches(0.09), Inches(0.55), fill=BLUE)
    text(s, Inches(1.0), y, Inches(5.2), Inches(0.62),
         [[(a + ' — ', 12.5, DARK, True), (b, 12.5, BODY, False)]], line_spacing=1.05)
box(s, Inches(6.85), Inches(2.0), Inches(6.05), Inches(4.6), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.25), Inches(5.5), Inches(0.4), [[('Why it matters to us', 15, DARK, True)]])
pts = [
    ('Shared, not personal', 'One engineer\'s costing helps the next person on the same installation.'),
    ('Stays with us', 'Kept in the tool\'s own database on our laptop or server. Nothing is sent out.'),
    ('No duplicates', 'Re-costing a part with the same name and process updates its record.'),
    ('Grows with use', 'It starts empty. It gets more useful as parts and real prices go in.'),
]
for i, (a, b) in enumerate(pts):
    y = Inches(2.75 + i * 0.92)
    text(s, Inches(7.15), y, Inches(5.5), Inches(0.85),
         [[('•  ' + a, 13, GREEN, True)], [(b, 11.5, BODY, False)]], line_spacing=1.05, space_after=2)

# ════════════════════════════════════════════════════════════════════════════
# 6 — RECOGNITION & SUGGESTIONS
# ════════════════════════════════════════════════════════════════════════════
s = header('Recognition — "we have costed this before"', 'Capability 2 of 5')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.4),
     [[('When an engineer costs a new part, the tool looks through past costings and shows this straight away:', 13.5, BODY, False)]])
box(s, Inches(0.45), Inches(2.4), Inches(12.45), Inches(3.1), fill=PANEL, round_=True, radius=0.05)
box(s, Inches(0.45), Inches(2.4), Inches(0.09), Inches(3.1), fill=CYAN)
text(s, Inches(0.8), Inches(2.6), Inches(11.8), Inches(0.35),
     [[('Similar past parts', 14, DARK, True),
       ('      (up to 3 · same process only · 55% match or better)', 10.5, MUTED, False)]])
matches = [
    ('How close', 'a match score for each past part', 'What matched', 'material, weight, size, region'),
    ('What it cost', 'our should-cost at the time', 'What we paid', 'the real price, if one was logged'),
    ('Which part', 'named, so you can open it', 'No match?', 'it says so, and learns a new family'),
]
for i, (n, m, e, a) in enumerate(matches):
    y = Inches(3.05 + i * 0.5)
    text(s, Inches(0.9), y, Inches(6.6), Inches(0.42),
         [[(n, 12.5, DARK, True), ('   ' + m, 10.5, MUTED, False)]])
    text(s, Inches(8.0), y, Inches(4.6), Inches(0.42),
         [[(e, 12.5, DARK, True), ('   ' + a, 10.5, VIOLET, False)]])
sugg = [
    ('•  Median cost of the similar parts', BODY),
    ('•  The material most of them used', BODY),
    ('•  A warning if this estimate is 15% or more away from them, naming the cost bucket that differs most', VIOLET),
]
for i, (t, c) in enumerate(sugg):
    text(s, Inches(0.9), Inches(4.6 + i * 0.3), Inches(11.6), Inches(0.3), [[(t, 11.5, c, False)]])
box(s, Inches(0.45), Inches(5.8), Inches(12.45), Inches(1.0), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(5.97), Inches(11.9), Inches(0.75),
     [[('Every match says what matched and how strongly, and every suggestion names its source parts. ', 12.5, BODY, False),
       ('Nothing is hidden.', 12.5, DARK, True)]], line_spacing=1.15)

# ════════════════════════════════════════════════════════════════════════════
# 7 — SELF-CORRECTION
# ════════════════════════════════════════════════════════════════════════════
s = header('Self-correction — it learns from real prices', 'Capability 3 of 5')
step_stack(s, Inches(0.45), Inches(2.15), Inches(6.6), [
    ('0 to 2 real prices', 'No correction yet. The tool tells you how many more it needs.', MUTED),
    ('3 or more real prices', 'Correction switched on: the estimate is scaled by the median of real ÷ estimate.', GREEN),
    ('Every price after that', 'The correction and the error figures are worked out again.', BLUE),
])
text(s, Inches(0.45), Inches(6.25), Inches(6.6), Inches(0.5),
     [[('How the correction switches on. No JLR prices have been logged yet.', 10.5, MUTED, False, True)]])
box(s, Inches(7.45), Inches(2.15), Inches(5.45), Inches(4.6), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.75), Inches(2.4), Inches(4.9), Inches(4.2),
     [[('How it works, simply', 15, DARK, True)],
      [('1.  A real price arrives. One click logs it, or paste past prices as a CSV.', 12.5, BODY, False)],
      [('2.  The tool compares its estimate with the real price.', 12.5, BODY, False)],
      [('3.  It uses the narrowest group with 3 prices: process + material + region, then process + material, then process.', 12.5, BODY, False)],
      [('4.  It shows its error before and after, openly.', 12.5, BODY, False)],
      [('Why groups matter: ', 12.5, DARK, True),
       ('one process can run low while another runs high. Averaged together they look "fine". Correcting each group separately stops that.', 12.5, BODY, False)]],
     space_after=10, line_spacing=1.12)

# ════════════════════════════════════════════════════════════════════════════
# 8 — HONEST UNCERTAINTY
# ════════════════════════════════════════════════════════════════════════════
s = header('Honest ranges — the band follows the real error', 'Capability 4 of 5')
step_stack(s, Inches(0.45), Inches(2.15), Inches(5.9), [
    ('Before any real prices', 'The range comes from how well each input is known (Monte Carlo).', AMBER),
    ('After 3 real prices', 'The range comes from the error the tool actually made on those prices.', GREEN),
    ('A floor on precision', 'Three lucky prices cannot make it claim a razor-thin range.', BLUE),
])
text(s, Inches(0.45), Inches(6.25), Inches(5.9), Inches(0.5),
     [[('What sets the width of the range on each result', 10.5, MUTED, False, True)]])
box(s, Inches(6.75), Inches(2.15), Inches(6.15), Inches(4.6), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.05), Inches(2.4), Inches(5.6), Inches(4.2),
     [[('Every estimate comes as a range', 15, DARK, True)],
      [('Optimistic P10  ·  Most likely P50  ·  Conservative P90', 12.5, BLUE, True)],
      [('A single number suggests a precision an early estimate does not have. The range tells a buyer how far '
        'to trust the number, and where to aim in a negotiation.', 12.5, BODY, False)],
      [('Earned, not guessed: ', 12.5, DARK, True),
       ('once real prices exist, the width follows how right the tool has been. If it has been right, the range '
        'narrows. If it has been wrong, the range widens and says so.', 12.5, BODY, False)]],
     space_after=10, line_spacing=1.15)

# ════════════════════════════════════════════════════════════════════════════
# 9 — THE BACKGROUND CHECK
# ════════════════════════════════════════════════════════════════════════════
s = header('The background check — it flags price gaps', 'Capability 5 of 5')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.45),
     [[('While the tool is running, it re-checks every stored part every 6 hours and opens findings ', 13, BODY, False),
       ('without being asked:', 13, DARK, True)]])
findings = [
    ('RENEGOTIATE', RED, '8% or more above',
     'The real price is 8% or more above the should-cost. It works out the gap in £ a year.'),
    ('UNDERWATER PRICE', AMBER, '8% or more below',
     'The real price is 8% or more below the should-cost. Check scope and quality: the price may not last.'),
    ('STALE ESTIMATE', MUTED, '90 days, no price',
     'An estimate over 90 days old that was never checked against a real price. It asks for one.'),
]
for i, (tag, c, imp, d) in enumerate(findings):
    y = Inches(2.5 + i * 1.15)
    box(s, Inches(0.45), y, Inches(12.45), Inches(1.0), fill=PANEL, round_=True, radius=0.10)
    box(s, Inches(0.45), y, Inches(0.09), Inches(1.0), fill=c)
    text(s, Inches(0.8), y + Inches(0.13), Inches(3.3), Inches(0.4), [[(tag, 13, c, True)]])
    text(s, Inches(0.8), y + Inches(0.5), Inches(9.0), Inches(0.45), [[(d, 11.5, BODY, False)]])
    text(s, Inches(9.9), y + Inches(0.13), Inches(2.85), Inches(0.4), [[(imp, 14, c, True)]], align=PP_ALIGN.RIGHT)
box(s, Inches(0.45), Inches(6.05), Inches(12.45), Inches(0.85), fill=PANEL2, round_=True, radius=0.10)
text(s, Inches(0.75), Inches(6.2), Inches(11.9), Inches(0.6),
     [[('Worked example:  ', 13, BODY, False), ('£48 paid − £40 should-cost = £8 × 50,000 a year = £400,000 / yr', 13.5, RED, True),
       ('   (example numbers)', 11, MUTED, False)]])

# ════════════════════════════════════════════════════════════════════════════
# 10 — WHAT WORKS WITH AI OFF
# ════════════════════════════════════════════════════════════════════════════
s = header('What works with AI off — and what is switched off', 'At JLR today')
quad = [
    ('Works with AI off: CAD to Cost', 'Upload STEP, IGES or STL. The tool measures the part, applies rules, and asks the engineer where the geometry cannot decide.', GREEN),
    ('Works with AI off: checks and extras', 'Self-audit on every result, shape-based DFM checks, the negotiation pack, and a CO₂e figure next to the £.', GREEN),
    ('Switched off at JLR: AI assistant and agent', 'The chat assistant and "describe a part". Built and tested, turned off by a setting. When on, rate-limited per user.', AMBER),
    ('Switched off at JLR: reading photos and text', 'PCB photo to bill of materials, and reading RFQ free text. The tool says "AI is switched off in this installation".', AMBER),
]
for i, (t, d, c) in enumerate(quad):
    x = Inches(0.45 + (i % 2) * 6.35)
    y = Inches(2.1 + (i // 2) * 2.3)
    box(s, x, y, Inches(6.1), Inches(2.05), fill=PANEL, round_=True, radius=0.07)
    box(s, x, y, Inches(0.09), Inches(2.05), fill=c)
    text(s, x + Inches(0.3), y + Inches(0.2), Inches(5.6), Inches(0.45), [[(t, 15, c, True)]])
    text(s, x + Inches(0.3), y + Inches(0.72), Inches(5.55), Inches(1.25), [[(d, 12, BODY, False)]], line_spacing=1.15)
text(s, Inches(0.45), Inches(6.7), Inches(12.4), Inches(0.5),
     [[('Even when AI is on, it never sets a price. All of this sits on 19 manufacturing processes and 20 regions.', 12, MUTED, False, True)]])

# ════════════════════════════════════════════════════════════════════════════
# 11 — INPUTS REQUIRED
# ════════════════════════════════════════════════════════════════════════════
s = header('What it needs from us — very little', 'Inputs required')
box(s, Inches(0.45), Inches(2.05), Inches(6.0), Inches(4.3), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.3), Inches(5.4), Inches(0.4), [[('You provide', 16, BLUE, True)]])
you = [
    ('Keep costing parts as normal', 'every costing goes into the memory'),
    ('One click when a real price arrives', '"Log Actual £" is what it learns from'),
    ('Optional: a CAD file', 'STEP, IGES or STL gives sharper matching'),
    ('Optional: past prices as a CSV', 'so the correction does not start empty'),
]
for i, (a, b) in enumerate(you):
    y = Inches(2.85 + i * 0.85)
    text(s, Inches(0.75), y, Inches(5.4), Inches(0.8),
         [[(f'{i+1}.  ' + a, 13, DARK, True)], [('     ' + b, 11, MUTED, False)]], space_after=2)
box(s, Inches(6.85), Inches(2.05), Inches(6.05), Inches(4.3), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.3), Inches(5.4), Inches(0.4), [[('The tool does', 16, GREEN, True)]])
tool = [
    'Remembers every costing, one record per part',
    'Shows similar past parts and why they match',
    'Suggests median cost, material and real prices',
    'Measures its own error and corrects per group',
    'Sets the range from real error after 3 prices',
    'Re-checks stored parts and flags price gaps',
]
for i, t in enumerate(tool):
    y = Inches(2.85 + i * 0.57)
    text(s, Inches(7.15), y, Inches(5.5), Inches(0.5), [[('•  ', 13, GREEN, True), (t, 12.5, BODY, False)]])

# ════════════════════════════════════════════════════════════════════════════
# 12 — WHAT IS PROVEN
# ════════════════════════════════════════════════════════════════════════════
s = header('What is proven — and what is not', 'Evidence')
rows = [
    ('Engine arithmetic vs a hand calculation (reference bracket, £23.27)', 'under 0.01%', GREEN),
    ('Real production parts pinned in a regression baseline', '6 parts', GREEN),
    ('Automated tests, plus browser tests on every run', '2,438 tests', VIOLET),
    ('Real prices needed before a correction is applied', '3 per group', CYAN),
    ('Estimates compared with a price JLR actually paid', 'None yet', RED),
    ('Accuracy against real prices', 'Measured as we log them', AMBER),
]
for i, (a, b, c) in enumerate(rows):
    y = Inches(2.1 + i * 0.72)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.6), fill=(PANEL if i % 2 == 0 else BG), round_=True, radius=0.15)
    text(s, Inches(0.8), y + Inches(0.11), Inches(8.2), Inches(0.4), [[(a, 13, BODY, False)]])
    text(s, Inches(8.6), y + Inches(0.09), Inches(4.1), Inches(0.42), [[(b, 14, c, True)]], align=PP_ALIGN.RIGHT)
box(s, Inches(0.45), Inches(6.5), Inches(12.45), Inches(0.72), fill=PANEL2, round_=True, radius=0.10)
text(s, Inches(0.75), Inches(6.62), Inches(11.9), Inches(0.5),
     [[('Honest note: ', 12, DARK, True),
       ('the learning code is tested, but it has no JLR prices to learn from yet. We will report accuracy once we measure it.', 12, BODY, False)]])

# ════════════════════════════════════════════════════════════════════════════
# 13 — BENEFITS
# ════════════════════════════════════════════════════════════════════════════
s = header('What this means for the business', 'Benefits')
bens = [
    ('Quicker starts', 'A new part starts from similar past parts and real prices, not a blank sheet.', BLUE),
    ('Accuracy you can check', 'Every real price is compared with the estimate. The error is shown, not claimed.', GREEN),
    ('Knowledge stays', 'Costings and real prices stay in the tool when people move on. New starters see them from day one.', VIOLET),
    ('Gaps found early', 'The background check flags real prices far from the should-cost, in £ a year.', RED),
]
for i, (t, d, c) in enumerate(bens):
    x = Inches(0.45 + (i % 2) * 6.35)
    y = Inches(2.05 + (i // 2) * 2.25)
    box(s, x, y, Inches(6.1), Inches(2.0), fill=PANEL, round_=True, radius=0.07)
    box(s, x, y, Inches(0.09), Inches(2.0), fill=c)
    text(s, x + Inches(0.3), y + Inches(0.18), Inches(5.5), Inches(0.5),
         [[(t, 16, c, True)]])
    text(s, x + Inches(0.3), y + Inches(0.75), Inches(5.55), Inches(1.15), [[(d, 12, BODY, False)]], line_spacing=1.18)
text(s, Inches(0.45), Inches(6.6), Inches(12.4), Inches(0.6),
     [[('And it is ours: ', 13, DARK, True),
       ('the data stays on our laptop or server. Nothing is sent out, and none of it needs AI.', 13, BODY, False)]])

# ════════════════════════════════════════════════════════════════════════════
# A — CONFORMAL CONFIDENCE
# ════════════════════════════════════════════════════════════════════════════
s = header('Confidence you can defend — not just assert', 'Two kinds of range')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.45),
     [[('Each should-cost can carry two ranges: one from the inputs, and one ', 13.5, BODY, False),
       ('measured against the real prices you logged.', 13.5, DARK, True)]])
# Left: physics prior
box(s, Inches(0.45), Inches(2.5), Inches(6.05), Inches(2.5), fill=PANEL, round_=True, radius=0.06)
box(s, Inches(0.45), Inches(2.5), Inches(6.05), Inches(0.09), fill=BLUE)
text(s, Inches(0.75), Inches(2.72), Inches(5.5), Inches(0.4), [[('Input range (Monte Carlo)', 14, BLUE, True)]])
text(s, Inches(0.75), Inches(3.2), Inches(5.5), Inches(1.7),
     [[('How well the inputs are known. Needs no real prices at all.', 12, BODY, False)],
      [('Shown as P10 to P90 on every result', 14, DARK, True)],
      [('Available for every part and every process.', 11, MUTED, False, True)]],
     space_after=8, line_spacing=1.15)
# Right: empirical conformal
box(s, Inches(6.85), Inches(2.5), Inches(6.05), Inches(2.5), fill=PANEL2, round_=True, radius=0.06)
box(s, Inches(6.85), Inches(2.5), Inches(6.05), Inches(0.09), fill=GREEN)
text(s, Inches(7.15), Inches(2.72), Inches(5.5), Inches(0.4), [[('Real-price range (conformal)', 14, GREEN, True)]])
text(s, Inches(7.15), Inches(3.2), Inches(5.5), Inches(1.7),
     [[('Built from the real prices you logged for this group.', 12, BODY, False)],
      [('"90% of our real prices landed within ± X%"', 13, DARK, True)],
      [('Shown from 3 prices. The 90% guarantee holds from 9.', 11, GREEN, False, True)]],
     space_after=8, line_spacing=1.15)
box(s, Inches(0.45), Inches(5.25), Inches(12.45), Inches(1.5), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(5.45), Inches(11.9), Inches(1.2),
     [[('Why it helps:  ', 13, BLUE, True),
       ('a buyer cannot defend "trust me, it is within 5%". They can defend "90% of our real prices for this group '
        'landed within this range". The edge of the band is an error we actually saw. Today it is empty, because '
        'no JLR prices have been logged yet.', 12.5, BODY, False)]], line_spacing=1.2)

# ════════════════════════════════════════════════════════════════════════════
# B — OUTCOME-WEIGHTED FINDINGS
# ════════════════════════════════════════════════════════════════════════════
s = header('The background check learns which gaps close', 'Ranking findings by likely return')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.45),
     [[('It learns which kinds of finding turn into savings, and ranks by the money likely to come back. ', 12.5, BODY, False),
       ('Worked example — made-up numbers to show the arithmetic.', 12.5, DARK, True)]])
# comparison table
hdr = ['Finding', 'Gap (£ a year)', 'Share that closed', 'Likely to come back']
cols_x = [Inches(0.6), Inches(4.4), Inches(7.4), Inches(10.2)]
# Column widths run to the NEXT column, and the last one stops at the table's
# right edge. A flat 3.4" for every header pushed the last header 0.27" past
# the slide, where it was simply not on screen.
_tbl_right = Inches(0.45) + Inches(12.45) - Inches(0.15)
cols_w = [(cols_x[i + 1] if i + 1 < len(cols_x) else _tbl_right) - cols_x[i]
          for i in range(len(cols_x))]
box(s, Inches(0.45), Inches(2.5), Inches(12.45), Inches(0.5), fill=DARK, round_=False)
for i, htext in enumerate(hdr):
    text(s, cols_x[i], Inches(2.58), cols_w[i], Inches(0.35), [[(htext, 11.5, ON_DARK, True)]])
rows = [
    ('Cast housing', '£200k', '20% — rarely closes', '£40k', RED),
    ('Machined knuckle', '£100k', '80% — usually closes', '£80k', GREEN),
]
for i, (a, b, c, d, col) in enumerate(rows):
    y = Inches(3.0 + i * 0.62)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.6), fill=PANEL if i % 2 == 0 else BG)
    for ci, (val, sz, cl, bd) in enumerate([(a, 12.5, DARK, True), (b, 12, BODY, False),
                                            (c, 12, BODY, False), (d, 13, col, True)]):
        text(s, cols_x[ci], y + Inches(0.14), cols_w[ci], Inches(0.35), [[(val, sz, cl, bd)]])
box(s, Inches(0.45), Inches(4.5), Inches(12.45), Inches(0.95), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(4.66), Inches(11.9), Inches(0.7),
     [[('The result: ', 12.5, BLUE, True),
       ('the machining gap is half the size, but it ranks higher, because that kind of finding has usually closed. '
        'With no history yet, every kind starts at an even 50%.', 12.5, BODY, False)]],
     line_spacing=1.2)
text(s, Inches(0.45), Inches(5.7), Inches(12.4), Inches(1.0),
     [[('Why it helps:  ', 13, GREEN, True),
       ('buyer time is limited. This points it where money is likely to come back, and keeps a running total of £ '
        'actually saved. One click, "Actioned £" or "Dismiss", records what happened.', 12.5, BODY, False)]],
     line_spacing=1.2)

# ════════════════════════════════════════════════════════════════════════════
# C — NEGOTIATION COACH
# ════════════════════════════════════════════════════════════════════════════
s = header('The negotiation coach — it hands you the argument', 'From should-cost to a counter-offer')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.45),
     [[('The tool knows ', 13.5, BODY, False), ('why', 13.5, DARK, True, True),
       (' a part costs what it does, and turns that into a sentence a buyer can say out loud.', 13.5, BODY, False)]])
box(s, Inches(0.45), Inches(2.5), Inches(12.45), Inches(2.0), fill=PANEL2, round_=True, radius=0.05)
box(s, Inches(0.45), Inches(2.5), Inches(0.09), Inches(2.0), fill=BLUE)
text(s, Inches(0.8), Inches(2.72), Inches(11.8), Inches(0.35), [[('The sentence it writes — the £ and % come from your part', 12, BLUE, True)]])
text(s, Inches(0.8), Inches(3.12), Inches(11.8), Inches(1.3),
     [[('“Material is £X of this part, driven by aluminium. Every 1% move in the aluminium index shifts the '
        'piece price by £Y. ', 14, DARK, True),
       ('A quote of £Q is only justified if aluminium were about Z% above today’s index — ask the supplier to show '
        'that, or hold at the should-cost.”', 14, VIOLET, True)]], line_spacing=1.3)
box(s, Inches(0.45), Inches(4.75), Inches(6.05), Inches(2.0), fill=PANEL, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(4.95), Inches(5.5), Inches(1.7),
     [[('What it does', 13.5, DARK, True)],
      [('Links the material to its metal index, then works out, with the same overhead and margin maths the '
        'engine uses, how far a supplier’s price implies the metal has moved. No AI involved.', 11.5, BODY, False)]],
     space_after=6, line_spacing=1.18)
box(s, Inches(6.85), Inches(4.75), Inches(6.05), Inches(2.0), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(7.15), Inches(4.95), Inches(5.5), Inches(1.7),
     [[('Why it helps', 13.5, GREEN, True)],
      [('The buyer walks in with a counter-argument built on arithmetic, not "that feels high". '
        'Note: the index prices on the dashboard are indicative, not a live market feed.', 11.5, BODY, False)]],
     space_after=6, line_spacing=1.18)

# ════════════════════════════════════════════════════════════════════════════
# D — WHAT-IF ENGINE
# ════════════════════════════════════════════════════════════════════════════
s = header('What if a metal price moves?', 'The what-if check')
text(s, Inches(0.45), Inches(1.85), Inches(12.4), Inches(0.45),
     [[('Ask "what if a metal price moves?" and get the answer straight away, for one part or for every stored part.', 13.5, BODY, False)]])
box(s, Inches(0.45), Inches(2.5), Inches(6.05), Inches(2.7), fill=PANEL, round_=True, radius=0.06)
box(s, Inches(0.45), Inches(2.5), Inches(6.05), Inches(0.09), fill=BLUE)
text(s, Inches(0.75), Inches(2.72), Inches(5.5), Inches(0.4), [[('One part — the slider', 14, BLUE, True)]])
text(s, Inches(0.75), Inches(3.2), Inches(5.5), Inches(1.9),
     [[('Drag a metal index from −20% to +20% and the piece price is worked out again as you move.', 12, BODY, False)],
      [('Example:  "aluminium +15% — what is this part now?"', 13.5, DARK, True)],
      [('Sensitivity in one move of the mouse.', 11, MUTED, False, True)]],
     space_after=8, line_spacing=1.15)
box(s, Inches(6.85), Inches(2.5), Inches(6.05), Inches(2.7), fill=PANEL, round_=True, radius=0.06)
box(s, Inches(6.85), Inches(2.5), Inches(6.05), Inches(0.09), fill=VIOLET)
text(s, Inches(7.15), Inches(2.72), Inches(5.5), Inches(0.4), [[('Every stored part — the scenario', 14, VIOLET, True)]])
text(s, Inches(7.15), Inches(3.2), Inches(5.5), Inches(1.9),
     [[('Apply one move to every stored part at once and see which ones change status.', 12, BODY, False)],
      [('Example:  "if steel +10%, which parts go underwater, and how much £ a year is at risk?"', 13.5, DARK, True)],
      [('See the risk before the market moves.', 11, MUTED, False, True)]],
     space_after=8, line_spacing=1.15)
box(s, Inches(0.45), Inches(5.45), Inches(12.45), Inches(1.3), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(5.62), Inches(11.9), Inches(1.05),
     [[('Honest by design:  ', 13, AMBER, True),
       ('this is always "IF the index moves", never a price forecast. The dashboard prices are indicative, not a market '
        'feed, and they do not change any costing. If a live feed is connected later, the same maths applies.', 12.5, BODY, False)]],
     line_spacing=1.2)

# ════════════════════════════════════════════════════════════════════════════
# F — PCB PHOTO → BOM (optional AI mode, off at JLR)
# ════════════════════════════════════════════════════════════════════════════
s = header('PCB photo to BOM — built, but switched off at JLR', 'Optional AI mode · off at JLR')
text(s, Inches(0.45), Inches(1.82), Inches(12.4), Inches(0.42),
     [[('With AI on, a photo of a circuit board becomes a costed bill of materials. Reading the photo needs AI, so ', 13, BODY, False),
       ('at JLR this screen is hidden.', 13, DARK, True)]])
# Left — what works at JLR (replaces a manual-vs-AI chart from a demo run)
box(s, Inches(0.45), Inches(2.45), Inches(6.15), Inches(3.35), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.62), Inches(5.6), Inches(0.35), [[('What works at JLR, with AI off', 14, DARK, True)]])
for i, t in enumerate([
        'PCB fabrication and PCBA are costed from typed inputs.',
        'The fab price comes from fabricators\' price tables. It is a bought-in price, so no overhead or margin goes on top.',
        'The tool says "AI is switched off in this installation" instead of asking for a key.']):
    text(s, Inches(0.75), Inches(3.1 + i * 0.75), Inches(5.6), Inches(0.7),
         [[('•  ', 12, GREEN, True), (t, 12, BODY, False)]], line_spacing=1.1)
# Right — what was built for when AI is on
box(s, Inches(6.85), Inches(2.45), Inches(6.05), Inches(3.35), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.62), Inches(5.5), Inches(0.35), [[('Built for when AI is on', 14, DARK, True)]])
fixes = [
    ('Complex boards no longer come back empty', GREEN),
    ('Part prices checked against a catalogue', BLUE),
    ('One misread part can no longer skew the total', VIOLET),
    ('The board spec is steadied between runs', CYAN),
    ('The £ to trust is split from the £ to verify', AMBER),
]
for i, (a, c) in enumerate(fixes):
    y = Inches(3.05 + i * 0.55)
    box(s, Inches(7.15), y + Inches(0.05), Inches(0.09), Inches(0.42), fill=c)
    text(s, Inches(7.42), y + Inches(0.06), Inches(5.35), Inches(0.42),
         [[(a, 12, BODY, False)]], line_spacing=1.0)
box(s, Inches(0.45), Inches(5.98), Inches(12.45), Inches(0.85), fill=PANEL2, round_=True, radius=0.10)
text(s, Inches(0.75), Inches(6.12), Inches(12.0), Inches(0.6),
     [[('If switched on later:  ', 12.5, BLUE, True),
       ('it is a setting, not a rebuild. Each AI call is rate-limited per user, and lines it cannot match to the '
        'catalogue are flagged for an engineer to check.', 12, BODY, False)]],
     line_spacing=1.15)

# ════════════════════════════════════════════════════════════════════════════
# E — GLASS-BOX
# ════════════════════════════════════════════════════════════════════════════
s = header('Why ours is different — you can check every number', 'The differentiator')
box(s, Inches(0.45), Inches(2.0), Inches(12.45), Inches(1.3), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(2.2), Inches(11.9), Inches(1.0),
     [[('The principle:  ', 15, BLUE, True),
       ('every learned number is one a cost engineer can read and check: a median, a match score, a gap times a volume. '
        'No hidden weights touch the price. Even with AI on, AI never sets a price.', 13.5, BODY, False)]],
     line_spacing=1.2)
cmp = [
    ('Learns from real prices', 'A median correction per group after 3 prices; the range follows real error', GREEN),
    ('Watches in the background', 'Flags price gaps every 6 hours, and learns which kinds close', GREEN),
    ('Knows what drives cost', 'Links material cost to its metal index and writes the counter-argument', GREEN),
    ('Checkable, always', 'Every number traces to a rate or a logged price; exports carry the total to the penny', BLUE),
    ('Runs inside our walls', 'Runs on a laptop with no internet and no AI; the data stays with us', VIOLET),
]
for i, (t, d, c) in enumerate(cmp):
    y = Inches(3.5 + i * 0.66)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.58), fill=PANEL if i % 2 == 0 else BG, round_=True, radius=0.1)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.58), fill=c)
    text(s, Inches(0.75), y + Inches(0.13), Inches(3.6), Inches(0.35), [[(t, 12.5, c, True)]])
    text(s, Inches(4.5), y + Inches(0.13), Inches(8.2), Inches(0.35), [[(d, 12, BODY, False)]])

# ════════════════════════════════════════════════════════════════════════════
# GEOMETRIC DFM — the tool checks the part's shape
# ════════════════════════════════════════════════════════════════════════════
s = header('It checks the part\'s shape, not just the price', 'Shape-based DFM checks')
box(s, Inches(0.45), Inches(1.95), Inches(12.45), Inches(0.85), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.05), Inches(11.9), Inches(0.65),
     [[('The old way: ', 12.5, AMBER, True),
       ('look at the finished cost and guess what might be wrong.  ', 12.5, BODY, False),
       ('Now: ', 12.5, GREEN, True),
       ('measure the 3D model, face by face, and name the features that cost money.', 12.5, BODY, False)]],
     line_spacing=1.15)

cards = [
    ('19', 'cited rules', 'Each rule names a published source, such as the ASM Handbook, NADCA or Machinery\'s Handbook.', GREEN),
    ('6', 'process packs', 'Casting, forging, machining, injection moulding, blow moulding and sheet metal.', BLUE),
    ('Faces', 'named, not counted', 'A finding names the faces and the measured value, not "tooling looks high". Click it to see them.', INDIGO),
]
for i, (big, label, sub, col) in enumerate(cards):
    x = Inches(0.45 + i * 4.2)
    box(s, x, Inches(3.0), Inches(3.95), Inches(1.75), fill=PANEL, round_=True, radius=0.05)
    text(s, x + Inches(0.25), Inches(3.15), Inches(3.5), Inches(0.55), [[(big, 30, col, True)]])
    text(s, x + Inches(0.25), Inches(3.72), Inches(3.5), Inches(0.3), [[(label, 12, DARK, True)]])
    text(s, x + Inches(0.25), Inches(4.05), Inches(3.5), Inches(0.65),
         [[(sub, 10, BODY, False)]], line_spacing=1.12)

box(s, Inches(0.45), Inches(4.95), Inches(12.45), Inches(1.45), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(5.08), Inches(11.9), Inches(0.35),
     [[('It runs by itself, and it says what it did NOT check', 14, DARK, True)]])
for i, t in enumerate([
        'The check runs in the background after a STEP or IGES upload. Nobody waits for it.',
        'Each finding carries the measured value, the limit and the source it came from.',
        'Every part also lists what could not be checked, so a short list is never mistaken for a clean part.']):
    text(s, Inches(0.75), Inches(5.48 + i * 0.31), Inches(11.9), Inches(0.3),
         [[('•  ', 11, GREEN, True), (t, 11, BODY, False)]])
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)

# ════════════════════════════════════════════════════════════════════════════
# GEARS — the engine reasons about the process route
# ════════════════════════════════════════════════════════════════════════════
s = header('Gears: it picks the process route, not just the price', 'Asked for by cost engineering and the plant')
box(s, Inches(0.45), Inches(1.95), Inches(12.45), Inches(0.8), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.05), Inches(11.9), Inches(0.6),
     [[('Ask for a more accurate gear and the tool does not multiply the price. ', 12.5, BODY, False),
       ('It adds the machine that the accuracy needs.', 12.5, GREEN, True)]], line_spacing=1.15)

# Drawn as a route rather than typed as a sentence: the claim is that a tighter
# class ADDS stations, and a chain of boxes shows that instantly where an arrow
# inside a text string does not. `added` marks the station the class bought.
# The £ figures that used to sit on the right came from one demo run and are not
# pinned by any test, so the right-hand column now names the difference instead.
rows = [
    ('Loose gear (ISO 9)',         ['Cut teeth', 'Deburr', 'Check'],                     'base route',   GREEN, []),
    ('Hardened, accurate (ISO 6)', ['Cut teeth', 'Deburr', 'Harden', 'Grind', 'Check'],  '+ grind',      AMBER, [3]),
    ('Internal ring gear',         ['Power-skive', 'Deburr', 'Harden', 'Check'],         'skive, no hob', BLUE, []),
]
STEP_W, STEP_H, STEP_GAP, ROUTE_X = Inches(1.25), Inches(0.42), Inches(0.24), Inches(3.85)
for i, (what, steps, tag, col, added) in enumerate(rows):
    y = Inches(2.95 + i * 0.78)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.68), fill=PANEL, round_=True, radius=0.04)
    text(s, Inches(0.72), y, Inches(3.0), Inches(0.68), [[(what, 12, DARK, True)]], anchor=MSO_ANCHOR.MIDDLE)
    for k, st in enumerate(steps):
        sx = ROUTE_X + k * (STEP_W + STEP_GAP)
        is_new = k in added
        box(s, sx, y + Inches(0.13), STEP_W, STEP_H, fill=col if is_new else BG,
            line=None if is_new else MUTED, round_=True, radius=0.06)
        text(s, sx, y + Inches(0.13), STEP_W, STEP_H,
             [[(st, 9.5, ON_DARK if is_new else BODY, is_new)]],
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        if k < len(steps) - 1:
            arrow = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, sx + STEP_W + Inches(0.04),
                                       y + Inches(0.27), STEP_GAP - Inches(0.08), Inches(0.14))
            arrow.fill.solid(); arrow.fill.fore_color.rgb = MUTED
            arrow.line.fill.background()
            arrow.shadow.inherit = False
    text(s, Inches(10.9), y, Inches(1.85), Inches(0.68), [[(tag, 13, col, True)]],
         align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
box(s, ROUTE_X, Inches(5.35), Inches(0.22), Inches(0.13), fill=AMBER, round_=True, radius=0.03)
text(s, ROUTE_X + Inches(0.3), Inches(5.28), Inches(8.0), Inches(0.26),
     [[('= the step the tighter class ADDED — not the same work costing more', 10, MUTED, False, True)]],
     anchor=MSO_ANCHOR.MIDDLE)

box(s, Inches(0.45), Inches(5.62), Inches(6.1), Inches(1.2), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.72), Inches(5.74), Inches(5.6), Inches(0.3), [[('It refuses rather than guesses', 12.5, GREEN, True)]])
text(s, Inches(0.72), Inches(6.07), Inches(5.6), Inches(0.65),
     [[('A gear no machine in the library can make is blocked. It is never quietly costed on the nearest machine.', 10.5, BODY, False)]],
     line_spacing=1.12)
box(s, Inches(6.8), Inches(5.62), Inches(6.1), Inches(1.2), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.07), Inches(5.74), Inches(5.6), Inches(0.3), [[('And it says what it does not know', 12.5, AMBER, True)]])
text(s, Inches(7.07), Inches(6.07), Inches(5.6), Inches(0.65),
     [[('The gear shop figures are representative until the plant supplies its own. Every gear estimate prints that warning.', 10.5, BODY, False)]],
     line_spacing=1.12)
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)

# ════════════════════════════════════════════════════════════════════════════
# NEXT STEPS
# ════════════════════════════════════════════════════════════════════════════
s = header('Where we are, and the ask', 'Next steps')
box(s, Inches(0.45), Inches(2.0), Inches(6.0), Inches(4.4), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.25), Inches(5.4), Inches(0.4), [[('Status today', 16, GREEN, True)]])
st = [
    'Built and tested: 2,438 tests across the tool',
    'Works with AI off: nothing here needs AI',
    'No extra licence: part of CostVision',
    'Runs on our laptop: no data leaves',
]
for i, t in enumerate(st):
    text(s, Inches(0.75), Inches(2.8 + i * 0.55), Inches(5.4), Inches(0.5),
         [[('•  ', 13, GREEN, True), (t, 12.5, BODY, False)]])
text(s, Inches(0.75), Inches(5.15), Inches(5.4), Inches(1.1),
     [[('Honest note: ', 12, DARK, True),
       ('it starts empty, and no estimate has yet been compared with a price JLR paid. The value builds as we log real prices.', 12, BODY, False)]],
     line_spacing=1.15)
box(s, Inches(6.85), Inches(2.0), Inches(6.05), Inches(4.4), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.25), Inches(5.4), Inches(0.4), [[('The ask — three small decisions', 16, BLUE, True)]])
asks = [
    ('1.  Adopt the habit', '"Log Actual £" on every quote. One click each.'),
    ('2.  Seed the correction', 'Import past quotes as a CSV, so it starts with data.'),
    ('3.  Review the findings', 'Background check findings on the monthly sourcing agenda.'),
]
for i, (a, b) in enumerate(asks):
    y = Inches(2.85 + i * 1.05)
    text(s, Inches(7.15), y, Inches(5.5), Inches(1.0),
         [[(a, 13.5, DARK, True)], [('     ' + b, 11.5, BODY, False)]], space_after=3, line_spacing=1.1)
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)

# ════════════════════════════════════════════════════════════════════════════
# SPEAKER NOTES — spoken aloud, first person, plain, honest about limits.
# Applied in slide order.
# ════════════════════════════════════════════════════════════════════════════
SPEAKER_NOTES = [
    # 1 — TITLE
    "Thanks for the time. This deck is about the learning side of CostVision: how it remembers the parts we cost, "
    "how it learns from the real prices we pay, and how it keeps an eye out for price gaps. I want to be clear about "
    "one thing up front. In the JLR build, AI is switched off, because we don't have AI approval yet. That's fine for "
    "this story, because everything I'm going to show you on the learning side is plain arithmetic. Medians, match "
    "scores, gaps between two prices. None of it needs AI, so it works on a locked-down laptop today. Where a feature "
    "does need AI, I'll say so and I'll say it's switched off. And I'll be honest about what's proven and what isn't.",

    # 2 — EXECUTIVE SUMMARY
    "Here's the short version. First, after three real prices are logged for a process, the tool starts correcting "
    "its own estimates and its range. Second, a background check looks over every stored part every six hours, while "
    "the tool is running, and flags where we're paying well above or below the should-cost. Third, none of this needs "
    "AI. It's all simple sums. Fourth, the tool as a whole has 2,438 automated tests, a hand calculation it matches to "
    "under a hundredth of a percent, and six real production parts pinned so they can't drift. Now the honest bit. The "
    "memory starts empty, and we haven't yet compared any estimate with a price JLR actually paid. So I'm not going to "
    "quote you an accuracy figure. That comes once we start logging real prices.",

    # 3 — WHAT LEARNING MEANS
    "The word agentic gets used a lot, so let me keep it to four plain words. It remembers: every costing is saved, "
    "with the inputs and the result. It recognises: when you cost a new part, it shows you up to three similar ones "
    "we've done before and tells you why they match. It corrects itself: once there are three real prices for a "
    "process, it adjusts the estimate and shows its own error. And it keeps watch: every six hours it re-checks stored "
    "parts for price gaps. The design choice I care about most is at the bottom. There's no AI in any of this. Every "
    "suggestion shows which parts it came from and how it was worked out. That's what lets a buyer use it in front of "
    "a supplier without being caught out.",

    # 4 — THE LEARNING LOOP
    "This is the whole loop on one slide. The engineer costs a part exactly as they do today. When they're signed in, "
    "the tool saves that costing, looks for similar parts, and shows suggestions like the median cost of those parts "
    "and the material they used. That all happens on its own. The one new habit is step five. When a real supplier "
    "price comes in, someone clicks Log Actual pounds. That's it. That single click is what the tool learns from. Once "
    "a process has three of those, the correction switches on. And step six, the background check, uses the same real "
    "prices to flag gaps. So the extra work is small. But I'll be straight: if nobody logs real prices, the loop has "
    "nothing to learn from.",

    # 5 — MEMORY
    "Capability one is the memory. For every costing, the tool keeps a fingerprint of the part: the process, the "
    "material, the weight, the size, the region and the annual volume. It keeps the result, all eight cost buckets. It "
    "keeps the real price once someone logs it, and the date it was costed. If a CAD file was used, it also keeps some "
    "shape data, like size, volume and hole count. On the right is why that matters. It's shared by everyone on the "
    "same installation, so one engineer's work helps the next. It stays in the tool's own database, on our laptop or "
    "our server, and nothing is sent out. If you re-cost a part with the same name and process, it updates the record "
    "rather than making a copy. And it starts empty, so it gets more useful the more we use it.",

    # 6 — RECOGNITION
    "Capability two is recognition. When an engineer costs a new part, the tool looks through past costings of the "
    "same process and shows up to three that match at fifty-five percent or better. For each one it shows a match "
    "score and what matched, such as material family, weight, size or region. It shows what that part cost and, if "
    "we logged one, what we actually paid. Then it makes a few suggestions: the median cost of the similar parts, the "
    "material most of them used, and a warning if this new estimate is fifteen percent or more away from them. That "
    "warning names the cost bucket that differs most, so you know where to look. Nothing here is a guess from a black "
    "box. Every suggestion names the parts it came from.",

    # 7 — SELF-CORRECTION
    "Capability three is self-correction. When a real price arrives, you click once to log it, or you can paste in a "
    "batch of past prices as a CSV. The tool compares its estimate with the real price. With fewer than three prices "
    "for a group, it does nothing except tell you how many more it needs. At three, it takes the median of real price "
    "divided by estimate and applies that as a correction. It uses the narrowest group that has three prices: process "
    "plus material plus region first, then process plus material, then the process on its own. And it shows its error "
    "before and after. Why groups? Because one process can run low and another high, and in an average they cancel "
    "out. I used to show a chart here from a demo. I've taken it out, because we have no JLR prices in it yet.",

    # 8 — HONEST RANGES
    "Capability four is about being honest on precision. Every result comes as a range: an optimistic end, a most "
    "likely figure, and a conservative end. Before we have any real prices, the width comes from how well each input "
    "is known. The tool runs a Monte Carlo simulation over every cost driver. Once there are three real prices for "
    "that group, the width comes from the error the tool actually made on them instead. There's a floor on it, so "
    "three lucky prices can't make it claim a razor-thin range. The point I'd stress is that this cuts both ways. If "
    "the tool has been right, the range narrows. If it's been wrong, the range widens and tells you so. For a buyer, "
    "the conservative end is a sensible walk-away, and the optimistic end is a stretch target.",

    # 9 — BACKGROUND CHECK
    "Capability five is the background check. While the tool is running, it goes through every stored part every six "
    "hours, and once shortly after start-up. It needs a logged real price to spot a gap. If the real price is eight "
    "percent or more above the should-cost, it opens a renegotiation finding and works out the gap in pounds a year, "
    "using the part's annual volume. If it's eight percent or more below, it flags an underwater price, because that "
    "can mean a scope mix-up or a supplier who can't sustain it. And if an estimate is over ninety days old and was "
    "never checked, it asks for a real price. The example at the bottom just shows the sum: eight pounds a part, "
    "fifty thousand parts a year. Those are example numbers, not a JLR finding.",

    # 10 — WHAT WORKS WITH AI OFF
    "This slide is the one I'd most like you to remember, because it draws the line clearly. The top two boxes work "
    "at JLR today, with AI off. CAD to Cost measures the part from a STEP, IGES or STL file, applies rules, and where "
    "the shape can't decide something, like the process route, it asks the engineer rather than guessing. The "
    "self-audit, the shape checks, the negotiation pack and the carbon figure all work too. The bottom two boxes are "
    "built but switched off at JLR: the chat assistant, describe-a-part, the PCB photo reader, and reading free-text "
    "RFQs. If they're ever switched on, it's a setting, not a rebuild, and each user is rate-limited. And even then, "
    "AI never sets a price. It only reads and classifies. The money is always arithmetic.",

    # 11 — INPUTS
    "A fair question from management is what this asks of the team. Honestly, not much. Engineers keep costing parts "
    "as they do now, and every costing goes into the memory. The one new habit is clicking Log Actual pounds when a "
    "real price arrives. There are two optional extras. Attaching a CAD file gives the matching more to work with. "
    "And importing our past quotes as a CSV means the correction doesn't start from nothing. That import is the first "
    "thing I'd do if we go ahead. On the right is what the tool does in return: it remembers, it shows similar parts, "
    "it suggests, it measures its own error, it sets the range from real error once it has three prices, and it "
    "re-checks stored parts for gaps.",

    # 12 — WHAT IS PROVEN
    "I want to be careful on this slide, so here's exactly what's proven. The engine's sums match a hand calculation "
    "on a reference machined bracket, twenty-three pounds twenty-seven, to under a hundredth of a percent. Six real "
    "production parts are pinned in a baseline, so any change that moves them fails the build. There are 2,438 "
    "automated tests, plus browser tests that cost every process and check the exports. And the correction needs "
    "three real prices per group before it does anything. Now what isn't proven. We have not yet compared a single "
    "estimate with a price JLR actually paid. So I won't give you an accuracy percentage. We'll measure it as real "
    "prices are logged, and report what we find, good or bad.",

    # 13 — BENEFITS
    "Four benefits, in plain terms. Quicker starts: a new part begins from similar past parts and real prices, "
    "instead of a blank sheet. Accuracy you can check: every real price is set against the estimate, and the error is "
    "shown on screen, not asserted in a slide. Knowledge stays: the costings and the prices stay in the tool when "
    "people move roles, and a new starter can see them from day one. And gaps found early: the background check "
    "flags real prices that are well above or below the should-cost, in pounds a year. The last line matters for "
    "approval too. The data stays on our laptop or our server. Nothing is sent out, and none of this needs AI. I "
    "haven't put a savings figure on this, because we haven't measured one yet.",

    # 14 — CONFORMAL CONFIDENCE
    "This one is a bit more technical, so I'll keep it simple. Each result can carry two ranges. On the left is the "
    "input range. It comes from a Monte Carlo run over how well each input is known, and it's there on every result, "
    "even with no real prices. On the right is a range built from the real prices we've logged for that group. It "
    "lets the tool say something like, ninety percent of our real prices landed within plus or minus so many "
    "percent. It shows up once there are three prices, but the ninety percent guarantee only really holds from about "
    "nine. Why bother? Because a buyer can't defend trust me. They can defend an error we actually saw. Today that "
    "right-hand range is empty for us, because we haven't logged any JLR prices yet.",

    # 15 — OUTCOME-WEIGHTED FINDINGS
    "This is a small loop on top of the background check. By default it ranks findings by the size of the gap. But "
    "some kinds of finding close and some never do. So when a buyer clicks Actioned pounds, or Dismiss, the tool "
    "records what happened. From that it learns, for each process and kind of finding, how often they close, and "
    "ranks by the money likely to come back. The table is a worked example with made-up numbers. A two hundred "
    "thousand pound casting gap that rarely closes is worth less than a hundred thousand pound machining gap that "
    "usually does. With no history, everything starts at an even fifty percent, and a single result can't swing it "
    "much. It also keeps a running total of pounds actually saved, which is the number I'd want to report.",

    # 16 — NEGOTIATION COACH
    "This is where a should-cost turns into something a buyer can say out loud. The tool links the material cost to "
    "the index that drives it, aluminium in this example. Then, using the same overhead and margin sums the engine "
    "already uses, it works out how much the piece price moves for each one percent move in that index. From there "
    "it can say: a quote of this much is only justified if aluminium were about this much above today's index, so "
    "ask the supplier to show that, or hold at the should-cost. I've left the numbers as letters because they come "
    "from your part. There's no AI in this. One caveat: the index prices on our dashboard are indicative, from a "
    "simulated feed, so treat it as if the metal moved this much, not as a market fact.",

    # 17 — WHAT-IF
    "Two ways to ask what happens if a metal price moves. On the left, for one part, there's a slider from minus "
    "twenty to plus twenty percent, and the piece price is worked out again as you drag it. On the right, for every "
    "stored part at once, you apply one move, say steel up ten percent, and see which parts would slip below their "
    "should-cost and how much money that puts at risk. That lets sourcing see a risk before it lands. What keeps this "
    "honest is that it's always a what-if. It never claims to forecast prices. The prices on the dashboard are "
    "indicative, not a live market feed, and they don't change any costing. If we connect a live feed later, the "
    "same sums apply. That's a plan, not something we have today.",

    # 18 — PCB PHOTO TO BOM
    "I want to be upfront about this one, because it was a highlight in earlier versions of this deck. The PCB photo "
    "reader takes a photo of a circuit board and builds a costed bill of materials. Reading the photo needs AI, so "
    "at JLR it's switched off and the screen is hidden. What does work with AI off is on the left. You can still cost "
    "PCB fabrication and assembly from typed inputs. The fab price comes from fabricators' price tables, and because "
    "it's a bought-in price, we don't add overhead or margin on top. On the right is the work done so the photo "
    "reader is solid if it's ever switched on: catalogue price checks, caps on misread parts, and a clear split "
    "between pounds you can trust and pounds to check. I've taken out the old accuracy chart.",

    # 19 — GLASS-BOX
    "If there's one message about why this is different, it's that you can check every number. Every learned value "
    "is something a cost engineer can read: a median, a match score, a gap times a volume. There are no hidden weights "
    "sitting behind the price. And even in a build where AI is on, AI never sets a price. The rows below just "
    "summarise the deck. It learns from real prices. It watches in the background and learns which gaps close. It "
    "knows what drives cost and can write the counter-argument. Every number traces back to a rate or a logged "
    "price, and the exports carry the same total to the penny. And it runs on a laptop with no internet and no AI. "
    "I'd rather win on that than on a claim I can't back up.",

    # 20 — GEOMETRIC DFM
    "This is a newer piece, and it's about shape rather than price. The old way was to look at a finished cost and "
    "guess what might be wrong with the design. Now, after a STEP or IGES upload, the tool measures the 3D model face "
    "by face and names the features that cost money. There are nineteen rules, and every one cites a published "
    "source, such as the ASM Handbook, NADCA or Machinery's Handbook. They're split into six packs: casting, forging, "
    "machining, injection moulding, blow moulding and sheet metal. A finding names the faces involved and the measured "
    "value, and you can click it to see those faces on the model. It runs in the background, so nobody waits. And "
    "every part lists what it could not check, so a short list is never taken as a clean bill of health.",

    # 21 — GEARS
    "Gears came from cost engineering and the plant asking for them. Before, a gear went through as a general "
    "machined part, and that model can't see a tooth. Look at the three rows. A loose gear, ISO class nine, is cut, "
    "deburred and checked. Ask for class six on a hardened gear and the tool doesn't just multiply the price. It adds "
    "a grinding step, because hardening distorts the teeth and only grinding can correct that. An internal ring gear "
    "can't be hobbed, because a hob can't get inside the bore, so the tool picks power skiving instead. The shape "
    "decides, not a preference. I've left the prices off, because they came from one demo run. And two honest "
    "points: if no machine we know can make the gear, it refuses. And the shop figures are representative until the "
    "plant gives us its own.",

    # 22 — NEXT STEPS
    "To close. The learning features are built and tested, as part of a tool with 2,438 automated tests. They work "
    "with AI off, there's no extra licence, and the data stays on our own laptop or server. The honest dependency is "
    "that it starts empty, and we haven't yet compared any estimate with a price JLR paid. So the ask is three small "
    "decisions. One, make Log Actual pounds part of handling every quote. It's one click. Two, import our past quotes "
    "as a CSV so the correction doesn't start from nothing. Three, put the background check's findings on the "
    "sourcing agenda each month, so someone acts on them. If we do those three things, we'll have real accuracy "
    "figures to report back, whatever they turn out to be. Thank you. Happy to take questions.",
]

_slides = list(prs.slides)
assert len(_slides) == len(SPEAKER_NOTES), f"slides={len(_slides)} notes={len(SPEAKER_NOTES)}"
for _slide, _note in zip(_slides, SPEAKER_NOTES):
    notes(_slide, _note)

OUT = 'CostVision-Agentic-AI-Management-Presentation.pptx'
prs.save(OUT)
# Without this PowerPoint refuses the file — see pptx_fixup.py.
finalise(OUT)
print(f'Wrote {OUT} with {len(prs.slides._sldIdLst)} slides')

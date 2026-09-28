#!/usr/bin/env python3
"""
CostVision and CAPEE — the business case, for the Cost Engineering Director.

Two options, in the order they would be done: Option 1 fills CAPEE's cost input
automatically from the measured 3D model and is proved on real JLR parts;
Option 2 costs a whole basket in one unattended run (scripts/bulk-cost.ts, no
AI). Option 1 comes first because it is the cheaper thing to try and it
produces the accuracy figure Option 2 rests on.

Written for a non-IT audience: plain language on the slides and in the speaker
notes, technical terms only where there is no honest substitute.

RULES THIS FILE FOLLOWS.

1. No durations. Nothing here has been scoped by JLR, so a date would be an
   invention presented as a plan. The order of work is real; its length is not.

2. No claimed savings, accuracy or speed. We have never compared a CostVision
   cost with a price JLR paid. Slide 16 states what changes in KIND only.

3. Facts agree with docs/decks/tool-facts.md (re-checked 28 September 2026):
   AI switched off in the JLR build and never sets a price; 19 manufacturing
   processes, 13 from CAD; 20 regions; rate library of 16 June 2026; bulk run,
   rate-book history and run record are built. Line counts on slide 7 were
   counted in the source on that date. Slide 21 lists how each was checked.

4. No run timings. Earlier drafts quoted seconds per part; they were not
   re-measurable here and are left out rather than carried forward.

Cross-references to slide numbers are load-bearing: if a slide moves, re-check
the references on slides 4, 5, 6, 7 and 20.

Regenerate:  python3 build_capee_options_pptx.py
Output:      CostVision-CAPEE-Implementation-Options.pptx
"""

import re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

from pptx_fixup import finalise
from brand import rgb, hexcol   # calculator/src/brand/brand.json — shared with the app (I5)

# ── Palette: identical to build_blueprint_pptx.py so the pack reads as one ────
INDIGO  = rgb('blue')
BLUE    = rgb('blue')
DARK    = rgb('navy')
BODY    = rgb('slate')
MUTED   = rgb('muted')
BG      = rgb('page')
PANEL   = RGBColor(0xFF, 0xFF, 0xFF)
PANEL2  = rgb('blueTint')
GREENBG = rgb('greenTint')
AMBERBG = rgb('amberTint')
REDBG   = rgb('redTint')
GREEN   = rgb('green')
AMBER   = rgb('amber')
RED     = rgb('red')
VIOLET  = rgb('violet')
LINE    = rgb('line')
NAVY    = rgb('navy')
ON_DARK = RGBColor(0xFF, 0xFF, 0xFF)
HERO_SUB = RGBColor(0xCA, 0xDC, 0xFC)
HERO_DIM = RGBColor(0x8F, 0xA3, 0xCC)

TITLE_FONT = 'Cambria'

W, H = Inches(13.333), Inches(7.5)
prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


def box(slide, x, y, w, h, fill=None, line=None, round_=False, radius=0.12):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if round_:
        try: shp.adjustments[0] = radius
        except Exception: pass
    if fill is None: shp.fill.background()
    else: shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if line is None: shp.line.fill.background()
    else: shp.line.color.rgb = line; shp.line.width = Pt(0.75)
    shp.shadow.inherit = False
    return shp


def _h(v, minimum=Inches(0.12)):
    """Clamp a derived height to a positive value.

    Several helpers below size an inner text box as `h - <chrome>`. When a
    caller passes a short card the result goes zero or negative, which is
    invalid OOXML: PowerPoint refuses the file and offers to repair it, while
    LibreOffice silently tolerates it. A text box does not clip its contents, so
    clamping changes nothing visually.
    """
    return v if v > minimum else minimum


_PICTO = re.compile('([\U0001F300-\U0001FAFF☀-⛿✀-✒✙-➿️]+)')
EMOJI_FONT = 'Segoe UI Emoji'


def _emit_runs(p, t, size, color, bold, italic, base_font='Calibri'):
    for part in _PICTO.split(t):
        if not part:
            continue
        run = p.add_run(); run.text = part
        f = run.font
        f.size = Pt(size); f.color.rgb = color; f.bold = bold; f.italic = italic
        if _PICTO.fullmatch(part): f.name = EMOJI_FONT
        elif base_font: f.name = base_font


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         space_after=4, line_spacing=1.0, font='Calibri'):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.space_after = Pt(space_after); p.line_spacing = line_spacing
        for r in para:
            t, size, color, bold = r[0], r[1], r[2], r[3]
            italic = r[4] if len(r) > 4 else False
            _emit_runs(p, t, size, color, bold, italic, base_font=font)
    return tb


def logo(slide, x=Inches(0.35), y=Inches(0.22), scale=1.0, on_dark=False):
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
         [[('SHOULD-COST  ENGINEERING', 7.5 * s, HERO_DIM if on_dark else MUTED, False)]])


def notes(slide, txt):
    slide.notes_slide.notes_text_frame.text = txt


def header(title, kicker=None):
    slide = prs.slides.add_slide(BLANK)
    box(slide, 0, 0, W, H, fill=BG)
    logo(slide)
    box(slide, 0, Inches(0.78), W, Pt(2.2), fill=NAVY)
    if kicker:
        text(slide, Inches(0.45), Inches(0.95), Inches(11.5), Inches(0.3),
             [[(kicker.upper(), 11, BLUE, True)]])
        ty = Inches(1.22)
    else:
        ty = Inches(1.02)
    text(slide, Inches(0.45), ty, Inches(12.4), Inches(0.6), [[(title, 27, DARK, True)]],
         font=TITLE_FONT)
    return slide


def card(slide, x, y, w, h, accent, title, lines, title_size=13, body_size=10.5,
         fill=PANEL, title_color=None):
    """White card with a coloured left rule — the pack's workhorse block."""
    box(slide, x, y, w, h, fill=fill, line=LINE, round_=True)
    box(slide, x, y, Inches(0.075), h, fill=accent)
    text(slide, x + Inches(0.22), y + Inches(0.14), w - Inches(0.4), Inches(0.3),
         [[(title, title_size, title_color or DARK, True)]])
    if lines:
        runs = [[(ln[0], body_size, ln[1] if len(ln) > 1 else BODY,
                  ln[2] if len(ln) > 2 else False)] for ln in lines]
        text(slide, x + Inches(0.22), y + Inches(0.48), w - Inches(0.4), _h(h - Inches(0.6)),
             runs, space_after=3, line_spacing=1.12)


def table(slide, x, y, w, cols, rows, col_w, head_fill=NAVY, row_h=Inches(0.34),
          size=9.5, head_size=9.5):
    """Simple native table drawn from shapes — keeps full colour control."""
    cx = x
    for i, c in enumerate(cols):
        box(slide, cx, y, col_w[i], Inches(0.36), fill=head_fill)
        text(slide, cx + Inches(0.09), y + Inches(0.09), col_w[i] - Inches(0.16), Inches(0.24),
             [[(c, head_size, ON_DARK, True)]])
        cx += col_w[i]
    ry = y + Inches(0.36)
    for r_i, row in enumerate(rows):
        cx = x
        band = PANEL if r_i % 2 == 0 else BG
        for i, cell in enumerate(row):
            val, colr, bold = (cell if isinstance(cell, tuple) else (cell, BODY, False))
            box(slide, cx, ry, col_w[i], row_h, fill=band, line=LINE)
            text(slide, cx + Inches(0.09), ry + Inches(0.07), col_w[i] - Inches(0.16),
                 row_h - Inches(0.1), [[(val, size, colr, bold)]])
            cx += col_w[i]
        ry += row_h
    return ry


def callout(slide, x, y, w, h, fill, accent, title, body, tsize=12, bsize=10.5):
    box(slide, x, y, w, h, fill=fill, line=None, round_=True)
    box(slide, x, y, Inches(0.075), h, fill=accent)
    text(slide, x + Inches(0.24), y + Inches(0.13), w - Inches(0.45), Inches(0.28),
         [[(title, tsize, accent, True)]])
    text(slide, x + Inches(0.24), y + Inches(0.44), w - Inches(0.45), _h(h - Inches(0.55)),
         [[(body, bsize, BODY, False)]], space_after=3, line_spacing=1.14)


def footer(slide, txt):
    text(slide, Inches(0.45), Inches(7.02), Inches(12.4), Inches(0.24),
         [[(txt, 8, MUTED, False)]])


# ── Icons ────────────────────────────────────────────────────────────────────
# 12 of the 16 icons in assets/workflow-deck/icons are WHITE artwork on a
# transparent background — measured, average RGB 255,255,255. Dropped straight
# onto a light card they are invisible. So a white icon always sits inside a
# filled circle. check / times / warn / arrow are coloured and work bare.
import os
ICON_DIR = 'assets/workflow-deck/icons'
_COLOURED_ICONS = {'check', 'times', 'warn', 'arrow'}


def icon_badge(slide, name, cx, cy, d=Inches(0.62), fill=INDIGO, pad=0.26):
    """Coloured circle with a white icon centred inside it."""
    path = os.path.join(ICON_DIR, f'{name}.png')
    if name not in _COLOURED_ICONS:
        c = slide.shapes.add_shape(MSO_SHAPE.OVAL, cx, cy, d, d)
        c.fill.solid(); c.fill.fore_color.rgb = fill
        c.line.fill.background(); c.shadow.inherit = False
    if os.path.exists(path):
        inset = int(d * pad)
        slide.shapes.add_picture(path, cx + inset, cy + inset, d - 2 * inset, d - 2 * inset)


def step_circle(slide, n, cx, cy, d=Inches(0.5), fill=INDIGO, size=17):
    c = slide.shapes.add_shape(MSO_SHAPE.OVAL, cx, cy, d, d)
    c.fill.solid(); c.fill.fore_color.rgb = fill
    c.line.fill.background(); c.shadow.inherit = False
    tf = c.text_frame; tf.margin_left = tf.margin_right = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = str(n)
    r.font.size = Pt(size); r.font.bold = True; r.font.name = 'Calibri'
    r.font.color.rgb = ON_DARK


def chevron(slide, x, y, w, h, label, sub, fill, text_col=ON_DARK):
    """One block of a left-to-right process flow."""
    shp = slide.shapes.add_shape(MSO_SHAPE.CHEVRON, x, y, w, h)
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    shp.line.fill.background(); shp.shadow.inherit = False
    tf = shp.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.22); tf.margin_right = Inches(0.1)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = label
    r.font.size = Pt(11); r.font.bold = True; r.font.color.rgb = text_col; r.font.name = 'Calibri'
    if sub:
        p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
        r2 = p2.add_run(); r2.text = sub
        r2.font.size = Pt(8.5); r2.font.color.rgb = text_col; r2.font.name = 'Calibri'
    return shp


def flow_step(slide, x, y, w, h, icon, title, sub, accent):
    """Icon-topped step card used in the end-to-end summary slides."""
    box(slide, x, y, w, h, fill=PANEL, line=LINE, round_=True)
    box(slide, x, y, w, Inches(0.06), fill=accent)
    icon_badge(slide, icon, x + (w - Inches(0.62)) / 2, y + Inches(0.18), fill=accent)
    text(slide, x + Inches(0.08), y + Inches(0.92), w - Inches(0.16), Inches(0.34),
         [[(title, 10.5, DARK, True)]], align=PP_ALIGN.CENTER)
    text(slide, x + Inches(0.08), y + Inches(1.28), w - Inches(0.16), _h(h - Inches(1.34)),
         [[(sub, 8.8, BODY, False)]], align=PP_ALIGN.CENTER, line_spacing=1.1)


def arrow_between(slide, x, y, w=Inches(0.3)):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, Inches(0.22))
    a.fill.solid(); a.fill.fore_color.rgb = RGBColor(0xB8, 0xC4, 0xD4)
    a.line.fill.background(); a.shadow.inherit = False


def lane(slide, x, y, w, h, label, colour, items, label_w=Inches(1.5)):
    """Swim-lane: who does what."""
    box(slide, x, y, w, h, fill=PANEL, line=LINE)
    box(slide, x, y, label_w, h, fill=colour)
    tf_box = box(slide, x, y, label_w, h, fill=None)
    tf = tf_box.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.12); tf.margin_right = Inches(0.06)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = label
    r.font.size = Pt(10.5); r.font.bold = True; r.font.color.rgb = ON_DARK; r.font.name = 'Calibri'
    cw = (w - label_w) / len(items)
    for i, it in enumerate(items):
        cx = x + label_w + cw * i
        if i:
            box(slide, cx, y + Inches(0.06), Pt(0.75), h - Inches(0.12), fill=LINE)
        text(slide, cx + Inches(0.12), y + Inches(0.13), cw - Inches(0.24), h - Inches(0.26),
             [[(it, 9.2, BODY, False)]], line_spacing=1.12, anchor=MSO_ANCHOR.MIDDLE)


# ─────────────────────────────────────────────────────────── 1 · TITLE ──────
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=NAVY)
box(s, 0, 0, Inches(0.09), H, fill=INDIGO)
logo(s, x=Inches(0.55), y=Inches(0.5), scale=1.15, on_dark=True)
text(s, Inches(0.6), Inches(1.95), Inches(11.6), Inches(1.3),
     [[('CostVision and CAPEE', 40, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.6), Inches(2.95), Inches(11.4), Inches(0.6),
     [[('The case for automating cost input, and then costing in bulk',
        16, HERO_SUB, False)]])
box(s, Inches(0.6), Inches(3.8), Inches(3.3), Pt(2.5), fill=INDIGO)
for i, (n, t_, sub) in enumerate([
        ('1', 'Feed CAPEE automatically, and prove it',
         'CAPEE keeps doing the costing. CostVision measures the 3D model and fills in the '
         'numbers. We prove it on real JLR parts first.'),
        ('2', 'Cost in bulk, unattended',
         'A whole basket of parts costed in one run, with no AI. A person is asked only where '
         'the geometry cannot decide.')]):
    y = Inches(4.15) + Inches(1.0) * i
    step_circle(s, n, Inches(0.62), y, d=Inches(0.55), fill=INDIGO)
    text(s, Inches(1.4), y + Inches(0.02), Inches(10.8), Inches(0.3), [[(t_, 15, ON_DARK, True)]])
    text(s, Inches(1.4), y + Inches(0.35), Inches(10.8), Inches(0.5), [[(sub, 11, HERO_SUB, False)]],
         line_spacing=1.15)
text(s, Inches(0.6), Inches(6.55), Inches(11.6), Inches(0.4),
     [[('JLR Cost Engineering  ·  September 2026', 10, HERO_DIM, False)]])
notes(s, "Thank you for the time. I want to walk you through two ways a tool we have built, "
         "CostVision, could work with CAPEE, and ask for a decision on the first one. The first "
         "option is simple. CAPEE keeps doing the costing. CostVision measures the 3D model and "
         "fills in the numbers CAPEE needs, and we prove that on our own parts. The second option "
         "comes later. It is costing a whole basket of parts in one run, unattended. Neither option "
         "needs AI. In the build we have given JLR, AI is switched off. I will be straight about "
         "what the tool does today and what it does not. The biggest gap is that it has never been "
         "checked against a price JLR actually paid. There are also no dates in this pack. Nobody "
         "has sized this work yet, so any timeline I showed you would be made up. What I can show "
         "is the order the work has to happen in.")

# ────────────────────────────────────────────── 2 · WHAT WE ARE ASKING ──────
s = header('What we are asking for', 'The decision')
callout(s, Inches(0.45), Inches(1.75), Inches(12.43), Inches(1.15), GREENBG, GREEN,
        'Approve a proof of concept: Option 1, inside CAPEE, on our own parts',
        'Let CostVision fill CAPEE\'s cost input for one part type, on 30 to 50 parts we have '
        'already bought. At the end we will know how close it gets, how often an engineer has to '
        'correct it, and how much time it saves. Option 2 follows once that is known.')
rows = [
    (('What we want to do', DARK, True), 'Fill CAPEE\'s cost input from the 3D model, for one part type'),
    (('What we need from JLR', DARK, True), '30 to 50 parts with the price we paid, our own rate data, three answers from IT, and a team for the trial'),
    (('What it costs to try', DARK, True), 'Our own engineering time. No licence and no new tool to learn. CAPEE still does the '
     'costing, but it has to be changed to take the numbers'),
    (('What we will know at the end', DARK, True), 'A measured accuracy figure against real JLR prices, and a measured time per part'),
    (('What we are NOT asking for', DARK, True), 'A decision on Option 2 today. It needs the accuracy answer first'),
]
table(s, Inches(0.45), Inches(3.05), Inches(12.43), ['', 'Detail'], rows,
      [Inches(3.5), Inches(8.93)], row_h=Inches(0.52), size=10.8)
callout(s, Inches(0.45), Inches(6.15), Inches(12.43), Inches(0.95), AMBERBG, AMBER,
        'The one thing to know before you decide',
        'CostVision has never been checked against a price JLR has actually paid. Its arithmetic '
        'matches a hand calculation, but that is not the same thing. The proof of concept is what '
        'tells us how close it gets.')
notes(s, "This is the ask, so I will put it first. I would like approval to run a proof of concept "
         "inside CAPEE, on one part type, using parts we have already bought. The table says what "
         "that involves. What we need from JLR is on the second row, and I will come back to it at "
         "the end. What it costs is our own time. There is no licence, and nobody has to learn a "
         "new tool, because CAPEE still does the costing on the same screens. CAPEE does have to be "
         "changed to accept the numbers, and that is JLR's side of the work. The amber box is the "
         "honest bit, and I would rather say it now than have it come out in questions. We have "
         "never compared this tool with a price we actually paid. We know the arithmetic is right, "
         "because it matches a hand calculation to under 0.01 percent. But right arithmetic on the "
         "wrong inputs is still wrong. That is what the trial finds out.")

# ──────────────────────────────────────── 3 · WHAT HAPPENS TODAY ────────────
s = header('What costing a part looks like today', 'The problem')
card(s, Inches(0.45), Inches(1.78), Inches(6.1), Inches(3.7), RED,
     'TODAY, BY HAND',
     [('The engineer opens the part in CAD, reads the drawing,',),
      ('and types the numbers into CAPEE.',),
      ('Boxes to fill, depending on the part type:', DARK, True),
      ('about 12 to about 70 on CostVision\'s own forms',),
      ('',),
      ('Part weight, starting material weight, wall thickness,',),
      ('hole and pocket counts, machine times, surface area,',),
      ('tolerances, finish, heat treatment.',),
      ('',),
      ('Two engineers costing the same part will not type the', DARK, True),
      ('same numbers. So one part gets two answers.', DARK, True)], fill=REDBG)
card(s, Inches(6.78), Inches(1.78), Inches(6.1), Inches(3.7), GREEN,
     'WITH COSTVISION',
     [('The engineer hands over the 3D model: STEP, IGES or STL.',),
      ('Measured off the model:', DARK, True),
      ('volume, weight, size, surface area, walls, holes,',),
      ('pockets, bosses, gear teeth, bends.',),
      ('',),
      ('Asked of the engineer:', DARK, True),
      ('material family, tolerances, finish, heat treatment,',),
      ('and anything else the shape cannot decide.',),
      ('',),
      ('Fixed rules fill the form. Same part, same numbers,', DARK, True),
      ('every time.', GREEN, True)], fill=GREENBG)
callout(s, Inches(0.45), Inches(5.55), Inches(12.43), Inches(1.25), PANEL2, INDIGO,
        'Measuring is not AI',
        'The 3D model is measured by software, the way a CMM measures a part. Fixed rules turn '
        'the measurements into cost inputs. AI is switched off in the JLR build. There is an '
        'optional AI mode that can read drawings, but it is off at JLR, and even when it is on it '
        'never sets a price.')
notes(s, "This is the problem we are trying to fix. Today an engineer opens the model, reads the "
         "drawing and types the numbers in. How many depends on the part. On CostVision's own "
         "forms it runs from about twelve values to about seventy. I have not counted CAPEE's "
         "screens, so take that as a guide. The time matters, but the second point matters more. "
         "Two engineers costing the same part will not type the same numbers. So we get two answers "
         "for one part and no way to say which is right. On the right is what the tool does. It "
         "measures the model. Fixed rules turn the measurements into the values the form needs. "
         "Where the shape cannot decide something, such as the material, it asks the engineer "
         "rather than guessing. The blue box is the point I would like people to hold on to. "
         "Measuring is ordinary geometry software, not AI. The AI is switched off in the JLR build. "
         "Everything on this slide works without it.")

# ─────────────────────────────────── 4 · WHERE COSTVISION IS TODAY ──────────
s = header('Where CostVision is today', 'Current status')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('Checked against the software on 28 September 2026.',
        11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.1), Inches(6.1), Inches(3.6), GREEN,
     'WORKING NOW',
     [('19 manufacturing processes, an assembly roll-up and a',),
      ('49-module software cost model',),
      ('13 of those costed straight from a CAD file',),
      ('Same inputs, same answer, every time',),
      ('Measures STEP, IGES and STL with no internet',),
      ('Asks the engineer where the geometry cannot decide',),
      ('Blocks the costing when the checks find a contradiction',),
      ('Bulk run from a parts list, with no AI',),
      ('Keeps every rate book, so a costing can be redone',),
      ('Rate library of 16 June 2026: 328 materials, 178',),
      ('machines, 42 labour grades, 20 regions',),
      ('Windows package: no installer, admin rights or internet',),
      ('2,438 automated tests; 6 real parts pinned',)], fill=GREENBG)
card(s, Inches(6.78), Inches(2.1), Inches(6.1), Inches(3.6), AMBER,
     'NOT THERE YET',
     [('Never compared against a price JLR has paid',),
      ('No link into CAPEE yet',),
      ('No JLR single sign-on; it has its own sign-in',),
      ('The bulk run is a command-line tool, not a screen',),
      ('A costing done on screen is kept only if it is saved',),
      ('Extrusion has no CAD rules yet (its form still costs it)',),
      ('An STL has no feature table, so a machined STL needs',),
      ('its cycle time typed in',),
      ('The built-in rates are not JLR rates until we load ours',),
      ('AI features are off at JLR, by design',),
      ('Still under active development',)], fill=AMBERBG)
callout(s, Inches(0.45), Inches(5.9), Inches(12.43), Inches(1.0), PANEL2, INDIGO,
        'What changed since the last time I showed you this',
        'The bulk run now exists, with no AI. Every rate book is kept, so a past costing can be '
        'redone. The bulk run uses the same geometry checks as a single part, takes a region and a '
        'volume, and covers gear. And a Windows package now runs on a locked-down laptop.')
notes(s, "Before the options, this is honestly where the tool is. I checked every line on this "
         "slide against the software this week. On the left is what works today. It covers nineteen "
         "manufacturing processes, and thirteen of them can be costed straight from a CAD file. "
         "Same inputs always give the same answer. It measures models with no internet, which is "
         "the first thing IT security will ask about. It has a proper test net: 2,438 automated "
         "tests, and six real production parts pinned so that a change which moves any of them "
         "fails the build. On the right is what is not done. The top line is the important one and "
         "I will keep coming back to it. There is no link into CAPEE yet, and no JLR single "
         "sign-on. The bulk run works, but only from the command line. The blue box is what has "
         "changed since I last showed you this. Most of the gaps I listed for Option two then are "
         "now closed. I will show you which on slide fifteen.")

# ──────────────────────────────────────────────── 5 · THE PLAN ──────────────
s = header('The plan: prove it small, then scale it', 'Sequence')
steps = [
    ('clip',   'Option 1', 'Fill CAPEE automatically', INDIGO),
    ('check',  'Prove it',  'On 30 to 50 real JLR parts', GREEN),
    ('eye',    'Decide',    'With an accuracy figure in hand', AMBER),
    ('cog',    'Option 2',  'Cost the whole basket in bulk', VIOLET),
]
sw, gap = Inches(2.9), Inches(0.3)
x = Inches(0.6)
for i, (ic, t_, sub, c_) in enumerate(steps):
    flow_step(s, x, Inches(1.82), sw, Inches(1.85), ic, t_, sub, c_)
    if i < len(steps) - 1:
        arrow_between(s, x + sw + Inches(0.03), Inches(2.62), gap - Inches(0.06))
    x += sw + gap
card(s, Inches(0.45), Inches(3.86), Inches(6.1), Inches(2.3), INDIGO,
     'OPTION 1 · feed CAPEE automatically',
     [('CAPEE stays as it is and still does the costing.',),
      ('Instead of typing a dozen to seventy boxes, the',),
      ('engineer hands over the 3D model and checks what',),
      ('fills in.',),
      ('',),
      ('We hand over the measuring engine, the rules and', DARK, True),
      ('the checks. Slide 7 lists them.', DARK, True)])
card(s, Inches(6.78), Inches(3.86), Inches(6.1), Inches(2.3), VIOLET,
     'OPTION 2 · cost in bulk, unattended',
     [('A list of parts goes in. Every one is measured, costed',),
      ('and reported without anyone sitting there.',),
      ('An engineer is asked only where the geometry',),
      ('cannot decide.',),
      ('',),
      ('The run is built. What is left is our rates, a trial,', DARK, True),
      ('and a screen for it if we want one.', DARK, True)])
callout(s, Inches(0.45), Inches(6.2), Inches(12.43), Inches(0.82), GREENBG, GREEN,
        'Why this order',
        'Option 1 is cheaper to try and gives the accuracy figure Option 2 needs. No sense costing '
        '500 parts until one part is right.')
notes(s, "This is the shape of the whole thing. We do Option one first, prove it on our own parts, "
         "look at the number, and then decide about Option two. Option one is the smaller change. "
         "CAPEE does not move. The engineer stops typing and starts checking. What we hand over is "
         "the measuring engine, the rules that fill the form, and the checks, and slide seven lists "
         "them. Option two is a different capability. Instead of costing the parts we have time "
         "for, we cost the whole basket. The run for that is already built, and it uses no AI. What "
         "is left is loading our own rates, trying it on a real basket, and maybe a screen for it. "
         "The reason for this order is on the green strip. Option one is cheap to try and it gives "
         "us the accuracy figure. There is no sense costing five hundred parts until we know the "
         "tool gets one part right.")

# ────────────────────────────────── 6 · OPTION 1 · ONE PART ─────────────────
s = header('Option 1: what happens to one part', 'Option 1')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What an engineer does each time they cost a part', 11.5, MUTED, True)]])
steps = [
    ('upload', 'Hands over the model', 'STEP, IGES or STL, from the CAPEE screen', INDIGO),
    ('ruler',  'Software measures',    'Size, weight, surface area, holes, pockets',  INDIGO),
    ('cog',    'Rules fill the form',  'Fixed rules turn measurements into values',   INDIGO),
    ('shield', 'Checks run',           'Contradictions are flagged or stop the cost', GREEN),
    ('person', 'Engineer confirms',    'Material, tolerance, finish, heat treatment', AMBER),
    ('calc',   'CAPEE costs the part', 'CAPEE gets the numbers and calculates',       GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('What order the build has to happen in', 11.5, MUTED, True)]])
ph = ['Agree the connection', 'Stand up measuring', 'Hand over settings',
      'Add safety checks', 'Connect into CAPEE', 'Trial on one part type']
cw = Inches(2.05)
x = Inches(0.45)
for i, lbl in enumerate(ph):
    chevron(s, x, Inches(4.58), cw, Inches(0.6), lbl, '', INDIGO if i < 5 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.38), Inches(12.43), Inches(0.6), 'WE DO', INDIGO,
     ['Package the measuring software', 'Write out every setting', 'Move the safety checks across',
      'Help with the CAPEE connection'])
lane(s, Inches(0.45), Inches(6.02), Inches(12.43), Inches(0.6), 'JLR DOES', VIOLET,
     ['Tell us how CAPEE is built', 'Provide a server or laptop', 'Change CAPEE to take the numbers',
      'Free up a team for the trial'])
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.68), AMBERBG, AMBER,
        'One step we cannot size yet',
        'Connecting into CAPEE depends on how CAPEE is built, and we do not know that yet. Slide 10 '
        'sets out the three ways of doing it.')
notes(s, "This is Option one on a single slide. The top row is what happens each time somebody "
         "costs a part. The engineer hands over the 3D model from inside CAPEE. The software "
         "measures it. Fixed rules turn the measurements into the values CAPEE needs. The checks "
         "look for contradictions, and a serious one stops the costing until someone accepts it. "
         "The engineer confirms what a model cannot show, like material and heat treatment. Then "
         "CAPEE costs the part exactly as it does now. There is no AI anywhere in that row. "
         "Underneath is the build order and who does what. We package the software, write out the "
         "settings and bring the checks across. JLR tells us how CAPEE is built, provides a server "
         "or a laptop, and changes CAPEE to take the numbers. I have deliberately not put weeks "
         "against any of this. Nobody has sized it, and the connection step waits on an answer we "
         "do not have yet.")

# ────────────────────────────────── 7 · OPTION 1 · WHAT WE HAND OVER ────────
s = header('Option 1: what we hand over', 'Option 1 · handover')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Sizes counted in the source files on 28 September 2026, rounded. Both languages are in '
        'common use and JLR IT will have people who know them.', 11.5, BODY, False)]])
rows = [
    ('Measuring engine', ('Python', DARK, True), 'about 2,500 lines',
     'Opens the 3D model and measures it. Makes no internet connection.'),
    ('Rules that fill the form', ('TypeScript', DARK, True), 'about 8,900 lines',
     'Turn measurements into cost inputs and decide what the engineer is asked.'),
    ('Geometry checks', ('TypeScript', DARK, True), 'about 400 lines',
     'The checks on the next slide.'),
    ('Bulk run', ('TypeScript', DARK, True), 'about 850 lines',
     'A parts list in; results, open questions and a run record out. Option 2.'),
    ('Settings list', ('Plain list', DARK, True), 'to be written',
     'Every fixed number pulled together in one place. Slide 9.'),
    ('JLR Rate Converter', ('Excel', DARK, True), 'no macros',
     'Turns JLR\'s own rate card into the tool\'s format.'),
]
table(s, Inches(0.45), Inches(2.3), Inches(12.43),
      ['Part', 'Language', 'Size', 'What it does'], rows,
      [Inches(3.3), Inches(1.7), Inches(1.5), Inches(5.93)], row_h=Inches(0.5), size=10.5)
callout(s, Inches(0.45), Inches(5.82), Inches(6.1), Inches(1.15), PANEL2, INDIGO,
        'About the two languages',
        'Python is the normal choice for engineering and measurement work. TypeScript is widely '
        'used for business software. Neither is unusual and neither ties JLR to one supplier.')
callout(s, Inches(6.78), Inches(5.82), Inches(6.1), Inches(1.15), AMBERBG, AMBER,
        'One thing for IT to confirm',
        'The measuring engine runs on a standard Linux server or from our Windows package. The '
        'cut-down Linux kind used for small services cannot run it.')
notes(s, "You asked last time what would actually be handed over. Here it is, and the sizes come "
         "from counting the source files this week, rounded. The measuring engine is Python, the "
         "normal choice for measurement work. The rules and checks are TypeScript, which is common "
         "in business software. Neither is unusual, and neither ties JLR to us. The rules are the "
         "biggest piece. They turn the measurements into cost inputs and decide what to ask the "
         "engineer. The bulk run is there for Option two. The settings list does not exist yet as a "
         "separate file, and writing it is a step in the plan. The Rate Converter is an Excel "
         "workbook with no macros, which turns JLR's own rate card into the tool's format. The "
         "amber box is the practical point for IT. The measuring engine needs a standard Linux "
         "server or our Windows package. The cut-down Linux image cannot run it. That decides where "
         "this can live, so it is worth settling early.")

# ─────────────────────────────────── 8 · OPTION 1 · SAFETY CHECKS ───────────
s = header('Option 1: the checks that have to come with it', 'Option 1 · required')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('The price is always plain arithmetic. But a wrong input still gives a wrong cost. These '
        'four checks stop that, and they have to come across with everything else.',
        11.5, BODY, False)]])
checks = [
    ('cube', 'The measured model is the ground truth', INDIGO,
     'Weight and size come from the model. Any figure fed to the cost that contradicts them is '
     'flagged. A weight gap of more than half stops the costing until an engineer accepts it.'),
    ('eye', 'The route has to fit the shape', INDIGO,
     'A thick-walled part, walls over about 6 mm, is offered casting, forging, cast and machine, '
     'or machining. Never sheet metal or moulding.'),
    ('press', 'Machining time has a ceiling', INDIGO,
     'On a casting or forging, machining is capped at what finishing that part could realistically '
     'take, so a bad estimate cannot run the cost up.'),
    ('person', 'Unknowns get asked, not guessed', VIOLET,
     'Material family, heat treatment and tolerance class cannot be read off a solid model, so the '
     'engineer is asked. A machined STL is blocked until someone types the cycle time.'),
]
y = Inches(2.45)
for ic, t_, c_, b_ in checks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.92), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.92), fill=c_)
    icon_badge(s, ic, Inches(0.72), y + Inches(0.16), d=Inches(0.6), fill=c_)
    text(s, Inches(1.55), y + Inches(0.14), Inches(11.1), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(1.55), y + Inches(0.45), Inches(11.1), Inches(0.42),
         [[(b_, 10.2, BODY, False)]], line_spacing=1.12)
    y += Inches(1.02)
callout(s, Inches(0.45), Inches(6.6), Inches(12.43), Inches(0.82), REDBG, RED,
        'Why we test on real parts, not only test blocks',
        'A steering knuckle once costed at £5.43 while every test passed. Six real production '
        'parts are now pinned, and a change that moves any of them fails the build.')
notes(s, "On a job like this it is tempting to take the measuring and leave what looks like plumbing "
         "until later. These four checks are what make the rest safe. The price is always plain "
         "arithmetic, but a wrong input still gives a wrong price. The first check is the one to "
         "remember. The measured model is the ground truth. If anything fed to the cost contradicts "
         "the measured weight, it is flagged, and a big gap stops the costing. The second stops a "
         "thick, chunky part being costed as a pressing or a moulding. The third caps machining "
         "time on castings and forgings. The fourth is about honesty. Where the tool cannot know "
         "something, it asks rather than guessing. The red box is a lesson we learned the hard way. "
         "A steering knuckle once came out at five pounds forty-three while every test passed, "
         "because our tests used clean made-up shapes. Now six real production parts are pinned, "
         "and if a change moves any of them, the build fails.")

# ────────────────────────────────── 9 · OPTION 1 · FIXED NUMBERS ────────────
s = header('Option 1: the fixed numbers inside the software', 'Option 1 · settings')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('You asked what the hardcoded values actually are. These are engineering judgements written '
        'into the code. Six real ones, read off the software this month:', 11.5, BODY, False)]])
rows = [
    ('Smallest face counted as machined', ('400 mm²', DARK, True),
     'Below this we treat it as an edge, not a face to machine'),
    ('Smallest pocket counted', ('80 mm²', DARK, True),
     'Stops small recesses getting costed as pockets'),
    ('Rework of a rejected plated part', ('USD 2.20 + 1.80 / m²', DARK, True),
     'Strip-and-re-plate chemistry and effluent, on top of plating it again. The note on the '
     'stage reads 4-5x a first-pass part'),
    ('Zinc price used for plating', ('USD 3.67 / kg', DARK, True),
     'Market reference, August 2026. Moves monthly and is meant to get updated'),
    ('Shape allowance, pressing', ('1.15', DARK, True),
     'A real pressing has more surface than a flat plate: edges, flanges, bends'),
    ('Shape allowance, casting and forging', ('1.25 / 1.10', DARK, True),
     'Castings carry ribs and bosses; forgings are simpler on the outside'),
]
table(s, Inches(0.45), Inches(2.35), Inches(12.43),
      ['What it controls', 'Value', 'Why'], rows,
      [Inches(4.3), Inches(2.3), Inches(5.83)], row_h=Inches(0.5), size=10.5)
callout(s, Inches(0.45), Inches(5.87), Inches(6.1), Inches(1.15), PANEL2, INDIGO,
        'How they get handed over',
        'Pulled out of the code into one list you can read and change without a developer. That '
        'list is a deliverable in its own right and it is a step in the Option 1 sequence.')
callout(s, Inches(6.78), Inches(5.87), Inches(6.1), Inches(1.15), AMBERBG, AMBER,
        'Where these came from',
        'They are our engineering estimates. They are not measurements from a JLR plant. Treat them '
        'as a starting point and expect to replace them as real data comes in.')
notes(s, "Hardcoded values means nothing on its own, so here are six real ones, read off the "
         "software this month. The first two decide what counts as a machined face and what counts "
         "as a pocket. Look at the third row. Stripping and re-plating a rejected part is costed as "
         "its own stage: two dollars twenty of chemistry and one dollar eighty of effluent per "
         "square metre, on top of plating the part again. The note against it says the rework runs "
         "four to five times a first-pass part. That is why a three percent reject rate is nearer "
         "twelve to fifteen percent on cost. That is an engineering judgement, and exactly the sort "
         "of thing you would challenge in a review. So it should not be buried in code. We will "
         "pull every one of these into a single list you can read and change. The amber box is the "
         "caveat. These are our estimates, not measurements from one of our plants.")

# ───────────────────────────────── 10 · OPTION 1 · CONNECTING ───────────────
s = header('Option 1: three ways to connect it to CAPEE', 'Option 1 · decision for IT')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('We do not know yet how CAPEE is built. Any of the three routes could work. The answer '
        'decides which one we use and how much effort it takes.', 11.5, BODY, False)]])
rows = [
    (('A · Put it inside CAPEE', DARK, True), 'CAPEE is built in JavaScript',
     'Our code goes straight in. Only the measuring engine sits separately.',
     ('Least effort', GREEN, True)),
    (('B · Run it alongside', DARK, True), 'CAPEE is Java, .NET or anything else',
     'It runs as its own service on a JLR server and CAPEE asks it for numbers over a secure link.',
     ('Most effort', AMBER, True)),
    (('C · Pass a file', DARK, True), 'CAPEE is a desktop or spreadsheet tool',
     'It writes a file that CAPEE imports. Simplest to build, but somebody has to move the file.',
     ('Least effort', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.3), Inches(12.43),
      ['Route', 'Use when', 'What it means day to day', 'Relative effort'], rows,
      [Inches(2.9), Inches(2.9), Inches(5.13), Inches(1.5)], row_h=Inches(0.85), size=10.3)
callout(s, Inches(0.45), Inches(5.4), Inches(6.1), Inches(1.0), PANEL2, INDIGO,
        'If we had to pick blind',
        'Route B. It works whatever CAPEE turns out to be, and we can update CostVision without '
        'touching CAPEE every time.')
callout(s, Inches(6.78), Inches(5.4), Inches(6.1), Inches(1.0), AMBERBG, AMBER,
        'Three questions for IT',
        'What is CAPEE written in. Can it call another service on the network. Where can the '
        'measuring engine run: a server, or a laptop.')
footer(s, 'Effort is shown against the other two routes. None of the three has been sized by JLR.')
notes(s, "I cannot give you one answer here, because nobody has told us how CAPEE is built. Rather "
         "than hold everything up, here are all three routes. Any of them could work. What changes "
         "is the effort, and I have shown that against each other rather than in weeks, because "
         "none of it has been sized. Route A puts our code inside CAPEE, which is easiest if CAPEE "
         "is built in JavaScript. Route B runs CostVision alongside as its own service, and CAPEE "
         "asks it for numbers. Route C just passes a file across, which is simple but needs "
         "someone to move the file. If you made me pick blind, I would take route B. It works "
         "whatever CAPEE is, and we can improve our side without touching CAPEE. The three "
         "questions in the amber box are what I need from IT to choose properly.")

# ──────────────────────────────── 11 · OPTION 1 · THE PROOF ─────────────────
s = header('Option 1: what the proof of concept proves', 'Option 1 · the trial')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.32),
     [[('One part type, one team, 30 to 50 parts we have already bought. Four numbers come out of '
        'it, and none of them exist today.', 11.5, BODY, False)]])
meas = [
    ('1', 'How close is it?', GREEN,
     'Cost every part with the tool, compare against the price we actually paid, and report the '
     'average error. The test is whether the real price lands inside the range the tool itself '
     'gave for each part. A tool that is wrong and says so is usable. One that is wrong and '
     'confident is not.'),
    ('2', 'How often does the engineer have to step in?', INDIGO,
     'Count the values the engineer changed after the tool filled them, and the parts where the '
     'tool stopped and asked. Every part will ask for the material family, because a solid model '
     'cannot tell steel from aluminium. The rest we need to measure on JLR parts.'),
    ('3', 'How much time does it save?', VIOLET,
     'Time the same parts both ways: typed by hand into CAPEE, and filled by the tool with the '
     'engineer checking. The difference is the saving, measured rather than claimed.'),
    ('4', 'What does it refuse, and was it right to?', AMBER,
     'Every part the tool turned down, with the reason. If it refuses parts it should have costed, '
     'that is a fault we need to see early.'),
]
y = Inches(2.3)
for n, t_, c_, b_ in meas:
    box(s, Inches(0.45), y, Inches(12.43), Inches(1.02), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(1.02), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.18), d=Inches(0.48), fill=c_)
    text(s, Inches(1.45), y + Inches(0.12), Inches(11.2), Inches(0.28), [[(t_, 12.2, DARK, True)]])
    text(s, Inches(1.45), y + Inches(0.43), Inches(11.2), Inches(0.48),
         [[(b_, 10.0, BODY, False)]], line_spacing=1.12)
    y += Inches(1.08)
callout(s, Inches(0.45), Inches(6.6), Inches(12.43), Inches(0.84), GREENBG, GREEN,
        'Why it is worth doing even if the answer is disappointing',
        'A measured accuracy figure is worth having either way. Today nobody can state one, so '
        'every conversation about this tool stalls in the same place.')
notes(s, "This is what we would get out of the trial. I want to be concrete, because none of these "
         "four numbers exists today. First, how close is it. We cost the parts, compare with what "
         "we paid, and report the error. Every result in the tool comes with a range, a low and a "
         "high. The test I would use is whether the real price falls inside that range. A tool "
         "that is wrong and says so is usable. One that is wrong and confident is not. Second, how "
         "often the engineer steps in. Every part will ask for the material, because a solid model "
         "cannot tell steel from aluminium. In a bulk run that answer can come from the part list. "
         "The rest we need to count on JLR parts. Third, the time saving, measured by doing the "
         "same parts both ways. Fourth, what it refused and whether it was right to. The green "
         "strip is why it is worth doing even if the answer disappoints us.")

# ─────────────────────────────── 12 · OPTION 1 · ORDER OF WORK ──────────────
s = header('Option 1: order of work', 'Option 1 · sequence')
plan1 = [
    ('1', 'Agree the connection', INDIGO,
     'Find out how CAPEE is built, pick one of the three routes, agree exactly which numbers CAPEE expects.'),
    ('2', 'Stand up the measuring software', INDIGO,
     'Install it on a JLR server or laptop. Measure 20 real JLR parts and check the results against their drawings.'),
    ('3', 'Hand over the settings list', VIOLET,
     'Pull every fixed number into one list. JLR review it and sign it off before anything gets costed with it.'),
    ('4', 'Move the safety checks across', GREEN,
     'The geometry checks and the questions the engineer confirms. In the scope from the start.'),
    ('5', 'Connect into CAPEE', INDIGO,
     'Wire it in, with AI left off. Cost one real part end to end.'),
    ('6', 'Run the trial', GREEN,
     'One team, one part type, 30 to 50 parts with prices we paid. Produce the four numbers from the last slide.'),
]
y = Inches(1.9)
for n, t_, c_, b_ in plan1:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.7), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.7), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.11), d=Inches(0.46), fill=c_)
    text(s, Inches(1.42), y + Inches(0.08), Inches(11.2), Inches(0.27), [[(t_, 12.2, DARK, True)]])
    text(s, Inches(1.42), y + Inches(0.38), Inches(11.2), Inches(0.28), [[(b_, 9.6, BODY, False)]])
    y += Inches(0.78)
callout(s, Inches(0.45), Inches(6.62), Inches(6.1), Inches(0.84), PANEL2, INDIGO,
        'Steps 1 and 2 can start together',
        'Measuring does not depend on how CAPEE is built. Only step 5 does.')
callout(s, Inches(6.78), Inches(6.62), Inches(6.1), Inches(0.84), AMBERBG, AMBER,
        'Start with one part type',
        'Machined parts or pressings first. Widen it once it holds up.')
notes(s, "Six steps, in the order they have to happen. Two are worth pulling out. Step three is the "
         "settings list. JLR reviews it and signs it off before anything is costed with it, so the "
         "judgements inside the tool are ours, not just mine. Step four is the safety checks. I "
         "have given them a step of their own so they do not get folded into the connection work "
         "and squeezed. Step five says AI stays off, which matches the build we have already given "
         "JLR. Nothing in Option one needs it. The blue box helps with planning. Steps one and two "
         "can run at the same time, because standing up the measuring software does not depend on "
         "knowing how CAPEE is built. Only step five does. The amber box is my suggestion for where "
         "to start: machined parts or pressings, because that is where most of our volume is and "
         "where we understand the shapes best.")

# ─────────────────────────────────────── 13 · OPTION 2 · WHAT IT IS ─────────
s = header('Option 2: costing in bulk, unattended', 'Option 2')
card(s, Inches(0.45), Inches(1.72), Inches(6.1), Inches(2.75), RED,
     'WHAT WE DO TODAY',
     [('We cost the parts we have time to cost.',),
      ('',),
      ('A basket of several hundred parts gets sampled, or',),
      ('estimated by analogy against something similar, or',),
      ('taken from what the supplier last quoted.',),
      ('',),
      ('Nobody costs all of it from the geometry, because', DARK, True),
      ('there are not enough engineer-hours to do it.', DARK, True)], fill=REDBG)
card(s, Inches(6.78), Inches(1.72), Inches(6.1), Inches(2.75), GREEN,
     'WHAT OPTION 2 DOES',
     [('A list of parts goes in. Every one is measured,',),
      ('costed and reported in one run, unattended.',),
      ('',),
      ('An engineer is asked only where the geometry',),
      ('cannot decide, and only once per question.',),
      ('',),
      ('Same engine, same rate book, same geometry checks.', DARK, True),
      ('No AI anywhere in it.', DARK, True)], fill=GREENBG)
callout(s, Inches(0.45), Inches(4.55), Inches(12.43), Inches(1.1), PANEL2, INDIGO,
        'What the run does, and what it does not',
        'The part type comes from the list or from the measured shape. The material comes from the '
        'list. Where it cannot decide, it stops and asks rather than guessing. It never sets a '
        'price: every number comes from the same engine at the same rates. There is no AI in it, '
        'so it works in the JLR build.')
callout(s, Inches(0.45), Inches(5.8), Inches(12.43), Inches(1.15), AMBERBG, AMBER,
        'Where this stands today',
        'The run is built as a command-line tool. It writes the results, the open questions and a '
        'record naming the rate book it used. It has not yet been run on a JLR basket or on JLR '
        'rates, and there is no screen for it yet.')
notes(s, "Option two is a different thing from Option one, and I want to be clear about that. Option "
         "one saves the engineer typing. Option two gives us something we do not have at all. "
         "Today we cost the parts we have time to cost. A basket of several hundred gets sampled or "
         "estimated by analogy, because there are not enough engineer-hours. Option two costs the "
         "whole basket in one run. The blue box says how. The part type comes from the list or from "
         "the shape. The material comes from the list. Where the tool cannot decide, it stops and "
         "asks, and one answer covers every part with the same question. There is no AI in it, so "
         "it runs in the JLR build as it is. The amber box is the honest position. The run is built, "
         "but only as a command-line tool, and it has never been run on our parts or our rates.")

# ────────────────────────────────── 14 · OPTION 2 · A BULK RUN ──────────────
s = header('Option 2: what a bulk run does', 'Option 2')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens to a basket of parts, start to finish', 11.5, MUTED, True)]])
steps2 = [
    ('upload', 'A list goes in',      'Part numbers, CAD files, volumes, region',       VIOLET),
    ('ruler',  'Each one measured',   'Same engine as a single part, in parallel',      VIOLET),
    ('cog',    'Rules fill the form', 'The part type’s own rules run',              VIOLET),
    ('person', 'Only gaps escalate',  'One question, answered once, applied to all',    AMBER),
    ('calc',   'Engine costs them',   'Eight buckets, every figure traceable',          GREEN),
    ('clip',   'Three files out',     'Results, open questions and a run record',       GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps2):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps2) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('What a run produces, and how it stays honest', 11.5, MUTED, True)]])
rows = [
    ('Results file', ('One row per part', DARK, True), 'The eight cost buckets and the total'),
    ('Questions file', ('Each open question once', DARK, True), 'Names every part it blocks, and the answer that clears them'),
    ('Run record', ('The durable record', DARK, True), 'Inputs, answers, and the rule and rate-book versions used'),
    ('Region', ('Rate book rebuilt for it', DARK, True), 'A region it does not know is refused, not guessed'),
    ('Geometry checks', ('Same as a single part', DARK, True), 'A part that fails one is refused unless someone accepts it'),
    ('Past rate books', ('All kept', DARK, True), 'Last quarter’s run can be redone on last quarter’s rates'),
]
table(s, Inches(0.45), Inches(4.52), Inches(12.43),
      ['What', 'In short', 'Detail'], rows,
      [Inches(4.3), Inches(2.6), Inches(5.53)], row_h=Inches(0.30), size=10.2)
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.66), PANEL2, INDIGO,
        'The data is the work',
        'Getting the part list, the CAD files and our own rates together is the real effort. We '
        'have not yet timed a JLR-sized basket.')
notes(s, "Here is what a run does, start to finish. A list goes in, with part numbers, CAD files, "
         "volumes and the region each part is made in. Each part is measured by the same engine "
         "as a single part. The rules fill the form. Anything the tool cannot decide becomes a "
         "question, and each question appears once, naming every part it blocks. Then the engine "
         "costs them, in the same eight buckets as the screens. Three files come out: the results, "
         "the open questions, and a run record. The table is about trust. The run record names the "
         "rate book it used, and every rate book is kept. So a run from last quarter can be redone "
         "on last quarter's rates. A region it does not know is refused rather than quietly costed "
         "as the UK. The blue strip is the honest point. The hard part is gathering our data. I have "
         "not timed a basket of JLR size, so I will not quote a run time.")

# ──────────────────────────── 15 · OPTION 2 · WHAT MUST BE BUILT ────────────
s = header('Option 2: what is built, and what is left', 'Option 2 · prerequisites')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.32),
     [[('Most of the gaps on this list last time are now closed. This is where each one stands.',
        11.5, BODY, False)]])
rows = [
    (('A history of rate changes', DARK, True), 'Built',
     'Every rate book is kept, not overwritten. A costing can name the book it used and be redone '
     'on it.',
     ('Done', GREEN, True)),
    (('A record of every bulk run', DARK, True), 'Built',
     'Each run writes a record: inputs, answers, rule and rate-book versions. A costing done on '
     'screen is still kept only if someone saves it.',
     ('Done', GREEN, True)),
    (('Region and volume on the bulk route', DARK, True), 'Built',
     'A region rebuilds the whole rate book for that country. Volume can be set per part or for '
     'the whole run.',
     ('Done', GREEN, True)),
    (('Gear and the geometry checks on the bulk route', DARK, True), 'Built',
     'Gear is costed the same way on both routes. The same checks run, and a part that fails one '
     'is refused.',
     ('Done', GREEN, True)),
    (('JLR rates loaded', DARK, True), 'Not started',
     'Until JLR\'s rate card is loaded through the Rate Converter, a run uses the built-in rate '
     'book of 16 June 2026.',
     ('Must have', RED, True)),
    (('A trial on a real basket, and maybe a screen', DARK, True), 'Not started',
     'The run is a command-line tool today. A screen is optional. A trial on real JLR parts is '
     'not.',
     ('Next', INDIGO, True)),
]
table(s, Inches(0.45), Inches(2.15), Inches(12.43),
      ['Item', 'Status', 'Detail', 'Type'], rows,
      [Inches(3.0), Inches(1.5), Inches(6.63), Inches(1.3)], row_h=Inches(0.7), size=9.8)
callout(s, Inches(0.45), Inches(6.74), Inches(12.43), Inches(0.66), GREENBG, GREEN,
        'The costing engine is the same one',
        'The bulk run calls the same costing engine as the screens, with the same rate book and the '
        'same geometry checks.')
notes(s, "Last time I showed you this slide it was a list of gaps. I would rather show you honestly "
         "where each one stands now. The first four are built. Every rate book is kept rather than "
         "overwritten, so a costing can name the book it used and be redone on it. Every bulk run "
         "writes a record of its inputs, answers and versions. One limit there: a costing done on "
         "the screen is still only kept if someone saves it. Region and volume now reach the bulk "
         "route, and so does gear, and the same geometry checks run on it. What is left is ours to "
         "do. The run has to be given JLR rates, loaded through the Rate Converter. Until then it "
         "uses the built-in book from June. And it needs a trial on a real basket. A screen is "
         "optional. The green strip is the reassurance. The bulk run is not a second costing "
         "engine. It calls the same one the screens use.")

# ───────────────────────────── 16 · OPTION 2 · WHAT IT CHANGES ──────────────
s = header('Option 2: what it changes for the business', 'Option 2 · the case')
rows = [
    ('How many parts get a proper cost', ('The ones we have hours for', RED, False), ('Every part in the list', GREEN, True)),
    ('How a basket gets priced', ('Sample and scale up', RED, False), ('Every part costed from its own geometry', GREEN, True)),
    ('Turnaround on a new basket', ('Days of engineer time', RED, False), ('Machine time, plus the data gathering', GREEN, True)),
    ('Consistency across a basket', ('Depends who costed it', RED, False), ('Same rules and rates for every part', GREEN, True)),
    ('What we can say to a supplier', ('This is our estimate', AMBER, False), ('Here is the build-up, per part, with the rates', GREEN, True)),
    ('Where an engineer spends the time', ('Typing numbers in', RED, False), ('Answering the questions only a person can', GREEN, True)),
    ('What it needs from a person', ('One engineer per part', RED, False), ('One answer per question, applied to every part', GREEN, True)),
]
table(s, Inches(0.45), Inches(1.9), Inches(12.43),
      ['', 'Today', 'With bulk costing'], rows,
      [Inches(4.13), Inches(3.7), Inches(4.6)], row_h=Inches(0.5), size=10.8)
callout(s, Inches(0.45), Inches(5.85), Inches(12.43), Inches(1.0), AMBERBG, AMBER,
        'The honest limit on all of this',
        'Every row assumes the tool is accurate enough to trust unattended, and today nobody can '
        'say whether it is. That is precisely what Option 1 measures, which is why it comes first.')
footer(s, 'No cost saving is claimed on this slide. The saving depends on our own rate data and on '
          'the accuracy figure Option 1 produces.')
notes(s, "This is the business case for Option two. I have deliberately not put a pound figure on "
         "it. An honest one needs two things we do not have yet: our own rate data loaded, and the "
         "accuracy number from Option one. What I can show is what changes in kind. Today we cost "
         "the parts we have hours for and scale up from a sample. With bulk costing, every part in "
         "the list is costed from its own geometry, with the same rules and the same rates. What "
         "we can say to a supplier changes too. Instead of this is our estimate, it becomes here is "
         "the build-up, part by part. The row I would draw your eye to is the last one. Today it is "
         "one engineer per part. With this it is one answer per question, applied to every part it "
         "affects. The amber box is the limit on all of it. Every row assumes the tool is accurate "
         "enough to leave running, and that is exactly what Option one measures.")

# ─────────────────────────── 17 · OPTION 2 · ORDER OF WORK ──────────────────
s = header('Option 2: order of work', 'Option 2 · sequence')
plan2 = [
    ('1', 'Load JLR rates', VIOLET,
     'Materials, machine rates, labour, energy, country factors, through the JLR Rate Converter. Ours to do.'),
    ('2', 'Agree who controls the rate book', RED,
     'Every rate book is already kept. JLR decides who may change rates and who signs them off.'),
    ('3', 'Agree what a run record must hold', RED,
     'Each run already writes a record. JLR audit says whether it is enough, and where it is stored.'),
    ('4', 'Check the bulk route on our parts', AMBER,
     'Region, volume, gear and the geometry checks are wired on. Confirm them on a handful of JLR parts.'),
    ('5', 'Decide on a screen', INDIGO,
     'The run is a command-line tool today. Add a screen only if the team needs one.'),
    ('6', 'Trial on a real basket', GREEN,
     'One programme, one commodity family, run beside the way we cost today and compare.'),
]
y = Inches(1.88)
for n, t_, c_, b_ in plan2:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.7), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.7), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.11), d=Inches(0.46), fill=c_)
    text(s, Inches(1.42), y + Inches(0.08), Inches(11.2), Inches(0.27), [[(t_, 12.2, DARK, True)]])
    text(s, Inches(1.42), y + Inches(0.38), Inches(11.2), Inches(0.28), [[(b_, 9.6, BODY, False)]])
    y += Inches(0.78)
callout(s, Inches(0.45), Inches(6.6), Inches(6.1), Inches(0.84), PANEL2, INDIGO,
        'Steps 2 and 3 are about control, not code',
        'The tools exist. JLR decides who owns the rates and the records.')
callout(s, Inches(6.78), Inches(6.6), Inches(6.1), Inches(0.84), GREENBG, GREEN,
        'Step 1 can start now',
        'Our own rate data helps both options, whatever is decided.')
notes(s, "Six steps for Option two. Step one is loading our own rates, and it is worth starting "
         "whatever we decide, because both options need it. The Rate Converter takes JLR's rate "
         "card as it is exported and needs no macros. Steps two and three used to be software gaps. "
         "They are not any more. The tool keeps every rate book and writes a record of every run. "
         "What is left is a decision for JLR: who may change rates, who signs them off, and whether "
         "the run record is enough for audit. Step four is a check, not a build. Region, volume, "
         "gear and the geometry checks are wired on, and we should confirm them on a few of our own "
         "parts. Step five is a choice. The run works from the command line, so a screen is only "
         "worth building if the team wants one. Step six is a trial on a real basket, run beside "
         "how we cost today so we can compare.")

# ────────────────────────────────────── 18 · THE TWO TOGETHER ───────────────
s = header('The two options together', 'Comparison')
rows = [
    ('What it gives us', ('The engineer stops typing', DARK, True), ('We can cost a whole basket', DARK, True)),
    ('Which system does the costing', ('CAPEE, same as now', GREEN, True), ('CostVision engine, beside CAPEE', AMBER, False)),
    ('Does anyone learn a new tool', ('No, same CAPEE screens', GREEN, True), ('A reviewer does, for the results', AMBER, False)),
    ('How much software work', ('Moderate: the CAPEE link', AMBER, False), ('Less: the run is built', GREEN, True)),
    ('How much JLR data work', ('Parts with prices we paid', AMBER, False), ('Our full rate book', RED, False)),
    ('Does it tell us how accurate we are', ('Yes, that is the point of it', GREEN, True), ('It relies on that answer', AMBER, False)),
    ('Can we stop part way', ('Yes, CAPEE costs the same way either way', GREEN, True), ('Yes, it runs alongside', GREEN, True)),
    ('Is it waiting on an unknown', ('Yes, how CAPEE is built', AMBER, False), ('Yes, the accuracy figure', AMBER, False)),
    ('Is it audit-ready today', ('Yes, CAPEE keeps the record', GREEN, True), ('Records exist; JLR has not reviewed them', AMBER, True)),
]
table(s, Inches(0.45), Inches(1.9), Inches(12.43),
      ['', 'OPTION 1 · feed CAPEE', 'OPTION 2 · bulk costing'], rows,
      [Inches(4.13), Inches(4.15), Inches(4.15)], row_h=Inches(0.41), size=10.4)
callout(s, Inches(0.45), Inches(6.1), Inches(12.43), Inches(0.82), PANEL2, INDIGO,
        'Read the last two rows together',
        'Option 1 gives the accuracy figure Option 2 leans on, and CAPEE keeps its record. Option 2 '
        'keeps records too, but JLR has not reviewed them. Hence this order.')
footer(s, 'No durations shown. Nothing in either option has been sized by JLR.')
notes(s, "This puts the two side by side. The top half is fairly even, and each option wins some "
         "rows. One row has changed since last time. Option two used to be the bigger software job. "
         "Now the run is built, so most of its remaining work is data, not code. Option one still "
         "needs the link into CAPEE, and that waits on IT. The two rows I would look at are the last "
         "two. Option one produces the accuracy figure that Option two leans on. And Option one is "
         "audit-ready today, because CAPEE keeps the record exactly as it does now. Option two does "
         "keep its own records now, with the rate book each run used. But nobody at JLR has "
         "reviewed them against what audit needs. Those two rows are the whole argument for doing "
         "them in this order.")

# ─────────────────────────────────────── 19 · RISKS ─────────────────────────
s = header('Risks and open items', 'Risks')
rows = [
    (('We do not know how accurate it is', DARK, True), 'Both',
     'Never compared against a price JLR has paid. The Option 1 trial is what settles it.',
     ('High', RED, True)),
    (('We do not know how CAPEE is built', DARK, True), 'Option 1',
     'Holds up the choice of connection route. One answer from IT sorts it.',
     ('High', AMBER, True)),
    (('Run records not yet reviewed by JLR', DARK, True), 'Option 2',
     'Rate books and run records are kept now. JLR audit has not said whether they are enough.',
     ('Medium', AMBER, True)),
    (('The built-in rates are not JLR rates', DARK, True), 'Both',
     'The rate library is dated 16 June 2026. Until our card is loaded, costs use those rates.',
     ('Medium', AMBER, True)),
    (('The built-in numbers are our estimates', DARK, True), 'Both',
     'Starting points, not JLR plant measurements. They get replaced as real data comes in.',
     ('Medium', AMBER, True)),
    (('The AI mode could be switched on', DARK, True), 'Both',
     'AI is off in the JLR build and neither option needs it. Turning it on is a setting, so it '
     'needs an owner and approval first.',
     ('Low', AMBER, True)),
    (('Where the measuring engine runs', DARK, True), 'Option 1',
     'Needs a standard Linux server or the Windows package. The cut-down Linux kind cannot run it.',
     ('Low', AMBER, True)),
    (('The tool is still changing', DARK, True), 'Both',
     'It is under active development. For any trial we pin a version and stay on it.',
     ('Low', AMBER, True)),
]
table(s, Inches(0.45), Inches(1.9), Inches(12.43),
      ['Item', 'Applies to', 'Detail and what sorts it', 'Rating'], rows,
      [Inches(3.4), Inches(1.15), Inches(6.58), Inches(1.3)], row_h=Inches(0.52), size=9.6)
callout(s, Inches(0.45), Inches(6.6), Inches(12.43), Inches(0.84), PANEL2, INDIGO,
        'One decision deals with the top item',
        'Approving the Option 1 trial turns "we do not know how accurate it is" into a '
        'number. Everything else on this list is smaller and has a known fix.')
notes(s, "Eight items. The top one is the one that would stop me putting this in front of a "
         "supplier today, and approving the trial is what fixes it. The second is waiting on IT. "
         "The third is new. The software gap on records is closed, but JLR audit has not looked at "
         "them, so we should ask them early. The fourth matters more than it looks. Until our own "
         "rate card is loaded, every cost uses the built-in rates from June, and those are not our "
         "rates. The sixth is about AI, because it always comes up. AI is off in the build we gave "
         "JLR, nothing is sent out, and neither option needs it. But turning it on is only a "
         "setting, so someone should own that switch. The last row is worth saying plainly. The "
         "tool is still being worked on, so for any trial we pin one version and stay on it.")

# ─────────────────────────────── 20 · WHAT WE NEED TO START ─────────────────
s = header('What we need to get going', 'Next steps')
asks = [
    ('1', 'clip', '30 to 50 parts with the price we actually paid', RED,
     'Part, description, annual volume, where it was made, and the price paid. Existing purchase '
     'records will do. This is what turns "we think it is about right" into a number, and both '
     'options rest on it.'),
    ('2', 'coins', 'Our own rate data', VIOLET,
     'Material prices, machine rates per hour, labour by grade, electricity and gas. The Rate '
     'Converter loads JLR\'s rate card as exported, with no macros. Worth starting now.'),
    ('3', 'cog', 'How CAPEE is built', INDIGO,
     'What it is written in, whether it can call another service on the network, and what kind of '
     'server it runs on. Three questions to IT. Unblocks Option 1.'),
    ('4', 'shield', 'Agreement that AI stays off', GREEN,
     'Neither option needs AI, and the JLR build has it switched off. If we want the AI features '
     'later, that is a separate approval.'),
    ('5', 'person', 'A team and one part type for the trial', AMBER,
     'One cost engineer and one commodity family for the duration. Machined parts or pressings '
     'would be my choice.'),
]
y = Inches(1.82)
for n, ic, t_, c_, b_ in asks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.9), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.9), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.1), d=Inches(0.46), fill=c_)
    icon_badge(s, ic, Inches(1.38), y + Inches(0.1), d=Inches(0.46), fill=c_)
    text(s, Inches(2.06), y + Inches(0.09), Inches(10.5), Inches(0.28), [[(t_, 12.4, DARK, True)]])
    text(s, Inches(2.06), y + Inches(0.4), Inches(10.4), Inches(0.44),
         [[(b_, 10.0, BODY, False)]], line_spacing=1.12)
    y += Inches(0.98)
callout(s, Inches(0.45), Inches(6.8), Inches(12.43), Inches(0.66), GREENBG, GREEN,
        'The first two do not wait on any decision made today',
        'Purchase records and our own rates are useful whichever way this goes.')
notes(s, "Five things. The first is the one I will keep coming back to: thirty to fifty parts where "
         "we know what we paid. Purchase records are fine. I do not need anything new created. "
         "Without them I cannot tell anyone how accurate this is, and that is the first question "
         "we will be asked. The second is our own rates. The Rate Converter can take our rate card "
         "as it is exported today, with no macros, so this is mostly gathering, not building. It is "
         "worth starting whatever you decide, because both options need it. The third is three "
         "questions to IT. The fourth is a simple agreement. AI stays off. Neither option needs it, "
         "and the build JLR has already runs without it. If we ever want the AI features, that is "
         "a separate conversation and a separate approval. The fifth is a person and a part type "
         "for the trial. And the green strip: the first two do not wait on anything decided here.")

# ────────────────────────────── 21 · WHERE THE NUMBERS COME FROM ────────────
s = header('Where the numbers come from', 'Appendix')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.32),
     [[('Every count in this pack was checked against the software on 28 September 2026.',
        11.5, BODY, False)]])
rows = [
    ('19 manufacturing processes; 13 costed from CAD', 'Commodity modules and CAD rule packs in the code'),
    ('About 12 to 70 values typed per part', 'Rough count of the input fields on CostVision\'s own forms, by commodity'),
    ('Engine matches a hand calculation to under 0.01%', 'Reference machined bracket, £23.27, pinned in an automated test'),
    ('6 real production parts pinned', 'A change that moves any of them fails the build'),
    ('2,438 automated tests', 'Plus browser tests that cost every commodity and export Excel and PDF'),
    ('Measuring makes no internet connection', 'Windows package runs offline and listens on this laptop only (127.0.0.1)'),
    ('AI is switched off in the JLR build', 'The package sets the no-AI switch; AI screens are hidden'),
    ('A bulk run exists, with no AI', 'Command-line run: results, open questions and a run record'),
    ('Every rate book is kept', 'Stored by a content fingerprint, so a past costing can be redone'),
    ('Line counts on slide 7', 'Counted in the source files on 28 September 2026, rounded'),
    ('Settings values on slide 9', 'Read off the software; each is a single defined value'),
    ('328 materials, 178 machines, 42 labour grades', 'Rate library 2.1.0, dated 16 June 2026'),
    ('20 manufacturing regions', 'Europe, UK, Turkey, the Americas and Asia, in the rate model'),
    ('Sign-in and per-user data', 'Users see only their own saved work; a reset ends every old session'),
]
table(s, Inches(0.45), Inches(2.15), Inches(12.43), ['Statement', 'How it was checked'], rows,
      [Inches(5.9), Inches(6.53)], row_h=Inches(0.29), size=9.5)
callout(s, Inches(0.45), Inches(6.78), Inches(12.43), Inches(0.66), AMBERBG, AMBER,
        'One number we deliberately do not show',
        'Accuracy against real prices. The tool learns from logged actual prices, but none from JLR '
        'are loaded yet. That is ask number one.')
notes(s, "Keep this one for anyone who wants to know how we know. Every claim in the pack was checked "
         "against the software this week rather than assumed. A few are worth pointing at. The "
         "engine's arithmetic matches a hand calculation to under 0.01 percent on a reference part. "
         "That proves the sums are right. It does not prove the price is right. Six real production "
         "parts are pinned, so we notice if a change moves them. The measuring makes no internet "
         "connection, and the Windows package only listens on the laptop itself. That is the "
         "answer to the first question IT security will ask. AI is switched off in that build. The "
         "amber box is the one number I have deliberately left off every slide: accuracy against "
         "real prices. The tool can learn from actual prices once they are logged, but none from "
         "JLR are in it yet. That is why ask number one is what it is.")

# ─────────────────────────────────────────────────────────────────────────────
OUT = 'CostVision-CAPEE-Implementation-Options.pptx'
prs.save(OUT)
finalise(OUT)


def assert_powerpoint_can_open(path):
    """Fail the build on the OOXML faults that make PowerPoint offer to repair.

    LibreOffice opens files PowerPoint rejects, so converting to PDF proves
    nothing about whether the deck will open on a colleague's laptop. A shape
    with a zero or negative extent is the fault this build actually hit: a short
    callout made an inner text box `h - chrome` wide, which went negative, and
    PowerPoint refused the file while LibreOffice rendered it happily.
    """
    import zipfile, re
    import xml.etree.ElementTree as ET
    A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
    z = zipfile.ZipFile(path)
    faults = []
    if z.testzip() is not None:
        faults.append('zip archive is corrupt')
    for n in sorted(x for x in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', x)):
        root = ET.fromstring(z.read(n))
        for ext in root.iter('{%s}ext' % A):
            cx, cy = int(ext.get('cx', '1')), int(ext.get('cy', '1'))
            if cx <= 0 or cy <= 0:
                faults.append(f'{n}: shape extent cx={cx} cy={cy}')
        ids = [int(e.get('id')) for e in root.iter('{%s}cNvPr' % NS) if e.get('id')]
        for d in sorted({i for i in ids if ids.count(i) > 1}):
            faults.append(f'{n}: duplicate shape id {d}')
    if faults:
        raise SystemExit('DECK IS INVALID - PowerPoint would ask to repair it:\n  '
                         + '\n  '.join(faults))
    return len([x for x in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', x)])


n_slides = assert_powerpoint_can_open(OUT)
print(f'{OUT}  -  {n_slides} slides, validated')

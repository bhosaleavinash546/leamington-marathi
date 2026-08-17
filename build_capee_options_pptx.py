#!/usr/bin/env python3
"""
CostVision and CAPEE — two implementation options. Decision deck for the JLR
Cost Engineering team.

Written for a non-IT audience: plain language on the slides and in the speaker
notes, technical terms only where there is no honest substitute.

TWO RULES THIS FILE FOLLOWS.

1. No durations. Not weeks, not months, not quarters. Nothing in this deck has
   been scoped by JLR, so a date would be an invention presented as a plan. The
   order of work and the dependencies between steps are real and are shown; how
   long each takes is for JLR to size.

2. Only what is in the software goes on a slide. Every count and value was read
   from the codebase in August 2026 and re-checked at build time.

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

# ── Palette: identical to build_blueprint_pptx.py so the pack reads as one ────
INDIGO  = RGBColor(0x1D, 0x6F, 0xB8)
BLUE    = RGBColor(0x1D, 0x6F, 0xB8)
DARK    = RGBColor(0x16, 0x32, 0x5C)
BODY    = RGBColor(0x3A, 0x43, 0x56)
MUTED   = RGBColor(0x6B, 0x72, 0x80)
BG      = RGBColor(0xF4, 0xF7, 0xFB)
PANEL   = RGBColor(0xFF, 0xFF, 0xFF)
PANEL2  = RGBColor(0xE8, 0xF1, 0xFA)
GREENBG = RGBColor(0xEA, 0xF6, 0xEF)
AMBERBG = RGBColor(0xFC, 0xF3, 0xE3)
REDBG   = RGBColor(0xFB, 0xEC, 0xEA)
GREEN   = RGBColor(0x2E, 0x8B, 0x57)
AMBER   = RGBColor(0xB7, 0x79, 0x1F)
RED     = RGBColor(0xB0, 0x3A, 0x2E)
VIOLET  = RGBColor(0x6B, 0x3F, 0xA0)
LINE    = RGBColor(0xDC, 0xE3, 0xEE)
NAVY    = RGBColor(0x16, 0x32, 0x5C)
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
         [[('AI  COST  INTELLIGENCE', 7.5 * s, HERO_DIM if on_dark else MUTED, False)]])


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
text(s, Inches(0.6), Inches(2.05), Inches(11.6), Inches(1.4),
     [[('CostVision and CAPEE', 40, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.6), Inches(3.05), Inches(11.4), Inches(0.6),
     [[('Two options for putting the tool to work, what each one needs from us, '
        'and a recommendation', 16, HERO_SUB, False)]])
box(s, Inches(0.6), Inches(3.95), Inches(3.3), Pt(2.5), fill=INDIGO)
for i, (n, t_, sub) in enumerate([
        ('1', 'Feed CAPEE automatically',
         'CAPEE keeps doing the costing. CostVision supplies the input numbers, read from the '
         '3D model and the drawing.'),
        ('2', 'Run CostVision on JLR rates',
         'Install CostVision as it stands. Replace the rates it ships with by our own material, '
         'machine, labour and energy costs.')]):
    y = Inches(4.3) + Inches(0.95) * i
    step_circle(s, n, Inches(0.62), y, d=Inches(0.55), fill=INDIGO)
    text(s, Inches(1.4), y + Inches(0.02), Inches(10.8), Inches(0.3), [[(t_, 15, ON_DARK, True)]])
    text(s, Inches(1.4), y + Inches(0.35), Inches(10.8), Inches(0.32), [[(sub, 11, HERO_SUB, False)]])
text(s, Inches(0.6), Inches(6.5), Inches(11.6), Inches(0.4),
     [[('JLR Cost Engineering  ·  August 2026', 10, HERO_DIM, False)]])
notes(s, "We have been building a tool called CostVision. The question is how we get the use of it "
         "into JLR. There are two sensible routes and I will take you through both. I will tell you "
         "what each needs from us and where the tool is genuinely not finished yet. There are no "
         "dates in this deck. Nothing here has been sized by our IT or by the business, so any "
         "timeline I put up would be a guess dressed as a plan. What I can show you is the order "
         "the work has to happen in and what depends on what.")

# ──────────────────────────────────────────────── 2 · THE TWO OPTIONS ───────
s = header('The two options', 'Summary')
card(s, Inches(0.45), Inches(1.8), Inches(6.1), Inches(2.35), INDIGO,
     'OPTION 1 · Feed CAPEE automatically',
     [('CAPEE is unchanged and still does the costing.',),
      ('Rather than typing thirty boxes, the engineer supplies the',),
      ('3D model and the drawing and the numbers arrive filled in.',),
      ('',),
      ('Moves about 5,700 lines of measuring and reading software,', DARK, True),
      ('plus the safety checks that go with it.', DARK, True)])
card(s, Inches(6.78), Inches(1.8), Inches(6.1), Inches(2.35), VIOLET,
     'OPTION 2 · Run CostVision on JLR rates',
     [('CostVision is installed as it stands. Nothing is rebuilt.',),
      ('We load JLR material prices, machine rates, labour and',),
      ('energy costs in place of the ones supplied with it.',),
      ('',),
      ('No change to how it calculates. The work is collecting', DARK, True),
      ('our rate data and installing it on a JLR server.', DARK, True)])
callout(s, Inches(0.45), Inches(4.35), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'RECOMMENDATION · Option 2 first, then Option 1',
        'Option 2 is the smaller change and it can be stopped at any point. It also answers the '
        'question Option 1 cannot answer for itself: whether the tool gets the right number on JLR '
        'parts. Option 1 industrialises that capability once we know it works.')
callout(s, Inches(0.45), Inches(5.5), Inches(12.43), Inches(1.35), AMBERBG, AMBER,
        'BEFORE EITHER OPTION',
        'CostVision has never been checked against a price JLR has actually paid. Not one part. '
        'Until 30 to 50 real purchases are loaded and compared, nobody can state how accurate it '
        'is, and neither option should be signed off as ready for supplier negotiation. That work '
        'sits with us, not with the software.')
notes(s, "Two options. On the left, CAPEE carries on costing and we feed it the input numbers "
         "automatically. On the right, we install CostVision as it is and put our own rates into "
         "it. My recommendation is to do the second one first, because it is smaller, we can stop "
         "it if it is not working, and it tells us whether the tool is actually accurate on our "
         "parts. The amber box is the thing I want on the record early. This tool has never been "
         "compared against a price we have actually paid. Until we do that, I cannot tell you how "
         "accurate it is and I would not put it in front of a supplier.")

# ──────────────────────────────────── 3 · WHERE COSTVISION STANDS TODAY ─────
s = header('Where CostVision stands today', 'Current status')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.32),
     [[('Read from the software in August 2026, not from a plan or a proposal.', 11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.15), Inches(6.1), Inches(3.5), GREEN,
     'WORKING NOW',
     [('19 part types can be costed in the tool',),
      ('The costing maths gives the same answer every run',),
      ('Measures 3D models with no internet connection',),
      ('Reads drawings for tolerances, finish, heat treatment',),
      ('Safety checks on everything read from a drawing',),
      ('PDF and Excel reports; PowerPoint for the negotiation pack',),
      ('An administrator can upload a rate workbook',),
      ('2,022 automatic software tests, all passing',)], fill=GREENBG)
card(s, Inches(6.78), Inches(2.15), Inches(6.1), Inches(3.5), AMBER,
     'NOT THERE YET',
     [('Never compared against a price JLR has paid',),
      ('No history kept when a rate is changed',),
      ('Finished costings are not saved, so an old one',),
      ('cannot be reproduced',),
      ('No JLR sign-on; it has its own logins today',),
      ('Gear costing works in the screens but is not',),
      ('reachable from the automated route',),
      ('Three faults found and fixed in August; the tool',),
      ('is still under active development',)], fill=AMBERBG)
callout(s, Inches(0.45), Inches(5.85), Inches(12.43), Inches(0.95), PANEL2, INDIGO,
        'Why this slide is here',
        'Both options build on what is in the left column and have to fix things in the right one. '
        'The right column is not a list of excuses; it is the scope neither option can skip.')
notes(s, "Before either option, this is honestly where the tool is. Left side is working now and I "
         "have checked every line of it against the software this month. Nineteen part types cost "
         "properly. The maths is repeatable. It measures models without any internet connection, "
         "which is the first thing IT security will ask. Right side is what is not finished. Top "
         "one is the important one and I will keep saying it. Below that, it does not keep a "
         "history when someone changes a rate and it does not save finished costings, so today you "
         "could not reproduce a costing from three months ago. For audit that has to be fixed. And "
         "we are still actively fixing things, three faults last month.")

# ─────────────────────────────────────── 4 · WHAT CHANGES FOR THE USER ──────
s = header('What changes for the person doing the costing', 'The case for doing this')
card(s, Inches(0.45), Inches(1.85), Inches(6.1), Inches(3.45), RED,
     'TODAY · typed in by hand',
     [('Part weight and starting material weight',),
      ('Wall thickness and overall size',),
      ('Counts of holes, pockets and bosses',),
      ('Machine times for each operation',),
      ('Surface area for painting or plating',),
      ('Tolerances, finish, heat treatment',),
      ('',),
      ('Two engineers costing the same part will not enter',),
      ('the same numbers, so we get two different answers.', DARK, True)], fill=REDBG)
card(s, Inches(6.78), Inches(1.85), Inches(6.1), Inches(3.45), GREEN,
     'WITH COSTVISION · read off the model',
     [('Supply the 3D model and the drawing.',),
      ('',),
      ('Measured from the model:', DARK, True),
      ('volume, size, surface area, wall thickness, holes,',),
      ('pockets, bosses, gear teeth.',),
      ('',),
      ('Read from the drawing:', DARK, True),
      ('tolerances, surface finish, heat treatment, coating,',),
      ('masked features.',),
      ('',),
      ('The same part gives the same numbers each time.', GREEN, True)], fill=GREENBG)
callout(s, Inches(0.45), Inches(5.55), Inches(12.43), Inches(1.2), PANEL2, INDIGO,
        'Measuring and reading are two different jobs',
        'The 3D model is measured by software, in the way a CMM measures a part. That is not the AI. '
        'The AI is used to read the words on the drawing, and everything it reads is compared '
        'against the measured model before it can affect a cost. The next slide covers those checks.')
notes(s, "This is the case for doing anything at all. Everything in the left column is typed in by "
         "hand today. The speed matters, but the second point matters more. Two of our engineers "
         "costing the same part will not type the same numbers, so we end up with two answers for "
         "one part. On the right is what the tool does instead. The blue box is the distinction I "
         "want people to hold on to. Measuring the model is ordinary software doing geometry. The "
         "AI only reads the writing on the drawing, and we check everything it reads.")

# ──────────────────────────────────────────── 5 · OPTION 1 · FULL PICTURE ───
s = header('Option 1: automatic data into CAPEE', 'Option 1')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens each time an engineer costs a part', 11.5, MUTED, True)]])
steps = [
    ('upload', 'Engineer supplies files', '3D model and drawing, from the CAPEE screen', INDIGO),
    ('ruler',  'Software measures',       'Size, weight, surface area, holes, pockets',  INDIGO),
    ('clip',   'AI reads the drawing',    'Tolerances, finish, coating, heat treatment', VIOLET),
    ('shield', 'Safety checks run',       'What the AI read is compared with the model', GREEN),
    ('person', 'Engineer confirms',       'Only what a 3D model cannot show',            AMBER),
    ('calc',   'CAPEE costs the part',    'CAPEE receives the numbers and calculates',   GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('The order the build has to happen in', 11.5, MUTED, True)]])
ph = ['Agree the connection', 'Stand up measuring', 'Hand over settings',
      'Add safety checks', 'Connect into CAPEE', 'Trial on one part type']
cw = Inches(2.05)
x = Inches(0.45)
for i, lbl in enumerate(ph):
    chevron(s, x, Inches(4.58), cw, Inches(0.6), lbl, '', INDIGO if i < 5 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.38), Inches(12.43), Inches(0.6), 'WE DO', INDIGO,
     ['Package the measuring software', 'Write out every setting', 'Move the safety checks across',
      'Support the CAPEE connection'])
lane(s, Inches(0.45), Inches(6.02), Inches(12.43), Inches(0.6), 'JLR DOES', VIOLET,
     ['Tell us how CAPEE is built', 'Provide a server', 'Change CAPEE to accept the numbers',
      'Release a team for the trial'])
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.6), AMBERBG, AMBER,
        'One step cannot be sized yet',
        'Connecting into CAPEE depends on how CAPEE is built, which we do not know. Slide 8 sets '
        'out the three ways of doing it.')
notes(s, "The whole of Option 1 on one slide. Top row is what happens each time somebody costs a "
         "part. The engineer supplies the model and drawing from inside CAPEE. Software measures "
         "the model, the AI reads the drawing, the safety checks compare the two. A few things no "
         "model can show, like heat treatment, the engineer confirms. Then CAPEE gets the numbers "
         "and costs the part exactly as it does now. Underneath is the order the build has to "
         "happen in and who does what. I have deliberately not put weeks against these. Nobody has "
         "sized this yet, and the connection step in particular depends on an answer we do not have.")

# ─────────────────────────────────────────────────────── 6 · SAFETY CHECKS ──
s = header('Safety checks', 'Option 1 · required')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('The AI does not set a price. It does supply numbers that feed into one, so a wrong reading '
        'becomes a wrong cost. These four checks are what stop that, and they have to move across '
        'with the rest.', 11.5, BODY, False)]])
checks = [
    ('cube', 'The measured model overrules the AI', INDIGO,
     'If the AI reads 2 kg and the model measures 1.4 kg, the measured figure is used. The geometry '
     'is treated as the fact.'),
    ('eye', 'Everything read is cross-checked', INDIGO,
     'Numbers taken off the drawing are compared against the measured model. Disagreements are '
     'reported to the engineer rather than settled quietly.'),
    ('press', 'Machining time has a ceiling', INDIGO,
     'On a casting or forging, machining is capped at what finishing that part could plausibly take, '
     'so a bad estimate cannot inflate the cost.'),
    ('person', 'Unknowns are asked, not guessed', VIOLET,
     'Heat treatment, tolerance class and material grade cannot be read from a solid model. The '
     'engineer is asked. The AI suggestion is labelled as a suggestion and is never pre-selected.'),
]
y = Inches(2.42)
for ic, t_, c_, b_ in checks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.95), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.95), fill=c_)
    icon_badge(s, ic, Inches(0.72), y + Inches(0.17), d=Inches(0.6), fill=c_)
    text(s, Inches(1.55), y + Inches(0.15), Inches(11.1), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(1.55), y + Inches(0.46), Inches(11.1), Inches(0.42),
         [[(b_, 10.2, BODY, False)]], line_spacing=1.12)
    y += Inches(1.06)
callout(s, Inches(0.45), Inches(6.7), Inches(12.43), Inches(0.62), REDBG, RED,
        'This is not theoretical',
        'Our August review found a route through the tool with no checks on it. A single missing '
        'input produced a cost of "not a number" while the software reported that it had worked. '
        'It is fixed. It is also why these checks are listed as part of the scope, not an extra.')
notes(s, "On a project like this the temptation is to take the measuring and the AI and leave what "
         "looks like plumbing until later. These four checks are what make the rest safe. The first "
         "is the one to remember: if the AI and the measured model disagree, the model wins. The "
         "last one matters for a different reason. Where the tool cannot know something it asks "
         "rather than guessing, and it never pre-ticks its own answer. The red box is from our own "
         "review last month. We found a route with no checks that returned a nonsense figure while "
         "reporting success. We fixed it, and it is why I am treating the checks as scope.")

# ────────────────────────────────────────────────── 7 · WHAT WE HAND OVER ───
s = header('What we hand over, and what it is written in', 'Option 1 · handover')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Line counts read from the software. Both languages are in common use and JLR IT will have '
        'people who know them.', 11.5, BODY, False)]])
rows = [
    ('Measuring engine', ('Python', DARK, True), '2,039 lines',
     'Opens the 3D model and measures it. Makes no internet connection.'),
    ('Reading the drawing', ('TypeScript', DARK, True), '2,443 lines',
     'Sends the drawing to the AI and organises what comes back.'),
    ('Safety checks', ('TypeScript', DARK, True), '536 lines',
     'The four checks on the previous slide.'),
    ('Questions per part type', ('TypeScript', DARK, True), '7,037 lines',
     'Decides what the engineer is asked for each kind of part.'),
    ('Design-for-cost findings', ('TypeScript', DARK, True), '1,930 lines',
     'Flags features that are expensive to make and explains why.'),
    ('Settings list', ('Plain list', DARK, True), 'one file',
     'Every fixed number gathered in one place. Next slide.'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['Part', 'Language', 'Size', 'What it does'], rows,
      [Inches(3.3), Inches(1.7), Inches(1.5), Inches(5.93)], row_h=Inches(0.52), size=10.5)
callout(s, Inches(0.45), Inches(5.6), Inches(6.1), Inches(1.15), PANEL2, INDIGO,
        'On the two languages',
        'Python is standard for engineering and measurement work. TypeScript is widely used for '
        'business software. Neither is unusual and neither ties JLR to a single supplier.')
callout(s, Inches(6.78), Inches(5.6), Inches(6.1), Inches(1.15), AMBERBG, AMBER,
        'One item for IT to confirm',
        'The measuring engine needs a standard Linux server rather than the cut-down kind used for '
        'small services. It decides where this can be installed, so worth settling early.')
notes(s, "You asked what would actually be handed over. Six things, and the line counts come "
         "straight from the software. The measuring engine is Python, which is the normal choice "
         "for measurement work. The rest is TypeScript, common in business software. Neither is "
         "exotic and neither ties us to one supplier. The bottom row is the settings list, which is "
         "the next slide. The amber box is the one practical constraint worth raising with IT now, "
         "because it decides where this can live.")

# ───────────────────────────────────────────────── 8 · THE SETTINGS LIST ────
s = header('The fixed numbers inside the software', 'Option 1 · settings')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('These are engineering judgements written into the code. Six real examples, taken from the '
        'software as it stands:', 11.5, BODY, False)]])
rows = [
    ('Smallest face counted as machined', ('400 mm²', DARK, True),
     'Below this it is treated as an edge, not a face to machine'),
    ('Smallest pocket counted', ('80 mm²', DARK, True),
     'Stops small recesses being costed as pockets'),
    ('Cost of a rejected plated part', ('4.5x a good one', DARK, True),
     'It is stripped and re-plated, so a 3% reject rate is nearer 13% on cost'),
    ('Zinc price used for plating', ('USD 3.67 / kg', DARK, True),
     'Market reference, August 2026. Moves monthly and is meant to be updated'),
    ('Shape allowance, pressing', ('1.15', DARK, True),
     'A real pressing has more surface than a flat plate: edges, flanges, bends'),
    ('Shape allowance, casting and forging', ('1.25 / 1.10', DARK, True),
     'Castings carry ribs and bosses; forgings are simpler on the outside'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['What it controls', 'Value', 'Reasoning'], rows,
      [Inches(4.3), Inches(2.3), Inches(5.83)], row_h=Inches(0.5), size=10.5)
callout(s, Inches(0.45), Inches(5.5), Inches(6.1), Inches(1.2), PANEL2, INDIGO,
        'How they are handed over',
        'Gathered out of the code into one list that can be read and changed without a developer. '
        'That list is a deliverable in its own right and is a step in the Option 1 sequence.')
callout(s, Inches(6.78), Inches(5.5), Inches(6.1), Inches(1.2), AMBERBG, AMBER,
        'Where these came from',
        'They are our engineering estimates, not measurements from a JLR plant. They are a working '
        'starting point and JLR should expect to replace them as real data arrives.')
notes(s, "Hardcoded values is a phrase that means nothing on its own, so here are six real ones. "
         "Look at the third row. A rejected plated part costs about four and a half times a good "
         "one because you strip it and start again, which is why a three percent reject rate is "
         "closer to thirteen percent on cost. That is an engineering judgement and exactly the sort "
         "of thing you would challenge in a review, so it should not be buried in code. We gather "
         "every one of them into a single list you can read and change. The amber box is the "
         "caveat: these are our estimates, not measurements from one of our plants.")

# ──────────────────────────────────────── 9 · THREE WAYS TO CONNECT ─────────
s = header('Three ways to connect it to CAPEE', 'Option 1 · decision for IT')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('We do not yet know how CAPEE is built. All three routes work; the answer decides which one '
        'and how much effort it takes.', 11.5, BODY, False)]])
rows = [
    (('A · Put it inside CAPEE', DARK, True), 'CAPEE is built in JavaScript',
     'Our code goes in directly. Only the measuring engine sits separately.',
     ('Least effort', GREEN, True)),
    (('B · Run it alongside', DARK, True), 'CAPEE is Java, .NET or anything else',
     'It runs as its own service on a JLR server and CAPEE asks it for numbers over a secure link.',
     ('Most effort', AMBER, True)),
    (('C · Pass a file', DARK, True), 'CAPEE is a desktop or spreadsheet tool',
     'It writes a file that CAPEE imports. Simplest to build, but somebody has to move the file.',
     ('Least effort', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.3), Inches(12.43),
      ['Route', 'Use when', 'What it means in practice', 'Relative effort'], rows,
      [Inches(2.9), Inches(2.9), Inches(5.13), Inches(1.5)], row_h=Inches(0.85), size=10.3)
callout(s, Inches(0.45), Inches(5.4), Inches(6.1), Inches(1.0), PANEL2, INDIGO,
        'If we had to choose without the answer',
        'Route B. It works whatever CAPEE turns out to be, and it lets CostVision be updated '
        'without touching CAPEE each time.')
callout(s, Inches(6.78), Inches(5.4), Inches(6.1), Inches(1.0), AMBERBG, AMBER,
        'Three questions for IT',
        'What is CAPEE written in. Can it call another service on the network. Can it run on a '
        'standard Linux server.')
footer(s, 'Effort is shown relative to the other routes. None of the three has been sized by JLR.')
notes(s, "I cannot give you one answer because nobody has told us how CAPEE is built. Rather than "
         "hold everything up, here are all three routes. All of them work. What changes is how much "
         "effort it takes, and I have shown that relative to each other rather than in weeks, "
         "because none of this has been sized. If you made me choose blind I would take route B, "
         "running it alongside, because it works whatever CAPEE is and we can improve our side "
         "without disturbing it. The three questions in amber are what I need from IT.")

# ────────────────────────────────────────────── 10 · OPTION 1 · SEQUENCE ────
s = header('Option 1: order of work', 'Option 1 · sequence')
plan1 = [
    ('1', 'Agree the connection', INDIGO,
     'Establish how CAPEE is built, choose one of the three routes, agree exactly which numbers CAPEE expects.'),
    ('2', 'Stand up the measuring software', INDIGO,
     'Install it on a JLR server. Measure 20 real JLR parts and check the results against their drawings.'),
    ('3', 'Hand over the settings list', VIOLET,
     'Gather every fixed number into one list. JLR reviews it and signs it off before anything is costed with it.'),
    ('4', 'Move the safety checks across', GREEN,
     'The four checks and the questions the engineer confirms. Part of the scope, not an addition.'),
    ('5', 'Connect into CAPEE', INDIGO,
     'Wire it in. Route the drawing reading through a JLR-approved AI service. Cost one real part end to end.'),
    ('6', 'Trial on one part type', GREEN,
     'One team, one part type, 30 parts or more. Measure how well the measuring actually performs.'),
]
y = Inches(1.95)
for n, t_, c_, b_ in plan1:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.79), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.79), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.15), d=Inches(0.48), fill=c_)
    text(s, Inches(1.42), y + Inches(0.11), Inches(11.2), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(1.42), y + Inches(0.43), Inches(11.2), Inches(0.3), [[(b_, 9.9, BODY, False)]])
    y += Inches(0.88)
callout(s, Inches(0.45), Inches(7.28) - Inches(0.92), Inches(6.1), Inches(0.82),
        PANEL2, INDIGO, 'Steps 1 and 2 can start together',
        'Standing up the measuring software does not depend on knowing how CAPEE is built. Only '
        'step 5 does.')
callout(s, Inches(6.78), Inches(7.28) - Inches(0.92), Inches(6.1), Inches(0.82),
        AMBERBG, AMBER, 'Start with one part type',
        'Machined parts or pressings first: most of our volume and the best understood shapes. '
        'Widen once it holds up.')
notes(s, "Six steps in the order they have to happen. Two worth drawing out. Step three is the "
         "settings list, signed off before anything is costed with it. Step four is the safety "
         "checks, which I have given a step of their own so it does not get folded into the "
         "connection work and squeezed. The blue box is useful for planning: steps one and two can "
         "run at the same time, because standing up the measuring software does not depend on "
         "knowing how CAPEE is built. Only step five does.")

# ───────────────────────────────────────────── 11 · OPTION 2 · FULL PICTURE ─
s = header('Option 2: CostVision on JLR rates', 'Option 2')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens each time an engineer costs a part', 11.5, MUTED, True)]])
steps2 = [
    ('upload', 'Engineer opens CostVision', 'Signs in with a JLR login',                   VIOLET),
    ('cube',   'Supplies the part',         '3D model where there is one, otherwise the form', VIOLET),
    ('cog',    'Selects the part type',     'Machined, pressed, cast, forged, moulded',    VIOLET),
    ('coins',  'JLR rates are applied',     'Our own material, machine, labour and energy costs', GREEN),
    ('calc',   'Cost is calculated',        'Eight cost buckets, every figure traceable',  GREEN),
    ('clip',   'Report is produced',        'PDF or Excel for a supplier discussion',      GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps2):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps2) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('The order the setup has to happen in', 11.5, MUTED, True)]])
ph2 = ['IT security review', 'Install and connect logins', 'Load JLR rates',
       'Check against real parts', 'Trial with one team']
cw = Inches(2.47)
x = Inches(0.45)
for i, lbl in enumerate(ph2):
    chevron(s, x, Inches(4.58), cw, Inches(0.6), lbl, '', VIOLET if i < 3 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.38), Inches(12.43), Inches(0.6), 'WE DO', INDIGO,
     ['Install on a JLR server', 'Connect JLR sign-on', 'Load the rates supplied',
      'Run the accuracy comparison'])
lane(s, Inches(0.45), Inches(6.02), Inches(12.43), Inches(0.6), 'JLR DOES', VIOLET,
     ['Security sign-off', 'Provide a server', 'Collect the rate data', 'Supply parts with real prices'])
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.6), AMBERBG, AMBER,
        'The software is the small part',
        'Collecting our own rate data is the step that governs everything else, and it sits with us '
        'rather than with the tool.')
notes(s, "Same treatment for Option 2. Top row is what an engineer does. Sign in with a JLR login, "
         "put in a model or fill the form, pick the part type, and out comes a costed answer with a "
         "report. Underneath is the setup order and who does what. Look at the two bands. The top "
         "one is us and it is straightforward. The bottom one is JLR and the third box is the real "
         "work: collecting our own rates. I want to be clear the software side of this is the small "
         "part. What governs the whole thing is how quickly we can pull our own numbers together.")

# ──────────────────────────────── 12 · WHAT IS REPLACED WITH JLR DATA ───────
s = header('What is replaced with JLR data', 'Option 2 · detail')
card(s, Inches(0.45), Inches(1.9), Inches(4.0), Inches(2.7), GREEN,
     'UNCHANGED',
     [('All 19 part types',),
      ('The costing maths',),
      ('Reading 3D models and drawings',),
      ('The safety checks',),
      ('PDF and Excel reports',),
      ('Design-for-cost findings',)], fill=GREENBG)
card(s, Inches(4.63), Inches(1.9), Inches(4.0), Inches(2.7), VIOLET,
     'REPLACED WITH JLR DATA',
     [('Material prices',),
      ('Machine rates per hour',),
      ('Labour rates by grade',),
      ('Electricity and gas prices',),
      ('Overhead and margin policy',),
      ('Rates for the countries we buy from',)])
card(s, Inches(8.81), Inches(1.9), Inches(4.07), Inches(2.7), INDIGO,
     'TO BE ADDED · not built yet',
     [('JLR single sign-on',),
      ('A shared database',),
      ('AI routed through a JLR service',),
      ('History of every rate change',),
      ('Costings saved and auditable',),
      ('Backups to JLR standard',)])
callout(s, Inches(0.45), Inches(4.8), Inches(12.43), Inches(1.0), PANEL2, INDIGO,
        'Swapping the rates is configuration, not development',
        'The tool was built so the rate book is handed to it rather than built into it, and an '
        'administrator can already upload a rate workbook. Putting JLR numbers in does not change '
        'how anything is calculated.')
callout(s, Inches(0.45), Inches(5.95), Inches(12.43), Inches(0.95), AMBERBG, AMBER,
        'The third column is scope, not a wish list',
        'None of it exists today. Without the rate history and saved costings, a costing produced '
        'three months ago cannot be reproduced, which rules the tool out for audit until it is done.')
notes(s, "Three columns. Left, what stays exactly as it is, and note it is nineteen part types in "
         "the tool itself. Middle, the numbers we swap for ours. Right, what has to be added, and I "
         "have labelled that column honestly because none of it exists today. The blue box is the "
         "reassuring engineering point: the rate book is handed to the tool from outside rather "
         "than built in, and there is already a screen for uploading one, so putting our numbers in "
         "is configuration. The amber box is the one to take seriously. Until the rate history and "
         "saved costings are built, you could not reproduce a costing from three months ago, and "
         "that rules it out for anything audited.")

# ──────────────────────────────────────────── 13 · OPTION 2 · SEQUENCE ──────
s = header('Option 2: order of work', 'Option 2 · sequence')
plan2 = [
    ('1', 'IT security review', INDIGO,
     'The data-flow document already exists. IT decides how the drawing-reading step is handled.'),
    ('2', 'Install and connect', INDIGO,
     'Put it on a JLR server, connect JLR logins, move to a shared database.'),
    ('3', 'Load JLR rates', VIOLET,
     'Materials, machine rates, labour, energy, country factors. This governs the whole sequence and it is ours to do.'),
    ('4', 'Check against real parts', GREEN,
     'Take 30 to 50 parts already purchased and compare. This is what establishes how accurate it is.'),
    ('5', 'Trial with one team', GREEN,
     'Real parts, run beside CAPEE. Where the two differ, establish why before widening.'),
]
y = Inches(2.0)
for n, t_, c_, b_ in plan2:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.86), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.86), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.18), d=Inches(0.5), fill=c_)
    text(s, Inches(1.45), y + Inches(0.14), Inches(11.2), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(1.45), y + Inches(0.47), Inches(11.2), Inches(0.32), [[(b_, 10, BODY, False)]])
    y += Inches(0.96)
callout(s, Inches(0.45), Inches(6.85), Inches(6.1), Inches(0.5), PANEL2, INDIGO,
        'Step 3 governs the sequence', 'Everything after it waits on our rate data.')
callout(s, Inches(6.78), Inches(6.85), Inches(6.1), Inches(0.5), GREENBG, GREEN,
        'Step 4 is the one that settles the question',
        'It replaces an opinion about accuracy with a measurement.')
notes(s, "Five steps. Step three is the one that governs the sequence, and it is our work rather "
         "than software work, so I would rather flag it now than have it surprise us later. Step "
         "four is the most valuable step in either option. Thirty to fifty parts we have actually "
         "bought, compared against what the tool says. That is what lets me come back and tell you "
         "how accurate it is instead of saying we think it is about right.")

# ────────────────────────────────────────────────────── 14 · SIDE BY SIDE ───
s = header('The two options side by side', 'Comparison')
rows = [
    ('Which system does the costing', ('CAPEE, unchanged', GREEN, True), ('CostVision, beside CAPEE', AMBER, False)),
    ('Does the engineer learn a new tool', ('No, same CAPEE screens', GREEN, True), ('Yes', AMBER, False)),
    ('Amount of software work', ('Substantial', AMBER, False), ('Small', GREEN, True)),
    ('Amount of JLR data work', ('Moderate', GREEN, False), ('Substantial', AMBER, False)),
    ('Do we get the costing engine', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Do we get design-for-cost findings', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Does it establish how accurate it is', ('No', RED, True), ('Yes, step 4', GREEN, True)),
    ('Can it be stopped part way', ('Difficult, it sits inside CAPEE', RED, True), ('Yes', GREEN, True)),
    ('Blocked by anything unknown', ('Yes, how CAPEE is built', RED, True), ('No', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.0), Inches(12.43),
      ['', 'OPTION 1 · feed CAPEE', 'OPTION 2 · CostVision on JLR rates'], rows,
      [Inches(4.43), Inches(4.0), Inches(4.0)], row_h=Inches(0.44), size=10.8)
callout(s, Inches(0.45), Inches(6.35), Inches(12.43), Inches(0.85), PANEL2, INDIGO,
        'The bottom three rows carry the decision',
        'Option 2 establishes accuracy, can be halted, and waits on nothing. Option 1 does none of '
        'those three, which is the reason for the order recommended on the next slide.')
footer(s, 'No durations are shown. Nothing in either option has been sized by JLR.')
notes(s, "The top half is fairly even and each option wins some rows. The bottom three are the ones "
         "that carry the decision. Option 2 establishes how accurate the tool is; Option 1 cannot, "
         "because CAPEE does the costing. Option 2 can be halted; Option 1 is wired into CAPEE and "
         "is much harder to unwind. And Option 2 waits on nothing, whereas Option 1 is blocked "
         "until IT tell us how CAPEE is built.")

# ─────────────────────────────────────────────────── 15 · RECOMMENDATION ────
s = header('Recommendation', 'Recommendation')
callout(s, Inches(0.45), Inches(1.85), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'Option 2 first, then Option 1',
        'Option 2 is the smaller change, it can be stopped at any point, and it answers the question '
        'Option 1 depends on: whether the tool produces the right number on JLR parts.')
q = [('FIRST', 'Run Option 2', GREEN, 'coins',
      'Install it, load our rates, compare against 30 to 50 parts already purchased.',
      'Result: a measured accuracy figure.'),
     ('THEN', 'Decide', INDIGO, 'eye',
      'Review the accuracy result and IT\'s answer on how CAPEE is built.',
      'Result: a decision made on evidence.'),
     ('THEN', 'Run Option 1', VIOLET, 'cog',
      'Feed CAPEE automatically, beginning with one part type.',
      'Result: scaling something already proven.')]
x = Inches(0.45)
for tag, t_, c_, ic, b_, out in q:
    box(s, x, Inches(3.1), Inches(4.07), Inches(2.45), fill=PANEL, line=LINE, round_=True)
    box(s, x, Inches(3.1), Inches(4.07), Inches(0.06), fill=c_)
    icon_badge(s, ic, x + Inches(0.28), Inches(3.3), d=Inches(0.6), fill=c_)
    text(s, x + Inches(1.05), Inches(3.33), Inches(2.8), Inches(0.24), [[(tag, 10, MUTED, True)]])
    text(s, x + Inches(1.05), Inches(3.57), Inches(2.8), Inches(0.3), [[(t_, 15, DARK, True)]])
    text(s, x + Inches(0.28), Inches(4.1), Inches(3.5), Inches(0.85),
         [[(b_, 10.5, BODY, False)]], line_spacing=1.15)
    text(s, x + Inches(0.28), Inches(5.0), Inches(3.5), Inches(0.42),
         [[(out, 10.5, c_, True)]], line_spacing=1.15)
    x += Inches(4.18)
callout(s, Inches(0.45), Inches(5.75), Inches(12.43), Inches(1.05), AMBERBG, AMBER,
        'If only one option can be funded',
        'Option 2. It is the smaller change, it can be reversed, it waits on no other answer, and it '
        'brings the costing engine and the design-for-cost findings with it. Option 1 removes '
        'typing from a process we already have. Option 2 adds a capability we do not.')
notes(s, "My recommendation is to treat these as a sequence rather than a choice. First Option 2. "
         "Install it, load our rates, and compare it against parts we have already bought. Then we "
         "decide, with an accuracy figure in hand and IT's answer on CAPEE. Then Option 1, scaling "
         "something we know works. If only one can be funded, take Option 2. Option 1 takes typing "
         "out of a process we already have. Option 2 gives us something we do not have at all.")

# ──────────────────────────────────────────── 16 · RISKS AND OPEN ITEMS ─────
s = header('Risks and open items', 'Risks')
rows = [
    (('Accuracy is unknown', DARK, True), 'Both',
     'Never compared against a price JLR has paid. Resolved by step 4 of Option 2.',
     ('High', RED, True)),
    (('Old costings cannot be reproduced', DARK, True), 'Option 2',
     'No rate history and no saved costings. Has to be built before the tool is used for anything audited.',
     ('High', RED, True)),
    (('How CAPEE is built is unknown', DARK, True), 'Option 1',
     'Blocks the choice of connection route. One answer from IT resolves it.',
     ('High', AMBER, True)),
    (('Built-in numbers are estimates', DARK, True), 'Both',
     'Working starting points rather than JLR plant measurements. Replaced as real data is loaded.',
     ('Medium', AMBER, True)),
    (('Server type', DARK, True), 'Option 1',
     'The measuring engine needs a standard Linux server. Straightforward to confirm, awkward if missed late.',
     ('Medium', AMBER, True)),
    (('Drawing text reaches an AI service', DARK, True), 'Both',
     'Short extracts only, and it can be routed through a JLR service. The CAD file itself stays on the server.',
     ('Medium', AMBER, True)),
    (('Tool is still changing', DARK, True), 'Both',
     'Three faults were found and fixed in August. Development is ongoing, so a version has to be fixed for any trial.',
     ('Medium', AMBER, True)),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['Item', 'Applies to', 'Detail and what resolves it', 'Rating'], rows,
      [Inches(3.3), Inches(1.15), Inches(6.68), Inches(1.3)], row_h=Inches(0.62), size=9.8)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'Two of the three high items are resolved by the same step',
        'Running Option 2 establishes accuracy and forces the rate history and saved costings to be '
        'built. That is a further argument for taking it first.')
notes(s, "Seven items. The top two are the ones that would stop me putting this in front of a "
         "supplier today. We have never compared it against a price we paid, and it cannot "
         "reproduce a costing from three months ago. Both are fixed by doing Option 2. The third is "
         "waiting on IT. The last row is worth saying plainly: the tool is still being worked on, "
         "we found and fixed three faults last month, so for any trial we fix a version and stay on "
         "it. And note the CAD file itself never leaves the server.")

# ────────────────────────────────────────────── 17 · WHAT WE NEED FROM JLR ──
s = header('What is needed to start', 'Next steps')
asks = [
    ('1', 'clip', '30 to 50 parts with the price actually paid', RED,
     'Part, description, annual volume, where it was made, and the price paid. Existing purchase '
     'records are sufficient. This is what establishes accuracy, and both options depend on it.'),
    ('2', 'coins', 'JLR rate data', VIOLET,
     'Material prices, machine rates per hour, labour by grade, electricity and gas. This governs '
     'the Option 2 sequence, so it is worth starting regardless of which option is chosen.'),
    ('3', 'cog', 'How CAPEE is built', INDIGO,
     'What it is written in, whether it can call another service on the network, and what kind of '
     'server it runs on. Three questions to IT. Unblocks Option 1.'),
    ('4', 'shield', 'A decision on the drawing-reading step', GREEN,
     'Either switch off the AI reading and keep the measuring, or route it through a JLR-approved '
     'service. The data-flow document is ready for either.'),
]
y = Inches(1.95)
for n, ic, t_, c_, b_ in asks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(1.2), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(1.2), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.15), d=Inches(0.5), fill=c_)
    icon_badge(s, ic, Inches(1.42), y + Inches(0.15), d=Inches(0.5), fill=c_)
    text(s, Inches(2.15), y + Inches(0.17), Inches(10.5), Inches(0.3), [[(t_, 13, DARK, True)]])
    text(s, Inches(2.15), y + Inches(0.55), Inches(10.4), Inches(0.55),
         [[(b_, 10.3, BODY, False)]], line_spacing=1.15)
    y += Inches(1.3)
callout(s, Inches(0.45), Inches(6.58), Inches(12.43), Inches(0.55), GREENBG, GREEN,
        'The first one carries the most weight',
        'The other three can run in parallel. Without real prices to compare against, neither option '
        'can be signed off as accurate.')
notes(s, "Four things. The first is the one I will keep coming back to: thirty to fifty parts where "
         "we know what we paid. Purchase records are fine. Without it I cannot tell anyone how "
         "accurate this is, and that is the first question we will be asked. The second is our own "
         "rates, worth starting whichever option is chosen. The third is three questions to IT. The "
         "fourth is a security decision, and either answer works.")

# ─────────────────────────────────────── 18 · ORDER AND DEPENDENCIES ────────
s = header('Order of work and what blocks what', 'Sequence')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('No dates. Nothing here has been sized by JLR. What is fixed is the order, because some '
        'steps cannot begin until others finish.', 11.5, BODY, False)]])
chain = [
    ('JLR supplies rate data',            VIOLET, 'coins'),
    ('CostVision installed and loaded',   VIOLET, 'cog'),
    ('Compared against parts purchased',  GREEN,  'eye'),
    ('Accuracy established',              GREEN,  'check'),
    ('Decision on Option 1',              INDIGO, 'person'),
    ('Feed CAPEE automatically',          INDIGO, 'calc'),
]
bw = Inches(1.87); gp = Inches(0.19); x = Inches(0.45)
for i, (t_, c_, ic) in enumerate(chain):
    box(s, x, Inches(2.35), bw, Inches(1.35), fill=PANEL, line=LINE, round_=True)
    box(s, x, Inches(2.35), bw, Inches(0.06), fill=c_)
    icon_badge(s, ic, x + (bw - Inches(0.5)) / 2, Inches(2.52), d=Inches(0.5), fill=c_)
    text(s, x + Inches(0.1), Inches(3.12), bw - Inches(0.2), Inches(0.5),
         [[(t_, 9.8, DARK, True)]], align=PP_ALIGN.CENTER, line_spacing=1.1)
    if i < len(chain) - 1:
        arrow_between(s, x + bw + Inches(0.02), Inches(2.92), gp - Inches(0.04))
    x += bw + gp
box(s, Inches(0.45), Inches(4.0), Inches(12.43), Inches(0.9), fill=AMBERBG, round_=True)
box(s, Inches(0.45), Inches(4.0), Inches(0.075), Inches(0.9), fill=AMBER)
text(s, Inches(0.72), Inches(4.14), Inches(11.9), Inches(0.26),
     [[('Runs in parallel, blocks nothing above it', 11.5, AMBER, True)]])
text(s, Inches(0.72), Inches(4.44), Inches(11.9), Inches(0.4),
     [[('IT security review  ·  Answer on how CAPEE is built  ·  Standing up the measuring software  '
        '·  Writing out the settings list', 10.5, BODY, False)]])
deps = [('Nothing can be checked for accuracy until JLR rate data is loaded.', RED),
        ('Option 1 should not be committed until accuracy is established.', RED),
        ('Connecting into CAPEE cannot be scoped until IT answer how CAPEE is built.', AMBER),
        ('Rate history and saved costings must exist before the tool is used for anything audited.', AMBER)]
y = Inches(5.15)
for t_, c_ in deps:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.44), fill=PANEL, line=LINE)
    box(s, Inches(0.45), y, Inches(0.06), Inches(0.44), fill=c_)
    text(s, Inches(0.72), y + Inches(0.12), Inches(11.9), Inches(0.24), [[(t_, 10.5, BODY, False)]])
    y += Inches(0.5)
notes(s, "This replaces a timeline, because putting dates up would mean inventing them. What is "
         "real is the order. Rate data has to come before we can check accuracy. Accuracy has to be "
         "established before I would commit to Option 1. The amber strip is the work that can run "
         "alongside and does not block anything: the security review, the answer from IT, standing "
         "up the measuring software, writing out the settings. The four lines at the bottom are the "
         "hard dependencies. The last one is the one to watch, because it decides whether we can "
         "use this for anything that gets audited.")

# ─────────────────────────────────────── 19 · WHERE THE FIGURES COME FROM ───
s = header('Where the figures come from', 'Appendix')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Every count and value in this deck was read from the software in August 2026 and checked '
        'again when these slides were produced.', 11.5, BODY, False)]])
rows = [
    ('19 part types costable in the tool', 'Traced each one from its screen through to the costing'),
    ('The costing gives the same answer every run', 'Ran one part five times, identical to the last decimal'),
    ('No hidden defaults in the costing', 'Every figure has to be supplied; nothing is substituted'),
    ('Measuring engine makes no internet connection', 'Checked every line for outbound calls; there are none'),
    ('Measuring engine repeats exactly', 'Its one sampling step is fixed to a set value'),
    ('CAD files stay on the server', 'Measuring is local; only drawing text reaches an AI service'),
    ('Rates are supplied to the tool, not built in', 'The costing function takes the rate book as an input'),
    ('Line counts on slide 7', 'Counted directly in the source files'),
    ('Settings values on slide 8', 'Read from the software; each is a single defined value'),
    ('Three faults found and fixed in August', 'A wrong-number result, an unrepeatable range, unreadable report text'),
    ('2,022 automatic tests passing', 'Full test run at build time'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43), ['Statement', 'How it was checked'], rows,
      [Inches(5.6), Inches(6.83)], row_h=Inches(0.38), size=10)
callout(s, Inches(0.45), Inches(6.68), Inches(12.43), Inches(0.6), PANEL2, INDIGO,
        'Supporting documents',
        'Security and data-flow review for IT  ·  Technical readiness assessment  ·  Independent '
        'review of the tool including comparison against commercial alternatives.')
notes(s, "Keep this for anyone who wants to know how we know. Every claim was checked against the "
         "software rather than assumed. Two worth pointing at. The costing gives the same answer "
         "every time, which sounds obvious but is not true of every tool. And the fourth row is the "
         "answer to the first question IT security will ask: we checked every line of the measuring "
         "software for internet connections and there are none.")

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

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

3. The running order follows the recommendation. The advice is to do Option 2
   first, so the deck walks Option 2 before Option 1. The option NAMES do not
   move: Option 1 is still "feed CAPEE automatically" and Option 2 is still
   "run CostVision on JLR rates", so they match anything already discussed.
   Cross-references to slide numbers are therefore load-bearing - if a slide is
   added or moved, re-check the references on slides 4, 8 and 19.

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
     [[('Two ways we could use the tool, what each one needs from us, and which one '
        'I would do first', 16, HERO_SUB, False)]])
box(s, Inches(0.6), Inches(3.95), Inches(3.3), Pt(2.5), fill=INDIGO)
for i, (n, t_, sub) in enumerate([
        ('1', 'Feed CAPEE automatically',
         'CAPEE carries on doing the costing. CostVision reads the numbers off the 3D model and '
         'the drawing and puts them in.'),
        ('2', 'Run CostVision on JLR rates',
         'Install CostVision as it is. Take out the rates it comes with and put our own material, '
         'machine, labour and energy costs in.')]):
    y = Inches(4.3) + Inches(0.95) * i
    step_circle(s, n, Inches(0.62), y, d=Inches(0.55), fill=INDIGO)
    text(s, Inches(1.4), y + Inches(0.02), Inches(10.8), Inches(0.3), [[(t_, 15, ON_DARK, True)]])
    text(s, Inches(1.4), y + Inches(0.35), Inches(10.8), Inches(0.32), [[(sub, 11, HERO_SUB, False)]])
text(s, Inches(0.6), Inches(6.5), Inches(11.6), Inches(0.4),
     [[('JLR Cost Engineering  ·  August 2026', 10, HERO_DIM, False)]])
notes(s, "We have built a tool called CostVision. The question today is how we get it working "
         "inside JLR. There are two sensible ways to do it and I will take you through both. I will "
         "also be straight about where the tool is not finished. One thing to say up front: there "
         "are no dates in this deck. Nobody in IT or the business has sized any of this yet, so any "
         "timeline I put up would be made up. What I can show you is what order the work has to "
         "happen in and what has to wait on what.")

# ──────────────────────────────────────────────── 2 · THE TWO OPTIONS ───────
s = header('The two options', 'Summary')
card(s, Inches(0.45), Inches(1.8), Inches(6.1), Inches(2.35), INDIGO,
     'OPTION 1 · Feed CAPEE automatically',
     [('CAPEE stays as it is and still does the costing.',),
      ('Instead of typing thirty boxes, the engineer hands over',),
      ('the 3D model and the drawing and the boxes fill in.',),
      ('',),
      ('Moves about 5,700 lines of measuring and reading code,', DARK, True),
      ('plus the safety checks that go with it.', DARK, True)])
card(s, Inches(6.78), Inches(1.8), Inches(6.1), Inches(2.35), VIOLET,
     'OPTION 2 · Run CostVision on JLR rates',
     [('CostVision goes in as it is. Nothing gets rebuilt.',),
      ('We load our own material prices, machine rates, labour',),
      ('and energy costs over the ones it ships with.',),
      ('',),
      ('The way it calculates does not change. The work is', DARK, True),
      ('gathering our rates and putting it on a JLR server.', DARK, True)])
callout(s, Inches(0.45), Inches(4.35), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'WHAT I WOULD DO · Option 2 first, then Option 1',
        'Option 2 is the smaller job and we can stop it whenever we want. It also tells us '
        'something Option 1 never will: whether the tool gets the right answer on JLR parts. So the '
        'rest of this deck goes through Option 2 first, then Option 1.')
callout(s, Inches(0.45), Inches(5.5), Inches(12.43), Inches(1.35), AMBERBG, AMBER,
        'BEFORE WE DO EITHER',
        'CostVision has never been checked against a price JLR has actually paid. Not one part. '
        'Until we load 30 to 50 real purchases and compare, nobody can say how accurate it is, and '
        'I would not sign either option off as ready for a supplier meeting. That job is ours, not '
        'the software.')
notes(s, "Two options. On the left, CAPEE keeps doing the costing and we feed it the input numbers "
         "automatically. On the right, we put CostVision in as it is and load our own rates. I "
         "would do the second one first. It is smaller, we can stop it if it is not working, and it "
         "tells us whether the tool is actually right on our parts. That is also why the deck goes "
         "through Option 2 first. The amber box I want on the record now. This tool has never been "
         "compared against a price we have paid. Until we do that I cannot tell you how accurate it "
         "is and I would not put it in front of a supplier.")

# ──────────────────────────────────── 3 · WHERE COSTVISION IS TODAY ─────────
s = header('Where CostVision is today', 'Current status')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.32),
     [[('Taken from the software in August 2026. This is what the tool does today.',
        11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.15), Inches(6.1), Inches(3.5), GREEN,
     'WORKING NOW',
     [('19 part types can be costed',),
      ('The costing gives the same answer every run',),
      ('Measures 3D models with no internet connection',),
      ('Reads drawings for tolerances, finish, heat treatment',),
      ('Safety checks on everything read off a drawing',),
      ('PDF and Excel reports; PowerPoint for the negotiation pack',),
      ('An administrator can upload a rate workbook',),
      ('2,022 automatic software tests, all passing',)], fill=GREENBG)
card(s, Inches(6.78), Inches(2.15), Inches(6.1), Inches(3.5), AMBER,
     'NOT THERE YET',
     [('Never compared against a price JLR has paid',),
      ('No history kept when someone changes a rate',),
      ('Finished costings are not saved, so you cannot',),
      ('go back and reproduce an old one',),
      ('No JLR sign-on; it has its own logins today',),
      ('Gear costing works on screen but the automated',),
      ('route cannot reach it',),
      ('Three faults found and fixed in August; we are',),
      ('still working on it',)], fill=AMBERBG)
callout(s, Inches(0.45), Inches(5.85), Inches(12.43), Inches(0.95), PANEL2, INDIGO,
        'Why this is up front',
        'Both options build on the left column and have to sort out the right one. I would rather '
        'you saw the right column now than found it later. Neither option gets to skip it.')
notes(s, "Before we get into the options, here is where the tool honestly is. Left side is working "
         "today and I checked every line of it against the software this month. Nineteen part types "
         "cost properly. The maths repeats. It measures models with no internet connection, which "
         "is the first thing IT security will ask about. Right side is what is not done. The top one "
         "is the big one and I will keep coming back to it. Below that, it does not keep a history "
         "when someone changes a rate and it does not save finished costings. So today you could "
         "not go back and reproduce a costing from three months ago. For anything audited we have "
         "to fix that. And we are still working on it. Three faults last month.")

# ─────────────────────────────────────── 4 · WHAT CHANGES FOR THE ENGINEER ──
s = header('What changes for the engineer', 'Why bother at all')
card(s, Inches(0.45), Inches(1.85), Inches(6.1), Inches(3.45), RED,
     'TODAY · typed in by hand',
     [('Part weight and starting material weight',),
      ('Wall thickness and overall size',),
      ('Counts of holes, pockets and bosses',),
      ('Machine times for each operation',),
      ('Surface area for painting or plating',),
      ('Tolerances, finish, heat treatment',),
      ('',),
      ('Two engineers costing the same part will not type',),
      ('the same numbers. So we get two different answers.', DARK, True)], fill=REDBG)
card(s, Inches(6.78), Inches(1.85), Inches(6.1), Inches(3.45), GREEN,
     'WITH COSTVISION · read off the model',
     [('Hand over the 3D model and the drawing.',),
      ('',),
      ('Measured off the model:', DARK, True),
      ('volume, size, surface area, wall thickness, holes,',),
      ('pockets, bosses, gear teeth.',),
      ('',),
      ('Read off the drawing:', DARK, True),
      ('tolerances, surface finish, heat treatment, coating,',),
      ('masked features.',),
      ('',),
      ('The same part gives the same numbers every time.', GREEN, True)], fill=GREENBG)
callout(s, Inches(0.45), Inches(5.55), Inches(12.43), Inches(1.2), PANEL2, INDIGO,
        'Measuring and reading are different things',
        'The 3D model gets measured by software, much like a CMM measures a part. That is not AI. '
        'The AI only reads the words written on the drawing, and whatever it reads gets checked '
        'against the measured model before it can move a cost. Slide 9 covers those checks.')
notes(s, "This is the case for doing anything at all. Everything on the left is typed in by hand "
         "today. The time it takes matters. The second point matters more. Two of our engineers "
         "costing the same part will not type the same numbers, so we end up with two answers for "
         "one part. On the right is what the tool does instead. The blue box is the bit I want "
         "people to hold on to. Measuring the model is ordinary software doing geometry. The AI "
         "only reads the writing on the drawing, and we check everything it reads.")

# ───────────────────────────────────────────── 5 · OPTION 2 · FULL PICTURE ──
s = header('Option 2: CostVision on JLR rates', 'Option 2')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What an engineer does each time they cost a part', 11.5, MUTED, True)]])
steps2 = [
    ('upload', 'Opens CostVision',      'Signs in with a JLR login',                          VIOLET),
    ('cube',   'Hands over the part',   '3D model if there is one, otherwise fills the form',  VIOLET),
    ('cog',    'Picks the part type',   'Machined, pressed, cast, forged, moulded',            VIOLET),
    ('coins',  'JLR rates go in',       'Our own material, machine, labour and energy costs',  GREEN),
    ('calc',   'Cost comes out',        'Eight cost buckets, every figure traceable',          GREEN),
    ('clip',   'Report is produced',    'PDF or Excel for a supplier meeting',                 GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps2):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps2) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('What order the setup has to happen in', 11.5, MUTED, True)]])
ph2 = ['IT security review', 'Install and connect logins', 'Load JLR rates',
       'Check against real parts', 'Trial with one team']
cw = Inches(2.47)
x = Inches(0.45)
for i, lbl in enumerate(ph2):
    chevron(s, x, Inches(4.58), cw, Inches(0.6), lbl, '', VIOLET if i < 3 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.38), Inches(12.43), Inches(0.6), 'WE DO', INDIGO,
     ['Install on a JLR server', 'Connect JLR sign-on', 'Load the rates we are given',
      'Run the accuracy comparison'])
lane(s, Inches(0.45), Inches(6.02), Inches(12.43), Inches(0.6), 'JLR DOES', VIOLET,
     ['Security sign-off', 'Provide a server', 'Gather the rate data', 'Supply parts with real prices'])
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.6), AMBERBG, AMBER,
        'The software is the easy bit',
        'Gathering our own rate data sets the pace for everything else, and that work sits with us '
        'rather than with the tool.')
notes(s, "Option 2 on one slide. Top row is what an engineer actually does. Sign in with a JLR "
         "login, put in a model or fill the form, pick the part type, and out comes a costed answer "
         "with a report. Underneath is the setup order and who does what. Look at the two bands. "
         "The top one is us and it is fairly straightforward. The bottom one is JLR and the third "
         "box is the real work: gathering our own rates. I want to be clear that the software side "
         "of this is the easy bit. What sets the pace is how quickly we can pull our numbers "
         "together.")

# ───────────────────────────── 6 · WHAT GETS SWAPPED FOR JLR NUMBERS ────────
s = header('What gets swapped for JLR numbers', 'Option 2 · detail')
card(s, Inches(0.45), Inches(1.9), Inches(4.0), Inches(2.7), GREEN,
     'STAYS THE SAME',
     [('All 19 part types',),
      ('The costing maths',),
      ('Reading 3D models and drawings',),
      ('The safety checks',),
      ('PDF and Excel reports',),
      ('Design-for-cost findings',)], fill=GREENBG)
card(s, Inches(4.63), Inches(1.9), Inches(4.0), Inches(2.7), VIOLET,
     'SWAPPED FOR JLR NUMBERS',
     [('Material prices',),
      ('Machine rates per hour',),
      ('Labour rates by grade',),
      ('Electricity and gas prices',),
      ('Overhead and margin policy',),
      ('Rates for the countries we buy from',)])
card(s, Inches(8.81), Inches(1.9), Inches(4.07), Inches(2.7), INDIGO,
     'STILL TO BUILD · none of this exists yet',
     [('JLR single sign-on',),
      ('A shared database',),
      ('AI routed through a JLR service',),
      ('History of every rate change',),
      ('Costings saved and auditable',),
      ('Backups to JLR standard',)])
callout(s, Inches(0.45), Inches(4.8), Inches(12.43), Inches(1.0), PANEL2, INDIGO,
        'Changing the rates is a setup job',
        'The tool was built so the rate book gets handed to it from outside rather than baked in, '
        'and there is already a screen for uploading one. Putting our numbers in does not change '
        'how anything is calculated.')
callout(s, Inches(0.45), Inches(5.95), Inches(12.43), Inches(0.95), AMBERBG, AMBER,
        'Take the third column seriously',
        'None of it exists today. Without the rate history and saved costings you cannot reproduce '
        'a costing from three months ago, and that rules the tool out for anything audited until it '
        'is built.')
notes(s, "Three columns. Left, what stays exactly as it is, and note that is nineteen part types in "
         "the tool itself. Middle, the numbers we swap for ours. Right, what still has to be built, "
         "and I have labelled that honestly because none of it exists today. The blue box is the "
         "reassuring engineering point. The rate book gets handed to the tool from outside rather "
         "than being built in, and there is already a screen for uploading one, so putting our "
         "numbers in is a setup job. The amber box is the one to take seriously. Until the rate "
         "history and saved costings are built you could not reproduce a costing from three months "
         "ago, and that rules it out for anything audited.")

# ────────────────────────────────────────────── 7 · OPTION 2 · SEQUENCE ─────
s = header('Option 2: order of work', 'Option 2 · sequence')
plan2 = [
    ('1', 'IT security review', INDIGO,
     'The data-flow document is already written. IT decide how they want the drawing-reading step handled.'),
    ('2', 'Install and connect', INDIGO,
     'Put it on a JLR server, connect JLR logins, move it onto a shared database.'),
    ('3', 'Load JLR rates', VIOLET,
     'Materials, machine rates, labour, energy, country factors. This one sets the pace and it is ours to do.'),
    ('4', 'Check against real parts', GREEN,
     'Take 30 to 50 parts we have already bought and compare. This is how we find out how accurate it is.'),
    ('5', 'Trial with one team', GREEN,
     'Real parts, run alongside CAPEE. Where the two disagree, work out why before going wider.'),
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
        'Step 3 sets the pace', 'Everything after it waits on our rate data.')
callout(s, Inches(6.78), Inches(6.85), Inches(6.1), Inches(0.5), GREENBG, GREEN,
        'Step 4 answers the accuracy question',
        'We get a measured number instead of a view.')
notes(s, "Five steps. Step three sets the pace, and it is our work rather than software work, so I "
         "would rather flag it now than have it catch us out later. Step four is the most valuable "
         "step in either option. Thirty to fifty parts we have actually bought, compared against "
         "what the tool says. That is what lets me come back and tell you how accurate it is "
         "instead of saying we think it is about right.")

# ─────────────────────────────────────────── 8 · OPTION 1 · FULL PICTURE ────
s = header('Option 1: automatic data into CAPEE', 'Option 1')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens each time an engineer costs a part', 11.5, MUTED, True)]])
steps = [
    ('upload', 'Engineer hands over files', '3D model and drawing, from the CAPEE screen',  INDIGO),
    ('ruler',  'Software measures',         'Size, weight, surface area, holes, pockets',   INDIGO),
    ('clip',   'AI reads the drawing',      'Tolerances, finish, coating, heat treatment',  VIOLET),
    ('shield', 'Safety checks run',         'What the AI read gets compared with the model', GREEN),
    ('person', 'Engineer confirms',         'Only the things a 3D model cannot show',       AMBER),
    ('calc',   'CAPEE costs the part',      'CAPEE gets the numbers and calculates',        GREEN),
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
     ['Tell us how CAPEE is built', 'Provide a server', 'Change CAPEE to take the numbers',
      'Free up a team for the trial'])
callout(s, Inches(0.45), Inches(6.72), Inches(12.43), Inches(0.6), AMBERBG, AMBER,
        'One step we cannot size yet',
        'Connecting into CAPEE depends on how CAPEE is built, and we do not know that yet. Slide 12 '
        'sets out the three ways of doing it.')
notes(s, "Now Option 1, on one slide. Top row is what happens each time somebody costs a part. The "
         "engineer hands over the model and drawing from inside CAPEE. Software measures the model, "
         "the AI reads the drawing, the safety checks compare the two. A few things no model can "
         "show, like heat treatment, the engineer confirms. Then CAPEE gets the numbers and costs "
         "the part exactly as it does now. Underneath is the build order and who does what. I have "
         "deliberately not put weeks against these. Nobody has sized this yet, and the connection "
         "step in particular waits on an answer we do not have.")

# ─────────────────────────────────────────────────────── 9 · SAFETY CHECKS ──
s = header('Safety checks', 'Option 1 · required')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('The AI does not set a price. It does hand over numbers that feed into one, so a bad reading '
        'turns into a bad cost. These four checks are what stop that happening, and they have to '
        'come across with everything else.', 11.5, BODY, False)]])
checks = [
    ('cube', 'The measured model beats the AI', INDIGO,
     'If the AI reads 2 kg off the drawing and the model measures 1.4 kg, we use the measured '
     'figure. The geometry wins.'),
    ('eye', 'Everything read gets cross-checked', INDIGO,
     'Numbers taken off the drawing get compared against the measured model. Where they disagree, '
     'the engineer is told rather than the tool picking one.'),
    ('press', 'Machining time has a ceiling', INDIGO,
     'On a casting or forging, machining is capped at what finishing that part could realistically '
     'take, so a bad estimate cannot run the cost up.'),
    ('person', 'Unknowns get asked, not guessed', VIOLET,
     'Heat treatment, tolerance class and material grade cannot be read off a solid model, so the '
     'engineer is asked. The AI suggestion is labelled as a suggestion and never comes pre-ticked.'),
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
        'We hit this ourselves in August',
        'Our review found a route through the tool with no checks on it. One missing input produced '
        'a cost of "not a number" while the software said it had worked fine. We have fixed it. It '
        'is also why I have put these checks in the scope.')
notes(s, "On a job like this the temptation is to take the measuring and the AI and leave what looks "
         "like plumbing till later. These four checks are what make the rest safe. The first one is "
         "the one to remember. If the AI and the measured model disagree, the model wins. The last "
         "one matters for a different reason. Where the tool cannot know something it asks rather "
         "than guessing, and it never pre-ticks its own answer. The red box is from our own review "
         "last month. We found a route with no checks that gave back a nonsense figure while saying "
         "it had worked. We fixed it, and it is why I am putting the checks in the scope.")

# ───────────────────────────────────────────── 10 · WHAT WE HAND OVER ───────
s = header('What we hand over', 'Option 1 · handover')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Sizes counted straight out of the software. Both languages are in common use and JLR IT '
        'will have people who know them.', 11.5, BODY, False)]])
rows = [
    ('Measuring engine', ('Python', DARK, True), '2,039 lines',
     'Opens the 3D model and measures it. Makes no internet connection.'),
    ('Reading the drawing', ('TypeScript', DARK, True), '2,443 lines',
     'Sends the drawing to the AI and sorts out what comes back.'),
    ('Safety checks', ('TypeScript', DARK, True), '536 lines',
     'The four checks on the previous slide.'),
    ('Questions per part type', ('TypeScript', DARK, True), '7,037 lines',
     'Works out what the engineer gets asked for each kind of part.'),
    ('Design-for-cost findings', ('TypeScript', DARK, True), '1,930 lines',
     'Flags features that are expensive to make and says why.'),
    ('Settings list', ('Plain list', DARK, True), 'one file',
     'Every fixed number pulled together in one place. Next slide.'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['Part', 'Language', 'Size', 'What it does'], rows,
      [Inches(3.3), Inches(1.7), Inches(1.5), Inches(5.93)], row_h=Inches(0.52), size=10.5)
callout(s, Inches(0.45), Inches(5.6), Inches(6.1), Inches(1.15), PANEL2, INDIGO,
        'About the two languages',
        'Python is the normal choice for engineering and measurement work. TypeScript is widely used '
        'for business software. Neither is unusual and neither ties JLR to one supplier.')
callout(s, Inches(6.78), Inches(5.6), Inches(6.1), Inches(1.15), AMBERBG, AMBER,
        'One thing for IT to confirm',
        'The measuring engine needs a normal Linux server, not the cut-down kind used for small '
        'services. It decides where this can go, so worth settling early.')
notes(s, "You asked what would actually get handed over. Six things, and the sizes come straight out "
         "of the software. The measuring engine is Python, which is the normal choice for "
         "measurement work. The rest is TypeScript, common in business software. Neither is odd and "
         "neither ties us to one supplier. The bottom row is the settings list, which is the next "
         "slide. The amber box is the one practical thing worth raising with IT now, because it "
         "decides where this can live.")

# ───────────────────────────────────── 11 · THE FIXED NUMBERS IN THE CODE ───
s = header('The fixed numbers in the code', 'Option 1 · settings')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('These are engineering judgements written into the code. Six real ones, taken from the '
        'software as it stands:', 11.5, BODY, False)]])
rows = [
    ('Smallest face counted as machined', ('400 mm²', DARK, True),
     'Below this we treat it as an edge, not a face to machine'),
    ('Smallest pocket counted', ('80 mm²', DARK, True),
     'Stops small recesses getting costed as pockets'),
    ('Cost of a rejected plated part', ('4.5x a good one', DARK, True),
     'You strip it and plate it again, so a 3% reject rate is nearer 13% on cost'),
    ('Zinc price used for plating', ('USD 3.67 / kg', DARK, True),
     'Market reference, August 2026. Moves monthly and is meant to get updated'),
    ('Shape allowance, pressing', ('1.15', DARK, True),
     'A real pressing has more surface than a flat plate: edges, flanges, bends'),
    ('Shape allowance, casting and forging', ('1.25 / 1.10', DARK, True),
     'Castings carry ribs and bosses; forgings are simpler on the outside'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['What it controls', 'Value', 'Why'], rows,
      [Inches(4.3), Inches(2.3), Inches(5.83)], row_h=Inches(0.5), size=10.5)
callout(s, Inches(0.45), Inches(5.5), Inches(6.1), Inches(1.2), PANEL2, INDIGO,
        'How they get handed over',
        'Pulled out of the code into one list you can read and change without a developer. That '
        'list is a deliverable in its own right and it is a step in the Option 1 sequence.')
callout(s, Inches(6.78), Inches(5.5), Inches(6.1), Inches(1.2), AMBERBG, AMBER,
        'Where these came from',
        'They are our engineering estimates. They are not measurements from a JLR plant. Treat them '
        'as a starting point and expect to replace them as real data comes in.')
notes(s, "Hardcoded values is a phrase that means nothing on its own, so here are six real ones. "
         "Look at the third row. A rejected plated part costs about four and a half times a good "
         "one, because you strip it and start again. That is why a three percent reject rate is "
         "closer to thirteen percent on cost. That is an engineering judgement and exactly the sort "
         "of thing you would challenge in a review, so it should not be buried in code. We pull "
         "every one of them into a single list you can read and change. The amber box is the "
         "caveat. These are our estimates, not measurements from one of our plants.")

# ──────────────────────────────────────── 12 · THREE WAYS TO CONNECT ────────
s = header('Three ways to connect it to CAPEE', 'Option 1 · decision for IT')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('We do not know yet how CAPEE is built. All three routes work. The answer decides which one '
        'we use and how much effort it takes.', 11.5, BODY, False)]])
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
        'What is CAPEE written in. Can it call another service on the network. Can it run on a '
        'normal Linux server.')
footer(s, 'Effort is shown against the other two routes. None of the three has been sized by JLR.')
notes(s, "I cannot give you one answer because nobody has told us how CAPEE is built. Rather than "
         "hold everything up, here are all three routes. All of them work. What changes is how much "
         "effort each takes, and I have shown that against each other rather than in weeks, because "
         "none of this has been sized. If you made me pick blind I would take route B, running it "
         "alongside, because it works whatever CAPEE is and we can improve our side without "
         "disturbing it. The three questions in amber are what I need from IT.")

# ────────────────────────────────────────────── 13 · OPTION 1 · SEQUENCE ────
s = header('Option 1: order of work', 'Option 1 · sequence')
plan1 = [
    ('1', 'Agree the connection', INDIGO,
     'Find out how CAPEE is built, pick one of the three routes, agree exactly which numbers CAPEE expects.'),
    ('2', 'Stand up the measuring software', INDIGO,
     'Install it on a JLR server. Measure 20 real JLR parts and check the results against their drawings.'),
    ('3', 'Hand over the settings list', VIOLET,
     'Pull every fixed number into one list. JLR review it and sign it off before anything gets costed with it.'),
    ('4', 'Move the safety checks across', GREEN,
     'The four checks and the questions the engineer confirms. In the scope from the start.'),
    ('5', 'Connect into CAPEE', INDIGO,
     'Wire it in. Route the drawing reading through a JLR-approved AI service. Cost one real part end to end.'),
    ('6', 'Trial on one part type', GREEN,
     'One team, one part type, 30 parts or more. See how well the measuring actually does.'),
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
        'Machined parts or pressings first. Most of our volume and the shapes we understand best. '
        'Widen it once it holds up.')
notes(s, "Six steps in the order they have to happen. Two worth pulling out. Step three is the "
         "settings list, signed off before anything gets costed with it. Step four is the safety "
         "checks, and I have given them a step of their own so they do not get folded into the "
         "connection work and squeezed. The blue box is useful for planning. Steps one and two can "
         "run at the same time, because standing up the measuring software does not depend on "
         "knowing how CAPEE is built. Only step five does.")

# ────────────────────────────────────────────────────── 14 · SIDE BY SIDE ───
s = header('The two options side by side', 'Comparison')
rows = [
    ('Which system does the costing', ('CAPEE, unchanged', GREEN, True), ('CostVision, beside CAPEE', AMBER, False)),
    ('Does the engineer learn a new tool', ('No, same CAPEE screens', GREEN, True), ('Yes', AMBER, False)),
    ('How much software work', ('A lot', AMBER, False), ('Not much', GREEN, True)),
    ('How much JLR data work', ('Some', GREEN, False), ('A lot', AMBER, False)),
    ('Do we get the costing engine', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Do we get design-for-cost findings', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Does it tell us how accurate it is', ('No', RED, True), ('Yes, step 4', GREEN, True)),
    ('Can we stop it part way', ('Hard, it sits inside CAPEE', RED, True), ('Yes', GREEN, True)),
    ('Is it waiting on an unknown', ('Yes, how CAPEE is built', RED, True), ('No', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.0), Inches(12.43),
      ['', 'OPTION 1 · feed CAPEE', 'OPTION 2 · CostVision on JLR rates'], rows,
      [Inches(4.43), Inches(4.0), Inches(4.0)], row_h=Inches(0.44), size=10.8)
callout(s, Inches(0.45), Inches(6.35), Inches(12.43), Inches(0.85), PANEL2, INDIGO,
        'The last three rows are the important ones',
        'Option 2 tells us how accurate the tool is, we can stop it, and it is not waiting on '
        'anyone. Option 1 does none of those three. That is why I would run Option 2 first.')
footer(s, 'No durations shown. Nothing in either option has been sized by JLR.')
notes(s, "The top half is fairly even and each option wins a few rows. The last three are the ones "
         "that matter. Option 2 tells us how accurate the tool is. Option 1 cannot, because CAPEE "
         "does the costing. Option 2 we can stop. Option 1 is wired into CAPEE and much harder to "
         "unpick. And Option 2 is not waiting on anybody, whereas Option 1 is stuck until IT tell "
         "us how CAPEE is built.")

# ────────────────────────────────────────────────── 15 · WHAT I WOULD DO ────
s = header('What I would do', 'Recommendation')
callout(s, Inches(0.45), Inches(1.85), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'Option 2 first, then Option 1',
        'Option 2 is the smaller job, we can stop it whenever we want, and it answers the question '
        'Option 1 depends on: does the tool get the right number on JLR parts.')
q = [('FIRST', 'Run Option 2', GREEN, 'coins',
      'Install it, load our rates, compare against 30 to 50 parts we have already bought.',
      'What we get: a real accuracy figure.'),
     ('THEN', 'Decide', INDIGO, 'eye',
      'Look at the accuracy result and IT\'s answer on how CAPEE is built.',
      'What we get: a decision based on evidence.'),
     ('THEN', 'Run Option 1', VIOLET, 'cog',
      'Feed CAPEE automatically, starting with one part type.',
      'What we get: more of something that already works.')]
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
        'If we can only fund one',
        'Option 2. It is the smaller job, we can reverse it, it is not waiting on anyone, and it '
        'brings the costing engine and the design-for-cost findings with it. Option 1 mainly saves '
        'the engineer typing. Option 2 gives us something we do not have at all.')
notes(s, "I would treat these as a sequence rather than a straight choice. First Option 2. Install "
         "it, load our rates, compare it against parts we have already bought. Then we decide, with "
         "an accuracy figure in hand and IT's answer on CAPEE. Then Option 1, scaling up something "
         "we know works. If we can only fund one, take Option 2. Option 1 saves typing on a process "
         "we already have. Option 2 gives us something we do not have at all.")

# ──────────────────────────────────────────── 16 · RISKS AND OPEN ITEMS ─────
s = header('Risks and open items', 'Risks')
rows = [
    (('We do not know how accurate it is', DARK, True), 'Both',
     'Never compared against a price JLR has paid. Step 4 of Option 2 sorts this.',
     ('High', RED, True)),
    (('Old costings cannot be reproduced', DARK, True), 'Option 2',
     'No rate history and no saved costings. Has to be built before we use it for anything audited.',
     ('High', RED, True)),
    (('We do not know how CAPEE is built', DARK, True), 'Option 1',
     'Holds up the choice of connection route. One answer from IT sorts it.',
     ('High', AMBER, True)),
    (('The built-in numbers are estimates', DARK, True), 'Both',
     'Starting points rather than JLR plant measurements. They get replaced as real data comes in.',
     ('Medium', AMBER, True)),
    (('Server type', DARK, True), 'Option 1',
     'The measuring engine needs a normal Linux server. Easy to confirm now, awkward if we miss it.',
     ('Medium', AMBER, True)),
    (('Drawing text goes to an AI service', DARK, True), 'Both',
     'Short extracts only, and it can go through a JLR service. The CAD file itself stays on the server.',
     ('Medium', AMBER, True)),
    (('The tool is still changing', DARK, True), 'Both',
     'Three faults found and fixed in August. Work is ongoing, so we pin a version for any trial.',
     ('Medium', AMBER, True)),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['Item', 'Applies to', 'Detail and what sorts it', 'Rating'], rows,
      [Inches(3.3), Inches(1.15), Inches(6.68), Inches(1.3)], row_h=Inches(0.62), size=9.8)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'One step deals with two of the three high items',
        'Running Option 2 tells us how accurate the tool is and forces the rate history and saved '
        'costings to get built. Another reason to do it first.')
notes(s, "Seven items. The top two are what would stop me putting this in front of a supplier "
         "today. We have never compared it against a price we paid, and it cannot reproduce a "
         "costing from three months ago. Doing Option 2 deals with both. The third one is waiting on "
         "IT. The last row I want to say plainly. The tool is still being worked on, we found and "
         "fixed three faults last month, so for any trial we pin a version and stay on it. And note "
         "the CAD file itself never leaves the server.")

# ────────────────────────────────────────────── 17 · WHAT WE NEED TO START ──
s = header('What we need to get going', 'Next steps')
asks = [
    ('1', 'clip', '30 to 50 parts with the price we actually paid', RED,
     'Part, description, annual volume, where it was made, and the price paid. Existing purchase '
     'records will do. This is how we find out how accurate it is, and both options need it.'),
    ('2', 'coins', 'JLR rate data', VIOLET,
     'Material prices, machine rates per hour, labour by grade, electricity and gas. This sets the '
     'pace for Option 2, so it is worth starting whichever option we pick.'),
    ('3', 'cog', 'How CAPEE is built', INDIGO,
     'What it is written in, whether it can call another service on the network, and what kind of '
     'server it runs on. Three questions to IT. Unblocks Option 1.'),
    ('4', 'shield', 'A decision on the drawing-reading step', GREEN,
     'Either switch off the AI reading and keep the measuring, or run it through a JLR-approved '
     'service. The data-flow document covers both.'),
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
        'The first one matters most',
        'The other three can run alongside it. Without real prices to compare against, we cannot '
        'sign either option off as accurate.')
notes(s, "Four things. The first is the one I will keep coming back to. Thirty to fifty parts where "
         "we know what we paid. Purchase records are fine. Without it I cannot tell anyone how "
         "accurate this is, and that is the first question we will get asked. The second is our own "
         "rates, worth starting whichever option we pick. The third is three questions to IT. The "
         "fourth is a security decision, and either answer works for us.")

# ─────────────────────────────────────── 18 · WHAT COMES BEFORE WHAT ────────
s = header('What has to happen before what', 'Sequence')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('No dates. None of this has been sized by JLR. What is fixed is the order, because some '
        'steps cannot start until others finish.', 11.5, BODY, False)]])
chain = [
    ('JLR supplies rate data',            VIOLET, 'coins'),
    ('CostVision installed and loaded',   VIOLET, 'cog'),
    ('Compared against parts we bought',  GREEN,  'eye'),
    ('We know how accurate it is',        GREEN,  'check'),
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
     [[('Can run alongside, holds nothing up', 11.5, AMBER, True)]])
text(s, Inches(0.72), Inches(4.44), Inches(11.9), Inches(0.4),
     [[('IT security review  ·  Answer on how CAPEE is built  ·  Standing up the measuring software  '
        '·  Writing out the settings list', 10.5, BODY, False)]])
deps = [('We cannot check accuracy until JLR rate data is loaded.', RED),
        ('I would not commit to Option 1 until we know how accurate it is.', RED),
        ('We cannot scope the CAPEE connection until IT say how CAPEE is built.', AMBER),
        ('Rate history and saved costings have to exist before we use it for anything audited.', AMBER)]
y = Inches(5.15)
for t_, c_ in deps:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.44), fill=PANEL, line=LINE)
    box(s, Inches(0.45), y, Inches(0.06), Inches(0.44), fill=c_)
    text(s, Inches(0.72), y + Inches(0.12), Inches(11.9), Inches(0.24), [[(t_, 10.5, BODY, False)]])
    y += Inches(0.5)
notes(s, "This is instead of a timeline, because putting dates up would mean making them up. What is "
         "real is the order. Rate data has to come before we can check accuracy. We have to know how "
         "accurate it is before I would commit to Option 1. The amber strip is work that can run "
         "alongside and holds nothing up: the security review, the answer from IT, standing up the "
         "measuring software, writing out the settings. The four lines at the bottom are the hard "
         "ones. The last one is the one to watch, because it decides whether we can use this for "
         "anything that gets audited.")

# ─────────────────────────────────────── 19 · WHERE THE NUMBERS COME FROM ───
s = header('Where the numbers come from', 'Appendix')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Every count and value in this deck was read off the software in August 2026 and checked '
        'again when these slides were built.', 11.5, BODY, False)]])
rows = [
    ('19 part types can be costed', 'Traced each one from its screen through to the costing'),
    ('The costing gives the same answer every run', 'Ran one part five times, identical to the last decimal'),
    ('No hidden defaults in the costing', 'Every figure has to be supplied; nothing gets substituted'),
    ('Measuring engine makes no internet connection', 'Checked every line for outbound calls; there are none'),
    ('Measuring engine repeats exactly', 'Its one sampling step is fixed to a set value'),
    ('CAD files stay on the server', 'Measuring happens locally; only drawing text goes to an AI service'),
    ('Rates are given to the tool, not built in', 'The costing function takes the rate book as an input'),
    ('Sizes on slide 10', 'Counted directly in the source files'),
    ('Settings values on slide 11', 'Read off the software; each is a single defined value'),
    ('Three faults found and fixed in August', 'A wrong-number result, a range that would not repeat, unreadable report text'),
    ('2,022 automatic tests passing', 'Full test run at build time'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43), ['Statement', 'How we checked it'], rows,
      [Inches(5.6), Inches(6.83)], row_h=Inches(0.38), size=10)
callout(s, Inches(0.45), Inches(6.68), Inches(12.43), Inches(0.6), PANEL2, INDIGO,
        'Supporting documents',
        'Security and data-flow review for IT  ·  Technical readiness assessment  ·  Independent '
        'review of the tool including a comparison against commercial alternatives.')
notes(s, "Keep this for anyone who wants to know how we know. Every claim was checked against the "
         "software rather than assumed. Two worth pointing at. The costing gives the same answer "
         "every time, which sounds obvious but is not true of every tool. And the fourth row is the "
         "answer to the first question IT security will ask. We checked every line of the measuring "
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

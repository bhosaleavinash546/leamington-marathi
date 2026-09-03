#!/usr/bin/env python3
"""
CostVision and CAPEE — the business case in four slides, for senior management.

Four slides, in the order they are spoken:

  1  What it costs us to cost a part today, with the arithmetic exposed and
     JLR's four numbers left blank.
  2  Option 1 — fill CAPEE's cost input automatically from the 3D model.
  3  Option 2 — cost a whole basket in one unattended run.
  4  The two side by side, and the decision we are asking for.

RULES THIS FILE FOLLOWS.

1. NO AI IN OPTION 1. AI is not approved at JLR today, so Option 1 reads the
   3D model only. Drawing reading needs a language model and is out of scope
   here — the tool's default setting is already "rules only, no AI call", and
   that is the setting Option 1 describes. Nothing on slide 2 may depend on a
   model. This is the constraint that shapes the whole option, and it makes it
   safer, not weaker: with no model in the loop, the class of risk "the model
   said something wrong" does not exist.

2. NO INVENTED SAVING. Every benefit figure is left as an empty box for JLR to
   fill, with the arithmetic printed next to it. We have never timed an
   engineer costing a part in CAPEE and we have never compared a CostVision
   cost against a price JLR paid. An estimate presented as a measurement is the
   one thing that would sink this in front of senior management.

3. NO DURATIONS. Nothing has been sized by JLR, so no weeks, months or
   quarters appear.

4. ONLY WHAT IS IN THE SOFTWARE. Every count and timing was read off the
   codebase or measured in September 2026 and re-checked at build time:
   12 to 69 input boxes by part type; 165 costing rules across the twelve part
   types that have them, 149 writing into a named field; 0.9 to 3.1 seconds to
   measure a part; 40 parts in 31 seconds on two workers; the same part costing
   identically on five consecutive runs; 328 materials, 178 machines, 42 labour
   rates and 20 regions in the rate library; 2,079 tests across 156 files.

Regenerate:  python3 build_capee_business_case_pptx.py
Output:      CostVision-CAPEE-Business-Case.pptx
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


def chip(slide, x, y, w, h, label, formula, accent):
    """A named formula. The label says what it is, the line under it says how
    it is worked out — so the room can check the arithmetic rather than take
    a number on trust."""
    box(slide, x, y, w, h, fill=PANEL, line=LINE, round_=True)
    box(slide, x, y, w, Inches(0.06), fill=accent)
    text(slide, x + Inches(0.18), y + Inches(0.16), w - Inches(0.36), Inches(0.26),
         [[(label, 11, DARK, True)]])
    text(slide, x + Inches(0.18), y + Inches(0.45), w - Inches(0.36), Inches(0.3),
         [[(formula, 14, accent, True)]])


BLANKBOX = '________'

# ══════════════════ 1 · WHAT IT COSTS US TO COST A PART TODAY ═══════════════
s = header('What it costs us to cost a part today', 'The problem')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.3),
     [[('Every part costed in CAPEE is typed in by hand. Here is that job, and here is what it is '
        'worth in your own numbers.', 11.5, BODY, False)]])

card(s, Inches(0.45), Inches(2.02), Inches(6.1), Inches(1.95), RED,
     'HOW A PART GETS COSTED TODAY',
     [('The engineer opens the 3D model, reads the drawing,',),
      ('and types the numbers into CAPEE by hand.',),
      ('',),
      ('Boxes to fill, depending on the part type:', DARK, True),
      ('machined 12 · casting 30 · moulding 39 · pressing 69',)], fill=REDBG)
card(s, Inches(6.78), Inches(2.02), Inches(6.1), Inches(1.95), AMBER,
     'WHY IT MATTERS TWICE',
     [('It takes time, and the time scales with the number of',),
      ('parts we want costed. That is the obvious cost.',),
      ('',),
      ('Two engineers costing the same part do not type the', DARK, True),
      ('same numbers, so one part gets two answers.', DARK, True)], fill=AMBERBG)

text(s, Inches(0.45), Inches(4.05), Inches(12.4), Inches(0.3),
     [[('What it is worth: five numbers, four of them yours', 11.5, MUTED, True)]])
rows = [
    (('A', DARK, True), 'Minutes to cost one part in CAPEE today', (BLANKBOX, INDIGO, True),
     'Time a handful of parts. One part type is enough to start'),
    (('B', DARK, True), 'Of those, the minutes spent finding and typing the input values',
     (BLANKBOX, INDIGO, True), 'The same exercise, timed separately'),
    (('C', DARK, True), 'Parts costed through CAPEE in a year', (BLANKBOX, INDIGO, True),
     "CAPEE's own records"),
    (('D', DARK, True), 'Parts in a typical basket that never get costed individually',
     (BLANKBOX, INDIGO, True), 'Programme data. This is what Option 2 goes after'),
    (('E', DARK, True), 'Share of the input boxes the engine fills on its own',
     (BLANKBOX, GREEN, True), 'We measure this in the pilot, per part type'),
]
table(s, Inches(0.45), Inches(4.35), Inches(12.43),
      ['', 'What it is', "JLR's number", 'Where it comes from'], rows,
      [Inches(0.5), Inches(5.3), Inches(1.7), Inches(4.93)], row_h=Inches(0.31), size=10.2)

cw, cg = Inches(4.06), Inches(0.125)
chip(s, Inches(0.45), Inches(6.35), cw, Inches(0.82), 'Hours spent typing today', 'B × C ÷ 60', RED)
chip(s, Inches(0.45) + cw + cg, Inches(6.35), cw, Inches(0.82), 'Hours freed a year', 'B × E × C ÷ 60', GREEN)
chip(s, Inches(0.45) + 2 * (cw + cg), Inches(6.35), cw, Inches(0.82), 'Extra parts that time would cost', 'B × E × C ÷ A', INDIGO)
notes(s, "I want to start with the job itself, because everything after this is about removing part "
         "of it. Today an engineer opens the model, reads the drawing and types the numbers into "
         "CAPEE. How many numbers depends on the part: twelve boxes for a machined part, "
         "sixty-nine for a pressing. Those counts come straight off the CAPEE input forms. The "
         "amber box on the right is the point I would not want to lose. The time is real, but the "
         "second problem is worse. Two of our engineers costing the same part will not type the "
         "same numbers, so we end up with two answers for one part and no way to say which one we "
         "would defend to a supplier. Now the table. I have deliberately not put a saving on this "
         "slide, because we have never timed this job and I am not going to stand here and invent "
         "a number. Four of these five are yours and you can get them quickly. The fifth, E, is "
         "what the pilot measures. Put your numbers in and the three boxes at the bottom fill "
         "themselves in. That is a business case you own rather than one I have handed you.")

# ═══════════════ 2 · OPTION 1 · FILL CAPEE FROM THE 3D MODEL ════════════════
s = header('Option 1: fill CAPEE from the 3D model', 'Option 1 · the pilot')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.3),
     [[('CAPEE keeps doing the costing. The engineer stops typing the input and starts checking it. '
        'No AI anywhere in this option.', 11.5, BODY, False)]])
steps = [
    ('upload', 'Attach the 3D model', 'STEP, IGES or STL, from the CAPEE screen', INDIGO),
    ('ruler', 'The engine measures it', 'On a JLR server, with no internet connection', INDIGO),
    ('cog', 'Rules fill the values', 'Fixed rules. Same part, same numbers, always', INDIGO),
    ('person', 'The engineer confirms', 'Only what a solid model cannot show', AMBER),
    ('calc', 'CAPEE costs the part', 'Exactly as it does now. It just gets the numbers', GREEN),
]
sw, gap = Inches(2.334), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps):
    flow_step(s, x, Inches(2.0), sw, Inches(1.9), ic, t_, sub, c_)
    if i < len(steps) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.84), gap - Inches(0.04))
    x += sw + gap

card(s, Inches(0.45), Inches(4.04), Inches(6.1), Inches(2.05), GREEN,
     'WHAT THE 3D MODEL GIVES, WITH NOTHING TYPED',
     [('Volume, weight, bounding box, surface area.',),
      ('Wall thickness, holes, pockets, bosses, bend count,',),
      ('gear teeth, draft, machined face count.',),
      ('',),
      ('165 costing rules turn those measurements into', DARK, True),
      ('form values. 149 write into a named box.', DARK, True)], fill=GREENBG)
card(s, Inches(6.78), Inches(4.04), Inches(6.1), Inches(2.05), AMBER,
     'WHAT THE ENGINEER STILL SUPPLIES',
     [('Material family. A solid model cannot tell steel from',),
      ('aluminium, and the same shape differs threefold in',),
      ('weight. It can come from the part master instead.',),
      ('',),
      ('Tolerance class, finish, heat treatment, coating.', DARK, True),
      ('The tool asks. It never guesses and never pre-ticks.', DARK, True)], fill=AMBERBG)
callout(s, Inches(0.45), Inches(6.19), Inches(12.43), Inches(1.06), PANEL2, INDIGO,
        'What it is built from, and what it does not use',
        'The measuring engine is Python with the OpenCASCADE geometry kernel, the open engineering '
        'kernel behind FreeCAD and many commercial CAD tools. The rules that turn measurements into '
        'form values are ordinary code, not a model. There is no AI in this option and no outbound '
        'connection: the 3D file is read on a JLR server and never leaves it.')
notes(s, "This is the low-hanging fruit and it is deliberately narrow. CAPEE does not move. It "
         "still does the costing, on the same screens, with the same maths. What changes is where "
         "the input comes from. The engineer attaches the 3D model from inside CAPEE. The engine "
         "measures it on a JLR server with no internet connection, and the rules turn those "
         "measurements into the values the form wants. Then the engineer confirms the handful of "
         "things a solid model genuinely cannot show, and CAPEE costs the part. I want to be "
         "explicit about the second sentence in the blue box, because I know AI is not approved "
         "here. There is no AI in this option. Reading a drawing would need a language model and I "
         "have taken it out entirely. The tool already has a setting that runs on rules alone with "
         "no model call, and that is the setting this describes. That is not a compromise, it is "
         "safer: with no model in the loop, the whole class of risk where the model says something "
         "wrong does not exist. What is left is measurement, arithmetic, and questions. The amber "
         "card is the honest limit. Without the drawing, tolerance class, finish and heat treatment "
         "still get answered by a person, and so does the material family unless it comes off the "
         "part master. The tool asks for them rather than guessing.")

# ════════════════ 3 · OPTION 2 · COST THE WHOLE BASKET ══════════════════════
s = header('Option 2: cost the whole basket in one run', 'Option 2 · the capability')
text(s, Inches(0.45), Inches(1.68), Inches(12.4), Inches(0.3),
     [[('This is not a bigger version of Option 1. It is something we cannot do at all today.',
        11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.02), Inches(6.1), Inches(1.8), RED,
     'WHAT WE DO TODAY',
     [('We cost the parts we have engineer-hours for.',),
      ('',),
      ('The rest of a basket gets sampled, estimated by',),
      ('analogy, or taken from the last supplier quote.',)], fill=REDBG)
card(s, Inches(6.78), Inches(2.02), Inches(6.1), Inches(1.8), GREEN,
     'WHAT OPTION 2 DOES',
     [('A list of parts and their 3D models goes in. Every',),
      ('one is measured, costed and reported in one run.',),
      ('',),
      ('An engineer answers only what the geometry cannot',),
      ('decide — once, applied to every part it affects.',)], fill=GREENBG)

text(s, Inches(0.45), Inches(3.93), Inches(12.4), Inches(0.3),
     [[('How long a run takes. The 40-part row was measured on real production parts; the rest '
        'carries that rate forward', 11.5, MUTED, True)]])
rows = [
    ('One part, warm', ('0.9 to 3.1 seconds', DARK, True),
     'Five real production parts, 0.6 MB to 3.0 MB. Bigger file, longer'),
    ('40 parts', ('31 seconds', DARK, True),
     'Measured. Two workers running in parallel, nothing reused from cache'),
    ('500 parts', ('about 6.5 minutes', DARK, True),
     'That measured rate carried forward. Roughly half of it on four workers'),
]
table(s, Inches(0.45), Inches(4.23), Inches(12.43),
      ['A run of', 'Measured', 'Basis'], rows,
      [Inches(3.0), Inches(2.6), Inches(6.83)], row_h=Inches(0.32), size=10.2)
lane(s, Inches(0.45), Inches(5.68), Inches(12.43), Inches(0.62), 'MUST BE BUILT', RED,
     ['A history of rate changes', 'An automatic record of every costing',
      'Region, volume and gear on the run', 'The safety checks on that route', 'The run itself'])
callout(s, Inches(0.45), Inches(6.4), Inches(12.43), Inches(0.9), PANEL2, INDIGO,
        'The costing itself needs no AI here either',
        'The engine and the rules are the same ones Option 1 uses, and they make no model call. An '
        'agent is one way to marshal a run; taking the part type and material family off the part '
        'master is the other, and that is the route to take while AI is not approved. What does '
        'not exist today is the run itself, and the five things above.')
notes(s, "Option two is a different thing and I want to be clear it is not just Option one at "
         "scale. Today we cost the parts we have hours for and the rest of a basket gets sampled or "
         "estimated by analogy. Option two costs every part in the basket from its own geometry, in "
         "one run, with an engineer answering only what the geometry cannot decide. The middle "
         "table is measured, not estimated: forty real production parts took thirty-one seconds on "
         "two workers this month, and the five-hundred-part row is that same rate carried forward. "
         "The point of it is that the machine time is not the constraint. Getting the part list, "
         "the CAD files and our own rate data together is the work. The red strip is the honest "
         "part and I would rather you hear it from me. Five things do not exist today. None of them "
         "is large. All of them are needed before a bulk run means anything three months later. And "
         "the blue box answers the question I expect: no, this does not need AI either. The costing "
         "engine and the rules make no model call. An agent is one way to drive a run, but taking "
         "the part type and the material off the part master does the same job, and that is the "
         "route I would take while AI is not approved.")

# ══════════════════ 4 · THE TWO TOGETHER, AND THE ASK ═══════════════════════
s = header('The two options, and what we are asking for', 'The decision')
rows = [
    ('What it changes', ('The engineer stops typing the input', DARK, True),
     ('We can cost a whole basket, not a sample', DARK, True)),
    ('Where the costing happens', ('CAPEE, same as now', GREEN, True),
     ('CostVision engine, beside CAPEE', AMBER, False)),
    ('Does it use AI', ('No. 3D model and fixed rules only', GREEN, True),
     ('Not for the costing. The run can be driven off the part master', GREEN, True)),
    ('Does anyone learn a new tool', ('No, the same CAPEE screens', GREEN, True),
     ('A reviewer does, for the results', AMBER, False)),
    ('What it needs from JLR', ('A Linux server, the CAPEE connection, parts with prices we paid', AMBER, False),
     ('Our own rate book, plus the five items built', RED, False)),
    ('Can we stop part way', ('Yes, CAPEE costs the same way either way', GREEN, True),
     ('Yes, it runs alongside', GREEN, True)),
    ('Is it audit-ready today', ('Yes, CAPEE keeps the record', GREEN, True),
     ('No, until rate history and a costing record exist', RED, True)),
]
table(s, Inches(0.45), Inches(1.78), Inches(12.43),
      ['', 'OPTION 1 · input into CAPEE', 'OPTION 2 · bulk costing'], rows,
      [Inches(3.5), Inches(4.46), Inches(4.47)], row_h=Inches(0.46), size=10.2)
callout(s, Inches(0.45), Inches(5.46), Inches(12.43), Inches(0.86), GREENBG, GREEN,
        'What we are asking for today: approve Option 1 as a pilot',
        'One part type, 30 to 50 parts we have already bought, inside CAPEE, costing our own '
        'engineering time. It gives us the two numbers nobody can state today: how close the tool '
        'gets to a price we actually paid, and how much of the input it fills on its own. '
        'Option 2 needs those numbers first.')
callout(s, Inches(0.45), Inches(6.42), Inches(12.43), Inches(0.86), AMBERBG, AMBER,
        'The one thing to know before you decide',
        'CostVision has never been checked against a price JLR has actually paid. Not one part. '
        'That is exactly what the pilot settles, and until it is done nobody can tell you how '
        'accurate this is.')
notes(s, "Both options on one page. Read down the left column first. Option one changes where "
         "CAPEE's input comes from, uses no AI, needs nobody to learn anything, and can be stopped "
         "at any point because CAPEE costs the same way whether we do this or not. Option two is a "
         "bigger step and it buys us something different: every part in a basket costed from its "
         "own geometry instead of a sample scaled up. The row I would point at is the third one, "
         "because it is the question I expect first in this room. Option one uses no AI at all. "
         "Option two does not need it for the costing either. The green strip is the ask, and it is "
         "deliberately small. One part type, thirty to fifty parts we have already bought, our own "
         "time. What we get out of it is the two numbers nobody in this company can state today: "
         "how close the tool gets to a price we actually paid, and how much of the input it fills "
         "on its own. Those are the numbers that make the Option two conversation possible, and "
         "without them it is not a conversation worth having. The amber box is the reason I am "
         "asking for a pilot rather than a rollout. We have never checked this against a real "
         "price. I would rather say that now than be asked it later.")


# ───────────────────────────────────────────────────────────────────────────
OUT = 'CostVision-CAPEE-Business-Case.pptx'
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


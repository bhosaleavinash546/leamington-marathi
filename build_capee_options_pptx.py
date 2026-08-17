#!/usr/bin/env python3
"""
CostVision -> JLR / CAPEE — two ways to do it. A decision deck for the JLR Cost
Engineering Director and his management team.

WRITTEN FOR A NON-IT AUDIENCE. Plain English on the slides AND in the speaker
notes. A technical word only appears where there is no honest simpler
substitute, and it is explained in ordinary language the first time it is used.
The speaker notes are written as the presenter would actually say them.

House style is inherited from build_blueprint_pptx.py so this deck sits in the
same pack as CostVision-Implementation-Blueprint.pptx.

Every figure is traced to the codebase. Where something could not be derived it
is marked as an assumption, not stated as fact.

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
        text(slide, x + Inches(0.22), y + Inches(0.48), w - Inches(0.4), h - Inches(0.6),
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
    text(slide, x + Inches(0.24), y + Inches(0.44), w - Inches(0.45), h - Inches(0.55),
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
    text(slide, x + Inches(0.08), y + Inches(1.28), w - Inches(0.16), h - Inches(1.34),
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

# ══════════════════════════════════════════════════════════════ 1 · TITLE ════
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=NAVY)
box(s, 0, 0, Inches(0.09), H, fill=INDIGO)
logo(s, x=Inches(0.55), y=Inches(0.5), scale=1.15, on_dark=True)
text(s, Inches(0.6), Inches(2.05), Inches(11.6), Inches(1.4),
     [[('Two ways to bring CostVision into JLR', 38, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.6), Inches(3.05), Inches(11.4), Inches(0.6),
     [[('What each one involves, how long it takes, what it costs us in effort, '
        'and which one we recommend', 16, HERO_SUB, False)]])
box(s, Inches(0.6), Inches(3.95), Inches(3.3), Pt(2.5), fill=INDIGO)
for i, (n, t_, sub) in enumerate([
        ('1', 'Feed CAPEE automatically',
         'CAPEE stays as it is. We give it the numbers, read from the CAD model and the drawing.'),
        ('2', 'Use CostVision on our own rates',
         'Install CostVision as it is. Put JLR material, machine, labour and energy rates into it.')]):
    y = Inches(4.3) + Inches(0.95) * i
    step_circle(s, n, Inches(0.62), y, d=Inches(0.55), fill=INDIGO)
    text(s, Inches(1.4), y + Inches(0.02), Inches(10.8), Inches(0.3), [[(t_, 15, ON_DARK, True)]])
    text(s, Inches(1.4), y + Inches(0.35), Inches(10.8), Inches(0.3), [[(sub, 11, HERO_SUB, False)]])
text(s, Inches(0.6), Inches(6.5), Inches(11.6), Inches(0.4),
     [[('Prepared for the JLR Cost Engineering team  ·  August 2026', 10, HERO_DIM, False)]])
notes(s, "Good morning. We have been building a tool called CostVision for about four months. "
         "The question in front of us is simple: how do we get the benefit of it into JLR. There "
         "are two sensible ways to do that. I am going to walk through both, tell you honestly "
         "what each one involves, and give you my recommendation at the end. I will keep the "
         "technical language to a minimum — where I do have to use a term, I will explain it.")

# ═════════════════════════════════════════════════════ 2 · DECISION SUMMARY ══
s = header('The decision, in one slide', 'Summary')
card(s, Inches(0.45), Inches(1.8), Inches(6.1), Inches(2.5), INDIGO,
     'OPTION 1 — Feed CAPEE automatically',
     [('CAPEE stays exactly as it is and still does the costing.',),
      ('Instead of typing thirty boxes, the engineer drops in the',),
      ('3D model and the drawing, and the numbers appear.',),
      ('',),
      ('Roughly 5 months of work.', DARK, True),
      ('Most of the effort is ours, plus JLR IT.', DARK, True)])
card(s, Inches(6.78), Inches(1.8), Inches(6.1), Inches(2.5), VIOLET,
     'OPTION 2 — Use CostVision on our rates',
     [('Install CostVision as it is. Nothing is rebuilt.',),
      ('We load JLR material prices, machine rates, labour and',),
      ('energy costs in place of the ones it ships with.',),
      ('',),
      ('Roughly 2 to 3 months.', DARK, True),
      ('Most of the effort is JLR collecting the rate data.', DARK, True)])
callout(s, Inches(0.45), Inches(4.5), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'OUR RECOMMENDATION — do Option 2 first, then Option 1',
        'These are not really a choice between two things. Option 2 is quicker, we can stop it at '
        'any time if we do not like it, and it tells us whether the tool actually gets the right '
        'answer on JLR parts. Option 1 needs that answer before it is worth doing.')
callout(s, Inches(0.45), Inches(5.68), Inches(12.43), Inches(1.15), AMBERBG, AMBER,
        'ONE THING TO BE CLEAR ABOUT, WHICHEVER WE CHOOSE',
        'We have not yet checked the tool\'s answers against real JLR prices. Not once. Until we '
        'take 30 to 50 parts we have actually bought and compare them, we cannot tell anyone how '
        'accurate it is. That is a job for us, not for the software, and it is the single most '
        'valuable thing we could do next.')
notes(s, "If you only remember one slide, make it this one. Two options. Option 1 takes about five "
         "months and keeps CAPEE as our costing system. Option 2 takes two to three months and puts "
         "CostVision alongside it running on our numbers. My recommendation is that these are not "
         "either-or — do the quick one first, because it answers the question the slow one depends "
         "on. And the amber box: I want to say this before anyone else does. We have never checked "
         "this tool against a real price we have paid. Until we do, I cannot tell you how accurate "
         "it is, and I am not going to pretend otherwise.")

# ══════════════════════════════════════════════ 3 · WHAT CHANGES FOR A USER ══
s = header('What changes for the person doing the costing', 'The problem')
card(s, Inches(0.45), Inches(1.85), Inches(6.1), Inches(3.5), RED,
     'TODAY — everything is typed in by hand',
     [('Part weight, and the weight of the material we start with',),
      ('Wall thickness, overall size',),
      ('How many holes, pockets, bosses',),
      ('How long each machine takes',),
      ('Surface area for painting or plating',),
      ('Tolerances, finish, heat treatment',),
      ('',),
      ('It is slow, and two engineers looking at the same part',),
      ('will not type the same numbers.', DARK, True)], fill=REDBG)
card(s, Inches(6.78), Inches(1.85), Inches(6.1), Inches(3.5), GREEN,
     'WITH COSTVISION — read straight off the model',
     [('Drop in the 3D model and the drawing.',),
      ('',),
      ('MEASURED from the 3D model:', DARK, True),
      ('volume, size, surface area, wall thickness, holes,',),
      ('pockets, bosses, gear teeth.',),
      ('',),
      ('READ from the drawing:', DARK, True),
      ('tolerances, surface finish, heat treatment, coating,',),
      ('how many features are masked off.',),
      ('',),
      ('Same part, same numbers, every single time.', GREEN, True)], fill=GREENBG)
callout(s, Inches(0.45), Inches(5.6), Inches(12.43), Inches(1.15), PANEL2, INDIGO,
        'The important difference — measuring is not guessing',
        'The 3D model is MEASURED by software, the same way a CMM measures a part. That is not the '
        'AI guessing. The AI is only used to read the words on the drawing, and everything it reads '
        'is checked against the measured model before it can affect a cost. Slide 6 explains those '
        'checks, and why they have to come with us.')
notes(s, "This is the case for doing anything at all. Today every one of those numbers on the left "
         "is typed in by hand. It is slow, but the bigger problem is the second point — two of our "
         "engineers costing the same part will not enter the same numbers, so we get two different "
         "answers for the same part. On the right is what the tool does instead. And the blue box "
         "matters: the 3D model is measured, not guessed. Software measures it exactly like a CMM "
         "would. The AI only reads the writing on the drawing, and we check everything it reads.")

# ════════════════════════════════ 4 · OPTION 1 — END TO END SUMMARY (KEY) ═══
s = header('Option 1 — how it works, start to finish', 'Option 1 · full picture')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens every time an engineer costs a part', 11.5, MUTED, True)]])
steps = [
    ('upload',  'Engineer uploads',   '3D model and drawing, from the CAPEE screen',  INDIGO),
    ('ruler',   'Software measures',  'Size, weight, surface area, holes, pockets',    INDIGO),
    ('clip',    'AI reads drawing',   'Tolerances, finish, coating, heat treatment',   VIOLET),
    ('shield',  'Safety checks run',  'Anything the AI read is checked against the model', GREEN),
    ('person',  'Engineer confirms',  'Only the few things a model cannot show',       AMBER),
    ('calc',    'CAPEE costs it',     'CAPEE receives the numbers and does the maths', GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('How we build it — about 5 months', 11.5, MUTED, True)]])
ph = [('Weeks 1-2', 'Agree the connection'), ('Weeks 3-6', 'Stand up measuring'),
      ('Weeks 7-8', 'Hand over settings'), ('Weeks 9-11', 'Add safety checks'),
      ('Weeks 12-16', 'Connect into CAPEE'), ('Weeks 17-19', 'Trial with one team')]
cw = Inches(2.05)
x = Inches(0.45)
for i, (wk, lbl) in enumerate(ph):
    chevron(s, x, Inches(4.58), cw, Inches(0.72), wk, lbl.replace('\n', ' '),
            INDIGO if i < 5 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.5), Inches(12.43), Inches(0.62), 'WE DO', INDIGO,
     ['Package the measuring software', 'Write out every setting', 'Port the safety checks',
      'Support the CAPEE connection'])
lane(s, Inches(0.45), Inches(6.16), Inches(12.43), Inches(0.62), 'JLR DOES', VIOLET,
     ['Tell us how CAPEE is built', 'Provide a server to run it on', 'Change CAPEE to accept the numbers',
      'Give us one team for the trial'])
callout(s, Inches(0.45), Inches(6.86), Inches(12.43), Inches(0.5), AMBERBG, AMBER,
        'We cannot fix the timing yet',
        'Until JLR tells us what CAPEE is built with, weeks 12 to 16 could be shorter or longer. '
        'Slide 9 shows the three ways of connecting and what each would cost us.')
notes(s, "This is the whole of Option 1 on one slide, so let me walk the top row first. The "
         "engineer uploads the model and the drawing from inside CAPEE — same screen they use now. "
         "Software measures the model. The AI reads the drawing. The safety checks then compare "
         "what the AI read against what was measured, and anything that disagrees gets flagged "
         "rather than quietly used. There are a few things no 3D model can tell you — heat "
         "treatment, tolerance class — so the engineer confirms those. Then CAPEE gets the numbers "
         "and does the costing exactly as it does today. Underneath is how we build it, roughly "
         "five months, and who does what. The honest bit is the amber strip: I cannot firm up "
         "weeks twelve to sixteen until IT tell us how CAPEE is put together.")

# ══════════════════════════════════════════ 5 · HOW NUMBERS COME OUT OF CAD ══
s = header('How the numbers come out of the 3D model', 'Option 1 · detail')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Two different jobs, done by two different things. This distinction is the whole basis of '
        'trusting the output.', 11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.25), Inches(6.1), Inches(2.9), INDIGO,
     'MEASURED — by software, not AI',
     [('Volume and weight',),
      ('Overall size and wall thickness',),
      ('Total surface area, for paint and plating',),
      ('Every hole, pocket and boss, with its size',),
      ('Flat faces that need machining',),
      ('Gear teeth, module, face width',),
      ('',),
      ('Exact and repeatable. Run it a hundred times,', DARK, True),
      ('you get the same answer a hundred times.', DARK, True)])
card(s, Inches(6.78), Inches(2.25), Inches(6.1), Inches(2.9), VIOLET,
     'READ — by AI, from the drawing',
     [('Tolerances and GD&T callouts',),
      ('Surface finish requirements',),
      ('Coating or plating specification',),
      ('Heat treatment notes',),
      ('Salt spray hours',),
      ('Which features are masked off',),
      ('',),
      ('Every one of these is then checked, and the', DARK, True),
      ('engineer confirms anything that matters.', DARK, True)])
callout(s, Inches(0.45), Inches(5.35), Inches(12.43), Inches(1.0), GREENBG, GREEN,
        'The CAD file never leaves JLR',
        'The measuring software runs on a JLR server and does not connect to the internet at all — '
        'we checked this line by line. Only short pieces of text from the drawing go to the AI, and '
        'that can be routed through JLR\'s own approved AI service. The 3D model itself stays inside '
        'the building.')
notes(s, "I want to separate two things that get lumped together as AI. On the left is measuring — "
         "that is ordinary software doing geometry, the same maths a CMM uses. It is exact and it "
         "repeats. On the right is reading the drawing, which is the AI, because reading a drawing "
         "note is a language job. Everything on the right gets checked before it can move a cost. "
         "And the green box is the one IT security will ask about: the CAD file never leaves JLR. "
         "The measuring software has no internet connection at all — we verified that in the code. "
         "Only a few lines of drawing text go to the AI, and that can go through JLR's own service.")

# ══════════════════════════════════════════════════════ 6 · SAFETY CHECKS ════
s = header('The safety checks must come too', 'Option 1 · non-negotiable')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('The AI never sets a price. But it does supply numbers that go INTO a price — so a wrong '
        'number becomes a wrong cost, confidently. These four checks stop that.', 11.5, BODY, False)]])
checks = [
    ('cube', 'The model wins over the AI', INDIGO,
     'If the AI says the part weighs 2 kg and the model measures 1.4 kg, the measured figure is used. '
     'Always. The AI does not get to overrule the geometry.'),
    ('eye', 'Cross-check everything read', INDIGO,
     'Numbers read off the drawing are compared against the measured model. Anything that disagrees '
     'is reported to the engineer, not quietly resolved.'),
    ('press', 'Sensible limits on machining', INDIGO,
     'On a casting or forging, machining time is capped at what finishing that part could actually '
     'take, so a bad estimate cannot inflate the cost.'),
    ('person', 'Ask, do not guess', VIOLET,
     'Things no 3D model can show — heat treatment, tolerance class, material grade — are put to the '
     'engineer as a question. The AI\'s suggestion is labelled as a suggestion and never pre-ticked.'),
]
y = Inches(2.3)
for ic, t_, c_, b_ in checks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.95), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.95), fill=c_)
    icon_badge(s, ic, Inches(0.72), y + Inches(0.17), d=Inches(0.6), fill=c_)
    text(s, Inches(1.55), y + Inches(0.15), Inches(11.1), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(1.55), y + Inches(0.46), Inches(11.1), Inches(0.42),
         [[(b_, 10.2, BODY, False)]], line_spacing=1.12)
    y += Inches(1.06)
callout(s, Inches(0.45), Inches(6.6), Inches(12.43), Inches(0.72), REDBG, RED,
        'Why I am making a point of this',
        'When we audited our own tool in August we found a part of it with no safety checks. One '
        'missing input produced a cost of "not a number" — and the software still reported success. '
        'We fixed it. The lesson is that the checks are not the boring part to leave until last; '
        'they are where the risk actually is.')
notes(s, "The instinct on a project like this is to take the clever bit — the measuring and the AI "
         "— and leave what looks like plumbing until later. I want to argue against that. These "
         "four checks are what make the clever bit safe. The first one is the most important: if "
         "the AI and the measured model disagree, the model wins, every time. The last one matters "
         "for a different reason — where the tool genuinely cannot know something, it asks the "
         "engineer rather than guessing, and it never pre-ticks its own suggestion. And the red "
         "box is a real example from our own audit. We found a path with no checks, and it "
         "returned a nonsense cost while reporting that everything was fine. We fixed it, but that "
         "is exactly what happens when the checks are treated as optional.")

# ═══════════════════════════════════════ 7 · WHAT THE DEVELOPERS ACTUALLY GET ═
s = header('What we hand over, and what it is written in', 'Option 1 · the handover')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Nothing here is unusual. Both languages are mainstream, widely used, and JLR IT will '
        'already have people who know them.', 11.5, BODY, False)]])
rows = [
    ('The measuring engine', ('Python', DARK, True), '2,000 lines',
     'Opens the 3D model and measures it. No internet connection.'),
    ('Reading the drawing', ('TypeScript', DARK, True), '2,400 lines',
     'Sends the drawing to the AI and organises what comes back.'),
    ('Safety checks', ('TypeScript', DARK, True), '540 lines',
     'The four checks on the previous slide.'),
    ('Question rules per part type', ('TypeScript', DARK, True), '7,000 lines',
     'Decides what to ask the engineer for each kind of part.'),
    ('Design-for-cost findings', ('TypeScript', DARK, True), '1,900 lines',
     'Spots expensive features and says why they cost money.'),
    ('The settings list', ('Plain list', DARK, True), 'one file',
     'Every fixed number in one readable place — see the next slide.'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['What it is', 'Language', 'Size', 'What it does'], rows,
      [Inches(3.3), Inches(1.7), Inches(1.5), Inches(5.93)], row_h=Inches(0.52), size=10.5)
callout(s, Inches(0.45), Inches(5.6), Inches(6.1), Inches(1.15), PANEL2, INDIGO,
        'Python and TypeScript — in one line each',
        'Python is the standard language for engineering and measurement work. TypeScript is one of '
        'the most common languages for business software. Neither is exotic and neither locks JLR in.')
callout(s, Inches(6.78), Inches(5.6), Inches(6.1), Inches(1.15), AMBERBG, AMBER,
        'One thing IT must confirm',
        'The measuring engine needs an ordinary Linux server, not the cut-down kind some teams use '
        'for small programs. Worth checking early — it decides where it can be installed.')
notes(s, "You asked what we would actually be handing over, so here it is. Six things. The "
         "measuring engine is written in Python, which is the normal language for engineering and "
         "measurement work. Everything else is TypeScript, which is one of the most common "
         "languages for business software. Neither is unusual — IT will have people who know both, "
         "and we are not locking JLR into anything odd. The last row is the settings list, which "
         "is the next slide and is probably the part you care about most. The amber box is the one "
         "practical constraint: the measuring engine needs a normal Linux server. Worth IT "
         "confirming early because it decides where this can live.")

# ════════════════════════════════════════ 8 · WHAT "HARDCODED VALUES" MEANS ══
s = header('The fixed numbers inside the software', 'Option 1 · the settings list')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('You asked what the "hardcoded" values actually are. They are engineering judgements written '
        'into the software. Real examples:', 11.5, BODY, False)]])
rows = [
    ('Smallest face we count as machined', ('400 mm²', DARK, True),
     'Below this we treat it as an edge, not a face to machine'),
    ('Smallest pocket we count', ('80 mm²', DARK, True),
     'Stops tiny recesses being costed as pockets'),
    ('Cost of a rejected plated part', ('4.5 x a good one', DARK, True),
     'Strip it and re-plate it — a 3% reject is really a 13% cost adder'),
    ('Zinc price for plating', ('USD 3.67 / kg', DARK, True),
     'Market reference, August 2026. Moves monthly — meant to be updated'),
    ('Shape allowance, pressing', ('1.15', DARK, True),
     'Real parts have more surface than a flat plate — edges, flanges, bends'),
    ('Shape allowance, casting / forging', ('1.25 / 1.10', DARK, True),
     'Castings have ribs and bosses; forgings are simpler outside'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['What it controls', 'The value', 'Why it is set that way'], rows,
      [Inches(4.3), Inches(2.3), Inches(5.83)], row_h=Inches(0.5), size=10.5)
callout(s, Inches(0.45), Inches(5.5), Inches(6.1), Inches(1.25), PANEL2, INDIGO,
        'How we hand these over',
        'Not buried in the code. Every one of these is pulled out into a single list JLR can read, '
        'question and change without a developer. That list is a deliverable in its own right and '
        'is in the plan as weeks 7 and 8.')
callout(s, Inches(0.45), Inches(6.85), Inches(12.43), Inches(0.5), AMBERBG, AMBER,
        'And the honest part',
        'These are our engineering estimates. They are not measurements from a JLR plant. They are '
        'a sensible starting point that JLR should replace with its own figures over time.')
callout(s, Inches(6.78), Inches(5.5), Inches(6.1), Inches(1.25), GREENBG, GREEN,
        'Why this matters to a cost engineer',
        'These numbers are exactly the sort of thing you would argue about in a costing review — '
        'and you should be able to. Putting them in one readable list means you can challenge any '
        'of them without needing IT.')
notes(s, "You asked specifically what we mean by hardcoded values, because it is a phrase that "
         "means nothing on its own. This is what they are. Look at the third row — a rejected "
         "plated part costs about four and a half times a good one, because you have to strip it "
         "and do it again. That is why a three percent reject rate is really a thirteen percent "
         "cost adder. That is an engineering judgement, and it is the sort of thing you would "
         "challenge in a review. So we pull every one of these out into a single list you can read "
         "and change without going near a developer. The amber strip is important though — these "
         "are our estimates, not measurements from a JLR plant. They are a starting point.")

# ════════════════════════════════════════════ 9 · THREE WAYS TO CONNECT ══════
s = header('Three ways to connect it to CAPEE', 'Option 1 · a decision for IT')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('We do not yet know how CAPEE is built, so here are all three. The answer changes the '
        'timing, not whether it works.', 11.5, BODY, False)]])
rows = [
    (('A · Put it inside CAPEE', DARK, True), 'If CAPEE is built in JavaScript',
     'Our code drops straight in. Only the measuring engine sits separately.',
     ('3 months', GREEN, True)),
    (('B · Run it alongside', DARK, True), 'If CAPEE is Java, .NET or anything else',
     'It runs as its own small program on a JLR server. CAPEE asks it for numbers over a secure link.',
     ('3.5-4.5 months', AMBER, True)),
    (('C · Pass a file', DARK, True), 'If CAPEE is a desktop or spreadsheet tool',
     'It produces a file that CAPEE imports. Simplest, but somebody presses a button.',
     ('2.5-3 months', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43),
      ['Way of connecting', 'Use this when…', 'What it means in practice', 'Time'], rows,
      [Inches(2.9), Inches(2.9), Inches(5.33), Inches(1.3)], row_h=Inches(0.85), size=10.3)
callout(s, Inches(0.45), Inches(5.3), Inches(6.1), Inches(1.0), PANEL2, INDIGO,
        'If we had to pick blind, pick B',
        'Running it alongside works whatever CAPEE turns out to be, and it lets us improve '
        'CostVision without touching CAPEE each time.')
callout(s, Inches(6.78), Inches(5.3), Inches(6.1), Inches(1.0), AMBERBG, AMBER,
        'What we need to ask IT',
        'What is CAPEE written in? Can it call out to another program on the network? And can it '
        'run on a normal Linux server?')
notes(s, "I cannot give you one answer here yet because nobody has told us how CAPEE is actually "
         "built. So rather than hold the whole thing up, here are all three ways, with the timing "
         "for each. The good news is that all three work — it is a question of how long, not "
         "whether. If you asked me to choose without knowing, I would choose B, running it "
         "alongside, because that works whatever CAPEE is and it means we can improve our side "
         "without disturbing CAPEE every time. The three questions in the amber box are what I "
         "need from IT to firm this up.")

# ════════════════════════════════════════════════ 10 · OPTION 1 STEP PLAN ════
s = header('Option 1 — the plan, step by step', 'Option 1 · plan')
plan1 = [
    ('1', 'Weeks 1-2', 'Agree the connection', INDIGO,
     'Find out how CAPEE is built, pick one of the three ways, agree exactly which numbers CAPEE wants.'),
    ('2', 'Weeks 3-6', 'Stand up the measuring software', INDIGO,
     'Install it on a JLR server. Measure 20 real JLR parts and check the answers against the drawings.'),
    ('3', 'Weeks 7-8', 'Hand over the settings list', VIOLET,
     'Pull every fixed number out into one readable list. JLR reviews it and signs it off.'),
    ('4', 'Weeks 9-11', 'Add the safety checks', GREEN,
     'Port the four checks and the questions the engineer confirms. Not optional.'),
    ('5', 'Weeks 12-16', 'Connect into CAPEE', INDIGO,
     'Wire it in. Route drawing reading through JLR\'s approved AI service. Cost a real part end to end.'),
    ('6', 'Weeks 17-19', 'Trial with one team', GREEN,
     'One part type, one team, 30 or more parts. Measure how good the measuring actually is.'),
]
y = Inches(1.95)
for n, wk, t_, c_, b_ in plan1:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.79), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.79), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.15), d=Inches(0.48), fill=c_)
    text(s, Inches(1.42), y + Inches(0.13), Inches(1.5), Inches(0.26), [[(wk, 10, MUTED, True)]])
    text(s, Inches(2.85), y + Inches(0.11), Inches(9.8), Inches(0.28), [[(t_, 12, DARK, True)]])
    text(s, Inches(2.85), y + Inches(0.42), Inches(9.8), Inches(0.3), [[(b_, 9.8, BODY, False)]])
    y += Inches(0.88)
callout(s, Inches(0.45), Inches(6.42), Inches(6.1), Inches(0.82),
        PANEL2, INDIGO, 'About 5 months in total',
        'Assumes one developer from us plus JLR IT support, and that step 1 finishes on time.')
callout(s, Inches(6.78), Inches(6.42), Inches(6.1), Inches(0.82),
        AMBERBG, AMBER, 'Start with one part type, not all eighteen',
        'Machined parts or pressings first — most parts, best understood shapes. Widen once it works.')
notes(s, "Six steps, about five months. Two I want to draw out. Step three is the settings list — "
         "that is the one you asked for, where every fixed number gets written out so you can read "
         "and challenge it. Step four is the safety checks, and I have deliberately given it three "
         "weeks of its own rather than tucking it into the connection work, because it is the bit "
         "that would otherwise get squeezed. And the amber box: we start with one part type. "
         "Machined parts or pressings, because that is where most of our volume is and the shapes "
         "are best understood. We widen once it is proven.")

# ═══════════════════════════════ 11 · OPTION 2 — END TO END SUMMARY (KEY) ════
s = header('Option 2 — how it works, start to finish', 'Option 2 · full picture')
text(s, Inches(0.45), Inches(1.66), Inches(12.4), Inches(0.3),
     [[('What happens every time an engineer costs a part', 11.5, MUTED, True)]])
steps2 = [
    ('upload', 'Engineer opens CostVision', 'Signs in with their normal JLR login',      VIOLET),
    ('cube',   'Uploads or types',          '3D model if there is one, or fills the form', VIOLET),
    ('cog',    'Picks the part type',       'Machined, pressed, cast, forged, moulded…',   VIOLET),
    ('coins',  'JLR rates are applied',     'Our own material, machine, labour, energy costs', GREEN),
    ('calc',   'Cost is calculated',        'Eight cost buckets, every number traceable',  GREEN),
    ('clip',   'Report comes out',          'PDF or Excel, ready for a supplier meeting',  GREEN),
]
sw, gap = Inches(1.87), Inches(0.19)
x = Inches(0.45)
for i, (ic, t_, sub, c_) in enumerate(steps2):
    flow_step(s, x, Inches(2.0), sw, Inches(2.05), ic, t_, sub, c_)
    if i < len(steps2) - 1:
        arrow_between(s, x + sw + Inches(0.02), Inches(2.9), gap - Inches(0.04))
    x += sw + gap
text(s, Inches(0.45), Inches(4.25), Inches(12.4), Inches(0.3),
     [[('How we set it up — about 2 to 3 months', 11.5, MUTED, True)]])
ph2 = [('Weeks 1-2', 'IT security review'), ('Weeks 3-4', 'Install and connect logins'),
       ('Weeks 5-10', 'Load JLR rates'), ('Weeks 11-12', 'Check accuracy'),
       ('Weeks 13-14', 'Trial with one team')]
cw = Inches(2.47)
x = Inches(0.45)
for i, (wk, lbl) in enumerate(ph2):
    chevron(s, x, Inches(4.58), cw, Inches(0.72), wk, lbl, VIOLET if i < 3 else GREEN)
    x += cw - Inches(0.04)
lane(s, Inches(0.45), Inches(5.5), Inches(12.43), Inches(0.62), 'WE DO', INDIGO,
     ['Install it on a JLR server', 'Connect JLR sign-on', 'Load the rates you give us',
      'Run the accuracy check'])
lane(s, Inches(0.45), Inches(6.16), Inches(12.43), Inches(0.62), 'JLR DOES', VIOLET,
     ['Security sign-off', 'Provide a server', 'COLLECT THE RATE DATA — the long pole',
      'Give us 30-50 parts with real prices'])
callout(s, Inches(0.45), Inches(6.86), Inches(12.43), Inches(0.5), AMBERBG, AMBER,
        'The software is the easy part',
        'Weeks 5 to 10 are the whole job. Gathering our material prices, machine rates, labour and '
        'energy costs is what decides whether this takes two months or four.')
notes(s, "Same treatment for Option 2. Top row is what an engineer does — sign in with their normal "
         "JLR login, put in a model or fill the form, pick the part type, and out comes a costed "
         "answer with a report they can take to a supplier. Underneath is the setup, two to three "
         "months. Now look at the two bands. Almost everything on the top band is us and it is "
         "straightforward. The bottom band is JLR, and weeks five to ten is the real work — "
         "collecting our own rates. I want to be honest that the software side of this is easy. "
         "Whether it takes two months or four depends entirely on how quickly we can pull our "
         "own numbers together.")

# ══════════════════════════════════ 12 · OPTION 2 — WHAT CHANGES ═════════════
s = header('What changes, and what does not', 'Option 2 · detail')
card(s, Inches(0.45), Inches(1.9), Inches(4.0), Inches(2.7), GREEN,
     'STAYS THE SAME',
     [('All 18 part types',),
      ('The costing maths',),
      ('Reading 3D models and drawings',),
      ('The safety checks',),
      ('Reports — PDF, Excel, slides',),
      ('Cost-saving suggestions',)], fill=GREENBG)
card(s, Inches(4.63), Inches(1.9), Inches(4.0), Inches(2.7), VIOLET,
     'WE REPLACE WITH JLR DATA',
     [('Material prices',),
      ('Machine rates per hour',),
      ('Labour rates by grade',),
      ('Electricity and gas prices',),
      ('Overhead and margin policy',),
      ('Rates for each country we buy from',)])
card(s, Inches(8.81), Inches(1.9), Inches(4.07), Inches(2.7), INDIGO,
     'WE ADD FOR JLR USE',
     [('JLR single sign-on',),
      ('A proper shared database',),
      ('AI routed through JLR\'s service',),
      ('A record of every rate change',),
      ('Costings saved and auditable',),
      ('Backups to JLR standard',)])
callout(s, Inches(0.45), Inches(4.8), Inches(12.43), Inches(1.0), PANEL2, INDIGO,
        'Swapping the rates is a setting, not a rebuild',
        'The tool was built so the rate book is handed to it, rather than buried inside it. There '
        'is already a screen for uploading a company rate book. Putting JLR numbers in does not '
        'mean changing how it calculates anything.')
callout(s, Inches(0.45), Inches(5.95), Inches(12.43), Inches(0.95), AMBERBG, AMBER,
        'Two things it does not do well enough yet, and we should fix as part of this',
        'It does not keep a history of rate changes, and it does not store finished costings. So '
        'today you could not reproduce a cost you produced three months ago. For JLR use that '
        'needs fixing, and it is in the plan.')
notes(s, "Three columns. Left, everything that stays exactly as it is — all eighteen part types, "
         "the maths, the reports. Middle, the numbers we swap for ours. Right, the things we add "
         "to make it fit JLR properly — our logins, a proper database, our own AI service. The "
         "blue box is the reassuring engineering point: the tool was designed so the rate book is "
         "handed to it from outside, so putting our numbers in is a setting, not a rebuild. The "
         "amber box is me being straight with you — there are two gaps. It does not keep a history "
         "of rate changes and it does not save finished costings, so you could not reproduce a "
         "cost from three months ago. For our use that has to be fixed, and I have put it in the plan.")

# ═════════════════════════════════════════════════ 13 · OPTION 2 STEP PLAN ═══
s = header('Option 2 — the plan, step by step', 'Option 2 · plan')
plan2 = [
    ('1', 'Weeks 1-2', 'IT security review', INDIGO,
     'We already have the document showing where every piece of data goes. IT decides how the AI part is handled.'),
    ('2', 'Weeks 3-4', 'Install and connect', INDIGO,
     'Put it on a JLR server, connect JLR logins, move to a proper shared database.'),
    ('3', 'Weeks 5-10', 'Load JLR rates — the long pole', VIOLET,
     'Materials, machine rates, labour, energy, country factors. This is the real work and it is ours to do.'),
    ('4', 'Weeks 11-12', 'Check it against real parts', GREEN,
     'Take 30 to 50 parts we have actually bought and compare. This is what tells us how accurate it is.'),
    ('5', 'Weeks 13-14', 'Trial with one team', GREEN,
     'Real parts, side by side with CAPEE. Where they differ, understand why.'),
]
y = Inches(2.0)
for n, wk, t_, c_, b_ in plan2:
    box(s, Inches(0.45), y, Inches(12.43), Inches(0.86), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(0.86), fill=c_)
    step_circle(s, n, Inches(0.72), y + Inches(0.18), d=Inches(0.5), fill=c_)
    text(s, Inches(1.45), y + Inches(0.15), Inches(1.5), Inches(0.26), [[(wk, 10, MUTED, True)]])
    text(s, Inches(2.9), y + Inches(0.13), Inches(9.75), Inches(0.28), [[(t_, 12.5, DARK, True)]])
    text(s, Inches(2.9), y + Inches(0.46), Inches(9.75), Inches(0.32), [[(b_, 10, BODY, False)]])
    y += Inches(0.96)
callout(s, Inches(0.45), Inches(6.85), Inches(6.1), Inches(0.5), GREENBG, GREEN,
        'About 2 to 3 months', 'Software work is small. The range is all about rate collection.')
callout(s, Inches(6.78), Inches(6.85), Inches(6.1), Inches(0.5), PANEL2, INDIGO,
        'Step 4 is the one that matters', 'It is what turns "promising" into "we know it is accurate".')
notes(s, "Five steps. Step three is the one that determines the timeline — gathering our own rates. "
         "That is our work, not software work, and I would rather flag it now than have it surprise "
         "us in month two. Step four is the most valuable step in either option. Thirty to fifty "
         "parts we have actually bought, compared against what the tool says. That is what lets me "
         "stand here next quarter and tell you how accurate it is instead of saying we think it is "
         "about right.")

# ═════════════════════════════════════════════════════ 14 · SIDE BY SIDE ═════
s = header('The two options side by side', 'Comparison')
rows = [
    ('How long', ('About 5 months', AMBER, False), ('2 to 3 months', GREEN, True)),
    ('Who does most of the work', ('Us and JLR IT', AMBER, False), ('JLR, gathering rates', AMBER, False)),
    ('Which system does the costing', ('CAPEE, unchanged', GREEN, True), ('CostVision, alongside CAPEE', AMBER, False)),
    ('Does the engineer learn a new tool', ('No — same CAPEE screens', GREEN, True), ('Yes', AMBER, False)),
    ('Do we get the full costing engine', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Do we get the cost-saving suggestions', ('No', AMBER, False), ('Yes', GREEN, True)),
    ('Does it tell us how accurate it is', ('No', RED, True), ('Yes — step 4', GREEN, True)),
    ('Can we stop if we do not like it', ('Hard — it is inside CAPEE', RED, True), ('Easy — switch it off', GREEN, True)),
    ('Does it depend on an unknown', ('Yes — how CAPEE is built', RED, True), ('No', GREEN, True)),
]
table(s, Inches(0.45), Inches(2.0), Inches(12.43),
      ['', 'OPTION 1 — feed CAPEE', 'OPTION 2 — CostVision on our rates'], rows,
      [Inches(4.43), Inches(4.0), Inches(4.0)], row_h=Inches(0.44), size=10.8)
callout(s, Inches(0.45), Inches(6.35), Inches(12.43), Inches(0.85), PANEL2, INDIGO,
        'Look at the bottom three rows together',
        'Option 2 tells us whether the tool is accurate, we can stop it if we want to, and it does '
        'not wait on anything. Option 1 is none of those three. That is the whole argument for '
        'doing them in that order.')
notes(s, "The top half is fairly even — each option wins some rows. I would steer you to the bottom "
         "three. Option 2 tells us how accurate the tool is; Option 1 does not, because CAPEE does "
         "the costing. Option 2 we can switch off on a Friday if it is not working; Option 1 is "
         "wired into CAPEE and much harder to unwind. And Option 2 does not wait on anybody, "
         "whereas Option 1 is stuck until IT tell us how CAPEE is built. Those three rows are the "
         "reason for my recommendation on the next slide.")

# ═══════════════════════════════════════════════════ 15 · RECOMMENDATION ═════
s = header('What we recommend', 'The answer')
callout(s, Inches(0.45), Inches(1.85), Inches(12.43), Inches(1.05), GREENBG, GREEN,
        'Do Option 2 first. Then Option 1, using what we learn from it.',
        'These are not really two competing choices. Option 2 is quicker, we can stop it at any '
        'point, and it answers the one question Option 1 cannot answer for itself — is this tool '
        'actually getting the right number on JLR parts.')
q = [('Q1', 'Do Option 2', GREEN, 'coins',
      'Install it. Load our rates. Check it against 30 to 50 parts we have really bought.',
      'We end up knowing how accurate it is.'),
     ('Q2', 'Decide', INDIGO, 'eye',
      'Look at the accuracy results. Get the answer from IT on how CAPEE is built.',
      'We choose with evidence instead of hope.'),
     ('Q3', 'Do Option 1', VIOLET, 'cog',
      'Feed CAPEE automatically, starting with one part type.',
      'We are scaling something proven, not taking a bet.')]
x = Inches(0.45)
for tag, t_, c_, ic, b_, out in q:
    box(s, x, Inches(3.15), Inches(4.07), Inches(2.5), fill=PANEL, line=LINE, round_=True)
    box(s, x, Inches(3.15), Inches(4.07), Inches(0.06), fill=c_)
    icon_badge(s, ic, x + Inches(0.28), Inches(3.35), d=Inches(0.6), fill=c_)
    text(s, x + Inches(1.05), Inches(3.38), Inches(2.8), Inches(0.24), [[(tag, 10, MUTED, True)]])
    text(s, x + Inches(1.05), Inches(3.62), Inches(2.8), Inches(0.3), [[(t_, 15, DARK, True)]])
    text(s, x + Inches(0.28), Inches(4.15), Inches(3.5), Inches(0.9),
         [[(b_, 10.5, BODY, False)]], line_spacing=1.15)
    text(s, x + Inches(0.28), Inches(5.1), Inches(3.5), Inches(0.45),
         [[(out, 10.5, c_, True)]], line_spacing=1.15)
    x += Inches(4.18)
callout(s, Inches(0.45), Inches(5.85), Inches(12.43), Inches(1.0), AMBERBG, AMBER,
        'If we can only afford one, do Option 2',
        'It is cheaper, faster, we can reverse it, it needs no answer from IT first, and it gives us '
        'the full costing engine and the cost-saving suggestions. Option 1 saves typing. Option 2 '
        'gives us a capability we do not have today.')
notes(s, "My recommendation is that we stop thinking about this as either-or and do them in order. "
         "This quarter, Option 2 — install it, load our rates, and critically, check it against "
         "parts we have actually bought. Next quarter we look at those results with the answer from "
         "IT and decide properly. Quarter after, Option 1, and by then we are scaling something we "
         "know works rather than betting. If the money only stretches to one, do Option 2. Option 1 "
         "saves our engineers typing, which is worth having. Option 2 gives us something we do not "
         "have at all today.")

# ══════════════════════════════════════════════ 16 · WHAT COULD GO WRONG ═════
s = header('What could go wrong — said plainly', 'Being straight')
rows = [
    (('We do not know how accurate it is', DARK, True), 'Both',
     'We have never compared it against a real price we paid. Fixed by step 4 of Option 2.',
     ('Biggest', RED, True)),
    (('It cannot reproduce an old costing', DARK, True), 'Option 2',
     'No history of rate changes, no saved costings. Needs fixing before we rely on it for audit.',
     ('Big', RED, True)),
    (('We do not know how CAPEE is built', DARK, True), 'Option 1',
     'Holds up the timing, not the feasibility. One answer from IT unblocks it.',
     ('Big', AMBER, True)),
    (('The built-in numbers are our estimates', DARK, True), 'Both',
     'Sensible starting points, not JLR plant measurements. Replaced as we load our own data.',
     ('Medium', AMBER, True)),
    (('Server type', DARK, True), 'Option 1',
     'The measuring software needs an ordinary Linux server. Easy to confirm, awkward if missed.',
     ('Medium', AMBER, True)),
    (('Drawing text goes to an AI', DARK, True), 'Both',
     'Only short pieces of text, and it can go via JLR\'s own AI service. The CAD file never leaves.',
     ('Medium', AMBER, True)),
]
table(s, Inches(0.45), Inches(2.0), Inches(12.43),
      ['What', 'Affects', 'What it means and what we do about it', 'How serious'], rows,
      [Inches(3.3), Inches(1.15), Inches(6.68), Inches(1.3)], row_h=Inches(0.68), size=10)
callout(s, Inches(0.45), Inches(6.35), Inches(12.43), Inches(0.85), PANEL2, INDIGO,
        'Why I am showing you this rather than hiding it',
        'A costing tool earns trust by being honest about what it does not know. Every one of these '
        'is fixable, and the top two are both fixed by doing Option 2 first.')
notes(s, "I would rather you hear these from me than find them later. The top one is the big one — "
         "we have never checked this against a real price we paid, so I genuinely cannot tell you "
         "today how accurate it is. The second is that it cannot currently reproduce a costing from "
         "three months ago, which matters if we ever want to defend a number in an audit. Both of "
         "those get fixed by doing Option 2. The rest are manageable. And notice the last row — the "
         "CAD file never leaves JLR, only a few lines of drawing text, and even that can go through "
         "our own AI service.")

# ═══════════════════════════════════════════ 17 · WHAT WE NEED FROM JLR ══════
s = header('What we need to get going', 'Next steps')
asks = [
    ('1', 'clip', '30 to 50 parts with the price we actually paid', RED,
     'Part, what it is, how many a year, where it was made, and the real price. Old purchase records '
     'are fine. This is the most valuable thing on the list and it unlocks both options.'),
    ('2', 'coins', 'Our own rates', VIOLET,
     'Material prices, machine rates per hour, labour by grade, electricity and gas. This is the '
     'long pole on Option 2 and worth starting immediately.'),
    ('3', 'cog', 'How CAPEE is built', INDIGO,
     'What it is written in, whether it can call another program on the network, and what kind of '
     'server it runs on. Three questions to IT. Unblocks Option 1.'),
    ('4', 'shield', 'A decision on the AI part', GREEN,
     'Either turn the AI reading off entirely and keep the measuring, or route it through JLR\'s own '
     'approved AI service. IT security decides — we have the paperwork ready either way.'),
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
callout(s, Inches(0.45), Inches(7.2) - Inches(0.62), Inches(12.43), Inches(0.55), GREENBG, GREEN,
        'The one to push on is number 1',
        'Everything else can run in parallel. Without real prices to compare against, neither option '
        'can be signed off as accurate — and that is the question we will be asked.')
notes(s, "Four asks. Number one is the one I will keep coming back to — thirty to fifty parts where "
         "we know what we actually paid. Old purchase records are fine. Without that, I cannot tell "
         "anyone how accurate this is, and that is the first question we will get. Number two is our "
         "own rates, which is the long pole so worth starting now. Number three is three questions "
         "to IT about CAPEE. Number four is a security decision — we can either turn the AI reading "
         "off completely and keep all the measuring, or route it through JLR's own approved service. "
         "Either works, and we have the paperwork ready for both.")

# ══════════════════════════════════════════════════════ 18 · TIMELINE ════════
s = header('Both options on one timeline', 'Timeline')
text(s, Inches(0.45), Inches(1.75), Inches(12.4), Inches(0.3),
     [[('If we do them in the order we recommend', 11.5, MUTED, True)]])
box(s, Inches(0.45), Inches(2.25), Inches(12.43), Inches(0.34), fill=NAVY)
for i, q in enumerate(['QUARTER 1', 'QUARTER 2', 'QUARTER 3', 'QUARTER 4']):
    text(s, Inches(0.45) + Inches(3.1) * i + Inches(0.15), Inches(2.32), Inches(2.9), Inches(0.24),
         [[(q, 10, ON_DARK, True)]])
bars = [('Option 2 — install, load rates, check accuracy', VIOLET, 0.0, 2.0, Inches(2.75)),
        ('Trial with one team', GREEN, 1.75, 1.0, Inches(3.3)),
        ('Decide, using the accuracy results', INDIGO, 2.6, 0.8, Inches(3.85)),
        ('Option 1 — feed CAPEE, one part type', INDIGO, 3.2, 2.2, Inches(4.4)),
        ('Widen to more part types', GREEN, 5.2, 1.6, Inches(4.95))]
UNIT = Inches(1.55)
for label, c_, start, dur, yy in bars:
    x0 = Inches(0.45) + UNIT * start
    wgt = UNIT * dur
    b = box(s, x0, yy, wgt, Inches(0.42), fill=c_, round_=True, radius=0.2)
    tf = b.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.12); tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    r = p.add_run(); r.text = label
    r.font.size = Pt(9.5); r.font.bold = True; r.font.color.rgb = ON_DARK; r.font.name = 'Calibri'
for i in range(1, 4):
    box(s, Inches(0.45) + Inches(3.1) * i, Inches(2.59), Pt(1), Inches(2.9), fill=LINE)
callout(s, Inches(0.45), Inches(5.65), Inches(6.1), Inches(1.05), GREENBG, GREEN,
        'First real value: about month 3',
        'A working tool on JLR rates, and for the first time a proper answer on how accurate it is.')
callout(s, Inches(6.78), Inches(5.65), Inches(6.1), Inches(1.05), PANEL2, INDIGO,
        'Automatic input into CAPEE: about month 9',
        'Later than doing Option 1 on its own — but starting from proof rather than hope, and with '
        'the settings already reviewed.')
notes(s, "Both options on one line. Option 2 runs through the first quarter and a bit, we trial it, "
         "and by about month three we have a working tool on our own rates and a real answer on "
         "accuracy. We then decide, and Option 1 runs through the middle of the year. Yes, that "
         "means automatic input into CAPEE lands around month nine rather than month five. But it "
         "lands on top of something we have proved, with the settings already reviewed and signed "
         "off, instead of us finding out in month five whether any of it was right.")

# ═══════════════════════════════════════════════ 19 · WHERE FIGURES COME FROM ═
s = header('Where these numbers come from', 'Appendix')
text(s, Inches(0.45), Inches(1.7), Inches(12.4), Inches(0.35),
     [[('Everything in this deck was checked against the software itself in August 2026, not '
        'estimated from memory.', 11.5, BODY, False)]])
rows = [
    ('The costing maths gives the same answer every time', 'Ran the same part five times — identical to the last decimal'),
    ('All 18 part types use the same costing engine', 'Traced every one through the software'),
    ('The engine invents nothing when a value is missing', 'It has no hidden defaults — every figure must be supplied'),
    ('The measuring software has no internet connection', 'Checked every line for outbound calls — there are none'),
    ('The measuring software repeats exactly', 'Its one random step is fixed to a set value'),
    ('The CAD file never leaves the server', 'Measuring is local; only drawing text goes to the AI'),
    ('Rates are handed in, not built in', 'The costing function takes the rate book as an input'),
    ('Three faults found and fixed in August', 'A wrong-number result, an unrepeatable range, unreadable report text'),
    ('Automatic checks on the software', '2,022 automatic tests, all passing'),
]
table(s, Inches(0.45), Inches(2.25), Inches(12.43), ['What we say', 'How we checked it'], rows,
      [Inches(5.6), Inches(6.83)], row_h=Inches(0.44), size=10.3)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'Supporting documents, if anyone wants the detail',
        'A security and data-flow review for IT.  A technical readiness report.  A full independent '
        'review of the tool including how it compares with what is on the market.')
notes(s, "Keep this one for anybody who wants to know how we know. Every claim I have made today "
         "was checked against the software itself last month rather than assumed. A couple worth "
         "pointing at: the costing gives the same answer every time, which sounds obvious but is "
         "not true of every tool. And the fourth row — we checked every line of the measuring "
         "software for internet connections and there are none, which is the answer to the first "
         "question IT security will ask. We also found and fixed three faults during that review, "
         "and I have listed them rather than quietly fixing them.")

# ═════════════════════════════════════════════════════════════════════════════
OUT = 'CostVision-CAPEE-Implementation-Options.pptx'
prs.save(OUT)
finalise(OUT)
print(f'{OUT}  —  {len(prs.slides._sldIdLst)} slides')

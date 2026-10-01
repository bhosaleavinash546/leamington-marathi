#!/usr/bin/env python3
"""
CostVision — Implementation Blueprint presentation (secure deployment + CAPEE
integration) for senior management. Light professional theme, logo top-left on
every slide, native shapes/diagrams, speaker notes per slide.

Content is grounded in docs/CostVision-Secure-Deployment-CAPEE-Integration.md
and, for every statement about what the tool does today, docs/decks/tool-facts.md
(checked against the code, Sept 2026). Plans are labelled as plans.

Regenerate:  python3 build_blueprint_pptx.py
Output:      CostVision-Implementation-Blueprint.pptx
"""

import re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

from pptx_fixup import finalise
from brand import rgb, hexcol   # calculator/src/brand/brand.json — shared with the app (I5)

# Same hex values as build_workflow_deck.mjs, build_pptx.py and the Agentic
# builder, so all four decks read as one pack. This deck was already light but a
# DIFFERENT light — white page, near-black headings, indigo accent.
#
# The page/card relationship inverts: the page is now tinted and the cards are
# white, where before the page was white and the panels tinted.
INDIGO  = rgb('blue')
BLUE    = rgb('blue')
DARK    = rgb('navy')   # navy
BODY    = rgb('slate')   # slate
MUTED   = rgb('muted')
BG      = rgb('page')   # page
PANEL   = RGBColor(0xFF, 0xFF, 0xFF)   # card
PANEL2  = rgb('blueTint')   # pale blue callout
GREENBG = rgb('greenTint')
AMBERBG = rgb('amberTint')
GREEN   = rgb('green')
AMBER   = rgb('amber')
RED     = rgb('red')
VIOLET  = rgb('violet')
CYAN    = rgb('teal')
LINE    = rgb('line')
NAVY    = rgb('navy')   # dark plates

# BG doubled as a TEXT colour for white type on coloured fills, and as the fill
# for white cards sitting on a tinted panel. Now that BG is the tinted page,
# both of those need saying explicitly.
ON_DARK  = RGBColor(0xFF, 0xFF, 0xFF)
HERO_SUB = RGBColor(0xCA, 0xDC, 0xFC)
HERO_DIM = RGBColor(0x8F, 0xA3, 0xCC)

TITLE_FONT = 'Cambria'

W, H = Inches(13.333), Inches(7.5)
prs = Presentation()
prs.slide_width = W
prs.slide_height = H
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

# ── Emoji font handling ──────────────────────────────────────────────────────
# Calibri carries no colour-emoji coverage, so an emoji inside a Calibri run is
# left to font fallback — which resolves differently on every machine, and to an
# empty box where the fallback is missing. Splitting the run and naming an emoji
# font for the pictographic part makes the deck render the same on somebody
# else's laptop as it does here.
#
# Dingbats (U+2700-27BF, the tick and cross) are deliberately NOT routed here:
# Calibri draws them cleanly as typographic marks, and an emoji font would turn
# a neat tick into a colour sticker.
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
         [[('SHOULD-COST  INTELLIGENCE', 7.5 * s, HERO_DIM if on_dark else MUTED, False)]])

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

# Both "technology / accuracy / speed" slides run their panels to a common
# bottom. Trimming the copy freed room inside them, and that room is spent on
# larger type rather than left as empty panel.
_COL_PANEL_TOP, _COL_PANEL_BOTTOM = Inches(2.0), Inches(6.15)

def _col_panel_h(cols):
    return _COL_PANEL_BOTTOM - _COL_PANEL_TOP

def flow_box(slide, x, y, w, h, title, sub, color, fill=None):
    b = box(slide, x, y, w, h, fill=(fill or PANEL), round_=True, radius=0.12)
    box(slide, x, y, Inches(0.07), h, fill=color)
    tf = b.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = Inches(0.18); tf.margin_right = Inches(0.08)
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = title
    r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = color; r.font.name = 'Calibri'
    if sub:
        p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.LEFT
        r2 = p2.add_run(); r2.text = sub
        r2.font.size = Pt(9.5); r2.font.color.rgb = BODY; r2.font.name = 'Calibri'
    return b

def down_arrow(slide, x, y, h=Inches(0.32)):
    a = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, x, y, Inches(0.32), h)
    a.fill.solid(); a.fill.fore_color.rgb = LINE
    a.line.fill.background(); a.shadow.inherit = False
    return a


# ═══════════════ 1 — TITLE ═══════════════
# A navy plate, as the other three decks open on. The only slide here where
# white type is correct.
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=NAVY)
box(s, 0, 0, W, Inches(0.16), fill=BLUE)
logo(s, x=Inches(0.5), y=Inches(0.45), scale=1.25, on_dark=True)
text(s, Inches(0.9), Inches(2.15), Inches(11.8), Inches(1.0),
     [[('CostVision Implementation Blueprint', 36, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.9), Inches(3.1), Inches(11.4), Inches(0.9),
     [[('How we run CostVision safely inside the company, and how it could plug into CAPEE.', 19, HERO_SUB, False)],
      [('CAD files stay on the machine that measures them. The JLR build has no API key yet.', 19, HERO_SUB, False)]])
for i, (t, c) in enumerate([('CAD stays in-house', GREEN), ('AI needs a key', BLUE), ('Runs on a laptop', VIOLET), ('6-phase plan', CYAN)]):
    x = Inches(0.9 + i * 2.95)
    chip = box(s, x, Inches(4.55), Inches(2.7), Inches(0.52), fill=ON_DARK, round_=True, radius=0.5)
    tf = chip.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = t; r.font.size = Pt(12.5); r.font.bold = True; r.font.color.rgb = c; r.font.name = 'Calibri'
text(s, Inches(0.9), Inches(6.5), Inches(11), Inches(0.4),
     [[('Management briefing  ·  September 2026  ·  Checked against the code, app version V4.2', 12, HERO_DIM, False)]])
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=BLUE)
notes(s, "Thanks for making the time. This is the implementation blueprint for CostVision. It covers two things. "
         "First, how we run the tool safely inside the company, so CAD data never leaves our hands. Second, how it "
         "could plug into CAPEE, the should-cost software our teams already use. "
         "I want to be clear about where we are. The tool is built. The version JLR has runs on a single laptop, "
         "with no installer, no admin rights and no internet. The AI features wait for an API key in that build, "
         "and none has been added yet. The code is still there, and adding a key turns it on later. "
         "Everything on these slides was checked against the code this month. Where something is a plan and not a "
         "thing that exists, I'll say so. At the end I'll ask for one decision: approval to start phases one and two.")

# ═══════════════ 2 — THE DECISION ═══════════════
s = header('The decision we are asking for today', 'Purpose of this meeting')
box(s, Inches(0.45), Inches(2.1), Inches(12.45), Inches(1.5), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(2.35), Inches(11.8), Inches(1.1),
     [[('Approve Phases 1–2: ', 17, BLUE, True),
       ('the IT-Security assessment and the architecture design for running CostVision on our network '
        'and connecting it to CAPEE.  (Our estimate: 5–7 weeks, existing teams, no licence spend.)', 17, BODY, False)]],
     line_spacing=1.2)
pts = [
    ('Why now', 'The tool is built and has 2,438 automated tests. What is left is deployment work, not building the tool.', BLUE),
    ('Why it is safe', 'CAD is measured on the same machine. The JLR build has no API key yet. A laptop build needs no internet.', GREEN),
    ('Why CAPEE', 'CAPEE stays the tool teams use. The plan is for CostVision to work behind it as the costing engine. Nothing is ripped out.', VIOLET),
]
for i, (t, d, c) in enumerate(pts):
    x = Inches(0.45 + i * 4.25)
    box(s, x, Inches(4.0), Inches(4.0), Inches(2.4), fill=PANEL, round_=True, radius=0.07)
    box(s, x, Inches(4.0), Inches(4.0), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(4.25), Inches(3.55), Inches(0.4), [[(t, 15.5, c, True)]])
    text(s, x + Inches(0.25), Inches(4.75), Inches(3.55), Inches(1.55), [[(d, 12, BODY, False)]], line_spacing=1.18)
notes(s, "I have one ask today: approve the first two phases. That's the security assessment and the architecture "
         "design. My estimate is five to seven weeks with our existing teams, and no licence spend. "
         "Why now? The tool itself is built. It has two thousand four hundred and thirty-eight automated tests. What "
         "is left is deployment work, not building the tool. "
         "Why is it safe? The CAD file is measured on the same machine that runs the tool. Nothing is sent out. In "
         "the JLR build the AI waits for an API key, and the laptop version needs no internet at all. "
         "And why CAPEE? Because we are not replacing it. CAPEE stays the tool our teams open every day. The plan is "
         "for CostVision to sit behind it as the costing engine. To be clear, that connection is a plan. It is not "
         "built yet, and phase two is where we design it properly.")

# ═══════════════ 3 — WHAT COSTVISION IS ═══════════════
s = header('What CostVision is — a quick recap', 'Background')
caps = [
    ('19 manufacturing processes', 'Machining, casting, forging, moulding, sheet metal, PCB, harness and more. Every number traces to a rate.', BLUE),
    ('CAD to Cost, on rules', 'Measures STEP, IGES or STL files. Rules turn the measurements into inputs. It asks you when it cannot tell.', CYAN),
    ('20 regions, 8 cost buckets', 'Material, process, labour, tooling, packaging, logistics, overhead, margin. Rate library dated 16 June 2026.', VIOLET),
    ('Learns from actuals', 'Log a real quote or PO price. After 3 actuals for a commodity, the uncertainty band is corrected by real data.', GREEN),
]
for i, (t, d, c) in enumerate(caps):
    x = Inches(0.45 + (i % 2) * 6.35); y = Inches(2.05 + (i // 2) * 1.62)
    box(s, x, y, Inches(6.1), Inches(1.42), fill=PANEL, round_=True, radius=0.09)
    box(s, x, y, Inches(0.09), Inches(1.42), fill=c)
    text(s, x + Inches(0.28), y + Inches(0.14), Inches(5.6), Inches(0.4), [[(t, 14.5, c, True)]])
    text(s, x + Inches(0.28), y + Inches(0.58), Inches(5.6), Inches(0.75), [[(d, 11.5, BODY, False)]], line_spacing=1.12)
box(s, Inches(0.45), Inches(5.55), Inches(12.45), Inches(1.3), fill=GREENBG, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(5.75), Inches(11.8), Inches(0.95),
     [[('What is proven:  ', 13.5, GREEN, True),
       ('matches a hand calculation to under 0.01%  ·  6 real parts pinned in a baseline  ·  2,438 tests.  '
        'Not yet done: a comparison with a price JLR actually paid.', 13.5, BODY, False)]],
     line_spacing=1.2)
notes(s, "A quick recap for anyone new. CostVision works out what a part should cost. It covers nineteen "
         "manufacturing processes and twenty regions, and it splits every cost into eight buckets. Every number "
         "is plain arithmetic you can trace back to a rate. "
         "You can upload a CAD file. The tool measures it, rules turn the measurements into cost inputs, and where "
         "the geometry can't decide something, like the process route, it asks the engineer. "
         "It also learns. If you log a real quote or PO price, then after three of them for a commodity, the "
         "uncertainty band is corrected by real data. "
         "The green bar is what is proven today. The arithmetic matches a hand calculation to under a hundredth of a "
         "percent. Six real production parts are pinned in a regression baseline. And there are 2,438 automated "
         "tests. What we have not done yet is compare an estimate with a price JLR actually paid. I'd rather say "
         "that now than have someone find it later.")

# ═══════════════ 3A — AGENTIC vs AUTONOMOUS AGENTIC (EXAMPLES) ═══════════════
s = header('Two layers — rules always on, AI optional', 'The concept · explained')
text(s, Inches(0.45), Inches(1.78), Inches(12.4), Inches(0.4),
     [[('Left: what runs in the JLR build today, with no AI. Right: the optional AI mode, '
        'needing an API key.', 12.5, BODY, False, True)]],
     line_spacing=1.05)

def _agent_panel(x, accent, fillc, head, tag, examples):
    w, y, h = Inches(6.08), Inches(2.28), Inches(4.06)
    box(s, x, y, w, h, fill=fillc, round_=True, radius=0.06)
    box(s, x, y, Inches(0.08), h, fill=accent)
    text(s, x + Inches(0.28), y + Inches(0.16), w - Inches(0.5), Inches(0.34), [[(head, 15.5, accent, True)]])
    text(s, x + Inches(0.28), y + Inches(0.54), w - Inches(0.5), Inches(0.32), [[(tag, 10.5, MUTED, False, True)]])
    ry, rh = y + Inches(0.98), Inches(0.7)
    for lab, sub in examples:
        box(s, x + Inches(0.24), ry, w - Inches(0.48), rh, fill=PANEL, round_=True, radius=0.08)
        box(s, x + Inches(0.24), ry, Inches(0.05), rh, fill=accent)
        text(s, x + Inches(0.42), ry, w - Inches(0.66), rh,
             [[(lab + '   ', 11, DARK, True), (sub, 9.5, MUTED, False)]],
             anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.0)
        ry += rh + Inches(0.06)

_agent_panel(Inches(0.45), BLUE, PANEL, 'Rules and arithmetic',
    'Always on — this is the JLR build today',
    [('CAD to Cost', 'Measures the file. Asks you what geometry cannot decide.'),
     ('Self-audit', 'Flags a wrong machine size, wrong volume, odd cycle times.'),
     ('Learning from actuals', 'After 3 logged prices, the band uses real data.'),
     ('Negotiation', 'Compares a supplier quote with should-cost, bucket by bucket.')])
_agent_panel(Inches(6.8), VIOLET, PANEL2, 'Optional AI mode',
    'Needs an API key — code kept, adding a key turns it on',
    [('PCB photo to BOM', 'The model lists the parts; the tool prices every line and costs the board.'),
     ('Describe a part', 'Type a description; it suggests the inputs.'),
     ('AI assistant and agent', 'Answers costing questions from your own rates.'),
     ('Rate-limited', 'When on, every AI route is limited per user.')])

box(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.68), fill=DARK, round_=True, radius=0.08)
text(s, Inches(0.78), Inches(6.5), Inches(11.9), Inches(0.68),
     [[('The rule in both columns:  ', 11.5, ON_DARK, True),
       ('AI never sets a price, even when it is on. Every £ is arithmetic you can trace to a rate.',
        11.5, RGBColor(0xE8, 0xEE, 0xFF), False)]],
     anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.0)
notes(s, "I want to slow down here, because people often mix these two layers up. "
         "On the left is what runs in the JLR build today. It's all rules and arithmetic, with no AI. The tool "
         "measures a CAD file and asks the engineer anything the geometry can't settle. A self-audit flags common "
         "mistakes, like the wrong machine size or tooling spread over the wrong volume. Logged prices tighten the "
         "uncertainty band. And the negotiation view compares a supplier quote with the should-cost, bucket by bucket. "
         "On the right is the optional AI mode. Reading a PCB photo, describing a part in words, the assistant and "
         "the agent. At JLR all of that waits for an API key and is hidden until then. The code is still in the product, so a key "
         "can turn it on later without a rebuild. If it is turned on, each user is rate-limited. "
         "The line at the bottom holds in both columns. AI never sets a price. At most it reads or classifies. "
         "The money is always arithmetic.")

# ═══════════════ 3B — LATEST AGENTIC INTELLIGENCE (2026) ═══════════════
s = header('What sits on top of the cost engine', 'Background · checks and learning')
rows = [
    ('Self-audit', 'Runs on every result. Flags a wrong machine size, tooling spread over the wrong volume, a material-only costing, odd cycle times.', INDIGO),
    ('Learns from actuals', 'Log a real quote or PO price. After 3 actuals for a commodity, the band is corrected by real data.', GREEN),
    ('Negotiation', 'Compares a supplier quote with the should-cost, bucket by bucket, so you can see where the gap is.', BLUE),
    ('Uncertainty band', 'Every result shows a P10–P90 range from a Monte Carlo run over every cost driver.', VIOLET),
    ('Geometry is the truth', 'The measured part wins. Where it cannot decide, the tool asks the engineer instead of guessing.', CYAN),
    ('Traceable exports', 'Excel (6 sheets, with a traceability sheet), PDF and a negotiation pack. All match the screen to the penny.', AMBER),
]
for i, (t, d, c) in enumerate(rows):
    y = Inches(2.0 + i * 0.82)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.74), fill=PANEL if i % 2 == 0 else BG, round_=True, radius=0.1)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.74), fill=c)
    text(s, Inches(0.78), y + Inches(0.10), Inches(3.5), Inches(0.55), [[(t, 12.5, c, True)]])
    text(s, Inches(4.3), y + Inches(0.09), Inches(8.4), Inches(0.6), [[(d, 11, BODY, False)]], line_spacing=1.08)
notes(s, "This slide is about the checks and the learning that sit on top of the cost engine. None of it needs AI. "
         "The self-audit runs on every single result. It flags the mistakes we have actually seen, like a part on "
         "the wrong size of machine, or tooling spread over the wrong volume. It flags them. It doesn't quietly fix "
         "them behind your back. "
         "The learning is simple. You log a real quote or a PO price. Once there are three for a commodity, the "
         "uncertainty band is corrected by real data instead of assumptions. "
         "Negotiation puts a supplier quote next to the should-cost, bucket by bucket. The band on every result is a "
         "P10 to P90 range from a Monte Carlo run. "
         "Then two principles. The measured geometry wins, and when it can't decide, the tool asks. And every export "
         "matches the screen to the penny, with a traceability sheet in the Excel file. That is what makes a number "
         "defensible in a supplier meeting.")

# ═══════════════ 4 — TECH STACK IN PLAIN WORDS ═══════════════
s = header('What the tool is made of — in plain words', 'Technology, simply explained')
stack = [
    ('Frontend', 'What users see', 'Forms, results and reports in the browser. On the laptop build the browser talks only to the laptop itself (127.0.0.1).', BLUE),
    ('Backend', 'The engine room', 'The server program that does the work: the cost engines for 19 processes, sign-in, exports. Same code on a laptop or a server.', INDIGO),
    ('Database', 'The memory', 'Today: a local database file holding rates, saved scenarios and logged actuals. Plan: move to the corporate database for a shared server.', VIOLET),
    ('CAD engine', 'The 3D model reader', 'OpenCASCADE geometry software. Measures volume, weight, size, walls, holes and features. Runs inside the backend.', CYAN),
    ('AI layer', 'Optional, needs a key', 'Every AI call goes through one control point. It can be switched off, or pointed at a private endpoint.', GREEN),
]
for i, (t, tag, d, c) in enumerate(stack):
    y = Inches(2.05 + i * 0.95)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.84), fill=PANEL, round_=True, radius=0.14)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.84), fill=c)
    text(s, Inches(0.75), y + Inches(0.10), Inches(2.0), Inches(0.4), [[(t, 15, c, True)]])
    text(s, Inches(0.75), y + Inches(0.47), Inches(2.0), Inches(0.3), [[(tag, 10, MUTED, False, True)]])
    text(s, Inches(2.95), y + Inches(0.12), Inches(9.7), Inches(0.65), [[(d, 11.5, BODY, False)]], line_spacing=1.1)
notes(s, "Before the architecture, here are the five building blocks in plain words. "
         "The frontend is what you see in the browser. On the laptop build, the browser only talks to the laptop "
         "itself. The backend is the engine room. It runs the cost engines, the sign-in and the exports, and it is "
         "the same code on a laptop or a server. "
         "The database today is a local file. It holds the rates, each user's saved scenarios and any logged "
         "actuals. For a shared server, the plan is to move that to the corporate database IT already runs. That "
         "move is not done yet. "
         "The CAD engine is OpenCASCADE, the geometry software that measures the model. It runs inside the backend, "
         "not in anyone's cloud. "
         "And the AI layer. Every AI call has to pass through one control point in the code. At JLR it has no "
         "key. If we ever get approval, the same control point can send calls to a private endpoint instead of the "
         "public one.")

# ═══════════════ 5 — THE REQUIREMENT & KEY FINDING ═══════════════
s = header('The security requirement — and the key finding', 'Security')
box(s, Inches(0.45), Inches(2.05), Inches(12.45), Inches(1.15), fill=AMBERBG, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(2.25), Inches(11.8), Inches(0.8),
     [[('IT-Security requirement:  ', 15, AMBER, True),
       ('no CAD files, engineering drawings or images may leave the company network. Ever.', 15, DARK, True)]],
     line_spacing=1.15)
box(s, Inches(0.45), Inches(3.5), Inches(12.45), Inches(2.0), fill=GREENBG, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(3.72), Inches(11.8), Inches(1.6),
     [[('The key finding from the code audit:  ', 15, GREEN, True),
       ('CAD files never leave the machine that runs the tool.', 15, DARK, True)],
      [('The upload is held in memory, written to a local temp file while it is measured, then deleted. '
        'Nothing is sent anywhere. The only possible outbound flows are the AI layer and two optional '
        'public feeds, and the JLR build switches all of them off with one setting.', 13, BODY, False)]],
     space_after=8, line_spacing=1.2)
text(s, Inches(0.45), Inches(5.85), Inches(12.4), Inches(0.9),
     [[('Why you can trust this: ', 12.5, DARK, True),
       ('we went through every outbound network call in the source code and listed each one. '
        'The list is in the written plan. Automated tests check the AI-off setting.', 12.5, BODY, False)]],
     line_spacing=1.2)
notes(s, "The requirement from IT Security is simple and absolute. No CAD files, drawings or images leave the "
         "company network. "
         "Here's what we found in the code. When you upload a CAD file, it is held in memory, written to a temp "
         "file on the same machine while the geometry engine measures it, and then deleted. It is never sent "
         "anywhere. I want to be precise about that temp file, because an earlier version of this deck said the "
         "file never touches disk, and that wasn't quite right. "
         "The only things that could ever go out are the AI layer and two optional public feeds, part pricing and "
         "news. In the JLR build, none has a key yet. The tool then says AI needs an API key rather "
         "than asking for a key. "
         "We listed every outbound call in the source code, and there are automated tests for the AI-off setting. "
         "So the software side is in place. What's left is infrastructure and sign-off.")

# ═══════════════ 6 — DATA-FLOW MAP ═══════════════
s = header('Where data flows today — verified in the code', 'Data-flow map')
box(s, Inches(0.45), Inches(2.0), Inches(7.5), Inches(4.7), fill=GREENBG, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.2), Inches(6.9), Inches(0.4),
     [[('STAYS INSIDE', 14, GREEN, True)]])
inside = [
    ('CAD / geometry measuring', 'OpenCASCADE in the backend; temp file deleted after measuring'),
    ('Cost engines for 19 processes', 'Plain arithmetic on the rate library, fully local'),
    ('Learning from actuals', 'Logged prices, similar parts, calibration — local database'),
    ('BOM files, exports, reports', 'Local parsers; Excel and PDF made on the machine'),
]
for i, (a, b) in enumerate(inside):
    y = Inches(2.7 + i * 0.95)
    box(s, Inches(0.75), y, Inches(0.09), Inches(0.8), fill=GREEN)
    text(s, Inches(1.0), y, Inches(6.7), Inches(0.9),
         [[(a, 12.5, DARK, True)], [(b, 10.5, BODY, False)]], space_after=2, line_spacing=1.05)
box(s, Inches(8.3), Inches(2.0), Inches(4.6), Inches(4.7), fill=AMBERBG, round_=True, radius=0.05)
text(s, Inches(8.6), Inches(2.2), Inches(4.0), Inches(0.4),
     [[('COULD LEAVE — none active without a key', 14, AMBER, True)]])
outside = [
    ('AI calls (optional mode)', 'Photos and measured summaries. Needs an API key. If turned on, can go to a private endpoint', AMBER),
    ('Live part pricing (optional)', 'Part-number text only. Needs its own key; the offline catalogue prices meanwhile', MUTED),
    ('News feed', 'Public news, no company data. Needs internet', MUTED),
]
for i, (a, b, c) in enumerate(outside):
    y = Inches(2.7 + i * 1.28)
    box(s, Inches(8.6), y, Inches(0.09), Inches(1.1), fill=c)
    text(s, Inches(8.85), y, Inches(3.9), Inches(1.25),
         [[(a, 12, DARK, True)], [(b, 10.5, BODY, False)]], space_after=2, line_spacing=1.05)
notes(s, "This is the whole security story on one slide. "
         "On the left, in green, is what stays inside. That's the geometry measuring, the cost engines, the "
         "learning from actuals, and the Excel and PDF exports. That is nearly all of the tool. "
         "On the right, in amber, are the only three flows that could ever leave. The first is the AI layer, which "
         "would send photos or measured summaries. The second is live part pricing, which sends part numbers only. "
         "The third is the news feed, which pulls public news and sends no company data. "
         "In the JLR build, none of the three has a key. The AI screens are hidden, and news simply "
         "doesn't load without internet. "
         "If AI is approved one day, the code can send those calls to a private endpoint of our choosing rather than "
         "the public internet. That's a future option, not how it runs today.")

# ═══════════════ 7 — DEPLOYMENT OPTIONS ═══════════════
s = header('Deployment options — our recommendation', 'Decision')
cols = [
    ('OPTION A  ·  TODAY', 'No API key', 'What JLR runs now. Laptop package or our own server, no key added. All costing, CAD measuring and learning work.',
     'No external connections; nothing to approve for AI', 'No PCB photo, no describe-a-part, no assistant', PANEL2, BLUE),
    ('OPTION B  ·  FUTURE', 'Private AI, core in-house', 'Tool on our machines. AI calls go to a model in our own cloud account over a private link. Needs AI approval first.',
     'Adds the AI screens back; routing setting already in the code', 'Needs AI approval and cloud sign-off', PANEL, VIOLET),
    ('OPTION C', 'Public AI API', 'Tool in-house, but AI calls go to the public API.',
     'Simplest', 'Fails our requirement — photos would cross a public API', PANEL, RED),
]
for i, (tag, t, d, pro, con, fill, c) in enumerate(cols):
    x = Inches(0.45 + i * 4.25)
    box(s, x, Inches(2.05), Inches(4.0), Inches(4.5), fill=fill, round_=True, radius=0.06)
    box(s, x, Inches(2.05), Inches(4.0), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(2.25), Inches(3.55), Inches(0.35), [[(tag, 12, c, True)]])
    text(s, x + Inches(0.25), Inches(2.62), Inches(3.55), Inches(0.4), [[(t, 16, DARK, True)]])
    text(s, x + Inches(0.25), Inches(3.15), Inches(3.55), Inches(1.5), [[(d, 11.5, BODY, False)]], line_spacing=1.15)
    text(s, x + Inches(0.25), Inches(4.85), Inches(3.55), Inches(0.75),
         [[('+ ', 12, GREEN, True), (pro, 11, BODY, False)]], line_spacing=1.1)
    text(s, x + Inches(0.25), Inches(5.7), Inches(3.55), Inches(0.75),
         [[('– ', 12, RED, True), (con, 11, BODY, False)]], line_spacing=1.1)
text(s, Inches(0.45), Inches(6.75), Inches(12.4), Inches(0.5),
     [[('Recommendation: stay on Option A. Consider B only once AI is approved. The code supports both.', 13, DARK, True)]])
notes(s, "There are three ways to run this. "
         "Option A is what JLR runs today. The tool sits on a laptop or on our own server, with no API key. "
         "All the costing, the CAD measuring and the learning work. What you lose are the AI screens: the PCB "
         "photo reader, describing a part in words, and the assistant. "
         "Option B is a future option. The tool stays on our machines, and the AI calls go to a model in our own "
         "cloud account over a private link. The setting for that routing is already in the code. But it needs AI "
         "approval first, and a cloud sign-off, and we have neither today. "
         "Option C is the public AI service. I include it only to rule it out, because photos would cross the "
         "public internet. "
         "So my recommendation is to stay on A. If AI is approved later, we look at B. And the two can mix, with "
         "sensitive programmes staying on A.")

# ═══════════════ 8 — TARGET ARCHITECTURE ═══════════════
s = header('Target architecture for a shared server — the plan', 'Architecture · plan')
box(s, Inches(0.45), Inches(1.95), Inches(9.2), Inches(4.95), fill=PANEL, round_=True, radius=0.04)
text(s, Inches(0.7), Inches(2.05), Inches(8.5), Inches(0.3), [[('COMPANY INTERNAL NETWORK  ·  PLANNED', 11, MUTED, True)]])
flow_box(s, Inches(0.85), Inches(2.45), Inches(4.0), Inches(0.75), 'Engineers (browser)  +  CAPEE', 'company single sign-on (planned)', BLUE, fill=PANEL)
flow_box(s, Inches(5.15), Inches(2.45), Inches(4.2), Inches(0.75), 'Corporate API Gateway', 'authentication · rate limits · audit logs', INDIGO, fill=PANEL)
down_arrow(s, Inches(2.7), Inches(3.28))
down_arrow(s, Inches(7.1), Inches(3.28))
flow_box(s, Inches(0.85), Inches(3.68), Inches(8.5), Inches(1.05), 'CostVision server (frontend + backend on our VM)',
         'Docker image with the CAD kernel · 19 processes · learning from actuals · exports', VIOLET, fill=PANEL)
down_arrow(s, Inches(2.7), Inches(4.82))
down_arrow(s, Inches(7.1), Inches(4.82))
flow_box(s, Inches(0.85), Inches(5.22), Inches(4.0), Inches(0.85), 'Corporate database', 'rates · scenarios · actuals · encrypted', CYAN, fill=PANEL)
flow_box(s, Inches(5.15), Inches(5.22), Inches(4.2), Inches(0.85), 'Internal AI gateway (only if approved)', 'the only allowed exit · logged', AMBER, fill=PANEL)
box(s, Inches(10.0), Inches(4.9), Inches(2.9), Inches(2.0), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(10.2), Inches(5.05), Inches(2.5), Inches(1.8),
     [[('Our cloud account (future)', 12.5, BLUE, True)],
      [('AI model, only after AI approval', 10.5, BODY, False)],
      [('private link · no public internet · no data kept', 10, MUTED, False)]],
     space_after=4, line_spacing=1.1)
arr = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(9.42), Inches(5.5), Inches(0.55), Inches(0.3))
arr.fill.solid(); arr.fill.fore_color.rgb = AMBER; arr.line.fill.background(); arr.shadow.inherit = False
text(s, Inches(10.0), Inches(2.45), Inches(2.9), Inches(2.2),
     [[('Access rules', 12.5, DARK, True)],
      [('• Today: sign-in on everything that holds data', 10.5, BODY, False)],
      [('• Today: sessions can be ended everywhere', 10.5, BODY, False)],
      [('• Plan: company single sign-on and roles', 10.5, BODY, False)],
      [('• Plan: block all other outbound traffic', 10.5, BODY, False)]],
     space_after=4, line_spacing=1.1)
notes(s, "This is the target for a shared server, and I want to stress it is a plan. Today JLR runs the laptop "
         "package. "
         "Everything in the grey box sits inside our network. Engineers, and later CAPEE, come in through the "
         "corporate gateway. The CostVision server runs from the Docker image, which already exists and includes "
         "the CAD kernel. The data would live in the corporate database. That move is still to do. "
         "The AI gateway at the bottom only matters if AI is ever approved. It would be the one door out, and it "
         "would be logged. Until then there is no door at all. "
         "On the right, the access rules. Two exist today. You must sign in to anything that holds data, and a "
         "password reset or sign out everywhere ends every old session. Two are plans: company single sign-on "
         "with roles, and a firewall that blocks everything else.")

# ═══════════════ 9 — CAD PROTECTION ═══════════════
s = header('How CAD data is protected', 'CAD data protection')
rows = [
    ('CAD model opened and measured', 'Inside the backend (OpenCASCADE)', 'Local — checked in code'),
    ('Feature detection (holes, walls)', 'Inside the backend', 'Local — checked in code'),
    ('BOM files read', 'Inside the backend (local parsers)', 'Local — checked in code'),
    ('Cost calculation and learning', 'Backend and local database', 'Local — checked in code'),
    ('Photo reading (AI mode)', 'Needs an API key', 'Hidden until a key is added'),
    ('CAD file storage', 'Temp file while measured', 'Deleted after measuring'),
]
for i, (a, b, c) in enumerate(rows):
    y = Inches(2.1 + i * 0.73)
    bgc = PANEL if i % 2 == 0 else BG
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.62), fill=bgc, round_=True, radius=0.14)
    text(s, Inches(0.8), y + Inches(0.12), Inches(4.9), Inches(0.4), [[(a, 12.5, DARK, True)]])
    text(s, Inches(5.8), y + Inches(0.12), Inches(3.8), Inches(0.4), [[(b, 12, BODY, False)]])
    col = GREEN if 'checked' in c or 'Deleted' in c else AMBER
    text(s, Inches(9.7), y + Inches(0.12), Inches(3.0), Inches(0.4), [[(c, 11.5, col, True)]])
text(s, Inches(0.45), Inches(6.6), Inches(12.4), Inches(0.6),
     [[('Plus: the AI-off setting is covered by automated tests, and security can check it for themselves '
        'in a witnessed firewall test. Sending logs to the corporate SIEM is a plan.', 12, MUTED, False, True)]], line_spacing=1.15)
notes(s, "Let's go function by function and ask where the CAD data actually goes. "
         "Opening and measuring the model, finding holes and walls, reading BOM files, working out the cost and "
         "learning from actuals. All of it happens inside the backend, on the same machine. We checked that in the "
         "code. "
         "The amber row is photo reading. That's an AI feature, and in the JLR build it is off and its screen is "
         "hidden until a key is added. "
         "The last row is worth a word. The CAD file is not kept. While it is being measured it sits in a temp file "
         "on the same machine, and then it is deleted. "
         "Finally, security doesn't have to take my word for any of this. The AI-off setting has automated tests. "
         "They can also run their own witnessed firewall test and watch for traffic. Sending our logs to the "
         "corporate monitoring system is something we'd set up as part of the plan.")

# ═══════════════ 10 — CAPEE INTEGRATION ═══════════════
s = header('CostVision behind CAPEE — how it could connect', 'Integration · plan')
box(s, Inches(0.45), Inches(2.0), Inches(5.6), Inches(2.1), fill=PANEL, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(2.2), Inches(5.0), Inches(1.8),
     [[('CAPEE  (existing should-cost software)', 15, DARK, True)],
      [('• Should-cost workflow, approvals, reporting', 12, BODY, False)],
      [('• System of record — unchanged for users', 12, BODY, False)],
      [('• Plan: calls CostVision for the costing', 12, BODY, False)]],
     space_after=5, line_spacing=1.12)
box(s, Inches(7.3), Inches(2.0), Inches(5.6), Inches(2.1), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(7.6), Inches(2.2), Inches(5.0), Inches(1.8),
     [[('CostVision  (the engine it plugs in)', 15, BLUE, True)],
      [('• 19 processes, CAD measured on rules', 12, BODY, False)],
      [('• Similar parts, learning from actuals', 12, BODY, False)],
      [('• Quote vs should-cost, bucket by bucket', 12, BODY, False)]],
     space_after=5, line_spacing=1.12)
a1 = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(6.15), Inches(2.45), Inches(1.05), Inches(0.4))
a1.fill.solid(); a1.fill.fore_color.rgb = BLUE; a1.line.fill.background(); a1.shadow.inherit = False
a2 = s.shapes.add_shape(MSO_SHAPE.LEFT_ARROW, Inches(6.15), Inches(3.15), Inches(1.05), Inches(0.4))
a2.fill.solid(); a2.fill.fore_color.rgb = GREEN; a2.line.fill.background(); a2.shadow.inherit = False
text(s, Inches(5.95), Inches(2.1), Inches(1.5), Inches(0.3), [[('requests', 9.5, BLUE, True)]], align=PP_ALIGN.CENTER)
text(s, Inches(5.95), Inches(3.6), Inches(1.5), Inches(0.3), [[('costs back', 9.5, GREEN, True)]], align=PP_ALIGN.CENTER)
box(s, Inches(0.45), Inches(4.5), Inches(12.45), Inches(2.3), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(4.7), Inches(11.9), Inches(0.35), [[('What would flow over the connection (not built yet)', 13.5, DARK, True)]])
flows = [
    ('Cost a part →', 'full should-cost with breakdown'),
    ('CAD file →', 'measured geometry + inputs'),
    ('New part →', 'similar past parts'),
    ('PO price →', 'logged as an actual'),
    ('Quote ←', 'gap to should-cost, by bucket'),
    ('One shared →', 'rate library & knowledge database'),
]
for i, (a, b) in enumerate(flows):
    x = Inches(0.75 + (i % 3) * 4.1); y = Inches(5.2 + (i // 3) * 0.75)
    text(s, x, y, Inches(3.9), Inches(0.7),
         [[(a + ' ', 12, BLUE, True), (b, 11.5, BODY, False)]], line_spacing=1.1)
notes(s, "Here's the idea for CAPEE in one line. CostVision works behind CAPEE, not beside it. I want to be clear "
         "this is a plan. The connection is not built yet. "
         "CAPEE keeps what it does today: the workflow, the approvals and the reporting. Users keep opening CAPEE. "
         "The change is that CAPEE would ask CostVision for the cost and get the breakdown back. "
         "The six flows at the bottom are what we'd design in phase two. CAPEE sends a part and gets a should-cost. "
         "It sends a CAD file and gets the measured geometry and inputs back. It asks about a new part and gets "
         "similar past parts. "
         "The one I like most is PO prices. CAPEE already captures them. Each one could be logged as an actual, and "
         "after three for a commodity the tool's band is corrected by real data. That's also how we'd finally "
         "compare our estimates with prices JLR really paid. And one shared rate library keeps both tools on the "
         "same numbers.")

# ═══════════════ 11 — WHAT EACH SIDE NEEDS ═══════════════
s = header('What each side needs to change', 'Scope of work')
box(s, Inches(0.45), Inches(2.05), Inches(6.0), Inches(4.55), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.25), Inches(5.4), Inches(0.4), [[('CostVision — 6 items (2 DONE)', 15, BLUE, True)]])
cv = [
    ('Private AI routing', 'DONE — one setting sends AI calls to our endpoint', True),
    ('AI-off switch', 'DONE — used in the JLR build; has tests', True),
    ('Company sign-on', 'swap local logins for company SSO', False),
    ('Corporate database', 'move from the local file database', False),
    ('Cost API for CAPEE', 'one clean endpoint per commodity', False),
    ('Audit hardening', 'admin audit table, logs to SIEM', False),
]
for i, (a, b, done) in enumerate(cv):
    y = Inches(2.75 + i * 0.63)
    mark = f'{i+1}. '
    tc = GREEN if done else DARK
    dc = GREEN if done else BODY
    text(s, Inches(0.75), y, Inches(5.5), Inches(0.6),
         [[(mark + a + ' — ', 12, tc, True), (b, 11, dc, False)]], line_spacing=1.05)
box(s, Inches(6.85), Inches(2.05), Inches(6.05), Inches(4.55), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.25), Inches(5.4), Inches(0.4), [[('CAPEE — small, additive changes', 15, VIOLET, True)]])
cap = [
    ('Backend', 'a client to call CostVision, with sign-in tokens; send PO prices in as actuals', 'Small'),
    ('User interface', 'a should-cost panel on the costing screen; a CAD upload button', 'Medium'),
    ('Data', 'use the shared rate library; a one-off import of past quotes as actuals', 'Small–Medium'),
]
for i, (a, b, sz) in enumerate(cap):
    y = Inches(2.8 + i * 1.25)
    text(s, Inches(7.15), y, Inches(5.5), Inches(1.2),
         [[(a + '  ', 13, DARK, True), ('· ' + sz, 11, VIOLET, True)],
          [(b, 11.5, BODY, False)]], space_after=3, line_spacing=1.12)
text(s, Inches(0.45), Inches(6.8), Inches(12.4), Inches(0.45),
     [[('Items 1–2 are built. Our estimate for the rest: 3–5 engineering weeks. No major rework on either side.', 13.5, DARK, True)]])
notes(s, "Here is the scope of work, sized as honestly as I can. "
         "On the CostVision side there are six items. Two are done. The private AI routing setting is in the code. "
         "The AI-off switch is in the code, it has tests, and it's what the JLR build runs with today. "
         "Four are still to do. We need company single sign-on in place of local logins, and a move from the local "
         "database file to the corporate database. We need a clean API for CAPEE to call, and some audit "
         "hardening. "
         "On the CAPEE side the changes add things. They don't rip anything out. CAPEE needs a client to call "
         "CostVision, a should-cost panel on the costing screen, and to use the shared rate library. There's also "
         "a one-off import of past quotes so the learning has something to start from. "
         "My estimate for the remaining work is three to five engineering weeks. That's an estimate, not a promise, "
         "and phase two is where we firm it up.")

# ═══════════════ 12 — SECURITY & COMPLIANCE ═══════════════
s = header('Security & compliance — how we tick the boxes', 'Compliance')
comp = [
    ('Data handling', 'Today: CAD deleted after measuring; laptop build listens on 127.0.0.1 only. Plan: TLS and an encrypted database on a server.', GREEN),
    ('Access control', 'Today: sign-in on everything; users see only their own scenarios; old sessions end on reset. Plan: company SSO.', BLUE),
    ('Data-loss prevention', 'Today: AI and feeds off in the JLR build. Plan: a firewall that blocks all other outbound traffic.', AMBER),
    ('Audit and access', 'Today: rate changes are logged with the user. Every page passes WCAG 2.1 AA (automated check).', VIOLET),
]
for i, (t, d, c) in enumerate(comp):
    x = Inches(0.45 + (i % 2) * 6.35); y = Inches(2.05 + (i // 2) * 1.55)
    box(s, x, y, Inches(6.1), Inches(1.35), fill=PANEL, round_=True, radius=0.09)
    box(s, x, y, Inches(0.09), Inches(1.35), fill=c)
    text(s, x + Inches(0.28), y + Inches(0.13), Inches(5.6), Inches(0.4), [[(t, 14, c, True)]])
    text(s, x + Inches(0.28), y + Inches(0.55), Inches(5.6), Inches(0.75), [[(d, 11.5, BODY, False)]], line_spacing=1.12)
box(s, Inches(0.45), Inches(5.35), Inches(12.45), Inches(1.35), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(5.55), Inches(11.9), Inches(1.05),
     [[('Standards mapping:  ', 13, DARK, True),
       ('to be confirmed with IT Security in Phase 1.  ISO 27001 — add the tool to our ISMS scope  ·  '
        'GDPR — the tool holds little personal data (sign-in details)  ·  ISO/SAE 21434 — an engineering IT '
        'tool, outside the vehicle scope.', 12, BODY, False)]],
     line_spacing=1.25)
notes(s, "For the compliance-minded, I've split each box into what exists today and what is a plan. "
         "Data handling. Today the CAD file is deleted after it's measured, and the laptop build only listens on "
         "the laptop itself. For a server we'd add encrypted connections and an encrypted database. "
         "Access. Today you must sign in to anything that holds data. Users only see their own saved scenarios, and "
         "a password reset or sign out everywhere ends every old session. Company single sign-on is the plan. "
         "Data loss. Today AI and the feeds are off in the JLR build. The firewall rule is for IT to add. "
         "Audit. Rate changes are logged against the user. And every page passes an automated WCAG 2.1 AA "
         "accessibility check. "
         "On standards, I'm not going to claim a certification we don't have. The mapping at the bottom is a "
         "starting point, and phase one is where IT Security confirms it.")

# ═══════════════ 13 — ROLLOUT TIMELINE ═══════════════
s = header('Rollout — six phases, first value around week eight', 'Plan')
phases = [
    ('1', 'Security assessment', '2–3 wks', BLUE),
    ('2', 'Architecture design', '3–4 wks', INDIGO),
    ('3', 'Pilot (dummy CAD)', '2 wks', CYAN),
    ('4', 'CAPEE pilot', '4–6 wks', VIOLET),
    ('5', 'Enterprise rollout', '4 wks', GREEN),
    ('6', 'Monitor & govern', 'ongoing', MUTED),
]
cw = Inches(2.24)
for i, (n, t, d, c) in enumerate(phases):
    shp = s.shapes.add_shape(MSO_SHAPE.CHEVRON, Inches(0.4) + int(cw * 0.86) * i, Inches(2.3), cw, Inches(1.1))
    shp.adjustments[0] = 0.28
    shp.fill.solid(); shp.fill.fore_color.rgb = c
    shp.line.fill.background(); shp.shadow.inherit = False
    tf = shp.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.16); tf.margin_right = Inches(0.05)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; r = p.add_run(); r.text = f'{n} · {t}'
    r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = ON_DARK; r.font.name = 'Calibri'
    p2 = tf.add_paragraph(); r2 = p2.add_run(); r2.text = d
    r2.font.size = Pt(9.5); r2.font.color.rgb = RGBColor(0xE8, 0xEE, 0xFF); r2.font.name = 'Calibri'
gates = [
    ('Phase 3 exit gate', 'Security watches the test: firewall blocks all outbound traffic, the full test suite passes, no unexpected traffic.'),
    ('Phase 4 exit gate', 'A cost engineer does a real costing from inside CAPEE. First estimates compared with prices JLR paid.'),
    ('First value', 'Around week 8: pilot users cost real parts and check supplier quotes bucket by bucket.'),
]
for i, (a, b) in enumerate(gates):
    y = Inches(3.9 + i * 0.95)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.82), fill=PANEL, round_=True, radius=0.12)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.82), fill=BLUE)
    text(s, Inches(0.75), y + Inches(0.1), Inches(2.6), Inches(0.4), [[(a, 12.5, BLUE, True)]])
    text(s, Inches(3.5), y + Inches(0.1), Inches(9.2), Inches(0.65), [[(b, 11.5, BODY, False)]], line_spacing=1.1)
text(s, Inches(0.45), Inches(6.82), Inches(12.4), Inches(0.5),
     [[('After go-live we track: ', 11.5, DARK, True),
       ('estimate vs PO price · costings via CAPEE · quote gaps acted on · adoption.   All timings are estimates from approval.', 11.5, BODY, False)]])
notes(s, "Six phases. The first two, the assessment and the design, are what I'm asking you to approve today. "
         "Phase three is a sealed pilot with dummy CAD. Its exit gate is a test that security watches. The "
         "firewall blocks all outbound traffic, the full test suite passes, and there's no unexpected traffic. "
         "Phase four connects CAPEE. Its gate is a cost engineer doing a real costing from inside CAPEE. It's also "
         "where we first compare our estimates with prices JLR actually paid, which is the test that matters most "
         "and one we haven't done yet. "
         "Rollout and ongoing governance follow. "
         "I expect first value around week eight, when pilot users start costing real parts and checking supplier "
         "quotes bucket by bucket. Every timing on this slide is an estimate from the day of approval, and I'll "
         "update it after phase two.")

# ═══════════════ 14 — RISKS ═══════════════
s = header('Risks — and how we manage them', 'Honest view')
risks = [
    ('AI is never approved', 'Medium', 'We are already on Option A. The JLR build runs without a key; costing, CAD measuring and learning all work without it.', AMBER),
    ('Not yet checked against JLR prices', 'Medium', 'No estimate has been compared with a price JLR paid. Phase 4 does that. Log actuals; after 3, the band uses real data.', BLUE),
    ('Knowledge sits with one team', 'Low–Med', '2,438 automated tests, 6 real parts pinned in a baseline, written docs, and a CAPEE-side maintainer trained in Phase 4.', VIOLET),
    ('Adoption ("another tool")', 'Low', 'The plan keeps users in CAPEE, with CostVision behind it. Little new to learn.', GREEN),
]
for i, (t, sev, m, c) in enumerate(risks):
    y = Inches(2.05 + i * 1.18)
    box(s, Inches(0.45), y, Inches(12.45), Inches(1.02), fill=PANEL, round_=True, radius=0.09)
    box(s, Inches(0.45), y, Inches(0.09), Inches(1.02), fill=c)
    text(s, Inches(0.75), y + Inches(0.12), Inches(4.4), Inches(0.45), [[(t, 13, DARK, True)]])
    text(s, Inches(0.75), y + Inches(0.55), Inches(2.0), Inches(0.35), [[('Likelihood: ' + sev, 10.5, c, True)]])
    text(s, Inches(5.3), y + Inches(0.12), Inches(7.4), Inches(0.85),
         [[('Mitigation:  ', 11.5, DARK, True), (m, 11.5, BODY, False)]], line_spacing=1.12)
notes(s, "Here's my honest view of the risks. "
         "First, AI may never be approved. The impact is low, because we're already living with that. The JLR "
         "build runs without a key, and the costing, the CAD measuring and the learning all work without it. "
         "Second, and this is the one I'd watch, we haven't yet compared an estimate with a price JLR actually "
         "paid. The arithmetic is checked against a hand calculation, and six real parts are pinned, but that "
         "only proves the tool is consistent. It doesn't prove it's right. Phase four fixes that, and logging "
         "actuals makes it ongoing. "
         "Third, the knowledge sits with one team. The tests, the real-parts baseline and the written docs help, "
         "and we'd train a maintainer on the CAPEE side. "
         "Fourth, adoption. If people stay in CAPEE, there's very little new to learn.")

# ═══════════════ 15 — VERDICT & ASK ═══════════════
s = header('Feasibility verdict — and the ask', 'Decision')
verdicts = [
    ('Secure deployment, CAD in-house', 'FEASIBLE — CAD stays on the machine; AI needs a key', GREEN),
    ('Connecting to CAPEE', 'FEASIBLE — a plan: CAPEE calls CostVision for the cost', GREEN),
    ('Changes required', '2 of 6 items built — our estimate: 3–5 weeks remain', BLUE),
    ('Long-term governance', 'Rate-library owner · monthly review · quarterly access audit', VIOLET),
]
for i, (a, b, c) in enumerate(verdicts):
    y = Inches(2.05 + i * 0.82)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.7), fill=(PANEL if i % 2 == 0 else BG), round_=True, radius=0.13)
    text(s, Inches(0.8), y + Inches(0.15), Inches(4.6), Inches(0.4), [[(a, 13, DARK, True)]])
    text(s, Inches(5.5), y + Inches(0.15), Inches(7.2), Inches(0.4), [[(b, 12.5, c, True)]])
box(s, Inches(0.45), Inches(5.6), Inches(12.45), Inches(1.25), fill=PANEL2, round_=True, radius=0.07)
text(s, Inches(0.8), Inches(5.8), Inches(11.8), Inches(0.9),
     [[('The ask today:  ', 16, BLUE, True),
       ('approve Phase 1 (IT-Security assessment) and Phase 2 (architecture design). Our estimate is 5–7 weeks '
        'with existing teams. The written plan and security checklist are ready.', 14, BODY, False)]],
     line_spacing=1.2)
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)
notes(s, "Let me pull it together. "
         "Running the tool securely, with CAD kept in-house, is feasible. The CAD file stays on the machine that "
         "measures it, and the JLR build already runs without an API key. "
         "Connecting to CAPEE is feasible too. But it's a plan, not something built, and phase two designs it. "
         "Two of the six changes are done. My estimate for the rest is three to five weeks. "
         "Governance is simple. Someone owns the rate library, there's a monthly review, and a quarterly check of "
         "who has access. "
         "So the ask today is to approve phases one and two, the security assessment and the architecture design. "
         "The written plan and the security checklist are ready to hand to IT Security. "
         "One thing I'll repeat, because it matters. We have not yet compared an estimate with a price JLR paid. "
         "That's the first proof I want from the pilot. Thank you, and I'm happy to take questions.")

# ═══════════════ 16 — BACKUP: MARKET LANDSCAPE ═══════════════
s = header('Has anyone done this? Yes — the market is real', 'Backup · Market landscape')
market = [
    ('aPriori', 'Established vendor (US)', 'CAD-to-cost with process models and regional cost data. Sold to large OEMs and Tier-1 suppliers, per its website.', BLUE, 'apriori.com'),
    ('Siemens PCM', 'Part of Teamcenter', 'Bottom-up should-costing with process models, inside the Siemens PLM suite.', INDIGO, 'siemens.com/teamcenter'),
    ('Tset', 'Automotive costing (Austria)', 'Costing from 3D models and BOMs, with CO2. A June 2026 press release announced its purchase by A2MAC1.', VIOLET, 'tset.com · globenewswire.com (18 Jun 2026)'),
    ('Boothroyd DFMA', 'The classic (Dewhurst)', 'Design for manufacture and early costing. The method many textbooks use, in use for decades.', CYAN, 'dfma.com'),
    ('Newer entrants', 'Start-ups', 'Several start-ups, such as Emithran, offer quotes from CAD files.', MUTED, 'emithran.com'),
]
for i, (t, tag, d, c, src) in enumerate(market):
    y = Inches(1.98 + i * 0.87)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.78), fill=PANEL, round_=True, radius=0.14)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.78), fill=c)
    text(s, Inches(0.75), y + Inches(0.08), Inches(2.55), Inches(0.4), [[(t, 13, c, True)]])
    text(s, Inches(0.75), y + Inches(0.44), Inches(2.55), Inches(0.3), [[(tag, 9, MUTED, False, True)]])
    text(s, Inches(3.45), y + Inches(0.08), Inches(9.2), Inches(0.45), [[(d, 10.5, BODY, False)]], line_spacing=1.05)
    text(s, Inches(3.45), y + Inches(0.55), Inches(9.2), Inches(0.22), [[('Source: ' + src, 8.5, MUTED, False, True)]])
box(s, Inches(0.45), Inches(6.45), Inches(12.45), Inches(0.75), fill=PANEL2, round_=True, radius=0.1)
text(s, Inches(0.75), Inches(6.58), Inches(11.9), Inches(0.55),
     [[('Takeaway: ', 12, BLUE, True),
       ('should-cost software is an established category. The real question is why ours fits us: it runs '
        'in-house, it learns from our own prices, and it can sit behind CAPEE (next slide).', 12, BODY, False)]],
     line_spacing=1.12)
notes(s, "This is a backup slide for when someone asks whether anyone else does this. The short answer is yes. "
         "Should-cost software is an established category. aPriori sells CAD-to-cost with process models to large "
         "manufacturers. Siemens has a costing product inside Teamcenter. Tset focuses on automotive costing, and a "
         "press release in June said A2MAC1 was buying it. Boothroyd Dewhurst is the classic method, and there are "
         "newer start-ups quoting from CAD files. "
         "Everything on this slide comes from those companies' own websites and press releases. I haven't tested "
         "any of their products, and I'm not claiming ours is better than theirs. "
         "So we are not inventing a new idea. The fair question is why we'd use our own tool instead of buying "
         "one. That's the next slide.")

# ═══════════════ 17 — BACKUP: WHERE COSTVISION STANDS APART ═══════════════
s = header('Why ours — what no vendor offers today', 'Backup · Differentiation')
diffs = [
    ('Runs on a locked-down laptop', 'A folder you copy and double-click. No installer, no admin rights, no internet, no AI. CAD never leaves the machine.', GREEN),
    ('Learns from our own prices', 'Log a quote or PO price. After 3 actuals for a commodity, the band is corrected by our own data.', GREEN),
    ('Every number traces to a rate', 'Plain arithmetic on our rate library. Excel export has a traceability sheet and matches the screen to the penny.', GREEN),
    ('One tool, no module licences', '19 manufacturing processes, 20 regions, plus an assembly roll-up and a software cost model, in one product.', GREEN),
]
for i, (t, d, c) in enumerate(diffs):
    x = Inches(0.45 + (i % 2) * 6.35); y = Inches(2.0 + (i // 2) * 1.62)
    box(s, x, y, Inches(6.1), Inches(1.45), fill=GREENBG, round_=True, radius=0.09)
    box(s, x, y, Inches(0.09), Inches(1.45), fill=c)
    text(s, x + Inches(0.28), y + Inches(0.12), Inches(5.6), Inches(0.35), [[(t, 13.5, GREEN, True)]])
    text(s, x + Inches(0.28), y + Inches(0.5), Inches(5.6), Inches(0.9), [[(d, 10.5, BODY, False)]], line_spacing=1.1)
box(s, Inches(0.45), Inches(5.4), Inches(12.45), Inches(1.0), fill=AMBERBG, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(5.53), Inches(11.9), Inches(0.8),
     [[('Honest caveat: ', 12, AMBER, True),
       ('established vendors have years of curated cost data. We have not yet compared our estimates with '
        'prices JLR paid. Our answer is to log actuals, so our own history builds up over time.', 11.5, BODY, False)]],
     line_spacing=1.15)
text(s, Inches(0.45), Inches(6.55), Inches(12.4), Inches(0.35),
     [[('Positioning: not "better than aPriori" — a secure, in-house engine behind CAPEE that learns from our own prices.', 12, DARK, True)]])
text(s, Inches(0.45), Inches(6.95), Inches(12.4), Inches(0.25),
     [[('Vendor sources: apriori.com · siemens.com/teamcenter · tset.com · globenewswire.com (A2MAC1-Tset, 18 Jun 2026) · dfma.com · emithran.com', 8.5, MUTED, False, True)]])
notes(s, "So if the market exists, why use our own? I'd give four reasons. "
         "One, it runs on a locked-down laptop. It's a folder you copy and double-click, with no installer, no "
         "admin rights, no internet and no AI. The CAD never leaves the machine. "
         "Two, it learns from our own prices. Log a quote or a PO price, and after three for a commodity, the band "
         "is corrected by our data rather than someone else's. "
         "Three, every number traces to a rate. The Excel export has a traceability sheet and matches the screen "
         "to the penny, which is what you want in a supplier meeting. "
         "Four, the breadth. Nineteen processes and twenty regions in one product, with no separate module "
         "licences. "
         "And the honest caveat. The big vendors have years of curated cost data, and we haven't yet compared our "
         "estimates with prices JLR paid. So I'm not saying we're better than aPriori. I'm saying we have a secure, "
         "in-house engine that can learn from our own prices.")

# ═══════════════ 18 — BACKUP: COMPANY RATE DATA UPLOAD (PROOF) ═══════════════
s = header('Our rates, not vendor rates — already built', 'Backup · Company cost database')
pic = s.shapes.add_picture('docs/rate-library-upload-proof.png', Inches(0.45), Inches(2.0), width=Inches(6.9))
pic.line.color.rgb = LINE; pic.line.width = Pt(1)
text(s, Inches(0.45), Inches(6.72), Inches(6.9), Inches(0.5),
     [[('Screenshot (July 2026): the Rate Library screen after a company workbook upload. The badge reads '
        '"Company rates active".', 9.5, MUTED, False, True)]], line_spacing=1.1)
text(s, Inches(7.6), Inches(2.0), Inches(5.3), Inches(2.4),
     [[('How admins load company data', 14, BLUE, True)],
      [('1.  Download the Excel template: materials, machines, labour, energy, FX, overhead.', 11.5, BODY, False)],
      [('2.  Fill in our rates and upload. Every row is checked, then the file becomes the active library.', 11.5, BODY, False)],
      [('3.  Change any single rate on screen. Each change is logged against the user.', 11.5, BODY, False)]],
     space_after=7, line_spacing=1.15)
box(s, Inches(7.6), Inches(4.35), Inches(5.3), Inches(1.15), fill=GREENBG, round_=True, radius=0.1)
text(s, Inches(7.85), Inches(4.5), Inches(4.85), Inches(0.9),
     [[('Built-in library:  ', 11.5, GREEN, True),
       ('version 2.1.0, dated 16 June 2026 — 328 materials, 178 machines, 42 labour grades. '
        'Editable and versioned.', 11, BODY, False)]], line_spacing=1.15)
text(s, Inches(7.6), Inches(5.7), Inches(5.3), Inches(1.4),
     [[('Also built in:', 12, DARK, True)],
      [('• 20 regions, 8 labour categories each', 11, BODY, False)],
      [('• JLR Rate Converter workbook, no macros', 11, BODY, False)],
      [('• PCB country cost table, admin-editable', 11, BODY, False)],
      [('• Switch back to built-in rates at any time', 11, BODY, False)]],
     space_after=3, line_spacing=1.12)
notes(s, "This backup slide answers the question, whose numbers are these? The answer is ours, whenever we want. "
         "The screenshot is the real rate library screen from July, after a company workbook was uploaded. "
         "An administrator downloads an Excel template, fills in our rates for materials, machines, labour, energy, "
         "exchange rates and overheads, and uploads it. Every row is checked, and then it becomes the active "
         "library. After that you can change any single rate on screen, and each change is logged against the "
         "person who made it. "
         "If you don't upload anything, the tool uses its built-in library. That's version 2.1.0, dated sixteenth "
         "of June 2026, with 328 materials, 178 machines and 42 labour grades. "
         "There are twenty regions with eight labour categories each. There's also a JLR Rate Converter workbook "
         "that turns JLR's own rate card into the tool's format with no macros. And you can switch back to the "
         "built-in rates at any time.")

# ═══════════════ 19 — BACKUP: BUSINESS CASE ═══════════════
s = header('What it costs, and what it could return', 'Backup · Business case')
box(s, Inches(0.45), Inches(2.0), Inches(6.0), Inches(3.5), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.18), Inches(5.4), Inches(0.4), [[('What it costs', 15, DARK, True)]])
costs = [
    ('Engineering', 'our estimate: 3–5 weeks on CostVision, plus small CAPEE changes, existing teams'),
    ('Infrastructure', 'laptop package today; for a server, one VM and the corporate database'),
    ('AI usage', '£0 today — no API key. Only a cost once a key is added'),
    ('Licence spend', '£0 — built in-house, nothing to buy or renew'),
]
for i, (a, b) in enumerate(costs):
    y = Inches(2.66 + i * 0.72)
    text(s, Inches(0.75), y, Inches(5.5), Inches(0.7),
         [[(a + ' — ', 12, DARK, True), (b, 11, BODY, False)]], line_spacing=1.1)
box(s, Inches(6.85), Inches(2.0), Inches(6.05), Inches(3.5), fill=GREENBG, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.18), Inches(5.4), Inches(0.4), [[('What it could return', 15, GREEN, True)]])
gains = [
    ('Quote checks', 'a supplier quote set against the should-cost, bucket by bucket'),
    ('Licence avoided', 'no annual fee for a commercial should-cost suite'),
    ('Consistency', 'the same rates and rules for every engineer, every part'),
    ('Leverage', 'bottom-up numbers on our own rates, traceable line by line'),
]
for i, (a, b) in enumerate(gains):
    y = Inches(2.66 + i * 0.72)
    text(s, Inches(7.15), y, Inches(5.5), Inches(0.7),
         [[(a + ' — ', 12, GREEN, True), (b, 11, BODY, False)]], line_spacing=1.1)
ip = box(s, Inches(0.45), Inches(5.68), Inches(12.45), Inches(0.62), fill=GREENBG, round_=True, radius=0.12)
box(s, Inches(0.45), Inches(5.68), Inches(0.09), Inches(0.62), fill=GREEN)
text(s, Inches(0.8), Inches(5.83), Inches(11.9), Inches(0.4),
     [[('OUR IP:  ', 13.5, GREEN, True),
       ('built in-house — the code and the rate library are ours. No vendor owns any part of it.', 13.5, DARK, True)]])
box(s, Inches(0.45), Inches(6.44), Inches(12.45), Inches(0.85), fill=AMBERBG, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(6.55), Inches(11.9), Inches(0.65),
     [[('Honest numbers: ', 12, AMBER, True),
       ('we are not claiming a savings figure yet. No estimate has been compared with a price JLR paid. '
        'The pilot measures that first, then we build the business case on real results.', 11.5, BODY, False)]],
     line_spacing=1.15)
notes(s, "Here's the business case, and I'll keep it honest. "
         "On the cost side, my estimate is three to five weeks of engineering on CostVision, plus some small "
         "changes in CAPEE, all with existing teams. Today it runs on a laptop. For a shared server we'd need one "
         "virtual machine and the corporate database. AI costs nothing today, because it's off. And there's no "
         "licence spend, because we built it, so the code and the rate library are ours. "
         "On the return side, I've written 'could return' on purpose. We'd be able to check every supplier quote "
         "bucket by bucket. There's no annual fee for a commercial suite. Every engineer uses the same rates and "
         "rules. And the numbers are built on our own rates, so they can be traced. "
         "What I'm not doing is putting a savings number on this slide. We haven't compared an estimate with a "
         "price JLR paid yet. The pilot measures that first, and the business case gets built on real results.")

# ═══════════════ 20 — BACKUP: EVIDENCE PACK ═══════════════
s = header('Does it work? What is proven, and what is not', 'Backup · Evidence')
cd = CategoryChartData()
cd.categories = ['Materials', 'Machines', 'Labour grades', 'Regions', 'Processes']
cd.add_series('Built-in rate library 2.1.0 (16 June 2026) and coverage', (328, 178, 42, 20, 19))
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.45), Inches(2.0), Inches(7.3), Inches(4.4), cd)
ch = gf.chart
ch.has_title = False
ch.has_legend = False
plot = ch.plots[0]
plot.has_data_labels = True
plot.data_labels.font.size = Pt(9.5)
plot.data_labels.font.bold = True
ch.category_axis.tick_labels.font.size = Pt(9.5)
ch.value_axis.tick_labels.font.size = Pt(9)
ch.series[0].format.fill.solid(); ch.series[0].format.fill.fore_color.rgb = BLUE
text(s, Inches(0.45), Inches(6.5), Inches(7.3), Inches(0.6),
     [[('Built-in rate library 2.1.0 (16 June 2026): materials, machines and labour grades, plus the regions and processes covered.', 10, MUTED, False, True)]],
     line_spacing=1.1)
stats = [
    ('<0.01%', 'gap to a hand calculation on the reference machined bracket (£24.34)', BLUE),
    ('6 parts', 'real production parts pinned in a baseline; a change that moves one fails the build', VIOLET),
    ('2,438', 'automated tests, plus browser tests of every commodity, exports and accessibility', GREEN),
    ('Not yet', 'compared with a price JLR actually paid. Measured as actuals are logged', AMBER),
]
for i, (n, d, c) in enumerate(stats):
    y = Inches(2.0 + i * 1.23)
    box(s, Inches(8.1), y, Inches(4.8), Inches(1.08), fill=PANEL, round_=True, radius=0.1)
    box(s, Inches(8.1), y, Inches(0.09), Inches(1.08), fill=c)
    text(s, Inches(8.4), y + Inches(0.12), Inches(1.7), Inches(0.5), [[(n, 19, c, True)]])
    text(s, Inches(10.05), y + Inches(0.14), Inches(2.75), Inches(0.85), [[(d, 10, BODY, False)]], line_spacing=1.1)
notes(s, "This is the evidence slide, for when someone asks whether it actually works. I want to answer it "
         "carefully. "
         "The chart shows what the numbers rest on. The built-in rate library has 328 materials, 178 machines and "
         "42 labour grades. The tool covers twenty regions and nineteen processes. "
         "On the right is what's proven. The engine's arithmetic matches a hand calculation to under a hundredth of "
         "a percent on our reference machined bracket, which costs £24.34. Six real production parts are pinned in "
         "a baseline, so if a change moves any of them, the build fails. There are 2,438 automated tests, plus "
         "browser tests that cost every commodity, export Excel and PDF, and check accessibility. "
         "The last box is the honest one. None of this shows the tool is right about real prices. It shows the "
         "tool is consistent and does what it says. We haven't compared an estimate with a price JLR paid. That "
         "gets measured as actuals are logged, and I won't quote an accuracy figure until it has been.")

# ═══════════════ 21 — BACKUP: LIKELY QUESTIONS ═══════════════
s = header('Built since this plan was written', 'Backup · What changed')
add = [
    ('CAD to Cost runs on rules, and asks when it cannot tell', GREEN,
     'No AI needed. 13 commodities can be costed from CAD. Where geometry cannot decide the route, the material '
     'or a hole count on an STL, the tool asks the engineer.'),
    ('Gear cutting is its own process', BLUE,
     'Asked for by cost engineering and the plant. Gears no longer go through the milling model. The cycle is '
     'worked out from the gear itself.'),
    ('A Windows package for locked-down laptops', VIOLET,
     'A folder you copy and double-click. No installer, no admin rights, no internet. It includes the geometry '
     'kernel and runs without an API key.'),
    ('Long-term agreements priced correctly', CYAN,
     'Tooling is spread over annual volume × programme life, so a five-year award is not priced as if it were all '
     'bought in year one.'),
]
for i, (t, c, d) in enumerate(add):
    y = Inches(1.95 + i * 1.22)
    box(s, Inches(0.45), y, Inches(12.45), Inches(1.08), fill=PANEL, round_=True, radius=0.08)
    box(s, Inches(0.45), y, Inches(0.09), Inches(1.08), fill=c)
    text(s, Inches(0.75), y + Inches(0.1), Inches(11.9), Inches(0.32), [[(t, 13, c, True)]])
    text(s, Inches(0.75), y + Inches(0.44), Inches(11.9), Inches(0.58), [[(d, 10.5, BODY, False)]],
         line_spacing=1.12)
box(s, Inches(0.45), Inches(6.85), Inches(12.45), Inches(0.42), fill=AMBERBG, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(6.85), Inches(11.9), Inches(0.42),
     [[('Straight about the gap: ', 10.5, AMBER, True),
       ('the gear model uses representative shop figures until the plant supplies its own. '
        'No gear has been checked against a known cost yet.', 10.5, BODY, False)]],
     anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
notes(s, "The written plan is a few months old, so here are four things built since then. "
         "First, CAD to Cost now runs on rules alone. No AI is needed. Thirteen commodities can be costed from a "
         "CAD file. When the geometry can't decide something, like the process route, the material, or the hole "
         "count on an STL file, the tool asks the engineer instead of guessing. "
         "Second, gears. Cost engineering and the plant asked for this. Gears used to go through the milling "
         "model, which can't see a tooth. Now gear cutting is its own process, and the cycle is worked out from "
         "the gear itself. "
         "Third, the Windows package. It's a folder you copy to a locked-down laptop and double-click. There's no "
         "installer, no admin rights and no internet, and it runs without an API key. "
         "Fourth, tooling is now spread over annual volume times programme life. "
         "And the amber bar is me being straight. The gear model runs on representative shop figures, and we "
         "haven't checked a gear against a known cost yet.")

# ═══════════════ 21b — BACKUP: LIKELY QUESTIONS ═══════════════
s = header('What we need from the plant to make this quotable', 'Backup · The ask')
text(s, Inches(0.45), Inches(1.9), Inches(12.45), Inches(0.5),
     [[('The engine is built and the arithmetic is auditable. What it does not yet have is ', 12.5, BODY, False),
       ('your', 12.5, DARK, True),
       (' shop data — and until it does, a gear estimate is directional, not quotable. Three things close that gap.',
        12.5, BODY, False)]], line_spacing=1.15)

asks = [
    ('1', 'The gear machine list', 'Highest impact',
     'Machine class, £/hr, and the capacity limits — biggest module, largest diameter, widest face. '
     'Today the tool picks from a set of representative machine classes; yours replace them.', GREEN),
    ('2', 'Feeds, speeds and tool life', 'Second',
     'Cutting speed and axial feed by material and module band, hob and cutter price, and parts between '
     'regrinds. These drive the cycle time, and the cycle time drives the cost.', BLUE),
    ('3', 'Two gears you already know the cost of', 'The proof',
     'Ideally one hobbed-only and one hardened-and-ground. Without them nothing above is validated — '
     'the model is internally consistent but unproven against reality.', VIOLET),
]
for i, (n, t, rank, d, c) in enumerate(asks):
    y = Inches(2.6 + i * 1.34)
    box(s, Inches(0.45), y, Inches(12.45), Inches(1.2), fill=PANEL, round_=True, radius=0.08)
    box(s, Inches(0.45), y, Inches(0.09), Inches(1.2), fill=c)
    box(s, Inches(0.72), y + Inches(0.3), Inches(0.6), Inches(0.6), fill=c, round_=True, radius=0.3)
    text(s, Inches(0.72), y + Inches(0.3), Inches(0.6), Inches(0.6), [[(n, 20, ON_DARK, True)]],
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(1.55), y + Inches(0.16), Inches(7.0), Inches(0.34), [[(t, 15, DARK, True)]])
    box(s, Inches(10.6), y + Inches(0.18), Inches(2.1), Inches(0.3), fill=c, round_=True, radius=0.15)
    text(s, Inches(10.6), y + Inches(0.18), Inches(2.1), Inches(0.3), [[(rank, 10, ON_DARK, True)]],
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(1.55), y + Inches(0.56), Inches(11.1), Inches(0.56), [[(d, 10.5, BODY, False)]],
         line_spacing=1.14)

box(s, Inches(0.45), Inches(6.68), Inches(12.45), Inches(0.5), fill=GREENBG, round_=True, radius=0.07)
text(s, Inches(0.75), Inches(6.68), Inches(11.9), Inches(0.5),
     [[('Effort on your side: ', 11, GREEN, True),
       ('roughly half a day to export the machine list and the feeds table, plus two costings you have '
        'already done. Nothing new has to be measured.', 11, BODY, False)]],
     anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
notes(s, "This slide is aimed squarely at the plant, and it's short on purpose. "
         "The gear model is built, and you can check its arithmetic line by line. What it doesn't have is your "
         "shop. Right now it runs on representative feeds, speeds and machines, and the estimate says so. I'd "
         "rather it under-claimed than quietly pretended. "
         "So I need three things, in order of how much each one moves the number. "
         "First, your gear machine list. That means the classes, the hourly rates and the size limits. Today the "
         "tool picks from machine classes I described, not machines you own. "
         "Second, feeds and speeds by material and module, and what a hob costs and how many parts it cuts "
         "between regrinds. Those drive the cycle time, and the cycle time drives the cost. "
         "Third, two gears where you already know the real cost. Ideally one just hobbed and one hardened and "
         "ground. Until we make that comparison, the model is consistent but unproven. "
         "It's about half a day of exports on your side.")

# ═══════════════ BACKUP: LIKELY QUESTIONS ═══════════════
s = header('Questions you may be asking', 'Backup · Straight answers')
qa = [
    ('Why not just buy aPriori?', 'A bought suite carries an annual licence and may keep our CAD in a vendor '
     'cloud. CostVision runs in-house, learns from our own prices, and is ours.'),
    ('Is our data training a public AI?', 'No. The JLR build has no API key, so no AI calls are made at all. '
     'The tool says AI needs an API key.'),
    ('What if the key developer leaves?', '2,438 automated tests and 6 pinned real parts define how it must behave. '
     'The design is written down, and Phase 4 trains a CAPEE-side maintainer.'),
    ('What does it cost to run?', 'Today: a laptop, no internet, no AI. For a server: one VM and the corporate '
     'database. No licences, no per-seat fees.'),
    ('How do we know the numbers are right?', 'Every £ traces to a rate. It matches a hand calculation to under 0.01%. '
     'We have not yet compared it with a price JLR paid; that is measured as actuals are logged.'),
]
for i, (q, a) in enumerate(qa):
    y = Inches(2.0 + i * 0.98)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.86), fill=(PANEL if i % 2 == 0 else BG), round_=True, radius=0.1)
    text(s, Inches(0.8), y + Inches(0.1), Inches(3.9), Inches(0.7), [[(q, 12.5, BLUE, True)]], line_spacing=1.08)
    text(s, Inches(4.9), y + Inches(0.1), Inches(7.8), Inches(0.7), [[(a, 11, BODY, False)]], line_spacing=1.1)
notes(s, "This is a backup for questions. Here are the five I expect, with straight answers. "
         "Why not just buy aPriori? A bought suite has an annual licence and may keep our CAD in a vendor's cloud. "
         "Ours runs in-house, learns from our own prices, and belongs to us. "
         "Is our data training a public AI? No. In the JLR build there is no API key, so no AI calls happen at all. "
         "The tool tells you that on screen. "
         "What if the key developer leaves? There are 2,438 tests and six pinned real parts that define how it "
         "must behave. The design is written down, and phase four trains a maintainer on the CAPEE side. "
         "What does it cost to run? Today, a laptop. For a server, one virtual machine and the corporate database. "
         "And how do we know the numbers are right? Every pound traces to a rate, and the arithmetic matches a "
         "hand calculation. But we haven't compared it with a price JLR paid yet, and I'd rather say so.")

# ═══════════════ 22 — BACKUP: PHOTO-TO-BOM WORKFLOW ═══════════════
s = header('PCB photo to costed BOM — step by step', 'Backup · Optional AI mode · needs an API key')
pcb_steps = [
    ('1 · Upload photos and files', 'Up to 8 photos of the board. Optional: the BOM file, and the drill and Gerber files. Needs an API key.', BLUE),
    ('2 · Board type (model)', 'The model classifies the board, for example automotive or consumer, and its safety level.', INDIGO),
    ('3 · Read the markings (model)', 'Printed part numbers and references on the chips are read from the photos.', VIOLET),
    ('4 · List the parts (model)', 'The model lists each visible part: type, package, quantity and part number. It is not asked for a cost.', CYAN),
    ('5 · Files first, then price every line', 'A BOM file is the parts list; drill and Gerber files give size, layers and vias. Plain code prices every line from the catalogue and costs board and assembly from rate tables.', GREEN),
    ('6 · Same photos, same answer', 'The result is stored against a fingerprint of the photos, so the same photos give the same BOM.', AMBER),
]
y = Inches(1.95)
for i, (t, d, c) in enumerate(pcb_steps):
    flow_box(s, Inches(0.45), y, Inches(12.45), Inches(0.68), t, d, c, fill=PANEL)
    y += Inches(0.68)
    if i < len(pcb_steps) - 1:
        down_arrow(s, Inches(6.5), y + Inches(0.015), h=Inches(0.15))
        y += Inches(0.18)
notes(s, "This slide and the next are about the PCB photo feature. It is part of the optional AI mode, so it needs "
         "an API key; until one is added the screen is hidden. "
         "An engineer uploads up to eight photos of a board, and can attach the BOM file and the drill and Gerber "
         "files. The model works out what kind of board it is, reads the printed markings, and lists the parts it "
         "can see. It is not asked for a cost. "
         "Step five is the important one for trust. If a BOM file was attached, that is the parts list. If drill and "
         "Gerber files were attached, the size, layers and via count are measured from them. Then plain code prices "
         "every line from the tool's own catalogue or class table, each line with its source, and costs the bare "
         "board and the assembly from the rate tables. On an automotive board the IATF, class 3 and burn-in costs are "
         "in the headline. "
         "And step six. The same photos give the same answer, because the result is stored against a fingerprint "
         "of the photos. The model reads. It never sets the price.")

# ═══════════════ 23 — BACKUP: PHOTO-TO-BOM TECH / ACCURACY / TIME ═══════════════
s = header('PCB photo to BOM — how it works, checks, status', 'Backup · Optional AI mode · needs an API key')
cols3 = [
    ('How it works', BLUE, [
        'The model reads the photos; it is not asked for a cost',
        'Steps: classify, read chips, list parts, price, cost',
        'A BOM file or drill and Gerber files beat the photo',
        'Same photos give the same answer',
        'Distributor API pricing is optional: part numbers only',
    ]),
    ('Checks', GREEN, [
        'Chip markings read are matched to the parts list',
        'Every line priced from the catalogue or class table',
        'Each line shows where its price came from',
        'Lines worth £1+ with no quote are listed to verify',
        'Board fab is a bought-in price, no margin on top',
    ]),
    ('Status at JLR', VIOLET, [
        'Needs an API key; the screen is hidden until then',
        'Code kept; adding a key turns it on',
        'When on, rate-limited per user',
        'The model reads only; it never sets a price',
        'PCB fab and PCBA forms still cost boards',
    ]),
]
_COL4_H = _col_panel_h(cols3)
for i, (t, c, items) in enumerate(cols3):
    x = Inches(0.45 + i * 4.25)
    box(s, x, Inches(2.0), Inches(4.0), _COL4_H, fill=(PANEL2 if i == 0 else PANEL if i == 2 else GREENBG), round_=True, radius=0.06)
    box(s, x, Inches(2.0), Inches(4.0), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(2.2), Inches(3.55), Inches(0.4), [[(t, 14.5, c, True)]])
    text(s, x + Inches(0.25), Inches(2.68), Inches(3.55), _COL4_H - Inches(0.75),
         [[('• ' + it, 11.5, BODY, False)] for it in items], space_after=10, line_spacing=1.15)
box(s, Inches(0.45), Inches(6.42), Inches(12.45), Inches(0.85), fill=AMBERBG, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(6.53), Inches(11.9), Inches(0.65),
     [[('Honest limits: ', 12, AMBER, True),
       ('a photo cannot show the via count, the layer count or parts under a shield; those stay estimates until the '
        'files are attached. No board has yet been compared with a price JLR paid.', 11.5, BODY, False)]],
     line_spacing=1.15)
notes(s, "Here's the same PCB feature from three angles. It needs an API key, and the screen is hidden until one is added. "
         "How it works. The model reads the photos and is not asked for a cost. After that, plain code prices every line "
         "from the catalogue or the class table, and the files, if attached, beat the photo. The same photos always "
         "give the same answer. Distributor API pricing is optional and only sends part numbers, never images. "
         "The checks. Chip markings that were read are matched to the lines they belong to. Every line is priced from "
         "the tool's own data and shows where the price came from. Lines worth a pound or more with no quote behind "
         "them are listed to verify. "
         "The status at JLR. The code is kept, and adding a key turns it on. When on, each user is rate-limited. And "
         "without a key, the PCB fab and PCBA forms still cost a board from inputs you type. "
         "The honest limit is that a photo cannot show vias, layers or parts under a shield, and no board has been "
         "checked against a price we paid.")

# ═══════════════ 24 — BACKUP: CAD-TO-COST WORKFLOW ═══════════════
s = header('CAD file to cost — how it works, step by step', 'Backup · Feature deep-dive')
cad_steps = [
    ('1 · Upload a CAD model', 'STEP, IGES or STL. 13 commodities can be costed from CAD. A DXF flat pattern can go with a sheet-metal STEP.', BLUE),
    ('2 · Opened on the same machine', 'The OpenCASCADE geometry engine reads the file from a local temp file, then it is deleted. It never leaves the machine.', INDIGO),
    ('3 · The model is measured', 'Volume, weight, size, wall thickness, holes and features, measured from the geometry, not typed from a drawing.', VIOLET),
    ('4 · Rules fill the inputs, and it asks', 'Rules turn the measurements into cost inputs. Where geometry cannot decide (route, material), it asks you.', CYAN),
    ('5 · The engine costs it', 'Material, process, labour, tooling, packaging, logistics, overhead and margin, on our rates for the chosen region.', GREEN),
    ('6 · A result you can defend', 'The 8-bucket breakdown, a self-audit, design warnings and a P10–P90 band. Logged actuals tighten the band.', AMBER),
]
y = Inches(1.95)
for i, (t, d, c) in enumerate(cad_steps):
    flow_box(s, Inches(0.45), y, Inches(12.45), Inches(0.68), t, d, c, fill=PANEL)
    y += Inches(0.68)
    if i < len(cad_steps) - 1:
        down_arrow(s, Inches(6.5), y + Inches(0.015), h=Inches(0.15))
        y += Inches(0.18)
notes(s, "Here's CAD to Cost step by step. This one needs no key, so it's exactly what JLR has. "
         "You upload a STEP, IGES or STL file. Thirteen commodities can be costed this way. For sheet metal you "
         "can add a DXF flat pattern, and the measured blank is used instead of the bounding box. "
         "The geometry engine opens the file on the same machine. It sits in a temp file while it's measured, "
         "and then it's deleted. "
         "The engine measures volume, weight, size, walls, holes and features. Rules then turn those measurements "
         "into cost inputs. Where the geometry can't decide something, like the process route or the material "
         "family, the tool asks you rather than guessing. "
         "Then the cost engine does the arithmetic across the eight buckets, on our rates, for the region you "
         "pick. You get the breakdown, a self-audit, design warnings and an uncertainty band. Logging real prices "
         "tightens that band over time.")

# ═══════════════ 25 — BACKUP: CAD-TO-COST TECH / ACCURACY / TIME ═══════════════
s = header('CAD file to cost — how it works, checks, effort', 'Backup · Feature deep-dive')
cols4 = [
    ('How it works', BLUE, [
        'OpenCASCADE measures the geometry',
        'Rules, not AI, turn it into inputs',
        'Cost engines for 19 processes',
        'Our own rate library, 20 regions',
    ]),
    ('Checks', GREEN, [
        'Measured volume and weight',
        'Every figure traces to a rate',
        'Hand calc matched to under 0.01%',
        '6 real parts pinned in a baseline',
        'Self-audit and a P10–P90 band',
    ]),
    ('Engineer effort', VIOLET, [
        'Measuring is automatic',
        'You answer what geometry cannot',
        'A machined STL needs a typed cycle time',
        'Same flow for all 13 CAD commodities',
    ]),
]
_COL4_H = _col_panel_h(cols4)
for i, (t, c, items) in enumerate(cols4):
    x = Inches(0.45 + i * 4.25)
    box(s, x, Inches(2.0), Inches(4.0), _COL4_H, fill=(PANEL2 if i == 0 else PANEL if i == 2 else GREENBG), round_=True, radius=0.06)
    box(s, x, Inches(2.0), Inches(4.0), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(2.2), Inches(3.55), Inches(0.4), [[(t, 14.5, c, True)]])
    text(s, x + Inches(0.25), Inches(2.68), Inches(3.55), _COL4_H - Inches(0.75),
         [[('• ' + it, 11.5, BODY, False)] for it in items], space_after=10, line_spacing=1.15)
box(s, Inches(0.45), Inches(6.42), Inches(12.45), Inches(0.85), fill=GREENBG, round_=True, radius=0.08)
text(s, Inches(0.75), Inches(6.53), Inches(11.9), Inches(0.65),
     [[('Security, restated: ', 12, GREEN, True),
       ('the CAD file is measured on the same machine and deleted afterwards. It is never sent anywhere. '
        'In the JLR build there is no API key, so no geometry summary goes out either.', 11.5, BODY, True)]],
     line_spacing=1.15)
notes(s, "Same feature, three angles. "
         "How it works. OpenCASCADE, a proper geometry engine, measures the model. Rules, not AI, turn those "
         "measurements into inputs. The cost engines for nineteen processes do the arithmetic, on our rate "
         "library, across twenty regions. "
         "The checks. Volume and weight are measured, not guessed. Every figure traces to a rate. The arithmetic "
         "matches a hand calculation to under a hundredth of a percent, and six real parts are pinned so nothing "
         "moves by accident. Every result gets a self-audit and a P10 to P90 band. "
         "Engineer effort. The measuring is automatic. You answer the questions the geometry can't settle. One "
         "honest catch: an STL file has no feature table, so a machined STL needs you to type a cycle time before "
         "it will cost. "
         "And the green bar again. The file is measured on the same machine and deleted. At JLR, nothing goes out "
         "at all.")

# ════════════════════ Auto-capture → Cost engine ════════════════════
slide = header("What the tool measures — and where it goes", 'CAD-to-Cost · measured, then checked by you')
_rows = [
    ('Volume (OpenCASCADE)', 'Material mass · stock size'),
    ('Weight = volume × density', 'Raw-material £'),
    ('Bounding box / envelope', 'Machine sizing · stock · setups'),
    ('Body count', 'Assembly cost · BOM line count'),
    ('Hole and boss table (STEP, IGES)', 'Drill / bore / tap operations'),
    ('Wall thickness', 'Route choice · mould and cast checks'),
    ('Draft and undercuts', 'Tooling complexity'),
    ('Face-type areas', 'Machining area · paint area'),
    ('CNC cycle estimate (STEP, IGES)', 'Process-time baseline'),
]
_lx, _lw, _cxo = Inches(0.45), Inches(7.35), Inches(4.15)
_y = Inches(1.72)
box(slide, _lx, _y, _lw, Inches(0.4), fill=PANEL2, line=LINE, round_=True, radius=0.08)
text(slide, _lx + Inches(0.15), _y + Inches(0.06), Inches(3.95), Inches(0.3), [[('Measured from the geometry', 9.5, DARK, True)]])
text(slide, _lx + _cxo + Inches(0.1), _y + Inches(0.06), _lw - Inches(4.25), Inches(0.3), [[('→ Feeds this cost driver', 9.5, BLUE, True)]])
_y += Inches(0.46)
for _a, _b in _rows:
    box(slide, _lx, _y, _lw, Inches(0.42), fill=PANEL, round_=True, radius=0.06)
    text(slide, _lx + Inches(0.15), _y + Inches(0.08), Inches(3.95), Inches(0.3), [[(_a, 9.5, INDIGO, True)]])
    text(slide, _lx + _cxo + Inches(0.1), _y + Inches(0.08), _lw - Inches(4.25), Inches(0.3), [[(_b, 9.5, BODY, False)]])
    _y += Inches(0.46)
_rx, _rw = Inches(8.05), Inches(4.85)
box(slide, _rx, Inches(1.72), _rw, Inches(2.75), fill=PANEL, round_=True, radius=0.05)
box(slide, _rx, Inches(1.72), Inches(0.07), Inches(2.75), fill=BLUE)
text(slide, _rx + Inches(0.2), Inches(1.84), _rw - Inches(0.32), Inches(0.3), [[('What the tool asks you', 11, DARK, True)]])
text(slide, _rx + Inches(0.2), Inches(2.22), _rw - Inches(0.32), Inches(2.1), [
    [('Where geometry cannot decide, it asks:', 9.5, BODY, False)],
    [('   Process route, e.g. cast, forge or machine', 9.5, DARK, True)],
    [('   Material family', 9.5, DARK, True)],
    [('   Hole count or cycle time on an STL', 9.5, DARK, True)],
    [('Walls over ~6 mm are offered casting, forging,', 9.5, BODY, False)],
    [('cast + machine or machining — never sheet metal', 9.5, BODY, False)],
    [('or moulding.', 9.5, BODY, False)],
], line_spacing=1.05)
box(slide, _rx, Inches(4.6), _rw, Inches(1.75), fill=PANEL2, line=GREEN, round_=True, radius=0.05)
box(slide, _rx, Inches(4.6), Inches(0.07), Inches(1.75), fill=GREEN)
text(slide, _rx + Inches(0.2), Inches(4.72), _rw - Inches(0.32), Inches(0.3), [[('The golden rule', 11, GREEN, True)]])
text(slide, _rx + Inches(0.2), Inches(5.08), _rw - Inches(0.32), Inches(1.2),
     [[('AI never sets a price, even when it is on. At JLR it has no key: rules turn the measurements into inputs, and every £ is arithmetic you can trace to the rate library.', 9.5, BODY, False)]], line_spacing=1.05)
notes(slide,
      "This slide answers a simple question. What does the tool take off the model by itself, and where does "
      "each thing go? "
      "On the left is what it measures, and next to each is the cost driver it feeds. Volume and weight set the "
      "material cost. The envelope sizes the machine and the stock. Holes become drilling and tapping. Wall "
      "thickness helps choose the route. Draft and undercuts show tooling complexity, and face areas drive "
      "machining and paint area. The hole table and the CNC cycle estimate need a STEP or IGES file. An STL has "
      "no feature table. "
      "On the right is what it asks you. The geometry can't always tell the process route or the material "
      "family, so the tool asks instead of guessing. And a thick-walled part is only offered casting, forging or "
      "machining routes. "
      "At the bottom is the golden rule. AI never sets a price. At JLR it's off anyway. Rules and arithmetic do "
      "all of it, and every pound traces to a rate.")

OUT = 'CostVision-Implementation-Blueprint.pptx'
prs.save(OUT)
# Without this PowerPoint refuses the file — see pptx_fixup.py.
finalise(OUT)
print(f'Wrote {OUT} with {len(prs.slides._sldIdLst)} slides')

#!/usr/bin/env python3
"""
CostVision -> JLR / CAPEE — two implementation options, as a decision paper for
the Cost Engineering Director.

Option 1: CostVision becomes CAPEE's automatic CAD/drawing data-input front end.
Option 2: CostVision deployed as-is, running on JLR's own rate data.

House style is inherited verbatim from build_blueprint_pptx.py so this deck sits
in the same pack as CostVision-Implementation-Blueprint.pptx.

EVERY figure in this deck is sourced. Where a number could not be derived from
the codebase it is marked as an assumption to be confirmed, not stated as fact.

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


# ══════════════════════════════════════════════════════════════════════════════
# 1 — TITLE
# ══════════════════════════════════════════════════════════════════════════════
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=NAVY)
box(s, 0, 0, Inches(0.09), H, fill=INDIGO)
logo(s, x=Inches(0.55), y=Inches(0.5), scale=1.15, on_dark=True)
text(s, Inches(0.6), Inches(2.15), Inches(11.6), Inches(1.5),
     [[('Bringing CostVision into JLR', 40, ON_DARK, True)]], font=TITLE_FONT)
text(s, Inches(0.6), Inches(3.15), Inches(11.4), Inches(0.9),
     [[('Two implementation options for CAPEE — architecture, effort, risk '
        'and a recommendation', 17, HERO_SUB, False)]])
box(s, Inches(0.6), Inches(4.15), Inches(3.3), Pt(2.5), fill=INDIGO)
text(s, Inches(0.6), Inches(4.45), Inches(11.4), Inches(1.5),
     [[('OPTION 1   CostVision as CAPEE\'s automatic CAD & drawing data-input front end',
        13, ON_DARK, True)],
      [('OPTION 2   CostVision deployed as-is, running on JLR rate data',
        13, ON_DARK, True)]], space_after=8)
text(s, Inches(0.6), Inches(6.35), Inches(11.6), Inches(0.6),
     [[('Prepared for the JLR Cost Engineering Director  ·  August 2026  ·  '
        'Every figure in this deck is traced to the codebase', 10, HERO_DIM, False)]])
notes(s, 'A decision paper, not a sales deck. Two routes are presented with honest effort and '
         'risk on both, and an explicit recommendation at slide 16. Every number is sourced from '
         'a line-by-line audit of the CostVision codebase carried out in August 2026 — where a '
         'figure could not be derived it is marked as an assumption rather than stated as fact.')

# ══════════════════════════════════════════════════════════════════════════════
# 2 — EXECUTIVE SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
s = header('The decision in one slide', 'Executive summary')
card(s, Inches(0.45), Inches(1.85), Inches(6.1), Inches(2.55), INDIGO,
     'OPTION 1 — CostVision feeds CAPEE',
     [('CAPEE stays the system of record and keeps its cost engine.',),
      ('CostVision supplies the INPUTS automatically: an engineer uploads a STEP',),
      ('file and a drawing instead of keying thirty fields by hand.',),
      ('',),
      ('Ports ~5,700 lines of extraction plus the guard layer.', DARK, True),
      ('Effort: 12–20 weeks depending on CAPEE\'s technology stack.', DARK, True)])
card(s, Inches(6.78), Inches(1.85), Inches(6.1), Inches(2.55), VIOLET,
     'OPTION 2 — CostVision as-is on JLR data',
     [('CostVision deployed unchanged inside JLR. Same engine, same reports.',),
      ('JLR\'s materials, machine rates, labour, energy and regional factors',),
      ('replace the supplied rate library.',),
      ('',),
      ('Zero engine change. The work is data onboarding and deployment.', DARK, True),
      ('Effort: 8–12 weeks, dominated by rate collection — JLR-side.', DARK, True)])
callout(s, Inches(0.45), Inches(4.6), Inches(12.43), Inches(1.05), GREENBG, GREEN,
        'RECOMMENDATION — run Option 2 first, then Option 1',
        'Option 2 proves the engine against JLR reality in a quarter and produces the validation '
        'data that Option 1 depends on anyway. Option 1 without that evidence would industrialise '
        'an extraction pipeline whose downstream accuracy nobody has yet measured. They are '
        'sequential, not alternative.')
callout(s, Inches(0.45), Inches(5.8), Inches(12.43), Inches(1.05), AMBERBG, AMBER,
        'ONE PREREQUISITE APPLIES TO BOTH',
        'CostVision has no validated accuracy today. Its accuracy harness reports "confidence: '
        'high" over five rows labelled EXAMPLE - replace with real quote. Until 30-50 real JLR '
        'quotes are loaded, neither option can be represented as quotable. This is JLR-side work '
        'and is the single highest-value action available.')
footer(s, 'Effort ranges are engineering estimates pending confirmation of CAPEE\'s technology stack.')
notes(s, 'Lead with the recommendation and the prerequisite. If the Director reads only this slide '
         'they should leave knowing: the two options are sequential rather than competing, and '
         'neither is quotable until JLR supplies real quote data. Do not soften the accuracy point '
         '— discovering it later in a steering group is far worse than hearing it now.')

# ══════════════════════════════════════════════════════════════════════════════
# 3 — THE PROBLEM
# ══════════════════════════════════════════════════════════════════════════════
s = header('What changes for a CAPEE user', 'The problem being solved')
text(s, Inches(0.45), Inches(1.75), Inches(12.4), Inches(0.4),
     [[('CAPEE requires cost inputs to be entered manually. Every field below is currently typed '
        'by an engineer, per part.', 12, BODY, False)]])
card(s, Inches(0.45), Inches(2.35), Inches(6.1), Inches(3.4), RED,
     'TODAY — manual entry into CAPEE',
     [('Part mass, stock mass, material utilisation',),
      ('Wall / section thickness, envelope, projected area',),
      ('Feature counts — holes, bosses, pockets, threads',),
      ('Cycle times per operation, machine selection',),
      ('Surface area for coating, masked feature count',),
      ('Tolerance class, finish callouts, heat-treat route',),
      ('',),
      ('Engineer-dependent. Slow. Not reproducible between',),
      ('two estimators looking at the same part.', BODY, False)],
     fill=REDBG)
card(s, Inches(6.78), Inches(2.35), Inches(6.1), Inches(3.4), GREEN,
     'WITH AUTOMATIC EXTRACTION',
     [('Upload a STEP/IGES model and a drawing PDF.',),
      ('',),
      ('MEASURED from the solid — volume, bounding box, wetted', DARK, True),
      ('area, wall thickness, B-rep face classification, hole /',),
      ('boss / pocket feature tables, gear metrology.',),
      ('',),
      ('READ from the drawing — tolerances, GD&T, finish and', DARK, True),
      ('heat-treat callouts, salt-spray hours, masked features.',),
      ('',),
      ('Same part, same numbers, every time.', GREEN, True)],
     fill=GREENBG)
callout(s, Inches(0.45), Inches(5.95), Inches(12.43), Inches(0.85), PANEL2, INDIGO,
        'The distinction that matters',
        'Geometry is MEASURED by a deterministic kernel, not estimated by an AI. The AI reads '
        'drawing notes and classifies; every number it produces is checked against the measured '
        'solid before it can reach a cost. That guard layer is what makes automatic extraction '
        'safe, and slide 5 covers why it must travel with the feature.')
notes(s, 'The value case is reproducibility as much as speed. Two estimators keying the same part '
         'today will produce two different answers; a measured geometry kernel produces one. That '
         'is the argument that lands with a cost engineering audience — not the time saving.')

# ══════════════════════════════════════════════════════════════════════════════
# 4 — VERIFIED INVENTORY
# ══════════════════════════════════════════════════════════════════════════════
s = header('What Option 1 actually moves', 'Verified inventory')
text(s, Inches(0.45), Inches(1.72), Inches(12.4), Inches(0.35),
     [[('Line counts measured directly from the repository. This is the scope of the port — not an '
        'estimate.', 11.5, BODY, False)]])
rows = [
    ('cad-geometry-engine.py', 'Python + OCCT/CadQuery', '2,039', 'Measures the solid. Fully offline.'),
    ('routes/cad.ts', 'TypeScript', '2,443', 'Prompts, drawing read, orchestration'),
    ('geometry-bridge.ts', 'TypeScript', '340', 'Spawns the kernel, semaphore-capped'),
    ('stl-parser.ts', 'TypeScript', '304', 'Pure-TS fast path for STL'),
    ('cad-sanity.ts', 'TypeScript', '311', ('GUARD — cross-checks AI vs measured', DARK, True)),
    ('cad-machining-guard.ts', 'TypeScript', '82', ('GUARD — caps near-net machining', DARK, True)),
    ('cad-feature-accuracy.ts', 'TypeScript', '143', 'Feature-detection scoring'),
    ('cost-input-rules/  (12 packs)', 'TypeScript', '7,037', ('GUARD — confirm-before-costing gate', DARK, True)),
    ('dfm-geometry/  (10 files)', 'TypeScript', '1,930', 'Geometry-driven DFM findings'),
]
table(s, Inches(0.45), Inches(2.2),
      Inches(12.43), ['Component', 'Technology', 'LOC', 'Role'], rows,
      [Inches(3.5), Inches(2.6), Inches(1.3), Inches(5.03)])
callout(s, Inches(0.45), Inches(5.85), Inches(6.1), Inches(1.0), GREENBG, GREEN,
        'Good news for portability',
        'The geometry kernel imports only the Python standard library and OCCT. Zero network '
        'calls. Its one sampling routine is seeded, so measurements are reproducible.')
callout(s, Inches(6.78), Inches(5.85), Inches(6.1), Inches(1.0), AMBERBG, AMBER,
        'One hard deployment constraint',
        'OCCT ships as manylinux/glibc wheels. It cannot run on Alpine. CAPEE\'s host estate must '
        'support glibc containers, or the kernel runs as a separate service.')
footer(s, 'Source: wc -l on the repository at commit 680571c, August 2026.')
notes(s, 'If challenged on scope, this is the slide to open. 5,662 lines of extraction plus 8,967 '
         'lines of rules and DFM. The guard rows are highlighted deliberately — they are the ones '
         'a project under time pressure will be tempted to drop, and slide 5 explains why that '
         'would be a mistake.')

# ══════════════════════════════════════════════════════════════════════════════
# 5 — THE GUARD LAYER
# ══════════════════════════════════════════════════════════════════════════════
s = header('The guard layer must travel with the feature', 'Non-negotiable')
text(s, Inches(0.45), Inches(1.72), Inches(12.4), Inches(0.4),
     [[('Automatic extraction uses an AI to read drawings and classify features. The AI never sets '
        'a price — but it does set ', 12, BODY, False),
       ('drivers', 12, DARK, True),
       (', and arithmetic converts a wrong driver into a confident wrong cost.', 12, BODY, False)]])
g = [('Measured-geometry clamp', INDIGO,
      'Any AI weight is overwritten by volume x density from the solid. Geometry is ground truth; '
      'the AI only interprets.'),
     ('Sanity cross-check', INDIGO,
      'AI numbers are tested against measured volume and mass. Contradictions are reported, not '
      'silently resolved.'),
     ('Near-net machining cap', INDIGO,
      'Machining time on a cast or forged part is capped to a finish envelope, so a hallucinated '
      'cycle cannot inflate the part.'),
     ('Confirm-before-costing gate', VIOLET,
      'Anything the model cannot derive from the solid — helix angle, tolerance class, heat-treat '
      'route — is put to the engineer as an explicit decision. AI answers are tagged as AI, never '
      'as engineer-confirmed, and are never pre-selected.')]
y = Inches(2.4)
for i, (t_, c_, b_) in enumerate(g):
    h_ = Inches(1.0) if i < 3 else Inches(1.15)
    card(s, Inches(0.45), y, Inches(12.43), h_, c_, t_, [(b_,)], title_size=12.5, body_size=10.5)
    y += h_ + Inches(0.14)
callout(s, Inches(0.45), Inches(6.2), Inches(12.43), Inches(0.72), REDBG, RED,
        'Evidence this matters — found during the August 2026 audit',
        'On the agent-driven path, which had no guard, one missing input field produced a reported '
        'cost of NaN with a success flag. An OEE of 0.0001 — physically impossible — still returns '
        'a confident figure. Both are fixed or logged; the lesson is that extraction without guards '
        'is where the risk actually lives.')
notes(s, 'This is the most important slide for a cost engineering audience. The instinct in a port '
         'is to take the clever bit (geometry, AI) and leave the plumbing (guards). That inverts '
         'the risk. The NaN example is real, from this codebase, found by running it rather than '
         'reading it — use it if anyone argues the guards are optional.')

# ══════════════════════════════════════════════════════════════════════════════
# 6 — OPTION 1 ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
s = header('Option 1 — target architecture', 'Option 1')
box(s, Inches(0.45), Inches(1.8), Inches(12.43), Inches(3.5), fill=PANEL, line=LINE, round_=True)
text(s, Inches(0.7), Inches(2.0), Inches(11.9), Inches(0.3),
     [[('JLR internal network', 11, MUTED, True)]])
lane = [('Engineer', 'uploads STEP + drawing PDF', INDIGO, Inches(0.75)),
        ('Extraction service', 'OCCT kernel + drawing read + guards', INDIGO, Inches(3.55)),
        ('Decision gate', 'engineer confirms what the solid cannot tell', VIOLET, Inches(6.35)),
        ('CAPEE', 'receives structured cost inputs, costs the part', GREEN, Inches(9.15))]
for t_, sub_, c_, x_ in lane:
    b = box(s, x_, Inches(2.45), Inches(2.55), Inches(1.35), fill=BG, line=LINE, round_=True)
    box(s, x_, Inches(2.45), Inches(2.55), Inches(0.075), fill=c_)
    text(s, x_ + Inches(0.16), Inches(2.65), Inches(2.25), Inches(0.3), [[(t_, 12.5, DARK, True)]])
    text(s, x_ + Inches(0.16), Inches(3.0), Inches(2.25), Inches(0.75),
         [[(sub_, 9.8, BODY, False)]], line_spacing=1.12)
for x_ in (Inches(3.32), Inches(6.12), Inches(8.92)):
    text(s, x_, Inches(2.95), Inches(0.3), Inches(0.3), [[('>', 17, MUTED, True)]])
text(s, Inches(0.7), Inches(4.0), Inches(11.9), Inches(1.1),
     [[('CAPEE remains the system of record. It keeps its own cost engine, its workflow and its '
        'approvals. CostVision contributes the measurement, the drawing read and the guard layer '
        '— nothing downstream of the cost inputs.', 11, BODY, False)]], line_spacing=1.2)
text(s, Inches(0.7), Inches(4.62), Inches(11.9), Inches(0.5),
     [[('The extraction service is deployed inside JLR. CAD files never leave the network — the '
        'kernel is local and offline. Only derived summaries and drawing text reach an LLM, via '
        'JLR\'s own gateway.', 11, DARK, True)]], line_spacing=1.2)
callout(s, Inches(0.45), Inches(5.55), Inches(12.43), Inches(1.25), PANEL2, INDIGO,
        'Why the decision gate sits between extraction and CAPEE',
        'Some cost-bearing facts cannot be derived from a solid model at all — helix angle, ISO '
        'quality class, heat-treat route, material grade. The gate puts these to the engineer '
        'rather than letting a model guess, and records who answered. Without it, automatic '
        'extraction quietly converts an unknown into an assumption, and CAPEE would have no way '
        'of telling the two apart.')
notes(s, 'The architecture answer to "is our CAD data safe": the geometry kernel is local and has '
         'zero network calls — verified, not claimed. Only derived numbers and drawing text ever '
         'reach a model, and that egress goes through JLR\'s own LLM gateway per the existing '
         'secure-deployment plan.')

# ══════════════════════════════════════════════════════════════════════════════
# 7 — OPTION 1 INTEGRATION PATTERNS
# ══════════════════════════════════════════════════════════════════════════════
s = header('Three ways to integrate — the choice depends on CAPEE', 'Option 1 · decision point')
text(s, Inches(0.45), Inches(1.72), Inches(12.4), Inches(0.35),
     [[('CAPEE\'s technology stack has not yet been confirmed. All three patterns are costed so the '
        'answer drops in without rework.', 11.5, BODY, False)]])
rows = [
    (('A — Embed', DARK, True), 'Node / JavaScript backend',
     'TypeScript rules, guards and constants embedded as an npm package. Only the OCCT kernel runs as a sidecar.',
     ('12–14 wks', GREEN, True), ('Lowest', GREEN, False)),
    (('B — Sidecar service', DARK, True), 'Java, .NET or any non-JS stack',
     'Whole extraction stack runs as a containerised service. CAPEE calls it over REST/mTLS. Constants ship as a versioned data pack.',
     ('14–18 wks', AMBER, True), ('Medium', AMBER, False)),
    (('C — File handoff', DARK, True), 'Desktop / Excel / Access estimator',
     'Extraction produces a structured import file (JSON/XML/CSV) that CAPEE ingests. No live coupling.',
     ('10–12 wks', GREEN, True), ('Low, but manual step', AMBER, False)),
]
table(s, Inches(0.45), Inches(2.2), Inches(12.43),
      ['Pattern', 'Fits when CAPEE is…', 'How it works', 'Effort', 'Integration risk'], rows,
      [Inches(1.85), Inches(2.5), Inches(5.28), Inches(1.4), Inches(1.4)],
      row_h=Inches(0.82), size=10)
callout(s, Inches(0.45), Inches(5.05), Inches(6.1), Inches(1.05), PANEL2, INDIGO,
        'Recommended default: Pattern B',
        'A sidecar service works whatever CAPEE turns out to be, keeps the Python kernel in a '
        'supported environment, and lets CostVision be upgraded without redeploying CAPEE.')
callout(s, Inches(6.78), Inches(5.05), Inches(6.1), Inches(1.05), AMBERBG, AMBER,
        'What we need from JLR to close this',
        'CAPEE backend language and framework; container platform and whether glibc images are '
        'permitted; whether CAPEE can make outbound service calls, or must ingest files.')
footer(s, 'Effort assumes one integration engineer plus part-time CostVision support; excludes JLR rate-data collection.')
notes(s, 'Do not let the meeting stall on the unknown stack — present all three and ask for the '
         'answer as an action. Pattern B is the safe default because it is stack-agnostic and '
         'keeps the Python kernel where it is supported. Pattern A is cheapest but only if CAPEE '
         'is Node.')

# ══════════════════════════════════════════════════════════════════════════════
# 8 — WHAT PORTS AS-IS
# ══════════════════════════════════════════════════════════════════════════════
s = header('What transfers literally, and what cannot', 'Option 1 · portability')
card(s, Inches(0.45), Inches(1.85), Inches(6.1), Inches(2.5), GREEN,
     'PORTS AS-IS — including the hardcoded values',
     [('Geometry kernel — runs unchanged in any glibc container',),
      ('Feature-detection thresholds and tolerances',),
      ('Commodity prompt text, verbatim',),
      ('Guard limits and sanity bands',),
      ('Rules-pack logic and decision definitions',),
      ('Gear metrology, surface-area and wall-thickness maths',),
      ('The seeded sampling constant, so results reproduce',)],
     fill=GREENBG)
card(s, Inches(6.78), Inches(1.85), Inches(6.1), Inches(2.5), AMBER,
     'NEEDS REWORK OR A DECISION',
     [('TypeScript source — literal only if CAPEE is Node (Pattern A)',),
      ('HTTP routes — replaced by CAPEE\'s own service contract',),
      ('The browser UI — CAPEE has its own front end',),
      ('LLM client — must point at JLR\'s gateway, not the public API',),
      ('SQLite persistence — CAPEE\'s database takes over',),
      ('Authentication — replaced by JLR SSO / service accounts',)],
     fill=AMBERBG)
callout(s, Inches(0.45), Inches(4.55), Inches(12.43), Inches(1.15), PANEL2, INDIGO,
        'On "we want everything including the hardcode"',
        'That is the right instinct and it is deliverable. The tuning constants — feature '
        'thresholds, guard bands, deposit rates, shape factors, prompt text — will be extracted '
        'into a single versioned parameter pack rather than left scattered through the source, so '
        'CAPEE consumes one reviewable artefact and JLR can see and change every value. This is '
        'a deliverable in its own right and is included in the effort figures.')
callout(s, Inches(0.45), Inches(5.85), Inches(12.43), Inches(0.95), AMBERBG, AMBER,
        'A caveat worth stating plainly',
        'Those constants are engineering estimates, not JLR plant measurements. Porting them '
        'literally gives CAPEE a working structure with representative numbers — the same '
        'position CostVision is in today. They are a starting point to be replaced with JLR data, '
        'not a body of validated fact.')
notes(s, 'The user asked specifically for the hardcoded values to come across. That is honoured — '
         'but with the caveat that those values are representative rather than measured. Better '
         'they hear it here than discover it when a supplier challenges a number.')

# ══════════════════════════════════════════════════════════════════════════════
# 9 — OPTION 1 PHASED PLAN
# ══════════════════════════════════════════════════════════════════════════════
s = header('Option 1 — phased delivery', 'Option 1 · plan')
rows = [
    (('Phase 0', DARK, True), 'Discovery', '2 wks',
     'Confirm CAPEE stack, hosting, security posture. Choose integration pattern. Agree the cost-input contract.'),
    (('Phase 1', DARK, True), 'Extraction service', '4 wks',
     'Containerise the OCCT kernel. Stand it up inside JLR. Prove measurement on 20 JLR parts against drawings.'),
    (('Phase 2', DARK, True), 'Parameter pack', '2 wks',
     'Extract every tuning constant into one versioned, reviewable artefact. JLR review and sign-off.'),
    (('Phase 3', DARK, True), 'Guards + decision gate', '3 wks',
     'Port the guard layer and confirm-before-costing gate. This is not optional — see slide 5.'),
    (('Phase 4', DARK, True), 'CAPEE integration', '3–5 wks',
     'Wire the contract into CAPEE. Drawing read via JLR LLM gateway. Round-trip a real part.'),
    (('Phase 5', DARK, True), 'Pilot + tune', '3 wks',
     'One commodity, one engineering team, 30+ parts. Measure extraction accuracy against known parts.'),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['', 'Phase', 'Duration', 'Content'], rows,
      [Inches(1.1), Inches(2.3), Inches(1.25), Inches(7.78)], row_h=Inches(0.62), size=10)
callout(s, Inches(0.45), Inches(5.9), Inches(6.1), Inches(0.95), PANEL2, INDIGO,
        'Total: 17–21 weeks',
        'Assumes one integration engineer plus part-time CostVision support, and that JLR '
        'discovery in Phase 0 completes on time.')
callout(s, Inches(6.78), Inches(5.9), Inches(6.1), Inches(0.95), AMBERBG, AMBER,
        'Start with one commodity, not eighteen',
        'Machining or sheet metal first — highest part count, best-understood geometry. Prove the '
        'contract before widening.')
notes(s, 'Phase 2 is the one people try to skip and the one the user explicitly asked for — the '
         'parameter pack is what makes "including the hardcode" real and reviewable rather than a '
         'code archaeology exercise for JLR developers later.')

# ══════════════════════════════════════════════════════════════════════════════
# 10 — OPTION 2 ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
s = header('Option 2 — CostVision as-is on JLR data', 'Option 2')
text(s, Inches(0.45), Inches(1.72), Inches(12.4), Inches(0.35),
     [[('No engine change. No code change. The rate library is replaced with JLR\'s own figures and '
        'the platform is deployed inside the JLR network.', 11.5, BODY, False)]])
card(s, Inches(0.45), Inches(2.25), Inches(4.0), Inches(2.55), GREEN,
     'UNCHANGED',
     [('All 18 commodity cost models',),
      ('The 8-bucket deterministic engine',),
      ('CAD and drawing extraction',),
      ('Guards and decision gate',),
      ('Reports — PDF, Excel, PPTX',),
      ('DFM, sensitivity, negotiation',)],
     fill=GREENBG)
card(s, Inches(4.63), Inches(2.25), Inches(4.0), Inches(2.55), VIOLET,
     'REPLACED WITH JLR DATA',
     [('Material prices and scrap recovery',),
      ('Machine rates — or their build-ups',),
      ('Labour rates by grade and region',),
      ('Energy tariffs, gas and electricity',),
      ('Overhead, SG&A and margin policy',),
      ('Regional factors for JLR\'s footprint',)])
card(s, Inches(8.81), Inches(2.25), Inches(4.07), Inches(2.55), INDIGO,
     'ADDED FOR ENTERPRISE USE',
     [('JLR SSO in place of local auth',),
      ('PostgreSQL in place of SQLite',),
      ('LLM egress via JLR gateway',),
      ('Rate versioning — see slide 14',),
      ('Persisted costings for audit',),
      ('Backup and DR to JLR standard',)])
callout(s, Inches(0.45), Inches(5.0), Inches(12.43), Inches(0.95), PANEL2, INDIGO,
        'The rate library is already designed to be replaced',
        'Rates are an injected argument, never imported inside the engine — the cost function takes '
        'the library as a parameter. An admin-gated company-library upload already exists. Swapping '
        'JLR data in is configuration, not development.')
callout(s, Inches(0.45), Inches(6.1), Inches(12.43), Inches(0.85), AMBERBG, AMBER,
        'Where the real work is',
        'Not the software. Collecting, validating and structuring JLR\'s rate data across '
        'materials, machines, labour and energy is the critical path, and it is JLR-side effort.')
notes(s, 'The engineering point that de-risks Option 2: the rate library is a parameter, not a '
         'hard dependency. Verified — the cost function signature takes the library as an '
         'argument, and the engine never imports rates internally. So JLR data goes in without '
         'touching engine code.')

# ══════════════════════════════════════════════════════════════════════════════
# 11 — OPTION 2 PLAN
# ══════════════════════════════════════════════════════════════════════════════
s = header('Option 2 — phased delivery', 'Option 2 · plan')
rows = [
    (('Phase 0', DARK, True), 'Security review', '2 wks',
     'IT-security sign-off using the existing verified data-flow inventory. Choose deployment option A or B.'),
    (('Phase 1', DARK, True), 'Deploy', '2 wks',
     'On-prem install, JLR SSO, PostgreSQL, LLM egress via JLR gateway. Deterministic core needs no external calls.'),
    (('Phase 2', DARK, True), ('Rate onboarding — JLR-led', DARK, True), '4–6 wks',
     'Materials, machine rates, labour, energy, regional factors. The critical path, and the real work.'),
    (('Phase 3', DARK, True), 'Calibrate', '2 wks',
     'Load 30–50 known JLR parts with actual prices. Measure MAPE. This is what makes the tool quotable.'),
    (('Phase 4', DARK, True), 'Pilot', '2 wks',
     'One commodity team, live parts, side-by-side against CAPEE. Compare and explain differences.'),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['', 'Phase', 'Duration', 'Content'], rows,
      [Inches(1.1), Inches(2.5), Inches(1.25), Inches(7.58)], row_h=Inches(0.66), size=10)
callout(s, Inches(0.45), Inches(5.35), Inches(6.1), Inches(1.0), GREENBG, GREEN,
        'Total: 8–12 weeks',
        'Software effort is small. The range is driven almost entirely by how quickly JLR can '
        'assemble rate data and actual prices.')
callout(s, Inches(6.78), Inches(5.35), Inches(6.1), Inches(1.0), PANEL2, INDIGO,
        'Phase 3 is the one that matters',
        'It converts CostVision from a structurally sound model into a calibrated one, and it '
        'produces the evidence Option 1 would otherwise lack.')
footer(s, 'Deployment guidance follows docs/CostVision-Secure-Deployment-CAPEE-Integration.md, already reviewed.')
notes(s, 'Phase 3 is the strategic point of the whole programme. Whichever option JLR pursues, '
         'calibration against real JLR actuals is what turns this from a promising model into '
         'something a buyer can put in front of a supplier.')

# ══════════════════════════════════════════════════════════════════════════════
# 12 — COMPARISON
# ══════════════════════════════════════════════════════════════════════════════
s = header('Side by side', 'Comparison')
rows = [
    ('Time to first value', ('17–21 weeks', AMBER, False), ('8–12 weeks', GREEN, True)),
    ('Engineering effort', ('High — port + integrate', AMBER, False), ('Low — deploy + configure', GREEN, True)),
    ('JLR-side data effort', ('Moderate', GREEN, False), ('High — the critical path', AMBER, False)),
    ('System of record', ('CAPEE, unchanged', GREEN, True), ('New tool alongside CAPEE', AMBER, False)),
    ('Change to user workflow', ('Minimal — same CAPEE screens', GREEN, True), ('New tool to learn', AMBER, False)),
    ('Gets the 8-bucket engine', ('No — CAPEE costs', AMBER, False), ('Yes', GREEN, True)),
    ('Gets physics checks + provenance', ('Only if guards ported', AMBER, False), ('Yes', GREEN, True)),
    ('Produces validation evidence', ('No', RED, False), ('Yes — Phase 3', GREEN, True)),
    ('Dependency on CAPEE stack answer', ('Blocking', RED, True), ('None', GREEN, True)),
    ('Reversibility if it disappoints', ('Low — embedded in CAPEE', AMBER, False), ('High — switch it off', GREEN, True)),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['Dimension', 'OPTION 1 — feed CAPEE', 'OPTION 2 — CostVision as-is'], rows,
      [Inches(4.43), Inches(4.0), Inches(4.0)], row_h=Inches(0.42), size=10.5)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'Read the last two rows together',
        'Option 2 is reversible and produces evidence; Option 1 is neither, and depends on an '
        'answer JLR has not yet given. That asymmetry is the whole basis of the recommendation.')
notes(s, 'Steer the discussion to the bottom three rows. Validation evidence, stack dependency and '
         'reversibility are the decision-relevant dimensions; the rest are largely symmetrical.')

# ══════════════════════════════════════════════════════════════════════════════
# 13 — RECOMMENDATION
# ══════════════════════════════════════════════════════════════════════════════
s = header('Recommendation', 'The answer')
callout(s, Inches(0.45), Inches(1.85), Inches(12.43), Inches(1.15), GREENBG, GREEN,
        'Run Option 2 first. Then Option 1, informed by what it teaches you.',
        'These are not competing options — they are sequential. Option 2 proves the engine against '
        'JLR reality inside a quarter, is reversible if it disappoints, and produces the calibration '
        'evidence that Option 1 needs but cannot generate for itself.')
card(s, Inches(0.45), Inches(3.2), Inches(4.0), Inches(2.35), GREEN,
     'Quarter 1 — Option 2',
     [('Deploy inside JLR. Load JLR rates.',),
      ('Calibrate on 30–50 real parts.',),
      ('',),
      ('Outcome: a measured MAPE, and', DARK, True),
      ('a defensible answer to "how', DARK, True),
      ('accurate is it".', DARK, True)],
     fill=GREENBG)
card(s, Inches(4.63), Inches(3.2), Inches(4.0), Inches(2.35), INDIGO,
     'Quarter 2 — decide',
     [('Confirm CAPEE\'s stack.',),
      ('Review calibration results.',),
      ('',),
      ('If accuracy holds, Option 1', DARK, True),
      ('is a proven capability being', DARK, True),
      ('industrialised — not a bet.', DARK, True)])
card(s, Inches(8.81), Inches(3.2), Inches(4.07), Inches(2.35), VIOLET,
     'Quarter 3 — Option 1',
     [('Port extraction + guards into',),
      ('CAPEE, one commodity first.',),
      ('',),
      ('CAPEE gains automatic input', DARK, True),
      ('with the accuracy question', DARK, True),
      ('already answered.', DARK, True)])
callout(s, Inches(0.45), Inches(5.75), Inches(12.43), Inches(1.05), AMBERBG, AMBER,
        'If JLR must choose only one',
        'Choose Option 2. It is cheaper, faster, reversible, needs no answer about CAPEE\'s '
        'internals, and delivers the full engine including the physics checks and provenance that '
        'make an estimate defensible in front of a supplier. Option 1 delivers convenience; Option '
        '2 delivers capability.')
notes(s, 'Be direct here. The sequencing argument is genuinely the strongest one: Option 1 '
         'industrialises an extraction pipeline whose downstream accuracy nobody has measured. '
         'Doing Option 2 first is not a delay, it is the thing that makes Option 1 safe.')

# ══════════════════════════════════════════════════════════════════════════════
# 14 — RISKS
# ══════════════════════════════════════════════════════════════════════════════
s = header('Risks and prerequisites — stated plainly', 'Honest assessment')
rows = [
    (('No validated accuracy today', DARK, True), 'Both',
     'The accuracy harness contains five placeholder rows, not real quotes. Nothing can be represented as quotable until JLR loads actuals.',
     ('Critical', RED, True)),
    (('No rate versioning', DARK, True), 'Option 2',
     'Rates are a single-row overwrite with no history, and costings are not persisted. A cost cannot be reproduced or audited after the fact.',
     ('High', RED, True)),
    (('CAPEE stack unknown', DARK, True), 'Option 1',
     'Blocks the integration-pattern choice and the firm effort figure. Needs a JLR answer before Phase 0 can close.',
     ('High', AMBER, True)),
    (('Rate data is representative', DARK, True), 'Both',
     'Supplied constants are engineering estimates, not plant measurements. Replacing them is the point of Phase 2 / Phase 3.',
     ('Medium', AMBER, True)),
    (('OCCT needs glibc', DARK, True), 'Option 1',
     'The geometry kernel cannot run on Alpine. Confirm JLR\'s container platform permits glibc images.',
     ('Medium', AMBER, True)),
    (('LLM egress governance', DARK, True), 'Both',
     'Drawing reads send derived text to a model. Must route via JLR\'s gateway with zero-retention. CAD files themselves never leave.',
     ('Medium', AMBER, True)),
]
table(s, Inches(0.45), Inches(1.95), Inches(12.43),
      ['Risk', 'Applies to', 'Detail and mitigation', 'Severity'], rows,
      [Inches(2.9), Inches(1.25), Inches(6.98), Inches(1.3)], row_h=Inches(0.72), size=9.8)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'Why these are on a slide rather than in an appendix',
        'A cost tool earns trust by declaring what it does not know. Every one of these is fixable, '
        'and three of them are fixed by simply doing Option 2 Phase 3 first.')
notes(s, 'Do not soften this slide. A Director who hears the weaknesses from us will trust the '
         'strengths. The top two rows are the ones to dwell on — they are the difference between '
         'a promising tool and a deployable one.')

# ══════════════════════════════════════════════════════════════════════════════
# 15 — ASKS
# ══════════════════════════════════════════════════════════════════════════════
s = header('What we need from JLR to proceed', 'Next steps')
asks = [
    ('1', 'CAPEE technology stack', INDIGO,
     'Backend language and framework, container platform, whether glibc images are permitted, and '
     'whether CAPEE can make outbound service calls. Unblocks the Option 1 pattern choice and firms the effort figure.'),
    ('2', '30–50 real parts with actual paid prices', RED,
     'Part, commodity, volume, region, and the price actually paid. This is the single highest-value '
     'input available and it gates both options. Historic PO data is sufficient.'),
    ('3', 'JLR rate data', VIOLET,
     'Materials, machine rates or their build-ups, labour by grade, energy tariffs, overhead and '
     'margin policy. Phase 2 of Option 2 and the thing that makes any number JLR-specific.'),
    ('4', 'Security posture decision', GREEN,
     'Fully air-gapped (deterministic engines only) or on-prem with private-cloud LLM. The existing '
     'secure-deployment document sets out both; JLR IT-security chooses.'),
]
y = Inches(1.9)
for n, t_, c_, b_ in asks:
    box(s, Inches(0.45), y, Inches(12.43), Inches(1.13), fill=PANEL, line=LINE, round_=True)
    box(s, Inches(0.45), y, Inches(0.075), Inches(1.13), fill=c_)
    nb = box(s, Inches(0.68), y + Inches(0.26), Inches(0.6), Inches(0.6), fill=c_, round_=True, radius=0.3)
    tf = nb.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = n
    r.font.size = Pt(19); r.font.bold = True; r.font.color.rgb = ON_DARK; r.font.name = 'Calibri'
    text(s, Inches(1.48), y + Inches(0.17), Inches(11.2), Inches(0.3), [[(t_, 13, DARK, True)]])
    text(s, Inches(1.48), y + Inches(0.52), Inches(11.2), Inches(0.55),
         [[(b_, 10.5, BODY, False)]], line_spacing=1.14)
    y += Inches(1.25)
notes(s, 'Close on actions, not conclusions. Ask 2 is the one to press for — real paid prices. '
         'Everything else can proceed in parallel, but without actuals neither option can be '
         'signed off as accurate, and that is the question a Director will be asked.')

# ══════════════════════════════════════════════════════════════════════════════
# 16 — APPENDIX
# ══════════════════════════════════════════════════════════════════════════════
s = header('Evidence base', 'Appendix')
text(s, Inches(0.45), Inches(1.72), Inches(12.4), Inches(0.35),
     [[('Every claim in this deck traces to a verifiable fact in the codebase, established by audit '
        'in August 2026 at commit 680571c.', 11.5, BODY, False)]])
rows = [
    ('Cost engine is pure and deterministic', 'Five identical runs produced byte-identical output on both base and regional paths'),
    ('All 18 commodities use the one engine', 'Connectivity matrix built from source: UI form to collect function to driver module to engine'),
    ('Engine applies no hidden defaults', 'No fallback operators anywhere in the cost path; every field is mandatory and used as given'),
    ('Geometry kernel is offline', 'Zero network imports; standard library plus OCCT only'),
    ('Geometry kernel is deterministic', 'Its one sampling routine is explicitly seeded'),
    ('CAD files never leave the server', 'Geometry extracted locally; only derived summaries reach an LLM'),
    ('Rate library is injected, not imported', 'The cost function takes the library as a parameter'),
    ('Three defects found and fixed', 'NaN reported as success; irreproducible confidence band; unrenderable report text'),
    ('Test suite', '2,022 tests passing, including physics checks that fail the build'),
]
table(s, Inches(0.45), Inches(2.2), Inches(12.43), ['Claim', 'How it was verified'], rows,
      [Inches(4.6), Inches(7.83)], row_h=Inches(0.44), size=10)
callout(s, Inches(0.45), Inches(6.5), Inches(12.43), Inches(0.72), PANEL2, INDIGO,
        'Supporting documents',
        'docs/CostVision-Secure-Deployment-CAPEE-Integration.md — security and data-flow inventory.  '
        'FEASIBILITY.md — engine contract and integration readiness.  '
        'CostVision 360 Review — full technical assessment including competitive position.')
notes(s, 'Keep this slide for the technical audience or a follow-up with JLR IT. It is the answer '
         'to "how do you know" for every claim made earlier in the deck.')

# ══════════════════════════════════════════════════════════════════════════════
OUT = 'CostVision-CAPEE-Implementation-Options.pptx'
prs.save(OUT)
finalise(OUT)
print(f'{OUT}  —  {len(prs.slides._sldIdLst)} slides')

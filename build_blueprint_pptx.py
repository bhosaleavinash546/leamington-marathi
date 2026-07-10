#!/usr/bin/env python3
"""
CostVision — Implementation Blueprint presentation (secure deployment + CAPEE
integration) for senior management. Light professional theme, logo top-left on
every slide, native shapes/diagrams, speaker notes per slide.

Content is grounded in docs/CostVision-Secure-Deployment-CAPEE-Integration.md,
which itself is grounded in a line-by-line audit of the codebase.

Regenerate:  python3 build_blueprint_pptx.py
Output:      CostVision-Implementation-Blueprint.pptx
"""

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

INDIGO  = RGBColor(0x4F, 0x46, 0xE5)
BLUE    = RGBColor(0x25, 0x63, 0xEB)
DARK    = RGBColor(0x0F, 0x17, 0x2A)
BODY    = RGBColor(0x33, 0x41, 0x55)
MUTED   = RGBColor(0x64, 0x74, 0x8B)
BG      = RGBColor(0xFF, 0xFF, 0xFF)
PANEL   = RGBColor(0xF1, 0xF5, 0xF9)
PANEL2  = RGBColor(0xEF, 0xF6, 0xFF)
GREENBG = RGBColor(0xEC, 0xFD, 0xF5)
AMBERBG = RGBColor(0xFF, 0xFB, 0xEB)
GREEN   = RGBColor(0x05, 0x96, 0x69)
AMBER   = RGBColor(0xD9, 0x77, 0x06)
RED     = RGBColor(0xDC, 0x26, 0x26)
VIOLET  = RGBColor(0x7C, 0x3A, 0xED)
CYAN    = RGBColor(0x08, 0x91, 0xB2)
LINE    = RGBColor(0xE2, 0xE8, 0xF0)

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

def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         space_after=4, line_spacing=1.0):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.space_after = Pt(space_after); p.line_spacing = line_spacing
        for r in para:
            t, size, color, bold = r[0], r[1], r[2], r[3]
            italic = r[4] if len(r) > 4 else False
            run = p.add_run(); run.text = t
            f = run.font; f.size = Pt(size); f.color.rgb = color; f.bold = bold
            f.italic = italic; f.name = 'Calibri'
    return tb

def logo(slide, x=Inches(0.35), y=Inches(0.22), scale=1.0):
    s = scale
    badge = box(slide, x, y, Inches(0.42 * s), Inches(0.42 * s), fill=INDIGO, round_=True, radius=0.28)
    tf = badge.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = 'cv'
    r.font.size = Pt(17 * s); r.font.bold = True; r.font.color.rgb = BG; r.font.name = 'Calibri'
    text(slide, x + Inches(0.52 * s), y - Inches(0.03 * s), Inches(2.6), Inches(0.32),
         [[('CostVision', 18 * s, BLUE, True)]])
    text(slide, x + Inches(0.52 * s), y + Inches(0.24 * s), Inches(2.8), Inches(0.22),
         [[('AI  COST  INTELLIGENCE', 7.5 * s, MUTED, False)]])

def notes(slide, txt):
    slide.notes_slide.notes_text_frame.text = txt

def header(title, kicker=None):
    slide = prs.slides.add_slide(BLANK)
    box(slide, 0, 0, W, H, fill=BG)
    logo(slide)
    box(slide, 0, Inches(0.78), W, Pt(2.2), fill=INDIGO)
    if kicker:
        text(slide, Inches(0.45), Inches(0.95), Inches(11.5), Inches(0.3),
             [[(kicker.upper(), 11, BLUE, True)]])
        ty = Inches(1.22)
    else:
        ty = Inches(1.02)
    text(slide, Inches(0.45), ty, Inches(12.4), Inches(0.6), [[(title, 27, DARK, True)]])
    return slide

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
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, W, H, fill=BG)
box(s, 0, 0, W, Inches(0.16), fill=INDIGO)
logo(s, x=Inches(0.5), y=Inches(0.45), scale=1.25)
text(s, Inches(0.9), Inches(2.15), Inches(11.8), Inches(1.0),
     [[('CostVision Implementation Blueprint', 42, DARK, True)]])
text(s, Inches(0.9), Inches(3.1), Inches(11.4), Inches(0.9),
     [[('Secure enterprise deployment inside our network — and integration with CAPEE.', 19, BODY, False)],
      [('All CAD models, drawings and images stay inside the company. Verified in the code.', 19, BODY, False)]])
for i, (t, c) in enumerate([('100% CAD stays internal', GREEN), ('CAPEE integration ready', BLUE), ('4–6 weeks of changes', VIOLET), ('6-phase rollout', CYAN)]):
    x = Inches(0.9 + i * 2.95)
    chip = box(s, x, Inches(4.55), Inches(2.7), Inches(0.52), fill=PANEL, round_=True, radius=0.5)
    tf = chip.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = t; r.font.size = Pt(12.5); r.font.bold = True; r.font.color.rgb = c; r.font.name = 'Calibri'
text(s, Inches(0.9), Inches(6.5), Inches(11), Inches(0.4),
     [[('Management briefing  ·  July 2026  ·  Grounded in a line-by-line audit of the platform code', 12, MUTED, False)]])
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)
notes(s, "Welcome. This session is the implementation blueprint for CostVision: how we deploy it securely so that "
         "no CAD data ever leaves our network, and how we integrate it with our existing CAPEE costing tool. "
         "Everything in this deck comes from an actual audit of the platform's code — not vendor promises. "
         "By the end I'll ask for one decision: approval to start Phase 1 and 2.")

# ═══════════════ 2 — THE DECISION ═══════════════
s = header('The decision we are asking for today', 'Purpose of this meeting')
box(s, Inches(0.45), Inches(2.1), Inches(12.45), Inches(1.5), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(2.35), Inches(11.8), Inches(1.1),
     [[('Approve Phases 1–2: ', 17, BLUE, True),
       ('the IT-Security assessment and the architecture design for deploying CostVision inside our network '
        'and connecting it to CAPEE.  (~5–7 weeks, existing teams, no licence spend.)', 17, BODY, False)]],
     line_spacing=1.2)
pts = [
    ('Why now', 'The tool is built, tested (790 automated tests) and proven on live runs — the value is waiting on deployment, not development.', BLUE),
    ('Why it is safe', 'CAD processing already runs fully inside the server. One configuration change closes the only external AI connection.', GREEN),
    ('Why CAPEE wins', 'CAPEE keeps the workflow; CostVision adds the AI, physics and organisational memory behind it. No tool replacement.', VIOLET),
]
for i, (t, d, c) in enumerate(pts):
    x = Inches(0.45 + i * 4.25)
    box(s, x, Inches(4.0), Inches(4.0), Inches(2.4), fill=PANEL, round_=True, radius=0.07)
    box(s, x, Inches(4.0), Inches(4.0), Inches(0.09), fill=c)
    text(s, x + Inches(0.25), Inches(4.25), Inches(3.55), Inches(0.4), [[(t, 15.5, c, True)]])
    text(s, x + Inches(0.25), Inches(4.75), Inches(3.55), Inches(1.55), [[(d, 12, BODY, False)]], line_spacing=1.18)
notes(s, "One clear ask: approve the first two phases — the security assessment and the architecture design. "
         "That's five to seven weeks with existing teams and no new licence spend. Why now? Because the tool itself is "
         "finished and proven; what remains is deployment. Why is it safe? Because CAD processing already happens "
         "entirely inside the server — we verified this in the code. And why does CAPEE win? Because we are not "
         "replacing CAPEE — we're giving it an AI engine and a memory.")

# ═══════════════ 3 — WHAT COSTVISION IS ═══════════════
s = header('What CostVision is — a quick recap', 'Background')
caps = [
    ('18 cost engines', 'Machining, casting, injection, PCB, software and more — physics-based, every figure traceable', BLUE),
    ('CAD-to-Cost', 'Reads STEP/IGES models with a real geometry engine and auto-fills the costing', CYAN),
    ('Photo-to-BOM', 'Costs a PCB from photographs — detects components and builds the bill of materials', VIOLET),
    ('Agentic AI', 'Learns from every analysis and real quote; suggests, self-corrects and raises findings on its own', GREEN),
]
for i, (t, d, c) in enumerate(caps):
    x = Inches(0.45 + (i % 2) * 6.35); y = Inches(2.05 + (i // 2) * 1.62)
    box(s, x, y, Inches(6.1), Inches(1.42), fill=PANEL, round_=True, radius=0.09)
    box(s, x, y, Inches(0.09), Inches(1.42), fill=c)
    text(s, x + Inches(0.28), y + Inches(0.14), Inches(5.6), Inches(0.4), [[(t, 14.5, c, True)]])
    text(s, x + Inches(0.28), y + Inches(0.58), Inches(5.6), Inches(0.75), [[(d, 11.5, BODY, False)]], line_spacing=1.12)
box(s, Inches(0.45), Inches(5.55), Inches(12.45), Inches(1.3), fill=GREENBG, round_=True, radius=0.08)
text(s, Inches(0.8), Inches(5.75), Inches(11.8), Inches(0.95),
     [[('Proven, not promised:  ', 13.5, GREEN, True),
       ('estimating error cut from 10.9% to 0.3% after learning from 3 real quotes  ·  £512k/yr of pricing issues '
        'found autonomously in the live demo  ·  790 automated tests protect it all.', 13.5, BODY, False)]],
     line_spacing=1.2)
notes(s, "Thirty seconds of background for anyone new. CostVision costs parts bottom-up with physics across 18 "
         "manufacturing processes. It reads CAD files directly, it can cost a circuit board from photographs, and — "
         "the newest layer — it learns: from every analysis and every real supplier quote, getting measurably more "
         "accurate and even raising savings findings on its own. The green bar shows verified results from live runs, "
         "including half a million pounds a year of findings surfaced autonomously in our demonstration.")

# ═══════════════ 4 — TECH STACK IN PLAIN WORDS ═══════════════
s = header('What the tool is made of — in plain words', 'Technology, simply explained')
stack = [
    ('Frontend', 'What users see', 'The web application in the browser — forms, dashboards, reports. Nothing is installed on laptops; it is served from our own server.', BLUE),
    ('Backend', 'The engine room', 'The server application that does the work: runs the 18 cost engines, the AI logic and all calculations. Runs on a standard company virtual machine.', INDIGO),
    ('Database', 'The memory', 'Where rate libraries, saved costings and the AI knowledge base live. Standard corporate database (PostgreSQL), encrypted, backed up by IT.', VIOLET),
    ('CAD engine', 'The 3D model reader', 'Specialist geometry software (OCCT — the same core used by CAD vendors) that measures the 3D model: volume, weight, walls, holes. Runs INSIDE the backend.', CYAN),
    ('AI layer', 'The language brain', 'The AI model used for vision and language tasks. Today it calls an external API — the ONE connection this blueprint moves inside our control.', AMBER),
]
for i, (t, tag, d, c) in enumerate(stack):
    y = Inches(2.05 + i * 0.95)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.84), fill=PANEL, round_=True, radius=0.14)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.84), fill=c)
    text(s, Inches(0.75), y + Inches(0.10), Inches(2.0), Inches(0.4), [[(t, 15, c, True)]])
    text(s, Inches(0.75), y + Inches(0.47), Inches(2.0), Inches(0.3), [[(tag, 10, MUTED, False, True)]])
    text(s, Inches(2.95), y + Inches(0.12), Inches(9.7), Inches(0.65), [[(d, 11.5, BODY, False)]], line_spacing=1.1)
notes(s, "Before the architecture, the five building blocks in plain words. The FRONTEND is simply what users see in "
         "their browser — nothing installs on laptops. The BACKEND is the engine room on our server, where all "
         "calculations happen. The DATABASE is the memory — a standard corporate database our IT already knows how to "
         "run and back up. The GEOMETRY ENGINE is the specialist CAD reader — and note, it runs inside our backend, "
         "not in any cloud. The AI LAYER is the only piece that currently talks to an external service — and moving "
         "that inside our control is exactly what this blueprint does.")

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
       ('CAD files already never leave the server.', 15, DARK, True)],
      [('The geometry engine runs inside our backend and processes CAD models in memory — files are not even '
        'written to disk, let alone sent anywhere. The only outbound flows are the AI layer (photos and derived '
        'summaries) and two optional public feeds. One endpoint change closes the gap.', 13, BODY, False)]],
     space_after=8, line_spacing=1.2)
text(s, Inches(0.45), Inches(5.85), Inches(12.4), Inches(0.9),
     [[('Why you can trust this: ', 12.5, DARK, True),
       ('this is not a vendor claim — we audited every outbound network call in the platform\'s source code, '
        'line by line, and listed each one. The full inventory is in the written plan.', 12.5, BODY, False)]],
     line_spacing=1.2)
notes(s, "The requirement is absolute: CAD data must never leave our network. Here is the finding that makes this "
         "project straightforward: it already doesn't. We audited every outbound connection in the source code. "
         "CAD models are processed in memory, inside our server, by the local geometry engine — they are not even "
         "saved to disk. The only traffic that leaves today is the AI layer — photographs and derived summaries — "
         "plus two optional public feeds we can simply switch off. So the job is not a redesign; it is closing "
         "one connection.")

# ═══════════════ 6 — DATA-FLOW MAP ═══════════════
s = header('Where data flows today — verified in the code', 'Data-flow map')
box(s, Inches(0.45), Inches(2.0), Inches(7.5), Inches(4.7), fill=GREENBG, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.2), Inches(6.9), Inches(0.4),
     [[('STAYS INSIDE — already ✓', 14, GREEN, True)]])
inside = [
    ('CAD / geometry processing', 'OCCT engine runs in the backend; files processed in memory, never stored'),
    ('All 18 cost engines', 'Physics + maths, fully local'),
    ('Knowledge base & learning loop', 'Similarity, calibration, autonomous findings — local database'),
    ('BOM file parsing, exports, reports', 'Local parsers, local PDF/Excel generation'),
]
for i, (a, b) in enumerate(inside):
    y = Inches(2.7 + i * 0.95)
    box(s, Inches(0.75), y, Inches(0.09), Inches(0.8), fill=GREEN)
    text(s, Inches(1.0), y, Inches(6.7), Inches(0.9),
         [[(a, 12.5, DARK, True)], [(b, 10.5, BODY, False)]], space_after=2, line_spacing=1.05)
box(s, Inches(8.3), Inches(2.0), Inches(4.6), Inches(4.7), fill=AMBERBG, round_=True, radius=0.05)
text(s, Inches(8.6), Inches(2.2), Inches(4.0), Inches(0.4),
     [[('LEAVES TODAY — to fix', 14, AMBER, True)]])
outside = [
    ('AI layer calls', 'Part/PCB photos + CAD-derived summaries → route to a private AI endpoint (§ next slides)', AMBER),
    ('Live part pricing (optional, OFF by default)', 'Part-number text only — keep off, or approve separately', MUTED),
    ('News ticker feeds', 'Public news fetch, no company data — switch off or proxy', MUTED),
]
for i, (a, b, c) in enumerate(outside):
    y = Inches(2.7 + i * 1.28)
    box(s, Inches(8.6), y, Inches(0.09), Inches(1.1), fill=c)
    text(s, Inches(8.85), y, Inches(3.9), Inches(1.25),
         [[(a, 12, DARK, True)], [(b, 10.5, BODY, False)]], space_after=2, line_spacing=1.05)
notes(s, "The whole security story on one slide. Green, left: what already stays inside — CAD processing, all cost "
         "engines, the learning loop, reports. That is the overwhelming majority of the platform. Amber, right: the "
         "three flows that currently go out. The AI layer is the one that matters — photos and derived summaries — "
         "and the next slides show how we bring it under our control. The other two are optional conveniences we "
         "simply switch off.")

# ═══════════════ 7 — DEPLOYMENT OPTIONS ═══════════════
s = header('Deployment options — our recommendation', 'Decision')
cols = [
    ('OPTION A', 'Fully air-gapped', 'Everything on our VMs. AI features off (or a self-hosted model later). Deterministic engines fully working.',
     'Zero external connections — provable today', 'Reduced AI capability', PANEL, MUTED),
    ('OPTION B  ★ RECOMMENDED', 'Private AI, on-prem core', 'Platform on our VMs. AI calls go to Claude running in OUR OWN cloud tenancy over a private link — no public internet, no data retention.',
     'Full capability + contractual & technical data control', 'Requires cloud tenancy sign-off', PANEL2, BLUE),
    ('OPTION C', 'Public AI API', 'Platform on-prem but AI calls to the public API.',
     'Simplest', 'Fails our requirement — photos would traverse a public API', PANEL, RED),
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
     [[('Recommendation: Option B — with Option A available immediately for the most sensitive programmes.', 13, DARK, True)]])
notes(s, "Three ways to deploy. Option A: fully air-gapped — everything on our machines, zero external connections, "
         "available today, but the vision AI features are reduced. Option C is the public API — I include it only to "
         "reject it, because photos would traverse a public endpoint. Option B is our recommendation: the platform "
         "runs on-premise, and the AI model runs in OUR OWN cloud tenancy, reached over a private link with a "
         "no-data-retention configuration. Full capability, and both contractual and technical control of the data. "
         "And note — the two options combine: the most sensitive programmes can run air-gapped while the rest use B.")

# ═══════════════ 8 — TARGET ARCHITECTURE ═══════════════
s = header('Target architecture — everything inside our walls', 'Architecture')
box(s, Inches(0.45), Inches(1.95), Inches(9.2), Inches(4.95), fill=PANEL, round_=True, radius=0.04)
text(s, Inches(0.7), Inches(2.05), Inches(8.5), Inches(0.3), [[('COMPANY INTERNAL NETWORK', 11, MUTED, True)]])
flow_box(s, Inches(0.85), Inches(2.45), Inches(4.0), Inches(0.75), 'Engineers (browser)  +  CAPEE', 'single sign-on (Azure AD)', BLUE, fill=BG)
flow_box(s, Inches(5.15), Inches(2.45), Inches(4.2), Inches(0.75), 'Corporate API Gateway', 'authentication · rate limits · audit logs', INDIGO, fill=BG)
down_arrow(s, Inches(2.7), Inches(3.28))
down_arrow(s, Inches(7.1), Inches(3.28))
flow_box(s, Inches(0.85), Inches(3.68), Inches(8.5), Inches(1.05), 'CostVision server (frontend + backend on our VM)',
         'geometry engine (CAD, in-memory) · 18 cost engines · learning loop · report generation', VIOLET, fill=BG)
down_arrow(s, Inches(2.7), Inches(4.82))
down_arrow(s, Inches(7.1), Inches(4.82))
flow_box(s, Inches(0.85), Inches(5.22), Inches(4.0), Inches(0.85), 'Corporate database (PostgreSQL)', 'rates · knowledge base · encrypted at rest', CYAN, fill=BG)
flow_box(s, Inches(5.15), Inches(5.22), Inches(4.2), Inches(0.85), 'Internal AI gateway', 'ONLY allowed exit · inspected · logged', AMBER, fill=BG)
box(s, Inches(10.0), Inches(4.9), Inches(2.9), Inches(2.0), fill=PANEL2, round_=True, radius=0.08)
text(s, Inches(10.2), Inches(5.05), Inches(2.5), Inches(1.8),
     [[('Our cloud tenancy', 12.5, BLUE, True)],
      [('Claude on AWS Bedrock / Google Vertex', 10.5, BODY, False)],
      [('private link · no public internet · zero data retention', 10, MUTED, False)]],
     space_after=4, line_spacing=1.1)
arr = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(9.42), Inches(5.5), Inches(0.55), Inches(0.3))
arr.fill.solid(); arr.fill.fore_color.rgb = AMBER; arr.line.fill.background(); arr.shadow.inherit = False
text(s, Inches(10.0), Inches(2.45), Inches(2.9), Inches(2.2),
     [[('Zero-trust rules', 12.5, DARK, True)],
      [('• Every request authenticated (Azure AD)', 10.5, BODY, False)],
      [('• Deny-all egress except the AI gateway', 10.5, BODY, False)],
      [('• Role-based access (engineer / lead / admin / CAPEE service)', 10.5, BODY, False)],
      [('• CAD pulled from PLM vault, never stored', 10.5, BODY, False)]],
     space_after=4, line_spacing=1.1)
notes(s, "The target architecture. Everything in the grey box is inside our network: engineers and CAPEE come through "
         "the corporate gateway with single sign-on; the CostVision server — frontend and backend — runs on our "
         "virtual machine, with the CAD geometry engine inside it; the database is our standard encrypted PostgreSQL. "
         "The only permitted exit is the internal AI gateway at the bottom — one door, inspected and logged — which "
         "connects over a private link to the AI model running in our own cloud tenancy with zero data retention. "
         "On the right, the zero-trust rules: authenticate everything, deny all other egress, role-based access, and "
         "CAD comes from the PLM vault and is never stored. If presenting live, a simple Fade animation on each layer "
         "of this diagram works well.")

# ═══════════════ 9 — CAD PROTECTION ═══════════════
s = header('How CAD data is protected', 'CAD data protection')
rows = [
    ('CAD model opened & measured', 'Inside our backend (OCCT engine)', 'Already local — verified'),
    ('Feature detection (holes, threads, walls)', 'Inside our backend', 'Already local — verified'),
    ('BOM extraction from files', 'Inside our backend (local parsers)', 'Already local — verified'),
    ('Cost calculation & learning', 'Inside our backend + our database', 'Already local — verified'),
    ('Photo analysis & AI narrative', 'Private AI endpoint (Option B)', 'The one change we make'),
    ('CAD file storage', 'Nowhere — processed in memory only', 'Files never written to disk'),
]
for i, (a, b, c) in enumerate(rows):
    y = Inches(2.1 + i * 0.73)
    bgc = PANEL if i % 2 == 0 else BG
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.62), fill=bgc, round_=True, radius=0.14)
    text(s, Inches(0.8), y + Inches(0.12), Inches(4.9), Inches(0.4), [[(a, 12.5, DARK, True)]])
    text(s, Inches(5.8), y + Inches(0.12), Inches(3.8), Inches(0.4), [[(b, 12, BODY, False)]])
    good = 'change' not in c and 'never' not in c
    col = GREEN if 'verified' in c or 'never' in c else AMBER
    text(s, Inches(9.7), y + Inches(0.12), Inches(3.0), Inches(0.4), [[(('✓  ' if col == GREEN else '→  ') + c, 11.5, col, True)]])
text(s, Inches(0.45), Inches(6.6), Inches(12.4), Inches(0.6),
     [[('Plus: logs never contain CAD payloads; metadata goes to the corporate SIEM; an "air-gapped" switch lets '
        'security PROVE zero egress in a witnessed firewall test.', 12, MUTED, False, True)]], line_spacing=1.15)
notes(s, "Function by function: where does CAD data actually go? Opening and measuring the model, detecting features, "
         "extracting BOMs, calculating cost — all of it already happens inside our backend, verified in code. "
         "The single amber row is photo analysis and AI narrative, which moves to the private AI endpoint. And note "
         "the last row — CostVision never stores CAD files at all; they are processed in memory and released. "
         "We will also give security an air-gapped switch so they can prove zero egress in a witnessed test, "
         "not take our word for it.")

# ═══════════════ 10 — CAPEE INTEGRATION ═══════════════
s = header('CAPEE + CostVision — better together', 'Integration')
box(s, Inches(0.45), Inches(2.0), Inches(5.6), Inches(2.1), fill=PANEL, round_=True, radius=0.06)
text(s, Inches(0.75), Inches(2.2), Inches(5.0), Inches(1.8),
     [[('CAPEE  (stays the front door)', 15, DARK, True)],
      [('• Costing workflow, approvals, reporting', 12, BODY, False)],
      [('• System of record — unchanged for users', 12, BODY, False)],
      [('• Calls CostVision services behind the scenes', 12, BODY, False)]],
     space_after=5, line_spacing=1.12)
box(s, Inches(7.3), Inches(2.0), Inches(5.6), Inches(2.1), fill=PANEL2, round_=True, radius=0.06)
text(s, Inches(7.6), Inches(2.2), Inches(5.0), Inches(1.8),
     [[('CostVision  (the engine behind it)', 15, BLUE, True)],
      [('• 18 physics cost engines + CAD reading', 12, BODY, False)],
      [('• AI memory: similar parts, self-calibration', 12, BODY, False)],
      [('• Autonomous findings for sourcing', 12, BODY, False)]],
     space_after=5, line_spacing=1.12)
a1 = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(6.15), Inches(2.45), Inches(1.05), Inches(0.4))
a1.fill.solid(); a1.fill.fore_color.rgb = BLUE; a1.line.fill.background(); a1.shadow.inherit = False
a2 = s.shapes.add_shape(MSO_SHAPE.LEFT_ARROW, Inches(6.15), Inches(3.15), Inches(1.05), Inches(0.4))
a2.fill.solid(); a2.fill.fore_color.rgb = GREEN; a2.line.fill.background(); a2.shadow.inherit = False
text(s, Inches(5.95), Inches(2.1), Inches(1.5), Inches(0.3), [[('requests', 9.5, BLUE, True)]], align=PP_ALIGN.CENTER)
text(s, Inches(5.95), Inches(3.6), Inches(1.5), Inches(0.3), [[('AI answers', 9.5, GREEN, True)]], align=PP_ALIGN.CENTER)
box(s, Inches(0.45), Inches(4.5), Inches(12.45), Inches(2.3), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(4.7), Inches(11.9), Inches(0.35), [[('What flows over the connection (internal APIs that already exist)', 13.5, DARK, True)]])
flows = [
    ('Cost a part →', 'full should-cost with breakdown'),
    ('CAD file →', 'geometry + auto-filled inputs'),
    ('New part →', 'similar past parts + suggestions'),
    ('PO price →', 'feeds the learning loop automatically'),
    ('Dashboard ←', 'autonomous findings (£/yr)'),
    ('One shared →', 'rate library & knowledge database'),
]
for i, (a, b) in enumerate(flows):
    x = Inches(0.75 + (i % 3) * 4.1); y = Inches(5.2 + (i // 3) * 0.75)
    text(s, x, y, Inches(3.9), Inches(0.7),
         [[(a + ' ', 12, BLUE, True), (b, 11.5, BODY, False)]], line_spacing=1.1)
notes(s, "The integration philosophy: CAPEE stays the front door — the workflow, approvals and reporting our teams "
         "already know. CostVision becomes the engine behind it, called over internal APIs that already exist. "
         "The six flows that matter: CAPEE sends a part, gets a full should-cost back. It sends a CAD file, gets "
         "auto-filled inputs. It asks about a new part, gets similar history and suggestions. And the best one: "
         "every PO price CAPEE already captures feeds the learning loop automatically — CAPEE's data makes "
         "CostVision smarter without anyone lifting a finger. One shared rate library and knowledge database means "
         "one version of the truth.")

# ═══════════════ 11 — WHAT EACH SIDE NEEDS ═══════════════
s = header('What each side needs to change', 'Scope of work')
box(s, Inches(0.45), Inches(2.05), Inches(6.0), Inches(4.55), fill=PANEL2, round_=True, radius=0.05)
text(s, Inches(0.75), Inches(2.25), Inches(5.4), Inches(0.4), [[('CostVision — 6 bounded items', 15, BLUE, True)]])
cv = [
    ('Private AI routing', 'point the AI client at our endpoint (config + small factory)'),
    ('"Air-gapped" switch', 'provably disable all external calls'),
    ('Azure AD sign-on', 'replace local logins with company SSO'),
    ('PostgreSQL', 'move from file database to the corporate DB estate'),
    ('Cost API wrapper', 'one clean endpoint per commodity for CAPEE'),
    ('Audit hardening', 'admin audit table + logs to SIEM'),
]
for i, (a, b) in enumerate(cv):
    y = Inches(2.75 + i * 0.63)
    text(s, Inches(0.75), y, Inches(5.5), Inches(0.6),
         [[(f'{i+1}. ' + a + ' — ', 12, DARK, True), (b, 11, BODY, False)]], line_spacing=1.05)
box(s, Inches(6.85), Inches(2.05), Inches(6.05), Inches(4.55), fill=PANEL, round_=True, radius=0.05)
text(s, Inches(7.15), Inches(2.25), Inches(5.4), Inches(0.4), [[('CAPEE — small, additive changes', 15, VIOLET, True)]])
cap = [
    ('Backend', 'HTTP client to call CostVision + token handling; hook PO prices into the learning API', 'Small'),
    ('User interface', 'an "AI insights" panel on the costing screen; a CAD-upload button; a findings widget', 'Medium'),
    ('Data', 'adopt the shared rate library; one-off import of historical quotes to seed the memory', 'Small–Medium'),
]
for i, (a, b, sz) in enumerate(cap):
    y = Inches(2.8 + i * 1.25)
    text(s, Inches(7.15), y, Inches(5.5), Inches(1.2),
         [[(a + '  ', 13, DARK, True), ('· ' + sz, 11, VIOLET, True)],
          [(b, 11.5, BODY, False)]], space_after=3, line_spacing=1.12)
text(s, Inches(0.45), Inches(6.8), Inches(12.4), Inches(0.45),
     [[('Total critical path: ~4–6 engineering weeks. No architectural surgery on either side.', 13.5, DARK, True)]])
notes(s, "The scope of work, honestly sized. CostVision needs six bounded changes — private AI routing, the air-gap "
         "switch, company single sign-on, the corporate database, a clean API wrapper for CAPEE, and audit hardening. "
         "CAPEE's changes are additive, not invasive: a client in the backend, an AI-insights panel in the UI, and "
         "adopting the shared rate library — plus a one-off import of historical quotes so the memory starts smart. "
         "Total critical path: four to six engineering weeks. Nothing here is architectural surgery.")

# ═══════════════ 12 — SECURITY & COMPLIANCE ═══════════════
s = header('Security & compliance — how we tick the boxes', 'Compliance')
comp = [
    ('Encryption', 'TLS everywhere in transit; encrypted database at rest; CAD never stored at all', GREEN),
    ('Access control', 'Azure AD single sign-on; roles mapped to AD groups; CAPEE uses a least-privilege service account', BLUE),
    ('Data-loss prevention', 'One AI exit door, inspected and logged; firewall denies everything else; witnessed air-gap test', AMBER),
    ('Audit trails', 'Every rate change, knowledge write and admin action attributable to a user; logs to corporate SIEM', VIOLET),
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
       ('ISO 27001 — covered by the controls above, add to ISMS scope  ·  SOC 2 — inherited from the cloud tenancy '
        '(Bedrock/Vertex are certified)  ·  GDPR — minimal personal data, zero-retention AI, EU region  ·  '
        'ISO/SAE 21434 — engineering IT tool, out of vehicle scope; supply-chain review (SBOM) in CI.', 12, BODY, False)]],
     line_spacing=1.25)
notes(s, "For the compliance-minded: encryption everywhere, and the strongest control of all for CAD — it is never "
         "stored. Access is company single sign-on with role mapping. Data-loss prevention comes down to one "
         "inspected exit door and a firewall that denies everything else — and security can witness the air-gap test "
         "themselves. Full audit trails to our SIEM. On standards: ISO 27001 is covered by these controls; SOC 2 is "
         "inherited from the certified cloud services; GDPR exposure is minimal with zero-retention AI in the EU "
         "region; and for automotive cyber, this is an engineering IT tool outside the vehicle scope, with "
         "supply-chain checks built into the build pipeline.")

# ═══════════════ 13 — ROLLOUT TIMELINE ═══════════════
s = header('Rollout — six phases, value from week eight', 'Plan')
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
    r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = BG; r.font.name = 'Calibri'
    p2 = tf.add_paragraph(); r2 = p2.add_run(); r2.text = d
    r2.font.size = Pt(9.5); r2.font.color.rgb = RGBColor(0xE8, 0xEE, 0xFF); r2.font.name = 'Calibri'
gates = [
    ('Phase 3 exit gate', 'Security-witnessed test: firewall blocks all egress, full test suite passes, zero unexpected traffic.'),
    ('Phase 4 exit gate', 'A cost engineer completes a real costing from inside CAPEE with AI insights; accuracy dashboard live.'),
    ('First value', 'Week ~8: pilot users get similar-part suggestions; sourcing sees the first autonomous findings.'),
]
for i, (a, b) in enumerate(gates):
    y = Inches(3.9 + i * 0.95)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.82), fill=PANEL, round_=True, radius=0.12)
    box(s, Inches(0.45), y, Inches(0.09), Inches(0.82), fill=BLUE)
    text(s, Inches(0.75), y + Inches(0.1), Inches(2.6), Inches(0.4), [[(a, 12.5, BLUE, True)]])
    text(s, Inches(3.5), y + Inches(0.1), Inches(9.2), Inches(0.65), [[(b, 11.5, BODY, False)]], line_spacing=1.1)
notes(s, "Six phases. The first two — assessment and design — are what we're asking approval for today. Phase three "
         "is a sealed pilot with dummy CAD data, and its exit gate is a security-witnessed test: firewall blocking "
         "everything, full test suite passing, zero unexpected traffic. Phase four connects CAPEE, with a real "
         "costing done end-to-end by a cost engineer as the gate. Rollout and then steady-state governance follow. "
         "First tangible value lands around week eight, when pilot users start getting similar-part suggestions "
         "and sourcing sees the first autonomous findings.")

# ═══════════════ 14 — RISKS ═══════════════
s = header('Risks — and how we manage them', 'Honest view')
risks = [
    ('Cloud tenancy not approved', 'Medium', 'Fall back to Option A (air-gapped) — deterministic engines keep full value today; add a self-hosted vision model later if needed.', AMBER),
    ('Learning depends on logged quotes', 'Medium', 'The CAPEE PO-price hook automates it — quotes flow in without anyone changing habits. Plus a one-off historical import to start smart.', BLUE),
    ('Single-team knowledge of the platform', 'Low–Med', '790 automated tests, written architecture docs, and a named CAPEE-side maintainer trained during Phase 4.', VIOLET),
    ('Adoption ("another tool")', 'Low', 'Users stay in CAPEE — CostVision works behind the scenes. Nothing new to learn except better answers appearing.', GREEN),
]
for i, (t, sev, m, c) in enumerate(risks):
    y = Inches(2.05 + i * 1.18)
    box(s, Inches(0.45), y, Inches(12.45), Inches(1.02), fill=PANEL, round_=True, radius=0.09)
    box(s, Inches(0.45), y, Inches(0.09), Inches(1.02), fill=c)
    text(s, Inches(0.75), y + Inches(0.12), Inches(4.4), Inches(0.45), [[(t, 13, DARK, True)]])
    text(s, Inches(0.75), y + Inches(0.55), Inches(2.0), Inches(0.35), [[('Likelihood: ' + sev, 10.5, c, True)]])
    text(s, Inches(5.3), y + Inches(0.12), Inches(7.4), Inches(0.85),
         [[('Mitigation:  ', 11.5, DARK, True), (m, 11.5, BODY, False)]], line_spacing=1.12)
notes(s, "The honest risk view. If the cloud tenancy isn't approved, we don't stall — we fall back to the fully "
         "air-gapped option, which still delivers the deterministic engines and the learning loop. The learning "
         "depends on real quotes being logged — but the CAPEE hook automates that, and a historical import means we "
         "don't start from zero. Platform knowledge is protected by the test suite, documentation and a trained "
         "CAPEE-side maintainer. And adoption risk is low precisely because users stay in CAPEE — for them, the "
         "change is simply that better answers start appearing.")

# ═══════════════ 15 — VERDICT & ASK ═══════════════
s = header('Feasibility verdict — and the ask', 'Decision')
verdicts = [
    ('Secure deployment, CAD fully internal', 'FEASIBLE — CAD already never leaves; one AI endpoint change closes the gap', GREEN),
    ('CAPEE + CostVision integration', 'FEASIBLE — API-first design; CAPEE stays the front door', GREEN),
    ('Changes required', 'Bounded: ~4–6 engineering weeks critical path', BLUE),
    ('Long-term governance', 'Rate-library board · monthly findings review · quarterly access & egress audit', VIOLET),
]
for i, (a, b, c) in enumerate(verdicts):
    y = Inches(2.05 + i * 0.82)
    box(s, Inches(0.45), y, Inches(12.45), Inches(0.7), fill=(PANEL if i % 2 == 0 else BG), round_=True, radius=0.13)
    text(s, Inches(0.8), y + Inches(0.15), Inches(4.6), Inches(0.4), [[(a, 13, DARK, True)]])
    text(s, Inches(5.5), y + Inches(0.15), Inches(7.2), Inches(0.4), [[(b, 12.5, c, True)]])
box(s, Inches(0.45), Inches(5.6), Inches(12.45), Inches(1.25), fill=PANEL2, round_=True, radius=0.07)
text(s, Inches(0.8), Inches(5.8), Inches(11.8), Inches(0.9),
     [[('The ask today:  ', 16, BLUE, True),
       ('approve Phase 1 (IT-Security assessment) and Phase 2 (architecture design) — 5–7 weeks, existing teams. '
        'The full written plan and security checklist are ready for the security review.', 14, BODY, False)]],
     line_spacing=1.2)
box(s, 0, H - Inches(0.16), W, Inches(0.16), fill=INDIGO)
notes(s, "To summarise: secure deployment with CAD fully internal is feasible — in fact, the platform was built that "
         "way; one endpoint change completes it. CAPEE integration is feasible and high-value, with CAPEE remaining "
         "the front door. The changes are bounded — weeks, not months — and governance is defined. The ask today is "
         "simple: approve Phases 1 and 2, the security assessment and the architecture design. The full written plan, "
         "including the security checklist, is ready to hand to the IT-Security team. Thank you — questions welcome.")

OUT = 'CostVision-Implementation-Blueprint.pptx'
prs.save(OUT)
print(f'Wrote {OUT} with {len(prs.slides._sldIdLst)} slides')

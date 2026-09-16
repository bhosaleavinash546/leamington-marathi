"""
Option 3 business case — one slide, on the CAD to Cost business-case form.

The form is JLR's, taken from the Option 2 sheet: header line and title top
left, then Problem Statement (carrying the PII tick box), Current State and
Proposed Solution down the left, Projected ROI and Time top right, Expected
Benefits sitting over the solution box, and the tall Technical Scoping panel
down the right edge. Same boxes in the same places, same fills. Only the words
change, which is the point — a reviewer should be able to lay the two side by
side and read across.

WHAT OPTION 3 IS, AS THE CODE HAS IT. Checked before writing, because a business
case that overstates what exists is found out in the first question:

  * 2D drawings are already read, but only ALONGSIDE a 3D model — `cadFile` is
    required and `drawingPdf` is optional (server/routes/cad.ts). The drawing
    carries what the solid cannot express: tolerances, GD&T, surface finish,
    heat-treatment callouts, gear quality class. Drawing-ONLY costing is not
    built, so the sheet proposes proving it rather than claiming it.
  * PCB photo to BOM is substantially built — a 2,374-line route, eleven
    supporting modules, sixteen test files, with BOM prices grounded against a
    catalogue before they are used.
  * The models are Claude: Sonnet to extract, Opus where a board needs a closer
    look, Haiku for the smaller steps.
  * AIR_GAPPED=1 is what makes Option 2 acceptable under today's policy. Option
    3 needs that switch off and an approved route to the model. That is the ask,
    and the Technical Scoping panel says so rather than burying it.

LANGUAGE. Plain, and nothing that sounds like a brochure. The assistant reads
the input and never sets a price — that sentence is on the sheet because it is
the answer to the question the form does not ask and every reviewer does.
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from copy import deepcopy
import subprocess, os

OUT = 'CostVision-Option-3-Business-Case.pptx'

INK      = RGBColor(0x1F, 0x2A, 0x44)   # headings
BODY     = RGBColor(0x33, 0x33, 0x33)   # bullets
HEADER   = RGBColor(0x59, 0x59, 0x59)   # the small line above the title
OUTLINE  = RGBColor(0xC9, 0xCF, 0xD7)   # box edges
GREEN    = RGBColor(0xE2, 0xEF, 0xDA)
GREEN_ED = RGBColor(0xA9, 0xC4, 0x9A)
BLUE     = RGBColor(0xDE, 0xEA, 0xF6)
BLUE_ED  = RGBColor(0xB4, 0xC7, 0xE7)
FONT     = 'Calibri'

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
s = prs.slides.add_slide(prs.slide_layouts[6])


def spaced(run, points):
    """Letter-spacing. The form's header and title are tracked out wide."""
    run.font._rPr.set('spc', str(int(points * 100)))


def textbox(x, y, w, h):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return tf


def box(x, y, w, h, fill=None, line=OUTLINE, radius=0.035):
    """One rounded panel of the form."""
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.adjustments[0] = radius
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    sh.line.color.rgb = line
    sh.line.width = Pt(1)
    sh.shadow.inherit = False
    sh.text_frame.word_wrap = True
    return sh


def heading(tf, text, size=13, colour=INK, space_after=5):
    p = tf.paragraphs[0] if not tf.paragraphs[0].runs and not tf.paragraphs[0].text else tf.add_paragraph()
    p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.bold = True; r.font.color.rgb = colour; r.font.name = FONT
    p.space_after = Pt(space_after)
    return p


def bullet(tf, text, lead=None, size=10.5, colour=BODY, indent=0.17, space_before=4):
    """
    A real bullet with a hanging indent, not a '•' typed in front of the text.
    The difference shows the moment a line wraps, which on this sheet is most
    of them.
    """
    p = tf.add_paragraph()
    p.alignment = PP_ALIGN.LEFT
    pPr = p._p.get_or_add_pPr()
    pPr.set('marL', str(Emu(Inches(indent)).emu if hasattr(Emu(Inches(indent)), 'emu') else int(Inches(indent))))
    pPr.set('indent', str(-int(Inches(indent))))
    buFont = pPr.makeelement(qn('a:buFont'), {'typeface': 'Arial'})
    buChar = pPr.makeelement(qn('a:buChar'), {'char': '•'})
    pPr.append(buFont); pPr.append(buChar)
    if lead:
        r = p.add_run(); r.text = lead
        r.font.size = Pt(size); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.color.rgb = colour; r.font.name = FONT
    p.space_before = Pt(space_before)
    p.line_spacing = 1.0
    return p


def plain(tf, text, size=10.5, colour=BODY, bold=False, space_before=3):
    p = tf.add_paragraph()
    p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = colour; r.font.name = FONT
    p.space_before = Pt(space_before)
    p.line_spacing = 1.0
    return p


def panel_text(x, y, w, h):
    """
    The words of a panel, in their own frame rather than in the panel's.

    PowerPoint does not flow text around an overlapping shape, and this form has
    the Expected Benefits box sitting on top of the Proposed Solution panel. Set
    in the panel's own frame the bullets ran straight underneath it. Giving each
    block its own frame is also what stops a panel silently growing text out
    through its bottom edge.
    """
    return textbox(x, y, w, h)


# ── Header and title ─────────────────────────────────────────────────────────
tf = textbox(0.62, 0.22, 8.0, 0.30)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'CAD to COST BUSINESS CASE'
r.font.size = Pt(11); r.font.color.rgb = HEADER; r.font.name = FONT
spaced(r, 2.2)

tf = textbox(0.62, 0.64, 11.0, 0.42)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'Drawings and PCB Photos \u2013 Automated Part Costing'
r.font.size = Pt(17); r.font.color.rgb = INK; r.font.name = FONT
spaced(r, 2.4)

# ── Problem Statement ────────────────────────────────────────────────────────
box(0.42, 1.14, 6.22, 1.96)
tf = panel_text(0.66, 1.26, 4.10, 0.28)
heading(tf, 'Problem Statement')
tf = panel_text(0.66, 1.50, 5.78, 1.52)
bullet(tf, 'Costing a circuit board means listing every component on it and pricing each one. A '
           'medium-complexity board takes two to three weeks.', size=9.5, space_before=0)
bullet(tf, 'It needs someone who knows what electronics cost \u2014 a small capacitor, a six-layer '
           'board, placing a fine-pitch chip. Few people have that, so boards wait for them.', size=9.5)
bullet(tf, 'On mechanical parts, most of what we need is written on the 2D drawing, not held in the '
           '3D model, and is read by eye and typed in by hand.', size=9.5)
bullet(tf, 'The costing method and the rate data do not change. Only the reading changes.', size=9.5)

# The PII question, answered. Drawings and board photos carry no personal data.
tf = textbox(4.86, 1.30, 0.60, 0.28)
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.RIGHT
r = p.add_run(); r.text = 'PII:'
r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT
tick = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.54), Inches(1.26), Inches(0.38), Inches(0.34))
tick.fill.background(); tick.line.color.rgb = INK; tick.line.width = Pt(1.25); tick.shadow.inherit = False
tf = tick.text_frame
tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
tf.vertical_anchor = MSO_ANCHOR.MIDDLE
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = 'No'
r.font.size = Pt(10.5); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT

# ── Projected ROI ────────────────────────────────────────────────────────────
box(6.88, 1.12, 2.98, 1.38, fill=GREEN, line=GREEN_ED)
tf = panel_text(7.08, 1.24, 2.60, 1.10)
heading(tf, 'Projected ROI', size=12.5, space_after=3)
plain(tf, 'Cost: \u00a3???', size=11, colour=INK, bold=True, space_before=4)
plain(tf, 'Return: \u00a3???', size=11, colour=INK, bold=True, space_before=2)
plain(tf, 'What is the return based on?', size=10, colour=INK, bold=True, space_before=4)
plain(tf, 'The boards we turn away, and the weeks a specialist spends on each one.',
      size=8.5, space_before=1)

# ── Time ─────────────────────────────────────────────────────────────────────
box(6.88, 2.56, 2.98, 0.54, fill=BLUE, line=BLUE_ED)
tf = panel_text(7.08, 2.63, 2.60, 0.42)
heading(tf, 'Time (hrs/week)', size=12, space_after=0)
# Stated as it was given — per board, not per week. The form asks for hrs/week
# and this is elapsed time, so it is written the way it is true rather than
# converted into the box's units and quietly becoming a different claim.
plain(tf, '2\u20133 weeks per board', size=10, colour=INK, bold=True, space_before=2)

# ── Current State ────────────────────────────────────────────────────────────
box(0.30, 3.14, 9.36, 1.42)
tf = panel_text(0.56, 3.24, 3.00, 0.28)
heading(tf, 'Current State')
tf = panel_text(0.56, 3.48, 8.90, 1.00)
bullet(tf, 'Costing one board means listing every component, pricing each line, then estimating the '
           'bare board and the assembly. Two to three weeks for a medium board.', size=9.5,
       space_before=0)
bullet(tf, 'It needs an electronics cost specialist, and a design change means starting again.',
       size=9.5)
bullet(tf, 'For a machined part, the drawing is read by eye and typed into CAPPe by hand.', size=9.5)

# ── Proposed Solution ────────────────────────────────────────────────────────
box(0.40, 4.66, 9.20, 1.94)
tf = panel_text(0.66, 4.76, 4.00, 0.28)
heading(tf, 'Proposed Solution/Model')
# Narrow on purpose: the Expected Benefits box overlaps this panel and
# PowerPoint will not flow text around it.
tf = panel_text(0.66, 5.04, 5.10, 1.44)
bullet(tf, 'Conduct a 3-stage Proof of Value (PoV), run the same way as the CAD to Cost PoV.',
       size=9.5, space_before=0)
bullet(tf, 'Upload a photo of the board, or a drawing alongside the 3D model. The tool reads it and '
           'returns a full cost.', size=9.5)
bullet(tf, 'Everything it reads is checked before it is used. It does not set any price.', size=9.5)
bullet(tf, 'The detail is on the next page.', size=9.5)

# ── Expected Benefits ────────────────────────────────────────────────────────
box(5.92, 4.82, 3.54, 1.60, fill=GREEN, line=GREEN_ED)
tf = panel_text(6.14, 4.92, 3.10, 0.28)
heading(tf, 'Expected Benefits:', size=12.5)
tf = panel_text(6.14, 5.22, 3.10, 1.12)
bullet(tf, 'A cost engineer can cost a board without being an electronics specialist.',
       lead='No Specialist Needed: ', size=9.5, space_before=0)
bullet(tf, 'We can cost the boards and parts we turn away today.',
       lead='Wider Coverage: ', size=9.5, space_before=6)

# ── Technical Scoping ────────────────────────────────────────────────────────
box(9.98, 3.42, 3.06, 3.84)
tf = panel_text(10.20, 3.58, 2.62, 0.28)
heading(tf, 'Technical Scoping:', size=12.5)
tf = panel_text(10.20, 3.80, 2.64, 3.26)
plain(tf, 'Enabling AI on an existing system?', size=11, colour=INK, bold=True, space_before=0)
plain(tf, '(YES)', size=11, colour=INK, bold=True, space_before=1)
plain(tf, 'The reading is done inside CostVision. CAPPe is not changed.', size=9, space_before=2)
plain(tf, 'Model used: Claude (Anthropic)', size=11, colour=INK, bold=True, space_before=13)
plain(tf, 'Sonnet and Haiku to read, Opus where a board needs a closer look.', size=9, space_before=2)
plain(tf, 'Technical implementation/support required?', size=11, colour=INK, bold=True, space_before=13)
plain(tf, '(YES)', size=11, colour=INK, bold=True, space_before=1)
plain(tf, 'It needs an approved route to the model. Option 2 runs with that route switched off. '
          'This one cannot.', size=9, space_before=2)


# ─────────────────────────────────────────────────────────────────────────────
# Slide 2 — the detail, on the Proposal / Expected Benefits layout.
#
# Sheet 1 is the summary a reviewer reads in a minute. This is the page they
# turn to when they ask "so what actually happens?". The heading of each panel
# sits above its box, as on the template.
#
# The left panel carries both halves of the story, under two small sub-heads:
# how a board is costed today, and what we are proposing instead. Putting them
# in one column is what makes the contrast readable — the same five steps, one
# list taking weeks and the other taking an upload.
# ─────────────────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(prs.slide_layouts[6])

tf = textbox(0.62, 0.52, 11.0, 0.42)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'Drawings and PCB Photos \u2013 The Proposal in Detail'
r.font.size = Pt(17); r.font.color.rgb = INK; r.font.name = FONT
spaced(r, 2.4)


def subhead(tf, text, space_before=0):
    """A small label inside a panel, marking off one half of the list."""
    pr = tf.add_paragraph()
    pr.alignment = PP_ALIGN.LEFT
    rr = pr.add_run(); rr.text = text
    rr.font.size = Pt(11.5); rr.font.bold = True; rr.font.color.rgb = INK; rr.font.name = FONT
    pr.space_before = Pt(space_before)
    return pr


# ── Proposal ─────────────────────────────────────────────────────────────────
tf = textbox(0.84, 1.06, 4.00, 0.30)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'Proposal'
r.font.size = Pt(13.5); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT

box(0.62, 1.34, 6.02, 5.46)
tf = panel_text(0.92, 1.48, 5.44, 5.16)
subhead(tf, 'How a board is costed today')
bullet(tf, 'Someone identifies every component from a photo or a sample \u2014 package, value, rating, '
           'and the exact part number for each chip.', size=10.5, space_before=6)
bullet(tf, 'They find a price for every line, at the volume we are asking about.', size=10.5, space_before=6)
bullet(tf, 'The bare board is estimated separately for size, layers, finish and test.', size=10.5, space_before=6)
bullet(tf, 'Then the assembly: how many placements, how many are fine-pitch or BGA, one side or two.',
       size=10.5, space_before=6)
bullet(tf, 'Two to three weeks for a medium board, and only a specialist can do it.', size=10.5, space_before=6)

subhead(tf, 'What we propose', space_before=14)
bullet(tf, 'Extend the Proof of Value to cover 2D drawings and photographs of boards.', size=10.5,
       space_before=7)
bullet(tf, 'Upload a photo of the board. Say how many you are making and where it is built.',
       size=10.5, space_before=6)
bullet(tf, 'The tool lists the components it can see, prices each line from the catalogue, works out '
           'the bare board and the assembly, and returns the full cost breakdown.', size=10.5, space_before=6)
bullet(tf, 'For a machined part, the drawing is read alongside the 3D model, for the tolerances, '
           'finish and heat treatment the model cannot carry.', size=10.5, space_before=6)
bullet(tf, 'Every figure it reads is checked against the price catalogue or the measured geometry '
           'before it is used.', size=10.5, space_before=6)
bullet(tf, 'Compare the output against cost estimates we already have.', size=10.5, space_before=6)

# ── Expected Benefits ────────────────────────────────────────────────────────
tf = textbox(7.20, 1.28, 4.00, 0.30)
p = tf.paragraphs[0]
r = p.add_run(); r.text = 'Expected Benefits:'
r.font.size = Pt(13.5); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT

box(6.98, 1.56, 5.76, 5.24)
tf = panel_text(7.28, 1.78, 5.18, 4.90)
bullet(tf, 'A cost engineer can cost a board without being an electronics pricing specialist. The '
           'specialist checks the answer instead of building it.', size=11, space_before=0)
bullet(tf, 'We can cost the boards and the parts we turn away today, because a photograph or a '
           'drawing is all we have.', size=11, space_before=22)
bullet(tf, 'A cost can be redone when the design changes, instead of going out of date and staying '
           'that way.', size=11, space_before=22)
bullet(tf, 'The costing method and the rate data do not change, so the answer is consistent with '
           'what we produce today and with everything downstream.', size=11, space_before=22)
bullet(tf, 'Boards can be costed early, while the design can still be changed cheaply.', size=11,
       space_before=22)
bullet(tf, 'Cost engineers stay in charge. Every figure is theirs to check, correct and sign off, '
           'and the tool never sets a price itself.', size=11, space_before=22)

prs.save(OUT)
print(OUT)

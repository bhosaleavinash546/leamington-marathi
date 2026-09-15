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
box(0.42, 1.14, 6.22, 1.92)
tf = panel_text(0.66, 1.28, 4.10, 0.28)
heading(tf, 'Problem Statement')
tf = panel_text(0.66, 1.52, 5.78, 1.46)
bullet(tf, 'Most of what a cost engineer needs is written on the 2D drawing, not held in the 3D '
           'model. Tolerances, surface finish, heat treatment and material notes are read by eye '
           'and typed in by hand.', size=9.5, space_before=0)
bullet(tf, 'Many parts never reach us as a 3D model. We are sent a drawing. For electronics we are '
           'sent a photograph of the board.', size=9.5)
bullet(tf, 'The costing method and the rate data do not change. This is only about reading the input.',
       size=9.5)

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
box(6.88, 1.14, 2.98, 1.36, fill=GREEN, line=GREEN_ED)
tf = panel_text(7.08, 1.26, 2.60, 1.12)
heading(tf, 'Projected ROI', size=12.5, space_after=3)
plain(tf, 'Cost: \u00a3???', size=11, colour=INK, bold=True, space_before=4)
plain(tf, 'Return: \u00a3???', size=11, colour=INK, bold=True, space_before=2)
plain(tf, 'What is the return based on?', size=10, colour=INK, bold=True, space_before=4)
plain(tf, 'Parts we cannot cost today, plus the hours spent reading drawings by hand.',
      size=8.5, space_before=1)

# ── Time ─────────────────────────────────────────────────────────────────────
box(6.88, 2.62, 2.98, 0.42, fill=BLUE, line=BLUE_ED)
tf = panel_text(7.08, 2.72, 2.60, 0.24)
heading(tf, 'Time (hrs/week)', size=12, space_after=0)

# ── Current State ────────────────────────────────────────────────────────────
box(0.30, 3.12, 9.36, 1.76)
tf = panel_text(0.56, 3.22, 3.00, 0.28)
heading(tf, 'Current State')
tf = panel_text(0.56, 3.46, 8.90, 1.34)
bullet(tf, 'A cost engineer reads the drawing, notes the tolerances, finish and heat treatment, and '
           'types them into CAPPe alongside the figures taken off the model.', size=9.5, space_before=0)
bullet(tf, 'For a circuit board, someone lists every component by hand from a photograph or a sample '
           'board, then prices each line before any costing can begin.', size=9.5)
bullet(tf, 'Because it takes so long, we cost the parts we are asked about rather than the ones worth '
           'asking about, and a cost is rarely revisited when the design moves on.', size=9.5)

# ── Proposed Solution ────────────────────────────────────────────────────────
box(0.40, 4.92, 9.20, 2.34)
tf = panel_text(0.66, 5.04, 4.00, 0.28)
heading(tf, 'Proposed Solution/Model')
# Narrow on purpose: the Expected Benefits box starts at 5.92 and PowerPoint
# will not flow text around it.
tf = panel_text(0.66, 5.32, 5.10, 1.86)
bullet(tf, 'Conduct a 3-stage Proof of Value (PoV) project, run the same way as the CAD to Cost PoV.',
       size=9.5, space_before=0)
bullet(tf, 'Use an assistant to read the 2D drawing and the board photo and write down what it found '
           '\u2014 tolerances, finish and heat treatment for a part, the component list for a board.',
       size=9.5)
bullet(tf, 'Everything it reads is checked against the measured geometry or a price catalogue before '
           'it is used. It reads the input. It does not set any price.', size=9.5)
bullet(tf, 'Generate cost estimates for a sample of parts and boards, and validate outputs vs '
           'existing cost estimates.', size=9.5)

# ── Expected Benefits ────────────────────────────────────────────────────────
box(5.92, 5.10, 3.54, 2.00, fill=GREEN, line=GREEN_ED)
tf = panel_text(6.14, 5.22, 3.10, 0.28)
heading(tf, 'Expected Benefits:', size=12.5)
tf = panel_text(6.14, 5.56, 3.10, 1.44)
bullet(tf, 'Cost the parts and boards we cannot cost today, because a drawing or a photograph is '
           'all we have.', lead='Wider Coverage: ', size=9.5, space_before=0)
bullet(tf, 'Fewer mistakes copying figures across, and the same drawing read the same way every time.',
       lead='Improved Quality: ', size=10, space_before=6)

# ── Technical Scoping ────────────────────────────────────────────────────────
box(9.98, 3.42, 3.06, 3.84)
tf = panel_text(10.20, 3.58, 2.62, 0.28)
heading(tf, 'Technical Scoping:', size=12.5)
tf = panel_text(10.20, 3.84, 2.64, 3.32)
plain(tf, 'Enabling AI on an existing system?', size=11, colour=INK, bold=True, space_before=0)
plain(tf, '(YES)', size=11, colour=INK, bold=True, space_before=1)
plain(tf, 'The reading is done inside CostVision. CAPPe is not changed.', size=9, space_before=2)
plain(tf, 'Model used: Claude (Anthropic)', size=11, colour=INK, bold=True, space_before=11)
plain(tf, 'Sonnet and Haiku to read, Opus where a board needs a closer look.', size=9, space_before=2)
plain(tf, 'Technical implementation/support required?', size=11, colour=INK, bold=True, space_before=11)
plain(tf, '(YES)', size=11, colour=INK, bold=True, space_before=1)
plain(tf, 'It needs an approved route to the model. Option 2 runs with that route switched off. '
          'This one cannot.', size=9, space_before=2)

prs.save(OUT)
print(OUT)

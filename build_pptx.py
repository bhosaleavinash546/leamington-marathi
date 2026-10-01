"""
CostVision — 19-Slide Executive Presentation Generator
Produces a professional .pptx file with dark theme, data tables,
two-column layouts and branded colour scheme.
"""

import re
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pptx.oxml.ns import qn
from pptx.oxml import parse_xml
from lxml import etree
import copy

from pptx_fixup import finalise
from brand import rgb, hexcol   # calculator/src/brand/brand.json — shared with the app (I5)

# ─── Brand colours — light theme, matched to CostVision-Workflow-Explained ────
# The palette is deliberately the same set of hex values as build_workflow_deck.mjs
# so the two decks read as one pack when they are presented back to back: a very
# light blue-grey page, white cards, navy headings, and accents dark enough to
# stay legible as TEXT on white (the dark-theme accents were tuned for the
# opposite job and turn to pastel mush on paper and on a bright projector).
#
# The token NAMES are historical — TEXT_W is the primary text colour, not white.
# They are kept because ~300 call sites use them, so the theme is one edit here.
BG          = rgb('page')   # page
SURFACE     = RGBColor(0xF7, 0xF9, 0xFC)   # tinted panel / alternating table row
SURFACE2    = RGBColor(0xFF, 0xFF, 0xFF)   # card
BORDER      = rgb('line')   # hairline rule
ACCENT_B    = rgb('blue')   # blue
ACCENT_G    = rgb('green')   # green
ACCENT_P    = rgb('violet')   # purple
ORANGE      = rgb('amber')   # amber
RED         = rgb('red')   # red
TEXT_W      = rgb('navy')   # primary — navy
TEXT_G      = rgb('slate')   # body — slate
TEXT_D      = rgb('muted')   # secondary — muted
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)

# The title slide stays a dark navy panel, exactly as the Workflow deck's does —
# a light deck still wants one dark plate to open on. These are the only colours
# used against it, and they are the ONLY place white type is correct.
HERO_BG     = rgb('navy')   # navy plate
HERO_PANEL  = RGBColor(0x1E, 0x40, 0x70)   # slightly lifted centre
HERO_TEXT   = RGBColor(0xFF, 0xFF, 0xFF)
HERO_SUB    = RGBColor(0xCA, 0xDC, 0xFC)
HERO_DIM    = RGBColor(0x8F, 0xA3, 0xCC)

# Workflow sets titles in Cambria and everything else in Calibri. Matching that
# is most of what makes the two decks look like siblings.
TITLE_FONT  = 'Cambria'

# Slide dimensions: 16:9 widescreen
W = Inches(13.333)
H = Inches(7.5)

prs = Presentation()
prs.slide_width  = W
prs.slide_height = H

blank_layout = prs.slide_layouts[6]  # blank layout

# ─── Helper functions ─────────────────────────────────────────────────────────

def add_slide():
    slide = prs.slides.add_slide(blank_layout)
    # Fill background
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = BG
    return slide

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


def txb(slide, text, x, y, w, h,
        size=18, bold=False, color=TEXT_W, align=PP_ALIGN.LEFT,
        wrap=True, italic=False, font=None):
    """Add a text box."""
    tf_box = slide.shapes.add_textbox(x, y, w, h)
    tf = tf_box.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    _emit_runs(p, text, size, color, bold, italic, base_font=font)
    return tf_box

def rect(slide, x, y, w, h, fill_color, line_color=None, line_width=Pt(0)):
    """Add a filled rectangle."""
    shape = slide.shapes.add_shape(1, x, y, w, h)   # 1 = MSO_SHAPE_TYPE.RECTANGLE
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = line_width
    else:
        shape.line.fill.background()
    return shape

def accent_bar(slide, x, y, w=Inches(0.5), h=Inches(0.04), color=ACCENT_B):
    """Thin horizontal accent bar."""
    r = rect(slide, x, y, w, h, color)
    return r

def slide_header(slide, slide_num, section_label, title_text, subtitle_text=""):
    """Standard slide header with top bar, slide number, section label, title."""
    # Top navy strip — the Workflow deck's masthead
    rect(slide, 0, 0, W, Inches(0.10), HERO_BG)

    # Slide number (top-left)
    txb(slide, f"SLIDE {slide_num:02d} / 19", Inches(0.35), Inches(0.14), Inches(2), Inches(0.35),
        size=7.5, color=TEXT_D, bold=True)

    # CostVision logo (top-right)
    txb(slide, "CostVision", W - Inches(1.9), Inches(0.12), Inches(1.6), Inches(0.35),
        size=11, bold=True, color=ACCENT_B, align=PP_ALIGN.RIGHT)

    # Horizontal rule under top bar
    rect(slide, 0, Inches(0.52), W, Inches(0.008), BORDER)

    # Section label
    txb(slide, section_label.upper(), Inches(0.5), Inches(0.68), Inches(8), Inches(0.28),
        size=8, bold=True, color=ACCENT_B)

    # Main title
    txb(slide, title_text, Inches(0.5), Inches(0.9), Inches(12), Inches(0.6),
        size=26, bold=True, color=TEXT_W, font=TITLE_FONT)

    # Subtitle
    if subtitle_text:
        txb(slide, subtitle_text, Inches(0.5), Inches(1.45), Inches(12), Inches(0.38),
            size=12, color=TEXT_G)

    # Footer rule
    rect(slide, 0, H - Inches(0.45), W, Inches(0.008), BORDER)
    txb(slide, "CostVision — Should-Cost Engineering  |  Avinash Bhosale  |  Confidential",
        Inches(0.4), H - Inches(0.4), W - Inches(0.8), Inches(0.35),
        size=7.5, color=TEXT_D, align=PP_ALIGN.CENTER)

def card(slide, x, y, w, h, title, body, accent=ACCENT_B, icon="",
         title_pt=9.5, body_pt=8.5):
    """Card with coloured left border, title, body."""
    # Card background
    r = rect(slide, x, y, w, h, SURFACE2, BORDER, Pt(0.5))
    # Accent left border
    rect(slide, x, y, Inches(0.06), h, accent)
    # Icon + Title
    title_text = f"{icon}  {title}" if icon else title
    txb(slide, title_text, x + Inches(0.14), y + Inches(0.1), w - Inches(0.2), Inches(0.34),
        size=title_pt, bold=True, color=TEXT_W)
    # Body
    txb(slide, body, x + Inches(0.14), y + Inches(0.42), w - Inches(0.2), h - Inches(0.54),
        size=body_pt, color=TEXT_G, wrap=True)

def stat_card(slide, x, y, w, h, number, label, color=ACCENT_B, size=28):
    """Stat card with big number."""
    rect(slide, x, y, w, h, SURFACE2, BORDER, Pt(0.5))
    txb(slide, number, x, y + Inches(0.1), w, Inches(0.55),
        size=size, bold=True, color=color, align=PP_ALIGN.CENTER)
    txb(slide, label, x, y + Inches(0.62), w, Inches(0.38),
        size=8, color=TEXT_G, align=PP_ALIGN.CENTER, wrap=True)

def pill(slide, x, y, text, color=ACCENT_B):
    """Small pill badge."""
    w = Inches(2.2)
    h = Inches(0.28)
    rect(slide, x, y, w, h, SURFACE2, color, Pt(0.8))
    txb(slide, text, x + Inches(0.1), y + Inches(0.02), w - Inches(0.15), h,
        size=7.5, color=color, bold=True)

def bullet_block(slide, x, y, w, h, items, title=None, title_color=ACCENT_B):
    """Block of bullet points."""
    yy = y
    if title:
        txb(slide, title, x, yy, w, Inches(0.3),
            size=9.5, bold=True, color=title_color)
        yy += Inches(0.3)
    for item in items:
        # Bullet dot
        rect(slide, x + Inches(0.05), yy + Inches(0.13), Inches(0.06), Inches(0.06), ACCENT_B)
        txb(slide, item, x + Inches(0.22), yy, w - Inches(0.25), Inches(0.36),
            size=8.5, color=TEXT_G, wrap=True)
        yy += Inches(0.33)

def flow_box(slide, x, y, w, h, num, icon, title, body, color=ACCENT_B):
    """Step box for workflow."""
    rect(slide, x, y, w, h, SURFACE2, BORDER, Pt(0.5))
    # Step number circle area
    rect(slide, x, y, w, Inches(0.04), color)
    # Number
    txb(slide, str(num), x, y + Inches(0.06), w, Inches(0.3),
        size=10, bold=True, color=color, align=PP_ALIGN.CENTER)
    # Icon (optional — the deck carries no emoji, so steps usually have none and
    # the title moves up into the space the icon would have taken)
    top = Inches(0.62)
    if icon:
        txb(slide, icon, x, y + Inches(0.33), w, Inches(0.3),
            size=14, color=TEXT_W, align=PP_ALIGN.CENTER)
    else:
        top = Inches(0.40)
    # Title
    txb(slide, title.replace('\n', ' '), x + Inches(0.06), y + top, w - Inches(0.12), Inches(0.32),
        size=8.5, bold=True, color=TEXT_W, align=PP_ALIGN.CENTER)
    # Body
    txb(slide, body, x + Inches(0.06), y + top + Inches(0.42), w - Inches(0.12), h - top - Inches(0.5),
        size=8.5, color=TEXT_G, align=PP_ALIGN.CENTER, wrap=True)

def comm_card(slide, x, y, w, h, icon, name, sub, color=BORDER):
    """Small commodity card."""
    rect(slide, x, y, w, h, SURFACE2, color, Pt(0.8))
    txb(slide, icon, x, y + Inches(0.18), w, Inches(0.40),
        size=17, color=TEXT_W, align=PP_ALIGN.CENTER)
    txb(slide, name, x, y + Inches(0.64), w, Inches(0.26),
        size=9.0, bold=True, color=TEXT_W, align=PP_ALIGN.CENTER)
    txb(slide, sub, x, y + Inches(0.94), w, Inches(0.58),
        size=8.0, color=TEXT_D, align=PP_ALIGN.CENTER)

# ─── TABLE HELPER ─────────────────────────────────────────────────────────────

def add_table(slide, rows, cols, x, y, w, h, header_row, data_rows,
              col_widths=None, header_colors=None, cell_colors=None):
    """Add a styled table."""
    table = slide.shapes.add_table(rows, cols, x, y, w, h).table
    if col_widths:
        for i, cw in enumerate(col_widths):
            table.columns[i].width = cw

    # Header row
    for c, text in enumerate(header_row):
        cell = table.cell(0, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = HERO_BG
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        run = p.add_run()
        run.text = text
        run.font.size = Pt(7.5)
        run.font.bold = True
        run.font.color.rgb = HERO_TEXT

    # Data rows
    for r, row_data in enumerate(data_rows):
        bg = SURFACE2 if r % 2 == 0 else SURFACE
        for c, text in enumerate(row_data):
            cell = table.cell(r + 1, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = bg
            p = cell.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.LEFT
            run = p.add_run()
            run.text = str(text)
            run.font.size = Pt(7.5)
            # Colour cost column green — unless a cell is given its own colour
            if cell_colors and (r, c) in cell_colors:
                run.font.color.rgb = cell_colors[(r, c)]
                run.font.bold = cell_colors[(r, c)] != TEXT_G
            elif c == 3:
                run.font.color.rgb = ACCENT_G
                run.font.bold = True
            elif c == 0:
                run.font.color.rgb = ACCENT_B
                run.font.bold = True
            else:
                run.font.color.rgb = TEXT_G


def notes(slide, text):
    """Attach plain-text speaker notes to a slide (humanised, conversational)."""
    slide.notes_slide.notes_text_frame.text = text.strip()


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Title Slide
# ══════════════════════════════════════════════════════════════════════════════
# Every claim in this deck is checked against docs/decks/tool-facts.md and the
# code under calculator/. No emoji anywhere: glyphs render differently on every
# laptop, and a director's deck should not depend on a font fallback.
slide = add_slide()

# Navy plate. This is the one slide in the deck that is NOT light, and so the
# one place HERO_TEXT/HERO_SUB (white and pale blue) are the correct colours —
# everywhere else those would be invisible.
rect(slide, 0, 0, W, H, HERO_BG)
# The lifted panel is sized to the content it holds (wordmark down to the second
# pill row) and centred on the slide.
_HP_W = Inches(9.53)
rect(slide, (W - _HP_W) / 2, Inches(0.85), _HP_W, Inches(3.30), HERO_PANEL)
rect(slide, 0, 0, W, Inches(0.08), ACCENT_B)

# Main logo / wordmark
txb(slide, "CostVision", Inches(0.6), Inches(1.0), Inches(12), Inches(1.4),
    size=72, bold=True, color=HERO_TEXT, align=PP_ALIGN.CENTER, font=TITLE_FONT)

# Accent tagline bar
rect(slide, Inches(4.5), Inches(2.45), Inches(4.4), Inches(0.06), HERO_SUB)

txb(slide, "What a part should cost to make — every number traced to a rate",
    Inches(0.6), Inches(2.55), Inches(12), Inches(0.6),
    size=17, color=HERO_SUB, align=PP_ALIGN.CENTER)

txb(slide, "Designed & Developed by  Avinash Bhosale",
    Inches(0.6), Inches(3.2), Inches(12), Inches(0.45),
    size=13, bold=True, color=HERO_TEXT, align=PP_ALIGN.CENTER)

txb(slide, "Cost Engineering & Digital Innovation",
    Inches(0.6), Inches(3.65), Inches(12), Inches(0.35),
    size=10, color=HERO_DIM, align=PP_ALIGN.CENTER)

# Capability pills row
pill_data = [
    ("19 Processes",               ACCENT_G, Inches(1.0)),
    ("CAD to Cost, on Rules",      ACCENT_B, Inches(3.4)),
    ("AI Needs an API Key",       ACCENT_P, Inches(5.8)),
    ("DFM / DFA Advice",           ORANGE,   Inches(8.2)),
    ("20 Regions",                 ACCENT_B, Inches(10.6)),
]
for label, col, px in pill_data:
    rect(slide, px, Inches(4.55), Inches(2.1), Inches(0.36), SURFACE2, col, Pt(0.8))
    txb(slide, label, px + Inches(0.08), Inches(4.57), Inches(1.95), Inches(0.32),
        size=8, bold=True, color=col, align=PP_ALIGN.CENTER)

# Second row pills
pill2_data = [
    ("Assembly Roll-Up",             ACCENT_G, Inches(1.5)),
    ("Learning Curve",               ACCENT_P, Inches(4.1)),
    ("Supplier Quote Comparison",    ORANGE,   Inches(6.7)),
    ("Windows Laptop, No Internet",  ACCENT_B, Inches(9.3)),
]
for label, col, px in pill2_data:
    rect(slide, px, Inches(5.05), Inches(2.5), Inches(0.33), SURFACE2, col, Pt(0.8))
    txb(slide, label, px + Inches(0.08), Inches(5.07), Inches(2.35), Inches(0.29),
        size=7.5, bold=True, color=col, align=PP_ALIGN.CENTER)

# Footer
rect(slide, 0, H - Inches(0.45), W, Inches(0.008), HERO_PANEL)
txb(slide, "CONFIDENTIAL — Management Review  |  September 2026",
    Inches(0.4), H - Inches(0.4), W - Inches(0.8), Inches(0.35),
    size=7.5, color=HERO_DIM, align=PP_ALIGN.CENTER)

notes(slide,
    "Thanks for making the time. CostVision answers one question: what should this part cost to "
    "make? Not what the supplier quotes, but what the material, the machine time, the labour and the "
    "tooling say it should cost. "
    "I want to say two things up front, because they shape everything else. First, the AI is "
    "waiting for an API key in the JLR build. None has been added yet, so the tool runs on measurement, "
    "rules and arithmetic. Second, even when AI is on, it never sets a price. Every pound is a sum "
    "you can trace back to a rate in the library. "
    "Over the next slides I'll show you what it covers, which is nineteen manufacturing processes "
    "across twenty regions, how the CAD path works, and, just as important, what we have proven and "
    "what we haven't proven yet. I'd rather you leave with an accurate picture than an exciting one.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — Problem Statement
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 2, "The Challenge", "Why CostVision? Costing by Hand Is Slow",
             "Most should-costs are built by hand, one spreadsheet at a time. That is slow, and hard to defend.")

# 6 problem cards in 3×2 grid
problems = [
    (RED,    "", "Slow",
     "A should-cost built by hand can take weeks. By the time it lands, the sourcing decision is often made."),
    (ORANGE, "", "Quotes Taken on Trust",
     "Without our own number, a quote is hard to challenge. The supplier's margin stays hidden."),
    (RED,    "", "No Common Method",
     "Each engineer builds the cost a different way. Assumptions are not written down, so numbers cannot be compared."),
    (ORANGE, "", "Country Rates Are Hard",
     "Labour, machine, energy and material rates differ by country. Adjusting them by hand is easy to get wrong."),
    (RED,    "", "Problems Found Late",
     "Cost problems show up near launch, not at concept. By then a change means new tooling and lost margin."),
    (ORANGE, "", "No Floor Price",
     "Buyers go into a negotiation without a price they can defend line by line."),
]

# The card rows and the stat bar below them are sized from a common bottom
# target, so the block finishes just above the footer.
cols = 3
sx, sy = Inches(0.45), Inches(2.0)
gap = Inches(0.12)
cw = (W - sx * 2 - gap * (cols - 1)) / cols
STAT_BAR_H = Inches(0.86)
_rows2 = -(-len(problems) // cols)
ch = (Inches(6.95) - STAT_BAR_H - Inches(0.14) - sy - gap * (_rows2 - 1)) / _rows2

for i, (col, ico, title, body) in enumerate(problems):
    r, c = divmod(i, cols)
    cx = sx + c * (cw + gap)
    cy = sy + r * (ch + gap)
    card(slide, cx, cy, cw, ch, title, body, accent=col,
         title_pt=10.5, body_pt=9.5)

# Industry stat bar — labelled as an industry rule of thumb, not our result.
_bar_y = sy + _rows2 * (ch + gap) + Inches(0.02)
rect(slide, sx, _bar_y, W - sx * 2, STAT_BAR_H, SURFACE2, BORDER, Pt(0.5))
txb(slide, "~80%", sx + Inches(0.12), _bar_y + Inches(0.1), Inches(1.25), Inches(0.72),
    size=28, bold=True, color=ORANGE, align=PP_ALIGN.CENTER, wrap=False)
txb(slide, "Industry rule of thumb, not a CostVision result: most of a part's cost is fixed at the design "
    "stage, yet most cost work happens after design freeze. We want a defensible number earlier.",
    sx + Inches(1.45), _bar_y + Inches(0.14), Inches(10.7), Inches(0.62),
    size=10, color=TEXT_G)
assert _bar_y + STAT_BAR_H <= Inches(6.98), 'slide 2 stat bar runs into the footer'

notes(slide,
    "Let me start with the problem, because most of us have lived it. A should-cost built by hand is "
    "slow. It can take weeks, and by the time it lands the sourcing decision has often been made. "
    "Each engineer also builds it their own way, so two numbers for the same part are hard to "
    "compare, and the assumptions are rarely written down. That makes the number hard to defend in "
    "front of a supplier. "
    "The figure at the bottom is an industry rule of thumb, not something we measured: most of a "
    "part's cost is fixed at the design stage, yet most cost work happens after design freeze. "
    "Whether the real figure is seventy or eighty percent, the point stands. We find cost problems "
    "when they are expensive to fix. "
    "What I want is a number we can defend, earlier, while a change is still just a conversation.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — Solution Overview
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 3, "The Solution", "What is CostVision?",
             "A should-cost engine. Every number is arithmetic you can trace to a rate. It needs no AI.")

cards_data = [
    (ACCENT_B, "CAD to Cost",
     "Upload STEP, IGES or STL. The tool measures the part, and asks you where the geometry cannot decide."),
    (ACCENT_P, "Form Entry",
     "Type the inputs for any of the 19 processes. Same engine, same eight cost buckets."),
    (ACCENT_G, "19 Manufacturing Processes",
     "Machining to wiring harness, plus an assembly roll-up and an automotive software cost model."),
    (ORANGE,   "Rate Library",
     "Dated 16 June 2026: 328 materials, 178 machines, 42 labour grades. Editable and versioned."),
    (ACCENT_B, "20 Regions",
     "Each with its own labour, energy and machine rates, shown in its own currency."),
    (ACCENT_P, "Checks Its Own Work",
     "A self-audit and a P10–P90 uncertainty band come with every result."),
    (ACCENT_G, "Supplier Quote Comparison",
     "Put a quote next to the should-cost, bucket by bucket, and see where the gap is."),
    (ORANGE,   "DFM / DFA Advice",
     "Rule-based advice on how to make the part cheaper. It never changes the price."),
    (ACCENT_B, "Exports",
     "6-sheet Excel, PDF report and negotiation pack. Each matches the screen to the penny."),
]

cw = Inches(4.1)
ch = Inches(1.45)
sx, sy = Inches(0.45), Inches(1.98)
gap = Inches(0.1)

for i, (col, title, body) in enumerate(cards_data):
    r, c = divmod(i, 3)
    cx = sx + c * (cw + gap)
    cy = sy + r * (ch + gap)
    card(slide, cx, cy, cw, ch, title, body, accent=col, title_pt=10.5, body_pt=9.5)

notes(slide,
    "Here's the tool on one slide. I won't read every card. "
    "The top row is how you get a number in. You can upload a CAD file, and the tool measures it and "
    "asks you what it can't work out for itself. Or you type the inputs into a form. Both routes land "
    "on the same engine, with the same eight cost buckets. "
    "Underneath sits the rate library, dated 16 June 2026: 328 materials, 178 machines and 42 labour "
    "grades, all editable. "
    "The other cards are what make it useful rather than just a calculator: twenty regions, a "
    "self-audit and an uncertainty band on every result, quote comparison, design-for-manufacture "
    "advice, and exports that match the screen to the penny. "
    "The thread running through all of it is simple. The maths is plain arithmetic, and none of it "
    "depends on AI.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — Optional AI mode (needs an API key)
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 4, "Optional AI Mode · Needs an API Key", "AI Mode — Built In, Needs a Key, Never Sets a Price",
             "The AI code is in the product. Adding an API key turns it on — no rebuild.")

# Left column — how it works
lx, ly, lw = Inches(0.45), Inches(2.0), Inches(5.8)
txb(slide, "How It Works", lx, ly, lw, Inches(0.3), size=10, bold=True, color=ACCENT_B)

steps = [
    ("1. What it does (with a key)",
     "Reads a plain-English description, a drawing, or the chips on a board photo, and suggests the inputs: material, process route, parts list."),
    ("2. What it never does",
     "Set a price. Every pound is calculated by the same rules engine, from the rate library."),
    ("3. How it is kept in check",
     "Its suggestions are checked against the measured geometry. Every AI route is rate-limited per user."),
    ("4. What JLR sees today",
     "Screens that need AI are hidden until a key is added. Every costing path works without them."),
]

yy = Inches(2.35)
for title, body in steps:
    rect(slide, lx, yy, lw, Inches(1.02), SURFACE2, BORDER, Pt(0.5))
    rect(slide, lx, yy, Inches(0.06), Inches(1.02), ACCENT_B)
    txb(slide, title, lx + Inches(0.14), yy + Inches(0.08), lw - Inches(0.2), Inches(0.28),
        size=9.5, bold=True, color=TEXT_W)
    txb(slide, body, lx + Inches(0.14), yy + Inches(0.36), lw - Inches(0.2), Inches(0.62),
        size=9, color=TEXT_G, wrap=True)
    yy += Inches(1.08)

# Right column — what the JLR build actually says
rx = Inches(6.6)
ry = Inches(2.0)
rw = Inches(6.3)

chats = [
    ("USER",  "Aluminium bracket, 6082-T6, 200 × 100 × 50 mm, three holes, 5,000 a year, UK"),
    ("TOOL",  "AI needs an API key in this installation.\nCosting, CAD geometry and the learning loop work without it.\n• Upload the STEP file, or\n• Fill in the machining form"),
    ("USER",  "Uploads bracket.step"),
    ("TOOL",  "Measured: volume, weight, size, walls, holes.\nOne question: which process route — machining or casting?\nThen: cost from the rate library, in eight buckets."),
]

# The panel height is DERIVED from the transcript rather than typed, so the
# strip under it can never collide with the last bubble.
BUB_PAD, BUB_LINE, BUB_GAP = 0.26, 0.21, 0.08
_transcript = sum(BUB_PAD + (m.count('\n') + 1) * BUB_LINE for _, m in chats) \
    + BUB_GAP * (len(chats) - 1)
rh = Inches(0.44 + _transcript + 0.14)
rect(slide, rx, ry, rw, rh, SURFACE, BORDER, Pt(0.5))

# Mockup title bar
rect(slide, rx, ry, rw, Inches(0.36), SURFACE2)
txb(slide, "●  CostVision — JLR build, no API key yet", rx + Inches(0.14), ry + Inches(0.07),
    rw - Inches(0.2), Inches(0.25), size=8.5, bold=True, color=ACCENT_B)

cy2 = ry + Inches(0.44)
for role, msg in chats:
    is_user = role == "USER"
    bg_col = SURFACE2 if is_user else rgb('blueTint')
    border_col = BORDER if is_user else ACCENT_B
    lines = msg.count('\n') + 1
    bh = Inches(BUB_PAD + lines * BUB_LINE)
    rect(slide, rx + Inches(0.14), cy2, rw - Inches(0.28), bh, bg_col, border_col, Pt(0.5))
    txb(slide, (f"You: {msg}" if is_user else f"CostVision: {msg}"),
        rx + Inches(0.24), cy2 + Inches(0.06), rw - Inches(0.5), bh - Inches(0.1),
        size=7.5, color=(TEXT_G if is_user else TEXT_W))
    cy2 += bh + Inches(0.08)

# One strip under the panel, label and all four on a single line.
benefits = ["No AI, no key", "Same engine either way", "Works offline", "On by a setting"]
by = ry + rh + Inches(0.12)
txb(slide, "At JLR", rx, by, Inches(0.95), Inches(0.22),
    size=8.5, bold=True, color=ACCENT_G, wrap=False)
_bw = (rw - Inches(1.05)) / len(benefits)
for i, b in enumerate(benefits):
    txb(slide, b, rx + Inches(1.05) + i * _bw, by, _bw, Inches(0.22),
        size=7.5, color=TEXT_G, wrap=False)
assert by + Inches(0.22) <= H - Inches(0.45), 'benefits strip runs into the footer'

notes(slide,
    "I want to be clear about AI, because it's usually the first question. "
    "The product has an optional AI mode. When it's on, it can read a plain-English description, a "
    "drawing or the chips on a board photo and suggest the inputs: material, process route, parts list. That's all it "
    "does. It never sets a price. The same rules engine does the sum either way, and anything the AI "
    "suggests is checked against the measured geometry. "
    "At JLR that mode waits for an API key; none has been added yet. The code is still there, "
    "turned off by a setting, so if approval comes it can be switched on without a rebuild. "
    "Until a key is added, the screens that need AI are hidden. If you do reach one, the tool says so plainly "
    "instead of asking for a key. The right-hand side shows what that looks like: you're pointed to "
    "the CAD upload or the form, and the costing carries on as normal.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — CAD-to-Cost on rules
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 5, "CAD to Cost", "CAD to Cost: Measured by the Tool, Checked by You",
             "The geometry engine measures the part. Rules turn that into cost inputs. You answer what it cannot decide.")

# 3 stat boxes, then the supported-formats panel beside them.
STAT_Y, STAT_H = Inches(1.98), Inches(1.0)
# Only numbers the repository can show. Each figure below is pinned by a test.
stats = [("<0.01%", "Engine vs hand calc, reference part", ACCENT_B),   # tests/reference-part.test.ts
         ("8", "Cost buckets, each traced to a rate", ACCENT_G),
         ("6", "Real parts pinned in regression", ORANGE)]              # tests/real-parts-baseline.test.ts
_sw5, _sg5 = Inches(1.75), Inches(0.1)
for i, (num, lbl, col) in enumerate(stats):
    stat_card(slide, Inches(0.45) + i * (_sw5 + _sg5), STAT_Y, _sw5, STAT_H, num, lbl, col, size=22)
_fmt_x = Inches(0.45) + len(stats) * (_sw5 + _sg5) + Inches(0.1)
assert _fmt_x >= Inches(0.45) + 3 * (_sw5 + _sg5), 'formats panel overlaps the stat cards'

# What the tool measures
ex_items = [
    "Volume and weight — weight is volume × the density of the material you pick",
    "Size: bounding box, wall thickness and how much of the box the part fills",
    "Holes, bosses, threads and other features (from STEP and IGES)",
    "Face types and areas, for machining and coating",
    "A bottom-up CNC cycle estimate built from the feature table",
    "Walls over ~6 mm: offered casting, forging or machining — never sheet or moulding",
    "13 of the 19 processes can be costed straight from CAD this way",
]
rect(slide, Inches(0.45), Inches(3.12), Inches(6.0), Inches(3.8), SURFACE2, BORDER, Pt(0.5))
rect(slide, Inches(0.45), Inches(3.12), Inches(6.0), Inches(0.04), ACCENT_B)
txb(slide, "What the Tool Measures", Inches(0.6), Inches(3.16),
    Inches(5.7), Inches(0.3), size=9.5, bold=True, color=TEXT_W)
yy = Inches(3.55)
for item in ex_items:
    rect(slide, Inches(0.65), yy + Inches(0.13), Inches(0.06), Inches(0.06), ACCENT_B)
    txb(slide, item, Inches(0.84), yy, Inches(5.4), Inches(0.36),
        size=8.5, color=TEXT_G, wrap=True)
    yy += Inches(0.46)

# Right side — where it asks, and a real result
rx = Inches(6.85)
ry = Inches(3.12)
rw = Inches(6.0)
rh = Inches(3.8)
rect(slide, rx, ry, rw, rh, SURFACE, BORDER, Pt(0.5))
rect(slide, rx, ry, rw, Inches(0.04), ACCENT_P)
txb(slide, "Where the Tool Asks You — and What Comes Out", rx + Inches(0.15), ry + Inches(0.08),
    rw - Inches(0.25), Inches(0.3), size=9.5, bold=True, color=TEXT_W)

det = [("Process route", "Asked if more than one route fits", ACCENT_B),
       ("Material family", "Asked: steel, aluminium, plastic ...", ACCENT_B),
       ("Hole count on an STL", "Asked: an STL has no feature table", ORANGE),
       ("Cycle time, machined STL", "Costing blocked until you type one", ORANGE),
       ("Service questions", "Pressure-tight? Safety-critical?", ACCENT_G),
       ("Sheet-metal blank", "Measured from a DXF flat pattern", ACCENT_G)]
for i, (lbl, val, col) in enumerate(det):
    dx = rx + Inches(0.15) + (i % 2) * Inches(2.9)
    dy = ry + Inches(0.5) + (i // 2) * Inches(0.52)
    rect(slide, dx, dy, Inches(2.7), Inches(0.46), SURFACE2, BORDER, Pt(0.3))
    txb(slide, lbl, dx + Inches(0.08), dy + Inches(0.03), Inches(2.54), Inches(0.18),
        size=7.5, color=TEXT_D)
    txb(slide, val, dx + Inches(0.08), dy + Inches(0.22), Inches(2.54), Inches(0.2),
        size=8, bold=True, color=col)

# A real result from the regression baseline (tests/fixtures/real-parts-baseline.json)
rect(slide, rx + Inches(0.15), ry + Inches(2.08), rw - Inches(0.3), Inches(0.52), SURFACE2, BORDER, Pt(0.3))
txb(slide, "Real part: steering knuckle, forged steel, UK rates", rx + Inches(0.3), ry + Inches(2.12),
    Inches(3.8), Inches(0.22), size=8, color=TEXT_G)
txb(slide, "£ 32.16", rx + Inches(3.8), ry + Inches(2.1), Inches(1.9), Inches(0.3),
    size=14, bold=True, color=ACCENT_G, align=PP_ALIGN.RIGHT)

# Bucket split of that pinned result, in £
_k = [(7.92, ACCENT_B, "Mat £7.92"), (10.47, ACCENT_P, "Proc £10.47"),
      (6.28, ACCENT_G, "Lab £6.28"), (1.51, ORANGE, "Tool £1.51"),
      (3.14, TEXT_D, "OH £3.14"), (2.38, RED, "Margin £2.38"),
      (0.47, BORDER, "Other £0.47")]
_kt = sum(v for v, _, _ in _k)
bx_start = rx + Inches(0.15)
for v, col, lbl in _k:
    bw_seg = int((rw - Inches(0.3)) * v / _kt)
    rect(slide, bx_start, ry + Inches(2.66), bw_seg, Inches(0.16), col)
    bx_start += bw_seg

txb(slide, "  ".join(f"■ {l}" for _, _, l in _k),
    rx + Inches(0.15), ry + Inches(2.86), rw - Inches(0.3), Inches(0.22),
    size=7.5, color=TEXT_D)
txb(slide, "Pinned in the real-parts baseline. It records what the tool says — it has not been "
    "compared with a price JLR paid.",
    rx + Inches(0.15), ry + Inches(3.18), rw - Inches(0.3), Inches(0.5),
    size=8, color=TEXT_G, italic=True, wrap=True)

# File types supported — right of the stat cards
_fmt_w = Inches(12.85) - _fmt_x
rect(slide, _fmt_x, STAT_Y, _fmt_w, STAT_H, SURFACE2, BORDER, Pt(0.5))
rect(slide, _fmt_x, STAT_Y, Inches(0.06), STAT_H, ACCENT_P)
txb(slide, "Supported formats", _fmt_x + Inches(0.2), STAT_Y + Inches(0.12),
    _fmt_w - Inches(0.3), Inches(0.25), size=9, color=TEXT_W, bold=True)
txb(slide, ".STEP   .STP   .IGES   .IGS   .STL      + .DXF flat pattern for sheet metal",
    _fmt_x + Inches(0.2), STAT_Y + Inches(0.42), _fmt_w - Inches(0.3), Inches(0.25),
    size=9, color=ACCENT_B, bold=True)
txb(slide, "Measured by the OpenCASCADE geometry kernel. The DXF gives the true blank instead of the bounding box.",
    _fmt_x + Inches(0.2), STAT_Y + Inches(0.68), _fmt_w - Inches(0.3), Inches(0.25),
    size=8, color=TEXT_D)

notes(slide,
    "This is the path I'd demo first. You upload a STEP, IGES or STL file. A proper geometry kernel, "
    "OpenCASCADE, measures it: volume, weight, size, wall thickness, holes and features. Rules turn "
    "those measurements into cost inputs. "
    "Where the geometry can't decide, for example which process route, which material family, or how "
    "many holes are on an STL, the tool asks you rather than guessing. I think that's the right call. "
    "An engineer's answer beats a confident guess. "
    "Thirteen processes can be costed straight from CAD like this. Extrusion doesn't have CAD rules "
    "yet, but its form still costs it. "
    "On the right is a real part from our baseline: a steering knuckle, forged steel, thirty-two "
    "pounds sixteen at UK rates, split into its buckets. To be clear, that pins what the tool says. "
    "It hasn't been compared with a price JLR paid.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — 3D CAD Viewer
# ══════════════════════════════════════════════════════════════════════════════
TEAL = rgb('teal')   # Workflow deck's teal
slide = add_slide()
slide_header(slide, 6, "3D CAD Viewer",
             "3D CAD Viewer — Inspect, Measure and Check",
             "Built into CostVision. STEP, IGES and STL in the browser — no separate CAD licence needed.")

_vg = [
    (ACCENT_B, "Views & Navigation",
     "Iso, front, top and right views, fit to screen, a view-cube, and a zoom that holds up on large parts. Full-window mode."),
    (ACCENT_G, "Display & DFM Checks",
     "Shaded or wireframe, bounding-box sizes, colour by face type, a colour per body with a legend, a draft and undercut map, and a wall-thickness map."),
    (ACCENT_P, "Structure & Assembly",
     "Model tree of bodies, features and faces. Section planes on X, Y and Z. Exploded view. Move or rotate one body while the rest stays put."),
    (ORANGE, "Measure & Inspect",
     "Distance, radius, diameter, angle and point position, read from the exact B-rep. Export to CSV, or snapshot into the report."),
    (TEAL, "Fits the Workspace",
     "A dockable model tree, tool groups you can drag into your own order, and a toolbar that slides away. Works beside the app's sidebar."),
]
_gx, _gy, _gw, _gh, _ggap = Inches(0.45), Inches(2.02), Inches(3.98), Inches(2.18), Inches(0.24)
for i, (col, t, b) in enumerate(_vg):
    r, c = divmod(i, 3)
    card(slide, _gx + c * (_gw + _ggap), _gy + r * (_gh + Inches(0.2)), _gw, _gh, t, b, accent=col,
         title_pt=10.5, body_pt=9.5)
# 6th cell — summary
_sx = _gx + 2 * (_gw + _ggap); _sy = _gy + 1 * (_gh + Inches(0.2))
rect(slide, _sx, _sy, _gw, _gh, SURFACE2, BORDER, Pt(0.5))
rect(slide, _sx, _sy, Inches(0.06), _gh, ACCENT_G)
txb(slide, "One viewer, many jobs", _sx + Inches(0.16), _sy + Inches(0.12), _gw - Inches(0.24), Inches(0.3), size=10.5, bold=True, color=ACCENT_G)
txb(slide, "STEP / IGES / STL\nRuns in the browser\nExact B-rep measurements\nNo extra CAD licence\n\nThe same geometry\nfeeds the cost engine →",
    _sx + Inches(0.16), _sy + Inches(0.5), _gw - Inches(0.24), _gh - Inches(0.6), size=9.5, color=TEXT_G, wrap=True)

notes(slide,
    "This is the 3D viewer. It lives inside CostVision, in the browser, so nobody needs a CAD licence "
    "just to look at a part. "
    "Quickly, left to right. You can move around the part with standard views, a view-cube and a zoom "
    "that holds up on large parts. You can colour faces by type, and see a wall-thickness map and a "
    "draft and undercut map, which are useful early warnings for moulding and casting. You get a model "
    "tree, section planes and an exploded view, and you can move or rotate one body on its own. "
    "Measurements come from the exact B-rep, not a mesh, and you can export them to CSV or snapshot "
    "them into the report. "
    "The main point is the box on the right. The viewer shows the same geometry the cost engine uses. "
    "What you see on screen is what gets costed.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — What is measured → cost engine
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 7, "CAD to Cost · Measured, Not Typed",
             "What the Tool Measures — and What It Feeds",
             "Geometry is measured, not typed. Every £ is arithmetic you can trace to the rate library.")

_hdr = ["Measured from the geometry (no typing)", "→ Feeds this cost driver"]
_rows = [
    ["Volume — exact, from the geometry kernel (OpenCASCADE)", "Material mass · stock size"],
    ["Weight = volume × density of the chosen material", "Raw-material £"],
    ["Bounding box / envelope", "Machine sizing · stock · setups"],
    ["Body / component count", "Assembly scope · BOM line count"],
    ["Hole & boss table — Ø, depth, count (STEP / IGES)", "Secondary machining: drill / bore / tap"],
    ["Wall thickness", "Which routes are offered · moulding and casting feasibility"],
    ["Face types and areas (planar / cylindrical)", "Machining area · paint / coat area"],
    ["CNC cycle-time and setup estimate", "Process-time baseline for machining"],
    ["DXF flat pattern (sheet metal, optional)", "True blank size, instead of the bounding box"],
]
add_table(slide, len(_rows) + 1, 2, Inches(0.45), Inches(2.05), Inches(7.35), Inches(4.55),
          _hdr, _rows, col_widths=[Inches(3.95), Inches(3.4)])

# Right column — worked example + golden rule
_rx, _rw = Inches(8.05), Inches(4.85)
rect(slide, _rx, Inches(2.05), _rw, Inches(2.72), SURFACE2, BORDER, Pt(0.5))
rect(slide, _rx, Inches(2.05), Inches(0.06), Inches(2.72), ACCENT_B)
txb(slide, "Worked example — Spur Gear (m3 · z38)", _rx + Inches(0.16), Inches(2.14), _rw - Inches(0.26), Inches(0.3),
    size=10, bold=True, color=TEXT_W)
# Figures from tests/fixtures/real-parts-baseline.json (test-gear-m3-z38.step, UK).
txb(slide,
    "Case-hardening steel, ISO class 8 — measured:\n"
    "   Volume 266.0 cm³   ·   Steel weight 2.09 kg\n"
    "   Envelope 120 × 120 × 30 mm   ·   1 body\n\n"
    "→ Should-cost, UK rates (pinned in the baseline):\n"
    "   Material £8.14 · Process £8.04 · Labour £3.61\n"
    "   Tooling £0.96 · Overhead £2.49 · Margin £1.89\n"
    "   + packaging and logistics £0.36\n"
    "   =  £25.50 / part",
    _rx + Inches(0.16), Inches(2.46), _rw - Inches(0.26), Inches(2.25), size=9, color=TEXT_G, wrap=True)

rect(slide, _rx, Inches(4.95), _rw, Inches(1.65), SURFACE2, ACCENT_G, Pt(0.9))
rect(slide, _rx, Inches(4.95), Inches(0.06), Inches(1.65), ACCENT_G)
txb(slide, "The golden rule", _rx + Inches(0.16), Inches(5.04), _rw - Inches(0.26), Inches(0.3),
    size=10, bold=True, color=ACCENT_G)
txb(slide,
    "No AI in the price. At JLR the whole chain runs on measurement and rules. Even where AI is "
    "switched on, it only reads and classifies. Every number above is arithmetic, bounded by the "
    "measured geometry and traceable to the rate library.",
    _rx + Inches(0.16), Inches(5.4), _rw - Inches(0.26), Inches(1.15), size=9, color=TEXT_G, wrap=True)

notes(slide,
    "This slide shows exactly what the tool takes from the CAD model without anyone typing it in, and "
    "which part of the cost each measurement drives. "
    "Volume comes straight from the kernel, and weight is volume times the density of the material "
    "you choose, so the material cost starts from a measured number. The bounding box sizes the "
    "machine and the stock. The hole and boss table feeds drilling and tapping. Wall thickness decides "
    "which routes are even offered. For sheet metal you can add a DXF flat pattern to get the true "
    "blank. "
    "On the right is a real part from our baseline, a spur gear, module three, thirty-eight teeth. "
    "Twenty-five pounds fifty at UK rates, and you can see every bucket. "
    "The rule at the bottom is the one I'd underline: no AI in the price. Every figure traces back to "
    "the rate library, and that's what makes it defensible.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — End-to-End Workflow
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 8, "Workflow", "From Part to Cost — Eight Steps",
             "Two ways in at JLR: CAD upload or the form. The same engine either way.")

# Entry point banner
rect(slide, Inches(0.45), Inches(1.98), Inches(12.45), Inches(0.5), SURFACE2, BORDER, Pt(0.5))
txb(slide, "Way in A: CAD upload (STEP / IGES / STL)   |   Way in B: Form entry   |   "
    "Way in C: Describe the part in words — AI mode, needs an API key",
    Inches(0.6), Inches(2.08), Inches(12.1), Inches(0.36),
    size=9.5, color=TEXT_G, align=PP_ALIGN.CENTER)

flow_items = [
    ("1", "", "Pick the\nProcess",         "Choose one of the 19 processes, or let the CAD rules offer a route"),
    ("2", "", "Upload CAD\nor Fill Form",   "STEP, IGES or STL — or type the inputs directly"),
    ("3", "", "Measure the\nGeometry",      "Volume, weight, size, walls, holes and features"),
    ("4", "", "Ask Where\nUnsure",          "Route, material family, holes on an STL — the engineer answers"),
    ("5", "", "Calculate\n8 Buckets",       "Material, process, labour, tooling, packaging, logistics, overhead, margin"),
    ("6", "", "Self-Audit\nand Band",       "Flags implausible results. P10–P90 uncertainty band"),
    ("7", "", "DFM / DFA\nAdvice",          "Ranked ways to make it cheaper. The price does not change"),
    ("8", "", "Export and\nNegotiate",      "6-sheet Excel, PDF report, negotiation pack"),
]

n = len(flow_items)
fw = (W - Inches(0.9)) / n
fh = Inches(3.8)
fx = Inches(0.45)
fy = Inches(2.6)
colors = [ACCENT_B, ACCENT_B, ACCENT_P, ACCENT_P, ORANGE, ACCENT_G, ACCENT_G, ACCENT_B]

for i, (num, ico, title, body) in enumerate(flow_items):
    flow_box(slide, fx + i*fw, fy, fw - Inches(0.04), fh,
             num, ico, title, body, colors[i])
    # Arrow between boxes
    if i < n - 1:
        txb(slide, "→", fx + (i+1)*fw - Inches(0.2), fy + Inches(1.7),
            Inches(0.25), Inches(0.3), size=9, bold=True, color=ACCENT_B)

# Tags row
tags = ["Every step traceable", "No AI in the price", "20 regions", "Scenarios side by side",
        "Assembly roll-up", "Learning curve", "Runs offline"]
tx = Inches(0.45)
for tag in tags:
    rect(slide, tx, Inches(6.55), Inches(1.72), Inches(0.3), SURFACE2, ACCENT_B, Pt(0.5))
    txb(slide, tag, tx + Inches(0.08), Inches(6.58), Inches(1.58), Inches(0.24),
        size=7.5, color=ACCENT_B, align=PP_ALIGN.CENTER)
    tx += Inches(1.78)

notes(slide,
    "This slide shows the flow from end to end. At JLR there are two ways in: upload a CAD file, or "
    "fill in the form. The third door, describing the part in words, needs AI, so it waits for a key. "
    "Whichever way you come in, it's the same eight steps. Pick the process, give it the part, let it "
    "measure, answer its questions, and it calculates the eight buckets. Then it audits its own "
    "result and puts a P10 to P90 band around it, gives you design-for-manufacture advice, and "
    "exports. "
    "Step four is the one I'd point at. That's where the tool stops and asks rather than guessing. "
    "It's a small thing, but it's why I trust the output more than I would a fully automatic answer. "
    "And nothing in the chain is a black box.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — 19 processes + roll-up + software
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 9, "Full Coverage", "19 Manufacturing Processes — One Engine",
             "Plus an assembly roll-up and an automotive software cost model. The same eight cost buckets for all.")

# 19 processes, then the two cross-cutting models. The "icon" slot carries a
# card number — no emoji.
commodities = [
    ("CNC Machining",        "Milling, turning, drilling"),
    ("Casting",              "HPDC, gravity, investment, sand"),
    ("Cast + Machine",       "Casting plus finish machining"),
    ("Forging",              "Hot die forging"),
    ("Sheet Metal",          "Pressed: progressive / transfer"),
    ("Sheet Metal Fab",      "Laser · punch · brake · weld"),
    ("Gear Cutting",         "Hob · shape · skive · grind"),
    ("Injection Moulding",   "Thermoplastics, multi-cavity"),
    ("Blow Moulding",        "Hollow parts: tanks, ducts"),
    ("Extrusion",            "Profile, pipe, tube"),
    ("Thermoforming",        "Vacuum, pressure, twin-sheet"),
    ("Rotational Moulding",  "Large hollow shapes"),
    ("Rubber Moulding",      "Compression, transfer, LSR"),
    ("Composites",           "Hand lay-up, RTM, autoclave"),
    ("Painting / Coating",   "E-coat, powder, wet, anodise"),
    ("BIW Assembly",         "Spot weld, MIG, hem, bond"),
    ("PCB Fabrication",      "Bought-in price, fabricator tables"),
    ("PCBA",                 "SMT, through-hole, reflow"),
    ("Wiring Harness",       "Cut, strip, crimp, test"),
    ("Assembly Roll-Up",     "Multi-part BOM, one total"),
    ("Automotive Software",  "49-module cost model"),
]
commodities = [(f"{i + 1:02d}", n_, s_) for i, (n_, s_) in enumerate(commodities)]
assert len(commodities) == 21 and len({icon for icon, _, _ in commodities}) == 21

cols_c = 7                      # 21 cards = exactly 3 full rows, no orphans
cw_c = (W - Inches(0.9)) / cols_c - Inches(0.055)
_rows_c = -(-len(commodities) // cols_c)
ch_c = (Inches(6.95) - Inches(1.98) - Inches(0.065) * (_rows_c - 1)) / _rows_c
sx_c = Inches(0.45)
sy_c = Inches(1.98)

for i, (ico, name, sub) in enumerate(commodities):
    r, c = divmod(i, cols_c)
    cx2 = sx_c + c * (cw_c + Inches(0.055))
    cy2 = sy_c + r * (ch_c + Inches(0.065))
    col = ACCENT_B if i < 19 else ACCENT_G   # the last two are cross-cutting, not a process
    comm_card(slide, cx2, cy2, cw_c, ch_c, ico, name, sub, color=col)

notes(slide,
    "Breadth matters because a real product isn't one process. A door module is pressings, a "
    "harness, a circuit board and paint. "
    "So the tool covers nineteen manufacturing processes: machining, casting, forging, gear cutting, "
    "sheet metal, the plastics family, rubber, composites, and the electronics side, meaning PCB "
    "fabrication, PCB assembly and wiring harness, plus painting and body-in-white assembly. On top of "
    "those sit an assembly roll-up and a cost model for automotive software. "
    "One honest note on PCB fabrication. That's a bought-in price, taken from fabricators' price "
    "tables, so we don't add overhead and margin on top. Adding them would count the supplier's "
    "margin twice. "
    "Every process uses the same eight cost buckets, and that's what lets the roll-up add them "
    "together into one number you can trust.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — Should-Cost Model Depth
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 10, "Engineering Depth", "What Sits Behind Every Number",
             "Twelve layers, all of them arithmetic you can follow. Nothing is estimated by feel.")

depth_cards = [
    (ACCENT_B, "Materials",
     "328 materials in the rate library dated 16 June 2026: metals, plastics, rubber, composites, laminates."),
    (ACCENT_G, "Machines & Labour",
     "178 machines and 42 labour grades, each rate editable per project and per region."),
    (ORANGE,   "Process Routing",
     "The order of operations, and for each one: which machine, how long, who runs it."),
    (ACCENT_P, "Tooling & NRE",
     "Dies, moulds and fixtures spread over annual volume × programme life."),
    (ACCENT_G, "Yield & Scrap",
     "What actually comes out good first time, driven by the features that make a part hard to build."),
    (ACCENT_B, "Regional Rates",
     "20 regions, each with its own labour, energy and machine rates."),
    (ORANGE,   "Benchmarks & Sensitivity",
     "Checked against typical cost ranges, and ranked by which inputs move the number most."),
    (ACCENT_P, "Learning Curve",
     "What the part costs as volume builds — the figure you need for a long-term agreement."),
    (ACCENT_G, "Quote Comparison",
     "Put the supplier's quote next to ours, bucket by bucket, in their currency or yours."),
    (ACCENT_B, "Uncertainty Band",
     "A P10–P90 range on every result, from a Monte Carlo run over every cost driver."),
    (ORANGE,   "Gear Cutting",
     "Hobbing, shaping, skiving and grinding times worked out from the gear itself."),
    (ACCENT_P, "Landed Cost",
     "Duty, carbon levy and shipping terms — the cost at our door, not at the supplier's gate."),
]

# Card width is DERIVED from the slide, never typed (a typed width once pushed
# column 4 off the slide).
COLS_D = 4
MARGIN_D = Inches(0.45)
gap_d = Inches(0.1)
cw_d = (W - MARGIN_D * 2 - gap_d * (COLS_D - 1)) / COLS_D
sx_d = MARGIN_D
sy_d = Inches(1.98)
BOTTOM_D = Inches(6.95)
rows_d = -(-len(depth_cards) // COLS_D)
ch_d = (BOTTOM_D - sy_d - gap_d * (rows_d - 1)) / rows_d
assert sx_d + (COLS_D - 1) * (cw_d + gap_d) + cw_d <= W, 'depth grid overflows the slide'
assert sy_d + (rows_d - 1) * (ch_d + gap_d) + ch_d <= BOTTOM_D + Inches(0.01)
# A card title that wraps lands ON the body text; 29 characters is the longest
# measured to stay on one line at 10.5 pt in a 3.03" card.
TITLE_CH_MAX = 29
for _, _t, _ in depth_cards:
    assert len(_t) <= TITLE_CH_MAX, f'card title wraps onto the body: {_t!r}'

for i, (col, title, body) in enumerate(depth_cards):
    r, c = divmod(i, COLS_D)
    cx_d = sx_d + c * (cw_d + gap_d)
    cy_d = sy_d + r * (ch_d + gap_d)
    card(slide, cx_d, cy_d, cw_d, ch_d, title, body, accent=col,
         title_pt=10.5, body_pt=9.5)

notes(slide,
    "When people are sceptical, it's usually about depth. Is this a real engineering model, or a "
    "spreadsheet with a nice screen? This slide is my answer. "
    "Underneath every process there's a rate library dated 16 June 2026, with 328 materials, 178 "
    "machines and 42 labour grades, all editable. There's proper routing, so each operation has a "
    "machine, a time and a person. Tooling is spread over annual volume times programme life. Yield "
    "and scrap are modelled. Each result gets a P10 to P90 band from a Monte Carlo run over every "
    "cost driver. And there's landed cost, with duty, carbon levy and shipping terms, so you see the "
    "cost at our door. "
    "None of this is estimated by feel. If you disagree with a number, you can find the rate behind "
    "it and change it. That's the conversation I want us to be having.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — Advanced Features
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 11, "Advanced Capabilities", "Beyond a Cost Number",
             "Five tools that turn the estimate into something you can negotiate with.")

lx9 = Inches(0.45)
lw9 = Inches(6.0)

adv_left = [
    (ACCENT_P, "Learning Curve",
     "Cost falls as volume builds. Set the curve, read the cost at any year.\n\n"
     "• Talk about year-three cost, not first-batch cost\n"
     "• Built for long-term agreements and make-vs-buy"),
    (ACCENT_G, "Assembly Roll-Up",
     "Cost a whole module, not just one part.\n\n"
     "• Mix any of the 19 processes in one build\n"
     "• Every component keeps its own cost model\n"
     "• Body + paint + harness + PCBA = one total"),
]

yy9 = Inches(2.0)
for col, title, body in adv_left:
    rect(slide, lx9, yy9, lw9, Inches(2.3), SURFACE2, BORDER, Pt(0.5))
    rect(slide, lx9, yy9, Inches(0.06), Inches(2.3), col)
    txb(slide, title, lx9 + Inches(0.14), yy9 + Inches(0.1), lw9 - Inches(0.2), Inches(0.3),
        size=10.5, bold=True, color=TEXT_W)
    txb(slide, body, lx9 + Inches(0.14), yy9 + Inches(0.42), lw9 - Inches(0.2), Inches(1.8),
        size=9.5, color=TEXT_G, wrap=True)
    yy9 += Inches(2.42)

rx9 = Inches(6.85)
rw9 = Inches(6.0)

adv_right = [
    (ORANGE, "Quote Comparison",
     "Log the supplier's quote. Any currency, converted for you.\n"
     "• Compared with the should-cost, bucket by bucket\n"
     "• The gap stated plainly: \"Quote is X% above should-cost\""),
    (ACCENT_B, "What Moves the Number",
     "Each driver flexed ±10% (by default), ranked by impact.\n"
     "• Shows the few inputs worth checking before you negotiate"),
    (ACCENT_G, "Scenarios Side by Side",
     "Baseline, target and stretch on one screen.\n"
     "• See exactly where the money moved\n"
     "• Saved to your account to come back to"),
]

yy9r = Inches(2.0)
for col, title, body in adv_right:
    h = Inches(1.52)
    rect(slide, rx9, yy9r, rw9, h, SURFACE2, BORDER, Pt(0.5))
    rect(slide, rx9, yy9r, Inches(0.06), h, col)
    txb(slide, title, rx9 + Inches(0.14), yy9r + Inches(0.08), rw9 - Inches(0.2), Inches(0.28),
        size=10, bold=True, color=TEXT_W)
    txb(slide, body, rx9 + Inches(0.14), yy9r + Inches(0.36), rw9 - Inches(0.2), h - Inches(0.45),
        size=9, color=TEXT_G, wrap=True)
    yy9r += Inches(1.62)

notes(slide,
    "These are the tools that turn a number into something you can negotiate with. "
    "The learning curve shows what the part costs as volume builds, so you can talk about year three, "
    "not just the first batch. The assembly roll-up lets you cost a whole module, with each part "
    "keeping its own model. "
    "On the right, quote comparison puts the supplier's price next to ours, bucket by bucket, and "
    "states the gap plainly. That's usually where the useful conversation starts: not the total, but "
    "which bucket is out of line. The sensitivity chart flexes each driver by ten percent and ranks "
    "them, so you know which few inputs to double-check before a meeting. And scenarios let you hold a "
    "baseline, a target and a stretch side by side. "
    "None of this is AI. It's the same arithmetic, arranged for a buyer.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — DFM / DFA advice
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 12, "Advice Layer", "DFM / DFA — How to Make the Part Cheaper",
             "Runs after the cost is settled. It reads the result and advises — it never changes the price.")

# Score banner — what the tool reports, not a sample result
rect(slide, Inches(0.45), Inches(2.0), Inches(12.45), Inches(0.78), SURFACE2, BORDER, Pt(0.5))
txb(slide, "Manufacturability Score (DFM)", Inches(0.65), Inches(2.06),
    Inches(3.5), Inches(0.28), size=8.5, bold=True, color=TEXT_W)
txb(slide, "1 – 10", Inches(0.65), Inches(2.34), Inches(2), Inches(0.36),
    size=20, bold=True, color=ACCENT_G)
txb(slide, "Assembly Score (DFA)", Inches(4.5), Inches(2.06),
    Inches(3.5), Inches(0.28), size=8.5, bold=True, color=TEXT_W)
txb(slide, "1 – 10", Inches(4.5), Inches(2.34), Inches(2), Inches(0.36),
    size=20, bold=True, color=ORANGE)
txb(slide, "Actions", Inches(8.4), Inches(2.06),
    Inches(2.5), Inches(0.28), size=8.5, bold=True, color=TEXT_W)
txb(slide, "Ranked", Inches(8.4), Inches(2.34), Inches(2.5), Inches(0.36),
    size=20, bold=True, color=ACCENT_G)
txb(slide, "Score drops with each issue found  ·  each action carries its own saving estimate",
    Inches(10.5), Inches(2.12), Inches(2.3), Inches(0.6),
    size=7.5, color=TEXT_D, wrap=True)

dfm_dfa = [
    (ACCENT_B, "What It Finds — Making the Part",
     "Too much material going to scrap.\n"
     "Machines running well below what they should.\n"
     "Tooling, overhead or supplier margin out of line.\n"
     "Each issue graded critical, major or minor."),
    (ACCENT_G, "What It Finds — Building It",
     "Assembly done by hand that could be automated.\n"
     "Too many setups — each one adds cost and variation.\n"
     "Too many different fasteners, so tools keep changing."),
    (ORANGE,   "What to Do About It",
     "A ranked list of actions, each with its own saving estimate:\n\n"
     "Automate the manual operations\n"
     "Move to a near-net shape\n"
     "Raise machine uptime\n"
     "Plus quick wins: more volume, open-book overhead, re-bid."),
    (ACCENT_P, "Checks on the 3D Model",
     "A second layer reads the CAD model itself: casting, forging, moulding, machining, sheet metal.\n\n"
     "It points at the faces that cause the problem.\n"
     "Every rule names its source.\n"
     "A finding is priced only when rates and volume are known."),
]

cw_d2 = Inches(6.0)
_top_d2, _gap_d2 = Inches(3.0), Inches(0.12)
ch_d2 = (Inches(6.95) - _top_d2 - _gap_d2) / 2
for i, (col, title, body) in enumerate(dfm_dfa):
    r, c = divmod(i, 2)
    dx = Inches(0.45) + c * (cw_d2 + _gap_d2)
    dy = _top_d2 + r * (ch_d2 + _gap_d2)
    card(slide, dx, dy, cw_d2, ch_d2, title, body, accent=col,
         title_pt=10.5, body_pt=9.5)
assert _top_d2 + 2 * ch_d2 + _gap_d2 <= Inches(6.96), 'DFM grid runs into the footer'

notes(slide,
    "The design-for-manufacture and assembly layer runs after the cost is settled. It reads the "
    "result and advises. It never changes the price, and that separation is deliberate. "
    "It scores the part out of ten for making it and for assembling it, lists what it found, grades "
    "each issue, and ranks the actions, each with its own saving estimate. I'd treat those estimates "
    "as prompts for a conversation, not promises. "
    "The engineering team told me the first version was too generic. It read the cost and guessed "
    "backwards. They were right. So there's now a second layer that reads the 3D model itself, for "
    "castings, forgings, mouldings, machined parts and pressings. It points at the actual faces that "
    "cause the problem, and every rule names its source. "
    "There's also an optional AI commentary on top, but that's part of the AI mode, so it's switched "
    "needs an API key.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — Regions
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 13, "Global Coverage", "20 Manufacturing Regions — Each in Its Own Currency",
             "Pick a region and every rate resets together — labour, machines, energy, material and currency.")

# Skilled labour in £/hr equivalent, straight from REGIONAL_DATA
# (calculator/src/engine/regional-rates.ts, 2026 Q2).
regions = [
    ("UK",         "GBP", "£26.00",  "Base region"),
    ("Germany",    "EUR", "£40.50",  "Western Europe"),
    ("Poland",     "PLN", "£12.00",  "Central Europe"),
    ("Romania",    "RON", "£7.50",   "Eastern Europe"),
    ("China",      "CNY", "£7.90",   "East Asia"),
    ("India",      "INR", "£5.10",   "South Asia"),
    ("Mexico",     "MXN", "£7.50",   "Near-shore for the USA"),
    ("USA",        "USD", "£34.00",  "North America"),
    ("Thailand",   "THB", "£5.80",   "South-east Asia"),
    ("Vietnam",    "VND", "£3.80",   "South-east Asia"),
    ("Brazil",     "BRL", "£8.50",   "South America"),
    ("S. Korea",   "KRW", "£22.00",  "East Asia"),
]

rect(slide, Inches(0.45), Inches(1.98), Inches(7.5), Inches(4.98), SURFACE, BORDER, Pt(0.5))
txb(slide, "12 of the 20 regions — skilled labour, 2026 Q2", Inches(0.6), Inches(2.04),
    Inches(6), Inches(0.28), size=9, bold=True, color=TEXT_W)

headers = ["Region", "Currency", "Skilled labour (£/hr equiv.)", "Where"]
col_ws = [Inches(1.5), Inches(0.9), Inches(2.2), Inches(2.4)]
add_table(slide, len(regions)+1, 4,
          Inches(0.48), Inches(2.36), Inches(7.44), Inches(4.5),
          headers, regions, col_widths=col_ws,
          cell_colors={(r, 2): ACCENT_G for r in range(len(regions))} |
                      {(r, 3): TEXT_G for r in range(len(regions))})

rx11 = Inches(8.2)
ry11 = Inches(1.98)
rw11 = Inches(4.7)

key_points = [
    (ACCENT_B, "Currency Follows the Region",
     "Pick a region and the display currency switches to its own. Choose a currency by hand and it stays put."),
    (ACCENT_G, "Every Rate Resets",
     "Eight labour rates, electricity, gas, machine rates and material prices — all set for the region."),
    (ACCENT_P, "Editable Rate Library",
     "Version 2.1.0, dated 16 June 2026. Override any rate. JLR's own rate card converts in with a macro-free workbook."),
    (ORANGE,   "All 20 Regions at Once",
     "One table shows the same part costed in every region — a make-vs-buy view built on rates."),
]

yy11 = ry11
for col, title, body in key_points:
    rect(slide, rx11, yy11, rw11, Inches(1.1), SURFACE2, BORDER, Pt(0.5))
    rect(slide, rx11, yy11, Inches(0.06), Inches(1.1), col)
    txb(slide, title, rx11 + Inches(0.14), yy11 + Inches(0.08), rw11 - Inches(0.2), Inches(0.28),
        size=9.5, bold=True, color=TEXT_W)
    txb(slide, body, rx11 + Inches(0.14), yy11 + Inches(0.36), rw11 - Inches(0.2), Inches(0.72),
        size=8.5, color=TEXT_G, wrap=True)
    yy11 += Inches(1.18)

notes(slide,
    "A part made in Poland doesn't just have cheaper labour. It has different machine rates, "
    "different energy, a different currency. Getting all of that right by hand is where manual "
    "should-costs quietly go wrong. "
    "Here you pick a region and everything resets together: eight labour rates, electricity and gas, "
    "machine rates, material prices, and the display currency. The table shows twelve of the twenty "
    "regions, with the skilled rate as a pound-per-hour equivalent so you can compare them fairly. "
    "These are second-quarter 2026 rates. "
    "Every rate is editable, and there's a workbook that converts JLR's own rate card into the tool's "
    "format with no macros. "
    "And one table shows the same part costed in all twenty regions at once. That's a quick, "
    "rate-based way into a make-or-buy discussion, rather than a hunch.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — What runs today vs the optional AI mode
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 14, "What Runs Today · What Waits",
             "Runs on Rules Today — AI Mode Waits for Approval",
             "Left: what runs at JLR now, without an API key. Right: the optional AI features — built, waiting for a key.")

def _agentic_panel(x, accent, head, tag, examples):
    w, y, h = Inches(6.05), Inches(2.0), Inches(4.4)
    rect(slide, x, y, w, h, SURFACE2, BORDER, Pt(0.5))
    rect(slide, x, y, Inches(0.06), h, accent)
    txb(slide, head, x + Inches(0.2), y + Inches(0.12), w - Inches(0.35), Inches(0.34),
        size=14, bold=True, color=accent)
    txb(slide, tag, x + Inches(0.2), y + Inches(0.5), w - Inches(0.35), Inches(0.3),
        size=9, color=TEXT_G, italic=True)
    ry, rh = y + Inches(0.9), Inches(0.74)
    for lab, sub in examples:
        rect(slide, x + Inches(0.18), ry, w - Inches(0.36), rh, SURFACE, BORDER, Pt(0.3))
        rect(slide, x + Inches(0.18), ry, Inches(0.05), rh, accent)
        txb(slide, lab, x + Inches(0.34), ry + Inches(0.07), w - Inches(0.52), Inches(0.24),
            size=10, bold=True, color=TEXT_W)
        txb(slide, sub, x + Inches(0.34), ry + Inches(0.31), w - Inches(0.52), rh - Inches(0.36),
            size=8.5, color=TEXT_G, wrap=True)
        ry += rh + Inches(0.1)

_agentic_panel(Inches(0.45), ACCENT_G, "Runs Today — No AI",
    "Rules and arithmetic. Works offline on the laptop.",
    [("CAD to Cost", "Measures the part, and asks you where the geometry cannot decide."),
     ("Self-audit", "Checks every result: wrong machine size, wrong volume for tooling, odd cycle times."),
     ("Learning from actuals", "Log a real quote or PO price. After 3 for a commodity, the band is corrected."),
     ("Supplier price monitor", "Compares logged prices with the should-cost and flags where a supplier sits above it.")])
_agentic_panel(Inches(6.83), ACCENT_P, "Optional AI Mode — Needs an API Key",
    "Turned on by adding a key, with no rebuild. The model reads; the tool prices.",
    [("Describe a part", "Type a description and the AI suggests the inputs. The engine still does the sum."),
     ("PCB photo to BOM", "Reads the chips and lists the parts; the tool prices every line from its catalogue and tables, then costs the board."),
     ("AI assistant", "Answers costing questions in plain English."),
     ("AI agent", "Works through a costing task step by step, when asked.")])

rect(slide, Inches(0.45), Inches(6.5), Inches(12.45), Inches(0.5), SURFACE2, ACCENT_G, Pt(0.6))
txb(slide, "The common thread:  AI never sets a price, on or off. Every number stays arithmetic you can check.",
    Inches(0.72), Inches(6.6), Inches(12.0), Inches(0.32), size=9.5, color=TEXT_G)

notes(slide,
    "This slide separates what works today from what's waiting. "
    "On the left is everything that runs at JLR now, without an API key and no internet. CAD to "
    "cost on rules. The self-audit on every result. Learning from actuals: you log a real quote or "
    "purchase-order price, and after three for a commodity the uncertainty band is corrected by real "
    "data. And a monitor that compares logged prices with the should-cost and flags where a supplier "
    "sits above it. "
    "On the right are the AI features. They're built and they're in the product, but they're switched "
    "waiting for a key: describing a part in words, PCB photo to parts list, the assistant and the agent. If "
    "JLR approves AI, a setting turns them on. "
    "The line at the bottom is the one that doesn't change either way. AI never sets a price.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — Self-check, learning, and what is proven
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 15, "Checks and Proof",
             "The Tool Checks Itself — and Says What Is Proven",
             "It checks every result before you see it, shows how unsure it is, and learns from real prices.")

lx12, lw12 = Inches(0.45), Inches(5.55)
agentic_cards = [
    (ACCENT_G, "It checks its own work",
     "A self-audit runs on every result. It flags a wrong machine size, tooling spread over the "
     "wrong volume, a material-only costing, implausible cycle times, and more."),
    (ACCENT_B, "It shows how unsure it is",
     "Every result carries a P10–P90 band from a Monte Carlo run over every cost driver, "
     "including flat material prices."),
    (ORANGE, "It learns from real prices",
     "Log a real quote or PO price with \"Log Actual £\". After 3 actuals for a commodity, the band "
     "is corrected by real data."),
]
yy12 = Inches(2.0)
for col, title, body in agentic_cards:
    h = Inches(1.55)
    rect(slide, lx12, yy12, lw12, h, SURFACE2, BORDER, Pt(0.5))
    rect(slide, lx12, yy12, Inches(0.06), h, col)
    txb(slide, title, lx12 + Inches(0.14), yy12 + Inches(0.08), lw12 - Inches(0.2), Inches(0.28),
        size=10.5, bold=True, color=TEXT_W)
    txb(slide, body, lx12 + Inches(0.14), yy12 + Inches(0.4), lw12 - Inches(0.2), h - Inches(0.5),
        size=9.5, color=TEXT_G, wrap=True)
    yy12 += Inches(1.62)

rx12 = Inches(6.35)
rw12 = Inches(6.55)
rect(slide, rx12, Inches(2.0), rw12, Inches(0.04), ACCENT_G)
txb(slide, "What is proven — and what is not", rx12, Inches(2.1), rw12, Inches(0.3),
    size=10.5, bold=True, color=ACCENT_G)
txb(slide, "Status as of September 2026.",
    rx12, Inches(2.42), rw12, Inches(0.28), size=8.5, color=TEXT_G)

headers12a = ["Check", "Evidence", "What it shows", "Status"]
data12a = [
    ("Hand calculation",   "Reference bracket, £24.34",   "Engine arithmetic matches to <0.01%",          "Proven"),
    ("Real-parts baseline", "6 production parts pinned",  "A change that moves one fails the build",      "In place"),
    ("Automated tests",    "2,438 tests + browser tests", "Every commodity, exports, STL, accessibility", "Every run"),
    ("JLR-paid prices",    "None compared yet",           "Measured as actuals are logged",               "Not proven"),
]
col_ws12a = [Inches(1.45), Inches(1.75), Inches(2.3), Inches(1.05)]
add_table(slide, len(data12a) + 1, 4,
          rx12, Inches(2.78), rw12, Inches(2.4),
          headers12a, data12a, col_widths=col_ws12a,
          cell_colors={(3, 3): RED, (3, 1): RED})

rect(slide, rx12, Inches(5.5), rw12, Inches(1.42), SURFACE2, BORDER, Pt(0.5))
rect(slide, rx12, Inches(5.5), Inches(0.06), Inches(1.42), ACCENT_B)
txb(slide, "Built to be checked, not just believed", rx12 + Inches(0.16), Inches(5.58),
    rw12 - Inches(0.25), Inches(0.28), size=10, bold=True, color=TEXT_W)
cred_items = [
    "2,438 automated tests — if the logic breaks, the build fails",
    "Browser tests cost every commodity and check accessibility on every run",
    "The CAD engine is tested inside the image we ship",
]
yyc = Inches(5.92)
for it in cred_items:
    rect(slide, rx12 + Inches(0.2), yyc + Inches(0.11), Inches(0.06), Inches(0.06), ACCENT_B)
    txb(slide, it, rx12 + Inches(0.38), yyc, rw12 - Inches(0.55), Inches(0.3),
        size=9, color=TEXT_G, wrap=True)
    yyc += Inches(0.32)

notes(slide,
    "This is the honest answer to 'can I trust the number?'. "
    "On the left is how the tool checks itself. A self-audit runs on every result, looking for "
    "mistakes we have actually seen: the wrong machine size, tooling spread over the wrong volume, a "
    "costing that's only material, a cycle time that makes no sense. Every result also carries a P10 "
    "to P90 band, so it tells you how unsure it is. And it learns from real prices as you log them. "
    "On the right is where we actually are. The engine's arithmetic matches a hand calculation to "
    "under a hundredth of a percent. Six real parts are pinned, so any change that moves them fails "
    "the build. There are 2,438 automated tests. "
    "What we have not done yet is compare an estimate with a price JLR actually paid. That's the "
    "next proof, and I don't want to claim it early.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — Six real parts, pinned
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 16, "Real Parts · Regression Baseline", "Six Real Production Parts — Pinned in the Build",
             "Measured from real CAD and costed by the product's own chain, at UK rates. Move one, and the build fails.")

# Every figure below is in calculator/tests/fixtures/real-parts-baseline.json.
headers12 = ["Part", "What it is", "Route (engineer's answer)", "Should-cost", "Measured", "Why this route"]
data12 = [
    ("Steering knuckle",     "Suspension upright, RH",  "Forging, steel",            "£ 32.16", "9.0 mm bulk wall · 6% fill",          "Safety-critical, so forged; bore and faces machined after"),
    ("Casting bracket",      "Mounting bracket",        "Cast + machine, steel",     "£ 37.61", "10.2 mm wall · 16% fill · 10 holes",  "Named as a casting; holes and threads to finish"),
    ("PRCR002 housing",      "Cast housing, 277 mm",    "Cast + machine, aluminium", "£ 52.67", "15.1 mm bulk wall · 9% fill",         "Assumed not pressure-tight — if it is, the cost rises"),
    ("Part1",                "Machined part, 274 mm",   "Machining, aluminium",      "£ 38.93", "10.4 mm bulk wall · 23% fill",        "Machined from billet at this volume"),
    ("Seat locking bracket", "Pressed bracket",         "Sheet metal, steel",        "£  4.96", "1.55 mm wall · 15 bends · 4% fill",   "The one genuine pressing"),
    ("Spur gear m3 z38",     "38 teeth, ISO class 8",   "Gear cutting, steel",       "£ 25.50", "Module 3, teeth counted off the tip", "Routed by measuring the gear"),
]

col_ws12 = [Inches(1.55), Inches(1.6), Inches(1.85), Inches(0.95), Inches(2.4), Inches(4.1)]
add_table(slide, len(data12) + 1, 6,
          Inches(0.45), Inches(1.98), Inches(12.45), Inches(3.9),
          headers12, data12, col_widths=col_ws12)

# Notes row
rect(slide, Inches(0.45), Inches(6.2), Inches(12.45), Inches(0.62), SURFACE2, BORDER, Pt(0.3))
txb(slide, "UK region, GBP  |  Answers are stated engineering judgements, so they can be argued with  |  "
    "This pins what the tool says — none of these has been compared with a price JLR paid",
    Inches(0.6), Inches(6.36), Inches(12.1), Inches(0.3),
    size=8.5, color=TEXT_D, align=PP_ALIGN.CENTER)

notes(slide,
    "These are the six real production parts in our regression baseline. Each one was measured from "
    "its real CAD file and costed through the product's own chain at UK rates: a steering knuckle, "
    "two castings, a machined part, a pressed seat bracket and a gear. "
    "I'd point you at the right-hand column. The route was answered by an engineer, with the reason "
    "written down, like 'safety-critical, so forged'. Those answers are judgements, and you can argue "
    "with them. "
    "This baseline exists because of a real failure. All our tests once passed while a steering "
    "knuckle costed at five pounds forty-three. Every test used clean, synthetic blocks, and the bug "
    "only showed up on real geometry. Now a change that moves any of these parts fails the build. "
    "But be clear about what it is. It pins what the tool says. It isn't yet a comparison with what "
    "JLR paid.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — Reporting, deployment and security
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 17, "Reporting & Deployment", "Getting the Number Out — Safely",
             "Reports people can act on, and a tool that is safe on a locked-down laptop.")

export_cards = [
    (ACCENT_G, "Excel — Six Sheets",
     "The whole build-up, not just the total.\n\n"
     "Summary · material · operations ·\n"
     "machine rates · labour rates ·\n"
     "and a traceability sheet."),
    (ACCENT_B, "PDF Report and Negotiation Pack",
     "The versions you send out.\n\n"
     "Both carry the on-screen total to the penny.\n"
     "Files are named <type>-<part>-<date>."),
    (ACCENT_P, "Windows Laptop Package",
     "Copy a folder, double-click to start.\n\n"
     "No installer, no admin rights, no internet.\n"
     "Listens on the laptop only, unless shared."),
    (ORANGE,   "Part Photos",
     "Attach a photo to any calculation.\n\n"
     "It appears on the cover of the PDF report,\n"
     "so everyone knows which part it is."),
    (ACCENT_G, "Sign-In and Privacy",
     "Sign-in on everything that holds data.\n\n"
     "You see only your own saved scenarios.\n"
     "A password reset or \"sign out everywhere\"\n"
     "ends every old session."),
    (ACCENT_B, "Help and Accessibility",
     "Nobody needs training to start.\n\n"
     "Getting started, a glossary and\n"
     "troubleshooting — all in the app.\n"
     "Every page passes WCAG 2.1 AA (automated)."),
]

cw_e = Inches(4.1)
ch_e = Inches(2.15)
sx_e = Inches(0.45)
sy_e = Inches(1.98)
gap_e = Inches(0.12)

for i, (col, title, body) in enumerate(export_cards):
    r, c = divmod(i, 3)
    cx_e = sx_e + c * (cw_e + gap_e)
    cy_e = sy_e + r * (ch_e + gap_e)
    card(slide, cx_e, cy_e, cw_e, ch_e, title, body, accent=col, title_pt=10.5, body_pt=9.5)

notes(slide,
    "A cost that lives in one engineer's head isn't worth much, so this is about getting it out, "
    "safely. "
    "The Excel export has six sheets: summary, material, operations, machine rates, labour rates and a "
    "traceability sheet. The PDF report and the negotiation pack both carry the on-screen total to the "
    "penny, so nobody has to reconcile two numbers. "
    "For deployment, the JLR version is a Windows folder. You copy it to a locked-down laptop and "
    "double-click. No installer, no admin rights, no internet, and it only listens on that laptop "
    "unless someone deliberately shares it. "
    "Everything that holds data needs a sign-in, and you only see your own saved scenarios. A "
    "password reset or 'sign out everywhere' ends every old session. And every page passes an "
    "automated WCAG 2.1 AA accessibility check.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — What we can claim today
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 18, "Value — Honestly Stated", "What We Can Claim Today",
             "Only what the repository can show. Accuracy against real prices is measured as they are logged.")

stats14 = [
    ("<0.01%", "Engine vs hand calc, reference part",   ACCENT_G),
    ("6",      "Real parts pinned in the build",        ACCENT_B),
    ("2,438",  "Automated tests",                       ACCENT_P),
    ("19",     "Manufacturing processes",               ORANGE),
    ("0",      "Estimates compared with a JLR-paid price, so far", RED),
]
sw = Inches(2.4)
sh = Inches(1.1)
for i, (num, lbl, col) in enumerate(stats14):
    stat_card(slide, Inches(0.45) + i * (sw + Inches(0.1)), Inches(1.98), sw, sh, num, lbl, col)

benefits14 = [
    (ACCENT_B, "Speed",
     "The engineer answers a few questions instead of building a spreadsheet. We will time it in the pilot."),
    (ACCENT_G, "Accuracy",
     "Arithmetic proven against a hand calc. Accuracy against real prices is measured as they are logged."),
    (ORANGE,   "Negotiation",
     "A floor price you can defend, bucket by bucket. Supplier margin becomes visible instead of assumed."),
    (ACCENT_P, "Early Warning",
     "A cost from CAD at concept stage, while a change is still cheap."),
    (ACCENT_G, "Where to Build It",
     "Compare 20 regions in one table. Make-vs-buy answered with real rates."),
    (ACCENT_B, "One Method",
     "The same model everywhere, with every assumption on record."),
    (ORANGE,   "The Right Volume",
     "See what the part costs as volume grows, and when a new process starts to pay."),
    (ACCENT_P, "Safe to Run",
     "A Windows folder on a locked-down laptop. No internet, no admin rights, no AI."),
]

sx_b, sy_b, gap_b = Inches(0.45), Inches(3.25), Inches(0.1)
COLS_B = 4
cw_b = (W - sx_b * 2 - gap_b * (COLS_B - 1)) / COLS_B
_rows_b = -(-len(benefits14) // COLS_B)
ch_b = (Inches(6.95) - sy_b - gap_b * (_rows_b - 1)) / _rows_b

for i, (col, title, body) in enumerate(benefits14):
    r, c = divmod(i, COLS_B)
    card(slide, sx_b + c * (cw_b + gap_b), sy_b + r * (ch_b + gap_b),
         cw_b, ch_b, title, body, accent=col, title_pt=10.5, body_pt=9.5)

notes(slide,
    "I want to be careful on this slide. Earlier versions of this deck had big numbers for time saved "
    "and price reductions. I've taken them out, because we can't show them yet. "
    "What we can show is on the top row. The arithmetic matches a hand calculation to under a "
    "hundredth of a percent. Six real parts are pinned. There are 2,438 automated tests. It covers "
    "nineteen processes. And the last box is deliberate: so far we have compared no estimates with a "
    "price JLR actually paid. That's the number that matters most, and it gets built as actuals are "
    "logged. "
    "The cards below are the benefits I expect, and you can judge them for yourselves in a pilot: a "
    "floor price you can defend, one method across teams, an earlier warning, and a tool that runs "
    "safely offline.")


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — Roadmap & Next Steps
# ══════════════════════════════════════════════════════════════════════════════
slide = add_slide()
slide_header(slide, 19, "Vision & Next Steps", "What Comes Next",
             "CostVision runs today. Here is what could come next — and a small first step.")

rect(slide, Inches(0.45), Inches(2.0), Inches(5.9), Inches(4.92), SURFACE2, BORDER, Pt(0.5))
rect(slide, Inches(0.45), Inches(2.0), Inches(5.9), Inches(0.04), ACCENT_G)
txb(slide, "Runs Today", Inches(0.6), Inches(2.08),
    Inches(5.6), Inches(0.3), size=10.5, bold=True, color=ACCENT_G)

live_items = [
    "19 manufacturing processes, plus assembly and software",
    "CAD to Cost on rules — asks where the geometry can't decide",
    "Rate library dated 16 June 2026, editable",
    "Self-audit and a P10–P90 band on every result",
    "Learns from logged quotes and PO prices",
    "20 regions, each in its own currency",
    "Supplier quote comparison and negotiation pack",
    "Excel and PDF that match the screen to the penny",
    "Windows laptop package — no internet, no admin",
]

yy15 = Inches(2.44)
_pitch15 = (Inches(6.80) - yy15) / len(live_items)
for item in live_items:
    rect(slide, Inches(0.65), yy15 + Inches(0.15), Inches(0.06), Inches(0.06), ACCENT_G)
    txb(slide, item, Inches(0.84), yy15, Inches(5.3), Inches(0.3),
        size=9.5, color=TEXT_G, wrap=True)
    yy15 += _pitch15

rx15 = Inches(6.6)
ry15 = Inches(2.0)
rw15 = Inches(6.3)

phases = [
    (ORANGE,   "Next",
     "Connect to Teamcenter and SAP\n"
     "Cost-target view for programme teams\n"
     "Compare several suppliers side by side"),
    (ACCENT_P, "Then",
     "Calibrate from live ERP actuals\n"
     "Draft the RFQ from the should-cost\n"
     "Portfolio view for leadership"),
    (ACCENT_B, "Later",
     "Cost that updates as the design changes\n"
     "Redesign suggestions from AI — only if AI is approved\n"
     "Supplier risk scoring"),
]

yy15r = ry15
for col, title, body in phases:
    rect(slide, rx15, yy15r, rw15, Inches(1.06), SURFACE2, BORDER, Pt(0.5))
    rect(slide, rx15, yy15r, Inches(0.06), Inches(1.06), col)
    txb(slide, title, rx15 + Inches(0.14), yy15r + Inches(0.06), rw15 - Inches(0.2), Inches(0.28),
        size=9.5, bold=True, color=col)
    txb(slide, body, rx15 + Inches(0.14), yy15r + Inches(0.32), rw15 - Inches(0.2), Inches(0.72),
        size=8.5, color=TEXT_G, wrap=True)
    yy15r += Inches(1.14)

rect(slide, rx15, yy15r, rw15, Inches(1.5), SURFACE2, BORDER, Pt(0.5))
rect(slide, rx15, yy15r, Inches(0.06), Inches(1.5), ACCENT_G)
txb(slide, "Pilot — the Ask", rx15 + Inches(0.14), yy15r + Inches(0.08),
    rw15 - Inches(0.2), Inches(0.28), size=9.5, bold=True, color=ACCENT_G)
pilot_text = (
    "• Two or three commodities, one programme team\n"
    "• Four to six weeks, on real parts with real quotes and PO prices\n"
    "• Log every actual, so accuracy is measured, not claimed\n"
    "• Avinash Bhosale — Cost Engineering & Digital Innovation"
)
txb(slide, pilot_text, rx15 + Inches(0.14), yy15r + Inches(0.38), rw15 - Inches(0.2), Inches(1.05),
    size=9, color=TEXT_G, wrap=True)
assert yy15r + Inches(1.5) <= Inches(6.96), 'pilot box runs into the footer'

notes(slide,
    "So where does that leave us? The left column is live today, not a wish list. It runs on a "
    "laptop, without an API key, and it's backed by tests. "
    "On the right is where it could go next. First, connecting to the systems we already use, like "
    "Teamcenter and SAP, and a cost-target view for programme teams. Then calibrating from live ERP "
    "actuals and drafting the RFQ from the should-cost. The last phase includes AI features, and those "
    "would only happen if AI is approved. "
    "But I don't want the roadmap to distract from the ask, which is small. A four-to-six-week pilot "
    "on two or three commodities with one programme team, on real parts, with real quotes and PO "
    "prices. We log every actual, so accuracy is measured rather than claimed. "
    "That's what I'd like to agree today. Thank you. I'm happy to take questions.")


# ─── Save ─────────────────────────────────────────────────────────────────────
output_path = "/home/user/leamington-marathi/CostVision-Executive-Presentation.pptx"
prs.save(output_path)
# python-pptx cannot declare the notes master, and PowerPoint will not open a
# deck that has notes slides without one. See pptx_fixup.py.
_fixed = finalise(output_path)
print(f"Saved: {output_path}" + (f"  [fixed: {', '.join(_fixed)}]" if _fixed else ""))
print(f"Slides: {len(prs.slides)}")

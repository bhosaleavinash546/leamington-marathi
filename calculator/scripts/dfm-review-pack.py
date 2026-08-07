#!/usr/bin/env python3
"""
Build the geometric-DFM review pack — the document a manufacturing engineer marks.

Reads /tmp/dfm-review-pack/pack.json plus the PNGs beside it, both written by
scripts/dfm-review-pack.ts. Nothing here computes anything: every number, face
count, threshold, citation and image on the page came out of the engine run.
This file only lays them out.

The form is the whole point. The previous review sheet listed offending faces as
"1, 4, 9, 12, 18 … (60 total)", which nobody can judge without opening the CAD —
so nobody did. One image per issue, with the faces highlighted and a printed
T / F / N box beside it, is what turns an afternoon in CAD into ten minutes with
a pen.

    npx tsx scripts/dfm-review-pack.ts && python3 scripts/dfm-review-pack.py
"""
import json
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                PageBreak, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)

SRC = os.environ.get('CV_PACK_OUT', '/tmp/dfm-review-pack')
D = json.load(open(os.path.join(SRC, 'pack.json')))
OUT = os.path.join(SRC, 'CostVision-DFM-Review-Pack.pdf')

NAVY = colors.HexColor('#12233F')
ORANGE = colors.HexColor('#E8641C')
GREY = colors.HexColor('#5A6672')
LIGHT = colors.HexColor('#F4F6F8')
RULE = colors.HexColor('#DCE1E6')
INK = colors.HexColor('#26313D')
SEV = {
    'critical': colors.HexColor('#B03A2E'),
    'major': colors.HexColor('#B7791F'),
    'minor': colors.HexColor('#4A5560'),
    'opportunity': colors.HexColor('#1E7A54'),
}

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=19,
                    leading=23, textColor=NAVY, alignment=TA_LEFT, spaceAfter=2)
SUB = ParagraphStyle('SUB', parent=ss['Normal'], fontSize=9, leading=13, textColor=GREY, spaceAfter=10)
SEC = ParagraphStyle('SEC', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=11.5,
                     leading=15, textColor=colors.white, backColor=NAVY,
                     borderPadding=(6, 8, 6, 8), spaceBefore=4, spaceAfter=8)
SUBSEC = ParagraphStyle('SUBSEC', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=9.5,
                        leading=13, textColor=NAVY, spaceBefore=9, spaceAfter=3)
BODY = ParagraphStyle('BODY', parent=ss['Normal'], fontSize=8.2, leading=11.4, textColor=INK)
NOTE = ParagraphStyle('NOTE', parent=BODY, fontSize=7.4, leading=10, textColor=GREY)
CELL = ParagraphStyle('CELL', parent=ss['Normal'], fontSize=7.2, leading=9.4, textColor=INK)
HEADW = ParagraphStyle('HEADW', parent=CELL, fontName='Helvetica-Bold', textColor=colors.white)
ISSUE = ParagraphStyle('ISSUE', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=9.6,
                       leading=12.6, textColor=NAVY, spaceAfter=2)
MONO = ParagraphStyle('MONO', parent=ss['Normal'], fontName='Courier', fontSize=6.9,
                      leading=9, textColor=colors.HexColor('#1B3A5C'))

story = []
A = story.append


def esc(t):
    return (t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def money(v):
    """Sub-penny values are real — several findings land at £0.003/part. Rounding
    them to £0.00 would print a finding as free, which is not what the engine
    said, so the small ones keep their fourth decimal."""
    if not v:
        return '—'
    return f'£{v:,.2f}' if v >= 0.01 else f'£{v:.4f}'


def sev_chip(s):
    c = SEV.get(s, GREY)
    return f'<font color="#{c.hexval()[4:]}"><b>{(s or "").upper()}</b></font>'


def kv_table(rows, widths):
    t = Table([[Paragraph(esc(x), HEADW if i == 0 else CELL) for x in row]
               for i, row in enumerate(rows)], colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.25, RULE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


def mark_box():
    """The T / F / N box, printed rather than described. A reviewer with a pen
    and no spreadsheet must still be able to return a usable mark."""
    t = Table([[Paragraph('<b>T</b>', CELL), '', Paragraph('<b>F</b>', CELL), '',
                Paragraph('<b>N</b>', CELL), '']],
              colWidths=[6 * mm, 9 * mm, 6 * mm, 9 * mm, 6 * mm, 9 * mm], rowHeights=[8 * mm])
    t.setStyle(TableStyle([
        ('BOX', (1, 0), (1, 0), 0.7, NAVY), ('BOX', (3, 0), (3, 0), 0.7, NAVY),
        ('BOX', (5, 0), (5, 0), 0.7, NAVY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 1), ('RIGHTPADDING', (0, 0), (-1, -1), 1),
    ]))
    return t


PAGE_W = A4[0] - 36 * mm

# ── Cover ────────────────────────────────────────────────────────────────────
n_issues = sum(len(p['issues']) for p in D['parts'])
n_imgs = sum(1 for p in D['parts'] for i in p['issues'] if i.get('imageFile'))
n_priced = sum(1 for p in D['parts'] for i in p['issues'] if i.get('costGBP'))

A(Paragraph('Geometric DFM — review pack', H1))
A(Paragraph(f'{n_issues} findings across {len(D["parts"])} real parts, for T / F / N marking '
            f'&mdash; generated {D.get("generated", date.today().isoformat())}', SUB))

A(Paragraph(
    '<b>What this is.</b> CostVision now runs geometric DFM rules directly against the measured '
    'CAD &mdash; not against the costing result, and with no AI involved. Every finding below names '
    'the B-rep faces that triggered it, the measured value, the threshold, and the published source '
    'of that threshold. The parts are the six with independent manual bottom-up costs, so they are '
    'the only ones whose right answer is known from outside the tool.', BODY))
A(Spacer(1, 6))
A(Paragraph(
    '<b>What we need from you.</b> A mark against each finding. The rules have been validated by '
    'unit tests and by my own judgement, which proves the arithmetic is right and says nothing about '
    'whether the findings are <i>true</i>. Nobody with a manufacturing floor behind them has looked '
    'at one yet. That is the gap this closes, and no further work goes into these rules until the '
    'marks come back.', BODY))
A(Spacer(1, 8))

A(kv_table([
    ['Mark', 'Means', 'What happens to the rule'],
    ['T', 'TRUE — a real issue, worth raising with the supplier or the designer.', 'Kept as is.'],
    ['F', 'FALSE — wrong, or not a real issue on this part.',
     'Candidate for DELETION, not tuning. See below.'],
    ['N', "NOISE — technically true, but not worth an engineer's time.",
     'Threshold raised, or the rule drops to advisory.'],
], [16 * mm, 96 * mm, 62 * mm]))
A(Spacer(1, 8))

A(Paragraph(
    '<b>Why F is the column that matters.</b> A false positive costs more trust than a missed '
    'finding does. An engineer who is shown one wrong finding stops reading the other nineteen. So a '
    'rule that collects an F is a candidate for deletion rather than tuning &mdash; we would rather '
    'ship twelve rules that are always right than nineteen that are usually right.', BODY))
A(Spacer(1, 6))
A(Paragraph(
    '<b>Please also fill in "what was missed".</b> There is a box at the end of each part. Anything '
    'the tool should have caught and did not is worth more than any finding it did catch, because it '
    'becomes the next rule. A short finding list on a part is <b>not</b> a clean bill of health '
    '&mdash; each part states what the tool could not check, and that list is usually longer than '
    'the findings.', BODY))
A(Spacer(1, 8))

summary = [['Part', 'Commodity', 'Manual cost', 'Features', 'Findings', 'Addressable £/part',
            'Not checked']]
for p in D['parts']:
    summary.append([p['name'],
                    p['commodity'].replace('_', ' ') + (f" ({p['process']})" if p.get('process') else ''),
                    p['manualCost'], str(p['features']), str(len(p['issues'])),
                    money(p.get('totalGBP')), str(len(p.get('limitations', [])))])
A(kv_table(summary, [36 * mm, 33 * mm, 22 * mm, 18 * mm, 18 * mm, 26 * mm, 21 * mm]))
A(Spacer(1, 6))
A(Paragraph(
    f'{n_priced} of the {n_issues} findings carry a £/part figure. The rest state, in place of a '
    'number, exactly which cost model is missing &mdash; a finding with no price says so rather '
    'than quietly showing zero. The £ figures are the cost of the feature as drawn at 50,000/yr, '
    '£60/hr machine and £25/hr labour; they are not a claim that the whole amount is recoverable.', NOTE))
A(Spacer(1, 4))
n_caveat = sum(1 for p in D['parts'] for i in p['issues'] if i.get('imageNote'))
A(Paragraph(
    f'{n_imgs} of {n_issues} findings have an image'
    + (f', and {n_caveat} of those carry a note under the picture saying what it does or does not '
       'show &mdash; a feature on an internal surface, or one too small to see at part scale. '
       if n_caveat else '. ')
    + 'Where an image is absent the reason is printed in its place: a part-level finding has no '
      'faces to highlight, which is different from a render that failed.', NOTE))

# ── One section per part ─────────────────────────────────────────────────────
for p in D['parts']:
    A(PageBreak())
    A(Paragraph(f"{esc(p['name'])} &mdash; {esc(p['commodity'].replace('_', ' '))}"
                + (f" ({esc(p['process'])})" if p.get('process') else ''), SEC))
    A(kv_table([
        ['File', 'Independent manual cost', 'Features measured', 'Findings', 'Addressable £/part'],
        [p['file'], p['manualCost'], str(p['features']), str(len(p['issues'])),
         money(p.get('totalGBP'))],
    ], [62 * mm, 34 * mm, 26 * mm, 20 * mm, 32 * mm]))
    A(Spacer(1, 8))

    if not p['issues']:
        A(Paragraph('<b>No rule in the pack fired on this part.</b> Read that against the '
                    '"what was not checked" list below &mdash; it means the checks that RAN found '
                    'nothing, not that the part is clean.', BODY))

    for it in p['issues']:
        block = [Paragraph(f"{it['idx']}. {esc(it['title'])} &nbsp; {sev_chip(it['severity'])}", ISSUE)]

        meta = [['Instances', 'Measured', 'Threshold', '£/part']]
        meta.append([str(it['count']), it['measured'], it['threshold'], money(it.get('costGBP'))])
        block.append(kv_table(meta, [20 * mm, 60 * mm, 34 * mm, 24 * mm]))
        block.append(Spacer(1, 4))

        img = it.get('imageFile')
        if img and os.path.exists(os.path.join(SRC, img)):
            # The harness renders 1440x560 — three 480-wide viewports side by side.
            block.append(Image(os.path.join(SRC, img), width=PAGE_W, height=PAGE_W * 560 / 1440))
            block.append(Paragraph(
                "Offending faces in red. Left: front isometric. Middle: rear isometric (the "
                "opposite side — half the findings on a real part sit where one view cannot see "
                "them). Right: close-up on the worst instance, aimed down the feature's own axis. "
                f"{len(it['faceIds'])} face(s): "
                f"{', '.join(str(f) for f in it['faceIds'][:20])}"
                + (' and more' if len(it['faceIds']) > 20 else ''), NOTE))
            # A caveat about what the picture shows belongs UNDER the picture,
            # not swallowed because an image happened to render.
            if it.get('imageNote'):
                block.append(Paragraph(f"<b>Note:</b> {esc(it['imageNote'])}", NOTE))
        else:
            block.append(Paragraph(f"<b>No image.</b> {esc(it.get('imageNote') or 'Not rendered.')}", NOTE))
        block.append(Spacer(1, 4))

        block.append(Paragraph(f"<b>Suggested fix:</b> {esc(it['recommendation'])}", BODY))
        block.append(Paragraph(f"<b>Source:</b> {esc(it['source'])}", NOTE))
        if it.get('costBasis'):
            label = 'Cost basis' if it.get('costGBP') else 'Not priced'
            block.append(Paragraph(f"<b>{label}:</b> {esc(it['costBasis'])}", NOTE))
        block.append(Paragraph(f"<font face='Courier' size='6.6'>{esc(it['ruleId'])}</font>", NOTE))
        block.append(Spacer(1, 3))

        mark = Table([[Paragraph('<b>Mark</b>', CELL), mark_box(),
                       Paragraph('Comment:', CELL), '']],
                     colWidths=[13 * mm, 47 * mm, 17 * mm, PAGE_W - 77 * mm])
        mark.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LINEBELOW', (3, 0), (3, 0), 0.5, RULE),
            ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
            ('BOX', (0, 0), (-1, -1), 0.25, RULE),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        block.append(mark)
        block.append(Spacer(1, 10))
        # KeepTogether so an issue's image never lands on a different page from
        # the mark box it belongs to.
        A(KeepTogether(block))

    A(Paragraph('What the tool could NOT check on this part', SUBSEC))
    A(Paragraph(
        'Printed so a short finding list above is not read as a clean part. Each line is a check '
        'the engine declared out of scope for this geometry, not a check that passed.', NOTE))
    A(Spacer(1, 3))
    for lim in p.get('limitations', []):
        A(Paragraph(f'&bull; {esc(lim)}', BODY))
    A(Spacer(1, 8))

    A(Paragraph('MISSED — what should this have caught and did not?', SUBSEC))
    miss = Table([['1.', ''], ['2.', ''], ['3.', '']],
                 colWidths=[8 * mm, PAGE_W - 8 * mm], rowHeights=[9 * mm] * 3)
    miss.setStyle(TableStyle([
        ('LINEBELOW', (1, 0), (1, -1), 0.5, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('FONT', (0, 0), (0, -1), 'Helvetica', 8),
        ('TEXTCOLOR', (0, 0), (0, -1), GREY),
    ]))
    A(miss)


# ── Page furniture ───────────────────────────────────────────────────────────
def furniture(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY)
    canv.rect(0, A4[1] - 9 * mm, A4[0], 9 * mm, stroke=0, fill=1)
    canv.setFillColor(ORANGE)
    canv.rect(0, A4[1] - 9 * mm, 34 * mm, 9 * mm, stroke=0, fill=1)
    canv.setStrokeColor(RULE)
    canv.setLineWidth(0.4)
    canv.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
    canv.setFont('Helvetica', 6.8)
    canv.setFillColor(GREY)
    canv.drawString(18 * mm, 9 * mm,
                    'CostVision · Geometric DFM review pack · findings measured from CAD, no AI')
    canv.drawRightString(A4[0] - 18 * mm, 9 * mm, f'Page {canv.getPageNumber()}')
    canv.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=16 * mm, bottomMargin=17 * mm,
                      title='CostVision Geometric DFM Review Pack', author='CostVision')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='body',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=furniture)])
doc.build(story)
print(f'PDF written: {OUT}  ({n_issues} findings, {n_imgs} images)')

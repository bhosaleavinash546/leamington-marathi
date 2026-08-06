#!/usr/bin/env python3
"""
Build the DFM/DFA + geometry advisor + idea-lever reference PDF.

Reads /tmp/rule-library.json, which scripts/extract-rule-library.ts produces by
parsing the engine source. Nothing here is transcribed by hand: every rule,
threshold, severity and recommendation on the page is the one the engine runs.

    npx tsx scripts/extract-rule-library.ts && python3 scripts/build-rule-library-pdf.py
"""
import json
import re
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

D = json.load(open('/tmp/rule-library.json'))
OUT = '../CostVision-Rule-Library-Reference.pdf'

NAVY = colors.HexColor('#12233F')
ORANGE = colors.HexColor('#E8641C')
GREY = colors.HexColor('#5A6672')
LIGHT = colors.HexColor('#F4F6F8')
RULE = colors.HexColor('#DCE1E6')
SEV = {
    'critical': colors.HexColor('#B03A2E'),
    'major': colors.HexColor('#B7791F'),
    'minor': colors.HexColor('#4A5560'),
    'opportunity': colors.HexColor('#1E7A54'),
}

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Title'], fontName='Helvetica-Bold',
                    fontSize=19, leading=23, textColor=NAVY, alignment=TA_LEFT, spaceAfter=2)
SUB = ParagraphStyle('SUB', parent=ss['Normal'], fontSize=9, leading=13, textColor=GREY, spaceAfter=10)
SEC = ParagraphStyle('SEC', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=11.5,
                     leading=15, textColor=colors.white, backColor=NAVY,
                     borderPadding=(6, 8, 6, 8), spaceBefore=14, spaceAfter=8)
SUBSEC = ParagraphStyle('SUBSEC', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=9.5,
                        leading=13, textColor=NAVY, spaceBefore=9, spaceAfter=3)
BODY = ParagraphStyle('BODY', parent=ss['Normal'], fontSize=8.2, leading=11.4, textColor=colors.HexColor('#26313D'))
NOTE = ParagraphStyle('NOTE', parent=BODY, fontSize=7.4, leading=10, textColor=GREY)
CELL = ParagraphStyle('CELL', parent=ss['Normal'], fontSize=7.2, leading=9.4, textColor=colors.HexColor('#26313D'))
CELLB = ParagraphStyle('CELLB', parent=CELL, fontName='Helvetica-Bold')
# A Paragraph carries its own colour, so a TableStyle TEXTCOLOR cannot lighten
# it — a header built from Paragraphs came out dark-on-navy and unreadable.
HEADW = ParagraphStyle('HEADW', parent=CELL, fontName='Helvetica-Bold', textColor=colors.white)
MONO = ParagraphStyle('MONO', parent=ss['Normal'], fontName='Courier', fontSize=6.9,
                      leading=9, textColor=colors.HexColor('#1B3A5C'))

story = []
A = story.append


def esc(t):
    return (t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def humanise(t):
    """`${st.stations} stations` reads badly on a rule sheet. Show the variable
    name in guillemets so it is obvious the value is computed at run time."""
    if not t:
        return ''
    def repl(m):
        expr = m.group(1)
        leaf = re.split(r'[.\(\)]', expr.strip())[-1] or expr.strip()
        leaf = re.sub(r'[^A-Za-z0-9_]', '', leaf) or 'value'
        return f'‹{leaf}›'
    return re.sub(r'\$\{([^}]*)\}', repl, t)


def para(t, style=BODY):
    return Paragraph(esc(humanise(t)), style)


def sev_chip(s):
    if not s:
        return ''
    c = SEV.get(s, GREY)
    # hexval() gives '0xRRGGBB'; reportlab's inline markup needs '#RRGGBB'.
    return f'<font color="#{c.hexval()[4:]}"><b>{s.upper()}</b></font>'


def commodity_label(c):
    if not c:
        return 'All commodities'
    return c.replace('_', ' ')


def rules_table(rules, show_saving=True, applies_to=None):
    """`applies_to` overrides the per-rule commodity. An advisor's checks carry no
    commodity gate in code because the whole module IS the gate — printing them
    as "All commodities" said the opposite of what is true."""
    head = ['#', 'Rule / trigger condition', 'Applies to', 'Sev.']
    if show_saving:
        head.append('Saving')
    rows = [head]
    for r in rules:
        left = [Paragraph(f'<b>{esc(humanise(r["title"]))}</b>', CELL)]
        if r.get('condition'):
            left.append(Paragraph(f'Fires when: {esc(r["condition"])}', MONO))
        if r.get('description'):
            left.append(Paragraph(esc(humanise(r['description'])), CELL))
        if r.get('recommendation'):
            left.append(Paragraph(f'<b>Action:</b> {esc(humanise(r["recommendation"]))}', CELL))
        if r.get('note'):
            left.append(Paragraph(f'<i>Why:</i> {esc(r["note"])}', NOTE))
        row = [
            Paragraph(str(r['n']), CELL),
            left,
            Paragraph(esc(applies_to or commodity_label(r.get('commodity'))), CELL),
            Paragraph(sev_chip(r.get('severity')) or esc(r.get('category', '')), CELL),
        ]
        if show_saving:
            sv = r.get('savingPct')
            row.append(Paragraph(f'{sv}%' if sv and re.fullmatch(r'[\d.]+', str(sv)) else esc(str(sv or '')), CELL))
        rows.append(row)

    widths = [9 * mm, 94 * mm, 28 * mm, 24 * mm] + ([17 * mm] if show_saving else [])
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 7.4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 1), (0, -1), 'RIGHT'),
        ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.25, RULE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


# ── Cover ────────────────────────────────────────────────────────────────────
c = D['counts']
total = c['dfm'] + c['dfa'] + c['advisorChecks'] + c['optimisations'] + c['levers']

A(Paragraph('CostVision Rule Library', H1))
A(Paragraph(
    f'DFM / DFA rules, geometry advisors and idea-generation levers &mdash; '
    f'extracted from the engine source on {date.today():%d %b %Y}', SUB))

A(Paragraph(
    'Every rule in this document was read out of the code that runs, by '
    '<font face="Courier">scripts/extract-rule-library.ts</font>. Nothing is transcribed. '
    'Each entry shows the exact condition that fires it, the severity and category the engine '
    'assigns, the saving it claims, and the recommendation the engineer sees. Re-running the '
    'extractor after a rule change regenerates this document against the new code, so it cannot '
    'drift out of date the way a hand-written rule sheet does.', BODY))
A(Spacer(1, 8))

summary = [
    ['Layer', 'Count', 'Source file', 'What it does'],
    ['DFM rules', str(c['dfm']), 'src/engine/dfm-dfa.ts',
     'Threshold checks on the finished estimate: utilisation, OEE, cycle, tooling, tolerance, packaging, logistics.'],
    ['DFA rules', str(c['dfa']), 'src/engine/dfm-dfa.ts',
     'Assembly and handling checks in the Boothroyd tradition: part count, stations, setups, manning, fastening.'],
    ['Geometry advisors', f"{c['advisors']} modules\n{c['advisorChecks']} checks", 'src/engine/modules/*-advisor.ts',
     'Per-process physics: wall thickness, draft, section ratio, bend radius, undercuts, gate/runner, ply schedule.'],
    ['Cost optimisations', str(c['optimisations']), 'src/engine/dfm-dfa.ts',
     'Cost-structure levers raised alongside the DFM findings.'],
    ['Idea levers', str(c['levers']), 'src/engine/idea-levers.ts',
     '360-degree catalogue across material, design, process, tooling, logistics, commercial, quality, sustainability.'],
    ['TOTAL', str(total), '', 'Deterministic checks run on every estimate. No AI involved in any of them.'],
]
t = Table([[Paragraph(esc(x).replace('\n', '<br/>'), HEADW if i == 0 else CELL) for x in row]
           for i, row in enumerate(summary)],
          colWidths=[32 * mm, 22 * mm, 45 * mm, 73 * mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.25, RULE),
    ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, LIGHT]),
    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FDF0E6')),
    ('FONT', (0, -1), (-1, -1), 'Helvetica-Bold', 7.2),
    ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
A(t)
A(Spacer(1, 10))

A(Paragraph('How the layers fit together', SUBSEC))
A(Paragraph(
    '<b>1. The estimate is computed first.</b> All money is deterministic arithmetic in the cost engine. '
    'Nothing in this document sets a price.<br/>'
    '<b>2. DFM and DFA rules read the finished estimate</b> &mdash; the 8-bucket split, the operation list, '
    'utilisation, OEE, manning &mdash; and flag what is out of benchmark for that commodity.<br/>'
    '<b>3. Geometry advisors read the measured CAD</b> when there is any: wall thickness, draft angle, section '
    'ratio, bend radius. These are process physics, not cost ratios, so they fire whether or not the cost looks odd.<br/>'
    '<b>4. Idea levers propose actions</b>, ranked by saving. They are gated by commodity and by what the tool '
    'actually knows: a lever built on an assumed volume is downgraded to a confirm-first note rather than an instruction.<br/>'
    '<b>5. The headline saving is a root-sum-square of the top three</b>, capped at 40% &mdash; never a sum, because '
    'levers overlap and adding them overstates what is really available.', BODY))

A(PageBreak())

# ── 1 · DFM ──────────────────────────────────────────────────────────────────
A(Paragraph(f'1 &nbsp;&mdash;&nbsp; Design-for-Manufacture rules ({c["dfm"]})', SEC))
universal = [r for r in D['dfm'] if not r.get('commodity')]
gated = [r for r in D['dfm'] if r.get('commodity')]
A(Paragraph(
    f'{len(universal)} rules run on every commodity; {len(gated)} are gated to specific processes. '
    'The trigger condition is the literal expression from the source &mdash; these are the thresholds, not a paraphrase.', NOTE))
A(Spacer(1, 5))
A(Paragraph('1A &nbsp; Universal rules &mdash; every commodity', SUBSEC))
A(rules_table(universal))
A(Spacer(1, 8))
A(Paragraph('1B &nbsp; Commodity-gated rules', SUBSEC))
A(rules_table(gated))

# ── 2 · DFA ──────────────────────────────────────────────────────────────────
A(PageBreak())
A(Paragraph(f'2 &nbsp;&mdash;&nbsp; Design-for-Assembly rules ({c["dfa"]})', SEC))
A(Paragraph(
    'Assembly and handling checks in the Boothroyd-Dewhurst tradition: does the routing imply more '
    'stations than the part needs, is manning higher than the operation warrants, is the part count '
    'or fastening scheme adding handling that design could remove.', NOTE))
A(Spacer(1, 5))
A(rules_table(D['dfa']))

# ── 3 · Geometry advisors ────────────────────────────────────────────────────
A(PageBreak())
A(Paragraph(f'3 &nbsp;&mdash;&nbsp; Geometry advisors ({c["advisors"]} modules, {c["advisorChecks"]} checks)', SEC))
A(Paragraph(
    'One module per process family. Each reads measured geometry and the process reference table for the '
    'chosen route, then reports what the physics will not allow &mdash; a wall below the minimum the process '
    'can fill, a section ratio that will draw shrinkage porosity, a bend radius below the material minimum. '
    'These are independent of cost: a part can be cheap and still be unmakeable.', NOTE))
A(Spacer(1, 6))

for adv in D['advisors']:
    block = [Paragraph(
        f'{adv["module"].replace("-", " ").title()} &nbsp;&mdash;&nbsp; '
        f'<font face="Courier" size="7.5">{esc(adv["entry"])}()</font> &nbsp;&middot;&nbsp; '
        f'{adv["checkCount"]} checks', SUBSEC)]
    if adv.get('tables'):
        block.append(Paragraph(
            'Reference tables: ' + ', '.join(f'<font face="Courier">{esc(t)}</font>' for t in adv['tables'][:6]), NOTE))
    block.append(Spacer(1, 3))
    block.append(rules_table(adv['checks'], show_saving=False,
                             applies_to=adv['module'].replace('-', ' ')))
    A(KeepTogether(block) if adv['checkCount'] <= 6 else block[0])
    if adv['checkCount'] > 6:
        for b in block[1:]:
            A(b)
    A(Spacer(1, 7))

# ── 4 · Idea generation ──────────────────────────────────────────────────────
A(PageBreak())
A(Paragraph(
    f'4 &nbsp;&mdash;&nbsp; Idea generation ({c["optimisations"] + c["levers"]} levers)', SEC))
A(Paragraph(
    f'{c["optimisations"]} cost-structure levers raised alongside the DFM findings, plus a '
    f'{c["levers"]}-lever catalogue covering eight categories. Each carries an expected saving, a risk '
    'rating, a timeframe and a technical justification. Savings shown as a formula are computed from the '
    'part\'s own cost structure rather than being a fixed number.', NOTE))
A(Spacer(1, 5))

A(Paragraph('4A &nbsp; Cost-structure levers', SUBSEC))
A(rules_table(D['opts']))

by_cat = {}
for l in D['levers']:
    by_cat.setdefault(l.get('category') or 'other', []).append(l)

A(Spacer(1, 8))
A(Paragraph(f'4B &nbsp; 360-degree lever catalogue &mdash; {len(by_cat)} categories', SUBSEC))
for cat in sorted(by_cat):
    rows = by_cat[cat]
    A(Paragraph(f'{cat.title()} &nbsp;&middot;&nbsp; {len(rows)} levers', SUBSEC))
    body = [['#', 'Lever', 'Applies to', 'Owner', 'Saving']]
    for r in rows:
        left = [Paragraph(f'<b>{esc(humanise(r["title"]))}</b>', CELL)]
        if r.get('condition'):
            left.append(Paragraph(f'Offered when: {esc(r["condition"])}', MONO))
        if r.get('description'):
            left.append(Paragraph(esc(humanise(r['description'])), CELL))
        if r.get('justification'):
            left.append(Paragraph(f'<i>Basis:</i> {esc(humanise(r["justification"]))}', NOTE))
        meta = ' / '.join(x for x in [r.get('lever'), r.get('risk'), r.get('timeframe')] if x)
        body.append([
            Paragraph(str(r['n']), CELL), left,
            Paragraph(esc(commodity_label(r.get('commodity'))), CELL),
            Paragraph(esc(meta), CELL),
            Paragraph(esc(str(r.get('savingPct') or '')), MONO),
        ])
    t = Table(body, colWidths=[9 * mm, 88 * mm, 26 * mm, 22 * mm, 27 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 7.4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('ALIGN', (0, 1), (0, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.25, RULE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    A(t)
    A(Spacer(1, 6))

# ── Appendix ─────────────────────────────────────────────────────────────────
A(PageBreak())
A(Paragraph('Appendix &nbsp;&mdash;&nbsp; Provenance and how to regenerate', SEC))
A(Paragraph(
    'This document is generated, not written. Two commands rebuild it against whatever the engine '
    'currently contains:', BODY))
A(Spacer(1, 4))
A(Paragraph(
    'npx tsx scripts/extract-rule-library.ts<br/>'
    'python3 scripts/build-rule-library-pdf.py', MONO))
A(Spacer(1, 6))
A(Paragraph(
    'The extractor parses the source directly: it walks each rule\'s enclosing scope to find the commodity '
    'gate in force, captures the guard condition verbatim, and reads severity, category, saving, risk and '
    'recommendation out of the object literal the engine constructs. Line numbers below are where each rule '
    'lives, so any entry here can be traced to source in one step.', BODY))
A(Spacer(1, 6))

files = [
    ['File', 'Contents'],
    ['src/engine/dfm-dfa.ts', f'{c["dfm"]} DFM rules, {c["dfa"]} DFA rules, {c["optimisations"]} cost-structure levers'],
    ['src/engine/idea-levers.ts', f'{c["levers"]}-lever 360-degree catalogue'],
    ['src/engine/modules/*-advisor.ts', f'{c["advisors"]} geometry advisors, {c["advisorChecks"]} process-physics checks'],
    ['src/engine/opportunity-ranking.ts', 'Ranks every finding by saving; root-sum-square headline capped at 40%'],
    ['src/engine/should-cost-audit.ts', 'Pre-flight lesson checks that block an implausible estimate before it is published'],
]
t = Table([[Paragraph(esc(x), HEADW if i == 0 else CELL) for x in row]
           for i, row in enumerate(files)], colWidths=[62 * mm, 110 * mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.25, RULE),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
    ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
A(t)
A(Spacer(1, 8))
A(Paragraph(
    '<b>One limitation worth stating.</b> The trigger conditions are reproduced exactly, but a rule whose '
    'threshold depends on the commodity benchmark table (utilisation, OEE, bucket percentages) will read as '
    'a comparison against a variable. The benchmark values themselves live in '
    '<font face="Courier">src/engine/insights.ts</font> and are not reproduced here.', NOTE))


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
    canv.drawString(18 * mm, 9 * mm, 'CostVision · Rule Library Reference · generated from engine source')
    canv.drawRightString(A4[0] - 18 * mm, 9 * mm, f'Page {canv.getPageNumber()}')
    canv.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=16 * mm, bottomMargin=17 * mm,
                      title='CostVision Rule Library Reference',
                      author='CostVision')
frame = Frame(doc.leftMargin, doc.bottomMargin,
              doc.width, doc.height, id='body',
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=furniture)])
doc.build(story)
print(f'PDF written: {OUT}  ({total} rules)')

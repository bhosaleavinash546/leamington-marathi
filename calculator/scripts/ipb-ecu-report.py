#!/usr/bin/env python3
"""
Corrected should-cost report for the Bosch IPB2.0 ECU PCBA.

Renders the JSON produced by ipb-ecu-costing.ts into a PDF laid out in the same
section structure as the CostVision tool report, so the two can be read side by
side. Adds the section the tool report omitted entirely — the bill of materials —
and a gap analysis against that report.

    npx tsx scripts/ipb-ecu-costing.ts && python3 scripts/ipb-ecu-report.py
"""
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether)

D = json.load(open('/tmp/ipb-costing.json'))
OUT = '/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/CostVision-IPB2.0-ECU-PCBA-CORRECTED.pdf'

NAVY = colors.HexColor('#16325C'); TEAL = colors.HexColor('#0E8074')
SLATE = colors.HexColor('#3A4356'); MUTED = colors.HexColor('#6B7280')
LINE = colors.HexColor('#DCE3EE'); LIGHT = colors.HexColor('#F0F4F9')
RED = colors.HexColor('#B03A2E'); GREEN = colors.HexColor('#2E8B57')
AMBER = colors.HexColor('#B7791F')

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=15, textColor=NAVY, spaceAfter=2)
SUB = ParagraphStyle('SUB', parent=ss['Normal'], fontName='Helvetica', fontSize=8, textColor=MUTED, spaceAfter=8)
SEC = ParagraphStyle('SEC', parent=ss['Normal'], fontName='Helvetica-Bold', fontSize=9.5, textColor=colors.white,
                     backColor=NAVY, borderPadding=(4, 5, 4, 5), spaceBefore=10, spaceAfter=5)
BODY = ParagraphStyle('BODY', parent=ss['Normal'], fontName='Helvetica', fontSize=7.6, textColor=SLATE, leading=10.5)
NOTE = ParagraphStyle('NOTE', parent=BODY, fontSize=6.8, textColor=MUTED, leading=9)
CELL = ParagraphStyle('CELL', parent=ss['Normal'], fontName='Helvetica', fontSize=6.6, textColor=SLATE, leading=8.4)
CELLB = ParagraphStyle('CELLB', parent=CELL, fontName='Helvetica-Bold', textColor=NAVY)

def money(x): return f"£{x:,.2f}"

def table(data, widths, align_right=(), header=True, size=6.8, pad=3):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [('FONT', (0, 0), (-1, -1), 'Helvetica', size),
          ('TEXTCOLOR', (0, 0), (-1, -1), SLATE),
          ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
          ('TOPPADDING', (0, 0), (-1, -1), pad), ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
          ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
          ('LINEBELOW', (0, 0), (-1, -2), 0.4, LINE)]
    if header:
        st += [('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
               ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', size),
               ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT])]
    for c in align_right:
        st.append(('ALIGN', (c, 0), (c, -1), 'RIGHT'))
    t.setStyle(TableStyle(st))
    return t

story = []
A = story.append

# ── header ───────────────────────────────────────────────────────────────────
A(Paragraph('CostVision · Manufacturing Should-Cost Intelligence', SUB))
A(Paragraph('CORRECTED SHOULD-COST ANALYSIS — Bosch IPB2.0 ECU PCBA', H1))
A(Paragraph(
    f"Commodity: <b>PCBA</b> (populated assembly) · Currency: <b>GBP</b> · Region: <b>{D['region']}</b> · "
    f"Annual volume: <b>{D['annualVolume']:,}</b> · Operations: <b>{len(D['operations'])}</b><br/>"
    "Re-costed from eight board photographs after the uploaded tool report costed this board as bare "
    "<i>pcb_fab</i> with zero operations. Bottom-up, fully traceable.", SUB))

kpi = [['TOTAL SHOULD-COST', 'MATERIAL', 'PROCESS', 'LABOUR', 'OVERHEAD', 'MARGIN'],
       [money(D['total']),
        f"{D['breakdown']['rawMaterial']/D['total']*100:.1f}%",
        f"{D['breakdown']['process']/D['total']*100:.1f}%",
        f"{D['breakdown']['labour']/D['total']*100:.1f}%",
        f"{D['breakdown']['overhead']/D['total']*100:.1f}%",
        f"{D['breakdown']['margin']/D['total']*100:.1f}%"]]
t = Table(kpi, colWidths=[46*mm, 24*mm, 24*mm, 24*mm, 24*mm, 24*mm])
t.setStyle(TableStyle([
    ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 6.2), ('TEXTCOLOR', (0, 0), (-1, 0), MUTED),
    ('FONT', (0, 1), (0, 1), 'Helvetica-Bold', 15), ('TEXTCOLOR', (0, 1), (0, 1), TEAL),
    ('FONT', (1, 1), (-1, 1), 'Helvetica-Bold', 10), ('TEXTCOLOR', (1, 1), (-1, 1), NAVY),
    ('BOX', (0, 0), (-1, -1), 0.6, LINE), ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
    ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
A(t)

A(Paragraph('§1 — Key Assumptions', SEC))
b = D['board']
A(Paragraph(
    f"Board <b>{b['w']}×{b['h']} mm ({b['areaCm2']:.0f} cm²)</b> · <b>{b['layers']} layers</b> · {b['tech']} · "
    f"{b['outerCu']} oz outer / {b['innerCu']} oz inner copper · {b['finish']} · {b['grade']}<br/>"
    f"<b>{D['placements']} SMT placements</b> · {D['bgaCount']} BGA · 2 press-fit connectors · double-sided assembly · "
    f"assembly quality grade AEC-Q Grade 1 (brake-by-wire)<br/>"
    "Overhead 9% of factory base · Margin 8% of subtotal · Yield 98.5% first-pass · NRE £46,000 assembly + £9,500 fab, "
    f"both amortised over {D['annualVolume']:,}.<br/>"
    "<font color='#B7791F'><b>Board size and layer count are scaled from the photographs, not measured.</b> "
    "A caliper measurement and a layer count from a cross-section would remove the largest single uncertainty "
    "in this estimate.</font>", BODY))

# ── §2 8-bucket ──────────────────────────────────────────────────────────────
A(Paragraph('§2 — 8-Bucket Cost Breakdown', SEC))
labels = [('rawMaterial', '1. Raw Material (bare PCB + BOM + yield)'), ('process', '2. Process (Machine)'),
          ('labour', '3. Direct Labour'), ('tooling', '4. Tooling (amortised)'),
          ('packaging', '5. Packaging'), ('logistics', '6. Logistics'),
          ('overhead', '7. Overhead (SG&A)'), ('margin', '8. Supplier Margin')]
rows = [['Cost Bucket', 'Amount (GBP)', '% of Total']]
for k, lab in labels[:6]:
    rows.append([lab, money(D['breakdown'][k]), f"{D['breakdown'][k]/D['total']*100:.1f}%"])
rows.append(['FACTORY COST', money(D['factoryCost']), f"{D['factoryCost']/D['total']*100:.1f}%"])
rows.append([labels[6][1], money(D['breakdown']['overhead']), f"{D['breakdown']['overhead']/D['total']*100:.1f}%"])
rows.append(['SUBTOTAL', money(D['subtotal']), f"{D['subtotal']/D['total']*100:.1f}%"])
rows.append([labels[7][1], money(D['breakdown']['margin']), f"{D['breakdown']['margin']/D['total']*100:.1f}%"])
rows.append(['TOTAL SHOULD-COST', money(D['total']), '100.0%'])
t = table(rows, [100*mm, 35*mm, 31*mm], align_right=(1, 2))
t.setStyle(TableStyle([('FONT', (0, 7), (-1, 7), 'Helvetica-Bold', 6.8), ('TEXTCOLOR', (0, 7), (-1, 7), NAVY),
                       ('FONT', (0, 9), (-1, 9), 'Helvetica-Bold', 6.8), ('TEXTCOLOR', (0, 9), (-1, 9), NAVY),
                       ('FONT', (0, 11), (-1, 11), 'Helvetica-Bold', 8), ('TEXTCOLOR', (0, 11), (-1, 11), TEAL),
                       ('BACKGROUND', (0, 11), (-1, 11), colors.HexColor('#E6F4F1'))]))
A(t)

# ── §3 BOM — the section the tool report did not have ────────────────────────
A(Paragraph('§3 — Bill of Materials  (the uploaded tool report contained no BOM at all)', SEC))
rows = [['', 'Ref', 'Qty', 'Description', 'Unit £', 'Ext £', 'Source']]
for x in D['bom']:
    rows.append(['✓' if x['conf'] == 'confirmed' else '~', x['refDes'], str(x['qty']),
                 Paragraph(x['description'], CELL), f"{x['unitPriceGBP']:.3f}", f"{x['ext']:.2f}",
                 Paragraph(x['note'], CELL)])
rows.append(['', '', '', Paragraph('<b>BOM TOTAL</b>', CELLB), '', f"{D['bomTotal']:.2f}", ''])
t = table(rows, [6*mm, 15*mm, 10*mm, 55*mm, 14*mm, 15*mm, 51*mm], align_right=(2, 4, 5), size=6.2, pad=2)
t.setStyle(TableStyle([('FONT', (0, len(rows)-1), (-1, len(rows)-1), 'Helvetica-Bold', 6.6),
                       ('BACKGROUND', (0, len(rows)-1), (-1, len(rows)-1), colors.HexColor('#E6F4F1'))]))
A(t)
conf_val = sum(x['ext'] for x in D['bom'] if x['conf'] == 'confirmed')
A(Paragraph(
    f"✓ = package marking legible in a photograph ({sum(1 for x in D['bom'] if x['conf']=='confirmed')} of {len(D['bom'])} lines, "
    f"{conf_val/D['bomTotal']*100:.0f}% of BOM value). ~ = count or price inferred from board density and class medians. "
    "Component prices are China buy, 150k/yr, and carry roughly ±25% until quoted — that band is the second-largest "
    "uncertainty after board size.", NOTE))

# ── §4 operations ────────────────────────────────────────────────────────────
A(Paragraph('§4 — Operations Detail  (the uploaded tool report had zero operations)', SEC))
rows = [['Operation', 'Machine', 'Rate £/hr', 'Cycle (s)', 'OEE', 'Machine £', 'Labour £', 'Op Total £']]
for o in D['operations']:
    rows.append([o['name'], o['machineId'], f"{o['machineRate']:.2f}", f"{o['sec']:.0f}",
                 f"{o['oee']*100:.0f}%", f"{o['process']:.2f}", f"{o['labour']:.2f}",
                 f"{o['process']+o['labour']:.2f}"])
rows.append(['TOTAL', '', '', '', '', f"{D['breakdown']['process']:.2f}",
             f"{D['breakdown']['labour']:.2f}", f"{D['breakdown']['process']+D['breakdown']['labour']:.2f}"])
t = table(rows, [42*mm, 30*mm, 17*mm, 16*mm, 12*mm, 17*mm, 17*mm, 15*mm], align_right=(2, 3, 5, 6, 7), size=6.4)
t.setStyle(TableStyle([('FONT', (0, len(rows)-1), (-1, len(rows)-1), 'Helvetica-Bold', 6.6),
                       ('BACKGROUND', (0, len(rows)-1), (-1, len(rows)-1), colors.HexColor('#E6F4F1'))]))
A(t)
A(Paragraph(
    f"Bare board is bought in at {money(b['pcbCost'])} each (costed separately through the PCB-fab module: "
    f"{money(D['fabBreakdown']['rawMaterial'])} board material and fab processing + tooling, packaging, "
    "logistics, overhead and margin) and enters this "
    "assembly as material, which is how a contract assembler actually buys it.", NOTE))

# ── §5 uncertainty + sensitivity ─────────────────────────────────────────────
A(Paragraph('§5 — Uncertainty and Sensitivity', SEC))
s = D['sensitivity']
rows = [['Driver', 'Basis', 'Effect on total'],
        ['Board size / layer count', 'scaled from photos, not measured', '±8% (±£15)'],
        ['Component prices', 'class medians, not quoted', '±25% of BOM → ±£28'],
        ['BGA X-ray method', f"headline uses 100% offline X-ray ({D['operations'][2]['sec']:.0f} s/board)",
         f"inline AXI at {s['inlineAxiSec']} s → {money(s['totalInlineAxi'])} (−{money(D['total']-s['totalInlineAxi'])})"],
        ['Assembly complexity', "'high' — >300 parts, BGAs, double-sided", '±10% of SMT → ±£1'],
        ['Overhead / margin', '9% / 8% assumed', '±1pt each → ±£3']]
A(table(rows, [42*mm, 65*mm, 59*mm], size=6.6))
A(Paragraph(
    f"<b>Working range £165 – £215 per board.</b> At {D['annualVolume']:,}/yr, 100% offline X-ray would need "
    "3.3 dedicated machines; inline AXI is the industry norm at this volume and is shown above as the realistic "
    "lower case. The headline keeps the conservative default — an over-estimate is a negotiating "
    "position, an under-estimate is a signed mistake. Inline AXI is now a selectable strategy on the PCBA form, "
    "so this case can be quoted directly rather than reconstructed by hand.", NOTE))

# ── §6 gap analysis ──────────────────────────────────────────────────────────
A(Paragraph('§6 — Gap Analysis vs the Uploaded Tool Report', SEC))
gaps = [
    ['1', 'Wrong commodity', 'Costed as <b>pcb_fab</b> (bare board only), with one material line passed straight through.',
     'A populated assembly must be costed as <b>pcba</b>. Bare board is one input to it, not the whole part.', 'Critical'],
    ['2', 'Zero operations', 'Process £0.00, Labour £0.00, "Operations: 0" — no placement, reflow, inspection or test.',
     f"{len(D['operations'])} operations, {money(D['breakdown']['process']+D['breakdown']['labour'])} of conversion cost. "
     "A 755-placement safety ECU cannot assemble itself.", 'Critical'],
    ['3', 'Volume ignored', 'Report shows "Annual volume: —"; tooling amortised over <b>5,000</b> parts.',
     f"{D['annualVolume']:,}/yr applied. Tooling falls from £4.52-equivalent to {money(D['breakdown']['tooling'])}/part.", 'Critical'],
    ['4', 'No BOM', 'One line: mat-virtual £82.43. No component lines, so the largest cost bucket is unauditable.',
     f"{len(D['bom'])} BOM lines, {money(D['bomTotal'])}, each flagged confirmed or estimated (§3).", 'Critical'],
    ['5', 'Wrong-commodity advice', '§11 recommended "HPDC → lost foam; forging → closed-die" and a material-utilisation '
     'lever — casting and forging advice on a PCB.',
     'Fixed in the engine: material-dominance advice is now gated to the commodity, and a pass-through '
     'material bucket no longer offers a utilisation lever.', 'Major'],
    ['6', 'Carbon = 0.00', 'Net weight 0.000 kg → 0.00 kgCO2e for a 500 g electronics assembly.',
     'Carbon must come from board area, copper mass and component class, not net weight.', 'Major'],
    ['7', 'Confidence not enforced', 'Published a headline while self-reporting "Low confidence, 1 data point auditable".',
     'A costing with zero operations should be blocked, not rendered.', 'Major'],
    ['8', 'Currency', 'Reported in CNY with an FX note, when GBP was asked for.',
     'Reported in GBP throughout.', 'Minor'],
]
rows = [['#', 'Gap', 'What the tool report did', 'Corrected here', 'Severity']]
for g in gaps:
    rows.append([g[0], Paragraph(f"<b>{g[1]}</b>", CELLB), Paragraph(g[2], CELL), Paragraph(g[3], CELL),
                 Paragraph(f"<font color='{'#B03A2E' if g[4]=='Critical' else '#B7791F' if g[4]=='Major' else '#6B7280'}'><b>{g[4]}</b></font>", CELL)])
A(table(rows, [7*mm, 30*mm, 62*mm, 55*mm, 12*mm], size=6.2, pad=2.5))
A(Paragraph(
    "Four engine defects found during this exercise have been fixed at source and pinned with tests: "
    "double-sided assembly was charging every component placement twice; BGA X-ray had no model other than "
    "100% offline inspection; the PCB forms inherited mechanical-part packaging and freight defaults; and "
    "optimisation advice was not gated to the commodity. Gaps 1–4 and 6–8 above are how the report was "
    "<i>driven</i>, not engine faults — the board was costed under the wrong commodity from the start.", NOTE))

A(Paragraph('§7 — Net Effect', SEC))
rows = [['', 'Total per board', 'Material', 'Process + Labour', 'Basis'],
        ['Uploaded tool report', money(D['toolTotalGBP']),
         money(745.99/D['fx']), '£0.00', '0 operations · volume not applied · no BOM'],
        ['Corrected (this report)', money(D['total']),
         money(D['breakdown']['rawMaterial']),
         money(D['breakdown']['process']+D['breakdown']['labour']),
         f"{len(D['operations'])} operations · {D['annualVolume']:,}/yr · {len(D['bom'])}-line BOM"],
        ['Difference', f"+{money(D['total']-D['toolTotalGBP'])}",
         f"+{money(D['breakdown']['rawMaterial']-745.99/D['fx'])}",
         f"+{money(D['breakdown']['process']+D['breakdown']['labour'])}",
         f"tool under-states by {(D['total']-D['toolTotalGBP'])/D['total']*100:.0f}%"]]
t = table(rows, [38*mm, 27*mm, 25*mm, 30*mm, 46*mm], align_right=(1, 2, 3), size=6.6)
t.setStyle(TableStyle([('FONT', (0, 3), (-1, 3), 'Helvetica-Bold', 6.8), ('TEXTCOLOR', (0, 3), (-1, 3), RED),
                       ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#FBEAE8'))]))
A(t)
A(Paragraph(
    "The gap is not a disagreement about component prices — the two BOM values are within a quarter of each other. "
    "It is that the uploaded report contained <b>no assembly cost whatsoever</b> and never applied the 150,000/yr volume. "
    "Taking £98/board into a supplier meeting for this assembly would have put the floor price roughly half where it "
    "belongs.", BODY))

# ── page furniture ───────────────────────────────────────────────────────────
def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY); canvas.rect(0, A4[1]-6*mm, A4[0], 6*mm, stroke=0, fill=1)
    canvas.setFont('Helvetica', 6.5); canvas.setFillColor(MUTED)
    canvas.drawString(14*mm, 9*mm, 'CostVision · Corrected Should-Cost · Bosch IPB2.0 ECU PCBA · CONFIDENTIAL')
    canvas.drawRightString(A4[0]-14*mm, 9*mm, f'Page {doc.page}')
    canvas.setStrokeColor(LINE); canvas.line(14*mm, 12*mm, A4[0]-14*mm, 12*mm)
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm,
                      topMargin=12*mm, bottomMargin=15*mm, title='CostVision — Bosch IPB2.0 ECU PCBA (corrected)')
doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(14*mm, 15*mm, A4[0]-28*mm, A4[1]-28*mm, id='f')],
                                   onPage=furniture)])
doc.build(story)
print('PDF written:', OUT)

#!/usr/bin/env python3
"""Manual should-cost of the EDU control board (Dana TM4 Gemini CTRL, PC-10465018-D), China, 10,000 boards a year,
6-year programme — a hand build-up independent of the tool's cost model, and its reconciliation with the tool's live run.

Inputs: reading.json (the parts read off the photos), manual-prices.json (each line priced as a named catalogue analogue at
the parts bought a year, or a stated engineering estimate), the tool's live result (reprice.json from live-run.ts).
Rates: CostVision rate book, China (machines £/h: SMT line, high-speed SMT line, X-ray, ICT; electronics operator and
technician £/h) and CostVision's PCB country table for China (bare-board £/dm², finish, vias, impedance, coating £/cm²,
freight £/kg). Every other figure is an ENGINEERING ESTIMATE and is labelled so in the workbook.
Writes manual-costing.xlsx (live formulas) and manual.json (the same figures, for the report and the check).
Usage: python3 manual.py <reprice.json> <out-dir>"""
import json, os, sys, math
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

H = os.path.dirname(os.path.abspath(__file__))
tool = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(H, 'manual-prices.json')))
reading = json.load(open(os.path.join(H, 'reading.json')))

# ── Inputs (value, unit, class, basis) ─────────────────────────────────────────────────────────────────────────────
I = {}
def inp(k, v, unit, cls, basis): I[k] = dict(v=v, unit=unit, cls=cls, basis=basis)
inp('boards', 10000, 'boards / year', 'given', 'User: annual volume')
inp('years', 6, 'years', 'given', 'User: programme life')
inp('w', 395, 'mm', 'given', 'User: board width')
inp('h', 215, 'mm', 'given', 'User: board height')
inp('layers', 6, 'layers', 'estimate', 'Engineering estimate from the photos (dual BGA MCU, HV section); not visible')
inp('vias', 4500, 'through vias', 'estimate', 'Engineering estimate, ~5 a cm² (dense dual-BGA area); not visible')
inp('fx', 8.8799, 'CNY per £', 'table', 'CostVision PCB country table, China')
inp('base2L', 0.116, '£ / dm²', 'table', 'CostVision PCB country table, China: 2-layer base')
inp('layerAdd', 0.07379, '£ / dm² / layer', 'table', 'CostVision PCB country table, China: per layer above 2')
inp('enig', 0.22, 'fraction', 'table', 'CostVision PCB country table, China: ENIG multiplier 1.22')
inp('viaRate', 0.1897, '£ / 100 vias', 'table', 'CostVision PCB country table, China')
inp('imped', 0.18, 'fraction', 'table', 'CostVision PCB country table, China: controlled impedance uplift')
inp('panelW', 457, 'mm', 'estimate', 'Engineering: 18 × 24 in production panel, the size a fab would run this board on')
inp('panelH', 610, 'mm', 'estimate', 'Engineering: 18 × 24 in production panel')
inp('upPerPanel', 2, 'boards', 'estimate', 'Engineering: 2-up (215 × 2 + 3 mm gap = 433 mm ≤ 590 mm usable)')
inp('autoFab', 0.30, 'fraction', 'estimate', 'Engineering: automotive grade on the bare board (IATF 16949 fab, high-Tg laminate, IPC-6012 class 3 with coupons per panel and microsection per lot), 20-40 % typical')
inp('burden', 0.06, 'fraction', 'estimate', 'Engineering: EMS material margin + attrition + inventory, 5-8 % typical at this volume')
inp('opRate', 3.7523, '£ / h', 'rate book', 'CostVision rate book, China: electronics assembly operator, fully loaded')
inp('techRate', 4.4583, '£ / h', 'rate book', 'CostVision rate book, China: technician, fully loaded')
inp('smtHS', 77.1852, '£ / h', 'rate book', 'CostVision rate book, China: High-Speed SMT Line (Fuji/Juki/ASM)')
inp('smtStd', 29.6453, '£ / h', 'rate book', 'CostVision rate book, China: SMT Pick & Place + Reflow Line (used as the selective-solder cell proxy)')
inp('xray', 45.8755, '£ / h', 'rate book', 'CostVision rate book, China: X-Ray BGA Inspection Cell')
inp('ict', 54.9548, '£ / h', 'rate book', 'CostVision rate book, China: ICT Bed-of-Nails Test System (also the functional-tester proxy)')
inp('aoiRate', 20, '£ / h', 'estimate', 'Engineering: in-line AOI machine (not in the rate book)')
inp('pressRate', 12, '£ / h', 'estimate', 'Engineering: servo press-fit cell (not in the rate book)')
inp('progRate', 8, '£ / h', 'estimate', 'Engineering: gang programmer station')
inp('routerRate', 10, '£ / h', 'estimate', 'Engineering: depanel router')
inp('placements', 2054, 'placements', 'reading', 'Reading: SMT parts incl. 50 test loops (both sides)')
inp('cph', 20000, 'placements / h', 'estimate', 'Engineering: effective rate on a high-speed line for a mixed automotive build (~1/3 of nominal)')
inp('smtCrew', 2, 'operators', 'estimate', 'Engineering: 2 operators on the line')
inp('lot', 1000, 'boards / lot', 'estimate', 'Engineering: ~1 month of demand per lot')
inp('changeH', 1.5, 'h / side / lot', 'estimate', 'Engineering: line changeover per side')
inp('paste', 0.80, '£ / board', 'estimate', 'Engineering: solder paste (~10 g SAC305, both sides) and line consumables')
inp('thtParts', 21, 'parts', 'reading', 'Reading: through-hole parts inserted by hand (T1, film cap, 4 PTC, choke, J1, J4-J7, J15-J21)')
inp('thtInsert', 8, 's / part', 'estimate', 'Engineering: manual insertion')
inp('thtJoints', 68, 'joints', 'reading', 'Reading: through-hole joints (pins stated per part)')
inp('selSol', 2.5, 's / joint', 'estimate', 'Engineering: selective solder')
inp('pressParts', 5, 'parts', 'reading', 'Reading: J2, J3, J12 press-fit connectors + 2 press-in nuts')
inp('pressSec', 20, 's / part', 'estimate', 'Engineering: press-fit incl. handling')
inp('coatRate', 0.002635, '£ / cm²', 'table', 'CostVision PCB country table, China: conformal coating')
inp('coatSides', 2, 'sides', 'given', 'User: conformal coating on the entire board')
inp('maskSec', 180, 's', 'estimate', 'Engineering: masking / demasking connectors, press-fit and test areas')
inp('uvSec', 30, 's', 'estimate', 'Engineering: UV inspection of the coating')
inp('stakeSec', 60, 's', 'estimate', 'Engineering: silicone staking of PTCs, transformer, choke, hybrid caps')
inp('stakeMat', 0.15, '£', 'estimate', 'Engineering: silicone')
inp('aoiSec', 50, 's', 'estimate', 'Engineering: 2 sides × 25 s')
inp('xraySec', 30, 's', 'estimate', 'Engineering: 2 BGAs, 100 %')
inp('ictSec', 90, 's', 'estimate', 'Engineering (same as the tool)')
inp('progSec', 120, 's', 'estimate', 'Engineering: 2 AURIX + EEPROM')
inp('fctSec', 180, 's', 'estimate', 'Engineering: functional test + HV insulation / hipot')
inp('routerSec', 45, 's', 'estimate', 'Engineering: depanel')
inp('finalSec', 60, 's', 'estimate', 'Engineering: final inspection, serial label')
inp('label', 0.05, '£', 'estimate', 'Engineering: serial label')
inp('pack', 0.60, '£', 'estimate', 'Engineering: ESD tray + carton for a 395 × 215 mm board')
inp('sga', 0.10, 'fraction', 'estimate', 'Engineering: EMS SG&A / engineering / quality on conversion (rate-book rates already carry machine overheads)')
inp('profit', 0.08, 'fraction', 'estimate', 'Engineering: EMS profit on conversion')
inp('fpyRework', 0.03, 'fraction', 'estimate', 'Engineering: boards reworked (FPY 97 %)')
inp('reworkMin', 10, 'min', 'estimate', 'Engineering: rework per failed board (technician)')
inp('scrap', 0.003, 'fraction', 'estimate', 'Engineering: boards scrapped')
inp('nre', 31400, '£ one-off', 'estimate', 'Engineering: stencils £700, ICT fixture £7,000, FCT/EOL fixture £15,000, press-fit tooling £3,000, selective-solder pallets £2,000, coating masks £1,500, AOI/X-ray/programming set-up £1,000, bare-board tooling £1,200')
inp('autoNre', 15500, '£ one-off', 'tool', 'Tool: automotive programme NRE (PPAP, FMEA, DV/PV, audit) — shown, not in the unit cost')
inp('boardKg', 0.552, 'kg / board', 'given', 'User: weighed populated board, 552 g')
inp('packKg', 0.12, 'kg / board', 'estimate', 'Engineering: share of ESD tray + carton a board')
inp('seaKg', 0.40, '£ / kg', 'table', 'CostVision PCB country table, China: sea freight')
inp('duty', 0.037, 'fraction', 'table', 'CostVision PCB country table, China → UK: import duty (an assumption, HS line not confirmed)')
v = {k: d['v'] for k, d in I.items()}

# ── Computation (Python mirror of the workbook formulas) ───────────────────────────────────────────────────────────
C = {}
C['programme'] = v['boards'] * v['years']
C['components'] = round(sum(l['lineGBP'] for l in lines), 4)
C['burdenGBP'] = C['components'] * v['burden']
area = v['w'] * v['h'] / 10000; C['areaDm2'] = area
util = v['upPerPanel'] * v['w'] * v['h'] / (v['panelW'] * v['panelH']); C['util'] = util; waste = 1 / max(0.4, util); C['waste'] = waste
C['fabBase'] = area * v['base2L'] * waste
C['fabLayers'] = area * v['layerAdd'] * (v['layers'] - 2) * waste
C['fabFinish'] = (C['fabBase'] + C['fabLayers']) * v['enig']
C['fabVias'] = v['vias'] / 100 * v['viaRate']
C['fabImp'] = (C['fabBase'] + C['fabLayers']) * v['imped']
C['fabStd'] = C['fabBase'] + C['fabLayers'] + C['fabFinish'] + C['fabVias'] + C['fabImp']
C['fabAuto'] = C['fabStd'] * v['autoFab']
C['fab'] = C['fabStd'] + C['fabAuto']
op, tech = v['opRate'], v['techRate']
A = {}
A['SMT placement (both sides)'] = v['placements'] / v['cph'] * (v['smtHS'] + v['smtCrew'] * op)
A['Line changeover (2 sides)'] = 2 * v['changeH'] * (v['smtHS'] + v['smtCrew'] * op) / v['lot']
A['Solder paste & consumables'] = v['paste']
A['THT insertion (manual)'] = v['thtParts'] * v['thtInsert'] / 3600 * op
A['Selective solder'] = v['thtJoints'] * v['selSol'] / 3600 * (v['smtStd'] + op)
A['Press-fit (3 connectors, 2 nuts)'] = v['pressParts'] * v['pressSec'] / 3600 * (v['pressRate'] + op)
A['Conformal coating (both sides)'] = 2 * 0 + v['coatSides'] * area * 100 * v['coatRate']
A['Coating masking + UV inspection'] = (v['maskSec'] + v['uvSec']) / 3600 * op
A['Staking / potting'] = v['stakeSec'] / 3600 * op + v['stakeMat']
A['AOI (2 sides)'] = v['aoiSec'] / 3600 * (v['aoiRate'] + 0.5 * op)
A['X-ray (2 BGA)'] = v['xraySec'] / 3600 * (v['xray'] + op)
A['ICT'] = v['ictSec'] / 3600 * (v['ict'] + op)
A['Programming (2 MCU + EEPROM)'] = v['progSec'] / 3600 * (v['progRate'] + op)
A['Functional + HV insulation test'] = v['fctSec'] / 3600 * (v['ict'] + tech)
A['Depanel (router)'] = v['routerSec'] / 3600 * (v['routerRate'] + op)
A['Final inspection + serial label'] = v['finalSec'] / 3600 * op + v['label']
A['Packaging (ESD tray, carton)'] = v['pack']
C['assemblyItems'] = A
C['conversion'] = sum(A.values())
C['sgaGBP'] = C['conversion'] * v['sga']
C['profitGBP'] = (C['conversion'] + C['sgaGBP']) * v['profit']
C['conversionOHP'] = C['conversion'] + C['sgaGBP'] + C['profitGBP']
C['rework'] = v['fpyRework'] * (v['reworkMin'] / 60 * tech + (v['ictSec'] + v['fctSec']) / 3600 * (v['ict'] + tech))
C['scrapGBP'] = v['scrap'] * (C['components'] + C['burdenGBP'] + C['fab'] + C['conversionOHP'])
C['quality'] = C['rework'] + C['scrapGBP']
C['nrePerBoard'] = v['nre'] / C['programme']
C['exWorks'] = C['components'] + C['burdenGBP'] + C['fab'] + C['conversionOHP'] + C['quality'] + C['nrePerBoard']
C['freight'] = (v['boardKg'] + v['packKg']) * v['seaKg']
C['dutyGBP'] = (C['exWorks'] + C['freight']) * v['duty']
C['delivered'] = C['exWorks'] + C['freight'] + C['dutyGBP']
C['autoNrePerBoard'] = v['autoNre'] / C['programme']

# ── The tool's live figures ────────────────────────────────────────────────────────────────────────────────────────
bd = tool['selectedCountryBreakdown']; b = bd['breakdown']
T = dict(components=round(bd['bomCostPerBoard'] - b['materialBurden'], 2), burden=b['materialBurden'], fabStd=round(bd['pcbFabPerBoard'] - b['automotiveFab'], 2),
         fabAuto=b['automotiveFab'], fab=bd['pcbFabPerBoard'], assembly=bd['assemblyPerBoard'], other=round(b['energy'] + b['packaging'] + b['yieldLoss'], 2),
         freight=b['logistics'], duty=b['importDuty'], delivered=bd['totalPerBoard'])
T['exWorks'] = round(bd['totalPerBoard'] - b['logistics'] - b['importDuty'], 2)
toolLines = tool['analysis']['bom']
def toolLine(ref):
    for l in toolLines:
        if str(l.get('refDes')) == ref: return l
    return None
REC = []
for l in lines:
    t = toolLine(l['refDes']) or {}
    tu = float(t.get('unitPriceGBP') or 0); tq = float(t.get('qty') or l['qty']); tl = float(t.get('lineTotalGBP') or 0)
    REC.append(dict(refDes=l['refDes'], description=l['description'], qty=l['qty'], manualUnit=l['unitGBP'], manualLine=l['lineGBP'], manualKind=l['priceKind'],
                    manualNote=l['priceNote'], toolQty=tq, toolUnit=tu, toolLine=tl, toolClass=str(t.get('priceBasis') or t.get('classLabel') or t.get('priceSource') or ''), delta=round(tl - l['lineGBP'], 4)))
REC.sort(key=lambda r: -abs(r['delta']))
json.dump(dict(inputs=I, computed=C, tool=T, reconciliation=REC, lines=lines), open(os.path.join(OUT, 'manual.json'), 'w'), indent=1, ensure_ascii=False)

# ── Workbook with live formulas ────────────────────────────────────────────────────────────────────────────────────
wb = Workbook()
HDR = PatternFill('solid', fgColor='1F3A5F'); HF = Font(bold=True, color='FFFFFF'); BOLD = Font(bold=True)
EST = PatternFill('solid', fgColor='FFF4D6'); GIV = PatternFill('solid', fgColor='E3F1E3'); TAB = PatternFill('solid', fgColor='E6EEF8')
def head(ws, row, cols):
    for i, c in enumerate(cols, 1):
        x = ws.cell(row=row, column=i, value=c); x.fill = HDR; x.font = HF; x.alignment = Alignment(wrap_text=True, vertical='top')
def widths(ws, ws_w):
    for i, w in enumerate(ws_w, 1): ws.column_dimensions[get_column_letter(i)].width = w

# Inputs
wsI = wb.active; wsI.title = 'Inputs'
wsI['A1'] = 'EDU control board PCBA — manual should-cost inputs (China, 10,000 / year, 6 years)'; wsI['A1'].font = Font(bold=True, size=13)
wsI['A2'] = 'Green = given by the user · Blue = CostVision rate book / PCB country table · Amber = engineering estimate (change it here; every sheet follows)'
head(wsI, 4, ['Key', 'Value', 'Unit', 'Class', 'Basis'])
ref = {}
for r, (k, d) in enumerate(I.items(), 5):
    wsI.cell(r, 1, k); c = wsI.cell(r, 2, d['v']); wsI.cell(r, 3, d['unit']); wsI.cell(r, 4, d['cls']); wsI.cell(r, 5, d['basis'])
    c.fill = GIV if d['cls'] in ('given',) else TAB if d['cls'] in ('table', 'rate book', 'tool') else EST if d['cls'] == 'estimate' else PatternFill()
    ref[k] = f"Inputs!$B${r}"
widths(wsI, [14, 12, 16, 11, 110])

# Components
wsC = wb.create_sheet('Components')
head(wsC, 1, ['#', 'RefDes / group', 'Description (as read)', 'Package', 'Qty / board', 'Parts bought / year', 'Manual unit £', 'Line £', 'Price kind', 'Price basis', 'Price source (catalogue, at parts bought)', 'Evidence (reading)'])
for i, l in enumerate(lines, 2):
    wsC.cell(i, 1, i - 1); wsC.cell(i, 2, l['refDes']); wsC.cell(i, 3, l['description']); wsC.cell(i, 4, l['pkg']); wsC.cell(i, 5, l['qty'])
    wsC.cell(i, 6, f"=E{i}*{ref['boards']}"); c = wsC.cell(i, 7, l['unitGBP']); c.number_format = '0.00000'
    if l['priceKind'] == 'engineering estimate': c.fill = EST
    wsC.cell(i, 8, f"=E{i}*G{i}").number_format = '£#,##0.0000'
    wsC.cell(i, 9, l['priceKind']); wsC.cell(i, 10, l['priceNote']); wsC.cell(i, 11, l['priceSource']); wsC.cell(i, 12, l['basis'])
nC = len(lines) + 1
wsC.cell(nC + 1, 2, 'Components total').font = BOLD; wsC.cell(nC + 1, 5, f"=SUM(E2:E{nC})"); t = wsC.cell(nC + 1, 8, f"=SUM(H2:H{nC})"); t.font = BOLD; t.number_format = '£#,##0.00'
widths(wsC, [4, 26, 60, 18, 8, 12, 11, 11, 18, 60, 60, 50])
compTotal = f"Components!$H${nC + 1}"

# PCB
wsP = wb.create_sheet('PCB')
head(wsP, 1, ['Item', 'Formula', '£ / board'])
P = [('Board area (dm²)', f"={ref['w']}*{ref['h']}/10000", None), ('Panel utilisation', f"={ref['upPerPanel']}*{ref['w']}*{ref['h']}/({ref['panelW']}*{ref['panelH']})", None),
     ('Waste factor', '=1/MAX(0.4,C3)', None),
     ('2-layer base', f"=C2*{ref['base2L']}*C4", 1), ('Layers above 2', f"=C2*{ref['layerAdd']}*({ref['layers']}-2)*C4", 1),
     ('ENIG finish', f"=(C5+C6)*{ref['enig']}", 1), ('Vias', f"={ref['vias']}/100*{ref['viaRate']}", 1), ('Controlled impedance', f"=(C5+C6)*{ref['imped']}", 1),
     ('Standard bare board', '=SUM(C5:C9)', 2), ('Automotive grade (IATF, high-Tg, class 3)', f"=C10*{ref['autoFab']}", 1), ('Bare board, automotive', '=C10+C11', 2)]
for r, (lab, f, kind) in enumerate(P, 2):
    wsP.cell(r, 1, lab); wsP.cell(r, 2, f[1:]); c = wsP.cell(r, 3, f); c.number_format = '0.0000' if kind is None else '£#,##0.0000'
    if kind == 2: wsP.cell(r, 1).font = BOLD; c.font = BOLD
widths(wsP, [44, 70, 14])
fabCell = 'PCB!$C$12'

# Assembly
wsA = wb.create_sheet('Assembly')
head(wsA, 1, ['Operation', 'Formula', '£ / board'])
AF = [('SMT placement (both sides)', f"={ref['placements']}/{ref['cph']}*({ref['smtHS']}+{ref['smtCrew']}*{ref['opRate']})"),
      ('Line changeover (2 sides)', f"=2*{ref['changeH']}*({ref['smtHS']}+{ref['smtCrew']}*{ref['opRate']})/{ref['lot']}"),
      ('Solder paste & consumables', f"={ref['paste']}"),
      ('THT insertion (manual)', f"={ref['thtParts']}*{ref['thtInsert']}/3600*{ref['opRate']}"),
      ('Selective solder', f"={ref['thtJoints']}*{ref['selSol']}/3600*({ref['smtStd']}+{ref['opRate']})"),
      ('Press-fit (3 connectors, 2 nuts)', f"={ref['pressParts']}*{ref['pressSec']}/3600*({ref['pressRate']}+{ref['opRate']})"),
      ('Conformal coating (both sides)', f"={ref['coatSides']}*PCB!$C$2*100*{ref['coatRate']}"),
      ('Coating masking + UV inspection', f"=({ref['maskSec']}+{ref['uvSec']})/3600*{ref['opRate']}"),
      ('Staking / potting', f"={ref['stakeSec']}/3600*{ref['opRate']}+{ref['stakeMat']}"),
      ('AOI (2 sides)', f"={ref['aoiSec']}/3600*({ref['aoiRate']}+0.5*{ref['opRate']})"),
      ('X-ray (2 BGA)', f"={ref['xraySec']}/3600*({ref['xray']}+{ref['opRate']})"),
      ('ICT', f"={ref['ictSec']}/3600*({ref['ict']}+{ref['opRate']})"),
      ('Programming (2 MCU + EEPROM)', f"={ref['progSec']}/3600*({ref['progRate']}+{ref['opRate']})"),
      ('Functional + HV insulation test', f"={ref['fctSec']}/3600*({ref['ict']}+{ref['techRate']})"),
      ('Depanel (router)', f"={ref['routerSec']}/3600*({ref['routerRate']}+{ref['opRate']})"),
      ('Final inspection + serial label', f"={ref['finalSec']}/3600*{ref['opRate']}+{ref['label']}"),
      ('Packaging (ESD tray, carton)', f"={ref['pack']}")]
for r, (lab, f) in enumerate(AF, 2):
    wsA.cell(r, 1, lab); wsA.cell(r, 2, f[1:]); wsA.cell(r, 3, f).number_format = '£#,##0.0000'
nA = len(AF) + 1
rows = [('Conversion (direct)', f"=SUM(C2:C{nA})"), ('EMS SG&A / quality / engineering', f"=C{nA+1}*{ref['sga']}"),
        ('EMS profit', f"=(C{nA+1}+C{nA+2})*{ref['profit']}"), ('Assembly & test, EMS price', f"=SUM(C{nA+1}:C{nA+3})")]
for k, (lab, f) in enumerate(rows):
    r = nA + 1 + k; wsA.cell(r, 1, lab).font = BOLD; wsA.cell(r, 2, f[1:]); c = wsA.cell(r, 3, f); c.number_format = '£#,##0.0000'; c.font = BOLD
widths(wsA, [40, 92, 14])
convCell = f"Assembly!$C${nA + 4}"

# Summary
wsS = wb.create_sheet('Summary', 0)
wsS['A1'] = 'EDU control board PCBA (Dana TM4 Gemini CTRL, PC-10465018-D) — manual should-cost and the tool, per board'; wsS['A1'].font = Font(bold=True, size=13)
wsS['A2'] = 'China build, 10,000 boards a year, 6-year programme (60,000 boards). £ per board. Manual = this workbook (live formulas); Tool = CostVision live run, 25 Nov 2026.'
head(wsS, 4, ['Element', 'Manual £', 'Tool £', 'Tool − manual £', 'Manual basis'])
S = [('Components', f"={compTotal}", T['components'], 'Named catalogue analogues at the parts bought a year; engineering estimates where none (Components sheet)'),
     ('EMS material burden', f"=B5*{ref['burden']}", T['burden'], 'Manual 6 %; tool 7 % at 10,000 boards'),
     ('Bare board', f"={fabCell}", T['fab'], 'China PCB table on an 18×24 in 2-up panel + 30 % automotive grade (PCB sheet)'),
     ('Assembly, test, coating (EMS price)', f"={convCell}", T['assembly'], 'Time × China rate-book rates + 10 % SG&A + 8 % profit (Assembly sheet)'),
     ('Rework, scrap (cost of quality)', f"={ref['fpyRework']}*({ref['reworkMin']}/60*{ref['techRate']}+({ref['ictSec']}+{ref['fctSec']})/3600*({ref['ict']}+{ref['techRate']}))+{ref['scrap']}*(B5+B6+B7+B8)", None, 'FPY 97 %, 0.3 % scrap'),
     ('Energy, packaging, cost of quality (tool)', None, T['other'], 'Tool only: energy, ESD pack, rework / scrap (manual carries these in assembly and the line above)'),
     ('One-off tooling and fixtures ÷ programme', f"={ref['nre']}/({ref['boards']}*{ref['years']})", None, '£31,400 over 60,000 boards (tool spreads its fixtures over the 10,000-board order inside assembly)'),
     ('Ex-works China', '=SUM(B5:B11)', T['exWorks'], 'Built, tested, packed at the factory gate'),
     ('Freight to the UK (sea)', f"=({ref['boardKg']}+{ref['packKg']})*{ref['seaKg']}", T['freight'], 'Board 0.552 kg (weighed) + 0.12 kg packaging × £0.40 / kg; the tool ships the board weight alone'),
     ('UK import duty', f"=(B12+B13)*{ref['duty']}", T['duty'], '3.7 % — the tool table\'s assumption, HS line not confirmed'),
     ('Delivered UK, duty paid', '=B12+B13+B14', T['delivered'], ''),
     ('Not in the unit cost: automotive programme NRE', f"={ref['autoNre']}", 15500, 'PPAP, FMEA, DV/PV, audit (tool figure), one-off; £0.26 a board if spread over 60,000')]
for r, (lab, f, t, basis) in enumerate(S, 5):
    wsS.cell(r, 1, lab); c = wsS.cell(r, 2, f); c.number_format = '£#,##0.00'
    c2 = wsS.cell(r, 3, t); c2.number_format = '£#,##0.00'
    if f is not None and t is not None: wsS.cell(r, 4, f"=C{r}-B{r}").number_format = '£#,##0.00'
    wsS.cell(r, 5, basis)
    if lab.startswith(('Ex-works', 'Delivered')):
        for cc in range(1, 5): wsS.cell(r, cc).font = BOLD
widths(wsS, [46, 13, 13, 15, 100])

# Reconciliation
wsR = wb.create_sheet('Reconciliation')
head(wsR, 1, ['RefDes / group', 'Description', 'Qty', 'Manual unit £', 'Manual line £', 'Tool unit £', 'Tool line £', 'Tool − manual £', 'Manual price basis', 'Tool price class'])
for i, r in enumerate(REC, 2):
    vals = [r['refDes'], r['description'], r['qty'], r['manualUnit'], r['manualLine'], r['toolUnit'], r['toolLine'], f"=G{i}-E{i}", f"{r['manualKind']}: {r['manualNote']}", r['toolClass']]
    for j, x in enumerate(vals, 1):
        c = wsR.cell(i, j, x)
        if j in (4, 6): c.number_format = '0.00000'
        if j in (5, 7, 8): c.number_format = '£#,##0.0000'
nR = len(REC) + 1
wsR.cell(nR + 1, 1, 'Total').font = BOLD
for j in (5, 7, 8): c = wsR.cell(nR + 1, j, f"=SUM({get_column_letter(j)}2:{get_column_letter(j)}{nR})"); c.number_format = '£#,##0.00'; c.font = BOLD
widths(wsR, [26, 50, 6, 11, 11, 11, 11, 12, 70, 44])

# Reading
wsE = wb.create_sheet('Reading')
head(wsE, 1, ['RefDes / group', 'Type', 'Description', 'Package', 'Qty', 'Evidence'])
for i, l in enumerate(reading['lines'], 2):
    for j, x in enumerate([l['refDes'], l['componentType'], l['description'], l['pkg'], l['qty'], l['basis']], 1): wsE.cell(i, j, x)
widths(wsE, [26, 16, 70, 22, 6, 70])
wb.save(os.path.join(OUT, 'manual-costing.xlsx'))
print(json.dumps({k: round(C[k], 2) for k in ('components', 'burdenGBP', 'fab', 'conversion', 'conversionOHP', 'quality', 'nrePerBoard', 'exWorks', 'freight', 'dutyGBP', 'delivered')}))
print('tool', T)

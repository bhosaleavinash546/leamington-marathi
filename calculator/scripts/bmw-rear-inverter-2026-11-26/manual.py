#!/usr/bin/env python3
"""Manual should-cost of the BMW rear-axle inverter control board (G6-CTRL REV007), built in China, 400,000 boards a year,
6-year programme (2,400,000 boards). The bill of materials is the user's (A2Mac1 teardown); the board spec is A2Mac1's
"PCB characteristics" (6 layers, 70/35/35/35/35/70 µm, tin, 1.6 mm, partial coating, both sides).

  components   each line × a sourced price (named part: distributor / China reel / catalogue; unnamed group: a named analogue of
               the same case), carried to the parts bought a year on P(Q) = P(break) × (Q / break)^−0.0706 —
               flat above 300,000 parts a year for ICs, discretes and magnetics; resistors and capacitors at the MILLIONS
               break (given: suppliers buy them in millions) — carried to 10,000,000 parts a year;
               + the EMS material burden (5 % at 100k+ boards);
  bare board   China automotive 4–6-layer ASP × 2026 rise × 6-v-5-layer shape + class-3 extras + 2 oz outer copper, on the area;
  assembly     JLCPCB per SMT joint (list), rate-book time for X-ray, coating, staking, test and programming + 10 % overhead;
  quality      3 % reworked, 0.3 % scrap; one-offs over the programme; delivered = sea freight + UK duty.
Prices of named parts are in research/line-sources.json (built by build-sources.py from the research files).
Writes manual.json and manual-costing.xlsx. Usage: python3 manual.py"""
import json, os, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

H = os.path.dirname(os.path.abspath(__file__))
rd = json.load(open(os.path.join(H, 'reading.json')))
SRC = json.load(open(os.path.join(H, 'research', 'line-sources.json')))['lines']   # refDes: {base, brk, kind, sources[], note}
SLOPE, FLAT, PASSIVE_Q = 0.0706, 300000, 10_000_000
BOARDS = 400000
PASSIVE = re.compile(r'^(Capacitor 3|Resistor 2|Resistor 3)')

# Every line is carried to the parts bought a year, capped at 10,000,000 (given for resistors and capacitors: suppliers buy
# them in millions; at 400,000 boards most other lines are bought in millions too). The CostVision catalogue rule holds prices
# flat above 300,000 a year — reported as a sensitivity (componentsFlat300k).
def at_volume(base, brk, pa, passive, cap=PASSIVE_Q):
    if brk is None or pa <= brk: return base
    return base * (min(pa, cap) / brk) ** -SLOPE
lines = []
for l in rd['lines']:
    s = SRC[l['refDes']]
    passive = bool(PASSIVE.match(l['refDes']))
    pa = l['qty'] * BOARDS
    u = round(at_volume(s['base'], s['brk'], pa, passive), 6)
    cap = PASSIVE_Q
    step = f"£{s['base']:.5f} at {s['brk']:,} → {min(pa, cap):,} parts a year = £{u:.5f}" if s['brk'] and pa > s['brk'] else ''
    lines.append(dict(refDes=l['refDes'], bomRow=l['bomRow'], manufacturer=l['manufacturer'], partNumber=l['partNumber'], description=l['description'],
                      pkg=l['pkg'], qty=l['qty'], padsEach=l['padsEach'], unitGBP=u, base=s['base'], brk=s['brk'], kind=s['kind'], sources=s['sources'],
                      basis='; '.join(x for x in [s.get('note', ''), step] if x), passive=passive, lineGBP=round(l['qty'] * u, 6),
                      cnFactor=s.get('cnFactor'), cnLow=s.get('cnLow'), cnHigh=s.get('cnHigh')))

I = {}
def inp(k, v, unit, cls, basis): I[k] = dict(v=v, unit=unit, cls=cls, basis=basis)
inp('boards', BOARDS, 'boards / year', 'given', 'Given: annual volume')
inp('years', 6, 'years', 'given', 'Given: programme life')
inp('w', 280, 'mm', 'reading', 'Measured off the top view: TC389 LFBGA-516 body (25 mm) as the scale, checked on the SOIC-8 CAN transceivers (±5 %)')
inp('h', 220, 'mm', 'reading', 'Measured off the top view (±5 %)')
inp('layers', 6, 'layers', 'given', 'A2Mac1 PCB characteristics: 6 layers')
inp('outerCuSteps', 4, '½ oz steps', 'given', 'Copper 70/35/35/35/35/70 µm: the two 2 oz outer layers are 2 steps of ½ oz above 1 oz each')
inp('heavyCuCny', 25, '¥ / m² / layer / ½ oz', 'market', 'Chinese fabricators\' heavy-copper adder (Queen EMS / AIVON 2026 copper-weight guides; CostVision HEAVY_CU_CNY_PER_M2_PER_HALF_OZ)')
inp('burden', 0.05, 'fraction', 'tool', 'EMS material burden at 100k+ boards (cost-plus EMS practice), the tool\'s stated rate')
inp('fx', 8.88, 'CNY per £', 'table', 'CostVision PCB country table, China (Sep 2026)')
inp('usd', 1.27, 'US$ per £', 'market', 'FX used for US$ prices')
inp('aspCny', 995.31, '¥ / m² sold', 'market', 'Chaoying (超颖) 4–6-layer board ASP 2024, prospectus p.1-1-229 (automotive is its main use) — https://pdf.dfcfw.com/pdf/H2_AN202503311649612309_1.pdf')
inp('aspRise', 0.145, 'fraction', 'market', 'Mid of the +12–17 % automotive PCB price rise to Q1 2026 (Sina, 17 Sep 2026)')
inp('base2L', 0.116, '£ / dm²', 'table', 'CostVision PCB country table, China: 2-layer base (layer shape only)')
inp('layerAdd', 0.07379, '£ / dm² / layer', 'table', 'CostVision PCB country table, China: per layer above 2 (layer shape only)')
inp('aspAnchor', 5, 'layers', 'market', 'The 4–6-layer ASP is a 4 / 6 mix: anchored at 5 layers')
inp('class3Cny', 105, '¥ / m²', 'market', 'PCBasic: 25 µm hole copper +¥25/m², 4-wire test +¥80/m² — https://www.pcbasic.com/standard_pcb.html')
inp('joints', rd['joints'], 'SMT joints', 'reading', 'Every SMD pad: 2 a two-terminal part, the package\'s pins for ICs (BGA 292 balls), from the BOM quantities')
inp('smtUsdJ', 0.0012, 'US$ / joint', 'market', 'JLCPCB Standard PCBA, > 100,000 joints an order: $0.0012 per SMT joint, paste and AOI inside (22 Oct 2026) — https://jlcpcb.com/help/article/pcb-assembly-price')
inp('thtJoints', 20, 'joints', 'reading', 'Through-hole parts: ACS37601 × 2 (4 leads), film capacitors × 4 (2 leads), PWR221T × 2 (2 leads)')
inp('thtUsdJ', 0.012, 'US$ / joint', 'market', 'JLCPCB through-hole (wave / selective) joint at its top tier — https://jlcpcb.com/help/article/pcb-assembly-price')
inp('lot', 33333, 'boards / lot', 'estimate', 'One lot a month (400,000 ÷ 12)')
inp('changeH', 1.0, 'h / side / lot', 'estimate', 'Line changeover per side per lot')
inp('smtHS', 77.1852, '£ / h', 'rate book', 'CostVision rate book, China: high-speed SMT line')
inp('opRate', 3.7523, '£ / h', 'rate book', 'CostVision rate book, China: electronics assembly operator, fully loaded')
inp('techRate', 4.4583, '£ / h', 'rate book', 'CostVision rate book, China: technician, fully loaded')
inp('xray', 45.8755, '£ / h', 'rate book', 'CostVision rate book, China: X-ray BGA inspection cell')
inp('ict', 54.9548, '£ / h', 'rate book', 'CostVision rate book, China: ICT bed-of-nails test system (also the functional-tester proxy)')
inp('progRate', 8, '£ / h', 'estimate', 'Programming station')
inp('xraySec', 15, 's', 'estimate', '100 % X-ray of the TC389 BGA (one device), in line')
inp('coatGBPperL', 372.63 / 5 / 1.27, '£ / litre', 'market', 'HumiSeal 1B31 acrylic, 5 L can (51313) US$372.63, Digi-Key, read 26 Nov 2026 — https://www.digikey.com/en/products/result?keywords=humiseal%201B31')
inp('coatDryUm', 50, 'µm dry film', 'estimate', 'IPC-CC-830 acrylic dry film 25–75 µm: mid')
inp('coatSolids', 0.26, 'fraction', 'estimate', 'Solids of a solvent-borne acrylic (1B31 data-sheet class, to confirm)')
inp('coaterSec', 30, 's', 'estimate', 'Selective coating robot, top side, ~430 cm² of component area')
inp('smtStd', 29.6453, '£ / h', 'rate book', 'CostVision rate book, China: SMT pick & place + reflow line, used as the selective-coating cell proxy')
inp('coatCm2', 431, 'cm²', 'estimate', 'Partial coating (A2Mac1): the top side\'s component areas, ≈ 70 % of 280 × 220 mm (UV photo shows the top coated)')
inp('uvSec', 15, 's', 'estimate', 'UV inspection of the coating')
inp('stakeDots', 24, 'dots', 'reading', 'Silicone staking seen on the 8 gate-drive transformers and the 4 film capacitors: 2 dots a part')
inp('stakeSec', 3, 's / dot', 'tool', 'CostVision staking rule: 3 s a dot (dispensing cell)')
inp('stakeG', 0.05, 'g / dot', 'tool', 'CostVision staking rule: 0.05 g silicone a dot')
inp('siliconeGBPg', 6967.56 / 19000 / 1.27, '£ / g', 'tool', 'DOWSIL 3-1953-type silicone, US$6,967.56 for 19 kg (CostVision staking rule)')
inp('ictSec', 40, 's', 'estimate', 'Bed-of-nails ICT (1,189 parts, test pads on both sides)')
inp('progSec', 60, 's', 'estimate', 'Flash the TC389 (up to 10 MB) and the safety configuration')
inp('fctSec', 90, 's', 'estimate', 'Board functional test incl. gate-driver supplies and isolation (hipot) of the six driver channels')
inp('finalSec', 20, 's', 'estimate', 'Final inspection and 2D-code read')
inp('depanelGBP', 0.0563, '£', 'market', 'Huaqiu 拆板费 ¥0.50 a board — https://smt.hqchip.com/online/valuation.html')
inp('packCny', 1 + 0.002 * 280 * 220 / 100, '¥', 'market', 'JLC ESD bag ¥1 + divider ¥0.002/cm² × 616 cm² — https://m.jlc.com/portal/server_guide_40512.html')
inp('unquotedOH', 0.10, 'fraction', 'estimate', 'Overhead on the rate-book operations (list prices carry the seller\'s margin)')
inp('fpyRework', 0.03, 'fraction', 'estimate', 'Boards reworked (FPY 97 %)')
inp('reworkMin', 15, 'min', 'estimate', 'Rework per failed board (technician; BGA board) + a re-test')
inp('scrap', 0.003, 'fraction', 'estimate', 'Boards scrapped')
inp('nre', 46000, '£ one-off', 'estimate', 'Stencils 2 × £300, ICT fixture £12,000, FCT / hipot fixture £25,000, coating program £1,500, staking program £1,000, programming set-up £1,500, X-ray program £1,000, bare-board E-test / route tooling £3,400')
inp('boardKg', 0.210, 'kg / board', 'estimate', 'Populated board: 6-layer 1.6 mm FR-4 280 × 220 mm net of the outline cut-outs ≈ 170 g + parts ≈ 40 g')
inp('packKg', 0.05, 'kg / board', 'estimate', 'Share of ESD bag + divider + carton')
inp('seaKg', 0.40, '£ / kg', 'table', 'CostVision PCB country table, China: sea freight')
inp('duty', 0.037, 'fraction', 'table', 'CostVision PCB country table, China → UK import duty (assumption, HS line not confirmed)')
v = {k: d['v'] for k, d in I.items()}

C = {}
C['programme'] = v['boards'] * v['years']
C['components'] = round(sum(l['lineGBP'] for l in lines), 6)
C['componentsNoChinaFactor'] = sum(l['lineGBP'] / (l['cnFactor'] or 1) for l in lines)
C['componentsChinaLow'] = sum(l['lineGBP'] * ((l['cnLow'] / l['cnFactor']) if l['cnFactor'] else 1) for l in lines)
C['componentsChinaHigh'] = sum(l['lineGBP'] * ((l['cnHigh'] / l['cnFactor']) if l['cnFactor'] else 1) for l in lines)
C['componentsFlat300k'] = sum(l['qty'] * at_volume(l['base'], l['brk'], l['qty'] * BOARDS, False, cap=FLAT) for l in lines)
C['burdenGBP'] = C['components'] * v['burden']
m2 = v['w'] * v['h'] / 1e6
C['aspShape'] = (v['base2L'] + v['layerAdd'] * (v['layers'] - 2)) / (v['base2L'] + v['layerAdd'] * (v['aspAnchor'] - 2))
C['boardCnyM2'] = v['aspCny'] * (1 + v['aspRise']) * C['aspShape'] + v['class3Cny'] + v['outerCuSteps'] * v['heavyCuCny']
C['fab'] = m2 * C['boardCnyM2'] / v['fx']
op, tech = v['opRate'], v['techRate']
A = {}
A['SMT assembly incl. paste, reflow and AOI (per joint, both sides)'] = ('listed', v['joints'] * v['smtUsdJ'] / v['usd'])
A['Through-hole soldering (20 joints)'] = ('listed', v['thtJoints'] * v['thtUsdJ'] / v['usd'])
A['Line changeover (2 sides, per lot)'] = ('rate', 2 * v['changeH'] * (v['smtHS'] + 2 * op) / v['lot'])
A['X-ray of the BGA'] = ('rate', v['xraySec'] / 3600 * (v['xray'] + op))
A['Conformal coating, selective (top side): material'] = ('rate', v['coatCm2'] * v['coatDryUm'] / 1e4 / v['coatSolids'] / 1000 * v['coatGBPperL'])
A['Conformal coating, selective (top side): coater'] = ('rate', v['coaterSec'] / 3600 * (v['smtStd'] + op))
A['Coating UV inspection'] = ('rate', v['uvSec'] / 3600 * op)
A['Silicone staking (transformers, film capacitors)'] = ('rate', v['stakeDots'] * (v['stakeSec'] / 3600 * op + v['stakeG'] * v['siliconeGBPg']))
A['ICT'] = ('station', v['ictSec'] / 3600 * v['ict'])
A['MCU programming'] = ('rate', v['progSec'] / 3600 * (v['progRate'] + op))
A['Functional and isolation test'] = ('station', v['fctSec'] / 3600 * v['ict'])
A['Depanel'] = ('listed', v['depanelGBP'])
A['Final inspection'] = ('rate', v['finalSec'] / 3600 * op)
A['Packaging (ESD bag + divider)'] = ('listed', v['packCny'] / v['fx'])
C['assemblyItems'] = {k: x for k, (_, x) in A.items()}
C['listedGBP'] = sum(x for t, x in A.values() if t == 'listed')
C['rateGBP'] = sum(x for t, x in A.values() if t == 'rate')
C['stationGBP'] = sum(x for t, x in A.values() if t == 'station')   # rate-book test stations: their build-up already holds operator and overhead
C['ohGBP'] = C['rateGBP'] * v['unquotedOH']
C['assembly'] = C['listedGBP'] + C['rateGBP'] + C['stationGBP'] + C['ohGBP']
C['rework'] = v['fpyRework'] * (v['reworkMin'] / 60 * tech + (v['ictSec'] + v['fctSec']) / 3600 * (v['ict'] + tech))
C['scrapGBP'] = v['scrap'] * (C['components'] + C['burdenGBP'] + C['fab'] + C['assembly'])
C['quality'] = C['rework'] + C['scrapGBP']
C['nrePerBoard'] = v['nre'] / C['programme']
C['exWorks'] = C['components'] + C['burdenGBP'] + C['fab'] + C['assembly'] + C['quality'] + C['nrePerBoard']
C['freight'] = (v['boardKg'] + v['packKg']) * v['seaKg']
C['dutyGBP'] = (C['exWorks'] + C['freight']) * v['duty']
C['delivered'] = C['exWorks'] + C['freight'] + C['dutyGBP']
json.dump(dict(inputs=I, lines=lines, C=C, generated='26 Nov 2026'), open(os.path.join(H, 'manual.json'), 'w'), indent=1, ensure_ascii=False)

# ── Workbook (live formulas)
wb = Workbook(); hdr = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='1F4E5A')
def head(ws, cols, widths):
    for i, c in enumerate(cols, 1):
        x = ws.cell(1, i, c); x.font = hdr; x.fill = fill; x.alignment = Alignment(wrap_text=True, vertical='center')
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
wsI = wb.active; wsI.title = 'Inputs'; head(wsI, ['Key', 'Value', 'Unit', 'Class', 'Basis'], [14, 12, 18, 11, 120])
ref = {}
for r, (k, d) in enumerate(I.items(), 2):
    for j, x in enumerate([k, d['v'], d['unit'], d['cls'], d['basis']], 1): wsI.cell(r, j, x)
    ref[k] = f'Inputs!$B${r}'
wsB = wb.create_sheet('BOM'); head(wsB, ['BOM row', 'Manufacturer', 'Part number', 'Description', 'Package', 'Qty', 'Unit £ at volume', 'Line £', 'Price kind', 'Part priced', 'Seller · price quoted · date', 'Volume step / note', 'Source page'],
                                     [22, 16, 24, 50, 16, 6, 12, 10, 14, 34, 44, 60, 60])
for r, l in enumerate(lines, 2):
    srcs = l['sources']
    part = ' + '.join(f"{x['maker']} {x['mpn']} ({x['grade']})" for x in srcs) or 'class price'
    quote = ' ; '.join(f"{x['seller']}: {x['quote']}, {x['date']}" for x in srcs)
    for j, x in enumerate([l['bomRow'], l['manufacturer'], l['partNumber'], l['description'], l['pkg'], l['qty'], l['unitGBP'], f'=F{r}*G{r}', l['kind'], part, quote, l['basis'], ' ; '.join(y['url'] for y in srcs)], 1):
        wsB.cell(r, j, x)
    if srcs: wsB.cell(r, 13).hyperlink = srcs[0]['url']; wsB.cell(r, 13).font = Font(color='0563C1', underline='single')
nB = len(lines) + 1
wsB.cell(nB + 1, 4, 'Components a board').font = Font(bold=True); wsB.cell(nB + 1, 8, f'=SUM(H2:H{nB})').font = Font(bold=True)
COMP = f'BOM!$H${nB + 1}'
wsA = wb.create_sheet('Assembly'); head(wsA, ['Operation', '£ a board', 'Kind', 'Formula'], [58, 12, 10, 100])
AF = [
 ('SMT assembly incl. paste, reflow and AOI (per joint, both sides)', f"={ref['joints']}*{ref['smtUsdJ']}/{ref['usd']}", 'listed'),
 ('Through-hole soldering (20 joints)', f"={ref['thtJoints']}*{ref['thtUsdJ']}/{ref['usd']}", 'listed'),
 ('Line changeover (2 sides, per lot)', f"=2*{ref['changeH']}*({ref['smtHS']}+2*{ref['opRate']})/{ref['lot']}", 'rate'),
 ('X-ray of the BGA', f"={ref['xraySec']}/3600*({ref['xray']}+{ref['opRate']})", 'rate'),
 ('Conformal coating, selective (top side): material', f"={ref['coatCm2']}*{ref['coatDryUm']}/10000/{ref['coatSolids']}/1000*{ref['coatGBPperL']}", 'rate'),
 ('Conformal coating, selective (top side): coater', f"={ref['coaterSec']}/3600*({ref['smtStd']}+{ref['opRate']})", 'rate'),
 ('Coating UV inspection', f"={ref['uvSec']}/3600*{ref['opRate']}", 'rate'),
 ('Silicone staking (transformers, film capacitors)', f"={ref['stakeDots']}*({ref['stakeSec']}/3600*{ref['opRate']}+{ref['stakeG']}*{ref['siliconeGBPg']})", 'rate'),
 ('ICT', f"={ref['ictSec']}/3600*{ref['ict']}", 'station'),
 ('MCU programming', f"={ref['progSec']}/3600*({ref['progRate']}+{ref['opRate']})", 'rate'),
 ('Functional and isolation test', f"={ref['fctSec']}/3600*{ref['ict']}", 'station'),
 ('Depanel', f"={ref['depanelGBP']}", 'listed'),
 ('Final inspection', f"={ref['finalSec']}/3600*{ref['opRate']}", 'rate'),
 ('Packaging (ESD bag + divider)', f"={ref['packCny']}/{ref['fx']}", 'listed')]
for r, (lab, f, k) in enumerate(AF, 2):
    wsA.cell(r, 1, lab); wsA.cell(r, 2, f); wsA.cell(r, 3, k); wsA.cell(r, 4, f[1:])
n = len(AF) + 1
rateCells = '+'.join(f'B{r}' for r, (_, _, k) in enumerate(AF, 2) if k == 'rate')
wsA.cell(n + 1, 1, 'Overhead on the rate-book operations'); wsA.cell(n + 1, 2, f"=({rateCells})*{ref['unquotedOH']}")
wsA.cell(n + 2, 1, 'Assembly, test, coating a board').font = Font(bold=True); wsA.cell(n + 2, 2, f'=SUM(B2:B{n + 1})').font = Font(bold=True)
ASMC = f'Assembly!$B${n + 2}'
wsS = wb.create_sheet('Summary', 0); head(wsS, ['Element', '£ a board', 'Basis'], [46, 12, 110])
S = [
 ('Components (as the EMS buys them)', f'={COMP}', 'BOM sheet: each line × a sourced price at volume'),
 ('EMS material burden', f"={COMP}*{ref['burden']}", '5 % at 100k+ boards'),
 ('Bare board (6 layers, 2 oz outer, 280 × 220 mm)', f"={ref['w']}*{ref['h']}/1000000*({ref['aspCny']}*(1+{ref['aspRise']})*(({ref['base2L']}+{ref['layerAdd']}*({ref['layers']}-2))/({ref['base2L']}+{ref['layerAdd']}*({ref['aspAnchor']}-2)))+{ref['class3Cny']}+{ref['outerCuSteps']}*{ref['heavyCuCny']})/{ref['fx']}",
  'China automotive 4–6-layer ASP × 2026 rise × 6-v-5-layer shape + class-3 extras + 2 oz outer copper, on the board area'),
 ('Assembly, test and coating', f'={ASMC}', 'Assembly sheet'),
 ('Cost of quality (rework + scrap)', f"={ref['fpyRework']}*({ref['reworkMin']}/60*{ref['techRate']}+({ref['ictSec']}+{ref['fctSec']})/3600*({ref['ict']}+{ref['techRate']}))+{ref['scrap']}*(B2+B3+B4+B5)", '3 % reworked, 0.3 % scrapped'),
 ('One-off tooling and fixtures ÷ programme', f"={ref['nre']}/({ref['boards']}*{ref['years']})", '£46,000 over 2,400,000 boards'),
 ('Ex-works (China factory gate)', '=SUM(B2:B7)', 'Built, tested, coated and packed'),
 ('Sea freight to the UK', f"=({ref['boardKg']}+{ref['packKg']})*{ref['seaKg']}", 'Board + packaging share × £/kg'),
 ('UK import duty', f"=(B8+B9)*{ref['duty']}", '3.7 % on ex-works + freight (assumption)'),
 ('Delivered UK, duty paid', '=B8+B9+B10', '')]
for r, (lab, f, b) in enumerate(S, 2):
    wsS.cell(r, 1, lab); wsS.cell(r, 2, f).number_format = '£0.0000'; wsS.cell(r, 3, b)
    if lab.startswith(('Ex-works', 'Delivered')): wsS.cell(r, 1).font = wsS.cell(r, 2).font = Font(bold=True)
wb.save(os.path.join(H, 'manual-costing.xlsx'))
print(f"joints {v['joints']}  components £{C['components']:.4f}  burden £{C['burdenGBP']:.4f}  board £{C['fab']:.4f}  assembly £{C['assembly']:.4f}  quality £{C['quality']:.4f}  nre £{C['nrePerBoard']:.4f}")
print(f"EX-WORKS £{C['exWorks']:.4f}  freight £{C['freight']:.4f}  duty £{C['dutyGBP']:.4f}  DELIVERED £{C['delivered']:.4f}")

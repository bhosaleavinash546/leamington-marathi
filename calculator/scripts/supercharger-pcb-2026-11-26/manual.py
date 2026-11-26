#!/usr/bin/env python3
"""Manual should-cost of the supercharger control board (Valeo B112235-B), built in China, 100,000 boards a year, 6-year
programme (600,000 boards), 120 x 100 mm, conformal coating on the component areas of both sides.

A hand build-up independent of the tool's cost model. The same method as the EDU board's final should-cost:
  components   each line x a sourced price at volume (China distributor own-stock reel, ex-VAT, or a distributor price for
               the named part / its analogue — research/parts.json), + the EMS material burden (5 % at 100k+ boards);
  bare board   the China automotive 4–6-layer ASP (Chaoying filing, 2024) x the 2026 rise x the 4-v-5-layer shape + class-3
               extras, on the board area;
  assembly     listed Chinese prices where one exists (JLCPCB per SMT joint, Huaqiu depanel, JLC ESD packaging); every other
               operation = time x the CostVision China rate book + 10 % overhead; the line changeover per lot;
  quality      3 % of boards reworked (FPY 97 %) + 0.3 % scrapped;
  one-offs     stencils, fixtures and programs over the programme;
  delivered    sea freight + UK import duty (the tool's table, HS line not confirmed).
Writes manual.json and manual-costing.xlsx (live formulas). Usage: python3 manual.py [<tool reprice / summary dir>]"""
import json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

H = os.path.dirname(os.path.abspath(__file__))
rd = json.load(open(os.path.join(H, 'reading.json')))
RES = json.load(open(os.path.join(H, 'research', 'line-prices.json')))   # build-line-prices.py, from research/parts.json

# ── Line prices (£ a part at volume). Each line: a sourced BASE price at a stated BREAK quantity, carried to the parts bought a
# year (qty a board × 100,000) on the CostVision catalogue franchise curve P(Q) = P(break) × (Q / break)^−0.0706, flat above
# 300,000 parts (the tool's own rule) — `brk=None` = already at the parts-a-year break (catalogue q100k / q200k / q300k).
SZ = 'szlcsc own stock, whole reel, ex-VAT, read 25 Nov 2026'
CAT = 'CostVision component catalogue (distributor, sourced)'
SLOPE, FLAT = 0.0706, 300000
P = {   # refDes: (base £, break qty or None, kind, basis, url)
 'R 0603 group': (0.00075, 5000, 'china-reel', f'AC0603FR-0710KL YAGEO — {SZ}', 'https://item.szlcsc.com/117931.html'),
 'R 0805 group': (0.00185, 5000, 'china-reel', f'AC0805FR-0710KL YAGEO — {SZ}', 'https://item.szlcsc.com/152196.html'),
 'R 1206 group': (0.00484, 5000, 'china-reel', f'AC1206FR-0710KL YAGEO — {SZ}', 'https://item.szlcsc.com/155852.html'),
 'R 2512 group': (0.06194, 4000, 'china-reel', f'AC2512FK-0710RL YAGEO — {SZ}', 'https://item.szlcsc.com/476216.html'),
 'C 0603 group': (0.00287, 4000, 'china-reel', f'GCM188R71H104KA57D Murata 100 nF 50 V X7R — {SZ}', 'https://item.szlcsc.com/87040.html'),
 'C 0805 group': ((0.0152 + 0.0214) / 2, None, 'mix', f'value mix (judgement: half 100 nF, half 1 µF): KAM21BR71H104KT 100 nF 50 V X7R AEC-Q200 £0.0152 at 300k ({CAT}) and GCM21BR71H105KA03L 1 µF 50 V £0.0214 at 500k a year (distributor, 6 Oct 2026)', ''),
 'C 1206 group': ((0.0197 + 0.06766 * (FLAT / 2000) ** -SLOPE) / 2, None, 'mix', f'value mix (judgement: half 100 nF, half 4.7 µF): C1206C104K5RACAUTO 100 nF 50 V AEC-Q200 £0.0197 at 300k ({CAT}) and CGA5L1X7R1H475KT0Y0N TDK 4.7 µF 50 V £0.06766 at a 2,000 reel ({SZ}) carried to 300k = £{0.06766 * (FLAT / 2000) ** -SLOPE:.4f}', 'https://item.szlcsc.com/370048.html'),
 'C 1210 group': (0.09857, 1000, 'china-reel', f'GCM32EC71H106KA03L Murata 10 µF 50 V X7S (bulk) — {SZ}', 'https://item.szlcsc.com/137892.html'),
 'Q small-signal group': (0.00445, 3000, 'china-reel', f'mean of 2N7002,215 and BC847C,215 Nexperia — {SZ}', 'https://item.szlcsc.com/66260.html'),
 'D small-signal group': (0.00329, 3000, 'china-reel', f'BAV99,215 Nexperia — {SZ}', 'https://item.szlcsc.com/2877.html'),
 'Zener group': (0.00531, 3000, 'china-reel', f'BZT52C5V1Q (AEC-Q101) — {SZ} (the Diodes -7-F listing £0.0188 is dearer)', ''),
 'D rectifier group': (0.0645, None, 'catalogue', f'STPS2H100AY ST 100 V 2 A Schottky, SMA, AEC-Q101 — £0.0645 at 300k ({CAT})', ''),
 'TVS SMB group': (0.04339, 3000, 'china-reel', f'SMBJ24CA Littelfuse 600 W SMB (a 58 V part of the same family is the same price class) — {SZ}', 'https://item.szlcsc.com/84432.html'),
 'U3': (0.11322, 2500, 'china-reel', f'LM2904BQDRQ1 TI dual op-amp AEC-Q100 (analogue: de-marked SO-8; the MCU has its own CAN physical layer) — {SZ}', 'https://item.szlcsc.com/1946598.html'),
 'U4, U5': (0.11322, 2500, 'china-reel', f'LM2904BQDRQ1 TI dual op-amp AEC-Q100 (analogue) — {SZ}', 'https://item.szlcsc.com/1946598.html'),
 'U6': (0.119, None, 'class-point', 'MSOP-10 signal IC, not identified: CostVision class range "op-amp / comparator" at this volume, lower-half midpoint', ''),
 'U2': (0.7679, None, 'catalogue', f'de-marked SO-16 beside T1 (transformer / gate-drive supply driver). Analogue UCC21222QDRQ1 TI dual-channel isolated gate driver, SOIC-16, AEC-Q100 — £0.7679 at 100k ({CAT})', ''),
 'U7, U8': (0.3013, None, 'catalogue', f'de-marked SOT-223 regulator. Analogue L5150BNTR ST 40 V 150 mA LDO, AEC-Q100 — £0.3013 at 200k ({CAT})', ''),
 'Q1': (0.2984, None, 'catalogue', f'de-marked 5×5 power MOSFET. Analogue SQJ844AEP Vishay automotive MOSFET, PowerPAK SO-8L — £0.2984 at 100k ({CAT})', ''),
 'L1': (0.15148, 1000, 'china-reel', f'CLF6045NIT-4R7N-D TDK 6×6 shielded, AEC-Q200 (analogue) — {SZ}', 'https://item.szlcsc.com/335482.html'),
 'L2': (0.07649, 500, 'china-reel', f'DLW43SH510XK2L Murata CAN CMC (analogue) — {SZ}', 'https://item.szlcsc.com/92784.html'),
 'Y1': (0.0702, None, 'catalogue', f'NX3225GA-25.000M NDK automotive crystal, AEC-Q200 — £0.0702 at 100k ({CAT})', ''),
 'C bulk 100 uF': (0.103, None, 'catalogue', f'aluminium electrolytic (marking "hJ 100 VHJ" not decoded). Analogue UCM1V101MCL1GS Nichicon 100 µF 35 V, 6.3 × 5.8 mm, AEC-Q200 — £0.1030 at 100k ({CAT})', ''),
 'C bulk 22 uF pair': (0.0662, None, 'catalogue', f'aluminium electrolytic (marking "22 JZC 6X6" not decoded). Analogue EEE-FK Panasonic FK, 6.3 mm can, AEC-Q200 (10 µF 50 V listing) — £0.0662 at 200k ({CAT})', ''),
 'T1': (1.36, None, 'class-point', 'TDK/EPCOS customer transformer (ordering code B78xxxA2363A003 not listed): CostVision class range "signal transformer, AEC-Q" at this volume, lower-half midpoint. Range £1.02 (TDK EP6 automotive SMD transformer B78416A2360A003, US$1.80 at 1k, unverified, carried to 100k) to £2.69 (TDK E10 EM B78307A2338A003, €4.24 at 1,960, carried to 100k)', ''),
 'U1': (3.55, None, 'given', 'given', ''),
}
# the engineer's given figures (research/line-prices.json, kind "given")
for ref, r in RES.get('lines', {}).items():
    if r.get('kind') == 'given':
        P[ref] = (float(r['unitGBP']), None, 'given', r['basis'], r.get('url', ''))

def at_volume(base, brk, parts_a_year):
    if brk is None: return base
    return base * (min(parts_a_year, FLAT) / brk) ** -SLOPE if parts_a_year > brk else base
lines = []
for l in rd['lines']:
    base, brk, kind, basis, url = P[l['refDes']]
    pa = l['qty'] * 100000
    u = at_volume(base, brk, pa)
    if brk: basis += f' — £{base:.5f} at {brk:,}, carried to {min(pa, FLAT):,} parts a year: £{u:.5f}'
    lines.append(dict(refDes=l['refDes'], description=l['description'], pkg=l['pkg'], qty=l['qty'], qtyLow=l['qtyLow'], qtyHigh=l['qtyHigh'],
                      countMethod=l['countMethod'], unitGBP=round(u, 6), base=base, brk=brk, kind=kind, basis=basis, url=url, lineGBP=round(l['qty'] * round(u, 6), 6)))

# ── Inputs
I = {}
def inp(k, v, unit, cls, basis): I[k] = dict(v=v, unit=unit, cls=cls, basis=basis)
inp('boards', 100000, 'boards / year', 'given', 'Given: annual volume')
inp('years', 6, 'years', 'given', 'Given: programme life')
inp('w', 120, 'mm', 'given', 'Given: board width')
inp('h', 100, 'mm', 'given', 'Given: board height')
inp('layers', 4, 'layers', 'estimate', 'Estimate: a single-MCU logic board, both sides populated, many vias; not visible in a photo')
inp('burden', 0.05, 'fraction', 'tool', 'EMS material burden at 100k+ boards (cost-plus EMS practice: 10 % at 1k, 7 % at 10k, 5 % at 100k+), the tool\'s stated rate')
inp('fx', 8.88, 'CNY per £', 'table', 'CostVision PCB country table, China (Sep 2026)')
inp('usd', 1.27, 'US$ per £', 'market', 'FX used for US$ list prices')
inp('aspCny', 995.31, '¥ / m² sold', 'market', 'Chaoying (超颖) 4–6-layer board ASP 2024, prospectus p.1-1-229 (automotive is its main use) — https://pdf.dfcfw.com/pdf/H2_AN202503311649612309_1.pdf')
inp('aspRise', 0.145, 'fraction', 'market', 'Mid of the +12–17 % automotive PCB price rise to Q1 2026 (Sina, 17 Sep 2026)')
inp('base2L', 0.116, '£ / dm²', 'table', 'CostVision PCB country table, China: 2-layer base (used only for the layer shape)')
inp('layerAdd', 0.07379, '£ / dm² / layer', 'table', 'CostVision PCB country table, China: per layer above 2 (layer shape)')
inp('aspAnchor', 5, 'layers', 'market', 'The 4–6-layer ASP is a 4 / 6 mix: anchored at 5 layers')
inp('class3Cny', 105, '¥ / m²', 'market', 'PCBasic: 25 µm hole copper +¥25/m², 4-wire test +¥80/m² — https://www.pcbasic.com/standard_pcb.html')
inp('joints', 0, 'SMT joints', 'reading', 'Reading: every SMD pad (2 a two-terminal part, IC pins) — the unit the Chinese price lists use')
inp('smtUsdJ', 0.0012, 'US$ / joint', 'market', 'JLCPCB Standard PCBA, > 100,000 joints an order: $0.0012 per SMT joint, paste and AOI inside (page 22 Oct 2026) — https://jlcpcb.com/help/article/pcb-assembly-price')
inp('lot', 8333, 'boards / lot', 'estimate', 'Estimate: one lot a month (100,000 ÷ 12)')
inp('changeH', 1.0, 'h / side / lot', 'estimate', 'Estimate: line changeover per side per lot (feeder kit pre-set off line)')
inp('smtHS', 77.1852, '£ / h', 'rate book', 'CostVision rate book, China: high-speed SMT line')
inp('opRate', 3.7523, '£ / h', 'rate book', 'CostVision rate book, China: electronics assembly operator, fully loaded')
inp('techRate', 4.4583, '£ / h', 'rate book', 'CostVision rate book, China: technician, fully loaded')
inp('ict', 54.9548, '£ / h', 'rate book', 'CostVision rate book, China: ICT bed-of-nails test system (also the functional-tester proxy)')
inp('progRate', 8, '£ / h', 'estimate', 'Estimate: programming station')
inp('coatRate', 0.002635, '£ / cm²', 'table', 'CostVision PCB country table, China: conformal coating (material + machine)')
inp('coatCm2', 63, 'cm² / side', 'estimate', 'Reading: board net of the shaft opening and window ≈ 90 cm²; the component areas ≈ 70 % of it (given: coating on the component areas)')
inp('coatSides', 2, 'sides', 'reading', 'Reading: coating visible on the component areas of both sides')
inp('uvSec', 15, 's', 'estimate', 'Estimate: UV inspection of the coating (selective robot coating — no masking; the program skips pads and pin holes)')
inp('ictSec', 25, 's', 'estimate', 'Estimate: bed-of-nails ICT on the bottom test pads (322 parts)')
inp('progSec', 30, 's', 'estimate', 'Estimate: flash the MCU (one device)')
inp('fctSec', 45, 's', 'estimate', 'Estimate: board functional test (supplies, CAN, sense channels, gate-drive supply)')
inp('finalSec', 20, 's', 'estimate', 'Estimate: final visual inspection and 2D-code read')
inp('depanelGBP', 0.0563, '£', 'market', 'Huaqiu 拆板费 ¥0.50 a board — https://smt.hqchip.com/online/valuation.html')
inp('packCny', 1.24, '¥', 'market', 'JLC ESD bag ¥1 + divider ¥0.002/cm² × 120 cm² — https://m.jlc.com/portal/server_guide_40512.html')
inp('unquotedOH', 0.10, 'fraction', 'estimate', 'Overhead on the rate-book operations (list prices carry the seller\'s margin; none is added on them)')
inp('fpyRework', 0.03, 'fraction', 'estimate', 'Boards reworked (FPY 97 %)')
inp('reworkMin', 10, 'min', 'estimate', 'Rework per failed board (technician) + a re-test')
inp('scrap', 0.003, 'fraction', 'estimate', 'Boards scrapped')
inp('nre', 15400, '£ one-off', 'estimate', 'Stencils 2 × £150, ICT fixture £5,000, FCT fixture £8,000, coating program £800, programming set-up £500, bare-board E-test / route tooling £800')
inp('boardKg', 0.040, 'kg / board', 'given', 'Given in the form: 40 g populated (estimate — board 1.6 mm FR-4 net of the cut-outs ≈ 28 g + parts)')
inp('packKg', 0.03, 'kg / board', 'estimate', 'Share of ESD bag + divider + carton')
inp('seaKg', 0.40, '£ / kg', 'table', 'CostVision PCB country table, China: sea freight')
inp('duty', 0.037, 'fraction', 'table', 'CostVision PCB country table, China → UK: import duty (assumption, HS line not confirmed)')

PADS = {'ic': None}
def pads(l):
    p = l['pkg'].upper()
    import re
    m = re.search(r'(?:LQFP|SO|MSOP|SSOP|TSSOP)-(\d+)', p)
    if m: return int(m.group(1)) + (1 if ' EP' in p else 0)
    if 'SOT-223' in p: return 4
    if 'SOT-23' in p: return 3
    if 'LFPAK' in p: return 5
    if '10-PIN' in p: return 10
    if l['refDes'] == 'L2': return 4
    if l['refDes'] == 'Y1': return 4
    return 2
I['joints']['v'] = sum(l['qty'] * pads(l) for l in rd['lines'])
v = {k: d['v'] for k, d in I.items()}

C = {}
C['programme'] = v['boards'] * v['years']
C['components'] = round(sum(l['lineGBP'] for l in lines), 6)
C['burdenGBP'] = C['components'] * v['burden']
m2 = v['w'] * v['h'] / 1e6
C['aspShape'] = (v['base2L'] + v['layerAdd'] * (v['layers'] - 2)) / (v['base2L'] + v['layerAdd'] * (v['aspAnchor'] - 2))
C['boardCnyM2'] = v['aspCny'] * (1 + v['aspRise']) * C['aspShape'] + v['class3Cny']
C['fab'] = m2 * C['boardCnyM2'] / v['fx']
op, tech = v['opRate'], v['techRate']
A = {}
A['SMT assembly incl. paste, reflow and AOI (per joint, both sides)'] = ('listed', v['joints'] * v['smtUsdJ'] / v['usd'])
A['Line changeover (2 sides, per lot)'] = ('rate', 2 * v['changeH'] * (v['smtHS'] + 2 * op) / v['lot'])
A['Conformal coating, selective (component areas, 2 sides)'] = ('rate', v['coatSides'] * v['coatCm2'] * v['coatRate'])
A['Coating UV inspection'] = ('rate', v['uvSec'] / 3600 * op)
A['ICT'] = ('rate', v['ictSec'] / 3600 * (v['ict'] + op))
A['MCU programming'] = ('rate', v['progSec'] / 3600 * (v['progRate'] + op))
A['Functional test'] = ('rate', v['fctSec'] / 3600 * (v['ict'] + tech))
A['Depanel'] = ('listed', v['depanelGBP'])
A['Final inspection'] = ('rate', v['finalSec'] / 3600 * op)
A['Packaging (ESD bag + divider)'] = ('listed', v['packCny'] / v['fx'])
C['assemblyItems'] = {k: x for k, (_, x) in A.items()}
C['listedGBP'] = sum(x for k, (t, x) in A.items() if t == 'listed')
C['rateGBP'] = sum(x for k, (t, x) in A.items() if t == 'rate')
C['ohGBP'] = C['rateGBP'] * v['unquotedOH']
C['assembly'] = C['listedGBP'] + C['rateGBP'] + C['ohGBP']
C['rework'] = v['fpyRework'] * (v['reworkMin'] / 60 * tech + (v['ictSec'] + v['fctSec']) / 3600 * (v['ict'] + tech))
C['scrapGBP'] = v['scrap'] * (C['components'] + C['burdenGBP'] + C['fab'] + C['assembly'])
C['quality'] = C['rework'] + C['scrapGBP']
C['nrePerBoard'] = v['nre'] / C['programme']
C['exWorks'] = C['components'] + C['burdenGBP'] + C['fab'] + C['assembly'] + C['quality'] + C['nrePerBoard']
C['freight'] = (v['boardKg'] + v['packKg']) * v['seaKg']
C['dutyGBP'] = (C['exWorks'] + C['freight']) * v['duty']
C['delivered'] = C['exWorks'] + C['freight'] + C['dutyGBP']
# quantity band: the passives' counted range (low / high) at the same prices
for side in ('Low', 'High'):
    comp = sum(l['qty' + side] * l['unitGBP'] for l in lines)
    C['components' + side] = comp
out = dict(inputs=I, lines=lines, C=C, generated='26 Nov 2026')
json.dump(out, open(os.path.join(H, 'manual.json'), 'w'), indent=1, ensure_ascii=False)

# ── Workbook with live formulas
wb = Workbook(); hdr = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='1F4E5A')
def head(ws, cols, widths):
    for i, c in enumerate(cols, 1):
        x = ws.cell(1, i, c); x.font = hdr; x.fill = fill; x.alignment = Alignment(wrap_text=True, vertical='center')
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
wsI = wb.active; wsI.title = 'Inputs'; head(wsI, ['Key', 'Value', 'Unit', 'Class', 'Basis'], [14, 12, 16, 11, 120])
ref = {}
for r, (k, d) in enumerate(I.items(), 2):
    for j, x in enumerate([k, d['v'], d['unit'], d['cls'], d['basis']], 1): wsI.cell(r, j, x)
    ref[k] = f'Inputs!$B${r}'
wsB = wb.create_sheet('BOM'); head(wsB, ['RefDes', 'Description', 'Package', 'Qty', 'Qty low', 'Qty high', 'Count', 'Unit £', 'Line £', 'Price kind', 'Price basis', 'URL'],
                                     [20, 60, 18, 7, 8, 8, 10, 10, 10, 12, 80, 40])
for r, l in enumerate(lines, 2):
    for j, x in enumerate([l['refDes'], l['description'], l['pkg'], l['qty'], l['qtyLow'], l['qtyHigh'], l['countMethod'], l['unitGBP'], f'=D{r}*H{r}', l['kind'], l['basis'], l['url']], 1):
        wsB.cell(r, j, x)
nB = len(lines) + 1
wsB.cell(nB + 1, 2, 'Components a board').font = Font(bold=True); wsB.cell(nB + 1, 9, f'=SUM(I2:I{nB})').font = Font(bold=True)
COMP = f'BOM!$I${nB + 1}'
wsA = wb.create_sheet('Assembly'); head(wsA, ['Operation', '£ a board', 'Kind', 'Formula'], [58, 12, 10, 90])
AF = [
 ('SMT assembly incl. paste, reflow and AOI (per joint, both sides)', f"={ref['joints']}*{ref['smtUsdJ']}/{ref['usd']}", 'listed'),
 ('Line changeover (2 sides, per lot)', f"=2*{ref['changeH']}*({ref['smtHS']}+2*{ref['opRate']})/{ref['lot']}", 'rate'),
 ('Conformal coating, selective (component areas, 2 sides)', f"={ref['coatSides']}*{ref['coatCm2']}*{ref['coatRate']}", 'rate'),
 ('Coating UV inspection', f"={ref['uvSec']}/3600*{ref['opRate']}", 'rate'),
 ('ICT', f"={ref['ictSec']}/3600*({ref['ict']}+{ref['opRate']})", 'rate'),
 ('MCU programming', f"={ref['progSec']}/3600*({ref['progRate']}+{ref['opRate']})", 'rate'),
 ('Functional test', f"={ref['fctSec']}/3600*({ref['ict']}+{ref['techRate']})", 'rate'),
 ('Depanel', f"={ref['depanelGBP']}", 'listed'),
 ('Final inspection', f"={ref['finalSec']}/3600*{ref['opRate']}", 'rate'),
 ('Packaging (ESD bag + divider)', f"={ref['packCny']}/{ref['fx']}", 'listed')]
for r, (lab, f, k) in enumerate(AF, 2):
    wsA.cell(r, 1, lab); wsA.cell(r, 2, f); wsA.cell(r, 3, k); wsA.cell(r, 4, f[1:])
n = len(AF) + 1
rateCells = '+'.join(f'B{r}' for r, (_, _, k) in enumerate(AF, 2) if k == 'rate')
wsA.cell(n + 1, 1, 'Overhead on the rate-book operations'); wsA.cell(n + 1, 2, f"=({rateCells})*{ref['unquotedOH']}")
wsA.cell(n + 2, 1, 'Assembly, test, coating a board').font = Font(bold=True); wsA.cell(n + 2, 2, f'=SUM(B2:B{n + 1})').font = Font(bold=True)
ASM = f'Assembly!$B${n + 2}'
wsS = wb.create_sheet('Summary', 0); head(wsS, ['Element', '£ a board', 'Basis'], [46, 12, 110])
S = [
 ('Components (as the EMS buys them)', f'={COMP}', 'BOM sheet: each line × a sourced price at volume'),
 ('EMS material burden', f"={COMP}*{ref['burden']}", '5 % at 100k+ boards'),
 ('Bare board (4 layers, ENIG, 120 × 100 mm)', f"={ref['w']}*{ref['h']}/1000000*({ref['aspCny']}*(1+{ref['aspRise']})*(({ref['base2L']}+{ref['layerAdd']}*({ref['layers']}-2))/({ref['base2L']}+{ref['layerAdd']}*({ref['aspAnchor']}-2)))+{ref['class3Cny']})/{ref['fx']}",
  'China automotive 4–6-layer ASP × 2026 rise × 4-v-5-layer shape + class-3 extras, on the board area'),
 ('Assembly, test and coating', f'={ASM}', 'Assembly sheet: listed prices + rate-book operations + 10 % overhead'),
 ('Cost of quality (rework + scrap)', f"={ref['fpyRework']}*({ref['reworkMin']}/60*{ref['techRate']}+({ref['ictSec']}+{ref['fctSec']})/3600*({ref['ict']}+{ref['techRate']}))+{ref['scrap']}*(B2+B3+B4+B5)", '3 % reworked, 0.3 % scrapped'),
 ('One-off tooling and fixtures ÷ programme', f"={ref['nre']}/({ref['boards']}*{ref['years']})", '£15,400 over 600,000 boards'),
 ('Ex-works (China factory gate)', '=SUM(B2:B7)', 'Built, tested, coated and packed'),
 ('Sea freight to the UK', f"=({ref['boardKg']}+{ref['packKg']})*{ref['seaKg']}", 'Board + packaging share × £/kg'),
 ('UK import duty', f"=(B8+B9)*{ref['duty']}", '3.7 % on ex-works + freight (assumption)'),
 ('Delivered UK, duty paid', '=B8+B9+B10', '')]
for r, (lab, f, b) in enumerate(S, 2):
    wsS.cell(r, 1, lab); wsS.cell(r, 2, f).number_format = '£0.0000'; wsS.cell(r, 3, b)
    if lab.startswith(('Ex-works', 'Delivered')): wsS.cell(r, 1).font = wsS.cell(r, 2).font = Font(bold=True)
wb.save(os.path.join(H, 'manual-costing.xlsx'))
print(f"joints {v['joints']}  components £{C['components']:.4f} (low £{C['componentsLow']:.4f}, high £{C['componentsHigh']:.4f})  burden £{C['burdenGBP']:.4f}  board £{C['fab']:.4f}  assembly £{C['assembly']:.4f}  quality £{C['quality']:.4f}  nre £{C['nrePerBoard']:.4f}")
print(f"EX-WORKS £{C['exWorks']:.4f}  freight £{C['freight']:.4f}  duty £{C['dutyGBP']:.4f}  DELIVERED £{C['delivered']:.4f}")
for k, x in C['assemblyItems'].items(): print(f'   {k:62} £{x:.4f}')

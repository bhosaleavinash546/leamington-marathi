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
RES = json.load(open(os.path.join(H, 'research', 'line-prices.json')))   # the engineer's given prices (build-line-prices.py)

# ── Line prices. Each line: the part priced (maker, part number), the seller's own figure (price, currency, quantity, date,
# page), and the £ base at a stated break. A break below the parts bought a year is carried to them on the CostVision catalogue
# franchise curve P(Q) = P(break) × (Q / break)^−0.0706, flat above 300,000 parts a year; `brk=None` = the base is already at
# the parts-a-year break (catalogue 100k / 200k / 300k). China reel = szlcsc own stock, whole reel, ex-VAT (page ÷ 1.13).
SLOPE, FLAT = 0.0706, 300000
SZ = 'szlcsc own stock, whole reel, ex-VAT'
def sz(mpn, maker, cny, reel, url, grade):
    return dict(mpn=mpn, maker=maker, grade=grade, seller='szlcsc (China)', quote=f'¥{cny:.5f} ex-VAT a part, reel of {reel:,}', date='25 Nov 2026', url=url)
def cat(mpn, maker, grade, seller, quote, date, url):
    return dict(mpn=mpn, maker=maker, grade=grade, seller=seller, quote=quote, date=date, url=url)
P = {   # refDes: (base £, break qty or None, kind, [sources], note)
 'R 0603 group': (0.00075, 5000, 'china-reel', [sz('AC0603FR-0710KL', 'Yageo', 0.00664, 5000, 'https://item.szlcsc.com/117931.html', 'AC series, AEC-Q200')], ''),
 'R 0805 group': (0.00185, 5000, 'china-reel', [sz('AC0805FR-0710KL', 'Yageo', 0.01646, 5000, 'https://item.szlcsc.com/152196.html', 'AC series, AEC-Q200')], ''),
 'R 1206 group': (0.00484, 5000, 'china-reel', [sz('AC1206FR-0710KL', 'Yageo', 0.04301, 5000, 'https://item.szlcsc.com/155852.html', 'AC series, AEC-Q200')], ''),
 'R 2512 group': (0.06194, 4000, 'china-reel', [sz('AC2512FK-0710RL', 'Yageo', 0.55, 4000, 'https://item.szlcsc.com/476216.html', 'AC series, AEC-Q200')], ''),
 'C 0603 group': (0.00287, 4000, 'china-reel', [sz('GCM188R71H104KA57D', 'Murata', 0.02549, 4000, 'https://item.szlcsc.com/87040.html', 'GCM, automotive')], '100 nF 50 V X7R'),
 'C 0805 group': ((0.0152 + 0.0214) / 2, None, 'mix', [
     cat('KAM21BR71H104KT', 'Kyocera AVX', 'AEC-Q200', 'Digi-Key', 'US$0.0289 at 12,000', '22 Nov 2026', 'https://www.digikey.com/en/products/result?keywords=KAM21BR71H104KT'),
     cat('GCM21BR71H105KA03L', 'Murata', 'GCM, AEC-Q200', 'LCSC', 'US$0.0235 at 9,000', '6 Oct 2026', 'https://www.lcsc.com/product-detail/C126592.html')],
     'value mix (judgement): half 100 nF 50 V (£0.0152 at 300k a year), half 1 µF 50 V (£0.0214 at 300k a year)'),
 'C 1206 group': ((0.0197 + 0.06766 * (FLAT / 2000) ** -SLOPE) / 2, None, 'mix', [
     cat('C1206C104K5RACAUTO', 'KEMET', 'AEC-Q200', 'Digi-Key', 'US$0.03711 at 12,000', '22 Nov 2026', 'https://www.digikey.com/en/products/detail/kemet/C1206C104K5RACAUTO/3315001'),
     sz('CGA5L1X7R1H475KT0Y0N', 'TDK', 0.6008, 2000, 'https://item.szlcsc.com/370048.html', 'CGA, AEC-Q200')],
     f'value mix (judgement): half 100 nF 50 V (£0.0197 at 300k a year), half 4.7 µF 50 V (£0.06766 a reel of 2,000 carried to 300k = £{0.06766 * (FLAT / 2000) ** -SLOPE:.4f})'),
 'C 1210 group': (0.09857, 1000, 'china-reel', [sz('GCM32EC71H106KA03L', 'Murata', 0.87531, 1000, 'https://item.szlcsc.com/137892.html', 'GCM, automotive')], '10 µF 50 V X7S bulk'),
 'Q small-signal group': (0.00445, 3000, 'china-reel', [sz('2N7002,215', 'Nexperia', 0.0477, 3000, 'https://item.szlcsc.com/66260.html', 'AEC-Q101'),
                                                        sz('BC847C,215', 'Nexperia', 0.03142, 3000, 'https://item.szlcsc.com/9163.html', 'AEC-Q101')], 'mean of the MOSFET and the BJT'),
 'D small-signal group': (0.00329, 3000, 'china-reel', [sz('BAV99,215', 'Nexperia', 0.0292, 3000, 'https://item.szlcsc.com/2877.html', 'AEC-Q101')], ''),
 'Zener group': (0.00531, 3000, 'china-reel', [sz('BZT52C5V1Q', 'JSMSEMI', 0.04717, 3000, 'https://item.szlcsc.com/3057189.html', '-Q (automotive) suffix')], ''),
 'D rectifier group': (0.0645, None, 'catalogue', [cat('STPS2H100AY', 'STMicroelectronics', 'AEC-Q101', 'Digi-Key', 'US$0.10504 at 5,000', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/stmicroelectronics/STPS2H100AY/2612172')],
     '100 V 2 A Schottky, SMA; £0.0645 at 300k a year'),
 'TVS SMB group': (0.04339, 3000, 'china-reel', [sz('SMBJ24CA', 'Littelfuse', 0.38531, 3000, 'https://item.szlcsc.com/84432.html', 'grade not stated on the listing')], '600 W SMB TVS'),
 'U3': (0.11322, 2500, 'china-reel', [sz('LM2904BQDRQ1', 'Texas Instruments', 1.0054, 2500, 'https://item.szlcsc.com/1946598.html', 'AEC-Q100')], 'analogue: dual op-amp'),
 'U4, U5': (0.11322, 2500, 'china-reel', [sz('LM2904BQDRQ1', 'Texas Instruments', 1.0054, 2500, 'https://item.szlcsc.com/1946598.html', 'AEC-Q100')], 'analogue: dual op-amp'),
 'U6': (0.119, None, 'class', [], 'CostVision class price for an automotive op-amp / comparator at this volume'),
 'U2': (0.7679, None, 'catalogue', [cat('UCC21222QDRQ1', 'Texas Instruments', 'AEC-Q100', 'LCSC', 'US$1.4072 at 1,000', '9 Oct 2026', 'https://www.lcsc.com/product-image/C1848357.html')],
     'analogue: dual-channel isolated gate driver, SOIC-16; £0.7679 at 100k a year'),
 'U7, U8': (0.3013, None, 'catalogue', [cat('L5150BNTR', 'STMicroelectronics', 'AEC-Q100', 'RS Components UK', '£0.438 at 1,000', '13 Oct 2026', 'https://uk.rs-online.com/web/p/voltage-regulators/1785072')],
     'analogue: 40 V 150 mA LDO, SOT-223; £0.3013 at 200k a year'),
 'Q1': (0.2984, None, 'catalogue', [cat('SQJ844AEP-T1_GE3', 'Vishay', 'AEC-Q101', 'TTI', 'US$0.506 at 3,000', '6 Oct 2026', 'https://www.tti.com/content/ttiinc/en/apps/part-detail.html?partsNumber=SQJ844AEP-T1-GE3&mfgShortname=SLN')],
     'analogue: automotive N-MOSFET, PowerPAK SO-8L; £0.2984 at 100k a year'),
 'L1': (0.15148, 1000, 'china-reel', [sz('CLF6045NIT-4R7N-D', 'TDK', 1.34513, 1000, 'https://item.szlcsc.com/335482.html', 'automotive grade')], 'analogue: 6 × 6 mm shielded'),
 'L2': (0.07649, 500, 'china-reel', [sz('DLW43SH510XK2L', 'Murata', 0.6792, 500, 'https://item.szlcsc.com/92784.html', 'automotive')], 'analogue: CAN common-mode choke'),
 'Y1': (0.0702, None, 'catalogue', [cat('NX3225GA-25.000M-STD-CRG-2', 'NDK', 'AEC-Q200', 'LCSC', 'US$0.1169 at 6,000', '9 Oct 2026', 'https://www.lcsc.com/product-image/C438901.html')],
     'analogue: automotive crystal; £0.0702 at 100k a year'),
 'C bulk 100 uF': (0.103, None, 'catalogue', [cat('UCM1V101MCL1GS', 'Nichicon', 'AEC-Q200', 'Digi-Key', 'US$0.17116 at 10,000', '22 Nov 2026', 'https://www.digikey.com/en/products/result?keywords=UCM1V101MCL1GS')],
     'analogue: 100 µF 35 V, 6.3 × 5.8 mm; £0.1030 at 100k a year'),
 'C bulk 22 uF pair': (0.0662, None, 'catalogue', [cat('EEE-FK1H100P', 'Panasonic', 'FK, AEC-Q200', 'Digi-Key', 'US$0.1366 at 10,000', '6 Oct 2026', 'https://www.digikey.com/en/products/detail/panasonic-industry/EEE-FK1H100P/765976')],
     'analogue: FK series, 6.3 mm can; £0.0662 at 200k a year'),
 'T1': (1.36, None, 'class', [
     cat('B78416A2360A003', 'TDK', 'automotive', 'Octopart (search extract, not opened)', 'US$1.80 at 1,000', '26 Nov 2026', 'https://octopart.com/part/tdk/B78416A2360A003'),
     cat('B78307A2338A003', 'TDK', 'E10 EM, AEC-Q200', 'Digi-Key Finland', '€4.24294 at 1,960', '26 Nov 2026', 'https://www.digikey.fi/en/products/detail/tdk/B78307A2338A003/13531824')],
     'TDK customer part (ordering code B78xxxA2363A003, not listed): CostVision class price for an automotive SMD transformer at this volume; the two catalogued TDK parts carried to 100k a year give £1.02 and £2.69'),
 'U1': (3.55, None, 'given', [], ''),
}
for ref, r in RES.get('lines', {}).items():   # the engineer's given figures (research/line-prices.json)
    if r.get('kind') == 'given':
        P[ref] = (float(r['unitGBP']), None, 'given', r['sources'], r['basis'])

def at_volume(base, brk, parts_a_year):
    if brk is None or parts_a_year <= brk: return base
    return base * (min(parts_a_year, FLAT) / brk) ** -SLOPE
lines = []
for l in rd['lines']:
    base, brk, kind, src, note = P[l['refDes']]
    pa = l['qty'] * 100000
    u = round(at_volume(base, brk, pa), 6)
    step = f'£{base:.5f} at {brk:,} → {min(pa, FLAT):,} parts a year = £{u:.5f}' if brk and pa > brk else ''
    basis = '; '.join(x for x in [note, step] if x)
    lines.append(dict(refDes=l['refDes'], description=l['description'], pkg=l['pkg'], qty=l['qty'], qtyLow=l['qtyLow'], qtyHigh=l['qtyHigh'],
                      countMethod=l['countMethod'], unitGBP=u, base=base, brk=brk, kind=kind, sources=src, basis=basis,
                      url=(src[0]['url'] if src else ''), lineGBP=round(l['qty'] * u, 6)))

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
wsB = wb.create_sheet('BOM'); head(wsB, ['RefDes', 'Description', 'Package', 'Qty', 'Qty low', 'Qty high', 'Count', 'Unit £ at volume', 'Line £', 'Price kind', 'Part priced', 'Seller · price quoted · date', 'Volume step / note', 'Source page'],
                                     [20, 55, 16, 6, 8, 8, 10, 12, 10, 12, 34, 44, 60, 60])
for r, l in enumerate(lines, 2):
    srcs = l['sources']
    part = ' + '.join(f"{x['maker']} {x['mpn']} ({x['grade']})" for x in srcs) or 'not identified — class price'
    quote = ' ; '.join(f"{x['seller']}: {x['quote']}, {x['date']}" for x in srcs)
    for j, x in enumerate([l['refDes'], l['description'], l['pkg'], l['qty'], l['qtyLow'], l['qtyHigh'], l['countMethod'], l['unitGBP'], f'=D{r}*H{r}', l['kind'], part, quote, l['basis'], ''], 1):
        wsB.cell(r, j, x)
    if srcs:
        c = wsB.cell(r, 14, srcs[0]['url']); c.hyperlink = srcs[0]['url']; c.font = Font(color='0563C1', underline='single')
        for k, x in enumerate(srcs[1:], 1): wsB.cell(r, 14).value = ' ; '.join(y['url'] for y in srcs)
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

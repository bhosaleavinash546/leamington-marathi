#!/usr/bin/env python3
"""Supercharger control board PCBA (Valeo B112235-B) — the should-cost report. Clean: what the board costs and why.

Reads manual.json (manual.py), re-computes every figure from its inputs and asserts each total against manual.json to 1p,
reads the tool's two live runs (the edited PCB PDF report of each: components at global distributor prices and at China
market prices) and writes report.html (printed to PDF by report-pdf.mjs) and should-cost.xlsx (live formulas).
Usage: python3 report.py <tool-global-dir> <tool-china-dir> <out-dir>"""
import json, os, re, sys, html, base64, subprocess
from collections import OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

H = os.path.dirname(os.path.abspath(__file__))
TG_DIR, TC_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(OUT, exist_ok=True)
M = json.load(open(os.path.join(H, 'manual.json'))); I = {k: d['v'] for k, d in M['inputs'].items()}; C = M['C']; L = M['lines']
RD = json.load(open(os.path.join(H, 'reading.json'))); LP = json.load(open(os.path.join(H, 'research', 'line-prices.json')))['lines']
FX, USD = I['fx'], I['usd']
e = lambda s: html.escape(str(s))
def gbp(x, d=2): return ('−' if x < 0 else '') + f"£{abs(x):,.{d}f}"
def cny(x): return f"¥{x * FX:,.2f}"

# ── 1. re-compute from the inputs ─────────────────────────────────────────────────────────────────────────────────────────
m2 = I['w'] * I['h'] / 1e6; area_cm2 = I['w'] * I['h'] / 100
comp = sum(l['qty'] * l['unitGBP'] for l in L); burden = comp * I['burden']
shape = (I['base2L'] + I['layerAdd'] * (I['layers'] - 2)) / (I['base2L'] + I['layerAdd'] * (I['aspAnchor'] - 2))
fab_m2 = I['aspCny'] * (1 + I['aspRise']) * shape + I['class3Cny']; fab = m2 * fab_m2 / FX
op, tech = I['opRate'], I['techRate']
ASM = OrderedDict([
 ('SMT assembly, paste, reflow and AOI (both sides)', (I['joints'] * I['smtUsdJ'] / USD, f"{I['joints']:,} SMT joints × US${I['smtUsdJ']} ÷ {USD} (JLCPCB list, > 100,000 joints an order)", 'listed')),
 ('Line changeover', (2 * I['changeH'] * (I['smtHS'] + 2 * op) / I['lot'], f"2 sides × {I['changeH']} h × (£{I['smtHS']:.2f} line + 2 × £{op:.2f} operators)/h ÷ {I['lot']:,} boards a lot", 'rate')),
 ('Conformal coating, selective (component areas, both sides)', (I['coatSides'] * I['coatCm2'] * I['coatRate'], f"{I['coatSides']} sides × {I['coatCm2']} cm² × £{I['coatRate']}/cm²", 'rate')),
 ('Coating UV inspection', (I['uvSec'] / 3600 * op, f"{I['uvSec']} s × £{op:.2f}/h", 'rate')),
 ('In-circuit test (ICT)', (I['ictSec'] / 3600 * (I['ict'] + op), f"{I['ictSec']} s × (£{I['ict']:.2f} tester + £{op:.2f} operator)/h", 'rate')),
 ('MCU programming', (I['progSec'] / 3600 * (I['progRate'] + op), f"{I['progSec']} s × (£{I['progRate']} station + £{op:.2f} operator)/h", 'rate')),
 ('Functional test', (I['fctSec'] / 3600 * (I['ict'] + tech), f"{I['fctSec']} s × (£{I['ict']:.2f} tester + £{tech:.2f} technician)/h", 'rate')),
 ('Depanel', (I['depanelGBP'], f"¥0.50 a board ÷ {FX} (Huaqiu list)", 'listed')),
 ('Final inspection', (I['finalSec'] / 3600 * op, f"{I['finalSec']} s × £{op:.2f}/h", 'rate')),
 ('Packaging (ESD bag + divider)', (I['packCny'] / FX, f"¥1 bag + ¥0.002/cm² × {area_cm2:.0f} cm² = ¥{I['packCny']:.2f} ÷ {FX} (JLC list)", 'listed')),
])
listed = sum(v[0] for v in ASM.values() if v[2] == 'listed'); rated = sum(v[0] for v in ASM.values() if v[2] == 'rate')
oh = rated * I['unquotedOH']; assembly = listed + rated + oh
rework = I['fpyRework'] * (I['reworkMin'] / 60 * tech + (I['ictSec'] + I['fctSec']) / 3600 * (I['ict'] + tech))
scrap = I['scrap'] * (comp + burden + fab + assembly); quality = rework + scrap
prog = I['boards'] * I['years']; nre_pb = I['nre'] / prog
exw = comp + burden + fab + assembly + quality + nre_pb
freight = (I['boardKg'] + I['packKg']) * I['seaKg']; duty = (exw + freight) * I['duty']; delivered = exw + freight + duty
for a, b, w in [(comp, C['components'], 'components'), (burden, C['burdenGBP'], 'burden'), (fab, C['fab'], 'board'), (assembly, C['assembly'], 'assembly'),
                (quality, C['quality'], 'quality'), (nre_pb, C['nrePerBoard'], 'nre'), (exw, C['exWorks'], 'ex-works'), (delivered, C['delivered'], 'delivered')]:
    assert abs(a - b) < 0.006, (w, a, b)

# ── 2. the tool's live runs (edited = the engineer's inputs typed in, Calculate) ──────────────────────────────────────────
def tool(d):
    t = subprocess.run(['pdftotext', '-layout', os.path.join(d, 'pcb-report-edited.pdf'), '-'], capture_output=True, text=True).stdout
    def amt(label):
        m = re.search(re.escape(label) + r'[^£\n]*£([\d,]+\.\d\d)', t)
        return float(m.group(1).replace(',', '')) if m else None
    s = json.load(open(os.path.join(d, 'summary.json')))
    r = dict(components=amt('Components (as the EMS buys'), burden=amt('EMS material burden'), fab=amt('Bare PCB fabrication'), fabAuto=amt('Automotive fab grade'),
             smt=amt('SMT / THT assembly'), test=amt('Test & inspection'), asmAuto=amt('Automotive assembly grade'), other=amt('Energy, packaging, cost of quality'),
             exw=amt('Ex-works cost (China factory gate)'), freight=amt('Freight to the UK'), duty=amt('UK import duty'), delivered=amt('Delivered cost per board'),
             band=re.search(r'likely (£[\d.]+ – £[\d.]+)', t).group(1), pageErrors=len(s['pageErrors']), editedTotal=s['editedTotal'])
    assert r['delivered'] and abs(r['delivered'] - float(s['editedTotal'].strip('£'))) < 0.005, (d, r['delivered'], s['editedTotal'])
    return r
TG, TC = tool(TG_DIR), tool(TC_DIR)

# ── 3. pieces of the page ────────────────────────────────────────────────────────────────────────────────────────────────
def row(cells, cls=''):
    tds = ''.join(f"<td class='{c[1]}'>{c[0]}</td>" if isinstance(c, tuple) else f"<td>{c}</td>" for c in cells)
    return f"<tr class='{cls}'>{tds}</tr>"
n_parts = sum(l['qty'] for l in L)
ELEM = [('Components', comp, '#12324f'), ('EMS material burden (5 %)', burden, '#4f7aa3'), ('Bare board', fab, '#7fa7c9'),
        ('Assembly, test and coating', assembly, '#c58b2b'), ('Cost of quality', quality, '#a85b4b'), ('Tooling and fixtures ÷ programme', nre_pb, '#7d7d7d')]
bar = ''.join(f"<span style='width:{v / exw * 100:.2f}%;background:{c}' title='{e(k)}'></span>" for k, v, c in ELEM)
legend = ''.join(f"<span><i style='background:{c}'></i>{e(k)} {v / exw * 100:.1f} %</span>" for k, v, c in ELEM)
summ = ''.join(row([e(k), (gbp(v), 'n'), (cny(v), 'n'), (f"{v / exw * 100:.1f} %", 'n')]) for k, v, _ in ELEM)
summ += row(['<b>Ex-works China (built, tested, coated, packed)</b>', (f"<b>{gbp(exw)}</b>", 'n'), (f"<b>{cny(exw)}</b>", 'n'), ('100.0 %', 'n')], 'tot')
summ += row(['Sea freight to the UK', (gbp(freight), 'n'), (cny(freight), 'n'), ('', 'n')]) + row(['UK import duty (3.7 %, HS line to confirm)', (gbp(duty), 'n'), (cny(duty), 'n'), ('', 'n')])
summ += row(['<b>Delivered UK, duty paid</b>', (f"<b>{gbp(delivered)}</b>", 'n'), (f"<b>{cny(delivered)}</b>", 'n'), ('', 'n')], 'tot')

KIND = {'given': 'Given by the engineer', 'catalogue': 'Catalogue price at volume (analogue)', 'mix': 'Value mix of catalogue / reel prices', 'china-reel': 'China reel price carried to volume', 'distributor': 'Distributor price (analogue)', 'distributor + curve': 'Distributor price carried to volume',
        'class-point': 'Class price (part not identified)'}
top = sorted(L, key=lambda l: -l['lineGBP'])
top_rows = ''.join(row([(i + 1, 'n'), e(l['refDes']), f"{e(l['description'])}<br><span class=sm>{e(l['basis'])}</span>", (l['qty'], 'n'), (gbp(l['unitGBP'], 4), 'n'),
                        (gbp(l['lineGBP']), 'n'), (f"{l['lineGBP'] / comp * 100:.1f} %", 'n')]) for i, l in enumerate(top[:8]))
kinds = OrderedDict()
for l in L: k = KIND.get(l['kind'], l['kind']); kinds.setdefault(k, [0, 0, 0.0]); kinds[k][0] += 1; kinds[k][1] += l['qty']; kinds[k][2] += l['lineGBP']
kind_rows = ''.join(row([e(k), (a, 'n'), (b, 'n'), (gbp(c), 'n'), (f"{c / comp * 100:.0f} %", 'n')]) for k, (a, b, c) in kinds.items())
all_rows = ''.join(row([e(l['refDes']), e(l['description']), e(l['pkg']), (l['qty'], 'n'), (f"{l['qtyLow']}–{l['qtyHigh']}" if l['qtyLow'] != l['qtyHigh'] else '', 'n'),
                        (f"{l['unitGBP']:.4f}", 'n'), (f"{l['lineGBP']:.2f}", 'n'), (f"<span class=sm><b>{e(KIND.get(l['kind'], l['kind']))}.</b> {e(l['basis'])}</span>", '')]) for l in top)

asm_rows = ''.join(row([e(k), (f"<span class=sm>{e(f)}</span>", ''), ('Price list' if t == 'listed' else 'Rate book × time', 'sm'), (gbp(v, 3), 'n')]) for k, (v, f, t) in ASM.items())
asm_rows += row(['Overhead on the rate-book operations', (f"<span class=sm>{I['unquotedOH'] * 100:.0f} % × {gbp(rated, 3)}</span>", ''), ('', ''), (gbp(oh, 3), 'n')])
asm_rows += row(['<b>Assembly, test and coating</b>', ('', ''), ('', ''), (f"<b>{gbp(assembly)}</b>", 'n')], 'tot')
NRE = [('Stencils (2 sides)', 300), ('ICT fixture', 5000), ('Functional test fixture', 8000), ('Coating program', 800), ('Programming set-up', 500), ('Bare-board E-test / route tooling', 800)]
assert sum(v for _, v in NRE) == I['nre']
nre_rows = ''.join(row([e(n), (f"£{v:,}", 'n')]) for n, v in NRE) + row(['<b>Tooling and fixtures</b>', (f"<b>£{I['nre']:,}</b>", 'n')], 'tot') + row([f"Per board over {prog:,} boards", (gbp(nre_pb, 4), 'n')])
board_rows = ''.join(row(r) for r in [
 ['China automotive 4–6-layer board ASP (2024)', f"¥{I['aspCny']:,.2f}/m² sold — Chaoying (超颖) prospectus; automotive is its main use"],
 ['Price rise to 2026', f"× {1 + I['aspRise']:.3f} (mid of the +12–17 % rise to Q1 2026)"],
 ['4 layers against the 5-layer anchor', f"× {shape:.4f} (CostVision China table shape: (£{I['base2L']} + 2 × £{I['layerAdd']}) ÷ (£{I['base2L']} + 3 × £{I['layerAdd']}) a dm²)"],
 ['IPC class-3 extras', f"+ ¥{I['class3Cny']}/m² (25 µm hole copper, 4-wire electrical test — PCBasic)"],
 ['Price a m²', f"¥{fab_m2:,.2f}/m² = £{fab_m2 / FX:,.2f}/m²"],
 [('<b>Bare board, automotive grade, ENIG</b>', ''), (f"{m2:.4f} m² × ¥{fab_m2:,.2f} ÷ {FX} = <b>{gbp(fab)}</b>", '')]])
oth_rows = ''.join(row(r) for r in [
 ['Rework', f"{I['fpyRework'] * 100:.0f} % of boards (FPY 97 %) × ({I['reworkMin']} min technician + ICT and functional re-test {I['ictSec'] + I['fctSec']} s)", (gbp(rework, 3), 'n')],
 ['Scrap', f"{I['scrap'] * 100:.1f} % × (components + burden + board + assembly) {gbp(comp + burden + fab + assembly)}", (gbp(scrap, 3), 'n')],
 ['Sea freight', f"({I['boardKg'] * 1000:.0f} g board + {I['packKg'] * 1000:.0f} g packaging) × £{I['seaKg']}/kg", (gbp(freight, 3), 'n')],
 ['UK import duty', f"{I['duty'] * 100:.1f} % × (ex-works + freight) {gbp(exw + freight)} — HS line to be confirmed", (gbp(duty, 3), 'n')]])

# MCU sensitivity (the one line that moves the board)
u1 = next(l for l in L if l['refDes'] == 'U1'); lo, hi = LP['U1']['rangeLow'], LP['U1']['rangeHigh']
def at_mcu(p):
    c2 = comp + (p - u1['unitGBP']); b2 = c2 * I['burden']; s2 = I['scrap'] * (c2 + b2 + fab + assembly)
    return c2 + b2 + fab + assembly + rework + s2 + nre_pb
mcu_lo, mcu_hi = at_mcu(lo), at_mcu(hi)
compL, compH = C['componentsLow'], C['componentsHigh']
def at_comp(c2):
    b2 = c2 * I['burden']; return c2 + b2 + fab + assembly + rework + I['scrap'] * (c2 + b2 + fab + assembly) + nre_pb
q_lo, q_hi = at_comp(compL), at_comp(compH)

def tool_rows(t):
    return [t['components'] + t['burden'], t['fab'] + t['fabAuto'], t['smt'] + t['test'] + t['asmAuto'], t['other'], t['exw'], t['freight'] + t['duty'], t['delivered']]
mine = [comp + burden, fab, assembly, quality + nre_pb, exw, freight + duty, delivered]
XL = ['Components with the EMS burden', 'Bare board', 'Assembly, test and coating', 'Quality, packaging and other', '<b>Ex-works China</b>', 'Freight + UK duty', '<b>Delivered UK</b>']
xc_rows = ''.join(row([lab, (gbp(a), 'n'), (gbp(b), 'n'), (gbp(c), 'n')], 'tot' if lab.startswith('<b>') else '') for lab, a, b, c in zip(XL, mine, tool_rows(TC), tool_rows(TG)))

PHOTOS = [('08-top-full-2.jpg', 'Top side: the NXP controller (centre), transformer T1 and its SO-16 driver (top left), the bulk capacitors, the sense area (right).'),
          ('09-bottom-full-2.jpg', 'Bottom side: rectifiers and TVS on the supply path, power resistors, the MSOP-10 IC by the shaft opening; gold ICT pads.'),
          ('15-mcu-marking.jpg', 'The controller: NXP SC667506WKK / 1N00R / ZRAA2635A — part number, mask set and trace code of one chip.'),
          ('14-board-text-zoom.jpg', 'Board text: VALEO, B112235-B, LOT 2663504; the two 22 µF "JZC 6X6" capacitors.')]
def fig(f, cap, n):
    b = base64.b64encode(open(os.path.join(H, 'photos', f), 'rb').read()).decode()
    return f"<figure><img src='data:image/jpeg;base64,{b}' alt='{e(cap)}'><figcaption><b>Figure {n}.</b> {e(cap)}</figcaption></figure>"
FIGS = "<div class=figs>" + ''.join(fig(f, c, i + 1) for i, (f, c) in enumerate(PHOTOS)) + "</div>"

CSS = open(os.path.join(H, 'report.css')).read()
HTML = f"""<!doctype html><html><head><meta charset=utf-8><title>Supercharger control board PCBA should-cost</title><style>{CSS}</style></head><body>
<div class=eyebrow>CostVision · PCBA should-cost · 26 November 2026</div>
<h1>Supercharger control board PCBA — should-cost</h1>
<div class=sub>Valeo B112235-B, the control board of a 48 V electric supercharger · {I['w']} × {I['h']} mm · 4-layer (estimated) · ENIG · conformal coating on the component areas of both sides</div>
<div class=sub>Built in <b>China</b> · <b>{I['boards']:,} boards a year</b> · <b>{I['years']}-year programme</b> ({prog:,} boards) · £ per board; ¥ at {FX} CNY per £</div>
<div class=kpis>
<div class='kpi main'><span>Should-cost, ex-works China</span><b>{gbp(exw)}</b><span>{cny(exw)} a board</span></div>
<div class=kpi><span>Delivered UK, duty paid</span><b>{gbp(delivered)}</b><span>{cny(delivered)} a board</span></div>
<div class=kpi><span>Range, ex-works</span><b>{gbp(q_lo)} – {gbp(q_hi)}</b><span>part count; controller as given</span></div>
<div class=kpi><span>Programme value, ex-works</span><b>£{exw * prog / 1e6:,.2f} m</b><span>{prog:,} boards</span></div>
</div>

<h2>1. Summary</h2>
<div class=bar>{bar}</div><div class=legend>{legend}</div>
<table><tr><th>Cost element</th><th class=n>£ a board</th><th class=n>¥ a board</th><th class=n>Share of ex-works</th></tr>{summ}</table>
<div class=box><b>What drives the cost.</b><ul>
<li><b>Components are {(comp + burden) / exw * 100:.0f} % of the ex-works cost</b> ({gbp(comp + burden)} with the EMS burden): {len(L)} lines, {n_parts} parts a board.</li>
<li><b>The controller is the largest line: {gbp(u1['lineGBP'])}, {u1['lineGBP'] / comp * 100:.0f} % of the components.</b> SC667506WKK is NXP's customer build of the S12ZVMC256 — an S12 MagniV motor-control MCU with its own gate-drive unit and CAN physical layer (§2). Priced at £3.55, the 100,000-a-year price given by the engineer (Mouser UK, Digi-Key); at the distributor's 480-unit price carried to volume (£{hi:.2f}) the board would be {gbp(mcu_hi)} ex-works.</li>
<li><b>Transformer T1 is second ({gbp(next(l['lineGBP'] for l in L if l['refDes'] == 'T1'))})</b>: a TDK/EPCOS customer part (not listed), priced at the median of its class; catalogued TDK transformers put it between £1.02 and £2.69.</li>
<li><b>The other {len(L) - 2} lines are {gbp(comp - sum(l['lineGBP'] for l in L if l['refDes'] in ('U1', 'T1')))}</b>: China reel prices carried to the parts bought a year, catalogue prices at volume for the analogues, MLCC groups priced as a value mix.</li>
<li><b>Assembly, test and coating are {gbp(assembly)}</b>; the bare board is {gbp(fab)} at the China automotive market price a m².</li></ul></div>
<div class=box><b>The CostVision tool on the same photos and inputs</b> (live run, real server and browser): <b>{gbp(TC['exw'])} ex-works / {gbp(TC['delivered'])} delivered</b> with components at China market prices, {gbp(TG['exw'])} / {gbp(TG['delivered'])} at global distributor prices — {(TC['exw'] / exw - 1) * 100:+.1f} % and {(TG['exw'] / exw - 1) * 100:+.1f} % against this should-cost (§6).</div>
<p class=sm><b>Basis.</b> Populated board, built, tested and coated in China, ex-works; delivered adds sea freight and UK import duty. Prices read 25–26 Nov 2026, ex-VAT. List prices carry the seller's margin; rate-book operations carry {I['unquotedOH'] * 100:.0f} % overhead. No BOM, drawing, Gerber or supplier quote was supplied: part identities other than the controller, the layer count and the via count are readings and estimates (§7).</p>

<h2 class=pb>2. The board</h2>
<div class=cols><div><table>
{row(['Board', 'Valeo B112235-B (PCB by Dynamic Electronics, UL KM1-V0, 94V-0)'])}
{row(['Function', 'Control board of a 48 V electric supercharger: motor-control MCU, isolated auxiliary supply, current / voltage sensing'])}
{row(['Size', f"{I['w']} × {I['h']} mm envelope (given), shaft opening and window cut out"])}
{row(['Build', '4 layers, ~700 through vias, 1 oz, ENIG (estimated — not visible)'])}
{row(['Parts', f"{n_parts} SMT parts in {len(L)} lines, both sides; {I['joints']} SMT joints; no connector fitted"])}
</table></div><div><table>
{row(['Volume', f"{I['boards']:,} boards a year, lots of {I['lot']:,} (one a month)"])}
{row(['Programme', f"{I['years']} years, {prog:,} boards"])}
{row(['Build country', 'China (automotive EMS, IATF 16949)'])}
{row(['Coating', 'Selective, on the component areas of both sides (given)'])}
{row(['Currency', f"£; CNY {FX} per £, US$ {USD} per £"])}
</table></div></div>
<h3>The controller — NXP SC667506WKK</h3>
<p>The chip carries three lines: <b>SC667506WKK</b> (part number), <b>1N00R</b> (mask set) and <b>ZRAA2635A</b> (trace / lot code — not a second part). "SC" is NXP's prefix for a customer build. NXP's errata for mask set 1N00R applies to the <b>S912ZVMC256</b>; "WKK" is the −40 to 150 °C grade in the 80-pin LQFP with exposed pad (20 pins a side, counted on Figure 3). NXP's S12ZVM fact sheet lists superchargers as a target application. The standard twin is S912ZVMC25F1WKK.</p>
<p class=sm>Sources: NXP errata S12ZVMC256_1N00R (nxp.com/docs/en/errata/S12ZVMC256_1N00R.pdf); NXP S12ZVM fact sheet S12ZVMFS (nxp.com/docs/en/fact-sheet/S12ZVMFS.pdf); NXP automotive MCU part-number guide.</p>
<p><b>Every other IC is de-marked</b> (markings scratched off): each is identified by package and position and priced as a named analogue or at the median of its class. The ~32 plated holes carry pins soldered when the board is built into the housing; they are module assembly, not this PCBA.</p>
{FIGS}

<h2 class=pb>3. Components — {gbp(comp)} a board, plus {gbp(burden)} EMS burden</h2>
<table><tr><th>Price basis</th><th class=n>Lines</th><th class=n>Parts</th><th class=n>£ a board</th><th class=n>Share</th></tr>{kind_rows}</table>
<h3>The eight largest lines ({sum(l['lineGBP'] for l in top[:8]) / comp * 100:.0f} % of the components)</h3>
<table><tr><th class=n>#</th><th>Ref</th><th>Part and price basis</th><th class=n>Qty</th><th class=n>Unit</th><th class=n>A board</th><th class=n>Share</th></tr>{top_rows}</table>
<p class=sm>Volume rule: a distributor price at a stated break is carried to the parts bought a year on the franchise curve P(Q) = P(break) × (Q/break)^−0.0706 — the CostVision component catalogue's default slope. China reel prices (szlcsc own stock, whole reel, ex-VAT) are carried the same way from their reel quantity; catalogue prices are read at the 100k / 200k / 300k break matching the parts bought. Flat above 300,000 parts a year (the tool's rule). MLCC groups are a value mix (judgement): 0805 and 1206 half 100 nF, half 1 µF / 4.7 µF; 1210 all 10 µF bulk.</p>

<h2>4. Bare board — {gbp(fab)}</h2>
<table><tr><th>Step</th><th>Figure</th></tr>{board_rows}</table>
<p class=sm>The ASP is a price per m² sold, so the board's envelope area is used; panel waste is inside the market price.</p>

<h2>5. Assembly, test and coating — {gbp(assembly)}</h2>
<table><tr><th>Operation</th><th>Arithmetic</th><th>Basis</th><th class=n>£ a board</th></tr>{asm_rows}</table>
<div class=cols><div><h3>Quality, freight and duty</h3><table><tr><th>Item</th><th>Arithmetic</th><th class=n>£ a board</th></tr>{oth_rows}</table></div>
<div><h3>One-off tooling and fixtures</h3><table><tr><th>Item</th><th class=n>£</th></tr>{nre_rows}</table>
<p class=sm>Estimates; spread over the programme. The automotive programme NRE (PPAP, FMEA, validation) is not in the unit cost.</p></div></div>

<h2 class=pb>6. Cross-check: the CostVision tool, live</h2>
<p>The same photos went through CostVision's PCB screen on a real server and browser, with the inputs typed in as an engineer would: China, 100,000 a year, 6 years, 120 × 100 mm, 40 g, coating on both sides, first-pass yield 0.97, a lot a month, and the controller at the given £3.55. Two runs: components at China market prices (the tool's China component market) and at global distributor prices. 0 page errors on both.</p>
<table><tr><th>£ a board</th><th class=n>This should-cost</th><th class=n>Tool, China market</th><th class=n>Tool, global distributors</th></tr>{xc_rows}</table>
<ul class=sm>
<li><b>Components.</b> The tool prices every unread part inside its class range (lower-half midpoint). Its China-market run takes reel prices for the passives and discretes as this should-cost does; at global distributor prices the MLCCs, LDOs and transformer sit higher. The tool's likely range: {TC['band']} (China market), {TG['band']} (global).</li>
<li><b>Volume.</b> This should-cost carries every price to the parts bought a year and prices MLCC groups as a value mix; the tool prices unread parts at the lower-half midpoint of their class at this volume and every MLCC of a size at one class point.</li>
<li><b>Assembly.</b> The tool costs placements at the China line rate, AOI / ICT as station time, coating on the full side area, plus an automotive assembly grade; this should-cost uses the Chinese per-joint list price, selective coating on the component areas only, and named test times.</li>
</ul>

<h2>7. What is not yet confirmed</h2>
<table><tr><th>Item</th><th>Status</th><th>Effect, ex-works</th></tr>
{row(['Controller price', f"£3.55 at 100,000 a year, given (Mouser UK, Digi-Key) — not Valeo's contract price; at the 480-unit list carried to volume (£{hi:.2f})", (f"{gbp(mcu_lo)} – {gbp(mcu_hi)}", 'n')])}
{row(['Passive count', 'Resistors and MLCCs estimated from the zooms (range per line, §8)', (f"{gbp(q_lo)} – {gbp(q_hi)}", 'n')])}
{row(['De-marked ICs', 'SO-16 driver, SO-8 × 3, MSOP-10, SOT-223 × 2: priced as analogues / class', ('', 'n')])}
{row(['Transformer T1, electrolytics', 'Customer / undecoded parts: class price and catalogued analogues', (f"{gbp(exw - 0.34 * (1 + I['burden']))} – {gbp(exw + 1.33 * (1 + I['burden']))}", 'n')])}
{row(['MLCC value mix', 'Half 100 nF / half 1–4.7 µF in the 0805 and 1206 groups (judgement)', ('', 'n')])}
{row(['Layers, vias, copper', '4 layers, ~700 vias, 1 oz — not visible in a photo', ('', 'n')])}
{row(['Test plan', 'ICT 25 s, programming 30 s, functional test 45 s — estimates', ('', 'n')])}
{row(['Import duty', '3.7 % assumed; HS line not confirmed', ('', 'n')])}
</table>
<p><b>Ask the supplier for:</b> the BOM with part numbers; Gerber and drill files (layer stack, vias); the test plan; the controller's and transformer's contract prices; the coating specification and area. Accuracy is not measured: no costing has been compared with a price paid for this board.</p>

<h2 class=pb>8. Bill of materials</h2>
<table class=parts><colgroup><col style='width:11%'><col style='width:25%'><col style='width:10%'><col style='width:5%'><col style='width:7%'><col style='width:7%'><col style='width:6%'><col style='width:29%'></colgroup>
<tr><th>Ref</th><th>Description</th><th>Package</th><th class=n>Qty</th><th class=n>Range</th><th class=n>Unit £</th><th class=n>Line £</th><th>Price basis</th></tr>{all_rows}
{row(['', '<b>Components a board</b>', '', (f"<b>{n_parts}</b>", 'n'), '', '', (f"<b>{comp:.2f}</b>", 'n'), ''], 'tot')}</table>
</body></html>"""
open(os.path.join(OUT, 'report.html'), 'w').write(HTML)

# ── 4. the workbook: the manual costing with live formulas + the tool cross-check ────────────────────────────────────────
import shutil
from openpyxl import load_workbook
wb = load_workbook(os.path.join(H, 'manual-costing.xlsx'))
ws = wb.create_sheet('Tool cross-check'); hdr = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='1F4E5A')
for i, (c, w) in enumerate([('£ a board', 40), ('This should-cost', 16), ('Tool, China market', 18), ('Tool, global distributors', 22)], 1):
    x = ws.cell(1, i, c); x.font = hdr; x.fill = fill; ws.column_dimensions[get_column_letter(i)].width = w
for r, (lab, a, b, c) in enumerate(zip(XL, mine, tool_rows(TC), tool_rows(TG)), 2):
    ws.cell(r, 1, re.sub('<[^>]+>', '', lab)); ws.cell(r, 2, round(a, 4)); ws.cell(r, 3, b); ws.cell(r, 4, c)
    for j in (2, 3, 4): ws.cell(r, j).number_format = '£0.00'
ws.cell(10, 1, 'Tool: CostVision live run 26 Nov 2026 (PCB screen, real server and browser), the engineer\'s inputs typed in; this should-cost: Summary sheet.')
wb.save(os.path.join(OUT, 'supercharger-pcb-should-cost.xlsx'))
print(f"ex-works {gbp(exw, 4)} delivered {gbp(delivered, 4)} | tool China {gbp(TC['exw'])}/{gbp(TC['delivered'])} global {gbp(TG['exw'])}/{gbp(TG['delivered'])} | MCU range {gbp(mcu_lo)}–{gbp(mcu_hi)} qty range {gbp(q_lo)}–{gbp(q_hi)}")

#!/usr/bin/env python3
"""BMW rear-axle inverter control board PCBA (G6-CTRL REV007) — the should-cost report. Clean: what the board costs and why.
Reads manual.json (manual.py), re-computes every figure from its inputs and asserts each total against manual.json to 1p,
reads the tool's two live runs (the edited PCB PDF of each) and writes report.html (→ PDF by report-pdf.mjs) and the workbook.
Usage: python3 report.py <tool-global-dir> <tool-china-dir> <out-dir>"""
import json, os, re, sys, html, base64, subprocess, math
from collections import OrderedDict
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

H = os.path.dirname(os.path.abspath(__file__))
TG_DIR, TC_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(OUT, exist_ok=True)
M = json.load(open(os.path.join(H, 'manual.json'))); I = {k: d['v'] for k, d in M['inputs'].items()}; C = M['C']; L = M['lines']
FX, USD = I['fx'], I['usd']
e = lambda s: html.escape(str(s))
def gbp(x, d=2): return ('−' if x < 0 else '') + f"£{abs(x):,.{d}f}"
def cny(x): return f"¥{x * FX:,.2f}"

# ── 1. re-compute from the inputs ─────────────────────────────────────────────────────────────────────────────────────────
m2 = I['w'] * I['h'] / 1e6; area_cm2 = I['w'] * I['h'] / 100
comp = sum(l['qty'] * l['unitGBP'] for l in L); burden = comp * I['burden']
shape = (I['base2L'] + I['layerAdd'] * (I['layers'] - 2)) / (I['base2L'] + I['layerAdd'] * (I['aspAnchor'] - 2))
cu = I['outerCuSteps'] * I['heavyCuCny']
fab_m2 = I['aspCny'] * (1 + I['aspRise']) * shape + I['class3Cny'] + cu; fab = m2 * fab_m2 / FX
op, tech = I['opRate'], I['techRate']
sil = I['stakeG'] * I['siliconeGBPg']
ASM = OrderedDict([
 ('SMT assembly, paste, reflow and AOI (both sides)', (I['joints'] * I['smtUsdJ'] / USD, f"{I['joints']:,} SMT joints × US${I['smtUsdJ']} ÷ {USD} (JLCPCB list, > 100,000 joints an order)", 'listed')),
 ('Through-hole soldering', (I['thtJoints'] * I['thtUsdJ'] / USD, f"{I['thtJoints']} joints (ACS37601 × 2, film capacitors × 4, power resistors × 2) × US${I['thtUsdJ']} ÷ {USD} (JLCPCB list)", 'listed')),
 ('Line changeover', (2 * I['changeH'] * (I['smtHS'] + 2 * op) / I['lot'], f"2 sides × {I['changeH']} h × (£{I['smtHS']:.2f} line + 2 × £{op:.2f} operators)/h ÷ {I['lot']:,} boards a lot", 'rate')),
 ('X-ray of the TC389 BGA', (I['xraySec'] / 3600 * (I['xray'] + op), f"{I['xraySec']} s × (£{I['xray']:.2f} X-ray cell + £{op:.2f} operator)/h", 'rate')),
 ('Conformal coating: material', (I['coatCm2'] * I['coatDryUm'] / 1e4 / I['coatSolids'] / 1000 * I['coatGBPperL'], f"{I['coatCm2']} cm² × {I['coatDryUm']} µm dry ÷ {I['coatSolids']:.0%} solids = {I['coatCm2'] * I['coatDryUm'] / 1e4 / I['coatSolids']:.1f} mL × £{I['coatGBPperL']:.2f}/L (HumiSeal 1B31, 5 L can, Digi-Key)", 'rate')),
 ('Conformal coating: selective coater', (I['coaterSec'] / 3600 * (I['smtStd'] + op), f"{I['coaterSec']} s × (£{I['smtStd']:.2f} coating cell + £{op:.2f} operator)/h", 'rate')),
 ('Coating UV inspection', (I['uvSec'] / 3600 * op, f"{I['uvSec']} s × £{op:.2f}/h", 'rate')),
 ('Silicone staking', (I['stakeDots'] * (I['stakeSec'] / 3600 * op + sil), f"{I['stakeDots']} dots × ({I['stakeSec']} s × £{op:.2f}/h + {I['stakeG']} g × £{I['siliconeGBPg']:.4f}/g silicone)", 'rate')),
 ('In-circuit test (ICT)', (I['ictSec'] / 3600 * I['ict'], f"{I['ictSec']} s × £{I['ict']:.2f}/h tester (its rate-book build-up holds operator and overhead)", 'station')),
 ('TC389 programming', (I['progSec'] / 3600 * (I['progRate'] + op), f"{I['progSec']} s × (£{I['progRate']} station + £{op:.2f} operator)/h", 'rate')),
 ('Functional and isolation test', (I['fctSec'] / 3600 * I['ict'], f"{I['fctSec']} s × £{I['ict']:.2f}/h tester (operator and overhead inside its rate)", 'station')),
 ('Depanel', (I['depanelGBP'], f"¥0.50 a board ÷ {FX} (Huaqiu list)", 'listed')),
 ('Final inspection', (I['finalSec'] / 3600 * op, f"{I['finalSec']} s × £{op:.2f}/h", 'rate')),
 ('Packaging (ESD bag + divider)', (I['packCny'] / FX, f"¥1 bag + ¥0.002/cm² × {area_cm2:.0f} cm² = ¥{I['packCny']:.2f} ÷ {FX} (JLC list)", 'listed')),
])
listed = sum(v[0] for v in ASM.values() if v[2] == 'listed'); rated = sum(v[0] for v in ASM.values() if v[2] == 'rate'); station = sum(v[0] for v in ASM.values() if v[2] == 'station')
oh = rated * I['unquotedOH']; assembly = listed + rated + station + oh
rework = I['fpyRework'] * (I['reworkMin'] / 60 * tech + (I['ictSec'] + I['fctSec']) / 3600 * (I['ict'] + tech))
scrap = I['scrap'] * (comp + burden + fab + assembly); quality = rework + scrap
prog = I['boards'] * I['years']; nre_pb = I['nre'] / prog
exw = comp + burden + fab + assembly + quality + nre_pb
freight = (I['boardKg'] + I['packKg']) * I['seaKg']; duty = (exw + freight) * I['duty']; delivered = exw + freight + duty
for a, b, w in [(comp, C['components'], 'components'), (burden, C['burdenGBP'], 'burden'), (fab, C['fab'], 'board'), (assembly, C['assembly'], 'assembly'),
                (quality, C['quality'], 'quality'), (nre_pb, C['nrePerBoard'], 'nre'), (exw, C['exWorks'], 'ex-works'), (delivered, C['delivered'], 'delivered')]:
    assert abs(a - b) < 0.006, (w, a, b)

# ── 2. the tool's live runs ──────────────────────────────────────────────────────────────────────────────────────────────
def tool(d):
    t = subprocess.run(['pdftotext', '-layout', os.path.join(d, 'pcb-report-edited.pdf'), '-'], capture_output=True, text=True).stdout
    def amt(label):
        m = re.search(re.escape(label) + r'[^£\n]*(−|-)?£([\d,]+\.\d\d)', t)
        return (-1 if m and m.group(1) else 1) * float(m.group(2).replace(',', '')) if m else 0.0
    s = json.load(open(os.path.join(d, 'summary.json')))
    r = dict(components=amt('Components (as the EMS buys'), burden=amt('EMS material burden'), fab=amt('Bare PCB fabrication'), fabAuto=amt('Automotive fab grade'),
             smt=amt('SMT / THT assembly'), test=amt('Test & inspection'), asmAuto=amt('Automotive assembly grade'), other=amt('Energy, packaging, cost of quality'),
             exw=amt('Ex-works cost (China factory gate)'), freight=amt('Freight to the UK'), duty=amt('UK import duty'), delivered=amt('Delivered cost per board'),
             band=re.search(r'likely (£[\d.,]+ – £[\d.,]+)', t).group(1), pageErrors=len(s['pageErrors']), editedTotal=s['editedTotal'])
    assert abs(r['delivered'] - float(s['editedTotal'].strip('£').replace(',', ''))) < 0.005, (d, r['delivered'], s['editedTotal'])
    return r
TG, TC = tool(TG_DIR), tool(TC_DIR)

# ── 3. pieces of the page ────────────────────────────────────────────────────────────────────────────────────────────────
def row(cells, cls=''):
    return f"<tr class='{cls}'>" + ''.join(f"<td class='{c[1]}'>{c[0]}</td>" if isinstance(c, tuple) else f"<td>{c}</td>" for c in cells) + "</tr>"
n_parts = sum(l['qty'] for l in L)
ELEM = [('Components', comp), ('EMS material burden (5 %)', burden), ('Bare board', fab), ('Assembly, test, coating', assembly), ('Cost of quality', quality), ('Tooling and fixtures ÷ programme', nre_pb)]

# Donuts (inline SVG). Cost donut: dataviz default slots blue / aqua / yellow / red — the 4-colour set that passes every check
# on ALL pairs (worst colour-blind ΔE 10.2); aqua / yellow are below 3:1, so every slice has a legend row with £ and %.
# Components donut drills into the blue slice: one blue ramp, darkest = largest.
def donut(segs, total, centre, sub, size=132, ring=25):
    cx = cy = size / 2; r_out = size / 2 - 2; r_in = r_out - ring; a = -math.pi / 2; parts = []
    for name, v, col, ink in segs:
        f = v / total; a2 = a + f * 2 * math.pi; large = 1 if a2 - a > math.pi else 0
        p0 = (cx + r_out * math.cos(a), cy + r_out * math.sin(a)); p1 = (cx + r_out * math.cos(a2), cy + r_out * math.sin(a2))
        p2 = (cx + r_in * math.cos(a2), cy + r_in * math.sin(a2)); p3 = (cx + r_in * math.cos(a), cy + r_in * math.sin(a))
        d = f"M{p0[0]:.2f},{p0[1]:.2f} A{r_out},{r_out} 0 {large} 1 {p1[0]:.2f},{p1[1]:.2f} L{p2[0]:.2f},{p2[1]:.2f} A{r_in},{r_in} 0 {large} 0 {p3[0]:.2f},{p3[1]:.2f} Z"
        parts.append(f"<path d='{d}' fill='{col}' stroke='#ffffff' stroke-width='2' stroke-linejoin='round'><title>{e(name)}: {gbp(v)} ({f * 100:.1f} %)</title></path>")
        if f >= 0.06:
            am = (a + a2) / 2; rm = (r_out + r_in) / 2
            parts.append(f"<text x='{cx + rm * math.cos(am):.1f}' y='{cy + rm * math.sin(am) + 3.5:.1f}' text-anchor='middle' font-size='10' font-weight='600' fill='{ink}'>{f * 100:.0f}%</text>")
        a = a2
    parts.append(f"<text x='{cx}' y='{cy - 2}' text-anchor='middle' font-size='14' font-weight='700' fill='#12324f'>{e(centre)}</text>")
    parts.append(f"<text x='{cx}' y='{cy + 15}' text-anchor='middle' font-size='9' fill='#4a5868'>{e(sub)}</text>")
    svg = f"<svg viewBox='0 0 {size} {size}' width='{size}' height='{size}' role='img' aria-label='{e(sub)} {e(centre)}'>{''.join(parts)}</svg>"
    leg = ''.join(f"<tr><td><i class=sw style='background:{col}'></i>{e(name)}</td><td class=n>{gbp(v)}</td><td class=n>{v / total * 100:.1f}%</td></tr>" for name, v, col, _ in segs)
    return f"<div class=donut>{svg}<table class=dleg>{leg}<tr class=tot><td>Total</td><td class=n>{gbp(total)}</td><td class=n>100%</td></tr></table></div>"
COST_SEGS = [('Components + burden', comp + burden, '#257de0', '#ffffff'), ('Bare board', fab, '#f2a600', '#0b0b0b'),
             ('Assembly, test, coating', assembly, '#00b894', '#0b0b0b'), ('Quality and tooling', quality + nre_pb, '#ec4647', '#ffffff')]
def grp(refs): return sum(l['lineGBP'] for l in L if l['refDes'] in refs)
G_CTRL = {'Integrated Circuit 1', 'Integrated Circuit 2'}
G_GATE = {'Integrated Circuit 5', 'Integrated Circuit 6', 'Integrated Circuit 10', 'Integrated Circuit 11', 'Integrated Circuit 13', 'Inductor 2', 'Diode 6'}
G_PASS = {l['refDes'] for l in L if l['refDes'].startswith(('Capacitor', 'Resistor', 'Inductor', 'Ferrite'))} - G_GATE
g_ctrl, g_gate, g_pass = grp(G_CTRL), grp(G_GATE), grp(G_PASS)
COMP_SEGS = sorted([('Gate drive (6 channels)', g_gate), ('Controller + PMIC', g_ctrl), ('Other ICs, discretes', comp - g_ctrl - g_gate - g_pass),
                    ('Passives, magnetics', g_pass)], key=lambda x: -x[1])
COMP_SEGS = [(n, v, c, ink) for (n, v), (c, ink) in zip(COMP_SEGS, [('#0e3d7e', '#ffffff'), ('#2370cd', '#ffffff'), ('#6aabf1', '#0b0b0b'), ('#b6d5f8', '#0b0b0b')])]
assert abs(sum(v for _, v, _, _ in COST_SEGS) - exw) < 1e-9 and abs(sum(v for _, v, _, _ in COMP_SEGS) - comp) < 1e-9
DONUTS = (f"<div class=donuts><div><h3>Ex-works cost — {gbp(exw)} a board</h3>{donut(COST_SEGS, exw, gbp(exw), 'a board')}</div>"
          f"<div><h3>Components — {gbp(comp)} a board</h3>{donut(COMP_SEGS, comp, gbp(comp), 'a board')}</div></div>")
summ = ''.join(row([e(k), (gbp(v), 'n'), (cny(v), 'n'), (f"{v / exw * 100:.1f} %", 'n')]) for k, v in ELEM)
summ += row(['<b>Ex-works China (built, tested, coated, packed)</b>', (f"<b>{gbp(exw)}</b>", 'n'), (f"<b>{cny(exw)}</b>", 'n'), ('100.0 %', 'n')], 'tot')
summ += row(['Sea freight to the UK', (gbp(freight), 'n'), (cny(freight), 'n'), ('', 'n')]) + row(['UK import duty (3.7 %, HS line to confirm)', (gbp(duty), 'n'), (cny(duty), 'n'), ('', 'n')])
summ += row(['<b>Delivered UK, duty paid</b>', (f"<b>{gbp(delivered)}</b>", 'n'), (f"<b>{cny(delivered)}</b>", 'n'), ('', 'n')], 'tot')

KIND = {'maker': 'BOM part, maker\'s own price (TI.com, onsemi.com) carried to volume', 'distributor': 'BOM part, distributor price carried to volume', 'catalogue': 'BOM part or family member, catalogue price carried to volume',
        'china-reel': 'Named part, China distributor reel carried to volume', 'mix': 'Value mix of named automotive parts', 'estimate': 'Estimate (stated)'}
def src_html(l):
    out = []
    for x in l['sources']:
        host = re.sub(r'^https?://(www[.])?', '', x['url']).split('/')[0]
        out.append(f"<b>{e(x['maker'])} {e(x['mpn'])}</b> <span class=sm>({e(x['grade'])})</span><br><span class=sm>{e(x['seller'])}: {e(x['quote'])}, {e(x['date'])} — <a href='{e(x['url'])}'>{e(host)}</a></span>")
    return '<br>'.join(out)
top = sorted(L, key=lambda l: -l['lineGBP'])
SHORT = lambda l: re.split(r' \(| — |, ', l['description'])[0].strip()
top_rows = ''.join(row([(i + 1, 'n'), e(l['bomRow']), e(SHORT(l)), (e(f"{l['manufacturer']} {l['partNumber']}".strip()) or e(' + '.join(f"{x['maker']} {x['mpn']}" for x in l['sources'])), 'sm'),
                        (l['qty'], 'n'), (gbp(l['unitGBP'], 4), 'n'), (gbp(l['lineGBP']), 'n'), (f"{l['lineGBP'] / comp * 100:.1f} %", 'n')]) for i, l in enumerate(top[:12]))
kinds = OrderedDict()
for l in L: k = KIND.get(l['kind'], l['kind']); kinds.setdefault(k, [0, 0, 0.0]); kinds[k][0] += 1; kinds[k][1] += l['qty']; kinds[k][2] += l['lineGBP']
kind_rows = ''.join(row([e(k), (a, 'n'), (b, 'n'), (gbp(c), 'n'), (f"{c / comp * 100:.0f} %", 'n')]) for k, (a, b, c) in kinds.items())
all_rows = ''.join(row([e(l['bomRow']), f"{e(l['description'])}<br><span class=sm>{e(l['manufacturer'])} {e(l['partNumber'])}{' · ' if l['partNumber'] else ''}{e(l['pkg'])}</span>", (l['qty'], 'n'),
                        f"{src_html(l)}<br><span class=sm><i>{e(KIND.get(l['kind'], l['kind']))}{('. ' + e(l['basis'])) if l['basis'] else ''}</i></span>",
                        (f"{l['unitGBP']:.4f}", 'n'), (f"{l['lineGBP']:.2f}", 'n')]) for l in top)
asm_rows = ''.join(row([e(k), (f"<span class=sm>{e(f)}</span>", ''), ({'listed': 'Price list', 'rate': 'Rate book × time', 'station': 'Test station × time'}[t], 'sm'), (gbp(v, 3), 'n')]) for k, (v, f, t) in ASM.items())
asm_rows += row(['Overhead on the rate-book operations', (f"<span class=sm>{I['unquotedOH'] * 100:.0f} % × {gbp(rated, 3)}</span>", ''), ('', ''), (gbp(oh, 3), 'n')])
asm_rows += row(['<b>Assembly, test and coating</b>', ('', ''), ('', ''), (f"<b>{gbp(assembly)}</b>", 'n')], 'tot')
NRE = [('Stencils (2 sides)', 600), ('ICT fixture', 12000), ('Functional / isolation test fixture', 25000), ('Coating program', 1500), ('Staking program', 1000),
       ('Programming set-up', 1500), ('X-ray program', 1000), ('Bare-board E-test / route tooling', 3400)]
assert sum(v for _, v in NRE) == I['nre']
nre_rows = ''.join(row([e(n), (f"£{v:,}", 'n')]) for n, v in NRE) + row(['<b>Tooling and fixtures</b>', (f"<b>£{I['nre']:,}</b>", 'n')], 'tot') + row([f"Per board over {prog:,} boards", (gbp(nre_pb, 4), 'n')])
board_rows = ''.join(row(r) for r in [
 ['China automotive 4–6-layer board ASP (2024)', f"¥{I['aspCny']:,.2f}/m² sold — Chaoying (超颖) prospectus; automotive is its main use"],
 ['Price rise to 2026', f"× {1 + I['aspRise']:.3f} (mid of the +12–17 % rise to Q1 2026)"],
 ['6 layers against the 5-layer anchor', f"× {shape:.4f} (CostVision China table shape: (£{I['base2L']} + 4 × £{I['layerAdd']}) ÷ (£{I['base2L']} + 3 × £{I['layerAdd']}) a dm²)"],
 ['IPC class-3 extras', f"+ ¥{I['class3Cny']}/m² (25 µm hole copper, 4-wire electrical test — PCBasic)"],
 ['2 oz outer copper (70 µm, both outer layers)', f"+ {I['outerCuSteps']} × ¥{I['heavyCuCny']}/m² = ¥{cu:.0f}/m² (Chinese fabricators' heavy-copper adder, ¥25/m² a layer for each ½ oz above 1 oz)"],
 ['Price a m²', f"¥{fab_m2:,.2f}/m² = £{fab_m2 / FX:,.2f}/m²"],
 [('<b>Bare board, 6 layers, tin, 1.6 mm</b>', ''), (f"{m2:.4f} m² × ¥{fab_m2:,.2f} ÷ {FX} = <b>{gbp(fab)}</b>", '')]])
oth_rows = ''.join(row(r) for r in [
 ['Rework', f"{I['fpyRework'] * 100:.0f} % of boards (FPY 97 %) × ({I['reworkMin']} min technician + ICT and functional re-test {I['ictSec'] + I['fctSec']} s)", (gbp(rework, 3), 'n')],
 ['Scrap', f"{I['scrap'] * 100:.1f} % × (components + burden + board + assembly) {gbp(comp + burden + fab + assembly)}", (gbp(scrap, 3), 'n')],
 ['Sea freight', f"({I['boardKg'] * 1000:.0f} g board + {I['packKg'] * 1000:.0f} g packaging) × £{I['seaKg']}/kg", (gbp(freight, 3), 'n')],
 ['UK import duty', f"{I['duty'] * 100:.1f} % × (ex-works + freight) {gbp(exw + freight)} — HS line to be confirmed", (gbp(duty, 3), 'n')]])

# Sensitivities (each re-costed through the same arithmetic)
def at(dcomp=0.0, dfab=0.0, dasm=0.0):
    c2 = comp + dcomp; b2 = c2 * I['burden']; f2 = fab + dfab; a2 = assembly + dasm
    return c2 + b2 + f2 + a2 + rework + I['scrap'] * (c2 + b2 + f2 + a2) + nre_pb
tc = next(l for l in L if l['refDes'] == 'Integrated Circuit 1')
xf = next(l for l in L if l['refDes'] == 'Inductor 2'); xff = xf.get('cnFactor') or 1
s_xf_lo, s_xf_hi = at(dcomp=8 * (0.931 * xff - xf['unitGBP'])), at(dcomp=8 * (1.855 * xff - xf['unitGBP']))
s_sz_lo, s_sz_hi = at(dfab=fab * (0.95 ** 2 - 1), dasm=-ASM['Conformal coating: material'][0] * (1 - 0.95 ** 2)), at(dfab=fab * (1.05 ** 2 - 1), dasm=ASM['Conformal coating: material'][0] * (1.05 ** 2 - 1))

def tool_rows(t): return [t['components'] + t['burden'], t['fab'] + t['fabAuto'], t['smt'] + t['test'] + t['asmAuto'], t['other'], t['exw'], t['freight'] + t['duty'], t['delivered']]
mine = [comp + burden, fab, assembly, quality + nre_pb, exw, freight + duty, delivered]
XL = ['Components with the EMS burden', 'Bare board', 'Assembly, test and coating', 'Quality, packaging and other', '<b>Ex-works China</b>', 'Freight + UK duty', '<b>Delivered UK</b>']
xc_rows = ''.join(row([lab, (gbp(a), 'n'), (gbp(b), 'n'), (gbp(c), 'n')], 'tot' if lab.startswith('<b>') else '') for lab, a, b, c in zip(XL, mine, tool_rows(TC), tool_rows(TG)))

PHOTOS = [('01-top-full.jpg', 'Top side: AURIX TC389 (upper centre), the six gate-driver channels HU/HV/HW and LU/LV/LW, eight XFMRS transformers.'),
          ('02-bottom-full.jpg', 'Bottom side: the four film capacitors and two power resistors (right), gate-driver support parts.'),
          ('03-tc389-marking.jpg', 'The controller: Infineon SAK-TC389QP-160F300S AE (marking read, A2Mac1 record).'),
          ('04-gate-drive-transformers.jpg', 'Gate-drive supply transformers "XFMRS 2539 BMW-8-15T" (8 on the board), silicone-staked.')]
def fig(f, cap, n):
    b = base64.b64encode(open(os.path.join(H, 'photos', f), 'rb').read()).decode()
    return f"<figure><img src='data:image/jpeg;base64,{b}' alt='{e(cap)}'><figcaption><b>Figure {n}.</b> {e(cap)}</figcaption></figure>"
FIGS = "<div class=figs2>" + ''.join(fig(f, c, i + 1) for i, (f, c) in enumerate(PHOTOS)) + "</div>"

CSS = open(os.path.join(H, 'report.css')).read() + ".figs2{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 12px;margin-top:6px}"
HTML = f"""<!doctype html><html><head><meta charset=utf-8><title>BMW rear inverter control board PCBA should-cost</title><style>{CSS}</style></head><body>
<div class=eyebrow>CostVision · PCBA should-cost · 26 November 2026</div>
<h1>BMW rear inverter control board — PCBA should-cost</h1>
<div class=sub>G6-CTRL REV007 · 6-layer FR-4 (70/35/35/35/35/70 µm copper), tin finish, 1.6 mm · about {I['w']} × {I['h']} mm · {n_parts:,} parts on both sides · partial conformal coating</div>
<div class=sub>Built in <b>China</b> · <b>{I['boards']:,} boards a year</b> · <b>{I['years']}-year programme</b> ({prog:,} boards) · resistors and capacitors bought in millions · £ per board; ¥ at {FX} CNY per £</div>
<div class=kpis>
<div class='kpi main'><span>Should-cost, ex-works China</span><b>{gbp(exw)}</b><span>{cny(exw)} a board</span></div>
<div class=kpi><span>Delivered UK, duty paid</span><b>{gbp(delivered)}</b><span>{cny(delivered)} a board</span></div>
<div class=kpi><span>Components</span><b>{gbp(comp + burden)}</b><span>{(comp + burden) / exw * 100:.0f} % of ex-works, with the EMS burden</span></div>
<div class=kpi><span>Programme value, ex-works</span><b>£{exw * prog / 1e6:,.1f} m</b><span>{prog:,} boards</span></div>
</div>

<h2>1. Summary</h2>
{DONUTS}
<table><tr><th>Cost element</th><th class=n>£ a board</th><th class=n>¥ a board</th><th class=n>Share of ex-works</th></tr>{summ}</table>
<div class=box><b>What drives the cost.</b><ul>
<li><b>Components are {(comp + burden) / exw * 100:.0f} % of the ex-works cost</b>: {len(L)} BOM lines, {n_parts:,} parts a board, every identity and quantity from the bill of materials.</li>
<li><b>The six-channel gate drive is the largest group ({gbp(g_gate)})</b>: six UCC5880-Q1 functional-safety isolated drivers ({gbp(grp({'Integrated Circuit 11'}))}), three ADuM4135 ({gbp(grp({'Integrated Circuit 10'}))}), eight isolated-supply transformers ({gbp(grp({'Inductor 2'}))}), eleven TPS7B84-Q1 LDOs ({gbp(grp({'Integrated Circuit 5'}))}).</li>
<li><b>The AURIX TC389 is the largest single part: {gbp(tc['unitGBP'])}</b> — Digi-Key's US$30.30 at 500 × the China-market factor 0.606, carried to 400,000 a year (Infineon's own page shows no price); with the TLF35584 safety supply the controller block is {gbp(g_ctrl)}.</li>
<li><b>The bare board is {gbp(fab)}</b>: {I['w']} × {I['h']} mm, 6 layers with 2 oz outer copper, at the China automotive market price a m².</li>
<li><b>Assembly, test and coating are {gbp(assembly)}</b>; the 3,510 SMT joints at the Chinese list price are {gbp(ASM['SMT assembly, paste, reflow and AOI (both sides)'][0])}.</li></ul></div>
<div class=box><b>The CostVision tool on the same BOM and photos</b> (live run, real server and browser): <b>{gbp(TC['exw'])} ex-works / {gbp(TC['delivered'])} delivered</b> with components at China market prices, {gbp(TG['exw'])} / {gbp(TG['delivered'])} at global distributor prices — {(TC['exw'] / exw - 1) * 100:+.1f} % and {(TG['exw'] / exw - 1) * 100:+.1f} % against this should-cost (§6).</div>
<p class=sm><b>Basis.</b> Populated board, built, tested, coated and packed in China, ex-works; delivered adds sea freight and UK import duty. Prices read 25–26 Nov 2026, ex-VAT. List prices carry the seller's margin; rate-book operations carry {I['unquotedOH'] * 100:.0f} % overhead. The bill of materials and the PCB characteristics are the A2Mac1 record supplied with the request; the board size is measured off the photos (±5 %).</p>

<h2>2. The board</h2>
<div class=cols><div><table>
{row(['Board', 'BMW rear-axle traction-inverter control board, G6-CTRL REV007 5B3AE29-01'])}
{row(['PCB', 'Rigid FR-4, 6 layers, copper 70 / 35 / 35 / 35 / 35 / 70 µm, tin finish, 1.6 mm (A2Mac1)'])}
{row(['Size', f"about {I['w']} × {I['h']} mm (measured off the photo against the TC389's 25 mm body and the SOIC-8 transceivers), irregular outline"])}
{row(['Parts', f"{n_parts:,} in {len(L)} lines from the BOM; {I['joints']:,} SMT joints; {I['thtJoints']} through-hole joints"])}
{row(['Coating', 'Partial (A2Mac1): selective on the top side, about 70 % of its area'])}
</table></div><div><table>
{row(['Volume', f"{I['boards']:,} boards a year, lots of {I['lot']:,} (one a month)"])}
{row(['Programme', f"{I['years']} years, {prog:,} boards"])}
{row(['Build country', 'China (automotive EMS, IATF 16949)'])}
{row(['Passives', 'Resistors and capacitors priced at the millions break (given)'])}
{row(['Currency', f"£; CNY {FX} per £, US$ {USD} per £"])}
</table></div></div>
<h3>What the BOM and the photos say</h3>
<ul class=sm>
<li><b>Controller:</b> Infineon AURIX SAK-TC389QP-160F300S AE (TC38x data sheet, AE step) with the TLF35584 safety power supply. Every TC389QP orderable is the 516-ball LFBGA (25 × 25 mm) — the BOM's package note "LFBGA-292" is the TC387's.</li>
<li><b>Gate drive:</b> six TI UCC5880-Q1 isolated drivers (silkscreen HU, HV, HW, LU, LV, LW), three ADuM4135, eight custom XFMRS transformers ("BMW-8-15T"), two UCC27282 push-pull drivers, eleven TPS7B84-Q1 LDOs, the LM5155 boost controller.</li>
<li><b>Through-hole parts:</b> the two Allegro ACS37601 current sensors (4-pin SIP), four Faratronic MKP Y1 film capacitors and two Bourns PWR221T power resistors — 20 joints, soldered after reflow.</li>
<li><b>Silicone staking</b> on the eight transformers and the four film capacitors (white compound in the photos).</li></ul>
{FIGS}

<h2 class=pb>3. Components — {gbp(comp)} a board, plus {gbp(burden)} EMS burden</h2>
<table><tr><th>Price basis</th><th class=n>Lines</th><th class=n>Parts</th><th class=n>£ a board</th><th class=n>Share</th></tr>{kind_rows}</table>
<h3>The twelve largest lines ({sum(l['lineGBP'] for l in top[:12]) / comp * 100:.0f} % of the components)</h3>
<table><tr><th class=n>#</th><th>BOM row</th><th>Part</th><th>Part number</th><th class=n>Qty</th><th class=n>Unit</th><th class=n>A board</th><th class=n>Share</th></tr>{top_rows}</table>
<h3>How the part prices are set</h3><ul class=sm>
<li><b>Every BOM part with a part number is priced as itself</b> (or its orderable reel / family code where the exact code is not listed, stated on the line). Each line's seller, price, quantity break, date and source page are in §8.</li>
<li><b>Lowest sourced price first:</b> the eight Texas Instruments parts take TI's own store price at 1,000+ (TI.com) and the two onsemi Zeners onsemi's own reference price — both below the distributors' at their largest breaks; two discretes take the China own-stock reel of the same function and grade (szlcsc). The distributor figure stays on each line as a reference.</li>
<li><b>Volume:</b> every price is carried from its break to the parts bought a year (quantity a board × {I['boards']:,}) on P(Q) = P(break) × (Q / break)<sup>−0.0706</sup> (the CostVision catalogue's slope), up to 10,000,000 a year — as given for resistors and capacitors, and at 400,000 boards most other lines are bought in millions too. Holding every non-passive line flat above 300,000 a year (the CostVision catalogue rule) puts components at {gbp(C['componentsFlat300k'])} (+{gbp(C['componentsFlat300k'] - comp)}).</li>
<li><b>China-market factor:</b> the board is built in China, where the EMS buys on the China market. On automotive parts priced both on szlcsc's own stock and at a franchised distributor at the same quantity (25 Nov 2026), China sits at a median <b>0.606</b> of the distributor price for non-TI ICs (15 parts, quartiles 0.36–0.95) and <b>0.429</b> for discretes, magnetics and passives (38 parts, 0.30–0.82); TI parts sit at 0.956 (11 parts), so the TI lines keep TI's own price. The factor is applied only to lines with no China price of their own (stated on each line in §8); an AURIX cross-check agrees — the TC387 at US$14.82 China own stock against US$31.56 authorized (0.47).</li>
<li><b>China reel prices</b> are szlcsc's own-stock whole-reel prices, ex-VAT (page price ÷ 1.13). <b>Capacitor groups</b> 0805 / 1206 are a value mix (judgement): half 100 nF, half 1 µF / 4.7 µF.</li></ul>

<h2>4. Bare board — {gbp(fab)}</h2>
<table><tr><th>Step</th><th>Figure</th></tr>{board_rows}</table>
<p class=sm>The ASP is a price per m² sold, so the board's envelope area is used; panel waste and the tin finish are inside the market price.</p>

<h2>5. Assembly, test and coating — {gbp(assembly)}</h2>
<table><tr><th>Operation</th><th>Arithmetic</th><th>Basis</th><th class=n>£ a board</th></tr>{asm_rows}</table>
<div class=cols><div><h3>Quality, freight and duty</h3><table><tr><th>Item</th><th>Arithmetic</th><th class=n>£ a board</th></tr>{oth_rows}</table></div>
<div><h3>One-off tooling and fixtures</h3><table><tr><th>Item</th><th class=n>£</th></tr>{nre_rows}</table>
<p class=sm>Estimates; spread over the programme. The automotive programme NRE (PPAP, FMEA, validation) is not in the unit cost.</p></div></div>

<h2>6. Cross-check: the CostVision tool, live</h2>
<p>The bill of materials (as a file) and eight photos went through CostVision's PCB screen on a real server and browser, with the board data typed in as an engineer would: China, 400,000 a year, 6 years, 6 layers, 2 oz outer / 1 oz inner copper, 1.6 mm, 210 g, coating on one side, 24 staking dots, programming 60 s, functional test 90 s, first-pass yield 0.97, a lot a month, and the TC389 at £{tc['unitGBP']:.2f}. Two runs: components at China market prices and at global distributor prices; 0 page errors.</p>
<table><tr><th>£ a board</th><th class=n>This should-cost</th><th class=n>Tool, China market</th><th class=n>Tool, global distributors</th></tr>{xc_rows}</table>
<ul class=sm>
<li><b>Components — the main difference.</b> The tool holds every price flat above 300,000 parts a year, prices from distributor listings (its catalogue) or class ranges, and applies no China-market factor to ICs; this should-cost takes the maker's own price where it is published (the eight TI parts, TI.com 1,000+) and carries every line to the parts bought a year — at 400,000 boards most lines are bought in millions. The tool's likely range: {TC['band']} (China market), {TG['band']} (global).</li>
<li><b>Where the tool's class prices differ most:</b> the two PWR221T power resistors and the film capacitors (priced by the tool as chip parts), the PANJIT MOSFETs and TI parts not in its catalogue (priced on IC class ranges) and 1210 capacitors (priced on its 1206 row).</li>
<li><b>Assembly.</b> The tool costs placements at the China line rate, test as station time, coating on the full side and an automotive assembly grade; this should-cost uses the Chinese per-joint list prices and named operation times. The tool has no immersion-tin finish; immersion silver was entered (the market board price does not depend on the finish).</li></ul>

<h2>7. What is not yet confirmed</h2>
<table><tr><th>Item</th><th>Status</th><th>Ex-works if</th></tr>
{row(['China-market factor', f"Interquartile range of the measured China ÷ distributor ratios (non-TI ICs 0.36–0.95, discretes 0.30–0.82); without the factor", (f"{gbp(at(dcomp=C['componentsChinaLow'] - comp))} – {gbp(at(dcomp=C['componentsChinaHigh'] - comp))}; {gbp(at(dcomp=C['componentsNoChinaFactor'] - comp))}", 'n')])}
{row(['TC389 price', "Digi-Key US$30.30 at 500 × 0.606 carried to volume — BMW's contract price may differ", ('', 'n')])}
{row(['Gate-drive transformers', f"Customer part (XFMRS BMW-8-15T), no public price: three catalogued equivalents give £{0.931 * xff:.2f} – £{1.855 * xff:.2f} with the China-market factor", (f"{gbp(s_xf_lo)} – {gbp(s_xf_hi)}", 'n')])}
{row(['Volume rule', 'Non-passive lines held flat above 300,000 a year (CostVision catalogue rule) instead of carried to the parts bought', (gbp(at(dcomp=C['componentsFlat300k'] - comp)), 'n')])}
{row(['Board size', 'Measured off a photo (±5 %): board and coating', (f"{gbp(s_sz_lo)} – {gbp(s_sz_hi)}", 'n')])}
{row(['Unnamed BOM groups', '437 capacitors, 551 resistors, 69 diodes, 37 transistors: case sizes read off the photos, values not in the BOM', ('', 'n')])}
{row(['Parts without a page price', 'ACS37601 (sample-only: priced as ACS37612), XEL4030V (as XEL4030), Faratronic film capacitor (LCSC snapshot)', ('', 'n')])}
{row(['Test plan', 'ICT 40 s, programming 60 s, functional and isolation test 90 s — estimates', ('', 'n')])}
{row(['Import duty', '3.7 % assumed; HS line not confirmed', ('', 'n')])}
</table>
<p><b>Ask the supplier for:</b> contract prices for the TC389, UCC5880-Q1, ADuM4135 and the XFMRS transformers; the Gerber outline (size); the test plan; the coating specification. Accuracy is not measured: no costing has been compared with a price paid for this board.</p>

<h2>8. Parts list with price sources</h2>
<p class=sm>Largest line first. Each link opens the seller's page for the part priced; prices as read on the date shown.</p>
<table class=parts><colgroup><col style='width:10%'><col style='width:28%'><col style='width:5%'><col style='width:43%'><col style='width:7%'><col style='width:7%'></colgroup>
<tr><th>BOM row</th><th>Part on the board</th><th class=n>Qty</th><th>Part priced, seller's price and source</th><th class=n>Unit £</th><th class=n>Line £</th></tr>{all_rows}
{row(['', '<b>Components a board</b>', (f"<b>{n_parts:,}</b>", 'n'), '', '', (f"<b>{comp:.2f}</b>", 'n')], 'tot')}</table>
</body></html>"""
open(os.path.join(OUT, 'report.html'), 'w').write(HTML)

wb = load_workbook(os.path.join(H, 'manual-costing.xlsx'))
ws = wb.create_sheet('Tool cross-check'); hdr = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='1F4E5A')
for i, (c, w) in enumerate([('£ a board', 40), ('This should-cost', 16), ('Tool, China market', 18), ('Tool, global distributors', 22)], 1):
    x = ws.cell(1, i, c); x.font = hdr; x.fill = fill; ws.column_dimensions[get_column_letter(i)].width = w
for r, (lab, a, b, c) in enumerate(zip(XL, mine, tool_rows(TC), tool_rows(TG)), 2):
    ws.cell(r, 1, re.sub('<[^>]+>', '', lab)); ws.cell(r, 2, round(a, 4)); ws.cell(r, 3, b); ws.cell(r, 4, c)
    for j in (2, 3, 4): ws.cell(r, j).number_format = '£0.00'
ws.cell(10, 1, 'Tool: CostVision live run 26 Nov 2026 (PCB screen, real server and browser, the BOM as a file); this should-cost: Summary sheet.')
wb.save(os.path.join(OUT, 'bmw-rear-inverter-pcb-should-cost.xlsx'))
print(f"ex-works {gbp(exw, 4)} delivered {gbp(delivered, 4)} | tool China {gbp(TC['exw'])}/{gbp(TC['delivered'])} global {gbp(TG['exw'])}/{gbp(TG['delivered'])}")

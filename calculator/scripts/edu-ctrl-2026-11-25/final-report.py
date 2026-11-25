#!/usr/bin/env python3
"""EDU control board PCBA — FINAL should-cost report (clean: no version history, no tool changelog).

Reads the final manual costing (manual.json written by manual.py) and re-computes every figure from its inputs; each
total is asserted against manual.json to 1p before anything is printed. Writes final-report.html (printed to PDF by
report-pdf.mjs) and a clean workbook with live formulas.

Usage: python3 final-report.py <manual.json> <out-dir> [<tool-global-reprice.json> <tool-china-reprice.json>]
"""
import json, os, re, sys, html, base64
from collections import OrderedDict

M = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
TG = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None
TC = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
I = {k: d['v'] for k, d in M['inputs'].items()}; C = M['computed']; L = M['lines']
FX = I['fx']; USD = I['usd']
e = lambda s: html.escape(str(s))
def gbp(x, d=2): return ('−' if x < 0 else '') + f"£{abs(x):,.{d}f}"
def cny(x): return f"¥{x * FX:,.2f}"

# ── 1. re-compute from the inputs (independent of manual.py's own arithmetic) ─────────────────────────────────────────────
area_cm2 = I['w'] * I['h'] / 100; m2 = I['w'] * I['h'] / 1e6
comp = sum(l['qty'] * l['unitGBP'] for l in L)
burden = comp * I['burden']
asp_shape = C['aspShape']
fab_m2_cny = I['aspCny'] * (1 + I['aspRise']) * asp_shape + I['class3Cny']
fab = m2 * fab_m2_cny / FX
op, tech = I['opRate'], I['techRate']
ASM = OrderedDict([
    ('SMT assembly, paste and AOI', (I['joints'] * I['smtUsdJ'] / USD, f"{I['joints']:,} SMT joints × US${I['smtUsdJ']} ÷ {USD} (JLCPCB price list, > 100,000 joints an order; paste and AOI included)", 'listed')),
    ('Through-hole soldering', (I['thtJoints'] * I['thtUsdJ'] / USD, f"{I['thtJoints']} joints × US${I['thtUsdJ']} ÷ {USD} (JLCPCB price list)", 'listed')),
    ('X-ray, 2 BGA', (I['xrayComps'] * I['xrayUsdC'] / USD, f"{I['xrayComps']} components × US${I['xrayUsdC']} ÷ {USD} (JLCPCB price list, 1,001–3,000 tier)", 'listed')),
    ('Depanel', (I['depanelGBP'], f"¥0.50 a board ÷ {FX} (Huaqiu price list)", 'listed')),
    ('Packaging (ESD bag + divider)', (I['pack'], f"¥1 bag + ¥0.002/cm² × {area_cm2:,.0f} cm² ÷ {FX} (JLC price list)", 'listed')),
    ('Press-fit (3 connectors, 2 nuts)', (I['pressParts'] * I['pressSec'] / 3600 * (I['pressRate'] + op), f"{I['pressParts']} × {I['pressSec']} s × (£{I['pressRate']} press + £{op:.2f} operator)/h", 'rate')),
    ('Conformal coating, both sides', (I['coatSides'] * area_cm2 * I['coatRate'], f"{I['coatSides']} sides × {area_cm2:,.2f} cm² × £{I['coatRate']}/cm²", 'rate')),
    ('Coating masking + UV inspection', ((I['maskSec'] + I['uvSec']) / 3600 * op, f"({I['maskSec']} + {I['uvSec']}) s × £{op:.2f}/h", 'rate')),
    ('Staking (silicone)', (I['stakeSec'] / 3600 * op + I['stakeMat'], f"{I['stakeSec']} s × £{op:.2f}/h + £{I['stakeMat']} silicone", 'rate')),
    ('In-circuit test (ICT)', (I['ictSec'] / 3600 * (I['ict'] + op), f"{I['ictSec']} s × (£{I['ict']:.2f} tester + £{op:.2f} operator)/h", 'rate')),
    ('Programming (2 MCU + EEPROM)', (I['progSec'] / 3600 * (I['progRate'] + op), f"{I['progSec']} s × (£{I['progRate']} programmer + £{op:.2f} operator)/h", 'rate')),
    ('Functional + HV insulation test', (I['fctSec'] / 3600 * (I['ict'] + tech), f"{I['fctSec']} s × (£{I['ict']:.2f} tester + £{tech:.2f} technician)/h", 'rate')),
    ('Final inspection + serial label', (I['finalSec'] / 3600 * op + I['label'], f"{I['finalSec']} s × £{op:.2f}/h + £{I['label']} label", 'rate')),
])
listed = sum(v[0] for v in ASM.values() if v[2] == 'listed'); rated = sum(v[0] for v in ASM.values() if v[2] == 'rate')
oh = rated * I['unquotedOH']; setup = I['setupAllow']
assembly = listed + rated + oh + setup
rework = I['fpyRework'] * (I['reworkMin'] / 60 * tech + (I['ictSec'] + I['fctSec']) / 3600 * (I['ict'] + tech))
scrap = I['scrap'] * (comp + burden + fab + assembly)
quality = rework + scrap
prog = I['boards'] * I['years']
nre_pb = I['nre'] / prog
exw = comp + burden + fab + assembly + quality + nre_pb
freight = (I['boardKg'] + I['packKg']) * I['seaKg']
duty = (exw + freight) * I['duty']
delivered = exw + freight + duty
auto_nre_pb = I['autoNre'] / prog
full_econ = exw + auto_nre_pb

def same(a, b, what):
    assert abs(a - b) < 0.006, (what, a, b)
for a, b, w in [(comp, C['components'], 'components'), (burden, C['burdenGBP'], 'burden'), (fab, C['fab'], 'bare board'), (listed, C['listedGBP'], 'listed ops'),
                (rated, C['unquotedGBP'], 'rate-book ops'), (oh, C['sgaGBP'], 'overhead'), (assembly, C['conversionOHP'], 'assembly'), (rework, C['rework'], 'rework'),
                (scrap, C['scrapGBP'], 'scrap'), (nre_pb, C['nrePerBoard'], 'NRE'), (exw, C['exWorks'], 'ex-works'), (freight, C['freight'], 'freight'),
                (duty, C['dutyGBP'], 'duty'), (delivered, C['delivered'], 'delivered'), (full_econ, C['fullEconomic'], 'full-economic')]:
    same(a, b, w)
for k, (v, _, _) in ASM.items():
    pass

# ── 2. clean text: no version history, no tool changelog ────────────────────────────────────────────────────────────────
NOTE_OVERRIDE = {
    'AURIX pair': "Read 25 Nov 2026: authorised list ceiling US$31.56 at 1,000 (Infineon shop / Digi-Key, one reel); China distributor own stock US$14.82 at 100+ (LCSC) and ¥79.38 ex-VAT (szlcsc) — a market floor, not a traceable Tier-1 channel. Infineon guides automotive annual pricing to low single-digit declines. Range US$15–21 for a 20,000-a-year buyer; point US$17 = £13.40. Not a contract price.",
    'DC-DC group': "Not identified: the nearest automotive analogue (TI LMR33630-Q1) is made only as a 12-pin VQFN-HR and the board shows a QFN-16. Priced at the median of its AEC-Q class (DC-DC converter, QFN; catalogue p10–p90 of 52 parts) until the part is read.",
    'U35, U36': "Not identified: the nearest automotive analogue (TI ISO7741-Q1) is a wide SOIC-16 and the board shows a TSSOP-20. Priced at the median of its AEC-Q class (interface transceiver; catalogue p10–p90 of 55 parts) until the part is read.",
    'U8, U61': "TI.com US$2.687 at 1,000 = £2.12 (AMC1311BQDWVRQ1), the lower of the franchise price and the China reel price (£3.29).",
    'U39, U40': "Newark US$3.99 / 3.90 / 3.82 at 1,000 / 2,500 / 5,000; Digi-Key US$4.12 at 2,500 — US$3.90 ÷ 1.27 = £3.07. Identity (TLF35584) taken from the silkscreen, not read off the chip.",
}
CJK = re.compile(r'[　-〿一-鿿＀-￯]+')
def clean_note(ref, s):
    if ref in NOTE_OVERRIDE: return NOTE_OVERRIDE[ref]
    s = re.sub(r'\(\s*\)', '', CJK.sub('', s))
    s = re.sub(r';\s*was £[0-9.]+', '', s)
    s = re.sub(r'\s*(—\s*|;\s*)?replaces an engineering estimate( \(higher\))?', '', s)
    s = s.replace('an automotive part may be dearer', 'an automotive-grade part may cost more')
    s = s.replace("the tool's class point", 'the median price point of its part class (AEC-Q catalogue p10–p90)')
    s = re.sub(r'\s*\(AEC-Q catalogue p10–p90\) \(([^)]*) catalogue p10–p90 of (\d+) AEC-Q parts\)', r' (\1, \2 AEC-Q parts)', s)
    s = s.replace('China volume (szlcsc own stock', 'China distributor reel price (szlcsc own stock').replace('£', '£')
    s = re.sub(r'\s{2,}', ' ', s).strip(' ;')
    return s
def clean_basis(s):
    s = re.sub(r'^v\d+:\s*', '', s)
    s = re.sub(r'\bEST\b', 'estimated', s); s = re.sub(r'\bCOUNTED\b', 'counted', s); s = re.sub(r'\bREAD\b', 'read', s)
    s = re.sub(r'\s*\(v1 [^)]*\)', '', s)
    s = re.sub(r'\s*—\s*\d+ in all$', lambda m: m.group(0), s)
    return s.strip()
KIND_OVERRIDE = {'DC-DC group': 'class point', 'U35, U36': 'class point'}
KIND = {'market (page-read)': 'Market price, read on the page', 'catalogue analogue': 'Catalogue price, named typical part',
        'class point': 'Class median (part not identified)', 'engineering estimate': 'Engineering estimate'}
for l in L:
    l['note'] = clean_note(l['refDes'], l.get('priceNote', '')); l['why'] = clean_basis(l.get('basis', '')); l['kind'] = KIND[KIND_OVERRIDE.get(l['refDes'], l['priceKind'])]

def category(l):
    r, d = l['refDes'].lower(), l['description'].lower()
    if any(w in d for w in ('connector', 'header', 'terminal')) or re.match(r'^j\d', r): return 'Connectors'
    if any(w in d for w in ('inductor', 'choke', 'transformer', 'ferrite', 'bead')) or re.match(r'^(l|t)\d', r) or 'uh' in r or 'choke' in r or 'inductor' in r: return 'Magnetics'
    if any(w in r for w in ('r ', 'r0', 'bus-discharge', 'ntc', 'ptc')) or any(w in d for w in ('resistor', 'thermistor')): return 'Resistors'
    if re.match(r'^c ', r) or any(w in d for w in ('capacitor', 'mlcc')) or 'uf' in r: return 'Capacitors'
    if any(w in r for w in ('q ', 'd ', 'z', 'tvs', 'led', 'diode', 'zener')) or any(w in d for w in ('diode', 'transistor', 'mosfet', 'tvs', 'zener', 'led')): return 'Discretes'
    if any(w in d for w in ('test point', 'test loop', 'fuse', 'crystal', 'oscillator', 'nut', 'shield')) or r.startswith('tp'): return 'Other'
    return 'Integrated circuits'
for l in L: l['cat'] = category(l)

HIST = re.compile(r'\bwas £|\bv[1-6]\b|\baudit\b|re-?verif|\breplace[sd]\b|\bprevious|\bearlier\b|\bthe tool\b|\bunchanged\b|\bcorrected\b|\brecount|our re-read', re.I)
for l in L:
    for f in ('note', 'why', 'description'):
        assert not HIST.search(l[f]), (l['refDes'], f, l[f])

# ── 3. inputs and their basis (only what the final figure uses) ─────────────────────────────────────────────────────────
INP = [
    ('Programme', [('boards', 'Annual volume', 'boards / year'), ('years', 'Programme life', 'years')]),
    ('Board', [('w', 'Width', 'mm'), ('h', 'Height', 'mm'), ('layers', 'Layer count', 'layers'), ('vias', 'Through vias', 'vias'), ('boardKg', 'Populated weight', 'kg')]),
    ('Currency', [('fx', 'CNY per £', ''), ('usd', 'US$ per £', '')]),
    ('Components', [('burden', 'EMS material burden', 'of components')]),
    ('Bare board', [('aspCny', 'Automotive 4–6-layer ASP (2024)', '¥ / m²'), ('aspRise', 'Price rise to 2026', ''), ('class3Cny', 'IPC class-3 extras', '¥ / m²'), ('panelW', 'Production panel width', 'mm'), ('panelH', 'Production panel height', 'mm'), ('upPerPanel', 'Boards a panel', '')]),
    ('Assembly reading', [('joints', 'SMT joints', ''), ('placements', 'SMT placements', ''), ('thtJoints', 'Through-hole joints', ''), ('pressParts', 'Press-fit parts', ''), ('xrayComps', 'BGA components', ''), ('coatSides', 'Coated sides', '')]),
    ('Rates', [('opRate', 'Assembly operator', '£ / h'), ('techRate', 'Technician', '£ / h'), ('ict', 'ICT / functional tester', '£ / h'), ('pressRate', 'Press-fit cell', '£ / h'), ('progRate', 'Programming station', '£ / h'), ('coatRate', 'Conformal coating', '£ / cm²'), ('smtUsdJ', 'SMT joint', 'US$'), ('thtUsdJ', 'Through-hole joint', 'US$'), ('xrayUsdC', 'X-ray a component', 'US$')]),
    ('Times', [('pressSec', 'Press-fit a part', 's'), ('maskSec', 'Coating masking', 's'), ('uvSec', 'UV inspection', 's'), ('stakeSec', 'Staking', 's'), ('ictSec', 'ICT', 's'), ('progSec', 'Programming', 's'), ('fctSec', 'Functional + HV test', 's'), ('finalSec', 'Final inspection', 's')]),
    ('Overhead and quality', [('unquotedOH', 'Overhead on rate-book operations', ''), ('setupAllow', 'Set-up / handling allowance', '£ / board'), ('fpyRework', 'Boards reworked (FPY 97 %)', ''), ('reworkMin', 'Rework a failed board', 'min'), ('scrap', 'Boards scrapped', '')]),
    ('One-off and logistics', [('nre', 'Tooling and fixtures', '£ one-off'), ('autoNre', 'Automotive programme NRE', '£ one-off'), ('packKg', 'Packaging weight a board', 'kg'), ('seaKg', 'Sea freight China → UK', '£ / kg'), ('duty', 'UK import duty', 'of CIF value')]),
]
BASIS_OVERRIDE = {
    'burden': 'EMS material burden at 10,000 boards a year (cost-plus EMS practice: 10 % at 1k, 7 % at 10k, 5 % at 100k+ boards)',
    'aspCny': 'Chaoying 4–6-layer automotive PCB ASP, 2024 prospectus; × 1.145 rise to 2026 × 1.2187 for 6 v 5 layers — https://pdf.dfcfw.com/pdf/H2_AN202503311649612309_1.pdf',
    'aspRise': 'Mid of the +12–17 % automotive PCB price rise to Q1 2026 (Sina Finance, 17 Sep 2026) — https://finance.sina.com.cn/tech/roll/2026-09-17/doc-inisayan9407392.shtml',
    'xrayUsdC': 'JLCPCB X-ray US$0.16 a component at 1,001–3,000 — the tier a 1,000-board lot (2,000 BGAs) reaches — https://jlcpcb.com/help/article/pcb-assembly-price',
    'unquotedOH': 'Operations priced from rate-book time × rate carry 10 % overhead; listed prices are selling prices and already carry the seller\'s margin, so nothing is added on them',
    'setupAllow': 'Set-up and handling on the listed operations (engineering estimate)',
    'autoNre': 'PPAP, FMEA, DV / PV validation and audits — in the full-economic figure, not the unit cost (engineering estimate)',
    'ictSec': 'Engineering estimate',
    'depanelGBP': 'Huaqiu price list ¥0.50 a board — https://smt.hqchip.com/online/valuation.html',
    'placements': 'Read off the 22 photos: SMT parts on both sides',
    'joints': 'Read off the 22 photos: every SMD pad (2 a passive, BGA balls, IC pins) — the unit the Chinese price lists use',
}
CLS = {'given': 'Given', 'estimate': 'Estimate', 'table': 'Rate table', 'rate book': 'Rate book', 'market': 'Market (sourced)', 'reading': 'Photo reading', 'tool': 'Estimate'}
def basis_of(k):
    b = BASIS_OVERRIDE.get(k, M['inputs'][k].get('basis', ''))
    b = b.replace('User: ', 'Given: ').replace('Reading: ', 'Read off the photos: ')
    assert not HIST.search(b), (k, b)
    return b
def fmt_v(k, v):
    if isinstance(v, float) and v < 1 and k not in ('boardKg', 'packKg', 'seaKg', 'coatRate', 'smtUsdJ', 'thtUsdJ', 'xrayUsdC', 'setupAllow'): return f"{v * 100:g} %"
    return f"{v:,}" if isinstance(v, int) else f"{v:,.6g}"

# ── 4. tool cross-check (current run only) ────────────────────────────────────────────────────────────────────────────
def tool_exw(t):
    sb = t['selectedCountryBreakdown']; return sb['totalPerBoard'] - sb['logisticsPerBoard'], sb['totalPerBoard']
XC = None
if TG and TC:
    gx, gd = tool_exw(TG); cx, cd = tool_exw(TC); XC = dict(gx=gx, gd=gd, cx=cx, cd=cd)

# ── 5. summary figures ─────────────────────────────────────────────────────────────────────────────────────────────────
STACK = [('Components', comp, '#1f4e79'), ('EMS material burden (7 %)', burden, '#5b8cc0'), ('Bare board (automotive, 6-layer)', fab, '#6b8e23'),
         ('Assembly, test and coating', assembly, '#c0702f'), ('Cost of quality (rework, scrap)', quality, '#d9a46e'), ('Tooling and fixtures ÷ programme', nre_pb, '#7d5ba6')]
aur = next(l for l in L if l['refDes'] == 'AURIX pair')
aur_lo, aur_hi = 15 / USD, 21 / USD
s_aur_lo = (aur_lo - aur['unitGBP']) * aur['qty'] * (1 + I['burden']); s_aur_hi = (aur_hi - aur['unitGBP']) * aur['qty'] * (1 + I['burden'])
cats = OrderedDict()
for l in sorted(L, key=lambda l: -l['qty'] * l['unitGBP']):
    c = cats.setdefault(l['cat'], [0, 0, 0.0]); c[0] += 1; c[1] += l['qty']; c[2] += l['qty'] * l['unitGBP']
kinds = OrderedDict()
for k in KIND.values(): kinds[k] = [0, 0, 0.0]
for l in L: v = kinds[l['kind']]; v[0] += 1; v[1] += l['qty']; v[2] += l['qty'] * l['unitGBP']
n_parts = sum(l['qty'] for l in L)
top10 = sorted(L, key=lambda l: -l['qty'] * l['unitGBP'])[:10]
top10_share = sum(l['qty'] * l['unitGBP'] for l in top10) / comp

# ── 6. HTML ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def short(t, n):
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0].rstrip(',;(') + ' …'
def row(cells, cls=''):
    return f"<tr class='{cls}'>" + ''.join(f"<td class='{c[1] if isinstance(c, tuple) else ''}'>{c[0] if isinstance(c, tuple) else c}</td>" for c in cells) + '</tr>'
bar = ''.join(f"<span style='width:{v / exw * 100:.3f}%;background:{col}' title='{e(n)} {gbp(v)}'></span>" for n, v, col in STACK)
legend = ''.join(f"<span><i style='background:{col}'></i>{e(n)} <b>{v / exw * 100:.1f} %</b></span>" for n, v, col in STACK)
summ = ''.join(row([e(n), (gbp(v), 'n'), (cny(v), 'n'), (f"{v / exw * 100:.1f} %", 'n')]) for n, v, _ in STACK)
summ += row(['<b>Ex-works China</b>', (f"<b>{gbp(exw)}</b>", 'n'), (f"<b>{cny(exw)}</b>", 'n'), ('100.0 %', 'n')], 'tot')
summ += row(['Sea freight to the UK', (gbp(freight), 'n'), (cny(freight), 'n'), ('', 'n')])
summ += row([f"UK import duty {I['duty'] * 100:.1f} % (on ex-works + freight)", (gbp(duty), 'n'), (cny(duty), 'n'), ('', 'n')])
summ += row(['<b>Delivered UK, duty paid</b>', (f"<b>{gbp(delivered)}</b>", 'n'), (f"<b>{cny(delivered)}</b>", 'n'), ('', 'n')], 'tot')

cat_rows = ''.join(row([e(k), (v[0], 'n'), (f"{v[1]:,}", 'n'), (gbp(v[2]), 'n'), (f"{v[2] / comp * 100:.1f} %", 'n')]) for k, v in cats.items())
cat_rows += row(['<b>Components</b>', (f"<b>{len(L)}</b>", 'n'), (f"<b>{n_parts:,}</b>", 'n'), (f"<b>{gbp(comp)}</b>", 'n'), ('<b>100 %</b>', 'n')], 'tot')
kind_rows = ''.join(row([e(k), (v[0], 'n'), (f"{v[1]:,}", 'n'), (gbp(v[2]), 'n'), (f"{v[2] / comp * 100:.1f} %", 'n')]) for k, v in kinds.items() if v[0])
top_rows = ''.join(row([(i + 1, 'n'), e(l['refDes']), e(short(l['description'], 64)), e(l['pkg']), (l['qty'], 'n'), (f"{l['unitGBP']:.4f}", 'n'), (gbp(l['qty'] * l['unitGBP']), 'n'), (f"<span class=sm>{e(l['kind'])}</span>", '')]) for i, l in enumerate(top10))

fab_rows = ''.join(row(r) for r in [
    ['Board area', f"{I['w']} × {I['h']} mm = {m2:.6f} m²", ('', 'n')],
    ['Automotive 4–6-layer ASP, 2024', f"¥{I['aspCny']:,}/m² sold (Chaoying prospectus; 68.6 % of its sales automotive)", ('', 'n')],
    ['Price rise to 2026', f"× {1 + I['aspRise']:.3f} (mid of +12–17 %)", ('', 'n')],
    ['6 layers against the 5-layer mix', f"× {asp_shape:.4f} (China PCB table's layer shape)", ('', 'n')],
    ['IPC class-3 extras', f"+ ¥{I['class3Cny']}/m² (25 µm hole copper, 4-wire electrical test)", ('', 'n')],
    ['Price a m²', f"¥{fab_m2_cny:,.2f}/m² = £{fab_m2_cny / FX:,.2f}/m²", ('', 'n')],
    [('<b>Bare board, automotive grade</b>', ''), f"{m2:.6f} m² × ¥{fab_m2_cny:,.2f} ÷ {FX}", (f"<b>{gbp(fab)}</b>", 'n')]])

asm_rows = ''.join(row([e(k), (f"<span class=sm>{e(f)}</span>", ''), ('Price list' if t == 'listed' else 'Rate book × time', 'sm'), (gbp(v, 3), 'n')]) for k, (v, f, t) in ASM.items())
asm_rows += row(['Overhead on rate-book operations', (f"<span class=sm>{I['unquotedOH'] * 100:.0f} % × {gbp(rated, 3)}</span>", ''), ('', ''), (gbp(oh, 3), 'n')])
asm_rows += row(['Set-up / handling allowance', (f"<span class=sm>on the listed operations</span>", ''), ('', ''), (gbp(setup, 3), 'n')])
asm_rows += row(['<b>Assembly, test and coating</b>', ('', ''), ('', ''), (f"<b>{gbp(assembly)}</b>", 'n')], 'tot')

NRE_ITEMS = [('Stencils', 700), ('ICT fixture', 7000), ('Functional / EOL test fixture', 15000), ('Press-fit tooling', 3000), ('Selective-solder pallets', 2000),
             ('Coating masks', 1500), ('AOI, X-ray and programming set-up', 1000), ('Bare-board tooling', 1200)]
assert sum(v for _, v in NRE_ITEMS) == I['nre']
nre_rows = ''.join(row([e(n), (f"£{v:,}", 'n')]) for n, v in NRE_ITEMS) + row(['<b>Tooling and fixtures</b>', (f"<b>£{I['nre']:,}</b>", 'n')], 'tot')
nre_rows += row([f"Per board over the programme ({prog:,} boards)", (gbp(nre_pb), 'n')])

oth_rows = ''.join(row(r) for r in [
    ['Rework', f"{I['fpyRework'] * 100:.0f} % of boards (FPY 97 %) × ({I['reworkMin']} min technician + ICT and functional re-test {I['ictSec'] + I['fctSec']} s)", (gbp(rework, 3), 'n')],
    ['Scrap', f"{I['scrap'] * 100:.1f} % × (components + burden + board + assembly) {gbp(comp + burden + fab + assembly)}", (gbp(scrap, 3), 'n')],
    [('<b>Cost of quality</b>', ''), '', (f"<b>{gbp(quality)}</b>", 'n')],
    ['Sea freight', f"({I['boardKg']} kg board + {I['packKg']} kg packaging) × £{I['seaKg']}/kg", (gbp(freight, 3), 'n')],
    ['UK import duty', f"{I['duty'] * 100:.1f} % × (ex-works + freight) {gbp(exw + freight)} — HS line to be confirmed", (gbp(duty, 3), 'n')],
    ['Automotive programme NRE (not in the unit cost)', f"£{I['autoNre']:,} ÷ {prog:,} boards — full-economic {gbp(full_econ)} ex-works", (gbp(auto_nre_pb, 3), 'n')]])

inp_rows = ''
for grp, items in INP:
    inp_rows += f"<tr class=grp><td colspan=4>{e(grp)}</td></tr>"
    for k, lab, unit in items:
        d = M['inputs'][k]
        inp_rows += row([e(lab), (f"{fmt_v(k, d['v'])} <span class=sm>{e(unit)}</span>", 'n'), (CLS.get(d.get('cls'), d.get('cls', '')), 'sm'), (f"<span class=sm>{e(basis_of(k))}</span>", '')])

all_rows = ''.join(row([e(l['refDes']), e(l['description']), e(l['pkg']), (l['qty'], 'n'), (f"{l['unitGBP']:.4f}", 'n'), (f"{l['qty'] * l['unitGBP']:.2f}", 'n'),
                        (f"<span class=sm><b>{e(l['kind'])}.</b> {e(l['note'])}{(' · <i>Quantity: ' + e(l['why']) + '</i>') if l['why'] else ''}</span>", '')])
                   for l in sorted(L, key=lambda l: (list(cats).index(l['cat']), -l['qty'] * l['unitGBP'])))

xc_html = ''
if XC:
    xc_html = f"""<h3>Cross-check: CostVision PCB tool on the same photos and inputs</h3>
<table><tr><th>Basis</th><th class=n>Ex-works China</th><th class=n>Delivered UK</th><th class=n>Against this should-cost</th></tr>
{row(['This should-cost (named parts, China distributor reel prices)', (gbp(exw), 'n'), (gbp(delivered), 'n'), ('—', 'n')], 'tot')}
{row(['Tool, components at China market prices', (gbp(XC['cx']), 'n'), (gbp(XC['cd']), 'n'), (f"{(XC['cx'] / exw - 1) * 100:+.1f} %", 'n')])}
{row(['Tool, components at global distributor prices', (gbp(XC['gx']), 'n'), (gbp(XC['gd']), 'n'), (f"{(XC['gx'] / exw - 1) * 100:+.1f} %", 'n')])}</table>
<p>On the same China-market basis the CostVision tool lands {(XC['cx'] / exw - 1) * 100:.1f} % above this should-cost; the difference is the parts no photo identifies, which it prices inside class ranges. At global distributor prices (the price a buyer without a China supply chain sees) the board is {gbp(XC['gx'])} ex-works — the upper bound for the negotiation.</p>"""

# Board photos (CV_PHOTOS: JSON list of {"path", "caption"}; JPEGs, embedded so the report is one file)
PHOTOS = json.loads(os.environ.get('CV_PHOTOS', '[]'))
def _fig(ph, n):
    b64 = base64.b64encode(open(ph['path'], 'rb').read()).decode()
    return f"<figure><img src='data:image/jpeg;base64,{b64}' alt='{e(ph['caption'])}'><figcaption><b>Figure {n}.</b> {e(ph['caption'])}</figcaption></figure>"
FIGS = ("<h3>The board</h3><div class=figs>" + ''.join(_fig(ph, i + 1) for i, ph in enumerate(PHOTOS)) + "</div>") if PHOTOS else ''

CSS = """
body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.6pt;color:#1b2430;line-height:1.42;margin:0}
h1{font-size:19pt;margin:0 0 4px;color:#12324f;letter-spacing:-.2px}
h2{font-size:12.5pt;color:#12324f;border-bottom:1.5px solid #12324f;padding-bottom:3px;margin:20px 0 8px}
h3{font-size:10.2pt;color:#12324f;margin:14px 0 6px}
p{margin:6px 0}
.sub{color:#4a5868;font-size:9.4pt}
.eyebrow{font-size:8pt;letter-spacing:.8px;text-transform:uppercase;color:#6b7785;margin-bottom:6px}
table{border-collapse:collapse;width:100%;margin:6px 0 4px;font-size:8.6pt}
th{background:#12324f;color:#fff;text-align:left;font-weight:600;padding:4px 6px}
td{border-bottom:1px solid #dde3ea;padding:3px 6px;vertical-align:top}
td.n,th.n{text-align:right;white-space:nowrap}
tr.tot td{background:#eef3f8;border-top:1px solid #12324f}
tr.grp td{background:#f4f6f8;font-weight:600;color:#12324f}
.sm{font-size:7.6pt;color:#4a5868}
.kpis{display:flex;gap:8px;margin:12px 0}
.kpi{flex:1;border:1px solid #c9d4df;border-radius:4px;padding:8px 10px}
.kpi span{display:block;font-size:7.8pt;color:#4a5868}
.kpi b{display:block;font-size:17pt;color:#12324f;margin:2px 0}
.kpi.main{border:2px solid #12324f;background:#f3f7fb}
.bar{display:flex;height:16px;border-radius:3px;overflow:hidden;margin:8px 0 4px}
.bar span{display:block;height:100%}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:7.8pt;color:#4a5868}
.legend i{display:inline-block;width:9px;height:9px;margin-right:4px;vertical-align:-1px}
.box{border:1px solid #c9d4df;background:#f7f9fb;border-radius:4px;padding:8px 12px;margin:10px 0}
ul{margin:4px 0 4px 18px;padding:0} li{margin:2px 0}
.pb{page-break-before:always}
h2,h3{break-after:avoid;page-break-after:avoid} tr{break-inside:avoid;page-break-inside:avoid} .box,.kpis{break-inside:avoid}
table.parts{table-layout:fixed} table.parts td{word-wrap:break-word}
.cols{display:flex;gap:16px}.cols>div{flex:1;min-width:0}
.figs{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:4px}
figure{margin:0;break-inside:avoid}
figure img{width:100%;height:auto;display:block;border:1px solid #c9d4df;border-radius:3px}
figcaption{font-size:7.6pt;color:#4a5868;margin-top:3px;line-height:1.35}
"""

HTML = f"""<!doctype html><html><head><meta charset=utf-8><title>EDU control board PCBA should-cost</title><style>{CSS}</style></head><body>
<div class=eyebrow>CostVision · PCBA should-cost · 25 November 2026</div>
<h1>EDU control board PCBA — should-cost</h1>
<div class=sub>Dana TM4 Gemini CTRL board, PC-10465018-D · {I['w']} × {I['h']} mm · {I['layers']}-layer (estimated) · {I['boardKg'] * 1000:.0f} g populated · conformal coating on both sides</div>
<div class=sub>Built in <b>China</b> · <b>{I['boards']:,} boards a year</b> · <b>{I['years']}-year programme</b> ({prog:,} boards) · £ per board; ¥ at {FX} CNY per £</div>

<div class=kpis>
<div class='kpi main'><span>Should-cost, ex-works China</span><b>{gbp(exw)}</b><span>{cny(exw)} a board</span></div>
<div class=kpi><span>Delivered UK, duty paid</span><b>{gbp(delivered)}</b><span>{cny(delivered)} a board</span></div>
<div class=kpi><span>Full-economic, ex-works</span><b>{gbp(full_econ)}</b><span>with £{I['autoNre']:,} automotive programme NRE</span></div>
<div class=kpi><span>Programme value, ex-works</span><b>£{exw * prog / 1e6:,.2f} m</b><span>{prog:,} boards</span></div>
</div>

<h2>1. Summary</h2>
<div class=bar>{bar}</div><div class=legend>{legend}</div>
<table><tr><th>Cost element</th><th class=n>£ a board</th><th class=n>¥ a board</th><th class=n>Share of ex-works</th></tr>{summ}</table>
<div class=box><b>What drives the cost.</b>
<ul><li><b>Components are {(comp + burden) / exw * 100:.0f} % of the ex-works cost</b> ({gbp(comp + burden)} with the EMS burden): {len(L)} parts lines, {n_parts:,} parts a board. The ten largest lines carry {top10_share * 100:.0f} % of the component spend.</li>
<li><b>The two AURIX TC387QP microcontrollers are the largest single line</b> ({gbp(aur['qty'] * aur['unitGBP'])}, {aur['qty'] * aur['unitGBP'] / comp * 100:.0f} % of components), read off both chips and priced at US$17 for a 20,000-a-year buyer.</li>
<li><b>Assembly, test and coating are {gbp(assembly)}</b> — functional + HV test ({gbp(ASM['Functional + HV insulation test'][0])}), SMT ({gbp(ASM['SMT assembly, paste and AOI'][0])}) and conformal coating on both sides ({gbp(ASM['Conformal coating, both sides'][0])}) lead.</li>
<li><b>The bare board is {gbp(fab)}</b> at the China automotive market price per m², IPC class 3.</li></ul></div>
<p class=sm><b>Basis.</b> Populated board, built and tested in China, ex-works; delivered adds sea freight and UK import duty. Prices are 25 Nov 2026, ex-VAT. Supplier margin sits inside the listed prices; rate-book operations carry {I['unquotedOH'] * 100:.0f} % overhead. The figure rests on 22 photos of the board, its size and its weight: no BOM, drawing, Gerber or supplier quote was supplied, so part identities, layer and via count are readings and estimates (§7).</p>

<h2 class=pb>2. Scope and inputs</h2>
<div class=cols><div><table>
{row(['Board', 'Dana TM4 Gemini CTRL, PC-10465018-D'])}
{row(['Function', 'Dual-channel e-drive inverter control board: 2 × AURIX MCU, safety PMIC, isolated HV sensing, resolver interface, CAN'])}
{row(['Size and weight', f"{I['w']} × {I['h']} mm, {I['boardKg'] * 1000:.0f} g populated (given)"])}
{row(['Layers / vias', f"{I['layers']} layers, about {I['vias']:,} through vias (estimated — not visible)"])}
{row(['Parts', f"{n_parts:,} parts in {len(L)} lines; {I['placements']:,} SMT placements, {I['joints']:,} SMT joints, {I['thtJoints']} through-hole joints, {I['pressParts']} press-fit parts"])}
</table></div><div><table>
{row(['Volume', f"{I['boards']:,} boards a year, lots of 1,000"])}
{row(['Programme', f"{I['years']} years, {prog:,} boards"])}
{row(['Build country', 'China (automotive EMS, IATF 16949)'])}
{row(['Terms', 'Ex-works China; delivered UK duty paid shown alongside'])}
{row(['Currency', f"£; CNY {FX} per £, US$ {USD} per £"])}
</table></div></div>
{FIGS}

<h2>3. Components — {gbp(comp)} a board, plus {gbp(burden)} EMS burden</h2>
<div class=cols><div><h3>By kind of part</h3>
<table><tr><th>Kind</th><th class=n>Lines</th><th class=n>Parts</th><th class=n>£ a board</th><th class=n>Share</th></tr>{cat_rows}</table></div>
<div><h3>By how the price was set</h3>
<table><tr><th>Price basis</th><th class=n>Lines</th><th class=n>Parts</th><th class=n>£ a board</th><th class=n>Share</th></tr>{kind_rows}</table></div></div>
<h3>The ten largest lines</h3>
<table><tr><th class=n>#</th><th>Ref.</th><th>Part</th><th>Package</th><th class=n>Qty</th><th class=n>£ each</th><th class=n>£ a board</th><th>Price basis</th></tr>{top_rows}</table>
<p class=sm>Prices are at the parts bought a year (quantity a board × {I['boards']:,}), whole reels, China distributor own stock where a reel price was read. The EMS adds a {I['burden'] * 100:.0f} % material burden (procurement, storage, attrition). Every line, with its source, is in Appendix A.</p>

<h2>4. Bare board — {gbp(fab)} a board</h2>
<table><tr><th>Step</th><th>Basis</th><th class=n>£ a board</th></tr>{fab_rows}</table>
<p class=sm>The board runs 2-up on an 18 × 24 in production panel ({I['panelW']} × {I['panelH']} mm). The market price a m² is what an automotive 4–6-layer fab sells at; drilling, ENIG finish, controlled impedance and the automotive grade (IATF 16949, high-Tg laminate, coupons) are inside it. Layer count and laminate are estimates until the fab drawing or Gerber files are seen.</p>

<h2>5. Assembly, test and coating — {gbp(assembly)} a board</h2>
<table><tr><th>Operation</th><th>Build-up</th><th>Source</th><th class=n>£ a board</th></tr>{asm_rows}</table>
<p class=sm>Price-list operations are Chinese EMS selling prices (the seller's margin is inside). Rate-book operations are time × the China rate for the machine and the operator. Selective solder is inside the through-hole joint price.</p>

<h2>6. Quality, tooling and logistics</h2>
<table><tr><th>Item</th><th>Basis</th><th class=n>£ a board</th></tr>{oth_rows}</table>
<h3>One-off tooling and fixtures</h3>
<table><tr><th>Item</th><th class=n>£</th></tr>{nre_rows}</table>

<h2>7. Confidence and sensitivities</h2>
<p>This is a should-cost from photographs. The figure is reproducible line by line (Appendices A and B), but three things are not yet confirmed: the identity of the parts no chip marking shows, the layer stack, and the test plan.</p>
<table><tr><th>What moves</th><th>Range</th><th class=n>Ex-works effect</th></tr>
{row(['AURIX TC387QP price (2 a board)', f"US$15–21 for a 20,000-a-year buyer (point US$17)", (f"{gbp(s_aur_lo)} / +{gbp(s_aur_hi)}", 'n')])}
{row(['Class-median lines (part not identified)', f"{kinds[KIND['class point']][0]} lines, {gbp(kinds[KIND['class point']][2])} — priced at the median of their AEC-Q class", ('until read', 'n')])}
{row(['Engineering-estimate lines', f"{kinds[KIND['engineering estimate']][0]} lines, {gbp(kinds[KIND['engineering estimate']][2])}", ('until quoted', 'n')])}
{row(['Layer count', f"{I['layers']} layers estimated; the price a m² follows the layer count", ('fab drawing', 'n')])}
{row(['Functional test time', f"{I['fctSec']} s estimated ({gbp(ASM['Functional + HV insulation test'][0])} a board)", ('test plan', 'n')])}
</table>
{xc_html}

<h2>8. To confirm before using the figure</h2>
<ul><li><b>The BOM file</b> — confirms every part identity and quantity; the largest open item.</li>
<li><b>Contract prices</b> for the AURIX TC387QP and the safety PMIC — the two largest lines; a directed buy or consignment removes the EMS burden on them.</li>
<li><b>Gerber and drill files or the fab drawing</b> — layer stack, via count, laminate and copper weight.</li>
<li><b>The ASIL from the safety concept</b> and <b>the test plan</b> (ICT, functional, HV insulation; who owns the fixtures).</li>
<li><b>Coating material and keep-out areas</b>, and the <b>HS code</b> for the UK import duty.</li></ul>

<h2 class=pb>Appendix A — parts list</h2>
<p class=sm>{len(L)} lines, {n_parts:,} parts; £ at the parts bought a year. "Quantity" says how the count was read off the photos.</p>
<table class=parts><colgroup><col style='width:10%'><col style='width:23%'><col style='width:9%'><col style='width:5%'><col style='width:7%'><col style='width:8.5%'><col style='width:37.5%'></colgroup><tr><th>Ref.</th><th>Part</th><th>Package</th><th class=n>Qty</th><th class=n>£ each</th><th class=n>£ a board</th><th>Price basis and source</th></tr>{all_rows}
{row(['<b>Total</b>', '', '', (f"<b>{n_parts:,}</b>", 'n'), ('', 'n'), (f"<b>{comp:.2f}</b>", 'n'), ''], 'tot')}</table>

<h2 class=pb>Appendix B — inputs and their basis</h2>
<table><tr><th>Input</th><th class=n>Value</th><th>Class</th><th>Basis and source</th></tr>{inp_rows}</table>
</body></html>"""
plain = re.sub(r'<[^>]+>', ' ', HTML)
assert not HIST.search(plain), HIST.search(plain).group(0) + ' … ' + plain[max(0, HIST.search(plain).start() - 120):HIST.search(plain).end() + 80]
open(os.path.join(OUT, 'final-report.html'), 'w').write(HTML)

# ── 7. workbook with live formulas ─────────────────────────────────────────────────────────────────────────────────────
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
wb = Workbook(); NAVY = '12324F'
H = Font(bold=True, color='FFFFFF'); HF = PatternFill('solid', fgColor=NAVY); B = Font(bold=True); TOT = PatternFill('solid', fgColor='EEF3F8')
T = Font(bold=True, size=14, color=NAVY); thin = Border(bottom=Side(style='thin', color='DDE3EA'))
GBP = '£#,##0.00'; GBP4 = '£#,##0.0000'; CNYF = '[$¥-804]#,##0.00'; PCT = '0.0%'
def hdr(ws, r, vals):
    for i, v in enumerate(vals, 1):
        c = ws.cell(r, i, v); c.font = H; c.fill = HF
def widths(ws, ws_w):
    for i, w in enumerate(ws_w, 1): ws.column_dimensions[get_column_letter(i)].width = w

# Inputs sheet (named cells by row)
wi = wb.active; wi.title = 'Inputs'
wi['A1'] = 'Inputs and their basis'; wi['A1'].font = T
hdr(wi, 3, ['Key', 'Input', 'Value', 'Unit', 'Class', 'Basis and source'])
REF = {}; r = 4
for grp, items in INP:
    wi.cell(r, 2, grp).font = B; r += 1
    for k, lab, unit in items:
        d = M['inputs'][k]
        wi.cell(r, 1, k); wi.cell(r, 2, lab); wi.cell(r, 3, d['v']); wi.cell(r, 4, unit); wi.cell(r, 5, CLS.get(d.get('cls'), '')); wi.cell(r, 6, basis_of(k))
        wi.cell(r, 6).alignment = Alignment(wrap_text=True, vertical='top'); REF[k] = f"Inputs!$C${r}"; r += 1
for k in ('pack', 'depanelGBP', 'label', 'stakeMat'):
    d = M['inputs'][k]; wi.cell(r, 1, k); wi.cell(r, 2, {'pack': 'Packaging a board', 'depanelGBP': 'Depanel a board', 'label': 'Serial label', 'stakeMat': 'Staking silicone'}[k])
    wi.cell(r, 3, d['v']); wi.cell(r, 4, '£'); wi.cell(r, 5, CLS.get(d.get('cls'), '')); wi.cell(r, 6, basis_of(k)); REF[k] = f"Inputs!$C${r}"; r += 1
wi.cell(r, 1, 'aspShape'); wi.cell(r, 2, '6 v 5 layers (China PCB table shape)'); wi.cell(r, 3, asp_shape); wi.cell(r, 5, 'Rate table'); REF['aspShape'] = f"Inputs!$C${r}"; r += 1
widths(wi, [12, 34, 12, 14, 16, 110])

# Parts sheet
wp = wb.create_sheet('Parts list')
wp['A1'] = f'Parts list — {len(L)} lines, {n_parts:,} parts'; wp['A1'].font = T
hdr(wp, 3, ['Ref.', 'Part', 'Package', 'Kind', 'Qty', '£ each', '£ a board', 'Price basis', 'Source / note', 'Quantity basis'])
r0 = 4
for i, l in enumerate(sorted(L, key=lambda l: (list(cats).index(l['cat']), -l['qty'] * l['unitGBP']))):
    r = r0 + i
    for c, v in enumerate([l['refDes'], l['description'], l['pkg'], l['cat'], l['qty'], l['unitGBP']], 1): wp.cell(r, c, v)
    wp.cell(r, 7, f"=E{r}*F{r}"); wp.cell(r, 8, l['kind']); wp.cell(r, 9, l['note']); wp.cell(r, 10, l['why'])
    wp.cell(r, 6).number_format = GBP4; wp.cell(r, 7).number_format = GBP
rl = r0 + len(L) - 1; rt = rl + 1
wp.cell(rt, 1, 'Components').font = B; wp.cell(rt, 5, f"=SUM(E{r0}:E{rl})"); wp.cell(rt, 7, f"=SUM(G{r0}:G{rl})"); wp.cell(rt, 7).number_format = GBP
for c in range(1, 11): wp.cell(rt, c).fill = TOT
widths(wp, [24, 60, 16, 18, 7, 11, 11, 32, 90, 60])
COMP = f"'Parts list'!$G${rt}"

# Assembly sheet
wa = wb.create_sheet('Assembly')
wa['A1'] = 'Assembly, test and coating'; wa['A1'].font = T
hdr(wa, 3, ['Operation', 'Source', '£ a board', 'Build-up'])
F = {'SMT assembly, paste and AOI': f"={REF['joints']}*{REF['smtUsdJ']}/{REF['usd']}",
     'Through-hole soldering': f"={REF['thtJoints']}*{REF['thtUsdJ']}/{REF['usd']}",
     'X-ray, 2 BGA': f"={REF['xrayComps']}*{REF['xrayUsdC']}/{REF['usd']}",
     'Depanel': f"={REF['depanelGBP']}", 'Packaging (ESD bag + divider)': f"={REF['pack']}",
     'Press-fit (3 connectors, 2 nuts)': f"={REF['pressParts']}*{REF['pressSec']}/3600*({REF['pressRate']}+{REF['opRate']})",
     'Conformal coating, both sides': f"={REF['coatSides']}*{REF['w']}*{REF['h']}/100*{REF['coatRate']}",
     'Coating masking + UV inspection': f"=({REF['maskSec']}+{REF['uvSec']})/3600*{REF['opRate']}",
     'Staking (silicone)': f"={REF['stakeSec']}/3600*{REF['opRate']}+{REF['stakeMat']}",
     'In-circuit test (ICT)': f"={REF['ictSec']}/3600*({REF['ict']}+{REF['opRate']})",
     'Programming (2 MCU + EEPROM)': f"={REF['progSec']}/3600*({REF['progRate']}+{REF['opRate']})",
     'Functional + HV insulation test': f"={REF['fctSec']}/3600*({REF['ict']}+{REF['techRate']})",
     'Final inspection + serial label': f"={REF['finalSec']}/3600*{REF['opRate']}+{REF['label']}"}
r = 4; rows_rate = []; rows_list = []
for k, (v, f, t) in ASM.items():
    wa.cell(r, 1, k); wa.cell(r, 2, 'Price list' if t == 'listed' else 'Rate book × time'); wa.cell(r, 3, F[k]); wa.cell(r, 4, f); wa.cell(r, 3).number_format = '£#,##0.000'
    (rows_list if t == 'listed' else rows_rate).append(r); r += 1
ro = r; wa.cell(r, 1, 'Overhead on rate-book operations'); wa.cell(r, 3, f"={REF['unquotedOH']}*(" + '+'.join(f'C{x}' for x in rows_rate) + ')'); wa.cell(r, 3).number_format = '£#,##0.000'; r += 1
wa.cell(r, 1, 'Set-up / handling allowance'); wa.cell(r, 3, f"={REF['setupAllow']}"); wa.cell(r, 3).number_format = '£#,##0.000'; r += 1
wa.cell(r, 1, 'Assembly, test and coating').font = B; wa.cell(r, 3, f"=SUM(C4:C{r - 1})"); wa.cell(r, 3).number_format = GBP
for c in range(1, 5): wa.cell(r, c).fill = TOT
ASSY = f"Assembly!$C${r}"
widths(wa, [36, 18, 12, 100])

# Cost build-up sheet
wc = wb.create_sheet('Cost build-up', 0)
wc['A1'] = 'EDU control board PCBA — should-cost'; wc['A1'].font = T
wc['A2'] = f"Dana TM4 Gemini CTRL, PC-10465018-D · China build · {I['boards']:,} boards a year · {I['years']}-year programme · 25 Nov 2026"
hdr(wc, 4, ['Cost element', '£ a board', '¥ a board', 'Share of ex-works', 'Basis'])
FAB = f"={REF['w']}*{REF['h']}/1000000*({REF['aspCny']}*(1+{REF['aspRise']})*{REF['aspShape']}+{REF['class3Cny']})/{REF['fx']}"
REWORK = f"{REF['fpyRework']}*({REF['reworkMin']}/60*{REF['techRate']}+({REF['ictSec']}+{REF['fctSec']})/3600*({REF['ict']}+{REF['techRate']}))"
lines = [('Components', f"={COMP}", 'Parts list'), ('EMS material burden', f"=B5*{REF['burden']}", 'burden × components'),
         ('Bare board (automotive, 6-layer)', FAB, 'area × market ¥/m² ÷ FX'), ('Assembly, test and coating', f"={ASSY}", 'Assembly sheet'),
         ('Cost of quality (rework, scrap)', f"={REWORK}+{REF['scrap']}*(B5+B6+B7+B8)", 'FPY 97 % rework + 0.3 % scrap'),
         ('Tooling and fixtures ÷ programme', f"={REF['nre']}/({REF['boards']}*{REF['years']})", 'one-off ÷ programme boards')]
r = 5
for n, f, b in lines:
    wc.cell(r, 1, n); wc.cell(r, 2, f); wc.cell(r, 3, f"=B{r}*{REF['fx']}"); wc.cell(r, 4, f"=B{r}/$B$11"); wc.cell(r, 5, b); r += 1
wc.cell(11, 1, 'Ex-works China'); wc.cell(11, 2, '=SUM(B5:B10)'); wc.cell(11, 3, f"=B11*{REF['fx']}"); wc.cell(11, 4, '=B11/$B$11')
wc.cell(12, 1, 'Sea freight to the UK'); wc.cell(12, 2, f"=({REF['boardKg']}+{REF['packKg']})*{REF['seaKg']}"); wc.cell(12, 3, f"=B12*{REF['fx']}")
wc.cell(13, 1, 'UK import duty'); wc.cell(13, 2, f"=(B11+B12)*{REF['duty']}"); wc.cell(13, 3, f"=B13*{REF['fx']}"); wc.cell(13, 5, 'on ex-works + freight')
wc.cell(14, 1, 'Delivered UK, duty paid'); wc.cell(14, 2, '=B11+B12+B13'); wc.cell(14, 3, f"=B14*{REF['fx']}")
wc.cell(16, 1, 'Automotive programme NRE a board'); wc.cell(16, 2, f"={REF['autoNre']}/({REF['boards']}*{REF['years']})"); wc.cell(16, 5, 'not in the unit cost')
wc.cell(17, 1, 'Full-economic, ex-works'); wc.cell(17, 2, '=B11+B16')
for rr in range(5, 18):
    wc.cell(rr, 2).number_format = GBP; wc.cell(rr, 3).number_format = CNYF; wc.cell(rr, 4).number_format = PCT
for rr in (11, 14, 17):
    for c in range(1, 6): wc.cell(rr, c).fill = TOT; wc.cell(rr, c).font = B
wc.cell(19, 1, 'Check: ex-works equals the report figure'); wc.cell(19, 2, round(exw, 4)); wc.cell(19, 3, '=IF(ABS(B11-B19)<0.005,"OK","CHECK")')
wc.cell(19, 2).number_format = GBP
widths(wc, [38, 14, 14, 16, 40])
wb.save(os.path.join(OUT, 'EDU-control-board-should-cost.xlsx'))
print(json.dumps({'exWorks': round(exw, 2), 'delivered': round(delivered, 2), 'fullEconomic': round(full_econ, 2), 'components': round(comp, 2), 'assembly': round(assembly, 2), 'fab': round(fab, 2)}))

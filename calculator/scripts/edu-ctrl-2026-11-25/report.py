#!/usr/bin/env python3
"""Manual should-cost + reconciliation report (HTML, printed to PDF by report-pdf.mjs) for the EDU control board.
Reads manual.json (manual.py) and the tool's live result (reprice.json). No figure is computed here that manual.py did
not compute, except the tool→manual bridge, which is differences of the two. Usage: python3 report.py <reprice.json> <out-dir>"""
import json, os, sys, html
tool = json.load(open(sys.argv[1])); OUT = sys.argv[2]
M = json.load(open(os.path.join(OUT, 'manual.json')))
I = {k: d['v'] for k, d in M['inputs'].items()}; C = M['computed']; T = M['tool']; REC = M['reconciliation']; L = M['lines']
FX = I['fx']; sb = tool['selectedCountryBreakdown']; b = sb['breakdown']
V2 = bool(M.get('v2')); CORR = M.get('corrections') or {}
V1 = json.load(open(sys.argv[3])) if V2 and len(sys.argv) > 3 else None   # the v1 manual.json, for the v1 → v2 bridge
VER = CORR.get('version', 'v2') if V2 else 'v1'
_RL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), CORR.get('readingFile', 'reading.json') if V2 else 'reading.json')))
_RL_n = len(_RL['lines']); _RL_q = sum(l['qty'] for l in _RL['lines']); _RL_smt = _RL['assembly']['smtPlacements']
e = lambda s: html.escape(str(s))
def gbp(x, d=2): return f"£{x:,.{d}f}"
def cny(x): return f"¥{x * FX:,.2f}"
def both(x): return f"{gbp(x)}<br><span class=ccy>{cny(x)}</span>"

man_rows = [('Components (parts list)', C['components'], T['components']),
            ('EMS material burden', C['burdenGBP'], T['burden']),
            ('Bare board' + (' (market ¥/m², automotive inside)' if V2 else ', standard'), C['fabStd'], T['fabStd']),
            ('Bare board, automotive grade', C['fabAuto'], T['fabAuto']),
            ('Assembly, test and coating (EMS price)', C['conversionOHP'], T['assembly']),
            ('Rework and scrap (manual) · energy, packaging, cost of quality (tool)', C['quality'], T['other']),
            ('One-off tooling ÷ programme (60,000)', C['nrePerBoard'], 0.0),
            ('Ex-works China', C['exWorks'], T['exWorks']),
            ('Freight to UK (sea)', C['freight'], T['freight']),
            ('UK import duty 3.7 %', C['dutyGBP'], T['duty']),
            ('Delivered UK, duty paid', C['delivered'], T['delivered'])]
tbl = ''.join(f"<tr class='{'tot' if lab.startswith(('Ex-works','Delivered')) else ''}'><td>{e(lab)}</td><td class=n>{gbp(m)}</td><td class=n>{cny(m)}</td><td class=n>{gbp(t)}</td><td class=n>{cny(t)}</td><td class=n>{gbp(t - m)}</td></tr>" for lab, m, t in man_rows)

# bars (ex-works stack)
def stack(vals, total, scale):
    cols = ['#2f5d8a', '#6c9bc6', '#7a8f3a', '#b7c96b', '#c2703a', '#e3b28c', '#8c6bb1']
    s = ''.join(f"<span style='width:{v / scale * 100:.2f}%;background:{cols[i]}' title='{gbp(v)}'></span>" for i, v in enumerate(vals))
    return f"<div class=bar>{s}</div>"
mv = [C['components'], C['burdenGBP'], C['fabStd'], C['fabAuto'], C['conversionOHP'], C['quality'], C['nrePerBoard']]
tv = [T['components'], T['burden'], T['fabStd'], T['fabAuto'], T['assembly'], T['other'], 0]
scale = max(T['exWorks'], C['exWorks']) * 1.02
legend = ''.join(f"<span><i style='background:{c}'></i>{n}</span>" for c, n in zip(['#2f5d8a', '#6c9bc6', '#7a8f3a', '#b7c96b', '#c2703a', '#e3b28c', '#8c6bb1'], ['Components', 'Burden', 'Board', 'Board automotive', 'Assembly & test', 'Energy / pack / quality', 'One-off ÷ programme']))

# bridge tool → manual
V3 = V2 and CORR.get('version') in ('v3', 'v4')
bridge = [('Tool ex-works', T['exWorks'], True),
          ('Components: 70 lines priced at automotive class ranges in the tool, at named analogues here' + (' (the AURIX at £13.40 in both)' if V3 else ''), C['components'] - T['components'], False),
          (f"Material burden 7 % → {I['burden'] * 100:.0f} % on the lower parts total", C['burdenGBP'] - T['burden'], False),
          (('Bare board: the same market ¥/m² in both — the tool shows it as its table board …' if V3 else 'Bare board: tool build-up (1-up, vias charged on top) → ¥/m² sold by an automotive 4–6-layer fab' if V2 else 'Bare board, standard: 1-up on 480×350 mm (51 %) → 2-up on 18×24 in (61 %)'), C['fabStd'] - T['fabStd'], False),
          (('… plus its market adjustment (the two lines net to zero)' if V3 else 'Automotive board grade: tool £15.16 microsection a panel + IATF + laminate + coupons → ' + ('inside the market ¥/m²' if V2 else '30 %')), C['fabAuto'] - T['fabAuto'], False),
          ('Assembly & test: functional / HV test, programming, press-fit, the second coated face and staking are in the manual, not the tool' + ('; Chinese list prices per joint' if V3 else '; effective line rate'), C['conversionOHP'] - T['assembly'], False),
          ('Energy, packaging, cost of quality: tool rework rate capped at 30 % → FPY 97 %', C['quality'] - T['other'], False),
          ('One-off tooling and fixtures over 60,000 boards (' + ('the tool spreads its own fixtures over the programme too, inside assembly' if V3 else 'tool: fixtures over the 10,000 order, inside assembly') + ')', C['nrePerBoard'], False),
          ('Manual ex-works', C['exWorks'], True)]
chk = T['exWorks'] + sum(x[1] for x in bridge[1:-1])
assert abs(chk - C['exWorks']) < 0.02, (chk, C['exWorks'])
br = ''.join(f"<tr class='{'tot' if t else ''}'><td>{e(lab)}</td><td class=n>{gbp(v)}</td></tr>" for lab, v, t in bridge)

# components top 25
top = sorted(L, key=lambda l: -l['lineGBP'])[:25]
comp = ''.join(f"<tr><td>{e(l['refDes'])}</td><td>{e(l['description'][:90])}</td><td class=n>{l['qty']}</td><td class=n>{l['unitGBP']:.4f}</td><td class=n>{l['lineGBP']:.2f}</td><td class=sm>{e(l['priceKind'])}: {e(l['priceNote'][:110])}</td></tr>" for l in top)
kinds = {}
for l in L: kinds.setdefault(l['priceKind'], [0, 0.0, 0]); kinds[l['priceKind']][0] += 1; kinds[l['priceKind']][1] += l['lineGBP']; kinds[l['priceKind']][2] += l['qty']
kindrows = ''.join(f"<tr><td>{e(k)}</td><td class=n>{v[0]}</td><td class=n>{v[2]:,}</td><td class=n>{gbp(v[1])}</td><td class=n>{v[1] / C['components'] * 100:.1f} %</td></tr>" for k, v in sorted(kinds.items(), key=lambda kv: -kv[1][1]))

# PCB
area = C['areaDm2']; w = C['waste']
pcb = [('Board area', f"{I['w']} × {I['h']} mm = {area:.4f} dm² (given)", None),
       ('Panel', f"2-up on {I['panelW']} × {I['panelH']} mm (18 × 24 in), utilisation {C['util'] * 100:.1f} %, waste 1 ÷ {C['util']:.3f} = {w:.3f}", None),
       ('2-layer base', f"{area:.4f} × £{I['base2L']}/dm² × {w:.3f}", C['fabBase']),
       ('Layers above 2', f"{area:.4f} × £{I['layerAdd']}/dm² × {I['layers'] - 2} × {w:.3f}", C['fabLayers']),
       ('ENIG finish', f"(base + layers) × {I['enig'] * 100:.0f} %", C['fabFinish']),
       ('Through vias', f"{I['vias']:,} ÷ 100 × £{I['viaRate']}", C['fabVias']),
       ('Controlled impedance', f"(base + layers) × {I['imped'] * 100:.0f} %", C['fabImp']),
       ('Standard bare board', '', C['fabStd']),
       ('Automotive grade', f"× {I['autoFab'] * 100:.0f} % (IATF 16949 fab, high-Tg, IPC-6012 class 3, coupons a panel, microsection a lot)", C['fabAuto']),
       ('Bare board, automotive', '', C['fab'])]
if V2:
    m2 = area / 100; bd = CORR['board']
    if 'aspShape' in C:
        pm2 = I['aspCny'] * (1 + I['aspRise']) * C['aspShape'] + I['class3Cny']
        pcb = [('Board area', f"{I['w']} × {I['h']} mm = {m2:.6f} m² (given)", None),
               ('Automotive 4–6-layer ASP, 2024', f"¥{I['aspCny']:,}/m² sold (Chaoying prospectus; 68.6 % automotive)", None),
               ('Rise to 2026', f"× {1 + I['aspRise']:.3f} (mid of +12–17 %)", None),
               ('6 v 5 layers', f"× {C['aspShape']:.4f} (the China table's layer shape)", None),
               ('Class-3 extras', f"+ ¥{I['class3Cny']}/m² (25 µm hole copper, 4-wire test)", None),
               (f'Bare board, {CORR.get("version", "v2")}', f"{m2:.6f} m² × ¥{pm2:,.1f}/m² ÷ {FX} — the same basis the tool now uses", C['fab']),
               ('v1 build-up, replaced', f"China PCB table + 4,500 vias charged on top (£8.54) + 30 % automotive = £{C['v1Fab']:.2f}", None)]
    else:
     pcb = [('Board area', f"{I['w']} × {I['h']} mm = {m2:.6f} m² (given)", None),
           ('Automotive 4–6-layer ASP, 2026', f"¥{I['aspCny']:,}/m² sold (Chaoying 2024 ¥995.31 × 1.12–1.17; top of band for 6 layers; range ¥{bd['aspRange'][0]:,}–{bd['aspRange'][1]:,})", None),
           ('Class-3 extras', f"+¥{I['class3Cny']}/m² (25 µm hole copper, 4-wire test)", None),
           ('Bare board, v2', f"{m2:.6f} m² × ¥{I['aspCny'] + I['class3Cny']:,}/m² ÷ {FX}", C['fab']),
           ('v1 build-up, replaced', f"China PCB table + 4,500 vias charged on top (£8.54) + 30 % automotive = £{C['v1Fab']:.2f}", None)]
pcbt = ''.join(f"<tr class='{'tot' if lab.startswith(('Standard', 'Bare')) else ''}'><td>{e(lab)}</td><td>{e(f)}</td><td class=n>{'' if v is None else gbp(v, 2)}</td></tr>" for lab, f, v in pcb)
toolpcb = ''.join(f"<tr><td>{e(x['item'])}</td><td class=sm>{e(x['formula'][:200])}</td><td class=n>{gbp(x['gbp'])}</td></tr>" for x in sb['basis'] if x['item'].startswith(('Bare board', 'Automotive fab')))

# Assembly
AF2 = {'SMT assembly incl. paste and AOI (per joint)': f"{I.get('joints', 0):,} joints × ${I.get('smtUsdJ', 0)} ÷ {I.get('usd', 1)} (JLCPCB list, >100k joints an order)",
       'Through-hole soldering (per joint)': f"{I['thtJoints']} joints × ${I.get('thtUsdJ', 0)} ÷ {I.get('usd', 1)} (JLCPCB list)",
       'X-ray (2 BGA)': f"2 components × ${I.get('xrayUsdC', 0)} ÷ {I.get('usd', 1)} (JLCPCB list)",
       'Depanel': 'Huaqiu list ¥0.50 a board', 'Packaging (ESD bag + divider)': 'JLC list ¥1 bag + ¥0.002/cm² divider'}
AF = {'SMT placement (both sides)': f"{I['placements']:,} ÷ {I['cph']:,}/h × (£{I['smtHS']:.2f} high-speed line + {I['smtCrew']} × £{I['opRate']:.2f})",
      'Line changeover (2 sides)': f"2 × {I['changeH']} h × £{I['smtHS'] + 2 * I['opRate']:.2f}/h ÷ {I['lot']:,} boards a lot",
      'Solder paste & consumables': 'engineering', 'THT insertion (manual)': f"{I['thtParts']} parts × {I['thtInsert']} s × £{I['opRate']:.2f}/h",
      'Selective solder': f"{I['thtJoints']} joints × {I['selSol']} s × (£{I['smtStd']:.2f} + £{I['opRate']:.2f})/h",
      'Press-fit (3 connectors, 2 nuts)': f"{I['pressParts']} × {I['pressSec']} s × (£{I['pressRate']} + £{I['opRate']:.2f})/h",
      'Conformal coating (both sides)': f"2 sides × {area * 100:.1f} cm² × £{I['coatRate']}/cm²",
      'Coating masking + UV inspection': f"({I['maskSec']} + {I['uvSec']}) s × £{I['opRate']:.2f}/h",
      'Staking / potting': f"{I['stakeSec']} s × £{I['opRate']:.2f}/h + £{I['stakeMat']} silicone",
      'AOI (2 sides)': f"{I['aoiSec']} s × (£{I['aoiRate']} + ½ × £{I['opRate']:.2f})/h",
      'X-ray (2 BGA)': f"{I['xraySec']} s × (£{I['xray']:.2f} + £{I['opRate']:.2f})/h",
      'ICT': f"{I['ictSec']} s × (£{I['ict']:.2f} + £{I['opRate']:.2f})/h",
      'Programming (2 MCU + EEPROM)': f"{I['progSec']} s × (£{I['progRate']} + £{I['opRate']:.2f})/h",
      'Functional + HV insulation test': f"{I['fctSec']} s × (£{I['ict']:.2f} + £{I['techRate']:.2f} technician)/h",
      'Depanel (router)': f"{I['routerSec']} s × (£{I['routerRate']} + £{I['opRate']:.2f})/h",
      'Final inspection + serial label': f"{I['finalSec']} s × £{I['opRate']:.2f}/h + £{I['label']}",
      'Packaging (ESD tray, carton)': 'engineering'}
AF.update(AF2)
asm = ''.join(f"<tr><td>{e(k)}</td><td class=sm>{e(AF[k] + ('' if k in AF2 or not V2 else ' — unchanged, no market price read'))}</td><td class=n>{gbp(v, 3)}</td></tr>" for k, v in C['assemblyItems'].items())
if 'listedGBP' in C:   # v3: no mark-up on list (selling) prices
    asm += f"<tr class=tot><td>Listed-price operations (the seller's margin is inside)</td><td></td><td class=n>{gbp(C['listedGBP'], 3)}</td></tr>"
    asm += f"<tr class=tot><td>Rate-book operations</td><td></td><td class=n>{gbp(C['unquotedGBP'], 3)}</td></tr>"
    asm += f"<tr><td>Overhead on rate-book operations</td><td class=sm>{I['unquotedOH'] * 100:.0f} % of {gbp(C['unquotedGBP'])}</td><td class=n>{gbp(C['sgaGBP'], 3)}</td></tr>"
    asm += f"<tr><td>Set-up / handling allowance</td><td class=sm>the audit's</td><td class=n>{gbp(C['setupAllowGBP'], 3)}</td></tr>"
else:
    asm += f"<tr class=tot><td>Conversion, direct</td><td></td><td class=n>{gbp(C['conversion'], 3)}</td></tr>"
    asm += f"<tr><td>EMS SG&amp;A / engineering / quality</td><td class=sm>{I['sga'] * 100:.0f} % of conversion</td><td class=n>{gbp(C['sgaGBP'], 3)}</td></tr>"
    asm += f"<tr><td>EMS profit</td><td class=sm>{I['profit'] * 100:.0f} % of conversion + SG&amp;A</td><td class=n>{gbp(C['profitGBP'], 3)}</td></tr>"
asm += f"<tr class=tot><td>Assembly, test and coating — EMS price</td><td></td><td class=n>{gbp(C['conversionOHP'], 3)}</td></tr>"
toolasm = ''.join(f"<tr><td>{e(x['item'])}</td><td class=sm>{e(x['formula'][:200])}</td><td class=n>{gbp(x['gbp'])}</td></tr>" for x in sb['basis'] if x['item'] in ('SMT placement', 'Through-hole and hand-soldered joints', 'AOI', 'X-ray (BGA / CSP)', 'In-circuit test', 'Conformal coating', 'Energy', 'ESD packaging', 'Cost of quality', 'Automotive assembly grade'))

nre = [('Stencils (2 sides, step stencil for press-fit area)', 700), ('ICT fixture (bed of nails, 395 × 215 mm)', 7000), ('Functional / EOL test fixture incl. HV insulation', 15000),
       ('Press-fit tooling (J2, J3, J12, nuts)', 3000), ('Selective-solder pallets', 2000), ('Coating masks / boots', 1500), ('AOI, X-ray, programming set-up', 1000), ('Bare-board tooling, test and E-test fixtures', 1200)]
assert sum(v for _, v in nre) == I['nre']
nret = ''.join(f"<tr><td>{e(k)}</td><td class=n>{gbp(v, 0)}</td></tr>" for k, v in nre) + f"<tr class=tot><td>Total one-off (engineering estimate)</td><td class=n>{gbp(I['nre'], 0)}</td></tr><tr><td>÷ programme {C['programme']:,} boards</td><td class=n>{gbp(C['nrePerBoard'])}</td></tr><tr><td>Automotive programme NRE (PPAP, FMEA, DV/PV, audit — the tool's figure, not in either unit cost)</td><td class=n>{gbp(I['autoNre'], 0)} ({gbp(C['autoNrePerBoard'])} a board over 60,000)</td></tr>"

app = ''.join(f"<tr><td>{e(r['refDes'])}</td><td>{e(r['description'][:70])}</td><td class=n>{r['qty']}</td><td class=n>{r['manualUnit']:.4f}</td><td class=n>{r['manualLine']:.2f}</td><td class=n>{r['toolUnit']:.4f}</td><td class=n>{r['toolLine']:.2f}</td><td class=n>{r['delta']:+.2f}</td><td class=sm>{e(r['toolClass'][:40])}</td></tr>" for r in sorted(REC, key=lambda r: -r['manualLine']))

inputs = ''.join(f"<tr><td>{e(k)}</td><td class=n>{e(d['v'])}</td><td>{e(d['unit'])}</td><td><span class='tag {e(d['cls']).replace(' ', '')}'>{e(d['cls'])}</span></td><td class=sm>{e(d['basis'])}</td></tr>" for k, d in M['inputs'].items())

THREE = ', for three reasons shown in §6: it prices 70 of 71 parts lines at the top of an automotive class range because only the AURIX was read off a chip, it charges an IPC class-3 microsection on every board, and it leaves out functional test, programming, press-fit and the second coated face — which the manual adds back.'
if V2 and CORR.get('version') in ('v3', 'v4'): THREE = ' (§6): after its fixes the bare board is the same in both; the difference is the 70 parts lines no photo identifies, which the tool prices inside their catalogue class ranges and the manual at named typical parts, less the operations the tool still leaves out (functional / HV test, programming, press-fit, second coated face). A BOM file closes most of it.'
TOOLFIX = ''
OPENOLD = ''
OPENLIST = '<li><b>Open (not changed):</b> panel list stops at 480 × 350 mm; class-3 microsection charged per panel, so per board on a large board; conformal coating one face only; no functional test, programming, press-fit or selective-solder line; a description containing "test points" or "probe pads" makes a part not fitted (£0); "CAN common-mode choke" falls into the shield-can (mechanical) class; one-off fixtures spread over the annual order, not the programme; the should-cost PDF via Calculate embeds full-resolution photos (42 MB).</li>'
if V2 and CORR.get('version') in ('v3', 'v4'):
    TOOLFIX = ('<li><b>Fixed after the audit (packages A and C, 25 Nov 2026):</b> fitted test points priced; class collisions (test-point words, "CAN" choke, mm bodies, group labels, logic, shunts); the 18 × 24 in panel — this board 2-up at 61 %; coupon sampling per panel or per lot; lot size and programme life as inputs; a family price in another package refused; '
               'the ASIL is the engineer\'s; drilling inside the per-area price; a China automotive board at the market ASP per m²; 34 AEC-Q class ranges from the catalogue\'s own prices. This board: £284.76 → £241.54 delivered (bare board £44.25 → £14.29); with the lot, programme and the AURIX at £13.40: '
               f'{gbp(T["delivered"])} delivered, {gbp(T["exWorks"])} ex-works.</li>')
    OPENLIST = '<li><b>Still open in the tool (package B / D, not approved yet):</b> functional / HV test, programming, press-fit, second coated face and second reflow as operations; full-economic and EMS-invoice lines with a customer-supplied flag; delivery terms; an FPY input (the rework rate is placements × 800 dppm, capped at 30 %); the band\'s basis; fab spec inputs. The should-cost PDF via Calculate embeds full-resolution photos (42 MB).</li>'
if V2 and V1 and VER == 'v4':
    c1 = V1['computed']; RENAME = {'U8, U61': 'U8, U15, U61', 'U20, U22': 'U20, U22, U43'}
    prev = {l['refDes']: l for l in V1['lines']}; now = {l['refDes']: l for l in L}
    qtyEff = priceEff = 0.0; rowsQ = []; rowsP = []; added = []; removed = []
    for l in L:
        p0 = prev.get(RENAME.get(l['refDes'], l['refDes']))
        if not p0: added.append(l); continue
        dq = (l['qty'] - p0['qty']) * p0['unitGBP']; dp = l['qty'] * (l['unitGBP'] - p0['unitGBP'])
        qtyEff += dq; priceEff += dp
        if abs(dq) > 0.005: rowsQ.append((l['refDes'], p0['qty'], l['qty'], dq))
        if abs(dp) > 0.005: rowsP.append((l['refDes'], l['qty'], p0['unitGBP'], l['unitGBP'], dp, l.get('priceNote', ''), l.get('priceSource', '')))
    mapped = {RENAME.get(r, r) for r in now}
    for r, p0 in prev.items():
        if r not in mapped: removed.append(p0)
    addE = sum(l['lineGBP'] for l in added); remE = -sum(p0['lineGBP'] for p0 in removed)
    assert abs(c1['components'] + qtyEff + priceEff + addE + remE - C['components']) < 0.02
    br4 = [('Manual v3, ex-works', c1['exWorks'], True),
          (f'Recount — lines not on the board ({", ".join(p0["refDes"] for p0 in removed)})', remE, False),
          (f'Recount — lines found ({", ".join(l["refDes"] for l in added)})', addE, False),
          ('Recount — quantities (passives and discretes: bottom counted, top less 20 % not fitted; 701 chokes 6 → 5)', qtyEff, False),
          ('China volume prices (szlcsc own-stock whole reels, ex-VAT): passives, discretes, magnetics, test loops, headers', priceEff, False),
          ('EMS material burden 7 % on the lower parts total', C['burdenGBP'] - c1['burdenGBP'], False),
          (f"Assembly: {I['joints']:,} SMT joints (v3 {V1['inputs']['joints']['v']:,})", C['conversionOHP'] - c1['conversionOHP'], False),
          ('Rework and scrap (scrap follows the value)', C['quality'] - c1['quality'], False),
          ('Manual v4, ex-works', C['exWorks'], True)]
    assert abs(sum(x[1] for x in br4[:-1]) - C['exWorks']) < 0.02, sum(x[1] for x in br4[:-1])
    b12 = ''.join(f"<tr class='{'tot' if t else ''}'><td>{e(lab)}</td><td class=n>{gbp(v)}</td></tr>" for lab, v, t in br4)
    chg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reading-v4-changes.json')))
    cnt = ''.join(f"<tr><td>{e(c['refDes'])}</td><td class=n>{e(c['was'])}</td><td class=n>{e(c['now'])}</td><td class=sm>{e(c['why'])}</td></tr>" for c in chg)
    pr = ''.join(f"<tr><td>{e(r[0])}</td><td class=n>{r[1]}</td><td class=n>{r[2]:.4f}</td><td class=n>{r[3]:.4f}</td><td class=n>{gbp(r[4])}</td><td class=sm>{e(str(r[5])[:170])}</td></tr>" for r in sorted(rowsP, key=lambda r: r[4]))
    tot0 = sum(p0['qty'] for p0 in V1['lines']); tot1 = sum(l['qty'] for l in L)
    full = C['exWorks'] + C['autoNrePerBoard']
    inv = C['exWorks'] - C['nrePerBoard'] - sum(l['lineGBP'] for l in L if l['refDes'] in ('AURIX pair', 'U39, U40')) * (1 + I['burden'])
    v2sec = f"""
<h2>0. What changed in v4 (25 Nov 2026) — the recount from all 22 photos, and China volume prices</h2>
<p>The engineers said the quantities did not match. Every photo was reviewed again, the zoomed ones matched to their area of the whole-board views so that no part is counted twice. Three things were wrong in v1–v3: <b>(1)</b> the second channel (UC2, beside J3) was costed "by symmetry" with the first — it is not: beside J3 there are U14, U11 and empty pads, no op-amp row and no CAN pair; <b>(2)</b> the two 14-pin ICs beside J2 read <b>NXP TJA1463A</b> (CAN transceivers), not quad op-amps; <b>(3)</b> far more footprints are empty than the 10 % assumed — U26, U42, U43, U62, U69, Q66, Q67, Z26–Z29, Z33, Z34, R313 / R322–R324, R1134 / R1135, R1215 / R1229 / R1242, R1253 / R1254, D9, D10 and more. Measured on nine full-resolution tiles: about 5–15 % in the UC cores, 30 % near the motor connector and the resolver boost, 55 % below UC1 — 20 % taken overall (range 10–30 %). The bottom side is counted part by part. <b>Parts: {tot0:,} → {tot1:,}; SMT placements {V1['inputs']['placements']['v']:,} → {I['placements']:,}.</b></p>
<table><tr><th>Step, v3 → v4</th><th>£ a board</th></tr>{b12}</table>
<h3>The recount, line by line</h3>
<table><tr><th>Line</th><th>v1–v3</th><th>v4</th><th>Evidence</th></tr>{cnt}</table>
<h3>China volume prices applied (lowest sourced price at volume; an engineering estimate is replaced whichever way it moves)</h3>
<table><tr><th>Line</th><th>Qty</th><th>v3 £</th><th>v4 £</th><th>Effect £</th><th>Source</th></tr>{pr}</table>
<p class=sm>Not lowered: 0402 / 0805 MLCCs, ferrite beads, the crystal, LDO, comparator, flyback controller, AMC1311 and TLF35584 — the China reel price read is dearer than v3's sourced figure (TLF35584 £5.88 a reel part at szlcsc against £3.07 franchised; AMC1311 £3.29 against TI.com £2.12). ICs bought at 20k–30k a year on contract would be at or below v3's figures, which are kept.</p>
<p><b>Full-economic</b> (with the £15,500 programme NRE over 60,000 boards): {gbp(full)}. <b>EMS invoice if Dana supplies the AURIX and the PMIC</b>: about {gbp(inv)}.</p>"""
    rec2 = f"<p><b>Updated (v4).</b> All 22 photos re-read part by part: the second channel is not a copy of the first, two CAN transceivers (TJA1463A) were read, about 20 % of the top-side footprints are empty — <b>{tot1:,} parts, {I['placements']:,} SMT placements</b> (v3 {tot0:,}). Passives, discretes, magnetics, test loops and headers re-priced at China volume (szlcsc reels). Manual should-cost <b>{gbp(C['exWorks'])} ex-works</b> ({cny(C['exWorks'])}), full-economic {gbp(full)}, delivered UK {gbp(C['delivered'])}. The tool on the same reading: {gbp(T['exWorks'])} ex-works.</p>"
css = """
@page{size:A4;margin:14mm 12mm 16mm}
:root{--ink:#1c2430;--mute:#5b6675;--line:#d7dde5;--band:#eef2f7;--acc:#1f3a5f}
body{font:9.2pt/1.42 "Segoe UI",Arial,sans-serif;color:var(--ink);background:#fff;margin:0}
h1{font-size:20pt;margin:0 0 4px;color:var(--acc)} h2{font-size:13pt;color:var(--acc);border-bottom:1.5px solid var(--acc);padding-bottom:3px;margin:18px 0 8px;break-after:avoid}
h3{font-size:10.5pt;margin:12px 0 5px;break-after:avoid} p{margin:4px 0 7px;max-width:180mm}
table{border-collapse:collapse;width:100%;margin:4px 0 10px;break-inside:auto} th{background:var(--acc);color:#fff;text-align:left;font-weight:600;padding:4px 6px;font-size:8.4pt}
td{border-bottom:1px solid var(--line);padding:3px 6px;vertical-align:top} tr{break-inside:avoid} td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .sm{font-size:7.8pt;color:var(--mute)}
tr.tot td{font-weight:700;background:var(--band)} .ccy{color:var(--mute);font-size:8pt}
.cover{border:1px solid var(--line);padding:16px 18px;margin-bottom:12px} .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
.kpi{border:1px solid var(--line);padding:8px 10px} .kpi b{display:block;font-size:15pt;color:var(--acc)} .kpi span{font-size:8pt;color:var(--mute)}
.bar{display:flex;height:16px;margin:2px 0 8px;border:1px solid var(--line)} .bar span{display:block;height:100%} .legend{display:flex;flex-wrap:wrap;gap:10px;font-size:8pt;color:var(--mute)} .legend i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
.note{background:#fff7e6;border:1px solid #f0d9a8;padding:7px 10px;margin:8px 0} .tag{font-size:7.5pt;padding:1px 5px;border:1px solid var(--line)} .tag.estimate{background:#fff4d6} .tag.given{background:#e3f1e3} .tag.ratebook,.tag.table,.tag.tool{background:#e6eef8}
.pb{break-before:page} ul{margin:4px 0 8px 18px;padding:0} li{margin:2px 0}
"""
gap = T['exWorks'] - C['exWorks']
_aur = next((l for l in L if l['refDes'] == 'AURIX pair'), None)
AUR = _aur['lineGBP'] if _aur else 0.0
AURNOTE = 'the same engineer\'s price, £13.40 each, in the tool and the manual' if abs((_aur or {}).get('unitGBP', 0) - 13.40) < 1e-6 else ('China distributor own stock' if V2 else 'tool and manual price them alike: CostVision catalogue, TC387 family')
if VER != 'v4': v2sec = ''; rec2 = ''
if V2 and V1 and CORR.get('version', 'v2') == 'v2':
    c1 = V1['computed']; rows = []
    for l in L:
        if 'v1UnitGBP' in l:
            rows.append((f"{l['refDes']} — {l['description'][:60]}", l['qty'], l['v1UnitGBP'], l['unitGBP'], l['lineGBP'] - l['v1LineGBP'], l['priceNote'], l['priceSource']))
    br12 = [('Manual v1, ex-works', c1['exWorks'], True)]
    br12 += [(f"{r[0]}: {r[1]} × £{r[2]:.2f} → £{r[3]:.2f}", r[4], False) for r in rows]
    br12 += [('EMS material burden 6 % on the new parts total', C['burdenGBP'] - c1['burdenGBP'], False),
             ('Bare board: China table build-up (vias on top, +30 %) → automotive ¥/m² sold', C['fab'] - c1['fab'], False),
             ('Assembly and test: Chinese list prices per joint / component (table below)', C['conversionOHP'] - c1['conversionOHP'], False),
             ('Cost of quality (scrap follows the lower value)', C['quality'] - c1['quality'], False),
             ('Manual v2, ex-works', C['exWorks'], True)]
    assert abs(c1['exWorks'] + sum(x[1] for x in br12[1:-1]) - C['exWorks']) < 0.01
    b12 = ''.join(f"<tr class='{'tot' if t else ''}'><td>{e(lab)}</td><td class=n>{gbp(v)}</td></tr>" for lab, v, t in br12)
    a1 = c1['assemblyItems']; a2 = C['assemblyItems']
    grp = [('SMT incl. paste, AOI, changeover', ['SMT placement (both sides)', 'Line changeover (2 sides)', 'Solder paste & consumables', 'AOI (2 sides)'], ['SMT assembly incl. paste and AOI (per joint)']),
           ('Through-hole soldering', ['THT insertion (manual)', 'Selective solder'], ['Through-hole soldering (per joint)']),
           ('X-ray', ['X-ray (2 BGA)'], ['X-ray (2 BGA)']), ('Depanel', ['Depanel (router)'], ['Depanel']),
           ('Packaging', ['Packaging (ESD tray, carton)'], ['Packaging (ESD bag + divider)'])]
    at = ''.join(f"<tr><td>{e(n)}</td><td class=n>{gbp(sum(a1[k] for k in o))}</td><td class=n>{gbp(sum(a2[k] for k in nn))}</td></tr>" for n, o, nn in grp)
    at += f"<tr><td>Press-fit, coating, masking, staking, ICT, programming, functional / HV test, final inspection</td><td class=n>{gbp(sum(v for k, v in a2.items() if k in a1))}</td><td class=n>{gbp(sum(v for k, v in a2.items() if k in a1))}</td></tr>"
    at += f"<tr class=tot><td>EMS price incl. 10 % SG&amp;A + 8 % profit</td><td class=n>{gbp(c1['conversionOHP'])}</td><td class=n>{gbp(C['conversionOHP'])}</td></tr>"
    ev = ''.join(f"<tr><td>{e(r[0][:40])}</td><td class=sm>{e(r[5])}<br>{e(r[6])}</td></tr>" for r in rows)
    bdc = CORR['board']; asc = CORR['assembly']
    ev += f"<tr><td>Bare board</td><td class=sm>{e(bdc['note'])}<br>{e(' ; '.join(bdc['urls']))}</td></tr>"
    ev += f"<tr><td>Assembly</td><td class=sm>{e(asc['smtNote'])}; {e(asc['thtNote'])}; {e(asc['xrayNote'])}; {e(asc['depanelNote'])}; {e(asc['packNote'])}<br>{e(asc['smtUrl'])} ; https://smt.hqchip.com/online/valuation.html ; https://m.jlc.com/portal/server_guide_40512.html</td></tr>"
    ev += f"<tr><td>Not changed</td><td class=sm>{e(asc['unchanged'])}. {e(CORR['linesChecked']['J12 CUSTOMER'])}.</td></tr>"
    # ranges from the sourced ranges
    lo = hi = 0.0
    for l in L:
        c = CORR['lines'].get(l['refDes'])
        if c and c.get('range'):
            lo += l['qty'] * (min(c['range']) - l['unitGBP']) * (1 + I['burden']); hi += l['qty'] * (max(c['range']) - l['unitGBP']) * (1 + I['burden'])
    m2 = C['areaDm2'] / 100
    lo += m2 * (bdc['aspRange'][0] + I['class3Cny']) / FX - C['fab']; hi += m2 * (bdc['aspRange'][1] + I['class3Cny']) / FX - C['fab']
    emsMargin = C['burdenGBP'] + C['sgaGBP'] + C['profitGBP']
    western = [l for l in L if l['priceKind'] not in ('market (page-read)', 'engineering estimate')]
    westGBP = sum(l['lineGBP'] for l in western); engGBP = sum(l['lineGBP'] for l in L if l['priceKind'] == 'engineering estimate')
    v2sec = f"""
<h2>0. Cross-check against the market (v2, 25 Nov 2026)</h2>
<p>The PCB cost engineer and manager said the should-cost is well above what is paid. Every block was re-checked against prices read on a page — Chinese distributors' own stock, the maker's list, Chinese EMS list prices, and the price per m² that listed Chinese automotive board makers report. <b>Rule:</b> the lowest price read on a page from the maker, a franchised distributor or a China distributor's own stock (broker and partner listings excluded); where no page gave a price the v1 figure is kept and called unverified. The rule was applied in both directions — three chips and the test points came out <i>dearer</i> than v1.</p>
<table><tr><th>Step, v1 → v2</th><th>£ a board</th></tr>{b12}</table>
<h3>Assembly and test, v1 → v2</h3>
<table><tr><th>Item</th><th>v1 £</th><th>v2 £</th></tr>{at}</table>
<p><b>Sourced range for v2</b> (the low and high ends of each sourced range above — AURIX £8.94–11.67, TLF35584 £5.85–7.68, ISO7741 £1.52–1.69, test points £0.06–0.14, board ¥{bdc['aspRange'][0]:,}–{bdc['aspRange'][1]:,}/m²): <b>{gbp(C['exWorks'] + lo)} – {gbp(C['exWorks'] + hi)} ex-works</b>.</p>
<p><b>EMS margin check.</b> v2 carries {gbp(emsMargin)} of EMS material burden, SG&amp;A and profit = {emsMargin / C['exWorks'] * 100:.1f} % of the ex-works price. Listed Chinese EMS report automotive gross margins of 5.6 % (Guanghong, 2024) and 8.8 % (USI, 2025) of revenue including materials — v2 sits inside that band, so the margin structure is not where the gap is.</p>
<h3>Where the price you pay can still be lower — not changed here because no page gives it</h3>
<ul><li><b>Directed-buy or consigned parts.</b> A Tier-1 usually buys the AURIX and safety PMIC on its own contract and directs or consigns them to the EMS. Then the EMS invoice either leaves them out or carries the contract price with no material burden. The AURIX pair alone is {gbp(2 * 8.94)} at the China distributor price.</li>
<li><b>{len(western)} lines ({gbp(westGBP)}) are still priced from Western franchised-distributor listings</b> (mostly Digi-Key), the dear end of the market: round 6 found Digi-Key 1.05–1.6× TME on most parts and 2.7–2.8× on some capacitors. Chinese reel prices for the passives could not be read (prices load in the browser). A further {gbp(engGBP)} is engineering estimates.</li>
<li><b>Test and coating ({gbp(a2['ICT'] + a2['Programming (2 MCU + EEPROM)'] + a2['Functional + HV insulation test'] + a2['Conformal coating (both sides)'] + a2['Coating masking + UV inspection'])})</b>: no Chinese volume price was published; they rest on rate-book machine rates.</li>
<li><b>Annual price-downs</b> (LTA, typically a few % a year) and the price being FCA / ex-works rather than delivered.</li></ul>
<h3>Sources of every change</h3>
<table><tr><th>Item</th><th>What was read, and where</th></tr>{ev}</table>"""
    rec2 = f"<p><b>Cross-checked (v2).</b> After the engineers' review every block was re-checked against prices read on a page (§0). The manual should-cost is now <b>{gbp(C['exWorks'])} ex-works</b> ({cny(C['exWorks'])}), down from {gbp(c1['exWorks'])} in v1, with a sourced range of {gbp(C['exWorks'] + lo)}–{gbp(C['exWorks'] + hi)}. The largest correction is the AURIX (£22.64 → £8.94 each, China distributor stock); the board (−{gbp(c1['fab'] - C['fab'])}) and assembly (−{gbp(c1['conversionOHP'] - C['conversionOHP'])}) follow Chinese market prices. Three chips came out dearer than v1. If the price paid is still below this, the likely reasons are listed in §0 — directed-buy MCUs above all — and need the price paid and its terms to settle.</p>"

VER = CORR.get('version', 'v2') if V2 else 'v1'
if V2 and V1 and VER == 'v3':
    c1 = V1['computed']; prev = {l['refDes']: l for l in V1['lines']}
    rows = [(l['refDes'], l['description'][:60], l['qty'], prev[l['refDes']]['unitGBP'], l['unitGBP'], l['lineGBP'] - prev[l['refDes']]['lineGBP'], l.get('priceNote', ''), l.get('priceSource', ''))
            for l in L if l['refDes'] in prev and abs(l['unitGBP'] - prev[l['refDes']]['unitGBP']) > 1e-6]
    br = [('Manual v2, ex-works', c1['exWorks'], True)]
    br += [(f"{r[0]} — {r[1]}: {r[2]} × £{r[3]:.2f} → £{r[4]:.2f}", r[5], False) for r in rows]
    br += [(f"EMS material burden {c1['burdenGBP'] / c1['components'] * 100:.0f} % → {I['burden'] * 100:.0f} % (the tool's sourced rate at 10,000 boards)", C['burdenGBP'] - c1['burdenGBP'], False),
           ('Bare board: top of the price-rise band, no layer shape → the tool\'s market basis (mid of the rise, 6-v-5-layer shape)', C['fab'] - c1['fab'], False),
           ('Assembly: no mark-up on list (selling) prices; rate-book operations + 10 %; X-ray at the lot tier; £0.14 set-up', C['conversionOHP'] - c1['conversionOHP'], False),
           ('Rework and scrap (scrap follows the value)', C['quality'] - c1['quality'], False),
           ('Manual v3, ex-works (recurring + tooling over 60,000)', C['exWorks'], True)]
    assert abs(c1['exWorks'] + sum(x[1] for x in br[1:-1]) - C['exWorks']) < 0.01
    b12 = ''.join(f"<tr class='{'tot' if t else ''}'><td>{e(lab)}</td><td class=n>{gbp(v)}</td></tr>" for lab, v, t in br)
    a1 = c1['assemblyItems']; a2 = C['assemblyItems']
    at = ''.join(f"<tr><td>{e(k)}</td><td class=n>{gbp(a1.get(k, 0), 3)}</td><td class=n>{gbp(x, 3)}</td></tr>" for k, x in a2.items())
    at += f"<tr><td>v2: 10 % SG&amp;A + 8 % profit on everything</td><td class=n>{gbp(c1['sgaGBP'] + c1['profitGBP'], 3)}</td><td class=n>—</td></tr>"
    at += f"<tr><td>v3: 10 % overhead on rate-book operations only ({gbp(C['unquotedGBP'])}) + set-up allowance</td><td class=n>—</td><td class=n>{gbp(C['sgaGBP'] + C['setupAllowGBP'], 3)}</td></tr>"
    at += f"<tr class=tot><td>Assembly, test and coating — EMS price</td><td class=n>{gbp(c1['conversionOHP'])}</td><td class=n>{gbp(C['conversionOHP'])}</td></tr>"
    ev = ''.join(f"<tr><td>{e(r[0])}</td><td class=sm>{e(r[6])}<br>{e(r[7])}</td></tr>" for r in rows)
    ev += f"<tr><td>Material burden</td><td class=sm>{e(CORR['burden']['note'])}</td></tr>"
    ev += f"<tr><td>Bare board</td><td class=sm>{e(CORR['board']['note'])}<br>{e(' ; '.join(CORR['board']['urls']))}</td></tr>"
    ev += f"<tr><td>Assembly</td><td class=sm>{e(CORR['assembly']['markupNote'])} {e(CORR['assembly']['xrayNote'])}.</td></tr>"
    lo = hi = 0.0
    for l in L:
        c = CORR['lines'].get(l['refDes'])
        if c and c.get('range'):
            lo += l['qty'] * (min(c['range']) - l['unitGBP']) * (1 + I['burden']); hi += l['qty'] * (max(c['range']) - l['unitGBP']) * (1 + I['burden'])
    full = C['exWorks'] + C['autoNrePerBoard']
    westGBP = sum(l['lineGBP'] for l in L if l['priceKind'] not in ('market (page-read)', 'engineering estimate')); engGBP = sum(l['lineGBP'] for l in L if l['priceKind'] == 'engineering estimate')
    inv = C['exWorks'] - C['nrePerBoard'] - sum(l['lineGBP'] for l in L if l['refDes'] in ('AURIX pair', 'U39, U40')) * (1 + I['burden'])
    v2sec = f"""
<h2>0. What changed in v3 (25 Nov 2026)</h2>
<p>v3 takes the corrections accepted from the independent audit (the audit review, 53 lines) and the AURIX TC387QP re-verified on the live pages. The rule is unchanged: a price read on a page, the source named; a figure no page gives is labelled.</p>
<table><tr><th>Step, v2 → v3</th><th>£ a board</th></tr>{b12}</table>
<h3>The AURIX TC387QP, re-verified</h3>
<table><tr><th>Source (read 25 Nov 2026)</th><th>Price</th><th>What it is</th></tr>
<tr><td>Infineon's own shop = Digi-Key (TC387QP160F300SAEKXUMA2)</td><td class=n>$31.56 at 1,000 (£24.85)</td><td>List price of one reel — the ceiling, the largest break published</td></tr>
<tr><td>The tool's catalogue (before)</td><td class=n>£22.64 at 20,000</td><td>Western listings derived along the franchise curve — 9 % under the one-reel list. Too high</td></tr>
<tr><td>The audit</td><td class=n>$21.04 at 1,000 (£16.56)</td><td>Not reproduced by its own account — the top of the range</td></tr>
<tr><td>LCSC own stock</td><td class=n>$14.82 at 100+ (£11.67)</td><td>China distributor stock, no authorisation or date code shown</td></tr>
<tr><td>szlcsc own stock (v2)</td><td class=n>¥79.38 ex-VAT (£8.94)</td><td>The same stock — a market floor, not a traceable Tier-1 channel</td></tr>
<tr><td>Infineon, Q2 FY26 analyst call (6 May 2026)</td><td>—</td><td>Automotive annual pricing: "low single-digit price declines"; the 2026 price rises name power parts, not MCUs</td></tr>
<tr class=tot><td>v3: market-derived estimate for a 20,000-a-year buyer</td><td class=n>$17 = £13.40 (range £11.81–16.54)</td><td>Not a contract price — Dana's own price replaces it</td></tr></table>
<h3>Assembly and test, v2 → v3</h3>
<table><tr><th>Item</th><th>v2 £</th><th>v3 £</th></tr>{at}</table>
<p><b>Range.</b> AURIX £11.81–16.54 and the PMIC's franchised tiers £3.01–3.24 give <b>{gbp(C['exWorks'] + lo)}–{gbp(C['exWorks'] + hi)} ex-works</b>; the bare board's band (¥1,115–1,400/m² before the layer shape) adds about ±£1.5. <b>Full-economic</b> (with the £15,500 programme NRE over 60,000 boards): {gbp(full)}. <b>EMS invoice if Dana supplies the AURIX and the PMIC</b> (no material burden on them, no tooling): about {gbp(inv)}.</p>
<p><b>Still open:</b> {gbp(westGBP)} of lines priced from Western distributor listings, {gbp(engGBP)} engineering estimates, and test / coating ({gbp(a2['ICT'] + a2['Programming (2 MCU + EEPROM)'] + a2['Functional + HV insulation test'] + a2['Conformal coating (both sides)'] + a2['Coating masking + UV inspection'])}) on rate-book time × rate. The BOM, Dana's AURIX / PMIC contract prices and a fab quote close them.</p>
<h3>Sources of every change</h3>
<table><tr><th>Item</th><th>What was read, and where</th></tr>{ev}</table>"""
    rec2 = f"<p><b>Updated (v3).</b> The audit's accepted corrections and the AURIX re-verified on the live pages (£13.40 a chip, market-derived — not a contract price) give <b>{gbp(C['exWorks'])} ex-works</b> ({cny(C['exWorks'])}), range {gbp(C['exWorks'] + lo)}–{gbp(C['exWorks'] + hi)}; full-economic {gbp(full)}; delivered UK {gbp(C['delivered'])}. The tool, after its own fixes and with the AURIX entered as the engineer's price, gives {gbp(T['exWorks'])} ex-works — the gap is the 70 parts no photo identifies, which the tool prices inside their class ranges.</p>"
doc = f"""<!doctype html><html><head><meta charset=utf-8><title>EDU control board should-cost</title><style>{css}</style></head><body>
<div class=cover>
<div class=sm>CostVision · PCB Image to BOM should-cost · 25 Nov 2026</div>
<h1>EDU control board PCBA — should-cost report{f' ({os.environ.get("CV_TITLE_VER") or VER})' if V2 else ''}</h1>
<div>Dana TM4 Gemini CTRL board, PC-10465018-D (read off the photos) · 395 × 215 mm · 552 g · conformal coating on the entire board</div>
<div>Build in <b>China</b> · <b>10,000 boards a year</b> · <b>6-year programme</b> (60,000 boards) · £ per board, ¥ at {FX} CNY per £ (CostVision PCB table)</div>
<div class=kpis>
<div class=kpi><span>Manual should-cost{f' {VER}' if V2 else ''}, ex-works China</span><b>{gbp(C['exWorks'])}</b><span>{cny(C['exWorks'])}</span></div>
<div class=kpi><span>Manual{f' {VER}' if V2 else ''}, delivered UK duty paid</span><b>{gbp(C['delivered'])}</b><span>{cny(C['delivered'])}</span></div>
<div class=kpi><span>Tool (live run), ex-works China</span><b>{gbp(T['exWorks'])}</b><span>{cny(T['exWorks'])}</span></div>
<div class=kpi><span>Tool, delivered UK duty paid</span><b>{gbp(T['delivered'])}</b><span>{cny(T['delivered'])} · tool range {gbp(tool['confidenceBand']['totalLow'])}–{gbp(tool['confidenceBand']['totalHigh'])}</span></div>
</div>
{rec2}
<p><b>{'Against the tool' if V2 else 'Recommendation'}.</b> Use the manual figure, <b>{gbp(C['exWorks'])} ex-works</b>, as the should-cost target for a supplier discussion and the tool's {gbp(T['exWorks'])} as the upper bound until the board is confirmed. The tool is {gbp(gap)} ({gap / C['exWorks'] * 100:.0f} %) higher{THREE}</p>
{os.environ.get('CV_TOOL_NOTE', '')}
<p class=note><b>What this rests on.</b> Eight photos and the size you gave. One part number was read off a chip (2 × Infineon AURIX SAK-TC387QP-160F300S AE). Every other identity is a description and a package read from the photos; layer count (6) and via count (4,500) cannot be seen and are estimates. No BOM, drawing, Gerber or quote was supplied. Accuracy against a price paid is not measured.</p>
</div>

{v2sec}
<h2>1. Cost breakdown — manual and tool, per board</h2>
<table><tr><th>Element</th><th>Manual £</th><th>Manual ¥</th><th>Tool £</th><th>Tool ¥</th><th>Tool − manual</th></tr>{tbl}</table>
<div class=legend>{legend}</div>
<div class=sm style='margin-top:6px'>Manual ex-works</div>{stack(mv, C['exWorks'], scale)}
<div class=sm>Tool ex-works</div>{stack(tv, T['exWorks'], scale)}
<p class=sm>Not in either unit cost: the automotive programme NRE of £15,500 (PPAP, FMEA, DV/PV, audit) — £0.26 a board if spread over 60,000. Freight: the weighed board, 552 g, plus 0.12 kg of packaging by sea at £0.40/kg (the tool ships the 552 g alone); duty 3.7 % is the tool table's assumption (HS line not confirmed; a UK importer may pay 0 % under the applicable tariff line).</p>

<h2>2. Scope and inputs</h2>
<ul><li><b>Given:</b> annual volume 10,000, programme 6 years, China, board 395 × 215 mm, weight 552 g populated, conformal coating both sides.</li>
<li><b>Read off the photos</b> ({_RL_n} BOM lines, {_RL_q:,} parts, {_RL_smt:,} SMT placements incl. 50 test loops, 68 through-hole joints, 3 press-fit connectors + 2 press-in nuts): dual AURIX TC387, two safety PMICs (VQFN-48), 180 × 1206 discharge resistors (10 × 18 grid, marking 4642 = 46.4 kΩ), isolated HV sensing, flyback, hybrid polymer capacitors, a sealed 34-way customer connector and two 20-way press-fit headers.</li>
<li><b>Estimated:</b> 6 layers, 4,500 through vias, 1 oz copper, ENIG, controlled impedance, automotive grade 2; every rate not in the CostVision rate book (labelled amber in the workbook).</li>
<li><b>Rates:</b> CostVision rate book China (SMT high-speed line £{I['smtHS']:.2f}/h, SMT line £{I['smtStd']:.2f}/h, X-ray £{I['xray']:.2f}/h, ICT £{I['ict']:.2f}/h, operator £{I['opRate']:.2f}/h, technician £{I['techRate']:.2f}/h) and the CostVision PCB country table for China (board £/dm², ENIG, vias, impedance, coating £{I['coatRate']}/cm², freight).</li>
<li><b>Prices:</b> each part at a named catalogue analogue (CostVision catalogue, round 6) at the parts bought a year (qty × 10,000), or a stated engineering estimate where no analogue exists.</li></ul>

<h2 class=pb>3. Components — {gbp(C['components'])} a board</h2>
<table><tr><th>Price basis</th><th>Lines</th><th>Parts</th><th>£ a board</th><th>Share</th></tr>{kindrows}</table>
<h3>The 25 largest lines (manual)</h3>
<table><tr><th>RefDes</th><th>Description (as read)</th><th>Qty</th><th>Unit £</th><th>Line £</th><th>Price basis</th></tr>{comp}</table>
<p class=sm>The two AURIX MCUs are {gbp(AUR)} — {AUR / C['components'] * 100:.0f} % of the parts ({AURNOTE}). The full list, manual against tool, is in the appendix and the workbook.</p>

<h2 class=pb>4. Bare board — {gbp(C['fab'])} a board</h2>
<table><tr><th>Item</th><th>Build-up (manual)</th><th>£</th></tr>{pcbt}</table>
<h3>The tool's bare board, for comparison</h3>
<table><tr><th>Item</th><th>Tool formula</th><th>£</th></tr>{toolpcb}</table>
<p>The board would run 2-up on an 18 × 24 in production panel; the tool's panel list stops at 480 × 350 mm, so it costs the board 1-up at 51 % use. The larger difference is the automotive grade: the tool charges one class-3 microsection per panel ({gbp(15.16)}, so per board on a 1-up panel), where a fab sections coupons per lot.</p>

<h2>5. Assembly, test and coating — {gbp(C['conversionOHP'])} a board</h2>
<table><tr><th>Operation</th><th>Build-up (manual)</th><th>£</th></tr>{asm}</table>
<h3>The tool's assembly, for comparison ({gbp(T['assembly'])} + energy / packaging / cost of quality {gbp(T['other'])})</h3>
<table><tr><th>Item</th><th>Tool formula</th><th>£</th></tr>{toolasm}</table>
<p>The tool has no line for functional / HV insulation test, MCU programming, selective solder, press-fit or staking, coats one face (849 cm² of 1,698 cm²), and prices SMT at one placement a second on its table rate. Its cost of quality takes a rework rate of 30 % (2,008 placements × 800 ppm, capped) — the manual assumes a 97 % first-pass yield.</p>

<h3>One-off tooling and fixtures</h3>
<table><tr><th>Item</th><th>£</th></tr>{nret}</table>

<h2 class=pb>6. Reconciliation — tool to manual, ex-works</h2>
<table><tr><th>Step</th><th>£ a board</th></tr>{br}</table>
<p>The bridge closes to the penny (checked in the script that wrote this page). The component step is the largest: the tool prices every line without a part number from its automotive class range (median-to-upper end for "unread" ICs), where the manual names a typical automotive part for the function and takes its catalogue price at the parts bought a year. Neither is a quote: the manual is the cheaper reading of the same photos; a BOM file would settle it.</p>

<h2>7. What the live runs found in the tool</h2>
<ul>
{TOOLFIX}
<li><b>Fixed in this run:</b> a typed board size larger than 600 cm² was treated as an estimate and clamped to 332 × 181 mm. Measured / typed sizes are now kept up to 4,800 cm² (a production panel); estimated sizes are still bounded at 600 cm². With the fix the tool went £278.89 → £285.13 delivered. Test: <code>tests/pcb-measured-size-large-board.test.ts</code>.</li>
<li><b>Added in this run:</b> the PCB form had no board-weight field, so a weight could not be typed and freight used area × layers × 28 g/dm² = 1.43 kg. A "Board Weight, populated (g)" field now carries the weighed board to the costing (user evidence, kept by the evidence gate); 552 g took freight from £0.57 to £0.22 and the delivered figure to £284.76. Test: <code>tests/pcb-board-weight.test.ts</code>.</li>
{OPENOLD}{OPENLIST}</ul>

<h2>8. To confirm before using the figure</h2>
<ul><li><b>BOM file</b> (or a picture of it) — the largest open item: it replaces 70 estimated identities.</li>
<li>Close-ups of chip markings on the PMICs (U39/U40), isolation amplifiers, gate drivers and DC-DC controllers.</li>
<li>Layer count, via count and laminate (Gerber / drill files or the fab drawing).</li>
<li>The ASIL level from the safety concept (photos suggest ASIL-D; the tool now costs nothing ASIL-dependent until the engineer sets it).</li>
<li>Dana's contract prices for the AURIX TC387QP and the safety PMIC — the two largest lines.</li>
<li>The test strategy (ICT + FCT + HV insulation) and who owns the fixtures; coating material and keep-out areas.</li></ul>

<h2 class=pb>Appendix A — every line, manual against tool</h2>
<table><tr><th>RefDes</th><th>Description</th><th>Qty</th><th>Man. unit £</th><th>Man. line £</th><th>Tool unit £</th><th>Tool line £</th><th>Tool − man.</th><th>Tool price class</th></tr>{app}</table>
<h2 class=pb>Appendix B — inputs and their basis</h2>
<table><tr><th>Key</th><th>Value</th><th>Unit</th><th>Class</th><th>Basis</th></tr>{inputs}</table>
<p class=sm>Part B of this document is the tool's own PCBA should-cost report from the live run (CostVision, China, 10,000 boards, size typed 395 × 215 mm, weight typed 552 g), unchanged.</p>
</body></html>"""
open(os.path.join(OUT, 'manual-report.html'), 'w').write(doc)
print('ok', round(chk, 2))

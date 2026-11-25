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
e = lambda s: html.escape(str(s))
def gbp(x, d=2): return f"£{x:,.{d}f}"
def cny(x): return f"¥{x * FX:,.2f}"
def both(x): return f"{gbp(x)}<br><span class=ccy>{cny(x)}</span>"

man_rows = [('Components (parts list)', C['components'], T['components']),
            ('EMS material burden', C['burdenGBP'], T['burden']),
            ('Bare board' + (' (market ¥/m², automotive inside)' if V2 else ', standard'), C['fabStd'], T['fabStd']),
            ('Bare board, automotive grade', C['fabAuto'], T['fabAuto']),
            ('Assembly, test and coating (EMS price)', C['conversionOHP'], T['assembly']),
            ('Energy, packaging, cost of quality', C['quality'], T['other']),
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
bridge = [('Tool ex-works', T['exWorks'], True),
          ('Components: 70 lines priced at automotive class ranges in the tool, at named analogues here', C['components'] - T['components'], False),
          ('Material burden 7 % → 6 % on the lower parts total', C['burdenGBP'] - T['burden'], False),
          (('Bare board: tool build-up (1-up, vias charged on top) → ¥/m² sold by an automotive 4–6-layer fab' if V2 else 'Bare board, standard: 1-up on 480×350 mm (51 %) → 2-up on 18×24 in (61 %)'), C['fabStd'] - T['fabStd'], False),
          ('Automotive board grade: tool £15.16 microsection a panel + IATF + laminate + coupons → ' + ('inside the market ¥/m²' if V2 else '30 %'), C['fabAuto'] - T['fabAuto'], False),
          ('Assembly & test: functional / HV test, programming, selective solder, press-fit, coating both sides, staking added; effective line rate', C['conversionOHP'] - T['assembly'], False),
          ('Energy, packaging, cost of quality: tool rework rate capped at 30 % → FPY 97 %', C['quality'] - T['other'], False),
          ('One-off tooling and fixtures over 60,000 boards (tool: fixtures over the 10,000 order, inside assembly)', C['nrePerBoard'], False),
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
v2sec = ''; rec2 = ''
if V2 and V1:
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
doc = f"""<!doctype html><html><head><meta charset=utf-8><title>EDU control board should-cost</title><style>{css}</style></head><body>
<div class=cover>
<div class=sm>CostVision · PCB Image to BOM should-cost · 25 Nov 2026</div>
<h1>EDU control board PCBA — should-cost report{' (v2, cross-checked)' if V2 else ''}</h1>
<div>Dana TM4 Gemini CTRL board, PC-10465018-D (read off the photos) · 395 × 215 mm · 552 g · conformal coating on the entire board</div>
<div>Build in <b>China</b> · <b>10,000 boards a year</b> · <b>6-year programme</b> (60,000 boards) · £ per board, ¥ at {FX} CNY per £ (CostVision PCB table)</div>
<div class=kpis>
<div class=kpi><span>Manual should-cost{' v2' if V2 else ''}, ex-works China</span><b>{gbp(C['exWorks'])}</b><span>{cny(C['exWorks'])}</span></div>
<div class=kpi><span>Manual{' v2' if V2 else ''}, delivered UK duty paid</span><b>{gbp(C['delivered'])}</b><span>{cny(C['delivered'])}</span></div>
<div class=kpi><span>Tool (live run), ex-works China</span><b>{gbp(T['exWorks'])}</b><span>{cny(T['exWorks'])}</span></div>
<div class=kpi><span>Tool, delivered UK duty paid</span><b>{gbp(T['delivered'])}</b><span>{cny(T['delivered'])} · tool range £225.25–£413.70</span></div>
</div>
{rec2}
<p><b>{'Against the tool' if V2 else 'Recommendation'}.</b> Use the manual figure, <b>{gbp(C['exWorks'])} ex-works</b>, as the should-cost target for a supplier discussion and the tool's {gbp(T['exWorks'])} as the upper bound until the board is confirmed. The tool is {gbp(gap)} ({gap / C['exWorks'] * 100:.0f} %) higher, for three reasons shown in §6: it prices 70 of 71 parts lines at the top of an automotive class range because only the AURIX was read off a chip, it charges an IPC class-3 microsection on every board, and it leaves out functional test, programming, press-fit and the second coated face — which the manual adds back.</p>
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
<li><b>Read off the photos</b> (71 BOM lines, 2,080 parts, 2,054 SMT placements incl. 50 test loops, 68 through-hole joints, 3 press-fit connectors + 2 press-in nuts): dual AURIX TC387, two safety PMICs (VQFN-48), 180 × 1206 discharge resistors (10 × 18 grid, marking 4642 = 46.4 kΩ), isolated HV sensing, flyback, hybrid polymer capacitors, a sealed 34-way customer connector and two 20-way press-fit headers.</li>
<li><b>Estimated:</b> 6 layers, 4,500 through vias, 1 oz copper, ENIG, controlled impedance, automotive grade 2; every rate not in the CostVision rate book (labelled amber in the workbook).</li>
<li><b>Rates:</b> CostVision rate book China (SMT high-speed line £{I['smtHS']:.2f}/h, SMT line £{I['smtStd']:.2f}/h, X-ray £{I['xray']:.2f}/h, ICT £{I['ict']:.2f}/h, operator £{I['opRate']:.2f}/h, technician £{I['techRate']:.2f}/h) and the CostVision PCB country table for China (board £/dm², ENIG, vias, impedance, coating £{I['coatRate']}/cm², freight).</li>
<li><b>Prices:</b> each part at a named catalogue analogue (CostVision catalogue, round 6) at the parts bought a year (qty × 10,000), or a stated engineering estimate where no analogue exists.</li></ul>

<h2 class=pb>3. Components — {gbp(C['components'])} a board</h2>
<table><tr><th>Price basis</th><th>Lines</th><th>Parts</th><th>£ a board</th><th>Share</th></tr>{kindrows}</table>
<h3>The 25 largest lines (manual)</h3>
<table><tr><th>RefDes</th><th>Description (as read)</th><th>Qty</th><th>Unit £</th><th>Line £</th><th>Price basis</th></tr>{comp}</table>
<p class=sm>The two AURIX MCUs are {gbp(45.29)} — {45.29 / C['components'] * 100:.0f} % of the parts. Tool and manual price them alike (CostVision catalogue, TC387 family). The full list, manual against tool, is in the appendix and the workbook.</p>

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

<h2>7. What the live run found in the tool</h2>
<ul>
<li><b>Fixed in this run:</b> a typed board size larger than 600 cm² was treated as an estimate and clamped to 332 × 181 mm. Measured / typed sizes are now kept up to 4,800 cm² (a production panel); estimated sizes are still bounded at 600 cm². With the fix the tool went £278.89 → £285.13 delivered. Test: <code>tests/pcb-measured-size-large-board.test.ts</code>.</li>
<li><b>Added in this run:</b> the PCB form had no board-weight field, so a weight could not be typed and freight used area × layers × 28 g/dm² = 1.43 kg. A "Board Weight, populated (g)" field now carries the weighed board to the costing (user evidence, kept by the evidence gate); 552 g took freight from £0.57 to £0.22 and the delivered figure to £284.76. Test: <code>tests/pcb-board-weight.test.ts</code>.</li>
<li><b>Open (not changed):</b> panel list stops at 480 × 350 mm; class-3 microsection charged per panel, so per board on a large board; conformal coating one face only; no functional test, programming, press-fit or selective-solder line; a description containing "test points" or "probe pads" makes a part not fitted (£0); "CAN common-mode choke" falls into the shield-can (mechanical) class; one-off fixtures spread over the annual order, not the programme; the should-cost PDF via Calculate embeds full-resolution photos (42 MB).</li></ul>

<h2>8. To confirm before using the figure</h2>
<ul><li><b>BOM file</b> (or a picture of it) — the largest open item: it replaces 70 estimated identities.</li>
<li>Close-ups of chip markings on the PMICs (U39/U40), isolation amplifiers, gate drivers and DC-DC controllers.</li>
<li>Layer count, via count and laminate (Gerber / drill files or the fab drawing).</li>
<li>The ASIL level (photos suggest ASIL-D; the tool costs ASIL-B until a safety PMIC is named by part number).</li>
<li>The test strategy (ICT + FCT + HV insulation) and who owns the fixtures; coating material and keep-out areas.</li></ul>

<h2 class=pb>Appendix A — every line, manual against tool</h2>
<table><tr><th>RefDes</th><th>Description</th><th>Qty</th><th>Man. unit £</th><th>Man. line £</th><th>Tool unit £</th><th>Tool line £</th><th>Tool − man.</th><th>Tool price class</th></tr>{app}</table>
<h2 class=pb>Appendix B — inputs and their basis</h2>
<table><tr><th>Key</th><th>Value</th><th>Unit</th><th>Class</th><th>Basis</th></tr>{inputs}</table>
<p class=sm>Part B of this document is the tool's own PCBA should-cost report from the live run (CostVision, China, 10,000 boards, size typed 395 × 215 mm, weight typed 552 g), unchanged.</p>
</body></html>"""
open(os.path.join(OUT, 'manual-report.html'), 'w').write(doc)
print('ok', round(chk, 2))

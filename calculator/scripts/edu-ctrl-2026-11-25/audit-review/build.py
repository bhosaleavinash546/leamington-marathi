#!/usr/bin/env python3
"""Build the audit review (HTML for PDF, and a workbook) from review_data.py. Usage: python3 build.py <out-dir>"""
import os, sys, html, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from review_data import PAGES, TOOL_GAPS, MANUAL_GAPS, EARLIER
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
e = lambda s: html.escape(str(s))

# ── Revised figures: our corrections on the audit's structure (arithmetic here, printed in full) ──
V2 = dict(comp=126.32, fab=12.15, asm=19.52, qual=0.65, tool=0.52, nre=0.26)
PMIC_NEW, PMIC_V2 = 3.07, 7.6756          # audit: Newark $3.90 at 2,500 ÷ 1.27 (not re-confirmed: Newark 503)
DCDC_NEW, DCDC_V2 = 1.564, 1.7165         # analogue rejected → tool class range, QFN-16 DC-DC (lower-half midpoint)
IF_NEW, IF_V2 = 1.071, 1.5183             # analogue rejected → tool class range, TSSOP-20 interface
AURIX_LO, AURIX_HI = 8.9392, 16.56        # China own stock (v2) … audit working input ($21.04/1,000, not reproduced)
comp_lo = V2['comp'] + 2 * (PMIC_NEW - PMIC_V2) + 4 * (DCDC_NEW - DCDC_V2) + 2 * (IF_NEW - IF_V2)
comp_hi = comp_lo + 2 * (AURIX_HI - AURIX_LO)
BURDEN = 0.07
asm = 17.60 + 0.12                        # audit base + X-ray at the 1,000-board lot tier
fab_lo, fab_hi = 12.15, 16.00
def stack(comp, fab):
    burden = comp * BURDEN; rec = comp + burden + fab + asm + V2['qual']
    return dict(comp=comp, burden=burden, fab=fab, asm=asm, qual=V2['qual'], rec=rec, full=rec + V2['tool'] + V2['nre'])
LO, HI = stack(comp_lo, fab_lo), stack(comp_hi, fab_hi)
def invoice(s, aurix): return s['rec'] - (2 * aurix + 2 * PMIC_NEW) * (1 + BURDEN)
INV_LO, INV_HI = invoice(LO, AURIX_LO), invoice(HI, AURIX_HI)

cnt = collections.Counter(v.split(' ')[0] for _, _, rows in PAGES for _, v, _, _ in rows)
nrows = sum(len(r) for _, _, r in PAGES)

def badge(v):
    k = v.split(' ')[0]
    return f"<span class='b {k.lower()}'>{e(v)}</span>"

pages_html = ''
for pid, title, rows in PAGES:
    t = ''.join(f"<tr><td class=n>{pid}.{i}</td><td>{e(a)}</td><td>{badge(v)}</td><td>{e(w)}</td><td class=sm>{e(g)}</td></tr>" for i, (a, v, w, g) in enumerate(rows, 1))
    pages_html += f"<h3>{e(pid)} — {e(title)}</h3><table><tr><th>#</th><th>What the audit says</th><th>Verdict</th><th>Our review, with evidence</th><th>Gap</th></tr>{t}</table>"
wrong = ''.join(f"<li><b>{pid}.{i}</b> {e(a)} — {e(w)}</li>" for pid, _, rows in PAGES for i, (a, v, w, g) in enumerate(rows, 1) if v.startswith('DISAGREE'))
gaps = ''.join(f"<tr><td class=n>{e(g[0])}</td><td><b>{e(g[1])}</b><div class=sm>{e(g[2])}</div></td><td class=sm>{e(g[3])}</td><td class=sm>{e(g[4])}</td><td>{e(g[5])}</td><td class=sm>{e(g[6])}</td><td class=n>{e(g[7])}</td></tr>" for g in TOOL_GAPS)
mg = ''.join(f"<tr><td class=n>{e(m[0])}</td><td>{e(m[1])}</td><td class=sm>{e(m[2])}</td><td>{e(m[3])}</td></tr>" for m in MANUAL_GAPS)
ea = ''.join(f"<tr><td class=sm>{e(x[0])}</td><td>{e(x[1])}</td><td>{e(x[2])}</td><td class=sm>{e(x[3])}</td></tr>" for x in EARLIER)
g = lambda x: f"£{x:,.2f}"
rev = [('Components', V2['comp'], 129.10, LO['comp'], HI['comp'], 'PMIC at the audit\'s franchised reading £3.07 (not re-confirmed); DC-DC and interface analogues rejected → class range; AURIX £8.94 (low) … £16.56 (high)'),
       ('EMS material burden', 7.58, 6.45, LO['burden'], HI['burden'], '7 % — the tool\'s sourced rate at 10,000 boards'),
       ('Bare PCB', V2['fab'], 16.00, LO['fab'], HI['fab'], 'judgement range until a Gerber-based quote'),
       ('Assembly, test, coating', V2['asm'], 17.60, LO['asm'], HI['asm'], 'audit £17.60 (no mark-up on list prices) + X-ray at the 1,000-board lot tier £0.12'),
       ('Rework and scrap', V2['qual'], 0.50, LO['qual'], HI['qual'], 'kept: no packing is duplicated (P2.5)'),
       ('Recurring ex-works', 166.22, 169.65, LO['rec'], HI['rec'], ''),
       ('Tooling + programme NRE ÷ 60,000', 0.52, 0.78, 0.78, 0.78, '£31,400 + £15,500 over 60,000 boards'),
       ('Full-economic ex-works', 166.74, 170.43, LO['full'], HI['full'], ''),
       ('EMS invoice, AURIX + PMIC customer-supplied', None, 128.42, INV_LO, INV_HI, 'recurring less both pairs and their 7 % burden')]
revt = ''.join(f"<tr class='{'tot' if l.startswith(('Recurring', 'Full')) else ''}'><td>{e(l)}</td><td class=n>{'' if a is None else g(a)}</td><td class=n>{g(b)}</td><td class=n>{g(c)}</td><td class=n>{g(d)}</td><td class=sm>{e(n)}</td></tr>" for l, a, b, c, d, n in rev)
toolcount = collections.Counter(x[7] for x in TOOL_GAPS)

css = """@page{size:A4;margin:13mm 11mm 15mm}
:root{--ink:#1c2430;--mute:#5b6675;--line:#d7dde5;--band:#eef2f7;--acc:#1f3a5f}
body{font:8.8pt/1.4 "Segoe UI",Arial,sans-serif;color:var(--ink);background:#fff;margin:0}
h1{font-size:19pt;margin:0 0 4px;color:var(--acc)} h2{font-size:12.5pt;color:var(--acc);border-bottom:1.5px solid var(--acc);padding-bottom:3px;margin:16px 0 7px;break-after:avoid}
h3{font-size:10pt;margin:11px 0 4px;break-after:avoid} p{margin:4px 0 7px} ul{margin:4px 0 8px 16px;padding:0} li{margin:2px 0}
table{border-collapse:collapse;width:100%;margin:3px 0 9px} th{background:var(--acc);color:#fff;text-align:left;font-weight:600;padding:4px 5px;font-size:8pt}
td{border-bottom:1px solid var(--line);padding:3px 5px;vertical-align:top} tr{break-inside:avoid} td.n{white-space:nowrap;font-variant-numeric:tabular-nums} .sm{font-size:7.6pt;color:var(--mute)}
tr.tot td{font-weight:700;background:var(--band)} .cover{border:1px solid var(--line);padding:14px 16px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0} .kpi{border:1px solid var(--line);padding:7px 9px} .kpi b{display:block;font-size:14pt;color:var(--acc)} .kpi span{font-size:7.8pt;color:var(--mute)}
.b{font-size:7.4pt;font-weight:700;padding:1px 5px;border:1px solid;white-space:nowrap} .agree{color:#1d6b38;border-color:#9fd3b0;background:#eef8f1} .partly{color:#7a5a00;border-color:#e6cf8a;background:#fff8e6} .disagree{color:#9b1c1c;border-color:#efb1b1;background:#fdeeee} .open{color:#38507a;border-color:#b5c4e0;background:#eef2fa}
.pb{break-before:page} .note{background:#fff7e6;border:1px solid #f0d9a8;padding:7px 10px;margin:8px 0}"""
doc = f"""<!doctype html><html><head><meta charset=utf-8><title>EDU audit review</title><style>{css}</style></head><body>
<div class=cover><div class=sm>CostVision · PCB should-cost · review of the independent audit · 25 Nov 2026</div>
<h1>EDU control board — audit review and the PCB tool's gaps</h1>
<div>The 10-page audit of should-cost v2 (Dana TM4 Gemini CTRL, PC-10465018-D; China, 10,000 a year, 6 years), reviewed line by line against our model, the tool's code, prices re-read on 25 Nov 2026, and the five earlier PCB reviews in the repo.</div>
<div class=kpis>
<div class=kpi><span>Audit lines reviewed</span><b>{nrows}</b><span>{cnt['AGREE']} agree · {cnt['PARTLY']} partly · {cnt['DISAGREE']} wrong · {cnt['OPEN']} open</span></div>
<div class=kpi><span>Tool gaps</span><b>{len(TOOL_GAPS) - toolcount['done']}</b><span>{toolcount['P1']} P1 · {toolcount['P2']} P2 · {toolcount['P3']} P3 (+1 fixed this week)</span></div>
<div class=kpi><span>Our method errors</span><b>{len(MANUAL_GAPS)}</b><span>in the v2 manual model and report</span></div>
<div class=kpi><span>Revised recurring ex-works</span><b>{g(LO['rec'])}–{g(HI['rec'])}</b><span>full-economic {g(LO['full'])}–{g(HI['full'])}; invoice if AURIX + PMIC supplied {g(INV_LO)}–{g(INV_HI)}</span></div></div>
<p><b>Conclusion.</b> The audit is mostly right. Of its {nrows} lines we agree with {cnt['AGREE']} and partly with {cnt['PARTLY']}. {cnt['DISAGREE']} lines are wrong on three points, each with evidence: the 5 % material burden (the tool's sourced rate at 10k boards is 7 %), the "duplicate packing" (it is not duplicated; our label misled it), and an unsourced −10 % on catalogue prices applied inside its own base. {cnt['OPEN']} cannot be settled from any page — above all the AURIX, where v2's £8.94 is spot stock and the audit's £16.56 is a tier it could not reproduce. That one part moves the board by £15; only Dana's contract price settles it.</p>
<p><b>What it means for the tool.</b> The audit confirms what three earlier reviews flagged and did not change — bare-board rates and the automotive premium too high, assembly operations missing, set-up over the annual order. It adds five rule faults found on this board (test points free, class miscoding, panel list, microsection per board, vias on top of a per-area price). Together they explain most of the tool's £274.57. The fixes fall into four packages (§6); three need no new data.</p>
<p class=note><b>Two corrections to v2 we accept outright:</b> mark-up added on top of list prices (M-01, −£1.92) and analogues whose package does not match the board (M-03; confirmed on TI's own pages: LMR33630-Q1 is a 12-pin VQFN only, ISO7741QDWRQ1 a wide SOIC-16 — the board shows a QFN-16 and a TSSOP-20). Also a stale sentence in v2 (AURIX £45.29, 36 %) that was hard-coded.</p></div>

<h2>1. How this was reviewed</h2>
<ul><li>Each line of the audit (pages 1–10, photographed) was taken as a claim and checked against: the v2 model and workbook (live formulas), the tool's code (file and line named), the research files behind v2 (xcheck/*.json, verbatim quotes), and a fresh read of the disputed maker and distributor pages on 25 Nov 2026.</li>
<li><b>Fresh read:</b> TI's pages confirmed the packages (LMR33630-Q1 VQFN-HR 12; ISO7741QDWRQ1 SOIC-16 DW; AMC1311-Q1 SOIC-8 DWV) but load their prices in the browser, so neither side's TI price could be confirmed. Findchips returned no result for TLF35584QVVS2 or SAK-TC387QP-160F300S; Newark refused (503). These lines stay OPEN or "pending a read".</li>
<li>Earlier PCB reviews read for open items: <i>pcb-review-2026-10.md</i>, <i>pcb-pipeline-review / fixes 2026-10-09</i>, <i>pcb-360-review-2026-10-12.md</i>, <i>camera-board-360-2026-10.md</i>, <i>catalogue-round-6-2026-11-23.md</i>.</li></ul>

<h2>2. Revised figures — the audit's structure, our corrections</h2>
<table><tr><th>£ per board</th><th>v2</th><th>Audit</th><th>Revised low (AURIX £8.94)</th><th>Revised high (AURIX £16.56)</th><th>Basis</th></tr>{revt}</table>
<p class=sm>Arithmetic: components = 126.32 + 2 × (3.07 − 7.68) + 4 × (1.564 − 1.717) + 2 × (1.071 − 1.518) = {g(LO['comp'])}; high adds 2 × (16.56 − 8.94). Recurring = components × 1.07 + board + {g(asm)} + £0.65. Not a quote: a range until the BOM, the AURIX / PMIC contract prices and a fab quote arrive.</p>

<h2 class=pb>3. The audit, page by page and line by line</h2>{pages_html}

<h2 class=pb>4. Where the audit is wrong</h2><ul>{wrong}</ul>

<h2>5. Gaps in the PCB tool</h2>
<table><tr><th>Id</th><th>Gap and where it is in the code</th><th>Seen before</th><th>Effect on this board</th><th>Fix</th><th>Evidence needed</th><th>Pri.</th></tr>{gaps}</table>

<h2 class=pb>6. Proposed fix packages (for approval)</h2>
<table><tr><th>Package</th><th>Gaps</th><th>Needs new data?</th><th>What changes</th></tr>
<tr><td><b>A — Stop mispricing</b></td><td>G-01, G-02, G-03, G-04, G-08, G-14, G-15, G-19</td><td>no (rules, inputs, panel sizes read)</td><td>Test points priced; class by type then package; production panels; sampling cadence input; lot size + programme years; analogue package check; ASIL as an input; FX printed. Each with a test on this board's lines.</td></tr>
<tr><td><b>B — Missing operations and views</b></td><td>G-07, G-09, G-10, G-11, G-18</td><td>partly (JLCPCB / Huaqiu fees read; test times need a quote)</td><td>Press-fit, programming, functional / HV test, second coated face, second reflow; recurring / full-economic / EMS-invoice lines with a customer-supplied flag; delivery terms and duty as scenarios; FPY input; RFQ checklist.</td></tr>
<tr><td><b>C — Rates from market evidence</b></td><td>G-05, G-06, G-12, G-13</td><td>yes — a dated rate refresh</td><td>Vias inside the per-area price to a density; China fab rates and the automotive premium re-based on fab ASPs; China SMT per joint; class rows from round 6 prices; TLF35584 entry re-read. Through scripts/pcb-rate-refresh.ts and the catalogue merge, never by hand.</td></tr>
<tr><td><b>D — Reporting</b></td><td>G-16, G-17</td><td>partly</td><td>Band basis printed (conditional v judgement); fab spec inputs added, the unpriced ones listed as not costed.</td></tr></table>
<p>Each package ends with the EDU board, the radar board and the camera board (the one PCB with a price paid, £17.00) re-run live, and the change in each headline explained line by line. Nothing is tuned to a price paid.</p>

<h2>7. Our own method — what v2 got wrong</h2>
<table><tr><th>Id</th><th>Error</th><th>Where</th><th>Correction</th></tr>{mg}</table>

<h2>8. Earlier PCB reviews — items still open</h2>
<table><tr><th>Review</th><th>Item</th><th>Status now</th><th>Gap</th></tr>{ea}</table>
<p class=sm>Three reviews (6 Oct camera board, 9 Oct pipeline, 12 Oct 360) flagged the fab rates, via adders and automotive premium as high or unsourced and did not change them because "the evidence was too weak to move a table". The EDU research now has stronger evidence (automotive fab ASPs from annual reports and a prospectus, Chinese EMS list prices), so package C is the point to act.</p>
</body></html>"""
open(os.path.join(OUT, 'audit-review.html'), 'w').write(doc)

# ── Workbook ──
wb = Workbook(); HDR = PatternFill('solid', fgColor='1F3A5F'); HF = Font(bold=True, color='FFFFFF')
def sheet(ws, head, rows, widths):
    for i, h in enumerate(head, 1):
        c = ws.cell(1, i, h); c.fill = HDR; c.font = HF; c.alignment = Alignment(wrap_text=True, vertical='top')
    for r, row in enumerate(rows, 2):
        for i, v in enumerate(row, 1): ws.cell(r, i, v).alignment = Alignment(wrap_text=True, vertical='top')
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
ws = wb.active; ws.title = 'Audit lines'
sheet(ws, ['Page', '#', 'What the audit says', 'Verdict', 'Our review', 'Gap'], [(pid, f"{pid}.{i}", a, v, w, gg) for pid, _, rows in PAGES for i, (a, v, w, gg) in enumerate(rows, 1)], [7, 7, 60, 14, 80, 14])
sheet(wb.create_sheet('Tool gaps'), ['Id', 'Gap', 'Code', 'Seen before', 'Effect on EDU', 'Fix', 'Evidence needed', 'Priority'], TOOL_GAPS, [6, 34, 50, 30, 28, 60, 24, 8])
sheet(wb.create_sheet('Method errors'), ['Id', 'Error', 'Where', 'Correction'], MANUAL_GAPS, [6, 60, 24, 70])
sheet(wb.create_sheet('Earlier reviews'), ['Review', 'Item', 'Status', 'Gap'], EARLIER, [34, 60, 34, 14])
wr = wb.create_sheet('Revised')
sheet(wr, ['Input', 'Value', 'Note'], [], [44, 12, 70])
inputs = [('v2 components', 126.32, 'v2'), ('PMIC each, audit reading (£)', PMIC_NEW, 'Newark $3.90 @2,500 ÷ 1.27 — not re-confirmed'), ('PMIC each, v2', PMIC_V2, ''), ('DC-DC each, class range', DCDC_NEW, 'tool class row'), ('DC-DC each, v2', DCDC_V2, ''),
          ('Interface each, class range', IF_NEW, 'tool class row'), ('Interface each, v2', IF_V2, ''), ('AURIX each, low', AURIX_LO, 'China own stock (v2)'), ('AURIX each, high', AURIX_HI, 'audit working input, not reproduced'),
          ('Material burden', BURDEN, 'tool sourced rate at 10k boards'), ('Bare PCB low', fab_lo, ''), ('Bare PCB high', fab_hi, ''), ('Assembly, test, coating', asm, 'audit 17.60 + X-ray lot tier 0.12'), ('Rework and scrap', 0.65, ''), ('Tooling + NRE ÷ 60,000', 0.78, '')]
for r, (k, v, n) in enumerate(inputs, 2): wr.cell(r, 1, k); wr.cell(r, 2, v); wr.cell(r, 3, n)
f = {'compLo': '=B2+2*(B3-B4)+4*(B5-B6)+2*(B7-B8)', 'compHi': '=B19+2*(B10-B9)'}
calc = [('Components, low', f['compLo']), ('Components, high', f['compHi']), ('Recurring, low', '=B19*(1+B11)+B12+B14+B15'), ('Recurring, high', '=B20*(1+B11)+B13+B14+B15'),
        ('Full-economic, low', '=B21+B16'), ('Full-economic, high', '=B22+B16'), ('EMS invoice, low', '=B21-(2*B9+2*B3)*(1+B11)'), ('EMS invoice, high', '=B22-(2*B10+2*B3)*(1+B11)')]
for r, (k, fm) in enumerate(calc, 19): wr.cell(r, 1, k).font = Font(bold=True); c = wr.cell(r, 2, fm); c.number_format = '£#,##0.00'
wb.save(os.path.join(OUT, 'audit-review.xlsx'))
print({k: round(v, 2) for k, v in dict(compLo=LO['comp'], compHi=HI['comp'], recLo=LO['rec'], recHi=HI['rec'], fullLo=LO['full'], fullHi=HI['full'], invLo=INV_LO, invHi=INV_HI).items()}, dict(cnt), nrows)

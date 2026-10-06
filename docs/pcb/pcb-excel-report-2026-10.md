# PCB Excel report — design, build and audit (Oct 2026)

The PCB photo results export a professional six-tab workbook (`Excel report`) and the matching
PDF (`PDF report`); the older analysis PDF stays as `Analysis PDF`. The previous "Excel" export was
an HTML page saved as `.xls` (Excel warned on opening; no tabs, styles or charts).

## The workbook — from the answer to the evidence

| Tab | What it holds |
|---|---|
| Summary | KPI tiles (delivered, ex-works, likely range, one-time NRE), cost-composition donut with its legend table, key facts, top cost drivers, what this tells you, what to verify, what is not in the unit cost |
| Cost Breakdown | the cost stack — ex-works subtotal and delivered total are formulas; % of delivered, share bars, £/year from the annual-volume input (blue), basis per line, a check against the analysis total |
| Bill of Materials | every line: qty × unit by formula, % of components, **priced from** (catalogue / range, colour + text), **Quote** where a £1+ line has no distributor price, filter, SUBTOTAL totals, reconciliation to the components row |
| Board & Assembly | specification (measured / estimated stated), bare-board build-up summing to the fab cost, assembly & test, the uploaded photographs |
| Countries | the board costed in each country: components + EMS burden, board, assembly, other, ex-works, freight & duty, delivered, Δ vs the costed country (+ dearer / − cheaper, in words too), lead time; stacked bar chart |
| Volume & Notes | volume curve (table + log-scale chart), one-time NRE (per board in year 1), functional safety, analysis checks, limitations, method & sources |

Content comes from `buildPcbaReport` (`src/export/pcba-report-data.ts`) — the model the PDF prints —
so the two never disagree. Nothing in the workbook prices anything: per-board figures are the
analysis's; totals, percentages and deltas are live formulas with cached results.

## Build
- `src/export/pcb-workbook.ts` (ExcelJS, lazy chunk) — sheets, styles, formulas, print setup.
- `src/export/xlsx-charts.ts` — native DrawingML charts (doughnut, bar/stacked, line, log-x scatter)
  added to the saved file, each series pointing at the sheet's cells.
- `src/brand/logo-png.ts` — the logo as a 2× PNG (`node scripts/brand-logo-png.mjs`), top-left on every sheet.
- `src/ui/pcb/export-workbook.ts` — browser glue: photos downscaled to 900 px JPEG, download.
- Calibri throughout (brand.json `officeBody`; LibreOffice uses metric-compatible Carlito).

## Design and audit
1. A UI/UX design spec (tab story, chrome, tokens, number formats, per-tab layout, print, accessibility).
2. Built to it, then recalculated in LibreOffice (`recalc.py`: 185 formulas, 0 errors) and every formula
   result compared with the analysis figure written into the file (0 mismatches).
3. An independent UI/UX audit of the rendered pages: **7/10, 23 findings** (2 critical: print scaling
   made the Summary ~5 pt on A4, a long BOM forced onto one page; high: "87%" beside a table reading
   83%, "Components" meaning two things, a category axis that spaced 100 → 250,000 evenly, freight "–"
   read as zero, a clipped column). All fixed and re-audited: **8/10** (11 print-polish items: Countries chart onto its own page, header rows
   repeated on continuation pages, Summary page 1 with the top drivers, freight shown as £0.00 rather than a
   formatted "<£0.01" over a stored zero, a log axis bounded to the data…), fixed, then **9/10 — no Critical,
   High or Medium issues; ready to ship**. Open (Low, accepted): the range caveat appears in three places on the
   Summary; volume-chart y labels sit close to the plot edge; the donut could be smaller.

Sample: `docs/pcb/screens/camera-report-2026-10-06.xlsx` (`npx tsx scripts/pcb-workbook-sample.ts out.xlsx`).
Tests: `tests/pcb-workbook.test.ts`; the camera e2e downloads both reports and checks them.

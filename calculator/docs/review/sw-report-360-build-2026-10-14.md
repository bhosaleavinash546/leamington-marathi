# 360° software should-cost report — build (14 Oct 2026)

Plan: `docs/plans/sw-report-360-plan-2026-10-14.md` (approved with the recommended defaults: five body types, the brand light
palette for PDF and Excel, live formula chains in Excel, every module in full in the Vehicle PDF).

## What was built

```
computeSWProgram ─► buildSWReportModel(result, request)   src/engine/sw-report-model.ts   (pure, tested)
                         │  sections · domains · modules (lines + arithmetic + grade) · components (numbered) · skeleton views · checks
                         ├─► renderSWReportPdf(doc, autoTable, model, images)      src/export/sw-report-pdf.ts
                         └─► buildSWReportWorkbook(model, { images })              src/export/sw-report-xlsx.ts
pictures: reportImageSpecs(model) → SVG (src/export/sw-report-skeleton.ts) → PNG (src/export/svg-raster.ts: browser canvas, or headless Chromium)
request:  buildSWReportRequest(result, { options, title, … })   src/export/sw-report-request.ts (screen, scripts and tests alike)
screen:   Report tab → "Export a report": type, scope, body, prepared by / for, reference, confidentiality   src/ui/panels/sw-report-export.ts
```

- **The engine carries each module's arithmetic** (`SWModuleCostResult.chain`): nominal PM → calibration → reuse → ASIL →
  bucket PM (`SW_DEV_SPLIT`) → × effort rate × platform share = development £, the fractions behind verification /
  integration / cyber / calibration / ML, engineer-years and the seat price, the maintenance base and %. The report prints
  this chain; it never recomputes it. A test proves Σ bucket PM × rate × share = development £ for every module of three demos.
- **Profiles** (`SW_REPORT_PROFILES`): Vehicle (full 360°), Executive summary, Domain, Module, Supplier / negotiation, Hub &
  country. A focused report is a SLICE of the vehicle costing: its module figures are the vehicle's, and homologation and the
  fixed cloud platform stay with the vehicle (listed, never re-allocated).
- **Skeleton**: the screen's component map drawn self-contained (inline styles) for SUV, saloon, hatchback, pickup and van;
  parts placed by vehicle zone (piecewise x-map per body), a separation pass so no number hides another, colour = highest
  ASIL (sequential navy ramp) or modules per part, every lit part numbered against the component table, out-of-scope
  software hatched. Never £ per component. Labelled "schematic top view, not to scale".
- **PDF** (Vehicle): cover with the skeleton and KPI tiles · contents + report details · executive summary · vehicle and
  programme · E/E architecture (numbered skeleton, component table, modules-per-part view) · how the cost is built (the
  studio's seven steps as a storyboard of mini skeletons) · cost build-up (waterfall + exact check) · one spread per domain
  (skeleton, tiles, module bars and table, drivers, exclusions) · **one sheet per module** (its parts lit, the effort chain,
  every development / verification / engineering / lifecycle line with its arithmetic and evidence grade, lifecycle spend
  by year) · lifecycle and unit economics · spend by year (stacked columns) · engineering rate (build-up, sources) · hubs and
  countries · risk (histogram with P10 / P50 / P90 / headline, tornado) · evidence · make or buy and the quote check · scope
  (hatched skeleton, exclusions, catalogue gaps, limitations) · appendix (module × cost element matrix + the model's checks).
- **Excel**: Cover · Contents (links) · Summary (tiles, findings, domain table, doughnut + bars) · Architecture · Cost
  build-up (waterfall) · one sheet per domain (skeleton, module table, chart) · Module register · Module detail · Rates ·
  Unit economics · Spend by year · Hubs · Countries · Risk · Make or buy · Evidence · Assumptions · Scope · **Checks**.
  Totals are formulas in one chain: Rates (hub mid / senior → blend → × source × burden → loaded rate; tool seat and its
  discount factor; maintenance weights and discount factors as formulas) → Module detail (every module's chain as formulas)
  → Module register → domain sheets → Cost build-up → Summary. Royalties, cloud, homologation and the fixed platform enter
  as labelled engine values. Every formula caches the engine's figure (reads correctly before recalculation).

## How it was proved

- `tests/sw-report-model.test.ts` (13): the chain, every check passing on four demos (PHEV, BEV, ICE, MHEV), each module once,
  domains = engine by category, drivetrain-correct architecture, nothing invented, slices, every profile, the skeleton is
  self-contained, prints no money, every body type.
- `tests/sw-report-xlsx.test.ts` (6): the plan's sheets, formula chain to Rates, currency linearity (€ = £ × FX), slices, and —
  where LibreOffice is installed — `scripts/sw-report/xlsx-recalc-check.py`: recalculation forced on load, **0 formula
  errors, every check ✓**, then the senior share is changed and the checks must fail (the chain is live).
- `tests/sw-rr-phev-review.test.ts`: the PDF through the new model and renderer (every module by full name, homologation and
  the exact check, no enum / NaN / undefined / float noise, every hub and country, catalogue gaps, page x of y).
- Headless samples: `npx tsx scripts/sw-report/report-sample.ts <outdir> [demo] [profile] [hub] [body]` (pictures through
  headless Chromium), `scripts/sw-report/skeleton-sample.ts` (every view and body).

Range Rover L460 PHEV, UK, 200k / yr × 6 yr: model 319 checks, 0 failed · PDF 93 pages (47 module sheets) · workbook 25
sheets, LibreOffice 0 formula errors, 122 / 122 checks ✓; senior share 55 % → 90 % moves 120 of them.

## Limits stated in the reports

- Accuracy is not measured (no logged programme actuals); the checks prove the arithmetic, not the inputs.
- The skeleton is schematic: parts by vehicle zone, not measured from the vehicle.
- In Excel, spend by year, hubs, risk and make-or-buy are the engine's values (each an engine re-run); the cost chain is live.

# Plan: 360° software should-cost report (PDF + Excel), any vehicle, vehicle-level and focused reports

Status: **proposal, for approval** (14 Oct 2026). Nothing in this plan is built yet.

## 1. What the reader should get

A report that reads top-down, the way an engineering director thinks about a car:

```
Vehicle  →  E/E architecture (where the software runs)  →  Domains  →  Modules  →  Cost elements  →  Lines & sources  →  Rates
   ↓                                                                                                                  ↓
 Decisions: risk, sensitivity, hubs & countries, make or buy, supplier check            Evidence: every figure has a grade and a source
```

At every level the reader sees:
- **the picture:** the vehicle skeleton with that level's components lit;
- **the money:** chart and table;
- **the reason:** drivers, assumptions and sources.

**Rules carried over:**
- Every number is read off the engine's result, or the engine re-run (another hub, a sensitivity case). Nothing is recomputed in the exporter.
- Every total ties back to the level above with an exact check line.
- No figure without its source.

## 2. One report model, many reports

**Architecture.** A single pure function builds a *report model*. Two renderers draw it:

```
computeSWProgram(result) ─► buildSWReportModel(result, request)  ─►  renderPdf(model)    (jsPDF, vector charts, skeleton images)
                                     │                             └─►  renderExcel(model)  (ExcelJS, brand styling, native charts, live formulas)
                                     └─ sections[]: { id, title, level, figures, tables, charts, skeleton, notes, sources }
```

- `src/engine/sw-report-model.ts`: pure, testable headless. It holds the sections, their order, the data and the reconciliation checks.
- `src/export/sw-report-pdf.ts`: rebuilt to draw a model. The current 20-page report becomes the "Vehicle" profile.
- `src/export/sw-report-xlsx.ts`: new. It replaces the SheetJS export, whose community build cannot colour cells, with ExcelJS, like the PCB workbook.
- The PDF and the Excel come from the same model, so they cannot disagree.

**Report types (profiles).** All are generated from the same costing:

| Report | Scope | Typical reader | Length |
|---|---|---|---|
| **Vehicle (full 360°)** | every domain and module | programme director, finance | 30–40 pages / 20+ sheets |
| **Executive summary** | headline, domains, top drivers, range, hubs | president / board | 3–4 pages |
| **Domain** | one or more domains (e.g. ADAS + Infotainment) | domain chief engineer | 8–15 pages |
| **Module** | one module, every line to the last bit | module owner, purchasing | 5–8 pages |
| **Supplier / negotiation** | quote check, target price, effort v rate gap, make or buy | purchasing | 4–6 pages |
| **Hub & country** | all hubs and countries, rate build-ups | sourcing / footprint | 6–10 pages |

**A focused report is a slice of the vehicle costing, not a re-costing in isolation.** Its module figures are the vehicle costing's. Programme-level items (homologation, fixed cloud platform, the shared tool seats) are shown as a separate line with the rule stated, so a domain report never quietly re-allocates them.

**Export dialog** (replaces the two buttons). It sets:
- report type;
- scope (domain / module pickers);
- sections on/off;
- currency (page currency by default);
- prepared by / for, the confidentiality label, and the document reference.

These are typed by the user and never invented.

## 3. The flow, section by section (Vehicle profile)

| # | Section | Picture | Money | Reason |
|---|---|---|---|---|
| 0 | Cover | vehicle skeleton, all in-scope components lit | headline KPI tiles | "Read this first": basis, evidence share, accuracy statement |
| 1 | Executive summary | small skeleton + domain bar | total, per vehicle, NRE / lifecycle, P10–P90, hub range | 5 findings computed from the result |
| 2 | Vehicle & programme definition | — | — | inputs, vehicle facts each with its page, user-typed metadata |
| 3 | **E/E architecture: where the software runs** | **full skeleton, labelled ECUs, sensors, actuators and networks, coloured by highest ASIL or by number of modules (never £ — a module on four ECUs is not split four ways)** | modules per component | component legend; what each component does |
| 4 | How the cost is built | the 7-step costing walk-through as a strip, each step a mini skeleton with its modules lit (as in the studio animation, frozen per step) | each step's figure | formulas |
| 5 | Cost build-up | — | waterfall: buckets → NRE → lifecycle → total; check line | — |
| 6 | **Domains, one spread each** (7 for a full car) | **skeleton with only that domain's components lit** | domain total, NRE v lifecycle bar, module table, its share of the vehicle | domain drivers (largest modules, ASIL mix, reuse), domain exclusions |
| 7 | **Modules, one block each** (all in scope) | **mini skeleton with the module's components lit** | the full build-up: requirements / architecture / algorithms / implementation / safety; SIL / MIL / HIL / regression / pen-test / scenarios; integration, cyber, calibration, tools; maintenance by year; royalties, IP, cloud | catalogue PM → reuse → ASIL → complexity → costed PM → × rate; every lifecycle line's basis and grade |
| 8 | Lifecycle & unit economics | — | per vehicle built, per vehicle-year, fixed per year; reconciliation | sources (Avanci, Cerence, OEM service terms…) |
| 9 | Spend by year | — | stacked columns, development → production → service years | phasing rule |
| 10 | Rates | — | hub rate build-up: salary → on-cost → hours → £/PM → burden → loaded | every salary observation with URL |
| 11 | Hubs & countries | — | all hubs re-costed (bars + table); every country → hub | nearest-hub reasons |
| 12 | Risk | — | Monte Carlo histogram with P-markers, tornado | evidence-grade ranges |
| 13 | Evidence & sources | — | grade shares, largest unsourced amounts, your figures, calibration priorities | assumptions register |
| 14 | Make or buy & supplier check | — | per-domain make / Tier-1 / start-up; quote gaps | margin sources |
| 15 | Scope, exclusions, limitations | skeleton with excluded / gap areas greyed | — | catalogue gaps, your modules, limitations |
| A | Appendices | — | full module × bucket matrix, independent-trace summary | — |

**"Down to the last bit"** means the Module blocks: every costed line of a module, with its arithmetic shown. This is the per-module trace that `scripts/sw-review/rr-phev-trace.ts` already proves to the penny, printed in the report.

## 4. The skeleton in the report

- **Source.** The same builder as the screen (`sw-vehicle-skeleton.ts`, pure `(data) → SVG`) and the same module → component map (`sw-vehicle-map.ts`, 41 components). The report shows exactly what the tool shows.
- **States.** One function, `skeletonFor(model, focus)`, gives each view its lit set: all in scope, a domain, a module, a costing step, or excluded / gaps (greyed).
- **Colour, never £:**
  - by highest ASIL on the component (QM → D, the validated sequential ramp);
  - or by number of modules;
  - legend and labels always in text, so the colour is never the only cue.
- **Rendering:**
  - **Browser:** SVG → `Image` → canvas at 2–3× → PNG. `doc.addImage` for the PDF; `workbook.addImage` for ExcelJS (crisp, any viewer).
  - **Headless** (scripts / tests): the same SVG rasterised through the Playwright Chromium already in the repo, so CI can produce the same report.
- **Any model.** The skeleton is a top view; components are placed by vehicle zone (front, cabin, rear, under-floor), not by a specific car. The body outline gets a type: SUV (today), saloon, hatchback, pickup, van. It is taken from the programme or picked in the dialog. Positions scale with the outline, so no new map is needed per car. Components follow the drivetrain (ICE / MHEV / PHEV / BEV) as the screen does today.
- **Animation.** A PDF and an Excel cannot animate. The studio's animation becomes a **step strip**: seven small skeletons in sequence, each with its step's figure, the way a storyboard freezes motion.

## 5. The Excel workbook (professional, brand-styled, auditable)

**Look.**
- Brand tokens from `brand.json` (navy `#16325C`, blue `#1D6FB8`, teal, amber, red, and the tinted fills). The PDF moves to the same tokens, so both match the tool's light theme.
- Calibri, logo on every sheet, frozen header rows, banded tables.
- Money as numbers with currency formats; grade badges as coloured cells with the word.
- Print set-up: A4 landscape, fit to width, repeated headers.

**Sheets:**

| Sheet | Content | Charts (native, editable) |
|---|---|---|
| Cover | programme, KPI tiles, skeleton image, document reference | — |
| Contents | hyperlinks to every sheet | — |
| Executive summary | KPIs, findings, domain table | doughnut: NRE v lifecycle; bar: domains |
| Vehicle architecture | skeleton image; component table (modules on each, highest ASIL) | — |
| Cost build-up | buckets → subtotals → total (**live formulas**) | waterfall-style stacked bar |
| Domain_A … Domain_G | one per domain: skeleton image, module table, subtotals (formulas) | bar per module |
| Module register | every module × every bucket (≈ 52 × 20); row and column totals as formulas | — |
| Module detail | per module: PM chain (catalogue → reuse → ASIL → complexity → costed), sub-buckets, yearly maintenance, royalties, IP, cloud; each a formula on visible inputs | — |
| Rates | hub build-up as a formula chain (salary × (1+on-cost) ÷ hours × 152 ÷ FX × blend × source × burden) | — |
| Spend by year | years × kinds, with formulas | stacked column |
| Unit economics | the reconciliation as formulas | — |
| Hubs | all hubs | bar |
| Countries | every country → hub | — |
| Risk | MC bins, P-values, sensitivity | column histogram, tornado (bar) |
| Evidence | every line with grade, basis and source | doughnut by grade |
| Your figures · Calibration · Assumptions · Exclusions | as now | — |
| **Checks** | every total recomputed by formulas against the engine's value: ✓ / ✗ | — |

**Auditability.**
- Totals are formulas, not pasted numbers. A reviewer can change a rate on the Rates sheet and watch the vehicle total move.
- The Checks sheet must show all ✓ after a LibreOffice recalculation: 0 formula errors, the same proof the PCB workbook uses.

## 6. Any model, and nothing invented

- The model reads only the costing:
  - any demo, any user programme, any drivetrain;
  - user-defined modules (they appear in their domain, marked "your module");
  - quotes and registers (marked "your figure").
- **Vehicle text:**
  - Vehicle facts appear only when the demo carries checked facts with pages (as the L460 now does).
  - Otherwise the section prints the user's typed metadata.
  - Otherwise it prints "not provided". No generated descriptions.
- **Body type and components:** taken from the programme or picked in the dialog. If unknown, the generic SUV top view with a "schematic" label.

## 7. How it is proved

1. **Model tests:**
   - every section reconciles to the engine to 1p;
   - every module appears once;
   - focused reports' slices add up to the vehicle report's figures;
   - nothing is printed without a source field.
2. **PDF:** text-level checks (no enum, NaN or undefined; every module name; page x of y). Every page is rendered with PyMuPDF and looked at for overlap and overflow, for each profile.
3. **Excel:**
   - Open in LibreOffice headless, recalculate, and require 0 formula errors with the Checks sheet all ✓.
   - Charts render (a LibreOffice → PDF export, eyeballed).
   - Colours and widths reviewed sheet by sheet.
4. **Live, real server and browser** (`e2e/sw-report-live.ts`):
   - each profile for the L460 PHEV;
   - one BEV and one ICE demo, plus a user programme with your-modules and quotes;
   - every hub for the vehicle profile;
   - the export dialog checked with axe.
5. **Independent review:** a reviewer agent that did not build the report reads the outputs line by line, as was done for the Range Rover report, and its findings are fixed before delivery.

## 8. Build order

| Phase | Content | Done when |
|---|---|---|
| R1 | Report model + export dialog + skeleton rasteriser (states, body types, ASIL colouring) | model tests pass; skeleton PNGs reviewed |
| R2 | Vehicle PDF on the model: architecture section, domain spreads, module blocks, step strip, brand tokens | page-by-page render review clean |
| R3 | Excel on ExcelJS: styling, images, native charts, formula chains, Checks sheet | LibreOffice recalculation: 0 errors, Checks all ✓ |
| R4 | Focused profiles: Executive, Domain, Module, Supplier, Hub & country | each profile's slice reconciles to the vehicle report |
| R5 | Live runs (L460 PHEV, a BEV, an ICE, a user programme), independent line-by-line review, fixes, docs, deliverables | review findings closed |

## 9. Decisions (recommended default first)

1. **Body types for the skeleton:** SUV + saloon + hatchback + pickup + van, from one zone-based map *(recommended)*; or SUV only for now.
2. **Theme for exports:** the brand light palette (`brand.json`) for both PDF and Excel *(recommended: printable, matches the light theme)*; or a dark-green cover with a light body.
3. **Excel formulas:** live formula chains from the inputs to the totals *(recommended: auditable)*; or values only (simpler, smaller).
4. **Module blocks in the vehicle PDF:** every module in full *(recommended for the 360° report)*, with the Executive profile as the short form; or the top 15 in full and the rest as a table.

# Global Cost Engineering KPI Dashboard — build (11 Nov 2026)

Spec: `CostVision_KPI_Dashboard_Spec.md` (user upload). Stage 1 audit and the four decisions:
`kpi-dashboard-audit-2026-11-11.md`. Decisions taken by the user, 11 Nov 2026:

| Decision | Chosen |
|---|---|
| Data scope | CostVision's own saved costings now; CSS System / CPSC II through a CSV / Excel import (template) until JLR supplies their column lists |
| Record fields | A details step on save ("Save to KPI Dashboard"): part number, programme, model year, powertrain, status, current cost + currency + terms. The costing itself is unchanged |
| Visibility | Every signed-in user sees every eligible record, read-only. Excluded records, FX loads, recalculation, import and the audit log are admin-only |
| FX policy | Approved monthly table (admin-loaded); until a rate is loaded the built-in rate-book FX (Oct 2026 round) is used and labelled "reference, not approved" |

## Where things live

| Layer | File |
|---|---|
| Reporting model + every KPI rule (pure) | `src/engine/kpi-dashboard.ts` |
| Tables, FX snapshot, recalculation, audit | `server/data/kpi-store.ts` (`costing_records`, `fx_rates`, `kpi_audit`) |
| FX file + record import parsers | `server/utils/kpi-import.ts` |
| API (`/api/kpi`, behind sign-in) | `server/routes/kpi.ts` |
| Screen | `src/ui/kpi-dashboard/` (view, builders, charts, exports, save dialog), `src/ui/styles/kpi-dashboard.css` (prefix `kd-`) |
| Wiring | `main.ts` `showKpiDashboard` / `openSaveToDashboard`; nav button `#kpi-btn`; view `#kpi-view`; action `#save-dashboard-btn` |

The full CostVision costing stays in `scenarios` (linked by `source_ref`); `costing_records` holds the classification,
the ORIGINAL values with their currencies, and the frozen FX snapshot + GBP values. It is not a second costing database.

## Rules (tested in `tests/kpi-dashboard*.test.ts`)

- **Excluded**: deleted (soft), test, or invalid (bad ISO 4217 code, negative cost, no name, no date). Counted in data
  quality, listed for admins, in no KPI or chart.
- **Identity**: a component is its PART NUMBER (upper case, no spaces). An application is part number × programme ×
  model year × powertrain. Names never merge records. No part number → its own application, flagged "unidentified".
- **Current record**: newest non-draft in an application (newest draft if all are drafts). A record its own owner has
  since revised is an older revision; another owner's latest costing is a duplicate candidate. Classification runs on
  the whole set BEFORE filters. Activity charts count every save; financial KPIs count current records only.
- **Money**: each value × its own frozen GBP-per-unit rate. Gap = GBP current − GBP should; gap % = Σ gap ÷ Σ GBP
  current (weighted). Missing cost → not eligible, never zero. Compared only on the same delivery terms (DAP / EXW).
- **Opportunity** = Σ positive per-piece gaps, labelled "not programme spend or an annual saving"; unfavourable gaps
  shown apart. **Annualised** = gap × annual volume only where an admin validated the volume. **Validated /
  implemented savings** only from an admin-set saving status; otherwise "Not tracked".
- **Original-currency mode** totals each currency on its own row; currencies are never added.
- **FX**: frozen at save; a policy change or a new table changes nothing until an admin previews and applies a
  recalculation, which keeps the previous snapshot in `fx_history`. GBP is the only 1:1. A rate > 10× away from the
  reference is refused (inverted). ISO 4217 codes come from the runtime (`Intl.supportedValuesOf`).
- **Permissions**: owner edits classification, current cost, notes, draft / completed; a reviewed / approved record
  whose money the owner changes goes back to completed. Admin also sets reviewed / approved, validated volume, saving
  status, test flag. Every write is in `kpi_audit`.

## Exports

PDF (KPIs, insights, charts redrawn in the light theme, analysis tables, data quality, current records ≤ 400), Excel
(Executive summary, Commodity / Programme / Powertrain analysis, Model year & status, Original currencies, Costing
records, Data quality, **Reconciliation** — live formulas re-adding every financial KPI from the exported records —
Method & FX), CSV (server, formula-injection safe). All three follow the active filters.

## Proof

- Unit / API / perf: 59 tests (`kpi-dashboard`, `-server`, `-ui`, `-perf`). 50,000 records → full dashboard in
  0.39 s; filtered + searched + sorted table 0.09 s; 20,000 SQLite inserts 0.9 s.
- Live (`npm run test:e2e:kpi`, needs a build): 58 / 58 — a costing saved from the machining screen, three users,
  admin FX load + inverted-rate refusal + recalculation + CSS / CPSC II import through the UI, every card v the API,
  filters / chips / chart click / drill / sort / search / drawer / original currency / empty state, CSV + Excel + PDF,
  an independent re-add of the exported records equal to the KPIs, axe WCAG 2.1 AA on the dashboard and both
  dialogs, light / dark / phone (no horizontal scroll).
- The exported workbook recalculated in LibreOffice: all 7 Reconciliation rows ✓.
- Also fixed (audit risk 1): `/api/quotes` listed and let anyone edit or delete every user's supplier quotes — now
  owner-only (admin sees all).

## Limits (stated, not hidden)

- CSS System and CPSC II are not connected: their data arrives through the import template. Field mapping needs
  JLR's column lists.
- No live FX provider (Phase 1 runs with no internet): rates are an admin-loaded table.
- "Original costing analysis" opens the saved costing read-only in the record panel (8 buckets, operations); it
  does not reload the calculator form.
- Two roles only (user, admin): review / approval is an admin action until a reviewer role is wanted.
- The same part costed in two countries is one application (a duplicate candidate), by design of the identity rule.
- The dashboard reports the tool's should-costs; their accuracy against prices paid is still unmeasured.

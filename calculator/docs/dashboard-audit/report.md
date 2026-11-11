# KPI Dashboard — design audit: completion report

Branch `dashboard-audit-fixes` (local, not pushed), from `b22408a7`. Findings and every status: `findings.md`.
Evidence: `before/`, `after/` (screenshots), `evidence/` (measurements, logs, reconciliation). Data: the existing live-test
fixture only (9 saves, 7 current, 5 financially eligible, 5 currencies) in a throw-away database — no production data, no
migration, no write to any real database.

## A. Audit summary

The dashboard worked and its figures were right, but it did not read like CostVision and did not answer the manager's
questions first. The financial position sat behind ten equal cards, "where to act" was never in the first screen, the
dialogs opened in the top-left corner, keyboard focus was lost after a filter change, the records table hid its GBP columns,
and buttons / selects were the dashboard's own rather than the app's.

Findings: **P0 0 · P1 7 · P2 12 · P3 9** (28). Approved at Stop 1: P1 + P2. **Fixed: 18, partly fixed: 1 (F-02)**.
Open: 9 P3, X-01, the F-02 remainder and one F-16 remainder (§F). No financial P0: the figures reconcile by hand before and
after (§D).

## B. Changes made

| Area | Finding | What changed | Files | Commit |
|---|---|---|---|---|
| Layout and hierarchy | F-01, F-18 | Two bands: "Financial position" (opportunity with annualised line, weighted gap, **unfavourable gaps as its own card**, validated, implemented) first; "Coverage and workflow" as compact tiles. Same figures. | `kpi-builders.ts`, `kpi-dashboard.css` | 7d38787e, b8093b20 (labels restored) |
| Layout and hierarchy | F-02 (partly) | Order: data-quality line → financial position → coverage → **Where to act** (opportunity by commodity + commodity × programme) → insights → other charts → drill-down → records → full data-quality table. Header compacted. Data-quality line lists the engine's counts. "Where to act" heading in the first screen at 1920 / 1440; chart bodies just below the fold at 1440; below the first screen at 1366 / 1024. | `kpi-view.ts`, `kpi-charts.ts`, `kpi-builders.ts`, css | 65897b64, 22792e11, b8093b20 |
| Layout | F-11 | One card per section; no bordered blocks inside it. | css | 90ff245b |
| Layout | F-14 | Skeleton in the page's own shape (a flex rule had flattened the card grid). | `kpi-builders.ts`, css | 65897b64 |
| Components | F-07 | App's `.btn / .btn-primary / .btn-secondary / .btn-sm` and styled select (`.hdr-select`) reused; filter buttons match. Follow-up: buttons no longer shrink in flex headers. | all dashboard modules, css | ac858d15, 6ca0c695 |
| Dialogs | F-04 | `margin:auto` on `.kd-dialog` (the global reset removed dialog centring). Global reset unchanged. | css | 2414057b |
| Filters | F-05 | Focus restored on every filter-row redraw; Escape closes the popover / menu from anywhere. | `kpi-view.ts` | 50df871b |
| Filters | F-13 | Drill-down path shown as a removable chip; CSV / Excel / PDF apply the commodity / programme / powertrain / model-year levels to KPIs and records alike (a component level is screen-only and stated, so the workbook reconciles). | `kpi-view.ts`, `kpi-builders.ts`, `kpi-export.ts` | 9065d876, b8093b20 |
| KPIs / currency | F-12 | "Original currency" replaces the GBP band with per-currency totals in the first screen. Follow-ups: table fits its card; empty sums show —. | `kpi-view.ts`, `kpi-builders.ts`, css | 54b5640b, fd9daaf0, a7459fd0 |
| KPIs | F-15 | Card "i" is a real button (aria-expanded) showing the explanation; stays open while hovered. | `kpi-builders.ts`, `kpi-view.ts`, css | 6c440421, b8093b20 |
| Charts | F-10 | Colour follows the entity (powertrain, status). | `kpi-charts.ts` | 064a5344 |
| Charts | F-20 | Current v should by commodity: weighted gap % in tooltip and table. | `kpi-charts.ts` | 74ef9ba6 |
| Colour | F-17 | Amber = data-quality warning only; statuses neutral word badges and a one-hue ordinal ramp in the status chart (validator PASS); success = opportunity, danger = unfavourable / excluded. | css, `kpi-builders.ts`, `kpi-charts.ts` | 1c92b94c, 9072b877 |
| Table | F-03, F-09 | Columns most-used first (part number, component, commodity, programme, GBP gap, gap %, GBP current, GBP should, status, …, ID last; none removed); part number pinned and opens the record; header sticks inside the table's own scroll box. | `kpi-builders.ts`, css | f04e27cf |
| Exports | F-08 | Excel "Costing records" = current records; older revisions / duplicates on their own sheet; CSV follows the table's selector. | `kpi-export.ts`, `kpi-view.ts` | 354870b1 |
| Navigation | F-16 | "Copy link" on every record; `#kpi-record=<id>` opens it; a pasted link opens the dashboard at start-up (**main.ts, approved at Stop 2**). | `kpi-view.ts`, css, `main.ts` (+4/−2) | 4a885665, e35be4ff |
| Responsive | F-06 | ≤ 720 px: filters behind "Filters (n)", financial band two columns, tiles three (two ≤ 420 px). | `kpi-view.ts`, css | 9eeaf5ee |
| Build | — | `calculator/dist` rebuilt (first from a7459fd0; again after the review follow-ups). | dist | 88808a91, see §G |

Tests added: `tests/kpi-dashboard-ui.test.ts` (F-08, F-10, F-13, F-16, F-20). Updated to the approved rules: two
expectations in `e2e/kpi-dashboard-live.ts` (CSV / Excel now current records) — plus one new check.

## C. Theme check

Both themes, all six widths, before and after (`before|after/{dark,light}-{1920,1440,1366,1024,768,390}-{fold,full}.png`).
Measured in both themes after: 0 px horizontal overflow, 0 axe-core WCAG 2.1 A/AA rule failures, no clipped text, no page or
console errors, at every width (`evidence/after-metrics.json` → `views`). Theme toggle kept after reload
(`themePersistence`). Records table, record panel, admin and save dialogs, filter popover, export menu, chart tooltip,
loading and error states shot in both themes (`state-*`). Status badges / gap colours checked in `state-records-dark-1440.png`
and `light-1440-fold.png`. Not claimed: WCAG compliance — only the axe rules above were run, plus the keyboard pass below.

## D. Test and regression results

| Check | Baseline (b22408a7) | After | Evidence |
|---|---|---|---|
| `npm test` | 368 files, 5,993 passed, 0 failed | 368 files, **5,998 passed, 0 failed** (+5 new) | `evidence/baseline-npm-test.log`, `after-npm-test.log` |
| `tsc -p tsconfig.build.json --noEmit` | exit 0 | exit 0 | `baseline-typecheck.log`, `after-typecheck.log` |
| `tsc --noEmit` (incl. tests) | — | exit 0 | `after-typecheck-full.log` |
| Build | 3 warning lines (chunk size, ineffective dynamic import of `animations.ts`) | the same 3, none new | `baseline-build.log`, `after-build.log` |
| Live dashboard e2e (`npm run test:e2e:kpi`) | 58/58 | **59/59** | `after-e2e-kpi-live.log` |
| New failures | — | none | |

**Dashboard (running app, after):** KPIs, charts and table agree — the live e2e compares every card with the API and
re-adds the exported workbook independently (to the penny). Drill-down opens the right record (live e2e: commodity →
programme → powertrain → model year → component → its one record). Exports follow the filters (CSV row count = current
records of the view; Excel sheets split current / older) and permissions (excluded list 403 for a user, admin-only actions
403, no token 401 — `noPermission`). One filter change = 3 requests, no repeats.

**KPI reconciliation by hand** (`evidence/kpi-reconciliation.md`, original value × frozen rate, not the dashboard's code):
opportunity 2.158273 (LR-PCB-500) + 4.400000 (LR-KNK-100) + 0.420168 (LR-SEAL-9) = **6.978441** over 3 = dashboard; weighted
gap Σgap 2.947923 ÷ Σcurrent 74.861290 = **3.937847 %** over 5 = dashboard; unfavourable −2.876320 (LR-BRK-001) − 1.154198
(LR-SHF-310) = **−4.030518** over 2 = dashboard. Also unique components 7 = 7, records 9 / 7 current = 9 / 7.

**Rest of CostVision (running app, after — `regressionSmoke`):** Home, Portfolio, KPIs, News, Negotiation and 3D Viewer
open; machining, casting, sheet metal, forging, plastics, PCB photo and CAD to COST tiles open the costing view
(`after/regression-tile-*.png`); a machining costing calculates and saves to the dashboard (live e2e); no console errors, no
failed requests (apart from the app's own aborted `HEAD /api/health`). A plain start still lands on Home
(`plainStartLandsOnHome`). Login / permissions: tokens and roles exercised by every run above. **Not run:** CSS System /
CPSC II (not part of CostVision — their data arrives through the import, which the live e2e exercises); full end-to-end
runs of the other costing tools (`test:e2e:full`, CAD to COST live) — their code is untouched (§G), only open-and-render
was checked; the drawing interface beyond its tile opening.

**Database:** no schema, migration or server file changed (`git diff b22408a7..HEAD -- calculator/server calculator/src/engine`
is empty); every run used a fresh temp database; no write query against any real database.

**Keyboard:** 60 Tab stops through the dashboard, each with a visible focus indicator (`keyboardTabStops`); Escape closes
popover, menu, tooltip and dialogs; the currency switch is a radio group (arrow keys).

## E. Screenshots (before → after, same width and theme)

| What | Before | After |
|---|---|---|
| First screen, desktop | `before/light-1440-fold.png` | `after/light-1440-fold.png` |
| First screen, dark | `before/dark-1440-fold.png` | `after/dark-1440-fold.png` |
| Phone | `before/dark-390-fold.png` | `after/dark-390-fold.png`, `after/state-phone-filters-open-dark-390.png` |
| Laptop | `before/light-1366-fold.png` | `after/light-1366-fold.png` |
| Small laptop | `before/dark-1024-fold.png` | `after/dark-1024-fold.png` |
| Record panel | `before/state-record-drawer-light-1440.png` | `after/state-record-drawer-light-1440.png` |
| Save dialog | `before/state-save-dialog-dark-1500.png` | `after/state-save-dialog-dark-1500.png` |
| Records table | `before/state-records-dark-1440.png` | `after/state-records-dark-1440.png` |
| Filter popover after a pick | `before/state-filtered-casting-dark-1440-fold.png` | `after/state-filtered-casting-dark-1440-fold.png` |
| Loading | `before/state-loading-dark-1440.png` | `after/state-loading-dark-1440.png` |
| Full page | `before/light-1440-full.png` | `after/light-1440-full.png` |
| New states | — | `after/state-original-currency-light-1440-fold.png`, `state-drill-chip-light-1440-fold.png`, `state-pasted-record-link-light-1440.png` |

(41 before files, each with an after file of the same name.)

## F. Open items

- **Financial P0s:** none found.
- **P3, not in the approved scope:** F-19 axis titles, F-21 eligible base on the opportunity card, F-22 literal shadow colours
  (the tooltip / menu / dialog shadows still use `rgba(0,0,0,…)`), F-23 8 px seam under the sticky filter bar, F-24 "Created"
  column shows the costing date, F-25 empty "Original costing analysis" heading + raw commodity id in the record panel,
  F-26 smooth scroll ignores reduced motion, F-27 internal user id in list rows, F-28 Export button weight.
- **X-01** — "Save to KPI Dashboard" stays in the costing results "More" menu (your decision).
- **F-16 remainder** — a link pasted into an ALREADY-OPEN CostVision tab changes only the address hash; the dashboard does
  not open because the approved hook runs at start-up only. Needs a `hashchange` hook in `main.ts` (protected; not done).
- **F-02 remainder** — at 1440 the "Where to act" charts start just below the first screen, and at 1366 / 1024 the whole
  section is below it. Bringing it up further means shrinking the header / financial band or moving the coverage tiles
  below it — a layout decision for you.
- **Not tested live:** a drilled export (the API path is covered by unit tests); realistic data volumes in the browser (the
  fixture has 9 records; volume is covered by the 50,000-record engine test only).
- **Observed, not changed:** below 1024 px the drill-down table (7 columns) and at 390 px the heatmap scroll sideways inside
  their own box (`wideTables`), which is the intended narrow-screen behaviour.

## G. Independent check

A separate agent that made none of the fixes reviewed `git diff b22408a7..HEAD` against `findings.md`, the screenshots and
the metrics (read-only).

**Confirmed by the reviewer:** every code commit maps to an approved finding (none to a P3 or X-01); no protected area
changed except the approved `main.ts` start-up hook, which matches the Stop 2 approval exactly; `src/engine`, `server`,
`index.html`, `saas-shell.ts` and the global CSS files are untouched; no colour literal and no unscoped selector was added;
tests 5,993 → 5,998 with no weakened assertion; F-03, F-04, F-05, F-06, F-07, F-08, F-10, F-11, F-12, F-14, F-16, F-18
confirmed against the after evidence.

**Raised by the reviewer, and what was done:**

| # | Reviewer's point | Action |
|---|---|---|
| 1 | F-13: a component-level drill narrowed the exported records but not the exported KPIs → the workbook Reconciliation would show ✗ (path not run live). | Fixed (b8093b20): the component level is not applied to exports and the export says so. |
| 2 | F-13: exported KPIs follow the drill while the screen's cards do not; the chip suggests a page filter. | Chip now reads "Drill-down (table and exports)"; the export states that the on-screen cards show the filters without the drill. |
| 3 | F-17 not fixed: the status chart used the categorical palette (green on Reviewed, amber on Approved). | Fixed (9072b877): one-hue ordinal ramp, validated. |
| 4 | F-09 evidence put the header under the sticky filter bar; F-02 overstated; cloned rows leaked into later screenshots. | Harness re-measures below the bar (headerVisible: true) and removes the clones (d0c382e3); F-02 re-graded **partly fixed**. |
| 5 | Figures computed in the UI: `weightedPct` (F-20) and the data-quality "not comparable" subtraction. | Data-quality line now lists the engine's counts (b8093b20). `weightedPct` kept: it is the display arithmetic F-20 was approved as (Σgap ÷ Σcurrent of the engine's row sums); moving it into the engine is KPI logic (protected). |
| 6 | F-01 shortened the labels against "same labels". | Restored (b8093b20). |
| 7 | `calculator/dist` not rebuilt. | Not so — the reviewer's diff predates commit 88808a91 (21 dist files changed); rebuilt again after the follow-ups. |
| 8 | F-15 tip closes when the pointer moves onto it. | Fixed (b8093b20). |

After the follow-ups everything in §D was re-run on the final build: live e2e 59/59, after screenshots re-shot, 0 overflow /
0 axe failures at all 12 views, full `npm test` (368 files, 5,998 passed, 0 failed) and both typechecks (exit 0) on the final code.

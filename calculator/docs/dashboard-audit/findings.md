# KPI Dashboard — design audit findings

Branch `dashboard-audit-fixes` (from `b22408a7`). Audit brief: `CostVision_Dashboard_Audit_ClaudeCode.md`; reference spec
`CostVision_KPI_Dashboard_Spec.md`. The record lives in `calculator/docs/dashboard-audit/` (the application and all its docs
live under `calculator/`; the repo root has no `docs/`).

**Decisions at Stop 1 (user, 11 Nov 2026):** fix **P1 + P2**; P3 stays open. F-16 → **Option A, record link only**
(no costing-tool change). X-01 → **leave in the More menu** (open). F-08 → **current records by default** (Excel puts older
revisions / duplicates on their own sheet; CSV follows the table's "Which records" selector).

**Stop 2 (user, 11 Nov 2026):** F-16 — approved a start-up hook in `src/ui/main.ts` (protected: navigation) so a pasted
`#kpi-record=<id>` link opens the dashboard and the record; every other address unchanged.

Status at Stop 1: audit complete, no application code changed. The one file added is the audit harness
`calculator/e2e/kpi-dashboard-audit.ts` (screenshots + measurements; it changes nothing in the app).

---

## Step 1 — the application

| Item | Where |
|---|---|
| Framework / routing | Vanilla TypeScript SPA built by Vite (`calculator/vite.config.ts`); no router — left-nav buttons switch `<section>` views in `src/ui/main.ts` (`setNavActive`, `showKpiDashboard` ~line 1096). Server: Express + better-sqlite3 (`server/index.ts`). |
| Where the dashboard lives | View `#kpi-view` (`calculator/index.html`), nav button `#kpi-btn`; code `src/ui/kpi-dashboard/` (`kpi-view.ts` state + events, `kpi-builders.ts` HTML, `kpi-charts.ts`, `kpi-export.ts`, `kpi-save-modal.ts`); CSS `src/ui/styles/kpi-dashboard.css` (prefix `kd-`). Lazy-loaded on first open. |
| Design system | No component library. Tokens on `:root` in `src/ui/styles/calculator.css` (lines 50–142: `--bg`, `--surface*`, `--border*`, `--text-*`, `--accent*`, `--success/warning/danger/info` + `-bg/-border`, `--radius*`, `--shadow-sm/md/lg`); dark theme overridden by `src/ui/styles/dark-green.css` (scoped `html:not([data-theme="light"])`), polish in `saas-polish.css`. Shared classes: `.btn .btn-primary .btn-secondary .btn-sm` (calculator.css 626–664), styled select `.hdr-select` (calculator.css ~5740, `appearance:none` + chevron). Font Inter. Icons: inline SVG sprite `#i-*` in index.html. |
| Themes | `data-theme` on `<html>`, saved in `localStorage['sc-theme']`, set and toggled in `main.ts` ~20850 (`#theme-toggle-btn`). |
| Data sources / API | `GET /api/kpi/meta, /summary, /records, /records.csv, /drill, /records/:id, /fx`; writes `POST /records`, `PATCH|DELETE /records/:id`, admin `PUT /fx/policy`, `POST /fx/rates, /fx/recalculate, /import`, `GET /audit` — `server/routes/kpi.ts`. Model `src/engine/kpi-dashboard.ts`; store `server/data/kpi-store.ts` (tables `costing_records`, `fx_rates`, `kpi_audit`). |
| Auth / permissions | Mounted `app.use('/api/kpi', requireAuth, kpiRouter)` (`server/index.ts`); admin checks in the route (`isAdmin` / `adminOnly`, role read from `users`). Every signed-in user reads eligible records; excluded list, FX, import, audit = admin. |
| Shared components it uses | Global tokens and reset (`calculator.css`), `showToast` (`src/ui/toast.ts`), `apiBase` (`src/api-base.ts`), `auth-fetch.ts` (token on every API call), Chart.js (also used by main.ts). It does NOT use the shared `.btn` / styled-select classes (see F-07). |
| Tests | `npm test` (vitest), `npm run typecheck`, `npm run build`, `npm run test:e2e:kpi` (live, 58 checks). |

**Baseline** (commit `b22408a7`, before any change): `npm test` → **368 files, 5,993 tests passed, 0 failed**
(`evidence/baseline-npm-test.log`); `tsc -p tsconfig.build.json --noEmit` → exit 0 (`evidence/baseline-typecheck.log`).

## Step 2 — inspection of the running app

Run: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx e2e/kpi-dashboard-audit.ts docs/dashboard-audit before`
(Playwright + axe-core are already in the repo; nothing installed). Real server, real browser, throw-away SQLite database
seeded with the **existing** live-test fixture (`e2e/kpi-dashboard-live.ts`): 1 costing saved through the machining
screen, 6 API saves (incl. a revision and another user's duplicate), 2 CSS System / CPSC II import rows, an approved FX
file + recalculation, 1 admin-validated volume → 9 saves, 7 current records, 5 financially eligible, 5 currencies.

**Data limits:** 9 records is enough to check behaviour and arithmetic, NOT enough to judge density with realistic
volumes (long commodity lists, 100-row pages, many programmes). Performance at volume is covered only by the unit test
`tests/kpi-dashboard-perf.test.ts` (50,000 synthetic records, engine only, no browser). I did not invent more data.

Screenshots (`before/`): `{dark|light}-{1920|1440|1366|1024|768|390}-fold.png` and `-full.png` (24), plus states:
empty, loading, error, filter popover, filtered, export menu, chart tooltip, records table, record drawer (both themes),
admin dialog, save dialog. Measurements: `evidence/before-metrics.json`.

Measured, all 12 width × theme views: horizontal page overflow **0 px**; axe-core WCAG 2.1 A/AA rules on `#kpi-view`
**0 violations**; no clipped text (only the visually-hidden labels); no page / console errors; the only failed request is
the app's own `HEAD /api/health` poll (aborted on navigation — outside the dashboard). 60 keyboard Tab stops, every one
with a visible focus indicator. Theme toggle persists after reload (`themePersistence`). A normal user gets 403 on the
excluded list and FX upload, no token gets 401 (`noPermission`). One filter change = 3 requests (summary, records, drill)
— no repeats (`apiCallsForOneFilterChange`).

**Hand reconciliation (financial, done now):** the 7 current records' original values × their frozen rates, re-added in a
script that does not call the dashboard code: eligible 5, Σ GBP current 74.861290, Σ should 71.913367, weighted gap
3.937847 %, opportunity 6.978441 (3), unfavourable −4.030518 (2) — **identical** to the dashboard. Annualised 4.40 ×
60,000 = 264,000 — identical. **No financial P0 found on this data.**

---

## Spec match

| Spec § | Requirement | State | Note / finding |
|---|---|---|---|
| 2 | Shared, all authorised users, permissions | Present | — |
| 2 | Original record IDs **and direct navigation links** | Partly | ID shown; no link that opens the costing in its tool → F-16 |
| 2 | Source tool, owner, created, last update | Present | "Created" column shows the costing date → F-24 |
| 2 | Exclude deleted / invalid / test; statuses | Present | — |
| 2 | Auto + manual refresh, last refresh time | Present | — |
| 3 | All filters, searchable multi-select, chips, clear one / all, dynamic options, empty state, 12-month default | Present | Focus / Escape defect → F-05 |
| 4 | Original values kept, ISO codes, independent conversion, frozen FX, recalculation, no 1:1 | Present | — |
| 4D | Two reporting modes | Partly | "Original currency" changes only a section below the fold → F-12 |
| 5 | 10 KPI cards, counts behind financial KPIs, no savings from gaps, annualised only on validated volume | Present | Hierarchy → F-01; base count on opportunity → F-21 |
| 6 | 11 charts, filter interaction, empty states | Present | Colour-by-position → F-10 |
| 7 | Records table, all columns, navigation to original analysis, drill path keeping filters | Present / partly | Column order → F-03; sticky header → F-09; original analysis read-only → F-16 |
| 8 | Data-quality indicator, excluded drill-down for admins | Present | Weight on page → F-02 |
| 9 | CostVision branding / components, responsive, both themes, skeleton / error / empty, tooltips, keyboard | Partly | F-04, F-06, F-07, F-11, F-14 |
| 10 | Insights; PDF, Excel, CSV reflecting filters | Present | Revisions in exports → F-08; drill not in exports → F-13 |

## Charts (7 checks each, from screenshots `before/dark-1440-full.png`, `light-1440-full.png`, `state-chart-tooltip-*`)

| Chart | 1 Business question | 2 Type suits | 3 Units / axes / legend | 4 Tooltip | 5 Filters | 6 Click-through | 7 Zero / small data |
|---|---|---|---|---|---|---|---|
| Activity over time | Is costing activity rising or falling? | Yes (line) | Count axis unlabelled (F-19) | Yes | Yes | Click = that period | Empty message; 1-point spike looks dramatic with tiny data |
| Records by commodity | Where is effort going? | Yes (ranked bars) | Count axis unlabelled (F-19) | Yes | Yes | Filters commodity | Yes |
| Current v should by commodity | Where is current above should-cost? | Partly — sums of unit costs of different parts; % gap per commodity would answer it more directly (F-20) | £ axis; legend | Yes, with record count | Yes | Filters commodity | Empty message |
| Opportunity by commodity | Where is the money? | Yes (ranked) | £ axis | Yes | Yes | Filters commodity | Empty message |
| Programme distribution | Which programmes are covered? | Yes | Count axis unlabelled | Yes | Yes | Filters programme | Yes |
| Powertrain distribution | Coverage by powertrain | Donut acceptable (≤ 6 parts) | Legend | Yes, with % | Yes | Filters powertrain | Colours follow position (F-10) |
| Model year | Coverage by MY | Yes | Count axis unlabelled | Yes | Yes | Filters MY | Yes |
| Costing tool | Which tools feed the view? | Yes | Count axis unlabelled | Yes | Yes | Filters tool | Yes |
| Commodity v programme heatmap | Where are the coverage gaps? | Yes | Scale strip; cell = count, hover = £ | Title attr only | Yes | Filters both | Empty cells "·" |
| Opportunity by powertrain | Where is the money by powertrain? | Yes | £ axis | Yes | Yes | Filters powertrain | Empty message |
| Status | How much is waiting for review? | Yes (segmented bar + legend) | Legend with counts | Title attr | Yes | Filters status | Colours follow position (F-10) |

---

## Findings

Priority counts: **P0 0 · P1 7 · P2 12 · P3 9** (28 total). Status column is filled in as fixes land.

| ID | Priority | Area / component | File(s) | What is wrong | Why it matters | Proposed fix | Protected area? | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | P1 | Hierarchy — KPI cards | `src/ui/kpi-dashboard/kpi-builders.ts:122` (`cards`) | Ten cards of equal weight in build order. The money (potential opportunity, weighted gap, unfavourable) is cards 6–7 of row 2; record counts lead. | A manager reads counts first and the financial position second. | Lead with one financial band: potential unit opportunity, weighted gap, unfavourable gap, eligible-record count; operational counts as a compact second row. Same figures, same labels; no calculation change. | No | `before/light-1440-fold.png`; `before-metrics.json` `cardBottoms` | Open |
| F-02 | P1 | Hierarchy — page order | `kpi-view.ts:206–207` | Insights and a 19-row data-quality table sit above the charts, so "which commodities / programmes need attention" starts at 1,473 px (1920), 1,624 px (1440), 2,558 px (1024): never in the first screen. | The spec's main question is not answerable without scrolling. | Put "where to act" (opportunity by commodity, commodity × programme) directly under the KPIs; data quality becomes a one-line summary with the full table behind "Details". | No | `before-metrics.json` `sectionTops`; `before/*-fold.png` | Open |
| F-03 | P1 | Records table — columns | `kpi-builders.ts:235` (`TABLE_COLUMNS`) | First column is an 8-character hash; the GBP current / should / gap / gap % columns are off-screen at 1440 and below (9 of 19 visible at 1440, 7 at 1024, 3 at 390). | The figures people use daily need a horizontal scroll to read. | Order: part number, component, commodity, programme, GBP gap, gap %, GBP current, GBP should, status, then the rest; ID last. Pin the part-number column on narrow widths. No column removed. | No | `before-metrics.json` `recordsColumnsVisibleWithoutScroll`; `before/state-records-dark-1440.png` | Open |
| F-04 | P1 | Dialogs | `src/ui/styles/kpi-dashboard.css:205`; cause `src/ui/styles/calculator.css:153` | The record panel, admin dialog and Save dialog open pinned to the top-left corner. The global reset `* { margin: 0 }` removes the browser's `margin:auto` that centres a `<dialog>`. | Looks broken; the panel sits over the navigation. | Add `margin: auto` on `.kd-dialog` (dashboard CSS only — the global reset is not touched). | No | `before/state-record-drawer-light-1440.png`, `state-save-dialog-dark-1500.png`, `state-admin-dialog-light-1440.png` | Open |
| F-05 | P1 | Filters — keyboard | `kpi-view.ts:118` (`filtersChanged`), `:570` | After ticking an option, the data reload redraws the filter row and focus drops to `<body>`; Escape then no longer closes the popover, which stays open over the chips and "Clear all". | Keyboard users lose their place; the open popover blocks other controls. | Keep the open popover and the focused option across the redraw (restore focus by selector after every filter-row render); close on Escape from anywhere in the view. | No | `before-metrics.json` `filterPopover: {focusAfterPick:"body", popoverOpenAfterEscape:true}`; `before/state-filtered-casting-dark-1440-fold.png` | Open |
| F-06 | P1 | Responsive — phone | `kpi-dashboard.css` (cards 1 column ≤ 420 px; filter row wraps) | At 390 px the filter block is 197 px tall, cards stack one per row, the page is 8,845 px, the opportunity card ends at 1,428 px (1.7 screens down). | On a phone the financial position is not in the first screen. | Two-column financial band at phone width; filters behind a "Filters (n)" disclosure on narrow screens; compact card padding. | No | `before/dark-390-fold.png`, `-full.png`; `before-metrics.json` `views.dark-390` | Open |
| F-07 | P1 | Component consistency | `kpi-dashboard.css:26` (`.kd-btn`), `:39` (`.kd-select`) | The dashboard has its own button and select styles; the app's `.btn / .btn-secondary / .btn-sm` and styled select (`.hdr-select`) are not used. The date select shows the native arrow; button weights and radii differ from the app header. | It reads as a separate template, not part of CostVision. | Use the existing `.btn .btn-secondary .btn-sm` / `.btn-primary` and the existing styled-select look (reuse the class; no change to the shared CSS). | No (reuse, not change) | `before/light-1440-fold.png` (date select v header selects) | Open |
| F-08 | P2 | Exports — revisions | `kpi-view.ts:457`, `:466` | CSV and the Excel "Costing records" sheet export every save (scope `all`), revisions and duplicates included, while the screen's table shows current records. The rows carry a "Reporting role" column, but summing the GBP column double counts. | A user who sums the export gets a bigger number than the dashboard. Not a wrong figure on screen, but an easy misreading. | Export current records by default (matching the screen); put older revisions / duplicates on their own Excel sheet, and make the CSV follow the table's scope selector. | No | Code lines; `evidence/before-metrics.json` `recordsAllTime` (9 rows v 7 current) | Open |
| F-09 | P2 | Records table — sticky header | `kpi-dashboard.css:129`, `:132` | `thead th { position: sticky }` sits inside `overflow-x: auto`, so it sticks to the wrapper, which never scrolls vertically: the header does not stay visible on long pages. | With 25–100 rows a page, the column names scroll away. | Give the table wrapper a max-height with vertical scroll (header sticks inside it), or make the page-level header sticky outside the wrapper. | No | CSS containment rule; not reproducible with the 7-row fixture (`stickyHeaderAfterScroll` inconclusive) — code evidence only | Open |
| F-10 | P2 | Charts — colour identity | `kpi-charts.ts:190`, `:246–247` | Powertrain donut and status bar colour segments by their position in the list, not by the entity; filtering out one powertrain repaints the others. | Breaks "BEV is always this colour" (dataviz rule: colour follows the entity). | Colour by the entity's fixed index in the standard list (STANDARD_POWERTRAINS / RECORD_STATUSES). | No | Code lines | Open |
| F-11 | P2 | Nested containers | `kpi-dashboard.css:104` (`.kd-sec`), `:163` (`.kd-chart-card`), `:114` (`.kd-insight`), `:129` | Bordered chart cards inside a bordered section card; bordered insight rows and bordered tables inside cards — double borders throughout. | Visual noise; heavier than the rest of CostVision. | Section = the only card; chart blocks, insights and tables inside drop their own border / fill. | No | `before/light-1440-full.png` | Open |
| F-12 | P2 | Currency modes | `kpi-view.ts:205` | "Original currency" only inserts a totals section below the KPIs and dims GBP table headers; the first screen is unchanged. | The switch appears to do nothing. | In original-currency mode show the currency totals in place of the GBP financial band, with a one-line note that charts stay in GBP. | No | Code line; e2e `original-currency view…` check | Open |
| F-13 | P2 | Drill-down v exports / chips | `kpi-view.ts:73` | The drill path filters the table but is not a chip and is not applied to exports. | Exporting after drilling into "Casting › L460" exports everything in the filters. | Show the drill path as a removable chip and apply it to CSV / Excel / PDF (or say on the export menu that the drill is not applied). | No | Code line | Open |
| F-14 | P2 | Loading state | `kpi-builders.ts:299`, `kpi-dashboard.css:109` | The skeleton cards render as five full-width bars (the flex rule on `#kd-body > div` overrides the card grid), then the real grid replaces them — layout jump. | Layout shift; the loading view does not resemble the page. | Scope the flex rule to the content wrapper only so the skeleton keeps the card grid. | No | `before/state-loading-dark-1440.png` | Open |
| F-15 | P2 | Tooltips — semantics | `kpi-builders.ts:111` | Each "i" is `role="button"` with no action (Enter / Space do nothing): 10 extra Tab stops announced as buttons. | Misleading to screen-reader users; noisy Tab order. | Make it a real `<button type="button">` that toggles the tip, or drop `role=button` and keep the tip on focus with `aria-describedby`. | No | `before-metrics.json` `keyboardTabStops` (span.kd-tip ×10) | Open |
| F-16 | P2 | Navigation to original costing | `kpi-view.ts:266` | The record panel shows the saved costing read-only; there is no link that opens it in the costing tool, and no link to a record. | Spec §2 / §7 ask for direct navigation to the original analysis. | Option A (no protected area): a copyable link `#kpi-record=<id>` that opens the panel. Option B (protected — costing tool): "Open in calculator" loads the saved scenario. | A: No; B: **Yes** | Code line; `before/state-record-drawer-light-1440.png` | Open — needs decision |
| F-17 | P2 | Colour meaning | `kpi-dashboard.css:155`, `:137`; card tones `kpi-builders.ts` | Amber is used for "Reviewed" status, the "awaiting review" count and data-quality warnings; green / teal for opportunity values and for approved / success. | The same colour means different things. | One table: opportunity = success token + "Opportunity" label; unfavourable = danger + label; reviewed / approved = neutral badges with words; amber only for warnings. | No | `before/light-1440-fold.png`, `state-records-*` | Open |
| F-18 | P2 | Opportunity card — unfavourable | `kpi-builders.ts:135` | The unfavourable total is a parenthesis in the sub-text and wraps mid-figure ("(−" / "£4.03)"). | Spec §5 asks for favourable and unfavourable to be shown separately. | Its own labelled line (or card in the financial band, F-01) with its record count; no wrapping inside a figure. | No | `before/light-1440-fold.png` | Open |
| F-19 | P3 | Chart axes | `kpi-charts.ts` (`barConfig`) | Count axes have no unit ("records"). | Small ambiguity. | Axis title "Records" / "Current records". | No | `before/*-full.png` | Open |
| F-20 | P2 | Chart choice — current v should | `kpi-charts.ts` (`cost` spec) | Bars are sums of unit costs of different parts; the gap per commodity is easier to read as % (weighted) beside the £. | The bar heights mostly show how many parts a commodity has. | Keep the chart; add the weighted gap % per commodity in the tooltip and table (figure already computed by the engine per row as Σgap/Σcurrent — display only). | No (display; uses existing row sums) | `before/light-1440-full.png` | Open |
| F-21 | P3 | Count behind KPI | `kpi-builders.ts:135` | Opportunity card shows "3 records above should-cost" but not the eligible base (5). | Spec §5: count behind each financial KPI. | Add "of 5 eligible". | No | `before/light-1440-fold.png` | Open |
| F-22 | P3 | Hardcoded colours | `kpi-dashboard.css:51,65,89,100,206,207`; `kpi-charts.ts:223` | Shadows / backdrop use literal `rgba(0,0,0,…)` instead of `--shadow-sm/md/lg`; heatmap ink uses literal hex. Chart palette constants are the validated dataviz palette (data colours, kept on purpose). | Token discipline; light theme shadows are tinted differently by the app's own tokens. | Use `--shadow-*` tokens; derive heatmap ink from the step (no new global CSS). | No | Code lines | Open |
| F-23 | P3 | Sticky filter bar gap | `kpi-dashboard.css:56` | `top: 64px` leaves an 8 px band under the 56 px app header where content scrolls through. | Visible seam. | `top: 56px` (the header height) with the bar's own top padding. | No | `before/state-records-dark-1440.png` (card edge above the filters) | Open |
| F-24 | P3 | Table label | `kpi-builders.ts:244` | Column "Created" shows the costing date; for imported records that is not when the record was created. | Mislabel. | Rename to "Costing date" (the panel already shows both). | No | Code line | Open |
| F-25 | P3 | Record panel — empty section | `kpi-view.ts:266` | "Original costing analysis" heading shows with no breakdown when the saved costing carries none (imports, API saves); commodity prints its id ("casting"). | Empty section; raw id. | Say "No cost breakdown was saved with this costing"; print the commodity label. | No | `before/state-record-drawer-light-1440.png` | Open |
| F-26 | P3 | Reduced motion | `kpi-view.ts:562` | `scrollIntoView({ behavior: 'smooth' })` ignores `prefers-reduced-motion`. | Motion preference. | Use `auto` when reduced motion is set. | No | Code line | Open |
| F-27 | P3 | Internal ids in API rows | `server/routes/kpi.ts:91` | `ownerId` (internal user id) is sent to every viewer; the screen never uses it. | Data minimisation. | Drop it from list rows (keep on the detail for `canEdit`, which is computed server-side). Dashboard-only API; no other tool reads it. | No (dashboard API only) | Code line | Open |
| F-28 | P3 | Header | `kpi-view.ts` (`shell`) | Export is the only primary-coloured button on the page, heavier than Refresh / mode switch; eyebrow repeats "CostVision". | Hierarchy polish. | Export as `.btn-secondary`; keep the eyebrow (spec names the dashboard "CostVision \| …"). | No | `before/light-1440-fold.png` | Open |

### Outside the dashboard (needs approval — protected)

| ID | Priority | Area | What | Why | Proposed | Protected |
|---|---|---|---|---|---|---|
| X-01 | P2 | Costing results action bar | "Save to KPI Dashboard" is inside the "More" menu (`src/ui/saas-shell.ts:16`, `ACTION_GROUPS`). | Engineers may not find the one entry point that fills the dashboard. | Promote it to a visible button next to "Save". | **Yes** — shared action bar / costing tools |
| F-16 B | P2 | Costing tool | "Open in calculator" from the record panel. | Spec §7 navigation. | Load the saved scenario into its commodity form. | **Yes** — costing tool |

### Checked and not raised (evidence)

No horizontal page overflow at any width; axe 0 violations in 12 views; visible focus on all 60 Tab stops; theme
persists; permissions 401 / 403 as designed; no repeated API calls; empty and error states have words and an action;
financial KPIs reconcile by hand; no financial figure found misleading.

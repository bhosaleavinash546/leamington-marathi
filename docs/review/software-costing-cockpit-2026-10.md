# Software costing — the cockpit: UX / motion and costing-manager review (14 Oct 2026)

**Brief.** "Still not a SaaS-level software costing tool. Act as a senior UI / UX / motion chief engineer and a senior
software-costing manager (15 years each), review the module — gaps, errors, workflow, UX, motion — and make it world
class."

**How.** Two independent expert reviews of the live module (screenshots of every state plus the code), each with web
research:
- UX / motion: `calculator/scripts/sw-research/2026-10-14-ux/ux-review.md` — 20 problems, the target information
  architecture, 11 chart specs, a motion spec and a 16-item build list.
- Costing manager: `…/costing-review.md` — 15 methodology findings, with sourced replacements in `costing-data.json`
  (32 items).

Every figure was read from a search result; no page could be opened here (fetch fails with DNS). Each source says so.

## 1. What the engineer sees now

The module was a long single page: a marketing hero, two input modes, a Calculate button under 54 module rows, then
12 result sections in build order (11,279 px). It is now a **cockpit**:

| | Before | After |
|---|---|---|
| Header | 140 px gradient hero, "Premium Luxury SUV — 54 Modules" whatever was configured | Programme name and a context line read off the result (hub · source · volume × years · modules in scope), Live status, *Check a quote* · *Excel* · *PDF report* |
| Answer | After Calculate, ~5 screens down | **Sticky rail**, always on screen: per vehicle all-in (P10–P90), engineering one-off (PM, team × months), royalty per vehicle built, running cost per vehicle-year (+ fixed £ / yr), programme total (≈ P-headline, P90) |
| Recalculation | Calculate / Recalculate buttons; stale results not marked | **Live**: any input recosts in ≈ 0.3 s (250 ms debounce, engine ≈ 3.5 ms). ▲ / ▼ delta chips for 2.4 s. An invalid input keeps the last good figures dimmed and says why on the rail — never patched |
| Layout | One scroll | Ten **tabs**: Inputs (Setup, Scope) · Results (Overview, Vehicle, Risk, Spend & schedule, Modules, Supplier check) · Method (Rates & method, Report). WAI-ARIA tabs (arrows, Home / End, Alt + 1–0) |
| Overview | KPI cards in six colours | **Waterfall** (development → … → cloud = total; one-off v each production year) and a **treemap** of where the money is (domain → module; click → Vehicle tab), plus "What this says" |
| Risk | Four number cards | **Tornado** (each driver low / high, everything else held) and the Monte Carlo **histogram** with P10 / P50 / P90 and the headline's percentile |
| Spend | A phase table | **Spend per year**: engineering over the development years by phase, then maintenance, licences, royalties and cloud per production year, start-of-production marker; COCOMO schedule and team below |
| Supplier | — | **Supplier check**: type the quoted NRE and £ / vehicle (optionally by domain) → gap bars and the **£ per person-month the quote implies** against the loaded should-cost rate |
| Scope | 54 rows × 6 controls, Select all / none | Search, "in scope only", and **bulk ASIL / complexity / reuse for the modules shown** |
| Rates | Hub table | **Rate check**: loaded £ / PM, £ / h, £ / day; employment-cost multiple against the 1.25–1.4 × evidence; UK contractor day-rate median |

Charts follow the dataviz rules: one 7-slot validated palette per theme, one axis, ≤ 24 px bars with a 4 px rounded data
end, text in text ink, a legend for ≥ 2 series, hover / focus tooltips and a **Data table** under every chart. Shell
items that mean nothing for software (part name, part photo, the CAD results pane, the country bar, the sticky action
bar) are hidden while software is open (`body.cv-sw`).

**Motion** (one system; WAAPI, no new library): chart reveal by clip-path 260 ms, staggered ≤ 150 ms in total; on an
update, bars and paths morph from their last geometry in 220 ms; rail figures cross-fade 200 ms; tab entrance 200 ms /
6 px; power2-out; nothing under "reduce motion". Removed: smooth `scrollIntoView` on every step, hover lifts on
non-interactive cards and on buttons, gradient buttons, the inline `onmouseover` transform, the 20 ms "Calculating…"
delay, the 6 s auto-hiding error (WCAG 2.2.1), monospace numbers.

## 2. Costing fixes (money moves)

| # | Finding (costing review) | Fix | Effect on the default programme |
|---|---|---|---|
| 2 (C) | Tier-1 ×0.88 priced a supplier **below** its own wage bill; start-up ×0.72 likewise | Price = efficiency ÷ (1 − margin). **Margin 18 %** = median of ALTEN 8.5 %, LTTS 14.9 %, KPIT 21.0 %, Tata Elxsi 26.3 % (mixed measures, Low) — `supplierMargin` in the rate library, a company book can set its own | Tier-1 ×1.073, start-up ×0.878; a Tier-1 now costs more than the same work in-house (tested) |
| 5 (H) | Voice royalty £15 / vehicle ≈ 3× the market, **and** a separate cloud line double-counted the connected service | Cerence average price per unit US$5.05 (FY25, includes connected services) → £3.81; voice cloud 0 | −£13.4 M (royalty −£8.95 M, cloud −£4.5 M) |
| 6 (M–H) | "AAOS licence $25 / vehicle" — AAOS is open source | Relabelled: unsourced placeholder for GAS or a QNX runtime; replace with the supplier quote | label only |
| 9 (H) | NRE, per-unit and running costs summed into one opaque total | `swUnitEconomics`: NRE + £ / vehicle built × vehicles + £ / vehicle-year × vehicle-years + fixed £ / yr × years = total (exact at 0 % discount, tested); the rail leads with these | presentation |
| 12 (M) | No cash profile | `swSpendProfile` (nominal, reconciles to the total, tested) — Spend tab | presentation |
| 13 (M) | Monte Carlo shown as four numbers | Histogram (20 bins, every trial — tested) + P5…P95 curve on the result | presentation |
| 15 (M) | No supplier-quote view | `swQuoteCheck` — Supplier check tab | new |
| 1 (C) | Loaded rate £7,342 / PM is 1.31 × salary *including* overhead; employment cost alone is 1.25–1.4 × (Hadzima, MIT) | **Not changed — decision for the costing owner.** Rate check card states the evidence on screen; the overhead field carries the rest | — |

**Baseline** (`scripts/sw-review/baseline.ts`, before → after): default programme **£212.8 M → £199.4 M** (per vehicle
£266 → £249; NRE £44.0 M unchanged; lifecycle £168.9 M → £155.4 M; P10–P90 £186.4 M–£227.4 M). Range Rover L460 demo
(Tier-1) £163.4 M → £164.9 M; BMW X7 £123.7 M → £116.1 M; Mercedes GLS £142.3 M → £135.7 M. Effort (2,391 PM) is
unchanged. No other commodity's rates are touched.

## 3. Proof

- `tests/sw-cockpit.test.ts` (new): spend profile and unit economics reconcile to the total in three programmes; Tier-1 >
  in-house; quote check reads the engine's loaded rate; rate check never changes the costing; the histogram holds every
  trial; every chart is a named figure with a data table and no series-coloured text; WAI-ARIA tabs; reduced motion.
- Updated: `tests/sw-p2-fixes.test.ts` (sourced voice royalty, price factors), `tests/sw-p3-fixes.test.ts` (money in text
  ink). Full suite 3,845 / 3,845.
- Live (real server + browser): `e2e/sw-live.ts` (all four drivetrains, demo, India, calibration, EUR, both Excel
  exports, axe []) and `e2e/sw-studio.ts` (walk-through, vehicle map, hub switch, **axe on all ten tabs in dark and
  light: []**). Both scripts open the tab that holds a control before using it.
- Screens: `e2e/sw-ux-shots.ts` (`CV_WIDTH=400`, `CV_THEME=light`) → `calculator/scripts/sw-research/2026-10-14-ux/shots2`,
  `shots-light`, `shots-400`. Live recalculation measured at 0.33 s from keystroke to the rail's delta chip.

## 4. Open — stated, not hidden

Costing (the owner decides; none is guessed):
- **Burden / overhead (#1).** Keep 1.15, or raise it towards a full employment + facilities load. The evidence is on the
  Rates tab.
- **Effort catalogue (#3, C).** Unsourced; 46 FTE average for a full in-house stack. With correct rates this is the
  largest uncertainty — calibrate to real programme actuals.
- **Map data (#4, H).** £11.50 / vehicle-year is unsourced and is the largest single line (£50.6 M). AutoNavi's HD map
  is RMB 100 / car / year (search result) — a sourced anchor for China only.
- **Cloud (#7)** is all variable; a fixed platform part and post-programme tail are missing (AWS FleetWise $0.60 /
  $0.45 per vehicle-month is a sourced anchor). **Tools (#8)** are per module, not per seat. **Maintenance (#10)** is
  133 % of development, flat for life. **Homologation (#11)** constants unsourced; VSOC opex absent. **MC band (#13)**
  is narrow (±11 %) for software. **Default reuse (#14)** Medium on every module.

UX (from the build list, not built this round):
- One input pane (Guided and Advanced still both exist; Advanced is the default and both feed the same live rail).
- Undo / redo and a keyboard map; a Scenarios tab with a pinned baseline and Δ table.
- The vehicle map's component list still shows £ per component (a module on several parts counts at each — stated
  on screen).
- At 400 px the waterfall's labels are small; the data table under it carries the figures.

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

UX: the build list's remaining items were built in round 2 (§5).

## 5. Round 2 — the rest of the build list (14 Oct 2026)

| Item | What was built |
|---|---|
| **One input pane** | The six-step Guided wizard and the "full setup" form were two UIs over one set of inputs, synced by hand (bugs F2, F3, F5 came from that). They are merged. **Setup** now holds "Start from" (vehicle programmes, quick settings), the programme fields, **domain chips** ("Infotainment · 0 of 9 in scope", which switch a whole domain and follow the powertrain scope from the engine) and the reference reports. **Scope** holds the modules. A powertrain change re-scopes in place: no panel re-render, so the tab, scroll and charts stay. |
| **Undo / redo** | Every costed state is recorded (60 deep; the rate book is policy and is never in history). ↶ / ↷ in the header, plus Ctrl/⌘ Z and Ctrl/⌘ ⇧ Z (or Ctrl Y). Undo writes the inputs back into every field (`writeInputsToForm`) and recosts. Text fields keep their own undo. |
| **Keyboard map** | "?" opens a native modal `<dialog>` that lists every shortcut (Esc or the backdrop closes it). The shortcuts are Alt + 1 … 0 for the tabs, ← → Home End inside the tab bar, "/" to find a module, and B to pin the baseline. Each control carries `aria-keyshortcuts`. |
| **Scenarios tab** | Pin a baseline (button or B), then **save the current programme by name inline** (no `window.prompt`). It compares saved scenarios, or generated sets: the 3 **development sources**, 8 representative **hubs** (a typed rate stays with its own hub) or the 5 **reuse levels**. Every row is `computeSWProgram` on its own inputs (`src/engine/sw-scenarios.ts`). It shows per-vehicle bars against the baseline, then a table: per vehicle, total, engineering, royalty / vehicle built, running / vehicle-year, P90 and effort, each with ▲ / ▼ against the baseline. **What differs** names the inputs ("hub United Kingdom → India", "reuse changed on 43 modules"). Load (an undoable step), Use as baseline, Delete. A scenario the engine refuses keeps its row with the reason. |
| **Vehicle map** | The component list no longer shows a £ sum. A module on several components counted at each, so the list added up to more than the programme. It now shows modules and the highest ASIL; each module's own £ is in the hover detail. The Cost colour uses the most costly *single* module on a component, never a sum. The Excel "Vehicle map" sheet follows. |
| **Phone (400 px)** | Charts keep reading-size text and scroll inside their own frame; the page never scrolls sideways. The rail is no longer sticky below 700 px (it covered half the screen). |

**Proof.**
- `tests/sw-cockpit.test.ts` (+9):
  - a scenario's change equals the difference of two independent costings;
  - "what differs" wording and module counts;
  - a refused scenario keeps its reason;
  - generated sets (sources, hubs with no travelling typed rate, reuse), with the input not mutated;
  - no wizard, `prompt` or second hub picker;
  - history excludes the rate book;
  - the dialog lists every wired shortcut;
  - no component £ sum.
- Full suite 3,854 / 3,854.
- Live: `e2e/sw-cockpit-flow.ts` drives a real server and browser. Its 13 checks all PASS:
  - a domain chip;
  - undo by button;
  - redo / undo by keyboard;
  - "?" / Esc;
  - "/";
  - pin → change → save → compare;
  - the hub set;
  - Load + undo;
  - Delete;
  - no money in the component list.

  axe gives `[]` on all eleven tabs and the open dialog, in dark and light (`calculator/scripts/sw-research/2026-10-14-ux/round2/`).
- `e2e/sw-live.ts` and `e2e/sw-studio.ts` were updated for the single pane (the studio now proves an edit survives a tab
  round-trip and undo restores it). Both pass with axe `[]`.

**Still open (UX):** scenarios live for the session plus the saved list. A pinned baseline is not stored between visits,
and there is no scenario chart beyond per-vehicle.

## 6. Gaps round — the independent review's ten gaps (14 Oct 2026)

An independent re-score put the module at **28 → 63 / 100** after rounds 1–2. It named ten gaps. All ten were worked
(commits c28f7d0 engine, 4761743 UI).

| # | Gap | What changed |
|---|---|---|
| 1 | Headline rests on unsourced inputs | Every £ carries an evidence grade (`swEvidenceLines`: your figures, calibrated, published source, labelled estimate, unsourced catalogue). The Monte Carlo draws each grade's own range (`SW_MC_RANGE_BY_GRADE`; costing review #13: sourced ±15 %, estimate × 0.5–2, unsourced × 0.5–3). The rail states "£187M (78 %) rests on unsourced catalogue figures". An evidence card lists the largest unsourced lines and what would source them. The default reuse is stated with its £ (Medium on 43/43 modules; fresh would add £37.4M). |
| 2 | Quote-check basis bug | A quoted £ per vehicle is compared with the royalty per vehicle **built** (£22.70); it was all licensing ÷ vehicles (£106, a false −43 % gap). It also checks per vehicle-year and fixed per year, and gives a Tier-1 negotiation target. With the supplier's PM the gap splits exactly into effort and rate. |
| 3 | Legacy sections | Modules, Risk, Report and Rates are rebuilt as cockpit views (`sw-cockpit-views.ts`). The old MC cards, sensitivity, phase, category and composition tables are gone. The AI card is `.ai-only` (hidden without a key). |
| 4 | Loaded rate too low | The single 1.15 overhead is replaced by three stated layers on the hub rate (`SW_DEFAULT_BURDEN`):<br>• employment +15 % — UK 1.31 × salary, inside Hadzima's 1.25–1.4 ×;<br>• company +40 % — labelled estimate; UK ≈ 1.8 × salary;<br>• capital 0 %.<br>Loaded UK rate: £48 → £68 / h, still below the £75 / h contractor median, which carries a contractor's margin. A saved configuration keeps its own overhead. |
| 5 | Structure | **Map data:** a 3-year subscription per vehicle (Nissan, Subaru, Hyundai and Honda include 3 years).<br>**Cloud:** each connected vehicle is served 10 years from build (Audi 10 yr; BMW, Mercedes and PSA lifetime — Berg Insight, dated). The tail runs past the last build year, and there is a fixed-platform input.<br>**Tools:** per engineer-seat-year (£39.5k, calibrated to the catalogue at the default; no public seat price).<br>**Maintenance:** on development + verification + integration, full for 3 years then 50 %, with optional wage escalation.<br>**Homologation:** on by default (type approval ≈ $1M per S&P; assessor; organisation CSMS / SUMS ÷ the vehicle types sharing it).<br>One yearly stream per line feeds the module PV, the spend profile and the unit economics. |
| 6 | Negotiation thin | Make or buy per domain (break-even: a Tier-1 pays only at ≤ 82 % of in-house effort). Discount rate (NPV) and wage escalation inputs. Excel gets Unit economics, Evidence, Quote check and Make or buy sheets; the PDF gets §6 Evidence and §7 Quote check. |
| 7 | Scope editing | A setting changed from the module default is marked, and its label names the default. Rows can be selected for a batch edit, and there is a domain filter. Selects are wider. |
| 8 | Mobile | Below 700 px the rail folds to the answer and the total ("All figures" opens it) and the secondary header buttons hide. Tabs fade at the edge. Scenarios reflow as a list. |
| 9 | Consistency | One vocabulary: the engine's domain names on every screen. Single-series marks use the accent. Drivers are in sentence case. The spend axis labels the last year. Motion moved to `animations.ts` (GSAP, loaded on demand). |
| 10 | Trust | The badge says "hub rates sourced; effort factors labelled by confidence". Unverified benchmark gaps are shown in text ink. The pinned baseline survives a reload (per viewer). One polite sentence is read out when the answer moves. |

**Money (default programme, `scripts/sw-review/baseline.ts`):**

| | Before | After |
|---|---|---|
| Total | £199.4M | £241.6M |
| Engineering (NRE) | £44.0M | £59.8M |
| Cloud | £47.3M | £86.0M |
| Licences | £84.8M | £61.8M |
| Maintenance | £23.3M | £34.0M |
| Per vehicle | £249 | £302 |

- Effort is unchanged (4,135 PM).
- Band: P10 £234M · P50 £276M · P90 £329M, with the headline ≈ P16.
  - The re-score caught a first attempt (unsourced × 0.5–3) that put the £302 / vehicle headline BELOW its own P10.
  - The grade ranges are now bounded (unsourced 0.6 / 1 / 1.9, estimate 0.7 / 1 / 1.6, sourced 0.85 / 1 / 1.2).
  - A test keeps the headline between P10 and P90 in five hubs.
- Demos: L460 £164.9M → £221.6M; BMW X7 £116.1M → £146.5M; Mercedes GLS £135.7M → £173.6M.

**Proof:**
- `tests/sw-cockpit.test.ts` (+14) covers:
  - the burden layers;
  - like-for-like quote rows;
  - the exact gap split;
  - make or buy;
  - the maintenance profile;
  - evidence lines summing to the total;
  - the band narrowing with entered PM;
  - the spend tail reconciling;
  - validation;
  - motion on one system;
  - one vocabulary;
  - AI gating;
  - neutral benchmarks;
  - the rail evidence and announcement;
  - the stored baseline;
  - scope markers.
- Tests updated to the new rules: sw-p2, sw-p3, sw-should-cost and sw-audit.
- Full suite: 3,862 pass.
- `e2e/sw-cockpit-flow.ts` 24 / 24 PASS, axe [] on 11 tabs + the dialog in dark and light. `e2e/sw-live.ts` and `e2e/sw-studio.ts` pass.

**Still open (stated):**
- The effort catalogue is unsourced. It is the largest lever: calibrate it, or size modules in KSLOC.
- Map £ / yr, cloud £ / vehicle-year and IP licences are unsourced; enter supplier quotes.
- The burden company layer is a labelled estimate.
- The evidence-grade ranges are CostVision estimates, not measured.
- Accuracy is unmeasured: no real programme actuals are logged.

**Independent re-score after this round: 28 → 63 → 71 / 100.**

The reviewer's remaining gaps:

| Gap | Status |
|---|---|
| Headline outside its own band | Fixed after the re-score (above). |
| Cloud: rate calibrated to the old fleet rule; 10-year service default rests on dated sources | **Open.** £86M, 36 % of the total. |
| No sustaining / cyber tail over the service years after the last build year | **Open.** |
| Make or buy is one factor applied to every domain | **Open.** Needs sourced Tier-1 rates and start-up risk. |
| 90-month development window against a 23-month longest module | **Open.** |
| Phone charts scale down instead of reflowing | **Open.** |
| The book rate looks like a typed value | **Open.** |
| Baseline is per viewer (localStorage) | **Open.** |
| Red at +0 % quote gap | Fixed. |
| Waterfall legend wording | Fixed. |
| Evidence grades in near-invisible green | Fixed (neutral-to-warning ramp). |
| Folded phone rail left an empty cell | Fixed. |
| Histogram not in the accent colour | Fixed. |
| Baseline rule drawn over the scenario labels | Fixed. |

## 7. Open-items round — research and fixes (14 Oct 2026)

The full record is in `docs/review/software-costing-open-items-2026-10-14.md`: sources, verification, before / after.
Every new default was re-searched by an independent agent before use.

**What the round changed:**

| Gap from §6 | Outcome |
|---|---|
| Cloud: 10-year service rests on dated sources | **8 years** — the median of current OEM terms (GM OnStar Basics 8, Tesla 8, Toyota ≤ 10, Mercedes US 5). The £ per vehicle-year stays unsourced; its basis now gives the only list price (AWS IoT FleetWise, US$5.4–7.2 per vehicle-year for data collection, closed to new customers 30 Apr 2026). Cloud £86.0M → £68.8M. |
| No sustaining / cyber cost after the last build | **Security support after the last build**: 10 years (CARIAD) × 25 % of the tail team. The duty is sourced (UN R155 post-production phase "until the end-of-life of all vehicles under the vehicle type"; R156 lifetime updates); the 25 % is a labelled assumption. It is its own evidence line, graded unsourced, with a sensitivity row and two Setup fields. +£6.6M. |
| Make or buy is one factor | Margin re-sourced on six ESPs (11.7 %; it was 18 % on four). A Tier-1 is now about break-even with in-house (× 0.997). No sourced in-house v supplier effort ratio or per-hub sell rate was found, so the efficiency factors stay labelled unsourced. |
| 90-month development window | **54 months** (Volkswagen's stated cycle, IAA 2023). Phases, team size and tool spreading follow it; undiscounted cost does not change. |
| Phone charts scale down | Charts are redrawn at the card's width; labels go above the bars below 520 px. |
| Book rate looks typed | The field is blank with a greyed placeholder; a typed value is the override. |
| Baseline per viewer | Stored as a project (`sw_baseline`) — on the server for a signed-in user. |

**Also sourced or corrected:**
- Avanci 4G cellular patent licence of US$20 per vehicle on the TCU module.
- Cerence price per unit US$5.09.
- UK contractor reference £525 / day (35 rates).
- Labels for GAS / QNX, map data, Qt and Bluetooth now say what is and is not published.

**Default programme:** £241.6M → **£243.0M**, £302 → **£304** per vehicle, royalty per vehicle built £22.70 → £37.84.

**Proof:**
- `tests/sw-cockpit.test.ts` adds the open-items block. Tests pinned to the old defaults were updated (sw-p2, sw-p3,
  sw-vehicle-studio).
- `e2e/sw-cockpit-flow.ts` passes 24 / 24 with axe []. `e2e/sw-live.ts` and `e2e/sw-studio.ts` pass, with axe [].

**Still unsourced (labelled):**
- the module effort catalogue (next source: Clark & Madachy's defence productivity tables);
- the cloud £ per vehicle-year, map data and IP licence £;
- the supplier efficiency factors;
- the post-production share.

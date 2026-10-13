# Automotive Software Should-Cost — UI / UX & Motion redesign spec

*Chief UI/UX & Motion review, 13–14 Oct 2026. Scope: the software costing module (`src/ui/panels/sw-*.ts`) inside the
CostVision shell. Evidence: the eight screenshots in `shots/` (1440 × 900, dark theme), `shots/sw-ux-shots.json`, the
code, and a timing run of the engine in this container.*

## 0. How this was reviewed, and what it rests on

- **Screenshots, all looked at:** `01`–`06` guided steps, `10` advanced setup, `11` advanced results. **`06` is not
  step 6.** It shows Step 5 again. The harness (`e2e/sw-ux-shots.ts:61`) clicks the *first* `.sw-wiz-btn-primary` in
  document order. On step 5 that is the **↻ Recalculate** button (`sw-should-cost-ui.ts:527`), which comes before
  **Next →**. So the harness made the same mistake a user would (see finding 8). No 400 px capture exists, so the
  mobile findings come from the CSS. The full-page shots stop at 900 px because the workspace scrolls inside its own
  panes.
- **Measured here:** `computeSWProgram(defaultSWProgramInputs())`, Monte Carlo (1,000 iterations) included, takes
  **3.5 ms** per call (mean of 20, `tsx`, this container). For the default programme the result is £212.84 M in total:
  NRE £44.0 M, maintenance £23.3 M, cloud £51.8 M and licences / royalties £93.7 M. **Licences and royalties make up 44 %
  of the total, and lifecycle as a whole 79 %.** The engine already returns `monteCarlo.curve` (19 points) and
  `monteCarlo.histogram` (20 bins). `src/engine/sw-cockpit.ts` exports `swSpendProfile` (18 years for the default) and
  `swQuoteCheck`. **No UI file imports any of them.**
- **External sources:** 14 web searches. WebFetch was not used, so every external claim below comes from search-result
  text and carries its URL (listed in §7). Anything marked *(judgement)* is my own professional opinion, not sourced.
- **Constraint kept throughout:** the golden rule. The UI formats engine results and never prices anything. Deltas are
  the difference between two engine results. Every chart reads `SWProgramResult`, `swSpendProfile` or `swQuoteCheck`.

---

## 1. Critique — the top 20 problems

Severity: **P1** means it misleads, or blocks the core loop (change an input → read the answer). **P2** means it slows
the expert or weakens trust. **P3** is polish or a policy breach.

| # | Problem | Evidence | Sev | Why it hurts a cost engineer |
|---|---|---|---|---|
| 1 | **The module sits in the wrong slots of the shell.** The SW panel renders into the *input* form area (`main.ts:12096-12100`). The real results pane keeps saying "No costing yet — … full 8-bucket should-cost with a confidence band and **DFM guidance**" (`main.ts:14608`), even while Step 4 shows £213.0 M (shots 02–05). Shell items that make no sense for software stay on screen: **Part Name "Unnamed Part"**, **Part Photo upload**, **Load Example** (the machining example's button, `index.html:1176`), and "**UK base rates** · £ GBP" (`index.html:1086`), although the software book has *no* UK base. `form-wide.ts` makes the page a single column to hide the conflict. | shots 01–05, 10 | P1 | Two contradictory states on one screen. The engineer can't tell whether a costing exists. The page talks about parts, photos and DFM for a software programme, which reads as a bolted-on module. |
| 2 | **Two parallel input UIs** (Guided wizard / Advanced) over one `_swInputs` object, kept in step by hand (`applyGuidedToInputs` 388-407, `syncAdvancedFields` 639-665, `setSWMode` 667-679). Comments in the code record three bugs this has already caused (F2 £406.7 M vs £388.7 M, F3, F5). Domain settings in Guided and per-module settings in Advanced each overwrite the other. | `sw-should-cost-ui.ts:388-679` | P1 | The same programme can give two answers depending on the mode. Every new input has to be built twice. Experts and novices can't share a screen or a saved file. |
| 3 | **No live recalculation, and no stale state.** The wizard computes on entering Step 4. Step 5 needs **↻ Recalculate**. Advanced needs **Calculate**, which sits below 54 module rows (`:922-926`). After an edit the result does not mark itself stale. `applySWCountry` says "The current result is marked stale" (`:2922-2924`), but nothing does that. A 20 ms `setTimeout` plus "Calculating…" (`:2739-2754`) frames a 3.5 ms computation as heavy work. | shots 04-05, code | P1 | The core loop of should-cost is "nudge a driver, watch the number". The engineer can read a figure that no longer matches the inputs. A 3.5 ms engine sits behind a button. |
| 4 | **Results are one 11,279 px scroll of 12 sections**, in the order they were built, not the order decisions need. Insights come 12th. Exports sit at the very bottom (`:977-984`). The main fact about this programme, that **79 % is lifecycle and 44 % is licences / royalties**, appears only as a sub-line of one KPI card. | `sw-ux-shots.json`, `:931-985` | P1 | An engineer preparing a negotiation has to scroll ~12 screens. The cost drivers that matter (licences, cloud) are buried beneath effort figures. |
| 5 | **The headline hides its own uncertainty.** £213.0 M appears with no band, although it sits at **≈ P33** (`:1715-1717`). The Monte Carlo section is four number cards and a paragraph. **No chart**, even though `curve` and `histogram` exist. The engine's doc comment reads "the S-curve the screen draws" (`sw-should-cost.ts:351`), and the screen draws none. | shot 11, `:1688-1718` | P1 | A point estimate quoted without a P50 / P80 invites anchoring on a figure below the median. Budgets are normally set at a percentile ([Dept of Finance AU](https://www.finance.gov.au/government/managing-commonwealth-resources/commonwealth-property-management-framework-rmg-500/defining-p50-and-p80); [GAO](https://gaoinnovations.gov/cost-guide/conducting-a-cost-risk-and-uncertainty-analysis.html)). |
| 6 | **The domain cost table looks wrong.** Step 4 shows Infotainment at **360 PM = £100.7 M (47 %)** and Powertrain at **567 PM = £16.8 M (8 %)**, with no NRE / lifecycle split to explain it. Measured: £79.1 M of Infotainment's £100.7 M is licences and royalties,
£10.6 M cloud and £4.1 M maintenance. Step 2 says Powertrain has "**14 modules**", Step 4 says **9** (`:463` counts every module in the category, not the BEV scope). The hero says "54 Modules", the result 43. | shots 02, 04; `:463`, `:582-589` | P1 | An engineer who sees effort and cost disagree assumes a bug and stops trusting the tool. Module counts change between screens with no explanation. |
| 7 | **The colour system breaks the theme.** A blue gradient hero (`:761-778`). **Blue** primary buttons for Next, Recalculate and Calculate (`:1320`, `:923`). A purple AI button (`:965`), an emerald Excel button and a navy PDF button (`:978-981`). Six KPI figures in six hues (`:1649-1656`, `:576-578`). `dark-green.css` sets *one* green accent, with "**Figures are white**; green is for actions". | shots 01-05, 11 | P2 | Colour no longer carries meaning. Blue reads as "primary" in the wizard and nowhere else. Purple / teal / orange KPI figures suggest categories that don't exist. The module looks like a different product. |
| 8 | **Two primary buttons of equal weight on one step.** On Step 5, Recalculate and Next are both solid blue (`:527`, `:428`). The capture harness clicked the wrong one (see §0). | shots 05 = 06 | P2 | The next action is ambiguous. Users who press Recalculate think they moved on. Users who press Next think they recalculated. |
| 9 | **Scope editing for 54 modules is a wall of controls.** Each row has 4 selects and 2 inputs (~324 controls, 3,913 DOM nodes). The only bulk tools are Select All / Deselect All (`:914-915`). There is no search, filter, multi-select or batch edit. Category headers are `div`s with inline `onclick` (`:723`): no keyboard access, no `aria-expanded`. | shot 10, `:684-748` | P2 | Setting "ASIL-D on all ADAS perception modules" takes ~9 separate selects. It can't be done from the keyboard. Overrides vanish into the grid. |
| 10 | **Sensitivity is a table**, and it mixes units: Production Volume is in £/vehicle, the other rows in £M (`:1864-1886`). Step 5 shows only the **hub** and **ASIL** swings (`:593-601`). Yet programme life (**£164 M–£333 M**) and reuse (£192 M–£249 M) are the biggest levers (measured). | shot 05, code | P2 | The engineer is steered towards the levers that matter least. A tornado sorted by swing is the standard way to read this ([CASRAI](https://casrai.org/guides/tornado-diagram-sensitivity-analysis); [MetricGate](https://metricgate.com/docs/deterministic-sensitivity-tornado/)). |
| 11 | **Three location controls.** The top-bar country, the shell's Country bar, and the software hub picker (`:447-448`, `:804-805`). The hub follows the country silently, and the reason appears only as a 0.66 rem note in Advanced (`#sw-hub-basis`). | shots 01, 10 | P2 | Two of the controls say UK while the third may say India. "Where is this costed?" should have one answer, shown once. |
| 12 | **Three engineer-rate figures that are never reconciled.** Step 1 shows **£6,384/PM** in the hub option. The Step 5 field labelled "**(optional)**" comes *pre-filled* with 6384 (`:525`). The walk-through shows **£7,342 / PM** (× 1.15 overhead, `:1676-1677`). | shots 01, 05, 11 | P2 | A pre-filled "optional" field looks like the user's own data. A third rate with no explanation looks like an error. |
| 13 | **The vehicle map dominates the results, and its £ list double-counts.** The side list gives Cloud back-end **£106.1 M**, Head unit **£100.1 M**, Telematics **£91.7 M**, Centre display **£79.3 M**. That is more than the £213 M total, because a module on four ECUs counts at each one, as `sw-vehicle-skeleton.ts:6-8` admits. | shot 11 | P2 | People sum lists. One screenshot of this panel in a supplier meeting would carry an inflated number. |
| 14 | **Scenarios are an afterthought.** "Save" uses `window.prompt` (`:2850`). Compare is a table inside a card at the *top* of Advanced (`:2572-2626`), with no deltas against a baseline, no chart and no list of what differs. There is no undo anywhere. | shot 10, code | P2 | Should-cost is a comparison discipline (as-quoted v should-cost, hub A v hub B). Without a baseline and deltas, the engineer has to note numbers by hand. aPriori treats scenarios as first-class for this reason ([aPriori guide](https://www.apriori.com/Collateral/Documents/English-US/online_help/2019_R2/APRIORI_USER_GUIDE/AP_AUG081Working_with_scenarios.html)). |
| 15 | **Breaches of the motion policy.** The wizard body runs `swWizIn 0.28s ease` (`:1314`), over the 260 ms ceiling and not power2. Bars use `transition: width 0.4s ease` (`:1204`), which never even runs because they are recreated with `innerHTML`. Non-interactive KPI cards lift on hover (`:1279-1280`). The primary button translates on hover (`:1321`). An inline JS `onmouseover` transform (`:904`). Smooth `scrollIntoView` runs on every step and on the results (`:619`, `:2051`), ignores reduced motion, and moves a workspace that is meant to be `overflow: clip`. The walk-through re-renders the whole SVG on every step (`sw-costing-pipeline.ts:90`). | code | P2 | Motion that says nothing, and motion that should run but doesn't. The page jumps on every Next. Focus and hover state are lost during the walk-through. |
| 16 | **A marketing hero instead of a header.** A 140 px gradient banner with a fixed claim, "Premium Luxury SUV — Full SW Stack · 54 Modules", whatever is configured. Four feature chips ("10 Cost Dimensions" titles a list of **9** rows, `:1799`). | shots 01, 10 | P3 | It takes the first viewport. It tells the engineer nothing about *their* programme, and one statement in it is wrong. |
| 17 | **Reference material placed as if it were current.** Four buttons open static reports. A paragraph explains that their figures are out of date (`:883-897`). The benchmark table is labelled "unverified — do not quote", yet ⭐ marks it (`:1888-1912`). | shot 10, code | P2 | The engineer sees "do not quote" next to a ⭐. Disclaimers in the main flow undermine trust in the live figure. |
| 18 | **Accessibility gaps in feedback.** The error box (`role="alert"`) hides itself after **6 s** (`:2668`), a fixed time limit ([WCAG 2.2.1 summary](https://usability.yale.edu/digital-accessibility/accessibility-resources/accessibility-articles/animated-content-and-timing)). Tooltips are `title` on an ⓘ glyph (`:433`), which keyboard and touch users can't reach. The mode toggle has no `aria-pressed`. | code | P2 | A validation message can vanish before it is read. The definitions of ASIL and reuse, the main levers, are mouse-only. |
| 19 | **Typography of numbers.** `.sw-num` sets `font-family: monospace` (`:1188`), against saas-polish F3 ("money in the UI face … tabular-nums"). Shot 04 shows monospace uppercase headers out of line with right-aligned figures ("MODULES" sits far left of its numbers). 0.62 rem tags (~10 px). | shot 04 | P3 | A typewriter look, ragged column alignment, and tags too small to read at 100 % zoom. |
| 20 | **Built engine views with no screen.** `swSpendProfile` gives spend by year, which is the view finance asks for. `swQuoteCheck` gives the gap to a supplier quote and the **implied £/PM**, the figure a negotiation turns on. Neither has any UI. | `sw-cockpit.ts` | P2 | The two views a commercial user needs most exist and are tested, but can't be reached. |

Also noted, not ranked: "Load an example" in the empty state loads the machining reference, not a software
programme. Choosing a powertrain in Advanced re-renders the whole panel (`:2699-2708`), which loses scroll position and
any results. The AI button stays on screen when `aiAvailable` is false (`ai-mode.ts` should hide it). Tables of 9–12
columns scroll sideways at ≤ 560 px.

---

## 2. Target information architecture

### 2.1 Principles *(judgement)*
1. **One workspace, no modes.** Guided and Advanced become the same form at two depths: progressive disclosure, not
   two forms. Visa's guidance is that multi-page wizards suit long, complex steps
   ([Visa](https://design.visa.com/patterns/wizard/usage/)). Appian's is that a single page with sections suits inputs
   that group naturally ([Appian](https://docs.appian.com/suite/help/26.9/sail/forms.html)). This model has ~10
   programme inputs plus a module table, and later answers change earlier ones (powertrain sets scope, hub sets rate),
   so one page fits. UX Movement makes the same point about dependent fields
   ([UX Movement](https://uxmovement.com/forms/single-page-vs-multi-page-forms-when-to-use-which/)).
2. **The answer is always on screen.** The default programme is valid, so it is costed the moment the panel opens.
   "No costing yet" never appears for software.
3. **Results in tabs, not one scroll.** Overview fits in about 1.5 viewports. Everything else is one click away.
4. **Evidence is a destination, not a disclaimer.** Rates, validation, benchmarks and reference reports live in one
   Evidence tab, each with its status.

### 2.2 Page regions (≥ 1280 px)

```
┌──────────────────────────────────── app header (unchanged: search · country · currency · New Costing · account) ──┐
├─ wf-panel-header: [▣ Software should-cost ▾]  Programme name (editable)        [Rates & evidence] [Export ▾] [⋯] ┤
├───────────── INPUT PANE (clamp 460–600 px, scrolls) ─────┬──────── RESULTS PANE (scrolls) ────────┬── RAIL 280 ─┤
│ ① Programme   (always open)                               │ Tabs: Overview · Breakdown ·            │ PER VEHICLE  │
│   powertrain [ICE|MHEV|PHEV|BEV] (segmented)              │  Uncertainty · Spend · Scenarios ·      │ £266         │
│   hub ▾ (one control; "follows country: UK" note)         │  Quote check · Method · Evidence        │ P10–P90 band │
│   dev source ▾ · volume · life · phase                    │                                          │ ──●──|────── │
│ ② Scope        7 domain chips  [Edit modules…] → drawer   │ (tab content)                            │ Total £213.0M│
│ ③ Safety & reuse  7 × {complexity, reuse, ASIL}           │                                          │ NRE   £44.1M │
│   "3 module overrides" chip per domain                    │                                          │ Life £168.9M │
│ ④ Commercial assumptions (collapsed)                      │                                          │ 43 / 54 mods │
│   overhead · senior share · own rate · calibration ·      │                                          │ Δ vs baseline│
│   dev months · connected % · platform vol · toggles       │                                          │ [Pin][Save]  │
└───────────────────────────────────────────────────────────┴──────────────────────────────────────────┴──────────────┘
```

- **1280–1599 px:** the rail folds into a sticky **summary bar** (64 px) at the top of the results pane, reusing the
  `result-headline.ts` pattern. It shows per vehicle, total, the band bar and Δ, plus Pin / Save.
- **< 1280 px:** one column. Inputs first, then results. The summary bar sticks to the **bottom** of the viewport.
- **Shell changes, applied when `activeCommodity === 'automotive_software'`:**
  - **Removed:** `#part-photo-row`; the results-pane empty state; the action bar's **Load Example**; and the shell's
    Country bar, because the hub control in ① replaces it and the app-header country stays the single source.
  - **Relabelled:** `#part-name` becomes "Programme name". `#country-bar-info` becomes "Hub rates · United Kingdom ·
    £ GBP".
  - **Re-homed:** the panel's results render into `.results-panel`, so `automotive_software` leaves `WIDE_COMMODITIES`
    in `form-wide.ts`. The workspace's two-pane CSS (saas-polish F1) then applies unchanged.
- **Removed from the module:**
  - the hero banner and its feature chips;
  - the Guided / Advanced toggle;
  - the "Quick Set" and "Demo Programmes" button rows. These become one **"Start from… ▾"** menu in the panel header:
    Baseline / Heavy reuse / Offshored / Fresh code, and the vehicle demos;
  - the inline Rate Library, Model Validation and Actuals cards, which move to the **Rates & evidence** drawer;
  - the dev-source decomposition table, which becomes a generated scenario set (§3.3);
  - the phase table, which folds into Spend.

### 2.3 Results tabs — content and order

| Tab | Content (all from the result) | Replaces |
|---|---|---|
| **Overview** (default) | **Cost waterfall** NRE → lifecycle → total. **Domain bars** stacked NRE / lifecycle. **Top 3 drivers** (mini-tornado). **3 insights** at most (the current Engineering Insights, ranked). One line of state: "Live · 43 modules · UK hub £7,342 / PM loaded" | KPI strip, Cost by Category, Composition, Insights |
| **Breakdown** | Module table (sortable, grouped by domain, top-5 marked with a "Top 5" tag, not a full green row). An optional module treemap toggle | Module Cost Detail |
| **Uncertainty** | **S-curve** with P10 / P50 / P80 / P90 and the headline marker, a **histogram** toggle, and the tornado (full) | Monte Carlo cards, Sensitivity table |
| **Spend** | Spend by year (`swSpendProfile`) with phase bands under the development years and an SOP marker. Cumulative total line as a separate small chart | Programme Milestone Phases |
| **Scenarios** | Baseline + saved + generated scenarios, Δ table, small multiples | Saved Configurations card, Dev Source table |
| **Quote check** | Supplier quote inputs → `swQuoteCheck` dumbbells and implied £/PM | — (new; engine exists) |
| **Method** | The 7-step walk-through and the vehicle map, rate build-up, assumptions list | Costing studio, Key-assumptions note |
| **Evidence** | Hub rate table, effort factors, validation back-test, benchmarks (labelled unverified, no ⭐), reference-report library with "pre-Oct-2026 model" badges, calibration to actuals | Rate Library, Validation, Benchmarks, reference buttons |

The **AI narrative** becomes a "Summarise" item in the panel header's ⋯ menu, shown only when `aiAvailable`. Its output
opens in Overview as a dismissible card marked "AI-written; figures are the engine's".

### 2.4 Empty, loading, error and stale states

| State | Behaviour |
|---|---|
| **First open** | The default programme is costed at once. A one-time inline coach card at the top of the input pane reads: "This is a default BEV programme at your country's hub. Change ① and ② to make it yours." Dismissing it is remembered in `localStorage` (try/catch). |
| **Zero modules in scope** | The rail shows "No modules in scope". The figures show "—", not £0, and an **Add a domain** button focuses ②. The charts keep their axes with an empty-state caption. |
| **Invalid input** (`SWInputError`) | Inline error under the field (`field-validation.ts` pattern), with `aria-invalid` and `aria-describedby`. The rail keeps the **last valid result**, dimmed to opacity .55, with the label "Showing last valid result — fix *Programme life*" (a link that focuses the field). **Never auto-hides.** |
| **Computing** | None visible. The engine takes 3.5 ms. If a future Monte Carlo grows past ~50 ms, the deterministic figures update first, and the band shows "updating…" until the MC lands (`requestIdleCallback`). |
| **Slow work** (AI summary, company-rate sync, saved-scenario load) | `long-task-progress.ts` (indeterminate bar, step, elapsed, Cancel). Never a percentage the server did not report. |
| **Stale derived content** | The AI summary and anything exported: "Written for the previous inputs — Refresh". |

### 2.5 Mobile (400 px)

- One column, 16 px gutters, no horizontal page scroll.
- **Bottom summary bar** (56 px, sticky) shows per vehicle, total and Δ, plus a chevron. Tapping it opens the rail's
  content as a bottom sheet.
- **Inputs:** the four accordion sections, with ① open. The powertrain segmented control wraps to 2 × 2.
- **Module editor:** a full-screen sheet with a **list, not a table**. Each row shows name, ASIL chip and live £. Tapping
  a row opens a row editor sheet with the 4 selects and 2 inputs. Search sticks to the top. Batch edit becomes a sticky
  bottom bar.
- **Results tabs:** a horizontally scrollable segmented control (scroll-snap) with an edge fade mask. This uses the
  `.commodity-tabs` technique and is the one sanctioned horizontal scroller.
- **Charts:** become vertical bar lists (label above a full-width bar, value right-aligned). The S-curve keeps the full
  width at 200 px tall. The tornado shows its top 4 with "Show all".
- **Tables:** become stacked label / value cards. The module table keeps 3 columns (name, ASIL, £) and the rest goes
  behind tap.
- **Vehicle map** (Method tab): the SVG scales to the width, the component list goes below it, and the side panel is
  dropped.
- **Touch targets:** ≥ 44 px *(judgement)*; WCAG 2.2's AA minimum is 24 px. Tooltips become tap toggletips.

---

## 3. Interaction design

### 3.1 Live recalculation

| Input kind | Trigger | Delay |
|---|---|---|
| select, segmented control, checkbox, chip, batch action | `change` | 0 ms (next `requestAnimationFrame`) |
| number / text | `input` | **debounce 150 ms**; immediate on `Enter` / `blur` |
| slider (if added for senior share / overhead) | `input` | throttle to one compute per frame |

- Compute stays synchronous, because 3.5 ms is well inside NN/g's 0.1 s "instantaneous" limit
  ([NN/g](https://www.nngroup.com/videos/3-response-time-limits-interaction-design/)). Budget: compute + patch
  ≤ 16 ms. A test asserts < 8 ms for compute on CI hardware.
- **Patch, don't replace.** Results are built once, and later updates set text and SVG attributes on keyed nodes
  (`data-k="cat-A"`, `data-k="kpi-total"`). The current `innerHTML` re-render is what kills the bar transitions, the
  focus and the walk-through hover state.
- Invalid input leaves `_swResult` as it was (last valid) and flags the field. Valid input clears the flag.
- **Screen readers:** one empty `aria-live="polite"` region is present from load. It announces "Per vehicle £262,
  down £4; total £209.8 M" **1 s after the last change**. Use `aria-busy` on the results pane during a burst. The
  figures themselves are *not* live regions. Live regions should be pre-rendered and batched, not created on update
  ([UXPin](https://www.uxpin.com/studio/blog/aria-live-regions-for-dynamic-content/);
  [Rocket Validator](https://rocketvalidator.com/glossary/live-region)).
- **Never scroll the page on recalculation.** Remove both `scrollIntoView` calls.
- Powertrain change: apply `applyPowertrainScope` to the inputs and patch. Out-of-scope modules stay in the table,
  greyed and tagged "ICE only" / "BEV only", with their settings kept. No panel re-render.

### 3.2 Scope selection: 54 modules in 7 domains

**Level 1, in the input pane (② Scope).** Seven domain chips: `[✓ ADAS L2/L2+ · 8/9 · £43.6 M]`.
- A click toggles the domain.
- The count is **in the powertrain's scope** (`applyPowertrainScope`), fixing finding 6.
- The £ is that domain's live total.
- A chip with module overrides carries a dot and "2 overrides".
- **[Edit modules…]** opens the module drawer, as does `M`.

**Level 2, the module drawer** (right side, 720 px wide, full screen on mobile; overlay motion per §5):
- **Toolbar:**
  - search (`/` focuses it; matches name, description and tags);
  - filters as chips: Domain ▾, ASIL ▾, Tags (ML · Cloud · SecOps · Royalty · Estimate), "In scope", "Overridden only";
  - sort ▾ (domain, £ high → low, PM, ASIL);
  - the count: "43 of 54 in scope · 6 shown".
- **Table:**
  - group headers are `<button aria-expanded>` with an "All / none" checkbox per group;
  - columns: select ☐ · include ◉ · module (name, tags, *estimate* badge) · ASIL · complexity · reuse · CAL ·
    KSLOC · custom PM · **live £** · **£ / veh**;
  - each cell that differs from the module default shows a 6 px accent dot, with "Reset to default (B)" on hover or
    focus;
  - an ASIL below default keeps today's ⚠, as a word badge ("below default C") so it doesn't rely on colour.
- **Selection:** click, Shift-click for a range, ⌘/Ctrl-click to toggle, ⌘/Ctrl-A for all shown.
- **Batch bar** (Carbon pattern: appears when rows are selected, Cancel to leave
  ([Carbon](https://v10.carbondesignsystem.com/components/data-table/usage/))), sticky at the drawer's foot:
  `6 selected · Include · Exclude · ASIL ▾ · Complexity ▾ · Reuse ▾ · CAL ▾ · Reset · Cancel`. Every batch action is one
  undo step and one recompute.
- **Live:** the drawer footer shows the rail figures and Δ, so the effect of a batch edit can be read without closing.

### 3.3 Scenario compare

- **Baseline.** **Pin as baseline** (`B`, or the rail button) freezes a copy of the inputs and the result. From then
  on, every figure in the rail and in Overview shows a Δ chip against it. A baseline is pinned automatically on first
  open (the default programme), and the label says so.
- **Save.**
  - **Save scenario** (`S`) opens a 280 px popover anchored to the button, never `prompt()`.
  - The name is prefilled from the inputs ("BEV · UK hub · 80k × 10 y · Medium reuse") and is editable.
  - It persists through the existing `saveConfig` / `loadSavedConfigs` (server, falling back to `localStorage`).
- **Scenarios tab:**
  - up to **4 columns**: Baseline, plus three chosen from Saved, plus **generated sets**;
  - **generated sets:**
    - "**Each development source**" replaces the decomposition table: three scenarios re-costed through
      `devSourceComparison`;
    - "**Cheapest / dearest hub**" comes from the sensitivity row;
    - "**Heavy reuse**".
  - **rows** are the metric (total, per vehicle, NRE, lifecycle, P50, P90, modules, hub, source). Each cell shows the
    absolute value and Δ against the baseline, with the sign and the word, never colour alone ("+£12.4 M dearer").
  - **What differs:** each scenario lists its input differences from the baseline ("Hub UK → IN; reuse Medium →
    Heavy (7 domains)"). The engineer has to know *why* two scenarios differ, not only by how much *(judgement)*.
  - **Small multiples:** one horizontal stacked bar (NRE | lifecycle) per scenario on a **shared axis**.
  - **Promote:** "Load into workspace" makes the scenario the current inputs. It is one undoable step.

### 3.4 Supplier-quote check (new tab, engine `swQuoteCheck`)

- **Inputs:**
  - quoted NRE, quoted £ per vehicle and, optionally, a quote line per domain (an "Add line" table);
  - the currency follows the money rule: entered in the display currency and converted to £ as `_targetPriceGbp`
    does. *Decision for the owner:* the rule allows one display-currency input today (the target price), and a quote is
    the same kind of figure.
- **Output:**
  - one **dumbbell** per line: a should-cost dot and a quote dot on a shared axis, the gap labelled "+£3.1 M (+7 %)";
  - the **implied £ / PM** next to the loaded rate: "Quote implies £11,900 / PM = ×1.62 our loaded £7,342";
  - a short, plain list of what the gap could mean, labelled *CostVision heuristic*. No £ is invented: the list only
    re-reads the gap.
- **Export:** a "Quote check" sheet / section in the Excel and PDF exports. Exports keep reusing the engine results.

### 3.5 Keyboard

The shortcuts are active only when focus is not in a text field. `?` opens the cheat sheet. Everything is also
registered in the app's ⌘K palette (`#cv-cmdk`), the convention Linear-style tools use for discoverability (third-party
description: [blakecrosley.com](https://blakecrosley.com/de/guides/design/linear)).

| Key | Action |
|---|---|
| `1`–`8` | Results tab 1–8 |
| `/` | Focus module search (opens the drawer) |
| `M` | Open / close the module drawer |
| `B` | Pin the current inputs as baseline |
| `S` | Save scenario |
| `⌘/Ctrl Z` · `⌘/Ctrl ⇧ Z` | Undo / redo |
| `E` | Export menu |
| `Esc` | Close the drawer / popover (existing `a11y.ts` handler) |
| `←` `→` | Previous / next walk-through step (already in the code), when the step list has focus |
| `Space` | Play / pause the walk-through, when its controls have focus |

### 3.6 Undo

- `_swInputs` is plain, serialisable data, so history is a ring of **50 snapshots** (structured clone, ~6 KB each).
- Edits to the *same* field within **1 s** merge into one entry. A batch edit, a preset, "Start from…" or loading a
  scenario counts as **one** entry.
- Each entry carries a label ("ASIL D on 6 modules"). After a destructive or bulk action, a toast appears
  (`toast.ts`): "Set ASIL D on 6 modules · **Undo**". The toast closes itself, but undo stays available through
  ⌘/Ctrl-Z and the rail's history button, so the time limit only applies to the hint, not the function.
- Undo and redo restore the inputs and recompute live (there is no separate "undo the result").

---

## 4. Data-visualisation spec

### 4.1 Tokens

The charts are built as inline **SVG**, through pure `(data) → string` builders in a new `src/ui/panels/sw-charts.ts`,
consistent with `sw-vehicle-skeleton.ts`. The builders can be tested in Node, and Chart.js stays out of the SW chunk.
Colour comes only from app tokens, mapped once:

```css
#sw-panel {
  --viz-nre:        var(--accent);           /* engineering / NRE — the one accent */
  --viz-life:       var(--text-secondary);   /* lifecycle — neutral, not a second hue */
  --viz-life-strong:var(--text-primary);
  --viz-good:       var(--sw-good);          /* favourable (teal in dark, green in light) */
  --viz-bad:        var(--sw-bad);
  --viz-warn:       var(--sw-warn);
  --viz-grid:       var(--border);
  --viz-axis:       var(--text-muted);
  --viz-label:      var(--text-secondary);
  --viz-total:      var(--text-primary);
  --viz-band:       var(--accent-light);
}
```

- **Two series colours at most** (NRE v lifecycle). The 7 domains are told apart by **label and order**, never by 7
  hues. That removes `CAT_META.color` from every chart; the domain icon stays.
- **ASIL** is an ordinal ramp, the same one the vehicle map uses: QM neutral, A / B `--viz-warn` at 50 %, C
  `--viz-warn`, D `--viz-bad`. It always carries the letter.
- **Type:** UI face, `font-variant-numeric: tabular-nums`. Remove `font-family: monospace` from `.sw-num`. Data labels
  0.75 rem, axis 0.7 rem, never below 0.7 rem.
- **Numbers:** totals as £213.0 M (1 dp), per vehicle as whole £, shares 0 dp in charts and 1 dp in tables, minus as
  U+2212. All money goes through `swMoney` / `swMoneyM`, so the display currency follows.
- Every chart is a `<figure>` containing `<svg role="img" aria-labelledby>`, a `<figcaption>` stating the one-sentence
  answer ("Licences & royalties are the largest bucket: £93.7 M, 44 %"), and a **"Table" toggle** that swaps in the
  data as a `<table>` (the accessible fallback, and also how it prints).
- Hover / focus: marks are focusable (`tabindex="0"` on the group) and show a tooltip with the value, share and source
  field. The crosshair snaps to the nearest point.
- Charts are length-based where accuracy matters. Position and length are read more accurately than angle or area
  (Cleveland & McGill; [Cornell notes](https://info3312.infosci.cornell.edu/ae/graphical-perception.html);
  [FlowingData](https://flowingdata.com/2010/03/20/graphical-perception-learn-the-fundamentals-first)). Hence **no
  pies or donuts**, and a treemap only as an optional overview.

### 4.2 Charts

| # | Chart | Where | Data | Encoding | Labels / notes |
|---|---|---|---|---|---|
| C1 | **Headline band** | Rail | `monteCarlo.p10/p50/p90`, `summary.grandTotal`, `headlinePercentile` | A 6 px horizontal range bar from P10 to P90 in `--viz-band`. P50 tick 1 px `--viz-total`. Headline marker: an 8 px dot in `--viz-nre` | "Headline ≈ P33 · P50 £221.0 M · P90 £242.9 M" (default programme, measured). Fixes finding 5 in the first viewport |
| C2 | **Cost waterfall** | Overview | `summary.total*` | Floating columns: Development → Testing → Integration → Toolchain → Calibration → Cyber → ML data\* → Homologation\* → **NRE** (subtotal) → Maintenance → Cloud → Licences & royalties → **Total**. Steps in `--viz-nre` (NRE) and `--viz-life` (lifecycle), subtotals solid `--viz-total` at 85 %, 1 px connectors in `--viz-grid` | Value above each bar, share below. \*Buckets of 0 are omitted, but **listed in the caption** ("ML data, homologation: £0"). Fixes the "10 dimensions / 9 rows" mismatch |
| C3 | **Domain bars** | Overview | `byCategory` + module NRE / lifecycle per domain | Horizontal stacked bars (NRE \| lifecycle) sorted by total, on one shared axis. PM as a text column on the right | Fixes finding 6: Infotainment visibly almost all lifecycle. Clicking a bar filters Breakdown to that domain |
| C4 | **Tornado** | Overview (top 3), Uncertainty (all) | `result.sensitivity` | Bars centred on the base line and **sorted by swing**. Left (favourable) `--viz-good`, right `--viz-bad`, both at 75 %. The range is in the label: "Programme life 8 ↔ 14 yr" | £M rows only. **Production volume (£/veh)** gets its own one-bar chart with its own axis, so units never mix. Clicking a bar end opens a *preview scenario* with that value |
| C5 | **S-curve** | Uncertainty | `monteCarlo.curve` (P5…P95) | Line 2 px `--viz-nre` over cost (x) and cumulative probability (y, 0–100 %). Drop lines at P10 / P50 / P80 / P90. Headline as a labelled vertical rule | Crosshair: "P(total ≤ £230 M) = 72 %". The S-curve is how risk teams pick a percentile ([GAO](https://gaoinnovations.gov/cost-guide/conducting-a-cost-risk-and-uncertainty-analysis.html)). P80 is computed from `curve` by interpolation (display arithmetic on engine output); if that is not acceptable, the engine adds `p80` |
| C6 | **Histogram** | Uncertainty (toggle with C5) | `monteCarlo.histogram` (20 bins) | Columns `--viz-life`, with P10–P90 bins tinted `--viz-band` | The caption repeats the correlation assumption in one line. The full paragraph moves behind "Model" |
| C7 | **Spend by year** | Spend | `swSpendProfile().years` | Stacked columns: engineering `--viz-nre`, then maintenance / licences / royalties / cloud as **3 neutral steps** (`--viz-life` at 100 / 70 / 45 / 25 %). Phase bands as a 4 px strip under the development columns. SOP as a dashed vertical rule | Cumulative total as a **separate** 80 px line chart below on the same x-axis (no dual axis). Caption: peak year and its £ |
| C8 | **Quote dumbbell** | Quote check | `swQuoteCheck` rows | Should dot ○ `--viz-total`, quote dot ● `--viz-nre`, joined by a 2 px line. Gap label at the right | The implied £/PM sits in a stat block, not a chart |
| C9 | **Scenario multiples** | Scenarios | the scenarios' summaries | One stacked bar per scenario (as C3) on a **shared axis**, the baseline outlined | The Δ label is the text, not the colour |
| C10 | **Module treemap** (optional) | Breakdown toggle | `modules[].grandTotal` by domain | Domain blocks (neutral outline), module tiles with fill by ASIL ramp | A tile is labelled only at ≥ 3 % share, the rest via tooltip. The table stays the primary view |
| C11 | **Vehicle map** (existing) | Method | as today | Keep scope / ASIL colouring. **Drop the £ from the side list**, which becomes "Cloud back-end — 10 modules". The module list inside a component keeps each module's own £, headed "Module totals — not additive across components" | Fixes finding 13 |

---

## 5. Motion spec

### 5.1 Constraints, from `animations.ts` and saas-polish.css

- **One system.** Persistent-element state changes run on CSS transitions using the existing tokens (`--dur-micro`
  150 ms, `--dur-hover` 200 ms, `--dur-page` 260 ms, `--ease-decel`, ease-in for exits). Entrances, data-mark tweens and
  the one count-up go through **GSAP helpers in `animations.ts`** (`power2.out` / `power2.in`).
- **Hard limits:**
  - no new library, and no WAAPI alongside GSAP;
  - travel ≤ 8 px, durations 150–260 ms;
  - no scale on UI chrome, no back / elastic easing;
  - **one** count-up;
  - reduced motion is read live, and every helper returns at once.
- CSS equivalent of GSAP `power2.out` (cubic): `cubic-bezier(0.215, 0.61, 0.355, 1)`; `power2.in`:
  `cubic-bezier(0.55, 0.055, 0.675, 0.19)`. Use the GSAP names in JS and `--ease-decel` in CSS (close enough
  *(judgement)*; do not add a fourth curve).
- Carbon gives the reasoning the app already follows: "productive" motion (subtle, efficient) for the work, and
  "expressive" for rare moments such as the primary action
  ([Carbon](https://carbondesignsystem.com/elements/motion/overview/)). The single count-up is this module's only
  expressive beat.

### 5.2 New helpers (in `animations.ts`, each a no-op under `reducedMotion()`)

```ts
revealOnce(key: string, els, opts)  // entrance the first time `key` is seen this session (sessionStorage, try/catch)
tweenMarks(svgEls, attrs)           // gsap.to(el, { attr: {...}, duration: DUR.base, ease: 'power2.out', overwrite: 'auto' })
flipRows(container, keyAttr)        // FLIP reorder ≤ 12 rows: translateY only, DUR.base, power2.out; >12 rows → instant
markChanged(el)                     // adds .is-changed (CSS tint), removes after 600 ms; no transform
```

`sw-costing-pipeline.ts` keeps its own GSAP-free `reducedMotion` copy, so the walk-through chunk doesn't load GSAP.
Move that copy into a tiny `motion-pref.ts` shared by both.

### 5.3 Choreography

**A. First results reveal** (panel open, default programme costed). Runs once per session (`revealOnce('sw-first')`).

| t (ms) | Element | Motion |
|---|---|---|
| 0 | Workspace | existing `onViewShown('costing')`: fade + 4 px, 260 ms. **The SW panel adds nothing of its own to the input pane.** |
| 0 | Rail per-vehicle figure | `enter` fade + 6 px, 260 ms `power2.out` **+ the ONE count-up**: 60 % → 100 % of the value, 450 ms `power2.out` (the existing `animateResultHero` contract) |
| 60 | Rail secondary figures, band bar | fade, 200 ms, stagger 30 ms (4 items = 90 ms) |
| 90 | Overview cards (waterfall, domain bars, drivers, insights) | fade + 4 px, 200 ms, stagger 30 ms, **total stagger ≤ 120 ms** |
| 150 | Waterfall / domain-bar marks | grow from the baseline (`tweenMarks` on `height`/`width` from 0), 260 ms `power2.out`, stagger 12 ms capped at 120 ms total |
| 210 | Data labels | fade 150 ms (labels never move) |

The whole sequence finishes by ~600 ms. Axes, grid lines and captions are present from t = 0.

**B. Live update** (an input changed, compute done).

| Element | Motion |
|---|---|
| Figures (rail, KPI text, table cells) | **Text swaps instantly. No count-up, no rolling digits.** Mid-flight numbers are false numbers *(judgement)*. `markChanged`: background `--accent-light` appears at once, holds 400 ms, then fades out over 200 ms ease-in (CSS). |
| Δ-since-last-edit chip (rail) | enters fade + 4 px, 200 ms `power2.out`; when replaced, the old one crossfades out over 150 ms ease-in. It stays until the next edit. **Δ-vs-baseline chips do not animate**; their text swaps. |
| Bars / waterfall / tornado / S-curve | `tweenMarks` from the current geometry to the new one, **200 ms `power2.out`**, `overwrite: 'auto'`, so a burst of edits retargets smoothly instead of queueing. S-curve: tween the `d` points with the same timing (19 points, cheap). |
| Re-ordering (domain bars, tornado, sorted module table) | `flipRows`, 200 ms, ≤ 12 rows. Above that, instant. **The module table never re-sorts while a field inside it has focus**; it re-sorts on blur. |
| Invalid → last-valid dim | opacity 1 → .55, 150 ms, `--ease-std`. Back to 1 over 150 ms. No shake. |

**C. Chart draw-in** (the first time each tab opens per session, `revealOnce('sw-tab-'+id)`).
- Bars / columns grow from the baseline, 260 ms `power2.out`, stagger ≤ 120 ms total.
- **Lines and the S-curve fade (200 ms), and are not drawn on with a dash.** Drawing a cumulative-probability curve
  from left to right suggests time passing *(judgement)*.
- The histogram grows its columns from the baseline as bars do.
- Every later visit to the tab shows the chart at once.

**D. Costing walk-through** (Method tab).
- **Rendering:** `draw()` toggles classes and swaps text. It does **not** rebuild the host's `innerHTML`, so focus,
  hover and the SVG survive.
- **Per step:**
  - the "now" sentence crossfades (out 150 ms ease-in, in 200 ms `power2.out` with 4 px of rise);
  - the lit components change fill / stroke / opacity in CSS over 200 ms (already in place, `.swv-comp .swv-m`);
  - dimmed components go to .35 opacity over 200 ms;
  - links highlight over 200 ms;
  - the step chips change state by class (colour only, 150 ms).
- **Dwell:** 1.4 s today. Make it **2.2 s** *(judgement: the detail sentences run 25–40 words)*. Pause while the
  pointer or focus is inside the studio. Stop on any input. The full walk ≈ 15 s and can always be paused (WCAG 2.2.2).
- **Reduced motion:** no autoplay. **Play** becomes **Show final step** (current behaviour, kept). Class changes still
  apply, with no transitions.

**E. Tab changes.**
- The outgoing panel hides instantly.
- The incoming panel gets the existing `.cv-tab-enter` (fade 150 ms `--ease-decel`, no travel).
- The tab indicator changes colour over 150 ms; it does not slide.
- Then any first-visit chart draw-in (C) runs.

**F. Drawers, popovers, the batch bar.**
- **Module drawer and Rates & evidence drawer:** the existing `#cv-trace-drawer` contract. Enter translateX(24 px) → 0
  + opacity, 260 ms `--ease-decel`. Exit 150 ms ease-in. `display … allow-discrete` with `@starting-style`.
- **Save popover:** fade + 4 px, 150 ms in, 150 ms ease-in out.
- **Batch bar:** fade + 8 px up, 200 ms in, 150 ms ease-in out.
- **Accordion sections:** **no height animation**. The chevron rotates 150 ms, and the content fades 150 ms.

**G. Rail Δ chips and the undo toast.** As in B. The toast uses `toast.ts` as it is.

### 5.4 What must NOT animate

- Number values on live update: no count-up, no roll. The one count-up is the first reveal of the per-vehicle figure.
- Axes, grid lines, tick labels, captions, table headers, legends.
- Anything on hover except colour, border and shadow. **Remove** the KPI card lift (`:1279-1280`, they aren't
  interactive), the primary button's `translateY` (`:1321`) and the inline `onmouseover` transform (`:904`).
- Scrolling. **Remove** `scrollIntoView({behavior:'smooth'})` at `:619` and `:2051`. Results never move the page. If
  focus has to move (e.g. "fix field"), use `focus({preventScroll:false})` with no smooth scrolling.
- Layout: no height / width animation of panels, the drawer width, accordions or the rail.
- Focus rings (instant), skeletons (static half-tone, no shimmer), the module table while one of its fields has focus.
- **Remove** `@keyframes swWizIn` (`:1314-1315`, 280 ms `ease`) together with the wizard, and the dead
  `.sw-bar-fill { transition: width 0.4s ease }` (`:1204`).

### 5.5 Proof

- Extend `tests/motion-system.test.ts`: the SW files contain no `transition: all`, no duration > 260 ms except the
  count-up, no `translateY` on `:hover` of non-link elements, and no `behavior: 'smooth'`.
- Add the SW panel to `e2e/motion-live.ts`: record GSAP tweens during the first reveal and during one live edit, and
  assert the count (1 count-up, 0 on the edit).

---

## 6. Prioritised build list

The order is set by the biggest perceived quality jump per unit of effort. Each item names the findings it closes.
S ≈ ≤ 1 day, M ≈ 2–4 days, L ≈ 1–2 weeks *(judgement)*.

| # | Build | Size | Closes |
|---|---|---|---|
| 1 | **Theme and header pass:** remove the hero; put the primary actions on the one accent (`--accent` / `--on-accent`); make figures `--text-primary`; drop the per-KPI hues and the gradient buttons; switch `.sw-num` to the UI face with tabular-nums; raise the minimum text to 0.7 rem. | S | 7, 16, 19 |
| 2 | **Shell re-home:** results render into `.results-panel` (take `automotive_software` out of `WIDE_COMMODITIES`); hide the part photo, the empty state, Load Example and the shell Country bar; relabel Part Name and the rate-basis line. | M | 1, 11 |
| 3 | **Live recalculation:** debounce table §3.1; patch keyed nodes instead of `innerHTML`; keep the last valid result; inline errors that never auto-hide; remove Calculate and Recalculate; one polite live region. | M | 3, 8, 18 |
| 4 | **Summary rail / bar:** per vehicle (the one count-up), total, NRE, lifecycle, **C1 band**, modules, the loaded-rate reconciliation line ("£6,384 book → £7,342 loaded: × source 1.0 × overhead 1.15"), Pin baseline, Δ chips, Export. | M | 5, 12, 4 |
| 5 | **Uncertainty tab:** C5 S-curve + C6 histogram from the existing `curve` / `histogram`, plus the C4 tornado (units split). | S | 5, 10 |
| 6 | **Overview tab:** C2 waterfall, C3 domain NRE / lifecycle bars, top-3 drivers, ≤ 3 insights; the other tabs created with today's content moved in. | L | 4, 6 |
| 7 | **Motion clean-up and helpers** (§5.2, the removals in §5.4), plus the walk-through rendering by class toggle. | S | 15 |
| 8 | **One input pane:** merge Guided and Advanced into the 4 accordion sections; domain chips with in-scope counts; "Start from…" menu; first-open coach card. Delete the wizard and the sync code. | L | 2, 6, 16 |
| 9 | **Module drawer:** search, filters, multi-select, batch bar, override dots, live £ per row, header `<button aria-expanded>`. | M | 9 |
| 10 | **Undo / redo and keyboard map**, registered in ⌘K, with the `?` sheet. | M | 14 |
| 11 | **Scenarios tab:** baseline pin, inline save popover, Δ table, "what differs", generated sets (dev source / hub / reuse), C9. | M | 14 |
| 12 | **Quote check tab** on `swQuoteCheck` (C8, implied £/PM), plus the Excel / PDF section. | M | 20 |
| 13 | **Spend tab** on `swSpendProfile` (C7, phase strip, cumulative line); delete the phase table. | S | 20 |
| 14 | **Evidence tab and Rates & evidence drawer:** move the hub table, factors, validation, actuals, benchmarks (no ⭐) and the reference reports, each with its status badge. | S | 17 |
| 15 | **Vehicle map:** drop the £ from the component list (C11); move it to Method. | S | 13 |
| 16 | **Mobile 400 px pass** (§2.5). Fix `e2e/sw-ux-shots.ts` so it clicks `#sw-wiz-next` (or the new controls), add `CV_WIDTH=400` shots, and run `e2e/ui-audit.ts` (axe) on every new state. | M | mobile, 18 |

**Fastest visible gain:** items 1–5 together, about 2 weeks of work at the sizes above. After them, the module opens
with a live answer, its band and the right accent, and the whole result fits on one screen.

---

## 7. Sources

External claims above come from search-result text; the pages were not opened (WebFetch was not used).

- NN/g, response-time limits: https://www.nngroup.com/videos/3-response-time-limits-interaction-design/
- Carbon motion (productive v expressive; curves): https://carbondesignsystem.com/elements/motion/overview/ ·
  https://carbondesignsystem.com/elements/motion/code/
- Carbon data table batch actions: https://v10.carbondesignsystem.com/components/data-table/usage/ · Agriculture DS
  batch-action pattern: https://design-system.agriculture.gov.au/patterns/selectable-table-with-batch-actions
- Wizard vs single page: https://design.visa.com/patterns/wizard/usage/ · https://docs.appian.com/suite/help/26.9/sail/forms.html ·
  https://uxmovement.com/forms/single-page-vs-multi-page-forms-when-to-use-which/
- Tornado diagrams: https://casrai.org/guides/tornado-diagram-sensitivity-analysis ·
  https://metricgate.com/docs/deterministic-sensitivity-tornado/
- P50 / P80 and S-curves: https://www.finance.gov.au/government/managing-commonwealth-resources/commonwealth-property-management-framework-rmg-500/defining-p50-and-p80 ·
  https://gaoinnovations.gov/cost-guide/conducting-a-cost-risk-and-uncertainty-analysis.html ·
  https://web.aacei.org/docs/default-source/toc/toc_55r-09.pdf
- Graphical perception (Cleveland & McGill): https://info3312.infosci.cornell.edu/ae/graphical-perception.html ·
  https://flowingdata.com/2010/03/20/graphical-perception-learn-the-fundamentals-first
- Accessibility (timing, animation from interactions, live regions):
  https://usability.yale.edu/digital-accessibility/accessibility-resources/accessibility-articles/animated-content-and-timing ·
  https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions ·
  https://www.uxpin.com/studio/blog/aria-live-regions-for-dynamic-content/ · https://rocketvalidator.com/glossary/live-region
- Scenarios in a cost tool (aPriori): https://www.apriori.com/Collateral/Documents/English-US/online_help/2019_R2/APRIORI_USER_GUIDE/AP_AUG081Working_with_scenarios.html
- Command palette convention (third-party description of Linear): https://blakecrosley.com/de/guides/design/linear
- Headline value above the chart (Stripe Apps chart layout): https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Galorath SEER: searched, but the results gave no public evidence of its chart set, so nothing here relies on it.

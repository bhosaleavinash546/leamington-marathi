# Automotive software should-cost — code review (13 Oct 2026)

Scope: `src/engine/sw-should-cost.ts`, `sw-rate-library.ts`, `sw-validation.ts`, `sw-calibration.ts`, `sw-benchmarks.ts`,
`src/ui/panels/sw-should-cost-ui.ts`, `sw-actuals.ts`, `sw-currency.ts`, `sw-rate-field.ts`, `server/routes/rate-library.ts`
(SW routes), `server/utils/sw-rate-library-xlsx.ts`, `server/data/rate-library-store.ts`, `server/routes/aichat.ts`, `src/ui/main.ts`
wiring, the SW scripts and `tests/*sw*`. All paths below are relative to `calculator/`.

The items already fixed in the 360 / P1 / P2 / P3 reviews are not repeated. Where a finding continues an earlier one, it says so.

**Tags:** **Verified (run)** means reproduced with a tsx script against the engine (the scripts are in the session scratchpad and
are not committed). **Verified (code)** means read on the exact lines. **Likely** means strong evidence that was not run. No file
other than this report was changed. The 7 SW test files pass (144 tests).

Default programme, used as the reference below: BEV stack, UK, 80k / yr × 10 yr. Total **£388.74 M**, £485.92 / vehicle,
effort 4,135 PM, MC P10 / P50 / P90 = £366.4 M / £402.4 M / £441.7 M, headline ≈ P33.

---

## Summary of findings

| ID | Pri | Area | One line |
|---|---|---|---|
| F1 | **P1** | robustness | One out-of-range optional KSLOC in "Calibrate to your actuals" is saved to localStorage, then throws during panel wiring on every later load. The SW panel stops working in that browser |
| F2 | **P1** | screen drift | The Guided wizard and the Advanced form give different totals for the same choices: default **£406.7 M vs £388.7 M**. The wizard also ignores the PHEV / BEV de-rating |
| F3 | P2 | screen drift | Switching Guided ⇄ Advanced loses edits. Advanced Calculate re-reads stale fields; the wizard overwrites per-module settings and keeps hidden ones |
| F4 | P2 | region | "UK base rate" is always multiplied by the hub multiplier. Typing an India rate in India costs labour at 1/5 (the company workbook has the same trap) |
| F5 | P2 | UX / error | Wizard errors are invisible: the error box is inserted into the hidden Advanced body, and the exception is re-thrown uncaught |
| F6 | P2 | theme / a11y | The SW panel follows the OS colour scheme, not the app theme (default dark). Insight cards use light literal backgrounds with theme text colour |
| F7 | P2 | units | "Average team FTE" divides effort by programme life (120 months) instead of development duration (90 months): 34 FTE shown, 46 FTE actual |
| F8 | P2 | drift | "Lifecycle (Maint+Cloud)" card leaves out £93.7 M of licences / royalties, while the next card and the compare table include them |
| F9 | P2 | AI | The server system prompt still says "always give concrete numbers or ranges". This contradicts the panel's "add no numbers", and no output guard checks it (residual of B13) |
| F10 | P2 | export | The SW PDF is not WinAnsi-hardened: ₹ ₩ ฿ ₫ ₺ ₱ zł Kč and "≈" in "Headline (≈ P33)" print as mojibake |
| F11 | P2 | UX | The presets do not do what their names say. "Premium OEM (High ASIL, Fresh)" changes no ASIL and LOWERS 20 Very-High modules (−£97.5 M). "Aggressive" moves to China without saying so |
| F12–F40 | P3 | various | see §1 P3 table |

---

## 1. Arithmetic, units, double counting, NaN / zero paths

### P1

**F1 — The calibration card can permanently break the panel** (Verified (run) for the throw; Verified (code) for the wiring order; not run in a browser)

- **Input:** "Calibrate to your actuals" → any module, Actual effort 10, Size (KSLOC) **0.05** → Add. The same happens with any size above
  10,000, or with a stored row whose ASIL / complexity / reuse is unknown.
- **Wrong output:**
  1. `sw-actuals.ts:246` accepts any `> 0` and saves the row to `localStorage['cv-sw-effort-actuals']` (`:248`) *before* calling `draw()`.
  2. `draw()` → `calibrateSWEffort` → `modelledEffortPM` → `computeSWProgram` throws `SWInputError: tcu_software: size must be
     0.1–10,000 KSLOC` (reproduced).
  3. On every later panel load, `wireSWPanel` calls `wireActuals` (`sw-should-cost-ui.ts:2571`) **before** it wires Calculate, the
     presets, the demos, AI and the exports (`:2578` onwards).
  4. So the throw aborts the wiring. Calculate does nothing until the user clears site data.
- **Fix direction:**
  - Validate size against `0.1–10,000` at Add.
  - Wrap the fit in a try / catch and drop bad rows.
  - Wire the actuals card last.

### P2

**F7 — FTE uses the wrong time base** (Verified (run))

- Where: `sw-should-cost-ui.ts:1586` (card) and `:1946–1950` (insight).
- `avgFTE = totalEffortPersonMonths / (programLifeYears × 12)`.
- The effort PM (development, test, integration, cyber, calibration) is spent over `developmentMonths` (default 90, the phase
  timeline), not over production life. Maintenance carries no PM at all.
- **Example (default):** 4,135 PM ÷ 120 = **34 FTE "across 10-year programme"**. Over the 90-month development the figure is
  **46 FTE**, +33 %.
- The insight text then says "the peak during development is higher" — it is the average that is wrong.
- Fix: divide by `developmentMonths ?? 90`, and label it "average over development".

**F8 — "Lifecycle" means three different things on one screen** (Verified (run))

- The card at `:1596` is "Lifecycle (Maint+Cloud)" = **£151.6 M (39 %)**.
- The per-vehicle card sub-line (`:1590`) and the compare table "Lifecycle" row (`:2478`) also include licensing / royalties:
  £151.6 M + £93.7 M = **£245.3 M**.
- Since P2 #11, royalties are the largest lifecycle item after maintenance, so the card under-states lifecycle by 38 %.

### P3

| ID | Finding | Where | Input → wrong output | Tag |
|---|---|---|---|---|
| F12 | Homologation is charged in full to each variant even when `platformAnnualVolume` apportions shared software. R155 CSMS and R156 SUMS are organisation-level audits, so summing variants counts them N times. It is also missing from `byCategory`, so the category shares do not sum to 100 % | `sw-should-cost.ts:1575–1578, 1611–1613` | `includeHomologation`, platform 320k: homologation £2.90 M on a variant with share 0.25; Σ byCategory £234.94 M vs total £237.84 M | Verified (run); engine-only today (not exposed on screen) |
| F13 | ML-data and homologation are in the total but in **no** bucket list (screen composition `:1701–1711`, Excel `:2093–2102`, PDF `:2255–2265`). The composition rows then do not sum to the total | UI + exports | both on: 9 buckets £388.74 M, total £395.86 M (−£7.13 M missing) | Verified (run); latent (no screen toggle — see F27) |
| F14 | Discounting mixes time origins. Development labour NRE is never discounted. Tool licences are discounted from t = 1 over development years. Maintenance, royalties and cloud are discounted from t = 1 too, although they start after SOP (≈ 7.5 yr later). Result: post-SOP costs are over-weighted against an undiscounted NRE | `:1156–1167, 1252–1259, 1349–1358` | 8 %: maintenance £99.75 M → £66.94 M; NRE £143.44 M → £139.78 M (tools only) | Verified (run); engine-only |
| F15 | Schedule compression also inflates post-SOP maintenance. `maintenance = devTotal × %`, and `devTotal` carries `schedPenalty` | `:1093, 1110, 1170–1171` | `scheduleCompression 0.7`: development ×1.450 **and** maintenance ×1.450 | Verified (run); engine-only |
| F16 | The engine does not validate rate-book values. A programmatic or API `rateLibrary` with a multiplier of 0 costs labour at £0, and `effortPersonMonths` becomes NaN (÷ regionRate). The workbook path refuses 0; `validateSWInputs` checks only keys | `:1196, 1519–1555` | India multiplier 0 → total £159.2 M, effortPM **NaN** | Verified (run) |
| F17 | The sensitivity "Production Volume" row uses fixed 150k / 50k, so the bracket can miss its base and "Low = favourable" is false. The "ASIL D vs B" row forces the 9 QM modules (IVI, cloud…) to B / D | `:1646–1667`; note `ui:1811` | volume 200k: low £335 / base £292 / high £680 per vehicle | Verified (run) |
| F18 | A platform volume below the programme volume is silently ignored (`attributedShare` → 1). There is no validation message, and the rate basis then says "not shared" | `:105–110, 1537` | platform 40k, own 80k → no message, £388.74 M | Verified (run) |
| F19 | Seniority is blended twice and productivity is ignored. The base is a "UK senior-**blended**" rate (`sw-rate-library.ts:34, 55`), then `seniorMult` 1.20 / 0.75 blends again (`:1074`). The tooltip says seniors are "more productive" (`ui:508`), but no effort term moves, so a higher senior share can only raise cost | engine + UI | senior 1.0 → loaded rate +23 %, effort unchanged | Verified (code); whether 1.20 / 0.75 already sit in the £28k is Likely |
| F20 | KSLOC definition is ambiguous: total size or new / changed? The reuse factor (default Medium 0.60) is applied on top of the COCOMO PM (`:1097–1098`). Entering total size of a reused module discounts reuse twice | `:1097–1098`, title `ui:668` | 100 KSLOC "Medium" → 0.6 × COCOMO(100) | Verified (code) |
| F21 | Person-month length differs. The base rate is "day-rate × 20 days"; COCOMO's PM is 152 h (`:1318`). Read on the same rate, the size path costs a 152-h PM as a 20-day PM (≈ 5 % at 8 h / day) | `sw-rate-library.ts:55`, `sw-should-cost.ts:1318` | — | Verified (code) |
| F22 | Integer truncation: Custom PM is read with `parseInt`, so "12.5" costs 12 | `ui:1351` | 12.5 → 12 PM | Verified (code) |
| F23 | Silent clamps are left after P2 #8. Overhead "0" or blank → 1.15 (`||`), 0.9 → 1.0, senior share 5 → 1, wizard life / volume `Math.max(1, …)`. None of these is reported | `ui:1295, 1305–1306, 530–531, 539–540` | type overhead 0 → costed at 1.15 | Verified (code) |
| F24 | Zero path: `share = val / s.grandTotal` in the Excel / PDF / AI prompt is not guarded. `grandTotal` can be 0 (one module, custom PM 0, no licences) → "NaN %" | `ui:2093–2102, 2010` | — | Likely (a £0 programme needs a licence-free module) |

**Units check (no defect):**
- Effort stays in person-months throughout.
- `effortPersonMonths = Σ£ ÷ regionRate` is rate-independent, so calibration works in any hub.
- £ → display currency happens only in `sw-currency.ts` (`swConv`).
- Royalties use `USD_PER_GBP` once (`ivi_os`).
- `headlinePercentile`, the Monte-Carlo per-vehicle rule and `personMonths × loaded rate = development £` reproduce.

---

## 2. Where the region rate is applied, and what a per-country rate model must change

### 2a. Every place the region / UK-base model is applied (Verified (code))

| What | Where | How it is used today |
|---|---|---|
| `SWRegion` type (9 keys) | `src/engine/sw-should-cost.ts:35` | `'UK' \| 'EU' \| 'USA_Detroit' \| 'USA_SV' \| 'China' \| 'India' \| 'Mexico' \| 'Eastern_Europe' \| 'Japan'` |
| `swRegionFor(country)` | `sw-should-cost.ts:45–63` | Maps the 39 app countries to 9 hubs. Full mapping below |
| `REGION_MULT` export | `sw-should-cost.ts:368` | Display / back-compat map |
| `resolveRates()` | `sw-should-cost.ts:390–403` | `baseRate = baseRateGBP ?? lib.ukBaseRatePerPM`; `region = rateValues(lib.regionMultipliers)` |
| **The rate itself** | `sw-should-cost.ts:1075–1076` | `regionRate = baseRate × region[prog.region] × devSource × seniorMult × overhead` |
| `swLibraryBaseRate()` | `sw-should-cost.ts:386–388` | Fills the UI base-rate field from `ukBaseRatePerPM` |
| `swRateBasis()` (exports) | `sw-should-cost.ts:1267–1299` | Prints "Base rate (£ / person-month, pre-overhead)", "Engineering region X × m" and "Loaded rate" |
| Validation | `sw-should-cost.ts:1523, 1529–1530` | Checks `region in lib.regionMultipliers`; message "the UK base, before overhead" |
| `SW_BASE_RATE_RANGE` | `sw-should-cost.ts:1334` | £1k–500k. Shared with the workbook |
| Sensitivity "Region (India vs USA Silicon Valley)" | `sw-should-cost.ts:1645–1651`; `SWRecomputeOverrides.regionOverride` `:1692, 1704` | Hard-coded `'India'` / `'USA_SV'` |
| Default inputs | `sw-should-cost.ts:1728` | `region: 'UK'` |
| `SWProgramInputs.baseRateGBP` doc | `sw-should-cost.ts:184–186` | "UK senior-blended bare rate" |
| Rate book | `sw-rate-library.ts:34–36, 53–70, 133–134` | `ukBaseRatePerPM` (£28,000, 2025-01, no URL) + `regionMultipliers` (9 × ratio, no URL) |
| Validation back-test | `sw-validation.ts:33, 72–80` | `config.region` per case (`'EU'`, `'UK'`, `'USA_Detroit'`, `'USA_SV'`) |
| Calibration | `sw-calibration.ts:191–203` | Region-independent (effort PM). **No change needed** |

UI (`src/ui/panels/sw-should-cost-ui.ts`):

| Where | What |
|---|---|
| `:423–424` | Wizard region list (9 hard-coded keys) |
| `:433` | Tooltip "Silicon Valley is ~9× India" |
| `:510–511` | `wiz-baserate` "UK base rate £/PM … All regions scale from this", min 5000 max 120000 |
| `:702–708` | Advanced region labels (note: "EU (Germany / Czech)", but CZ maps to Eastern Europe — F35) |
| `:763` | `#sw-hub-basis` |
| `:809–810` | `sw-base-rate` "UK Base Rate (£/PM)… All regional rates are relative to this" |
| `:240–242` | Rate table rows "UK senior-blended base" and "Regional multipliers" |
| `:281` | "Override the UK base rate…" |
| `:1290, 1301` | `readConfig` region |
| `:1367, 1389–1475, 1490–1496` | Every demo and study car carries `region: 'UK' \| 'EU'` |
| `:1515–1520` | `buildVehicleInputs` |
| `:1559–1562` | Presets: China / UK / USA_SV / India |
| `:1597` | Active-modules card prints region |
| `:582–586` | Wizard "Region swing (India ↔ USA SV)" |
| `:595` | Report note |
| `:1935–1944, 1978–1981` | Insight "Offshoring to India could save …" (UK / USA_SV only) |
| `:2006` | AI prompt `Region:` |
| `:2180` | Excel Configuration "Region" |
| `:2231` | PDF header |
| `:2481` | Compare table "Region" |
| `:2734–2765` | `_swHubBasis`, `setSWCountry`, `applySWCountry` |
| `:2770` | `initSWPanel` reads `#mfg-region-selector` |

Other places:

| Area | Where | What |
|---|---|---|
| `sw-rate-field.ts` | `:1–14` | Base-rate override semantics, `SW_BASE_RATE_FIELDS = ['sw-base-rate','wiz-baserate']` |
| `main.ts` | `:226` | Import |
| `main.ts` | `:19850` | `applySWCountry(region)` on every country change |
| `main.ts` | `:19760` | `applySWCurrency` (FX only) |
| Server workbook | `server/utils/sw-rate-library-xlsx.ts:15–20, 28–35, 59, 99–110` | Sheet **`Base`** with key **`ukBaseRatePerPM`**; sheet **`Regions`** with the 9 keys (`known` = built-in keys, `:73`); `SW_MAX_MULTIPLIER = 20`, whose comment cites "SV vs India ~9" |
| Server routes | `server/routes/rate-library.ts:107–124, 143–189` | `/api/rate-library/sw/active \| status \| template \| upload \| source \| reset \| versions \| versions/:id`. Versions are stored under library id `'sw-active'`, as the **resolved** book, fingerprinted |
| Store | `server/data/rate-library-store.ts:14–15, 135–165` | Row `rate_library.id='sw_company'` (JSON `Partial<SWRateLibrary>`), `app_settings.sw_rate_source` |
| AI | `server/routes/aichat.ts` | No region in the system prompt; the region arrives only in the panel's user prompt. `server/routes/agent.ts` has **no** SW tool. Its `systemPromptFor(region)` (`:987`) is manufacturing-only, so nothing changes there |

### 2b. Current country → hub mapping (Verified (run), all 39 `REGIONAL_DATA` countries)

| Hub | Multiplier | Countries |
|---|---|---|
| UK | 1.00 | UK |
| EU | 0.95 | DE (own), FR, IT, ES, SE, NL, AT, BE, PT (basis "Western European") |
| Eastern_Europe | 0.45 | PL, CZ, RO, HU, SK, SI, LT, BG, RS, and also **TR, MA, TN, EG** ("Europe-facing low-cost") |
| USA_Detroit | 1.35 | US (own), CA |
| USA_SV | 1.85 | unreachable from any country (picker only) |
| China | 0.35 | CN, TW |
| India | 0.20 | IN, and also **TH, VN, ZA, MY, ID, PH** (fallback) |
| Mexico | 0.28 | MX, BR |
| Japan | 0.90 | JP, KR, SG |

Points to note:
- Egypt, Morocco and Tunisia are costed at 2.25× India.
- Sweden is costed at the EU blend.
- No country reaches USA_SV.
- The research hubs `US-MI` / `US-CA` (RULES.md) have no app-country counterpart. US maps to one hub, so `US-CA` can only be a picker choice.

### 2c. What would have to change if regions became per-country rate entries (own £/PM per hub, no UK multiplier)

**Engine**
1. `SWRegion` becomes an open hub id (ISO code, plus `US-MI` / `US-CA`). Every `Record<SWRegion, …>` becomes `Record<string, …>` keyed by the book's hubs.
2. `SWRateLibrary.ukBaseRatePerPM` and `regionMultipliers` are replaced by `hubRates: Record<hub, { pmRateGBP or local + currency + fxToGBP + fxDate, basis
   (salary → loaded: employer on-cost %, productive hours / PM), levels (junior / mid / senior / lead), sources[], asOf, confidence }>`.
   The research collects **gross salaries and supplier sell rates** (RULES.md). The engine therefore needs:
   - a per-country employer on-cost;
   - a PM definition in hours, since today's PM is "20 days" and COCOMO's is 152 h (F21);
   - an FX date.

   Otherwise the "bare rate already includes benefits" premise behind `SW_DEFAULT_OVERHEAD = 1.15` (`:1724–1736`) breaks.
3. `resolveRates` / `computeModuleCost:1074–1076`:
   - `regionRate = hubRate(level mix) × devSource × overhead`;
   - the `seniorMult` 1.20 / 0.75 should come from the hub's own level rates (F19).
4. `devSourceMultipliers`: with supplier sell rates researched per country, `Tier1_Supplier` should select the hub's **sell rate**,
   not a 0.88 multiplier on an in-house rate.
5. `baseRateGBP` changes meaning, from "UK base" to "this hub's rate override". F4 shows why. `swLibraryBaseRate` becomes `swHubRate(prog)`.
6. Validation (`:1523, 1530`): "hub must be in the book"; the base-rate range applies per hub; the message drops "UK".
7. Sensitivity row `:1645–1651`: "cheapest vs dearest hub in the book" (or ±1 hub), not the literals `'India'` / `'USA_SV'`.
8. `swRegionFor`:
   - keep the nearest-hub fallback **only** for countries the research found no automotive software activity in, with the basis stated;
   - give `DE`, `FR`, `SE` and others their own hub when researched;
   - remove the 'EU' blend.
9. `swRateBasis` prints the hub's own rate, its currency / FX and its source URL instead of "region × m".
10. `REGION_MULT` is removed, together with its test (`tests/sw-should-cost.test.ts:247`).
11. `sw-validation.ts` CONFIGS: 'EU' becomes DE (BMW, Porsche, Mercedes, Audi), 'USA_Detroit' becomes US-MI, and 'USA_SV' becomes US-CA.

**Company workbook / server**
- Sheet `Base`/`ukBaseRatePerPM` and sheet `Regions` are replaced by a `Hubs` sheet: hub, rate, currency, level, source, URL, asOf, confidence.
- `SW_MAX_MULTIPLIER` no longer applies to rates.
- Stored data needs a **migration or a schema-version field**:
  - the old `sw_company` rows;
  - the old `'sw-active'` version snapshots, which `/sw/versions/:id` will return in the old shape.
- The template route serves the new shape.

**Saved state**
- Saved configs are `projectStore` kind `'sw_should_cost'`: server `projects` table when signed in, IndexedDB / localStorage when not, plus the
  legacy `localStorage['cv-sw-saved-configs']` migration (`ui:149–173`).
- Each carries `inputs.region` with the old keys, so loading needs a key map:
  - `EU` → DE;
  - `Eastern_Europe` → PL or RO;
  - `USA_Detroit` → US-MI;
  - `USA_SV` → US-CA;
  - `China` / `India` / `Mexico` / `Japan` → CN / IN / MX / JP.
- `localStorage['cv-sw-effort-actuals']` holds no region and is unaffected.

**UI**
- All UI lines in §2a.
- The hub pickers should be filled from the book (not hard-coded twice).
- Rename the "UK base rate" fields.
- The tooltip ratio, the presets ("Offshored (India Team)", "Aggressive"→China), the 20 demos' `region`, the India-offshoring insight and the
  wizard's region swing all need updating.
- The rate table should show each hub's own £/PM, with currency and source.

**Exports**
- Excel Summary / RATE BASIS, Configuration "Region", and the PDF header and Rate basis (`ui:2104–2111, 2180, 2231, 2278–2284`).

**AI**
- The panel prompt line `ui:2006` (region key). There is no server change.

**Tests that name SWRegion or the keys**

| Test | What it pins |
|---|---|
| `tests/sw-should-cost.test.ts:7, 14, 159–162, 166–173, 216–219, 234–237, 247, 253–257, 266` | Region keys, `REGION_MULT`, 28,000 base, region sensitivity, multiplier merge |
| `tests/sw-rate-library-xlsx.test.ts:13–16, 30–38, 46–50` | Regions sheet, India 0.15, China −0.3 |
| `tests/sw-p1-fixes.test.ts:31–42, 96, 180` | `ukBaseRatePerPM` 35,000 company book, 28,000 trace, `region: 'UK'` |
| `tests/sw-p2-fixes.test.ts:27, 34, 54, 61, 219–221, 240–248` | Unknown region "Brazil", 28,000 loaded-rate reproduction, `applySWCountry` source text |
| `tests/sw-p3-fixes.test.ts:78–95` | Regions sheet keys, `ukBaseRatePerPM` range |
| `tests/country-rates.test.ts:652–660` | `swRegionFor('IN') = 'India'`, `'PL' = 'Eastern_Europe'`, source text `applySWCountry(region);`, `const hub = swRegionFor(mfg);` |
| `tests/audit-hardening.test.ts:83–92` | Default-programme determinism (value moves) |

**Scripts, e2e, docs and baselines**

| Item | What to change |
|---|---|
| `scripts/gen-sw-report.ts:30, 44, 142–145, 196–198` | Type `'EU'\|'UK'`; **literal `28000 ×` region**, a second copy of the rate formula |
| `scripts/gen-l460-deepdive.ts:23–32`, `scripts/gen-allmodels-deepdive.ts:18–26` | `region:'UK'/'EU'` per car |
| `scripts/sw-review/trace.ts:10`, `edge.ts:26–27`, `powertrains.ts:13`, `baseline.ts` (+ the six `baseline-*.json`) | Baselines will move |
| `e2e/sw-live.ts:100–110` | Selects IN, reads `#sw-region`, expects the India total |
| `docs/auto-sw-cost.md:53` | `rate = ukBase × region × …` |
| `docs/auto-sw-cost-explainer.html`, `docs/sw-cost-validation.md:13` | Region wording |
| `public/reports/*.html` | 24 static pages printing region multipliers |
| `CLAUDE.md` | The "Automotive software costing" and "Countries … software hub (`swRegionFor`)" notes |

---

## 3. Screen v headless / export drift (UI computing its own money or using a different rule)

### P1

**F2 — Guided wizard ≠ Advanced form** (Verified (run) on the engine with the wizard's rule; Verified (code) for the rule, `ui:381–392`)

- `applyGuidedToInputs` sets `enabled = domainTicked && inPowertrainScope`. That switches **on the six premium-trim modules** that the engine and
  the Advanced form default **off** (`defaultEnabled:false`): active suspension, premium audio, park assist, climate, digital key, AR-HUD.
- It also sets complexity to `def.defaultComplexity` and never applies `SW_POWERTRAIN_SCOPE[pt].overrides`.

| Same choices (UK, 80k × 10, Medium reuse) | Advanced | Guided |
|---|---|---|
| Default, BEV | £388.7 M (no powertrain) / £389.4 M (BEV picked) | **£406.7 M** (49 modules, not 43) |
| PHEV | £409.8 M | **£434.2 M** |
| PHEV with the same module set | £409.8 M | **£416.3 M** (HV modules not de-rated) |
| MHEV with the same module set | £367.2 M | £369.4 M (hybrid supervisor not set to High) |

- Fixes:
  - Build the wizard's inputs with `applyPowertrainScope`.
  - Start from `defaultEnabled`, and add a "premium-trim features" step or checkbox.
  - Add a parity test: wizard default = Advanced default.

### P2

**F3 — Switching modes loses edits** (Verified (code))

- Both modes share `_swInputs`, but `setSWMode` (`:623–631`) only hides and shows the bodies; nothing re-renders.
- **Input:** Guided step 1 volume 150,000 → step 6 report at 150k → click **Advanced**. The Volume field still shows 80,000, rendered at init →
  Calculate → `readConfig` (`:1287`) overwrites to **80k**. Region, life and powertrain behave the same way.
- **Reverse direction:**
  - Advanced per-module ASIL / complexity / reuse edits are overwritten when the wizard reaches step 4 (`applyGuidedToInputs`).
  - Advanced-only inputs — custom PM, KSLOC, CAL, platform volume, effort calibration, connected share, development months — **stay applied
    invisibly** in the wizard's total.
  - Example: a 500 PM custom BMS typed in Advanced is still costed in Guided, and nothing on the wizard shows it.

**Other drift items** (P3)

| ID | Drift | Where | Tag |
|---|---|---|---|
| F25 | The per-vehicle card sub-line computes its own NRE / lifecycle split over `volume × life` (`:1588–1590`), ignoring `costRecoveryYears`. The engine's headline uses the recovery window, so with a recovery window set the two do not add up | `ui:1588–1593` | Verified (code); latent (no screen input) |
| F26 | The AI prompt sends £ (`£${…}M`, `:2003–2019`) while the screen is in the display currency. A € user gets a £ narrative next to € figures | `ui:2000–2027` | Verified (code) |
| F27 | Five engine levers have no screen input and are not carried by demos: `discountRatePct`, `costRecoveryYears`, `scheduleCompression`, `includeMLDataCost`, `includeHomologation`. The wizard report note still says "see the Model Validation panel for the recovery-window caveat" (`:595`), but that panel says nothing about it | engine `:192–204`; `ui:595` | Verified (grep: no UI reference) |
| F28 | The "Offshoring to India" insight says "reduces **labour** cost to £X", but £X is the whole programme re-costed. It includes royalties, cloud and tools, which do not move | `ui:1935–1943` | Verified (code) |
| F29 | Module detail table (screen and PDF): Dev + Calibration + Test ≠ Grand Total. Integration, cyber, tools, licences, cloud and maintenance have no column. The Excel has them | `ui:1777–1782, 2336` | Verified (code) |
| F30 | Two "PM" figures: the wizard step 4 "Person-Months" and the module "PM" column are **development** PM (2,391 on the default); the headline card is **effort** PM (4,135). They are unlabelled side by side | `ui:571, 1595, 1753` | Verified (run) |
| F31 | The SW PDF prints £ in "Rate basis" next to € tables with no currency note. The Excel has one (`:2105`) | `ui:2275–2284` | Verified (code) |
| F32 | The company book reports the built-in version. The workbook carries no version, so `resolveRateLibrary` returns `'1.1.0'` / `'2026-10'` and every export says "Company rates v1.1.0 (reviewed 2026-10)". The server's content fingerprint (`'sw-active'` versions) is never printed, so a report cannot be tied to its book | `sw-rate-library.ts:131–132`; `swRateBasis:1275` | Verified (run) |
| F33 | `applySWCountry`'s comment says "the current result is marked stale". Nothing marks it, so after a country change the old hub's result and its export stay on screen | `ui:2753–2765` | Verified (code) |

**Not drift (checked):**
- The dev-source table, the rate basis, the validation book and the exports all use engine functions (`devSourceComparison`, `swRateBasis`,
  `runValidation(..., rateLibrary)`).
- The Excel per-vehicle and MC values are engine values converted by `swConv`.

---

## 4. UX: "not user friendly"

### P2

- **F4 — The "UK base rate" trap** (Verified (run)).
  - Both fields say "UK Base Rate (£/PM)", but a costing engineer in India naturally types an India rate.
  - **Input:** hub India, base rate **6,000** → loaded labour 6,000 × 0.20 × 0.975 × 1.15 = **£1,346 / PM**. Total **£169.0 M** against an
    intended ≈ £208.4 M at ×1; labour is at 1/5.
  - The company workbook's `ukBaseRatePerPM` has the same trap: an Indian company's own rate is multiplied by 0.20 unless they also set India = 1.
  - This is the design the Chief Engineer rejected (RULES.md). See §2c.
- **F5 — Wizard errors are invisible** (Verified (code)).
  - `showSWError` (`:2529–2541`) inserts its box before `#sw-calc-btn`, which lives in the **hidden** Advanced body.
  - `wizCompute` (`:546–555`) then re-throws, uncaught in the click handler.
  - **Input:** Guided step 5 overhead **6** → Recalculate → nothing visible; the step-4 summary stays empty when entering step 4 with bad inputs.
  - The box also auto-hides after 6 s and has no `role="alert"` / `aria-live`.
- **F6 — Theme mismatch** (Verified (code)).
  - The panel's tokens switch on `@media (prefers-color-scheme: dark)` (`:948–980`).
  - The app's theme is `html[data-theme]`, default **dark** (`index.html:21`, `main.ts:19673`). No global stylesheet overrides `--sw-*`
    (grep of `src/ui/styles` found nothing).
  - On a light-OS machine the default dark app shows white SW cards; a dark OS with the light app shows dark cards.
  - The Engineering Insights cards use literal `#eff6ff` / `#fff7ed` / `#f0fdf4` backgrounds with `var(--text-secondary)` body text (`:1953–1964`),
    which is light grey on a light box in the dark theme.
  - `tests/ui-polish.test.ts:57–66` misses these because the literals sit in a JS map, not as `background:#…`.
  - P3 axe ran only in the light scheme.
- **F10 — The PDF is not WinAnsi-safe** (Likely; the main PDF documents the same failure, `src/export/pdf.ts:228–241`).
  - `exportSWPDF` (`:2210`) does not use `hardenPdfText` / `winAnsiSafe`.
  - In INR, KRW, THB, VND, TRY, PHP, PLN and CZK the currency symbol (`CURRENCY_SYMBOL`, `src/engine/insights.ts:196–201`) prints as mojibake
    in every money cell.
  - "Headline (≈ P33)" has the same problem in every currency.
- **F11 — The presets mislead** (Verified (run)).
  - **"Premium OEM (High ASIL, Fresh)"** (`:1561`):
    - changes **no** ASIL;
    - sets every module to complexity **High**, which **lowers** the 20 Very-High modules (BMS, perception, fusion …);
    - moves the hub to USA_SV.
    - Result: **£769.5 M** against £867.0 M for SV + Fresh with module complexities kept.
  - **"Aggressive (Low ASIL, High Reuse)"**:
    - sets ASIL-A on ASIL-D modules (AEB, BMS, inverter), which triggers the downgrade warnings;
    - moves the hub to **China**;
    - lowers Very-High modules to Medium.
    - None of this is in the label.
  - Presets also do not recalculate, and they apply to powertrain modules outside the scope.
- **F9 — AI prompt contradiction** (Verified (code); residual of B13 / P1 #7).
  - `server/routes/aichat.ts:16`: "No vague answers — **always give concrete numbers or ranges**".
  - `:11` imposes a manufacturing answer structure.
  - The panel's user prompt (`ui:2025–2026`) forbids new numbers. The system prompt wins in practice.
  - No post-check strips £ / % from the reply. The narrative is shown beside the costing, not exported.
- **Information overload** (Verified (code)). Before the Calculate button, Advanced shows:
  - 12 config fields + 2 checkboxes;
  - 3 collapsible cards (rate library, validation, calibration);
  - 4 presets;
  - **20 demo buttons + 4 report buttons**;
  - a 54-row × 9-column module grid.

  Results add 11 sections (6 cards, Monte Carlo, phases, category, composition, a module table of up to 54 × 12, sensitivity, benchmarks,
  dev-source, AI, insights). There is no summary or "what drives this" view first, and Calculate sits below the 54-row grid.

### P3 (UX / accessibility)

| ID | Finding | Where |
|---|---|---|
| F34 | Jargon with no on-page explanation: NRE, PM, KSLOC, CAL, SecOps, P10 / P50 / P90, EDU, VMM, SOC / SOH / SOE, SEooC, UCM. All help is `title` tooltips (hover-only; no keyboard or touch access): `.sw-tip` spans (`:418`), CAL / KSLOC / Custom-PM headers, truncated module descriptions (`:663`), phase segments | `ui:418, 663–669, 691–693, 1652` |
| F35 | Category headers are `div onclick` (`:675`), with no keyboard access, role or `aria-expanded`. Focus styles are `outline:none` with only a border colour (`:991–995, 1056, 1066`) | `ui` |
| F36 | Category counts start as "N/N modules" (`:678`) even when modules are off by default (A shows "14/14" with 5 ICE / hybrid off). They update only after a checkbox change | `ui:678, 2719–2726` |
| F37 | Wizard step 2: domain A counts all 14 modules and describes only the EV stack ("Battery management (BMS), charging…") even for ICE / MHEV. "Programme phase" is an input that changes nothing (`:435`, "informational") | `ui:360–368, 435, 447–455` |
| F38 | Units in messages: Connected Vehicles is typed in %, but the error says "must be 0–1". HTML min / max do not match the engine (volume 1k–500k v 1–20 M; life 5–20 v 1–40; overhead ≤ 3 v ≤ 5; base rate 5k–120k v 1k–500k), so the field shows invalid while the engine accepts the value, or the reverse | `ui:440–442, 782–810` |
| F39 | Compare drops a saved scenario that fails validation without saying so (`catch { return null }`, `:2463–2466`). If all fail, `Math.min()` = Infinity. Save uses `window.prompt` | `ui:2448–2502, 2701` |
| F40 | Hub labels and basis: "EU (Germany / Czech)" while CZ maps to Eastern Europe; `#sw-hub-basis` keeps the page country's basis after a demo or a manual hub change. Header says "Premium Luxury SUV — Full SW Stack" and "10 Cost Dimensions"; the composition lists 9 | `ui:703, 763, 726, 731, 1724` |
| — | The Benchmarks section shows 7 unverified figures with "do not quote them" — consider hiding it until one is sourced | `ui:1813–1837` |
| — | `/api/rate-library/sw/versions/:id` returns any library version by fingerprint (`getRateLibraryVersion` has no `library_id` filter), so it can serve a manufacturing book | `server/routes/rate-library.ts:121–124`, `rate-library-store.ts:78–83` |
| — | Name clash: `tcu_software` "Telematics Control Unit (TCU)" and `transmission_control` "Transmission Control Software (TCU)" are both "TCU" | `sw-should-cost.ts` module table |

**Tests missing for the above:**
- wizard = advanced parity;
- the calibration card surviving a bad stored row;
- the SW panel in `data-theme="dark"`;
- SW PDF glyphs in non-£ currencies;
- the sensitivity bracket containing its base;
- FTE time base.

---

## 5. Data for mapping the 54 modules to vehicle ECUs / sensors / actuators

**What exists in code**
- `SWModuleDef` (`sw-should-cost.ts:112–157`) has **no ECU, host, sensor or actuator field**. The only structured links are:
  - `category` (A–G);
  - `SW_POWERTRAIN_SCOPE` / `SW_POWERTRAIN_MODULE_IDS` (`:69–89`), which powertrain carries each A-module;
  - the flags `hasMLContent`, `hasCloudDependency` and `hasCybersecRequirement`, and the default CAL.
- The **free-text `description` and `notes`** name the hardware: cells, coolant pumps / valves, cameras, radar, 12–16 ultrasonic sensors, IR
  camera, HSM, UWB, 100BASE-T1, VCU, ABS / ESC, air springs, rear-axle steer, HUD projector.
- **`server/data/pcb-ecu-library.json`** has 45 hardware ECUs with ids and powertrain applicability:
  - BCM, GW, ACU, EPS, ESC, CLUSTER, IVI, RADAR, FCAM, TEL, SEAT, DOOR, HVAC, HEADLAMP;
  - ECM, TCM, GPCU, IGN, FPC, NOX, DCU, IBS, ALTREG;
  - BSG_INV, DCDC48, BMS48, EBOOST, PCU, TINV, BMS_CMU, BMS_BMU, DCDC_HV, VCU, OBC, CCU, ECOMP, PTC, TMS;
  - SVC, DMS, CRADAR, RADAR4D, ADCU, PARK, LIDAR.

  It has **no link to the SW modules**. These ECUs are not in that library: air-suspension / chassis controller, rear-axle-steer, HUD, audio
  amplifier, UWB anchors, zonal controllers.

The "Proposed host" column below is the **reviewer's inference from each description**. It is not data in the repo; a mapping field would have
to be added and reviewed. "all" = platform software deployed on every AUTOSAR ECU. Default on/off is the Advanced default.

| # | id | Module (name) | Cat | Def. ASIL / CAL | Default | Powertrain | Proposed host ECU (`pcb-ecu-library` id) | Sensors / actuators named in description |
|---|---|---|---|---|---|---|---|---|
| 1 | bms_core | BMS Core Software | A | D / CAL4 | on | PHEV, BEV | BMS_BMU (+BJB) | cell V / T acquisition, contactors (protection) |
| 2 | cell_balancing | Cell Balancing Algorithms | A | C / none | on | PHEV, BEV | BMS_CMU | balancing current |
| 3 | soc_soh_soe | SOC/SOH/SOE Estimation Models | A | C / none | on | PHEV, BEV | BMS_BMU + cloud | — (ML, cloud retraining) |
| 4 | thermal_mgmt | Battery Thermal Management Software | A | B / none | on | MHEV, PHEV, BEV | TMS (+ECOMP, PTC) | coolant pump / valve actuation |
| 5 | fast_charge | Fast-Charging Control Software | A | C / CAL3 | on | PHEV, BEV | CCU (EVCC) + OBC | charge inlet (CCS / CHAdeMO), OCPP backend |
| 6 | edu_control | EDU (Electric Drive Unit) Control Software | A | D / CAL4 | on | PHEV, BEV | VCU / TINV | dual motors, multi-speed gearbox |
| 7 | inverter_ctrl | Inverter Control Algorithms | A | D / none | on | PHEV, BEV | TINV | power stage (SVPWM, FPGA) |
| 8 | motor_ctrl | Motor Control (FOC/DTC/SVPWM) | A | D / none | on | PHEV, BEV | TINV | rotor position (sensorless), motor temperature |
| 9 | regen_braking | Regenerative Braking Software | A | C / none | on | MHEV, PHEV, BEV | ESC + VCU | hydraulic brake (blending), ABS / ESC |
| 10 | engine_control | Engine Management Software (ECU) | A | B / CAL3 | off (est.) | ICE, MHEV, PHEV | ECM (+IGN, FPC) | air / fuel / ignition, knock, misfire |
| 11 | transmission_control | Transmission Control Software (TCU) | A | B / none | off (est.) | ICE, MHEV, PHEV | TCM | shift / clutch actuators |
| 12 | aftertreatment_obd | Emissions After-treatment & OBD | A | QM / none | off (est.) | ICE, MHEV, PHEV | DCU + NOX (+ECM) | catalyst / DPF / SCR dosing, NOx sensors |
| 13 | hybrid_supervisor | Hybrid Supervisory Control & Energy Management | A | C / none | off (est.) | MHEV, PHEV | VCU / HCU (PCU) | engine / e-machine torque split |
| 14 | mhev_48v | 48 V Belt Starter-Generator & Battery Control | A | B / none | off (est.) | MHEV | BSG_INV + BMS48 + DCDC48 | BSG motor, 48 V battery, DC-DC |
| 15 | camera_perception | Camera Perception Stack | B | B / CAL3 | on | all | FCAM / ADCU | mono + stereo cameras |
| 16 | radar_processing | Radar Processing Stack | B | B / none | on | all | RADAR, CRADAR, RADAR4D | FMCW radars |
| 17 | ultrasonic | Ultrasonic Processing Software | B | B / none | on | all | PARK | 12–16 ultrasonic sensors |
| 18 | sensor_fusion | Sensor Fusion Engine | B | C / none | on | all | ADCU | camera + radar (+ LIDAR if fitted) |
| 19 | path_planning | Path Planning Algorithms | B | C / none | on | all | ADCU | (HD map) |
| 20 | control_algos | Control Algorithms (ACC / LKA / AEB) | B | D / none | on | all | ADCU → ESC, EPS | brake and steering actuation |
| 21 | driver_monitor | Driver Monitoring Software (DMS) | B | B / CAL2 | on | all | DMS (+ADCU) | IR camera, hands-on-wheel |
| 22 | highway_assist | Highway Assist / Traffic Jam Assist | B | C / none | on | all | ADCU → EPS, ESC | (uses ADAS sensors) |
| 23 | park_assist | Automated Parking & Surround-View | B | B / none | off (premium) | all | PARK / ADCU + SVC | ultrasonic + surround cameras; steer / brake |
| 24 | ivi_os | IVI Operating System (AAOS / QNX) | C | QM / CAL4 | on | all | IVI | GPU / displays |
| 25 | navigation | Navigation Stack | C | QM / none | on | all | IVI + cloud | (GNSS implied) |
| 26 | voice_assistant | Vehicle Voice Assistant | C | QM / CAL4 | on | all | IVI + cloud | (microphones implied) |
| 27 | tcu_software | Telematics Control Unit (TCU) Software | C | B / CAL4 | on | all | TEL | 5G / LTE modem, eCall, V2X |
| 28 | connectivity_stack | Bluetooth / WiFi / 5G Connectivity Stack | C | QM / CAL4 | on | all | TEL / IVI | BT, WiFi, 5G modem |
| 29 | hmi_framework | App Framework & HMI Layer | C | QM / none | on | all | IVI + CLUSTER | displays, haptics |
| 30 | premium_audio | Premium Audio DSP & Active Noise Control | C | QM / none | off (premium) | all | IVI / amplifier (not in library) | speakers, ANC microphones |
| 31 | digital_key | Digital Key (UWB/BLE) & Secure Access | C | QM / CAL4 | off (premium) | all | BCM + UWB anchors (not in library) + cloud | UWB, BLE, secure element |
| 32 | ar_hud | AR Head-Up Display & AR Navigation | C | A / none | off (premium) | all | HUD (not in library) / IVI | AR-HUD projector |
| 33 | body_control | Body Control Software | D | B / none | on | all | BCM (+DOOR, SEAT, HEADLAMP) | lights, windows, mirrors, sunroof, locks, wipers |
| 34 | chassis_control | Chassis Control Software | D | C / none | on | all | chassis ECU (not in library) + EPS | air suspension, CDC dampers, anti-roll bars, rear steer |
| 35 | gateway_ecu | Gateway ECU Software | D | B / CAL4 | on | all | GW | CAN / LIN / FlexRay / Ethernet buses |
| 36 | zonal_arch | Zonal Architecture Software | D | B / CAL4 | on | all | zonal controllers (BCM "body zone controller") | power distribution, 100BASE-T1 |
| 37 | vehicle_motion | Vehicle Motion Management (VMM) | D | C / none | on | all | VCU / chassis domain → ESC, EPS | stability, torque arbitration |
| 38 | active_suspension | Predictive Active Suspension & Body Control | D | C / none | off (premium) | all | chassis ECU (not in library) + FCAM | road-preview camera, 48 V anti-roll, air springs, dampers, rear steer |
| 39 | climate_control | Climate & Thermal Comfort Control | D | A / none | off (premium) | all | HVAC (+TMS, PTC, ECOMP) | heat pump, purifier, seat / wheel heaters |
| 40 | autosar_classic | AUTOSAR Classic BSW & Integration | E | C / none | on | all | all Classic ECUs | — |
| 41 | autosar_adaptive | AUTOSAR Adaptive Platform | E | B / CAL3 | on | all | ADCU / IVI / zonal HPCs | — |
| 42 | rtos | RTOS & OS Porting | E | C / none | on | all | all | — |
| 43 | diagnostics | Diagnostics (UDS / OBD-II) | E | A / none | on | all | all (GW = diagnostic gateway) | — |
| 44 | comm_stacks | CAN / LIN / FlexRay / Ethernet Communication Stacks | E | B / none | on | all | all | buses |
| 45 | time_sync | Time Synchronisation & Network Management | E | A / none | on | all | GW / ADCU | gPTP, NM |
| 46 | secure_boot | Secure Boot & Root of Trust | F | B / CAL3 | on | all | all (HSM) | HSM |
| 47 | encryption | Encryption Modules & Crypto Stack | F | B / CAL3 | on | all | all | crypto accelerator |
| 48 | ids | Intrusion Detection System (IDS) | F | QM / CAL3 | on | all | GW + TEL + cloud VSOC | CAN monitoring |
| 49 | secure_ota | Secure OTA Software Update Framework | F | B / CAL4 | on | all | TEL / GW + every flashable ECU | — |
| 50 | key_mgmt | Key Management System | F | B / CAL4 | on | all | cloud PKI + end-of-line | — |
| 51 | ota_manager | OTA Update Manager (Vehicle-side) | G | B / CAL4 | on | all | TEL / GW (UCM master) | — |
| 52 | cloud_backend | Cloud Backend Services | G | QM / CAL4 | on | all | off-vehicle (cloud) | — |
| 53 | data_pipeline | Data Pipeline & Telemetry | G | QM / CAL3 | on | all | TEL + cloud | — |
| 54 | fleet_mgmt | Fleet Management & Analytics Software | G | QM / none | on | all | off-vehicle (cloud / dealer portal) | — |

Counts: 43 on by default, 6 premium-trim off, 5 ICE / hybrid estimates off (`estimateBasis`). Royalty modules: `ivi_os`, `navigation`,
`voice_assistant`. Cloud-dependent: 22.

**Building the vehicle-architecture diagram:**
- Category E and F modules (platform and security) are cross-cutting. Draw them as layers on every ECU, not as boxes on one ECU.
- G modules, `key_mgmt` and part of `ids` live off-vehicle.
- To make the diagram data-driven, add `hosts: string[]` (ECU ids from `pcb-ecu-library.json`) and `io: { sensors[], actuators[] }` to
  `SWModuleDef`, each entry sourced or labelled as engineering judgement. That would also let the PCB and software costings share one vehicle
  bill of ECUs.

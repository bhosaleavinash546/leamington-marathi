# Country-rates review — October 2026

**The requirement.** Pick a manufacturing country, e.g. China, and every rate in the costing must be that country's: raw material, labour, machine-hours and energy. That includes the rates used *before* the cost stack, such as the toolroom behind a die or the rates in a rule-priced item like shot blast. It must hold on every path:
- the screen, from either country picker;
- the CAD upload;
- a bulk run;
- the country comparison table;
- the PDF.

**What was found.** The core rebuild (`buildRegionalLibrary`) was sound for material, labour, machines and energy. Around it, **twelve places** either used UK rates in a China costing or lost the country altogether. All twelve are fixed and pinned by `tests/country-rates.test.ts`, which has 15 tests.

## 1. The errors

| # | Where | Error | Fix |
|---|---|---|---|
| 1 | Tool build-ups (every mould, die, pattern) | Built at the **UK toolroom £/hr in every country**. On a China pressing the £17.72 die was identical to the UK one. | `TOOLROOM_RATES` = UK × the country's toolroom factor (½ skilled-labour ratio + ½ machine multiplier; China 0.43). Tool steel and bought-out parts stay at their £ prices, because they are traded globally. |
| 2 | Parametric tools: extrusion dies, rotomoulds, rubber moulds, thermoforming tools, composite tools, machining fixtures | UK £ quotes in every country. | The same toolroom factor. |
| 3 | Rule-priced items: shot blast, the stamping-vs-laser route price, CNC programming, rubber cavity choice | Priced from the **UK** library in every country. | The rules run in the country's book (`RuleContext.rates`, `rate-context.ts`). |
| 4 | Module energy fallbacks: extrusion, thermoforming, hot stamping, lamination anneal | Fell back to the **UK tariff** when no price was passed. The bulk path passed none for these. | The fallback is the costed country's tariff. The bulk executor runs every module in the country's book. |
| 5 | Extrusion and thermoforming forms | The electricity field defaulted to a fixed **£0.20/kWh** in every country, which is not even the UK's £0.268. | The field is blank by default, which means the country's tariff applies; anyone can still type a figure. |
| 6 | Screen: the two country pickers | **The header picker and the "Country" bar ran different code.** The header picker left overhead, packaging and logistics at the old country's values and did not refresh the rate drop-downs. The bar offered only 8 countries. | One `_applyCountry` for both pickers. They stay in step and both set the same fields. |
| 7 | Screen: packaging and logistics | The country switch wrote to `packaging-cost` / `logistics-cost`, **fields that do not exist**. Packaging and logistics never followed the country. | They are written to the real fields, from `regionalShopDefaults` (UK basis × the country's multiplier). The size-aware CAD estimate is kept as the basis, not overwritten with a flat £0.15. |
| 8 | Screen: company rates | Every country switch rebuilt from browser storage, **dropping the company rate book** the moment a country was picked. | The base book (company or local) is kept, and each country is rebuilt from it. |
| 9 | Screen: editing or resetting rates in a country | Saving edits made in China wrote China's rebuilt book over the saved UK base, so the next country was compounded on top. "Reset" left **UK rates under a China label**. | Edits in a non-UK country apply to that costing only, and the screen says so. Reset rebuilds for the selected country. |
| 10 | CAD route | The rules ran on the **built-in UK book**, whatever country was selected, and even when company rates were active. Re-analyse did not send the country, and the analysis cache did not include it. | The rules price in the requested country, built from the deployment's active book. The country is sent on analyse and re-analyse, and is part of the cache key. Changing country after a CAD upload re-runs the rules. In AI mode the screen asks first, because a re-run calls the model. |
| 11 | Bulk / headless | Overhead stayed at the UK 12 %, and packaging and logistics at the UK £0.15 / £0.25, in every country. The screen scaled them, so **the screen and a bulk run disagreed for the same part**. | Both read `regionalShopDefaults`. |
| 12 | Country comparison table (screen and PDF) | Each country was **estimated** from the costed breakdown with a few multipliers, so its China row differed from what selecting China gives. | Each row re-costs the part in that country's book (`computeRegionalComparisonExact`). The table's China row *is* the China costing. |

**Smaller fixes.**
- Process labour grades (`forge`, `furnace`, `blow`, `roto`, `thermoform`, `trim-router`) used to move by the *skilled* ratio. They now move by their own category: foundry or semi-skilled.
- Eight of the library's own country labour entries disagreed with the rate the same country is costed at. For example, `lab-de-foundry` held £35.23, which is Germany's *inspector* rate. They are aligned to the regional table.

## 2. Effect on real parts, costed headless in China

UK costs did not move on any of the 40 recorded parts.

| Part | UK | China before | China after | China tooling |
|---|---|---|---|---|
| BIW inner panel | £33.53 | £31.43 (94 %) | **£24.46 (73 %)** | £17.72 → £12.25 |
| Seat locking bracket | £3.39 | £3.21 (95 %) | **£2.13 (63 %)** | £1.97 → £1.10 |
| ECU cover (moulded) | £1.92 | £1.62 (84 %) | **£1.21 (63 %)** | £0.67 → £0.35 |
| Storage tray (moulded) | £8.21 | £6.38 (78 %) | **£4.57 (56 %)** | £3.36 → £1.93 |
| Coolant tank (rotomoulded) | £55.89 | £37.65 (67 %) | **£25.06 (45 %)** | £17.03 → £7.31 |
| Casting bracket | £41.35 | £24.33 (59 %) | **£23.29 (56 %)** | £0.57 → £0.26 |
| Steering knuckle (forged) | £44.02 | £27.24 (62 %) | **£26.06 (59 %)** | £0.97 → £0.50 |
| Hydraulic manifold (machined) | £41.17 | £23.71 (58 %) | **£22.99 (56 %)** | £0.21 → £0.09 |
| Twin-chamber profile (extruded) | £2.02 | £1.63 (81 %) | **£1.24 (61 %)** | £0.44 → £0.19 |
| Grommet (rubber) | £0.68 | £0.51 (75 %) | **£0.30 (44 %)** | £0.29 → £0.12 |

Tool-heavy parts move most. A pressing used to come out only 5–6 % cheaper in China, because its die, packaging and logistics were all held at UK values.

**On the screen**, a machined part costs:
- UK £10.86;
- China ¥66.78 (about £7.52);
- Germany €14.17 (about £12.16);
- back to the UK: £10.86 exactly, with no drift.

## 3. What is deliberately not re-priced

- **A £ figure typed into a form** is treated as a quote and is not rescaled. This includes the form's default mould cost. Tool costs the rules or estimators produce are rescaled.
- **Aluminium extrusion dies and gear cutters (hobs, shapers)** stay at UK £. Both are bought on a global market, typically from specialist die and cutter makers.
- **Tool steel and bought-out mould parts** stay at their £ prices, because they are traded globally.

## 4. For the director — decisions needed

- **The toolroom factor is an estimate.** It is half the skilled-labour ratio plus half the machine multiplier, which puts China at 0.43 × the UK. A toolmaker's quote from the region should replace it.
- **Eight labour entries were aligned to the regional table.** The library's own sourced benchmarks were higher for Germany foundry, Poland foundry, Turkey skilled and semi-skilled, Vietnam skilled, Korea electronics, and Romania skilled and semi-skilled. Costings in those countries already used the regional value. Confirm which benchmark is right at the next rate refresh.
- **The dev database holds an uploaded company book** (version `company-upload`, Sep 2026), so CAD rules now price in it on this machine. That is the intended behaviour, but the book is older than the 2026-09 refresh.

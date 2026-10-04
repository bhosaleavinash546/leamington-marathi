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

## 5. Re-check in India (second pass)

The China pass was repeated for India and made stricter. Every costing now carries a per-line **rate trace** (`trace` on the cost-executor and bulk results): each operation's machine and labour £/hr, plus the material £/kg and energy tariff it was charged at. The audit compared every one of those lines against India's rate book.

**Result: 40 of 40 real parts costed; 435 rate lines checked; none at a UK rate.**

The second pass found **four more places** still using UK rates. All are fixed:

| # | Where | Error | Fix |
|---|---|---|---|
| 13 | **AI cost agent** (`server/routes/agent.ts`) | When a user named India, the region reached the model only as text. Its `calculate_cost` tool ran on the **built-in UK book**. The prompt told the model to *"factor in lower labour/machine rates"* itself, which means the AI was adjusting a price, and it read from a typed table of country factors that had drifted (India 0.12 against the library's 0.18). | The tool takes a `region` (else the user's selected region) and costs in that country's book, with the country's overhead, packaging and logistics. The prompt now forbids scaling a tool result, and its country table is generated from `REGIONAL_DATA`. |
| 14 | Casting fettling adder (`casting-advisor.ts`) | Charged at the UK foundry rate in every country. | The costed country's foundry rate. |
| 15 | Audit check "machine larger than needed" (`should-cost-audit.ts`) | Quoted its £/part saving at UK machine rates. | The active book's rates. |
| 16 | Geometric DFM job (`dfm-job-runner.ts`) | Rebuilt the country from the built-in book, ignoring company rates. | The shared `services/rate-book.ts`, the same book the CAD rules use. |

**India against the UK** (headless; all lines India's):

| Commodity | Part | UK | India |
|---|---|---|---|
| Machining | Hydraulic manifold | £41.17 | £21.54 (52 %) |
| Cast + machine | Casting bracket | £41.35 | £22.26 (54 %) |
| Forging | Steering knuckle | £44.02 | £25.20 (57 %) |
| Sheet metal | BIW inner panel | £33.53 | £24.20 (72 %) |
| Injection moulding | Storage tray | £8.21 | £4.36 (53 %) |
| Rotomoulding | Coolant tank | £55.89 | £22.55 (40 %) |
| Composites | Roof panel | £443.36 | £268.96 (61 %) |
| Aluminium extrusion | Bumper beam | £27.94 | £21.14 (76 %) |
| Gear | Spur gear m3 z38 | £21.74 | £15.62 (72 %) |

**Tooling** moves by India's toolroom factor, 0.36. Where a part's tooling ratio is higher, the difference is the globally-priced share: tool steel and bought-out parts. Aluminium-extrusion dies and gear cutters stay at £ by design.

**On the screen**, both pickers set India together: rupee display, 9 % overhead, packaging × 0.65, logistics × 1.50. A machined part costs ₹919.66 (about £7.23) against £10.86 in the UK, and switching back gives £10.86 exactly.

`tests/country-rates.test.ts` §7 re-runs the India line audit on every recorded part, and pins the fettling and agent fixes.

## 6. Root cause, all 39 countries (third pass)

**The root cause.** Country information lived in several independent places, and the screen did not keep one rule for money. Each place was right for some countries and wrong for others:

1. **Labour was two concepts in one list.** There were roles (`lab-uk-skilled` …) and older *country-pinned* grades (`lab-de-skilled`, `lab-cn-skilled` …). In a country book, every pinned grade collapsed onto that country's rate, so the Vietnam drop-down listed "Skilled Machinist (Vietnam)" ten times among 42 entries. In the UK book they let an operation use another country's labour.
2. **The PCB costing had its own country database and its own pickers.** It defaulted to China, ignored the selected country, and its electricity tariff, exchange rate and operator labour were typed separately and disagreed with the main table. For example, UK electronics labour was £29.59 in one table and £17.63 in the other; Taiwan power was £0.086 in one and £0.161 in the other.
3. **Money inputs were labelled in the display currency but held pounds.**
   - The Rate Library window showed £ values under a "CNY/kg" heading.
   - Packaging read "(¥/part)" over a £ value.
   - A target price typed in ¥ was compared with a £ cost.
   - Ten machine drop-downs and several result panels printed a hard-coded "£".
4. **Copying an analogue country's multipliers contradicted some countries.** Singapore's labour costs more than the UK's, but its machines carried Thailand's 0.58 multiplier. Egypt's gas, borrowed from Turkey, cost more than its electricity. Taiwan and Japan were on business tariffs, not industrial ones.

**The fixes, one source each.**

| # | Fix | Where |
|---|---|---|
| 1 | Screens offer labour **roles only**, priced in the selected country. A pinned id resolves to its role. The rate export lists roles too. | `src/engine/labour-roles.ts` |
| 2 | The PCB table takes electricity, FX and operator labour from `REGIONAL_DATA`. Its EMS prices (fab £/dm², placement, joint and test) stay its own market data. Every country maps to a PCB market: its own for the 14 with data; for the other 25 the nearest assessed market, **with the reason shown on screen**. Inventing EMS prices for those 25 would be fabrication. The PCB photo picker and the PCB fab form follow the selected country. | `src/engine/pcb-market.ts`, `src/ui/pcb-country-sync.ts` |
| 3 | One money rule: **a form input holds £ and says £.** The target price is typed in the display currency and converted to £ before it is compared. The Rate Library shows values in the display currency and saves £. Rate drop-downs and result panels use the display currency. | `src/ui/main.ts` |
| 4 | Data corrections, each sourced in `2026-10-countries.json`. | See below |

The data corrections:
- **Singapore** multipliers come from Korea; machine multiplier 0.58 → 0.80.
- **Egypt** gas is $6.75/MMBtu (Decree 1306/2026), £0.017/kWh.
- **Taiwan** industrial power is NT$4.27/kWh (Taipower), £0.101.
- **Japan** large-industry power is ¥25.64/kWh (METI: small business pays 111.19 % of large), £0.123.

**Proof, every country.**
- **Line audit.** All 38 non-UK countries × 40 real parts were costed headless. Every machine-hour, labour, material and energy line was checked against that country's book: 16,530 lines, **0 errors**. `tests/country-rates.test.ts` §8 re-runs this on every test run.
- **Screen sweep.** A browser switched through all 39 countries and found **0 issues**. It checked for:
  - duplicate labour roles, or labour from another country;
  - rates or headline shown in a currency other than the selected one;
  - the country pickers out of step;
  - wrongly labelled inputs.
- **Data.** Every country's data is internally consistent: labour order, gas below power, and machine cost consistent with labour cost.

**Deliberately separate.** The software should-cost model's "Development region" is where the software engineers sit, which is not where the parts are made. It keeps its own region list.


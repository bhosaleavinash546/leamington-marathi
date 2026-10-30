# World rate round — every country on its own rates (30 Oct 2026)

**Asked.** Fetch the data for every country CostVision costs in, not only China, India, Poland and Hungary, so that no
costing in any country rests on a UK multiplier; re-check every figure the existing books use on its page; re-check the
software hub rates. Approved: rates move in all 39 countries under this dated refresh; anything no research priced is
AT PAR (×1, labelled), never an unsourced factor.

## 1. What changed

| | Before | After |
|---|---|---|
| Countries with their own rate book | 6 of 39 (UK base, DE, CN, IN, PL, HU) | **39 of 39** (UK base + 38 country books) |
| Countries generated as "neighbour × a ratio" | 2 (AT from DE, LT from PL) | 0 |
| Countries on "UK × factors" | 31 | 0 |
| Unpriced machine capital | UK × 0.52–0.72 (CN, IN, PL; unsourced) | AT PAR (×1, labelled) everywhere |
| Unpriced materials | UK × 0.95–0.97 resin / material factors (unsourced) | AT PAR (×1, labelled) everywhere |
| Existing research figures checked on their pages | — | 2,201 items opened automatically; 648 read by independent verifiers; 65 corrections applied |

`tests/world-rate-books.test.ts` proves, for each of the 38 countries: the book is generated from its dated config, at
the config's FX; labour is sourced in every category; capital and unpriced materials are at par; and every machine and
labour rate of real parts costed in that country is that country's book (171 tests).

## 2. One method for each kind of country

The 33 new books are built by ONE script, `scripts/rate-refresh/world-2026-10/build-world.py`, from
`official/*.json` (read from the publishers' APIs by `fetch-official.py`, every value with its URL) and
`research/*.json` (researchers, every item with its URL). The script does the arithmetic and writes the judgement
into each basis line. Then `scripts/country-book.ts` writes the book.

**Europe (EU members, Serbia, Turkey).**
- Labour: Eurostat labour cost per hour WORKED in manufacturing (`lc_lci_lev`, compensation + taxes − subsidies, so
  employer contributions and paid leave are inside) × the labour cost index to 2026 (`lc_lci_r2_q`) × the occupation's
  mean hourly earnings ÷ all occupations (SES 2022, manufacturing; ISCO major groups — the survey's finest split).
  Turkey has no SES: ILOSTAT occupation ratios. The skilled role takes the higher of the two manual groups (ISCO 7
  includes food and garment trades, which put it below ISCO 8 in FR, ES, IT, BE, NL).
- Energy: Eurostat non-household prices, latest semester, excl. VAT and recoverable levies (electricity band ID,
  gas band I3). Sweden's gas is above its power — Eurostat's own figure.
- FX: ECB reference rates, 29 Oct 2026. **One euro rate for every euro country** (£1 = €1.1965) — Germany's book moved
  to it from €1.165.
- Finance: ECB composite cost of borrowing (euro area); a central bank's new-loan rate elsewhere; where only a policy
  rate was found, the World Bank lending rate (Romania 8.52%).
- Machine capex: the EU single-market list prices (Haas VF-2 / UMC-500, TRUMPF TruBend 3100, extrusion line).
- Materials: the European market anchors (the German book's, corrected on the page re-check) at the country's FX.

**Outside Europe.**
- Labour: national statistics or ILOSTAT earnings by occupation, the statutory employer contributions (PwC tax
  summaries), any statutory bonus (Brazil's 13th salary and holiday third; Mexico's aguinaldo), ÷ hours actually
  worked. In eight Asian countries (KR, TW, SG, MY, TH, ID, VN, PH) the JETRO FY2025 survey's TOTAL employer burden of
  Japanese-affiliated manufacturers (base + allowances + social security + overtime + bonus) is used — manufacturing-
  specific and fully loaded. In the United States the BLS OEWS wage × the ECEC total compensation ÷ wages (×1.496,
  manufacturing, June 2026), so health insurance and retirement are inside.
- Energy: the regulator's or utility's industrial tariff (EIA, KEPCO, Taipower, PEA, EVN, TNB, PLN, Meralco, SP Group,
  ANEEL, Eskom, Hydro-Québec); a commercial average (GlobalPetrolPrices) where no tariff could be opened, flagged.
- Materials: the regional market — North America (US prices; Mexico and Canada their own HRC; NA resin indices), Asia
  (Japanese mill lists, CSC, CFR South-East Asia, NE / SE Asia resins, MJP / Asian premiums), Turkey and Egypt their
  domestic steel; LME settlement of 29 Oct 2026 for copper, zinc, aluminium; safeguard duties on EU steel where levied
  (Morocco HRC 19%, South Africa coated coil 52.34%). A family with no regional price: the European price at par.
- Machine capex: EU list prices where the country buys duty-free from the EU (TR, MA, TN, EG); Haas US list prices
  in North America; at par elsewhere.

**Every country.** Machine hours 3 × 8 h Monday–Friday on the 2026 working calendar (250 days where the holiday API
misses Tết or Islamic holidays). Machine life = 100 ÷ the tax code's straight-line rate for plant and machinery; a
range → its midpoint; no rate or an accelerated incentive → the round's median (7 years), stated.

## 3. The page re-check of the existing books

Every research figure behind the UK, German, Chinese, Indian, Polish and Hungarian books was opened on its page
(`scripts/rate-refresh/verify-pages/`): first automatically (fetch + headless browser + PDF text), then by five
independent verifiers reading the page (648 figures: 241 confirmed, 64 derived and re-done, 105 differ, 95 not on
the page, 131 unreachable — bot walls, removed pages). The corrections (`verify-pages/corrections.json`, 65) were
applied to the research items (each keeps its old value, the date and why) and the books rebuilt; every material note
built on a corrected figure says "CORRECTED 30 Oct 2026 on a page re-check: … was X → Y (why)".

The important ones:
- 430 stainless: the October surcharge is €1,085/t, not €985 (+6%) — DE, PL, HU.
- German E3 scrap: US$320/t, the research read the US HMS figure — every cast-iron and cast-steel charge (DE, PL).
- Polymer index (businessanalytiq): PA6 +19%, PBT +14%, PMMA −3% — DE, PL, HU, UK, India PBT.
- China: Haitian injection-moulding average selling price ¥214,000, not ¥302,630 (41% high); rolling steel, pig iron,
  ferro-alloy and PVC prices updated.
- UK: TRUMPF laser capex midpoint US$475k (5% lower); tin from the IMF monthly series; PVC / PA6 / PA66 indices.
- Poland: the capacity fee is charged over 15 hours, not 14 (electricity +1.4%).
- India: HRPO quoted directly on its page (₹65.2/kg, not ₹71.18 derived); MCX nickel for the Ni-Resist charges.

## 3b. The software hub rates, re-checked

All 23 software hubs' figures (157: salaries, on-costs, hours) were opened on their pages
(`verify-pages/verdicts/sw-hubs.json`): 89 confirmed, 23 differ, 8 not on the page, 31 unreachable, 6 with no URL.
- **Two errors corrected:** Japan's employment insurance was the employee's 0.5% — the employer pays 0.85% (MHLW FY2026),
  and the child-support levy was added; Mexico's CEAV for an engineer's pay is 7.513% (the 3.15% used was the
  minimum-wage band).
- **Twelve figures the pages now show newer** are laid over the research by `build-config.py` from
  `scripts/sw-research/2026-10-13/raw/page-recheck-2026-10-30.json` (the raw readings stay as found; each note says
  "PAGE UPDATED 30 Oct 2026 … was → now"): UK ONS ASHE 2025 (£55,587) and the IT Jobs Watch Midlands median (£65,000);
  US-Michigan BLS OEWS May 2025 (Detroit median $130,760, p75 $153,270; Michigan statewide in place of Ann Arbor, which the
  page no longer shows); Japan's 2025 wage survey (¥5.785M); Portugal, Czechia and Egypt listings.
  Effect per person-month: UK mid £6,237 → £6,060 (−2.8%); US-MI senior £8,202 → £9,054 (+10%); Japan £2,519 → £2,566;
  Portugal, Czechia, Egypt under ±4%.
- **Not applied:** public-holiday counts where Wikipedia's "paid public holidays" column differs from the book (DE, SE, PT,
  HU, RS, TR, IN, JP, KR) — it counts differently (state holidays, weekday holidays, religious feasts); listed in the same
  file.

## 4. What is still weak (stated in each basis line)

- **Machine capital** is AT PAR wherever no country capex was found — every Asian, Brazilian and South African machine,
  and most machines elsewhere. In low-wage countries capital dominates, so their median part is only 20–40% on
  country-sourced rates (Thailand 20.5%, Vietnam 19.8%, Mexico 22.6%).
- **Japan's labour is a floor**: the scheduled cash earnings were read; the annual bonus (MHLW special earnings) was not.
- **Egypt's occupation earnings** (ILOSTAT 2024) put an engineer level with a craftsman and below today's minimum wage
  growth — the weakest labour figure of the round.
- **Vietnam's FX is held** (the State Bank refuses automated access; neither the ECB nor the IMF publishes the dong).
- **Turkey's machine life** (5%, 20 years) was read only in a search summary; its finance rate is the 36% policy rate.
- **Overhead and packaging** multipliers are held in every country (no country's overhead share was found).
- Several tariffs and resin prices are commercial averages or unpublished-method indices, flagged `verify`.
- Accuracy against prices actually paid is still unmeasured: 0 actuals.

## 4b. Live check in every country

15 real CAD parts (forging × 2, cast + machine, injection moulding, sheet metal, aluminium and polymer extrusion,
blow and rotational moulding, thermoforming, composites, rubber, gear, machining, casting) were taken through the
three CAD-to-COST steps in a browser against a real server, ex-works, in **all 39 countries**, with both reports
(PDF, Excel) opened for every part (`e2e/cad-to-cost-trace.ts`, `CV_TRACE_COUNTRY`, `CV_TRACE_TERMS=EXW`). Each
costing is checked ~68 ways: screen = headless to the penny, the eight buckets re-added from the exported workbook,
every operation re-priced from its rate, every rate from that country's book, logistics 0 ex-works, the PDF and
Excel headline, the stamp, WCAG 2.1 AA on every step.

**585 costings, 39,765 checks passed, 0 failed** (409 INFO — observations, e.g. a DFM job still running).
Per country: `scripts/rate-refresh/world-2026-10/live/summary.md` (+ `summary.json`, `parts15.json`); summarised by
`scripts/country-trace/live-summary.py`.

What the run found on the way, and what was done:
- **Egypt reports re-converted their own figures** (product defect): the £ inside the Egyptian pound's symbol "E£"
  matched the report-text converter, so a PDF printed E£724.30 as "EE£54,162.14" (× 74.78) and some bucket rows a
  third time. `money-text.ts` now ignores a £ that follows a letter (`tests/money-text.test.ts`); Egypt re-run clean.
- **A rate-limited Get cost said nothing useful** (product defect): the CAD limiters answered 429 in plain text, so the
  screen's JSON read threw. `cadLimiter` refuses in JSON with the budget and what to do (`tests/cad-rate-limit.test.ts`);
  `CAD_RATE_LIMIT_SCALE` raises the budget for a load test only (the harness: 15 parts through one server in 10 min).
- Harness fixes, each with a failing case in `tests/trace-checks.test.ts`: every display currency's symbol (Kč, kr,
  lei, JP¥, R$, ₫ …), the typed margin read off the Basis row (a part under £0.50 shows the same pennies at 8 % and
  10 %), the UK stamp is the base book (no suffix), an unsampled headline is "not observed", not a failed count-up.

The spread is what the rates say, not a market check: on every part the cheapest country is China or India (Vietnam on
the blow-moulded duct) and the dearest Germany or the United States, the UK between (e.g. the knuckle forging £8.27 CN · £19.62 UK ·
£23.18 DE, ex-works, 100k/yr). No price actually paid has been entered, so none of these is a measured accuracy.

## 5. Proof

- `tests/world-rate-books.test.ts` — every country's book, and every rate of real parts costed there (171 tests).
- `tests/country-provenance-ratchet.test.ts` — all 38 countries; no country may become less sourced.
- `scripts/rate-refresh/world-2026-10/summary.ts` → `summary.json` — the row per country (sources, key rates, sourced
  share).
- Each book's register: `scripts/rate-refresh/world-2026-10/books/<cc>/register.csv` (every rate, current v new).
- The live run in all 39 countries: `scripts/rate-refresh/world-2026-10/live/summary.md` (585 costings, 0 failed checks).

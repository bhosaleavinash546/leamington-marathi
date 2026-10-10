# Country rates demo review: China, India and UK, live CAD to cost (10 Oct 2026)

**Scope.** Six real parts were costed live in China, India and the UK: 2 castings, 2 mouldings and 2 pressings. Each run went through the CAD-to-Cost screen with the real server and the real browser. Every run used 100,000 parts a year, a 5-year programme and the country's own currency. The PDF and Excel reports were exported from each run, giving 36 files, and every line was read.

**Questions.** Two questions were checked:

- Does each country fetch only its own rates?
- Is every figure and line of the reports right?

**Rule.** No rate figure was changed in this review. Fixes are to workflow, rate lookup and report text only. Suspected rate problems are listed in §5 for a decision.

## 1. Verdict

| Question | Answer | Evidence |
|---|---|---|
| China parts use China rates | **Yes** | Headless leak test: every operation's machine £/h, labour £/h and the material £/kg equal the China book (`scripts/review-2026-10-10/rate-isolation.ts`, 0 leaks). Every CAD response says `ratesRegion: CN`. |
| India parts use India rates | **Yes** | Same test, 0 leaks. Every CAD response says `ratesRegion: IN`. |
| UK parts use UK rates | **Yes** | Same test, 0 leaks. Every CAD response says `ratesRegion: UK`. There is no path where a UK costing reads the China book. |
| Reports correct line by line | **Not before this review.** 19 defects found, all fixed (§3). | Before/after sweep of the 36 exports (§4). |

**What "rates" covers.** Rates means:

- machine-hour rates;
- labour by role;
- material £/kg;
- energy;
- the toolroom rate behind every tool build-up;
- rule-priced services.

**Where a rate comes from.** A China or India costing reads that country's book first. It falls back to "UK × the country factor" only for an entry the book does not price. Such an entry is now labelled with the country first, for example "China: no China price for this grade — the UK book £3.10/kg × 0.880".

## 2. Live results

All parts were run at 100,000 parts a year over a 5-year programme. The headline is the screen's cost per part, which equals the Excel trace.

| Part | Route | China before → after | India before → after | UK before → after |
|---|---|---|---|---|
| PRCR002 stub axle (EN-GJS-500-7, safety-critical) | cast + machine | ¥167.34 → **¥167.28** | ₹2,169.08 → **₹2,169.18** | £52.85 → **£52.85** |
| Casting_Braket (cast steel) | cast + machine | ¥60.95 → **¥60.92** | ₹748.19 → **₹748.23** | £20.68 → **£20.68** |
| IM_ECU_Cover (PA66-GF30) | injection moulding | ¥7.05 → **¥7.05** | ₹101.07 → **₹101.07** | £1.14 → **£1.14** |
| IM_Storage_Tray (PP impact) | injection moulding | ¥20.86 → **¥20.85** | ₹298.55 → **₹298.56** | £4.03 → **£4.03** |
| Seat_Locking_Bracket | sheet metal (stamping) | ¥5.58 → **¥5.58** | ₹102.69 → **₹102.70** | £1.21 → **£1.21** |
| BIW_Inner_Panel | sheet metal (BIW) | ¥68.71 → **¥68.70** | ₹1,290.85 → **₹1,290.92** | £14.02 → **£14.02** |

**What moved.**

- UK costs did not move.
- China and India moved by at most 0.04 %, for two reasons:
  - The display now converts at the books' own FX (¥8.88/£, where it used ¥8.881/£).
  - Labour is held to 4 dp, where it was held to 2 dp.
- No fix changes a cost driver.
- Every CAD response in all 18 runs carries `ratesRegion` equal to its own country.

**Hand check.** The China stub axle was hand-checked headless:

- Moulding: 0.017216 h × £9.6136/h ÷ 0.80 OEE = £0.2069. The tool gives £0.2069.
- The buckets (material 10.609, process 1.788, labour 2.228, tooling 0.245, packaging 0.252, logistics 1.030, overhead 1.338, margin 1.399) sum to £18.889, which is the total.
- Overhead is 9.0 % of the £14.870 factory base.
- Margin is 8.0 % of the subtotal.

**Headless and live differ.** The live figures are not the headless ones because the screen amortises tooling over the programme volume the harness enters.

## 3. Defects found and fixed

| # | Sev. | What the report said | Fix | Test |
|---|---|---|---|---|
| P12 | **Critical** | China furnace labour: "furnace **₹32/h**" (an India symbol in a China book) | Book notes use the book's own `currencySymbol` | `tests/country-report-text.test.ts` |
| P4/P16/P19/P20 | **High** | A ¥ / ₹ report printed "die £3,056", "blast machine £8.61/h", "capex £22,394", "(£2–8)" in its text. The source column was labelled "as recorded, GBP". | `src/export/money-text.ts` converts £ amounts, ranges and £ units at the report FX (PDF and Excel). The rules table converts £ fields and relabels "(£)" → "(¥)". | `tests/money-text.test.ts`, casting-360 X15 |
| P13 | High | Labour notes "China foundry rate (regional-rates.ts, 2026-09)" | The note names the rate book and its labour model; no file names | `tests/country-report-text.test.ts` |
| P15 | High | §6 traceability repeated the same 1,000-character note per operation, about 10 pages | De-duplicated by rate id and source; later rows say "as above (role)" | — (layout) |
| F1 | High | A held material's note began "UK book …" on a China report | Leads with the country: "China: no China price for this grade — the UK book £x × f …" | `tests/country-report-text.test.ts` |
| F4 | Medium | Display FX ¥8.8810/£ while the China book is ¥8.88/£, so ¥9.23/kg printed ¥9.24 | `FX_TO_GBP` derived from the books' FX. The PCB catalogue keeps the snapshot it was priced at. | `tests/country-report-text.test.ts` |
| F2 | Medium | Machine notes printed capex only in £ | "¥287,817 (£32,412)", tariff to 4 dp | `tests/country-rates.test.ts` |
| F3 | Medium | The China energy entry dated today and said "benchmark 2026-09" | Keeps the book's date and source | `tests/country-report-text.test.ts` |
| P14 | Medium | Labour rounded to 2 dp in £ (¥33.08 shown as ¥33.13) | Stored to 4 dp | regenerated books |
| P7 | Medium | Routing line "mach-haas-vf2 £9/hr" for a £9.05/hr machine | Rates to 2 dp | commodity-rules snapshot |
| U1 | Low | "FX £1 = 1.0000 GBP" on a £ report | Omitted for GBP | — |
| U3/J2 | Low | "the screen had none, headless 3%" in the reject-rate basis | Removed (internal jargon) | snapshot |
| J1 | Low | Script paths in notes ("; scripts/country-book.ts") | Removed | `tests/country-report-text.test.ts` |
| P9 | Low | Missing "−" glyph, duplicate URLs, a no-op ladder ("× 1.000 + £0.00"), a note printed twice | Fixed in the generators | — |
| P23/P24 | Low | "wrong in pounds", "no £ claimed" on ¥ reports | Currency-neutral wording | — |

A PCB catalogue side effect was found and fixed: deriving the display FX moved 261 stored component prices by a rounding. The catalogue merge and audit now read the 29 Sep FX snapshot the catalogue was priced at, so `pcb-catalogue-audit` again shows 0 errors.

## 4. Before / after sweep of the 36 exports

The same 36 files were counted with the same patterns, before and after the fixes (`sweep.py`):

| Pattern (where it is wrong) | Before | After |
|---|---|---|
| £ amount in a ¥ / ₹ report | 818 | **0** |
| "INR" / ₹ in a China report | 6 | **0** |
| ¥ / CNY in an India report | 0 | 0 |
| Source-file names (regional-rates.ts, country-book.ts) | 144 | **0** |
| "screen had / headless" jargon | 48 | **0** |
| "as recorded, GBP" | 107 | **0** |
| "FX 1.0000 GBP" on a £ report | 6 | **0** |
| "pounds" in a non-£ report | 16 | **0** |
| Lines opening "UK book" (all on UK reports, the right source; the drop is §6 de-duplication). F1, the China / India held-material note, was verified headless by rate-isolation.ts. | 67 | 33 |
| `NaN` / `undefined` / `null` / `[object` | 0 | 0 |
| PDF pages, 18 reports | 243 | 234 |

**Spot check.** In the China stub-axle Excel, the furnace operator note now reads "¥31.67/h", and the rate column holds 31.67. As arithmetic: (80,667 + 17,932) ÷ 3,113 h = ¥31.67/h.

## 5. Open items: not changed in this review (rates or sourcing; your decision)

| # | Sev. | Item | Why it matters for the demo |
|---|---|---|---|
| R1 | **High** | **Source quality in the printed notes.** UK labour cites job and visa sites: huntukvisasponsors.com (48 citations in the 18 reports), uk.indeed.com and careermetrics.co.uk (30 each). Some UK grade notes cite cliffsnotes.com study notes. | A president reading §6 sees "visa sponsor" and "study notes" sites behind a £/h. The figures follow ONS ASHE, but the URL printed is not ONS. Re-point each to the primary source (ONS ASHE table, LME, DESNZ) in the next research round. |
| R2 | High | **PA66-GF30 has no China or India price.** The ECU cover is costed at UK £3.10/kg × 0.88 (CN) or × 0.90 (IN), clearly labelled. | The China ECU cover's material is a factor, not a China price. Say so if asked. |
| R3 | Medium | **Cutting-tool wear is £0.10/min UK, treated as traded.** It is 16 % of the China stub axle's machining. | Inserts are traded, but Chinese inserts are cheaper. This needs a source. |
| R4 | Medium | **NDT £5/part is an unsourced rule value.** | Label it an engineering estimate, or source it. |
| R5 | Medium | **Machining swarf is not credited on cast + machine.** | It slightly overstates material on heavily machined castings. |
| R6 | Low | Notes carry "Was £x" and "Earlier note:" history (115 notes). | It is internal history; `register.csv` already holds it. Drop it in the next generator run. |
| R7 | Low | `ROTO_HOURS` is UK hours. A DFM job with a bad region falls back to the UK book. | Not on the demo path. |
| R8 | — | **Accuracy is unmeasured.** There are 0 real actuals in `npm run accuracy`. | Say "should-cost model", never "validated against quotes". |

## 6. Demo talking points

**Say:**

- "Each country is costed in its own rate book: labour, machines, materials, energy and the toolroom. The report says which book and where each rate came from." Show `ratesRegion` and §6 of the PDF.
- "Every number is deterministic arithmetic. The AI reads the geometry; it never sets a price." Show a stub-axle line: moulding 0.0172 h × rate ÷ OEE.
- "Switch the country and the same part re-costs in that book." Show the comparison table.

**Avoid:**

- Claiming accuracy against real purchase prices; there are none yet (R8).
- Opening §6 of the UK report on the labour rows until R1 is re-sourced.
- Presenting the China ECU cover's material as a China resin price (R2).

## 7. Reproduce

```bash
cd calculator
npx tsx scripts/review-2026-10-10/rate-isolation.ts          # 6 parts × CN/IN/UK, every rate v its book
npx tsx scripts/review-2026-10-10/one.ts PRCR002.stp CN      # one headless costing with buckets and ops
npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  CV_PARTS=parts.json CV_LIVE_OUT=out npx tsx e2e/cad-parts-live.ts   # live runs + PDF + Excel per part
python3 scripts/review-2026-10-10/sweep.py out                      # count £ / INR / jargon in the dumped exports
```

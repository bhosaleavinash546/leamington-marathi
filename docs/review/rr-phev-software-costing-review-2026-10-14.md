# Range Rover L460 PHEV: whole-vehicle software costing, live review (14 Oct 2026)

**Request.** Cost the Range Rover PHEV's software for the whole car, live in the tool, at 200,000 vehicles a year for 6
years, in every country. Trace every step, export a detailed PDF, review every line, and correct what is wrong. This
was prepared for a president / director review.

## 1. What was run

| Run | How | Output |
|---|---|---|
| Live, before fixes | `e2e/sw-rr-phev-live.ts`: real server and browser. Load the L460 PHEV demo, set 200,000 / yr × 6 yr, cost it at each of the **23 engineering hubs** and download each hub's PDF. Pick each of the **39 manufacturing countries** and record the hub the software follows. Download the Excel workbook. | 23 PDFs, Excel, screen figures, 7-step trace |
| Independent trace | `scripts/sw-review/rr-phev-trace.ts` recomputes every module (10 buckets each) from the published tables with its own arithmetic. It then compares with the engine at every hub to 1p, and with the live screen figures. | `rr-phev-trace.md`, step by step |
| Fact check | An agent checked each product claim in the demo against JLR, Meridian and press pages (`calculator/scripts/sw-research/2026-10-14-rr-phev/verify-demo.md`). | 13 verdicts |
| Live, after fixes | The same live run with the new report. | 23 PDFs (20 pages each), Excel |

**Reconciliation.**
- **Hand recomputation v engine:** 23 hubs × 52 modules × 10 buckets, plus homologation, NRE, total and per vehicle, all agree to 1p.
- **Engine v live screen:** all 23 hubs agree on total, NRE and £ per vehicle.
- **Hub rates:** each hub's book £ / person-month is reproduced from its salaries. The mid salary = salary × (1 + employer on-cost) ÷ productive hours × 152 h ÷ FX. The senior rate follows the book's own on-cost at that salary, which is progressive or capped.
- **Hub salaries:** each hub's mid salary is the median of its listed observations, at all 23 hubs.

## 2. Findings in the exported PDF and Excel (before) and what was done

**Errors (money or meaning wrong)**

| # | Finding | Fix |
|---|---|---|
| E1 | The PDF cost table and the Excel Summary left out homologation (£3.7M), so the buckets did not add up to the total (Excel: £300.9M of buckets v £304.6M). | Homologation is listed. NRE and lifecycle subtotals added. The PDF prints an exact-£ check line, "they agree". |
| E2 | The "Programme life (8 vs 14 years)" sensitivity was hard-coded for the old 10-year default. For a 6-year programme the "low" case (£377.6M) was above the base. | The cases are ÷1.5 and ×1.5 of this programme (4 v 9 years), and the label states them. |
| E3 | The "Production Volume (150k vs 50k)" sensitivity was hard-coded. At 200k a year the "low" case (£285 a vehicle) was above the base (£254). | ×1.5 and ×0.5 of this programme's volume (300k v 100k). |
| E4 | The ASIL sensitivity label read "D vs B" while its low case was B. | "B vs D", tested against the column order. |
| E5 | Costing step 6 said the lifecycle runs "over 6 years". It actually runs to programme year 16: 8 service years and 10 years of security support after the last build. | The step says so. |
| E6 | Margins printed as "12 %" when the sourced figure is 11.7 %, with "≤ 88 %" as the make-or-buy break-even. | 11.7 % and 88.3 %. |

**Statements without a source (removed or corrected)**

| # | Finding | Fix |
|---|---|---|
| H1 | The demo description said the Range Rover software cost is "published ≈ £390M". No source exists; the fact check found none. | Removed. |
| H2 | The PDF section 8 and an Excel sheet printed seven **UNVERIFIED** "published" programme costs, including Range Rover £390M. Excel compared this programme with each of them in %. | Not printed in the PDF. The Excel sheet is renamed "Unverified figures", headed "Not a benchmark; do not cite", and has no % column. |
| H3 | The demo listed a digital key. It is **not confirmed** for the L460, but the £1.3M digital-key module was costed. | The module is out of scope and stated in section 12. Totals fall by £1.2–1.3M per hub. |
| H4 | "Heavy Tier-1 outsourcing" was stated as fact. | Now "Tier-1 development is a modelling assumption, not JLR's sourcing". |
| H5 | The voice royalty uses Cerence's price per unit, but the L460's assistant is **Amazon Alexa** (JLR). | The description says Alexa. The report explains that Cerence's published PPU is used as a reference price for a voice licence. |
| H6 | PHEV variant wording. | The fact check confirmed "P460e / P550e, 38.2 kWh (MY24 on)". The demo prints facts only, each with its page. |

**Garbage and presentation**

| # | Finding | Fix |
|---|---|---|
| G1 | Cover subtitle "Premium Luxury SUV — Full Software Stack (2024–2026)" was hard-coded in the PDF, Excel and AI brief. | The programme's own name: the demo's label, else "Vehicle software programme". |
| G2 | "Source: Tier1_Supplier" and "Tier1_Supplier × 0.9966024915062288" (raw enum, float noise). | "Tier-1 supplier × 0.997 = efficiency 0.88 (unsourced) ÷ (1 − supplier margin 11.7 %)". |
| G3 | "GBP 6,237 / 6,531 per person-month ÷ 1 = £6,237 / £6,531" (a ÷ 1 FX step for a £ hub). | Generator fixed and the rate book regenerated. Only the wording changed. |
| G4 | Only the top 20 of 53 modules were listed, with cut names, undefined category letters, and columns that did not add to the total. | Every module by full name, grouped by domain, with ASIL / complexity / reuse / CAL / PM / NRE / lifecycle / total and an exact check line. |
| G5 | Footer printed over the evidence note on page 3. | New layout with fixed top and bottom margins; tables break above the footer. |
| G6 | Cloud row said "module £/yr ÷ 440,000 reference fleet" without the figure. | It now gives £10.75 per connected vehicle-year for this scope. |

**Gaps (missing for a decision-grade report)**

There was:
- no executive summary;
- no programme definition;
- no vehicle facts or sources;
- no costing trace;
- no per-vehicle charges with their basis;
- no spend by year;
- no other hubs or countries;
- no assumptions register;
- no scope exclusions;
- no rate build-up.

The new report (`src/export/sw-report-pdf.ts`) has all of them.

## 3. The new PDF report (20 pages, A4)

Cover with headline figures and "read this first" · contents · then:
1. executive summary;
2. programme definition and vehicle facts (each with its page);
3. how the cost is built (seven steps and formulas);
4. cost build-up with subtotals and an exact check, plus domain bars;
5. every module;
6. lifecycle and unit economics: royalties each with its basis, IP licences and cloud by module, the cloud basis stated once;
7. spend by year to year 16;
8. **every one of the 23 hubs re-costed** (bars and table), and **every one of the 39 countries** with its hub and reason;
9. risk: Monte Carlo and sensitivity;
10. evidence grades, the largest unsourced amounts, the assumptions register and the rate basis;
11. make or buy and the supplier check;
12. modules not in scope, catalogue gaps and limitations;
- Appendix: the hub's salary observations, the median rule, on-cost and hours, with URLs.

The screen's PDF button and `scripts/sw-review/rr-phev-pdf-sample.ts` (headless) call the same builder.

## 4. Results: Range Rover L460 PHEV, 200,000 / yr × 6 yr, 52 modules, Tier-1 developed

**Headline figures, UK hub (Coventry / Gaydon):**

| | |
|---|---|
| Programme total | £303.3M |
| Per vehicle | £253 |
| Engineering (NRE) | £68.8M, 4,806 person-months at £10,267 / PM |
| Lifecycle | £234.5M — cloud £103.2M, licences and royalties £97.4M, maintenance £33.9M |
| Royalty per vehicle built | £37.84 |
| Running cost per vehicle-year | £22.25 |
| Simulated range | P10 £292.0M · P50 £344.6M · P90 £408.2M; the headline is ≈ P16 |

**Every hub, live screen.** "Before" is the old scope, with the digital key.

| Hub (book £/PM, mid/senior blend) | Before | After | Per vehicle | NRE |
|---|--:|--:|--:|--:|
| Egypt | £228.2M | £227.3M | £189 | £23.7M |
| India | £229.7M | £228.8M | £191 | £24.6M |
| Vietnam | £236.9M | £236.0M | £197 | £28.9M |
| Mexico | £238.1M | £237.1M | £198 | £29.6M |
| Türkiye | £239.2M | £238.3M | £199 | £30.2M |
| Japan | £254.0M | £252.9M | £211 | £38.9M |
| Portugal | £263.3M | £262.2M | £219 | £44.5M |
| Serbia | £264.4M | £263.3M | £219 | £45.1M |
| Romania | £264.9M | £263.8M | £220 | £45.4M |
| South Korea | £264.9M | £263.8M | £220 | £45.4M |
| China | £266.3M | £265.3M | £221 | £46.3M |
| Italy | £268.1M | £267.0M | £223 | £47.3M |
| Czechia | £273.1M | £272.0M | £227 | £50.2M |
| Hungary | £273.9M | £272.8M | £227 | £50.7M |
| Poland | £276.5M | £275.4M | £230 | £52.3M |
| Canada (Ontario) | £278.8M | £277.7M | £231 | £53.6M |
| France | £295.7M | £294.5M | £245 | £63.6M |
| Austria | £302.9M | £301.6M | £251 | £67.8M |
| **United Kingdom** | £304.6M | **£303.3M** | £253 | £68.8M |
| Sweden | £305.2M | £303.9M | £253 | £69.2M |
| Germany | £307.3M | £306.1M | £255 | £70.4M |
| USA — Michigan | £325.9M | £324.6M | £270 | £81.4M |
| USA — California | £378.0M | £376.4M | £314 | £112.2M |

All 39 manufacturing countries map to one of these hubs; section 8 of each PDF gives the mapping and the reason. The
hub moves only engineering and its maintenance. About £200M of cloud, royalties and licences is the same at every hub.

## 5. Read before presenting

- **Accuracy has not been measured.** No real programme cost has been logged. The reconciliation proves the
  arithmetic, not the inputs.
- **77 % of the total (£234.6M) rests on unsourced catalogue figures:**
  - cloud £103.2M;
  - map data £41.4M;
  - the GAS / QNX placeholder £22.7M;
  - the module effort catalogue £49.3M;
  - IP licences £10.6M;
  - the security-support share £7.4M.
- **Published-source share is 7.5 %:** the Avanci licence £18.1M and Cerence £4.6M. The hub salaries, supplier margin and OEM service terms are also sourced.
- **Volume and life are the user's inputs.** JLR publishes no L460-only volume.
- **Catalogue gaps** (supplier ECUs normally priced in hardware) are not in the total:
  - airbag control;
  - on-board charger and DC-DC converter;
  - power steering and parking brake;
  - tyre-pressure monitoring;
  - seat ECUs;
  - trailer functions.

## 6. Improvement opportunities (not done in this round)

1. **Calibrate the effort catalogue to actuals.** One finished programme's person-months per module would firm up 16 % of the total. The trace shows exactly which lines it moves.
2. **Replace the cloud and map-data estimates with supplier quotes** (£144.6M, 48 % of the total).
3. **A licence register per vehicle** (OS, maps, voice, codecs, cellular) entered once and reused across programmes.
4. **Excel parity with the PDF:** the Excel workbook still lacks the all-hub sheet and the country map.
5. **Catalogue modules for the gaps listed in §5**, when there is a source for their effort.

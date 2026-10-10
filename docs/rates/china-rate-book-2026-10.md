# China rate book — October 2026

A Director found the China rates not updated and not correct. They were: every China rate was the UK book × a few
factors from one table (`REGIONAL_DATA.CN`), so the UK's capital, hours, labour levels and grade prices all carried into
China. This review rebuilt China from sourced research, the same way as the India book.

**Basis:**
- **Clusters:** an average of the four automotive supplier clusters — the Yangtze River Delta (Shanghai / Suzhou /
  Ningbo), the Pearl River Delta (Guangzhou / Shenzhen / Foshan / Dongguan), Chongqing and Wuhan.
- **Shifts:** two 12-hour shifts.
- **Prices:** October 2026, CNY, ex-VAT (13% on goods, 9% on gas).

```
python3 scripts/rate-refresh/china-2026-10/build-config.py                     # research → 2026-10-china.json
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-china.json        # dry run: the register
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-china.json --write
```

**What the generator writes:**
- `src/engine/country-books/cn.ts` (generated);
- `REGIONAL_DATA.CN` (labour, energy, machine multiplier);
- `lab-cn-*` and `energy-cn`;
- `BILLET_PREMIUM_USD_PER_T.CN`;
- `china-2026-10/register.csv`, which lists every rate with current → new, decision and basis.

The research files (`china-2026-10/research/*.json`) carry a URL and a date on every figure. The rules are in
`china-2026-10/RULES.md`.

**Caveat:** the researchers' page fetches were blocked by the network proxy. Every figure was read from search-result
extracts of the cited page. Spot-check the headline figures before quoting them outside.

**Tags:**
- **Verified** — an exchange, agency or regulator figure.
- **Likely** — derived by stated arithmetic.
- **Unverified** — one secondary source, stale, or an estimate.

## 1. What was wrong

| Area | Book (UK × factor) | Evidence | |
|---|---|---|---|
| Skilled machinist | ¥71.75/h | **¥33.12/h** | NBS 2025 wages + recruiter role pay, overtime, 13th month, social insurance at the floor |
| Engineer | ¥163.39/h | **¥99.10/h** | NBS 2025 professional pay, day work |
| 3-axis VMC (machine only) | ¥49.79/h, UK hours (4,000) | **¥26.69/h** | Haitian Precision VMC average selling price ¥288k (2025 annual report); 6,336 h |
| CR sheet DC01 | ¥5.57/kg | **¥3.24** | Mysteel Shanghai spot |
| 45# bar / 42CrMo bar | ¥7.00 / ¥11.87 | **¥3.26 / ¥4.28** | Mysteel Shanghai spot |
| NO electrical steel 0.35 mm | ¥12.82 | **¥5.18** | 35W300, Sep 2026 |
| 304L sheet / 316L bar | ¥17.22 / ¥46.65 | **¥12.76 / ¥26.50** | Wuxi spot |
| Ductile iron (charge) | ¥2.12 | **¥2.69** | nodular pig + scrap + nodulariser — the book was *below* the metal |
| Cast steel (charge) | ¥1.05 | **¥2.16** | heavy melting scrap ¥2.05 — the book was below scrap |
| ADC12 / A356 | ¥18.12 / ¥25.67 | **¥21.68 / ¥21.42** | SMM, 30 Sep 2026: ADC12 trades *above* A00 in China |
| AZ91D | ¥32.82 | **¥16.02** | Mg ingot ¥13.72 (Fugu) |
| Copper bar | ¥96.78 | **¥98.71** | below the cathode it is made of; floored |
| PP / PVC resin / PC | ¥7.05 / ¥7.93 / ¥19.69 | **¥8.79 / ¥4.31 / ¥11.12** | SunSirs / OilChem spot — PP was low, PVC and PC high |
| Gas | ¥0.27/kWh | **¥0.356/kWh** | cluster non-residential tariffs |

## 2. Labour (Likely: NBS + recruiter data, loaded by statute)

**How it is built:**
- **Pay:** monthly pay including overtime (150% on weekdays, 200% on rest days; the plan below stays inside the 36 h a
  month legal cap), plus a 13th month.
- **Employer contributions:** pension 16%, medical, unemployment, injury and housing fund, charged at the **city
  contribution floor** (the common practice for hourly staff).
- **Hours:** two 12-hour shifts give 3,113 productive hours a year (24 days a month × 11 h worked, less 5 days' leave).

| Role | Was ¥/h | Now ¥/h |
|---|---|---|
| Skilled CNC setter-operator | 71.75 | **33.12** |
| Semi-skilled operator | 49.91 | **31.70** |
| Foundry / forge / furnace / plastics operators | 45–50 | **31.70** (proxied to semi-skilled — role wages not found) |
| Electronics (SMT) | 58.96 | **33.30** |
| QC inspector | 72.64 | **30.81** (weak source) |
| Maintenance / mould technician | 78.85 | **39.60** |
| Shift supervisor / team leader | 96.88 | **41.47** |
| Process engineer (day work) | 163.39 | **99.10** |

**Not included (not sourced):**
- meal and dorm allowances, training, absenteeism and severance;
- social insurance on actual pay rather than the floor, which would add about ¥1.3/h.

The rates are therefore a floor.

## 3. Energy

| | Book | Evidence | Decision |
|---|---|---|---|
| Gas | ¥0.27/kWh | Shanghai ¥4.12, Wuxi ¥3.86, Guangzhou ¥4.47, Chongqing ¥3.37, Wuhan ¥3.71 per m³ incl. 9% VAT → **¥0.356/kWh** (NDRC 36-city industrial average ¥0.328 agrees) | **Updated** |
| Electricity | ¥0.63/kWh | National Sep 2026 1–10 kV time-of-use average for a 24-h two-shift load ¥0.594 ex-VAT (¥0.672 incl.); Chongqing ¥0.724 | **Held** (push-back: the book sits inside the evidence; provincial all-in averages for Shanghai, Jiangsu, Guangdong and Hubei not found) |

## 4. Machines

**The operating model, applied to every machine:**
- **Hours:** 6,336 a year (two shifts × 11 h worked × 24 days × 12).
- **Depreciation:** straight line, with no shift uplift (PRC accounting is time-based).
- **Finance:** the 5-year LPR, 3.5% (20 Sep 2026).
- **Rent:** ¥25.47/m²/month — the mean of JLL's Shanghai logistics rent (¥31.94, an upper bound) and Dongguan factory
  rents (¥10–28). Inland clusters are cheaper, and their averages were not found.
- **Running costs:** power at the China tariff, support staff at China wages.

**Chinese capex where the makers' annual reports give it (ex-VAT):**

| Group | Evidence | Rate |
|---|---|---|
| 3-axis VMC, drilling centre (Haas VF-2 class) | Haitian Precision 2025 VMC average selling price ¥287,817 (¥841M ÷ 2,922 units) — Medium | VMC ¥49.79 → **¥26.69/h**; VF-2 ¥41.62 → ¥21.29; drill ¥29.67 → ¥16.04 |
| CNC lathe | Headman 2025 slant-bed lathe ¥215,423 (revenue ÷ units produced) — Low | ¥34.95 → **¥19.06/h** |
| 5-axis | KEDE 2024 five-axis average transaction price ¥2.43M (Nawi IPO ¥2.0M) — Low (KEDE's mix runs to large machines) | VMC5 ¥91.06 → **¥98.74**; DMU 50 ¥101 → ¥125 |

The 5-axis rates **rise**. The old book implied a ¥0.9M machine; Chinese 5-axis makers sell at ¥2.0–2.4M.

**All other 206 machines** keep their capital at the book's UK × 0.55, labelled HELD, with the operating model applied
(median −30% to −40%; e.g. 400 t press ¥182 → ¥111/h). The China ÷ UK machine factor that the service rates read is
0.55 → **0.34**.

**Not found:**
- presses, press brakes and injection machines by tonnage (Haitian International's fleet average is ¥302k across all sizes);
- HPDC 800/1,600 t, sand lines, furnaces, forging presses, robot cells and SMT lines;
- a 2026 fibre-laser price.

These are the next research round.

**Cross-check, open.** Suzhou job shops sell 3-axis CNC time at ¥150–300/h, including the operator, overhead, margin
and small-batch utilisation. The book's production cell comes to about ¥58/h all-in:
(¥26.69 ÷ 0.85) + (½ × ¥33.12 ÷ 0.92), with 9% overhead and 8% margin. A job-shop selling rate should sit well above a
dedicated cell's cost, but a 2.5–5× gap is more than that explains. The candidates are:
- the base-machine capex (options, tooling and installation are not included);
- the 9% China overhead factor (`overheadMultiplier` 0.75, held);
- utilisation.

## 5. Materials — 210 re-priced, 226 held

Grade families follow the India and UK methods (see `build-config.py`):

| Family | Anchor (ex-VAT) | Tag |
|---|---|---|
| CR / coated / HRPO / HR structural | Shanghai CRC ¥3.24, HDG ¥3.50, SPHC pickled ¥3.14, HRC ¥2.89 (Mysteel, Sep–Oct 2026); automotive grades × the book's premium (Baosteel extras not found) | Verified / Likely |
| Bar | GB grades' own spot: 45# ¥3.26, 40Cr ¥3.45, 42CrMo ¥4.28, 20CrMnTi ¥3.65, GCr15 ¥5.27; Ni-Cr-Mo grades ladder from 42CrMo | Verified |
| Stainless | 304 bar ¥12.17, 304 CR ¥12.76, 316L ¥26.50, 430 ¥6.73, 409L ¥6.68 (June, stale); martensitic bars ladder from 430 | Verified / Unverified |
| Electrical steel (NO) | 35W300 ¥5.18, 50W800 ¥3.94; thin and high-strength grades ladder (floored); GO / Co-Fe / Ni-Fe held | Likely |
| Iron and steel castings (charge) | ductile ¥2.69, grey ¥2.35, cast steel ¥2.16, CF8 ¥8.62 (304 scrap); alloy premiums added in £/kg (ADI keeps its austempering); Ni-Resist / high-Cr by composition at Changjiang nickel ¥107.65 | Likely (the charge mixes are engineering assumptions) |
| Cast aluminium | ADC12 ¥21.68 (secondary family), A356 ¥21.42; primary-based alloys ladder from A356, floored at it | Verified |
| Copper, brass, bronze, zinc, magnesium | Cu ¥98.71 floor; HPb59-1 rod ¥66.19; H62 ¥74.34; PB1 / C905 / CuSn12 floored at Cu + Sn content; Zamak 3/5 ¥24.02 / ¥24.52; AZ91D ¥16.02 (July) | Verified |
| Extrusion billet | A00 ¥21.47 + 6063 fee ¥0.045 → premium −$186 → **−$21/t** over the library LME | Verified |
| Polymers | PP ¥8.79, HDPE ¥9.27, LDPE ¥9.16, LLDPE ¥8.31, PVC SG-5 ¥4.31, ABS ¥10.01, PS ¥9.85, PC ¥11.12 (Jul), PA6 ¥10.47 (Jul), PA66 ¥16.90, POM ¥11.54 (Jun), PBT ≤ ¥8.85 (ceiling), PET ¥7.74, PMMA ¥13.36, TPU ¥15.75, PEEK ≈ ¥247 (producer ASP); grades × the book's premium | Verified / Unverified (older dates) |
| Natural rubber | ¥16.90 | Verified |

**Held, with the reason (push-back):**

| Item | Why it is held |
|---|---|
| GPPS / HIPS (¥9.76) | Agrees with ¥9.85 |
| Electricity | Agrees with the evidence (§3) |
| Wrought aluminium sheet / bar / forging stock (6082 bar ¥30.06) | Only a 2025 sheet fee found; plausible but unsourced |
| Titanium and nickel superalloy bar | TC4 ingot ¥56 found, but no dated bar price (the book's bar ¥324–406 is a conversion product) |
| PH / duplex stainless | No price found |
| Aluminium bronze, gunmetal | No price found |
| Filled / FR compounds, TPE / TPV, PPS, PEI, LCP, PA12 | No price found |
| Rubber compounds | The raw polymers were found, but a compound is not its polymer |
| Composites, paint | The book lines are fabrics, prepregs and systems; roving and resin prices do not price them |

## 6. Real parts in China — before and after (headless, 50,000/yr, the recorded answers)

`scripts/rate-refresh/uk-2026-10/compare.ts` was run on the previous commit and on this one. **Only China moved.** The
UK, India, Germany, Poland, Mexico and US costs are identical.

| Part | Before | After | Main movers |
|---|---|---|---|
| test gear m3 z38 | £10.84 | **£6.11** (−44%) | alloy bar ¥10.9 → ¥3.6; labour |
| MACH stepped shaft | £5.22 | **£3.14** (−40%) | bar, machine, labour |
| steering knuckle (forged) | £14.11 | **£8.90** (−37%) | forging bar, labour, press hours |
| FORGE hub flange | £10.72 | **£6.85** (−36%) | same |
| Seat locking bracket (stamped) | £1.95 | **£1.31** (−33%) | CR sheet ¥5.57 → ¥3.24 |
| BIW inner panel | £24.05 | **£18.61** (−23%) | sheet |
| PRCR002 stub axle (ductile, safety) | £24.33 | **£18.97** (−22%) | machining, labour (the iron charge rose) |
| Casting bracket (cast steel) | £8.73 | **£6.94** (−21%) | machining, labour (the steel charge doubled) |
| MACH hydraulic manifold | £13.49 | **£11.06** (−18%) | machine, labour; the 6082 bar is held |
| IM storage tray | £4.43 | **£3.88** (−12%) | machine and labour; PP rose |
| AL bumper beam (extruded) | £17.53 | **£17.09** (−3%) | billet up, process down |
| AL battery rail | £22.47 | **£23.10** (+3%) | the billet premium |

The median across the 40 parts is −19%.

## 7. Live runs (a real server, a real browser, China selected)

| Part | Screen | Excel trace | What the screen prints |
|---|---|---|---|
| MACH hydraulic manifold | **¥97.94 ±12.5%** (£11.03) | ¥97.94 | Haas VF-2 ¥21.30/h, drilling centre ¥16.05/h, skilled ¥33.13/h, overhead 9%; no page errors |
| PRCR002 stub axle (100k/yr) | **¥167.79 ±8.8%** | ¥167.79 | sand line ¥85.38/h, foundry ¥31.71/h, VMC ¥21.30/h; no page errors |

The stub axle run costed the default grade, because the advisory grade question was left unanswered. One attempt that
answered the grade stalled in the harness; it was re-run without that answer.

## 8. Code and tests

- **Generator:** `scripts/country-book.ts` is now config-driven by country (region, currency, symbol, research folder,
  snapshot, book file). The India config takes the old defaults, and re-running it is byte-identical. New features:
  - an **additive ladder** (anchor + the book's £/kg premium at the country's FX);
  - an **energy update**, which writes `REGIONAL_DATA.<cc>.energy` and `energy-<cc>`;
  - held energy keeps the regional value exactly;
  - a negative billet premium.
- **Country notes:** country material notes print the country's currency symbol.
- **New tests:** `tests/china-rate-book.test.ts` (14).
- **Restated tests:** four tests used China as the example of "UK × factor" scaling. They now use Turkey, a scaled
  country with the same profile, or the China book for its process labour grades.
- **Full suite:** 3,731 tests, 0 failing after the restatements. The UK real-parts baseline does not move.

## 9. Open — the next research round

1. **Capex for 206 machines** (presses, IMMs by tonnage, HPDC, sand lines, furnaces, forging, laser, SMT, robot cells).
   Their capital is still UK × 0.55. Haitian International and LK Technology publish segment data by tonnage band in
   their full reports; the next round should read the PDFs, not search snippets.
2. **The CNC job-shop gap** (§4).
3. **Wrought aluminium bar / plate / sheet conversion fees** — 6082 bar is held at ¥30.06 against A00 ¥21.47.
4. **Role wages** for Chongqing and Wuhan; foundry, forge, furnace and plastics operators (proxied); 2026
   social-insurance bases for the inland cities.
5. **Provincial all-in electricity** (Shanghai, Jiangsu, Guangdong, Hubei).
6. **Price updates:**
   - Baosteel automotive grade extras;
   - 409L (June) and PC / PA6 / POM (Jun–Jul);
   - carbon fibre (2025);
   - FeSiMg (a rare-earth FeSi stand-in was used).

Accuracy against real Chinese purchase prices is still **unmeasured**. These rates make the inputs evidenced; they do
not prove the outputs.

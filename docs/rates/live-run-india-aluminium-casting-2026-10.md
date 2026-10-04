# Live run: aluminium casting costed in India — October 2026

**Question.** When India is selected, does the tool take India's rates, and only India's, through the whole should-cost of a real aluminium casting?

**How it was checked.**
- **Real run, nothing simulated.** A real server on a fresh database (built-in rate book, no company rates) and a real browser.
- **Real part.** `cad-audit/parts/PRCR002.stp`, a 277 mm aluminium cast housing, cast then machined. It was measured live by the OCP kernel.
- **Workflow.** An engineer's sequence: select India, upload the STEP, answer the engineering questions (aluminium, cast + machine, not pressure-tight, standard tolerance, not safety-critical), apply to the form, Calculate.
- **Evidence.** Captured from the tool itself:
  - every network call;
  - the server's rule-priced values;
  - the tool's own Excel export: its per-line rate trace;
  - the tool's own Rate Database export.
- **Independent check.** Every charged rate was matched against all 39 country rate books, built separately in Node.
- **Contrast.** The same run in the UK.
- **Reproduce:** `CV_LIVE_REGION=IN CV_LIVE_PART=../cad-audit/parts/PRCR002.stp CV_LIVE_ANSWERS='{...}' npm run test:e2e:country` (needs the OCP kernel).

## 1. Result

| | India | UK |
|---|---|---|
| Headline | **₹3,203.42** (≈ £25.19) | **£48.72** |
| Raw material | ₹1,372.14 | £13.74 |
| Process (machine) | ₹1,080.92 | £17.77 |
| Direct labour | ₹186.87 | £8.02 |
| Tooling | ₹15.13 | £0.32 |
| Packaging / logistics | ₹14.88 / ₹57.24 | £0.18 / £0.30 |
| Overhead | 9.0 % — ₹238.96 | 12.0 % — £4.78 |
| Margin | ₹237.29 | £3.61 |

## 2. Independent verification of the India run (as produced)

```
LIVE RUN: PRCR002.stp in IN — headline ₹3,203.42 ±10%; server book builtin 2.2.0

1. COUNTRY ON EVERY SERVER CALL (ratesRegion = the book the server's rules priced in)
   /api/cad/analyze   sent=(multipart, not readable by the browser)  server priced in=IN
   /api/cad/reanalyze sent=IN  server priced in=IN
   /api/cad/reanalyze sent=IN  server priced in=IN
   /api/cad/reanalyze sent=IN  server priced in=IN
   /api/cad/reanalyze sent=IN  server priced in=IN

2. EVERY RATE THE TOOL CHARGED (its own Excel export, sheet 6-Traceability) — 19 lines, 0 not IN's
   ✓ material.pricePerKg                                            mat-adc12            £   2.6812  book: TR,IN,MA,TN,EG
   ✓ rawMaterial.energyKwh.electricity                              energy-in            £   0.2369  book: IN
   ✓ Gravity Die Casting.machineRatePerHr                           grav-die-cast-std    £  18.8191  book: IN
   ✓ Gravity Die Casting.labourRatePerHr                            lab-uk-foundry       £   3.0200  book: IN
   ✓ Fettling (gate / riser removal, grind).labourRatePerHr         lab-uk-foundry       £   3.0200  book: IN
   ✓ Melt shop (charge, melt, treat, ladle).labourRatePerHr         lab-uk-furnace       £   3.5900  book: IN
   ✓ Machining Setup (amortised).machineRatePerHr                   mach-haas-vf2        £  22.4387  book: IN
   ✓ Machining Setup (amortised).labourRatePerHr                    lab-uk-skilled       £   5.1400  book: IN
   ✓ Finish machining — +Y (140 faces).machineRatePerHr             mach-haas-vf2        £  22.4387  book: IN
   ✓ Finish machining — +Y (140 faces).labourRatePerHr              lab-uk-skilled       £   5.1400  book: IN
   ✓ Finish machining — +X (127 faces).machineRatePerHr             mach-haas-vf2        £  22.4387  book: IN
   ✓ Finish machining — +X (127 faces).labourRatePerHr              lab-uk-skilled       £   5.1400  book: IN
   ✓ Finish machining — +Z (97 faces).machineRatePerHr              mach-haas-vf2        £  22.4387  book: IN
   ✓ Finish machining — +Z (97 faces).labourRatePerHr               lab-uk-skilled       £   5.1400  book: IN
   ✓ Drilling — 21 holes (1×Ø3.1×3, 1×Ø6.3×4, 1×Ø10.0×23, 2×Ø14.0×8 mach-drill           £  14.4670  book: IN
   ✓ Drilling — 21 holes (1×Ø3.1×3, 1×Ø6.3×4, 1×Ø10.0×23, 2×Ø14.0×8 lab-uk-skilled       £   5.1400  book: IN
   ✓ Load / clamp / unload — 4 fixturing(s).machineRatePerHr        mach-haas-vf2        £  22.4387  book: IN
   ✓ Load / clamp / unload — 4 fixturing(s).labourRatePerHr         lab-uk-skilled       £   5.1400  book: IN
   ✓ Deburr and gauge check (bench).labourRatePerHr                 lab-uk-semiskilled   £   3.5200  book: IN

3. SHOP FIELDS ON THE FORM vs IN defaults (regionalShopDefaults)
   overhead 9% (expected 9%) · packaging £0.117 · logistics £0.45 (size-aware UK basis × 0.65 / × 1.5)

4. RULE-PRICED VALUES THE SERVER RETURNED (the £ the rules worked out)
   cam-hpdc-die-cost      = 4076           gravity toolmaker shop model: 154 toolroom hours + steel + bought-outs from a 188 cm² parting footprint, complex (20 undercut face(s) ≈ 4 slide(s)); kernel face-count par
   cam-ht-cost            = 0.469          gravity aluminium is solution treated and aged, T6 — £1.1/kg (advisor rate, UK) × country heat-treat factor 0.4264
   cam-shot-blast         = 0.1            gravity castings are blasted to remove sand / scale / flash — 2.80 kg ÷ 600 kg/h × (blast machine £12.55/h + operator £3.02/h), min £0.10
   cam-mach-setup-mach    = mach-haas-vf2  cost-ranked 2 routing(s): split-3axis £5.25 (3-fixturing split routing: mach-haas-vf2 £22/hr + mach-drill £14/hr, 4 setup(s) × 45 min / batch 5000 + 0.6 min handling per 
   cam-mach-tooling       = 3581           4 dedicated fixture(s) × £2,500 (dedicated above 10,000 parts over 5 years) × toolroom factor 0.3581
   cam-mach-prog-nre      = 163            CAM programming and prove-out 13.50 h (1.5 h × 4 fixturing(s) + 0.25 h × 30 feature group(s)) × £12.08/h manufacturing engineer
   cam-tool-wear          = 0.5767         14.4 min of cutting × £0.04/min inserts, end mills and drills (aluminium) — not in the machine rate
   expected IN factors: toolroom 0.3581

5. EXCEL SUMMARY (the tool's own statement of the country)
   Part Name | cv-cad-1ba44fff00cfc418
   Manufacturing Country | India (IN) — rates rebuilt for this country
   Currency | INR (FX: 127.1941 to GBP)
   ── Subtotal | ₹2966.13 | 92.6% | 
   TOTAL SHOULD COST | ₹3203.42 | 100.0% | 
   Total Tooling Cost | ₹1513100.99

6. ACTIVE RATE DATABASE EXPORT vs the independently built IN book
   sheet "Labour Rates": 14 rates, 0 differ from the IN book
   sheet "Machine Rates": 197 rates, 0 differ from the IN book
   sheet "Material Prices": 424 rates, 0 differ from the IN book

VERDICT: all 19 charged rate lines come from the IN book
```

**How to read it.**
- **Section 1:** the server reports, on every analysis call, that its rules priced in India's book (`ratesRegion`). The browser cannot read the first upload's multipart body, which carries the file, so the server's statement is the evidence for that call.
- **Section 2:** all 19 charged rate lines match India's book, at the 4 decimal places of the export.
- **ADC12 material line:** £2.6812/kg also equals the price in Turkey, Morocco, Tunisia and Egypt. Aluminium is LME-priced, and those countries share India's 0.975 metal factor; it is still India's figure.
- **Section 6:** the active rate database the tool exported equals India's book in all 14 labour roles, 197 machines and 424 materials.

## 3. Errors the live run found, now fixed

The first live run gave ₹3,505.61 and showed four places still on UK economics:

| # | Error found live | Fix |
|---|---|---|
| 1 | **The machining route was chosen on UK machine rates.** The route explanation priced the VF2 at £46/hr and the drill at £31/hr; India's book has £22.44 and £14.47. The route optimiser, and likewise the moulding cavity optimiser, defaulted to the UK book. | Both default to the costed country's book (`activeRates()`). |
| 2 | **Fixed UK service prices.** Aluminium T6 heat treatment was £1.10/kg in India. NDT, HIP, impregnation, casting and forging shot blast, descale and coining were also UK £ in every country. | Each keeps its UK value as the UK basis and moves by the country's own economics (`src/engine/regional-services.ts`). Heat treatment and HIP use the heat-treat model's country ratio for a batch furnace + quench + temper (India 0.4264). The others use a service factor of ½ inspector-pay ratio + ½ machine multiplier. The UK is unchanged. |
| 3 | **The casting tool was floored at a UK price.** The gravity die's plausible band (£8,000–£90,000) is a UK market range. India's toolroom build-up came in under £8,000 and was pushed back up to £8,000. | The band moves with the country's toolroom factor. India's die is now £4,076, against £10,925 in the UK. |
| 4 | **The AI agent was grounded on UK rates.** Its rate references came from the UK book whatever the country. | Grounded on the selected country's book. |

Also added: every CAD analysis response states the country its rules priced in (`ratesRegion`), so this can be checked on any run.

**Effect on the India headline:**
- ₹3,505.61 → ₹3,215.18 after fixes 1 and 2;
- → **₹3,203.42** after fix 3.

**The UK run did not move: £48.72 throughout.** `tests/country-rates.test.ts` §10 pins each fix.

## 4. What is India-specific and what is deliberately global

| Item | Basis in the India costing |
|---|---|
| Labour (foundry, furnace, skilled, semi-skilled, engineer) | India's rate for each role |
| Machine-hours (gravity cell, VF2, drill, blast) | India's rebuilt rates: capex and overhead × India's multiplier, energy at India's tariff |
| Melt energy | kWh priced at India's industrial tariff (`energy-in`, £0.069/kWh) |
| Aluminium (ADC12) | LME-based, × India's metal factor 0.975 |
| Tools and fixtures | Toolroom labour and machining × India's toolroom factor 0.3581; tool steel and bought-out parts at global £ |
| Heat treatment, finishing, inspection services | UK basis × India's service factors |
| Overhead / packaging / logistics | India's overhead 9 %; packaging ×0.65 and logistics ×1.50 of the size-aware UK basis (logistics is delivery to the UK) |
| Cutting-tool wear (£0.04/min inserts) | Global — inserts are a traded consumable |

**Estimates the director should know about:**
- India's toolroom factor and service factors are derived from the country table, not from Indian supplier quotes.
- The machine multiplier (0.52) is the country table's.
- A supplier quote replaces any of them.

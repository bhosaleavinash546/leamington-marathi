# Arithmetic audit: polymer and aluminium extrusion (30 Oct 2026)

Group `extrusion`. Brief: `docs/review/arith-audit/BRIEF.md`.

## 1. Scope

**Files I own and audited:**
- `src/engine/cost-input-rules/commodities/extrusion.ts`
- `src/engine/cost-input-rules/commodities/aluminium-extrusion.ts`
- `src/engine/modules/extrusion.ts`
- `src/engine/modules/extrusion-advisor.ts`
- `src/engine/modules/aluminium-extrusion.ts`
- `src/engine/modules/aluminium-extrusion-advisor.ts`
- `src/engine/al-extrusion-data.ts`. This file was read only; no figure in it changed.
- `src/engine/cost-input-rules/derive/profile.ts`. Read only; no change.
- The `extrusion` and `aluminium_extrusion` cases in `to-cost-params.ts`. Read only; no change was needed.

**Parts audited (12):**
- Polymer extrusion: EXT_Vent_Pipe, EXT_Fuel_Line_Tube, EXT_Twin_Chamber_Profile.
- Aluminium extrusion: AL_Battery_Rail, AL_Battery_Can, AL_Bumper_Beam, AL_Busbar, AL_Crash_Box, AL_Heat_Sink, AL_Machined_Bracket, AL_Seal_Carrier, AL_Trim_Channel.

All parts are costed in the UK at 50,000 a year over 5 years (250,000 amortised), with the baseline's stated answers.

**To reproduce:**
```
cd calculator
npx tsx scripts/arith-audit/extrusion.ts [--verbose]                # shadow model: 719 checks, exit 1 on any FAIL
npx vitest run tests/arith-audit-extrusion.test.ts                  # shadow + one test per fix (9 tests)
npx tsx scripts/arith-audit/dump.ts <dir> && python3 -I scripts/arith-audit/basis-check.py <dir>
```

The shadow (`scripts/arith-audit/extrusion.ts`) recomputes everything from three things: the measured geometry in `tests/fixtures/real-parts-baseline.json`, the rate book, and the answers. It never calls the modules or rules under audit. It imports:
- the rate library;
- the aluminium data table (the commodity's book);
- two machining helpers that belong to another auditor (`featureMinutesEach`, `secondaryMachiningCell`).

The polymer advisor's coefficients are not exported, so the shadow restates them with their file and line number. Packaging, logistics, overhead % and margin % are shared shop defaults, so the shadow takes them from the chain's own `stackInput` and recomputes nothing else from it.

## 2. Process sequence: as costed v as made

"Press line" means billet log heater → press → press quench → puller → cooling table → stretcher → finish saw to mill lengths. All of that is priced in the press machine rate. Billet heating is charged as gas kWh in the material line.

| Part | Costed operations, in order (machine · cycle · parts per cycle · crew) | How it is made | Verdict |
|---|---|---|---|
| AL_Battery_Rail (6063 T6, 4 chambers) | 2,500 t press line (porthole die) · 82.6 s · 15 · 4 → die change 0.5 h × 12 runs ÷ 50k · 4 → age 6 + 0.75 h · 1,145 a load · 1 → cold cut-to-length 18.62 s · 1 · 1 → inspect / pack 13.2 s (bench) | Billet heat → press, air / mist quench, stretch, saw mill lengths → T6 age → cut to length cold → pack | ✓ |
| AL_Bumper_Beam (7003 T6, 1 bend) | Press 160 s · 12 · 4 → die change → **cut to length → stretch bend (30 s + 45 s) → age 20 + 0.75 h** → pack | Press quench → stretch → cut → bend in W / T4 → age → pack | **Was press → age → cut → bend: the T6 part would crack on the bender. Fixed (X5).** Money unchanged. |
| AL_Crash_Box (6082 T6, 4 holes) | Press 110.6 s · 50 · 4 → die change → age → cut to length → CNC 0.66 min (½ operator) → CNC load / unload → pack | Water quench at the press → age → cut → drill → pack | ✓ The two 58.5 mm "pockets" are chamber walls and are correctly not machined. |
| AL_Heat_Sink (6063 T6, semi-hollow, anodised) | Press 51.8 s · 46 · 3 → die change → age → cut to length 7.73 s → anodise 0.146 m² at 70 m²/h, crew 4 → pack | Same | ✓ |
| AL_Machined_Bracket (6082 T6) | Press → die change → age → cut to length → CNC 0.91 min (2 holes + 9 cm³ notch) → load / unload → pack | Same | ✓ |
| AL_Seal_Carrier (6060 T66, 13:1 tongue) | 800 t press line (semi-hollow die) → die change → age → cut to length → pack | Same | ✓ |
| AL_Trim_Channel (6060 T66, anodised) | 800 t press line → die change → age → cut to length → anodise → pack | Same | ✓ |
| AL_Busbar (1050, Conform) | Conform from rod 1.73 s → die change → CNC holes 0.35 min → load / unload → pack | Rod → Conform → in-line cut → punch or drill holes → pack | ✓ There is no cold saw because Conform cuts in line, as the note states. |
| AL_Battery_Can (1050 impact) | Impact 2 s · 1 · 1 → tool change 1 h × 12 runs → pack 6 s | Slug (sawn / punched, annealed, lubricated) → impact → trim the mouth → wash → pack | ~ The slug preparation is a £0.42/kg service, stated. Mouth trim is "in the press" with 8% trim metal, stated. **Washing is not costed** (not checked, §7). |
| EXT_Vent_Pipe (PE100) | 90 mm pipe line (vacuum tank, haul-off, planetary saw) 95 kg/h · ½ operator → inspect and bundle 4 s station / 6 s operator | Same | ✓ The name of the second step was fixed (X7): it was "Cut-off, Coil & Inspect", but the part is cut by the line's saw, which is in the line rate. |
| EXT_Fuel_Line_Tube (PA12) | Micro-tube line 33 kg/h → inspect and bundle | Hopper dryer → tube line → in-line cutter → inspect | ~ PA12 drying is not costed. Its energy is small (§7). |
| EXT_Twin_Chamber_Profile (rigid PVC) | 75 mm single-screw profile line 156 kg/h → inspect and bundle | Rigid PVC dry blend is normally run on a counter-rotating twin screw | ~ The line choice is not verified. The 0.52 rigid-PVC output factor is the single-screw stand-in. Proposed P4. |

The press quench, stretch and finish saw are each charged once, inside the press line's rate. Nothing is charged twice: blast, quench and saw do not appear as consumables. `partsPerCycle` divides both the machine time and the labour time in every operation (core.ts:241–242). Every operation's time and money was re-derived by the shadow.

## 3. AL_Battery_Rail by hand, to the penny (after the fixes)

**Inputs:**
- Measured section: A = 1,437.5 mm², L = 1,800 mm, 4 voids, circumscribing circle 161.6 mm, thinnest wall 2.50 mm, outline 1,135 mm.
- Alloy 6063: 2,700 kg/m³, flow stress σ = 26 MPa, base exit speed 50 m/min, butt 25 mm.
- Volume 2,587,500 mm³.

**Weights:**
- Extruded kg per part = 1,437.5 × 1,800 × 2,700 × 10⁻⁹ = **6.98625 kg**.
- Part kg = measured volume × 2,700 = 6.98625 kg (the section is constant).

**Die and press:**
- 4 voids and a 161.6 mm circle (≤ 250) → **porthole die**.
- Press: the 800 t, 1,450 t and 1,800 t presses take hollows only up to 70 / 110 / 130 mm circles → **2,500 t, 236 mm container**. Container area Ac = π/4 × 236² = 43,743.5 mm².
- Openings: usable die face 0.8 × 236 = 188.8 mm. Pitch = 161.6 + 15 = 176.6 mm. 0.7 × (188.8 / 176.6)² = 0.80 → **1 opening**.
- Extrusion ratio R = 43,743.5 / 1,437.5 = **30.43**.

**Pressure and force:**
- Deformation pressure = σ (0.8 + 1.5 ln R) × 1.15 weld = 26 × (0.8 + 5.123) × 1.15 = **177.1 MPa**.
- Friction gradient = 4 (σ/√3) / D = 4 × 15.01 / 236 = 0.2544 MPa per mm of billet.
- Maximum pressure = 0.9 × 2,500 t × 9,806.65 / 43,743.5 = 504.4 MPa.
- Longest billet the force allows = (504.4 − 177.1) / 0.2544 = 1,286 mm. The press takes at most 1,000 mm, so the billet cap is 1,000 mm.

**Exit speed:**
- 50 × 0.75 (hollow) = 37.5 m/min.
- Ram cap = 16 mm/s × 30.43 × 60 / 1000 = **29.2 m/min**. This is the binding limit.

**Strand and billet:**
- Longest strand = (1,000 − 25) × 30.43 / 1000 = 29.67 m. Usable after 1.2 m of strand ends: 28.47 m.
- Part pitch = 1,800 + 4 mm kerf = 1,804 mm. At most 3 parts per 7 m mill length.
- Best layout: 5 mill lengths × 3 parts = **15 parts a push**. Each mill length is 3 × 1,804 + 2 × 25 = 5,462 mm.
- Strand = 5 × 5.462 + 1.2 = **28.51 m**.
- Billet = 25 + 28,510 × 1,437.5 / 43,743.5 = **961.9 mm** = 43,743.5 × 961.9 × 2,700 × 10⁻⁹ = **113.61 kg**.
- Billet per part = 113.61 / 15 = **7.5738 kg**. Recovery = 6.98625 / 7.5738 = 92.2%.

**Cycle, runs, die:**
- Push = 28.51 / 29.2 × 60 = 58.6 s. Cycle = 58.6 + 24 s dead cycle = **82.6 s**.
- Runs: 50,000 / 15 × 82.6 s = 76.5 press hours a year. floor(76.5 / 4) = 19, capped at **12 runs**.
- Die = (£2,200 + £34 × 161.6) × 1.3 (more than 2 voids) = **£10,003**. Life 40 t.

**Cut to length and pack:**
- Cold saw cut = 6 + 0.04 × 161.6 = 12.464 s. Bundle = floor(250 / 161.6) = 1 part.
- Saw time per part = (4 cuts / 3 parts) × 12.464 + 2 s handling = **18.62 s**.
- Pack = 6 + 4 × 1.8 = **13.2 s**.

**Reject uplift:** up = 1 / (1 − 0.02) = 1.020408.

**Operations:**

| Operation | Hours (× up) | Parts per cycle | Machine £/h | Process £ | Labour £ (£24.65/h × crew ÷ 0.92) |
|---|---|---|---|---|---|
| Press | 82.6 / 3600 × 1.020408 = 0.0234127 | 15 | 338.33833 | 338.33833 × 0.0234127 / 15 / 0.78 = **0.677040** | 24.65 × 4 × 0.0234127 / 15 / 0.92 = **0.167282** |
| Die change | 12 × 0.5 / 50,000 = 0.00012 | 1 | 338.33833 | **0.040601** | 98.6 × 0.00012 / 0.92 = **0.012861** |
| Ageing | (6 + 0.75) × up = 6.887755 | floor(8,000 / 6.98625) = 1,145 | 31.705625 | 31.705625 × 6.887755 / 1,145 = **0.190727** | 24.65 × 0.765306 / 1,145 / 0.92 = **0.017908** |
| Cut to length | 18.62 / 3600 × up = 0.0052778 | 1 | 17.6259375 | 17.6259 × 0.0052778 / 0.78 = **0.119264** | 24.65 × 0.0052778 / 0.92 = **0.141410** |
| Pack (bench) | 13.2 / 3600 × up = 0.0037415 | 1 | — | 0 | **0.100248** |
| **Total** | | | | **1.027632** | **0.439709** |

The press machine rate is (400,000 + 210,000 + 297,024 + 297,000 + 300,000 + 120,000) / (6,000 h × 0.8) = £338.338/h. Its energy line is 1,700 kg/h × 0.20 kWh/kg × 4,800 h × £0.182 = £297,024.

**Material:**
- Billet price = (LME $3,240 + UK premium $1,100 + 6063 adder $0) / 1.3285 / 1000 = **£3.2668/kg**.
- Scrap price = ($3,240 + $56) / 1.3285 / 1000 = **£2.4810/kg**.
- Gross = 7.5738 / 0.98 = 7.728367 kg. Net (good part) = 6.98625 kg.
- Metal = 7.728367 × 3.2668 − (7.728367 − 6.98625) × 2.481 = 25.247030 − 1.841192 = **23.405838**.
- Die nitriding = £180 / 40,000 kg × 6.98625 × up = **0.032080**.
- Gas = (0.29 × 7.5738 + 0.10 × 6.98625) × up = 2.954109 kWh × £0.046 = **0.135889**.
- Raw material = **23.573807**.

**Tooling:** 250,000 × 6.98625 = 1,746.6 t ÷ 40 t = 43.664 dies × £10,003 = £436,771.6. Over 250,000 parts that is **1.747086**.

**Stack:**
- Base = 23.573807 + 1.027632 + 0.439709 + 1.747086 = 26.788234.
- Overhead 12% = **3.214588**.
- Subtotal = 26.788234 + 0.35 packaging + 0.68 logistics + 3.214588 = 31.032822.
- Margin 8% = **2.482626**.
- **Total £33.5154.** The product gives £33.5154 (before the fixes: £33.9433).

### The readiness review's three questions (cad2c-readiness-2026-10-29 §4)

1. **Throughput.**
   - The arithmetic: 113.6 kg of billet a push every 82.6 s is 4.95 t/h of billet while pushing. At the 0.78 OEE the costing applies, that is 3.86 t/h of billet, or 3.56 t/h of good extrusion.
   - The press runs at its ram ceiling here (16.0 mm/s, the binding limit). The constants are on the slow side of two published press specifications:
     - a 750 t press: 14 s dead cycle, 30 mm/s ram ([alcircle listing](https://www.alcircle.com/biz/alcircle-pte-products/31658/aluminium-extrusion-press));
     - a 1,300 t press: about 14 s dead cycle, 46.5 in/min ≈ 19.7 mm/s at rated tonnage ([Fielding & Platt spec](https://www.fieldingandplatthistory.org.uk/?p=20791)).
   - So the 9-inch press constants (24 s dead cycle, 16 mm/s) are **not optimistic, and were not changed**. The high t/h comes from the part: a heavy 3.88 kg/m section at a low ratio of 30 through one opening.
   - The 1.5–2.5 t/h "typical" figures are plant averages over a product mix, die trials and short runs. They are not the rate for one heavy section.
   - Sensitivity: if this part ran at 2 t/h after OEE, the press cost (£0.844 a part) would be about 1.93 times higher, roughly +£0.79 a part (+2.4%). That is inside the costing's band.
   - Now printed in the plan note: the push arithmetic, the t/h while pushing, and "engineering-typical, not sourced (two published press specifications…)".
2. **Conversion £0.60/kg v £1.0–1.5/kg quoted.**
   - Like the review's figure, this leaves out overhead, margin, packaging and logistics. The tool's conversion before those is (process 1.028 + labour 0.440 + tooling 1.747 + yield loss 0.742 kg × (3.2668 − 2.481) = 0.583 + gas 0.136 + nitriding 0.032) / 6.986 kg = **£0.57/kg**.
   - An extruder's quoted conversion is a selling price over metal, so it includes their overhead and margin. On that basis the tool's equivalent is (33.5154 − 6.98625 × 3.2668) / 6.98625 = **£1.53/kg**: at the top of the quoted band, not below it.
   - Within it, the die (£0.25/kg) is high and the press (£0.12/kg) is low.
3. **"Tooling investment £873k".**
   - The total is dies consumed over the programme, not a one-off: £10,003 a die × 43.66 dies worn out over 1,746.6 t at 40 t life. At 50k × 5 it is £436,772; the review's £873k was at another volume.
   - The tooling is now itemised (X4): "Extrusion die: £10,003 a set (the up-front investment) × 43.66 sets worn out over the programme (1,746.6 t extruded ÷ 40 t life a set)". The PDF (pdf.ts:960) and Excel (excel.ts:104) print that line.
   - The screen's cost card still labels the whole total "Tooling investment (one-off)". That is a UI file I do not own; see proposal P1.

## 4. Shadow-model result

`npx tsx scripts/arith-audit/extrusion.ts` checks each part's inputs, every operation (machine, hours, parts per cycle, manning, labour hours, process £, labour £), net and gross kg, tooling, the 8 buckets and the total. Aluminium parts also get the billet and scrap £/kg and the die tooling line.

The "before" column counts genuine FAILs. Harness mapping artefacts (an absent saw read as NaN, and `cncMinutes`, which is a rule value and not a module input) are excluded; there were 11 of them, all corrected in the harness.

| Part | Checks | Genuine FAILs before the fixes | After |
|---|---|---|---|
| AL_Battery_Can | 50 | 6: die life 0, tooling total, tooling bucket, net kg, total, tooling item | PASS |
| AL_Battery_Rail | 64 | 6: net kg (rejects), raw material, overhead, margin, total, tooling item | PASS |
| AL_Bumper_Beam | 71 | 23: 17 operation-order checks, plus net kg, raw material, overhead, margin, total, tooling item | PASS |
| AL_Busbar | 64 | 4: net kg, raw material, total, tooling item | PASS |
| AL_Crash_Box | 78 | 6: net kg, raw material, overhead, margin, total, tooling item | PASS |
| AL_Heat_Sink | 71 | 4: net kg, raw material, total, tooling item | PASS |
| AL_Machined_Bracket | 78 | 5: net kg, raw material, overhead, total, tooling item | PASS |
| AL_Seal_Carrier | 64 | 4: net kg, raw material, total, tooling item | PASS |
| AL_Trim_Channel | 71 | 4: net kg, raw material, total, tooling item | PASS |
| EXT_Vent_Pipe | 36 | 9: start-up scrap → extrusion hours, process, gross kg, raw material, buckets, total | PASS |
| EXT_Fuel_Line_Tube | 36 | 5: start-up scrap, extrusion hours ×2, gross kg, total | PASS |
| EXT_Twin_Chamber_Profile | 36 | 0 | PASS |
| **Total** | **719** | **76 genuine (+ 11 harness), all traced to X1–X5** | **719 PASS** |

Apart from X1–X5, the shadow agreed with the product on every plan figure:
- press choice, openings and ratio;
- exit speed, mill lengths, strand and billet;
- cycle and runs;
- die price and life;
- cut-to-length and pack times;
- every machine and labour £;
- the polymer line rate, kg/m, wall and die.

`basis-check.py` over the 12 dumps after the fixes: 398 texts checked, 0 printed equations wrong.

## 5. Constant register

Classes:
- SOURCED: published, named.
- LIBRARY: from the rate book.
- MEASURED.
- EST-V: estimate, now printed where the reader sees it.
- EST-H: estimate held in the data file's header only.
- UNL: unlabelled.

"Rail" means the effect on AL_Battery_Rail's £33.52.

| file:line | Value | Meaning | Class | £ effect on a real part |
|---|---|---|---|---|
| al-extrusion-data.ts:22,24 | LME $3,240/t, $1.3285/£ | Billet market | SOURCED | Rail metal £23.41 (70%) |
| al-extrusion-data.ts:44 (BILLET_PREMIUM UK) | $1,100/t | UK all-in billet premium | LIBRARY (labelled estimate in the book note) | Rail £6.40 ($1,100 ÷ 1.3285 = £0.828/kg × 7.728 kg gross) |
| al-extrusion-data.ts (AL_ALLOYS) | flow stress, exit speed, maximum ratio, butt, age hours, scrap differential | Alloy behaviour | EST-V (speed basis printed in the plan); 6xxx scrap differential SOURCED (Fastmarkets) | Rail scrap credit £1.84 |
| al-extrusion-data.ts:262–270 | dead cycle 16–40 s; ram 12–18 mm/s; run-out; maximum billet | Press classes | EST-V (now printed with the published comparison) | Rail press £0.84 |
| al-extrusion-data.ts AL_DIES | £ base + £/mm; life 25–70 t | Die price and life | EST-V (die basis prints "ESTIMATE"; H13 30–80 t published) | Rail tooling £1.75 (5.2%) |
| al-extrusion-data.ts AL_DIE_NITRIDE | £180 every 40 t | Nitriding | EST-V (die basis) | Rail £0.03 |
| al-extrusion-data.ts AL_LINE | end scrap 1.2 m, trim 25 mm, kerf 4 mm, mill lengths 2.5–7 m | Recovery | EST-V (recovery basis prints each) | Rail yield loss £0.58 |
| AL_LINE.oee 0.78, rejectRate 0.02, dieChangeHr 0.5, runsPerYear 12, minRunHr 4 | | Line | **EST-V (new "line:" note, X6)** | Rail press ÷ 0.78; rejects about 2% of operations |
| aluminium-extrusion.ts:323 | labour efficiency 0.92 | Form default | EST-V (line note) | Rail labour ÷ 0.92 |
| AL_LINE johnsonA 0.8, B 1.5, weld 1.15, friction m 1, force use 0.9 | | Force | EST-V (printed in the breakthrough basis) | Picks the press. Rail: the 2,500 t press either way. |
| AL_DOWNSTREAM.billetHeatGasKwhPerKg 0.29 | cp·ΔT / 40% | Billet heat | DERIVED; **now printed in the energy basis (X6)** | Rail £0.10 |
| AL_DOWNSTREAM.ageOven 8,000 kg, 0.75 h, 0.10 kWh/kg | | Ageing | **EST-V (operation name, X6)** | Rail £0.21 |
| AL_DOWNSTREAM.ctlSaw 6 s + 0.04 s/mm, bundle 250 mm / 6, 2 s | | Cold saw | EST-V (cut-to-length basis) | Rail £0.26 |
| aluminium-extrusion.ts:420 | pack 6 s + 4 s/m | Inspect / pack | **EST-V (operation name, X6)** | Rail £0.10; Seal Carrier £0.11 (3%) |
| aluminium-extrusion.ts:384,386 | CNC OEE 0.80, ½ operator | Fabrication | **EST-V (fabrication note, X6)** | Bracket CNC £2.00 (29%) |
| aluminium-extrusion.ts:350 | Conform die 0.6 × solid; life 30 t; 12 runs | Conform | **EST-V (Conform note, X6)** | Busbar £0.01 |
| aluminium-extrusion.ts:338 | impact 12 runs, 1 h tool change | Impact | **EST-V (impact note, X6)** | Can £0.044 (8%) |
| AL_IMPACT | 30 strokes/min, £0.42/kg slug prep, 8% trim, tool £6,000 + £120/mm, 150k hits | Impact | EST-H / EST-V (impact note prints each) | Can |
| AL_DOWNSTREAM.anodise 70 m²/h, crew 4, £0.35/m² | | Finish | **EST-V (operation name, X6)** | Trim Channel £1.04 (29%) |
| AL_DOWNSTREAM.bender 30 s + 45 s/bend; tooling £15k + £5k | | Bend | **EST-V (operation name and tooling item)** | Bumper £2.56 + £0.06 |
| aluminium-extrusion-advisor.ts:131–140 | speed factors ×1.5 / 1.3 / 0.75 / 0.85 / 0.5 / 0.55 / 0.8 | Exit speed | EST-V (each printed; "engineering-typical" added) | Not binding on Rail (ram cap binds) |
| aluminium-extrusion-advisor.ts:152–157 | +45% an opening; ×1.3 multi-void; ×1.3 intricate | Die | EST-V (die basis) | Rail die ×1.3 = +£0.40 a part |
| aluminium-extrusion-advisor.ts:101–104 | 0.8 die face, +15 mm pitch, 0.7 packing, caps 8/4/2 | Openings | UNL (in the code comment only; only the opening count is printed) | 1 opening on every real part. No effect. |
| aluminium-extrusion-advisor.ts:113,115 | multi-port ≥ 6 voids under 0.8 mm; bridge die above 250 mm | Die type | UNL threshold (the choice is printed) | No real part at a threshold |
| commodities/aluminium-extrusion.ts:159 | 0.98 volume share; 0.5 cm³ | Machined-away test | UNL threshold | Bracket 0.9678 → machined (9 cm³); Busbar 0.988 → not machined |
| extrusion-advisor.ts:47,49 | screw output 0.0533 × D² × family factor | Polymer screw | **EST-V (rate basis prints the formula, X6)** | Twin chamber line rate 156 kg/h |
| extrusion-advisor.ts:59 | cooling 25 / 28 ÷ wall^1.4 | Polymer cooling | **EST-V (X6)** | Vent pipe, fuel line (cooling-limited) |
| extrusion-advisor.ts:116,120 | 0.30–0.65 + 0.08 kWh/kg | Polymer energy | **EST-V (rule basis and energy basis, X6)** | Vent pipe £0.02 |
| extrusion-advisor.ts:158 dieRates | base / £ per mm / calibration | Polymer die | **EST-V (die basis prints the arithmetic, X6)** | Twin chamber £0.089 (5%) |
| commodities/extrusion.ts:46,48,50,52 | 0.25 h start-up, 8 h minimum run, 2% steady scrap, 12 runs | Polymer scrap | **EST-V (X6)** | Vent pipe 2.17% + 2% |
| commodities/extrusion.ts:54 | Ø16 small-tube limit | Line choice | UNL threshold, printed | Fuel line Ø8 |
| commodities/extrusion.ts:153 | complex profile: 6 × √A or intricacy 1.3 | Die complexity | UNL threshold, printed | Twin chamber ×1.5 die |
| commodities/extrusion.ts:270 | manning 0.5 | Polymer crew | **EST-V (X6)** | Vent pipe £0.04 |
| extrusion.ts:141 | inspect 4 s station, 6 s operator | Polymer inspect | **EST-V (operation name, X7)** | £0.05 a part on every polymer part (Fuel line 20%) |
| derive/profile.ts:25,28 | 8 × width; fill 0.9–1.1 | "Constant section" test | UNL threshold, printed in the basis | Routing only |

## 6. Findings register

| ID | Sev | file:line | Evidence | Status | Before → after |
|---|---|---|---|---|---|
| X1 | H | aluminium-extrusion.ts:338 | Impact tool life in kg was `toolLifeHits × extrudedKg`, but `extrudedKg` comes from the section area, which is 0 on a cup. Life = 0 → one tool set, so 250,000 cans were costed on a 150,000-hit tool. | FIXED: life = hits × part kg (test X1) | Can **£0.5234 → £0.5588** (tooling £11,520 → £19,200) |
| X2 | H | aluminium-extrusion.ts:142 | Net weight was the part × 1/(1 − reject), so the 2% rejects were bought at the billet price **with no scrap credit**. The module's own header says process scrap is credited, and the casting review removed this exact model. | FIXED: net = good part; gross = billet × up; rejects credited (test X2) | Rail £33.9433 → £33.5154; every aluminium part −0.7% to −1.3% |
| X3 | M | commodities/extrusion.ts:177 | Start-up purge was "0.25 h at the screw's rated output". On a cooling-limited line the size-up passes the same sizing tank at the line rate. The vent pipe was charged a 108 kg purge from a 432 kg/h screw while its line makes 95 kg/h: start-up scrap 9.88%. | FIXED: purge = line rate × 0.25 h (test X3) | Vent pipe **£0.9046 → £0.8531**; Fuel line £0.2596 → £0.2530; Twin chamber unchanged (screw-limited) |
| X4 | H (text) | aluminium-extrusion.ts:236 | "Tooling investment" = die price × dies worn out over the programme (Rail £436,772 = 43.66 × £10,003), printed as one figure. | FIXED in the engine: `tooling.items` states the die price, the sets and the tonnes ÷ life (test X4). The card label is PROPOSED (P1). | No £ change |
| X5 | L | aluminium-extrusion.ts:211 | Bent profile costed press → age → cut → bend. A T6 profile cracks on a stretch bender; it is bent as-quenched and aged after. | FIXED: cut → bend → age when bent (test X5) | No £ change (Bumper order only) |
| X6 | M | several (§5, bold rows) | Constants moving ≥ 1% of a real part were unlabelled on screen: line OEE / reject / runs / die change, labour efficiency, pack time, CNC OEE and manning, ageing load and handling, anodise rate and crew, Conform die factor and life, impact runs, gas kWh/kg, all polymer line-rate / energy / die / scrap / manning coefficients. | FIXED: each is printed with "ESTIMATE" or "engineering-typical, not sourced" in the plan note, operation name, energy basis or rule basis (test X6) | No £ change |
| X7 | L | extrusion.ts:141 | Polymer "Cut-off, Coil & Inspect" on a cut tube: the cut is the line's own saw (in the line rate) and nothing is coiled. | FIXED: "Inspect and bundle (station 4 s, operator 6 s — engineering-typical, not sourced)"; "Coil and inspect" on cable / sheet (test X7) | No £ change |
| X8 | L | aluminium-extrusion.ts (was `annualKg`) | A variable named "annual" held programme kg. The arithmetic was right. | FIXED (renamed `programmeKg`) | — |
| P1 | H (text) | src/ui/cad-workspace.ts:247, src/ui/main.ts:671 / 21351 | The cost card prints `tooling.totalToolingCost` as "Tooling investment (one-off)". For wear-out tooling (extrusion dies, HPDC die sets, patterns) it is not one-off. | PROPOSED, code below | — |
| P2 | L | to-cost-params.ts `extrusion` case (`...shop`) | Params carry `rejectRate: 0.03`, which the polymer module ignores (its scrap is start-up + steady). No reader sees it today. | PROPOSED: drop it, or model it | — |
| P3 | M | AL impact route | No wash step after trimming. Trim is "in the press". | PROPOSED: a route question or a wash station, once a source is found | — |
| P4 | M | commodities/extrusion.ts:39 | Rigid PVC costed on a 75 mm single screw, with the 0.52 output factor standing in for the twin-screw line rigid-PVC dry blend runs on. | PROPOSED: a counter-rotating twin-screw PVC line in the rate book (rate refresh), then select it for `rigid-pvc` | — |

**P1, proposed code** (types.ts, main.ts and cad-workspace.ts are not mine):
```ts
// src/engine/types.ts — ToolingInput
  /** The tooling bought before the first part, £. `totalToolingCost` may also hold tools worn out and re-bought
   *  over the amortisation volume (dies by the tonne, die sets by shots); absent = the total is one-off. */
  investmentGbp?: number;
// src/engine/modules/aluminium-extrusion.ts — in the tooling literal (I will add it once the type exists)
  investmentGbp: i.dieCostGbp + (i.fabToolingGbp ?? 0) + (i.bendToolingGbp ?? 0),
// src/ui/main.ts (both CostCardModel builders)
    toolingTotal: input.tooling.totalToolingCost,
    toolingInvestment: input.tooling.investmentGbp ?? input.tooling.totalToolingCost,
// src/ui/cad-workspace.ts:247 — the figure
  <span class="cad-cost-k">Tooling investment (one-off)</span>
  <span class="cad-cost-v">${esc(m.fmt(m.toolingInvestment ?? m.toolingTotal))}</span>
  ${m.toolingInvestment != null && m.toolingInvestment < m.toolingTotal - 0.5
    ? `<span class="cad-cost-sub">${esc(m.fmt(m.toolingTotal))} over the programme — tools worn out and replaced</span>` : ''}
```

**Real parts whose cost moves:**

| Part | Before | After | Change |
|---|---|---|---|
| AL_Battery_Can | 0.5234 | 0.5588 | +6.8% |
| AL_Battery_Rail | 33.9433 | 33.5154 | −1.26% |
| AL_Bumper_Beam | 27.5658 | 27.3396 | |
| AL_Busbar | 3.3235 | 3.2973 | |
| AL_Crash_Box | 10.1113 | 10.0196 | |
| AL_Heat_Sink | 4.2423 | 4.2070 | |
| AL_Machined_Bracket | 6.9416 | 6.8899 | |
| AL_Seal_Carrier | 3.7041 | 3.6604 | |
| AL_Trim_Channel | 3.6132 | 3.5870 | |
| EXT_Vent_Pipe | 0.9046 | 0.8531 | −5.7% |
| EXT_Fuel_Line_Tube | 0.2596 | 0.2530 | |
| EXT_Twin_Chamber_Profile | 1.8422 | 1.8422 | unchanged |

Tests that move:
- `tests/real-parts-baseline.test.ts`: it now fails for the 9 AL parts and EXT_Vent_Pipe. EXT_Fuel_Line_Tube moves less than the baseline's rounding. The lead re-records it.
- `tests/commodity-rules-prompt.test.ts`: the extrusion and aluminium rule bases and notes have new text.
- I updated three existing assertions that pinned the defects:
  - `tests/extrusion-build.test.ts`: start-up 23/333 → 8.25/333; pipe total 1.05 → 0.998.
  - `tests/extrusion-advisor.test.ts`: "Cut-off" → "Inspect and bundle".

## 7. What I did NOT check, and why

- The rate book's own build-ups (machine rates, the billet premium), apart from re-adding the press and three downstream rates by hand. They are owned by the rate refresh.
- `featureMinutesEach` and `secondaryMachiningCell`: the machining auditor owns them. I used them, not re-derived them.
- Packaging, logistics, overhead % and margin %: shared shop defaults (`regionalShopDefaults`), taken as given.
- The routes no real part takes: indirect, hydrostatic, off-line SHT (2xxx / 7075), powder, e-coat, multi-opening dies, the force-limited billet branch, and co-ex. The code was read; nothing was traced on a part.
- The screen form (`src/ui/al-extrusion-form.ts`, UI). It shares `buildAlExtrusionInputs` with headless, so the fixes reach it. I did not drive it live.
- Impact can washing, PA12 drying, and the twin-screw PVC line (P3, P4): there was no quick primary source for their cost, and inventing one would break the brief.
- Country books: everything here is UK. Every constant that moves money goes through `countryFactor` / `inCountry` as before. No country path changed.

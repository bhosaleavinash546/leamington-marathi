# Study import review — 13 October 2026

The user supplied 14 files from seven cost studies (xlsx registers, development-pack decks and PDFs). All **389 ideas** were imported into the marketplace with their own decisions (DECISIONS 128), then reviewed by five independent reviewers. Each reviewer covered one slice, checked every record field by field against the source cells, and searched the web for the benchmark claims. **Nothing in a study was rewritten, re-priced or deleted.** Every finding sits on its idea as a visible open point, and every confirmed duplicate is cross-linked.

## 1. What was imported

| Study (source file) | Ideas | Study's own status | Commodity / sub-system | Volume used for £/yr |
|---|---|---|---|---|
| EDU Function Analysis (`EDU_Function_Analysis.xlsx`, Phase 5 dev pack) | 166 | Develop 77 · Not selected 74 · Screened out 12 · Hold 3 | EDU · `<group>` | 100,000 units/yr (study Assumptions) |
| 48V MHEV Battery Should-Cost v1.8 (+ dev pack) | 151 | Develop 35 · Not selected 73 · Hold 39 · Screened out 4 | Battery · `48V Battery · <group>` | 120,000 packs/yr (study README) |
| Half-Shaft Study 2026 | 17 | Saving 9 · Cost adder 3 · Refused saving 3 · Spec 1 · Deferred 1 | Driveline · Half Shafts | 80,000 vehicles/yr |
| Differential Study 2026 | 17 | Saving 7 · Refused 3 · Spec 3 · Adder 2 · Deferred 1 · Rejected alt. 1 | Driveline · Differentials | 80,000 vehicles/yr |
| Prop-Shaft Study 2026 | 19 | Saving 7 · Adder 7 · Refused 4 · Spec 1 | Driveline · Prop Shafts | 80,000 vehicles/yr |
| Transfer-Case Study 2026 | 15 | Saving 9 · Adder 3 · Cost avoidance 2 · Refused 1 | Driveline · Transfer Case | 80,000 vehicles/yr |
| BMW iX3 Gen6 Battery Benchmark | 4 | Saving 2 · Cost transfer 2 | Battery · HV pack architecture | **Not stated**: the benchmark gives no volume |

Reconciliation across the files:
- The register IDs match the deck and PDF IDs exactly for every study.
- The EDU development pack carries exactly the 77 Develop ideas, and the 48V development pack exactly the 35.
- For every row, saving = affected cost × saving %.

Cost adders, refused savings, specifications, deferrals, rejected alternatives and cost transfers carry **no money** in `annualSaving`; a test enforces this. A negative low case (a cost increase) keeps its minus sign.

## 2. Transcription: what the review found in *my* conversion, and what was fixed

All five reviewers confirmed that every source cell is present verbatim. They found six converter defects, all fixed and re-checked in `scripts/study-import/convert.py`:

1. **Critical. Seven 48V ideas lost the minus sign on a negative low case:** ID-018, 123, 124, 128, 129, 130 and 132. A cost increase therefore read as a saving; for example ID-128 showed "£2.62M–£2.62M" instead of "−£2.62M to £2.62M". The fix:
   - signed formatting;
   - the text "(the low case is a cost increase)";
   - numeric `savingPerUnitLow/HighGBP` and `annualSavingLow/HighGBP` fields, which the Excel export now uses in place of parsing text.
2. Blank NRE or payback cells printed as "NRE £0" and "payback None yrs". They now print "not stated".
3. EDU deck links: T1 carried T12's development card because `startsWith('T1')` also matches "T12". T5, G1, G8 and G9 were linked to other ideas' cards that only cross-reference them. A card is now attached only when it opens with the idea's own ID; slides that only mention the idea go to `studyDeckMentions`.
4. The driveline `targetVehicle` scope text was cut at 600 characters. It is now carried in full.
5. The EDU effort "Med" was normalised to "Medium". The verbatim value is now kept in `studyEffort`, and the 48V level in `studyLevel`.
6. Development-pack notes were cut at 12,000 characters. The limit is now 30,000, so no deck text is cut.

Not carried, by choice: the EDU and 48V criterion scores (C1–C7) and the EDU NRE-per-unit and net-per-unit columns. Where these matter, the findings below quote them.

## 3. Duplicates

Three duplicate checks were run:
- an automatic gate (title Jaccard plus concept cosine) against the full 3,418-idea library;
- the same gate within each study;
- every flag adjudicated by a reviewer as **true duplicate / same lever on a different part / distinct**.

**73 study ideas are true duplicates of an existing library idea:** EDU 47, 48V 14, driveline 11, iX3 1. They stay in the marketplace, because the study record is the better-evidenced one. `possibleDuplicateOf` names the library idea, and the Excel column "Possible duplicate of" shows it. One true duplicate is within a study: 48V ID-107 duplicates ID-093, the same alloy change on the same housing for the same coating saving.

Most other automatic flags are the same lever on a different part, for example a CV boot against a slip-spline boot, or an axle breather against a transfer-case breather. They are not duplicates.

## 4. Quality: what the studies themselves get wrong (open points, not edits)

**Seven critical, all on Develop ideas:**
- **EDU R5** (magnet-free rotor): two problems.
  - R5 is selected alongside ten other magnet ideas (R1, R6, R13, R16, R19, M2, Z5, Z9, X2, Z10), none of which is in its conflict set. Together they claim £339.72 against the £171 magnet.
  - The band, 75–90% of £205, does not follow from R5's own mechanism, which gives 60–75% of £171 = £102.60–£128.25.
- **EDU P1** (Si IGBT instead of SiC): its own text says it "must not be judged at part level… a system trade study, not a saving". It is still Develop with an £81.59 device saving.
- **EDU P17** (shunt sensing): a £38–£67 saving is credited to the £181 power module, but the idea only deletes £9.80 of current sensors.
- **48V ID-011** (casting flatness): this is the top-ranked idea. It claims £4.60–£8.74, but the only line that falls is £3.78 of adhesive, and its own arithmetic says about £1.70.
- **48V ID-006** (cell-to-pack): only £12.61 of non-cell content can be removed, yet even the low case is £16.20.
- **48V ID-150** (ultrasonic welding): the 15–30% band is applied to a £131.83 base that is 93% cell, giving £19.77–£39.55 for a weld-process change.
- **48V ID-138** (break up the turnkey supply): it is credited £27.24–£54.49, while the study's own cascade carries about £17 of margin.

**Major issues, by pattern** (50 ideas carry at least one major point):
- **Develop status breaking the study's own decision rule.** Weighted score is below 3.95 and the risk-adjusted saving is below 1% of the BOM:
  - 48V ID-034, 049, 056, 066, 069, 074, 097, 100, 104, 107, 140, 151.
- **Develop ideas with negative net per unit and paybacks of 5–8 years:**
  - EDU G8, G9, B6, R8 and X7.
- **Baseline contradicts the study's own component sheet:**
  - EDU B1 (the housing is already HPDC), I3 (the lid is already stamped), V2 (the mounts are already elastomeric) and B2.
- **Saving larger than the content the idea changes:**
  - EDU V4, A1, A2 and R16;
  - 48V ID-001, 135, 148, 149, 151 and 144.
- **NRE understated as a "marginal share" of another idea's asset:**
  - 48V ID-004 (text £450k against £90k used), 006, 059 and 092.
- **Conflicts the register does not record:**
  - 48V ID-001/011 (the same adhesive saving is counted twice), 059/004, 062 against 059/060/063/064, and 092 against 001;
  - EDU Z5, Z9, P3 and P14.
- **Driveline:**
  - hs26-d2 and ps26-d1 are labelled "Saving" (£622K and £1.91M a year), but their own text rejects them ("likely infeasible"; "I am now recommending against this").
  - hs26-d1 (£8.32M a year) and tc26-d2 (£3.44M a year) are excluded by the study's own combined capture.
  - **ps26-d9 / tc26-d3 contradict each other** on the shortening: at least 120 mm against about 35 mm.
  - The ps26-d1 "steel ruled out" premise fails the study's own whirl gate.
  - dif26-d4: the stated weights and prices do not give the quoted £57 and £39.
- **EDU A8** shows £3.9M–£5.9M a year for an idea the study screens out as cost-negative.

**Study-level points (on no single idea):**
- **Half-shaft deck slides 28, 31 and 32 show the EUR figures with a £ sign:** £163 / £120 / £17–30 / £69–90, where the register's correct GBP figures are £141 / £104 / £17–26 / £69–78. Correct these before the deck is shown.
- **The combined-capture arithmetic does not follow from the cards:**
  - Half Shafts: the cards sum to £151.01, not about £141.
  - Prop Shafts: £12–14 gross less £9.38 of adders gives £2.6–4.6, not £6–12.
- **The 48V study already warns that its saving bands are overstated** (deck slide 4; Evaluation rows 180–181). It calls a portfolio payback of about 40 days "not credible" and says the development-list total double counts. The same caveat should go with every 48V figure.
- **The EDU pack's slide counts are stale.** Slide 2 says "Twenty proposals" and slide 5 says "57 still live"; the pack carries 77.

## 5. Benchmarks (web-checked by each reviewer, up to 12 searches per slice)

**Confirmed:**
- **EDU:** Tesla Model 3 PMa-SynRM (A5); YASA axial flux at Mercedes-AMG (A3); BMW, Nissan and Renault current-excited motors (R5); Taycan / e-tron GT two-speed (Z5); Leaf Si IGBT (P1, but that car is 400 V, not 800 V); MEB APP310 shared across models (X2).
- **48V:** Bosch passive cooling and plastic housing; MAHLE under 55 °C; A123 14S1P; Valeo flatness; TI pin-compatible family; LTC6811-1; Hella PowerPack.
- **Driveline:**
  - Eaton MLocker and ELocker; Lexus GX with no front locker;
  - G-Class transfer case on the 9G-TRONIC; Grenadier centre lock;
  - magnetic-pulse welding patents; GKN VL3; BorgWarner chain vs gear;
  - BMW Energy Master; BMW pack-to-open-body.

**Not found:**
- **EDU:**
  - Nissan Ariya axial oil spray (T7);
  - MEB / Model 3 pinion cut on the rotor shaft (G8);
  - Model Y HPDC drive-unit housing (B1);
  - APP310 and Ultium direct stator-to-inverter connection (S7);
  - shunt sensing "widely used" (P17); grain-boundary diffusion "widely adopted" (R1); inductive position sensor "widely adopted" (N1);
  - "future Chrysler/Jeep" Niron applications (A4).
- **48V:**
  - Bosch "full output to 75 °C without reduction in life" (ID-001);
  - Castasil-37 at 173 W/m·K;
  - NXP 0.8 mV accuracy and TI 105 °C (ID-059);
  - the exact copper price for ID-139;
  - "AlSi10MnMg family copper-free" (ID-107).
- **iX3:** the two-400 V-halves pack split (E2); per-cell venting into the pack floor (C2).

**Contradicted (weak):**
- EDU B2: one secondary source says the Model 3 uses oil stator cooling with an external heat exchanger.
- 48V ID-093: the Silafont-36 alloy label is partly contradicted.
- 48V ID-004: SNE Research puts LFP at 50–60 and NCM above 100 USD/kWh, against the study's 55–65 and 85–95.

## 6. How it shows

**In the marketplace**, each idea carries:
- its study and source pointer (file › sheet › row);
- the study's status and decision reason;
- **Review open points**, with severity, evidence and recommendation (165 ideas: 7 critical, 50 major, 108 minor as the highest severity);
- **Possible duplicate of** (73 ideas).

**In the Excel export**, the same fields appear as columns, plus:
- a **Study status** filter and a "By study status" table on the Dashboard;
- signed low/high savings.

Library ideas show "Library idea" as their status.

The review inputs are committed under `scripts/study-import/review/`. `apply-review.py` stamps them onto the packs, so the open points regenerate from data rather than hand edits.

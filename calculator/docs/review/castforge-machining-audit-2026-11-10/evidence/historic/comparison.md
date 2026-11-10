# CH-47 spiral bevel pinion and gear: recorded 1972 route and hours v CostVision

**Recorded data:** DTIC AD-747857 (TRW ER-7389-F, 29 Feb 1972, Distribution A). Tables XXV, XXVI, XXVIII and XXIX are transcribed in full in `recorded.json`, with PDF page references.

**Tool data:** CostVision headless `costMeasuredPart`, run with the UK book and `AIR_GAPPED=1` on two STEP models, measured by the application's own kernel bridge. The models are **MODELLED FROM THE PUBLISHED DRAWING, NOT ORIGINAL CAD** (`models/`). The run dumps are in `tool-runs/*.json` and the machine-readable comparison is in `comparison.json`. The comparison is built by `scripts/build_comparison.py`.

**This comparison covers hours and counts only. No currency is compared.**

## Read this first

### Time base

- **What the record measures.** The record gives 1972 standard hours on 1972 US shop equipment: engine, turret, tracer and double-compound lathes, Heald and Bryant internal grinders, a Gleason generator and a 2000 t Maxipress. The report says these hours were "actually observed and factored for practical efficiency", or else taken from standard labour data.
- **What the tool measures.** The tool gives 2026 cycle times on a CNC lathe, a VMC and a hobber. It applies its own OEE (0.8), labour efficiency (0.92) and crew (0.5 operator per machine on cut operations).
- **What the ratios mean.** A ratio mixes era, method and scope. It is **not** an accuracy measure for either side.

### Scope

- **Where the record stops.** It ends before carburise/harden.
- **What the record treats as indirect.** Inspection and QC are indirect. These are the asterisked operations 10, 20, 90, 100, 290 and 300, plus precept 6.
- **Tool lines excluded to match.** Gear grinding (after hardening), gear inspection, carburise, quench, temper and washes. Forging quench-temper (£/kg), NDT (£/part) and descale (£/kg) are excluded too; these are service lines with no hours.
- **Deburr is shown but kept out of the totals.** Table XXIX item 4 excludes "some deburring operations common to both processes".

### Hour definitions

- **Recorded.** MAN is direct labour in std h per piece. Set-up is in hours per lot: the forging lot is 500 and the machining lot is 100.
- **Tool machine hours per piece.** Cycle ÷ OEE.
- **Tool labour hours per piece.** Crew × labour time ÷ labour efficiency. This is exactly as `core.ts` charges it.
- **Gear-route set-up.** The gear module folds 0.75 h per operation per batch into each cycle. It is split out here (DERIVED).

### The models are approximations

- **Teeth.** The teeth are skew-straight bevel teeth with straight 22.5° flanks and a 25° mean skew. The curved spiral is not modelled.
- **Face width.** The report does not give the face width, so it is assumed to be 1.00 in.
- **Bodies.** The bodies are built from the forging designs and the pinion operation sheets.
- **Modelled masses (DERIVED).** Gear 4.20 kg; pinion 7.70 kg. The report gives no finished weights.

## 1. GEAR, precision-forged route: Table XXV v the tool's `forging` route

**Conditions:** UK, 2,500/yr × 1 yr (the order), with answers grade 18CrNiMo7-6, tight tolerance and safety-critical. The 10,000/yr × 5 yr run changes only the amortised set-up.

**Note on the grade:** 9310/AMS 6265 is not in the library. 18CrNiMo7-6 is the nearest Ni-Cr-Mo case-hardening steel; this substitution is labelled.

| Recorded op (Table XXV) | Rec MAN h/pc | Rec MACH h/pc | Rec set-up h/lot (lot) | Tool counterpart | Tool labour h/pc | Tool machine h/pc | Tool set-up |
|---|---|---|---|---|---|---|---|
| 30 Cut billet (DoAll saw) | .070 | .14 | 1.0 (500) | Billet cut-off, carbide saw | 0.0014 | 0.0032 | none |
| 40 Square ends & chamfer (auto lathe) | .035 | – | 3.0 (500) | **none** | – | – | – |
| 50 Heat for forging (rotary exogas furnace) | – | .18 (".J8", first digit faint) | 1.0 (500) | Induction heater (untended) | 0 | 0.0081 | none |
| 60 Preform + finish hot coin (2000 t Maxipress) | .10 | .08 | **9.0** (500) | **Forging on `forge-ring-mill`** (crew 2) | 0.0443 | 0.0255 | **none** |
| 70 Inspect / stamp serial no. | .015 | .015 | 1.0 (500) | **none** | – | – | – |
| 80 Clean (Wheelabrator) | .015 | .015 | – | descale £0.12/kg (no hours) | – | – | – |
| 90 Magnaflux, 100 inspect 10 % (indirect) | excl. | | | NDT UT £6 (excl.) | | | |
| 130, 150, 160, 210, 220, 260, 270: turn / bore / trace / groove / gear angles (engine, turret, tracer, double-compound lathes) | 1.210 (7 ops) | | 1.0+3.0+1.5+2.5+1.5+2.0+1.0 = 12.5 (100) | CNC lathe "turning op 10/20" + VMC finish boring + 2 × load/unload | 0.0519 | 0.0944 | 2 fixturings × 45 min = 1.5 h per batch of 125 (10k: 500) |
| 140, 170, 180, 190: grind face/OD, bore/face, pre-HT (Heald, Bryant) | .625 (4 ops) | | 1.5+1.5+2.5+1.0 = 6.5 (100) | **none** | – | – | – |
| 240, 280 polish; 200, 250 identity/etch | .100 / .040 | | – | **none** | – | – | – |
| (deburr excluded from XXIX) | – | | | bench deburr | 0.0185 (excl.) | 0 | |

### Totals (labour h/pc)

| | Recorded | Tool, 2,500 | Tool, 10k/yr × 5 | Recorded ÷ tool (2,500) |
|---|---|---|---|---|
| Forging run (ops 30–80) | 0.235 | 0.0457 | 0.0457 | 5.1× |
| Forging set-up per pc | 0.030 (15.0 h / 500) | 0 | 0 | tool has no forge set-up |
| Machining run, Table XXIX item 4 (ops 130–170) | 1.045 | 0.0519 | 0.0519 | 20× |
| Machining run, all of Table XXV (ops 130–280, DERIVED) | 1.975 | 0.0519 | 0.0519 | 38× |
| Machining set-up per pc | 0.190 (19.0 h / 100) | 0.012 | 0.003 | 16× / 63× |
| Die labour (resink, Table XXVIII) | 0.014 | 0 | 0 | – |
| **Total, Table XXIX basis** | **1.514** | **0.110** | **0.101** | **14×** |
| Total, full Table XXV basis (DERIVED) | 2.444 | 0.110 | 0.101 | 22× |

On a machine-hour basis the tool's machining run is 0.094 h/pc, against the recorded 1.045 h (11×) or 1.975 h (21×).

### Counts

| Count | Recorded | Tool |
|---|---|---|
| Direct operations in scope | 20 (5 forging + 15 machining) | 7 (3 forging + 4 machining lines) |
| Set-ups per lot | 5 forging per 500 lot (15.0 h); 11 machining per 100 lot (19.0 h) | 0 forging; 1 amortised line of 1.5 h per batch (125 at 2,500/yr, 500 at 10k) |
| Die life | 500 forgings per cavity (sink + 4 resinks); insert retired at 2,500 | 23,827 forgings per die set (47.7× the per-cavity life) |
| Forging machine | 2000 t Maxipress: preform + hot coin in one heat (development layout adds a cold coin) | `forge-ring-mill`: "seamless ring: upset, punched, rolled" |

### Material input

| | Billet | Bar | Other |
|---|---|---|---|
| **Recorded** | 16 lb/pc = 7.26 kg (DERIVED kg) | 3.50 in (88.9 mm) dia | Fig. 7: 3-1/2 × 5-7/8 in → 16.0 lb (DERIVED check) |
| **Tool** | 7.906 kg (**1.09×** recorded) | Ø82.3 mm (H/D 2.3 rule) | as-forged 5.73 kg = model 4.20 kg + 3 mm/side machining stock + 2 mm turning stock; ring-rolling yield 0.725 |

The record gives no as-forged weight. The forging design calls for **0.006–0.010 in (0.15–0.25 mm)** stock on the teeth, against the tool's 3 mm a side.

## 2. GEAR, conventional route: Table XXVI v the tool's `gear` route

**What each side starts from:**
- **Record:** a bought "normal oversize forging blank", then lathe and grinder work, then Gleason generating.
- **Tool:** bar slice, then CNC blank turning, then hobbing. Chamfer/deburr, grinding and inspection follow, but are out of scope.

**Answers given to the tool (from the drawing):**
- 43 teeth
- module 5.152 mm (= 25.4/4.930 DP)
- β = 25° (the mean spiral angle)
- face 25.4 mm (assumed)
- ISO class 6 (the tightest offered; the drawing's .0003 in pitch tolerance is finer)
- case-hardening steel, carburised

| Recorded op (Table XXVI) | Rec MAN h/pc | Rec set-up h/lot (100) | Tool counterpart | Tool run h/pc (DERIVED, excl. set-up) | Tool set-up |
|---|---|---|---|---|---|
| 5 Procure forging blank | – | – | bar slice Ø259 × 31 mm, 12.96 kg | – | – |
| 10 Inspect forging | – | – | none | – | – |
| 30 face & bore, 40 turn OD, 50 trace web & bore, 60 turn mtg face, 80 semi-fin groove, 100 / 110 rough / finish gear angles (turret, engine, double-compound lathes) | 0.995 (7 ops) | 12.5 | "Blank turning (face, OD, bore)", CNC lathe, 1 line | 0.0428 (2.57 min) | 0.75 h per batch |
| 70 grind bore & 2 faces (Bryant) | .333 | 2.5 | **none** | – | – |
| 20, 90 stamp; 95, 120 polish | .024 / .020 / .060 / .040 | – | **none** | – | – |
| 140 Generate gear teeth (Gleason) | **.400 as read / .600 implied by sheet total** | 5.0 | "Gear hobbing" (`gear-hob-medium`) | 0.0171 (1.03 min) | 0.75 h per batch |
| (out of scope) | | | chamfer/deburr 0.417 min; gear grinding 1.13 min; inspection 0.33 min | excl. | |

### Totals and ratios

| | Recorded | Tool (2,500 → batch 210) | Tool (10k → batch 830) | Ratio |
|---|---|---|---|---|
| Turning run | 0.995 h | 0.0428 h | 0.0428 h | 23× |
| Tooth cutting run | 0.600 (.400) h | 0.0171 h | 0.0171 h | 35× (23×) |
| Run total (sheet) | 2.072 h | machine 0.0855 h; labour 0.037 h | machine 0.0787 h; labour 0.034 h | 24× machine-h |
| Set-up | 20.0 h per lot of 100, 9 set-ups (0.20 h/pc) | 1.5 h per batch, 2 set-ups (0.0073 h/pc) | 1.5 h per batch (0.0018 h/pc) | 13× per lot |
| Total, Table XXIX | **2.272 h/pc** | 0.037 labour h/pc | 0.034 | 61× labour, 27× machine |

**Geometry consequence:** the gear module models a cylindrical helical gear. It derives tip Ø = mn z / cos β + 2 mn = **254.7 mm**, against the modelled bevel heel OD of **226.2 mm**. It then buys a full-disc bar slice of 12.96 kg; the precision-forging billet is 7.26 kg.

**Material:** the conventional blank is recorded in dollars only ($29.88, weight not recorded), so material input **cannot** be compared on this route.

## 3. PINION: coverage only, because no hours are recorded

- **The route card has no hours.** The Fig. 44 route card (FR-729982-4, "FORGED PINION GEAR", material "FORGING – 9310 ST'L") lists operations, but its hours columns are blank.
- **The report has only an estimate.** On p.155 it estimates a saving of "approximately thirty dollars in material and .3 standard direct hours for each forged tooth pinion".

| Route card op | Tool forging route (2,500/yr) |
|---|---|
| 1 Release forgings | n/a |
| 2 / 5 Vibro-etch serial nos. | none |
| 3 Drill 1-1/4 thru (W&S turret) | VMC "Finish boring, stepped bore Ø48.6 × 140", 1.08 min |
| 4 Loc on ball fixture, turn (engine lathe) | CNC lathe "turning op 10/20", 2.55 min (+ load 1.2 min) |
| 6 Trace inner contour & face (cam-follower lathe) | inside the same turning / boring lines |
| 7 Face, chamfer & centre (engine lathe) | inside turning |
| 8 Turn gear face angle; 9 turn back & front angles (double-compound lathe) | inside turning |
| 10 Deburr complete | bench deburr, 1.04 min (excl.) |
| 11 Wash | none |
| 11A Grind bearing dia & shoulder 2.9555 (Cincinnati grinder) | **none** |
| 12 Check gear teeth for stock removal | none (inspection) |

**Tool forging operations:**
- saw: 0.15 min
- induction heat: 0.75 min
- `forge-press-2500t`: 3 hits, 15 s takt, crew 2
- flash trim on `press-100t`
- secondary machining as above

**Recorded development layout (Fig. 11):** cut stock, machine slug, heat/preform/warm coin (2000 t), blast, remove flash on a lathe, degrease, cold coin, blast, magnaflux, demagnetise, inspect, oil.

| Pinion count / figure | Recorded | Tool |
|---|---|---|
| Machining ops | 7 machining + 2 marking + deburr, wash, check | 4 lines (turning, boring, 2 load/unload) + bench deburr + set-up |
| Forging ops | slug machined from bar, preform + warm coin, flash removed on a lathe, cold coin | saw, heat, closed-die press (2 impressions + finisher), trim press |
| Billet | not recorded | 15.35 kg (Ø102.7 mm bar); as-forged 10.37 kg; finished model 7.70 kg |
| Saving, forged teeth v conventional | ~0.3 std h/pc (estimate) | 0.195 h/pc (2,500) and 0.201 h/pc (10k), DERIVED as gear-route-from-bar labour (0.299) minus forging-route labour (0.104) |

The tool's "saving" is almost entirely blank turning: 31.0 min of turning from a Ø200 mm bar, against 0.9 min of hobbing. The record's conventional pinion starts from a forged blank. **The two figures are not like for like.**

## 4. Verdicts

1. **Operation coverage: poor.**
   - Every recorded **pre-heat-treat grinding** operation (4 on the gear, 1 on the pinion) is missing from the tool, as are polishing and the double-compound-lathe gear-angle turning as separate operations.
   - The tool collapses 7–9 lathe operations into one "turning op 10/20" line and one VMC boring line.
   - On the forged-tooth gear, the tool's forging route selects a **ring-rolling mill**, not a closed-die precision coin press. There is no preform/finish sequence and no notion of forged teeth: 3 mm stock on the machined faces, against the drawing's 0.15–0.25 mm on the teeth.
   - The gear route models a **cylindrical helical gear** (hob + generating grind). The application has **no bevel or spiral-bevel process** (no Gleason generator, no bevel cutter).
   - The kernel's gear metrology looks for **cylindrical** tip patches, so it reads nothing on a bevel gear. Teeth, module and face had to be typed. With neutral file names the gear routes only to casting / cast + machine / machining, with no gear and no forging option. The routes in this study were reached through the file name ("gear" / "pinion") and the forced commodity.
   - **Present in both:** billet cut, heating, one forging step, turning, boring, tooth cutting (conventional), deburr.
2. **Set-up structure: different in kind.**
   - **The record** charges a set-up for every operation: 5 forging set-ups per 500-lot (9.0 h for the press alone) and 11 machining set-ups per 100-lot (19.0 h).
   - **The tool's forging route** charges **no** forge-line or die-setting set-up. Its secondary machining set-up is 45 min per fixturing (2 → 1.5 h) over a batch of annual/20.
   - **The tool's gear route** charges 0.75 h per operation over a batch of annual/12 (210 at 2,500, against the record's 100).
   - **Per piece**, the tool's set-up is 16–63× lower (forging route) or 13× lower per lot (gear route) than the record's.
3. **Run time: 1 to 1.5 orders of magnitude lower in the tool.**
   - Forging run: 5×.
   - Machining run: 20–38× on labour, 11–21× on machine hours.
   - Tooth cutting, Gleason against hobbing: 23–35×.
   - Totals: 14× (XXIX basis), 22× (full Table XXV) and 61× on labour for the conventional route.
   - Roughly 2× of each labour ratio is the tool's 0.5 crew. The rest is era and method (1972 manual lathes and grinders against CNC build-ups), plus the operations the tool omits.
   - The size of the gap means it cannot be explained by era alone. The tool is missing operations as well as running faster ones.
4. **Material input: close for the forged gear, not comparable elsewhere.**
   - **Forged gear:** the tool's billet is 7.91 kg against the recorded 7.26 kg (16 lb), i.e. **+9 %**. The bar is Ø82.3 mm against 88.9 mm. The agreement is partly coincidental: the tool reaches it through a ring-rolling yield of 0.725 on 3 mm machining stock, not through closed-die practice.
   - **Conventional route:** the recorded blank is a dollar figure only. The tool buys a 12.96 kg bar slice sized from a wrong (cylindrical) tip diameter.
   - **Pinion:** the billet is not recorded.

## 5. Not compared, and why

- **Dollars and pounds.** The task forbids conversion, and 1972 US$ against 2026 £ is meaningless anyway.
- **Pinion hours.** The route card hours are blank, and Tables XXV–XXIX cover the gear only.
- **Gear route card and Fig. 45 operation sheets.** These are too faint to read figures from at 600 dpi.
- **As-forged and finished weights.** The report does not give them. The model masses are DERIVED approximations.
- **Out-of-scope operations.** Heat treat, carburise, tooth finish grinding and inspection fall outside the record's scope.
- **Die money.** Table XXVIII ($3,980 consumable; $6,500 die set excluded by the report) is not compared. Only the die-life count is.

## 6. Defects in the record itself

These are carried as found, not corrected.

- **Table XXV totals.** The printed grand total MAN of 2.190 implies 1.260 h on sheet 1, but the legible values sum to 1.280. The printed set-up total of 22.0 does not equal the sum of the rows (34.0).
- **Table XXIX item 4.** It takes only the sheet-1 machining hours (1.045), yet item 5 includes the sheet-2 set-ups.
- **Table XXVI op 140.** It reads .400, but the sheet total of 2.072 needs .600.
- **Text on p.151.** It quotes 2.072 h for the conventional route "including set-up"; Table XXIX gives 2.272.
- **Table I gear pitch angle.** It prints 50°5'; the forging data block reads 50°51'.

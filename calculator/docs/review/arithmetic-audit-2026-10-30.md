# CostVision — arithmetic and hallucination audit, every commodity (30 Oct 2026)

**Asked (the Director, through the user):** the whole tool must be arithmetic with no hallucinations, every commodity
must cost in the right process sequence, and every step of every commodity must be traced to double-check the
arithmetic — ahead of an all-commodity demo.

**Definition used.** A *hallucination* is any figure or statement on screen or in a report that is not (1) measured,
(2) from the rate book with its stated source, (3) answered by the engineer, (4) a stated, visible assumption
("engineering-typical, not sourced" / ESTIMATE, with its reasoning), or (5) arithmetic on those where the arithmetic
printed is the arithmetic done. A step charged twice, missing, or out of the process order counts too. The shared
method is in `docs/review/arith-audit/BRIEF.md`.

## 1. What was done

| Layer | How | Result |
|---|---|---|
| Every real part re-costed through the product's own chain | `scripts/arith-audit/dump.ts`: 40 real CAD parts (`cad-audit/parts/`), UK, 50,000 / yr, 5-yr programme — every rule's value + basis, the module inputs, the module output, every operation, the 8 buckets | 40 of 40 cost, before and after |
| Every printed equation checked | `scripts/arith-audit/basis-check.py`: each "a × b = c" in 1,516 basis / trace / warning lines evaluated at the precision printed | 0 false equations (all flags hand-checked: units, squares, rounding) |
| Every numeric constant classified | `scripts/arith-audit/constants.py`: 2,206 literals in the costing code; 1,243 with no basis within 8 lines | each auditor judged its own; ~200 that move cost now print their basis and class |
| Independent recompute per commodity | 13 auditors, each wrote a shadow model that does NOT call the code it checks, recomputed every rule-derived input, every operation's time and £, material, tooling and the 8 buckets, and worked one part by hand to the penny | **4,637 checks, 0 FAIL** on the final code (table §3) |
| Process sequence | each part's operations as costed v. how the part is made | wrong orders fixed (e-coat masking, bent beam age/cut/bend, melt shop); missing steps costed or stated "not costed" |
| AI-number leaks | every LLM call, every numeric field it returns, followed to where it lands; stand-in replies in tests | 7 H leaks fixed; AI mode now fills the same numbers as a no-AI run on all 40 parts |
| Software costing | `scripts/sw-review/rr-phev-trace.ts` independent recompute | 23 hubs, 0 failing |
| Screen = headless = reports | live three-step run on all 14 CAD routes (`e2e/cad-to-cost-trace.ts`, manifest of 14) | §5 |

Write-ups, one per group, each with the sequence table, the hand-worked part, the constant register and the findings
register: `docs/review/arith-audit/{casting, machining, forging, sheet-metal, injection-moulding, hollow-forming,
composites-rubber, extrusion, gear, pcb, spec-commodities, features-reports, ai-leaks}.md`.

## 2. Findings

236 findings across the 13 groups: **52 H** (wrong money or a false statement), **91 M** (an unverifiable or unlabelled
figure that moves cost ≥ 1 %), **93 L** (presentation). 150 fixed by the auditors in their own files and ~20 more
applied by the lead in shared files (§2.3); the rest are proposals that need a source, a rate refresh or a design
decision (§6).

### 2.1 Wrong money — fixed (selection; every one has a test)

| Commodity | Defect | Effect |
|---|---|---|
| Composites | Prepreg bought on the fibre's 65 % only, while the line said "prepreg (fibre + resin)" | roof panel £432.02 → £479.83 |
| Composites | NDI a flat unsourced £25 a part (26 % of the hat stiffener) | a C-scan station: £0.86 a part; hat £98.69 → £73.55 |
| Rubber | the door seal's extrusion line crew charged twice (cure tunnel) | £0.74 → £0.65 |
| Forging | descale charged per kg of billet (the flash is trimmed off first) | hub flange 48 % over on the line |
| Forging | 100 % MPI a flat £2.50 while the casting route prices the same inspection as a 75 s station (£0.67) | knuckle £22.79 → £20.02, yoke £22.94 → £20.24 |
| Machining | roughing also removed the metal inside the holes the drilling already cuts (198 cm³ twice on Part1) | Part1 £50.81 → £48.29 (with the cell fix below) |
| Machining | on the twin-pallet cell the operator was charged half the cut AND the full load that happens during it | manifold £22.52 → £21.44; forgings −£0.37 |
| Machining | a cast spindle's lathe load at crew 0.5 and paying tool wear; lathe chuckings priced as £2,500 mill fixtures | own op, whole operator; soft jaws |
| Casting | cast + machine shot blast sized on the finished, not the as-cast weight; pattern sets ignored rejects poured | bracket +0.5 %, stub axle +0.6 % |
| Sheet metal | the seat bracket's 21 unfolded holes had no die station; drawn panels "blanked first" had no blanking die; blanking press always 200 t | seat £1.56 → £1.62, inner panel £17.03 → £18.07 |
| Sheet metal | the route basis printed £/part figures the costing did not carry (£0.427 v £0.548) | text = cost |
| Injection moulding | clear polystyrene costed as PPS, recycled PP as polycarbonate (name matched by accident) | right cooling / temperatures / pressure |
| Injection moulding | cavity-option £ printed on different OEE / crew / maintenance than the costing | printed option = costed |
| Blow / roto / thermo | roto moulds sized for good parts while machine time is charged on parts moulded (28 moulds, not 26); grinding and wear on good parts; blow in-line trim at OEE 1 without rejects; thermoform tool life printed but never applied | duct +2.4 %, reservoir +2.8 %, coolant tank +0.8 % |
| Aluminium extrusion | the impact can's tool never wore out (life from a section area of 0); rejects bought at billet with no scrap credit | can +6.8 %, every profile −0.7 to −1.3 % |
| Polymer extrusion | start-up purge at the screw's rate, not the line's | vent pipe −5.7 % |
| Gear | heat-treat freight charged on all four heat-treat steps; hob and wheel wear without the reject uplift | −£0.19 |
| Surface finishing | adding blast / impregnation stages made the e-coat line CHEAPER (line occupancy split by dwell); galvanise pre-treat charged on the paint line | cast e-coat £1.52 → £7.16 |
| E-motor | housing on a literal 2,700 kg/m³, not A380's library 2,680 | −£0.46 |
| PCB / PCBA | SMT time divided by the number of parallel lines (two lines halved every board's SMT); NPI price = volume headline × an unsourced 1.38 | NPI radar £92.46 → £276.76 (the board costed at 50) |
| Painting (screen) | the three demos stated 15 / 60 / 18 parts an hour but were costed at the stage model's 120 | demo 1 £31.97 → £52.82 |
| Quote teardown | margin and "our total" left out packaging and logistics: an identical quote showed a margin gap | identical quote → 0 gap |
| Quote teardown | a quote 30 % BELOW should-cost headlined "competitive; hold" in red | fixed |
| Causal model | "£ per 1 % index move" counted energy and consumables as metal (+46 %) | metal only |
| Route comparison | programme spend kept the tooling's overhead and margin in the "piece cost without tooling" (up to £1.33 M) | fixed |

### 2.2 False statements removed (selection)

- **The "Feature-based cost breakdown" card** printed its own heuristic £ and minutes (Part1 £45.60 · 247 min beside a
  costing of £21.70 · 39.6 min) — removed.
- **AI price range**: the CAD prompt asked the model for a £ low / mid / high, shown as Optimistic / Most Likely /
  Conservative and printed in the CAD analysis PDF — no longer asked, removed if sent. The model's mould and die £ for
  OTHER commodities printed as "Process-Specific Parameters" — removed. Agent "fill the form": operation times and
  numbers sent as strings were never checked against what the user said — now checked; refused numbers leave the form's
  own value instead of an unlabelled £25,000 mould / 4 cavities / 0.08 h. A BOM picture's "100" against C1–C10 now
  takes the designator count. RFQ "£4,500 of negotiation headroom" with nothing costed — removed.
- **"Tooling investment (one-off)"** counted wear replacements (composite hat: £6.34 M "one-off" where the set is
  £0.71 M) — now "Tooling over the programme" with its build-up (sets in service v. replacements).
- **PCB**: "Supply risk premium applied to unit prices" with a "+£ cost add" — nothing adds it; now stated as an
  indicator NOT in the cost. Two automotive NRE figures on one screen — one.
- **Unsourced benchmarks presented as norms**: "8–18 % norm", "sector benchmark", "within industry benchmarks", "above
  average", "pays back inside a year", "2025 Q2 … tooling fixed" — replaced by what the tool holds, labelled heuristics.
- Text claiming steps not costed: a leak test (blow), a tap test (composites), "slower feeds" for gear materials the
  costing stops on, class 7 "skive / shave" when it grinds, the battery "estimates are marked" (they were not), harness
  crimp times that "drive labour" (they do not — now a stated cross-check), a pattern called steel that is aluminium, a
  core setter on a part with no core, the die-cost line calling a £6,713 build-up a "block".
- ~200 constants that move cost now print their value and class on the basis line ("engineering-typical, not
  sourced" or the source); the uncertainty band's spreads are printed; forge press force prints Kt and σ.

### 2.3 Applied by the lead in shared files

Removed the heuristic feature card; one cell-operator rule in three places (`machining.ts`, `feature-machining.ts`,
`routing-optimiser.ts`); forging MPI as the casting station; tooling label and build-up on the cost card, the compare
table and Excel; packaging / logistics / bought-in into the quote teardown; RFQ headroom on costed lines only; AI
autofill string check and no default fills; PCB supply-risk text and one NRE; painting demos at their stated rate and
coats priced from the library; BIW demo 3 at its stated 28 welds; harness crimp cross-check on screen; masks on at load
(before pre-treatment) and off at unload; no second blast route on casting / forging finish forms; unsourced benchmark
texts; the gear baseline answered from its drawing (ISO class 7, was 8).

## 3. Independent recompute — final code

| Group | Real cases | Checks | Fail |
|---|---|---|---|
| Casting, cast + machine | bracket (both routes), stub axle | 107 | 0 |
| Machining | Part1, manifold, shaft + cells on 3 castings / forgings | 181 | 0 |
| Forging | knuckle, hub flange, yoke | 120 | 0 |
| Sheet metal | seat bracket (50k, 5k), 3 BIW, channel on laser + brake | 328 | 0 |
| Injection moulding | ECU cover, clip, tray | 136 | 0 |
| Blow / roto / thermoforming | 6 parts | 196 | 0 |
| Composites, rubber | 6 parts | 258 | 0 |
| Polymer + aluminium extrusion | 12 parts | 719 | 0 |
| Gear | m3 z38 at ISO 6 / 7 / 8 / 9 | 180 | 0 |
| PCB / PCBA | radar (CN / UK / PL, ASIL-C), camera | 350 | 0 |
| Harness, painting, finishing, BIW, battery, e-motor | form defaults, every demo preset, finishing on 4 real parts | 1,046 | 0 |
| Features + reports | 6 parts × buckets, countries, band, sensitivity, carbon, routes, DtC, teardown, PDF / Excel | 760 | 0 |
| AI leaks | 40 parts, AI v no-AI form fill, stubbed replies | 256 | 0 |
| **Total** | | **4,637** | **0** |

Software costing: `rr-phev-trace.ts`, 23 hubs, 0 failing. Re-run any group: `npx tsx scripts/arith-audit/<group>.ts <dumpDir>`.

## 4. Real parts — before → after (UK, 50,000 / yr, 5-yr programme)

| Part | Commodity | Before | After | Change |
|---|---|---|---|---|
| AL_Battery_Can | Al extrusion | £0.52 | £0.56 | +0.04 (+6.8 %) |
| AL_Battery_Rail | Al extrusion | £33.94 | £33.52 | -0.43 (-1.3 %) |
| AL_Bumper_Beam | Al extrusion | £27.57 | £27.34 | -0.23 (-0.8 %) |
| AL_Busbar | Al extrusion | £3.32 | £3.30 | -0.03 (-0.8 %) |
| AL_Crash_Box | Al extrusion | £10.11 | £10.02 | -0.09 (-0.9 %) |
| AL_Heat_Sink | Al extrusion | £4.24 | £4.21 | -0.04 (-0.8 %) |
| AL_Machined_Bracket | Al extrusion | £6.94 | £6.89 | -0.05 (-0.7 %) |
| AL_Seal_Carrier | Al extrusion | £3.70 | £3.66 | -0.04 (-1.2 %) |
| AL_Trim_Channel | Al extrusion | £3.61 | £3.59 | -0.03 (-0.7 %) |
| BM_Air_Duct | Blow moulding | £0.99 | £1.02 | +0.02 (+2.4 %) |
| BM_Washer_Reservoir | Blow moulding | £1.31 | £1.35 | +0.04 (+2.8 %) |
| Casting_Braket | Cast + machine | £20.03 | £19.76 | -0.27 (-1.3 %) |
| PRCR002 | Cast + machine | £42.31 | £42.05 | -0.27 (-0.6 %) |
| COMP_Battery_Lid | Composites | £73.71 | £73.71 | +0.00 (+0.0 %) |
| COMP_Hat_Stiffener | Composites | £98.69 | £73.55 | -25.14 (-25.5 %) |
| COMP_Roof_Panel | Composites | £432.02 | £479.83 | +47.81 (+11.1 %) |
| EXT_Fuel_Line_Tube | Polymer extrusion | £0.26 | £0.25 | -0.01 (-2.5 %) |
| EXT_Twin_Chamber_Profile | Polymer extrusion | £1.84 | £1.84 | +0.00 (+0.0 %) |
| EXT_Vent_Pipe | Polymer extrusion | £0.90 | £0.85 | -0.05 (-5.7 %) |
| FORGE_Control_Arm_Yoke | Forging | £22.94 | £20.24 | -2.70 (-11.8 %) |
| FORGE_Hub_Flange | Forging | £17.25 | £17.05 | -0.20 (-1.2 %) |
| steering_knuckle_RH | Forging | £22.79 | £20.02 | -2.77 (-12.2 %) |
| test-gear-m3-z38 | Gear | £18.16 | £18.32 | +0.17 (+0.9 %) |
| IM_Cable_Clip | Injection moulding | £0.19 | £0.19 | -0.00 (-0.1 %) |
| IM_ECU_Cover | Injection moulding | £1.27 | £1.27 | +0.00 (+0.0 %) |
| IM_Storage_Tray | Injection moulding | £4.66 | £4.65 | -0.00 (-0.0 %) |
| MACH_Hydraulic_Manifold | Machining | £22.52 | £21.44 | -1.08 (-4.8 %) |
| MACH_Stepped_Shaft | Machining | £9.35 | £9.35 | +0.00 (+0.0 %) |
| Part1 | Machining | £50.81 | £48.29 | -2.52 (-5.0 %) |
| ROTO_Coolant_Tank | Roto moulding | £37.73 | £38.02 | +0.29 (+0.8 %) |
| ROTO_Header_Tank | Roto moulding | £14.53 | £14.59 | +0.05 (+0.4 %) |
| RUB_AV_Mount | Rubber | £1.85 | £1.85 | +0.00 (+0.0 %) |
| RUB_Door_Seal | Rubber | £0.74 | £0.65 | -0.09 (-12.5 %) |
| RUB_Grommet | Rubber | £0.35 | £0.35 | +0.00 (+0.0 %) |
| BIW_Floor_Reinforcement | Sheet metal | £5.27 | £5.55 | +0.29 (+5.5 %) |
| BIW_Inner_Panel | Sheet metal | £17.02 | £18.07 | +1.05 (+6.1 %) |
| BIW_Reinf_Channel | Sheet metal | £0.93 | £0.93 | +0.00 (+0.0 %) |
| Seat_Locking_Bracket | Sheet metal | £1.56 | £1.62 | +0.07 (+4.3 %) |
| TF_Battery_Box_Lid | Thermoforming | £20.95 | £20.95 | +0.00 (+0.0 %) |
| TF_Trim_Cover | Thermoforming | £2.21 | £2.21 | +0.00 (+0.0 %) |

The gear's +0.9 % is the drawing's ISO class 7 (was answered 8); its arithmetic fixes alone are −1.0 %. Every move is
a defect fixed — none is a tuning. Nothing here has been compared with a price paid (§6).

## 5. Live three steps — all 14 CAD routes

Real server (OCP kernel, no AI key), real browser, the 14 routes' parts through Part & context → Confirm → Cost,
both reports exported and opened (`scratchpad/final14`; manifest: the five-part and nine-part manifests, gear at ISO
class 7). **849 PASS · 14 FAIL · 11 INFO** — the 14 FAILs are one harness check per part that still looked for the old
column name "Tooling investment" (renamed "Tooling over programme" by this audit; the harness is corrected). No product
check failed.

| Check (each of 14 routes) | Result |
|---|---|
| screen = headless (comparison reference row = headline) | 14 of 14 |
| the workbook's 8 buckets re-add to the headline; the material line re-adds | 14 of 14 |
| PDF and Excel opened: headline and reproducibility stamp word for word | 14 of 14 |
| axe WCAG 2.1 AA, every step, both themes | 56 of 56 |

| Route | Part | Headline (live settings) |
|---|---|---|
| Forging | hub flange | £17.02 |
| Cast + machine | stub axle | £41.97 |
| Injection moulding | ECU cover | £0.89 |
| Sheet metal | seat bracket | £1.29 |
| Aluminium extrusion | battery rail | £33.48 |
| Blow moulding | air duct | £0.99 |
| Rotational moulding | header tank | £14.59 |
| Thermoforming | trim cover | £2.18 |
| Composites | hat stiffener | £73.55 |
| Polymer extrusion | vent pipe | £0.83 |
| Rubber | grommet | £0.30 |
| Gear | m3 z38, ISO 7 | £18.23 |
| Machining | hydraulic manifold | £21.37 |
| Casting (as cast) | bracket | £17.53 |

The live settings are the manifests' (mostly 100,000 a year), so these differ from §4 (50,000 a year).

## 6. Still open — stated, not hidden

- **Accuracy is unmeasured.** 0 actual prices logged. The audit proves the tool computes what it says; it cannot prove
  what it says is what a supplier charges.
- **Rate-book items** (move only through a dated rate refresh): PA66-GF30 density 1,300 kg/m³ v. datasheets 1,360–1,370
  (ECU cover ~2 % low); PA66-GF30 £3.10 and PC/ABS £1.92 need a dated European quote; the gear, hobber and 30 other
  machines still "tuned to a target shop rate" (may include operator / overhead — up to ~£0.9 on the gear); thermoformer
  machine rates carry an energy line while the module adds sheet heating (possible double count); the HMC capex is an
  estimate.
- **Constants that need a source** (now labelled on screen and in the reports): composite layup rate and tool life
  (500 cycles); sand pattern life (wood band on an aluminium plate); forging Kt (at or below Kalpakjian & Schmid);
  roto parts per arm; blow cooling factors; the turning finish rate (conservative — up to −17 % on the hub flange).
- **Steps stated "not costed" rather than modelled**: composite ply cutting and vacuum bagging; blow leak test on closed
  containers; roto neck / vent cutting; gear bore hard-turning and saw cut-off; forging billet saw; deburr on forgings /
  castings machined on the feature path and on laser + brake; aluminium impact-can wash.
- **Design decisions left to the owner**: class-8 carburised gears ground (pinned by a routing test) v. shave (−£1.9);
  PCBA bare board taking the stack's overhead + margin like the components; casting route on a part with machined
  holes buying no metal for them (flagged by the route comparison already).

## 7. Scorecard

| Area | Before (29 Oct) | After (30 Oct) | Basis |
|---|---|---|---|
| Totals add up on screen, headless and reports | 9 | 10 | 14 routes live + 4,637 independent checks, 0 fail |
| Inputs traced: measured, sourced, answered or visibly labelled | 6 | 8 | ~200 cost-moving constants now print their class; the open list in §6 remains |
| Process sequence as made | 7 | 9 | all 40 parts' operation lists read against the route; missing steps costed or stated |
| No AI number in a price or a figure | 8 | 10 | every numeric field followed; AI fill = no-AI fill on 40 parts |
| No false statement on screen or in reports | 6 | 9 | ~60 false lines removed; text that remains is the arithmetic done |
| Accuracy against prices paid | none | none | 0 actuals |

Scores are judgements on a 10-point scale with the basis stated; the before figures are from the readiness assessment
of 29 Oct 2026.

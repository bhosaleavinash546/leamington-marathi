# Forging cost model — end-to-end review, 2 October 2026

The forging model was traced from the uploaded CAD to the pound in the same way
as the casting, moulding, sheet-metal and machining reviews. This note lists what
was wrong, what changed and what is still open. Every finding has a test in
`calculator/tests/forging-review.test.ts`.

**Summary.** The forging step itself was timed wrongly. The cycle was "strokes ×
10 s", and the strokes came from a face-count heuristic in the kernel labelled as
measured. The knuckle took 60 s on the press, about four times a crank-press
line.

Some steps of a forge line were not costed at all:
- flash trimming, though the process route printed "Flash trim";
- the crew (one person on the line);
- the scrap and furnace settings, which differed between screen and headless.

Die sets were rounded up inside a one-year amortisation.

The forging was priced at its finished weight, with no machining stock.

The secondary machining was cutting time alone, with no handling, change-over,
fixtures, programming or tool wear. That gap affected castings too.

Four geometry readings were wrong:
- The press closed across whichever silhouette a moulding draft check preferred:
  the yoke's 15 cm² end, not its 84 cm² plan.
- Any round part with a bore over 25% of its OD went to the ring mill.
- A bolt hole through an 18 mm flange on a 50 mm part read as blind.
- Every 13–26 mm hole was reamed, bolt-clearance holes included.

## 0. Test parts

| Part | Route | Geometry |
|---|---|---|
| Steering knuckle (real) | closed-die steel, safety-critical | 114 × 236 × 210 mm, 2.8 kg finished, 22 machined features |
| Control-arm yoke (**modelled**) | closed-die steel, safety-critical | two Ø50 eyes 200 mm apart, I-section arm, 5° draft, Ø22 bores |
| Hub flange (**modelled**) | closed-die steel | Ø140 flange, Ø80 hub, Ø60 bore, 6 × Ø14 bolt holes |

The modelled parts come from `cad-audit/parts/FORGE_modelled_parts.py`.
**They are not customer parts.** All three are in the real-parts baseline.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Cycle = strokes × 10 s.** The strokes were the kernel's face-count heuristic (4–12), recorded as "measured". | Knuckle 60 s on a 1,600 t press. | Forge-line takt: 3 s load from the heater + hits × 4 s (mechanical) or 8 s (hydraulic). Hits = impressions + 1 finisher hit (moderate) / + 2 (complex). Ring mill 30 s + 10 s/kg; open die 60 s + 20 s/kg; cold former 2 s. Knuckle: **15 s**. |
| 2 | **No flash trimming**, though the route says "Flash trim". | — | A trim press sized on the flash line (4.4 √A) × flash thickness (0.015 √A) × hot flow stress, from the mechanical press ladder. It runs in line at the forge takt with one operator. Only flash-making routes. |
| 3 | **Crew, labour, scrap, furnace** differed by path: crew screen 2 / headless 1; screen labour a machinist; scrap screen 0% / headless 3%; furnace screen resistance (×1.35 energy) / headless induction. | Knuckle screen £55.96 v headless £57.08. | Rules: crew 2 (closed-die), 3 (open die), 0.5 (cold former); forge labour; 2% scrap; induction for steel and titanium, gas for aluminium, copper and open die. Headless prices the furnace the rule chose. |
| 4 | **Die sets rounded up** inside one year: `ceil(volume ÷ die life)`. | Knuckle charged 2 sets for 1.28 sets' wear (+56% die cost). | Fractional above one set; the die wears into next year. |
| 5 | **Priced at the finished weight.** The STEP is the machined part. | Billet, heating, heat treat and descale all light. | As-forged weight = finished + holes drilled from solid + measured machining stock (closed-die 2 mm a side on the machined faces, precision 0.75, ring 3, open die 5). Bores > Ø25 are pierced. |
| 6 | **Press direction** was the moulding draw axis, chosen by undercuts on a one-way pull. | Undrafted yoke pressed across its 15 cm² end; drafted yoke across a 74.5 cm² side. | The largest of the three measured silhouettes (parting at the largest periphery), plus the flash land in the die-fill force. |
| 7 | **Ring rolling** for any round part with a bore ≥ 25% of its OD. | Hub flange (Ø80 hub on Ø140 flange) sent to the ring mill. | A ring must also fill ≥ 60% of its ring envelope. The hub fills 45% and is closed-die. Ring routes run on the ring mill; open die on a hammer. |
| 8 | **Secondary machining was cutting time only**, on castings and forgings. | — | `secondaryMachiningCell`, one function on both paths: load / unload per fixturing (by weight), 45 min change-over ÷ batch, fixtures, CAM programming and tool wear. Crew 0.5 while cutting, as the machining routes. |
| 9 | **"Through" meant spanning the whole part** along the hole axis. | Hub bolt holes through the 18 mm flange read blind and were billed a bottom pass. | Kernel probes a point on the axis just past each end: through = air at both ends. Probed once per hole (the gear's kernel time is unchanged at ~2 s). |
| 10 | **Every 13–26 mm hole reamed.** | Bolt-clearance holes billed a ream pass. | Drill only for a through hole ≤ 2 Ø deep (clearance); ream / bore for blind or deeper. |
| 11 | **Draw-axis ties** broken arbitrarily by the kernel. | — | Ties on undercuts go to the largest silhouette (all commodities; only tied parts change). |
| 12 | **Screen fill** preferred the kernel's stroke heuristic and its £126k face-count die, and sized the press on the two largest box sides. The panel's machining ran at OEE 0.85 / efficiency 0.90 against the shop's 0.80 / 0.92. A 15 s takt was written as 0.0042 h. | Screen £0.8–1.4 off headless. | Fill from the analysis; shop OEE in the feature panel; rule values below 0.01 written to six places. |

## 2. Before and after (headless, 50,000/yr)

| Part | Before | After |
|---|---|---|
| Steering knuckle | **£57.08** (60 s press, 1-man crew, 2 die sets) | **£44.02** (15 s takt, 2-man line + trim, 3.26 kg as-forged, machining cell) |
| Control-arm yoke | £47.59 | £47.60 (forging cheaper; machining cell and stock added) |
| Hub flange | **£46.22** (ring mill; Ø60 bore helical-milled from solid; bolt holes blind + reamed) | **£31.76** (closed die; bore pierced and finish-bored; bolt holes drilled) |
| Casting Bracket (cast + machine) | £45.76 | £41.35 (Ø13 holes through, not blind) |
| PRCR002 (cast + machine) | £51.79 | £49.78 (same) |

## 3. Hand reconciliation: hub flange, 50,000/yr

Library rates:

| Item | Rate |
|---|---|
| 38MnVS6 billet | £1.15/kg (scrap £0.20/kg) |
| 500 t forge press | £58.48/h |
| 100 t trim press | £15.88/h |
| VMC | £56.85/h |
| Forge labour | £24.17/h |
| Machinist | £26.19/h |
| Electricity | £0.268/kWh |

Scrap 2% (÷ 0.98); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| As-forged weight | 2.198 kg finished + 16.6 cm³ drilled + 65.4 cm³ stock (2 mm a side) = 2.842 kg | |
| Material | billet (2.842 + 0.284 flash) ÷ 0.743 = 4.207 kg; gross 4.293 kg × £1.15 − swarf and flash × £0.20 = 4.659; heating 0.35 kWh/kg × 4.207 × £0.268 = 0.395; normalise £0.30/kg × 2.842 = 0.853; descale £0.12/kg × 4.207 = 0.505; tool wear 10.5 min × £0.12 = 1.264 | 7.674 |
| Process | Forge 11 s on 500 t = 0.228; trim 11 s on 100 t = 0.062; machining 0.1755 h on VMC = 12.469; cell 0.0206 h = 1.464 | 14.223 |
| Labour | Forge 2 crew = 0.164; trim 1 = 0.082; machining 0.5 crew = 2.498; cell 1 = 0.586 | 3.330 |
| Tooling | (£25,430 die × 50,000 ÷ 50,479 + £5,182 fixtures and programming) ÷ 50,000 | 0.612 |
| Packaging + logistics | | 0.47 |
| Overhead 12% of £25.839; margin 8% of £29.410 | | 3.101 + 2.353 |
| **Total** | | **31.76** |

## 4. Live in a browser

Real server and browser, every field identical:

| Part | Screen | Headless |
|---|---|---|
| Knuckle | **£44.02** | **£44.02** |
| Hub flange | **£31.76** | **£31.76** |
| Yoke | **£47.60** | **£47.60** |

Before the review, the screen had the knuckle at £55.96 against £57.08 headless.

## 5. Second pass — a standard forging should-cost, line by line

| Element | Status |
|---|---|
| Billet weight from finished + stock + flash + yield | Done (#5; yield band per route) |
| Billet cut-off (saw / shear) | **Open** — no billet saw or bar shear in the rate library |
| Heating energy by furnace | Done (#3); heater capital is not a machine-rate line (**open**) |
| Forging press sized on die-fill force incl. flash land | Done (#6) |
| Forge cycle by hits and transfer | Done (#1) |
| Trimming / piercing | Done (#2); piercing is in the trim stroke |
| Crew | Done (#3) |
| Die cost (toolmaker build-up) and die life | Existing build-up kept; sets fractional (#4) |
| Die resink / maintenance | **Open** — die life is per set; resinking is not separated |
| Heat treat, descale / shot blast, NDT | Existing rules (normalise / Q&T by alloy, MPI / UT / CT when safety-critical) |
| Coining / sizing | On the form, not chosen from CAD (needs a tolerance callout) |
| Secondary machining with its cell | Done (#8–#10) |
| Scrap | Done (#3) |

## 6. Still open, stated rather than hidden

- **Every constant is engineering-typical:**
  - hit time, load time, crew, scrap, machining stock, pierce size, flash
    thickness and land, ring fill, furnace choice
  - fixture and programming figures

  All are printed on each basis. **None has been compared with a forge quote.**
- **Which faces are machined** is the kernel's large-planar-face table. A
  drafted forging's flat flange tops can appear in it (the modelled yoke's
  machining is high for that reason). Untick them in the machined-features panel
  on screen; headless takes the default.
- **The draft analysis assumes a one-way pull.** A part parted mid-height reads
  its lower drafted walls as undercuts. Forging no longer depends on it (#6), but
  casting slides and moulding side actions still count those undercuts.
- **The flash outline is estimated** (4.4 √A); the kernel measures the area, not
  the perimeter.
- **No billet saw, induction heater or dedicated trim press** in the library; the
  trim runs on the stamping press ladder.
- **The modelled parts are not customer parts.**

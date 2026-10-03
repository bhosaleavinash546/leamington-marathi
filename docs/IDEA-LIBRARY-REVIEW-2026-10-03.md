# Review of the 500 marketplace ideas added on 3 October 2026

Scope: the three packs added that day.
- `marketplace-luxury-suv-mhev-bev-ideas.json`: 300 ideas.
- `marketplace-mhev-48v-ideas.json`: 100 ideas.
- `marketplace-mhev-48v-deep-ideas.json`: 100 deep ideas.

Method, in two passes.
1. **A mechanical audit of all 500**, using the app's own tools: `idea-depth.mjs`
   (the depth rubric) and `idea-arith.mjs` (the arithmetic re-check). It also
   checked text hygiene, source quality and saving outliers.
2. **An engineering review of every idea.** Five reviewers each read 100
   ideas in full. They checked the physics, the grades and standards, the
   arithmetic, how honest the benchmark claims are, internal consistency, and
   whether the idea is useful. Each idea got a score from 1 to 5, and each
   finding came with a verbatim fix where a text change resolved it.

## 1. Verdict

**The engineering vocabulary is strong; the business cases were the weak
point.** Grades, standards and process routes are mostly right, and most
benchmarks match their sources. The scores, given before any fixes:

| Score | Ideas | Meaning |
|---|---|---|
| 5 | 3 | Fit to show a director as is |
| 4 | 291 | Useful, minor fixes |
| 3 | 171 | Useful, needs work |
| 2 | 34 | Serious problem |
| 1 | 1 | Should be removed |

The mean was 3.52. There were 447 distinct findings:

| By severity | Count | By category | Count |
|---|---|---|---|
| Critical | 15 | Arithmetic | 142 |
| Major | 225 | Physics / engineering | 95 |
| Minor | 207 | Consistency | 77 |
| | | Usefulness | 42 |
| | | Benchmark | 31 |
| | | Grade / standard | 30 |
| | | Wording | 30 |

## 2. Systemic problems and how each was handled

| # | Problem | Fix |
|---|---|---|
| S1 | **Single-powertrain savings booked over the whole fleet.** About 80 BEV-only or MHEV-only ideas multiplied a per-affected-vehicle figure by all 50,000 vehicles. The cause was the research brief, which fixed the volume at 50,000 without saying how to handle the powertrain mix. | Rescaled to a fleet average at a 50% mix: per-vehicle, annual value and the calculation basis were changed together. The 48 V packs were already written per 50,000 MHEV vehicles, which is consistent. |
| S2 | **Option and trim savings booked as if every car had the option** (lidar, off-road pack, top power rating, diesel only). | Scaled by the stated take rate where the reviewer gave one. Otherwise flagged as an open review point. |
| S3 | **Savings counted in several ideas, and incompatible architectures.** The 48 V ideas assume different machines (P0 belt BSG, P2 in the 8-speed, P1 crank ISG), different starter strategies and different cooling, and some spend the same saving twice. | Every 48 V idea now carries `architectureAssumed` (shown as a tag). Every idea states that savings are **not additive** across ideas. |
| S4 | **Quoted range wider than the calculation** (for example net €3.2-3.8 quoted as €3-5), and **capex left out** (for example €5-6M of jet-paint robots). | Corrected where the reviewer gave a verbatim fix. Otherwise left as an open review point. |
| S5 | **Straw-man baselines**: the "baseline" is already industry practice (ultrasonic splices, brushless fans, microchannel R744 tubes, cold-formed ball studs). | Re-baselined where possible. Otherwise left as an open review point. |
| S6 | **Wrong standards and designations.** ISO 4925 is a brake-fluid specification; SAE J2843 covers R-1234yf service equipment; DIN 983 is shaft rings; "200 (H+)" is not an IEC 60085 class; there are IPC-2221 column mix-ups. | Corrected. |
| S7 | **Physics errors that change the conclusion.** Examples: ~35 K, not 4-6 K, through a thicker pad; a 14s NMC string above the 54 V limit; a 450 A sag below 36 V; skin effect not negligible; belt-BSG torque overstated; a P2 motor "rigidly coupled" to the crank. | Corrected, or the idea was removed (§3). |

## 3. What changed

- **456 verbatim fixes** on 233 ideas, at every severity. Each was applied
  only where its exact text was found.
- **17 ideas removed.** Their case did not survive review: physics that
  cannot work, a negative or near-zero saving, a payback beyond the
  programme, or something not feasible as described.
  - They are listed with reasons in `marketplace-retired-ideas.json`.
  - The server **retires** them on boot (`status='retired'`), so a database
    seeded earlier stops showing them too.
  - Verified on a real upgrade: 2,743 ideas before, 2,726 after.
- **53 ideas annotated** with open review points: findings that need an
  engineer's judgement rather than a text swap. Each point is written into
  `riskNotes` and shown in the detail panel as an amber "open review point"
  tag, so the caveat stays with the idea.
- **Pack sizes now:** luxury 288 (84 / 107 / 97), 48 V 99 (30 / 35 / 34),
  48 V deep 96 (30 / 32 / 34).

## 4. Still true after the fixes

- **The app's arithmetic checker flags 99 + 28 + 11 ideas as "mismatch".**
  Spot checks show these are parser misreads. The checker multiplies an
  intermediate figure (per BEV, per wheel, before the take rate) by 50,000
  and skips the "× 50% mix" step. The prose arithmetic and the pack test
  (per-vehicle × 50,000 = annual value, and the cost bridge nets to the
  saving) both pass.
  - Next step: teach `idea-arith.mjs` to read share and take-rate
    multipliers.
- **Depth differs by pack.** The deep pack scores 100 on the depth rubric.
  The first two packs score 64, because they have no engineering block.
  - Next step: upgrade those 387 ideas to the deep format.
- **Sources are thin.** About 143 citations are forum, wiki or aftermarket
  pages; 39 ideas rest on one source; facts come from search summaries.
  - Every source is flagged unreviewed, and none supports a saving.

## 5. The best ideas, by the reviewers' own picks

- Brake-hose and wheel-speed-sensor lead sharing one guide.
- Induction-hardened Cf53 half-shaft.
- Long-stroke tripod instead of a ball-spline half-shaft.
- Aluminium 70 mm² DC cable to the rear drive unit.
- 48 V heated catalyst traded against platinum-group-metal loading.
- Diesel starter downgraded to standard duty.
- Coated windscreen (sheet-resistance maths checks out).
- Regeneration without brake-by-wire (UN R13-H thresholds right).
- Boundary-scan instead of in-circuit test.
- Resistance-pulse (DCIR) end-of-line test instead of a full capacity cycle.
- No-load excitation-curve end-of-line test.
- Single-shunt current sensing on the e-compressor.

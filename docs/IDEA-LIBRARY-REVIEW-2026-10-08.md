# Interior / Exterior / BIW / Chassis idea pack: research and review (8 October 2026)

`marketplace-interior-exterior-biw-chassis-ideas.json` holds **397 ideas**
for the luxury-SUV platform shared by the MHEV (48 V, 3.0 L I6) and the
800V BEV, at 50,000 vehicles a year.

**Counts:**

| Commodity | Ideas |
|---|---|
| Interior | 100 |
| Exterior | 100 |
| BIW | 99 |
| Chassis | 98 |

| Level | Ideas |
|---|---|
| Assembly / technology | 120 |
| Subassembly | 141 |
| Part | 136 |

| Powertrain | Ideas |
|---|---|
| Both (shared platform) | 356 |
| 800V BEV only | 29 |
| MHEV only | 12 |

28 ideas are tagged off-road.

## How the ideas were made

Eight research batches of 50 each covered:
- seating, steering wheel and restraints;
- cockpit, trim, HVAC and storage;
- fascias, grilles, lamps, mirrors, handles and paint;
- roof, glazing, wipers, sealing, aero, underbody and towing;
- body structure, crash structures, sills, pillars, roof and battery protection;
- closures, joining, sealing, e-coat, tooling and mixed-material joints;
- subframes, arms, air suspension, roll control, bushes and hubs;
- steering, brakes, wheels and tyres, and off-road chassis hardware.

Every idea carries the following:
- **Benchmark:** a named 2023–2026 vehicle with the web source for that
  benchmark fact, flagged unreviewed. Sources support the benchmark, never
  the saving.
- **Grades and process:** exact material grades and standards, and the
  process route from baseline to proposal.
- **Cost bridge:** at least four lines that net to the stated saving, with
  tooling, capex and validation, and a payback that reconciles.
- **Volume:** the per-vehicle saving × 50,000 equals the annual value, and
  single-variant ideas state their take rate.

Each batch passed the duplicate gate (`scripts/check-idea-dupes.mjs`)
against the whole library, about 2,000 ideas, and against its sibling
batches.

## Engineering review

Four commodity reviewers read all 400 ideas in full. A fifth reviewed the 22
replacements, and also searched the library by keyword for concepts reworded
past the automatic gate.

- **262 findings in the first round:**
  - by severity: 6 critical, 104 major, 152 minor;
  - by category: physics 79, consistency 64, arithmetic 50, safety and
    homologation 32, grade and standard 15, usefulness 12, benchmark 10.
- **Fixes:** 306 verbatim fixes were applied, each only where its exact text
  was found.
  - Two ideas had their money corrected, with every linked field changed
    together: the magnesium cross-car beam (€16–18 per vehicle) and the
    recycled-PET knit family (€7–9).
  - All other fixes changed wording.
- **Open points:** 62 findings need an engineer's judgement. They were
  written onto the idea's `reviewOpenPoints` and `riskNotes`, as in
  DECISIONS 116, and appear as a tag in the idea panel.
- **Retirements:** 25 ideas were retired before seeding, so they never reach
  a database and need no entry in `marketplace-retired-ideas.json`. Every
  idea scoring 2 or lower, or marked retire, went, for one of these reasons:
  - **safety regressions:** a steel floor relied on as the thermal-runaway
    barrier; venting runaway gas through the sill beside the egress path;
    brakes sized on regen being available; downgraded off-road skid and fuel
    guards;
  - **broken physics:** a headliner duct carrying 3 kW of rear HVAC; a
    one-piece inductive damper sensor through steel tubes; torque-rod
    deletion by lateral spacing; an EPS stack that needs more current;
  - **illusory savings:** mass credits that ignore the parts added; a crush
    rail gauged down beyond what its yield can recover; an "OEM" saving that
    the customer actually pays;
  - **duplicates:** two replacements were the same concept as live library
    ideas under new words (skid-plate fixings, wheel downsizing).
- **Replacements:** 22 replacements were written, with the retirement
  reasons as their brief, and three of them were retired in turn.
  - The pack is therefore three ideas short of 400: BIW 99, Chassis 98.

## Rules this pack makes explicit

- **Take rate:** single-variant savings are per affected vehicle, with the
  take rate stated. Thirteen BIW and eight Exterior ideas had multiplied a
  per-variant figure by the whole fleet; their calculation bases now say so.
- **Fail-safe functions:** friction brakes, steering, restraints and crash
  structure must stand alone. No saving may assume software or regen will
  be available.
- **Not additive:** ideas that are alternatives say so, as do all packs.

## Evidence caveats

The proxy blocked page fetches, so every benchmark fact comes from search
snippets.
- **Loose anchors:** about one idea in eight anchors on a related fact
  rather than the same feature. Their technical text says "general
  practice", and the anchor's difference field explains the link.
- **Low-confidence sources:** dealer listings, forums and parts retailers
  are marked `confidence: low`.

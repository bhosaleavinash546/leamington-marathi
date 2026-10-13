# Off-Road Features idea pack: research and review (13 October 2026)

`marketplace-offroad-features-ideas.json` holds **295 ideas** for the luxury
off-road SUV: the shared MHEV (48 V, 3.0 L I6) / 800V BEV platform at 50,000
vehicles a year.
- Every idea is filed under the new **Off-Road Features** marketplace
  commodity (DECISIONS 127) and tagged off-road.
- The existing 300-idea off-road luxury pack moved into the same tab, which
  now holds **595 ideas**.

## What is in the pack

| Area | Sub-systems (ideas) |
|---|---|
| Traction and drive | Locking Differentials 17 · Low Range & Transfer 17 · Torque Vectoring & Tank Turn 15 |
| Terrain and software | Terrain Management 22 · Off-Road Driver Assist 13 · Off-Road HMI & Software 15 |
| Ride height and wheels | Off-Road Air Suspension 16 · Articulation & Anti-Roll Disconnect 17 · Off-Road Wheels & Tyres 15 |
| Protection and recovery | Underbody Protection 18 · Battery Armour (BEV) 16 · Recovery & Towing 14 |
| Water and vision | Wading & Water Management 27 · Off-Road Vision 23 |
| Exterior, roof, thermal | Off-Road Geometry & Bumpers 16 · Roof Load & Expedition 18 · Off-Road Thermal Management 16 |

- **Levels:** 87 assembly / technology, 106 subassembly, 102 part.
- **Powertrain:** 183 shared-platform, 56 MHEV only, 56 800V BEV only.

**Every idea carries:**
- **Benchmark:** a named 2023–2026 off-road or luxury SUV, such as Defender,
  G 580 EQ, Land Cruiser 250, GX Overtrail, Bronco, Hummer EV, R1S,
  Cybertruck or Yangwang U8, with the web source for that fact (flagged
  unreviewed).
- **Grades and process:** exact material grades and the process route.
- **An engineering check in the text:** strike or drop energy, recovery load
  (about 2.5 × GVW), ρgh at the wading depth, descent heat (m·g·h), or wheel
  torque in low range.
- **Take-rate scaling:** off-road-pack savings are scaled by a stated take
  rate.
- **Cost bridge:** at least four lines, with investment and a reconciled
  payback.

## Review

Six reviewers read the 300 ideas in full, one per batch. A seventh reviewed
the replacements. Besides physics, arithmetic, grades and safety, each
reviewer checked for:
- weakened protection or recovery strength;
- fail-safes that depend on software;
- capability cuts that ignore lost revenue;
- take-rate scaling;
- duplicates by meaning, searched against the library and the existing
  off-road pack.

**Findings, first round:** 328 in total.
- By severity: 9 critical, 106 major, 213 minor.
- By category: physics 101, consistency 67, arithmetic 51, safety 37,
  duplicate 16, grade 14, capability 12, benchmark 10, usefulness 10, other 12.

**Fixes and open points:** 304 fixes were applied, each only where its exact
text was found. 77 findings that need an engineer's judgement are written
onto 72 ideas as review open points, shown as a tag in the idea panel.

**Retirements:** 28 ideas in the first round. Every idea scoring 2 or lower,
or marked retire, went.

| Reason | Examples |
|---|---|
| Duplicates by meaning (9) | Existing library ideas reworded past the automatic gate |
| Protection or fail-safe regressions | 4 mm armour plus doublers instead of 6 mm; a 0.4 mm reflector replacing a catalyst strike plate; an armour edge trimmed 70 mm short; a rear locker that stays latched after a power loss at road speed; park locks on half the wheels; a parking-brake-only hold on steep loose ground; a wheel change that needs working air suspension |
| Capability cuts that ignore lost revenue | Deleting the quad-motor variant; bundling paid software options; dropping beadlock capability; counting a paid ladder accessory as a saving |
| Illusory savings | A payback at or beyond the 84-month programme life; savings that collapse at realistic prices |

**Replacements:** 28 were written, with the retirement reasons as their
brief, and 5 of them were retired in turn:
- 4 effective duplicates;
- an armour idea that deleted 12 central bolts. Its energy balance did not
  hold (about 338 J against 474 J), and it loaded the sealed IP67 pack cover.

By DECISIONS 125 (one replacement round, then stop), the pack ships at 295.

## Read with care

- **Assumed baselines.** The OEMs do not publish their strike cases or
  armour gauges. The assumed cases are labelled "(assumed)" in each idea,
  and the protection ideas need CAE and drop-rig confirmation before use.
- **Evidence.** Benchmark facts come from search snippets. Low-confidence
  sources (forums, dealer and aftermarket pages) are marked low.
- **Not additive.** Savings are not additive: several ideas are explicit
  alternatives, and their risk notes say so.

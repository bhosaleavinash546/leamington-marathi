# Geometric DFM — review sheet, six real parts


Every finding below was produced by measuring the CAD file, with no costing result
and no AI involved. Each names the B-rep faces that triggered it and cites the
published source of its threshold.

**Please mark each finding T (true — real and worth raising), F (false — wrong or
not a real issue), or N (noise — true but not worth an engineer's time).**

A false positive costs more trust than a missed finding, so any rule that collects
an F is a candidate for deletion rather than tuning. Please also note anything the
tool should have caught and did not — that is the MISSED list at the end of each part.
## Summary

| Part | Commodity | Pack? | Features | Issues | Instances | Not-checked | Kernel |
|---|---|---|---|---|---|---|---|
| RH steering knuckle | casting | yes | 172 | 4 | 98 | 4 | 2s |
| Stub axle (PRCR002) | forging | **no** | 128 | 0 | 0 | 1 | 3s |
| 25T servo horn | machining | yes | 105 | 2 | 5 | 4 | 1s |
| Front bumper | injection_moulding | yes | 6 | 2 | 6 | 4 | 11s |
| Seat LH cross-member | sheet_metal | yes | 124 | 1 | 2 | 5 | 3s |
| Fuel tank | blow_moulding | **no** | 905 | 0 | 0 | 1 | 71s |

> **2 of 6 parts have no geometric pack** (forging, blow_moulding). Those commodities are not covered yet, and the tool says so rather than returning an empty clean bill.


## RH steering knuckle

| | |
|---|---|
| File | `d8d13088-steering_knuckle_RH.stp` |
| True commodity | casting (gravity) |
| Independent manual cost | ~£16–18 |
| Bounding box | 116 × 237 × 210 mm |
| Faces measured | 310 |
| Features extracted | 172 |
| Wall analysis valid | yes |
| Kernel time | 2 s |

| # | Sev | Issue | Instances | Measured range | Threshold | Source | T/F/N |
|---|---|---|---|---|---|---|---|---|
| 1 | major | Wall below minimum draft for the casting route | 60 | draftDeg 0 … 0° | < 1° | ASM Handbook Vol. 15, Casting — permanent mould (gravit |   |
| 2 | major | Abrupt section change | 18 | sectionRatio 2.364 … 8.54:1 | > 2:1 | ASM Handbook Vol. 15, Casting — design for solidificati |   |
| 3 | major | Undercut face — needs a slide or a core | 6 | angleToDrawDeg 97.37 … 135° | > 90° | NADCA Product Specification Standards for Die Castings |   |
| 4 | minor | Sharp internal corner | 14 | radiusMm 0.25 … 0.25mm | < 1mm | ASM Handbook Vol. 15, Casting — fillets and corner radi |   |

**1. Wall below minimum draft for the casting route** — 60 instance(s)

- Worst case: Face 1 draws at 0.00° against a 1° minimum for gravity.
- Faces: 1, 4, 9, 12, 18, 19, 22, 23, 31, 32, 33, 34, 46, 47, 48, 49, 53, 57, 60, 71, 88, 90, 97, 105 … (60 total)
- Fix: Add draft to at least 1° per side, or accept the ejection drag and the die wear it causes.
- Source: ASM Handbook Vol. 15, Casting — permanent mould (gravity die) casting design
- Note: Gravity die is a permanent metal mould, not a rammed sand mould, and has its own draft practice — aliasing it to sand would cite the wrong process. Published band 1°–3° per side; the lower bound is used.

**2. Abrupt section change** — 18 instance(s)

- Worst case: Section steps 8.54:1 at face 289 (24.4 mm against an adjacent 2.9 mm).
- Faces: 22, 23, 47, 48, 71, 129, 131, 132, 146, 179, 202, 210, 217, 218, 256, 257, 259, 289
- Fix: Blend the transition with a taper or a generous fillet so the section changes gradually; expect shrinkage porosity at the junction otherwise.
- Source: ASM Handbook Vol. 15, Casting — design for solidification
- Note: A thick-to-thin ratio above ~2:1 across a junction concentrates solidification shrinkage and residual stress. Widely published as a 2:1 guideline; blended transitions are the standard remedy.

**3. Undercut face — needs a slide or a core** — 6 instance(s)

- Worst case: Face 186 sits at 135.0° to the draw (past 90°, so its normal opposes withdrawal) and cannot release on the main parting.
- Faces: 61, 186, 241, 289, 295, 300
- Fix: Re-orient the parting line, or price a slide/core for this feature and carry the die cost and cycle penalty explicitly.
- Source: NADCA Product Specification Standards for Die Castings — Undercuts and moving die components
- Note: Any face whose normal opposes the draw cannot release on the main parting; it requires a slide, a loose piece or a core, each of which adds die cost and cycle time.

**4. Sharp internal corner** — 14 instance(s)

- Worst case: Fillet at face 100 is R0.25 mm — effectively a sharp internal corner.
- Faces: 89, 94, 96, 98, 100, 102, 106, 108, 110, 112, 114, 116, 118, 120
- Fix: Increase the fillet toward half the adjoining wall thickness to relieve the stress concentration and the local hot spot.
- Source: ASM Handbook Vol. 15, Casting — fillets and corner radii
- Note: Internal corners are stress raisers and hot spots. Common guidance is a fillet of roughly half the local wall; a radius under ~1 mm is treated as effectively sharp.

**DFA (Boothroyd, geometric half):** handling 1.63s + insertion 8.5s = **10.13s**, 3.38× the 3 s ideal part.

- +0.5s — Asymmetric envelope — the part must be oriented before insertion _(bounding box 116×237×210 mm, no two dimensions within 5%)_
- +7s — Fasteners approach from more than one direction — the part must be re-oriented or the fixture indexed during assembly _(11 distinct hole axes across 44 holes)_

**What was NOT checked:**

- Tolerance and datum callouts were not checked — they live on the drawing, not in the solid.
- Parting-line position was assumed to lie perpendicular to the draw direction; a different parting choice changes which faces are undercuts.
- Machining stock allowance on cast surfaces was not assessed — it is a process decision, not a measurable feature.
- Gating and feeding layout was not evaluated; hot spots are reported, but where to place risers is a foundry decision.

**MISSED — what should this have caught and did not?**

1. 
2. 
3. 

## Stub axle (PRCR002)

| | |
|---|---|
| File | `ee3d48dc-PRCR002.stp` |
| True commodity | forging |
| Independent manual cost | ~£30 |
| Bounding box | 277 × 223 × 182 mm |
| Faces measured | 364 |
| Features extracted | 128 |
| Wall analysis valid | yes |
| Kernel time | 3 s |

> **No geometric rule pack for `forging`.** No geometry-based checks ran.
> This is stated rather than silently returning zero findings.

## 25T servo horn

| | |
|---|---|
| File | `ed1e77f6-Aluminium_25T_Servo_Horn.step` |
| True commodity | machining |
| Independent manual cost | ~£2.2 |
| Bounding box | 47 × 10 × 8 mm |
| Faces measured | 210 |
| Features extracted | 105 |
| Wall analysis valid | yes |
| Kernel time | 1 s |

| # | Sev | Issue | Instances | Measured range | Threshold | Source | T/F/N |
|---|---|---|---|---|---|---|---|---|
| 1 | minor | Hole deeper than standard drill reach | 1 | ldRatio 6.36:1 | > 5:1 | Machinery's Handbook — drilling: depth-to-diameter limi |   |
| 2 | advisory | Non-preferred hole diameter — special tool | 4 | diaMm 4.9 … 6.1mm | > 5mm | Machinery's Handbook — standard twist-drill diameters ( |   |

**1. Hole deeper than standard drill reach** — 1 instance(s)

- Worst case: ⌀2.5 mm hole is 15.9 mm deep — 6.4:1 depth-to-diameter.
- Faces: 112, 113, 114, 115, 116, 117
- Fix: Beyond ~5:1 needs peck-drilling or extended-reach tooling — slower cycle, higher tool cost and greater breakage risk. Open the diameter if the function allows.
- Source: Machinery's Handbook — drilling: depth-to-diameter limits and standard drill sizes
- Note: Standard jobber drills reach ~5×D; parabolic / coolant-through tooling reaches ~10×D; beyond that gun drilling. Reported at the point the process and the cost step.

**2. Non-preferred hole diameter — special tool** — 4 instance(s)

- Worst case: ⌀6.10 mm is not a standard drill size; nearest is ⌀6 mm.
- Faces: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 … (53 total)
- Fix: If the fit allows, move to ⌀5 mm and save a special tool or a separate bore/ream cycle.
- Source: Machinery's Handbook — standard twist-drill diameters (metric series)
- Note: A diameter off the standard series needs a special or a bore/ream cycle instead of a single drilled pass. Tolerance ±0.05 mm on the match.

**DFA (Boothroyd, geometric half):** handling 1.13s + insertion 1.5s = **2.63s**, 0.88× the 3 s ideal part.


**What was NOT checked:**

- Tolerance and surface-finish callouts were not checked — they are on the drawing, not in the solid, and they drive whether a feature is milled, ground or honed.
- Tool access and fixturing were not simulated: a feature can be geometrically fine and still unreachable in the chosen setup.
- Thread specifications were not verified against standard tap sizes.
- Workholding and part distortion under clamping were not assessed.

**MISSED — what should this have caught and did not?**

1. 
2. 
3. 

## Front bumper

| | |
|---|---|
| File | `edd2f685-BUMPER.stp` |
| True commodity | injection_moulding |
| Independent manual cost | ~£8–9 |
| Bounding box | 1691 × 647 × 528 mm |
| Faces measured | 498 |
| Features extracted | 6 |
| Wall analysis valid | yes |
| Kernel time | 11 s |

| # | Sev | Issue | Instances | Measured range | Threshold | Source | T/F/N |
|---|---|---|---|---|---|---|---|---|
| 1 | major | Undercut — needs a side action or lifter | 4 | angleToDrawDeg 91.08 … 91.54° | > 90° | Injection-moulding design guidelines (widely published; |   |
| 2 | minor | Moulded wall below minimum draft | 2 | draftDeg 0.04 … 0.04° | < 0.5° | Injection-moulding design guidelines (widely published; |   |

**1. Undercut — needs a side action or lifter** — 4 instance(s)

- Worst case: Face 144 sits at 91.5° to the draw (past 90°) and cannot eject on the main parting.
- Faces: 144, 187, 258, 319
- Fix: Re-orient the parting, redesign the feature to draw, or price a slide / lifter — each adds mould cost and lengthens the cycle.
- Source: Injection-moulding design guidelines (widely published; e.g. Protolabs / Xometry design-for-moulding guides and the Plastics Design Library handbook) — Undercuts and moving mould components
- Note: These are industry design-guide figures rather than a formal standard, and are stated as such so an engineer can argue with the number rather than with the tool.

**2. Moulded wall below minimum draft** — 2 instance(s)

- Worst case: Face 218 draws at 0.04° against a 0.5° minimum.
- Faces: 218, 284
- Fix: Add draft to at least 0.5° per side — more if the face is textured, roughly 1° per 0.025 mm of texture depth. Otherwise expect ejector drag marks.
- Source: Injection-moulding design guidelines (widely published; e.g. Protolabs / Xometry design-for-moulding guides and the Plastics Design Library handbook) — Draft ≥ 0.5° per side on untextured walls; more with texture
- Note: These are industry design-guide figures rather than a formal standard, and are stated as such so an engineer can argue with the number rather than with the tool.

**DFA (Boothroyd, geometric half):** handling 2.63s + insertion 1.5s = **4.13s**, 1.38× the 3 s ideal part.

- +1.5s — Large part — two-handed handling or mechanical assistance _(largest dimension 1691 mm > 380 mm)_

**What was NOT checked:**

- Gate position and flow length were not evaluated — they are a tooling decision, not a feature of the solid.
- Weld-line position was not checked; whether a knit line falls on a functional or cosmetic face is a moulding-simulation question.
- Texture depth was not read, so the draft threshold applied is the untextured minimum — a textured face needs roughly 1° more per 0.025 mm of texture depth.
- Resin shrinkage and warp were not modelled; those need the material and a flow analysis.

**MISSED — what should this have caught and did not?**

1. 
2. 
3. 

## Seat LH cross-member

| | |
|---|---|
| File | `97fb714b-Seat_LH_Cross_Member.stp` |
| True commodity | sheet_metal |
| Independent manual cost | ~£1.4 |
| Bounding box | 85 × 341 × 72 mm |
| Faces measured | 330 |
| Features extracted | 124 |
| Wall analysis valid | yes |
| Kernel time | 3 s |

| # | Sev | Issue | Instances | Measured range | Threshold | Source | T/F/N |
|---|---|---|---|---|---|---|---|---|
| 1 | advisory | Hole depth inconsistent with a sheet part | 2 | ldRatio 9.537 … 20.546:1 | > 3:1 | Sheet-metal design guidelines (widely published; e.g. X |   |

**1. Hole depth inconsistent with a sheet part** — 2 instance(s)

- Worst case: ⌀3.8 mm hole is 78.1 mm deep (20.5:1) — deeper than a punched sheet feature.
- Faces: 80, 81, 224, 228, 233, 300, 304
- Fix: Confirm this is a formed collar / extruded hole rather than a punched one — the two cost very differently. If it is a plain hole, the part may not be sheet metal.
- Source: Sheet-metal design guidelines (widely published; e.g. Xometry / Protolabs sheet-metal design guides, and Machinery's Handbook press-working sections) — Punched features in thin material
- Note: Industry design-guide figures rather than a formal standard, stated as such so the threshold can be argued with directly.

**DFA (Boothroyd, geometric half):** handling 1.13s + insertion 16.9s = **18.03s**, 6.01× the 3 s ideal part.

- +15.399999999999999s — Fasteners approach from more than one direction — the part must be re-oriented or the fixture indexed during assembly _(23 distinct hole axes across 37 holes)_

**What was NOT checked:**

- Bend-to-hole distance was not checked: the kernel measures bend COUNT and total bend length but does not yet emit per-bend lines, so the distance from each hole to its nearest bend cannot be computed.
- Flange length against tooling minimum was not checked, for the same reason.
- Bend relief at notches was not checked — it needs per-bend endpoints.
- Bend radius against material thickness was not checked — it needs the per-bend inner radius.
- Blank utilisation was not checked — it needs a flat pattern, which the kernel does not unfold.

**MISSED — what should this have caught and did not?**

1. 
2. 
3. 

## Fuel tank

| | |
|---|---|
| File | `b7a8495b-Fuel_tank.STEP` |
| True commodity | blow_moulding |
| Independent manual cost | ~£20–30 |
| Bounding box | 1528 × 658 × 594 mm |
| Faces measured | 3444 |
| Features extracted | 905 |
| Wall analysis valid | yes |
| Kernel time | 71 s |

> **No geometric rule pack for `blow_moulding`.** No geometry-based checks ran.
> This is stated rather than silently returning zero findings.

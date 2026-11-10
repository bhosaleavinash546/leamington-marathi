# steering_knuckle_RH — independent reference should-cost (comparison B)

UK, 200,000/yr × 5 yr, ex-works, 10 Nov 2026. Rates: the application's UK rate book (ids in the JSON). Method: own engineering — no application costing code read or run.

**Total: £9.16 per part** (range £8.36 – £10.26).

## Route
Green-sand vertically parted flaskless moulding, EN-GJS-400-15 as-cast, no cores; machined on a twin-pallet 4-axis HMC (2 clampings).

- CHOSEN: ductile iron EN-GJS-400-15 green sand. Reasons: fill ratio 0.063 (spindly, branched arms in three directions) — near-net in sand with a 2-part mould and no cores (only 1 undercut face measured), the lowest-cost route at 200k/yr; ductile iron gives 15 % elongation (safety part) without heat treatment.
- ALTERNATIVE 1 — forged steel (e.g. 38MnVS6): 2.80 kg finished (density 7.85 vs 7.10), a branched part with S ≈ 0.06 (EN 10243-1 complexity class S4) needs a large flash (typically ≥ 30 % of billet) and a multi-impression die; the bearing bore would be pierced and arms bent/forged in several directions — material alone ≈ (2.8 kg + ~20 % stock + ~35 % flash) ≈ 4.5 kg bar × £1.15 ≈ £5.2 vs £1.06 of iron charge here; expected +£5–8/part. Not costed in detail.
- ALTERNATIVE 2 — aluminium (gravity / squeeze cast A356-T6, ~0.96 kg + section increase ~30 % for stiffness): lighter (unsprung mass) but metal at ~£2.98/kg and T6; expected +£3–6/part vs iron. Not costed in detail.

## Allowance and raw shape
- ISO 8062:1994 Table 2 (RMA) + Table 1 (CT) (S1): largest 236.4 mm → band 160–250; RMAG F = 2.0 mm; CT10 = 4.0 mm → 3.0 mm/side
- Nominal stock per side: 3.0 mm. external: R = F + 2·RMA + CT/2; internal: R = F − 2·RMA − CT/2 → nominal stock per side = RMA + CT/4 (casting tolerance kept separate: the cast surface may lie anywhere in ±CT/2 about R)
- Raw shape: finished CAD + nominal stock on every machined face and bore + drilled holes filled; mass from volume × rate-book density
- Weights: raw 3.096 kg, finished 2.528 kg, removed 0.568 kg (18.3 % of raw).

## Machining route
| Op | Machine | Clamping / datum | Cut min | Non-cut min | Cycle min | Machines |
|---|---|---|---|---|---|---|
| OP10 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | hydraulic fixture: bearing-bore axis horizontal; located on cast datum targets (bore core print area, strut lug, lower arm); datum: cast datums → bearing bore + hub face become the datum system for OP20 | 2.92 | 1.88 | 4.81 | 4 |
| OP20 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | hydraulic fixture on the finished bearing bore (expanding mandrel) + hub face, Z axis horizontal; datum: bearing bore + hub face | 0.86 | 1.03 | 1.89 | 2 |

Total machining cycle 6.70 min (cutting 3.78 min). Axis choice per op is in the JSON (`axes`); every feature row carries vc / fz / fn and its source.

## Material balance (per good finished part)
- IN pig iron + steel scrap + FeSiMg charge (solid): 3.2397 kg
- OUT finished part: 2.5283 kg — product
- OUT machining swarf: 0.5739 kg — recoverable (sold £0.15/kg)
- OUT scrapped machined parts: 0.0255 kg — recoverable (sold)
- OUT melt loss on new charge (2 %, inside the rate-book £/kg): 0.0648 kg — non-recoverable
- OUT remelt loss on returns (2 %): 0.0472 kg — non-recoverable
- (internal) gating + feeders + scrapped castings, remelted in-house: 2.3595 kg
- Closure: 0.0 g; recoverable 0.5994 kg, non-recoverable 0.1120 kg

## Cost build-up (£/part)
| Category | £ |
|---|---|
| raw material | 1.064 |
| primary | 1.536 |
| tooling | 0.116 |
| secondary | 0.709 |
| inspection | 0.547 |
| scrap/recovery | 0.009 |
| machining | 3.441 |
| setup | 0.018 |
| overhead | 0.893 |
| packaging | 0.150 |
| margin | 0.679 |
| **total** | **9.161** |

By kind: material £1.064, energy £0.613, consumables/other £0.654, machine £2.163, labour £1.877, tooling £0.116, inspection £0.547, scrap/recovery £0.009, cutting tools £0.378, setup £0.018, overhead £0.893, packaging £0.150, margin £0.679

Primary (to the raw part, before OH/margin) £3.528; machining (before OH/margin) £3.912.

Every line with its formula and inputs is in the JSON (`cost_lines`).

## Confidence
- Sourced: rate-book rates; ISO 8062 RMA/CT (S1) or EN 10243-1 method + finish allowance (S6, S7); cutting data (Sandvik S2–S5, S12 secondary); melting / heating energy (S8–S10); gravity-die yield range (S11).
- Assumptions (labelled in every formula): cycle times, crews, yields where not sourced, die/pattern lives and build-up hours, scrap rates, non-cut times, packaging, furnace loads, sand ratios, melt-shop fixed £/t.
- Range £8.36 – £10.26 (root-sum-square of the one-at-a-time swings below (independent assumptions)):
  - casting yield 70 % / 50 %: £8.97 / £9.43
  - mould rate 400 / 220 moulds/h: £9.00 / £9.39
  - foundry crew 6 / 10: £9.05 / £9.27
  - melt energy 570 / 700 kWh/t (S9): £9.10 / £9.26
  - melt + sand plant fixed £15+8 / £50+25 per t: £9.02 / £9.36
  - casting scrap 3 % / 8 %: £9.11 / £9.24
  - machining non-cut ×0.7 / ×1.4: £8.65 / £9.81
  - cutting time ×0.8 / ×1.3: £8.63 / £9.93

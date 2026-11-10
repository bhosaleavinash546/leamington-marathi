# Casting_Braket — independent reference should-cost (comparison B)

UK, 200,000/yr × 5 yr, ex-works, 10 Nov 2026. Rates: the application's UK rate book (ids in the JSON). Method: own engineering — no application costing code read or run.

**Total: £8.36 per part** (range £7.84 – £9.16).

## Route
Gravity (tilt) permanent-mould casting, LM25 / AlSi7Mg, T6; 2 impressions; machined on a twin-pallet 4-axis HMC (2 clampings on one tombstone).

- Section: 2V/S = 10.2 mm, ray-cast mean wall 17.6 mm, p95 30 mm (kernel). HPDC is suited to 2–6 mm walls; 15–30 mm sections would shrink-porosity in HPDC and cannot be fed. Gravity die feeds heavy sections from risers and gives a heat-treatable (T6) structural alloy.
- Volume 200k/yr is well inside permanent-mould economics (OU: minimum ~500 castings; dies last ~10^5 shots); sand casting would cost more per part at this volume and give coarser tolerances (CT 7–9 machine-moulded vs better in a metal die).
- Draft: 70 zero-draft faces are the machined faces/holes; no measured undercuts (kernel undercutFaceCount 0) — metal cores and a 2-part die suffice.
- Alternative considered: HPDC in AlSi10MnMg (cycle ~60 s, no T6) — cheaper conversion but the thick bosses would need to be cored out by redesign; not costed.

## Allowance and raw shape
- ISO 8062:1994 Table 2 (RMA) + Table 1 (CT) (S1): largest finished dimension 132.6 mm → band 100–160; gravity die light metal RMAG D–F (Table B.1) → E = 1.1 mm; CT: Table A.1 gives no data for permanent mould → CT8 = 1.8 mm (assumption)
- Nominal stock per side: 1.55 mm. external: R = F + 2·RMA + CT/2; internal: R = F − 2·RMA − CT/2 → nominal stock per side = RMA + CT/4 (casting tolerance kept separate: the cast surface may lie anywhere in ±CT/2 about R)
- Raw shape: finished CAD + nominal stock on every machined face and bore + drilled holes filled; mass from volume × rate-book density
- Weights: raw 0.926 kg, finished 0.858 kg, removed 0.068 kg (7.4 % of raw).

## Machining route
| Op | Machine | Clamping / datum | Cut min | Non-cut min | Cycle min | Machines |
|---|---|---|---|---|---|---|
| OP10 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | dedicated hydraulic fixture on a tombstone face; clamp on 3 cast datum targets on the top pads, part base towards the spindle; datum: cast datum targets (ISO 8062 datum system) → establishes A (base) and B (X=0 face) + Ø13 holes as locators for OP20 | 0.19 | 0.75 | 0.94 | 1 |
| OP20 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | second hydraulic fixture on the same tombstone (OP10/OP20 one part each per pallet cycle); base on machined face A, 2 Ø13 holes on round + diamond pins; datum: A (machined base) + 2 holes | 0.05 | 0.75 | 0.80 | 1 |

Total machining cycle 1.74 min (cutting 0.24 min). Axis choice per op is in the JSON (`axes`); every feature row carries vc / fz / fn and its source.

## Material balance (per good finished part)
- IN LM25 ingot bought: 0.9849 kg
- OUT finished part: 0.8576 kg — product
- OUT machining swarf: 0.0688 kg — recoverable (sold £0.54/kg)
- OUT scrapped machined parts: 0.0087 kg — recoverable (sold)
- OUT dross / melt loss: 0.0497 kg — non-recoverable
- (internal) gating + feeders + scrapped castings, remelted in-house: 1.0048 kg
- Closure: 0.0 g; recoverable 0.0775 kg, non-recoverable 0.0497 kg

## Cost build-up (£/part)
| Category | £ |
|---|---|
| raw material | 2.905 |
| primary | 1.294 |
| tooling | 0.187 |
| secondary | 1.202 |
| inspection | 0.334 |
| scrap/recovery | 0.088 |
| machining | 0.804 |
| setup | 0.006 |
| overhead | 0.818 |
| packaging | 0.100 |
| margin | 0.619 |
| **total** | **8.357** |

By kind: material £2.905, energy £0.090, consumables/other £0.314, machine £1.598, labour £1.287, tooling £0.187, inspection £0.334, scrap/recovery £0.088, cutting tools £0.009, setup £0.006, overhead £0.818, packaging £0.100, margin £0.619

Primary (to the raw part, before OH/margin) £5.277; machining (before OH/margin) £1.543.

Every line with its formula and inputs is in the JSON (`cost_lines`).

## Confidence
- Sourced: rate-book rates; ISO 8062 RMA/CT (S1) or EN 10243-1 method + finish allowance (S6, S7); cutting data (Sandvik S2–S5, S12 secondary); melting / heating energy (S8–S10); gravity-die yield range (S11).
- Assumptions (labelled in every formula): cycle times, crews, yields where not sourced, die/pattern lives and build-up hours, scrap rates, non-cut times, packaging, furnace loads, sand ratios, melt-shop fixed £/t.
- Range £7.84 – £9.16 (root-sum-square of the one-at-a-time swings below (independent assumptions)):
  - die cycle 180 / 330 s (2 imp.): £8.01 / £8.87
  - casting yield 60 % / 40 % (S11 range): £8.29 / £8.45
  - die life 150k / 50k shots: £8.30 / £8.51
  - T6 load 600 / 250 kg a charge: £8.11 / £8.81
  - casting scrap 3 % / 10 %: £8.26 / £8.49
  - melt shop fixed £10 / £40 per t: £8.33 / £8.41
  - machining non-cut ×0.7 / ×1.4: £8.11 / £8.69
  - cutting time ×0.8 / ×1.3: £8.33 / £8.40

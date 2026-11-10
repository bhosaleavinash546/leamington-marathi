# Part1 — independent reference should-cost (comparison B)

UK, 200,000/yr × 5 yr, ex-works, 10 Nov 2026. Rates: the application's UK rate book (ids in the JSON). Method: own engineering — no application costing code read or run.

**Total: £11.87 per part** (range £11.16 – £12.94).

## Route
Gravity (tilt) permanent-mould casting, LM25 / AlSi7Mg, T6, metal cores for the Ø50 / Ø22 / stem bores; machined on a twin-pallet 4-axis HMC (2 clampings).

- Owner states gravity die. Measured walls 6.2–49.8 mm (mean 25.8, 2V/S 10.4 mm) — HPDC unsuitable for these sections; gravity die with T6 is the conventional triple-clamp route.
- Two 3 mm slits (measured, 35 deep × 20 long) are machined — a 3 mm blade cannot be cast reliably in a permanent mould.

## Allowance and raw shape
- ISO 8062:1994 Table 2 (RMA) + Table 1 (CT) (S1): largest 270 mm → band 250–400; RMAG E = 1.8 mm; CT8 = 2.2 mm (assumption) → 2.35 mm/side
- Nominal stock per side: 2.35 mm. external: R = F + 2·RMA + CT/2; internal: R = F − 2·RMA − CT/2 → nominal stock per side = RMA + CT/4 (casting tolerance kept separate: the cast surface may lie anywhere in ±CT/2 about R)
- Raw shape: finished CAD + nominal stock on every machined face and bore + drilled holes filled; mass from volume × rate-book density
- Weights: raw 1.399 kg, finished 1.151 kg, removed 0.248 kg (17.8 % of raw).

## Machining route
| Op | Machine | Clamping / datum | Cut min | Non-cut min | Cycle min | Machines |
|---|---|---|---|---|---|---|
| OP10 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | hydraulic fixture, part lying with bore axes (X) horizontal; locate on the two cast fork bores (expanding cones) and a cast pad; datum: cast fork-bore centres + pad → machined X=0 faces become A, the two Ø50 bores B/C | 0.90 | 1.65 | 2.55 | 2 |
| OP20 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | second fixture on the tombstone, bore axes vertical; locate on the machined Ø50 bores (diamond + round pin) and face A; datum: A + Ø50 bores | 0.14 | 0.65 | 0.80 | 1 |

Total machining cycle 3.35 min (cutting 1.05 min). Axis choice per op is in the JSON (`axes`); every feature row carries vc / fz / fn and its source.

## Material balance (per good finished part)
- IN LM25 ingot bought: 1.4887 kg
- OUT finished part: 1.1509 kg — product
- OUT machining swarf: 0.2510 kg — recoverable (sold £0.54/kg)
- OUT scrapped machined parts: 0.0116 kg — recoverable (sold)
- OUT dross / melt loss: 0.0752 kg — non-recoverable
- (internal) gating + feeders + scrapped castings, remelted in-house: 1.5188 kg
- Closure: 0.0 g; recoverable 0.2626 kg, non-recoverable 0.0752 kg

## Cost build-up (£/part)
| Category | £ |
|---|---|
| raw material | 4.392 |
| primary | 1.521 |
| tooling | 0.251 |
| secondary | 1.588 |
| inspection | 0.334 |
| scrap/recovery | 0.039 |
| machining | 1.573 |
| setup | 0.009 |
| overhead | 1.165 |
| packaging | 0.120 |
| margin | 0.879 |
| **total** | **11.870** |

By kind: material £4.392, energy £0.136, consumables/other £0.423, machine £2.369, labour £1.712, tooling £0.251, inspection £0.334, scrap/recovery £0.039, cutting tools £0.042, setup £0.009, overhead £1.165, packaging £0.120, margin £0.879

Primary (to the raw part, before OH/margin) £7.380; machining (before OH/margin) £2.327.

Every line with its formula and inputs is in the JSON (`cost_lines`).

## Confidence
- Sourced: rate-book rates; ISO 8062 RMA/CT (S1) or EN 10243-1 method + finish allowance (S6, S7); cutting data (Sandvik S2–S5, S12 secondary); melting / heating energy (S8–S10); gravity-die yield range (S11).
- Assumptions (labelled in every formula): cycle times, crews, yields where not sourced, die/pattern lives and build-up hours, scrap rates, non-cut times, packaging, furnace loads, sand ratios, melt-shop fixed £/t.
- Range £11.16 – £12.94 (root-sum-square of the one-at-a-time swings below (independent assumptions)):
  - die cycle 200 / 360 s (2 imp.): £11.47 / £12.39
  - casting yield 60 % / 40 % (S11 range): £11.77 / £12.02
  - die life 150k / 50k shots: £11.83 / £12.07
  - T6 load 600 / 250 kg a charge: £11.49 / £12.56
  - casting scrap 3 % / 10 %: £11.75 / £12.04
  - melt shop fixed £10 / £40 per t: £11.83 / £11.94
  - machining non-cut ×0.7 / ×1.4: £11.48 / £12.40
  - cutting time ×0.8 / ×1.3: £11.74 / £12.06

# PRCR002 — independent reference should-cost (comparison B)

UK, 200,000/yr × 5 yr, ex-works, 10 Nov 2026. Rates: the application's UK rate book (ids in the JSON). Method: own engineering — no application costing code read or run.

**Total: £16.20 per part** (range £15.03 – £17.87).

## Route
Green-sand vertically parted flaskless moulding (DISAMATIC class), EN-GJS-500-7 as-cast, 2 shell cores for the king-pin bores; HMC (prismatic + centres) → lathe between centres (spindle) → HMC (finish king-pin bores).

- Ductile iron axle-type part (stub axle with integral spindle + king-pin bosses), 7.4 kg finished; green-sand vertical moulding is the high-volume ductile-iron route; 32 undercut faces (kernel) on the king-pin axis → 2 sand cores.
- Spindle turned between centres on a lathe (much cheaper than interpolating diameters on the HMC); king-pin bores finish-bored last from the turned spindle so their relation to the spindle axis is held.

## Allowance and raw shape
- ISO 8062:1994 Table 2 (RMA) + Table 1 (CT) (S1): largest 274.5 mm → band 250–400; machine-moulded SG iron RMAG E–G → F = 2.5 mm; CT8–12 (Table A.1) → CT10 = 4.4 mm → 3.6 mm/side
- Nominal stock per side: 3.6 mm. external: R = F + 2·RMA + CT/2; internal: R = F − 2·RMA − CT/2 → nominal stock per side = RMA + CT/4 (casting tolerance kept separate: the cast surface may lie anywhere in ±CT/2 about R)
- Raw shape: finished CAD + nominal stock on every machined face and bore + drilled holes filled; mass from volume × rate-book density
- Weights: raw 9.278 kg, finished 7.364 kg, removed 1.915 kg (20.6 % of raw).

## Machining route
| Op | Machine | Clamping / datum | Cut min | Non-cut min | Cycle min | Machines |
|---|---|---|---|---|---|---|
| OP10 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | hydraulic fixture: spindle axis horizontal, part located on cast datum targets on the flange and the two king-pin bosses (ISO 8062 datum targets); datum: cast datums → machined flange face A, centre holes (turning axis), king-pin bores roughed | 2.08 | 1.87 | 3.95 | 3 |
| OP20 | CNC lathe 2-axis, ≥ 400 mm swing (mach-lathe-cnc) | between centres (OP10 centre holes) with a face driver on the machined flange face; out-of-balance body counterweighted; datum: centres (A–B axis) + flange face A | 1.90 | 0.67 | 2.56 | 3 |
| OP30 | HMC 400 twin pallet, 4 axes (mach-hmc-400) | hydraulic fixture locating on the turned spindle (V-blocks on bearing seats) and flange face A; datum: turned spindle axis + A | 0.84 | 1.17 | 2.01 | 2 |

Total machining cycle 8.52 min (cutting 4.82 min). Axis choice per op is in the JSON (`axes`); every feature row carries vc / fz / fn and its source.

## Material balance (per good finished part)
- IN pig iron + steel scrap + FeSiMg charge (solid): 9.7073 kg
- OUT finished part: 7.3635 kg — product
- OUT machining swarf: 1.9338 kg — recoverable (sold £0.15/kg)
- OUT scrapped machined parts: 0.0744 kg — recoverable (sold)
- OUT melt loss on new charge (2 %, inside the rate-book £/kg): 0.1941 kg — non-recoverable
- OUT remelt loss on returns (2 %): 0.1414 kg — non-recoverable
- (internal) gating + feeders + scrapped castings, remelted in-house: 7.0699 kg
- Closure: 0.0 g; recoverable 2.0082 kg, non-recoverable 0.3355 kg

## Cost build-up (£/part)
| Category | £ |
|---|---|
| raw material | 3.563 |
| primary | 3.880 |
| tooling | 0.125 |
| secondary | 0.912 |
| inspection | 0.547 |
| scrap/recovery | -0.133 |
| machining | 4.250 |
| setup | 0.024 |
| overhead | 1.580 |
| packaging | 0.250 |
| margin | 1.200 |
| **total** | **16.197** |

By kind: material £3.563, energy £1.837, consumables/other £1.784, machine £2.650, labour £2.289, tooling £0.125, inspection £0.547, scrap/recovery £-0.133, cutting tools £0.482, setup £0.024, overhead £1.580, packaging £0.250, margin £1.200

Primary (to the raw part, before OH/margin) £8.588; machining (before OH/margin) £4.580.

Every line with its formula and inputs is in the JSON (`cost_lines`).

## Confidence
- Sourced: rate-book rates; ISO 8062 RMA/CT (S1) or EN 10243-1 method + finish allowance (S6, S7); cutting data (Sandvik S2–S5, S12 secondary); melting / heating energy (S8–S10); gravity-die yield range (S11).
- Assumptions (labelled in every formula): cycle times, crews, yields where not sourced, die/pattern lives and build-up hours, scrap rates, non-cut times, packaging, furnace loads, sand ratios, melt-shop fixed £/t.
- Range £15.03 – £17.87 (root-sum-square of the one-at-a-time swings below (independent assumptions)):
  - casting yield 70 % / 50 %: £15.63 / £16.99
  - mould rate 400 / 220 moulds/h: £16.04 / £16.43
  - foundry crew 6 / 10: £16.09 / £16.30
  - melt energy 570 / 700 kWh/t (S9): £16.02 / £16.49
  - melt + sand plant fixed £15+8 / £50+25 per t: £15.76 / £16.79
  - casting scrap 3 % / 8 %: £16.08 / £16.39
  - machining non-cut ×0.7 / ×1.4: £15.59 / £17.03
  - cutting time ×0.8 / ×1.3: £15.56 / £17.17

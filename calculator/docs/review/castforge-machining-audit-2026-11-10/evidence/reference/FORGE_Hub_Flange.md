# FORGE_Hub_Flange — independent reference should-cost (comparison B)

UK, 200,000/yr × 5 yr, ex-works, 10 Nov 2026. Rates: the application's UK rate book (ids in the JSON). Method: own engineering — no application costing code read or run.

**Total: £10.44 per part** (range £9.95 – £11.20).

## Route
Closed-die hot forging of 38MnVS6 (saw → induction heat → upset/block/finish on a 2500 t mechanical press → trim + pierce 400 t → controlled cooling → shot blast → MPI); turned on two 2-axis lathes, holes on a 3-axis VMC.

- Modelled part: flange Ø140×18 + hub Ø80 to 50 high, Ø60 bore, 6×Ø14 — axisymmetric, a classic closed-die press forging with a pierced bore. Shape complexity S = m_forging / m_envelope ≈ 0.49 → EN 10243-1 class S2.
- 38MnVS6 chosen: controlled cooling from forging heat replaces Q&T / normalise; C45 + normalise is the alternative (material £0.86 + £0.30/kg normalise ≈ the same).
- Press: specific pressure 600 MPa (assumption for steel closed-die finishing with flash) × projected area with flash ring ≈ 27,050 mm² → 16.2 MN (1,650 t) × 1.2 margin → 2,500 t class mechanical press.

## Allowance and raw shape
- EN 10243-1 (tolerances, grade F) + finish allowance: 1.5 mm per machined surface (S7, 0.06 in) + 0.7 mm = minus half of an ESTIMATED grade-F tolerance (+1.4/−0.7 mm for a ~3.4 kg, 145 mm, M1, S2 forging — EN 10243-1 Table 1 is an image and was NOT read; the S6 worked example gives +1.1/−0.5 at 0.2 kg, 78 mm). Tolerance kept separate: the allowance is nominal stock, the forging may vary +1.4/−0.7 about it; scale pits ≤ ½ allowance (S6 §5.2.4).
- Nominal stock per side: 2.2 mm. external 3° (assumption; S7 standard ≥ 1°), internal (bore) 5° (assumption)
- Raw shape: flange Ø144.4 × 22.4 (parting line at flange mid-plane), hub Ø84.4 to 54.4 high, bore Ø55.6 with 8 mm wad pierced, 6 holes not forged (drilled from solid)
- Weights: raw 3.425 kg, finished 2.197 kg, removed 1.227 kg (35.8 % of raw).

## Machining route
| Op | Machine | Clamping / datum | Cut min | Non-cut min | Cycle min | Machines |
|---|---|---|---|---|---|---|
| OP10 | CNC lathe 2-axis (mach-lathe-cnc) | 3-jaw power chuck, soft jaws on the as-forged hub OD; flange underside towards the turret; datum: as-forged hub OD + flange top (forging datums) → machined bore and flange underside become datums A/B | 1.22 | 0.57 | 1.79 | 2 |
| OP20 | CNC lathe 2-axis (mach-lathe-cnc) | soft jaws on the finished flange OD Ø140, face A on the jaw steps; datum: A + flange OD | 0.85 | 0.52 | 1.36 | 2 |
| OP30 | CNC VMC 3-axis (mach-vmc3) | hydraulic fixture: expanding mandrel in the Ø60 bore, face A down; datum: bore + A (holes are the first angular feature, no clocking) | 0.29 | 0.63 | 0.93 | 1 |

Total machining cycle 4.08 min (cutting 2.36 min). Axis choice per op is in the JSON (`axes`); every feature row carries vc / fz / fn and its source.

## Material balance (per good finished part)
- IN 38MnVS6 Ø80 bar: 4.2053 kg
- OUT finished part: 2.1975 kg — product
- OUT machining swarf: 1.2396 kg — recoverable (sold £0.20/kg)
- OUT scrapped machined parts: 0.0222 kg — recoverable
- OUT flash: 0.3566 kg — recoverable
- OUT pierce wad: 0.1484 kg — recoverable
- OUT saw kerf chips: 0.1012 kg — recoverable
- OUT bar crop ends: 0.0568 kg — recoverable
- OUT scrapped forgings: 0.0527 kg — recoverable
- OUT scale (oxidation): 0.0304 kg — non-recoverable
- Closure: 0.0 g; recoverable 1.9774 kg, non-recoverable 0.0304 kg

## Cost build-up (£/part)
| Category | £ |
|---|---|
| raw material | 4.788 |
| scrap/recovery | -0.306 |
| primary | 0.954 |
| tooling | 0.576 |
| setup | 0.075 |
| secondary | 0.140 |
| inspection | 0.362 |
| machining | 1.932 |
| overhead | 1.022 |
| packaging | 0.120 |
| margin | 0.773 |
| **total** | **10.435** |

By kind: material £4.788, scrap/recovery £-0.306, machine £1.353, energy £0.292, labour £1.016, consumables/other £0.081, tooling £0.576, setup £0.075, inspection £0.362, cutting tools £0.284, overhead £1.022, packaging £0.120, margin £0.773

Primary (to the raw part, before OH/margin) £6.514; machining (before OH/margin) £2.005.

Every line with its formula and inputs is in the JSON (`cost_lines`).

## Confidence
- Sourced: rate-book rates; ISO 8062 RMA/CT (S1) or EN 10243-1 method + finish allowance (S6, S7); cutting data (Sandvik S2–S5, S12 secondary); melting / heating energy (S8–S10); gravity-die yield range (S11).
- Assumptions (labelled in every formula): cycle times, crews, yields where not sourced, die/pattern lives and build-up hours, scrap rates, non-cut times, packaging, furnace loads, sand ratios, melt-shop fixed £/t.
- Range £9.95 – £11.20 (root-sum-square of the one-at-a-time swings below (independent assumptions)):
  - press takt 6 / 10 s: £10.31 / £10.65
  - finisher die life 12k / 5k: £10.29 / £10.70
  - flash ring 2 / 4.5 mm mean thickness: £10.33 / £10.60
  - heating 0.30 / 0.45 kWh/kg (S10): £10.35 / £10.48
  - machining allowance 1.5+0.5 / 1.5+1.2 mm: £10.31 / £10.74
  - forge crew 2 / 4: £10.36 / £10.51
  - machining non-cut ×0.7 / ×1.4: £10.18 / £10.78
  - cutting time ×0.8 / ×1.3: £10.13 / £10.90

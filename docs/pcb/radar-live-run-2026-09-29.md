# PCB photo → cost: live end-to-end run — 77 GHz radar module

29 September 2026 · 250,000 per year · manufactured in China (delivered UK)

## What was run

The tool's real server and its full photo pipeline (`/api/pcb/analyze-image-stream`,
the path the app uses): 8 of the 10 photos uploaded exactly as the UI sends them,
country China, quantity 250,000. The four AI stages (board type, safety level,
marking OCR, bill of materials) were answered by a **local stand-in returning a
reading of the photos done by hand**, in the exact format the model returns —
because the API key could not be used from this environment. Everything after the
AI — post-processing, price grounding, board-spec stabiliser, country costing,
automotive panels — is the tool's own code, unchanged.

**What this does not test:** how well the real model reads these photos. Re-run
with the key set as an environment secret to test that.

## The board

NXP **S32R294** radar MCU (MAPBGA) + NXP **TEF8105** 77 GHz transceiver (under a
cover, with RF feed lines to waveguide launches), Maxim/ADI **MAX20431A** PMIC,
Winbond **W25Q32JW** flash, 2 × TI **TCAN1044AV** CAN FD, ~290 passives, 6 power
inductors, 40 MHz crystal, 2 electrolytics, 2 shield cans (frames present, cans
removed on the sample). 8 layers, FR4, 87.8 × 48.9 mm, 1.31 mm, copper
70/70/35/35/35/35/70/70 µm, immersion silver, one-sided, no conformal coat (UV
photo shows no fluorescence). 328 placements, 2 BGAs.

## Result — China, per board, 250k/yr

| | £ |
|---|---|
| Components (BOM, China price index) | 41.36 |
| Bare board | 1.46 |
| Assembly (SMT 1.06 + test/inspection 4.27) | 5.33 |
| Logistics + duty to UK | 1.82 |
| **Total per board** | **51.34** |

Bare board detail: base 0.06, layers 0.25, finish 0.03, vias 1.05.
Cross-check: published China volume pricing for 8-layer FR4 is $100–150/m² ≈ $2.90–4.20
for a 1 dm² board at 1k+ ([AtlasPCB](https://www.atlaspcb.com/blog/china-pcb-manufacturing-pricing-guide-2026/),
[King Sun PCB](https://www.kingsunpcb.com/8-layer-pcb-price-guide-2025/)) — this 0.43 dm²
automotive board at £1.46 is inside that range with an automotive uplift.

## Bill of materials as the tool priced it

| Ref | Part | Part number | Qty | Unit | Line | Price basis |
|---|---|---|---|---|---|---|
| U1 | NXP S32R294 automotive radar MCU (MAPBGA) | FS32R294KCMJD | 1 | £22.8800 | £22.88 | known-range · verify |
| U2 | NXP TEF8105 77 GHz FMCW radar transceiver MMIC (eWLB, under cover) | TEF8105 | 1 | £12.3200 | £12.32 | known-range · verify |
| U3 | Maxim/ADI MAX20431A automotive multi-output PMIC | MAX20431A | 1 | £2.8160 | £2.82 | ai-estimate |
| U4 | Winbond 32 Mbit 1.8 V SPI NOR flash | W25Q32JWSSIM | 1 | £0.4840 | £0.48 | ai-estimate |
| U5,U6 | TI TCAN1044AV-Q1 CAN FD transceiver | TCAN1044AVDRBRQ1 | 2 | £0.3960 | £0.79 | ai-estimate |
| U7-U11 | Small-signal ICs: LDO / supervisor / load switch (SOT-23-6, DFN-6) | — | 5 | £0.2640 | £1.32 | ai-estimate · verify |
| Q1-Q8 | Small-signal MOSFETs / transistors | — | 8 | £0.0440 | £0.35 | ai-estimate · verify |
| D1-D3 | Reverse-polarity / TVS / Schottky diodes (SMA/SMB) | — | 3 | £0.1056 | £0.32 | ai-estimate · verify |
| D4-D8 | Small-signal / ESD diodes (SOD-323, SOT-23) | — | 5 | £0.0264 | £0.13 | ai-estimate · verify |
| C1,C2 | Aluminium electrolytic capacitor 100 uF (SMD V-chip, marked JW 100 VHK) | — | 2 | £0.1408 | £0.28 | ai-estimate · verify |
| L1-L6 | Power inductors (molded 4x4 / 5x5 mm, 1210 chokes) | — | 6 | £0.1584 | £0.95 | ai-estimate · verify |
| FB1-FB8 | Ferrite beads | — | 8 | £0.0132 | £0.11 | ai-estimate · verify |
| Y1 | 40 MHz SMD crystal, AEC-Q200 (radar reference) | — | 1 | £0.3960 | £0.40 | ai-estimate · verify |
| C3-C152 | MLCC X7R/C0G AEC-Q200 | — | 150 | £0.0088 | £1.32 | ai-estimate · verify |
| R1-R90 | Thick-film resistors AEC-Q200 | — | 90 | £0.0035 | £0.32 | ai-estimate · verify |
| C153-C172 | MLCC X7R AEC-Q200 | — | 20 | £0.0176 | £0.35 | ai-estimate · verify |
| C173-C194 | Bulk MLCC 1206/1210 X7R AEC-Q200 | — | 22 | £0.0528 | £1.16 | ai-estimate · verify |
| SH1,SH2 | EMI shield can, stamped (removed from sample; solder frames present) | — | 2 | £0.3520 | £0.70 | ai-estimate · verify |

The two radar chips are 75% of the BOM. Neither has a public volume
price (NXP quotes them direct); both sit inside the tool's stated ranges and are
flagged **confirm with a quote**.

## All countries (same board)

| Country | BOM | Board | Assembly | Logistics | Total |
|---|---|---|---|---|---|
| China (Shenzhen / Suzhou) | £41.36 | £1.46 | £5.33 | £1.82 | **£51.34** |
| Vietnam (Ho Chi Minh City / Hanoi) | £43.24 | £1.78 | £4.55 | £2.76 | **£53.78** |
| Malaysia (Penang / Johor Bahru) | £42.77 | £2.08 | £7.15 | £2.90 | **£56.11** |
| Thailand (Bangkok / Ayutthaya) | £43.71 | £2.18 | £6.26 | £2.91 | **£56.34** |
| India (Pune / Bengaluru / Chennai) | £44.65 | £1.95 | £5.50 | £2.91 | **£56.63** |
| Taiwan (Taoyuan / Hsinchu / Taichung) | £42.30 | £3.70 | £10.69 | £2.15 | **£59.69** |
| Mexico (Juárez / Monterrey / Guadalajara) | £46.06 | £3.21 | £8.06 | £2.18 | **£60.81** |
| South Korea (Suwon / Busan) | £43.24 | £4.90 | £13.31 | £0.05 | **£62.36** |
| Poland (Wrocław / Łódź / Poznań) | £49.82 | £3.76 | £9.52 | £0.11 | **£64.47** |
| Czech Republic (Brno / Prague) | £49.35 | £4.21 | £10.73 | £0.12 | **£65.68** |
| Germany (München / Stuttgart / Hamburg) | £55.46 | £8.63 | £25.62 | £0.07 | **£90.74** |
| USA (San Jose / Austin / Milpitas) | £54.05 | £8.21 | £28.21 | £3.40 | **£94.79** |
| United Kingdom (Birmingham / Coventry / Edinburgh) | £57.34 | £10.32 | £30.02 | £0.00 | **£98.81** |
| Japan (Nagano / Yokohama / Osaka) | £56.40 | £15.10 | £32.37 | £0.06 | **£104.66** |

## What this run found in the tool — and what was fixed

| # | Problem | Before | After |
|---|---|---|---|
| 1 | Measured board size overwritten by the "stabiliser" (assumed 1.6 parts/cm²; this board has 7.6) | 161 × 89 mm | 87.8 × 48.9 mm (measured sizes now kept; AI estimates still stabilised) |
| 2 | Immersion silver not a finish; three different treatments (ENIG default, HASL-LF, £1.60 adder dearer than ENIG) | ENIG forced | Immersion silver, priced from the country table (below ENIG) |
| 3 | ENIG forced onto every BGA board | yes | only HASL boards with BGA |
| 4 | OCR-confirmed S32R294 capped to a generic £18 "BGA median", below the tool's own £22 floor | £18.00 | £22.88, flagged to confirm |
| 5 | Radar transceiver: hint table said £25–90, system prompt £9–22 | inconsistent | £9–22 both |
| 6 | Power inductors capped at a chip capacitor's £0.08 | £0.08 | £0.158 |
| 7 | Conformal coat charged on every automotive board, with a per-batch £18 minimum per board | £18 | £0 (only when a coat is seen) |
| 8 | "Programme pricing" assumed 4 × the entered volume | 1,000,000/yr, −50% | 250,000/yr, −40% (panel only) |
| 9 | Automotive fab panel built on fab + assembly + 30%, with per-panel tests charged per board | £44.57 | £2.95 |
| 10 | Automotive assembly panel read the country breakdown before it existed | fallback rates | country assembly |

China total per board: **£48.88 → £51.34**. The old figure was close only because errors
cancelled (board area ×3.3 and a phantom coat up; radar MCU and inductors down).

## Still open — for decision

1. **Three different totals on screen.** Headline £51.34 (includes logistics, duty, yield);
   confidence band mid £54.23 (BOM + fab + assembly, no logistics); benchmark panel
   adds the AI's own assembly again. One headline function should feed all.
2. **Automotive assembly panel £19.77** — X-ray at £10.40/board and burn-in over
   200 boards/shift are prototype-scale figures; the headline uses the country model's £4.27.
3. **Copper weight and thickness are not costed** (2 oz outer = 1 oz in the price). Needs a
   heavy-copper uplift figure from a fabricator.
4. **Via count is clamped** to 1.8 × a density norm (1,000 → 556); radar boards with via fences exceed it.
5. **One quantity field** is both "order qty" and annual volume. A teardown sample entered
   as qty 1 prices at prototype rates (BOM ×8). Needs separate sample / annual-volume inputs.
6. **Missing-flag re-grading:** a line without `automotive: true` is multiplied ×2.5–3.5 even
   if already priced at automotive grade (not triggered on this board).
7. **8-bucket hand-off** (PCB page → PCBA form) double-counts assembly as material.
8. **Stream path** lacks the OCR automotive promotion and IC refinement the older path has.

## Assumptions in the photo reading

Passive counts from photos (±15%); transceiver marking from the close-up; shield cans
assumed fitted in production (frames present); 2 × 7 through-holes and the edge pad row
unpopulated (no connector on this board); prices at the tool's 100k anchors, then its
own ×0.88 volume factor for 250k.

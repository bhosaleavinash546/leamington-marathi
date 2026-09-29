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

## Result — China, per board, 250k/yr (after all fixes)

| | £ |
|---|---|
| Components (BOM, China price index) | 41.36 |
| Bare board (incl. 1,000 vias £1.90, heavy copper £0.13) | 2.42 |
| Assembly (SMT 1.06 + test/inspection 4.27) | 5.33 |
| Logistics + duty to UK | 1.83 |
| **Total per board** | **52.32** |

Confidence band (same total): £41.73 / **£52.32** / £76.10.
Automotive assembly panel £6.71 (country assembly + IATF 20% + serialisation + Class 3; no burn-in at ASIL-B).

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

## All countries (same board, after all fixes)

| Country | BOM | Board | Assembly | Logistics | Total |
|---|---|---|---|---|---|
| China (Shenzhen / Suzhou) | £41.36 | £2.42 | £5.33 | £1.83 | **£52.32** |
| Vietnam (Ho Chi Minh City / Hanoi) | £43.24 | £2.95 | £4.55 | £2.80 | **£55.00** |
| Malaysia (Penang / Johor Bahru) | £42.77 | £3.40 | £7.15 | £2.94 | **£57.49** |
| Thailand (Bangkok / Ayutthaya) | £43.71 | £3.57 | £6.26 | £2.96 | **£57.79** |
| India (Pune / Bengaluru / Chennai) | £44.65 | £3.20 | £5.50 | £2.95 | **£57.93** |
| Taiwan (Taoyuan / Hsinchu / Taichung) | £42.30 | £5.83 | £10.69 | £2.19 | **£61.88** |
| Mexico (Juárez / Monterrey / Guadalajara) | £46.06 | £5.04 | £8.06 | £2.20 | **£62.69** |
| South Korea (Suwon / Busan) | £43.24 | £7.66 | £13.31 | £0.01 | **£65.10** |
| Poland (Wrocław / Łódź / Poznań) | £49.82 | £5.91 | £9.52 | £0.03 | **£66.56** |
| Czech Republic (Brno / Prague) | £49.35 | £6.58 | £10.73 | £0.03 | **£67.98** |
| Germany (München / Stuttgart / Hamburg) | £55.46 | £13.50 | £25.62 | £0.02 | **£95.56** |
| USA (San Jose / Austin / Milpitas) | £54.05 | £12.86 | £28.21 | £3.53 | **£99.58** |
| United Kingdom (Birmingham / Coventry / Edinburgh) | £57.34 | £16.05 | £30.02 | £0.00 | **£104.55** |
| Japan (Nagano / Yokohama / Osaka) | £56.40 | £23.42 | £32.37 | £0.02 | **£112.94** |

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

## Round 2 — the open items, fixed

| # | Item | Fix | On this board |
|---|---|---|---|
| 1 | Three different totals | Confidence band and benchmark anchored to the headline country total (spread kept); UI headline = selected country total | band mid £54.23 → £52.32 = headline |
| 2 | Automotive assembly panel at prototype scale | Built on the country assembly (already has AOI/X-ray/ICT); no second X-ray; serialisation £0.05 at volume; burn-in only ASIL-C/D, 500 boards/shift at volume | £19.77 → £6.71 |
| 3 | Copper weight not costed | Per-layer heavy-copper surcharge, 25 CNY/m² per layer per 0.5 oz above 1 oz (country-scaled); per-layer list from board data, else copperWeightOz on the outer layers; UI copper edit now costs | +£0.13 |
| 4 | Via count clamped to 1.8× norm | Upper bound 4× (via-fenced RF boards run 3–4×) | 556 → 1,000 vias (+£0.85) |
| 5 | One quantity field | Field is "boards / year" (default 10,000, was 100); a warning below 100 says it is a prototype price | — |
| 6 | Missing-flag re-grading ×2.5–3.5 | Uplift only a line explicitly priced consumer-grade; unstated, OCR-read and live-priced lines untouched | 0 lines uplifted |
| 7 | PCBA hand-off double count | Bare board only (not fab + assembly) to the PCBA form; the photo page's annual volume carried across | — |
| 8 | Stream path missing automotive promotion | Ported: IC markings (S32R/TEF81x…) promote the board to automotive and run ASIL | — |

Also: a measured board weight (26.4 g) now drives freight instead of the area × layers estimate.
Evidence for the copper figure: [Queen EMS copper weight guide](https://www.queenems.com/blog/pcb-copper-weight-1oz-2oz-3oz/), [AIVON 2 oz cost analysis](https://www.aivon.com/blog/pcb-knowledge/2oz-copper-pcb-cost-analysis-is-the-performance-worth-the-premium/).

China total per board across the run: £48.88 (as found) → £51.34 (round 1) → **£52.32** (round 2).

## Assumptions in the photo reading

Passive counts from photos (±15%); transceiver marking from the close-up; shield cans
assumed fitted in production (frames present); 2 × 7 through-holes and the edge pad row
unpopulated (no connector on this board); prices at the tool's 100k anchors, then its
own ×0.88 volume factor for 250k.

## Round 3 — the real-model run compared (user's two PDFs, 29 Sep 2026 21:56)

The tool with the real model gave **China £77.75** per board at 250k/yr against the
stand-in's £52.32. Where the £25 went:

| Item | Real-model run | Stand-in (photo reading) | Cause | Fix |
|---|---|---|---|---|
| TEF8105 transceiver | "77/79GHz MMIC" £4.00, no part number | TEF8105 £12.32 | OCR read it; the BOM never used it | OCR markings attached to the BOM line of the same function; unread 77 GHz transceivers held in the £9–22 class range |
| MAX20431A, W25Q32, TCAN1044 | generic "PMIC", "flash" £1.94, "op-amp/LDO" | named | same; the chip tops read "winbond 25Q32…", "TI 1044AV" | hints for the abbreviated top marks; prompt now requires every OCR marking to be a BOM part number |
| J2, J3 "header pads" | 2 × £4.40 | none (pads unpopulated) | pads priced as connectors | pads / test points / unfitted → £0, flagged |
| Electrolytics 100 µF/100 V | 2 × £1.58 | £0.16 | £3.50 through-hole cap | description cap £0.60 |
| SOT-23 diodes/transistors | 10 × £0.18 | £0.03–0.12 | £0.60 TVS cap | description cap £0.12 |
| Reflow | single-sided, yet BOM lists bottom-side ICs | double | model inconsistency | bottom-side parts ⇒ 2 sides, warned |
| Master report §C3 | "Total £101.34" (AI first pass) | — | printed `costEstimates`, not the country total | §C3, summary line, PCB PDF §3 and Save-to-Library use the selected country (£77.75 there) |
| Should-cost PDF | £82.43, 200 × 150 mm default fab board, under the radar photos and ASIL-C | — | report of an untouched form carried the photo context | photos/ASIL attached only when the form was filled from that photo; warning otherwise |
| "Effective date 2026-06-14" | pass-through placeholder's date | — | not a price | report shows the rate library date for pass-through costs |

Replaying the real model's BOM through the fixed pipeline: **China £77.75 → £68.18**
(BOM £67.84 → £58.78). Not changed by code, left for the engineer:

- **Placements 224 vs ~328** and fewer passives: a counting judgement from the photos.
- **Vias 220 vs ~1,000**: not visible in a photo; enter from the drill file (~£1.50/board here).
- **J1 £5.28 "sealed connector"**: OCR reported an edge pad row, not a connector; flagged for verification.
- **ASIL-C vs ASIL-B**: the model's judgement; ASIL-C adds burn-in. Confirm against the safety concept.
- **Two "PMIC" and two "op-amp/LDO" ICs**: the real board has one MAX20431A and two TCAN1044s; the line quantities are the model's.

## Round 4 — root cause, and the correction

Rounds 1–3 fixed symptoms. The cause is structural: the photo pipeline asked one
model call to identify, count, judge the board build **and price** the board, and
used its prices for every line it could not name — most of the BOM. Nothing in the
pipeline took the two inputs that are true, the BOM file and the fab data, as truth:
the BOM file was pasted into the prompt as a hint and the model re-wrote it; there
was no way to give the drill file at all. So "confirmed" was £0 and every number was
a bounded guess.

Corrected:

| Root cause | Correction |
|---|---|
| The model sets prices | `pcb-class-pricing.ts`: the price table is data. Every unnamed line is priced inside its class range (AEC-Q variant on automotive boards); the model's figure only picks the point. Each line records `priceSource` / `priceBasis` / `priceNote`; the screen shows a CAT / RANGE / TABLE / FILE / NF badge per line. |
| BOM file only a hint | `pcb-bom-truth.ts`: the file's lines are the BOM; the photo fills a package or estimates within range for the same ref-des. Photo-only parts are listed as a warning (the file may be short). |
| No fab data input | `pcb-fab-data.ts`: Excellon drill (hole table, vias ≤ 0.6 mm vs holes), Gerber outline (extents), copper-layer files (layer count). Measured values override the guess and the stabiliser leaves them alone. New "Attach Fab Files" on the photo page. |
| Free-text JSON scraped, salvaged, "repaired" | Stage 3 uses structured output (`output_config.format`, schema in `pcb-analysis-schema.ts`), falling back to the old path if a model or proxy rejects it. |
| "Confirmed £0" | Small lines priced by count from the table count as priced; "to verify" is the £1+ lines with no quote. |

Replay of the real model's answer, China, 250k/yr, through the corrected pipeline:
see the numbers appended below by the run.

**Replay results (stand-in returning the real model's answer; China, 250k/yr):**

| Input | Total / board | BOM | Bare board | Vias used | Placements | Priced / to verify |
|---|---|---|---|---|---|---|
| Real run as delivered (before round 3) | £77.75 | £67.84 | £0.94 | 220 (guessed) | 224 | — |
| Photos only, corrected pipeline | £68.21 | £58.82 | £0.82 | 220 (guessed) | 224 | £1.95 / £64.89 |
| Photos + BOM file + drill/Gerber files | **£57.13** | £46.04 | £2.30 | 1,000 (measured) | 322 (from the file) | £3.89 / £48.43 |
| Hand reading of the photos (stand-in, round 2) | £52.32 | £41.36 | £2.42 | 1,000 (stated) | 328 | — |

With the files attached the tool lands within 10% of the careful hand reading, and
every line states its basis (named-part range, class table, catalogue). The £48 "to
verify" is the six named ICs: they are inside the tool's ranges, and only a quote
closes them. Without the files the tool is still costing a photo, and says so.

Why the photo-only number will never be exact: a photo cannot show the via count
(£1.50 here), the layer count, or the passives under a shield; and the model's
component count is a judgement (224 vs 322). Attach the BOM and the fab data.

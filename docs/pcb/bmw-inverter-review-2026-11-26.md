# BMW rear-axle inverter control board — what the should-cost taught the PCB tool (26 Nov 2026)

The board: G6-CTRL REV007, China build, 400,000 boards a year, 6-year programme, an A2Mac1 BOM of 39 rows / 1,189 parts with
manufacturer part numbers. The manual should-cost (`calculator/scripts/bmw-rear-inverter-2026-11-26/`) went from £111.75 to £74.48
ex-works over four rounds; the tool, run on the same BOM and photos, stayed at £108.89 ex-works / £112.97 delivered (China market,
with the TC389 price typed in). This page lists why, and what was changed in the tool. Rules 7–9 were approved by the user on
26 Nov 2026.

## Why the first figure was high

| Cause | Effect on the manual should-cost |
|---|---|
| Parts priced at Western distributor listings, not the China market a Chinese EMS buys in | −£19.49 components (round 4) |
| Lines held at their own price break (or flat at 300k) though most are bought in millions a year | −£3.70 (round 2), with the TI change below |
| TI's own store (TI.com 1,000+) not read; it is below the distributors | −£10.38 on 8 TI parts (round 2) |
| ICT / functional test: operator and overhead added on top of a station rate that holds them; coating at an unsourced £/cm² | −£0.78 assembly (round 2) |
| Customer gate-drive transformer priced on a dearer equivalent | £7.72 → £2.80 |

## What was wrong in the tool (found on this board)

| # | Finding | Tool before | Fix |
|---|---|---|---|
| A1 | A power MOSFET in DFN fell to "QFN IC (unidentified)": `tableTypeOf` maps a transistor to `ic_soic` and no discrete row knew DFN / SO-8 | PJQ4548P £1.64 (China reel ≈ £0.05) | `power MOSFET DFN / SO-8 class` row from 37 catalogue AEC-Q parts (p10–p90 £0.36–1.00, median £0.63); a transistor with no package never takes an IC range; eFuses / smart switches stay ICs (`FET_IC`) |
| A2 | Isolated gate-drive transformer on the generic "signal transformer" row | £1.26 a part | `transformer.gd` row from five sourced gate-drive / bias transformers (£1.17–2.63, median £1.74) |
| A3 | TO-220 power resistor priced as a "power device" | TO-220 device row | `res_pwr` row: upper bound PWR221T-30 read (£2.01 at 10k), lower bound a stated heuristic |
| A4 | 1210 MLCC on the 1206 row | 1206 row | `cap1210` row from 8 catalogue AEC-Q 1210 parts (£0.20–0.47) |
| B1 | A BOM file whose designator column holds row names ("Integrated Circuit 11", A2Mac1) was split into "Integrated", "Circuit", "11" — each one part, the quantity column lost | 1,189 parts read as ~120 | a cell is split only when every token is a designator; otherwise one line with the file's quantity |
| B2 | The BOM's package contradicted the part number (TC389 "LFBGA-292"; every TC389QP is 516-ball) — not caught | silent | an exact code whose catalogued package states another pin count is priced and flagged (`BOM_PACKAGE_CONFLICT`) |
| B3 | Board size from photos is the model's guess | 194 × 155 mm (true ≈ 280 × 220) | optional `scaleReference`: the model gives PIXELS (board, one large part), the tool takes the part's body in mm from the BOM / package table |
| B4 | Partial (selective) coating charged on the whole side | full side | `coatedAreaPct` on the PCB form (`coatedShare`, server and screen) |
| B5 | Test stations — checked: the tool charges station time × 2 × labour (tester + operator) with no extra overhead; the double count was the manual's only | — | none |
| M1 | The merge script's re-price pass dropped `packing` / `evidence` from 1,170 stored observations (prices unchanged that run; the next merge would have re-priced round-6 parts without their packing) | — | kept |

## Rule changes (approved)

7. **Volume.** Every line is carried to the parts bought (quantity a board × boards) along its own slope — the catalogue entry's
   `volumeModel.b`, else the franchise curve (10k = 1k × 0.85) — up to `VOLUME_CAP_PARTS` = 10,000,000, derived and labelled.
   `volumeRule` on the response gives the components held flat at 300k (the old rule) beside it.
8. **Maker prices.** A maker's own store is a source (merge rule 10, `MAKER_STORES`; TI.com only so far): its 1,000+ price sets
   a break when it is lower than the distributors', carried along the distributors' slope; it never sets the slope. onsemi's
   "reference price" states no quantity and is not used. The 8 TI parts on this board and 14 other BMW parts (Digi-Key rows read
   for the costing) are merged: `scripts/pcb-research/2026-11-26-bmw/`.
9. **Market factor.** On a build in a sourced market with the engineer's "China market" choice, a line with no China price of
   its own is the global price × the measured China ÷ catalogue ratio of its group, written from data by
   `scripts/pcb-market-factors.mts` (`server/data/pcb-market-factors.json`):

   | Group | Pairs | Median | Quartiles |
   |---|---|---|---|
   | ICs (not TI) | 19 | 0.534 | 0.358–0.799 |
   | TI ICs | 9 | 0.988 | 0.746–1.064 |
   | Discretes, magnetics, passives | 34 | 0.395 | 0.284–0.678 |

   Never applied to a maker price or a catalogue estimate (the ratio is against distributor prices). The components at the
   quartiles are `componentMarket.factorBand`. Global prices stay the default.

## Effect

| Board | Before | After | Note |
|---|---|---|---|
| BMW inverter, China market, no typed price (live browser run) | £112.97 delivered (with the TC389 typed) | £79.18 delivered, £76.30 ex-works, components £53.72 | manual £77.34 / £74.48 / £52.85 |
| BMW inverter, global prices (live) | £123.51 | £114.49 | |
| Camera board (price paid £17.00 delivered) | £16.18 (−4.8 %) | £15.98 (−6.0 %) | rule 7: at 250k boards most lines pass 300k parts |
| EDU board, China market | £166.34 | £125.24 | manual £150.56 applied no factor; not a price paid |
| EDU board, global | £191.93 | £191.23 | 10k boards: few lines pass 300k |

The one board with a price paid moved 1.2 points further below it. One price paid cannot settle a rule (five are needed before
any accuracy is claimed — `npm run accuracy:pcb`); prices paid go in `scripts/actuals/pcb-actuals.csv` and the board set.

## Follow-up (27 Nov 2026)

**Wider China sample, from data already held.** The China research read every part on szlcsc AND on LCSC.com: szlcsc's
ex-VAT CNY price is 5.355 × LCSC's US$ price (median of 382 parts, range 4.83–5.87). So an LCSC.com row in the catalogue is a
China price for that part once converted:
- a part with an LCSC row of 1,000+ parts now takes it, converted, as its own China price (`lcscConversion`, ahead of any
  group factor);
- the group factor is measured on both sources against the NON-LCSC distributor price (it is applied only to parts with no
  China or LCSC price, so its denominator holds none), `scripts/pcb-market-factors.mts`:

| Group | Pairs (szlcsc + LCSC) | Median | Quartiles | szlcsc alone | LCSC alone |
|---|---|---|---|---|---|
| ICs (not TI) | 37 (17 + 20) | 0.618 | 0.467–0.818 | 0.606 | 0.668 |
| TI ICs | 21 (7 + 14) | 0.679 | 0.494–0.960 | 0.797 | 0.566 |
| Discretes, magnetics, passives | 54 (32 + 22) | 0.489 | 0.300–0.760 | 0.337 | 0.718 |

The two sources agree on ICs and disagree on discretes (the szlcsc research picked commodity parts, the catalogue's LCSC rows
are mostly branded automotive parts): the discrete factor is uncertain and its band is wide. The milder factors raise the China
market figures: BMW £79.18 → £84.06 delivered (live, no typed price; manual £77.34), EDU £125.24 → £132.39.

**Customer-specific parts.** A line whose BOM says custom / customer part / bespoke, or whose part number carries a vehicle
maker's name (BMW-8-15T), and that has no exact catalogue code, is a placeholder price: flagged on the line, first in the
verify list ("get a quote") and in a `CUSTOM_PART_QUOTE` warning (`server/utils/pcb-custom-parts.ts`).

**Named-IC ranges.** `scripts/pcb-named-range-review.mts --write` compares every named range with the distributor-priced
catalogue parts it matches (`server/data/pcb-named-range-evidence.json`). Most ranges sat above their own sourced parts (SPC58
£8–40 v 7 parts £1.87–7.36; Maxim/ADI PMIC £2.50–6.50 v 6 parts £1.45–2.50; AURIX TC3xx £15–60 v 7 parts £17.72–41.75). Now:
≥ 3 sourced parts → the range is theirs and the point never lies above their median; 1–2 → the stated range widened to take them
in; none (14 ranges) → as stated. A named range prices only a part the catalogue does not hold, so the four boards above do not
move; the model is shown the same ranges for the markings it reads.

## Still open

- The China discount for discretes: the two sources disagree (0.34 v 0.72); a page-read round on szlcsc for branded automotive
  discretes would settle it. szlcsc blocked automated reads during this review.
- 14 named ranges have no sourced part behind them (S32R4x, R-Car V4H, EyeQ, Sony / OmniVision imagers, TEF810x, …).
- Only TI publishes a store price that could be read; other makers' direct prices are not sources yet.
- `scaleReference` depends on the model returning pixel measurements; it is not exercised by a live model run here (the stand-in
  reply has no scale reference).
- The power-resistor row has one sourced price.
- Accuracy against prices paid: one board (camera). Prices paid go in `scripts/actuals/pcb-actuals.csv` and the board set.

## Proof

`tests/pcb-bmw-inverter-review.test.ts` (each fix, and the BMW board through Stage 4 from its A2Mac1 BOM file); the PCB suite;
`npx tsx scripts/arith-audit/pcb.ts` (shadow model updated to rule 7: 738 PASS, 0 FAIL); `npx tsx scripts/pcb-catalogue-audit.ts`
(0 errors); `npm run accuracy:pcb`.

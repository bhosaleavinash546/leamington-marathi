# PCB class rows — pricing an unread line like the parts of its own kind (EDU v5, 25 Nov 2026)

After the v4 recount the EDU control board (Dana TM4 Gemini CTRL, China, 10,000 a year) cost **£212.97** delivered in
the tool against **£156.41** in the manual should-cost. £53.60 of the gap was components, spread over ~60 lines that the
photos cannot name, each priced inside its class range. The engineers asked for the tool to come closer. Nothing below is
tuned to this board or to a price paid: each change is a rule that was wrong for every board, with its evidence in
`calculator/server/utils/pcb-class-pricing.ts` and a test in `calculator/tests/pcb-class-rows-v5.test.ts`.

## What was wrong

1. **The default point lay above the evidence's own median.** An unread line is priced at the lower-half midpoint,
   lo + ¼(hi − lo). The catalogue rows are [p10, p90] of real distributor prices, which are skewed (p90 is often ten
   times p10), so on **14 of the 34** catalogue rows the "lower half" point was dearer than half the parts of that kind
   (0603 MLCC: point £0.0337, median £0.0207). The point is now never above the median of the sourced prices behind
   the row (`ClassRange.p50`, `classDefaultPrice`).
2. **Rows were built from the wrong population.** The catalogue rows take every catalogued AEC-Q part a line of that
   class would take — and the class rules filed many parts in the wrong class, so the rows mixed kinds:
   - resistors described as "Thick film 10k 1%" (no "resistor", no "Ω") and NTC thermistors sat in the 0402 / 0603 / 0805
     **MLCC** rows; SMD aluminium / hybrid polymer cans (£0.13–0.95) in the 1206 MLCC row;
   - isolated amplifiers (AMC13xx / AMC33xx / Si8931, £1.9–3.4) and current-sense amplifiers (INA240, AD8418) made up
     11 of the 15 parts of the **op-amp** row (median £1.70 for the row an LM2904 line takes);
   - EEPROMs were priced with NOR flash; rectifier / Schottky diodes were 10 of the 11 parts of the **fuse** row; CAN /
     Ethernet ESD parts sat with small-signal transistors.
   Each kind now has its own row: chip thermistor, SMD aluminium / hybrid can, isolated amplifier, current-sense
   amplifier, EEPROM, general-purpose op-amp / comparator, rectifier / Schottky, ESD / TVS protection in SOT-23,
   2010 / 2512 power resistor; "thick / thin film", a bare "10k" and "jumper" read as a resistor. The catalogue rows were
   rebuilt (`scripts/pcb-class-rows/check.mts --write`).
3. **Hand rows with no source.** Chip resistor rows (automotive) now come from the catalogue's general-purpose thick-film
   AEC-Q200 parts (0402: AC0402FR £0.0018 … CRCW0402 £0.0047, was £0.003–0.012); logic from the catalogue's AEC-Q gates;
   a pin / wire-to-board header has its own row (it took the TH connector row, £1.24 for a 2 × 4 debug header) — floor
   page-read (JST B5B-XH-A £0.030, szlcsc), ceiling £0.40 a labelled engineering heuristic (no franchised page could be
   read); the test-point floor is the page-read RH-5015 at £0.032 (it was a £0.09 search listing never read).

A line that was too CHEAP moved up too: the EDU board's isolated amplifiers (U8, U61) were in the op-amp row at £0.76; they
are now £2.20 (manual £2.12).

## Effect (Stage 4, the same analyses — `scripts/edu-ctrl-2026-11-25/replay-reprice.ts`, `boards-check.ts`)

| Board | Before | After | Note |
|---|---|---|---|
| EDU control board, delivered UK (v4 reading, live re-price replayed) | £212.97 | **£187.61** | components £163.69 → £141.16; manual £156.41 |
| EDU control board, ex-works China (live: real server + browser, same reading) | £205.31 | **£180.84** | manual £150.56; gap £54.75 → £30.28 |
| Camera board, BOM picture, China 250k (**one price paid: £17.00**) | £16.71 (−1.7 %) | **£15.97 (−6.1 %)** | one line: 49 × 0603 MLCC £0.0265 → £0.0137 |
| Camera board, photos only, China 250k | £16.05 | £14.45 | |
| Radar board, photos, China 10k | £71.82 | £69.36 | |
| Radar board, photos, China 250k | £57.20 | £55.11 | |

**The camera board moves away from its one price paid.** The line that moved is priced at the median of the
catalogue's real AEC-Q 0603 MLCCs (£0.0174 at 10k, ×0.79 on the volume curve) — the evidence for the part is sound,
so something else on that board is under-priced or the price paid holds scope the model does not. One price paid is not
a calibration; this is stated, not corrected.

## What still separates the tool from the manual on the EDU board (£31 of components)

- **≈ £14 — the market.** The manual buys passives, small discretes and references at China whole-reel prices
  (szlcsc, read 25 Nov 2026); the tool's rows are franchised-distributor prices. On the same parts the China reel is
  0.2–0.9× the catalogue's 10k price (passives / discretes ≈ 0.5, ICs ≈ 0.9). A country component index was removed in
  Oct 2026 (pipeline review F13) because it was unsourced; a sourced China market row set would answer that objection but
  changes every China costing — a decision, not a fix.
- **≈ £12 — the manual's own engineering estimates** (J22 / J23 board-to-board, J2 / J3, J1, press-fit pins, motor-line
  inductors, PTC thermistors, T1, relays): neither side has a sourced price.
- **≈ £6 — parts the manual names and the tool cannot** (a comparator read as an LM2903, a sealed connector by family).

## Open

- The PCB shadow model (`scripts/arith-audit/pcb.ts`) has carried 16 failures since packages A / C (bare board: China
  market ASP, 18 × 24 in panel, drilling allowance — the shadow was not updated). This change adds one knock-on
  (radar, UK, cost of quality: 5 % of the shadow's own bare board). The point rule is updated in the shadow.

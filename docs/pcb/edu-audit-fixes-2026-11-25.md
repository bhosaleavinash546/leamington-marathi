# PCB tool fixes from the EDU control board audit — packages A and C (25 Nov 2026)

An independent 10-page audit of the EDU control board should-cost (Dana TM4 Gemini CTRL, China, 10,000 a year, 6 years)
was reviewed line by line (`calculator/scripts/edu-ctrl-2026-11-25/audit-review/`): 19 tool gaps. The user approved
packages A (stop mispricing — rules and inputs) and C (rates from market evidence). Package B (missing operations,
full-economic / invoice views, delivery terms) and D (reporting) are not done.

## Result (live, real server + browser, the stand-in model replaying the same reading)

| Board | Before | After | Note |
|---|---|---|---|
| EDU control board, delivered UK (size 395 × 215 mm, 552 g typed) | £284.76 | **£241.54** | ex-works £274.57 → £232.88; bare board £44.25 → £14.29 |
| EDU, with lot 1,000 boards and programme 6 years typed | — | **£240.87** | set-ups per lot, fixtures over 60,000 boards |
| Radar demo board, photos (China) | £60.73 | £57.20 | |
| Radar, with its BOM picture | £49.16 | £48.58 | |
| Camera board (one price paid: **£17.00**) | £16.15 (−5.0 %) | **£16.71 (−1.7 %)** | parts up (evidence rows), board down |

The EDU gap to the manual should-cost (£154–174 ex-works after the audit review) is now mostly the parts no photo
identifies: 70 lines priced inside their class range. A BOM file moves them to their own prices; nothing was tuned to a
price paid.

## What changed (each with a test in `calculator/tests/pcb-edu-audit-fixes.test.ts`)

**Package A — rules and inputs**
- **G-01 test points.** A loop / terminal / named test point (Keystone 5015 …) is a priced part; only bare pads are not
  fitted. New `testpoint` class row: £0.09–0.15 (Keystone 5015 Digi-Key $0.18 at 5,000, read 25 Nov 2026).
- **G-02 class collisions.** The not-fitted test-pad rule applies to test / connector / mechanical lines only (a PMIC
  "beside the test points" was £0); hardware words ("can") never make an electrical part mechanical ("CAN common-mode
  choke"); a body stated in mm ≥ 3.2 or an 1812 / 2220 case is a large passive (not the 0603 default); the ref-des
  letter counts only on a real designator ("Resolver boost inductor pair" was a resistor); logic gates before the
  package row; current-sense shunts have their own row.
- **G-03 panels.** 18 × 24 in (457 × 610 mm, the most common production panel — Epec) added; the panel with the
  highest utilisation wins (it was "most boards", which puts a small board on the largest panel).
- **G-04 sampling cadence.** Class-3 microsection and coupons per panel (default, as before) or per production lot —
  the PCB form's "Class-3 coupon sampling".
- **G-08 lot size and programme life.** PCB form inputs; set-ups per lot, one-off fab tooling / AOI / X-ray / ICT
  fixtures over annual × years. Blank = one lot a year, one year (as before).
- **G-14 package check.** A catalogue FAMILY price in another package (pin count) is not used.
- **G-15 ASIL.** The costed ASIL is the engineer's (PCB form). Until set, nothing ASIL-dependent is costed (no burn-in,
  QM / unknown NRE tier) and screen, PDF and Excel say "not confirmed" beside what the photos suggested and what the
  parts list supports (`guardAsil` → `claimed` / `supported` / `costed` / `costedFrom`).
- **G-19 FX.** The Components basis line prints the catalogue's FX snapshot (29 Sep 2026).

**Package C — market evidence**
- **G-05 drilling.** Up to 1,000 holes a dm² is inside the per-area price (PCBasic: 100,000 holes/m²; JLCPCB 150,000);
  only holes above are charged. The EDU board's £8.54 via line is £0.
- **G-06 China automotive board.** `server/data/pcb-market-evidence.ts`: an automotive board built in China is priced at
  the market's selling price per m² — Chaoying (超颖) prospectus, 4–6-layer boards (68.6 % automotive) ¥995.31/m² and
  8-layer-and-up ¥2,362.21/m² (2024), × 1.145 (mid of the +12–17 % automotive PCB rise to Q1 2026, Sina 17 Sep 2026),
  shaped within the class by the table's own layer adder, + ¥105/m² class-3 extras (PCBasic). It holds yield, drilling,
  finish, test and the automotive grade, so no IATF / laminate / microsection / coupon adder is added; only holes above
  the allowance, blind / micro vias, HDI, heavy copper and the tooling set-up are. Other countries keep the table +
  premium method (no ASP read for them).
- **G-12 class rows from the catalogue.** `scripts/pcb-class-rows/check.mts --write` sets the AEC-Q range of every row
  with ≥ 10 catalogue parts from ≥ 2 distributors to the catalogue's own p10–p90 at 10k
  (`server/data/pcb-class-rows.json`, 34 rows; never by hand). Not plain resistors (the catalogued ones are precision /
  anti-surge parts) and not the imager (its own volume rule). Example: CAN transceiver SOIC £1.13 → £0.61 (55 parts,
  median £0.50); unidentified BGA £63.50 → £11.51; 0805 MLCC £0.15 → £0.05; 1206 MLCC £0.09 → £0.25 (raised: 45 parts).
- **G-13.** `TLF35584QVVS2` (stored £2.47, below every listing seen) is queued for a re-read in
  `scripts/pcb-research/queue.json` — a catalogue price moves only through the research merge.

## Closed later (25 Nov 2026)
- **EDU v6** (`docs/pcb/edu-v6-accuracy-programme-2026-11-25.md`): G-07 operations (second reflow side, second coated
  side, inspection / masking, press-fit, programming, functional + HV test), G-09 full-economic / EMS invoice /
  customer-supplied parts, G-12 class rows and the China market option.
- **Quick closes** (`tests/pcb-audit-quick-closes.test.ts`):
  - G-10 delivery terms: PCB form "Delivery terms" — delivered UK, duty paid (default) or ex-works (no freight, no UK duty,
    no duty on the grade); delivered costings list the legs the line-haul freight does not hold (inland, export
    clearance, terminal handling, broker, delivery to site); reports follow the terms.
  - G-11 first-pass yield: typed FPY replaces the dppm table's rework rate (which says it is unsourced).
  - G-16 / M-06: the band carries a SOURCED range (the quantity ranges the reading states; the other component basis —
    global v the build country's market) apart from the judgement corridor (identity / scope ratios, with its basis) —
    screen, PDF, workbook.
  - G-18: a ten-item information request ticked from what the costing holds (`src/export/pcb-info-request.ts`) —
    screen, PDF, workbook.
  - G-19: a contract US$ / £ re-prices catalogue and class-range prices (US$ listings at the 29 Sep 2026 snapshot);
    China-market and engineer prices keep theirs.

## Not done
- Package B remainder: staking / potting and a selective-solder line as operations.
- Package D: fab inputs for thickness, inner copper, Tg/CTI, via fill, ENIG thickness, impedance tolerance (G-17).
- G-13: TLF35584QVVS2 catalogue price (queued for re-read, round 6).
- Class rows with too few catalogue parts keep their hand-set ranges (pin headers, hybrid capacitors, large
  electrolytics, logic); the China SMT rate per placement was not changed (the EDU assembly gap is missing operations,
  not the rate).

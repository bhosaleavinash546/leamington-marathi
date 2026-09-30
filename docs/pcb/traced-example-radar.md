# PCB photo → should-cost: a traced worked example

Board: 77 GHz automotive radar module (NXP S32R294), seven photos, no BOM file,
no fab data. China (Shenzhen/Suzhou), 250,000 boards a year, rates as of
29 Sep 2026. Every number below is reproduced by `tests/pcb-headline-trace.test.ts`
against the tool's own rate tables; the replayed run is
`scratchpad/pcblive/result-real-C.json`.

**Headline: £72.33 per board, automotive grade (ASIL-C).** Band £57.61 – £105.67.

## What the AI does, and what it is never allowed to do

| Step | Model | What it returns | Money? |
|---|---|---|---|
| 1 Classify | Haiku 4.5 | board domain (automotive_adas, 0.95) | no |
| 1b Safety | Haiku 4.5 | ASIL level and safety functions | no — only selects the burn-in rule |
| 2 Read chips | **Sonnet 5.5** | the markings printed on the chips | no |
| 3 Parts list & build | **Sonnet 5.5** (Opus 5.5 with "Deep analysis") | ref-des, package, quantity, part number, a price *estimate* inside the class range; layers, size, vias, finish (all estimates) | no — its price only picks a point inside a range the tool sets |
| 4 Cost | none | everything below | all of it |

The Stage 3 request is structured output (a JSON schema the answer must match),
streamed, and it no longer asks for any cost field. Its first-pass numbers from
before this change are kept in `costEstimates.aiFirstPass` for audit only.

## Step 2–3: what was read, and what the tool did with it

Chip markings read: `FS32R294KCMJD`, `TEF8105 …`, `MAX20431A …`, `winbond 25Q32JW…`,
`TI 1044AV …` (×2). The model's parts list named only the S32R294; the other four
were attached to the line of the same function (warning `OCR_MATCHED_BY_FUNCTION`)
and priced inside the tool's own ranges for those parts:

| Line | Part | Basis | Unit £ (at 250k) |
|---|---|---|---|
| U1 | S32R294 radar MCU | named-part range £22–48 ×0.88 | 28.16 |
| U2 | TEF8105 transceiver | named-part range £9–22 ×0.88 | 7.92 |
| U6, U7 | MAX20431A PMIC | named-part range £2.50–6.50 ×0.88 | 4.84 |
| U3 | W25Q32 flash | named-part range £0.30–1.20 ×0.88 | 1.06 |
| U8 | TCAN1044 CAN | named-part range £0.35–1.20 ×0.88 | 1.06 |
| U4,U5 / U9 / U10 | unnamed SOIC / QFN | class table, ceiling = class median | 1.23 / 2.82 / 1.06 |
| D1–D6, Q1–Q4 | SOT-23 discretes | class table (AEC-Q) £0.05–0.12 | 0.12 |
| C_bulk1,2 | electrolytic 100 µF | class table £0.12–0.60 | 0.60 |
| R1–R70, C1–C90, C91–C120 | 0402/0603 passives | class table (AEC-Q) | 0.0053 / 0.0132 / 0.0264 |
| J1 | sealed connector | class table, ceiling £6 | 5.28 |
| J2, J3 | "header pads" | not fitted | 0.00 |
| **BOM at 250k** | | | **£66.84** |

Placements: the model said 224; the priced list has 222 SMT + 2 through-hole +
2 unfitted pads, so assembly is costed on **222** (warning `PLACEMENTS_FROM_BOM`
fires when the two differ by more than 10%).

Board build (estimated from photos — a photo cannot show these): 8 layers,
87.8 × 48.9 mm (measured from the label), immersion silver, **220 through vias
(guess)**, impedance controlled, one BGA.

## Step 4: the cost, line by line (China rates, `pcb-country-rates.ts`)

Area A = 87.8 × 48.9 / 10 000 = **0.4293 dm²**. Panel 480 × 350 mm, 30 boards up,
utilisation 0.767 → waste factor W = 1/0.767 = **1.304**.

### Bare board — £2.06

| Item | Formula | £ |
|---|---|---|
| Base 2-layer | A × 0.116 × W | 0.065 |
| Extra layers | A × 0.07379 × 6 × W | 0.248 |
| Immersion silver | (base + layers) × (1.10 − 1) | 0.031 |
| Through vias | 220/100 × 0.1897 | 0.417 |
| Controlled impedance | (base + layers) × 18 % | 0.056 |
| Tooling set-up | 12.65 / 250 000 | 0.000 |
| *commercial board* | | **0.82** |
| Automotive grade: IATF fab premium 18 %, automotive laminate (8L: 40 % × 50 %), IPC class-3 microsection + coupon tests per panel ÷ 30 | | **1.24** |

### Assembly & test — £7.76

| Item | Formula | £ |
|---|---|---|
| SMT placement | 222 / 3600 × £11.6/h + 18.97 / 250 000 | 0.715 |
| Through-hole | 4 joints × 0.009487 | 0.038 |
| AOI + X-ray (BGA) + ICT | 0.3689 + 1.265 + 2.635 | 4.269 |
| *commercial assembly* | | **5.02** |
| Automotive grade: IATF line 20 %, IPC class 3 5 %, serialisation 0.05, burn-in ASIL-C 4 shifts × £180 / 500 boards = 1.44 | | **2.74** |

### Components — £58.82

BOM £66.84 × China sourcing multiplier 0.88.

### Logistics — £2.58

Sea freight 0.096 kg × £0.40 = 0.04 (weight estimated as area × layers × 28 g;
a measured weight replaces it); UK import duty 3.7 % of the customs value
(2.06 + 7.76 + 58.82) = 2.54.

### Energy, packaging, yield — £1.11

Energy (0.773 + 0.238 kWh) × tariff = 0.08; ESD packaging 0.06; cost of quality at
800 dppm: λ = 222 × 800/10⁶ = 0.178 → 0.178 × (0.95 × rework 2.32 + 0.05 × scrap 64.7) = 0.97.

### Total

2.06 + 7.76 + 58.82 + 2.58 + 1.11 = **£72.33**.

## Where the number is soft, and what closes it

| Input | Now | Closes it |
|---|---|---|
| Six named ICs (£43 of the £67 BOM) | inside the tool's ranges — no quote | a distributor quote or a live-pricing key; they are the "to verify" £64.89 |
| Via count 220 | a photo guess; ~1,000 on this board would add ~£1.50 | attach the drill file |
| Layer count 8 | a photo guess | attach the Gerbers |
| Part count 222 | the model's reading | attach the BOM file |
| ASIL-C | the model's judgement; adds £1.44 burn-in | confirm against the safety concept |
| Import duty 3.7 % | rate table assumption for HS 8537 | confirm the tariff line for the assembly |

With the BOM file and drill/Gerber files attached, the same board costs £57.13 +
automotive grade (see `radar-live-run-2026-09-29.md`, round 4): the part count and
via count stop being guesses.

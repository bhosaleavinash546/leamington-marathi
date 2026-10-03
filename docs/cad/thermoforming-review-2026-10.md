# Thermoforming cost model — end-to-end review, 3 October 2026

The thermoforming model was traced from the uploaded CAD to the pound, as the
previous commodities were. Every finding has a test in
`calculator/tests/thermoforming-review.test.ts`.

**Summary.** No thermoformed part could be costed headless. The rules bought a
sheet lighter than the part made from it, for two reasons:

- **Wrong plan area.** The tool read its plan from the moulding draft check's
  silhouette. On an open cover that was the side view: 139 cm² against a
  600 cm² plan.
- **Under-stated gauge.** The sheet gauge was worked back with a bounding-box
  draw formula that under-states how far a deep part stretches.

Material utilisation then exceeded 1 and the validator refused the costing.
Behind that:

- **Parts per sheet.** Headless set it to sheet weight ÷ part weight. The
  rules' sheet is one part's blank, so a part was charged no web or trim at
  all.
- **Screen fields mixed up.** The screen wrote the draw ratio into the index
  time and kWh/kg into the electricity price. It also kept its own 4 parts per
  sheet, machine, crew and tool cooling.
- **No cooling headless.** Headless passed no cool time and no gauge, so
  cooling was 0.
- **Trim on the former.** Heavy-gauge trim sat inside the forming cycle.
- **Pellet resin.** The material menu offered pellet resin.
- **Silent sheet-metal routing.** A part named "… ABS VACUUM FORMED" went to
  sheet metal without a question.

## 0. Test parts

Modelled in `cad-audit/parts/TF_modelled_parts.py`. **Not customer parts.**

| Part | Geometry |
|---|---|
| Battery-box lid | 900 × 600 × 250 mm, R25, 4 mm formed wall, HDPE — a deep heavy-gauge form |
| Trim cover | 300 × 200 × 40 mm, R8, 2.5 mm formed wall, ABS — a shallow vacuum form |
| Storage tray (from the moulding review) | 600 × 400 × 60 mm, 3 mm wall, PP — costed as a thermoforming for comparison |

The lid and the cover are in the real-parts baseline, at its 50,000/yr. The
review test pins them at 5,000/yr.

## 1. Findings

| # | What was wrong | Effect | Fix |
|---|---|---|---|
| 1 | **Plan area = the "along draw" silhouette**, chosen by a moulding undercut test. | Cover: the side view, 139 cm² against a 600 cm² plan. | The largest of the three measured silhouettes. |
| 2 | **Sheet gauge = ray wall × (1 + 2·depth ÷ opening).** | Lid: 7.5 mm sheet, but its plastic needs 9.4 mm. Together with #1, the sheet weighed less than the part. | Mass balance: gauge = part volume ÷ plan area. The formed wall is 2·V/S and is printed beside it. |
| 3 | **Blank = plan × 1.25.** | — | The blank is the outline + 50 mm clamp and trim margin each side. Parts are nested on the chosen former's sheet window with a web of max(25 mm, depth). One up below 10,000/yr; multi-up above (cover: 4 up at 50,000/yr). |
| 4 | **Headless parts per sheet = sheet ÷ part.** | No web charged, half the forming time; failed outright when #1 / #2 made the sheet lighter than the part. All three parts errored headless. | Parts per sheet is the nest rule, on both paths. |
| 5 | **Screen field mix-ups:** the draw ratio was written into `tf-index` (index time, s); the specific energy (kWh/kg) into `tf-kwh` (electricity £/kWh). | Index ≈ 0.2 s on screen against 6 s headless. ABS vacuum forming needs 0.201 kWh/kg, which sat beside a £0.20/kWh default, so that error was hidden. | Index time and electricity price are their own rules; the draw ratio and depth / opening fill the DFM fields. |
| 6 | **No cool time or gauge headless.** | Cooling 0 s headless. | Passed on both paths. |
| 7 | **Every cycle in series**, trim included. | Lid: oven 433 + form / cool 265 + load 20 + trim 56 s. | A rotary former is paced by its slowest station (lid 438 s). Heavy-gauge (≥ 1.5 mm) trim runs off the former on the 5-axis router, per part, with an operator. Thin gauge stays in the cycle. |
| 8 | **Machine, crew, OEE, efficiency, scrap, tool cooling, labour** were screen defaults or the shop's. | The screen kept 4 up and its own machine. | Rules on both paths: <ul><li>small single-station former if the blank fits 800 × 600 mm, else the rotary;</li><li>pressure / twin-sheet by method;</li><li>crew 1; OEE 0.80; efficiency 0.92; scrap 3%;</li><li>water-cooled tool;</li><li>thermoforming operator.</li></ul> |
| 9 | **Pellet resin** (mat-hips, mat-abs, …). The form lists only sheet grades. | — | The menu is the library's thermoforming sheet grades. |
| 10 | **A formed shell went to sheet metal silently.** Its fillets read as bends, and no word in the name reader knew the forming processes. | Lid and cover routed to sheet metal without a question. | The name reader knows thermoforming, vacuum / pressure forming and twin sheet. It also knows blow and roto moulding (the previous reviews). A polymer in the name (HDPE, ABS, PP, …) counts against a pressing. Both parts are now asked, leaning thermoforming. No other baseline part routes differently. |
| 11 | **Twin sheet** needed a topological sealed void. | — | The enclosure probe also counts. |

## 2. Before and after (headless, 5,000/yr)

| Part | Before | After |
|---|---|---|
| Trim cover | **failed** — utilisation > 1 | **£4.94** |
| Battery-box lid | **failed** | **£23.79** (9.4 mm HDPE sheet, 6.26 kg; rotary at the 438 s oven pace; router trim) |
| Storage tray | **failed** | **£7.62** (£6.10 at 50,000/yr; the injection-moulded tray is £8.21) |

## 3. Hand reconciliation: trim cover, 5,000/yr

Library rates:

| Item | Rate |
|---|---|
| ABS sheet | £1.94/kg (web £0.44/kg) |
| Small former | £13.80/h |
| 5-axis router | £16.72/h |
| Operator | £19.64/h |
| Electricity | £0.268/kWh |

Scrap 3% (÷ 0.97); OEE 0.80; labour efficiency 0.92.

| Line | Working | £ |
|---|---|---|
| Sheet | 244.8 cm³ ÷ 600.2 cm² = 4.08 mm; blank (300 + 100) × (200 + 100) mm × 4.08 mm × 1.05 g/cm³ = 0.514 kg for one 0.257 kg part | |
| Cycle | single station: heat 101 + form 6 + cool 41 + load 15 = 163 s; router 20 s + 1.0 m × 12 s/m = 32 s | |
| Material | 0.257 ÷ 0.97 ÷ 0.500 = 0.530 kg × £1.94 − 0.265 kg web × £0.44 = 0.912; oven energy 0.201 kWh/kg × 0.514 kg × £0.268 ÷ 0.97 = 0.029 | 0.940 |
| Process | former 163 s ÷ 0.97 = 0.04668 h × £13.80 ÷ 0.8 = 0.805; router 32 s ÷ 0.97 = 0.00916 h × £16.72 ÷ 0.8 = 0.192 | 0.997 |
| Labour | (0.04668 + 0.00916) h × £19.64 ÷ 0.92 | 1.192 |
| Tooling | £4,370 cast-aluminium vacuum tool ÷ 5,000 | 0.874 |
| Packaging + logistics | | 0.092 |
| Overhead 12% of £4.003; margin 8% of £4.575 | | 0.480 + 0.366 |
| **Total** | | **4.94** |

## 4. Live in a browser

The modelled STEP files at 5,000/yr, a real server and a browser, every field
identical:

| Part | Screen | Headless |
|---|---|---|
| Trim cover | **£4.94** | **£4.94** |
| Battery-box lid | **£23.79** | **£23.79** |

## 5. Second pass — a standard heavy-gauge thermoforming should-cost, line by line

| Element | Status |
|---|---|
| Sheet grade and price (extruded sheet, not pellet) | Done (#9) |
| Sheet gauge from the part | Done (#2), by mass balance |
| Blank, clamp margin, nest, web | Done (#3); web credited at the sheet's scrap value |
| Heat, form, cool | Existing physics (gauge^1.6 soak, gauge² contact cooling) |
| Station pacing (single / rotary) | Done (#7) |
| Trim (router / steel rule) | Done (#7) |
| Machine, crew, OEE, scrap | Done (#8) |
| Oven energy | Charged as a consumable per kg of sheet. **Open:** the former's machine rate also carries an energy lump, so part may be counted twice |
| Tooling: mould + trim fixture | Existing estimator (cavities = parts per sheet) |
| Secondary: drilling, inserts, bonding, painting / flock | **Open** — not priced from CAD |
| Plug assist, pressure box | Method rule; plug assist not costed separately |

## 6. Still open, stated rather than hidden

- **Every constant is engineering-typical:**
  - clamp margin and web gap;
  - the 10,000/yr multi-up threshold;
  - machine windows;
  - load times, router speed;
  - crew, scrap.

  All are printed on the basis. None has been compared with a thermoformer's
  figures.
- **Mass balance assumes the part's plastic came only from the sheet over its
  plan.** Material drawn in from the clamp margin would make the true gauge a
  little thinner.
- **Geometry alone cannot tell a formed plastic shell from a pressing.** Names,
  a declared material or bosses decide. A file with none of them still routes a
  bent open shell to sheet metal, as before.
- **Modelling note:** the first STEP file of each earlier modelled set carries
  the translator's default product name, not the part name. The OCP writer
  resets the parameter on creation:
  - `BM_Washer_Reservoir`, `ROTO_Coolant_Tank`, `RUB_Grommet`, and probably the
    first of the casting, moulding, machining and forging sets;
  - their geometry is right.

  `TF_modelled_parts.py` sets the name after creating the writer.
- **The modelled parts are not customer parts.**

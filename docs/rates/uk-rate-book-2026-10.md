# UK rate book — October 2026

The UK book is the **base** every other country is scaled from. This review rebuilt it from sourced research, the
same way the India book was rebuilt (`docs/rates/india-rate-book-2026-10.md`). Every figure carries its URL and date in
`calculator/scripts/rate-refresh/uk-2026-10/research/*.json`. Every judgement is written in
`uk-2026-10/build-config.py`, and every rate (current v new, decision, basis) is in `uk-2026-10/register.csv`.

```
python3 scripts/rate-refresh/uk-2026-10/build-config.py              # research → scripts/rate-refresh/2026-10-uk.json
npx tsx scripts/uk-book.ts scripts/rate-refresh/2026-10-uk.json        # dry run: the register
npx tsx scripts/uk-book.ts scripts/rate-refresh/2026-10-uk.json --write # writes the UK literals (idempotent)
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-india.json --write   # India re-derived on the new base
```

Tags used below: **Verified** = a primary or market source read for this figure; **Likely** = derived by stated
arithmetic from verified figures; **Unverified** = a single secondary source or an estimate, labelled as such.

## 1. What was wrong

| # | Finding | Effect |
|---|---|---|
| 1 | **Machine rates were shop rates, not machine rates.** 19 build-ups say "Target £X/hr". The VF-2 depreciated £38,456 a year against a £53,204 list price (72% of the machine every year). The 3-axis VMC's £55,660/yr implies a ~£557k machine. The TruLaser 3030's £91,080/yr is 2.4× its estimated price. The robot MIG cell's £75,900/yr is 3–9× the published UK cell band. Power was 23–49 kW on VMCs against 7.4–13 kW measured. | The costing adds the operator, overhead and margin on top of the machine rate, so a shop rate counts all three twice. A UK VMC hour cost about **£115** all-in; it is now **£52** (§6). |
| 2 | **Castings priced as a delivered casting.** The book's CASTING PRICING BASIS adds a "melt/cast/finish stockholder margin" to the metal. The casting engine then adds melt energy, melt loss, the line, labour, fettling, overhead and margin again. | GJS-500-7 was £0.86/kg against a £0.287/kg treated-metal charge. GS-C25 was £2.10/kg against £0.142/kg of scrap. |
| 3 | **Energy 54% above the published industrial price.** Electricity was £0.268 (an Ofgem Q1 figure plus a spot-wholesale pass-through); DESNZ puts the manufacturing average at 17.4 p (+ CCL). Gas was £0.067 against 3.8 p. | Every machine's energy line; every melt, furnace and oven. |
| 4 | **The tariff was hard-coded in five places**: `REGIONAL_DATA.UK`, `UK_ELECTRICITY_BASIS_PER_KWH`, `alBuildup`, `evBuildup`, `energy-uk`, plus the PCB `gb` row. | One edit missed would mis-state every country's machine energy. |
| 5 | **DC01 above DC04.** Commercial cold-rolled was £0.91, above the deeper-drawing DC04 at £0.77. | Inverted grade ladder on the most common sheet. |
| 6 | **Grades below their own metal.** Copper bar £11.05 v metal £11.24; PB1 £13.91 v its Cu+Sn content £14.42; uPVC £0.76 v resin £1.11; NR £1.84 v exchange £1.91. | Under-priced material. |
| 7 | **Labour from a stale survey.** Engineer £42.80 (ASHE: £33.27 loaded), supervisor £35.35, foundry £18.63 (ASHE: £24.60), electronics £17.63 (ASHE: £23.41). | Labour mis-stated in both directions. |

## 2. Energy — Verified (DESNZ), CCL added (Likely)

| | Was | Now | Basis |
|---|---|---|---|
| Electricity | £0.268/kWh | **£0.182/kWh** | DESNZ Quarterly Energy Prices (Sep 2026): manufacturing-sector average Q2 2026, 17.4 p, + Climate Change Levy 0.801 p |
| Gas | £0.067/kWh | **£0.046/kWh** | DESNZ: 3.8 p + CCL 0.801 p |

One constant, `src/engine/uk-energy.ts`, now feeds `REGIONAL_DATA.UK`, the regional re-tariffing basis, the al-extrusion
and EV line build-ups, and (through the generator) the `energy-uk` entry and the PCB `gb` row.

**Push-back noted, not taken:** the September refresh passed a Jun→Sep wholesale rise through (+3.8 p). Most plants buy
forward, the Q3 DESNZ release is not out (end of December 2026), and even the full pass-through (~22 p) sits well below
26.8 p. If the series turns out to include CCL, these figures are 0.8 p high.

## 3. Labour — ASHE 2025, loaded for a 2-shift plant (Likely; skilled is Unverified)

The basic wage is uprated ×1.053 to Oct 2026, then loaded:

- 2-shift premium 18%;
- employer NIC 15% above £5,000;
- pension 5%;
- Apprenticeship Levy 0.5%;
- divided by 1,773 productive hours (an engineer on 37.5 h: 1,705 h).

| Grade | Was £/h | Now £/h | Source |
|---|---|---|---|
| Skilled machinist | 26.19 | **27.95** | median of 3 recruiter points (SOC 5221 ASHE not reachable) — **Unverified** |
| Semi-skilled operator | 19.94 | **24.65** | ASHE SOC 8120 |
| Process engineer | 42.80 | **33.27** | ASHE SOC 2125, day work |
| Foundry / furnace | 18.63 / 22.16 | **24.60** | ASHE SOC 8120 family |
| Electronics | 17.63 | **23.41** | ASHE |
| Inspector | 27.70 | **28.03** | ASHE |
| Technician | 28.81 | **35.17** | ASHE SOC 3113, 2-shift |
| Supervisor | 35.35 | **34.57** | ASHE SOC 8160 **p75** — the research notes an automotive tier-1 shift supervisor sits nearer the p75 than the all-industry median (£28.86) |
| Forge / blow / roto / thermoform / trim-router | 24.17 / 20.65 / 20.14 / 19.64 / 22.66 | 25.15 / 23.07 / 23.07 / 23.07 / 24.65 | ASHE operative SOCs |

On the UK figures a 2-shift engineering technician (£35.17) sits just above a shift supervisor (£34.57) and above a
day-work engineer (£33.27). The regional test now states the UK exception rather than forcing an order the data does not
show.

## 4. Materials — 87 re-priced, 348 held

**Method.** Each family of grades follows one anchor price, in one of four ways:

- **Direct:** the grade takes the anchor price.
- **Ladder:** anchor × (the book's grade ÷ the book's base).
- **Additive ladder:** anchor + the book's premium in £/kg. Used where the premium is alloy content: Mo, Ni, Cr, or ADI's austempering, which the casting engine does not add.
- **Floor:** the price is raised to the metal or resin it contains.

Each re-priced grade keeps its own description under "Earlier note". The note also says what it was ("Was £…/kg").

| Family | Anchor | Was → now (examples) | Tag |
|---|---|---|---|
| CR coil DC01 / DC04 | ArcelorMittal Europe CRC base €880/t delivered = £0.756 | DC01 £0.91 → **£0.756** (DC01 no longer above DC04) | Verified |
| CR automotive (DP, MS, 22MnB5, Usibor…) | CR base × the book's premium | DP600 £1.30 → £1.17, Usibor 1500 £2.00 → £1.80 | Likely |
| Coated (GI, GA, ZE, ZnNi, ZM, tinplate) | HDG base £0.756 (Tata UK HRC £620 + HDG uplift agrees) | DC01 GI £1.11 → £0.756 | Likely |
| 304L / 316L sheet | European 304 CRC effective £2.20–2.49 (mean £2.34); 316L by the Outokumpu surcharge spread | 304L £3.49 → **£2.34**; 316L £4.54 → £3.69 | Verified / Likely |
| Ferritic sheet (430 / 409L / 441) | 304 base − (304 − 430 surcharge) | 430 £2.97 → £1.35 | **Unverified** (derived; no 430 transaction price) |
| Ductile / CGI / ADI / SiMo (charge) | 50% Brazilian pig iron + 50% UK 0A scrap + 1.2% FeSiMg + inoculant = £0.287 | GJS-500-7 £0.86 → **£0.287**; ADI £1.58 → £1.007 (keeps its +£0.72) | Likely |
| Grey / malleable (charge) | 60% cast scrap + 25% steel scrap + 15% pig = £0.169 | GJL-250 £0.64 → £0.169 | Likely |
| Cast carbon / low-alloy steel (charge) | UK 0A scrap £142.5/t | GS-C25 £2.10 → £0.142; G42CrMo4 £2.24 → £0.282; scrap credit £0.28 → £0.125 (it was above the charge) | Likely |
| Cast stainless (charge) | CF8 from virgin units (Ni at LME, Cr via ferrochrome) = £1.805 | CF8 £5.17 → £1.805; CF8M £6.26 → £2.895 (CF8 + the 316 spread) | Likely (upper bound: scrap-based melting is cheaper) |
| Ni-Resist D-2 / D-5S, high-Cr white | composition at LME Ni, ferrochrome, FeSi + the ductile / grey charge | D-2 £3.15 → £2.82 | Likely |
| **Secondary** cast Al (ADC12, A380, A413, A319, LM4, 46200) | Fastmarkets DIN226 / A380 delivered Europe £2.104 (**Jan 2026 — stale**) | ADC12 £2.75 → **£2.104** | Unverified (stale) |
| **Primary-based** cast Al (A356/A357, AlSi10Mg, structural HPDC, A206, LM13…) | floor at P1020 duty-paid Rotterdam £2.787 (LME cash + DP premium, Oct 2026) | held (all but A365, £2.77 → £2.787) — a ladder from a secondary ingot would have put them below primary metal | Verified |
| ETP copper | LME $14,569/t + Aurubis premium = £11.24 | C101 bar £11.05 → £11.24 | Verified |
| Brass rod CW614N / CW617N | Almag mill list €9,990/t = £8.48 | CZ121 £7.70 → £8.48 | Verified |
| PB1 | Cu + 10.5% Sn content £14.42 | £13.91 → £14.42 | Likely |
| Rigid PVC (uPVC, blow, pipe) | S-PVC NWE contract £1.096 / index £1.131 | uPVC £0.76 → £1.11 | Verified |
| PA6 / PA66 unfilled | Business Analytiq Europe index | PA6 £1.68 → £2.19; PA66 £1.89 → £2.55 | Unverified (one source) |
| Natural rubber | SGX TSR20 £1.905 | £1.84 → £1.905 | Verified |

**Held, with the evidence that agrees (push-back):**

| Material | Book | Evidence |
|---|---|---|
| HRPO / S355MC | £0.77 / £0.80 | NW Europe HRC £0.61–0.66; pickling and grade extras account for the gap |
| PP | £0.99 | spot £1.02 to index £1.47 |
| HDPE | £1.05 | £0.97–1.30 |
| ABS | £1.62 | £1.64 |
| Zamak | — | above LME zinc (£2.85) |
| 6063 billet | £3.27 | LME + billet premium £3.20 |
| Electrical steel | in range | GOES safeguard floors £2.4–2.9 |
| Primary cast aluminium | — | at or above P1020 |

**Held without evidence:** bar and SBQ (only alloy surcharges found), magnesium (likely high: China AZ91D £1.65 v book
£3.81, but no European price), titanium, nickel, filled / FR compounds, rubber compounds, composites, paint. PC is
held at £2.52; one index says £2.21.

## 5. Machines — machine only; capex rebuilt where it is sourced

**Rebuilt on sourced capex (13).** For a machine in an evidence group:

- **capex** = reference capex × (this machine's book depreciation ÷ the reference's). This keeps the book's relative sizing at the evidence's level.
- **kW** is scaled from the reference's measured draw.
- **life:** 13 years (German BMF AfA, stationary cutting machines — a published tax life, used as the proxy).
- **maintenance:** 3% of capex (machine-hour-rate worked example).
- **indirect support:** 5% of capex; **finance:** 4% on half the capex (both the library's own line rule).
- **floor, hours and utilisation:** held.

| Machine | Capex | Was £/h | Now £/h | Capex source |
|---|---|---|---|---|
| Haas VF-2 (ref) | £53,204 | 46.24 | **9.05** | US list $70,995 (2026), base machine — Verified (list), options / install excluded |
| CNC VMC 3-axis | £77,006 | 56.85 | **11.08** | VF-2 × book size 1.447 |
| CNC lathe / Mazak QT200 / drilling centre | £56k / £59k / £39k | 41.32 / 51.32 / 31.13 | 7.79 / 9.63 / 6.64 | VF-2 × book size |
| Haas UMC-500 (ref) | £126,275 | 76.94 | **17.07** | UK trade-press price, **2019** — Unverified (old) |
| VMC 5-axis / DMU 50 | £184k / £165k | 87.52 / 97.45 | 19.61 / 21.60 | UMC-500 × book size |
| TruLaser 3030 6 kW (ref) | £374,700 | 87.46 | **29.47** | third-party estimate $400–550k — Unverified (Trumpf publishes no price) |
| Other fibre lasers (Bystronic 4 kW, TruLaser 5030 10 kW, Amada 3 kW) | £283k–562k | 69.52–122.84 | 22.73–42.42 | TruLaser × book size |
| Robot MIG cell | £165,000 | 69.21 | **17.42** | UK integrator band £80–250k, midpoint — Unverified |

**Energy only (143 machines + 36 line build-ups).** The capital was not sourced this round, so it is **held** and the
note says so. Energy is re-priced at £0.182: a median −7.6% on the machine rate. 30 of these 143 carry the "Target
£X/hr" note, and their sourceNote now says so: they may still include an operator or overhead that the costing adds
again. The 22 country benchmark machines (`…-cn`, `…-in`) keep their kWh; their energy line is restated on the new UK basis.

**Lower bound.** The VF-2 figure is the base list price. A production machine with options, tooling and installation
costs more; no UK installed figure was found. At 1.5× list the VF-2 rate goes £9.05 → £11.40/h. On the manifold that
adds about £1.25 a part (+5.6%).

## 6. Hand check — one 3-axis VMC hour, all-in

Per cycle hour on the old book: (machine 56.85 ÷ 0.85 OEE) + (labour 26.19 ÷ 0.92) = 66.88 + 28.47 = £95.35. With
overhead ×1.12 and margin ×1.08 that is **£115.3/h**.

Per cycle hour on the UK book: (11.08 ÷ 0.85) + (27.95 ÷ 0.92) = 13.04 + 30.38 = £43.42. With overhead and margin that
is **£52.5/h**, at one operator per machine. The machining rules man a CNC at 0.5 (one operator tends two machines),
which makes it about £36/h.

**Not done:** comparing this with a UK subcontract shop rate. The research found no citable UK VMC subcontract rate (no
public price list was reachable). Treat the all-in hour as the arithmetic of the sourced inputs, not as a benchmarked
rate.

## 7. Real parts — before and after (headless, 50,000/yr, the recorded answers)

`scripts/rate-refresh/uk-2026-10/compare.ts` costs every recorded real part in seven countries. It was run on the
previous commit and on this one:

| Part | Route | UK | IN | DE | CN | US |
|---|---|---|---|---|---|---|
| MACH_Hydraulic_Manifold | machining | £41.17 → **£22.49** | 10.79 → 10.23 | 46.20 → 26.91 | 22.99 → 13.49 | 37.97 → 23.08 |
| Part1 | machining | £90.56 → **£50.86** | 26.66 → 25.51 | 100.87 → 59.90 | 52.37 → 32.17 | 83.58 → 51.93 |
| PRCR002 stub axle (ductile, safety) | cast + machine | £87.38 → **£53.39** | 17.82 → 17.16 | 99.79 → 63.81 | 43.77 → 24.33 | 81.62 → 52.62 |
| Casting_Braket | cast + machine | £40.31 → **£21.01** | 6.28 → 5.95 | 46.21 → 25.45 | 21.13 → 8.73 | 38.23 → 20.79 |
| steering_knuckle_RH | forging | £41.79 → **£25.34** | 10.15 → 9.63 | 45.99 → 29.47 | 22.12 → 14.11 | 37.64 → 24.96 |
| FORGE_Hub_Flange | forging | £31.76 → **£18.26** | 8.08 → 7.63 | 34.69 → 21.16 | 17.28 → 10.72 | 28.37 → 17.98 |
| test-gear-m3-z38 | gear | £21.74 → £18.52 | 8.26 → 8.19 | 23.23 → 20.55 | 12.16 → 10.84 | 19.54 → 17.45 |
| EXT_Twin_Chamber_Profile | extrusion (PVC) | £2.02 → **£2.27** | 1.16 → 1.16 | 2.33 → 2.30 | 1.24 → 1.24 | 1.84 → 1.82 |
| COMP_Roof_Panel | composites | £443.36 → £432.02 | 193.32 → 194.14 | 492.28 → 488.80 | 240.61 → 239.93 | 408.08 → 405.19 |
| BIW_Inner_Panel | sheet metal | £33.50 → £33.35 | 20.58 → 20.67 | 38.04 → 37.26 | 24.31 → 24.05 | 34.33 → 33.66 |
| IM_Storage_Tray | injection moulding | £7.97 → £7.73 | 3.76 → 3.79 | 9.03 → 8.89 | 4.45 → 4.43 | 7.48 → 7.36 |
| ROTO_Coolant_Tank | rotational moulding | £51.84 → £50.97 | 14.82 → 14.96 | 62.75 → 60.62 | 22.86 → 22.48 | 49.72 → 48.00 |

Median move across the 40 parts:

| UK | IN | DE | PL | CN | MX | US |
|---|---|---|---|---|---|---|
| −0.9% | 0.0% | −1.7% | −0.7% | −0.7% | −0.7% | −1.7% |

Parts that run on CNC machines, castings and forgings fall 35–50% (finding 1 and 2). Plastics, rubber, extrusion,
sheet metal and composites move ±3%: their machines were not rebuilt, and their labour rose while energy fell. The
real-parts baseline is updated (`tests/fixtures/real-parts-baseline.json`).

**Ripple.** Every scaled country takes the UK machine build-ups × its own multiplier, so the double count is removed
there too. India has its own book and moves only where it inherits UK capital (lasers, 5-axis, robot cell). It was
re-generated on the new base (§9).

## 8. Live runs (a real server, a real browser, the UK selected)

| Part | Screen | Excel trace | What the screen and Excel print |
|---|---|---|---|
| MACH_Hydraulic_Manifold | **£22.34 ±12%** | £22.34 | VF-2 £9.05/h, drilling centre £6.64/h, skilled £27.95/h. Each line's trace carries the UK-book note, the capex arithmetic and "Was £46.24/h". |
| PRCR002 (100,000/yr) | **£41.46 ±9.2%** | £41.46 | Foundry labour £24.60/h, sand line £29.90/h |

The stub axle run left the advisory grade question unanswered, so it costed the default grey iron (GJL-250). The
headless baseline answers ductile GJS-500-7 at 50,000/yr (£53.39). No page errors.

## 9. India re-derived on the new base

Two generator fixes came out of this review:

1. **India's ladders read the frozen pre-change UK snapshot.** Its families were defined against that book. The live
   UK price would have broken every casting ratio (GJS-500 fell to ₹15/kg before the fix).
2. **India's machines back out kWh with the new UK tariff** (`UK_ELECTRICITY_GBP_PER_KWH`).

Effects on India:

- India material prices are unchanged.
- The labour ratio is 0.0454 (UK skilled £27.95).
- `machineRateMultiplier` 0.34 → 0.36.
- The India rate-book tests pass unchanged.

## 10. Tests

- **New: `tests/uk-rate-book.test.ts`.** It checks that the five tariff places agree, that energy-only machines keep their kWh, labour = regional table, DC01 ≤ DC04, casting = charge, additive alloy premiums, primary Al ≥ P1020, the no-below-content floors, VMC = machine only, that no UK machine rate went up, and that the register covers everything.
- **Restated with a reason in the test** — each was a figure pinned to the old book:
  - material dates now accept `UK_BOOK_BASIS` (2026-10) beside `RATE_BASIS`;
  - casting-grade-gap and casting-forging-materials;
  - the casting remelt finding, kept on its 2026-09 price so the mechanism is still checked;
  - the stub-axle guard bands;
  - design-to-cost exactness: £0.50, inside the 90% cap;
  - injection-audit: Austria replaces Germany as the dearer-capex, cheaper-power region; the UK supervisor-order exception;
  - TruLaser rate, programming NRE £274, shot blast £0.21, the oversized-press £/part;
  - the part totals.
- `CAD_PROMPT_VERSION` 52: the rules' lines print the new rates.
- **Full suite:** 3,717 passed. Typecheck clean (both configs); build done.
- **Smoke (`e2e/smoke.ts`):** fails at "PCB results show escaped entities — text was escaped twice". It fails the same way on the previous commit. It is not caused by this change and is left for a separate fix.

## 11. Open — what this round did not settle

1. **Machine capex for 143 machines** (presses, brakes, punches, IMMs, die-casting, forging, gear, grinding, heat
   treat, plating, SMT, test). Capital is held. 30 of these carry a "Target £/hr" note and may still double-count an
   operator or overhead. Gear machines, grinders, punches, brakes and presses are the next research round.
2. **Installed v list capex** (§5): a production-spec factor was not found.
3. **No UK subcontract-rate benchmark** to check the all-in hour (§6).
4. **Finance rate (4%) and floor rent (£110/m²)** were not researched; both are held.
5. **DIN226 is from January 2026.** A current secondary-ingot assessment is paywalled.
6. **Skilled machinist** comes from recruiter data. The ASHE SOC 5221 median was not reachable; ONS sites were blocked
   from the research session.
7. **India casting ladders are proportional.** The UK now adds alloy premiums in £/kg (ADI keeps its austempering).
   India's ADI / SiMo / CF8M should get the same treatment in its next round.
8. **Mg, Ti, Ni alloys, compounds, paint, composites** are held without a price.

Accuracy against real purchase prices is still **unmeasured** (`npm run accuracy` has no actuals). This book makes the
inputs defensible; it does not prove the outputs.

# Rate round, 30 Oct 2026: fixing the gaps the per-£ trace found

**Plan agreed:** fix the root causes, not country by country.
- Code first: country service prices and guardrails.
- Then sourced machine capex and materials, as dated refreshes.
- Then overhead / packaging and Hungarian labour.

Research: eight researchers, `scripts/rate-refresh/round-2026-10-30/research/`. This session's network refused direct
page reads (MNB, KSH, find-tender, cninfo, distributor sites), so every figure was read from search-result extracts and
is marked `verify: true`.

## Built (code)

| What | Where | Proof |
|---|---|---|
| **Country service prices.** A book's `services` entry prices a service in the country AND the UK (same service). The factor is local ÷ UK and replaces the wage-and-machine ratio. The basis line says "sourced: …" or "derived from its wage and machine rates". | `country-books.ts` (`CountryServicePrice`, `sourcedServiceFactor`), `regional-services.ts`, `toolroomFactorFor`, `country-book.ts` | `tests/country-services.test.ts` |
| **Harness predicates as pure functions**, each proven able to FAIL. A crossover check had never run. | `e2e/trace-checks.ts` | `tests/trace-checks.test.ts` |
| **Provenance module.** Adds the class "at par on a SOURCED price" (Hungary: the same machine / material on the same market). | `scripts/country-trace/provenance-lib.ts` | — |
| **Provenance ratchet.** No country may become less sourced over 15 real parts: median part ≥ baseline − 0.5 pt, held share ≤ baseline + 0.5 pt. | `scripts/country-trace/ratchet.ts`, `tests/fixtures/country-provenance-ratchet.json` | `tests/country-provenance-ratchet.test.ts` |
| **UK generator registers machines added after its snapshot.** The pilot's HMC had been hand-added to the register. | `scripts/uk-book.ts` | `tests/uk-rate-book.test.ts` |
| **Shop-multiplier evidence on the basis line**, written by the generator. | `cfg.shopMultipliersBasis` → `REGIONAL_DATA.<cc>.shopMultipliersBasis` | — |

## Rates changed (dated refreshes)

| Book | Change | Evidence | Effect |
|---|---|---|---|
| UK | Press brakes rebuilt on capex £120,000 | Amada UK, Ministry of Justice awards £112,500–120,000 (Feb 2026); TRUMPF TruBend 3100 new €136,000 agrees | £53–72/h → £15–20/h machine only. The held "Target £55/hr" build-up implied ~£700k. |
| UK | Autoclave rebuilt on £333,765 | ASC Process Systems, University of Bristol award (Jul 2023); a smaller, hotter vessel, so Low | £66.79 → £42.43/h |
| UK | RTM press rebuilt on £175,373 | Langzauner presses, UK university awards £230,000 (2020) and £120,745 (2021) | £22.78 → £17.80/h |
| UK | Foundry charges ÷ (1 − melt loss): iron 0.98, steel 0.96 | Same method as the PL / DE / HU books. The engine loses metal only on the remelted gating (`casting.ts` metalLostKg), so the part's own metal loss belongs in the charge. | GJS-500-7 £0.287 → £0.293; GS-C25 £0.142 → £0.148 |
| China | Fibre lasers: domestic group ¥372,500 | Han's Laser 2025 average selling price (revenue ÷ units); HSG / Senfeng IPO filings agree | ¥138 → ¥36/h. The held UK × 0.55 figure was a Trumpf price, ~4.9× the domestic one. |
| China | Injection moulding: domestic group ¥302,630 (200 t) | Haitian FY2024 Mars average selling price. An UPPER bound for 200 t, so Low. | 200 t ¥100 → ¥43/h; 1,200 t ¥446 → ¥190/h |
| China | Overhead ×0.75 confirmed (not changed) | SG&A ÷ cost of sales: Tuopu 4.15 %, Huayu 6.04 % against the UK's TI Fluid 7.68 %, Dowlais ~10.4 % | The basis line now states the evidence |
| Hungary | Engineer, technician, supervisor, inspector from their own occupation statistics (KSH FEOR 2025) | FEOR 2118 / 3116 / 3212 / 3135 averages | Engineer Ft7,280 → Ft8,837/h; supervisor above technician on evidence. No labour category is held. |

**Real parts that moved (UK, 50,000 a year, 5 years):**
- Composite roof £479.83 → £438.05.
- Battery lid £84.02 → £79.81.
- Hat stiffener £73.55 → £69.38.
- Cast bracket £20.04 → £20.06; stub axle £42.50 → £42.56.

The reference machined bracket (£24.79) did not move.

## Per-£ trace, before → after (40 real parts)

| Country | Held machine capital (basket) | Median part on sourced rates |
|---|---|---|
| China | 9.8 % → 6.4 % | 47.9 % → 47.9 % |
| India | 10.6 % → 7.2 % | 50.3 % → 50.3 % |
| Poland | 11.0 % → 8.0 % | 52.9 % → 52.8 % |
| Hungary | 10.8 % → 2.5 % (5.7 % now at par on a sourced EU price) | 52.3 % → 52.3 % |

The median part did not move. Its remaining gap is tooling and bought-in services (a derived factor), overhead and
packaging (held multipliers), and the margin. This round's research could not source those through the blocked network:
- **Services:** no country has a UK and a local price for the same service, so the service-price slot stays empty.
  Nothing is faked into it.
- **Overhead:** only China's could be tested.

The machine and material changes moved the parts where those items carry the cost: composites, presses, lasers and
moulding in China.

## Found, not changed (evidence too weak, or a decision)

- **UK held machine build-ups are internally inconsistent.** For 201 machines, the capex their finance line implies
  ÷ their depreciation gives a 2.8–20.9-year life (median 8.5). Every sourced machine is 13. They were back-solved to a
  "target £/h". Fix: source the capex, as this round did for brakes, autoclave and RTM. Re-deriving from one line would
  only pick a different unsourced number.
- **UK 4140 £1.21 v 42CrMo4 £1.61** — the same grade. 4340 sits below 42CrMo4 against the alloy surcharges. No dated
  full bar price was found to anchor them.
- **China 38MnVS6 ¥4.36** sits above 42CrMo ¥4.28 (Mysteel). It should sit between 45# and 40Cr. No anchor price found.
- **Imported premium machines held at UK × 0.52 (India) / × 0.55 (China)** match neither a domestic nor an imported
  machine (the 6 kW laser). China is now fixed; India found no usable price (GeM bids show deposits, not prices).
- **Hungary packaging ×0.88:** the only pallet evidence is lower (0.53–0.63 of the UK). **Poland overhead ×0.85:** one
  group's figure is ~0.99. Each rests on a single data point, so they are held.
- **CFRP prepreg:** a 2022 UK retail price list (£59–95/kg) and Chinese fibre selling prices only. Not enough to re-price.

## Next, in order

1. **Allow the research hosts** (mnb.hu, ksh.hu, find-tender.service.gov.uk, contractsfinder.service.gov.uk, cninfo,
   distributor sites) in the environment's network settings. Then re-open every `verify: true` figure and run the
   services round (a UK and a local price for the same service).
2. **UK capex for the rest of the held machines,** by public-contract award. This round shows UK awards are the
   strongest evidence.
3. **Actual prices paid** in `scripts/actuals/cad-actuals-input.csv` — the only measure of accuracy.

## Live re-run after the round (15 parts × 4 countries, ex-works)

| Country | Checks passed | Failures |
|---|---|---|
| China | 1,019 | 0 |
| India | 1,019 | 0 |
| Poland | 1,019 | 0 |
| Hungary | 1,019 | 0 |
| **All four** | **4,076** | **0** |

The crossover check (now a tested predicate) passes in all four countries. On every costing:
- the screen equals the headless costing to the penny;
- the workbook re-adds to the headline;
- both reports carry the country's stamp and the ex-works terms.

A scan of the 120 reports found 0 stray £ and 0 NaN. Headlines are in `country-live/live-summary-after-round2.md`.

What moved, in each country's currency:

| Part | China | India | Poland | Hungary |
|---|---|---|---|---|
| Hat stiffener (autoclave on sourced capex) | 239.35 → 224.28 | 3,333.25 → 3,104.52 | 226.36 → 215.30 | 21,165.26 → 19,750.57 |
| ECU cover (domestic moulding machine) | 4.13 → 3.86 | — | — | — |

Hungarian parts moved by up to 0.2 % (the occupation-level engineer / supervisor rates).

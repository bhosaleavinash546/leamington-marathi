# Poland rate book — October 2026

Until now every Poland rate was the UK book × a few factors from one table (`REGIONAL_DATA.PL`). The UK's capital, hours,
labour mix and grade prices all carried into Poland. This book rebuilds Poland from sourced research, the same way as
the India and China books.

**Basis:**
- **Clusters:** an average of the four automotive supplier clusters — Silesia (Gliwice / Tychy / Katowice /
  Bielsko-Biała), Lower Silesia (Wrocław / Wałbrzych / Legnica), Wielkopolska (Poznań) and Podkarpacie (Rzeszów / Mielec).
- **Shifts:** three 8-hour shifts, Monday–Friday.
- **Prices:** October 2026, PLN, ex-VAT (23%).
- **FX:** the book's own rates — £1 = zł5.096, €1 = zł4.374, $1 = zł3.849. Poland buys steel, aluminium, copper and
  polymers at European prices, so most material anchors are European market prices converted at those rates. Where a
  source is ex-works or in-warehouse Rotterdam, freight to the plant is NOT added; the family says so.

```
python3 scripts/rate-refresh/poland-2026-10/build-config.py                     # research → 2026-10-poland.json
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-poland.json        # dry run: the register
npx tsx scripts/country-book.ts scripts/rate-refresh/2026-10-poland.json --write
npx tsx scripts/region-expand.ts                                                # Lithuania is generated from Poland
```

**What the generator writes:**
- `src/engine/country-books/pl.ts` (generated);
- `REGIONAL_DATA.PL` (labour, energy, machine multiplier);
- `lab-pl-*` and `energy-pl`;
- `BILLET_PREMIUM_USD_PER_T.PL`;
- `poland-2026-10/register.csv`, every rate with current → new, decision and basis.

The research files (`poland-2026-10/research/*.json`) carry a URL and a date on every figure. The rules are in
`poland-2026-10/RULES.md`. The pre-book Poland book is frozen in `current-poland-book.json` (`snapshot.ts`), so the
register's "current" column never reports new-as-current.

**Caveat:** as in the China round, the researchers' page fetches were blocked by the network proxy. Every figure was read
from search-result extracts of the cited page. Spot-check the headline figures before quoting them outside.

## 1. What was wrong

| Area | Book (UK × factor) | Evidence | |
|---|---|---|---|
| Skilled machinist | zł60.64/h | **zł66.34/h** | Sedlak & Sedlak CNC operator pay × GUS cluster medians + night allowance + ZUS |
| Semi-skilled operator | zł45.46/h | **zł61.46/h** | the book's operator was a UK ratio of the skilled rate; Polish operators earn closer to setters |
| Foundry / forge / furnace | zł40–41/h | **zł56.6–60.0/h** | moulder and press-operator pay |
| Engineer (day) | zł101.05/h | **zł85.02/h** | process-engineer pay, salaried |
| 3-axis VMC (machine only) | zł41.15/h on 4,000 h | **zł31.85/h** on 6,024 h | Haas VF-2 EU list €64,995 on Haas's Polish site |
| 5-axis VMC | zł72.50/h | **zł47.17/h** | Haas UMC-500 list; 3-shift hours |
| Gas | zł0.408/kWh | **zł0.249/kWh** | TGE day-ahead + PSG distribution (a floor) |
| Ductile iron (charge) | zł1.42/kg | **zł1.73/kg** | merchant pig + scrap + treatment — the book was below the metal |
| Cast steel (charge) | zł0.70/kg | **zł1.28/kg** | heavy melting scrap is zł1.20 — the book was below scrap |
| Grey iron (charge) | zł0.84/kg | **zł1.52/kg** | pig + scrap + returns |
| CF8 cast stainless (charge) | zł8.92/kg | **zł5.64/kg** | 304 scrap CIF Rotterdam |
| C45 bar | zł4.25/kg | **zł3.17/kg** | Polish stockholder list (undated — Low) |
| Copper bar / brass rod | zł56.86 / 42.89 | **zł57.95 / 48.07** | below LME + premium / the brass metal basis; floored |
| PA66 / PMMA / HIPS | zł12.61 / 11.86 / 6.69 | **zł16.28 / 14.20 / 7.33** | European indices; HIPS was priced as GPPS |
| PET / PVC resin | zł5.91 / 5.44 | **zł4.97 / 4.34** | European index / CEE market |

## 2. Labour (Likely: Sedlak & Sedlak + GUS, loaded by statute)

**How it is built:**
- **Pay:** Sedlak & Sedlak national median total pay by job (base + bonuses), indexed to 2026 by the GUS enterprise-sector
  growth (+5.6% y/y, Aug 2026), × the four clusters' GUS March 2026 median ÷ the national (0.984).
- **Night work:** on 3 × 8 h one third of hours are night hours, paid the statutory allowance (20% of the minimum-wage
  hourly rate: zł5.74 on the 2026 minimum wage of zł4,806).
- **Employer on-costs:** 21.98% — pension 9.76, disability 6.50, accident 1.67 (assumed), Labour Fund 2.45, FGŚP 0.10,
  PPK 1.5.
- **Hours:** 1,720 productive hours = the 2026 norm of 2,008 h − 26 days' leave − 10 days' sickness (the sickness days are
  an assumption; the employer pays the first 33 days at 80%).

**Not included:** 13th month (not statutory in Polish private industry; bonuses are inside the total pay), shift premia
above the statutory night allowance, the ZFŚS social fund, bridging-pension FEP, PFRON, meals / transport / clothing,
training, agency margins. Sedlak's total pay mixes single- and multi-shift workers, so part of the night allowance may be
inside it already (≤ zł1.9/h).

| Role | Book | New | | Role | Book | New |
|---|---|---|---|---|---|---|
| skilled | 60.64 | **66.34** | | technician | 66.71 | **72.71** |
| semi-skilled | 45.46 | **61.46** | | supervisor | 81.84 | **77.06** |
| foundry | 40.41 | **56.57** | | engineer | 101.05 | **85.02** |
| electronics | 53.05 | **54.80** | | forge | 41.33 | **59.97** |
| inspector | 60.64 | **61.63** | | blow / roto / thermoform | 42.55 | **55.09** |

Forge, furnace, blow, roto, thermoform and trim-router use the nearest job with published pay (press operator, moulder,
injection-moulding operator, CNC operator) — stated in each basis.

## 3. Energy

- **Electricity zł0.702/kWh ex-VAT (Likely):** TGE 2026 baseload year zł0.4305 + 2026 capacity fee (zł0.2194 in weekday
  07–21 h; zł0.128 on a flat 3-shift load) + network zł0.129 (Forum Energii 2024, energy-intensive industry — a proxy) +
  OZE zł0.0073 + cogeneration zł0.003 + excise zł0.005. The book's zł0.698 agrees. Eurostat band IC, H2 2025, was zł0.536,
  before the 2026 capacity-fee rise.
- **Gas zł0.249/kWh ex-VAT (Likely, a floor):** TGE day-ahead Mar–Apr 2026 zł0.224 + PSG variable distribution zł0.025
  (2024). Fixed / capacity charges and the supplier margin were not found. The EU-average non-household band I3,
  H2 2025, is zł0.265 and agrees. The book had zł0.408.

## 4. Machines

**Operating model** (every machine): 6,024 h (3 × 8 h × 251 working days in 2026); straight-line depreciation, no shift
uplift; 7.14-year life (the statutory 14% tax rate for metal-working machine tools — a tax life, as India's and China's);
finance 8.22% (SME machinery loan WIBOR 3M 3.82% + 3.9–4.9 pp; NBP reference rate 3.75% — a large Tier-1 borrows below
this); rent zł20.05/m²/month (Upper Silesia, Wrocław, Poznań headline rents, mean; CBRE Q2 2026 national €4.7 agrees);
maintenance 3.5% of capex (the library's own rule; no Polish norm found); support staff at Polish wages.

**Capex:**
- **3-axis VMC group** (VMC, Haas VF-2, drilling centre): Haas VF-2SSYT-EU list €64,995 = zł284,288 on Haas's Polish
  site (machine only); the US list $70,995 = zł273,260 agrees. An imported machine costs Poland what it costs the EU. The
  old book had the VF-2 at about zł195k — the 0.72 factor discounted a traded machine. **Medium.**
- **5-axis group** (VMC5, DMU 50, UMC-500): Haas UMC-500 "from $119,995" (US list, older) = zł461,861; no EU price
  found. **Low.**
- **Everything else** (lathes, presses, moulding machines, die casting, sand line, lasers, robot cells): capex not
  sourced; the capital is HELD at UK × 0.72 and labelled. Most Polish plant is imported and priced in EUR, so the held
  capital likely UNDERSTATES it — the next research round should price presses and moulding machines.

The median Poland ÷ UK machine rate is now 0.56 (was 0.72); the regional service factors (heat treat, NDT, process,
toolroom) read it.

## 5. Materials — 142 re-priced, 294 held

| Family | Anchor | Method |
|---|---|---|
| CR coil DC01 / DC04 | NW-EU CRC €850–880/t ex-works = zł3.78 | direct; automotive grades laddered on the book's premium, floored |
| HR structural | NW-EU HRC €745/t (Fastmarkets, 6 Oct) = zł3.26; PUDS St3S zł3.43 agrees | ladder |
| Coated sheet | NW-EU HDG €850–870/t = zł3.76 | ladder over DC01 GI |
| C45 / carbon bar | 24metal list zł3.17 (undated) | direct / ladder — **Low** |
| 304 / 316L / 430 sheet | Eurometal 304 €2,770/t, 316 €4,225/t; 430 derived from its surcharge | direct |
| Ductile / grey / cast steel / CF8 | the CHARGE: pig + scrap + returns + treatment (engineering-assumption mixes, floors) | ladder-add / ladder |
| Ni-Resist, Hi-Cr iron | metal content at LME Ni / HC FeCr / FeSi + the base charge | direct |
| Secondary cast Al (ADC12, A380 …) | Fastmarkets DIN226 €2,430–2,530/t = zł10.85 — **January 2026, stale** | ladder — **Low** |
| Primary cast Al (LM25, A356 …) | P1020 = LME + Rotterdam premium = zł14.50 | floor (none was below) |
| Copper / brass / bronze / Zamak | LME + premia; Westmetall brass metal basis; metal content | floor |
| PP / PE / PVC / ABS / PS / HIPS | myCEPPI Central & Eastern Europe weekly (wk 36–37) | ladder / direct |
| PC / PA6 / PA66 / PBT / PET / PMMA | businessanalytiq Europe index (method not published) | ladder / direct |
| PEEK | Victrex average selling price (whole mix — an upper bound) | ladder — **Low** |
| NR | TSR20 benchmark, FOB Asia (no freight) | direct |

**Held, with the reason** (`held` in the config): HRPO; alloy engineering bar (41Cr4, 42CrMo4, 20MnCr5, 100Cr6, Ni-Cr-Mo);
stainless bar; electrical steel; wrought aluminium; magnesium alloys; titanium / superalloys; POM (only a small-lot offer
price, which runs 20–35% above the market); every filled compound (**PA66-GF30** — the ECU cover's material — PA6-GF30,
PP-GF30), TPU / TPE; rubber compounds; composites and paint. A held grade's note opens "Poland: no Poland price for this
grade — the UK book £x × f".

## 6. Real parts in Poland — before and after (headless, 100,000/yr, the recorded answers)

`REGIONS=PL npx tsx scripts/review-2026-10-10/rate-isolation.ts` — every operation's machine / labour rate and the
material £/kg equal the Poland book (0 leaks).

| Part | Before | After | |
|---|---|---|---|
| PRCR002 stub axle (cast + machine) | zł166.91 | **zł166.11** | −0.5% |
| Casting_Braket (cast steel + machine) | zł60.70 | **zł63.88** | +5.2% |
| IM_ECU_Cover (PA66-GF30) | zł6.10 | **zł5.94** | −2.7% |
| IM_Storage_Tray (PP) | zł21.24 | **zł20.34** | −4.2% |
| Seat_Locking_Bracket (stamping) | zł8.39 | **zł8.07** | −3.9% |
| BIW_Inner_Panel (stamping) | zł98.24 | **zł96.68** | −1.6% |

**Why the totals move so little.** On the stub axle the buckets moved in opposite directions:
- labour rose from zł31.98 to zł38.12 (operators were 25–40% low);
- process fell from zł24.27 to zł18.80 (6,024 h, not 4,000);
- the iron charge rose from zł1.42 to zł1.73/kg;
- per-part services fell from zł56.50 to zł52.51 — heat treat and NDT follow the machine factor, 0.72 → 0.56.

**Cast steel rises (+5%)** because its charge was below scrap.

**Live runs** (a real server, a real browser, Poland selected; 100,000/yr, 5-year programme; `e2e/cad-parts-live.ts`):

| Part | Screen (= Excel trace) |
|---|---|
| PRCR002 stub axle | **zł165.57** ±7.5% |
| Casting_Braket | **zł63.41** ±6.4% |
| IM_ECU_Cover | **zł4.86** ±11.4% |
| IM_Storage_Tray | **zł15.30** ±12.4% |
| Seat_Locking_Bracket | **zł5.35** ±12.4% |
| BIW_Inner_Panel | **zł65.31** ±13% |

- Every CAD response says `ratesRegion: PL`.
- Every rate note reads "Poland book 2026-10-10: …", or "Poland: no Poland price for this grade …" for a held grade.
- The sweep of the 12 exports is clean: no £ amount, no INR or CNY, no source-file names, no internal jargon.
- The screen and headless figures differ for the mouldings and pressings because the screen amortises the tools over
  the 5-year programme the run enters; headless uses the recorded answers.
- **PDF fix found on the way:** the PDF printed "zl165.57", because 'ł' is not in the PDF's built-in font. It now prints
  "PLN 165.57", as ₹ prints "INR". A Polish word containing "zł" (e.g. "złom", scrap, in a note) is left alone
  (`tests/pdf-winansi.test.ts`).

## 7. Code and tests

- `tests/poland-rate-book.test.ts` — anchors, charges above scrap, metal floors, HIPS ≠ GPPS, labour and `lab-pl-*`
  agreement, gas, 6,024 h and Haas capex, HELD capital labelled, register coverage, the UK book untouched.
- Generator fixes found on the way: Poland's library has `lab-pl-foundry` and no `lab-pl-engineer` (the generator now
  updates whichever exist); the billet premium is written `1_080` (the regex now accepts it); a `$1,070` in a basis was
  read as capture group 1 and printed "false,070" (function replacer; `$` escaped in the energy note).
- Lithuania is generated as Poland × a wage ratio (`2026-10-countries.json`); `region-expand.ts` was re-run, so LT moves
  with Poland (skilled £11.21 → £12.27/h, machine factor 0.72 → 0.56).

## 8. Open — the next research round

1. **Capex for presses, injection-moulding and die-casting machines, sand lines, lasers, robot cells** — held at UK × 0.72,
   likely low for imported plant.
2. **Compounds:** PA66-GF30, PA6-GF30, PP-GF30 (held — the ECU cover's resin is still UK × factor).
3. **A current DIN226 / ADC12 print** (January is the latest public figure) and an A356 premium.
4. **Alloy bar** (41Cr4, 42CrMo4, 20MnCr5, 100Cr6) and stainless bar from a Polish stockholder or mill extras.
5. **Gas fixed charges** and the 2026 PSG / Tauron / Enea network tariffs; the accident-insurance rate for automotive /
   metal products; a sickness-absence rate.
6. Verify the headline figures on the source pages (the fetches were blocked this round).

# All-commodity country audit — October 2026

**Question.** When a manufacturing country is selected, does every commodity cost the part with that country's rates? This means labour, machine-hours, materials, energy, tools, NRE, bought-in services and the forms' own defaults. Nothing should silently stay at a UK figure.

The live India run of the aluminium housing answered this for **cast + machine**. This audit applies the same method to **every commodity**, and adds two checks the casting run could not make.

## 1. How it was checked — three independent methods

| # | Method | What it catches |
|---|---|---|
| A | **"Twice the UK" probe.** A test country is defined whose every labour rate, energy tariff, machine-rate multiplier and material factor is exactly 2× the UK's. Every real part in `cad-audit/` (40 parts, 14 commodities) is replayed through the product's own chain (`costMeasuredPart`) in the UK and in it. | Any £ that does not move with the country: a whole fixed UK £ (×1), or one partly fixed (between ×1 and ×2). Labour and process must come out exactly ×2. |
| B | **Static code search** of every module, advisor, rule, tooling model, server route and form collector. | Fixed £ constants, reads of the UK rate book, and UK labour ids used as rates. |
| C | **Live runs in a real browser against a real server** (fresh database, built-in rate book). There are two sets, both in India and the UK. **Forms:** every commodity form costed on its defaults. **CAD:** one real STEP part per commodity, taken from upload through the engineering questions to Calculate. The tool's own Excel export (per-line rate trace) and Rate Database export are then checked independently against all 39 country books. | Anything on the screen path: defaults, collectors, the country switch. Also proves which country every charged rate came from. |

## 2. What was wrong, and is now fixed

### What already worked

Labour, machine-hour, material and energy rates were already the country's on every commodity. Method C confirmed this on every form and every CAD part: **0 charged rate lines from another country**.

### What did not

**£ constants that never passed through a country.** These are tool prices, NRE, bought-in services and the forms' £ defaults. They were the UK figure in every country.

| Commodity | Fixed UK £ found | Now |
|---|---|---|
| Aluminium extrusion | Extrusion / impact dies and bend tooling were UK die-maker prices. Fab CNC programming was costed at the **UK engineer rate**. Die nitriding £180 and slug prep £0.42/kg were UK figures. | Dies and tools: ~20% H13 steel (traded) + 80% die-shop work × toolroom factor. Programmer: the country's engineer. Nitriding: heat-treat factor. Slug prep: process-service factor. |
| Gear | Heat treatment defaulted to the **UK** on the CAD/headless path. The bar was priced from the **UK rate book** (£1.48/kg 20MnCr5 in India). Fixture £8,000 and programming/PPAP £6,500 were UK figures. Cutter regrinds were UK figures. | Heat treatment and bar: the country's (India's bar is £1.32/kg). Fixture: toolroom factor. Programming: engineer factor. Regrinds: process factor. Hobs, broaches and masters are bought from specialist tool makers and are stated as traded. |
| Composites | Fibre and resin were priced from the **UK rate book**. The C-scan was £25 everywhere. | The country's book. NDI × inspection factor (India: £9). |
| Sheet metal / BIW | Die design hours: the toolroom factor **cancelled** (hours = £ ÷ rate, then × the same rate), so design was the UK £ everywhere. Laser + brake programming NRE £1,500 and tailor-welded blank weld £/mm were UK figures. | Design hours derived at the UK rate, priced at the country's. NRE: engineer factor. Weld: process factor. |
| Casting / cast + machine | Sand cores £0.75–6, investment wax and shell £/cm², die stress-relief + nitride, and soluble-core boxes were UK figures. | Cores and wax/shell: 30–35% traded material + the rest process. Die heat treatment: heat-treat factor. Core boxes: toolroom factor. Blast and impregnation are now priced as process services. |
| Forging | Die-block harden + temper £2,500 + £2.20/kg was a UK figure. | Heat-treat factor. Descale, blast and coining are now priced as process services. |
| Injection moulding | Texturing £3,500 and wear coating were UK figures. | Process factor and heat-treat factor. |
| Rotational moulding | Toll grinding £0.25/kg was a UK figure. | Process factor (India: £0.087/kg). |
| PCB fab | Finish, test, via and silkscreen adders were **UK £ in every market** (only the panel price varied). | Priced in the panel's market (× that market's panel-price ratio to the UK). |
| PCB photo (automotive) | Burn-in chamber, serialisation, X-ray fallback, IPC class-3 microsection, coupon testing, conformal coating and ASIL NRE (PPAP / FMEA / DVP&R) were UK figures. | Priced in the board's country (inspection, process and engineer factors). |
| Heat-treat model | Load QC £/load was a UK figure. | Inspection factor. |
| Lamination stacks | Joining £/stack was a UK figure. | Process factor. |
| **Every commodity form** | The **£ defaults stayed UK in India**: HPDC die £120,000, pattern £5,000, cores £1.50, programming £2,000, C-scan £25 and 30 others. The fallbacks used when a field is left blank were also UK figures. | Each £ field states its country basis (`src/ui/country-money-defaults.ts`). A default shows UK value × the country factor and follows every country switch. A figure the engineer types, restores from a draft, or gets from CAD is a quote and is never changed. |

**The rule now.** Every £ constant states what its cost is made of — its **country basis** (`src/engine/regional-services.ts`) — and is multiplied by `countryFactor(basis)`:

| Basis | Factor in a country (1 in the UK) |
|---|---|
| toolroom | ½ skilled-pay ratio + ½ machine multiplier (India 0.358) |
| engineer | engineer-pay ratio |
| heat treat | heat-treat model ratio: batch furnace + quench + temper |
| inspection | ½ inspector-pay ratio + ½ machine multiplier |
| process service | ½ semi-skilled-pay ratio + ½ machine multiplier |
| chemical | surface-finishing chemical factor |
| library material | the country book's £/kg ÷ the UK's |
| traded share | e.g. a tool: 20% steel (global) + 80% toolroom |
| global | traded goods priced the same everywhere — stated, not scaled |

**UK results did not move.** The full test suite (3,010 tests, including the hand-computed £24.79 reference part and the real-parts baseline) passed unchanged before the new tests were added.

## 3. Evidence — "twice the UK" probe after the fixes (method A)

Labour and process came out **exactly ×2 on every costed part**.

These figures stay at ×1, all of them traded goods:
- machining cutting-insert wear;
- the aluminium billet (LME + regional premium).

These figures move by less than ×2, and every case was traced to a traded share:
- catalogue die sets, mould frames and pinch inserts;
- tool steel;
- cutting-insert wear inside consumables;
- hobs;
- heat treatment (×1.7), because the probe held overhead at the UK's.

This is now a permanent test: `tests/country-rates.test.ts` §11 fails if any material, consumable or tool £ on any real part stays at the UK figure.

## 4. Evidence — live India runs (method C)

### CAD path: one real STEP per commodity, India, real server and browser

| Commodity | Real part | India | UK (same part, UK selected) | Charged rate lines | Server calls | Rate DB differences |
|---|---|---|---|---|---|---|
| Aluminium extrusion | `AL_Heat_Sink` | ₹365.77 (≈ £2.88) | £4.29 | 13/13 IN | 4/4 IN | 0 |
| Sheet metal / BIW pressing | `BIW_Reinf_Channel` | ₹108.43 (≈ £0.85) | £1.18 | 5/5 IN | 2/2 IN | 0 |
| Blow moulding | `BM_Washer_Reservoir` | ₹118.48 (≈ £0.93) | £1.45 | 5/5 IN | 4/4 IN | 0 |
| Composites (CFRP) | `COMP_Hat_Stiffener` | ₹5,186.34 (≈ £40.78) | £99.63 | 6/6 IN | 3/3 IN | 0 |
| Polymer extrusion | `EXT_Vent_Pipe` | ₹81.46 (≈ £0.64) | £0.94 | 6/6 IN | 3/3 IN | 0 |
| Forging | `FORGE_Hub_Flange` | ₹1,714.84 (≈ £13.48) | £27.07 | 7/7 IN | 4/4 IN | 0 |
| Injection moulding | `IM_ECU_Cover` | ₹123.59 (≈ £0.97) | £1.47 | 6/6 IN | 3/3 IN | 0 |
| Machining | `MACH_Hydraulic_Manifold` | ₹2,732.05 (≈ £21.48) | £40.99 | 14/14 IN | 2/2 IN | 0 |
| Cast + machine (Al) | `PRCR002` | ₹3,192.65 (≈ £25.10) | £48.72 | 19/19 IN | 5/5 IN | 0 |
| Rotational moulding | `ROTO_Header_Tank` | ₹982.29 (≈ £7.72) | £20.82 | 3/3 IN | 3/3 IN | 0 |
| Rubber | `RUB_AV_Mount` | ₹121.33 (≈ £0.95) | £2.10 | 6/6 IN | 3/3 IN | 0 |
| Sheet metal / BIW pressing | `Seat_Locking_Bracket` | ₹173.39 (≈ £1.36) | £2.18 | 5/5 IN | 2/2 IN | 0 |
| Thermoforming | `TF_Trim_Cover` | ₹170.02 (≈ £1.34) | £2.27 | 6/6 IN | 3/3 IN | 0 |
| Gear | `test-gear-m3-z38` | ₹1,524.60 (≈ £11.99) | £21.46 | 10/10 IN | 2/2 IN | 0 |

The 14 UK runs were checked the same way: every charged rate line came from the UK book.

What the columns mean:
- **Charged rate lines:** every labour, machine, material and energy rate in the tool's own Excel trace, matched against all 39 country books. "IN" means it is India's figure.
- **Server calls:** each CAD analysis response states the book its rules priced in (`ratesRegion`).
- **Rate DB:** the exported active database (14 labour, 197 machines, 424 materials) compared with an independently built India book.

Rule-priced £ in these runs carry their country in the basis text. Examples:
- composites C-scan: "£25 a part (UK) × India inspection factor 0.36" = £9;
- roto grinding: "£0.25/kg UK × India process-service factor 0.3483";
- gear bar: "20MnCr5 × £1.32/kg".

### Forms: every commodity on its defaults, UK and India

| Commodity form | UK (unchanged) | India before this audit | India now | Charged rate lines that are India's |
|---|---|---|---|---|
| Injection moulding | £3.66 | ₹452.98 | ₹260.77 | 3/3 |
| Sheet metal (fab) | £9.79 | ₹622.20 | ₹606.83 | 5/5 |
| Sheet metal (stamping) | £6.19 | ₹772.74 | ₹426.75 | 3/3 |
| Casting | £20.44 | ₹2,411.82 | ₹1,489.17 | 5/5 |
| Cast + machine | £28.29 | ₹2,922.42 | ₹1,939.82 | 9/9 |
| Machining | £10.86 | ₹919.66 | ₹804.34 | 5/5 |
| Forging | £13.67 | ₹1,539.80 | ₹924.70 | 4/4 |
| Gear | £26.12 | ₹2,032.78 | ₹1,782.42 | 10/10 |
| Rubber | £1.92 | ₹185.74 | ₹147.30 | 5/5 |
| Composites | £570.25 | ₹32,393.84 | ₹25,697.16 | 6/6 |
| PCB fabrication | £83.08 | ₹4,803.24 | ₹3,913.53 | market price (no rate lines); adders now in the panel's market |
| PCBA | £7.42 | ₹903.70 | ₹887.77 | 4/4 |
| Wiring harness | £32.00 | ₹2,455.25 | ₹2,449.09 | 4/4 |
| Polymer extrusion | £9.02 | ₹760.85 | ₹760.85 | 6/6 (no £ default on this form) |
| Blow moulding | £1.70 | ₹201.65 | ₹140.14 | 3/3 |
| Thermoforming | £2.75 | ₹201.76 | ₹201.76 | 4/4 (no £ default on this form) |
| Rotational moulding | £47.46 | ₹2,918.61 | ₹2,612.05 | 3/3 |
| BIW assembly | £80.62 | ₹10,058.59 | ₹8,520.83 | 2/2 |
| Painting | £5.82 | ₹498.65 | ₹446.57 | 2/2 |

What this table shows:
- **"India before":** the same form and the same defaults, costed before this audit. The difference is the UK £ defaults (tools, NRE, services, cores) that stayed UK.
- **£ inputs that still read the same in India:** only traded goods and supplier quotes. These are brass inserts, MIG and TIG wire, catalogue hardware, electronic components, splices, conduit and tape, rivets and adhesive, the bare PCB and the BIW sub-parts. Each is listed with its basis in `src/ui/country-money-defaults.ts`.
- **Every UK headline is identical before and after.**
- **Assembly** only rolls up parts already costed (each in its own country) plus the country's overhead, so it has no rates of its own.

## 5. What stays a stated estimate

- **Derived factors.** The toolroom, engineer, inspection, process and heat-treat factors are derived from the country table: published wages, energy and the machine multiplier. They are not local supplier quotes. A quote typed into the form replaces any of them.
- **Traded shares.** The traded share of a tool (20%), a sand core (30%) and investment wax and shell (35%) are engineering estimates, stated in the code and on the basis line.
- **Global goods.** Traded goods stay at one £ price everywhere. These are cutting inserts, catalogue hardware, electronic components, wire and connectors, rivets and adhesive, hot-runner systems, die sets and tool steel. Aluminium and other exchange metals follow the country's metal factor.
- **Quotes only.** A few form figures can only come from a supplier and are left as typed: the BIW sub-parts' cost, the bare PCB in PCBA, and an SBM preform.

## 6. Reproduce

```
npx vitest run tests/country-rates.test.ts          # §11 twice-the-UK over every real part, §12 form defaults
CV_FORMS_REGIONS=UK,IN npx tsx e2e/country-forms.ts # every form, per country (needs a build)
CV_LIVE_REGION=IN CV_LIVE_PART=../cad-audit/parts/<part> CV_LIVE_ANSWERS='{...}' npm run test:e2e:country
```

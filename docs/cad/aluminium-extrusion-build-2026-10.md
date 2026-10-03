# Aluminium extrusion should-cost model, built October 2026

> **Superseded in part by the review** (`docs/cad/extrusion-review-2026-10.md`, same month). The review added 16 alloys and 14 polymer grades, put container friction on the billet length, added cut-to-length, priced energy regionally and credited scrap at the market. Costs below are as built; the review gives the current figures.

The cost-engineering director asked for an aluminium extrusion should-cost model
that runs end to end, follows the standard process steps, and covers every
extrusion process in use, every section type, global billet prices and process
cost. This note covers four things:

- what was built;
- where every number comes from, and which numbers are estimates;
- how the model was checked;
- what is still open.

The golden rule holds throughout. AI may read the part, but it never sets a
price. Every money figure is deterministic arithmetic in `src/engine/`, and the
geometry is measured by the CAD kernel.

## 1. What a part goes through

| Step | Where | What it decides |
|---|---|---|
| Measure the section | `server/utils/cad-geometry-engine.py::_profile_section` | The kernel cuts the solid across each axis at 25 / 50 / 75 % of its length and chains each cut into loops. From those loops it reports the area, outline length, voids (chambers), the circumscribing circle (Welzl), the thinnest wall (10th-percentile ray chord), and the volume compared with section × length. A section that is the same at all three cuts and fills ≥ 98 % of the volume is **constant**. One that loses metal was **machined after extrusion**. The probe cuts a deep copy of the solid. Cutting the original once turned two through holes on the casting bracket into blind holes. |
| Route | `derive/commodity.ts` | **Constant section:** a profile when it is long (≥ 3 × its section) or intricate (outline² ÷ 4πA ≥ 6). Fins and chambers count as intricate, so a heat sink cut 150 mm long still qualifies. **Long section with 2–40 % machined away:** offered as an extrusion that is machined. **Revolved cup up to Ø200 mm:** offered impact extrusion, but the tool never leans to it. **Names:** "6063 extrusion" or "impact extruded" read as aluminium extrusion, not as a polymer line. |
| Alloy | `material.alAlloy` — **blocking** | 14 alloys: 1050, 3003, 5083, 6060, 6063, 6101, 6005A, 6061, 6082, 7003, 7108, 7020, 7075 and 2024. A name in the file is shown as a hint only. Geometry cannot tell 6063 from 7075, so the alloy is always asked. |
| Process | `al.route` — advisory | Direct is the default. Indirect suits 2xxx / 7xxx and seamless tube. Hydrostatic covers high ratios and clad wire. Conform runs continuously from rod. Cold impact makes cups and cans. |
| Press plan | `modules/aluminium-extrusion-advisor.ts::planAlExtrusion` | Chooses, in order: die type, press, holes per die, pressure and force, exit speed, billet length, recovery and runs. Section 3 gives the method. |
| Temper, finish, bends | `al.temper`, `al.finish`, `al.bends` — advisory | Tempers: T4 / T5 / T6 / T64 / T66 / T73 / T3511 / H112 / F / O. Off-line SHT applies to 2xxx and 7075. Finishes: mill, anodise, powder or e-coat over the measured surface. Bends are CNC stretch bends. |
| Fabrication | `fabrication()` in the rules | Drilled holes come from the feature table. Material machined away is taken from the measured volume shortfall (`(1 − share) × A × L − holes`) at 120 cm³/min. Handling, change-over, fixtures, programming and tool wear come from the shared `secondaryMachiningCell`. |
| Cost | `modules/aluminium-extrusion.ts` → `computeUniversalStack` | Gives the 8 buckets. The screen form (`src/ui/al-extrusion-form.ts`) and headless costing (`costMeasuredPart`) call the same `buildAlExtrusionInputs`. |

## 2. Raw material: billet around the world

Billet price per kg = (LME + regional all-in billet premium + alloy adder) ÷ $/£ ÷ 1000

- LME aluminium is **$3,240/t**. Cash was $3,253 on 25 Sep 2026 and the 3-month price was $3,213.5 on 29 Sep. Sources: [AlCircle](https://www.alcircle.com) and [Discovery Alert](https://discoveryalert.com.au).
- The exchange rate is **$1.3285/£** (Bank of England, 30 Sep 2026, via [Pound Sterling Live](https://www.poundsterlinglive.com)).
- Scrap is credited at 85 % of LME for 6xxx alloys. Each alloy carries its own scrap share.

| Region | All-in premium, $/t | Source |
|---|---|---|
| DE | 1,100 | [Fastmarkets](https://www.fastmarkets.com) 6063 DDP Ruhr $1,070–1,135, 28 Aug 2026 — **sourced** |
| IT | 1,110 | Fastmarkets 6063 DDP Brescia $1,075–1,150 — **sourced** |
| FR, NL, ES, SE, UK | 1,100 | EU duty-paid level — estimate. The UK imports its billet. |
| PL, CZ, HU / RO | 1,080 / 1,060 | Central European casthouses — estimate |
| TR | 675 | Fastmarkets CIF Marmara $650–700 — **sourced** |
| US | 2,960 | Midwest duty-paid premium $2,410 on 30 Sep 2026 ([Cbonds](https://cbonds.com) index; Section 232 tariff) + ~$550 billet upcharge (estimate) |
| MX | 395 | Fastmarkets CIF Mexico $370–420, 9 Sep 2026 — **sourced** |
| BR | 725 | Fastmarkets CIF Brazil $700–750 — **sourced** |
| CN | −186 | SHFE ~RMB 23,800 incl. VAT → ex-VAT, + 6063 bar fee ~RMB 625 ([Mysteel](https://www.mysteel.net), Jul 2026) — derived |
| IN | 550 | CIF primary ≈ LME + $350, + conversion — estimate |
| TH, VN, KR | 420 / 450 / 420 | Asian P1020 premium + local billet fee (AlCircle, 2026) — estimate |

The UK price works out as follows:

- 6063 billet: **£3.27/kg**.
- 6082 billet: £3.38/kg (alloy adder $150/t).
- 7075 billet carries a $1,200/t adder.

Both regional paths read this table, so they agree:

- `buildRegionalLibrary` prices `mat-al-billet-*` for each region.
- `alBilletMaterialFactors` gives the country table its own ratio for each region. It replaces the flat factor used for globally traded material.
- The PDF export uses the same factors.

## 3. The press plan (process cost)

1. **Die type.** No void → solid. Voids → porthole, or bridge when the circle exceeds the porthole limit. Indirect with one void → seamless (mandrel). Many small voids → micro multi-port.
2. **Press.** Picks the smallest press where:
   - the circle fits the container limit (solid or hollow);
   - the ratio stays below the alloy's maximum;
   - the force stays under 90 % of rated.

   The direct presses run from 800 t to 8,000 t. There is also a 2,800 t indirect press and a 1,600 t hydrostatic press.
3. **Holes per die.** As many as the container takes at circle + 15 mm pitch. The cap is 8 for solid dies and 4 for hollow dies.
4. **Pressure.** Johnson: p = σ̄ · (0.8 + 1.5 ln R).
   - Friction × 1.35 for direct extrusion; indirect has none.
   - × 1.15 for a hollow, for the weld chambers.
   - Force = p × container area.
5. **Exit speed** by alloy, from 6063 at 50 m/min down to 7075 at 2 m/min. It is multiplied by 0.75 for a hollow and slowed further for thin walls. It is capped by the ram speed ÷ ratio.
6. **Billet length.** Chosen so each strand holds a whole number of parts:
   - butt (by alloy);
   - 1.2 m of puller and stretcher ends;
   - 4 mm saw kerf;
   - run-out table length.

   Recovery = finished metal ÷ billet. Typical results are 90–93 %, against an industry figure of 85–92 %.
7. **Cycle** = dead cycle + push time. Monthly runs with a 0.5 h die change; a run shorter than 4 press hours is merged.
8. **Dies.** £ base + £ per mm of circle, by type. Life is counted in tonnes extruded (H13 30–80 t), with nitriding every 40 t. Dies charged = max(1, annual tonnes ÷ life).

The machine rates use the library's standard build-up: depreciation, maintenance, energy, floor space and utilisation. Capex is an **estimate**. Published bare Chinese presses cost $0.8–1.8 M at 1,450–1,800 t and $1.5–3 M at 2,000–2,500 t ([SLX Extrusion Press](https://www.slxextrusionpress.com), 2026), and a full line adds 40–70 %. A European-built line is costed, so the 2,500 t line comes to £367.58/h.

## 4. Eight modelled parts

These parts were modelled in OCP for this test (`cad-audit/parts/AL_modelled_parts.py`). They are **not customer parts**. Costs are UK at 50,000 a year.

| Part | Alloy / route | Press · die · ratio | Total |
|---|---|---|---|
| Crash box, 2 chambers, 400 mm | 6082 direct | 2,500 t · porthole · 31.6 · 9 m/min · 72 a push | **£10.11** |
| Battery rail, 4 chambers, 1.8 m | 6063 direct | 2,500 t · porthole · 30.4 | £33.86 |
| Trim channel, 1.2 m, anodised | 6060 direct | 800 t · solid · 68 | £3.55 |
| Bumper beam, 1.3 m, 1 stretch bend | 7003 direct | 2,500 t · porthole · 38 | £26.39 |
| Heat sink, finned, 150 mm, anodised | 6063 direct | 1,450 t · solid · 13.8 | £4.14 |
| Machined bracket, notch + 2 holes | 6082 direct | 1,450 t · solid · 24 | £7.12 |
| Busbar 40 × 10, 400 mm | 1050 Conform | rod at 900 kg/h | £3.42 |
| Cell can Ø46 × 80, 0.95 mm wall | 1050 impact | 800 t impact press, 30 a minute | £0.75 |

The battery rail costs £1.39/kg converted, excluding metal. This sits inside the €1–2.5/kg conversion band quoted for automotive hollows.

### Hand reconciliation: crash box (6082 T6, UK, 50k/yr)

- **Plan.** One 995 mm billet weighs 117.9 kg and makes 72 parts. Billet per part is 1.6377 kg; as extruded, 1.5024 kg.
- **Material.** £5.414 in total, made up of:
  - billet bought: 1.4915 ÷ 0.98 reject ÷ 0.9107 = 1.671 kg × £3.3798 = £5.648;
  - scrap credit: −0.149 kg × £2.073 = −£0.309;
  - consumables: +£0.075 (heat 0.29 kWh/kg + age 0.10 kWh/kg at £0.067/kWh, nitride, cutting fluid).
- **Press.** 225.9 s ÷ 0.98 = 0.0640 h a push.
  - Machine: 0.0640 × £367.58 ÷ 72 ÷ 0.78 = **£0.419**.
  - Labour: 0.0640 × 4 crew × £19.94 ÷ 72 ÷ 0.92 = £0.077.
- **Ageing.** 8.93 h × £33.00 ÷ 5,324 parts a load = £0.055.
- **Dies.** £7,103 × (75.1 t ÷ 40 t) + £2,575 fab fixture = £15,915 ÷ 50,000 = £0.318.
- **Total:** £10.11 after overhead and margin. The tool's figure matches to the penny.

## 5. How it was checked

- `tests/aluminium-extrusion-build.test.ts`:
  - billet arithmetic, every region carrying a stated basis, and both regional paths agreeing;
  - the planner: die type, press choice, force use, whole parts per strand, alloy speed;
  - temper needs, and the stack reconciling;
  - the kernel section, and chambers not counted as pockets;
  - routing for all 8 parts, and names;
  - headless costing of all 8 parts within stated bands, Conform and impact reached, and US above CN.
- The real-parts baseline records all 8 parts. No other part moved.
- Snapshot `tests/fixtures/commodity-rules/aluminium_extrusion.txt`.

### Bugs found while building it

- **Chamber walls as pockets.** The kernel reads a hollow profile's chamber walls as pockets. The crash box carried 2 × 58.5 mm "pockets", which came to 585 minutes of CNC and a £917 part. Fabrication now takes only holes from the feature table, plus the measured volume that was really machined away.
- **Holes counted twice.** Drilled holes were counted again in the machined volume. They are now subtracted.
- **Sanity check refused profiles.** The thin-wall / low-fill check (meant for a misrun casting) refused 4 of the 8 parts. An extruded profile is thin-walled at low envelope fill by nature, so aluminium extrusion is no longer in that set.
- **Section probe changed the hole reading.** The section probe widened tolerances on the shape it cut, which turned two of the casting bracket's through holes into blind holes (£41.35 → £42.45). It now cuts a copy, and the bracket is back at £41.35.

## 6. Still open

- **Estimates.**
  - Machine and line capex, die prices (European, above the Asian anchors), exit speeds and flow stresses are labelled estimates in `al-extrusion-data.ts`.
  - US, CN, IN and South-East Asian billet premiums are estimates or derived.
  - Only DE, IT, TR, MX and BR are published assessments.
- **Gas.** Heating and ageing gas is charged at the UK tariff inside consumables. The regional library rescales the machine rate, but not that gas line.
- **Semi-hollow tongue.** The kernel does not detect a semi-hollow tongue (tongue ratio). The die choice offers semi-hollow only when the engineer picks it.
- **Bent profiles.** Stretch-bent profiles are reached by the bends question. The kernel measures a bent beam as a non-constant section.
- **Niche processes.** Hydrostatic extrusion and micro multi-port dies are niche. Their constants rest on few published figures.
- **Not validated against real prices.** As with the whole baseline, this pins what the tool says, not what is true. No figure here has been checked against a price paid for an extrusion.

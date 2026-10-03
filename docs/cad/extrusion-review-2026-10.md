# Extrusion should-cost model — review, October 2026

This review was requested ahead of the cost-engineering director's own review.
It covers both extrusion routes:

- **aluminium extrusion**, built earlier in October 2026 (`docs/cad/aluminium-extrusion-build-2026-10.md`);
- **polymer extrusion** (`docs/cad/extrusion-build-2026-10.md`).

It looks at five questions:

1. Are all material grades and process types covered?
2. Are the machine rates right?
3. Does the model read the 3D CAD, drawings and images properly?
4. Does it should-cost end to end?
5. Is every money figure deterministic arithmetic, with no AI-set number?

**Result.**

- The model was sound in structure.
- It had 15 defects, of which five moved money: the press-force check, the scrap credit, the missing cut-to-length step, UK-only energy and the missing finishing consumables.
- It also had material gaps: 16 aluminium alloys and 14 polymer extrusion grades were missing.

All of these are fixed and pinned by `tests/extrusion-review.test.ts`, which has one test per finding. The modelled parts are re-recorded in the real-parts baseline. No other part moved.

## 1. The chain, start to end

| Step | What decides it | Deterministic? |
|---|---|---|
| Read the 3D CAD | Kernel `_profile_section`: cuts the solid across each axis at 25 / 50 / 75 % of its length. It reports area, outline (whole and outside), voids, circumscribing circle (Welzl), thinnest wall, **tongue ratio** (semi-hollow test), and whether the section is constant or machined. | Yes — OCP geometry |
| Read the file's own words | Declared material designation (STEP `MATERIAL_DESIGNATION` / property sets), product names, file name. | Yes — text parsing |
| Read drawings and images | With an API key, the vision identification step reads the photo, drawing and renders. The grade it reads is a **leaning** on the alloy question, never an answer. | AI reads; the engineer confirms |
| Route | Constant or intricate section, or a long machined section → aluminium extrusion offered. Revolved cup → impact extrusion offered. A metal grade on the polymer route → asked to re-route. | Yes — rules |
| Alloy | **Blocking** question. The shape cannot tell 6063 from 7075. | The engineer |
| Process, temper, finish, bends | Advisory questions, with defaults applied. | Rules, or the engineer |
| Press plan | `planAlExtrusion`: die type, press, holes, breakthrough pressure, longest billet the force allows, exit speed, mill lengths, recovery, runs, die. | Yes — arithmetic |
| Cost | `computeAluminiumExtrusionDrivers` → `computeUniversalStack` → 8 buckets. Screen and headless share `buildAlExtrusionInputs`. | Yes — arithmetic |

**AI never sets a price.**

- In AI mode the rules overwrite every field the model returned (`applyRuleDecisions`).
- Fields owned by an open question are cleared (`suppressAIForUndecided`).
- The alloy stays blocking even when the model read one off a drawing.
- The deterministic mode, the default, has no model in it at all.

## 2. Findings and fixes

| # | Finding | Effect | Fix |
|---|---|---|---|
| 1 | **Press force never constrained a 6xxx part.** Container friction was a flat ×1.35, so a 2,500 t press could apparently push 6063 at a ratio of 8,000. | Recovery and cycle were optimistic for hard alloys and hollows. | Breakthrough pressure = Johnson σ(0.8 + 1.5 ln R) × weld factor (hollow 1.15), plus sticking friction 4·(σ/√3)·L/D on a direct press. The force now sets the **longest billet**. If that is under 2 container diameters, the next press is tried. Indirect and hydrostatic presses have no container friction. |
| 2 | **Scrap credited at 88 % of LME.** Clean 6063 production scrap sold at LME + €48/t in Europe in 2026 (Fastmarkets MB-AL-0404). | Material cost overstated on every part. | Scrap = LME + a differential per alloy: +$56/t for 1xxx and 6xxx (sourced); a stated discount for alloyed scrap (3xxx/5xxx −$150 to −200, 7xxx −$300, 2xxx −$400, free-machining −$450). |
| 3 | **No cut-to-length step.** Parts were assumed cut at the hot saw. | Missing an operation and its end trims. | The strand is cut into **mill lengths** (2.5–7 m; mill count and length optimised for parts per push), aged, then **cut to length cold**. Trims are 2 × 25 mm per mill length. The saw `al-ctl-saw` cuts in bundles. |
| 4 | **Energy at the UK gas price in every region.** | The CN, US and IN rows carried UK gas. | Energy is passed as kWh (`rawMaterial.energyKwh`) and the **core prices it at the rate library's tariff**, so the regional library uses its own region's price. |
| 5 | **Finishing charged no coating.** | Anodise, powder and e-coat were under-costed. | Consumables per m²: anodise £0.35, powder £0.72 (0.12 kg/m² × £6/kg), e-coat £0.28. **Powder coats the outside only** (outer outline × length, a new kernel output). Anodise and e-coat coat every surface. |
| 6 | **No stretch-bend tooling.** | Bent beams were missing the form tool. | £15k for the first bend and £5k for each extra bend form (estimate). |
| 7 | **Semi-hollow never chosen automatically.** | Tongued sections got a solid die. | The kernel measures the **tongue ratio**: the largest space ÷ gap² across each concavity's narrowest mouth. 3:1 or more selects a semi-hollow die (AA practice puts the solid-die limit at 2–4:1). |
| 8 | **Section chaining tolerance scaled on part length.** 2 mm on a 2 m part — wider than its 1.5 mm wall — so the seal carrier lost 9 mm² of section. | Wrong section on long thin profiles. | Tolerance now set by the section; joins the nearest end. |
| 9 | **Tempers.** 2024's default T3511 was not offered; T73, T76, T7 and T8 were missing. | — | Every alloy carries the tempers it is supplied in (EN 515). The SHT and ageing logic covers T3x, T4, T5, T6x, T7x and T8. |
| 10 | **The declared material was ignored.** Only names were read. | A file saying "EN AW-6082 T6" did not lean 6082. | Evidence order: declared designation, then the AI drawing read, then names, then application words. A declared temper becomes the default. |
| 11 | **Two dead-end questions.** `extrusion.metal` told the engineer to machine an aluminium profile; `al.notProfile` offered re-routes nothing read. | Answering did nothing. | Both are now asked **as the process question** (`commodity.route`), so the answer re-routes the part. |
| 12 | **The polymer form offered the aluminium billets** (scope `/Extrusion/` matched "Aluminium Extrusion Billet"). | A polymer line could price 6063. | Scope changed to `^Extrusion$`. |
| 13 | **Polymer family mapping.** PMMA, POM, ASA, PVDF and PEEK fell through to "PE"; medical PVC (plasticised) read as rigid. | Wrong line rate and energy. | Fixed. A new `high-temp` family (output ×0.55) covers PVDF, PEEK and PPS. |
| 14 | Exit speeds of 3003, 6061 and 5083 were outside the published relative extrudability. | Cycle was off by up to 2×. | Re-based on the published index (6063 = 100) and the published hard-alloy bands (see §3). |
| 15 | The polymer question read "Which resin is this **moulded** in?". The polymer header said the library had no aluminium press. | Wording. | Corrected. |

## 3. Materials now covered

### Aluminium

There are 30 alloys across every extrusion series. New ones are in **bold**.

| Series | Alloys |
|---|---|
| 1xxx | 1050A, **1070A**, **1100**, **1350 (EC)** |
| 3xxx | 3003, **3103** |
| 5xxx | **5754**, 5083, **5086** |
| 6xxx | 6060, 6063, **6063A**, **6106**, 6101B, 6005A, **6008**, 6061, **6351**, 6082, **6026** |
| 2xxx | **2011**, **2014**, **2017A**, 2024 |
| 7xxx | 7003, **7005**, **7046**, 7108, 7020, 7075 |

Each alloy carries:

- density;
- billet adder;
- flow stress;
- exit speed with its basis;
- maximum ratio;
- butt;
- quench;
- tempers;
- ageing hours;
- scrap differential;
- route preference.

Billet price per region = LME + the regional all-in premium + the alloy adder. This is unchanged from the build and sourced as stated there.

**Exit speeds.** The published relative extrudability (6063 = 100) is:

| Alloy | Index |
|---|---|
| 1350 | 160 |
| 1100 | 135 |
| 3003 | 120 |
| 6061 | 60 |
| 2011 | 35 |
| 5086 | 25 |
| 2014 | 20 |
| 5083 | 20 |
| 2024 | 15 |
| 7075 | 9 |

Soft and medium alloys use 6063's 50 m/min × index. Hard alloys use the middle of the published bands instead: 2014–2024 1.5–3.5 m/min, 5083/5086 2–6 m/min, 7075 0.8–2 m/min.

**Flow stress.** 6063 is anchored on Sellars–Tegart with Sheppard & Jackson's constants (α 0.04, n 5.385, ln A 22.5, Q 141.5 kJ/mol), giving 26 MPa at 480 °C and ε̇ ≈ 3 s⁻¹. The others are scaled from it as labelled estimates.

### Polymer extrusion

There are now 29 grades in the "Extrusion" category, 14 of them new.

| New grade | Price | Basis |
|---|---|---|
| PVC-U window profile compound | £1.29/kg | EU rigid PVC compound €1,200–1,800/t, mid-point |
| PVC-P flexible profile / seal | £1.54/kg | EU flexible PVC €1,400–2,200/t, mid-point |
| PP-R pipe | £1.17/kg | €1,358/t, week 36 2026 |
| PE-Xb pipe | £1.61/kg | ESTIMATE: PE100 + 20% silane system |
| PA11 tube | £6.32/kg | $8,390/t Rilsan listing |
| PVDF | £9.03/kg | $11–13/kg listings (a floor) |
| TPV weatherseal | £3.21/kg | library TPV index |
| POM rod / tube | £2.32/kg | €2.70/kg, September 2026 |
| HDPE profile | £1.05/kg | library index |
| LDPE tube | £1.09/kg | library index |
| PA6 conduit | £1.68/kg | library index |
| TPU hose | £2.52/kg | library index |
| PEEK | £76/kg | library index |
| ASA capstock | £2.24/kg | library index |

FX is the library's €1.165/£ and $1.3285/£.

## 4. Processes covered

| Route | Model |
|---|---|
| Direct hot extrusion | 800 / 1,450 / 1,800 / 2,500 / 3,600 / 5,500 / 8,000 t presses, with container friction |
| Indirect | 2,800 t; no container friction; seamless over a mandrel |
| Hydrostatic | 1,600 t; high ratio; no container friction |
| Conform | Continuous from rod; 900 kg/h; no butt; no billet heat |
| Cold impact | 800 t; slug + 8 % trim; 30 strokes/min |
| Dies | Solid, **semi-hollow** (now by tongue ratio), porthole, bridge, seamless mandrel, multi-port |
| Downstream | Press quench, stretch, **mill lengths**, off-line SHT, ageing, **cold cut-to-length**, CNC fabrication, stretch bending (+ **tooling**), anodise / powder / e-coat (+ **consumables**), inspect and pack |

## 5. Machine rates

These were rechecked. The build-up is: 15-year straight-line depreciation, maintenance 3.5 %, energy at the running load, floor £110/m², indirect 5 %, finance 4 % of half the capex, all over 6,000 h at 80 %.

- **2,500 t line.** £6.0 M capex gives £1.764 M a year ÷ 4,800 h = **£367.58/h**, at a 0.20 kWh/kg running load.
- **Conversion check.** The battery rail costs £1.43/kg excluding metal, inside the €1–2.5/kg band for automotive hollows. European extrusion trades at €3–5/kg all-in, against the crash box at £6.80/kg with CNC and ageing.
- **Cold cut-to-length saw.** £220k capex over two shifts (4,000 h) gives **£18.92/h**.

Every capex figure is labelled an estimate in `al-extrusion-data.ts`.

## 6. Hand reconciliation — crash box, 6082 T6, UK, 50,000/yr

**Plan.**

- 2,500 t press, porthole die, ratio 31.6.
- Breakthrough 501 MPa: deformation 247 + container friction 254 on a 721 mm billet. That is 2,237 t, 89 % of the press.
- The force allows a 729 mm billet at most.
- The 85.5 kg billet gives a 21.65 m strand = 5 mill lengths × 10 parts = 50 parts a push.
- Exit speed 15 m/min (20 × 0.75 hollow), cycle 110.6 s.

**Costs.**

| Item | Working | £ |
|---|---|---|
| Material | 1.5279 ÷ 0.8759 = 1.7443 kg × £3.3798 − 0.2164 kg × £2.481 scrap (LME + $56) + £0.0326 (nitride, fab wear) + gas 0.6592 kWh × £0.067 | 5.4353 |
| Press | 0.031349 h × £367.58 ÷ 50 ÷ 0.78 | 0.2955 |
| Press labour | 0.031349 h × 4 × £19.94 ÷ 50 ÷ 0.92 | 0.0544 |
| Cut-to-length | (11/10 × 11.77 s ÷ 1 + 2 s) = 14.95 s → 0.004238 h × £18.92 ÷ 0.78 | 0.1028 |
| Ageing, CNC, pack | as the build | — |
| **Total** | after overhead 12 % and margin 8 % | **10.16** |

The tool gives **£10.16** and matches to the penny.

## 7. Proof

- `tests/extrusion-review.test.ts`: 23 tests, one per finding.
- `tests/aluminium-extrusion-build.test.ts`: still passes, 30 tests.
- **Real-parts baseline.** Nine AL parts are recorded, including the new semi-hollow `AL_Seal_Carrier`.

  | Part | Before (£) | After (£) |
  |---|---|---|
  | Crash box | 10.11 | 10.16 |
  | Battery rail | 33.86 | 34.01 |
  | Bumper beam | 26.39 | 27.94 |
  | Heat sink | 4.14 | 4.33 |
  | Trim channel | 3.55 | 3.68 |
  | Bracket | 7.12 | 7.06 |
  | Busbar | 3.42 | 3.41 |
  | Seal carrier | — | 3.70 (new) |

  The bumper beam rose because its force-limited billet gives 12 parts, not 13 (recovery 84 %), and it now carries the bend tool. No non-aluminium cost moved. The rubber door seal's section reading changed with the chaining fix (130.14 → 129.45 mm²); its cost did not.
- **Live browser parity.** On five parts the screen equals headless to the penny: crash box £10.16, seal carrier £3.70, bumper beam £27.94, busbar £3.41, can £0.75. The screen received the measured tongue ratio (13) and outside area.

## 8. Still open — stated, not hidden

- **Estimates.**
  - Capex, die prices, flow stresses of all alloys but 6063, and exit speeds where no index is published.
  - Billet adders and scrap differentials outside 6xxx.
  - The finishing consumables, PE-Xb, and the PVDF price, which is an Asian listing and so a floor.
- **Drawings.**
  - A 2D section DXF is not yet read as the section; the 3D CAD is. The DXF reader in `server/utils/dxf-blank.ts` could carry it.
  - A drawing's tolerances (e.g. EN 755-9 special tolerances) do not move the cost.
- **Flow stress** is one value per alloy, not computed per billet temperature and strain rate.
- **The press stops at 8,000 t**; there is no 10,000 t+ flat-container press for wide panels.
- **Regional rows.** The country table rescales the UK material line, energy included, by the billet factor. The full regional library prices energy correctly.
- **CNC programming** uses the UK engineer rate in headless runs.
- **Not compared with any price paid.** The baseline pins what the tool says, not what is true.

## Sources

- Relative extrudability and exit-speed bands: "Extrusion of Aluminum Alloys" (ASM handbook chapter, NIST materials data repository).
- 6063 constitutive constants: Sheppard & Jackson 1997, as quoted in *Frontiers in Materials* (2021).
- 6063 clean production scrap: Fastmarkets MB-AL-0404, "clean production extrusions (6063), differential to LME, delivered consumer Europe" — LME + €48/t, 2026 average.
- Ruhr 6063 billet premium: $1,175–1,250/t in May 2026 (AlCircle). The model uses Fastmarkets' 28 August assessment, $1,070–1,135.
- Extrusion pressure ranges: 6063 / 6082 medium pressure 300–600 MPa (Aluminium Guide).
- Rigid / flexible PVC compound ranges: IndexBox EU PVC compounds 2026.
- PP-R pipe grade: plasticportal.eu, week 36 2026.
- POM natural: €2.70/kg, September 2026.
- PA11: Arkema Rilsan listing on plas.com.
- PVDF: 2026 supplier listings.

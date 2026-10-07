# Battery pack and e-motor should-cost: build, October 2026

Two new commodities, **Battery Pack** and **E-Motor**, reachable from the commodity picker and the cost executor (agent / headless).

They are specification-driven, like the wiring harness and PCBA: you enter the pack or motor design. There is no CAD route.

| | |
|---|---|
| Code | `src/engine/ev-data.ts` (data and sources)<br>`src/engine/modules/battery-pack.ts`<br>`src/engine/modules/e-motor.ts`<br>`src/engine/modules/ev-advisor.ts` (market checks)<br>`src/ui/ev-forms.ts` |
| Tests | `tests/ev-propulsion.test.ts` (15) |

## 1. Where every number comes from

Sources were read on 7 October 2026. The publishers' own pages are blocked from the build environment, so each figure is as reported by the cited coverage. URLs are in `ev-data.ts`.

| Input | Value | Source |
|---|---|---|
| NMC cell | $102.4/kWh | BNEF 2025 survey: NMC pack $128/kWh × BEV cell share 80 % |
| LFP cell | $64.8/kWh | BNEF 2025: LFP pack $81/kWh × 80 % |
| LMFP / NCA cell | $71.3 / $102.4 per kWh | **ESTIMATE** (no survey line): LFP + 10 % / as NMC |
| Pack benchmark | Packs $108/kWh average; BEV packs $99, BEV cells $79 (80 %); pack integration $20/kWh | BNEF 2025 |
| NdFeB magnet blank | ¥295/kg (45SH) | SMM 2026 weekly reviews: ¥250–340/kg across two reviews, midpoint |
| Terbium oxide | ¥6,675/kg | SunSirs, 12 Feb 2026 (¥6.65–6.70 M/t); Tb₄O₇ is 85.0 % Tb |
| Tb content in UH / EH magnets | 0.4 % / 0.7 % | **ESTIMATE** |
| Blank → finished magnet | +30 % | **ESTIMATE** |
| Magnet mass default | 1.5 kg | Industry benchmark 1–2 kg per traction PMSM |
| Metals (aluminium sheet, busbar Al, copper, hairpin copper, electrical steel, A380, 20MnCr5) | Rate library | **The costing country's book**, so they follow the country |
| BMS, contactors, pyrofuse, fuse, sensor, connectors, bearings, resolver, liners, resin, gap filler, mica, adhesive | — | **ESTIMATE**, engineering typical. Each line says so; replace with quotes |
| Enclosure, cold plate, busbar, housing and shaft conversion £/kg; enclosure kg/m²; housing feature factor | — | **ESTIMATE** |
| 17 line machines (cell test, stacking, laser weld, dispensing, pack assembly, leak, EOL; lamination press, hairpin line, weld, impregnation, rotor, balancing, assembly, EOL) | Capex | **ESTIMATE**. Rates are built like every library machine (10-year depreciation, maintenance, energy, floor, indirect, finance), so the country book re-rates them |

## 2. How it is costed

### Battery pack

- **Cells** are **bought in**: the market price per kWh (or your quote) × the pack's kWh. They go to `rawMaterial.boughtIn`, so the pack maker's overhead and margin are **not** applied to them again. Only a handling charge (3 %) is, as on BIW.
- **Integration**, built up:
  - aluminium busbars (g per joint by cell format × 2 joints per cell) and copper inter-module busbars;
  - sensing per series channel; the BMS master and monitoring boards (series ÷ channels per board);
  - the HV junction box;
  - enclosure and cold plate (kg/m² × footprint, library metal + conversion);
  - gap filler, two mica barriers, module hardware or cell-to-pack adhesive, vent, coolant connectors, seals.
- **Line**:
  - cell OCV/IR test (2 s per cell);
  - stacking (seconds per cell by format);
  - laser welding (seconds per joint by format);
  - module EOL test (60 s per module);
  - dispensing (90 s per m²);
  - pack assembly (40 min + 45 s per module, 2 people);
  - leak test (5 min);
  - EOL test (20 min).
- **Tooling:** pack fixtures £600k, amortised.

### E-motor

- **Laminations:** the stator and rotor come from one strip on one progressive die, with the rotor out of the stator's bore. The strip buys one square pitch (OD + 6 mm) per lamination. Net steel = stator annulus × steel share + rotor disc − shaft bore, × the stacking factor. The scrap is credited at the library scrap price.
- **Copper:** slot area (annulus × (1 − steel share)) × fill × active length × (1 + end-turn factor).
- **Magnets** (PMSM) from the grade. An induction motor gets a die-cast cage; an EESM gets rotor copper plus slip rings.
- **Housing and shaft:** library metal + conversion. These are stated estimates; cost them in Cast + Machine or Machining for detail.
- **Bought-in parts:** bearings, resolver, sensors, slot liners, HV terminal, seals.
- **Line:**
  - lamination stamping at 300 strokes/min;
  - hairpin forming and insertion (90 s) and twist + weld (0.6 s per joint + 30 s), or round-wire winding (240 s);
  - impregnation (120 s takt);
  - rotor (60 s) and balancing (90 s);
  - final assembly (6 min, 2 people);
  - EOL test (5 min).
- **Tooling:** lamination dies wear out fractionally by strokes (50 M per die), plus hairpin tools and fixtures.

## 3. Reference results (UK, 10 % overhead, 7 % margin, no packaging or freight)

**Pack:** NMC prismatic 140 Ah, 192 cells in series × 1 in parallel, 24 cells per module, 2.0 × 1.4 m footprint, aluminium enclosure.

| | Value |
|---|---|
| Pack | 98.1 kWh, 701 V, 8 modules, 384 joints |
| Cells | £7,588 = $102.4/kWh |
| Total | **£9,640 = $130/kWh** |
| BNEF NMC pack average | $128/kWh |
| Cell share | 79.5 % (BNEF BEV average 80 %) |

**Motor:** PMSM, stator 220 / 150 mm × 150 mm, 48 slots, hairpin with 6 layers, NO27 steel, 1.6 kg N45UH (Tb GBD).

| | Value |
|---|---|
| Laminations | 534; 56.0 kg steel bought, 29.2 kg in the stacks (52 %) |
| Copper | 10.6 kg |
| Magnets | £47.79/kg |
| Total | **£697** |

**On screen,** with the screen's default shop figures: the pack is £9,650.97 and the motor £792.27. In India the pack is £9,269. Cells don't move with the country; labour, machines and local metals do.

`tests/ev-propulsion.test.ts` re-derives each of the following by hand:
- the pack kWh;
- the cell price;
- the bought-in overhead and margin;
- the lamination count;
- the stator, rotor and strip mass;
- the copper mass;
- the magnet price;
- the fractional die wear;
- that the lines add up to the material bucket.

## 4. What it does not do, stated

- **Cells are not costed bottom-up** (cathode, anode, electrolyte, separator, can, formation). They are a market price or your quote. A cell-level model is the next step if cell sourcing is the question.
- **No CAD route.** Both commodities are costed from the specification.
- **The motor housing and shaft** are conversion estimates. **The inverter is not included**; cost it as PCBA plus a power module.
- **Packaging and logistics** use the app's generic defaults. A battery pack ships as dangerous goods (UN3480), so type the real figures.
- **Not validated against a purchase price.** The pack is checked against BNEF's 2025 market averages, which is a market comparison, not a cost of this design.

# Arithmetic audit — injection moulding (30 Oct 2026)

Group `injection-moulding`. Brief: `BRIEF.md`. Shadow model `scripts/arith-audit/injection-moulding.ts`; tests
`tests/arith-audit-injection-moulding.test.ts`.

## 1. Scope

Files audited (owned): `src/engine/cost-input-rules/commodities/injection-moulding.ts` (rules),
`src/engine/modules/injection-moulding.ts` (module, press ladder, mould build-up, cooling law),
`src/engine/modules/injection-advisor.ts` (DFM text), `src/engine/cavitation-optimiser.ts`,
`src/engine/cost-input-rules/derive/resin.ts`, the `injection_moulding` case of `to-cost-params.ts`.
Read, not owned: `toolmaking.ts` (toolroom rates and hour laws the mould build-up composes), `derive/envelope.ts`
(wall / area), `core.ts`, `routing-optimiser.ts::standardBatchSize`.

Real parts (UK book, 50,000 a year, 5-year programme, the baseline's answers): `IM_ECU_Cover.stp` (PA66-GF30),
`IM_Cable_Clip.stp` (PA66-GF30), `IM_Storage_Tray.stp` (impact PP).

Reproduce:

```bash
cd calculator
npx tsx scripts/arith-audit/dump.ts <dir>                       # the product's own headless chain
npx tsx scripts/arith-audit/injection-moulding.ts <dir>         # 136 independent checks, exit 1 on FAIL
python3 -I scripts/arith-audit/basis-check.py <dir>             # every printed "a × b = c"
npx vitest run tests/arith-audit-injection-moulding.test.ts
```

## 2. Sequence: as costed v as made

| Part | As costed (in order) | As a moulder makes it | Verdict |
|---|---|---|---|
| ECU cover | resin drying (0.15 kWh/kg, energy on the material line) → **Injection Moulding** imm-200t, 1 cavity, 19.5 s, crew 0.5 → **Mould change** imm-200t + setter, 1.5 h ÷ 2,500 → packaging £/part | dry PA66-GF30 (desiccant) → mould on ~200 t, 1-cavity cold runner, 2 slides → robot take-out, sprue picker to granulator → operator checks and packs at the press | Matches. Degating is the picker / sub-gate inside the cycle; inspection is the tending operator (crew 0.5), not an op. |
| Cable clip | drying → **Injection Moulding** imm-50t, 4 cavities, 12.5 s, crew 0.5 → **Mould change** 1.5 h ÷ 2,500 → packaging | dry → 4-cavity cold runner (sub gates) on 50 t → picker → pack | Matches. The mould change is 14% of the clip's cost (2,500-part batch = 2.2 h of press time against a 1.5 h change) — see P-8. |
| Storage tray | **Injection Moulding** imm-1200t, 1 cavity, 2-drop hot runner, 39.6 s, crew 1 → **Mould change** 4 h ÷ 2,500 → packaging (no drying: PP) | 2-drop valve-gated hot runner on ~1,000–1,300 t, operator takes off and packs | Matches. No runner, so no regrind / degate. |

Nothing charged twice; no missing step for these three. The mould-change line is listed after the moulding line
(an amortised set-up, not a physical order problem) — L, not changed (P-7).

## 3. ECU cover by hand, to the penny (after the fixes)

Measured: V 122.35 cm³, silhouette along the draw 21,618 mm² → **216.2 cm²**; wall 2.5 mm (8 fillet inner/outer pairs;
2·V/S 2.27 reads low). Rate book: PA66-GF30 £3.10/kg, 1,300 kg/m³, scrap £0.05/kg; imm-200t £22.9359375/h;
semi-skilled £24.65/h; technician £35.17/h; electricity £0.182/kWh.

| Step | Arithmetic | Value |
|---|---|---|
| part | 122.35 × 1,300 ÷ 10⁶ | 0.1591 kg |
| cavity pressure | 55 (PA66) + 10 (glass fill) | 65 MPa |
| cavitation | ranked £/part 1-up 0.3861 · 2-up 0.4184 · 4-up 0.5301 · 8-up 0.8108 | **1** |
| clamp | 216.2 × 1 × 1.1 (cold runner) × 65 × 100 N × 1.15 ÷ 9,806.65 | 181 t → imm-200t (shot 141 cm³ ≤ 0.8 × 450; mould 280 mm ≤ 560 tie bars) |
| runner | max(0.15 × 0.1591, 0.003) | 0.0239 kg/shot (cold, 159 g < 250 g) |
| fill | max(1.5, 140.7 cm³ ÷ 120 cm³/s = 1.17) | 1.5 s |
| pack | max(2.0, 0.8 × 2.5) | 2.0 s |
| cool | 2.0 s/mm² × 2.5² | 12.5 s |
| eject | dry cycle 2.5 + take-out 1.0 | 3.5 s |
| cycle | (1.5 + 2.0 + 12.5 + 3.5) ÷ 3,600 ÷ 0.98 | 0.00552721 h |
| moulding machine | 22.9359375 × 0.00552721 ÷ 1 ÷ 0.85 | £0.149143 |
| moulding labour | 24.65 × 0.5 × 0.00552721 ÷ 1 ÷ 0.95 | £0.071708 |
| mould change | (22.9359 + 35.17) × 1.5 ÷ 2,500 | £0.013762 + £0.021102 |
| regrind | min(0.8, 0.20 × 183 g ÷ 23.9 g) | 0.80 |
| material | net 0.1591 ÷ 0.98 = 0.162347; gross (0.1591 + 0.0239 × 0.2) ÷ 0.98 + 2 kg ÷ 2,500 = 0.168024 kg; 0.168024 × 3.10 − (0.168024 − 0.162347) × 0.05 + drying (0.1591 + 0.0239) ÷ 0.98 × 0.15 kWh × 0.182 | 0.520876 − 0.000284 + 0.005098 = **£0.525690** |
| mould | design 69.2 h £4,045 · base £2,117 · steel 67 kg p20-hard £553 · CNC 196.2 h £10,273 · EDM 24.5 h £1,432 · polish 19.6 h £889 · fitting 49 h £2,371 · tryout 3 × 8 h £2,055 · 2 core-pull cylinders £2,900 · slide fitting 58.2 h £2,812 = £29,447; + 22% toolmaker OH&P £6,478 | **£35,925** |
| tooling | 35,925 × 1 mould × (1 + 0.03 × 5) ÷ 250,000 | £0.165255 |
| process / labour | 0.149143 + 0.013762 / 0.071708 + 0.021102 | £0.162905 / £0.092810 |
| overhead | 12% × (0.525690 + 0.162905 + 0.092810 + 0.165255 = 0.946660) | £0.113599 |
| margin | 8% × (0.946660 + 0.06 + 0.06 + 0.113599 = 1.180259) | £0.094421 |
| **total** | | **£1.27468** (was £1.27474) |

The chosen row's printed £0.3861 = 0.149143 + 0.071708 + 0.165255: the ranking now prints what the costing charges.

## 4. Shadow model

`scripts/arith-audit/injection-moulding.ts` recomputes, from the fixture geometry and the rate book alone (no module,
rule, optimiser or toolmaking function called): wall, area, mass, cavity pressure, cool factor, runner system and
weight, every cavitation candidate (clamp, shot, mould size, press, fill / pack / cool / eject, steel class, the mould
build-up line by line, the £/part ranking), regrind, crew, reject, change, purge, batch, maintenance, drying, both
operations, the material line, tooling and the 8 buckets.

| Dump | ECU cover | Cable clip | Storage tray | Total |
|---|---|---|---|---|
| before the fixes | 41/46 | 41/46 | 41/44 | 123 PASS, **13 FAIL** (every printed cavitation £/part; the maintenance basis) |
| after the fixes | 46/46 | 46/46 | 44/44 | **136 PASS, 0 FAIL** |

`basis-check.py` on the IM parts: 3 false hits before (the cooling basis's "melt 280°C / mould 80°C / eject 125°C"
read as a division), 0 after (the reworded tool-NRE line prints "£X × 1.15 with maintenance ÷ 250,000 parts → £Y").

## 5. Constant register (files owned)

Class: S = sourced, LIB = rate book, M = measured, LE = labelled estimate visible to the reader, U = unlabelled.
"Now LE" = was U, the basis now prints it. £ effect on a real part at the dump's settings.

| file:line | Value | Meaning | Class | Effect |
|---|---|---|---|---|
| resin.ts `CAVITY_PRESSURE_MPA` | 35–70 MPa, +10 filled | peak cavity pressure → clamp → press | now LE (basis prints 55 + 10 = 65) | ±15% moves no real part's press |
| module `autoCoolFactorForMaterial` | 1.8–3.5 s/mm² | curated cooling factor | now LE | ECU cool 12.5 of 19.5 s; ±10% ≈ ±£0.017 (1.3%) |
| module `RESIN_THERMAL_REFERENCE` | melt / mould / eject °C | transient-conduction law | now LE; α_eff stated as back-calculated | none at reference temps (by construction) |
| module `DRY_CYCLE_S`, `TAKE_OUT_S` | 1.5–11 s, 1 s | dry cycle by press | LE ("engineering-typical") | ECU 3.5 s (18% of cycle) |
| module `INJECTION_RATE_CM3_S` | 40–1,400 cm³/s | fill rate | LE | ECU / clip on the 1.5 s floor |
| module `IMM_PRESSES` | shot cm³, tie bar mm | press feasibility | now LE in machine basis | picks the press |
| module `SHOT_USE_MAX` | 0.8 | barrel use | LE (printed) | — |
| module `estimateClampingTonnage` sf | 1.15 | clamp safety | LE (printed) | — |
| rules `COLD_RUNNER_AREA_FACTOR` | 1.1 | runner's own area | now LE | ECU 181 t v 165 t, same press |
| rules `packSeconds` | 0.8 s/mm, 2 s floor | hold time | now LE | ECU 2 s (10% of cycle) |
| rules `fillSeconds` floor | 1.5 s | fill floor | LE | ECU / clip |
| rules `coldRunnerKgPerShot` | 15% of parts, 3 g/cavity min | runner | now LE (and "of the parts", not "of the shot") | ECU 23.9 g; waste £0.015 |
| rules `runnerChoice` | 250 g, 1M/yr, 1,500 cm²/drop | hot v cold, drops | now LE | tray hot 2-drop (tool +£13k) |
| rules regrind | 20% blend, 20% fines | runner reuse | LE (printed with arithmetic) | ECU 0.80, clip 0.56 |
| rules `mouldManning` | 0.5 ≤ 500 t, 1 above | crew | LE | ECU labour £0.072 |
| rules `MOULDING_REJECT` | 2% | scrap | LE | +2% on cycle and material |
| rules `mouldChangeHours` / `purgeKgPerChange` | 1.5 / 2.5 / 4 h; 2 / 5 / 10 kg | change, purge | LE | clip change 14% of cost (P-8) |
| `standardBatchSize` (routing-optimiser) | annual ÷ 20, 50–5,000 | batch | now LE in basis | clip as above |
| rules `MOULD_MAINTENANCE_PER_YEAR` | 3% a year | maintenance | LE (years now true) | ECU £0.025/part |
| rules `DRYING_KWH_PER_KG` | 0.15 | dryer energy | LE | ECU £0.005 |
| rules `sideActions` | 6 faces a slide, cap 6 | slides from undercut faces | now LE | ECU 2 slides ≈ £7.0k tool, £0.032/part (2.5%) |
| module `steelClassFor` | 25k / 100k / 1M shots; lives 50k / 500k / 1M / 5M | steel class, mould life | now LE (ladder printed) | see P-3 |
| module `estimateMouldCost` | hourF 0.55/1/1.12/1.2, design 30 h + 20%, slide 28 h + A/200, trials 2 + ⌈n/2⌉ (+2 > 2,000 cm²) × 8 h, n^0.9, coating £6k | build-up laws | now LE (lines printed, "anchored to one quotation") | ECU tool £35,925 |
| toolmaking.ts (not owned) | toolroom £/h, steel £/kg, bought-outs, 22% OH&P, `12 + 3.4·A^0.72` | shop model | LE in code ("UK benchmarks Jun 2026"); now named in the basis | tooling bucket 13% of ECU |
| module tolerance / finish factors | ×1.0–2.0, ×1.0–1.6 | mould uplifts | LE in schema text | not reached on the CAD path |
| optimiser `oee` / `labourEfficiency` defaults | 0.80 / 0.92 | ranking conventions | were wrong (F-3); rules now pass 0.85 / 0.95 | choice flips at 1-year amortisation (clip) |
| rate book | PA66-GF30 £3.10, 1,300 kg/m³; PP-B £1.04; press £/h | LIB | P-1, P-2 | |

## 6. Findings register

| ID | Sev | Where | Evidence | Status | £ before → after |
|---|---|---|---|---|---|
| F-1 | H | module `autoCoolFactorForMaterial` / `RESIN_THERMAL_REFERENCE`, resin.ts `CAVITY_PRESSURE_MPA` | `/pps\|ppa/` matched `mat-gpps` (crystal PS → PPS: 2.4 s/mm², 330 °C melt, 70 MPa); `/pc\|lexan/` matched `mat-pcr-pp` (recycled PP → PC: 2.5 s/mm², 300 °C), contradicting the code's own "all polypropylene incl … pcr". Swept all 435 library materials before / after: exactly `mat-gpps`, `mat-gpps-ext`, `mat-pcr-pp` change. | FIXED (`\bpps`, `\bpc\b`), test IM-1 | no real part; a GPPS part's cooling −17%, clamp −36%; a PCR-PP part's cooling +26% |
| F-2 | H | rules `mouldMaintenanceFraction` basis | printed "charged for every year of the amortisation (5 years on a 5-year programme)" whatever was typed; to-cost-params charges amortisation ÷ annual years (1 when blank). | FIXED (prints the years charged), test IM-3 | text only |
| F-3 | H | cavitation-optimiser.ts + rules `cavitationChoiceFor` | the ranking (and the £/part it prints on screen and in reports) used OEE 0.80, efficiency 0.92, the 1-up press's crew for every n and the mould without maintenance; the costing charges 0.85, 0.95, crew by press, × (1 + 3% × years). ECU printed 1-up £0.3762 v the costing's £0.3861; tray 2-up £2.4716 v £2.5575. | FIXED (rules pass the costing's conventions; `manningFor`, `toolingFactor`; candidate carries `mouldDetail`), test IM-4 | 5-year dump: no choice changes. Baseline (1-year amortisation): clip 2-up → 1-up, **£0.48 → £0.47** (0.4734) — cheaper on the costing's own terms |
| F-4 | M | rules basis strings (cavity pressure, steel ladder, mould life, runner thresholds, cold-runner %, runner area, press table, pack, slides, batch, cooling α, mould build-up) | constants that move cost ≥ 1% were not visible as estimates; three were tagged `library` though they are code tables; α_eff read as a material property though it is back-calculated from the curated factor; the mould build-up printed no lines and no calibration. | FIXED (text; sources `library` → `rule`, same UI bucket) | text only |
| F-5 | L | rules `runnerWeightKg` basis | said "15% of the n-cavity shot"; it is 15% of the parts' mass | FIXED (text) | — |
| F-6 | L | module `computeInjectionMouldingDrivers` | purge (per change, batch in good parts) was scaled by the reject uplift: gross = (part + runner + purge/batch) ÷ (1 − r) | FIXED, test IM-2 | ECU £1.27474 → £1.27468; clip £0.19238 → £0.19232; tray £4.65502 → £4.65493 |
| F-7 | L | rules `HYGROSCOPIC` | PSU, PPSU, PLA not dried — every maker's datasheet dries them (Solvay Udel / Radel, NatureWorks Ingeo) | FIXED, test IM-5 | +0.15 kWh/kg on those resins |
| F-8 | L | to-cost-params IM case | nine fallbacks (area 100, wall 3, cavities 1, 30 MPa, PP cool factor, fill 2 / pack 6 / eject 3 s, life 1M) taken silently; only the regrind was listed | FIXED (each named in `assumed`), test IM-6 | none on real parts |
| P-1 | H | rate book `mat-pa66gf30` (also `mat-pa6-gf30` 1,280) | density 1,300 kg/m³; PA66-GF30 datasheets read 1,360–1,370 (BASF Ultramid A3EG6 1.36 g/cm³; DuPont Zytel 70G30 1.37); PA6-GF30 1.35–1.36 (Ultramid B3EG6). Mass and material 4.6% low. | PROPOSED: rate refresh sets 1,360 / 1,350 with the datasheet named | ECU ≈ +£0.024 material, ≈ +£0.03 total (+2.3%); clip ≈ +£0.001 |
| P-2 | M | rate book `mat-pa66gf30` £3.10, `mat-pc-abs` £1.92 | PA66-GF30 "NOT SOURCED — held at June 2026"; PC/ABS below 2026 FR-grade distributor quotes (readiness review §4) | PROPOSED: next refresh takes a dated European distributor quote for both | — |
| P-3 | M | module `steelClassFor` | the ladder gives P20 ("standard", stated life 500k) only up to 100k shots, then pre-hard to 1M at exactly its life — margins 2× / 5× / 1× with no stated reason; SPI Class 103 allows P20 to 500,000 cycles. Not changed: for glass-filled resin a hardened tool is right whatever the shots. | PROPOSED (code below) | tray (250k shots, PP) production → standard: tool £158,885 → £144,448, **−£0.080/part (−1.7%)**; ECU unchanged (GF30) |
| P-4 | M | toolmaking.ts hour laws (not owned) | the build-up is anchored to one quotation (£420k bumper); at the small / mid end it reproduces the old parametric, not a quote. ECU 1-cavity, 2-slide tool £35.9k; the readiness review expects £80–120k for the 2-cavity in Europe. | PROPOSED: collect 2–3 toolmaker quotes for 100–500 cm² tools and recalibrate design / EDM / fitting fractions; the basis now says it is an estimate | unknown until quoted |
| P-5 | L | envelope.ts `governingWallMm` (not owned) | tray p95 2.95 mm prints as 3.0 with no p95 figure in the basis (cooling +3.4%) | PROPOSED: append `p95 ${wt.p95Mm} mm` to the ray-cast basis | text only |
| P-6 | L | resin.ts `lookup` | density read from `DEFAULT_RATE_LIBRARY`, not the active book — a company book's density would not reach the mass | PROPOSED: read `activeRates()` (also used by blow / roto / thermoforming — their auditors to agree) | none today |
| P-7 | L | module operations | "Mould change" listed after the moulding | PROPOSED: list it first (check tests that index `operations[0]`) | none |
| P-8 | L | routing-optimiser `standardBatchSize` (not owned) | batch = annual ÷ 20 is cycle-blind: the clip's 2,500-part run is 2.2 h of press against a 1.5 h change (14% of its cost) | PROPOSED: batch ≥ one shift of press time, or an EOQ | clip ≈ −£0.02 |
| P-9 | L | resin.ts | TPO has no cavity-pressure row (falls to 50; it is PP-based, 35) | PROPOSED: add `tpo` to the 35 row | none on real parts |

P-3 code (modules/injection-moulding.ts):

```ts
export function steelClassFor(shots: number, abrasive = false): { cls: MouldSteelClass; life: number } {
  if (shots <= 25_000 && !abrasive) return { cls: 'prototype', life: 50_000 };
  if (shots <= 500_000 && !abrasive) return { cls: 'standard', life: 500_000 };   // SPI Class 103: P20 under 500k cycles
  if (shots <= 1_000_000) return { cls: 'production', life: 1_000_000 };
  return { cls: 'high_volume', life: 5_000_000 };
}
// callers: abrasive = /gf\d|-gf|glass|lgf|mineral|t20|t30/.test(materialId) (the FILLED regex in resin.ts)
```

## 7. Effect on shared snapshots (for the lead)

- `tests/real-parts-baseline.test.ts`: `IM_Cable_Clip.stp` £0.48 → £0.47 (F-3: 1-up at the baseline's one-year
  amortisation). ECU and tray move < ½ p (F-6) and keep their 2-dp totals.
- `tests/fixtures/commodity-rules-prompt/*`: the injection-moulding block changes (basis text).
- Targeted suites green: moulding-review, cost-input-rules-moulding, cavitation-optimiser, programme-life,
  poland-live-review, uploaded-parts-review, rule-path-coverage, thermo-cooling, injection-audit, cad-workspace,
  material-scope-review, polymer-material-taxonomy, should-cost-audit, cad-six-parts, dfm-cost-impact, and the new
  test file (14 tests; 13 fail on the pre-fix code). Failures seen in plastics-processes (roto), phase2-commodities
  (sand casting) and route-compare-review (knuckle) come from other groups' changes, not these files.

## 8. Not checked, and why

- The screen path (`collectInjectionMouldingInput` in main.ts) beyond the shared module: parity is
  `tests/cad-workspace.test.ts`, which passes; main.ts is not owned.
- Country books: the audit ran in the UK book only; the toolroom factor and machine rates per country belong to
  the rates group.
- Whether the curated cooling factors match a moulder's real cycles: no measured cycle is on file. The PP factor
  (3.16) implies α_eff 0.054 mm²/s, below the ~0.07 a Menges-type table gives; it may be conservative by ~25%
  (unverified — no source read).
- The DFM advisor (`injection-advisor.ts`) prints no money; its thresholds are general guidance and were read for
  claims only (none states a cost the costing carries).
- Toolmaking constants in `toolmaking.ts` (owned elsewhere) beyond naming them in the basis.

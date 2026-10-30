/**
 * Arithmetic audit — composites and rubber (30 Oct 2026). One test per confirmed defect; each failed on the code
 * before the audit and passes after. docs/review/arith-audit/composites-rubber.md has the findings register and the
 * hat stiffener worked to the penny; scripts/arith-audit/composites-rubber.ts is the independent shadow model.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { COMPOSITES_RULES, NDI_STATION, partsPerCure } from '../src/engine/cost-input-rules/commodities/composites.js';
import { RUBBER_RULES } from '../src/engine/cost-input-rules/commodities/rubber.js';
import { LAMINATE_DECISION_ID } from '../src/engine/cost-input-rules/derive/laminate.js';
import { ELASTOMER_DECISION_ID } from '../src/engine/cost-input-rules/derive/elastomer.js';
import { computeCompositeDrivers, type CompositeInputs } from '../src/engine/modules/composites.js';
import { computeRubberDrivers, type RubberInputs } from '../src/engine/modules/rubber.js';
import { rubberCureBreakdown } from '../src/engine/modules/rubber-advisor.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const ctx = (part: string, commodity: string, answers: Record<string, string>): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, programmeYears: 5,
  filename: part, answers: { ...answers, 'commodity.route': commodity },
} as RuleContext);
const compRun = (part: string, sys: string) => runCostInputRules(COMPOSITES_RULES, ctx(part, 'composites', { [LAMINATE_DECISION_ID]: sys }));
const rubRun = (part: string, mat: string) => runCostInputRules(RUBBER_RULES, ctx(part, 'rubber', { [ELASTOMER_DECISION_ID]: mat }));
const STACK = { partName: 't', packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08 };

const PREPREG: CompositeInputs = {
  fibrePricePerKg: 33.6, resinPricePerKg: 0, fibreWeightFraction: 0.65, partWeightKg: 0.3028, wasteFraction: 0.15,
  process: 'prepreg_layup', areaM2: 0.081, plies: 10, layupLabourId: 'lab-uk-skilled', layupTimeHrPerPart: 0.049,
  oee: 0.8, manning: 1, labourEfficiency: 0.92, cureMachineId: 'autoclave-1200mm', cureLabourId: 'lab-uk-semiskilled',
  cureTimeHr: 3, partsPerCureCycle: 20, trimMachineId: 'waterjet-5ax-composite', trimLabourId: 'lab-uk-semiskilled',
  trimTimeHr: 0.112, ndiCostPerPart: 0, rejectRate: 0.04, toolingCost: 12_671, toolingLife: 500,
  amortizationVolume: 250_000, toolsInService: 56,
};

describe('C1 (H): prepreg is bought as fibre AND resin', () => {
  it('the whole cured laminate is bought at the prepreg price — it bought only the fibre’s 65 %', () => {
    const d = computeCompositeDrivers(PREPREG);
    const expected = 0.3028 * 33.6 / (1 - 0.15) / (1 - 0.04);
    expect(d.rawMaterial.directCost).toBeCloseTo(expected, 6);           // £12.469; was £8.105
    const line = d.rawMaterial.lines!.find(l => l.description === 'Prepreg (fibre + resin)')!;
    expect(line.qty).toBeCloseTo(0.3028 / 0.85 / 0.96, 4);               // the kg the line says it buys
    expect(line.qty * line.unitCost).toBeCloseTo(expected, 2);           // the line is the money
  });
  it('a dry-fibre + resin system still buys each at its own price', () => {
    const d = computeCompositeDrivers({ ...PREPREG, process: 'rtm', fibrePricePerKg: 3.99, resinPricePerKg: 5.46, fibreWeightFraction: 0.5 });
    expect(d.rawMaterial.directCost).toBeCloseTo((0.3028 * 0.5 * 3.99 + 0.3028 * 0.5 * 5.46) / 0.85 / 0.96, 6);
  });
});

describe('C2 (H): NDI is a scan station (time × rates), not a flat £25', () => {
  it('the hat stiffener’s C-scan is load + area ÷ scan rate at the inspector + cell rate, with the arithmetic printed', () => {
    const r = compRun('COMP_Hat_Stiffener.stp', 'prepreg-cf');
    const ndi = r.provenance['comp-ndi'];
    const area = r.provenance['comp-area'].value as number;
    const inspector = book.labour.find(l => l.id === 'lab-uk-inspector')!.fullyLoadedRatePerHr;
    const hr = NDI_STATION.loadUnloadSec / 3600 + area / NDI_STATION.scanM2PerHr;
    expect(ndi.value).toBeCloseTo(Math.round(hr * (inspector + NDI_STATION.cellGbpPerHrUk) * 100) / 100, 2);
    expect(ndi.value).not.toBe(25);
    expect(ndi.basis).toMatch(/engineering-typical/);
    expect(ndi.basis).toContain(`£${(ndi.value as number).toFixed(2)}`);
  });
  it('a glass laminate states that no scan is costed (it claimed a "visual and tap test" it did not cost)', () => {
    const r = compRun('COMP_Battery_Lid.stp', 'rtm-gf');
    expect(r.provenance['comp-ndi'].value).toBe(0);
    expect(r.provenance['comp-ndi'].basis).not.toMatch(/tap test/);
  });
});

describe('C3 (M): the tooling total is split into the set in service and its wear replacements', () => {
  it('composites: 56 in service + replacements = 500 tools; the items add to the total', () => {
    const d = computeCompositeDrivers(PREPREG);
    const items = d.tooling.items!;
    expect(items[0].gbp).toBe(56 * 12_671);
    expect(items.reduce((s, i) => s + i.gbp, 0)).toBeCloseTo(d.tooling.totalToolingCost, 6);
    expect(d.tooling.totalToolingCost).toBe(500 * 12_671);
  });
  it('rubber: one tool plus the fraction worn out', () => {
    const d = computeRubberDrivers({ materialId: 'mat-epdm', partWeightKg: 0.149, flashAndRunnerWeightKg: 0,
      process: 'extrusion_vulcanise', machineId: 'extruder-rubber-60mm', labourId: 'lab-uk-semiskilled', cycleTimeSec: 5,
      cavities: 1, oee: 0.8, manning: 2, labourEfficiency: 0.92, mouldCost: 2279, mouldLife: 200_000, amortizationVolume: 250_000 });
    expect(d.tooling.items!.map(i => i.gbp)).toEqual([2279, 2279 * 0.25]);
  });
});

describe('C4 (M): unsourced constants that move cost are labelled where the reader sees them', () => {
  it('composites bases say "not sourced" for the layup rate, cure, tool £, tool life, reject, trim and the load cap', () => {
    const p = compRun('COMP_Hat_Stiffener.stp', 'prepreg-cf').provenance;
    for (const f of ['comp-layup-time', 'comp-cure-time', 'comp-tool-cost', 'comp-tool-life', 'comp-reject', 'comp-trim-time', 'comp-cure-batch'])
      expect(p[f].basis, f).toMatch(/not sourced/);
    expect(p['comp-tool-life'].source).toBe('rule');                       // it claimed 'library' — no library holds it
    expect(p['comp-layup-time'].basis).toMatch(/6\.5 kg of laminate an hour/);
    // 24 fit the bed; the 20 cap binds and now says so
    expect(partsPerCure(0.39829, 0.12, [2.8, 1.0]).basis).toMatch(/24 fit; capped at 20/);
  });
  it('rubber bases say "not sourced" for the cure, crew, flash, mould £, mould life, reject, deflash and set-up', () => {
    const p = rubRun('RUB_Grommet.stp', 'mat-epdm').provenance;
    for (const f of ['rub-cycle-sec', 'rub-manning', 'rub-flash-wt', 'rub-mould-cost', 'rub-mould-life', 'rub-reject', 'rub-deflash-sec', 'rub-setup-hr', 'rub-cavities'])
      expect(p[f].basis, f).toMatch(/not sourced/);
  });
});

describe('R1 (H): the in-line cure tunnel does not charge the extrusion crew a second time', () => {
  const seal: RubberInputs = { materialId: 'mat-epdm', partWeightKg: 0.149, flashAndRunnerWeightKg: 0,
    process: 'extrusion_vulcanise', machineId: 'extruder-rubber-60mm', labourId: 'lab-uk-semiskilled', cycleTimeSec: 5,
    cavities: 1, oee: 0.8, manning: 2, labourEfficiency: 0.92, rejectRate: 0.03, mouldCost: 2279, mouldLife: 200_000,
    amortizationVolume: 250_000, cureOvenMachineId: 'cure-oven-rubber', cureTimeSec: 5 };
  it('the tunnel carries machine time and no labour; the line crew is charged once', () => {
    const d = computeRubberDrivers(seal);
    const cure = d.operations.find(o => o.operationName === 'Vulcanisation Cure')!;
    expect(cure.labourTimeHr).toBe(0);
    expect(cure.untended).toBe(true);
    const r = computeUniversalStack({ ...STACK, ...d }, book);
    const crew = book.labour.find(l => l.id === 'lab-uk-semiskilled')!.fullyLoadedRatePerHr;
    expect(r.breakdown.labour).toBeCloseTo(crew * 2 * (5 / 3600 / 0.97) / 0.92, 6);   // the extruder op only
  });
  it('a moulding’s cure oven (not in line) still has its own labour', () => {
    const d = computeRubberDrivers({ ...seal, process: 'compression_mould', machineId: 'compression-mould-std', manning: 0.5 });
    expect(d.operations.find(o => o.operationName === 'Vulcanisation Cure')!.labourTimeHr).toBeGreaterThan(0);
  });
});

describe('R2 (M): the cure-cycle basis prints the arithmetic the cycle carries', () => {
  it('base × temperature factor + heat term + handling = the value', () => {
    const r = rubRun('RUB_Grommet.stp', 'mat-epdm');
    const b = r.provenance['rub-cycle-sec'];
    expect(b.basis).toMatch(/plus 25 s transfer mould handling = 307 s/);   // the 25 s used to be silent: 180 + 102 ≠ 307
    const parts = rubberCureBreakdown({ compoundFamily: 'epdm-sulphur', thicknessMm: 6.4, process: 'transfer_mould' });
    expect(Math.round(parts.baseSec * parts.tempFactor + parts.heatSec + parts.handlingSec)).toBe(b.value);
  });
  it('a compound cured above 170 °C prints its temperature factor (it printed the 170 °C base as if used)', () => {
    const b = rubRun('RUB_Grommet.stp', 'mat-silicone-hcr').provenance['rub-cycle-sec'];
    expect(b).toBeDefined();
    expect(b.basis).toMatch(/× 2\^\(\(170 − 175\) \/ 10\) = 64 s at 175 °C/);
  });
});

describe('R3 (L): extrusion texts describe a die, not a mould', () => {
  it('the door seal’s tool life and steel bases speak of the extrusion die; the change op is a die change', () => {
    const p = rubRun('RUB_Door_Seal.stp', 'mat-epdm').provenance;
    expect(p['rub-mould-life'].basis).toMatch(/extrusion die/);
    expect(p['rub-mould-life'].basis).not.toMatch(/injection pressure/);
    expect(p['rub-mold-steel'].basis).not.toMatch(/mould pressure/);
    const d = computeRubberDrivers({ materialId: 'mat-epdm', partWeightKg: 0.149, flashAndRunnerWeightKg: 0,
      process: 'extrusion_vulcanise', machineId: 'extruder-rubber-60mm', labourId: 'lab-uk-semiskilled', cycleTimeSec: 5,
      cavities: 1, oee: 0.8, manning: 2, labourEfficiency: 0.92, mouldCost: 2279, mouldLife: 200_000, amortizationVolume: 250_000,
      setup: { hoursPerChange: 1, batchSize: 2500 } });
    expect(d.operations.at(-1)!.operationName).toMatch(/^Die change/);
  });
});

/**
 * Arithmetic audit — spec-driven commodities (30 Oct 2026; docs/review/arith-audit/spec-commodities.md).
 * Each block pins one confirmed defect: it failed before the fix and passes after. The full independent shadow of every
 * form default and demo preset is scripts/arith-audit/spec-commodities.ts.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { withRates } from '../src/engine/rate-context.js';
import { computeUniversalStack } from '../src/engine/core.js';
import type { CommodityDrivers, UniversalStackInput } from '../src/engine/types.js';
import { computeWiringHarnessDrivers, harnessCrimpCheck, type WiringHarnessInputs } from '../src/engine/modules/wiring-harness.js';
import { computeBIWDrivers, type BIWAssemblyInputs } from '../src/engine/modules/biw-assembly.js';
import { computePaintingDrivers, analysePainting, type PaintingInputs } from '../src/engine/modules/painting.js';
import { computeBatteryPackDrivers, type BatteryPackInputs } from '../src/engine/modules/battery-pack.js';
import { computeEMotorDrivers, eMotorFacts, type EMotorInputs } from '../src/engine/modules/e-motor.js';
import { computeSurfaceFinishing, coatingMachineFor, FINISH_LINE_DEFAULTS } from '../src/engine/modules/surface-finishing.js';
import { finishLoading, finishSpec } from '../src/engine/surface-finish-routes.js';
import { SURFACE_STAGES } from '../src/engine/surface-treatment-data.js';
import { estimateLaminationFinishing, LAMINATION_COATING_GBP_PER_KG } from '../src/engine/modules/lamination-advisor.js';
import { countryFactor } from '../src/engine/regional-services.js';

const LIB = DEFAULT_RATE_LIBRARY;
const TAIL = { partName: 'x', packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08 };
const cost = (d: CommodityDrivers) => computeUniversalStack({ ...TAIL, ...d } as UniversalStackInput, LIB);
const linesSum = (d: CommodityDrivers) => (d.rawMaterial.lines ?? []).reduce((t, l) => t + l.qty * l.unitCost, 0);

// ─── The form defaults (main.ts / ev-forms.ts) ───────────────────────────────────────────────────────────────────
const HARNESS: WiringHarnessInputs = {
  wires: [{ crossSectionMm2: 0.5, lengthM: 3.2, pricePerM: 0.10 }, { crossSectionMm2: 1.5, lengthM: 1.4, pricePerM: 0.18 }, { crossSectionMm2: 4, lengthM: 0.6, pricePerM: 0.40 }],
  connectors: [{ count: 4, costEach: 1.20, circuitsPerConnector: 6, terminationTimeSec: 10 }, { count: 2, costEach: 2.80, circuitsPerConnector: 12, terminationTimeSec: 10 }],
  spliceCount: 6, spliceCostEach: 0.08, conduitLengthM: 2, conduitCostPerM: 0.35, tapeMetres: 5, tapeCostPerM: 0.12,
  labourId: 'lab-uk-semiskilled', assemblyTimeHr: 0.45, oee: 0.85, manning: 1, labourEfficiency: 0.90,
  testMachineId: 'harness-test-sys', testLabourId: 'lab-uk-skilled', testTimeHr: 0.05, rejectRate: 0.02,
  boardingBoardCost: 800, boardingBoardLife: 20000, amortizationVolume: 10000,
};
const BIW: BIWAssemblyInputs = {
  subPartTotalCost: 45, joining: [{ type: 'spot_weld', count: 120, costPerJoint: 0.05 }, { type: 'adhesive_m', count: 0.8, costPerJoint: 1.20 }],
  stations: [{ stationName: 'Framing Station', machineId: 'robot-weld-station', labourId: 'lab-uk-skilled', cycleTimeHr: 1 / 60, oee: 0.85, manning: 1, labourEfficiency: 0.92 }],
  fixturingToolingCost: 200000, amortizationVolume: 50000,
};
const PAINT: PaintingInputs = {
  surfaceAreaM2: 0.8, lineId: 'paint-line-std', labourId: 'lab-uk-skilled', lineRatePartsPerHr: 60, oee: 0.85, manning: 4,
  labourEfficiency: 0.95, rejectReworkPct: 0.03, toolingCost: 5000, amortizationVolume: 100000,
  coats: [
    { coatType: 'e_coat', materialId: 'mat-paint-ecoat', dftMicrons: 20, solidsPct: 0.20, transferEfficiency: 0.95, paintDensityKgPerL: 1.3, pricePerL: 4.55 },
    { coatType: 'basecoat', materialId: 'mat-paint-basecoat', dftMicrons: 15, solidsPct: 0.35, transferEfficiency: 0.70, paintDensityKgPerL: 1.25, pricePerL: 10.25 },
  ],
  stages: ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'dry_off', 'flash_off', 'cure_oven'], partsPerRack: 6, racksPerHour: 20, region: 'UK',
};
const PACK: BatteryPackInputs = { chemistry: 'NMC', cellFormat: 'prismatic', cellCapacityAh: 140, seriesCount: 192, parallelCount: 1,
  architecture: 'module', cellsPerModule: 24, cellHandlingPct: 0.03, packLengthMm: 2000, packWidthMm: 1400, enclosure: 'aluminium',
  cmuChannels: 16, mainContactors: 2, pyrofuse: true, labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician',
  oee: 0.85, labourEfficiency: 0.9, rejectRate: 0.01, amortizationVolume: 300000 };
const MOTOR: EMotorInputs = { motorType: 'pmsm', statorOdMm: 220, statorIdMm: 150, stackLengthMm: 150, slots: 48, airgapMm: 0.8, shaftDiaMm: 45,
  laminationThicknessMm: 0.27, laminationMaterialId: 'mat-no27-27a', statorSteelFraction: 0.6, winding: 'hairpin', conductorMaterialId: 'mat-cu-hairpin',
  hairpinLayers: 6, magnetGrade: '45UH_GBD', magnetMassKg: 1.5, labourId: 'lab-uk-semiskilled', testLabourId: 'lab-uk-technician',
  oee: 0.85, labourEfficiency: 0.9, rejectRate: 0.01, amortizationVolume: 300000 };

describe('A — wiring harness', () => {
  it('A1: the material bucket is itemised (wire by gauge, connectors, splices, conduit, tape, reject) and adds up to the penny', () => {
    const d = computeWiringHarnessDrivers(HARNESS);
    const r = cost(d);
    expect(d.rawMaterial.lines!.map(l => l.ref)).toEqual(['W1', 'W2', 'W3', 'X1', 'X2', 'SPL', 'CND', 'TAPE', 'REJ']);
    expect(linesSum(d)).toBeCloseTo(r.breakdown.rawMaterial, 6);
    // by hand: (0.32 + 0.252 + 0.24 + 4.8 + 5.6 + 0.48 + 0.70 + 0.60) ÷ 0.98 = 12.992 ÷ 0.98
    expect(r.breakdown.rawMaterial).toBeCloseTo(12.992 / 0.98, 6);
  });
  it('A2: the per-terminal crimp time is a cross-check on the typed assembly time, said so when it does not fit', () => {
    expect(harnessCrimpCheck(HARNESS)).toBeNull();                        // 48 × 10 s = 480 s < 1,620 s
    expect(harnessCrimpCheck({ ...HARNESS, assemblyTimeHr: 0.1 })).toMatch(/480 s, more than the 360 s/);
  });
  it('the boarding boards are itemised on the tooling', () => {
    const d = computeWiringHarnessDrivers(HARNESS);
    expect(d.tooling.items![0].gbp).toBe(d.tooling.totalToolingCost);
  });
});

describe('B — BIW assembly', () => {
  it('B1: sub-parts (bought in) and each joint type itemised; the lines add up to the material bucket; the handling basis is stated', () => {
    const d = computeBIWDrivers(BIW);
    const r = cost(d);
    expect(linesSum(d)).toBeCloseTo(r.breakdown.rawMaterial, 6);
    expect(r.breakdown.rawMaterial).toBeCloseTo(45 + 120 * 0.05 + 0.8 * 1.20, 6);
    expect(d.rawMaterial.lines![0].note).toMatch(/3\.0 %.*engineering-typical/);
  });
});

describe('P — painting', () => {
  it('P3: each coat\'s wet litres, the bath consumables and the rework are itemised and add up to the material bucket', () => {
    const d = computePaintingDrivers(PAINT);
    const r = cost(d);
    expect(linesSum(d)).toBeCloseTo(r.breakdown.rawMaterial, 6);
    // e-coat: 0.8 m² × 20 µm ÷ (0.20 × 0.95) = 0.084211 L
    expect(d.rawMaterial.lines![0].qty).toBeCloseTo(0.8 * 20e-6 / (0.20 * 0.95) * 1000, 9);
  });
  it('the legacy-path warning no longer states a 55 % move as this part\'s own', () => {
    const w = analysePainting({ ...PAINT, stages: undefined }).warnings.join(' ');
    expect(w).toMatch(/on the reference part it was measured on/);
    expect(w).not.toMatch(/halving it moves the part 55%/);
  });
});

describe('E — battery pack and e-motor', () => {
  it('E1: with the form\'s 1 % reject the lines add up to the material bucket (the reject allowance is a line)', () => {
    for (const d of [computeBatteryPackDrivers(PACK), computeEMotorDrivers(MOTOR)]) {
      const r = cost(d);
      expect(linesSum(d)).toBeCloseTo(r.breakdown.rawMaterial, 6);
      expect(d.rawMaterial.lines!.some(l => l.ref === 'REJ')).toBe(true);
    }
  });
  it('E3: the CELLS line is the bought-in cost to the penny (no 4 dp unit rounding)', () => {
    const d = computeBatteryPackDrivers({ ...PACK, rejectRate: 0 });
    const cells = d.rawMaterial.lines!.find(l => l.ref === 'CELLS')!;
    expect(cells.qty * cells.unitCost).toBeCloseTo(d.rawMaterial.boughtIn!.cost, 9);
  });
  it('E2: the housing mass is at the density of the alloy it is priced as (A380 2,680 kg/m³, not a 2,700 literal)', () => {
    const rho = LIB.materials.find(m => m.id === 'mat-a380')!.densityKgPerM3;
    const byHand = Math.PI * 0.226 * (0.15 * 1.5 + 0.08) * 0.006 * rho * 1.6;
    expect(eMotorFacts(MOTOR).housingKg).toBeCloseTo(byHand, 4);
  });
  it('E4 / E5: every line time names its figures and says ESTIMATE; every material line carries its provenance', () => {
    for (const d of [computeBatteryPackDrivers(PACK), computeEMotorDrivers(MOTOR)]) {
      for (const o of d.operations) expect(o.operationName).toMatch(/crew [\d.]+ — ESTIMATE$/);
      for (const l of d.rawMaterial.lines!) if (!['CELLS', 'REJ'].includes(l.ref)) expect(l.note, l.ref).toBeTruthy();
    }
    const lam = computeEMotorDrivers(MOTOR).rawMaterial.lines!.find(l => l.ref === 'LAM')!;
    expect(lam.description).toMatch(/534 = 150 mm × 0\.96 stacking ÷ 0\.27 mm/);
  });
});

describe('F — surface finishing', () => {
  const area = 0.0628, mass = 2.512;
  const run = (route: string, ppr = 6, racks = 20) => computeSurfaceFinishing({
    ...finishSpec({ route, productForm: 'cast_hpdc', measuredAreaM2: area, partsPerRack: ppr, racksPerHour: racks, annualVolume: 50_000, region: 'UK' })!,
    massKg: mass, labourId: 'lab-uk-semiskilled' });
  it('F1: adding a blast and an impregnation stage in front of the e-coat line does not shorten the e-coat line\'s time a part', () => {
    const plain = run('e_coat').operations.find(o => o.machineId === 'paint-line-std')!;
    const cast = run('cast_ecoat').operations.find(o => o.machineId === 'paint-line-std')!;
    expect(cast.cycleTimeHr).toBeCloseTo(plain.cycleTimeHr, 12);
    expect(plain.cycleTimeHr).toBeCloseTo(1 / (6 * 20), 12);                  // one line takt a part
  });
  it('F1: a batch cell in front of the line holds one load of the line\'s parts for its own dwell', () => {
    const ops = run('cast_ecoat').operations;
    expect(ops.find(o => o.machineId === 'blast-machine')!.cycleTimeHr).toBeCloseTo(SURFACE_STAGES.shot_blast.dwellMinutes.value / 60 / 6, 12);
    expect(ops.find(o => o.machineId === 'impregnation-plant')!.cycleTimeHr).toBeCloseTo(SURFACE_STAGES.impregnation.dwellMinutes.value / 60 / 6, 12);
  });
  it('F2: a galvanise route\'s pre-treatment runs in the galvanising plant, not on a paint line', () => {
    const r = run('galvanise');
    expect(r.operations.map(o => o.machineId)).toEqual(['galvanising-kettle']);
    expect(r.operations[0].cycleTimeHr).toBeCloseTo(1 / (6 * 20), 12);
  });
  it('F4: the line OEE, labour efficiency and crew defaults are on the basis, labelled', () => {
    const b = run('e_coat').basis;
    expect(b).toContain(`Line OEE ${FINISH_LINE_DEFAULTS.oee} and labour efficiency ${FINISH_LINE_DEFAULTS.labourEfficiency} (engineering-typical defaults, not sourced)`);
    expect(b).toMatch(/2 operators a line \(loader \+ unloader — representative/);
  });
  it('F5: a typed plating reject is warned about and the warning says it is NOT in the cost', () => {
    const r = computeSurfaceFinishing({ stages: ['degrease', 'zinc_plate'], measuredAreaM2: 0.05, massKg: 0.3, labourId: 'lab-uk-semiskilled', platingRejectPct: 0.03 });
    expect(r.warnings.join(' ')).toMatch(/NOT in the\s+cost above/);
  });
  it('F6: a powder or zinc-flake route says it runs on the paint line\'s rate as a proxy; the loading says whose capacity it is', () => {
    expect(coatingMachineFor([SURFACE_STAGES.zinc_flake]).name).toMatch(/proxy/);
    expect(coatingMachineFor([SURFACE_STAGES.powder_coat]).name).toMatch(/proxy/);
    expect(coatingMachineFor([SURFACE_STAGES.e_coat]).name).toBe('Paint Line');
    expect(finishLoading('galvanise', 0.09, 0.56)!.basis).toMatch(/proxy/);
    expect(finishLoading('e_coat', 0.09, 0.56)!.basis).not.toMatch(/proxy/);
  });
});

describe('L — lamination advisor', () => {
  const inp = { stackMethod: 'interlock' as const, laminationCount: 200, partWeightKg: 0.05, reCoat: true, stressReliefAnneal: true, annealEnergyPricePerKwh: 0.182 };
  it('L1: the insulation re-coat is priced in the costed country (it was a bare UK £)', () => {
    const IN = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'IN');
    const inCoat = withRates(IN, () => estimateLaminationFinishing(inp).coatingPerPart);
    const f = withRates(IN, () => countryFactor('process'));
    expect(f).toBeLessThan(1);
    expect(inCoat).toBeCloseTo(Math.round(LAMINATION_COATING_GBP_PER_KG * f * 10_000) / 10_000 * 0.05, 3);
  });
  it('L2: the result carries its arithmetic and says the figures are engineering-typical', () => {
    const b = estimateLaminationFinishing(inp).basis;
    expect(b).toMatch(/join interlock: UK £0\.02 \+ 200 laminations × £0\.0008/);
    expect(b).toMatch(/anneal 0\.45 kWh\/kg × 0\.05 kg × £0\.182\/kWh/);
    expect(b).toMatch(/not sourced/);
  });
});

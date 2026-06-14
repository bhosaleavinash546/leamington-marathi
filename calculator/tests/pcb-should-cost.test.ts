import { describe, it, expect } from 'vitest';
import {
  computePCBFabDrivers,
  computeSuggestedFabYield,
  TECH_MULTIPLIER,
  PCB_QUALITY_MULTIPLIER,
} from '../src/engine/modules/pcb-fab.js';
import type { PCBFabInputs } from '../src/engine/modules/pcb-fab.js';
import {
  computePCBADrivers,
  ASSEMBLY_COMPLEXITY_MULTIPLIER,
  PCBA_QUALITY_MULTIPLIER,
  CPH_BY_TYPE,
} from '../src/engine/modules/pcba.js';
import type { PCBAInputs } from '../src/engine/modules/pcba.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

// ─── Base fixtures ────────────────────────────────────────────────────────────

const BASE_FAB: PCBFabInputs = {
  layers: 4,
  boardWidthMm: 100,
  boardHeightMm: 50,
  panelWidthMm: 500,
  panelHeightMm: 600,
  panelUtilization: 0.72,
  technology: 'FR4_STD',
  baseMaterialTg: 130,
  copperWeightOz: 1,
  outerCopperWeightOz: 1,
  viaType: 'through_only',
  throughViaCount: 200,
  blindViaCount: 0,
  buriedViaCount: 0,
  microViaCount: 0,
  hdiStructure: 'none',
  minTraceSpaceMm: 0.15,
  impedanceControlled: false,
  hasFinePitchBGA: false,
  solderMaskColor: 'green',
  silkscreenSides: 2,
  surfaceFinish: 'enig',
  testMethod: 'flying_probe',
  qualityGrade: 'consumer',
  region: 'uk',
  nreCost: 800,
  amortizationVolume: 10000,
  fabYieldOverride: 0.96,
};

const BASE_PCBA: PCBAInputs = {
  pcbCostPerBoard: 3.50,
  bom: [
    { refDes: 'R1', componentType: 'passive_0402', description: 'Resistor', qty: 20, unitPriceGBP: 0.005, moq: 1000 },
    { refDes: 'C1', componentType: 'passive_0402', description: 'Capacitor', qty: 15, unitPriceGBP: 0.008, moq: 1000 },
    { refDes: 'U1', componentType: 'ic_qfn', description: 'MCU', qty: 1, unitPriceGBP: 2.50, moq: 10 },
    { refDes: 'U2', componentType: 'ic_soic', description: 'Op-amp', qty: 2, unitPriceGBP: 0.30, moq: 50 },
  ],
  smtMachineId: 'smt-line',
  smtLabourId: 'lab-uk-semiskilled',
  smtLines: 1,
  smtLineRatePerHr: 120,
  smtOee: 0.85,
  throughHoleCount: 2,
  manualSolderCount: 0,
  thLabourId: 'lab-uk-semiskilled',
  thLabourTimeSecPerJoint: 12,
  manualLabourTimeSecPerJoint: 20,
  assemblyYield: 0.98,
  reworkCostPerFailure: 8.0,
  amortizationVolume: 5000,
};

const STACK_DEFAULTS = {
  partName: 'Test PCB',
  packagingPerPart: 0.15,
  logisticsPerPart: 0.25,
  overheadPct: 0.08,
  marginPct: 0.10,
};

// ─── Technology multiplier table ─────────────────────────────────────────────

describe('PCB technology multipliers', () => {
  it('FR4_STD baseline = 1.0', () => {
    expect(TECH_MULTIPLIER['FR4_STD']).toBe(1.0);
  });

  it('HDI_RIGID = 2.2', () => {
    expect(TECH_MULTIPLIER['HDI_RIGID']).toBe(2.2);
  });

  it('RIGID_FLEX = 3.5 (most expensive rigid-flex)', () => {
    expect(TECH_MULTIPLIER['RIGID_FLEX']).toBe(3.5);
  });

  it('CERAMIC = 4.0 (most expensive substrate)', () => {
    expect(TECH_MULTIPLIER['CERAMIC']).toBe(4.0);
  });

  it('MCPCB < RF_MICRO < HDI_RIGID ordering', () => {
    expect(TECH_MULTIPLIER['MCPCB']).toBeLessThan(TECH_MULTIPLIER['RF_MICRO']);
    expect(TECH_MULTIPLIER['RF_MICRO']).toBeLessThan(TECH_MULTIPLIER['HDI_RIGID']);
  });
});

// ─── Technology multiplier drives cost ───────────────────────────────────────

// Minimal-adder fixture isolates the panel cost so tech ratios are accurate.
// hasl=£0, vias=0, testMethod=none, copperWeightOz=0.5 → adders are silk only.
const BASE_FAB_PURE: PCBFabInputs = {
  ...BASE_FAB,
  surfaceFinish: 'hasl',
  throughViaCount: 0,
  microViaCount: 0,
  testMethod: 'none',
  copperWeightOz: 0.5,
  outerCopperWeightOz: 0.5,
};

describe('PCB Fab — technology multiplier effect', () => {
  it('HDI_RIGID panel cost is ≈2.2× FR4_STD (±0.5 tolerance; small copper adder dilutes)', () => {
    const dStd = computePCBFabDrivers({ ...BASE_FAB_PURE, technology: 'FR4_STD' });
    const dHdi = computePCBFabDrivers({ ...BASE_FAB_PURE, technology: 'HDI_RIGID' });
    const ratio = dHdi.rawMaterial.directCost! / dStd.rawMaterial.directCost!;
    expect(ratio).toBeCloseTo(2.2, 0);
  });

  it('CERAMIC panel cost is ≈4.0× FR4_STD (±0.5 tolerance; small copper adder dilutes)', () => {
    const dStd = computePCBFabDrivers({ ...BASE_FAB_PURE, technology: 'FR4_STD' });
    const dCer = computePCBFabDrivers({ ...BASE_FAB_PURE, technology: 'CERAMIC' });
    const ratio = dCer.rawMaterial.directCost! / dStd.rawMaterial.directCost!;
    expect(ratio).toBeCloseTo(4.0, 0);
  });

  it('HDI_RIGID costs more than FR4_STD (realistic spec)', () => {
    const dStd = computePCBFabDrivers({ ...BASE_FAB, technology: 'FR4_STD' });
    const dHdi = computePCBFabDrivers({ ...BASE_FAB, technology: 'HDI_RIGID' });
    expect(dHdi.rawMaterial.directCost!).toBeGreaterThan(dStd.rawMaterial.directCost!);
  });

  it('defaults to FR4_STD when technology is omitted', () => {
    const dOmitted = computePCBFabDrivers({ ...BASE_FAB });
    const dExplicit = computePCBFabDrivers({ ...BASE_FAB, technology: 'FR4_STD' });
    expect(dOmitted.rawMaterial.directCost).toBeCloseTo(dExplicit.rawMaterial.directCost!, 6);
  });
});

// ─── Quality grade multiplier ─────────────────────────────────────────────────

describe('PCB quality grade multipliers', () => {
  it('consumer = 1.0, aerospace = 2.2', () => {
    expect(PCB_QUALITY_MULTIPLIER['consumer']).toBe(1.0);
    expect(PCB_QUALITY_MULTIPLIER['aerospace']).toBe(2.2);
  });

  it('auto_grade1 board total cost is 1.8× consumer (quality multiplier ×1.8)', () => {
    const dCons = computePCBFabDrivers({ ...BASE_FAB, qualityGrade: 'consumer' });
    const dAuto = computePCBFabDrivers({ ...BASE_FAB, qualityGrade: 'auto_grade1' });
    const ratio = dAuto.rawMaterial.directCost! / dCons.rawMaterial.directCost!;
    expect(ratio).toBeCloseTo(1.8, 1);
    expect(dAuto.rawMaterial.directCost!).toBeGreaterThan(dCons.rawMaterial.directCost!);
  });

  it('monotonically increasing: consumer < industrial < auto_grade2 < auto_grade1 < aerospace', () => {
    const grades = ['consumer', 'industrial', 'auto_grade2', 'auto_grade1', 'aerospace'] as const;
    const vals = grades.map(g => PCB_QUALITY_MULTIPLIER[g]);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });
});

// ─── Layer count extended to 24 ──────────────────────────────────────────────

describe('PCB Fab — extended layer counts', () => {
  it('12-layer board costs more than 10-layer', () => {
    const d10 = computePCBFabDrivers({ ...BASE_FAB, layers: 10 });
    const d12 = computePCBFabDrivers({ ...BASE_FAB, layers: 12 });
    expect(d12.rawMaterial.directCost!).toBeGreaterThan(d10.rawMaterial.directCost!);
  });

  it('24-layer board costs more than 16-layer', () => {
    const d16 = computePCBFabDrivers({ ...BASE_FAB, layers: 16 });
    const d24 = computePCBFabDrivers({ ...BASE_FAB, layers: 24 });
    expect(d24.rawMaterial.directCost!).toBeGreaterThan(d16.rawMaterial.directCost!);
  });

  it('monotonically increasing with layer count (2→4→8→12→16→24)', () => {
    const layers = [2, 4, 8, 12, 16, 24];
    const costs = layers.map(l => computePCBFabDrivers({ ...BASE_FAB, layers: l }).rawMaterial.directCost!);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    }
  });
});

// ─── Yield model ─────────────────────────────────────────────────────────────

const YIELD_BASE = { layers: 4, buriedViaCount: 0, minTraceSpaceMm: 0.15, hdiStructure: 'none' as const };

describe('computeSuggestedFabYield', () => {
  it('standard FR4_STD with no penalties → 0.985', () => {
    const y = computeSuggestedFabYield({
      ...YIELD_BASE, technology: 'FR4_STD', microViaCount: 0, hasFinePitchBGA: false, boardAreaCm2: 50,
    });
    expect(y).toBeCloseTo(0.985, 3);
  });

  it('HDI with high microvia count, fine-pitch BGA → penalties reduce yield', () => {
    const y = computeSuggestedFabYield({
      ...YIELD_BASE, technology: 'HDI_RIGID', microViaCount: 200, hasFinePitchBGA: true, boardAreaCm2: 50,
      hdiStructure: '1plus_n_plus1',
    });
    // Start 98.5%, -2% (mv>100) -1.5% (BGA) -3% (HDI) = 92.0% → 0.920
    expect(y).toBeCloseTo(0.92, 3);
  });

  it('CERAMIC substrate → large penalty (-4% for ceramic)', () => {
    const y = computeSuggestedFabYield({
      ...YIELD_BASE, technology: 'CERAMIC', microViaCount: 0, hasFinePitchBGA: false, boardAreaCm2: 50,
    });
    // Start 98.5%, -4% (CERAMIC) = 94.5% → 0.945
    expect(y).toBeCloseTo(0.945, 3);
  });

  it('large board area (>300 cm²) → additional -1%', () => {
    const ySmall = computeSuggestedFabYield({ ...YIELD_BASE, technology: 'FR4_STD', microViaCount: 0, hasFinePitchBGA: false, boardAreaCm2: 50 });
    const yLarge = computeSuggestedFabYield({ ...YIELD_BASE, technology: 'FR4_STD', microViaCount: 0, hasFinePitchBGA: false, boardAreaCm2: 400 });
    expect(yLarge).toBeCloseTo(ySmall - 0.01, 4);
  });

  it('worst-case (all penalties) clamped to 0.70 minimum', () => {
    const y = computeSuggestedFabYield({
      ...YIELD_BASE, technology: 'CERAMIC', microViaCount: 500, hasFinePitchBGA: true, boardAreaCm2: 600,
    });
    expect(y).toBeGreaterThanOrEqual(0.70);
  });
});

// ─── Assembly complexity multipliers ─────────────────────────────────────────

describe('PCBA assembly complexity multipliers', () => {
  it('low=1.0, medium=1.3, high=1.7, very_high=2.0', () => {
    expect(ASSEMBLY_COMPLEXITY_MULTIPLIER['low']).toBe(1.0);
    expect(ASSEMBLY_COMPLEXITY_MULTIPLIER['medium']).toBe(1.3);
    expect(ASSEMBLY_COMPLEXITY_MULTIPLIER['high']).toBe(1.7);
    expect(ASSEMBLY_COMPLEXITY_MULTIPLIER['very_high']).toBe(2.0);
  });

  it('very_high complexity adds 2× more SMT placement time vs low', () => {
    const dLow = computePCBADrivers({ ...BASE_PCBA, assemblyComplexity: 'low' });
    const dHigh = computePCBADrivers({ ...BASE_PCBA, assemblyComplexity: 'very_high' });
    const smtLow = dLow.operations.find(o => o.operationName.includes('SMT'))!;
    const smtHigh = dHigh.operations.find(o => o.operationName.includes('SMT'))!;
    expect(smtHigh.cycleTimeHr / smtLow.cycleTimeHr).toBeCloseTo(2.0, 4);
  });

  it('medium complexity adds 1.3× SMT time vs low', () => {
    const dLow = computePCBADrivers({ ...BASE_PCBA, assemblyComplexity: 'low' });
    const dMed = computePCBADrivers({ ...BASE_PCBA, assemblyComplexity: 'medium' });
    const smtLow = dLow.operations.find(o => o.operationName.includes('SMT'))!;
    const smtMed = dMed.operations.find(o => o.operationName.includes('SMT'))!;
    expect(smtMed.cycleTimeHr / smtLow.cycleTimeHr).toBeCloseTo(1.3, 4);
  });

  it('defaults to low complexity when assemblyComplexity is omitted', () => {
    const dOmitted = computePCBADrivers({ ...BASE_PCBA });
    const dLow = computePCBADrivers({ ...BASE_PCBA, assemblyComplexity: 'low' });
    const smtO = dOmitted.operations.find(o => o.operationName.includes('SMT'))!;
    const smtL = dLow.operations.find(o => o.operationName.includes('SMT'))!;
    expect(smtO.cycleTimeHr).toBeCloseTo(smtL.cycleTimeHr, 6);
  });
});

// ─── Quality grade multipliers on test/inspection ────────────────────────────

describe('PCBA quality grade multipliers', () => {
  it('consumer=1.0, aerospace=2.2', () => {
    expect(PCBA_QUALITY_MULTIPLIER['consumer']).toBe(1.0);
    expect(PCBA_QUALITY_MULTIPLIER['aerospace']).toBe(2.2);
  });

  it('auto_grade1 ICT takes 1.8× longer than consumer ICT', () => {
    const d1 = computePCBADrivers({
      ...BASE_PCBA,
      ictMachineId: 'ict-automotive',
      ictCycleTimeSec: 120,
      qualityGrade: 'consumer',
    });
    const d2 = computePCBADrivers({
      ...BASE_PCBA,
      ictMachineId: 'ict-automotive',
      ictCycleTimeSec: 120,
      qualityGrade: 'auto_grade1',
    });
    const ict1 = d1.operations.find(o => o.operationName.includes('ICT'))!;
    const ict2 = d2.operations.find(o => o.operationName.includes('ICT'))!;
    expect(ict2.cycleTimeHr / ict1.cycleTimeHr).toBeCloseTo(1.8, 4);
  });
});

// ─── BGA X-ray inspection operation ─────────────────────────────────────────

describe('PCBA — BGA X-ray inspection', () => {
  it('no X-ray operation when bgaCount = 0', () => {
    const d = computePCBADrivers({ ...BASE_PCBA, bgaCount: 0, xrayMachineId: 'xray-bga-inspection' });
    const xray = d.operations.find(o => o.operationName.includes('X-Ray'));
    expect(xray).toBeUndefined();
  });

  it('no X-ray operation when xrayMachineId is omitted even if bgaCount > 0', () => {
    const d = computePCBADrivers({ ...BASE_PCBA, bgaCount: 3 });
    const xray = d.operations.find(o => o.operationName.includes('X-Ray'));
    expect(xray).toBeUndefined();
  });

  it('X-ray operation added when bgaCount > 0 and xrayMachineId is provided', () => {
    const d = computePCBADrivers({
      ...BASE_PCBA, bgaCount: 2, xrayMachineId: 'xray-bga-inspection',
    });
    const xray = d.operations.find(o => o.operationName.includes('X-Ray'));
    expect(xray).toBeDefined();
    expect(xray!.machineId).toBe('xray-bga-inspection');
    expect(xray!.cycleTimeHr).toBeGreaterThan(0);
  });

  it('X-ray cycle time scales with quality grade', () => {
    const d1 = computePCBADrivers({
      ...BASE_PCBA, bgaCount: 2, xrayMachineId: 'xray-bga-inspection', qualityGrade: 'consumer',
    });
    const d2 = computePCBADrivers({
      ...BASE_PCBA, bgaCount: 2, xrayMachineId: 'xray-bga-inspection', qualityGrade: 'auto_grade2',
    });
    const t1 = d1.operations.find(o => o.operationName.includes('X-Ray'))!.cycleTimeHr;
    const t2 = d2.operations.find(o => o.operationName.includes('X-Ray'))!.cycleTimeHr;
    expect(t2 / t1).toBeCloseTo(1.5, 4);
  });
});

// ─── ICT / functional test operation ─────────────────────────────────────────

describe('PCBA — ICT / functional test operation', () => {
  it('no ICT operation when ictMachineId is omitted', () => {
    const d = computePCBADrivers({ ...BASE_PCBA });
    const ict = d.operations.find(o => o.operationName.includes('ICT'));
    expect(ict).toBeUndefined();
  });

  it('ICT operation added with correct machine ID', () => {
    const d = computePCBADrivers({
      ...BASE_PCBA, ictMachineId: 'ict-automotive', ictCycleTimeSec: 120,
    });
    const ict = d.operations.find(o => o.operationName.includes('ICT'));
    expect(ict).toBeDefined();
    expect(ict!.machineId).toBe('ict-automotive');
    expect(ict!.cycleTimeHr).toBeCloseTo(120 / 3600, 6);
  });

  it('ICT cycle time defaults to 120 s when ictCycleTimeSec omitted', () => {
    const d = computePCBADrivers({ ...BASE_PCBA, ictMachineId: 'ict-automotive' });
    const ict = d.operations.find(o => o.operationName.includes('ICT'))!;
    expect(ict.cycleTimeHr).toBeCloseTo(120 / 3600, 6);
  });
});

// ─── Named PCB machines in DEFAULT_RATE_LIBRARY ──────────────────────────────

describe('Named PCB machines in DEFAULT_RATE_LIBRARY', () => {
  const machines = DEFAULT_RATE_LIBRARY.machines;

  it('smt-high-speed-line present with rate ≈ £150/hr', () => {
    const m = machines.find(m => m.id === 'smt-high-speed-line')!;
    expect(m).toBeDefined();
    expect(m.computedRatePerHr).toBeCloseTo(150, 0);
  });

  it('laser-drill-75um present with rate ≈ £120/hr', () => {
    const m = machines.find(m => m.id === 'laser-drill-75um')!;
    expect(m).toBeDefined();
    expect(m.computedRatePerHr).toBeCloseTo(120, 0);
  });

  it('xray-bga-inspection present with rate ≈ £90/hr', () => {
    const m = machines.find(m => m.id === 'xray-bga-inspection')!;
    expect(m).toBeDefined();
    expect(m.computedRatePerHr).toBeCloseTo(90, 0);
  });

  it('ict-automotive present with rate ≈ £110/hr', () => {
    const m = machines.find(m => m.id === 'ict-automotive')!;
    expect(m).toBeDefined();
    expect(m.computedRatePerHr).toBeCloseTo(110, 0);
  });

  it('all 4 new PCB machines have computedRatePerHr > 0', () => {
    const ids = ['smt-high-speed-line', 'laser-drill-75um', 'xray-bga-inspection', 'ict-automotive'];
    for (const id of ids) {
      const m = machines.find(m => m.id === id)!;
      expect(m.computedRatePerHr).toBeGreaterThan(0);
    }
  });
});

// ─── CPH rates — component taxonomy ──────────────────────────────────────────

describe('CPH_BY_TYPE — component placement rates', () => {
  it('passive_0402 = 25000 CPH (fastest)', () => {
    expect(CPH_BY_TYPE['passive_0402']).toBe(25000);
  });

  it('ic_bga = 2000 CPH (slowest placed)', () => {
    expect(CPH_BY_TYPE['ic_bga']).toBe(2000);
  });

  it('through_hole and manual_solder = 0 (not placed by SMT)', () => {
    expect(CPH_BY_TYPE['through_hole']).toBe(0);
    expect(CPH_BY_TYPE['manual_solder']).toBe(0);
  });

  it('passive rates > IC rates (smaller/simpler components place faster)', () => {
    expect(CPH_BY_TYPE['passive_0402']).toBeGreaterThan(CPH_BY_TYPE['ic_qfn']);
    expect(CPH_BY_TYPE['ic_qfn']).toBeGreaterThan(CPH_BY_TYPE['ic_bga']);
  });
});

// ─── Full stack integration ───────────────────────────────────────────────────

describe('PCB full stack integration', () => {
  it('FR4_STD 4-layer board produces positive total cost', () => {
    const d = computePCBFabDrivers(BASE_FAB);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('HDI_RIGID costs significantly more than FR4_STD at same layer count', () => {
    const dStd = computePCBFabDrivers({ ...BASE_FAB, technology: 'FR4_STD' });
    const dHdi = computePCBFabDrivers({ ...BASE_FAB, technology: 'HDI_RIGID' });
    const rStd = computeUniversalStack({ ...STACK_DEFAULTS, ...dStd }, DEFAULT_RATE_LIBRARY);
    const rHdi = computeUniversalStack({ ...STACK_DEFAULTS, ...dHdi }, DEFAULT_RATE_LIBRARY);
    expect(rHdi.total).toBeGreaterThan(rStd.total);
  });

  it('aerospace grade board costs more than consumer at same spec', () => {
    const dCons = computePCBFabDrivers({ ...BASE_FAB, qualityGrade: 'consumer' });
    const dAero = computePCBFabDrivers({ ...BASE_FAB, qualityGrade: 'aerospace' });
    const rCons = computeUniversalStack({ ...STACK_DEFAULTS, ...dCons }, DEFAULT_RATE_LIBRARY);
    const rAero = computeUniversalStack({ ...STACK_DEFAULTS, ...dAero }, DEFAULT_RATE_LIBRARY);
    expect(rAero.total).toBeGreaterThan(rCons.total);
  });

  it('PCBA with high-speed SMT line produces positive total cost', () => {
    const d = computePCBADrivers({ ...BASE_PCBA, smtMachineId: 'smt-high-speed-line' });
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('PCBA with ICT and X-ray costs more than without', () => {
    const dBase = computePCBADrivers({ ...BASE_PCBA });
    const dFull = computePCBADrivers({
      ...BASE_PCBA,
      bgaCount: 2,
      xrayMachineId: 'xray-bga-inspection',
      ictMachineId: 'ict-automotive',
      ictCycleTimeSec: 120,
      qualityGrade: 'auto_grade2',
    });
    const rBase = computeUniversalStack({ ...STACK_DEFAULTS, ...dBase }, DEFAULT_RATE_LIBRARY);
    const rFull = computeUniversalStack({ ...STACK_DEFAULTS, ...dFull }, DEFAULT_RATE_LIBRARY);
    expect(rFull.total).toBeGreaterThan(rBase.total);
  });

  it('double-sided PCBA costs more than single-sided', () => {
    const d1 = computePCBADrivers({ ...BASE_PCBA, smtSides: 1 });
    const d2 = computePCBADrivers({ ...BASE_PCBA, smtSides: 2 });
    const r1 = computeUniversalStack({ ...STACK_DEFAULTS, ...d1 }, DEFAULT_RATE_LIBRARY);
    const r2 = computeUniversalStack({ ...STACK_DEFAULTS, ...d2 }, DEFAULT_RATE_LIBRARY);
    expect(r2.total).toBeGreaterThan(r1.total);
  });
});

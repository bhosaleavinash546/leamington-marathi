import { describe, it, expect } from 'vitest';
import { computeSheetMetalFabDrivers, SM_FAB_TOLERANCE_FACTOR, ASSIST_GAS_COST_PER_HR } from '../src/engine/modules/sheet-metal-fab.js';
import { adviseSheetMetalProcess, classifyVolume } from '../src/engine/modules/sheet-metal-advisor.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const STACK_DEFAULTS = {
  partName: 'Test SM Fab Part',
  packagingPerPart: 0.10,
  logisticsPerPart: 0.15,
  overheadPct: 0.10,
  marginPct: 0.08,
};

// ─── Base inputs ─────────────────────────────────────────────────────────────

const BASE_FAB: import('../src/engine/modules/sheet-metal-fab.js').SheetMetalFabInputs = {
  materialId: 'mat-dc01',
  partWeightKg: 0.50,
  materialUtilization: 0.78,
  blankingMethod: 'laser',
  blankingMachineId: 'laser-trumpf-3030',
  blankingLabourId: 'lab-uk-semiskilled',
  blankingCycleTimeSec: 45,
  bendCount: 3,
  timePerBendSec: 45,
  toolChangeCount: 1,
  toolChangeTimeSec: 300,
  bendMachineId: 'brake-amada-hfe100',
  bendLabourId: 'lab-uk-semiskilled',
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.92,
  toolingCost: 2000,
  amortizationVolume: 5000,
};

// ─── Blanking operations ──────────────────────────────────────────────────────

describe('Sheet Metal Fab — blanking operation', () => {
  it('laser blanking produces "Laser Cutting" operation', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, blankingMethod: 'laser' });
    expect(d.operations[0].operationName).toBe('Laser Cutting');
  });

  it('punch blanking produces "Turret Punching" operation', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, blankingMethod: 'punch', blankingMachineId: 'punch-amada-emz3610' });
    expect(d.operations[0].operationName).toBe('Turret Punching');
  });

  it('shear blanking produces "Shearing" operation', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, blankingMethod: 'shear' });
    expect(d.operations[0].operationName).toBe('Shearing');
  });

  it('blanking cycle time = blankingCycleTimeSec / 3600', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(45 / 3600, 8);
  });
});

// ─── Bending ──────────────────────────────────────────────────────────────────

describe('Sheet Metal Fab — press brake bending', () => {
  it('bending operation added when bendCount > 0', () => {
    const d = computeSheetMetalFabDrivers(BASE_FAB);
    const bendOp = d.operations.find(o => o.operationName === 'Press Brake Bending');
    expect(bendOp).toBeDefined();
  });

  it('bending operation absent when bendCount = 0', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, bendCount: 0 });
    const bendOp = d.operations.find(o => o.operationName === 'Press Brake Bending');
    expect(bendOp).toBeUndefined();
  });

  it('bending cycle time = (bends × timePerBend + toolChanges × changeTime) / 3600', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const expected = (3 * 45 + 1 * 300) / 3600;
    const bendOp = d.operations.find(o => o.operationName === 'Press Brake Bending')!;
    expect(bendOp.cycleTimeHr).toBeCloseTo(expected, 8);
  });
});

// ─── Tolerance multiplier ─────────────────────────────────────────────────────

describe('Sheet Metal Fab — tolerance multiplier', () => {
  it('±0.5mm or wider → ×1.0 (no uplift)', () => {
    const base = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const t05  = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.50 });
    expect(t05.operations[0].cycleTimeHr).toBeCloseTo(base.operations[0].cycleTimeHr, 8);
  });

  it('±0.3mm → ×1.1 on blanking cycle', () => {
    const base = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const tight = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.30 });
    expect(tight.operations[0].cycleTimeHr).toBeCloseTo(base.operations[0].cycleTimeHr * 1.1, 6);
  });

  it('±0.2mm → ×1.3 on bending cycle', () => {
    const base  = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const tight = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.20 });
    const baseBend  = base.operations.find(o => o.operationName === 'Press Brake Bending')!;
    const tightBend = tight.operations.find(o => o.operationName === 'Press Brake Bending')!;
    expect(tightBend.cycleTimeHr).toBeCloseTo(baseBend.cycleTimeHr * 1.3, 6);
  });

  it('±0.1mm → ×1.6 on blanking cycle', () => {
    const base  = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const ultra = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.10 });
    expect(ultra.operations[0].cycleTimeHr).toBeCloseTo(base.operations[0].cycleTimeHr * 1.6, 6);
  });

  it('tolerance tighter than 0.10mm still clamps to ×1.6', () => {
    const ultra1 = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.10 });
    const ultra2 = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.05 });
    expect(ultra2.operations[0].cycleTimeHr).toBeCloseTo(ultra1.operations[0].cycleTimeHr, 8);
  });
});

// ─── Assist gas ───────────────────────────────────────────────────────────────

describe('Sheet Metal Fab — assist gas consumable', () => {
  it('nitrogen assist gas adds consumable cost to rawMaterial', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, assistGas: 'nitrogen', toleranceMm: undefined });
    const blankingHr = 45 / 3600;
    const expected = ASSIST_GAS_COST_PER_HR.nitrogen * blankingHr;
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(expected, 6);
  });

  it('no assist gas = no consumable on rawMaterial', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, assistGas: undefined });
    expect(d.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
  });

  it('assist gas only added when method is laser (not punch)', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, blankingMethod: 'punch', assistGas: 'nitrogen' });
    expect(d.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
  });
});

// ─── Joining operations ───────────────────────────────────────────────────────

describe('Sheet Metal Fab — joining operations', () => {
  it('spot weld operation added when spotWeldCount > 0 with machine/labour IDs', () => {
    const d = computeSheetMetalFabDrivers({
      ...BASE_FAB,
      spotWeldCount: 10,
      spotWeldMachineId: 'robot-spotweld-kuka',
      spotWeldLabourId: 'lab-uk-semiskilled',
      timePerSpotWeldSec: 3,
    });
    const swOp = d.operations.find(o => o.operationName === 'Spot Welding');
    expect(swOp).toBeDefined();
    expect(swOp!.cycleTimeHr).toBeCloseTo(10 * 3 / 3600, 8);
  });

  it('no spot weld op when spotWeldCount = 0', () => {
    const d = computeSheetMetalFabDrivers({ ...BASE_FAB, spotWeldCount: 0 });
    expect(d.operations.find(o => o.operationName === 'Spot Welding')).toBeUndefined();
  });

  it('MIG weld op added when migWeldLengthM > 0 with machine/labour IDs', () => {
    const d = computeSheetMetalFabDrivers({
      ...BASE_FAB,
      migWeldLengthM: 0.5,
      migWeldSpeedMPerMin: 0.3,
      migWeldMachineId: 'mig-welder-manual',
      migWeldLabourId: 'lab-uk-skilled',
      migWeldConsumableCostPerM: 0.40,
    });
    const migOp = d.operations.find(o => o.operationName === 'MIG Welding');
    expect(migOp).toBeDefined();
    expect(migOp!.cycleTimeHr).toBeCloseTo(0.5 / 0.3 / 60, 8);
  });

  it('MIG consumable cost goes to rawMaterial.consumablesCostPerPart', () => {
    const d = computeSheetMetalFabDrivers({
      ...BASE_FAB,
      migWeldLengthM: 0.5,
      migWeldMachineId: 'mig-welder-manual',
      migWeldLabourId: 'lab-uk-skilled',
      migWeldConsumableCostPerM: 0.40,
    });
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.5 * 0.40, 6);
  });
});

// ─── Reject uplift ────────────────────────────────────────────────────────────

describe('Sheet Metal Fab — reject uplift', () => {
  it('5% reject rate uplifts material weight by 1/(1-0.05)', () => {
    const base = computeSheetMetalFabDrivers({ ...BASE_FAB });
    const rej  = computeSheetMetalFabDrivers({ ...BASE_FAB, rejectRate: 0.05 });
    expect(rej.rawMaterial.netWeightKg).toBeCloseTo(base.rawMaterial.netWeightKg / (1 - 0.05), 4);
  });

  it('reject rate also uplifts blanking cycle time', () => {
    const base = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined });
    const rej  = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: undefined, rejectRate: 0.05 });
    expect(rej.operations[0].cycleTimeHr).toBeCloseTo(base.operations[0].cycleTimeHr / (1 - 0.05), 6);
  });
});

// ─── Full stack ───────────────────────────────────────────────────────────────

describe('Sheet Metal Fab — full stack integration', () => {
  it('produces positive total cost', () => {
    const d = computeSheetMetalFabDrivers(BASE_FAB);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
  });

  it('higher tolerance (±0.1mm) raises total vs standard (±0.5mm)', () => {
    const dLoose = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.50 });
    const dTight = computeSheetMetalFabDrivers({ ...BASE_FAB, toleranceMm: 0.10 });
    const rLoose = computeUniversalStack({ ...STACK_DEFAULTS, ...dLoose }, DEFAULT_RATE_LIBRARY);
    const rTight = computeUniversalStack({ ...STACK_DEFAULTS, ...dTight }, DEFAULT_RATE_LIBRARY);
    expect(rTight.total).toBeGreaterThan(rLoose.total);
  });

  it('Trumpf laser at £85/hr exists in library and produces nonzero process cost', () => {
    const d = computeSheetMetalFabDrivers(BASE_FAB);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.process).toBeGreaterThan(0);
  });
});

// ─── Process Advisor ─────────────────────────────────────────────────────────

describe('Sheet Metal Process Advisor', () => {
  it('classifyVolume: < 1000 → low', () => {
    expect(classifyVolume(500)).toBe('low');
  });

  it('classifyVolume: 1000–49999 → medium', () => {
    expect(classifyVolume(5000)).toBe('medium');
    expect(classifyVolume(49999)).toBe('medium');
  });

  it('classifyVolume: ≥ 50000 → high', () => {
    expect(classifyVolume(50000)).toBe('high');
    expect(classifyVolume(200000)).toBe('high');
  });

  it('high volume + thin sheet → Stamping recommendation', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 100000, thicknessMm: 1.5, complexity: 'low', holeDensity: 'low', materialFamily: 'steel' });
    expect(rec.primaryProcess).toContain('Stamp');
    expect(rec.volumeCategory).toBe('high');
  });

  it('medium volume + high hole density → Turret Punching', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 10000, thicknessMm: 2.0, complexity: 'medium', holeDensity: 'high', materialFamily: 'steel' });
    expect(rec.primaryProcess).toContain('Punch');
  });

  it('low volume → Laser Cutting regardless of complexity', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 200, thicknessMm: 3.0, complexity: 'high', holeDensity: 'low', materialFamily: 'stainless' });
    expect(rec.primaryProcess).toContain('Laser');
  });

  it('stainless steel material → Laser recommendation (avoids punch for SS)', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 20000, thicknessMm: 1.5, complexity: 'medium', holeDensity: 'low', materialFamily: 'stainless' });
    expect(rec.primaryProcess).toContain('Laser');
  });

  it('returns processRoute as non-empty array', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 5000, thicknessMm: 1.5, complexity: 'medium', holeDensity: 'low', materialFamily: 'steel' });
    expect(rec.processRoute.length).toBeGreaterThan(0);
  });

  it('returns suggestedMachineIds as non-empty array', () => {
    const rec = adviseSheetMetalProcess({ annualVolume: 5000, thicknessMm: 1.5, complexity: 'medium', holeDensity: 'low', materialFamily: 'steel' });
    expect(rec.suggestedMachineIds.length).toBeGreaterThan(0);
  });
});

// ─── New materials in library ─────────────────────────────────────────────────

describe('New SM materials in DEFAULT_RATE_LIBRARY', () => {
  const ids = ['mat-aa5052', 'mat-aa5083', 'mat-aa6082-sheet', 'mat-aisi430', 'mat-ss316-sheet', 'mat-dc01-ze', 'mat-hsla420'];
  for (const id of ids) {
    it(`material ${id} present with positive price`, () => {
      const mat = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === id);
      expect(mat).toBeDefined();
      expect(mat!.pricePerKg).toBeGreaterThan(0);
    });
  }
});

// ─── Named machines in library ────────────────────────────────────────────────

describe('Named SM fab machines in DEFAULT_RATE_LIBRARY', () => {
  const ids = [
    'laser-trumpf-3030', 'laser-bystronic-3015',
    'punch-amada-emz3610', 'punch-trumpf-5000',
    'brake-amada-hfe100', 'brake-trumpf-5230',
    'press-schuler-400t', 'press-aida-200t',
    'rollform-dimeco-20st',
    'robot-spotweld-kuka', 'mig-welder-manual', 'tig-welder-manual',
  ];
  for (const id of ids) {
    it(`machine ${id} present with positive rate`, () => {
      const m = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id);
      expect(m).toBeDefined();
      expect(m!.computedRatePerHr).toBeGreaterThan(0);
    });
  }

  it('Trumpf TruLaser 3030 rate ≈ £85/hr', () => {
    const m = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'laser-trumpf-3030')!;
    expect(m.computedRatePerHr).toBeCloseTo(85, 0);
  });

  it('Amada press brake rate ≈ £55/hr', () => {
    const m = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'brake-amada-hfe100')!;
    expect(m.computedRatePerHr).toBeCloseTo(55, 0);
  });

  it('Schuler 400T stamping press rate ≈ £150/hr', () => {
    const m = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'press-schuler-400t')!;
    expect(m.computedRatePerHr).toBeCloseTo(150, 0);
  });
});

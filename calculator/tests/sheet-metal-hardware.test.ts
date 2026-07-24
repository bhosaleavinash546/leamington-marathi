import { describe, it, expect } from 'vitest';
import {
  HARDWARE_CATALOGUE,
  THREAD_BORE_MM,
  describeHardware,
  hardwareConsumableCostPerPart,
  hardwareInstallOperation,
  hardwareInstallTimeSec,
  hardwarePurchaseCostPerPart,
} from '../src/engine/modules/sheet-metal-hardware.js';
import type { SheetHardwareItem } from '../src/engine/modules/sheet-metal-hardware.js';
import { computeSheetMetalDrivers } from '../src/engine/modules/sheet-metal.js';
import type { SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import { computeSheetMetalFabDrivers } from '../src/engine/modules/sheet-metal-fab.js';
import type { SheetMetalFabInputs } from '../src/engine/modules/sheet-metal-fab.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const NUTS_3xM8: SheetHardwareItem[] = [
  { type: 'weld_nut_hex', threadSize: 'M8', count: 3 },
];

const MIXED: SheetHardwareItem[] = [
  { type: 'weld_nut_hex', threadSize: 'M8', count: 3 },
  { type: 'weld_stud', threadSize: 'M6', count: 2 },
];

// ─── Catalogue + pure helpers ────────────────────────────────────────────────

describe('sheet-metal hardware catalogue', () => {
  it('covers every type × size with positive prices and times', () => {
    for (const row of Object.values(HARDWARE_CATALOGUE)) {
      for (const size of Object.keys(THREAD_BORE_MM) as (keyof typeof THREAD_BORE_MM)[]) {
        expect(row.unitCostGBP[size]).toBeGreaterThan(0);
      }
      expect(row.installTimeSec).toBeGreaterThan(0);
      expect(row.consumableCostPerPiece).toBeGreaterThanOrEqual(0);
    }
  });

  it('thread bores are the standard metric tapping diameters', () => {
    expect(THREAD_BORE_MM.M6).toBeCloseTo(5.0, 5);
    expect(THREAD_BORE_MM.M8).toBeCloseTo(6.8, 5);
  });

  it('purchase cost: 3× M8 hex weld nut = 3 × catalogue price', () => {
    expect(hardwarePurchaseCostPerPart(NUTS_3xM8)).toBeCloseTo(3 * 0.048, 10);
  });

  it('explicit unitCostGBP overrides the catalogue', () => {
    const items: SheetHardwareItem[] = [
      { type: 'weld_nut_hex', threadSize: 'M8', count: 3, unitCostGBP: 0.10 },
    ];
    expect(hardwarePurchaseCostPerPart(items)).toBeCloseTo(0.30, 10);
  });

  it('install time and consumables sum across mixed lines', () => {
    // 3 × 2.5s + 2 × 1.5s = 10.5 s;  3 × 0.008 + 2 × 0.010 = £0.044
    expect(hardwareInstallTimeSec(MIXED)).toBeCloseTo(10.5, 10);
    expect(hardwareConsumableCostPerPart(MIXED)).toBeCloseTo(0.044, 10);
  });

  it('zero-count lines and undefined lists cost nothing', () => {
    expect(hardwarePurchaseCostPerPart(undefined)).toBe(0);
    expect(hardwarePurchaseCostPerPart([{ type: 'rivnut', threadSize: 'M6', count: 0 }])).toBe(0);
  });

  it('describeHardware names every active line', () => {
    expect(describeHardware(MIXED)).toBe(
      '3× M8 Hex weld nut (DIN 929) + 2× M6 Weld stud (drawn-arc/CD)',
    );
  });

  it('install operation carries the summed time and reject uplift', () => {
    const op = hardwareInstallOperation(NUTS_3xM8, {
      machineId: 'spotweld-gun-manual', labourId: 'lab-uk-semiskilled',
      oee: 1.0, manning: 1, labourEfficiency: 0.92, rejectUplift: 1.25,
    });
    expect(op).not.toBeNull();
    expect(op!.cycleTimeHr).toBeCloseTo((3 * 2.5 / 3600) * 1.25, 10);
    expect(op!.operationName).toContain('M8 Hex weld nut');
  });

  it('no machine/labour → no operation (purchase cost still applies upstream)', () => {
    const op = hardwareInstallOperation(NUTS_3xM8, {
      machineId: '', labourId: 'lab-uk-semiskilled',
      oee: 1, manning: 1, labourEfficiency: 1,
    });
    expect(op).toBeNull();
  });
});

// ─── Stamping integration ────────────────────────────────────────────────────

const SM_BASE: SheetMetalInputs = {
  materialId: 'mat-dc01',
  netWeightKg: 0.15,
  blankLengthMm: 200,
  blankWidthMm: 150,
  thicknessMm: 1.2,
  perimeterMm: 700,
  shearStrengthMPa: 280,
  stripWidthMm: 160,
  pitchMm: 210,
  partsPerStroke: 1,
  pressId: 'press-100t',
  labourId: 'lab-uk-semiskilled',
  strokesPerMin: 80,
  oee: 0.85,
  manning: 0.25,
  labourEfficiency: 0.95,
  numOperations: 3,
  dieType: 'progressive',
  dieLife: 500000,
  dieCostEstimate: 45000,
  amortizationVolume: 500000,
};

const STACK_DEFAULTS = {
  partName: 'HW test part',
  packagingPerPart: 0.05,
  logisticsPerPart: 0.10,
  overheadPct: 0.10,
  marginPct: 0.07,
};

describe('stamping (sheet_metal) hardware integration', () => {
  it('no hardware / empty hardware → drivers identical to baseline', () => {
    const base = computeSheetMetalDrivers(SM_BASE);
    const empty = computeSheetMetalDrivers({ ...SM_BASE, hardware: [] });
    expect(empty).toEqual(base);
  });

  it('hardware purchase + install consumable lands in material consumables', () => {
    const d = computeSheetMetalDrivers({ ...SM_BASE, hardware: NUTS_3xM8 });
    // 3 × (0.048 + 0.008) = £0.168, no reject rate
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.168, 10);
  });

  it('reject rate uplifts the hardware spend', () => {
    const d = computeSheetMetalDrivers({ ...SM_BASE, rejectRate: 0.2, hardware: NUTS_3xM8 });
    expect(d.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.168 * 1.25, 10);
  });

  it('install op appears only when machine + labour are supplied', () => {
    const noIds = computeSheetMetalDrivers({ ...SM_BASE, hardware: NUTS_3xM8 });
    expect(noIds.operations.some(o => o.operationName.startsWith('Hardware Install'))).toBe(false);

    const withIds = computeSheetMetalDrivers({
      ...SM_BASE, hardware: NUTS_3xM8,
      hardwareMachineId: 'spotweld-gun-manual', hardwareLabourId: 'lab-uk-semiskilled',
    });
    const op = withIds.operations.find(o => o.operationName.startsWith('Hardware Install'));
    expect(op).toBeDefined();
    expect(op!.cycleTimeHr).toBeCloseTo(3 * 2.5 / 3600, 10);
    expect(op!.partsPerCycle).toBe(1);
  });

  it('full stack: hardware raises total by hand-computed material + process/labour delta', () => {
    const base = computeUniversalStack(
      { ...STACK_DEFAULTS, ...computeSheetMetalDrivers(SM_BASE) },
      DEFAULT_RATE_LIBRARY,
    );
    const withHw = computeUniversalStack(
      { ...STACK_DEFAULTS, ...computeSheetMetalDrivers({
        ...SM_BASE, hardware: NUTS_3xM8,
        hardwareMachineId: 'spotweld-gun-manual', hardwareLabourId: 'lab-uk-semiskilled',
      }) },
      DEFAULT_RATE_LIBRARY,
    );
    // Material bucket delta = purchased nuts + electrode consumable
    expect(withHw.breakdown.rawMaterial - base.breakdown.rawMaterial).toBeCloseTo(0.168, 6);
    // Process + labour buckets gain the projection-weld station time
    expect(withHw.breakdown.process).toBeGreaterThan(base.breakdown.process);
    expect(withHw.breakdown.labour).toBeGreaterThan(base.breakdown.labour);
    expect(withHw.total).toBeGreaterThan(base.total);
  });
});

// ─── Fab integration ─────────────────────────────────────────────────────────

const FAB_BASE: SheetMetalFabInputs = {
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

describe('sheet_metal_fab hardware integration', () => {
  it('no hardware → drivers identical to baseline', () => {
    const base = computeSheetMetalFabDrivers(FAB_BASE);
    const empty = computeSheetMetalFabDrivers({ ...FAB_BASE, hardware: [] });
    expect(empty).toEqual(base);
  });

  it('hardware cost joins the fab consumables line and the install op is emitted', () => {
    const d = computeSheetMetalFabDrivers({
      ...FAB_BASE, hardware: MIXED,
      hardwareMachineId: 'spotweld-gun-manual', hardwareLabourId: 'lab-uk-semiskilled',
    });
    const dBase = computeSheetMetalFabDrivers(FAB_BASE);
    const hwSpend = (d.rawMaterial.consumablesCostPerPart ?? 0) - (dBase.rawMaterial.consumablesCostPerPart ?? 0);
    // 3×0.048 + 2×0.030 purchase + £0.044 consumables = £0.248
    expect(hwSpend).toBeCloseTo(0.248, 10);

    const op = d.operations.find(o => o.operationName.startsWith('Hardware Install'));
    expect(op).toBeDefined();
    expect(op!.cycleTimeHr).toBeCloseTo(10.5 / 3600, 10);
    expect(op!.machineId).toBe('spotweld-gun-manual');
  });

  it('full fab stack with hardware passes core validation and reconciles', () => {
    const result = computeUniversalStack(
      { ...STACK_DEFAULTS, ...computeSheetMetalFabDrivers({
        ...FAB_BASE, hardware: NUTS_3xM8,
        hardwareMachineId: 'spotweld-gun-manual', hardwareLabourId: 'lab-uk-semiskilled',
      }) },
      DEFAULT_RATE_LIBRARY,
    );
    expect(result.total).toBeGreaterThan(0);
    expect(Number.isFinite(result.total)).toBe(true);
  });
});

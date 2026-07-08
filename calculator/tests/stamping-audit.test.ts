import { describe, it, expect } from 'vitest';
import { computeSheetMetalDrivers, type SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import {
  estimateStampingDieCost, estimateStampingDieLife, stampingHardnessFactor,
} from '../src/engine/modules/sheet-metal-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const lib = DEFAULT_RATE_LIBRARY;

const BASE: SheetMetalInputs = {
  materialId: 'mat-steel1045', netWeightKg: 0.15, blankLengthMm: 200, blankWidthMm: 150,
  thicknessMm: 1.2, perimeterMm: 700, shearStrengthMPa: 280, stripWidthMm: 160, pitchMm: 210,
  partsPerStroke: 1, pressId: 'press-400t', labourId: 'lab-uk-semiskilled', strokesPerMin: 80,
  oee: 0.85, manning: 0.25, labourEfficiency: 0.95, numOperations: 3, dieType: 'progressive',
  dieLife: 500000, dieCostEstimate: 45000, amortizationVolume: 500000,
};

describe('SM1 — parametric stamping die-cost estimator', () => {
  it('rises with stations, blank size, hardness and die-type complexity', () => {
    const s2 = estimateStampingDieCost({ dieType: 'progressive', stations: 2, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    const s6 = estimateStampingDieCost({ dieType: 'progressive', stations: 6, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    expect(s6).toBeGreaterThan(s2);

    const small = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 100, shearStrengthMPa: 280 }).total;
    const large = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 900, shearStrengthMPa: 280 }).total;
    expect(large).toBeGreaterThan(small);

    const mild = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    const boron = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 900 }).total;
    expect(boron).toBeGreaterThan(mild);

    const prog = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    const transfer = estimateStampingDieCost({ dieType: 'transfer', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    const fb = estimateStampingDieCost({ dieType: 'fine_blanking', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 280 }).total;
    expect(transfer).toBeGreaterThan(prog);
    expect(fb).toBeGreaterThan(transfer);
  });

  it('single-stage is cheaper than progressive; breakdown sums to total', () => {
    const single = estimateStampingDieCost({ dieType: 'single_stage', stations: 1, blankAreaCm2: 300, shearStrengthMPa: 280 });
    const prog = estimateStampingDieCost({ dieType: 'progressive', stations: 3, blankAreaCm2: 300, shearStrengthMPa: 280 });
    expect(single.total).toBeLessThan(prog.total);
    expect(Math.abs(prog.total - (prog.base + prog.stations))).toBeLessThanOrEqual(2);
  });

  it('hardness factor grows with shear strength and clamps at 2.0', () => {
    expect(stampingHardnessFactor(280)).toBeCloseTo(1.0, 2);
    expect(stampingHardnessFactor(600)).toBeGreaterThan(1.0);
    expect(stampingHardnessFactor(3000)).toBeLessThanOrEqual(2.0);
  });
});

describe('SM1 — die-life predictor', () => {
  it('abrasive high-strength steel and thick stock shorten life', () => {
    const mild = estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 1.2, dieType: 'progressive' });
    const uhss = estimateStampingDieLife({ shearStrengthMPa: 700, thicknessMm: 1.2, dieType: 'progressive' });
    expect(uhss).toBeLessThan(mild);
    const thin = estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 1.0, dieType: 'progressive' });
    const thick = estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 4.0, dieType: 'progressive' });
    expect(thick).toBeLessThan(thin);
    const prog = estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 1.2, dieType: 'progressive' });
    const fb = estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 1.2, dieType: 'fine_blanking' });
    expect(fb).toBeLessThan(prog);
  });

  it('stays within the 50k–3M window', () => {
    const hi = estimateStampingDieLife({ shearStrengthMPa: 100, thicknessMm: 0.5, dieType: 'progressive' });
    const lo = estimateStampingDieLife({ shearStrengthMPa: 2000, thicknessMm: 8, dieType: 'fine_blanking' });
    expect(hi).toBeLessThanOrEqual(3_000_000);
    expect(lo).toBeGreaterThanOrEqual(50_000);
  });
});

describe('SM — engine uses estimate/predict when die cost / life ≤0', () => {
  it('estimates die cost when dieCostEstimate ≤0; honours a manual figure', () => {
    const est = computeSheetMetalDrivers({ ...BASE, dieCostEstimate: 0 });
    const manual = computeSheetMetalDrivers({ ...BASE, dieCostEstimate: 45000 });
    expect(est.tooling.totalToolingCost).toBeGreaterThan(0);
    expect(est.tooling.totalToolingCost).not.toBeCloseTo(manual.tooling.totalToolingCost, 0);
  });

  it('predicts die life when dieLife ≤0 (UHSS → more die sets than mild)', () => {
    const mild = computeSheetMetalDrivers({ ...BASE, dieLife: 0, shearStrengthMPa: 280, dieCostEstimate: 50000 });
    const uhss = computeSheetMetalDrivers({ ...BASE, dieLife: 0, shearStrengthMPa: 900, dieCostEstimate: 50000 });
    // shorter life → more die sets over the same volume → higher tooling total
    expect(uhss.tooling.totalToolingCost).toBeGreaterThan(mild.tooling.totalToolingCost);
  });

  it('fine_blanking die type is accepted by the engine', () => {
    const d = computeSheetMetalDrivers({ ...BASE, dieType: 'fine_blanking', pressId: 'press-fineblank-250t' });
    expect(d.operations[0].operationName).toBe('Press (fine blanking)');
  });
});

describe('SM4 — press ladder additions', () => {
  it('adds larger presses and a fine-blanking press, ordered by rate', () => {
    for (const id of ['press-800t', 'press-1000t', 'press-1250t', 'press-fineblank-250t']) {
      expect(lib.machines.find(m => m.id === id)).toBeTruthy();
    }
    const rate = (id: string) => lib.machines.find(m => m.id === id)!.computedRatePerHr;
    expect(rate('press-630t')).toBeLessThan(rate('press-800t'));
    expect(rate('press-800t')).toBeLessThan(rate('press-1000t'));
    expect(rate('press-1000t')).toBeLessThan(rate('press-1250t'));
  });
});

describe('SM5 — new stamping material grades', () => {
  it('adds electrical, spring and deep-draw grades', () => {
    for (const id of ['mat-dc04', 'mat-dc05', 'mat-dc06',
      'mat-nogo-m270-35a', 'mat-nogo-m400-50a', 'mat-go-m105-30p',
      'mat-c67s-spring', 'mat-ss301-spring']) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m).toBeTruthy();
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.effectiveDate).toBe('2026-07');
    }
    // grain-oriented electrical steel is a premium over non-oriented
    const go = lib.materials.find(m => m.id === 'mat-go-m105-30p')!.pricePerKg;
    const no = lib.materials.find(m => m.id === 'mat-nogo-m400-50a')!.pricePerKg;
    expect(go).toBeGreaterThan(no);
  });
});

describe('SM6 — hot stamping / press-hardening process', () => {
  it('adds furnace energy consumable and a quench-dwell press cycle', () => {
    const cold = computeSheetMetalDrivers({ ...BASE, materialId: 'mat-usibor1500' });
    const hot = computeSheetMetalDrivers({
      ...BASE, materialId: 'mat-usibor1500', hotStamping: true,
      austenitiseEnergyKwhPerKg: 0.30, hotStampingEnergyPricePerKwh: 0.23, quenchDwellSec: 8,
    });
    // furnace heat → material consumable (cold path has none)
    expect(cold.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
    expect(hot.rawMaterial.consumablesCostPerPart ?? 0).toBeGreaterThan(0);
    // press op is relabelled and quench-dwell governs the cycle (8s = 0.00222 hr), not 80 SPM (0.000208 hr)
    expect(hot.operations[0].operationName).toBe('Hot Stamping (form + quench)');
    expect(hot.operations[0].cycleTimeHr).toBeGreaterThan(cold.operations[0].cycleTimeHr);
    expect(hot.operations[0].cycleTimeHr).toBeCloseTo(8 / 3600, 6);
  });

  it('adds an austenitising-furnace operation when furnace fields are supplied', () => {
    const hot = computeSheetMetalDrivers({
      ...BASE, hotStamping: true, quenchDwellSec: 8,
      furnaceMachineId: 'furnace-roller-hearth', furnaceLabourId: 'lab-uk-furnace', furnaceCycleHrPerPart: 0.02,
    });
    expect(hot.operations[0].operationName).toBe('Austenitising Furnace');
    expect(hot.operations[1].operationName).toBe('Hot Stamping (form + quench)');
  });

  it('adds the hot-stamping press + roller-hearth furnace to the library', () => {
    expect(lib.machines.find(m => m.id === 'press-hotstamp-1000t')).toBeTruthy();
    expect(lib.machines.find(m => m.id === 'furnace-roller-hearth')).toBeTruthy();
  });
});

describe('SM7 — multiple secondary operations', () => {
  it('chains legacy + array secondary ops into the operation list', () => {
    const d = computeSheetMetalDrivers({
      ...BASE,
      secondaryOpsMachineId: 'press-100t', secondaryOpsLabourId: 'lab-uk-semiskilled', secondaryOpsCycleHr: 0.01,
      secondaryOps: [
        { machineId: 'press-100t', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.005, operationName: 'Tap' },
        { machineId: 'press-100t', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.004, operationName: 'Deburr' },
      ],
    });
    const names = d.operations.map(o => o.operationName);
    expect(names).toContain('Secondary Operation'); // legacy
    expect(names).toContain('Tap');
    expect(names).toContain('Deburr');
    // press + 3 secondary ops
    expect(d.operations.length).toBe(4);
  });

  it('ignores array entries with missing machine/labour or zero cycle', () => {
    const d = computeSheetMetalDrivers({
      ...BASE,
      secondaryOps: [
        { machineId: '', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.005 },
        { machineId: 'press-100t', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0 },
      ],
    });
    expect(d.operations.length).toBe(1); // just the press
  });
});

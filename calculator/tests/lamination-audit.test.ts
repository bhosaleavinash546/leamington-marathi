import { describe, it, expect } from 'vitest';
import {
  estimateLaminationJoinCostPerStack, estimateLaminationFinishing, analyseLaminationDFM,
  LAMINATION_ANNEAL_KWH_PER_KG,
} from '../src/engine/modules/lamination-advisor.js';
import { computeSheetMetalDrivers, type SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const lib = DEFAULT_RATE_LIBRARY;

// ─── EM1: electrical-steel grade ladder ───────────────────────────────────────

describe('EM1 — electrical-steel grade ladder', () => {
  it('adds the NO ladder, EV thin-gauge, GO, CoFe/NiFe/amorphous', () => {
    for (const id of [
      'mat-m235-35a', 'mat-m330-35a', 'mat-m250-50a', 'mat-m470-50a', 'mat-m600-50a', 'mat-m700-65a',
      'mat-no27-27a', 'mat-no25-25a', 'mat-no20-20a',
      'mat-cgo-m120-27', 'mat-hgo-m090-23',
      'mat-cofe-hiperco50', 'mat-nife-permalloy80', 'mat-amorphous-2605sa1', 'mat-no-semiproc-50',
    ]) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m, id).toBeTruthy();
      expect(m.category).toBe('Electrical Steel Sheet');
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.effectiveDate).toBe('2026-07');
    }
  });

  it('price ladder is sane: thinner NO > thicker NO; CoFe ≫ NO; HGO > CGO', () => {
    const p = (id: string) => lib.materials.find(m => m.id === id)!.pricePerKg;
    expect(p('mat-no20-20a')).toBeGreaterThan(p('mat-m470-50a'));   // ultra-thin premium
    expect(p('mat-m235-35a')).toBeGreaterThan(p('mat-m600-50a'));   // low-loss premium
    expect(p('mat-cofe-hiperco50')).toBeGreaterThan(p('mat-no20-20a')); // CoFe tops the ladder
    expect(p('mat-hgo-m090-23')).toBeGreaterThan(p('mat-cgo-m120-27'));
  });
});

// ─── EM2: lamination machines ─────────────────────────────────────────────────

describe('EM2 — lamination machines/tooling', () => {
  it('adds notching, anneal furnace, backlack oven, laser stack welder', () => {
    for (const id of ['notching-machine', 'lamination-anneal-furnace', 'backlack-bonding-oven', 'laser-stack-welder']) {
      expect(lib.machines.find(m => m.id === id), id).toBeTruthy();
    }
  });
});

// ─── EM3: join cost / finishing / DFM ─────────────────────────────────────────

describe('EM3 — lamination join & finishing cost', () => {
  it('interlock is near-free; weld/backlack cost more', () => {
    const interlock = estimateLaminationJoinCostPerStack({ stackMethod: 'interlock', laminationCount: 200, stackHeightMm: 70 });
    const weld = estimateLaminationJoinCostPerStack({ stackMethod: 'laser-weld', laminationCount: 200, stackHeightMm: 70 });
    const backlack = estimateLaminationJoinCostPerStack({ stackMethod: 'backlack', laminationCount: 200, stackHeightMm: 70 });
    expect(interlock).toBeLessThan(weld);
    expect(interlock).toBeLessThan(backlack);
    expect(weld).toBeGreaterThan(0.4);
  });

  it('finishing adds anneal energy and coating when enabled; join divided per lamination', () => {
    const bare = estimateLaminationFinishing({ stackMethod: 'interlock', laminationCount: 200, partWeightKg: 0.05 });
    const full = estimateLaminationFinishing({ stackMethod: 'backlack', laminationCount: 200, partWeightKg: 0.05, stressReliefAnneal: true, reCoat: true, annealEnergyPricePerKwh: 0.23 });
    expect(full.totalPerPart).toBeGreaterThan(bare.totalPerPart);
    expect(full.annealEnergyPerPart).toBeCloseTo(LAMINATION_ANNEAL_KWH_PER_KG * 0.05 * 0.23, 3);
    // join is per-stack, shared across laminations → small per-part
    expect(bare.totalPerPart).toBeLessThan(bare.joinPerStack);
  });

  it('DFM flags narrow teeth, laser-weld shorting, thin gauge and missing anneal', () => {
    const clean = analyseLaminationDFM({ thicknessMm: 0.35, minToothWidthMm: 2, stackMethod: 'interlock', stressReliefAnneal: true });
    expect(clean.score).toBe(10);
    const bad = analyseLaminationDFM({ thicknessMm: 0.20, minToothWidthMm: 0.15, stackMethod: 'laser-weld', stressReliefAnneal: false, thinGauge: true, airGapToleranceMm: 0.01 });
    expect(bad.issues.some(i => /tooth/i.test(i.title))).toBe(true);
    expect(bad.issues.some(i => /weld/i.test(i.title))).toBe(true);
    expect(bad.score).toBeLessThan(8);
  });
});

// ─── EM: engine integration via extraConsumablesPerPart ───────────────────────

describe('EM — lamination finishing flows into part cost via extraConsumablesPerPart', () => {
  const BASE: SheetMetalInputs = {
    materialId: 'mat-m470-50a', netWeightKg: 0.05, blankLengthMm: 120, blankWidthMm: 120,
    thicknessMm: 0.5, perimeterMm: 900, shearStrengthMPa: 300, stripWidthMm: 130, pitchMm: 130,
    partsPerStroke: 1, pressId: 'press-200t', labourId: 'lab-uk-semiskilled', strokesPerMin: 300,
    oee: 0.85, manning: 0.25, labourEfficiency: 0.95, numOperations: 12, dieType: 'progressive',
    dieLife: 0, dieCostEstimate: 0, amortizationVolume: 2_000_000,
  };

  it('extraConsumablesPerPart lands on the material consumable bucket', () => {
    const bare = computeSheetMetalDrivers(BASE);
    const withFinish = computeSheetMetalDrivers({ ...BASE, extraConsumablesPerPart: 0.08 });
    expect(bare.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
    expect(withFinish.rawMaterial.consumablesCostPerPart ?? 0).toBeCloseTo(0.08, 6);
  });

  it('die cost auto-estimates for a high-station lamination progressive tool', () => {
    const d = computeSheetMetalDrivers(BASE);   // dieCostEstimate:0 → estimate; 12 stations
    expect(d.tooling.totalToolingCost).toBeGreaterThan(0);
  });
});

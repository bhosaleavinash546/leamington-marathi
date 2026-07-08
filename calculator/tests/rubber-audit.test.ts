import { describe, it, expect } from 'vitest';
import { computeRubberDrivers, type RubberInputs } from '../src/engine/modules/rubber.js';
import {
  estimateRubberCureTimeSec, estimateRubberMouldCost, estimateCompoundCostPerKg,
  analyseRubberDFM, rubberMouldSteelFactor, RUBBER_CURE_BASE_SEC,
} from '../src/engine/modules/rubber-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, classifyMaterialFamily } from '../src/engine/regional-rates.js';

const lib = DEFAULT_RATE_LIBRARY;
const matPrice = (l: typeof lib, id: string) => l.materials.find(m => m.id === id)!.pricePerKg;

const BASE: RubberInputs = {
  materialId: 'mat-epdm', partWeightKg: 0.05, flashAndRunnerWeightKg: 0.01, process: 'compression_mould',
  machineId: 'compression-mould-std', labourId: 'lab-uk-semiskilled', cycleTimeSec: 180, cavities: 4,
  oee: 0.78, manning: 1, labourEfficiency: 0.88, mouldCost: 5000, mouldLife: 200000, amortizationVolume: 50000,
};

// ─── RB1: cure-time predictor ─────────────────────────────────────────────────

describe('RB1 — rubber cure-time predictor', () => {
  it('cure time grows with thickness² and varies by compound', () => {
    const thin = estimateRubberCureTimeSec({ compoundFamily: 'epdm-sulphur', thicknessMm: 2 });
    const thick = estimateRubberCureTimeSec({ compoundFamily: 'epdm-sulphur', thicknessMm: 8 });
    expect(thick).toBeGreaterThan(thin);
    // LSR/peroxide cure much faster than FKM/FFKM
    expect(estimateRubberCureTimeSec({ compoundFamily: 'silicone-lsr', thicknessMm: 3 }))
      .toBeLessThan(estimateRubberCureTimeSec({ compoundFamily: 'ffkm', thicknessMm: 3 }));
    expect(RUBBER_CURE_BASE_SEC.ffkm).toBeGreaterThan(RUBBER_CURE_BASE_SEC['silicone-lsr']);
  });

  it('hotter mould temperature shortens cure (Arrhenius rule of thumb)', () => {
    const cool = estimateRubberCureTimeSec({ compoundFamily: 'nbr', thicknessMm: 3, moldTempC: 160 });
    const hot = estimateRubberCureTimeSec({ compoundFamily: 'nbr', thicknessMm: 3, moldTempC: 190 });
    expect(hot).toBeLessThan(cool);
  });

  it('engine predicts cycle when cycleTimeSec ≤0 (thicker → longer cycle → higher process cost)', () => {
    const thin = computeRubberDrivers({ ...BASE, cycleTimeSec: 0, thicknessMm: 2, compoundFamily: 'epdm-sulphur' });
    const thick = computeRubberDrivers({ ...BASE, cycleTimeSec: 0, thicknessMm: 10, compoundFamily: 'epdm-sulphur' });
    expect(thick.operations[0].cycleTimeHr).toBeGreaterThan(thin.operations[0].cycleTimeHr);
  });
});

// ─── RB1: compound-cost recipe helper ─────────────────────────────────────────

describe('RB1 — compound-cost recipe helper', () => {
  it('blends base polymer + filler + oil + curatives by mass (phr)', () => {
    const gum = estimateCompoundCostPerKg({ basePolymerPricePerKg: 2.0 });
    const filled = estimateCompoundCostPerKg({ basePolymerPricePerKg: 2.0, fillerPhr: 50, oilPhr: 15, curativesPhr: 8 });
    // adding cheap filler/oil dilutes an expensive polymer → lower £/kg
    expect(filled).toBeLessThan(gum);
    expect(gum).toBeCloseTo(2.0, 3);
  });
});

// ─── RB1: mould estimator ─────────────────────────────────────────────────────

describe('RB1 — rubber mould estimator', () => {
  it('LSR injection tool dearer than compression; rises with cavities/area/inserts', () => {
    const comp = estimateRubberMouldCost({ process: 'compression_mould', cavities: 4, projectedAreaCm2: 20 }).total;
    const lsr = estimateRubberMouldCost({ process: 'injection_mould_lsr', cavities: 4, projectedAreaCm2: 20 }).total;
    expect(lsr).toBeGreaterThan(comp);
    const c4 = estimateRubberMouldCost({ process: 'compression_mould', cavities: 4, projectedAreaCm2: 20 }).total;
    const c32 = estimateRubberMouldCost({ process: 'compression_mould', cavities: 32, projectedAreaCm2: 20 }).total;
    expect(c32).toBeGreaterThan(c4);
    const withInserts = estimateRubberMouldCost({ process: 'compression_mould', cavities: 4, projectedAreaCm2: 20, metalInserts: 4 }).total;
    expect(withInserts).toBeGreaterThan(comp);
    expect(rubberMouldSteelFactor('h13')).toBeGreaterThan(rubberMouldSteelFactor('aluminium'));
  });

  it('engine estimates mould cost when mouldCost ≤0', () => {
    const est = computeRubberDrivers({ ...BASE, mouldCost: 0, projectedAreaCm2: 20, cavities: 8 });
    const manual = computeRubberDrivers({ ...BASE, mouldCost: 5000 });
    expect(est.tooling.totalToolingCost).toBeGreaterThan(0);
    expect(est.tooling.totalToolingCost).not.toBeCloseTo(manual.tooling.totalToolingCost, 0);
  });
});

// ─── RB1: DFM ─────────────────────────────────────────────────────────────────

describe('RB1 — analyseRubberDFM', () => {
  it('clean part scores 10; thin+thick+flash-on-seal drop it', () => {
    const clean = analyseRubberDFM({ thicknessMm: 3, minWallMm: 2, maxWallMm: 4, draftAngleDeg: 1, toleranceMm: 0.3 });
    expect(clean.score).toBe(10);
    const bad = analyseRubberDFM({ thicknessMm: 0.5, minWallMm: 0.5, maxWallMm: 15, draftAngleDeg: 0, flashLineOnSealingFace: true, toleranceMm: 0.03 });
    expect(bad.issues.some(i => /thin/i.test(i.title))).toBe(true);
    expect(bad.issues.some(i => /sealing face/i.test(i.title))).toBe(true);
    expect(bad.score).toBeLessThan(6);
  });
});

// ─── RB2: deflash + inspection ops ────────────────────────────────────────────

describe('RB2 — deflash op + inspection consumable', () => {
  it('adds a Deflash/Trim op and folds inspection into consumables', () => {
    const base = computeRubberDrivers(BASE);
    const withFinish = computeRubberDrivers({
      ...BASE, deflashMachineId: 'die-cut-press-rubber', deflashLabourId: 'lab-uk-semiskilled', deflashCycleSec: 6,
      inspectionCostPerPart: 0.05, bondingPrimerCostPerPart: 0.03,
    });
    expect(base.operations).toHaveLength(1);
    expect(withFinish.operations.some(o => o.operationName === 'Deflash / Trim')).toBe(true);
    expect(withFinish.rawMaterial.consumablesCostPerPart ?? 0).toBeCloseTo(0.08, 4);
  });
});

// ─── RB3: grades + country pricing ────────────────────────────────────────────

describe('RB3 — new elastomer grades + rubber country pricing', () => {
  it('adds BR, halobutyl, FFKM, NBR high-ACN, EPDM peroxide, medical silicone', () => {
    for (const id of ['mat-br', 'mat-bromobutyl', 'mat-chlorobutyl', 'mat-ffkm', 'mat-nbr-high-acn', 'mat-epdm-peroxide', 'mat-silicone-medical']) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m, id).toBeTruthy();
      expect(m.category).toBe('Rubber');
      expect(m.pricePerKg).toBeGreaterThan(0);
    }
    expect(matPrice(lib, 'mat-ffkm')).toBeGreaterThan(matPrice(lib, 'mat-viton-fkm')); // FFKM ≫ FKM
  });

  it('rubber classifies as its own family and stays near-flat by country', () => {
    expect(classifyMaterialFamily(lib.materials.find(m => m.id === 'mat-epdm')!)).toBe('rubber');
    const cn = buildRegionalLibrary(lib, 'CN');
    const ratio = matPrice(cn, 'mat-nr') / matPrice(lib, 'mat-nr');
    expect(ratio).toBeGreaterThan(0.95);   // globally-traded gum → near-flat, not full mill discount
  });
});

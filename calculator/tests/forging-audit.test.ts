import { describe, it, expect } from 'vitest';
import { computeForgingDrivers, type ForgingInputs } from '../src/engine/modules/forging.js';
import {
  estimateForgingTonnage,
  estimateForgingDieCost,
  dieSteelFactor,
  resolveFurnaceEnergyPricePerKwh,
  FORGING_FLOW_STRESS_MPA,
} from '../src/engine/modules/forging-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, classifyMaterialFamily } from '../src/engine/regional-rates.js';

const lib = DEFAULT_RATE_LIBRARY;
const matPrice = (l: typeof lib, id: string) => l.materials.find(m => m.id === id)!.pricePerKg;

const BASE: ForgingInputs = {
  materialId: 'mat-steel1020', partWeightKg: 1.5, flashAndScaleKg: 0.4, yieldFraction: 0.92,
  forgeId: 'forge-press-500t', labourId: 'lab-uk-forge', strokesToForm: 3, cycleTimeHr: 0.008,
  oee: 0.8, manning: 2, labourEfficiency: 0.92, heatingEnergyKwhPerKg: 0.4,
  dieLife: 50000, dieCost: 80000, amortizationVolume: 100000,
};

// ─── F-C1: billet heating energy is now costed ────────────────────────────────

describe('F-C1 — billet heating energy is costed', () => {
  it('heating adds a per-part consumable that scales with kWh/kg and tariff', () => {
    const cold = computeForgingDrivers({ ...BASE, heatingEnergyKwhPerKg: 0 });
    const hot = computeForgingDrivers({ ...BASE, heatingEnergyKwhPerKg: 0.4 });
    const coldC = cold.rawMaterial.consumablesCostPerPart ?? 0;
    const hotC = hot.rawMaterial.consumablesCostPerPart ?? 0;
    expect(hotC).toBeGreaterThan(coldC);
    // billet = (1.5+0.4)/0.92 = 2.0652 kg; heating = 0.4 × 2.0652 × 0.23 ≈ £0.19
    const billet = (BASE.partWeightKg + BASE.flashAndScaleKg) / BASE.yieldFraction;
    expect(hotC - coldC).toBeCloseTo(0.4 * billet * 0.23, 4);
  });

  it('a higher fuel tariff raises the heating cost proportionally', () => {
    const cheap = computeForgingDrivers({ ...BASE, heatingEnergyPricePerKwh: 0.10 });
    const dear = computeForgingDrivers({ ...BASE, heatingEnergyPricePerKwh: 0.30 });
    expect((dear.rawMaterial.consumablesCostPerPart ?? 0)).toBeGreaterThan((cheap.rawMaterial.consumablesCostPerPart ?? 0));
  });

  it('furnace type selects the fuel/tariff correctly', () => {
    const elec = 0.23, gas = 0.065;
    expect(resolveFurnaceEnergyPricePerKwh('induction', elec, gas)).toBeCloseTo(0.23, 4);
    expect(resolveFurnaceEnergyPricePerKwh('electric-resistance', elec, gas)).toBeGreaterThan(0.23);
    expect(resolveFurnaceEnergyPricePerKwh('gas', elec, gas)).toBeCloseTo(gas * 2.4, 4);
    // gas is typically the cheapest heat despite higher thermal energy
    expect(resolveFurnaceEnergyPricePerKwh('gas', elec, gas)).toBeLessThan(resolveFurnaceEnergyPricePerKwh('induction', elec, gas));
  });
});

// ─── F-H2: forging-load / press tonnage ───────────────────────────────────────

describe('F-H2 — forging-load estimate', () => {
  it('load scales with projected area, flow stress and shape constraint', () => {
    const small = estimateForgingTonnage({ projectedAreaCm2: 50, alloyFamily: 'carbon-steel', shapeComplexity: 'moderate' });
    const large = estimateForgingTonnage({ projectedAreaCm2: 200, alloyFamily: 'carbon-steel', shapeComplexity: 'moderate' });
    expect(large).toBeCloseTo(small * 4, 3);

    const soft = estimateForgingTonnage({ projectedAreaCm2: 100, alloyFamily: 'aluminium', shapeComplexity: 'moderate' });
    const hard = estimateForgingTonnage({ projectedAreaCm2: 100, alloyFamily: 'superalloy', shapeComplexity: 'moderate' });
    expect(hard).toBeGreaterThan(soft);

    const simple = estimateForgingTonnage({ projectedAreaCm2: 100, alloyFamily: 'carbon-steel', shapeComplexity: 'simple' });
    const complex = estimateForgingTonnage({ projectedAreaCm2: 100, alloyFamily: 'carbon-steel', shapeComplexity: 'complex' });
    expect(complex).toBeGreaterThan(simple);
  });

  it('flow-stress ladder: superalloy > titanium > stainless > steel > aluminium', () => {
    const f = FORGING_FLOW_STRESS_MPA;
    expect(f.superalloy).toBeGreaterThan(f.titanium);
    expect(f.titanium).toBeGreaterThan(f['stainless-steel']);
    expect(f['stainless-steel']).toBeGreaterThan(f['alloy-steel']);
    expect(f['alloy-steel']).toBeGreaterThan(f.aluminium);
  });

  it('a 100 cm² moderate steel forging needs a few hundred tonnes', () => {
    // 90 MPa × 5 × 10000 mm² = 4.5 MN ≈ 459 T
    const t = estimateForgingTonnage({ projectedAreaCm2: 100, alloyFamily: 'carbon-steel', shapeComplexity: 'moderate' });
    expect(t).toBeGreaterThan(300);
    expect(t).toBeLessThan(600);
  });
});

// ─── F-H3: parametric die cost ────────────────────────────────────────────────

describe('F-H3 — parametric die-cost estimator', () => {
  it('breakdown sums to total and rises with area, impressions and steel grade', () => {
    const r = estimateForgingDieCost({ projectedAreaCm2: 80, partWeightKg: 1.5, dieSteel: 'h13', impressions: 2, complexity: 'moderate' });
    expect(Math.abs(r.total - (r.block + r.machining + r.heatTreat + r.polish))).toBeLessThanOrEqual(2);

    const small = estimateForgingDieCost({ projectedAreaCm2: 40, partWeightKg: 1, impressions: 2 }).total;
    const large = estimateForgingDieCost({ projectedAreaCm2: 400, partWeightKg: 1, impressions: 2 }).total;
    expect(large).toBeGreaterThan(small);

    const oneImp = estimateForgingDieCost({ projectedAreaCm2: 80, partWeightKg: 1, impressions: 1 }).total;
    const threeImp = estimateForgingDieCost({ projectedAreaCm2: 80, partWeightKg: 1, impressions: 3 }).total;
    expect(threeImp).toBeGreaterThan(oneImp);

    const h13 = estimateForgingDieCost({ projectedAreaCm2: 80, partWeightKg: 1, dieSteel: 'h13' }).total;
    const premium = estimateForgingDieCost({ projectedAreaCm2: 80, partWeightKg: 1, dieSteel: 'premium' }).total;
    expect(premium).toBeGreaterThan(h13);
  });

  it('die-steel factors ordered hammer < h13 < premium', () => {
    expect(dieSteelFactor('hammer')).toBeLessThan(dieSteelFactor('h13'));
    expect(dieSteelFactor('h13')).toBeLessThan(dieSteelFactor('premium'));
    expect(dieSteelFactor(undefined)).toBe(dieSteelFactor('h13'));
  });

  it('engine estimates die cost when dieCost is omitted and honours a manual figure', () => {
    const estimated = computeForgingDrivers({ ...BASE, dieCost: undefined, projectedAreaCm2: 120, dieImpressions: 2, dieComplexity: 'moderate' });
    const manual = computeForgingDrivers({ ...BASE, dieCost: 80000 });
    expect(estimated.tooling.totalToolingCost).toBeGreaterThan(0);
    expect(estimated.tooling.totalToolingCost).not.toBeCloseTo(manual.tooling.totalToolingCost, 0);
  });
});

// ─── F-H4: family-aware metal pricing ─────────────────────────────────────────

describe('F-H4 — exchange vs mill metal pricing', () => {
  it('classifies metals into exchange-traded vs mill steel', () => {
    expect(classifyMaterialFamily({ id: 'mat-inconel718-forge', category: 'Nickel Superalloy Billet' })).toBe('exchangeMetal');
    expect(classifyMaterialFamily({ id: 'mat-ti-6al4v-forge', category: 'Titanium Forging Billet' })).toBe('exchangeMetal');
    expect(classifyMaterialFamily({ id: 'mat-al7050-forge', category: 'Aluminium Forging Billet' })).toBe('exchangeMetal');
    expect(classifyMaterialFamily({ id: 'mat-mg-az31-forge', category: 'Magnesium Forging Billet' })).toBe('exchangeMetal');
    expect(classifyMaterialFamily({ id: 'mat-steel4340', category: 'Alloy Steel Billet' })).toBe('millSteel');
    expect(classifyMaterialFamily({ id: 'mat-ss316l-bar', category: 'Stainless Steel Billet' })).toBe('millSteel');
  });

  it('exchange-traded alloys stay near-flat by country; mill steel spreads wider', () => {
    const cn = buildRegionalLibrary(lib, 'CN');
    const inconelRatio = matPrice(cn, 'mat-inconel718-forge') / matPrice(lib, 'mat-inconel718-forge');
    const steelRatio = matPrice(cn, 'mat-steel4340') / matPrice(lib, 'mat-steel4340');
    expect(inconelRatio).toBeGreaterThan(0.95);   // global nickel market ~flat
    expect(steelRatio).toBeLessThan(inconelRatio); // mill steel discounts more in CN
    expect(steelRatio).toBeCloseTo(0.88, 2);       // CN materialMultiplier
  });

  it('UK metal prices are unchanged (identity)', () => {
    const uk = buildRegionalLibrary(lib, 'UK');
    for (const id of ['mat-steel4340', 'mat-inconel718-forge', 'mat-ti-6al4v-forge']) {
      expect(matPrice(uk, id)).toBeCloseTo(matPrice(lib, id), 6);
    }
  });
});

// ─── F-H1 / F-M1 / F-M2: library additions ────────────────────────────────────

describe('F-H1 — forge machine tonnage ladder', () => {
  it('adds presses, screw, upsetter, hammers and a ring mill', () => {
    for (const id of ['forge-press-1600t', 'forge-press-2500t', 'forge-press-4000t', 'forge-press-8000t',
      'forge-screw-1000t', 'forge-upsetter-1000t', 'forge-hammer-2t', 'forge-hammer-10t', 'forge-ring-mill']) {
      expect(lib.machines.find(m => m.id === id)).toBeTruthy();
    }
    const rate = (id: string) => lib.machines.find(m => m.id === id)!.computedRatePerHr;
    expect(rate('forge-press-500t')).toBeLessThan(rate('forge-press-1600t'));
    expect(rate('forge-press-4000t')).toBeLessThan(rate('forge-press-8000t'));
  });
});

describe('F-M1 — missing forging billets', () => {
  it('adds superalloys, titanium, aluminium and magnesium grades', () => {
    for (const id of ['mat-inconel625-forge', 'mat-hastelloy-c276-forge', 'mat-monel400-forge',
      'mat-ti-6242-forge', 'mat-al7050-forge', 'mat-mg-az31-forge']) {
      const m = lib.materials.find(x => x.id === id)!;
      expect(m).toBeTruthy();
      expect(m.pricePerKg).toBeGreaterThan(0);
      expect(m.effectiveDate).toBe('2026-07');
    }
    // Hastelloy C-276 (high Mo/Ni) dearer than Monel 400 (Ni-Cu)
    expect(matPrice(lib, 'mat-hastelloy-c276-forge')).toBeGreaterThan(matPrice(lib, 'mat-monel400-forge'));
  });
});

describe('F-M2 — forge/furnace labour categories', () => {
  it('adds UK forge and furnace operator rows', () => {
    expect(lib.labour.find(l => l.id === 'lab-uk-forge')).toBeTruthy();
    expect(lib.labour.find(l => l.id === 'lab-uk-furnace')).toBeTruthy();
  });
});

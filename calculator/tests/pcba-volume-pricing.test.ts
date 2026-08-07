/**
 * Component price vs annual volume.
 *
 * The PCBA module used `unitPriceGBP` verbatim and applied `amortizationVolume`
 * to tooling ONLY. On a board where components are ~70% of cost, that meant the
 * single biggest commercial lever in automotive moved GBP 0.08 of tooling and
 * nothing else: a 150,000/yr and a 200,000/yr costing of the same ECU came out
 * within pennies of each other on a GBP 115 part.
 *
 * The decay is fitted to a real published distributor ladder, not invented —
 * see PRICE_DECAY_PER_DECADE.
 */
import { describe, it, expect } from 'vitest';
import {
  computePCBADrivers, bomVolumePriceFactor,
  PRICE_DECAY_PER_DECADE, PRICE_SATURATION_QTY,
} from '../src/engine/modules/pcba.js';
import type { PCBAInputs, BOMLine } from '../src/engine/modules/pcba.js';

/** The onsemi NCV8461DR2G ladder the decay was fitted to (USD, Aug 2026). */
const NCV8461 = [[1, 1.4420], [10, 1.2970], [25, 1.2230], [100, 0.9780],
                 [250, 0.8570], [500, 0.8320], [1000, 0.6610]] as const;

const line = (over: Partial<BOMLine> = {}): BOMLine => ({
  refDes: 'U1', componentType: 'ic_soic', description: 'part',
  qty: 1, unitPriceGBP: 1.00, moq: 1, ...over,
});

const BASE: PCBAInputs = {
  pcbCostPerBoard: 20, bom: [], smtMachineId: 'smt-high-speed-line',
  smtLabourId: 'lab-uk-semiskilled', smtLines: 1, smtLineRatePerHr: 0, smtOee: 0.82,
  throughHoleCount: 0, manualSolderCount: 0, thLabourId: 'lab-uk-semiskilled',
  thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20,
  assemblyYield: 1, reworkCostPerFailure: 0, amortizationVolume: 200_000,
};
const material = (i: PCBAInputs) => computePCBADrivers(i).rawMaterial.directCost! - i.pcbCostPerBoard;

describe('the fitted decay matches the ladder it came from', () => {
  it('lands within 2% at the 1,000 break — the point extrapolation starts from', () => {
    // This is the assertion that matters. Every merchant line in a costing is
    // anchored at a published break and extrapolated UP from there, so the fit
    // at that anchor is what propagates into the answer.
    const [, p1] = NCV8461[0];
    const modelled = p1 * bomVolumePriceFactor(1, 1_000);
    expect(Math.abs(modelled - 0.6610) / 0.6610).toBeLessThan(0.02);
  });

  it('tracks the ladder monotonically, with the residual a single slope cannot remove', () => {
    // A real ladder is a step function with a sharp drop at 500 -> 1,000
    // ($0.832 -> $0.661, 20% in one step). One log-log slope cannot reproduce
    // that, and the mid-ladder residual reaches ~17% at qty 25. It does not
    // matter here because nothing is ever extrapolated from the middle — but
    // pretending the fit is tighter than it is would be worse than saying so.
    const [, p1] = NCV8461[0];
    let prev = Infinity;
    for (const [qty, published] of NCV8461) {
      const modelled = p1 * bomVolumePriceFactor(1, qty);
      expect(modelled, `qty ${qty} must fall`).toBeLessThanOrEqual(prev);
      prev = modelled;
      expect(Math.abs(modelled - published) / published, `qty ${qty}`).toBeLessThan(0.20);
    }
  });

  it('is a 22.5% drop per 10x, the least-squares slope of that ladder', () => {
    expect(bomVolumePriceFactor(1_000, 10_000)).toBeCloseTo(PRICE_DECAY_PER_DECADE, 6);
    expect(PRICE_DECAY_PER_DECADE).toBeCloseTo(0.775, 3);
  });
});

describe('extrapolation behaviour', () => {
  it('discounts 1k -> 200k by ~44%, not by 90%', () => {
    const f = bomVolumePriceFactor(1_000, 200_000);
    expect(f).toBeGreaterThan(0.50);
    expect(f).toBeLessThan(0.60);
  });

  it('saturates on absolute volume — real prices approach die+test+package', () => {
    // A naive log-linear curve would price a part at nothing by 100 million.
    // Saturation is expressed as a quantity, not as a floor on the factor: a
    // factor floor binds after only three decades and corrupts the fit at the
    // anchor, which is how the first version of this got it wrong.
    const atSaturation = bomVolumePriceFactor(1_000, PRICE_SATURATION_QTY);
    expect(bomVolumePriceFactor(1_000, 100_000_000)).toBeCloseTo(atSaturation, 10);
    expect(atSaturation).toBeGreaterThan(0.4);
  });

  it('does not saturate before the programme volumes that matter', () => {
    // 200k must sit on the live part of the curve, not against the cap.
    expect(bomVolumePriceFactor(1_000, 200_000))
      .toBeGreaterThan(bomVolumePriceFactor(1_000, PRICE_SATURATION_QTY));
  });

  it('charges a premium BELOW the quoted quantity, and does not floor that side', () => {
    // Building 100 when the price was quoted at 10,000 genuinely costs more.
    const f = bomVolumePriceFactor(10_000, 100);
    expect(f).toBeGreaterThan(1.5);
  });

  it('is neutral when the price is already stated at programme volume', () => {
    expect(bomVolumePriceFactor(200_000, 200_000)).toBe(1);
  });

  it('is neutral when the reference is already past saturation', () => {
    expect(bomVolumePriceFactor(600_000, 800_000)).toBe(1);
  });

  it('rejects nonsense quantities instead of returning NaN', () => {
    expect(bomVolumePriceFactor(0, 200_000)).toBe(1);
    expect(bomVolumePriceFactor(1_000, 0)).toBe(1);
    expect(Number.isFinite(bomVolumePriceFactor(-5, 200_000))).toBe(true);
  });
});

describe('the module applies it — annual volume now moves the BOM', () => {
  const bom = [line({ unitPriceGBP: 10, priceRefQty: 1_000 })];

  it('a 200k build costs less per part than a 10k build', () => {
    const at10k = material({ ...BASE, bom, amortizationVolume: 10_000 });
    const at200k = material({ ...BASE, bom, amortizationVolume: 200_000 });
    expect(at200k).toBeLessThan(at10k);
  });

  it('150k -> 200k moves the BOM by more than pennies', () => {
    // This is the defect: before the fix these two were IDENTICAL, and the only
    // volume effect anywhere was tooling amortisation.
    const at150k = material({ ...BASE, bom, amortizationVolume: 150_000 });
    const at200k = material({ ...BASE, bom, amortizationVolume: 200_000 });
    expect(at150k - at200k).toBeGreaterThan(0.05);
  });

  it('honours a per-line reference quantity over the input default', () => {
    const mixed = [
      line({ refDes: 'A', unitPriceGBP: 10, priceRefQty: 1_000 }),      // scaled
      line({ refDes: 'B', unitPriceGBP: 10, priceRefQty: 200_000 }),    // already at volume
    ];
    const cost = material({ ...BASE, bom: mixed, bomPriceRefQty: 1_000 });
    const expected = 10 * bomVolumePriceFactor(1_000, 200_000) + 10;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it('falls back to bomPriceRefQty when a line does not state one', () => {
    const cost = material({ ...BASE, bom: [line({ unitPriceGBP: 10 })], bomPriceRefQty: 1_000 });
    expect(cost).toBeCloseTo(10 * bomVolumePriceFactor(1_000, 200_000), 6);
  });

  it('leaves prices alone when no reference quantity is given at all', () => {
    // Backwards compatible: an existing costing that never stated a basis keeps
    // treating its prices as already at programme volume.
    expect(material({ ...BASE, bom: [line({ unitPriceGBP: 10 })] })).toBeCloseTo(10, 6);
  });
});

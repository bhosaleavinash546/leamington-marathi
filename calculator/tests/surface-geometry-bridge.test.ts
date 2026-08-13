/**
 * The geometry bridge, pinned against the source workbook.
 *
 * Sheet 04 of the Surface Treatment & Coating Should-Cost Model is the tab its
 * author calls "arithmetically incontestable", and it is the one piece of that
 * workbook we adopt wholesale. These reproduce its three reference forms to the
 * digit, so a future edit to a density, a thickness or a shape factor cannot
 * quietly move the largest driver in the commodity.
 */
import { describe, it, expect } from 'vitest';
import {
  PRODUCT_FORMS, findProductForm, flatPlateAreaM2PerKg, specificSurfaceAreaM2PerKg,
  coatedArea, areaIndex, SHAPE_FACTOR_TOLERANCE,
} from '../src/engine/surface-geometry-bridge.js';

describe('the bridge reproduces workbook sheet 04', () => {
  // Workbook cell G6 / G9 / G13 — the three REFERENCE forms the rate card uses.
  const WORKBOOK = {
    sheet_standard: 0.195329087048832,
    cast_hpdc: 0.264550264550265,
    forge_standard: 0.023354564755839,
  };

  for (const [key, expected] of Object.entries(WORKBOOK)) {
    it(`${key} = ${expected.toFixed(6)} m²/kg`, () => {
      const got = specificSurfaceAreaM2PerKg(findProductForm(key)!);
      expect(Math.abs(got - expected) / expected).toBeLessThan(0.001);   // <0.1%
    });
  }

  it('the formula is both faces of a plate over its mass, nothing more', () => {
    // 2000 / (t_mm x rho) — check it against the definition rather than itself.
    const t = 1.5, rho = 7850;
    const areaM2PerKgOfPlate = 2 / ((t / 1000) * rho);
    expect(flatPlateAreaM2PerKg(t, rho)).toBeCloseTo(areaM2PerKgOfPlate, 12);
  });

  it('a stamping carries ~8.4x the coated area per kg of a forging', () => {
    // The workbook's headline claim, computed rather than asserted.
    expect(areaIndex('sheet_standard')).toBeCloseTo(8.36, 1);
  });

  it('and an aluminium die casting ~11.3x', () => {
    expect(areaIndex('cast_hpdc')).toBeCloseTo(11.33, 1);
  });

  it('thinning a wall RAISES coated area per kg — the counter-intuitive result', () => {
    // Lightweighting increases coating cost per kilogram even as part cost falls.
    const thin = specificSurfaceAreaM2PerKg(PRODUCT_FORMS.sheet_thin);
    const std = specificSurfaceAreaM2PerKg(PRODUCT_FORMS.sheet_standard);
    const heavy = specificSurfaceAreaM2PerKg(PRODUCT_FORMS.sheet_heavy);
    expect(thin).toBeGreaterThan(std);
    expect(std).toBeGreaterThan(heavy);
    // 0.8 mm against 3.0 mm is a clean 3.75x — it is pure inverse thickness.
    expect(thin / heavy).toBeCloseTo(3.0 / 0.8, 6);
  });
});

describe('measured CAD area is ground truth; the bridge is the fallback', () => {
  it('a measured area is used verbatim and says so', () => {
    const r = coatedArea({ measuredAreaM2: 0.2344, massKg: 1.2, form: 'sheet_standard' });
    expect(r.areaM2).toBe(0.2344);
    expect(r.source).toBe('measured');
    expect(r.basis).toMatch(/MEASURED/);
  });

  it('with a mass too, it reports the shape factor the measurement implies', () => {
    // A part that measures exactly the reference form should imply ~1.15.
    const form = PRODUCT_FORMS.sheet_standard;
    const mass = 1.2;
    const area = specificSurfaceAreaM2PerKg(form) * mass;
    const r = coatedArea({ measuredAreaM2: area, massKg: mass, form: 'sheet_standard' });
    expect(r.impliedShapeFactor).toBeCloseTo(1.15, 6);
    expect(r.warning).toBeNull();
  });

  it('and warns when the part is nothing like its reference form', () => {
    // Twice the area a 1.5 mm pressing of this mass should have: a deeply
    // ribbed or louvred part. The measurement still wins — the warning is that
    // a mass-based estimate of a SIMILAR part would be badly wrong.
    const mass = 1.2;
    const area = specificSurfaceAreaM2PerKg(PRODUCT_FORMS.sheet_standard) * mass * 2;
    const r = coatedArea({ measuredAreaM2: area, massKg: mass, form: 'sheet_standard' });
    expect(r.areaM2).toBe(area);                       // still used
    expect(r.impliedShapeFactor).toBeCloseTo(2.30, 2);
    expect(r.warning).toMatch(/not typical of its form/i);
  });

  it('without CAD it bridges from mass, and labels the estimate', () => {
    const r = coatedArea({ massKg: 1.2, form: 'sheet_standard' });
    expect(r.source).toBe('bridge');
    expect(r.areaM2).toBeCloseTo(0.195329087048832 * 1.2, 9);
    expect(r.basis).toMatch(/ESTIMATED from mass/);
    expect(r.warning).toMatch(/largest single driver/i);
  });

  it('a part-specific wall thickness overrides the form default', () => {
    const std = coatedArea({ massKg: 1.0, form: 'sheet_standard' });
    const thin = coatedArea({ massKg: 1.0, form: 'sheet_standard', thicknessMm: 0.75 });
    // Half the thickness, twice the area per kg.
    expect(thin.areaM2 / std.areaM2).toBeCloseTo(2, 6);
  });
});

describe('it refuses to invent the number rather than defaulting it', () => {
  it('no area and no form throws', () => {
    expect(() => coatedArea({ massKg: 1.2 })).toThrow(/measured area .*or a product form/i);
  });

  it('a form with no mass throws', () => {
    expect(() => coatedArea({ form: 'sheet_standard' })).toThrow(/positive part mass/i);
  });

  it('an unknown form throws rather than falling back to a default shape', () => {
    expect(() => coatedArea({ massKg: 1, form: 'sheet_medium' }))
      .toThrow(/No product form/);
  });

  it('every form carries provenance on its shape factor', () => {
    for (const [key, f] of Object.entries(PRODUCT_FORMS)) {
      expect(f.shapeFactor.source, key).toBeTruthy();
      expect(f.shapeFactor.recordedAt, key).toBeTruthy();
      expect(f.shapeFactor.status, key).toBe('unverified');
    }
  });

  it('the tolerance is a stated constant, not a magic number', () => {
    expect(SHAPE_FACTOR_TOLERANCE).toBeGreaterThan(0);
    expect(SHAPE_FACTOR_TOLERANCE).toBeLessThan(1);
  });
});

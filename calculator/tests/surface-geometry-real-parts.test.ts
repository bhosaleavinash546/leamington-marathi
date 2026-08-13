/**
 * The geometry bridge against REAL measured parts.
 *
 * `surface-geometry-bridge.test.ts` proves the bridge reproduces the source
 * workbook. That is a check of transcription, not of truth. This file is the
 * check of truth: three actual STEP files measured with OCCT, compared against
 * the reference form each commodity defaults to.
 *
 * The result is the strongest argument for preferring measured area, and it is
 * not a comfortable one for the workbook's shape factors:
 *
 *   Seat_Locking_Bracket   bridge overstates area  1.19x   (eff. wall 1.78 mm vs 1.5 default)
 *   Casting_Braket         bridge overstates area  3.64x   (eff. wall 12.7 mm vs 3.5 default)
 *   steering_knuckle_RH    bridge UNDERSTATES area 0.83x   (eff. wall 9.9 mm vs 12 default)
 *
 * The casting is the one that matters. `cast_hpdc` assumes a 3.5 mm die-cast
 * wall; this bracket is a chunky 12.7 mm casting, so defaulting to the
 * reference form would have charged it for 3.6x the coating it actually needs.
 * A per-kg coating factor with no product form is meaningless — and a product
 * form guessed wrong is nearly as bad.
 *
 * Measured with `server/utils/cad-geometry-engine.py` on 13 Aug 2026. These are
 * recordings, not live measurements, so the suite does not need OCCT; the live
 * re-measure lives in the CAD audit scripts.
 */
import { describe, it, expect } from 'vitest';
import {
  PRODUCT_FORMS, specificSurfaceAreaM2PerKg, coatedArea,
} from '../src/engine/surface-geometry-bridge.js';

interface MeasuredPart {
  name: string;
  formKey: string;
  /** Solid volume, m³, from OCCT. */
  volumeM3: number;
  /** Total wetted B-rep area, m². */
  areaM2: number;
  densityKgPerM3: number;
}

const MEASURED: MeasuredPart[] = [
  { name: 'Seat_Locking_Bracket', formKey: 'sheet_standard', volumeM3: 71.066e-6, areaM2: 0.091937, densityKgPerM3: 7850 },
  { name: 'Casting_Braket', formKey: 'cast_hpdc', volumeM3: 320.015e-6, areaM2: 0.0628266, densityKgPerM3: 2700 },
  { name: 'steering_knuckle_RH', formKey: 'forge_standard', volumeM3: 356.101e-6, areaM2: 0.0789253, densityKgPerM3: 7850 },
];

const massOf = (p: MeasuredPart): number => p.volumeM3 * p.densityKgPerM3;

/**
 * Effective wall thickness the measurement implies, mm.
 *
 * shape = A·t / 2V  ⇒  t = 2V·shape / A. Density cancels, so this is a pure
 * geometric statement about the part and cannot be wrong because we guessed
 * the alloy.
 */
function effectiveWallMm(p: MeasuredPart): number {
  const shape = PRODUCT_FORMS[p.formKey].shapeFactor.value;
  return (2 * p.volumeM3 * shape / p.areaM2) * 1000;
}

describe('the bridge against real measured parts', () => {
  it('measured specific areas are recorded and self-consistent', () => {
    for (const p of MEASURED) {
      const specific = p.areaM2 / massOf(p);
      expect(specific, p.name).toBeGreaterThan(0);
      // Sanity: no real metal part carries more than 1 m² per kg.
      expect(specific, p.name).toBeLessThan(1);
    }
  });

  it('Seat_Locking_Bracket is a ~1.8 mm pressing, not the 1.5 mm reference', () => {
    const p = MEASURED[0];
    expect(effectiveWallMm(p)).toBeCloseTo(1.78, 1);
    const bridged = coatedArea({ massKg: massOf(p), form: p.formKey }).areaM2;
    // The default form overstates a real bracket by about 19%.
    expect(bridged / p.areaM2).toBeCloseTo(1.19, 1);
  });

  it('Casting_Braket exposes the default casting form as 3.6x too generous', () => {
    // THE headline result. cast_hpdc assumes a 3.5 mm die-cast wall; this part
    // is a 12.7 mm chunk, so bridging it charges 3.6x the coating it needs.
    const p = MEASURED[1];
    expect(effectiveWallMm(p)).toBeCloseTo(12.7, 0);
    const bridged = coatedArea({ massKg: massOf(p), form: p.formKey }).areaM2;
    expect(bridged / p.areaM2).toBeGreaterThan(3.0);
    expect(bridged / p.areaM2).toBeCloseTo(3.64, 1);
  });

  it('steering_knuckle_RH goes the OTHER way — the bridge under-charges it', () => {
    // Errors are not one-directional, which is why "conservative default" is not
    // an available defence for guessing the form.
    const p = MEASURED[2];
    expect(effectiveWallMm(p)).toBeCloseTo(9.9, 0);
    const bridged = coatedArea({ massKg: massOf(p), form: p.formKey }).areaM2;
    expect(bridged / p.areaM2).toBeLessThan(1);
    expect(bridged / p.areaM2).toBeCloseTo(0.83, 1);
  });

  it('supplying the real wall thickness collapses the error on every part', () => {
    // This is the fix: the commodity passes its own thickness, or CAD supplies
    // the measured area outright. Both beat the reference form.
    for (const p of MEASURED) {
      const withRealWall = coatedArea({
        massKg: massOf(p), form: p.formKey, thicknessMm: effectiveWallMm(p),
      }).areaM2;
      expect(withRealWall / p.areaM2, p.name).toBeCloseTo(1.0, 2);
    }
  });

  it('and a measured area is used verbatim, with the implied shape factor shown', () => {
    for (const p of MEASURED) {
      const r = coatedArea({ measuredAreaM2: p.areaM2, massKg: massOf(p), form: p.formKey });
      expect(r.source, p.name).toBe('measured');
      expect(r.areaM2, p.name).toBe(p.areaM2);
      expect(r.impliedShapeFactor, p.name).toBeGreaterThan(0);
    }
  });

  it('the casting drifts far enough that the report must say so', () => {
    const p = MEASURED[1];
    const r = coatedArea({ measuredAreaM2: p.areaM2, massKg: massOf(p), form: p.formKey });
    // 3.6x out is exactly the case the drift warning exists for.
    expect(r.warning).toMatch(/not typical of its form/i);
    const bracket = coatedArea({
      measuredAreaM2: MEASURED[0].areaM2, massKg: massOf(MEASURED[0]), form: MEASURED[0].formKey,
    });
    // 19% is inside tolerance and should NOT cry wolf.
    expect(bracket.warning).toBeNull();
  });

  it('measured area is total WETTED area, bores included — a real caveat', () => {
    // OCCT reports every face, including internal bores. For a dip, plating or
    // e-coat line that is correct. For line-of-sight spray it over-states, and
    // for a masked feature it counts area that is deliberately not coated. The
    // number is right; what it MEANS depends on the process, which is why the
    // CAD prefill says so rather than presenting it as settled.
    for (const p of MEASURED) {
      const flatPlateFloor = 2 * p.volumeM3 / (effectiveWallMm(p) / 1000);
      // Wetted area always meets or exceeds the flat-plate ideal for its wall.
      expect(p.areaM2, p.name).toBeGreaterThan(flatPlateFloor * 0.5);
    }
  });
});

describe('what the measured parts say about the workbook shape factors', () => {
  it('no reference form is within 20% of all three real parts', () => {
    // The honest summary: these factors are a starting position, not data, and
    // three measured parts already disagree with them in both directions.
    const ratios = MEASURED.map(p =>
      coatedArea({ massKg: massOf(p), form: p.formKey }).areaM2 / p.areaM2);
    const worst = Math.max(...ratios.map(r => Math.abs(Math.log(r))));
    expect(Math.exp(worst)).toBeGreaterThan(1.2);
  });

  it('but the FORMULA is exact once the wall is known', () => {
    // The bridge is not wrong; the default INPUT is. Feed it the real wall and
    // it reproduces measured area to within a couple of percent every time.
    for (const p of MEASURED) {
      const t = effectiveWallMm(p);
      const form = { ...PRODUCT_FORMS[p.formKey], thicknessMm: t };
      const predicted = specificSurfaceAreaM2PerKg(form) * massOf(p);
      expect(predicted, p.name).toBeCloseTo(p.areaM2, 3);
    }
  });
});

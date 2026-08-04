/**
 * Thermodynamic cooling (Step 1) + governing wall (Step 2).
 *
 * Step 1 — `thermodynamicCoolFactor` evaluates the closed-form transient
 * conduction solution t = wall²/(π²·α)·ln[(4/π)(Tm−Tw)/(Te−Tw)] with α_eff
 * calibrated so the reference temperatures reproduce the curated industry
 * factor EXACTLY. So at defaults the switch changes provenance, not price —
 * and that identity is the contract these tests pin.
 *
 * Step 2 — `governingWallMm` prefers the 95th-percentile ray-cast wall over
 * the mean (the thickest section ejects last), capped at 2× mean, and falls
 * back to the corrected mean when the thin-shell 2·V/S correction fired.
 */
import { describe, it, expect } from 'vitest';
import {
  thermodynamicCoolFactor,
  autoCoolFactorForMaterial,
} from '../src/engine/modules/injection-moulding.js';
import { governingWallMm } from '../src/engine/cost-input-rules/derive/envelope.js';
import { applyShellWallCorrection } from '../src/engine/geometry-sanity.js';

describe('thermodynamicCoolFactor — closed-form transient conduction', () => {
  it('reproduces the curated factor exactly at reference temperatures (calibration identity)', () => {
    for (const id of ['mat-pp-impact', 'mat-hdpe', 'mat-abs', 'mat-pc', 'mat-pa6-gf30']) {
      const t = thermodynamicCoolFactor(id);
      expect(t, id).not.toBeNull();
      expect(t!.factorSPerMm2, id).toBeCloseTo(autoCoolFactorForMaterial(id), 2);
      expect(t!.clamped, id).toBe(false);
      expect(t!.alphaEffMm2S, id).toBeGreaterThan(0);
    }
  });

  it('a hotter mould lengthens cooling, along the physical law (PP, 40 → 60 °C)', () => {
    const ref = thermodynamicCoolFactor('mat-pp-impact')!;
    const hot = thermodynamicCoolFactor('mat-pp-impact', { mouldC: 60 })!;
    expect(hot.factorSPerMm2).toBeGreaterThan(ref.factorSPerMm2);
    // Hand calc: α_eff = ln[(4/π)(190/45)]/(π²·3.16) = 1.6817/31.188 = 0.05392 mm²/s;
    // at Tw=60: ln[(4/π)(170/25)]/(π²·0.05392) = 2.1585/0.53222 = 4.056
    expect(hot.factorSPerMm2).toBeCloseTo(4.06, 2);
  });

  it('a colder mould shortens cooling (HDPE, 30 → 15 °C)', () => {
    const ref = thermodynamicCoolFactor('mat-hdpe')!;
    const cold = thermodynamicCoolFactor('mat-hdpe', { mouldC: 15 })!;
    expect(cold.factorSPerMm2).toBeLessThan(ref.factorSPerMm2);
  });

  it('clamps a pathological temperature pair to 2x the curated factor and says so', () => {
    // Mould 1 °C below eject → the log term explodes; the sanity bound holds it.
    const t = thermodynamicCoolFactor('mat-pp-impact', { mouldC: 84 })!;
    expect(t.factorSPerMm2).toBeCloseTo(2 * t.curatedFactorSPerMm2, 2);
    expect(t.clamped).toBe(true);
  });

  it('returns null for a resin with no thermal reference, and for impossible temps', () => {
    expect(thermodynamicCoolFactor('mat-al6082-bar')).toBeNull();          // not a resin
    expect(thermodynamicCoolFactor('')).toBeNull();
    expect(thermodynamicCoolFactor('mat-pp-impact', { mouldC: 90 })).toBeNull(); // mould above eject
  });
});

describe('governingWallMm — the thickest section governs cooling', () => {
  const wt = (over: Record<string, unknown>) => ({
    minMm: 1.8, maxMm: 6.0, meanMm: 2.5, stdDevMm: 0.8, p95Mm: 4.0,
    sampleCount: 20, method: 'ray_cast' as const, uniformity: 'moderate',
    ...over,
  });

  it('prefers the 95th-percentile wall over the mean', () => {
    const g = governingWallMm(wt({}))!;
    expect(g.mm).toBe(4.0);
    expect(g.basis).toContain('95th-percentile');
    expect(g.basis).toContain('mean 2.5 mm');
  });

  it('caps p95 at 2x mean so a boss/rib outlier stays a local feature', () => {
    const g = governingWallMm(wt({ p95Mm: 8.0 }))!;
    expect(g.mm).toBe(5.0);
    expect(g.basis).toContain('capped at 2x mean');
  });

  it('falls back to the mean when p95 is absent or not above it', () => {
    expect(governingWallMm(wt({ p95Mm: null }))!.mm).toBe(2.5);
    expect(governingWallMm(wt({ p95Mm: 2.5 }))!.mm).toBe(2.5);
  });

  it('uses the corrected mean after the thin-shell 2·V/S correction (p95 measured cavity depth)', () => {
    // A bumper-like shell: ray-cast mean 27 mm across a ~2.5 mm skin.
    const geo = {
      wallThickness: wt({ meanMm: 27.1, p95Mm: 41.0 }),
      volume: { cm3: 1000 }, surfaceArea: { cm2: 8000 }, fillRatio: 0.01,
    };
    const wc = applyShellWallCorrection(geo);
    expect(wc).not.toBeNull();
    expect(geo.wallThickness.p95Mm).toBeNull();       // dropped at the boundary
    const g = governingWallMm(geo.wallThickness)!;
    expect(g.mm).toBeCloseTo(2.5, 1);                 // 2·V/S = 2·1000/8000 cm = 2.5 mm
    expect(g.basis).toContain('2·V/S');
  });

  it('returns null when no wall was measured', () => {
    expect(governingWallMm(null)).toBeNull();
    expect(governingWallMm(wt({ meanMm: 0 }))).toBeNull();
  });
});

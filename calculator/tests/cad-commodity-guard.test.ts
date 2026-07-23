import { describe, it, expect } from 'vitest';
import { enforceGeometryCommodity } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

// Minimal geometry factory — only the fields the guard reads.
function geo(over: Partial<OCCTGeometry> & {
  fillRatio?: number; maxDimMm?: number; wallMm?: number | null;
}): OCCTGeometry {
  const { fillRatio = 0.5, maxDimMm = 500, wallMm = null, ...rest } = over;
  return {
    status: 'success',
    boundingBox: { xMm: maxDimMm, yMm: maxDimMm * 0.4, zMm: maxDimMm * 0.35 },
    fillRatio,
    wallThickness: wallMm == null ? undefined
      : { minMm: wallMm, maxMm: wallMm, meanMm: wallMm, stdDevMm: 0, sampleCount: 20, method: 'ray_cast', uniformity: 'uniform' },
    ...rest,
  } as unknown as OCCTGeometry;
}

describe('enforceGeometryCommodity — the blow-moulded fuel tank bug', () => {
  it('overrides CASTING to blow_moulding for a large enclosed hollow shell (the fuel tank)', () => {
    // Real measured values from Fuel_tank.STEP: fill 0.0178, wall 4.21 mm, 1528 mm long.
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.0178, wallMm: 4.21, maxDimMm: 1528 }));
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('blow_moulding');
    expect(r.reason).toMatch(/enclosed hollow/i);
  });

  it('also rescues forging, machining and cast_and_machine on the same geometry', () => {
    for (const c of ['forging', 'machining', 'cast_and_machine', 'biw_assembly']) {
      const r = enforceGeometryCommodity(c, geo({ fillRatio: 0.02, wallMm: 4, maxDimMm: 1200 }));
      expect(r.corrected).toBe(true);
      expect(r.commodity).toBe('blow_moulding');
    }
  });

  it('fires on fill alone even when wall thickness could not be measured', () => {
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.015, wallMm: null, maxDimMm: 900 }));
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('blow_moulding');
  });

  it('leaves a solid casting alone (chunky part, high fill)', () => {
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.62, wallMm: null, maxDimMm: 400 }));
    expect(r.corrected).toBe(false);
    expect(r.commodity).toBe('casting');
  });

  it('does NOT touch a thin-wall aluminium HPDC housing (open, moderate fill)', () => {
    // fill 0.08 is above the 0.03 enclosed-hollow gate → AI hint decides, no hard override.
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.08, wallMm: 3, maxDimMm: 350 }));
    expect(r.corrected).toBe(false);
  });

  it('leaves a small hollow part alone (below the size gate)', () => {
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.02, wallMm: 2, maxDimMm: 120 }));
    expect(r.corrected).toBe(false);
  });

  it('does not override a commodity that is already a moulding process', () => {
    const r = enforceGeometryCommodity('blow_moulding', geo({ fillRatio: 0.0178, wallMm: 4.21, maxDimMm: 1528 }));
    expect(r.corrected).toBe(false);
    expect(r.commodity).toBe('blow_moulding');
  });

  it('is a no-op when the geometry engine failed', () => {
    const r = enforceGeometryCommodity('casting', { status: 'error' } as OCCTGeometry);
    expect(r.corrected).toBe(false);
  });
});

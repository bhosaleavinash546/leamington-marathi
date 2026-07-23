import { describe, it, expect } from 'vitest';
import { enforceGeometryCommodity } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

// Minimal geometry factory — only the fields the guard reads.
function geo(over: Partial<OCCTGeometry> & {
  fillRatio?: number; maxDimMm?: number; wallMm?: number | null; sealedVoid?: boolean | null;
}): OCCTGeometry {
  const { fillRatio = 0.5, maxDimMm = 500, wallMm = null, sealedVoid = undefined, ...rest } = over;
  return {
    status: 'success',
    boundingBox: { xMm: maxDimMm, yMm: maxDimMm * 0.4, zMm: maxDimMm * 0.35 },
    fillRatio,
    topology: sealedVoid === undefined ? undefined
      : { available: true, shellCount: sealedVoid ? 2 : 1, voidCount: sealedVoid ? 1 : 0,
          enclosesSealedVoid: sealedVoid === true, openShell: sealedVoid === false },
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

describe('enforceGeometryCommodity — the fuel-tank↔bumper fix (open drape vs sealed void)', () => {
  // Real measured bumper: fill 0.0036, wall 2.53 mm, 1691 mm, 1 shell / 0 voids (open).
  const bumper = () => geo({ fillRatio: 0.0036, wallMm: 2.5, maxDimMm: 1691, sealedVoid: false });

  it('corrects blow_moulding → injection_moulding for a large OPEN thin-wall drape (the bumper)', () => {
    const r = enforceGeometryCommodity('blow_moulding', bumper());
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('injection_moulding');
    expect(r.reason).toMatch(/open thin-wall shell|sealed cavity/i);
  });

  it('also rescues rotational_moulding and a mis-called solid process on an open drape', () => {
    for (const c of ['rotational_moulding', 'casting', 'forging', 'machining']) {
      const r = enforceGeometryCommodity(c, bumper());
      expect(r.corrected).toBe(true);
      expect(r.commodity).toBe('injection_moulding');
    }
  });

  it('KEEPS blow_moulding when the shell ENCLOSES a sealed void (a real fuel tank)', () => {
    const r = enforceGeometryCommodity('blow_moulding', geo({ fillRatio: 0.0178, wallMm: 4.2, maxDimMm: 1528, sealedVoid: true }));
    expect(r.corrected).toBe(false);
    expect(r.commodity).toBe('blow_moulding');
  });

  it('routes a sealed-void hollow mis-called CASTING to blow_moulding (topology-confirmed tank)', () => {
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.0178, wallMm: 4.2, maxDimMm: 1528, sealedVoid: true }));
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('blow_moulding');
  });

  it('does NOT reclassify a chunky open part (fill too high for the thin-shell gate)', () => {
    const r = enforceGeometryCommodity('blow_moulding', geo({ fillRatio: 0.4, wallMm: 20, maxDimMm: 400, sealedVoid: false }));
    expect(r.corrected).toBe(false);
  });

  it('leaves injection_moulding itself untouched on an open drape (already correct)', () => {
    const r = enforceGeometryCommodity('injection_moulding', bumper());
    expect(r.corrected).toBe(false);
    expect(r.commodity).toBe('injection_moulding');
  });

  it('back-compat: unknown topology on a large thin shell still routes solid→blow', () => {
    const r = enforceGeometryCommodity('casting', geo({ fillRatio: 0.02, wallMm: 4, maxDimMm: 1200 }));
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('blow_moulding');
  });
});

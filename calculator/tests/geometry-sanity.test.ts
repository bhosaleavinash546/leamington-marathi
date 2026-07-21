import { describe, it, expect } from 'vitest';
import { correctShellWallMm, shellWallEstimateMm } from '../src/engine/geometry-sanity.js';

describe('shell wall-thickness correction', () => {
  it('recovers the ~2.5 mm wall of a bumper the ray-cast read as 27 mm', () => {
    // Real bumper: 2059.9 cm³, 16261.7 cm² surface, fill 0.0036, ray-cast 27.1 mm.
    const r = correctShellWallMm(27.1, 2059.9, 16261.7, 0.0036);
    expect(r.corrected).toBe(true);
    expect(r.method).toBe('volume_surface_shell');
    expect(r.meanMm).toBeGreaterThan(2);
    expect(r.meanMm).toBeLessThan(3);           // ~2.53 mm, not 27
  });

  it('shellWallEstimateMm = 2·V/S', () => {
    expect(shellWallEstimateMm(2059.9, 16261.7)).toBeCloseTo(2.53, 1);
  });

  it('does NOT rewrite a chunky solid (high fill ratio)', () => {
    // A knuckle-like part: fill 6% — not a thin shell, even if the estimate is smallish.
    const r = correctShellWallMm(18, 356, 700, 0.062);
    expect(r.corrected).toBe(false);
    expect(r.meanMm).toBe(18);
  });

  it('does NOT rewrite when the ray-cast is already plausible for the shell', () => {
    // Servo horn: fill 0.33, ray-cast 2.46 mm — sane, keep it.
    const r = correctShellWallMm(2.46, 1.19, 13.5, 0.33);
    expect(r.corrected).toBe(false);
    expect(r.meanMm).toBe(2.46);
  });

  it('fills in a shell wall when the ray-cast returned nothing', () => {
    const r = correctShellWallMm(null, 2059.9, 16261.7, 0.0036);
    expect(r.corrected).toBe(true);
    expect(r.meanMm).toBeGreaterThan(2);
  });
});

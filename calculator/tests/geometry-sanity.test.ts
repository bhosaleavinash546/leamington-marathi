import { describe, it, expect } from 'vitest';
import { correctShellWallMm, shellWallEstimateMm, estimatePackagingPerPart } from '../src/engine/geometry-sanity.js';
import { pickIMMPressId } from '../src/engine/modules/injection-moulding.js';

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

describe('size-aware packaging', () => {
  it('scales with the shipping envelope — bulky bumper >> tiny part', () => {
    // bumper bbox 1691×647×528 mm ≈ 577,700 cm³, 2.16 kg
    const bumper = estimatePackagingPerPart((1691 * 647 * 528) / 1000, 2.16);
    // servo horn bbox 47×10×7.5 mm ≈ 3.5 cm³, 3 g
    const horn = estimatePackagingPerPart((47 * 10 * 7.5) / 1000, 0.003);
    expect(bumper).toBeGreaterThan(0.7);   // bulky → real dunnage
    expect(bumper).toBeLessThan(1.5);
    expect(horn).toBeCloseTo(0.05, 2);     // trivial → floor
    expect(bumper).toBeGreaterThan(horn * 10);
  });

  it('is floored and capped to sane bounds', () => {
    expect(estimatePackagingPerPart(0, 0)).toBe(0.05);
    expect(estimatePackagingPerPart(1e12, 1e6)).toBe(6);
  });
});

describe('IM press sizing', () => {
  it('picks the smallest press that covers the clamp tonnage', () => {
    expect(pickIMMPressId(45)).toBe('imm-50t');
    expect(pickIMMPressId(180)).toBe('imm-200t');
    expect(pickIMMPressId(1100)).toBe('imm-1200t');
    expect(pickIMMPressId(1900)).toBe('imm-2000t');
    expect(pickIMMPressId(3900)).toBe('imm-3500t');   // bumper — biggest available
  });
});

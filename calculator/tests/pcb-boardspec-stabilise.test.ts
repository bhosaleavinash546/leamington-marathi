import { describe, it, expect } from 'vitest';
import {
  stabiliseBoardSpec, stableFabMid, standardLayers, deriveTechnology,
} from '../server/utils/pcb-boardspec-stabilise.js';

const area = (s: { widthMm?: unknown; heightMm?: unknown }) =>
  (Number(s.widthMm) * Number(s.heightMm)) / 100; // cm²

describe('stabiliseBoardSpec — deterministic fab drivers', () => {
  // The SAME board read two ways by the vision model (the real failure mode):
  const asm = { smtPlacements: 158, bgaCount: 1, throughHoleJoints: 0 };
  const runA = { widthMm: 160, heightMm: 110, estimatedLayers: 6, throughVias: 180,
    surfaceFinish: 'enig', hdiStructure: 'none', technologyType: 'FR4_STD', impedanceControlRequired: false, bgaDetected: true };
  const runB = { widthMm: 220, heightMm: 140, estimatedLayers: 6, throughVias: 400,
    surfaceFinish: 'enig', hdiStructure: 'none', technologyType: 'FR4_HTg', impedanceControlRequired: false, bgaDetected: true };

  it('keeps each plausible size read as it is (no pull toward a 1.6/cm² anchor)', () => {
    // Oct 2026: the old ±30–40% band around 1.6 placements/cm² made a 20×20 mm camera module
    // 59×59 mm. A size is now changed only when its density is not buildable or not credible.
    const a = { ...runA }, b = { ...runB };
    stabiliseBoardSpec(a, asm, 'automotive_adas');
    stabiliseBoardSpec(b, asm, 'automotive_adas');
    expect(area(a)).toBeCloseTo(176, -1);
    expect(area(b)).toBeCloseTo(308, -1);
  });

  it('keeps a dense 20×20 mm two-sided camera module (80 parts, ~10/cm² a side)', () => {
    const s = { widthMm: 20, heightMm: 20, estimatedLayers: 8, throughVias: 120, surfaceFinish: 'osp', hdiStructure: 'none' };
    stabiliseBoardSpec(s, { smtPlacements: 80, reflowSides: 2 }, 'general');
    expect([s.widthMm, s.heightMm]).toEqual([20, 20]);
  });

  it('moves an impossible size to the edge of the physical band', () => {
    const tiny = { widthMm: 10, heightMm: 10, estimatedLayers: 4, surfaceFinish: 'enig', hdiStructure: 'none' };   // 300 parts on 1 cm²
    stabiliseBoardSpec(tiny, { smtPlacements: 300, reflowSides: 1 }, 'general');
    expect(area(tiny)).toBeCloseTo(10, 0);                          // 300 / 30 per cm²
    const empty = { widthMm: 400, heightMm: 300, estimatedLayers: 4, surfaceFinish: 'enig', hdiStructure: 'none' };   // 20 parts on 1,200 cm²
    stabiliseBoardSpec(empty, { smtPlacements: 20, reflowSides: 1 }, 'general');
    expect(area(empty)).toBeCloseTo(50, 0);                         // 20 / 0.4 per cm²
  });

  it('derives the SAME technology + layers regardless of the model guess', () => {
    stabiliseBoardSpec(runA, asm, 'automotive_adas');
    stabiliseBoardSpec(runB, asm, 'automotive_adas');
    expect(runA.technologyType).toBe(runB.technologyType);
    expect(runA.technologyType).toBe('FR4_HTg');                  // 6-layer automotive BGA
    expect(runA.estimatedLayers).toBe(runB.estimatedLayers);
  });

  it('the fab follows the size it was given, deterministically', () => {
    const a1 = { ...runA }, a2 = { ...runA };
    stabiliseBoardSpec(a1, asm, 'automotive_adas'); stabiliseBoardSpec(a2, asm, 'automotive_adas');
    expect(stableFabMid(a1, asm, 10000, 'cn')).toBe(stableFabMid(a2, asm, 10000, 'cn'));
  });

  it('preserves a plausible board that is already in-band', () => {
    // 158 placements: any size between ~5 and ~395 cm² is buildable; a 100 cm² read is kept
    const s = { widthMm: 120, heightMm: 83, estimatedLayers: 4, throughVias: 200, surfaceFinish: 'enig', hdiStructure: 'none' };
    const before = area(s);
    stabiliseBoardSpec(s, asm, 'automotive_adas');
    expect(Math.abs(area(s) - before)).toBeLessThan(before * 0.1); // ~unchanged
  });
});

describe('standardLayers', () => {
  it('quantises to standard stack-ups and clamps 2..16', () => {
    expect(standardLayers(5)).toBe(4);
    expect(standardLayers(7)).toBe(6);
    expect(standardLayers(1)).toBe(2);
    expect(standardLayers(99)).toBe(16);
  });
});

describe('deriveTechnology', () => {
  it('picks HDI when microvias/blind structure/high layer count present', () => {
    expect(deriveTechnology(6, 12, 'none', false, true, true)).toBe('HDI_RIGID');
    expect(deriveTechnology(10, 0, 'none', false, false, false)).toBe('HDI_RIGID');
  });
  it('picks high-Tg for a 6-layer automotive / BGA board', () => {
    expect(deriveTechnology(6, 0, 'none', false, true, true)).toBe('FR4_HTg');
  });
  it('picks standard FR4 for a simple 2-layer board', () => {
    expect(deriveTechnology(2, 0, 'none', false, false, false)).toBe('FR4_STD');
  });
});

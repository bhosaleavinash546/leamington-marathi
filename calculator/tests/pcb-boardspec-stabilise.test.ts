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

  it('collapses two divergent area reads (176 vs 308 cm²) to the same area', () => {
    stabiliseBoardSpec(runA, asm, 'automotive_adas');
    stabiliseBoardSpec(runB, asm, 'automotive_adas');
    expect(Math.abs(area(runA) - area(runB))).toBeLessThan(1);   // same board → same area
  });

  it('derives the SAME technology + layers regardless of the model guess', () => {
    expect(runA.technologyType).toBe(runB.technologyType);
    expect(runA.technologyType).toBe('FR4_HTg');                  // 6-layer automotive BGA
    expect(runA.estimatedLayers).toBe(runB.estimatedLayers);
  });

  it('yields an identical deterministic fab for both reads (the headline stabiliser)', () => {
    const fabA = stableFabMid(runA, asm, 10000, 'cn');
    const fabB = stableFabMid(runB, asm, 10000, 'cn');
    expect(fabA).toBeGreaterThan(0);
    expect(Math.abs(fabA - fabB)).toBeLessThan(0.5);             // within pennies → stable headline
  });

  it('preserves a plausible board that is already in-band', () => {
    // 158 placements → anchor ~99 cm², band [69, 138]; a 100 cm² read is kept
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

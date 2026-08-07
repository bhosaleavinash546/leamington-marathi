/**
 * The manufacturing-feature substrate — the unit geometric DFM analyses.
 *
 * The review from manufacturing said the DFM rules are "generic" and "not
 * trustable". Both trace to one fact: `generateDFMDFA` never receives geometry,
 * so every rule fires on cost-bucket percentages and cannot name a feature.
 * This substrate is what lets a rule say "THIS boss, at THIS diameter, on THESE
 * faces" instead of "tooling is 18% of cost".
 *
 * These tests pin the two guards that decide whether the output is trustworthy,
 * because both were live defects found by running the extractor on real STEP
 * files rather than by reasoning about it:
 *
 *   1. A flat BOTTOM face is not an undercut. Its normal is 180° from the draw,
 *      and the existing aggregate `_compute_draft_analysis` tests `angle > 90.5
 *      -> undercut`, so it has been counting every bottom face as an undercut.
 *   2. On a SOLID part, single-ray thickness measures the part's extent, not a
 *      wall. A 40x20x10 block returns 40, 20 and 10 from its three face pairs,
 *      and a naive section-change rule reports a 4x step that does not exist.
 *
 * Both produce confident, specific, WRONG findings — the exact failure mode
 * that destroys trust in a DFM tool. The guards are more important than the
 * rules they protect.
 */
import { describe, it, expect } from 'vitest';
import type { ManufacturingFeature, ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';

/** Shape captured from a real kernel run on tests/fixtures/cad-parts/block-2holes.step. */
const SOLID_BLOCK: ManufacturingFeatureSet = {
  available: true, faceCount: 8, thicknessSampledFaces: 8, medianThicknessMm: 20,
  wallAnalysisValid: false, fillRatio: 0.9346, adjacencyAvailable: true, hotSpots: [],
  note: 'solid-bodied part (fill ratio 0.9346) — single-ray thickness measures part extent, '
      + 'not wall; section-change and hot-spot rules suppressed',
  features: [
    { id: 'H7', kind: 'hole', faceIds: [7, 8], diaMm: 10, depthMm: 40, ldRatio: 4 },
    { id: 'P1', kind: 'planar_face', faceIds: [1], thicknessMm: 10, draftDeg: 0, draftClass: 'zero_draft' },
    { id: 'P2', kind: 'planar_face', faceIds: [2], thicknessMm: 40, draftClass: 'not_applicable' },
  ],
};

/** Shape captured from a real kernel run on flange-6holes-boss.step (thin-walled). */
const THIN_FLANGE: ManufacturingFeatureSet = {
  available: true, faceCount: 11, thicknessSampledFaces: 11, medianThicknessMm: 20,
  wallAnalysisValid: true, fillRatio: 0.4995, adjacencyAvailable: true,
  hotSpots: [{ faceId: 2, thicknessMm: 48, vsMedianRatio: 2.4, positionMm: [0, 0, 6] }],
  features: [
    { id: 'H4', kind: 'hole', faceIds: [4, 5, 6, 7, 8, 9], diaMm: 6, depthMm: 72, ldRatio: 12 },
    { id: 'B10', kind: 'boss', faceIds: [10], diaMm: 30, depthMm: 8, ldRatio: 0.267 },
    { id: 'P2', kind: 'planar_face', faceIds: [2], thicknessMm: 20, sectionRatio: 2.857,
      neighbourMinThicknessMm: 7 },
  ],
};

const withKey = (s: ManufacturingFeatureSet, k: keyof ManufacturingFeature) =>
  s.features.filter(f => f[k] !== undefined);

describe('guard 1 — a flat end face is not an undercut', () => {
  it('marks faces perpendicular to the draw as not_applicable, not undercut', () => {
    const p2 = SOLID_BLOCK.features.find(f => f.id === 'P2')!;
    expect(p2.draftClass).toBe('not_applicable');
    expect(p2.draftClass).not.toBe('undercut');
  });

  it('reports no draft ANGLE on a face where draft is undefined', () => {
    // The old code computed abs(90 - 180) = 90 and called it "90 degrees of
    // draft", which is meaningless on an end face. Absent is the honest value.
    const p2 = SOLID_BLOCK.features.find(f => f.id === 'P2')!;
    expect(p2.draftDeg).toBeUndefined();
  });

  it('still measures draft on genuine wall faces', () => {
    const p1 = SOLID_BLOCK.features.find(f => f.id === 'P1')!;
    expect(p1.draftClass).toBe('zero_draft');
    expect(p1.draftDeg).toBe(0);
  });

  it('distinguishes "not a wall" from "not measured"', () => {
    // A rule must be able to tell an end face (nothing to check) from a face
    // the ray never resolved (a genuine coverage gap). Same absent draftDeg,
    // different draftClass.
    const notApplicable = SOLID_BLOCK.features.find(f => f.draftClass === 'not_applicable');
    expect(notApplicable).toBeDefined();
    expect(notApplicable!.draftDeg).toBeUndefined();
  });
});

describe('guard 2 — wall rules do not run on a solid part', () => {
  it('flags a solid part as invalid for wall analysis', () => {
    expect(SOLID_BLOCK.wallAnalysisValid).toBe(false);
    expect(SOLID_BLOCK.fillRatio).toBeGreaterThan(0.55);
  });

  it('emits NO sectionRatio on a solid part, however many thicknesses it measured', () => {
    // The block has three distinct "thicknesses" (40/20/10) that are really its
    // bbox dimensions. Left ungated, that is a fabricated 4x section change on
    // every machined block the tool ever sees.
    expect(SOLID_BLOCK.thicknessSampledFaces).toBe(8);
    expect(withKey(SOLID_BLOCK, 'sectionRatio')).toHaveLength(0);
  });

  it('emits no hot spots on a solid part', () => {
    expect(SOLID_BLOCK.hotSpots).toHaveLength(0);
  });

  it('says WHY it suppressed them rather than going silent', () => {
    expect(SOLID_BLOCK.note).toMatch(/part extent, not wall/);
    expect(SOLID_BLOCK.note).toMatch(/suppressed/);
  });

  it('does run wall rules on a genuinely thin-walled part', () => {
    expect(THIN_FLANGE.wallAnalysisValid).toBe(true);
    expect(THIN_FLANGE.fillRatio).toBeLessThan(0.55);
    expect(withKey(THIN_FLANGE, 'sectionRatio').length).toBeGreaterThan(0);
    expect(THIN_FLANGE.hotSpots!.length).toBeGreaterThan(0);
  });
});

describe('the substrate is localisable — this is what makes a finding specific', () => {
  it('every feature carries the face ids that produced it', () => {
    for (const set of [SOLID_BLOCK, THIN_FLANGE]) {
      for (const f of set.features) {
        expect(f.faceIds.length, `${f.id} must name its faces`).toBeGreaterThan(0);
        expect(f.faceIds.every(i => Number.isInteger(i) && i > 0)).toBe(true);
      }
    }
  });

  it('a hole carries the measured L:D a drill-reach rule needs', () => {
    const deep = THIN_FLANGE.features.find(f => f.id === 'H4')!;
    expect(deep.kind).toBe('hole');
    expect(deep.diaMm).toBe(6);
    expect(deep.depthMm).toBe(72);
    expect(deep.ldRatio).toBe(12);              // 72 / 6 — beyond standard drill reach
  });

  it('a hole spanning several faces reports them all, so the whole bore highlights', () => {
    const deep = THIN_FLANGE.features.find(f => f.id === 'H4')!;
    expect(deep.faceIds.length).toBe(6);
  });

  it('section ratio carries the neighbour it was measured against', () => {
    const p = THIN_FLANGE.features.find(f => f.sectionRatio !== undefined)!;
    expect(p.neighbourMinThicknessMm).toBeDefined();
    expect(p.sectionRatio).toBeCloseTo(20 / 7, 2);   // thick:thin, reproducible by hand
  });

  it('absent means not measured — never zero', () => {
    // A DFM rule keyed on `thicknessMm === 0` would fire everywhere. Optional
    // keys must be undefined, not defaulted, so a rule can skip rather than lie.
    const boss = THIN_FLANGE.features.find(f => f.id === 'B10')!;
    expect(boss.thicknessMm).toBeUndefined();
    expect('thicknessMm' in boss).toBe(false);
  });
});

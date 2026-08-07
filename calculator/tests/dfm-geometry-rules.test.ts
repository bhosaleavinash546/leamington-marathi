/**
 * Geometric DFM rule packs.
 *
 * The review said the rules were generic, cost-driven and not trustable. These
 * tests pin the three properties that answer that, in order of importance:
 *
 *   1. Every rule cites a source. Enforced here, so the build fails rather than
 *      a threshold shipping that an engineer cannot trace.
 *   2. Every finding names the faces that caused it — the difference between
 *      "tooling is 18% of cost" and "face 7 draws at 0.2°".
 *   3. A rule stays SILENT when its input was not measured, and the run says
 *      what it could not check. Silence must never read as a pass.
 */
import { describe, it, expect } from 'vitest';
import {
  analyseGeometricDFM, allGeometricRules, runGeometricRules,
  CASTING_RULES, MACHINING_RULES, INJECTION_MOULDING_RULES, SHEET_METAL_RULES,
  MIN_DRAFT_DEG, STANDARD_DRILL_LD, PREFERRED_DRILL_DIA_MM,
  GEOMETRIC_DFM_COMMODITIES, highlightFaceIds,
} from '../src/engine/dfm-geometry/index.js';
import type { PartContext, ManufacturingFeature } from '../src/engine/dfm-geometry/types.js';
import type { ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';

const featureSet = (features: ManufacturingFeature[],
                    over: Partial<ManufacturingFeatureSet> = {}): ManufacturingFeatureSet => ({
  available: true, features, wallAnalysisValid: true, adjacencyAvailable: true,
  medianThicknessMm: 4, hotSpots: [], fillRatio: 0.4, ...over,
});

const ctx = (features: ManufacturingFeature[], over: Partial<PartContext> = {}): PartContext => ({
  commodity: 'casting',
  bboxMm: { x: 120, y: 80, z: 40 },
  medianWallMm: 4,
  materialFamily: 'aluminium',
  process: 'hpdc',
  ...over,
  // Merged last and deliberately: an override must tweak the feature set, not
  // replace it and silently drop the features under test.
  featureSet: featureSet(features, (over.featureSet ?? {}) as Partial<ManufacturingFeatureSet>),
});

describe('invariant 1 — no citation, no ship', () => {
  it('every registered rule names a published source', () => {
    const rules = allGeometricRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.source, `${r.id} has no source`).toBeDefined();
      expect(r.source.standard.trim().length, `${r.id} has an empty standard`).toBeGreaterThan(10);
    }
  });

  it('every rule id is unique and namespaced by commodity', () => {
    const ids = allGeometricRules().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/);
  });

  it('the printed citation matches the ROUTE actually applied', () => {
    // Caught in review: the draft rule cited NADCA — the DIE-CASTING association
    // — for a sand-cast part. A foundry engineer spots that immediately, and one
    // wrong citation discredits every correct one. Each route carries its own.
    const wall = { id: 'P1', kind: 'planar_face' as const, faceIds: [1],
                   draftDeg: 0, draftClass: 'zero_draft' as const };

    const sand = analyseGeometricDFM(ctx([wall], { process: 'sand' }))
      .findings.find(f => f.ruleId === 'casting.draft.insufficient')!;
    expect(sand.source.standard).toMatch(/ASM Handbook/);
    expect(sand.source.standard).not.toMatch(/NADCA/);
    expect(sand.threshold.value).toBe(MIN_DRAFT_DEG.sand);

    const hpdc = analyseGeometricDFM(ctx([wall], { process: 'hpdc' }))
      .findings.find(f => f.ruleId === 'casting.draft.insufficient')!;
    expect(hpdc.source.standard).toMatch(/NADCA/);
    expect(hpdc.threshold.value).toBe(MIN_DRAFT_DEG.hpdc);
  });

  it('every route source states that its figure came from a published band', () => {
    // A midpoint or lower bound presented as a hard number is unattributable.
    for (const route of ['sand', 'hpdc', 'investment']) {
      const f = analyseGeometricDFM(ctx(
        [{ id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0, draftClass: 'zero_draft' }],
        { process: route },
      )).findings.find(x => x.ruleId === 'casting.draft.insufficient')!;
      expect(f.source.note, `${route} must state its band`).toMatch(/band/i);
    }
  });

  it('an unknown route falls back to the most permissive minimum and says so', () => {
    const f = analyseGeometricDFM(ctx(
      [{ id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0.3, draftClass: 'drafted' }],
      { process: undefined },
    )).findings.find(x => x.ruleId === 'casting.draft.insufficient')!;
    expect(f.threshold.value).toBe(0.5);
    expect(f.source.note).toMatch(/under-reports rather than over-reports/);
  });

  it('every finding carries its rule source through to the reader', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0.1, draftClass: 'drafted' },
    ]));
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) expect(f.source.standard.length).toBeGreaterThan(10);
  });
});

describe('invariant 2 — a finding names the geometry that caused it', () => {
  it('reports the face ids, the measured value and the threshold it failed', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P7', kind: 'planar_face', faceIds: [7], draftDeg: 0.2, draftClass: 'drafted' },
    ]));
    const f = r.findings.find(x => x.ruleId === 'casting.draft.insufficient')!;
    expect(f).toBeDefined();
    expect(f.faceIds).toEqual([7]);
    expect(f.featureId).toBe('P7');
    expect(f.measured).toEqual({ field: 'draftDeg', value: 0.2, unit: '°' });
    expect(f.threshold.value).toBe(MIN_DRAFT_DEG.hpdc);
    expect(f.detail).toContain('0.20°');
  });

  it('collects the face ids the viewer should highlight', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0, draftClass: 'zero_draft' },
      { id: 'P2', kind: 'planar_face', faceIds: [2, 3], draftClass: 'undercut', draftDeg: 95 },
    ]));
    expect(highlightFaceIds(r).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('sorts worst-first so the report leads with what matters', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0.2, draftClass: 'drafted' },
      { id: 'P2', kind: 'planar_face', faceIds: [2], draftClass: 'undercut', draftDeg: 95 },
    ]));
    expect(r.findings[0].severity).toBe('major');
  });
});

describe('invariant 3 — silent when not measured, and says what it could not check', () => {
  it('does not run wall rules on a solid part, and states why', () => {
    // The block-2holes case: three "thicknesses" that are really bbox dims.
    const part = ctx(
      [{ id: 'P1', kind: 'planar_face', faceIds: [1], thicknessMm: 40,
         neighbourMinThicknessMm: 10, sectionRatio: 4 }],
      { featureSet: { wallAnalysisValid: false, note: 'solid-bodied part — thickness is part extent, not wall' } as ManufacturingFeatureSet },
    );
    const r = analyseGeometricDFM(part);
    expect(r.findings.filter(f => f.ruleId === 'casting.section.abrupt-change')).toHaveLength(0);
    expect(r.limitations.join(' ')).toMatch(/part extent, not wall|solid-bodied/i);
  });

  it('an end face is not reported as an undercut and not reported as zero draft', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P9', kind: 'planar_face', faceIds: [9], draftClass: 'not_applicable' },
    ]));
    expect(r.findings).toHaveLength(0);
  });

  it('says when no material was confirmed, instead of assuming one', () => {
    const r = analyseGeometricDFM(ctx([], { materialFamily: undefined }));
    expect(r.limitations.join(' ')).toMatch(/material family/i);
  });

  it('reports an empty run honestly when extraction never happened', () => {
    const r = analyseGeometricDFM({
      commodity: 'casting',
      featureSet: { available: false, features: [], note: 'kernel did not run' },
    });
    expect(r.findings).toHaveLength(0);
    expect(r.limitations[0]).toMatch(/kernel did not run/);
  });

  it('a rule that throws does not take down the run', () => {
    const boom = { ...CASTING_RULES[0], id: 'casting.test.boom',
      evaluate() { throw new Error('bang'); } };
    const out = runGeometricRules([boom, ...CASTING_RULES],
      ctx([{ id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0, draftClass: 'zero_draft' }]));
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('sheet metal declares the checks it cannot yet perform', () => {
    const r = analyseGeometricDFM(ctx([], { commodity: 'sheet_metal' }));
    const text = r.limitations.join(' ');
    expect(text).toMatch(/Bend-to-hole distance was not checked/);
    expect(text).toMatch(/flat pattern/i);
  });

  it('a commodity with no pack says so rather than returning a clean bill', () => {
    const r = analyseGeometricDFM(ctx([], { commodity: 'pcba' }));
    expect(r.packAvailable).toBe(false);
    expect(r.limitations.join(' ')).toMatch(/No geometric rule pack exists for pcba/);
  });
});

describe('machining rules read the hole, not the invoice', () => {
  it('flags a hole beyond standard drill reach with its measured L:D', () => {
    const r = analyseGeometricDFM(ctx(
      [{ id: 'H4', kind: 'hole', faceIds: [4, 5], diaMm: 6, depthMm: 72, ldRatio: 12 }],
      { commodity: 'machining' }));
    const f = r.findings.find(x => x.ruleId === 'machining.hole.depth-beyond-standard-drill')!;
    expect(f.severity).toBe('major');            // 12:1 is past extended reach too
    expect(f.measured.value).toBe(12);
    expect(f.threshold.value).toBe(STANDARD_DRILL_LD);
    expect(f.recommendation).toMatch(/gun-drilling|trepanning/);
  });

  it('leaves a normal hole alone', () => {
    const r = analyseGeometricDFM(ctx(
      [{ id: 'H1', kind: 'hole', faceIds: [1], diaMm: 10, depthMm: 20, ldRatio: 2 }],
      { commodity: 'machining' }));
    expect(r.findings.filter(f => f.ruleId.includes('depth-beyond'))).toHaveLength(0);
  });

  it('accepts every preferred drill diameter without comment', () => {
    for (const d of PREFERRED_DRILL_DIA_MM) {
      const r = analyseGeometricDFM(ctx(
        [{ id: 'H1', kind: 'hole', faceIds: [1], diaMm: d, depthMm: d * 2, ldRatio: 2 }],
        { commodity: 'machining' }));
      expect(r.findings.filter(f => f.ruleId.includes('non-preferred')),
        `⌀${d} should be accepted`).toHaveLength(0);
    }
  });

  it('suggests the nearest standard size for an odd diameter', () => {
    const r = analyseGeometricDFM(ctx(
      [{ id: 'H1', kind: 'hole', faceIds: [1], diaMm: 7.3, depthMm: 14, ldRatio: 1.9 }],
      { commodity: 'machining' }));
    const f = r.findings.find(x => x.ruleId === 'machining.hole.non-preferred-diameter')!;
    expect(f.severity).toBe('advisory');
    expect(f.recommendation).toContain('7.5');
  });
});

describe('moulding rules use the ratios the trade actually argues about', () => {
  it('flags a boss too fat for its wall, quoting both measurements', () => {
    const r = analyseGeometricDFM(ctx(
      [{ id: 'B3', kind: 'boss', faceIds: [3], diaMm: 12, neighbourWallMm: 2, bossToWallRatio: 6 }],
      { commodity: 'injection_moulding' }));
    const f = r.findings.find(x => x.ruleId === 'moulding.boss.wall-ratio')!;
    expect(f.measured.value).toBe(6);
    expect(f.detail).toContain('⌀12.0');
    expect(f.recommendation).toMatch(/core/i);
  });

  it('accepts a boss within the published ratio', () => {
    const r = analyseGeometricDFM(ctx(
      [{ id: 'B3', kind: 'boss', faceIds: [3], diaMm: 5, neighbourWallMm: 2.5, bossToWallRatio: 2 }],
      { commodity: 'injection_moulding' }));
    expect(r.findings.filter(f => f.ruleId.includes('boss'))).toHaveLength(0);
  });
});

describe('cast_and_machine composes both packs', () => {
  it('applies casting AND machining rules, each labelled to the part commodity', () => {
    const r = analyseGeometricDFM(ctx([
      { id: 'P1', kind: 'planar_face', faceIds: [1], draftDeg: 0, draftClass: 'zero_draft' },
      { id: 'H2', kind: 'hole', faceIds: [2], diaMm: 5, depthMm: 60, ldRatio: 12 },
    ], { commodity: 'cast_and_machine' }));
    const ids = r.findings.map(f => f.ruleId);
    expect(ids.some(i => i.startsWith('casting.'))).toBe(true);
    expect(ids.some(i => i.startsWith('machining.'))).toBe(true);
    for (const f of r.findings) expect(f.commodity).toBe('cast_and_machine');
  });
});

describe('every pack declares what geometry can never tell it', () => {
  it('casting states the drawing-level checks it cannot perform', () => {
    const r = analyseGeometricDFM(ctx([]));
    const t = r.limitations.join(' ');
    expect(t).toMatch(/Tolerance and datum callouts/);
    expect(t).toMatch(/Parting-line position was assumed/);
  });

  it('machining states tool access and tolerance are out of reach', () => {
    const t = analyseGeometricDFM(ctx([], { commodity: 'machining' })).limitations.join(' ');
    expect(t).toMatch(/Tool access and fixturing were not simulated/);
  });

  it('moulding states gate position and weld lines are out of reach', () => {
    const t = analyseGeometricDFM(ctx([], { commodity: 'injection_moulding' })).limitations.join(' ');
    expect(t).toMatch(/Gate position and flow length/);
    expect(t).toMatch(/Weld-line position/);
  });

  it('a clean run still carries limitations, so silence is never read as a pass', () => {
    // This is the property that matters: zero findings must never look like a
    // clean bill of health.
    const r = analyseGeometricDFM(ctx([]));
    expect(r.findings).toHaveLength(0);
    expect(r.limitations.length).toBeGreaterThan(0);
  });
});

describe('the pack registry is deliberately small', () => {
  it('covers exactly the six commodities validated so far', () => {
    expect([...GEOMETRIC_DFM_COMMODITIES].sort()).toEqual([
      'cast_and_machine', 'casting', 'injection_moulding',
      'machining', 'sheet_metal', 'sheet_metal_fab',
    ]);
  });

  it('every pack has at least one rule, so no commodity claims coverage it lacks', () => {
    for (const pack of [CASTING_RULES, MACHINING_RULES, INJECTION_MOULDING_RULES, SHEET_METAL_RULES]) {
      expect(pack.length).toBeGreaterThan(0);
    }
  });
});

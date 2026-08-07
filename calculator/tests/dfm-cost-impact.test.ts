/**
 * Money on DFM findings.
 *
 * A benchmark review found the one gap that was ours alone to close: the rules
 * cited a standard and named a face, but carried no cost — and we are a cost
 * engine. aPriori's differentiator is a DFM Risk Score tying each issue to
 * manufacturability AND cost; DFMPro, with 100+ rules, does not price findings
 * at all.
 *
 * The risk in closing it is obvious: once findings can carry a number, the
 * temptation is to give every finding one. These tests exist to stop that.
 *
 *   - A price must RECONCILE to the engine function it came from, to 4dp. A
 *     pricer that computes its own time or rate is a second source of truth,
 *     and a DFM number that disagrees with the cost sheet is worse than none.
 *   - A finding must never carry both a price and a reason there is no price.
 *   - The quality-risk rules must have NO pricer, asserted by name, so a later
 *     contributor cannot "helpfully" invent a scrap rate for shrinkage porosity.
 */
import { describe, it, expect } from 'vitest';
import {
  analyseGeometricDFM, PRICERS, NOT_MODELLED, priceFinding, totalCostGBP,
  allGeometricRules,
} from '../src/engine/dfm-geometry/index.js';
import type { PartContext, ManufacturingFeature } from '../src/engine/dfm-geometry/types.js';
import type { ManufacturingFeatureSet } from '../src/engine/ai-analysis.js';
import { estimateMouldCost } from '../src/engine/modules/injection-moulding.js';
import { featureMinutesEach } from '../src/engine/feature-machining.js';

const VOL = 50_000, MR = 60, LR = 25;
const BBOX = { x: 200, y: 100, z: 40 };
const COST = { annualVolume: VOL, machineRatePerHr: MR, labourRatePerHr: LR };

const fs = (features: ManufacturingFeature[],
            over: Partial<ManufacturingFeatureSet> = {}): ManufacturingFeatureSet => ({
  available: true, features, wallAnalysisValid: true, adjacencyAvailable: true,
  medianThicknessMm: 3, hotSpots: [], fillRatio: 0.3, ...over,
});

const ctx = (features: ManufacturingFeature[], over: Partial<PartContext> = {}): PartContext => ({
  commodity: 'casting', bboxMm: BBOX, medianWallMm: 3,
  materialFamily: 'aluminium', process: 'hpdc', cost: COST,
  ...over,
  featureSet: fs(features, (over.featureSet ?? {}) as Partial<ManufacturingFeatureSet>),
});

const UNDERCUT: ManufacturingFeature = {
  id: 'P1', kind: 'planar_face', faceIds: [1], draftClass: 'undercut', draftDeg: 20,
};
const DEEP_HOLE: ManufacturingFeature = {
  id: 'H1', kind: 'hole', faceIds: [1], diaMm: 6, depthMm: 72, ldRatio: 12,
};

describe('a price reconciles to the engine it came from', () => {
  it('the moulding slide equals estimateMouldCost with vs without, ÷ volume', () => {
    // Hand-computed from the same estimator the costing uses. If a pricer ever
    // grows its own tooling model this fails, which is the point.
    const area = (BBOX.x * BBOX.y) / 100;
    const withS = estimateMouldCost({ cavities: 1, projectedAreaCm2: area, sideActionsLifters: 1 });
    const without = estimateMouldCost({ cavities: 1, projectedAreaCm2: area, sideActionsLifters: 0 });
    const hand = (withS.total - without.total) / VOL;

    const r = analyseGeometricDFM(ctx([UNDERCUT], { commodity: 'injection_moulding' }));
    const g = r.grouped.find(x => x.ruleId === 'moulding.undercut.requires-side-action')!;
    expect(g.totalCostGBP).toBeCloseTo(hand, 4);
    expect(g.totalCostGBP).toBeGreaterThan(0);
  });

  it('the deep hole equals featureMinutesEach × the machine+labour rate', () => {
    const minutes = featureMinutesEach({ kind: 'hole', diaMm: 6, depthMm: 72, through: null, count: 1 });
    const hand = (minutes / 60) * (MR + LR);

    const r = analyseGeometricDFM(ctx([DEEP_HOLE], { commodity: 'machining' }));
    const g = r.grouped.find(x => x.ruleId === 'machining.hole.depth-beyond-standard-drill')!;
    expect(g.totalCostGBP).toBeCloseTo(hand, 4);
  });

  it('keeps sub-penny precision instead of rounding a real cost to zero', () => {
    // A slide amortised over 2 million parts is worth £0.0002. Rounded to pence
    // it reads as free, which is a different and wrong statement.
    const r = analyseGeometricDFM(ctx([UNDERCUT], {
      commodity: 'injection_moulding', cost: { ...COST, annualVolume: 2_000_000 } }));
    const g = r.grouped.find(x => x.ruleId.includes('undercut'))!;
    expect(g.totalCostGBP).toBeGreaterThan(0);
    expect(g.totalCostGBP).toBeLessThan(0.01);
  });

  it('prints the arithmetic, so a supplier can check it', () => {
    const r = analyseGeometricDFM(ctx([DEEP_HOLE], { commodity: 'machining' }));
    const f = r.findings.find(x => x.costImpact)!;
    expect(f.costImpact!.basis).toMatch(/featureMinutesEach/);
    expect(f.costImpact!.basis).toMatch(/machine\+labour/);
    expect(f.costImpact!.confidence).toBe('modelled');
  });
});

describe('never both a price and a reason there is no price', () => {
  it('holds across every finding on every commodity', () => {
    for (const commodity of ['casting', 'machining', 'injection_moulding',
                             'forging', 'sheet_metal', 'blow_moulding'] as const) {
      const r = analyseGeometricDFM(ctx([UNDERCUT, DEEP_HOLE], { commodity }));
      for (const f of r.findings) {
        const both = f.costImpact !== undefined && f.costNotModelled !== undefined;
        expect(both, `${commodity}/${f.ruleId} carries both`).toBe(false);
        const neither = f.costImpact === undefined && f.costNotModelled === undefined;
        expect(neither, `${commodity}/${f.ruleId} carries neither`).toBe(false);
      }
    }
  });
});

describe('the quality-risk rules have NO pricer, deliberately', () => {
  // Named individually. A later contributor adding a scrap-rate guess to any of
  // these has to delete a test that says why not — which is the whole guard.
  const MUST_STAY_UNPRICED = [
    'casting.draft.insufficient',
    'casting.section.abrupt-change',
    'casting.hotspot.isolated-heavy-section',
    'casting.fillet.sharp-internal-corner',
    'moulding.rib.thicker-than-0p6-wall',
    'moulding.boss.wall-ratio',
    'moulding.draft.insufficient',
    'forging.web.below-process-minimum',
    'forging.draft.below-process-minimum',
    'forging.fillet.too-sharp-for-metal-flow',
    'blow.corner.radius-below-2x-wall',
    'blow.undercut.needs-split-or-insert',
    'casting.undercut.requires-core',
    // Routed to the hole pricer at first; it fires on a FACE, which has no
    // diameter, so it silently priced nothing. A wrong mapping is worse than an
    // honest gap, and this line is why it stays a gap.
    'forging.undercut.cannot-release',
  ];

  it('has no pricer registered for any of them', () => {
    for (const id of MUST_STAY_UNPRICED) {
      expect(PRICERS[id], `${id} must not be priced`).toBeUndefined();
    }
  });

  it('gives each a SPECIFIC reason, not a generic line', () => {
    for (const id of MUST_STAY_UNPRICED) {
      const why = NOT_MODELLED[id];
      expect(why, `${id} has no stated reason`).toBeDefined();
      expect(why.length).toBeGreaterThan(40);
      expect(why).not.toMatch(/^No cost path is modelled/);
    }
  });

  it('names the missing model rather than hand-waving', () => {
    expect(NOT_MODELLED['casting.hotspot.isolated-heavy-section']).toMatch(/scrap-rate model/);
    expect(NOT_MODELLED['casting.draft.insufficient']).toMatch(/die-life/);
    expect(NOT_MODELLED['casting.section.abrupt-change']).toMatch(/fabricated/);
  });

  it('a rule with no entry anywhere still gets a reason, not silence', () => {
    const out = priceFinding(
      { ruleId: 'made.up.rule' } as never, ctx([]), COST);
    expect(out.costImpact).toBeUndefined();
    expect(out.costNotModelled).toBe('No cost path is modelled for this rule.');
  });
});

describe('missing inputs degrade, never throw or guess', () => {
  it('says tooling cannot be amortised when no volume was given', () => {
    const r = analyseGeometricDFM(ctx([UNDERCUT], {
      commodity: 'injection_moulding', cost: { machineRatePerHr: MR, labourRatePerHr: LR } }));
    const f = r.findings.find(x => x.ruleId.includes('undercut'))!;
    expect(f.costImpact).toBeUndefined();
    expect(f.costNotModelled).toMatch(/annual volume/);
  });

  it('says rates were not supplied when they were not', () => {
    const r = analyseGeometricDFM(ctx([DEEP_HOLE], {
      commodity: 'machining', cost: { annualVolume: VOL } }));
    const f = r.findings.find(x => x.ruleId.includes('depth-beyond'))!;
    expect(f.costNotModelled).toMatch(/machine and labour rates/);
  });

  it('survives no cost context at all', () => {
    const r = analyseGeometricDFM(ctx([DEEP_HOLE], { commodity: 'machining', cost: undefined }));
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.totalAddressableGBP).toBe(0);
    expect(r.findings.every(f => f.costNotModelled)).toBe(true);
  });
});

describe('the list is ranked by money', () => {
  it('puts the priced finding above an unpriced one of the same severity', () => {
    // Both major: the undercut is priced, the zero-draft face is not. Money wins.
    const r = analyseGeometricDFM(ctx([
      UNDERCUT,
      { id: 'P2', kind: 'planar_face', faceIds: [2], draftDeg: 0, draftClass: 'zero_draft' },
    ], { commodity: 'injection_moulding' }));
    expect(r.grouped[0].ruleId).toContain('undercut');
    expect(r.grouped[0].totalCostGBP).toBeGreaterThan(0);
    expect(r.grouped[1].totalCostGBP).toBe(0);
  });

  it('reports the part total as the sum of priced findings only', () => {
    const r = analyseGeometricDFM(ctx([UNDERCUT], { commodity: 'injection_moulding' }));
    expect(r.totalAddressableGBP).toBeCloseTo(totalCostGBP(r.findings), 4);
    expect(r.totalAddressableGBP).toBeCloseTo(r.grouped[0].totalCostGBP, 4);
  });

  it('a group total is the sum of its instances, not one of them', () => {
    const holes: ManufacturingFeature[] = [1, 2, 3].map(i => ({
      id: `H${i}`, kind: 'hole', faceIds: [i], diaMm: 6, depthMm: 72, ldRatio: 12,
    }));
    const r = analyseGeometricDFM(ctx(holes, { commodity: 'machining' }));
    const g = r.grouped.find(x => x.ruleId.includes('depth-beyond'))!;
    expect(g.count).toBe(3);
    const one = r.findings.find(f => f.costImpact)!.costImpact!.perPartGBP;
    expect(g.totalCostGBP).toBeCloseTo(one * 3, 4);
  });
});

describe('coverage is explicit', () => {
  it('every registered rule either has a pricer or a stated reason', () => {
    // The honest scope: 6 priced, the rest reasoned. This test is what makes
    // that a decision rather than an oversight.
    for (const r of allGeometricRules()) {
      const covered = PRICERS[r.id] !== undefined || NOT_MODELLED[r.id] !== undefined;
      expect(covered, `${r.id} has neither a pricer nor a reason`).toBe(true);
    }
  });

  it('prices exactly the rules whose cost path is modelled', () => {
    expect(Object.keys(PRICERS).sort()).toEqual([
      'machining.corner.radius-below-economic-cutter',
      'machining.hole.depth-beyond-standard-drill',
      'machining.hole.non-preferred-diameter',
      'moulding.undercut.requires-side-action',
      'sheetmetal.hole.smaller-than-thickness',
    ]);
  });
});

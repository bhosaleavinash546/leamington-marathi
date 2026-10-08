/**
 * DFM cost drivers (Oct 2026, docs/cad/dfm-cost-drivers-2026-10.md): the corrected feature recognition and
 * the new rules — setups, compound angles, cross holes, hole sizes, corner reach, core pins, cored holes —
 * plus the wall-plausibility guard that took the absurd readings out of the existing rules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyseGeometricDFM, type ManufacturingFeature, type PartContext } from '../src/engine/dfm-geometry/index.js';
import { coverDirections, partFrame, offFrameDeg } from '../src/engine/dfm-geometry/commodities/machining-access.js';
import { nadcaMaxCoredDepthMm } from '../src/engine/dfm-geometry/commodities/casting.js';
import { plausibleWall } from '../src/engine/dfm-geometry/types.js';
import { HANDLING_MIN_PER_FIXTURING, FIXTURE_GBP, PROGRAMMING_HR } from '../src/engine/machining-time.js';

const COST = { annualVolume: 10_000, machineRatePerHr: 60, labourRatePerHr: 25, engineerRatePerHr: 55 };
const ctx = (features: ManufacturingFeature[], o: Partial<PartContext> = {}): PartContext => ({
  commodity: 'machining',
  featureSet: { available: true, features, medianThicknessMm: 4, wallAnalysisValid: true, adjacencyAvailable: true },
  cost: COST, ...o,
});
const rules = (r: ReturnType<typeof analyseGeometricDFM>) => r.findings.map(f => f.ruleId);
const plane = (id: string, axis: [number, number, number], area: number): ManufacturingFeature =>
  ({ id, kind: 'planar_face', faceIds: [Number(id.slice(1))], axis, areaMm2: area });

describe('the real hydraulic manifold (recorded kernel output) — recognition and findings', () => {
  const fx = JSON.parse(readFileSync('tests/fixtures/dfm/manifold-features.json', 'utf8'));
  const feats: ManufacturingFeature[] = fx.manufacturingFeatures.features;
  const holes = feats.filter(f => f.kind === 'hole');
  it('reads the holes its modelling script cut: 4 × Ø11 × 60 through, 3 × Ø18 × 40, 2 × Ø8 × 70, 4 × Ø5 × 12 blind', () => {
    const sig = (d: number) => holes.filter(h => h.diaMm === d).map(h => [h.depthMm, h.openEnds]);
    expect(sig(11)).toEqual(Array(4).fill([60, 2]));
    expect(sig(18)).toEqual(Array(3).fill([40, 1]));
    expect(sig(8)).toEqual(Array(2).fill([70, 1]));
    expect(sig(5)).toEqual(Array(4).fill([12, 1]));
    // the old grouping merged the four bolt holes into ONE Ø11 hole 229 mm deep
    expect(holes.some(h => (h.depthMm ?? 0) > 100)).toBe(false);
  });
  it('reads the pocket corners as R5 internal corners reachable from the top, not as a Ø10 hole', () => {
    const corners = feats.filter(f => f.kind === 'fillet' && f.concave);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(c.radiusMm).toBe(5);
      expect(c.toolReachMm).toBeGreaterThan(19.9);
      expect(c.toolReachMm).toBeLessThan(20.2);
      expect(c.openDirs).toEqual([[0, 0, 1]]);
    }
    expect(holes.some(h => h.diaMm === 10)).toBe(false);
  });
  const r = analyseGeometricDFM({
    commodity: 'machining', featureSet: fx.manufacturingFeatures,
    bboxMm: { x: fx.boundingBox.xMm, y: fx.boundingBox.yMm, z: fx.boundingBox.zMm }, cost: COST,
  });
  it('finds 3 setups (+Z, −X, −Y), priced from the costing\'s own constants', () => {
    const s = r.findings.find(f => f.ruleId === 'machining.setup.access-directions')!;
    expect(s.measured.value).toBe(3);
    expect(s.detail).toMatch(/\+Z.*−X.*−Y/);
    const per = (HANDLING_MIN_PER_FIXTURING / 60) * 85 + (FIXTURE_GBP.dedicated + PROGRAMMING_HR.perFixturing * 55) / 10_000;
    expect(s.costImpact!.perPartGBP).toBeCloseTo(per, 3);
  });
  it('finds the two ports that break into bolt holes (Ø18 at y 20 / 60 against Ø11 at y 10 / 70)', () => {
    const x = r.findings.filter(f => f.ruleId === 'machining.hole.intersecting');
    expect(x).toHaveLength(2);
    expect(x.every(f => /⌀18\.0 mm and ⌀11\.0 mm|⌀11\.0 mm and ⌀18\.0 mm/.test(f.detail))).toBe(true);
  });
  it('flags the real deep holes only: the Ø8 × 70 galleries and the Ø11 × 60 bolt holes', () => {
    const deep = r.findings.filter(f => f.ruleId === 'machining.hole.depth-beyond-standard-drill');
    expect(deep.map(f => f.measured.value).sort()).toEqual([5.455, 5.455, 5.455, 5.455, 8.75, 8.75]);
  });
  it('raises no corner finding: R5 corners 20 mm deep are a 2×D cutter', () => {
    expect(rules(r).some(id => id.startsWith('machining.corner.'))).toBe(false);
  });
});

describe('internal corners', () => {
  const corner = (o: Partial<ManufacturingFeature>): ManufacturingFeature =>
    ({ id: 'FIL1', kind: 'fillet', faceIds: [1], radiusMm: 2, concave: true, toolReachMm: 30, openDirs: [[0, 0, 1]], ...o });
  it('long reach: R2 at 30 mm is a Ø4 cutter at 7.5×D — major; at 14 mm, 3.5×D — nothing', () => {
    const f = analyseGeometricDFM(ctx([corner({})])).findings.find(x => x.ruleId === 'machining.corner.long-reach-cutter')!;
    expect(f.severity).toBe('major');
    expect(f.measured.value).toBeCloseTo(7.5, 3);
    expect(rules(analyseGeometricDFM(ctx([corner({ toolReachMm: 14 })])))).not.toContain('machining.corner.long-reach-cutter');
    expect(analyseGeometricDFM(ctx([corner({ toolReachMm: 20 })])).findings.find(x => x.ruleId === 'machining.corner.long-reach-cutter')!.severity).toBe('minor');
  });
  it('an external round never fires a cutter rule', () => {
    expect(rules(analyseGeometricDFM(ctx([corner({ concave: false, radiusMm: 0.5 })])))).toEqual([]);
  });
  it('a cast or forged corner is formed, not milled — no cutter rules on cast + machine', () => {
    const r = analyseGeometricDFM(ctx([corner({ radiusMm: 0.5 })], { commodity: 'cast_and_machine' }));
    expect(rules(r).some(id => id.startsWith('machining.corner.'))).toBe(false);
    expect(rules(r)).toContain('casting.fillet.sharp-internal-corner');
  });
});

describe('setups and compound angles', () => {
  it('greedy cover: through holes reachable either way share a setup', () => {
    const c = coverDirections([
      { options: [[0, 0, 1], [0, 0, -1]] }, { options: [[0, 0, 1]] }, { options: [[1, 0, 0]] }, { options: [[0, 0, -1], [0, 0, 1]] },
    ]);
    expect(c).toHaveLength(2);
  });
  it('the frame comes from the part, so a model exported rotated is not "compound" everywhere', () => {
    const t = Math.PI / 7, c = Math.cos(t), s = Math.sin(t);
    const rot = (v: [number, number, number]): [number, number, number] => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
    const feats: ManufacturingFeature[] = [
      plane('P1', rot([0, 0, 1]), 5000), plane('P2', rot([1, 0, 0]), 2000), plane('P3', rot([0, 1, 0]), 1500),
      { id: 'H9', kind: 'hole', faceIds: [9], diaMm: 6, depthMm: 10, axis: rot([1, 0, 0]), openEnds: 1, openDirs: [rot([1, 0, 0])], positionMm: [0, 0, 0] },
    ];
    expect(offFrameDeg(rot([1, 0, 0]), partFrame(feats))).toBeLessThan(0.01);
    expect(rules(analyseGeometricDFM(ctx(feats)))).not.toContain('machining.hole.compound-angle');
  });
  it('a stepped bore off the frame is ONE compound-angle finding, not one per step', () => {
    const ax: [number, number, number] = [0.15643, 0.98769, 0];
    const feats: ManufacturingFeature[] = [plane('P1', [0, 0, 1], 5000), plane('P2', [1, 0, 0], 3000),
      ...[40, 42.5, 39].map((d, i) => ({ id: `H${i + 10}`, kind: 'hole' as const, faceIds: [i + 10], diaMm: d, depthMm: 5, axis: ax, openEnds: 2, openDirs: [ax, [-ax[0], -ax[1], 0] as [number, number, number]], positionMm: [0, i * 5, 0] as [number, number, number] }))];
    const f = analyseGeometricDFM(ctx(feats)).findings.filter(x => x.ruleId === 'machining.hole.compound-angle');
    expect(f).toHaveLength(1);
    expect(f[0].measured.value).toBeCloseTo(9, 1);
    expect(f[0].faceIds).toEqual([10, 11, 12]);
  });
});

describe('cross holes and hole sizes', () => {
  const hole = (id: string, dia: number, pos: [number, number, number], axis: [number, number, number], depth: number): ManufacturingFeature =>
    ({ id, kind: 'hole', faceIds: [Number(id.slice(1))], diaMm: dia, depthMm: depth, positionMm: pos, axis, openEnds: 1, openDirs: [axis] });
  it('perpendicular bores that meet are found; ones that pass by, or end short, are not', () => {
    const a = hole('H1', 10, [0, 0, 0], [1, 0, 0], 40);           // x −20 … 20 at y = z = 0
    expect(rules(analyseGeometricDFM(ctx([a, hole('H2', 6, [5, 0, 0], [0, 1, 0], 30)])))).toContain('machining.hole.intersecting');
    expect(rules(analyseGeometricDFM(ctx([a, hole('H3', 6, [5, 0, 20], [0, 1, 0], 30)])))).not.toContain('machining.hole.intersecting');
    expect(rules(analyseGeometricDFM(ctx([a, hole('H4', 6, [40, 0, 0], [0, 1, 0], 30)])))).not.toContain('machining.hole.intersecting');
    expect(rules(analyseGeometricDFM(ctx([a, hole('H5', 6, [0, 2, 0], [1, 0, 0], 40)])))).not.toContain('machining.hole.intersecting'); // parallel
  });
  it('six or more hole sizes is an advisory, priced as tool changes and CAM', () => {
    const feats = [3, 4, 5, 6, 8, 10].map((d, i) => hole(`H${i + 1}`, d, [i * 30, 0, 0], [0, 0, 1], 5));
    const f = analyseGeometricDFM(ctx(feats)).findings.find(x => x.ruleId === 'machining.hole.many-sizes')!;
    expect(f.measured.value).toBe(6);
    expect(f.costImpact!.perPartGBP).toBeCloseTo(5 * (6 / 3600) * 60, 4);
    expect(rules(analyseGeometricDFM(ctx(feats.slice(0, 5))))).not.toContain('machining.hole.many-sizes');
  });
});

describe('moulding core pins and die-cast cored holes', () => {
  const h = (o: Partial<ManufacturingFeature>): ManufacturingFeature =>
    ({ id: 'H1', kind: 'hole', faceIds: [1], diaMm: 6, depthMm: 15, ldRatio: 2.5, openEnds: 1, ...o });
  const im = (f: ManufacturingFeature) => rules(analyseGeometricDFM(ctx([f], { commodity: 'injection_moulding' })));
  it('blind ≤ 3×D (2×D under Ø5), through ≤ 6×D', () => {
    expect(im(h({}))).not.toContain('moulding.hole.core-pin-slender');
    expect(im(h({ ldRatio: 3.5, depthMm: 21 }))).toContain('moulding.hole.core-pin-slender');
    expect(im(h({ diaMm: 3.2, ldRatio: 2.5, depthMm: 8 }))).toContain('moulding.hole.core-pin-slender');
    expect(im(h({ ldRatio: 5, openEnds: 2, depthMm: 30 }))).not.toContain('moulding.hole.core-pin-slender');
  });
  it('NADCA table: Ø6.35 cores 25.4 mm, below Ø3.2 not cored; interpolated between', () => {
    expect(nadcaMaxCoredDepthMm(6.35)).toBeCloseTo(25.4, 6);
    expect(nadcaMaxCoredDepthMm(3)).toBeNull();
    expect(nadcaMaxCoredDepthMm(8)).toBeGreaterThan(25.4);
    expect(nadcaMaxCoredDepthMm(8)).toBeLessThan(38.1);
  });
  it('die casting only (the route must be known), and priced as the drilling that replaces the core', () => {
    const deep = h({ diaMm: 8, depthMm: 45 });
    const dc = analyseGeometricDFM(ctx([deep], { commodity: 'casting', process: 'hpdc' }));
    const f = dc.findings.find(x => x.ruleId === 'casting.hole.beyond-cored-depth')!;
    expect(f).toBeDefined();
    expect(f.costImpact?.kind).toBe('feature_cost');
    expect(rules(analyseGeometricDFM(ctx([deep], { commodity: 'casting', process: 'sand' })))).not.toContain('casting.hole.beyond-cored-depth');
    expect(rules(analyseGeometricDFM(ctx([deep], { commodity: 'casting' })))).not.toContain('casting.hole.beyond-cored-depth');
  });
});

describe('wall plausibility guard on the existing wall rules', () => {
  const part = ctx([], { commodity: 'injection_moulding' });
  it('a wall is between max(0.3, 0.2× median) and 5× median', () => {
    expect(plausibleWall(4, part)).toBe(true);
    expect(plausibleWall(0.2, part)).toBe(false);   // a graze at a sliver
    expect(plausibleWall(168, part)).toBe(false);   // a ray across the part
    expect(plausibleWall(4, ctx([], { featureSet: { available: true, features: [] } }))).toBe(false); // no median → silent
  });
  it('the ECU cover\'s "168 mm rib against 1.5 mm" no longer fires; a real 8 mm against 2.5 mm still does', () => {
    const face = (t: number, nb: number): ManufacturingFeature => ({ id: 'P1', kind: 'planar_face', faceIds: [1], thicknessMm: t, neighbourMinThicknessMm: nb, sectionRatio: t / nb });
    expect(rules(analyseGeometricDFM(ctx([face(168, 1.5)], { commodity: 'injection_moulding' })))).not.toContain('moulding.rib.thicker-than-0p6-wall');
    expect(rules(analyseGeometricDFM(ctx([face(8, 2.5)], { commodity: 'injection_moulding' })))).toContain('moulding.rib.thicker-than-0p6-wall');
    expect(rules(analyseGeometricDFM(ctx([face(27.8, 0.2)], { commodity: 'casting' })))).not.toContain('casting.section.abrupt-change');
  });
});

describe('independent-review regressions (OCP-built parts, recorded kernel output)', () => {
  const load = (n: string) => JSON.parse(readFileSync(`tests/fixtures/dfm/${n}`, 'utf8'));
  it('a drill-pointed blind hole is blind (it read "through" past the cone tip) — in DFM AND in the costing table', () => {
    const fx = load('pocket-block-features.json');
    const h = fx.manufacturingFeatures.features.find((f: ManufacturingFeature) => f.kind === 'hole');
    expect(h.openEnds).toBe(1);
    expect(h.openDirs).toEqual([[0, 0, 1]]);
    expect(fx.featureTable.find((r: { kind: string }) => r.kind === 'hole').through).toBe(false);
  });
  it('a pocket machinable from +Z is ONE setup with no long-reach or cutter finding (floor fillets are closed blends)', () => {
    const fx = load('pocket-block-features.json');
    const floors = fx.manufacturingFeatures.features.filter((f: ManufacturingFeature) => f.kind === 'fillet' && f.radiusMm === 1);
    expect(floors).toHaveLength(4);
    expect(floors.every((f: ManufacturingFeature) => f.toolReachMm === undefined && !f.openDirs)).toBe(true);
    const r = analyseGeometricDFM({ commodity: 'machining', featureSet: fx.manufacturingFeatures, cost: COST });
    expect(rules(r).filter(id => /setup|corner/.test(id))).toEqual([]);
  });
  it('a hole exiting a sloped face is one through hole (its halves end at different heights) — not two R4 "corners"', () => {
    const fx = load('sloped-hole-features.json');
    const feats: ManufacturingFeature[] = fx.manufacturingFeatures.features;
    expect(feats.filter(f => f.kind === 'hole').map(f => [f.diaMm, f.openEnds])).toEqual([[8, 2]]);
    expect(feats.some(f => f.kind === 'fillet' && f.radiusMm === 4)).toBe(false);
    expect(fx.featureTable.filter((r: { kind: string }) => r.kind === 'hole').map((r: { diaMm: number; through: boolean }) => [r.diaMm, r.through])).toEqual([[8, true]]);
  });
  it('a slot end (180°) is not a blend: no forging / casting corner finding on it', () => {
    const slotEnd: ManufacturingFeature = { id: 'FIL1', kind: 'fillet', faceIds: [1], radiusMm: 1, concave: true, sweepDeg: 180 };
    expect(rules(analyseGeometricDFM(ctx([slotEnd], { commodity: 'forging', process: 'closed-die' })))).toEqual([]);
    expect(rules(analyseGeometricDFM(ctx([{ ...slotEnd, radiusMm: 0.5 }], { commodity: 'casting' })))).toEqual([]);
  });
  it('a drafted wall never sets the frame (else every square bore on a casting reads "compound")', () => {
    const t = (3 * Math.PI) / 180;
    const feats: ManufacturingFeature[] = [
      { id: 'P1', kind: 'planar_face', faceIds: [1], axis: [Math.sin(t), 0, Math.cos(t)], areaMm2: 9000, draftClass: 'drafted' },
      plane('P2', [0, 0, 1], 2000), plane('P3', [1, 0, 0], 1000),
      { id: 'H5', kind: 'hole', faceIds: [5], diaMm: 10, depthMm: 20, axis: [0, 0, 1], openEnds: 1, openDirs: [[0, 0, 1]], positionMm: [0, 0, 0] },
    ];
    expect(rules(analyseGeometricDFM(ctx(feats, { commodity: 'cast_and_machine' })))).not.toContain('machining.hole.compound-angle');
  });
  it('a hole priced by three rules counts its cost once in the total', () => {
    const h: ManufacturingFeature = { id: 'H1', kind: 'hole', faceIds: [1], diaMm: 6.3, depthMm: 60, ldRatio: 9.5, openEnds: 1, axis: [0, 0, 1], positionMm: [0, 0, 0], openDirs: [[0, 0, 1]] };
    const r = analyseGeometricDFM(ctx([h]));
    const priced = r.findings.filter(f => f.featureId === 'H1' && f.costImpact);
    expect(priced.length).toBeGreaterThanOrEqual(2);
    expect(r.totalAddressableGBP).toBeCloseTo(priced[0].costImpact!.perPartGBP, 4);
  });
  it('the cored-hole rule takes the route in any case, and only blind holes the cost sheet assumes are cored', () => {
    const h: ManufacturingFeature = { id: 'H1', kind: 'hole', faceIds: [1], diaMm: 8, depthMm: 45, ldRatio: 5.6, openEnds: 1 };
    expect(rules(analyseGeometricDFM(ctx([h], { commodity: 'casting', process: 'HPDC' })))).toContain('casting.hole.beyond-cored-depth');
    expect(rules(analyseGeometricDFM(ctx([{ ...h, openEnds: 2 }], { commodity: 'casting', process: 'hpdc' })))).not.toContain('casting.hole.beyond-cored-depth');
    expect(rules(analyseGeometricDFM(ctx([{ ...h, diaMm: 5, depthMm: 40 }], { commodity: 'casting', process: 'hpdc' })))).not.toContain('casting.hole.beyond-cored-depth'); // drilled by the costing anyway
  });
});

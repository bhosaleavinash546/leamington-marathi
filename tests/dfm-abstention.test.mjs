// Why a DFM rule produced no verdict, and the sharp-corner measurement —
// both from the held-out DFM review of 28 Sept 2026.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAbstention, featureCensus, unlocksFrom } from '../dfm-abstention.mjs';
import { runDfmRules, extractMeasures } from '../dfm-rules.mjs';

const rule = (measure) => ({ id: 'x', measure });
const ran = (over = {}) => ({
  featureTable: over.table ?? [],
  dfm: {
    features: { method: 'hybrid', ribs: over.ribs ?? [], prismatic: over.prismatic ?? [],
      minInternalCornerRadiusMm: over.corner ?? null,
      sharpInternalEdges: over.sharp === undefined ? { count: 0, alongCutterAxis: 0, located: [] } : over.sharp },
    sheetMetal: over.sheet ?? { isSheetMetal: false },
    apertures: over.apertures ?? { count: 0, nonCircularCount: 0 },
  },
});

describe('classifyAbstention', () => {
  it('a missing alloy is an input to declare, carrying the source\'s own reason', () => {
    const a = classifyAbstention(rule('nadcaFilletToWall'), { _nadcaBasis: 'No material was given.' },
      featureCensus(ran({ corner: 2 })), {});
    assert.equal(a.kind, 'needs-input');
    assert.equal(a.input, 'material');
    assert.match(a.reason, /No material was given\. Declare the material/);
  });
  it('an alloy the published source does not cover is outside the source, not a geometry gap', () => {
    const a = classifyAbstention(rule('sfsaJunctionFilletMargin'),
      { _sfsaBasis: 'Cast Iron (Grey) is a cast iron. Graphite expansion ...' },
      featureCensus(ran({ sharp: { count: 4, alongCutterAxis: 0, located: [] } })), { material: 'Cast Iron (Grey)' });
    assert.equal(a.kind, 'outside-source');
  });
  it('tolerance, flatness, finish and stock are inputs, named as such', () => {
    const c = featureCensus(ran());
    assert.equal(classifyAbstention(rule('tightestToleranceMm'), {}, c, { material: 'm' }).input, 'tolerance');
    assert.equal(classifyAbstention(rule('nadca402FlatnessMargin'), {}, c, { material: 'm' }).input, 'flatness');
    assert.equal(classifyAbstention(rule('nadcaRoughnessMargin'), {}, c, { material: 'm' }).input, 'roughness');
    assert.equal(classifyAbstention(rule('sfsaMachiningStockMargin'), {}, c, { material: 'm' }).input, 'machiningStock');
  });
  it('feature absence wins over a missing alloy: no field unlocks a boss rule on a part with no bosses', () => {
    const a = classifyAbstention(rule('dupontBossOdToHole'), { _dupontBasis: 'PP is not a resin family Table 3.01 names' },
      featureCensus(ran()), { material: 'Polypropylene (PP)' });
    assert.equal(a.kind, 'not-applicable');
    assert.match(a.reason, /no bosses/);
  });
  it('one round hole is one hole, not two (it is also an aperture)', () => {
    const c = featureCensus(ran({ table: [{ kind: 'hole', count: 1 }], apertures: { count: 1, nonCircularCount: 0 } }));
    assert.equal(c.holes, 1);
    assert.equal(classifyAbstention(rule('minHoleToHoleToThickness'), {}, c, {}).kind, 'not-applicable');
  });
  it('NOT APPLICABLE NEEDS EVIDENCE: without a recogniser run it stays not-measured', () => {
    const a = classifyAbstention(rule('maxBossHeightToDia'), {}, featureCensus({ dfm: {} }), {});
    assert.equal(a.kind, 'not-measured');
  });
  it('corners are "none" only when both passes spoke', () => {
    const noSharpData = ran({ sharp: null });
    assert.equal(featureCensus(noSharpData).corners, null, 'an older recogniser cannot say there are no corners');
    assert.equal(featureCensus(ran()).corners, 0);
  });
  it('unlocks group the needs-input rows by input, most rules first', () => {
    const rows = [
      { id: 'a', abstention: { kind: 'needs-input', input: 'tolerance' } },
      { id: 'b', abstention: { kind: 'needs-input', input: 'material' } },
      { id: 'c', abstention: { kind: 'needs-input', input: 'material' } },
      { id: 'd', abstention: { kind: 'not-applicable' } },
    ];
    const u = unlocksFrom(rows);
    assert.deepEqual(u.map(x => [x.input, x.count]), [['material', 2], ['tolerance', 1]]);
    assert.equal(u[0].label, 'Material / alloy');
  });
});

describe('coverage is over the rules that apply', () => {
  it('rules about absent features leave the denominator; missing inputs stay in it', () => {
    const r = runDfmRules(ran({ corner: 3 }), 'machining', {});
    assert.equal(r.applicableCount, r.ruleCount - r.notApplicableCount);
    assert.ok(r.notApplicableCount > 0, 'a part with no holes or pockets has rules that do not apply');
    assert.ok(r.needsInputCount >= 1, 'the tolerance rule still needs an input');
    assert.equal(r.coveragePct, Math.round((r.evaluatedCount / r.applicableCount) * 1000) / 10);
    for (const row of r.notEvaluated) assert.ok(row.abstention?.kind, `${row.id} carries a classification`);
  });
});

describe('sharp internal corners are measured as radius 0, per process', () => {
  const geo = ran({ sharp: { count: 8, alongCutterAxis: 0, located: [{ midXYZ: [1, 2, 3], lenMm: 30, alongCutterAxis: false }] } });
  it('a cutter leaves a sharp FLOOR edge, so machining ignores corners not along its axis', () => {
    assert.equal(extractMeasures(geo, { process: 'machining' }).minInternalCornerRadiusMm, undefined);
  });
  it('a casting needs a fillet in every internal corner', () => {
    const m = extractMeasures(geo, { process: 'hpdc' });
    assert.equal(m.minInternalCornerRadiusMm, 0);
    assert.match(m._cornerBasis, /Modelled sharp: 8 internal edges/);
  });
  it('corners along the cutter axis fail machining, located and labelled', () => {
    const g = ran({ sharp: { count: 4, alongCutterAxis: 4, located: [{ midXYZ: [14, 10, 22], lenMm: 36, alongCutterAxis: true }] } });
    const r = runDfmRules(g, 'machining', {});
    const f = r.findings.find(x => x.id === 'mach-internal-corner-radius');
    assert.ok(f, 'the corner rule fails');
    assert.equal(f.measured, 0);
    assert.match(f.measuredBasis, /Modelled sharp: 4 internal edges .* along the cutter axis/);
    assert.deepEqual(f.instances[0].atXYZ, [14, 10, 22]);
  });
  it('a real radius still wins when there are no sharp corners', () => {
    const m = extractMeasures(ran({ corner: 2.5 }), { process: 'hpdc' });
    assert.equal(m.minInternalCornerRadiusMm, 2.5);
    assert.equal(m._cornerBasis, undefined);
  });
});

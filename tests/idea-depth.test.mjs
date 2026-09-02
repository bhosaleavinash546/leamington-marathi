// The depth rubric must DISCRIMINATE. Its whole reason to exist is that the
// completeness score gave 100 to all 63 ideas of four live runs; a rubric
// that a shallow idea can max out is the same failure with a new name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDepth, depthSummary, findGrade, findQuantities, DEPTH_WEIGHTS, ENGINEERING_SECTIONS } from '../idea-depth.mjs';

const deep = {
  title: 'Downgauge to 0.6 mm DP780, delete the doubler',
  technicalDescription: 'Re-engineer the 0.75 mm CR4 bracket into 0.6 mm DP780 dual-phase steel (Rm ≥ 780 MPa). Bending stiffness scales with t³, so the 17 bends gain 2 mm deeper draw beads; mass drops from 0.21 kg to 0.155 kg.',
  manufacturingImpact: 'Same transfer line; press tonnage +15%; springback recompensation on the die.',
  riskNotes: 'Springback risks the 0.5 mm hinge alignment — validate with die compensation, first-article CMM and a 20k-cycle slam rig test.',
  dfmaPrinciples: ['Part consolidation', 'Eliminate the spot-welded doubler'],
  evidenceRefs: ['E3', 'E4', 'W2'],
  engineering: {
    mechanism: 'Higher yield (450 vs 180 MPa) resists permanent set; t³ stiffness loss compensated by bead depth — the governing constraint is elastic limit under repeated slam load.',
    specDeltas: 'Gauge 0.75 → 0.60 mm; grade CR4 → DP780 (EN 10338); bend radius ≥ 2.5t on the tightest bends; doubler part number deleted.',
    validationPlan: 'CAE modal + slam fatigue, then physical rig 20k cycles, CMM on 30 first-article parts, peel tests on the re-tuned weld schedule.',
    dfmImplications: 'Fewer parts and welds; higher press tonnage; nitrided die steel for AHSS wear; springback compensation adds one die iteration.',
    costBridge: 'Material €0.20 × 26% mass cut ≈ €0.05/part plus doubler and weld deletion €0.30–0.60/part against the €1.32 engine baseline.',
  },
};

const shallow = {
  title: 'Use higher-strength steel',
  technicalDescription: 'Switch the bracket to a higher-strength steel so the gauge can come down and material cost falls while keeping stiffness acceptable for the application.',
  manufacturingImpact: 'Existing line.',
  riskNotes: 'Some risk of springback.',
  dfmaPrinciples: [],
  evidenceRefs: ['E99'],
};

const ids = new Set(['E1', 'E2', 'E3', 'E4', 'W1', 'W2']);

test('a worked idea scores 100 and a family-level restatement scores far below it', () => {
  const d = scoreDepth(deep, { evidenceIds: ids });
  const s = scoreDepth(shallow, { evidenceIds: ids });
  assert.equal(d.score, 100);
  assert.deepEqual(d.missing, []);
  assert.ok(s.score <= 20, `shallow idea scored ${s.score}`);
  assert.ok(s.missing.includes('grade') && s.missing.includes('mechanism') && s.missing.includes('validation') && s.missing.includes('evidence') && s.missing.includes('sections'));
  assert.ok(d.score - s.score >= 60, 'the rubric must separate depth from prose by a wide margin');
});

test('weights sum to 100 and 100 is unreachable without the engineering sections', () => {
  assert.equal(Object.values(DEPTH_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const noSections = scoreDepth({ ...deep, engineering: undefined }, { evidenceIds: ids });
  assert.equal(noSections.score, 100 - DEPTH_WEIGHTS.sections);
  assert.deepEqual(noSections.missing, ['sections']);
  // A thin section does not count.
  const thin = scoreDepth({ ...deep, engineering: { ...deep.engineering, costBridge: 'see above' } }, { evidenceIds: ids });
  assert.ok(!thin.criteria.sections.met);
  assert.match(thin.criteria.sections.detail, /costBridge/);
  assert.equal(ENGINEERING_SECTIONS.length, 5);
});

test('evidence refs must RESOLVE to dossier lines, not merely look like refs', () => {
  const ok = scoreDepth({ ...deep, evidenceRefs: ['E1'] }, { evidenceIds: ids });
  assert.ok(ok.criteria.evidence.met);
  const bad = scoreDepth({ ...deep, evidenceRefs: ['E1', 'E42'] }, { evidenceIds: ids });
  assert.ok(!bad.criteria.evidence.met);
  assert.match(bad.criteria.evidence.detail, /E42/);
  const none = scoreDepth({ ...deep, evidenceRefs: [] }, { evidenceIds: ids });
  assert.ok(!none.criteria.evidence.met);
});

test('without a dossier the evidence criterion falls back to dated, titled sources and says so', () => {
  const withSrc = scoreDepth({ ...deep, evidenceRefs: undefined, evidenceSources: [{ type: 'teardown', title: 'Zeekr 001 rocker teardown', year: 2023, confidence: 'high' }] });
  assert.ok(withSrc.criteria.evidence.met);
  assert.match(withSrc.criteria.evidence.detail, /no dossier/);
  const undated = scoreDepth({ ...deep, evidenceRefs: undefined, evidenceSources: [{ type: 'teardown', title: 'Some teardown', confidence: 'high' }] });
  assert.ok(!undated.criteria.evidence.met);
});

test('grade detection names designations and refuses families', () => {
  for (const s of ['DP780', 'EN AW-6082 T6', 'A356-T6', 'GJS-450-10', 'PA66-GF30', 'M250-35A', 'NO30', 'N42UH', 'AZ91D', 'Cu-ETP', '22MnB5', 'EN 10130 DC04', 'ISO 26262', 'Silafont-36', 'EN AC-46000']) {
    assert.ok(findGrade(`uses ${s} here`), `should detect ${s}`);
  }
  for (const s of ['high-strength steel', 'aluminium alloy', 'glass-filled nylon', 'thinner lamination', 'ferrite magnet']) {
    assert.equal(findGrade(s), null, `should not accept family "${s}"`);
  }
});

test('mechanism needs two quantities with units AND a stated change', () => {
  assert.ok(scoreDepth({ technicalDescription: 'Wall 3.0 mm → 2.2 mm cuts mass from 1.2 kg to 0.9 kg.' }).criteria.mechanism.met);
  assert.ok(!scoreDepth({ technicalDescription: 'The wall is 3.0 mm and the mass is 1.2 kg.' }).criteria.mechanism.met, 'no change stated');
  assert.ok(!scoreDepth({ technicalDescription: 'Reduce the wall to 2.2 mm.' }).criteria.mechanism.met, 'only one quantity');
  assert.deepEqual(findQuantities('€82,920 at 60,000 units; 0.6 mm; 780 MPa; 12%'), ['0.6 mm', '780 MPa']);
});

test('depthSummary reports spread and per-criterion hit rates', () => {
  const ideas = [
    { depth: scoreDepth(deep, { evidenceIds: ids }) },
    { depth: scoreDepth(shallow, { evidenceIds: ids }) },
    { depth: scoreDepth({ ...deep, engineering: undefined }, { evidenceIds: ids }) },
  ];
  const s = depthSummary(ideas);
  assert.equal(s.n, 3);
  assert.equal(s.max, 100);
  assert.ok(s.spread >= 60);
  assert.equal(s.criteriaHitPct.sections, 33);
  assert.deepEqual(depthSummary([]), { n: 0, min: null, median: null, max: null, spread: null, criteriaHitPct: {} });
});

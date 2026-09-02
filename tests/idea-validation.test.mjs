import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdeas, validateIdea, parsePercent } from '../idea-validation.mjs';

const goodIdea = {
  id: 'roll-formed-sill',
  title: 'Roll-formed sill replacing stamped assembly',
  technicalDescription: 'Replace the four-piece stamped sill assembly with a single roll-formed CR340LA profile at 1.4 mm instead of 1.6 mm, eliminating 12 spot welds and two stamping dies while holding the same 42 kN·m section modulus for side-impact load paths.',
  manufacturingImpact: 'Deletes two stamping dies and a weld cell; line labour drops 1.1 min/veh.',
  costSavingTypes: ['process', 'tooling'],
  costSavingPotential: { qualitative: 'High — part consolidation', percentage: '12-18%', annualValue: '€1.2M', calculationBasis: '€8/veh × 150k', paybackMonths: 14 },
  implementationDifficulty: 'Medium',
  riskNotes: 'Validate side-pole intrusion vs stamped baseline with a full-vehicle CAE correlation and two physical sled tests.',
  dfmaPrinciples: ['Part consolidation', 'Eliminate welds'],
  engineering: {
    mechanism: 'A continuous roll-formed section carries the side-impact load without the weld-flange discontinuities that force the stamped design to 1.6 mm; the closed profile raises second moment of area by 18%.',
    specDeltas: 'Gauge 1.6 → 1.4 mm; grade CR340LA per EN 10268; 12 spot welds and two die sets deleted; new roll-form tooling for the 4.2 m profile.',
    validationPlan: 'CAE side-pole and IIHS small-overlap correlation, then two sled tests; PPAP on the roll-form supplier with Cpk ≥ 1.33 on the section height.',
    dfmImplications: 'One part number replaces four; no weld fixture; roll-form radius limits set the minimum flange; end-trim by laser adds one station.',
    costBridge: 'Material −€2.1/veh from gauge, conversion −€4.3 from deleted welds and dies amortised, logistics −€1.6 from one part; €8/veh net × 150k.',
  },
  systemLevel: 'Part',
  timeToImplement: '12-18 months',
  benchmarkReference: 'Zeekr 001 rocker, 2023',
  confidenceLevel: 'benchmarked',
  evidenceSources: [{ type: 'teardown', title: 'Zeekr teardown', year: 2023, confidence: 'high' }],
  regulatoryContext: null,
};

test('parsePercent extracts leading number', () => {
  assert.equal(parsePercent('12-18%'), 12);
  assert.equal(parsePercent('5%'), 5);
  assert.equal(parsePercent(7), 7);
  assert.equal(parsePercent('n/a'), null);
});

test('parsePercent does not read a percentage out of a thousands separator', () => {
  // Live-run false flag: this exact string from a real knuckle idea was read
  // as 920% (the tail of "82,920") and tripped the implausibility band.
  assert.equal(parsePercent('tooling avoidance €82,920; 4-8% on bridge/launch volumes'), 4);
  assert.equal(parsePercent('€1,250/part is 12% of spend'), 12);
});

test('a well-formed, deep idea passes with no flags and high quality', () => {
  const v = validateIdea(goodIdea);
  assert.ok(v);
  assert.deepEqual(v.validationFlags, []);
  assert.ok(v.qualityScore >= 90, `quality ${v.qualityScore}, missing ${v.depth.missing}`);
  assert.equal(v.depth.score, 100);
  assert.equal(v.grade.named, 'CR340LA');
  assert.deepEqual(Object.keys(v.engineering), ['mechanism', 'specDeltas', 'validationPlan', 'dfmImplications', 'costBridge']);
});

test('qualityScore is technical DEPTH, not completeness — a complete but shallow idea scores low', () => {
  // Every field filled, nothing checkable: no grade, no quantities, no
  // validation activity, no DFM principle, no engineering sections.
  const shallow = {
    ...goodIdea, title: 'Use a cheaper steel', engineering: undefined,
    technicalDescription: 'Move the sill to a cheaper steel grade so material cost falls while keeping the structure adequate for side impact, which should be acceptable for this application in most markets.',
    riskNotes: 'Some risk to crash performance which needs consideration by the team.',
    dfmaPrinciples: ['Cheaper'],
  };
  const v = validateIdea(shallow);
  assert.deepEqual(v.validationFlags, [], 'completeness alone raises no flag');
  assert.ok(v.qualityScore <= 20, `shallow idea scored ${v.qualityScore}`);
  assert.ok(v.depth.missing.includes('grade') && v.depth.missing.includes('mechanism') && v.depth.missing.includes('sections'));
});

test('evidence refs must resolve to real dossier lines when the ids are known', () => {
  const v = validateIdea({ ...goodIdea, evidenceRefs: ['E1', 'E77', 'W2'] }, 0, { hasEvidence: true, evidenceIds: ['E1', 'E2', 'W1', 'W2'] });
  assert.deepEqual(v.evidenceRefs, ['E1', 'W2']);
  assert.ok(v.validationFlags.some(f => f === 'unresolvable-evidence-ref(E77)'));
  const none = validateIdea({ ...goodIdea, evidenceRefs: ['E77'] }, 0, { hasEvidence: true, evidenceIds: ['E1'] });
  assert.equal(none.evidenceRefs, undefined);
  assert.ok(none.validationFlags.includes('uncited-in-evidence-mode'));
});

test('a named grade is resolved against the engine catalogue when one is supplied', () => {
  const materials = { 'Steel (high-strength)': { density: 7.85, price: 1.1, family: 'ferrous' }, 'Aluminium 6061': { density: 2.7, price: 2.85, family: 'aluminium' } };
  const v = validateIdea(goodIdea, 0, { materials });
  assert.equal(v.grade.named, 'CR340LA');
  assert.equal(v.grade.catalogueKey, 'Steel (high-strength)');
  assert.ok(!v.validationFlags.some(f => f.startsWith('grade-not-in-library')));
  const exotic = validateIdea({
    ...goodIdea, title: 'Switch to PEEK-CF30',
    technicalDescription: goodIdea.technicalDescription.replace('CR340LA', 'PEEK-CF30'),
    engineering: { ...goodIdea.engineering, specDeltas: goodIdea.engineering.specDeltas.replace('grade CR340LA per EN 10268', 'grade PEEK-CF30') },
  }, 0, { materials });
  assert.equal(exotic.grade.named, 'PEEK-CF30');
  assert.equal(exotic.grade.catalogueKey, null);
  assert.ok(exotic.validationFlags.includes('grade-not-in-library(PEEK-CF30)'));
});

test('drops entries that are not objects or carry no information', () => {
  const { ideas, summary } = validateIdeas([null, 'x', 42, {}, { title: '', technicalDescription: '' }]);
  assert.equal(ideas.length, 0);
  assert.equal(summary.dropped, 5);
});

test('coerces invalid enums to safe defaults and flags them', () => {
  const v = validateIdea({ ...goodIdea, implementationDifficulty: 'Trivial', systemLevel: 'Galaxy', confidenceLevel: 'absolute', costSavingTypes: ['wishful'] });
  assert.equal(v.implementationDifficulty, 'Medium');
  assert.equal(v.systemLevel, 'Part');
  assert.equal(v.confidenceLevel, 'estimated');
  assert.deepEqual(v.costSavingTypes, ['process']);
  assert.ok(v.validationFlags.includes('defaulted-difficulty'));
  assert.ok(v.validationFlags.includes('defaulted-system-level'));
});

test('flags implausible saving percentage', () => {
  const v = validateIdea({ ...goodIdea, costSavingPotential: { ...goodIdea.costSavingPotential, percentage: '85%' } });
  assert.ok(v.validationFlags.some(f => f.startsWith('implausible-saving-pct')));
});

test('nulls out implausible payback', () => {
  const v = validateIdea({ ...goodIdea, costSavingPotential: { ...goodIdea.costSavingPotential, paybackMonths: 400 } });
  assert.equal(v.costSavingPotential.paybackMonths, null);
  assert.ok(v.validationFlags.some(f => f.startsWith('implausible-payback')));
});

test('downgrades "verified" with no evidence', () => {
  const v = validateIdea({ ...goodIdea, confidenceLevel: 'verified', evidenceSources: [] });
  assert.equal(v.confidenceLevel, 'estimated');
  assert.ok(v.validationFlags.includes('verified-without-evidence'));
});

test('sanitises bad evidence sources and out-of-range years', () => {
  const v = validateIdea({ ...goodIdea, evidenceSources: [{ type: 'nonsense', title: 'X', year: 1700, confidence: 'extreme' }] });
  assert.equal(v.evidenceSources[0].type, 'web_search');
  assert.equal(v.evidenceSources[0].confidence, 'low');
  assert.equal(v.evidenceSources[0].year, undefined);
});

test('caps confidence and marks evidence unverified when search did not run', () => {
  const v = validateIdea(goodIdea, 0, { searchExecuted: false });
  assert.equal(v.confidenceLevel, 'estimated');            // benchmarked → estimated
  assert.equal(v.evidenceUnverified, true);
  assert.ok(v.evidenceSources.every(s => s.confidence === 'low'));
  assert.ok(v.validationFlags.includes('confidence-capped-no-search'));
});

test('preserves confidence only when live search ran AND the idea used it', () => {
  const backed = validateIdea({ ...goodIdea, searchDataUsed: true }, 0, { searchExecuted: true });
  assert.equal(backed.confidenceLevel, 'benchmarked');
  assert.equal(backed.evidenceUnverified, false);
  assert.equal(backed.searchDataUsed, true);
  // search ran for the batch, but THIS idea didn't use it → still unverified
  const notBacked = validateIdea({ ...goodIdea, searchDataUsed: false }, 0, { searchExecuted: true });
  assert.equal(notBacked.evidenceUnverified, true);
  assert.equal(notBacked.confidenceLevel, 'estimated');
});

test('no context leaves confidence untouched (unknown provenance)', () => {
  const v = validateIdea(goodIdea);
  assert.equal(v.confidenceLevel, 'benchmarked');
  assert.equal(v.evidenceUnverified, undefined);
});

test('normalises the literal string "null" regulatoryContext to null', () => {
  const v = validateIdea({ ...goodIdea, regulatoryContext: 'null' });
  assert.equal(v.regulatoryContext, null);
});

test('batch summary reports counts and average quality', () => {
  const { summary } = validateIdeas([goodIdea, { ...goodIdea, id: 'b', benchmarkReference: '' }, null]);
  assert.equal(summary.total, 3);
  assert.equal(summary.kept, 2);
  assert.equal(summary.dropped, 1);
  assert.ok(summary.avgQuality > 0 && summary.avgQuality <= 100);
});

test('evidenceRefs: keeps only [E#]/[W#] ids, dedupes, caps at 8', () => {
  const v = validateIdea({ ...goodIdea, evidenceRefs: ['E1', 'W2', 'E1', 'bogus', 'E999999', 42, ' E3 ', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'] });
  assert.ok(v.evidenceRefs.every(r => /^[EW]\d{1,3}$/.test(r)));
  assert.ok(!v.evidenceRefs.includes('bogus'));
  assert.equal(new Set(v.evidenceRefs).size, v.evidenceRefs.length);
  assert.ok(v.evidenceRefs.length <= 8);
  assert.ok(v.evidenceRefs.includes('E3'), 'whitespace-padded refs are trimmed, not dropped');
});

test('evidenceRefs: absent stays absent — no empty-array fabrication outside evidence mode', () => {
  const v = validateIdea(goodIdea);
  assert.equal(v.evidenceRefs, undefined);
  assert.ok(!v.validationFlags.includes('uncited-in-evidence-mode'));
});

test('flags an uncited idea only when a dossier was actually supplied', () => {
  const uncited = validateIdea(goodIdea, 0, { hasEvidence: true });
  assert.ok(uncited.validationFlags.includes('uncited-in-evidence-mode'));
  const cited = validateIdea({ ...goodIdea, evidenceRefs: ['W1', 'E4'] }, 0, { hasEvidence: true });
  assert.ok(!cited.validationFlags.includes('uncited-in-evidence-mode'));
  assert.deepEqual(cited.evidenceRefs, ['W1', 'E4']);
  // refs that all fail the pattern are as good as no refs
  const junk = validateIdea({ ...goodIdea, evidenceRefs: ['see dossier'] }, 0, { hasEvidence: true });
  assert.ok(junk.validationFlags.includes('uncited-in-evidence-mode'));
  // and the flag costs quality, so uncited ideas rank below cited peers
  assert.ok(uncited.qualityScore < validateIdea(goodIdea, 0, { hasEvidence: false }).qualityScore);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdeas, validateIdea, parsePercent } from '../idea-validation.mjs';

const goodIdea = {
  id: 'roll-formed-sill',
  title: 'Roll-formed sill replacing stamped assembly',
  technicalDescription: 'Replace the four-piece stamped sill assembly with a single roll-formed CR340LA profile, eliminating 12 spot welds and two stamping dies while holding the same section modulus for side-impact load paths.',
  manufacturingImpact: 'Deletes two stamping dies and a weld cell; line labour drops 1.1 min/veh.',
  costSavingTypes: ['process', 'tooling'],
  costSavingPotential: { qualitative: 'High — part consolidation', percentage: '12-18%', annualValue: '€1.2M', calculationBasis: '€8/veh × 150k', paybackMonths: 14 },
  implementationDifficulty: 'Medium',
  riskNotes: 'Validate side-pole intrusion vs stamped baseline.',
  dfmaPrinciples: ['Part consolidation', 'Eliminate welds'],
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

test('a well-formed idea passes with no flags and high quality', () => {
  const v = validateIdea(goodIdea);
  assert.ok(v);
  assert.deepEqual(v.validationFlags, []);
  assert.ok(v.qualityScore >= 90);
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

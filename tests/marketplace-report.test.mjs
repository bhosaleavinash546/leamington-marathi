// The judgements behind the Marketplace PDF exports, pinned. The renderer
// draws whatever these functions decide — so what they decide must be tested:
// an unverified idea can never export under a verified-sounding label, absent
// fields never grow headings, and the catalogue cover names its own filter.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIdeaData, provenanceLabel, benchmarkLine, savingsLines,
  ideaSections, filterLine, verifiedSplit,
} from '../src/services/marketplace-report.mjs';

const row = (over = {}) => ({
  id: 'x1', title: 'T', system: 'Battery Pack', costSavingType: 'Material',
  annualSaving: '€1M', difficulty: 'Low', timeToImplement: '6 months',
  stars: 0, verified: 0, description: 'flat description', ideaData: null,
  origin: 'curated', ...over,
});

describe('marketplace report core', () => {
  it('parseIdeaData degrades corrupt or absent blobs to null, never throws', () => {
    assert.equal(parseIdeaData(null), null);
    assert.equal(parseIdeaData(''), null);
    assert.equal(parseIdeaData('{not json'), null);
    assert.equal(parseIdeaData('"a string"'), null);
    assert.deepEqual(parseIdeaData('{"a":1}'), { a: 1 });
    assert.deepEqual(parseIdeaData({ a: 2 }), { a: 2 });
  });

  it('an unverified idea NEVER exports under a verified-sounding label', () => {
    const label = provenanceLabel(row({ verified: 0 }), { confidenceLevel: 'estimated' });
    assert.match(label, /^UNVERIFIED/);
    assert.match(label, /AI-generated/);
    assert.match(label, /estimated/);
    assert.ok(!/^VERIFIED/.test(label));
    // and community origin is reflected, not erased
    assert.match(provenanceLabel(row({ verified: 0, origin: 'community' }), null), /community-submitted/);
  });

  it('a verified idea still says its savings are estimates', () => {
    const label = provenanceLabel(row({ verified: 1 }), null);
    assert.match(label, /^VERIFIED/);
    assert.match(label, /estimates/);
  });

  it('benchmarkLine prefers the structured anchor and never fabricates one', () => {
    assert.equal(benchmarkLine(null), null);
    assert.equal(benchmarkLine({}), null);
    assert.equal(benchmarkLine({ benchmarkReference: 'ref text' }), 'ref text');
    const line = benchmarkLine({
      benchmarkReference: 'ignored',
      benchmarkAnchor: { platform: 'BYD Blade / CTB', borrowedFeature: 'CTB floor', difference: 'keeps modules' },
    });
    assert.match(line, /^Inspired by \/ benchmarked against: BYD Blade/);
    assert.match(line, /Borrowed: CTB floor/);
    assert.match(line, /Differs: keeps modules/);
  });

  it('savings lines carry the "estimated" honesty and only stated values', () => {
    assert.deepEqual(savingsLines(null), []);
    const lines = savingsLines({ annualValue: '€2M at 100k/yr', calculationBasis: 'a × b' });
    assert.equal(lines.length, 2);
    assert.match(lines[0], /estimated/);
    assert.match(lines[1], /^Basis: /);
  });

  it('sections appear only for fields that exist — no headings over empty space', () => {
    const full = ideaSections(row(), {
      technicalDescription: 'tech', costReductionMechanism: 'mech', dfmDfa: 'dfm',
      riskNotes: 'risk', costSavingPotential: { percentage: '2%' },
    });
    assert.deepEqual(full.map(s => s[0]), [
      'Technical description', 'Cost-reduction mechanism', 'DFM / DFA',
      'Risk & validation', 'Cost-saving potential (estimated)',
    ]);
    // no manufacturingImpact heading, no benchmark heading — they were absent
    assert.ok(!full.some(s => s[0] === 'Manufacturing impact'));
    assert.ok(!full.some(s => s[0] === 'Benchmark'));
    // legacy entry with no ideaData falls back to the flat description
    const legacy = ideaSections(row(), null);
    assert.deepEqual(legacy, [['Description', 'flat description']]);
  });

  it('the catalogue cover names every active filter and only active ones', () => {
    assert.equal(filterLine({}), 'No filters — full library');
    assert.equal(filterLine({ commodity: 'All', system: 'All Systems', difficulty: 'All' }), 'No filters — full library');
    const line = filterLine({ searchQ: 'busbar', commodity: 'EDU', difficulty: 'Low', sortBy: 'saving' });
    assert.match(line, /Search: "busbar"/);
    assert.match(line, /Commodity: EDU/);
    assert.match(line, /Difficulty: Low/);
    assert.match(line, /Sorted by: saving/);
    assert.ok(!/System:/.test(line));
  });

  it('verifiedSplit counts honestly', () => {
    assert.deepEqual(verifiedSplit([{ verified: 1 }, { verified: 0 }, { verified: 0 }]),
      { verified: 1, unverified: 2, total: 3 });
    assert.deepEqual(verifiedSplit([]), { verified: 0, unverified: 0, total: 0 });
  });
});

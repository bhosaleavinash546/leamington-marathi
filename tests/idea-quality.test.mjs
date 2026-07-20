// Diversity, dedup and ranking mechanics + kb-pack integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ideaSimilarity, batchDiversity, dedupeIdeas, parseAnnualValueMid, rankIdeas } from '../idea-quality.mjs';

const mk = (title, desc, extra = {}) => ({ title, technicalDescription: desc, qualityScore: 80, costSavingPotential: {}, ...extra });

test('ideaSimilarity: identical text ≈1, disjoint text = 0', () => {
  const a = mk('Aluminium HPDC housing consolidation', 'Replace three stamped steel brackets with one A380 HPDC casting');
  assert.ok(ideaSimilarity(a, { ...a }) > 0.99);
  const b = mk('Hairpin winding copper reduction', 'Rectangular bar conductors lift slot fill and cut copper mass');
  assert.ok(ideaSimilarity(a, b) < 0.1);
});

test('batchDiversity: homogeneous batch scores far lower than diverse batch', () => {
  const diverse = [
    mk('Hairpin winding', 'Rectangular copper bar conductors lift slot fill from 45 to 70 percent'),
    mk('Hollow rotor shaft', 'Flow-formed hollow shaft cuts mass and enables oil-through cooling'),
    mk('Commonise bearings', 'Single deep-groove bearing SKU across three motor variants'),
    mk('Delete resolver', 'Inductive position sensor replaces resolver at lower cost'),
  ];
  const homogeneous = [
    mk('Hairpin winding for stator', 'Rectangular copper bar conductors lift slot fill and cut copper'),
    mk('Bar winding conversion', 'Rectangular copper bar conductors improve slot fill reducing copper'),
    mk('Flat wire winding', 'Rectangular copper conductors lift slot fill and reduce copper mass'),
    mk('Hairpin stator upgrade', 'Copper bar conductors raise slot fill and cut copper mass'),
  ];
  const d1 = batchDiversity(diverse);
  const d2 = batchDiversity(homogeneous);
  assert.ok(d1.diversityScore > d2.diversityScore + 20, `diverse ${d1.diversityScore} vs homogeneous ${d2.diversityScore}`);
  assert.ok(d2.nearDupPairs.length >= 3, 'homogeneous batch has many near-dup pairs');
  assert.equal(batchDiversity([mk('one', 'idea')]).diversityScore, 100, 'single idea is trivially diverse');
});

test('dedupeIdeas: merges near-duplicates keeping the higher-quality idea, leaves distinct ideas alone', () => {
  const ideas = [
    mk('Hairpin winding conversion', 'Rectangular copper bar conductors lift slot fill from 45 to 70 percent cutting copper mass', { qualityScore: 70 }),
    mk('Bar winding for stator', 'Rectangular copper bar conductors lift slot fill cutting copper mass significantly', { qualityScore: 90 }),
    mk('Hollow rotor shaft', 'Flow-formed hollow shaft cuts mass and enables oil-through cooling', { qualityScore: 60 }),
  ];
  const { ideas: out, merged } = dedupeIdeas(ideas);
  assert.equal(out.length, 2);
  assert.equal(merged.length, 1);
  const survivor = out.find(i => i.title === 'Bar winding for stator');
  assert.ok(survivor, 'higher-quality duplicate survives');
  assert.deepEqual(survivor.mergedTitles, ['Hairpin winding conversion']);
  assert.ok(out.some(i => i.title === 'Hollow rotor shaft'), 'distinct idea untouched');
});

test('parseAnnualValueMid: ranges, K/M suffixes, currencies', () => {
  assert.equal(parseAnnualValueMid('£350K–£650K at 80,000 units/yr'), 500_000);
  assert.equal(parseAnnualValueMid('€1.2M'), 1_200_000);
  assert.equal(parseAnnualValueMid('$40k'), 40_000);
  assert.equal(parseAnnualValueMid(''), 0);
  assert.equal(parseAnnualValueMid(undefined), 0);
});

test('rankIdeas: engine-contradicted sinks, taste match boosts, basis is explainable', () => {
  const ideas = [
    mk('Confirmed idea', 'x', { costSavingPotential: { annualValue: '£400K', paybackMonths: 6 }, engineCheck: { direction: 'confirmed' } }),
    mk('Contradicted idea', 'x', { costSavingPotential: { annualValue: '£400K', paybackMonths: 6 }, engineCheck: { direction: 'contradicted' } }),
    mk('Taste-matched idea', 'x', { costSavingPotential: { annualValue: '£400K', paybackMonths: 6 }, tasteMatch: { title: 'Prior approved idea', score: 9 } }),
    mk('No value idea', 'x', { costSavingPotential: {} }),
  ];
  rankIdeas(ideas);
  const s = Object.fromEntries(ideas.map(i => [i.title, i.rank.score]));
  assert.ok(s['Confirmed idea'] > s['Contradicted idea'] * 2, 'contradiction sinks hard');
  assert.ok(s['Taste-matched idea'] > s['Contradicted idea'], 'taste boost beats contradiction');
  assert.ok(s['No value idea'] < 10, 'value-less ideas rank at the bottom');
  assert.match(ideas[1].rank.basis, /engine contradicted/);
  assert.match(ideas[2].rank.basis, /previously approved/);
  assert.match(ideas[3].rank.basis, /no annual value/);
});

test('kb-pack.json: generated pack is present, complete, and shaped for the prompt', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pack = JSON.parse(readFileSync(join(ROOT, 'kb-pack.json'), 'utf8'));
  const domains = Object.keys(pack.domains);
  assert.ok(domains.length >= 13, `expected ≥13 domains, got ${domains.length}`);
  for (const [domain, comps] of Object.entries(pack.domains)) {
    assert.ok(Array.isArray(comps) && comps.length > 0, `${domain} has components`);
    for (const c of comps) {
      assert.ok(c.id && c.name, `${domain} component has id+name`);
      assert.ok(c.items.length > 0 && c.items.every(i => i.t), `${domain}/${c.id} has levers with titles`);
    }
  }
  // The ids the CONTEXT_MAPs use must resolve in the pack (spot-check EDU).
  assert.ok(pack.domains.edu.some(c => c.id === 'stator-winding'), 'edu ids align with CONTEXT_MAP vocabulary');
});

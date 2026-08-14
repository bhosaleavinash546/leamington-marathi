// Diversity, dedup and ranking mechanics + kb-pack integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ideaSimilarity, batchDiversity, dedupeIdeas, parseAnnualValueMid, rankIdeas, similarityMatches, clusterIdeas } from '../idea-quality.mjs';

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

// An idea's annual value is a free-text figure the MODEL wrote. It was also
// the dominant, unbounded term in the ranking score, while engine confirmation
// was a trailing ×1.2. So an idea that simply overstated itself outranked one
// the engine had actually checked — the pipeline rewarded inflation. The claim
// is now winsorised against the batch so a runaway number cannot buy the top
// slot, and the cap is stated in the basis rather than applied silently.
test('rankIdeas: an inflated self-reported claim cannot run away from an engine-confirmed idea', () => {
  const solid = { costSavingPotential: { annualValue: '£400K', paybackMonths: 6 }, engineCheck: { direction: 'confirmed' } };
  const ideas = [
    mk('Engine-confirmed', 'x', solid),
    mk('Peer A', 'x', { costSavingPotential: { annualValue: '£350K', paybackMonths: 6 } }),
    mk('Peer B', 'x', { costSavingPotential: { annualValue: '£450K', paybackMonths: 6 } }),
    mk('Peer C', 'x', { costSavingPotential: { annualValue: '£300K', paybackMonths: 6 } }),
    // 25x the batch — unverified, unchecked, and previously the top result.
    mk('Inflated claim', 'x', { costSavingPotential: { annualValue: '£10M', paybackMonths: 6 } }),
  ];
  rankIdeas(ideas);
  const s = Object.fromEntries(ideas.map(i => [i.title, i.rank.score]));
  assert.ok(
    s['Inflated claim'] < s['Engine-confirmed'] * 3,
    `a 25x unverified claim still ran away with it (inflated ${s['Inflated claim']} vs confirmed ${s['Engine-confirmed']})`,
  );
  const inflated = ideas.find(i => i.title === 'Inflated claim');
  assert.match(inflated.rank.basis, /capped/, 'the cap must be visible, not silent');
  assert.match(inflated.rank.basis, /10/, 'the basis must still report what was actually claimed');
});

test('rankIdeas: not being engine-checked costs something, but does not bury the idea', () => {
  // Only ~15% of generated ideas are expressible as a check the engine can run,
  // so a heavy penalty would suppress most of the output. It must cost a
  // little and be stated — not dominate.
  const ideas = [
    mk('Checked', 'x', { costSavingPotential: { annualValue: '£400K' }, engineCheck: { direction: 'confirmed' } }),
    mk('Unchecked', 'x', { costSavingPotential: { annualValue: '£400K' } }),
  ];
  rankIdeas(ideas);
  const [c, u] = ideas.map(i => i.rank.score);
  assert.ok(c > u, 'engine-confirmed must outrank an identical unchecked claim');
  assert.ok(u > c * 0.5, 'but an unchecked idea must not be buried — most ideas are unchecked');
  assert.match(ideas[1].rank.basis, /not engine-checked/);
});

test('similarityMatches: near-restatement flagged, distinct idea not, best-first and capped', () => {
  const corpus = [
    { id: 'a', title: 'Convert stamped steel bracket to aluminium HPDC', description: 'Replace the three-piece welded stamped steel bracket with a single aluminium high pressure die casting.' },
    { id: 'b', title: 'Hairpin winding for stator', description: 'Rectangular copper bar conductors lift slot fill and cut copper mass.' },
  ];
  const dup = similarityMatches(
    { title: 'Aluminium HPDC casting replaces stamped steel bracket', description: 'Convert the welded stamped steel bracket assembly into one aluminium high pressure die casting part.' },
    corpus,
  );
  assert.equal(dup.length, 1);
  assert.equal(dup[0].id, 'a');
  assert.ok(dup[0].similarity >= 0.5);
  const distinct = similarityMatches({ title: 'Delete the paint line via mould-in-colour PP', description: 'Mould-in-colour polypropylene deletes the primer and topcoat stations.' }, corpus);
  assert.equal(distinct.length, 0);
  assert.deepEqual(similarityMatches({ title: '', description: '' }, corpus), []);
});

test('clusterIdeas: similar ideas cluster with labels, minSize respected, deterministic', () => {
  const docs = [
    { id: '1', title: 'Hairpin winding stator copper', description: 'Rectangular copper bar conductors lift slot fill cutting copper mass in the stator winding.' },
    { id: '2', title: 'Bar winding stator conversion', description: 'Rectangular copper bar conductors improve slot fill and reduce copper mass in the stator.' },
    { id: '3', title: 'Flat wire stator winding', description: 'Rectangular copper conductors lift slot fill and cut stator copper mass significantly.' },
    { id: '4', title: 'Composite tailgate SMC', description: 'Sheet moulding compound outer panel with glass mat inner replaces the steel tailgate assembly.' },
    { id: '5', title: 'Mould-in-colour bumper', description: 'Mould-in-colour polypropylene fascia deletes the paint shop pass entirely for lower trims.' },
  ];
  const clusters = clusterIdeas(docs, { threshold: 0.4, minSize: 3 });
  assert.equal(clusters.length, 1, 'only the 3 stator ideas form a big-enough cluster');
  assert.deepEqual([...clusters[0].ideaIds].sort(), ['1', '2', '3']);
  assert.ok(/stator|copper|winding/.test(clusters[0].label), `label "${clusters[0].label}" names the theme`);
  assert.deepEqual(clusterIdeas(docs, { threshold: 0.4, minSize: 3 }), clusters, 'deterministic');
  assert.equal(clusterIdeas(docs, { threshold: 0.4, minSize: 4 }).length, 0, 'minSize respected');
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

// 83.1% of generated ideas carry a priorArt stamp — they are near-restatements
// of something already in the marketplace corpus. The stamp was rendered as a
// badge and counted in the eval, and read by NOTHING in the ranking, so a
// restatement of a known lever ranked identically to a genuinely new idea at
// the same claimed value. Batch diversity was the only novelty-ish signal being
// acted on, and it measures a different thing: whether the ideas differ from
// EACH OTHER, not whether any of them is new to the corpus.
test('rankIdeas: a near-restatement does not outrank a novel idea of equal value', () => {
  const value = { annualValue: '£400K', paybackMonths: 6 };
  const ideas = [
    mk('Novel idea', 'x', { costSavingPotential: value }),
    mk('Known lever', 'x', { costSavingPotential: value, priorArt: { id: 'mk-1', title: 'Existing marketplace idea', score: 28 } }),
    mk('Loose echo', 'x', { costSavingPotential: value, priorArt: { id: 'mk-2', title: 'Vaguely similar idea', score: 13 } }),
  ];
  rankIdeas(ideas);
  const s = Object.fromEntries(ideas.map(i => [i.title, i.rank.score]));
  assert.ok(s['Novel idea'] > s['Known lever'], 'a novel idea must outrank a restatement of equal value');
  assert.ok(s['Loose echo'] > s['Known lever'], 'a closer match must cost more than a loose one');
  assert.match(ideas[1].rank.basis, /prior art/i, 'the discount must be visible in the basis');
  assert.match(ideas[1].rank.basis, /Existing marketplace idea/, 'and must name what it echoes');
});

test('rankIdeas: precedent is discounted, never buried — the marketplace exists for a reason', () => {
  // A proven, already-catalogued lever is genuinely valuable; the failure mode
  // to avoid is a novelty penalty so heavy that the tool stops surfacing what
  // actually works.
  const ideas = [
    mk('Novel', 'x', { costSavingPotential: { annualValue: '£100K' } }),
    mk('Proven precedent', 'x', { costSavingPotential: { annualValue: '£400K' }, priorArt: { id: 'p', title: 'Proven', score: 40 } }),
  ];
  rankIdeas(ideas);
  const [novel, proven] = ideas.map(i => i.rank.score);
  assert.ok(proven > novel, 'a 4x more valuable proven idea must still win');
});

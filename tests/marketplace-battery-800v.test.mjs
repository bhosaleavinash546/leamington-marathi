// The 800V battery library, pinned: exactly 200 entries (60 assembly / 80
// subassembly / 60 part), every one benchmark-anchored to a real platform,
// distinct from the whole corpus, and honestly seeded UNVERIFIED. The anchor
// is this pack's contract: an idea with no benchmark lineage has no place here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';

const pack = JSON.parse(readFileSync(new URL('../marketplace-battery-800v-ideas.json', import.meta.url), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tok = (s) => new Set(norm(s).split(' ').filter(w => w.length > 3));
const jac = (a, b) => [...a].filter(x => b.has(x)).length / Math.max(1, new Set([...a, ...b]).size);

describe('800V battery marketplace library', () => {
  it('holds exactly the commissioned 60/80/60 split', () => {
    const lv = pack.reduce((m, x) => ({ ...m, [x.level]: (m[x.level] || 0) + 1 }), {});
    assert.equal(pack.length, 200);
    assert.equal(lv.assembly, 60, `assembly ideas: ${lv.assembly}`);
    assert.equal(lv.subassembly, 80, `subassembly ideas: ${lv.subassembly}`);
    assert.equal(lv.part, 60, `part ideas: ${lv.part}`);
  });

  it('every idea is anchored to a named benchmark platform — none free-floating', () => {
    for (const x of pack) {
      const a = x.ideaData.benchmarkAnchor;
      assert.ok(a && a.platform && a.platform.length >= 4, `${x.title}: no benchmark platform`);
      assert.ok(a.borrowedFeature && a.borrowedFeature.length >= 15, `${x.title}: anchor names no borrowed feature`);
      assert.ok(a.difference && a.difference.length >= 15, `${x.title}: anchor states no difference from the benchmark`);
      assert.match(x.ideaData.benchmarkReference, /^Inspired by \/ benchmarked against: /, `${x.title}: benchmarkReference not stamped`);
    }
  });

  it('is free of duplicates inside itself AND against every other pack', async () => {
    const seen = new Map();
    for (const x of pack) {
      const n = norm(x.title);
      assert.ok(!seen.has(n), `duplicate title inside the battery pack: ${x.title}`);
      seen.set(n, x.id);
    }
    const others = [];
    for await (const f of glob('marketplace-*.json')) {
      if (f.includes('battery-800v')) continue;
      for (const y of JSON.parse(readFileSync(f, 'utf8'))) others.push(y.title);
    }
    const otherN = new Set(others.map(norm));
    const otherT = others.map(tok);
    for (const x of pack) {
      assert.ok(!otherN.has(norm(x.title)), `battery idea duplicates an existing library title: ${x.title}`);
      const t = tok(x.title);
      const clash = otherT.find(o => jac(t, o) >= 0.6);
      assert.ok(!clash, `battery idea is a near-duplicate of an existing title: ${x.title}`);
    }
  });

  it('every entry carries the depth and arithmetic the library promises', () => {
    for (const x of pack) {
      const d = x.ideaData;
      assert.ok(d, `${x.title} has no ideaData`);
      assert.ok(d.technicalDescription.length >= 450, `${x.title}: technicalDescription only ${d.technicalDescription.length} ch`);
      assert.ok(d.costReductionMechanism.length >= 120, `${x.title}: costReductionMechanism too thin`);
      assert.ok(d.manufacturingImpact.length >= 120, `${x.title}: manufacturingImpact too thin`);
      assert.ok(d.dfmDfa.length >= 120, `${x.title}: dfmDfa too thin`);
      assert.ok(d.riskNotes.length >= 120, `${x.title}: riskNotes too thin`);
      assert.ok(d.costSavingPotential.calculationBasis, `${x.title}: saving has no arithmetic`);
      assert.ok(d.costSavingPotential.annualValue, `${x.title}: no annual value with stated volume`);
      assert.ok(['Assembly', 'Subassembly', 'Part'].includes(d.systemLevel), `${x.title}: bad systemLevel`);
      assert.ok(d.focusArea, `${x.title}: no focusArea provenance`);
    }
  });

  it('is seeded UNVERIFIED with no borrowed evidence — the honesty the corpus needs', () => {
    for (const x of pack) {
      assert.equal(x.verified, 0, `${x.title} claims verification it never earned`);
      assert.equal(x.stars, 0);
      assert.equal(x.ideaData.confidenceLevel, 'estimated');
      assert.deepEqual(x.ideaData.evidenceSources, [], `${x.title} carries evidence sources it cannot support`);
    }
  });
});

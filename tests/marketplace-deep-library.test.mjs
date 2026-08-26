// The deep library, pinned: 411 entries that must stay specific, distinct and
// honestly unverified. Generated content earns its place in the corpus only
// while it clears the bar the corpus audit set.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';

const pack = JSON.parse(readFileSync(new URL('../marketplace-deep-library-ideas.json', import.meta.url), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tok = (s) => new Set(norm(s).split(' ').filter(w => w.length > 3));
const jac = (a, b) => [...a].filter(x => b.has(x)).length / Math.max(1, new Set([...a, ...b]).size);

describe('deep marketplace library', () => {
  it('fills the levels the corpus audit found empty', () => {
    const lv = pack.reduce((m, x) => ({ ...m, [x.level]: (m[x.level] || 0) + 1 }), {});
    assert.ok(lv.assembly >= 100, `assembly ideas: ${lv.assembly}`);
    assert.ok(lv.subassembly >= 100, `subassembly ideas: ${lv.subassembly}`);
    assert.ok(pack.length >= 400, `pack size ${pack.length}`);
  });

  it('is free of duplicates inside itself AND against every other pack', async () => {
    const seen = new Map();
    for (const x of pack) {
      const n = norm(x.title);
      assert.ok(!seen.has(n), `duplicate title inside the deep pack: ${x.title}`);
      seen.set(n, x.id);
    }
    const others = [];
    for await (const f of glob('marketplace-*.json')) {
      if (f.includes('deep-library')) continue;
      for (const y of JSON.parse(readFileSync(f, 'utf8'))) others.push(y.title);
    }
    const otherN = new Set(others.map(norm));
    const otherT = others.map(tok);
    for (const x of pack) {
      assert.ok(!otherN.has(norm(x.title)), `deep idea duplicates an existing library title: ${x.title}`);
      const t = tok(x.title);
      const clash = otherT.find(o => jac(t, o) >= 0.6);
      assert.ok(!clash, `deep idea is a near-duplicate of an existing title: ${x.title}`);
    }
  });

  it('every entry carries the depth the library promises', () => {
    for (const x of pack) {
      const d = x.ideaData;
      assert.ok(d, `${x.title} has no ideaData`);
      assert.ok(d.technicalDescription.length >= 450, `${x.title}: technicalDescription only ${d.technicalDescription.length} ch`);
      assert.ok(d.manufacturingImpact.length >= 120, `${x.title}: manufacturingImpact too thin`);
      assert.ok(d.riskNotes.length >= 120, `${x.title}: riskNotes too thin`);
      assert.ok(d.costSavingPotential.calculationBasis, `${x.title}: saving has no arithmetic`);
      assert.ok(['Assembly', 'Subassembly', 'Part'].includes(d.systemLevel), `${x.title}: bad systemLevel`);
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

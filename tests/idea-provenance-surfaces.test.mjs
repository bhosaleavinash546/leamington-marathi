// Every surface that shows a saving must show whether it was checked.
//
// The honesty rules lived in one tested module (idea-provenance.mjs) and the
// RENDERING of them did not: the marketplace panel and the shared report
// carried none, and Should-Cost, TRIZ and CAD Diff showed the confirmed badge
// but nothing when the engine had not looked (Sept 2026 review, R-19..R-22).
// A silent gap reads as a pass.
//
// This test is a source-level invariant, not a render test: it fails when a
// file prints an idea's annualValue (or an engine verdict) without also
// rendering the shared badge component or an explicit not-checked branch.
// Grep-based, because that is what makes it cheap enough to run on every
// commit — and it is the same shape as tests/accuracy-claim.test.mjs, which
// pins marketing copy to the recorded benchmark.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

/** Files that render a per-idea saving to a human. */
const IDEA_SURFACES = [
  'pages/ResultsPage.tsx',
  'pages/MarketplacePage.tsx',
  'pages/SharedResultPage.tsx',
  'pages/ShouldCostPage.tsx',
  'pages/TrizStudioPage.tsx',
  'pages/CadDiffPage.tsx',
  'components/IdeaDetailPanel.tsx',
];

const rendersVerdict = (src) =>
  src.includes('IdeaProvenanceBadges')
  || /Not engine-checked/.test(src);

describe('every idea surface renders the engine verdict', () => {
  for (const rel of IDEA_SURFACES) {
    it(`${rel} shows whether the engine checked the idea`, () => {
      const src = read(rel);
      assert.ok(rendersVerdict(src),
        `${rel} renders savings without a verdict — use <IdeaProvenanceBadges> or an explicit "Not engine-checked" branch`);
    });
  }

  it('no surface renders engineCheck without handling its absence', () => {
    for (const rel of IDEA_SURFACES) {
      const src = read(rel);
      // `{idea.engineCheck && (` renders the badge only on success: the
      // absent case then shows nothing at all, which reads as a pass.
      const bare = src.match(/\{\s*\w+\.engineCheck\s*&&\s*\(/g) || [];
      assert.equal(bare.length, 0,
        `${rel} has ${bare.length} bare "engineCheck &&" render(s) — use a ternary with a not-checked branch`);
    }
  });

  it('the shared component always renders a verdict, in both variants', () => {
    const src = read('components/IdeaProvenanceBadges.tsx');
    // The verdict is a ternary on engineCheck with a not-checked else branch,
    // and it is NOT behind the variant switch.
    assert.match(src, /\{ec \? \(/);
    assert.match(src, /Not engine-checked/);
    const notCheckedIdx = src.indexOf('Not engine-checked');
    const before = src.slice(0, notCheckedIdx);
    assert.ok(!/variant === 'full' &&[^]{0,400}$/.test(before),
      'the verdict must render in the compact variant too');
  });

  it('the reason is shown when the engine could not check', () => {
    const src = read('components/IdeaProvenanceBadges.tsx');
    assert.match(src, /idea\.engineCheckReason/);
  });
});

describe('no surface overstates what an engine check proves', () => {
  it('"engine-verified" is not used as a per-idea label', () => {
    // The check tests the DIRECTION of a move on a reference part. The shared
    // provenance vocabulary is confirmed / contradicted / not checked.
    for (const rel of IDEA_SURFACES) {
      const src = read(rel);
      assert.ok(!/Engine-verified:/i.test(src), `${rel} says "Engine-verified" — the check confirms a direction, not a figure`);
    }
  });

  it('the landing page does not claim universal verification', () => {
    const home = read('pages/HomePage.tsx');
    assert.ok(!/100'?,?\s*em:\s*'%',\s*cap:\s*'Numbers engine-verified'/.test(home));
    assert.ok(!/Every figure is engine-stamped confirmed/.test(home));
  });
});

describe('the auth store is read in exactly one place', () => {
  it('nothing outside services/auth.ts and AuthContext touches the storage key', () => {
    const offenders = [];
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { walk(join(dir, entry.name), rel); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (rel === 'services/auth.ts' || rel === 'contexts/AuthContext.tsx') continue;
        const src = readFileSync(join(SRC, dir, entry.name), 'utf8');
        if (src.includes("localStorage.getItem('brainspark_auth')")) offenders.push(rel);
      }
    };
    walk('.');
    assert.deepEqual(offenders, [],
      'read the token through getAuthToken()/authHeader() — four surfaces sent the whole JSON blob as a bearer token');
  });
});

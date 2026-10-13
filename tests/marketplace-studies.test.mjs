// User-supplied value-engineering studies imported into the Marketplace
// (DECISIONS 128): every idea kept, verbatim, with its own decision and an
// exact source pointer; nothing that is not a saving carries a saving figure.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferCommodityKey } from '../src/data/commodity-classify.mjs';

const PACKS = {
  'marketplace-study-edu-function-analysis.json': { n: 166, commodity: 'EDU', statuses: { Develop: 77, 'Not selected': 74, 'Screened out': 12, Hold: 3 } },
  'marketplace-study-48v-mhev-should-cost.json': { n: 151, commodity: 'Battery', statuses: { Develop: 35, Hold: 39, 'Not selected': 73, 'Screened out': 4 } },
  'marketplace-study-hs26-half-shafts.json': { n: 17, commodity: 'Driveline' },
  'marketplace-study-dif26-differentials.json': { n: 17, commodity: 'Driveline' },
  'marketplace-study-ps26-prop-shafts.json': { n: 19, commodity: 'Driveline' },
  'marketplace-study-tc26-transfer-case.json': { n: 15, commodity: 'Driveline' },
  'marketplace-study-ix3-gen6-battery-benchmark.json': { n: 4, commodity: 'Battery' },
};
const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

describe('user-supplied study packs', () => {
  it('keep every idea of every study (389), with unique ids', () => {
    let total = 0; const ids = new Set();
    for (const [f, P] of Object.entries(PACKS)) {
      const a = load(f); total += a.length;
      assert.equal(a.length, P.n, f);
      for (const x of a) { assert.ok(!ids.has(x.id), x.id); ids.add(x.id); }
    }
    assert.equal(total, 389);
  });
  it("carry the study's own decision counts", () => {
    for (const [f, P] of Object.entries(PACKS)) {
      if (!P.statuses) continue;
      const c = {}; for (const x of load(f)) c[x.ideaData.studyStatus] = (c[x.ideaData.studyStatus] || 0) + 1;
      assert.deepEqual(c, P.statuses, f);
    }
  });
  it('every idea names its study, original id and exact source, and files under its commodity', () => {
    for (const [f, P] of Object.entries(PACKS)) for (const x of load(f)) {
      const d = x.ideaData;
      assert.ok(d.study && d.originalId && d.sourcePointer && d.studyStatus, x.id);
      assert.match(d.sourcePointer, /›/);
      assert.equal(inferCommodityKey(x.system), P.commodity, `${x.id}: ${x.system}`);
      assert.equal(x.verified, 0); assert.equal(d.confidenceLevel, 'estimated');
    }
  });
  it('only a saving carries a money figure in its headline saving', () => {
    for (const f of Object.keys(PACKS)) for (const x of load(f)) {
      const saving = ['Saving', 'Develop', 'Hold', 'Not selected', 'Screened out'].includes(x.ideaData.studyStatus);
      if (!saving) assert.doesNotMatch(x.annualSaving, /[£€$]\s?\d/, `${x.id}: ${x.ideaData.studyStatus} must not show a saving figure`);
    }
  });
  it('is registered with the seeder', () => {
    const src = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
    for (const f of Object.keys(PACKS)) assert.ok(src.includes(`'${f}'`), f);
  });
});

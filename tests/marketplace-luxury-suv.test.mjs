// The luxury-SUV MHEV / 800V BEV library, pinned: exactly 300 entries
// (90 assembly / 110 subassembly / 100 part) across ten commodity groups,
// every one anchored to a named benchmark vehicle WITH the web source found
// for that benchmark fact, distinct from the whole corpus by title AND by
// concept, arithmetic that adds up, and honestly seeded UNVERIFIED.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadLibrary, checkAgainst } from '../scripts/check-idea-dupes.mjs';
import { inferCommodityKey } from '../src/data/commodity-classify.mjs';
import { classifyIdea } from '../src/data/idea-classify.mjs';

const VOL = 50_000;

// "€22-€30" / "€1.1M-€1.5M" → [lo, hi] in €
function money(s) {
  const t = String(s || '').replace(/,/g, '').replace(/[–—]/g, '-');
  const m = /€\s*([\d.]+)\s*([kKmM])?\s*(?:-|to)\s*€?\s*([\d.]+)\s*([kKmM])?/.exec(t);
  if (!m) return null;
  const mul = (u) => (u ? ({ k: 1e3, m: 1e6 })[u.toLowerCase()] : 1);
  return [Number(m[1]) * mul(m[2] || m[4]), Number(m[3]) * mul(m[4] || m[2])];
}

// One contract, two researched packs. Each pack pins its own size, split and
// mix; everything else (anchors, sources, dedupe, arithmetic, facets,
// honesty) is shared.
const PACKS = [
  {
    file: 'marketplace-luxury-suv-mhev-bev-ideas.json', name: 'luxury-SUV MHEV / 800V BEV',
    total: 300, levels: { assembly: 90, subassembly: 110, part: 100 },
    mix: (pt, offRoad) => pt.MHEV >= 40 && pt['800V BEV'] >= 60 && pt['MHEV & 800V BEV'] >= 100 && offRoad >= 60,
    commodities: ['Battery', 'EDU', 'Chassis', 'Driveline', 'BIW', 'Interior', 'Exterior', 'Electrical', 'Powertrain'],
  },
  {
    file: 'marketplace-mhev-48v-ideas.json', name: '48 V MHEV',
    total: 100, levels: { assembly: 30, subassembly: 35, part: 35 },
    // Every idea is a 48 V MHEV idea (a few shared with the BEV sister model).
    mix: (pt) => !pt['800V BEV'] && (pt.MHEV ?? 0) >= 85,
    commodities: ['Powertrain', 'Electrical', 'Battery'],
  },
];

for (const P of PACKS) describePack(P);

function describePack({ file: FILE, name, total, levels, mix, commodities }) {
const pack = JSON.parse(readFileSync(new URL(`../${FILE}`, import.meta.url), 'utf8'));
describe(`${name} marketplace library`, () => {
  it(`holds exactly the commissioned ${Object.values(levels).join('/')} split and its powertrain mix`, () => {
    const lv = pack.reduce((m, x) => ({ ...m, [x.level]: (m[x.level] || 0) + 1 }), {});
    assert.equal(pack.length, total);
    assert.deepEqual(lv, levels);
    const pt = pack.reduce((m, x) => ({ ...m, [x.ideaData.powertrain]: (m[x.ideaData.powertrain] || 0) + 1 }), {});
    assert.ok(mix(pt, pack.filter(x => x.ideaData.offRoad).length), JSON.stringify(pt));
    assert.equal(new Set(pack.map(x => x.id)).size, total, 'ids must be unique');
  });

  it('covers its commodity tabs, and every system resolves to one', () => {
    const keys = new Set();
    for (const x of pack) {
      const k = inferCommodityKey(x.system);
      assert.ok(k, `${x.title}: system "${x.system}" resolves to no commodity`);
      keys.add(k);
    }
    for (const k of commodities) assert.ok(keys.has(k), `commodity ${k} has no idea`);
  });

  it('every idea names its benchmark vehicle AND the web source behind that fact', () => {
    for (const x of pack) {
      const d = x.ideaData;
      const a = d.benchmarkAnchor;
      assert.ok(a && a.platform.length >= 4 && a.borrowedFeature.length >= 15 && a.difference.length >= 15, `${x.title}: weak anchor`);
      assert.match(d.benchmarkReference, /^Inspired by \/ benchmarked against: /);
      assert.ok(d.evidenceSources.length >= 1, `${x.title}: no source`);
      for (const s of d.evidenceSources) {
        assert.match(s.url, /^https:\/\/[^\s/]+\.[^\s]+/, `${x.title}: bad source URL`);
        assert.equal(s.type, 'web_search');
        assert.ok(s.supports && s.supports.length >= 10, `${x.title}: source does not say what it supports`);
      }
    }
  });

  it('is free of duplicates inside itself and against every other pack — by title and by concept', () => {
    const lib = loadLibrary().filter(y => y.src !== FILE);
    const res = checkAgainst(pack, lib, { titleMax: 0.5, conceptMax: 0.55 });
    const bad = res.filter(r => r.flagged).map(r => `${r.title} ~ ${r.conceptSim >= 0.55 ? r.conceptNearest : r.titleNearest}`);
    assert.deepEqual(bad, [], 'near-duplicates of the existing library');
    const own = loadLibrary().filter(y => y.src === FILE);
    for (const [i, x] of pack.entries()) {
      const others = own.filter((_, j) => j !== i);
      const r = checkAgainst([x], others, { titleMax: 0.5, conceptMax: 0.55 })[0];
      assert.ok(!r.flagged, `inside the pack: ${x.title} ~ ${r.conceptNearest}`);
    }
  });

  it('carries the depth and saving arithmetic the library promises', () => {
    for (const x of pack) {
      const d = x.ideaData;
      assert.ok(d.technicalDescription.length >= 495, `${x.title}: technicalDescription only ${d.technicalDescription.length} ch`);
      for (const k of ['costReductionMechanism', 'manufacturingImpact', 'dfmDfa', 'riskNotes']) assert.ok(d[k].length >= 135, `${x.title}: ${k} too thin`);
      assert.ok(['Assembly', 'Subassembly', 'Part'].includes(d.systemLevel));
      const pv = money(d.costSavingPotential.perVehicle), av = money(d.costSavingPotential.annualValue);
      assert.ok(pv && av, `${x.title}: saving not parseable`);
      // perVehicle × 50,000 must reproduce the annual figure (15 % rounding),
      // or exceed it only where the basis states a realisation factor.
      for (const k of [0, 1]) {
        const r = (pv[k] * VOL) / av[k];
        assert.ok(r >= 0.85 && r <= 2.05, `${x.title}: ${d.costSavingPotential.perVehicle} × 50k vs ${d.costSavingPotential.annualValue}`);
      }
      assert.match(`${d.costSavingPotential.annualValue} ${d.costSavingPotential.calculationBasis}`, /50[,.]?000/);
      assert.ok(d.volumeBasis && /variant mix/.test(d.volumeBasis), 'volume basis must be stated');
    }
  });

  it('is tagged so the marketplace powertrain facets find it', () => {
    for (const x of pack) {
      const cls = classifyIdea({ ...x, ideaData: JSON.stringify(x.ideaData) });
      if (x.ideaData.powertrain.includes('MHEV')) assert.ok(cls.powertrains.includes('MHEV'), `${x.title}: MHEV facet misses it`);
      if (x.ideaData.powertrain.includes('800V')) assert.ok(cls.powertrains.includes('BEV') && cls.voltages.includes('800V'), `${x.title}: 800V BEV facet misses it`);
    }
  });

  it('is seeded UNVERIFIED with estimated savings and sources flagged unreviewed', () => {
    for (const x of pack) {
      assert.equal(x.verified, 0, `${x.title} claims verification it never earned`);
      assert.equal(x.stars, 0);
      assert.equal(x.ideaData.confidenceLevel, 'estimated');
      assert.equal(x.ideaData.evidenceUnverified, true, `${x.title}: AI-found sources must be flagged unreviewed`);
    }
  });

  it('is registered with the seeder', () => {
    assert.match(readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), new RegExp(`seedMarketplaceIdeasFromFile\\('${FILE}'`));
    assert.ok(readdirSync(new URL('..', import.meta.url)).includes(FILE));
  });
});
}

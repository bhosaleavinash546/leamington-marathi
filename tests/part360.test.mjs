// Part 360 core — waterfall exactness, forensics honesty, dossier discipline.
//
// These run against the REAL deterministic engines (the dfm-routing pattern):
// same inputs, same numbers, every time. The with-geometry process step needs
// an OCCT-measured part and is exercised by the live E2E instead.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  entitlementWaterfall, quoteForensics, buildDossier, dossierToPromptBlock,
  inferSpecFromDrawing, allocateGap, LENSES, KIND_TO_BUCKETS,
  inputAnomalies, counterOffer,
} from '../part360.mjs';
import { computeShouldCost } from '../costing-engine.mjs';

const BASE = {
  material: 'Aluminium 6061', process: 'Machining (CNC)',
  weightKg: 0.5, annualVolume: 50_000, region: 'Germany',
};
const calc = computeShouldCost(BASE);

describe('entitlement waterfall', () => {
  it('chains exactly: every fromEur is the previous toEur, deltas sum to quote − entitlement', () => {
    const wf = entitlementWaterfall({ ...BASE, toleranceClass: 'precision', surfaceFinish: 'fine', quoteTotalEur: 30 });
    for (let i = 1; i < wf.steps.length; i++) {
      assert.equal(wf.steps[i].fromEur, wf.steps[i - 1].toEur,
        `step ${wf.steps[i].id} does not chain from ${wf.steps[i - 1].id}`);
    }
    const sum = wf.steps.reduce((s, x) => s + x.deltaEur, 0);
    assert.ok(Math.abs(sum - (wf.quoteEur - wf.entitlementEur)) < 0.02,
      `deltas sum ${sum} but quote−entitlement is ${wf.quoteEur - wf.entitlementEur}`);
    assert.equal(wf.totalGapEur, Number((wf.quoteEur - wf.entitlementEur).toFixed(2)));
  });

  it('a tight specification produces a positive spec premium', () => {
    const wf = entitlementWaterfall({ ...BASE, toleranceClass: 'precision', surfaceFinish: 'polished', quoteTotalEur: 30 });
    const spec = wf.steps.find(s => s.name === 'Specification premium');
    assert.ok(!spec.skipped);
    assert.ok(spec.deltaEur > 0, `precision/polished must cost more than standard (delta ${spec.deltaEur})`);
  });

  it('an already-standard spec keeps the step at zero rather than dropping it', () => {
    const wf = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    const spec = wf.steps.find(s => s.name === 'Specification premium');
    assert.ok(!spec.skipped, 'the step must exist so the chain is visibly complete');
    assert.equal(spec.deltaEur, 0);
    assert.match(spec.basis, /already at engine standard/);
  });

  it('without a quote, the commercial step is SKIPPED with its reason — never invented', () => {
    const wf = entitlementWaterfall({ ...BASE });
    const com = wf.steps.find(s => s.name === 'Commercial gap');
    assert.equal(com.skipped, true);
    assert.equal(com.deltaEur, 0);
    assert.equal(wf.quoteEur, null);
    assert.equal(wf.totalGapEur, null);
  });

  it('without geometry, the process step is SKIPPED with its reason', () => {
    const wf = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    const proc = wf.steps.find(s => s.name === 'Process premium');
    assert.equal(proc.skipped, true);
    assert.match(proc.reason, /geometry absent/);
  });

  it('finds a cheaper region than Germany for a labour-heavy process', () => {
    const wf = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    const foot = wf.steps.find(s => s.name === 'Footprint premium');
    assert.ok(!foot.skipped);
    assert.ok(foot.deltaEur > 0, 'machining in Germany should not already be the cheapest modelled region');
    assert.match(foot.basis, /ex-works/i, 'the footprint step must carry its logistics caveat');
  });

  it('a quote BELOW the model keeps its negative commercial delta — never clipped', () => {
    const low = Math.max(1, calc.totalShouldCost * 0.5);
    const wf = entitlementWaterfall({ ...BASE, quoteTotalEur: low });
    const com = wf.steps.find(s => s.name === 'Commercial gap');
    assert.ok(com.deltaEur < 0);
    assert.match(com.basis, /BELOW the model/);
  });

  it('carries the direction-indicator caution, always', () => {
    const wf = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    assert.match(wf.caution, /DIRECTION INDICATOR, not a target/);
    assert.match(wf.caution, /held-out/);
  });

  it('is deterministic', () => {
    const a = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    const b = entitlementWaterfall({ ...BASE, quoteTotalEur: 30 });
    assert.deepEqual(a, b);
  });
});

describe('quote forensics', () => {
  const mkLines = () => {
    const mat = calc.breakdown.material.value;
    const conv = ['machine', 'labour', 'setup', 'finishing'].reduce((s, k) => s + calc.breakdown[k].value, 0);
    return [
      { label: 'Raw material 6061-T6', kind: 'material', amountEur: mat * 2 },      // above band
      { label: 'Machining + deburr', kind: 'conversion', amountEur: conv * 1.05 },  // in band
      { label: 'Amortised fixtures', kind: 'tooling', amountEur: calc.breakdown.tooling.value * 0.4 }, // below band
      { label: 'ECO surcharge', kind: 'other', amountEur: 0.30 },                   // unmapped
    ];
  };

  it('judges each line against its engine bucket with the right verdict', () => {
    const f = quoteForensics(mkLines(), calc, { annualVolume: BASE.annualVolume });
    const by = Object.fromEntries(f.rows.map(r => [r.kind, r]));
    assert.equal(by.material.verdict, 'above-model');
    assert.equal(by.conversion.verdict, 'in-band');
    assert.equal(by.tooling.verdict, 'below-model');
    assert.equal(by.other.verdict, 'unmapped');
    assert.match(f.caveat, /1 of 4 lines could not be judged/);
  });

  it('every judged verdict carries a basis naming the band as directional', () => {
    const f = quoteForensics(mkLines(), calc, {});
    for (const r of f.rows.filter(x => x.engineEur != null)) {
      assert.match(r.basis, /directional/, `${r.kind} verdict has no uncertainty framing`);
    }
  });

  it('cites the commodity date only when the price provenance is actually known', () => {
    // The raw engine result carries no materialPrice — the citation is
    // route-level enrichment and must not be fabricated without it.
    const plain = quoteForensics(mkLines(), calc, { annualVolume: BASE.annualVolume });
    assert.doesNotMatch(Object.fromEntries(plain.rows.map(r => [r.kind, r])).material.basis, /as of \d{4}/);
    const enriched = quoteForensics(mkLines(), calc, {
      annualVolume: BASE.annualVolume,
      materialPrice: { commodityLabel: 'Al 6061 index', pricedAt: '2026-07-03T12:00:00.000Z' },
    });
    const by = Object.fromEntries(enriched.rows.map(r => [r.kind, r]));
    assert.match(by.material.basis, /Al 6061 index as of 2026-07-03/);
    assert.match(by.tooling.basis, /amortises .* over [\d,]+ parts/);
  });

  it('refuses gracefully with no usable lines', () => {
    assert.match(quoteForensics([], calc).caveat, /needs at least one line/);
    assert.match(quoteForensics(null, calc).caveat, /needs at least one line/);
  });

  it('every quote kind maps to real engine buckets', () => {
    for (const buckets of Object.values(KIND_TO_BUCKETS)) {
      for (const b of buckets) {
        assert.ok(Number.isFinite(calc.breakdown[b]?.value), `bucket ${b} missing from engine breakdown`);
      }
    }
  });
});

describe('spec inference from the drawing', () => {
  it('maps tolerance band and roughness onto the engine\'s own classes', () => {
    assert.equal(inferSpecFromDrawing({ tightestToleranceMm: 0.03 }).toleranceClass, 'precision');
    assert.equal(inferSpecFromDrawing({ tightestToleranceMm: 0.10 }).toleranceClass, 'tight');
    assert.equal(inferSpecFromDrawing({ tightestToleranceMm: 0.40 }).toleranceClass, 'standard');
    assert.equal(inferSpecFromDrawing({ roughnessRaUm: 0.4 }).surfaceFinish, 'polished');
    assert.equal(inferSpecFromDrawing({ roughnessRaUm: 1.6 }).surfaceFinish, 'fine');
    assert.equal(inferSpecFromDrawing({ roughnessRaUm: 6.3 }).surfaceFinish, 'standard');
  });

  it('states its basis, and admits when the drawing gave it nothing', () => {
    const s = inferSpecFromDrawing({});
    assert.equal(s.toleranceClass, 'standard');
    assert.match(s.basis, /no toleranced dimension found/);
    const t = inferSpecFromDrawing({ tightestToleranceMm: 0.03 });
    assert.match(t.basis, /tightest drawing tolerance/);
  });
});

describe('dossier', () => {
  const full = () => {
    const wf = entitlementWaterfall({ ...BASE, toleranceClass: 'tight', quoteTotalEur: 30 });
    return buildDossier({
      part: { partName: 'Test bracket', ...BASE },
      shouldCost: { totalEur: calc.totalShouldCost, p10: 1, p90: 2, inputMassKg: calc.drivers.inputMassKg },
      quote: { totalEur: 30, lines: [{ kind: 'material', label: 'alu', amountEur: 8 }] },
      forensics: quoteForensics([{ label: 'alu', kind: 'material', amountEur: 8 }], calc, {}),
      waterfall: wf,
    });
  };

  it('numbers evidence uniquely and keeps waterfall W-ids targetable', () => {
    const d = full();
    const refs = d.sections.flatMap(s => s.lines.map(l => l.ref));
    assert.equal(new Set(refs).size, refs.length, 'duplicate evidence refs');
    assert.ok(refs.some(r => /^W\d+$/.test(r)), 'waterfall steps must keep W-ids');
    assert.ok(refs.some(r => /^E\d+$/.test(r)));
  });

  it('absent inputs become stated-absent sections, never defaults', () => {
    const d = buildDossier({ part: { partName: 'x', ...BASE } });
    const geo = d.sections.find(s => s.id === 'geometry');
    assert.equal(geo.present, false);
    assert.match(geo.reason, /No 3D model supplied/);
    assert.ok(d.absent.includes('quote') && d.absent.includes('function'));
  });

  it('prompt block demands citations and renders absent sections with reasons', () => {
    const block = dossierToPromptBlock(full());
    assert.match(block, /UNTRUSTED DATA/);
    assert.match(block, /MUST cite the evidence lines .* evidenceRefs/);
    assert.match(block, /\[E1\]/);
    assert.match(block, /\[W1\]/);
    assert.match(block, /not available:/);
  });

  it('a stated part context becomes citable requirement lines in EVERY lens', () => {
    const d = buildDossier({
      part: { partName: 'Knuckle', ...BASE },
      partContext: 'Connects wheel hub to suspension. Carries braking and cornering loads; safety-critical. Operating range -40 to 120 C.',
    });
    const ctx = d.sections.find(s => s.id === 'context');
    assert.equal(ctx.present, true);
    assert.ok(ctx.lines.length >= 3, 'sentences split into separately citable lines');
    assert.ok(ctx.lines.every(l => /^E\d+$/.test(l.ref)));
    // Every lens keeps the context in view — an alternative is judged against it.
    for (const l of LENSES) assert.ok(l.sections.includes('context'), `${l.id} lens drops the stated function`);
    const block = dossierToPromptBlock(d, 'material');
    assert.match(block, /judged against|justified against/i);
    assert.match(block, /DEFECT, not an idea/);
    assert.match(block, /safety-critical/);
  });

  it('without a context, the dossier says function-fit is unverifiable — never silent', () => {
    const d = buildDossier({ part: { partName: 'x', ...BASE } });
    const ctx = d.sections.find(s => s.id === 'context');
    assert.equal(ctx.present, false);
    assert.match(ctx.reason, /has not stated what this part does/);
    const block = dossierToPromptBlock(d);
    assert.match(block, /No part function was stated/);
    assert.match(block, /function-fit is unverified/);
  });

  it('a lens slices the dossier but always keeps the waterfall', () => {
    const d = full();
    const spec = dossierToPromptBlock(d, 'spec');
    assert.match(spec, /LENS: Specification & tolerance/);
    assert.match(spec, /entitlement waterfall/i, 'every lens keeps the waterfall in view');
    assert.doesNotMatch(spec, /Process alternatives/, 'sections outside the lens are sliced away');
    // Every declared lens must reference only real section ids.
    const ids = new Set(d.sections.map(s => s.id));
    for (const l of LENSES) for (const sid of l.sections) assert.ok(ids.has(sid), `${l.id} references unknown section ${sid}`);
  });
});

describe('gap allocation', () => {
  it('reuses targetGap over the engine\'s own buckets', () => {
    const g = allocateGap(calc.totalShouldCost * 1.4, calc);
    assert.ok(g.gap > 0);
    assert.ok(g.allocations.length > 3);
    assert.ok(g.allocations.every(a => Number.isFinite(a.target)));
  });
  it('returns null rather than fabricating when inputs are missing', () => {
    assert.equal(allocateGap(NaN, calc), null);
    assert.equal(allocateGap(10, null), null);
  });
});

describe('input pre-flight anomalies', () => {
  it('flags quote arithmetic that does not add up, with the numbers', () => {
    const a = inputAnomalies({ quote: { totalEur: 10, lines: [{ amountEur: 4 }, { amountEur: 4 }] } });
    assert.equal(a.length, 1);
    assert.equal(a[0].id, 'quote-sum-mismatch');
    assert.match(a[0].message, /€8\.00.*€10\.00/);
  });
  it('questions volumes outside the process band — as a question, not a verdict', () => {
    const low = inputAnomalies({ processKey: 'Stamping / Deep Drawing', annualVolume: 500 });
    assert.equal(low[0].id, 'volume-low-for-process');
    assert.match(low[0].message, /heuristic band/);
    const ok = inputAnomalies({ processKey: 'Stamping / Deep Drawing', annualVolume: 100000 });
    assert.equal(ok.length, 0);
  });
  it('rejects physically impossible densities in either direction', () => {
    const heavy = inputAnomalies({ weightKg: 5, geo: { volume: { cm3: 100 } } });
    assert.equal(heavy[0].id, 'mass-impossible-high');
    const light = inputAnomalies({ weightKg: 0.01, geo: { volume: { cm3: 100 } } });
    assert.equal(light[0].id, 'mass-impossible-low');
    assert.match(light[0].message, /enclosed air/);
  });
  it('stays silent on clean inputs', () => {
    assert.deepEqual(inputAnomalies({ weightKg: 0.79, annualVolume: 100000, processKey: 'Machining (CNC)', geo: { volume: { cm3: 100 } }, cadDerivedMassKg: 0.785 }), []);
  });
});

describe('counter-offer builder', () => {
  const forensics = { rows: [
    { label: 'Billet', kind: 'material', quoteEur: 6, engineEur: 2, verdict: 'above-model', basis: 'x' },
    { label: 'Machining', kind: 'conversion', quoteEur: 4, engineEur: 3.8, verdict: 'in-band', basis: 'y' },
    { label: 'ECO', kind: 'other', quoteEur: 1, engineEur: null, verdict: 'unmapped', basis: 'z' },
  ] };
  it('anchors asks at engine + band, holds in-band lines, and never invents unmapped targets', () => {
    const co = counterOffer(forensics, { steps: [{ name: 'Commercial gap', skipped: false, deltaEur: 3.5 }] });
    const by = Object.fromEntries(co.rows.map(r => [r.kind, r]));
    assert.equal(by.material.targetEur, Number((2 * 1.34).toFixed(2)));
    assert.ok(by.material.askEur > 3);
    assert.equal(by.conversion.askEur, 0);
    assert.match(by.conversion.argument, /hold/i);
    assert.equal(by.other.targetEur, null);
    assert.match(by.other.argument, /break this line down/);
    assert.match(co.caveat, /defensible edge/);
    assert.match(co.caveat, /€3\.50/);
    assert.match(co.caveat, /execution stays with the buyer/);
  });
  it('returns null rather than a sheet with nothing to say', () => {
    assert.equal(counterOffer(null, null), null);
    assert.equal(counterOffer({ rows: [] }, null), null);
  });
});

// ── Grade dictionary in the dossier ──────────────────────────────────────────
describe('dossier catalogue section', () => {
  it('lists same-family grades the engine can price, citable, and says when absent', () => {
    const materials = {
      'Steel (mild)': { density: 7.85, price: 0.62, family: 'ferrous' },
      'Steel DP600 (dual-phase)': { density: 7.85, price: 1.45, family: 'ferrous' },
      'Aluminium 6061': { density: 2.7, price: 2.85, family: 'aluminium' },
    };
    const d = buildDossier({ part: { partName: 'Bracket', material: 'CR4 mild steel', process: 'Stamping', weightKg: 0.2, annualVolume: 60000, region: 'Germany' }, materials });
    const cat = d.sections.find(s => s.id === 'catalogue');
    assert.ok(cat && cat.present, 'catalogue section present when materials supplied');
    const text = cat.lines.map(l => l.text).join('\n');
    assert.match(text, /resolves to catalogue "Steel \(mild\)"/);
    assert.match(text, /Steel DP600 \(dual-phase\): 7\.85 g\/cm³, €1\.45\/kg \(ferrous\)/);
    assert.match(text, /Other families the engine can price: Aluminium 6061/);
    assert.ok(cat.lines.every(l => /^E\d+$/.test(l.ref)), 'catalogue lines are citable E-refs');
    // The material lens carries it; the process lens does not.
    assert.match(dossierToPromptBlock(d, 'material'), /Engine catalogue grades/);
    assert.ok(!/Engine catalogue grades/.test(dossierToPromptBlock(d, 'process')));
    const none = buildDossier({ part: { material: 'Steel (mild)' } });
    const abs = none.sections.find(s => s.id === 'catalogue');
    assert.ok(abs && !abs.present && /not supplied/.test(abs.reason));
  });
});

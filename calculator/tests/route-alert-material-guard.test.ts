/**
 * Page-1 "cheaper route" alerts (fresh review, 4 Nov 2026 — scratchpad review/fresh-numbers.md §1.3, §1.4, §4.3):
 * the knuckle (−23 %) and the hub flange (−31 %, printed twice) said casting was cheaper. The casting row was costed in
 * the casting route's representative steel grade, GS-C25, with the steel melt — but the UK book's GS-C25 is the
 * steel-foundry CHARGE, merchant 0A scrap ÷ 0.96, £0.148/kg: below the £0.20/kg the forging's own steel scrap is
 * credited at. The comparison now refuses such a row with its reason, and no alert rests on a held or implausible price.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { routeMaterialCheck } from '../src/engine/route-material-guard.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { buildCoreReport, routeAlertEligible } from '../src/export/executive-summary.js';
import { compareRoutes, type RouteRow } from '../server/services/route-compare.js';
import type { UniversalStackInput } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

describe('the material price a route row rests on', () => {
  it('UK: cast steel GS-C25 bought below the forging\'s own steel scrap credit is implausible, with the figures', () => {
    const c = routeMaterialCheck('mat-gs-c25', 'mat-steel-38mnvs6', book);
    expect(c.status).toBe('implausible');
    expect(c.reason).toMatch(/GS-C25.*£0\.1480\/kg.*£0\.2000\/kg/);
  });
  it('a grade bought below its OWN scrap credit is implausible', () => {
    const lib = { ...book, materials: book.materials.map(m => (m.id === 'mat-steel-38mnvs6' ? { ...m, pricePerKg: 0.1 } : m)) };
    expect(routeMaterialCheck('mat-steel-38mnvs6', null, lib).status).toBe('implausible');
  });
  it('China: the local cast-steel charge (¥2.16/kg) is above the local forging scrap — not implausible', () => {
    const cn = buildRegionalLibrary(book, 'CN');
    expect(routeMaterialCheck('mat-gs-c25', 'mat-steel-38mnvs6', cn).status).not.toBe('implausible');
  });
  it('a sourced Medium price is fit to act on; a different family is never compared with the costed scrap', () => {
    expect(routeMaterialCheck('mat-abs', 'mat-abs-tf', book).status).toBe('ok');
    expect(routeMaterialCheck('mat-gjs500', 'mat-steel-38mnvs6', book).status).not.toBe('implausible');
  });
  it('a Low price the book labels unsourced is HELD: no alert, but no refusal', () => {
    // GJS-500-7's charge: Low, "engineering-typical" in its note
    expect(routeMaterialCheck('mat-gjs500', 'mat-steel-38mnvs6', book).status).toBe('held');
  });
});

describe('the comparison refuses the knuckle\'s casting row with its reason', () => {
  it('UK knuckle: the cast-steel row is costed (GS-C25, the steel melt) but not credible', async () => {
    const fixtures = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; answers: Record<string, string>; geometry: unknown; outcome: { commodity?: string } }>;
    const p = fixtures.find(x => x.part === 'steering_knuckle_RH.stp')!;
    const cmp = await compareRoutes({ geo: p.geometry as never, filename: p.part, current: p.outcome.commodity ?? 'forging', answers: { ...p.answers },
      region: 'UK', annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW', baseBook: book, ladder: false, bands: false });
    const cast = cmp.rows.find(r => (r.route === 'casting' || r.route === 'cast_and_machine') && r.process === 'sand')
      ?? cmp.rows.find(r => r.route === 'casting' || r.route === 'cast_and_machine')!;
    expect(cast.status).toBe('costed');
    expect(cast.material?.materialId).toBe('mat-gs-c25');
    expect(cast.consumables.length + (cast.breakdown?.rawMaterial ?? 0)).toBeGreaterThan(0);
    expect(cast.materialCheck?.status).toBe('implausible');
    expect(cast.credible).toBe(false);
    expect(cast.notCredible.join(' ')).toMatch(/below the £0\.2000\/kg the costed route's own steel scrap/);
  }, 180_000);
});

// ─── The page-1 alert ────────────────────────────────────────────────────────────────────────────────────────────────

function knuckleReport(rows: Array<Partial<RouteRow>>) {
  const inp = {
    partName: 'Knuckle (test)', rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 3.3, materialUtilization: 0.68 },
    operations: [{ operationName: 'Forging', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.01, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.01, labourEfficiency: 0.92 }],
    tooling: { totalToolingCost: 10_000, amortizationVolume: 1_000_000, mode: 'amortized' },
    packagingPerPart: 0.2, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
  } as unknown as UniversalStackInput;
  const result = computeUniversalStack(inp, book);
  const mk = (o: Partial<RouteRow>): RouteRow => ({
    route: 'forging', process: null, label: 'forging', commodity: null, status: 'costed', total: result.total, toolingPerPart: 0, breakdown: null,
    reconciles: true, audit: null, spec: [], material: null, tooling: null, operations: null, band: null, consumables: [], credible: true,
    notCredible: [], checks: [], caveats: [], assumed: [], openQuestions: [], notes: [], refusal: null, byVolume: [], programme: null, ...o,
  } as RouteRow);
  const routeComparison = {
    principle: 'p', rows: [mk({ material: { materialId: 'mat-steel-38mnvs6', label: '38MnVS6', netKg: 3.3, boughtKg: 4.9, utilisation: 0.68 } }), ...rows.map(mk)],
    excluded: [], ladder: [], crossovers: [], programme: { annualVolume: 200_000, years: 5, yearsAssumed: false },
    current: 'forging', currentLabel: 'Forging', labels: { forging: 'Forging', casting: 'Casting', cast_and_machine: 'Cast and machine' }, headline: result.total,
  };
  return { total: result.total, report: buildCoreReport({ result, input: inp, library: book, commodity: 'forging', region: 'UK',
    cadMeta: { routeComparison } as never, baseLibrary: book, regionalRows: [], fx: 1, sym: '£' } as never) };
}
const mat = (id: string) => ({ materialId: id, label: id, netKg: 3.5, boughtKg: 3.6, utilisation: 0.97 });

describe('a page-1 "cheaper route" alert never rests on a held or implausible material price', () => {
  it('the cast-steel row at a scrap price raises no alert, even when the comparison did not mark it', () => {
    const { total, report } = knuckleReport([]);
    const r = knuckleReport([{ route: 'casting', label: 'casting', total: total * 0.7, material: mat('mat-gs-c25') }]).report;
    expect(report.alerts.filter(a => a.kind === 'route')).toHaveLength(0);
    expect(r.alerts.filter(a => a.kind === 'route')).toHaveLength(0);
    expect(r.verdict).not.toMatch(/cheaper/);
  });
  it('a held price (Low, labelled unsourced) raises none either; a sourced one does', () => {
    const { total } = knuckleReport([]);
    expect(knuckleReport([{ route: 'casting', label: 'casting', total: total * 0.7, material: mat('mat-gjs500') }]).report.alerts.filter(a => a.kind === 'route')).toHaveLength(0);
    const ok = knuckleReport([{ route: 'casting', label: 'casting', total: total * 0.7, material: mat('mat-steel-38mnvs6') }]).report;
    expect(ok.alerts.filter(a => a.kind === 'route')).toHaveLength(1);
  });
  it('two rows at the same £ (casting, cast + machine) raise ONE alert', () => {
    const { total } = knuckleReport([]);
    const r = knuckleReport([
      { route: 'casting', label: 'casting', total: total * 0.69, material: mat('mat-steel-38mnvs6') },
      { route: 'cast_and_machine', label: 'cast and machine', total: total * 0.69, material: mat('mat-steel-38mnvs6') },
    ]).report;
    expect(r.alerts.filter(a => a.kind === 'route')).toHaveLength(1);
  });
  it('routeAlertEligible honours the comparison\'s own mark', () => {
    expect(routeAlertEligible({ material: mat('mat-steel-38mnvs6'), materialCheck: { status: 'implausible' } }, 'mat-steel-38mnvs6', book)).toBe(false);
    expect(routeAlertEligible({ material: mat('mat-steel-38mnvs6'), credible: false }, 'mat-steel-38mnvs6', book)).toBe(false);
  });
});

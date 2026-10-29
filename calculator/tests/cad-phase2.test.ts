/**
 * CAD to COST phase 2 (28 Oct 2026; docs/ui/cad-to-cost-redesign-2026-10.md §6): D4 the finish question, priced through
 * the surface-treatment model on the measured surface; D5 compare routes, the same part costed on each route through the
 * headless chain. Both proven live (screen = headless to the penny with a finish; the comparison's reference row equals
 * the headline) — these pin the pieces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  finishOptionsFor, finishLoading, finishSpec, FINISH_LINE_LOADING, FINISH_PREFIX_BY_COMMODITY, SURFACE_FINISH_ROUTES,
} from '../src/engine/surface-finish-routes.js';
import { FINISH_DECISION_ID } from '../src/engine/cost-input-rules/derive/finish.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { compareRoutes, candidateRoutes } from '../server/services/route-compare.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeSheetMetalFabDrivers, type SheetMetalFabInputs } from '../src/engine/modules/sheet-metal-fab.js';
import { nextCostStep, answersChangedSince } from '../src/ui/cad-flow.js';
import { notIncludedFor, routeCompareHtml, routeComparisonExport, type RouteCompareRow } from '../src/ui/cad-workspace.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string; total?: number };
}>;
const part = (name: string) => parts.find(p => p.part === name)!;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const headless = (name: string, answers: Record<string, unknown>, commodity?: string) => costMeasuredPart(
  part(name).geometry as never, name,
  { partNumber: name, file: name, annualVolume: 50_000, ...(commodity ? { commodity } : {}) },
  answers, 'UK', { annualVolume: 50_000 }, book, { partNumber: name, file: name, status: 'error' });

describe('D4 — the finishes offered', () => {
  it('never offers a route that repeats a step the commodity already charges (casting blast, forging descale)', () => {
    for (const c of ['casting', 'cast_and_machine', 'forging']) {
      for (const f of ['steel', 'cast iron', 'aluminium'] as const) {
        const opts = finishOptionsFor(c, f);
        expect(opts.some(r => (SURFACE_FINISH_ROUTES[r] ?? []).includes('shot_blast'))).toBe(false);
      }
    }
  });
  it('anodise is for aluminium only; galvanise and zinc systems for ferrous parts', () => {
    expect(finishOptionsFor('sheet_metal', 'steel')).not.toContain('anodise');
    expect(finishOptionsFor('sheet_metal', 'aluminium')).toContain('anodise');
    expect(finishOptionsFor('sheet_metal', 'aluminium')).not.toContain('galvanise');
    expect(finishOptionsFor('forging', 'steel')).toContain('zinc_plate');
  });
  it('machining and gear carry no finishing model — no question there', () => {
    expect(finishOptionsFor('machining', 'steel')).toEqual([]);
    expect(finishOptionsFor('gear', 'steel')).toEqual([]);
    expect(Object.keys(FINISH_PREFIX_BY_COMMODITY).sort()).toEqual(['cast_and_machine', 'casting', 'forging', 'sheet_metal', 'sheet_metal_fab']);
  });
});

describe('D4 — the load is sized from the measured part, from published line figures', () => {
  it('barrel zinc: parts a barrel = barrel load ÷ part mass, 10 barrels an hour', () => {
    const l = finishLoading('zinc_plate', 0.0649, 0.3)!;
    expect(l.partsPerRack).toBe(Math.floor(FINISH_LINE_LOADING.barrel.loadKg / 0.3));
    expect(l.racksPerHour).toBe(10);
    expect(l.basis).toMatch(/sterc\.org/);
  });
  it('conveyor coating: the smaller of surface a load bar and the rack weight limit', () => {
    const light = finishLoading('e_coat', 0.0789, 0.6)!;
    expect(light.partsPerRack).toBe(Math.min(Math.floor(83.6 / 0.0789), Math.floor(113.4 / 0.6)));
    const heavy = finishLoading('e_coat', 0.0789, 3.58)!;
    expect(heavy.partsPerRack).toBe(Math.floor(113.4 / 3.58));   // the rack limit binds on a heavy part
    expect(heavy.racksPerHour).toBe(20);
    expect(heavy.basis).toMatch(/thermotronx|pfonline/);
  });
  it('no surface or no mass → no sizing (the rule then states one part a load)', () => {
    expect(finishLoading('e_coat', 0, 1)).toBeNull();
    expect(finishLoading('e_coat', 0.1, 0)).toBeNull();
  });
  it('finishSpec adds the mask / de-mask pair only for masked features', () => {
    const bare = finishSpec({ route: 'e_coat', productForm: 'cast_hpdc', annualVolume: 1, region: 'UK' })!;
    expect(bare.stages).not.toContain('masking');
    const masked = finishSpec({ route: 'e_coat', productForm: 'cast_hpdc', maskedFeatures: 2, annualVolume: 1, region: 'UK' })!;
    expect(masked.stages.slice(-3)).toEqual(['masking', 'cure_oven', 'demask']);
    expect(finishSpec({ route: '', productForm: 'cast_hpdc', annualVolume: 1, region: 'UK' })).toBeUndefined();
  });
});

describe('D4 — the question and its rules', () => {
  const ctx = (answers: Record<string, unknown>): RuleContext => ({
    geo: part('steering_knuckle_RH.stp').geometry, geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer',
    annualVolume: 50_000, filename: 'steering_knuckle_RH.stp', answers: { ...part('steering_knuckle_RH.stp').answers, ...answers },
  } as unknown as RuleContext);
  it('unanswered: an ADVISORY question, "None" costed, no leaning; the route is bare', () => {
    const { analysis, result } = buildDeterministicAnalysis(specForCommodity('forging')!, ctx({}), 'k');
    const d = result.decisions.find(x => x.id === FINISH_DECISION_ID)!;
    expect(d.severity).toBe('advisory');
    expect(d.options[0]).toMatchObject({ value: 'none', costed: true });
    expect(d.options.some(o => o.leaning)).toBe(false);
    expect((analysis.costInputSuggestions as { surfaceFinish?: { route?: string } }).surfaceFinish?.route).toBe('');
  });
  it('answered: the route, the measured surface and the sized load reach the suggestions and the form fields', () => {
    const { analysis, result } = buildDeterministicAnalysis(specForCommodity('forging')!, ctx({ [FINISH_DECISION_ID]: 'e_coat' }), 'k');
    const sf = (analysis.costInputSuggestions as { surfaceFinish?: Record<string, unknown> }).surfaceFinish!;
    expect(sf.route).toBe('e_coat');
    expect(sf.areaM2).toBe(Number(((part('steering_knuckle_RH.stp').geometry as { surfaceArea: { cm2: number } }).surfaceArea.cm2 / 1e4).toFixed(4)));
    expect(sf.partsPerRack).toBeGreaterThan(1);
    expect(result.provenance['forge-sf-route']?.value).toBe('e_coat');
    expect(result.provenance['forge-sf-rack']?.value).toBe(sf.partsPerRack);
    expect(result.decisions.some(x => x.id === FINISH_DECISION_ID)).toBe(false);
  });
  it('cast + machine writes its own form fields (cam-sf-*)', () => {
    const p = part('PRCR002.stp');
    const { result } = buildDeterministicAnalysis(specForCommodity('cast_and_machine')!, {
      geo: p.geometry, geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer',
      annualVolume: 50_000, filename: 'PRCR002.stp', answers: { ...p.answers, [FINISH_DECISION_ID]: 'e_coat' },
    } as unknown as RuleContext, 'p');
    expect(result.provenance['cam-sf-route']?.value).toBe('e_coat');
    expect(result.provenance['cam-sf-area']).toBeDefined();
  });
  it('headless builds the SAME spec the screen collects from those fields', () => {
    const { analysis } = buildDeterministicAnalysis(specForCommodity('forging')!, ctx({ [FINISH_DECISION_ID]: 'zinc_plate' }), 'k');
    const ci = analysis.costInputSuggestions;
    const mapped = toCostParams('forging', ci, 50_000, 'steel', part('steering_knuckle_RH.stp').geometry as never)!;
    const sf = (ci as { surfaceFinish: { route: string; areaM2: number; partsPerRack: number; racksPerHour: number } }).surfaceFinish;
    expect(mapped.params.surfaceFinishing).toEqual(finishSpec({
      route: sf.route, productForm: 'forge_standard', measuredAreaM2: sf.areaM2, partsPerRack: sf.partsPerRack,
      racksPerHour: sf.racksPerHour, annualVolume: 50_000, region: 'UK',
    }));
  });
});

describe('D4 — costing', () => {
  it('a bare part costs exactly what the real-parts baseline recorded (the question moves nothing unanswered)', async () => {
    for (const n of ['steering_knuckle_RH.stp', 'PRCR002.stp', 'Seat_Locking_Bracket.stp']) {
      const r = await headless(n, part(n).answers);
      expect(Math.round(r.total! * 100) / 100).toBe(part(n).outcome.total);
    }
  });
  it('an answered finish adds its cost on every finishing route (forging, cast + machine, stamping)', async () => {
    for (const [n, f] of [['steering_knuckle_RH.stp', 'e_coat'], ['PRCR002.stp', 'e_coat'], ['Seat_Locking_Bracket.stp', 'zinc_plate']] as const) {
      const bare = await headless(n, part(n).answers);
      const coated = await headless(n, { ...part(n).answers, [FINISH_DECISION_ID]: f });
      expect(coated.total! - bare.total!).toBeGreaterThan(0.05);
      expect(coated.total! - bare.total!).toBeLessThan(3);   // a coating, not a second part (the 6-a-rack default added £7.17)
    }
  });
  it('a fabricated part carries the finish too (a stamping the rules re-route to laser + brake kept it on stamping only)', () => {
    const base: SheetMetalFabInputs = {
      materialId: 'mat-dc01', partWeightKg: 0.5, materialUtilization: 0.8, blankingMethod: 'laser',
      blankingMachineId: 'laser-trumpf-3030', blankingLabourId: 'lab-uk-semiskilled', blankingCycleTimeSec: 30,
      bendCount: 2, timePerBendSec: 30, toolChangeCount: 1, toolChangeTimeSec: 300, bendMachineId: 'brake-amada-hfe100',
      bendLabourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.95, toolingCost: 1000, amortizationVolume: 10_000,
    };
    const bare = computeSheetMetalFabDrivers(base);
    const fin = computeSheetMetalFabDrivers({ ...base, surfaceFinishing: finishSpec({ route: 'powder_coat', productForm: 'sheet_standard', measuredAreaM2: 0.05, partsPerRack: 100, racksPerHour: 20, annualVolume: 10_000, region: 'UK' }) });
    expect(fin.operations.length).toBeGreaterThan(bare.operations.length);
    expect(fin.rawMaterial.consumablesCostPerPart ?? 0).toBeGreaterThan(bare.rawMaterial.consumablesCostPerPart ?? 0);
  });
});

describe('D5 — compare routes (rebuilt in the compare-routes review, Oct 2026)', () => {
  it('the costing\'s own route reproduces the headless cost; the others carry their assumptions', async () => {
    const k = part('steering_knuckle_RH.stp');
    const cmp = await compareRoutes({ geo: k.geometry as never, filename: 'k.stp', current: 'forging', answers: k.answers, region: 'UK', annualVolume: 50_000, baseBook: book, ladder: false });
    const ref = cmp.rows.find(r => r.route === 'forging')!;
    expect(Math.round(ref.total! * 100) / 100).toBe(k.outcome.total);
    const cam = cmp.rows.find(r => r.route === 'cast_and_machine')!;
    expect(cam.status).toBe('costed');
    expect(cam.assumed.join(' ')).toMatch(/leak-tight/);
    // As-cast is not the finished knuckle: it has 12 machined holes / bores.
    expect(cmp.rows.map(r => r.route)).not.toContain('casting');
    expect(cmp.excluded.find(e => e.route === 'casting')!.reasons[0].id).toBe('as_cast_scope');
  });
  it('only routes that can make the named metal are offered (no rubber for a steel shaft)', () => {
    const s = part('MACH_Stepped_Shaft.stp');
    const routes = candidateRoutes({ geo: s.geometry as never, filename: 's.stp', current: 'machining', answers: s.answers, annualVolume: 50_000, baseBook: book });
    expect(routes).not.toContain('rubber');
    expect(routes).not.toContain('extrusion');
    expect(routes[0]).toBe('machining');
  });
  it('a route the rules re-price as one already listed is folded into that row', async () => {
    const b = part('Seat_Locking_Bracket.stp');
    const cmp = await compareRoutes({ geo: b.geometry as never, filename: 'b.stp', current: 'sheet_metal', answers: b.answers, region: 'UK', annualVolume: 50_000, baseBook: book, ladder: false });
    expect(cmp.rows.map(r => r.route)).toEqual(['sheet_metal']);
    expect(cmp.rows[0].notes.join(' ')).toMatch(/also priced/);
  });
  it('the table: reference first, deltas signed, a typed change on the form called out, text escaped', () => {
    const row = (route: string, total: number, toolingPerPart: number, assumed: string[]): RouteCompareRow => ({
      route, commodity: route, status: 'costed', total, toolingPerPart, breakdown: null, reconciles: null, material: null, tooling: null,
      operations: null, checks: [], caveats: [], assumed, openQuestions: [], notes: [], refusal: null, byVolume: [],
    });
    const html = routeCompareHtml(routeComparisonExport({
      principle: 'p', rows: [row('casting', 31.79, 0.9, ['<b>x</b>']), row('forging', 24.22, 1.01, [])], excluded: [], ladder: [], crossovers: [],
    }, { current: 'forging', headline: 24.5, labels: { forging: 'Forging', casting: 'Casting' } }), { fmt: n => `£${n.toFixed(2)}` });
    expect(html.indexOf('Forging')).toBeLessThan(html.indexOf('Casting'));
    expect(html).toContain('+£7.57 (+31%)');
    expect(html).toContain('the headline is £24.50 — the form carries a typed change');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('data-cost-route="casting"');
  });
});

describe('Gate and screen fixes found in the phase 2 live runs', () => {
  it('Get cost re-runs the rules when an ADVISORY answer changed since the last analysis', () => {
    const s = { hasFile: true, hasAnalysis: true, decisions: [] };
    expect(nextCostStep({ ...s, answers: { 'service.finish': 'zinc_plate' }, appliedAnswers: {} }).kind).toBe('reanalyse');
    expect(nextCostStep({ ...s, answers: { 'service.finish': 'zinc_plate' }, appliedAnswers: { 'service.finish': 'zinc_plate' } }).kind).toBe('apply');
    expect(answersChangedSince({ a: '' }, {})).toEqual([]);
  });
  it('Not included: the finish line goes once a finish is answered; machining keeps "not asked"', () => {
    expect(notIncludedFor('forging')[0]).toMatch(/costed bare/);
    expect(notIncludedFor('forging', 'e_coat').some(t => /coating/i.test(t))).toBe(false);
    expect(notIncludedFor('machining')[0]).toMatch(/not asked/);
  });
  const main = readFileSync('src/ui/main.ts', 'utf8');
  it('choosing a route records it as the process answer, and the new route\'s questions are shown, not accepted', () => {
    const fn = main.slice(main.indexOf('async function applyAlternativeProcess'), main.indexOf('function programmeYearsValue'));
    expect(fn).toContain("_cadDecisionAnswers['commodity.route'] = ct;");
    expect(fn).toMatch(/openCADDecisions\(\)[\s\S]*showCADQuestions/);
  });
  it('the CAD screen is reopened from its own state, and no draft is saved mid comparison-country fill', () => {
    expect(main).toContain("showWorkflowPanel('cad_analysis', { restoreDraft: false });\n    setTimeout(() => showCADQuestions");
    expect(main).toMatch(/if \(_capturingCountryFills\) \{ saveDraftSoon\(\); return; \}/);
  });
  it('the compare endpoint reads the server\'s geometry by hash and no model', () => {
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    const ep = cad.slice(cad.indexOf("router.post('/compare-routes'"), cad.indexOf("router.post('/reanalyze'"));
    expect(ep).toContain('getGeometry(geometryHash');
    expect(ep).not.toMatch(/createAnthropic|anthropic/);
  });
});

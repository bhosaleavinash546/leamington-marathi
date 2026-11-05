/**
 * CAD to COST Phase C (approved 5 Nov 2026 — the independent review's top recommendations, fresh-review.md (C) 1–3):
 *   1. the £ effect beside each step-2 option — a REAL re-cost of the part with that one answer changed, equal to what
 *      Get cost gives with that option chosen, to the penny (server/services/option-costs.ts, /api/cad/option-costs);
 *   2. the step-3 card led by the piece price, as page 1 of the core report — the same model (buildCoreReport), so the
 *      card and the PDF's page 1 agree to the penny, alerts included.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { costMeasuredPart, type BulkPartResult } from '../server/services/bulk-run.js';
import { costOptions, routeOf, type QuestionCosts } from '../server/services/option-costs.js';
import { compareRoutes } from '../server/services/route-compare.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { inMaterialScope } from '../src/engine/material-scope.js';
import { buildCoreReport, type CoreReportMeta } from '../src/export/executive-summary.js';
import { printPDF } from '../src/export/pdf.js';
import { NARROW_SLIT_RULE_ID } from '../src/engine/dfm-geometry/commodities/slits.js';
import {
  cadCostCardHtml, cardLeadHtml, optionCostHtml, optionCostSlotHtml, pricedQuestionsReady, routeComparisonExport, routeAlternativesHtml,
  PRICED_QUESTION_IDS, type CardPage1, type OptionCost,
} from '../src/ui/cad-workspace.js';
import { COMMODITY_REPORT_LABELS } from '../src/ui/data/commodity-meta.js';
import type { PartCostResult, UniversalStackInput } from '../src/engine/types.js';

const fixture = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; answers: Record<string, unknown>; geometry: unknown }>;
const geoOf = (part: string) => structuredClone(fixture.find(f => f.part === part)!.geometry) as never;
const BOOK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const VOL = 200_000, YEARS = 5;
const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What Get cost costs with these answers: the headless chain the screen equals to the penny (cad-workspace.test.ts,
 *  the compare-routes reference row and the real-parts baseline all rest on it). */
async function getCost(part: string, answers: Record<string, unknown>, route: string, region: ManufacturingRegion): Promise<BulkPartResult> {
  return costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, commodity: route, annualVolume: VOL },
    { ...answers }, region, { annualVolume: VOL, programmeYears: YEARS, deliveryTerms: 'EXW', acknowledge: [] }, BOOK,
    { partNumber: part, file: part, status: 'error' });
}
const exact = (r: BulkPartResult) => (r.trace as { result: { total: number } }).result.total;

async function options(part: string, region: ManufacturingRegion, answers: Record<string, unknown>, current: string,
  questions: Array<{ id: string; values: string[]; selected: string | null }>): Promise<QuestionCosts[]> {
  return costOptions({ geo: geoOf(part), filename: part, current, answers, region, annualVolume: VOL, programmeYears: YEARS,
    deliveryTerms: 'EXW', baseBook: BOOK, questions });
}

/** Every costed option (and process) equals Get cost with that answer, to the penny — and exactly. */
async function expectEqualsGetCost(part: string, region: ManufacturingRegion, base: Record<string, unknown>, current: string, q: QuestionCosts) {
  let checked = 0;
  for (const o of q.options) {
    if (o.status !== 'costed') continue;
    expect(o.assumed, `${part} ${q.id}=${o.value} took no suggestion`).toEqual([]);
    const answers = o.value === q.selected && base[q.id] === undefined ? { ...base } : { ...base, [q.id]: o.value };
    const route = q.id === 'commodity.route' ? o.value : routeOf(answers, current);
    const direct = await getCost(part, answers, route, region);
    expect(direct.status).toBe('costed');
    expect(Math.round(o.total! * 100), `${part} ${q.id}=${o.value}`).toBe(Math.round(exact(direct) * 100));
    expect(o.total!).toBeCloseTo(exact(direct), 9);
    for (const p of o.processes ?? []) {
      if (p.total == null) continue;
      const pid = route === 'forging' ? 'forging.processChoice' : 'casting.processChoice';
      const dp = await getCost(part, { ...answers, [pid]: p.process }, route, region);
      expect(Math.round(p.total * 100), `${part} ${route} ${p.process}`).toBe(Math.round(exact(dp) * 100));
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(1);
  // Δ is against the option Get cost would cost now
  const sel = q.options.find(o => o.value === q.selected)!;
  for (const o of q.options.filter(x => x.total != null)) expect(o.delta!).toBeCloseTo(o.total! - sel.total!, 9);
}

describe('Phase C 1 — the £ beside an option is Get cost with that option, to the penny', () => {
  it('Casting bracket (UK): every route option, and each casting / forging process under it', async () => {
    const base = fixture.find(f => f.part === 'Casting_Braket.stp')!.answers;
    const [q] = await options('Casting_Braket.stp', 'UK', base, 'cast_and_machine',
      [{ id: 'commodity.route', values: ['casting', 'cast_and_machine', 'forging', 'machining'], selected: 'cast_and_machine' }]);
    await expectEqualsGetCost('Casting_Braket.stp', 'UK', base, 'cast_and_machine', q);
    const forging = q.options.find(o => o.value === 'forging')!;
    expect(forging.processes?.some(p => p.chosen && p.total === forging.total)).toBe(true);
    expect(forging.processes?.find(p => p.process === 'cold-forming')?.reason).toMatch(/^not feasible — /);
  }, 120_000);

  it('Part1 (China): gravity impressions and the aluminium heat treatment — the unanswered default is the costing as it stands', async () => {
    const base = { ...fixture.find(f => f.part === 'Part1.stp')!.answers, 'commodity.route': 'casting',
      'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
    const qs = await options('Part1.stp', 'CN', base, 'casting', [
      { id: 'casting.impressions', values: ['1', '2'], selected: '1' },
      { id: 'casting.heatTreat', values: ['T6', 'T5', 'F'], selected: 'T6' },
    ]);
    for (const q of qs) await expectEqualsGetCost('Part1.stp', 'CN', base, 'casting', q);
    const asItStands = exact(await getCost('Part1.stp', base, 'casting', 'CN'));
    for (const q of qs) expect(q.selectedTotal!).toBe(asItStands);
    // F (no heat treatment) is cheaper than the T6 station costed by default
    expect(qs[1].options.find(o => o.value === 'F')!.delta!).toBeLessThan(0);
  }, 120_000);

  it('ECU cover (UK): the resin question', async () => {
    const base = fixture.find(f => f.part === 'IM_ECU_Cover.stp')!.answers;
    const resins = BOOK.materials.filter(m => inMaterialScope('injection_moulding', m.category)).map(m => m.id);
    const values = ['mat-pa66gf30', ...resins.filter(id => id !== 'mat-pa66gf30').slice(0, 3)];
    const [q] = await options('IM_ECU_Cover.stp', 'UK', base, 'injection_moulding', [{ id: 'material.resin', values, selected: 'mat-pa66gf30' }]);
    await expectEqualsGetCost('IM_ECU_Cover.stp', 'UK', base, 'injection_moulding', q);
  }, 120_000);

  it('Steering knuckle (UK): the forging grade', async () => {
    const base = fixture.find(f => f.part === 'steering_knuckle_RH.stp')!.answers;
    const grades = BOOK.materials.filter(m => inMaterialScope('forging', m.category) && /steel/i.test(m.category)).map(m => m.id).slice(0, 4);
    const [q] = await options('steering_knuckle_RH.stp', 'UK', base, 'forging', [{ id: 'material.grade', values: grades, selected: grades[0] }]);
    await expectEqualsGetCost('steering_knuckle_RH.stp', 'UK', base, 'forging', q);
  }, 120_000);

  it('never an estimate: an option that opens an unanswered question, or a route the screen refuses, has no figure', async () => {
    const base = { 'material.family': 'steel', 'commodity.route': 'machining' };
    const [q] = await options('Casting_Braket.stp', 'UK', base, 'machining',
      [{ id: 'commodity.route', values: ['machining', 'casting', 'injection_moulding'], selected: 'machining' }]);
    const casting = q.options.find(o => o.value === 'casting')!;
    expect(casting.status).toBe('needs_answer');
    expect(casting.total).toBeNull();
    expect(casting.reason).toMatch(/^needs an answer — .*tolerance class/);
    const moulding = q.options.find(o => o.value === 'injection_moulding')!;
    expect(moulding.status).toBe('not_feasible');
    expect(moulding.reason).toMatch(/^not feasible — Material family/);
    expect(optionCostHtml({ kind: 'cost', option: casting, selected: false }, fmt)).toMatch(/^<span class="cad-opt-cost-off">not costed: needs an answer/);
  }, 120_000);
});

describe('Phase C 1 — the option builders', () => {
  const o: OptionCost = { value: 'forging', status: 'costed', total: 17.4258, delta: 7.615, reason: null, assumed: [], commodity: 'forging',
    processes: [{ process: 'closed-die', label: 'closed-die forging', total: 17.4258, reason: null, chosen: true },
      { process: 'cold-forming', label: 'cold forming', total: null, reason: 'not feasible — a complex shape is not cold formed', chosen: false }] };
  it('"£X a part (Δ +£Y)", "this choice" on the option Get cost would cost, the processes under a route', () => {
    const h = optionCostHtml({ kind: 'cost', option: o, selected: false }, fmt);
    expect(h).toMatch(/£17\.43 a part \(Δ \+£7\.62\)/);
    expect(h).toMatch(/closed-die forging £17\.43 \(the rules' choice\) · cold forming not costed \(not feasible — a complex shape/);
    expect(optionCostHtml({ kind: 'cost', option: { ...o, delta: -1.2 }, selected: false }, fmt)).toMatch(/Δ −£1\.20/);
    expect(optionCostHtml({ kind: 'cost', option: { ...o, delta: 0 }, selected: true }, fmt)).toMatch(/£17\.43 a part \(this choice\)/);
  });
  it('while it is re-costed: "costing…", never a number', () => {
    const h = optionCostHtml({ kind: 'loading' }, fmt);
    expect(h).toMatch(/costing…/);
    expect(h).not.toMatch(/\d/);
  });
  it('a slot only on the priced questions', () => {
    expect(optionCostSlotHtml('commodity.route', 'casting')).toMatch(/data-opt-cost-id="commodity\.route" data-opt-cost-value="casting"/);
    expect(optionCostSlotHtml('service.safetyCritical', 'yes')).toBe('');
    for (const id of ['commodity.route', 'casting.processChoice', 'forging.processChoice', 'material.grade', 'material.resin', 'material.elastomer',
      'material.alAlloy', 'casting.impressions', 'casting.heatTreat', 'service.finish']) expect(PRICED_QUESTION_IDS).toContain(id);
  });
  it('the process answered (a chip): each route offered keeps its slot under the chips', () => {
    const asked = { options: [{ value: 'casting', label: 'Cast — a die or pattern' }, { value: 'forging', label: 'Forged — die set' }, { value: 'machining', label: 'Machined from solid' }] };
    const h = routeAlternativesHtml(asked, 'casting');
    expect(h).toMatch(/id="cad-route-alts"/);
    expect(h).toMatch(/Cast \(your answer\)/);
    expect((h.match(/data-opt-cost-id="commodity\.route"/g) ?? []).length).toBe(3);
    expect(routeAlternativesHtml(asked, undefined)).toBe('');
    expect(routeAlternativesHtml({ options: [asked.options[0]] }, 'casting')).toBe('');
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/routeAlternativesHtml\(_cadDecisionsAsked\['commodity\.route'\], _cadDecisionAnswers\['commodity\.route'\]\)/);
  });
  it('bounded: a priced question is re-costed only once every blocking question before it holds a value', () => {
    const ds = [{ id: 'commodity.route', severity: 'blocking' }, { id: 'material.family', severity: 'blocking' },
      { id: 'service.safetyCritical', severity: 'blocking' }, { id: 'material.grade', severity: 'advisory' }, { id: 'service.finish', severity: 'advisory' }];
    expect(pricedQuestionsReady(ds, () => true)).toEqual(['commodity.route', 'material.grade', 'service.finish']);
    expect(pricedQuestionsReady(ds, id => id !== 'service.safetyCritical')).toEqual(['commodity.route']);
    expect(pricedQuestionsReady(ds, () => false)).toEqual(['commodity.route']);
  });
  it('the screen wires it: slots in each option, the Get-cost answers, one request a panel state, no motion on the money', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/optionCostSlotHtml\(d\.id, o\.value\)/);
    const body = main.slice(main.indexOf('async function refreshOptionCosts'), main.indexOf('async function refreshOptionCosts') + 6000);
    expect(body).toMatch(/getCostAnswersPreview\(\)/);
    expect(body).toMatch(/pricedQuestionsReady\(/);
    expect(body).toMatch(/_optionCostCache\.get\(key\)/);
    expect(body).toMatch(/\/api\/cad\/option-costs/);
    expect(body).not.toMatch(/gsap|\.animate\(|countUp/);
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    const route = cad.slice(cad.indexOf("router.post('/option-costs'"), cad.indexOf("router.post('/option-costs'") + 4000);
    expect(route).toMatch(/requireAuth/);
    // cached by part, answers, route, region, volume, life, terms, rules, kernel and the book's content
    expect(route).toMatch(/geometryHash, blankHash, unitScale, filename, route,[\s\S]*region, annualVolume, programmeYears \?\? null, deliveryTerms \?\? 'DAP',[\s\S]*RULE_ENGINE_VERSION, KERNEL_REV, bookPrint/);
  });
});

// ─── 2. The card led by the piece price = PDF page 1 ────────────────────────────────────────────────────────────────

/** Page 1 of a printed core report, as the content stream holds its text. */
function pdfPage1(draw: () => void): string {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  let page = '';
  api.save = function (this: jsPDF) {
    const d = this as unknown as { internal: { pages: string[][] } };
    page = (d.internal.pages[1] ?? []).join('\n').replace(/\\([()\\])/g, '$1').replace(/\u0097/g, '—').replace(/\u0096/g, '–');
    return this;
  };
  try { draw(); } finally { api.save = orig; }
  return page;
}

const page1Of = (m: ReturnType<typeof buildCoreReport>): CardPage1 => ({ total: m.total, price: m.price, tooling: m.tooling, band: m.band,
  alerts: m.alerts, openQuestions: m.openQuestions, confidence: { grade: m.confidence.grade, sentence: m.confidence.sentence, gradeNote: m.confidence.gradeNote } });
const whole = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const stripPdf = (t: string) => t.replace(/\)\s*Tj[\s\S]*?\(/g, ' ').replace(/\s+/g, ' ');

describe('Phase C 2 — the cost card leads with the piece price and equals the PDF page 1 to the penny', () => {
  const cases: Array<{ part: string; region: ManufacturingRegion; route: string; extra?: Record<string, unknown>; compare?: boolean; dfm?: boolean }> = [
    { part: 'Casting_Braket.stp', region: 'UK', route: 'cast_and_machine', dfm: true },
    { part: 'steering_knuckle_RH.stp', region: 'UK', route: 'forging' },
    { part: 'ROTO_Header_Tank.stp', region: 'UK', route: 'rotational_moulding', compare: true },
  ];
  const built: Array<{ part: string; card: string; pdf: string; m: ReturnType<typeof buildCoreReport> }> = [];
  beforeAll(async () => {
    for (const c of cases) {
      const answers = { ...fixture.find(f => f.part === c.part)!.answers, ...(c.extra ?? {}) };
      const r = await getCost(c.part, answers, c.route, c.region);
      const tr = r.trace as unknown as { stackInput: UniversalStackInput; result: PartCostResult };
      const book = c.region === 'UK' ? BOOK : buildRegionalLibrary(BOOK, c.region);
      let routeComparison: CoreReportMeta['routeComparison'] = null;
      if (c.compare) {
        const cmp = await compareRoutes({ geo: geoOf(c.part), filename: c.part, current: c.route, answers, region: c.region, annualVolume: VOL,
          programmeYears: YEARS, deliveryTerms: 'EXW', baseBook: BOOK, ladder: false, bands: false });
        routeComparison = routeComparisonExport(cmp, { current: c.route, labels: COMMODITY_REPORT_LABELS as Record<string, string>, headline: tr.result.total });
      }
      const meta: CoreReportMeta = {
        stamp: 'test', geometrySource: 'occt', annualVolume: VOL, routeComparison,
        uncertainty: { p10: tr.result.total * 0.93, p90: tr.result.total * 1.07, plusMinusPct: 7 },
        checks: { decisions: [{ id: 'service.finish', question: 'Is the part coated or surface-treated?', severity: 'advisory', answer: null }],
          ruleValues: Object.entries(r.provenance ?? {}).map(([id, p]) => ({ label: id, fieldId: id, value: String(p.value ?? ''), basis: String(p.basis ?? '') })) },
        ...(c.dfm ? { geometricDFM: { limitations: [], grouped: [
          { ruleId: 'casting.draft.insufficient', severity: 'blocking', title: 'Undercut — cannot release from the mould', count: 2, recommendation: 'Add a core or re-orient the parting line' },
          { ruleId: NARROW_SLIT_RULE_ID, severity: 'info', title: 'Narrow slit', count: 2, recommendation: 'Saw cut', worst: { detail: 'two 3 mm slits' } },
        ] } } : {}),
      };
      const m = buildCoreReport({ result: tr.result, input: tr.stackInput, library: book, commodity: c.route as never, region: c.region, cadMeta: meta });
      const card = cadCostCardHtml({ commodityLabel: c.route, chips: [], country: 'United Kingdom', annualVolume: VOL, programmeYears: YEARS,
        toolingTotal: tr.stackInput.tooling.totalToolingCost, amortisationVolume: tr.stackInput.tooling.amortizationVolume,
        band: null, confidence: 'Low', basis: [], notIncluded: [], stamp: 'test', fmt, page1: page1Of(m), whole });
      const pdf = pdfPage1(() => printPDF(tr.result, tr.stackInput, book, 'GBP', 1, c.route as never, null, c.region, [], meta as never));
      built.push({ part: c.part, card, pdf, m });
    }
  }, 300_000);

  it('the card leads with the should-cost, then piece price, up-front tooling, replacement sets, the re-add — the programme tooling a detail line below', () => {
    for (const b of built) {
      const at = (s: string) => b.card.indexOf(s);
      expect(at('Should-cost a part'), b.part).toBeGreaterThan(0);
      expect(at('Should-cost a part')).toBeLessThan(at('Piece price as quoted'));
      expect(at('Piece price as quoted')).toBeLessThan(at('Up-front tooling (lump sum)'));
      expect(at('Up-front tooling (lump sum)')).toBeLessThan(at('Of which tool replacement sets'));
      expect(at('Of which tool replacement sets')).toBeLessThan(at('Re-add: piece price') === -1 ? Infinity : at('Re-add: piece price'));
      expect(at('Band')).toBeGreaterThan(at('Of which tool replacement sets'));
      expect(at('Tooling over the programme')).toBeGreaterThan(at('Band'));
      expect(b.card).not.toMatch(/class="cad-cost-v">£[\d,.]+<\/span>\s*<span class="cad-cost-sub">[^<]* a part over/);   // no longer a headline figure
    }
  });

  it('every page-1 figure on the card is the PDF page 1 figure, to the penny', () => {
    for (const b of built) {
      const card = strip(b.card), pdf = stripPdf(b.pdf);
      const pr = b.m.price;
      const figures = [fmt(b.m.total), fmt(pr.pieceAsQuotedGbp), pr.upfrontGbp > 0.5 ? whole(pr.upfrontGbp) : 'none',
        pr.mode === 'amortized' ? `${fmt(pr.runningPerPartGbp)} a part` : 'none'];
      if (pr.mode === 'amortized' && pr.upfrontFactor != null) figures.push(pr.upfrontFactor.toFixed(4), `${Math.round(pr.amortisationVolume).toLocaleString('en-GB')} parts`);
      for (const f of figures) {
        expect(card, `${b.part} card: ${f}`).toContain(f);
        expect(pdf, `${b.part} PDF page 1: ${f}`).toContain(f);
      }
      // the re-add closes on the card exactly as printed: piece + up-front ÷ parts × factor = the headline
      if (pr.mode === 'amortized' && pr.upfrontFactor != null) {
        expect(pr.pieceAsQuotedGbp + pr.upfrontGbp / pr.amortisationVolume * pr.upfrontFactor).toBeCloseTo(b.m.total, 9);
      }
    }
  });

  it('the PDF page-1 alerts are on the card: a BLOCKING DFM finding, uncosted scope (slits), a cheaper feasible route, open questions', () => {
    for (const b of built) {
      const card = strip(b.card), pdf = stripPdf(b.pdf);
      for (const a of b.m.alerts) {
        expect(card, `${b.part}: ${a.title}`).toContain(a.title);
        expect(pdf.replace(/\s+/g, ''), `${b.part} PDF: ${a.title}`).toContain(a.title.replace(/\s+/g, '').slice(0, 40));
      }
      for (const q of b.m.openQuestions.slice(0, 5)) expect(card).toContain(q.split(' — ')[0]);
    }
    const bracket = built.find(b => b.part === 'Casting_Braket.stp')!;
    expect(bracket.m.alerts.map(a => a.kind)).toEqual(expect.arrayContaining(['blocking', 'scope']));
    expect(strip(bracket.card)).toMatch(/This route as costed cannot be made as drawn: Undercut/);
    expect(strip(bracket.card)).toMatch(/Uncosted scope: 2 narrow slits/);
    const tank = built.find(b => b.part === 'ROTO_Header_Tank.stp')!;
    expect(tank.m.alerts.some(a => a.kind === 'route')).toBe(true);
    expect(strip(tank.card)).toMatch(/A feasible route is \d+ % cheaper: Blow/);
    expect(strip(bracket.card)).toMatch(/Open or assumed questions[^]*Is the part coated or surface-treated\?/);
  });

  it('the card grades confidence as page 1 does (one grade)', () => {
    for (const b of built) {
      expect(strip(b.card)).toContain(`confidence ${b.m.confidence.grade}`);
      expect(strip(b.card)).toContain(b.m.confidence.sentence);
    }
    const bracket = built.find(b => b.part === 'Casting_Braket.stp')!;
    expect(bracket.m.confidence.grade).toBe('Low');   // capped by the BLOCKING finding
    expect(strip(bracket.card)).toMatch(/Capped at Low: a BLOCKING DFM finding/);
  });

  it('the screen builds the card from buildCoreReport with the PDF button\'s arguments', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    const fn = main.slice(main.indexOf('function cadCardPage1'), main.indexOf('function cadCardPage1') + 1400);
    expect(fn).toMatch(/buildCoreReport\(\{ result: lastResult, input: lastInput, library, commodity: activeCommodity as CommodityType, region: _mfgRegion,\s*cadMeta: buildCadReportMeta\(\)/);
    expect(fn).toMatch(/fx: _displayFxRate, sym: currencySymbol\(_displayCurrency\)/);
    expect(main).toMatch(/page1: cadCardPage1\(\)/);
    // the comparison's "cheaper route" alert reaches the card when it lands
    const load = main.slice(main.indexOf('async function loadRouteComparison'), main.indexOf('async function loadRouteComparison') + 3500);
    expect(load).toMatch(/refreshCADCardLead\(\)/);
  });

  it('cardLeadHtml prints only what the model holds (a costing with no tooling says none)', () => {
    const p: CardPage1 = { total: 12.5, price: { mode: 'none', pieceAsQuotedGbp: 12.5, upfrontGbp: 0, upfrontFactor: null, amortisationVolume: 1, runningPerPartGbp: 0,
      toolWearInMaterialGbp: 0, unsplitCountedUpfront: false }, tooling: { mode: 'amortized', totalGbp: 0, initialGbp: 0, replacementGbp: 0, perishableGbp: 0,
      unsplitGbp: 0, amortisationVolume: 1, bucketPerPartGbp: 0 }, band: null, confidence: { grade: 'Medium', sentence: 'x', gradeNote: null }, alerts: [], openQuestions: [] };
    const h = strip(cardLeadHtml(p, { fmt, whole }));
    expect(h).toMatch(/Should-cost a part £12\.50 Piece price as quoted £12\.50 the headline: no tooling in this costing/);
    expect(h).toMatch(/Up-front tooling \(lump sum\) none/);
    expect(h).not.toMatch(/Re-add/);
  });
});

/**
 * Part1 (an aluminium triple clamp, cast + machine, gravity die, China, 200k a year, 5 years, LM25) — the live run of
 * 5 Nov 2026 and the eight things its core report got wrong. One describe block a finding, each failing before its fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import { ruleContextFor } from '../server/routes/cad.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';

const BASE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: Record<string, unknown> }>;
const PART1 = { ...BASE.find(p => p.part === 'Part1.stp')!.geometry, status: 'success' } as unknown as OCCTGeometry;
const ANSWERS = { 'material.family': 'aluminium', 'commodity.route': 'cast_and_machine' };
const OV = { annualVolume: 200_000, programmeYears: 5, forcedCommodity: 'cast_and_machine', forcedMaterial: '', region: 'CN' };

describe('(a) AI-led mode asks the service questions exactly as rules-only mode', () => {
  const SERVICE = ['service.pressureTight', 'service.toleranceClass', 'service.safetyCritical'];
  it('the three blocking questions are open in AI-led mode, as in rules-only — nothing is assumed', () => {
    const spec = specForCommodity('cast_and_machine')!;
    const by = (mode: 'ai' | 'deterministic') => buildDeterministicAnalysis(spec,
      ruleContextFor('cast_and_machine', PART1, 'Part1.stp', OV, ANSWERS, mode), 'Part1').result.decisions;
    const ai = by('ai'); const det = by('deterministic');
    for (const id of SERVICE) {
      expect(ai.find(d => d.id === id)?.severity, id).toBe('blocking');
      expect(det.find(d => d.id === id)?.severity, id).toBe('blocking');
    }
    expect(ai.map(d => d.id).sort()).toEqual(det.map(d => d.id).sort());
  });
});

// ── The costing the user made, headless: cast + machine, gravity, China, 200k a year, 5 years, ex-works, LM25 ─────────
import { costMeasuredPart, regionalBook } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildCoreReport, capacityImplied, capacityWarnings, castingLineRate, coreCastSubtype } from '../src/export/executive-summary.js';
import { reportStandardFor } from '../src/export/report-standard.js';
import { foundryNotCostedText, foundryNotModelledReport, FOUNDRY_NOT_COSTED } from '../src/engine/casting-melt.js';
import { partFromKernelGeometry } from '../server/utils/dfm-job-runner.js';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import { narrowSlits, NARROW_SLIT_RULE_ID } from '../src/engine/dfm-geometry/commodities/slits.js';
import { assumedServiceFlagsIn } from '../src/engine/cost-input-rules/derive/service-context.js';
import type { UniversalStackInput, PartCostResult } from '../src/engine/types.js';

const FULL = { ...ANSWERS, 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no', 'material.grade': 'mat-lm25' };
const BASE_BOOK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const CN = regionalBook(BASE_BOOK, 'CN', new Map());
async function part1(region: 'CN' | 'UK' = 'CN', geo: typeof PART1 = PART1) {
  const r = await costMeasuredPart(geo, 'Part1.stp', { partNumber: 'Part1', file: 'Part1.stp', annualVolume: 200_000, commodity: 'cast_and_machine' } as never,
    FULL, region, { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' }, BASE_BOOK, { partNumber: 'Part1', file: 'Part1.stp', status: 'error' } as never);
  expect(r.status).toBe('costed');
  const t = r.trace as unknown as { stackInput: UniversalStackInput; result: PartCostResult };
  const rvs = Object.entries(r.provenance ?? {}).map(([id, p]) => ({ label: id, fieldId: id, value: String(p.value ?? ''), ruleValue: String(p.value ?? ''), basis: String(p.basis ?? '') }));
  return { r, input: t.stackInput, result: t.result, rvs, params: r.params as Record<string, unknown> };
}
const DFM_FIXTURE = JSON.parse(readFileSync('tests/fixtures/dfm/part1-triple-clamp-features.json', 'utf8'));
const dfmOf = (commodity: string) => analyseGeometricDFM(partFromKernelGeometry(DFM_FIXTURE, {
  commodity, filename: 'Part1.stp', materialFamily: 'aluminium', process: 'gravity', annualVolume: 200_000 } as never));

describe('(a) an assumed service flag that reaches a report is an open question, "assumed — confirm"', () => {
  it('the advisor\'s marker names the flags; the core report lists and counts them', async () => {
    expect(assumedServiceFlagsIn(['gravity: medium-volume aluminium … [pressure-tight, tolerance class, safety-critical assumed — confirm before quoting]'])
      .map(f => f.id)).toEqual(['service.pressureTight', 'service.toleranceClass', 'service.safetyCritical']);
    const { input, result, rvs } = await part1();
    const sub = rvs.find(r => r.fieldId === 'cam-cast-subtype')!;
    const marked = rvs.map(r => r === sub ? { ...r, basis: `${r.basis} [pressure-tight, tolerance class, safety-critical assumed — confirm before quoting]` } : r);
    const decisions = [{ id: 'material.grade', question: 'Which aluminium grade?', severity: 'advisory' as const, answer: 'LM25 / A356' }];
    const core = buildCoreReport({ result, input, library: CN, commodity: 'cast_and_machine', region: 'CN', cadMeta: { checks: { decisions, ruleValues: marked } } as never, regionalRows: [] } as never);
    expect(core.openQuestions).toHaveLength(3);
    expect(core.openQuestions.join('\n')).toMatch(/hold pressure or be leak-tight\? — assumed — confirm: costed as not leak-tight/);
    expect(core.spec.find(x => /safety-critical/.test(x.question))?.answer).toBe('assumed — confirm: costed as not safety-critical');
    expect(core.verdict).toMatch(/3 questions open/);
  }, 60_000);
});

describe('(c) casting report text is the costed process\'s and metal\'s', () => {
  it('gravity aluminium: die words, no green-sand or steel items; sand steel keeps them', () => {
    const g = reportStandardFor('cast_and_machine', { castingSubtype: 'gravity', alloy: 'Gravity/Sand Aluminium' });
    const names = g.keyDrivers.map(d => d.name);
    expect(names).toEqual(expect.arrayContaining(['Die casting cell rate', 'Cell crew', 'Die price (first set) and slides', 'Die life (castings)']));
    expect(names.join('|')).not.toMatch(/Moulding line|Pattern/);
    expect(g.notModelled!.join(' ')).not.toMatch(/bentonite|coal dust|riser cut-off|weld repair|sand-plant/);
    expect(g.notModelled!.join(' ')).toMatch(/refractory.*metallurgical lab.*pouring crew beyond the cell crew/);
    expect(g.quoteBreakdown.join('|')).not.toMatch(/Pattern equipment/);
    const sand = reportStandardFor('casting', { castingSubtype: 'sand', alloy: 'Cast Steel' });
    expect(sand.keyDrivers.map(d => d.name)).toEqual(expect.arrayContaining(['Moulding line rate', 'Pattern life']));
    expect(sand.notModelled!.join(' ')).toMatch(/bentonite and coal dust on green sand.*riser cut-off, weld repair/);
    const hpdc = reportStandardFor('casting', { castingSubtype: 'hpdc', alloy: 'HPDC Aluminium' });
    expect(hpdc.keyDrivers.map(d => d.name)).toContain('Die life (shots)');
    expect(hpdc.notModelled!.join(' ')).not.toMatch(/pouring|bentonite/);
    // the rule basis lists the same filtered items
    expect(foundryNotCostedText({ subtype: 'gravity', alloy: 'aluminium' })).not.toMatch(/bentonite|riser|sand-plant/);
    expect(FOUNDRY_NOT_COSTED).toMatch(/bentonite.*riser cut-off/);
    expect(foundryNotModelledReport({ subtype: 'sand', alloy: 'ductile-iron' })).not.toMatch(/riser cut-off/);
  });

  it('Part1\'s core report: die language, the gravity blast basis without "remove sand", the filtered foundry gaps', async () => {
    const { input, result, rvs } = await part1();
    expect(coreCastSubtype(rvs, input)).toBe('gravity');
    const blast = rvs.find(r => r.fieldId === 'cam-shot-blast')!;
    expect(blast.basis).toMatch(/^gravity castings are blasted to clean the as-cast surface — oxide and die-joint flash/);
    expect(blast.basis).not.toMatch(/remove sand|remove the moulding sand/);
    expect(rvs.find(r => r.fieldId === 'cam-plant-kwh')!.basis).not.toMatch(/bentonite|riser cut-off/);
    const core = buildCoreReport({ result, input, library: CN, commodity: 'cast_and_machine', region: 'CN', cadMeta: { checks: { decisions: [], ruleValues: rvs } } as never, regionalRows: [] } as never);
    const drivers = core.negotiation.map(n => n.driver).join('|');
    expect(drivers).toMatch(/Die casting cell rate/);
    expect(drivers).not.toMatch(/Moulding line|Pattern/);
    expect(core.notModelled.join(' ')).not.toMatch(/bentonite|riser cut-off/);
    expect(core.quoteBreakdown.join('|')).toMatch(/Die: first-set price/);
  }, 60_000);
});

describe('(d) the capacity warning says which minutes are sourced', () => {
  it('cutting minutes from the published cutting data; handling and set-up engineering-typical', async () => {
    const { input } = await part1();
    // PKG-2 (10 Nov 2026): Part1 needs 2.8 VF-2s at 200,000 a year in China (5.03 with the fixed allowances) — under the
    // 5-machine dedicated-line warning; the warning is read at a volume that crosses it
    const rows = capacityImplied(input, CN, 400_000);
    const w = capacityWarnings(rows, 400_000).join('\n');
    expect(w).toMatch(/CUTTING minutes are from the tool makers' published cutting data/);
    expect(w).toMatch(/non-cutting time is built per operation.*the load \/ unload handling and the set-up are engineering-typical, not sourced/);
    expect(w).not.toMatch(/machining minutes are engineering-typical and conservative/);
  }, 60_000);
});

describe('(e) the line rate and the costed cycle reconcile, both labelled', () => {
  // Gravity research round (5 Nov 2026): the die cycle is no longer the flat 0.08 h (4.80 min) — it is 3 min × (2·V/S ÷ 10 mm)²
  // on Part1's 10.4 mm section (the section term governs a 2.25 kg pour), one impression; the reconciliation is unchanged.
  it('3.24 min line rate ÷ (1 − 3 % reject) = 3.35 min costed, in the negotiation and operations tables', async () => {
    const { input, result, rvs } = await part1();
    const lr = castingLineRate(rvs, result.operationDetails)!;
    expect(lr).not.toBeNull();
    expect(lr.lineMin).toBeCloseTo(3 * 1.04 ** 2, 6);
    expect(lr.rejectPct).toBe(3);
    expect(lr.costedMin).toBeCloseTo(3 * 1.04 ** 2 / 0.97, 3);
    const core = buildCoreReport({ result, input, library: CN, commodity: 'cast_and_machine', region: 'CN', cadMeta: { checks: { decisions: [], ruleValues: rvs } } as never, regionalRows: [] } as never);
    expect(core.negotiation.find(n => n.driver === 'Die casting cell rate')?.ours)
      .toBe('3.24 min line rate (18.49 an hour); 3.35 min costed = 3.24 ÷ (1 - 3 % reject)');
    expect(core.operations.find(o => /^Gravity Die Casting/.test(o.name))?.name).toBe('Gravity Die Casting — 3.24 min line rate ÷ (1 - 3 % reject)');
  }, 60_000);
});

describe('(g) machining fixtures follow the machines the capacity implies', () => {
  it('one fixture set a VF-2 the capacity table implies (2.82 → 3 × 4 fixturings since PKG-2; 5.03 → 6 before); programming once a fixturing', async () => {
    const { input, rvs } = await part1();
    const vf2 = capacityImplied(input, CN, 200_000).find(r => /VF-2/.test(r.machine))!;
    expect(vf2.machines).toBeGreaterThan(2);
    const sets = Math.ceil(vf2.machines - 1e-6);
    const fx = rvs.find(r => r.fieldId === 'cam-mach-tooling')!;
    // the capacity the tooling was sized on IS the report's capacity row (same hours, same available hours)
    expect(fx.basis).toContain(`${sets} fixture set(s), one a machine`);
    expect(fx.basis).toContain(`${Math.round(vf2.hoursPerYear).toLocaleString('en-GB')} h ÷ ${vf2.availableHours.toLocaleString('en-GB')} h available`);
    expect(fx.basis).toMatch(/cycle ÷ OEE \d+\.\d{4} min \+ change-over \d\.\d{4} min = \d+\.\d{4} min a part; \d+\.\d{4} × 200,000 a year ÷ 60 = [\d,]+ h/);
    expect(fx.basis).toContain(`${4 * sets} dedicated fixture(s) × £2,500`);
    // one set was £… for 4 fixtures; now 4 × sets, the same £2,500 each × the CN toolroom factor
    const one = Math.round(4 * 2500 * (Number(fx.value) / (4 * sets * 2500)));
    expect(Number(fx.value)).toBeCloseTo(one * sets, -1);
    expect(input.tooling.items!.find(i => i.label === 'Machining fixtures')!.gbp).toBe(Number(fx.value));
    expect(rvs.find(r => r.fieldId === 'cam-mach-prog-nre')!.basis).toMatch(new RegExp(`1\\.5 h × 4 fixturing\\(s\\).*programmed once a fixturing and run on all ${sets} machines`));
  }, 60_000);
});

describe('(h) narrow slits and threads', () => {
  it('Part1\'s two R1.5 clamp slits are found (3 mm wide, 35 mm deep), flagged, never priced', () => {
    const slits = narrowSlits(partFromKernelGeometry(DFM_FIXTURE, { commodity: 'cast_and_machine', filename: 'Part1.stp' } as never));
    expect(slits).toHaveLength(2);
    for (const s of slits) { expect(s.widthMm).toBeCloseTo(3, 2); expect(s.depthMm).toBeCloseTo(35, 0); expect(s.wallsInCosting).toBe(true); }
    const g = dfmOf('cast_and_machine').grouped.find(x => x.ruleId === NARROW_SLIT_RULE_ID)!;
    expect(g.count).toBe(2);
    expect(g.totalCostGBP).toBe(0);
    // an older measurement (no kernel `slits`): still flagged and never priced; since phase 3 the costing saws the slits
    // when the measurement carries them (tests/part1-phase3.test.ts)
    expect(g.costNotModelled).toMatch(/carries no slit for the costing/);
  });

  it('no false slit on the other DFM fixtures (bracket, knuckle, stub axle, manifold …)', () => {
    for (const f of ['casting-bracket', 'knuckle', 'stub-axle', 'manifold', 'pocket-block', 'ecu-cover', 'washer-reservoir', 'cross-bore', 'sloped-hole']) {
      const geo = JSON.parse(readFileSync(`tests/fixtures/dfm/${f}-features.json`, 'utf8'));
      expect(narrowSlits(partFromKernelGeometry(geo, { commodity: 'cast_and_machine', filename: f } as never)), f).toHaveLength(0);
    }
  });

  it('page 1 carries the slit as uncosted scope with a question; Not included lists threads', async () => {
    // an older measurement with no kernel `slits` (the recorded baseline carries them since its PKG-2 re-measure, 10 Nov
    // 2026, and the costing then saws them — tests/part1-phase3.test.ts): the slit is uncosted scope on page 1
    const { slits: _s, ...older } = PART1 as typeof PART1 & { slits?: unknown };
    const { input, result, rvs } = await part1('CN', older as typeof PART1);
    const geometricDFM = dfmOf('cast_and_machine');
    const core = buildCoreReport({ result, input, library: CN, commodity: 'cast_and_machine', region: 'CN',
      cadMeta: { checks: { decisions: [], ruleValues: rvs }, geometricDFM } as never, regionalRows: [] } as never);
    const a = core.alerts.find(x => x.kind === 'scope' && /narrow slit/.test(x.title))!;
    expect(a.title).toBe('Uncosted scope: 2 narrow slits (saw cut) detected and NOT in this price');
    expect(a.lines.join(' ')).toMatch(/Question for the supplier: how is the slit cut/);
    expect(core.notIncluded.join('\n')).toMatch(/Threads not detected — confirm/);
  }, 60_000);
});

import * as cf from '../src/ui/country-fields.js';
import { isDecisionPickClick, pinnedGradeAnswer } from '../src/ui/decision-pick.js';

describe('(b) a shop default follows the country unless a person typed it', () => {
  it('a draft restores only TYPED shop figures; a stored default never comes back as if typed', () => {
    cf.resetShopSources();
    expect(cf.shopFigureSource('overhead')).toBe('default');
    cf.overheadTyped(false);                                   // a programmatic fill (country switch, demo, draft)
    expect(cf.shopFigureSource('overhead')).toBe('default');
    // a draft saved with the overhead as a DEFAULT (the 9 % of an earlier China book): not restored as a value
    expect([...cf.restorableShopFields({ sources: { overhead: 'default', packaging: 'size', logistics: 'default' }, basis: {} })]).toEqual([]);
    // a legacy draft (no sources stored): nothing restores
    expect([...cf.restorableShopFields(undefined)]).toEqual([]);
    cf.overheadTyped(true);                                    // a person typed it
    expect(cf.shopFigureSource('overhead')).toBe('typed');
    expect([...cf.restorableShopFields(cf.shopDraftState())]).toEqual(['overhead-pct']);
    cf.restoreShopDraftState({ sources: { overhead: 'default', packaging: 'default', logistics: 'default' }, basis: {} });
    expect(cf.shopFigureSource('overhead')).toBe('default');
    cf.resetShopSources();
  });

  it('main.ts: the overhead field records a trusted keystroke, drafts store the sources, CAD apply resets an untyped overhead', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/el<HTMLInputElement>\('overhead-pct'\)\?\.addEventListener\('input', e => overheadTyped\(e\.isTrusted\)\)/);
    expect(main).toMatch(/fields: collectDraft\(\), shop: shopDraftState\(\)/);
    expect(main).toMatch(/if \(shopIds\.has\(id\) && !shopTyped\.has\(id\)\) return;/);
    expect(main).toMatch(/if \(shopFigureSource\('overhead'\) !== 'typed'\) \{\s*const oh = el<HTMLInputElement>\('overhead-pct'\);/);
    expect(main).toMatch(/shopSources: \{ overhead: shopFigureSource\('overhead'\), packaging: shopFigureSource\('packaging'\) \}/);
  });

  it('the report says "as entered" only when typed, otherwise "<country> default"', async () => {
    const { input, result, rvs } = await part1();
    const at9 = { ...input, overheadPct: 0.09 };
    const res9 = result;   // the source line is what is tested, not the arithmetic
    const src = (overheadPct: number, ohSrc?: 'default' | 'typed') => buildCoreReport({ result: res9, input: { ...at9, overheadPct }, library: CN, commodity: 'cast_and_machine', region: 'CN',
      cadMeta: { checks: { decisions: [], ruleValues: rvs }, ...(ohSrc ? { shopSources: { overhead: ohSrc } } : {}) } as never, regionalRows: [] } as never)
      .commercial.find(c => c.label === 'Overhead')!.source;
    expect(src(0.12, 'default')).toBe('China default (CostVision, not sourced — not a market benchmark)');
    expect(src(0.09, 'typed')).toBe('as entered on the costing (typed)');
    expect(src(0.09, 'default')).toMatch(/^not typed and not the China default \(12\.0 %\)/);
  }, 60_000);
});

describe('(f) a grade the engineer picks prints "answered"', () => {
  it('a click on the ALREADY-ticked option is a pick (no change event fires for it)', () => {
    const radio = { matches: (sel: string) => sel === 'input[type=radio]', closest: (sel: string) => (sel === '.cad-decision' ? {} : null) };
    expect(isDecisionPickClick(radio as never)).toBe(true);
    expect(isDecisionPickClick({ matches: () => false, closest: () => ({}) } as never)).toBe(false);   // a button, a select
    expect(isDecisionPickClick(null)).toBe(false);
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/panel\.addEventListener\('click', e => \{ if \(isDecisionPickClick\(e\.target\)\) onEdit\(e\); \}\);/);
  });
  it('a grade pinned on the CAD panel is the answer, never "not answered"', () => {
    expect(pinnedGradeAnswer('material.grade', 'mat-lm25', DEFAULT_RATE_LIBRARY.materials)).toBe('LM25 / A356 (pinned on the CAD panel)');
    expect(pinnedGradeAnswer('material.grade', '', DEFAULT_RATE_LIBRARY.materials)).toBeNull();
    expect(pinnedGradeAnswer('service.finish', 'mat-lm25', DEFAULT_RATE_LIBRARY.materials)).toBeNull();
  });
});

describe('(a, live) the step-1 process pick travels with every re-analyse', () => {
  it('reanalyzeCAD sends the step-1 override as a non-explicit commodity (an answered route still wins)', async () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toMatch(/const step1 = \(document\.getElementById\('cad-commodity-override'\) as HTMLSelectElement \| null\)\?\.value \?\? '';\s*if \(step1\) body\['commodity'\] = step1;/);
    const { effectiveForcedCommodity } = await import('../server/routes/cad.js');
    expect(effectiveForcedCommodity({ commodity: 'cast_and_machine', decisionAnswers: {} })).toBe('cast_and_machine');
    expect(effectiveForcedCommodity({ commodity: 'cast_and_machine', decisionAnswers: { 'commodity.route': 'casting' } })).toBe('casting');
  });
});

/**
 * CAD to COST fresh review, Phase A (Nov 2026): the findings fixed in this round, each pinned so it cannot come back.
 * Live evidence of the same fixes: the c2c phase-A walk (bracket, knuckle, gear, stub axle, seat bracket; UK → China).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { crossovers, type RouteRow } from '../server/services/route-compare.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { RULE_SPECS } from '../src/engine/cost-input-rules/index.js';
import { entryChoiceHtml, entryChoiceValue, type EntryChoiceDecision } from '../src/ui/cad-workspace.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { questionsToStopOn, newQuestionsMessage, GET_COST_AFTER_STOP_LABEL } from '../src/ui/cad-flow.js';
import { recostPlaceholderHtml } from '../src/ui/recost-pending.js';
import { buildCoreReport } from '../src/export/executive-summary.js';
import { formWeights } from '../src/export/form-weights.js';
import { cadCostCardHtml, weightChipsHtml, bandScopeHtml, raisersHtml } from '../src/ui/cad-workspace.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { confidenceRaisers, confidenceWhy } from '../src/engine/uncertainty.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const main = readFileSync('src/ui/main.ts', 'utf8');
const css = readFileSync('src/ui/styles/saas-polish.css', 'utf8');
function fnBody(name: string): string {
  const start = main.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, `${name} not found`).toBeGreaterThan(0);
  const next = main.slice(start + 1).search(/\n(async )?function \w+\(/);
  return main.slice(start, next > 0 ? start + 1 + next : undefined);
}
const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

const BASELINE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geo = (p: string) => BASELINE.find(x => x.part === p)!.geometry;
const rules = (part: string, commodity: string, answers: Record<string, string>) => runCostInputRules(RULE_SPECS[commodity], {
  geo: geo(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 200_000, filename: part, answers,
} as RuleContext);
const blockingIds = (r: ReturnType<typeof rules>) => r.decisions.filter(d => d.severity === 'blocking').map(d => d.id).sort();

const pt = (volume: number, total: number) => ({ volume, total, p10: null, p90: null, note: null });
const row = (route: string, totals: Array<[number, number]>) =>
  ({ route, process: null, label: route, total: totals[0][1], byVolume: totals.map(([v, t]) => pt(v, t)) } as unknown as RouteRow);

describe('5. The crossover sentence states the right direction on both sides of every crossing', () => {
  const ladder = [5_000, 10_000, 25_000, 200_000, 500_000];
  const ref = row('ref', ladder.map(v => [v, 10]));

  it('a route that crosses twice and is CHEAPER at the costing\'s volume never reads "dearer above" alone (knuckle sand row)', () => {
    // cheaper at 5k, dearer at 10k–25k, cheaper again at 200k (the knuckle's sand-cast row: −20 % at 200,000)
    const alt = row('sand', [[5_000, 9], [10_000, 11], [25_000, 11], [200_000, 8], [500_000, 7]]);
    const [x] = crossovers([ref, alt], ref, ladder, 200_000);
    expect(x.crossings).toEqual([{ atVolume: 7_500, cheaperAbove: false }, { atVolume: expect.any(Number), cheaperAbove: true }]);
    expect(x.cheaperAbove).toBe(true);                    // the crossing that decides 200,000 a year
    expect(x.atVolume).toBe(x.crossings![1].atVolume);
    expect(x.text).toMatch(/^cheaper than the costed route below ~7,500 a year, dearer from ~7,500 to ~[\d,]+ and cheaper above ~[\d,]+ a year on the central estimate/);
    expect(x.text).toMatch(/at this costing's 200,000 a year it is cheaper$/);
    expect(x.text).not.toMatch(/^dearer than the costed route above/);
  });

  it('the mirror case: dearer at the costing\'s volume reads dearer', () => {
    const alt = row('dear', [[5_000, 11], [10_000, 9], [25_000, 9], [200_000, 12], [500_000, 13]]);
    const [x] = crossovers([ref, alt], ref, ladder, 200_000);
    expect(x.cheaperAbove).toBe(false);
    expect(x.text).toMatch(/^dearer than the costed route below ~7,500 a year, cheaper from ~7,500 to ~[\d,]+ and dearer above/);
    expect(x.text).toMatch(/at this costing's 200,000 a year it is dearer$/);
  });

  it('one crossing: the direction above it, and the costing\'s own side of it, both stated', () => {
    const l3 = [5_000, 10_000, 25_000];
    const r3 = row('a', l3.map(v => [v, 10]));
    const below = crossovers([r3, row('b', [[5_000, 12], [10_000, 11], [25_000, 8]])], r3, l3, 10_000)[0];
    expect(below.text).toMatch(/^cheaper than the costed route above ~15,000 a year .*; at this costing's 10,000 a year it is dearer$/);
    const above = crossovers([r3, row('c', [[5_000, 8], [10_000, 9], [25_000, 12]])], r3, l3, 25_000)[0];
    expect(above.cheaperAbove).toBe(false);
    expect(above.text).toMatch(/^dearer than the costed route above ~\d[\d,]* a year .*; at this costing's 25,000 a year it is dearer$/);
  });
});

describe('2. Every blocking question of the route is on screen at once (the bracket needed three Get cost presses)', () => {
  it('casting: leak-tight, tolerance class and safety-critical all open as soon as the material is answered', () => {
    // before: only service.pressureTight — the tolerance class opened on the NEXT Get cost press, safety after that
    const r = rules('Casting_Braket.stp', 'casting', { 'commodity.route': 'casting', 'material.family': 'steel' });
    expect(blockingIds(r)).toEqual(['service.pressureTight', 'service.safetyCritical', 'service.toleranceClass']);
    // with the material still open, only the material is asked (nothing ahead of it)
    expect(blockingIds(rules('Casting_Braket.stp', 'casting', { 'commodity.route': 'casting' }))).toEqual(['material.family']);
  });
  it('accepting what is shown leaves nothing blocking: the next Get cost costs', () => {
    const r = rules('Casting_Braket.stp', 'casting', { 'commodity.route': 'casting', 'material.family': 'steel',
      'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' });
    expect(blockingIds(r)).toEqual([]);
    expect(r.status).toBe('complete');
  });
  it('cast + machine (stub axle) and forging (knuckle) do the same', () => {
    expect(blockingIds(rules('PRCR002.stp', 'cast_and_machine', { 'material.family': 'cast iron' })))
      .toEqual(['service.pressureTight', 'service.safetyCritical', 'service.toleranceClass']);
    expect(blockingIds(rules('steering_knuckle_RH.stp', 'forging', { 'material.family': 'steel' })))
      .toEqual(['service.safetyCritical', 'service.toleranceClass']);
  });
  it('an answer the advisor reads is the same answer: the costed figures do not move', () => {
    const answers = { 'material.family': 'steel', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' };
    const r = rules('steering_knuckle_RH.stp', 'forging', answers);
    expect(r.status).toBe('complete');
    expect(r.byRule['forging.q.safetyCritical'].value).toBe('yes');
  });
});

describe('4. The gear asks what it needs', () => {
  const gearAnswers = { 'gear.helix': '0', 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' };
  it('the safety-critical question appears on the gear route without a material-family answer (O17)', () => {
    // the screen never asks material.family on a gear (its material is gear.materialClass); the question waited on it
    const r = rules('test-gear-m3-z38.step', 'gear', gearAnswers);
    const q = r.decisions.find(d => d.id === 'service.safetyCritical');
    expect(q?.severity).toBe('advisory');
    expect(r.decisions.some(d => d.id === 'material.family')).toBe(false);
    expect(r.status).toBe('complete');
    // and it is there from the first screen, beside the entry questions
    expect(rules('test-gear-m3-z38.step', 'gear', {}).decisions.map(d => d.id)).toContain('service.safetyCritical');
  });
  it('the helix and ISO class are drawn as options with the suggestion ticked and its reason, plus a box', () => {
    const open = rules('test-gear-m3-z38.step', 'gear', {}).decisions;
    const quality = open.find(d => d.id === 'gear.qualityClass') as unknown as EntryChoiceDecision;
    const helix = open.find(d => d.id === 'gear.helix') as unknown as EntryChoiceDecision;
    expect(quality.options.length).toBeGreaterThan(1);
    const qh = entryChoiceHtml(quality, undefined);
    expect(qh).toMatch(/value="7" checked/);                        // the suggestion is ticked …
    expect(qh).toMatch(/Class 7 — finished automotive transmission<\/span>[\s\S]*?\(suggested — see why above\)/);
    expect(qh).not.toMatch(/value="6" checked/);
    expect(qh).toMatch(/data-decision-entry="1" value=""/);       // … and the box is empty, for a value not listed
    const hh = entryChoiceHtml(helix, undefined);
    expect(hh).toMatch(/value="0" checked/);
    expect(hh).toMatch(/value="enter" data-entry-opens="1"/);
    // an answer typed off the drawing is shown in the box with "enter β" ticked
    expect(entryChoiceHtml(helix, '20')).toMatch(/value="enter" checked data-entry-opens="1"[\s\S]*value="20"/);
  });
  it('reading the question: a ticked listed value is the answer, "enter β" needs the box, a typed value wins', () => {
    const helix = rules('test-gear-m3-z38.step', 'gear', {}).decisions.find(d => d.id === 'gear.helix') as unknown as EntryChoiceDecision;
    expect(entryChoiceValue(helix, '0', '')).toBe('0');
    expect(entryChoiceValue(helix, 'enter', '')).toBeNull();
    expect(entryChoiceValue(helix, 'enter', '20')).toBe('20');
    expect(entryChoiceValue(helix, '0', ' 15 ')).toBe('15');
  });
});

describe('2. A Get cost press that stops is never a dead press', () => {
  it('the stop names the new question(s) and says what the next press does', () => {
    // bracket: a re-run added service.pressureTight, pre-ticked "No", untouched
    expect(questionsToStopOn(['service.pressureTight', 'service.toleranceClass'], new Set(['service.pressureTight', 'service.toleranceClass']),
      new Set(['service.pressureTight']), new Set(['service.toleranceClass']))).toEqual(['service.pressureTight']);
    // touched, or seen and not new: nothing to stop on — the press costs
    expect(questionsToStopOn(['a'], new Set(['a']), new Set(['a']), new Set(['a']))).toEqual([]);
    expect(questionsToStopOn(['a'], new Set(['a']), new Set(), new Set())).toEqual([]);
    expect(newQuestionsMessage(1, true)).toBe('1 new question was added by the re-run: review it, then press Get cost — the next press costs the part with the answers shown.');
    expect(newQuestionsMessage(2, true)).toMatch(/^2 new questions were added by the re-run: review them/);
    expect(GET_COST_AFTER_STOP_LABEL).toBe('Get cost with these answers →');
  });
  it('the stop scrolls to and focuses the question, writes the reason beside it and relabels the button', () => {
    const show = fnBody('showCADQuestions');
    expect(show).toMatch(/blocks\[0\]\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
    expect(show).toMatch(/target\?\.focus\(\{ preventScroll: true \}\)/);
    expect(show).toMatch(/cad-decision-stop/);
    expect(show).toMatch(/btn\.textContent = GET_COST_AFTER_STOP_LABEL/);
    const gate = fnBody('cadGetCost');
    expect(gate).toMatch(/showCADQuestions\(newQuestionsMessage\(unseen\.length, byRerun\), unseen\)/);
    expect(gate).toMatch(/_cadNewQuestions\.clear\(\);\s+\/\/ stopped on once/);   // B3: stops ONCE, the next press costs
    // an untouched New pre-tick is not sent with a re-run another answer triggers (it came back a chip, unseen)
    expect(fnBody('readCADDecisionPanel')).toMatch(/if \(_cadNewQuestions\.has\(id\) && !_cadTouchedDecisions\.has\(id\) && _cadDecisionAnswers\[id\] === undefined\) continue;/);
    expect(gate.indexOf('_cadNewQuestions.clear();')).toBeLessThan(gate.indexOf('readCADDecisionPanel();'));   // recorded on the next press
  });
  it('the Get cost row is never under the sticky action bar', () => {
    expect(main).toMatch(/<div class="cad-get-cost-row"[^>]*>\s*<button class="btn btn-primary" id="cad-get-cost-btn"/);
    expect(css).toMatch(/\.cad-get-cost-row \{\s*position: sticky; bottom: calc\(var\(--cv-actions-h, 64px\) \+ 6px\)/);
    expect(main).toMatch(/watchActionBarHeight\(\);/);
  });
});

describe('3. A country switch never shows a figure from the old book', () => {
  it('a labelled placeholder replaces the result until the new costing is drawn', () => {
    const h = recostPlaceholderHtml('China');
    expect(h).toMatch(/Re-costing in China…/);
    expect(h).toMatch(/is-indeterminate/);                     // no percentage nobody reported
    expect(h).not.toMatch(/[£¥]\s?\d/);                        // no money at all
    expect(recostPlaceholderHtml('<b>')).toMatch(/&lt;b&gt;/);
    expect(css).toMatch(/html\[data-recosting\] \.results-panel > :not\(#cv-recost-pending\) \{ display: none !important; \}/);
  });
  it('the switch hides the result BEFORE redrawing it in the new currency, and shows it once the new cost is drawn', () => {
    const at = (re: RegExp) => main.search(re);
    const begin = at(/const recost = lastResult && lastInput && region !== _mfgRegion \? beginRecost\(/);
    const currency = at(/\n    _applyCurrency\(cur\);/);
    const pickers = at(/for \(const id of \['mfg-region-selector', 'costing-country-sel'\]\) \{\n      const sel = el<HTMLSelectElement>\(id\);\n      if \(sel && Array\.from\(sel\.options\)\.some\(o => o\.value === region\)\) sel\.value = region;\n    \}\n    \/\/ Display currency/);
    expect(begin).toBeGreaterThan(0);
    expect(begin).toBeLessThan(currency);
    expect(pickers).toBeGreaterThan(0);
    expect(pickers).toBeLessThan(currency);                     // the stamp never reads the old picker over the new book
    expect(main).toMatch(/applyCADToForm\(target, true, done\); else done\(\); \}, done\);/);
    expect(fnBody('applyCADToForm')).toMatch(/try \{\s+if \(autoCalculate\) \{\s+compute\(\);\s+\}\s+\} finally \{ onDone\?\.\(\); \}/);
    expect(fnBody('currentCADStamp')).toMatch(/REGIONAL_DATA\[_mfgRegion\]\?\.name/);
  });
});

describe('6. One weight set: finished, as cast (poured), bought — £/kg on the as-cast weight', () => {
  const op = (name: string, machineId: string, hr: number) => ({ operationName: name, machineId, labourId: 'lab-uk-skilled',
    cycleTimeHr: hr, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: hr, labourEfficiency: 0.92 });
  // the casting bracket on the casting route: the form holds the FINISHED 2.512 kg, the stack pours 3.039 kg as cast
  const input = {
    partName: 'Casting bracket (test)', rawMaterial: { materialId: 'mat-gs-c25', netWeightKg: 3.039, materialUtilization: 0.9719, lossIsNotScrap: true },
    operations: [op('Sand Casting — Moulding', 'sand-auto-vertical-line', 0.0003), op('Finish machining — +Z side', 'mach-hmc-400', 0.02)],
    tooling: { totalToolingCost: 28_350, amortizationVolume: 1_000_000, mode: 'amortized' },
    packagingPerPart: 0.15, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
  } as unknown as UniversalStackInput;
  const rvs = [{ label: 'Part Weight (kg)', value: '2.512', basis: 'measured', fieldId: 'cast-part-wt' },
    { label: 'Reject', value: '0.03', basis: 'rule', fieldId: 'cast-reject' }];
  it('the casting route: as cast = the poured 3.039 kg (not the finished 2.512 kg); finished stated beside it', () => {
    const w = formWeights(rvs, input, 'casting')!;
    expect(w.asFormedKg).toBeCloseTo(3.039, 6);
    expect(w.finishedKg).toBeCloseTo(2.512, 6);
    expect(w.boughtKg).toBeCloseTo(3.039 / 0.9719, 6);
    expect(w.line).toMatch(/^Weights: finished 2\.512 kg · as cast 3\.039 kg a casting · bought 3\.127 kg a good part/);
    expect(w.line).toMatch(/The £\/kg figures are on the weight of ONE casting as cast\.$/);
  });
  it('the report\'s £/kg as cast divides by 3.039 kg — about £1.52/kg on the bracket, not £1.84', () => {
    const result = computeUniversalStack(input, lib);
    const r = buildCoreReport({ result, input, library: lib, commodity: 'casting', region: 'UK',
      cadMeta: { checks: { decisions: [], ruleValues: rvs } } as never, baseLibrary: lib, regionalRows: [], fx: 1, sym: '£' } as never);
    expect(r.perKg!.kg).toBeCloseTo(3.039, 6);
    expect(r.perKg!.kgLabel).toBe('as cast');
    expect(r.perKg!.pricePerKg).toBeCloseTo(result.total / 3.039, 9);
    expect(r.formMachine?.kg ?? 3.039).toBeCloseTo(3.039, 6);
  });
  it('nothing machined: one weight, no separate finished figure', () => {
    const plain = { ...input, rawMaterial: { ...input.rawMaterial, netWeightKg: 2.512 } } as UniversalStackInput;
    const w = formWeights(rvs, plain, 'casting')!;
    expect(w.asFormedKg).toBeCloseTo(2.512, 6);
    expect(w.finishedKg).toBeNull();
  });
  it('the cost card prints the same set under the same names', () => {
    const h = weightChipsHtml({ form: 'cast', finishedKg: 2.512, formedKg: 3.039, billetKg: null, boughtKg: 3.127 });
    expect(h).toMatch(/Finished<\/span> <strong>2\.512 kg/);
    expect(h).toMatch(/As cast<\/span> <strong>3\.039 kg<\/strong> <span class="cad-answer-k">poured, machining stock on/);
    expect(h).toMatch(/Bought<\/span> <strong>3\.127 kg/);
    expect(h).not.toMatch(/costed<\/span>/);
    expect(weightChipsHtml({ form: 'forged', finishedKg: null, formedKg: 3.365, billetKg: 4.983, boughtKg: 5.084 }))
      .toMatch(/As forged<\/span> <strong>3\.365 kg[\s\S]*Billet<\/span> <strong>4\.983 kg[\s\S]*Bought<\/span> <strong>5\.084 kg/);
  });
  it('compare routes names the net weight the same way on screen, PDF and workbook', () => {
    const rc = readFileSync('server/services/route-compare.ts', 'utf8');
    expect(rc).toMatch(/\/\^\(casting\|cast_and_machine\)\$\/\.test\(route\) && rm\.lossIsNotScrap \? 'as cast'/);
    expect(readFileSync('src/ui/cad-workspace.ts', 'utf8')).toMatch(/\$\{esc\(r\.material\.netLabel \?\? 'net'\)\} \$\{kg\(r\.material\.netKg\)\}/);
    expect(readFileSync('src/export/pdf.ts', 'utf8')).toMatch(/\$\{r\.material\.netLabel \?\? 'net'\}/);
    expect(readFileSync('src/export/excel.ts', 'utf8')).toMatch(/'Net kg', 'Net kg is', 'Bought kg'/);
  });
});

describe('7. The band and the confidence grade say the same thing', () => {
  const op = (name: string, machineId: string, labourId: string, hr: number) => ({ operationName: name, machineId, labourId,
    cycleTimeHr: hr, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: hr, labourEfficiency: 0.92 });
  const input = {
    partName: 'Bracket (test)', rawMaterial: { materialId: 'mat-gs-c25', netWeightKg: 3.039, materialUtilization: 0.9719, lossIsNotScrap: true },
    operations: [op('Sand Casting — Moulding', 'sand-auto-vertical-line', 'lab-uk-foundry', 0.0003),
      op('Finish machining — +Z side', 'mach-hmc-400', 'lab-uk-skilled', 0.02), op('Drilling — 6 holes', 'mach-hmc-400', 'lab-uk-skilled', 0.02)],
    tooling: { totalToolingCost: 28_350, amortizationVolume: 1_000_000, mode: 'amortized' },
    packagingPerPart: 0.15, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000,
  } as unknown as UniversalStackInput;
  const result = computeUniversalStack(input, lib);
  it('what would raise confidence: the Low inputs with the £ a part resting on each — figures the costing holds', () => {
    const lows = result.traceability.filter(t => t.confidence === 'Low');
    const raisers = confidenceRaisers(result, input, 10);
    for (let k = 1; k < raisers.length; k++) expect(raisers[k - 1].gbp).toBeGreaterThanOrEqual(raisers[k].gbp);
    // every £ is one the costing already carries: an operation's machine / labour cost, or the material bought at the price
    for (const r of raisers) for (const f of r.fields) expect(lows.map(t => t.field)).toContain(f);
    const opCost = (n: string, k: 'processCost' | 'labourCost') => result.operationDetails.find(o => o.operationName === n)![k];
    const lab = raisers.find(r => r.fields.some(f => /labourRatePerHr$/.test(f) && /Drilling|Finish/.test(f)));
    if (lab) expect(lab.gbp).toBeCloseTo(lab.fields.reduce((s, f) => s + opCost(f.replace(/\.labourRatePerHr$/, ''), 'labourCost'), 0), 9);
    const matLow = lows.find(t => t.field === 'material.pricePerKg');
    if (matLow) expect(raisers.find(r => r.fields.includes('material.pricePerKg'))!.gbp).toBeCloseTo(3.039 / 0.9719 * matLow.value, 9);
  });
  it('the card says what the band covers and what it does not, beside a Low grade', () => {
    const h = bandScopeHtml({ band: { pm: 6.9, p10: 8.52, p90: 9.78 }, confidence: 'Low' });
    expect(h).toMatch(/The band is the spread of the modelled input ranges, not the model's error\./);   // D6 kept
    expect(h).toMatch(/It covers the Monte-Carlo spread of the inputs it varies/);
    expect(h).toMatch(/It does not cover an unsourced rate or assumption being wrong .* scope this costing leaves out .* or the model's own error/);
    expect(h).toMatch(/a narrow band and a Low grade are not a contradiction/);
    expect(h).toMatch(/Accuracy against prices actually paid is not yet measured/);
    expect(bandScopeHtml({ band: { pm: 6.9, p10: 8.52, p90: 9.78 }, confidence: 'Medium' })).not.toMatch(/not a contradiction/);
    const raise = raisersHtml({ raisers: [{ fields: ['Drilling — 6 holes.labourRatePerHr', 'Finish machining — +Z side.labourRatePerHr'], gbp: 0.5 }], fmt: n => `£${n.toFixed(2)}`, confidence: 'Low' });
    expect(raise).toMatch(/What would raise confidence/);
    expect(raise).toMatch(/Drilling — 6 holes: labour rate \(and 1 more operation on the same rate\) — £0\.50 a part/);
  });
  it('the cost card carries both, and no new number (the band and grade are the engine\'s)', () => {
    const why = confidenceWhy(result);
    const h = cadCostCardHtml({ commodityLabel: 'Castings', chips: [], country: 'United Kingdom', annualVolume: 200_000, programmeYears: 5,
      toolingTotal: 28_350, amortisationVolume: 1_000_000, band: { pm: 6.9, p10: 8.52, p90: 9.78 }, confidence: why.grade, basis: [], notIncluded: [],
      stamp: 's', fmt: n => `£${n.toFixed(2)}`, confidenceWhy: why, raisers: confidenceRaisers(result, input) });
    expect(h).toMatch(/id="cad-band-scope"/);
    expect(h).toMatch(/id="cad-confidence-raise"/);
  });
});

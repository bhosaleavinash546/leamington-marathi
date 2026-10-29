/**
 * CAD to COST as three steps (proposal v2, approved 28 Oct 2026 — docs/ui/cad-to-cost-redesign-2026-10.md).
 * The builders are pure; the decisions D1–D3 and D6 and the reproducibility stamp are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cadStepsHtml, cadFactsHtml, programmeLifeLine, answerChips, answerChipsHtml, notIncludedFor, sortBasis,
  cadCostCardHtml, cadStamp, confidenceWhyText, traceFieldLabel, type BasisRow,
} from '../src/ui/cad-workspace.js';
import { safetyCriticalDecision, safetyConsequence, answeredBool, SAFETY_CRITICAL_DECISION_ID } from '../src/engine/cost-input-rules/derive/service-context.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const main = readFileSync('src/ui/main.ts', 'utf8');
const fmt = (n: number) => `£${n.toFixed(2)}`;

function fnBody(name: string): string {
  const start = main.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, `${name} not found`).toBeGreaterThan(0);
  const next = main.slice(start + 1).search(/\n(async )?function \w+\(/);
  return main.slice(start, next > 0 ? start + 1 + next : undefined);
}

const ctx = (filename: string, commodity = 'forging', assumeLeanings = false) =>
  ({ filename, commodity, answers: {}, assumeLeanings, geo: { partName: '' } } as unknown as RuleContext);

describe('D1 — no "safety-critical" pre-tick without evidence', () => {
  it('a part named as a chassis part leans Yes; an unnamed one leans nothing', () => {
    const named = safetyCriticalDecision(ctx('steering_knuckle_RH.stp'));
    expect(named.options.find(o => o.value === 'yes')?.leaning).toBe(true);
    const unnamed = safetyCriticalDecision(ctx('PRCR002.stp'));
    expect(unnamed.options.some(o => o.leaning)).toBe(false);   // it pre-ticked No and costed grey iron
  });
  it('the unattended AI path still falls back to No, as stated in the basis', () => {
    expect(answeredBool(ctx('PRCR002.stp', 'casting', true), SAFETY_CRITICAL_DECISION_ID)).toBe(false);
    expect(answeredBool(ctx('PRCR002.stp', 'casting', false), SAFETY_CRITICAL_DECISION_ID)).toBe(null);
  });
});

describe('D2 — the safety consequence names the check this process charges', () => {
  it('MPI on a forging, X-ray / CT on a casting', () => {
    expect(safetyConsequence('forging')).toMatch(/MPI on a closed-die forging/);
    expect(safetyConsequence('forging')).not.toMatch(/X-ray/);
    expect(safetyConsequence('casting')).toMatch(/X-ray \/ CT/);
    expect(safetyConsequence('cast_and_machine')).toMatch(/X-ray \/ CT/);
    expect(safetyCriticalDecision(ctx('knuckle.stp', 'forging')).options[0].consequence).toBe(safetyConsequence('forging'));
  });
});

describe('D3 — programme life is required on CAD to COST', () => {
  it('Get cost stops at the apply step without it, and says why', () => {
    const body = fnBody('cadGetCost');
    const gate = body.indexOf('if (!programmeYearsValue())');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(body.indexOf('applyCADToForm('));
    expect(body).toMatch(/Enter the programme life \(years\) to cost the part/);
  });
  it('the CAD screen field is the costing\'s programme life (one value, two places)', () => {
    expect(main).toMatch(/id="cad-programme-years"/);
    expect(fnBody('wireCADContext')).toMatch(/shared\.value = mine\.value; shared\.dispatchEvent\(new Event\('input'/);
  });
  it('the line under the field states the basis, and the £ per part once tooling is known', () => {
    expect(programmeLifeLine(null, 100000)).toMatch(/^Required: tooling is spread over annual volume × programme life\./);
    expect(programmeLifeLine(5, 100000)).toBe('Tooling is spread over 5 years × 100,000 = 500,000 parts.');
    expect(programmeLifeLine(5, 100000, { total: 436549.69, fmt })).toBe('Tooling £436549.69 over 5 years × 100,000 = £0.87 a part.');
  });
});

describe('the step workspace', () => {
  it('the indicator marks the current step for assistive technology and the done ones in words', () => {
    const h = cadStepsHtml(2);
    expect(h).toMatch(/cad-step--done[^]*Part &amp; context|cad-step--done[^]*Part & context/);
    expect(h).toMatch(/aria-current="step"[^>]*>[^]*Confirm/);
    expect(h).toMatch(/<span class="sr-only"> \(done\)<\/span>/);
    expect((h.match(/aria-current/g) ?? []).length).toBe(1);
  });
  it('four measured facts, nothing invented when a measurement is missing', () => {
    const h = cadFactsHtml({ envelopeMm: [114.4, 236.4, 210], silhouetteCm2: 129.55, faces: 310, volumeCm3: 356.1 });
    expect(h).toMatch(/114 × 236 × 210 mm/);
    expect(h).toMatch(/129\.6 cm²/);
    expect(h).toMatch(/356\.1 cm³/);
    expect(cadFactsHtml({ envelopeMm: null, silhouetteCm2: null, faces: null, volumeCm3: null })).toBe('');
  });
  it('the CAD screen keeps every id the harnesses click', () => {
    for (const id of ['cad-drop-zone', 'cad-file-input', 'cad-analyze-btn', 'cad-analyze-calc-btn', 'cad-annual-volume',
      'cad-commodity-override', 'cad-material-override', 'cad-progress-wrap', 'cad-results', 'cad-viewer-host']) {
      expect(main, id).toMatch(new RegExp(`id="${id}"`));
    }
    expect(main).toMatch(/id="cad-apply-btn"/);   // "Edit inputs first", visible: e2e/cad-parts-live.ts clicks it
  });
  it('the commodity list folds away on CAD to COST; the measurements fold into one section', () => {
    expect(main).toMatch(/case 'cad_analysis':\n\s+\/\/ The part needs the width[^\n]*\n\s+setPickerCollapsed\(true\);/);
    expect(main).toMatch(/<details class="cad-more cad-full" id="cad-full-measurements">/);
  });
});

describe('answers as chips, reopened in place', () => {
  const asked = {
    'commodity.route': { question: 'Which process makes this part?', options: [{ value: 'forging', label: 'Forged' }] },
    'service.safetyCritical': { question: 'Is it safety-critical?', options: [{ value: 'yes', label: 'Yes — safety-critical' }] },
  };
  it('shows the option label, not the code, and drops the consequence', () => {
    const chips = answerChips({ 'commodity.route': 'forging', 'service.safetyCritical': 'yes', 'material.grade': '' }, asked);
    expect(chips).toEqual([
      { id: 'commodity.route', name: 'Process', value: 'Forged' },
      { id: 'service.safetyCritical', name: 'Safety-critical', value: 'Yes' },
    ]);
    expect(answerChipsHtml(chips, true)).toMatch(/data-change-answer="commodity\.route"/);
    expect(answerChipsHtml(chips, false)).not.toMatch(/data-change-answer/);
  });
  it('escapes what it prints', () => {
    const h = answerChipsHtml([{ id: 'x', name: '<b>', value: '"><img src=x onerror=1>' }], true);
    expect(h).not.toMatch(/<img/);
    expect(h).toMatch(/&lt;b&gt;/);
  });
  it('changing an answer drops it and re-runs; Get cost waits while an answer is applied', () => {
    expect(fnBody('wireCADDecisionsPanel')).toMatch(/delete _cadDecisionAnswers\[id\];/);
    const rerun = fnBody('autoRerunCAD');
    expect(rerun).toMatch(/btn\.textContent = 'Updating…'/);
    expect(rerun).toMatch(/setAttribute\('aria-busy', 'true'\)/);
  });
});

describe('step 3 — the cost card', () => {
  const basis: BasisRow[] = [
    { grade: 'Measured', what: 'Part weight', value: '3.255' },
    { grade: 'Rule', what: 'Forge press', value: '1600 t' },
    { grade: 'Answered', what: 'Process', value: 'Forged' },
    { grade: 'Default', what: 'Overhead', value: '12%' },
    { grade: 'Typed', what: 'Programme life', value: '5 years' },
  ];
  const card = cadCostCardHtml({
    commodityLabel: 'Forgings', chips: [], country: 'United Kingdom', annualVolume: 100000, programmeYears: 5,
    toolingTotal: 436549.69, amortisationVolume: 500000, band: { pm: 8.8, p10: 21.95, p90: 26.17 }, confidence: 'Low',
    basis, notIncluded: notIncludedFor('forging'), stamp: 'United Kingdom rate book v2.2.0 · rules v7 · kernel 374f8cebdccb · 28 Oct 2026', fmt,
  });
  it('tooling investment beside its per-part amortisation and basis', () => {
    expect(card).toMatch(/Tooling investment \(one-off\)[^]*£436549\.69[^]*£0\.87 a part over 5 years × 100,000 a year/);
  });
  it('D6 — the band says what it is and is not', () => {
    expect(card).toMatch(/± 8\.8%/);
    expect(card).toMatch(/P10 £21\.95 – P90 £26\.17/);
    expect(card).toMatch(/spread of the modelled input ranges, not the model's error/);
    expect(card).toMatch(/not yet measured/);
  });
  it('the basis puts what a person chose or must check first, measured facts last', () => {
    expect(sortBasis(basis).map(r => r.grade)).toEqual(['Typed', 'Answered', 'Default', 'Rule', 'Measured']);
    expect(card).toMatch(/1 typed · 1 answered · 1 default · 1 rule · 1 measured/);
  });
  it('D4 — not included: coating on routes that never price one; no coating claim on a moulding', () => {
    expect(notIncludedFor('forging')[0]).toMatch(/Surface treatment or coating/);
    expect(notIncludedFor('injection_moulding').some(t => /coating/i.test(t))).toBe(false);
    expect(card).toMatch(/Not included in this cost/);
  });
  it('the stamp is on the card and in both exports', () => {
    expect(card).toMatch(/rules v7 · kernel 374f8cebdccb/);
    expect(cadStamp({ rateBook: 'UK rate book v2.2.0', rules: 7, kernel: 'abc', date: new Date('2026-10-28T12:00:00Z') }))
      .toBe('UK rate book v2.2.0 · rules v7 · kernel abc · 28 Oct 2026');
    expect(readFileSync('src/export/excel.ts', 'utf8')).toMatch(/\.\.\.\(stamp \? \[\['Reproducibility', stamp\]\] : \[\]\)/);
    expect(readFileSync('src/export/pdf.ts', 'utf8')).toMatch(/Reproducibility: \$\{cadMeta\.stamp\}/);
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    expect(cad.match(/versions: \{ rules: RULE_ENGINE_VERSION, kernel: KERNEL_REV \}/g)?.length).toBe(5);
  });
  // CAD to COST trace (28 Oct 2026): the plan items the live run found missing on the cost step
  const full = cadCostCardHtml({
    commodityLabel: 'Forgings', chips: [], country: 'United Kingdom', annualVolume: 100000, programmeYears: 5,
    toolingTotal: 436549.69, amortisationVolume: 500000, band: { pm: 8.8, p10: 21.95, p90: 26.17 }, confidence: 'Low',
    basis, notIncluded: notIncludedFor('forging'), stamp: 'UK rate book · rules v8 · kernel abc · 28 Oct 2026', fmt,
    confidenceWhy: { total: 23, high: 6, medium: 7, low: 10, lowFields: ['Tooling', 'Scrap rate', 'Cycle time', 'Die life', 'Yield'] },
    grade: { label: '38MnVS6 (Microalloyed)', answered: false }, costedWeightKg: 3.3214,
    topMovers: [{ driver: 'Material price', swing: 0.51 }, { driver: 'Forge cycle', swing: 0.12 }],
    commercial: [{ id: 'overhead-pct', label: 'Overhead', value: 12, unit: '%', grade: 'Default' },
      { id: 'packaging', label: 'Packaging', value: 0.19, unit: 'money', grade: 'Rule' }],
  });
  it('the step indicator stays on the cost step, step 3 current', () => {
    expect(full).toMatch(/<nav class="cad-steps" aria-label="Steps to the cost">/);
    expect(full).toMatch(/aria-current="step"><span class="cad-step-n" aria-hidden="true">3<\/span><span class="cad-step-label">Cost/);
  });
  it('the confidence says why, from the mix it is graded on', () => {
    expect(full).toMatch(/Confidence Low: of 23 data points behind this cost, 6 are High, 7 Medium and 10 Low/);
    expect(full).toMatch(/Low: Tooling, Scrap rate, Cycle time, Die life and 1 more\./);
    expect(confidenceWhyText('calibrated', null)).toMatch(/Calibrated against prices actually paid/);
    // a raw traceability key is read as a person would (the live card printed the whole feature list)
    expect(traceFieldLabel('CNC Machining — 20 features (1×Ø10.0×12, 1×Ø11.0×21) [geometry-measured].labourRatePerHr'))
      .toBe('CNC Machining — 20 features: labour rate');
    expect(traceFieldLabel('Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000).labourRatePerHr'))
      .toBe('Machining load / unload + change-over: labour rate');
    expect(traceFieldLabel('Tooling')).toBe('Tooling');
  });
  it('grade and costed weight are chips; a default grade says so', () => {
    expect(full).toMatch(/Grade<\/span> <strong>38MnVS6 \(Microalloyed\)<\/strong> <span class="cad-answer-k">\(default\)/);
    expect(full).toMatch(/Weight<\/span> <strong>3\.321 kg<\/strong>/);
  });
  it('the basis leads with what moves the cost most, then the commercial basis as fields', () => {
    const b = full.slice(full.indexOf('id="cad-basis"'));
    expect(b.indexOf('Moves the cost most')).toBeLessThan(b.indexOf('Commercial basis'));
    expect(b.indexOf('Commercial basis')).toBeLessThan(b.indexOf('cad-basis-list'));
    expect(b).toMatch(/Material price<\/span><span class="cad-basis-val">± £0\.51/);
    expect(b).toMatch(/data-commercial="overhead-pct" value="12"/);
    expect(b).toMatch(/data-commercial="packaging" value="0\.19"/);
  });
  it('packaging / logistics are graded by where they came from — a size estimate is not "Typed"', async () => {
    const cf = await import('../src/ui/country-fields.js');
    cf.setShopBasisUK({ packagingPerPart: 0.19 });
    expect(cf.shopFigureSource('packaging')).toBe('size');
    cf.shopBasisFromTyped('UK', 'packaging', 0.19, false);   // a programmatic input event after a fill
    expect(cf.shopFigureSource('packaging')).toBe('size');
    cf.shopBasisFromTyped('UK', 'packaging', 0.25);          // a person typed it
    expect(cf.shopFigureSource('packaging')).toBe('typed');
    expect(fnBody('collectCADBasis')).toMatch(/shopFigureSource\(id\)/);
  });
  it('the basis is read off the rule decisions, not the form\'s markers (they clear on any input event)', () => {
    const body = fnBody('collectCADBasis');
    expect(body).toMatch(/Object\.values\(_cadRuleFields\)/);
    expect(body).not.toMatch(/data-prov="measured"/);
  });
});

describe('M2 — money never animates its value', () => {
  it('the headline fades; no count-up', () => {
    const anim = readFileSync('src/ui/animations.ts', 'utf8');
    const hero = anim.slice(anim.indexOf('export function animateResultHero'), anim.indexOf('/** Calculate pressed'));
    expect(hero).not.toMatch(/gsap\.to\(proxy/);
    expect(hero).not.toMatch(/textContent =/);
  });
});

describe('screen and headless cost alike when a programme life is entered (parity found by the v2 live check)', () => {
  it('headless charges mould maintenance for every year amortised, as the screen does', async () => {
    const { costMeasuredPart } = await import('../server/services/bulk-run.js');
    const { DEFAULT_RATE_LIBRARY, recomputeMachineRates } = await import('../src/engine/rate-library.js');
    const fixture = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: unknown }>;
    const p = fixture.find(f => f.part === 'IM_ECU_Cover.stp')!;
    const run = async (years: number | null) => (await costMeasuredPart(structuredClone(p.geometry) as never, 'IM_ECU_Cover.stp',
      { partNumber: 'ecu', file: 'IM_ECU_Cover.stp', annualVolume: 100000, commodity: 'injection_moulding' } as never,
      { 'commodity.route': 'injection_moulding', 'material.family': 'plastic', 'material.resin': 'mat-pc-abs' }, 'UK' as never,
      (years ? { annualVolume: 100000, programmeYears: years } : { annualVolume: 100000 }) as never,
      recomputeMachineRates(DEFAULT_RATE_LIBRARY), { partNumber: 'ecu', file: 'x', status: 'error' } as never) as { total: number; trace?: { drivers?: { tooling?: { totalToolingCost: number } } } });
    const five = await run(5);
    // £54,817 mould × (1 + 3 % × 5 years) — the live screen run of 28 Oct 2026 printed £61,203 and £0.8858.
    expect(five.trace?.drivers?.tooling?.totalToolingCost).toBeCloseTo(61203, -1);
    expect(five.total).toBeCloseTo(0.8858, 3);
    expect((await run(null)).total).toBeCloseTo(1.2211, 3);   // no programme life: one year, unchanged
  }, 120_000);
});

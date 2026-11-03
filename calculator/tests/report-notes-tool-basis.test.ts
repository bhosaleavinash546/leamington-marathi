/**
 * Report standard round (Nov 2026), three fixes:
 *  1. The composites "not costed" items and route alert reach the APP's report: the server reads them off its rule
 *     context and sends them as `reportNotes` (report-notes.ts); the browser never holds a RuleContext.
 *  2. Tool-price basis lines print the whole chain, the country's toolroom (or die) factor every time — "UK £6,000 × 1
 *     steel × China toolroom 0.3416 = £2,050" — and every printed "a × b = c" holds (basis-check.py, ported below).
 *  3. An unanswered advisory question says what the costing used ("costed as …"), never "the rules' value".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { withRates } from '../src/engine/rate-context.js';
import { ANSWERS, BASELINE } from '../scripts/real-parts-baseline.js';
import { ruleReportNotes } from '../src/engine/cost-input-rules/report-notes.js';
import { compositesNotCosted, compositesAlert } from '../src/engine/cost-input-rules/commodities/composites.js';
import { LAMINATE_DECISION_ID } from '../src/engine/cost-input-rules/derive/laminate.js';
import { buildCoreReport, buildExecutiveSummary, type CoreReportMeta } from '../src/export/executive-summary.js';
import { decisionUsedValue } from '../src/export/decision-used.js';
import { buildAlExtrusionInputs } from '../src/engine/modules/aluminium-extrusion.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { PartCostResult, UniversalStackInput, RateLibrary } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => structuredClone(base.find(b => b.part === p)!.geometry);
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const CN = buildRegionalLibrary(book, 'CN');

type Costed = { provenance: Record<string, { value: unknown; basis: string }>; params: Record<string, unknown>;
  trace: { stackInput: UniversalStackInput; result: PartCostResult } };
async function cost(part: string, region: 'UK' | 'CN'): Promise<Costed> {
  const spec = ANSWERS[part];
  const r = await costMeasuredPart(geoOf(part), part,
    { partNumber: part, file: part, annualVolume: 200_000, ...(spec.commodity ? { commodity: spec.commodity } : {}) },
    spec.answers, region, { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' }, book, { partNumber: part, file: part, status: 'error' });
  expect(r.status, part).toBe('costed');
  return r as unknown as Costed;
}

// ── basis-check.py's check_text, ported: every "<numbers and operators> = <number>" a text prints must hold ──────────
const NUM = String.raw`[£$€₹¥]?-?\d[\d,]*(?:\.\d+)?%?`;
const val = (t: string) => { const pct = t.endsWith('%'); const v = Number(t.replace(/[£$€₹¥%,]/g, '')); return pct ? v / 100 : v; };
const decimals = (t: string) => { const s = t.replace(/[£$€₹¥%,]/g, ''); return s.includes('.') ? s.split('.')[1].length : 0; };
function evaluate(left: string): number | null {
  const toks: Array<['n', number] | ['o', string]> = [];
  for (const m of left.matchAll(new RegExp(`(${NUM})|(\\s[×x\\*÷/+−-]\\s|[×÷+−])`, 'g'))) {
    if (m[1]) toks.push(['n', val(m[1])]);
    else toks.push(['o', ({ x: '*', '×': '*', '÷': '/', '−': '-' } as Record<string, string>)[m[2].trim()] ?? m[2].trim()]);
  }
  const seq: typeof toks = [];
  for (const t of [...toks].reverse()) {
    if (!seq.length) { if (t[0] === 'n') seq.push(t); continue; }
    if (seq[seq.length - 1][0] !== t[0]) seq.push(t); else break;
  }
  seq.reverse();
  if (seq.length && seq[0][0] === 'o') seq.shift();
  if (seq.length < 3) return null;
  // + − over × ÷, left to right
  const terms: number[] = []; let cur = seq[0][1] as number; let sign = 1;
  for (let i = 1; i < seq.length; i += 2) {
    const op = seq[i][1] as string, n = seq[i + 1][1] as number;
    if (op === '*') cur *= n; else if (op === '/') cur /= n;
    else { terms.push(sign * cur); sign = op === '-' ? -1 : 1; cur = n; }
  }
  terms.push(sign * cur);
  return terms.reduce((a, b) => a + b, 0);
}
/** The equations a text prints that do not hold, and how many it printed that were evaluated. */
function equations(text: string): { bad: string[]; evaluated: number } {
  const bad: string[] = []; let evaluated = 0;
  for (const m of text.matchAll(new RegExp(`(=|→|≈)\\s*(${NUM})`, 'g'))) {
    const at = m.index!;
    const before = text.slice(0, at);
    let start = Math.max(...[';', '|', ':', '('].map(c => before.lastIndexOf(c)));
    start = Math.max(start, before.lastIndexOf('='), before.lastIndexOf('→')) + 1;
    const got = evaluate(text.slice(start, at));
    if (got === null) continue;
    evaluated++;
    const want = val(m[2]);
    const tol = 0.5 * 10 ** -decimals(m[2]) * (m[2].endsWith('%') ? 0.01 : 1);
    let ok = Math.abs(got - want) <= Math.max(tol * 1.0001, Math.abs(want) * 1e-6);
    if (!ok && m[1] === '→' && Math.abs(want - Math.ceil(got - 1e-9)) < 1e-9) ok = true;
    if (!ok && m[1] === '≈' && Math.abs(got - want) <= Math.max(Math.abs(want) * 0.05, tol)) ok = true;
    if (!ok) bad.push(`${text.slice(start, at).trim()} = ${got}, printed ${m[2]}`);
  }
  return { bad, evaluated };
}

describe('2. a tool price prints the UK build-up × the country\'s factor, every time, and its arithmetic holds', () => {
  const cases: Array<{ part: string; text: (c: Costed) => string; kind: 'toolroom' | 'die factor' }> = [
    { part: 'RUB_Grommet.stp', text: c => c.provenance['rub-mould-cost'].basis, kind: 'toolroom' },
    { part: 'RUB_Door_Seal.stp', text: c => c.provenance['rub-mould-cost'].basis, kind: 'toolroom' },
    { part: 'COMP_Hat_Stiffener.stp', text: c => c.provenance['comp-tool-cost'].basis, kind: 'toolroom' },
    { part: 'COMP_Battery_Lid.stp', text: c => c.provenance['comp-tool-cost'].basis, kind: 'toolroom' },
    { part: 'ROTO_Coolant_Tank.stp', text: c => c.provenance['rm-mould-cost'].basis, kind: 'toolroom' },
    { part: 'TF_Trim_Cover.stp', text: c => c.provenance['tf-tool-cost'].basis, kind: 'toolroom' },
    { part: 'EXT_Vent_Pipe.stp', text: c => c.provenance['ext-die-cost'].basis, kind: 'toolroom' },
    { part: 'AL_Battery_Rail.stp', text: c => String(c.params.dieBasis), kind: 'die factor' },
    { part: 'AL_Busbar.stp', text: c => String(c.params.dieBasis), kind: 'die factor' },        // Conform
    { part: 'AL_Battery_Can.stp', text: c => String(c.params.dieBasis), kind: 'die factor' },   // impact
  ];
  const got: Record<string, { UK: string; CN: string }> = {};
  beforeAll(async () => {
    for (const c of cases) got[c.part] = { UK: c.text(await cost(c.part, 'UK')), CN: c.text(await cost(c.part, 'CN')) };
  }, 240_000);

  for (const c of cases) {
    it(`${c.part}: the factor is printed in the UK (1.00) and in China, and every equation holds`, () => {
      const cnFactor = c.kind === 'toolroom' ? CN.regional!.toolroomFactor : null;
      expect(got[c.part].UK).toContain(`× UK ${c.kind} 1.00 = `);
      expect(got[c.part].CN).toMatch(new RegExp(`× China ${c.kind} ${cnFactor ? String(cnFactor).replace('.', '\\.') : '[\\d.]+'} = `));
      for (const region of ['UK', 'CN'] as const) {
        const e = equations(got[c.part][region]);
        expect(e.bad, `${c.part} ${region}: ${got[c.part][region]}`).toEqual([]);
        expect(e.evaluated, `${c.part} ${region}: no equation was evaluated`).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it('the rubber base names its toolroom factor: £6,000 × 1 steel × 0.3416 = £2,050 (it printed "£2050 base (£6,000 × 1 steel)")', () => {
    expect(got['RUB_Grommet.stp'].CN).toContain('base: UK £6,000 × 1 steel × China toolroom 0.3416 = £2,050');
  });

  it('the stretch-bend tooling note prints its chain too', () => {
    const spec = { alloy: '6063' as const, route: 'direct' as const, temper: 'T6' as const, finish: 'mill' as const, bends: 3,
      section: { areaMm2: 400, perimeterMm: 300, ccdMm: 80, voids: 1, minWallMm: 2, partLengthMm: 1200 },
      partWeightKg: 1.3, annualVolume: 50_000, finishAreaM2: 0.3, cncMinutes: 0, cncFixturings: 0, fabFeatureRows: 0 };
    for (const [lib, name, f] of [[book, 'UK', '1.00'], [CN, 'China', '[\\d.]+']] as Array<[RateLibrary, string, string]>) {
      const note = withRates(lib, () => buildAlExtrusionInputs(spec)).notes.find(n => /^stretch-bend form tooling/.test(n))!;
      expect(note).toMatch(new RegExp(`UK £15,000 \\+ 2 × £5,000 = £25,000; £25,000 × ${name} die factor ${f} = `));
      expect(equations(note).bad).toEqual([]);
      expect(equations(note).evaluated).toBe(2);
    }
  });
});

describe('1. the composites "not costed" items and route alert reach the app\'s report', () => {
  const HAT = 'COMP_Hat_Stiffener.stp';
  const ctx = (part: string, commodity = 'composites'): RuleContext => ({
    geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 200_000, programmeYears: 5,
    filename: part, answers: { [LAMINATE_DECISION_ID]: 'prepreg-cf', 'commodity.route': 'composites' },
  } as RuleContext);
  let costed: Costed;
  beforeAll(async () => { costed = await cost(HAT, 'UK'); }, 60_000);
  const core = (meta: CoreReportMeta, commodity: 'composites' | 'machining' = 'composites') => buildCoreReport({
    result: costed.trace.result, input: costed.trace.stackInput, library: book, commodity, region: 'UK', cadMeta: meta });

  it('ruleReportNotes reads the same items and alert as the composites rules, generic by commodity', () => {
    const n = ruleReportNotes('composites', ctx(HAT))!;
    expect(n.commodity).toBe('composites');
    expect(n.notCosted).toEqual(compositesNotCosted(ctx(HAT)));
    expect(n.notCosted.length).toBeGreaterThan(0);
    expect(n.alert).toBe(compositesAlert(ctx(HAT)));
    expect(n.alert).toMatch(/ROUTE ALERT/);
    expect(ruleReportNotes('casting', ctx(HAT, 'casting'))).toBeNull();     // only composites sends notes now
    expect(ruleReportNotes('composites', null)).toBeNull();
  });

  it('the core report lists them from `reportNotes` when there is no rule context (the app), as the headless path does', () => {
    const notes = ruleReportNotes('composites', ctx(HAT))!;
    const app = core({ reportNotes: notes });
    const headless = core({ ruleContext: ctx(HAT) });
    for (const n of notes.notCosted) expect(app.notIncluded).toContain(`${n.item} — ${n.reason}`);
    expect(app.notIncluded).toEqual(headless.notIncluded);
    expect(app.alerts.some(a => a.kind === 'route' && /autoclave/.test(a.title))).toBe(true);
    expect(app.alerts.map(a => a.title)).toEqual(headless.alerts.map(a => a.title));
  });

  it('notes made for another commodity are ignored; an alert from another commodity\'s notes is generic', () => {
    const notes = ruleReportNotes('composites', ctx(HAT))!;
    const other = core({ reportNotes: notes }, 'machining');
    for (const n of notes.notCosted) expect(other.notIncluded).not.toContain(`${n.item} — ${n.reason}`);
    const generic = core({ reportNotes: { commodity: 'machining', notCosted: [{ item: 'X', reason: 'y' }], alert: 'Z' } }, 'machining');
    expect(generic.notIncluded).toContain('X — y');
    expect(generic.alerts.find(a => a.kind === 'route' && a.lines[0] === 'Z')?.title).toBe('The costed route does not suit this volume');
  });

  it('the server sends them on every CAD analysis response; the app carries them into the report', () => {
    const cad = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
    expect(cad.match(/reportNotes: ruleReportNotes\(selectedCommodity, ruleCtx\)/g)?.length).toBe(2);              // /analyze + /reanalyze, rules
    expect(cad.match(/reportNotes: ruleSpec \? ruleReportNotes\(selectedCommodity, withAIAnswers\(/g)?.length).toBe(2); // the AI paths
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    expect(main.match(/_cadReportNotes = \(data as \{ reportNotes\?: RuleReportNotes \| null \}\)\.reportNotes \?\? null;/g)?.length).toBe(3);
    expect(main).toMatch(/reportNotes: dfmBelongsToCosting\(\) \? _cadReportNotes : null,/);
  });
});

describe('3. an unanswered advisory question says what the costing used', () => {
  let costed: Costed;
  beforeAll(async () => { costed = await cost('Casting_Braket.stp', 'UK'); }, 60_000);
  const tol = { id: 'service.toleranceClass', question: 'What tolerance class does the drawing call for?', severity: 'advisory' as const, answer: null,
    options: [{ value: 'loose', label: 'Loose — general as-cast' }, { value: 'standard', label: 'Standard' }, { value: 'tight', label: 'Tight — ±0.1–0.5 mm' }] };
  const imp = { id: 'service.impregnation', question: 'Is vacuum impregnation specified for this leak-tight casting?', severity: 'advisory' as const, answer: null,
    options: [{ value: 'yes', label: 'Yes — impregnate' }, { value: 'no', label: 'No', costed: true }] };
  const unknown = { id: 'x.unknown', question: 'Something nothing records?', severity: 'advisory' as const, answer: null };

  it('the core report prints the tolerance class costed, the option marked costed, and keeps "the rules\' value" only where nothing says', () => {
    const r = buildCoreReport({ result: costed.trace.result, input: costed.trace.stackInput, library: book, commodity: 'cast_and_machine', region: 'UK',
      cadMeta: { checks: { decisions: [tol, imp, unknown], ruleValues: [] } } });
    expect(r.openQuestions).toContain('What tolerance class does the drawing call for? — not answered — costed as Standard (the rules\' stated assumption)');
    expect(r.openQuestions).toContain('Is vacuum impregnation specified for this leak-tight casting? — not answered — costed as No');
    expect(r.openQuestions).toContain('Something nothing records? — not answered — the rules’ value (see the basis)');
  });

  it('the executive page reads the same resolver (it printed "the rules\' value is used")', () => {
    const ex = buildExecutiveSummary({ result: costed.trace.result, input: costed.trace.stackInput, library: book, commodity: 'cast_and_machine', region: 'UK',
      decisions: [tol, { id: 'service.finish', question: 'Is the part coated or surface-treated?', severity: 'advisory', answer: null }] });
    expect(ex.toConfirm).toContain('What tolerance class does the drawing call for? — not answered; costed as Standard (the rules\' stated assumption)');
    expect(ex.toConfirm).toContain('Is the part coated or surface-treated? — not answered; costed as a bare part (no coating or surface treatment in the price)');
  });

  it('decisionUsedValue: a set value wins, then the costed option, then the operations, then the governed rule value', () => {
    const f = { costedItems: ['Leak test (pressure decay)'], ruleValues: [{ fieldId: 'alx-temper', value: 'T6', basis: 'T6: ageing 6 h a load' }] };
    expect(decisionUsedValue({ id: 'service.finish', used: 'given' }, f)).toBe('given');
    expect(decisionUsedValue({ id: 'service.finish', options: [{ value: 'none', label: 'None — bare part', costed: true }] }, f)).toBe('None — bare part');
    expect(decisionUsedValue({ id: 'service.pressureTight' }, f)).toBe('Leak test (pressure decay) (in the price)');
    expect(decisionUsedValue({ id: 'al.temper' }, f)).toBe('T6: ageing 6 h a load');
    expect(decisionUsedValue({ id: 'al.route' }, f)).toBeNull();
  });

  it('the app sets `used` for every unanswered advisory decision from the same resolver, and keeps the costed option', () => {
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/return decisionUsedValue\(\{ id, options: d\.options \}, \{ costedItems, ruleValues \}\);/);
    expect(main).toMatch(/used: usedFor\(id, d, answer\), options: d\.options/);
    expect(main).toMatch(/\.\.\.\(o\.costed \? \{ costed: true \} : \{\}\)/);
  });
});

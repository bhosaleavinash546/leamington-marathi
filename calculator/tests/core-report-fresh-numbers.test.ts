/**
 * The core report as the fresh numbers review read it (4 Nov 2026 — scratchpad review/fresh-numbers.md §2.6, §4):
 *  2. the China negotiation table printed £ values with no unit ("NDT 0.1341", "Machining fixtures 4,270");
 *  3. two "wear" figures with one name; two confidence grades beside a BLOCKING finding; "Material 44 %" holding £2.71 of
 *     metal; the knuckle's weights under different names on pages 2, 4 and 5; "Fettling 0" beside a costed cell; a sand
 *     pattern's life in "shots"; the bracket's moulding £0.04 v £0.48; EN 1563 test bars "optional" on a safety part.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildCoreReport, paramDisplay, formWeights } from '../src/export/executive-summary.js';
import { renderCoreReport } from '../src/export/core-report-pdf.js';
import { localiseGbpText } from '../src/export/money-text.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
type RV = { label: string; value: string; ruleValue?: string; basis: string; fieldId?: string };
const op = (name: string, machineId: string, hr: number, o: Record<string, unknown> = {}) => ({ operationName: name, machineId, labourId: 'lab-uk-skilled',
  cycleTimeHr: hr, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: hr, labourEfficiency: 0.92, ...o });

function stubAxle(answers: Record<string, string>, materialId = 'mat-gjs500') {
  const input = {
    partName: 'Stub axle (test)', rawMaterial: { materialId, netWeightKg: 9.084, materialUtilization: 0.6, lossIsNotScrap: true,
      consumablesCostPerPart: 3 + 1.28, consumablesItems: [{ label: 'Cores', gbp: 3 }, { label: 'Cutting-tool wear', gbp: 1.28 }] },
    operations: [op('Sand Casting — Moulding', 'sand-auto-vertical-line', 0.0005, { manning: 3 }),
      op('Fettling — robotic grinding cell (40 s a casting, 0.5 operator)', 'fettle-robot-cell', 40 / 3600, { manning: 0.5 }),
      op('Finish boring — 1 cored bore(s), 1 stepped', 'mach-hmc-400', 0.03, { manning: 0.5 })],
    tooling: { totalToolingCost: 50_000, amortizationVolume: 1_000_000, mode: 'amortized',
      items: [{ label: 'Pattern set — first set', gbp: 20_000, kind: 'initial' }, { label: 'Pattern set — replacements', gbp: 30_000, kind: 'replacement' }] },
    packagingPerPart: 0.36, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
  } as unknown as UniversalStackInput;
  const rvs: RV[] = [
    { label: 'Casting Process', value: 'Sand casting', ruleValue: 'sand', basis: 'sand', fieldId: 'cam-cast-subtype' },
    { label: 'As-cast weight (kg)', value: '9.084', basis: 'finished + stock', fieldId: 'cam-cast-wt' },
    { label: 'Finished weight (kg)', value: '7.364', basis: 'measured', fieldId: 'cam-finish-wt' },
    { label: 'Cycle Time (hr)', value: '0.0005', basis: 'automatic line, 9 impression(s) a mould (engineering-typical, not sourced)', fieldId: 'cam-sand-ct' },
    { label: 'Die Life (shots)', value: '900000', basis: 'pattern life 100,000 moulds × 9 impression(s) (engineering judgement)', fieldId: 'cam-hpdc-die-life' },
    { label: 'Fettling (bench min/part) ⓘ', value: '0', basis: 'fettled on the cell', fieldId: 'cam-fettle-min' },
    { label: 'Fettling cell (s/part) ⓘ', value: '40', basis: 'Malleable Castings time study', fieldId: 'cam-fettle-cell-sec' },
    { label: 'NDT (£/part) ⓘ', value: '0.1341', basis: 'MPI station', fieldId: 'cam-ndt' },
    { label: 'Machining Fixtures (£) ⓘ', value: '4270', basis: '1 hydraulic fixture', fieldId: 'cam-mach-tooling' },
    { label: 'Cutting Tool Wear (£/part) ⓘ', value: '1.28', basis: '12.8 min × £0.10', fieldId: 'cam-tool-wear' },
  ];
  const decisions = Object.entries(answers).map(([id, answer]) => ({ id, question: id, severity: 'advisory' as const, answer }));
  const result = computeUniversalStack(input, lib);
  return buildCoreReport({ result, input, library: lib, commodity: 'cast_and_machine', region: 'UK',
    cadMeta: { checks: { decisions, ruleValues: rvs } } as never, baseLibrary: lib, regionalRows: [], fx: 1, sym: '£' } as never);
}

describe('2. Every negotiation value carries its unit, so a ¥ report converts it', () => {
  it('a label\'s info glyph no longer hides its unit', () => {
    expect(paramDisplay('NDT (£/part) ⓘ', '0.1341')).toBe('£0.1341 a part');
    expect(paramDisplay('Machining Fixtures (£) ⓘ', '4270')).toBe('£4,270');
    expect(paramDisplay('Blank Material (£/part) ℹ', '1.32')).toBe('£1.32 a part');
    expect(paramDisplay('Die Life (shots) ⓘ — affects total die cost', '900000')).toBe('900,000 shots');
    expect(paramDisplay('Energy £/kWh ℹ', '0.182')).toBe('£0.1820/kWh');
  });
  it('in a China report: NDT ¥1.19 a part, fixtures ¥37,918 — never a bare £ figure', () => {
    const fx = 8.88;
    expect(localiseGbpText(paramDisplay('NDT (£/part) ⓘ', '0.1341'), fx, '¥')).toMatch(/^¥1\.19\d* a part$/);
    expect(localiseGbpText(paramDisplay('Machining Fixtures (£) ⓘ', '4270'), fx, '¥')).toBe('¥37,918');
    const r = stubAxle({});
    const neg = Object.fromEntries(r.negotiation.map(n => [n.driver, n.ours]));
    expect(neg.NDT).toBe('£0.1341 a part');
    expect(neg['Machining fixtures']).toBe('£4,270');
    expect(neg['Cutting-tool wear']).toBe('£1.28 a part');
  });
});

describe('3. The core report says each thing once, under one name', () => {
  it('fettling prints the cell\'s seconds, and a sand pattern\'s life is in castings', () => {
    const neg = Object.fromEntries(stubAxle({}).negotiation.map(n => [n.driver, n.ours]));
    expect(neg.Fettling).toBe('40 s/part');
    expect(neg['Pattern life']).toBe('900,000 castings');
  });
  it('the moulding line rate drives the moulding only — page 4 equals page 3', () => {
    const r = stubAxle({});
    const mould = r.operations.find(o => /Moulding/.test(o.name))!;
    const item = r.unsourced.items.find(i => /Moulding line rate/.test(i.label));
    expect(item?.gbp).toBeCloseTo(mould.gbp, 6);
  });
  it('the material bucket carries its metal £ and the metal\'s share of the price', () => {
    const r = stubAxle({});
    const b = r.buckets[0];
    expect(b.metalGbp).toBeCloseTo(r.material.metalGbp, 9);
    expect(b.metalSharePct).toBeCloseTo(r.material.metalGbp / r.total * 100, 1);
    expect(b.metalWord).toBe('metal');
    expect(b.metalSharePct!).toBeLessThan(b.sharePct);
  });
  it('EN 1563 test bars are REQUIRED on a safety-critical ductile casting, never costed, and absent on cast steel', () => {
    const yes = stubAxle({ 'service.safetyCritical': 'Yes — safety-critical' });
    expect(yes.notIncluded.find(t => /EN 1563/.test(t))).toMatch(/^REQUIRED on this safety-critical ductile casting, not optional/);
    const no = stubAxle({ 'service.safetyCritical': 'No' });
    expect(no.notIncluded.find(t => /EN 1563/.test(t))).toBe('Nodularity / hardness / test-bar certification (EN 1563)');
    expect(stubAxle({ 'service.safetyCritical': 'Yes — safety-critical' }, 'mat-gs-c25').notIncluded.some(t => /EN 1563/.test(t))).toBe(false);
  });
  it('page 1 labels the two wear figures apart: tool replacement sets (tooling) v cutting-tool wear (a consumable)', () => {
    const r = stubAxle({});
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    renderCoreReport(doc, r, { money: g => `£${g.toFixed(2)}`, fx: 1, sym: '£', currency: 'GBP', dateStr: '04 Nov 2026' });
    const text = ((doc as unknown as { internal: { pages: string[][] } }).internal.pages[1] ?? []).join('\n');
    expect(text).toMatch(/OF WHICH TOOL REPLACEMENT SETS/);
    expect(text).not.toMatch(/REPLACEMENT & WEAR/);
    expect(text).toMatch(/Cutting-tool wear \\?\(inserts, drills and end mills/);
  });
});

describe('3. ONE confidence grade; a BLOCKING DFM finding caps it', () => {
  function knuckle(blocking: boolean) {
    const input = {
      partName: 'Knuckle (test)', rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 3.434, materialUtilization: 0.6754 },
      operations: [op('Forging', 'forge-press-1600t', 15 / 3600, { manning: 2 })],
      tooling: { totalToolingCost: 10_000, amortizationVolume: 1_000_000, mode: 'amortized' },
      packagingPerPart: 0.19, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
    } as unknown as UniversalStackInput;
    const rvs: RV[] = [
      { label: 'partWeightKg', value: '3.365', basis: 'as forged', fieldId: 'forge-part-wt' },
      { label: 'flashAndScaleKg', value: '0.337', basis: '10% flash', fieldId: 'forge-flash' },
      { label: 'Stock Yield (0–1)', value: '0.743', basis: 'band', fieldId: 'forge-yield' },
      { label: 'Flash (kg)', value: '0.337', basis: '10% flash', fieldId: 'forge-flash' },
      { label: 'rejectRate', value: '0.02', basis: '2 %', fieldId: 'forge-reject' },
    ];
    const geometricDFM = blocking ? { grouped: [{ ruleId: 'forging.undercut', severity: 'blocking', title: 'Undercut — cannot release from an impression die', count: 1, recommendation: 'Move the parting line' }], limitations: [] } : undefined;
    const result = computeUniversalStack(input, lib);
    return buildCoreReport({ result, input, library: lib, commodity: 'forging', region: 'UK',
      cadMeta: { checks: { decisions: [], ruleValues: rvs }, ...(geometricDFM ? { geometricDFM } : {}) } as never, baseLibrary: lib, regionalRows: [], fx: 1, sym: '£' } as never);
  }
  it('blocking: Low, said beside it, and no second grade anywhere on the confidence block', () => {
    const r = knuckle(true);
    expect(r.confidence.grade).toBe('Low');
    expect(r.confidence.gradeNote).toMatch(/^Capped at Low: a BLOCKING DFM finding \(Undercut/);
    expect(r.confidence.sentence).toMatch(/capped at Low by a BLOCKING DFM finding/);
    expect(`${r.confidence.sentence} ${r.confidence.gradeNote}`).not.toMatch(/Medium on these|screen grades/);
    expect(r.verdict).toMatch(/a part, Low confidence/);
  });
  it('no blocking finding: no note, the grade from the inputs', () => {
    const r = knuckle(false);
    expect(r.confidence.gradeNote).toBeNull();
    expect(r.confidence.sentence).toMatch(new RegExp(`graded ${r.confidence.grade} on these`));
  });
  it('the knuckle\'s weights: ONE set — £/kg on the 3.365 kg forging, the billet and flash named the same on page 5', () => {
    const r = knuckle(false);
    expect(r.perKg?.kg).toBeCloseTo(3.365, 6);
    const w = r.weights!;
    expect(w.billetKg!).toBeCloseTo((3.365 + 0.337) / 0.743, 6);
    expect(w.boughtKg).toBeCloseTo(3.434 / 0.6754, 6);
    expect(w.scrapKg).toBeCloseTo(3.434 / 0.6754 - 3.434, 6);
    expect(w.line).toMatch(/as forged 3\.365 kg a forging \+ flash 0\.337 kg · billet 4\.983 kg a forging/);
    expect(w.line).toMatch(/bought 5\.084 kg a good part \(÷ 0\.98 for 2 % scrap forgings\) · scrap sold 1\.650 kg a good part/);
    const neg = Object.fromEntries(r.negotiation.map(n => [n.driver, n.ours]));
    expect(neg['Stock yield (billet kg a forging)']).toMatch(/billet 4\.983 kg a forging = \(as forged 3\.365 kg \+ flash 0\.337 kg\) ÷ 0\.743/);
    expect(neg.Flash).toBe('0.337 kg a forging (as forged 3.365 kg)');
  });
  it('formWeights is null off the casting / forging routes, or without the rules\' as-formed weight', () => {
    expect(formWeights([], {} as UniversalStackInput, 'machining')).toBeNull();
    expect(formWeights([], { rawMaterial: { netWeightKg: 1, materialUtilization: 1 } } as UniversalStackInput, 'forging')).toBeNull();
  });
});

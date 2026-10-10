/**
 * Casting 360 review (10 Oct 2026, docs/cad/casting-360-review-2026-10-10.md): the knuckle / stub axle / bracket costed
 * live in India at 100k — each fix to the costing or the reports is pinned here.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { printPDF } from '../src/export/pdf.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;

/** The PDF's text as drawn (jsPDF writes uncompressed content streams), parentheses unescaped. */
export function pdfText(render: () => void): string {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  let out = '';
  api.save = function (this: jsPDF) { out = this.output(); return this; };
  try { render(); } finally { api.save = orig; }
  const parts = [...out.matchAll(/\((.*?)(?<!\\)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1'));
  return parts.join('\n');
}

export function sandCastingResult() {
  const input: UniversalStackInput = {
    partName: 'Steering knuckle',
    rawMaterial: { materialId: 'mat-gjs500', netWeightKg: 3.238, materialUtilization: 0.98, lossIsNotScrap: true, consumablesCostPerPart: 4.16,
      consumablesItems: [{ label: 'NDT', gbp: 1.8 }, { label: 'cores', gbp: 0.42 }] } as never,
    operations: [
      { operationName: 'Sand Casting — Moulding', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0.0343, partsPerCycle: 1, oee: 0.8, manning: 4, labourTimeHr: 0.0343, labourEfficiency: 0.92 },
      { operationName: 'Fettling (gate / riser removal, grind)', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.1031, labourEfficiency: 0.92, benchOperation: true },
    ],
    tooling: { totalToolingCost: 30297, amortizationVolume: 100000, mode: 'amortized' },
    packagingPerPart: 0.1, logisticsPerPart: 0.4, overheadPct: 0.09, marginPct: 0.08,
  };
  return { input, result: computeUniversalStack(input, lib) };
}

describe('X1 / X6 — the PDF names its currency and shows bench work as bench work', () => {
  const { input, result } = sandCastingResult();
  const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', []));
  it('prints INR, never a bare number with the sign deleted', () => {
    expect(text).toMatch(/INR \d/);
  });
  it('a bench operation has no machine, rate or OEE in §4A', () => {
    expect(text.replace(/\n/g, ' ')).toMatch(/bench \(no machine\s+time\)/);
  });
});

describe('X10 / X11 / X21 / X27 — the report says what the costing holds', () => {
  const { input, result } = sandCastingResult();
  const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
    { geometrySource: 'occt', measuredVolumeCm3: 356.1, measuredWeightKg: 2.528, annualVolume: 100000 } as never)).replace(/\n/g, ' ');
  it('gross − net is melt loss, not runner weight, when the melt shop remelts the gating', () => {
    expect(text).toMatch(/Melt Loss \(metal lost\)/);
    expect(text).not.toMatch(/Scrap \/ Runner Weight/);
  });
  it('no negative zero', () => { expect(text).not.toMatch(/-INR 0\.00|-0\.00/); });
  it('the provenance box does not call prices and stock "not an estimate"', () => {
    expect(text).not.toMatch(/not an estimate/);
    expect(text).toMatch(/machining stock/);
  });
});

import { metalShareOf } from '../src/engine/idea-levers.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';

describe('X7 / X8 / X9 — cost-reduction texts quote the lines the costing holds', () => {
  const { input, result } = sandCastingResult();
  it('the metal share excludes the consumables and energy in the material bucket', () => {
    const metal = metalShareOf(result, input);
    expect(metal).toBeLessThan(result.breakdown.rawMaterial / result.total);
    expect(metal).toBeCloseTo((result.breakdown.rawMaterial - 4.16) / result.total, 3);
  });
  it('the consumables finding names the lines the costing holds, not "shell, filters"', () => {
    const r = generateDFMDFA(result, input, 'cast_and_machine');
    const f = r.dfm.issues.find(i => /Consumables dominate/.test(i.title));
    expect(f).toBeTruthy();
    expect(f!.description).toMatch(/NDT \d+%/);
    expect(f!.description).not.toMatch(/shell, filters/);
  });
});

import * as XLSX from 'xlsx';
import { exportToExcelBlob } from '../src/export/excel.js';

describe('X14 / X15 — labour is printed by role, and the trace says its source column is in GBP', () => {
  const { input, result } = sandCastingResult();
  it('the PDF prints no UK labour key on a costing in India, and labels the recorded £ column', () => {
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [])).replace(/\n/g, ' ');
    expect(text).not.toMatch(/lab-uk-/);
    expect(text).toMatch(/foundry \(role\)/);
    expect(text).toMatch(/as recorded, GBP/);
  });
  it('the Excel prints no UK labour key, and lists only the roles the costing used', async () => {
    const blob = await exportToExcelBlob(result, input, lib, 'INR', 127.1941, null);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const all = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(all).not.toMatch(/lab-uk-/);
    expect(all).not.toMatch(/ALL AVAILABLE LABOUR RATES/);
    expect(all).toMatch(/foundry \(role\)/);
  });
});

import { readFileSync } from 'node:fs';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { recomputeMachineRates } from '../src/engine/rate-library.js';

describe('X16 — cored bores are finish-bored on the machining centre, not drilled', () => {
  // The knuckle's RECORDED geometry (real-parts baseline) — no kernel needed.
  const all = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{ part: string; geometry: unknown }>;
  const k = all.find(p => p.part === 'steering_knuckle_RH.stp')!;
  const answers = { 'material.family': 'cast iron', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes', 'material.grade': 'mat-gjs500' };
  const ctx = { geo: k.geometry, geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer', annualVolume: 100_000,
    filename: k.part, answers, rates: recomputeMachineRates(DEFAULT_RATE_LIBRARY) };
  const { analysis } = buildDeterministicAnalysis(specForCommodity('cast_and_machine')!, ctx as never, k.part);
  const ops = (analysis as { costInputSuggestions: { estimatedOperations: Array<{ name: string; machineId: string; cycleTimeHr: number }> } })
    .costInputSuggestions.estimatedOperations;
  const drill = ops.find(o => o.name.startsWith('Drilling'))!;
  const bore = ops.find(o => o.name.startsWith('Finish boring'))!;
  it('the drilling op holds only holes up to the cored size (Ø20 in sand)', () => {
    const dias = [...drill.name.matchAll(/Ø([\d.]+)/g)].map(m => Number(m[1]));
    expect(dias.length).toBeGreaterThan(0);
    expect(Math.max(...dias)).toBeLessThanOrEqual(20);
    expect(drill.machineId).toBe('mach-drill');
  });
  it('the Ø63–75 bearing bores are bored on the machining centre', () => {
    expect(bore.name).toMatch(/4 cored bore\(s\).*Ø63\.0.*Ø75\.0/);
    expect(bore.machineId).not.toBe('mach-drill');
  });
  it('minutes are moved, not added: drilling + boring = the 0.0932 h the drilling op held before', () => {
    expect(drill.cycleTimeHr + bore.cycleTimeHr).toBeCloseTo(0.0932, 4);
  });
});

import { findingVariant } from '../src/engine/design-to-cost.js';

describe('X2 / X3 — a DFM finding is re-costed in the report currency and keeps its "upper bound"', () => {
  const { input } = sandCastingResult();
  const withDrill = { ...input, operations: [...input.operations,
    { operationName: 'Drilling — 8 holes (…) [geometry-measured]', machineId: 'mach-drill', labourId: 'lab-uk-skilled', cycleTimeHr: 0.041,
      partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.041, labourEfficiency: 0.92 }] };
  const g = { ruleId: 'machining.hole.many-sizes', totalCostGBP: 0.3,
    worst: { costImpact: { kind: 'feature_cost', perPartGBP: 0.3, minutes: 0.8 } } };
  const inr = (gbp: number) => `INR ${(gbp * 127.1941).toFixed(2)}`;
  const v = findingVariant(g as never, withDrill as never, lib, undefined, inr)!;
  it('the rate in the basis is in the formatter’s currency — no £ beside an INR figure', () => {
    expect(v.basis).toMatch(/INR \d+\.\d\d per hour/);
    expect(v.basis).not.toMatch(/£/);
  });
  it('the many-sizes £ says it is an upper bound', () => {
    expect(v.basis).toMatch(/upper bound: every size merged onto one tool/);
  });
});

describe('X17 — a DFM still running is stated, not silently left out', () => {
  const { input, result } = sandCastingResult();
  it('prints "not included" with the reason', () => {
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
      { geometrySource: 'occt', geometricDFM: null, geometricDFMPending: true } as never)).replace(/\n/g, ' ');
    expect(text).toMatch(/Geometric DFM \/ DFA - not included/);
    expect(text).toMatch(/This is not a clean result/);
  });
});

describe('X5 / X19 / X20 — DFM texts claim only what the costing holds', () => {
  const { input, result } = sandCastingResult();
  const withFix = { ...input, operations: [...input.operations,
    { operationName: 'Load / clamp / unload — 4 fixturing(s)', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.02,
      partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.02, labourEfficiency: 0.92 }] };
  const res2 = computeUniversalStack(withFix as never, lib);
  const setups = { ruleId: 'machining.setup.access-directions', title: 'Features need several setups on a 3-axis machine', severity: 'major',
    count: 1, faceIds: [1], recommendation: 'Bring features onto fewer faces.', source: { standard: 'x' },
    costNotModelled: 'The costing prices its OWN fixturing count.', range: { min: 9, max: 9 }, threshold: { value: 2, comparator: '>', unit: 'setups' },
    worst: { detail: 'reached from 9 directions', measured: { field: 'setups', value: 9, unit: 'setups' } } };
  const dfm = { grouped: [setups], findings: [setups], featuresExamined: 10, rulesEvaluated: 5, packAvailable: true, limitations: [] };
  const text = pdfText(() => printPDF(res2, withFix as never, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
    { geometrySource: 'occt', geometricDFM: dfm } as never)).replace(/\n/g, ' ');
  it('the setups finding states the costing’s count beside its own and which is priced', () => {
    expect(text).toMatch(/In this costing: 4 fixturing\(s\) are charged/);
    expect(text).toMatch(/counts 9 direction\(s\)/);
    expect(text).toMatch(/Check the routing against the holes before quoting/);
  });
  it('no unpriced reason claims a price that is not there', () => {
    const src = readFileSync(new URL('../src/engine/dfm-geometry/cost-impact.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/priced once, in the/);
    expect(src).not.toMatch(/pocket pass is in the cost either way/);
    void result;
  });
});

import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { processServiceFactor } from '../src/engine/regional-services.js';
import { withRates } from '../src/engine/rate-context.js';
import { BLAST_MIN_CHARGE_UK } from '../src/engine/cost-input-rules/commodities/casting.js';

describe('X40 — the shot-blast minimum follows the country', () => {
  const all = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{ part: string; geometry: unknown }>;
  const k = all.find(p => p.part === 'steering_knuckle_RH.stp')!;
  const answers = { 'material.family': 'cast iron', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes', 'material.grade': 'mat-gjs500' };
  const blastIn = (region: 'UK' | 'IN') => {
    const rates = region === 'UK' ? recomputeMachineRates(DEFAULT_RATE_LIBRARY) : buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), region);
    const ctx = { geo: k.geometry, geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer', annualVolume: 100_000,
      filename: k.part, answers, rates };
    const { analysis } = buildDeterministicAnalysis(specForCommodity('cast_and_machine')!, ctx as never, k.part);
    return (analysis as { costInputSuggestions: { casting: { shotBlastCostPerPart: number } } }).costInputSuggestions.casting.shotBlastCostPerPart;
  };
  it('India: below the UK £0.10, never below the UK minimum × the process-service factor', () => {
    const v = blastIn('IN');
    const floor = withRates(buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), 'IN'), () => BLAST_MIN_CHARGE_UK * processServiceFactor());
    expect(v).toBeLessThan(0.10);
    expect(v).toBeGreaterThanOrEqual(floor - 1e-4);
  });
  it('UK: unchanged (factor 1)', () => { expect(blastIn('UK')).toBeGreaterThanOrEqual(0.10); });
});

describe('the machining-stock basis does not claim a drawing input that does not exist', () => {
  const all = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{ part: string; geometry: unknown }>;
  const k = all.find(p => p.part === 'steering_knuckle_RH.stp')!;
  const answers = { 'material.family': 'cast iron', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes', 'material.grade': 'mat-gjs500' };
  const ctx = { geo: k.geometry, geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer', annualVolume: 100_000,
    filename: k.part, answers, rates: recomputeMachineRates(DEFAULT_RATE_LIBRARY) };
  const { result } = buildDeterministicAnalysis(specForCommodity('cast_and_machine')!, ctx as never, k.part);
  it('says the stock is an assumption and how to override it', () => {
    const basis = JSON.stringify(result.provenance);
    expect(basis).not.toMatch(/drawing's RMA replaces it/);
    expect(basis).toMatch(/no drawing is read for it/);
  });
});

import { decisionAnswerText } from '../src/export/decision-text.js';

describe('X29 — an unanswered advisory question prints what the costing used', () => {
  it('names the costed grade, never "engine default"', () => {
    expect(decisionAnswerText({ severity: 'advisory', answer: null, used: 'EN-GJS-500-7' })).toBe('not answered - costed as EN-GJS-500-7');
    expect(decisionAnswerText({ severity: 'blocking', answer: null })).toBe('OPEN');
    expect(decisionAnswerText({ severity: 'advisory', answer: 'cast iron' })).toBe('cast iron');
  });
  it('the PDF and the Excel print it', async () => {
    const { input, result } = sandCastingResult();
    const checks = { costable: true, geometryQuality: 'occt', sanity: [], overrides: [],
      decisions: [{ id: 'material.grade', question: 'Which cast iron grade?', severity: 'advisory', answer: null, used: 'EN-GJS-500-7' }] };
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
      { geometrySource: 'occt', checks } as never)).replace(/\n/g, ' ');
    expect(text).toMatch(/costed as EN-GJS-500-7/);
    expect(text).not.toMatch(/engine default/);
    const blob = await exportToExcelBlob(result, input, lib, 'INR', 127.1941, checks as never);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const all = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(all).toMatch(/costed as EN-GJS-500-7/);
    expect(all).not.toMatch(/engine default/);
  });
});

describe('X12 — the reports print every value the rules set, with its basis', () => {
  const { input, result } = sandCastingResult();
  const checks = { costable: true, geometryQuality: 'occt', sanity: [], overrides: [], decisions: [],
    ruleValues: [
      { label: 'NDT (£/part)', value: '1.8', ruleValue: '1.8', source: 'rule', edited: false,
        basis: 'safety-critical ductile iron: 2D X-ray, £5.00 UK × India NDT factor' },
      { label: 'Moulding crew', value: '4', ruleValue: '4', source: 'rule', edited: false, basis: 'semi-automatic sand line, 4 operators' },
    ] };
  it('PDF', () => {
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
      { geometrySource: 'occt', checks } as never)).replace(/\n/g, ' ');
    expect(text).toMatch(/Values the rules set on the costing form/);
    expect(text).toMatch(/2D X-ray/);
  });
  it('Excel: the table has rows, and an empty override table says so', async () => {
    const blob = await exportToExcelBlob(result, input, lib, 'INR', 127.1941, checks as never);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const ck = XLSX.utils.sheet_to_csv(wb.Sheets['7-Checks']);
    expect(ck).toMatch(/VALUES THE RULES SET/);
    expect(ck).toMatch(/Moulding crew,4,4,rule,"semi-automatic sand line/);
    expect(ck).toMatch(/none — no model value was used/);
  });
});

import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';

describe('X13 — the tooling says what it is, and why it is spread over this many parts', () => {
  // The knuckle's own module inputs, as the review trace recorded them (India, 100k).
  const trace = JSON.parse(readFileSync(new URL('../scripts/casting-review-2026-10-10/before/knuckle-trace.json', import.meta.url), 'utf8'));
  const drivers = computeCastAndMachineDrivers(trace.mapped.params);
  it('the items add up to the total', () => {
    const items = drivers.tooling.items ?? [];
    expect(items.map(i => i.label).join(' | ')).toMatch(/Pattern equipment: \d+ set\(s\) \(life 8,000 moulds each\) \| Machining fixtures \| CNC programming/);
    expect(items.reduce((a, i) => a + i.gbp, 0)).toBeCloseTo(drivers.tooling.totalToolingCost, 6);
    expect(items.some(i => /£/.test(i.label))).toBe(false);   // the report prints the money, in its currency
  });
  it('a blank programme life is stated as one year’s volume, in the PDF and the Excel', async () => {
    const { input } = sandCastingResult();
    const inp = { ...input, annualVolume: 100_000, tooling: { ...input.tooling, items: drivers.tooling.items } };
    const res = computeUniversalStack(inp, lib);
    const text = pdfText(() => printPDF(res, inp, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [])).replace(/\n/g, ' ');
    expect(text).toMatch(/Pattern equipment/);
    expect(text).toMatch(/ONE year.s volume: no programme life was entered/);
    const blob = await exportToExcelBlob(res, inp, lib, 'INR', 127.1941, null);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const sum = XLSX.utils.sheet_to_csv(wb.Sheets['1-Summary']);
    expect(sum).toMatch(/CNC programming/);
    expect(sum).toMatch(/no programme life was entered/);
    const withLife = { ...inp, programmeYears: 5, tooling: { ...inp.tooling, amortizationVolume: 500_000 } };
    const t2 = pdfText(() => printPDF(computeUniversalStack(withLife, lib), withLife, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [])).replace(/\n/g, ' ');
    expect(t2).toMatch(/the programme: 5 years × 100,000 a year/);
  });
});

describe('P3 report text (X24 / X26 / X31 / X32 / X33 / X38)', () => {
  const { input, result } = sandCastingResult();
  const big = { ...input, tooling: { ...input.tooling, totalToolingCost: 30297 } };
  const text = pdfText(() => printPDF(computeUniversalStack(big, lib), big, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [])).replace(/\n/g, ' ');
  it('money has thousands separators', () => { expect(text).toMatch(/INR 3,853,612\.\d\d|INR 3,85\d,\d{3}\.\d\d/); });
  it('no unrounded float anywhere', () => { expect(text).not.toMatch(/\d\.\d{9,}/); });
  void result;
});

import { measureAgainstLimit } from '../src/engine/dfm-geometry/measure-format.js';

describe('X22 — a measured value never prints equal to the limit it is flagged against', () => {
  it('⌀4.92 against a 4.9 stock drill', () => {
    expect(measureAgainstLimit({ min: 4.92, max: 4.92, unit: 'mm' }, 1, { comparator: '>', value: 4.9, unit: 'mm' })).toBe('4.92 mm, flagged above 4.9 mm');
  });
  it('the usual precision is kept when the two already differ', () => {
    expect(measureAgainstLimit({ min: 5.46, max: 8.75, unit: ':1' }, 2, { comparator: '>', value: 4, unit: ':1' })).toBe('5.5–8.8 : 1, flagged above 4 : 1');
  });
});

import { computeCostUncertainty } from '../src/engine/uncertainty.js';

describe('X30 — the band the screen shows is on the cover and in the workbook', () => {
  const { input, result } = sandCastingResult();
  const u = computeCostUncertainty(result, input);
  it('PDF cover', () => {
    const text = pdfText(() => printPDF(result, input, lib, 'INR', 127.1941, 'cast_and_machine', null, 'IN', [],
      { geometrySource: 'occt', uncertainty: u } as never)).replace(/\n/g, ' ');
    expect(text).toContain(`± ${u.plusMinusPct}% (P10 INR`);
  });
  it('Excel summary: confidence grade and band', async () => {
    const blob = await exportToExcelBlob(result, input, lib, 'INR', 127.1941, null, u);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    const sum = XLSX.utils.sheet_to_csv(wb.Sheets['1-Summary']);
    expect(sum).toMatch(new RegExp(`Model confidence,${u.overallConfidence}`));
    expect(sum).toContain(`Uncertainty band,± ${u.plusMinusPct}%`);
    expect(sum).toMatch(/P90 \(conservative\)/);
  });
});

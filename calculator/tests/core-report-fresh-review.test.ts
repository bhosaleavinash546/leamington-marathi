/**
 * The core should-cost report after the fresh review of the 7-page reports (3 Nov 2026,
 * scratchpad review/fresh-core.md): the currency of every £ in the supplier tables (N1), page-1 figures that re-add to the
 * headline as a supplier quotes them (N2), the £ resting on unsourced figures attributed by tooling kind (N3), infeasible
 * alternatives refused (N4), a blocking DFM finding on page 1 (N5), uncosted scope all-in (N6) and the should-fix list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { buildCoreReport, paramDisplay, cleanFieldLabel, capacityImplied, capacityWarnings, gradeOfCounts, type CoreReportMeta } from '../src/export/executive-summary.js';
import { reportStandardFor } from '../src/export/report-standard.js';
import { printPDF } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import { screenRoutes } from '../src/engine/route-feasibility.js';
import { overallConfidence } from '../src/engine/uncertainty.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;

const cast: UniversalStackInput = {
  partName: 'Stub axle (fresh review)',
  rawMaterial: {
    materialId: 'mat-gjs500', netWeightKg: 9.084, materialUtilization: 0.98, lossIsNotScrap: true,
    consumablesCostPerPart: 3.09 + 0.75 + 2.81,
    consumablesItems: [{ label: 'cores', gbp: 3.09 }, { label: 'shot blast', gbp: 0.75 }, { label: 'cutting-tool wear', gbp: 2.81 }],
  },
  operations: [
    { operationName: 'Sand Casting — Moulding', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0.0172, partsPerCycle: 1, oee: 0.8, manning: 4, labourTimeHr: 0.0172, labourEfficiency: 0.92 },
    { operationName: 'Finish machining — +Y side', machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', cycleTimeHr: 0.0624, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.0624, labourEfficiency: 0.92 },
    { operationName: 'Drilling — 12 holes', machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', cycleTimeHr: 0.1328, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.1328, labourEfficiency: 0.92 },
    { operationName: 'Deburr and gauge check (bench)', machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.041, labourEfficiency: 0.92, benchOperation: true },
  ],
  tooling: {
    totalToolingCost: 11_025 + 705_600 + 14_500 + 366, amortizationVolume: 1_000_000, mode: 'amortized',
    items: [
      { label: 'Pattern equipment — first set', gbp: 11_025, kind: 'initial' },
      { label: 'Pattern equipment — 64 replacement sets as it wears out (65 sets over the programme; life 16,000 castings each)', gbp: 705_600, kind: 'replacement' },
      { label: 'Machining fixtures', gbp: 14_500, kind: 'nre' },
      { label: 'CNC programming (NRE)', gbp: 366, kind: 'nre' },
    ],
  },
  packagingPerPart: 0.36, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
  annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
} as UniversalStackInput;
const castRes = computeUniversalStack(cast, lib);

const rv = (label: string, value: string, basis: string, fieldId?: string) => ({ label, value, basis, ruleValue: value, source: 'rule', edited: false, ...(fieldId ? { fieldId } : {}) });
const ruleValues = [
  rv('Core Cost/Part (£)', '3', 'a default band (UK, engineering-typical, not sourced)', 'cam-core'),
  rv('Cycle Time (hr)', '0.0166667', 'semi-automatic line, 60 moulds an hour (engineering-typical, not sourced)', 'cam-sand-ct'),
  rv('Die Cost (£)', '11025', 'sand toolmaker shop model: 156 toolroom hours — a quotation overrides this', 'cam-die-cost'),
  rv('Die Life (shots)', '16000', 'sand pattern life band (engineering-typical, not sourced)', 'cam-die-life'),
  rv('Programming NRE (£)', '366', 'CAM programming 11 h × £33.27/h (hours engineering-typical)', 'cam-prog-nre'),
  rv('Reject Rate (0–1)', '0.03', 'sand ductile iron rejects (engineering-typical, not sourced)', 'cam-reject'),
  rv('Machining Fixtures (£)', '14500', '1 dedicated hydraulic fixture × £12,000 (engineering-typical)', 'cam-mach-tooling'),
];
const decisions = [
  { id: 'service.safetyCritical', question: 'Is this part safety-critical?', severity: 'advisory' as const, answer: 'Yes — safety-critical' },
  { id: 'service.pressureTight', question: 'Does this part have to hold pressure or be leak-tight?', severity: 'advisory' as const, answer: 'No — structural or cosmetic only' },
  { id: 'service.finish', question: 'Is the part coated or surface-treated?', severity: 'advisory' as const, answer: null },
];
const meta: CoreReportMeta = { stamp: 'test', geometrySource: 'occt', uncertainty: { p10: castRes.total * 0.92, p90: castRes.total * 1.08, plusMinusPct: 8 },
  checks: { decisions, ruleValues } };
const core = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: meta });

/** The content streams of a printed PDF, brackets unescaped and WinAnsi dashes read back. */
function pdfText(draw: () => void): string {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  const pages: string[] = [];
  api.save = function (this: jsPDF) {
    const d = this as unknown as { internal: { pages: string[][] } };
    for (const p of d.internal.pages.slice(1)) pages.push((p ?? []).join('\n').replace(/\\([()\\])/g, '$1').replace(/\u0097/g, '—').replace(/\u0096/g, '–'));
    return this;
  };
  try { draw(); } finally { api.save = orig; }
  return pages.join('\n');
}

describe('N1 — every £ in the supplier tables follows the report currency', () => {
  it('a rule value is written as money with its unit, never a bare number beside a "(£)" label', () => {
    expect(paramDisplay('Core Cost/Part (£)', '1.6293')).toBe('£1.63 a part');
    expect(paramDisplay('Cutting Tool Wear (£/part)', '0.3')).toBe('£0.3000 a part');
    expect(paramDisplay('Die Cost (£)', '11025')).toBe('£11,025');
    expect(paramDisplay('Mould / Die Cost (£, 0=estimate)', '25903')).toBe('£25,903');
    expect(paramDisplay('Heat Treatment (£/kg)', '0')).toBe('none costed (£0)');
    expect(paramDisplay('Cycle Time (hr)', '0.0166667')).toBe('1.00 min (60 an hour)');
    expect(paramDisplay('Casting Yield (0–1)', '0.625')).toBe('62.5 %');
    expect(paramDisplay('Die Life (shots)', '16000')).toBe('16,000 shots');
    expect(paramDisplay('Cycle Time (sec, 0=predict)', '42')).toBe('42 s');
    expect(cleanFieldLabel('Mould / Die Cost (£, 0=estimate)')).toBe('Mould / Die Cost');
    expect(cleanFieldLabel('Fettling (bench min/part) ')).toBe('Fettling');
  });

  it('a China PDF and workbook print the cores, the pattern price and the NRE in ¥ — converted, not relabelled', async () => {
    const fx = 8.88;
    const text = pdfText(() => printPDF(castRes, cast, lib, 'CNY', fx, 'cast_and_machine', null, 'UK', [], meta as never));
    expect(text).toContain(`¥${(3 * fx).toFixed(2)} a part`);                      // cores ¥26.64, never "3 (Core Cost/Part (¥))"
    expect(text).toContain(`¥${Math.round(11_025 * fx).toLocaleString('en-GB')}`);   // pattern price ¥97,902
    expect(text).not.toMatch(/\(Core Cost\/Part/);
    expect(text).not.toMatch(/0=estimate|\(Cycle Time \(hr\)\)/);
    expect(text).not.toMatch(/£\d/);                                                // no pound amount left in a ¥ report
    // money the model writes into text is converted from the exact £, not rounded in £ first (¥0.04 drift)
    expect(text).toContain(`Should-cost ¥${(castRes.total * fx).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a part`);
    const blob = await exportToExcelBlob(castRes, cast, lib, 'CNY', fx, { costable: true, sanity: [], overrides: [], ...meta.checks } as never, null, 'test', null, null, 'cast_and_machine', { cadMeta: meta as never });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
    const rows: unknown[][] = [];
    wb.getWorksheet('0-Executive')!.eachRow(r => rows.push((r.values as unknown[]).slice(1)));
    expect(rows.filter(r => r[0] === 'Cores').map(r => r[1])).toContain(`¥${(3 * fx).toFixed(2)} a part`);   // key parameter and negotiation rows
    const nre = rows.find(r => /programming/i.test(String(r[0])) && /¥/.test(String(r[1])));
    expect(nre?.[1]).toBe(`¥${Math.round(366 * fx).toLocaleString('en-GB')}`);
  });
});

describe('N2 — page 1 re-adds as a supplier quotes it', () => {
  it('piece price (running tooling inside) + up-front ÷ volume × its overhead and margin = the headline', () => {
    const p = core.price;
    const running = 705_600;
    expect(p.upfrontGbp).toBeCloseTo(11_025 + 14_500 + 366, 6);
    expect(p.pieceAsQuotedGbp).toBeCloseTo(computeUniversalStack({ ...cast, tooling: { ...cast.tooling, totalToolingCost: running } }, lib).total, 9);
    expect(p.upfrontFactor!).toBeCloseTo(1.12 * 1.08, 9);
    expect(p.pieceAsQuotedGbp + p.upfrontGbp / 1_000_000 * p.upfrontFactor!).toBeCloseTo(castRes.total, 9);
    expect(p.runningPerPartGbp).toBeCloseTo(running / 1_000_000 * 1.12 * 1.08, 9);
    expect(p.toolWearInMaterialGbp).toBeCloseTo(2.81, 9);                           // said where it sits
    const text = pdfText(() => printPDF(castRes, cast, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta as never));
    expect(text).toMatch(/Cutting-tool wear \(inserts, drills and end mills worn in machining — a consumable, not a tool replacement set\) £2\.81 a part is costed in material \(bucket 1\)/);
  });
});

describe('N3 — the £ resting on unsourced figures, attributed by tooling kind', () => {
  const item = (re: RegExp) => core.unsourced.items.find(i => re.test(i.label));
  it('a life drives the replacement sets; the programming NRE is its own £366 (not "over the programme")', () => {
    expect(item(/Pattern life/)!.gbp).toBeCloseTo(705_600 / 1_000_000, 12);
    expect(item(/programming/i)!.gbp).toBeCloseTo(366 / 1_000_000, 12);
    expect(item(/fixtures/i)!.gbp).toBeCloseTo(14_500 / 1_000_000, 12);
  });
  it('a reject rate moves the whole cost (no £); an ESTIMATE tooling line counts', () => {
    expect(core.unsourced.items.find(i => /reject/i.test(i.label))!.gbp).toBeNull();
    const est = { ...cast, tooling: { totalToolingCost: 1_747_086, amortizationVolume: 1_000_000, mode: 'amortized',
      items: [{ label: 'Extrusion die: £10,003 a set (the up-front investment) × 174.66 sets worn out — ESTIMATE (die-maker figures)', gbp: 1_747_086 }] } } as UniversalStackInput;
    const r = buildCoreReport({ result: computeUniversalStack(est, lib), input: est, library: lib, commodity: 'aluminium_extrusion', region: 'UK', cadMeta: { checks: { decisions: [], ruleValues: [] } } });
    expect(r.unsourced.totalGbp).toBeCloseTo(1_747_086 / 1_000_000, 9);
  });
  it('says overhead, margin and packaging (CostVision defaults) are NOT in the share, with their £', () => {
    expect(core.unsourced.defaults.map(d => d.label)).toEqual(['overhead 12.0 %', 'margin 8.0 %', 'packaging']);
    expect(core.unsourced.defaultsGbp).toBeCloseTo(castRes.breakdown.overhead + castRes.breakdown.margin + castRes.breakdown.packaging, 9);
    expect(core.unsourced.defaultsNote).toMatch(/^Not in this share: overhead 12\.0 % £[\d.]+, margin 8\.0 % £[\d.]+ and packaging £0\.36 — CostVision defaults/);
  });
  it('the PDF lists the top 8 with a total row', () => {
    const text = pdfText(() => printPDF(castRes, cast, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta as never));
    expect(text).toContain('(Total, each cost line counted once) Tj');
  });
});

describe('N4 — infeasible alternatives are refused', () => {
  const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: { partName: string } }>;
  const geo = (name: string) => parts.find(p => p.geometry.partName === name)!.geometry as never;
  it('a multi-void closed extrusion section is not pressed or bent from sheet', () => {
    const s = screenRoutes('aluminium_extrusion', { geo: geo('AL_Battery_Rail'), filename: 'AL_Battery_Rail.stp', family: 'aluminium', annualVolume: 200_000 });
    for (const r of ['sheet_metal', 'sheet_metal_fab']) {
      const row = s.find(x => x.route === r)!;
      expect(row.feasible).toBe(false);
      expect(row.checks.find(c => c.id === 'closed_section')!.measured).toMatch(/^4 chamber/);
    }
  });
  it('a hollow body costed as blow moulding is not offered injection moulding; an open moulding keeps its routes', () => {
    const s = screenRoutes('blow_moulding', { geo: geo('BM_Air_Duct'), filename: 'BM_Air_Duct.stp', family: 'plastic', annualVolume: 200_000 });
    expect(s.find(x => x.route === 'injection_moulding')!.feasible).toBe(false);
    expect(s.find(x => x.route === 'injection_moulding')!.checks.some(c => c.id === 'hollow_costed' && !c.pass)).toBe(true);
    expect(s.find(x => x.route === 'blow_moulding')!.feasible).toBe(true);
    const ecu = screenRoutes('injection_moulding', { geo: geo('IM_ECU_Cover'), filename: 'IM_ECU_Cover.stp', family: 'plastic', annualVolume: 200_000 });
    expect(ecu.find(x => x.route === 'injection_moulding')!.checks.some(c => c.id === 'hollow_costed')).toBe(false);
  });
  it('the Alternatives column is the FIRST SET, not the programme total', () => {
    const row = (route: string, total: number, upFront: number, investment: number) => ({ route, process: null, label: route, commodity: route, status: 'ok', total,
      tooling: { investment, amortisedOver: 1_000_000, items: [], split: { upFront, replacement: investment - upFront, perishable: 0, running: investment - upFront } },
      band: null, byVolume: [], refusal: null, credible: true });
    const rc = { principle: 'p', ladder: [], crossovers: [], programme: { annualVolume: 200_000, years: 5, yearsAssumed: false },
      rows: [row('cast_and_machine', castRes.total, 25_891, 731_491), row('forging', castRes.total * 0.95, 43_146, 869_414)], excluded: [],
      current: 'cast_and_machine', currentLabel: 'Cast and machine', labels: { cast_and_machine: 'Cast and machine', forging: 'Forging' }, headline: castRes.total };
    const r = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: { ...meta, routeComparison: rc as never } });
    expect(r.routes!.rows[0]).toMatchObject({ toolingGbp: 43_146, toolingProgrammeGbp: 869_414 });
  });
});

describe('N5 — a blocking DFM finding is a page-1 alert', () => {
  it('the knuckle undercut is on page 1, and first among the findings', () => {
    const g = { grouped: [
      { ruleId: 'forging.draft.below-process-minimum', severity: 'risk', title: 'Draft below the forging minimum', count: 4, recommendation: 'Add draft.' },
      { ruleId: 'forging.undercut.not-releasable', severity: 'blocking', title: 'Undercut — cannot release from an impression die', count: 1, recommendation: 'Machine the feature after forging and add that operation to the costing.' },
    ], limitations: [] };
    const r = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'forging', region: 'UK', cadMeta: { ...meta, geometricDFM: g } });
    const a = r.alerts.find(x => x.kind === 'blocking')!;
    expect(a.title).toBe('This route as costed cannot be made as drawn: Undercut — cannot release from an impression die');
    expect(r.dfm.findings[0].severity).toBe('BLOCKING');
    expect(r.verdict).toMatch(/a DFM finding says the route as costed cannot be made/);
  });
});

describe('should-fix list', () => {
  it('unanswered questions say what the costing used', () => {
    expect(core.openQuestions).toContain('Is the part coated or surface-treated? — not answered — costed as a bare part (no coating or surface treatment in the price)');
    const al = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'aluminium_extrusion', region: 'UK',
      cadMeta: { checks: { decisions: [{ id: 'al.temper', question: 'Which temper?', severity: 'advisory', answer: null }], ruleValues: [rv('Temper', 'T6', 'T6: ageing 6 h a load', 'alx-temper')] } } });
    expect(al.openQuestions[0]).toBe('Which temper? — not answered — costed as T6: ageing 6 h a load');
  });

  it('operations print OEE and the crew CHARGED, and re-add', () => {
    for (const op of core.operations) {
      expect(op.cycleMin / 60 / op.partsPerCycle * op.ratePerHr).toBeCloseTo(op.gbp, 9);
      if (!op.bench) expect(op.oee).toBe(0.8);
    }
    const untended = { ...cast, operations: [{ ...cast.operations[1], operationName: 'In-line trim station', labourTimeHr: 0 }] } as UniversalStackInput;
    const r = buildCoreReport({ result: computeUniversalStack(untended, lib), input: untended, library: lib, commodity: 'blow_moulding', region: 'UK' });
    expect(r.operations[0]).toMatchObject({ crew: 0.5, crewCharged: 0, labourPerHr: 0 });
  });

  it('the confidence grade is graded on the distinct inputs it prints', () => {
    const d = core.confidence.distinct;
    expect(core.confidence.grade).toBe(gradeOfCounts(d.high, d.medium, d.low));
    expect(gradeOfCounts(0, 9, 1)).toBe('Medium');                                 // the hub flange: ½ × 9 / 10 = 0.45
    // ONE grade is printed (fresh numbers review, 4 Nov 2026): the screen's grade is never set beside it
    expect(core.confidence.gradeNote ?? '').not.toMatch(/costing screen grades/);
    void overallConfidence(castRes);
  });

  it('capacity warns past 5 machines and on a line over 100 % loaded, each machine on its own hours', () => {
    const rows = capacityImplied(cast, lib, 2_000_000);
    const w = capacityWarnings(rows, 2_000_000);
    expect(w.some(x => /× Horizontal machining centre.*dedicated line or transfer cell/.test(x))).toBe(true);
    // which minutes are sourced (Part1 review, Nov 2026): the cutting minutes are the catalogue's, handling and set-up are not
    expect(w[w.length - 1]).toMatch(/CUTTING minutes are from the tool makers' published cutting data.*handling, the set-up and the fixed positioning allowances are engineering-typical, not sourced — confirm with a supplier cycle sheet/);
    expect(w[w.length - 1]).not.toMatch(/machining minutes are engineering-typical and conservative/);
    expect(w.some(x => /Sand Casting Moulding Line loaded \d+ %.*one line cannot make the volume/.test(x))).toBe(true);
    for (const r of rows) expect(lib.machines.some(m => m.machineClass === r.machine && m.buildup?.annualAvailableHours === r.availableHours)).toBe(true);
  });

  it('top movers leave out a zero base and anything under 0.5 % of the price', () => {
    for (const s of core.sensitivity) {
      expect(s.base).not.toBe(0);
      expect(Math.max(Math.abs(s.minusGbp), Math.abs(s.plusGbp))).toBeGreaterThanOrEqual(0.005 * castRes.total - 1e-9);
    }
  });

  it('Not included: no leak test after "No", gauges on a machined route, no heat-treat line when it is costed, the forge gap stated', () => {
    expect(core.notIncluded.join(' | ')).not.toMatch(/Leak test/);
    expect(core.notIncluded.join(' | ')).toMatch(/Gauges and check fixtures/);             // a bench "gauge check" is not the gauges
    const normalised = { ...cast, operations: [...cast.operations, { ...cast.operations[3], operationName: 'Normalise (heat treatment)' }] } as UniversalStackInput;
    const c2 = buildCoreReport({ result: computeUniversalStack(normalised, lib), input: normalised, library: lib, commodity: 'casting', region: 'UK' });
    expect(c2.notIncluded).toContain('Heat treatment certificate');
    expect(c2.notIncluded.join(' | ')).not.toMatch(/Heat treatment, if|normalised — check/);
    expect(reportStandardFor('casting').notIncluded.some(i => /Rust/.test(i.text))).toBe(true);
    expect(reportStandardFor('gear').notIncluded.some(i => i.text === 'Rust preventive')).toBe(true);
    const f = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'forging', region: 'UK' });
    expect(f.notIncluded.join(' | ')).not.toMatch(/Billet shear/);
    // phase B (4 Nov 2026): the billet saw and the induction heater are costed — no longer a gap in the cost model
    expect(f.notModelled.join(' | ')).not.toMatch(/Billet shear|induction heater/);
  });

  it('the country table states its basis; DFM pending is one line', () => {
    expect(core.countries.basis).toMatch(/that country's OWN rate book/);
    const p = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: { ...meta, geometricDFMPending: true } });
    expect(p.dfm.notChecked).toMatch(/^DFM pending:/);
  });

  it('cast + machine prices the casting and the machining separately, adding to the headline', () => {
    const s = core.formMachine!;
    expect(s.form).toBe('Casting');
    expect(s.formGbp + s.machiningGbp).toBeCloseTo(castRes.total, 9);
    const mach = castRes.operationDetails.slice(1).reduce((a, o) => a + o.processCost + o.labourCost, 0) + 2.81 + (14_500 + 366) / 1_000_000;
    expect(s.machiningDirectGbp).toBeCloseTo(mach, 9);
    expect(s.machiningGbp).toBeCloseTo(mach * 1.12 * 1.08, 9);
    expect(s.formPerKg).toBeCloseTo(s.formGbp / 9.084, 9);
  });

  it('a one-line verdict opens page 1', () => {
    expect(core.verdict).toMatch(new RegExp(`^Should-cost £${castRes.total.toFixed(2)} a part, ${core.confidence.grade} confidence — \\d+ % of it rests on unsourced figures`));
    expect(core.verdict).toMatch(/Ask the supplier first for: cores/);
  });

  it('composites: the tool material and the cure system are key drivers; the autoclave alert is a page-1 route alert above 25,000 a year', () => {
    const names = reportStandardFor('composites').keyDrivers.map(d => d.name);
    expect(names).toEqual(expect.arrayContaining(['Cure system', 'Tool material and life']));
    const comp = { ...cast, operations: [{ ...cast.operations[1], operationName: 'Cure (Autoclave)', machineId: 'autoclave-1200mm' }] } as UniversalStackInput;
    const r = buildCoreReport({ result: computeUniversalStack(comp, lib), input: comp, library: lib, commodity: 'composites', region: 'UK',
      cadMeta: { checks: { decisions: [], ruleValues: [rv('Process', 'prepreg_layup', 'Carbon prepreg, autoclave — the aerospace route', 'comp-process'),
        rv('Tool Life', '500', 'CFRP-epoxy layup tool, 500 cycles (engineering-typical)', 'comp-tool-life')] } } });
    expect(r.alerts.find(a => a.kind === 'route')!.title).toMatch(/prepreg cured in an autoclave/);
    expect(r.keyParams.find(k => k.name === 'Tool material and life')!.display).toBe('500 — CFRP-epoxy layup tool, 500 cycles');
  });
});

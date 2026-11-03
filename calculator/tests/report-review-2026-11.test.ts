/**
 * Independent review of the exported should-cost reports (200k / yr, 5 years, ex-works; UK and China), Nov 2026:
 * workbook column alignment, ex-works wording, a direct-cost (itemised) material's mass and BOM, trace field labels,
 * sensitivity bases, §14 truncation, band rounding and sub-0.01-minute operations.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { printPDF, type CADReportMeta } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import { traceFieldLabel } from '../src/ui/cad-workspace.js';
import { shortOperationName } from '../src/engine/operation-names.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { pdfText } from './casting-360-review.test.js';

const lib = DEFAULT_RATE_LIBRARY;
const FX_CN = 8.88;

/** A machined part with a learning curve, ex-works, a die change of 0.0018 min a part, a bench op. */
function machinedPart(terms: 'EXW' | 'DAP' = 'EXW') {
  const input: UniversalStackInput = {
    partName: 'Hub flange',
    annualVolume: 200_000,
    programmeYears: 5,
    learningCurve: { enabled: true, curvePct: 90, referenceVolume: 10_000 },
    rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 2.9, materialUtilization: 0.68 },
    operations: [
      { operationName: 'CNC Machining — 7 features (6×Ø14.0×18, 1×Ø60.0×50) [geometry-measured]', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.0585, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.0585, labourEfficiency: 0.92 },
      { operationName: 'Die change (amortised over the batch)', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.00003, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.00003, labourEfficiency: 1 },
      { operationName: 'Fettling (deburr)', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.01, labourEfficiency: 0.92, benchOperation: true },
    ],
    tooling: { totalToolingCost: 50_000, amortizationVolume: 1_000_000, mode: 'amortized' },
    packagingPerPart: 0.17, logisticsPerPart: terms === 'EXW' ? 0 : 0.4, overheadPct: 0.12, marginPct: 0.08,
    deliveryTerms: terms,
  } as UniversalStackInput;
  return { input, result: computeUniversalStack(input, lib) };
}

/** Composites: fibre + resin priced as itemised lines, the placeholder material, no costed kg of its own. The lines add
 *  to £12.64601 against a £12.6453 bucket — at ¥8.88 that is ¥112.30 against ¥112.29 (the CN hat stiffener). */
function compositePart() {
  const input: UniversalStackInput = {
    partName: 'Hat stiffener',
    annualVolume: 200_000, programmeYears: 5,
    rawMaterial: {
      materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 0.85, directCost: 12.6453,
      lines: [
        { ref: 'Prepreg', description: 'Prepreg (fibre + resin)', qty: 0.371099, unitCost: 33.6, pkg: 'kg bought', note: '0.3028 kg net' },
        { ref: 'NDI', description: 'Non-destructive inspection (C-scan / UT) per part', qty: 1.041667, unitCost: 0.17, note: 'per part × reject uplift' },
      ],
    },
    operations: [
      { operationName: 'Cure (Autoclave)', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.15625, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.039, labourEfficiency: 0.92 },
    ],
    tooling: { totalToolingCost: 8_658_000, amortizationVolume: 1_000_000, mode: 'amortized' },
    packagingPerPart: 0.17, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, deliveryTerms: 'EXW',
  } as UniversalStackInput;
  const cadMeta: CADReportMeta = {
    geometrySource: 'occt', measuredVolumeCm3: 195.4, measuredWeightKg: 0.195, annualVolume: 200_000,
    checks: {
      costable: true, geometryQuality: 'occt', sanity: [], decisions: [], overrides: [],
      ruleValues: [{ label: 'Part Weight (kg)', value: '0.3028', ruleValue: '0.3028', basis: 'Carbon prepreg at 1550 kg/m³ cured — 195 cm³ measured', source: 'geometry', edited: false }],
    },
    routeComparison: {
      principle: 'Feasible routes only.', programme: { annualVolume: 200_000, years: 5, yearsAssumed: false },
      rows: [{
        route: 'composites', process: null, label: 'Composites', commodity: 'composites', status: 'ok', total: 33.97, toolingPerPart: 8.66,
        breakdown: null, reconciles: true, audit: null, spec: [], tooling: null, operations: [{ name: 'Die change and press set-up (per run)', machine: 'press', bench: false, cycleMin: 0.0018, processCost: 0.0102, labourCost: 0.0032 }],
        material: { materialId: 'mat-virtual', label: 'Virtual / Pass-through', netKg: 0, boughtKg: 0, utilisation: 0.85 },
        band: null, checks: [], caveats: [], assumed: [], openQuestions: [], notes: [], refusal: null, byVolume: [], programme: null,
      }],
      excluded: [], ladder: [], crossovers: [], current: 'composites', currentLabel: 'Composites', labels: { composites: 'Composites' }, headline: 33.97,
    } as never,
  };
  return { input, result: computeUniversalStack(input, lib), cadMeta };
}

async function sheets(blob: Blob): Promise<Record<string, unknown[][]>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '' })]));
}

const flat = (t: string) => t.replace(/\s+/g, ' ');

describe('1 — Excel 3-Operations: the TOTAL and learning-curve rows sit under their headers', () => {
  it('labour total under "Labour Cost", process under "Process Cost", op total under "Op Total"', async () => {
    const { input, result } = machinedPart();
    expect(result.learningCurveApplied).toBeTruthy();
    const ops = (await sheets(await exportToExcelBlob(result, input, lib)))['3-Operations'];
    const hdrAt = ops.findIndex(r => r[0] === 'Operation');
    const hdr = ops[hdrAt] as string[];
    const col = (h: string) => hdr.indexOf(h);
    const total = ops.find(r => r[0] === 'TOTAL')!;
    expect(total[col('Process Cost')]).toBeCloseTo(result.breakdown.process, 6);
    expect(total[col('Labour Cost')]).toBeCloseTo(result.breakdown.labour, 6);
    expect(total[col('Op Total')]).toBeCloseTo(result.breakdown.process + result.breakdown.labour, 6);
    expect(total[col('Labour Efficiency')]).toBe('');
    const lcRow = ops.find(r => /^Learning-curve adjustment/.test(String(r[0])))!;
    const opsLabour = result.operationDetails.reduce((s, o) => s + o.labourCost, 0);
    expect(lcRow[col('Labour Cost')]).toBeCloseTo(result.breakdown.labour - opsLabour, 6);
    expect(lcRow[col('Op Total')]).toBeCloseTo(result.breakdown.labour - opsLabour, 6);
    expect(lcRow[col('Labour Efficiency')]).toBe('');
  });
});

describe('2 — ex-works reports say freight is not included; delivered keeps the allowance', () => {
  it('EXW: §7 and §9 never describe a delivery allowance', () => {
    const { input, result } = machinedPart('EXW');
    const t = flat(pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [])));
    expect(t).not.toMatch(/delivery allowance/);
    expect(t).toMatch(/ex-works \(EXW\): packaging is in, logistics \(bucket 6\) is 0/);
    expect(t).toMatch(/ex-works: freight not included, import duty out/);
    expect(t).toMatch(/Each row is ex-works \(EXW\)/);
  });
  it('DAP: the delivery-allowance text stays', () => {
    const { input, result } = machinedPart('DAP');
    const t = flat(pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [])));
    expect(t).toMatch(/supplier delivery allowance in, import duty out/);
    expect(t).toMatch(/packaging and delivery allowance \(bucket 6\)/);
  });
});

describe('3 / 4 — a material priced by its itemised lines (composites)', () => {
  const { input, result, cadMeta } = compositePart();
  const t = flat(pdfText(() => printPDF(result, input, lib, 'CNY', FX_CN, 'composites', null, 'CN', [], cadMeta)));

  it('PDF prints the rules\' part weight — never 0.000 kg, a density-1 mass, mat-virtual or "Virtual / Pass-through"', () => {
    expect(t).not.toMatch(/0\.000 kg/);
    expect(t).not.toMatch(/0\.0000 kg/);
    expect(t).not.toMatch(/0\.195 kg/);
    expect(t).not.toMatch(/mat-virtual/);
    expect(t).not.toMatch(/Virtual \/ Pass-through/);
    expect(t).toMatch(/Costed part weight: 0\.303 kg/);
    expect(t).toMatch(/0\.3028 kg/);   // §3 costed part weight
    expect(t).toMatch(/priced by its itemised lines/);
  });

  it('§3B is not a piece count and its total is the bucket', () => {
    expect(t).not.toMatch(/pieces\)/);
    expect(t).toMatch(/3B Itemised material \(2 lines\)/);
    expect(t).toMatch(/0\.3711 kg bought/);
    const bucket = `¥${(result.breakdown.rawMaterial * FX_CN).toFixed(2)}`;   // ¥112.29
    expect(bucket).toBe('¥112.29');
    // the TOTAL row prints the bucket, not the ¥112.30 the rounded line quantities add to
    expect(t).not.toMatch(/¥112\.30/);
    expect(t).toMatch(/TOTAL ¥112\.29/);
  });

  it('a PCB BOM keeps its piece count', () => {
    const pcb = { ...input, rawMaterial: { ...input.rawMaterial, lines: [
      { ref: 'U1', description: 'MCU', qty: 1, unitCost: 2.1, pkg: 'QFN-48' }, { ref: 'C1', description: 'MLCC', qty: 12, unitCost: 0.002, pkg: '0402' }] } };
    const pt = flat(pdfText(() => printPDF(computeUniversalStack(pcb, lib), pcb, lib, 'GBP', 1, 'pcb_fab', null, 'UK', [])));
    expect(pt).toMatch(/Bill of Materials \(2 lines · 13 pieces\)/);
  });

  it('Excel: the material basis names the itemised lines, the part weight is printed, mat-virtual never is', async () => {
    const wb = await sheets(await exportToExcelBlob(result, input, lib, 'CNY', FX_CN, cadMeta.checks!, null, null, cadMeta.routeComparison!));
    const mat = wb['2-Material'];
    expect(mat.find(r => r[0] === 'Material basis')?.[1]).toMatch(/itemised lines below/);
    expect(mat.find(r => r[0] === 'Costed part weight')?.[1]).toBe(0.3028);
    const all = JSON.stringify(wb);
    expect(all).not.toMatch(/mat-virtual/);
    expect(all).not.toMatch(/Virtual \/ Pass-through/);
    expect(all).not.toMatch(/Supplied \/ bought-in price/);
  });
});

describe('5 — trace field labels read as a person reads them', () => {
  it('names the material line\'s own keys', () => {
    const L = (f: string) => traceFieldLabel(shortOperationName(f));
    expect(L('material.pricePerKg')).toBe('Material price per kg');
    expect(L('material.scrapRecoveryPricePerKg')).toBe('Scrap recovery price per kg');
    expect(L('rawMaterial.energyKwh.electricity')).toBe('Process energy — electricity');
    expect(L('rawMaterial.energyKwh.gas')).toBe('Process energy — gas');
    expect(L('rawMaterial.consumablesCostPerPart')).toBe('Consumables per part');
    expect(L('rawMaterial.directCost')).toBe('Direct material cost');
    expect(L('Turning.machineRatePerHr')).toBe('Turning: machine rate');
    expect(L('Forging.partWeightKg')).toBe('Forging: part weight');
  });
  it('the reports print them (PDF §6, Excel 6-Traceability)', async () => {
    const { input, result } = machinedPart();
    const t = flat(pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [])));
    expect(t).toMatch(/Material price per kg/);
    expect(t).not.toMatch(/material: price per/);
    const tr = (await sheets(await exportToExcelBlob(result, input, lib)))['6-Traceability'];
    expect(tr.some(r => r[0] === 'Scrap recovery price per kg')).toBe(true);
  });
});

describe('6 — numbers with their units and enough digits', () => {
  const { input, result } = machinedPart();
  const t = flat(pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [])));
  it('sensitivity bases carry a spaced unit ("1000000parts", "0.01hr" before)', () => {
    // a tool large enough that the amortisation volume is a top-8 driver
    const big = { ...input, tooling: { ...input.tooling, totalToolingCost: 5_000_000 } };
    const bt = flat(pdfText(() => printPDF(computeUniversalStack(big, lib), big, lib, 'GBP', 1, 'machining', null, 'UK', [])));
    const sens = bt.slice(bt.indexOf('Sensitivity Analysis'), bt.indexOf('Regional Cost Comparison'));
    expect(sens).toMatch(/Amortisation Volume 1,000,000 parts/);
    expect(sens).toMatch(/Cycle Time 3\.51 min/);
    expect(sens).not.toMatch(/\d(hr|parts)\b/);
  });
  it('a bench operation\'s cycle-time driver prints its labour time, not "0hr"', async () => {
    const { sensitivityBaseText } = await import('../src/export/pdf.js');
    const money = (n: number) => `£${n.toFixed(2)}`;
    expect(sensitivityBaseText({ baseValue: 0, unit: 'hr', parameter: 'operations[2].cycleTimeHr' }, input, money)).toBe('0.60 min (labour)');
    expect(sensitivityBaseText({ baseValue: 0.00003, unit: 'hr', parameter: 'operations[1].cycleTimeHr' }, input, money)).toBe('0.0018 min');
    expect(sensitivityBaseText({ baseValue: 1_000_000, unit: 'parts', parameter: 'tooling.amortizationVolume' }, input, money)).toBe('1,000,000 parts');
    expect(sensitivityBaseText({ baseValue: 1.15, unit: '£/kg', parameter: 'x' }, input, money)).toBe('£1.15/kg');
  });
  it('a non-zero cycle never prints 0.00 min', () => {
    expect(t).toMatch(/0\.0018/);
  });
  it('Excel band P10 / P90 are held to the report currency\'s penny; die-change minutes keep their digits', async () => {
    const wb = await sheets(await exportToExcelBlob(result, input, lib, 'CNY', FX_CN, null, { plusMinusPct: 12.8, p10: 5.59, p90: 7.22 }));
    const sum = wb['1-Summary'];
    expect(sum.find(r => r[0] === '  P10 (optimistic)')?.[1]).toBe(49.64);
    expect(sum.find(r => r[0] === '  P90 (conservative)')?.[1]).toBe(64.11);
    const ops = wb['3-Operations'];
    const hdr = ops.find(r => r[0] === 'Operation') as string[];
    const die = ops.find(r => /^Die change/.test(String(r[0])))!;
    expect(die[hdr.indexOf('Cycle Time (min)')]).toBe(0.0018);
  });
  it('§14 cuts a long rate note at a word, with an ellipsis', async () => {
    const { clipAtWord } = await import('../src/export/pdf.js');
    const note = 'Held capital: depreciation of the UK build-up over 1,773.4 productive hours a year at the book rate, per running hour ÷ 1773.4 productive hours';
    const out = clipAtWord(note, 120);
    expect(out.endsWith('…')).toBe(true);
    expect(note.startsWith(out.slice(0, -1))).toBe(true);
    expect(note[out.length - 1]).toBe(' ');   // the cut is at a word boundary
  });
});

describe('H2 / H3 — §4C prices features as §4A does, and a turned boss is in the turning operation', () => {
  const { input, result } = machinedPart();
  const featureLines = [
    { kind: 'hole', diaMm: 14, depthMm: 18, through: true, count: 6, operation: 'Drill', minutesEach: 0.585, totalMinutes: 3.51, volumeCm3: 17, included: true, autoIncluded: true },
    { kind: 'boss', diaMm: 80, depthMm: 140, through: null, count: 2, operation: 'Turning', minutesEach: 1, totalMinutes: 2, volumeCm3: 0, included: false, autoIncluded: false },
  ] as never;
  const base: CADReportMeta = { geometrySource: 'occt', featureLines, featureLinesInCost: true, featureMachineRatePerHr: 6.64, featureMachineOee: 0.8, annualVolume: 200_000 };
  const section = (meta: CADReportMeta) => {
    const all = flat(pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'machining', null, 'UK', [], meta)));
    return all.slice(all.indexOf('4C '), all.indexOf('§5'));
  };

  it('H2: the Machine column is minutes ÷ 60 × rate ÷ OEE (3.51 min at £6.64/h ÷ 0.8 = £0.49)', () => {
    const t = section(base);
    expect(t).toMatch(/Drill 3\.51 £0\.49 Yes/);
    expect(t).toMatch(/TOTAL costed 6 3\.51 £0\.49/);
    expect(t).toMatch(/minutes × the machine rate ÷ OEE \(£6\.64\/h ÷ 0\.8\)/);
    expect(t).not.toMatch(/£0\.39/);   // the rate without the OEE
  });
  it('H2: without a turning operation the boss is NOT costed, and its "could add up to" carries the OEE (2 min → £0.28)', () => {
    const t = section(base);
    expect(t).toMatch(/2 detected feature\(s\) NOT costed/);
    expect(t).toMatch(/could add up to £0\.28/);
  });
  it('H3: with the costing\'s turning operation the boss is "In turning", not counted as uncosted', () => {
    const t = section({ ...base, featureTurningOp: 'Turning — outside and faces on the CNC lathe' });
    expect(t).toMatch(/In turning/);
    expect(t).toMatch(/in Turning — outside and faces on the CNC lathe|in Turning .{0,3}outside and faces/);
    expect(t).not.toMatch(/NOT costed/);
    expect(t).not.toMatch(/could add up to/);
    expect(t).toMatch(/TOTAL costed 6 3\.51 £0\.49/);
  });
});

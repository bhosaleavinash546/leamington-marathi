/**
 * PKG-6 (CF-17, CF-18): the cost bridge and the material balance — report views over the costing, no new arithmetic.
 *
 *   - the bridge re-adds to the headline (to the penny, in fact to 1e-6 £) and, bucket by bucket, to the eight buckets,
 *     on EVERY real part of the baseline replayed through the product's own chain (`costMeasuredPart`), and on form
 *     costings with no CAD (casting, forging, machining, a learning curve, bought-in content, one-off tooling);
 *   - building the reports changes no total and mutates neither the stack input nor the result;
 *   - a casting or forging prints its material balance, which closes, and states its machining stock — "as cast X kg =
 *     finished Y kg + machining stock Z kg" — with the face and turning stock named; "no extra material" is gone;
 *   - the core PDF, the audit pack and the workbook print the same bridge rows and amounts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { computeForgingDrivers, type ForgingInputs } from '../src/engine/modules/forging.js';
import { buildCostBridge, bridgePrintRows, type CostBridge } from '../src/export/cost-bridge.js';
import { buildMaterialBalance, nearNetStockText, stockPartsFromBasis } from '../src/export/material-balance.js';
import { buildCoreReport } from '../src/export/executive-summary.js';
import { printPDF, printAuditPackPDF } from '../src/export/pdf.js';
import { exportToExcelBlob, COST_BRIDGE_HEAD, MATERIAL_BALANCE_HEAD } from '../src/export/excel.js';
import { costBridgeHtml } from '../src/ui/cad-workspace.js';
import type { PartBaseline } from '../scripts/real-parts-baseline.js';
import type { UniversalStackInput, PartCostResult, RateLibrary } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';

const ROOT = join(import.meta.dirname, '..');
const baseline = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/real-parts-baseline.json'), 'utf8')) as PartBaseline[];
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const p2 = (n: number) => Math.round(n * 100) / 100;

interface Replayed {
  part: string; commodity: string; total: number; input: UniversalStackInput; result: PartCostResult;
  ruleValues: Array<{ label: string; value: unknown; fieldId: string; basis: string }>; measuredWeightKg: number | null;
}
const replayed: Replayed[] = [];

/** Every bridge check, on any costing. */
function expectCloses(b: CostBridge, result: PartCostResult, what: string): void {
  expect(b.reconciles, `${what}: bridge does not close`).toBe(true);
  expect(Math.abs(b.reAddGbp - result.total), `${what}: re-add v headline`).toBeLessThan(1e-6);
  expect(Math.round(b.reAddGbp * 100), `${what}: to the penny`).toBe(Math.round(result.total * 100));
  for (const k of b.bucketCheck) expect(Math.abs(k.bridgeGbp - k.engineGbp), `${what}: bucket ${k.bucket}`).toBeLessThan(1e-6);
  expect(b.rows.at(-1)!.cumulativeGbp).toBe(result.total);
  for (const r of b.rows) expect(Math.abs(r.gbp - r.items.reduce((s, i) => s + i.gbp, 0))).toBeLessThan(1e-12);
}

beforeAll(async () => {
  for (const b of baseline) {
    const r = await costMeasuredPart(b.geometry, b.part,
      { partNumber: b.part, file: b.part, annualVolume: 50_000, ...(b.commodity ? { commodity: b.commodity } : {}) } as never,
      b.answers, 'UK', { annualVolume: 50_000 } as never, book, { partNumber: b.part, file: b.part, status: 'error' } as never);
    const si = r.trace?.stackInput, res = r.trace?.result;
    if (!si || !res) continue;
    const mat = book.materials.find(m => m.id === si.rawMaterial.materialId);
    const vol = (b.geometry as { volume?: { cm3?: number } }).volume?.cm3;
    replayed.push({
      part: b.part, commodity: r.commodity!, total: r.total!, input: si, result: res,
      ruleValues: Object.entries(r.provenance ?? {}).map(([fieldId, v]) => ({ label: fieldId, value: v.value, fieldId, basis: v.basis })),
      measuredWeightKg: vol && mat && !/^mat-virtual/.test(mat.id) ? Math.round(vol / 1e6 * mat.densityKgPerM3 * 1000) / 1000 : null,
    });
  }
}, 600_000);

const part = (name: string) => replayed.find(r => r.part === name)!;

describe('the bridge re-adds to the headline on every real part (replay through costMeasuredPart)', () => {
  it('covers the costed parts of the baseline', () => {
    expect(replayed.length).toBe(baseline.filter(b => b.outcome.status === 'costed').length);
    expect(replayed.length).toBeGreaterThanOrEqual(35);
  });

  it('every part: Σ rows = headline (1e-6 £), each bucket closes, the running total ends at the headline', () => {
    for (const r of replayed) expectCloses(buildCostBridge({ result: r.result, input: r.input, library: book, commodity: r.commodity }), r.result, r.part);
  });

  it('no total changed: the reports re-cost nothing and mutate nothing — the headline is the engine\'s on the costing\'s own input', () => {
    for (const r of replayed) {
      expect(p2(r.total), r.part).toBe(p2(computeUniversalStack(r.input, book).total));
      const before = JSON.stringify([r.input, r.result]);
      const core = buildCoreReport({ result: r.result, input: r.input, library: book, commodity: r.commodity as never, region: 'UK',
        cadMeta: { checks: { decisions: [], ruleValues: r.ruleValues as never }, measuredWeightKg: r.measuredWeightKg } });
      expect(core.total).toBe(r.result.total);
      expect(core.bridge.totalGbp).toBe(r.result.total);
      expect(JSON.stringify([r.input, r.result]), `${r.part} mutated`).toBe(before);
    }
  });

  it('the material bucket is split into what it pays for (CF-17): metal, energy, secondary, inspection, tool wear', () => {
    const knuckle = part('steering_knuckle_RH.stp');
    const b = buildCostBridge({ result: knuckle.result, input: knuckle.input, library: book, commodity: knuckle.commodity });
    const keys = b.rows.map(r => r.key);
    expect(keys).toEqual(['metal', 'credit', 'energy', 'primary', 'secondary', 'inspection', 'machining', 'toolWear', 'tooling', 'packaging', 'logistics', 'overhead', 'margin']);
    const mat = b.bucketCheck.find(x => x.bucket === 'rawMaterial')!;
    const inMaterial = (k: string) => b.rows.filter(r => r.key === k).reduce((s, r) => s + r.items.reduce((t, i) => t + (i.byBucket.rawMaterial ?? 0), 0), 0);
    const metalNet = inMaterial('metal') + inMaterial('credit');
    // the bucket is not all metal: metal + energy + secondary + inspection + tool wear re-add to it, each its own line
    expect(Math.abs(metalNet + inMaterial('energy') + inMaterial('secondary') + inMaterial('inspection') + inMaterial('toolWear') + inMaterial('primary') - mat.engineGbp)).toBeLessThan(1e-9);
    for (const k of ['energy', 'secondary', 'inspection', 'toolWear']) expect(inMaterial(k), k).toBeGreaterThan(0);
    expect(metalNet).toBeLessThan(mat.engineGbp);
    expect(b.rows.find(r => r.key === 'inspection')!.items.map(i => i.label)).toEqual(['NDT']);
    expect(b.rows.find(r => r.key === 'secondary')!.items.map(i => i.label)).toEqual(['Descale']);
    expect(b.rows.find(r => r.key === 'toolWear')!.inBuckets).toBe('material');
    expect(b.rows.find(r => r.key === 'machining')!.inBuckets).toBe('process + labour');
    // the forging operations, the machining operations: every operation once
    const ops = b.rows.flatMap(r => r.items).filter(i => i.byBucket.process !== undefined || i.byBucket.labour !== undefined);
    expect(ops.length).toBe(knuckle.result.operationDetails.length);
  });
});

describe('the bridge re-adds on form costings (no CAD)', () => {
  const stackOf = (d: { rawMaterial: UniversalStackInput['rawMaterial']; operations: UniversalStackInput['operations']; tooling: UniversalStackInput['tooling'] }, extra: Partial<UniversalStackInput> = {}): UniversalStackInput =>
    ({ partName: 'form part', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling, packagingPerPart: 0.15, logisticsPerPart: 0.25,
      overheadPct: 0.12, marginPct: 0.08, ...extra }) as UniversalStackInput;
  const check = (input: UniversalStackInput, commodity: string, lib: RateLibrary = book) => {
    const result = computeUniversalStack(input, lib);
    const b = buildCostBridge({ result, input, library: lib, commodity });
    expectCloses(b, result, commodity);
    return { b, result };
  };

  it('a sand casting from the casting form', () => {
    const SAND: CastingInputs = {
      subtype: 'sand', materialId: 'mat-gs-c25', partWeightKg: 3, castingYield: 0.5, rejectRate: 0.03,
      labourId: 'lab-uk-foundry', oee: 0.8, manning: 4, labourEfficiency: 0.92, amortizationVolume: 250_000,
      sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.01, patternCost: 8_000, patternLife: 32_000, coreCostPerPart: 0.4 },
      fettlingMinutes: 6, heatTreatCostPerKg: 0.35,
    } as CastingInputs;
    const { b, result } = check(stackOf(computeCastingDrivers(SAND)), 'casting');
    expect(b.form).toBe('cast');
    expect(b.rows[0].key).toBe('metal');
    // no CAD, no rule values: the balance holds what the stack holds and says what it does not
    const bal = buildMaterialBalance({ input: stackOf(computeCastingDrivers(SAND)), result, commodity: 'casting', ruleValues: null });
    expect(bal).not.toBeNull();
    expect(bal!.stock).toBeNull();
    expect(bal!.notItemised.join(' ')).toMatch(/as-cast weight/);
  });

  it('a closed-die forging from the forging form', () => {
    const F: ForgingInputs = {
      materialId: 'mat-steel-38mnvs6', partWeightKg: 2.5, flashAndScaleKg: 0.25, yieldFraction: 0.74, forgeId: 'forge-press-1600t',
      labourId: 'lab-uk-forge', strokesToForm: 2, cycleTimeHr: 0.003, oee: 0.8, manning: 2, labourEfficiency: 0.92,
      heatingEnergyKwhPerKg: 0.4, dieLife: 40_000, dieCost: 25_000, rejectRate: 0.02, amortizationVolume: 100_000,
      descaleCostPerKg: 0.12, ndtCostPerPart: 0.6, trimmingMachineId: 'press-100t', trimmingCycleHr: 0.003,
    } as ForgingInputs;
    const input = stackOf(computeForgingDrivers(F as never));
    const { b, result } = check(input, 'forging');
    expect(b.form).toBe('forged');
    expect(b.rows.map(r => r.key)).toEqual(expect.arrayContaining(['metal', 'credit', 'energy', 'primary', 'secondary', 'inspection', 'tooling', 'overhead', 'margin']));
    // the form's own fields as rule values: the balance closes on them
    const rv = (fieldId: string, value: number) => ({ label: fieldId, value: String(value), fieldId });
    const bal = buildMaterialBalance({ input, result, commodity: 'forging',
      ruleValues: [rv('forge-part-wt', 2.5), rv('forge-flash', 0.25), rv('forge-yield', 0.74), rv('forge-reject', 0.02)], measuredWeightKg: 2.1 })!;
    expect(bal.closes).toBe(true);
    expect(bal.stock!.text).toBe('As forged 2.500 kg = finished 2.100 kg + machining stock 0.400 kg');
    expect(bal.summary.creditedKg * bal.scrapPricePerKg).toBeCloseTo(-b.rows.find(r => r.key === 'credit')!.gbp, 10);
  });

  it('the hand-calculated machined bracket (reference part), a learning curve, bought-in content, one-off tooling, unitemised consumables', () => {
    const ref = {
      partName: 'ref', annualVolume: 50_000,
      rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
      operations: [
        { operationName: 'CNC Turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled', cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 },
        { operationName: 'CNC Milling', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.92 },
      ],
      tooling: { totalToolingCost: 15_000, amortizationVolume: 50_000, mode: 'amortized' },
      packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
    } as UniversalStackInput;
    const { b } = check(ref, 'machining');
    expect(b.rows.map(r => r.key)).toEqual(['metal', 'credit', 'machining', 'tooling', 'packaging', 'logistics', 'overhead', 'margin']);
    check({ ...ref, learningCurve: { enabled: true, referenceVolume: 5_000, curvePct: 0.9 } } as UniversalStackInput, 'machining');
    const lc = check({ ...ref, learningCurve: { enabled: true, referenceVolume: 5_000, curvePct: 0.9 } } as UniversalStackInput, 'machining').b;
    expect(lc.rows.some(r => r.key === 'learning')).toBe(true);
    check({ ...ref, rawMaterial: { ...ref.rawMaterial, boughtIn: { cost: 4.2, handlingPct: 0.05 }, consumablesCostPerPart: 0.3 } }, 'machining');
    check({ ...ref, tooling: { totalToolingCost: 15_000, amortizationVolume: 50_000, mode: 'one_time_nre' } } as UniversalStackInput, 'machining');
    check({ ...ref, rawMaterial: { ...ref.rawMaterial, lossIsNotScrap: true } }, 'machining');
    check({ ...ref, rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0, materialUtilization: 1, directCost: 3.1 } } as UniversalStackInput, 'composites');
  });
});

describe('the material balance (casting / forging) and the stock statement (CF-18)', () => {
  const balanceOf = (name: string) => {
    const r = part(name);
    return buildMaterialBalance({ input: r.input, result: r.result, commodity: r.commodity, ruleValues: r.ruleValues, measuredWeightKg: r.measuredWeightKg })!;
  };

  it('closes on every cast and forged part, and its credit is the bridge\'s scrap / return credit', () => {
    const castForge = replayed.filter(r => /cast|forg/.test(r.commodity));
    expect(castForge.length).toBeGreaterThanOrEqual(5);
    for (const r of castForge) {
      const bal = buildMaterialBalance({ input: r.input, result: r.result, commodity: r.commodity, ruleValues: r.ruleValues, measuredWeightKg: r.measuredWeightKg })!;
      expect(bal.closes, r.part).toBe(true);
      expect(Math.abs(bal.closureKg!), r.part).toBeLessThan(0.001);
      const b = buildCostBridge({ result: r.result, input: r.input, library: book, commodity: r.commodity });
      const credit = b.rows.find(x => x.key === 'credit')?.gbp ?? 0;
      expect(Math.abs(bal.creditGbp + credit), r.part).toBeLessThan(1e-9);
      // the stock is the as-formed weight less the finished, as the weights say — its value is not changed
      expect(bal.stock, r.part).not.toBeNull();
      expect(bal.stock!.stockKg).toBeCloseTo(bal.stock!.formedKg - bal.stock!.finishedKg, 12);
      expect(bal.stock!.text).toMatch(/^As (cast|forged) \d+\.\d{3} kg = finished \d+\.\d{3} kg \+ machining stock \d+\.\d{3} kg$/);
    }
  });

  it('the casting bracket: as cast 3.039 kg = finished 2.512 kg + machining stock 0.527 kg; gating remelted, melt loss not credited', () => {
    const bal = balanceOf('Casting_Braket.stp');
    expect(bal.stock!.text).toBe('As cast 3.039 kg = finished 2.512 kg + machining stock 0.527 kg');
    expect(bal.stock!.partsNote).toMatch(/Face machining stock 54\.5 cm³ .*3 mm a side, assumed — engineering-typical, not sourced/);
    expect(bal.lines.find(l => l.label === 'Gating, feeders and rejected castings')!.recovery).toBe('remelted');
    expect(bal.lines.find(l => l.label === 'Melt loss and dross')!.recovery).toBe('not recoverable');
    expect(bal.lines.find(l => l.label === 'Removed by machining (swarf)')!.kg).toBeCloseTo(0.527, 9);
  });

  it('the forgings name the face stock (IS 3469) and the turning stock (2 mm, engineering-typical) apart; scale is "not itemised"', () => {
    const knuckle = balanceOf('steering_knuckle_RH.stp');
    const face = knuckle.stock!.parts.find(p => p.label === 'Face machining stock')!;
    const turn = knuckle.stock!.parts.find(p => /^Turning stock/.test(p.label))!;
    expect(face.mmASide).toBe(2.5);
    expect(face.source).toMatch(/IS 3469 \(Part I\):1974 Table 1\.5/);
    expect(turn.mmASide).toBe(2);
    expect(turn.source).toMatch(/engineering-typical, not sourced .*not the face stock's IS 3469 figure/);
    expect(knuckle.lines.find(l => l.label === 'Scale, crop ends and pierce wad')!.note).toMatch(/not itemised by this costing/);
    expect(knuckle.notItemised.join(' ')).toMatch(/inside the stock-yield ratio/);
    // the parts re-add to the stock within the rule's 3-dp rounding
    const sum = knuckle.stock!.parts.reduce((s, p) => s + (p.kg ?? 0), 0);
    expect(Math.abs(sum - knuckle.stock!.stockKg)).toBeLessThan(0.002);
    expect(stockPartsFromBasis(undefined, 'forged', 0.00785)).toEqual([]);
  });

  it('"near-net (no extra material)" is gone from the screen; the readout states the stock', () => {
    const main = readFileSync(join(ROOT, 'src/ui/main.ts'), 'utf8');
    expect(main).not.toMatch(/no extra material/);
    expect(nearNetStockText('cast', 3.039, 2.512)).toBe(' · near-net: as cast 3.039 kg = finished 2.512 kg + machining stock 0.527 kg (poured / forged, then machined off)');
    expect(nearNetStockText('forged', 3.848, null)).toMatch(/machining stock is in the as-forged weight costed/);
  });
});

/** The pages a print function saves, as their content streams (core-report.test.ts). */
function pagesOf(draw: () => void): string[] {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const origSave = api.save;
  const pages: string[] = [];
  api.save = function (this: jsPDF) {
    const d = this as unknown as { internal: { pages: string[][] } };
    for (const p of d.internal.pages.slice(1)) pages.push((p ?? []).join('\n').replace(/\\([()\\])/g, '$1').replace(/\u0097/g, '—').replace(/\u0096/g, '–'));
    return this;
  };
  try { draw(); } finally { api.save = origSave; }
  return pages;
}

describe('the PDFs, the workbook and the cost card print the same bridge', () => {
  for (const name of ['Casting_Braket.stp', 'FORGE_Hub_Flange.stp']) {
    it(`${name}: core PDF section 2, audit pack §3C/§3D, workbook 0-Executive and 2-Material, the card`, async () => {
      const r = part(name);
      const checks = { costable: true, sanity: [], overrides: [], decisions: [],
        ruleValues: r.ruleValues.map(v => ({ ...v, value: String(v.value), ruleValue: String(v.value), source: 'rule', edited: false })) };
      const meta = { checks, measuredWeightKg: r.measuredWeightKg } as never;
      const core = buildCoreReport({ result: r.result, input: r.input, library: book, commodity: r.commodity as never, region: 'UK', cadMeta: meta });
      const two = (g: number) => `£${g.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const rows = bridgePrintRows(core.bridge, two, 4, null);

      const corePages = pagesOf(() => printPDF(r.result, r.input, book, 'GBP', 1, r.commodity as never, null, 'UK', [], meta));
      const coreText = corePages.join('\n');
      expect(corePages.length).toBeLessThanOrEqual(8);
      expect(coreText).toContain('Cost bridge ');
      for (const row of rows) {
        expect(coreText, row.label).toContain(row.label.split(/[ —(]+/).slice(0, 2).join(' '));   // a long label wraps in its cell
        expect(coreText, `${row.label} amount`).toContain(two(row.gbp));
      }
      expect(coreText).toContain('Material balance ');
      expect(coreText).toContain(core.balance!.stock!.text);

      const auditText = pagesOf(() => printAuditPackPDF(r.result, r.input, book, 'GBP', 1, r.commodity as never, null, 'UK', [], meta)).join('\n');
      expect(auditText).toContain('3C  Cost bridge');
      expect(auditText).toContain('3D  Material balance');
      const four = (g: number) => `${g < 0 ? '-' : ''}£${Math.abs(g).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
      for (const row of core.bridge.rows) expect(auditText, row.label).toContain(four(row.gbp));

      const blob = await exportToExcelBlob(r.result, r.input, book, 'GBP', 1, checks as never, null, null, null, null,
        r.commodity as never, { cadMeta: meta });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
      for (const sheet of ['0-Executive', '2-Material']) {
        const ws = wb.getWorksheet(sheet)!;
        const all: unknown[][] = [];
        ws.eachRow(x => all.push((x.values as unknown[]).slice(1)));
        const at = all.findIndex(x => x[0] === COST_BRIDGE_HEAD);
        expect(at, sheet).toBeGreaterThan(0);
        const printed = all.slice(at + 1, at + 1 + core.bridge.rows.length);
        expect(printed.map(x => x[0]), sheet).toEqual(rows.map(x => x.label));
        printed.forEach((x, i) => expect(Number(x[1]), `${sheet} ${x[0]}`).toBeCloseTo(core.bridge.rows[i].gbp, 6));
        expect(Number(printed.at(-1)![2])).toBeCloseTo(r.result.total, 6);
        const bal = all.findIndex(x => typeof x[0] === 'string' && (x[0] as string).startsWith(MATERIAL_BALANCE_HEAD));
        expect(bal, sheet).toBeGreaterThan(at);
        expect(all.some(x => x[0] === core.balance!.stock!.text), sheet).toBe(true);
      }
      // 0-Executive and the core PDF print the same "what it is" text (2 dp, no price a kg)
      const exec: unknown[][] = [];
      wb.getWorksheet('0-Executive')!.eachRow(x => exec.push((x.values as unknown[]).slice(1)));
      const at = exec.findIndex(x => x[0] === COST_BRIDGE_HEAD);
      exec.slice(at + 1, at + 1 + rows.length).forEach((x, i) => expect(x[4]).toBe(rows[i].detail || rows[i].basis));

      const html = costBridgeHtml(core.bridge, core.balance, { fmt: two });
      for (const row of rows) expect(html).toContain(two(row.gbp));
      expect(html).toContain(core.balance!.stock!.text);
      expect(html).not.toMatch(/no extra material/);
    }, 120_000);
  }
});

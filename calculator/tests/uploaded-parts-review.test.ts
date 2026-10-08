/**
 * The uploaded-parts review (Oct 2026): every CAD file a director will see costed, live, in its correct commodity — and
 * the PDF and Excel it exports. These pin the defects that run found, each against the measured values that exposed it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { inferCommodity, looksLikeGear } from '../src/engine/cost-input-rules/derive/commodity.js';
import { cavityShell } from '../src/engine/cost-input-rules/derive/hollow.js';
import { adviseCastingProcess, HPDC_SECTION_MAX_MM } from '../src/engine/modules/casting-advisor.js';
import { shaftBlank } from '../src/engine/cost-input-rules/commodities/gear.js';
import { geometryTimeoutMs, analyzeRequestTimeoutMs } from '../src/engine/geometry-timeout.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { generateDFMDFA } from '../src/engine/dfm-dfa.js';
import { generateInsights } from '../src/engine/insights.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const TANK = (JSON.parse(readFileSync(new URL('../../cad-audit/final/runs/FINAL-Fuel_tank-api.json', import.meta.url), 'utf8'))
  .response.occtGeometry) as OCCTGeometry;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
type Q = { decision?: { options: Array<{ value: string; leaning?: boolean }> }; commodity?: string };
const infer = (geo: OCCTGeometry, filename: string, annualVolume = 50_000) =>
  inferCommodity({ geo, geometryQuality: 'occt', annualVolume, filename, answers: {} } as unknown as RuleContext) as Q;
const lean = (q: Q) => q.decision?.options.find(o => o.leaning)?.value;
const opts = (q: Q) => q.decision?.options.map(o => o.value) ?? [];

describe('routing — the files a director uploads land on their real process', () => {
  it('a gearbox HOUSING is not a gear ("_gearbox" matched the gear filename test)', () => {
    expect(looksLikeGear({}, 'offroad_vehicle_gearbox_housing.stp').gear).toBe(false);
    expect(looksLikeGear({}, 'gear_housing_cover.step').gear).toBe(false);
    for (const n of ['ring_gear.step', 'PINION-12.stp', 'gear_z38.stp', 'spur gear.stp', 'Input Gear.STEP']) expect(looksLikeGear({}, n).gear).toBe(true);
  });

  it('the real fuel tank (a saddle tank: its centre ray probe reads 33 %) is a hollow route, leaning blow moulding', () => {
    const g = structuredClone(TANK);
    // what the kernel measures on it now: 704 of 1,080 analysed faces face an enclosed cavity
    g.enclosure = { centreIn: 'void', rays: 96, hitShare: 0.333 } as OCCTGeometry['enclosure'];
    g.draftAnalysis = { ...(g.draftAnalysis ?? {}), cavityFaceCount: 704, analyzedFaceCount: 1080 } as OCCTGeometry['draftAnalysis'];
    expect(cavityShell(g)).toBe(true);
    const q = infer(g, 'Fuel_tank.STEP');
    expect(opts(q)).toContain('blow_moulding');
    expect(lean(q)).toBe('blow_moulding');
  });

  it('a 2.5 mm bumper fascia is offered injection moulding (it was offered only blow / roto / sheet, leaning roto)', () => {
    const g = structuredClone(TANK);
    Object.assign(g, {
      boundingBox: { xMm: 1690.9, yMm: 642.6, zMm: 522.2 }, fillRatio: 0.004,
      volume: { cm3: 2059.9, mm3: 2_059_900 }, surfaceArea: { cm2: 16_479, mm2: 1_647_900 },
      wallThickness: { meanMm: 2.5 }, sheetMetal: { bendCount: 0, thicknessMm: 2.53 },
      enclosure: { centreIn: 'void', rays: 96, hitShare: 0.281 }, featureTable: [],
      draftAnalysis: { cavityFaceCount: 0, analyzedFaceCount: 2 },
      topology: { ...(TANK.topology ?? {}), available: true, enclosesSealedVoid: false, solidCount: 1 },
    });
    const q = infer(g, 'BUMPER.stp');
    expect(opts(q)).toEqual(expect.arrayContaining(['injection_moulding', 'blow_moulding', 'rotational_moulding']));
    expect(lean(q)).toBe('injection_moulding');           // the name says bumper (not a bumper BEAM)
    expect(lean(infer(g, 'CLOSE_VOLUME.stp'))).toBeUndefined();   // no evidence either way: asked, not leaned
  });

  it('a thick-walled shell with bosses is a casting, not a moulding (gearbox housing: 5.9 mm, 20 fillets read as bends)', () => {
    const g = geoOf('PRCR002.stp');
    Object.assign(g, {
      boundingBox: { xMm: 180.5, yMm: 258, zMm: 269 }, fillRatio: 0.085,
      volume: { cm3: 1068.4, mm3: 1_068_400 }, surfaceArea: { cm2: 3622, mm2: 362_200 },
      wallThickness: { meanMm: 10.3 }, sheetMetal: { bendCount: 20, thicknessMm: 5.9 },
      featureTable: [...(g.featureTable ?? []), { kind: 'boss', diaMm: 12, depthMm: 8, count: 4 }],
    });
    const q = infer(g, 'offroad_vehicle_gearbox_housing.stp');
    expect(opts(q)).toEqual(expect.arrayContaining(['cast_and_machine', 'casting']));
    expect(lean(q)).toBe('cast_and_machine');
  });
});

describe('casting process — the section decides what a die can make', () => {
  const base = { annualVolume: 50_000, minWallThicknessMm: 3, complexity: 'medium' as const, alloyFamily: 'aluminium' as const,
    pressureTight: true, toleranceClass: 'standard' as const, safetyCritical: false };
  it('an 80 kg aluminium part at a 48.6 mm section is not a megacasting (it went to a 6,100 t giga-press)', () => {
    const r = adviseCastingProcess({ ...base, partWeightKg: 80.7, sectionMm: 48.6 });
    expect(r.process).not.toBe('megacasting');
    expect(r.process).toBe('sand');
  });
  it('a 2.9 kg aluminium housing at a 5.9 mm section (2·V/S, bosses included) is die cast at 50,000 / yr', () => {
    expect(adviseCastingProcess({ ...base, partWeightKg: 2.88, sectionMm: 5.9 }).process).toBe('hpdc');
    expect(adviseCastingProcess({ ...base, partWeightKg: 2.88, sectionMm: HPDC_SECTION_MAX_MM + 0.1 }).process).toBe('gravity');
  });
});

describe('gear on a shaft — costed as the shaft, not as a face-width disc', () => {
  const ctx = (bbox: [number, number, number], axis: number[], fraction: number) => ({
    geo: { boundingBox: { xMm: bbox[0], yMm: bbox[1], zMm: bbox[2] }, turning: { fraction, maxDiaMm: 49.63, externalMaxDiaMm: 49.63, axis } },
  } as unknown as RuleContext);
  it('the input shaft (274.5 mm long, 15.6 mm gear face) buys a bar the length of the shaft', () => {
    const s = shaftBlank(ctx([49.63, 274.5, 49.63], [0, 1, 0], 0.687), 49.63, 15.6)!;
    expect(s).not.toBeNull();
    expect(s.stock.form).toBe('bar');
    expect(s.stock.dimsMm[1]).toBeGreaterThan(274.5);   // + facing and parting
    expect(s.stock.dimsMm[0]).toBeGreaterThanOrEqual(50);
  });
  it('a gear with a short hub is still a disc', () => {
    expect(shaftBlank(ctx([60, 30, 60], [0, 1, 0], 0.8), 60, 20)).toBeNull();
  });
});

describe('the kernel is given time for a large file', () => {
  it('120 s for a typical part, longer for the 31 MB fuel tank (it timed out at 150 s), capped at 10 minutes', () => {
    expect(geometryTimeoutMs(1_000_000)).toBe(126_000);
    expect(geometryTimeoutMs(31_080_567)).toBeGreaterThan(300_000);
    expect(geometryTimeoutMs(500_000_000)).toBe(600_000);
    expect(analyzeRequestTimeoutMs(31_080_567)).toBe(geometryTimeoutMs(31_080_567) + 60_000);
  });
});

/** PRCR002 as the product costs it (cast + machine, ductile iron): consumables itemised, melt energy, melt loss not scrap. */
async function stubAxle() {
  const geo = geoOf('PRCR002.stp');
  const r = await costMeasuredPart(geo, 'PRCR002', { partNumber: 'PRCR002', file: 'PRCR002', annualVolume: 50_000 } as never,
    { 'commodity.route': 'cast_and_machine', 'material.family': 'cast iron', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' },
    'UK', { annualVolume: 50_000 } as never, book, { partNumber: 'PRCR002', file: 'PRCR002', status: 'error' } as never) as unknown as {
      status: string; total: number; breakdown: Record<string, number>; trace: { drivers: { rawMaterial: never; operations: never; tooling: never } } };
  expect(r.status).toBe('costed');
  const d = r.trace.drivers;
  const input = { partName: 'PRCR002', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    packagingPerPart: r.breakdown.packaging, logisticsPerPart: r.breakdown.logistics, overheadPct: 0.12, marginPct: 0.08 } as never;
  return { input, result: computeUniversalStack(input, book) };
}

describe('the Excel workbook — numbers, and arithmetic that reconciles', () => {
  it('money is a NUMBER with a currency format, and every check on sheet 7 is OK', async () => {
    const { input, result } = await stubAxle();
    const blob = await exportToExcelBlob(result, input, book, 'GBP', 1, null);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { cellNF: true });
    const sum = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['1-Summary'], { header: 1, raw: true });
    const total = sum.find(r => r[0] === 'TOTAL SHOULD COST')!;
    expect(typeof total[1]).toBe('number');
    expect(total[1] as number).toBeCloseTo(result.total, 4);
    const cell = Object.values(wb.Sheets['1-Summary']).find(c => (c as XLSX.CellObject).v === total[1]) as XLSX.CellObject;
    expect(cell.t).toBe('n');
    expect(String(cell.z)).toContain('#,##0.00');
    const ck = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['7-Checks'], { header: 1, raw: true });
    const results = ck.filter(r => r[4] === 'OK' || r[4] === 'MISMATCH').map(r => `${r[0]}: ${r[4]}`);
    expect(results.length).toBe(5);
    for (const r of results) expect(r).toMatch(/OK$/);
    // the material sheet itemises the casting's services and does not need an "other" plug
    const mat = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['2-Material'], { header: 1, raw: true }).map(r => String(r[0]));
    expect(mat.some(l => /heat treatment/i.test(l))).toBe(true);
    expect(mat.some(l => /NDT/.test(l))).toBe(true);
    expect(mat).not.toContain('UNRECONCILED');
    expect(mat.join('|')).not.toMatch(/Benchmark: 75-85/);
  });
});

describe('observations and levers say only what the costing supports', () => {
  it('no casting reference band is applied to a cast + machined part, and no £ saving appears in the text', async () => {
    const { input, result } = await stubAxle();
    const ins = generateInsights(result, input, book, 'cast_and_machine', { region: 'UK', volumeProvided: true, pkgLogisticsEstimated: false, library: book });
    const text = JSON.stringify(ins);
    expect(text).not.toMatch(/saves ~|£\d/);
    expect(ins.map(i => i.title)).not.toContain('Process cost above the reference band');
    expect(text).not.toMatch(/industry benchmark/i);
  });
  it('multi-machine manning is not proposed for a sand moulding line crew of 4, nor consumables "59 %" built of heat treat and NDT', async () => {
    const { input, result } = await stubAxle();
    const dfm = generateDFMDFA(result, input, 'cast_and_machine', { region: 'UK', volumeProvided: true, pkgLogisticsEstimated: false, library: book });
    const titles = JSON.stringify(dfm);
    expect(titles).not.toMatch(/Multi-Machine Manning/);
    expect(titles).not.toMatch(/Consumables Rationalisation/);
    expect(titles).toMatch(/[A-Za-z]/);   // the generator did run
    expect(titles).not.toMatch(/35% floor/);
  });
});

describe('the casting observations do not advise casting a casting', () => {
  it('a cast + machined part is not told to "evaluate a near-net-shape blank", nor to raise a melt-loss utilisation', async () => {
    const { input, result } = await stubAxle();
    // make material dominate so the material actions are produced
    const heavy = { ...result, breakdown: { ...result.breakdown, rawMaterial: result.total * 0.7 } };
    const text = JSON.stringify(generateInsights(heavy as never, input, book, 'cast_and_machine', { region: 'UK', volumeProvided: true, pkgLogisticsEstimated: false, library: book }));
    expect(text).not.toMatch(/near-net-shape blank \(casting or forging\) instead of cutting from solid/);
    expect(text).not.toMatch(/utilisation at 9\d% — re-cost/);
  });
});

describe('screen and headless cost a machined part alike', () => {
  it('the removal-ceiling cap leaves rule-built (measured) operations alone — it scaled the servo horn\'s handling', async () => {
    const { toCostParams } = await import('../src/engine/cost-input-rules/to-cost-params.js');
    // a 1.2 cm³ part in a 47 × 10 × 7.5 mm envelope: the removal ceiling is a few seconds, the measured build-up is not
    const geo = { volume: { cm3: 1.2 }, surfaceArea: { cm2: 40 }, boundingBox: { xMm: 46.9, yMm: 9.7, zMm: 7.5 }, featureTable: [] } as never;
    const ops = [
      { operationName: 'Milling — +X', machineId: 'mach-haas-vf2', cycleTimeHr: 0.0066, measured: true },
      { operationName: 'Load / clamp / unload — 4 fixturing(s)', machineId: 'mach-haas-vf2', cycleTimeHr: 0.0204, measured: true },
    ];
    const ci = { estimatedOperations: ops, estimatedCycleTimeHr: 0.027, netWeightKg: 0.003, machining: { stockWeightKg: 0.022, machineId: 'mach-haas-vf2' } } as never;
    const r = toCostParams('machining', ci, 100_000, 'aluminium', geo)!;
    const out = (r.params as { operations: Array<{ cycleTimeHr: number }> }).operations;
    expect(out.map(o => o.cycleTimeHr)).toEqual([0.0066, 0.0204]);
    expect(r.assumed.join(' ')).not.toMatch(/removal ceiling/);
    // a model-supplied (unmeasured) cycle on the same part IS capped
    const model = { ...(ci as object), estimatedOperations: ops.map(o => ({ ...o, cycleTimeHr: o.cycleTimeHr * 20, measured: undefined })) } as never;
    expect(toCostParams('machining', model, 100_000, 'aluminium', geo)!.assumed.join(' ')).toMatch(/removal ceiling/);
  });
});

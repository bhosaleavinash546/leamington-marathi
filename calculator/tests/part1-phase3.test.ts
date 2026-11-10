/**
 * Part1 review, phase 3 (5 Nov 2026) — the user's gravity die + machining triple clamp, China, 200k / 5 yr, ex-works.
 *
 *  1. Page 1 carries a visual summary: the 8 buckets as a static waterfall to the headline, and the part in brief
 *     (weights, envelope, material and grade, route, volume and life, country and terms, machined features) — read off
 *     the costing; the 0-Executive sheet carries the same as cells plus a native chart on them.
 *  2. Money in the CORE report's text prints to 2 dp; an equation that closed still closes at its printed figures (or
 *     prints its result only); page 2 shows ONE £/kg (as cast) — the others are in the audit pack.
 *  3. An export runs the screen's route comparison when there is none (report-route-compare.ts); when it cannot, the
 *     core report prints one line saying why in place of section 6a and the volume line — never "not run".
 *  4. The two 3 mm clamp slits are costed as a slitting operation from a slitting-saw maker's published cutting data;
 *     their walls are no longer face-milled; page 1's uncosted-scope alert names the costed operation instead.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { jsPDF } from 'jspdf';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { regionalBook } from '../server/services/bulk-run.js';
import { CATALOGUE, SLIT_SAW_BODIES, SAW_COLLAR_X_BORE, slitMinutes, CUTTING_SOURCES } from '../src/engine/cutting-catalogue.js';
import { machinedFeatureCount } from '../src/engine/machining-time.js';
import { machinedFaceSet } from '../src/engine/dfm-geometry/machined-faces.js';
import { narrowSlitFindings, SLIT_COSTED_TITLE, SLIT_UNCOSTED_TITLE } from '../src/engine/dfm-geometry/commodities/slits.js';
import { groupFindings } from '../src/engine/dfm-geometry/index.js';
import { buildCoreReport, type CoreReport } from '../src/export/executive-summary.js';
import { renderCoreReport } from '../src/export/core-report-pdf.js';
import { hardenPdfText, printAuditPackPDF } from '../src/export/pdf.js';
import { exportToExcelBlob, WATERFALL_HEAD } from '../src/export/excel.js';
import { coreMoneyText, localiseGbpText } from '../src/export/money-text.js';
import { ensureReportRouteComparison, routeCompareBody, routeCompareKey, ROUTES_NOTE, type RouteCompareState } from '../src/ui/report-route-compare.js';
import { PARTS_DIR } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { ManufacturingFeature, PartContext } from '../src/engine/dfm-geometry/types.js';
import type { PartCostResult, UniversalStackInput } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const ROOT = join(import.meta.dirname, '..');
/** Part1 measured by the phase-3 kernel (`_narrow_slits`): 2 slits, their walls out of the face rows. */
const GEO = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/part1-phase3-kernel.json'), 'utf8')) as OCCTGeometry;
const ANSWERS = { 'material.family': 'aluminium', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
  'service.toleranceClass': 'standard', 'service.safetyCritical': 'no', 'material.grade': 'mat-lm25' };
const FX = 8.88;
const base = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const book = regionalBook(base, 'CN', new Map());
const SLIT_RESEARCH = JSON.parse(readFileSync(join(ROOT, 'scripts/research/2026-11-slitting/data.json'), 'utf8')) as Array<{ quantity: string; material: string; value: unknown; quote: string; url: string; date: string }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let r: any;
let input: UniversalStackInput;
let result: PartCostResult;
let meta: Record<string, unknown>;
let model: CoreReport;
const ops = () => input.operations.map(o => o.operationName);

/** The core PDF as printPDF draws it (hardened with the core's money text), with every string it drew. */
function drawCore(m: CoreReport, fx = FX, sym = '¥'): { doc: jsPDF; text: string[]; byPage: Map<number, string[]> } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const text: string[] = [];
  const byPage = new Map<number, string[]>();
  const t0 = doc.text.bind(doc) as (...a: unknown[]) => unknown;
  (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (s: unknown, ...rest: unknown[]) => {
    const page = doc.getCurrentPageInfo().pageNumber;
    for (const x of [s].flat()) if (typeof x === 'string') { text.push(x); (byPage.get(page) ?? byPage.set(page, []).get(page)!).push(x); }
    return t0(s, ...rest);
  };
  hardenPdfText(doc, { fx, sym, localise: coreMoneyText });
  renderCoreReport(doc, m, { money: g => `${sym}${(g * fx).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, fx, sym, currency: sym === '¥' ? 'CNY' : 'GBP', dateStr: '05 Nov 2026' });
  return { doc, text, byPage };
}
/** A print function's PDF, as bytes. */
function capture(draw: () => void): Buffer {
  let bytes: ArrayBuffer | null = null;
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  api.save = function (this: InstanceType<typeof jsPDF>) { bytes = this.output('arraybuffer'); return this; };
  try { draw(); } finally { api.save = orig; }
  return Buffer.from(bytes!);
}

beforeAll(async () => {
  r = await costMeasuredPart(GEO, 'Part1.stp', { partNumber: 'Part1.stp', file: 'Part1.stp', annualVolume: 200_000, commodity: 'cast_and_machine' } as never,
    ANSWERS, 'CN', { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, base, { partNumber: 'P', file: 'P', status: 'error' } as never);
  // the screen's stack input carries the programme life (#programme-years); the headless one leaves it on the tooling
  input = { ...r.trace.stackInput, programmeYears: 5 }; result = r.trace.result;
  meta = {
    geometrySource: 'occt', annualVolume: 200_000,
    checks: { costable: true, sanity: [], overrides: [], decisions: [], ruleValues: Object.entries(r.provenance ?? {}).map(([id, p]) => ({ label: id, fieldId: id, value: String((p as { value: unknown }).value ?? ''),
      ruleValue: String((p as { value: unknown }).value ?? ''), basis: String((p as { basis?: string }).basis ?? '') })) },
    partGeometry: { boundingBox: GEO.boundingBox, featureTable: GEO.featureTable, slits: GEO.slits },
  };
  model = buildCoreReport({ result, input, library: book, commodity: 'cast_and_machine', region: 'CN', cadMeta: meta as never, baseLibrary: base, regionalRows: [], fx: FX, sym: '¥' });
}, 120_000);

// ─── 4. Slitting ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('4. the narrow slits are costed as a slitting operation from published saw data', () => {
  it('the catalogue reads the maker\'s ranges, bodies and saw type by chip form (scripts/research/2026-11-slitting)', () => {
    const q = (s: string) => SLIT_RESEARCH.find(x => x.quote.startsWith(s))!;
    expect(q('P.4 | Heat treatable steels').value).toEqual({ vc_m_min: [10, 20], fz_mm: [0.02, 0.03] });
    expect(q('K.1 | Cast iron').value).toEqual({ vc_m_min: [15, 25], fz_mm: [0.04, 0.05] });
    expect(q('N.1 | Aluminium').value).toEqual({ vc_m_min: [100, 150], fz_mm: [0.03, 0.07] });
    expect(CATALOGUE.steel.slit).toMatchObject({ vc: [10, 20], fz: [0.02, 0.03], type: 'W' });
    expect(CATALOGUE['cast iron'].slit).toMatchObject({ vc: [15, 25], fz: [0.04, 0.05], type: 'H' });
    expect(CATALOGUE.aluminium.slit).toMatchObject({ vc: [100, 150], fz: [0.03, 0.07], type: 'W' });
    // every body the costing can pick is a row read off the maker's table
    for (const [type, list] of Object.entries(SLIT_SAW_BODIES)) for (const b of list) for (const [w, z] of Object.entries(b.z)) {
      const row = SLIT_RESEARCH.find(x => x.quantity.startsWith('slitting saw body')
        && x.quote.startsWith(`${b.dc} | ${w.replace('.', ',')} | ${b.bore} | ${z} | 72291${type === 'W' ? '3' : '0'}`));
      expect(row, `${type} Ø${b.dc} × ${w} Z${z}`).toBeTruthy();
    }
    for (const x of SLIT_RESEARCH) { expect(x.url).toMatch(/^https:\/\//); expect(x.date).toBe('2026-11-05'); expect(x.quote.length).toBeGreaterThan(10); }
    expect(CUTTING_SOURCES['ZPS-SAW'].rows).toMatch(/^#\d/);
  });
  it('Part1\'s slit: Ø100 × 3 type W Z40 (Ø80 reaches 18 mm, the slit is 20 long), vc 125, fz 0.05 — 85 mm ÷ 795.8 mm/min', () => {
    const t = slitMinutes('aluminium', { widthMm: 3, depthMm: 35, lengthMm: 20 });
    expect((80 - SAW_COLLAR_X_BORE * 22) / 2).toBe(18);
    expect(t).toMatchObject({ dc: 100, z: 40, vc: 125, fz: 0.05, type: 'W' });
    const vf = 1000 * 125 / (Math.PI * 100) * 40 * 0.05;
    expect(t.vf).toBeCloseTo(vf, 9);
    expect(t.min).toBeCloseTo((35 + Math.sqrt(20 * 80) + 10) / vf, 9);
    expect(t.min).toBeCloseTo(0.1068, 4);
  });
  it('the kernel\'s slits reach the costing: one slitting op on the machining centre (2 × 0.107 + one 2.2 s tool change + two approaches at the VF-2 rapid = 0.26 min)', () => {
    const slit = input.operations.find(o => /^Slitting — 2 narrow slits/.test(o.operationName));
    expect(slit, ops().join(' | ')).toBeTruthy();
    expect(slit!.machineId).toBe('mach-haas-vf2');
    expect(slit!.cycleTimeHr * 60).toBeCloseTo(0.258, 2);   // PKG-2: + 2 × 2 × 25 mm and the traverse at 25.4 m/min
  });
  it('the slit walls are not face-milled: the feature table has no face row on faces 28 / 30 / 39 / 40', () => {
    const faced = (GEO.featureTable ?? []).filter(x => x.kind === 'face').flatMap(x => x.faceIds ?? []);
    for (const id of [28, 30, 39, 40]) expect(faced).not.toContain(id);
    expect((GEO.slits ?? []).flatMap(s => s.wallFaceIds).sort((a, b) => a - b)).toEqual([28, 30, 39, 40]);
  });
  it('the machined face set takes the slit faces; the DFM finding says the slit is costed (info), and uncosted without the kernel\'s slits', () => {
    const feats = [
      { id: 'FIL1', kind: 'fillet', faceIds: [1], radiusMm: 1.5, depthMm: 34.965, areaMm2: 163.384, positionMm: [17.483, 55.495, 22.019], axis: [1, 0, 0], concave: true, sweepDeg: 180, adjacentFaceIds: [39, 40, 182] },
      { id: 'P39', kind: 'planar_face', faceIds: [39], areaMm2: 695.325, positionMm: [16.192, 66.139, 24.702], axis: [0, -0.37461, 0.92718] },
      { id: 'P40', kind: 'planar_face', faceIds: [40], areaMm2: 698.127, positionMm: [16.259, 64.99, 27.473], axis: [0, 0.37461, -0.92718] },
    ] as ManufacturingFeature[];
    const featureSet = { available: true, features: feats };
    const withSlits = machinedFaceSet(GEO as never, featureSet as never, 'cast_and_machine')!;
    expect(withSlits.counts.slits).toBe(6);
    for (const id of [1, 39, 40]) expect(withSlits.faceIds).toContain(id);
    const part = (machined: PartContext['machined']): PartContext => ({ commodity: 'cast_and_machine', featureSet: featureSet as never, machined });
    const costed = narrowSlitFindings(part(withSlits));
    expect(costed).toHaveLength(1);
    expect(costed[0]).toMatchObject({ severity: 'info', title: SLIT_COSTED_TITLE });
    expect(costed[0].detail).toMatch(/costed as a slitting operation/);
    const old = machinedFaceSet({ ...GEO, slits: undefined } as never, featureSet as never, 'cast_and_machine');
    expect(narrowSlitFindings(part(old))[0]).toMatchObject({ severity: 'risk', title: SLIT_UNCOSTED_TITLE });
  });
  it('page 1 names the costed operation; the uncosted-scope alert is gone (and it stays for a slit the costing does not carry)', () => {
    const a = model.alerts.find(x => /slit/i.test(x.title))!;
    expect(a.kind).toBe('costed');
    expect(a.title).toBe('Costed: 2 narrow slits (2× 3.0 wide × 35.0 deep × 20.0 long) as a slitting operation');
    expect(model.alerts.some(x => /^Uncosted scope: .*slit/.test(x.title))).toBe(false);
    expect(model.verdict).not.toMatch(/slit/);
    // the same costing without the slitting op, with the DFM's finding: the uncosted-scope alert
    const noSaw = { ...input, operations: input.operations.filter(o => !/^Slitting/.test(o.operationName)) } as UniversalStackInput;
    const grouped = groupFindings(narrowSlitFindings({ commodity: 'cast_and_machine', featureSet: { available: true, features: [
      { id: 'FIL1', kind: 'fillet', faceIds: [1], radiusMm: 1.5, depthMm: 34.965, areaMm2: 163.384, positionMm: [0, 0, 0], axis: [1, 0, 0], concave: true, sweepDeg: 180, adjacentFaceIds: [39, 40] },
      { id: 'P39', kind: 'planar_face', faceIds: [39], areaMm2: 695.325, positionMm: [16.192, 66.139, 24.702], axis: [0, -0.37461, 0.92718] },
      { id: 'P40', kind: 'planar_face', faceIds: [40], areaMm2: 698.127, positionMm: [16.259, 64.99, 27.473], axis: [0, 0.37461, -0.92718] },
    ] } as never }));
    const m2 = buildCoreReport({ result, input: noSaw, library: book, commodity: 'cast_and_machine', region: 'CN', cadMeta: { ...meta, geometricDFM: { grouped, limitations: [] } } as never, fx: FX, sym: '¥' });
    expect(m2.alerts.find(x => /slit/i.test(x.title))?.kind).toBe('scope');
  });
});

// ─── 1. Page-1 visual summary ──────────────────────────────────────────────────────────────────────────────────────────
describe('1. page 1: the waterfall to the price and the part in brief', () => {
  it('the waterfall is the 8 buckets in order, each starting where the last ended, then the should-cost', () => {
    const w = model.waterfall;
    expect(w.map(b => b.label)).toEqual(['Material', 'Process', 'Direct labour', 'Tooling', 'Packaging', 'Logistics', 'Overhead', 'Margin', 'Should-cost']);
    let run = 0;
    for (const b of w.slice(0, 8)) { expect(b.startGbp).toBeCloseTo(run, 9); run += b.gbp; expect(b.endGbp).toBeCloseTo(run, 9); }
    expect(run).toBeCloseTo(result.total, 6);
    expect(w[8]).toMatchObject({ total: true, startGbp: 0, gbp: result.total });
    expect(w.slice(0, 8).map(b => b.gbp)).toEqual(model.buckets.map(b => b.gbp));
  });
  it('the part summary is read off the costing: weights, envelope, grade, route, volume, terms, machined features', () => {
    const v = Object.fromEntries(model.partSummary.rows.map(x => [x.label, x.value]));
    expect(v['Weight']).toBe(`${model.weights!.finishedKg!.toFixed(3)} kg finished · ${model.weights!.asFormedKg.toFixed(3)} kg as cast`);
    expect(v['Envelope (L × W × H)']).toBe('270 × 110 × 58 mm');
    expect(v['Material and grade']).toMatch(/^LM25/);
    expect(v['Process route']).toBe('Cast and machine — gravity die');
    expect(v['Volume and life']).toBe('200,000 a year × 5 years = 1,000,000 parts');
    expect(v['Country and terms']).toBe('China · ex-works (EXW)');
    // holes as pieces of work (a stepped bore is one), the measured faces, the two slits the costing saws
    const mf = machinedFeatureCount((GEO.featureTable ?? []).filter(x => x.kind === 'hole' || x.kind === 'face') as never, 2);
    expect(model.partSummary.machinedFeatures).toBe(mf.total);
    expect(v['Machined features']).toBe(`${mf.total} — ${mf.text}`);
    expect(mf).toMatchObject({ holes: 7, faces: 10, slits: 2, total: 19 });
  });
  it('the PDF draws both on page 1 as vector shapes (no image) and the core report stays at 7 pages', () => {
    const { doc, text } = drawCore(model);
    const p1 = (doc as unknown as { internal: { pages: string[][] } }).internal.pages[1].join('\n');
    expect(p1).toMatch(/Cost build-up to the price/);
    expect(p1).toMatch(/The part/);
    expect(p1).toMatch(/Envelope \(L × W × H\)|Envelope/);
    expect((p1.match(/\sre\s*\n?f\b|\bre\s+f\b/g) ?? []).length).toBeGreaterThanOrEqual(8);   // the bars: filled rectangles
    expect(text).toContain('Should-cost');
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(8);
  });
  it('the workbook\'s 0-Executive carries the part rows, the waterfall table and a native chart on those cells', async () => {
    const blob = await exportToExcelBlob(result, input, book, 'CNY', FX, meta.checks as never, null, null, null, null, 'cast_and_machine', { cadMeta: meta as never, baseLibrary: base });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const chart = await zip.file('xl/charts/chart1.xml')?.async('string');
    expect(chart).toBeTruthy();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await blob.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['0-Executive'], { header: 1, blankrows: true });
    const head = rows.findIndex(x => x[0] === WATERFALL_HEAD) + 1;   // 1-based sheet row
    expect(head).toBeGreaterThan(0);
    expect(rows[head][0]).toBe('Material');
    expect(rows[head + 8][0]).toBe('Should-cost');
    expect(rows[head + 8][2]).toBeCloseTo(result.total * FX, 4);
    expect(chart).toContain(`'0-Executive'!$A$${head + 1}:$A$${head + 9}`);
    expect(chart).toContain(`'0-Executive'!$C$${head + 1}:$C$${head + 9}`);
    expect(chart).toContain('<a:noFill/>');                                   // the offset series is invisible
    expect(rows.some(x => x[0] === '  Envelope (L × W × H)' && x[1] === '270 × 110 × 58 mm')).toBe(true);
  });
});

// ─── 2. Fewer decimals in the core report's text ────────────────────────────────────────────────────────────────────────
describe('2. the core report\'s text: money to 2 dp, equations still close, one £/kg on page 2', () => {
  it('coreMoneyText: from the exact £, 2 dp; a closing equation keeps closing or prints its result only', () => {
    expect(coreMoneyText('£0.5174/kg', FX, '¥')).toBe('¥4.59/kg');
    expect(localiseGbpText('£0.5174/kg', FX, '¥')).toBe('¥4.5945/kg');          // the audit pack and workbook keep it
    expect(coreMoneyText('£0.1000 a part', FX, '¥')).toBe('¥0.89 a part');
    expect(coreMoneyText('£0.0018 a part', 1, '£')).toBe('£0.0018 a part');      // never a bare 0.00
    expect(coreMoneyText('24 sets × £2,500 × factor 0.3416 = £20,496', 1, '£')).toBe('24 sets × £2,500 × factor 0.3416 = £20,496');
    // closes at 4 dp only: the core prints the result
    expect(coreMoneyText('2 min × £0.1234/min = £0.2468 a part', FX, '¥')).toBe('¥2.19 a part');
    // closes at 2 dp: kept
    expect(coreMoneyText('2 min × £0.5000/min = £1.0000 a part', 1, '£')).toBe('2 min × £0.50/min = £1.00 a part');
    expect(coreMoneyText('The £/kg figures', FX, '¥')).toBe('The ¥/kg figures');
  });
  it('the Part1 core report prints no money figure with 3+ decimals, and page 2 one £/kg (as cast)', () => {
    const { text, byPage } = drawCore(model);
    const all = text.join('\n');
    expect(all.match(/¥\d[\d,]*\.\d{3,}/g) ?? []).toEqual([]);
    const p2 = [...byPage.entries()].find(([, t]) => t.some(x => /Material \(bucket 1\) split/.test(x)));
    expect(p2).toBeTruthy();
    // the metal / price per-kg figures on the cost build-up page: only the casting's price a kg as cast (a service's own
    // rate a kg, "1.336 kg × ¥0.07/kg" on the heat-treatment line, is that line's arithmetic, not a material £/kg)
    const p2text = p2![1].join(' ');
    const perKg = [...p2text.matchAll(/(kg × )?¥[\d,.]+\/kg( as cast)?/g)];
    const material = perKg.filter(x => !x[1]);                      // not a service line's "N kg × ¥x/kg"
    expect(material.map(x => x[0]), perKg.map(x => x[0]).join(', ')).toHaveLength(1);
    expect(material[0][2]).toBe(' as cast');
    expect(all).toMatch(/Casting ex-foundry ¥[\d.,]+ a part — ¥[\d.,]+\/kg as cast/);
    expect(all).not.toMatch(/The metal ¥[\d.,]+\/kg as cast/);
    expect(all).not.toMatch(/kg bought × ¥/);
  });
  it('the audit pack carries the per-kg figures the core no longer prints', () => {
    const pdf = capture(() => printAuditPackPDF(result, input, book, 'CNY', FX, 'cast_and_machine', null, 'CN', [], meta as never, base));
    expect(pdf.length).toBeGreaterThan(10_000);
    let txt = '';
    try { txt = execFileSync('pdftotext', ['-', '-'], { input: pdf }).toString(); } catch { return; /* no poppler on this runner */ }
    expect(txt).toMatch(/Metal a kg as cast/);
    expect(txt).toMatch(/¥\d+\.\d{4}/);          // the audit pack keeps its 4-dp figures
  });
});

// ─── 3. The route comparison at export ─────────────────────────────────────────────────────────────────────────────────
describe('3. the route comparison is run at export, or the report says why it is not there', () => {
  const state: RouteCompareState = { geometryHash: 'abc', filename: 'Part1.stp', current: 'cast_and_machine', decisionAnswers: { b: '2', a: '1' },
    acknowledged: [], annualVolume: '200,000', region: 'CN', programmeYears: 5, deliveryTerms: 'EXW', material: null, blankHash: null,
    referenceBand: { p10: 1, p50: 2, p90: 3, plusMinusPct: 10, confidence: 'Low' } };
  const comparison = { rows: [], excluded: [], crossovers: [], principle: 'p', volumes: [] } as never;
  const fakeFetch = (status: number, json: unknown, seen: Array<{ url: string; body: unknown }> = []) => (async (url: string, init?: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init?.body)) });
    return { ok: status < 400, status, json: async () => json } as Response;
  }) as typeof fetch;
  const args = { costedFromCad: true, have: { comparison: null, key: null }, state, blockingOpen: [], headline: 6.37, labels: {}, authHeader: {}, doc: undefined };
  it('no comparison held: the screen\'s request is sent, field for field, and its rows come back for the reports', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const out = await ensureReportRouteComparison({ ...args, fetchImpl: fakeFetch(200, { comparison }, seen) });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/api/cad/compare-routes');
    expect(seen[0].body).toEqual({ geometryHash: 'abc', filename: 'Part1.stp', current: 'cast_and_machine', decisionAnswers: { b: '2', a: '1' },
      acknowledged: [], annualVolume: '200,000', region: 'CN', programmeYears: 5, deliveryTerms: 'EXW', referenceBand: state.referenceBand });
    expect(out.note).toBeNull();
    expect(out.comparison).toMatchObject({ current: 'cast_and_machine', headline: 6.37 });
    expect(out.key).toBe(routeCompareKey(routeCompareBody(state)));
  });
  it('a comparison held for the same inputs (or drawn by the screen) is used, not re-run; a changed input re-runs', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const held = { comparison: { ...(comparison as object), headline: 6.37 } as never, key: routeCompareKey(routeCompareBody(state)) };
    await ensureReportRouteComparison({ ...args, have: held, fetchImpl: fakeFetch(200, { comparison }, seen) });
    await ensureReportRouteComparison({ ...args, have: { ...held, key: null }, fetchImpl: fakeFetch(200, { comparison }, seen) });
    expect(seen).toHaveLength(0);
    await ensureReportRouteComparison({ ...args, have: held, state: { ...state, region: 'UK' }, fetchImpl: fakeFetch(200, { comparison }, seen) });
    expect(seen).toHaveLength(1);
  });
  it('blocking questions, a server error, a timeout: one line saying why — never "not run"', async () => {
    const block = await ensureReportRouteComparison({ ...args, blockingOpen: ['Which process makes this part?'], fetchImpl: fakeFetch(200, { comparison }) });
    expect(block).toMatchObject({ comparison: null, note: ROUTES_NOTE.blocking(1, 'Which process makes this part?') });
    const err = await ensureReportRouteComparison({ ...args, fetchImpl: fakeFetch(500, { error: 'boom' }) });
    expect(err.note).toBe(ROUTES_NOTE.error('boom'));
    const hang = (async (_u: string, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof fetch;
    const slow = await ensureReportRouteComparison({ ...args, fetchImpl: hang, timeoutMs: 30 });
    expect(slow.note).toBe(ROUTES_NOTE.timeout(30));
    for (const n of [block.note, err.note, slow.note]) expect(n).not.toMatch(/not run/);
  });
  it('the core report prints the note in place of section 6a and the volume line', () => {
    const note = ROUTES_NOTE.error('boom');
    const m = buildCoreReport({ result, input, library: book, commodity: 'cast_and_machine', region: 'CN', cadMeta: { ...meta, routeComparisonNote: note } as never, fx: FX, sym: '¥' });
    expect(m.routes).toBeNull();
    expect(m.routesNote).toBe(note);
    const { text } = drawCore(m);
    const all = text.join('\n');
    expect(all).not.toMatch(/not run on this costing|volume ladder was not run|Run "Compare routes"/);
    expect(all).not.toMatch(/^Route Comparison$/m);
    expect(all).not.toMatch(/^Volume$/m);
    expect(text.filter(t => t.includes('the server could not cost the routes')).length).toBeGreaterThanOrEqual(2);
  });
});

// ─── The kernel, where OCP is installed ────────────────────────────────────────────────────────────────────────────────
describe('the kernel measures the slits (OCP only)', () => {
  it('Part1.stp: two 3 mm slits, 35 deep, 20 long; their walls are not in the face rows', () => {
    const step = join(PARTS_DIR, 'Part1.stp');
    let out = '';
    try { out = execFileSync('python3', [join(ROOT, 'server/utils/cad-geometry-engine.py'), step], { maxBuffer: 64 << 20, timeout: 280_000 }).toString(); }
    catch { console.log('[part1-phase3] no OCP kernel here — skipped'); return; }
    if (!existsSync(step) || !out.trim()) return;
    const g = JSON.parse(out) as OCCTGeometry;
    expect(g.slits).toHaveLength(2);
    for (const s of g.slits!) expect(s).toMatchObject({ widthMm: 3, depthMm: 35, lengthMm: 20, radiusMm: 1.5, sweepDeg: 180 });
    const faced = (g.featureTable ?? []).filter(x => x.kind === 'face').flatMap(x => x.faceIds ?? []);
    for (const id of g.slits!.flatMap(s => s.wallFaceIds)) expect(faced).not.toContain(id);
    expect(g.featureTable).toEqual(GEO.featureTable);
  }, 300_000);
});

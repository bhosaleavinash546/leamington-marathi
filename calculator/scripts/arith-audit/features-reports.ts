/**
 * Arithmetic audit — CROSS-COMMODITY FEATURES and REPORTS (30 Oct 2026, docs/review/arith-audit/features-reports.md).
 *
 * For six real parts of six commodities, recompute independently — WITHOUT calling computeUniversalStack — and compare
 * with what the product prints:
 *   A  the 8 buckets from trace.stackInput (overhead on material + process + labour + tooling, margin on the subtotal,
 *      bought-in carve-out) and every operation's £;
 *   B  the route comparison's own independent re-add (route-compare.ts::auditRow) against A;
 *   C  the country comparison rows (UK, India, Poland) against computeRegionalComparisonExact, and that fallback against
 *      the part costed through the whole chain in that country (what the screen prints);
 *   D  the Monte-Carlo band (zero-spread run reproduces the headline; band brackets the headline; its spreads are named);
 *   E  every ±10 % sensitivity driver, re-costed here;
 *   F  embodied carbon arithmetic;
 *   G  Design-to-Cost drivers (each driver's £ through the stack; they add to the headline);
 *   H  the quote teardown with a supplier quote EQUAL to the should-cost (every gap must be 0);
 *   I  the causal model's £ per 1 % index move against a 1 % move of the metal price re-costed here;
 *   J  the route comparison (reference row = headline, every row re-adds, programme spend, payback, crossovers);
 *   K  the PDF and Excel reports for two parts, every printed bucket and total read back from the files.
 *
 *   npx tsx scripts/arith-audit/features-reports.ts [dumpDir] [--no-routes] [--no-reports]
 *
 * Exit 1 on any FAIL.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, toolroomFactorFor, REGIONAL_DATA, computeRegionalComparison, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { computeRegionalComparisonExact } from '../../src/engine/regional-comparison.js';
import { computeCostUncertainty, UNCERTAINTY_BASIS } from '../../src/engine/uncertainty.js';
import { runSensitivity } from '../../src/engine/sensitivity.js';
import { computeCarbon, gridCarbon } from '../../src/engine/carbon.js';
import { costDrivers } from '../../src/engine/design-to-cost.js';
import { analyzeQuote } from '../../src/engine/quote-teardown.js';
import { analyzeDetailedQuote, type PartDetail } from '../../src/engine/quote-teardown-detailed.js';
import { buildCausalModel, metalCostOf } from '../../src/engine/causal-model.js';
import { compareRoutes, auditRow } from '../../server/services/route-compare.js';
import { costMeasuredPart, type BulkPartResult } from '../../server/services/bulk-run.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { UniversalStackInput, RateLibrary, PartCostResult, Breakdown8Bucket } from '../../src/engine/types.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const args = process.argv.slice(2);
const DUMP = args.find(a => !a.startsWith('--'))
  ?? '/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/arith-dump';
const NO_ROUTES = args.includes('--no-routes');
const NO_REPORTS = args.includes('--no-reports');
const OUT = join(DUMP, 'features-reports');
mkdirSync(OUT, { recursive: true });

export const PARTS = ['FORGE_Hub_Flange', 'PRCR002', 'IM_ECU_Cover', 'Seat_Locking_Bracket', 'AL_Battery_Rail', 'COMP_Hat_Stiffener'];
const REPORT_PARTS = ['FORGE_Hub_Flange', 'IM_ECU_Cover'];
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

let pass = 0, fail = 0;
const failures: string[] = [];
function check(part: string, what: string, mine: number, theirs: number, tol = 0.005): boolean {
  const ok = Number.isFinite(mine) && Number.isFinite(theirs) && Math.abs(mine - theirs) <= tol;
  if (ok) pass++; else { fail++; failures.push(`${part} · ${what}: mine ${mine} v product ${theirs}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what.padEnd(70)} ${fmt(mine)}  v  ${fmt(theirs)}`);
  return ok;
}
function truth(part: string, what: string, ok: boolean, detail = ''): boolean {
  if (ok) pass++; else { fail++; failures.push(`${part} · ${what}${detail ? ` — ${detail}` : ''}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
const info = (s: string) => console.log(`  info  ${s}`);
/** A defect found here whose fix is PROPOSED (outside this group's files): printed, counted apart, not a FAIL of this script. */
let opened = 0;
const openItems: string[] = [];
function proposed(part: string, what: string, ok: boolean, detail: string, id: string): void {
  if (ok) { pass++; console.log(`  PASS  ${what}`); return; }
  opened++; openItems.push(`${part} · ${what} — ${detail} [${id}]`);
  console.log(`  OPEN  ${what} — ${detail} [PROPOSED ${id}]`);
}
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : String(n)).padStart(12);

// ── A. The 8 buckets, recomputed here (the stack's definition, written out — no engine call) ─────────────────────────
export interface MyStack {
  metal: number; consumables: number; energy: number; boughtIn: number; material: number;
  ops: Array<{ process: number; labour: number }>;
  process: number; labour: number; tooling: number; packaging: number; logistics: number;
  base: number; overhead: number; subtotal: number; margin: number; total: number;
}
export function myStack(si: UniversalStackInput, lib: RateLibrary): MyStack {
  const rm = si.rawMaterial;
  let metal: number;
  if (rm.directCost !== undefined) metal = rm.directCost;
  else {
    const m = lib.materials.find(x => x.id === rm.materialId)!;
    const gross = rm.netWeightKg / rm.materialUtilization;
    const ov = rm.scrapRecoveryPricePerKgOverride;
    const sp = ov !== undefined && ov >= 0 ? ov : m.scrapRecoveryPricePerKg;
    metal = gross * m.pricePerKg - (rm.lossIsNotScrap ? 0 : (gross - rm.netWeightKg) * sp);
  }
  const consumables = rm.consumablesCostPerPart && rm.consumablesCostPerPart > 0 ? rm.consumablesCostPerPart : 0;
  const t = lib.energy[0];
  const energy = (rm.energyKwh?.gas ?? 0) * (t?.gasPerKwh ?? 0) + (rm.energyKwh?.electricity ?? 0) * (t?.electricityPerKwh ?? 0);
  const boughtIn = Math.max(0, rm.boughtIn?.cost ?? 0);
  const material = metal + consumables + energy + boughtIn;
  const ops = si.operations.map(op => {
    const mr = lib.machines.find(x => x.id === op.machineId)!.computedRatePerHr;
    const lr = lib.labour.find(x => x.id === op.labourId)!.fullyLoadedRatePerHr;
    return { process: mr * op.cycleTimeHr / op.partsPerCycle / op.oee, labour: lr * op.manning * op.labourTimeHr / op.partsPerCycle / op.labourEfficiency };
  });
  const process = ops.reduce((s, o) => s + o.process, 0);
  const labour = ops.reduce((s, o) => s + o.labour, 0);
  const tooling = si.tooling.mode === 'amortized' ? si.tooling.totalToolingCost / si.tooling.amortizationVolume : 0;
  const base = material + process + labour + tooling - boughtIn;
  const overhead = si.overheadPct * base + boughtIn * Math.max(0, rm.boughtIn?.handlingPct ?? 0);
  const subtotal = material + process + labour + tooling + si.packagingPerPart + si.logisticsPerPart + overhead;
  const margin = si.marginPct * (subtotal - boughtIn);
  return { metal, consumables, energy, boughtIn, material, ops, process, labour, tooling, packaging: si.packagingPerPart,
    logistics: si.logisticsPerPart, base, overhead, subtotal, margin, total: subtotal + margin };
}
const BUCKETS: Array<keyof Breakdown8Bucket> = ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'];
const mineBucket = (s: MyStack, k: keyof Breakdown8Bucket) => (k === 'rawMaterial' ? s.material : s[k]);

interface Dump extends BulkPartResult { part: string; answers: Record<string, unknown> }

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (part: string) => baseline.find(p => p.part.replace(/\.(stp|step)$/i, '') === part)?.geometry;

async function costIn(part: string, d: Dump, region: ManufacturingRegion): Promise<BulkPartResult> {
  const spec = ANSWERS[d.part];
  return costMeasuredPart(geoOf(part)!, d.part,
    { partNumber: d.part, file: d.part, annualVolume: 50_000, ...(spec?.commodity ? { commodity: spec.commodity } : {}) },
    { ...(spec?.answers ?? d.answers) }, region, { annualVolume: 50_000, programmeYears: 5 }, book, { partNumber: d.part, file: d.part, status: 'error' });
}

/** What main.ts::buildPartDetail hands the negotiation tab (copied, with the packaging / logistics / bought-in it now carries). */
function partDetailOf(res: PartCostResult, si: UniversalStackInput, commodity: string, withShop: boolean): PartDetail {
  const rm = si.rawMaterial;
  const tr = (f: string) => res.traceability.find(t => t.field === f)?.value ?? 0;
  return {
    commodity,
    material: { grade: rm.materialId, directMode: rm.directCost !== undefined, netWeightKg: rm.netWeightKg ?? 0, utilization: rm.materialUtilization ?? 1,
      pricePerKg: tr('material.pricePerKg'), scrapRecoveryPerKg: tr('material.scrapRecoveryPricePerKg'), consumablesPerPart: rm.consumablesCostPerPart ?? 0,
      materialCost: res.breakdown.rawMaterial },
    operations: res.operationDetails.map(o => ({ name: o.operationName, cycleTimeHr: o.cycleTimeHr, machineRate: o.machineRateUsed, partsPerCycle: o.partsPerCycle,
      oee: o.oee, labourTimeHr: o.labourTimeHr, labourRate: o.labourRateUsed, manning: o.manning, labourEfficiency: o.labourEfficiency,
      processCost: o.processCost, labourCost: o.labourCost })),
    toolingPerPart: res.breakdown.tooling, toolingTotal: si.tooling.totalToolingCost, amortVolume: si.tooling.amortizationVolume,
    overheadPct: si.overheadPct, marginPct: si.marginPct, annualVolume: si.annualVolume, total: res.total,
    ...(withShop ? { packagingPerPart: si.packagingPerPart, logisticsPerPart: si.logisticsPerPart,
      boughtInGBP: Math.max(0, rm.boughtIn?.cost ?? 0), boughtInHandlingPct: rm.boughtIn?.handlingPct ?? 0 } : {}),
  };
}

function pdfText(file: string): string {
  return execFileSync('python3', ['-I', '-c',
    'import sys, pymupdf\nd = pymupdf.open(sys.argv[1])\nprint("\\n".join(p.get_text("text") for p in d))', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

const summary: Array<Record<string, unknown>> = [];

for (const part of PARTS) {
  const d = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8')) as Dump;
  const si = d.trace!.stackInput as UniversalStackInput;
  const res = d.trace!.result as PartCostResult;
  const commodity = String(d.commodity);
  console.log(`\n═══ ${part}  (${commodity})  headline £${res.total.toFixed(4)}`);
  const mine = myStack(si, book);
  const row: Record<string, unknown> = { part, commodity, total: res.total };

  // ── A ──
  console.log(' A  8 buckets and every operation, recomputed from trace.stackInput');
  si.operations.forEach((op, k) => {
    check(part, `op ${k + 1} process £ (${op.operationName.slice(0, 28)})`, mine.ops[k].process, res.operationDetails[k].processCost, 0.00005);
    check(part, `op ${k + 1} labour £`, mine.ops[k].labour, res.operationDetails[k].labourCost, 0.00005);
  });
  for (const k of BUCKETS) check(part, `bucket ${k}`, mineBucket(mine, k), res.breakdown[k]);
  check(part, 'overhead base (material + process + labour + tooling − bought-in)', mine.base, res.overheadBase ?? NaN);
  check(part, 'TOTAL', mine.total, res.total);
  check(part, 'dump total (4 dp) = trace total', d.total!, res.total, 0.0001);
  row.mine = mine.total;

  // ── B ──
  console.log(' B  route comparison\'s independent re-add (auditRow)');
  const a = auditRow(d);
  truth(part, 'auditRow closes', !!a?.closes, a?.lines.filter(l => !l.closes).map(l => l.line).join(', '));
  for (const ln of a?.lines ?? []) {
    const k = ({ 'Process (machines)': 'process', Labour: 'labour', Material: 'rawMaterial', Tooling: 'tooling', Packaging: 'packaging',
      Logistics: 'logistics', Overhead: 'overhead', Margin: 'margin' } as Record<string, keyof Breakdown8Bucket>)[ln.line];
    if (k) check(part, `auditRow ${ln.line} v this script`, ln.recomputed, Math.round(mineBucket(mine, k) * 10_000) / 10_000, 0.0001);
  }

  // ── C ──
  console.log(' C  country comparison — UK, India, Poland');
  const regions: ManufacturingRegion[] = ['UK', 'IN', 'PL'];
  const exact = computeRegionalComparisonExact(si, book, { regions, sourceRegion: 'UK', sourceResult: res });
  const linear = computeRegionalComparison(res.breakdown, { regions, sourceRegion: 'UK' });
  // The fallback's gap to the whole chain is measured on the part costed NOW in the UK (the dump may be stale).
  const ukNow = await costIn(part, d, 'UK');
  const exactNow = ukNow.trace ? computeRegionalComparisonExact(ukNow.trace.stackInput as UniversalStackInput, book,
    { regions, sourceRegion: 'UK', sourceResult: ukNow.trace.result as PartCostResult }) : [];
  for (const code of regions) {
    const rd = REGIONAL_DATA[code];
    const lib = code === 'UK' ? book : buildRegionalLibrary(book, code);
    const inR: UniversalStackInput = { ...si,
      tooling: { ...si.tooling, totalToolingCost: si.tooling.totalToolingCost * toolroomFactorFor(code) },
      // the overhead DEFAULT (12 %) goes to the country's default, 12 % × its multiplier rounded to a whole per cent
      overheadPct: Math.abs(si.overheadPct - 0.12) < 1e-9 ? Math.round(12 * rd.overheadMultiplier) / 100 : si.overheadPct * rd.overheadMultiplier, packagingPerPart: si.packagingPerPart * rd.packagingMultiplier,
      logisticsPerPart: si.logisticsPerPart * rd.logisticsMultiplier };
    const m = code === 'UK' ? mine : myStack(inR, lib);
    const er = exact.find(r => r.code === code)!;
    check(part, `${code} row total (stack re-priced in the ${code} book)`, m.total, er.total);
    check(part, `${code} row ex-works = material+process+labour+tooling+overhead`, er.material + er.process + er.labour + er.tooling + er.overhead, er.exWorks, 1e-9);
    check(part, `${code} row adds up (ex-works + packaging + logistics + margin)`, er.exWorks + er.packaging + er.logistics + er.margin, er.total, 1e-9);
    const ukTotal = exact.find(r => r.code === 'UK')!.total;
    check(part, `${code} vs-base %`, (ukTotal - er.total) / ukTotal * 100, er.vsBasePct, 1e-9);
    const lr = linear.find(r => r.code === code)!;
    if (code !== 'UK') {
      const full = await costIn(part, d, code);
      const fb = exactNow.find(r => r.code === code)?.total ?? NaN;
      const gap = full.total != null ? (fb / full.total - 1) * 100 : NaN;
      const lin = ukNow.breakdown ? computeRegionalComparison(ukNow.trace!.result!.breakdown as Breakdown8Bucket, { regions, sourceRegion: 'UK' }).find(r => r.code === code)!.total : lr.total;
      info(`${code} (UK costed now £${ukNow.total?.toFixed(4)}): stack re-price fallback £${fb.toFixed(4)} · whole chain in ${code} (what the screen prints) £${full.total?.toFixed(4) ?? full.status} · fallback off by ${gap.toFixed(1)} % · legacy linear scaling £${lin.toFixed(4)} (${((lin / (full.total ?? NaN) - 1) * 100).toFixed(1)} %)`);
      row[`${code}_fallback`] = fb; row[`${code}_chain`] = full.total; row[`${code}_linear`] = lin;
      const ohChain = (full.trace?.stackInput as UniversalStackInput | undefined)?.overheadPct;
      if (ohChain !== undefined) info(`${code}: overhead % — comparison fallback ${(inR.overheadPct * 100).toFixed(2)} % v the country costing ${(ohChain * 100).toFixed(2)} %`);
    }
  }

  // ── D ──
  console.log(' D  Monte-Carlo band');
  const zero = computeCostUncertainty(res, si, { baseCvOverride: 0 });
  check(part, 'zero-spread band P50 = headline (the band recomposes the stack exactly)', zero.p50, Math.round(res.total * 100) / 100, 0.0051);
  const prov = { netWeightKg: 'geometry_exact', materialUtilization: 'rule', cycleTimeHr: si.operations.map(() => 'rule'), toolingCost: 'rule', packaging: 'default', logistics: 'default' } as const;
  const u = computeCostUncertainty(res, si, { library: book, provenance: { ...prov, cycleTimeHr: [...prov.cycleTimeHr] } });
  truth(part, `band brackets the headline (P10 £${u.p10} ≤ £${res.total.toFixed(2)} ≤ P90 £${u.p90})`, u.p10 <= res.total && res.total <= u.p90);
  check(part, '± % = (P90 − P10) / 2 ÷ headline', Math.round((u.p90 - u.p10) / 2 / res.total * 1000) / 10, u.plusMinusPct, 0.11);
  truth(part, 'the band\'s spreads are printed with it (UNCERTAINTY_BASIS names every CV and says not sourced)',
    /0\.01/.test(UNCERTAINTY_BASIS) && /0\.25/.test(UNCERTAINTY_BASIS) && /not sourced/i.test(UNCERTAINTY_BASIS));
  row.band = `${u.p10}–${u.p90} (±${u.plusMinusPct}%)`;

  // ── E ──
  console.log(' E  sensitivity ±10 % — every driver re-costed here');
  const sens = runSensitivity(si, book, 10);
  const vary = (param: string, f: number): { inp: UniversalStackInput; lib: RateLibrary } | null => {
    let mm: RegExpMatchArray | null;
    const ops = si.operations;
    if (param === 'rawMaterial → pricePerKg') return { inp: si, lib: { ...book, materials: book.materials.map(x => x.id === si.rawMaterial.materialId ? { ...x, pricePerKg: x.pricePerKg * f } : x) } };
    if (param === 'rawMaterial.materialUtilization') return { inp: { ...si, rawMaterial: { ...si.rawMaterial, materialUtilization: Math.min(1, si.rawMaterial.materialUtilization * f) } }, lib: book };
    if (param === 'rawMaterial.directCost') return { inp: { ...si, rawMaterial: { ...si.rawMaterial, directCost: si.rawMaterial.directCost! * f } }, lib: book };
    if (param === 'rawMaterial.netWeightKg') return { inp: { ...si, rawMaterial: { ...si.rawMaterial, netWeightKg: si.rawMaterial.netWeightKg * f } }, lib: book };
    if ((mm = param.match(/^operations\[(\d+)\]\.machineId/))) { const id = ops[+mm[1]].machineId; return { inp: si, lib: { ...book, machines: book.machines.map(x => x.id === id ? { ...x, computedRatePerHr: x.computedRatePerHr * f } : x) } }; }
    if ((mm = param.match(/^operations\[(\d+)\]\.labourId/))) { const id = ops[+mm[1]].labourId; return { inp: si, lib: { ...book, labour: book.labour.map(x => x.id === id ? { ...x, fullyLoadedRatePerHr: x.fullyLoadedRatePerHr * f } : x) } }; }
    if ((mm = param.match(/^operations\[(\d+)\]\.cycleTimeHr/))) { const i = +mm[1]; return { inp: { ...si, operations: ops.map((o, j) => j === i ? { ...o, cycleTimeHr: o.cycleTimeHr * f, labourTimeHr: o.labourTimeHr * f } : o) }, lib: book }; }
    if ((mm = param.match(/^operations\[(\d+)\]\.partsPerCycle/))) { const i = +mm[1]; return { inp: { ...si, operations: ops.map((o, j) => j === i ? { ...o, partsPerCycle: Math.max(1, Math.round(o.partsPerCycle * f)) } : o) }, lib: book }; }
    if (param === 'overheadPct') return { inp: { ...si, overheadPct: si.overheadPct * f }, lib: book };
    if (param === 'marginPct') return { inp: { ...si, marginPct: si.marginPct * f }, lib: book };
    if (param === 'tooling.totalToolingCost') return { inp: { ...si, tooling: { ...si.tooling, totalToolingCost: si.tooling.totalToolingCost * f } }, lib: book };
    if (param === 'tooling.amortizationVolume') return { inp: { ...si, tooling: { ...si.tooling, amortizationVolume: si.tooling.amortizationVolume * f } }, lib: book };
    return null;
  };
  for (const dr of sens.drivers) {
    const p = vary(dr.parameter, 1.1), m = vary(dr.parameter, 0.9);
    if (!p || !m) { truth(part, `sensitivity driver understood: ${dr.parameter}`, false); continue; }
    check(part, `+10 % ${dr.driver.slice(0, 50)}`, myStack(p.inp, p.lib).total, dr.plusCost, 0.0005);
    check(part, `−10 % ${dr.driver.slice(0, 50)}`, myStack(m.inp, m.lib).total, dr.minusCost, 0.0005);
  }
  info(`top movers: ${sens.drivers.slice(0, 5).map(x => `${x.driver.slice(0, 40)} ±${(x.range / 2).toFixed(3)}`).join(' | ')}`);
  const flat = sens.drivers.filter(x => x.range < 1e-9);
  if (flat.length) info(`drivers printed as ±10 % that do not move the cost: ${flat.map(x => x.driver).join('; ')}`);

  // ── F ──
  console.log(' F  embodied carbon');
  if (si.rawMaterial.netWeightKg > 0) {
    const cb = computeCarbon({ result: res, input: si, library: book, commodity, region: 'UK' });
    const net = si.rawMaterial.netWeightKg, gross = net / (si.rawMaterial.materialUtilization || 1);
    const mat = book.materials.find(x => x.id === si.rawMaterial.materialId);
    const credit = mat && mat.scrapRecoveryPricePerKg > 0 ? 0.85 : 0;
    check(part, 'carbon material = factor × (gross − 85 % of scrap)', Math.round(cb.materialFactorKgPerKg * (gross - (gross - net) * credit) * 100) / 100, cb.materialKgCO2e, 0.0051);
    check(part, 'carbon process = kWh/kg × gross × grid', Math.round(cb.processKwh / gross * 100) / 100 * gross * gridCarbon('UK'), cb.processKgCO2e, 0.02);
    check(part, 'carbon total = material + process + logistics', cb.materialKgCO2e + cb.processKgCO2e + cb.logisticsKgCO2e, cb.totalKgCO2e, 0.0151);
    truth(part, 'carbon notes state the scrap credit share when one is applied', !(credit > 0 && gross > net) || cb.notes.some(n => /85\s?%/.test(n)));
    const costingKwh = (si.rawMaterial.energyKwh?.electricity ?? 0) + (si.rawMaterial.energyKwh?.gas ?? 0);
    info(`carbon process ${cb.processKwh} kWh (commodity intensity) v the costing's own energy line ${costingKwh.toFixed(3)} kWh — the PDF says it is not the costing's energy line`);
    row.carbon = cb.totalKgCO2e;
  } else info('no material weight — carbon not printed (PDF skips §10)');

  // ── G ──
  console.log(' G  Design-to-Cost drivers');
  const drv = costDrivers(si, book, res.total * 0.9);
  check(part, 'DtC drivers add up to the headline', drv.reduce((s, x) => s + x.stackGBP, 0), res.total, 0.001);
  const thru = (1 + si.overheadPct) * (1 + si.marginPct);
  for (const x of drv) {
    let own: number | null = null;
    if (x.id === 'material') own = (mine.metal + mine.energy) * thru;
    else if (x.id === 'consumables') own = mine.consumables * thru;
    else if (x.id === 'tooling') own = mine.tooling * thru;
    else if (x.id === 'packaging') own = mine.packaging * (1 + si.marginPct);
    else if (x.id === 'logistics') own = mine.logistics * (1 + si.marginPct);
    else if (x.id.startsWith('op:')) { const o = mine.ops[+x.id.slice(3)]; own = (o.process + o.labour) * thru; }
    if (own !== null) check(part, `DtC driver ${x.label.slice(0, 40)} £ through the stack`, own, x.stackGBP, 0.0002);
  }

  // ── H ──
  console.log(' H  quote teardown with a quote EQUAL to the should-cost');
  for (const withShop of [true, false]) {
    const pd = partDetailOf(res, si, commodity, withShop);
    const same = { material: { netWeightKg: pd.material.netWeightKg, utilization: pd.material.utilization, pricePerKg: pd.material.pricePerKg, consumablesPerPart: pd.material.consumablesPerPart },
      operations: pd.operations.map(o => ({ name: o.name, cycleTimeHr: o.cycleTimeHr, machineRate: o.machineRate, partsPerCycle: o.partsPerCycle, oee: o.oee,
        labourTimeHr: o.labourTimeHr, labourRate: o.labourRate, manning: o.manning, labourEfficiency: o.labourEfficiency })),
      toolingPerPart: pd.toolingPerPart, overheadPct: pd.overheadPct, marginPct: pd.marginPct };
    const dt = analyzeDetailedQuote(pd, pd.material.directMode ? { ...same, material: { materialCost: pd.material.materialCost } } : same);
    if (withShop) {
      const tag = 'detail with packaging / logistics, as main.ts would pass them';
      check(part, `detailed teardown our total = headline (${tag})`, dt.ourTotal, Math.round(res.total * 100) / 100, 0.03);
      check(part, `detailed teardown our margin = costing margin (${tag})`, dt.margin.ourGBP, Math.round(res.breakdown.margin * 100) / 100, 0.011);
      check(part, `detailed teardown margin gap on an identical quote (${tag})`, dt.margin.gapGBP, 0, 0.011);
    } else {
      truth(part, 'a detail without packaging / logistics says so (shopBasis "missing")', dt.shopBasis === 'missing');
      // P1 applied by the lead: main.ts::buildPartDetail now passes the costing's packaging, logistics and bought-in.
      const mainSrc = readFileSync(new URL('../../src/ui/main.ts', import.meta.url), 'utf8');
      const body = mainSrc.slice(mainSrc.indexOf('function buildPartDetail('), mainSrc.indexOf('function buildPartDetail(') + 2500);
      truth(part, 'main.ts::buildPartDetail passes packaging, logistics and bought-in (P1 applied)',
        /packagingPerPart: input\.packagingPerPart/.test(body) && /logisticsPerPart: input\.logisticsPerPart/.test(body) && /boughtInGBP/.test(body));
    }
  }
  const q = analyzeQuote({ commodity, shouldCost: res.total, shouldBreakdown: res.breakdown, supplierQuoteGBP: res.total, supplierBreakdown: { ...res.breakdown }, annualVolume: 50_000 });
  check(part, 'summary teardown: identical quote → price variance 0', q.verdict.ppvGBP, 0, 0.005);
  truth(part, 'summary teardown: identical quote → no lever claims money', q.levers.every(l => l.expectedRecoveryGBP === 0), q.levers.map(l => `${l.area} £${l.expectedRecoveryGBP}`).join(', '));
  const low = analyzeQuote({ commodity, shouldCost: res.total, shouldBreakdown: res.breakdown, supplierQuoteGBP: res.total * 0.7, annualVolume: 50_000 });
  truth(part, 'a quote 30 % BELOW should-cost is not called "competitive; hold"', !/competitive; hold/.test(low.headline), low.headline);
  const flags = analyzeQuote({ commodity, shouldCost: res.total, shouldBreakdown: res.breakdown, supplierQuoteGBP: res.total * 1.2,
    supplierBreakdown: { ...res.breakdown, overhead: res.breakdown.overhead + res.total * 0.2 }, annualVolume: 50_000 });
  truth(part, 'a benchmark flag says its range is a heuristic, not a sourced norm', flags.benchmarkFlags.every(f => /heuristic/i.test(f) && !/\bnorm\b/.test(f)), flags.benchmarkFlags.join(' | '));
  const attr = analyzeQuote({ commodity, shouldCost: res.total, shouldBreakdown: res.breakdown, supplierQuoteGBP: res.total * 1.2, annualVolume: 50_000 });
  truth(part, 'an attributed recovery says it is apportioned, not measured', attr.levers.every(l => l.expectedRecoveryGBP === 0 || /apportioned/i.test(l.lever)), attr.levers.map(l => l.lever.slice(-80)).join(' | '));

  // ── I ──
  console.log(' I  causal model: £ per 1 % index move');
  const fam = book.materials.find(x => x.id === si.rawMaterial.materialId)?.category;
  if (si.rawMaterial.directCost === undefined) {
    const up = myStack(si, { ...book, materials: book.materials.map(x => x.id === si.rawMaterial.materialId ? { ...x, pricePerKg: x.pricePerKg * 1.01, scrapRecoveryPricePerKg: x.scrapRecoveryPricePerKg * 1.01 } : x) }).total - mine.total;
    const asWired = buildCausalModel({ partTotal: res.total, materialCostGBP: res.breakdown.rawMaterial, materialFamily: fam, overheadPct: 0.12, marginPct: 0.08, indices: [{ category: 'Steel' }, { category: 'Aluminium' }, { category: 'Copper' }] });
    const fixed = buildCausalModel({ partTotal: res.total, materialCostGBP: metalCostOf(res, si), materialFamily: fam, overheadPct: si.overheadPct, marginPct: si.marginPct, indices: [{ category: 'Steel' }, { category: 'Aluminium' }, { category: 'Copper' }] });
    if (asWired.driver && fixed.driver) {
      info(`as main.ts wires it today (whole material bucket, 12 % / 8 %): £${asWired.driver.gbpPer1pctIndex.toFixed(4)} per 1 % — re-costed metal +1 %: £${up.toFixed(4)} (${((asWired.driver.gbpPer1pctIndex / up - 1) * 100).toFixed(1)} % off)`);
      check(part, 'causal £ per 1 % on the metal line (metalCostOf) = re-costed', fixed.driver.gbpPer1pctIndex, up, 0.0005);
    } else info(`no index for family "${fam}" — causal model silent`);
  } else info('material priced directly — no index elasticity');

  summary.push(row);
}

// ── J. Route comparison ──────────────────────────────────────────────────────────────────────────────────────────────
if (!NO_ROUTES) {
  for (const part of PARTS) {
    const d = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8')) as Dump;
    const si = d.trace!.stackInput as UniversalStackInput;
    const geo = geoOf(part);
    if (!geo) { info(`${part}: no geometry`); continue; }
    console.log(`\n═══ J  route comparison — ${part}`);
    const t0 = Date.now();
    const cmp = await compareRoutes({ geo, filename: d.part, current: String(d.commodity), answers: { ...(ANSWERS[d.part]?.answers ?? d.answers) },
      region: 'UK', annualVolume: 50_000, programmeYears: 5, baseBook: book });
    info(`${cmp.rows.length} rows, ${cmp.excluded.length} excluded, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    writeFileSync(join(OUT, `${part}.routes.json`), JSON.stringify(cmp, null, 1));
    const ref = cmp.rows[0];
    // against the part costed NOW (another auditor's fix may have moved it since the dump was written)
    const now = await costIn(part, d, 'UK');
    if (Math.abs((now.total ?? 0) - d.total!) > 0.0001) info(`the dump is stale for this part: dump £${d.total} v costed now £${now.total}`);
    check(part, 'reference row = the headline (costed now)', ref.total ?? NaN, Math.round((now.total ?? NaN) * 10_000) / 10_000, 0.0001);
    for (const r of cmp.rows) {
      if (r.status !== 'costed') { info(`${r.label}: ${r.status} ${r.refusal ?? r.openQuestions.join('; ')}`); continue; }
      truth(part, `row "${r.label}" re-adds (auditRow closes)`, !!r.audit?.closes, r.audit?.lines.filter(l => !l.closes).map(l => `${l.line} ${l.recomputed} v ${l.reported}`).join(', '));
      check(part, `row "${r.label}" buckets add to its total`, Object.values(r.breakdown!).reduce((s, v) => s + v, 0), r.total!, 0.0006);
      if (r.programme && r.tooling) {
        const thru = (1 + si.overheadPct) * (1 + si.marginPct);
        const ex = r.total! - r.toolingPerPart! * thru;
        check(part, `row "${r.label}" piece price ex-tooling = total − tooling × (1+OH)(1+margin)`, r.programme.pieceExTooling, Math.round(ex * 10_000) / 10_000, 0.0002);
        check(part, `row "${r.label}" programme spend = piece ex-tooling × parts + tooling`, r.programme.total, Math.round((r.programme.pieceExTooling * r.programme.parts + r.tooling.investment) * 100) / 100, 0.02 + r.programme.parts * 0.00005);
      }
      if (r.band && r.total != null) truth(part, `row "${r.label}" band brackets its total`, r.band.p10 <= r.total && r.total <= r.band.p90, `${r.band.p10}–${r.band.p90} v ${r.total}`);
    }
    for (const x of cmp.crossovers) {
      const row = cmp.rows.find(r => r.route === x.route && r.process === x.process)!;
      const pts = cmp.ladder.map(v => ({ v, a: row.byVolume.find(p => p.volume === v)?.total, b: ref.byVolume.find(p => p.volume === v)?.total }))
        .filter(p => p.a != null && p.b != null).map(p => ({ v: p.v, dd: p.a! - p.b! }));
      let at: number | null = null;
      for (let k = 1; k < pts.length; k++) {
        const p0 = pts[k - 1], p1 = pts[k];
        if ((p0.dd < 0 && p1.dd > 0) || (p0.dd > 0 && p1.dd < 0) || p1.dd === 0) { at = Math.round(p1.dd === 0 ? p1.v : p0.v + (p1.v - p0.v) * (-p0.dd) / (p1.dd - p0.dd)); break; }
      }
      check(part, `crossover "${x.label}" volume (interpolated here)`, at ?? -1, x.atVolume ?? -1, 1);
      if (x.payback) {
        const thru = (1 + si.overheadPct) * (1 + si.marginPct);
        const saving = (ref.total! - ref.toolingPerPart! * thru) - (row.total! - row.toolingPerPart! * thru);
        check(part, `payback "${x.label}" piece saving ex-tooling`, x.payback.pieceSaving, Math.round(saving * 10_000) / 10_000, 0.0002);
      }
      info(`${x.label}: ${x.text}`);
    }
  }
}

// ── K. Reports ───────────────────────────────────────────────────────────────────────────────────────────────────────
if (!NO_REPORTS) {
  const { jsPDF } = await import('jspdf');
  const { printPDF } = await import('../../src/export/pdf.js');
  const { exportToExcelBlob } = await import('../../src/export/excel.js');
  const ExcelJS = (await import('exceljs')).default;
  for (const part of REPORT_PARTS) {
    const d = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8')) as Dump;
    const si = d.trace!.stackInput as UniversalStackInput;
    const res = d.trace!.result as PartCostResult;
    console.log(`\n═══ K  reports — ${part}`);
    const prov = { netWeightKg: 'geometry_exact' as const, materialUtilization: 'rule' as const, cycleTimeHr: si.operations.map(() => 'rule' as const), toolingCost: 'rule' as const, packaging: 'default' as const, logistics: 'default' as const };
    const u = computeCostUncertainty(res, si, { library: book, provenance: prov });
    let pdfBytes: ArrayBuffer | null = null;
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const orig = api.save;
    api.save = function (this: InstanceType<typeof jsPDF>) { pdfBytes = this.output('arraybuffer'); return this; };
    try {
      printPDF(res, si, book, 'GBP', 1, d.commodity as never, null, 'UK', [], { geometrySource: 'occt', annualVolume: 50_000, uncertainty: u, uncertaintyBasis: UNCERTAINTY_BASIS }, book);
    } finally { api.save = orig; }
    const pdfFile = join(OUT, `${part}.pdf`);
    writeFileSync(pdfFile, Buffer.from(pdfBytes!));
    const text = pdfText(pdfFile).replace(/\s+/g, ' ');
    writeFileSync(join(OUT, `${part}.pdf.txt`), text);
    const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    truth(part, `PDF prints the headline ${money(res.total)}`, text.includes(money(res.total)));
    for (const k of BUCKETS) truth(part, `PDF prints bucket ${k} ${money(res.breakdown[k])}`, text.includes(money(res.breakdown[k])));
    truth(part, `PDF prints the band P10 ${money(u.p10)} / P90 ${money(u.p90)}`, text.includes(money(u.p10)) && text.includes(money(u.p90)));
    truth(part, 'PDF §7 states the band\'s spreads (engineering-typical, not sourced)', /not sourced/i.test(text.slice(text.indexOf('§7'), text.indexOf('§7') + 1500)));
    const rc = computeRegionalComparisonExact(si, book, { sourceRegion: 'UK', sourceResult: res });
    for (const r of rc.filter(x => ['UK', 'IN', 'PL'].includes(x.code))) truth(part, `PDF §9 prints ${r.code} ${money(r.total)}`, text.includes(money(r.total)));
    for (const w of ['typical', 'industry', 'benchmark', 'norm ', 'average', 'saves', 'world-class', 'best practice']) {
      const hits = [...text.matchAll(new RegExp(`.{0,70}${w}.{0,70}`, 'gi'))].map(m => m[0]);
      if (hits.length) info(`PDF "${w}" ×${hits.length}: ${hits.slice(0, 3).map(h => `«${h.trim()}»`).join(' ')}`);
    }

    const blob = await exportToExcelBlob(res, si, book, 'GBP', 1, null, { plusMinusPct: u.plusMinusPct, p10: u.p10, p90: u.p90, overallConfidence: u.overallConfidence });
    const xlsx = Buffer.from(await blob.arrayBuffer());
    const xlsxFile = join(OUT, `${part}.xlsx`);
    writeFileSync(xlsxFile, xlsx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx);
    const s1 = wb.worksheets[0];
    const cells: Array<[string, number]> = [];
    s1.eachRow(r => { const lab = String(r.getCell(1).value ?? ''); const v = r.getCell(2).value; if (typeof v === 'number') cells.push([lab, v]); });
    const byLabel = (re: RegExp) => cells.find(([l]) => re.test(l))?.[1];
    const xl: Array<[keyof Breakdown8Bucket, RegExp]> = [['rawMaterial', /^1\./], ['process', /^2\./], ['labour', /^3\./], ['tooling', /^4\./], ['packaging', /^5\./], ['logistics', /^6\./], ['overhead', /^7\./], ['margin', /^8\./]];
    let re = 0;
    for (const [k, rx] of xl) { const v = byLabel(rx); re += v ?? NaN; check(part, `Excel sheet 1 bucket ${k}`, v ?? NaN, res.breakdown[k], 0.0051); }
    const tot = byLabel(/^TOTAL SHOULD COST/i);
    check(part, 'Excel sheet 1 total', tot ?? NaN, res.total, 0.0051);
    check(part, 'Excel buckets re-added = its total', re, tot ?? NaN, 0.03);
    info(`Excel sheets: ${wb.worksheets.map(w => w.name).join(', ')}`);
  }
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`\n${pass} PASS · ${fail} FAIL · ${opened} OPEN (fix proposed outside this group's files)`);
if (opened) console.log(openItems.map(f => `  OPEN ${f}`).join('\n'));
if (fail) { console.log(failures.map(f => `  FAIL ${f}`).join('\n')); process.exit(1); }

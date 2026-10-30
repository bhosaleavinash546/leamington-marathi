/**
 * Arithmetic audit — CASTING and CAST + MACHINE (30 Oct 2026). An independent shadow model.
 *
 *   npx tsx scripts/arith-audit/casting.ts            # PASS / FAIL per check, exit 1 on any FAIL
 *   npx tsx scripts/arith-audit/casting.ts --verbose  # also print every value compared
 *
 * For each real part it runs the product's headless chain (`costMeasuredPart`, UK, 50,000 a year, 5-year
 * programme, the baseline's answers — exactly what scripts/arith-audit/dump.ts records) and then recomputes, from
 * the RECORDED GEOMETRY, the RATE BOOK and the ANSWERS only, every casting rule input, every operation's time and £,
 * the material line, the per-part services, the tooling and its amortisation, and the eight buckets. It does NOT call
 * the casting module, the casting / cast + machine rules or the casting tooling estimator: the arithmetic is written
 * out again below from the stated bases (the constants it uses are the ones each basis line prints — this checks
 * that the arithmetic printed is the arithmetic done, not that the constants are right; see the write-up's register).
 *
 * The machining half's operation TIMES (machining-time.ts / rules/machining.ts) belong to the machining auditor: they
 * are taken from the costing as inputs here, and only their £ and the cast + machine plumbing are recomputed.
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { TOOLROOM_RATES_UK, TOOL_MATERIAL_GBP_PER_KG, SHOP_OVERHEAD_PROFIT } from '../../src/engine/toolmaking.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const verbose = process.argv.includes('--verbose');

const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machineRate = (id: string) => (book.machines.find(m => m.id === id) as { computedRatePerHr: number }).computedRatePerHr;
const labourRate = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const material = (id: string) => book.materials.find(m => m.id === id)!;
const tariff = book.energy[0];

// ── The stated constants, as each basis line prints them (the register in casting.md says where each lives) ──
const ANNUAL = 50_000, YEARS = 5, AMORT = ANNUAL * YEARS;
const REJECT = 0.03, OEE = 0.8, LAB_EFF = 0.92;               // SHOP_DEFAULTS (to-cost-params.ts)
const OVERHEAD = 0.12, MARGIN = 0.08;
const YIELD_BAND: Record<string, [number, number]> = { steel: [0.45, 0.60], 'ductile-iron': [0.55, 0.70] };
const MELT: Record<string, { loss: number; kwh: number }> = { steel: { loss: 0.03, kwh: 0.70 }, 'ductile-iron': { loss: 0.03, kwh: 0.62 } };
const MELT_LABOUR_H_PER_T = 1.5, GREEN_SAND_GBP_PER_KG = 0.01;
const MOULDS_PER_HR = 30, FLASK = [500, 400], MARGIN_MM = 50, LINE_CREW = 4;
const FETTLE_MEDIUM_MIN = 6;
const HT_GBP_PER_KG: Record<string, number> = { steel: 0.35, 'ductile-iron': 0 };   // steel normalise; iron as-cast
const BLAST_KG_PER_HR = 600, BLAST_MIN = 0.10;
const NDT_MPI = { sec: 75, manning: 1, bench: 4, sampleXray: 0.02, xray: 5 };
const PATTERN_LIFE_MOULDS = 8_000;
const STOCK_MM = 3, DRILLED_FROM_SOLID_MM = 20;                // sand, ferrous: ISO 8062-3 RMA typical (stated)
const TURNED_MIN_CM2 = 20, TURNED_MIN_SHARE = 0.08;

interface Case { part: string; commodity: 'cast_and_machine' | 'casting'; alloy: 'steel' | 'ductile-iron'; safety: boolean }
const CASES: Case[] = [
  { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', alloy: 'steel', safety: false },
  { part: 'Casting_Braket.stp', commodity: 'casting', alloy: 'steel', safety: false },
  { part: 'PRCR002.stp', commodity: 'cast_and_machine', alloy: 'ductile-iron', safety: true },
];

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, got: number, want: number, opts: { abs?: number; rel?: number } = {}) {
  const abs = opts.abs ?? 0.005, rel = opts.rel;
  const d = Math.abs(got - want);
  const ok = rel != null ? d <= Math.abs(want) * rel + 1e-9 : d <= abs + 1e-9;
  if (ok) pass++; else { fail++; failures.push(label); }
  if (verbose || !ok) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} product ${got.toFixed(6).padStart(14)}  shadow ${want.toFixed(6).padStart(14)}`);
}
const r0 = (x: number) => Math.round(x);

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;

for (const c of CASES) {
  const rec = base.find(p => p.part === c.part)!;
  const geo = rec.geometry as OCCTGeometry & Record<string, any>;
  const spec = ANSWERS[c.part];
  const res = await costMeasuredPart(geo, c.part,
    { partNumber: c.part, file: c.part, annualVolume: ANNUAL, commodity: c.commodity } as never,
    spec.answers, 'UK', { annualVolume: ANNUAL, programmeYears: YEARS } as never, book,
    { partNumber: c.part, file: c.part, status: 'error' } as never) as any;
  console.log(`\n${c.part} as ${c.commodity}: product total £${res.total?.toFixed(4)}`);
  const P = res.params, T = res.trace, prov = res.provenance as Record<string, { value: unknown; basis: string }>;
  const cam = c.commodity === 'cast_and_machine';
  const pre = cam ? 'cam-' : 'cast-';
  const pv = (id: string) => Number(prov[id]?.value);

  // ── 1. Mass: finished from the measured volume × the library grade's density ──
  const matId = String(cam ? P.materialId : P.materialId);
  const mat = material(matId);
  const density = mat.densityKgPerM3 / 1e6;                                          // kg/cm³
  const finished = geo.volume.cm3 * density;
  check('finished mass, kg', pv(cam ? 'cam-finish-wt' : 'cast-part-wt'), finished, { abs: 0.0005 });

  // As-cast = finished + holes ≤ Ø20 drilled from solid + 3 mm on machined faces and cored bores + 3 mm on a turned axis
  const rows = (geo.featureTable ?? []) as Array<{ kind: string; diaMm: number; depthMm: number; count: number; areaMm2?: number }>;
  let drilledMm3 = 0, faceMm3 = 0;
  for (const r of rows) {
    if (r.kind === 'hole' && r.diaMm <= DRILLED_FROM_SOLID_MM) drilledMm3 += Math.PI * r.diaMm ** 2 / 4 * r.depthMm * r.count;
    if (r.kind === 'face') faceMm3 += (r.areaMm2 ?? 0) * r.count * STOCK_MM;
    if (r.kind === 'hole' && r.diaMm > DRILLED_FROM_SOLID_MM) faceMm3 += Math.PI * r.diaMm * r.depthMm * r.count * STOCK_MM;
  }
  const extCm2 = (geo.turning?.externalAreaMm2 ?? 0) / 100;
  const turnedCm2 = extCm2 >= TURNED_MIN_CM2 && extCm2 / geo.surfaceArea.cm2 >= TURNED_MIN_SHARE ? extCm2 : 0;
  const stockCm3 = drilledMm3 / 1000 + faceMm3 / 1000 + turnedCm2 * STOCK_MM / 10;
  const castKg = cam ? finished + stockCm3 * density : finished;
  if (cam) check('as-cast mass, kg', pv('cam-cast-wt'), castKg, { rel: 0.001 });
  const castUsed = cam ? Number(P.castPartWeightKg) : Number(P.partWeightKg);

  // ── 2. Yield, pour, melt loss, utilisation, metal, melt energy ──
  const band = YIELD_BAND[c.alloy];
  const y = (band[0] + band[1]) / 2;                                                     // the printed "midpoint"
  check('yield = band midpoint', pv(cam ? 'cam-cast-yield' : 'cast-yield'), y, { rel: 0.005 });
  const yUsed = Number(cam ? P.castingYield : P.castingYield);
  const uplift = 1 / (1 - REJECT);
  const pour = castUsed * uplift / yUsed;
  const melt = MELT[c.alloy];
  const lost = (pour - castUsed) * melt.loss;
  const rm = T.drivers.rawMaterial;
  check('material utilisation (part ÷ part + melt loss)', rm.materialUtilization, castUsed / (castUsed + lost), { rel: 0.0001 });
  check('melt energy, kWh (pour × kWh/kg)', rm.energyKwh.electricity, pour * melt.kwh, { rel: 0.0001 });
  const metalGbp = (castUsed + lost) * mat.pricePerKg;                                   // no scrap credit: loss is gone
  const energyGbp = pour * melt.kwh * tariff.electricityPerKwh;

  // ── 3. Per-part consumables and services ──
  const items = new Map<string, number>((rm.consumablesItems ?? []).map((i: { label: string; gbp: number }) => [i.label.replace(/ \(.*$/, ''), i.gbp]));
  const under = geo.draftAnalysis?.undercutFaceCount ?? 0;
  const sealed = geo.topology?.available && geo.topology.enclosesSealedVoid === true;
  const corePerPart = sealed ? 6 : under >= 20 ? 3 : under >= 6 ? 1.5 : under >= 1 ? 0.75 : 0;
  check('cores £ (band by undercut faces × reject uplift)', items.get('cores') ?? 0, corePerPart * uplift);
  check('green-sand additions £ (pour × £0.01/kg)', items.get('green-sand additions') ?? 0, pour * GREEN_SAND_GBP_PER_KG);
  check('heat treatment £ (rate × as-cast kg)', items.get('heat treatment') ?? 0, HT_GBP_PER_KG[c.alloy] * castUsed);
  // Shot blast: the CASTING is blasted (before machining) — its as-cast mass.
  const blast = Math.max(BLAST_MIN, Math.round(castKg / BLAST_KG_PER_HR * (machineRate('blast-machine') + labourRate('lab-uk-foundry')) * 100) / 100);
  check('shot blast £ (as-cast kg ÷ 600 kg/h × (blast + operator))', items.get('shot blast') ?? 0, blast);
  const ndt = c.safety
    ? Math.round((NDT_MPI.sec / 3600 * (labourRate('lab-uk-inspector') * NDT_MPI.manning + NDT_MPI.bench) + NDT_MPI.sampleXray * NDT_MPI.xray) * 100) / 100
    : 0;
  check('NDT £ (MPI station + 1-in-50 X-ray)', items.get('NDT') ?? 0, ndt);

  // ── 4. Casting operations ──
  const b = geo.boundingBox; const dims = [b.xMm, b.yMm, b.zMm];
  const ax = (geo.draftAnalysis?.drawDirectionXYZ ?? []).findIndex((v: number) => Math.abs(v) > 0.99);
  const across = ax >= 0 ? dims.filter((_, i) => i !== ax) : [...dims].sort((p, q) => q - p).slice(0, 2);
  const L = Math.max(...across) + MARGIN_MM, W = Math.min(...across) + MARGIN_MM;
  const imps = Math.max(Math.floor(FLASK[0] / L) * Math.floor(FLASK[1] / W), Math.floor(FLASK[0] / W) * Math.floor(FLASK[1] / L));
  const lineHr = 1 / MOULDS_PER_HR / imps;
  check('sand line h / casting (1 ÷ 30 moulds/h ÷ impressions)', pv(pre + 'sand-ct'), lineHr, { rel: 0.005 });
  const ops = T.operations as Array<any>;
  const op = (re: RegExp) => ops.find(o => re.test(o.operationName));
  const mould = op(/^Sand Casting — Moulding/);
  const cyc = Number(P.sand.cycleTimeHr) * uplift;
  check('moulding machine £', mould.processCost, cyc * machineRate('sand-cast-line') / OEE);
  check('moulding labour £ (crew of 4)', mould.labourCost, cyc * LINE_CREW * labourRate('lab-uk-foundry') / LAB_EFF);
  check('moulding £ at the unrounded line time', mould.processCost + mould.labourCost,
    lineHr * uplift * (machineRate('sand-cast-line') / OEE + LINE_CREW * labourRate('lab-uk-foundry') / LAB_EFF));
  const fettle = op(/^Fettling/);
  check('fettling labour £ (6 min × reject uplift)', fettle.labourCost, FETTLE_MEDIUM_MIN / 60 * uplift * labourRate('lab-uk-foundry') / LAB_EFF);
  const meltOp = op(/^Melt shop/);
  check('melt-shop labour £ (1.5 h/t poured)', meltOp.labourCost, pour / 1000 * MELT_LABOUR_H_PER_T * labourRate('lab-uk-furnace') / LAB_EFF);
  // Process order: melt before fettling (melt → mould / pour → knock-out → fettle).
  check('order: melt shop before fettling', ops.indexOf(meltOp) < ops.indexOf(fettle) ? 1 : 0, 1);

  // ── 5. Machining half: £ from the costed times at the book's rates ──
  let machProc = 0, machLab = 0;
  for (const o of ops.filter(o => !/^Sand Casting|^Fettling|^Melt shop/.test(o.operationName))) {
    const ppc = o.partsPerCycle || 1;
    const p = o.benchOperation ? 0 : o.cycleTimeHr * machineRate(o.machineId) / o.oee / ppc;
    const l = o.labourTimeHr * o.manning * labourRate(o.labourId) / o.labourEfficiency / ppc;
    check(`op £ ${o.operationName.slice(0, 40)}`, o.processCost + o.labourCost, p + l);
    machProc += p; machLab += l;
  }
  if (cam) {
    check('setup h / part (setup ÷ batch)', ops.find(o => /^Machining Setup/.test(o.operationName)).cycleTimeHr, pv('cam-mach-setup-time') / pv('cam-mach-batch-size'), { abs: 1e-9 });
    const cutMin = (P.machiningOps as Array<any>).filter(o => !o.benchOperation && !/^Pallet change|load|clamp|unload/i.test(o.name))
      .reduce((s: number, o: any) => s + o.cycleTimeHr, 0) * 60;
    const perMin = c.alloy === 'steel' ? 0.12 : 0.10;
    check('tool wear £ (cutting min × £/min)', items.get('cutting-tool wear') ?? 0, cutMin * perMin, { abs: 0.0005 });
  }

  // ── 6. Tooling: the sand pattern build-up, sets over the programme, amortisation ──
  const area = Math.round(geo.projectedArea.alongDrawMm2 / 100 * 10) / 10;
  const plate = Math.max(10, area * imps);
  const cores = sealed ? 2 : under >= 20 ? 2 : under >= 1 ? 1 : 0;
  const dCm = Math.min(45, Math.max(3, 0.4 * Math.sqrt(plate)));
  const H = (12 + 3.4 * Math.pow(plate, 0.72)) * 0.30;
  const lines = [
    r0((12 + 0.1 * H) * TOOLROOM_RATES_UK.design),
    r0(plate * (dCm + 10) * 2 * 1.25 * 7.85e-3 * 0.35 * TOOL_MATERIAL_GBP_PER_KG['al-7075']),
    r0(H * TOOLROOM_RATES_UK.cnc),
    cores > 0 ? r0(cores * (10 + 0.08 * H) * TOOLROOM_RATES_UK.cnc) : 0,
    r0(8 * TOOLROOM_RATES_UK.tryoutPress),
  ];
  const sub = lines.reduce((s, x) => s + x, 0);
  const pattern = Math.min(50_000, Math.max(1_500, r0(sub + r0(sub * SHOP_OVERHEAD_PROFIT))));
  check('pattern £ (toolmaker build-up)', pv(pre + 'hpdc-die-cost'), pattern, { abs: 1 });
  const life = PATTERN_LIFE_MOULDS * imps;
  check('pattern life, castings (8,000 moulds × impressions)', pv(pre + 'hpdc-die-life'), life, { abs: 0 });
  // A pattern wears per mould rammed — rejected castings included.
  const sets = Math.ceil(AMORT * uplift / life);
  const patternItem = (T.drivers.tooling.items as Array<{ label: string; gbp: number }>).find(i => /^Pattern/.test(i.label))!;
  check('pattern sets × £ (castings poured ÷ life, rejects included)', patternItem.gbp, sets * pattern, { abs: 0.5 });
  const machTooling = cam ? Number(P.machiningToolingCost) + Number(P.machiningProgrammingNRE) : Number(P.secondaryMachiningToolingCost ?? 0);
  const toolingTotal = sets * pattern + machTooling;
  check('tooling £ / part (total ÷ annual × years)', res.breakdown.tooling, toolingTotal / AMORT, { abs: 0.00005 });

  // ── 7. The eight buckets ──
  const consumables = (items.get('cores') ?? 0) + (items.get('green-sand additions') ?? 0) + (items.get('heat treatment') ?? 0)
    + (items.get('shot blast') ?? 0) + (items.get('NDT') ?? 0) + (items.get('cutting-tool wear') ?? 0) + (items.get('machining consumables') ?? 0);
  const matB = metalGbp + energyGbp + consumables;
  const procB = mould.processCost + machProc;
  const labB = mould.labourCost + fettle.labourCost + meltOp.labourCost + machLab;
  const toolB = toolingTotal / AMORT;
  const pack = Number(T.stackInput.packagingPerPart), logi = Number(T.stackInput.logisticsPerPart);
  const factory = matB + procB + labB + toolB;
  const oh = factory * OVERHEAD;
  const mg = (factory + oh + pack + logi) * MARGIN;
  check('bucket material', T.result.breakdown.rawMaterial, matB);
  check('bucket process', T.result.breakdown.process, procB);
  check('bucket labour', T.result.breakdown.labour, labB);
  check('bucket tooling', T.result.breakdown.tooling, toolB);
  check('bucket overhead (12% of factory base)', T.result.breakdown.overhead, oh);
  check('bucket margin (8% of subtotal)', T.result.breakdown.margin, mg);
  check('TOTAL', res.total, factory + oh + pack + logi + mg);
  if (verbose) console.log(`  shadow: cast ${castKg.toFixed(4)} kg, pour ${pour.toFixed(4)} kg, lost ${lost.toFixed(4)} kg, metal £${metalGbp.toFixed(4)}, energy £${energyGbp.toFixed(4)}, impressions ${imps}, pattern £${pattern} × ${sets}`);
}

console.log(`\n${pass + fail} checks: ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log('FAILED:\n  ' + failures.join('\n  ')); process.exit(1); }

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
 *
 *   npx tsx scripts/arith-audit/casting.ts <dumpDir>  # check the parts a dump.ts dump costed, at the dump's own volume,
 *                                                     # years and terms (dump-context.ts) — UK dumps only: the country
 *                                                     # factors on the core / NDT / blast constants are not restated here
 *
 * Secondary-machining parity (3 Nov 2026): the casting route costs the machined features as secondary machining on the
 * near-net plan (cast + machine's), pours / heat-treats / blasts the AS-CAST weight; the two routes must total the same.
 *
 * Foundry at volume (3 Nov 2026): the moulding line is chosen by the part's moulds a year on the semi-automatic line
 * (≥ 5,000 → the automatic vertical line, when an impression fits its mould), each line with its own face, rated
 * output and crew; a ferrous casting ≤ 30 kg off the automatic line is fettled on the robotic cell (40 s, ½ operator);
 * the aluminium pattern lasts 100,000 moulds. Written out again below from the stated bases.
 *
 * Review round (4 Nov 2026): impressions are the smallest of the free fit, the 60 % plate rule and (iron) sand : iron ≥ 5 : 1;
 * the foundry indirect lines — new sand + disposal (£/t poured), ladle preheat (gas kWh/t poured), dust extraction and other
 * plant electricity (kWh/t good casting) — are written out again below from their bases.
 *
 * Gravity research round (5 Nov 2026, scripts/research/2026-11-gravity-lpdc): Part1 as an aluminium (LM25) GRAVITY cast +
 * machine is checked too, always run live through the product chain in the UK at the dump's (or the default) volume,
 * years and terms — the baseline costs Part1 as machining, so no dump holds it. Written out again from the bases: the die
 * cycle = min(9, max(3.0 → 4.8 min on 3 → 7.5 kg poured, 3.0 × (2·V/S ÷ 10)²)) a die opening ÷ impressions, the cell crew
 * (½ manual below 50,000 castings a year, ¼ the multi-machine cell at or above), the H13 die build-up with slides
 * (catalogue cylinder + bench hours each), its life 100,000 die cycles × impressions, and the T6 station (0.9483 kWh/kg of
 * electricity, 0.0085 furnace-operator h/kg, £0.007782/kg capital) on the as-cast weight; once more with two impressions.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dumpContext, contextLine } from './dump-context.js';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { TOOLROOM_RATES_UK, TOOL_MATERIAL_GBP_PER_KG, SHOP_OVERHEAD_PROFIT } from '../../src/engine/toolmaking.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const verbose = process.argv.includes('--verbose');
const DUMP = process.argv.slice(2).find(a => !a.startsWith('--'));
const DC = DUMP ? dumpContext(DUMP) : null;
if (DC) console.log(contextLine(DC));
// The sand cases check UK dumps only (the country factors on the core / NDT constants are not restated); the gravity
// case (gravity research round, Nov 2026) runs in the dump's country, its toolroom and process-service factors from
// dump-context.ts.
const SAND_IN_THIS_DUMP = !DC || DC.region === 'UK';
if (!SAND_IN_THIS_DUMP) console.log(`the sand cases check UK dumps only (this dump is ${DC!.region}) — the gravity case runs in ${DC!.region}`);

const book = DC ? DC.book : recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machineRate = (id: string) => (book.machines.find(m => m.id === id) as { computedRatePerHr: number }).computedRatePerHr;
const labourRate = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const material = (id: string) => book.materials.find(m => m.id === id)!;
const tariff = book.energy.find(e => e.id === `energy-${(book.regional?.code ?? 'uk').toLowerCase()}`)!;   // by id (R1 Nov 2026: the engine never takes the first row)

// ── The stated constants, as each basis line prints them (the register in casting.md says where each lives) ──
const ANNUAL = DC?.annual ?? 50_000, YEARS = DC?.years ?? 5, AMORT = ANNUAL * YEARS;
const REJECT = 0.03, OEE = 0.8, LAB_EFF = 0.92;               // SHOP_DEFAULTS (to-cost-params.ts)
const OVERHEAD = DC?.overheadPct ?? 0.12, MARGIN = 0.08;
const REGION = (DC?.region ?? 'UK') as 'UK';
const TOOLROOM = DC?.toolroom ?? TOOLROOM_RATES_UK;            // the costed country's toolroom £/h (UK × its toolroom factor)
const TF = DC?.toolroomFactor ?? 1;
const PROCESS_F = DC ? DC.factor('process') : 1;
const YIELD_BAND: Record<string, [number, number]> = { steel: [0.45, 0.60], 'ductile-iron': [0.55, 0.70] };
const MELT: Record<string, { loss: number; kwh: number }> = { steel: { loss: 0.03, kwh: 0.70 }, 'ductile-iron': { loss: 0.03, kwh: 0.62 } };
const MELT_LABOUR_H_PER_T = 1.5;
// Foundry indirect lines (review round, 4 Nov 2026), as the four rules' bases print them: new sand 15 % of the poured
// weight × (€45 sand + €43 disposal) ÷ €1.1965/£; ladle preheat (gas) a tonne poured; dust extraction 20 and other plant
// electricity 0.475 − 0.020 kWh/kg a tonne of good casting (plant on SAND castings only).
const NEW_SAND_GBP_PER_T_POURED = Math.round(0.15 * (45 + 43) / 1.1965 * 10_000) / 10_000;
const LADLE_KWH_PER_T: Record<string, number> = { steel: 200, 'ductile-iron': 100 };
const DUST_KWH_PER_T = 20, PLANT_KWH_PER_T = 475 - 20;
// Impressions (review round): the smallest of the free fit, ⌊0.60 × face ÷ cell⌋ and, on iron, ⌊mould sand ÷ (5 × pour + cavity sand)⌋
// with the mould T = depth along the draw + 70 mm and green sand at 1,500 kg/m³ (the one unsourced figure, printed as such).
const PLATE_SHARE = 0.60, SAND_BETWEEN_MM = 70, SAND_TO_IRON = 5, SAND_KG_PER_M3 = 1500;
const MARGIN_MM = 50;
// The two line classes (rated output at 200 mm mould thickness; crew) and the line threshold — as the bases print them.
const LINES = {
  semi: { machine: 'sand-cast-line', face: [800, 650], uncored: 60, cored: 60, crew: 4 },             // HWS HSP-2D class
  auto: { machine: 'sand-auto-vertical-line', face: [950, 700], uncored: 280, cored: 250, crew: 3 },   // DISA 270-280
} as const;
const AUTO_MIN_MOULDS = 5_000;
const FETTLE_MEDIUM_MIN = 6;
const CELL = { machine: 'fettle-robot-cell', sec: 40, crew: 0.5, maxKg: 30 };
const HT_GBP_PER_KG: Record<string, number> = { steel: 0.35, 'ductile-iron': 0 };   // steel normalise; iron as-cast
const BLAST_KG_PER_HR = 600, BLAST_MIN = 0.10;
const NDT_MPI = { sec: 75, manning: 1, bench: 4, sampleXray: 0.02, xray: 5 };
const PATTERN_LIFE_MOULDS = 100_000;   // aluminium match plate (the material priced)
const STOCK_MM = 3, DRILLED_FROM_SOLID_MM = 20;                // sand, ferrous: ISO 8062-3 RMA typical (stated)
const TURNED_MIN_CM2 = 20, TURNED_MIN_SHARE = 0.08;

interface Case { part: string; commodity: 'cast_and_machine' | 'casting'; alloy: 'steel' | 'ductile-iron'; safety: boolean }
const CASES: Case[] = [
  { part: 'Casting_Braket.stp', commodity: 'cast_and_machine', alloy: 'steel', safety: false },
  { part: 'Casting_Braket.stp', commodity: 'casting', alloy: 'steel', safety: false },
  { part: 'PRCR002.stp', commodity: 'cast_and_machine', alloy: 'ductile-iron', safety: true },
].filter(c => SAND_IN_THIS_DUMP && (!DC || c.commodity === 'cast_and_machine')) as Case[];   // a dump costs each part on its baseline route

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
const totals = new Map<string, number>();

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;

for (const c of CASES) {
  const rec = base.find(p => p.part === c.part)!;
  const geo = rec.geometry as OCCTGeometry & Record<string, any>;
  const spec = ANSWERS[c.part];
  const dumped = DC ? join(DUMP!, `${c.part.replace(/\.(stp|step)$/i, '')}.json`) : null;
  if (dumped && !existsSync(dumped)) { console.log(`  (no dump for ${c.part})`); continue; }
  const res = (dumped ? JSON.parse(readFileSync(dumped, 'utf8')) : await costMeasuredPart(geo, c.part,
    { partNumber: c.part, file: c.part, annualVolume: ANNUAL, commodity: c.commodity } as never,
    spec.answers, 'UK', { annualVolume: ANNUAL, programmeYears: YEARS } as never, book,
    { partNumber: c.part, file: c.part, status: 'error' } as never)) as any;
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
  // Secondary-machining parity (3 Nov 2026): the casting route machines the same rows as secondary machining and pours
  // the same as-cast weight (it poured the finished weight).
  const castKg = finished + stockCm3 * density;
  if (cam) check('as-cast mass, kg', pv('cam-cast-wt'), castKg, { rel: 0.001 });
  else check('as-cast mass, kg (casting route, secondary machining)', Number(P.partWeightKg), castKg, { rel: 0.001 });
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
  // Electricity: melt on every kg poured + dust extraction and other plant electricity on every kg of good casting;
  // gas: ladle preheat on every kg poured (review round, 4 Nov 2026).
  const elecKwh = pour * melt.kwh + castUsed * (DUST_KWH_PER_T + PLANT_KWH_PER_T) / 1000;
  const gasKwh = pour * LADLE_KWH_PER_T[c.alloy] / 1000;
  check('electricity, kWh (pour × melt kWh/kg + good casting × (20 + 455) kWh/t)', rm.energyKwh.electricity, elecKwh, { rel: 0.0001 });
  check('gas, kWh (pour × ladle preheat kWh/t)', rm.energyKwh.gas ?? 0, gasKwh, { rel: 0.0001 });
  check('rule: new sand £/t poured (0.15 × (€45 + €43) ÷ 1.1965)', pv(pre + 'new-sand'), NEW_SAND_GBP_PER_T_POURED, { abs: 0.00005 });
  check('rule: ladle preheat kWh/t (iron 100, steel 200)', pv(pre + 'ladle-kwh'), LADLE_KWH_PER_T[c.alloy], { abs: 0 });
  check('rule: dust extraction kWh/t', pv(pre + 'dust-kwh'), DUST_KWH_PER_T, { abs: 0 });
  check('rule: other plant electricity kWh/t (0.475 − 0.020 kWh/kg)', pv(pre + 'plant-kwh'), PLANT_KWH_PER_T, { abs: 0 });
  // Phase B (4 Nov 2026): the UK metal CHARGE re-derived from the research figures, written out again (not read from the
  // generator): steel = (HMS export unit value + Mn/Si/Al trim) ÷ 0.96 (+ the alloy content for G20Mn5 / G42CrMo4);
  // ductile iron = (0.5 pig + 0.5 HMS + 1.2 % FeSiMg) ÷ 0.98. A country book prices its own charge — UK dumps only.
  const HMS = (721498782 + 139195452) / (2472204515 + 496961012);                       // HMRC OTS 7204 49 90, Jan–Aug 2026
  const TRIM = (4.4 * 3667343 / 4193930 + 5 * 4370594 / 4760315 + 1.5 * 2.0) / 1000;      // FeMn + FeSi + Al deox, £/kg steel
  const MN = 3667343 / 4193930 / (3 / 4.4), CR = (24140075 + 24654169) / (23828070 + 26852769) / (12.5 / 20), MO = 5768326 / 220989 / (5.5 / 8.3);
  const steelCharge = Math.round((HMS + TRIM) / 0.96 * 10_000) / 10_000;
  const charge: Record<string, number> = {
    'mat-gs-c25': steelCharge, 'mat-astm-a216-wcb': steelCharge,
    'mat-g20mn5': steelCharge + Math.round(0.005 * MN * 10_000) / 10_000,
    'mat-g42crmo4': steelCharge + Math.round((0.01 * CR + 0.002 * MO) * 10_000) / 10_000,
    'mat-gjs500': Math.round((0.5 * 0.3867 + 0.5 * HMS + 0.012 * 1.8985) / 0.98 * 10_000) / 10_000,
  };
  if (charge[matId] !== undefined) check(`UK charge £/kg for ${matId} (research: HMS export parity + trim ÷ loss)`, mat.pricePerKg, Math.round(charge[matId] * 1000) / 1000, { abs: 0.0005 });
  const metalGbp = (castUsed + lost) * mat.pricePerKg;                                   // no scrap credit: loss is gone
  const energyGbp = elecKwh * tariff.electricityPerKwh + gasKwh * tariff.gasPerKwh;

  // ── 3. Per-part consumables and services ──
  const items = new Map<string, number>((rm.consumablesItems ?? []).map((i: { label: string; gbp: number }) => [i.label.replace(/ \(.*$/, ''), i.gbp]));
  const under = geo.draftAnalysis?.undercutFaceCount ?? 0;
  const sealed = geo.topology?.available && geo.topology.enclosesSealedVoid === true;
  const corePerPart = sealed ? 6 : under >= 20 ? 3 : under >= 6 ? 1.5 : under >= 1 ? 0.75 : 0;
  check('cores £ (band by undercut faces × reject uplift)', items.get('cores') ?? 0, corePerPart * uplift);
  check('new sand + disposal £ (pour × £/t ÷ 1,000)', items.get('new sand + disposal') ?? 0, pour * NEW_SAND_GBP_PER_T_POURED / 1000);
  check('no engineering-typical green-sand line beside it', items.has('green-sand additions') ? 1 : 0, 0, { abs: 0 });
  check('heat treatment £ (rate × as-cast kg)', items.get('heat treatment') ?? 0, HT_GBP_PER_KG[c.alloy] * castUsed);
  // Shot blast: the CASTING is blasted (before machining) — its as-cast mass.
  const blast = Math.max(BLAST_MIN, Math.round(castKg / BLAST_KG_PER_HR * (machineRate('blast-machine') + labourRate('lab-uk-foundry')) * 10_000) / 10_000);
  check('shot blast £ (as-cast kg ÷ 600 kg/h × (blast + operator))', items.get('shot blast') ?? 0, blast);
  const ndt = c.safety
    ? Math.round((NDT_MPI.sec / 3600 * (labourRate('lab-uk-inspector') * NDT_MPI.manning + NDT_MPI.bench) + NDT_MPI.sampleXray * NDT_MPI.xray) * 10_000) / 10_000
    : 0;
  check('NDT £ (MPI station + 1-in-50 X-ray)', items.get('NDT') ?? 0, ndt);

  // ── 4. Casting operations ──
  const b = geo.boundingBox; const dims = [b.xMm, b.yMm, b.zMm];
  const ax = (geo.draftAnalysis?.drawDirectionXYZ ?? []).findIndex((v: number) => Math.abs(v) > 0.99);
  const across = ax >= 0 ? dims.filter((_, i) => i !== ax) : [...dims].sort((p, q) => q - p).slice(0, 2);
  const L = Math.max(...across) + MARGIN_MM, W = Math.min(...across) + MARGIN_MM;
  const depth = ax >= 0 ? dims[ax] : Math.min(...dims);
  const freeFit = (F: readonly number[]) => Math.max(Math.floor(F[0] / L) * Math.floor(F[1] / W), Math.floor(F[0] / W) * Math.floor(F[1] / L));
  // The review round's limits: plate 60 % (gating = the margin), and on iron sand : iron ≥ 5 : 1 at T = depth + 70 mm.
  const fitOn = (F: readonly number[]) => {
    const fit = freeFit(F);
    if (fit < 1) return 0;
    const plate = Math.floor(PLATE_SHARE * F[0] * F[1] / (L * W) + 1e-9);
    let sandIron = Infinity;
    if (c.alloy === 'ductile-iron') {
      const pourImp = castKg / y;                                                       // as cast ÷ the yield costed
      const mouldKg = F[0] * F[1] * (depth + SAND_BETWEEN_MM) * 1e-9 * SAND_KG_PER_M3;
      sandIron = Math.floor(mouldKg / (SAND_TO_IRON * pourImp + pourImp / mat.densityKgPerM3 * SAND_KG_PER_M3) + 1e-9);
    }
    return Math.max(1, Math.min(fit, plate, sandIron));
  };
  const impsSemi = fitOn(LINES.semi.face), impsAuto = fitOn(LINES.auto.face);
  const onAuto = impsAuto >= 1 && ANNUAL / Math.max(1, impsSemi) >= AUTO_MIN_MOULDS;
  const line = onAuto ? LINES.auto : LINES.semi;
  const imps = onAuto ? impsAuto : impsSemi;
  const cored = sealed || geo.draftAnalysis?.undercutFaceCount == null || under >= 1;
  const perHr = cored ? line.cored : line.uncored;
  const lineHr = 1 / perHr / imps;
  check(`sand line h / casting (1 ÷ ${perHr} moulds/h ÷ ${imps} impressions, ${onAuto ? 'automatic' : 'semi-automatic'})`, pv(pre + 'sand-ct'), lineHr, { rel: 0.005 });
  check(`moulding line chosen (${line.machine})`, String(prov[pre + 'sand-line']?.value) === line.machine ? 1 : 0, 1);
  check('line crew', pv(cam ? 'cam-cast-manning' : 'cast-manning'), line.crew, { abs: 0 });
  const ops = T.operations as Array<any>;
  const op = (re: RegExp) => ops.find(o => re.test(o.operationName));
  const mould = op(/^Sand Casting — Moulding/);
  const cyc = Number(P.sand.cycleTimeHr) * uplift;
  check('moulding machine £', mould.processCost, cyc * machineRate(line.machine) / OEE);
  check(`moulding labour £ (crew of ${line.crew})`, mould.labourCost, cyc * line.crew * labourRate('lab-uk-foundry') / LAB_EFF);
  check('moulding £ at the unrounded line time', mould.processCost + mould.labourCost,
    lineHr * uplift * (machineRate(line.machine) / OEE + line.crew * labourRate('lab-uk-foundry') / LAB_EFF));
  // Fettling: the robotic cell for a ferrous casting ≤ 30 kg off the automatic line (steel > 10 kg keeps the bench).
  const massKg = finished;
  const onCell = onAuto && massKg <= CELL.maxKg && !(c.alloy === 'steel' && massKg > 10);
  const fettle = onCell ? op(/^Fettling — robotic grinding cell/) : op(/^Fettling \(gate/);
  if (onCell) {
    const h = CELL.sec / 3600 * uplift;
    check('fettling cell h (40 s × reject uplift)', fettle.cycleTimeHr, h, { abs: 1e-12 });
    check('fettling cell machine £', fettle.processCost, h * machineRate(CELL.machine) / OEE);
    check('fettling cell labour £ (½ operator)', fettle.labourCost, h * CELL.crew * labourRate('lab-uk-foundry') / LAB_EFF);
    check('no bench fettling beside the cell', op(/^Fettling \(gate/) ? 1 : 0, 0);
  } else {
    check('fettling labour £ (6 min × reject uplift)', fettle.labourCost, FETTLE_MEDIUM_MIN / 60 * uplift * labourRate('lab-uk-foundry') / LAB_EFF);
  }
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
  const perMin = c.alloy === 'steel' ? 0.12 : 0.10;
  if (cam) {
    check('setup h / part (setup ÷ batch)', ops.find(o => /^Machining Setup/.test(o.operationName)).cycleTimeHr, pv('cam-mach-setup-time') / pv('cam-mach-batch-size'), { abs: 1e-9 });
    const cutMin = (P.machiningOps as Array<any>).filter(o => !o.benchOperation && !/^Pallet change|load|clamp|unload/i.test(o.name))
      .reduce((s: number, o: any) => s + o.cycleTimeHr, 0) * 60;
    check('tool wear £ (cutting min × £/min)', items.get('cutting-tool wear') ?? 0, cutMin * perMin, { abs: 0.0005 });
  } else {
    // The casting route's secondary machining is the near-net plan: the same change-over (efficiency 1), the same tool wear.
    const setupOp = ops.find(o => /^Machining Setup/.test(o.operationName));
    check('secondary machining: change-over at labour efficiency 1', setupOp?.labourEfficiency ?? NaN, 1, { abs: 0 });
    const cutMin = (P.secondaryMachiningOps as Array<any>).filter(o => !o.benchOperation && !/^Machining Setup|^Pallet change|load|clamp|unload/i.test(o.operationName))
      .reduce((s: number, o: any) => s + o.cycleTimeHr, 0) * 60;
    // one name on both routes (Nov 2026): the casting route's tool wear is "cutting-tool wear", as cast + machine's
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
  check('pattern life, castings (100,000 moulds × impressions)', pv(pre + 'hpdc-die-life'), life, { abs: 0 });
  // A pattern wears per mould rammed — rejected castings included.
  const sets = Math.ceil(AMORT * uplift / life);
  // Report standard #9: the pattern is the first set (up front) and the replacement sets as it wears out.
  const patternItems = (T.drivers.tooling.items as Array<{ label: string; gbp: number; kind?: string }>).filter(i => /^Pattern/.test(i.label));
  check('pattern sets × £ (castings poured ÷ life, rejects included)', patternItems.reduce((a, i) => a + i.gbp, 0), sets * pattern, { abs: 0.5 });
  check('first pattern set £ (up front)', patternItems.find(i => i.kind === 'initial')?.gbp ?? NaN, pattern, { abs: 0.5 });
  const machTooling = cam ? Number(P.machiningToolingCost) + Number(P.machiningProgrammingNRE) : Number(P.secondaryMachiningToolingCost ?? 0);
  const toolingTotal = sets * pattern + machTooling;
  // The machining NRE under one set of names on both routes (Nov 2026): fixtures and programming, each its own NRE item.
  const machItems = (T.drivers.tooling.items as Array<{ label: string; gbp: number; kind?: string }>).filter(i => !/^Pattern/.test(i.label));
  const fixtures = cam ? Number(P.machiningToolingCost) : machTooling - Number(P.secondaryMachiningProgrammingNRE ?? 0);
  const programming = cam ? Number(P.machiningProgrammingNRE) : Number(P.secondaryMachiningProgrammingNRE ?? 0);
  const namesGot = machItems.map(i => `${i.label}/${i.kind}`).join(' + ');
  const namesWant = [...(fixtures > 0 ? ['Machining fixtures/nre'] : []), ...(programming > 0 ? ['CNC programming (NRE)/nre'] : [])].join(' + ');
  if (namesGot !== namesWant) console.log(`  machining NRE items: product «${namesGot}» shadow «${namesWant}»`);
  check('machining NRE items named as cast + machine names them (1 = same)', namesGot === namesWant ? 1 : 0, 1, { abs: 0 });
  check('machining fixtures £', machItems.find(i => i.label === 'Machining fixtures')?.gbp ?? 0, fixtures, { abs: 0.005 });
  check('CNC programming £', machItems.find(i => i.label === 'CNC programming (NRE)')?.gbp ?? 0, programming, { abs: 0.005 });
  check('tooling £ / part (total ÷ annual × years)', res.breakdown.tooling, toolingTotal / AMORT, { abs: 0.00005 });

  // ── 7. The eight buckets ──
  const consumables = (items.get('cores') ?? 0) + (items.get('new sand + disposal') ?? 0) + (items.get('heat treatment') ?? 0)
    + (items.get('shot blast') ?? 0) + (items.get('NDT') ?? 0) + (items.get('cutting-tool wear') ?? 0);
  const matB = metalGbp + energyGbp + consumables;
  const procB = mould.processCost + (onCell ? fettle.processCost : 0) + machProc;
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
  totals.set(`${c.part}|${c.commodity}`, res.total);
  if (verbose) console.log(`  shadow: cast ${castKg.toFixed(4)} kg, pour ${pour.toFixed(4)} kg, lost ${lost.toFixed(4)} kg, metal £${metalGbp.toFixed(4)}, energy £${energyGbp.toFixed(4)}, impressions ${imps}, pattern £${pattern} × ${sets}`);
}

// ── Gravity die (research round, 5 Nov 2026): Part1 as an aluminium LM25 gravity cast + machine, run live (UK) ──
const GRAV = {
  smallKg: 3.0, smallMin: 3.0, largeKg: 7.5, largeMin: 4.8, refMm: 10, refMin: 3.0, maxMin: 9.0,        // the die-cycle anchors
  manualCrew: 0.5, autoCrew: 0.25, autoMin: 50_000,                                                       // the cell
  lifeCycles: 100_000, yield: (0.50 + 0.70) / 2, fettleLightMin: 2,
  meltKwh: 0.65, meltLoss: 0.04,
  // T6 station: (163 kW × (2.5 + 6) h + 30 kW × (1.5 + 5) h) × 0.6 ÷ 1,000 kg; operator 8.5 h ÷ 1,000 kg;
  // capital (US$50,000 ÷ 1.3344 = £37,470) ÷ 10 yr + 3.5 % a year, ÷ (650 × 1,000 kg)
  t6Kwh: ((150 + 7.5 + 5.5) * (2.5 + 6) + 30 * (1.5 + 5)) * 0.6 / 1000, t6Hr: 8.5 / 1000,
  t6Cap: (Math.round(50_000 / 1.3344) / 10 + Math.round(50_000 / 1.3344) * 0.035) / (650 * 1000),
  cylinder: 1450,
};
for (const imps of [1, 2]) {
  const part = 'Part1.stp';
  const geo = base.find(p => p.part === part)!.geometry as OCCTGeometry & Record<string, any>;
  const answers = { 'material.family': 'aluminium', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'no', 'material.grade': 'mat-lm25', ...(imps === 2 ? { 'casting.impressions': '2' } : {}) };
  const res = await costMeasuredPart({ ...geo, status: 'success' } as never, part,
    { partNumber: part, file: part, annualVolume: ANNUAL, commodity: 'cast_and_machine' } as never, answers, REGION,
    { annualVolume: ANNUAL, programmeYears: YEARS, ...(DC?.terms ? { deliveryTerms: DC.terms } : {}) } as never, DC ? DC.ukBook : book,
    { partNumber: part, file: part, status: 'error' } as never) as any;
  console.log(`\n${part} as an aluminium gravity cast + machine (${REGION}), ${imps} impression${imps > 1 ? 's' : ''}${imps === 1 ? ' (unanswered — one)' : ' answered'}: product total £${res.total?.toFixed(4)}`);
  const P = res.params, T = res.trace, prov = res.provenance as Record<string, { value: unknown; basis: string }>;
  const pv = (id: string) => Number(prov[id]?.value);
  const mat = material(String(P.materialId));
  check('grade LM25 (answered)', P.materialId === 'mat-lm25' ? 1 : 0, 1, { abs: 0 });
  const castKg = Number(P.castPartWeightKg);                      // the as-cast rule is the machining audit's — an input here
  check('yield = gravity aluminium band midpoint 0.6', pv('cam-cast-yield'), GRAV.yield, { abs: 1e-9 });
  // die cycle a die opening
  const section = Math.round(2 * geo.volume.mm3 / geo.surfaceArea.mm2 * 10) / 10;
  const pourOpen = imps * castKg / GRAV.yield;
  const f = Math.min(1, Math.max(0, (pourOpen - GRAV.smallKg) / (GRAV.largeKg - GRAV.smallKg)));
  const tMass = GRAV.smallMin + (GRAV.largeMin - GRAV.smallMin) * f;
  const tSec = GRAV.refMin * (section / GRAV.refMm) ** 2;
  const dieMin = Math.min(GRAV.maxMin, Math.max(tMass, tSec));
  check(`die cycle h (min(9, max(${tMass.toFixed(3)}, ${tSec.toFixed(3)})) min ÷ 60)`, pv('cam-sand-ct'), dieMin / 60, { abs: 1e-6 });
  check('impressions costed', pv('cam-grav-imp'), imps, { abs: 0 });
  const crew = ANNUAL >= GRAV.autoMin ? GRAV.autoCrew : GRAV.manualCrew;
  check(`cell crew (${ANNUAL >= GRAV.autoMin ? 'multi-machine ¼' : 'manual ½'})`, pv('cam-cast-manning'), crew, { abs: 0 });
  // the gravity op: a die opening × reject uplift, machine ÷ OEE and crew × labour ÷ efficiency, ÷ impressions
  const uplift = 1 / (1 - REJECT);
  const ops = T.operations as Array<any>;
  const gop = ops.find(o => o.operationName === 'Gravity Die Casting');
  const cyc = Number(P.gravity.cycleTimeHr) * uplift;
  check('gravity op parts a cycle = impressions', gop.partsPerCycle, imps, { abs: 0 });
  check('gravity op machine £ (die cycle × uplift × rate ÷ OEE ÷ impressions)', gop.processCost, cyc * machineRate('grav-die-cast-std') / OEE / imps);
  check('gravity op labour £ (× crew × foundry rate ÷ efficiency ÷ impressions)', gop.labourCost, cyc * crew * labourRate('lab-uk-foundry') / LAB_EFF / imps);
  // the H13 die build-up, slides as the moulding build-up's side action
  const area = Math.round(geo.projectedArea.alongDrawMm2 / 100 * 10) / 10;
  const a = Math.max(10, area);
  const dCm = Math.min(45, Math.max(3, 0.4 * Math.sqrt(a)));
  const H = (12 + 3.4 * Math.pow(a, 0.72)) * 0.55;
  const nEcon = Math.pow(imps, 0.9);
  const slides = Math.ceil((geo.draftAnalysis?.undercutFaceCount ?? 0) / 6) * imps;
  const steelKg = a * (dCm + 10) * 2 * 1.25 * 7.85e-3 * 1.3 * nEcon;
  // toolroom hours at the costed country's toolroom rates; H13 and the catalogue cylinders are traded (£ everywhere)
  const dieLines = [
    r0((20 + 0.15 * H) * TOOLROOM.design), r0(steelKg * TOOL_MATERIAL_GBP_PER_KG.h13), r0(H * nEcon * TOOLROOM.cnc),
    r0(0.2 * H * nEcon * TOOLROOM.fitting), r0(16 * TOOLROOM.tryoutPress),
    slides > 0 ? r0(slides * GRAV.cylinder) : 0, slides > 0 ? r0(slides * (28 + a / 200) * TOOLROOM.fitting) : 0,
  ];
  const dieSub = dieLines.reduce((x, y) => x + y, 0);
  const die = Math.min(90_000 * TF, Math.max(8_000 * TF, r0(dieSub + r0(dieSub * SHOP_OVERHEAD_PROFIT))));
  check(`H13 die £ (build-up, ${slides} slide(s), ${imps} cavit${imps > 1 ? 'ies' : 'y'})`, pv('cam-hpdc-die-cost'), die, { abs: 1 });
  const life = GRAV.lifeCycles * imps;
  check('die life, castings (100,000 die cycles × impressions)', pv('cam-hpdc-die-life'), life, { abs: 0 });
  const sets = Math.ceil(AMORT * uplift / life - 1e-9);
  const dieItems = (T.drivers.tooling.items as Array<{ label: string; gbp: number }>).filter(i => /^Permanent mould/.test(i.label));
  check('die sets × £ (castings poured ÷ life)', dieItems.reduce((x, i) => x + i.gbp, 0), sets * die, { abs: 0.5 });
  // metal, melt + T6 energy, the T6 station
  const pour = castKg * uplift / GRAV.yield;
  const lost = (pour - castKg) * GRAV.meltLoss;
  const rm = T.drivers.rawMaterial;
  check('material utilisation', rm.materialUtilization, castKg / (castKg + lost), { rel: 0.0001 });
  const elec = pour * GRAV.meltKwh + castKg * GRAV.t6Kwh;
  check('electricity kWh (melt on the pour + T6 0.9483 kWh/kg on the as-cast kg)', rm.energyKwh.electricity, elec, { rel: 0.0001 });
  check('no gas (no ladle preheat on aluminium)', rm.energyKwh.gas ?? 0, 0, { abs: 0 });
  const htOp = ops.find(o => /^Heat treatment T6/.test(o.operationName));
  check('T6 furnace operator £ (as-cast kg × 0.0085 h × furnace rate ÷ efficiency)', htOp.labourCost, castKg * GRAV.t6Hr * labourRate('lab-uk-furnace') / LAB_EFF);
  check('T6 operator is bench (no machine £)', htOp.processCost, 0, { abs: 0 });
  const items = new Map<string, number>((rm.consumablesItems ?? []).map((i: { label: string; gbp: number }) => [i.label.replace(/ \(.*$/, ''), i.gbp]));
  const cap = [...items.entries()].find(([k]) => /furnace capital/.test(k))?.[1] ?? NaN;
  check('T6 furnace capital £ (as-cast kg × £0.007782)', cap, castKg * GRAV.t6Cap, { abs: 0.000005 });
  check('no £/kg heat treatment beside the station', items.get('heat treatment') ?? 0, 0, { abs: 0 });
  const blastFloor = Math.round(BLAST_MIN * PROCESS_F * 10_000) / 10_000;   // the UK £0.10 floor × the process-service factor
  const blast = Math.max(blastFloor, Math.round(castKg / BLAST_KG_PER_HR * (machineRate('blast-machine') + labourRate('lab-uk-foundry')) * 10_000) / 10_000);
  check('shot blast £ (as-cast kg ÷ 600 kg/h, floor £0.10 × the process factor)', items.get('shot blast') ?? 0, blast);
  const fettle = ops.find(o => /^Fettling \(gate/.test(o.operationName));
  check('fettling labour £ (light, 2 min × uplift)', fettle.labourCost, GRAV.fettleLightMin / 60 * uplift * labourRate('lab-uk-foundry') / LAB_EFF);
  const meltOp = ops.find(o => /^Melt shop/.test(o.operationName));
  check('melt-shop labour £ (1.5 h/t poured)', meltOp.labourCost, pour / 1000 * MELT_LABOUR_H_PER_T * labourRate('lab-uk-furnace') / LAB_EFF);
  // machining half: £ from the costed times
  let machProc = 0, machLab = 0;
  for (const o of ops.filter(o => !/^Gravity Die Casting|^Fettling|^Melt shop|^Heat treatment/.test(o.operationName))) {
    const ppc = o.partsPerCycle || 1;
    machProc += o.benchOperation ? 0 : o.cycleTimeHr * machineRate(o.machineId) / o.oee / ppc;
    machLab += o.labourTimeHr * o.manning * labourRate(o.labourId) / o.labourEfficiency / ppc;
  }
  const toolWear = items.get('cutting-tool wear') ?? 0;
  const metalGbp = (castKg + lost) * mat.pricePerKg;
  const matB = metalGbp + elec * tariff.electricityPerKwh + cap + blast + toolWear;
  const procB = gop.processCost + machProc;
  const labB = gop.labourCost + fettle.labourCost + meltOp.labourCost + htOp.labourCost + machLab;
  const toolB = (sets * die + Number(P.machiningToolingCost) + Number(P.machiningProgrammingNRE)) / AMORT;
  const pack = Number(T.stackInput.packagingPerPart), logi = Number(T.stackInput.logisticsPerPart);
  const factory = matB + procB + labB + toolB;
  const oh = factory * OVERHEAD, mg = (factory + oh + pack + logi) * MARGIN;
  check('bucket material', T.result.breakdown.rawMaterial, matB);
  check('bucket process', T.result.breakdown.process, procB);
  check('bucket labour', T.result.breakdown.labour, labB);
  check('bucket tooling', T.result.breakdown.tooling, toolB, { abs: 0.00005 });
  check('TOTAL', res.total, factory + oh + pack + logi + mg);
  if (verbose) console.log(`  shadow: cast ${castKg.toFixed(4)} kg, section ${section} mm, die ${dieMin.toFixed(3)} min, crew ${crew}, die £${die} × ${sets}, T6 kWh ${(castKg * GRAV.t6Kwh).toFixed(4)}`);
}

// Secondary-machining parity: the same part on the casting route (machined features costed) and cast + machine, same total.
for (const [k, t] of totals) {
  const [part, com] = k.split('|');
  if (com === 'casting' && totals.has(`${part}|cast_and_machine`)) check(`${part}: casting route = cast + machine (same scope)`, t, totals.get(`${part}|cast_and_machine`)!, { abs: 0 });
}

console.log(`\n${pass + fail} checks: ${pass} PASS, ${fail} FAIL`);
if (fail) { console.log('FAILED:\n  ' + failures.join('\n  ')); process.exit(1); }

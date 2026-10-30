/**
 * Arithmetic audit — FORGING shadow model (30 Oct 2026, docs/review/arith-audit/forging.md).
 *
 * Re-computes every forging part in a dump of scripts/arith-audit/dump.ts from the MEASURED geometry
 * (tests/fixtures/real-parts-baseline.json), the RATE BOOK and the baseline's ANSWERS — without calling the forging
 * module, the forging rules or the forging advisor. The engineering constants are re-typed here as the model's
 * printed statement of them (see the write-up's constant register); every rule-derived input, every operation's
 * time and £, the material line, the tooling and the 8 buckets are compared with the dump. The secondary machining
 * operations are the machining auditor's: their TIMES are taken from the dump and only their £ re-priced here.
 *
 *   npx tsx scripts/arith-audit/forging.ts [dumpDir]      # exits 1 on any FAIL
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { TOOLROOM_RATES_UK, TOOL_MATERIAL_GBP_PER_KG, SHOP_OVERHEAD_PROFIT } from '../../src/engine/toolmaking.js';

const DUMP = process.argv[2]
  ?? '/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/arith-dump';
const PARTS = ['steering_knuckle_RH', 'FORGE_Hub_Flange', 'FORGE_Control_Arm_Yoke'];
const BASELINE = join(import.meta.dirname, '../../tests/fixtures/real-parts-baseline.json');

// ── The model's constants, as printed on the bases (UK; programme as the dump: 50,000 a year × 5 years) ──────────
const ANNUAL = 50_000, YEARS = 5, AMORT = ANNUAL * YEARS;
const STOCK_MM = 2, PIERCE_ABOVE_MM = 25;                   // closed-die machining stock a side; bores > Ø25 pierced
const FLASH = 0.10, BAND_MID = (0.55 + 0.80) / 2;            // closed-die
const KT = { simple: 3, moderate: 5, complex: 8 } as const;
const FLOW_MICROALLOYED = 105;                                // MPa, hot
const FORGE_LADDER = [500, 1600, 2500, 4000, 8000];
const STAMP_LADDER = [100, 200, 400, 630, 800, 1000, 1250];
const LOAD_S = 3, HIT_S_MECH = 4, HIT_S_HYD = 8, IMPRESSIONS = 2;
const CREW = 2, TRIM_CREW = 1, REJECT = 0.02, OEE = 0.8, EFF = 0.92;
const HEAT_KWH_PER_KG = 0.35, DESCALE_GBP_KG = 0.12;
// MPI as a station (lead's merge, arithmetic audit F14): 75 s a part × (UK inspector £/h × 1 + a £4/h bench), the
// casting route's NDT_STATION.mpi — written out here from the rate book, not imported.
const MPI_GBP = Math.round(75 / 3600 * (DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-inspector')!.fullyLoadedRatePerHr * 1 + 4) * 100) / 100;
const DIE_LIFE_BASE = 38_000;                                 // microalloyed steel
const OVERHEAD = 0.12, MARGIN = 0.08;
const TN = 9806.65;

type Row = { kind: string; diaMm: number; depthMm: number; count: number; areaMm2?: number };
const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machineRate = (id: string) => lib.machines.find(m => m.id === id)!.computedRatePerHr;
const labourRate = (id: string) => lib.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const tariff = lib.energy.find(e => e.id === 'energy-uk')!.electricityPerKwh;

let pass = 0, fail = 0;
const out: string[] = [];
function check(part: string, what: string, mine: number | string, theirs: number | string | undefined, tol: { abs?: number; rel?: number } = { rel: 0.005 }) {
  let ok: boolean;
  if (typeof mine === 'string' || typeof theirs === 'string') ok = String(mine) === String(theirs);
  else {
    const t = Number(theirs);
    const lim = Math.max(tol.abs ?? 0, (tol.rel ?? 0) * Math.abs(mine));
    ok = Number.isFinite(t) && Math.abs(mine - t) <= lim + 1e-12;
  }
  ok ? pass++ : fail++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${part.padEnd(24)} ${what.padEnd(46)} mine ${fmt(mine)}  tool ${fmt(theirs)}`);
}
const fmt = (v: unknown) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(6)) : String(v);
const has = (part: string, what: string, text: string, re: RegExp) => check(part, what, re.test(text) ? 'yes' : 'no', 'yes');
const pence = { abs: 0.005 };

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: any }>;

for (const name of PARTS) {
  const file = join(DUMP, `${name}.json`);
  if (!existsSync(file)) { out.push(`FAIL  ${name}: no dump at ${file}`); fail++; continue; }
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const g = base.find(p => p.part.replace(/\.(stp|step)$/i, '') === name)!.geometry;
  const prov = d.provenance as Record<string, { value: unknown; basis: string }>;
  const P = d.params as Record<string, any>;
  const safety = d.answers['service.safetyCritical'] === 'yes';

  // ── Geometry → as-forged weight ──
  const mat = lib.materials.find(m => m.id === 'mat-steel-38mnvs6')!;
  const rho = mat.densityKgPerM3 / 1e6;                                       // kg/cm³
  const finished = g.volume.cm3 * rho;
  const rows = (g.featureTable ?? []) as Row[];
  const drilled = rows.filter(r => r.kind === 'hole' && r.diaMm <= PIERCE_ABOVE_MM)
    .reduce((s, r) => s + Math.PI * r.diaMm ** 2 / 4 * Math.max(r.depthMm, 0) * r.count, 0) / 1000;
  let stockMm3 = 0;
  for (const r of rows) {
    if (r.kind === 'face') stockMm3 += (r.areaMm2 ?? 0) * r.count * STOCK_MM;
    else if (r.kind === 'hole' && r.diaMm > PIERCE_ABOVE_MM) stockMm3 += Math.PI * r.diaMm * Math.max(r.depthMm, 0) * r.count * STOCK_MM;
  }
  const stock = Math.round(stockMm3 / 100) / 10;
  const forged = Math.round((finished + (drilled + stock) * rho) * 1000) / 1000;
  check(name, 'as-forged kg (finished + drilled + stock)', forged, P.partWeightKg, { abs: 0.0015 });

  // ── Plan area, shape, press ──
  const pa = g.projectedArea;
  const A = Math.round(Math.max(pa.xMm2, pa.yMm2, pa.zMm2) / 100 * 10) / 10;
  check(name, 'plan area cm² (largest silhouette)', A, P.projectedAreaCm2, { abs: 0.05 });
  const ff = g.features?.freeFormFaceCount ?? 0, uc = g.draftAnalysis?.undercutFaceCount ?? 0, faces = g.faces?.total ?? 0;
  const score = (ff >= 8 ? 2 : ff >= 3 ? 1 : 0) + (uc >= 4 ? 1 : 0) + (faces >= 120 ? 1 : 0);
  const raw = score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
  // The stated demotion: a complex score on a square axisymmetric envelope, or with ≥ 55% of the faces cylinders /
  // cones / tori, is costed moderate ("formed in round dies"). The knuckle takes it — see F16 (proposal).
  const by = g.faces?.byType ?? {};
  const revShare = ((by.CYLINDER ?? 0) + (by.CONE ?? 0) + (by.TORUS ?? 0)) / Math.max(1, faces);
  const bb = [g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm].sort((x: number, y: number) => y - x);
  const axi = bb[1] > 0 && bb[0] / bb[1] <= 1.05;
  const shape = raw === 'complex' && (axi || revShare >= 0.55) ? 'moderate' : raw;
  check(name, 'shape complexity', shape, String(prov['forge-shape'].value));
  has(name, 'shape basis prints the score that gives it', prov['forge-shape'].basis,
    new RegExp(`= ${score} → ${raw}${raw !== shape ? `[\\s\\S]*so ${shape}` : ''}`));
  const sq = Math.sqrt(A * 100);
  const perim = 4.4 * sq, thick = Math.max(1, 0.015 * sq), landCm2 = perim * 3 * thick / 100;
  const tonnes = Math.round(KT[shape] * FLOW_MICROALLOYED * (A + landCm2) * 100 / TN);
  const press = FORGE_LADDER.find(t => t >= tonnes * 1.2) ?? 8000;
  check(name, 'forge press', `forge-press-${press}t`, P.forgeId);
  const mach = prov['forge-mach'].basis;
  has(name, 'press basis prints Kt and σflow values', mach, new RegExp(`Kt ${KT[shape]}\\b.*σflow ${FLOW_MICROALLOYED} MPa`));
  has(name, 'press basis prints the force arithmetic', mach,
    new RegExp(`${KT[shape]} × ${FLOW_MICROALLOYED} MPa × [\\d,]+ mm² ÷ 9,806.65 N/t = ${tonnes} t × 1\\.2 safety = ${Math.round(tonnes * 1.2)} t`));
  const trimT = perim * thick * FLOW_MICROALLOYED / TN;
  const trim = STAMP_LADDER.find(t => t >= trimT * 1.25) ?? 1250;
  check(name, 'trim press', `press-${trim}t`, P.trimmingMachineId);
  has(name, 'trim basis prints the 1.25 margin result', prov['forge-trim-mach'].basis, /× 1\.25 margin = [\d.]+ t → the \d+ t press/);

  // ── Line takt ──
  const extra = shape === 'complex' ? 2 : shape === 'moderate' ? 1 : 0;
  const hits = IMPRESSIONS + extra;
  const hitS = press >= 4000 ? HIT_S_HYD : HIT_S_MECH;
  const cycleHr = Math.round((LOAD_S + hits * hitS) / 3600 * 1e6) / 1e6;
  check(name, 'hits', hits, P.strokesToForm, { abs: 0 });
  check(name, 'forge takt h', cycleHr, P.cycleTimeHr, { abs: 1e-7 });
  check(name, 'trim takt h (in line)', cycleHr, P.trimmingCycleHr, { abs: 1e-7 });
  check(name, 'crew forge / trim', `${CREW}/${TRIM_CREW}`, `${P.manning}/${P.trimmingManning}`);

  // ── Billet ──
  const yieldFraction = Math.round(BAND_MID * (1 + FLASH) * 1000) / 1000;
  const flashKg = Math.round(forged * FLASH * 1000) / 1000;
  // Downstream of the checked as-forged weight, the tool's own figure is carried (its finished mass is rounded to
  // 3 dp before the stock is added — a 1 g difference on the hub flange, inside the 1.5 g tolerance above).
  const forgedT = Number(P.partWeightKg), flashT = Number(P.flashAndScaleKg);
  const billet = (forgedT + flashT) / yieldFraction;
  const uplift = 1 / (1 - REJECT);
  check(name, 'yield fraction', yieldFraction, P.yieldFraction, { abs: 0.0005 });
  check(name, 'flash kg', flashKg, P.flashAndScaleKg, { abs: 0.0015 });
  const rm = d.trace.drivers.rawMaterial;
  check(name, 'material utilisation = forging ÷ billet', P.partWeightKg / billet, rm.materialUtilization, { rel: 0.001 });
  check(name, 'net kg = forging ÷ (1 − scrap)', P.partWeightKg * uplift, rm.netWeightKg, { rel: 0.0005 });
  has(name, 'yield basis prints the billet arithmetic', prov['forge-yield'].basis,
    new RegExp(`= ${(forgedT + flashT).toFixed(3)} kg ÷ ${yieldFraction.toFixed(3)} = ${billet.toFixed(3)} kg`));

  // ── Die ──
  const cf = shape === 'complex' ? 1.4 : shape === 'simple' ? 0.8 : 1.0;
  const area = Math.max(10, A);
  const heightCm = Math.max(18, Math.sqrt(area) + 4);
  const steelKg = area * 4 * heightCm * 2 * 1.15 * 7.85e-3 + P.partWeightKg * 3;
  const sinkHrs = (40 + 0.9 * area ** 0.85) * cf * IMPRESSIONS;
  const r0 = Math.round, T = TOOLROOM_RATES_UK;
  const dieLines = [
    r0((20 + 0.15 * sinkHrs) * T.design), r0(steelKg * TOOL_MATERIAL_GBP_PER_KG.h13), r0((30 + 0.05 * steelKg) * T.cnc),
    r0(sinkHrs * T.cnc), r0(0.25 * sinkHrs * cf * T.edm), r0(2500 + steelKg * 2.2), r0(IMPRESSIONS * 16 * cf * T.polish),
    r0(18 * T.tryoutPress),
  ];
  const sub = dieLines.reduce((s, v) => s + v, 0);
  const die = r0(sub + r0(sub * SHOP_OVERHEAD_PROFIT));
  check(name, 'die set £ (toolmaker build-up)', die, P.dieCost, { abs: 2 });
  has(name, 'die basis re-adds to the die set', prov['forge-die-cost'].basis,
    new RegExp(`£${(Number(P.dieCost)).toLocaleString('en-GB')}`));
  has(name, 'die basis no longer calls the residual "block"', prov['forge-die-cost'].basis, /^(?![\s\S]*£\d+ block)/);
  const sizeF = A <= 100 ? 1 : (100 / A) ** 0.2;
  const life = Math.max(250, r0(DIE_LIFE_BASE * (shape === 'complex' ? 0.6 : shape === 'simple' ? 1.3 : 1) * sizeF));
  check(name, 'die life', life, P.dieLife, { abs: 0 });
  has(name, 'die-life basis prints its factors', prov['forge-die-life'].basis, new RegExp(`38,000 .* × ${sizeF.toFixed(6)} size = ${life.toLocaleString('en-GB')}`));

  // ── Per-part services (every forging made, scrap included) ──
  const kwh = HEAT_KWH_PER_KG * billet * uplift;
  check(name, 'heating kWh (billet × scrap uplift)', kwh, rm.energyKwh?.electricity, { rel: 0.0005 });
  const descale = DESCALE_GBP_KG * P.partWeightKg * uplift;
  const item = (label: string) => (rm.consumablesItems ?? []).find((i: { label: string }) => i.label === label)?.gbp ?? 0;
  check(name, 'descale £ (per kg of FORGING)', descale, item('descale'), pence);
  check(name, 'NDT £', safety ? MPI_GBP * uplift : 0, item('NDT'), pence);
  check(name, 'heat treat £ (38MnVS6 controlled-cooled)', 0, item('heat treatment'), pence);
  const machCons = Number(P.secondaryMachiningConsumablesPerPart ?? 0);
  const consumables = descale + (safety ? MPI_GBP * uplift : 0) + machCons;
  check(name, 'consumables £', consumables, rm.consumablesCostPerPart, pence);

  // ── Operations ──
  const fOps = d.trace.operations as Array<any>;
  const forgeOp = fOps.find(o => o.operationName === 'Forging');
  const trimOp = fOps.find(o => o.operationName === 'Flash Trimming');
  const forgeProc = cycleHr * uplift / OEE * machineRate(P.forgeId);
  const forgeLab = cycleHr * uplift * CREW * labourRate('lab-uk-forge') / EFF;
  const trimProc = cycleHr * uplift / OEE * machineRate(P.trimmingMachineId);
  const trimLab = cycleHr * uplift * TRIM_CREW * labourRate('lab-uk-forge') / EFF;
  check(name, 'forge op process £', forgeProc, forgeOp?.processCost, pence);
  check(name, 'forge op labour £', forgeLab, forgeOp?.labourCost, pence);
  check(name, 'trim op process £', trimProc, trimOp?.processCost, pence);
  check(name, 'trim op labour £', trimLab, trimOp?.labourCost, pence);
  let secProc = 0, secLab = 0;
  for (const o of (P.secondaryMachiningOps ?? []) as Array<any>) {
    secProc += o.cycleTimeHr / o.partsPerCycle / o.oee * machineRate(o.machineId);
    secLab += o.labourTimeHr * o.manning * labourRate(o.labourId) / o.partsPerCycle / o.labourEfficiency;
  }
  // a station whose cycle is 0 (labour-only bench op) still costs its labour — included above

  // ── Buckets ──
  const gross = P.partWeightKg * uplift / (P.partWeightKg / billet);
  const material = gross * mat.pricePerKg - (gross - P.partWeightKg * uplift) * mat.scrapRecoveryPricePerKg
    + consumables + kwh * tariff;
  const tooling = (die * Math.max(1, AMORT / life) + Number(P.secondaryMachiningToolingCost ?? 0)) / AMORT;
  const process_ = forgeProc + trimProc + secProc;
  const labour = forgeLab + trimLab + secLab;
  const pkg = d.trace.stackInput.packagingPerPart, log = d.trace.stackInput.logisticsPerPart;   // shop defaults (not forging's)
  check(name, 'overhead % / margin %', `${OVERHEAD}/${MARGIN}`, `${d.trace.stackInput.overheadPct}/${d.trace.stackInput.marginPct}`);
  const factory = material + process_ + labour + tooling + pkg + log;
  const overhead = OVERHEAD * (factory - pkg - log);
  const margin = MARGIN * (factory + overhead);
  const B = d.breakdown;
  check(name, 'bucket rawMaterial', material, B.rawMaterial, pence);
  check(name, 'bucket process', process_, B.process, pence);
  check(name, 'bucket labour', labour, B.labour, pence);
  check(name, 'bucket tooling', tooling, B.tooling, pence);
  check(name, 'bucket overhead', overhead, B.overhead, pence);
  check(name, 'bucket margin', margin, B.margin, pence);
  check(name, 'TOTAL', factory + overhead + margin, d.total, pence);
  out.push(`      ${name}: billet ${billet.toFixed(3)} kg, ${tonnes} t → ${press} t press, takt ${(cycleHr * 3600).toFixed(0)} s, die £${die} / ${life} → total £${(factory + overhead + margin).toFixed(4)}`);
}

console.log(out.join('\n'));
console.log(`\nforging shadow model: ${pass} PASS, ${fail} FAIL  (${DUMP})`);
process.exit(fail ? 1 : 0);

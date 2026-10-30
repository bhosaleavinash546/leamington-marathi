/**
 * Arithmetic audit — INJECTION MOULDING shadow model (30 Oct 2026).
 *
 * Recomputes every real moulded part from its MEASURED geometry (tests/fixtures/real-parts-baseline.json), the rate
 * book and the baseline's answers — WITHOUT calling the module, the rule pack, the cavitation optimiser or the
 * toolmaking build-up functions — and compares each rule input, operation, material line, tool and bucket with the
 * dump of the product's own headless chain (scripts/arith-audit/dump.ts).
 *
 *   npx tsx scripts/arith-audit/injection-moulding.ts <dumpDir>
 *
 * The constants below are COPIES of the ones under audit (each named with its file); the arithmetic is written out
 * here a second time. Packaging and logistics are the envelope estimate shared by every commodity
 * (geometry-sanity.ts) and are taken from the dump's stack input as given. Exit 1 on any FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import {
  TOOLROOM_RATES_UK, TOOL_MATERIAL_GBP_PER_KG, BOUGHT_OUT_GBP, SHOP_OVERHEAD_PROFIT,
} from '../../src/engine/toolmaking.js';

const dumpDir = process.argv[2] ?? 'arith-dump';
const PARTS = ['IM_ECU_Cover', 'IM_Cable_Clip', 'IM_Storage_Tray'];
const ANNUAL = 50_000, YEARS = 5, AMORT = ANNUAL * YEARS;

// ── constants under audit (copied) ─────────────────────────────────────────────
const CAVITY_P: Record<string, number> = { 'mat-pa66gf30': 55 + 10, 'mat-pp-impact': 35 };      // derive/resin.ts
const CURATED_COOL: Record<string, number> = { 'mat-pa66gf30': 2.0, 'mat-pp-impact': 3.16 };   // modules/injection-moulding.ts
const HYGROSCOPIC: Record<string, boolean> = { 'mat-pa66gf30': true, 'mat-pp-impact': false };
const PRESSES = [ // modules/injection-moulding.ts IMM_PRESSES + DRY_CYCLE_S + INJECTION_RATE_CM3_S
  { id: 'imm-50t', t: 50, shot: 80, tie: 320, dry: 1.5, inj: 40 },
  { id: 'imm-100t', t: 100, shot: 180, tie: 410, dry: 2.0, inj: 70 },
  { id: 'imm-200t', t: 200, shot: 450, tie: 560, dry: 2.5, inj: 120 },
  { id: 'imm-350t', t: 350, shot: 900, tie: 710, dry: 3.0, inj: 200 },
  { id: 'imm-400t', t: 400, shot: 1100, tie: 760, dry: 3.5, inj: 280 },
  { id: 'imm-500t', t: 500, shot: 1500, tie: 810, dry: 3.5, inj: 280 },
  { id: 'imm-800t', t: 800, shot: 2800, tie: 1000, dry: 4.5, inj: 420 },
  { id: 'imm-1200t', t: 1200, shot: 4500, tie: 1250, dry: 6.0, inj: 600 },
  { id: 'imm-2000t', t: 2000, shot: 8000, tie: 1550, dry: 8.0, inj: 900 },
  { id: 'imm-3500t', t: 3500, shot: 16000, tie: 2100, dry: 11.0, inj: 1400 },
];
const SHOT_USE = 0.8, TAKE_OUT = 1.0, SAFETY = 1.15, RUNNER_AREA = 1.1, MAX_CLAMP = 3500;
const REJECT = 0.02, OEE = 0.85, LAB_EFF = 0.95, MAINT = 0.03, DRY_KWH = 0.15;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machineRate = (id: string) => book.machines.find(m => m.id === id)!.computedRatePerHr;
const labourRate = (id: string) => book.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
const material = (id: string) => book.materials.find(m => m.id === id)!;
const tariff = book.energy[0].electricityPerKwh;

let pass = 0, fail = 0;
const lines: string[] = [];
function check(part: string, what: string, mine: number | string, theirs: number | string, tol: number | 'rel' = 0.005) {
  let ok: boolean;
  if (typeof mine === 'number' && typeof theirs === 'number') {
    ok = tol === 'rel' ? Math.abs(mine - theirs) <= 0.005 * Math.max(Math.abs(theirs), 1e-9) : Math.abs(mine - theirs) <= tol;
  } else ok = String(mine) === String(theirs);
  ok ? pass++ : fail++;
  const f = (v: number | string) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(7)) : v;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${part.padEnd(16)} ${what.padEnd(44)} shadow ${String(f(mine)).padEnd(14)} product ${f(theirs)}`);
}

// ── the toolmaker build-up, by hand (toolmaking.ts + estimateMouldCost, re-derived) ─────────────────────────
function mouldBuildUp(n: number, areaPerCav: number, cls: string, slides: number, hotDrops: number): number {
  const steel = ({ prototype: ['al-7075', 0.55, 0], standard: ['p20', 1.0, 0], production: ['p20-hard', 1.12, 0],
    high_volume: ['h13', 1.2, 6000] } as Record<string, [keyof typeof TOOL_MATERIAL_GBP_PER_KG, number, number]>)[cls];
  const a = Math.max(4, areaPerCav);
  const d = Math.min(45, Math.max(3, 0.4 * Math.sqrt(a)));         // footprint-derived depth (none passed)
  const depthF = 1 + Math.max(0, d - 0.4 * Math.sqrt(a)) / 60;    // > 1 only where the 3 cm floor lifts d (small parts)
  const H = (12 + 3.4 * a ** 0.72) * depthF * steel[1];
  const nE = n ** 0.9;
  const R = TOOLROOM_RATES_UK;
  const costs = [
    Math.round((30 + 0.2 * H) * R.design),
    Math.round(1200 + 9.5 * Math.max(10, areaPerCav * n) ** 0.85),
    Math.round(a * (d + 10) * 2 * 1.25 * 7.85e-3 * nE * TOOL_MATERIAL_GBP_PER_KG[steel[0]]),
    Math.round(H * nE * R.cnc),
    Math.round(0.125 * H * nE * R.edm),                              // moderate complexity
    Math.round(0.10 * H * nE * R.polish),                            // standard finish
    Math.round(0.25 * H * nE * R.fitting),
    Math.round((2 + Math.ceil(n / 2) + (areaPerCav > 2000 ? 2 : 0)) * 8 * R.tryoutPress),
    ...(slides > 0 ? [Math.round(slides * BOUGHT_OUT_GBP.corePullCylinder), Math.round(slides * (28 + areaPerCav / 200) * R.fitting)] : []),
    ...(hotDrops > 0 ? [Math.round(hotDrops * BOUGHT_OUT_GBP.hotRunnerPerDrop), BOUGHT_OUT_GBP.hotRunnerController] : []),
    ...(steel[2] > 0 ? [steel[2]] : []),
  ];
  const sub = costs.reduce((s, c) => s + c, 0);
  return Math.round(sub + Math.round(sub * SHOP_OVERHEAD_PROFIT));
}

const steelFor = (shots: number) => shots <= 25_000 ? ['prototype', 50_000] as const : shots <= 100_000 ? ['standard', 500_000] as const
  : shots <= 1_000_000 ? ['production', 1_000_000] as const : ['high_volume', 5_000_000] as const;
const crewFor = (pressT: number) => pressT > 500 ? 1 : 0.5;

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, '../../tests/fixtures/real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: any }>;

for (const P of PARTS) {
  const d = JSON.parse(readFileSync(join(dumpDir, `${P}.json`), 'utf8'));
  const g = fixture.find(f => f.part === `${P}.stp`)!.geometry;
  const prov = (k: string) => d.provenance[k]?.value;
  const matId = d.answers['material.resin'] as string;
  const mat = material(matId);

  // 1. Measured inputs
  const wt = g.wallThickness, sm = g.sheetMetal;
  const wall = (wt.method === 'volume_surface_shell' && sm?.thicknessSource === 'bend-pairs' && sm.thicknessMm >= sm.bulkWallMm
      && sm.thicknessMm <= 1.5 * sm.bulkWallMm) ? r1(sm.thicknessMm)
    : (wt.method === 'ray_cast' && wt.p95Mm && wt.p95Mm > wt.meanMm) ? r1(Math.min(wt.p95Mm, 2 * wt.meanMm)) : r1(wt.meanMm);
  const area = r1(g.projectedArea.alongDrawMm2 / 100);
  const V = g.volume.cm3, rho = mat.densityKgPerM3;
  const mass = r4(V * rho / 1e6);
  check(P, 'wall mm (measured)', wall, prov('imm-wall'), 0.001);
  check(P, 'projected area cm² (measured)', area, prov('imm-area'), 0.001);
  check(P, 'part kg = V × ρ', mass, prov('imm-part-wt'), 0.00005);

  // 2. Resin-driven
  const Pc = CAVITY_P[matId], f = CURATED_COOL[matId];
  check(P, 'cavity pressure MPa', Pc, prov('imm-cav-press'), 0.001);
  check(P, 'cool factor s/mm²', f, prov('imm-cool-f'), 0.001);
  const hot = mass >= 0.25 || ANNUAL >= 1_000_000;
  const drops = Math.max(1, Math.ceil(area / 1500));
  check(P, 'runner system', hot ? 'hot' : 'cold', prov('imm-runner-sys'));
  const runnerKg = (n: number) => hot ? 0 : r4(Math.max(0.15 * mass * n, 0.003 * n));

  // 3. Cavitation, ranked in £ at the COSTING's conventions (OEE 0.85, efficiency 0.95, crew per press, maintenance)
  const draw = g.draftAnalysis.drawDirectionXYZ as number[];
  const dims = [g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm];
  const ax = draw.findIndex(c => Math.abs(c) > 0.99);
  const across = dims.filter((_, i) => i !== ax);
  const slides = g.draftAnalysis.undercutFaceCount ? Math.min(6, Math.ceil(g.draftAnalysis.undercutFaceCount / 6)) : 0;
  check(P, 'slides = ⌈undercut faces ÷ 6⌉', slides, prov('imm-side-actions'), 0);
  const lab = labourRate('lab-uk-semiskilled');
  type Cand = { n: number; press: typeof PRESSES[number]; cycle: number; fill: number; pack: number; cool: number; eject: number;
    tool: number; cls: string; life: number; perPart: number; clamp: number };
  const cands: Cand[] = [];
  for (const n of [1, 2, 4, 8]) {
    const clamp = Math.round(area * n * (hot ? 1 : RUNNER_AREA) * Pc * 100 * SAFETY / 9806.65);   // cm²·MPa·100 = N
    if (clamp > MAX_CLAMP && n > 1) continue;
    const shot = n * V + runnerKg(n) / (rho / 1e6);
    const rows = Math.max(1, Math.floor(Math.sqrt(n))), cols = Math.ceil(n / rows);
    const shortSide = Math.min(rows * (Math.min(...across) + 40) + 120, cols * (Math.max(...across) + 40) + 120);
    const press = PRESSES.find(p => p.t >= clamp && shot <= p.shot * SHOT_USE && shortSide <= p.tie) ?? PRESSES[PRESSES.length - 1];
    const fill = Math.max(1.5, r1(shot / press.inj)), pack = Math.max(2.0, r1(wall * 0.8)), cool = f * wall ** 2;
    const eject = r1(press.dry + TAKE_OUT);
    const cycle = fill + pack + cool + eject;
    const [cls, life] = steelFor(ANNUAL * YEARS / n);
    const tool = mouldBuildUp(n, area, cls, slides, hot ? n * drops : 0);
    const moulds = Math.max(1, Math.ceil(AMORT / n / life));
    const shotHr = cycle / 3600 / (1 - REJECT);
    const perPart = r4(shotHr * (machineRate(press.id) / OEE + lab * crewFor(press.t) / LAB_EFF) / n
      + tool * moulds * (1 + MAINT * YEARS) / AMORT);
    cands.push({ n, press, cycle, fill, pack, cool, eject, tool, cls, life, perPart, clamp });
  }
  cands.sort((a, b) => a.perPart - b.perPart || a.n - b.n);
  const c = cands[0];
  check(P, 'cavities (cheapest at costing conventions)', c.n, prov('imm-cav'), 0);
  check(P, 'press', c.press.id, prov('imm-mach'));
  check(P, 'fill s = shot ÷ injection rate', c.fill, prov('imm-fill'), 0.001);
  check(P, 'pack s = 0.8 × wall', c.pack, prov('imm-pack'), 0.001);
  check(P, 'eject s = dry cycle + take-out', c.eject, prov('imm-eject'), 0.001);
  check(P, 'runner kg/shot', runnerKg(c.n), prov('imm-runner-wt'), 0.00005);
  check(P, 'steel class', c.cls, prov('imm-steel-class'));
  check(P, 'mould life shots', c.life, prov('imm-mould-life'), 0);
  check(P, 'mould £ (toolmaker build-up)', c.tool, prov('imm-mould-cost'), 0.5);
  // every candidate's printed £/part must be the costing-convention figure
  for (const k of cands) {
    const m = new RegExp(`${k.n}-up £([\\d.]+)/part`).exec(String(d.provenance['imm-cav'].basis));
    check(P, `printed ${k.n}-up £/part`, k.perPart, m ? Number(m[1]) : NaN, 0.00005);
  }

  // 4. Other rules
  const runner = runnerKg(c.n), shotKg = mass * c.n + runner;
  const regrind = hot ? 0 : Math.round(Math.min(0.8, 0.2 * shotKg / runner) * 100) / 100;
  check(P, 'regrind = min(0.8, 0.2 × shot ÷ runner)', regrind, prov('imm-regrind'), 0.001);
  const crew = crewFor(c.press.t);
  check(P, 'crew per press', crew, prov('imm-manning'), 0);
  check(P, 'reject', REJECT, prov('imm-reject'), 0);
  const setupH = c.press.t <= 200 ? 1.5 : c.press.t <= 800 ? 2.5 : 4;
  const purge = c.press.t <= 200 ? 2 : c.press.t <= 800 ? 5 : 10;
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  check(P, 'mould change h', setupH, prov('imm-setup-hr'), 0);
  check(P, 'purge kg / change', purge, prov('imm-purge'), 0);
  check(P, 'batch = annual ÷ 20', batch, prov('imm-batch'), 0);
  check(P, 'maintenance / yr', MAINT, prov('imm-maint'), 0);
  check(P, 'maintenance years (params)', YEARS, d.params.maintenanceYears, 0);
  check(P, 'maintenance basis names those years', /each of the (\d+) year/.exec(String(d.provenance['imm-maint'].basis))?.[1] ?? 'missing', String(YEARS));
  check(P, 'drying kWh/kg', HYGROSCOPIC[matId] ? DRY_KWH : 0, prov('imm-dry-kwh'), 0);

  // 5. The module: operations
  const ru = 1 / (1 - REJECT);
  const cycHr = c.cycle / 3600 * ru;
  const pr = machineRate(c.press.id);
  const ops = d.trace.operations as Array<Record<string, number & string>>;
  const mo = ops.find(o => o.operationName === 'Injection Moulding')!;
  check(P, 'moulding cycle h (÷ (1 − reject))', cycHr, mo.cycleTimeHr, 1e-9);
  check(P, 'moulding parts / cycle', c.n, mo.partsPerCycle, 0);
  const procMould = pr * cycHr / c.n / OEE, labMould = lab * crew * cycHr / c.n / LAB_EFF;
  check(P, 'moulding machine £ = rate × h ÷ n ÷ OEE', procMould, mo.processCost);
  check(P, 'moulding labour £ = rate × crew × h ÷ n ÷ eff', labMould, mo.labourCost);
  const ch = ops.find(o => /Mould change/.test(o.operationName))!;
  const tech = labourRate('lab-uk-technician');
  check(P, 'mould change machine £ = rate × h ÷ batch', pr * setupH / batch, ch.processCost);
  check(P, 'mould change setter £ = rate × h ÷ batch', tech * setupH / batch, ch.labourCost);

  // 6. Material (per GOOD part): rejects carry their part + runner waste; the purge is per change
  const rwaste = runner / c.n * (1 - regrind);
  const net = mass * ru, gross = (mass + rwaste) * ru + purge / batch;
  const kwh = HYGROSCOPIC[matId] ? (mass + runner / c.n) * ru * DRY_KWH : 0;
  const matCost = gross * mat.pricePerKg - (gross - net) * mat.scrapRecoveryPricePerKg + kwh * tariff;
  check(P, 'net kg = part ÷ (1 − reject)', net, d.trace.drivers.rawMaterial.netWeightKg, 1e-7);
  check(P, 'material £', matCost, d.trace.result.breakdown.rawMaterial);

  // 7. Tooling
  const moulds = Math.max(1, Math.ceil(AMORT / c.n / c.life));
  const toolTotal = c.tool * moulds * (1 + MAINT * YEARS);
  check(P, 'tooling total £ (× maintenance)', toolTotal, d.trace.drivers.tooling.totalToolingCost, 0.5);
  const toolPP = toolTotal / AMORT;
  check(P, 'tooling £/part', toolPP, d.trace.result.breakdown.tooling);
  // the chosen row's printed £/part = the costing's moulding machine + labour + tooling
  check(P, 'chosen row £/part = costing mould m+l+tool', c.perPart, r4(mo.processCost + mo.labourCost + d.trace.result.breakdown.tooling), 0.00005);

  // 8. Buckets
  const proc = procMould + pr * setupH / batch, labr = labMould + tech * setupH / batch;
  const pk = d.trace.stackInput.packagingPerPart, lg = d.trace.stackInput.logisticsPerPart;
  const base = matCost + proc + labr + toolPP;
  const oh = 0.12 * base, sub = base + pk + lg + oh, mg = 0.08 * sub, tot = sub + mg;
  const b = d.trace.result.breakdown;
  check(P, 'process £', proc, b.process);
  check(P, 'labour £', labr, b.labour);
  check(P, 'overhead £ = 12% × factory base', oh, b.overhead);
  check(P, 'margin £ = 8% × subtotal', mg, b.margin);
  check(P, 'TOTAL £', tot, d.trace.result.total);
}

console.log(lines.join('\n'));
console.log(`\n${pass + fail} checks: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

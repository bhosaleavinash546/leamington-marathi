/**
 * Arithmetic audit — BLOW MOULDING, ROTATIONAL MOULDING, THERMOFORMING (group `hollow-forming`, 30 Oct 2026).
 *
 * An independent shadow model: for each real part of the group it recomputes, from the MEASURED geometry
 * (tests/fixtures/real-parts-baseline.json), the rate book and the baseline's answers, every rule-derived input,
 * every operation's time and £, the material line, the tooling and the 8 buckets — WITHOUT calling the rule packs,
 * the modules or their advisors. The constants below are the ones the rules state on their basis lines (each is
 * labelled there); the arithmetic is written out again here. It then compares with the product's own headless
 * dump (scripts/arith-audit/dump.ts) and prints PASS / FAIL per check; exit 1 on any FAIL.
 *
 *   npx tsx scripts/arith-audit/dump.ts <dumpDir>
 *   npx tsx scripts/arith-audit/hollow-forming.ts <dumpDir>
 *
 * Tolerances: £ to ½ p; inputs to 0.5 % (or exact for counts / ids).
 * Packaging, logistics, overhead % and margin % are the shop defaults (another group's rules) and are read from
 * the dump's stack input, not recomputed here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { TOOLROOM_RATES, TOOL_MATERIAL_GBP_PER_KG, SHOP_OVERHEAD_PROFIT } from '../../src/engine/toolmaking.js';

const here = dirname(fileURLToPath(import.meta.url));
const dumpDir = process.argv[2] ?? join(here, 'dump');
const baseline = JSON.parse(readFileSync(join(here, '../../tests/fixtures/real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: any }>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

const ANNUAL = 50_000, YEARS = 5, AMORT = ANNUAL * YEARS;

let fails = 0, passes = 0;
const out: string[] = [];
function chk(part: string, what: string, got: number | string | boolean | undefined, want: number | string | boolean, kind: 'gbp' | 'input' | 'exact' = 'input') {
  let ok: boolean;
  if (typeof want === 'number' && typeof got === 'number') {
    ok = kind === 'gbp' ? Math.abs(got - want) <= 0.005
      : kind === 'exact' ? got === want
      : Math.abs(got - want) <= Math.max(1e-9, 0.005 * Math.abs(want));
  } else ok = got === want;
  if (ok) passes++; else fails++;
  const f = (v: unknown) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(6)) : String(v);
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${part.padEnd(24)} ${what.padEnd(34)} model ${f(want).padStart(14)}   tool ${f(got).padStart(14)}`);
}

const mat = (id: string) => { const m = book.materials.find(x => x.id === id); if (!m) throw new Error(id); return m; };
const machineRate = (id: string) => { const m = book.machines.find(x => x.id === id); if (!m) throw new Error(id); return m.computedRatePerHr; };
const labourRate = (id: string) => { const l = book.labour.find(x => x.id === id); if (!l) throw new Error(id); return l.fullyLoadedRatePerHr; };
const r = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

interface Op { name: string; machineId: string; labourId: string; hr: number; ppc: number; oee: number; manning: number; labourHr: number; eff: number }
interface Model { material: number; ops: Op[]; toolingTotal: number }

/** Re-add the 8 buckets the way computeUniversalStack is documented to (core.ts §1–8). */
function buckets(part: string, d: any, m: Model) {
  const si = d.trace.stackInput;
  const process = m.ops.reduce((s, o) => s + machineRate(o.machineId) * o.hr / o.ppc / o.oee, 0);
  const labour = m.ops.reduce((s, o) => s + labourRate(o.labourId) * o.manning * o.labourHr / o.ppc / o.eff, 0);
  const tooling = m.toolingTotal / AMORT;
  const base = m.material + process + labour + tooling;
  const overhead = si.overheadPct * base;
  const subtotal = base + si.packagingPerPart + si.logisticsPerPart + overhead;
  const margin = si.marginPct * subtotal;
  const b = d.breakdown;
  chk(part, 'bucket rawMaterial £', b.rawMaterial, m.material, 'gbp');
  chk(part, 'bucket process £', b.process, process, 'gbp');
  chk(part, 'bucket labour £', b.labour, labour, 'gbp');
  chk(part, 'bucket tooling £', b.tooling, tooling, 'gbp');
  chk(part, 'bucket overhead £', b.overhead, overhead, 'gbp');
  chk(part, 'bucket margin £', b.margin, margin, 'gbp');
  chk(part, 'TOTAL £', d.total, subtotal + margin, 'gbp');
  // per operation
  m.ops.forEach((o, i) => {
    const t = d.trace.operations[i];
    chk(part, `op${i + 1} ${o.name} machine`, t?.machineId, o.machineId);
    chk(part, `op${i + 1} cycle h`, t?.cycleTimeHr, o.hr);
    chk(part, `op${i + 1} parts/cycle`, t?.partsPerCycle, o.ppc, 'exact');
    chk(part, `op${i + 1} oee`, t?.oee, o.oee);
    chk(part, `op${i + 1} manning × labour h`, (t?.manning ?? 0) * (t?.labourTimeHr ?? 0), o.manning * o.labourHr);
    chk(part, `op${i + 1} process £`, t?.processCost, machineRate(o.machineId) * o.hr / o.ppc / o.oee, 'gbp');
    chk(part, `op${i + 1} labour £`, t?.labourCost, labourRate(o.labourId) * o.manning * o.labourHr / o.ppc / o.eff, 'gbp');
  });
  chk(part, 'operation count', d.trace.operations.length, m.ops.length, 'exact');
  chk(part, 'tooling investment £', d.trace.drivers.tooling.totalToolingCost, m.toolingTotal, 'gbp');
}

const dims = (g: any): [number, number, number] => [g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm].sort((a: number, b: number) => b - a) as [number, number, number];

// ── Blow moulding ────────────────────────────────────────────────────────────
const BM_COOL: Record<string, number> = { 'mat-pp-bm': 3.16, 'mat-hdpe-bm': 3.5 };   // curated s/mm² (rule prints it)
const BM_CAPACITY: Record<string, (g: any) => number> = {
  'BM_Air_Duct.stp': () => 2.5,                                               // answered exactly
  'BM_Washer_Reservoir.stp': g => {                                           // band 2–20 L, capped at the envelope
    const b = g.boundingBox; const bound = r(b.xMm * b.yMm * b.zMm * (1 - g.fillRatio) / 1e6, 2);
    return bound < 10 ? r(Math.max(2, bound), 2) : 10;
  },
};
function blow(part: string, g: any, d: any, resin: string) {
  const m = mat(resin);
  const p = d.params;
  const wall = r(2 * g.volume.mm3 / g.surfaceArea.mm2, 2);
  const kg = r(g.volume.cm3 * m.densityKgPerM3 / 1e6, 4);
  const L = BM_CAPACITY[part](g);
  const flash = r(kg * (kg > 3 ? 0.22 : 0.12), 4);
  const cav = L < 0.25 ? 4 : L <= 2 ? 2 : 1;
  const shot = (kg + flash) * cav;
  const machine = shot >= 6 ? 'blow-ebm-large' : shot >= 1.5 ? 'blow-ebm-500l' : shot >= 0.3 ? 'blow-ebm-100l' : 'blow-ebm-2head';
  const f = BM_COOL[resin];
  const blowS = r(Math.min(20, Math.max(3, 3 + 0.8 * L)), 1);
  const oc = r(Math.min(8, Math.max(4, 4 + 0.1 * L)), 1);
  const seq = blowS + f * wall ** 2 + oc;
  const extruder = machine === 'blow-ebm-2head' ? 90 : 120;                 // continuous heads (rule's EBM_HEADS)
  const parison = r(Math.max(0, shot / extruder * 3600 - seq), 1);
  const cycleS = r(seq + parison, 1);
  const reject = 0.025, up = 1 / (1 - reject);
  chk(part, 'wall mm (2V/S)', p.wallThicknessMm, wall);
  chk(part, 'part kg', p.partWeightKg, kg);
  chk(part, 'flash kg', p.flashWeightKg, flash);
  chk(part, 'cavities', p.cavities, cav, 'exact');
  chk(part, 'machine', p.machineId, machine);
  chk(part, 'cool factor s/mm²', p.coolTimeFactorSPerMm2, f);
  chk(part, 'blow s', p.blowTimeSec, blowS);
  chk(part, 'open/close s', p.openCloseSec, oc);
  chk(part, 'parison in series s', p.parisonExtrusionTimeSec, parison);
  chk(part, 'deflash s (in line at takt)', p.deflashCycleTimeSec, r(cycleS / cav, 1));
  chk(part, 'capacity L', d.provenance['bm-part-vol']?.value, L);
  // mould: the toolmaker build-up, re-added line by line (al-7075, toolroom rates, shop OH+P)
  const H = 30 + 9.5 * L, nE = cav ** 0.9;
  const lines = [
    Math.round((15 + 0.12 * H) * TOOLROOM_RATES.design),
    Math.round(2500 + 80 * L ** 0.8),
    Math.round(14 * L ** 0.75 * nE * TOOL_MATERIAL_GBP_PER_KG['al-7075']),
    Math.round(H * nE * TOOLROOM_RATES.cnc),
    Math.round(0.08 * H * nE * TOOLROOM_RATES.cnc),
    Math.round(0.2 * H * nE * TOOLROOM_RATES.fitting),
    Math.round((925 + 25 * L) * cav),
    Math.round((L > 10 ? 32 : 12) * TOOLROOM_RATES.tryoutPress),
  ];
  const sub = lines.reduce((a, b) => a + b, 0);
  const mould = Math.round(sub + Math.round(sub * SHOP_OVERHEAD_PROFIT));
  chk(part, 'mould £', p.mouldCost, mould, 'gbp');
  const sets = Math.max(1, AMORT * up / (500_000 * cav));
  // material: flash fully reground — the gross is the part ÷ (1 − reject)
  const material = kg * up * m.pricePerKg;
  const hr = (parison + blowS + f * wall ** 2 + oc) / 3600 * up;
  const ops: Op[] = [
    { name: 'EBM', machineId: machine, labourId: 'lab-uk-blow', hr, ppc: cav, oee: 0.8, manning: 0.5, labourHr: hr, eff: 0.92 },
    { name: 'Deflash', machineId: 'blow-deflash-trimmer', labourId: 'lab-uk-blow', hr: r(cycleS / cav, 1) / 3600 * up, ppc: 1, oee: 0.8, manning: 1, labourHr: 0, eff: 1 },
  ];
  buckets(part, d, { material, ops, toolingTotal: mould * sets });
}

// ── Rotational moulding ──────────────────────────────────────────────────────
function roto(part: string, g: any, d: any, resin: string) {
  const m = mat(resin);
  const p = d.params;
  const [a, b, c] = dims(g);
  const wall = r(2 * g.volume.mm3 / g.surfaceArea.mm2, 2);
  const kg = r(g.volume.cm3 * m.densityKgPerM3 / 1e6, 4);
  const heat = Math.round(240 + wall * 210);                 // PE: 240 s soak + 210 s/mm
  const cool = Math.round(heat * 1.35);                      // forced air
  const envL = r(a * b * c / 1e6, 1);
  const perArm = envL > 50 ? 1 : envL > 12 ? 2 : envL > 3 ? 4 : 8;
  const arms = a * b * c / 1e6 > 200 ? 2 : a * b * c / 1e6 > 50 ? 3 : 4;
  const load = 120 + 60 * perArm;
  const index = Math.round(Math.max(heat, cool / 2, load));  // 4-arm: oven / two cooling bays / load
  const reject = 0.03, up = 1 / (1 - reject);
  const hours = 3500;                                        // library rotomoulder hours
  const need = ANNUAL / (1 - reject) * arms * index / (hours * 3600 * 0.8);
  const moulds = Math.max(perArm, Math.ceil(need / perArm) * perArm);
  const area = r(g.projectedArea.alongDrawMm2 / 100, 1);
  const freeForm = g.features?.freeFormFaceCount ?? 0, undercuts = g.draftAnalysis?.undercutFaceCount ?? 0;
  const score = (freeForm >= 10 ? 2 : freeForm >= 4 ? 1 : 0) + (undercuts >= 2 ? 1 : 0);
  const cx = score >= 3 ? 1.5 : score >= 1 ? 1.0 : 0.75;
  const vents = 1 + (g.featureTable ?? []).filter((x: any) => x.kind === 'boss').length;
  const mould = Math.round(6000 + area * 18 * cx + vents * 250 + 500);   // CNC aluminium (≥ 20,000/yr)
  const life = 10_000;
  chk(part, 'wall mm (2V/S)', d.provenance['rm-wall'].value, wall);
  chk(part, 'part kg', p.partWeightKg, kg);
  chk(part, 'heat s', p.heatingTimeSec, heat);
  chk(part, 'cool s', p.coolingTimeSec, cool);
  chk(part, 'parts per arm', p.partsPerArm, perArm, 'exact');
  chk(part, 'arms', p.numArms, arms, 'exact');
  chk(part, 'load s', p.loadUnloadTimeSec, load);
  chk(part, 'index s', p.indexTimeSec, index);
  chk(part, 'moulds in service', p.mouldsInService, moulds, 'exact');
  chk(part, 'mould £', p.mouldCost, mould, 'gbp');
  chk(part, 'mould life', p.mouldLife, life, 'exact');
  const util = 0.99;
  const net = kg * up, gross = net / util;
  const material = gross * m.pricePerKg - (gross - net) * m.scrapRecoveryPricePerKg + 0.25 * kg * up / util;
  const hr = index / 3600 * up;
  const sets = Math.max(1, AMORT * up / (life * moulds));
  buckets(part, d, {
    material,
    ops: [{ name: 'Roto', machineId: 'rotomould-carousel-4arm', labourId: 'lab-uk-roto', hr, ppc: perArm, oee: 0.8, manning: 2, labourHr: hr, eff: 0.92 }],
    toolingTotal: mould * moulds * sets,
  });
}

// ── Thermoforming ────────────────────────────────────────────────────────────
const TF_FAM: Record<string, { heat: number; cool: number; cp: number; tf: number }> = {
  'mat-abs-tf': { heat: 10.6, cool: 3.8, cp: 2.05, tf: 150 },
  'mat-hdpe-tf': { heat: 12.0, cool: 4.5, cp: 2.75, tf: 135 },
};
function thermo(part: string, g: any, d: any, resin: string) {
  const m = mat(resin), fam = TF_FAM[resin];
  const p = d.params;
  const [L, W, H] = dims(g);
  const pa = g.projectedArea;
  const plan = r(Math.max(pa.xMm2, pa.yMm2, pa.zMm2) / 100, 1);
  const sheet = r(g.volume.cm3 / plan * 10, 2);
  const kg = r(g.volume.cm3 * m.densityKgPerM3 / 1e6, 4);
  const ratio = r(H / W, 2);
  if (ratio > 1.5) throw new Error('shadow model covers vacuum forming only');
  const small = L + 100 <= 800 && W + 100 <= 600;
  const machine = small ? 'thermoform-small' : 'thermoform-large';
  const win: [number, number] = small ? [800, 600] : [1500, 1200];
  const gap = Math.max(25, H);
  const fit = (x: number, y: number) => Math.max(0, Math.floor((win[0] - 100 + gap) / (x + gap))) * Math.max(0, Math.floor((win[1] - 100 + gap) / (y + gap)));
  const n1 = fit(L, W), n2 = fit(W, L);
  const n = Math.max(1, Math.min(8, Math.max(n1, n2)));
  let sx = L + 100, sy = W + 100;
  if (n > 1) {
    const [x, y] = n1 >= n2 ? [L, W] : [W, L];
    const nx = Math.max(1, Math.floor((win[0] - 100 + gap) / (x + gap))); const ny = Math.ceil(n / nx);
    sx = nx * x + (nx - 1) * gap + 100; sy = ny * y + (ny - 1) * gap + 100;
  }
  const sheetKg = r(sx * sy / 100 * (sheet / 10) * m.densityKgPerM3 / 1e6, 4);
  const heat = Math.round(fam.heat * sheet ** 1.6);
  const cool = Math.round(fam.cool * sheet ** 2 * 0.65);
  const form = 6, load = small ? 15 : 20;
  const cycle = small ? heat + form + cool + load : Math.max(heat, form + cool, load) + 5;
  const trim = Math.round(20 + 2 * (L + W) / 1000 * 12);
  const freeForm = g.features?.freeFormFaceCount ?? 0, undercuts = g.draftAnalysis?.undercutFaceCount ?? 0;
  const score = (freeForm >= 10 ? 2 : freeForm >= 4 ? 1 : 0) + (undercuts >= 2 ? 1 : 0);
  const cx = score >= 3 ? 1.6 : score >= 1 ? 1.0 : 0.7;
  const tool0 = Math.round((3500 + plan * 1.2) * cx * (1 + (n - 1) * 0.7) + Math.round(plan * 0.25 * n));   // cast-al vacuum, router trim
  const tool = Math.round(tool0 * Math.max(1, AMORT / n / 250_000));
  chk(part, 'plan cm²', d.provenance['tf-area'].value, plan);
  chk(part, 'sheet gauge mm (mass balance)', p.sheetThicknessMm, sheet);
  chk(part, 'part kg', p.partWeightKg, kg);
  chk(part, 'parts per sheet', p.partsPerSheet, n, 'exact');
  chk(part, 'sheet kg', p.sheetWeightKg, sheetKg);
  chk(part, 'machine', p.machineId, machine);
  chk(part, 'heat s', p.heatTimeSec, heat);
  chk(part, 'cool s', p.coolTimeSec, cool);
  chk(part, 'form s', p.formTimeSec, form);
  chk(part, 'load s', p.indexTimeSec, load);
  chk(part, 'trim s', p.trimTimeSec, trim);
  chk(part, 'tool £', p.toolCost, tool, 'gbp');
  const up = 1 / 0.97;
  const net = kg * up, util = kg * n / sheetKg, gross = net / util;
  const spec = r(fam.cp * (fam.tf - 23) / 3600 / 0.4 + 0.02, 3);
  const kwh = spec * sheetKg / n * up;
  chk(part, 'oven kWh / part', d.trace.drivers.rawMaterial.energyKwh?.electricity, kwh);
  const material = gross * m.pricePerKg - (gross - net) * m.scrapRecoveryPricePerKg + kwh * book.energy[0].electricityPerKwh;
  const hr = cycle / 3600 * up, thr = trim / 3600 * up;
  buckets(part, d, {
    material,
    ops: [
      { name: 'Form', machineId: machine, labourId: 'lab-uk-thermoform', hr, ppc: n, oee: 0.8, manning: 1, labourHr: hr, eff: 0.92 },
      { name: 'Router trim', machineId: 'thermoform-trim-router', labourId: 'lab-uk-thermoform', hr: thr, ppc: 1, oee: 0.8, manning: 1, labourHr: thr, eff: 0.92 },
    ],
    toolingTotal: tool,
  });
}

const PARTS: Array<[string, (part: string, g: any, d: any, resin: string) => void, string]> = [
  ['BM_Air_Duct.stp', blow, 'mat-pp-bm'],
  ['BM_Washer_Reservoir.stp', blow, 'mat-hdpe-bm'],
  ['ROTO_Header_Tank.stp', roto, 'mat-lldpe-roto'],
  ['ROTO_Coolant_Tank.stp', roto, 'mat-lldpe-roto'],
  ['TF_Trim_Cover.stp', thermo, 'mat-abs-tf'],
  ['TF_Battery_Box_Lid.stp', thermo, 'mat-hdpe-tf'],
];
for (const [part, fn, resin] of PARTS) {
  const file = join(dumpDir, part.replace(/\.stp$/i, '.json'));
  if (!existsSync(file)) { out.push(`FAIL  ${part}: no dump at ${file}`); fails++; continue; }
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const g = baseline.find(b => b.part === part)!.geometry;
  if (d.status !== 'costed') { out.push(`FAIL  ${part}: status ${d.status}`); fails++; continue; }
  fn(part, g, d, resin);
}
console.log(out.join('\n'));
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);

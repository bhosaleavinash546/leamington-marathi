/**
 * Arithmetic audit — COMPOSITES and RUBBER (30 Oct 2026). An independent shadow model of every real part of the two
 * commodities: it recomputes, from the recorded geometry, the rate book and the baseline's answers, every rule input,
 * every operation's time and £, the material line, the tooling and the 8 buckets — WITHOUT calling the composites /
 * rubber rules, modules or advisor — and compares each figure with what the product's own headless chain
 * (`costMeasuredPart`, UK, 50,000 a year, 5-year programme) costs. Prints PASS / FAIL per check; exits 1 on any FAIL.
 *
 *   cd calculator && npx tsx scripts/arith-audit/composites-rubber.ts [--verbose]
 *
 * The constants below are the AUDIT'S OWN copy of the figures the rules state in their bases (so a silent change in
 * the rules shows up as a FAIL here). Packaging, logistics, overhead % and margin % are shop defaults owned by
 * another file: they are read from the product's stack input and only re-added here.
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const VERBOSE = process.argv.includes('--verbose');
const ANNUAL = 50_000, YEARS = 5, AMORT = ANNUAL * YEARS;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const machine = (id: string) => { const m = book.machines.find(x => x.id === id); if (!m) throw new Error(id); return m.computedRatePerHr; };
const labour = (id: string) => { const l = book.labour.find(x => x.id === id); if (!l) throw new Error(id); return l.fullyLoadedRatePerHr; };
const material = (id: string) => { const m = book.materials.find(x => x.id === id); if (!m) throw new Error(id); return m; };
const r = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

let pass = 0, fail = 0;
const fails: string[] = [];
function check(part: string, what: string, mine: number | string, theirs: unknown, tol: 'p' | 'pct' | 'exact' = 'p') {
  let ok: boolean;
  if (typeof mine === 'string' || tol === 'exact') ok = String(mine) === String(theirs);
  else {
    const t = Number(theirs);
    ok = tol === 'p' ? Math.abs(mine - t) <= 0.005 : Math.abs(mine - t) <= Math.max(1e-9, 0.005 * Math.abs(t));
  }
  if (ok) pass++; else { fail++; fails.push(`${part} · ${what}: shadow ${mine} v product ${theirs}`); }
  if (VERBOSE || !ok) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what.padEnd(44)} shadow ${String(typeof mine === 'number' ? r(mine, 6) : mine).padEnd(14)} product ${typeof theirs === 'number' ? r(theirs, 6) : theirs}`);
}

// ── Composites: the audit's copy of the stated system and tool figures ─────────────────────────────────────────────
const SYSTEMS: Record<string, { fibre: string; resin: string | null; process: string; ply: number; fwf: number; waste: number; dens: number; cureHr: number; layup: number; cell: string; bed: [number, number] | null }> = {
  'prepreg-cf': { fibre: 'mat-cfrp-prepreg-t700', resin: null, process: 'prepreg_layup', ply: 0.25, fwf: 0.65, waste: 0.15, dens: 1550, cureHr: 3.0, layup: 0.06, cell: 'autoclave-1200mm', bed: [2.8, 1.0] },
  'rtm-gf': { fibre: 'mat-gf-dry-e', resin: 'mat-vinylester-rtm', process: 'rtm', ply: 0.50, fwf: 0.50, waste: 0.12, dens: 1800, cureHr: 0.8, layup: 0.025, cell: 'rtm-press-std', bed: null },
};
const TOOL: Record<string, { base: number; perM2: number; life: number }> = {
  prepreg_layup: { base: 12_000, perM2: 14_000, life: 500 }, rtm: { base: 25_000, perM2: 30_000, life: 5_000 },
};
const NDI = { scanM2PerHr: 25, loadUnloadSec: 60, cellGbpPerHrUk: 15 };
const OEE = 0.8, LAB_EFF = 0.92, REJECT_COMP = 0.04, CURE_ATTEND = 0.25;

type Res = Awaited<ReturnType<typeof costMeasuredPart>> & { provenance?: Record<string, { value: unknown }>; trace?: any; breakdown?: any; total?: number };

function stack(part: string, res: Res, rm: number, ops: Array<{ name: string; m: string; l: string; ct: number; ppc: number; oee: number; man: number; lt: number; le: number }>, toolPerPart: number) {
  const tOps = res.trace.operations as Array<any>;
  check(part, 'operation count', ops.length, tOps.length, 'exact');
  let proc = 0, lab = 0;
  ops.forEach((o, i) => {
    const t = tOps[i] ?? {};
    const pc = machine(o.m) * o.ct / o.ppc / o.oee;
    const lc = labour(o.l) * o.man * o.lt / o.ppc / o.le;
    proc += pc; lab += lc;
    check(part, `op ${i + 1} ${o.name}: machine`, o.m, t.machineId, 'exact');
    check(part, `op ${i + 1} ${o.name}: cycle h`, o.ct, t.cycleTimeHr, 'pct');
    check(part, `op ${i + 1} ${o.name}: labour h`, o.lt, t.labourTimeHr, 'pct');
    check(part, `op ${i + 1} ${o.name}: parts/cycle`, o.ppc, t.partsPerCycle, 'exact');
    check(part, `op ${i + 1} ${o.name}: crew`, o.man, t.manning, 'exact');
    check(part, `op ${i + 1} ${o.name}: process £`, pc, t.processCost);
    check(part, `op ${i + 1} ${o.name}: labour £`, lc, t.labourCost);
  });
  const si = res.trace.stackInput;
  const base = rm + proc + lab + toolPerPart;
  const overhead = si.overheadPct * base;
  const subtotal = base + si.packagingPerPart + si.logisticsPerPart + overhead;
  const margin = si.marginPct * subtotal;
  const b = res.breakdown;
  check(part, 'bucket material', rm, b.rawMaterial);
  check(part, 'bucket process', proc, b.process);
  check(part, 'bucket labour', lab, b.labour);
  check(part, 'bucket tooling', toolPerPart, b.tooling);
  check(part, 'bucket overhead', overhead, b.overhead);
  check(part, 'bucket margin', margin, b.margin);
  check(part, 'TOTAL', subtotal + margin, res.total);
  return subtotal + margin;
}

function composites(part: string, geo: OCCTGeometry, answers: Record<string, string>, res: Res) {
  const P = (id: string) => res.provenance?.[id]?.value;
  const sys = SYSTEMS[answers['material.laminate']];
  const S2 = geo.surfaceArea!.mm2, V3 = geo.volume!.mm3;
  const wall = r(2 * V3 / S2, 2);
  const plies = Math.max(2, Math.ceil(wall / sys.ply));
  const area = r(geo.surfaceArea!.cm2 / 2 / 10_000, 3);
  const layup = r(area * plies * sys.layup, 3);
  const mass = r(geo.volume!.cm3 * sys.dens / 1e6, 4);
  const pa = geo.projectedArea as { xMm2?: number; yMm2?: number; zMm2?: number };
  const planM2 = r(Math.max(pa.xMm2 ?? 0, pa.yMm2 ?? 0, pa.zMm2 ?? 0) / 100, 1) / 10_000;
  const [d0, d1] = [geo.boundingBox!.xMm, geo.boundingBox!.yMm, geo.boundingBox!.zMm].sort((a, b) => b - a);
  let perCure = 1;
  if (sys.bed) {
    const a = d0 / 1000 + 0.1, b = d1 / 1000 + 0.1;
    const fit = (x: number, y: number) => Math.floor(sys.bed![0] / x) * Math.floor(sys.bed![1] / y);
    perCure = Math.max(1, Math.min(20, Math.max(fit(a, b), fit(b, a))));
  }
  const tc = layup + sys.cureHr + 0.5;
  const tools = Math.max(1, Math.ceil(ANNUAL * tc / (4000 * OEE)));
  const trim = r(0.1 + 2 * (d0 + d1) / 1000 / 1.5 / 60, 3);
  const tool = TOOL[sys.process];
  const toolCost = Math.round(tool.base + planM2 * tool.perM2);
  const ndi = sys.fibre === 'mat-cfrp-prepreg-t700'
    ? r((NDI.loadUnloadSec / 3600 + area / NDI.scanM2PerHr) * (labour('lab-uk-inspector') + NDI.cellGbpPerHrUk), 2) : 0;
  const fp = material(sys.fibre).pricePerKg, rp = sys.resin ? material(sys.resin).pricePerKg : 0;

  check(part, 'rule plies', plies, P('comp-plies'), 'exact');
  check(part, 'rule area m²', area, P('comp-area'), 'pct');
  check(part, 'rule part weight kg', mass, P('comp-part-wt'), 'pct');
  check(part, 'rule fibre £/kg', fp, P('comp-fibre-price'), 'pct');
  check(part, 'rule resin £/kg', rp, P('comp-resin-price'), 'pct');
  check(part, 'rule layup h', layup, P('comp-layup-time'), 'pct');
  check(part, 'rule cure h', sys.cureHr, P('comp-cure-time'), 'pct');
  check(part, 'rule parts a cure', perCure, P('comp-cure-batch'), 'exact');
  check(part, 'rule tools in service', tools, P('comp-tools'), 'exact');
  check(part, 'rule trim h', trim, P('comp-trim-time'), 'pct');
  check(part, 'rule tool £', toolCost, P('comp-tool-cost'), 'pct');
  check(part, 'rule tool life', tool.life, P('comp-tool-life'), 'exact');
  check(part, 'rule NDI £', ndi, P('comp-ndi'));
  check(part, 'rule cure cell', sys.cell, P('comp-cure-mach'), 'exact');

  // Module: material (prepreg is bought as fibre + resin), operations, tooling.
  const U = 1 / (1 - REJECT_COMP);
  const net = sys.resin === null ? mass * fp : mass * sys.fwf * fp + mass * (1 - sys.fwf) * rp;
  const rm = (net / (1 - sys.waste) + ndi) * U;
  const ops = [
    { name: 'layup', m: 'bench-assembly', l: 'lab-uk-skilled', ct: layup * U, ppc: 1, oee: OEE, man: 1, lt: layup * U, le: LAB_EFF },
    { name: 'cure', m: sys.cell, l: 'lab-uk-semiskilled', ct: sys.cureHr / perCure * U, ppc: 1, oee: OEE, man: 1, lt: sys.cureHr / perCure * CURE_ATTEND * U, le: LAB_EFF },
    { name: 'trim', m: 'waterjet-5ax-composite', l: 'lab-uk-semiskilled', ct: trim * U, ppc: 1, oee: OEE, man: 1, lt: trim * U, le: LAB_EFF },
  ];
  const numTools = Math.max(tools, AMORT / tool.life);
  check(part, 'tooling total £', toolCost * numTools, res.trace.drivers.tooling.totalToolingCost);
  const items = res.trace.drivers.tooling.items as Array<{ gbp: number }> | undefined;
  check(part, 'tooling items add to the total', toolCost * numTools, (items ?? []).reduce((s, i) => s + i.gbp, 0));
  return stack(part, res, rm, ops, toolCost * numTools / AMORT);
}

// ── Rubber ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const FAMILY: Record<string, { base: number }> = { 'mat-epdm': { base: 180 }, 'mat-nr': { base: 100 } };
const HANDLING: Record<string, number> = { transfer_mould: 25, compression_mould: 30, extrusion_vulcanise: 0 };
const CREW: Record<string, number> = { transfer_mould: 0.5, compression_mould: 0.5, extrusion_vulcanise: 2 };
const MACH: Record<string, string> = { transfer_mould: 'transfer-mould-std', compression_mould: 'compression-mould-std', extrusion_vulcanise: 'extruder-rubber-60mm' };
const MOULD_BASE: Record<string, number> = { transfer_mould: 6000, compression_mould: 3000, extrusion_vulcanise: 2500 };
const SETUP_HR: Record<string, number> = { transfer_mould: 1.5, compression_mould: 1.5, extrusion_vulcanise: 1 };
const DEFLASH_S: Record<string, number> = { transfer_mould: 5, compression_mould: 10, extrusion_vulcanise: 0 };
const REJECT_RUB = 0.03;

function rubber(part: string, geo: OCCTGeometry, answers: Record<string, string>, res: Res) {
  const P = (id: string) => res.provenance?.[id]?.value;
  const mat = material(answers['material.elastomer']);
  const mass = r(geo.volume!.cm3 * mat.densityKgPerM3 / 1e6, 4);
  const mean = 2 * geo.volume!.mm3 / geo.surfaceArea!.mm2;
  const ray = geo.wallThickness?.p95Mm ?? geo.wallThickness?.maxMm ?? null;
  const section = ray ? r(Math.min(ray, 2 * mean), 1) : r(1.5 * mean, 1);
  // constant section?
  const bb = geo.boundingBox!, pa = geo.projectedArea!;
  const dims = ([[bb.xMm, pa.xMm2], [bb.yMm, pa.yMm2], [bb.zMm, pa.zMm2]] as Array<[number, number | undefined]>).sort((a, b) => b[0] - a[0]);
  const [[L, sil], [d1]] = dims;
  const fill = sil ? geo.volume!.cm3 / (sil / 100 * L / 10) : 0;
  const profile = sil && L >= 8 * d1 && fill >= 0.9 && fill <= 1.1 ? { L, sectionCm2: r(sil / 100, 2) } : null;
  const proc = profile ? 'extrusion_vulcanise' : ANNUAL >= 50_000 ? 'transfer_mould' : 'compression_mould';
  const area = r((pa.alongDrawMm2 ?? 0) / 100, 1);
  const ff = geo.features?.freeFormFaceCount ?? 0, uc = geo.draftAnalysis?.undercutFaceCount ?? 0;
  const score = (ff >= 8 ? 2 : ff >= 3 ? 1 : 0) + (uc >= 3 ? 1 : 0);
  const cplx = score >= 3 ? 1.5 : score >= 1 ? 1.0 : 0.8;
  const steel = 0.7;   // aluminium below 100,000/yr
  const toolOf = (k: number, a: number) => Math.round(MOULD_BASE[proc] * steel + (900 + a * 35) * steel * cplx * Math.pow(k, 0.9));
  let cycle: number, cav: number, cureSec = 0, mould: number;
  if (profile) {
    const speed = profile.sectionCm2 <= 2 ? 12 : profile.sectionCm2 <= 6 ? 8 : 4;
    cycle = r(profile.L / 1000 / speed * 60, 1); cureSec = cycle; cav = 1;
    mould = toolOf(1, profile.sectionCm2);
  } else {
    cycle = Math.round(FAMILY[mat.id].base + section * section / 0.4 + HANDLING[proc]);
    const needed = Math.max(1, Math.ceil(ANNUAL * cycle / (4000 * 3600 * 0.8)));
    const fit = Math.min(32, Math.max(1, Math.floor(1500 / Math.max(1, area * 2.5))));
    const press = machine(MACH[proc]) + labour('lab-uk-semiskilled') * CREW[proc];
    let best = Infinity; cav = Math.min(needed, fit);
    for (let k = Math.min(needed, fit); k <= fit; k++) {
      const c = press * cycle / 3600 / 0.8 / k + toolOf(k, area) / AMORT;
      if (c < best - 1e-9) { best = c; cav = k; }
    }
    mould = toolOf(cav, area);
  }
  const flashFrac = proc === 'transfer_mould' ? 0.03 : proc === 'compression_mould' ? 0.08 : 0;
  const flash = r(mass * flashFrac, 4);
  check(part, 'rule part weight kg', mass, P('rub-part-wt'), 'pct');
  check(part, 'rule section mm', section, P('rub-thickness'), 'pct');
  check(part, 'rule process', proc, P('rub-process'), 'exact');
  check(part, 'rule cycle s', cycle, P('rub-cycle-sec'), 'pct');
  check(part, 'rule cavities', cav, P('rub-cavities'), 'exact');
  check(part, 'rule projected cm²', area, P('rub-proj-area'), 'pct');
  check(part, 'rule flash kg', flash, P('rub-flash-wt'), 'pct');
  check(part, 'rule mould £', mould, P('rub-mould-cost'), 'pct');
  check(part, 'rule mould life', 200_000, P('rub-mould-life'), 'exact');
  check(part, 'rule crew', CREW[proc], P('rub-manning'), 'exact');

  const U = 1 / (1 - REJECT_RUB);
  const net = mass * U, util = mass / (mass + flash);
  const gross = net / util;
  const rm = gross * mat.pricePerKg - (gross - net) * mat.scrapRecoveryPricePerKg;
  const ops: Parameters<typeof stack>[2] = [
    { name: 'mould / extrude', m: MACH[proc], l: 'lab-uk-semiskilled', ct: cycle / 3600 * U, ppc: cav, oee: 0.8, man: CREW[proc], lt: cycle / 3600 * U, le: LAB_EFF },
  ];
  // The in-line cure tunnel: machine time at the line takt, no crew of its own (the line's crew is on the extruder).
  if (cureSec > 0) ops.push({ name: 'cure tunnel', m: 'cure-oven-rubber', l: 'lab-uk-semiskilled', ct: cureSec / 3600 * U, ppc: 1, oee: 0.8, man: CREW[proc], lt: 0, le: LAB_EFF });
  if (DEFLASH_S[proc] > 0) ops.push({ name: 'deflash (bench)', m: MACH[proc], l: 'lab-uk-semiskilled', ct: 0, ppc: 1, oee: 1, man: 1, lt: DEFLASH_S[proc] / 3600 * U, le: LAB_EFF });
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  ops.push({ name: 'tool change', m: MACH[proc], l: 'lab-uk-technician', ct: SETUP_HR[proc] / batch, ppc: 1, oee: 1, man: 1, lt: SETUP_HR[proc] / batch, le: 1 });
  const moulds = Math.max(1, AMORT / (200_000 * cav));
  check(part, 'tooling total £', mould * moulds, res.trace.drivers.tooling.totalToolingCost);
  const items = res.trace.drivers.tooling.items as Array<{ gbp: number }> | undefined;
  check(part, 'tooling items add to the total', mould * moulds, (items ?? []).reduce((s, i) => s + i.gbp, 0));
  return stack(part, res, rm, ops, mould * moulds / AMORT);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
for (const p of base) {
  if (!/^(COMP|RUB)_/.test(p.part)) continue;
  const spec = ANSWERS[p.part];
  const res = await costMeasuredPart(p.geometry, p.part,
    { partNumber: p.part, file: p.part, annualVolume: ANNUAL, ...(spec.commodity ? { commodity: spec.commodity } : {}) },
    spec.answers, 'UK', { annualVolume: ANNUAL, programmeYears: YEARS }, book, { partNumber: p.part, file: p.part, status: 'error' }) as Res;
  console.log(`${p.part} — product £${res.total?.toFixed(4)}`);
  const total = p.part.startsWith('COMP_') ? composites(p.part, p.geometry, spec.answers, res) : rubber(p.part, p.geometry, spec.answers, res);
  console.log(`  shadow £${total.toFixed(4)}`);
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }

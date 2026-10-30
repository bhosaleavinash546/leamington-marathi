/**
 * Arithmetic audit — MACHINING (from solid, and the secondary-machining cell on castings and forgings), 30 Oct 2026.
 *
 * An independent shadow model. For each real part it recomputes, from the recorded geometry
 * (`tests/fixtures/real-parts-baseline.json`), the rate book and the baseline's answers — WITHOUT calling the rule
 * functions, the routing optimiser, `machining-time.ts`, `feature-machining.ts` or the machining module — every
 * rule-derived input, every operation's time and £, the material line, tooling and amortisation, and the 8 buckets,
 * and compares each with the dump written by `scripts/arith-audit/dump.ts`.
 *
 *   npx tsx scripts/arith-audit/machining.ts [dumpDir]
 *   ARITH_PRE_FIX=1 npx tsx scripts/arith-audit/machining.ts [dumpDir]   # the code as it was before this audit's fixes
 *
 * Every constant below is the AUDITOR's restatement of the value the code states (file:line in the comment), so a
 * silent change in the code shows up here as a FAIL. Exit code 1 on any FAIL.
 * Write-up: docs/review/arith-audit/machining.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DUMP = process.argv[2]
  ?? '/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/arith-dump';
const BASE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: Geo }>;
const BOOK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
/** Model the code BEFORE the audit's fixes (M1, L1, M3, L3, L4) — reproduces the shared pre-fix dump. */
const PRE = !!process.env.ARITH_PRE_FIX;
const machineRate = (id: string) => BOOK.machines.find(m => m.id === id)!.computedRatePerHr;
const labourRate = (id: string) => BOOK.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geo = any;
interface Row { kind: string; diaMm: number; depthMm: number; through: boolean | null; count: number; areaMm2?: number }

// ── Auditor's restatement of the stated constants ─────────────────────────────────────────────────────────────────
const ANNUAL = 50_000, YEARS = 5;                                   // dump.ts
const DENSITY: Record<string, number> = { aluminium: 0.0027, steel: 0.00785, 'cast iron': 0.00715 };   // derive/material.ts:23
const CUT: Record<string, { tf: number; mill: number; turn: number; wear: number }> = {               // machining-time.ts CUTTING_DATA
  aluminium: { tf: 1.0, mill: 120, turn: 250, wear: 0.04 },
  steel: { tf: 2.0, mill: 35, turn: 80, wear: 0.12 },
  'cast iron': { tf: 1.6, mill: 50, turn: 100, wear: 0.10 },
};
const FIN = { wall: 40, surf: 10, turn: 120 };                     // FINISH_RATE_CM2_PER_MIN
const TOOL_CHANGE_S = 6, SETUP_MIN = 45, PALLET_S = 10, CUT_MANNING = 0.5, OEE = 0.8, LAB_EFF = 0.92, REJECT = 0.02;
const PLATE = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140,
  150, 160, 180, 200, 225, 250, 275, 300];
const BAR = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120,
  130, 140, 150, 160, 180, 200, 220, 250, 280, 300];
const handlingMin = (kg: number) => kg <= 0.5 ? 0.3 : kg <= 5 ? 0.6 : kg <= 20 ? 1.2 : 2.5;
const FIXTURE = { modular: 500, dedicated: 2500, softJaws: 300, hydraulic: 12_000 };
const PROG = { perFix: 1.5, perRow: 0.25, surf: 2 };
const DRILL_FEED = 400, MICRO_FEED = 250, PECK = 1.5, TAP_FEED = 500, TAP_APPROACH = 0.10, BORE_FEED = 150;
const TAP_DRILLS = [2.5, 3.3, 4.2, 5.0, 6.8, 8.5, 10.2];
const CORED: Record<string, number> = { sand: 20, gravity: 20, investment: 20, hpdc: 6, forging: 25 };
const CAST_STOCK_MM: Record<string, number> = { sand_ferrous: 3.0, sand: 2.0, gravity: 1.5, investment: 1.0, hpdc: 0.5 };
const NEAR_NET_TURN_STOCK = 2;
const CATALOGUE: Array<{ id: string; cap: string; env: [number, number, number] }> = [
  { id: 'mach-vmc3', cap: 'mill3', env: [1020, 660, 635] }, { id: 'mach-haas-vf2', cap: 'mill3', env: [762, 508, 406] },
  { id: 'mach-vmc5', cap: 'mill5', env: [800, 600, 500] }, { id: 'mach-haas-umc500', cap: 'mill5', env: [610, 406, 406] },
  { id: 'mach-dmg-dmu50', cap: 'mill5', env: [500, 450, 400] }, { id: 'mach-hmc-400', cap: 'hmc', env: [500, 400, 400] },
  { id: 'mach-lathe-cnc', cap: 'turn', env: [600, 400, 400] }, { id: 'mach-mazak-qt200', cap: 'turn', env: [540, 340, 340] },
  { id: 'mach-drill', cap: 'drill', env: [1000, 600, 600] },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const hr4 = (min: number) => Math.round(min / 60 * 10_000) / 10_000;

// ── Checks ────────────────────────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const fails: string[] = [];
function check(part: string, what: string, expected: number | string, actual: unknown, tol = 0.005): void {
  const ok = typeof expected === 'number'
    ? typeof actual === 'number' && Math.abs(expected - actual) <= tol
    : expected === actual;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${part.padEnd(24)} ${what.padEnd(58)} expected ${fmt(expected)}  got ${fmt(actual)}`;
  if (ok) pass++; else { fail++; fails.push(line); }
  console.log(line);
}
const fmt = (v: unknown) => typeof v === 'number' ? (Math.abs(v) < 1e4 ? v.toFixed(4) : v.toFixed(1)) : String(v);
/** Relative check for an INPUT (0.5 %). */
const checkRel = (part: string, what: string, e: number, a: unknown) => check(part, what, e, a, Math.abs(e) * 0.005 || 1e-9);

// ── The pieces, restated ──────────────────────────────────────────────────────────────────────────────────────────
function tapped(r: Row): boolean {
  return r.kind === 'hole' && r.depthMm >= 1.5 * r.diaMm && TAP_DRILLS.some(d => Math.abs(d - r.diaMm) <= 0.1);
}
const isLand = (r: Row) => r.diaMm >= 30 && r.depthMm > 0 && r.depthMm < 0.25 * r.diaMm;
/** One hole, minutes, aluminium baseline (feature-machining.ts featureMinutesEach). */
function holeMin(r: Row): number {
  if (r.kind === 'face') return 0.20 + Math.max(r.areaMm2 ?? 0, 1) / 8000;
  const d = r.diaMm, L = Math.max(r.depthMm, 1);
  if (isLand(r)) return 0.20 + d * 0.004;
  const deep = L > 5 * Math.max(d, 1) ? PECK : 1;
  let t: number;
  if (d > 26) t = 0.50 + L * 0.050;
  else if (d > 13) { const bore = r.through === false || L > 2 * d; t = 0.15 + L / DRILL_FEED * deep + (bore ? 0.25 + L / DRILL_FEED : 0); }
  else if (d > 6) t = 0.15 + L / DRILL_FEED * deep;
  else t = 0.06 + L / MICRO_FEED * deep;
  if (r.through === false) t += 0.10;
  if (tapped(r)) t += TAP_APPROACH + 2 * L / TAP_FEED;
  return t;
}
const nearNetHoleMin = (r: Row, cored?: number) =>
  cored !== undefined && r.kind === 'hole' && r.diaMm > cored && !isLand(r) ? 0.25 + Math.max(r.depthMm, 1) / BORE_FEED : holeMin(r);
/** Metal inside the drilled / bored holes, cm³ — cut by the hole time, so not roughed again (finding M1). */
const holeVolCm3 = (rows: Row[]) => PRE ? 0 : rows.filter(r => r.kind === 'hole' && !isLand(r))
  .reduce((s, r) => s + Math.PI * r.diaMm * r.diaMm / 4 * Math.max(r.depthMm, 0) * r.count, 0) / 1000;
const holeWallCm2 = (rows: Row[]) => rows.filter(r => r.kind === 'hole')
  .reduce((s, r) => s + Math.PI * r.diaMm * Math.max(r.depthMm, 0) * r.count, 0) / 100;
const holeSizes = (rows: Row[]) => new Set(rows.filter(r => r.kind === 'hole').map(r => Math.round(r.diaMm * 2) / 2)).size;

function cheapest(cap: string, bb: number[]): { id: string; rate: number } {
  const m = CATALOGUE.filter(c => c.cap === cap && bb.every((d, i) => d <= c.env[i]))
    .map(c => ({ id: c.id, rate: machineRate(c.id) })).sort((a, b) => a.rate - b.rate);
  return m[0];
}

interface Op { name: string; machineId: string; ct: number; manning: number; oee: number; labourId: string; bench?: boolean }

/** The 8 buckets from the module's inputs, restated (modules/machining.ts + core.ts). */
function stack(p: { materialId: string; netKg: number; util: number; wear: number; ops: Op[]; setupHr: number; batch: number;
  setupMachine: string; tooling: number; amort: number; packaging: number; logistics: number }) {
  const up = 1 / (1 - REJECT);
  const mat = BOOK.materials.find(m => m.id === p.materialId)!;
  const net = p.netKg * up, gross = net / p.util;
  const material = gross * mat.pricePerKg - (gross - net) * mat.scrapRecoveryPricePerKg + p.wear * up;
  const setupHr = p.setupHr / p.batch;
  let process = machineRate(p.setupMachine) * setupHr, labour = labourRate('lab-uk-skilled') * setupHr;
  const perOp: Array<{ name: string; proc: number; lab: number }> = [];
  for (const o of p.ops) {
    const ct = o.bench ? 0 : o.ct * up;
    const lt = o.ct * up;
    const proc = machineRate(o.machineId) * ct / o.oee;
    const lab = labourRate(o.labourId) * o.manning * lt / LAB_EFF;
    perOp.push({ name: o.name, proc, lab });
    process += proc; labour += lab;
  }
  const tooling = p.tooling / p.amort;
  const base = material + process + labour + tooling;
  const overhead = 0.12 * base;
  const subtotal = base + p.packaging + p.logistics + overhead;
  const margin = 0.08 * subtotal;
  return { material, process, labour, tooling, overhead, margin, total: subtotal + margin, perOp };
}

// ── From solid ────────────────────────────────────────────────────────────────────────────────────────────────────
function fromSolid(partFile: string, family: string, materialId: string): void {
  const part = partFile.replace(/\.stp$/, '');
  const geo: Geo = BASE.find(b => b.part === partFile)!.geometry;
  const dump = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8'));
  const P = dump.params, prov = dump.provenance;
  const rows: Row[] = geo.featureTable ?? [];
  const cd = CUT[family], rho = DENSITY[family];
  const bb = [geo.boundingBox.xMm, geo.boundingBox.yMm, geo.boundingBox.zMm];
  const sorted = [...bb].sort((a, b) => b - a);
  const vol = geo.volume.cm3, area = geo.surfaceArea.cm2;

  // Mass and stock
  const netKg = Math.round(vol * rho * 1000) / 1000;
  check(part, 'net weight kg = V × ρ', netKg, P.netWeightKg);
  const t = geo.turning;
  let turned: { dia: number; len: number; fraction: number } | null = null;
  if (t && t.axis && t.fraction >= 0.6) {
    const ax = t.axis.map(Math.abs); const i = ax.indexOf(Math.max(...ax));
    const perp = bb.filter((_, k) => k !== i);
    if (t.maxDiaMm >= 0.9 * Math.max(...perp)) turned = { dia: t.maxDiaMm, len: bb[i], fraction: t.fraction };
  }
  let stockCm3: number;
  if (turned) {
    const dia = BAR.find(s => s >= turned!.dia + 3 - 1e-6)!;
    const len = turned.len + 2 * 2.5 + 3;
    stockCm3 = Math.round(Math.PI * dia * dia / 4 * len / 1000 * 10) / 10;
  } else {
    const th = PLATE.find(s => s >= sorted[2] + 2 - 1e-6)!;
    stockCm3 = Math.round((sorted[0] + 8) * (sorted[1] + 5) * th / 1000 * 10) / 10;
  }
  const rawUtil = netKg / (stockCm3 * rho);
  const stockKg = Math.round(netKg / rawUtil * 1000) / 1000;
  check(part, 'stock weight kg (stocked plate / bar)', stockKg, P.stockWeightKg);
  // The utilisation the costing buys must give the stock weight the basis prints (finding L1: was rounded to 3 dp).
  if (PRE) check(part, 'utilisation (3 dp, pre-fix)', Math.round(rawUtil * 1000) / 1000, P.materialUtilization, 0);
  else check(part, 'utilisation = net / stock (gross kg the costing buys)', stockKg, Math.round(netKg / P.materialUtilization * 1000) / 1000, 0.0015);

  // Cutting
  const removed = Math.max(0, stockCm3 - vol - holeVolCm3(rows));
  const by = geo.faces.areaByTypeMm2 as Record<string, number>;
  const WALL = new Set(['PLANE', 'CYLINDER', 'CONE', 'TORUS']);
  const wall = Math.max(0, Object.entries(by).filter(([k]) => WALL.has(k)).reduce((s, [, a]) => s + a, 0) / 100 - holeWallCm2(rows));
  const free = Object.entries(by).filter(([k]) => !WALL.has(k)).reduce((s, [, a]) => s + a, 0) / 100;
  const roughMin = removed / cd.mill, finishMin = wall / FIN.wall * cd.tf, surfMin = free / FIN.surf * cd.tf;
  const holesMin = rows.filter(r => r.kind === 'hole').reduce((s, r) => s + holeMin(r) * r.count, 0) * cd.tf;
  const tools = 3 + (free > 0.5 ? 1 : 0) + holeSizes(rows);
  const toolMin = tools * TOOL_CHANGE_S / 60;
  // machining-time.ts: totalMin = r2(all); the mill content is totalMin − r2(holes)
  const millMinExact = r2(roughMin + finishMin + surfMin + holesMin + toolMin) - r2(holesMin);
  const holeMinR = r2(holesMin);
  const handledKg = stockCm3 * rho, hMin = handlingMin(handledKg);

  // Turned
  let lathe: { total: number; basisRough: number } | null = null; let sec: { finish: number; tc: number; hole: number; total: number } | null = null;
  if (turned) {
    const removedT = Math.max(0, stockCm3 - vol - holeVolCm3(rows));
    const turnedCm2 = area * turned.fraction;
    const rough = removedT / cd.turn, fin = turnedCm2 / FIN.turn * cd.tf;
    lathe = { total: r2(rough + fin + 3 * TOOL_CHANGE_S / 60), basisRough: rough };
    const other = Math.max(0, area - turnedCm2 - holeWallCm2(rows));
    const mf = other / FIN.wall * cd.tf, hm = holesMin;
    const mt = (other > 0.5 || hm > 0) ? 1 + holeSizes(rows) : 0;
    sec = { finish: r2(mf), tc: r2(mt * TOOL_CHANGE_S / 60), hole: r2(hm), total: r2(mf + hm + mt * TOOL_CHANGE_S / 60) };
  }

  // Routing (machine + operator, ranked)
  const dirs = Math.max(1, geo.setupAnalysis?.estimatedSetupCount ?? 1);
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  const lab = labourRate('lab-uk-skilled');
  const setupHr = SETUP_MIN / 60, hHr = hMin / 60;
  const labourOf = (cutHr: number, handHr: number) => Math.round(lab * (cutHr * CUT_MANNING + handHr) * 10_000) / 10_000;
  const cands: Array<{ label: string; primary: string; drill: string; setups: number; machine: number; labour: number; masked?: boolean }> = [];
  const millHr = millMinExact / 60, drillHr = holeMinR / 60;
  const drillM = cheapest('drill', sorted);
  if (turned && lathe && sec) {
    const L = cheapest('turn', sorted);
    const secMillHr = (sec.finish + sec.tc) / 60, secDrillHr = sec.hole / 60;
    const second = secMillHr > 0 ? cheapest('mill3', sorted) : drillM;
    const secHr = secMillHr + secDrillHr; const setups = 2 + (secHr > 0 ? 1 : 0);
    const cost = lathe.total / 60 * L.rate + secHr * second.rate + setups * setupHr * L.rate / batch + setups * hHr * L.rate;
    cands.push({ label: 'turned', primary: L.id, drill: secHr > 0 ? second.id : L.id, setups, machine: cost, labour: labourOf(lathe.total / 60 + secHr, setups * hHr) });
  }
  const push = (label: string, prim: { id: string; rate: number }, drill: { id: string; rate: number } | null, setups: number, masked = false) => {
    const dr = drillHr > 0 ? (drill ?? prim) : null;
    const cost = millHr * prim.rate + drillHr * (dr?.rate ?? 0) + setups * setupHr * prim.rate / batch
      + (masked ? setups * PALLET_S / 3600 * prim.rate : setups * hHr * prim.rate);
    // lead's merge (M4): on the masked cell the load is inside the operator's share of the cut
    cands.push({ label, primary: prim.id, drill: dr?.id ?? prim.id, setups, machine: cost, labour: labourOf(millHr + drillHr, masked ? Math.max(0, setups * hHr - (millHr + drillHr) * CUT_MANNING) : setups * hHr), ...(masked ? { masked } : {}) });
  };
  const millFix = Math.max(2, dirs);
  push('split-3axis', cheapest('mill3', sorted), drillM, millFix + (drillHr > 0 ? 1 : 0));
  push('consolidated-5axis', cheapest('mill5', sorted), null, dirs > 1 ? 2 : 1);
  if (!turned) push('volume-cell', cheapest('hmc', sorted), null, (dirs <= 4 ? 1 : 2) + (dirs > 1 ? 1 : 0), true);
  cands.sort((a, b) => (a.machine + a.labour) - (b.machine + b.labour));
  const ch = cands[0];
  for (const c of cands) {
    const m = new RegExp(`${c.label} £([0-9.]+) \\(machine £([0-9.]+) \\+ operator £([0-9.]+)`).exec(prov['mach-setup-mach'].basis);
    check(part, `routing ${c.label}: machine + operator £/part (basis)`, r2(c.machine + c.labour), m ? Number(m[1]) : NaN, 0.0051);
  }
  check(part, 'routing chosen', ch.label, /→ ([a-z0-9-]+)/.exec(prov['mach-setup-mach'].basis)?.[1]);
  check(part, 'machine (primary)', ch.primary, prov['mach-setup-mach'].value);

  // Operations
  const ops: Op[] = [];
  const M = { labourId: 'lab-uk-skilled', manning: CUT_MANNING, oee: OEE };
  if (ch.label === 'turned' && lathe && sec) {
    ops.push({ ...M, name: 'Turning — op 10 / op 20 from bar', machineId: ch.primary, ct: hr4(lathe.total) });
    if (sec.total > 0) ops.push({ ...M, name: 'Mill / drill after turning', machineId: ch.drill, ct: hr4(sec.total) });
  } else {
    const dirsList = geo.setupAnalysis.principalDirections as Array<{ directionLabel: string; faceCount: number }>;
    const tot = dirsList.reduce((s, d) => s + d.faceCount, 0);
    for (const d of dirsList) ops.push({ ...M, name: `Milling — ${d.directionLabel} (${d.faceCount} faces)`, machineId: ch.primary, ct: hr4(millMinExact * d.faceCount / tot) });
    if (holeMinR > 0) ops.push({ ...M, name: 'Drilling', machineId: ch.drill, ct: hr4(holeMinR) });
  }
  if (ch.masked) {
    ops.push({ ...M, name: 'Pallet change', machineId: ch.primary, ct: hr4(ch.setups * PALLET_S / 60) });
    // Lead's merge (M4): the load happens during the cut — only what the operator's 0.5 share of the cut cannot cover.
    const cutMin = ops.filter(o => !o.bench && !/^Load \/ clamp|^Pallet change/.test(o.name)).reduce((s, o) => s + o.ct * 60, 0);
    const extra = Math.max(0, ch.setups * hMin - 0.5 * cutMin);
    if (extra > 0) ops.push({ name: 'Load / unload on the pallet', machineId: ch.primary, ct: hr4(extra), labourId: 'lab-uk-skilled', manning: 1, oee: 1, bench: true });
  } else {
    ops.push({ ...M, manning: 1, name: 'Load / clamp / unload', machineId: ch.primary, ct: hr4(ch.setups * hMin) });
  }
  const faces = geo.faces.total;
  const deburr = Math.round((0.5 + 0.004 * faces + 0.5) * 100) / 100;
  ops.push({ name: 'Deburr and gauge check (bench)', machineId: ch.primary, ct: hr4(deburr), labourId: 'lab-uk-semiskilled', manning: 1, oee: 1, bench: true });
  check(part, 'operation count', ops.length, P.operations.length, 0);
  ops.forEach((o, i) => {
    const d = P.operations[i];
    if (!d) return;
    check(part, `op ${i + 1} ${o.name.slice(0, 34)} hr`, o.ct, d.cycleTimeHr, 0.00005);
    check(part, `op ${i + 1} machine`, o.machineId, d.machineId);
    check(part, `op ${i + 1} crew × OEE`, o.manning * 10 + o.oee, d.manning * 10 + d.oee, 0);
    check(part, `op ${i + 1} bench (labour only)`, String(!!o.bench), String(!!d.benchOperation));
  });

  // Setup, batch, NRE, tool wear
  const setupsCharged = ch.setups;
  check(part, 'setup time hr = fixturings × 45 min', Math.round(setupsCharged * SETUP_MIN / 60 * 1000) / 1000, P.setup.setupTimeHr);
  check(part, 'batch = annual ÷ 20 in [50, 5000]', batch, P.setup.batchSize, 0);
  check(part, 'setup machine', ch.primary, P.setup.machineId);
  const chuck = ch.label === 'turned' ? 2 : 0;
  const each = ch.label === 'volume-cell' ? FIXTURE.hydraulic : ANNUAL * 5 > 10_000 ? FIXTURE.dedicated : FIXTURE.modular;
  const fixture = (ch.setups - chuck) * each + chuck * FIXTURE.softJaws;
  check(part, 'fixtures £', fixture, P.toolingCost, 0.5);
  const progHr = Math.round((PROG.perFix * ch.setups + PROG.perRow * rows.length + (free > 0.5 && surfMin > 0 ? PROG.surf : 0)) * 100) / 100;
  const prog = Math.round(progHr * labourRate('lab-uk-engineer'));
  check(part, 'programming £ = h × engineer', prog, P.programmingNRE, 0.5);
  const cutMin = ops.filter(o => !o.bench && !o.name.startsWith('Load') && !o.name.startsWith('Pallet')).reduce((s, o) => s + o.ct * 60, 0);
  const wear = Math.round(cutMin * cd.wear * 10_000) / 10_000;
  check(part, 'tool wear £ = cutting min × £/min', wear, P.toolWearCostPerPart);
  check(part, 'amortisation volume = annual × years', ANNUAL * YEARS, P.amortizationVolume, 0);

  // Stack
  const s = stack({ materialId, netKg, util: P.materialUtilization, wear, ops, setupHr: setupsCharged * SETUP_MIN / 60, batch,
    setupMachine: ch.primary, tooling: fixture + prog, amort: ANNUAL * YEARS,
    packaging: dump.trace.stackInput.packagingPerPart, logistics: dump.trace.stackInput.logisticsPerPart });
  const B = dump.breakdown;
  check(part, '£ raw material (incl. tool wear)', s.material, B.rawMaterial);
  check(part, '£ process', s.process, B.process);
  check(part, '£ labour', s.labour, B.labour);
  check(part, '£ tooling (fixtures + programming ÷ volume)', s.tooling, B.tooling);
  check(part, '£ overhead 12 %', s.overhead, B.overhead);
  check(part, '£ margin 8 %', s.margin, B.margin);
  check(part, '£ TOTAL', s.total, dump.total);
  if (process.env.ARITH_VERBOSE) console.log(JSON.stringify({ part, stockCm3, removed, wall, free, roughMin, finishMin, surfMin, holesMin, tools, cands, s }, null, 1));
}

// ── Near-net: the cast + machine half (rules, nearNetCut) ─────────────────────────────────────────────────────────
function castAndMachine(partFile: string, family: string, subtype: string): void {
  const part = partFile.replace(/\.stp$/, '');
  const geo: Geo = BASE.find(b => b.part === partFile)!.geometry;
  const dump = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8'));
  const P = dump.params;
  const rows: Row[] = geo.featureTable ?? [];
  const cd = CUT[family];
  const cored = CORED[subtype] ?? 20;
  const faces = rows.filter(r => r.kind === 'face');
  const faceMin = faces.reduce((s, r) => s + holeMin(r) * r.count, 0) * cd.tf;
  const allHoleMin = rows.filter(r => r.kind === 'hole').reduce((s, r) => s + nearNetHoleMin(r, cored) * r.count, 0) * cd.tf;
  const tools = (faces.length ? 1 : 0) + 1 + holeSizes(rows);
  const nn = { finish: r2(faceMin), tc: r2(tools * TOOL_CHANGE_S / 60), hole: r2(allHoleMin) };
  const boreMin = r2(rows.filter(r => r.kind === 'hole' && r.diaMm > cored).reduce((s, r) => s + nearNetHoleMin(r, cored) * r.count, 0) * cd.tf);
  const drillMin = Math.max(0, r2(nn.hole - boreMin));
  const millMin = nn.finish + nn.tc;
  const ext = (geo.turning?.externalAreaMm2 ?? 0) / 100;
  const spindleCm2 = ext >= 20 && ext / geo.surfaceArea.cm2 >= 0.08 ? ext : 0;
  const stockMm = subtype === 'sand' && (family === 'steel' || family === 'cast iron') ? CAST_STOCK_MM.sand_ferrous : CAST_STOCK_MM[subtype] ?? 1.5;
  const sp = spindleCm2 * stockMm / 10 / cd.turn + spindleCm2 / (FIN.turn / cd.tf) + 3 * TOOL_CHANGE_S / 60;
  const spindleMin = r2(sp);
  const hMin = handlingMin(geo.volume.cm3 * DENSITY[family]);
  const dirsList = geo.setupAnalysis.principalDirections as Array<{ directionLabel: string; faceCount: number }>;
  const tot = dirsList.reduce((s, d) => s + d.faceCount, 0);
  const expected: Array<[string, number, string, number]> = [];
  for (const d of dirsList) expected.push([`Finish machining — ${d.directionLabel} side`, hr4(millMin * d.faceCount / tot), 'mach-hmc-400', 0.5]);
  expected.push(['Drilling', hr4(drillMin), 'mach-hmc-400', 0.5]);
  expected.push(['Finish boring', hr4(boreMin), 'mach-hmc-400', 0.5]);
  // The lathe op is the cut; loading the casting into the lathe fixture is a whole operator's (finding M3).
  if (PRE) expected.push(['Turning — spindle (+ load, pre-fix)', hr4(spindleMin + hMin), 'mach-lathe-cnc', 0.5]);
  else {
    expected.push(['Turning — spindle', hr4(spindleMin), 'mach-lathe-cnc', 0.5]);
    expected.push(['Load / clamp / unload — lathe', hr4(hMin), 'mach-lathe-cnc', 1]);
  }
  expected.push(['Pallet change', hr4(1 * PALLET_S / 60), 'mach-hmc-400', 0.5]);
  {
    // Lead's merge (M4): only the load the operator's 0.5 share of the cut does not cover.
    const cutMin = expected.filter(e => !/^Load \/ clamp|^Pallet change|^Deburr/.test(String(e[0]))).reduce((s, e) => s + Number(e[1]) * 60, 0);
    const extra = Math.max(0, 1 * hMin - 0.5 * cutMin);
    if (extra > 0) expected.push(['Load / unload on the pallet', hr4(extra), 'mach-hmc-400', 1]);
  }
  expected.push(['Deburr', hr4(Math.round((1 + 0.004 * geo.faces.total) * 100) / 100), 'mach-hmc-400', 1]);
  check(part, 'machining operation count', expected.length, P.machiningOps.length, 0);
  expected.forEach(([name, hr, mach, man], i) => {
    const d = P.machiningOps[i];
    if (!d) return;
    check(part, `op ${name.slice(0, 40)} hr`, hr, d.cycleTimeHr, 0.00005);
    check(part, `op ${name.slice(0, 40)} machine`, mach, d.machineId);
    check(part, `op ${name.slice(0, 40)} crew`, man, d.manning, 0);
  });
  const cutMin = expected.filter(e => !/^(Load|Pallet|Deburr)/.test(e[0])).reduce((s, e) => s + e[1] * 60, 0);
  check(part, 'tool wear £ = cutting min (no handling) × £/min', Math.round(cutMin * cd.wear * 10_000) / 10_000, P.machiningToolWearCostPerPart);
  check(part, 'fixtures £ (1 hydraulic + lathe fixture)', FIXTURE.hydraulic + FIXTURE.dedicated, P.machiningToolingCost, 0.5);
  const prog = Math.round(Math.round((PROG.perFix * 2 + PROG.perRow * rows.length) * 100) / 100 * labourRate('lab-uk-engineer'));
  check(part, 'programming £', prog, P.machiningProgrammingNRE, 0.5);
  check(part, 'setup hr (cell + lathe) × 45 min', 1.5, P.machiningSetup.setupTimeHr);
}

// ── Near-net: the feature path (forgings, castings — secondaryMachining in to-cost-params) ───────────────────────────
function featurePath(partFile: string, family: string, weightKg: number, coredAbove: number | undefined): void {
  const part = partFile.replace(/\.stp$/, '');
  const geo: Geo = BASE.find(b => b.part === partFile)!.geometry;
  const dump = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8'));
  const P = dump.params;
  const rows: Row[] = geo.featureTable ?? [];
  const cd = CUT[family];
  const included = rows.filter(r => r.kind === 'hole' || r.kind === 'face');
  // turned near-net part?
  const t = geo.turning; const bb = geo.boundingBox;
  let tp: { ext: number; dia: number } | null = null;
  if (t && t.axis && t.fraction >= 0.6) {
    const dims = [bb.xMm, bb.yMm, bb.zMm]; const ax = t.axis.map(Math.abs); const i = ax.indexOf(Math.max(...ax));
    const perp = dims.filter((_, k) => k !== i); const dia = t.externalMaxDiaMm ?? t.maxDiaMm ?? 0;
    if (dia >= 0.9 * Math.max(...perp) && (t.externalAreaMm2 ?? 0) / 100 >= 20) tp = { ext: t.externalAreaMm2 / 100, dia };
  }
  const minEach = (r: Row) => (tp && r.kind === 'face') ? 0 : (coredAbove !== undefined ? nearNetHoleMin(r, coredAbove) : holeMin(r)) * cd.tf;
  const millMin = included.reduce((s, r) => s + Math.round(minEach(r) * r.count * 1000) / 1000, 0);
  let latheMin = 0;
  if (tp) {
    const faced = included.filter(r => r.kind === 'face').reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
    const a = tp.ext + faced;
    latheMin = r2(a * NEAR_NET_TURN_STOCK / 10 / cd.turn + a / (FIN.turn / cd.tf) + 3 * TOOL_CHANGE_S / 60);
  }
  const milled = !tp && included.some(r => r.kind !== 'hole');
  const volumeCell = milled && ANNUAL >= 25_000;
  const asked = tp ? 2 + (included.some(r => r.kind !== 'face') ? 1 : 0) : (geo.setupAnalysis?.estimatedSetupCount ?? 2);
  const fixturings = volumeCell ? (asked <= 4 ? 1 : 2) : asked;
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  const hMin = handlingMin(weightKg);
  const machine = volumeCell ? 'mach-hmc-400' : tp ? 'mach-drill' : milled ? 'mach-vmc3' : 'mach-drill';
  const ops = P.secondaryMachiningOps as Array<{ operationName: string; machineId: string; cycleTimeHr: number; labourTimeHr: number; manning: number; oee: number; benchOperation?: boolean }>;
  let i = 0;
  if (tp) {
    check(part, 'lathe op min (outside + faces, 2 mm stock)', latheMin, ops[i].cycleTimeHr * 60, 0.006);
    check(part, 'lathe op machine', 'mach-lathe-cnc', ops[i].machineId); i++;
  }
  check(part, 'cut op min (holes, faces × metal factor)', millMin, ops[i].cycleTimeHr * 60, 0.006);
  check(part, 'cut op machine', machine, ops[i].machineId);
  check(part, 'cut op crew 0.5', CUT_MANNING, ops[i].manning, 0); i++;
  const changeMin = fixturings * SETUP_MIN / batch;
  if (volumeCell) {
    check(part, 'pallet change hr = fixturings × 10 s (machine)', fixturings * PALLET_S / 3600, ops[i].cycleTimeHr, 0.00001); i++;
    // Change-over stops the machine (finding L4): machine time, its own op — the pallet only masks the load.
    // Lead's merge (M4): only the load the cut's crew share does not already cover is charged; absent when covered.
    const extraLoad = PRE ? fixturings * hMin + changeMin : Math.max(0, fixturings * hMin - CUT_MANNING * millMin);
    if (extraLoad > 0) {
      check(part, 'masked load: labour only, handling', extraLoad / 60, ops[i].labourTimeHr, 0.00001);
      check(part, 'masked load: no machine time', 0, ops[i].cycleTimeHr, 0); i++;
    } else check(part, 'masked load: covered by the cut — no step', 0, ops.filter(o => /load \/ unload on the pallet/i.test(o.operationName)).length, 0);
    if (!PRE) { check(part, 'change-over op hr (machine + setter)', changeMin / 60, ops[i]?.cycleTimeHr, 0.000001); i++; }
  } else {
    check(part, 'load / unload + change-over hr', fixturings * (hMin + SETUP_MIN / batch) / 60, ops[i].cycleTimeHr, 0.00001); i++;
  }
  const cuttingMin = millMin + latheMin;
  check(part, 'tool wear £', Math.round(cuttingMin * cd.wear * 10_000) / 10_000, P.secondaryMachiningConsumablesPerPart, 0.0002);
  const chuck = tp ? 2 : 0;
  const each = volumeCell ? FIXTURE.hydraulic : FIXTURE.dedicated;
  const fixture = PRE ? fixturings * each : (fixturings - chuck) * each + chuck * FIXTURE.softJaws;     // lathe chuckings are soft jaws (finding L3)
  const prog = Math.round(Math.round((PROG.perFix * fixturings + PROG.perRow * included.length) * 100) / 100 * labourRate('lab-uk-engineer'));
  check(part, 'fixtures + programming £', fixture + prog, P.secondaryMachiningToolingCost, 0.5);
}

if (!existsSync(DUMP)) { console.error(`no dump at ${DUMP}`); process.exit(2); }
fromSolid('Part1.stp', 'aluminium', 'mat-al6082-bar');
fromSolid('MACH_Hydraulic_Manifold.stp', 'aluminium', 'mat-al6082-bar');
fromSolid('MACH_Stepped_Shaft.stp', 'steel', 'mat-en8');
castAndMachine('PRCR002.stp', 'cast iron', 'sand');
featurePath('FORGE_Hub_Flange.stp', 'steel', 2.842, 25);
featurePath('steering_knuckle_RH.stp', 'steel', 3.255, 25);

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) { console.log('\nFAILS:\n' + fails.join('\n')); process.exit(1); }

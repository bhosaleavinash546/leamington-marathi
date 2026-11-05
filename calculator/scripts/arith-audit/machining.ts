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
 * Country, volume, programme and delivery terms are read off the dump (7-country review, 3 Nov 2026,
 * dump-context.ts): every £/h is the region's own book, fixtures take the book's toolroom factor, overhead the
 * country's shop default; ex-works carries no freight.
 * Write-up: docs/review/arith-audit/machining.md.
 * Report standard round (3 Nov 2026): cutting time re-based on PUBLISHED catalogue cutting data (cutting-catalogue.ts) —
 * restated here independently from data.json (`CAT`), with the labelled assumptions; allowances are no longer scaled by
 * the metal; tool change 2.2 s, pallet change 7.1 s.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpContext, contextLine } from './dump-context.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DUMP = process.argv[2]
  ?? '/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/arith-dump';
const BASE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: Geo }>;
const C = dumpContext(DUMP);
const BOOK = C.book;
/** Model the code BEFORE the audit's fixes (M1, L1, M3, L3, L4) — reproduces the shared pre-fix dump. */
const PRE = !!process.env.ARITH_PRE_FIX;
const machineRate = C.machineRate;
const labourRate = C.labourRate;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geo = any;
interface Row { kind: string; diaMm: number; depthMm: number; through: boolean | null; count: number; areaMm2?: number;
  axes?: Array<{ line: string; s0: number; s1: number }> }

// ── Auditor's restatement of the stated constants ─────────────────────────────────────────────────────────────────
const ANNUAL = C.annual, YEARS = C.years;                          // the dump's own (dump.ts)
const DENSITY: Record<string, number> = { aluminium: 0.0027, steel: 0.00785, 'cast iron': 0.00715 };   // derive/material.ts:23
// Machinability ratio (only for ball-nose surfacing and helical milling — no catalogue row) and tool £/min (machining-time.ts)
const CUT: Record<string, { tf: number; wear: number }> = {
  aluminium: { tf: 1.0, wear: 0.04 }, steel: { tf: 2.0, wear: 0.12 }, 'cast iron': { tf: 1.6, wear: 0.10 },
};
/**
 * The published cutting data (report standard round, 3 Nov 2026), restated by the auditor from
 * scripts/research/2026-11-report-standard/machining/data.json (row numbers in the comments; the 3 CORRECTED rows as
 * corrected) — NOT read from cutting-catalogue.ts. face: vc, fz (WSX445 #0/#2/#3 MC5020, TungAlu #13); bodies [Ø, z]
 * (steel / iron ASSUMED, Al TungAlu worked table); rough fz, ap (WSX445 #4 medium, TungAlu max ap); side: APX4000 #7/#9
 * (fz 0.25 corrected) / TungAlu; drill [Ø, n, f] MVE #19–26; bore vc, f 0.2 (T515 #55); turn finish vc @ fn (Sandvik
 * #47/#52, SVJD #57); turn rough vc @ fn (Sandvik #47/#52, SVJD #57); tap 15 m/min (OSG #58–61).
 */
const CAT: Record<string, { face: [number, number]; bodies: Array<[number, number]>; rough: [number, number];
  side: { vc: number; fz: number; dc: number; z: number; apLim: number }; drill: Array<[number, number, number]>;
  bore: [number, number]; tFin: [number, number]; tRough: [number, number]; tap: number }> = {
  steel: { face: [220, 0.15], bodies: [[63, 5], [80, 6], [100, 7], [125, 8]], rough: [0.2, 3.0],
    side: { vc: 160, fz: 0.25, dc: 50, z: 4, apLim: 20 }, drill: [[12, 2300, 0.31], [16, 1700, 0.33]],
    bore: [350, 0.2], tFin: [485, 0.1], tRough: [350, 0.4], tap: 15 },
  'cast iron': { face: [200, 0.15], bodies: [[63, 5], [80, 6], [100, 7], [125, 8]], rough: [0.2, 3.0],
    side: { vc: 190, fz: 0.25, dc: 50, z: 4, apLim: 20 }, drill: [[12, 1900, 0.31], [16, 1400, 0.33]],
    bore: [201, 0.2], tFin: [260, 0.1], tRough: [215, 0.3], tap: 15 },
  aluminium: { face: [1000, 0.2], bodies: [[50, 4], [63, 5], [100, 6]], rough: [0.2, 2.0],
    side: { vc: 1000, fz: 0.2, dc: 50, z: 4, apLim: 2.0 }, drill: [[12, 2600, 0.31], [16, 1900, 0.33]],
    bore: [400, 0.2], tFin: [400, 0.15], tRough: [400, 0.3], tap: 15 },
};
// Labelled assumptions (cutting-catalogue.ts): step-over 0.7·Dc, 5 mm clearance a side, 10 mm side pass, +25 % air moves,
// 3 mm rough-turning ap, 0.10 min approach a lathe tool; ISO 261 coarse pitches by tapping drill.
const STEP = 0.7, CLEAR = 5, SIDE_AP = 10, AIR = 0.25, TURN_AP = 3, TURN_ALLOW = 0.10;
const TAP: Array<[number, number, number]> = [[2.5, 3, 0.5], [3.3, 4, 0.7], [4.2, 5, 0.8], [5.0, 6, 1.0], [6.8, 8, 1.25], [8.5, 10, 1.5], [10.2, 12, 1.75]];
const n = (vc: number, d: number) => 1000 * vc / (Math.PI * d);
const r1 = (x: number) => Math.round(x * 10) / 10;
/** In-cut milling roughing cm³/min on the Ø100 body: ae × ap × n·z·fz. */
const millQ = (fam: string) => { const c = CAT[fam]; const [dc, z] = c.bodies.find(b => b[0] === 100)!; return STEP * dc * c.rough[1] * n(c.face[0], dc) * z * c.rough[0] / 1000; };
/** Effective rough-turning cm³/min: vc × fn × ap ÷ (1 + air), to 0.1. */
const turnQ = (fam: string) => r1(CAT[fam].tRough[0] * CAT[fam].tRough[1] * TURN_AP / (1 + AIR));
const sideRate = (fam: string) => { const s = CAT[fam].side; return Math.min(SIDE_AP, s.apLim) * n(s.vc, s.dc) * s.z * s.fz / 100; };
const turnFin = (fam: string) => CAT[fam].tFin[0] * CAT[fam].tFin[1] * 10;
const FIN = { surf: 10 };                                           // ball-nose surfacing, aluminium (no catalogue row)
const TOOL_CHANGE_S = 2.2, SETUP_MIN = 45, PALLET_S = 7.1, CUT_MANNING = 0.5, OEE = 0.8, LAB_EFF = 0.92, REJECT = 0.02;
const PLATE = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140,
  150, 160, 180, 200, 225, 250, 275, 300];
const BAR = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120,
  130, 140, 150, 160, 180, 200, 220, 250, 280, 300];
const handlingMin = (kg: number) => kg <= 0.5 ? 0.3 : kg <= 5 ? 0.6 : kg <= 20 ? 1.2 : 2.5;
const FIXTURE = { modular: 500, dedicated: 2500, softJaws: 300, hydraulic: 12_000 };   // UK toolroom builds
/** machining-time.ts fixtureCostGBP: the UK-basis £ × the book's toolroom factor, rounded once per call. */
const fixtureGBP = (ukGbp: number) => Math.round(ukGbp * C.toolroomFactor);
const PROG = { perFix: 1.5, perRow: 0.25, surf: 2 };
/**
 * Fixture SETS (Part1 review, Nov 2026): each machine the part keeps busy carries its own set — annual × Σ (op hours ÷
 * OEE) on the machine + the change-over (fixturings × 45 min ÷ batch, OEE 1), ÷ the machine's available hours in the
 * book, rounded UP; no volume or no hours → 1. Restated from the capacity arithmetic the report prints, not called.
 */
const fixtureSets = (ops: Array<{ hr: number; oee: number; machineId: string; bench?: boolean }>, machineId: string, setups: number, batch: number): number => {
  const avail = (BOOK.machines.find((m: { id: string }) => m.id === machineId) as { buildup?: { annualAvailableHours?: number } } | undefined)?.buildup?.annualAvailableHours ?? 0;
  if (!(ANNUAL > 0) || !(avail > 0)) return 1;
  const run = ops.filter(o => !o.bench && o.machineId === machineId).reduce((h, o) => h + o.hr / (o.oee > 0 ? o.oee : 1), 0);
  return Math.max(1, Math.ceil(ANNUAL * (run + setups * SETUP_MIN / 60 / batch) / avail - 1e-6));
};
const PECK = 1.5, TAP_APPROACH = 0.10;
const TAP_DRILLS = TAP.map(t => t[0]);
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
// A land at any Ø since 4 Nov 2026 (a cylinder shallower than ¼ Ø is not a drilled hole — a drill's point is 0.3 Ø long).
const isLand = (r: Row) => r.kind === 'hole' && r.diaMm > 0 && r.depthMm > 0 && r.depthMm < 0.25 * r.diaMm;
/** Drill feed along the hole at Ø (n·f): vc and f at Ø12 / Ø16 interpolated; f ∝ Ø below Ø12; held above Ø16. */
function drillVf(fam: string, d: number): number {
  const [[da, na, fa], [db, nb, fb]] = CAT[fam].drill;
  const vca = Math.PI * da * na / 1000, vcb = Math.PI * db * nb / 1000;
  const D = Math.max(d, 0.5);
  const [vc, f] = D <= da ? [vca, fa * D / da] : D >= db ? [vcb, fb] : [vca + (D - da) / (db - da) * (vcb - vca), fa + (D - da) / (db - da) * (fb - fa)];
  return n(vc, D) * f;
}
const boreVf = (fam: string, d: number) => n(CAT[fam].bore[0], Math.max(d, 1)) * CAT[fam].bore[1];
/** One face: 0.2 + passes × (√A + Dc + 2c) ÷ n·z·fz, the smallest body whose 0.7·Dc covers √A. */
function faceMin(fam: string, area: number): number {
  const c = CAT[fam]; const side = Math.sqrt(Math.max(area, 1));
  const [dc, z] = c.bodies.find(b => STEP * b[0] >= side) ?? c.bodies[c.bodies.length - 1];
  const passes = Math.max(1, Math.ceil(side / (STEP * dc) - 1e-9));
  return 0.20 + passes * (side + dc + 2 * CLEAR) / (n(c.face[0], dc) * z * c.face[1]);
}
/** One feature, minutes, at the metal's catalogue row (feature-machining.ts featureTime); allowances not scaled. */
function holeMin(r: Row, fam: string, cored?: number): number {
  if (r.kind === 'face') return faceMin(fam, r.areaMm2 ?? 0);
  const d = r.diaMm, L = Math.max(r.depthMm, 1);
  if (isLand(r)) return 0.20 + d * 0.004;
  if (cored !== undefined && d > cored) return 0.25 + L / boreVf(fam, d);
  const deep = L > 5 * Math.max(d, 1) ? PECK : 1;
  let t: number;
  if (d > 26) t = 0.50 + L * 0.050 * CUT[fam].tf;
  else {
    t = (d > 6 ? 0.15 : 0.06) + L / drillVf(fam, d) * deep;
    if (d > 13 && r.through === false) t += 0.25 + L / boreVf(fam, d);     // blind 13–26: a boring pass; through: drilled only
  }
  if (r.through === false) t += 0.10;
  const tp = TAP.find(x => r.depthMm >= 1.5 * d && Math.abs(x[0] - d) <= 0.1);
  if (tp) t += TAP_APPROACH + 2 * L / (n(CAT[fam].tap, tp[1]) * tp[2]);
  return t;
}
const nearNetHoleMin = (r: Row, fam: string, cored?: number) => holeMin(r, fam, r.kind === 'hole' ? cored : undefined);
/**
 * Hole work with STEPPED BORES (4 Nov 2026), restated: instances on one axis line (kernel `axes`), sorted along it, join
 * while the next starts within the run's end + half the Ø difference + 0.1 mm and the run has 2+ diameters. A stepped bore
 * = ONE approach (0.25 bored if any step Ø > cored, else 0.15 / 0.06 by the largest Ø) + 0.10 if no step is through +
 * each step's cut: a land 0.004 × Ø; above the cored size L ÷ bore n·f; above Ø26 L × 0.050 × tf; else L ÷ drill n·f
 * (× peck beyond 5×D) + a tap's 0.10 + 2L ÷ tap feed. Every other instance is `holeMin`. Returns all and bored minutes.
 */
function holeWorkMin(rows: Row[], fam: string, cored?: number): { all: number; bored: number } {
  const holes = rows.filter(r => r.kind === 'hole');
  const left = new Map(holes.map(r => [r, r.count]));
  const lines = new Map<string, Array<{ r: Row; s0: number; s1: number }>>();
  for (const r of holes) {
    if (!r.axes || r.axes.length !== r.count) continue;
    for (const a of r.axes) (lines.get(a.line) ?? lines.set(a.line, []).get(a.line)!).push({ r, s0: Math.min(a.s0, a.s1), s1: Math.max(a.s0, a.s1) });
  }
  let all = 0, bored = 0;
  const bore = (run: Array<{ r: Row }>) => {
    if (run.length < 2 || new Set(run.map(h => h.r.diaMm)).size < 2) return;
    for (const h of run) left.set(h.r, left.get(h.r)! - 1);
    const isBored = cored !== undefined && run.some(h => h.r.diaMm > cored);
    const maxD = Math.max(...run.map(h => h.r.diaMm));
    let t = (isBored ? 0.25 : maxD > 6 ? 0.15 : 0.06) + (run.some(h => h.r.through === true) ? 0 : 0.10);
    for (const { r } of run) {
      const d = r.diaMm, L = Math.max(r.depthMm, 1);
      if (isLand(r)) t += d * 0.004;
      else if (cored !== undefined && d > cored) t += L / boreVf(fam, d);
      else if (d > 26) t += L * 0.050 * CUT[fam].tf;
      else {
        t += L / drillVf(fam, d) * (L > 5 * Math.max(d, 1) ? PECK : 1);
        const tp = TAP.find(x => r.depthMm >= 1.5 * d && Math.abs(x[0] - d) <= 0.1);
        if (tp) t += TAP_APPROACH + 2 * L / (n(CAT[fam].tap, tp[1]) * tp[2]);
      }
    }
    all += t; if (isBored) bored += t;
  };
  for (const list of lines.values()) {
    list.sort((a, b) => a.s0 - b.s0 || a.s1 - b.s1);
    let run: typeof list = []; let end = -Infinity;
    for (const h of list) {
      const prev = run[run.length - 1];
      if (prev && h.s0 <= end + Math.abs(h.r.diaMm - prev.r.diaMm) / 2 + 0.1) { run.push(h); end = Math.max(end, h.s1); }
      else { bore(run); run = [h]; end = h.s1; }
    }
    bore(run);
  }
  for (const r of holes) {
    const k = left.get(r)!; if (k <= 0) continue;
    const t = nearNetHoleMin(r, fam, cored) * k;
    all += t; if (cored !== undefined && r.diaMm > cored) bored += t;
  }
  return { all, bored };
}
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
  const overhead = C.overheadPct * base;
  const subtotal = base + p.packaging + p.logistics + overhead;
  const margin = C.marginPct * subtotal;
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
  const roughMin = removed / millQ(family) * (1 + AIR), finishMin = wall / sideRate(family), surfMin = free / (FIN.surf / cd.tf);
  const holesMin = holeWorkMin(rows, family).all;
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
    const rough = removedT / turnQ(family), fin = turnedCm2 / turnFin(family);
    lathe = { total: r2(rough + fin + 3 * TURN_ALLOW + 3 * TOOL_CHANGE_S / 60), basisRough: rough };
    const other = Math.max(0, area - turnedCm2 - holeWallCm2(rows));
    const mf = other / sideRate(family), hm = holesMin;
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
  const sets = fixtureSets(ops.map(o => ({ hr: o.ct, oee: o.oee, machineId: o.machineId, bench: o.bench })), ch.primary, ch.setups, batch);
  const fixture = fixtureGBP(((ch.setups - chuck) * each + chuck * FIXTURE.softJaws) * sets);
  check(part, `fixtures £ (× toolroom factor, ${sets} set(s) — one a machine)`, fixture, P.toolingCost, 0.5);
  const progHr = Math.round((PROG.perFix * ch.setups + PROG.perRow * rows.length + (free > 0.5 && surfMin > 0 ? PROG.surf : 0)) * 100) / 100;
  const prog = Math.round(progHr * labourRate('lab-uk-engineer'));
  check(part, 'programming £ = h × engineer', prog, P.programmingNRE, 0.5);
  const cutMin = ops.filter(o => !o.bench && !o.name.startsWith('Load') && !o.name.startsWith('Pallet')).reduce((s, o) => s + o.ct * 60, 0);
  const wear = Math.round(cutMin * cd.wear * 10_000) / 10_000;
  check(part, 'tool wear £ = cutting min × £/min', wear, P.toolWearCostPerPart);
  check(part, 'amortisation volume = annual × years', ANNUAL * YEARS, P.amortizationVolume, 0);

  // Stack
  check(part, 'overhead % / margin % (country shop default)', `${C.overheadPct}/${C.marginPct}`,
    `${dump.trace.stackInput.overheadPct}/${dump.trace.stackInput.marginPct}`);
  if (C.terms === 'EXW') check(part, 'ex-works: logistics £ = 0', 0, dump.trace.stackInput.logisticsPerPart, 0);
  const s = stack({ materialId, netKg, util: P.materialUtilization, wear, ops, setupHr: setupsCharged * SETUP_MIN / 60, batch,
    setupMachine: ch.primary, tooling: fixture + prog, amort: ANNUAL * YEARS,
    packaging: dump.trace.stackInput.packagingPerPart, logistics: dump.trace.stackInput.logisticsPerPart });
  const B = dump.breakdown;
  check(part, '£ raw material (incl. tool wear)', s.material, B.rawMaterial);
  check(part, '£ process', s.process, B.process);
  check(part, '£ labour', s.labour, B.labour);
  check(part, '£ tooling (fixtures + programming ÷ volume)', s.tooling, B.tooling);
  check(part, `£ overhead ${Math.round(C.overheadPct * 100)} %`, s.overhead, B.overhead);
  check(part, '£ margin 8 %', s.margin, B.margin);
  check(part, '£ TOTAL', s.total, dump.total);
  if (process.env.ARITH_VERBOSE) console.log(JSON.stringify({ part, stockCm3, removed, wall, free, roughMin, finishMin, surfMin, holesMin, tools, cands, s }, null, 1));
}

// ── Near-net: the cast + machine half (rules, nearNetCut) AND the casting / forging routes' secondary machining ────────
// Secondary-machining parity (3 Nov 2026): ONE near-net plan on both — the costed rows are holes and measured faces; the
// deburr counts the machined faces (the costed rows' B-rep faces), the programming the costed rows; a turned near-net part
// (hub flange) is turned outside + faces on the lathe and never routed to the HMC cell; the forging route's ops carry the
// change-over first (efficiency 1) and the casting / forging tooling is fixtures + programming in one item.
function nearNet(partFile: string, family: string, subtype: string, mode: 'cam' | 'secondary', coredOverride?: number, turnStock?: number): void {
  const part = partFile.replace(/\.stp$/, '');
  const geo: Geo = BASE.find(b => b.part === partFile)!.geometry;
  const dump = JSON.parse(readFileSync(join(DUMP, `${part}.json`), 'utf8'));
  const P = dump.params;
  const all: Row[] = geo.featureTable ?? [];
  const rows = all.filter(r => r.kind === 'hole' || r.kind === 'face');                 // the default costed rows
  const cd = CUT[family];
  const cored = coredOverride ?? CORED[subtype] ?? 20;
  // turned near-net part?
  const t = geo.turning; const bb = geo.boundingBox;
  let tp: { ext: number; dia: number } | null = null;
  if (t && t.axis && t.fraction >= 0.6) {
    const dims = [bb.xMm, bb.yMm, bb.zMm]; const ax = t.axis.map(Math.abs); const i = ax.indexOf(Math.max(...ax));
    const perp = dims.filter((_, k) => k !== i); const dia = t.externalMaxDiaMm ?? t.maxDiaMm ?? 0;
    if (dia >= 0.9 * Math.max(...perp) && (t.externalAreaMm2 ?? 0) / 100 >= 20) tp = { ext: t.externalAreaMm2 / 100, dia };
  }
  const faces = rows.filter(r => r.kind === 'face');
  const facesMin = faces.reduce((s, r) => s + holeMin(r, family) * r.count, 0);
  const work = holeWorkMin(rows, family, cored);
  const allHoleMin = work.all;
  const tools = (faces.length ? 1 : 0) + 1 + holeSizes(rows);
  const nn = { finish: r2(facesMin), tc: r2(tools * TOOL_CHANGE_S / 60), hole: r2(allHoleMin) };
  const boreMin = r2(work.bored);
  const drillMin = Math.max(0, r2(nn.hole - boreMin));
  const millMin = tp ? 0 : nn.finish + nn.tc;
  const ext = (geo.turning?.externalAreaMm2 ?? 0) / 100;
  const facedCm2 = faces.reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  const spindleCm2 = tp ? tp.ext + facedCm2 : ext >= 20 && ext / geo.surfaceArea.cm2 >= 0.08 ? ext : 0;
  const stockMm = turnStock ?? (subtype === 'sand' && (family === 'steel' || family === 'cast iron') ? CAST_STOCK_MM.sand_ferrous : CAST_STOCK_MM[subtype] ?? 1.5);
  const sp = spindleCm2 * stockMm / 10 / turnQ(family) + spindleCm2 / turnFin(family) + 3 * TURN_ALLOW + 3 * TOOL_CHANGE_S / 60;
  const spindleMin = r2(sp);
  const hMin = handlingMin(geo.volume.cm3 * DENSITY[family]);
  const dirsList = geo.setupAnalysis.principalDirections as Array<{ directionLabel: string; faceCount: number }>;
  const tot = dirsList.reduce((s, d) => s + d.faceCount, 0);
  // Routing, cost-ranked like the from-solid part (machine + operator), on the near-net conventions: held on its cast
  // datums, so the split needs one fixturing a direction (not ≥ 2) and the 5-axis one clamping; the cored bores are
  // milled-centre time. A turned part is one direction and never the HMC cell.
  const sortedBb = [geo.boundingBox.xMm, geo.boundingBox.yMm, geo.boundingBox.zMm].sort((a: number, b: number) => b - a);
  const dirs = tp ? 1 : Math.max(1, geo.setupAnalysis?.estimatedSetupCount ?? 1);
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  const millHr = (millMin + boreMin) / 60, drillHr = drillMin / 60, setupHr = SETUP_MIN / 60, hHr = hMin / 60;
  const lab = labourRate('lab-uk-skilled');
  const labourOf = (cutHr: number, handHr: number) => Math.round(lab * (cutHr * CUT_MANNING + handHr) * 10_000) / 10_000;
  const cands: Array<{ label: string; primary: string; drill: string; setups: number; total: number; masked: boolean }> = [];
  const push = (label: string, prim: { id: string; rate: number }, drill: { id: string; rate: number } | null, setups: number, masked = false) => {
    const dr = drillHr > 0 ? (drill ?? prim) : null;
    const machine = millHr * prim.rate + drillHr * (dr?.rate ?? 0) + setups * setupHr * prim.rate / batch
      + (masked ? setups * PALLET_S / 3600 * prim.rate : setups * hHr * prim.rate);
    const labour = labourOf(millHr + drillHr, masked ? Math.max(0, setups * hHr - (millHr + drillHr) * CUT_MANNING) : setups * hHr);
    cands.push({ label, primary: prim.id, drill: dr?.id ?? prim.id, setups, total: machine + labour, masked });
  };
  push('split-3axis', cheapest('mill3', sortedBb), cheapest('drill', sortedBb), dirs + (drillHr > 0 ? 1 : 0));
  push('consolidated-5axis', cheapest('mill5', sortedBb), null, 1);
  if (ANNUAL >= 25_000 && !tp) push('volume-cell', cheapest('hmc', sortedBb), null, dirs <= 4 ? 1 : 2, true);
  cands.sort((a, b) => a.total - b.total);
  const ch = cands[0];
  if (mode === 'cam') {
    const routeBasis = String(dump.provenance['cam-mach-setup-mach']?.basis ?? '');
    for (const c of cands) {
      const m = new RegExp(`${c.label} £([0-9.]+) \\(machine`).exec(routeBasis);
      check(part, `routing ${c.label}: machine + operator £/part (basis)`, r2(c.total), m ? Number(m[1]) : NaN, 0.0051);
    }
    check(part, 'routing chosen', ch.label, /→ ([a-z0-9-]+)/.exec(routeBasis)?.[1]);
  }
  const expected: Array<[string, number, string, number]> = [];
  if (millMin > 0) for (const d of dirsList) expected.push([`Finish machining — ${d.directionLabel} side`, hr4(millMin * d.faceCount / tot), ch.primary, 0.5]);
  if (drillMin > 0) expected.push(['Drilling', hr4(drillMin), ch.drill, 0.5]);
  if (boreMin > 0) expected.push(['Finish boring', hr4(boreMin), ch.primary, 0.5]);
  // The lathe op is the cut; loading the part into the lathe fixture is a whole operator's (finding M3).
  if (!spindleCm2) { /* no turned axis (a bracket): no lathe op */ }
  else if (PRE) expected.push(['Turning — spindle (+ load, pre-fix)', hr4(spindleMin + hMin), 'mach-lathe-cnc', 0.5]);
  else {
    expected.push([tp ? 'Turning — outside and faces' : 'Turning — spindle', hr4(spindleMin), 'mach-lathe-cnc', 0.5]);
    expected.push(['Load / clamp / unload — lathe', hr4(hMin), 'mach-lathe-cnc', 1]);
  }
  if (ch.masked) {
    expected.push(['Pallet change', hr4(ch.setups * PALLET_S / 60), ch.primary, 0.5]);
    // Lead's merge (M4): only the load the operator's 0.5 share of the cut does not cover.
    const cutMin = expected.filter(e => !/^Load \/ clamp|^Pallet change|^Deburr/.test(String(e[0]))).reduce((s, e) => s + Number(e[1]) * 60, 0);
    const extra = Math.max(0, ch.setups * hMin - 0.5 * cutMin);
    if (extra > 0) expected.push(['Load / unload on the pallet', hr4(extra), ch.primary, 1]);
  } else {
    expected.push(['Load / clamp / unload', hr4(ch.setups * hMin), ch.primary, 1]);
  }
  // The deburr counts the MACHINED faces: the costed rows' B-rep faces, once each (a row without ids, one an instance).
  const ids = new Set<number>(); let unnamed = 0;
  for (const r of rows as Array<Row & { faceIds?: number[] }>) { if (r.faceIds?.length) r.faceIds.forEach(x => ids.add(x)); else unnamed += Math.max(1, r.count); }
  const machinedFaces = ids.size + unnamed;
  expected.push(['Deburr', hr4(Math.round((1 + 0.004 * machinedFaces) * 100) / 100), ch.primary, 1]);
  const lathe = spindleCm2 ? 1 : 0;
  const setups = ch.setups + lathe;
  // The ops as costed: cast + machine's plan (P.machiningOps) or the secondary machining (P.secondaryMachiningOps, the
  // change-over first — the same inputs the cast + machine module builds).
  type DOp = { name: string; cycleTimeHr: number; machineId: string; manning: number; labourEfficiency?: number };
  let dOps: DOp[];
  if (mode === 'cam') dOps = P.machiningOps;
  else {
    const so = (P.secondaryMachiningOps ?? []) as Array<{ operationName: string; cycleTimeHr: number; labourTimeHr: number; machineId: string; manning: number; labourEfficiency: number; benchOperation?: boolean }>;
    const setupOp = so[0];
    check(part, 'change-over op first: setups × 45 min ÷ batch', Math.round(setups * SETUP_MIN / 60 * 1000) / 1000 / batch, setupOp?.cycleTimeHr, 1e-9);
    check(part, 'change-over op labour efficiency 1', 1, setupOp?.labourEfficiency, 0);
    check(part, 'change-over op machine', ch.primary, setupOp?.machineId);
    dOps = so.slice(1).map(o => ({ name: o.operationName, cycleTimeHr: o.benchOperation ? o.labourTimeHr : o.cycleTimeHr, machineId: o.machineId, manning: o.manning, labourEfficiency: o.labourEfficiency }));
    for (const o of dOps) check(part, `op ${o.name.slice(0, 40)} labour efficiency (shop)`, LAB_EFF, o.labourEfficiency, 0);
  }
  check(part, 'machining operation count', expected.length, dOps.length, 0);
  expected.forEach(([name, hr, mach, man], i) => {
    const d = dOps[i];
    if (!d) return;
    check(part, `op ${name.slice(0, 40)} name`, name, d.name.slice(0, name.length));
    check(part, `op ${name.slice(0, 40)} hr`, hr, d.cycleTimeHr, 0.00005);
    check(part, `op ${name.slice(0, 40)} machine`, mach, d.machineId);
    check(part, `op ${name.slice(0, 40)} crew`, man, d.manning, 0);
  });
  const cutMin = expected.filter(e => !/^(Load|Pallet|Deburr)/.test(e[0])).reduce((s, e) => s + e[1] * 60, 0);
  const wear = Math.round(cutMin * cd.wear * 10_000) / 10_000;
  check(part, 'tool wear £ = cutting min (no handling) × £/min', wear, mode === 'cam' ? P.machiningToolWearCostPerPart : P.secondaryMachiningConsumablesPerPart);
  // the cell's fixture(s) — a hydraulic tombstone fixture on the HMC, dedicated fixtures on a split / 5-axis routing — and
  // the lathe's own dedicated fixture, each a toolroom build (× the book's toolroom factor, rounded per fixture set)
  // one fixture set a machine the capacity implies (the mill on its plan ops + change-over; the lathe on its own ops)
  const planOps = expected.map(([name, hr, mach]) => ({ hr, oee: OEE, machineId: mach, bench: /^Deburr|^Load \/ unload on the pallet/.test(name) }));
  const millSets = fixtureSets(planOps, ch.primary, ch.setups, batch);
  const latheSets = lathe ? fixtureSets(planOps, 'mach-lathe-cnc', 1, batch) : 0;
  const millFx = fixtureGBP(ch.setups * millSets * (ch.masked ? FIXTURE.hydraulic : ANNUAL * 5 > 10_000 ? FIXTURE.dedicated : FIXTURE.modular));
  const latheFx = lathe ? fixtureGBP(latheSets * (ANNUAL * 5 > 10_000 ? FIXTURE.dedicated : FIXTURE.modular)) : 0;
  // programming: the MACHINED feature rows (a cast-in pocket or boss is not programmed)
  const prog = Math.round(Math.round((PROG.perFix * setups + PROG.perRow * rows.length) * 100) / 100 * labourRate('lab-uk-engineer'));
  if (mode === 'cam') {
    check(part, `fixtures £ (${ch.setups} ${ch.masked ? 'hydraulic' : 'mill'} × ${millSets} set(s) + lathe × ${latheSets})`, millFx + latheFx, P.machiningToolingCost, 0.5);
    check(part, `programming £ (${rows.length} machined rows)`, prog, P.machiningProgrammingNRE, 0.5);
    check(part, `setup hr (${ch.setups}${lathe ? ' + lathe' : ''}) × 45 min`, setups * SETUP_MIN / 60, P.machiningSetup.setupTimeHr);
  } else {
    check(part, `fixtures + programming £ (${rows.length} machined rows)`, millFx + latheFx + prog, P.secondaryMachiningToolingCost, 1);
    // the programming inside it — the module prints fixtures and programming as cast + machine's two items (Nov 2026)
    check(part, `programming £ (${rows.length} machined rows)`, prog, P.secondaryMachiningProgrammingNRE, 0.5);
    check(part, `fixtures £ (${ch.setups} ${ch.masked ? 'hydraulic' : 'mill'} × ${millSets} set(s) + lathe × ${latheSets})`, millFx + latheFx,
      Number(P.secondaryMachiningToolingCost) - Number(P.secondaryMachiningProgrammingNRE), 0.5);
  }
}

if (!existsSync(DUMP)) { console.error(`no dump at ${DUMP}`); process.exit(2); }
console.log(`machining shadow model — ${contextLine(C)}`);
fromSolid('Part1.stp', 'aluminium', 'mat-al6082-bar');
fromSolid('MACH_Hydraulic_Manifold.stp', 'aluminium', 'mat-al6082-bar');
fromSolid('MACH_Stepped_Shaft.stp', 'steel', 'mat-en8');
nearNet('PRCR002.stp', 'cast iron', 'sand', 'cam');
// The forgings' secondary machining is the near-net plan (secondary-machining parity, 3 Nov 2026): pierced above Ø25,
// 2 mm near-net turning stock.
nearNet('FORGE_Hub_Flange.stp', 'steel', 'forging', 'secondary', 25, NEAR_NET_TURN_STOCK);
nearNet('steering_knuckle_RH.stp', 'steel', 'forging', 'secondary', 25, NEAR_NET_TURN_STOCK);
// Added with the catalogue time base (3 Nov 2026): the cast-steel bracket's machining half and the yoke.
nearNet('Casting_Braket.stp', 'steel', 'sand', 'cam');
nearNet('FORGE_Control_Arm_Yoke.stp', 'steel', 'forging', 'secondary', 25, NEAR_NET_TURN_STOCK);

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) { console.log('\nFAILS:\n' + fails.join('\n')); process.exit(1); }

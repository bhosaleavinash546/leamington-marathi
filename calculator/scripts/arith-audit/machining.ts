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
// CV_BASELINE_FILE: a baseline with re-measured geometry (Part1 review phase 3: the kernel's narrow slits) — the default is the
// committed baseline.
const BASE = JSON.parse(readFileSync(process.env.CV_BASELINE_FILE ?? join(ROOT, 'tests/fixtures/real-parts-baseline.json'), 'utf8')) as Array<{ part: string; geometry: Geo }>;
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
const STEP = 0.7, CLEAR = 5, SIDE_AP = 10, AIR = 0.25, TURN_AP = 3;
/**
 * PKG-2 (10 Nov 2026) — the non-cutting model, restated (non-cut-time.ts): no fixed allowance a feature; each tool visit
 * rapids 2 × 25 mm (clearance plane), feeds 2 mm of R-plane in at its own feed (a tap in AND out), retracts out of a hole
 * at rapid; the operation pays 2.2 s a DISTINCT tool, the traverse between a tool's visits (nearest neighbour over the
 * kernel's axis mid-points, else (n − 1) × √(plan ÷ n)), one 12 s datum probe on a near-net part (not a turned one), and
 * 0.8 s an index between the sides of a clamping on the HMC / 5-axis. Rapids by machine (m/min): the makers' figures.
 * Passes from the stock (CF-06): a face rough at ap ≤ 3 (fz 0.2) then finish ap ≤ 1 (steel / iron), aluminium ⌈stock ÷ 2⌉
 * passes; a cored bore rough at the turning rough row, ap ≤ 4 / 5 / 3 (steel / iron / Al), then finish ap ≤ 1.
 */
const CLEAR_PLANE = 25, R_PLANE = 2, PROBE_S = 12, INDEX_S = 0.8, LAND = 0.004, HELICAL = 0.050;
const RAPID: Record<string, number> = { 'mach-hmc-400': 60, 'mach-haas-vf2': 25.4, 'mach-vmc3': 25.4, 'mach-drill': 25.4,
  'mach-haas-umc500': 22.9, 'mach-vmc5': 22.9, 'mach-dmg-dmu50': 42, 'mach-lathe-cnc': 30, 'mach-mazak-qt200': 30 };
const rapidMin = (mm: number, id: string) => (mm > 0 ? mm / ((RAPID[id] ?? 22.9) * 1000) : 0);
const FACE_FIN_AP: Record<string, number | null> = { steel: 1.0, 'cast iron': 1.0, aluminium: null };
const BORE_AP: Record<string, [number, number]> = { steel: [4.0, 1.0], 'cast iron': [5.0, 1.0], aluminium: [3.0, 1.0] };
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
const PECK = 1.5;
const TAP_DRILLS = TAP.map(t => t[0]);
const CORED: Record<string, number> = { sand: 20, gravity: 20, investment: 20, hpdc: 6, forging: 25 };
const CAST_STOCK_MM: Record<string, number> = { sand_ferrous: 3.0, sand: 2.0, gravity: 1.5, investment: 1.0, hpdc: 0.5 };
const NEAR_NET_TURN_STOCK = 2;
/**
 * Slitting saws (Part1 review phase 3, Nov 2026), restated from scripts/research/2026-11-slitting/data.json (ZPS-FN HSS
 * saws): the material group's vc and fz RANGES (#0–11) — the costing takes the middle; the saw type by chip form (#30);
 * bodies [Ø, bore, Z at 2 / 2.5 / 3 mm wide] (#12–29). Collar = 2 × bore (ASSUMED). Feed along the root through the depth,
 * full radial depth = the slit's length: travel = depth + √(ae(D − ae)) + 2 × 5 mm; one tool change a slitting op.
 */
const SAW: Record<string, { vc: [number, number]; fz: [number, number]; type: 'W' | 'H' }> = {
  steel: { vc: [10, 20], fz: [0.02, 0.03], type: 'W' }, 'cast iron': { vc: [15, 25], fz: [0.04, 0.05], type: 'H' },
  aluminium: { vc: [100, 150], fz: [0.03, 0.07], type: 'W' },
};
const SAW_BODIES: Record<'W' | 'H', Array<[number, number, [number, number, number]]>> = {
  W: [[63, 16, [40, 32, 32]], [80, 22, [40, 40, 40]], [100, 22, [48, 48, 40]]],
  H: [[63, 16, [80, 64, 64]], [80, 22, [80, 80, 80]], [100, 22, [100, 100, 80]]],
};
function slitMin(fam: string, s: { widthMm: number; depthMm: number; lengthMm: number | null }): number {
  const k = SAW[fam]; const vc = (k.vc[0] + k.vc[1]) / 2; const fz = Math.round((k.fz[0] + k.fz[1]) / 2 * 10_000) / 10_000;
  const wi = s.widthMm > 2.75 ? 2 : s.widthMm > 2.25 ? 1 : 0;
  const bodies = SAW_BODIES[k.type];
  const L = s.lengthMm && s.lengthMm > 0 ? s.lengthMm : null;
  const [D, , zs] = (L != null ? bodies.find(([d, b]) => (d - 2 * b) / 2 >= L) : null) ?? bodies[bodies.length - 1];
  const ae = L != null ? Math.min(L, D / 2) : D / 2;
  return (s.depthMm + Math.sqrt(ae * (D - ae)) + 2 * CLEAR) / (n(vc, D) * zs[wi] * fz);
}
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
type P3 = [number, number, number];
/** A tool visit: its tool, its non-cutting minutes at feed, its rapid inside the visit (out of a hole / back), its position. */
interface V { tool: string; fi: number; out: number; pos: P3 | null }
/** One instance: cutting minutes, its own non-cutting minutes at feed, its visits. */
interface Piece { cut: number; fi: number; visits: V[] }
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
const sideVf = (fam: string) => { const sd = CAT[fam].side; return n(sd.vc, sd.dc) * sd.z * sd.fz; };
/** One face from `stock` mm a side (none → one finish pass): each pass (√A + Dc) ÷ n·z·fz cut + 2 × 5 mm at feed. */
function facePiece(fam: string, area: number, stock?: number): Piece {
  const c = CAT[fam]; const side = Math.sqrt(Math.max(area, 1));
  const [dc, z] = c.bodies.find(b => STEP * b[0] >= side) ?? c.bodies[c.bodies.length - 1];
  const across = Math.max(1, Math.ceil(side / (STEP * dc) - 1e-9));
  const fin = FACE_FIN_AP[fam];
  let rough = 0, finish = 1;
  if (stock !== undefined && stock > 0) {
    if (fin === null) finish = Math.max(1, Math.ceil(stock / c.rough[1] - 1e-9));
    else if (stock > fin + 1e-9) rough = Math.max(1, Math.ceil((stock - fin) / c.rough[1] - 1e-9));
  }
  const vfF = n(c.face[0], dc) * z * c.face[1], vfR = n(c.face[0], dc) * z * c.rough[0];
  const cut = (rough / vfR + finish / vfF) * across * (side + dc);
  const fi = (rough / vfR + finish / vfF) * across * 2 * CLEAR;
  return { cut, fi, visits: [{ tool: 'face mill', fi, out: (rough + finish - 1) * across * (side + dc + 2 * CLEAR), pos: null }] };
}
const holeTool = (d: number) => `drill Ø${(Math.round(d * 2) / 2).toFixed(1)}`;
/** One hole instance (feature-machining.ts holeInstance, restated). */
function holePiece(r: Row, fam: string, cored?: number, stock?: number, inStep = false): Piece {
  const d = r.diaMm, L = Math.max(r.depthMm, 1);
  if (isLand(r)) {
    const fi = inStep ? 0 : R_PLANE / boreVf(fam, d);
    return { cut: d * LAND, fi, visits: inStep ? [] : [{ tool: `spot face Ø${d.toFixed(1)}`, fi, out: 0, pos: null }] };
  }
  if (cored !== undefined && d > cored) {
    const [rap, fap] = BORE_AP[fam];
    const nR = stock !== undefined && stock > fap + 1e-9 ? Math.max(1, Math.ceil((stock - fap) / rap - 1e-9)) : 0;
    const vfR = n(CAT[fam].tRough[0], Math.max(d, 1)) * CAT[fam].tRough[1], vfF = boreVf(fam, d);
    const visits: V[] = [...Array.from({ length: nR }, () => ({ tool: `rough bore Ø${d.toFixed(1)}`, fi: R_PLANE / vfR, out: L, pos: null })),
      { tool: `bore Ø${d.toFixed(1)}`, fi: R_PLANE / vfF, out: L, pos: null }];
    return { cut: nR * L / vfR + L / vfF, fi: visits.reduce((x, v) => x + v.fi, 0), visits };
  }
  if (d > 26) {
    const fi = R_PLANE * HELICAL * CUT[fam].tf;
    return { cut: L * HELICAL * CUT[fam].tf, fi, visits: [{ tool: 'helical end mill', fi, out: L, pos: null }] };
  }
  const vf = drillVf(fam, d);
  const deep = L > 5 * Math.max(d, 1) ? PECK : 1;
  let cut = L / vf; const visits: V[] = [{ tool: holeTool(d), fi: R_PLANE / vf + (deep - 1) * L / vf, out: L, pos: null }];
  if (!inStep && d > 13 && r.through === false) { cut += L / boreVf(fam, d); visits.push({ tool: `bore Ø${d.toFixed(1)}`, fi: R_PLANE / boreVf(fam, d), out: L, pos: null }); }
  const tp = TAP.find(x => r.depthMm >= 1.5 * d && Math.abs(x[0] - d) <= 0.1);
  if (tp) { const tvf = n(CAT[fam].tap, tp[1]) * tp[2]; cut += 2 * L / tvf; visits.push({ tool: `tap M${tp[1]}`, fi: 2 * R_PLANE / tvf, out: 0, pos: null }); }
  return { cut, fi: visits.reduce((x, v) => x + v.fi, 0), visits };
}
const mid = (a: { line: string; s0: number; s1: number } | undefined): P3 | null => {
  if (!a) return null; const v = a.line.split(',').map(Number); const m = (a.s0 + a.s1) / 2;
  return v.length >= 6 && v.every(Number.isFinite) ? [v[0] + v[3] * m, v[1] + v[4] * m, v[2] + v[5] * m] : null;
};
/**
 * Hole work with STEPPED BORES (4 Nov 2026), restated: instances on one axis line (kernel `axes`), sorted along it, join
 * while the next starts within the run's end + half the Ø difference + 0.1 mm and the run has 2+ diameters. A stepped bore
 * = each step's own piece (a land in it is cut by the step beside it — no visit of its own); bored when a step Ø > cored.
 * Every other instance is its `holePiece`. Returns the drilled and the bored work: cutting, own non-cutting, visits.
 */
function holeWork(rows: Row[], fam: string, cored?: number, stock?: number): { drill: Piece; bore: Piece } {
  const holes = rows.filter(r => r.kind === 'hole');
  const grouped = new Map<Row, Set<number>>(holes.map(r => [r, new Set<number>()]));
  const lines = new Map<string, Array<{ r: Row; s0: number; s1: number; k: number }>>();
  for (const r of holes) {
    if (!r.axes || r.axes.length !== r.count) continue;
    r.axes.forEach((a, k) => (lines.get(a.line) ?? lines.set(a.line, []).get(a.line)!).push({ r, s0: Math.min(a.s0, a.s1), s1: Math.max(a.s0, a.s1), k }));
  }
  const drill: Piece = { cut: 0, fi: 0, visits: [] }, bore: Piece = { cut: 0, fi: 0, visits: [] };
  const add = (into: Piece, p: Piece, pos: P3 | null) => { into.cut += p.cut; into.fi += p.fi; into.visits.push(...p.visits.map(v => ({ ...v, pos }))); };
  const stepped = (run: Array<{ r: Row; s0: number; s1: number; k: number }>) => {
    if (run.length < 2 || new Set(run.map(h => h.r.diaMm)).size < 2) return;
    for (const h of run) grouped.get(h.r)!.add(h.k);
    const isBored = cored !== undefined && run.some(h => h.r.diaMm > cored);
    const pos = mid({ line: (run[0].r.axes![run[0].k]).line, s0: run[0].s0, s1: run[run.length - 1].s1 });
    for (const { r } of run) add(isBored ? bore : drill, holePiece(r, fam, cored, stock, true), pos);
  };
  for (const list of lines.values()) {
    list.sort((a, b) => a.s0 - b.s0 || a.s1 - b.s1);
    let run: typeof list = []; let end = -Infinity;
    for (const h of list) {
      const prev = run[run.length - 1];
      if (prev && h.s0 <= end + Math.abs(h.r.diaMm - prev.r.diaMm) / 2 + 0.1) { run.push(h); end = Math.max(end, h.s1); }
      else { stepped(run); run = [h]; end = h.s1; }
    }
    stepped(run);
  }
  for (const r of holes) {
    const g = grouped.get(r)!;
    const ks = Array.from({ length: r.count }, (_, k) => k).filter(k => !g.has(k));
    const into = cored !== undefined && r.diaMm > cored ? bore : drill;
    const p = holePiece(r, fam, cored, stock);
    const withAxes = !!r.axes && r.axes.length === r.count;
    for (const k of ks) add(into, p, withAxes ? mid(r.axes![k]) : null);
  }
  return { drill, bore };
}
/** A group's time: cutting + own non-cutting + 2.2 s a distinct tool + probes × 12 s; its rapid mm (machine-free). */
function groupOf(p: Piece, env: number[], extraTools = 0, probes = 0): { min: number; cut: number; rapid: number; tools: number } {
  const by = new Map<string, V[]>();
  for (const v of p.visits) by.set(v.tool, [...(by.get(v.tool) ?? []), v]);
  const tools = by.size + extraTools;
  const area = [...env].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a * b, 1);
  let trav = 0;
  for (const vs of by.values()) {
    if (vs.every(v => v.pos)) {
      const left = vs.map(v => v.pos!).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      let cur = left.shift()!;
      while (left.length) {
        let bi = 0, bd = Infinity;
        left.forEach((q, i) => { const dd = Math.hypot(cur[0] - q[0], cur[1] - q[1], cur[2] - q[2]); if (dd < bd - 1e-9) { bd = dd; bi = i; } });
        trav += bd; cur = left.splice(bi, 1)[0];
      }
    } else if (vs.length > 1 && env.length >= 2) trav += (vs.length - 1) * Math.sqrt(area / vs.length);
  }
  const rapid = p.visits.length * 2 * CLEAR_PLANE + trav + p.visits.reduce((x, v) => x + v.out, 0);
  return { min: p.cut + p.fi + tools * TOOL_CHANGE_S / 60 + probes * PROBE_S / 60, cut: p.cut, rapid, tools };
}
/** Metal inside the drilled / bored holes, cm³ — cut by the hole time, so not roughed again (finding M1). */
const holeVolCm3 = (rows: Row[]) => PRE ? 0 : rows.filter(r => r.kind === 'hole' && !isLand(r))
  .reduce((s, r) => s + Math.PI * r.diaMm * r.diaMm / 4 * Math.max(r.depthMm, 0) * r.count, 0) / 1000;
const holeWallCm2 = (rows: Row[]) => rows.filter(r => r.kind === 'hole')
  .reduce((s, r) => s + Math.PI * r.diaMm * Math.max(r.depthMm, 0) * r.count, 0) / 100;

function cheapest(cap: string, bb: number[]): { id: string; rate: number } {
  const m = CATALOGUE.filter(c => c.cap === cap && bb.every((d, i) => d <= c.env[i]))
    .map(c => ({ id: c.id, rate: machineRate(c.id) })).sort((a, b) => a.rate - b.rate);
  return m[0];
}

interface Op { name: string; machineId: string; ct: number; manning: number; oee: number; labourId: string; bench?: boolean; cut?: number }

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
  if (!existsSync(join(DUMP, `${part}.json`))) { console.log(`  ${part}: no dump — skipped`); return; }
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
  const roughIn = removed / millQ(family), roughMin = roughIn * (1 + AIR), finishMin = wall / sideRate(family), surfMin = free / (FIN.surf / cd.tf);
  // PKG-2: the milling tools (roughing, finishing, chamfer, + a ball nose when surfaced) one visit each; holes their pieces
  const millTools = ['roughing cutter', 'finishing cutter', 'chamfer cutter', ...(free > 0.5 ? ['ball nose'] : [])];
  const env = sorted;
  const millG = groupOf({ cut: roughIn + finishMin + surfMin, fi: roughMin - roughIn + millTools.length * R_PLANE / sideVf(family),
    visits: millTools.map(tool => ({ tool, fi: R_PLANE / sideVf(family), out: 0, pos: null })) }, env);
  const hw = holeWork(rows, family);
  const holeP: Piece = { cut: hw.drill.cut + hw.bore.cut, fi: hw.drill.fi + hw.bore.fi, visits: [...hw.drill.visits, ...hw.bore.visits] };
  const holeG = groupOf(holeP, env);
  const holesMin = holeG.min;
  const tools = millG.tools + holeG.tools;
  // machining-time.ts: totalMin = r2(all); the mill content is totalMin − r2(holes)
  const millMinExact = r2(millG.min + holeG.min) - r2(holesMin);
  const holeMinR = r2(holesMin);
  const handledKg = stockCm3 * rho, hMin = handlingMin(handledKg);

  // Turned
  let lathe: { total: number; cut: number; rapid: number } | null = null;
  let sec: { mill: number; hole: number; total: number; cut: number; rapid: number } | null = null;
  if (turned) {
    const removedT = Math.max(0, stockCm3 - vol - holeVolCm3(rows));
    const turnedCm2 = area * turned.fraction;
    const qIn = CAT[family].tRough[0] * CAT[family].tRough[1] * TURN_AP;
    const roughIn2 = removedT / qIn, rough = removedT / turnQ(family), fin = turnedCm2 / turnFin(family);
    const lfi = R_PLANE / (n(CAT[family].tRough[0], turned.dia) * CAT[family].tRough[1]);
    const lg = groupOf({ cut: roughIn2 + fin, fi: rough - roughIn2 + 3 * lfi,
      visits: ['turning rough', 'turning finish', 'groove / part-off'].map(tool => ({ tool, fi: lfi, out: 0, pos: null })) }, env);
    lathe = { total: r2(lg.min), cut: lg.cut, rapid: Math.round(lg.rapid) };
    const other = Math.max(0, area - turnedCm2 - holeWallCm2(rows));
    const mf = other / sideRate(family);
    const mg = other > 0.5 ? groupOf({ cut: mf, fi: R_PLANE / sideVf(family), visits: [{ tool: 'end mill', fi: R_PLANE / sideVf(family), out: 0, pos: null }] }, env)
      : { min: mf, cut: mf, rapid: 0, tools: 0 };
    sec = { mill: mg.min, hole: holeG.min, total: r2(mg.min + holeG.min), cut: mg.cut + holeG.cut, rapid: Math.round(mg.rapid + holeG.rapid) };
  }

  // Routing (machine + operator, ranked)
  const dirs = Math.max(1, geo.setupAnalysis?.estimatedSetupCount ?? 1);
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  const lab = labourRate('lab-uk-skilled');
  const setupHr = SETUP_MIN / 60, hHr = hMin / 60;
  const labourOf = (cutHr: number, handHr: number) => Math.round(lab * (cutHr * CUT_MANNING + handHr) * 10_000) / 10_000;
  const cands: Array<{ label: string; primary: string; drill: string; setups: number; machine: number; labour: number; masked?: boolean; indexes?: number }> = [];
  const drillM = cheapest('drill', sorted);
  if (turned && lathe && sec) {
    const L = cheapest('turn', sorted);
    const secRaw = sec.mill / 60 + sec.hole / 60;
    const second = sec.mill > 0 ? cheapest('mill3', sorted) : drillM;
    const secHr = secRaw > 0 ? secRaw + rapidMin(sec.rapid, second.id) / 60 : 0;
    const latheHr = lathe.total / 60 + rapidMin(lathe.rapid, L.id) / 60;
    const setups = 2 + (secHr > 0 ? 1 : 0);
    const cost = latheHr * L.rate + secHr * second.rate + setups * setupHr * L.rate / batch + setups * hHr * L.rate;
    cands.push({ label: 'turned', primary: L.id, drill: secHr > 0 ? second.id : L.id, setups, machine: cost, labour: labourOf(latheHr + secHr, setups * hHr) });
  }
  const push = (label: string, prim: { id: string; rate: number }, drill: { id: string; rate: number } | null, setups: number, masked = false, indexes = 0) => {
    const dr = holeMinR > 0 ? (drill ?? prim) : null;
    const millHr = millMinExact > 0 ? millMinExact / 60 + rapidMin(millG.rapid, prim.id) / 60 + indexes * INDEX_S / 3600 : 0;
    const drillHr = holeMinR > 0 ? holeMinR / 60 + rapidMin(holeG.rapid, (dr ?? prim).id) / 60 : 0;
    const cost = millHr * prim.rate + drillHr * (dr?.rate ?? 0) + setups * setupHr * prim.rate / batch
      + (masked ? setups * PALLET_S / 3600 * prim.rate : setups * hHr * prim.rate);
    // lead's merge (M4): on the masked cell the load is inside the operator's share of the cut
    cands.push({ label, primary: prim.id, drill: dr?.id ?? prim.id, setups, machine: cost, labour: labourOf(millHr + drillHr, masked ? Math.max(0, setups * hHr - (millHr + drillHr) * CUT_MANNING) : setups * hHr), ...(masked ? { masked } : {}), indexes });
  };
  const millFix = Math.max(2, dirs);
  push('split-3axis', cheapest('mill3', sorted), drillM, millFix + (holeMinR > 0 ? 1 : 0));
  const five = dirs > 1 ? 2 : 1;
  push('consolidated-5axis', cheapest('mill5', sorted), null, five, false, Math.max(0, dirs - five));
  const clamps = dirs <= 4 ? 1 : 2;
  if (!turned) push('volume-cell', cheapest('hmc', sorted), null, clamps + (dirs > 1 ? 1 : 0), true, Math.max(0, dirs - clamps));
  cands.sort((a, b) => (a.machine + a.labour) - (b.machine + b.labour));
  const ch = cands[0];
  for (const c of cands) {
    const m = new RegExp(`${c.label} £([0-9.]+) \\(machine £([0-9.]+) \\+ operator £([0-9.]+)`).exec(prov['mach-setup-mach'].basis);
    check(part, `routing ${c.label}: machine + operator £/part (basis)`, r2(c.machine + c.labour), m ? Number(m[1]) : NaN, 0.0051);
  }
  check(part, 'routing chosen', ch.label, /→ ([a-z0-9-]+)/.exec(prov['mach-setup-mach'].basis)?.[1]);
  check(part, 'machine (primary)', ch.primary, prov['mach-setup-mach'].value);

  // Operations — each op's time at ITS machine's rapid; the cutting minutes carried for the tool wear (PKG-2)
  const ops: Op[] = [];
  const M = { labourId: 'lab-uk-skilled', manning: CUT_MANNING, oee: OEE };
  if (ch.label === 'turned' && lathe && sec) {
    ops.push({ ...M, name: 'Turning — op 10 / op 20 from bar', machineId: ch.primary, ct: hr4(lathe.total + rapidMin(lathe.rapid, ch.primary)), cut: lathe.cut });
    if (sec.total > 0) ops.push({ ...M, name: 'Mill / drill after turning', machineId: ch.drill, ct: hr4(sec.total + rapidMin(sec.rapid, ch.drill)), cut: sec.cut });
  } else {
    const dirsList = geo.setupAnalysis.principalDirections as Array<{ directionLabel: string; faceCount: number }>;
    const tot = dirsList.reduce((s, d) => s + d.faceCount, 0);
    const millTotal = millMinExact + rapidMin(millG.rapid, ch.primary) + (millMinExact > 0 ? (ch.indexes ?? 0) * INDEX_S / 60 : 0);
    for (const d of dirsList) ops.push({ ...M, name: `Milling — ${d.directionLabel} (${d.faceCount} faces)`, machineId: ch.primary, ct: hr4(millTotal * d.faceCount / tot), cut: millG.cut * d.faceCount / tot });
    if (holeMinR > 0) ops.push({ ...M, name: 'Drilling', machineId: ch.drill, ct: hr4(holeMinR + rapidMin(holeG.rapid, ch.drill)), cut: holeG.cut });
  }
  if (ch.masked) {
    ops.push({ ...M, name: 'Pallet change', machineId: ch.primary, ct: hr4(ch.setups * PALLET_S / 60) });
    // Lead's merge (M4): the load happens during the cut — only what the operator's 0.5 share of the spindle time cannot cover.
    const spinMin = ops.filter(o => !o.bench && !/^Load \/ clamp|^Pallet change/.test(o.name)).reduce((s, o) => s + o.ct * 60, 0);
    const extra = Math.max(0, ch.setups * hMin - 0.5 * spinMin);
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
  void tools;
  const prog = Math.round(progHr * labourRate('lab-uk-engineer'));
  check(part, 'programming £ = h × engineer', prog, P.programmingNRE, 0.5);
  // PKG-2 (CF-20): wear on the CUTTING minutes only — not the tool changes, rapids, feed-in, indexes or handling
  const cutMin = ops.reduce((s, o) => s + (o.cut ?? 0), 0);
  const wear = Math.round(cutMin * cd.wear * 10_000) / 10_000;
  check(part, 'tool wear £ = CUTTING min × £/min', wear, P.toolWearCostPerPart);
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
  if (!existsSync(join(DUMP, `${part}.json`))) { console.log(`  ${part}: no dump — skipped`); return; }
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
  const sortedBb = [geo.boundingBox.xMm, geo.boundingBox.yMm, geo.boundingBox.zMm].sort((a: number, b: number) => b - a);
  // PKG-2 (CF-06): the faces and cored / pierced bores are opened from the route's own stock — a casting's ISO 8062-3
  // typical by process (sand ferrous 3, sand 2, gravity 1.5, investment 1, HPDC 0.5 mm), an impression forging's IS 3469
  // Table 1.5 by its greatest dimension, an open-die forging's 5 mm
  const IS3469: Array<[number, number]> = [[205, 1.5], [410, 2.5], [610, 3.0], [915, 4.0], [Infinity, 5.0]];
  const faceStock = subtype === 'forging'
    ? (cored === Infinity ? 5.0 : IS3469.find(([u]) => sortedBb[0] <= u)![1])
    : (subtype === 'sand' && (family === 'steel' || family === 'cast iron') ? CAST_STOCK_MM.sand_ferrous : CAST_STOCK_MM[subtype] ?? 1.5);
  // the face rows (a turned part's faces are on the lathe), the hole work split drilled / bored, each a group with its tool
  // changes; the chamfer tool and the one datum probe ride the first group with work (milling → boring → drilling); a turned
  // part is chucked on its turned faces — no probe
  const fp: Piece = { cut: 0, fi: 0, visits: [] };
  if (!tp) for (const r of faces) { const q = facePiece(family, r.areaMm2 ?? 0, faceStock); for (let k = 0; k < r.count; k++) { fp.cut += q.cut; fp.fi += q.fi; fp.visits.push(...q.visits); } }
  const hw = holeWork(rows, family, cored, faceStock);
  const first = fp.visits.length ? 'mill' : hw.bore.visits.length ? 'bore' : hw.drill.visits.length ? 'hole' : '';
  const probes = tp ? 0 : 1;
  const g = (k: string, pc: Piece) => groupOf(pc, sortedBb, first === k ? 1 : 0, first === k ? probes : 0);
  const millG = g('mill', fp), boreG = g('bore', hw.bore), drillG = g('hole', hw.drill);
  const millMin = r2(millG.min), boreMin = r2(boreG.min), drillMin = r2(drillG.min);
  // the kernel's narrow slits: one saw, one approach a slit (a visit each), one tool change (the walls are not in the face rows)
  const slits = (geo.slits ?? []) as Array<{ widthMm: number; depthMm: number; lengthMm: number | null; rootFaceIds: number[]; wallFaceIds: number[] }>;
  const slitGroups = new Set(slits.map(x => `${x.widthMm}|${x.depthMm}|${x.lengthMm}`)).size;
  const slitG = slits.length ? groupOf({ cut: slits.reduce((t2, x) => t2 + slitMin(family, x), 0), fi: 0,
    visits: slits.map(() => ({ tool: 'slitting saw', fi: 0, out: 0, pos: null })) }, sortedBb) : null;
  const slitTotal = slitG ? r2(slitG.min) : 0;
  const ext = (geo.turning?.externalAreaMm2 ?? 0) / 100;
  const facedCm2 = faces.reduce((s, r) => s + (r.areaMm2 ?? 0) * r.count, 0) / 100;
  const spindleCm2 = tp ? tp.ext + facedCm2 : ext >= 20 && ext / geo.surfaceArea.cm2 >= 0.08 ? ext : 0;
  const stockMm = turnStock ?? (subtype === 'sand' && (family === 'steel' || family === 'cast iron') ? CAST_STOCK_MM.sand_ferrous : CAST_STOCK_MM[subtype] ?? 1.5);
  // the lathe: rough in-cut (vc × fn × 3 mm) + finish cut; the air share, 3 tools' feed-in at the rough feed at Ø, 3 changes
  const qIn = CAT[family].tRough[0] * CAT[family].tRough[1] * TURN_AP;
  const spDia = (geo.turning?.externalMaxDiaMm ?? geo.turning?.maxDiaMm ?? 0) || 50;
  const lfi = R_PLANE / (n(CAT[family].tRough[0], spDia) * CAT[family].tRough[1]);
  const spStock = spindleCm2 * stockMm / 10;
  const spG = groupOf({ cut: spStock / qIn + spindleCm2 / turnFin(family), fi: spStock / turnQ(family) - spStock / qIn + 3 * lfi,
    visits: ['turning rough', 'turning finish', 'groove / part-off'].map(tool => ({ tool, fi: lfi, out: 0, pos: null })) }, []);
  const spindleMin = r2(spG.min), spindleRapid = Math.round(spG.rapid);
  const hMin = handlingMin(geo.volume.cm3 * DENSITY[family]);
  const dirsList = geo.setupAnalysis.principalDirections as Array<{ directionLabel: string; faceCount: number }>;
  const tot = dirsList.reduce((s, d) => s + d.faceCount, 0);
  // Routing, cost-ranked like the from-solid part (machine + operator), on the near-net conventions: held on its cast
  // datums, so the split needs one fixturing a direction (not ≥ 2) and the 5-axis one clamping; the cored bores are
  // milled-centre time. A turned part is one direction and never the HMC cell. Each candidate prices the rapids at its own
  // machine and the HMC / 5-axis its indexes between sides (PKG-2).
  const dirs = tp ? 1 : Math.max(1, geo.setupAnalysis?.estimatedSetupCount ?? 1);
  const batch = Math.round(Math.min(5000, Math.max(50, ANNUAL / 20)));
  const millRaw = millMin + boreMin + slitTotal, millRapid = millG.rapid + boreG.rapid + (slitG?.rapid ?? 0);
  const setupHr = SETUP_MIN / 60, hHr = hMin / 60;
  const lab = labourRate('lab-uk-skilled');
  const labourOf = (cutHr: number, handHr: number) => Math.round(lab * (cutHr * CUT_MANNING + handHr) * 10_000) / 10_000;
  const cands: Array<{ label: string; primary: string; drill: string; setups: number; total: number; masked: boolean; indexes: number }> = [];
  const push = (label: string, prim: { id: string; rate: number }, drill: { id: string; rate: number } | null, setups: number, masked = false, indexes = 0) => {
    const dr = drillMin > 0 ? (drill ?? prim) : null;
    const millHr = millRaw > 0 ? millRaw / 60 + rapidMin(millRapid, prim.id) / 60 + indexes * INDEX_S / 3600 : 0;
    const drillHr = drillMin > 0 ? drillMin / 60 + rapidMin(drillG.rapid, (dr ?? prim).id) / 60 : 0;
    const machine = millHr * prim.rate + drillHr * (dr?.rate ?? 0) + setups * setupHr * prim.rate / batch
      + (masked ? setups * PALLET_S / 3600 * prim.rate : setups * hHr * prim.rate);
    const labour = labourOf(millHr + drillHr, masked ? Math.max(0, setups * hHr - (millHr + drillHr) * CUT_MANNING) : setups * hHr);
    cands.push({ label, primary: prim.id, drill: dr?.id ?? prim.id, setups, total: machine + labour, masked, indexes });
  };
  push('split-3axis', cheapest('mill3', sortedBb), cheapest('drill', sortedBb), dirs + (drillMin > 0 ? 1 : 0));
  push('consolidated-5axis', cheapest('mill5', sortedBb), null, 1, false, Math.max(0, dirs - 1));
  const clamps = dirs <= 4 ? 1 : 2;
  if (ANNUAL >= 25_000 && !tp) push('volume-cell', cheapest('hmc', sortedBb), null, clamps, true, Math.max(0, dirs - clamps));
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
  // [name, hr, machine, crew, cutting min] — each op at its machine's rapid (+ the indexes on the milling), PKG-2
  const expected: Array<[string, number, string, number, number]> = [];
  const millTotal = millMin + rapidMin(millG.rapid, ch.primary) + (millMin > 0 ? ch.indexes * INDEX_S / 60 : 0);
  if (millMin > 0) for (const d of dirsList) expected.push([`Finish machining — ${d.directionLabel} side`, hr4(millTotal * d.faceCount / tot), ch.primary, 0.5, millG.cut * d.faceCount / tot]);
  if (drillMin > 0) expected.push(['Drilling', hr4(drillMin + rapidMin(drillG.rapid, ch.drill)), ch.drill, 0.5, drillG.cut]);
  if (boreMin > 0) expected.push(['Finish boring', hr4(boreMin + rapidMin(boreG.rapid, ch.primary)), ch.primary, 0.5, boreG.cut]);
  if (slitTotal > 0) expected.push(['Slitting', hr4(slitTotal + rapidMin(slitG!.rapid, ch.primary)), ch.primary, 0.5, slitG!.cut]);
  // The lathe op is the cut; loading the part into the lathe fixture is a whole operator's (finding M3).
  if (!spindleCm2) { /* no turned axis (a bracket): no lathe op */ }
  else if (PRE) expected.push(['Turning — spindle (+ load, pre-fix)', hr4(spindleMin + hMin), 'mach-lathe-cnc', 0.5, spG.cut]);
  else {
    expected.push([tp ? 'Turning — outside and faces' : 'Turning — spindle', hr4(spindleMin + rapidMin(spindleRapid, 'mach-lathe-cnc')), 'mach-lathe-cnc', 0.5, spG.cut]);
    expected.push(['Load / clamp / unload — lathe', hr4(hMin), 'mach-lathe-cnc', 1, 0]);
  }
  if (ch.masked) {
    expected.push(['Pallet change', hr4(ch.setups * PALLET_S / 60), ch.primary, 0.5, 0]);
    // Lead's merge (M4): only the load the operator's 0.5 share of the spindle time does not cover.
    const spinMin = expected.filter(e => !/^Load \/ clamp|^Pallet change|^Deburr/.test(String(e[0]))).reduce((s, e) => s + Number(e[1]) * 60, 0);
    const extra = Math.max(0, ch.setups * hMin - 0.5 * spinMin);
    if (extra > 0) expected.push(['Load / unload on the pallet', hr4(extra), ch.primary, 1, 0]);
  } else {
    expected.push(['Load / clamp / unload', hr4(ch.setups * hMin), ch.primary, 1, 0]);
  }
  // The deburr counts the MACHINED faces: the costed rows' B-rep faces, once each (a row without ids, one an instance).
  const ids = new Set<number>(); let unnamed = 0;
  for (const r of rows as Array<Row & { faceIds?: number[] }>) { if (r.faceIds?.length) r.faceIds.forEach(x => ids.add(x)); else unnamed += Math.max(1, r.count); }
  const machinedFaces = ids.size + unnamed + new Set(slits.flatMap(x => [...x.rootFaceIds, ...x.wallFaceIds])).size;
  expected.push(['Deburr', hr4(Math.round((1 + 0.004 * machinedFaces) * 100) / 100), ch.primary, 1, 0]);
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
  // PKG-2 (CF-20): wear on the CUTTING minutes only — not the tool changes, rapids, feed-in, probing, indexes or handling
  const cutMin = expected.reduce((s, e) => s + e[4], 0);
  const wear = Math.round(cutMin * cd.wear * 10_000) / 10_000;
  check(part, 'tool wear £ = CUTTING min × £/min', wear, mode === 'cam' ? P.machiningToolWearCostPerPart : P.secondaryMachiningConsumablesPerPart);
  // the cell's fixture(s) — a hydraulic tombstone fixture on the HMC, dedicated fixtures on a split / 5-axis routing — and
  // the lathe's own dedicated fixture, each a toolroom build (× the book's toolroom factor, rounded per fixture set)
  // one fixture set a machine the capacity implies (the mill on its plan ops + change-over; the lathe on its own ops)
  const planOps = expected.map(([name, hr, mach]) => ({ hr, oee: OEE, machineId: mach, bench: /^Deburr|^Load \/ unload on the pallet/.test(name) }));
  const millSets = fixtureSets(planOps, ch.primary, ch.setups, batch);
  const latheSets = lathe ? fixtureSets(planOps, 'mach-lathe-cnc', 1, batch) : 0;
  const millFx = fixtureGBP(ch.setups * millSets * (ch.masked ? FIXTURE.hydraulic : ANNUAL * 5 > 10_000 ? FIXTURE.dedicated : FIXTURE.modular));
  const latheFx = lathe ? fixtureGBP(latheSets * (ANNUAL * 5 > 10_000 ? FIXTURE.dedicated : FIXTURE.modular)) : 0;
  // programming: the MACHINED feature rows (a cast-in pocket or boss is not programmed)
  const prog = Math.round(Math.round((PROG.perFix * setups + PROG.perRow * (rows.length + slitGroups)) * 100) / 100 * labourRate('lab-uk-engineer'));
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
// Part1: from solid on the baseline's answer; cast + machine (gravity die) when the dump costs it so — the Part1 review's
// route, with its two narrow slits sawn (phase 3, Nov 2026).
if (existsSync(join(DUMP, 'Part1.json')) && JSON.parse(readFileSync(join(DUMP, 'Part1.json'), 'utf8')).commodity === 'cast_and_machine') nearNet('Part1.stp', 'aluminium', 'gravity', 'cam');
else fromSolid('Part1.stp', 'aluminium', 'mat-al6082-bar');
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

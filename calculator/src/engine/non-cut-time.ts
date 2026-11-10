/**
 * Non-cutting time per machining OPERATION (correction package PKG-2, CF-19 / CF-20 — 10 Nov 2026).
 *
 * The machining time used to carry a fixed allowance PER FEATURE for positioning, approach and retract (0.06–0.5 min a
 * feature, "engineering-typical, not sourced" — 28–76 % of the machining minutes on the five audit parts), and tool wear
 * was charged on it. It is replaced by non-cutting time built per operation from what moves:
 *
 * | Element | How | Class |
 * |---|---|---|
 * | Tool changes | distinct tools × `TOOL_CHANGE_SEC` chip-to-chip (the move to and from the change position is inside the ISO 10791-9 figure) | sourced (Okuma / DMG MORI) |
 * | Traverse | the path between the features a tool visits, at the machine's rapid: measured from the kernel's hole positions (nearest-neighbour order), else estimated from the envelope | rapid sourced per machine; an envelope path is an estimate |
 * | Approach / retract | each visit rapids down to and back from the R-plane (2 × `CLEARANCE_PLANE_MM`) and out of the cut, and feeds the last `R_PLANE_MM` in at the feature's own feed | distances engineering-typical, not sourced |
 * | Probing | one datum-setting cycle where a datum is set (a near-net part located on its cast / forged datums) | engineering estimate, not sourced |
 * | Index | between the sides of one clamping on the HMC / 5-axis (`INDEX_SEC`) | sourced (Okuma MA-4000H) |
 * | Pallet change / load / unload | as before (routing-optimiser.ts, machining-time.ts) | as before |
 *
 * Machine acceleration is NOT modelled (only the MA-4000H's 1 G was read): every move runs at the rapid rate, so a short
 * move is understated. Tool wear is charged on CUTTING minutes only (CF-20). Every constant prints its value and class.
 */
import { activeRates } from './rate-context.js';

/** A machine's rapid traverse rate and where it was read. */
export interface MachineRapid { mPerMin: number; source: string }

const HAAS_VF2 = 'Haas VF-2 product page, rapids X / Y / Z 1,000 ipm (25.4 m/min) — haascnc.com (read 10 Nov 2026 through the search index; the page refuses a direct fetch)';
const HAAS_UMC500 = 'Haas UMC-500 product page, rapids X / Y / Z 900 ipm (22.9 m/min) — haascnc.com (read 10 Nov 2026 through the search index)';
const MAZAK_QT = 'Mazak QUICK TURN 250MY page, rapid X 30 / Z 33 m/min — mazakeu.co.uk (read 10 Nov 2026 through the search index; the QUICK TURN 200 page '
  + 'on mazak.com prints no rapid, so the series sibling is used and the slower X axis taken)';

/**
 * Rapid traverse by library machine, m/min — the maker's published figure for the machine (or the machine the rate book
 * prices it on). The slowest linear axis is taken where the page gives several.
 *
 * URLs: Okuma https://d30jruhmdicmo0.cloudfront.net/documents/MA-4000H-Jul-2025.pdf (data.json #65, read 3 Nov 2026);
 * Haas VF-2 https://www.haascnc.com/machines/vertical-mills/vf-series/models/small/vf-2.html;
 * Haas UMC-500 https://www.haascnc.com/machines/vertical-mills/universal-machine/models/umc-500.html;
 * DMG MORI DMU 50 https://us.dmgmori.com/products/machines/milling/5-axis-milling/dmu/dmu-50;
 * Mazak QUICK TURN 250MY https://www.mazakeu.co.uk/machines/quick-turn-250my/ (QUICK TURN 200:
 * https://www.mazak.com/us-en/detail/usa/turning/us-qt2002eky/ — no rapid printed).
 */
export const MACHINE_RAPID: Readonly<Record<string, MachineRapid>> = {
  'mach-hmc-400': { mPerMin: 60, source: 'Okuma MA-4000H rapid traverse 60 m/min X-Y-Z — Okuma MA-4000H brochure (Jul 2025)' },
  'mach-haas-vf2': { mPerMin: 25.4, source: HAAS_VF2 },
  'mach-vmc3': { mPerMin: 25.4, source: `${HAAS_VF2}; the rate book prices this VMC on the Haas VF-2` },
  'mach-drill': { mPerMin: 25.4, source: `${HAAS_VF2}; the rate book prices this drilling centre on the Haas VF-2 (no drilling-centre rapid read)` },
  'mach-haas-umc500': { mPerMin: 22.9, source: HAAS_UMC500 },
  'mach-vmc5': { mPerMin: 22.9, source: `${HAAS_UMC500}; the rate book prices this 5-axis on the Haas UMC-500` },
  'mach-dmg-dmu50': { mPerMin: 42, source: 'DMG MORI DMU 50 3rd Generation, rapid X / Y / Z 42 m/min — dmgmori.com product page (read 10 Nov 2026 through the search index)' },
  'mach-lathe-cnc': { mPerMin: 30, source: `${MAZAK_QT}; the rate book prices this lathe on a Yamazaki Mazak UK award` },
  'mach-mazak-qt200': { mPerMin: 30, source: MAZAK_QT },
};
/** A machine with no rapid read takes the slowest sourced one — the conservative side — and says so. */
export const FALLBACK_RAPID_M_PER_MIN = Math.min(...Object.values(MACHINE_RAPID).map(r => r.mPerMin));

export function machineRapid(machineId: string | null | undefined): MachineRapid & { known: boolean } {
  const r = machineId ? MACHINE_RAPID[machineId] : undefined;
  if (r) return { ...r, known: true };
  const name = machineId ? (activeRates().machines.find(m => m.id === machineId)?.machineClass ?? 'this machine') : 'this machine';
  return { mPerMin: FALLBACK_RAPID_M_PER_MIN, known: false,
    source: `no rapid read for ${name} — the slowest sourced machine rapid (${FALLBACK_RAPID_M_PER_MIN} m/min) used` };
}

/**
 * Chip-to-chip tool change, seconds: Okuma MA-4000H 2.15 s (ISO 10791-9, tool ≤ 4 kg; data.json #63), DMG MORI NHX 4000
 * 2.2 s (#69), Okuma MB-5000HII 2.1 s (#67); GROB G350 2.7 s to VDI 2852 (#68). No VMC or lathe figure was read — the
 * HMC figure is used for every machine and says so. (Re-exported by machining-time.ts, where it was defined.)
 */
export const TOOL_CHANGE_SEC = 2.2;

// ── Labelled distances and times ────────────────────────────────────────────────────────────────────────────────────
/** The plane a tool rapids to and from above each feature it visits, mm above the surface — engineering-typical, not sourced. */
export const CLEARANCE_PLANE_MM = 25;
/** The R-plane clearance fed in at the feature's own feed before the cut starts, mm — engineering-typical, not sourced. */
export const R_PLANE_MM = 2;
/**
 * One datum-setting probe cycle (X, Y and Z touches) where a datum is set, seconds — ENGINEERING ESTIMATE, not sourced:
 * Renishaw publishes no per-cycle datum-setting time (its case studies give whole inspection routines), and no maker
 * figure was found. Charged once on a near-net part: the first clamping sets the machined datum from the cast / forged
 * datum targets; later clampings locate on machined faces.
 */
export const PROBE_DATUM_SEC = 12;
/** B-axis index, seconds per 90° — Okuma MA-4000H "Table indexing time 0.8 sec / 90°" (brochure Jul 2025, data.json #66). */
export const INDEX_SEC = 0.8;
export const INDEX_SOURCE = 'Okuma MA-4000H table indexing 0.8 s / 90° — Okuma MA-4000H brochure (Jul 2025)';
/** The envelope path estimate when the kernel gives no feature positions: each move ≈ the side of the area a feature
 *  occupies, √(A ÷ n) — ENGINEERING ESTIMATE, not sourced. */
export const ESTIMATE_TEXT = 'estimated from the envelope: (n − 1) moves × √(plan area ÷ n) — engineering estimate, not sourced';

export const NON_CUT_STATUS = `non-cutting time per operation: tool changes (sourced chip-to-chip), traverse between features at the machine's sourced rapid, `
  + `approach / retract ${CLEARANCE_PLANE_MM} mm rapid plane + ${R_PLANE_MM} mm fed in (engineering-typical, not sourced), `
  + `datum probing ${PROBE_DATUM_SEC} s (engineering estimate, not sourced), acceleration not modelled`;

// ── Visits ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One tool visiting one feature instance. */
export interface Visit {
  /** The tool — visits with the same key share one tool (one tool change). */
  tool: string;
  /** Non-cutting minutes at feed that need no machine: the R-plane fed in (and out, for a tap), air moves in a toolpath. */
  feedInMin: number;
  /** Rapid inside the visit beyond the approach / retract: out of a hole, back for another pass, mm. */
  rapidMm?: number;
  /** The feature's centre (the kernel's hole axis mid-point), mm — absent when the kernel gives none. */
  pos?: readonly [number, number, number] | null;
}

/** The non-cutting work of a group of visits, before a machine is chosen: what is per machine is `rapidMm`. */
export interface NonCutPlan {
  tools: number;
  approaches: number;
  probes: number;
  /** Minutes that do not depend on the machine: tool changes + feed-in + probing. */
  fixedMin: number;
  toolChangeMin: number;
  feedInMin: number;
  probeMin: number;
  /** Rapid travel, mm: approach / retract + traverse + in-visit rapid. */
  rapidMm: number;
  traverseMm: number;
  /** Visits whose traverse came from measured positions / from the envelope estimate. */
  measured: number;
  estimated: number;
  text: string;
}

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A nearest-neighbour path through points, starting from the lowest (x, y, z) — deterministic. */
export function nearestNeighbourPathMm(points: ReadonlyArray<readonly [number, number, number]>): number {
  if (points.length < 2) return 0;
  const left = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  let cur = left.shift()!;
  let total = 0;
  while (left.length) {
    let bi = 0; let bd = Infinity;
    left.forEach((p, i) => { const d = dist(cur, p); if (d < bd - 1e-9) { bd = d; bi = i; } });
    total += bd;
    cur = left.splice(bi, 1)[0];
  }
  return total;
}

/** The plan area the envelope estimate spreads features over: the two largest envelope dimensions, mm². */
export function planAreaMm2(envelopeMm: readonly number[] | null | undefined): number {
  if (!envelopeMm || envelopeMm.length < 2) return 0;
  const d = [...envelopeMm].sort((a, b) => b - a);
  return d[0] * d[1];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The non-cutting work of a set of visits: one tool change per distinct tool (+ `extraTools`, e.g. a chamfer tool that
 * visits no measured feature), 2 × `CLEARANCE_PLANE_MM` of rapid per visit plus its in-visit rapid, the traverse between
 * the visits of each tool (measured where every visit of the tool has a position, else the envelope estimate), the
 * feed-in minutes, and `probes` datum cycles.
 */
export function planNonCut(visits: readonly Visit[], envelopeMm: readonly number[] | null | undefined,
  opts: { extraTools?: number; probes?: number } = {}): NonCutPlan {
  const byTool = new Map<string, Visit[]>();
  for (const v of visits) byTool.set(v.tool, [...(byTool.get(v.tool) ?? []), v]);
  const tools = byTool.size + (opts.extraTools ?? 0);
  const approaches = visits.length;
  const area = planAreaMm2(envelopeMm);
  let traverseMm = 0; let measured = 0; let estimated = 0;
  for (const vs of byTool.values()) {
    if (vs.every(v => v.pos)) { traverseMm += nearestNeighbourPathMm(vs.map(v => v.pos!)); measured += vs.length; }
    else { traverseMm += vs.length > 1 && area > 0 ? (vs.length - 1) * Math.sqrt(area / vs.length) : 0; estimated += vs.length; }
  }
  const inVisit = visits.reduce((s, v) => s + (v.rapidMm ?? 0), 0);
  const rapidMm = approaches * 2 * CLEARANCE_PLANE_MM + traverseMm + inVisit;
  const feedInMin = visits.reduce((s, v) => s + v.feedInMin, 0);
  const probes = opts.probes ?? 0;
  const toolChangeMin = tools * TOOL_CHANGE_SEC / 60;
  const probeMin = probes * PROBE_DATUM_SEC / 60;
  const fixedMin = toolChangeMin + feedInMin + probeMin;
  const text = `${tools} tool(s) × ${TOOL_CHANGE_SEC} s = ${r3(tools * TOOL_CHANGE_SEC)} s = ${r3(toolChangeMin)} min; ${approaches} approach(es) × 2 × ${CLEARANCE_PLANE_MM} mm at the rapid`
    + `; at feed (the ${R_PLANE_MM} mm R-plane, face clearances, a tap's way out, peck retracts, air moves) ${r3(feedInMin)} min; traverse ${Math.round(traverseMm)} mm`
    + (measured || estimated ? ` (${measured ? `${measured} visit(s) between the kernel's measured hole centres, nearest-neighbour order` : ''}`
      + `${measured && estimated ? '; ' : ''}${estimated ? `${estimated} visit(s) ${ESTIMATE_TEXT}` : ''})` : '')
    + (inVisit > 0 ? ` + ${Math.round(inVisit)} mm out of the cut / back for another pass` : '')
    + ` = ${Math.round(rapidMm)} mm at the machine's rapid`
    + (probes ? `; ${probes} datum probe cycle(s) × ${PROBE_DATUM_SEC} s = ${probes * PROBE_DATUM_SEC} s = ${r3(probeMin)} min (engineering estimate, not sourced)` : '');
  return { tools, approaches, probes, fixedMin, toolChangeMin, feedInMin, probeMin, rapidMm, traverseMm, measured, estimated, text };
}

/** Rapid minutes on a machine: mm ÷ (m/min × 1000), with the rate's source. */
export function rapidMinutes(rapidMm: number, machineId: string | null | undefined): { min: number; mPerMin: number; text: string } {
  const r = machineRapid(machineId);
  const min = rapidMm > 0 ? rapidMm / (r.mPerMin * 1000) : 0;
  return { min, mPerMin: r.mPerMin,
    text: `${Math.round(rapidMm)} mm ÷ ${(r.mPerMin * 1000).toLocaleString('en-GB')} mm/min = ${r3(min)} min (rapid ${r.mPerMin} m/min — ${r.known ? `sourced: ${r.source}` : r.source}; acceleration not modelled)` };
}

/** B-axis index minutes for `indexes` moves between sides (sourced on the HMC; the same figure on a 5-axis, stated). */
export function indexMinutes(indexes: number, machineId: string | null | undefined): { min: number; text: string } {
  if (!(indexes > 0)) return { min: 0, text: '' };
  const min = indexes * INDEX_SEC / 60;
  return { min, text: `${indexes} index(es) between sides × ${INDEX_SEC} s = ${r3(indexes * INDEX_SEC)} s = ${r3(min)} min (sourced: ${INDEX_SOURCE}`
    + `${machineId === 'mach-hmc-400' ? '' : '; an HMC figure, no index time read for this machine'})` };
}


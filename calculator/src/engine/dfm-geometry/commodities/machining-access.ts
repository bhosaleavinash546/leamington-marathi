/**
 * Machining cost drivers that belong to the PART, not to one feature — how many ways a tool has to come
 * in (setups), features off the part's own frame (compound angles), bores that break into each other
 * (cross holes) and how many hole sizes (tools). aPriori calls these Geometric Cost Drivers; each is a
 * real step in cost that a single-feature rule cannot see.
 *
 * Measured or silent, like every rule here: a hole's open ends and their directions come from the
 * kernel's solid-classifier probe (`openDirs`), corners' reach from the same probe; nothing is assumed.
 * Pricing uses the costing's own constants (machining-time.ts), so a DFM number and the costed
 * number cannot disagree about what a fixturing or a tool change costs.
 */
import type { GeometricFinding, ManufacturingFeature, PartContext, RuleSource } from '../types.js';
import { isBlend } from '../types.js';
import { drilledInCosting, isCentreHole } from './machining.js';
import {
  HANDLING_MIN_PER_FIXTURING, PROGRAMMING_HR, TOOL_CHANGE_SEC, fixtureCostGBP, handlingMinPerFixturing,
} from '../../machining-time.js';

type V3 = [number, number, number];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: readonly number[]): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const deg = (rad: number) => (rad * 180) / Math.PI;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Two tool directions closer than this are one setup (and an axis this close to the frame is on it). */
export const SAME_DIRECTION_DEG = 2;
/** A setup count at or above this is reported; two (op 1 and the flip) is ordinary for a prismatic part. */
export const SETUPS_REPORTED_AT = 3;
/** Distinct hole sizes at or above this are reported — each one is a tool and a tool change. */
export const HOLE_SIZES_REPORTED_AT = 6;

export const ACCESS_SOURCE: RuleSource = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 tool directions and fixturings',
  note: 'Each direction a tool must come from is a re-fixturing on a 3-axis machine; counted here as the smallest set of '
    + 'directions that reaches every measured hole and internal corner (greedy set cover). Judged only when the costing '
    + 'routes the milling on a 3-axis machine (or names no machine); the 3-direction reporting threshold is the tool\u2019s own.',
};
export const COMPOUND_SOURCE: RuleSource = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 off-axis bores and machine axes',
  note: 'A bore whose axis is off every principal direction of the part is reached by a 3-axis spindle only with an angle '
    + 'fixture. An axis tilted in ONE principal plane is a single angle (one rotary axis or an angle plate); tilted out of '
    + 'every principal plane it is a compound angle (two rotary axes, or a compound-angle fixture). Judged against the machine '
    + 'the costing routes the part on.',
};
export const CROSS_HOLE_SOURCE: RuleSource = {
  standard: 'Cross-hole burr \u2014 a principle (L. K. Gillespie, "Deburring Small Intersecting Holes", Bendix), not a numeric threshold',
  note: 'Where one drilled bore breaks into another the exit burr is inside the part and out of reach of normal deburring: it '
    + 'needs a cross-hole deburring tool, brushing, thermal (TEM) or electrochemical (ECM) deburring, and on a fluid part a '
    + 'cleanliness check (ISO 16232 for road-vehicle fluid circuits).',
};
export const TOOL_COUNT_SOURCE: RuleSource = {
  standard: 'CostVision engineering heuristic (not a published standard) \u2014 distinct drilled sizes',
  note: 'Each distinct drilled diameter is a drill and a tool change (the costing charges 6 s a change). Counted on the holes '
    + 'the costing DRILLS: a stepped hole is one bore (a step tool at volume), cored or bored bores are not drill sizes, an '
    + 'ISO 866 centre hole is a stock centre drill and a land shallower than \u00bc of its diameter is a spot face. The '
    + '6-size reporting threshold is the tool\u2019s own.',
};

/** What the costed machines reach in one clamping: 5 (5-axis), 4 (a 4th-axis HMC), 3 (3-axis / drill), or null (none named). */
export function costedMillAxes(machineIds: readonly string[] | undefined): number | null {
  if (!machineIds?.length) return null;
  let best: number | null = null;
  for (const id of machineIds) {
    const m = id.toLowerCase();
    const axes = /vmc5|5ax|5-axis|umc|five/.test(m) ? 5 : /hmc|4ax|4th/.test(m) ? 4
      : /vmc|vf\d|mill|drill|machining|router/.test(m) ? 3 : null;
    if (axes !== null) best = Math.max(best ?? 0, axes);
  }
  return best;
}

/** The part's own frame: the largest planar face's normal, the largest face square to it, and their cross. */
export function partFrame(features: readonly ManufacturingFeature[]): V3[] {
  // Square faces only: a drafted wall or an undercut is tilted on purpose and must not set the frame (a 3°
  // drafted casting wall as the frame would call every square bore "compound").
  const planes = features.filter(f => f.kind === 'planar_face' && f.axis && (f.areaMm2 ?? 0) > 0
    && f.draftClass !== 'drafted' && f.draftClass !== 'undercut');
  const WORLD: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (!planes.length) return WORLD;
  // area per normal LINE (a face and its opposite are one direction of the frame)
  const lines: Array<{ d: V3; area: number }> = [];
  for (const p of planes) {
    const d = norm(p.axis!);
    const hit = lines.find(l => Math.abs(dot(l.d, d)) >= Math.cos((SAME_DIRECTION_DEG * Math.PI) / 180));
    if (hit) hit.area += p.areaMm2!; else lines.push({ d, area: p.areaMm2! });
  }
  lines.sort((a, b) => b.area - a.area);
  const d1 = lines[0].d;
  const d2 = lines.find(l => Math.abs(dot(l.d, d1)) <= Math.sin((SAME_DIRECTION_DEG * Math.PI) / 180))?.d;
  let frame: V3[];
  if (!d2) {
    // no second square face — complete the frame from any vector not parallel to d1
    const t: V3 = Math.abs(d1[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e2 = norm(cross(d1, t));
    frame = [d1, e2, norm(cross(d1, e2))];
  } else frame = [d1, d2, norm(cross(d1, d2))];
  // A frame within a few degrees of the model's own axes IS those axes (CAD is modelled square).
  const snap = Math.cos((3 * Math.PI) / 180);
  return frame.every(f => WORLD.some(w => Math.abs(dot(f, w)) >= snap)) ? WORLD : frame;
}

/** Degrees from an axis line to the nearest line of the frame. */
export function offFrameDeg(axis: readonly number[], frame: readonly V3[]): number {
  const a = norm(axis);
  const best = Math.max(...frame.map(f => Math.abs(dot(a, f))));
  return deg(Math.acos(Math.min(1, best)));
}

/** A machined feature and the directions a tool can reach it from. */
interface AccessItem { f: ManufacturingFeature; options: V3[] }

function accessItems(part: PartContext): AccessItem[] {
  const out: AccessItem[] = [];
  const corners = part.commodity === 'machining'; // a cast or forged corner is formed, not cut
  for (const f of part.featureSet.features ?? []) {
    const dirs = (f.openDirs ?? []).map(d => norm(d));
    if (!dirs.length) continue;
    if (f.kind === 'hole') out.push({ f, options: dirs });
    else if (corners && f.kind === 'fillet' && f.concave && f.toolReachMm !== undefined) out.push({ f, options: dirs });
  }
  return out;
}

/** Directions within this of perpendicular to an axis count as radial to it. */
export const RADIAL_TOL_DEG = 5;
/** Radial directions round one axis that make a rotary-indexed fixturing … */
export const INDEXED_MIN_DIRECTIONS = 3;
/**
 * … of which at least this many are OFF the part's frame (angled). The four sides of a prismatic block are all
 * perpendicular to Z too, but they are a 3-axis part's separate fixturings, not a radial pattern — collapsing them
 * hid the setups finding on every block with holes on its sides (review, Oct 2026).
 */
export const INDEXED_MIN_OFF_FRAME = 2;

/**
 * The largest group of directions perpendicular to ONE axis (≥ 3, a rotary index's work), or null. Candidate axes
 * are the normals of pairs of directions; an axis also in the set (an end face) is not a member — it is reached
 * along the axis, not by indexing round it.
 */
export function indexedGroup(dirs: readonly V3[], frame?: readonly V3[]): { axis: V3; members: number[] } | null {
  const tol = Math.sin((RADIAL_TOL_DEG * Math.PI) / 180);
  let best: { axis: V3; members: number[] } | null = null;
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const c = cross(dirs[i], dirs[j]);
      if (Math.hypot(...c) < 0.1) continue;          // parallel / opposite: no unique axis
      const axis = norm(c);
      const members = dirs.map((d, k) => (Math.abs(dot(d, axis)) < tol ? k : -1)).filter(k => k >= 0);
      if (!best || members.length > best.members.length) best = { axis, members };
    }
  }
  if (!best || best.members.length < INDEXED_MIN_DIRECTIONS) return null;
  if (frame && best.members.filter(k => offFrameDeg(dirs[k], frame) > SAME_DIRECTION_DEG).length < INDEXED_MIN_OFF_FRAME) return null;
  return best;
}

// ── toothed forms: gear teeth and splines are generated, not end-milled ─────────────────────────────────────────

/**
 * A tooth ring: at least this many concave roots of one radius on one circle round one axis — two root blends per
 * tooth space, so 12 or more teeth. A ring of milled pockets has the same symmetry (6 lightening pockets with R1 corners
 * are 12 + 12 corners on two rings — review, Oct 2026), so fewer than 24 roots are judged as corners; a spline of
 * under 12 teeth loses the exemption, which is stated rather than guessed …
 */
export const TOOTHED_MIN_COUNT = 24;
/**
 * … each root small against its ring (a gear's root radius ≈ 0.38 m on a pitch radius z·m/2: r/R ≈ 0.76/z ≤ 0.05 from
 * ~16 teeth; the input shaft's 0.1 mm on 15 mm is 0.007) and a blend, not a slot end. Model Mania's hexagonal pocket
 * (6 × R2 on 13 mm, 0.15) and the gearbox's R10 flange scallops (half-cylinders, 0.08) are not tooth forms.
 */
export const TOOTHED_MAX_ROOT_TO_RING = 0.05;
export const TOOTHED_SOURCE: RuleSource = {
  standard: "Machinery's Handbook (31st ed.) — gearing: gear cutting by hobbing, shaping and broaching; splines",
  note: 'Gear and spline teeth are GENERATED by a hob, shaper cutter, broach or rolling die whose profile forms the root; '
    + 'the root radius is the tool\'s tip, not an end mill\'s. A tooth form is costed as gear / spline cutting.',
};

export interface ToothedSet { axis: V3; radiusMm: number; pitchRadiusMm: number; ids: string[]; faceIds: number[] }

/**
 * Concave partial cylinders that are tooth or spline roots: same radius, axes parallel, positions on one circle round
 * a common axis and spread round it (> 180°). The input shaft's 126 R0.1 "internal corners" were its tooth roots —
 * corner rules priced them as end-milled corners (£52) and asked for a Ø0.2 mm cutter at 146 × D.
 */
export function toothedSets(features: readonly ManufacturingFeature[]): ToothedSet[] {
  const fil = features.filter(f => f.kind === 'fillet' && f.concave && f.axis && f.positionMm && f.radiusMm && isBlend(f));
  const groups = new Map<string, ManufacturingFeature[]>();
  for (const f of fil) {
    const a = norm(f.axis!);
    const sgn = (a.find(c => Math.abs(c) > 1e-6) ?? 1) > 0 ? 1 : -1;
    const k = `${(f.radiusMm! * 20).toFixed(0)}|${a.map(c => (c * sgn).toFixed(2)).join(',')}`;
    const g = groups.get(k); if (g) g.push(f); else groups.set(k, [f]);
  }
  const out: ToothedSet[] = [];
  for (const g of groups.values()) {
    if (g.length < TOOTHED_MIN_COUNT) continue;
    const axis = norm(g[0].axis!);
    // positions projected on the plane ⟂ axis; their centroid lies on the pattern's axis (a full ring is symmetric)
    const proj = g.map(f => { const p = f.positionMm!; const t = dot(p, axis); return [p[0] - axis[0] * t, p[1] - axis[1] * t, p[2] - axis[2] * t] as V3; });
    const c = proj.reduce((a, p) => [a[0] + p[0] / proj.length, a[1] + p[1] / proj.length, a[2] + p[2] / proj.length] as V3, [0, 0, 0] as V3);
    const rad = proj.map(p => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    // rings at different radii (two gears on one shaft) are separate sets
    const order = rad.map((r, i) => [r, i] as const).sort((a, b) => a[0] - b[0]);
    let band: number[] = [];
    const flush = () => {
      if (band.length >= TOOTHED_MIN_COUNT) {
        const rs = band.map(i => rad[i]);
        const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
        // spread round the axis: the angles cover more than half a turn
        const u = norm(proj[band[0]].map((v, k) => v - c[k]) as V3), w = cross(axis, u);
        const ang = band.map(i => { const v = proj[i].map((x, k) => x - c[k]); return Math.atan2(dot(v, w), dot(v, u)); }).sort((a, b) => a - b);
        let gap = ang[0] + 2 * Math.PI - ang[ang.length - 1];
        for (let k = 1; k < ang.length; k++) gap = Math.max(gap, ang[k] - ang[k - 1]);
        if (g[0].radiusMm! <= TOOTHED_MAX_ROOT_TO_RING * mean && 2 * Math.PI - gap > Math.PI) {
          const fs = band.map(i => g[i]);
          out.push({ axis, radiusMm: g[0].radiusMm!, pitchRadiusMm: Math.round(mean * 100) / 100, ids: fs.map(f => f.id), faceIds: fs.flatMap(f => f.faceIds) });
        }
      }
      band = [];
    };
    for (const [r, i] of order) {
      if (band.length && r - rad[band[band.length - 1]] > Math.max(0.5, 0.05 * r)) flush();
      band.push(i);
    }
    flush();
  }
  return out;
}

/** The advisory each tooth form gets — what it is and where it is costed. */
export function toothedFindings(part: PartContext, sets: readonly ToothedSet[]): GeometricFinding[] {
  return sets.map(t => partFinding({
    ruleId: 'machining.feature.toothed-form', part, severity: 'info',
    title: 'Tooth form (gear or spline) — generated, not end-milled',
    detail: `${t.ids.length} concave R${t.radiusMm.toFixed(2)} mm roots on a ring of radius ${t.pitchRadiusMm.toFixed(1)} mm round `
      + `${dirLabel(t.axis)} — a gear or spline tooth form. The corner rules do not judge them as end-milled corners.`,
    faceIds: t.faceIds, featureId: `TOOTH:${t.ids[0]}`, field: 'roots', value: t.ids.length, unit: 'roots',
    threshold: TOOTHED_MIN_COUNT - 1, comparator: '>',
    recommendation: 'Cost the teeth as gear / spline cutting (hobbing, shaping, broaching or rolling) — the gear commodity '
      + 'carries those times; check the root radius against the hob or broach tip rather than an end mill.',
    source: TOOTHED_SOURCE, positionMm: undefined,
  }));
}

/** Smallest set of directions reaching every item (greedy set cover — within one of optimal here). */
export function coverDirections(items: Array<{ options: readonly V3[] }>): Array<{ dir: V3; covers: number[] }> {
  const cosTol = Math.cos((SAME_DIRECTION_DEG * Math.PI) / 180);
  const cands: V3[] = [];
  for (const it of items) for (const o of it.options) if (!cands.some(c => dot(c, o) >= cosTol)) cands.push(o);
  const uncovered = new Set(items.map((_, i) => i));
  const chosen: Array<{ dir: V3; covers: number[] }> = [];
  while (uncovered.size) {
    let best: { dir: V3; covers: number[] } | null = null;
    for (const c of cands) {
      const covers = [...uncovered].filter(i => items[i].options.some(o => dot(c, o) >= cosTol));
      if (!best || covers.length > best.covers.length) best = { dir: c, covers };
    }
    if (!best || !best.covers.length) break;
    best.covers.forEach(i => uncovered.delete(i));
    chosen.push(best);
  }
  return chosen;
}

/** A direction in the part's own words: "+Z", or the vector when it is off the axes. */
export function dirLabel(d: readonly number[]): string {
  const ax = ['X', 'Y', 'Z'];
  const i = [0, 1, 2].reduce((b, k) => (Math.abs(d[k]) > Math.abs(d[b]) ? k : b), 0);
  if (Math.abs(d[i]) >= Math.cos((SAME_DIRECTION_DEG * Math.PI) / 180)) return `${d[i] > 0 ? '+' : '−'}${ax[i]}`;
  return `(${d.map(c => c.toFixed(2)).join(', ')})`;
}

function partFinding(o: {
  ruleId: string; part: PartContext; severity: GeometricFinding['severity']; title: string; detail: string;
  faceIds: number[]; featureId: string; field: string; value: number; unit: string; threshold: number;
  comparator: GeometricFinding['threshold']['comparator']; recommendation: string; source: RuleSource;
  positionMm?: [number, number, number];
}): GeometricFinding {
  return {
    ruleId: o.ruleId, commodity: o.part.commodity, severity: o.severity, title: o.title, detail: o.detail,
    featureId: o.featureId, faceIds: [...new Set(o.faceIds)].sort((a, b) => a - b),
    measured: { field: o.field, value: Math.round(o.value * 1000) / 1000, unit: o.unit },
    threshold: { value: o.threshold, unit: o.unit, comparator: o.comparator },
    recommendation: o.recommendation, source: o.source,
    ...(o.positionMm ? { positionMm: o.positionMm } : {}),
  };
}

/**
 * Part-level machining findings: setups, off-axis holes, cross holes, hole sizes. `notes` collects what a check
 * deliberately did not report (judged against the costed machine) — the runner prints it with the limitations.
 */
export function machiningPartLevelFindings(part: PartContext, notes?: string[]): GeometricFinding[] {
  const feats = part.featureSet.features ?? [];
  const out: GeometricFinding[] = [];
  const holes = feats.filter(f => f.kind === 'hole' && f.diaMm && f.axis);

  // ── setups: directions a tool must come from ──
  // Judged against the COSTED machine: a 4th-axis HMC or a 5-axis reaches the part's sides in one clamping, and the
  // costing's own fixturing count is what is in the price (report standard, Nov 2026 — the stub axle printed "3
  // fixturings on a 3-axis machine" on a 4th-axis HMC routing).
  const axes = costedMillAxes(part.machineIds);
  const items = accessItems(part);
  if (items.length && axes !== null && axes >= 4) {
    notes?.push(`Setups were not counted against a 3-axis machine: the costing routes the milling on a ${axes === 5 ? '5-axis machine' : '4th-axis machining centre'}, `
      + 'which reaches the part\'s sides in one clamping; the costing\'s own fixturing count is the one in the price.');
  } else if (items.length) {
    const cover = coverDirections(items);
    // Directions spread AROUND one axis (radial holes in a shaft, scallops round a flange) are one rotary-indexed
    // fixturing — a 4th axis or a mill-turn's C axis — not one each: the hollow driveshaft read 21 "setups".
    const idx = indexedGroup(cover.map(c => c.dir), partFrame(feats));
    const setups = idx ? cover.length - idx.members.length + 1 : cover.length;
    if (setups >= SETUPS_REPORTED_AT) {
      const parts = cover.filter((_, i) => !idx?.members.includes(i))
        .map(c => `${dirLabel(c.dir)} (${c.covers.length} feature${c.covers.length > 1 ? 's' : ''})`);
      if (idx) {
        const n = idx.members.reduce((a, i) => a + cover[i].covers.length, 0);
        parts.push(`${idx.members.length} directions round ${dirLabel(idx.axis)} on one rotary index (${n} feature${n > 1 ? 's' : ''})`);
      }
      out.push(partFinding({
        ruleId: 'machining.setup.access-directions', part,
        severity: 'info',
        title: 'Features need several setups on a 3-axis machine',
        detail: `The measured holes and internal corners are reached from ${cover.length} directions — `
          + `${parts.join(', ')} — so ${setups} fixturings`
          + (idx ? ' (the radial ones indexed on a 4th axis; a plain 3-axis needs one each)' : ' on a 3-axis machine')
          + (axes === 3 ? ', the machine class the costing routes it on.' : ' (the costing named no machine to judge against).'),
        faceIds: items.flatMap(i => i.f.faceIds), featureId: 'PART:setups',
        field: 'setups', value: setups, unit: 'setups', threshold: SETUPS_REPORTED_AT - 1, comparator: '>',
        recommendation: 'Bring features onto fewer faces (the fewest directions the function allows), or '
          + 'cost the part on a 4/5-axis machine where one fixturing reaches several sides.',
        source: ACCESS_SOURCE,
      }));
    }
  }

  // ── off-axis holes: ONE finding per off-frame direction; coaxial lands are one bore ──
  const frame = partFrame(feats);
  const cosTol = Math.cos((SAME_DIRECTION_DEG * Math.PI) / 180);
  const sinTol = Math.sin((SAME_DIRECTION_DEG * Math.PI) / 180);
  const offGroups: Array<{ dir: V3; off: number; holes: ManufacturingFeature[] }> = [];
  for (const h of holes) {
    const off = offFrameDeg(h.axis!, frame);
    if (off <= SAME_DIRECTION_DEG) continue;
    const d = norm(h.axis!);
    const g = offGroups.find(x => Math.abs(dot(x.dir, d)) >= cosTol);
    if (g) g.holes.push(h); else offGroups.push({ dir: d, off, holes: [h] });
  }
  for (const g of offGroups) {
    // A single angle: the axis lies in a principal plane (one frame component ~0) — one rotary axis reaches it.
    const comps = frame.map(f => Math.abs(dot(g.dir, f)));
    const compound = comps.every(c => c > sinTol);
    const need = compound ? 5 : 4;
    if (axes !== null && axes >= need) {
      notes?.push(`${boreCount(g.holes)} off-axis bore(s) at ${g.off.toFixed(1)}° (${compound ? 'a compound angle' : 'a single angle'}) are `
        + `reached by the ${axes === 5 ? '5-axis machine' : '4th-axis machining centre'} the costing routes the part on — not a finding.`);
      continue;
    }
    const sizes = [...new Set(g.holes.map(h => `⌀${h.diaMm!.toFixed(1)}`))];
    const n = boreCount(g.holes);
    const plane = compound ? '' : ` — tilted in the plane square to ${dirLabel(frame[comps.indexOf(Math.min(...comps))])}, a single angle`;
    out.push(partFinding({
      ruleId: 'machining.hole.compound-angle', part, severity: 'info',
      title: compound ? 'Holes on a compound angle' : 'Holes on a single off-axis angle',
      detail: `${n} bore${n > 1 ? 's' : ''}${g.holes.length > n ? ` (${g.holes.length} coaxial lands)` : ''} (${sizes.join(', ')} mm) on an axis `
        + `${g.off.toFixed(1)}° off the part's nearest principal direction — ${dirLabel(g.dir)}${plane}.`,
      faceIds: g.holes.flatMap(h => h.faceIds), featureId: `ANG:${g.holes[0].id}`, field: 'offFrameDeg', value: g.off, unit: '°',
      threshold: SAME_DIRECTION_DEG, comparator: '>',
      recommendation: compound
        ? 'If the function allows, bring the axis into a principal plane (one angle) or square it; otherwise it needs a 5-axis '
          + 'machine or a compound-angle fixture.'
        : 'An axis set by the part\'s function (a kingpin or camber angle) stays: it needs a 4th axis or an angle fixture, a '
          + 'fixturing of its own on a 3-axis machine.',
      source: COMPOUND_SOURCE, positionMm: g.holes[0].positionMm,
    }));
  }

  // ── intersecting bores ──
  const extent = (h: ManufacturingFeature) => {
    const a = norm(h.axis!), c = h.positionMm!, half = (h.depthMm ?? 0) / 2;
    return { a, c, half, r: h.diaMm! / 2 };
  };
  const hs = holes.filter(h => h.positionMm && (h.depthMm ?? 0) > 0);
  const seen = new Set<string>();
  for (let i = 0; i < hs.length; i++) {
    for (let j = i + 1; j < hs.length; j++) {
      const A = extent(hs[i]), B = extent(hs[j]);
      const n = cross(A.a, B.a);
      const nl = Math.hypot(...n);
      if (nl < 0.05) continue; // parallel: a counterbore or a co-axial step, not a cross hole
      const w = [A.c[0] - B.c[0], A.c[1] - B.c[1], A.c[2] - B.c[2]];
      // closest points between the two axis lines
      const aa = 1, bb = dot(A.a, B.a), cc = 1, dd = dot(A.a, w), ee = dot(B.a, w);
      const den = aa * cc - bb * bb;
      const s = (bb * ee - cc * dd) / den, t = (aa * ee - bb * dd) / den;
      const pA = [A.c[0] + A.a[0] * s, A.c[1] + A.a[1] * s, A.c[2] + A.a[2] * s];
      const pB = [B.c[0] + B.a[0] * t, B.c[1] + B.a[1] * t, B.c[2] + B.a[2] * t];
      const gap = Math.hypot(pA[0] - pB[0], pA[1] - pB[1], pA[2] - pB[2]);
      // the bores meet: axes closer than the radii, and the meeting point inside both bores' depth
      if (gap >= A.r + B.r || Math.abs(s) > A.half + B.r || Math.abs(t) > B.half + A.r) continue;
      const key = [hs[i].id, hs[j].id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(partFinding({
        ruleId: 'machining.hole.intersecting', part, severity: 'risk',
        title: 'Cross-drilled holes break into each other',
        detail: `⌀${hs[i].diaMm!.toFixed(1)} mm and ⌀${hs[j].diaMm!.toFixed(1)} mm bores intersect `
          + `(axes ${gap.toFixed(1)} mm apart at the crossing).`,
        faceIds: [...hs[i].faceIds, ...hs[j].faceIds], featureId: `X:${key}`,
        field: 'axisGapMm', value: gap, unit: 'mm', threshold: Math.round((A.r + B.r) * 1000) / 1000, comparator: '<',
        recommendation: 'The exit burr is inside the bore: allow a cross-hole deburr (tool, brush, thermal or ECM) '
          + 'and its inspection — on a fluid part a cleanliness risk — or offset the holes so they do not break through where '
          + 'the flow allows. The costing has no cross-hole deburr operation.',
        source: CROSS_HOLE_SOURCE, positionMm: pA.map(v => Math.round(v * 1000) / 1000) as [number, number, number],
      }));
    }
  }

  // ── hole sizes (tools) ──
  // Only the holes the costing DRILLS, a stepped hole counted once (its lands are one bore), centre holes out — the stub
  // axle's "14 sizes" were 10 lands of two cored bearing bores, a centre hole and its countersink (report standard,
  // Nov 2026).
  const drilled = holes.filter(h => drilledInCosting(h, part) && !isCentreHole(h, part));
  const centre = holes.filter(h => isCentreHole(h, part));
  const chains = coaxialChains(drilled.filter(h => !centre.some(c => sameAxisLine(c, h))));
  const sizes = [...new Set(chains.map(c => c.map(h => Math.round(h.diaMm! * 10) / 10).sort((a, b) => a - b).join('/')))];
  if (sizes.length >= HOLE_SIZES_REPORTED_AT) {
    out.push(partFinding({
      ruleId: 'machining.hole.many-sizes', part, severity: 'info',
      title: 'Many different drilled hole sizes',
      detail: `${sizes.length} drilled sizes (${sizes.map(s => `⌀${s}`).join(', ')}) — a drill each (a step tool for a stepped `
        + 'hole), plus taps / reamers where fitted or threaded.',
      faceIds: chains.flat().flatMap(h => h.faceIds), featureId: 'PART:hole-sizes',
      field: 'holeSizes', value: sizes.length, unit: 'sizes', threshold: HOLE_SIZES_REPORTED_AT - 1, comparator: '>',
      recommendation: 'Consolidate clearance and tapping sizes onto a few standard diameters so one drill serves several holes, '
        + 'where the fits and threads on the drawing allow.',
      source: TOOL_COUNT_SOURCE,
    }));
  }
  return out;
}

/** Two holes on one axis line (parallel, within the kernel's 0.5 mm coaxial tolerance). */
function sameAxisLine(a: ManufacturingFeature, b: ManufacturingFeature): boolean {
  if (!a.axis || !b.axis || !a.positionMm || !b.positionMm) return false;
  if (Math.abs(dot(norm(a.axis), norm(b.axis))) < Math.cos((SAME_DIRECTION_DEG * Math.PI) / 180)) return false;
  const u = norm(a.axis), v = [b.positionMm[0] - a.positionMm[0], b.positionMm[1] - a.positionMm[1], b.positionMm[2] - a.positionMm[2]];
  const t = dot(v, u);
  return Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]) < 0.5;
}
/** Holes on one axis line whose extents touch — the lands of one stepped hole or bore. */
export function coaxialChains(hs: readonly ManufacturingFeature[]): ManufacturingFeature[][] {
  const out: ManufacturingFeature[][] = [];
  const touch = (a: ManufacturingFeature, b: ManufacturingFeature) => {
    if (!sameAxisLine(a, b)) return false;
    const p = a.positionMm!, q = b.positionMm!;
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) <= ((a.depthMm ?? 0) + (b.depthMm ?? 0)) / 2 + 0.5;
  };
  for (const h of hs) {
    const joined = out.filter(c => c.some(x => touch(x, h)));
    if (!joined.length) { out.push([h]); continue; }
    const merged = [h, ...joined.flat()];
    for (const c of joined) out.splice(out.indexOf(c), 1);
    out.push(merged);
  }
  return out;
}
/** Bores on distinct axis lines (coaxial lands are one bore). */
function boreCount(hs: readonly ManufacturingFeature[]): number {
  const lines: ManufacturingFeature[] = [];
  for (const h of hs) if (!lines.some(l => sameAxisLine(l, h))) lines.push(h);
  return lines.length;
}

// ── pricing (registered in cost-impact.ts) ──────────────────────────────────

/**
 * What the fixturings beyond the second cost a part: load / clamp / unload each part, the fixture and the
 * CAM programming amortised over a year's parts — the costing's own constants, so this reconciles to it.
 */
export function priceExtraSetups(f: GeometricFinding, ctx: { machineRatePerHr?: number; labourRatePerHr?: number; engineerRatePerHr?: number; annualVolume?: number; partWeightKg?: number }) {
  const { machineRatePerHr: mr, labourRatePerHr: lr, engineerRatePerHr: er, annualVolume: vol, partWeightKg: kg } = ctx;
  if (mr === undefined || lr === undefined || !vol || vol <= 0) return null;
  const extra = f.measured.value - 2;
  if (extra <= 0) return null;
  // the costing's own functions: handling by the part's weight, the fixture × the country's toolroom factor
  const handMin = kg !== undefined && kg > 0 ? handlingMinPerFixturing(kg) : HANDLING_MIN_PER_FIXTURING;
  const fx = fixtureCostGBP(extra, 0, vol);
  const handling = extra * (handMin / 60) * (mr + lr);
  const programming = er !== undefined ? extra * PROGRAMMING_HR.perFixturing * er : 0;
  const perPart = handling + (fx.gbp + programming) / vol;
  return {
    perPartGBP: r4(perPart),
    kind: 'feature_cost' as const,
    basis: `${extra} fixturing(s) beyond op 1 and the flip: load/clamp/unload ${handMin} min${kg ? ` (${kg.toFixed(2)} kg part)` : ' (default — weight not supplied)'} `
      + `× £${(mr + lr).toFixed(2)}/h + fixtures £${fx.gbp.toLocaleString('en-GB')} (${fx.basis})`
      + (er !== undefined ? ` + CAM ${PROGRAMMING_HR.perFixturing} h × £${er.toFixed(2)}/h each` : '')
      + ` ÷ ${vol.toLocaleString('en-GB')} parts a year. Batch set-up time is not included (no batch size).`,
    confidence: (er !== undefined && kg ? 'modelled' : 'indicative') as 'modelled' | 'indicative',
  };
}

/** Tool changes for each hole size beyond the first — the costing's tool-change time. */
export function priceHoleSizes(f: GeometricFinding, ctx: { machineRatePerHr?: number; labourRatePerHr?: number; rateBasis?: string }) {
  const { machineRatePerHr: mr, labourRatePerHr: lr } = ctx;
  if (mr === undefined) return null;
  const extra = f.measured.value - 1;
  const minutes = extra * (TOOL_CHANGE_SEC / 60);
  return {
    perPartGBP: r4((minutes / 60) * (mr + (lr ?? 0))),
    minutes: r4(minutes),
    kind: 'feature_cost' as const,
    basis: `${extra} size${extra === 1 ? '' : 's'} beyond the first × the costing\u2019s ${TOOL_CHANGE_SEC} s tool change = ${minutes.toFixed(2)} min `
      + `× £${(mr + (lr ?? 0)).toFixed(2)}/h ${ctx.rateBasis ?? 'at the reference machine + labour rate'} — an upper bound (every size merged into one); `
      + 'tool stock and programming effort, the larger cost of many sizes, are not priced.',
    confidence: 'modelled' as const,
  };
}

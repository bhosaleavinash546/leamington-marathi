/**
 * Sheet-metal DFM on the DEVELOPED BLANK — hole-to-edge, hole-to-bend, minimum flange and bend relief.
 *
 * The kernel's aggregate view gives a bend count and total bend length, never a bend LINE, so these four checks were
 * listed as not done (`SHEET_METAL_LIMITATIONS`) while the job had the seat bracket's unfolded blank — outline, 21 holes,
 * 15 bends — in hand (report standard review, Nov 2026, dfm.md #28). The unfold (`server/utils/blank-unfold.ts`) maps
 * every vertex of a skin to the flat; a bend is where that skin creases in 3D, so its crease edges, carried to the flat,
 * ARE the bend zone: a straight band between two tangent lines. Holes and outline are the flat's own loops.
 *
 * Pure: the job builds `SheetBlankFacts` from the unfold's internals with `sheetBlankFromFlat`; the rules below read only
 * those facts. Measured or silent: a crease cluster that is not a straight band (a formed corner, an emboss, a drawn
 * area) is not judged as a bend and is counted in the limitation line.
 *
 * Every threshold is the tool's own (engineering-typical, not sourced) and says so on the finding.
 */
import type { GeometricFinding, PartContext, RuleSource } from '../types.js';

export type Pt = [number, number];

export interface SheetBend {
  id: number;
  /** Unit direction of the bend line in the flat. */
  dir: Pt;
  /** Unit normal to it (from one tangent line to the other). */
  nrm: Pt;
  /** Extent along the bend line and across it (the two tangent lines), in the flat frame, mm. */
  aMin: number; aMax: number; nMin: number; nMax: number;
}

export interface SheetBlankFacts {
  gaugeMm: number;
  /** Outer profile of the flat, mm (the flat's own frame). */
  outline: Pt[];
  holes: Pt[][];
  bends: SheetBend[];
  /** Crease regions that are not a straight bend (formed corners, embosses, drawn areas) — not judged. */
  formedRegions: number;
  /** False when the skin had to stretch to lie flat (a drawn / stretch-formed part): distances are indicative. */
  developable: boolean;
  /** Which skin was flattened and how — printed on every finding's basis. */
  source: string;
}

/** A crease is an edge whose two triangles' normals differ by more than this, degrees: a flat face's triangles are
 *  coplanar to rounding, a bend's tessellation strips turn by degrees. A classification tolerance, not a design limit. */
export const CREASE_DEG = 1;
/**
 * …and that turns tightly: the local radius (the narrower triangle's height over the edge ÷ the turn) at most the kernel's
 * own bend-detector limit, max(8 mm, 6 t) (`_detect_bends`) — a stamped part's gently curved (free-form) panels crease by
 * a degree or two over several millimetres and are not bends.
 */
export const BEND_RADIUS_MAX = (t: number) => Math.max(8, 6 * t);
/** A crease cluster is a straight bend when this share of its length runs within `BEND_STRAIGHT_DEG` of its mean line. */
export const BEND_STRAIGHT_SHARE = 0.8;
export const BEND_STRAIGHT_DEG = 10;

/** Thresholds, × the gauge t. The tool's own (engineering-typical, not sourced). */
export const HOLE_TO_EDGE_MIN_T = 1.5;
export const HOLE_TO_BEND_MIN_T = 2.5;
export const MIN_FLANGE_T = 3;

const HEURISTIC = (what: string): RuleSource => ({
  standard: 'CostVision engineering heuristic (not a published standard)',
  note: `${what} Engineering-typical, not sourced; measured on the developed blank (the unfolded skin), not on the formed part.`,
});
export const SHEET_BLANK_SOURCES: Record<string, RuleSource> = {
  'sheetmetal.blank.hole-to-edge': HEURISTIC(`A hole closer than ${HOLE_TO_EDGE_MIN_T} t to the blank edge bulges or tears the edge when it is pierced.`),
  'sheetmetal.blank.hole-to-bend': HEURISTIC(`A hole closer than ${HOLE_TO_BEND_MIN_T} t to a bend's tangent line distorts as the bend forms.`),
  'sheetmetal.blank.min-flange': HEURISTIC(`A flange shorter than ${MIN_FLANGE_T} t beyond the bend's tangent line does not span the die and forms unreliably.`),
  'sheetmetal.blank.bend-relief': HEURISTIC('A bend that ends inside the blank with no relief cut at its end tears the corner as it forms.'),
};

// ── geometry ───────────────────────────────────────────────────────────────────────────────────────────────────────

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a), ap = sub(p, a);
  const L = dot2(ab, ab);
  const t = L > 0 ? Math.max(0, Math.min(1, dot2(ap, ab) / L)) : 0;
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1]);
}
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inMaterial(p: Pt, b: Pick<SheetBlankFacts, 'outline' | 'holes'>): boolean {
  return pointInPolygon(p, b.outline) && !b.holes.some(h => pointInPolygon(p, h));
}
function loopPerimeter(l: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < l.length; i++) { const a = l[i], c = l[(i + 1) % l.length]; s += Math.hypot(c[0] - a[0], c[1] - a[1]); }
  return s;
}
function centroid(l: readonly Pt[]): Pt {
  const n = l.length || 1;
  return [l.reduce((s, p) => s + p[0], 0) / n, l.reduce((s, p) => s + p[1], 0) / n];
}
/** Distance along `d` from `p` to the first crossing of the polygon, or null. */
function rayHit(p: Pt, d: Pt, poly: readonly Pt[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const e = sub(b, a);
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const ap = sub(a, p);
    const t = (ap[0] * e[1] - ap[1] * e[0]) / den;
    const u = (ap[0] * d[1] - ap[1] * d[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

// ── facts from the unfold ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * The blank's facts from a flattened skin: the 3D skin (vertices, triangles — the first `mReal` are the real skin), the
 * flat position of every vertex (2 per vertex), the outer and hole loops (vertex indices) and the gauge.
 */
export function sheetBlankFromFlat(input: {
  vertices3d: ArrayLike<number> | number[][];
  triangles: ArrayLike<number>;
  mReal: number;
  flat: ArrayLike<number>;
  outer: number[];
  holes: number[][];
  gaugeMm: number;
  developable: boolean;
  source: string;
}): SheetBlankFacts {
  const { triangles: T, mReal, flat: U } = input;
  const V3 = Array.isArray(input.vertices3d) && Array.isArray((input.vertices3d as number[][])[0])
    ? (input.vertices3d as number[][]).flat() : Array.from(input.vertices3d as ArrayLike<number>);
  const P = (v: number): Pt => [U[2 * v], U[2 * v + 1]];
  const normal = (i: number): number[] => {
    const a = T[3 * i], b = T[3 * i + 1], c = T[3 * i + 2];
    const ab = [V3[3 * b] - V3[3 * a], V3[3 * b + 1] - V3[3 * a + 1], V3[3 * b + 2] - V3[3 * a + 2]];
    const ac = [V3[3 * c] - V3[3 * a], V3[3 * c + 1] - V3[3 * a + 1], V3[3 * c + 2] - V3[3 * a + 2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // edges shared by two real triangles
  const edgeTri = new Map<string, number[]>();
  for (let i = 0; i < mReal; i++) {
    for (const [u, v] of [[T[3 * i], T[3 * i + 1]], [T[3 * i + 1], T[3 * i + 2]], [T[3 * i + 2], T[3 * i]]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      const l = edgeTri.get(k); if (l) l.push(i); else edgeTri.set(k, [i]);
    }
  }
  const cosTol = Math.cos((CREASE_DEG * Math.PI) / 180);
  const rMax = BEND_RADIUS_MAX(input.gaugeMm);
  const at3 = (v: number) => [V3[3 * v], V3[3 * v + 1], V3[3 * v + 2]];
  /** Height of triangle i over its edge (u, v), 3D. */
  const height = (i: number, u: number, v: number): number => {
    const w = [T[3 * i], T[3 * i + 1], T[3 * i + 2]].find(k => k !== u && k !== v)!;
    const A = at3(u), B = at3(v), C = at3(w);
    const e = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], c = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const x = [e[1] * c[2] - e[2] * c[1], e[2] * c[0] - e[0] * c[2], e[0] * c[1] - e[1] * c[0]];
    return Math.hypot(x[0], x[1], x[2]) / (Math.hypot(e[0], e[1], e[2]) || 1);
  };
  const creases: Array<[number, number]> = [];
  for (const [k, tri] of edgeTri) {
    if (tri.length !== 2) continue;
    const a = normal(tri[0]), b = normal(tri[1]);
    // |cos|: a skin stitched from faces of either orientation turns a flat seam into 180°, which is not a crease
    const c = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    if (c >= cosTol) continue;
    const [u, v] = k.split('_').map(Number);
    const turn = Math.acos(c);
    if (Math.min(height(tri[0], u, v), height(tri[1], u, v)) / turn > rMax) continue;   // a gentle curve, not a bend
    creases.push([u, v]);
  }
  // cluster: a crease's two vertices are one bend; so is a NARROW triangle (height over its crease ≤ the bend radius
  // limit) that joins one crease line to the next — the strip between a bend's tessellation lines.
  const parent = new Map<number, number>();
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (x: number, y: number) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    const rx = find(x), ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const [u, v] of creases) join(u, v);
  const creaseKeys = new Set(creases.map(([u, v]) => (u < v ? `${u}_${v}` : `${v}_${u}`)));
  for (let i = 0; i < mReal; i++) {
    const t3 = [T[3 * i], T[3 * i + 1], T[3 * i + 2]];
    for (let e = 0; e < 3; e++) {
      const u = t3[e], v = t3[(e + 1) % 3], w = t3[(e + 2) % 3];
      if (!creaseKeys.has(u < v ? `${u}_${v}` : `${v}_${u}`) || !parent.has(w)) continue;
      if (height(i, u, v) <= rMax) join(u, w);
    }
  }
  const clusters = new Map<number, Array<[number, number]>>();
  for (const e of creases) { const r = find(e[0]); const c = clusters.get(r); if (c) c.push(e); else clusters.set(r, [e]); }

  const bends: SheetBend[] = [];
  let formedRegions = 0;
  for (const segs of clusters.values()) {
    let cx = 0, sx = 0, total = 0;
    const lens = segs.map(([u, v]) => { const d = sub(P(v), P(u)); return { d, l: Math.hypot(d[0], d[1]) }; });
    for (const { d, l } of lens) {
      if (l <= 0) continue;
      const th = Math.atan2(d[1], d[0]);
      cx += l * Math.cos(2 * th); sx += l * Math.sin(2 * th); total += l;
    }
    if (!(total > 0)) continue;
    const mean = Math.atan2(sx, cx) / 2;
    const dir: Pt = [Math.cos(mean), Math.sin(mean)];
    const tol = Math.cos((BEND_STRAIGHT_DEG * Math.PI) / 180);
    const straight = lens.reduce((s, { d, l }) => s + (l > 0 && Math.abs(dot2(d, dir)) / l >= tol ? l : 0), 0) / total;
    if (straight < BEND_STRAIGHT_SHARE) { formedRegions++; continue; }
    const nrm: Pt = [-dir[1], dir[0]];
    let aMin = Infinity, aMax = -Infinity, nMin = Infinity, nMax = -Infinity;
    for (const [u, v] of segs) for (const w of [u, v]) {
      const p = P(w);
      const a = dot2(p, dir), n = dot2(p, nrm);
      aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); nMin = Math.min(nMin, n); nMax = Math.max(nMax, n);
    }
    bends.push({ id: bends.length + 1, dir, nrm, aMin, aMax, nMin, nMax });
  }
  return {
    gaugeMm: input.gaugeMm,
    outline: input.outer.map(P),
    holes: input.holes.map(h => h.map(P)),
    bends, formedRegions, developable: input.developable, source: input.source,
  };
}

// ── rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function blankFinding(part: PartContext, o: {
  ruleId: string; title: string; detail: string; featureId: string; field: string; value: number; threshold: number;
  recommendation: string;
}): GeometricFinding {
  return {
    ruleId: o.ruleId, commodity: part.commodity, severity: 'risk', title: o.title, detail: o.detail,
    featureId: o.featureId, faceIds: [],
    measured: { field: o.field, value: Math.round(o.value * 1000) / 1000, unit: 'mm' },
    threshold: { value: Math.round(o.threshold * 1000) / 1000, unit: 'mm', comparator: '<' },
    recommendation: o.recommendation, source: SHEET_BLANK_SOURCES[o.ruleId],
  };
}

/** Does this cut bound the bend's end — a point of it across the bend zone within t of the zone's end (a relief / lance)? */
function boundsBend(h: readonly Pt[], bd: SheetBend, t: number): boolean {
  return h.some(p => {
    const a = dot2(p, bd.dir), n = dot2(p, bd.nrm);
    return n >= bd.nMin - t && n <= bd.nMax + t && (Math.abs(a - bd.aMin) <= t || Math.abs(a - bd.aMax) <= t);
  });
}

/** A hole's size in words: its equivalent diameter (perimeter ÷ π) and where it sits on the flat. */
function holeLabel(h: readonly Pt[]): string {
  const c = centroid(h);
  return `hole of ⌀${(loopPerimeter(h) / Math.PI).toFixed(1)} mm equivalent at (${c[0].toFixed(0)}, ${c[1].toFixed(0)}) on the flat`;
}

/** The four blank checks. Each is one finding per offending hole / bend end / flange. */
export function sheetBlankFindings(part: PartContext): GeometricFinding[] {
  const b = part.sheetBlank;
  if (!b || !(b.gaugeMm > 0) || b.outline.length < 3) return [];
  const t = b.gaugeMm;
  const out: GeometricFinding[] = [];
  const note = b.developable ? '' : ' (stretch-formed blank: distances are indicative)';

  // hole to edge
  const edgeMin = HOLE_TO_EDGE_MIN_T * t;
  b.holes.forEach((h, i) => {
    let d = Infinity;
    for (const p of h) for (let k = 0; k < b.outline.length; k++) d = Math.min(d, segDist(p, b.outline[k], b.outline[(k + 1) % b.outline.length]));
    if (d < edgeMin) {
      out.push(blankFinding(part, {
        ruleId: 'sheetmetal.blank.hole-to-edge', title: 'Hole too close to the blank edge', featureId: `BLANK:H${i + 1}:edge`,
        detail: `The ${holeLabel(h)} is ${d.toFixed(2)} mm from the blank edge against ${edgeMin.toFixed(2)} mm (${HOLE_TO_EDGE_MIN_T} × ${t.toFixed(2)} mm gauge)${note}.`,
        field: 'holeToEdgeMm', value: d, threshold: edgeMin,
        recommendation: `Move the hole at least ${edgeMin.toFixed(1)} mm in from the edge, or open it into a notch.`,
      }));
    }
  });

  // hole to bend
  const bendMin = HOLE_TO_BEND_MIN_T * t;
  b.holes.forEach((h, i) => {
    let worst: { d: number; bend: number } | null = null;
    for (const bd of b.bends) {
      const as = h.map(p => dot2(p, bd.dir)), ns = h.map(p => dot2(p, bd.nrm));
      if (Math.max(...as) < bd.aMin || Math.min(...as) > bd.aMax) continue;   // not beside this bend
      // A cut the bend ENDS at is its relief or lance slit, not a hole near it.
      if (boundsBend(h, bd, t)) continue;
      const lo = Math.min(...ns), hi = Math.max(...ns);
      const d = hi < bd.nMin ? bd.nMin - hi : lo > bd.nMax ? lo - bd.nMax : 0;
      if (!worst || d < worst.d) worst = { d, bend: bd.id };
    }
    if (worst && worst.d < bendMin) {
      out.push(blankFinding(part, {
        ruleId: 'sheetmetal.blank.hole-to-bend', title: 'Hole too close to a bend', featureId: `BLANK:H${i + 1}:bend${worst.bend}`,
        detail: worst.d === 0
          ? `The ${holeLabel(h)} lies in bend ${worst.bend}'s bend zone${note}.`
          : `The ${holeLabel(h)} is ${worst.d.toFixed(2)} mm from bend ${worst.bend}'s tangent line against ${bendMin.toFixed(2)} mm `
            + `(${HOLE_TO_BEND_MIN_T} × ${t.toFixed(2)} mm gauge)${note}.`,
        field: 'holeToBendMm', value: worst.d, threshold: bendMin,
        recommendation: `Move the hole at least ${bendMin.toFixed(1)} mm from the bend, or pierce it after forming (a further `
          + 'operation the costing does not carry).',
      }));
    }
  });

  // minimum flange, and bend relief at each end
  const flangeMin = MIN_FLANGE_T * t;
  for (const bd of b.bends) {
    const len = bd.aMax - bd.aMin;
    for (const side of [-1, 1] as const) {
      const n0 = side < 0 ? bd.nMin : bd.nMax;
      const d: Pt = [side * bd.nrm[0], side * bd.nrm[1]];
      let flange = Infinity;
      if (len > 0) {
        for (let k = 1; k <= 9; k++) {
          const a = bd.aMin + (len * k) / 10;
          const p: Pt = [bd.dir[0] * a + bd.nrm[0] * n0, bd.dir[1] * a + bd.nrm[1] * n0];
          const hit = rayHit(p, d, b.outline);
          if (hit !== null) flange = Math.min(flange, hit);
        }
      }
      if (Number.isFinite(flange) && flange < flangeMin) {
        out.push(blankFinding(part, {
          ruleId: 'sheetmetal.blank.min-flange', title: 'Flange shorter than the minimum for its gauge',
          featureId: `BLANK:B${bd.id}:${side < 0 ? 'a' : 'b'}`,
          detail: `Bend ${bd.id} (${len.toFixed(0)} mm long) has a ${flange.toFixed(2)} mm flange beyond its tangent line against `
            + `${flangeMin.toFixed(2)} mm (${MIN_FLANGE_T} × ${t.toFixed(2)} mm gauge)${note}.`,
          field: 'flangeMm', value: flange, threshold: flangeMin,
          recommendation: `Lengthen the flange to at least ${flangeMin.toFixed(1)} mm, or form it in a die that supports the short leg.`,
        }));
      }
      // relief: at each end of the bend, does the blank continue past the end on this side, with no cut at the corner?
      for (const end of [-1, 1] as const) {
        const aEnd = end < 0 ? bd.aMin : bd.aMax;
        const at = (alongOut: number, acrossOut: number): Pt => {
          const a = aEnd + end * alongOut, n = n0 + side * acrossOut;
          return [bd.dir[0] * a + bd.nrm[0] * n, bd.dir[1] * a + bd.nrm[1] * n];
        };
        const continues = inMaterial(at(2 * t, 2 * t), b);       // the sheet runs on past the bend's end
        const corner = inMaterial(at(t / 2, t / 2), b);           // …right up to the bend corner: no relief cut
        if (continues && corner) {
          out.push(blankFinding(part, {
            ruleId: 'sheetmetal.blank.bend-relief', title: 'Bend ends in the blank with no relief',
            featureId: `BLANK:B${bd.id}:${side < 0 ? 'a' : 'b'}:${end < 0 ? 'start' : 'end'}`,
            detail: `Bend ${bd.id} ends inside the blank: the sheet continues past its ${end < 0 ? 'start' : 'end'} on one side with no `
              + `cut at the corner (checked ${(t / 2).toFixed(2)} mm from the corner)${note}.`,
            field: 'reliefMm', value: 0, threshold: t,
            recommendation: `Add a bend relief at least ${t.toFixed(1)} mm wide (the gauge) and past the bend's tangent line, or end the bend at an edge.`,
          }));
        }
      }
    }
  }
  return out;
}

/** The line the report prints on what the blank checks covered. */
export function sheetBlankStatement(b: SheetBlankFacts | undefined, reported: number): string {
  if (!b) {
    return 'Hole-to-edge, hole-to-bend, minimum-flange and bend-relief checks need the developed blank; it was not available '
      + 'for this part (not a bend-measured sheet, or the unfold did not run), so they did not run.';
  }
  return `Blank checks ran on the developed blank (${b.source}): ${b.holes.length} hole(s), ${b.bends.length} straight bend(s)`
    + (b.formedRegions ? `; ${b.formedRegions} formed region(s) that are not straight bends were not judged` : '')
    + ` — ${reported} finding(s).`;
}

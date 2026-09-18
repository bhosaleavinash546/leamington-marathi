/**
 * Measure a flat blank from a DXF outline — pure TypeScript, no dependencies.
 *
 * WHY THIS EXISTS. CAPPe develops the flat blank for a formed sheet part in
 * FASTBLANK (FTI/Hexagon), whose inverse solver reverse-stamps the 3D part into
 * a flat profile and exports it as a 2D DXF. CostVision was estimating the same
 * blank as the bounding box of the FORMED part plus 5% — which on our own
 * recorded geometry overstates a bumper beam's blank by 48% and a seat bracket's
 * by 39%, and understates a deep-drawn panel, because the footprint of a formed
 * part is not its developed shape. Material is the dominant bucket on a BIW
 * stamping, so that error goes more or less straight to the part cost.
 *
 * Reading the DXF replaces the estimate with the number the business already
 * trusts. It is also the cheap option: nobody is rebuilding a one-step inverse
 * FEA solver, and nobody should.
 *
 * WHAT IT MEASURES, AND THE DISTINCTION THAT MATTERS.
 *
 *   grossAreaMm2  the OUTER profile. This is the metal you BUY — a pierced slug
 *                 is scrap you already paid for.
 *   netAreaMm2    outer minus the holes. This is the metal that ends up in the
 *                 part, and it is what reconciles against part volume ÷ gauge.
 *
 * Costing takes gross. Netting them off would quietly hand back the cost of
 * every pierced hole.
 *
 * Also measured: the outer perimeter (blanking/laser cut length), the hole
 * perimeter (piercing), and the axis-aligned bounding rectangle, which is the
 * strip-layout rectangle — FASTBLANK orients its export for nesting, so the
 * orientation it exports in is the one to measure.
 *
 * UNITS. Read from $INSUNITS. A file that says nothing is assumed to be
 * millimetres, which is what FASTBLANK writes, and the assumption is reported
 * so it is visible rather than silent. Getting this wrong is a 25x area error.
 *
 * GEOMETRY. Arcs and bulges are tessellated at 2 degrees before measuring:
 * the area error that leaves on a full circle is under a thousandth of a
 * percent, which is far inside the tolerance of everything downstream, and it
 * avoids a pile of special cases that would each be a place to be wrong. Full
 * CIRCLE entities are measured exactly, because holes are usually circles and
 * the hole area is subtracted rather than added.
 */

export interface BlankLoop {
  /** Signed area in mm² — positive counter-clockwise. */
  signedAreaMm2: number;
  perimeterMm: number;
  /** Tessellated points, for the bounding box and for containment. */
  points: Array<{ x: number; y: number }>;
}

export interface BlankMeasurement {
  /** The outer profile: the metal bought. */
  grossAreaMm2: number;
  /** Outer minus holes: the metal left in the part. */
  netAreaMm2: number;
  /** Outer profile length — the blanking or laser cut. */
  outerPerimeterMm: number;
  /** Total hole edge length — the piercing. */
  holePerimeterMm: number;
  holeCount: number;
  /** Strip-layout rectangle, in the orientation the file was exported in. */
  boundingRectMm: { lengthMm: number; widthMm: number };
  /** How much of its own bounding rectangle the blank fills, 0–1. */
  rectangleFill: number;
  units: 'mm' | 'inch';
  /** True when the file did not declare its units and millimetres were assumed. */
  unitsAssumed: boolean;
  /** Entity types that were read, with counts — what the measurement rests on. */
  entities: Record<string, number>;
  /** Anything the reader had to approximate or could not use. */
  warnings: string[];
}

interface Pt { x: number; y: number }
/** One traced curve: an edge to be chained, or an already-closed loop. */
interface Curve { pts: Pt[]; closed: boolean; exact?: { area: number; perimeter: number } }

const TESS_RAD = (2 * Math.PI) / 180;      // 2° — see the note above
/** Endpoint-joining tolerance. DXF writers round; 1 µm is far below any real gap. */
const JOIN_TOL = 1e-3;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Shoelace. Positive counter-clockwise. */
function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
  }
  return a / 2;
}

function pathLength(pts: Pt[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

/** Points along an arc, centre-angle form, excluding the start point. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const sweep = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / TESS_RAD));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/**
 * The arc a bulge describes between two polyline vertices.
 *
 * DXF stores it as bulge = tan(included angle / 4), signed by direction. The
 * algebra below is the standard inversion; it is short but not obvious, hence
 * the derivation: theta = 4·atan(b), the chord subtends theta at the centre, so
 * r = chord / (2·sin(theta/2)), and the centre sits on the chord's perpendicular
 * bisector at the sagitta distance.
 */
function bulgePoints(p0: Pt, p1: Pt, bulge: number): Pt[] {
  if (!bulge) return [p1];
  const theta = 4 * Math.atan(bulge);
  const chord = dist(p0, p1);
  if (chord === 0) return [p1];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
  // Perpendicular to the chord, pointing to the centre.
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const ux = -(p1.y - p0.y) / chord, uy = (p1.x - p0.x) / chord;
  const sgn = bulge > 0 ? 1 : -1;
  const cx = mx + sgn * h * ux, cy = my + sgn * h * uy;
  const a0 = Math.atan2(p0.y - cy, p0.x - cx);
  let a1 = Math.atan2(p1.y - cy, p1.x - cx);
  // Take the sweep the bulge's sign asks for, not the short way round.
  if (bulge > 0 && a1 < a0) a1 += 2 * Math.PI;
  if (bulge < 0 && a1 > a0) a1 -= 2 * Math.PI;
  return arcPoints(cx, cy, r, a0, a1);
}

// ─── Reading the file ────────────────────────────────────────────────────────

interface Pair { code: number; value: string }

/** DXF is group-code/value pairs, one per line, codes on the odd lines. */
function readPairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: lines[i + 1] });
  }
  return out;
}

const DEG = Math.PI / 180;

/**
 * Turn the entity section into curves.
 *
 * Only the entity types a blank profile is actually written with are read.
 * Anything else is counted in `entities` and reported, so a file that carries
 * its outline in something unexpected says so instead of measuring short.
 */
function readCurves(pairs: Pair[]): { curves: Curve[]; entities: Record<string, number>; warnings: string[] } {
  const curves: Curve[] = [];
  const entities: Record<string, number> = {};
  const warnings: string[] = [];
  const KNOWN = new Set(['LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'LINE', 'ARC', 'CIRCLE', 'SPLINE']);

  let i = 0;
  // Skip to ENTITIES; a DXF also carries BLOCKS full of geometry we must not count.
  while (i < pairs.length && !(pairs[i].code === 2 && pairs[i].value.trim() === 'ENTITIES')) i++;

  let current: string | null = null;
  let buf: Pair[] = [];
  let polyVerts: Pt[] = [];        // POLYLINE/VERTEX accumulation
  let polyBulges: number[] = [];
  let inPolyline = false;
  let polyClosed = false;

  const flush = () => {
    if (!current) return;
    const g = (code: number): number | undefined => {
      const p = buf.find(x => x.code === code);
      return p ? Number(p.value) : undefined;
    };
    const all = (code: number): number[] => buf.filter(x => x.code === code).map(x => Number(x.value));

    if (current === 'LINE') {
      const x1 = g(10), y1 = g(20), x2 = g(11), y2 = g(21);
      if ([x1, y1, x2, y2].every(v => v !== undefined)) {
        curves.push({ pts: [{ x: x1!, y: y1! }, { x: x2!, y: y2! }], closed: false });
      }
    } else if (current === 'CIRCLE') {
      const cx = g(10), cy = g(20), r = g(40);
      if (cx !== undefined && cy !== undefined && r) {
        // Exact: holes are usually circles and their area is subtracted.
        curves.push({
          pts: arcPoints(cx, cy, r, 0, 2 * Math.PI), closed: true,
          exact: { area: Math.PI * r * r, perimeter: 2 * Math.PI * r },
        });
      }
    } else if (current === 'ARC') {
      const cx = g(10), cy = g(20), r = g(40);
      let a0 = g(50), a1 = g(51);
      if (cx !== undefined && cy !== undefined && r && a0 !== undefined && a1 !== undefined) {
        a0 *= DEG; a1 *= DEG;
        if (a1 <= a0) a1 += 2 * Math.PI;                     // DXF arcs run counter-clockwise
        const start = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
        curves.push({ pts: [start, ...arcPoints(cx, cy, r, a0, a1)], closed: false });
      }
    } else if (current === 'LWPOLYLINE') {
      const xs = all(10), ys = all(20);
      // Bulges are sparse — code 42 appears only on vertices that carry one, so
      // they cannot be matched to vertices by position in a flat list. Walk the
      // pairs in order instead and attach each bulge to the vertex it follows.
      const bulges = new Array<number>(xs.length).fill(0);
      let v = -1;
      for (const p of buf) {
        if (p.code === 10) v++;
        else if (p.code === 42 && v >= 0 && v < bulges.length) bulges[v] = Number(p.value);
      }
      const closed = ((g(70) ?? 0) & 1) === 1;
      if (xs.length >= 2 && xs.length === ys.length) {
        const verts = xs.map((x, k) => ({ x, y: ys[k] }));
        curves.push({ pts: expand(verts, bulges, closed), closed });
      }
    } else if (current === 'SPLINE') {
      // Fit points if the writer left them, else control points. Either is an
      // approximation of the curve, so it is reported rather than passed off.
      const fx = all(11), fy = all(21), cx = all(10), cy = all(20);
      const xs = fx.length >= 2 ? fx : cx, ys = fx.length >= 2 ? fy : cy;
      if (xs.length >= 2 && xs.length === ys.length) {
        const closed = ((g(70) ?? 0) & 1) === 1;
        curves.push({ pts: xs.map((x, k) => ({ x, y: ys[k] })), closed });
        warnings.push('A SPLINE was read through its points rather than evaluated, so its '
          + 'contribution to area and perimeter is approximate. FASTBLANK can export the '
          + 'profile smoothed to lines and arcs, which measures exactly.');
      }
    }
    current = null; buf = [];
  };

  for (; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.code === 0) {
      const name = p.value.trim();
      if (inPolyline && (name === 'VERTEX' || name === 'SEQEND')) {
        if (current === 'VERTEX') {
          const gx = buf.find(x => x.code === 10), gy = buf.find(x => x.code === 20);
          const gb = buf.find(x => x.code === 42);
          if (gx && gy) { polyVerts.push({ x: Number(gx.value), y: Number(gy.value) }); polyBulges.push(gb ? Number(gb.value) : 0); }
        }
        current = null; buf = [];
        if (name === 'SEQEND') {
          if (polyVerts.length >= 2) curves.push({ pts: expand(polyVerts, polyBulges, polyClosed), closed: polyClosed });
          inPolyline = false; polyVerts = []; polyBulges = [];
          continue;
        }
        current = 'VERTEX';
        continue;
      }
      flush();
      if (name === 'ENDSEC') break;
      entities[name] = (entities[name] ?? 0) + 1;
      if (!KNOWN.has(name)) continue;
      if (name === 'POLYLINE') { inPolyline = true; polyVerts = []; polyBulges = []; polyClosed = false; current = 'POLYLINE'; buf = []; continue; }
      current = name; buf = [];
    } else if (current) {
      if (current === 'POLYLINE' && p.code === 70) polyClosed = (Number(p.value) & 1) === 1;
      buf.push(p);
    }
  }
  flush();

  const unread = Object.keys(entities).filter(k => !KNOWN.has(k));
  if (unread.length) {
    warnings.push(`Ignored entity types the reader does not measure: ${unread.join(', ')}. `
      + 'If the profile is drawn with these, the measurement below is not the whole outline.');
  }
  return { curves, entities, warnings };
}

/** Vertices plus bulges → a tessellated path. */
function expand(verts: Pt[], bulges: number[], closed: boolean): Pt[] {
  const out: Pt[] = [verts[0]];
  const n = verts.length;
  const last = closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const a = verts[k], b = verts[(k + 1) % n];
    out.push(...bulgePoints(a, b, bulges[k] ?? 0));
  }
  if (closed) out.pop();                      // the walk returns to the start
  return out;
}

/**
 * Join open edges end to end into closed loops.
 *
 * A DXF blank is as likely to arrive as a scatter of LINE and ARC entities as
 * one polyline — FASTBLANK smooths the profile "with tangent lines & arcs" —
 * and those entities are in no particular order and in no particular direction.
 */
function chain(curves: Curve[]): { loops: Curve[]; openCount: number } {
  const loops = curves.filter(c => c.closed);
  const open = curves.filter(c => !c.closed).map(c => ({ ...c }));
  const used = new Array(open.length).fill(false);
  let openCount = 0;

  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let pts = [...open[i].pts];
    let grew = true;
    while (grew) {
      grew = false;
      const tail = pts[pts.length - 1];
      if (dist(tail, pts[0]) <= JOIN_TOL && pts.length > 2) break;   // closed
      for (let j = 0; j < open.length; j++) {
        if (used[j]) continue;
        const c = open[j];
        const s = c.pts[0], e = c.pts[c.pts.length - 1];
        if (dist(tail, s) <= JOIN_TOL) { pts = pts.concat(c.pts.slice(1)); used[j] = true; grew = true; break; }
        if (dist(tail, e) <= JOIN_TOL) { pts = pts.concat([...c.pts].reverse().slice(1)); used[j] = true; grew = true; break; }
      }
    }
    if (pts.length > 2 && dist(pts[pts.length - 1], pts[0]) <= JOIN_TOL) {
      pts.pop();
      loops.push({ pts, closed: true });
    } else {
      openCount++;
    }
  }
  return { loops, openCount };
}

/** Is a inside b? One point suffices: blank loops do not cross each other. */
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const UNIT_NAMES: Record<number, 'mm' | 'inch'> = { 1: 'inch', 4: 'mm' };

/**
 * Measure the blank in a DXF.
 *
 * Throws on a file with no closed profile in it, rather than returning a zero
 * that would read downstream as a free part.
 */
export function measureBlankDxf(text: string): BlankMeasurement {
  const pairs = readPairs(text);

  // $INSUNITS sits in HEADER as: 9/$INSUNITS then 70/<n>.
  let units: 'mm' | 'inch' = 'mm';
  let unitsAssumed = true;
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i].code === 9 && pairs[i].value.trim() === '$INSUNITS') {
      const n = Number(pairs[i + 1].value);
      if (UNIT_NAMES[n]) { units = UNIT_NAMES[n]; unitsAssumed = false; }
      break;
    }
  }
  const scale = units === 'inch' ? 25.4 : 1;

  const { curves, entities, warnings } = readCurves(pairs);
  const { loops, openCount } = chain(curves);
  if (!loops.length) {
    throw new Error('No closed profile found in the DXF. The blank outline must be a closed '
      + 'shape — check the export is the blank profile and not a construction layer.');
  }
  if (openCount) {
    warnings.push(`${openCount} open edge${openCount === 1 ? '' : 's'} did not join into a closed `
      + 'loop and were left out. A gap in the profile means the area below is not the whole blank.');
  }

  const measured = loops.map(l => ({
    pts: l.pts.map(p => ({ x: p.x * scale, y: p.y * scale })),
    area: Math.abs(l.exact ? l.exact.area * scale * scale : signedArea(l.pts) * scale * scale),
    perimeter: (l.exact ? l.exact.perimeter : pathLength(l.pts, true)) * scale,
  }));

  // The largest loop is the outer profile; anything inside it is a hole. Loops
  // outside it are separate parts on the same sheet, which is not what a blank
  // measurement means, so they are reported rather than added in.
  measured.sort((a, b) => b.area - a.area);
  const outer = measured[0];
  const holes = measured.slice(1).filter(m => inside(m.pts[0], outer.pts));
  const strays = measured.length - 1 - holes.length;
  if (strays > 0) {
    warnings.push(`${strays} closed shape${strays === 1 ? '' : 's'} outside the outer profile `
      + 'were ignored. The file looks like it holds more than one blank.');
  }

  const xs = outer.pts.map(p => p.x), ys = outer.pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const lengthMm = Math.max(w, h), widthMm = Math.min(w, h);
  const holeArea = holes.reduce((s, x) => s + x.area, 0);

  return {
    grossAreaMm2: outer.area,
    netAreaMm2: outer.area - holeArea,
    outerPerimeterMm: outer.perimeter,
    holePerimeterMm: holes.reduce((s, x) => s + x.perimeter, 0),
    holeCount: holes.length,
    boundingRectMm: { lengthMm, widthMm },
    rectangleFill: lengthMm * widthMm > 0 ? outer.area / (lengthMm * widthMm) : 0,
    units, unitsAssumed, entities, warnings,
  };
}

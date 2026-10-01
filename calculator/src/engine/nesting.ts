/**
 * Strip nesting of a developed blank on the coil — FASTBLANK CostOptimizer's
 * "Blank Nest" step, as arithmetic on the outline.
 *
 * Material is the biggest bucket on a stamping, and what is bought is not the
 * blank but the strip: pitch × coil width per stroke. For a given outline the
 * questions are which way round it sits on the coil, how close consecutive
 * blanks can follow each other, and whether two blanks interlock (the second
 * turned 180° or mirrored) so that a non-convex shape nests into its own
 * notch. This answers them exactly on the polygon, by scanlines:
 *
 *   strip width = extent across the coil + 2 × edge margin
 *   pitch       = the smallest advance at which the next blank clears this
 *                 one by the web on every scanline
 *
 * so an L-blank laid 2-up interlocked reaches 94% utilisation where the
 * rectangle gives 72% (research/fastblank/nest.py, September 2026).
 *
 * What it does NOT decide: a 2-up layout needs a two-blank die, which costs
 * more and is a tooling decision; the result carries the 1-up and 2-up
 * figures side by side and the caller chooses. Grain direction is a rule the
 * caller can impose through `allowedAngles` — it is not derivable from an
 * outline. Nothing here is a quote; it is the geometry of the strip.
 */

export type Pt = [number, number];

export interface NestOptions {
  /** Bridge between consecutive blanks, mm. */
  webMm: number;
  /** Margin from each coil edge, mm. */
  edgeMarginMm: number;
  /** Orientation step in degrees (default 2; refined to 0.5° around the best). */
  angleStepDeg?: number;
  /** Restrict orientations (e.g. grain, or a coil that only runs one way). Degrees, 0–180. */
  allowedAngles?: number[];
  /** Coil widths available, mm — the layout must fit one; the next wider is used. */
  coilWidthsMm?: number[];
  /** Scanline spacing, mm (default: height / 80, at least 0.25). */
  scanlineMm?: number;
}

export interface NestLayout {
  layout: '1-up' | '2-up-rotated' | '2-up-mirrored';
  /** Blank rotation on the coil, degrees. */
  angleDeg: number;
  /** Advance per stroke, mm (two blanks per stroke on a 2-up). */
  pitchMm: number;
  partsPerStroke: 1 | 2;
  /** Strip width used — the coil width when one was chosen. */
  stripWidthMm: number;
  /** Extent of the blank(s) across the coil, before margins. */
  acrossMm: number;
  /** Blank area ÷ strip cell area per part. */
  utilisation: number;
  /** Strip area consumed per part, mm². */
  stripAreaPerPartMm2: number;
  /** False when `coilWidthsMm` was given and no coil takes this layout. */
  coilFits: boolean;
}

export interface NestResult {
  /** The best 1-up layout — what a single-blank die runs. */
  oneUp: NestLayout;
  /** The best 2-up layout when it beats 1-up by a margin, else null. */
  twoUp: NestLayout | null;
  /** Rectangle-on-rectangle utilisation for the same web and margin, for comparison. */
  rectangleUtilisation: number;
  blankAreaMm2: number;
  /** False when no orientation fits any of the coil widths given; the layouts then ignore them. */
  coilFits: boolean;
}

function rotate(pts: Pt[], deg: number): Pt[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function bounds(pts: Pt[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, maxX, minY, maxY };
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a) / 2;
}

/** Sorted x-intervals inside the polygon on scanline y (even–odd rule). */
function intervalsAt(pts: Pt[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x0, y0] = pts[j], [x1, y1] = pts[i];
    if ((y0 <= y) !== (y1 <= y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
  }
  xs.sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** The polygon's intervals on every line of a grid: line k sits at y0 + (k + ½)·step. */
type Grid = Array<Array<[number, number]>>;
function gridIntervals(pts: Pt[], y0: number, step: number, lines: number): Grid {
  const g: Grid = new Array(lines);
  for (let k = 0; k < lines; k++) g[k] = intervalsAt(pts, y0 + (k + 0.5) * step);
  return g;
}

/** A polygon placed on the grid: its intervals shifted `lines` grid lines up and `dx` along the coil. */
interface Placed { g: Grid; lines: number; dx: number }

/**
 * Smallest advance p ≥ pMin such that B shifted by (p, 0) clears A by `web` on
 * every grid line. The forbidden advances form a union of open intervals; the
 * answer is the first point at or above pMin outside all of them.
 */
function minPitch(A: Placed, B: Placed, web: number, pMin = 0): number {
  const forb: Array<[number, number]> = [];
  const n = A.g.length;
  for (let k = 0; k < n; k++) {
    const ka = k - A.lines, kb = k - B.lines;
    if (ka < 0 || kb < 0 || ka >= n || kb >= n) continue;
    const ia = A.g[ka], ib = B.g[kb];
    if (!ia.length || !ib.length) continue;
    for (const [a0, a1] of ia) for (const [b0, b1] of ib) {
      forb.push([a0 + A.dx - (b1 + B.dx) - web, a1 + A.dx - (b0 + B.dx) + web]);
    }
  }
  forb.sort((u, v) => u[0] - v[0]);
  let p = pMin;
  for (const [lo, hi] of forb) {
    if (hi <= p) continue;
    if (lo < p) p = hi;   // p lies inside (lo, hi) → jump to its end
  }
  return p;
}

function layoutFor(
  kind: NestLayout['layout'], A: Pt[], angle: number, area: number, opts: NestOptions, coil: (across: number) => number | null,
): NestLayout {
  const bb = bounds(A);
  const height = bb.maxY - bb.minY;
  const step = opts.scanlineMm ?? Math.max(0.25, height / 80);
  // The grid spans one blank height above and below, so an offset second blank fits on it.
  const span = Math.ceil(height / step) + 1;
  const lines = 3 * span;
  const y0 = bb.minY - span * step;
  const gA = gridIntervals(A, y0, step, lines);
  const PA: Placed = { g: gA, lines: 0, dx: 0 };
  const p11 = minPitch(PA, PA, opts.webMm);
  let pitch: number, parts: 1 | 2;
  let across = height;
  if (kind === '1-up') {
    pitch = p11;
    parts = 1;
  } else {
    // The second blank turned 180° (or mirrored), tried at a range of offsets
    // across the coil so a notch can take the other blank's leg, then advanced
    // until it clears the first; the pair repeats at the advance that clears
    // the second blank by a first again — and, since every blank also has to
    // clear the one two places back, at no less than the single-blank pitch.
    // The offset widens the strip, so the best pair is the smallest cell per part.
    const cy = (bb.minY + bb.maxY) / 2, cx = (bb.minX + bb.maxX) / 2;
    const B0: Pt[] = kind === '2-up-rotated'
      ? A.map(([x, y]) => [2 * cx - x, 2 * cy - y])
      : A.map(([x, y]) => [x, 2 * cy - y]);
    const gB = gridIntervals(B0, y0, step, lines);
    const PB0: Placed = { g: gB, lines: 0, dx: 0 };
    const p22 = minPitch(PB0, PB0, opts.webMm);
    let bestCell = Infinity;
    pitch = Infinity;
    const dyLines = Math.max(1, Math.round(span / 20));
    for (let j = -span; j <= span; j += dyLines) {
      const PB: Placed = { g: gB, lines: j, dx: 0 };
      const q = minPitch(PA, PB, opts.webMm);
      const r = minPitch({ g: gB, lines: j, dx: q }, PA, opts.webMm, q);
      const P = Math.max(r, p11, p22);
      const acrossPair = height + Math.abs(j) * step;
      const cell = P * (acrossPair + 2 * opts.edgeMarginMm);
      if (cell < bestCell) { bestCell = cell; pitch = P; across = acrossPair; }
    }
    parts = 2;
  }
  const want = across + 2 * opts.edgeMarginMm;
  const chosen = coil(want);
  const strip = chosen ?? want;
  const cell = pitch * strip;
  return {
    layout: kind, angleDeg: angle, pitchMm: pitch, partsPerStroke: parts, stripWidthMm: strip, acrossMm: across,
    utilisation: cell > 0 ? Math.min(1, (parts * area) / cell) : 0,
    stripAreaPerPartMm2: chosen == null && opts.coilWidthsMm?.length ? Infinity : parts > 0 ? cell / parts : Infinity,
    coilFits: chosen != null || !opts.coilWidthsMm?.length,
  };
}

/**
 * Nest the outline on the coil. Tries every orientation at `angleStepDeg` for
 * 1-up and both 2-up arrangements, refines the best orientations at 0.5°, and
 * returns the best 1-up and, when it saves at least 3 points of utilisation,
 * the best 2-up.
 */
export function nestOnCoil(outline: Pt[], opts: NestOptions): NestResult {
  if (outline.length < 3) throw new Error('an outline needs at least three points');
  const area = polygonArea(outline);
  // The scanlines resolve a fraction of a millimetre; a denser outline only costs time.
  const bbAll = bounds(outline);
  const tolMm = Math.max(0.05, Math.min(bbAll.maxX - bbAll.minX, bbAll.maxY - bbAll.minY) / 800);
  outline = outline.length > 240 ? simplify(outline, tolMm) : outline;
  const coil = (across: number): number | null => {
    if (!opts.coilWidthsMm?.length) return across;
    const widths = opts.coilWidthsMm.filter(w => w >= across).sort((a, b) => a - b);
    return widths.length ? widths[0] : null;
  };
  const step = opts.angleStepDeg ?? 2;
  const coarse: number[] = opts.allowedAngles?.length
    ? opts.allowedAngles.map(a => ((a % 180) + 180) % 180)
    : Array.from({ length: Math.ceil(180 / step) }, (_, i) => i * step);

  const best: Record<NestLayout['layout'], NestLayout | null> = { '1-up': null, '2-up-rotated': null, '2-up-mirrored': null };
  const consider = (kind: NestLayout['layout'], angle: number) => {
    const L = layoutFor(kind, rotate(outline, angle), angle, area, opts, coil);
    if (!best[kind] || L.stripAreaPerPartMm2 < best[kind]!.stripAreaPerPartMm2) best[kind] = L;
  };
  for (const a of coarse) for (const kind of ['1-up', '2-up-rotated', '2-up-mirrored'] as const) consider(kind, a);
  if (!opts.allowedAngles?.length) {
    for (const kind of ['1-up', '2-up-rotated', '2-up-mirrored'] as const) {
      const centre = best[kind]!.angleDeg;
      for (let d = -step; d <= step; d += 0.5) consider(kind, ((centre + d) % 180 + 180) % 180);
    }
  }
  // No orientation fits any coil offered: say so, and lay out as if unconstrained.
  if (opts.coilWidthsMm?.length && !Number.isFinite(best['1-up']!.stripAreaPerPartMm2)) {
    return { ...nestOnCoil(outline, { ...opts, coilWidthsMm: undefined }), coilFits: false };
  }
  const oneUp = best['1-up']!;
  const two = [best['2-up-rotated'], best['2-up-mirrored']].filter((x): x is NestLayout => !!x && Number.isFinite(x.stripAreaPerPartMm2))
    .sort((a, b) => a.stripAreaPerPartMm2 - b.stripAreaPerPartMm2)[0] ?? null;
  const twoUp = two && two.utilisation >= oneUp.utilisation + 0.03 ? two : null;

  // The rectangle the rules used to nest: bounding rectangle at the 1-up angle.
  const rb = bounds(rotate(outline, oneUp.angleDeg));
  const rectAcross = rb.maxY - rb.minY + 2 * opts.edgeMarginMm;
  const rectCell = (rb.maxX - rb.minX + opts.webMm) * (coil(rectAcross) ?? rectAcross);
  const rectangleUtilisation = rectCell > 0 ? Math.min(1, area / rectCell) : 0;

  return { oneUp, twoUp, rectangleUtilisation, blankAreaMm2: area, coilFits: true };
}

/**
 * Thin an outline to at most `max` points, keeping every point that turns the
 * boundary by more than a small angle — enough for nesting to a fraction of a
 * millimetre, small enough to travel in a response.
 */
export function decimateOutline(outline: Pt[], max = 600): Pt[] {
  if (outline.length <= max) return outline.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  // Douglas–Peucker-style by tolerance, increasing until under the cap.
  let tol = 0.05;
  let out = outline;
  for (let k = 0; k < 20 && out.length > max; k++) { out = simplify(outline, tol); tol *= 1.6; }
  return out.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let worst = -1, worstD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

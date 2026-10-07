/**
 * Interactive 3D CAD viewer — opens uploaded CAD like a CAD tool.
 *
 * Orbit/zoom/pan (zoom-to-cursor, double-click to orbit about a picked point),
 * canonical views, shaded+edges display (edges computed off-thread for large
 * meshes), section/clipping plane, bounding-box dimensions, and measurement
 * tools: vertex/edge-snapped distance, 3-point circle, 3-point angle — with
 * CSV export and per-file persistence. For STEP/IGES via the OCCT sidecar:
 * exact B-rep face intelligence (click a face for true type/radius/area,
 * colour by machining-surface type, hole/boss feature summary) and a body
 * panel for multi-solid files. Mesh visuals, kernel truth.
 *
 * Self-contained module: three.js is lazy-loaded, all DOM is built here
 * (cv3d-* classes in calculator.css). Two mounts share this component: the
 * standalone CAD-to-Cost view and the per-commodity inline uploader.
 */

import { parseSTLMesh } from './cad-views.js';
import { exportFilename } from '../export/filename.js';
import { sliceSection, nestLoops, sectionDxf, planeAxes, type SectionResult, type Axis as SecAxis } from './cad-section.js';
import {
  robustRange, normInRange, histogram, meshVolumeArea, VIEWER_DENSITIES, viewName, geometryChecks, rankCostItems, esc, isRoundFeature,
  type RobustRange, type ViewerIssue, type CostItem,
} from './cad-viewer-model.js';
export type { ViewerIssue, CostItem } from './cad-viewer-model.js';

type V3 = { x: number; y: number; z: number };

export interface FaceMeta {
  id: number;
  type: string;
  radiusMm: number | null;
  radius2Mm?: number | null;
  angleDeg?: number | null;
  /** cylinders: exact height/depth along the axis (mm) */
  depthMm?: number | null;
  areaCm2: number | null;
  bodyId?: number;
  hole?: boolean | null;
  /** single-ray wall thickness at the face centroid (mm); null when the ray missed */
  thicknessMm?: number | null;
}
/**
 * `triFace` holds the 1-based B-rep face index — the same id a geometric-DFM
 * finding carries — and `faces` is indexed BY that id, so `faces[triFace[t]]`
 * is the face a triangle came from. Index 0 and any face the mesher skipped are
 * null, which is why every read of `faces[...]` is guarded.
 */
export interface TessMeta {
  triFace: number[] | Uint32Array;
  faces: (FaceMeta | null)[];
  bodies: number | null;
  skippedFaces?: number;
  /** The kernel's closed-solid verdict, for the quality badge. */
  topology?: { isClosedSolid?: boolean; freeEdgeCount?: number; solidCount?: number } | null;
  bboxMm?: [number, number, number];
}

export interface MeasurementRecord {
  kind: 'dist' | 'circle' | 'angle' | 'point' | 'facedist' | 'section';
  label: string;
  /** mm for dist/circle/facedist (circle = diameter), degrees for angle, 0 for point, mm² for section */
  value: number;
  points: Array<[number, number, number]>;
}

export interface CADViewerOptions {
  compact?: boolean;
  /** Called with a JPEG data URL when the user takes a snapshot. When set, the
   *  snapshot is attached (not auto-downloaded); without it, it downloads. */
  onSnapshot?: (dataUrl: string) => void;
  /** Called whenever the measurement list changes. */
  onMeasurementsChange?: (measurements: MeasurementRecord[]) => void;
  /** Extra headers for the tessellate fetch — value or live-resolving function. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Persist measurements per file (localStorage). Default true. */
  persist?: boolean;
  /** A B-rep face was clicked in select mode — the reverse of highlightFaces. */
  onFaceSelect?: (faceId: number, face: FaceMeta | null) => void;
  /** The model finished loading; carries the kernel's quality verdict for the badge. */
  onLoaded?: (info: LoadedInfo) => void;
}

export interface LoadedInfo {
  fileName: string;
  triangles: number;
  bodies: number | null;
  /** From the tessellation sidecar; null on STL (mesh only). */
  isClosedSolid: boolean | null;
  freeEdgeCount: number | null;
  bboxMm: [number, number, number] | null;
}

export interface GuardrailBannerItem {
  code: string;
  message: string;
  blocking: boolean;
  acknowledged?: boolean;
  faceIds?: number[];
}

export interface CADViewerHandle {
  loadFile(file: File): Promise<void>;
  getMeasurements(): MeasurementRecord[];
  /**
   * Highlight a set of B-rep faces — the mechanism behind clicking a geometric
   * DFM finding. Face ids index the same map the triFace picking uses, so a
   * finding's `faceIds` can be passed straight through. An empty array clears.
   */
  highlightFaces(faceIds: number[]): void;
  /** Blocking guardrails across the top of the canvas, each with a "show me" when it has faces. */
  setGuardrails(items: GuardrailBannerItem[]): void;
  /** Draw (or clear) a machine envelope box around the part — the oversize decision made visible. */
  showEnvelope(envelopeMm: [number, number, number] | null, label?: string): void;
  /** £ per face for the cost heat-map colour mode; null clears it. */
  setFaceCosts(costs: Record<number, number> | null, extra?: { items?: CostItem[]; format?: (gbp: number) => string }): void;
  /** Manufacturability findings for the inspector (null = the viewer's own geometry checks). */
  setIssues(items: ViewerIssue[] | null): void;
  dispose(): void;
  el: HTMLElement;
}

// ── Pure measurement math (exported for unit tests) ──────────────────────────

export function dist3(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Circumcircle of 3 points in 3D → centre + radius, or null when degenerate.
 *  The collinearity test is SCALE-RELATIVE (d is a length⁴ quantity — an
 *  absolute epsilon breaks for meter-unit or huge-coordinate models). */
export function circumcircle3(p1: V3, p2: V3, p3: V3): { center: V3; radius: number } | null {
  const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
  const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
  const abab = ax * ax + ay * ay + az * az;
  const abac = ax * bx + ay * by + az * bz;
  const acac = bx * bx + by * by + bz * bz;
  const scale = abab * acac;
  const d = 2 * (abab * acac - abac * abac);
  if (scale === 0 || Math.abs(d) < 1e-10 * scale) return null; // coincident or collinear
  const s = (acac * (abab - abac)) / d;
  const t = (abab * (acac - abac)) / d;
  const center = { x: p1.x + s * ax + t * bx, y: p1.y + s * ay + t * by, z: p1.z + s * az + t * bz };
  return { center, radius: dist3(center, p1) };
}

/** Angle at p2 formed by p1–p2–p3, in degrees; null when a leg is zero-length. */
export function angle3(p1: V3, p2: V3, p3: V3): number | null {
  const ux = p1.x - p2.x, uy = p1.y - p2.y, uz = p1.z - p2.z;
  const vx = p3.x - p2.x, vy = p3.y - p2.y, vz = p3.z - p2.z;
  const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
  if (lu === 0 || lv === 0) return null;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Closest point on segment ab to point p (all V3), returned as tuple. */
export function closestPointOnSegment(p: V3, a: V3, b: V3): V3 {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  t = Math.min(1, Math.max(0, t));
  return { x: a.x + t * abx, y: a.y + t * aby, z: a.z + t * abz };
}

// ── Face-type palette (colour-by-machining-surface mode) ─────────────────────

export const FACE_COLORS: Record<string, [number, number, number]> = {
  plane:    [0.42, 0.55, 0.78], // milling faces — steel blue
  cylinder: [0.95, 0.65, 0.25], // holes / bores / turned — amber
  cone:     [0.30, 0.75, 0.68], // chamfers / tapers — teal
  sphere:   [0.72, 0.45, 0.85], // ball features — violet
  torus:    [0.85, 0.45, 0.55], // fillets — rose
  freeform: [0.65, 0.50, 0.90], // 5-axis sculpted — purple
  other:    [0.62, 0.66, 0.72],
};
export const FACE_TYPE_LABEL: Record<string, string> = {
  plane: 'Planar (mill/face)', cylinder: 'Cylindrical (drill/bore/turn)', cone: 'Conical (chamfer/taper)',
  sphere: 'Spherical', torus: 'Toroidal (fillet)', freeform: 'Freeform (5-axis)', other: 'Other',
};

// ── Draft / undercut analysis (mould/casting pull-direction shading) ─────────
export type DraftClass = 'neutral' | 'ok' | 'zero' | 'undercut';
export const DRAFT_COLORS: Record<DraftClass, [number, number, number]> = {
  neutral:  [0.60, 0.64, 0.70], // faces perpendicular to pull — no draft needed (grey)
  ok:       [0.28, 0.72, 0.46], // adequate draft — releases cleanly (green)
  zero:     [0.95, 0.66, 0.20], // near-zero draft — risky vertical wall (amber)
  undercut: [0.90, 0.30, 0.34], // undercut — cannot demould without a slide (red)
};
export const DRAFT_LABEL: Record<DraftClass, string> = {
  neutral: 'Perpendicular to pull', ok: 'Adequate draft', zero: 'Near-zero draft (wall)', undercut: 'Undercut — needs a slide',
};

// ── Wall-thickness heatmap ramp (thin = hot/red, thick = cold/blue) ──────────
export const NO_THICKNESS_COLOR: [number, number, number] = [0.55, 0.58, 0.63];
/** Map a normalised thickness t∈[0,1] (0 = thinnest, 1 = thickest) to a jet-style
 *  ramp: red → orange → yellow → green → blue — the CAD/DFM heatmap convention. */
export function thicknessColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const stops: [number, number, number][] = [
    [0.86, 0.20, 0.22], // thinnest — red (cost/mould risk)
    [0.95, 0.55, 0.20], // orange
    [0.92, 0.86, 0.25], // yellow
    [0.30, 0.72, 0.46], // green
    [0.25, 0.45, 0.90], // thickest — blue
  ];
  const p = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// ── Per-component (per-body) colour palette (assembly identification mode) ────
// A categorical palette: each body of a multi-solid assembly is painted a
// distinct, legible colour so components can be told apart at a glance. Colours
// cycle when an assembly has more bodies than the palette.
export const BODY_COLORS: [number, number, number][] = [
  [0.30, 0.56, 0.91], // blue
  [0.95, 0.61, 0.24], // orange
  [0.29, 0.72, 0.45], // green
  [0.86, 0.36, 0.42], // red
  [0.60, 0.45, 0.86], // purple
  [0.25, 0.73, 0.72], // teal
  [0.91, 0.45, 0.69], // pink
  [0.74, 0.68, 0.26], // olive
  [0.42, 0.62, 0.31], // moss
  [0.56, 0.53, 0.49], // taupe
  [0.22, 0.50, 0.63], // slate
  [0.83, 0.53, 0.25], // amber
];
/** Distinct colour for body index `i`, cycling through the palette (safe for any
 *  integer, including negatives). */
export function bodyColorRGB(i: number): [number, number, number] {
  const n = BODY_COLORS.length;
  const p = BODY_COLORS[((i % n) + n) % n];
  return [p[0], p[1], p[2]];
}

/** Classify a triangle/face by draft relative to a pull axis.
 *  `theta` is the angle between the outward normal and the pull axis:
 *  ~0/180° → perpendicular-to-pull top/bottom face (neutral); ~90° → wall.
 *  Draft = 90 − theta: positive opens toward the pull, negative is an undercut.
 *  `neutralDeg` = half-cone around the pull axis counted as top/bottom;
 *  `okDeg` = minimum positive draft to be "adequate". */
export function draftBucket(
  nx: number, ny: number, nz: number,
  dx: number, dy: number, dz: number,
  okDeg = 1, neutralDeg = 8,
): DraftClass {
  const nl = Math.hypot(nx, ny, nz) || 1, dl = Math.hypot(dx, dy, dz) || 1;
  const dot = Math.min(1, Math.max(-1, (nx * dx + ny * dy + nz * dz) / (nl * dl)));
  const theta = (Math.acos(dot) * 180) / Math.PI;
  if (theta <= neutralDeg || theta >= 180 - neutralDeg) return 'neutral';
  const draft = 90 - theta;
  if (draft >= okDeg) return 'ok';
  if (draft >= 0) return 'zero';
  return 'undercut';
}

// Measurement persistence (per file, LRU-capped)
const PERSIST_PREFIX = 'cv3d:m:';
const PERSIST_INDEX = 'cv3d:m:keys';
const PERSIST_MAX = 30;

function persistSave(fileKey: string, records: MeasurementRecord[]): void {
  try {
    const key = PERSIST_PREFIX + fileKey;
    if (records.length === 0) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify(records.map(r => ({ kind: r.kind, points: r.points }))));
    const keys: string[] = JSON.parse(localStorage.getItem(PERSIST_INDEX) ?? '[]');
    const next = [fileKey, ...keys.filter(k => k !== fileKey)];
    for (const stale of next.slice(PERSIST_MAX)) localStorage.removeItem(PERSIST_PREFIX + stale);
    localStorage.setItem(PERSIST_INDEX, JSON.stringify(next.slice(0, PERSIST_MAX)));
  } catch { /* storage full/blocked — persistence is best-effort */ }
}

function persistLoad(fileKey: string): Array<{ kind: MeasurementRecord['kind']; points: Array<[number, number, number]> }> {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_PREFIX + fileKey) ?? '[]');
  } catch { return []; }
}

// Edge overlay: meshes above this go to the worker so the main thread never freezes.
// Was 30 000: seven of eight real parts sat below it and ran EdgesGeometry on
// the main thread for 74–280 ms — the freeze the worker exists to prevent.
const EDGE_WORKER_THRESHOLD = 0;
const EDGE_ANGLE_DEG = 24;

// ── Toolbar icon set ──────────────────────────────────────────────────────────
// Consistent single-weight line icons (Lucide/Feather style) drawn in currentColor
// so they inherit the button's active/disabled state and adapt to light/dark.
const svgIcon = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON: Record<string, string> = {
  'view-iso':   svgIcon('<path d="M12 2.6 3.6 7v10L12 21.4 20.4 17V7z"/><path d="M3.6 7 12 11.5 20.4 7"/><path d="M12 11.5v9.9"/>'),
  'view-front': svgIcon('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'),
  'view-top':   svgIcon('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M4.5 9.2h15"/>'),
  'view-right': svgIcon('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M14.8 4.5v15"/>'),
  'fit':        svgIcon('<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/>'),
  'shaded':     svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M20 8 8 20" opacity=".5"/><path d="M20 13 13 20" opacity=".5"/>'),
  'wire':       svgIcon('<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>'),
  'bbox':       svgIcon('<rect x="4.5" y="4.5" width="15" height="15" rx="1" stroke-dasharray="3 2.3"/>'),
  'grid':       svgIcon('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>'),
  'faces':      svgIcon('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  'components': svgIcon('<rect x="4" y="4" width="7.5" height="7.5" rx="1.2"/><rect x="12.5" y="12.5" width="7.5" height="7.5" rx="1.2"/><path d="M11.5 7.7h3a1.8 1.8 0 0 1 1.8 1.8v3"/>'),
  'draft':      svgIcon('<path d="M4 20h16"/><path d="M4 20 16.5 4.5"/><path d="M4 20a8 8 0 0 0 2.5-5.8"/>'),
  'thickness':  svgIcon('<path d="M6 4v16M18 4v16"/><path d="M9 12h6"/><path d="M11 10l-2 2 2 2M13 10l2 2-2 2"/>'),
  'tree':       svgIcon('<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/>'),
  'holes':      svgIcon('<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.1"/>'),
  'section':    svgIcon('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 14h16"/><path d="M7 14v3.2M11 14v3.2M15 14v3.2"/>'),
  'explode':    svgIcon('<path d="M12 2v5m0 10v5M2 12h5m10 0h5"/><path d="M10 4.2 12 2l2 2.2M10 19.8 12 22l2-2.2M4.2 10 2 12l2.2 2M19.8 10 22 12l-2.2 2"/>'),
  'rotate':     svgIcon('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V9h-4.5"/>'),
  'move':       svgIcon('<path d="M12 3v18M3 12h18"/><path d="M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5"/>'),
  'select':     svgIcon('<path d="M5 3.5 10 19l2.4-6.4L19 10z"/>'),
  'distance':   svgIcon('<path d="M4 12h16"/><path d="M4 8v8M20 8v8"/><path d="M7.5 12 9.5 10M7.5 12l2 2M16.5 12l-2-2M16.5 12l-2 2"/>'),
  'radius':     svgIcon('<circle cx="12" cy="12" r="8.4"/><path d="M12 12 18.5 9"/><circle cx="12" cy="12" r="1.2"/>'),
  'angle':      svgIcon('<path d="M5 19h14"/><path d="M5 19 17.5 6"/><path d="M5 19a9 9 0 0 0 3.3-5.4"/>'),
  'point':      svgIcon('<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="1.6"/>'),
  'facedist':   svgIcon('<path d="M6 4v16M18 4v16"/><path d="M9 12h6"/><path d="M11 9.5 8.5 12l2.5 2.5M13 9.5l2.5 2.5-2.5 2.5"/>'),
  'clear':      svgIcon('<path d="M6 6 18 18M18 6 6 18"/>'),
  'snapshot':   svgIcon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13.5" r="3.2"/>'),
  'expand':     svgIcon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  'palette':    svgIcon('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.5-.9-2.5 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7C20.5 7 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.1"/><circle cx="10.5" cy="7.4" r="1.1"/><circle cx="15" cy="7.6" r="1.1"/>'),
  'inspector':  svgIcon('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M14.5 4v16"/><path d="M16.8 8h1.7M16.8 11h1.7M16.8 14h1.7"/>'),
  'keyboard':   svgIcon('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>'),
  'ortho':      svgIcon('<path d="M4 8h10v10H4z"/><path d="M4 8l6-4h10l-6 4M14 18l6-4V4"/>'),
  'cost':       svgIcon('<path d="M15.5 7.2A4 4 0 0 0 8.4 9.6V18h8"/><path d="M6.5 13.2h6.5"/>'),
};

// ── Component ─────────────────────────────────────────────────────────────────

export async function createCADViewer(host: HTMLElement, opts: CADViewerOptions = {}): Promise<CADViewerHandle> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const { createViewCube } = await import('./cad-viewcube.js');
  const { createCadNavigation } = await import('./cad-navigation.js');
  const { MeshBVH, acceleratedRaycast } = await import('three-mesh-bvh');
  const { toCreasedNormals } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  // Crease angle for smooth shading: normals are averaged across facets that meet
  // below this angle (round cylinders/fillets) and kept hard above it (real edges).
  const CREASE_ANGLE = (40 * Math.PI) / 180;
  // Adaptive resolution: supersample when the view is still (crisp edges), but
  // drop to ~device resolution while the user is orbiting so big meshes stay
  // smooth; a final crisp frame is drawn once motion settles.
  let lowRes = false;
  const pixelRatio = () => {
    const dpr = window.devicePixelRatio || 1;
    // Was min(dpr × 1.5, 2.5): on a 2× display that is 6.25× the fragments of a
    // 1:1 canvas, on top of MSAA. Native DPR, capped at 2, is crisp enough.
    return lowRes ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
  };

  // ── DOM scaffold ──
  // Model-first layout (Oct 2026 redesign, docs/ui/3d-viewer-plan-2026-10.md): the canvas owns the
  // space; tools are one floating icon dock with fly-out menus; facts live in a collapsible inspector
  // beside the canvas; a labelled view cube sits top-right. Every tool keeps its data-act id.
  const dockBtn = (act: string, icon: string, label: string, key = '', extra = '') =>
    `<button type="button" data-act="${act}" aria-label="${label}" data-tip="${label}${key ? ` · ${key}` : ''}" ${extra}>${ICON[icon]}</button>`;
  const menuBtn = (menu: string, icon: string, label: string, key = '') =>
    `<button type="button" class="cv3d-menu-trigger" data-menu="${menu}" aria-haspopup="menu" aria-expanded="false" aria-label="${label}" data-tip="${label}${key ? ` · ${key}` : ''}">${ICON[icon]}<i class="cv3d-caret" aria-hidden="true"></i></button>`;
  const item = (act: string, icon: string, label: string, key = '', role = 'menuitem') =>
    `<button type="button" role="${role}" data-act="${act}">${ICON[icon] ?? ''}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const root = document.createElement('div');
  root.className = 'cv3d' + (opts.compact ? ' cv3d--compact' : '');
  root.innerHTML = `
    <div class="cv3d-main">
    <div class="cv3d-viewport" tabindex="0" role="application" aria-label="3D model view — drag to rotate, scroll to zoom; press ? for keyboard shortcuts">
      <canvas class="cv3d-canvas"></canvas>
      <div class="cv3d-banner" style="display:none"></div>
      <div class="cv3d-titlechip"><span class="cv3d-title">No model loaded</span><span class="cv3d-badge" style="display:none"></span></div>
      <div class="cv3d-facechip" style="display:none"></div>
      <div class="cv3d-legend" style="display:none"></div>
      <div class="cv3d-tree" style="display:none">
        <div class="cv3d-tree-head">
          <button class="cv3d-tree-collapse" title="Collapse / expand the tree" aria-label="Collapse or expand the tree">${ICON['tree']}</button>
          <span class="cv3d-tree-title">Model tree</span>
          <button class="cv3d-tree-close" title="Close tree" aria-label="Close tree">${ICON['clear']}</button>
        </div>
        <div class="cv3d-tree-list"></div>
        <div class="cv3d-tree-resize" title="Drag to resize"></div>
      </div>
      <div class="cv3d-clip-panel cv3d-float" style="display:none">
        <span class="cv3d-clip-label">Section</span>
        <div class="cv3d-clip-axes">
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="x"/><span>X</span><input type="range" data-clip-slider="x" min="-100" max="100" value="0" step="1" aria-label="Section X offset"/><button type="button" class="cv3d-clip-flip" data-clip-flip="x" aria-pressed="false" aria-label="Flip the X cut — keep the other side">⇅</button><output data-clip-out="x"></output></label>
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="y"/><span>Y</span><input type="range" data-clip-slider="y" min="-100" max="100" value="0" step="1" aria-label="Section Y offset"/><button type="button" class="cv3d-clip-flip" data-clip-flip="y" aria-pressed="false" aria-label="Flip the Y cut — keep the other side">⇅</button><output data-clip-out="y"></output></label>
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="z"/><span>Z</span><input type="range" data-clip-slider="z" min="-100" max="100" value="0" step="1" aria-label="Section Z offset"/><button type="button" class="cv3d-clip-flip" data-clip-flip="z" aria-pressed="false" aria-label="Flip the Z cut — keep the other side">⇅</button><output data-clip-out="z"></output></label>
        </div>
        <button class="cv3d-clip-off" title="Turn section view off">Off</button>
      </div>
      <div class="cv3d-explode-panel cv3d-float" style="display:none">
        <span class="cv3d-clip-label">Explode</span>
        <div class="cv3d-axis-seg" data-explode-axes>
          <button data-explode-axis="radial" class="active" title="Explode radially from the centre">Radial</button>
          <button data-explode-axis="x" title="Explode along X">X</button>
          <button data-explode-axis="y" title="Explode along Y">Y</button>
          <button data-explode-axis="z" title="Explode along Z">Z</button>
        </div>
        <input type="range" class="cv3d-explode-slider" min="0" max="100" value="0" step="1" aria-label="Explode distance"/>
      </div>
      <div class="cv3d-rotate-panel cv3d-float" style="display:none">
        <span class="cv3d-clip-label">Rotate</span>
        <select class="cv3d-rotate-body" title="Component to rotate" aria-label="Component to rotate"></select>
        <label class="cv3d-clip-row"><span>X</span><input type="range" data-rot-axis="x" min="-180" max="180" value="0" step="1" aria-label="Rotate X"/></label>
        <label class="cv3d-clip-row"><span>Y</span><input type="range" data-rot-axis="y" min="-180" max="180" value="0" step="1" aria-label="Rotate Y"/></label>
        <label class="cv3d-clip-row"><span>Z</span><input type="range" data-rot-axis="z" min="-180" max="180" value="0" step="1" aria-label="Rotate Z"/></label>
        <button class="cv3d-rotate-reset" title="Reset this component's rotation">Reset</button>
      </div>
      <div class="cv3d-move-panel cv3d-float" style="display:none">
        <span class="cv3d-clip-label">Move</span>
        <select class="cv3d-move-body" title="Component to move" aria-label="Component to move"></select>
        <label class="cv3d-clip-row"><span>X</span><input type="range" data-mov-axis="x" min="-100" max="100" value="0" step="1" aria-label="Move X"/></label>
        <label class="cv3d-clip-row"><span>Y</span><input type="range" data-mov-axis="y" min="-100" max="100" value="0" step="1" aria-label="Move Y"/></label>
        <label class="cv3d-clip-row"><span>Z</span><input type="range" data-mov-axis="z" min="-100" max="100" value="0" step="1" aria-label="Move Z"/></label>
        <button class="cv3d-move-reset" title="Reset this component's position">Reset</button>
      </div>
      <div class="cv3d-hint" aria-live="polite"></div>
      <div class="cv3d-dock-wrap">
        <div class="cv3d-menu" role="menu" data-menu-for="measure" aria-label="Measure" hidden>
          ${item('tool-dist', 'distance', 'Distance', 'D')}${item('tool-circle', 'radius', 'Radius / diameter', 'R')}${item('tool-angle', 'angle', 'Angle', 'A')}${item('tool-point', 'point', 'Point (X Y Z)', 'P')}${item('tool-facedist', 'facedist', 'Face to face', 'G')}
          <div class="cv3d-menu-sep"></div>${item('clear', 'clear', 'Clear measurements', 'Del')}
        </div>
        <div class="cv3d-menu" role="menu" data-menu-for="color" aria-label="Colour by" hidden>
          <div class="cv3d-menu-cap">Colour by</div>
          ${item('color-none', 'shaded', 'Plain', '', 'menuitemradio')}${item('facecolors', 'faces', 'Face type', '', 'menuitemradio')}${item('draft', 'draft', 'Draft &amp; undercut', '', 'menuitemradio')}
          <div class="cv3d-axis-seg cv3d-draft-axes" data-draft-axes><span>Pull</span><button type="button" data-draft-axis="z" class="active">Z</button><button type="button" data-draft-axis="x">X</button><button type="button" data-draft-axis="y">Y</button></div>
          ${item('thickness', 'thickness', 'Wall thickness', '', 'menuitemradio')}${item('bodycolors', 'components', 'Components', '', 'menuitemradio')}${item('costcolors', 'cost', 'Cost on model', '', 'menuitemradio')}
        </div>
        <div class="cv3d-menu" role="menu" data-menu-for="display" aria-label="Display" hidden>
          ${item('mode-shaded', 'shaded', 'Shaded with edges', 'E', 'menuitemradio')}${item('mode-wire', 'wire', 'Wireframe', 'W', 'menuitemradio')}
          <div class="cv3d-menu-sep"></div>${item('ortho', 'ortho', 'Orthographic', 'O', 'menuitemcheckbox')}
          <div class="cv3d-menu-sep"></div>${item('bbox', 'bbox', 'Bounding box', 'B', 'menuitemcheckbox')}${item('grid', 'grid', 'Ground grid', 'G', 'menuitemcheckbox')}
        </div>
        <div class="cv3d-menu" role="menu" data-menu-for="arrange" aria-label="Assembly" hidden>
          ${item('explode', 'explode', 'Explode', '', 'menuitemcheckbox')}${item('rotate', 'rotate', 'Rotate a component', '', 'menuitemcheckbox')}${item('move', 'move', 'Move a component', '', 'menuitemcheckbox')}
        </div>
        <div class="cv3d-dock" role="toolbar" aria-label="Viewer tools">
          ${dockBtn('view-iso', 'view-iso', 'Home view', 'H')}${dockBtn('fit', 'fit', 'Fit to screen', 'F')}
          <span class="cv3d-dock-sep" aria-hidden="true"></span>
          ${dockBtn('tool-select', 'select', 'Select a face', 'Esc', 'class="active"')}${menuBtn('measure', 'distance', 'Measure', 'M')}${dockBtn('clip', 'section', 'Section', 'S')}
          <span class="cv3d-dock-sep" aria-hidden="true"></span>
          ${menuBtn('color', 'palette', 'Colour by', 'C')}${menuBtn('display', 'shaded', 'Display')}
          <span class="cv3d-dock-sep" aria-hidden="true"></span>
          ${dockBtn('tree', 'tree', 'Model tree', 'T', 'disabled')}${menuBtn('arrange', 'explode', 'Assembly')}
          <span class="cv3d-dock-sep" aria-hidden="true"></span>
          ${dockBtn('inspector', 'inspector', 'Inspector', 'I')}${dockBtn('snap', 'snapshot', opts.onSnapshot ? 'Snapshot — attach to report' : 'Snapshot — download image')}${dockBtn('maximize', 'expand', 'Full screen', 'X')}${dockBtn('shortcuts', 'keyboard', 'Keyboard shortcuts', '?')}
        </div>
      </div>
      <div class="cv3d-shortcuts" role="dialog" aria-label="Keyboard shortcuts" hidden>
        <div class="cv3d-shortcuts-head"><strong>Keyboard shortcuts</strong><button type="button" class="cv3d-shortcuts-close" aria-label="Close shortcuts">${ICON['clear']}</button></div>
        <dl>
          <dt>H</dt><dd>Home view</dd><dt>F</dt><dd>Fit to screen</dd>
          <dt>1 – 6</dt><dd>Front · Back · Top · Bottom · Left · Right</dd><dt>0</dt><dd>Isometric</dd>
          <dt>Esc</dt><dd>Select tool · cancel · exit full screen</dd>
          <dt>D R A P G</dt><dd>Distance · Radius · Angle · Point · Face to face</dd>
          <dt>Del</dt><dd>Clear measurements</dd><dt>S</dt><dd>Section</dd>
          <dt>C</dt><dd>Next colour mode</dd><dt>E · W</dt><dd>Shaded · Wireframe</dd><dt>O</dt><dd>Orthographic / perspective</dd><dt>B</dt><dd>Bounding box</dd>
          <dt>T · I</dt><dd>Model tree · Inspector</dd><dt>X</dt><dd>Full screen</dd>
          <dt>← → ↑ ↓</dt><dd>Rotate 15° (Shift: pan)</dd><dt>+ / −</dt><dd>Zoom in / out</dd>
          <dt>Drag</dt><dd>Rotate about the point under the cursor</dd><dt>Right / middle-drag</dt><dd>Pan (also Shift + drag)</dd>
          <dt>Scroll · pinch</dt><dd>Zoom at the cursor</dd><dt>Double-click</dt><dd>Centre on that point</dd>
        </dl>
      </div>
    </div>
    <aside class="cv3d-inspector" aria-label="Inspector" hidden>
      <div class="cv3d-insp-head"><strong>Inspector</strong><button type="button" class="cv3d-insp-close" aria-label="Close inspector">${ICON['clear']}</button></div>
      <div class="cv3d-insp-body"></div>
    </aside>
    </div>
    <div class="cv3d-status">
      <span class="cv3d-status-file">No file loaded</span>
      <span class="cv3d-status-dims"></span>
      <span class="cv3d-status-hint">Drag: rotate about the cursor · right-drag: pan · scroll: zoom at the cursor · double-click: centre</span>
    </div>`;
  host.appendChild(root);

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>('.cv3d-canvas');
  const viewport = $('.cv3d-viewport');
  const faceChip = $('.cv3d-facechip');
  const legendEl = $('.cv3d-legend');
  const bannerEl = $('.cv3d-banner');
  bannerEl.style.cssText = 'position:absolute;left:8px;right:120px;top:52px;z-index:6;display:none;flex-direction:column;gap:4px;pointer-events:auto';
  const treeBox = $('.cv3d-tree');
  const treeList = $('.cv3d-tree-list');
  const clipPanel = $('.cv3d-clip-panel');
  const explodePanel = $('.cv3d-explode-panel');
  const explodeSlider = $<HTMLInputElement>('.cv3d-explode-slider');
  const rotatePanel = $('.cv3d-rotate-panel');
  const rotateBodySelect = $<HTMLSelectElement>('.cv3d-rotate-body');
  const movePanel = $('.cv3d-move-panel');
  const moveBodySelect = $<HTMLSelectElement>('.cv3d-move-body');
  const statusFile = $('.cv3d-status-file');
  const statusDims = $('.cv3d-status-dims');
  const statusHintEl = $('.cv3d-status-hint');
  const hintEl = $('.cv3d-hint');
  const titleEl = $('.cv3d-title');
  const badgeEl = $('.cv3d-badge');
  const inspector = $('.cv3d-inspector');
  const inspBody = $('.cv3d-insp-body');
  const shortcutsEl = $('.cv3d-shortcuts');
  /** Status messages go to the status bar and, briefly, to a toast over the canvas. */
  let hintTimer = 0;
  const statusHint = {
    set textContent(s: string) {
      statusHintEl.textContent = s;
      hintEl.textContent = s;
      hintEl.classList.toggle('show', !!s);
      clearTimeout(hintTimer);
      if (s) hintTimer = window.setTimeout(() => hintEl.classList.remove('show'), 2600);
    },
    get textContent(): string { return statusHintEl.textContent ?? ''; },
  };

  // ── three.js scene ──
  // preserveDrawingBuffer:false lets the driver discard the buffer after compositing
  // (faster). The snapshot path stays correct because it renders synchronously right
  // before toDataURL, in the same call stack, so the buffer is still valid then.
  // logarithmicDepthBuffer distributes depth precision logarithmically — essential
  // for large models (e.g. a 4.8 m chassis) where a linear buffer z-fights and the
  // surfaces "shatter" when you zoom in close.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(pixelRatio());
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  // Theme-aware studio backdrop: a soft vertical gradient (a screen-filling background texture, so a
  // snapshot carries it too). Follows the app's light / dark switch live.
  const isDarkTheme = () => document.documentElement.getAttribute('data-theme') !== 'light';
  let darkTheme = isDarkTheme();
  let bgTexture: InstanceType<typeof THREE.CanvasTexture> | null = null;
  function applyThemeToScene(): void {
    darkTheme = isDarkTheme();
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    if (darkTheme) { grad.addColorStop(0, '#1f2630'); grad.addColorStop(1, '#0b0e12'); }
    else { grad.addColorStop(0, '#fbfcfd'); grad.addColorStop(1, '#dde3ea'); }
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    bgTexture?.dispose();
    bgTexture = new THREE.CanvasTexture(c);
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTexture;
    viewCube?.setTheme(darkTheme);
    if (grid) styleGrid(grid);
    if (shadowMat) shadowMat.opacity = darkTheme ? 0.55 : 0.32;
    for (const e of bodyEdges) if (e) (e.material as InstanceType<typeof THREE.LineBasicMaterial>).color.set(darkTheme ? 0x0a0d12 : 0x1e2733);
    invalidate();
  }

  // Lighting is direct-only (hemisphere + key + rim, set up below). An earlier
  // image-based-lighting (RoomEnvironment) pass washed the matte grey material
  // out to near-white, so it was removed to restore the solid CAD grey the user
  // preferred — the smoothness comes from creased normals, not the IBL.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  // ── orthographic projection ──
  // The perspective camera stays the navigation RIG (orbit, pan, zoom, fly-to, view cube all keep their
  // maths); in orthographic mode the scene is drawn and picked through this camera, synced from the rig
  // each frame. Its frustum is what the rig sees at the orbit target's plane, so zooming the rig in
  // shrinks it — zoom, zoom-to-cursor and orbit-about-cursor carry over unchanged.
  let ortho = (() => { try { return localStorage.getItem('cv3d-projection') === 'ortho'; } catch { return false; } })();
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
  function syncOrtho(): void {
    if (!ortho) return;
    const dist = Math.max(camera.position.distanceTo(controls.target), 1e-6);
    const halfH = dist * Math.tan((camera.fov * Math.PI) / 360);
    const halfW = halfH * camera.aspect;
    orthoCam.left = -halfW; orthoCam.right = halfW; orthoCam.top = halfH; orthoCam.bottom = -halfH;
    // Back the camera well off along the view line: in orthographic depth changes nothing on screen, and
    // a rig zoomed in close would otherwise clip the part in front of it.
    const back = partRadius * 8;
    const fwd = controls.target.clone().sub(camera.position).normalize();
    orthoCam.position.copy(controls.target).addScaledVector(fwd, -(dist + back));
    orthoCam.quaternion.copy(camera.quaternion);
    orthoCam.near = Math.max(partRadius * 1e-4, 1e-4);
    orthoCam.far = dist + back + partRadius * 12;
    orthoCam.updateProjectionMatrix();
    orthoCam.updateMatrixWorld();
  }
  /** The camera the scene is drawn and picked through. */
  function viewCam(): InstanceType<typeof THREE.PerspectiveCamera> | InstanceType<typeof THREE.OrthographicCamera> {
    if (ortho) { camera.updateMatrixWorld(); syncOrtho(); return orthoCam; }
    return camera;
  }
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  // Mouse and wheel belong to the CAD navigation below (orbit about the cursor, exact pan, eased zoom);
  // OrbitControls keeps touch (one finger rotates, two pinch / pan) and its lookAt / damping.
  (controls as unknown as { mouseButtons: Record<string, number | null> }).mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: null };

  type Vec3 = InstanceType<typeof THREE.Vector3>;
  // Labelled view cube (top-right) — click a face, edge or corner for that view.
  let viewCube: import('./cad-viewcube.js').ViewCube | null = null;
  try { viewCube = createViewCube(THREE, { size: opts.compact ? 80 : 108, margin: 12 }); } catch { viewCube = null; }
  /** Grid lines in the theme's greys. */
  function styleGrid(g: InstanceType<typeof THREE.GridHelper>): void {
    const mats = (Array.isArray(g.material) ? g.material : [g.material]) as InstanceType<typeof THREE.LineBasicMaterial>[];
    for (const m of mats) { m.transparent = true; m.opacity = darkTheme ? 0.55 : 0.8; m.vertexColors = false; m.color.set(darkTheme ? 0x3a4553 : 0xc3cbd5); m.needsUpdate = true; }
  }
  let shadowMat: InstanceType<typeof THREE.MeshBasicMaterial> | null = null;
  let shadowMesh: InstanceType<typeof THREE.Mesh> | null = null;
  /** Soft contact shadow under the part: a radial-gradient plane on the ground, cheap and always on. */
  function buildShadow(): void {
    if (shadowMesh) { removeAndDispose(partGroup, shadowMesh); shadowMesh = null; shadowMat = null; }
    if (!bodyMeshes.length) return;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,0.9)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    shadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: darkTheme ? 0.55 : 0.32 });
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(partSpan.x * 1.5 || 1, partSpan.y * 1.5 || 1), shadowMat);
    shadowMesh.position.z = -partSpan.z / 2 - partRadius * 0.015;
    shadowMesh.renderOrder = -1;
    partGroup.add(shadowMesh);
  }
  // ── camera tween: every view change glides (300 ms ease) instead of jumping ──
  let nav: import('./cad-navigation.js').CadNavigation | null = null;
  let camAnim: { p0: Vec3; p1: Vec3; t0: Vec3; t1: Vec3; start: number; dur: number } | null = null;
  function animateCamera(pos: Vec3, target: Vec3, dur = 320): void {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || dur <= 0) { nav?.stop(); camAnim = null; camera.position.copy(pos); controls.target.copy(target); controls.update(); invalidate(); return; }
    nav?.stop();
    camAnim = { p0: camera.position.clone(), p1: pos.clone(), t0: controls.target.clone(), t1: target.clone(), start: performance.now(), dur };
    invalidate();
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(1, 2, 1.5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.35);
  rimLight.position.set(-1.5, -0.5, -1);
  scene.add(rimLight);

  // Part group is rotated so CAD Z-up displays upright (three.js is Y-up).
  const partGroup = new THREE.Group();
  partGroup.rotation.x = -Math.PI / 2;
  scene.add(partGroup);
  const overlayGroup = new THREE.Group(); // measurements & selection, world space
  scene.add(overlayGroup);

  type Mesh3 = InstanceType<typeof THREE.Mesh>;
  type Line3 = InstanceType<typeof THREE.LineSegments>;
  type Sprite3 = InstanceType<typeof THREE.Sprite>;
  type Obj3 = InstanceType<typeof THREE.Object3D>;
  type Mat3 = InstanceType<typeof THREE.MeshStandardMaterial>;

  let bodyMeshes: Mesh3[] = [];
  let bodyEdges: Array<Line3 | null> = [];
  let bodyMats: Mat3[] = [];
  let grid: InstanceType<typeof THREE.GridHelper> | null = null;
  let bboxHelper: InstanceType<typeof THREE.Box3Helper> | null = null;
  let bboxLabels: Sprite3[] = [];
  let highlight: Mesh3 | null = null;
  /** Exact B-rep edges from the tessellation frame (single-body models use them directly). */
  let serverEdges: Float32Array | null = null;
  /** Per-body highlight overlays, parented to the body mesh so explode/move/rotate carry them. */
  let highlightParts: Mesh3[] = [];
  let envelopeHelper: InstanceType<typeof THREE.Box3Helper> | null = null;
  let envelopeLabel: InstanceType<typeof THREE.Sprite> | null = null;
  let faceCosts: Record<number, number> | null = null;
  /** The engine's costed feature lines (label, faces, £) for the inspector's ranking. */
  let costItems: CostItem[] = [];
  /** £ (GBP) → display-currency text; the host app passes its own so the viewer never prints a bare £. */
  let fmtMoney: (gbp: number) => string = (gbp) => `£${gbp.toFixed(2)}`;
  /** DFM findings from the host (costed); when null the viewer's own geometry checks are listed. */
  let hostIssues: ViewerIssue[] | null = null;
  let partStats: { volumeMm3: number | null; areaMm2: number } | null = null;
  let densityId = (() => { try { return localStorage.getItem('cv3d-density') ?? 'steel'; } catch { return 'steel'; } })();
  /** Inspector "Selection" section content (escaped HTML), mirrored by the face chip when it is closed. */
  let selectionHtml = '';
  type ColorMode = 'none' | 'facetype' | 'draft' | 'thickness' | 'body' | 'cost';
  let colorMode: ColorMode = 'none';
  let lastLoadedInfo: LoadedInfo | null = null;
  let meta: TessMeta | null = null;
  /**
   * `meta.faces` is indexed by face id and therefore sparse — index 0 and any
   * face the mesher skipped are null. Everything that ITERATES faces (counts,
   * type histograms, feature grouping) wants the real ones; everything that
   * LOOKS UP a face by id still goes through `meta.faces[id]`.
   */
  let faceList: FaceMeta[] = [];
  let triFaceAll: Uint32Array | null = null;   // reordered per-triangle face ids
  let masterPositions: Float32Array | null = null; // reordered, centred positions
  let partRadius = 1;
  let partSpan = { x: 0, y: 0, z: 0 };
  /** The file's coordinates of the centred origin — add it to report a position in model coordinates. */
  let modelOrigin: [number, number, number] = [0, 0, 0];
  let edgesOn = true;
  let bodyVisible: boolean[] = [];
  let fileKey = '';
  let disposed = false;
  let loadSeq = 0;
  let maximized = false;
  let draftAxis: 'x' | 'y' | 'z' = 'z'; // moulding/casting pull defaults to part Z
  let thicknessRange: RobustRange | null = null;
  let explodeFactor = 0;
  let explodeAxis: 'radial' | 'x' | 'y' | 'z' = 'radial';
  let bodyExplodeDir: Array<InstanceType<typeof THREE.Vector3>> = []; // per-body explode vector (dir × relative distance)
  let bodyCentroid: Array<InstanceType<typeof THREE.Vector3>> = [];   // per-body centroid (part space) — rotation pivot
  let bodyRot: Array<{ x: number; y: number; z: number }> = [];       // per-body rotation in degrees
  let bodyMove: Array<{ x: number; y: number; z: number }> = [];      // per-body translation (mm, part space)
  let gridOn = true;

  // ── resource disposal helpers ──
  function disposeMaterialDeep(m: unknown): void {
    const mat = m as { map?: { dispose(): void } | null; dispose(): void };
    mat.map?.dispose();
    mat.dispose();
  }
  function disposeObject(o: Obj3): void {
    const any = o as unknown as { geometry?: { dispose(): void }; material?: unknown };
    any.geometry?.dispose();
    if (any.material) {
      if (Array.isArray(any.material)) any.material.forEach(disposeMaterialDeep);
      else disposeMaterialDeep(any.material);
    }
  }
  function removeAndDispose(parent: Obj3, o: Obj3 | null): void {
    if (!o) return;
    parent.remove(o);
    disposeObject(o);
  }

  function resolveHeaders(): Record<string, string> {
    return typeof opts.headers === 'function' ? opts.headers() : (opts.headers ?? {});
  }

  // ── edge overlay worker (shared, lazily created; falls back to sync) ──
  let edgeWorker: Worker | null | undefined; // undefined = untried, null = unavailable
  // One listener, replies routed by job id. Each call used to attach its own
  // listener and resolve on the FIRST message, so on a multi-body model every
  // pending body received body 1's edges and later replies were dropped.
  const edgeJobs = new Map<number, { resolve: (p: Float32Array) => void; fallback: Float32Array }>();
  let edgeJobSeq = 0;
  function computeEdgesAsync(positions: Float32Array): Promise<Float32Array> {
    if (positions.length / 9 <= EDGE_WORKER_THRESHOLD) return Promise.resolve(computeEdgesSync(positions));
    if (edgeWorker === undefined) {
      try {
        edgeWorker = new Worker(new URL('./cad-edges-worker.ts', import.meta.url), { type: 'module' });
        edgeWorker.addEventListener('message', (ev: MessageEvent<{ id?: number; positions?: Float32Array; error?: string }>) => {
          const job = ev.data.id != null ? edgeJobs.get(ev.data.id) : undefined;
          if (!job) return;
          edgeJobs.delete(ev.data.id!);
          job.resolve(ev.data.positions ?? computeEdgesSync(job.fallback));
        });
        edgeWorker.addEventListener('error', () => {
          for (const [id, job] of edgeJobs) { edgeJobs.delete(id); job.resolve(computeEdgesSync(job.fallback)); }
        });
      } catch { edgeWorker = null; }
    }
    if (!edgeWorker) return Promise.resolve(computeEdgesSync(positions));
    const worker = edgeWorker;
    return new Promise((resolve) => {
      const id = ++edgeJobSeq;
      edgeJobs.set(id, { resolve, fallback: positions });
      const copy = positions.slice(); // keep the original for the mesh
      worker.postMessage({ id, positions: copy, angleDeg: EDGE_ANGLE_DEG }, [copy.buffer]);
    });
  }
  // ── picking index (three-mesh-bvh), built per body in a worker ──
  let bvhWorker: Worker | null | undefined;
  const bvhJobs = new Map<number, (d: { bvh?: unknown; error?: string }) => void>();
  let bvhJobSeq = 0;
  /** True once every body's index has landed — picking is then sub-millisecond at any size. */
  let bvhReady = false;
  function buildPickIndex(isStale: () => boolean): void {
    bvhReady = false;
    root.dataset.pickIndex = 'building';
    const meshes = bodyMeshes.slice();
    if (!meshes.length) return;
    if (bvhWorker === undefined) {
      try {
        bvhWorker = new Worker(new URL('./cad-bvh-worker.ts', import.meta.url), { type: 'module' });
        bvhWorker.addEventListener('message', (ev: MessageEvent<{ id: number; bvh?: unknown; error?: string }>) => {
          const cb = bvhJobs.get(ev.data.id);
          if (cb) { bvhJobs.delete(ev.data.id); cb(ev.data); }
        });
        bvhWorker.addEventListener('error', () => { for (const [id, cb] of bvhJobs) { bvhJobs.delete(id); cb({ error: 'worker failed' }); } });
      } catch { bvhWorker = null; }
    }
    if (!bvhWorker) return; // brute-force raycasts still work, just slower on big models
    let pending = meshes.length;
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const copy = (geo.getAttribute('position').array as Float32Array).slice();
      const id = ++bvhJobSeq;
      bvhJobs.set(id, (d) => {
        if (!isStale() && !d.error && d.bvh && geo.getAttribute('position')) {
          try {
            const bvh = MeshBVH.deserialize(d.bvh as never, geo, { setIndex: false });
            (geo as unknown as { boundsTree: unknown }).boundsTree = bvh;
            mesh.raycast = acceleratedRaycast as never;
          } catch { /* keep the brute-force raycast */ }
        }
        if (--pending === 0 && !isStale()) { bvhReady = true; root.dataset.pickIndex = 'ready'; }
      });
      bvhWorker.postMessage({ id, positions: copy }, [copy.buffer]);
    }
  }
  function computeEdgesSync(positions: Float32Array): Float32Array {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const eg = new THREE.EdgesGeometry(g, EDGE_ANGLE_DEG);
    const out = (eg.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).array as Float32Array;
    g.dispose();
    eg.dispose();
    return out;
  }

  // ── labels (canvas sprites, constant screen size) ──
  function makeLabel(text: string, accent = false): Sprite3 {
    const pad = 10, fs = 30;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
    c.height = fs + pad * 1.6;
    const ctx2 = c.getContext('2d')!;
    ctx2.fillStyle = accent ? 'rgba(37,99,235,0.92)' : 'rgba(15,18,22,0.88)';
    ctx2.beginPath();
    ctx2.roundRect(0, 0, c.width, c.height, 10);
    ctx2.fill();
    ctx2.strokeStyle = 'rgba(255,255,255,0.25)'; ctx2.lineWidth = 2; ctx2.stroke();
    ctx2.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    ctx2.fillStyle = '#fff';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, pad, c.height / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    (sp as unknown as { __aspect: number }).__aspect = c.width / c.height;
    sp.renderOrder = 999;
    return sp;
  }
  function scaleLabels(): void {
    // Sprites are rescaled every frame; walk the two groups without building an array.
    // In orthographic every depth is drawn at the target plane's scale.
    const orthoD = ortho ? camera.position.distanceTo(controls.target) : 0;
    const scaleOne = (sp: Sprite3) => {
      const d = ortho ? orthoD : camera.position.distanceTo(sp.position);
      const h = d * 0.045 * (opts.compact ? 1.4 : 1);
      const aspect = (sp as unknown as { __aspect?: number }).__aspect ?? 4;
      sp.scale.set(h * aspect, h, 1);
    };
    for (const sp of bboxLabels) scaleOne(sp as Sprite3);
    for (const o of overlayGroup.children) if ((o as { isSprite?: boolean }).isSprite) scaleOne(o as Sprite3);
  }

  // ── render loop — on-demand ──────────────────────────────────────────────
  // The scene is static between interactions, so instead of rendering 60 fps
  // forever we render only when something changes: invalidate() schedules one
  // frame; camera motion (controls 'change'), resize, load, and every scene
  // mutation call it. The frame keeps re-scheduling itself while OrbitControls
  // damping or a camera glide (animateCamera) is still settling, then stops.
  let renderPending = false;
  let renderHandle = 0;
  function invalidate(): void {
    if (renderPending || disposed) return;
    renderPending = true;
    renderHandle = requestAnimationFrame(frame);
  }
  function applyPixelRatio(): void {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
  }
  let lastFrameAt = performance.now();
  function frame(): void {
    renderPending = false;
    if (disposed) return;
    let animating = false;
    if (camAnim) {
      const k = Math.min(1, (performance.now() - camAnim.start) / camAnim.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease-in-out cubic
      camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
      controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
      if (k >= 1) camAnim = null; else animating = true;
    }
    const nowMs = performance.now();
    if (nav?.update(nowMs - lastFrameAt)) animating = true;
    lastFrameAt = nowMs;
    const moved = controls.update(); // true while damping is still settling
    scaleLabels();
    placePivotMarker();
    renderer.render(scene, viewCam());
    viewCube?.render(renderer, camera, controls.target);
    // Exposed for automation (and nothing else): '1' while the camera is still gliding / coasting.
    const movingNow = animating || moved ? '1' : '0';
    if (root.dataset.moving !== movingNow) root.dataset.moving = movingNow;
    if (animating || moved) {
      invalidate();                 // keep going until motion settles
    } else if (lowRes) {
      lowRes = false; applyPixelRatio(); invalidate(); // one crisp frame once still
    }
  }

  function resize(): void {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(pixelRatio()); // tracks monitor moves
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(viewport);

  // On-demand drivers: repaint on any camera change; drop resolution while the
  // user is actively dragging so large meshes stay responsive.
  controls.addEventListener('change', invalidate);
  controls.addEventListener('start', () => { lowRes = true; applyPixelRatio(); invalidate(); });

  // ── CAD navigation (mouse / pen / wheel) ──
  const pivotEl = document.createElement('div');
  pivotEl.className = 'cv3d-pivot';
  pivotEl.setAttribute('aria-hidden', 'true');
  viewport.appendChild(pivotEl);
  nav = createCadNavigation(THREE, {
    camera, target: controls.target, dom: canvas,
    rayCamera: () => viewCam(),
    orthographic: () => ortho,
    pick: (x, y) => pickWorld(x, y),
    radius: () => partRadius,
    changed: invalidate,
    started: () => { lowRes = true; applyPixelRatio(); canvas.classList.add('cv3d-canvas--dragging'); invalidate(); },
    ended: () => { canvas.classList.remove('cv3d-canvas--dragging'); invalidate(); },
    blocked: (ev) => !!viewCube?.contains(ev, canvas),
  });
  /** The orbit pivot, drawn while rotating so the user sees what the part turns about. */
  function placePivotMarker(): void {
    const p = nav?.activePivot();
    if (!p) { pivotEl.classList.remove('show'); return; }
    const v = p.clone().project(viewCam());
    pivotEl.style.transform = `translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight}px)`;
    pivotEl.classList.add('show');
  }

  // ── views ──
  function setView(dir: readonly [number, number, number], instant = false): void {
    const len = Math.hypot(...dir) || 1;
    // Fit the bounding sphere into the NARROWER half-angle of the frustum: the
    // vertical fov, or the horizontal one when the viewport is tall. A fixed
    // 2.6 radii ignored aspect and overflowed wide parts in narrow hosts.
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const half = Math.min(vFov, hFov) / 2;
    const d = Math.max(partRadius / Math.sin(half) * 1.08, partRadius * 1.2);
    const pos = new THREE.Vector3((dir[0] / len) * d, (dir[1] / len) * d, (dir[2] / len) * d);
    // A straight top / bottom view needs a tiny offset or OrbitControls' up-vector flips.
    if (Math.abs(pos.x) < 1e-6 && Math.abs(pos.z) < 1e-6) pos.z = d * 1e-4;
    animateCamera(pos, new THREE.Vector3(0, 0, 0), instant ? 0 : 320);
  }
  /** Fit keeps the current viewing direction (Home resets it to isometric). */
  const fit = () => {
    const dirNow = camera.position.clone().sub(controls.target);
    setView(dirNow.lengthSq() > 0 ? [dirNow.x, dirNow.y, dirNow.z] : [1, 0.8, 1]);
  };

  /** Frustum must track part size — fixed planes blank out metre-scale parts.
   *  With the logarithmic depth buffer a wide near..far range keeps full precision,
   *  so near can sit close (deep zoom without clipping) while far still clears the
   *  whole part. */
  function updateFrustum(): void {
    camera.near = Math.max(partRadius / 5000, 0.001);
    camera.far = partRadius * 100;
    camera.updateProjectionMatrix();
  }

  // ── clipping / section planes (independent X/Y/Z) ──
  type Axis = 'x' | 'y' | 'z';
  // Part-space axis → world-space direction (partGroup is rotated -90° on X):
  // part X → world +X · part Y → world −Z · part Z → world +Y
  const AXIS_WORLD: Record<Axis, [number, number, number]> = {
    x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0],
  };
  /** `flip`: keep the material ABOVE the plane (coord ≥ offset) instead of below. */
  const clipState: Record<Axis, { on: boolean; off: number; flip: boolean }> = {
    x: { on: false, off: 0, flip: false }, y: { on: false, off: 0, flip: false }, z: { on: false, off: 0, flip: false },
  };
  const clipPlanes: Record<Axis, InstanceType<typeof THREE.Plane>> = {
    x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    y: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    z: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  };
  function activeClipPlanes(): InstanceType<typeof THREE.Plane>[] {
    const out: InstanceType<typeof THREE.Plane>[] = [];
    for (const a of ['x', 'y', 'z'] as Axis[]) {
      if (!clipState[a].on) continue;
      const [nx, ny, nz] = AXIS_WORLD[a];
      const offset = (clipState[a].off / 100) * partRadius;
      // keep fragments where axis·p ≤ offset (slider slides the cut through the part); flipped: ≥ offset
      const sgn = clipState[a].flip ? -1 : 1;
      clipPlanes[a].normal.set(-nx * sgn, -ny * sgn, -nz * sgn);
      clipPlanes[a].constant = offset * sgn;
      out.push(clipPlanes[a]);
    }
    return out;
  }
  function applyClipping(): void {
    const active = activeClipPlanes();
    const planes = active.length ? active : null;
    for (const m of bodyMats) m.clippingPlanes = planes;
    for (const e of bodyEdges) if (e) (e.material as InstanceType<typeof THREE.LineBasicMaterial>).clippingPlanes = planes;
    if (highlight) (highlight.material as InstanceType<typeof THREE.MeshBasicMaterial>).clippingPlanes = planes;
    scheduleSection();
    invalidate();
  }

  // ── section measurement: cut-face area, drawn as a hatched cap (cad-section.ts) ──
  const AXES: Axis[] = ['x', 'y', 'z'];
  const AXIS_INDEX: Record<Axis, SecAxis> = { x: 0, y: 1, z: 2 };
  let sections: SectionResult[] = [];
  const capGroup = new THREE.Group();
  partGroup.add(capGroup);
  let hatchTex: InstanceType<typeof THREE.CanvasTexture> | null = null;
  let sectionRaf = 0;
  /** Recompute at most once a frame while a slider is dragged. */
  function scheduleSection(): void {
    if (sectionRaf) return;
    sectionRaf = requestAnimationFrame(() => { sectionRaf = 0; updateSections(); });
  }
  /** Where an axis plane sits, in the centred part coordinates the mesh uses. */
  const planeAt = (a: Axis) => (clipState[a].off / 100) * partRadius;
  /** Turn a plane on with its cut face toward the camera (keep the far side), as CAD tools do. */
  function faceCutToCamera(a: Axis): void {
    const [nx, ny, nz] = AXIS_WORLD[a];
    const toCam = camera.position.clone().sub(controls.target);
    // keeping coord ≤ offset shows a face whose outward normal is +axis — visible when the camera is on the + side
    clipState[a].flip = toCam.x * nx + toCam.y * ny + toCam.z * nz < 0;
    syncFlipButtons();
  }
  function syncFlipButtons(): void {
    for (const a of AXES) {
      const b = clipPanel.querySelector<HTMLButtonElement>(`[data-clip-flip="${a}"]`);
      if (b) { b.setAttribute('aria-pressed', String(clipState[a].flip)); b.title = clipState[a].flip ? 'Keeping the material above the plane — click to keep below' : 'Keeping the material below the plane — click to keep above'; }
    }
  }
  function hatchTexture(): InstanceType<typeof THREE.CanvasTexture> {
    if (hatchTex) return hatchTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2b544'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(120, 60, 0, 0.55)'; g.lineWidth = 5;
    for (let k = -64; k <= 128; k += 21) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
    hatchTex = new THREE.CanvasTexture(c);
    hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping;
    hatchTex.colorSpace = THREE.SRGBColorSpace;
    return hatchTex;
  }
  function clearCaps(): void {
    for (const ch of [...capGroup.children]) removeAndDispose(capGroup, ch as Obj3);
  }
  function updateSections(): void {
    clearCaps();
    const active = AXES.filter(a => clipState[a].on);
    if (!active.length || !bodyMeshes.length) { sections = []; renderClipReadouts(); renderInspector(); invalidate(); return; }
    // Visible bodies, where they now are (explode / move / rotate), in part coordinates.
    const bodies = bodyMeshes.map((m, i) => {
      if (!bodyVisible[i]) return null;
      m.updateMatrix();
      const identity = m.matrix.equals(new THREE.Matrix4());
      return { positions: m.geometry.getAttribute('position').array as Float32Array, matrix: identity ? null : Array.from(m.matrix.elements) as number[] };
    }).filter((b): b is { positions: Float32Array; matrix: number[] | null } => !!b);
    sections = active.map(a => sliceSection(bodies, AXIS_INDEX[a], planeAt(a),
      active.filter(o => o !== a).map(o => ({ axis: AXIS_INDEX[o], at: planeAt(o), keepAbove: clipState[o].flip }))));
    // Caps: the same loops the area came from. The cap is clipped by the OTHER planes only.
    const tile = Math.max(partRadius / 10, 0.5);
    for (const sec of sections) {
      const [ua, va] = planeAxes(sec.axis);
      const others = activeClipPlanes().filter(pl => pl !== clipPlanes[AXES[sec.axis]]);
      const place = (geo: InstanceType<typeof THREE.BufferGeometry>) => {
        const pos = geo.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const u = arr[i * 3], v = arr[i * 3 + 1];
          const out = [0, 0, 0]; out[ua] = u; out[va] = v; out[sec.axis] = sec.at;
          arr[i * 3] = out[0]; arr[i * 3 + 1] = out[1]; arr[i * 3 + 2] = out[2];
        }
        pos.needsUpdate = true;
        geo.computeBoundingSphere();
      };
      for (const shp of nestLoops(sec.loops)) {
        const shape = new THREE.Shape(shp.outer.map(([u, v]) => new THREE.Vector2(u, v)));
        for (const h of shp.holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
        const geo = new THREE.ShapeGeometry(shape);
        place(geo);
        const tex = hatchTexture();
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, clippingPlanes: others.length ? others : null });
        tex.repeat.set(1 / tile, 1 / tile);
        const cap = new THREE.Mesh(geo, mat);
        cap.renderOrder = 2;
        cap.userData.sectionCap = true;
        capGroup.add(cap);
      }
      for (const l of sec.loops) {
        const pts = l.pts.map(([u, v]) => { const o = [0, 0, 0]; o[ua] = u; o[va] = v; o[sec.axis] = sec.at; return new THREE.Vector3(o[0], o[1], o[2]); });
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: l.signedArea > 0 ? 0x7a3d00 : 0x1d4ed8, clippingPlanes: others.length ? others : null }));
        line.renderOrder = 3;
        capGroup.add(line);
      }
    }
    renderClipReadouts();
    renderInspector();
    invalidate();
  }
  const fmtArea = (mm2: number) => `${mm2.toLocaleString(undefined, { maximumFractionDigits: mm2 < 100 ? 2 : 1 })} mm²`;
  /** Model coordinate of a plane (the file's own coordinates, as the CAD system shows them). */
  const modelAt = (sec: SectionResult) => sec.at + modelOrigin[sec.axis];
  function renderClipReadouts(): void {
    for (const a of AXES) {
      const out = clipPanel.querySelector<HTMLOutputElement>(`[data-clip-out="${a}"]`);
      if (!out) continue;
      const sec = sections.find(s => AXES[s.axis] === a);
      out.textContent = !clipState[a].on ? '' : sec
        ? `${modelAt(sec).toFixed(2)} mm · ${sec.openChains && !sec.loops.length ? 'open cut' : fmtArea(sec.areaMm2)}`
        : `${(planeAt(a) + modelOrigin[AXIS_INDEX[a]]).toFixed(2)} mm`;
    }
  }
  function sectionLabel(sec: SectionResult): string {
    return `▭ Section ${'XYZ'[sec.axis]} = ${modelAt(sec).toFixed(2)} mm — ${fmtArea(sec.areaMm2)} (perimeter ${sec.perimeterMm.toFixed(1)} mm)`;
  }
  function addSectionMeasurement(i: number): void {
    const sec = sections[i];
    if (!sec) return;
    const p = [0, 0, 0] as [number, number, number]; p[sec.axis] = modelAt(sec);
    measurements.push({ record: { kind: 'section', label: sectionLabel(sec), value: sec.areaMm2, points: [p] }, objects: [] });
    measurementsChanged();
    statusHint.textContent = 'Section area added to measurements';
  }
  function downloadSectionDxf(i: number): void {
    const sec = sections[i];
    if (!sec) return;
    const shifted: SectionResult = { ...sec, loops: sec.loops.map(l => {
      const [ua, va] = planeAxes(sec.axis);
      return { ...l, pts: l.pts.map(([u, v]) => [u + modelOrigin[ua], v + modelOrigin[va]] as [number, number]) };
    }), at: modelAt(sec) };
    const blob = new Blob([sectionDxf(shifted)], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename(`section-${'xyz'[sec.axis]}`, null, 'dxf');
    a.click();
    URL.revokeObjectURL(a.href);
    statusHint.textContent = 'Section profile downloaded (DXF)';
  }

  // ── load ──
  async function loadFile(file: File): Promise<void> {
    const mySeq = ++loadSeq;
    const stale = () => disposed || mySeq !== loadSeq;
    meta = null;
    faceList = [];
    serverEdges = null; // an STL after a STEP must not inherit the STEP's edges
    let stlBuf: ArrayBuffer;
    if (/\.stl$/i.test(file.name)) {
      stlBuf = await file.arrayBuffer();
      if (stale()) return;
    } else if (/\.(stp|step|igs|iges)$/i.test(file.name)) {
      statusFile.textContent = `Tessellating ${file.name}…`;
      const fd = new FormData();
      fd.append('cadFile', file);
      const aborter = new AbortController();
      // Outer safety net — kept longer than the server's own timeout (default
      // 300 s) so the server's structured error surfaces before the client gives
      // up. Large STEP assemblies can take minutes to mesh.
      const CLIENT_TESS_TIMEOUT_MS = 330_000;
      const timer = setTimeout(() => aborter.abort(new DOMException(`Tessellation timed out after ${CLIENT_TESS_TIMEOUT_MS / 1000} s`, 'TimeoutError')), CLIENT_TESS_TIMEOUT_MS);
      let resp: Response;
      try {
        resp = await fetch('/api/cad/tessellate?meta=bin', {
          method: 'POST', headers: resolveHeaders(), body: fd, signal: aborter.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (stale()) return;
        statusFile.textContent = `Cannot open ${file.name}: ${err instanceof Error ? err.message : 'network error'}`;
        throw err;
      }
      clearTimeout(timer);
      if (stale()) return;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })) as { error?: string };
        if (stale()) return;
        statusFile.textContent = `Cannot open ${file.name}: ${err.error ?? resp.status}`;
        throw new Error(err.error ?? `tessellation failed (${resp.status})`);
      }
      // binary frame: [u32 headerLen][header JSON][raw STL][triFace u32 array]
      const frame = await resp.arrayBuffer();
      if (stale()) return;
      const dv = new DataView(frame);
      const headerLen = dv.getUint32(0, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(frame, 4, headerLen))) as {
        stlBytes: number; triFaceCount: number; faces: FaceMeta[]; bodies: number | null; skippedFaces: number;
        edgeFloatCount?: number; topology?: unknown; bboxMm?: [number, number, number];
      };
      stlBuf = frame.slice(4 + headerLen, 4 + headerLen + header.stlBytes);
      const triOff = 4 + headerLen + header.stlBytes;
      const triFace = new Uint32Array(header.triFaceCount);
      for (let i = 0; i < header.triFaceCount; i++) triFace[i] = dv.getUint32(triOff + i * 4, true);
      // True B-rep edges follow (exact feature edges from the kernel — no
      // client-side dihedral guess needed when they are present).
      const edgeOff = triOff + header.triFaceCount * 4;
      const nEdgeFloats = header.edgeFloatCount ?? 0;
      serverEdges = nEdgeFloats > 0 && edgeOff + nEdgeFloats * 4 <= frame.byteLength
        ? new Float32Array(frame.slice(edgeOff, edgeOff + nEdgeFloats * 4)) : null;
      meta = { triFace, faces: header.faces, bodies: header.bodies, skippedFaces: header.skippedFaces,
        topology: (header.topology ?? null) as TessMeta['topology'], bboxMm: header.bboxMm };
      faceList = meta.faces.filter((f): f is FaceMeta => f != null);
    } else {
      statusFile.textContent = 'Unsupported format (STEP/IGES/STL). Parasolid/JT need a licensed kernel — export STEP instead.';
      throw new Error('unsupported format');
    }

    const { positions, triangles } = parseSTLMesh(stlBuf);

    // ── degenerate-input guard: refuse NaN/empty meshes instead of rendering garbage ──
    if (triangles === 0) {
      statusFile.textContent = `${file.name}: mesh contains no triangles`;
      throw new Error('empty mesh');
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let allFinite = true;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      // NaN fails every < / > comparison, so it would sail past min/max
      // tracking — test finiteness explicitly (x+y+z is non-finite if any is).
      if (!Number.isFinite(x + y + z)) { allFinite = false; break; }
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!allFinite) {
      statusFile.textContent = `${file.name}: mesh contains non-finite vertices — file is corrupt`;
      throw new Error('non-finite mesh');
    }

    // reset previous scene objects (dispose GPU resources, not just detach)
    clearMeasurements(false);
    clearHighlight();
    for (const m of bodyMeshes) removeAndDispose(partGroup, m);
    for (const e of bodyEdges) if (e) removeAndDispose(partGroup, e);
    bodyMeshes = []; bodyEdges = []; bodyMats = []; bodyVisible = [];
    removeAndDispose(partGroup, grid); grid = null;
    if (bboxHelper) { removeAndDispose(partGroup, bboxHelper); bboxHelper = null; }
    bboxLabels.forEach(l => removeAndDispose(scene, l)); bboxLabels = [];

    // centre at origin
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    modelOrigin = [cx, cy, cz]; // the viewer works centred; positions are reported in the file's own coordinates
    partSpan = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    partRadius = Math.hypot(partSpan.x, partSpan.y, partSpan.z) / 2 || 1;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx; positions[i + 1] -= cy; positions[i + 2] -= cz;
    }
    // The kernel's exact edges arrive in the file's own coordinates — move them
    // with the mesh, or they float off the part as a ghost outline (any part not
    // modelled about the origin).
    if (serverEdges) {
      for (let i = 0; i + 2 < serverEdges.length; i += 3) {
        serverEdges[i] -= cx; serverEdges[i + 1] -= cy; serverEdges[i + 2] -= cz;
      }
    }

    // ── group triangles by body (stable) so each body is a contiguous mesh ──
    const srcTriFace = meta ? meta.triFace : null;
    const faceOf = (t: number) => (srcTriFace ? Number(srcTriFace[t]) : 0);
    const bodyOf = (t: number) => (meta ? (meta.faces[faceOf(t)]?.bodyId ?? 0) : 0);
    const bodyIds = new Set<number>();
    for (let t = 0; t < triangles; t++) bodyIds.add(bodyOf(t));
    const bodyList = [...bodyIds].sort((a, b) => a - b);
    const bodyIndex = new Map(bodyList.map((b, i) => [b, i]));

    const order = new Uint32Array(triangles);
    {
      const counts = new Array(bodyList.length).fill(0);
      for (let t = 0; t < triangles; t++) counts[bodyIndex.get(bodyOf(t))!]++;
      const starts = new Array(bodyList.length).fill(0);
      for (let i = 1; i < bodyList.length; i++) starts[i] = starts[i - 1] + counts[i - 1];
      const cursor = [...starts];
      for (let t = 0; t < triangles; t++) order[cursor[bodyIndex.get(bodyOf(t))!]++] = t;
      masterPositions = new Float32Array(triangles * 9);
      triFaceAll = new Uint32Array(triangles);
      for (let i = 0; i < triangles; i++) {
        const src = order[i];
        masterPositions.set(positions.subarray(src * 9, src * 9 + 9), i * 9);
        triFaceAll[i] = faceOf(src);
      }
      // build one mesh + edge overlay per body
      let triCursor = 0;
      for (let bi = 0; bi < bodyList.length; bi++) {
        const nTris = counts[bi];
        const slice = masterPositions.subarray(triCursor * 9, (triCursor + nTris) * 9);
        const raw = new THREE.BufferGeometry();
        // A view onto the reordered master buffer, not a copy: one fewer full
        // copy of the mesh in the heap per body (toCreasedNormals still emits
        // its own position + normal buffers).
        raw.setAttribute('position', new THREE.BufferAttribute(slice, 3));
        // Creased normals = smooth shading on curved faces, crisp normals at real
        // edges (the fix for the faceted "low-def" look). Preserves triangle order,
        // so the face-id/colour buffers stay aligned.
        const geometry = toCreasedNormals(raw, CREASE_ANGLE);
        if (geometry !== raw) raw.dispose();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        // Solid matte CAD grey (the look the user preferred). Direct-light only —
        // no IBL env map, which had washed this to near-white.
        const mat = new THREE.MeshStandardMaterial({ color: 0xaeb6c2, metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.userData = { triOffset: triCursor, bodySlot: bi };
        partGroup.add(mesh);
        bodyMeshes.push(mesh);
        bodyMats.push(mat);
        bodyEdges.push(null);
        bodyVisible.push(true);
        triCursor += nTris;
      }
    }

    // edge overlays — exact kernel edges when the frame carried them and the
    // model is one body (they are whole-model, so a multi-body explode would
    // leave them behind); otherwise the worker, per body, replies by job id.
    bodyMeshes.forEach((mesh, bi) => {
      const pos = (mesh.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).array as Float32Array;
      const exact = serverEdges && bodyMeshes.length === 1 ? Promise.resolve(serverEdges) : computeEdgesAsync(pos);
      void exact.then((edgePositions) => {
        if (stale()) return;
        const eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
        const line = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: darkTheme ? 0x0a0d12 : 0x1e2733, transparent: true, opacity: 0.8 }));
        line.visible = edgesOn && bodyVisible[bi];
        partGroup.add(line);
        bodyEdges[bi] = line;
        applyClipping();
      });
    });

    buildPickIndex(stale);

    const gridSize = Math.max(partSpan.x, partSpan.y) * 2.2 || 10;
    grid = new THREE.GridHelper(gridSize, 20, 0x9aa4b0, 0xdde2e8);
    styleGrid(grid);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -partSpan.z / 2 - partRadius * 0.02;
    grid.visible = gridOn;
    partGroup.add(grid);
    buildShadow();

    buildBBox();
    updateFrustum();

    const bodies = meta?.bodies;
    const topo = meta?.topology ?? null;
    // The badge reads the kernel's verdict, not the old `openShell` flag that
    // said "open" on every plain solid.
    const bodyText = topo && topo.isClosedSolid === false
      ? `⚠ not a closed solid (${topo.freeEdgeCount ?? '?'} free edge(s)) — costing refused`
      : bodies == null ? (bodyMeshes.length === 1 ? '1 body' : `${bodyMeshes.length} bodies`)
      : bodies === 0 ? '⚠ surface model (no closed solid)'
      : `${bodies} ${bodies === 1 ? 'body' : 'bodies'}${topo?.isClosedSolid ? ' · closed solid' : ''}`;
    lastLoadedInfo = {
      fileName: file.name, triangles, bodies: bodies ?? null,
      isClosedSolid: topo ? (topo.isClosedSolid ?? null) : null,
      freeEdgeCount: topo ? (topo.freeEdgeCount ?? null) : null,
      bboxMm: [partSpan.x, partSpan.y, partSpan.z],
    };
    try { opts.onLoaded?.(lastLoadedInfo); } catch { /* listener errors must not break the load */ }
    const skippedText = meta?.skippedFaces ? ` · ⚠ ${meta.skippedFaces} faces unmeshed` : '';
    statusFile.textContent = `${file.name} · ${triangles.toLocaleString()} triangles${meta ? ` · ${faceList.length} faces` : ''} · ${bodyText}${skippedText}`;
    statusDims.textContent = `X ${partSpan.x.toFixed(2)} · Y ${partSpan.y.toFixed(2)} · Z ${partSpan.z.toFixed(2)} mm`;

    titleEl.textContent = file.name;
    titleEl.title = file.name;
    badgeEl.style.display = '';
    const surfaceOnly = (topo && topo.isClosedSolid === false) || bodies === 0;
    badgeEl.className = 'cv3d-badge ' + (surfaceOnly ? 'cv3d-badge--warn' : topo?.isClosedSolid ? 'cv3d-badge--ok' : 'cv3d-badge--info');
    badgeEl.textContent = surfaceOnly ? 'Not a closed solid' : topo?.isClosedSolid ? 'Closed solid' : meta ? 'B-rep' : 'Mesh only';

    // Tools that need B-rep data or several bodies are HIDDEN (disabled) on a model that cannot use them.
    const enable = (act: string, on: boolean, why: string) => {
      const b = root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
      if (b) { b.disabled = !on; b.title = on ? '' : why; }
    };
    enable('facecolors', !!meta, 'Face types need STEP/IGES (B-rep) — STL is mesh-only');
    enable('tree', !!meta, 'Model tree needs STEP/IGES (B-rep) — STL is mesh-only');
    enable('explode', bodyMeshes.length >= 2, 'Exploded view needs a multi-body model');
    enable('bodycolors', bodyMeshes.length >= 2, 'Component colours need a multi-body assembly');
    enable('rotate', bodyMeshes.length >= 1, '');
    enable('move', bodyMeshes.length >= 1, '');
    // wall-thickness heatmap: enabled only when the sidecar carries per-face thickness. The colour scale
    // is the area-weighted 5th–95th percentile — single-ray outliers no longer flatten it to one colour.
    const thkFaces = faceList.filter(f => typeof f.thicknessMm === 'number' && f.thicknessMm > 0);
    thicknessRange = robustRange(thkFaces.map(f => f.thicknessMm as number), thkFaces.map(f => f.areaCm2 ?? 1));
    enable('thickness', !!thicknessRange, 'Wall thickness needs STEP/IGES (B-rep) — STL is mesh-only');
    if ((colorMode === 'facetype' && !meta) || (colorMode === 'thickness' && !thicknessRange) || (colorMode === 'body' && bodyMeshes.length < 2)) colorMode = 'none';
    // Mesh volume / area for the inspector (exact on a closed mesh).
    partStats = meshVolumeArea(masterPositions!, topo ? topo.isClosedSolid !== false : true);

    // reset section + explode + rotate state for the new part
    explodeFactor = 0; explodeSlider.value = '0';
    bodyRot = bodyMeshes.map(() => ({ x: 0, y: 0, z: 0 }));
    bodyMove = bodyMeshes.map(() => ({ x: 0, y: 0, z: 0 }));
    (['x', 'y', 'z'] as const).forEach(a => {
      clipState[a].on = false; clipState[a].off = 0; clipState[a].flip = false;
      const cb = clipPanel.querySelector(`input[data-clip-axis="${a}"]`) as HTMLInputElement | null; if (cb) cb.checked = false;
      const sl = clipPanel.querySelector(`input[data-clip-slider="${a}"]`) as HTMLInputElement | null; if (sl) sl.value = '0';
    });

    buildFeatureGroups();
    computeExplodeDirs();
    buildRotatePanel();
    buildMovePanel();
    applyBodyTransforms(); // clear any stale explode/rotation/move offsets
    if (treeBox.style.display !== 'none') buildTreePanel();
    applyColorMode(); // reapply active face-type / draft / component shading to the new meshes
    applyClipping();

    resize();
    setView([1, 0.8, 1], true);
    renderInspector();
    syncDock();

    // restore persisted measurements for this exact file
    fileKey = `${file.name}|${file.size}`;
    if (opts.persist !== false) {
      for (const saved of persistLoad(fileKey)) {
        const pts = saved.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        if (saved.kind === 'dist' && pts.length === 2) completeDistance(pts, false);
        if (saved.kind === 'circle' && pts.length === 3) completeCircle(pts, false);
        if (saved.kind === 'angle' && pts.length === 3) completeAngle(pts, false);
        if (saved.kind === 'point' && pts.length === 1) completePoint(pts[0], false);
        // 'facedist' is not restorable — it needs the captured face normals
      }
      if (measurements.length) statusHint.textContent = `${measurements.length} saved measurement${measurements.length > 1 ? 's' : ''} restored`;
    }
  }

  let bboxOn = false;
  function buildBBox(): void {
    if (bboxHelper) { removeAndDispose(partGroup, bboxHelper); bboxHelper = null; }
    bboxLabels.forEach(l => removeAndDispose(scene, l)); bboxLabels = [];
    if (!bodyMeshes.length) return;
    const bb = new THREE.Box3();
    for (const m of bodyMeshes) bb.union(m.geometry.boundingBox!);
    bboxHelper = new THREE.Box3Helper(bb, new THREE.Color(0x4f8ef7));
    bboxHelper.visible = bboxOn;
    partGroup.add(bboxHelper);
    partGroup.updateMatrixWorld(true);
    const mk = (txt: string, local: Vec3) => {
      const sp = makeLabel(txt, true);
      sp.position.copy(local.applyMatrix4(partGroup.matrixWorld));
      sp.visible = bboxOn;
      scene.add(sp);
      bboxLabels.push(sp);
    };
    mk(`X ${partSpan.x.toFixed(2)} mm`, new THREE.Vector3(0, bb.min.y - partRadius * 0.08, bb.min.z));
    mk(`Y ${partSpan.y.toFixed(2)} mm`, new THREE.Vector3(bb.min.x - partRadius * 0.08, 0, bb.min.z));
    mk(`Z ${partSpan.z.toFixed(2)} mm`, new THREE.Vector3(bb.min.x - partRadius * 0.08, bb.min.y, 0));
  }

  // ── bodies panel (multi-solid files) ──
  // Kept hidden: the Model Tree's Bodies section now carries the same per-body
  // visibility checkboxes, so the floating top-right panel was redundant clutter.


  function setBodyVisible(i: number, vis: boolean): void {
    bodyVisible[i] = vis;
    bodyMeshes[i].visible = vis;
    const e = bodyEdges[i];
    if (e) e.visible = vis && edgesOn;
    if (AXES.some(a => clipState[a].on)) scheduleSection(); // a hidden body is not cut
  }

  // ── model tree (bodies · features · faces by type) ──
  let treeTypeIds: Map<string, number[]> | null = null;
  function buildTreePanel(): void {
    treeList.innerHTML = '';
    treeTypeIds = null;
    if (!bodyMeshes.length) { treeList.innerHTML = '<div class="cv3d-tree-row">No model loaded</div>'; return; }
    // Each section is a native <details> so it collapses/expands like a CATIA/NX
    // spec tree — the Bodies section starts collapsed for big assemblies so 250+
    // rows don't fill the panel; the list scrolls either way.
    const bodiesOpen = bodyMeshes.length <= 24 ? 'open' : '';
    const parts: string[] = [];
    parts.push(
      `<details class="cv3d-tree-sec" ${bodiesOpen}><summary>Bodies · ${bodyMeshes.length}</summary>` +
      bodyMeshes.map((_, i) =>
        `<label class="cv3d-tree-row cv3d-tree-body"><input type="checkbox" data-tbody="${i}" ${bodyVisible[i] ? 'checked' : ''}/> Body ${i + 1}</label>`).join('') +
      `</details>`);
    if (featureGroups.length) {
      parts.push(
        `<details class="cv3d-tree-sec" open><summary>Features · ${featureGroups.length}</summary>` +
        featureGroups.map((g, i) =>
          `<div class="cv3d-tree-row cv3d-tree-click" data-tfeat="${i}">${g.kind === 'hole' ? '◎' : '⬤'} ${g.kind === 'hole' ? 'Hole' : 'Boss'} Ø${g.diaMm.toFixed(1)}${g.depthMm != null ? `×${g.depthMm.toFixed(1)}` : ''} · ${g.faceIds.length}</div>`).join('') +
        `</details>`);
    }
    if (meta) {
      const byType = new Map<string, number[]>();
      for (const f of faceList) { if (!byType.has(f.type)) byType.set(f.type, []); byType.get(f.type)!.push(f.id); }
      treeTypeIds = byType;
      const typesSorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
      parts.push(
        `<details class="cv3d-tree-sec" open><summary>Faces by type · ${faceList.length}</summary>` +
        typesSorted.map(([t, ids]) =>
          `<div class="cv3d-tree-row cv3d-tree-click" data-ttype="${t}"><i style="background:${rgbCss(FACE_COLORS[t] ?? FACE_COLORS.other)}"></i>${FACE_TYPE_LABEL[t] ?? t} · ${ids.length}</div>`).join('') +
        `</details>`);
    } else {
      parts.push('<div class="cv3d-tree-row">Face tree needs STEP/IGES (B-rep) — STL is mesh-only</div>');
    }
    treeList.innerHTML = parts.join('');
    treeList.querySelectorAll('input[data-tbody]').forEach(cb => cb.addEventListener('change', () => {
      const i = Number((cb as HTMLInputElement).dataset.tbody);
      setBodyVisible(i, (cb as HTMLInputElement).checked);
    }));
    treeList.querySelectorAll('[data-tfeat]').forEach(row => row.addEventListener('click', () => {
      const g = featureGroups[Number((row as HTMLElement).dataset.tfeat)];
      if (!g) return;
      showFaces(g.faceIds, `<strong>${g.faceIds.length} × ${g.kind === 'hole' ? 'hole / bore' : 'boss / shaft'} Ø ${g.diaMm.toFixed(2)} mm</strong>`);
    }));
    treeList.querySelectorAll('[data-ttype]').forEach(row => row.addEventListener('click', () => {
      const t = (row as HTMLElement).dataset.ttype!;
      const ids = treeTypeIds?.get(t);
      if (!ids) return;
      highlightFaces(new Set(ids));
      setSelection(`<strong>${ids.length} × ${esc(FACE_TYPE_LABEL[t] ?? t)}</strong>`);
    }));
  }

  // ── exploded view + per-component rotation (multi-body / assemblies) ──
  const DEG2RAD = Math.PI / 180;
  /** Record each body's centroid (rotation pivot) once per load, then derive the
   *  explode direction for the active axis. */
  function computeExplodeDirs(): void {
    bodyCentroid = bodyMeshes.map(mesh => {
      const bb = mesh.geometry.boundingBox;
      return (bb ? bb.getCenter(new THREE.Vector3()) : new THREE.Vector3());
    });
    updateExplodeDirs();
  }
  /** Per-body explode vector for the active axis. Radial = outward unit vector.
   *  X/Y/Z = along that axis, signed by the body's side, with magnitude scaled by
   *  how far the body sits from the axis centre so parts fan out without piling up. */
  function updateExplodeDirs(): void {
    if (explodeAxis === 'radial') {
      bodyExplodeDir = bodyCentroid.map(c => c.lengthSq() > 1e-9 ? c.clone().normalize() : new THREE.Vector3(0, 0, 1));
      return;
    }
    const key = explodeAxis;
    const comps = bodyCentroid.map(c => c[key]);
    const maxAbs = Math.max(1e-6, ...comps.map(Math.abs));
    bodyExplodeDir = comps.map(comp => {
      const v = new THREE.Vector3();
      v[key] = (comp >= 0 ? 1 : -1) * (Math.abs(comp) / maxAbs || 1);
      return v;
    });
  }
  /** Apply explode offset + per-body rotation (about the body's own centroid) to
   *  every body mesh and its edge overlay. Rotating about the centroid keeps the
   *  component in place while it spins; picking still works via the world matrix. */
  function applyBodyTransforms(): void {
    const dist = explodeFactor * partRadius * 1.4;
    for (let i = 0; i < bodyMeshes.length; i++) {
      const c = bodyCentroid[i] ?? new THREE.Vector3();
      const off = (bodyExplodeDir[i] ?? new THREE.Vector3()).clone().multiplyScalar(dist);
      const r = bodyRot[i] ?? { x: 0, y: 0, z: 0 };
      const mv = bodyMove[i] ?? { x: 0, y: 0, z: 0 };
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * DEG2RAD, r.y * DEG2RAD, r.z * DEG2RAD));
      // displayed = R·(v − c) + c + off + move  ⇒  position = c − R·c + off + move, quaternion = R.
      // move/off/rot are per-body, so manipulating one component never disturbs the others.
      const pos = c.clone().sub(c.clone().applyQuaternion(q)).add(off).add(new THREE.Vector3(mv.x, mv.y, mv.z));
      bodyMeshes[i].quaternion.copy(q);
      bodyMeshes[i].position.copy(pos);
      const e = bodyEdges[i];
      if (e) { e.quaternion.copy(q); e.position.copy(pos); }
    }
    if (AXES.some(a => clipState[a].on)) scheduleSection(); // the cut follows a moved / exploded body
    invalidate();
  }
  /** (Re)build the component picker in the rotate panel and sync the sliders to
   *  the currently-selected body's rotation. */
  function buildRotatePanel(): void {
    const prev = rotateBodySelect.value;
    rotateBodySelect.innerHTML = bodyMeshes.map((_, i) => `<option value="${i}">Body ${i + 1}</option>`).join('');
    if (prev && Number(prev) < bodyMeshes.length) rotateBodySelect.value = prev;
    syncRotateSliders();
  }
  function selectedRotateBody(): number {
    const i = Number(rotateBodySelect.value);
    return Number.isFinite(i) && i >= 0 && i < bodyMeshes.length ? i : 0;
  }
  function syncRotateSliders(): void {
    const r = bodyRot[selectedRotateBody()] ?? { x: 0, y: 0, z: 0 };
    (['x', 'y', 'z'] as const).forEach(a => {
      const sl = rotatePanel.querySelector(`input[data-rot-axis="${a}"]`) as HTMLInputElement | null;
      if (sl) sl.value = String(r[a]);
    });
  }
  // ── per-component move (translate) — mirrors rotate, isolated to one body ──
  function buildMovePanel(): void {
    const prev = moveBodySelect.value;
    moveBodySelect.innerHTML = bodyMeshes.map((_, i) => `<option value="${i}">Body ${i + 1}</option>`).join('');
    if (prev && Number(prev) < bodyMeshes.length) moveBodySelect.value = prev;
    syncMoveSliders();
  }
  function selectedMoveBody(): number {
    const i = Number(moveBodySelect.value);
    return Number.isFinite(i) && i >= 0 && i < bodyMeshes.length ? i : 0;
  }
  /** Sliders are −100..100 → ±partRadius of translation along each part axis. */
  function syncMoveSliders(): void {
    const mv = bodyMove[selectedMoveBody()] ?? { x: 0, y: 0, z: 0 };
    const denom = partRadius || 1;
    (['x', 'y', 'z'] as const).forEach(a => {
      const sl = movePanel.querySelector(`input[data-mov-axis="${a}"]`) as HTMLInputElement | null;
      if (sl) sl.value = String(Math.round((mv[a] / denom) * 100));
    });
  }

  // ── features panel (holes & bosses from exact B-rep data) ──
  interface FeatureGroup { kind: 'hole' | 'boss'; diaMm: number; depthMm: number | null; faceIds: number[] }
  let featureGroups: FeatureGroup[] = [];
  function buildFeatureGroups(): void {
    featureGroups = [];
    if (!meta) return;
    const groups = new Map<string, FeatureGroup>();
    for (const f of faceList) {
      // Round features only — an edge fillet is a quarter-cylinder, not a hole (isRoundFeature).
      if (f.type !== 'cylinder' || f.radiusMm == null || f.hole == null || !isRoundFeature(f)) continue;
      const kind = f.hole ? 'hole' : 'boss';
      const dia = Math.round(f.radiusMm * 2 * 100) / 100;
      const depth = f.depthMm != null ? Math.round(f.depthMm * 10) / 10 : null;
      const key = `${kind}:${dia}:${depth ?? '?'}`;
      if (!groups.has(key)) groups.set(key, { kind, diaMm: dia, depthMm: depth, faceIds: [] });
      groups.get(key)!.faceIds.push(f.id);
    }
    featureGroups = [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.diaMm - b.diaMm);
  }

  // ── picking / tools ──
  type Tool = 'select' | 'dist' | 'circle' | 'angle' | 'point' | 'facedist';
  let tool: Tool = 'select';
  let picks: Vec3[] = [];
  let pickMarkers: Mesh3[] = [];
  let pickNormals: Vec3[] = []; // world-space face normals captured for face-to-face measure
  const raycaster = new THREE.Raycaster();

  function screenToNDC(ev: { clientX: number; clientY: number }): InstanceType<typeof THREE.Vector2> {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Hits under the pointer, nearest first — BVH-accelerated once the index is built, and never on
   *  geometry a section plane has cut away (a click through the cut used to pick the hidden part). */
  function raycastMeshes(ev: { clientX: number; clientY: number }) {
    raycaster.setFromCamera(screenToNDC(ev as MouseEvent), viewCam());
    const hits = raycaster.intersectObjects(bodyMeshes.filter(m => m.visible), false);
    const planes = activeClipPlanes();
    return planes.length ? hits.filter(h => planes.every(pl => pl.distanceToPoint(h.point) >= -1e-6)) : hits;
  }
  /** World point under a client position, or null over empty space (navigation pivot / zoom anchor). */
  function pickWorld(clientX: number, clientY: number): Vec3 | null {
    if (!bodyMeshes.length) return null;
    // Without the index a pick on a multi-million-triangle model costs 80–240 ms: navigation then falls
    // back to the orbit target rather than stall the first frame of a drag.
    if (!bvhReady && (masterPositions?.length ?? 0) / 9 > 400_000) return null;
    return raycastMeshes({ clientX, clientY })[0]?.point.clone() ?? null;
  }

  /** Snap the hit to the nearest triangle VERTEX (≤14 px) or EDGE (≤10 px). */
  function snapPoint(hit: { point: Vec3; face: { a: number; b: number; c: number } | null; object: Obj3 }, ev: PointerEvent): Vec3 {
    if (!hit.face) return hit.point.clone();
    const mesh = hit.object as Mesh3;
    const pos = mesh.geometry.getAttribute('position');
    const r = canvas.getBoundingClientRect();
    const screenDist = (world: Vec3) => {
      const p = world.clone().project(viewCam());
      return Math.hypot(((p.x + 1) / 2) * r.width - (ev.clientX - r.left), ((1 - p.y) / 2) * r.height - (ev.clientY - r.top));
    };
    const verts = [hit.face.a, hit.face.b, hit.face.c].map(idx =>
      new THREE.Vector3().fromBufferAttribute(pos as never, idx).applyMatrix4(mesh.matrixWorld));
    // vertex snap first (strongest intent)
    let best = hit.point.clone(); let bestPx = 14;
    for (const v of verts) {
      const px = screenDist(v);
      if (px < bestPx) { bestPx = px; best = v.clone(); }
    }
    if (bestPx < 14) return best;
    // then edge snap — closest point on each triangle edge
    bestPx = 10;
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const cp = closestPointOnSegment(hit.point, verts[a], verts[b]);
      const v = new THREE.Vector3(cp.x, cp.y, cp.z);
      const px = screenDist(v);
      if (px < bestPx) { bestPx = px; best = v; }
    }
    return best;
  }

  function addMarker(p: Vec3): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(partRadius * 0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false }),
    );
    m.renderOrder = 998;
    m.position.copy(p);
    overlayGroup.add(m);
    pickMarkers.push(m);
    invalidate();
  }

  interface Measurement { record: MeasurementRecord; objects: Obj3[] }
  const measurements: Measurement[] = [];

  function measurementRecords(): MeasurementRecord[] {
    return measurements.map(m => m.record);
  }
  function measurementsChanged(): void {
    if (opts.persist !== false && fileKey) persistSave(fileKey, measurementRecords());
    opts.onMeasurementsChange?.(measurementRecords());
    renderMeasureList();
    invalidate();
  }

  function renderMeasureList(): void {
    // Measurements live in the inspector; opening it on the first one keeps the result in view.
    if (measurements.length && inspector.hidden && !opts.compact) setInspector(true);
    else renderInspector();
  }

  function exportCSV(): void {
    const rows = [['type', 'label', 'value', 'unit', 'p1x', 'p1y', 'p1z', 'p2x', 'p2y', 'p2z', 'p3x', 'p3y', 'p3z']];
    for (const m of measurements) {
      const flat = m.record.points.flat().map(v => v.toFixed(4));
      while (flat.length < 9) flat.push('');
      rows.push([m.record.kind, `"${m.record.label.replace(/"/g, '""')}"`,
        m.record.value.toFixed(4), m.record.kind === 'angle' ? 'deg' : 'mm', ...flat]);
    }
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename('cad-measurements', null, 'csv');
    a.click();
    URL.revokeObjectURL(a.href);
    statusHint.textContent = `${measurements.length} measurement${measurements.length === 1 ? '' : 's'} exported to CSV`;
  }

  function finishPicks(): void {
    picks = [];
    pickNormals = [];
    pickMarkers.forEach(m => removeAndDispose(overlayGroup, m));
    pickMarkers = [];
    invalidate();
  }

  function clearMeasurements(notify = true): void {
    measurements.forEach(m => m.objects.forEach(o => removeAndDispose(overlayGroup, o)));
    measurements.length = 0;
    finishPicks();
    clearHighlight();
    if (notify) measurementsChanged();
    else renderMeasureList();
  }

  function clearHighlight(): void {
    if (highlight) { removeAndDispose(overlayGroup, highlight); highlight = null; }
    for (const h of highlightParts) { h.parent?.remove(h); disposeObject(h); }
    highlightParts = [];
    faceChip.style.display = 'none';
    if (selectionHtml) { selectionHtml = ''; renderInspector(); }
    invalidate();
  }

  const toTuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

  function consumePickMarkers(n: number): Mesh3[] {
    const ends = pickMarkers.slice(-n);
    pickMarkers = pickMarkers.filter(m => !ends.includes(m));
    return ends;
  }

  function completeDistance(pts: Vec3[], interactive = true): void {
    const [a, b] = pts;
    const mm = a.distanceTo(b);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false }));
    line.renderOrder = 997;
    const label = makeLabel(`${mm.toFixed(2)} mm`);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    const ends = interactive ? consumePickMarkers(2) : [];
    overlayGroup.add(line, label);
    // world Δz = part ΔY and world Δy = part ΔZ (partGroup is rotated -90° on X)
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), dz = Math.abs(a.z - b.z);
    measurements.push({
      record: { kind: 'dist', label: `↔ ${mm.toFixed(2)} mm  (ΔX ${dx.toFixed(1)} · ΔY ${dz.toFixed(1)} · ΔZ ${dy.toFixed(1)})`, value: mm, points: [toTuple(a), toTuple(b)] },
      objects: [line, label, ...ends],
    });
    if (interactive) { measurementsChanged(); picks = []; } else renderMeasureList();
  }

  function completeCircle(pts: Vec3[], interactive = true): void {
    const [p1, p2, p3] = pts;
    const res = circumcircle3(p1, p2, p3);
    const ends = interactive ? consumePickMarkers(3) : [];
    if (!res) {
      if (interactive) { statusHint.textContent = 'Points are collinear — pick 3 points around the rim'; ends.forEach(m => removeAndDispose(overlayGroup, m)); picks = []; }
      return;
    }
    const { center, radius } = res;
    const cV = new THREE.Vector3(center.x, center.y, center.z);
    const n = new THREE.Vector3().subVectors(p2, p1).cross(new THREE.Vector3().subVectors(p3, p1)).normalize();
    const u = new THREE.Vector3().subVectors(p1, cV).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const pts72: Vec3[] = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      pts72.push(cV.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius));
    }
    const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts72), new THREE.LineBasicMaterial({ color: 0x35d07f, depthTest: false }));
    circle.renderOrder = 997;
    const label = makeLabel(`Ø ${(radius * 2).toFixed(2)} · R ${radius.toFixed(2)} mm`);
    label.position.copy(cV);
    overlayGroup.add(circle, label);
    measurements.push({
      record: { kind: 'circle', label: `◯ Ø ${(radius * 2).toFixed(2)} mm (R ${radius.toFixed(2)})`, value: radius * 2, points: [toTuple(p1), toTuple(p2), toTuple(p3)] },
      objects: [circle, label, ...ends],
    });
    if (interactive) { measurementsChanged(); picks = []; } else renderMeasureList();
  }

  function completeAngle(pts: Vec3[], interactive = true): void {
    const [p1, p2, p3] = pts;
    const deg = angle3(p1, p2, p3);
    const ends = interactive ? consumePickMarkers(3) : [];
    if (deg == null) {
      if (interactive) { statusHint.textContent = 'Angle needs three distinct points'; ends.forEach(m => removeAndDispose(overlayGroup, m)); picks = []; }
      return;
    }
    const legMat = new THREE.LineBasicMaterial({ color: 0x9b7bff, depthTest: false });
    const leg1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p2, p1]), legMat);
    const leg2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p2, p3]), legMat.clone());
    leg1.renderOrder = 997; leg2.renderOrder = 997;
    // small arc between the legs
    const u = new THREE.Vector3().subVectors(p1, p2).normalize();
    const w = new THREE.Vector3().subVectors(p3, p2).normalize();
    const arcR = Math.min(p1.distanceTo(p2), p3.distanceTo(p2)) * 0.35;
    const arcPts: Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const dir = u.clone().lerp(w, t).normalize();
      arcPts.push(p2.clone().addScaledVector(dir, arcR));
    }
    const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), legMat.clone());
    arc.renderOrder = 997;
    const label = makeLabel(`∠ ${deg.toFixed(1)}°`);
    label.position.copy(p2.clone().addScaledVector(u.clone().add(w).normalize(), arcR * 1.6));
    overlayGroup.add(leg1, leg2, arc, label);
    measurements.push({
      record: { kind: 'angle', label: `∠ ${deg.toFixed(1)}°`, value: deg, points: [toTuple(p1), toTuple(p2), toTuple(p3)] },
      objects: [leg1, leg2, arc, label, ...ends],
    });
    if (interactive) { measurementsChanged(); picks = []; } else renderMeasureList();
  }

  /** World-space outward normal of the picked triangle (for face-to-face measure). */
  function faceWorldNormal(hit: { face: { a: number; b: number; c: number } | null; object: Obj3 }): Vec3 {
    if (!hit.face) return new THREE.Vector3(0, 0, 1);
    const mesh = hit.object as Mesh3;
    const pos = mesh.geometry.getAttribute('position');
    const va = new THREE.Vector3().fromBufferAttribute(pos as never, hit.face.a).applyMatrix4(mesh.matrixWorld);
    const vb = new THREE.Vector3().fromBufferAttribute(pos as never, hit.face.b).applyMatrix4(mesh.matrixWorld);
    const vc = new THREE.Vector3().fromBufferAttribute(pos as never, hit.face.c).applyMatrix4(mesh.matrixWorld);
    return new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize();
  }

  function completePoint(p: Vec3, interactive = true): void {
    const partInv = new THREE.Matrix4().copy(partGroup.matrixWorld).invert();
    const local = p.clone().applyMatrix4(partInv).add(new THREE.Vector3(...modelOrigin)); // world → the file's own coordinates
    const dot = new THREE.Mesh(new THREE.SphereGeometry(partRadius * 0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false }));
    dot.renderOrder = 998; dot.position.copy(p);
    const label = makeLabel(`(${local.x.toFixed(1)}, ${local.y.toFixed(1)}, ${local.z.toFixed(1)})`);
    label.position.copy(p);
    overlayGroup.add(dot, label);
    measurements.push({
      record: { kind: 'point', label: `⌖ (${local.x.toFixed(2)}, ${local.y.toFixed(2)}, ${local.z.toFixed(2)}) mm`, value: 0, points: [toTuple(p)] },
      objects: [dot, label],
    });
    finishPicks();
    if (interactive) measurementsChanged(); else renderMeasureList();
  }

  function completeFaceDist(pts: Vec3[], normals: Vec3[], interactive = true): void {
    const [a, b] = pts;
    const nA = normals[0] ?? new THREE.Vector3(0, 0, 1);
    const perp = Math.abs(new THREE.Vector3().subVectors(b, a).dot(nA)); // gap along face A's normal
    const straight = a.distanceTo(b);
    const ends = interactive ? consumePickMarkers(2) : [];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false }));
    line.renderOrder = 997;
    const label = makeLabel(`⊥ ${perp.toFixed(2)} mm`);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    overlayGroup.add(line, label);
    measurements.push({
      record: { kind: 'facedist', label: `⊥ ${perp.toFixed(2)} mm  (direct ${straight.toFixed(2)})`, value: perp, points: [toTuple(a), toTuple(b)] },
      objects: [line, label, ...ends],
    });
    if (interactive) { measurementsChanged(); picks = []; pickNormals = []; } else renderMeasureList();
  }

  function highlightFaces(faceIds: Set<number>): void {
    clearHighlight();
    if (!masterPositions || !triFaceAll) return;
    // Group the matching triangles by body. Each overlay is built in the body's
    // own (part-space) coordinates and added as a CHILD of the body mesh, so an
    // exploded, moved or rotated body carries its highlight with it. The old
    // single overlay floated where the body used to be.
    const byBody = new Map<number, number[]>();
    for (let bi = 0; bi < bodyMeshes.length; bi++) {
      const off = bodyMeshes[bi].userData.triOffset as number;
      const n = (bodyMeshes[bi].geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).count / 3;
      for (let t = off; t < off + n; t++) {
        if (faceIds.has(triFaceAll[t])) { let arr = byBody.get(bi); if (!arr) { arr = []; byBody.set(bi, arr); } arr.push(t); }
      }
    }
    if (!byBody.size) return;
    for (const [bi, tris] of byBody) {
      const hp = new Float32Array(tris.length * 9);
      tris.forEach((t, i) => hp.set(masterPositions!.subarray(t * 9, t * 9 + 9), i * 9));
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
      const h = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x4f8ef7, transparent: true, opacity: 0.55, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
      bodyMeshes[bi].add(h);
      highlightParts.push(h);
    }
    applyClipping();
    invalidate();
  }

  function selectFace(triGlobal: number): void {
    clearHighlight();
    if (!meta || !triFaceAll) {
      setSelection(`<strong>Mesh triangle #${triGlobal}</strong><span>Exact face data needs STEP/IGES (B-rep). STL carries mesh only.</span>`);
      return;
    }
    const faceId = triFaceAll[triGlobal];
    const face = meta.faces[faceId];
    if (!face) return;
    highlightFaces(new Set([faceId]));
    try { opts.onFaceSelect?.(faceId, face); } catch { /* listener errors must not break picking */ }

    let triCount = 0;
    for (let t = 0; t < triFaceAll.length; t++) if (triFaceAll[t] === faceId) triCount++;
    const bits = [`<strong>Face #${faceId} — ${FACE_TYPE_LABEL[face.type] ?? face.type}</strong>`];
    if (face.type === 'cylinder' && face.radiusMm != null) {
      const kind = face.hole == null ? '' : face.hole ? ' · hole/bore' : ' · boss/shaft';
      const depth = face.depthMm != null ? ` · ${face.depthMm.toFixed(2)} mm deep` : '';
      bits.push(`<span>R ${face.radiusMm.toFixed(3)} mm · Ø ${(face.radiusMm * 2).toFixed(3)} mm${depth} <em>(exact, from B-rep)</em>${kind}</span>`);
    } else if (face.type === 'cone' && face.radiusMm != null) {
      bits.push(`<span>Ref R ${face.radiusMm.toFixed(3)} mm${face.angleDeg != null ? ` · ${face.angleDeg.toFixed(1)}° half-angle` : ''} <em>(exact, from B-rep)</em></span>`);
    } else if (face.type === 'torus' && face.radiusMm != null) {
      bits.push(`<span>R ${face.radiusMm.toFixed(3)} mm${face.radius2Mm != null ? ` · fillet r ${face.radius2Mm.toFixed(3)} mm` : ''} <em>(exact, from B-rep)</em></span>`);
    } else if (face.radiusMm != null) {
      bits.push(`<span>R ${face.radiusMm.toFixed(3)} mm · Ø ${(face.radiusMm * 2).toFixed(3)} mm <em>(exact, from B-rep)</em></span>`);
    }
    if (face.areaCm2 != null) bits.push(`<span>Area ${face.areaCm2.toFixed(2)} cm²</span>`);
    if (bodyMeshes.length > 1 && face.bodyId != null && face.bodyId >= 0) bits.push(`<span>Body ${face.bodyId + 1}</span>`);
    const thk = face.thicknessMm;
    if (typeof thk === 'number' && thk > 0) bits.push(`<span>Wall ≈ ${thk.toFixed(2)} mm (one ray from the face centre)</span>`);
    const fc = faceCosts?.[faceId];
    if (fc != null && fc > 0) bits.push(`<span>Machining on this face ≈ ${fmtMoney(fc)} per part</span>`);
    bits.push(`<span class="cv3d-muted">${triCount} triangles</span>`);
    setSelection(bits.join(''));
  }

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    (canvas as unknown as { __downAt?: [number, number] }).__downAt = [ev.clientX, ev.clientY];
  };
  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const down = (canvas as unknown as { __downAt?: [number, number] }).__downAt;
    const wasClick = !!down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) <= 5;
    // orientation cube consumes clicks in its corner (works even before a model loads)
    if (wasClick && viewCube) {
      const d = viewCube.pick(ev, canvas);
      if (d) { setView(d); statusHint.textContent = `${viewName(d)} view`; return; }
    }
    if (!wasClick || !bodyMeshes.length) return;
    const hits = raycastMeshes(ev);
    if (!hits.length) { if (tool === 'select') clearHighlight(); return; }
    const hit = hits[0];
    if (tool === 'select') {
      const triGlobal = ((hit.object as Mesh3).userData.triOffset as number) + (hit.faceIndex ?? 0);
      selectFace(triGlobal);
    } else if (tool === 'point') {
      completePoint(snapPoint(hit as never, ev));
    } else {
      const p = snapPoint(hit as never, ev);
      picks.push(p);
      addMarker(p);
      if (tool === 'facedist') {
        pickNormals.push(faceWorldNormal(hit as never));
        if (picks.length === 2) completeFaceDist(picks, pickNormals);
        else statusHint.textContent = 'Face-to-face: pick a point on the SECOND face';
      } else if (tool === 'dist' && picks.length === 2) completeDistance(picks);
      else if (tool === 'circle' && picks.length === 3) completeCircle(picks);
      else if (tool === 'angle' && picks.length === 3) completeAngle(picks);
      else {
        statusHint.textContent = tool === 'dist'
          ? 'Pick the second point'
          : tool === 'circle'
            ? `Circle: ${3 - picks.length} more point${3 - picks.length > 1 ? 's' : ''} on the rim`
            : picks.length === 1 ? 'Angle: pick the CORNER point' : 'Angle: pick the last point';
      }
    }
  };
  const onDblClick = (ev: MouseEvent) => {
    // CAD convention: double-click re-centres the orbit on the picked point
    // — glide there instead of snapping the view.
    if (viewCube?.contains(ev, canvas)) return;
    const hits = raycastMeshes(ev);
    const to = hits.length ? hits[0].point.clone() : new THREE.Vector3(0, 0, 0);
    // Re-aim from where the camera is (the line of sight that found the point stays clear); shifting the
    // camera sideways instead let a nearer wall hide the point under perspective.
    animateCamera(camera.position.clone(), to, 280);
    statusHint.textContent = hits.length ? 'Centred on that point — double-click empty space to re-centre the part' : 'Re-centred on the part';
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    if (picks.length) { finishPicks(); statusHint.textContent = 'Cancelled'; }
    else if (maximized) setFullscreen(false);
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  // ── toolbar wiring ──
  const rgbCss = (c: [number, number, number]) => `rgb(${c.map(x => Math.round(x * 255)).join(',')})`;

  /** Single vertex-colour engine: one colour mode at a time (`colorMode`). Rebuilds the colour buffer
   *  for the active mode, or strips it for plain / per-component colour. */
  function costRangeNow(): RobustRange | null {
    if (!faceCosts || !meta || !triFaceAll) return null;
    const vals = Object.values(faceCosts).filter(v => Number.isFinite(v) && v > 0);
    if (!vals.length) return null;
    // Cost runs from zero (a face with no attributed money) to the 95th percentile.
    const r = robustRange(vals) ?? { min: 0, max: vals[0], absMin: vals[0], absMax: vals[0], clippedLow: false, clippedHigh: false };
    return { ...r, min: 0, clippedLow: false };
  }
  function effectiveMode(): ColorMode {
    if (colorMode === 'cost' && !costRangeNow()) return 'none';
    if (colorMode === 'thickness' && !(meta && triFaceAll && thicknessRange)) return 'none';
    if (colorMode === 'facetype' && !meta) return 'none';
    if (colorMode === 'body' && bodyMeshes.length < 2) return 'none';
    return colorMode;
  }
  function applyColorMode(): void {
    const costRange = costRangeNow();
    const mode = effectiveMode();
    const pull: [number, number, number] = draftAxis === 'x' ? [1, 0, 0] : draftAxis === 'y' ? [0, 1, 0] : [0, 0, 1];
    for (let bi = 0; bi < bodyMeshes.length; bi++) {
      const mesh = bodyMeshes[bi];
      const mat = bodyMats[bi];
      if (mode === 'none' || mode === 'body') {
        // solid per-material colour — grey when off, a distinct palette colour per
        // component when in Components mode. No vertex-colour buffer needed.
        mat.vertexColors = false;
        if (mode === 'body') { const c = bodyColorRGB(bi); mat.color.setRGB(c[0], c[1], c[2]); }
        else mat.color.set(0xaeb6c2);
        if (mesh.geometry.getAttribute('color')) mesh.geometry.deleteAttribute('color');
        mat.needsUpdate = true;
        continue;
      }
      const posAttr = mesh.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>;
      const nTris = posAttr.count / 3;
      const colors = new Float32Array(nTris * 9);
      const triOffset = mesh.userData.triOffset as number;
      if (mode === 'facetype' && meta && triFaceAll) {
        for (let t = 0; t < nTris; t++) {
          const f = meta.faces[triFaceAll[triOffset + t]];
          const col = FACE_COLORS[f?.type ?? 'other'] ?? FACE_COLORS.other;
          for (let v = 0; v < 3; v++) colors.set(col, t * 9 + v * 3);
        }
      } else if (mode === 'cost' && triFaceAll && costRange) {
        // £ per face → the same ramp as wall thickness, reversed: cold = cheap, hot = where the money is.
        for (let t = 0; t < nTris; t++) {
          const v = faceCosts![triFaceAll[triOffset + t]];
          const col = v == null || !(v > 0) ? NO_THICKNESS_COLOR : thicknessColor(1 - normInRange(v, costRange));
          for (let v3 = 0; v3 < 3; v3++) colors.set(col, t * 9 + v3 * 3);
        }
      } else if (mode === 'thickness' && meta && triFaceAll && thicknessRange) {
        for (let t = 0; t < nTris; t++) {
          const thk = meta.faces[triFaceAll[triOffset + t]]?.thicknessMm;
          const col = thk == null ? NO_THICKNESS_COLOR : thicknessColor(normInRange(thk, thicknessRange));
          for (let v = 0; v < 3; v++) colors.set(col, t * 9 + v * 3);
        }
      } else { // draft: classify each triangle by its geometric normal vs the pull axis (part space)
        const pos = posAttr.array as Float32Array;
        for (let t = 0; t < nTris; t++) {
          const o = t * 9;
          const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
          const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const col = DRAFT_COLORS[draftBucket(nx, ny, nz, pull[0], pull[1], pull[2])];
          for (let v = 0; v < 3; v++) colors.set(col, o + v * 3);
        }
      }
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mat.vertexColors = true;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    }
    const sw = (c: [number, number, number]) => `<i style="background:${rgbCss(c)}"></i>`;
    const ramp = (rev: boolean) => `<b class="cv3d-ramp" style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map(k => rgbCss(thicknessColor(rev ? 1 - k : k))).join(',')})"></b>`;
    if (mode === 'facetype' && meta) {
      const present = [...new Set(faceList.map(f => f.type))];
      legendEl.innerHTML = `<em>Face type</em>` + present.map(t => `<span>${sw(FACE_COLORS[t] ?? FACE_COLORS.other)}${FACE_TYPE_LABEL[t] ?? t}</span>`).join('');
    } else if (mode === 'draft') {
      legendEl.innerHTML = `<em>Draft · pull ${draftAxis.toUpperCase()}</em>` + (['undercut', 'zero', 'ok', 'neutral'] as DraftClass[]).map(k =>
        `<span>${sw(DRAFT_COLORS[k])}${DRAFT_LABEL[k]}</span>`).join('');
    } else if (mode === 'thickness' && thicknessRange) {
      const r = thicknessRange;
      legendEl.innerHTML = `<em>Wall thickness</em><span>${r.clippedLow ? '≤ ' : ''}${r.min.toFixed(1)} mm</span>${ramp(false)}<span>${r.clippedHigh ? '≥ ' : ''}${r.max.toFixed(1)} mm</span>` +
        (r.clippedLow || r.clippedHigh ? `<span class="cv3d-legend-note">5–95% of area · readings ${r.absMin.toFixed(1)}–${r.absMax.toFixed(1)} mm</span>` : '');
    } else if (mode === 'body') {
      legendEl.innerHTML = `<em>Components</em>` + bodyMeshes.slice(0, 12).map((_, i) => `<span>${sw(bodyColorRGB(i))}Body ${i + 1}</span>`).join('') +
        (bodyMeshes.length > 12 ? `<span>+${bodyMeshes.length - 12} more</span>` : '');
    } else if (mode === 'cost' && costRange) {
      legendEl.innerHTML = `<em>Cost on model · per part</em><span>${fmtMoney(0)}</span>${ramp(true)}<span>${costRange.clippedHigh ? '≥ ' : ''}${fmtMoney(costRange.max)}</span>` +
        `<span>${sw(NO_THICKNESS_COLOR)}not attributed</span>`;
    }
    legendEl.style.display = mode === 'none' ? 'none' : '';
    syncDock();
    renderInspector();
    invalidate();
  }

  const COLOR_ACTS: Record<ColorMode, string> = { none: 'color-none', facetype: 'facecolors', draft: 'draft', thickness: 'thickness', body: 'bodycolors', cost: 'costcolors' };
  const COLOR_LABEL: Record<ColorMode, string> = { none: 'Plain', facetype: 'Face type', draft: 'Draft', thickness: 'Wall thickness', body: 'Components', cost: 'Cost on model' };
  function setColorMode(m: ColorMode): void {
    colorMode = m;
    applyColorMode();
    const eff = effectiveMode();
    statusHint.textContent = eff === 'none' ? 'Plain shading' : eff === 'draft' ? `Draft analysis — pull axis ${draftAxis.toUpperCase()}` : `Coloured by ${COLOR_LABEL[eff].toLowerCase()}`;
  }
  /** Reflect state on the dock: active colour item, tool, display toggles, menu triggers. */
  function syncDock(): void {
    const eff = effectiveMode();
    for (const [m, act] of Object.entries(COLOR_ACTS)) {
      const b = root.querySelector<HTMLElement>(`[data-act="${act}"]`);
      if (b) { b.classList.toggle('active', m === eff); b.setAttribute('aria-checked', String(m === eff)); }
    }
    const costBtn = root.querySelector<HTMLButtonElement>('[data-act="costcolors"]');
    if (costBtn) { costBtn.disabled = !costRangeNow(); costBtn.title = costBtn.disabled ? 'Cost on model appears after a CAD costing' : ''; }
    root.querySelectorAll<HTMLElement>('[data-draft-axis]').forEach(b => b.classList.toggle('active', b.dataset.draftAxis === draftAxis));
    const axesRow = root.querySelector<HTMLElement>('[data-draft-axes]');
    if (axesRow) axesRow.style.display = eff === 'draft' ? '' : 'none';
    root.querySelector('[data-menu="color"]')?.classList.toggle('active', eff !== 'none');
    root.querySelector('[data-menu="measure"]')?.classList.toggle('active', tool !== 'select');
    root.querySelector('[data-menu="arrange"]')?.classList.toggle('active',
      explodePanel.style.display !== 'none' || rotatePanel.style.display !== 'none' || movePanel.style.display !== 'none');
    const arrangeTrigger = root.querySelector<HTMLButtonElement>('[data-menu="arrange"]');
    if (arrangeTrigger) arrangeTrigger.disabled = !bodyMeshes.length;
    root.querySelector('[data-act="inspector"]')?.classList.toggle('active', !inspector.hidden);
    for (const [act, on] of [['bbox', bboxOn], ['grid', gridOn], ['mode-shaded', edgesOn], ['mode-wire', !edgesOn], ['ortho', ortho]] as const) {
      const b = root.querySelector<HTMLElement>(`[data-act="${act}"]`);
      if (b) { b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); }
    }
  }

  function setTool(t: Tool): void {
    tool = t;
    finishPicks();
    root.querySelectorAll('[data-act^="tool-"]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.act === `tool-${t}`));
    syncDock();
    canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    statusHint.textContent = t === 'select' ? 'Click a face for exact B-rep data'
      : t === 'dist' ? 'Distance: pick two points (snaps to vertices & edges)'
      : t === 'circle' ? 'Circle: pick 3 points on a rim or bore'
      : t === 'angle' ? 'Angle: pick point, corner, point'
      : t === 'point' ? 'Point: click to read X/Y/Z coordinates'
      : 'Face-to-face: pick a point on each of two faces';
  }

  clipPanel.querySelectorAll('input[data-clip-axis]').forEach(cb => cb.addEventListener('change', () => {
    const a = (cb as HTMLInputElement).dataset.clipAxis as 'x' | 'y' | 'z';
    clipState[a].on = (cb as HTMLInputElement).checked;
    if (clipState[a].on) faceCutToCamera(a);
    applyClipping();
  }));
  clipPanel.querySelectorAll<HTMLButtonElement>('[data-clip-flip]').forEach(b => b.addEventListener('click', (ev) => {
    ev.preventDefault(); // inside the row's <label> — do not toggle its checkbox
    const a = b.dataset.clipFlip as Axis;
    clipState[a].flip = !clipState[a].flip;
    syncFlipButtons();
    if (clipState[a].on) applyClipping();
  }));
  clipPanel.querySelectorAll('input[data-clip-slider]').forEach(sl => sl.addEventListener('input', () => {
    const a = (sl as HTMLInputElement).dataset.clipSlider as 'x' | 'y' | 'z';
    clipState[a].off = Number((sl as HTMLInputElement).value);
    if (clipState[a].on) applyClipping();
  }));
  $('.cv3d-clip-off').addEventListener('click', () => {
    (['x', 'y', 'z'] as const).forEach(a => {
      clipState[a].on = false;
      const cb = clipPanel.querySelector(`input[data-clip-axis="${a}"]`) as HTMLInputElement | null;
      if (cb) cb.checked = false;
    });
    clipPanel.style.display = 'none';
    root.querySelector('[data-act="clip"]')?.classList.remove('active');
    applyClipping();
  });
  explodeSlider.addEventListener('input', () => {
    explodeFactor = Number(explodeSlider.value) / 100;
    applyBodyTransforms();
  });
  // explode axis selector (Radial / X / Y / Z)
  explodePanel.querySelectorAll('[data-explode-axis]').forEach(b => b.addEventListener('click', () => {
    explodeAxis = (b as HTMLElement).dataset.explodeAxis as 'radial' | 'x' | 'y' | 'z';
    explodePanel.querySelectorAll('[data-explode-axis]').forEach(o => o.classList.toggle('active', o === b));
    updateExplodeDirs();
    applyBodyTransforms();
  }));
  // per-component rotate: sliders drive the selected body's rotation
  rotateBodySelect.addEventListener('change', syncRotateSliders);
  rotatePanel.querySelectorAll('input[data-rot-axis]').forEach(sl => sl.addEventListener('input', () => {
    const a = (sl as HTMLInputElement).dataset.rotAxis as 'x' | 'y' | 'z';
    const i = selectedRotateBody();
    if (bodyRot[i]) { bodyRot[i][a] = Number((sl as HTMLInputElement).value); applyBodyTransforms(); }
  }));
  $('.cv3d-rotate-reset').addEventListener('click', () => {
    const i = selectedRotateBody();
    bodyRot[i] = { x: 0, y: 0, z: 0 };
    syncRotateSliders();
    applyBodyTransforms();
  });
  // per-component move: sliders (−100..100 → ±partRadius) translate the selected body
  moveBodySelect.addEventListener('change', syncMoveSliders);
  movePanel.querySelectorAll('input[data-mov-axis]').forEach(sl => sl.addEventListener('input', () => {
    const a = (sl as HTMLInputElement).dataset.movAxis as 'x' | 'y' | 'z';
    const i = selectedMoveBody();
    if (bodyMove[i]) { bodyMove[i][a] = (Number((sl as HTMLInputElement).value) / 100) * partRadius; applyBodyTransforms(); }
  }));
  $('.cv3d-move-reset').addEventListener('click', () => {
    const i = selectedMoveBody();
    bodyMove[i] = { x: 0, y: 0, z: 0 };
    syncMoveSliders();
    applyBodyTransforms();
  });

  // ── tree panel controls: collapse/expand, close, drag-to-resize ──
  $('.cv3d-tree-collapse').addEventListener('click', () => {
    treeBox.classList.toggle('cv3d-tree--collapsed');
  });
  $('.cv3d-tree-close').addEventListener('click', () => {
    treeBox.style.display = 'none';
    root.classList.remove('cv3d--tree-open');
    root.querySelector('[data-act="tree"]')?.classList.remove('active');
  });
  {
    const handle = $('.cv3d-tree-resize');
    let startX = 0, startW = 0, dragging = false;
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      treeBox.style.width = `${Math.max(190, Math.min(460, startW + (e.clientX - startX)))}px`;
    };
    const onUp = () => { dragging = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    handle.addEventListener('pointerdown', (e) => {
      dragging = true; startX = (e as PointerEvent).clientX; startW = treeBox.getBoundingClientRect().width;
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }

  // ── dock fly-out menus ──
  const dockWrap = $('.cv3d-dock-wrap');
  function closeMenus(except?: string): void {
    root.querySelectorAll<HTMLElement>('.cv3d-menu').forEach(m => { if (m.dataset.menuFor !== except) m.hidden = true; });
    root.querySelectorAll<HTMLElement>('.cv3d-menu-trigger').forEach(t => { if (t.dataset.menu !== except) t.setAttribute('aria-expanded', 'false'); });
  }
  function toggleMenu(name: string, focusFirst = false): void {
    const menu = root.querySelector<HTMLElement>(`.cv3d-menu[data-menu-for="${name}"]`);
    const trigger = root.querySelector<HTMLElement>(`.cv3d-menu-trigger[data-menu="${name}"]`);
    if (!menu || !trigger) return;
    const open = menu.hidden;
    closeMenus(name);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Sit above the trigger, kept inside the viewport.
    const wr = dockWrap.getBoundingClientRect(), tr = trigger.getBoundingClientRect(), vr = viewport.getBoundingClientRect();
    const w = menu.offsetWidth;
    const left = Math.max(vr.left + 8 - wr.left, Math.min(tr.left + tr.width / 2 - w / 2 - wr.left, vr.right - 8 - w - wr.left));
    menu.style.left = `${left}px`;
    if (focusFirst) menu.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }
  dockWrap.addEventListener('keydown', (ev) => {
    const menu = (ev.target as HTMLElement).closest<HTMLElement>('.cv3d-menu');
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)'));
    const i = items.indexOf(ev.target as HTMLButtonElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (ev.key === 'Escape') {
      ev.stopPropagation();
      const name = menu.dataset.menuFor!;
      closeMenus();
      root.querySelector<HTMLElement>(`.cv3d-menu-trigger[data-menu="${name}"]`)?.focus();
    }
  });
  // Tooltips: one bubble above the hovered / focused dock button (label · shortcut), after a short delay.
  const tipEl = document.createElement('div');
  tipEl.className = 'cv3d-tip';
  tipEl.setAttribute('aria-hidden', 'true'); // visual only — every dock button carries its own aria-label
  dockWrap.appendChild(tipEl);
  let tipTimer = 0;
  const showTip = (b: HTMLElement, delay: number) => {
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (b.getAttribute('aria-expanded') === 'true') return;
      tipEl.textContent = b.dataset.tip ?? '';
      const wr = dockWrap.getBoundingClientRect(), br = b.getBoundingClientRect();
      tipEl.style.left = `${br.left + br.width / 2 - wr.left}px`;
      tipEl.style.top = `${br.top - wr.top - 34}px`;
      tipEl.classList.add('show');
    }, delay);
  };
  const hideTip = () => { clearTimeout(tipTimer); tipEl.classList.remove('show'); };
  const dockEl = $('.cv3d-dock');
  dockEl.addEventListener('pointerover', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('button[data-tip]'); if (b) showTip(b, 350); });
  dockEl.addEventListener('pointerleave', hideTip);
  dockEl.addEventListener('focusin', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('button[data-tip]'); if (b && b.matches(':focus-visible')) showTip(b, 0); });
  dockEl.addEventListener('focusout', hideTip);
  dockEl.addEventListener('pointerdown', hideTip);
  const onDocPointerDown = (ev: PointerEvent) => { if (!dockWrap.contains(ev.target as Node)) closeMenus(); };
  document.addEventListener('pointerdown', onDocPointerDown);
  root.querySelectorAll<HTMLButtonElement>('[data-draft-axis]').forEach(b => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    draftAxis = b.dataset.draftAxis as 'x' | 'y' | 'z';
    setColorMode('draft');
  }));

  // ── inspector ──
  function setInspector(open: boolean): void {
    inspector.hidden = !open;
    root.classList.toggle('cv3d--insp-open', open);
    try { if (!opts.compact) localStorage.setItem('cv3d-inspector', open ? '1' : '0'); } catch { /* storage blocked */ }
    faceChip.style.display = !open && selectionHtml ? '' : 'none';
    syncDock();
    if (open) renderInspector();
    requestAnimationFrame(resize);
  }
  $('.cv3d-insp-close').addEventListener('click', () => setInspector(false));
  /** Which inspector sections the user has collapsed — kept across re-renders. */
  const closedSecs = new Set<string>();
  const fmtNum = (n: number, d = 1) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  function sec(id: string, title: string, body: string, aside = ''): string {
    return `<details class="cv3d-sec" data-sec="${id}" ${closedSecs.has(id) ? '' : 'open'}><summary><span>${title}</span>${aside ? `<small>${aside}</small>` : ''}</summary><div class="cv3d-sec-body">${body}</div></details>`;
  }
  function histogramSvg(bins: number[], colorAt: (k: number) => [number, number, number]): string {
    const max = Math.max(...bins, 1e-9), n = bins.length, W = 260, H = 54, bw = W / n;
    return `<svg class="cv3d-hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Distribution histogram">` +
      bins.map((b, i) => { const h = Math.max(b > 0 ? 2 : 0, (b / max) * (H - 2)); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${rgbCss(colorAt((i + 0.5) / n))}"/>`; }).join('') + `</svg>`;
  }
  function issueList(): { items: ViewerIssue[]; source: string } {
    if (hostIssues) return { items: hostIssues, source: 'Costed DFM findings (this part, this route)' };
    return { items: meta ? geometryChecks(faceList) : [], source: 'Geometry checks — process-independent rules of thumb' };
  }
  function renderInspector(): void {
    if (inspector.hidden) return;
    const out: string[] = [];
    if (!bodyMeshes.length) {
      inspBody.innerHTML = `<p class="cv3d-insp-empty">Open a STEP, IGES or STL model to see its size, volume, mass, faces and manufacturability checks here.</p>`;
      return;
    }
    // Part
    const dens = VIEWER_DENSITIES.find(d => d.id === densityId) ?? VIEWER_DENSITIES[0];
    const volCm3 = partStats?.volumeMm3 != null ? partStats.volumeMm3 / 1000 : null;
    const massKg = volCm3 != null ? volCm3 * dens.gPerCm3 / 1000 : null;
    const types = new Map<string, number>();
    for (const f of faceList) types.set(f.type, (types.get(f.type) ?? 0) + (f.areaCm2 ?? 0));
    const typeTotal = [...types.values()].reduce((a, b) => a + b, 0);
    const typeBar = typeTotal > 0
      ? `<div class="cv3d-typebar" role="img" aria-label="Surface area by face type">${[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, a]) =>
        `<span style="flex:${a.toFixed(3)};background:${rgbCss(FACE_COLORS[t] ?? FACE_COLORS.other)}" title="${esc(FACE_TYPE_LABEL[t] ?? t)}: ${fmtNum(a / typeTotal * 100, 0)}% of area"></span>`).join('')}</div>` +
        `<div class="cv3d-typekey">${[...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, a]) => `<span><i style="background:${rgbCss(FACE_COLORS[t] ?? FACE_COLORS.other)}"></i>${esc((FACE_TYPE_LABEL[t] ?? t).split(' (')[0])} ${fmtNum(a / typeTotal * 100, 0)}%</span>`).join('')}</div>`
      : '';
    out.push(sec('part', 'Part', `
      <dl class="cv3d-kv">
        <dt>Size</dt><dd>${fmtNum(partSpan.x)} × ${fmtNum(partSpan.y)} × ${fmtNum(partSpan.z)} mm</dd>
        <dt>Volume</dt><dd>${volCm3 != null ? `${fmtNum(volCm3, 2)} cm³` : '<span class="cv3d-muted">open shell — no volume</span>'}</dd>
        <dt>Surface</dt><dd>${partStats ? `${fmtNum(partStats.areaMm2 / 100, 1)} cm²` : '—'}</dd>
        <dt>Mass</dt><dd>${massKg != null ? `<strong>${massKg < 1 ? `${fmtNum(massKg * 1000, 0)} g` : `${fmtNum(massKg, 3)} kg`}</strong>` : '—'}
          <select class="cv3d-density" aria-label="Material for the mass">${VIEWER_DENSITIES.map(d => `<option value="${d.id}" ${d.id === dens.id ? 'selected' : ''}>${esc(d.label)} · ${d.gPerCm3}</option>`).join('')}</select></dd>
        <dt>Bodies</dt><dd>${bodyMeshes.length}${meta?.topology?.isClosedSolid ? ' · closed solid' : ''}</dd>
        <dt>Faces</dt><dd>${meta ? `${faceList.length} B-rep · ` : ''}${(masterPositions ? masterPositions.length / 9 : 0).toLocaleString()} triangles</dd>
      </dl>${typeBar}
      <p class="cv3d-note">Volume and area from the mesh; mass at a typical density (g/cm³) — not the costed material.</p>`));
    // Selection
    out.push(sec('sel', 'Selection', selectionHtml ? `<div class="cv3d-selbox">${selectionHtml}</div>` : `<p class="cv3d-muted">Click a face for its exact B-rep type, radius, depth and area.</p>`));
    // Cost on model
    const ranked = rankCostItems(costItems);
    if (ranked.length) {
      const total = ranked.reduce((t, i) => t + i.gbp, 0);
      out.push(sec('cost', 'Cost on model', `
        <p class="cv3d-lead"><strong>${fmtMoney(total)}</strong> of feature machining per part sits on ${ranked.length} feature${ranked.length > 1 ? 's' : ''} — click one to fly to it.</p>
        <div class="cv3d-rows">${ranked.slice(0, 12).map((r, i) => `
          <button type="button" class="cv3d-row" data-cost-idx="${i}">
            <span class="cv3d-row-main"><span class="cv3d-row-title">${esc(r.label)}</span><span class="cv3d-bar"><i style="width:${(r.share * 100).toFixed(1)}%"></i></span></span>
            <span class="cv3d-row-val">${fmtMoney(r.gbp)}<small>${fmtNum(r.share * 100, 0)}%</small></span>
          </button>`).join('')}</div>
        ${effectiveMode() !== 'cost' ? `<button type="button" class="cv3d-linkbtn" data-insp-mode="cost">Colour the model by cost</button>` : ''}
        <p class="cv3d-note">Machining minutes × the costed machine rate, from the engine's feature lines.</p>`, `${ranked.length}`));
    }
    // Manufacturability
    const { items: issues, source } = issueList();
    if (meta || hostIssues) {
      const sevRank = { high: 0, medium: 1, low: 2, info: 3 } as const;
      const sorted = [...issues].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
      const rows = sorted.length ? `
        <div class="cv3d-rows">${sorted.map((it) => `
          <button type="button" class="cv3d-row cv3d-issue" data-issue-idx="${issues.indexOf(it)}" ${it.faceIds.length ? '' : 'data-nofaces="1"'}>
            <i class="cv3d-sev cv3d-sev--${it.severity}" aria-label="${it.severity}"></i>
            <span class="cv3d-row-main"><span class="cv3d-row-title">${esc(it.title)}</span>${it.detail ? `<span class="cv3d-row-sub">${esc(it.detail)}</span>` : ''}</span>
            ${it.amount ? `<span class="cv3d-row-val">${esc(it.amount)}</span>` : ''}
          </button>`).join('')}</div>` : `<p class="cv3d-muted">No issues found by these checks.</p>`;
      out.push(sec('issues', 'Manufacturability', `${rows}<p class="cv3d-note">${esc(source)}.</p>`, sorted.length ? `${sorted.length}` : ''));
    }
    // Section (cut-face area) — while a section plane is on
    if (sections.length) {
      const AX = 'XYZ';
      out.push(sec('section', 'Section', sections.map((sc, i) => {
        const [ua, va] = planeAxes(sc.axis);
        const b = sc.bounds;
        return `
        <div class="cv3d-secblock">
          <div class="cv3d-sec-plane">${AX[sc.axis]} = ${modelAt(sc).toFixed(2)} mm</div>
          ${sc.loops.length ? `<dl class="cv3d-kv">
            <dt>Cut area</dt><dd><strong>${fmtArea(sc.areaMm2)}</strong> <span class="cv3d-muted">${fmtNum(sc.areaMm2 / 100, 2)} cm²</span></dd>
            <dt>Perimeter</dt><dd>${fmtNum(sc.perimeterMm, 1)} mm</dd>
            <dt>Extent</dt><dd>${b ? `${AX[ua]} ${fmtNum(b.uMax - b.uMin, 1)} × ${AX[va]} ${fmtNum(b.vMax - b.vMin, 1)} mm` : '—'}</dd>
            <dt>Regions</dt><dd>${sc.regions}${sc.holes ? ` · ${sc.holes} hole${sc.holes > 1 ? 's' : ''}` : ''}</dd>
          </dl>
          <div class="cv3d-secbtns"><button type="button" class="cv3d-linkbtn" data-sec-add="${i}">Add to measurements</button><button type="button" class="cv3d-linkbtn" data-sec-dxf="${i}">Profile DXF</button></div>`
          : `<p class="cv3d-muted">${sc.openChains ? `The cut does not close (${sc.openChains} open edge chain${sc.openChains > 1 ? 's' : ''}) — the mesh is not a closed solid here, so no area.` : 'The plane does not cut the part here.'}</p>`}
          ${sc.loops.length && sc.openChains ? `<p class="cv3d-note">${sc.openChains} open chain${sc.openChains > 1 ? 's' : ''} left out of the area — a gap in the mesh.</p>` : ''}
        </div>`;
      }).join('') + `<p class="cv3d-note">Measured on the tessellated surface: curved edges are chords, so a round boundary reads a fraction of a percent small (a solid round low, a section with bores slightly high). Checked against the CAD kernel's exact section: within 0.1 % on real parts. Positions are the file's own coordinates.</p>`, `${sections.length}`));
    }
    // Wall thickness
    if (thicknessRange && meta) {
      const thk = faceList.filter(f => typeof f.thicknessMm === 'number' && f.thicknessMm > 0);
      const vals = thk.map(f => f.thicknessMm as number), w = thk.map(f => f.areaCm2 ?? 1);
      const r = thicknessRange;
      const bins = histogram(vals, r.min, r.max, 18, w);
      const med = robustRange(vals, w, 0.5, 0.5);
      out.push(sec('thk', 'Wall thickness', `
        ${histogramSvg(bins, k => thicknessColor(k))}
        <div class="cv3d-axis"><span>${r.clippedLow ? '≤ ' : ''}${fmtNum(r.min)} mm</span><span>${r.clippedHigh ? '≥ ' : ''}${fmtNum(r.max)} mm</span></div>
        <dl class="cv3d-kv"><dt>Median</dt><dd>${med ? fmtNum(med.min) : '—'} mm (by area)</dd><dt>Readings</dt><dd>${fmtNum(r.absMin)} – ${fmtNum(r.absMax)} mm · ${thk.length} faces</dd></dl>
        ${effectiveMode() !== 'thickness' ? `<button type="button" class="cv3d-linkbtn" data-insp-mode="thickness">Colour the model by wall thickness</button>` : ''}
        <p class="cv3d-note">One ray per face from its centre (kernel) — check a critical wall with Measure → Face to face.</p>`));
    }
    // Holes & bosses
    if (featureGroups.length) {
      out.push(sec('feat', 'Holes &amp; bosses', `<div class="cv3d-rows">${featureGroups.map((g, i) => `
        <button type="button" class="cv3d-row" data-feat="${i}"><span class="cv3d-row-main"><span class="cv3d-row-title">${g.kind === 'hole' ? 'Hole' : 'Boss'} Ø${g.diaMm.toFixed(2)}${g.depthMm != null ? ` × ${g.depthMm.toFixed(1)}` : ''} mm</span></span><span class="cv3d-row-val">× ${g.faceIds.length}</span></button>`).join('')}</div>`, `${featureGroups.length}`));
    }
    // Measurements
    if (measurements.length) {
      out.push(sec('meas', 'Measurements', `<div class="cv3d-rows">${measurements.map((m, i) => `
        <div class="cv3d-row cv3d-row--static"><span class="cv3d-row-main"><span class="cv3d-row-title">${esc(m.record.label)}</span></span><button type="button" class="cv3d-del" data-del="${i}" aria-label="Remove measurement">✕</button></div>`).join('')}</div>
        <button type="button" class="cv3d-linkbtn" data-csv="1">Export measurements (CSV)</button>`, `${measurements.length}`));
    }
    inspBody.innerHTML = out.join('');
  }
  inspBody.addEventListener('toggle', (ev) => {
    const d = ev.target as HTMLDetailsElement;
    if (!d.dataset?.sec) return;
    if (d.open) closedSecs.delete(d.dataset.sec); else closedSecs.add(d.dataset.sec);
  }, true);
  inspBody.addEventListener('change', (ev) => {
    const sel = (ev.target as HTMLElement).closest<HTMLSelectElement>('.cv3d-density');
    if (!sel) return;
    densityId = sel.value;
    try { localStorage.setItem('cv3d-density', densityId); } catch { /* storage blocked */ }
    renderInspector();
  });
  inspBody.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const costRow = t.closest<HTMLElement>('[data-cost-idx]');
    if (costRow) {
      const r = rankCostItems(costItems)[Number(costRow.dataset.costIdx)];
      if (r) showFaces(r.faceIds, `<strong>${esc(r.label)}</strong><span>${fmtMoney(r.gbp)} per part · ${r.faceIds.length} face${r.faceIds.length > 1 ? 's' : ''}</span>`);
      return;
    }
    const issueRow = t.closest<HTMLElement>('[data-issue-idx]');
    if (issueRow) {
      const it = issueList().items[Number(issueRow.dataset.issueIdx)];
      if (it?.faceIds.length) showFaces(it.faceIds, `<strong>${esc(it.title)}</strong>${it.detail ? `<span>${esc(it.detail)}</span>` : ''}${it.amount ? `<span>${esc(it.amount)}</span>` : ''}<span class="cv3d-muted">${esc(it.source)}</span>`);
      else statusHint.textContent = 'This finding is not tied to specific faces';
      return;
    }
    const featRow = t.closest<HTMLElement>('[data-feat]');
    if (featRow) {
      const g = featureGroups[Number(featRow.dataset.feat)];
      if (g) showFaces(g.faceIds, `<strong>${g.faceIds.length} × ${g.kind === 'hole' ? 'hole / bore' : 'boss / shaft'} Ø ${g.diaMm.toFixed(2)} mm</strong><span>R ${(g.diaMm / 2).toFixed(3)} mm${g.depthMm != null ? ` · ${g.depthMm.toFixed(1)} mm deep` : ''} <em>(exact, from B-rep)</em></span>`);
      return;
    }
    const del = t.closest<HTMLElement>('[data-del]');
    if (del) {
      const i = Number(del.dataset.del);
      measurements[i]?.objects.forEach(o => removeAndDispose(overlayGroup, o));
      measurements.splice(i, 1);
      measurementsChanged();
      return;
    }
    if (t.closest('[data-csv]')) { exportCSV(); return; }
    const secAdd = t.closest<HTMLElement>('[data-sec-add]');
    if (secAdd) { addSectionMeasurement(Number(secAdd.dataset.secAdd)); return; }
    const secDxf = t.closest<HTMLElement>('[data-sec-dxf]');
    if (secDxf) { downloadSectionDxf(Number(secDxf.dataset.secDxf)); return; }
    const modeBtn = t.closest<HTMLElement>('[data-insp-mode]');
    if (modeBtn) setColorMode(modeBtn.dataset.inspMode as ColorMode);
  });

  /** Highlight faces, show what they are, and glide the camera to them. */
  function showFaces(ids: number[], html: string): void {
    const set = new Set(ids);
    highlightFaces(set);
    setSelection(html);
    flyToFaces(set);
  }
  function setSelection(html: string): void {
    selectionHtml = html;
    faceChip.innerHTML = html;
    faceChip.style.display = html && inspector.hidden ? '' : 'none';
    renderInspector();
  }
  /** Glide to a set of faces, keeping the current viewing direction, framed with some context. */
  function flyToFaces(ids: Set<number>): void {
    if (!triFaceAll || !masterPositions || !ids.size) return;
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    partGroup.updateMatrixWorld(true);
    for (let bi = 0; bi < bodyMeshes.length; bi++) {
      const mesh = bodyMeshes[bi];
      if (!mesh.visible) continue;
      const off = mesh.userData.triOffset as number;
      const n = (mesh.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).count / 3;
      for (let t = off; t < off + n; t++) {
        if (!ids.has(triFaceAll[t])) continue;
        for (let k = 0; k < 3; k++) {
          v.set(masterPositions[t * 9 + k * 3], masterPositions[t * 9 + k * 3 + 1], masterPositions[t * 9 + k * 3 + 2]).applyMatrix4(mesh.matrixWorld);
          box.expandByPoint(v);
        }
      }
    }
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, partRadius * 0.22);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() === 0) dir.set(1, 0.8, 1);
    dir.normalize();
    const vFov = (camera.fov * Math.PI) / 180;
    const half = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)) / 2;
    const d = Math.min(r / Math.sin(half) * 1.9, partRadius / Math.sin(half) * 1.1);
    animateCamera(c.clone().addScaledVector(dir, d), c, 480);
  }

  // ── full screen (Fullscreen API, with an in-page fallback) ──
  function setFullscreen(on: boolean): void {
    if (on && !maximized) {
      const req = root.requestFullscreen?.bind(root);
      if (req) req().catch(() => applyMax(true)); else applyMax(true);
    } else if (!on && maximized) {
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => applyMax(false));
      else applyMax(false);
    }
  }
  function applyMax(on: boolean): void {
    maximized = on;
    root.classList.toggle('cv3d--max', on);
    root.querySelector('[data-act="maximize"]')?.classList.toggle('active', on);
    requestAnimationFrame(resize);
    statusHint.textContent = on ? 'Full screen — press Esc to exit' : '';
  }
  const onFullscreenChange = () => { applyMax(document.fullscreenElement === root); };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  function togglePanel(panel: HTMLElement, act: string): boolean {
    const show = panel.style.display === 'none';
    panel.style.display = show ? '' : 'none';
    root.querySelector(`[data-act="${act}"]`)?.classList.toggle('active', show);
    return show;
  }
  const COLOR_CYCLE: ColorMode[] = ['none', 'facetype', 'draft', 'thickness', 'body', 'cost'];

  function runAction(act: string, btn?: HTMLElement | null): void {
    switch (act) {
      case 'view-iso': setView([1, 0.8, 1]); break;
      case 'view-front': setView([0, 0, 1]); break;
      case 'view-back': setView([0, 0, -1]); break;
      case 'view-top': setView([0, 1, 0]); break;
      case 'view-bottom': setView([0, -1, 0]); break;
      case 'view-left': setView([-1, 0, 0]); break;
      case 'view-right': setView([1, 0, 0]); break;
      case 'fit': fit(); break;
      case 'mode-shaded':
        edgesOn = true;
        bodyMats.forEach(m => { m.wireframe = false; });
        bodyEdges.forEach((e, i) => { if (e) e.visible = bodyVisible[i]; });
        break;
      case 'mode-wire':
        edgesOn = false;
        bodyMats.forEach(m => { m.wireframe = true; });
        bodyEdges.forEach(e => { if (e) e.visible = false; });
        break;
      case 'ortho':
        ortho = !ortho;
        try { localStorage.setItem('cv3d-projection', ortho ? 'ortho' : 'persp'); } catch { /* storage blocked */ }
        root.dataset.projection = ortho ? 'ortho' : 'persp';
        statusHint.textContent = ortho ? 'Orthographic — true proportions, no perspective' : 'Perspective';
        break;
      case 'bbox':
        bboxOn = !bboxOn;
        if (bboxHelper) bboxHelper.visible = bboxOn;
        bboxLabels.forEach(l => { l.visible = bboxOn; });
        break;
      case 'grid':
        gridOn = !gridOn;
        if (grid) grid.visible = gridOn;
        if (shadowMesh) shadowMesh.visible = gridOn;
        statusHint.textContent = gridOn ? 'Ground shown' : 'Ground hidden';
        break;
      case 'color-none': setColorMode('none'); break;
      case 'facecolors': setColorMode(colorMode === 'facetype' ? 'none' : 'facetype'); break;
      case 'bodycolors': setColorMode(colorMode === 'body' ? 'none' : 'body'); break;
      case 'draft': setColorMode(colorMode === 'draft' ? 'none' : 'draft'); break;
      case 'thickness': setColorMode(colorMode === 'thickness' ? 'none' : 'thickness'); break;
      case 'costcolors': setColorMode(colorMode === 'cost' ? 'none' : 'cost'); break;
      case 'color-next': {
        const avail = COLOR_CYCLE.filter(m => { const prev = colorMode; colorMode = m; const ok = effectiveMode() === m; colorMode = prev; return ok; });
        setColorMode(avail[(avail.indexOf(effectiveMode()) + 1) % avail.length] ?? 'none');
        break;
      }
      case 'clip':
        if (togglePanel(clipPanel, 'clip')) {
          // Opening Section turns a plane on (Z, through the middle) so it does something at once.
          if (!AXES.some(a => clipState[a].on)) {
            clipState.z.on = true;
            faceCutToCamera('z');
            const cb = clipPanel.querySelector<HTMLInputElement>('input[data-clip-axis="z"]'); if (cb) cb.checked = true;
            applyClipping();
          }
          if (inspector.hidden && !opts.compact) setInspector(true);
          statusHint.textContent = 'Section — drag a slider; the cut face area is in the panel and the inspector';
        }
        break;
      case 'explode': togglePanel(explodePanel, 'explode'); break;
      case 'rotate':
        if (togglePanel(rotatePanel, 'rotate')) { buildRotatePanel(); statusHint.textContent = 'Rotate: pick a component, then drag its X / Y / Z slider'; }
        break;
      case 'move':
        if (togglePanel(movePanel, 'move')) { buildMovePanel(); statusHint.textContent = 'Move: pick a component, then drag its X / Y / Z slider (does not move the rest)'; }
        break;
      case 'tree': {
        if ((btn as HTMLButtonElement | null)?.disabled || !meta) break;
        const show = togglePanel(treeBox, 'tree');
        root.classList.toggle('cv3d--tree-open', show);
        if (show) buildTreePanel();
        break;
      }
      case 'inspector': setInspector(inspector.hidden); break;
      case 'maximize': setFullscreen(!maximized); break;
      case 'shortcuts': shortcutsEl.hidden = !shortcutsEl.hidden; break;
      case 'tool-select': setTool('select'); break;
      case 'tool-dist': setTool('dist'); break;
      case 'tool-circle': setTool('circle'); break;
      case 'tool-angle': setTool('angle'); break;
      case 'tool-point': setTool('point'); break;
      case 'tool-facedist': setTool('facedist'); break;
      case 'clear': clearMeasurements(); statusHint.textContent = 'Measurements cleared'; break;
      case 'snap': {
        renderer.render(scene, viewCam()); // without the view cube — a clean picture of the part
        const url = renderer.domElement.toDataURL('image/jpeg', 0.92);
        invalidate();
        if (opts.onSnapshot) {
          opts.onSnapshot(url);
          statusHint.textContent = 'Snapshot attached to report';
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = exportFilename('cad-view', null, 'jpg'); a.click();
          statusHint.textContent = 'Snapshot downloaded';
        }
        break;
      }
    }
    syncDock();
    invalidate(); // any action (mode/bbox/grid/view/panels) repaints once
  }

  dockWrap.addEventListener('click', (ev) => {
    const trigger = (ev.target as HTMLElement).closest<HTMLElement>('.cv3d-menu-trigger');
    if (trigger) { toggleMenu(trigger.dataset.menu!, (ev as MouseEvent).detail === 0); return; }
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.closest('.cv3d-menu')) closeMenus();
    runAction(btn.dataset.act!, btn);
  });
  $('.cv3d-shortcuts-close').addEventListener('click', () => { shortcutsEl.hidden = true; viewport.focus(); });

  // ── keyboard: active while the viewer has focus (click the model, or Tab to it) ──
  const KEYS: Record<string, string> = {
    h: 'view-iso', f: 'fit', '0': 'view-iso', '1': 'view-front', '2': 'view-back', '3': 'view-top', '4': 'view-bottom', '5': 'view-left', '6': 'view-right',
    d: 'tool-dist', r: 'tool-circle', a: 'tool-angle', p: 'tool-point', g: 'tool-facedist', m: 'tool-dist',
    s: 'clip', c: 'color-next', o: 'ortho', e: 'mode-shaded', w: 'mode-wire', b: 'bbox', t: 'tree', i: 'inspector', x: 'maximize', '?': 'shortcuts',
    delete: 'clear', backspace: 'clear',
  };
  root.addEventListener('keydown', (ev) => {
    const tgt = ev.target as HTMLElement;
    if (tgt.closest('input, select, textarea, .cv3d-menu') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape') {
      if (!shortcutsEl.hidden) { shortcutsEl.hidden = true; ev.stopPropagation(); return; }
      if (root.querySelector('.cv3d-menu:not([hidden])')) { closeMenus(); ev.stopPropagation(); return; }
      if (!picks.length && !maximized && tool !== 'select') { setTool('select'); syncDock(); ev.stopPropagation(); }
      return; // the window handler cancels picks / leaves full screen
    }
    // Arrows orbit 15° (Shift: pan); + / − zoom at the centre — the keyboard reaches every navigation.
    const step = Math.PI / 12;
    const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k] && nav) {
      const [ax, ay] = arrows[k];
      if (ev.shiftKey) nav.panBy(ax * 60, ay * 60); else nav.orbitBy(-ax * step, -ay * step);
      ev.preventDefault(); ev.stopPropagation();
      return;
    }
    if ((k === '+' || k === '=' || k === '-' || k === '_') && nav) {
      nav.zoomBy(k === '-' || k === '_' ? 1.25 : 0.8);
      ev.preventDefault(); ev.stopPropagation();
      return;
    }
    const act = KEYS[k];
    if (!act) return;
    if (act === 'tree' && !meta) return;
    ev.preventDefault();
    ev.stopPropagation(); // the viewer owns its keys while focused — "?" here is its sheet, not the Help Centre
    runAction(act, root.querySelector<HTMLElement>(`[data-act="${act}"]`));
  });
  canvas.addEventListener('pointerdown', () => { if (document.activeElement !== viewport && !viewport.contains(document.activeElement)) viewport.focus({ preventScroll: true }); });
  const onCanvasHover = (ev: PointerEvent) => {
    if (!viewCube) return;
    if (ev.buttons === 0 && viewCube.hover(ev, canvas)) invalidate();
    if (ev.buttons === 0) canvas.style.cursor = viewCube.contains(ev, canvas) ? 'pointer' : (tool === 'select' ? 'default' : 'crosshair');
  };
  canvas.addEventListener('pointermove', onCanvasHover);
  canvas.addEventListener('pointerleave', () => { if (viewCube?.hover(null, canvas)) invalidate(); });

  resize();
  setView([1, 0.8, 1], true);
  root.dataset.projection = ortho ? 'ortho' : 'persp';
  applyThemeToScene();
  const themeObserver = new MutationObserver(() => { if (isDarkTheme() !== darkTheme) applyThemeToScene(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try {
    const saved = localStorage.getItem('cv3d-inspector');
    setInspector(saved == null ? !opts.compact && host.clientWidth >= 1000 : saved === '1' && !opts.compact);
  } catch { setInspector(!opts.compact && host.clientWidth >= 1000); }
  renderInspector();
  syncDock();
  invalidate();

  return {
    loadFile,
    getMeasurements: measurementRecords,
    highlightFaces(faceIds: number[]): void {
      if (!faceIds?.length) { clearHighlight(); return; }
      highlightFaces(new Set(faceIds));
    },
    setGuardrails(items: GuardrailBannerItem[]): void {
      const show = items.filter(i => i.blocking && !i.acknowledged);
      if (!show.length) { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; return; }
      bannerEl.innerHTML = show.map((it, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:rgba(220,38,38,.92);color:#fff;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)">
          <span style="flex:1"><code style="opacity:.85">${it.code}</code> — ${it.message.replace(/</g, '&lt;')}</span>
          ${it.faceIds?.length ? `<button type="button" data-banner-idx="${i}" style="border:1px solid rgba(255,255,255,.7);background:transparent;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer">show me</button>` : ''}
        </div>`).join('');
      bannerEl.style.display = 'flex';
      bannerEl.querySelectorAll<HTMLButtonElement>('[data-banner-idx]').forEach(b => {
        b.onclick = () => { const it = show[Number(b.dataset.bannerIdx)]; if (it?.faceIds?.length) highlightFaces(new Set(it.faceIds)); };
      });
    },
    showEnvelope(envelopeMm: [number, number, number] | null, label?: string): void {
      if (envelopeHelper) { removeAndDispose(partGroup, envelopeHelper); envelopeHelper = null; }
      if (envelopeLabel) { removeAndDispose(scene, envelopeLabel); envelopeLabel = null; }
      if (!envelopeMm || !bodyMeshes.length) { invalidate(); return; }
      // The envelope is a sorted triple; map it onto the part's axes in size
      // order so the box is drawn the way the part would be loaded.
      const bb = new THREE.Box3();
      for (const m of bodyMeshes) bb.union(m.geometry.boundingBox!);
      const span = [partSpan.x, partSpan.y, partSpan.z];
      const axisOrder = [0, 1, 2].sort((a, b) => span[b] - span[a]);       // largest part axis first
      const envSorted = [...envelopeMm].sort((a, b) => b - a);            // largest envelope dim first
      const half = [0, 0, 0];
      axisOrder.forEach((axis, i) => { half[axis] = envSorted[i] / 2; });
      const c = bb.getCenter(new THREE.Vector3());
      const box = new THREE.Box3(new THREE.Vector3(c.x - half[0], c.y - half[1], c.z - half[2]), new THREE.Vector3(c.x + half[0], c.y + half[1], c.z + half[2]));
      envelopeHelper = new THREE.Box3Helper(box, new THREE.Color(0xdc2626));
      partGroup.add(envelopeHelper);
      partGroup.updateMatrixWorld(true);
      envelopeLabel = makeLabel(label ?? `machine envelope ${envelopeMm.map(d => d.toFixed(0)).join(' × ')} mm`, true);
      envelopeLabel.position.copy(new THREE.Vector3(c.x, box.max.y + partRadius * 0.1, box.max.z).applyMatrix4(partGroup.matrixWorld));
      scene.add(envelopeLabel);
      invalidate();
    },
    setFaceCosts(costs: Record<number, number> | null, extra?: { items?: CostItem[]; format?: (gbp: number) => string }): void {
      const first = !faceCosts && !!costs;
      faceCosts = costs;
      costItems = costs ? (extra?.items ?? []) : [];
      if (extra?.format) fmtMoney = extra.format;
      // The money goes on the model the first time a costing arrives; the user can switch it off after.
      if (first && colorMode === 'none') colorMode = 'cost';
      applyColorMode();
    },
    setIssues(items: ViewerIssue[] | null): void {
      hostIssues = items;
      renderInspector();
    },
    el: root,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      loadSeq++; // invalidate any in-flight load
      if (renderHandle) cancelAnimationFrame(renderHandle);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onDocPointerDown);
      clearTimeout(hintTimer);
      clearTimeout(tipTimer);
      if (sectionRaf) cancelAnimationFrame(sectionRaf);
      hatchTex?.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
      ro.disconnect();
      controls.dispose();
      if (viewCube) { try { viewCube.dispose(); } catch { /* already gone */ } viewCube = null; }
      themeObserver.disconnect();
      bgTexture?.dispose();
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => { /* not ours */ });
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      // free every GPU resource this instance created
      for (const h of highlightParts) { h.parent?.remove(h); disposeObject(h); }
      highlightParts = [];
      scene.traverse(disposeObject);
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* context may already be gone */ }
      if (edgeWorker) { edgeWorker.terminate(); edgeWorker = null; }
      if (bvhWorker) { bvhWorker.terminate(); bvhWorker = null; }
      nav?.dispose();
      root.remove();
    },
  };
}

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
export interface TessMeta { triFace: number[] | Uint32Array; faces: FaceMeta[]; bodies: number | null; skippedFaces?: number }

export interface MeasurementRecord {
  kind: 'dist' | 'circle' | 'angle' | 'point' | 'facedist';
  label: string;
  /** mm for dist/circle/facedist (circle = diameter), degrees for angle, 0 for point */
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
}

export interface CADViewerHandle {
  loadFile(file: File): Promise<void>;
  getMeasurements(): MeasurementRecord[];
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
const EDGE_WORKER_THRESHOLD = 30_000;
const EDGE_ANGLE_DEG = 24;

// ── Component ─────────────────────────────────────────────────────────────────

export async function createCADViewer(host: HTMLElement, opts: CADViewerOptions = {}): Promise<CADViewerHandle> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const { ViewHelper } = await import('three/examples/jsm/helpers/ViewHelper.js');
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
    return lowRes ? Math.min(dpr, 1.25) : Math.min(dpr * 1.5, 2.5);
  };

  // ── DOM scaffold ──
  const root = document.createElement('div');
  root.className = 'cv3d' + (opts.compact ? ' cv3d--compact' : '');
  root.innerHTML = `
    <div class="cv3d-viewport">
      <canvas class="cv3d-canvas"></canvas>
      <div class="cv3d-facechip" style="display:none"></div>
      <div class="cv3d-legend" style="display:none"></div>
      <div class="cv3d-tree" style="display:none">
        <div class="cv3d-measures-title">Model tree</div>
        <div class="cv3d-tree-list"></div>
      </div>
      <div class="cv3d-measures" style="display:none">
        <div class="cv3d-measures-title">Measurements <button class="cv3d-csv-btn" title="Export measurements as CSV">⬇ CSV</button></div>
        <div class="cv3d-measures-list"></div>
      </div>
      <div class="cv3d-features-panel" style="display:none">
        <div class="cv3d-measures-title">Features</div>
        <div class="cv3d-features-list"></div>
      </div>
      <div class="cv3d-bodies" style="display:none">
        <div class="cv3d-measures-title">Bodies</div>
        <div class="cv3d-bodies-list"></div>
      </div>
      <div class="cv3d-clip-panel" style="display:none">
        <span class="cv3d-clip-label">Section</span>
        <div class="cv3d-clip-axes">
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="x"/><span>X</span><input type="range" data-clip-slider="x" min="-100" max="100" value="0" step="1"/></label>
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="y"/><span>Y</span><input type="range" data-clip-slider="y" min="-100" max="100" value="0" step="1"/></label>
          <label class="cv3d-clip-row"><input type="checkbox" data-clip-axis="z"/><span>Z</span><input type="range" data-clip-slider="z" min="-100" max="100" value="0" step="1"/></label>
        </div>
        <button class="cv3d-clip-off" title="Turn section view off">off</button>
      </div>
      <div class="cv3d-explode-panel" style="display:none">
        <span class="cv3d-clip-label">Explode</span>
        <div class="cv3d-axis-seg" data-explode-axes>
          <button data-explode-axis="radial" class="active" title="Explode radially from the centre">Radial</button>
          <button data-explode-axis="x" title="Explode along X">X</button>
          <button data-explode-axis="y" title="Explode along Y">Y</button>
          <button data-explode-axis="z" title="Explode along Z">Z</button>
        </div>
        <input type="range" class="cv3d-explode-slider" min="0" max="100" value="0" step="1"/>
      </div>
      <div class="cv3d-rotate-panel" style="display:none">
        <span class="cv3d-clip-label">Rotate</span>
        <select class="cv3d-rotate-body" title="Component to rotate"></select>
        <label class="cv3d-clip-row"><span>X</span><input type="range" data-rot-axis="x" min="-180" max="180" value="0" step="1"/></label>
        <label class="cv3d-clip-row"><span>Y</span><input type="range" data-rot-axis="y" min="-180" max="180" value="0" step="1"/></label>
        <label class="cv3d-clip-row"><span>Z</span><input type="range" data-rot-axis="z" min="-180" max="180" value="0" step="1"/></label>
        <button class="cv3d-rotate-reset" title="Reset this component's rotation">Reset</button>
      </div>
    </div>
    <div class="cv3d-toolbar">
      <div class="cv3d-grp">
        <span class="cv3d-grp-cap">Views</span>
        <div class="cv3d-grp-row">
          <button data-act="view-iso" title="Isometric (Home)"><b>⌂</b><span>Home</span></button>
          <button data-act="view-front" title="Front view"><b>F</b><span>Front</span></button>
          <button data-act="view-top" title="Top view"><b>T</b><span>Top</span></button>
          <button data-act="view-right" title="Right view"><b>R</b><span>Right</span></button>
          <button data-act="fit" title="Fit part to screen"><b>⛶</b><span>Fit</span></button>
        </div>
      </div>
      <div class="cv3d-grp">
        <span class="cv3d-grp-cap">Display</span>
        <div class="cv3d-grp-row">
          <button data-act="mode-shaded" class="active" title="Shaded with edges"><b>◧</b><span>Shaded</span></button>
          <button data-act="mode-wire" title="Wireframe"><b>◇</b><span>Wire</span></button>
          <button data-act="bbox" title="Bounding box + dimensions"><b>▣</b><span>Box</span></button>
          <button data-act="grid" class="active" title="Show / hide the ground grid"><b>▦</b><span>Grid</span></button>
        </div>
      </div>
      <div class="cv3d-grp">
        <span class="cv3d-grp-cap">Analysis</span>
        <div class="cv3d-grp-row">
          <button data-act="facecolors" title="Colour by machining surface type (STEP/IGES only)" disabled><b>🎨</b><span>Faces</span></button>
          <button data-act="bodycolors" title="Colour each component a distinct colour (multi-body assemblies)" disabled><b>🧩</b><span>Components</span></button>
          <button data-act="draft" title="Draft &amp; undercut analysis — colour by pull direction"><b>📐</b><span>Draft</span></button>
          <button data-act="thickness" title="Wall-thickness heatmap (STEP/IGES only)" disabled><b>🌡</b><span>Thickness</span></button>
        </div>
      </div>
      <div class="cv3d-grp">
        <span class="cv3d-grp-cap">Structure</span>
        <div class="cv3d-grp-row">
          <button data-act="tree" title="Model tree — bodies, features &amp; face types (STEP/IGES only)" disabled><b>☰</b><span>Tree</span></button>
          <button data-act="features" title="Detected features — holes &amp; bosses (STEP/IGES only)" disabled><b>◎</b><span>Holes</span></button>
          <button data-act="clip" title="Section view — clipping planes (X/Y/Z)"><b>✂</b><span>Section</span></button>
          <button data-act="explode" title="Exploded view (multi-body only)" disabled><b>💥</b><span>Explode</span></button>
          <button data-act="rotate" title="Rotate a component about its own X / Y / Z" disabled><b>⟳</b><span>Rotate</span></button>
        </div>
      </div>
      <div class="cv3d-grp cv3d-grp--measure">
        <span class="cv3d-grp-cap">Measure &amp; Inspect</span>
        <div class="cv3d-grp-row">
          <button data-act="tool-select" class="active" title="Select — click a face for exact B-rep data"><b>➤</b><span>Select</span></button>
          <button data-act="tool-dist" title="Distance — click two points (snaps to vertices &amp; edges)"><b>↔</b><span>Distance</span></button>
          <button data-act="tool-circle" title="Radius / diameter — click 3 points on a rim or bore"><b>◯</b><span>Radius</span></button>
          <button data-act="tool-angle" title="Angle — click 3 points (vertex is the middle click)"><b>∠</b><span>Angle</span></button>
          <button data-act="tool-point" title="Point — read X / Y / Z coordinates"><b>⌖</b><span>Point</span></button>
          <button data-act="tool-facedist" title="Face-to-face — perpendicular distance between two faces"><b>⊥</b><span>Face–Face</span></button>
          <button data-act="clear" title="Clear measurements &amp; selection"><b>✕</b><span>Clear</span></button>
        </div>
      </div>
      <div class="cv3d-grp">
        <span class="cv3d-grp-cap">Capture</span>
        <div class="cv3d-grp-row">
          <button data-act="snap" title="Snapshot — ${opts.onSnapshot ? 'attach to report' : 'download image'}"><b>📷</b><span>Snapshot</span></button>
          <button data-act="maximize" title="Maximize viewer (Esc to exit)"><b>⤢</b><span>Expand</span></button>
        </div>
      </div>
    </div>
    <div class="cv3d-status">
      <span class="cv3d-status-file">No file loaded</span>
      <span class="cv3d-status-dims"></span>
      <span class="cv3d-status-hint">Drag to rotate · scroll to zoom · right-drag to pan · double-click to set orbit centre</span>
    </div>`;
  host.appendChild(root);

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>('.cv3d-canvas');
  const viewport = $('.cv3d-viewport');
  const faceChip = $('.cv3d-facechip');
  const legendEl = $('.cv3d-legend');
  const measuresBox = $('.cv3d-measures');
  const measuresList = $('.cv3d-measures-list');
  const featuresBox = $('.cv3d-features-panel');
  const featuresList = $('.cv3d-features-list');
  const bodiesBox = $('.cv3d-bodies');
  const bodiesList = $('.cv3d-bodies-list');
  const treeBox = $('.cv3d-tree');
  const treeList = $('.cv3d-tree-list');
  const clipPanel = $('.cv3d-clip-panel');
  const explodePanel = $('.cv3d-explode-panel');
  const explodeSlider = $<HTMLInputElement>('.cv3d-explode-slider');
  const rotatePanel = $('.cv3d-rotate-panel');
  const rotateBodySelect = $<HTMLSelectElement>('.cv3d-rotate-body');
  const statusFile = $('.cv3d-status-file');
  const statusDims = $('.cv3d-status-dims');
  const statusHint = $('.cv3d-status-hint');

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
  scene.background = new THREE.Color(0xffffff);

  // Lighting is direct-only (hemisphere + key + rim, set up below). An earlier
  // image-based-lighting (RoomEnvironment) pass washed the matte grey material
  // out to near-white, so it was removed to restore the solid CAD grey the user
  // preferred — the smoothness comes from creased normals, not the IBL.
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true; // CAD convention: zoom at the pointer, not the screen centre

  // Orientation cube (bottom-right gizmo) — click a face/axis to snap to that view.
  type ViewHelperT = InstanceType<typeof ViewHelper>;
  let viewHelper: ViewHelperT | null = null;
  try {
    viewHelper = new ViewHelper(camera, renderer.domElement);
    viewHelper.location = { top: null, right: 8, bottom: 8, left: null };
  } catch { viewHelper = null; }
  const clock = new THREE.Clock();

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
  type Vec3 = InstanceType<typeof THREE.Vector3>;
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
  let meta: TessMeta | null = null;
  let triFaceAll: Uint32Array | null = null;   // reordered per-triangle face ids
  let masterPositions: Float32Array | null = null; // reordered, centred positions
  let partRadius = 1;
  let partSpan = { x: 0, y: 0, z: 0 };
  let edgesOn = true;
  let bodyVisible: boolean[] = [];
  let fileKey = '';
  let disposed = false;
  let loadSeq = 0;
  let maximized = false;
  let draftOn = false;
  let draftAxis: 'x' | 'y' | 'z' = 'z'; // moulding/casting pull defaults to part Z
  let thicknessOn = false;
  let thicknessRange: { min: number; max: number } | null = null;
  let explodeFactor = 0;
  let explodeAxis: 'radial' | 'x' | 'y' | 'z' = 'radial';
  let bodyExplodeDir: Array<InstanceType<typeof THREE.Vector3>> = []; // per-body explode vector (dir × relative distance)
  let bodyCentroid: Array<InstanceType<typeof THREE.Vector3>> = [];   // per-body centroid (part space) — rotation pivot
  let bodyRot: Array<{ x: number; y: number; z: number }> = [];       // per-body rotation in degrees
  let gridOn = true;
  let bodyColorsOn = false;

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
  function computeEdgesAsync(positions: Float32Array): Promise<Float32Array> {
    if (positions.length / 9 <= EDGE_WORKER_THRESHOLD) return Promise.resolve(computeEdgesSync(positions));
    if (edgeWorker === undefined) {
      try {
        edgeWorker = new Worker(new URL('./cad-edges-worker.ts', import.meta.url), { type: 'module' });
      } catch { edgeWorker = null; }
    }
    if (!edgeWorker) return Promise.resolve(computeEdgesSync(positions));
    const worker = edgeWorker;
    return new Promise((resolve) => {
      const onMsg = (ev: MessageEvent<{ positions?: Float32Array; error?: string }>) => {
        worker.removeEventListener('message', onMsg);
        if (ev.data.positions) resolve(ev.data.positions);
        else resolve(computeEdgesSync(positions)); // worker failed — sync fallback
      };
      worker.addEventListener('message', onMsg);
      const copy = positions.slice(); // keep the original for the mesh
      worker.postMessage({ positions: copy, angleDeg: EDGE_ANGLE_DEG }, [copy.buffer]);
    });
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
    const all = [...bboxLabels, ...overlayGroup.children.filter(o => (o as { isSprite?: boolean }).isSprite)];
    for (const sp of all) {
      const d = camera.position.distanceTo((sp as Sprite3).position);
      const h = d * 0.045 * (opts.compact ? 1.4 : 1);
      const aspect = (sp as unknown as { __aspect?: number }).__aspect ?? 4;
      (sp as Sprite3).scale.set(h * aspect, h, 1);
    }
  }

  // ── render loop — on-demand ──────────────────────────────────────────────
  // The scene is static between interactions, so instead of rendering 60 fps
  // forever we render only when something changes: invalidate() schedules one
  // frame; camera motion (controls 'change'), resize, load, and every scene
  // mutation call it. The frame keeps re-scheduling itself while OrbitControls
  // damping or the ViewHelper animation is still settling, then stops.
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
  function frame(): void {
    renderPending = false;
    if (disposed) return;
    const delta = clock.getDelta();
    let animating = false;
    if (viewHelper) {
      viewHelper.center = controls.target; // orbit the cube about the current target
      if (viewHelper.animating) { viewHelper.update(delta); animating = true; }
    }
    const moved = controls.update(); // true while damping is still settling
    scaleLabels();
    renderer.render(scene, camera);
    if (viewHelper) {
      // ViewHelper.render() calls renderer.render() internally; with the default
      // autoClear=true that would CLEAR the whole framebuffer (wiping the scene we
      // just drew) before painting the gizmo in its corner. Suppress the clear.
      renderer.autoClear = false;
      viewHelper.render(renderer);
      renderer.autoClear = true;
    }
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

  // ── views ──
  function setView(dir: [number, number, number]): void {
    const len = Math.hypot(...dir) || 1;
    const d = partRadius * 2.6;
    camera.position.set((dir[0] / len) * d, (dir[1] / len) * d, (dir[2] / len) * d);
    controls.target.set(0, 0, 0);
    controls.update();
  }
  const fit = () => setView([1, 0.8, 1]);

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
  const clipState: Record<Axis, { on: boolean; off: number }> = {
    x: { on: false, off: 0 }, y: { on: false, off: 0 }, z: { on: false, off: 0 },
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
      // keep fragments where axis·p ≤ offset (slider slides the cut through the part)
      clipPlanes[a].normal.set(-nx, -ny, -nz);
      clipPlanes[a].constant = offset;
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
    invalidate();
  }

  // ── load ──
  async function loadFile(file: File): Promise<void> {
    const mySeq = ++loadSeq;
    const stale = () => disposed || mySeq !== loadSeq;
    meta = null;
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
      };
      stlBuf = frame.slice(4 + headerLen, 4 + headerLen + header.stlBytes);
      const triOff = 4 + headerLen + header.stlBytes;
      const triFace = new Uint32Array(header.triFaceCount);
      for (let i = 0; i < header.triFaceCount; i++) triFace[i] = dv.getUint32(triOff + i * 4, true);
      meta = { triFace, faces: header.faces, bodies: header.bodies, skippedFaces: header.skippedFaces };
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
    partSpan = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    partRadius = Math.hypot(partSpan.x, partSpan.y, partSpan.z) / 2 || 1;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx; positions[i + 1] -= cy; positions[i + 2] -= cz;
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
        raw.setAttribute('position', new THREE.BufferAttribute(slice.slice(), 3));
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

    // edge overlays — off-thread for large bodies; results checked against seq
    bodyMeshes.forEach((mesh, bi) => {
      const pos = (mesh.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).array as Float32Array;
      void computeEdgesAsync(pos).then((edgePositions) => {
        if (stale()) return;
        const eg = new THREE.BufferGeometry();
        eg.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
        const line = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x11141a, transparent: true, opacity: 0.85 }));
        line.visible = edgesOn && bodyVisible[bi];
        partGroup.add(line);
        bodyEdges[bi] = line;
        applyClipping();
      });
    });

    const gridSize = Math.max(partSpan.x, partSpan.y) * 2.2 || 10;
    grid = new THREE.GridHelper(gridSize, 20, 0x9aa4b0, 0xdde2e8); // light greys — readable on the white viewport
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -partSpan.z / 2 - partRadius * 0.02;
    grid.visible = gridOn;
    partGroup.add(grid);

    buildBBox();
    updateFrustum();

    const bodies = meta?.bodies;
    const bodyText = bodies == null ? (bodyMeshes.length === 1 ? '1 body' : `${bodyMeshes.length} bodies`)
      : bodies === 0 ? '⚠ surface model (no closed solid)'
      : `${bodies} ${bodies === 1 ? 'body' : 'bodies'}`;
    const skippedText = meta?.skippedFaces ? ` · ⚠ ${meta.skippedFaces} faces unmeshed` : '';
    statusFile.textContent = `${file.name} · ${triangles.toLocaleString()} triangles${meta ? ` · ${meta.faces.length} faces` : ''} · ${bodyText}${skippedText}`;
    statusDims.textContent = `X ${partSpan.x.toFixed(2)} · Y ${partSpan.y.toFixed(2)} · Z ${partSpan.z.toFixed(2)} mm`;

    const fcBtn = $<HTMLButtonElement>('[data-act="facecolors"]');
    fcBtn.disabled = !meta;
    fcBtn.title = meta ? 'Colour by machining surface type' : 'Face types need STEP/IGES (B-rep) — STL is mesh-only';
    const featBtn = $<HTMLButtonElement>('[data-act="features"]');
    const hasCyl = !!meta?.faces.some(f => f.type === 'cylinder');
    featBtn.disabled = !hasCyl;
    featBtn.title = hasCyl ? 'Detected features — holes & bosses' : 'Feature detection needs STEP/IGES with cylindrical faces';
    const treeBtn = $<HTMLButtonElement>('[data-act="tree"]');
    treeBtn.disabled = !meta;
    treeBtn.title = meta ? 'Model tree — bodies, features & face types' : 'Model tree needs STEP/IGES (B-rep) — STL is mesh-only';
    const explodeBtn = $<HTMLButtonElement>('[data-act="explode"]');
    explodeBtn.disabled = bodyMeshes.length < 2;
    explodeBtn.title = bodyMeshes.length < 2 ? 'Exploded view needs a multi-body model' : 'Exploded view';
    // component colouring — assemblies only (≥2 bodies)
    const bcBtn = $<HTMLButtonElement>('[data-act="bodycolors"]');
    bcBtn.disabled = bodyMeshes.length < 2;
    bcBtn.title = bodyMeshes.length < 2 ? 'Component colours need a multi-body assembly' : 'Colour each component a distinct colour';
    if (bodyMeshes.length < 2) { bodyColorsOn = false; bcBtn.classList.remove('active'); }
    // per-component rotate — any loaded model (rotates the whole part when single-body)
    const rotBtn = $<HTMLButtonElement>('[data-act="rotate"]');
    rotBtn.disabled = bodyMeshes.length < 1;
    // wall-thickness heatmap: enabled only when the sidecar carries per-face thickness
    const thkVals = (meta?.faces ?? []).map(f => f.thicknessMm).filter((v): v is number => typeof v === 'number' && v > 0);
    thicknessRange = thkVals.length >= 2 ? { min: Math.min(...thkVals), max: Math.max(...thkVals) } : null;
    const thkBtn = $<HTMLButtonElement>('[data-act="thickness"]');
    thkBtn.disabled = !thicknessRange;
    thkBtn.title = thicknessRange ? 'Wall-thickness heatmap' : 'Wall thickness needs STEP/IGES (B-rep) — STL is mesh-only';
    if (!thicknessRange) { thicknessOn = false; thkBtn.classList.remove('active'); }

    // reset section + explode + rotate state for the new part
    explodeFactor = 0; explodeSlider.value = '0';
    bodyRot = bodyMeshes.map(() => ({ x: 0, y: 0, z: 0 }));
    (['x', 'y', 'z'] as const).forEach(a => {
      clipState[a].on = false; clipState[a].off = 0;
      const cb = clipPanel.querySelector(`input[data-clip-axis="${a}"]`) as HTMLInputElement | null; if (cb) cb.checked = false;
      const sl = clipPanel.querySelector(`input[data-clip-slider="${a}"]`) as HTMLInputElement | null; if (sl) sl.value = '0';
    });

    buildBodiesPanel();
    buildFeaturesPanel();
    computeExplodeDirs();
    buildRotatePanel();
    applyBodyTransforms(); // clear any stale explode/rotation offsets
    if (treeBox.style.display !== 'none') buildTreePanel();
    applyColorMode(); // reapply active face-type / draft / component shading to the new meshes
    applyClipping();

    resize();
    fit();

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
  function buildBodiesPanel(): void {
    if (bodyMeshes.length < 2) { bodiesBox.style.display = 'none'; bodiesList.innerHTML = ''; return; }
    bodiesBox.style.display = '';
    bodiesList.innerHTML = bodyMeshes.map((_, i) =>
      `<label class="cv3d-body-row"><input type="checkbox" data-body="${i}" checked/> Body ${i + 1}</label>`).join('');
    bodiesList.querySelectorAll('input[data-body]').forEach(cb => {
      cb.addEventListener('change', () => {
        const i = Number((cb as HTMLInputElement).dataset.body);
        setBodyVisible(i, (cb as HTMLInputElement).checked);
        const t = treeList.querySelector(`input[data-tbody="${i}"]`) as HTMLInputElement | null;
        if (t) t.checked = bodyVisible[i];
      });
    });
  }

  function setBodyVisible(i: number, vis: boolean): void {
    bodyVisible[i] = vis;
    bodyMeshes[i].visible = vis;
    const e = bodyEdges[i];
    if (e) e.visible = vis && edgesOn;
  }

  // ── model tree (bodies · features · faces by type) ──
  let treeTypeIds: Map<string, number[]> | null = null;
  function buildTreePanel(): void {
    treeList.innerHTML = '';
    treeTypeIds = null;
    if (!bodyMeshes.length) { treeList.innerHTML = '<div class="cv3d-tree-row">No model loaded</div>'; return; }
    const parts: string[] = [];
    parts.push(`<div class="cv3d-tree-group">Bodies · ${bodyMeshes.length}</div>`);
    parts.push(bodyMeshes.map((_, i) =>
      `<label class="cv3d-tree-row cv3d-tree-body"><input type="checkbox" data-tbody="${i}" ${bodyVisible[i] ? 'checked' : ''}/> Body ${i + 1}</label>`).join(''));
    if (featureGroups.length) {
      parts.push(`<div class="cv3d-tree-group">Features · ${featureGroups.length}</div>`);
      parts.push(featureGroups.map((g, i) =>
        `<div class="cv3d-tree-row cv3d-tree-click" data-tfeat="${i}">${g.kind === 'hole' ? '◎' : '⬤'} ${g.kind === 'hole' ? 'Hole' : 'Boss'} Ø${g.diaMm.toFixed(1)}${g.depthMm != null ? `×${g.depthMm.toFixed(1)}` : ''} · ${g.faceIds.length}</div>`).join(''));
    }
    if (meta) {
      const byType = new Map<string, number[]>();
      for (const f of meta.faces) { if (!byType.has(f.type)) byType.set(f.type, []); byType.get(f.type)!.push(f.id); }
      treeTypeIds = byType;
      const typesSorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
      parts.push(`<div class="cv3d-tree-group">Faces by type · ${meta.faces.length}</div>`);
      parts.push(typesSorted.map(([t, ids]) =>
        `<div class="cv3d-tree-row cv3d-tree-click" data-ttype="${t}"><i style="background:${rgbCss(FACE_COLORS[t] ?? FACE_COLORS.other)}"></i>${FACE_TYPE_LABEL[t] ?? t} · ${ids.length}</div>`).join(''));
    } else {
      parts.push('<div class="cv3d-tree-row">Face tree needs STEP/IGES (B-rep) — STL is mesh-only</div>');
    }
    treeList.innerHTML = parts.join('');
    treeList.querySelectorAll('input[data-tbody]').forEach(cb => cb.addEventListener('change', () => {
      const i = Number((cb as HTMLInputElement).dataset.tbody);
      setBodyVisible(i, (cb as HTMLInputElement).checked);
      const b = bodiesList.querySelector(`input[data-body="${i}"]`) as HTMLInputElement | null;
      if (b) b.checked = bodyVisible[i];
    }));
    treeList.querySelectorAll('[data-tfeat]').forEach(row => row.addEventListener('click', () => {
      const g = featureGroups[Number((row as HTMLElement).dataset.tfeat)];
      if (!g) return;
      highlightFaces(new Set(g.faceIds));
      faceChip.innerHTML = `<strong>${g.faceIds.length} × ${g.kind === 'hole' ? 'hole/bore' : 'boss/shaft'} Ø ${g.diaMm.toFixed(2)} mm</strong>`;
      faceChip.style.display = '';
    }));
    treeList.querySelectorAll('[data-ttype]').forEach(row => row.addEventListener('click', () => {
      const t = (row as HTMLElement).dataset.ttype!;
      const ids = treeTypeIds?.get(t);
      if (!ids) return;
      highlightFaces(new Set(ids));
      faceChip.innerHTML = `<strong>${ids.length} × ${FACE_TYPE_LABEL[t] ?? t}</strong>`;
      faceChip.style.display = '';
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
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * DEG2RAD, r.y * DEG2RAD, r.z * DEG2RAD));
      // displayed = R·(v − c) + c + off  ⇒  position = c − R·c + off, quaternion = R
      const pos = c.clone().sub(c.clone().applyQuaternion(q)).add(off);
      bodyMeshes[i].quaternion.copy(q);
      bodyMeshes[i].position.copy(pos);
      const e = bodyEdges[i];
      if (e) { e.quaternion.copy(q); e.position.copy(pos); }
    }
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

  // ── features panel (holes & bosses from exact B-rep data) ──
  interface FeatureGroup { kind: 'hole' | 'boss'; diaMm: number; depthMm: number | null; faceIds: number[] }
  let featureGroups: FeatureGroup[] = [];
  function buildFeaturesPanel(): void {
    featureGroups = [];
    featuresList.innerHTML = '';
    if (!meta) return;
    const groups = new Map<string, FeatureGroup>();
    for (const f of meta.faces) {
      if (f.type !== 'cylinder' || f.radiusMm == null || f.hole == null) continue;
      const kind = f.hole ? 'hole' : 'boss';
      const dia = Math.round(f.radiusMm * 2 * 100) / 100;
      const depth = f.depthMm != null ? Math.round(f.depthMm * 10) / 10 : null;
      const key = `${kind}:${dia}:${depth ?? '?'}`;
      if (!groups.has(key)) groups.set(key, { kind, diaMm: dia, depthMm: depth, faceIds: [] });
      groups.get(key)!.faceIds.push(f.id);
    }
    featureGroups = [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.diaMm - b.diaMm);
    featuresList.innerHTML = featureGroups.map((g, i) =>
      `<div class="cv3d-measure-row cv3d-feature-row" data-feat="${i}">
        <span>${g.kind === 'hole' ? '◎' : '⬤'} ${g.kind === 'hole' ? 'Hole' : 'Boss'} Ø ${g.diaMm.toFixed(2)}${g.depthMm != null ? ` × ${g.depthMm.toFixed(1)} deep` : ''} mm × ${g.faceIds.length}</span>
      </div>`).join('') || '<div class="cv3d-measure-row"><span>No cylindrical features detected</span></div>';
    featuresList.querySelectorAll('[data-feat]').forEach(row => {
      row.addEventListener('click', () => {
        const g = featureGroups[Number((row as HTMLElement).dataset.feat)];
        if (!g) return;
        highlightFaces(new Set(g.faceIds));
        faceChip.innerHTML = `<strong>${g.faceIds.length} × ${g.kind === 'hole' ? 'hole/bore' : 'boss/shaft'} Ø ${g.diaMm.toFixed(2)} mm</strong>` +
          `<span>R ${(g.diaMm / 2).toFixed(3)} mm <em>(exact, from B-rep)</em></span>`;
        faceChip.style.display = '';
      });
    });
  }

  // ── picking / tools ──
  type Tool = 'select' | 'dist' | 'circle' | 'angle' | 'point' | 'facedist';
  let tool: Tool = 'select';
  let picks: Vec3[] = [];
  let pickMarkers: Mesh3[] = [];
  let pickNormals: Vec3[] = []; // world-space face normals captured for face-to-face measure
  const raycaster = new THREE.Raycaster();

  function screenToNDC(ev: PointerEvent | MouseEvent): InstanceType<typeof THREE.Vector2> {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  function raycastMeshes(ev: PointerEvent | MouseEvent) {
    raycaster.setFromCamera(screenToNDC(ev), camera);
    return raycaster.intersectObjects(bodyMeshes.filter(m => m.visible), false);
  }

  /** Snap the hit to the nearest triangle VERTEX (≤14 px) or EDGE (≤10 px). */
  function snapPoint(hit: { point: Vec3; face: { a: number; b: number; c: number } | null; object: Obj3 }, ev: PointerEvent): Vec3 {
    if (!hit.face) return hit.point.clone();
    const mesh = hit.object as Mesh3;
    const pos = mesh.geometry.getAttribute('position');
    const r = canvas.getBoundingClientRect();
    const screenDist = (world: Vec3) => {
      const p = world.clone().project(camera);
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
    measuresBox.style.display = measurements.length ? '' : 'none';
    measuresList.innerHTML = measurements.map((m, i) =>
      `<div class="cv3d-measure-row"><span>${m.record.label}</span><button data-del="${i}" title="Remove">✕</button></div>`).join('');
    measuresList.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number((btn as HTMLElement).dataset.del);
        measurements[i]?.objects.forEach(o => removeAndDispose(overlayGroup, o));
        measurements.splice(i, 1);
        measurementsChanged();
      });
    });
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
    a.download = 'cad-measurements.csv';
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
    faceChip.style.display = 'none';
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
    const local = p.clone().applyMatrix4(partInv); // world → part (CAD) coordinates
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
    const tris: number[] = [];
    for (let t = 0; t < triFaceAll.length; t++) if (faceIds.has(triFaceAll[t])) tris.push(t);
    if (!tris.length) return;
    const hp = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => hp.set(masterPositions!.subarray(t * 9, t * 9 + 9), i * 9));
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.computeVertexNormals();
    highlight = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x4f8ef7, transparent: true, opacity: 0.55, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    highlight.applyMatrix4(partGroup.matrixWorld);
    overlayGroup.add(highlight);
    applyClipping();
  }

  function selectFace(triGlobal: number): void {
    clearHighlight();
    if (!meta || !triFaceAll) {
      faceChip.innerHTML = `<strong>Mesh triangle #${triGlobal}</strong><span>Exact face data needs STEP/IGES (B-rep). STL carries mesh only.</span>`;
      faceChip.style.display = '';
      return;
    }
    const faceId = triFaceAll[triGlobal];
    const face = meta.faces[faceId];
    if (!face) return;
    highlightFaces(new Set([faceId]));

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
    bits.push(`<span>${triCount} triangles</span>`);
    faceChip.innerHTML = bits.join('');
    faceChip.style.display = '';
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
    if (wasClick && viewHelper && viewHelper.handleClick(ev)) return;
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
    const hits = raycastMeshes(ev);
    if (hits.length) {
      controls.target.copy(hits[0].point);
      statusHint.textContent = 'Orbit centre set — double-click empty space to reset';
    } else {
      controls.target.set(0, 0, 0);
      statusHint.textContent = 'Orbit centre reset';
    }
    controls.update();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    if (picks.length) { finishPicks(); statusHint.textContent = 'Cancelled'; }
    else if (maximized) {
      maximized = false;
      root.classList.remove('cv3d--max');
      $('[data-act="maximize"]').classList.remove('active');
      requestAnimationFrame(resize);
    }
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  // ── toolbar wiring ──
  let faceColorsOn = false;
  const rgbCss = (c: [number, number, number]) => `rgb(${c.map(x => Math.round(x * 255)).join(',')})`;

  /** Single vertex-colour engine: face-type colouring and draft/undercut
   *  shading are mutually exclusive. Rebuilds the colour buffer for the active
   *  mode (or strips it when neither is on). */
  function applyColorMode(): void {
    const mode: 'none' | 'facetype' | 'draft' | 'thickness' | 'body' =
      draftOn ? 'draft'
      : (thicknessOn && meta && triFaceAll && thicknessRange) ? 'thickness'
      : (faceColorsOn && meta ? 'facetype' : (bodyColorsOn && bodyMeshes.length >= 2 ? 'body' : 'none'));
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
      if (mode === 'facetype' && meta && triFaceAll) {
        const triOffset = mesh.userData.triOffset as number;
        for (let t = 0; t < nTris; t++) {
          const f = meta.faces[triFaceAll[triOffset + t]];
          const col = FACE_COLORS[f?.type ?? 'other'] ?? FACE_COLORS.other;
          for (let v = 0; v < 3; v++) colors.set(col, t * 9 + v * 3);
        }
      } else if (mode === 'thickness' && meta && triFaceAll && thicknessRange) {
        const triOffset = mesh.userData.triOffset as number;
        const { min, max } = thicknessRange;
        const span = (max - min) || 1;
        for (let t = 0; t < nTris; t++) {
          const thk = meta.faces[triFaceAll[triOffset + t]]?.thicknessMm;
          const col = thk == null ? NO_THICKNESS_COLOR : thicknessColor((thk - min) / span);
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
    if (mode === 'facetype' && meta) {
      const present = [...new Set(meta.faces.map(f => f.type))];
      legendEl.innerHTML = present.map(t =>
        `<span><i style="background:${rgbCss(FACE_COLORS[t] ?? FACE_COLORS.other)}"></i>${FACE_TYPE_LABEL[t] ?? t}</span>`).join('');
    } else if (mode === 'draft') {
      legendEl.innerHTML = (['undercut', 'zero', 'ok', 'neutral'] as DraftClass[]).map(k =>
        `<span><i style="background:${rgbCss(DRAFT_COLORS[k])}"></i>${DRAFT_LABEL[k]}</span>`).join('') +
        `<span style="opacity:.75">Pull axis: ${draftAxis.toUpperCase()} — click 📐 to cycle</span>`;
    } else if (mode === 'thickness' && thicknessRange) {
      const { min, max } = thicknessRange, mid = (min + max) / 2;
      legendEl.innerHTML = `<span style="opacity:.75">Wall thickness</span>` +
        `<span><i style="background:${rgbCss(thicknessColor(0))}"></i>${min.toFixed(1)} mm (thin)</span>` +
        `<span><i style="background:${rgbCss(thicknessColor(0.5))}"></i>${mid.toFixed(1)} mm</span>` +
        `<span><i style="background:${rgbCss(thicknessColor(1))}"></i>${max.toFixed(1)} mm (thick)</span>`;
    } else if (mode === 'body') {
      legendEl.innerHTML = bodyMeshes.map((_, i) =>
        `<span><i style="background:${rgbCss(bodyColorRGB(i))}"></i>Body ${i + 1}</span>`).join('');
    }
    legendEl.style.display = mode === 'none' ? 'none' : '';
    invalidate();
  }

  function setTool(t: Tool): void {
    tool = t;
    finishPicks();
    root.querySelectorAll('[data-act^="tool-"]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.act === `tool-${t}`));
    canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    statusHint.textContent = t === 'select' ? 'Click a face for exact B-rep data'
      : t === 'dist' ? 'Distance: pick two points (snaps to vertices & edges)'
      : t === 'circle' ? 'Circle: pick 3 points on a rim or bore'
      : t === 'angle' ? 'Angle: pick point, corner, point'
      : t === 'point' ? 'Point: click to read X/Y/Z coordinates'
      : 'Face-to-face: pick a point on each of two faces';
  }

  $('.cv3d-csv-btn').addEventListener('click', (ev) => { ev.stopPropagation(); exportCSV(); });
  clipPanel.querySelectorAll('input[data-clip-axis]').forEach(cb => cb.addEventListener('change', () => {
    const a = (cb as HTMLInputElement).dataset.clipAxis as 'x' | 'y' | 'z';
    clipState[a].on = (cb as HTMLInputElement).checked;
    applyClipping();
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
    $('[data-act="clip"]').classList.remove('active');
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

  root.querySelector('.cv3d-toolbar')!.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    const act = btn.dataset.act!;
    switch (act) {
      case 'view-iso': setView([1, 0.8, 1]); break;
      case 'view-front': setView([0, 0, 1]); break;
      case 'view-top': setView([0, 1, 0.0001]); break;
      case 'view-right': setView([1, 0, 0]); break;
      case 'fit': fit(); break;
      case 'mode-shaded':
        edgesOn = true;
        bodyMats.forEach(m => { m.wireframe = false; });
        bodyEdges.forEach((e, i) => { if (e) e.visible = bodyVisible[i]; });
        root.querySelector('[data-act="mode-wire"]')?.classList.remove('active');
        btn.classList.add('active');
        break;
      case 'mode-wire':
        edgesOn = false;
        bodyMats.forEach(m => { m.wireframe = true; });
        bodyEdges.forEach(e => { if (e) e.visible = false; });
        root.querySelector('[data-act="mode-shaded"]')?.classList.remove('active');
        btn.classList.add('active');
        break;
      case 'bbox':
        bboxOn = !bboxOn;
        btn.classList.toggle('active', bboxOn);
        if (bboxHelper) bboxHelper.visible = bboxOn;
        bboxLabels.forEach(l => { l.visible = bboxOn; });
        break;
      case 'grid':
        gridOn = !gridOn;
        btn.classList.toggle('active', gridOn);
        if (grid) grid.visible = gridOn;
        statusHint.textContent = gridOn ? 'Ground grid shown' : 'Ground grid hidden';
        break;
      case 'facecolors':
        faceColorsOn = !faceColorsOn;
        if (faceColorsOn) {
          draftOn = false; thicknessOn = false; bodyColorsOn = false;
          root.querySelector('[data-act="draft"]')?.classList.remove('active');
          root.querySelector('[data-act="thickness"]')?.classList.remove('active');
          root.querySelector('[data-act="bodycolors"]')?.classList.remove('active');
        }
        btn.classList.toggle('active', faceColorsOn);
        applyColorMode();
        break;
      case 'bodycolors':
        bodyColorsOn = !bodyColorsOn;
        if (bodyColorsOn) {
          faceColorsOn = false; draftOn = false; thicknessOn = false;
          root.querySelector('[data-act="facecolors"]')?.classList.remove('active');
          root.querySelector('[data-act="draft"]')?.classList.remove('active');
          root.querySelector('[data-act="thickness"]')?.classList.remove('active');
        }
        btn.classList.toggle('active', bodyColorsOn);
        applyColorMode();
        statusHint.textContent = bodyColorsOn ? 'Components coloured — each body a distinct colour' : 'Component colours off';
        break;
      case 'draft':
        // click cycles the pull axis: off → Z → X → Y → off
        faceColorsOn = false; thicknessOn = false; bodyColorsOn = false;
        root.querySelector('[data-act="facecolors"]')?.classList.remove('active');
        root.querySelector('[data-act="thickness"]')?.classList.remove('active');
        root.querySelector('[data-act="bodycolors"]')?.classList.remove('active');
        if (!draftOn) { draftOn = true; draftAxis = 'z'; }
        else if (draftAxis === 'z') draftAxis = 'x';
        else if (draftAxis === 'x') draftAxis = 'y';
        else draftOn = false;
        btn.classList.toggle('active', draftOn);
        applyColorMode();
        statusHint.textContent = draftOn ? `Draft analysis — pull axis ${draftAxis.toUpperCase()} (click again to change)` : 'Draft analysis off';
        break;
      case 'thickness':
        thicknessOn = !thicknessOn;
        if (thicknessOn) {
          draftOn = false; faceColorsOn = false; bodyColorsOn = false;
          root.querySelector('[data-act="draft"]')?.classList.remove('active');
          root.querySelector('[data-act="facecolors"]')?.classList.remove('active');
          root.querySelector('[data-act="bodycolors"]')?.classList.remove('active');
        }
        btn.classList.toggle('active', thicknessOn);
        applyColorMode();
        statusHint.textContent = thicknessOn ? 'Wall-thickness heatmap — thin (red) → thick (blue)' : 'Thickness heatmap off';
        break;
      case 'clip': {
        const show = clipPanel.style.display === 'none';
        clipPanel.style.display = show ? '' : 'none';
        btn.classList.toggle('active', show);
        break;
      }
      case 'explode': {
        const show = explodePanel.style.display === 'none';
        explodePanel.style.display = show ? '' : 'none';
        btn.classList.toggle('active', show);
        break;
      }
      case 'rotate': {
        const show = rotatePanel.style.display === 'none';
        rotatePanel.style.display = show ? '' : 'none';
        btn.classList.toggle('active', show);
        if (show) { buildRotatePanel(); statusHint.textContent = 'Rotate: pick a component, then drag its X / Y / Z slider'; }
        break;
      }
      case 'tree': {
        const show = treeBox.style.display === 'none';
        treeBox.style.display = show ? '' : 'none';
        btn.classList.toggle('active', show);
        root.classList.toggle('cv3d--tree-open', show);
        if (show) buildTreePanel();
        break;
      }
      case 'maximize':
        maximized = !maximized;
        root.classList.toggle('cv3d--max', maximized);
        btn.classList.toggle('active', maximized);
        requestAnimationFrame(resize);
        statusHint.textContent = maximized ? 'Maximized — press Esc to exit' : '';
        break;
      case 'features': {
        const show = featuresBox.style.display === 'none';
        featuresBox.style.display = show ? '' : 'none';
        btn.classList.toggle('active', show);
        if (!show) clearHighlight();
        break;
      }
      case 'tool-select': setTool('select'); break;
      case 'tool-dist': setTool('dist'); break;
      case 'tool-circle': setTool('circle'); break;
      case 'tool-angle': setTool('angle'); break;
      case 'tool-point': setTool('point'); break;
      case 'tool-facedist': setTool('facedist'); break;
      case 'clear': clearMeasurements(); statusHint.textContent = 'Cleared'; break;
      case 'snap': {
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
        if (opts.onSnapshot) {
          opts.onSnapshot(url);
          statusHint.textContent = 'Snapshot attached to report';
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = 'cad-view.jpg'; a.click();
          statusHint.textContent = 'Snapshot downloaded';
        }
        break;
      }
    }
    invalidate(); // any toolbar action (mode/bbox/grid/view/panels) repaints once
  });

  resize();
  setView([1, 0.8, 1]);
  invalidate();

  return {
    loadFile,
    getMeasurements: measurementRecords,
    el: root,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      loadSeq++; // invalidate any in-flight load
      if (renderHandle) cancelAnimationFrame(renderHandle);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
      ro.disconnect();
      controls.dispose();
      if (viewHelper) { try { viewHelper.dispose(); } catch { /* already gone */ } viewHelper = null; }
      // free every GPU resource this instance created
      scene.traverse(disposeObject);
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* context may already be gone */ }
      if (edgeWorker) { edgeWorker.terminate(); edgeWorker = null; }
      root.remove();
    },
  };
}

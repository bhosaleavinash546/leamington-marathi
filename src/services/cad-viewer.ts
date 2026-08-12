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
}
export interface TessMeta { triFace: number[] | Uint32Array; faces: FaceMeta[]; bodies: number | null; skippedFaces?: number }

export interface MeasurementRecord {
  kind: 'dist' | 'circle' | 'angle';
  label: string;
  /** mm for dist/circle (circle = diameter), degrees for angle */
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
  /**
   * Called with the B-rep face id the user clicked, or null when they clicked
   * empty space. This is what makes the finding link TWO-WAY: the page can paint
   * a finding's faces, and a reader who spots a tinted face can click it and be
   * taken back to the finding that tinted it. `null` matters as much as the id —
   * clicking away is how a reader dismisses a selection.
   */
  onFaceSelect?: (faceId: number | null) => void;
  /** Extra headers for the tessellate fetch — value or live-resolving function. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Persist measurements per file (localStorage). Default true. */
  persist?: boolean;
}

/** Canonical camera positions, named so callers need not know the axis vectors. */
export type NamedView = 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left';

export interface SnapshotOptions {
  /** Pixel size of the capture. Defaults to 2x the on-screen viewport, so a
   *  report figure is print-resolution rather than an upscaled UI panel. */
  width?: number;
  height?: number;
  /** Move to this view before capturing. */
  view?: NamedView;
  mime?: string;
  quality?: number;
  /**
   * Hide the viewer's own furniture — the ground grid — for the duration of the
   * capture.
   *
   * A grid is orientation help for someone ORBITING a part. In a printed report
   * it is a receding lattice behind the subject that makes the figure read as a
   * screenshot of an app rather than as a drawing of a part, and on a pale
   * casting the light grey lines compete with the silhouette. Restored in the
   * `finally`, so the live viewport is never left altered by an export.
   */
  clean?: boolean;
}

/**
 * A located finding, pinned to the geometry that caused it.
 *
 * `anchorXYZ` is in the PART's own coordinates — exactly what the analysis
 * emits (`undercutRegions[].centroidXYZ`, `ribs[].centroidXYZ`,
 * `thinnestRegions[].atXYZ`, `bends[].axisPointXYZ`). The viewer applies the
 * centring offset and part rotation itself, so a caller never has to know the
 * scene graph.
 */
export interface Annotation {
  id: string;
  anchorXYZ: [number, number, number];
  /** What it is: "Undercut", "Rib 1", "Thin wall". */
  label: string;
  /** The measured value, already formatted with its unit. */
  value?: string;
  severity?: 'high' | 'medium' | 'low' | 'info';
  /** Faces to paint alongside the callout, if any. */
  faceIds?: number[];
}

/** Where an anchor currently sits on screen, normalised 0..1 from top-left. */
export interface ProjectedAnchor {
  id: string;
  x: number;
  y: number;
  /** False when the anchor is off-screen or behind the camera. Callers must
   *  DROP these, not clamp them — a clamped leader line points at a face that
   *  is not in the picture. */
  visible: boolean;
}

export interface FaceLayerStyle {
  /** 0xRRGGBB. Defaults to the selection blue. */
  colour?: number;
  opacity?: number;
}

export interface CADViewerHandle {
  loadFile(file: File): Promise<void>;
  getMeasurements(): MeasurementRecord[];
  /**
   * Paint a set of B-rep face ids. Used by the DFM Studio to show WHERE an
   * undercut or a zero-draft wall actually is: a finding that says "2 undercut
   * regions" and cannot point at them leaves the engineer to hunt.
   * Face ids are the same indices the analysis returns (undercutFaceIds etc.).
   * No-op on an STL, which carries no face topology.
   */
  /** Paint B-rep faces by id. Ids are 1-based TopTools_IndexedMapOfShape
   *  indices — the SAME convention every analysis pass reports, verified by a
   *  gate that resolves each reported id back to its surface type. */
  highlightFaces(faceIds: Iterable<number>): void;
  clearHighlight(): void;
  /**
   * Paint faces on a NAMED layer. Layers are independent, so several finding
   * classes can be shown at once in different colours and a user's face
   * selection never erases the analysis painted underneath it.
   */
  paintFaces(layer: string, faceIds: Iterable<number>, style?: FaceLayerStyle): void;
  clearLayer(layer: string): void;
  clearAllLayers(): void;
  setView(name: NamedView): void;
  fit(): void;
  getCamera(): { position: [number, number, number]; target: [number, number, number] };
  setCamera(c: { position: [number, number, number]; target: [number, number, number] }): void;
  /** Render one frame at an explicit size and return it as a data URL. */
  snapshot(opts?: SnapshotOptions): string;
  /** Cut through a measured point for a report figure; null clears the cut. */
  sectionThrough(anchor: [number, number, number] | null, axis?: 'x' | 'y' | 'z'): void;
  /** Pin callouts to the geometry. Replaces any previous set. */
  setAnnotations(items: Annotation[]): void;
  /** Screen positions of the current annotations, for drawing over a capture. */
  projectAnchors(): ProjectedAnchor[];
  /** Ease the camera to look at a point in the part's own coordinates. */
  /** `facing` names a painted layer: the camera comes in along ITS normal, so a
   *  wall parallel to the current line of sight is seen rather than glimpsed. */
  flyTo(anchor: [number, number, number],
        opts?: { distance?: number; facing?: string; immediate?: boolean }): void;
  /** Shade bodies by id (a body id is the DFA part index). null resets. */
  setBodyColours(colours: Map<number, number> | null): void;
  /** Slide bodies apart: 0 assembled, 1 fully exploded. */
  setExplode(factor: number): void;
  dispose(): void;
  el: HTMLElement;
}

// ── Pure measurement math + face palette ─────────────────────────────────────
// Live in a framework-free .mjs (no three/DOM) so they run under `node --test`;
// imported here for internal use and re-exported to preserve the viewer's API.
import { dist3, circumcircle3, angle3, closestPointOnSegment, smoothNormalsWithinFaces, FACE_COLORS, FACE_TYPE_LABEL } from './cad-viewer-math.mjs';
export { dist3, circumcircle3, angle3, closestPointOnSegment, smoothNormalsWithinFaces, FACE_COLORS, FACE_TYPE_LABEL };

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

// Inline stroke icons in the app's lucide visual language (24-viewBox, 2px
// round stroke) — the previous unicode/emoji glyphs (⌂🎨📷) rendered
// differently per OS and read as a bolted-on third-party widget.
const CV_ICON: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  fit: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/>',
  shaded: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M3 3l9 9"/>',
  wire: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  bbox: '<rect x="5" y="5" width="14" height="14"/><path d="M5 5 3 3M19 5l2-2M5 19l-2 2M19 19l2 2"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10" r="1"/><path d="M12 21a2.5 2.5 0 0 0 0-5h-1.5a1.5 1.5 0 0 1 0-3"/>',
  clip: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5 20 19M8 16.5 20 5"/>',
  features: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  select: '<path d="M4 3l7 17 2.5-7.5L21 10z"/>',
  dist: '<path d="M4 12h16"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  angle: '<path d="M5 19h15"/><path d="M5 19V5"/><path d="M5 12a7 7 0 0 1 7 7"/>',
  clear: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
};
const cvIcon = (name: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CV_ICON[name]}</svg>`;

export async function createCADViewer(host: HTMLElement, opts: CADViewerOptions = {}): Promise<CADViewerHandle> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  // Ships with the installed three build — no new dependency, same lazy-import
  // pattern as OrbitControls above. DOM labels rather than sprites so callout
  // typography stays crisp at any zoom and can carry real markup.
  const { CSS2DRenderer, CSS2DObject } =
    await import('three/examples/jsm/renderers/CSS2DRenderer.js');

  // ── DOM scaffold ──
  const root = document.createElement('div');
  root.className = 'cv3d' + (opts.compact ? ' cv3d--compact' : '');
  root.innerHTML = `
    <div class="cv3d-toolbar">
      <div class="cv3d-group">
        <button data-act="view-iso" title="Isometric view (Home)" aria-label="Isometric view">${cvIcon('home')}</button>
        <button data-act="view-front" title="Front view">F</button>
        <button data-act="view-top" title="Top view">T</button>
        <button data-act="view-right" title="Right view">R</button>
        <button data-act="fit" title="Fit part to screen" aria-label="Fit to screen">${cvIcon('fit')}</button>
      </div>
      <div class="cv3d-group">
        <button data-act="mode-shaded" class="active" title="Shaded with edges" aria-label="Shaded">${cvIcon('shaded')}</button>
        <button data-act="mode-wire" title="Wireframe" aria-label="Wireframe">${cvIcon('wire')}</button>
        <button data-act="bbox" title="Bounding box + dimensions" aria-label="Bounding box">${cvIcon('bbox')}</button>
        <button data-act="facecolors" title="Colour by machining surface type (STEP/IGES only)" aria-label="Face colours" disabled>${cvIcon('palette')}</button>
        <button data-act="clip" title="Section view — clipping plane" aria-label="Section view">${cvIcon('clip')}</button>
        <button data-act="features" title="Detected features — holes &amp; bosses (STEP/IGES only)" aria-label="Features" disabled>${cvIcon('features')}</button>
      </div>
      <div class="cv3d-group">
        <button data-act="tool-select" class="active" title="Select — click a face for exact B-rep data" aria-label="Select tool">${cvIcon('select')}</button>
        <button data-act="tool-dist" title="Measure distance — click two points (snaps to vertices &amp; edges)" aria-label="Measure distance">${cvIcon('dist')}</button>
        <button data-act="tool-circle" title="Measure circle — click 3 points on a rim or bore" aria-label="Measure circle">${cvIcon('circle')}</button>
        <button data-act="tool-angle" title="Measure angle — click 3 points (vertex is the middle click)" aria-label="Measure angle">${cvIcon('angle')}</button>
        <button data-act="clear" title="Clear measurements &amp; selection" aria-label="Clear measurements">${cvIcon('clear')}</button>
      </div>
      <div class="cv3d-group">
        <button data-act="snap" title="Snapshot — ${opts.onSnapshot ? 'attach to report' : 'download image'}" aria-label="Snapshot">${cvIcon('camera')}</button>
      </div>
    </div>
    <div class="cv3d-viewport">
      <canvas class="cv3d-canvas"></canvas>
      <div class="cv3d-facechip" style="display:none"></div>
      <div class="cv3d-legend" style="display:none"></div>
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
        <button data-axis="x" class="active">X</button>
        <button data-axis="y">Y</button>
        <button data-axis="z">Z</button>
        <input type="range" class="cv3d-clip-slider" min="-100" max="100" value="0" step="1"/>
        <button class="cv3d-clip-off" title="Turn section view off">off</button>
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
  const clipPanel = $('.cv3d-clip-panel');
  const clipSlider = $<HTMLInputElement>('.cv3d-clip-slider');
  const statusFile = $('.cv3d-status-file');
  const statusDims = $('.cv3d-status-dims');
  const statusHint = $('.cv3d-status-hint');

  // ── three.js scene ──
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, preserveDrawingBuffer: true,
    // Ask for the discrete GPU on a laptop with two. Without this a 50k-triangle
    // part can land on the integrated chip and orbit at half the frame rate.
    powerPreference: 'high-performance',
  });
  // ACES rather than the default linear clamp. The lights below run above 1.0 to
  // give metal a highlight, and without tone mapping those highlights clip to
  // flat white — which is most of why the shading read as "cheap plastic".
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Trimmed below 1.0: the environment adds light of its own, and at 1.05 the
  // part washed out toward white instead of reading as grey metal.
  renderer.toneMappingExposure = 0.92;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  // THEME-AWARE GROUND. A white viewport punched a bright rectangle through
  // every dark page that hosts this viewer — the single loudest visual defect
  // in the DFM Studio. The part is still lit and shaded exactly as before;
  // only what sits behind it changes, and the light theme keeps its white.
  const prefersLight = typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') === 'light';
  scene.background = new THREE.Color(prefersLight ? 0xffffff : 0x0c1424);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  // 0.12 stops the glide almost immediately, which is what made orbiting feel
  // steppy rather than fluid. 0.06 keeps roughly twice the coast without
  // becoming floaty, and it is close to what SolidWorks and Creo settle at.
  controls.dampingFactor = 0.06;
  controls.zoomToCursor = true; // CAD convention: zoom at the pointer, not the screen centre
  // A full drag across the viewport should be about half a turn, not a full one:
  // at the default the part spins past what the hand expects and has to be
  // walked back, which reads as "twitchy" rather than fast.
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.8;
  // OrbitControls dollies MULTIPLICATIVELY, so a wheel notch moves the same
  // fraction of the remaining distance whether you are 5 mm or 5 m out. That is
  // the behaviour that makes zoom feel controlled all the way in.

  // IMAGE-BASED LIGHTING, and this is the other half of why the part looked
  // flat. `MeshStandardMaterial` with metalness 0.45 is a PHYSICAL metal, and a
  // metal shows you its surroundings — with no environment to reflect it
  // resolves to a dead, uniform grey no matter how many lamps are added. Every
  // professional CAD viewer lights the model from a studio environment for
  // exactly this reason.
  //
  // `RoomEnvironment` ships inside three itself, so this costs no download and
  // no asset pipeline: it is a procedural room with soft area lights, run once
  // through PMREMGenerator into a prefiltered cube map.
  {
    const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    // Generated once and kept: regenerating per resize would stall the frame.
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.45));
  // Dimmed against the old values: the environment now does most of the work,
  // and leaving the lamps at full strength on top of it blows out every
  // highlight and flattens the form again.
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(1, 2, 1.5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.25);
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
  /**
   * Face overlays, keyed by LAYER. This used to be a single mesh, which meant
   * the click-to-inspect path and the DFM findings overlay shared one slot: the
   * moment a user clicked a face to read its diameter, every undercut highlight
   * on the part vanished. Selection now lives on its own layer, so inspecting
   * geometry never erases the analysis painted onto it.
   */
  /** Layer name -> its per-body highlight meshes. See paintFaces for the split. */
  const faceLayers = new Map<string, Mesh3[]>();
  /** The layer plain `highlightFaces()` paints — the other pages' behaviour. */
  const DEFAULT_LAYER = 'default';
  const SELECTION_LAYER = 'selection';
  let meta: TessMeta | null = null;
  /** Face id -> metadata. Keyed by the engine's id, not by array position. */
  let faceById = new Map<number, FaceMeta>();
  let triFaceAll: Uint32Array | null = null;   // reordered per-triangle face ids
  let masterPositions: Float32Array | null = null; // reordered, centred positions
  let partRadius = 1;
  /** Offset the mesh was re-centred by — needed to map part coords to world. */
  const partCentre = new THREE.Vector3();
  let partSpan = { x: 0, y: 0, z: 0 };
  let edgesOn = true;
  let bodyVisible: boolean[] = [];
  /**
   * Which bodyId each mesh slot holds. Bodies are stored by SLOT (contiguous
   * meshes) but addressed by ID everywhere else — and a DFA part index is a body
   * id. Verified on the bolted-assembly fixture: viewer body 0 has 6 faces (the
   * plate) and bodies 1-2 have 3 each (the pins), while the DFA reports 40000
   * mm3 then 1257 twice, in that order. Both enumerate with the same
   * TopExp_Explorer(TopAbs_SOLID) walk, so index N is part N.
   */
  let bodyIdOfSlot: number[] = [];
  /** Body centroids in world space, for the exploded view. */
  let bodyCentres: Array<InstanceType<typeof THREE.Vector3>> = [];
  /**
   * Where each body slot's triangles start in the master arrays.
   *
   * Triangles are sorted contiguously by slot when the mesh is built, so this
   * plus the next entry bounds a body. Needed by paintFaces: a highlight has to
   * be split per body or it cannot follow an exploded assembly, and this is the
   * only record of which triangle belongs to which body.
   */
  let bodyTriStart: number[] = [];
  let explodeFactor = 0;
  let fileKey = '';
  let disposed = false;
  let loadSeq = 0;

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

  // ── render loop ──
  function tick(): void {
    if (disposed) return;
    requestAnimationFrame(tick);
    controls.update();
    scaleLabels();
    stepFly();
    renderer.render(scene, camera);
    if (calloutObjects.length) labelRenderer.render(scene, camera);
  }

  function resize(): void {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // tracks monitor moves
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // The DOM label layer sits over the canvas. pointer-events are off on the
  // container so orbiting still works through it; individual callouts opt back
  // in via CSS when they need to be clickable.
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'cv3d-labels';
  // Hidden from assistive tech ON PURPOSE. Every value in a callout also appears
  // as text in the findings list, so exposing the overlay would read the whole
  // analysis out twice — once as prose, once as floating fragments with no
  // structure. The 3D layer is a visual aid to text that is already accessible.
  labelRenderer.domElement.setAttribute('aria-hidden', 'true');
  viewport.appendChild(labelRenderer.domElement);

  const ro = new ResizeObserver(resize);
  ro.observe(viewport);

  // ── views ──
  function setView(dir: [number, number, number]): void {
    const len = Math.hypot(...dir) || 1;
    const d = partRadius * 2.6;
    camera.position.set((dir[0] / len) * d, (dir[1] / len) * d, (dir[2] / len) * d);
    controls.target.set(0, 0, 0);
    controls.update();
  }
  const fit = () => setView([1, 0.8, 1]);

  /**
   * Ease the camera to look at a point in the part's own coordinates.
   *
   * Tweened rather than teleported: on a busy casting, jumping the view leaves
   * the engineer re-orienting themselves every time they click a finding, which
   * is exactly the friction this is supposed to remove.
   */
  let fly: { from: Vec3; to: Vec3; fromT: Vec3; toT: Vec3; t: number } | null = null;
  function flyTo(anchor: [number, number, number],
                 opts: { distance?: number; facing?: string; immediate?: boolean } = {}): void {
    const target = toWorld(anchor);
    // HOW FAR BACK: the part stays in frame, and a big feature pushes further.
    //
    // The tempting move is to zoom to the FEATURE, and it is wrong. Tried on
    // Seat_Locking_Bracket — a ~3 mm undercut on a 256 mm pressing — it put the
    // camera 48 mm from the surface and produced a full-screen grey field with
    // no landmark in it. A cost engineer's next question after "which face" is
    // "where on the part", and an image with no part in it cannot answer it.
    // The callout's dot and leader already mark the position to the millimetre;
    // magnification adds nothing and costs the context.
    //
    // So the part-framing distance is a FLOOR, not a default: feature size only
    // ever pulls the camera further BACK. Both closer settings were tried on
    // the seven production parts and judged on the renders: at 0.28x the
    // Seat_Locking_Bracket undercut filled the screen with featureless grey,
    // and at 0.75x the bracket lost the landmarks that say where you are — in
    // neither case did the offending face become any more visible, because it
    // is a thin wall seen nearly edge-on and magnification does not change
    // that. What DOES need handling is the opposite end: a full-length draft
    // wall at part distance fills the screen edge to edge and reads as "the
    // whole part is wrong".
    const lr = opts.facing ? layerRadius(opts.facing) : null;
    const d = opts.distance ?? (lr
      ? Math.min(partRadius * 2.4, Math.max(partRadius * 1.5, lr * 3.2))
      : partRadius * 1.5);
    // WHICH WAY TO APPROACH FROM.
    //
    // Keeping the current orbit direction is right for "take me nearer this
    // point" and wrong for "show me this face": a highlighted wall parallel to
    // the line of sight paints correctly and renders as a coloured LINE, which
    // reads as a rendering artefact rather than as the evidence. When the caller
    // names a painted layer, the camera comes in along that layer's own
    // area-weighted normal, so the face it is about is the face you see.
    let dir = camera.position.clone().sub(controls.target).normalize();
    const n = opts.facing ? layerNormal(opts.facing) : null;
    if (n) {
      // The camera goes to the side the face POINTS AT — n as it comes, never
      // flipped toward wherever the camera already was. The first version kept
      // the existing side "to avoid a disorienting flip", and on the analytic
      // ribbed plate that put the camera behind the highlighted wall every
      // time: the tinted face was the one surface you could not see. Preserving
      // the reader's orientation is not worth showing them the back of the
      // evidence.
      dir = n.clone().multiplyScalar(0.88)
        // A little off-square: dead-on, a flat face has no silhouette and the
        // part loses all sense of depth.
        .addScaledVector(camera.up, 0.3)
        .normalize();
    }
    const to = target.clone().addScaledVector(dir, d);
    // A CAPTURE CANNOT WAIT FOR AN ANIMATION. The report exports one framed
    // render per finding; animating each move would mean sleeping ~300 ms a
    // figure and hoping the tween had finished before the snapshot, which is a
    // race that fails silently as a half-flown camera. `immediate` puts the
    // camera where the animation would have ended.
    if (opts.immediate) {
      camera.position.copy(to);
      controls.target.copy(target);
      controls.update();
      fly = null;
      return;
    }
    fly = {
      from: camera.position.clone(), to,
      fromT: controls.target.clone(), toT: target.clone(), t: 0,
    };
  }

  /** How big the painted layer is: the radius of the sphere enclosing it. */
  function layerRadius(layer: string): number | null {
    const ms = faceLayers.get(layer);
    if (!ms?.length) return null;
    const box = new THREE.Box3();
    for (const m of ms) {
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().translate(m.position));
    }
    if (box.isEmpty()) return null;
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    return r > 1e-6 ? r : null;
  }

  /**
   * The direction to look at a painted layer FROM, or null if there isn't one.
   *
   * NOT the area-weighted sum of the facet normals. A rib is a prism: its two
   * big side walls point exactly opposite and cancel, so the sum comes out
   * along the rib's LENGTH and the camera flies to the one view where a
   * highlighted rib is a vertical stripe. Measured on the analytic ribbed plate,
   * which is how that was caught.
   *
   * What a reader wants is the layer's BIGGEST FLAT PART, seen square on. So
   * facets are binned by direction and the largest bin wins — provided it is
   * genuinely dominant. A bore's facets spread evenly over every direction and
   * no bin dominates; there is no single view of a hole from outside it, and
   * saying so (null, keep the current orbit) beats picking one at random.
   */
  function layerNormal(layer: string): InstanceType<typeof THREE.Vector3> | null {
    const ms = faceLayers.get(layer);
    if (!ms?.length) return null;
    const bins: Array<{ n: InstanceType<typeof THREE.Vector3>; area: number }> = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
    let total = 0;
    for (const m of ms) {
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        a.fromBufferAttribute(pos as never, i);
        b.fromBufferAttribute(pos as never, i + 1);
        c.fromBufferAttribute(pos as never, i + 2);
        // |cross| is twice the triangle's area, so this weights and orients in
        // one step.
        cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
        const area = cross.length();
        if (area <= 0) continue;
        cross.divideScalar(area);
        total += area;
        // 15 degrees of tolerance: fine enough to keep the two sides of a rib
        // apart, coarse enough that a tessellated fillet does not shatter into
        // forty bins that each lose to a flat sliver.
        const bin = bins.find(x => x.n.dot(cross) > 0.966);
        if (bin) bin.area += area;
        else bins.push({ n: cross.clone(), area });
      }
    }
    if (!bins.length || total <= 0) return null;
    bins.sort((x, y) => y.area - x.area);
    // A third of the painted area facing one way is enough to call it the front.
    return bins[0].area / total >= 0.33 ? bins[0].n.clone() : null;
  }
  function stepFly(): void {
    if (!fly) return;
    fly.t = Math.min(1, fly.t + 0.06);
    const e = 1 - (1 - fly.t) ** 3;      // ease-out cubic
    camera.position.lerpVectors(fly.from, fly.to, e);
    controls.target.lerpVectors(fly.fromT, fly.toT, e);
    if (fly.t >= 1) fly = null;
  }
  /** The toolbar's own view vectors, named so callers need not know the axes.
   *  `top` is nudged off exactly-vertical because a camera looking straight down
   *  its own up-vector has no defined orientation. */
  const NAMED_VIEWS: Record<NamedView, [number, number, number]> = {
    iso: [1, 0.8, 1], front: [0, 0, 1], back: [0, 0, -1],
    top: [0, 1, 0.0001], bottom: [0, -1, 0.0001],
    right: [1, 0, 0], left: [-1, 0, 0],
  };

  /**
   * Render a frame at an explicit size and return it as a data URL.
   *
   * Rendered at the requested pixel size rather than the on-screen one so a
   * report figure is print-resolution instead of a blown-up 420 px panel. The
   * renderer is restored through the existing resize() afterwards, so the live
   * canvas is untouched by the capture.
   */
  function snapshot(o: SnapshotOptions = {}): string {
    const w = Math.max(64, Math.round(o.width ?? viewport.clientWidth * 2));
    const h = Math.max(64, Math.round(o.height ?? viewport.clientHeight * 2));
    if (o.view) setView(NAMED_VIEWS[o.view]);
    const prevRatio = renderer.getPixelRatio();
    const gridWasVisible = grid?.visible ?? false;
    try {
      if (o.clean && grid) grid.visible = false;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scaleLabels();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL(o.mime ?? 'image/jpeg', o.quality ?? 0.92);
    } finally {
      // Always restore, even if toDataURL throws on a lost context — otherwise
      // the live viewport is left at report resolution and looks broken.
      if (grid) grid.visible = gridWasVisible;
      renderer.setPixelRatio(prevRatio);
      resize();
      scaleLabels();
      renderer.render(scene, camera);
    }
  }

  /** Frustum must track part size — fixed planes blank out metre-scale parts. */
  function updateFrustum(): void {
    // DEPTH PRECISION. near/far was radius/1000 to radius*100 — a ratio of
    // 100,000:1, which spends most of a 24-bit depth buffer on empty space
    // hundreds of part-lengths behind the model. Surfaces a fraction of a
    // millimetre apart then quantise to the same depth and flicker against each
    // other as the camera moves, which is exactly the "not smooth" symptom.
    // 4,000:1 still clears any sane orbit distance and leaves the precision
    // where the part actually is.
    camera.near = Math.max(partRadius / 200, 0.001);
    camera.far = partRadius * 20;
    camera.updateProjectionMatrix();
  }

  // ── clipping / section plane ──
  let clipOn = false;
  let clipAxis: 'x' | 'y' | 'z' = 'x';
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  // Part-space axis → world-space direction (partGroup is rotated -90° on X):
  // part X → world +X · part Y → world −Z · part Z → world +Y
  const AXIS_WORLD: Record<'x' | 'y' | 'z', [number, number, number]> = {
    x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0],
  };
  function applyClipping(): void {
    const planes = clipOn ? [clipPlane] : null;
    for (const m of bodyMats) {
      m.clippingPlanes = planes;
      // Backfaces render ONLY while a section is cutting. A clipped solid is an
      // open shell, so culling them leaves the cut hollow and you see straight
      // through the part; unclipped they cost double the fragment work for a
      // surface nobody can see.
      m.side = clipOn ? THREE.DoubleSide : THREE.FrontSide;
      m.needsUpdate = true;
    }
    for (const e of bodyEdges) if (e) (e.material as InstanceType<typeof THREE.LineBasicMaterial>).clippingPlanes = planes;
    // EVERY overlay layer, not just one. A section plane that cuts the part but
    // leaves a finding highlight floating in the removed material is worse than
    // no section at all — it puts the evidence somewhere the material is not.
    for (const ms of faceLayers.values()) {
      for (const m of ms) {
        (m.material as InstanceType<typeof THREE.MeshBasicMaterial>).clippingPlanes = planes;
      }
    }
  }
  function updateClipPlane(): void {
    const [nx, ny, nz] = AXIS_WORLD[clipAxis];
    const offset = (Number(clipSlider.value) / 100) * partRadius;
    // keep fragments where axis·p ≤ offset (slider slides the cut through the part)
    clipPlane.normal.set(-nx, -ny, -nz);
    clipPlane.constant = offset;
    applyClipping();
  }

  /**
   * Cut the part THROUGH A MEASURED POINT, for a report figure.
   *
   * A thin wall is invisible from outside. The report drew a ring on the surface
   * above it and asked a supplier to take the tool's word for what was
   * underneath — which is the one finding type where an external view proves
   * nothing at all. This puts the cut where the measurement was taken, so the
   * section shows the wall the engine measured rather than a plane somebody
   * dragged a slider to.
   *
   * The axis is CHOSEN, not fixed: whichever of the part's three axes the point
   * sits furthest along from the centre gives the most material to cut away and
   * therefore the clearest view of the feature. Passing null restores whatever
   * the user had.
   */
  function sectionThrough(anchor: [number, number, number] | null, axis?: 'x' | 'y' | 'z'): void {
    if (!anchor) {
      clipOn = false;
      applyClipping();
      return;
    }
    const world = toWorld(anchor);
    const pick: 'x' | 'y' | 'z' = axis ?? (() => {
      const d: Array<['x' | 'y' | 'z', number]> = [
        ['x', Math.abs(anchor[0])], ['y', Math.abs(anchor[1])], ['z', Math.abs(anchor[2])],
      ];
      d.sort((a, b) => b[1] - a[1]);
      return d[0][0];
    })();
    clipAxis = pick;
    const [nx, ny, nz] = AXIS_WORLD[pick];
    clipPlane.normal.set(-nx, -ny, -nz);
    // Through the point itself, nudged past it by a hair so the cut face is the
    // material BESIDE the measurement rather than a coplanar z-fight with it.
    clipPlane.constant = (world.x * nx + world.y * ny + world.z * nz) + partRadius * 0.002;
    clipOn = true;
    applyClipping();
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
      const timer = setTimeout(() => aborter.abort(new DOMException('Tessellation timed out after 120 s', 'TimeoutError')), 120_000);
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
    bodyIdOfSlot = []; bodyCentres = []; bodyTriStart = []; explodeFactor = 0;
    // A previous part's callouts would otherwise hang in space over the new one,
    // anchored to coordinates that no longer mean anything.
    clearCallouts();
    annotations = [];
    removeAndDispose(partGroup, grid); grid = null;
    if (bboxHelper) { removeAndDispose(partGroup, bboxHelper); bboxHelper = null; }
    bboxLabels.forEach(l => removeAndDispose(scene, l)); bboxLabels = [];

    // centre at origin
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    // REMEMBERED, because the analysis reports anchors in the part's own
    // coordinates and the mesh here is both re-centred on this offset and
    // rotated -90 deg on X by partGroup. An anchor placed without undoing both
    // lands somewhere else entirely, and a callout pointing confidently at the
    // wrong place is worse than no callout.
    partCentre.set(cx, cy, cz);
    partSpan = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    partRadius = Math.hypot(partSpan.x, partSpan.y, partSpan.z) / 2 || 1;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx; positions[i + 1] -= cy; positions[i + 2] -= cz;
    }

    // ── group triangles by body (stable) so each body is a contiguous mesh ──
    const srcTriFace = meta ? meta.triFace : null;
    const faceOf = (t: number) => (srcTriFace ? Number(srcTriFace[t]) : 0);
    // LOOK FACES UP BY ID, NEVER BY ARRAY POSITION. Face ids are 1-based indexed
    // map indices and the array now also carries untriangulated faces, so
    // `faces[id]` is off by one and drifts further on any part with a face the
    // mesher could not handle. Position-indexing is what made the analysis
    // highlight the wrong face on every upload.
    faceById = new Map((meta?.faces ?? []).map(f => [f.id, f]));
    const bodyOf = (t: number) => faceById.get(faceOf(t))?.bodyId ?? 0;
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
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(slice.slice(), 3));
        // NOT computeVertexNormals(). An STL has no shared vertices, so three's
        // own pass yields one normal per FACET and every curve renders as a fan
        // of flat strips however finely it was meshed. Welding within each
        // B-rep face — and never across one — gives the hard/soft split the
        // modeller actually drew, with no angle threshold to tune.
        geometry.setAttribute('normal', new THREE.BufferAttribute(
          smoothNormalsWithinFaces(slice, triFaceAll, triCursor, nTris, partRadius * 1e-5), 3));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mat = new THREE.MeshStandardMaterial({
          // A NEUTRAL MACHINED GREY. 0xaeb6c2 is a light BLUE-grey (blue channel
          // well above red), and once the studio environment and ACES tone
          // mapping went in it lifted to something closer to white than to
          // metal. This is a neutral mid-grey at the value CAD viewers actually
          // use, with the metalness pulled back so the environment reads as a
          // soft sheen rather than a mirror.
          color: 0x8f9499, metalness: 0.25, roughness: 0.55,
          // FRONT faces only. DoubleSide doubles the fragment work on a closed
          // solid for nothing — you cannot see the inside of a sealed part. It
          // is switched back on only while a section plane is cutting, which is
          // the one case where the interior must render. See applyClipping().
          side: THREE.FrontSide,
          // The edge overlay draws at the same depth as the surface it outlines,
          // so without an offset the two fight for the depth buffer and the
          // lines flicker in and out as the part turns. That shimmer is a large
          // part of what reads as "not smooth" while orbiting.
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.userData = { triOffset: triCursor, bodySlot: bi };
        bodyIdOfSlot[bi] = bodyList[bi];
        bodyTriStart[bi] = triCursor;
        // Centroid of this body's own bounding box, kept for the explode: each
        // body slides along the vector from the assembly centre to its own, so
        // the parts separate the way a hand would pull them apart.
        mesh.geometry.computeBoundingBox();
        bodyCentres[bi] = mesh.geometry.boundingBox
          ? mesh.geometry.boundingBox.getCenter(new THREE.Vector3())
          : new THREE.Vector3();
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
    // Grid greys follow the ground: readable on either, never glaring.
    const lightBg = typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-theme') === 'light';
    grid = lightBg
      ? new THREE.GridHelper(gridSize, 20, 0x9aa4b0, 0xdde2e8)
      : new THREE.GridHelper(gridSize, 20, 0x3b4a63, 0x1e2a3f);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -partSpan.z / 2 - partRadius * 0.02;
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

    buildBodiesPanel();
    buildFeaturesPanel();
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
        bodyVisible[i] = (cb as HTMLInputElement).checked;
        bodyMeshes[i].visible = bodyVisible[i];
        const e = bodyEdges[i];
        if (e) e.visible = bodyVisible[i] && edgesOn;
      });
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
  type Tool = 'select' | 'dist' | 'circle' | 'angle';
  let tool: Tool = 'select';
  let picks: Vec3[] = [];
  let pickMarkers: Mesh3[] = [];
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
    pickMarkers.forEach(m => removeAndDispose(overlayGroup, m));
    pickMarkers = [];
  }

  function clearMeasurements(notify = true): void {
    measurements.forEach(m => m.objects.forEach(o => removeAndDispose(overlayGroup, o)));
    measurements.length = 0;
    finishPicks();
    clearHighlight();
    if (notify) measurementsChanged();
    else renderMeasureList();
  }

  /**
   * Clear the selection and default overlays — NOT every layer. A named finding
   * layer survives, so clicking around the model to inspect it does not silently
   * wipe the analysis that was painted on.
   */
  function clearHighlight(): void {
    clearLayer(SELECTION_LAYER);
    clearLayer(DEFAULT_LAYER);
    faceChip.style.display = 'none';
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

  /**
   * Paint a set of B-rep faces on a named layer.
   *
   * Face ids are the engine's 1-based indexed-map ids — the same convention every
   * analysis pass reports, gated by resolving each id back to its surface type.
   * Layers are independent, so an "undercut" overlay and a "rib" overlay can be
   * on screen at once in different colours, and a user's face selection sits on
   * its own layer without erasing either.
   */
  function paintFaces(layer: string, faceIds: Set<number>,
                      style?: { colour?: number; opacity?: number }): void {
    clearLayer(layer);
    if (!masterPositions || !triFaceAll || !faceIds.size) return;
    // ONE SUB-MESH PER BODY, not one mesh for the layer.
    //
    // A single merged highlight is baked in world space and lives in
    // `overlayGroup`, which `setExplode` never touches — so on an exploded
    // assembly the paint stayed behind while the body it belonged to slid away,
    // and the tint ended up sitting on a NEIGHBOURING part. A highlight in the
    // wrong place is worse than none, because it looks like an answer. Split by
    // body, each piece carries its body's offset and travels with it.
    const perSlot = new Map<number, number[]>();
    for (let t = 0; t < triFaceAll.length; t++) {
      if (!faceIds.has(triFaceAll[t])) continue;
      const slot = slotOfTri(t);
      const list = perSlot.get(slot);
      if (list) list.push(t); else perSlot.set(slot, [t]);
    }
    if (!perSlot.size) return;

    const meshes: Mesh3[] = [];
    for (const [slot, tris] of perSlot) {
      const hp = new Float32Array(tris.length * 9);
      tris.forEach((t, i) => hp.set(masterPositions!.subarray(t * 9, t * 9 + 9), i * 9));
      const hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
      hg.computeVertexNormals();
      const mesh = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({
        color: style?.colour ?? 0x4f8ef7,
        transparent: true, opacity: style?.opacity ?? 0.55,
        depthTest: true, polygonOffset: true, polygonOffsetFactor: -2,
        side: THREE.DoubleSide,
      }));
      mesh.applyMatrix4(partGroup.matrixWorld);
      mesh.userData = { bodySlot: slot };
      // Match the body's CURRENT explode position, so painting while already
      // exploded lands correctly rather than only after the next slider move.
      const off = bodyOffsetInWorld(slot);
      if (off) mesh.position.copy(off);
      overlayGroup.add(mesh);
      meshes.push(mesh);
    }
    faceLayers.set(layer, meshes);
    // Section planes must cut the overlay too, or a clipped part shows a
    // floating highlight hanging in the void where the material was removed.
    applyClipping();
  }

  /** Which body slot a master-order triangle belongs to. */
  function slotOfTri(t: number): number {
    // Triangles are contiguous per slot, so the last start at or below `t` wins.
    // Bodies are few (single digits on every real assembly) and this runs once
    // per painted triangle, so a linear scan beats the ceremony of a search.
    let slot = 0;
    for (let i = 0; i < bodyTriStart.length; i++) if (bodyTriStart[i] <= t) slot = i;
    return slot;
  }

  function clearLayer(layer: string): void {
    const ms = faceLayers.get(layer);
    if (ms) { for (const m of ms) removeAndDispose(overlayGroup, m); faceLayers.delete(layer); }
  }

  function clearAllLayers(): void {
    for (const layer of [...faceLayers.keys()]) clearLayer(layer);
  }

  /** Back-compat for the pages that just want "highlight these faces". */
  // ── Callouts ──────────────────────────────────────────────────────────────
  /**
   * A located finding, pinned to the geometry that caused it.
   *
   * NOTE for the report path: CSS2D labels are DOM, so they do NOT appear in
   * `renderer.domElement.toDataURL()`. A PDF figure therefore captures the clean
   * 3D image and draws its callouts as vector on top, using `projectAnchors()`
   * below — which is also why the label text and its anchor travel together.
   */
  let annotations: Annotation[] = [];
  const calloutObjects: Array<InstanceType<typeof CSS2DObject>> = [];

  function clearCallouts(): void {
    for (const o of calloutObjects) { o.element.remove(); scene.remove(o); }
    calloutObjects.length = 0;
  }

  function setAnnotations(items: Annotation[]): void {
    clearCallouts();
    annotations = items ?? [];
    for (const a of annotations) {
      const el = document.createElement('div');
      el.className = 'cv3d-callout';
      el.dataset.sev = a.severity ?? 'info';
      el.innerHTML =
        '<span class="cv3d-callout-dot"></span>'
        + `<span class="cv3d-callout-body"><b></b><i></i></span>`;
      (el.querySelector('b') as HTMLElement).textContent = a.label;
      (el.querySelector('i') as HTMLElement).textContent = a.value ?? '';
      const obj = new CSS2DObject(el);
      obj.position.copy(toWorld(a.anchorXYZ));
      // Hide behind the part rather than floating over it — a callout for a
      // feature on the far side reads as one on the near side otherwise.
      obj.center.set(0, 1);
      scene.add(obj);
      calloutObjects.push(obj);
    }
  }

  /**
   * Where each anchor currently sits on screen, normalised 0..1 from the top
   * left. This is what lets the PDF draw crisp vector leader lines over a
   * raster capture instead of baking labels into the pixels.
   */
  function projectAnchors(): ProjectedAnchor[] {
    camera.updateMatrixWorld();
    const targets = bodyMeshes.filter(m => m.visible);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    return annotations.map((a) => {
      const world = toWorld(a.anchorXYZ);
      const v = world.clone().project(camera);
      const inFrustum = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      // OCCLUSION. Projection alone puts a marker for a feature on the FAR side
      // of the part exactly where it would be if it were on the near side, so a
      // reader is told an undercut is on a face they can see when it is behind
      // 100 mm of aluminium. A report page carrying 43 markers, every one of
      // them drawn as though visible, is what made this obvious. Cast the
      // camera's own ray and ask whether anything is in the way.
      let occluded = false;
      if (inFrustum && targets.length) {
        dir.copy(world).sub(camPos);
        const reach = dir.length();
        if (reach > 1e-6) {
          raycaster.set(camPos, dir.normalize());
          raycaster.near = 0;
          raycaster.far = reach;
          const hits = raycaster.intersectObjects(targets, false);
          // Tolerance is scaled to the part, not absolute: the anchor sits ON a
          // surface, so its own face is a legitimate hit at distance ~= reach.
          const skin = Math.max(0.25, reach * 0.004);
          occluded = hits.some(h => h.distance < reach - skin);
          raycaster.far = Infinity;
        }
      }
      return {
        id: a.id,
        x: (v.x + 1) / 2,
        y: (1 - v.y) / 2,
        // Outside the frustum, behind the camera, or hidden by the part itself.
        // The caller must drop these rather than clamp them to an edge, which
        // would point a leader line at a face that is not in the picture.
        visible: inFrustum && !occluded,
      };
    });
  }

  // ── Assembly presentation ─────────────────────────────────────────────────

  /**
   * Colour bodies by id — used to shade an assembly by handling difficulty.
   *
   * A body id IS the DFA part index; both walk the solids with the same
   * TopExp_Explorer. Bodies with no entry keep their default material, so a
   * partial map shades what it knows and leaves the rest honestly neutral rather
   * than defaulting everything to the low end of a scale.
   */
  function setBodyColours(colours: Map<number, number> | null): void {
    for (let bi = 0; bi < bodyMats.length; bi++) {
      const id = bodyIdOfSlot[bi];
      const c = colours?.get(id);
      bodyMats[bi].color.set(c ?? 0xb9c4d2);
    }
  }

  /**
   * Slide the bodies apart, 0 = assembled, 1 = fully exploded.
   *
   * Each body moves along the vector from the assembly centre to its own
   * centroid, so parts separate outward the way a hand would pull them. A body
   * sitting exactly at the centre has no direction to move in and stays put,
   * which is correct — it is the thing everything else comes off.
   */
  function setExplode(factor: number): void {
    explodeFactor = Math.max(0, Math.min(1, factor));
    for (let bi = 0; bi < bodyMeshes.length; bi++) {
      const c = bodyCentres[bi];
      if (!c) continue;
      const dir = c.clone();
      if (dir.lengthSq() < 1e-9) continue;
      const offset = dir.normalize().multiplyScalar(explodeFactor * partRadius * 1.1);
      bodyMeshes[bi].position.copy(offset);
      const e = bodyEdges[bi];
      if (e) e.position.copy(offset);
    }
    // THE HIGHLIGHTS TRAVEL WITH THEIR BODIES. Without this the finding paint
    // stays where the assembled part was and ends up tinting whichever
    // neighbour slid into that space — an authoritative-looking wrong answer.
    for (const ms of faceLayers.values()) {
      for (const m of ms) {
        const slot = m.userData.bodySlot as number | undefined;
        const target = slot == null ? null : bodyOffsetInWorld(slot);
        if (target) m.position.copy(target);
      }
    }
  }

  /**
   * A body's explode offset, converted from the part's frame to the world.
   *
   * `bodyMeshes[i].position` is a CHILD of `partGroup`, which carries the
   * Z-up -> Y-up rotation this viewer applies to every CAD file. Highlight
   * overlays live in `overlayGroup` in world space, so copying that position
   * across untranslated sends the paint off at ninety degrees to the body it
   * belongs to — measured on the bolted assembly, where the tinted pin's
   * highlight landed beside the pin instead of on it. Rotate, don't copy.
   */
  function bodyOffsetInWorld(slot: number): InstanceType<typeof THREE.Vector3> | null {
    const p = bodyMeshes[slot]?.position;
    if (!p) return null;
    const rot = new THREE.Matrix4().extractRotation(partGroup.matrixWorld);
    return p.clone().applyMatrix4(rot);
  }

  /** An anchor in the PART's own coordinates -> world space. */
  function toWorld(p: [number, number, number]): InstanceType<typeof THREE.Vector3> {
    return new THREE.Vector3(p[0], p[1], p[2])
      .sub(partCentre)
      .applyMatrix4(partGroup.matrixWorld);
  }

  function highlightFaces(faceIds: Set<number>): void {
    paintFaces(DEFAULT_LAYER, faceIds);
  }

  function selectFace(triGlobal: number): void {
    clearHighlight();
    if (!meta || !triFaceAll) {
      faceChip.innerHTML = `<strong>Mesh triangle #${triGlobal}</strong><span>Exact face data needs STEP/IGES (B-rep). STL carries mesh only.</span>`;
      faceChip.style.display = '';
      return;
    }
    const faceId = triFaceAll[triGlobal];
    const face = faceById.get(faceId);
    if (!face) return;
    // Announced BEFORE the chip is built, so a listener that scrolls a finding
    // into view is not waiting on DOM work it does not care about.
    opts.onFaceSelect?.(faceId);
    // Its own layer: inspecting a face must not erase the findings overlay.
    paintFaces(SELECTION_LAYER, new Set([faceId]));

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
    if (ev.button !== 0 || !bodyMeshes.length) return;
    (canvas as unknown as { __downAt?: [number, number] }).__downAt = [ev.clientX, ev.clientY];
  };
  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0 || !bodyMeshes.length) return;
    const down = (canvas as unknown as { __downAt?: [number, number] }).__downAt;
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return; // it was a drag
    const hits = raycastMeshes(ev);
    if (!hits.length) {
      if (tool === 'select') { clearHighlight(); opts.onFaceSelect?.(null); }
      return;
    }
    const hit = hits[0];
    if (tool === 'select') {
      const triGlobal = ((hit.object as Mesh3).userData.triOffset as number) + (hit.faceIndex ?? 0);
      selectFace(triGlobal);
    } else {
      const p = snapPoint(hit as never, ev);
      picks.push(p);
      addMarker(p);
      if (tool === 'dist' && picks.length === 2) completeDistance(picks);
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
    if (ev.key === 'Escape' && picks.length) { finishPicks(); statusHint.textContent = 'Cancelled'; }
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKeyDown);

  // ── toolbar wiring ──
  let faceColorsOn = false;
  function applyFaceColors(): void {
    for (let bi = 0; bi < bodyMeshes.length; bi++) {
      const mesh = bodyMeshes[bi];
      const mat = bodyMats[bi];
      if (faceColorsOn && meta && triFaceAll) {
        if (!mesh.geometry.getAttribute('color')) {
          // built lazily — only pay for the colour buffer when the mode is used
          const triOffset = mesh.userData.triOffset as number;
          const nTris = (mesh.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>).count / 3;
          const colors = new Float32Array(nTris * 9);
          for (let t = 0; t < nTris; t++) {
            const f = faceById.get(triFaceAll[triOffset + t]);
            const col = FACE_COLORS[f?.type ?? 'other'] ?? FACE_COLORS.other;
            for (let v = 0; v < 3; v++) colors.set(col, t * 9 + v * 3);
          }
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        mat.vertexColors = true;
        mat.color.set(0xffffff);
      } else {
        mat.vertexColors = false;
        mat.color.set(0xaeb6c2);
      }
      mat.needsUpdate = true;
    }
    if (faceColorsOn && meta) {
      const present = [...new Set(meta.faces.map(f => f.type))];
      legendEl.innerHTML = present.map(t => {
        const c = FACE_COLORS[t] ?? FACE_COLORS.other;
        return `<span><i style="background:rgb(${c.map(x => Math.round(x * 255)).join(',')})"></i>${FACE_TYPE_LABEL[t] ?? t}</span>`;
      }).join('');
    }
    legendEl.style.display = faceColorsOn ? '' : 'none';
  }

  function setTool(t: Tool): void {
    tool = t;
    finishPicks();
    root.querySelectorAll('[data-act^="tool-"]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.act === `tool-${t}`));
    canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    statusHint.textContent = t === 'select' ? 'Click a face for exact B-rep data'
      : t === 'dist' ? 'Distance: pick two points (snaps to vertices & edges)'
      : t === 'circle' ? 'Circle: pick 3 points on a rim or bore'
      : 'Angle: pick point, corner, point';
  }

  $('.cv3d-csv-btn').addEventListener('click', (ev) => { ev.stopPropagation(); exportCSV(); });
  clipPanel.querySelectorAll('button[data-axis]').forEach(btn => {
    btn.addEventListener('click', () => {
      clipAxis = (btn as HTMLElement).dataset.axis as 'x' | 'y' | 'z';
      clipPanel.querySelectorAll('button[data-axis]').forEach(b => b.classList.toggle('active', b === btn));
      updateClipPlane();
    });
  });
  clipSlider.addEventListener('input', updateClipPlane);
  $('.cv3d-clip-off').addEventListener('click', () => {
    clipOn = false;
    clipPanel.style.display = 'none';
    $('[data-act="clip"]').classList.remove('active');
    applyClipping();
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
      case 'facecolors':
        faceColorsOn = !faceColorsOn;
        btn.classList.toggle('active', faceColorsOn);
        applyFaceColors();
        break;
      case 'clip':
        clipOn = !clipOn;
        btn.classList.toggle('active', clipOn);
        clipPanel.style.display = clipOn ? '' : 'none';
        if (clipOn) updateClipPlane(); else applyClipping();
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
      case 'clear': clearMeasurements(); statusHint.textContent = 'Cleared'; break;
      case 'snap': {
        // Through the same function the report capture uses, so the button and
        // the export can never drift to different resolutions or encodings.
        const url = snapshot();
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
  });

  resize();
  setView([1, 0.8, 1]);
  tick();

  return {
    loadFile,
    getMeasurements: measurementRecords,
    highlightFaces: (ids: Iterable<number>) => highlightFaces(new Set(ids)),
    clearHighlight,
    paintFaces: (layer, ids, style) => paintFaces(layer, new Set(ids), style),
    clearLayer,
    clearAllLayers,
    setView: (name: NamedView) => setView(NAMED_VIEWS[name]),
    fit,
    getCamera: () => ({
      position: camera.position.toArray() as [number, number, number],
      target: controls.target.toArray() as [number, number, number],
    }),
    setCamera(c) {
      camera.position.set(...c.position);
      controls.target.set(...c.target);
      controls.update();
    },
    snapshot,
    sectionThrough,
    setAnnotations,
    projectAnchors,
    flyTo,
    setBodyColours: (m) => setBodyColours(m),
    setExplode,
    el: root,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      loadSeq++; // invalidate any in-flight load
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
      ro.disconnect();
      controls.dispose();
      // free every GPU resource this instance created
      scene.traverse(disposeObject);
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* context may already be gone */ }
      if (edgeWorker) { edgeWorker.terminate(); edgeWorker = null; }
      clearCallouts();
      labelRenderer.domElement.remove();
      root.remove();
    },
  };
}

/**
 * Interactive 3D CAD viewer — opens uploaded CAD like a CAD tool.
 *
 * Orbit/zoom/pan, canonical views, shaded+edges display, bounding-box
 * dimensions, point-to-point distance and 3-point circle measurement with
 * vertex snapping, and — for STEP/IGES via the OCCT sidecar — exact B-rep
 * face intelligence: click a face for its true type/radius/area, or colour
 * the whole part by machining-surface type. Mesh visuals, kernel truth.
 *
 * Self-contained module: three.js is lazy-loaded, all DOM/styles are built
 * here (cv3d-* classes in calculator.css). Two mounts share this component:
 * the standalone CAD-to-Cost view and the per-commodity inline uploader.
 */

import { parseSTLMesh } from './cad-views.js';

type V3 = { x: number; y: number; z: number };

export interface FaceMeta { id: number; type: string; radiusMm: number | null; areaCm2: number | null }
export interface TessMeta { triFace: number[]; faces: FaceMeta[]; bodies: number }

export interface CADViewerOptions {
  compact?: boolean;
  /** Called with a JPEG data URL when the user takes a snapshot. */
  onSnapshot?: (dataUrl: string) => void;
  /** Extra headers for the tessellate fetch (x-api-key passthrough). */
  headers?: Record<string, string>;
}

export interface CADViewerHandle {
  loadFile(file: File): Promise<void>;
  dispose(): void;
  el: HTMLElement;
}

// ── Pure measurement math (exported for unit tests) ──────────────────────────

export function dist3(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Circumcircle of 3 points in 3D → centre + radius, or null when collinear. */
export function circumcircle3(p1: V3, p2: V3, p3: V3): { center: V3; radius: number } | null {
  const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
  const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
  const abab = ax * ax + ay * ay + az * az;
  const abac = ax * bx + ay * by + az * bz;
  const acac = bx * bx + by * by + bz * bz;
  const d = 2 * (abab * acac - abac * abac);
  if (Math.abs(d) < 1e-12) return null; // collinear
  const s = (acac * (abab - abac)) / d;
  const t = (abab * (acac - abac)) / d;
  const center = { x: p1.x + s * ax + t * bx, y: p1.y + s * ay + t * by, z: p1.z + s * az + t * bz };
  return { center, radius: dist3(center, p1) };
}

// ── Face-type palette (colour-by-machining-surface mode) ─────────────────────

const FACE_COLORS: Record<string, [number, number, number]> = {
  plane:    [0.42, 0.55, 0.78], // milling faces — steel blue
  cylinder: [0.95, 0.65, 0.25], // holes / bores / turned — amber
  cone:     [0.30, 0.75, 0.68], // chamfers / tapers — teal
  sphere:   [0.72, 0.45, 0.85], // ball features — violet
  torus:    [0.85, 0.45, 0.55], // fillets — rose
  freeform: [0.65, 0.50, 0.90], // 5-axis sculpted — purple
  other:    [0.62, 0.66, 0.72],
};
const FACE_TYPE_LABEL: Record<string, string> = {
  plane: 'Planar (mill/face)', cylinder: 'Cylindrical (drill/bore/turn)', cone: 'Conical (chamfer/taper)',
  sphere: 'Spherical', torus: 'Toroidal (fillet)', freeform: 'Freeform (5-axis)', other: 'Other',
};

// ── Component ─────────────────────────────────────────────────────────────────

export async function createCADViewer(host: HTMLElement, opts: CADViewerOptions = {}): Promise<CADViewerHandle> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

  // ── DOM scaffold ──
  const root = document.createElement('div');
  root.className = 'cv3d' + (opts.compact ? ' cv3d--compact' : '');
  root.innerHTML = `
    <div class="cv3d-toolbar">
      <div class="cv3d-group">
        <button data-act="view-iso" title="Isometric view (Home)">⌂</button>
        <button data-act="view-front" title="Front view">F</button>
        <button data-act="view-top" title="Top view">T</button>
        <button data-act="view-right" title="Right view">R</button>
        <button data-act="fit" title="Fit part to screen">⛶</button>
      </div>
      <div class="cv3d-group">
        <button data-act="mode-shaded" class="active" title="Shaded with edges">◧</button>
        <button data-act="mode-wire" title="Wireframe">◇</button>
        <button data-act="bbox" title="Bounding box + dimensions">▣</button>
        <button data-act="facecolors" title="Colour by machining surface type (STEP/IGES only)" disabled>🎨</button>
      </div>
      <div class="cv3d-group">
        <button data-act="tool-select" class="active" title="Select — click a face for exact B-rep data">➤</button>
        <button data-act="tool-dist" title="Measure distance — click two points (snaps to vertices)">↔</button>
        <button data-act="tool-circle" title="Measure circle — click 3 points on a rim or bore">◯</button>
        <button data-act="clear" title="Clear measurements &amp; selection">✕</button>
      </div>
      <div class="cv3d-group">
        <button data-act="snap" title="Snapshot — attach to report / download">📷</button>
      </div>
    </div>
    <div class="cv3d-viewport">
      <canvas class="cv3d-canvas"></canvas>
      <div class="cv3d-facechip" style="display:none"></div>
      <div class="cv3d-legend" style="display:none"></div>
      <div class="cv3d-measures" style="display:none">
        <div class="cv3d-measures-title">Measurements</div>
        <div class="cv3d-measures-list"></div>
      </div>
    </div>
    <div class="cv3d-status">
      <span class="cv3d-status-file">No file loaded</span>
      <span class="cv3d-status-dims"></span>
      <span class="cv3d-status-hint">Drag to rotate · scroll to zoom · right-drag to pan</span>
    </div>`;
  host.appendChild(root);

  const canvas = root.querySelector('.cv3d-canvas') as HTMLCanvasElement;
  const viewport = root.querySelector('.cv3d-viewport') as HTMLElement;
  const faceChip = root.querySelector('.cv3d-facechip') as HTMLElement;
  const legendEl = root.querySelector('.cv3d-legend') as HTMLElement;
  const measuresBox = root.querySelector('.cv3d-measures') as HTMLElement;
  const measuresList = root.querySelector('.cv3d-measures-list') as HTMLElement;
  const statusFile = root.querySelector('.cv3d-status-file') as HTMLElement;
  const statusDims = root.querySelector('.cv3d-status-dims') as HTMLElement;
  const statusHint = root.querySelector('.cv3d-status-hint') as HTMLElement;

  // ── three.js scene ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

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

  let mesh: InstanceType<typeof THREE.Mesh> | null = null;
  let edges: InstanceType<typeof THREE.LineSegments> | null = null;
  let grid: InstanceType<typeof THREE.GridHelper> | null = null;
  let bboxHelper: InstanceType<typeof THREE.Box3Helper> | null = null;
  let bboxLabels: Array<InstanceType<typeof THREE.Sprite>> = [];
  let baseMat: InstanceType<typeof THREE.MeshStandardMaterial> | null = null;
  let highlight: InstanceType<typeof THREE.Mesh> | null = null;
  let meta: TessMeta | null = null;
  let partRadius = 1;
  let disposed = false;

  // ── labels (canvas sprites, constant screen size) ──
  function makeLabel(text: string, accent = false): InstanceType<typeof THREE.Sprite> {
    const pad = 10, fs = 30;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
    c.height = fs + pad * 1.6;
    const ctx2 = c.getContext('2d')!;
    ctx2.fillStyle = accent ? 'rgba(37,99,235,0.92)' : 'rgba(15,18,22,0.88)';
    const r = 10;
    ctx2.beginPath();
    ctx2.roundRect(0, 0, c.width, c.height, r);
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
      const d = camera.position.distanceTo((sp as InstanceType<typeof THREE.Sprite>).position);
      const h = d * 0.045 * (opts.compact ? 1.4 : 1);
      const aspect = (sp as unknown as { __aspect?: number }).__aspect ?? 4;
      (sp as InstanceType<typeof THREE.Sprite>).scale.set(h * aspect, h, 1);
    }
  }

  // ── render loop ──
  function tick(): void {
    if (disposed) return;
    requestAnimationFrame(tick);
    controls.update();
    scaleLabels();
    renderer.render(scene, camera);
  }

  function resize(): void {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
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

  // ── load ──
  async function loadFile(file: File): Promise<void> {
    let stlBuf: ArrayBuffer;
    meta = null;
    if (/\.stl$/i.test(file.name)) {
      stlBuf = await file.arrayBuffer();
    } else if (/\.(stp|step|igs|iges)$/i.test(file.name)) {
      statusFile.textContent = `Tessellating ${file.name}…`;
      const fd = new FormData();
      fd.append('cadFile', file);
      const resp = await fetch('/api/cad/tessellate?meta=1', { method: 'POST', headers: opts.headers ?? {}, body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })) as { error?: string };
        statusFile.textContent = `Cannot open ${file.name}: ${err.error ?? resp.status}`;
        throw new Error(err.error ?? `tessellation failed (${resp.status})`);
      }
      const data = await resp.json() as { stlBase64: string; meta: TessMeta | null };
      const bin = atob(data.stlBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      stlBuf = bytes.buffer;
      meta = data.meta;
    } else {
      statusFile.textContent = 'Unsupported format (STEP/IGES/STL)';
      throw new Error('unsupported format');
    }

    const { positions, triangles } = parseSTLMesh(stlBuf);

    // reset scene objects
    clearMeasurements();
    for (const obj of [mesh, edges, grid, bboxHelper]) if (obj) partGroup.remove(obj as never);
    bboxLabels.forEach(l => scene.remove(l)); bboxLabels = [];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const bb = geometry.boundingBox!;
    const centre = new THREE.Vector3(); bb.getCenter(centre);
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    partRadius = geometry.boundingSphere!.radius || 1;

    // face colours (from B-rep meta)
    if (meta && meta.triFace.length === triangles) {
      const colors = new Float32Array(triangles * 9);
      for (let t = 0; t < triangles; t++) {
        const f = meta.faces[meta.triFace[t]];
        const col = FACE_COLORS[f?.type ?? 'other'] ?? FACE_COLORS.other;
        for (let v = 0; v < 3; v++) { colors.set(col, t * 9 + v * 3); }
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    baseMat = new THREE.MeshStandardMaterial({ color: 0xaeb6c2, metalness: 0.45, roughness: 0.5, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(geometry, baseMat);
    partGroup.add(mesh);

    edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 24),
      new THREE.LineBasicMaterial({ color: 0x11141a, transparent: true, opacity: 0.85 }),
    );
    partGroup.add(edges);

    const span = new THREE.Vector3(); bb.getSize(span);
    const gridSize = Math.max(span.x, span.y) * 2.2;
    grid = new THREE.GridHelper(gridSize, 20, 0x9aa4b0, 0xdde2e8); // light greys — readable on the white viewport
    grid.rotation.x = Math.PI / 2;              // grid on the part's XY plane (Z-up world)
    grid.position.z = -span.z / 2 - partRadius * 0.02;
    partGroup.add(grid);

    // bbox (built on demand via toggle)
    buildBBox(span);

    const bodies = meta?.bodies ?? 1;
    statusFile.textContent = `${file.name} · ${triangles.toLocaleString()} triangles${meta ? ` · ${meta.faces.length} faces` : ''} · ${bodies} ${bodies === 1 ? 'body' : 'bodies'}`;
    statusDims.textContent = `X ${span.x.toFixed(2)} · Y ${span.y.toFixed(2)} · Z ${span.z.toFixed(2)} mm`;

    const fcBtn = root.querySelector('[data-act="facecolors"]') as HTMLButtonElement;
    fcBtn.disabled = !meta;
    fcBtn.title = meta ? 'Colour by machining surface type' : 'Face types need STEP/IGES (B-rep) — STL is mesh-only';

    resize();
    fit();
  }

  let bboxOn = false;
  function buildBBox(span: InstanceType<typeof THREE.Vector3>): void {
    if (bboxHelper) { partGroup.remove(bboxHelper); bboxHelper = null; }
    bboxLabels.forEach(l => scene.remove(l)); bboxLabels = [];
    if (!mesh) return;
    const bb = (mesh.geometry as InstanceType<typeof THREE.BufferGeometry>).boundingBox!;
    bboxHelper = new THREE.Box3Helper(bb, new THREE.Color(0x4f8ef7));
    bboxHelper.visible = bboxOn;
    partGroup.add(bboxHelper);
    const mk = (txt: string, local: InstanceType<typeof THREE.Vector3>) => {
      const sp = makeLabel(txt, true);
      sp.position.copy(local.applyMatrix4(partGroup.matrixWorld));
      sp.visible = bboxOn;
      scene.add(sp);
      bboxLabels.push(sp);
    };
    partGroup.updateMatrixWorld(true);
    mk(`X ${span.x.toFixed(2)} mm`, new THREE.Vector3(0, bb.min.y - partRadius * 0.08, bb.min.z));
    mk(`Y ${span.y.toFixed(2)} mm`, new THREE.Vector3(bb.min.x - partRadius * 0.08, 0, bb.min.z));
    mk(`Z ${span.z.toFixed(2)} mm`, new THREE.Vector3(bb.min.x - partRadius * 0.08, bb.min.y, 0));
  }

  // ── picking / tools ──
  type Tool = 'select' | 'dist' | 'circle';
  let tool: Tool = 'select';
  let picks: Array<InstanceType<typeof THREE.Vector3>> = [];
  let pickMarkers: Array<InstanceType<typeof THREE.Mesh>> = [];
  const raycaster = new THREE.Raycaster();

  function screenToNDC(ev: PointerEvent): InstanceType<typeof THREE.Vector2> {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Snap the hit to the nearest triangle vertex within ~14 screen px. */
  function snapPoint(hit: { point: InstanceType<typeof THREE.Vector3>; face: { a: number; b: number; c: number } | null }, ev: PointerEvent): InstanceType<typeof THREE.Vector3> {
    if (!hit.face || !mesh) return hit.point.clone();
    const pos = (mesh.geometry as InstanceType<typeof THREE.BufferGeometry>).getAttribute('position');
    const r = canvas.getBoundingClientRect();
    let best = hit.point.clone(); let bestPx = 14;
    for (const idx of [hit.face.a, hit.face.b, hit.face.c]) {
      const v = new THREE.Vector3().fromBufferAttribute(pos as never, idx).applyMatrix4(mesh.matrixWorld);
      const p = v.clone().project(camera);
      const px = Math.hypot(((p.x + 1) / 2) * r.width - (ev.clientX - r.left), ((1 - p.y) / 2) * r.height - (ev.clientY - r.top));
      if (px < bestPx) { bestPx = px; best = v; }
    }
    return best;
  }

  function addMarker(p: InstanceType<typeof THREE.Vector3>): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(partRadius * 0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false }),
    );
    m.renderOrder = 998;
    m.position.copy(p);
    overlayGroup.add(m);
    pickMarkers.push(m);
  }

  interface Measurement { label: string; objects: Array<InstanceType<typeof THREE.Object3D>> }
  const measurements: Measurement[] = [];

  function renderMeasureList(): void {
    measuresBox.style.display = measurements.length ? '' : 'none';
    measuresList.innerHTML = measurements.map((m, i) =>
      `<div class="cv3d-measure-row"><span>${m.label}</span><button data-del="${i}" title="Remove">✕</button></div>`).join('');
    measuresList.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number((btn as HTMLElement).dataset.del);
        measurements[i]?.objects.forEach(o => overlayGroup.remove(o));
        measurements.splice(i, 1);
        renderMeasureList();
      });
    });
  }

  function finishPicks(): void {
    picks = [];
    pickMarkers.forEach(m => overlayGroup.remove(m));
    pickMarkers = [];
  }

  function clearMeasurements(): void {
    measurements.forEach(m => m.objects.forEach(o => overlayGroup.remove(o)));
    measurements.length = 0;
    finishPicks();
    clearHighlight();
    renderMeasureList();
  }

  function clearHighlight(): void {
    if (highlight) { overlayGroup.remove(highlight); highlight = null; }
    faceChip.style.display = 'none';
  }

  function completeDistance(): void {
    const [a, b] = picks;
    const mm = a.distanceTo(b);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false }));
    line.renderOrder = 997;
    const label = makeLabel(`${mm.toFixed(2)} mm`);
    label.position.copy(a.clone().add(b).multiplyScalar(0.5));
    const ends = pickMarkers.slice(-2);
    overlayGroup.add(line, label);
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), dz = Math.abs(a.z - b.z);
    measurements.push({ label: `↔ ${mm.toFixed(2)} mm  (ΔX ${dx.toFixed(1)} · ΔY ${dz.toFixed(1)} · ΔZ ${dy.toFixed(1)})`, objects: [line, label, ...ends] });
    pickMarkers = pickMarkers.filter(m => !ends.includes(m));
    renderMeasureList();
    picks = [];
  }

  function completeCircle(): void {
    const [p1, p2, p3] = picks;
    const res = circumcircle3(p1, p2, p3);
    const ends = pickMarkers.slice(-3);
    if (!res) { statusHint.textContent = 'Points are collinear — pick 3 points around the rim'; finishPicks(); return; }
    const { center, radius } = res;
    const cV = new THREE.Vector3(center.x, center.y, center.z);
    const n = new THREE.Vector3().subVectors(p2, p1).cross(new THREE.Vector3().subVectors(p3, p1)).normalize();
    const u = new THREE.Vector3().subVectors(p1, cV).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const pts: Array<InstanceType<typeof THREE.Vector3>> = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      pts.push(cV.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius));
    }
    const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x35d07f, depthTest: false }));
    circle.renderOrder = 997;
    const label = makeLabel(`Ø ${(radius * 2).toFixed(2)} · R ${radius.toFixed(2)} mm`);
    label.position.copy(cV);
    overlayGroup.add(circle, label);
    measurements.push({ label: `◯ Ø ${(radius * 2).toFixed(2)} mm (R ${radius.toFixed(2)})`, objects: [circle, label, ...ends] });
    pickMarkers = pickMarkers.filter(m => !ends.includes(m));
    renderMeasureList();
    picks = [];
  }

  function selectFace(triIndex: number): void {
    clearHighlight();
    if (!mesh) return;
    if (!meta || meta.triFace.length === 0) {
      faceChip.innerHTML = `<strong>Mesh triangle #${triIndex}</strong><span>Exact face data needs STEP/IGES (B-rep). STL carries mesh only.</span>`;
      faceChip.style.display = '';
      return;
    }
    const faceId = meta.triFace[triIndex];
    const face = meta.faces[faceId];
    if (!face) return;
    // highlight every triangle belonging to this B-rep face
    const src = (mesh.geometry as InstanceType<typeof THREE.BufferGeometry>).getAttribute('position');
    const tris: number[] = [];
    for (let t = 0; t < meta.triFace.length; t++) if (meta.triFace[t] === faceId) tris.push(t);
    const hp = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => { for (let k = 0; k < 9; k++) hp[i * 9 + k] = (src as never as { array: Float32Array }).array[t * 9 + k]; });
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.computeVertexNormals();
    highlight = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x4f8ef7, transparent: true, opacity: 0.55, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    highlight.applyMatrix4(mesh.matrixWorld);
    overlayGroup.add(highlight);

    const bits = [`<strong>Face #${faceId} — ${FACE_TYPE_LABEL[face.type] ?? face.type}</strong>`];
    if (face.radiusMm != null) bits.push(`<span>R ${face.radiusMm.toFixed(3)} mm · Ø ${(face.radiusMm * 2).toFixed(3)} mm <em>(exact, from B-rep)</em></span>`);
    if (face.areaCm2 != null) bits.push(`<span>Area ${face.areaCm2.toFixed(2)} cm²</span>`);
    bits.push(`<span>${tris.length} triangles</span>`);
    faceChip.innerHTML = bits.join('');
    faceChip.style.display = '';
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !mesh) return;
    (canvas as unknown as { __downAt?: [number, number] }).__downAt = [ev.clientX, ev.clientY];
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0 || !mesh) return;
    const down = (canvas as unknown as { __downAt?: [number, number] }).__downAt;
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return; // it was a drag
    raycaster.setFromCamera(screenToNDC(ev), camera);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) { if (tool === 'select') clearHighlight(); return; }
    const hit = hits[0];
    if (tool === 'select') {
      selectFace(hit.faceIndex ?? 0);
    } else {
      const p = snapPoint(hit as never, ev);
      picks.push(p);
      addMarker(p);
      if (tool === 'dist' && picks.length === 2) completeDistance();
      if (tool === 'circle' && picks.length === 3) completeCircle();
      statusHint.textContent = tool === 'dist'
        ? (picks.length === 1 ? 'Pick the second point' : 'Distance: pick two points (vertex-snapped)')
        : (picks.length ? `Circle: ${3 - picks.length} more point${3 - picks.length > 1 ? 's' : ''} on the rim` : 'Circle: pick 3 points on a rim or bore');
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { finishPicks(); statusHint.textContent = 'Cancelled'; }
  });

  // ── toolbar wiring ──
  let faceColorsOn = false;
  function setTool(t: Tool): void {
    tool = t;
    finishPicks();
    root.querySelectorAll('[data-act^="tool-"]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.act === `tool-${t}`));
    canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    statusHint.textContent = t === 'select' ? 'Click a face for exact B-rep data'
      : t === 'dist' ? 'Distance: pick two points (vertex-snapped)'
      : 'Circle: pick 3 points on a rim or bore';
  }
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
        if (baseMat) { baseMat.wireframe = false; if (edges) edges.visible = true; }
        root.querySelector('[data-act="mode-wire"]')?.classList.remove('active');
        btn.classList.add('active');
        break;
      case 'mode-wire':
        if (baseMat) { baseMat.wireframe = true; if (edges) edges.visible = false; }
        root.querySelector('[data-act="mode-shaded"]')?.classList.remove('active');
        btn.classList.add('active');
        break;
      case 'bbox':
        bboxOn = !bboxOn;
        btn.classList.toggle('active', bboxOn);
        if (bboxHelper) bboxHelper.visible = bboxOn;
        bboxLabels.forEach(l => { l.visible = bboxOn; });
        break;
      case 'facecolors': {
        faceColorsOn = !faceColorsOn;
        btn.classList.toggle('active', faceColorsOn);
        if (baseMat) {
          baseMat.vertexColors = faceColorsOn;
          baseMat.color.set(faceColorsOn ? 0xffffff : 0xaeb6c2);
          baseMat.needsUpdate = true;
        }
        if (faceColorsOn && meta) {
          const present = [...new Set(meta.faces.map(f => f.type))];
          legendEl.innerHTML = present.map(t => {
            const c = FACE_COLORS[t] ?? FACE_COLORS.other;
            return `<span><i style="background:rgb(${c.map(x => Math.round(x * 255)).join(',')})"></i>${FACE_TYPE_LABEL[t] ?? t}</span>`;
          }).join('');
        }
        legendEl.style.display = faceColorsOn ? '' : 'none';
        break;
      }
      case 'tool-select': setTool('select'); break;
      case 'tool-dist': setTool('dist'); break;
      case 'tool-circle': setTool('circle'); break;
      case 'clear': clearMeasurements(); statusHint.textContent = 'Cleared'; break;
      case 'snap': {
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
        opts.onSnapshot?.(url);
        const a = document.createElement('a');
        a.href = url; a.download = 'cad-view.jpg'; a.click();
        statusHint.textContent = opts.onSnapshot ? 'Snapshot attached to report + downloaded' : 'Snapshot downloaded';
        break;
      }
    }
  });

  resize();
  setView([1, 0.8, 1]);
  tick();

  return {
    loadFile,
    el: root,
    dispose(): void {
      disposed = true;
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      root.remove();
    },
  };
}

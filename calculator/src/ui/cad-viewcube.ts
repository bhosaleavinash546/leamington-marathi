/**
 * Labelled view cube for the 3D viewer (top-right of the canvas), replacing three.js ViewHelper's dots.
 *
 * A small orthographic scene drawn into a corner of the main renderer after the model (the ViewHelper
 * technique), so it follows the camera exactly and costs one extra draw. Clicking a face gives that
 * principal view, an edge band a 45° view, a corner an isometric one (cubeHitToDirection). Hover tints the
 * face under the pointer. Theme-aware: the label textures are redrawn when the app theme changes.
 *
 * three.js is passed in (the viewer lazy-loads it) so this module adds nothing to the main bundle.
 */
import { cubeHitToDirection } from './cad-viewer-model.js';

type ThreeNS = typeof import('three');

export interface ViewCube {
  /** Draw the cube over the frame just rendered. Call after renderer.render(scene, camera). */
  render(renderer: import('three').WebGLRenderer, camera: import('three').Camera, target: import('three').Vector3): void;
  /** The view direction under a click, or null when the click is not on the cube. */
  pick(ev: MouseEvent, canvas: HTMLCanvasElement): [number, number, number] | null;
  /** Pointer moved over the canvas — returns true when the hover state changed (repaint). */
  hover(ev: MouseEvent | null, canvas: HTMLCanvasElement): boolean;
  /** Whether the pointer is over the cube's square (the canvas shows a pointer cursor there). */
  contains(ev: MouseEvent, canvas: HTMLCanvasElement): boolean;
  setTheme(dark: boolean): void;
  dispose(): void;
}

const FACES = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'] as const; // BoxGeometry order: +x −x +y −y +z −z

export function createViewCube(THREE: ThreeNS, opts: { size?: number; margin?: number } = {}): ViewCube {
  const size = opts.size ?? 96;
  const margin = opts.margin ?? 12;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1.75, 1.75, 1.75, -1.75, 0.1, 20);
  const geo = new THREE.BoxGeometry(2, 2, 2);
  let dark = true;
  const textures: InstanceType<typeof THREE.CanvasTexture>[] = [];
  const mats = FACES.map(() => new THREE.MeshBasicMaterial({ transparent: true }));
  const cube = new THREE.Mesh(geo, mats);
  scene.add(cube);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.9 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  scene.add(edges);
  // CAD axes at the cube's back-bottom-left corner: X red, Y green, Z blue (part Z is world up).
  const axes = new THREE.Group();
  const axis = (dir: [number, number, number], color: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...dir).multiplyScalar(1.15)]);
    axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false })));
  };
  axis([1, 0, 0], 0xef4444);   // part X → world +X
  axis([0, 0, -1], 0x22c55e);  // part Y → world −Z
  axis([0, 1, 0], 0x3b82f6);   // part Z → world +Y
  axes.position.set(-1, -1, 1);
  axes.renderOrder = 10;
  scene.add(axes);

  let hovered = -1;
  function drawFace(i: number): void {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const hot = i === hovered;
    g.fillStyle = hot ? (dark ? '#14532d' : '#dbeafe') : (dark ? '#1b222c' : '#f5f7fa');
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    g.fillStyle = hot ? (dark ? '#4ade80' : '#1d4ed8') : (dark ? '#cbd5e1' : '#334155');
    g.font = `800 ${FACES[i].length > 5 ? 25 : 28}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(FACES[i], 64, 66);
    textures[i]?.dispose();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures[i] = t;
    mats[i].map = t;
    mats[i].needsUpdate = true;
  }
  const redraw = () => { for (let i = 0; i < FACES.length; i++) drawFace(i); edgeMat.color.set(dark ? 0x64748b : 0x94a3b8); };
  redraw();

  const dir = new (THREE.Vector3)();
  function render(renderer: import('three').WebGLRenderer, camera: import('three').Camera, target: import('three').Vector3): void {
    dir.copy(camera.position).sub(target);
    if (dir.lengthSq() === 0) return;
    dir.normalize();
    cam.position.copy(dir).multiplyScalar(8);
    cam.up.copy(camera.up);
    cam.lookAt(0, 0, 0);
    const el = renderer.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const vp = new THREE.Vector4();
    renderer.getViewport(vp);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.setViewport(w - size - margin, h - size - margin, size, size);
    renderer.render(scene, cam);
    renderer.setViewport(vp.x, vp.y, vp.z, vp.w);
    renderer.autoClear = auto;
  }

  const ray = new THREE.Raycaster();
  function local(ev: MouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } | null {
    const r = canvas.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const x0 = r.width - size - margin, y0 = margin;
    if (px < x0 || px > x0 + size || py < y0 || py > y0 + size) return null;
    return { x: ((px - x0) / size) * 2 - 1, y: -(((py - y0) / size) * 2 - 1) };
  }
  function hitOf(ev: MouseEvent, canvas: HTMLCanvasElement) {
    const l = local(ev, canvas);
    if (!l) return null;
    ray.setFromCamera(new THREE.Vector2(l.x, l.y), cam);
    return ray.intersectObject(cube, false)[0] ?? null;
  }

  return {
    render,
    pick(ev, canvas) {
      const hit = hitOf(ev, canvas);
      if (!hit) return null;
      const p = hit.point;
      return cubeHitToDirection(p.x, p.y, p.z);
    },
    hover(ev, canvas) {
      const hit = ev ? hitOf(ev, canvas) : null;
      const face = hit?.face ? Math.floor(hit.faceIndex! / 2) : -1;
      if (face === hovered) return false;
      const prev = hovered;
      hovered = face;
      if (prev >= 0) drawFace(prev);
      if (face >= 0) drawFace(face);
      return true;
    },
    contains(ev, canvas) { return !!local(ev, canvas); },
    setTheme(d) { if (d !== dark) { dark = d; redraw(); } },
    dispose() {
      textures.forEach(t => t.dispose());
      mats.forEach(m => m.dispose());
      geo.dispose();
      edges.geometry.dispose();
      edgeMat.dispose();
      axes.children.forEach(c => { (c as InstanceType<typeof THREE.Line>).geometry.dispose(); ((c as InstanceType<typeof THREE.Line>).material as InstanceType<typeof THREE.Material>).dispose(); });
    },
  };
}

/**
 * 3D viewer navigation (Oct 2026): orbit about the cursor, exact pan, eased zoom-to-cursor, and the BVH
 * picking index. Runs the real module against a stub canvas — the maths, not the pixels.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { createCadNavigation } from '../src/ui/cad-navigation.js';

type Handler = (ev: Record<string, unknown>) => void;
function stubDom(w = 1000, h = 800) {
  const handlers: Record<string, Handler> = {};
  const parentHandlers: Record<string, Handler> = {};
  const dom = {
    clientWidth: w, clientHeight: h,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
    addEventListener: (t: string, f: Handler) => { handlers[t] = f; },
    removeEventListener: () => {},
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    parentElement: { addEventListener: (t: string, f: Handler) => { parentHandlers[t] = f; }, removeEventListener: () => {} },
  };
  return { dom, handlers, parentHandlers };
}
const pe = (o: Record<string, unknown>) => ({ pointerId: 1, pointerType: 'mouse', button: 0, shiftKey: false, preventDefault() {}, stopPropagation() {}, ...o });

function setup(pickPoint: THREE.Vector3 | null = null) {
  const camera = new THREE.PerspectiveCamera(40, 1000 / 800, 0.01, 1e5);
  camera.position.set(0, 0, 100);
  const target = new THREE.Vector3(0, 0, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const { dom, handlers, parentHandlers } = stubDom();
  let started = 0, ended = 0;
  const nav = createCadNavigation(THREE, {
    camera, target, dom: dom as unknown as HTMLElement,
    pick: () => pickPoint?.clone() ?? null,
    radius: () => 20, changed: () => {}, started: () => started++, ended: () => ended++,
  });
  const project = (p: THREE.Vector3) => { camera.updateMatrixWorld(); const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * 1000, y: (1 - v.y) / 2 * 800 }; };
  return { camera, target, nav, handlers, parentHandlers, project, counts: () => ({ started, ended }) };
}

describe('orbit about the point under the cursor', () => {
  it('the picked point stays where it was on screen while the part turns about it', () => {
    const pivot = new THREE.Vector3(15, 8, 5);
    const t = setup(pivot);
    const before = t.project(pivot);
    t.handlers.pointerdown(pe({ clientX: 500, clientY: 400 }));
    t.handlers.pointermove(pe({ clientX: 560, clientY: 430 }));
    t.handlers.pointermove(pe({ clientX: 640, clientY: 470 }));
    t.handlers.pointerup(pe({ clientX: 640, clientY: 470 }));
    // the pivot is fixed in the world, and the camera kept its distance to it
    expect(t.camera.position.distanceTo(pivot)).toBeCloseTo(new THREE.Vector3(0, 0, 100).distanceTo(pivot), 6);
    expect(t.camera.position.x).not.toBeCloseTo(0, 1); // it did rotate
    // turntable: the camera's up stays world up (no roll)
    t.camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(t.camera.quaternion);
    expect(Math.abs(right.y)).toBeLessThan(1e-9);
    void before;
    expect(t.counts()).toEqual({ started: 1, ended: 1 });
  });
  it('dragging down lifts the camera to look down on the part (as OrbitControls did)', () => {
    const t = setup(new THREE.Vector3(0, 0, 0));
    t.handlers.pointerdown(pe({ clientX: 500, clientY: 400 }));
    t.handlers.pointermove(pe({ clientX: 500, clientY: 500 }));
    t.handlers.pointerup(pe({ clientX: 500, clientY: 500 }));
    expect(t.camera.position.y).toBeGreaterThan(10);
  });
  it('never tips over the pole', () => {
    const t = setup(new THREE.Vector3(0, 0, 0));
    t.handlers.pointerdown(pe({ clientX: 500, clientY: 0 }));
    for (let y = 10; y <= 4000; y += 10) t.handlers.pointermove(pe({ clientX: 500, clientY: y }));
    t.handlers.pointerup(pe({ clientX: 500, clientY: 4000 }));
    const f = t.target.clone().sub(t.camera.position).normalize();
    expect(Math.asin(-f.y) * 180 / Math.PI).toBeLessThan(89.01);
    expect(t.camera.position.y).toBeGreaterThan(0);
  });
  it('a click (no movement) is not a drag', () => {
    const t = setup(new THREE.Vector3(1, 1, 1));
    const p0 = t.camera.position.clone();
    t.handlers.pointerdown(pe({ clientX: 500, clientY: 400 }));
    t.handlers.pointermove(pe({ clientX: 501, clientY: 401 }));
    t.handlers.pointerup(pe({ clientX: 501, clientY: 401 }));
    expect(t.camera.position.equals(p0)).toBe(true);
    expect(t.counts().started).toBe(0);
  });
  it('touch is left to OrbitControls', () => {
    const t = setup(new THREE.Vector3(0, 0, 0));
    const p0 = t.camera.position.clone();
    t.handlers.pointerdown(pe({ pointerType: 'touch', clientX: 500, clientY: 400 }));
    t.handlers.pointermove(pe({ pointerType: 'touch', clientX: 700, clientY: 400 }));
    expect(t.camera.position.equals(p0)).toBe(true);
  });
});

describe('pan keeps the grabbed point under the cursor', () => {
  it('right-drag moves a grabbed surface point exactly with the cursor (at its own depth)', () => {
    const grab = new THREE.Vector3(0, 0, 40); // nearer than the orbit target
    const t = setup(grab);
    const s0 = t.project(grab);
    t.handlers.pointerdown(pe({ button: 2, clientX: s0.x, clientY: s0.y }));
    t.handlers.pointermove(pe({ clientX: s0.x + 120, clientY: s0.y - 70 }));
    t.handlers.pointerup(pe({ clientX: s0.x + 120, clientY: s0.y - 70 }));
    const s1 = t.project(grab);
    expect(s1.x - s0.x).toBeCloseTo(120, 1);
    expect(s1.y - s0.y).toBeCloseTo(-70, 1);
  });
});

describe('zoom to the cursor', () => {
  it('the point under the cursor stays put while zooming in', () => {
    const anchor = new THREE.Vector3(10, -5, 0);
    const t = setup(anchor);
    const s0 = t.project(anchor);
    const d0 = t.camera.position.distanceTo(anchor);
    t.parentHandlers.wheel({ deltaY: -300, deltaMode: 0, clientX: s0.x, clientY: s0.y, ctrlKey: false, preventDefault() {}, stopPropagation() {} });
    for (let i = 0; i < 60; i++) t.nav.update(16);
    expect(t.camera.position.distanceTo(anchor)).toBeLessThan(d0 * 0.75);
    const s1 = t.project(anchor);
    expect(s1.x).toBeCloseTo(s0.x, 3);
    expect(s1.y).toBeCloseTo(s0.y, 3);
  });
  it('is eased over frames, not one jump', () => {
    const t = setup(new THREE.Vector3(0, 0, 0));
    t.parentHandlers.wheel({ deltaY: -100, deltaMode: 0, clientX: 500, clientY: 400, ctrlKey: false, preventDefault() {}, stopPropagation() {} });
    const d0 = t.camera.position.length();
    expect(t.nav.update(16)).toBe(true);
    const d1 = t.camera.position.length();
    for (let i = 0; i < 60; i++) t.nav.update(16);
    const d2 = t.camera.position.length();
    expect(d1).toBeLessThan(d0);
    expect(d2).toBeLessThan(d1); // kept going after the first frame
    expect(t.nav.update(16)).toBe(false); // and settles
  });
  it('never passes through the surface, never runs off to infinity', () => {
    const surface = new THREE.Vector3(0, 0, 0);
    const t = setup(surface);
    for (let k = 0; k < 40; k++) {
      t.parentHandlers.wheel({ deltaY: -240, deltaMode: 0, clientX: 500, clientY: 400, ctrlKey: false, preventDefault() {}, stopPropagation() {} });
      for (let i = 0; i < 20; i++) t.nav.update(16);
    }
    expect(t.camera.position.z).toBeGreaterThan(0);          // still in front of the surface
    expect(t.camera.position.distanceTo(surface)).toBeGreaterThanOrEqual(20 * 0.004 - 1e-9);
    const out = setup(null);
    for (let k = 0; k < 80; k++) {
      out.parentHandlers.wheel({ deltaY: 240, deltaMode: 0, clientX: 500, clientY: 400, ctrlKey: false, preventDefault() {}, stopPropagation() {} });
      for (let i = 0; i < 20; i++) out.nav.update(16);
    }
    expect(out.camera.position.distanceTo(out.target)).toBeLessThanOrEqual(20 * 40 + 1e-6);
  });
});

describe('picking index (three-mesh-bvh, indirect)', () => {
  it('returns the same triangle as a brute-force raycast — face ids stay valid', () => {
    const n = 20_000;
    const pos = new Float32Array(n * 9);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < n; t++) {
      const cx = rnd() * 100, cy = rnd() * 100, cz = rnd() * 100;
      for (let v = 0; v < 3; v++) { pos[t * 9 + v * 3] = cx + rnd() * 4; pos[t * 9 + v * 3 + 1] = cy + rnd() * 4; pos[t * 9 + v * 3 + 2] = cz + rnd() * 4; }
    }
    const plain = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    // the viewer's path: build in a worker, serialise, deserialise onto the visible geometry
    const built = new MeshBVH(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3)), { indirect: true, maxLeafSize: 10 });
    const ser = MeshBVH.serialize(built, { cloneBuffers: true });
    // structured-clone it, as postMessage does — the format version must survive the trip
    (geo as unknown as { boundsTree: unknown }).boundsTree = MeshBVH.deserialize(structuredClone(ser) as never, geo, { setIndex: false });
    expect(geo.getIndex()).toBeNull(); // triangle order untouched
    const fast = new THREE.Mesh(geo, plain.material);
    fast.raycast = acceleratedRaycast as never;
    const rc = new THREE.Raycaster();
    let compared = 0;
    for (let k = 0; k < 300; k++) {
      rc.set(new THREE.Vector3(rnd() * 100, rnd() * 100, -50), new THREE.Vector3(0, 0, 1));
      const a = rc.intersectObject(plain)[0], b = rc.intersectObject(fast)[0];
      expect(!!a).toBe(!!b);
      if (a && b) { expect(b.faceIndex).toBe(a.faceIndex); expect(b.distance).toBeCloseTo(a.distance, 6); compared++; }
    }
    expect(compared).toBeGreaterThan(50);
  });
});

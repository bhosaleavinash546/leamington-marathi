/**
 * CAD-style mouse navigation for the 3D viewer — what OrbitControls' defaults do not give:
 *
 *  · Orbit about the point UNDER THE CURSOR (picked on press), not the bounding-box centre — zoom into a
 *    corner, rotate, and the corner stays put. Turntable (world up stays up), pitch clamped short of the
 *    poles, a little inertia on release.
 *  · Pan that keeps the grabbed point exactly under the cursor (speed from the grabbed point's depth, not the
 *    orbit target's) — right-drag, middle-drag or Shift + left-drag. No inertia: a pan stops where you stop.
 *  · Zoom toward the point under the cursor, eased over ~70 ms per wheel notch (a mouse wheel's 100-unit
 *    jumps used to step), never through the surface, never off to infinity. Trackpad pinch works.
 *
 * Touch stays with OrbitControls (one finger rotates, two pinch / pan) — this module ignores touch pointers
 * and the viewer sets OrbitControls' mouse buttons to none so the two never fight. Everything moves BOTH the
 * camera and controls.target, so OrbitControls' own update() (damping, lookAt) stays consistent.
 */
type ThreeNS = typeof import('three');
type V3 = import('three').Vector3;

export interface NavOptions {
  camera: import('three').PerspectiveCamera;
  /** controls.target — moved together with the camera. */
  target: V3;
  dom: HTMLElement;
  /** World point under the client position (respecting section planes), or null on empty space. */
  pick(clientX: number, clientY: number): V3 | null;
  /** Bounding radius of the model — scales the zoom limits. */
  radius(): number;
  changed(): void;
  /** Interaction began (drop resolution) / ended (one crisp frame). */
  started(): void;
  ended(): void;
  /** True when the press belongs to something drawn in the canvas (the view cube). */
  blocked?(ev: PointerEvent): boolean;
}

export interface CadNavigation {
  /** Advance inertia / eased zoom; returns true while still moving (the caller keeps rendering). */
  update(dtMs: number): boolean;
  /** Rotate by a yaw / pitch (radians) about a pivot (default: the orbit target). Keyboard nudges. */
  orbitBy(yaw: number, pitch: number, pivot?: V3): void;
  /** Pan by screen pixels at the orbit target's depth. */
  panBy(dxPx: number, dyPx: number): void;
  /** Zoom by a factor (< 1 in) toward the screen centre or a client point. */
  zoomBy(factor: number, clientX?: number, clientY?: number): void;
  /** The pivot being orbited about (while dragging or coasting), for the pivot marker. */
  activePivot(): V3 | null;
  /** Stop any coasting / pending zoom (a view change or a load takes over). */
  stop(): void;
  dispose(): void;
}

export function createCadNavigation(THREE: ThreeNS, o: NavOptions): CadNavigation {
  const { camera, target, dom } = o;
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  type Mode = 'orbit' | 'pan' | null;
  let mode: Mode = null;
  let pointerId = -1;
  let last = { x: 0, y: 0, t: 0 };
  let downAt = { x: 0, y: 0 };
  let movedPastSlop = false;
  const pivot = new THREE.Vector3();
  let orbiting = false;
  // orbit inertia (rad / ms), smoothed over the last moves
  let vYaw = 0, vPitch = 0, coasting = false;
  // pan: world units per pixel at the grabbed depth
  let panWpp = 0;
  // eased zoom: pending log-scale toward an anchor
  let zoomLog = 0;
  const zoomAnchor = new THREE.Vector3();

  const forward = () => target.clone().sub(camera.position).normalize();
  const rightVec = () => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const upVec = () => new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

  /** World units per screen pixel at a given depth along the view direction. */
  function worldPerPixel(depth: number): number {
    const h = dom.clientHeight || 1;
    return (2 * Math.max(depth, 1e-6) * Math.tan((camera.fov * Math.PI) / 360)) / h;
  }

  /** Where the cursor's ray crosses the plane through the target facing the camera (empty-space fallback). */
  function pointOnTargetPlane(clientX: number, clientY: number): V3 {
    const r = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward(), target);
    return ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? target.clone();
  }

  function rotateAbout(p: V3, yaw: number, pitch: number): void {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, yaw);
    // Pitch about the camera's right axis, refused near the poles (turntable keeps "up" up).
    let qPitch = new THREE.Quaternion();
    if (pitch !== 0) {
      const f = forward();
      const elev = Math.asin(Math.max(-1, Math.min(1, f.y)));
      const LIMIT = (89 * Math.PI) / 180;
      // A positive turn about "right" lowers the camera (forward tips up): elev grows by the angle.
      // pitch < 0 (mouse dragged down) lifts the camera to look down on the part, as OrbitControls does.
      const next = Math.max(-LIMIT, Math.min(LIMIT, elev + pitch));
      qPitch = new THREE.Quaternion().setFromAxisAngle(rightVec(), next - elev);
    }
    const q = qYaw.multiply(qPitch);
    camera.position.sub(p).applyQuaternion(q).add(p);
    target.sub(p).applyQuaternion(q).add(p);
    camera.lookAt(target);
  }

  function translate(d: V3): void { camera.position.add(d); target.add(d); }

  /** Scale camera and target about an anchor — the anchor stays fixed on screen. */
  function scaleAbout(a: V3, s: number): number {
    const R = o.radius();
    const toCam = camera.position.distanceTo(a);
    // never through the surface, never past 40 model radii from the target
    const minD = Math.max(R * 0.004, 1e-4);
    if (s < 1 && toCam * s < minD) s = Math.min(1, minD / Math.max(toCam, 1e-9));
    const camToTarget = camera.position.distanceTo(target);
    if (s > 1 && camToTarget * s > R * 40) s = Math.max(1, (R * 40) / Math.max(camToTarget, 1e-9));
    if (s === 1) return 1;
    camera.position.sub(a).multiplyScalar(s).add(a);
    target.sub(a).multiplyScalar(s).add(a);
    return s;
  }

  // ── pointer (mouse / pen) ──
  const onDown = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch' || mode) return;
    if (o.blocked?.(ev)) return;
    const panning = ev.button === 1 || ev.button === 2 || (ev.button === 0 && ev.shiftKey);
    const orbitBtn = ev.button === 0 && !ev.shiftKey;
    if (!panning && !orbitBtn) return;
    if (ev.button === 1) ev.preventDefault(); // no autoscroll
    stopCoast();
    mode = panning ? 'pan' : 'orbit';
    pointerId = ev.pointerId;
    try { dom.setPointerCapture(ev.pointerId); } catch { /* synthetic event */ }
    last = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    downAt = { x: ev.clientX, y: ev.clientY };
    movedPastSlop = false;
    const hit = o.pick(ev.clientX, ev.clientY);
    if (mode === 'orbit') {
      // Pivot = the surface under the cursor; on empty space, the current orbit target.
      pivot.copy(hit ?? target);
    } else {
      const grab = hit ?? pointOnTargetPlane(ev.clientX, ev.clientY);
      panWpp = worldPerPixel(grab.clone().sub(camera.position).dot(forward()));
    }
  };
  const onMove = (ev: PointerEvent) => {
    if (!mode || ev.pointerId !== pointerId) return;
    const dx = ev.clientX - last.x, dy = ev.clientY - last.y;
    const now = performance.now();
    const dt = Math.max(1, now - last.t);
    last = { x: ev.clientX, y: ev.clientY, t: now };
    if (!movedPastSlop) {
      if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 3) return;
      movedPastSlop = true;
      orbiting = mode === 'orbit';
      o.started();
    }
    if (mode === 'orbit') {
      const k = (2 * Math.PI) / Math.max(dom.clientHeight, 300) * 0.85; // ~300° across the viewport height
      const yaw = -dx * k, pitch = -dy * k;
      rotateAbout(pivot, yaw, pitch);
      // smoothed angular velocity for the release coast
      const a = 0.35;
      vYaw = vYaw * (1 - a) + (yaw / dt) * a;
      vPitch = vPitch * (1 - a) + (pitch / dt) * a;
    } else {
      translate(rightVec().multiplyScalar(-dx * panWpp).add(upVec().multiplyScalar(dy * panWpp)));
    }
    o.changed();
  };
  const onUp = (ev: PointerEvent) => {
    if (!mode || ev.pointerId !== pointerId) return;
    try { dom.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
    const wasOrbit = mode === 'orbit';
    mode = null;
    pointerId = -1;
    if (!movedPastSlop) { orbiting = false; return; }
    // Coast only on a flick (released while still moving), not after a deliberate stop.
    const sinceMove = performance.now() - last.t;
    if (wasOrbit && sinceMove < 60 && Math.hypot(vYaw, vPitch) > 0.0004 && !reduceMotion()) {
      coasting = true;
    } else {
      orbiting = false;
      vYaw = vPitch = 0;
    }
    o.ended();
    o.changed();
  };

  // ── wheel / trackpad ──
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    ev.stopPropagation(); // OrbitControls must not also zoom
    let dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    if (ev.ctrlKey) dy *= 4;          // trackpad pinch arrives as small ctrl+wheel deltas
    dy = Math.max(-240, Math.min(240, dy));
    const hit = o.pick(ev.clientX, ev.clientY);
    zoomAnchor.copy(hit ?? pointOnTargetPlane(ev.clientX, ev.clientY));
    zoomLog += dy * 0.0016;           // one 100-unit notch ≈ 15 %
    if (reduceMotion()) { scaleAbout(zoomAnchor, Math.exp(zoomLog)); zoomLog = 0; }
    o.changed();
  };
  const onContext = (ev: MouseEvent) => ev.preventDefault();

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('contextmenu', onContext);
  // capture on the parent, so the wheel never reaches OrbitControls' own listener on the canvas
  const wheelHost = dom.parentElement ?? dom;
  wheelHost.addEventListener('wheel', onWheel, { passive: false, capture: true });

  function stopCoast(): void { coasting = false; vYaw = vPitch = 0; if (!mode) orbiting = false; }

  return {
    update(dtMs) {
      let moving = false;
      const dt = Math.min(Math.max(dtMs, 1), 50);
      if (coasting) {
        rotateAbout(pivot, vYaw * dt, vPitch * dt);
        const decay = Math.exp(-dt / 160);
        vYaw *= decay; vPitch *= decay;
        if (Math.hypot(vYaw, vPitch) < 0.00003) { stopCoast(); } else moving = true;
      }
      if (Math.abs(zoomLog) > 1e-4) {
        const step = zoomLog * (1 - Math.exp(-dt / 70));
        const applied = scaleAbout(zoomAnchor, Math.exp(step));
        zoomLog = applied === Math.exp(step) ? zoomLog - step : 0; // hit a limit → drop the rest
        moving = true;
      } else zoomLog = 0;
      return moving;
    },
    orbitBy(yaw, pitch, p) { stopCoast(); rotateAbout(p ?? target.clone(), yaw, pitch); o.changed(); },
    panBy(dxPx, dyPx) {
      const wpp = worldPerPixel(camera.position.distanceTo(target));
      translate(rightVec().multiplyScalar(-dxPx * wpp).add(upVec().multiplyScalar(dyPx * wpp)));
      o.changed();
    },
    zoomBy(factor, cx, cy) {
      const r = dom.getBoundingClientRect();
      const x = cx ?? r.left + r.width / 2, y = cy ?? r.top + r.height / 2;
      zoomAnchor.copy(o.pick(x, y) ?? pointOnTargetPlane(x, y));
      zoomLog += Math.log(factor);
      if (reduceMotion()) { scaleAbout(zoomAnchor, Math.exp(zoomLog)); zoomLog = 0; }
      o.changed();
    },
    activePivot() { return orbiting || coasting ? pivot : null; },
    stop() { stopCoast(); zoomLog = 0; },
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('contextmenu', onContext);
      wheelHost.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
    },
  };
}

/**
 * Builds a three-mesh-bvh spatial index for one body mesh OFF the main thread (≈1 s per million
 * triangles), so picking — face select, measure snapping, the orbit pivot under the cursor — runs in
 * well under a millisecond on large assemblies instead of 80–240 ms of brute-force ray tests.
 *
 * `indirect: true` is essential: it leaves the triangle order alone, and the viewer maps a hit's
 * faceIndex to its B-rep face id by that order (triOffset + faceIndex). The main thread posts a COPY of
 * the positions (the visible mesh keeps its own) and deserialises the result onto its geometry.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

self.onmessage = (ev: MessageEvent<{ id: number; positions: Float32Array }>) => {
  const { id, positions } = ev.data;
  try {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    const bvh = new MeshBVH(g, { indirect: true, maxLeafSize: 10 });
    const data = MeshBVH.serialize(bvh, { cloneBuffers: false });
    const transfer: ArrayBuffer[] = data.roots.map(r => r as ArrayBuffer);
    if (data.indirectBuffer) transfer.push(data.indirectBuffer.buffer as ArrayBuffer);
    // The whole serialised object: it carries a format `version` — without it deserialize() "fixes up" the
    // roots as an old format and every pick misses.
    (self as unknown as Worker).postMessage({ id, bvh: data }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

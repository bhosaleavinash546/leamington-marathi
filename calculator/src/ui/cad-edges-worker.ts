/**
 * Edge-overlay worker — EdgesGeometry on a big mesh is O(n log n) over every
 * triangle pair and used to freeze the main thread for seconds on 500k+
 * triangle parts. The viewer posts the raw position buffer here; we hand back
 * the line-segment positions. Both directions use transferables (zero copy).
 *
 * Every message carries a job id and the reply echoes it: the viewer keeps one
 * listener and routes replies by id, so several bodies in flight never receive
 * each other's edges.
 */
import { BufferAttribute, BufferGeometry, EdgesGeometry } from 'three';

self.onmessage = (ev: MessageEvent<{ id?: number; positions: Float32Array; angleDeg: number }>) => {
  const id = ev.data.id;
  try {
    const { positions, angleDeg } = ev.data;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const edges = new EdgesGeometry(geometry, angleDeg);
    const out = (edges.getAttribute('position') as BufferAttribute).array as Float32Array;
    geometry.dispose();
    edges.dispose();
    (self as unknown as Worker).postMessage({ id, positions: out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

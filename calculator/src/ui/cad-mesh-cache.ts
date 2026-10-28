/**
 * One tessellation per uploaded file (CAD to COST 360 review, Oct 2026).
 *
 * The 3D viewer on the CAD screen, the rendered views the AI stage reads, and the compact viewer kept beside the result
 * each asked the server to mesh the same STEP — up to four 6 MB downloads per upload. They now share this cache, keyed
 * by the file's name, size and modification time. A failed request is not cached, so a retry asks again.
 *
 * Deliberately free of three.js: main.ts imports it statically, and the 3D engine stays a lazy chunk.
 */

/** The server's binary frame: [u32 headerLen][header JSON][raw STL][triFace u32 array][edges…]. */
export type MeshFrame = ArrayBuffer;

export class MeshFetchError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'MeshFetchError'; }
}

const MAX_ENTRIES = 4;
const cache = new Map<string, Promise<MeshFrame>>();

export const meshKey = (f: File): string => `${f.name}|${f.size}|${f.lastModified}`;

/** The tessellated frame for a STEP / IGES file, fetched once. */
export function fetchMeshFrame(file: File, headers: Record<string, string>, signal?: AbortSignal): Promise<MeshFrame> {
  const key = meshKey(file);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const fd = new FormData();
    fd.append('cadFile', file);
    const resp = await fetch('/api/cad/tessellate?meta=bin', { method: 'POST', headers, body: fd, signal });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })) as { error?: string };
      throw new MeshFetchError(err.error ?? `tessellation failed (${resp.status})`, resp.status);
    }
    return resp.arrayBuffer();
  })();
  cache.set(key, p);
  p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return p;
}

/** The raw STL inside a frame (what the rendered-views helper reads). */
export function stlFromFrame(frame: MeshFrame): ArrayBuffer {
  const dv = new DataView(frame);
  const headerLen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(frame, 4, headerLen))) as { stlBytes: number };
  return frame.slice(4 + headerLen, 4 + headerLen + header.stlBytes);
}

/** Test hook. */
export function clearMeshCache(): void { cache.clear(); }

/** A mesh error in words a user can act on — "No module named 'OCP'" is the missing CAD kernel, not a broken file. */
export function meshErrorText(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/OCP not available|No module named 'OCP'/i.test(m)) {
    return 'the STEP / IGES reader (the CAD kernel) is not installed on this computer. STL files still open — see the notice above the upload.';
  }
  return m;
}

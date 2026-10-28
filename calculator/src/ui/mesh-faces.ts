/**
 * An STL's recovered faces, from its DFM job (server/utils/mesh-features.ts → `/api/dfm/jobs/:id/mesh-faces`), in the
 * form the 3D viewer takes (`setMeshFaces`): the 1-based face id of every triangle in file order, and the faces. With
 * them a finding's "show me", face picking, face types and wall thickness work on a mesh as on a STEP.
 */
import type { FaceMeta } from './cad-viewer.js';

export interface MeshFacesWire {
  triangles: number;
  /** Uint32 face id per triangle, little-endian, base64. */
  triFaceB64: string;
  faces: Array<{ id: number; type: string; radiusMm: number | null; areaCm2: number; hole: boolean | null; thicknessMm: number | null }>;
}
export interface MeshFaces { triFace: Uint32Array; faces: FaceMeta[] }

/** Decode the wire form; null when it does not hold one id per triangle. */
export function decodeMeshFaces(w: MeshFacesWire): MeshFaces | null {
  if (!w || typeof w.triFaceB64 !== 'string' || !Array.isArray(w.faces)) return null;
  const bin = atob(w.triFaceB64);
  if (bin.length !== w.triangles * 4) return null;
  const triFace = new Uint32Array(w.triangles);
  for (let t = 0, o = 0; t < w.triangles; t++, o += 4) {
    triFace[t] = (bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8) | (bin.charCodeAt(o + 2) << 16) | (bin.charCodeAt(o + 3) << 24)) >>> 0;
  }
  return { triFace, faces: w.faces.map(f => ({ ...f })) };
}

export async function fetchMeshFaces(jobId: string, headers: HeadersInit): Promise<MeshFaces | null> {
  const r = await fetch(`/api/dfm/jobs/${encodeURIComponent(jobId)}/mesh-faces`, { headers });
  if (!r.ok) return null;
  return decodeMeshFaces(await r.json() as MeshFacesWire);
}

/**
 * STL mesh parsing for the CAD viewer.
 *
 * `parseSTLMesh` turns a raw STL ArrayBuffer (binary OR ASCII) into a flat
 * triangle-soup position array — 9 floats per triangle (three xyz vertices),
 * with normals discarded (the renderer recomputes them via
 * `computeVertexNormals`, per gotcha #2). This is the one export cad-viewer.ts
 * depends on; it was a helper in the source app's `cad-views` module.
 */

export interface STLMesh {
  /** xyz per vertex, laid out 9 floats per triangle (v0,v1,v2). */
  positions: Float32Array;
  /** triangle count === positions.length / 9. */
  triangles: number;
}

/** Binary STL layout: 80-byte header, uint32 triangle count, then 50 bytes per
 *  triangle (12 float32 = normal + 3 verts, + uint16 attribute byte count). */
function isBinarySTL(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 84) return false;
  const dv = new DataView(buf);
  const count = dv.getUint32(80, true);
  // The definitive test: does the declared triangle count match the file size
  // exactly? ASCII files (and truncated binaries) won't. More reliable than
  // sniffing the "solid" prefix, which some binary exporters also write.
  return buf.byteLength === 84 + count * 50;
}

function parseBinarySTL(buf: ArrayBuffer): STLMesh {
  const dv = new DataView(buf);
  const count = dv.getUint32(80, true);
  const positions = new Float32Array(count * 9);
  let o = 84; // skip header + count
  let p = 0;
  for (let t = 0; t < count; t++) {
    o += 12; // skip the 3 normal floats
    for (let v = 0; v < 9; v++) {
      positions[p++] = dv.getFloat32(o, true);
      o += 4;
    }
    o += 2; // skip attribute byte count
  }
  return { positions, triangles: count };
}

function parseAsciiSTL(text: string): STLMesh {
  // Pull every `vertex x y z` triple in document order; three consecutive
  // vertices form a triangle. Tolerant of arbitrary whitespace and exponents.
  const verts: number[] = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  // Drop any dangling vertices that don't complete a triangle (corrupt tail).
  const triangles = Math.floor(verts.length / 9);
  const positions = new Float32Array(triangles * 9);
  positions.set(verts.slice(0, triangles * 9));
  return { positions, triangles };
}

export function parseSTLMesh(buf: ArrayBuffer): STLMesh {
  if (isBinarySTL(buf)) return parseBinarySTL(buf);
  // Fall back to ASCII. Decode only the head first to confirm it looks like an
  // ASCII solid; otherwise treat as a (possibly odd-sized) binary best-effort.
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 256)));
  if (/^\s*solid/i.test(head) && /facet|vertex/i.test(head)) {
    return parseAsciiSTL(new TextDecoder().decode(new Uint8Array(buf)));
  }
  // Not a size-exact binary and not clearly ASCII — attempt binary anyway so a
  // slightly non-standard exporter still renders instead of hard-failing.
  if (buf.byteLength >= 84) return parseBinarySTL(buf);
  return { positions: new Float32Array(0), triangles: 0 };
}

/**
 * Client-side CAD file parser.
 * Extracts geometry metadata from STL, DXF, STEP files.
 * Images are passed through as base64 for Claude Vision.
 */

export interface CadGeometry {
  fileName: string;
  fileType: 'stl' | 'dxf' | 'step' | 'image' | 'pdf' | 'unknown';
  fileSize: number;
  isImage: boolean;
  base64Data?: string;
  mimeType?: string;

  // Geometry (STL / STEP)
  triangleCount?: number;
  estimatedVolume?: number;        // cm³
  estimatedSurfaceArea?: number;   // cm²
  boundingBox?: { x: number; y: number; z: number }; // mm
  estimatedMass?: number;          // kg (if density known)

  // Feature counts (DXF / STEP / heuristic)
  featureCounts?: {
    faces?: number;
    edges?: number;
    holes?: number;
    bends?: number;
    ribs?: number;
    threads?: number;
    pockets?: number;
  };

  // Text extraction (DXF / STEP)
  extractedDimensions?: string[];
  extractedText?: string[];
  extractedMaterial?: string;
  productName?: string;

  // Parsing warnings
  warnings?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ext(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─── STL parser ──────────────────────────────────────────────────────────────

function parseStl(buffer: ArrayBuffer): Partial<CadGeometry> {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 256));
  const isAscii = text.trimStart().startsWith('solid');

  if (isAscii) return parseAsciiStl(new TextDecoder().decode(buffer));
  return parseBinaryStl(buffer);
}

function parseBinaryStl(buffer: ArrayBuffer): Partial<CadGeometry> {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) return { warnings: ['STL binary too small'] };

  const triangleCount = view.getUint32(80, true);
  if (buffer.byteLength < 84 + triangleCount * 50) {
    return { triangleCount, warnings: ['STL binary truncated'] };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let surfaceArea = 0;
  let volume = 0;

  for (let i = 0; i < triangleCount; i++) {
    const base = 84 + i * 50;
    // Skip 12-byte normal, read 3 vertices
    const v = [];
    for (let j = 0; j < 3; j++) {
      const vBase = base + 12 + j * 12;
      const x = view.getFloat32(vBase, true);
      const y = view.getFloat32(vBase + 4, true);
      const z = view.getFloat32(vBase + 8, true);
      v.push({ x, y, z });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    // Cross product for area
    const ax = v[1].x - v[0].x, ay = v[1].y - v[0].y, az = v[1].z - v[0].z;
    const bx = v[2].x - v[0].x, by = v[2].y - v[0].y, bz = v[2].z - v[0].z;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    surfaceArea += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;

    // Signed volume contribution (divergence theorem)
    volume += (v[0].x * (v[1].y * v[2].z - v[2].y * v[1].z)
             + v[1].x * (v[2].y * v[0].z - v[0].y * v[2].z)
             + v[2].x * (v[0].y * v[1].z - v[1].y * v[0].z)) / 6;
  }

  return {
    triangleCount,
    estimatedVolume: Math.abs(volume) / 1000, // mm³ → cm³
    estimatedSurfaceArea: surfaceArea / 100,   // mm² → cm²
    boundingBox: {
      x: Math.round((maxX - minX) * 10) / 10,
      y: Math.round((maxY - minY) * 10) / 10,
      z: Math.round((maxZ - minZ) * 10) / 10,
    },
    featureCounts: { faces: triangleCount },
  };
}

function parseAsciiStl(text: string): Partial<CadGeometry> {
  const facetMatches = text.match(/\bfacet\b/g);
  const triangleCount = facetMatches ? facetMatches.length : 0;
  const vertexRegex = /vertex\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)/gi;
  let m;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  while ((m = vertexRegex.exec(text)) !== null) {
    const x = parseFloat(m[1]), y = parseFloat(m[2]), z = parseFloat(m[3]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }

  return {
    triangleCount,
    boundingBox: isFinite(maxX) ? {
      x: Math.round((maxX - minX) * 10) / 10,
      y: Math.round((maxY - minY) * 10) / 10,
      z: Math.round((maxZ - minZ) * 10) / 10,
    } : undefined,
    featureCounts: { faces: triangleCount },
  };
}

// ─── DXF parser ───────────────────────────────────────────────────────────────

function parseDxf(text: string): Partial<CadGeometry> {
  const counts: Record<string, number> = {};
  const dims: string[] = [];
  const texts: string[] = [];
  let material = '';

  // Count entity types
  const entityTypes = ['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE', 'LWPOLYLINE',
    'POLYLINE', 'INSERT', 'DIMENSION', 'HATCH', 'SOLID', '3DFACE', 'MESH'];
  for (const t of entityTypes) {
    const count = (text.match(new RegExp(`^${t}$`, 'gm')) || []).length;
    if (count > 0) counts[t] = count;
  }

  // Extract DIMENSION values (group code 42 = actual measurement)
  const dimRegex = /DIMENSION[\s\S]{0,500}?\n42\n([0-9.e+-]+)/g;
  let dm;
  while ((dm = dimRegex.exec(text)) !== null) {
    dims.push(`${parseFloat(dm[1]).toFixed(2)} mm`);
    if (dims.length >= 20) break;
  }

  // Extract TEXT / MTEXT content
  const textRegex = /(?:^TEXT$|^MTEXT$)[\s\S]{0,200}?\n1\n([^\n]{1,80})/gm;
  let tm;
  while ((tm = textRegex.exec(text)) !== null) {
    const val = tm[1].trim();
    if (val && !val.startsWith('{\\')) {
      texts.push(val);
      // Try to detect material spec
      if (/\b(steel|aluminium|aluminum|titanium|stainless|brass|copper|cast iron|AISI|EN10|DIN|A380|A356|PA66|PEEK|PP|ABS|nylon|CFRP|GFRP)\b/i.test(val)) {
        material = val;
      }
    }
    if (texts.length >= 30) break;
  }

  // Infer feature counts heuristically
  const holes = (counts['CIRCLE'] || 0) + (counts['ARC'] || 0) / 2;
  const bends = Math.round((counts['LINE'] || 0) / 20);

  return {
    featureCounts: {
      holes: Math.round(holes),
      bends,
      faces: counts['3DFACE'] || 0,
      edges: counts['LINE'] || 0,
    },
    extractedDimensions: dims.slice(0, 15),
    extractedText: texts.slice(0, 20).filter(Boolean),
    extractedMaterial: material || undefined,
  };
}

// ─── STEP parser ──────────────────────────────────────────────────────────────

function parseStep(text: string): Partial<CadGeometry> {
  const productMatch = text.match(/PRODUCT\('([^']{1,80})'/i);
  const productName = productMatch ? productMatch[1] : undefined;

  const materialMatch = text.match(/MATERIAL\('([^']{1,60})'/i);
  const extractedMaterial = materialMatch ? materialMatch[1] : undefined;

  const counts: Record<string, number> = {};
  const stepTypes = ['ADVANCED_FACE', 'EDGE_CURVE', 'VERTEX_POINT',
    'CYLINDRICAL_SURFACE', 'PLANE', 'CONICAL_SURFACE', 'TOROIDAL_SURFACE',
    'SPHERICAL_SURFACE', 'B_SPLINE_SURFACE', 'CIRCLE', 'LINE'];
  for (const t of stepTypes) {
    const c = (text.match(new RegExp(`#\\d+=\\s*${t}\\(`, 'g')) || []).length;
    if (c > 0) counts[t] = c;
  }

  const faces = counts['ADVANCED_FACE'] || 0;
  const cylinders = counts['CYLINDRICAL_SURFACE'] || 0;
  const edges = counts['EDGE_CURVE'] || 0;

  return {
    productName,
    extractedMaterial,
    featureCounts: {
      faces,
      edges,
      holes: cylinders, // cylinders often correspond to holes
    },
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function parseCadFile(file: File): Promise<CadGeometry> {
  const extension = ext(file.name);
  const fileName = file.name;
  const fileSize = file.size;

  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  const PDF_EXTS = ['pdf'];

  // Images & PDFs → base64 for Claude Vision
  if (IMAGE_EXTS.includes(extension) || PDF_EXTS.includes(extension)) {
    const buffer = await file.arrayBuffer();
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
    };
    return {
      fileName, fileType: PDF_EXTS.includes(extension) ? 'pdf' : 'image',
      fileSize, isImage: true,
      base64Data: toBase64(buffer),
      mimeType: mimeMap[extension] || 'image/png',
    };
  }

  // STL
  if (['stl'].includes(extension)) {
    const buffer = await file.arrayBuffer();
    const geo = parseStl(buffer);
    return { fileName, fileType: 'stl', fileSize, isImage: false, ...geo };
  }

  // DXF
  if (['dxf', 'dwg'].includes(extension)) {
    const text = await file.text();
    const geo = parseDxf(text);
    return { fileName, fileType: 'dxf', fileSize, isImage: false, ...geo };
  }

  // STEP / STP
  if (['step', 'stp'].includes(extension)) {
    const text = await file.text();
    const geo = parseStep(text);
    return { fileName, fileType: 'step', fileSize, isImage: false, ...geo };
  }

  return { fileName, fileType: 'unknown', fileSize, isImage: false,
    warnings: [`Unsupported format: .${extension}`] };
}

/** Estimate steel mass from volume */
export function estimateMass(volumeCm3: number, density = 7.85): number {
  return parseFloat((volumeCm3 * density / 1000).toFixed(3)); // kg
}

/** Human-readable file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Develop the flat blank of a sheet part from its CAD file — the one entry
 * point the CAD route, the real-parts baseline and any bulk run share, so a
 * part is unfolded the same way wherever it is costed.
 *
 * Runs only when the kernel measured the part as sheet with a bend-measured
 * gauge (bend pairs, not 2·V/S), and only for B-rep formats: an STL has no
 * faces to classify. A supplied FASTBLANK DXF always wins — the caller checks
 * that before calling this. Failure is soft: the costing carries on with the
 * bounding-box estimate and the reason is returned for the response.
 */
import { createHash } from 'node:crypto';
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';
import { extractSkinMesh } from '../utils/geometry-bridge.js';
import { developBlank, blankToDxf } from '../utils/blank-unfold.js';
import { putBlank, putBlankDxf } from '../utils/geometry-store.js';

export type DevelopedBlankRecord = NonNullable<OCCTGeometry['blank']>;

export interface DevelopBlankResult {
  blank: DevelopedBlankRecord;
  dxf: string;
  /** Wall-clock of mesh export + unfold, ms. */
  elapsedMs: number;
}

const BREP_EXT = /\.(stp|step|igs|iges)$/i;

/** Null when the part is not a candidate; `{ error }` when the unfold was tried and failed. */
export async function developBlankFromCad(
  buffer: Buffer,
  filename: string,
  geo: OCCTGeometry,
  opts: { timeoutMs?: number } = {},
): Promise<DevelopBlankResult | { error: string } | null> {
  if (geo.status !== 'success' || !BREP_EXT.test(filename)) return null;
  const sm = geo.sheetMetal;
  if (!sm || sm.thicknessSource !== 'bend-pairs' || (sm.bendCount ?? 0) === 0) return null;

  const t0 = Date.now();
  const mesh = await extractSkinMesh(buffer, filename, { timeoutMs: opts.timeoutMs ?? 180_000 });
  if (mesh.status !== 'success') return { error: mesh.error };
  let developed;
  try {
    developed = developBlank(mesh.mesh);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const dxf = blankToDxf(developed.skins[0], filename.replace(/\.[^.]+$/, ''));
  const blankHash = createHash('sha256').update(dxf).digest('hex');
  const blank: DevelopedBlankRecord = {
    grossAreaMm2: developed.grossAreaMm2,
    netAreaMm2: developed.netAreaMm2,
    outerPerimeterMm: developed.outerPerimeterMm,
    holePerimeterMm: developed.holePerimeterMm,
    holeCount: developed.holeCount,
    boundingRectMm: developed.boundingRectMm,
    rectangleFill: Math.round(developed.rectangleFill * 1000) / 1000,
    source: developed.source,
    developedFrom: 'solid',
    developable: developed.developable,
    maxStrainPct: Math.round(developed.maxStrainPct * 10) / 10,
    blankHash,
    ...(developed.warnings.length ? { warnings: developed.warnings } : {}),
  };
  putBlank(blankHash, blank);
  putBlankDxf(blankHash, dxf);
  return { blank, dxf, elapsedMs: Date.now() - t0 };
}

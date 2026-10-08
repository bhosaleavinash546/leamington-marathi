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
import { enclosedShell, cavityShell } from '../../src/engine/cost-input-rules/derive/hollow.js';
import { createHash } from 'node:crypto';
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';
import { extractSkinMesh } from '../utils/geometry-bridge.js';
import { developBlank, blankToDxf } from '../utils/blank-unfold.js';
import { putBlank, putBlankDxf } from '../utils/geometry-store.js';
import { decimateOutline } from '../../src/engine/nesting.js';

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
  /** unitScale: the inch answer (25.4) the geometry was measured at — the skins must be read at it too. */
  opts: { timeoutMs?: number; unitScale?: number } = {},
): Promise<DevelopBlankResult | { error: string } | null> {
  if (geo.status !== 'success' || !BREP_EXT.test(filename)) return null;
  const sm = geo.sheetMetal;
  // A bend-measured gauge, or — the sheet-metal review — a thin shell whose
  // gauge came from 2·V/S: a BIW panel's 15–50 mm radii are beyond the bend
  // detector's max(8 mm, 6t), so a 1.1 m drawn inner panel registered no bends,
  // was never unfolded, and was costed as a flat part from its bounding box.
  const bendGauge = sm?.thicknessSource === 'bend-pairs' && (sm.bendCount ?? 0) > 0;
  const thinShell = sm?.thicknessSource === 'bulk-wall' && (sm.thicknessMm ?? 0) > 0 && (sm.thicknessMm ?? 0) <= 4
    && (geo.fillRatio ?? 1) < 0.1 && geo.wallThickness?.method === 'volume_surface_shell';
  if (!sm || !(bendGauge || thinShell)) return null;
  // A closed container is never a pressing: the real fuel tank's 349 filleted "bends" sent its two skins through the
  // unfold for 296 s, and the page timed out before the costing came back (uploaded-parts review, Oct 2026).
  if (enclosedShell(geo) || cavityShell(geo)) return null;

  const t0 = Date.now();
  const mesh = await extractSkinMesh(buffer, filename, { timeoutMs: opts.timeoutMs ?? 180_000, unitScale: opts.unitScale });
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
    outline: decimateOutline(developed.skins[0].outline),
    ...(developed.forming ? { forming: {
      method: 'one-step inverse' as const,
      nValue: developed.forming.nValue,
      blankAreaUnfoldMm2: developed.forming.blankAreaUnfoldMm2,
      blankAreaSolvedMm2: developed.forming.blankAreaSolvedMm2,
      thinningP95Pct: Math.round(developed.forming.strain.thinningP95Pct * 10) / 10,
      maxThinningPct: Math.round(developed.forming.strain.maxThinningPct * 10) / 10,
      maxThickeningPct: Math.round(developed.forming.strain.maxThickeningPct * 10) / 10,
      strainPoints: developed.forming.strain.strainPoints,
    } } : {}),
    ...(developed.warnings.length ? { warnings: developed.warnings } : {}),
  };
  putBlank(blankHash, blank);
  putBlankDxf(blankHash, dxf);
  return { blank, dxf, elapsedMs: Date.now() - t0 };
}

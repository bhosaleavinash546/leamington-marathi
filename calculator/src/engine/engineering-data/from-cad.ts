/**
 * The 3D CAD measurement as engineering parameters (offline 2D drawing intelligence, Layer 3).
 *
 * A READ-ONLY mapping of what the geometry kernel already measured (`OCCTGeometry`) and what the CAD file says about
 * itself (`geo.cadMetadata`) onto the parameter dictionary, so a drawing value can be compared with it. Nothing is
 * re-measured and nothing is derived that the engine does not already derive:
 *
 *  - measured values are `kind: 'extracted'`, `method: 'kernel'`;
 *  - what the file declares (a material designation, product names) is `method: 'cad-metadata'`;
 *  - a tapped hole is `kind: 'inferred'` — the engine's own `tappedThread` rule (a hole at a metric coarse tapping-drill
 *    size, at least 1.5 Ø deep), stated as an inference;
 *  - the module of a gear is `kind: 'interpreted'` — the kernel's tip Ø ÷ (z + 2), with its own basis line.
 *
 * NOT mapped, on purpose:
 *  - mass: the kernel measures a volume, not a mass. `geo.weights` is that volume × six assumed densities, so there is
 *    no measured mass to state until the material is known (the engine weighs it then);
 *  - helix angle: the kernel never derives it (a STEP flank cannot be trusted to settle it);
 *  - the kernel's own cost or cycle-time estimates: not engineering facts of the part.
 *
 * Pure function; no cost formula.
 */
import type { OCCTGeometry } from '../ai-analysis.js';
import { tappedThread, type FeatureRow } from '../feature-ops.js';
import type { EngineeringParameter } from './model.js';
import type { HoleValue } from './values.js';

/** The id of the CAD hole row at feature-table index `i` — the `appliesTo.featureId` a matched drawing callout takes. */
export const cadHoleFeatureId = (i: number): string => `cad-hole-${i}`;

const round = (n: number, dp: number): number => { const f = 10 ** dp; return Math.round(n * f) / f; };

/** Everything the CAD measurement says, as dictionary parameters. An unmeasured field yields no parameter (never 0). */
export function cadToParameters(geo: OCCTGeometry, filename: string): EngineeringParameter[] {
  const out: EngineeringParameter[] = [];
  if (!geo || geo.status !== 'success') return out;
  const base = { source: 'cad' as const, sourceFile: filename, status: 'extracted' as const };
  const kernel = (name: string, value: EngineeringParameter['value'], unit?: string, note?: string, id = `cad:${name}`): EngineeringParameter =>
    ({ id, name, value, ...(unit ? { unit } : {}), ...base, method: 'kernel', kind: 'extracted', ...(note ? { note } : {}) });

  // ── Whole-part geometry ──
  if (geo.volume && geo.volume.cm3 > 0) {
    out.push(kernel('part.volume', geo.volume.cm3, 'cm3',
      geo.volumeConfidence === 'mesh' ? 'integrated over a mesh (STL), not the exact B-rep' : undefined));
  }
  if (geo.surfaceArea && geo.surfaceArea.cm2 > 0) out.push(kernel('part.surfaceArea', geo.surfaceArea.cm2, 'cm2'));
  const bb = geo.boundingBox;
  if (bb && bb.xMm > 0 && bb.yMm > 0 && bb.zMm > 0) {
    const [l, w, h] = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
    out.push(kernel('part.envelope', { lengthMm: l, widthMm: w, heightMm: h, xMm: bb.xMm, yMm: bb.yMm, zMm: bb.zMm }, 'mm',
      'the file-axis bounding box; length ≥ width ≥ height'));
  }
  const wt = geo.wallThickness;
  if (wt && wt.meanMm > 0) {
    out.push(kernel('part.wallThickness', wt.meanMm, 'mm',
      `mean of ${wt.sampleCount} samples, ${wt.method.replace(/_/g, ' ')} (min ${round(wt.minMm, 2)} mm, max ${round(wt.maxMm, 2)} mm)`));
  }
  const sm = geo.sheetMetal;
  // Only a gauge measured between a bend's two faces is a stock thickness. The kernel's other figure ('bulk-wall',
  // 2·V/S) is reported on every solid — 15 mm on a cast stub axle — and is not a sheet gauge.
  if (sm && sm.thicknessMm > 0 && sm.thicknessSource === 'bend-pairs') {
    out.push(kernel('material.stockThickness', sm.thicknessMm, 'mm',
      `the radius step between a bend's inner and outer face, ${sm.gaugeSamples ?? '?'} bend pair(s) agreeing`));
  }

  // ── Holes: one parameter per feature-table row, the row's own count / through / depth ──
  const rows = (geo.featureTable ?? []) as FeatureRow[];
  let holes = 0; let threads = 0;
  rows.forEach((r, i) => {
    if (r.kind !== 'hole' || !(r.diaMm > 0)) return;
    holes += r.count;
    const value: HoleValue = {
      diameterMm: r.diaMm, count: r.count, through: r.through,
      ...(r.depthMm > 0 ? { depthMm: r.depthMm } : {}),
    };
    const featureId = cadHoleFeatureId(i);
    const holeId = `cad:hole.diameter:${i}`;
    out.push({
      id: holeId, name: 'hole.diameter', value: value as unknown as Record<string, unknown>, unit: 'mm', ...base, method: 'kernel', kind: 'extracted',
      appliesTo: { featureId, ...(r.faceIds?.length ? { faceIds: r.faceIds } : {}),
        description: `${r.count} × Ø${round(r.diaMm, 3)} ${r.through === true ? 'through' : r.through === false ? 'blind' : 'hole'}${r.depthMm > 0 ? `, ${round(r.depthMm, 2)} mm deep` : ''}` },
    });
    const thread = tappedThread(r);
    if (thread) {
      threads += r.count;
      out.push({
        id: `cad:thread:${i}`, name: 'thread', value: { designation: thread, nominalMm: Number(thread.slice(1)), count: r.count, ...(r.depthMm > 0 ? { depthMm: r.depthMm } : {}) },
        source: 'derived', sourceFile: filename, method: 'rule', kind: 'inferred', status: 'extracted',
        appliesTo: { featureId, ...(r.faceIds?.length ? { faceIds: r.faceIds } : {}) },
        derivedFrom: [holeId],
        note: `inferred, not modelled: Ø${round(r.diaMm, 2)} is the ${thread} coarse tapping-drill size and the hole is at least 1.5 Ø deep `
          + '(the costing\'s own tapped-hole rule, feature-ops.ts). The CAD model carries no thread.',
      });
    }
  });
  if (geo.featureTable) {
    out.push(kernel('feature.count.holes', holes, undefined, 'the feature table\'s hole rows, summed'));
    if (threads > 0) {
      out.push({
        id: 'cad:feature.count.threads', name: 'feature.count.threads', value: threads, source: 'derived', sourceFile: filename,
        method: 'rule', kind: 'inferred', status: 'extracted',
        note: 'inferred from tapping-drill sizes (see each thread row); a thread modelled at its nominal Ø is not counted',
      });
    }
  }

  // ── Gear metrology (the kernel's tip-circle count) ──
  const g = geo.gear;
  if (g && g.likelyGear && g.teeth >= 7) {
    out.push(kernel('gear.teeth', g.teeth, undefined, g.teethBasis));
    if (g.derivedNormalModuleMm > 0) {
      out.push({ ...kernel('gear.module', g.derivedNormalModuleMm, 'mm', g.moduleBasis), kind: 'interpreted' });
    }
    if (g.faceWidthMm > 0) out.push(kernel('gear.faceWidth', g.faceWidthMm, 'mm'));
  }

  // ── What the file says about itself ──
  const meta = geo.cadMetadata;
  (meta?.materialDesignations ?? []).forEach((text, i) => {
    if (!text?.trim()) return;
    out.push({
      id: `cad:material.designation:${i}`, name: 'material.designation', value: text.trim(), rawText: text, ...base,
      method: 'cad-metadata', kind: 'extracted', note: 'the material property declared in the CAD file',
    });
  });
  const names = (meta?.productNames ?? []).filter(n => n?.trim());
  if (names.length) {
    out.push({
      id: 'cad:title.partName', name: 'title.partName', value: names[0].trim(), rawText: names[0], ...base,
      method: 'cad-metadata', kind: 'extracted',
      note: names.length > 1 ? `the first STEP product name; the file also names: ${names.slice(1).join('; ')}` : 'the STEP product name',
    });
  }
  return out;
}

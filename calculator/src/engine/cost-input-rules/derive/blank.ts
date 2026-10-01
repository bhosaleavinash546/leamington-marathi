/**
 * The flat blank of a sheet part, from the B-rep alone — no unfolding.
 *
 * A sheet solid's surface is two skins plus the edge band, and the edge band
 * is the cut length times the gauge. So with the gauge t, the volume V and the
 * surface area S the kernel already measures:
 *
 *     net blank area   A = V / t                 the metal left in the part
 *     cut length       P = (S − 2A) / t          outline + every hole edge
 *     gross blank area = A + Σ hole areas         the metal bought
 *
 * Both identities are exact for a developable (bent) part and were checked on
 * the real Seat Locking Bracket STEP against the ARAP unfold prototype: 444.2
 * against 444 cm² net, 1,940 against 1,939 mm cut
 * (docs/sheet-metal/blank-development-research-2026-10.md, §3.1).
 *
 * The cut length is only as good as the gauge. With t = 2·V/S — the bulk-wall
 * read — S − 2V/t is zero by construction, so P collapses: a 3% gauge error on
 * the bracket turns 1,940 mm into 154 mm. The cut length is therefore trusted
 * only when the kernel measured the gauge between coaxial bend faces
 * (`thicknessSource: 'bend-pairs'`), and even then it must be at least the
 * perimeter of the smallest outline that could enclose the part. The net area
 * divides by t once and is reported from either gauge.
 *
 * What this does NOT give is the outline or the strip rectangle; those need
 * the unfold (phase 2) or the FASTBLANK DXF. It gives the three quantities the
 * press, the material and the report need, and a check on the rectangle guess.
 */
import type { RuleContext } from '../types.js';
import type { FeatureRow } from '../../feature-ops.js';

export interface AnalyticBlank {
  /** The metal left in the part: V ÷ t. */
  netAreaMm2: number;
  /** The metal bought: net + the pierced holes. */
  grossAreaMm2: number;
  holeAreaMm2: number;
  holeCount: number;
  /** Outline + hole edge length — null when the gauge cannot support it. */
  cutLengthMm: number | null;
  gaugeMm: number;
  gaugeSource: 'bend-pairs' | 'bulk-wall';
  basis: string;
}

/**
 * Blank quantities from the measured solid, or null when the part is not a
 * sheet (no bends and no sheet-like gauge) or the kernel measured no volume.
 */
export function analyticBlank(ctx: RuleContext): AnalyticBlank | null {
  const sm = ctx.geo.sheetMetal;
  const t = sm?.thicknessMm ?? 0;
  const volMm3 = ctx.geo.volume?.mm3 ?? (ctx.geo.volume?.cm3 ? ctx.geo.volume.cm3 * 1000 : 0);
  const surfMm2 = ctx.geo.surfaceArea?.mm2 ?? (ctx.geo.surfaceArea?.cm2 ? ctx.geo.surfaceArea.cm2 * 100 : 0);
  if (!sm || t <= 0 || t > 8 || volMm3 <= 0 || surfMm2 <= 0) return null;
  if ((sm.bendCount ?? 0) === 0) return null;   // the identities need a sheet; a flat plate has no bends to prove it

  const source: 'bend-pairs' | 'bulk-wall' = sm.thicknessSource === 'bend-pairs' ? 'bend-pairs' : 'bulk-wall';
  const net = volMm3 / t;
  const holes = ((ctx.geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole' && r.through !== false);
  const holeCount = holes.reduce((n, r) => n + r.count, 0);
  const holeArea = holes.reduce((a, r) => a + r.count * Math.PI * (r.diaMm / 2) ** 2, 0);

  let cut: number | null = null;
  const bb = ctx.geo.boundingBox;
  const longest = bb ? Math.max(bb.xMm, bb.yMm, bb.zMm) : 0;
  if (source === 'bend-pairs') {
    const p = (surfMm2 - 2 * net) / t;
    // The outline of any blank is at least twice the part's longest dimension.
    if (p > 0 && (longest <= 0 || p >= 2 * longest)) cut = p;
  }

  const cm2 = (mm2: number) => (mm2 / 100).toFixed(0);
  const basis = `${cm2(net)} cm² of metal in the part (${(volMm3 / 1000).toFixed(1)} cm³ ÷ ${t.toFixed(2)} mm gauge`
    + (source === 'bend-pairs' ? ` measured between ${sm.gaugeSamples ?? 0} bend pair(s))` : ', bulk-wall gauge)')
    + (holeCount > 0 ? ` + ${cm2(holeArea)} cm² in ${holeCount} pierced hole(s) = ${cm2(net + holeArea)} cm² bought` : '; no pierced holes listed')
    + (cut != null
      ? `; ${Math.round(cut)} mm of cut edge from (surface − 2 × blank) ÷ gauge`
      : source === 'bend-pairs'
        ? '; cut length not derivable — the surface identity did not hold on this part'
        : '; cut length needs a bend-measured gauge, which this part did not give');

  return {
    netAreaMm2: Math.round(net), grossAreaMm2: Math.round(net + holeArea),
    holeAreaMm2: Math.round(holeArea), holeCount,
    cutLengthMm: cut == null ? null : Math.round(cut),
    gaugeMm: t, gaugeSource: source, basis,
  };
}

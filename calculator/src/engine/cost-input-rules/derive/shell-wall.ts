/**
 * The wall of a hollow shell — a blow moulding, a rotomoulding, a tank.
 *
 * The kernel's ray-cast wall fires rays inward from the skin and reads the first
 * exit. On a hollow body many rays cross the empty cavity and read the far wall
 * too: the modelled 2.5 mm washer reservoir reads a **25.3 mm** mean wall over 7
 * samples, and a thin tube gives no reading at all. Cooling goes as wall², so the
 * ray mean put a 2.5 mm bottle on a 37-minute cycle — and, read as a 25 mm solid,
 * the part failed the hollow check and was asked "is it really blow moulded?".
 *
 * A shell of area A and wall t has V = A·t and S ≈ 2A, so **2·V/S is the
 * area-weighted mean wall**, exact for a uniform wall and measured, not sampled.
 * It is the wall a programmed EBM parison and a rotomould's powder charge set.
 * The ray mean is used only when the solid's volume or area is missing.
 */
import type { OCCTGeometry } from '../../ai-analysis.js';

export interface ShellWall {
  mm: number;
  source: 'two-v-over-s' | 'ray-cast';
  basis: string;
}

export function shellWallMm(geo: OCCTGeometry): ShellWall | null {
  const v = geo.volume?.mm3 ?? 0;
  const s = geo.surfaceArea?.mm2 ?? 0;
  const ray = geo.wallThickness?.meanMm ?? null;
  if (v > 0 && s > 0) {
    const mm = 2 * v / s;
    return {
      mm, source: 'two-v-over-s',
      basis: `2·V/S = 2 × ${(v / 1000).toFixed(1)} cm³ ÷ ${(s / 100).toFixed(0)} cm² = ${mm.toFixed(2)} mm, `
        + 'the area-mean wall of a shell'
        + (ray == null ? ' (the ray-cast found no wall)'
          : Math.abs(ray - mm) > 0.05 * mm ? ` (the ray-cast mean reads ${ray.toFixed(2)} mm: rays cross the cavity and read pinch welds)`
          : ''),
    };
  }
  if (ray) {
    return {
      mm: ray, source: 'ray-cast',
      basis: `ray-cast mean wall over ${geo.wallThickness?.sampleCount ?? 0} samples (no volume / area to check it against)`,
    };
  }
  return null;
}

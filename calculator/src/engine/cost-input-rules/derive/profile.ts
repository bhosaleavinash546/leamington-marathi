/**
 * A constant-section profile — extruded and cut to length.
 *
 * Shared by rubber (the door seal) and polymer extrusion (tube, pipe, profile),
 * and by the routing question, which must see a profile BEFORE the hollow test:
 * a tube's centre is in its bore and every enclosure ray meets its wall, so a
 * pipe read as a closed tank (extrusion build, Oct 2026).
 */
import { fmt, type RuleContext } from '../types.js';

/**
 * An extruded profile, measured: long against its section, and its volume is
 * its cross-section (the kernel's silhouette along the length) times the length
 * — a constant section. Door, glass-run and boot seals, hoses: the commonest
 * rubber spend on a vehicle, and the route the rules never chose (rubber
 * review, Oct 2026 — a 1 m door seal was "injection moulded" with a 25-minute
 * cure).
 */
export function extrusionProfile(ctx: RuleContext): { lengthMm: number; sectionCm2: number; basis: string } | null {
  const bb = ctx.geo.boundingBox; const p = ctx.geo.projectedArea; const v = ctx.geo.volume?.cm3;
  if (!bb || !p || !v) return null;
  const dims: Array<[number, number | undefined]> = [[bb.xMm, p.xMm2], [bb.yMm, p.yMm2], [bb.zMm, p.zMm2]];
  dims.sort((x, y) => y[0] - x[0]);
  const [[L, sil], [d1]] = dims;
  if (!sil || L < 8 * d1) return null;
  const sectionCm2 = sil / 100;
  const fill = v / (sectionCm2 * L / 10);
  if (fill < 0.9 || fill > 1.1) return null;
  return { lengthMm: L, sectionCm2: Math.round(sectionCm2 * 100) / 100,
    basis: `${fmt(L, 0)} mm long, ${fmt(sectionCm2, 2)} cm² section; volume = section × length to ${(Math.abs(1 - fill) * 100).toFixed(0)}% — a constant section` };
}


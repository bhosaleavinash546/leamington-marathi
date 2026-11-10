/**
 * Precedence and comparison tolerances — DATA (offline 2D drawing intelligence, Layer 3).
 *
 * When two sources state a different value for one parameter, the difference is ALWAYS a conflict the engineer
 * resolves. Precedence does one thing only: it names which side the review screen should SUGGEST. It never picks.
 *
 * The default order is the agreed plan's (docs/plans/offline-2d-drawing-intelligence-plan-2026-11.md §7):
 *   geometry (volume, area, envelope, features)                    → the CAD model
 *   tolerances, finish, heat treatment, coating, quality, notes    → the drawing
 *   material                                                       → drawing > the material the CAD file declares > a name
 * These are engineering judgement about which document is the authority for which fact: the model is the nominal
 * shape; the drawing is the released specification. Pass your own table to `consolidate` to change it.
 */
import type { EngineeringParameter } from './model.js';
import { parameterDef, type ParameterDef } from './dictionary.js';

/** Where a value came from, as precedence sees it. `name` = worked out from a file or product name. */
export type SourceRank = 'manual' | 'drawing' | 'cad' | 'cad-metadata' | 'name';

export interface PrecedenceRule {
  /** A parameter name ("material.designation"), a prefix ("gear.*"), or a dictionary group ("group:geometry"). */
  match: string;
  /** Sources, most authoritative first. A source not listed ranks after every listed one. */
  order: SourceRank[];
  why: string;
}

const DRAWING_FIRST: SourceRank[] = ['drawing', 'cad-metadata', 'cad', 'name'];
const CAD_FIRST: SourceRank[] = ['cad', 'drawing', 'cad-metadata', 'name'];

/** First matching rule wins: exact name, then prefix, then group. */
export const DEFAULT_PRECEDENCE: readonly PrecedenceRule[] = [
  { match: 'material.stockThickness', order: CAD_FIRST, why: 'a gauge measured between a bend\'s two faces is the modelled sheet; the drawing states the nominal' },
  { match: 'group:material', order: ['drawing', 'cad-metadata', 'name', 'cad'], why: 'the drawing is the released material specification; a CAD material property is the designer\'s setting; a name is a hint' },
  { match: 'group:geometry', order: CAD_FIRST, why: 'volume, area and envelope are measured on the 3D model' },
  { match: 'group:feature', order: CAD_FIRST, why: 'feature sizes and counts are measured on the 3D model; the drawing adds their tolerances' },
  { match: 'gear.teeth', order: CAD_FIRST, why: 'teeth are counted on the 3D model' },
  { match: 'gear.faceWidth', order: CAD_FIRST, why: 'the face width is measured on the 3D model' },
  { match: 'group:gear', order: DRAWING_FIRST, why: 'the gear data table on the drawing is the specification (module, helix, quality)' },
  { match: 'group:tolerance', order: DRAWING_FIRST, why: 'tolerances are drawing annotations' },
  { match: 'group:finish', order: DRAWING_FIRST, why: 'finish and coating are drawing notes' },
  { match: 'group:heat-treatment', order: DRAWING_FIRST, why: 'heat treatment is a drawing note' },
  { match: 'group:joining', order: DRAWING_FIRST, why: 'welding is specified on the drawing' },
  { match: 'group:quality', order: DRAWING_FIRST, why: 'quality requirements are drawing notes' },
  { match: 'group:note', order: DRAWING_FIRST, why: 'notes are on the drawing' },
  { match: 'group:identity', order: DRAWING_FIRST, why: 'the title block is the released identity' },
];

/** The rule for a parameter name, from a table (the default when none is given). */
export function precedenceFor(name: string, table: readonly PrecedenceRule[] = DEFAULT_PRECEDENCE): PrecedenceRule | null {
  const def: ParameterDef | undefined = parameterDef(name);
  return table.find(r => r.match === name)
    ?? table.find(r => r.match.endsWith('.*') && name.startsWith(r.match.slice(0, -1)))
    ?? (def ? table.find(r => r.match === `group:${def.group}`) : undefined)
    ?? null;
}

/** How precedence classes a parameter. A derived value ranks as what it was derived from (`origin`). */
export function sourceRank(p: EngineeringParameter, origin?: EngineeringParameter): SourceRank {
  if (p.source === 'manual') return 'manual';
  if (p.source === 'derived' && origin) return origin.name.startsWith('title.') ? 'name' : sourceRank(origin);
  if (p.source === 'drawing') return 'drawing';
  if (p.method === 'cad-metadata') return 'cad-metadata';
  if (p.method === 'pdf-text' || p.method === 'ocr' || p.method === 'dxf-entity') return 'drawing';
  return 'cad';
}

/** Position in a rule's order; unlisted sources after all listed ones. The engineer's own value always first. */
export function rankIndex(rank: SourceRank, rule: PrecedenceRule | null): number {
  if (rank === 'manual') return -1;
  const i = rule ? rule.order.indexOf(rank) : -1;
  return i < 0 ? 99 : i;
}

// ─── Comparison tolerances ────────────────────────────────────────────────────────────────────────────────────────

export interface ComparisonTolerance {
  /** Relative tolerance, as a fraction of the larger value. */
  rel: number;
  /** Absolute floor, in the parameter's dictionary unit. Two values agree within max(rel × value, abs). */
  abs: number;
}

/**
 * Two numbers agree when they differ by no more than 0.5 % or 0.05 (mm, for a length), whichever is larger.
 * ENGINEERING JUDGEMENT: wide enough for a drawing dimension rounded to one decimal against an exact model value,
 * narrow enough that a different nominal size (Ø8.5 v Ø8.4) is a difference.
 */
export const DEFAULT_TOLERANCE: ComparisonTolerance = { rel: 0.005, abs: 0.05 };

/** Per-parameter overrides, each stated. Pass your own to `consolidate` to change one. */
export const DEFAULT_TOLERANCES: Readonly<Record<string, ComparisonTolerance>> = {
  // A drawing mass is calculated by the CAD system at ITS density and rounded: 2 % (engineering judgement).
  'part.mass': { rel: 0.02, abs: 0.001 },
  // Areas and volumes on a drawing are rounded figures: 1 % (engineering judgement); no absolute floor in cm² / cm³.
  'part.volume': { rel: 0.01, abs: 0 },
  'part.surfaceArea': { rel: 0.01, abs: 0 },
  // Counts are exact.
  'gear.teeth': { rel: 0, abs: 0 },
  'feature.count.holes': { rel: 0, abs: 0 },
  'feature.count.threads': { rel: 0, abs: 0 },
  'finish.maskedFeatures': { rel: 0, abs: 0 },
  'gear.qualityClassIso': { rel: 0, abs: 0 },
};

export function toleranceFor(name: string, table: Readonly<Record<string, ComparisonTolerance>> = DEFAULT_TOLERANCES,
  fallback: ComparisonTolerance = DEFAULT_TOLERANCE): ComparisonTolerance {
  return table[name] ?? fallback;
}

/**
 * Counts a drawing reader sums from the CALLOUTS it read. Not every hole is called out, so such a count is a lower
 * bound: fewer than the 3D model measures is expected; more than it measures is a real difference (a conflict).
 */
export const CALLOUT_COUNT_NAMES: ReadonlySet<string> = new Set(['feature.count.holes', 'feature.count.threads']);

/** Do two numbers agree within a tolerance? */
export function withinTolerance(a: number, b: number, t: ComparisonTolerance): boolean {
  const d = Math.abs(a - b);
  return d <= Math.max(t.rel * Math.max(Math.abs(a), Math.abs(b)), t.abs) + 1e-12;
}

/**
 * How far a drawing diameter may sit from a CAD hole and still be read as THE SAME hole with a different size (a
 * conflict), rather than as a hole the model does not have: 10 % of the diameter or 1.5 mm, whichever is larger.
 * ENGINEERING JUDGEMENT — it separates "Ø24 on the drawing, Ø25 in the model" from two unrelated holes.
 */
export const NEAR_MISS_DIAMETER: ComparisonTolerance = { rel: 0.10, abs: 1.5 };

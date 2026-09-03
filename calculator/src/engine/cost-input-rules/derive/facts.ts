/**
 * Geometry facts — the one place the rules read measured geometry through.
 *
 * Every commodity pack used to read `ctx.geo.*` directly at forty-odd sites,
 * which is how a mesh upload came to be costed with "zero holes" (a hard zero
 * the STL path fabricated, indistinguishable from "measured and found none")
 * and how `geometryQuality` came to be declared, set, and read by nothing.
 *
 * The adapter names each fact, says where it came from, and — on a mesh —
 * returns a DECISION instead of a number for anything a mesh cannot see. A
 * closed STL can give volume, area and a bounding box; it cannot give holes,
 * bosses, pockets, setups or exact walls. Those are asked for, not assumed.
 */
import type { RuleContext, Decision, ValueSource } from '../types.js';
import type { FeatureRow } from '../../feature-ops.js';

export type GeometryQuality = RuleContext['geometryQuality'];

export interface Fact<T> {
  value: T;
  source: ValueSource;
  /** 0–1: exact B-rep 0.95, mesh 0.7, heuristic 0.4. */
  confidence: number;
  basis: string;
  faceIds?: number[];
}

export const QUALITY_CONFIDENCE: Record<GeometryQuality, number> = { occt: 0.95, stl: 0.7, text: 0.4 };

export function geometryQuality(ctx: RuleContext): GeometryQuality {
  return ctx.geometryQuality ?? (ctx.geo.status === 'success' ? 'occt' : 'text');
}

/** Blocking decision for a feature a mesh cannot see. `answers[id]` (a number) satisfies it. */
export function meshFeatureGap(id: string, what: string, unit = 'count'): Decision {
  return {
    id, kind: 'geometry_gap',
    question: `How many ${what} does this part have?`,
    why: 'The upload is a mesh (STL). A mesh has no B-rep, so holes, bosses and pockets cannot be '
      + 'counted from it — they used to be reported as zero, which read as "measured and found none".',
    options: [{ value: 'enter', label: `Enter the ${what} ${unit}` }],
    entry: { kind: 'number', unit },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

/** Hole rows: exact from the B-rep; on a mesh, the engineer's count (or a gap decision). */
export function holeRows(ctx: RuleContext): { rows: FeatureRow[]; fact: Fact<number> } | { decision: Decision } {
  const q = geometryQuality(ctx);
  const rows = ((ctx.geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole');
  if (q === 'occt' || rows.length) {
    const n = rows.reduce((s, r) => s + r.count, 0);
    return { rows, fact: { value: n, source: 'geometry', confidence: QUALITY_CONFIDENCE.occt,
      basis: `${n} hole(s) in ${rows.length} size group(s), counted off the B-rep`,
      faceIds: rows.flatMap(r => r.faceIds ?? []) } };
  }
  if (q === 'stl') {
    const typed = Number(ctx.answers['geometry.holeCount']);
    if (Number.isFinite(typed) && typed >= 0) {
      return { rows: [], fact: { value: typed, source: 'engineer', confidence: 0.9, basis: `${typed} hole(s), entered by the engineer (mesh upload)` } };
    }
    return { decision: meshFeatureGap('geometry.holeCount', 'drilled or bored holes') };
  }
  return { rows: [], fact: { value: 0, source: 'geometry', confidence: QUALITY_CONFIDENCE.text, basis: 'no geometry measured' } };
}

/** Setup directions with the faces behind each — from the kernel's normal clustering. */
export function setupDirections(ctx: RuleContext): Fact<Array<{ directionLabel: string; faceCount: number; faceIds: number[] }>> {
  const dirs = ctx.geo.setupAnalysis?.principalDirections ?? [];
  return {
    value: dirs.map(d => ({ directionLabel: d.directionLabel, faceCount: d.faceCount, faceIds: d.faceIds ?? [] })),
    source: 'geometry',
    confidence: QUALITY_CONFIDENCE[geometryQuality(ctx)],
    basis: `${dirs.length} principal direction(s) from face-normal clustering`,
    faceIds: dirs.flatMap(d => d.faceIds ?? []),
  };
}

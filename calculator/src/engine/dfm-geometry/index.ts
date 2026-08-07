/**
 * Geometric DFM/DFA — public entry point.
 *
 * `analyseGeometricDFM` is the whole feature: measured geometry in, findings
 * that name their faces and cite their sources out. Pure and synchronous, so
 * the background worker and a unit test call it identically.
 */
import type { CommodityType } from '../types.js';
import type { GeometricRule, GeometricFinding, PartContext, GeometricDFMResult } from './types.js';
import { runGeometricRules } from './types.js';
import { CASTING_RULES, CASTING_LIMITATIONS, castingHotSpotFindings } from './commodities/casting.js';
import { INJECTION_MOULDING_RULES, MOULDING_LIMITATIONS } from './commodities/injection-moulding.js';
import { MACHINING_RULES, MACHINING_LIMITATIONS } from './commodities/machining.js';
import { SHEET_METAL_RULES, SHEET_METAL_LIMITATIONS } from './commodities/sheet-metal.js';
import { analyseDFAHandling, type DFAHandlingResult } from './dfa-handling.js';

export * from './types.js';
export { analyseDFAHandling, symmetryClass } from './dfa-handling.js';
export type { DFAHandlingResult } from './dfa-handling.js';
export { CASTING_RULES, CASTING_LIMITATIONS, MIN_DRAFT_DEG } from './commodities/casting.js';
export { INJECTION_MOULDING_RULES, MOULDING_LIMITATIONS } from './commodities/injection-moulding.js';
export { MACHINING_RULES, MACHINING_LIMITATIONS, PREFERRED_DRILL_DIA_MM, STANDARD_DRILL_LD } from './commodities/machining.js';
export { SHEET_METAL_RULES, SHEET_METAL_LIMITATIONS } from './commodities/sheet-metal.js';

/**
 * Which commodities have a geometric pack.
 *
 * Deliberately four. Eighteen thin packs would reproduce exactly the complaint
 * this work answers; a commodity is added when its rules are measured, cited
 * and validated against a real part, not before.
 */
export const GEOMETRIC_DFM_COMMODITIES: ReadonlySet<CommodityType> = new Set<CommodityType>([
  'casting', 'cast_and_machine', 'injection_moulding',
  'machining', 'sheet_metal', 'sheet_metal_fab',
]);

/** Every registered rule, for the citation test and the rule-library report. */
export function allGeometricRules(): readonly GeometricRule[] {
  return [
    ...CASTING_RULES,
    ...INJECTION_MOULDING_RULES,
    ...MACHINING_RULES,
    ...SHEET_METAL_RULES,
  ];
}

function packFor(commodity: CommodityType): readonly GeometricRule[] {
  switch (commodity) {
    case 'casting':
      return CASTING_RULES;
    case 'cast_and_machine':
      // Composes: a cast-and-machine part is subject to both rule sets, and the
      // machining rules are re-labelled so a finding reports the right commodity.
      return [...CASTING_RULES, ...MACHINING_RULES.map(r => ({ ...r, commodity }))];
    case 'injection_moulding':
      return INJECTION_MOULDING_RULES;
    case 'machining':
      return MACHINING_RULES;
    case 'sheet_metal':
    case 'sheet_metal_fab':
      return SHEET_METAL_RULES.map(r => ({ ...r, commodity }));
    default:
      return [];
  }
}

export interface GeometricAnalysis extends GeometricDFMResult {
  dfa: DFAHandlingResult;
  /** True when a pack exists for this commodity at all. */
  packAvailable: boolean;
  /** One entry per rule — what the report renders. See groupFindings. */
  grouped: GroupedFinding[];
}

export function analyseGeometricDFM(part: PartContext): GeometricAnalysis {
  const rules = packFor(part.commodity);
  const packAvailable = rules.length > 0;

  if (!packAvailable) {
    return {
      commodity: part.commodity, findings: [], rulesEvaluated: 0, featuresExamined: 0,
      packAvailable: false,
      limitations: [`No geometric rule pack exists for ${part.commodity} yet, so no `
        + 'geometry-based checks were run. The commercial cost-ratio observations still apply.'],
      dfa: analyseDFAHandling(part), grouped: [],
    };
  }

  const base = runGeometricRules(rules, part);
  const findings: GeometricFinding[] = [...base.findings];
  const limitations = [...base.limitations];

  // Part-level findings that do not belong to a single feature.
  if (part.commodity === 'casting' || part.commodity === 'cast_and_machine') {
    findings.push(...castingHotSpotFindings(part));
  }
  // Every pack declares what geometry can never tell it. A short finding list
  // must not be read as a clean part — this is the difference between "we
  // looked and found little" and "we could not look".
  if (part.commodity === 'casting' || part.commodity === 'cast_and_machine') {
    limitations.push(...CASTING_LIMITATIONS);
  }
  if (part.commodity === 'machining' || part.commodity === 'cast_and_machine') {
    limitations.push(...MACHINING_LIMITATIONS);
  }
  if (part.commodity === 'injection_moulding') {
    limitations.push(...MOULDING_LIMITATIONS);
  }
  if (part.commodity === 'sheet_metal' || part.commodity === 'sheet_metal_fab') {
    limitations.push(...SHEET_METAL_LIMITATIONS);
  }

  findings.sort((a, b) => {
    const rank = { critical: 0, major: 1, minor: 2, advisory: 3 } as const;
    return rank[a.severity] - rank[b.severity]
      || a.ruleId.localeCompare(b.ruleId)
      || a.featureId.localeCompare(b.featureId);
  });

  return { ...base, findings, limitations, packAvailable,
    grouped: groupFindings(findings), dfa: analyseDFAHandling(part) };
}

/**
 * One entry per RULE, with every instance under it.
 *
 * Found by running the packs over the real steering knuckle: 60 faces at zero
 * draft produced 60 separate findings, and the report became a wall of
 * identical sentences. A foundry engineer wants "60 faces are below minimum
 * draft — here they are", not sixty rows. This is what aPriori and DFMPro show:
 * one issue, N instances, all highlightable together.
 *
 * The per-instance `findings` array is kept as-is for the viewer, which needs
 * every face id; this is the shape the REPORT should render.
 */
export interface GroupedFinding {
  ruleId: string;
  title: string;
  severity: GeometricFinding['severity'];
  count: number;
  /** Every face across all instances — the viewer highlights the lot. */
  faceIds: number[];
  /** The worst instance, by measured distance from the threshold. */
  worst: GeometricFinding;
  /** Measured spread across instances, so the reader sees the range not one case. */
  range: { min: number; max: number; unit: string };
  threshold: GeometricFinding['threshold'];
  recommendation: string;
  source: GeometricFinding['source'];
  instances: GeometricFinding[];
}

export function groupFindings(findings: readonly GeometricFinding[]): GroupedFinding[] {
  const by = new Map<string, GeometricFinding[]>();
  for (const f of findings) {
    const k = by.get(f.ruleId);
    if (k) k.push(f); else by.set(f.ruleId, [f]);
  }
  const rank = { critical: 0, major: 1, minor: 2, advisory: 3 } as const;
  const out: GroupedFinding[] = [];
  for (const [ruleId, list] of by) {
    const vals = list.map(f => f.measured.value);
    // "Worst" = furthest the wrong side of the threshold, whichever way it points.
    const below = list[0].threshold.comparator.startsWith('<');
    const worst = list.reduce((a, b) =>
      (below ? b.measured.value < a.measured.value : b.measured.value > a.measured.value) ? b : a);
    out.push({
      ruleId,
      title: list[0].title,
      severity: list.reduce((a, b) => (rank[b.severity] < rank[a.severity] ? b : a)).severity,
      count: list.length,
      faceIds: [...new Set(list.flatMap(f => f.faceIds))].sort((a, b) => a - b),
      worst,
      range: { min: Math.min(...vals), max: Math.max(...vals), unit: list[0].measured.unit },
      threshold: list[0].threshold,
      recommendation: list[0].recommendation,
      source: worst.source,
      instances: list,
    });
  }
  out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count
    || a.ruleId.localeCompare(b.ruleId));
  return out;
}

/** Face ids to highlight in the viewer, deduped, worst severity first. */
export function highlightFaceIds(a: GeometricAnalysis): number[] {
  const seen = new Set<number>();
  for (const f of a.findings) for (const id of f.faceIds) seen.add(id);
  return [...seen];
}

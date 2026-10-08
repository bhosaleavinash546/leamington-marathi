/**
 * Geometric DFM/DFA — public entry point.
 *
 * `analyseGeometricDFM` is the whole feature: measured geometry in, findings
 * that name their faces and cite their sources out. Pure and synchronous, so
 * the background worker and a unit test call it identically.
 */
import { computeUniversalStack } from '../core.js';
import type { CommodityType } from '../types.js';
import type { GeometricRule, GeometricFinding, PartContext, GeometricDFMResult } from './types.js';
import { runGeometricRules } from './types.js';
import { CASTING_RULES, CASTING_LIMITATIONS, castingHotSpotFindings } from './commodities/casting.js';
import { INJECTION_MOULDING_RULES, MOULDING_LIMITATIONS } from './commodities/injection-moulding.js';
import { MACHINING_RULES, MACHINING_LIMITATIONS } from './commodities/machining.js';
import { machiningPartLevelFindings, toothedSets, toothedFindings } from './commodities/machining-access.js';
import { SHEET_METAL_RULES, SHEET_METAL_LIMITATIONS } from './commodities/sheet-metal.js';
import { FORGING_RULES, FORGING_LIMITATIONS } from './commodities/forging.js';
import { BLOW_MOULDING_RULES, BLOW_LIMITATIONS, blowPartLevelFindings } from './commodities/blow-moulding.js';
import { analyseDFAHandling, type DFAHandlingResult } from './dfa-handling.js';
import { priceFinding, totalCostGBP, type CostContext } from './cost-impact.js';
import { findingVariant, NOT_IN_STACK_RULES } from '../design-to-cost.js';

export * from './types.js';
export { analyseDFAHandling, symmetryClass } from './dfa-handling.js';
export { priceFinding, totalCostGBP, PRICERS, NOT_MODELLED } from './cost-impact.js';
export type { FindingCostImpact, CostContext, CostImpactKind } from './cost-impact.js';
export type { DFAHandlingResult } from './dfa-handling.js';
export { CASTING_RULES, CASTING_LIMITATIONS, MIN_DRAFT_DEG } from './commodities/casting.js';
export { INJECTION_MOULDING_RULES, MOULDING_LIMITATIONS } from './commodities/injection-moulding.js';
export { MACHINING_RULES, MACHINING_LIMITATIONS, STANDARD_DRILL_LD, isStockDrill, nearestStockDrill } from './commodities/machining.js';
export { machiningPartLevelFindings, partFrame, coverDirections } from './commodities/machining-access.js';
export { SHEET_METAL_RULES, SHEET_METAL_LIMITATIONS } from './commodities/sheet-metal.js';
export { FORGING_RULES, FORGING_LIMITATIONS } from './commodities/forging.js';
export { BLOW_MOULDING_RULES, BLOW_LIMITATIONS, MIN_BLOWN_WALL_MM } from './commodities/blow-moulding.js';

/**
 * Which commodities have a geometric pack.
 *
 * Deliberately four. Eighteen thin packs would reproduce exactly the complaint
 * this work answers; a commodity is added when its rules are measured, cited
 * and validated against a real part, not before.
 */
/**
 * Undercut share above which the ASSUMED draw direction is provably wrong.
 *
 * Calibrated against the six benchmark parts rather than picked: five sit at
 * 5–28%, the bumper at 67%. Half is comfortably above every plausible case and
 * comfortably below the implausible one.
 */
export const UNDERCUT_SHARE_IMPLAUSIBLE = 0.5;

export const GEOMETRIC_DFM_COMMODITIES: ReadonlySet<CommodityType> = new Set<CommodityType>([
  'casting', 'cast_and_machine', 'injection_moulding',
  'machining', 'sheet_metal', 'sheet_metal_fab',
  'forging', 'blow_moulding',
]);

/** Every registered rule, for the citation test and the rule-library report. */
export function allGeometricRules(): readonly GeometricRule[] {
  return [
    ...CASTING_RULES,
    ...INJECTION_MOULDING_RULES,
    ...MACHINING_RULES,
    ...SHEET_METAL_RULES,
    ...FORGING_RULES,
    ...BLOW_MOULDING_RULES,
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
    case 'forging':
      return FORGING_RULES;
    case 'blow_moulding':
      return BLOW_MOULDING_RULES;
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
  /** Sum of every priced finding, £/part. Unpriced findings contribute nothing. */
  totalAddressableGBP: number;
}

/** Below this share of faces the rules can judge (planes, cylinders), the report leads with what was not checked. */
export const FREEFORM_JUDGED_MIN = 0.5;

export function analyseGeometricDFM(part: PartContext): GeometricAnalysis {
  const rules = packFor(part.commodity);
  const packAvailable = rules.length > 0;

  if (!packAvailable) {
    return {
      commodity: part.commodity, findings: [], rulesEvaluated: 0, featuresExamined: 0,
      packAvailable: false,
      limitations: [`No geometric rule pack exists for ${part.commodity} yet, so no `
        + 'geometry-based checks were run. The commercial cost-ratio observations still apply.'],
      dfa: analyseDFAHandling(part), grouped: [], totalAddressableGBP: 0,
    };
  }

  // Gear / spline tooth roots are generated by a hob, shaper or broach — never judged as corners (toothedSets).
  const teeth = part.featureSet.available ? toothedSets(part.featureSet.features ?? []) : [];
  if (teeth.length) {
    const drop = new Set(teeth.flatMap(t => t.ids));
    part = { ...part, featureSet: { ...part.featureSet, features: part.featureSet.features.filter(f => !drop.has(f.id)) } };
  }

  const base = runGeometricRules(rules, part);
  const findings: GeometricFinding[] = [...base.findings];
  const limitations = [...base.limitations];
  // Free-form coverage: the rules judge planes and cylinders. On a bumper (492 of 498 faces B-spline) silence is not a
  // pass, and the report must say so before anything else.
  const fsx = part.featureSet;
  if (fsx.available && (fsx.faceCount ?? 0) > 0) {
    const judged = new Set([...(fsx.features ?? []).flatMap(f => f.faceIds), ...teeth.flatMap(t => t.faceIds)]).size;
    const share = judged / (fsx.faceCount as number);
    if (share < FREEFORM_JUDGED_MIN) {
      limitations.unshift(`Only ${judged} of ${fsx.faceCount} faces (${(share * 100).toFixed(0)} %) are planes or cylinders the rules `
        + 'can judge; the rest are free-form (B-spline / torus) surfaces whose draft, undercuts, corners and walls were NOT '
        + 'checked — no finding on them is not a pass.');
    }
  }
  if (teeth.length) {
    if (part.commodity === 'machining' || part.commodity === 'cast_and_machine') findings.push(...toothedFindings(part, teeth));
    else limitations.push(`${teeth.reduce((a, t) => a + t.ids.length, 0)} concave roots on a tooth ring (gear / spline) `
      + 'were set aside — a generated tooth form is not judged by the corner rules.');
  }

  // Part-level findings that do not belong to a single feature.
  if (part.commodity === 'casting' || part.commodity === 'cast_and_machine') {
    findings.push(...castingHotSpotFindings(part));
  }
  if (part.commodity === 'blow_moulding') {
    findings.push(...blowPartLevelFindings(part));
  }
  if (part.commodity === 'machining' || part.commodity === 'cast_and_machine') {
    findings.push(...machiningPartLevelFindings(part));
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
  if (part.commodity === 'forging') {
    limitations.push(...FORGING_LIMITATIONS);
  }
  if (part.commodity === 'blow_moulding') {
    limitations.push(...BLOW_LIMITATIONS);
  }

  // ── Draw-direction sanity ────────────────────────────────────────────────
  // Since Oct 2026 the kernel measures draft against the draw its pull-direction
  // search chose (three axes, fewest blocked faces) and calls a face an undercut
  // only when the part blocks its line of release — a two-half tool opens both
  // ways. The guard stays as a backstop: when more than half the wall faces are
  // still blocked, no principal-axis parting fits the part and every undercut
  // finding is an artefact of that. Reporting ONE honest "the draw is wrong"
  // beats reporting many confident falsehoods.
  const wallFaces = (part.featureSet.features ?? [])
    .filter(f => f.draftClass && f.draftClass !== 'not_applicable');
  const undercutCount = wallFaces.filter(f => f.draftClass === 'undercut').length;
  const undercutShare = wallFaces.length > 0 ? undercutCount / wallFaces.length : 0;
  if (undercutShare > UNDERCUT_SHARE_IMPLAUSIBLE && undercutCount > 1) {
    const before = findings.length;
    for (let i = findings.length - 1; i >= 0; i--) {
      if (/\.undercut\./.test(findings[i].ruleId)) findings.splice(i, 1);
    }
    limitations.unshift(
      `The draw ${JSON.stringify(part.featureSet.drawDirectionXYZ ?? [0, 0, 1])} is the best principal axis the kernel found, and it does not fit: `
      + `${undercutCount} of ${wallFaces.length} wall faces (${(undercutShare * 100).toFixed(0)}%) `
      + 'came out as undercuts, which no castable, mouldable or forgeable part can be — so the '
      + `assumed draw is wrong for this shape and ${before - findings.length} undercut finding(s) `
      + 'were withdrawn rather than reported. Re-run with the correct parting direction, or read '
      + 'the draft findings below as provisional.',
    );
  }

  // Price before grouping, so a group's total is the sum of its instances.
  // Rules never set cost themselves — a rule author cannot smuggle in a number
  // without adding a pricer, which is a visible, reviewable change.
  const costCtx: CostContext = part.cost ?? {};
  for (const f of findings) {
    const priced = priceFinding(f, part, costCtx);
    if (priced.costImpact) f.costImpact = priced.costImpact;
    else if (priced.costNotModelled) f.costNotModelled = priced.costNotModelled;
  }

  findings.sort((a, b) => {
    const rank = { critical: 0, major: 1, minor: 2, advisory: 3 } as const;
    return rank[a.severity] - rank[b.severity]
      || a.ruleId.localeCompare(b.ruleId)
      || a.featureId.localeCompare(b.featureId);
  });

  return { ...base, findings, limitations, packAvailable,
    grouped: groupFindings(findings), totalAddressableGBP: totalCostGBP(findings),
    dfa: analyseDFAHandling(part) };
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
  /** Summed across instances. 0 when the rule has no modelled cost path. */
  totalCostGBP: number;
  /** Why the group is unpriced, when it is. */
  costNotModelled?: string;
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
      totalCostGBP: totalCostGBP(list),
      ...(list[0].costNotModelled ? { costNotModelled: list[0].costNotModelled } : {}),
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
  // MONEY FIRST. A cost engineering director reads the list top-down and stops;
  // leading with 60 zero-draft faces instead of the £2,400 slide wastes that.
  // Severity breaks ties, so an unpriced critical still outranks an unpriced
  // advisory, and unpriced always follows priced at equal severity.
  out.sort((a, b) =>
    b.totalCostGBP - a.totalCostGBP
    || rank[a.severity] - rank[b.severity]
    || b.count - a.count
    || a.ruleId.localeCompare(b.ruleId));
  return out;
}

/** Face ids to highlight in the viewer, deduped, worst severity first. */
export function highlightFaceIds(a: GeometricAnalysis): number[] {
  const seen = new Set<number>();
  for (const f of a.findings) for (const id of f.faceIds) seen.add(id);
  return [...seen];
}


/**
 * Re-cost a priced finding through the whole 8-bucket stack.
 *
 * The job pricers give the cost of the FEATURE (minutes × rate) or the tooling
 * delta ÷ volume — the naked line, without the overhead and margin the stack
 * puts on top of it. With the costing's own input and library in hand (the
 * browser has both), run the stack with and without the finding's effect and
 * report Δtotal — the figure that actually moves the piece price.
 *
 *   feature_cost → the feature's minutes come off the operation that carries
 *                  the most cycle time (drilling for holes)
 *   tooling      → the tooling delta comes off `tooling.totalToolingCost`
 *
 * Findings the job did not price stay unpriced: nothing here invents a cost.
 */
/** The slice of a grouped finding the re-stack needs — the browser holds a projection, not the full type. */
export interface RestackableFinding {
  ruleId: string;
  totalCostGBP?: number;
  worst: { costImpact?: { kind?: string } };
}

export function restackFindingCosts(
  grouped: readonly RestackableFinding[],
  input: import('../types.js').UniversalStackInput,
  library: import('../types.js').RateLibrary,
): Array<{ ruleId: string; jobGBP: number; stackGBP: number; basis: string }> {
  const base = computeUniversalStack(input, library).total;
  const out: Array<{ ruleId: string; jobGBP: number; stackGBP: number; basis: string }> = [];
  for (const g of grouped) {
    // One definition of "take this finding out" — shared with the Design-to-Cost panel (design-to-cost.ts). A cost the
    // sheet does not carry (a hole it assumes is cored) is not in the stack to take out.
    if (NOT_IN_STACK_RULES.has(g.ruleId)) continue;
    const v = findingVariant(g, input, library);
    if (!v) continue;
    try {
      const t = computeUniversalStack(v.next, library).total;
      out.push({ ruleId: g.ruleId, jobGBP: g.totalCostGBP ?? 0, stackGBP: Math.round((base - t) * 10_000) / 10_000, basis: v.basis });
    } catch { /* a variant that cannot be costed is left at the job's figure */ }
  }
  return out;
}

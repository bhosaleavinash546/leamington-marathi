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
import { SHEET_METAL_RULES, SHEET_METAL_LIMITATIONS } from './commodities/sheet-metal.js';
import { FORGING_RULES, FORGING_LIMITATIONS } from './commodities/forging.js';
import { BLOW_MOULDING_RULES, BLOW_LIMITATIONS, blowPartLevelFindings } from './commodities/blow-moulding.js';
import { analyseDFAHandling, type DFAHandlingResult } from './dfa-handling.js';
import { priceFinding, totalCostGBP, type CostContext } from './cost-impact.js';

export * from './types.js';
export { analyseDFAHandling, symmetryClass } from './dfa-handling.js';
export { priceFinding, totalCostGBP, PRICERS, NOT_MODELLED } from './cost-impact.js';
export type { FindingCostImpact, CostContext, CostImpactKind } from './cost-impact.js';
export type { DFAHandlingResult } from './dfa-handling.js';
export { CASTING_RULES, CASTING_LIMITATIONS, MIN_DRAFT_DEG } from './commodities/casting.js';
export { INJECTION_MOULDING_RULES, MOULDING_LIMITATIONS } from './commodities/injection-moulding.js';
export { MACHINING_RULES, MACHINING_LIMITATIONS, PREFERRED_DRILL_DIA_MM, STANDARD_DRILL_LD } from './commodities/machining.js';
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

  const base = runGeometricRules(rules, part);
  const findings: GeometricFinding[] = [...base.findings];
  const limitations = [...base.limitations];

  // Part-level findings that do not belong to a single feature.
  if (part.commodity === 'casting' || part.commodity === 'cast_and_machine') {
    findings.push(...castingHotSpotFindings(part));
  }
  if (part.commodity === 'blow_moulding') {
    findings.push(...blowPartLevelFindings(part));
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
  // The kernel measures draft against an ASSUMED +Z draw; it does not derive
  // the parting. When more than half the wall faces come out as undercuts the
  // part could not be cast, moulded or forged in that direction at all, so the
  // assumption is wrong and every undercut finding is an artefact of it.
  // Measured across the six benchmark parts: knuckle 9%, stub axle 11%, servo
  // horn 5%, fuel tank 25%, seat member 28% — all plausible; the bumper 67%,
  // which is not. Reporting ONE honest "the assumed draw is wrong" beats
  // reporting four confident falsehoods.
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
      `Draw direction is assumed to be +Z and is NOT derived from the part. `
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
    const gbp = g.totalCostGBP ?? 0;
    if (!(gbp > 0)) continue;
    // Older payloads carry no kind: a moulding undercut is a tooling delta, everything else priced is a feature cost.
    const kind = g.worst.costImpact?.kind ?? (/undercut|side-action|slide/.test(g.ruleId) ? 'tooling' : 'feature_cost');
    let next: import('../types.js').UniversalStackInput | null = null;
    let basis = '';
    if (kind === 'tooling') {
      const vol = input.tooling.amortizationVolume || input.annualVolume || 0;
      const delta = gbp * (vol || 1);
      next = { ...input, tooling: { ...input.tooling, totalToolingCost: Math.max(0, input.tooling.totalToolingCost - delta) } };
      basis = `tooling NRE −£${delta.toFixed(0)} (the slide/insert delta) through the stack`;
    } else if (kind === 'feature_cost') {
      const ops = input.operations;
      if (!ops.length) continue;
      const k = ops.reduce((bi, o, i, a) => (o.cycleTimeHr > a[bi].cycleTimeHr ? i : bi), 0);
      const rate = library.machines.find(m => m.id === ops[k].machineId)?.computedRatePerHr ?? 0;
      const lab = library.labour.find(l => l.id === ops[k].labourId)?.fullyLoadedRatePerHr ?? 0;
      const hr = (rate + lab) > 0 ? gbp / (rate + lab) : 0;
      if (!(hr > 0)) continue;
      next = { ...input, operations: ops.map((o, i) => i === k ? { ...o, cycleTimeHr: Math.max(0.0001, o.cycleTimeHr - hr), labourTimeHr: Math.max(0.0001, o.labourTimeHr - hr) } : o) };
      basis = `${(hr * 60).toFixed(2)} min off ${ops[k].operationName} through the stack`;
    } else continue;
    try {
      const t = computeUniversalStack(next, library).total;
      out.push({ ruleId: g.ruleId, jobGBP: gbp, stackGBP: Math.round((base - t) * 10_000) / 10_000, basis });
    } catch { /* a variant that cannot be costed is left at the job's figure */ }
  }
  return out;
}

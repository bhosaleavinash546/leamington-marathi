/**
 * Geometric DFM — a rule engine where every rule must cite its source.
 *
 * ## Why this exists
 *
 * `dfm-dfa.ts::generateDFMDFA(result, input, commodity, ctx)` takes no geometry.
 * All 41 of its rule sites key off cost-bucket percentages — `toolPct > 18`,
 * `matUtil < 0.60` — so a finding can never name a feature, and the same
 * sentence prints for a steering knuckle and a bracket. Manufacturing called
 * that "generic" and "not trustable", and they were describing the architecture
 * accurately.
 *
 * Every commercial DFM tool solves this the same way: the FEATURE is the unit
 * of analysis. aPriori extracts Geometric Cost Drivers and highlights issues on
 * the model; HCL DFMPro recognises ribs and bosses itself and runs 100+
 * handbook rules against them. A finding points at the geometry that caused it.
 *
 * ## The two invariants
 *
 * 1. **No citation, no ship.** `source` is required, and
 *    `tests/dfm-geometry-rules.test.ts` fails the build if any registered rule
 *    leaves it empty. A threshold an engineer cannot trace is a threshold they
 *    are right to distrust.
 * 2. **Measured or silent.** A rule may only read values the kernel actually
 *    measured. Absent input means the rule does not run — it never substitutes a
 *    default and reports on it. An unrun check produces no finding, which is
 *    correct: a fabricated input produces a fabricated warning, and a wrong
 *    finding costs more trust than a missing one.
 */
import type { CommodityType } from '../types.js';
import type { ManufacturingFeature, ManufacturingFeatureSet } from '../ai-analysis.js';

export type { ManufacturingFeature, ManufacturingFeatureSet };

/** Ordered worst-first — the report and the API both sort on this. */
export type GeoSeverity = 'critical' | 'major' | 'minor' | 'advisory';

export const SEVERITY_RANK: Record<GeoSeverity, number> = {
  critical: 0, major: 1, minor: 2, advisory: 3,
};

/**
 * Where a threshold comes from. Required on every rule.
 *
 * `standard` names the publication; `clause` the section where there is one;
 * `note` carries the honest qualifier — e.g. that a band midpoint was taken, or
 * that a figure is a widely-published rule of thumb rather than a standard.
 * The report prints all of it under the finding.
 */
export interface RuleSource {
  standard: string;
  clause?: string;
  url?: string;
  note?: string;
}

export type FeatureKind = ManufacturingFeature['kind'];

/** What the rule needs from the part as a whole, beyond a single feature. */
export interface PartContext {
  commodity: CommodityType;
  featureSet: ManufacturingFeatureSet;
  /** Bounding box in mm, when the kernel measured it. */
  bboxMm?: { x: number; y: number; z: number };
  /** Median measured wall — only meaningful when wallAnalysisValid. */
  medianWallMm?: number | null;
  /** Engineer-supplied, never guessed. Absent = the rules needing it do not run. */
  materialFamily?: string;
  /** Casting/moulding sub-route when known, e.g. 'hpdc' | 'sand' | 'gravity'. */
  process?: string;
  /**
   * Rates and volume for pricing findings. Absent means findings stay unpriced
   * with a stated reason — never estimated. See `cost-impact.ts`.
   */
  cost?: import('./cost-impact.js').CostContext;
}

/**
 * One finding, attached to the geometry that caused it.
 *
 * `faceIds` is what separates this from the old engine: it indexes the same
 * B-rep face map the viewer's `triFace` sidecar uses, so clicking a finding
 * highlights exactly the faces that triggered it.
 */
export interface GeometricFinding {
  ruleId: string;
  commodity: CommodityType;
  severity: GeoSeverity;
  title: string;
  /** One sentence naming the feature and the measurement. No adjectives. */
  detail: string;
  featureId: string;
  faceIds: number[];
  measured: { field: string; value: number; unit: string };
  threshold: { value: number; unit: string; comparator: '<' | '>' | '<=' | '>=' };
  recommendation: string;
  source: RuleSource;
  positionMm?: [number, number, number];
  /**
   * What this finding is worth, when a cost path is modelled. See
   * `cost-impact.ts` — set by `analyseGeometricDFM`, never by a rule, so a rule
   * author cannot smuggle a number in without a pricer.
   */
  costImpact?: import('./cost-impact.js').FindingCostImpact;
  /**
   * Why it was NOT priced. Mutually exclusive with `costImpact`, and pinned by
   * test: a finding must never carry both, because "here is a number and here
   * is why there is no number" is how a report loses its reader.
   */
  costNotModelled?: string;
}

export interface GeometricRule {
  id: string;
  commodity: CommodityType;
  title: string;
  appliesTo: FeatureKind[];
  source: RuleSource;
  /**
   * Return null when the rule does not fire OR when the inputs it needs were
   * not measured. Those are the same thing to the caller — no finding — and
   * conflating them is deliberate: the alternative is guessing an input.
   */
  evaluate(feature: ManufacturingFeature, part: PartContext): GeometricFinding | null;
}

/**
 * Is a single-ray thickness reading a WALL? A ray from a face can cross a cavity to the far side of the part
 * (the ECU cover's "rib" read 168 mm against a 1.5 mm wall — 112×) or graze a sliver at a fillet (a casting
 * "section" read 0.2 mm beside 27.8 mm — 163:1). Neither is a wall, and reporting them buried the real
 * findings. A reading counts between max(0.3 mm, 0.2× the part's median wall) and 5× the median. No median
 * measured → no judgement possible → treated as not plausible (measured or silent).
 */
export const WALL_PLAUSIBLE_MIN_MM = 0.3;
export const WALL_PLAUSIBLE_LO = 0.2;
export const WALL_PLAUSIBLE_HI = 5;
export function plausibleWall(t: number | undefined | null, part: PartContext): boolean {
  const med = part.featureSet.medianThicknessMm;
  if (t === undefined || t === null || !(t > 0) || !med || !(med > 0)) return false;
  return t >= Math.max(WALL_PLAUSIBLE_MIN_MM, WALL_PLAUSIBLE_LO * med) && t <= WALL_PLAUSIBLE_HI * med;
}

/**
 * A fillet that is a BLEND between faces — not a slot end, a half-hole or a large curved panel. Since the
 * kernel reports every partial cylinder as `fillet` (Oct 2026), corner rules must ask for this: a blend sweeps
 * at most ~120° (a 90° corner sweeps 90°); a slot end sweeps 180°.
 */
export const BLEND_MAX_SWEEP_DEG = 120;
export function isBlend(f: ManufacturingFeature): boolean {
  return f.kind === 'fillet' && (f.sweepDeg === undefined || f.sweepDeg <= BLEND_MAX_SWEEP_DEG);
}

/**
 * The undercut evidence on a face. Since Oct 2026 the kernel tests a TWO-HALF tool: a face comes out of the half its
 * normal faces, and is an undercut only when the part blocks its line of release (`blockedAtMm` — how far along it
 * the obstruction is). Blocked faces that touch, or share a blend or a side wall, are one `undercutRegion` — one
 * slide, lifter or core. A payload from the older one-way kernel carries only the angle, and says so.
 */
export function undercutEvidence(f: ManufacturingFeature, tool: string): {
  detail: string; measuredField: string; measuredValue: number; unit: string; thresholdValue: number;
  comparator: GeometricFinding['threshold']['comparator'];
} {
  const faces = f.faceIds.join(', ');
  if (f.blockedAtMm !== undefined) {
    const half = f.releaseHalf === undefined ? 'the half it faces' : `the ${f.releaseHalf > 0 ? '+' : '−'}draw half`;
    return {
      detail: `Face ${faces} comes out toward ${half}, but the part blocks it ${f.blockedAtMm.toFixed(1)} mm along that line `
        + `— it cannot release from either half of the ${tool}`
        + (f.undercutRegion !== undefined ? ` (undercut region ${f.undercutRegion}).` : '.'),
      measuredField: 'blockedAtMm', measuredValue: f.blockedAtMm, unit: 'mm', thresholdValue: 0, comparator: '>',
    };
  }
  const toDraw = 90 + (f.draftDeg ?? 0);
  return {
    detail: `Face ${faces} sits at ${toDraw.toFixed(1)}° to the draw (past 90°) — read by the older one-way test, `
      + 'which cannot tell an undercut from a face on the other half; re-run the analysis.',
    measuredField: 'angleToDrawDeg', measuredValue: toDraw, unit: '°', thresholdValue: 90, comparator: '>',
  };
}

/** Helper so every rule builds a finding the same way, with no field forgotten. */
export function finding(
  rule: GeometricRule,
  f: ManufacturingFeature,
  part: PartContext,
  o: {
    severity: GeoSeverity;
    detail: string;
    measuredField: string;
    measuredValue: number;
    unit: string;
    thresholdValue: number;
    comparator: GeometricFinding['threshold']['comparator'];
    recommendation: string;
  },
): GeometricFinding {
  return {
    ruleId: rule.id,
    commodity: part.commodity,
    severity: o.severity,
    title: rule.title,
    detail: o.detail,
    featureId: f.id,
    faceIds: f.faceIds,
    measured: { field: o.measuredField, value: round(o.measuredValue), unit: o.unit },
    threshold: { value: o.thresholdValue, unit: o.unit, comparator: o.comparator },
    recommendation: o.recommendation,
    source: rule.source,
    ...(f.positionMm ? { positionMm: f.positionMm } : {}),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Result of a full run — findings plus an honest statement of what did NOT run. */
export interface GeometricDFMResult {
  commodity: CommodityType;
  findings: GeometricFinding[];
  rulesEvaluated: number;
  featuresExamined: number;
  /**
   * Checks deliberately skipped, and why. This is not an apology — it is the
   * difference between "no issues found" and "we could not look", and the
   * report prints it next to the findings so nobody reads silence as a pass.
   */
  limitations: string[];
}

/**
 * Run a rule pack over a feature set.
 *
 * Pure, synchronous, no I/O — so it is unit-testable without a kernel, and the
 * same code runs in the browser and in the background worker.
 */
export function runGeometricRules(
  rules: readonly GeometricRule[],
  part: PartContext,
): GeometricDFMResult {
  const findings: GeometricFinding[] = [];
  const limitations: string[] = [];
  const fs = part.featureSet;

  if (!fs?.available) {
    return {
      commodity: part.commodity, findings: [], rulesEvaluated: 0, featuresExamined: 0,
      limitations: [fs?.note || 'Feature extraction did not run — no geometric checks were performed.'],
    };
  }
  if (fs.wallAnalysisValid === false) {
    limitations.push(
      fs.note
      || 'Wall-derived checks (section change, hot spots) were suppressed: on a solid-bodied part '
       + 'single-ray thickness measures the part envelope, not a wall.',
    );
  }
  if (fs.adjacencyAvailable === false) {
    limitations.push('Face adjacency was unavailable, so relational checks (boss-to-wall, '
      + 'fillet-at-junction, section change) did not run.');
  }
  if (!part.materialFamily) {
    limitations.push('No material family was confirmed, so any check whose threshold depends on '
      + 'the alloy or resin did not run.');
  }

  for (const f of fs.features ?? []) {
    for (const rule of rules) {
      if (!rule.appliesTo.includes(f.kind)) continue;
      try {
        const hit = rule.evaluate(f, part);
        if (hit) findings.push(hit);
      } catch {
        // A rule that throws must never take the run down; it simply produced
        // no finding, which is the same outcome as not firing.
      }
    }
  }

  findings.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.ruleId.localeCompare(b.ruleId)
    || a.featureId.localeCompare(b.featureId));

  return {
    commodity: part.commodity,
    findings,
    rulesEvaluated: rules.length,
    featuresExamined: fs.features.length,
    limitations,
  };
}

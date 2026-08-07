/**
 * What a DFM finding is worth, in money.
 *
 * ## Why
 *
 * The rules name a problem and cite a standard. They do not say what it costs,
 * and a review against the benchmark tools put that gap in sharp relief:
 * aPriori's differentiator is a DFM Risk Score tying each issue to
 * manufacturability AND cost; DFMPro — 100+ rules, CAD-resident — does not
 * price findings at all. We are a cost engine and scored zero on the one axis
 * the market leader leads on.
 *
 * "Sharp corner x14" is advice. "Sharp corner x14, +£0.42/part" is a decision.
 *
 * ## The two things a price can mean, and which one is honest
 *
 * A finding can be priced two ways, and conflating them produces nonsense:
 *
 *   **Remedy cost** — what fixing it adds. Only honest where the remedy is
 *   already modelled. `estimateMouldCost` prices side-action slides exactly, so
 *   a moulding undercut can be priced this way to the penny.
 *
 *   **Feature cost** — what the offending feature costs to make. Fully
 *   deterministic wherever `featureMinutesEach` covers the geometry, and it is
 *   the number a cost engineer actually wants: remove or shorten this feature
 *   and you save this much.
 *
 * Every pricer states which it is, in `kind` and in the printable `basis`.
 *
 * ## What is deliberately NOT priced
 *
 * Draft minima, section change, hot spots, rib and boss sink, blown-wall
 * thinning: these are **quality and yield risks**, not modelled costs. Pricing
 * "shrinkage porosity risk" needs a scrap-rate model this engine does not have.
 * They return null and the caller records the reason from `NOT_MODELLED`.
 *
 * That is the point, not a shortfall. Six findings priced honestly, with a
 * stated reason for the other thirteen, is worth more in a supplier meeting
 * than nineteen numbers of mixed provenance. The rule is the same one the
 * measurement layer follows: modelled or silent, never invented.
 */
import type { GeometricFinding, PartContext } from './types.js';
import { featureMinutesEach } from '../feature-machining.js';
import { estimateMouldCost } from '../modules/injection-moulding.js';

/** Where the money comes from. Printed on the finding so it can be argued with. */
export type CostImpactKind =
  /** What the offending feature costs to make — remove it and save this. */
  | 'feature_cost'
  /** What the remedy adds, where the remedy is modelled (e.g. a mould slide). */
  | 'tooling';

export interface FindingCostImpact {
  perPartGBP: number;
  kind: CostImpactKind;
  /** The arithmetic, printable end to end. No figure appears without one. */
  basis: string;
  /**
   * `modelled` — every term came from an engine function or the rate library.
   * `indicative` — a documented default stood in for an unstated input.
   */
  confidence: 'modelled' | 'indicative';
}

/**
 * Rates and volume the pricers need.
 *
 * Resolved once at the job site from the rate library and the region, then
 * passed in — a pricer must never reach for a rate itself, or the DFM number
 * and the costing number become two sources of truth. That is the defect this
 * repo keeps re-learning.
 */
export interface CostContext {
  /** Required for anything amortised. Absent → tooling findings stay unpriced. */
  annualVolume?: number;
  machineRatePerHr?: number;
  labourRatePerHr?: number;
  /** Cavities for the mould estimator. Defaults to 1 and says so. */
  cavities?: number;
}

/** Why a rule has no pricer. Specific per rule — a generic line is not an answer. */
export const NOT_MODELLED: Record<string, string> = {
  'casting.draft.insufficient':
    'Insufficient draft costs die wear and ejection drag. Converting that to £/part needs a '
    + 'die-life-versus-draft model, which this engine does not have.',
  'forging.draft.below-process-minimum':
    'Same as casting: die galling and shortened die life, with no draft term in the die-life model.',
  'moulding.draft.insufficient':
    'Ejector drag marks are a cosmetic reject risk, not a modelled cost.',
  'casting.section.abrupt-change':
    'Solidification shrinkage at a step change is a yield risk. No scrap-rate model exists, and '
    + 'inventing one would put a fabricated number next to measured ones.',
  'casting.hotspot.isolated-heavy-section':
    'Centreline porosity is a yield and rework risk; pricing it needs a scrap-rate model.',
  'casting.fillet.sharp-internal-corner':
    'A sharp corner is a stress raiser and a hot spot — a fatigue and yield risk, not a cost line.',
  'forging.fillet.too-sharp-for-metal-flow':
    'Laps from folded metal are found at inspection. That is a scrap and rework risk with no '
    + 'modelled cost path.',
  'forging.web.below-process-minimum':
    'A web below the route minimum risks non-fill — a scrap risk, not a per-part cost.',
  'moulding.rib.thicker-than-0p6-wall':
    'Sink marks are a cosmetic reject risk. No reject-rate model exists.',
  'moulding.boss.wall-ratio':
    'Boss sink on a show face is a cosmetic reject risk, not a modelled cost.',
  'blow.corner.radius-below-2x-wall':
    'Corner thinning is a burst and drop-test risk; pricing it needs a structural model.',
  'blow.wall.below-minimum':
    'A wall below the floor pinholes and fails top-load — a quality risk, not a cost line.',
  'blow.parison.slenderness-sag':
    'Parison sag drifts wall distribution shot to shot. That is a process-capability risk.',
  'blow.undercut.needs-split-or-insert':
    'A third split or moving insert would be priced by a blow-mould estimator; this engine has '
    + 'a mould-cost model for injection tools only.',
  'casting.undercut.requires-core':
    'A slide or core adds die cost, but the casting die estimator does not price slides '
    + 'separately the way the injection-mould estimator does, so the delta is not derivable.',
  'forging.undercut.cannot-release':
    'The remedy is a post-forging machining operation, but the undercut is a FACE and the kernel '
    + 'measures no volume for what that operation would remove. Pricing it would mean inventing a '
    + 'cut. (An earlier version routed this to the hole pricer, which silently returned nothing '
    + 'because a face carries no diameter — a wrong mapping is worse than an honest gap.)',
  'sheetmetal.hole.deep-relative-to-diameter':
    'This flags a possible mis-classification (formed collar versus punched hole), not a defect '
    + 'with a cost.',
};

/**
 * Four decimal places, not two.
 *
 * A per-part figure is often sub-penny — a slide amortised over 200k parts is
 * £0.0069 — and rounding that to £0.01 or £0.00 either inflates it or makes it
 * read as free. It also compounds: 104 instances rounded individually drift
 * from the true total. The report formats for display; the data keeps the
 * precision.
 */
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Machining cost of a hole or bore, from the same function the costing uses.
 *
 * `featureMinutesEach` is linear in depth and carries no peck-drilling penalty,
 * so this is NOT the extra cost of the hole being deep — it is what the hole
 * costs at all. That is the honest figure available, and the basis says so:
 * shorten or delete the feature and this is what comes back.
 */
function holeFeatureCost(
  f: GeometricFinding, part: PartContext, ctx: CostContext,
): FindingCostImpact | null {
  const { machineRatePerHr: mr, labourRatePerHr: lr } = ctx;
  if (mr === undefined || lr === undefined) return null;
  const feat = part.featureSet.features.find(x => x.id === f.featureId);
  const dia = feat?.diaMm, depth = feat?.depthMm;
  if (!(dia && dia > 0) || !(depth && depth > 0)) return null;

  const minutes = featureMinutesEach({
    kind: 'hole', diaMm: dia, depthMm: depth, through: null, count: 1,
  });
  const gbp = (minutes / 60) * (mr + lr);
  return {
    perPartGBP: round4(gbp),
    kind: 'feature_cost',
    basis: `${minutes.toFixed(2)} min (featureMinutesEach, Ø${dia.toFixed(1)}×${depth.toFixed(0)} mm) `
         + `× £${(mr + lr).toFixed(2)}/h machine+labour. Cost of the feature itself, not of the `
         + 'defect — the cycle model carries no peck-drilling penalty.',
    confidence: 'modelled',
  };
}

/**
 * Side-action tooling for a moulding undercut, amortised.
 *
 * Priced by calling `estimateMouldCost` with and without the slides and taking
 * the difference, so it reconciles to the tool estimate the costing itself
 * would produce. Projected area comes from the measured bounding box; cavities
 * default to 1, which the basis states.
 */
function mouldSlideCost(
  part: PartContext, ctx: CostContext, slideCount: number,
): FindingCostImpact | null {
  const vol = ctx.annualVolume;
  if (!vol || vol <= 0) return null;
  const b = part.bboxMm;
  if (!b) return null;

  // Largest face of the envelope is the projected area a mould must clamp.
  const dims = [b.x, b.y, b.z].sort((p, q) => q - p);
  const projectedAreaCm2 = (dims[0] * dims[1]) / 100;
  const cavities = ctx.cavities ?? 1;
  const common = { cavities, projectedAreaCm2 };

  const withSlides = estimateMouldCost({ ...common, sideActionsLifters: slideCount });
  const without = estimateMouldCost({ ...common, sideActionsLifters: 0 });
  const delta = withSlides.total - without.total;
  if (!(delta > 0)) return null;

  return {
    perPartGBP: round4(delta / vol),
    kind: 'tooling',
    basis: `estimateMouldCost with ${slideCount} slide(s) £${withSlides.total.toFixed(0)} vs `
         + `£${without.total.toFixed(0)} without = £${delta.toFixed(0)}, ÷ ${vol.toLocaleString()} `
         + `parts. Projected area ${projectedAreaCm2.toFixed(0)} cm² from the measured envelope; `
         + `${cavities} cavity assumed.`,
    confidence: ctx.cavities === undefined ? 'indicative' : 'modelled',
  };
}

type Pricer = (f: GeometricFinding, part: PartContext, ctx: CostContext) => FindingCostImpact | null;

/**
 * One pricer per rule id. A rule absent from this map is a lookup miss, not a
 * special case — which is what keeps "we do not price this" an explicit,
 * reviewable decision rather than an oversight.
 */
export const PRICERS: Record<string, Pricer> = {
  'machining.hole.depth-beyond-standard-drill': holeFeatureCost,
  'machining.hole.non-preferred-diameter': holeFeatureCost,
  'sheetmetal.hole.smaller-than-thickness': holeFeatureCost,
  'moulding.undercut.requires-side-action': (_f, part, ctx) => mouldSlideCost(part, ctx, 1),
  'machining.corner.radius-below-economic-cutter': (f, part, ctx) => {
    const { machineRatePerHr: mr, labourRatePerHr: lr } = ctx;
    if (mr === undefined || lr === undefined) return null;
    const feat = part.featureSet.features.find(x => x.id === f.featureId);
    const area = feat?.areaMm2;
    if (!(area && area > 0)) return null;
    // A corner is cut by the same pocket-milling model; price the surrounding
    // pocket pass so the engineer sees what the tight corner is attached to.
    const minutes = featureMinutesEach({
      kind: 'pocket', diaMm: 0, depthMm: Math.max(feat?.radiusMm ?? 1, 1),
      through: null, count: 1, areaMm2: area,
    });
    const gbp = (minutes / 60) * (mr + lr);
    return {
      perPartGBP: round4(gbp),
      kind: 'feature_cost',
      basis: `${minutes.toFixed(2)} min pocket pass (featureMinutesEach, ${area.toFixed(0)} mm²) `
           + `× £${(mr + lr).toFixed(2)}/h. The corner is cut with this pass; a cutter small `
           + 'enough for the radius runs slower than the model assumes.',
      confidence: 'indicative',
    };
  },
};

/**
 * Price a finding, or say why it was not priced.
 *
 * Never returns both. A caller that sees `costNotModelled` must not fall back to
 * a guess — that is the whole discipline.
 */
export function priceFinding(
  f: GeometricFinding, part: PartContext, ctx: CostContext,
): { costImpact?: FindingCostImpact; costNotModelled?: string } {
  const pricer = PRICERS[f.ruleId];
  if (!pricer) {
    return { costNotModelled: NOT_MODELLED[f.ruleId]
      ?? 'No cost path is modelled for this rule.' };
  }
  try {
    const hit = pricer(f, part, ctx);
    if (hit) return { costImpact: hit };
  } catch {
    // A pricer that throws must never take the analysis down.
  }
  // A pricer that exists but could not run: say which input was missing, so the
  // gap is fixable rather than mysterious.
  const missing: string[] = [];
  if (ctx.machineRatePerHr === undefined || ctx.labourRatePerHr === undefined) {
    missing.push('machine and labour rates');
  }
  if (!ctx.annualVolume) missing.push('annual volume (tooling cannot be amortised)');
  return {
    costNotModelled: missing.length
      ? `Cost path exists but ${missing.join(' and ')} were not supplied.`
      : 'Cost path exists but the measured inputs it needs were absent on this feature.',
  };
}

/** Sum priced findings. Uncosted ones contribute nothing and are not guessed at. */
export function totalCostGBP(findings: readonly GeometricFinding[]): number {
  return round4(findings.reduce((a, f) => a + (f.costImpact?.perPartGBP ?? 0), 0));
}

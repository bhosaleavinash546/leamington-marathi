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
import { featureMinutesEach, nearNetHoleMinutes } from '../feature-machining.js';
import { coredAbove } from './commodities/machining.js';
import { CUTTING_DATA } from '../machining-time.js';
import { estimateMouldCost } from '../modules/injection-moulding.js';
import { priceHoleSizes } from './commodities/machining-access.js';

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
  /**
   * Findings that share a group share ONE cost: every blocked face of an undercut region is the same slide, so the
   * region's slide is counted once however many faces point at it (`totalCostGBP`).
   */
  costGroup?: string;
  /** Tooling: the one-off NRE `perPartGBP` was amortised from — what a redesign takes off the tool. */
  nreGBP?: number;
  /**
   * Time findings: the machine minutes per part the feature costs IN THE COSTING'S OWN TIME MODEL
   * (`featureMinutesEach` × the metal's time factor). Design to Cost removes these minutes from the costed operation,
   * so the saving is priced at that operation's own machine, labour, crew and OEE — never at the reference rates
   * `perPartGBP` uses for the job's stand-alone line (arithmetic audit, Oct 2026).
   */
  minutes?: number;
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
  /** Manufacturing engineer £/h — CAM programming per fixturing, as the costing prices it. */
  engineerRatePerHr?: number;
  /** Part mass, kg — handling per fixturing follows it (handlingMinPerFixturing), as in the costing. */
  partWeightKg?: number;
  /** Cutting-time factor of the confirmed metal against aluminium (CUTTING_DATA) — 1 when no family is confirmed. */
  timeFactor?: number;
  /** The kernel's silhouette along the draw, cm² — the area the costing sizes a mould on. */
  projectedAreaCm2?: number;
  /** Names the reference machine / labour the stand-alone £ uses, printed in every basis. */
  rateBasis?: string;
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
  'machining.hole.compound-angle':
    'An off-frame hole is a fixturing of its own on a 3-axis machine; that fixturing is priced once, in the '
    + '"several setups" finding, rather than again here.',
  'machining.hole.intersecting':
    'Cross-hole deburring (tool, brush, thermal or ECM) is not an operation in the machining model, so its '
    + 'time is not derivable here.',
  'machining.feature.toothed-form':
    'Tooth cutting is costed on the gear route (hob / shape / broach time per tooth), not as a DFM delta on the '
    + 'machining cost.',
  'machining.corner.long-reach-cutter':
    'The machining model has no feed derating for cutter reach, so the slower long-series cutter is not '
    + 'priced; the corner\'s pocket pass is in the cost either way.',
  'moulding.hole.core-pin-slender':
    'A slender core pin costs cycle time (it must cool) and pin breakage; neither is a term in the mould or '
    + 'cycle model, so the delta is not derivable.',
  'machining.corner.radius-below-economic-cutter':
    'The costing finishes walls by area and has no per-corner pass or small-cutter feed derate, so a tight corner '
    + 'adds no time in the cost model; a £ here would be invented (arithmetic audit, Oct 2026).',
  'machining.setup.access-directions':
    'The costing prices its OWN fixturing count from its routing (the "Load / clamp / unload" line and the fixture '
    + 'NRE). This finding states the directions the measured features are reached from; compare the two on the cost '
    + 'sheet. It carried a separate £ at reference rates that disagreed with the costing\u2019s count.',
  'machining.hole.non-preferred-diameter':
    'Moving to the nearest stock size still leaves a distinct size, so the costing\u2019s tool count does not change '
    + 'unless the new size is one the part already uses — that saving is the hole-size consolidation finding.',
  'casting.hole.beyond-cored-depth':
    'A routing correction, not a design saving: the cost sheet prices holes above the cored size as cored and '
    + 'finish-bored; this one is too deep to core and will be drilled from solid. The finding states both times.',
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
  // The costing's own per-hole time: through / blind from the kernel, the peck allowance past 5×D included, × the
  // confirmed metal's cutting-time factor.
  const through = feat?.openEnds === 2 ? true : feat?.openEnds === 1 ? false : null;
  const tf = ctx.timeFactor ?? 1;
  const row = { kind: 'hole' as const, diaMm: dia, depthMm: depth, through, count: 1 };
  // On a casting the costing prices a hole above the cored size as cored + finish-bored, not drilled from solid — the
  // time it charges is the time a lever may take out (arithmetic audit, Oct 2026).
  const cast = part.commodity === 'cast_and_machine' || part.commodity === 'casting';
  const minutes = (cast ? nearNetHoleMinutes(row, coredAbove(part.process)) : featureMinutesEach(row)) * tf;
  const gbp = (minutes / 60) * (mr + lr);
  return {
    perPartGBP: round4(gbp),
    minutes: round4(minutes),
    kind: 'feature_cost',
    basis: `${minutes.toFixed(2)} min (the costing\u2019s hole time, Ø${dia.toFixed(1)}×${depth.toFixed(0)} mm`
         + `${through === null ? '' : through ? ' through' : ' blind'}, peck allowance past 5×D${tf !== 1 ? `, × ${tf} metal time factor` : ''}) `
         + `× £${(mr + lr).toFixed(2)}/h ${ctx.rateBasis ?? 'reference machine + labour'}. What the hole costs to make at all: `
         + 'deleting it recovers this, shortening it recovers part.',
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

  // The kernel's silhouette along the draw — the area the costing sizes the mould on; the envelope's two largest
  // sides only when the silhouette was not measured (said so in the basis).
  const dims = [b.x, b.y, b.z].sort((p, q) => q - p);
  const measured = ctx.projectedAreaCm2 !== undefined && ctx.projectedAreaCm2 > 0;
  const projectedAreaCm2 = measured ? (ctx.projectedAreaCm2 as number) : (dims[0] * dims[1]) / 100;
  const cavities = ctx.cavities ?? 1;
  const common = { cavities, projectedAreaCm2 };

  const withSlides = estimateMouldCost({ ...common, sideActionsLifters: slideCount });
  const without = estimateMouldCost({ ...common, sideActionsLifters: 0 });
  const delta = withSlides.total - without.total;
  if (!(delta > 0)) return null;

  return {
    perPartGBP: round4(delta / vol),
    nreGBP: Math.round(delta),
    kind: 'tooling',
    basis: `estimateMouldCost with ${slideCount} slide(s) £${withSlides.total.toFixed(0)} vs `
         + `£${without.total.toFixed(0)} without = £${delta.toFixed(0)}, ÷ ${vol.toLocaleString()} `
         + `parts. Projected area ${projectedAreaCm2.toFixed(0)} cm² ${measured ? '(measured silhouette along the draw)' : 'from the envelope (silhouette not measured)'}; `
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
  // the sheet prices the hole as pierced in the die; one smaller than the gauge is drilled after — a cost to ADD
  'sheetmetal.hole.smaller-than-thickness': holeFeatureCost,
  // One slide per undercut REGION (blocked faces the kernel joined), not per face: a five-face snap-fit pocket is
  // one slide. A payload with no region (older kernel) prices per face, as before.
  'moulding.undercut.requires-side-action': (f, part, ctx) => {
    const c = mouldSlideCost(part, ctx, 1);
    const region = part.featureSet.features.find(x => x.id === f.featureId)?.undercutRegion;
    return c && region !== undefined ? { ...c, costGroup: `slide:${region}`, basis: `${c.basis} One slide for undercut region ${region}.` } : c;
  },
  'machining.hole.many-sizes': (f, _part, ctx) => priceHoleSizes(f, ctx),

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
  // A feature's own cost ("what this hole costs to make") is counted ONCE however many rules point at it — a
  // deep, non-standard, uncoreable hole used to add its drilling cost three times.
  const featureCost = new Map<string, number>();
  const grouped = new Map<string, number>();          // costGroup → one cost (a region's slide)
  let other = 0;
  for (const f of findings) {
    const c = f.costImpact;
    if (!c) continue;
    if (c.costGroup) {
      grouped.set(c.costGroup, Math.max(grouped.get(c.costGroup) ?? 0, c.perPartGBP));
    } else if (c.kind === 'feature_cost' && !f.featureId.startsWith('PART:')) {
      featureCost.set(f.featureId, Math.max(featureCost.get(f.featureId) ?? 0, c.perPartGBP));
    } else other += c.perPartGBP;
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return round4(other + sum(featureCost) + sum(grouped));
}

/** Typical density by the engineer's material family, g/cm³ — first keyword match wins (stainless before steel). */
const FAMILY_DENSITY: Array<[RegExp, number]> = [
  [/stainless/i, 7.9], [/cast iron|ductile|grey iron|\biron\b/i, 7.1], [/steel/i, 7.85], [/alumin/i, 2.7],
  [/magnes/i, 1.8], [/titan/i, 4.43], [/zinc/i, 6.6], [/nickel/i, 8.2], [/copper|brass|bronze/i, 8.5],
];

/**
 * The part's weight for the handling time (`handlingMinPerFixturing`): measured volume × the CONFIRMED family's
 * density. No family → undefined, and the setup pricer states its default instead (measured or silent).
 */
export function partWeightKgFor(materialFamily: string | undefined, volumeCm3: number | undefined): number | undefined {
  if (!materialFamily || !(volumeCm3 && volumeCm3 > 0)) return undefined;
  const rho = FAMILY_DENSITY.find(([re]) => re.test(materialFamily))?.[1];
  return rho ? Math.round(volumeCm3 * rho) / 1000 : undefined;
}

/** The confirmed family's cutting-time factor against aluminium (CUTTING_DATA) — 1 when none is confirmed. */
export function timeFactorFor(materialFamily: string | undefined): number {
  if (!materialFamily) return 1;
  const f = materialFamily.toLowerCase();
  const key = /stainless|steel/.test(f) ? 'steel' : /cast iron|ductile|grey iron|\biron\b/.test(f) ? 'cast iron'
    : /titan/.test(f) ? 'titanium' : /magnes/.test(f) ? 'magnesium' : /copper|brass|bronze/.test(f) ? 'copper alloy'
    : /zinc/.test(f) ? 'zinc' : /alumin/.test(f) ? 'aluminium' : /plastic|polymer|nylon|pa\d|pom|abs/.test(f) ? 'plastic' : null;
  return key ? (CUTTING_DATA as Record<string, { timeFactor: number }>)[key]?.timeFactor ?? 1 : 1;
}

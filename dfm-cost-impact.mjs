// ─────────────────────────────────────────────────────────────────────────────
// Cost consequence of a DFM finding — computed by the EXISTING engines.
//
// A finding without a number is an opinion. This module turns each one into a
// piece-price delta by re-running the same deterministic engines the rest of the
// app uses, once with the geometry as drawn and once with the rule satisfied,
// and reporting the difference.
//
// THE HONESTY RULE IS THE POINT. A finding is priced only when the engines
// actually model the driver behind it. Where they do not — draft angle, undercut
// count, corner radii, the sheet-metal rules — the finding comes back
// `priced: false` with the reason, and the report prints that instead of a
// number. Several of those carry an industry cost RANGE from the literature; it
// is passed through explicitly labelled as an external guideline so nobody can
// mistake a citation for an engine result.
//
// Every delta is per part, in the engine's native EUR. Conversion to the display
// currency happens at the UI boundary via fx-rates.mjs, never in here.
// ─────────────────────────────────────────────────────────────────────────────
import { computeShouldCost } from './costing-engine.mjs';
import { featuredMachiningCost } from './machining-feature-cost.mjs';

const round2 = n => Math.round(n * 100) / 100;

/**
 * Per-rule pricers. Each returns a delta object or null when it cannot price
 * this particular part. Returning null is a normal outcome, not an error.
 */
const PRICERS = {
  // Wall thickness drives the cooling-limited cycle in computeShouldCost
  // (cycle = base + k·wall²), so a thick-wall finding has a real, modelled cost.
  'im-wall-thickness-range': priceWallThickness,
  'hpdc-wall-thickness-range': priceWallThickness,

  // Setups are a first-class driver of featuredMachiningCost.
  'mach-setup-count': priceSetupCount,
};

/** Cost impact of bringing an out-of-range wall back into the process band. */
function priceWallThickness(finding, ctx) {
  const { material, process, region, annualVolume, weightKg, library } = ctx;
  const measured = Number(finding.measured);
  const [lo, hi] = finding.threshold;
  if (!material || !process || !(weightKg > 0) || !Number.isFinite(measured)) return null;
  // Target the nearest edge of the acceptable band — the smallest change that
  // clears the rule, not the most flattering one.
  const target = measured > hi ? hi : measured < lo ? lo : null;
  if (target === null) return null;

  const base = { material, process, region, annualVolume, weightKg };
  let asDrawn, improved;
  try {
    asDrawn = computeShouldCost({ ...base, wallThicknessMm: measured }, {}, null, library);
    // A thinner wall is also a lighter part; scaling mass by the thickness ratio
    // is the honest first-order consequence of the same change.
    improved = computeShouldCost(
      { ...base, weightKg: weightKg * (target / measured), wallThicknessMm: target },
      {}, null, library);
  } catch {
    return null;
  }
  return {
    priced: true,
    basis: 'computeShouldCost — cooling-limited cycle (base + k·wall²) and the mass change that comes with it',
    changeDescription: `wall ${measured} mm → ${target} mm`,
    asDrawnEur: round2(asDrawn.totalShouldCost),
    improvedEur: round2(improved.totalShouldCost),
    deltaEur: round2(asDrawn.totalShouldCost - improved.totalShouldCost),
    annualDeltaEur: annualVolume ? round2((asDrawn.totalShouldCost - improved.totalShouldCost) * annualVolume) : null,
  };
}

/** Cost impact of consolidating machining setups. */
function priceSetupCount(finding, ctx) {
  const { material, region, annualVolume, geometry, library, toleranceClass, surfaceFinish } = ctx;
  const measured = Number(finding.measured);
  const target = Number(finding.threshold);
  if (!material || !geometry?.partVolumeCm3 || !Number.isFinite(measured) || measured <= target) return null;

  const batch = Math.max(50, Math.min(5000, Math.round((annualVolume || 50000) / 250)));
  const run = setupCount => featuredMachiningCost({
    geometry: { ...geometry, setupCount },
    material, region, annualVolume, batch, toleranceClass, surfaceFinish,
  }, library);

  let asDrawn, improved;
  try {
    asDrawn = run(measured);
    improved = run(target);
  } catch {
    return null;
  }
  return {
    priced: true,
    basis: 'featuredMachiningCost — setup time amortised over the batch',
    changeDescription: `${measured} setups → ${target}`,
    asDrawnEur: round2(asDrawn.totalShouldCost),
    improvedEur: round2(improved.totalShouldCost),
    deltaEur: round2(asDrawn.totalShouldCost - improved.totalShouldCost),
    annualDeltaEur: annualVolume ? round2((asDrawn.totalShouldCost - improved.totalShouldCost) * annualVolume) : null,
  };
}

/**
 * Findings the engines cannot price, with the reason and — where the literature
 * gives one — an explicitly external cost range.
 *
 * These are labelled, not hidden. A reader needs to know the difference between
 * "the engine says this costs nothing" and "the engine has no way to tell".
 */
const UNPRICED_REASON = {
  'im-undercuts': {
    reason: 'Tooling impact of a side action is not a modelled cost driver in the piece-price engines.',
    externalGuideline: 'Industry guidance puts a side action, lifter or collapsible core at roughly $500–$5,000 of tooling per feature. Cited literature, NOT an engine result — confirm with your toolmaker.',
  },
  'hpdc-undercuts': {
    reason: 'Slide and loose-core tooling is quoted by the diemaker; the piece-price engines do not model it.',
    externalGuideline: 'Treat as a die-cost adder plus a possible manual core-handling step per shot. Supplier quotation item.',
  },
  'im-draft-minimum': {
    reason: 'Draft affects ejection force, scrap rate and tool wear — none of which the piece-price engines model.',
  },
  'hpdc-draft-minimum': {
    reason: 'Insufficient draft shortens die life through galling; die life is a tooling-amortisation input, not a geometric one the engine derives.',
  },
  'im-wall-uniformity': {
    reason: 'Warp and sink risk are simulation outputs (mould-flow), not piece-price drivers.',
  },
  'mach-internal-corner-radius': {
    reason: 'Tool-diameter selection is not exposed as an input to the machining engine, so the cycle-time effect cannot be isolated.',
  },
  'hpdc-internal-radius': {
    reason: 'Fillet radius affects die heat-checking life rather than piece price.',
  },
  'mach-thin-web': {
    reason: 'Deflection-driven extra finishing passes are not modelled; the engine cycles on volume and surface area.',
  },
  'mach-pocket-depth-ratio': {
    reason: 'The recogniser does not yet report pocket depth and width, so there is nothing to re-cost.',
  },
};

/**
 * Attach a cost consequence to every finding.
 *
 * @param {object[]} findings  from runDfmRules()
 * @param {object} ctx  { material, process, region, annualVolume, weightKg, geometry, library, toleranceClass, surfaceFinish }
 */
export function priceFindings(findings, ctx = {}) {
  return (findings || []).map(f => {
    const pricer = PRICERS[f.id];
    let cost = null;
    if (pricer) {
      try {
        cost = pricer(f, ctx);
      } catch {
        cost = null;
      }
    }
    if (cost) return { ...f, cost };
    const known = UNPRICED_REASON[f.id];
    return {
      ...f,
      cost: {
        priced: false,
        reason: known?.reason
          || 'No modelled cost driver connects this finding to the piece-price engines.',
        ...(known?.externalGuideline ? { externalGuideline: known.externalGuideline } : {}),
      },
    };
  });
}

/** Total of the deltas the engines could actually compute. */
export function summarisePricedImpact(pricedFindings) {
  const priced = (pricedFindings || []).filter(f => f.cost?.priced);
  const unpriced = (pricedFindings || []).filter(f => !f.cost?.priced);
  const perPart = priced.reduce((s, f) => s + (f.cost.deltaEur || 0), 0);
  const annual = priced.reduce((s, f) => s + (f.cost.annualDeltaEur || 0), 0);
  return {
    pricedCount: priced.length,
    unpricedCount: unpriced.length,
    perPartEur: round2(perPart),
    annualEur: round2(annual),
    // Stated so the total is never read as the whole opportunity. Findings the
    // engines cannot price may well be the expensive ones — undercuts in
    // particular buy tooling, not piece price.
    caveat: unpriced.length
      ? `${unpriced.length} of ${pricedFindings.length} findings could not be priced by the engines; the total below excludes them.`
      : null,
  };
}

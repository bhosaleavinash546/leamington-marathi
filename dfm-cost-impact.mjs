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
import { stampingFeatureCost } from './stamping-feature-cost.mjs';

const round2 = n => Math.round(n * 100) / 100;

//: Below this mass ratio the "saving" implies a redesign so aggressive that the
//: figure is a ceiling rather than a forecast, and it is labelled as one.
const DRASTIC_MASS_RATIO = 0.6;

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

  // An over-thick rib is material, and material is a modelled driver. The
  // recogniser measures each rib's thickness, height and length, so the volume
  // that comes off when it is thinned to the guideline is arithmetic, not a
  // guess — and computeShouldCost prices the lighter part.
  'im-rib-thickness-max': priceRibThickness,
  'hpdc-rib-thickness-max': priceRibThickness,

  // A tight bend radius does not change piece price by itself, but the BEND
  // COUNT it belongs to does — stampingFeatureCost prices forming per bend, and
  // until bend recognition existed it was called with its default of 2 on every
  // part, or not called at all. This is the first finding whose cost comes from
  // that engine.
  'sm-bend-radius': priceBendCount,
};

/**
 * Cost of the forming content the recognised bends imply, against a flat blank.
 * Not a "saving" — a bend cannot be deleted without changing the design — so it
 * is reported as the forming CONTENT the current design carries, which is what a
 * designer trades away when they flatten a feature.
 */
function priceBendCount(finding, ctx) {
  const { material, region, annualVolume, geometry, library, sheet } = ctx;
  if (!material || !geometry?.partVolumeCm3 || !sheet?.bendCount) return null;
  const run = bends => stampingFeatureCost({
    geometry: { ...geometry, thicknessMm: sheet.thicknessMm },
    material, region, annualVolume, bends,
  }, library);
  let asDrawn, flat;
  try {
    asDrawn = run(sheet.bendCount);
    flat = run(0);
  } catch {
    return null;
  }
  return {
    priced: true,
    basis: 'stampingFeatureCost — forming tonnage and station count from the recognised bend count',
    changeDescription: `${sheet.bendCount} bend${sheet.bendCount === 1 ? '' : 's'} vs a flat blank`,
    asDrawnEur: round2(asDrawn.totalShouldCost),
    improvedEur: round2(flat.totalShouldCost),
    deltaEur: round2(asDrawn.totalShouldCost - flat.totalShouldCost),
    annualDeltaEur: annualVolume ? round2((asDrawn.totalShouldCost - flat.totalShouldCost) * annualVolume) : null,
  };
}

/**
 * Material saved by thinning every over-thick rib to the guideline.
 *
 * The volume removed is `(t - t_target) * height * length` per rib, summed —
 * every term measured by the recogniser. That volume is converted to a mass
 * fraction of the whole part and the part is re-costed, so the delta is the
 * MATERIAL consequence only. The cycle term is deliberately held constant by
 * passing the same nominal wall to both runs: a rib does not drive the
 * cooling-limited cycle, the wall does, and letting it move here would credit
 * the change with a saving the physics does not support.
 *
 * Sink marks and porosity — the reasons the rule exists — are quality outcomes
 * the piece-price engines do not model. This prices the part of the finding they
 * DO model and says so in `basis`, rather than implying the number is the whole
 * value of fixing it.
 */
function priceRibThickness(finding, ctx) {
  const { material, process, region, annualVolume, weightKg, geometry, library,
    ribs, nominalWallMm } = ctx;
  const limit = Number(finding.threshold);
  const partCm3 = Number(geometry?.partVolumeCm3);
  if (!material || !process || !(weightKg > 0) || !Array.isArray(ribs) || !ribs.length
    || !(nominalWallMm > 0) || !Number.isFinite(limit) || !(partCm3 > 0)) return null;

  const target = limit * nominalWallMm;
  let savedMm3 = 0;
  let thinned = 0;
  for (const r of ribs) {
    const t = Number(r.thicknessMm), h = Number(r.heightMm), L = Number(r.lengthMm);
    if (!(t > target) || !(h > 0) || !(L > 0)) continue;
    savedMm3 += (t - target) * h * L;
    thinned += 1;
  }
  const savedCm3 = savedMm3 / 1000;
  if (!(savedCm3 > 0) || savedCm3 >= partCm3) return null;

  const base = { material, process, region, annualVolume, wallThicknessMm: nominalWallMm };
  let asDrawn, improved;
  try {
    asDrawn = computeShouldCost({ ...base, weightKg }, {}, null, library);
    improved = computeShouldCost(
      { ...base, weightKg: weightKg * ((partCm3 - savedCm3) / partCm3) }, {}, null, library);
  } catch {
    return null;
  }
  return {
    priced: true,
    basis: 'computeShouldCost — material only, from the rib volume the recogniser measured. Sink and porosity risk are quality outcomes the piece-price engines do not model, so they are not in this number.',
    changeDescription: `${thinned} rib${thinned === 1 ? '' : 's'} thinned to ${round2(target)} mm — ${round2(savedCm3)} cm3 of material`,
    asDrawnEur: round2(asDrawn.totalShouldCost),
    improvedEur: round2(improved.totalShouldCost),
    deltaEur: round2(asDrawn.totalShouldCost - improved.totalShouldCost),
    annualDeltaEur: annualVolume ? round2((asDrawn.totalShouldCost - improved.totalShouldCost) * annualVolume) : null,
  };
}

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
  // HOW BIG A CHANGE IS THIS, REALLY? The mass is scaled by the thickness ratio,
  // which is the right first-order physics for coring a section out — but on a
  // real die-cast bracket measuring a 15.84 mm median wall, bringing it to
  // 3.5 mm implies removing 78% of the part's mass, and the engine happily
  // prices that at EUR 411,000/yr. The arithmetic is correct and the conclusion
  // is not: nobody cores a structural bracket down to nothing.
  //
  // The finding stands — that wall IS out of band — but the figure has to be
  // labelled as the CEILING it is, reached only if the whole section can be
  // cored to the nominal wall. A number a director will remember must not
  // quietly assume the most flattering redesign in existence.
  const massRatio = target / measured;
  const drastic = massRatio < DRASTIC_MASS_RATIO;
  return {
    priced: true,
    basis: 'computeShouldCost — cooling-limited cycle (base + k·wall²) and the mass change that comes with it',
    changeDescription: `wall ${measured} mm → ${target} mm`,
    asDrawnEur: round2(asDrawn.totalShouldCost),
    improvedEur: round2(improved.totalShouldCost),
    deltaEur: round2(asDrawn.totalShouldCost - improved.totalShouldCost),
    annualDeltaEur: annualVolume ? round2((asDrawn.totalShouldCost - improved.totalShouldCost) * annualVolume) : null,
    ...(drastic ? {
      upperBound: true,
      caveat: `This is a CEILING, not a forecast. Reaching ${target} mm means removing `
        + `${Math.round((1 - massRatio) * 100)}% of the part's mass, which assumes the heavy `
        + 'sections can be cored out to the nominal wall throughout. A structural part will '
        + 'recover only the fraction its loads allow — take this figure to a casting engineer '
        + 'as the size of the prize, not as a committed saving.',
    } : {}),
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
  'im-rib-thickness-min': {
    reason: 'A rib too thin to fill costs a short shot, not a piece price. Scrap rate is a process outcome the engines do not model.',
  },
  'hpdc-rib-thickness-min': {
    reason: 'A cold shut at a rib tip is a scrap and warranty risk, not a modelled piece-price driver.',
  },
  'im-rib-height': {
    reason: 'Thinning a tall rib saves no material — shortening it does, but that is a stiffness decision, not a DFM substitution the engine can make on your behalf.',
  },
  'hpdc-rib-height': {
    reason: 'Deep ribs drive die life and die maintenance, which are tooling-amortisation inputs rather than geometry the piece-price engines derive.',
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

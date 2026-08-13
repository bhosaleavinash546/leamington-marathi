/**
 * Surface treatment — the costs a line's machine rate does NOT already contain.
 *
 * ## What this deliberately does not compute, and why
 *
 * A first version of this file built a full line rate: stage energy + labour +
 * capital annuity + maintenance + overhead, per hour. That was wrong, and
 * checking `paint-line-std` in the rate library is what caught it —
 *
 *     depreciation 120k + maintenance 50k + ENERGY 80k + floor 40k
 *     + indirect 30k + finance 15k, over 4000 h x 0.82  =  £102/hr
 *
 * The line's energy, capital, maintenance and overhead are ALREADY in that
 * build-up. £80k/yr against ~580 kW of installed oven and tank load for 3,280
 * productive hours is a gas-fired line, and it reconciles. Adding a second
 * energy-and-capital chain on top would have double-counted roughly a third of
 * the conversion cost while looking like a refinement.
 *
 * The supplied workbook has the same trap in a different form and is candid
 * about it: it costs every process as a STANDALONE line with its own overhead,
 * capital envelope and permit, then subtracts a 25-35% "integrated-line credit"
 * to undo the double-count that creates. We do not import that structure. We
 * cost line time ONCE against a machine rate, so there is nothing to credit
 * back — and a model that needs a correction factor to cancel its own error is
 * a model with two numbers to get wrong instead of one.
 *
 * So this module supplies only what the machine rate genuinely cannot express:
 *
 *   1. **Throughput from rack density.** `partsPerHour = partsPerRack x
 *      racksPerHour`. The machine rate is per HOUR; what turns it into a cost
 *      per part is how many parts went down the line in that hour, and the old
 *      model took that as one unexamined number. Measured, halving it moved the
 *      part 55%. A line charges by the carrier, not by the part.
 *   2. **Chemistry and effluent**, on the stage's own basis — per m² of wetted
 *      area, per kg through a kettle or bowl, or per masked piece.
 *   3. **Deposited metal**, a live pass-through split out from conversion cost.
 *   4. **Masking labour**, in operator-seconds per part.
 *
 * Plus the plating physics: deposit thickness sets dwell, and on a hoist line
 * one load occupies the tank, so thickness caps throughput.
 *
 * Pure arithmetic on library data — no I/O, no AI.
 */
import { REGIONAL_DATA, surfaceFactors, type ManufacturingRegion } from './regional-rates.js';
import {
  findSurfaceStage, PLATING_DEPOSIT_UM_PER_MIN, REFERENCE_DEPOSIT_UM, SURFACE_METAL_PRICES,
  type SurfaceStage,
} from './surface-treatment-data.js';

export interface SurfaceTreatmentOptions {
  /** Stage keys in process order. See `STANDARD_PAINT_LINE_STAGES`. */
  stages: string[];
  /** Treated area of ONE part, m² — measured from CAD where possible. */
  surfaceAreaM2: number;
  /**
   * Part mass, kg. REQUIRED when the route contains a mass-basis stage (shot
   * blast, mass finishing, galvanising, impregnation, H2 bake) — those are
   * charged by the kettle or bowl, not by area.
   */
  massKg?: number;
  /**
   * Parts on one rack, hook or barrel. THE lever: it divides every time-based
   * cost the machine rate produces. Absent means 1, which is the honest reading
   * of "we do not know how this part racks" and is deliberately pessimistic.
   */
  partsPerRack?: number;
  /** Racks through the line per hour. */
  racksPerHour?: number;
  /** Deposit thickness override for plating stages, micron. */
  depositThicknessUm?: number;
  /** How many times a piece-basis stage is applied — masked features per part. */
  maskedFeatures?: number;
  /** Purge and scrapped paint at a colour change, and parts between changes. */
  colourChangeCostGBP?: number;
  partsPerColourRun?: number;
  region?: string;
}

export interface SurfaceStageCost {
  id: string;
  label: string;
  basis: string;
  chemistry: number;
  effluent: number;
  depositedMetal: number;
  dwellMinutes: number;
}

export interface SurfaceTreatmentBreakdown {
  region: string;
  stageIds: string[];
  /** Parts down the line per hour — this divides the MACHINE RATE elsewhere. */
  partsPerHour: number;
  partsPerRack: number;
  racksPerHour: number;
  /** Line cycle time per part, hours. Feed this to the operation. */
  cycleTimeHr: number;
  /** GBP per part, none of which is in any machine rate. */
  chemistryPerPart: number;
  effluentPerPart: number;
  /** Zinc, nickel and the rest — a pass-through, not conversion cost. */
  depositedMetalPerPart: number;
  maskingLabourPerPart: number;
  maskingSeconds: number;
  colourChangePerPart: number;
  /** Everything this module adds. */
  addersPerPart: number;
  totalDwellMinutes: number;
  /** Ceiling from the slowest one-load-at-a-time stage; Infinity if none. */
  maxRacksPerHourFromDwell: number;
  throughputCappedBy: string | null;
  perStage: SurfaceStageCost[];
  basis: string;
}

/**
 * Dwell for a plating stage at the requested deposit thickness.
 *
 * LINEAR in thickness, unlike carburising's square law — plating deposits at a
 * roughly constant rate set by current density, so 16 µm takes twice as long as
 * 8, not four times. Applying the diffusion square law here would over-cost a
 * thick deposit badly, so the distinction is worth stating.
 */
export function platingDwellMinutes(stage: SurfaceStage, thicknessUm?: number): number {
  const base = stage.dwellMinutes.value;
  if (stage.kind !== 'plating' || !thicknessUm || thicknessUm <= 0) return base;
  const key = Object.keys(PLATING_DEPOSIT_UM_PER_MIN)
    .find(k => findSurfaceStage(k) === stage);
  const rate = key ? PLATING_DEPOSIT_UM_PER_MIN[key] : undefined;
  return rate ? thicknessUm / rate.value : base * (thicknessUm / REFERENCE_DEPOSIT_UM);
}

/**
 * Deposited metal for one part, GBP.
 *
 * ALWAYS scaled by AREA, even when the stage is charged by mass. This is the
 * single most important asymmetry in the commodity: a galvanising kettle sets
 * throughput in tonnes per hour, but the zinc that ends up on the part is set by
 * its surface. It is why hot dip galvanising is quoted per tonne and yet costs
 * far more per tonne on thin sections than on heavy ones — and why a per-kg
 * coating rate with no stated product form is meaningless.
 */
export function depositedMetalCost(
  stage: SurfaceStage, areaM2: number, thicknessOverrideUm?: number,
): number {
  const d = stage.deposit;
  if (!d) return 0;
  const thicknessUm = stage.kind === 'plating' && thicknessOverrideUm && thicknessOverrideUm > 0
    ? thicknessOverrideUm
    : d.thicknessUm.value;
  const price = SURFACE_METAL_PRICES[d.metal];
  if (!price) return 0;
  const volumeM3 = areaM2 * (thicknessUm * 1e-6);
  const massKg = volumeM3 * d.densityKgPerM3.value;
  return (massKg / Math.max(0.01, d.efficiency.value)) * price.value;
}

/**
 * Throughput and the per-part costs no machine rate carries.
 *
 * Throws on an unknown stage rather than skipping it: a silently dropped stage
 * makes the part cheaper with nothing on the record to say why.
 */
export function computeSurfaceTreatment(
  opts: SurfaceTreatmentOptions,
): SurfaceTreatmentBreakdown {
  const region = opts.region ?? 'UK';
  const r = REGIONAL_DATA[region as ManufacturingRegion] ?? REGIONAL_DATA.UK;
  const sf = surfaceFactors(region);

  const stages = opts.stages.map(key => {
    const s = findSurfaceStage(key);
    if (!s) {
      throw new Error(
        `No surface-treatment stage "${key}" in the library. Add it to `
        + 'surface-treatment-data.ts rather than dropping it from the route.');
    }
    return s;
  });

  // A mass-basis stage has nothing to charge against without a part mass, and
  // guessing one would silently zero out the whole operation.
  const massStages = stages.filter(s => s.basis === 'mass');
  if (massStages.length > 0 && !(opts.massKg && opts.massKg > 0)) {
    throw new Error(
      `Route contains mass-basis stage(s) ${massStages.map(s => s.label).join(', ')}, which are `
      + 'charged per kg through a kettle or bowl, but no part mass was supplied. Costing them '
      + 'as zero would hide the operation entirely.');
  }
  const massKg = opts.massKg ?? 0;

  const partsPerRack = Math.max(1, opts.partsPerRack ?? 1);
  const requestedRacks = Math.max(0.01, opts.racksPerHour ?? 1);

  // A one-load-at-a-time stage caps the line however fast the conveyor runs.
  // This is what makes deposit thickness cost money: 25 µm at 0.4 µm/min holds
  // the tank for over an hour, so the line runs under one rack an hour. Without
  // it, thickness changed the printed dwell and nothing else.
  let maxRacksPerHourFromDwell = Infinity;
  let limiter: SurfaceStage | null = null;
  for (const st of stages) {
    if (!st.throughputLimiting) continue;
    const dwell = platingDwellMinutes(st, opts.depositThicknessUm);
    if (dwell <= 0) continue;
    const cap = 60 / dwell;
    if (cap < maxRacksPerHourFromDwell) { maxRacksPerHourFromDwell = cap; limiter = st; }
  }
  const capped = requestedRacks > maxRacksPerHourFromDwell;
  const racksPerHour = capped ? maxRacksPerHourFromDwell : requestedRacks;
  const throughputCappedBy = capped && limiter
    ? `${limiter.label} holds one load for `
      + `${platingDwellMinutes(limiter, opts.depositThicknessUm).toFixed(0)} min, so the line `
      + `cannot exceed ${maxRacksPerHourFromDwell.toFixed(2)} racks/h `
      + `(${requestedRacks} requested)`
    : null;

  const partsPerHour = partsPerRack * racksPerHour;
  const cycleTimeHr = 1 / partsPerHour;

  // Chemistry is consumed by the part itself and masking is worked on the part
  // itself, so NEITHER gets cheaper by racking more parts per hook. That
  // asymmetry against the time-based costs is the point of separating them.
  const maskedFeatures = Math.max(1, opts.maskedFeatures ?? 1);
  let chemistryPerPart = 0;
  let effluentPerPart = 0;
  let depositedMetalPerPart = 0;
  let maskingSeconds = 0;
  let totalDwellMinutes = 0;
  const perStage: SurfaceStageCost[] = [];

  for (const s of stages) {
    // The quantity the stage is charged against — this is the whole point of
    // `basis`, and getting it wrong is an 8x error between product forms.
    const units = s.basis === 'area' ? opts.surfaceAreaM2
      : s.basis === 'mass' ? massKg
      : maskedFeatures;

    const chemistry = s.chemistryGBPPerUnit.value * units * sf.chemical;
    const effluent = s.effluentGBPPerUnit.value * units * sf.effluent;
    // Metal follows AREA regardless of the stage's own basis.
    const metal = depositedMetalCost(s, opts.surfaceAreaM2, opts.depositThicknessUm);
    const dwell = platingDwellMinutes(s, opts.depositThicknessUm);

    chemistryPerPart += chemistry;
    effluentPerPart += effluent;
    depositedMetalPerPart += metal;
    maskingSeconds += s.manualSecPerPart.value * (s.basis === 'piece' ? maskedFeatures : 1);
    totalDwellMinutes += dwell;

    perStage.push({
      id: s.id, label: s.label, basis: s.basis,
      chemistry, effluent, depositedMetal: metal, dwellMinutes: dwell,
    });
  }

  const maskingLabourPerPart = (maskingSeconds / 3600) * r.labour.semiskilled;
  const colourChangePerPart = (opts.colourChangeCostGBP && opts.partsPerColourRun)
    ? opts.colourChangeCostGBP / Math.max(1, opts.partsPerColourRun)
    : 0;
  const addersPerPart = chemistryPerPart + effluentPerPart + depositedMetalPerPart
    + maskingLabourPerPart + colourChangePerPart;

  const g = (n: number): string => n.toFixed(4);
  const bases = [...new Set(stages.map(s => s.basis))].join('/');
  const basis =
    `${stages.length}-stage ${bases} route @ ${region}: ${partsPerRack} parts/rack x `
    + `${racksPerHour.toFixed(2)} racks/h = ${partsPerHour.toFixed(1)} parts/h `
    + `(cycle ${(cycleTimeHr * 3600).toFixed(1)} s/part), ${totalDwellMinutes.toFixed(0)} min total dwell. `
    + `Line time is costed on the machine rate; on top of it: chemistry ${g(chemistryPerPart)} `
    + `(${opts.surfaceAreaM2.toFixed(4)} m²`
    + (massKg > 0 ? `, ${massKg} kg` : '')
    + `) + effluent ${g(effluentPerPart)}`
    + (depositedMetalPerPart > 0 ? ` + deposited metal ${g(depositedMetalPerPart)} (pass-through)` : '')
    + ` + masking ${g(maskingLabourPerPart)} (${maskingSeconds.toFixed(0)} s)`
    + (colourChangePerPart > 0 ? ` + colour change ${g(colourChangePerPart)}` : '')
    + ` = £${g(addersPerPart)}/part`
    + (throughputCappedBy ? `. THROUGHPUT CAPPED: ${throughputCappedBy}` : '');

  return {
    region, stageIds: stages.map(s => s.id),
    partsPerHour, partsPerRack, racksPerHour, cycleTimeHr,
    chemistryPerPart, effluentPerPart, depositedMetalPerPart,
    maskingLabourPerPart, maskingSeconds, colourChangePerPart,
    addersPerPart, totalDwellMinutes,
    maxRacksPerHourFromDwell, throughputCappedBy,
    perStage,
    basis,
  };
}

/**
 * The consumable subtotal for the material bucket: everything in
 * `addersPerPart` EXCEPT masking labour, which is emitted as its own bench
 * operation and would otherwise be counted twice.
 *
 * ONE definition, deliberately, because the alternative caused a real bug.
 * `painting.ts` and `surface-finishing.ts` each used to form this subtotal by
 * hand, and when deposited metal and effluent were added to the engine only one
 * of them was updated — so a zinc-plated part costed on the painting form
 * silently lost its zinc, the very pass-through the report calls a floor no
 * supplier can quote below. A caller that adds a new cost line now gets it
 * everywhere or nowhere.
 */
export function consumablesPerPartFrom(s: SurfaceTreatmentBreakdown): number {
  return s.addersPerPart - s.maskingLabourPerPart;
}

/** Pre-treat + paint: the common automotive recipe. A starting point, not a
 *  claim about any particular shop — which is why stages are an input. */
export const STANDARD_PAINT_LINE_STAGES = [
  'degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse',
  'dry_off', 'flash_off', 'cure_oven',
];

/** Zinc plate with passivation — the common fastener/bracket protection route. */
export const STANDARD_ZINC_PLATE_STAGES = [
  'degrease', 'rinse', 'zinc_plate', 'rinse', 'passivate', 'dry_off',
];

/** Stamping → powder coat: the commonest sheet-metal finishing route. */
export const STANDARD_POWDER_COAT_STAGES = [
  'degrease', 'rinse', 'iron_phosphate', 'rinse', 'di_rinse',
  'dry_off', 'powder_coat', 'cure_oven',
];

/** Casting → impregnate → e-coat. Impregnation is casting-specific. */
export const STANDARD_CASTING_ECOAT_STAGES = [
  'shot_blast', 'impregnation', 'degrease', 'rinse', 'zirconium', 'rinse', 'di_rinse',
  'dry_off', 'e_coat', 'cure_oven',
];

/** Forging → descale → zinc plate. Shot blast replaces the flat descale cost. */
export const STANDARD_FORGING_ZINC_STAGES = [
  'shot_blast', 'degrease', 'rinse', 'pickle', 'rinse',
  'zinc_plate', 'rinse', 'passivate', 'dry_off',
];

/** Heavy steel fabrication → hot dip galvanise. */
export const STANDARD_GALVANISE_STAGES = [
  'degrease', 'rinse', 'pickle', 'rinse', 'galvanise',
];

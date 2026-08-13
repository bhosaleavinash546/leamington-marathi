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
 * So this module supplies only the three things the machine rate genuinely
 * cannot express, plus the throughput that divides it:
 *
 *   1. **Throughput from rack density.** `partsPerHour = partsPerRack x
 *      racksPerHour`. The machine rate is per HOUR; what turns it into a cost
 *      per part is how many parts went down the line in that hour, and the old
 *      model took that as one unexamined number. Measured, halving it moved the
 *      part 55% — the largest lever in the commodity. A line charges by the
 *      carrier, not by the part.
 *   2. **Bath chemistry**, consumed per m² of the part's own area. A consumable,
 *      not a machine cost, so no rate build-up contains it.
 *   3. **Masking labour**, in operator-seconds per part. A manual operation the
 *      model had no channel for at all — it offered only a fixture "tooling
 *      cost", which cannot represent per-part labour.
 *
 * Plus the plating-specific physics: deposit thickness sets dwell, and on a
 * hoist line one load occupies the tank, so thickness caps throughput.
 *
 * Pure arithmetic on library data — no I/O, no AI.
 */
import { REGIONAL_DATA, type ManufacturingRegion } from './regional-rates.js';
import {
  findSurfaceStage, PLATING_DEPOSIT_UM_PER_MIN, REFERENCE_DEPOSIT_UM,
  type SurfaceStage,
} from './surface-treatment-data.js';

export interface SurfaceTreatmentOptions {
  /** Stage keys in process order. See `STANDARD_PAINT_LINE_STAGES`. */
  stages: string[];
  /** Treated area of ONE part, m² — measured from CAD on the CAD path. */
  surfaceAreaM2: number;
  /**
   * Parts on one rack, hook or barrel. THE lever: it divides every time-based
   * cost the machine rate produces. Absent means 1, which is the honest reading
   * of "we do not know how this part racks" and is deliberately pessimistic.
   */
  partsPerRack?: number;
  /** Racks through the line per hour. */
  racksPerHour?: number;
  /** Deposit thickness for plating stages, micron. */
  depositThicknessUm?: number;
  /** Purge and scrapped paint at a colour change, and parts between changes. */
  colourChangeCostGBP?: number;
  partsPerColourRun?: number;
  region?: string;
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
  maskingLabourPerPart: number;
  maskingSeconds: number;
  colourChangePerPart: number;
  /** Everything this module adds. */
  addersPerPart: number;
  totalDwellMinutes: number;
  /** Ceiling from the slowest one-load-at-a-time stage; Infinity if none. */
  maxRacksPerHourFromDwell: number;
  throughputCappedBy: string | null;
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

  const stages = opts.stages.map(key => {
    const s = findSurfaceStage(key);
    if (!s) {
      throw new Error(
        `No surface-treatment stage "${key}" in the library. Add it to `
        + 'surface-treatment-data.ts rather than dropping it from the route.');
    }
    return s;
  });

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

  // Chemistry is consumed by the part's own area and masking is worked on the
  // part itself, so NEITHER gets cheaper by racking more parts per hook. That
  // asymmetry against the time-based costs is the point of separating them.
  let chemistryPerPart = 0;
  let maskingSeconds = 0;
  let totalDwellMinutes = 0;
  for (const s of stages) {
    chemistryPerPart += s.chemistryGBPPerM2.value * opts.surfaceAreaM2 * r.materialMultiplier;
    maskingSeconds += s.manualSecPerPart.value;
    totalDwellMinutes += platingDwellMinutes(s, opts.depositThicknessUm);
  }
  const maskingLabourPerPart = (maskingSeconds / 3600) * r.labour.semiskilled;
  const colourChangePerPart = (opts.colourChangeCostGBP && opts.partsPerColourRun)
    ? opts.colourChangeCostGBP / Math.max(1, opts.partsPerColourRun)
    : 0;
  const addersPerPart = chemistryPerPart + maskingLabourPerPart + colourChangePerPart;

  const g = (n: number): string => n.toFixed(4);
  const basis =
    `${stages.length}-stage line @ ${region}: ${partsPerRack} parts/rack x `
    + `${racksPerHour.toFixed(2)} racks/h = ${partsPerHour.toFixed(1)} parts/h `
    + `(cycle ${(cycleTimeHr * 3600).toFixed(1)} s/part), ${totalDwellMinutes.toFixed(0)} min total dwell. `
    + `Line time is costed on the machine rate; on top of it: chemistry ${g(chemistryPerPart)} `
    + `(${opts.surfaceAreaM2} m² across ${stages.filter(s => s.chemistryGBPPerM2.value > 0).length} `
    + `wet stages) + masking ${g(maskingLabourPerPart)} (${maskingSeconds.toFixed(0)} s)`
    + (colourChangePerPart > 0 ? ` + colour change ${g(colourChangePerPart)}` : '')
    + ` = £${g(addersPerPart)}/part`
    + (throughputCappedBy ? `. THROUGHPUT CAPPED: ${throughputCappedBy}` : '');

  return {
    region, stageIds: stages.map(s => s.id),
    partsPerHour, partsPerRack, racksPerHour, cycleTimeHr,
    chemistryPerPart, maskingLabourPerPart, maskingSeconds, colourChangePerPart,
    addersPerPart, totalDwellMinutes,
    maxRacksPerHourFromDwell, throughputCappedBy,
    basis,
  };
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

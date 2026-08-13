/**
 * Surface treatment — the empirical half of the paint / plating cost model.
 *
 * ## Why this file exists
 *
 * `modules/painting.ts` was 107 lines and modelled the PAINT correctly — film
 * build from area, thickness, solids and transfer efficiency — while modelling
 * the LINE as a single "parts per hour" number. Measuring it showed how much
 * that hid, on a 0.8 m² part at 200k/yr:
 *
 *   line rate 120 -> 60 parts/hr   +55%   one number, three drivers inside it
 *   cure oven, electric            +27%   not represented at all
 *   pre-treatment chemistry        +10%   costed as if it were a paint film
 *   masking labour                  +9%   no per-part labour operation existed
 *
 * So the line, the oven, the baths and the masking are modelled here, and the
 * film-build maths that was already right is left alone.
 *
 * ## The defect this closes
 *
 * `CoatType` included `'pretreat'`, and a pre-treatment stage entered that way
 * was costed with the paint formula — thickness / solids x price per litre.
 * Phosphating and zirconium conversion have no dry film thickness and no solids
 * content; they are bath chemistry, drag-out, rinse water and effluent, bought
 * per m² or per rack. A number produced that way is not merely imprecise, it is
 * meaningless — worse than leaving the stage out, because it looks costed.
 *
 * ## Status of everything here
 *
 * REPRESENTATIVE, not measured. Chemistry costs, oven ratings, dwell times,
 * plating rates and rack capacities are engineering estimates for a general
 * automotive line. Every one carries its own provenance record so
 * `surfaceDataCoverage()` can count them and the estimate says so on its face,
 * exactly as the gear shop data does.
 */
import type { GearParam } from './gear-shop-data.js';

/**
 * A value with its provenance. Structurally identical to the gear shop data's
 * record — one convention across the tool, aliased rather than duplicated so the
 * two cannot drift apart.
 */
export type ShopParam<T = number> = GearParam<T>;

const SRC = 'Representative surface-treatment value — general automotive line practice, '
  + 'NOT a plant measurement, a supplier quote or a published standard. Replace before quoting.';
const RECORDED = '2026-08-13';

const p = (value: number, note?: string): ShopParam => ({
  value, status: 'unverified', source: SRC, recordedAt: RECORDED, ...(note ? { note } : {}),
});

/** What kind of cost a stage incurs, which decides how it is charged. */
export type SurfaceStageKind =
  /** Bath chemistry: charged per m² of wetted area, plus tank heating. */
  | 'bath'
  /** Thermal: charged by installed kW over the time the part is inside. */
  | 'thermal'
  /** Electrochemical: bath chemistry plus rectifier energy, dwell set by
   *  deposit thickness — the plating analogue of case depth. */
  | 'plating'
  /** Manual: charged in operator-seconds per part, not by area. */
  | 'manual';

export interface SurfaceStage {
  id: string;
  label: string;
  kind: SurfaceStageKind;
  /** Chemistry, consumables and effluent, GBP per m² of treated area. */
  chemistryGBPPerM2: ShopParam;
  /** Installed electrical/thermal load while the part is in the stage, kW.
   *  Zero for a stage that draws nothing (a drain, a manual bench). */
  powerKw: ShopParam;
  /** True when `powerKw` is burned as GAS rather than electricity — a cure oven
   *  is normally gas-fired, and at UK tariffs that is a ~6x difference. */
  gasFired: boolean;
  /** Minutes the part spends in this stage. Drives both energy and line length. */
  dwellMinutes: ShopParam;
  /** Operator-seconds per part. Non-zero only for manual stages. */
  manualSecPerPart: ShopParam;
  /** Installed cost of the stage — tank, oven, rectifier, GBP. */
  capitalGBP: ShopParam;
  /**
   * True when the stage holds ONE load at a time, so its dwell caps throughput.
   *
   * This is the difference between a conveyorised paint line and a plating hoist
   * line, and it decides whether dwell costs anything. A cure oven is long: a
   * dozen racks are inside it at once, so a 20-minute bake does not stop the
   * line running 20 racks an hour. A plating tank is not: one rack is in it, and
   * a 25 um deposit at 0.4 um/min occupies that tank for an hour, so throughput
   * collapses to one rack an hour whatever the conveyor could do.
   *
   * Without this, deposit thickness changed the stated dwell and nothing else —
   * a 25 um spec cost exactly what an 5 um spec cost, which is wrong by 3x.
   */
  throughputLimiting: boolean;
  note: string;
}

const S = (
  id: string, label: string, kind: SurfaceStageKind,
  chemPerM2: number, powerKw: number, gasFired: boolean,
  dwellMin: number, manualSec: number, capitalGBP: number, note: string,
  throughputLimiting = false,
): SurfaceStage => ({
  id, label, kind,
  chemistryGBPPerM2: p(chemPerM2),
  powerKw: p(powerKw),
  gasFired,
  dwellMinutes: p(dwellMin),
  manualSecPerPart: p(manualSec),
  capitalGBP: p(capitalGBP),
  throughputLimiting,
  note,
});

/**
 * Stages a line can be built from.
 *
 * Deliberately a LIST the caller assembles, not a fixed recipe: a powder line is
 * degrease -> rinse -> phosphate -> rinse -> dry -> powder -> cure, an e-coat
 * line adds the e-coat tank and a bake, and a plated part skips paint entirely.
 * Hard-coding one recipe is how a cost model ends up unable to price the shop it
 * is pointed at.
 */
export const SURFACE_STAGES: Record<string, SurfaceStage> = {
  // ── Pre-treatment: bath chemistry, NOT a film build ───────────────────────
  degrease: S('ST-01', 'Alkaline degrease', 'bath',
    0.09, 18, false, 2, 0, 45_000,
    'Removes drawing compound and oil. Tank held at 55-60 degC, so it draws power '
    + 'continuously whether or not a part is in it — the reason line loading matters.'),
  rinse: S('ST-02', 'Rinse (mains / cascade)', 'bath',
    0.03, 2, false, 1, 0, 12_000,
    'Between every chemical stage. Cheap individually; a line has three or four of them, '
    + 'and the drag-out they handle is what drives effluent volume.'),
  phosphate: S('ST-03', 'Zinc phosphate conversion', 'bath',
    0.22, 22, false, 3, 0, 70_000,
    'The classic pre-paint conversion coat. Priced per m² of wetted area — it has no dry '
    + 'film thickness and no solids content, so the paint film-build formula cannot cost it.'),
  zirconium: S('ST-04', 'Zirconium conversion (thin-film)', 'bath',
    0.16, 8, false, 2, 0, 60_000,
    'Lower temperature and less sludge than zinc phosphate, increasingly the default. '
    + 'Cheaper to run, dearer in chemistry per litre.'),
  di_rinse: S('ST-05', 'DI water final rinse', 'bath',
    0.06, 3, false, 1, 0, 25_000,
    'Deionised final rinse before paint. The DI plant and its regeneration are the cost, '
    + 'not the water.'),
  dry_off: S('ST-06', 'Dry-off oven', 'thermal',
    0, 180, true, 8, 0, 120_000,
    'Drives off rinse water before paint. Gas-fired; smaller than the cure oven but it '
    + 'runs on the same continuous basis.'),

  // ── Thermal ────────────────────────────────────────────────────────────────
  flash_off: S('ST-07', 'Flash-off zone', 'thermal',
    0, 30, false, 5, 0, 40_000,
    'Solvent release before the bake. Low power, real line length.'),
  cure_oven: S('ST-08', 'Cure oven', 'thermal',
    0, 400, true, 20, 0, 350_000,
    'The dominant energy draw on a paint line, and it was entirely absent from the model: '
    + 'worth 27% of a painted part on electricity, 5% on gas. It runs whether or not your '
    + 'part is in it, which is why a densely-racked part should carry less of it.'),

  // ── Manual ─────────────────────────────────────────────────────────────────
  masking: S('ST-09', 'Masking', 'manual',
    0.04, 0, false, 0, 45, 3_000,
    'Plugs, caps and tape over threads, bearing bores and earth points. Pure manual labour '
    + 'at ~45 s a part, plus the consumable. The model had only a fixture "tooling cost", '
    + 'which cannot represent a per-part labour operation.'),
  demask: S('ST-10', 'De-mask and inspect', 'manual',
    0, 0, false, 0, 25, 2_000,
    'Faster than masking but not free, and it is where visual rejects are caught.'),

  // ── Electrochemical — absent from the model entirely before this ──────────
  zinc_plate: S('ST-11', 'Zinc plate (alkaline, barrel or rack)', 'plating',
    0.55, 45, false, 25, 0, 180_000,
    'Dwell is set by deposit thickness at roughly 0.4 um/min, so an 8 um spec takes ~20 min '
    + 'and a 15 um spec nearly 40 — the plating analogue of carburising case depth.', true),
  zinc_nickel: S('ST-12', 'Zinc-nickel plate', 'plating',
    1.35, 60, false, 40, 0, 260_000,
    'Specified where salt-spray life must exceed plain zinc. Roughly 2.5x the chemistry cost '
    + 'and a slower deposit, so it is dear on both axes.', true),
  anodise: S('ST-13', 'Sulphuric anodise', 'plating',
    0.48, 55, false, 35, 0, 200_000,
    'Aluminium only. Thickness-driven like plating; hard anodise runs far longer again.', true),
  passivate: S('ST-14', 'Trivalent passivate + seal', 'bath',
    0.28, 6, false, 3, 0, 35_000,
    'Follows zinc plating for corrosion life. Hexavalent chrome is not offered — it is '
    + 'restricted under REACH and should not appear in a forward-looking should-cost.', true),
};

/** Deposit rate for the thickness-driven plating stages, micron per minute. */
export const PLATING_DEPOSIT_UM_PER_MIN: Record<string, ShopParam> = {
  zinc_plate: p(0.40, 'alkaline zinc, typical rack current density'),
  zinc_nickel: p(0.30, 'slower deposit than plain zinc'),
  anodise: p(0.50, 'sulphuric, standard duty'),
};

/** The thickness the catalogued dwell times assume, micron. */
export const REFERENCE_DEPOSIT_UM = 8;

/**
 * Line economics — the things a paint line has that a single machine rate cannot
 * express. `REGIONAL_DATA` supplies energy, labour and the capital/overhead
 * multipliers; these are what it has no equivalent for.
 */
export interface SurfaceLineEconomics {
  operatingHoursPerYear: ShopParam;
  oee: ShopParam;
  wacc: ShopParam;
  depreciationLifeYears: ShopParam;
  maintenancePctOfCapital: ShopParam;
  /** Building, extraction, compressed air, effluent plant, supervision. */
  overheadPerLinePerYearGBP: ShopParam;
  /** Operators manning the line as a whole, excluding manual stages which are
   *  costed in their own operator-seconds. */
  lineManning: ShopParam;
}

export const DEFAULT_SURFACE_LINE: SurfaceLineEconomics = {
  operatingHoursPerYear: p(3800, 'two shifts with changeover and maintenance windows'),
  oee: p(0.80),
  wacc: p(0.065),
  depreciationLifeYears: p(12, 'tanks and ovens outlast most machine tools'),
  maintenancePctOfCapital: p(0.045, 'pumps, filters, burners, effluent plant, tank relining'),
  overheadPerLinePerYearGBP: p(140_000,
    'building, extraction and RTO, compressed air, effluent consent, supervision'),
  lineManning: p(2, 'loader and unloader; sprayers are inside the booth stages'),
};

/** Look a stage up by key or by its ST-nn id. */
export function findSurfaceStage(key: string): SurfaceStage | null {
  return SURFACE_STAGES[key]
    ?? Object.values(SURFACE_STAGES).find(s => s.id === key)
    ?? null;
}

export interface SurfaceDataCoverage {
  total: number; unverified: number; plantSupplied: number; verified: number;
  hasUnverified: boolean;
}

/** How much of the surface-treatment data is real. Mirrors `gearDataCoverage`. */
export function surfaceDataCoverage(
  stages: Record<string, SurfaceStage> = SURFACE_STAGES,
  line: SurfaceLineEconomics = DEFAULT_SURFACE_LINE,
): SurfaceDataCoverage {
  const counts = { unverified: 0, 'plant-supplied': 0, verified: 0 };
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if ('value' in rec && 'status' in rec) {
      const s = (rec as unknown as ShopParam).status;
      if (s in counts) counts[s] += 1;
      return;
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(stages); walk(line); walk(PLATING_DEPOSIT_UM_PER_MIN);
  const total = counts.unverified + counts['plant-supplied'] + counts.verified;
  return {
    total, unverified: counts.unverified, plantSupplied: counts['plant-supplied'],
    verified: counts.verified, hasUnverified: counts.unverified > 0,
  };
}

/** The sentence every surface-treatment estimate carries until a plant replaces
 *  the data. Same contract as `gearDataWarning`. */
export function surfaceDataWarning(): string | null {
  const c = surfaceDataCoverage();
  if (!c.hasUnverified) return null;
  return `${c.unverified} of ${c.total} surface-treatment parameters are representative values, `
    + 'not plant data. Chemistry costs, oven ratings, dwell times, plating rates and rack '
    + 'capacities were not measured on your line. The structure is right and the number is NOT '
    + 'quotable until the line data is supplied — line loading alone moves it more than 50%.';
}

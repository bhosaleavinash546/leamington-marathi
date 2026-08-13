/**
 * Gear heat-treatment process library — the engineering half of the HT rate model.
 *
 * ## Where this came from
 *
 * Transcribed from a researched should-cost workbook supplied by the plant
 * ("Gear Heat Treatment & Should-Cost Rate Model", 8 sheets, built 13 Aug 2026),
 * which builds heat-treat rates bottom-up for China / India / Europe / UK. Its
 * arithmetic was reproduced by hand before transcription — UK gas carburising:
 * throughput 600 kg / 7 h x 7000 h x 0.85 = 510,000 kg/yr, conversion cost
 * $0.9085/kg — and `gear-heat-treat-rate.ts` reproduces its published figures to
 * within 2% in `tests/gear-heat-treat-rate.test.ts`.
 *
 * ## What is data and what is estimate
 *
 * The workbook is explicit, and that honesty is preserved here: electricity, gas
 * and labour prices ARE sourced (Eurostat nrg_pc_205, DESNZ Quarterly Energy
 * Prices, TNERC FY26, Eurostat lc_lci_lev). Everything in THIS file — specific
 * energy consumption, cycle times, load sizes, attendance, furnace capital,
 * consumables, QC and scrap — is an engineering estimate, tagged `[Likely]` or
 * `[Certain]` in the source workbook and carried here as `unverified` so
 * `gearDataCoverage()` counts it and `gearDataWarning()` keeps saying so.
 *
 * Prices are NOT taken from the workbook: energy and labour come from
 * CostVision's own `REGIONAL_DATA`, so there is one country model, not two.
 *
 * ## The three mechanisms this library exists to price
 *
 * The workbook names six things that make gear HT rates wrong. Three of them are
 * structural and are modelled here rather than buried in a flat GBP/kg:
 *
 *   1. **Load density.** Capital, maintenance, overhead and QC are incurred per
 *      LOAD. Two gears of identical mass differ 2-3x per kg if one racks at
 *      600 kg and the other at 250 kg. The workbook calls this "the single
 *      biggest error in gear HT should-cost".
 *   2. **Case depth.** Carburising time scales as ECD^2 (Fick's second law), so
 *      0.6 -> 1.2 mm roughly QUADRUPLES the carburising segment. A flat rate
 *      charges both identically.
 *   3. **Captive vs commercial.** An OEM's own furnace carries no SG&A, no
 *      margin and no freight: a 25-35% gap on the same physical process.
 */
import type { GearParam } from './gear-shop-data.js';

/** USD -> GBP used ONCE, at transcription, so nothing depends on FX at runtime.
 *  The workbook's own rate; it tags FX `[Guessing]`, hence the single conversion
 *  point and the explicit note on every converted figure. */
const USD_PER_GBP = 1.33;
const usd = (v: number): number => Math.round((v / USD_PER_GBP) * 1e6) / 1e6;

const SRC = 'Gear Heat Treatment Should-Cost Model workbook (plant-supplied research, '
  + '13 Aug 2026), sheet 02_Process_Library. Engineering estimate, not measured data.';
const RECORDED = '2026-08-13';

const p = (value: number, note?: string): GearParam => ({
  value, status: 'unverified', source: SRC, recordedAt: RECORDED, ...(note ? { note } : {}),
});

/**
 * Distortion, as ISO 1328 classes lost.
 *
 * The workbook grades distortion qualitatively per process. Mapped to classes on
 * the scale the router already uses, taking the OPTIMISTIC end of each band —
 * a route that needs grinding at the optimistic bound certainly needs it in a
 * real furnace.
 *
 * The consequential change is gas carburising: the workbook grades it **High**,
 * where the model previously assumed 1 class. Two classes is the evidence-backed
 * figure, and it means a hobbed class-7 gear delivers class 9 as-quenched.
 */
export type DistortionRisk = 'none' | 'very_low' | 'low' | 'low_med' | 'medium' | 'high';

export const DISTORTION_CLASSES_BY_RISK: Record<DistortionRisk, number> = {
  none: 0,
  very_low: 0,
  low: 1,
  low_med: 1,
  medium: 1,
  high: 2,
};

/** What the step does to the routing, beyond costing. */
export type HeatTreatKind =
  /** Diffuses carbon/nitrogen — cycle scales with case depth. */
  | 'case_hardening'
  /** Sub-critical diffusion, no phase change, no distortion. */
  | 'diffusion'
  /** Austenitise + quench through the section. */
  | 'through_hardening'
  /** Localised surface heating — a machine, not a furnace bought by weight. */
  | 'localised'
  /** Tempering, washing, peening, straightening, press quenching. */
  | 'ancillary';

export interface HeatTreatProcess {
  /** The workbook's own id, so a figure can be traced back to its row. */
  id: string;
  label: string;
  kind: HeatTreatKind;
  /** Specific energy consumption per kg of PART (net-load basis, losses included). */
  secElectricKwhPerKg: GearParam;
  secGasKwhPerKg: GearParam;
  /** Default net load. THE highest-leverage assumption — see the header. */
  netLoadKg: GearParam;
  cycleHours: GearParam;
  /** Operator-hours per furnace-hour. */
  attendanceOpHPerFurnaceH: GearParam;
  /** Installed cell cost, GBP, on a Europe basis before the regional multiplier. */
  capitalGBP: GearParam;
  consumablesGBPPerKg: GearParam;
  fixturesGBPPerKg: GearParam;
  /** Metallurgical test per load — a fixed cost the load size divides. */
  qcGBPPerLoad: GearParam;
  scrapFraction: GearParam;
  distortionRisk: DistortionRisk;
  /** True when cycle time scales with effective case depth squared. */
  scalesWithCaseDepth: boolean;
  /**
   * Cycle is per LOAD for a batch furnace, but continuous lines and per-part
   * cells (induction, peening, straightening, washing) are modelled by the
   * workbook as cycle = 1 h with net load = kg processed per hour. Flagged so
   * the reader knows which interpretation applies.
   */
  continuous: boolean;
  note: string;
}

const P = (
  id: string, label: string, kind: HeatTreatKind,
  secE: number, secG: number, loadKg: number, cycleH: number, attend: number,
  capitalUsdThousand: number, consUsdKg: number, fixUsdKg: number, qcUsdLoad: number,
  scrap: number, distortionRisk: DistortionRisk,
  opts: { scalesWithCaseDepth?: boolean; continuous?: boolean; note: string },
): HeatTreatProcess => ({
  id, label, kind,
  secElectricKwhPerKg: p(secE),
  secGasKwhPerKg: p(secG),
  netLoadKg: p(loadKg, 'default load — halve it and capital, overhead and QC per kg double'),
  cycleHours: p(cycleH),
  attendanceOpHPerFurnaceH: p(attend),
  capitalGBP: p(usd(capitalUsdThousand * 1000), `USD ${capitalUsdThousand}k Europe basis / ${USD_PER_GBP}`),
  consumablesGBPPerKg: p(usd(consUsdKg), `USD ${consUsdKg}/kg / ${USD_PER_GBP}`),
  fixturesGBPPerKg: p(usd(fixUsdKg),
    `USD ${fixUsdKg}/kg / ${USD_PER_GBP}. Simplification: baskets are really a per-load `
    + 'capital item with a life, charged per kg here as the workbook does.'),
  qcGBPPerLoad: p(usd(qcUsdLoad), `USD ${qcUsdLoad}/load / ${USD_PER_GBP}`),
  scrapFraction: p(scrap, 'base rate before the regional quality multiplier'),
  distortionRisk,
  scalesWithCaseDepth: opts.scalesWithCaseDepth ?? false,
  continuous: opts.continuous ?? false,
  note: opts.note,
});

/**
 * The gear-relevant subset of the workbook's 35 processes.
 *
 * Excluded deliberately: boronising, electron-beam and laser hardening, salt-bath
 * routes, powder-metal steam/sinter-hardening, and the blank pre-treatments
 * (normalise / anneal / stress relieve). The first group is niche for gears; the
 * last belongs to the BLANK, which `forging.ts` and `machining.ts` own — pulling
 * it in here would give the gear commodity two material models that drift.
 */
export const GEAR_HEAT_TREAT_PROCESSES: Record<string, HeatTreatProcess> = {
  // ── Case hardening ────────────────────────────────────────────────────────
  gas_carburise: P('HT-01', 'Gas carburise + oil quench (sealed-quench batch)', 'case_hardening',
    0.30, 2.0, 600, 7, 0.35, 750, 0.075, 0.02, 18, 0.015, 'high',
    { scalesWithCaseDepth: true,
      note: 'The mainstream transmission-gear route. ECD 0.5-0.9 mm, 58-62 HRC case over a '
        + '30-40 HRC core. Cycle scales with ECD^2; endo-gas and quench oil dominate consumables.' }),

  lpc_carburise: P('HT-03', 'Low-pressure (vacuum) carburise + high-pressure gas quench', 'case_hardening',
    1.60, 0, 350, 6, 0.30, 1800, 0.15, 0.03, 24, 0.010, 'low_med',
    { scalesWithCaseDepth: true,
      note: 'EV e-axle and NVH-critical gears. No intergranular oxidation, far less distortion '
        + 'than oil quenching, and no post-wash needed. Electricity and N2/He quench gas replace '
        + 'the gas burner, so it is roughly 2.5x the batch-carburising rate.' }),

  carbonitride: P('HT-04', 'Carbonitride (gas, N + C)', 'case_hardening',
    0.25, 1.6, 600, 6, 0.35, 700, 0.08, 0.02, 18, 0.012, 'medium',
    { scalesWithCaseDepth: true,
      note: 'Small gears, sprockets, oil-pump gears at ECD < 0.4 mm. Lower temperature and a '
        + 'shorter cycle than carburising make it the cheapest case-hardening route.' }),

  // ── Diffusion, no quench ──────────────────────────────────────────────────
  nitride: P('HT-06', 'Gas nitride (NH3, single or two-stage)', 'diffusion',
    1.90, 0, 700, 45, 0.15, 700, 0.09, 0.015, 22, 0.005, 'very_low',
    { note: 'Idler and worm gears, thin sections, 31CrMoV9 / 42CrMo4. 900-1200 HV at 0.30-0.60 mm '
        + 'nitride depth. Runs at 500-530 degC — below the transformation temperature, so there is '
        + 'no phase change and essentially no distortion. The 30-90 h cycle is what makes it dear.' }),

  fnc: P('HT-08', 'Ferritic nitrocarburise (gas + post-oxidation)', 'diffusion',
    0.90, 0.3, 600, 8, 0.30, 700, 0.07, 0.015, 18, 0.008, 'very_low',
    { note: 'Light-duty gears and splines needing wear plus corrosion resistance. 500-700 HV in a '
        + '10-20 um compound layer. An 8 h cycle against nitriding’s 45 h makes it the low-cost '
        + 'substitute for case hardening where the load case allows a shallow case.' }),

  // ── Through hardening ─────────────────────────────────────────────────────
  quench_temper: P('HT-15', 'Harden and temper (austenitise + oil quench + temper)', 'through_hardening',
    0.20, 1.2, 700, 5, 0.30, 550, 0.045, 0.015, 14, 0.012, 'medium',
    { note: 'Medium-carbon alloy gears (42CrMo4) and shafts, 28-45 HRC through the section. '
        + 'Limited by hardenability against section size (Jominy), not by the furnace.' }),

  martemper: P('HT-17', 'Martemper (hot oil 150-200 degC)', 'through_hardening',
    0.25, 1.3, 600, 6, 0.35, 700, 0.08, 0.02, 18, 0.010, 'low',
    { note: 'Distortion-sensitive gears and thin-wall rings. Quenching into hot oil halves the '
        + 'thermal gradient, so it buys back distortion at the cost of faster oil degradation.' }),

  austemper: P('HT-18', 'Austemper (salt, isothermal bainitic)', 'through_hardening',
    1.40, 0, 500, 7, 0.45, 800, 0.15, 0.02, 20, 0.010, 'very_low',
    { note: 'ADI gears and thin sections needing toughness with very low distortion. 40-50 HRC '
        + 'bainite. Salt bath plus a mandatory post-wash put it at a premium over Q&T.' }),

  // ── Localised surface — machines, not furnaces bought by weight ───────────
  induction_spin: P('HT-10', 'Induction harden - spin / scan (whole gear)', 'localised',
    0.20, 0, 250, 1, 0.60, 550, 0.02, 0.01, 10, 0.020, 'low_med',
    { continuous: true,
      note: 'Sprockets, coarse-module spur gears and splines. In-line, no atmosphere, no fixtures; '
        + 'the coil is tooling specific to one part family. Load is kg PER HOUR, not per batch.' }),

  induction_tooth: P('HT-11', 'Induction harden - single tooth / tooth-gap contour', 'localised',
    0.60, 0, 40, 1, 1.0, 900, 0.03, 0.015, 24, 0.030, 'medium',
    { continuous: true,
      note: 'Large-module (>8 mm) wind, mining and marine gears. The cycle scales with tooth count, '
        + 'so it is poor for high-z parts — which is why throughput collapses to 40 kg/h.' }),

  // ── Ancillary and post-hardening ──────────────────────────────────────────
  temper_standalone: P('HT-24', 'Temper (stand-alone / double temper)', 'ancillary',
    0.35, 0, 900, 3, 0.15, 200, 0.005, 0.008, 6, 0.002, 'very_low',
    { note: 'Mandatory after any martensitic hardening. Usually bundled INSIDE a hardening quote — '
        + 'unbundle it before benchmarking two suppliers, or the scopes differ.' }),

  wash: P('HT-31', 'Wash / degrease', 'ancillary',
    0.25, 0.1, 500, 1, 0.20, 200, 0.02, 0.005, 4, 0.002, 'none',
    { continuous: true,
      note: 'Mandatory before carburising and after oil quench, so it appears TWICE in a typical '
        + 'route. Routinely omitted from cost models entirely.' }),

  shot_peen: P('HT-28', 'Shot peen (post-HT)', 'ancillary',
    0.15, 0, 200, 1, 0.50, 350, 0.03, 0.01, 14, 0.005, 'none',
    { continuous: true,
      note: 'Root-fillet peening buys 20-40% bending fatigue strength and is standard on automotive '
        + 'gears. Almen strip and coverage control; often quoted bundled with heat treat.' }),

  straighten: P('HT-29', 'Straighten (post-quench press)', 'ancillary',
    0.05, 0, 120, 1, 1.0, 250, 0.005, 0.005, 10, 0.010, 'none',
    { continuous: true,
      note: 'Pinion shafts, long gears, splined shafts, to a TIR typically under 0.05 mm. Almost '
        + 'pure labour, and the most commonly omitted line in gear heat-treat should-cost.' }),

  press_quench: P('HT-27', 'Press (die) quench', 'ancillary',
    0.20, 0.8, 60, 1, 1.2, 800, 0.04, 0.03, 18, 0.020, 'very_low',
    { continuous: true,
      note: 'Ring gears, thin annular gears and clutch plates, where roundness and flatness are '
        + 'held in the die. One part per press cycle, so throughput is 60 kg/h and it is expensive '
        + 'per kg — but it replaces the distortion that would otherwise be ground out.' }),
};

/**
 * Furnace-SHOP economics, which are not the same as machine-shop economics.
 *
 * A furnace runs near-continuously because thermal cycling is slow and expensive
 * — a shut furnace still costs money to bring back to temperature — so operating
 * hours here are high by machining standards, deliberately. CostVision's
 * `REGIONAL_DATA` carries energy, labour and the capital/overhead multipliers;
 * these are the parameters it has no equivalent for.
 *
 * Values for CN / IN / EU / UK are the workbook's. Any other region falls back to
 * `DEFAULT_HT_SHOP`, and the regional capital and overhead multipliers already in
 * `REGIONAL_DATA` do the scaling — so adding a region needs no new HT data.
 */
export interface HeatTreatShopEconomics {
  operatingHoursPerYear: GearParam;
  oee: GearParam;
  /** Annuity, not straight-line, so cost of capital is priced rather than hidden. */
  wacc: GearParam;
  depreciationLifeYears: GearParam;
  maintenancePctOfCapital: GearParam;
  /** Building, HVAC, compressed air, supervision, quality dept, CQI-9 compliance. */
  overheadPerFurnacePerYearGBP: GearParam;
  /** Applied to the process scrap rate. */
  qualityMultiplier: GearParam;
  /** Commercial heat-treater's SG&A and margin. Zero for a captive line. */
  subcontractSgaPct: GearParam;
  subcontractMarginPct: GearParam;
  /** Round trip to the heat-treater. Zero for in-house. */
  subcontractLogisticsGBPPerKg: GearParam;
}

const shop = (
  hours: number, oee: number, wacc: number, maint: number,
  overheadUsd: number, quality: number, sga: number, margin: number, logisticsUsd: number,
): HeatTreatShopEconomics => ({
  operatingHoursPerYear: p(hours, 'furnaces run near-continuously; high by machining-shop standards'),
  oee: p(oee),
  wacc: p(wacc),
  depreciationLifeYears: p(10, 'furnace shell 15-20 yr; controls and atmosphere 7-10 yr'),
  maintenancePctOfCapital: p(maint, 'radiant tubes, retorts, alloy fixtures, oxygen probes, quench oil'),
  overheadPerFurnacePerYearGBP: p(usd(overheadUsd), `USD ${overheadUsd}/furnace/yr / ${USD_PER_GBP}`),
  qualityMultiplier: p(quality),
  subcontractSgaPct: p(sga),
  subcontractMarginPct: p(margin),
  subcontractLogisticsGBPPerKg: p(usd(logisticsUsd), `USD ${logisticsUsd}/kg / ${USD_PER_GBP}`),
});

export const DEFAULT_HT_SHOP: HeatTreatShopEconomics =
  shop(7000, 0.85, 0.065, 0.035, 105_000, 1.00, 0.12, 0.13, 0.035);

/** Region code -> furnace-shop economics. Regions absent here use `DEFAULT_HT_SHOP`. */
export const HT_SHOP_BY_REGION: Record<string, HeatTreatShopEconomics> = {
  UK: DEFAULT_HT_SHOP,
  EU: shop(7300, 0.87, 0.055, 0.035, 110_000, 1.00, 0.12, 0.12, 0.030),
  DE: shop(7300, 0.87, 0.055, 0.035, 110_000, 1.00, 0.12, 0.12, 0.030),
  CN: shop(8000, 0.82, 0.060, 0.040, 45_000, 1.20, 0.08, 0.08, 0.010),
  IN: shop(7600, 0.78, 0.100, 0.045, 30_000, 1.25, 0.09, 0.12, 0.012),
};

/** The ECD the library's carburising cycle times are built around. */
export const REFERENCE_CASE_DEPTH_MM = 0.70;
/** Fick's second law gives n = 2; boost-diffuse lines land at 1.7-2.0. */
export const CASE_DEPTH_EXPONENT = 2;

/** Look up a process by key, or by the workbook's own HT-nn id. */
export function findHeatTreatProcess(key: string): HeatTreatProcess | null {
  return GEAR_HEAT_TREAT_PROCESSES[key]
    ?? Object.values(GEAR_HEAT_TREAT_PROCESSES).find(x => x.id === key)
    ?? null;
}

/**
 * Bottom-up gear heat-treatment rate — a furnace costed like a machine.
 *
 * ## Why this replaced a flat GBP/kg
 *
 * Heat treatment used to be three representative numbers (carburise £1.60/kg,
 * quench-and-temper £0.85/kg, nitride £4.20/kg). A plant-supplied research
 * workbook validated those to +6% / -4% / +19%, so they were not WRONG — they
 * simply could not explain themselves, could not regionalise, and could not
 * price the three things that actually move a heat-treat rate:
 *
 *   - **load density** — capital, maintenance, overhead and QC are per LOAD, so
 *     racking 250 kg instead of 600 kg roughly doubles them per kg;
 *   - **case depth** — carburising time goes as ECD^2, so 0.6 -> 1.2 mm nearly
 *     quadruples the carburising segment;
 *   - **captive vs commercial** — an OEM's own furnace carries no SG&A, margin
 *     or freight; a sub-contractor's does, and the gap is 25-35%.
 *
 * ## The chain
 *
 * Deliberately the same shape as `computeMachineRateFromBuildup` in
 * `rate-library.ts` — annualised cost divided by annual throughput — so a furnace
 * and a hobber are costed by the same logic and a reader who understands one
 * understands the other.
 *
 *     throughput(kg/yr) = netLoad / cycleH x operatingHours x OEE
 *     energy   = SECelec x elecPrice + SECgas x gasPrice
 *     labour   = cycleH x attendance x labourRate / netLoad
 *     capital  = capitalGBP x CRF / throughput      CRF = i / (1 - (1+i)^-n)
 *     maint    = capitalGBP x maint% / throughput
 *     overhead = overheadPerFurnaceYear / throughput
 *     QC       = qcPerLoad / netLoad
 *     conversion = sum(...)          in-house = conversion x (1 + scrap x quality)
 *
 * ## Where it deliberately STOPS
 *
 * At in-house conversion cost. `computeUniversalStack` already applies factory
 * overhead %, margin % and per-part logistics to every commodity; adding the
 * workbook's SG&A/margin/logistics unconditionally would charge them twice. They
 * are added ONLY when the route is sub-contracted, because then they are a real
 * supplier price the buyer pays — and they are returned as their own line so the
 * captive-vs-buy gap is visible rather than baked in.
 *
 * Pure arithmetic on library data. No I/O, no AI — `tests/architecture-invariants`
 * enforces that for everything under `src/engine/`.
 */
import { REGIONAL_DATA, type ManufacturingRegion } from './regional-rates.js';
import {
  findHeatTreatProcess, DEFAULT_HT_SHOP, HT_SHOP_BY_REGION,
  REFERENCE_CASE_DEPTH_MM, CASE_DEPTH_EXPONENT,
  type HeatTreatProcess, type HeatTreatShopEconomics,
} from './gear-heat-treat-data.js';

export interface HeatTreatRateOptions {
  /**
   * Effective case depth required, mm. Scales the cycle of carburising and
   * carbonitriding by (ECD / 0.70)^2 and NOTHING else — a nitride or a temper
   * does not care what case depth a carburised part would have had.
   */
  effectiveCaseDepthMm?: number;
  /**
   * Actual kg of PART per load. The single highest-leverage input here: it
   * divides capital, maintenance, overhead and QC. Absent means the library
   * default, which is a production-line assumption, not a job-shop one.
   */
  netLoadKg?: number;
  /** Captive line (no SG&A/margin/freight) or bought from a heat-treater. */
  sourcing?: 'captive' | 'subcontract';
  /** Minimum charge per load or per order. Below ~200-300 kg/lot the per-kg
   *  rate is meaningless, and every commercial heat-treater applies one. */
  minimumLotChargeGBP?: number;
  /** kg in the lot being priced, for the minimum-charge test. */
  lotSizeKg?: number;
  /** Override the furnace-shop economics (a named plant's own figures). */
  shop?: HeatTreatShopEconomics;
}

export interface HeatTreatRateBreakdown {
  processId: string;
  label: string;
  region: string;
  /** Every element in GBP per kg of part, so the report can print the derivation. */
  energy: number;
  labour: number;
  capital: number;
  maintenance: number;
  consumables: number;
  fixtures: number;
  overhead: number;
  qc: number;
  conversion: number;
  scrap: number;
  inHouse: number;
  /** Zero on a captive line. */
  sga: number;
  margin: number;
  logistics: number;
  /** What the buyer pays per kg: in-house for captive, full buy rate otherwise. */
  ratePerKg: number;
  /** Uplift applied because the lot fell below the supplier's minimum charge. */
  minimumChargeUpliftPerKg: number;
  /** Cycle actually used, after case-depth scaling. */
  effectiveCycleHours: number;
  caseDepthFactor: number;
  netLoadKg: number;
  throughputKgPerYear: number;
  /** Printable derivation, end to end. */
  basis: string;
  /** Energy alone — the floor a quote cannot physically go below. */
  energyFloorPerKg: number;
}

/** Annuity capital recovery factor: i / (1 - (1+i)^-n). Prices cost of capital,
 *  which straight-line depreciation hides — visible on a high-WACC region. */
export function capitalRecoveryFactor(wacc: number, years: number): number {
  if (wacc <= 0) return 1 / Math.max(years, 1);
  return wacc / (1 - Math.pow(1 + wacc, -years));
}

/**
 * Case-depth cycle factor, applied to diffusion-limited processes only.
 *
 * Fick's second law: depth goes as sqrt(time), so time goes as depth^2. Doubling
 * the case does not double the cost — it roughly quadruples the carburising
 * segment of the cycle. Published rate cards famously do NOT price this (the
 * workbook's Indian card rises 11% for a 50% deeper case), which is exactly why
 * benchmarking against them under-costs a deep-case gear.
 */
export function caseDepthFactor(process: HeatTreatProcess, ecdMm?: number): number {
  if (!process.scalesWithCaseDepth || !ecdMm || ecdMm <= 0) return 1;
  return Math.pow(ecdMm / REFERENCE_CASE_DEPTH_MM, CASE_DEPTH_EXPONENT);
}

function shopFor(region: string, override?: HeatTreatShopEconomics): HeatTreatShopEconomics {
  return override ?? HT_SHOP_BY_REGION[region] ?? DEFAULT_HT_SHOP;
}

/** Energy, labour and the capital/overhead multipliers come from CostVision's own
 *  regional layer — one country model, not a second one for heat treat. */
function regionFacts(region: string): {
  elec: number; gas: number; labour: number; capMult: number; ovhMult: number; consMult: number;
} {
  const r = REGIONAL_DATA[region as ManufacturingRegion] ?? REGIONAL_DATA.UK;
  return {
    elec: r.energy.electricityPerKwh,
    gas: r.energy.gasPerKwh,
    // A heat-treat operator is a semi-skilled furnace hand, not a machinist.
    labour: r.labour.semiskilled,
    capMult: r.machineRateMultiplier,
    ovhMult: r.overheadMultiplier,
    consMult: r.materialMultiplier,
  };
}

/**
 * The rate for one heat-treatment process, in GBP per kg of part.
 *
 * Throws on an unknown process rather than falling back to a nearby one: an
 * invented rate is indistinguishable from a real one on the report, which is the
 * same reason the cutting model refuses to extrapolate a feed.
 */
export function computeHeatTreatRate(
  processKey: string,
  region = 'UK',
  opts: HeatTreatRateOptions = {},
): HeatTreatRateBreakdown {
  const proc = findHeatTreatProcess(processKey);
  if (!proc) {
    throw new Error(
      `No heat-treatment process "${processKey}" in the library. Add it to `
      + 'gear-heat-treat-data.ts rather than costing it on a neighbouring process.');
  }
  const shop = shopFor(region, opts.shop);
  const f = regionFacts(region);

  const netLoad = opts.netLoadKg && opts.netLoadKg > 0 ? opts.netLoadKg : proc.netLoadKg.value;
  const cdFactor = caseDepthFactor(proc, opts.effectiveCaseDepthMm);
  const cycleH = proc.cycleHours.value * cdFactor;

  // The throughput identity. The workbook calls this the highest-leverage line
  // in the whole model, and it is: it divides capital, maintenance and overhead.
  const throughput = (netLoad / cycleH)
    * shop.operatingHoursPerYear.value * shop.oee.value;

  const energy = proc.secElectricKwhPerKg.value * f.elec + proc.secGasKwhPerKg.value * f.gas;
  const labour = (cycleH * proc.attendanceOpHPerFurnaceH.value * f.labour) / netLoad;

  const capitalGBP = proc.capitalGBP.value * f.capMult;
  const crf = capitalRecoveryFactor(shop.wacc.value, shop.depreciationLifeYears.value);
  const capital = (capitalGBP * crf) / throughput;
  const maintenance = (capitalGBP * shop.maintenancePctOfCapital.value) / throughput;

  const consumables = proc.consumablesGBPPerKg.value * f.consMult;
  const fixtures = proc.fixturesGBPPerKg.value * f.consMult;
  const overhead = (shop.overheadPerFurnacePerYearGBP.value * f.ovhMult) / throughput;
  const qc = proc.qcGBPPerLoad.value / netLoad;

  const conversion = energy + labour + capital + maintenance
    + consumables + fixtures + overhead + qc;
  const scrap = conversion * proc.scrapFraction.value * shop.qualityMultiplier.value;
  const inHouse = conversion + scrap;

  // Captive lines carry none of this. The gap IS the make-vs-buy argument, so it
  // is computed as its own line rather than folded into the rate.
  const subcontracted = (opts.sourcing ?? 'subcontract') === 'subcontract';
  const sga = subcontracted ? inHouse * shop.subcontractSgaPct.value : 0;
  const margin = subcontracted ? (inHouse + sga) * shop.subcontractMarginPct.value : 0;
  const logistics = subcontracted ? shop.subcontractLogisticsGBPPerKg.value : 0;

  let ratePerKg = inHouse + sga + margin + logistics;

  // Below the supplier's minimum the per-kg rate is fiction — you pay the
  // minimum. Modelling a 500-off prototype without this under-costs it badly.
  let minimumChargeUpliftPerKg = 0;
  if (subcontracted && opts.minimumLotChargeGBP && opts.lotSizeKg && opts.lotSizeKg > 0) {
    const lotCost = ratePerKg * opts.lotSizeKg;
    if (lotCost < opts.minimumLotChargeGBP) {
      minimumChargeUpliftPerKg = (opts.minimumLotChargeGBP - lotCost) / opts.lotSizeKg;
      ratePerKg += minimumChargeUpliftPerKg;
    }
  }

  const g = (n: number): string => n.toFixed(4);
  const basis =
    `${proc.label} @ ${region}: ${netLoad} kg/load / ${g(cycleH)} h`
    + (cdFactor !== 1 ? ` (cycle x${cdFactor.toFixed(3)} for ECD ${opts.effectiveCaseDepthMm} mm)` : '')
    + ` x ${shop.operatingHoursPerYear.value} h x ${shop.oee.value} OEE = `
    + `${Math.round(throughput).toLocaleString()} kg/yr. `
    + `energy ${g(energy)} + labour ${g(labour)} + capital ${g(capital)} + maint ${g(maintenance)} `
    + `+ consumables ${g(consumables)} + fixtures ${g(fixtures)} + overhead ${g(overhead)} `
    + `+ QC ${g(qc)} = conversion ${g(conversion)} + scrap ${g(scrap)} = in-house ${g(inHouse)}`
    + (subcontracted
      ? ` + SG&A ${g(sga)} + margin ${g(margin)} + freight ${g(logistics)} = buy ${g(ratePerKg)} GBP/kg`
      : ` GBP/kg (captive — no SG&A, margin or freight)`)
    + (minimumChargeUpliftPerKg > 0
      ? `; lifted ${g(minimumChargeUpliftPerKg)} by the GBP ${opts.minimumLotChargeGBP} lot minimum`
      : '');

  return {
    processId: proc.id, label: proc.label, region,
    energy, labour, capital, maintenance, consumables, fixtures, overhead, qc,
    conversion, scrap, inHouse, sga, margin, logistics,
    ratePerKg, minimumChargeUpliftPerKg,
    effectiveCycleHours: cycleH, caseDepthFactor: cdFactor,
    netLoadKg: netLoad, throughputKgPerYear: throughput,
    basis, energyFloorPerKg: energy,
  };
}

/**
 * The workbook's negotiation test, as code.
 *
 * Divide a quoted rate by the energy cost alone. Below about 2.5 the quote is
 * either using cheaper energy than grid tariff (captive solar, open access, waste
 * heat), loading a far denser charge than assumed, a loss-leader to win the
 * machining package, or not covering its capital. All four are worth asking
 * about; none of them is "the supplier is just cheaper".
 */
export const ENERGY_FLOOR_RATIO = 2.5;

export function energyFloorVerdict(quotedRatePerKg: number, energyPerKg: number): {
  ratio: number; implausible: boolean; message: string | null;
} {
  if (energyPerKg <= 0 || quotedRatePerKg <= 0) {
    return { ratio: Infinity, implausible: false, message: null };
  }
  const ratio = quotedRatePerKg / energyPerKg;
  if (ratio >= ENERGY_FLOOR_RATIO) return { ratio, implausible: false, message: null };
  return {
    ratio, implausible: true,
    message:
      `Quoted £${quotedRatePerKg.toFixed(3)}/kg is only ${ratio.toFixed(1)}x the energy cost alone `
      + `(£${energyPerKg.toFixed(3)}/kg) — below the ~${ENERGY_FLOOR_RATIO}x floor a heat-treater `
      + 'needs to cover labour, capital and overhead. Ask which applies: cheaper energy than grid '
      + 'tariff (captive generation, open access, waste heat), a denser furnace charge than assumed, '
      + 'a loss-leader to win the machining package, or a rate that is not covering its capital.',
  };
}

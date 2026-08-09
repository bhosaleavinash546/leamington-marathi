/**
 * Gear manufacturing — cylindrical spur and helical, external and internal.
 *
 * ## What this module owns, and what it deliberately does not
 *
 * It owns everything that happens to a gear BLANK: cutting the teeth, hardening
 * them, finishing them, deburring and inspecting. It does not own the blank. A
 * forged or turned gear blank is already costable by `forging.ts` and
 * `machining.ts`, and duplicating that here would mean two material models that
 * drift. So `blankCostPerPart` comes in as a number, the way `pcba.ts` takes
 * `pcbCostPerBoard` from `pcb-fab.ts`, and the report shows the blank as its own
 * line with its own provenance.
 *
 * ## Where the numbers come from
 *
 * Three sources, kept strictly apart because they have different trust levels:
 *
 *   1. `gear-cycle.ts` — cycle times, from generating kinematics. Arithmetic.
 *   2. `gear-shop-data.ts` — feeds, speeds, tool life, heat-treat rates.
 *      EMPIRICAL, and representative until a plant replaces the file.
 *   3. `rate-library.ts` — £/hr and £/kg. Library-owned, as for every commodity.
 *
 * The golden rule holds: nothing here sets a price. It picks machines, computes
 * times from geometry, and hands both to `computeUniversalStack`.
 *
 * ## The failure this module refuses to have
 *
 * A gear outside the machine envelope, or outside the shop data's module bands,
 * does NOT get costed on the nearest machine with an extrapolated feed. It
 * returns `blocked` and the caller must stop. An extrapolated feed produces a
 * cycle time that looks exactly like a real one, and there is no way for the
 * reader to tell — which is the same reason the CAD path refuses to guess a
 * material grade.
 */
import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  adviseGearRoute, GEAR_PROCESS_REFERENCE,
  type GearProcess, type GearRouteRecommendation, type GearQualityClass,
} from './gear-advisor.js';
import { pickGearMachineId, HEAT_TREAT_NOT_A_MACHINE } from '../machine-sizing.js';
import {
  hobbingCycleSec, shapingCycleSec, skivingCycleSec, grindingCycleSec,
  pitchDiameterMm, toothSpaceVolumeMm3, type CycleBreakdown,
} from '../gear-cycle.js';
import {
  activeGearShopData, resolveCutting, gearDataWarning,
  type GearMaterialClass, type GearShopData,
} from '../gear-shop-data.js';

export interface GearInputs {
  // ── The gear, as the drawing defines it ──
  normalModuleMm: number;
  teeth: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  internal: boolean;
  /** ISO 1328 flank tolerance class. Lower is tighter. Automotive lands 5–8. */
  qualityClass: GearQualityClass;
  materialClass: GearMaterialClass;
  caseHardened: boolean;
  nvhCritical?: boolean;

  // ── The blank, priced elsewhere ──
  /** £ per part for the forged or turned blank, from forging.ts / machining.ts. */
  blankCostPerPart: number;
  /** Finished gear weight, kg — drives heat-treat cost, which is bought by weight. */
  netWeightKg: number;
  /** Blank material id, for the report. Cost comes from `blankCostPerPart`. */
  materialId: string;

  // ── Programme ──
  annualVolume: number;
  amortizationVolume: number;
  batchSize: number;
  setupTimeHrPerOperation?: number;

  // ── Overrides. Absent means "let the advisor decide". ──
  forcedCuttingProcess?: GearProcess;
  hobStarts?: number;
  hobDiameterMm?: number;
  skivingCutterTeeth?: number;
  skivingCutterDiameterMm?: number;
  rejectRate?: number;
  labourId?: string;
  /** Shop data override, for tests and for costing against a named plant. */
  shopData?: GearShopData;
}

export interface GearOperationDetail {
  process: GearProcess;
  label: string;
  reason: string;
  machineId: string;
  cycleSec: number;
  /** The arithmetic behind the cycle, printable end to end. */
  basis: string;
}

export interface GearAnalysis {
  route: GearRouteRecommendation;
  operations: GearOperationDetail[];
  pitchDiameterMm: number;
  outerDiameterMm: number;
  metalRemovedMm3: number;
  totalCycleSec: number;
  toolingCostPerPart: number;
  heatTreatCostPerPart: number;
  /** Present whenever the estimate rests on representative shop data. */
  dataWarning: string | null;
  /** Non-fatal cautions from routing and machine selection. */
  warnings: string[];
  /** Set when the gear cannot be costed. `computeGearDrivers` throws on this. */
  blocked?: string;
}

/**
 * Labour by operation, because a gear shop does not man them the same.
 *
 * A hobber or grinder is a skilled setter's machine; a deburr cell is
 * semi-skilled; a gear checker is an inspector's. Manning them all as "skilled"
 * over-states labour on the cheap operations and under-states the metrology,
 * and both errors are invisible in a total.
 */
const LABOUR_BY_PROCESS: Partial<Record<GearProcess, string>> = {
  deburr: 'lab-uk-semiskilled',
  inspection: 'lab-uk-inspector',
};
const DEFAULT_LABOUR = 'lab-uk-skilled';

/** Outside diameter, mm — pitch + two addenda. What the machine must swing. */
export function gearOuterDiameterMm(i: Pick<GearInputs, 'teeth' | 'normalModuleMm' | 'helixAngleDeg'>): number {
  return pitchDiameterMm(i.teeth, i.normalModuleMm, i.helixAngleDeg) + 2 * i.normalModuleMm;
}

/**
 * Per-part tool cost for one cutting process.
 *
 * A gear tool is bought once, reground several times, and scrapped. So the cost
 * per part is the whole life divided by the whole output, not the purchase price
 * divided by the first sharpening — the latter over-states tooling by the number
 * of regrinds, which on a hob is an order of magnitude.
 */
export function toolCostPerPart(p: {
  toolCostGBP: number; partsBetweenRegrinds: number;
  regrindCostGBP: number; regrindsBeforeScrap: number;
}): { perPart: number; basis: string } {
  const lives = 1 + Math.max(0, p.regrindsBeforeScrap);
  const totalParts = Math.max(1, p.partsBetweenRegrinds * lives);
  const totalCost = p.toolCostGBP + p.regrindCostGBP * Math.max(0, p.regrindsBeforeScrap);
  return {
    perPart: totalCost / totalParts,
    basis: `£${p.toolCostGBP} tool + ${p.regrindsBeforeScrap} regrinds × £${p.regrindCostGBP} = `
      + `£${totalCost.toFixed(0)} over ${totalParts.toLocaleString()} parts `
      + `(${p.partsBetweenRegrinds.toLocaleString()} × ${lives} lives)`,
  };
}

/**
 * Analyse the gear: route it, size each machine, time each operation.
 *
 * Separated from `computeGearDrivers` so the UI and the report can show the
 * route and the reasoning without running a costing, and so the whole decision
 * chain is unit-testable without a rate library.
 */
export function analyseGear(inputs: GearInputs): GearAnalysis {
  const data = inputs.shopData ?? activeGearShopData();
  const warnings: string[] = [];

  const route = adviseGearRoute({
    normalModuleMm: inputs.normalModuleMm,
    teeth: inputs.teeth,
    helixAngleDeg: inputs.helixAngleDeg,
    faceWidthMm: inputs.faceWidthMm,
    internal: inputs.internal,
    qualityClass: inputs.qualityClass,
    caseHardened: inputs.caseHardened,
    nvhCritical: inputs.nvhCritical,
    annualVolume: inputs.annualVolume,
    forcedCuttingProcess: inputs.forcedCuttingProcess,
  });
  warnings.push(...route.warnings);

  const pitchDia = pitchDiameterMm(inputs.teeth, inputs.normalModuleMm, inputs.helixAngleDeg);
  const outerDia = gearOuterDiameterMm(inputs);
  const metalRemoved = toothSpaceVolumeMm3(inputs);

  const base = {
    route, operations: [] as GearOperationDetail[],
    pitchDiameterMm: pitchDia, outerDiameterMm: outerDia, metalRemovedMm3: metalRemoved,
    totalCycleSec: 0, toolingCostPerPart: 0, heatTreatCostPerPart: 0,
    dataWarning: gearDataWarning(data), warnings,
  };

  if (route.blocked) return { ...base, blocked: route.blocked };

  const cutting = resolveCutting(inputs.materialClass, inputs.normalModuleMm, data);
  const needsCuttingParams = ['hobbing', 'shaping', 'skiving'].includes(route.cuttingProcess);
  if (needsCuttingParams && !cutting) {
    return {
      ...base,
      blocked: `No cutting parameters for ${inputs.materialClass} at module `
        + `${inputs.normalModuleMm} mm. The shop data covers `
        + `${data.cutting.filter(c => c.materialClass === inputs.materialClass)
            .map(c => `${c.moduleFromMm}–${c.moduleToMm} mm`).join(', ') || 'no bands for this material'}. `
        + `Extrapolating a feed would produce a cycle time indistinguishable from a real one, so `
        + `the costing stops here — add the band to the shop data.`,
    };
  }

  const envelope = {
    normalModuleMm: inputs.normalModuleMm,
    outerDiameterMm: outerDia,
    faceWidthMm: inputs.faceWidthMm,
  };

  const ops: GearOperationDetail[] = [];
  let toolingPerPart = 0;
  let heatTreat = 0;
  const A = data.ancillary;
  const F = data.finishing;
  const T = data.tools;

  for (const step of route.steps) {
    const pick = pickGearMachineId(step.process, envelope);
    if (pick.blocked) return { ...base, blocked: pick.blocked };

    let cycle: CycleBreakdown | null = null;
    let flatSec: number | null = null;

    switch (step.process) {
      case 'hobbing': {
        const c = cutting!;
        cycle = hobbingCycleSec({
          teeth: inputs.teeth, normalModuleMm: inputs.normalModuleMm,
          helixAngleDeg: inputs.helixAngleDeg, faceWidthMm: inputs.faceWidthMm,
          hobDiameterMm: inputs.hobDiameterMm ?? Math.max(70, 12 * inputs.normalModuleMm),
          hobStarts: inputs.hobStarts ?? 2,
          cuttingSpeedMPerMin: c.hobSpeedMPerMin.value,
          axialFeedMmPerRev: c.hobFeedMmPerRev.value,
          cuts: c.hobCuts.value,
          loadUnloadSec: A.loadUnloadSec.value,
        });
        toolingPerPart += toolCostPerPart({
          toolCostGBP: T.hobCostGBP.value,
          partsBetweenRegrinds: T.hobPartsBetweenRegrinds.value,
          regrindCostGBP: T.hobRegrindCostGBP.value,
          regrindsBeforeScrap: T.hobRegrindsBeforeScrap.value,
        }).perPart;
        break;
      }
      case 'shaping': {
        const c = cutting!;
        cycle = shapingCycleSec({
          teeth: inputs.teeth, normalModuleMm: inputs.normalModuleMm,
          helixAngleDeg: inputs.helixAngleDeg, faceWidthMm: inputs.faceWidthMm,
          strokesPerMin: c.shaperStrokesPerMin.value,
          circularFeedMmPerStroke: c.shaperCircularFeedMmPerStroke.value,
          roughingPasses: c.shaperPasses.value,
          loadUnloadSec: A.loadUnloadSec.value,
        });
        toolingPerPart += toolCostPerPart({
          toolCostGBP: T.shaperCutterCostGBP.value,
          partsBetweenRegrinds: T.shaperCutterPartsBetweenRegrinds.value,
          regrindCostGBP: T.shaperCutterRegrindCostGBP.value,
          regrindsBeforeScrap: T.shaperCutterRegrindsBeforeScrap.value,
        }).perPart;
        break;
      }
      case 'skiving': {
        const c = cutting!;
        cycle = skivingCycleSec({
          teeth: inputs.teeth, normalModuleMm: inputs.normalModuleMm,
          helixAngleDeg: inputs.helixAngleDeg, faceWidthMm: inputs.faceWidthMm,
          cutterTeeth: inputs.skivingCutterTeeth ?? 25,
          cutterDiameterMm: inputs.skivingCutterDiameterMm
            ?? Math.max(60, 25 * inputs.normalModuleMm),
          cuttingSpeedMPerMin: c.skiveSpeedMPerMin.value,
          axialFeedMmPerRev: c.skiveFeedMmPerRev.value,
          cuts: c.skiveCuts.value,
          loadUnloadSec: A.loadUnloadSec.value,
        });
        toolingPerPart += toolCostPerPart({
          toolCostGBP: T.skivingCutterCostGBP.value,
          partsBetweenRegrinds: T.skivingCutterPartsBetweenRegrinds.value,
          regrindCostGBP: T.skivingCutterRegrindCostGBP.value,
          regrindsBeforeScrap: T.skivingCutterRegrindsBeforeScrap.value,
        }).perPart;
        break;
      }
      case 'grinding': {
        cycle = grindingCycleSec({
          teeth: inputs.teeth, normalModuleMm: inputs.normalModuleMm,
          helixAngleDeg: inputs.helixAngleDeg, faceWidthMm: inputs.faceWidthMm,
          grindingStockPerFlankMm: F.grindingStockPerFlankMm.value,
          specificRemovalRateMm3PerMmSec: F.gearGrindSpecificRateMm3PerMmSec.value,
          wheelWidthMm: F.gearGrindWheelWidthMm.value,
          dressingSecPerPart: F.gearGrindDressingSecPerPart.value,
          loadUnloadSec: A.loadUnloadSec.value,
        });
        toolingPerPart += T.grindingWheelCostGBP.value
          / Math.max(1, T.grindingWheelPartsPerWheel.value);
        break;
      }
      case 'shaving':  flatSec = F.shavingSecPerPart.value + A.loadUnloadSec.value; break;
      case 'honing':   flatSec = F.honingSecPerPart.value + A.loadUnloadSec.value; break;
      case 'deburr':   flatSec = A.deburrSecPerPart.value; break;
      case 'inspection': flatSec = A.inspectionSecPerPart.value; break;
      case 'case_hardening':
        // Bought by weight from a furnace, so it carries cost but no machine time.
        heatTreat += A.caseHardenCostPerKgGBP.value * inputs.netWeightKg;
        flatSec = 0;
        break;
      case 'broaching':
        // A broach is a single stroke; its time is dominated by handling. Without
        // a stroke-rate in the shop data there is nothing honest to compute, so
        // this is handling only and says so.
        flatSec = A.loadUnloadSec.value;
        warnings.push(
          'Broaching cycle is handling time only — the shop data carries no broach stroke rate. '
          + 'Add one before using a broached estimate.');
        break;
      case 'milling_5ax':
        // Milling one tooth space at a time. Without a milling feed for gear
        // forms in the shop data, refuse rather than invent one.
        return {
          ...base,
          blocked: '5-axis gear milling was selected (prototype volume or out-of-envelope module) '
            + 'but the shop data carries no gear-milling feed. Add one, or pin a cutting process.',
        };
    }

    const cycleSec = cycle ? cycle.totalSec : (flatSec ?? 0);
    ops.push({
      process: step.process,
      label: step.label,
      reason: step.reason,
      machineId: pick.machineId,
      cycleSec,
      basis: cycle
        ? cycle.basis
        : step.process === 'case_hardening'
          ? `${inputs.netWeightKg} kg × £${A.caseHardenCostPerKgGBP.value}/kg = `
            + `£${(A.caseHardenCostPerKgGBP.value * inputs.netWeightKg).toFixed(2)} (furnace, by weight)`
          : `${cycleSec} s flat rate from the shop data`,
    });

    // Cross-check every generated cycle against the metal it claims to remove.
    if (cycle && cycle.removalRateMm3PerMin > 500_000) {
      warnings.push(
        `${step.label} implies ${(cycle.removalRateMm3PerMin / 1000).toFixed(0)} cm³/min of metal `
        + `removal, which is beyond any gear machine. The feed or speed in the shop data is `
        + `probably wrong for this module.`);
    }
  }

  return {
    ...base,
    operations: ops,
    totalCycleSec: ops.reduce((s, o) => s + o.cycleSec, 0),
    toolingCostPerPart: toolingPerPart,
    heatTreatCostPerPart: heatTreat,
    warnings,
  };
}

/**
 * Cost drivers for the universal stack.
 *
 * Throws on a blocked analysis rather than returning a partial one. Every other
 * commodity module returns drivers unconditionally because their inputs are
 * always costable; a gear's are not, and a caller that silently costed a blocked
 * gear would publish a number for an operation the shop cannot perform.
 */
export function computeGearDrivers(inputs: GearInputs): CommodityDrivers {
  const a = analyseGear(inputs);
  if (a.blocked) throw new Error(`Gear cannot be costed: ${a.blocked}`);

  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  // The blank is a pass-through with its own provenance; heat treat is a
  // per-part consumable bought by weight, which is exactly what
  // `consumablesCostPerPart` is for.
  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.netWeightKg,
    materialUtilization: 1,
    directCost: inputs.blankCostPerPart * rejectUplift,
    ...(a.heatTreatCostPerPart > 0
      ? { consumablesCostPerPart: a.heatTreatCostPerPart * rejectUplift }
      : {}),
  };

  const setupHr = inputs.setupTimeHrPerOperation ?? 0;
  const batch = Math.max(1, inputs.batchSize);

  const operations: OperationInput[] = a.operations
    // Heat treat carries cost by weight, not machine hours — including it as a
    // zero-cycle operation would put an empty row on the operation sheet.
    .filter(o => o.machineId !== HEAT_TREAT_NOT_A_MACHINE)
    .map(o => {
      // Setup is amortised across the batch, the way every other module does it.
      const cycleHr = (o.cycleSec / 3600 + setupHr / batch) * rejectUplift;
      return {
        operationName: o.label,
        machineId: o.machineId,
        labourId: inputs.labourId ?? LABOUR_BY_PROCESS[o.process] ?? DEFAULT_LABOUR,
        cycleTimeHr: cycleHr,
        partsPerCycle: 1,
        oee: 0.80,
        manning: 1,
        labourTimeHr: cycleHr,
        labourEfficiency: 0.90,
      };
    });

  // Perishable gear tooling is a per-part consumable, not an amortised die, so
  // it is converted to a total over the amortisation volume rather than being
  // dropped into a bucket that divides it again.
  const tooling: ToolingInput = {
    totalToolingCost: a.toolingCostPerPart * inputs.amortizationVolume,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}

/** Field documentation, matching every other commodity module. */
export function getGearInputSchema(): Record<string, string> {
  return {
    normalModuleMm: 'number — normal module m_n, mm',
    teeth: 'number — tooth count z',
    helixAngleDeg: 'number — helix angle, degrees (0 = spur)',
    faceWidthMm: 'number — face width b, mm',
    internal: 'boolean — internal ring gear (true) or external (false)',
    qualityClass: 'number — ISO 1328 flank tolerance class, lower is tighter (automotive 5–8)',
    materialClass: 'case_hardening_steel | through_hardening_steel | alloy_steel_prehardened '
      + '| stainless | cast_iron | bronze | plastic',
    caseHardened: 'boolean — carburise/quench/temper, which forces hard finishing when the class is tight',
    nvhCritical: 'boolean? — buys a honing pass geometry alone would not',
    blankCostPerPart: 'number — £ for the forged/turned blank, from the forging or machining module',
    netWeightKg: 'number — finished gear weight kg; heat treat is bought by weight',
    materialId: 'string — blank material id from the rate library, for the report',
    annualVolume: 'number — annual build rate; drives broach-vs-skive and prototype routing',
    amortizationVolume: 'number — parts over which perishable tooling is spread',
    batchSize: 'number — parts per setup',
    setupTimeHrPerOperation: 'number? — setup hours per operation, amortised over the batch',
    forcedCuttingProcess: 'GearProcess? — pin the cutting process, bypassing selection',
    hobStarts: 'number? — threads on the hob (default 2)',
    hobDiameterMm: 'number? — hob OD (default max(70, 12 × module))',
    skivingCutterTeeth: 'number? — teeth on the skiving cutter (default 25)',
    skivingCutterDiameterMm: 'number? — skiving cutter OD (default max(60, 25 × module))',
    rejectRate: 'number? — 0–1 scrapped fraction; uplifts blank, heat treat and cycle',
    labourId: 'string? — pin one labour id for every operation; default is per-process (lab-uk-skilled cutting/grinding, lab-uk-semiskilled deburr, lab-uk-inspector metrology)',
  };
}

export { GEAR_PROCESS_REFERENCE };

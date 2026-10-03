/**
 * `costInputSuggestions` → the inputs a commodity module actually costs.
 *
 * This is the hop that has never existed outside the browser. `applyRuleDecisions`
 * stops at `analysis.costInputSuggestions`; everything from there to
 * `compute<X>Drivers` lives in `src/ui/main.ts` inside `applyCADToForm` and the
 * `collect<Commodity>Input()` functions, which read the DOM. So a CAD analysis
 * has never been costable headlessly — not in a test, not in a script, not on
 * the server — and that is why no rules-vs-AI comparison of **£/part** has ever
 * been run. Only the material bucket could be checked.
 *
 * ## Why both arms go through this same function
 *
 * The comparison is only honest if the two analyses are converted identically.
 * An AI analysis and a rule analysis are the same shape — `CADAnalysisResult` —
 * so they map through one function, and any difference in the resulting cost is
 * a difference in what the two paths *decided*, never in how they were read.
 *
 * That has a deliberate consequence worth stating: the rules compute about 55
 * values that `RULE_PATH_MAP` has nowhere to put (`ApplyResult.notWritten` —
 * machine ids, fill/pack/eject splits, projected areas). Those never reach
 * `costInputSuggestions`, so they do not reach the cost here either. This
 * measures what the tool *ships*, not what the rules could do if fully wired.
 * Closing that gap is separate work; pretending it is already closed would make
 * the comparison flattering and useless.
 *
 * ## The defaults
 *
 * Shop parameters — OEE, manning, labour efficiency, scrap, the labour grade —
 * are not in a CAD file and never will be. They are pinned in `SHOP_DEFAULTS`
 * below, applied identically to both arms, so a cost difference can never be an
 * artefact of one arm getting a kinder shop. They are assumptions, not
 * measurements, and any number that moves because of them is attributable to
 * this block.
 */
import type { CADAnalysisResult, OCCTGeometry } from '../ai-analysis.js';
import { pickHPDCMachineId, pickStampingPressId, pickMachiningCentreId } from '../machine-sizing.js';
import { DEFAULT_RATE_LIBRARY } from '../rate-library.js';
import { computeFeatureMachining, secondaryMachiningMachineId } from '../feature-machining.js';
import { cuttingDataFor, CORED_ABOVE_MM, secondaryMachiningCell } from '../machining-time.js';
import { CUTTING_MANNING } from './commodities/machining.js';
import { standardBatchSize } from '../routing-optimiser.js';
import type { FeatureRow } from '../feature-ops.js';
import { estimatePackagingPerPart, estimateLogisticsPerPart } from '../geometry-sanity.js';
import { physicalRemovalCeilingMin } from '../feature-costing.js';
import { featureMinutesEach } from '../feature-machining.js';

/** Same machinability table the machining rules use — duplicated deliberately
 *  small rather than exporting rules internals into the mapper. */
const MACHINABILITY_FOR_CEILING: Partial<Record<MaterialFamily, number>> = {
  aluminium: 1.0, magnesium: 0.8, plastic: 0.6, 'copper alloy': 1.1,
  'cast iron': 1.4, steel: 1.5, titanium: 2.5,
};
import { representativeMaterialId, isLibraryMaterialId, familyFromMaterialId } from './derive/material.js';
import { rubberProcFromSuggestion } from '../modules/rubber-advisor.js';
import { estimateClampingTonnage, pickIMMPressId } from '../modules/injection-moulding.js';
import type { MaterialFamily } from '../material-family.js';

type CostInputs = CADAnalysisResult['costInputSuggestions'];

/**
 * The grade to price this part at.
 *
 * Two shapes arrive here. The AI path returns a real library id; the rules
 * return the **family** they resolved, because that is what a measured volume
 * plus an engineer's answer honestly settles. A family is not a price, so it
 * is mapped to a representative grade and reported as an assumption.
 */
function resolveMaterialId(
  commodity: string, carried: string, familyHint?: MaterialFamily | null,
): { id: string | null; assumed: string | null; family: MaterialFamily | null } {
  if (isLibraryMaterialId(carried)) {
    return { id: carried, assumed: null, family: familyFromMaterialId(carried) ?? familyHint ?? null };
  }
  // The model invents ids: round 1 of the A/B returned `mat-hss`, which is in
  // no library, and the whole part became uncostable. An invented id usually
  // still NAMES its family — resolve it through the same token matcher the
  // filenames use, substitute the representative grade, and say so out loud.
  const carriedFamily = carried ? familyFromMaterialId(carried) : null;
  const family = (carriedFamily ?? familyHint ?? (carried as MaterialFamily) ?? '') as MaterialFamily;
  if (!family) return { id: null, assumed: null, family: null };
  const id = representativeMaterialId(commodity, family);
  if (!id) return { id: null, assumed: null, family };
  const note = carried && carried !== family
    ? `materialId ('${carried}' is not in the rate library → ${family} → ${id})`
    : `materialId (${family} → ${id}, representative grade — not a drawing callout)`;
  return { id, assumed: note, family };
}

/**
 * Shop assumptions, identical for both arms.
 *
 * Values are ordinary mid-market figures: 80% OEE is a well-run line that is not
 * pretending, 92% labour efficiency allows for breaks and changeover, and a 2–5%
 * scrap band varies by how forgiving the process is.
 */
/** The press each rubber route runs on. Not a default — the route decides. */
const RUBBER_MACHINE: Record<string, string> = {
  compression_mould: 'compression-mould-std',
  transfer_mould: 'transfer-mould-std',
  injection_mould_lsr: 'lsr-injection-machine',
  extrusion_vulcanise: 'extruder-rubber-60mm',
  calendering: 'die-cut-press-rubber',
  die_cut: 'die-cut-press-rubber',
};

export const SHOP_DEFAULTS = {
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.92,
  rejectRate: 0.03,
  annualVolume: 100_000,
  /** £/part, both arms. The engine's own worked examples use this band. */
  packagingPerPart: 0.15,
  logisticsPerPart: 0.25,
  overheadPct: 0.12,
  marginPct: 0.08,
} as const;

/** Labour grade by commodity — a foundry hand is not a CNC setter. */
const LABOUR: Record<string, string> = {
  casting: 'lab-uk-foundry',
  cast_and_machine: 'lab-uk-foundry',
  forging: 'lab-uk-forge',
  machining: 'lab-uk-skilled',
  sheet_metal: 'lab-uk-semiskilled',
  sheet_metal_fab: 'lab-uk-skilled',
  injection_moulding: 'lab-uk-semiskilled',
  blow_moulding: 'lab-uk-blow',
  thermoforming: 'lab-uk-thermoform',
  rotational_moulding: 'lab-uk-roto',
  rubber: 'lab-uk-semiskilled',
  composites: 'lab-uk-skilled',
  gear: 'lab-uk-skilled',
};

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

export interface ToCostParamsResult {
  commodity: string;
  params: Record<string, unknown>;
  /** Inputs the analysis did not carry, filled from SHOP_DEFAULTS or a picker. */
  assumed: string[];
  /** Envelope-scaled when geometry was supplied; else the caller's flat default. */
  packagingPerPart?: number;
  logisticsPerPart?: number;
}


/**
 * The machining a near-net part still needs, measured.
 *
 * A knuckle is cast AND machined — its feature table is full of bores. The
 * browser has wired `computeFeatureMachining` into the casting and forging
 * forms for months; the headless path never did, which is how the knuckle
 * costed −57% against its manual with literally zero machining content.
 */
function secondaryMachining(
  geo: OCCTGeometry | undefined, labourId: string,
  family: MaterialFamily | null | undefined, coredAboveMm: number | undefined,
  weightKg: number, annualVolume: number,
): (ReturnType<typeof computeFeatureMachining> & { toolingGBP: number; toolWearPerPart: number }) | null {
  const rows = geo?.featureTable as FeatureRow[] | undefined;
  if (!rows?.length) return null;
  const fam = family ?? 'steel';
  const base = {
    machineId: secondaryMachiningMachineId(rows, 'near_net'), labourId, stockCondition: 'near_net' as const,
    // One operator tends two machining centres while they cut — the crew the
    // machining routes use (load / unload in the cell op takes a whole one).
    oee: SHOP_DEFAULTS.oee, manning: CUTTING_MANNING,
    labourEfficiency: SHOP_DEFAULTS.labourEfficiency,
    // The per-feature minutes are an aluminium baseline: a steel part's holes
    // take twice as long. Cored (cast) or pierced (forged) bores are finish-bored,
    // not cut from solid (machining review, Oct 2026).
    materialFactor: cuttingDataFor(fam).timeFactor,
    ...(coredAboveMm !== undefined ? { coredAboveMm } : {}),
  };
  // Cutting first, then the cell around it — load / unload, change-over,
  // fixtures, programming, tool wear — the same function the screen calls.
  const cut = computeFeatureMachining(rows, base);
  if (cut.featureCount === 0) return null;
  const c = secondaryMachiningCell({
    fixturings: geo?.setupAnalysis?.estimatedSetupCount ?? 2,
    weightKg, annualVolume, family: fam,
    featureRows: cut.lines.filter(l => l.included).length,
    cuttingMin: cut.totalCycleHr * 60,
    engineerRatePerHr: DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-engineer')?.fullyLoadedRatePerHr ?? 42.8,
  });
  const r = computeFeatureMachining(rows, { ...base, cell: c.cell });
  return { ...r, toolingGBP: c.toolingGBP, toolWearPerPart: c.toolWearPerPart };
}

/**
 * Build the `params` object `executeCalculateCost` feeds to `compute<X>Drivers`.
 *
 * Returns `null` for a commodity with no mapping yet rather than costing it
 * wrong — a silently-defaulted cost is worse than no cost, and this function
 * exists to be trusted by a comparison.
 */
export function toCostParams(
  commodity: string,
  ci: CostInputs,
  // Typed, not inferred: SHOP_DEFAULTS is `as const`, so leaving this to
  // inference narrows the parameter to the literal 100000 and every caller
  // with a real volume fails to typecheck.
  annualVolume: number = SHOP_DEFAULTS.annualVolume,
  familyHint?: MaterialFamily | null,
  geo?: OCCTGeometry,
): ToCostParamsResult | null {
  const assumed: string[] = [];
  const D = SHOP_DEFAULTS;
  const labourId = LABOUR[commodity] ?? 'lab-uk-skilled';
  assumed.push('oee', 'manning', 'labourEfficiency', 'rejectRate', 'labourId');

  // A caller can hand us an analysis with no cost inputs at all (a model reply
  // that omitted the block). Returning null is the contract; throwing here would
  // take down a whole comparison run for one bad part.
  if (!ci) return null;
  const mat = resolveMaterialId(commodity, ci.materialId, familyHint);
  if (!mat.id) return null;     // no grade, no honest price
  const materialId = mat.id;
  if (mat.assumed) assumed.push(mat.assumed);

  const shop = {
    labourId, oee: D.oee, manning: D.manning,
    labourEfficiency: D.labourEfficiency, rejectRate: D.rejectRate,
    amortizationVolume: annualVolume,
  };

  // Packaging scales with the shipping envelope — a 1.7 m bumper is not a 3 g
  // servo horn. Same estimators the browser has always applied; flat defaults
  // survive only when no geometry was supplied.
  let packagingPerPart: number | undefined;
  let logisticsPerPart: number | undefined;
  const bb = geo?.boundingBox;
  if (bb) {
    const bboxVolCm3 = (bb.xMm * bb.yMm * bb.zMm) / 1000;
    packagingPerPart = estimatePackagingPerPart(bboxVolCm3, num(ci.netWeightKg));
    logisticsPerPart = estimateLogisticsPerPart(num(ci.netWeightKg), bboxVolCm3);
  } else {
    assumed.push('flat packaging/logistics (no geometry supplied)');
  }
  const finish = (r: ToCostParamsResult | null): ToCostParamsResult | null =>
    r === null ? null : { ...r, packagingPerPart, logisticsPerPart };

  /**
   * The subtype-specific block a casting needs — die, pattern, mould or wax.
   *
   * Shared by `casting` and `cast_and_machine` because the second is the first
   * plus finish machining, and two copies of a die-cost mapping would drift.
   * Only the chosen subtype's block is built: the others are noise the schema
   * carries for every part. Pushes its own stated assumptions onto `assumed`.
   */
  function castingSubtypeBlock(
    c: NonNullable<CostInputs['casting']>, weightKg: number,
  ): Record<string, unknown> {
    if (c.subtype === 'hpdc') {
      // Tonnage is not in costInputSuggestions, so size from the plan area a
      // part of this mass implies rather than defaulting to one press.
      if (!c.hpdcMachineId) assumed.push('hpdc.machineId (from mass — no footprint rule)');
      return {
        hpdc: {
          machineId: c.hpdcMachineId || pickHPDCMachineId(weightKg * 220),
          cycleTimeSec: num(c.cycleTimeHpdcSec, 45),
          cavities: num(c.cavities, 1),
          dieCost: num(c.dieMouldCostGBP),
          dieLife: num(c.dieMouldLife, 100_000),
        },
      };
    }
    if (c.subtype === 'sand') {
      assumed.push('sand.mouldLineId', ...(c.coreCostPerPart === undefined ? ['sand.coreCostPerPart (0 — no rule decided it)'] : []));
      return {
        sand: {
          mouldLineId: 'sand-cast-line',
          cycleTimeHr: num(c.cycleTimeSandGravHr, 0.25),
          patternCost: num(c.dieMouldCostGBP),
          patternLife: num(c.dieMouldLife, 50_000),
          coreCostPerPart: num(c.coreCostPerPart, 0),
        },
      };
    }
    if (c.subtype === 'gravity') {
      assumed.push('gravity.machineId');
      return {
        gravity: {
          machineId: 'grav-die-cast-std',
          cycleTimeHr: num(c.cycleTimeSandGravHr, 0.08),
          mouldCost: num(c.dieMouldCostGBP),
          mouldLife: num(c.dieMouldLife, 50_000),
        },
      };
    }
    if (c.investWaxCostPerPart === undefined || c.investShellCostPerPart === undefined) {
      assumed.push('investment wax / shell (0 — no rule decided them)');
    }
    return {
      investment: {
        waxCostPerPart: num(c.investWaxCostPerPart, 0), shellBuildCostPerPart: num(c.investShellCostPerPart, 0),
        pourLabourId: labourId, pourCycleHr: num(c.cycleTimeSandGravHr, 0.15),
        pourMachineId: 'invest-cast-furnace', waxDieCost: num(c.dieMouldCostGBP),
      },
    };
  }

  /** The post-cast route the rules decided, as `casting` module inputs. */
  function postCast(c: NonNullable<CostInputs['casting']>): Record<string, number> {
    const out: Record<string, number> = {};
    if (num(c.fettlingMinutes) > 0) out.fettlingMinutes = num(c.fettlingMinutes);
    if (num(c.heatTreatCostPerKg) > 0) out.heatTreatCostPerKg = num(c.heatTreatCostPerKg);
    if (num(c.shotBlastCostPerPart) > 0) out.shotBlastCostPerPart = num(c.shotBlastCostPerPart);
    if (num(c.impregnationCostPerPart) > 0) out.impregnationCostPerPart = num(c.impregnationCostPerPart);
    if (num(c.ndtCostPerPart) > 0) out.ndtCostPerPart = num(c.ndtCostPerPart);
    if (num(c.leakTestSec) > 0) out.leakTestSec = num(c.leakTestSec);
    if (num(c.manning) > 0) out.manning = num(c.manning);
    return out;
  }

  return finish(buildParams());

  function buildParams(): ToCostParamsResult | null {
  switch (commodity) {
    case 'casting': {
      const c = ci.casting;
      if (!c) return null;
      const weight = num(ci.netWeightKg);
      const params: Record<string, unknown> = {
        ...shop,
        subtype: c.subtype,
        materialId,
        partWeightKg: weight,
        castingYield: num(c.yieldFraction, 0.65),
        ...postCast(c),
      };
      Object.assign(params, castingSubtypeBlock(c, weight));
      const sec = secondaryMachining(geo, 'lab-uk-skilled', mat.family, CORED_ABOVE_MM[c.subtype] ?? 20,
        weight, annualVolume);
      if (sec) {
        params.secondaryMachiningOps = sec.operations;
        // Fixtures + programming and tool wear, from the same cell the screen
        // prices (forging review, Oct 2026 — this used to be "not derived, 0").
        params.secondaryMachiningToolingCost = sec.toolingGBP;
        params.secondaryMachiningConsumablesPerPart = sec.toolWearPerPart;
      }
      return { commodity, params, assumed };
    }

    case 'cast_and_machine': {
      // A casting plus the finish machining that follows it. The rules pack
      // composes CASTING_RULES with MACHINING_RULES, so both halves arrive
      // populated and this mapping composes the same two — sharing
      // `castingSubtypeBlock` with `casting` rather than restating it.
      const c = ci.casting;
      if (!c) return null;
      const finished = num(ci.netWeightKg);
      const ops = (ci.estimatedOperations ?? []).filter(o => num(o.cycleTimeHr) > 0);
      const cycleHr = num(ci.estimatedCycleTimeHr);
      const machineId = ci.machining?.machineId
        || pickMachiningCentreId({ principalDirections: 3, axisymmetric: false });
      const batchSize = standardBatchSize(annualVolume);

      // The machining half is the shared machining rule set on a near-net cut
      // (machining review, Oct 2026): its operations carry their own crew and
      // OEE, and the batch, fixtures, programming and tool wear are rules.
      const mach = ci.machining;
      const camBatch = num(mach?.batchSize) || batchSize;
      assumed.push(
        ...(num(mach?.batchSize) ? [] : [`batchSize=${batchSize} (annualVolume / 20)`]),
        'partsPerCycle=1', 'labourTimeHr=cycleTimeHr',
        num(c.castPartWeightKg) > 0
          ? 'castPartWeightKg = finished + drilled-hole stock + face machining stock'
          : 'castPartWeightKg = finishedWeightKg (no machining allowance decided)',
      );

      return {
        commodity, assumed,
        params: {
          castingSubtype: c.subtype,
          materialId,
          castPartWeightKg: num(c.castPartWeightKg) > 0 ? num(c.castPartWeightKg) : finished,
          finishedWeightKg: finished,
          castingYield: num(c.yieldFraction, 0.65),
          rejectRate: D.rejectRate,
          castingLabourId: labourId,
          castingOee: D.oee,
          castingManning: num(c.manning) > 0 ? num(c.manning) : D.manning,
          castingLabourEfficiency: D.labourEfficiency,
          ...castingSubtypeBlock(c, finished),
          ...(num(c.fettlingMinutes) > 0 ? { fettlingMinutes: num(c.fettlingMinutes) } : {}),
          ...(num(c.heatTreatCostPerKg) > 0 ? { heatTreatmentCostPerKg: num(c.heatTreatCostPerKg) } : {}),
          ...(num(c.shotBlastCostPerPart) > 0 ? { shotBlastCostPerPart: num(c.shotBlastCostPerPart) } : {}),
          ...(num(c.impregnationCostPerPart) > 0 ? { impregnationCostPerPart: num(c.impregnationCostPerPart) } : {}),
          ...(num(c.ndtCostPerPart) > 0 ? { ndtCostPerPart: num(c.ndtCostPerPart) } : {}),
          ...(num(c.leakTestSec) > 0 ? { leakTestSec: num(c.leakTestSec) } : {}),

          machiningOps: (ops.length
            ? ops.map(o => ({
                name: o.name,
                machineId: o.machineId || machineId,
                cycleTimeHr: num(o.cycleTimeHr),
                labourId: o.labourId || LABOUR.machining || labourId,
                oee: num(o.oee, D.oee),
                manning: num(o.manning, D.manning),
                labourEfficiency: num(o.labourEfficiency, D.labourEfficiency),
                ...(o.benchOperation ? { benchOperation: true } : {}),
              }))
            : [{
                name: 'Finish machining', machineId, cycleTimeHr: cycleHr,
                labourId: LABOUR.machining || labourId,
                oee: D.oee, manning: D.manning, labourEfficiency: D.labourEfficiency,
              }]
          ).map(o => ({ ...o, type: 'milling', partsPerCycle: 1, labourTimeHr: o.cycleTimeHr })),
          machiningSetup: {
            setupTimeHr: num(ci.estimatedSetupTimeHr, 0.5),
            batchSize: camBatch,
            machineId,
            // The cutting is done by a machinist, not the foundry labour that
            // pours the casting — `labourId` here is `lab-uk-foundry`.
            labourId: LABOUR.machining || labourId,
          },
          machiningToolingCost: num(mach?.toolingCost),
          machiningProgrammingNRE: num(mach?.programmingNRE),
          ...(num(mach?.toolWearCostPerPart) > 0 ? { machiningToolWearCostPerPart: num(mach!.toolWearCostPerPart) } : {}),
          amortizationVolume: annualVolume,
        },
      };
    }

    case 'gear': {
      const g = ci.gear;
      // Every field here is rule-written with provenance; nothing is inferred.
      // The module refuses rather than guesses if one is missing, so a partial
      // gear analysis must not be dressed up as costable.
      if (!g || !num(g.normalModuleMm) || !num(g.teeth) || !num(g.faceWidthMm)) return null;

      // Deliberately NOT `...shop`: GearInputs takes its shop floor from
      // `shopData`, and oee / manning / labourEfficiency are not fields on it.
      // Spreading them would put dead keys in the params and imply they matter.
      const params: Record<string, unknown> = {
        normalModuleMm: num(g.normalModuleMm),
        teeth: num(g.teeth),
        helixAngleDeg: typeof g.helixAngleDeg === 'number' ? g.helixAngleDeg : 0,
        faceWidthMm: num(g.faceWidthMm),
        internal: g.internal === true,
        qualityClass: num(g.qualityClass, 7),
        materialClass: g.materialClass ?? 'case_hardening_steel',
        caseHardened: g.caseHardened !== false,
        blankCostPerPart: num(g.blankCostPerPart),
        netWeightKg: num(ci.netWeightKg),
        materialId,
        annualVolume,
        amortizationVolume: annualVolume,
        batchSize: num(g.batchSize, standardBatchSize(annualVolume)),
        // No labourId: passing the commodity default PINNED every operation to
        // a skilled machinist, overriding the module's per-process labour
        // (semi-skilled deburr, inspector metrology) that the screen uses
        // (gear review, Oct 2026).
        rejectRate: g.rejectRate !== undefined ? num(g.rejectRate) : D.rejectRate,
        ...(num(g.setupTimeHrPerOperation) > 0 ? { setupTimeHrPerOperation: num(g.setupTimeHrPerOperation) } : {}),
      };
      // Optional, and only when the rules actually decided them — passing a
      // zero would read as "no case depth" rather than "not stated".
      if (num(g.effectiveCaseDepthMm) > 0) params.effectiveCaseDepthMm = num(g.effectiveCaseDepthMm);
      if (num(g.blankPrepCycleSec) > 0) params.blankPrepCycleSec = num(g.blankPrepCycleSec);
      if (g.hardeningRoute) params.hardeningRoute = g.hardeningRoute;
      if (!num(g.qualityClass)) assumed.push('qualityClass (ISO 7 assumed)');
      if (!num(g.batchSize)) assumed.push('batchSize (standard EOQ)');
      return { commodity, params, assumed, packagingPerPart, logisticsPerPart };
    }

    case 'forging': {
      const f = ci.forging;
      if (!f) return null;
      const weight = num(ci.netWeightKg);
      // The rules size the press and compute the heat-treat / descale / NDT
      // adders; until the orphan mapping landed, none of it reached here and a
      // weight-tier hack picked the press. Carried values now win; the hack is
      // the stated fallback.
      const params: Record<string, unknown> = {
        ...shop,
        materialId,
        partWeightKg: weight,
        flashAndScaleKg: num(f.flashKg),
        yieldFraction: num(f.yieldFraction, 0.675),
        forgeId: f.forgeId || `forge-press-${weight > 12 ? 4000 : weight > 5 ? 2500 : 1600}t`,
        strokesToForm: num(f.strokes, 3),
        timePerBlowSec: num(f.timePerBlowSec, 10),
        // The line takt the rules decided; 0 falls back to strokes × time per blow.
        cycleTimeHr: num(f.cycleTimeHr),
        ...(f.labourId ? { labourId: f.labourId } : {}),
        ...(num(f.manning) > 0 ? { manning: num(f.manning) } : {}),
        ...(f.rejectRate !== undefined ? { rejectRate: num(f.rejectRate) } : {}),
        ...(f.furnaceType ? { furnaceType: f.furnaceType } : {}),
        ...(f.trimMachineId && num(f.trimCycleHr) > 0 ? {
          trimmingMachineId: f.trimMachineId, trimmingCycleHr: num(f.trimCycleHr),
          trimmingLabourId: f.trimLabourId || 'lab-uk-forge',
          ...(num(f.trimManning) > 0 ? { trimmingManning: num(f.trimManning) } : {}),
        } : {}),
        heatingEnergyKwhPerKg: num(f.heatingEnergyKwhPerKg, 0.35),
        dieLife: num(f.dieLife, 30_000),
        dieCost: num(f.dieCostGBP),
      };
      if (num(f.projectedAreaCm2) > 0) params.projectedAreaCm2 = num(f.projectedAreaCm2);
      if (f.dieSteel) params.dieSteel = f.dieSteel;
      if (num(f.dieImpressions) > 0) params.dieImpressions = num(f.dieImpressions);
      if (num(f.heatTreatCostPerKg) > 0) params.heatTreatCostPerKg = num(f.heatTreatCostPerKg);
      if (num(f.descaleCostPerKg) > 0) params.descaleCostPerKg = num(f.descaleCostPerKg);
      if (num(f.ndtCostPerPart) > 0) params.ndtCostPerPart = num(f.ndtCostPerPart);
      if (!f.forgeId) assumed.push('forgeId (weight-tier fallback)');
      // Bores above the pierce size are forged in (punched through the wad) and
      // finish-bored; smaller holes are drilled from solid.
      const sec = secondaryMachining(geo, 'lab-uk-skilled', mat.family,
        // An impression forging — one that makes flash — pierces its bores; the
        // screen reads the same signal off its flash field.
        f.process === 'open-die' ? undefined : CORED_ABOVE_MM.forging,
        weight, annualVolume);
      if (sec) {
        params.secondaryMachiningOps = sec.operations;
        params.secondaryMachiningToolingCost = sec.toolingGBP;
        params.secondaryMachiningConsumablesPerPart = sec.toolWearPerPart;
      }
      return { commodity, params, assumed };
    }

    case 'machining': {
      const ops = (ci.estimatedOperations ?? []).filter(o => num(o.cycleTimeHr) > 0);
      const cycleHr = num(ci.estimatedCycleTimeHr);
      const net = num(ci.netWeightKg);
      // The rules measure the billet from the envelope; net/0.65 survives only
      // as the no-geometry fallback (it is what the browser used for years).
      const stock = num(ci.machining?.stockWeightKg) || net / 0.65;
      const machineId = ci.machining?.machineId
        || pickMachiningCentreId({ principalDirections: 3, axisymmetric: false });
      // One batch per fortnightly-ish run — the SAME convention the routing
      // optimiser ranks with, imported so the two can never drift.
      const batchSize = standardBatchSize(annualVolume);
      // The golden rule, applied to TIME: whoever supplied these operations —
      // the rules or the model — the billed cycle cannot exceed what the stock
      // envelope can physically give up. The rules arm arrives pre-capped; the
      // model's ops arrived uncapped and stood, which is how its cycle numbers
      // become prices unexamined. Scale proportionally so the routing shape is
      // preserved and only the total moves.
      let opsScale = 1;
      if (geo?.volume?.cm3 && geo.boundingBox) {
        const stockCm3 = geo.boundingBox.xMm * geo.boundingBox.yMm * geo.boundingBox.zMm / 1000;
        const mf = MACHINABILITY_FOR_CEILING[mat.family ?? 'steel'] ?? 1.2;
        const holeRows = ((geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole');
        const drillMin = holeRows.reduce((sum, r) => sum + featureMinutesEach(r) * r.count, 0);
        const ceilingHr = (physicalRemovalCeilingMin(
          geo.volume.cm3, stockCm3, geo.surfaceArea?.cm2 ?? 0, mf) + drillMin * mf) / 60;
        const supplied = ops.reduce((sum, o) => sum + num(o.cycleTimeHr), 0) || cycleHr;
        if (supplied > ceilingHr * 1.05 && supplied > 0) {
          opsScale = ceilingHr / supplied;
          assumed.push(`cycle capped to the removal ceiling (${supplied.toFixed(3)} → ${ceilingHr.toFixed(3)} hr)`);
        }
      }
      if (!ci.machining?.stockWeightKg) assumed.push('stockWeightKg (net / 0.65 fallback)');
      const mach = ci.machining;
      const machBatch = num(mach?.batchSize) || batchSize;
      if (!num(mach?.batchSize)) assumed.push(`batchSize=${batchSize} (annualVolume / 20)`);
      assumed.push('partsPerCycle=1', 'labourTimeHr=cycleTimeHr');
      return {
        commodity, assumed,
        params: {
          materialId,
          netWeightKg: net,
          stockWeightKg: stock,
          materialUtilization: num(ci.machining?.materialUtilization)
            || (stock > 0 ? net / stock : 0.65),
          rejectRate: mach?.rejectRate !== undefined ? num(mach.rejectRate) : D.rejectRate,
          // `partsPerCycle` and `labourTimeHr` are required by the module and are
          // not on the analysis contract: one part per cycle, and the operator
          // attends the machine for the whole cut. Both are stated assumptions —
          // omitting them divides by zero and yields NaN rather than an error.
          // Crew, OEE and labour come from the plan when it states them.
          operations: (ops.length
            ? ops.map(o => ({
                name: o.name,
                machineId: o.machineId || pickMachiningCentreId({ principalDirections: 3, axisymmetric: false }),
                cycleTimeHr: num(o.cycleTimeHr),
                labourId: o.labourId || labourId,
                oee: num(o.oee, D.oee),
                manning: num(o.manning, D.manning),
                labourEfficiency: num(o.labourEfficiency, D.labourEfficiency),
                ...(o.benchOperation ? { benchOperation: true } : {}),
              }))
            : [{
                name: 'Machining', machineId, cycleTimeHr: cycleHr,
                labourId, oee: D.oee, manning: D.manning, labourEfficiency: D.labourEfficiency,
              }]
          ).map(o => ({
            ...o, type: 'milling', partsPerCycle: 1,
            cycleTimeHr: o.cycleTimeHr * opsScale,
            labourTimeHr: o.cycleTimeHr * opsScale,
          })),
          setup: {
            machineId, labourId,
            setupTimeHr: num(ci.estimatedSetupTimeHr, 0.5),
            batchSize: machBatch,
          },
          programmingNRE: num(mach?.programmingNRE),
          toolingCost: num(mach?.toolingCost),
          ...(num(mach?.toolWearCostPerPart) > 0 ? { toolWearCostPerPart: num(mach!.toolWearCostPerPart) } : {}),
          amortizationVolume: annualVolume,
        },
      };
    }

    case 'injection_moulding': {
      const m = ci.injectionMoulding;
      if (!m) return null;
      const area = num(m.projectedAreaCm2, 100);
      const wall = num(m.wallThicknessMm, 3);
      const cav = num(m.cavities, 1);
      const pressure = num(m.cavityPressureMPa, 30);
      if (m.regrindFraction === undefined) assumed.push('regrindFraction 0.2 (no rule decided it)');
      return {
        commodity, assumed: [...assumed, ...(m.machineId ? [] : ['machineId (sized from clamp force)'])],
        params: {
          ...shop,
          ...(num(m.manning) > 0 ? { manning: num(m.manning) } : {}),
          ...(m.rejectRate !== undefined ? { rejectRate: num(m.rejectRate) } : {}),
          materialId,
          partWeightKg: num(ci.netWeightKg),
          runnerSystem: m.runnerSystem === 'hot' ? 'hot' : 'cold',
          runnerWeightKg: num(m.runnerWeightKg),
          regrindFraction: m.regrindFraction !== undefined ? num(m.regrindFraction) : 0.2,
          cavities: cav,
          // The module reads the TOTAL across cavities; the rule carries one cavity.
          projectedAreaCm2: area * cav,
          cavityPressureMPa: pressure,
          wallThicknessMm: wall,
          // Resin-specific when the rules carried it (they compute it per resin);
          // the PP figure is the no-carry fallback.
          coolTimeFactorSPerMm2: num(m.coolTimeFactorSPerMm2, 3.16),
          fillTimeSec: num(m.fillTimeSec, 2),
          packTimeSec: num(m.packTimeSec, 6),
          ejectTimeSec: num(m.ejectTimeSec, 3),
          // Fallback sized from the clamp force — it used to pass the AREA (cm²)
          // where tonnes were expected.
          machineId: m.machineId || pickIMMPressId(estimateClampingTonnage({ projectedAreaCm2: area * cav, cavityPressureMPa: pressure })),
          steelClass: m.steelClass || undefined,
          mouldCost: num(m.mouldCostGBP),
          mouldLife: num(m.mouldLife, 1_000_000),
          ...(num(m.setupHoursPerChange) > 0 && num(m.batchSize) > 0 ? {
            setup: { hoursPerChange: num(m.setupHoursPerChange), batchSize: num(m.batchSize),
                     setterLabourId: 'lab-uk-technician', purgeKg: num(m.purgeKg) },
          } : {}),
          ...(num(m.mouldMaintenanceFraction) > 0 ? { mouldMaintenanceFraction: num(m.mouldMaintenanceFraction) } : {}),
          ...(num(m.dryingKwhPerKg) > 0 ? { drying: { kwhPerKg: num(m.dryingKwhPerKg) } } : {}),
        },
      };
    }

    case 'sheet_metal_fab':
    case 'sheet_metal': {
      const s = ci.sheetMetal;
      if (!s) return null;
      // Detected fastening hardware — the same three rows the screen fills, on the
      // same pedestal spot welder (sheet-metal review: headless ignored it).
      const hwRows = geo?.detectedHardware?.available ? (geo.detectedHardware.detected ?? []).slice(0, 3) : [];
      const hardware = hwRows.length ? {
        hardware: hwRows.map(h => ({ type: h.type, threadSize: h.threadSize, count: h.count })),
        hardwareMachineId: 'spotweld-gun-manual', hardwareLabourId: 'lab-uk-semiskilled',
      } : {};
      // The route the rules priced: laser + press brake goes to the fabrication
      // module. It used to be announced and never costed (sheet-metal review).
      if (s.route === 'fab' || (commodity === 'sheet_metal_fab' && s.route !== 'stamping')) {
        const fam = (DEFAULT_RATE_LIBRARY.materials.find(m => m.id === materialId)?.category ?? '').toLowerCase();
        const gas = /alumin|stainless/.test(fam) ? 'nitrogen' : 'oxygen';
        return {
          commodity: 'sheet_metal_fab',
          assumed: [...assumed, 'laser-trumpf-3030 / brake by blank size', `assist gas ${gas}`],
          params: {
            materialId,
            partWeightKg: num(ci.netWeightKg),
            materialUtilization: num(s.fabUtilization, 0.8),
            blankingMethod: 'laser',
            blankingMachineId: s.fabLaserId || 'laser-trumpf-3030',
            blankingLabourId: 'lab-uk-semiskilled',
            blankingCycleTimeSec: num(s.fabBlankingCycleSec, 60),
            assistGas: s.fabAssistGas || gas,
            ...(num(s.fabToleranceMm) > 0 ? { toleranceMm: num(s.fabToleranceMm) } : {}),
            bendCount: num(s.fabBendCount, 0),
            timePerBendSec: num(s.fabBendSec, 12),
            toolChangeCount: num(s.fabToolChanges, 2),
            toolChangeTimeSec: num(s.fabToolChangeSec, 900),
            batchSize: num(s.fabBatchSize, standardBatchSize(annualVolume)),
            bendMachineId: s.fabBrakeId || (Math.max(num(s.blankLengthMm), num(s.blankWidthMm)) > 1500 ? 'brake-trumpf-5230' : 'brake-trumpf-trubend3100'),
            bendLabourId: s.fabBrakeLabourId || 'lab-uk-skilled',
            oee: D.oee, manning: 1, labourEfficiency: D.labourEfficiency,
            rejectRate: s.fabRejectRate !== undefined ? num(s.fabRejectRate) : D.rejectRate,
            toolingCost: num(s.fabToolingGBP, 1500),
            amortizationVolume: annualVolume,
            ...hardware,
          },
        };
      }
      const L = num(s.blankLengthMm, 100);
      const W = num(s.blankWidthMm, 100);
      const t = num(s.thicknessMm, 1.5);
      const shear = num(s.shearStrengthMPa, 250);
      // Blanking force ≈ cut length × thickness × shear strength. The rules carry
      // the real cut length (DXF outline + holes, or the B-rep identity); the
      // rectangle's 2(L+W) is the last resort and ignores every hole — on the
      // seat bracket that is 1,012 mm against 1,940 mm, half the press.
      const perimeter = num(s.perimeterMm, 2 * (L + W));
      const tonnes = (perimeter * t * shear) / 9807;
      // With a developed blank the strip cell (pitch × width) is real, so the
      // metal bought is the strip the press feeds: cell × gauge × density. The
      // module then takes utilisation = net ÷ that, which counts the outline's
      // own scrap — the rectangle-on-rectangle ratio it falls back to cannot see
      // it, and on the seat bracket reads 96% for a blank that nests at 73%.
      const density = geo?.blank ? DEFAULT_RATE_LIBRARY.materials.find(m => m.id === materialId)?.densityKgPerM3 : undefined;
      return {
        commodity: 'sheet_metal', assumed: [...assumed, 'pressId', 'strokesPerMin', 'strip layout'],
        params: {
          ...shop,
          ...(num(s.manning) > 0 ? { manning: num(s.manning) } : {}),
          ...(s.rejectRate !== undefined ? { rejectRate: num(s.rejectRate) } : {}),
          materialId,
          netWeightKg: num(ci.netWeightKg),
          blankLengthMm: L, blankWidthMm: W, thicknessMm: t,
          perimeterMm: perimeter,
          shearStrengthMPa: shear,
          stripWidthMm: num(s.stripWidthMm, W * 1.1),
          pitchMm: num(s.pitchMm, L * 1.05),
          partsPerStroke: 1,
          ...(density ? { densityKgPerM3: density } : {}),
          ...(s.pressLine ? { pressLine: s.pressLine } : {}),
          ...(s.pressesInLine ? { pressesInLine: num(s.pressesInLine) } : {}),
          ...(s.blankingMethod && s.blankingMethod !== 'none' && num(s.blanksPerMin) > 0
            ? { blanking: { method: s.blankingMethod, blanksPerMin: num(s.blanksPerMin) } } : {}),
          ...(num(s.drawAddendumMm) > 0 ? { drawAddendumMm: num(s.drawAddendumMm) } : {}),
          pressId: (typeof s.pressId === 'string' && s.pressId) || pickStampingPressId(tonnes),
          // Feed-limited when the rules carried it; 20 SPM was the old blind
          // default and alone inflated the cross-member cycle ~4.5×.
          strokesPerMin: num(s.strokesPerMin, 45),
          numOperations: num(s.numOps, 3),
          dieType: (s.dieType as string | undefined) || 'progressive',
          dieLife: num(s.dieLife, 1_000_000),
          dieCostEstimate: num(s.dieCostGBP),
          ...(num(s.setupHoursPerChange) > 0 && num(s.batchSize) > 0
            ? { setup: { hoursPerChange: num(s.setupHoursPerChange), batchSize: num(s.batchSize), setterLabourId: 'lab-uk-technician' } } : {}),
          ...(num(s.dieMaintenanceFraction) > 0 ? { dieMaintenanceFraction: num(s.dieMaintenanceFraction) } : {}),
          ...hardware,
        },
      };
    }

    case 'rubber': {
      const rb = ci.rubber;
      if (!rb) return null;
      // The suggestion schema uses short process tokens and the module uses long
      // ones. Refuse an unknown token rather than default it: transfer against
      // compression is a different cycle and a different tool.
      const proc = rubberProcFromSuggestion(rb.process);
      if (!proc) return null;
      const machineId = RUBBER_MACHINE[proc];
      assumed.push(`${machineId} (from the ${proc.replace(/_/g, ' ')} route)`);
      assumed.push('oee/manning/labourEfficiency from shop defaults');
      const rubLab = rb.labourId || 'lab-uk-semiskilled';
      return {
        commodity, assumed,
        params: {
          ...shop,
          ...(num(rb.manning) > 0 ? { manning: num(rb.manning) } : {}),
          ...(num(rb.oee) > 0 ? { oee: num(rb.oee) } : {}),
          ...(num(rb.labourEfficiency) > 0 ? { labourEfficiency: num(rb.labourEfficiency) } : {}),
          ...(rb.rejectRate !== undefined ? { rejectRate: num(rb.rejectRate) } : {}),
          labourId: rubLab,
          materialId,
          partWeightKg: num(ci.netWeightKg),
          flashAndRunnerWeightKg: num(rb.flashWeightKg),
          process: proc,
          machineId: rb.machineId || machineId,
          cycleTimeSec: num(rb.cycleTimeSec),
          cavities: Math.max(1, Math.round(num(rb.cavities, 1))),
          mouldCost: num(rb.mouldCostGBP),
          mouldLife: num(rb.mouldLife, 200_000),
          ...(rb.cureOvenMachineId && num(rb.cureTimeSec) > 0
            ? { cureOvenMachineId: rb.cureOvenMachineId, cureTimeSec: num(rb.cureTimeSec) } : {}),
          ...(num(rb.deflashCycleSec) > 0 ? { deflashCycleSec: num(rb.deflashCycleSec), deflashLabourId: rubLab } : {}),
          ...(num(rb.postCureHours) > 0 ? { postCure: { hours: num(rb.postCureHours), loadKg: 100, machineId: 'cure-oven-rubber' } } : {}),
          ...(num(rb.setupHoursPerChange) > 0 ? { setup: { hoursPerChange: num(rb.setupHoursPerChange),
            batchSize: num(rb.batchSize) || standardBatchSize(annualVolume), labourId: 'lab-uk-technician' } } : {}),
          ...(num(rb.metalInserts) > 0 ? { metalInserts: num(rb.metalInserts) } : {}),
        },
      };
    }

    case 'rotational_moulding': {
      const rm = ci.rotationalMoulding;
      if (!rm) return null;
      const arms = Math.max(1, Math.round(num(rm.numArms, 1)));
      // The machine follows the arm count the rules derived, not a default.
      const machineId = arms >= 4 ? 'rotomould-carousel-4arm'
        : arms >= 3 ? 'rotomould-biaxial'
        : arms === 2 ? 'rotomould-shuttle' : 'rotomould-lab-1arm';
      const perArm = Math.max(1, Math.round(num(rm.partsPerArm, 1)));
      assumed.push(`${machineId} (from ${arms} arm${arms === 1 ? '' : 's'})`);
      assumed.push('loadUnloadTimeSec=60', 'powderCostAdderPerKg=0 (no grinding premium stated)');
      // Say the tool count out loud. `mouldCostGBP` prices ONE tool, and roto
      // needs one per station, so the module charges arms x partsPerArm of them.
      // On a 4-arm carousel at 8 parts an arm that is 32 tools, and the tooling
      // bucket then dominates a small part — which is the model being
      // consistent, not a fault, but it is not obvious from a total.
      assumed.push(`${arms * perArm} moulds (${arms} arms x ${perArm} per arm) at the stated per-mould cost`);
      return {
        commodity, assumed,
        params: {
          ...shop,
          materialId,
          partWeightKg: num(ci.netWeightKg),
          // Grinding pellet to powder is a real adder, but no rule states one and
          // inventing a figure would move the material bucket silently.
          powderCostAdderPerKg: 0,
          numArms: arms,
          partsPerArm: perArm,
          heatingTimeSec: num(rm.heatTimeSec),
          coolingTimeSec: num(rm.coolTimeSec),
          loadUnloadTimeSec: 60,
          machineId,
          mouldCost: num(rm.mouldCostGBP),
          mouldLife: num(rm.mouldLife, 10_000),
        },
      };
    }

    case 'thermoforming': {
      const tf = ci.thermoforming;
      if (!tf) return null;
      // Sheet weight over part weight is how many parts the sheet yields — the
      // rules measure both, so this is arithmetic rather than an assumption.
      const partKg = num(tf.partWeightKg) || num(ci.netWeightKg);
      const sheetKg = num(tf.sheetWeightKg);
      const perSheet = partKg > 0 && sheetKg > 0 ? Math.max(1, Math.round(sheetKg / partKg)) : 1;
      const areaCm2 = geo?.surfaceArea?.cm2 ?? 0;
      // A cut-sheet former for a small part, an inline machine for a large one.
      const machineId = tf.method === 'pressure' ? 'thermoform-pressure'
        : areaCm2 > 5_000 ? 'thermoform-large' : 'thermoform-small';
      assumed.push(`${machineId} (${tf.method ?? 'vacuum'} forming at ${areaCm2.toFixed(0)} cm² surface)`);
      assumed.push('indexTimeSec=6', `partsPerSheet=${perSheet} (sheet weight / part weight)`);
      return {
        commodity, assumed,
        params: {
          ...shop,
          materialId,
          sheetWeightKg: sheetKg,
          partsPerSheet: perSheet,
          partWeightKg: partKg,
          method: tf.method,
          machineId,
          heatTimeSec: num(tf.heatTimeSec),
          formTimeSec: num(tf.formTimeSec),
          trimTimeSec: num(tf.trimTimeSec),
          indexTimeSec: 6,
          toolCost: num(tf.toolCostGBP),
        },
      };
    }

    case 'blow_moulding': {
      const b = ci.blowMoulding;
      if (!b) return null;
      return {
        commodity, assumed: [...assumed, 'machineId', 'coolTimeFactor', 'parisonExtrusionTime'],
        params: {
          ...shop,
          materialId,
          partWeightKg: num(ci.netWeightKg),
          flashWeightKg: num(b.flashWeightKg),
          wallThicknessMm: num(b.wallThicknessMm, 3),
          coolTimeFactorSPerMm2: 2.5,
          blowTimeSec: num(b.blowTimeSec, 8),
          openCloseSec: num(b.openCloseSec, 4),
          machineId: b.subtype === 'sbm' ? 'blow-sbm-2stage'
            : b.subtype === 'ibm' ? 'blow-ibm-linear'
            : b.barrierMultilayer ? 'blow-ebm-coex5' : 'blow-ebm-500l',
          cavities: num(b.cavities, 1),
          mouldCost: num(b.mouldCostGBP),
          mouldLife: num(b.mouldLife, 1_000_000),
          parisonExtrusionTimeSec: 6,
        },
      };
    }

    default:
      // No mapping yet. Returning null beats returning a plausible wrong number.
      return null;
  }
  }
}

/** Commodities `toCostParams` can convert today. */
export const COSTABLE_COMMODITIES = [
  'casting', 'cast_and_machine', 'forging', 'machining', 'injection_moulding',
  'sheet_metal', 'sheet_metal_fab', 'blow_moulding', 'gear', 'rubber', 'rotational_moulding',
  'thermoforming',
];

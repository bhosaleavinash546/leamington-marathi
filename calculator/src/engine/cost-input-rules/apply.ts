/**
 * Write the rules' answers over the model's.
 *
 * Telling a model "yieldFraction=0.743, use verbatim" is a request, not a
 * guarantee. This is the guarantee: after the model replies, every field a rule
 * decided is overwritten with the rule's value, and what changed is reported so
 * the swap is visible on the record rather than silent.
 *
 * It is the golden rule — *the AI never sets a price* — extended one layer down.
 * Rates were always library-owned; now the cost inputs the rates multiply are
 * engine-owned too, wherever the engine can derive them. Where it cannot, the
 * model's answer stands and is labelled as the model's.
 *
 * ## The path map, and why it is explicit
 *
 * Rule paths are namespaced and self-describing (`casting.yieldFraction`,
 * `machining.netWeightKg`). `costInputSuggestions` is not: casting lives in a
 * `casting` sub-object, machining lives at the top level, and three fields need
 * a unit or vocabulary conversion on the way across —
 *
 *   - `composites.areaM2` → `composites.areaCm2`   (x 10,000)
 *   - `composites.cureTimeHr` → `cureTimeSec`      (x 3,600)
 *   - `rubber.process` → the consumer's shorter process words
 *
 * A mechanical prefix rule would have written `areaM2` into a field read as cm²
 * and been wrong by four orders of magnitude, quietly. So every mapping is
 * written out, and any rule path with no mapping is reported in `notWritten`
 * rather than dropped — a value the engine computes and nothing consumes is a
 * gap worth seeing, not a thing to hide.
 */
import type { CostInputRuleResult } from './types.js';

/** How one rule path lands on `costInputSuggestions`. */
interface FieldMapping {
  /** Dot path within `costInputSuggestions`. */
  to: string;
  /** Unit or vocabulary conversion, when the two shapes disagree. */
  transform?: (v: unknown) => unknown;
}

/** The consumer's rubber process words are shorter than the advisor's. */
const RUBBER_PROCESS: Record<string, string> = {
  compression_mould: 'compression',
  transfer_mould: 'transfer',
  injection_mould_lsr: 'injection',
  extrusion_vulcanise: 'extrusion',
  calendering: 'calendering',
  die_cut: 'die_cut',
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Rule path → `costInputSuggestions` path.
 *
 * Absent means "computed, but nothing downstream reads it". Those values still
 * reach the report and the trace; they simply have no form field yet. The
 * biggest such gap today is machining's `stockWeightKg` / `materialUtilization`,
 * which the browser still derives as a flat `net x 1.4` — closing it is a client
 * change, not a mapping one.
 */
const RULE_PATH_MAP: Record<string, FieldMapping> = {
  // ── shared top-level fields ────────────────────────────────────────────────
  'casting.netWeightKg': { to: 'netWeightKg' },
  // The confirmed-family grade overwrites the AI's — else cast-iron mass was
  // priced at the AI's aluminium grade (final verification run).
  'casting.materialId': { to: 'materialId' },
  'machining.netWeightKg': { to: 'netWeightKg' },
  'machining.estimatedCycleTimeHr': { to: 'estimatedCycleTimeHr' },
  'machining.setupTimeHr': { to: 'estimatedSetupTimeHr' },
  // The orphan wiring. Every entry below existed as a computed rule with no
  // consumer — the A/B (docs/ab-rules-vs-ai.md) showed the AI beating the rules
  // on precisely these fields, because the model fills them while the rules
  // calculated them and dropped them. `notWritten` should now be near-empty.
  'machining.stockWeightKg': { to: 'machining.stockWeightKg' },
  'machining.materialUtilization': { to: 'machining.materialUtilization' },
  'machining.setupCount': { to: 'machining.setupCount' },
  'machining.machineId': { to: 'machining.machineId' },
  'machining.operations': {
    to: 'estimatedOperations',
    // OperationPlan[] → SuggestedOperation[]: the plan deliberately carries no
    // labour/OEE (those are shop context, not geometry); consumers default them.
    // Non-array fallback is [] — the old `: v` passthrough let a prose string
    // reach `estimatedOperations`, and every consumer of that field `.map()`s
    // it (the browser CAM loop, the analysis PDF), crashing both (audit F7).
    // The plan now states each operation's crew, OEE and labour (machining
    // review, Oct 2026) — carried through so headless and the screen cost the
    // same crew rather than each defaulting its own.
    transform: v => Array.isArray(v)
      ? v.map(o => {
          const op = o as { name: unknown; machineId: unknown; cycleTimeHr: unknown; faceIds?: unknown;
            labourId?: unknown; manning?: unknown; oee?: unknown; benchOperation?: unknown };
          return {
            name: String(op.name),
            machineId: String(op.machineId),
            cycleTimeHr: num(op.cycleTimeHr),
            ...(typeof op.labourId === 'string' ? { labourId: op.labourId } : {}),
            ...(typeof op.manning === 'number' ? { manning: op.manning } : {}),
            ...(typeof op.oee === 'number' ? { oee: op.oee } : {}),
            ...(op.benchOperation === true ? { benchOperation: true } : {}),
            // Built by the rules from measured geometry — the near-net guard
            // bounds AI times, never this plan (machining review, Oct 2026).
            measured: true,
            ...(Array.isArray(op.faceIds)
              ? { faceIds: (op.faceIds as unknown[]).filter((x): x is number => typeof x === 'number') }
              : {}),
          };
        })
      : [],
  },
  'machining.batchSize': { to: 'machining.batchSize' },
  'machining.rejectRate': { to: 'machining.rejectRate' },
  'machining.toolingCost': { to: 'machining.toolingCost' },
  'machining.programmingNRE': { to: 'machining.programmingNRE' },
  'machining.toolWearCostPerPart': { to: 'machining.toolWearCostPerPart' },
  'injectionMoulding.fillTimeSec': { to: 'injectionMoulding.fillTimeSec' },
  'injectionMoulding.packTimeSec': { to: 'injectionMoulding.packTimeSec' },
  'injectionMoulding.ejectTimeSec': { to: 'injectionMoulding.ejectTimeSec' },
  'injectionMoulding.coolTimeFactorSPerMm2': { to: 'injectionMoulding.coolTimeFactorSPerMm2' },
  'injectionMoulding.cavityPressureMPa': { to: 'injectionMoulding.cavityPressureMPa' },
  'injectionMoulding.machineId': { to: 'injectionMoulding.machineId' },
  'injectionMoulding.steelClass': { to: 'injectionMoulding.steelClass' },
  // Injection-moulding review (2 Oct 2026): screen and headless differed on all four.
  'injectionMoulding.runnerSystem': { to: 'injectionMoulding.runnerSystem' },
  'injectionMoulding.regrindFraction': { to: 'injectionMoulding.regrindFraction' },
  'injectionMoulding.manning': { to: 'injectionMoulding.manning' },
  'injectionMoulding.rejectRate': { to: 'injectionMoulding.rejectRate' },
  // Second pass: mould change, purge, maintenance, drying.
  'injectionMoulding.setupHoursPerChange': { to: 'injectionMoulding.setupHoursPerChange' },
  'injectionMoulding.batchSize': { to: 'injectionMoulding.batchSize' },
  'injectionMoulding.purgeKg': { to: 'injectionMoulding.purgeKg' },
  'injectionMoulding.mouldMaintenanceFraction': { to: 'injectionMoulding.mouldMaintenanceFraction' },
  'injectionMoulding.dryingKwhPerKg': { to: 'injectionMoulding.dryingKwhPerKg' },
  'forging.projectedAreaCm2': { to: 'forging.projectedAreaCm2' },
  'forging.dieSteel': { to: 'forging.dieSteel' },
  'forging.dieImpressions': { to: 'forging.dieImpressions' },
  'forging.heatingEnergyKwhPerKg': { to: 'forging.heatingEnergyKwhPerKg' },
  'forging.heatTreatCostPerKg': { to: 'forging.heatTreatCostPerKg' },
  'forging.descaleCostPerKg': { to: 'forging.descaleCostPerKg' },
  'forging.ndtCostPerPart': { to: 'forging.ndtCostPerPart' },
  'forging.forgeId': { to: 'forging.forgeId' },
  // Forging review (2 Oct 2026): the line, crew, scrap, furnace and trim press.
  'forging.process': { to: 'forging.process' },
  'forging.cycleTimeHr': { to: 'forging.cycleTimeHr' },
  'forging.labourId': { to: 'forging.labourId' },
  'forging.manning': { to: 'forging.manning' },
  'forging.rejectRate': { to: 'forging.rejectRate' },
  'forging.furnaceType': { to: 'forging.furnaceType' },
  'forging.trimMachineId': { to: 'forging.trimMachineId' },
  'forging.trimCycleHr': { to: 'forging.trimCycleHr' },
  'forging.trimLabourId': { to: 'forging.trimLabourId' },
  'forging.trimManning': { to: 'forging.trimManning' },
  // Gear cutting — geometry-measured z/module/face, engineer-answered helix/
  // quality/material class, rule-derived blank. materialId/netWeightKg land on
  // the shared top-level fields, as for every metal commodity.
  'gear.teeth': { to: 'gear.teeth' },
  'gear.normalModuleMm': { to: 'gear.normalModuleMm' },
  'gear.helixAngleDeg': { to: 'gear.helixAngleDeg' },
  'gear.faceWidthMm': { to: 'gear.faceWidthMm' },
  'gear.internal': { to: 'gear.internal' },
  'gear.qualityClass': { to: 'gear.qualityClass' },
  'gear.materialClass': { to: 'gear.materialClass' },
  'gear.caseHardened': { to: 'gear.caseHardened' },
  'gear.hardeningRoute': { to: 'gear.hardeningRoute' },
  'gear.effectiveCaseDepthMm': { to: 'gear.effectiveCaseDepthMm' },
  'gear.materialId': { to: 'materialId' },
  'gear.netWeightKg': { to: 'netWeightKg' },
  'gear.blankCostPerPart': { to: 'gear.blankCostPerPart' },
  'gear.blankPrepCycleSec': { to: 'gear.blankPrepCycleSec' },
  'gear.cycleTimeHr': { to: 'estimatedCycleTimeHr' },
  'gear.batchSize': { to: 'gear.batchSize' },
  'gear.setupTimeHrPerOperation': { to: 'gear.setupTimeHrPerOperation' },
  'gear.rejectRate': { to: 'gear.rejectRate' },
  'sheetMetal.shearStrengthMPa': { to: 'sheetMetal.shearStrengthMPa' },
  'sheetMetal.dieType': { to: 'sheetMetal.dieType' },
  'sheetMetal.pitchMm': { to: 'sheetMetal.pitchMm' },
  'sheetMetal.stripWidthMm': { to: 'sheetMetal.stripWidthMm' },
  'sheetMetal.strokesPerMin': { to: 'sheetMetal.strokesPerMin' },
  // The metal commodities decide a material FAMILY, and until now it landed
  // nowhere: `costInputSuggestions.materialId` came back empty on every metal
  // part, so a deterministic analysis could not be costed at all ("Material ''
  // not found"). Only the plastics worked, because a resin rule emits a real
  // library id. The value written here is a family name, which the costing
  // layer resolves to a representative grade — see `representativeMaterialId`.
  'machining.materialId': { to: 'materialId' },
  'forging.materialId': { to: 'materialId' },
  'forging.partWeightKg': { to: 'netWeightKg' },
  'sheetMetal.netWeightKg': { to: 'netWeightKg' },
  'sheetMetal.materialId': { to: 'materialId' },
  'injectionMoulding.partWeightKg': { to: 'netWeightKg' },
  'injectionMoulding.materialId': { to: 'materialId' },
  'blowMoulding.partWeightKg': { to: 'netWeightKg' },
  'blowMoulding.materialId': { to: 'materialId' },
  'thermoforming.materialId': { to: 'materialId' },
  'rotationalMoulding.materialId': { to: 'materialId' },
  'rotationalMoulding.partWeightKg': { to: 'netWeightKg' },
  'rubber.materialId': { to: 'materialId' },
  'rubber.partWeightKg': { to: 'netWeightKg' },
  'composites.partWeightKg': { to: 'netWeightKg' },

  // ── casting ───────────────────────────────────────────────────────────────
  'casting.subtype': { to: 'casting.subtype' },
  'casting.yieldFraction': { to: 'casting.yieldFraction' },
  'casting.cycleTimeHpdcSec': { to: 'casting.cycleTimeHpdcSec' },
  'casting.cycleTimeSandGravHr': { to: 'casting.cycleTimeSandGravHr' },
  'casting.dieMouldCostGBP': { to: 'casting.dieMouldCostGBP' },
  'casting.dieMouldLife': { to: 'casting.dieMouldLife' },
  'casting.cavities': { to: 'casting.cavities' },
  // Unmapped until 2 Oct 2026: the screen took the core into material, headless
  // costed every sand casting coreless — £1.50 apart on the Casting Bracket.
  'casting.coreCostPerPart': { to: 'casting.coreCostPerPart' },
  // Casting review (2 Oct 2026): the press, the post-cast route and the
  // investment consumables, each read by toCostParams.
  'casting.hpdcMachineId': { to: 'casting.hpdcMachineId' },
  'casting.fettlingMinutes': { to: 'casting.fettlingMinutes' },
  'casting.heatTreatCostPerKg': { to: 'casting.heatTreatCostPerKg' },
  'casting.shotBlastCostPerPart': { to: 'casting.shotBlastCostPerPart' },
  'casting.impregnationCostPerPart': { to: 'casting.impregnationCostPerPart' },
  'casting.ndtCostPerPart': { to: 'casting.ndtCostPerPart' },
  'casting.investWaxCostPerPart': { to: 'casting.investWaxCostPerPart' },
  'casting.investShellCostPerPart': { to: 'casting.investShellCostPerPart' },
  'casting.manning': { to: 'casting.manning' },
  'casting.leakTestSec': { to: 'casting.leakTestSec' },
  'casting.castPartWeightKg': { to: 'casting.castPartWeightKg' },

  // ── forging ───────────────────────────────────────────────────────────────
  'forging.flashAndScaleKg': { to: 'forging.flashKg' },
  'forging.yieldFraction': { to: 'forging.yieldFraction' },
  'forging.dieCost': { to: 'forging.dieCostGBP' },
  'forging.dieLife': { to: 'forging.dieLife' },
  'forging.strokesToForm': { to: 'forging.strokes' },
  'forging.timePerBlowSec': { to: 'forging.timePerBlowSec' },

  // ── sheet metal ───────────────────────────────────────────────────────────
  'sheetMetal.thicknessMm': { to: 'sheetMetal.thicknessMm' },
  'sheetMetal.blankLengthMm': { to: 'sheetMetal.blankLengthMm' },
  'sheetMetal.blankWidthMm': { to: 'sheetMetal.blankWidthMm' },
  'sheetMetal.dieCostGBP': { to: 'sheetMetal.dieCostGBP' },
  'sheetMetal.dieLife': { to: 'sheetMetal.dieLife' },
  'sheetMetal.numOps': { to: 'sheetMetal.numOps' },
  // The cut length, the press and the BIW line. `toCostParams` read all of these,
  // but nothing wrote them, so headless sized the press off 2(L+W) and costed
  // every stamping as a coil-fed die whatever the rules decided.
  'sheetMetal.perimeterMm': { to: 'sheetMetal.perimeterMm' },
  'sheetMetal.pressId': { to: 'sheetMetal.pressId' },
  'sheetMetal.pressLine': { to: 'sheetMetal.pressLine' },
  'sheetMetal.pressesInLine': { to: 'sheetMetal.pressesInLine' },
  'sheetMetal.blankingMethod': { to: 'sheetMetal.blankingMethod' },
  'sheetMetal.blanksPerMin': { to: 'sheetMetal.blanksPerMin' },
  'sheetMetal.drawAddendumMm': { to: 'sheetMetal.drawAddendumMm' },
  // Sheet-metal review (2 Oct 2026): route, crew, scrap and the fabrication route.
  'sheetMetal.route': { to: 'sheetMetal.route' },
  'sheetMetal.manning': { to: 'sheetMetal.manning' },
  'sheetMetal.rejectRate': { to: 'sheetMetal.rejectRate' },
  'sheetMetal.fabBlankingCycleSec': { to: 'sheetMetal.fabBlankingCycleSec' },
  'sheetMetal.fabBendCount': { to: 'sheetMetal.fabBendCount' },
  'sheetMetal.fabBendSec': { to: 'sheetMetal.fabBendSec' },
  'sheetMetal.fabToolChanges': { to: 'sheetMetal.fabToolChanges' },
  'sheetMetal.fabToolChangeSec': { to: 'sheetMetal.fabToolChangeSec' },
  'sheetMetal.fabBatchSize': { to: 'sheetMetal.fabBatchSize' },
  'sheetMetal.fabToolingGBP': { to: 'sheetMetal.fabToolingGBP' },
  'sheetMetal.fabUtilization': { to: 'sheetMetal.fabUtilization' },
  'sheetMetal.fabRejectRate': { to: 'sheetMetal.fabRejectRate' },
  'sheetMetal.setupHoursPerChange': { to: 'sheetMetal.setupHoursPerChange' },
  'sheetMetal.batchSize': { to: 'sheetMetal.batchSize' },
  'sheetMetal.dieMaintenanceFraction': { to: 'sheetMetal.dieMaintenanceFraction' },
  'sheetMetal.fabLaserId': { to: 'sheetMetal.fabLaserId' },
  'sheetMetal.fabBrakeId': { to: 'sheetMetal.fabBrakeId' },
  'sheetMetal.fabBrakeLabourId': { to: 'sheetMetal.fabBrakeLabourId' },
  'sheetMetal.fabAssistGas': { to: 'sheetMetal.fabAssistGas' },
  'sheetMetal.fabToleranceMm': { to: 'sheetMetal.fabToleranceMm' },

  // ── injection moulding ────────────────────────────────────────────────────
  'injectionMoulding.wallThicknessMm': { to: 'injectionMoulding.wallThicknessMm' },
  'injectionMoulding.projectedAreaCm2': { to: 'injectionMoulding.projectedAreaCm2' },
  'injectionMoulding.cavities': { to: 'injectionMoulding.cavities' },
  'injectionMoulding.mouldCostGBP': { to: 'injectionMoulding.mouldCostGBP' },
  'injectionMoulding.mouldLife': { to: 'injectionMoulding.mouldLife' },
  'injectionMoulding.runnerWeightKg': { to: 'injectionMoulding.runnerWeightKg' },

  // ── extrusion (extrusion build) ─────────────────────────────────────────
  'extrusion.materialId': { to: 'materialId' },
  'extrusion.partWeightKg': { to: 'netWeightKg' },
  'extrusion.process': { to: 'extrusion.process' },
  'extrusion.partLengthM': { to: 'extrusion.partLengthM' },
  'extrusion.profileWeightKgPerM': { to: 'extrusion.profileWeightKgPerM' },
  'extrusion.wallThicknessMm': { to: 'extrusion.wallThicknessMm' },
  'extrusion.machineId': { to: 'extrusion.machineId' },
  'extrusion.screwDiameterMm': { to: 'extrusion.screwDiameterMm' },
  'extrusion.cooling': { to: 'extrusion.cooling' },
  'extrusion.lineRateKgPerHr': { to: 'extrusion.lineRateKgPerHr' },
  'extrusion.startupScrapFraction': { to: 'extrusion.startupScrapFraction' },
  'extrusion.steadyScrapFraction': { to: 'extrusion.steadyScrapFraction' },
  'extrusion.dieSizeMm': { to: 'extrusion.dieSizeMm' },
  'extrusion.dieLayers': { to: 'extrusion.dieLayers' },
  'extrusion.dieComplexity': { to: 'extrusion.dieComplexity' },
  'extrusion.dieCostGBP': { to: 'extrusion.dieCostGBP' },
  'extrusion.energyPricePerKwh': { to: 'extrusion.energyPricePerKwh' },
  'extrusion.labourId': { to: 'extrusion.labourId' },
  'extrusion.manning': { to: 'extrusion.manning' },
  'extrusion.oee': { to: 'extrusion.oee' },
  'extrusion.labourEfficiency': { to: 'extrusion.labourEfficiency' },
  'extrusion.leakTest': { to: 'extrusion.leakTest' },
  // ── blow moulding ─────────────────────────────────────────────────────────
  'blowMoulding.subtype': { to: 'blowMoulding.subtype' },
  'blowMoulding.barrierMultilayer': { to: 'blowMoulding.barrierMultilayer' },
  'blowMoulding.wallThicknessMm': { to: 'blowMoulding.wallThicknessMm' },
  'blowMoulding.flashWeightKg': { to: 'blowMoulding.flashWeightKg' },
  'blowMoulding.cavities': { to: 'blowMoulding.cavities' },
  'blowMoulding.mouldCostGBP': { to: 'blowMoulding.mouldCostGBP' },
  'blowMoulding.mouldLife': { to: 'blowMoulding.mouldLife' },
  'blowMoulding.blowTimeSec': { to: 'blowMoulding.blowTimeSec' },
  'blowMoulding.openCloseSec': { to: 'blowMoulding.openCloseSec' },
  'blowMoulding.machineId': { to: 'blowMoulding.machineId' },
  'blowMoulding.coolTimeFactorSPerMm2': { to: 'blowMoulding.coolTimeFactorSPerMm2' },
  'blowMoulding.parisonExtrusionTimeSec': { to: 'blowMoulding.parisonExtrusionTimeSec' },
  'blowMoulding.flashRegrindFraction': { to: 'blowMoulding.flashRegrindFraction' },
  'blowMoulding.labourId': { to: 'blowMoulding.labourId' },
  'blowMoulding.manning': { to: 'blowMoulding.manning' },
  'blowMoulding.oee': { to: 'blowMoulding.oee' },
  'blowMoulding.labourEfficiency': { to: 'blowMoulding.labourEfficiency' },
  'blowMoulding.rejectRate': { to: 'blowMoulding.rejectRate' },
  'blowMoulding.deflashMachineId': { to: 'blowMoulding.deflashMachineId' },
  'blowMoulding.deflashLabourId': { to: 'blowMoulding.deflashLabourId' },
  'blowMoulding.deflashCycleSec': { to: 'blowMoulding.deflashCycleSec' },
  'blowMoulding.deflashManning': { to: 'blowMoulding.deflashManning' },

  // ── thermoforming ─────────────────────────────────────────────────────────
  'thermoforming.method': { to: 'thermoforming.method' },
  'thermoforming.sheetWeightKg': { to: 'thermoforming.sheetWeightKg' },
  'thermoforming.partWeightKg': { to: 'thermoforming.partWeightKg' },
  'thermoforming.toolCost': { to: 'thermoforming.toolCostGBP' },
  'thermoforming.heatTimeSec': { to: 'thermoforming.heatTimeSec' },
  'thermoforming.formTimeSec': { to: 'thermoforming.formTimeSec' },
  'thermoforming.trimTimeSec': { to: 'thermoforming.trimTimeSec' },
  'thermoforming.partsPerSheet': { to: 'thermoforming.partsPerSheet' },
  'thermoforming.machineId': { to: 'thermoforming.machineId' },
  'thermoforming.coolTimeSec': { to: 'thermoforming.coolTimeSec' },
  'thermoforming.indexTimeSec': { to: 'thermoforming.indexTimeSec' },
  'thermoforming.sheetThicknessMm': { to: 'thermoforming.sheetThicknessMm' },
  'thermoforming.rotaryIndex': { to: 'thermoforming.rotaryIndex' },
  'thermoforming.trimMachineId': { to: 'thermoforming.trimMachineId' },
  'thermoforming.energyPricePerKwh': { to: 'thermoforming.energyPricePerKwh' },
  'thermoforming.labourId': { to: 'thermoforming.labourId' },
  'thermoforming.manning': { to: 'thermoforming.manning' },
  'thermoforming.oee': { to: 'thermoforming.oee' },
  'thermoforming.labourEfficiency': { to: 'thermoforming.labourEfficiency' },
  'thermoforming.rejectRatePct': { to: 'thermoforming.rejectRatePct' },

  // ── rotational moulding ───────────────────────────────────────────────────
  'rotationalMoulding.numArms': { to: 'rotationalMoulding.numArms' },
  'rotationalMoulding.partsPerArm': { to: 'rotationalMoulding.partsPerArm' },
  'rotationalMoulding.heatTimeSec': { to: 'rotationalMoulding.heatTimeSec' },
  'rotationalMoulding.coolTimeSec': { to: 'rotationalMoulding.coolTimeSec' },
  'rotationalMoulding.mouldCostGBP': { to: 'rotationalMoulding.mouldCostGBP' },
  'rotationalMoulding.mouldLife': { to: 'rotationalMoulding.mouldLife' },
  'rotationalMoulding.machineId': { to: 'rotationalMoulding.machineId' },
  'rotationalMoulding.indexTimeSec': { to: 'rotationalMoulding.indexTimeSec' },
  'rotationalMoulding.loadUnloadTimeSec': { to: 'rotationalMoulding.loadUnloadTimeSec' },
  'rotationalMoulding.mouldsInService': { to: 'rotationalMoulding.mouldsInService' },
  'rotationalMoulding.powderCostAdderPerKg': { to: 'rotationalMoulding.powderCostAdderPerKg' },
  'rotationalMoulding.labourId': { to: 'rotationalMoulding.labourId' },
  'rotationalMoulding.manning': { to: 'rotationalMoulding.manning' },
  'rotationalMoulding.oee': { to: 'rotationalMoulding.oee' },
  'rotationalMoulding.labourEfficiency': { to: 'rotationalMoulding.labourEfficiency' },
  'rotationalMoulding.rejectRate': { to: 'rotationalMoulding.rejectRate' },

  // ── rubber ────────────────────────────────────────────────────────────────
  'rubber.process': {
    to: 'rubber.process',
    transform: v => RUBBER_PROCESS[String(v)] ?? String(v),
  },
  'rubber.flashWeightKg': { to: 'rubber.flashWeightKg' },
  'rubber.cavities': { to: 'rubber.cavities' },
  'rubber.cycleTimeSec': { to: 'rubber.cycleTimeSec' },
  'rubber.mouldCostGBP': { to: 'rubber.mouldCostGBP' },
  'rubber.mouldLife': { to: 'rubber.mouldLife' },
  // Rubber review (2 Oct 2026): the press, crew, scrap, deflash, post-cure,
  // mould change, inserts and the extrusion cure tunnel, on both paths.
  'rubber.cureTimeSec': { to: 'rubber.cureTimeSec' },
  'rubber.cureOvenMachineId': { to: 'rubber.cureOvenMachineId' },
  'rubber.machineId': { to: 'rubber.machineId' },
  'rubber.labourId': { to: 'rubber.labourId' },
  'rubber.manning': { to: 'rubber.manning' },
  'rubber.labourEfficiency': { to: 'rubber.labourEfficiency' },
  'rubber.rejectRate': { to: 'rubber.rejectRate' },
  'rubber.deflashCycleSec': { to: 'rubber.deflashCycleSec' },
  'rubber.postCureHours': { to: 'rubber.postCureHours' },
  'rubber.setupHoursPerChange': { to: 'rubber.setupHoursPerChange' },
  'rubber.batchSize': { to: 'rubber.batchSize' },
  'rubber.metalInserts': { to: 'rubber.metalInserts' },
  'rubber.oee': { to: 'rubber.oee' },

  // ── composites ────────────────────────────────────────────────────────────
  'composites.process': { to: 'composites.process' },
  'composites.fibreWeightFraction': { to: 'composites.fibreFraction' },
  'composites.wasteFraction': { to: 'composites.wasteFraction' },
  'composites.plies': { to: 'composites.plies' },
  'composites.areaM2': { to: 'composites.areaCm2', transform: v => num(v) * 10_000 },
  'composites.cureTimeHr': { to: 'composites.cureTimeSec', transform: v => num(v) * 3600 },
  'composites.toolingCost': { to: 'composites.toolCostGBP' },
  'composites.toolingLife': { to: 'composites.toolLife' },
  'composites.fibrePricePerKg': { to: 'composites.fibrePricePerKg' },
  'composites.resinPricePerKg': { to: 'composites.resinPricePerKg' },
  'composites.layupTimeHrPerPart': { to: 'composites.layupTimeHrPerPart' },
  'composites.cureMachineId': { to: 'composites.cureMachineId' },
  'composites.partsPerCureCycle': { to: 'composites.partsPerCureCycle' },
  'composites.toolsInService': { to: 'composites.toolsInService' },
  'composites.trimMachineId': { to: 'composites.trimMachineId' },
  'composites.trimTimeHr': { to: 'composites.trimTimeHr' },
  'composites.ndiCostPerPart': { to: 'composites.ndiCostPerPart' },
  'composites.layupLabourId': { to: 'composites.layupLabourId' },
  'composites.cureLabourId': { to: 'composites.cureLabourId' },
  'composites.trimLabourId': { to: 'composites.trimLabourId' },
  'composites.manning': { to: 'composites.manning' },
  'composites.oee': { to: 'composites.oee' },
  'composites.labourEfficiency': { to: 'composites.labourEfficiency' },
  'composites.rejectRate': { to: 'composites.rejectRate' },
};

/**
 * Rule paths deliberately left out of `RULE_PATH_MAP`, each with the reason.
 *
 * An unmapped path reaches the screen (by its field id) but not the headless
 * costing, so screen and headless can then price the same part differently.
 * `tests/rule-path-coverage.test.ts` fails on any rule path that is neither
 * mapped nor listed here, so a new rule has to be wired or excused.
 */
export const RULE_PATHS_NOT_COSTED_HEADLESS: Record<string, string> = {
  'casting.labourId': 'headless takes the same id from toCostParams LABOUR (lab-uk-foundry) — pinned equal by tests/casting-review.test.ts',
  'sheetMetal.process': 'prose for the report; the die type and press line are what the costing reads',
  'machining.operationCount': 'a count for the report; the operation plan itself is mapped',
  'forging.shapeComplexity': 'screen-only input to the forging advisor; headless takes strokes and die cost from their own rules',
  'injectionMoulding.sideActionsLifters': 'screen-only tooling adder; headless takes the mould cost rule, which already counts side actions',
  'extrusion.colourChangesPerDay': 'zero on both paths — the start-up scrap carries the change-over',
  'extrusion.dieChangesPerDay': 'zero on both paths — the start-up scrap carries the change-over',
  'extrusion.specificEnergyKwhPerKg': 'report only — the module derives it from the family',
  'blowMoulding.process': 'prose for the report; headless takes the machine rule',
  'blowMoulding.partVolumeL': 'screen-only display; weight is what the costing reads',
  'blowMoulding.mouldMaterial': 'screen-only; headless takes the mould cost rule',
  // Known parity gaps, not yet closed: headless picks the machine from the
  // subtype (SBM / IBM / EBM) and a fixed 2.5 s/mm² cool factor, the screen
  // takes these rules. Closing them needs the rule to choose by subtype first.
  // Thermoforming, rotational moulding and rubber: the screen runs a fuller
  // module input than `toCostParams` builds (cool time from gauge, mould type,
  // cure time). Headless costs from the times the rules decided directly.
  'thermoforming.formedWallMm': 'report only',
  'thermoforming.drawRatio': 'report only',
  'thermoforming.projectedAreaCm2': 'screen display; both paths take the machine and tool cost rules derived from it',
  'thermoforming.mouldMaterial': 'screen display; both paths take the tool cost rule derived from it',
  'thermoforming.energyKwhPerKg': 'report only — the module derives it from family and method',
  'thermoforming.drawDepthMm': 'screen DFM panel only',
  'thermoforming.minOpeningMm': 'screen DFM panel only',
  'thermoforming.toolCooling': 'screen display; both paths take the cool time rule derived from it',
  'thermoforming.trimType': 'screen display; both paths take the tool cost rule derived from it',
  'thermoforming.complexity': 'screen display; both paths take the tool cost rule derived from it',
  'thermoforming.formability': 'report only',
  'rotationalMoulding.materialFamily': 'screen display; both paths take the heat / cool time rules derived from it',
  'rotationalMoulding.wallThicknessMm': 'screen display; both paths take the heat / cool time rules derived from it',
  'rotationalMoulding.coolingMethod': 'screen display; both paths take the cool time rule derived from it',
  'rotationalMoulding.projectedAreaCm2': 'screen display; both paths take the mould cost rule derived from it',
  'rotationalMoulding.mouldType': 'screen display; both paths take the mould cost rule derived from it',
  'rubber.thicknessMm': 'PARITY GAP: screen-only; headless takes the cycle-time rule',
  'rubber.projectedAreaCm2': 'PARITY GAP: screen-only press sizing',
  'rubber.mouldSteel': 'PARITY GAP: screen-only; headless takes the mould cost rule',
};

/** Flatten `{a: {b: 1}}` to `{'a.b': 1}` so rule paths can be looked up directly. */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (cur, k) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined),
    obj);
}

function writePath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export interface RuleOverride {
  /** The `costInputSuggestions` path that was written. */
  field: string;
  ruleId: string;
  /** What the model said, or undefined if it said nothing. */
  from: unknown;
  to: unknown;
  basis: string;
  confidence: number;
  /** True when the model had proposed a different value. */
  contradicted: boolean;
}

export interface ApplyResult {
  overridden: RuleOverride[];
  /** Rule paths with a value but no consumer — a visible gap, not a silent one. */
  notWritten: string[];
  /** Decision ids still open, so the report can say what the model was left to guess. */
  undecided: string[];
}

/**
 * Overwrite `analysis.costInputSuggestions` with every value the rules decided.
 *
 * Mutates in place, like the other normalisers in this pipeline, and returns
 * what it did. Fields the rules could not decide are left exactly as the model
 * returned them — that is the AI's remaining contribution, and it stays visible
 * as such through `undecided`.
 */
export function applyRuleDecisions(
  analysis: { costInputSuggestions?: Record<string, unknown> } & Record<string, unknown>,
  result: CostInputRuleResult,
): ApplyResult {
  const ci = analysis.costInputSuggestions;
  if (!ci) return { overridden: [], notWritten: [], undecided: result.decisions.map(d => d.id) };

  const flat = flatten(result.suggestions as Record<string, unknown>);

  const overridden: RuleOverride[] = [];
  const notWritten: string[] = [];

  for (const [rulePath, value] of Object.entries(flat)) {
    if (value === undefined || value === null) continue;
    const mapping = RULE_PATH_MAP[rulePath];
    if (!mapping) { notWritten.push(rulePath); continue; }

    const next = mapping.transform ? mapping.transform(value) : value;
    const prev = readPath(ci, mapping.to);
    writePath(ci, mapping.to, next);

    const prov = result.byRule[rulePath];
    overridden.push({
      field: mapping.to,
      ruleId: rulePath,
      from: prev,
      to: next,
      basis: prov?.basis ?? '',
      confidence: prov?.confidence ?? 1,
      contradicted: prev !== undefined && prev !== next,
    });
  }

  // Every overwritten field now carries the rule's confidence, not the model's.
  const fc = (ci.fieldConfidences ?? {}) as Record<string, number>;
  for (const o of overridden) {
    const fieldId = Object.entries(result.provenance).find(([, p]) => p.ruleId === o.ruleId)?.[0];
    if (fieldId) fc[fieldId] = o.confidence;
  }
  if (Object.keys(fc).length) ci.fieldConfidences = fc;

  return {
    overridden,
    notWritten: notWritten.sort(),
    undecided: result.decisions.map(d => d.id),
  };
}

/** One field the rules filled, as the form needs it. */
export interface RuleField {
  fieldId: string;
  value: unknown;
  basis: string;
  source: string;
  confidence: number;
  ruleId: string;
}

/**
 * Every rule value, keyed by the form field it belongs in.
 *
 * This is the transport that `costInputSuggestions` cannot be. That object is
 * the *model's* response schema — it has a slot for what the AI was asked, and
 * the rules compute a good deal the AI was never asked for. Auditing the two
 * against each other: 131 of 144 rules carry a form field id, but only 77 of
 * their paths have anywhere to land in the schema. The other 54 include the
 * forge press sized from die-fill force, the injection press sized from clamp
 * tonnage, the resin-specific cooling factor, the rubber cure time and the
 * envelope-derived billet weight — every one of them a cost driver, and every
 * one of them computed and then dropped.
 *
 * Keying by field id sidesteps the schema entirely: the form is the consumer,
 * so address the form. It also carries the basis to the field's tooltip, which
 * is the first time the derivation has been visible where the number is.
 */
export function toRuleFields(result: CostInputRuleResult): Record<string, RuleField> {
  const out: Record<string, RuleField> = {};
  for (const [fieldId, p] of Object.entries(result.provenance)) {
    out[fieldId] = {
      fieldId, value: p.value, basis: p.basis,
      source: p.source, confidence: p.confidence, ruleId: p.ruleId,
    };
  }
  return out;
}

/** One AI value cleared because the rule that owns the field is still asking. */
export interface AISuppression {
  field: string; ruleId: string; decisionId: string; aiValue: unknown;
}

/**
 * A rule that is ASKING a question must not let the model answer it silently.
 *
 * The live audit's bumper: the resin decision was open, so the injection-
 * moulding tooling rules were blocked -- and the model's stock answer
 * (mouldCostGBP 200000, mouldLife 500000, byte-identical across every part
 * audited) flowed into the tooling bucket as if something had decided it.
 * The CLI refuses to cost in exactly this state; this makes the analysis
 * payload tell the same truth: fields owned by a blocked rule are cleared,
 * the clearing is recorded, and the decision list says what must be answered.
 *
 * Suppression is keyed on each decision's `blockedRuleIds` -- the engine's
 * precise record of which rules returned blocked -- translated to analysis
 * fields through the rule's own `path` and RULE_PATH_MAP. Rules skipped by
 * `appliesWhen` are untouched: not applying is not the same as asking.
 */
export function suppressAIForUndecided(
  analysis: { costInputSuggestions?: Record<string, unknown> },
  result: CostInputRuleResult,
  spec: { rules: Array<{ id: string; path: string }> },
): AISuppression[] {
  const ci = analysis.costInputSuggestions;
  if (!ci || !result.decisions?.length) return [];
  const pathOf = new Map(spec.rules.map(r => [r.id, r.path]));
  const out: AISuppression[] = [];
  for (const d of result.decisions) {
    for (const ruleId of d.blockedRuleIds ?? []) {
      const rulePath = pathOf.get(ruleId);
      const mapping = rulePath ? RULE_PATH_MAP[rulePath] : undefined;
      if (!mapping) continue;
      const prev = readPath(ci, mapping.to);
      if (prev === undefined || prev === null || prev === '' || prev === 0) continue;
      writePath(ci, mapping.to, undefined);
      out.push({ field: mapping.to, ruleId, decisionId: d.id, aiValue: prev });
    }
  }
  return out;
}

export { RULE_PATH_MAP };

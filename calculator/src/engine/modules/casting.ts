import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import { finishingForCommodity, type CommodityFinishingInput } from './surface-finishing.js';
import { meltFactsFor, MELT_SHOP } from '../casting-melt.js';
import { tariffElectricityPerKwh } from '../uk-tariff.js';

export type CastingSubtype = 'hpdc' | 'sand' | 'gravity' | 'investment';

export interface CastingInputs {
  subtype: CastingSubtype;
  materialId: string;        // alloy material ID
  partWeightKg: number;
  /** Blast, impregnation, pre-treat and coating applied to the casting. Absent
   *  leaves the part as-cast and the cost bit-identical to before. */
  surfaceFinishing?: CommodityFinishingInput;
  castingYield: number;      // 0–1, part_weight / pour_weight
  rejectRate: number;        // 0–1, adds uplift to material needed
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  amortizationVolume: number;
  /** Feature-based secondary machining ops (from geometry) — appended to the
   *  process operations. Holes are cored-in on a casting, so these add machining
   *  TIME, not material (see feature-machining.ts / stockCondition). */
  secondaryMachiningOps?: OperationInput[];
  /** Fixturing + setup + CNC programming NRE for the secondary machining. */
  secondaryMachiningToolingCost?: number;
  /** Cutting tools worn in the secondary machining, £/part. */
  secondaryMachiningConsumablesPerPart?: number;
  // HPDC specific
  hpdc?: {
    machineId: string;
    cycleTimeSec: number;
    cavities: number;
    dieCost: number;
    dieLife: number;         // shots per die life (informational)
  };
  // Sand casting specific
  sand?: {
    mouldLineId: string;
    cycleTimeHr: number;
    patternCost: number;
    patternLife: number;     // castings per pattern (informational)
    coreCostPerPart: number;
  };
  // Gravity / permanent mould
  gravity?: {
    machineId: string;
    cycleTimeHr: number;
    mouldCost: number;
    mouldLife: number;       // castings per mould (informational)
  };
  /**
   * The melt shop. Runners, risers and overflows are remelted in-house, so only
   * the dross / oxidation loss on them is metal bought and lost; every kg poured
   * is melted. Absent → the alloy's typical figures (casting-melt.ts); set
   * `lossFraction: 1` and `energyKwhPerKg: 0` to reproduce the old behaviour
   * (gating sold as scrap, no melt energy) for a buy-in liquid-metal price.
   */
  melt?: { lossFraction?: number; energyKwhPerKg?: number; energyPricePerKwh?: number; labourId?: string };
  /** 100% air-decay leak test for pressure-tight castings, seconds a part. */
  leakTestSec?: number;
  /** The rig it runs on — the library's pressure & leak test rig by default. */
  leakTestMachineId?: string;
  // ── Post-cast operations (casting review, 2 Oct 2026) ──
  // The advisor's route always listed fettling and, for ferrous / heat-treatable
  // alloys, heat treatment — and none of it was costed. Absent = none.
  /** Gate / riser removal and grinding, bench minutes per casting (foundry labour). */
  fettlingMinutes?: number;
  /** Heat treatment £/kg of casting (normalise, T5, T6 …). */
  heatTreatCostPerKg?: number;
  shotBlastCostPerPart?: number;
  impregnationCostPerPart?: number;
  ndtCostPerPart?: number;
  // Investment casting
  investment?: {
    waxCostPerPart: number;
    shellBuildCostPerPart: number;
    pourLabourId: string;
    pourCycleHr: number;
    pourMachineId: string;
    waxDieCost: number;
    /** Fraction of wax recovered and reused (dewaxing autoclave). Default 0.80. Reduces effective wax cost. */
    waxRecoveryFraction?: number;
  };
}

export function getCastingInputSchema(): Record<string, string> {
  return {
    subtype: 'hpdc | sand | gravity | investment',
    materialId: 'string — alloy material ID from rate library',
    partWeightKg: 'number — finished casting weight kg',
    castingYield: 'number 0–1 — part weight / pour weight',
    rejectRate: 'number 0–1 — scrap/reject fraction; uplifts effective material',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    amortizationVolume: 'number — volume over which to amortize tooling',
    'hpdc.machineId': 'string — HPDC machine ID (required when subtype=hpdc)',
    'hpdc.cycleTimeSec': 'number — total HPDC cycle time in seconds',
    'hpdc.cavities': 'number — number of cavities per shot',
    'hpdc.dieCost': 'number — die set cost £',
    'hpdc.dieLife': 'number — shots per die life (informational)',
    'sand.mouldLineId': 'string — moulding line machine ID (required when subtype=sand)',
    'sand.cycleTimeHr': 'number — moulding cycle time hr',
    'sand.patternCost': 'number — pattern cost £',
    'sand.patternLife': 'number — castings per pattern (informational)',
    'sand.coreCostPerPart': 'number — core material + manufacture cost per casting £',
    'gravity.machineId': 'string — gravity/tilt machine ID (required when subtype=gravity)',
    'gravity.cycleTimeHr': 'number — cycle time hr',
    'gravity.mouldCost': 'number — permanent mould cost £',
    'gravity.mouldLife': 'number — castings per mould (informational)',
    'investment.waxCostPerPart': 'number — wax pattern cost per part £ (required when subtype=investment)',
    'investment.shellBuildCostPerPart': 'number — ceramic shell cost per part £',
    'investment.pourLabourId': 'string — labour rate ID for pour/casting operation',
    'investment.pourCycleHr': 'number — pour + solidify cycle time hr',
    'investment.pourMachineId': 'string — furnace machine ID',
    'investment.waxDieCost': 'number — wax injection die set cost £ (typically £3000–25000)',
  };
}

export function computeCastingDrivers(inputs: CastingInputs): CommodityDrivers {
  if (inputs.rejectRate >= 1) throw new Error('rejectRate must be < 1');
  // Reject uplift: need to cast more parts to achieve target yield
  const rejectUplift = 1 / (1 - inputs.rejectRate);
  const effectiveNetWeight = inputs.partWeightKg * rejectUplift;

  // Pour weight = part (rejects included) ÷ yield. Everything poured that does
  // not leave as a good casting — the gating AND the rejected castings — goes
  // back into the furnace; only `lossFraction` of it is metal lost. The core
  // prices gross = net ÷ utilisation and credits (gross − net) at scrap, so the
  // utilisation that buys exactly good part + lost metal is part ÷ (part + lost).
  // With the melt shop switched off (lossFraction 1) this is the old model:
  // rejects bought in full and the gating sold as scrap.
  const meltDefault = meltFactsFor(inputs.materialId);
  const lossFraction = Math.min(1, Math.max(0, inputs.melt?.lossFraction ?? meltDefault?.lossFraction ?? 1));
  const pourKg = effectiveNetWeight / inputs.castingYield;
  const boughtNetKg = lossFraction >= 1 ? effectiveNetWeight : inputs.partWeightKg;
  const metalLostKg = (pourKg - boughtNetKg) * lossFraction;
  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: boughtNetKg,
    materialUtilization: boughtNetKg / (boughtNetKg + metalLostKg),
  };
  const meltEnergyCostPerPart = pourKg
    * (inputs.melt?.energyKwhPerKg ?? meltDefault?.energyKwhPerKg ?? 0)
    * (inputs.melt?.energyPricePerKwh ?? tariffElectricityPerKwh());

  const operations: OperationInput[] = [];
  let tooling: ToolingInput;

  switch (inputs.subtype) {
    case 'hpdc': {
      if (!inputs.hpdc) throw new Error('hpdc config required when subtype is hpdc');
      const cycleTimeHr = inputs.hpdc.cycleTimeSec / 3600;
      // Reject uplift: must cast rejectUplift × more parts to yield target volume
      const hpdcCycleEff = cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'HPDC Casting',
        machineId: inputs.hpdc.machineId,
        labourId: inputs.labourId,
        cycleTimeHr: hpdcCycleEff,
        partsPerCycle: inputs.hpdc.cavities,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: hpdcCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Die replacement: number of die sets = ceil(volume / (dieLife × cavities))
      const hpdcPartsPerDieSet = inputs.hpdc.dieLife * inputs.hpdc.cavities;
      const hpdcNumDieSets = hpdcPartsPerDieSet > 0
        ? Math.ceil(inputs.amortizationVolume / hpdcPartsPerDieSet)
        : 1;
      tooling = {
        totalToolingCost: inputs.hpdc.dieCost * hpdcNumDieSets,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'sand': {
      if (!inputs.sand) throw new Error('sand config required when subtype is sand');
      const sandCycleEff = inputs.sand.cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'Sand Casting — Moulding',
        machineId: inputs.sand.mouldLineId,
        labourId: inputs.labourId,
        cycleTimeHr: sandCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: sandCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Pattern replacement based on pattern life
      const sandNumPatterns = inputs.sand.patternLife > 0
        ? Math.ceil(inputs.amortizationVolume / inputs.sand.patternLife)
        : 1;
      tooling = {
        totalToolingCost: inputs.sand.patternCost * sandNumPatterns,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'gravity': {
      if (!inputs.gravity) throw new Error('gravity config required when subtype is gravity');
      const gravCycleEff = inputs.gravity.cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'Gravity Die Casting',
        machineId: inputs.gravity.machineId,
        labourId: inputs.labourId,
        cycleTimeHr: gravCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: gravCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Mould replacement based on mould life
      const gravNumMoulds = inputs.gravity.mouldLife > 0
        ? Math.ceil(inputs.amortizationVolume / inputs.gravity.mouldLife)
        : 1;
      tooling = {
        totalToolingCost: inputs.gravity.mouldCost * gravNumMoulds,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'investment': {
      if (!inputs.investment) throw new Error('investment config required when subtype is investment');
      // Pour operation on the furnace
      const invCycleEff = inputs.investment.pourCycleHr * rejectUplift;
      operations.push({
        operationName: 'Investment Casting — Pour',
        machineId: inputs.investment.pourMachineId,
        labourId: inputs.investment.pourLabourId,
        cycleTimeHr: invCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: invCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      tooling = {
        totalToolingCost: inputs.investment.waxDieCost,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    default:
      throw new Error(`Unknown casting subtype: ${(inputs as CastingInputs).subtype}`);
  }

  // Move consumables to rawMaterial so they appear in material cost bucket, not tooling.
  // Cores, wax and shell are consumed by every casting poured, rejects included,
  // so they carry the same reject uplift as the metal and the line time.
  let consumablesCostPerPart = 0;
  if (inputs.subtype === 'sand' && inputs.sand) {
    consumablesCostPerPart = inputs.sand.coreCostPerPart * rejectUplift;
  } else if (inputs.subtype === 'investment' && inputs.investment) {
    const waxRecovery = inputs.investment.waxRecoveryFraction ?? 0.80;
    const effectiveWaxCost = inputs.investment.waxCostPerPart * (1 - waxRecovery);
    consumablesCostPerPart = (effectiveWaxCost + inputs.investment.shellBuildCostPerPart) * rejectUplift;
  }
  consumablesCostPerPart += meltEnergyCostPerPart;

  // Post-cast: fettling is an operator at a grinder, so it is labour; heat
  // treatment, blast, impregnation and NDT are priced per kg / per part as the
  // forging module prices its heat treat and NDT.
  if (inputs.fettlingMinutes && inputs.fettlingMinutes > 0) {
    const hr = (inputs.fettlingMinutes / 60) * rejectUplift;
    operations.push({
      operationName: 'Fettling (gate / riser removal, grind)',
      machineId: operations[0].machineId,
      labourId: inputs.labourId,
      cycleTimeHr: 0,
      partsPerCycle: 1,
      oee: 1,
      manning: 1,
      labourTimeHr: hr,
      labourEfficiency: inputs.labourEfficiency,
      benchOperation: true,
    });
  }
  // The melt shop's labour, on every kg poured — skipped when the melt shop is
  // switched off (a bought-in liquid-metal price carries it).
  if (meltDefault && lossFraction < 1 && pourKg > 0) {
    const hr = pourKg / 1000 * MELT_SHOP.labourHrPerTonnePoured;
    operations.push({
      operationName: 'Melt shop (charge, melt, treat, ladle)',
      machineId: operations[0].machineId,
      labourId: inputs.melt?.labourId ?? MELT_SHOP.labourId,
      cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1,
      labourTimeHr: hr, labourEfficiency: inputs.labourEfficiency,
      benchOperation: true,
    });
  }
  if (inputs.subtype === 'sand' && lossFraction < 1) {
    consumablesCostPerPart += pourKg * MELT_SHOP.greenSandAdditionsPerKgPoured;
  }
  if (inputs.leakTestSec && inputs.leakTestSec > 0) {
    const hr = inputs.leakTestSec / 3600;
    operations.push({
      operationName: 'Leak test (air decay, 100%)',
      machineId: inputs.leakTestMachineId ?? 'extrusion-leak-test',
      labourId: inputs.labourId,
      cycleTimeHr: hr, partsPerCycle: 1, oee: inputs.oee, manning: 1,
      labourTimeHr: hr, labourEfficiency: inputs.labourEfficiency,
    });
  }
  consumablesCostPerPart += (inputs.heatTreatCostPerKg ?? 0) * inputs.partWeightKg
    + (inputs.shotBlastCostPerPart ?? 0)
    + (inputs.impregnationCostPerPart ?? 0)
    + (inputs.ndtCostPerPart ?? 0)
    + (inputs.secondaryMachiningConsumablesPerPart ?? 0);

  // Feature-based secondary machining (geometry-driven) — appended on top of
  // the casting process. Near-net → machining TIME only; no extra material.
  if (inputs.secondaryMachiningOps && inputs.secondaryMachiningOps.length > 0) {
    operations.push(...inputs.secondaryMachiningOps);
  }
  if (inputs.secondaryMachiningToolingCost && inputs.secondaryMachiningToolingCost > 0) {
    tooling = { ...tooling, totalToolingCost: tooling.totalToolingCost + inputs.secondaryMachiningToolingCost };
  }

  // ── Surface finishing ────────────────────────────────────────────────────
  // Castings had no surface treatment at all, and two of the operations they
  // most commonly carry are MASS-based rather than area-based: shot blast to
  // descale, and vacuum resin impregnation to seal porosity. Impregnation is
  // casting-specific and its value is the pressure-test reject it prevents, not
  // anything it adds to the part.
  const finishing = finishingForCommodity(inputs.surfaceFinishing, {
    massKg: inputs.partWeightKg,
    labourId: inputs.labourId,
    productForm: 'cast_hpdc',
  });
  if (finishing) operations.push(...finishing.operations);
  const totalConsumables = consumablesCostPerPart + (finishing?.consumablesPerPart ?? 0);

  return {
    rawMaterial: totalConsumables > 0
      ? { ...rawMaterial, consumablesCostPerPart: totalConsumables }
      : rawMaterial,
    operations,
    tooling,
  };
}

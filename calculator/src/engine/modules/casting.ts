import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import { finishingForCommodity, type CommodityFinishingInput } from './surface-finishing.js';
import { meltFactsFor, MELT_SHOP } from '../casting-melt.js';
import { moduleEnergy, addEnergy } from '../module-energy.js';
import { toolSetItems, machiningNreItems, CUTTING_TOOL_WEAR_LABEL } from '../tooling-split.js';

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
  /** The CNC programming inside `secondaryMachiningToolingCost`, £ — the rest is fixtures; printed as cast + machine's two
   *  items ("Machining fixtures", "CNC programming (NRE)"). Absent on a typed figure (one item that says it covers both). */
  secondaryMachiningProgrammingNRE?: number;
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
  /**
   * Foundry indirect costs as named lines (review round, 4 Nov 2026 — casting-melt.ts `FOUNDRY_INDIRECT`; the rates are
   * the casting rules', each with its source on its basis line). Sand and gravity routes only; a rate absent or 0 is no
   * line. New sand is a material consumable (£, already in the costed country); the energy goes to the core as kWh, so
   * every country prices it at its own tariff (module-energy.ts).
   */
  foundry?: {
    /** New sand + disposal of the same tonnage, £ a tonne POURED (sand route only). */
    newSandGbpPerTPoured?: number;
    /** Ladle preheat, kWh (gas) a tonne of liquid metal poured. */
    ladlePreheatKwhPerTPoured?: number;
    /** Dust extraction, kWh (electricity) a tonne of good casting. */
    dustExtractionKwhPerTGood?: number;
    /** Other plant electricity beyond melting and holding, kWh a tonne of good casting. */
    plantElectricityKwhPerTGood?: number;
  };
  /** 100% air-decay leak test for pressure-tight castings, seconds a part. */
  leakTestSec?: number;
  /** The rig it runs on — the library's pressure & leak test rig by default. */
  leakTestMachineId?: string;
  // ── Post-cast operations (casting review, 2 Oct 2026) ──
  // The advisor's route always listed fettling and, for ferrous / heat-treatable
  // alloys, heat treatment — and none of it was costed. Absent = none.
  /** Gate / riser removal and grinding, bench minutes per casting (foundry labour). */
  fettlingMinutes?: number;
  /**
   * Fettling on a robotic grinding cell instead (foundry at volume, 3 Nov 2026): machine time on the cell plus its
   * crew share, seconds a casting. Absent = the bench minutes above (or none).
   */
  fettlingCell?: { machineId: string; secPerCasting: number; manning: number };
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
    // Melt loss is gone, not sold — unless the melt shop is off (lossFraction 1: gating sold as scrap).
    ...(lossFraction < 1 ? { lossIsNotScrap: true } : {}),
  };
  // Melt energy on every kg poured — kWh for the core to price at the costing
  // book's tariff (module-energy.ts); £ only when a tariff was typed.
  // The melt shop's figures are printed where the reader sees them (the energy line's basis in the trace and both
  // reports): kWh/kg and loss were constants nobody could read (arithmetic audit, Oct 2026).
  const kwhPerKg = inputs.melt?.energyKwhPerKg ?? meltDefault?.energyKwhPerKg ?? 0;
  const meltBasis = `melt energy on every kg poured: ${pourKg.toFixed(3)} kg poured a good casting `
    + `(${inputs.partWeightKg.toFixed(3)} kg ÷ (1 − ${inputs.rejectRate} reject) ÷ ${inputs.castingYield} yield) × ${kwhPerKg} kWh/kg`
    + (lossFraction < 1 ? `; runners, risers and rejects remelted, ${(lossFraction * 100).toFixed(0)}% of them lost (${metalLostKg.toFixed(3)} kg bought and lost)` : '')
    + (meltDefault && inputs.melt?.energyKwhPerKg == null ? ` — ${meltDefault.basis}` : '');
  const meltEnergy = moduleEnergy(pourKg * kwhPerKg, 'electricity', inputs.melt?.energyPricePerKwh, meltBasis);
  // Foundry indirect energy (review round, 4 Nov 2026): ladle preheat on every kg POURED (gas), dust extraction and the
  // other plant electricity on every kg of GOOD casting (a plant's kWh a tonne good already spreads its rejects). Sand and
  // gravity only — a die-casting cell and an investment shop are not costed by these figures.
  const fi = inputs.subtype === 'sand' || inputs.subtype === 'gravity' ? inputs.foundry : undefined;
  const kwhLine = (rate: number | undefined, kg: number, what: string, per: string) => {
    const r = Math.max(0, rate ?? 0);
    // kg to 4 dp so the printed product re-does to the printed kWh (basis-check.py)
    return r > 0 ? { kwh: kg * r / 1000, basis: `${what}: ${kg.toFixed(4)} kg ${per} × ${r} kWh/t ÷ 1,000 = ${(kg * r / 1000).toFixed(4)} kWh` } : null;
  };
  const ladle = kwhLine(fi?.ladlePreheatKwhPerTPoured, pourKg, 'ladle preheat (gas)', 'poured');
  const dust = kwhLine(fi?.dustExtractionKwhPerTGood, inputs.partWeightKg, 'dust extraction', 'good casting');
  const plant = kwhLine(fi?.plantElectricityKwhPerTGood, inputs.partWeightKg, 'other plant electricity beyond melt', 'good casting');
  const ladleEnergy = ladle ? moduleEnergy(ladle.kwh, 'gas', undefined, ladle.basis) : { gbp: 0 };
  const plantElec = [dust, plant].filter((x): x is NonNullable<typeof x> => !!x);
  const plantEnergy = plantElec.length
    ? moduleEnergy(plantElec.reduce((a, x) => a + x.kwh, 0), 'electricity', inputs.melt?.energyPricePerKwh, plantElec.map(x => x.basis).join('; '))
    : { gbp: 0 };
  const foundryEnergyKwh = addEnergy(ladleEnergy.kwh, 'kwh' in plantEnergy ? plantEnergy.kwh : undefined);
  const meltEnergyCostPerPart = meltEnergy.gbp + plantEnergy.gbp;

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
      // Shots wear the die whether the casting is good or rejected: sets = castings POURED ÷ life (arithmetic audit).
      const hpdcNumDieSets = hpdcPartsPerDieSet > 0
        ? Math.ceil(inputs.amortizationVolume * rejectUplift / hpdcPartsPerDieSet - 1e-9)
        : 1;
      tooling = {
        // The first die is the up-front investment; the rest are replacements as it wears out (report standard #9).
        items: toolSetItems('HPDC die', inputs.hpdc.dieCost, hpdcNumDieSets,
          `life ${inputs.hpdc.dieLife.toLocaleString('en-GB')} shots × ${inputs.hpdc.cavities} cavit${inputs.hpdc.cavities > 1 ? 'ies' : 'y'} each`),
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
      // A pattern wears per mould rammed, rejected castings included: sets = castings POURED ÷ life (arithmetic audit).
      const sandNumPatterns = inputs.sand.patternLife > 0
        ? Math.ceil(inputs.amortizationVolume * rejectUplift / inputs.sand.patternLife - 1e-9)
        : 1;
      tooling = {
        // The first pattern set is the up-front investment; the rest are replacements as it wears out (report standard #9).
        items: toolSetItems('Pattern equipment', inputs.sand.patternCost, sandNumPatterns,
          // the life is in CASTINGS (sets = parts ÷ life): "16,000 moulds" was 8,000 moulds × 2 impressions (Poland review)
          inputs.sand.patternLife > 0 ? `life ${inputs.sand.patternLife.toLocaleString('en-GB')} castings each; ${Math.round(inputs.amortizationVolume * rejectUplift).toLocaleString('en-GB')} poured incl. ${(inputs.rejectRate * 100).toFixed(0)}% rejects` : undefined),
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
      // Castings POURED wear the mould, rejects included (arithmetic audit).
      const gravNumMoulds = inputs.gravity.mouldLife > 0
        ? Math.ceil(inputs.amortizationVolume * rejectUplift / inputs.gravity.mouldLife - 1e-9)
        : 1;
      tooling = {
        items: toolSetItems('Permanent mould', inputs.gravity.mouldCost, gravNumMoulds,
          inputs.gravity.mouldLife > 0 ? `life ${inputs.gravity.mouldLife.toLocaleString('en-GB')} castings each` : undefined),
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
        items: [{ label: 'Wax injection die', gbp: inputs.investment.waxDieCost, kind: 'initial', firstSetGbp: inputs.investment.waxDieCost, sets: 1 }],
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
  const items: Array<{ label: string; gbp: number }> = [];
  const item = (label: string, gbp: number) => { if (gbp > 0) { items.push({ label, gbp }); consumablesCostPerPart += gbp; } };
  if (inputs.subtype === 'sand' && inputs.sand) {
    item('cores', inputs.sand.coreCostPerPart * rejectUplift);
  } else if (inputs.subtype === 'investment' && inputs.investment) {
    const waxRecovery = inputs.investment.waxRecoveryFraction ?? 0.80;
    const effectiveWaxCost = inputs.investment.waxCostPerPart * (1 - waxRecovery);
    item('wax and shell', (effectiveWaxCost + inputs.investment.shellBuildCostPerPart) * rejectUplift);
  }
  item('melt and plant energy (typed tariff)', meltEnergyCostPerPart);

  // The melt shop's labour, on every kg poured — skipped when the melt shop is
  // switched off (a bought-in liquid-metal price carries it). Listed before
  // fettling: melt → mould / pour → knock-out → fettle (it followed fettling;
  // arithmetic audit, Oct 2026). Its figures are in its name — the only text
  // an operation carries to the trace and the reports.
  if (meltDefault && lossFraction < 1 && pourKg > 0) {
    const hr = pourKg / 1000 * MELT_SHOP.labourHrPerTonnePoured;
    operations.push({
      operationName: `Melt shop (charge, melt, treat, ladle) — ${pourKg.toFixed(2)} kg poured × ${MELT_SHOP.labourHrPerTonnePoured} operator-h/t (engineering-typical)`,
      machineId: operations[0].machineId,
      labourId: inputs.melt?.labourId ?? MELT_SHOP.labourId,
      cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1,
      labourTimeHr: hr, labourEfficiency: inputs.labourEfficiency,
      benchOperation: true,
    });
  }

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
  if (inputs.fettlingCell && inputs.fettlingCell.secPerCasting > 0) {
    // Every casting poured is fettled before inspection finds the rejects: the time carries the reject uplift, as the
    // bench minutes do. The cell's operator tends more than one cell (manning < 1).
    const hr = inputs.fettlingCell.secPerCasting / 3600 * rejectUplift;
    const fc = inputs.fettlingCell;
    operations.push({
      operationName: `Fettling — robotic grinding cell (${fc.secPerCasting} s a casting, ${fc.manning} operator)`,
      machineId: fc.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: hr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: fc.manning,
      labourTimeHr: hr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }
  // New sand and its disposal (review round, 4 Nov 2026): it replaced the engineering-typical £0.01/kg "green-sand
  // additions"; bentonite and coal dust are listed as not costed (casting-melt.ts FOUNDRY_NOT_COSTED).
  if (inputs.subtype === 'sand' && (fi?.newSandGbpPerTPoured ?? 0) > 0) {
    const r = fi!.newSandGbpPerTPoured!;
    item(`new sand + disposal (${pourKg.toFixed(3)} kg poured × £${r}/t ÷ 1,000)`, pourKg * r / 1000);
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
  item('heat treatment', (inputs.heatTreatCostPerKg ?? 0) * inputs.partWeightKg);
  item('shot blast', inputs.shotBlastCostPerPart ?? 0);
  item('impregnation', inputs.impregnationCostPerPart ?? 0);
  item('NDT', inputs.ndtCostPerPart ?? 0);
  item(CUTTING_TOOL_WEAR_LABEL, inputs.secondaryMachiningConsumablesPerPart ?? 0);

  // Feature-based secondary machining (geometry-driven) — appended on top of
  // the casting process. Near-net → machining TIME only; no extra material.
  if (inputs.secondaryMachiningOps && inputs.secondaryMachiningOps.length > 0) {
    operations.push(...inputs.secondaryMachiningOps);
  }
  if (inputs.secondaryMachiningToolingCost && inputs.secondaryMachiningToolingCost > 0) {
    tooling = { ...tooling, totalToolingCost: tooling.totalToolingCost + inputs.secondaryMachiningToolingCost,
      items: [...(tooling.items ?? []), ...machiningNreItems(inputs.secondaryMachiningToolingCost, inputs.secondaryMachiningProgrammingNRE)] };
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
  if (finishing?.consumablesPerPart) items.push({ label: 'surface finishing', gbp: finishing.consumablesPerPart });
  const totalConsumables = consumablesCostPerPart + (finishing?.consumablesPerPart ?? 0);

  return {
    rawMaterial: {
      ...rawMaterial,
      ...(totalConsumables > 0 ? { consumablesCostPerPart: totalConsumables, consumablesItems: items } : {}),
      ...(addEnergy(meltEnergy.kwh, foundryEnergyKwh) ? { energyKwh: addEnergy(meltEnergy.kwh, foundryEnergyKwh) } : {}),
    },
    operations,
    tooling,
  };
}

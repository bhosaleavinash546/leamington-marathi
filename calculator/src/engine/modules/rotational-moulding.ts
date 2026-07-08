import type { CommodityDrivers, RawMaterialInput, OperationInput, ToolingInput } from '../types.js';
import {
  estimateRotoCycle, estimateRotoMouldCost,
  type RotoMaterialFamily, type RotoCoolingMethod, type RotoMouldType, type RotoComplexity,
} from './roto-advisor.js';

export interface RotationalMouldingInputs {
  materialId: string;
  partWeightKg: number;
  powderCostAdderPerKg: number;
  numArms: number;
  partsPerArm: number;
  /** Oven residence time s. Omit/≤0 to predict from wall × material × cooling method. */
  heatingTimeSec: number;
  /** Cooling booth time s. Omit/≤0 to predict from the heating time × cooling method. */
  coolingTimeSec: number;
  loadUnloadTimeSec: number;
  machineId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  /** Mould cost £. Omit/≤0 to estimate parametrically (see estimateRotoMouldCost). */
  mouldCost: number;
  mouldLife: number;
  amortizationVolume: number;
  // ── Cycle prediction (used when heating/cooling times ≤0) ──
  wallThicknessMm?: number;
  rotoMaterial?: RotoMaterialFamily;
  coolingMethod?: RotoCoolingMethod;
  // ── Mould estimation (used when mouldCost ≤0) ──
  projectedAreaCm2?: number;
  mouldType?: RotoMouldType;
  mouldComplexity?: RotoComplexity;
  ventsAndInserts?: number;
  // ── Additive ──
  masterbatchCostPerKg?: number;   // colour/UV/FR masterbatch premium £/kg of part
}

export function getRotationalMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (LLDPE powder most common)',
    partWeightKg: 'number — finished part weight kg (equals powder charge weight)',
    powderCostAdderPerKg: 'number — grinding/screening premium over pellet price £/kg (0.15–0.40 typical)',
    numArms: 'number — number of carousel arms (1=single, 3=biaxial standard, 4=rock-and-roll). One full cycle produces numArms × partsPerArm parts total',
    partsPerArm: 'number — number of moulds per arm (1–4 typically)',
    heatingTimeSec: 'number — oven residence time s (600–1800s typical). ≤0 → predict from wall × material × cooling method',
    coolingTimeSec: 'number — cooling booth time s (900–2400s typical). ≤0 → predict from heating time × cooling method',
    loadUnloadTimeSec: 'number — demould + charge load time s (120–300s typical)',
    wallThicknessMm: 'number? — nominal wall mm (drives predicted heating/cooling when times ≤0)',
    rotoMaterial: 'pe|xlpe|pp|pa12 — material family for cycle prediction',
    coolingMethod: 'ambient|forced-air|water-spray — cooling method for cycle prediction',
    projectedAreaCm2: 'number? — part footprint cm² for mould-cost estimate',
    mouldType: 'cast-al|cnc-al|fabricated — roto tool construction (mould-cost estimate)',
    masterbatchCostPerKg: 'number? — colour/UV/FR masterbatch premium £/kg of part',
    machineId: 'string — rotomoulding machine ID from rate library',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number — Al casting tool cost £ (much cheaper than injection mould)',
    mouldLife: 'number — cycles per mould life (50k–200k typical)',
    amortizationVolume: 'number — parts over which to amortize mould cost',
  };
}

export function computeRotationalMouldingDrivers(inputs: RotationalMouldingInputs): CommodityDrivers {
  // Predict heating/cooling from wall × material × cooling method when not given.
  const predicted = (inputs.heatingTimeSec > 0 && inputs.coolingTimeSec > 0)
    ? null
    : estimateRotoCycle({
        wallThicknessMm: inputs.wallThicknessMm ?? 3,
        material: inputs.rotoMaterial,
        coolingMethod: inputs.coolingMethod,
      });
  const heatingTimeSec = inputs.heatingTimeSec > 0 ? inputs.heatingTimeSec : (predicted?.heatingSec ?? 900);
  const coolingTimeSec = inputs.coolingTimeSec > 0 ? inputs.coolingTimeSec : (predicted?.coolingSec ?? 1200);

  const cycleTimeSec = heatingTimeSec + coolingTimeSec + inputs.loadUnloadTimeSec;
  const cycleTimeHr = cycleTimeSec / 3600;

  // Virtually no material waste in rotomoulding; all powder sinters onto mould walls
  const materialUtilization = 0.99;

  // Powder grinding premium + optional masterbatch are per-part consumables on material.
  const consumablesCostPerPart =
    (inputs.powderCostAdderPerKg + (inputs.masterbatchCostPerKg ?? 0)) * inputs.partWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg,
    materialUtilization,
    consumablesCostPerPart,
  };

  // All arms rotate simultaneously; one full carousel cycle produces numArms × partsPerArm parts
  const totalMouldCount = inputs.numArms * inputs.partsPerArm;

  const operations: OperationInput[] = [
    {
      operationName: 'Rotational Moulding',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr,
      partsPerCycle: inputs.numArms * inputs.partsPerArm,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // mouldLife is cycles per individual mould; total parts per full mould set = mouldLife × totalMouldCount
  const numMouldSets = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * totalMouldCount))
    : 1;

  // Per-mould cost: manual figure, else estimated parametrically.
  const perMouldCost = (inputs.mouldCost && inputs.mouldCost > 0)
    ? inputs.mouldCost
    : estimateRotoMouldCost({
        projectedAreaCm2: inputs.projectedAreaCm2 ?? 0,
        mouldType: inputs.mouldType,
        complexity: inputs.mouldComplexity,
        ventsAndInserts: inputs.ventsAndInserts,
      }).total;

  const tooling: ToolingInput = {
    totalToolingCost: perMouldCost * totalMouldCount * numMouldSets,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}

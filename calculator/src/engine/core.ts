import type {
  UniversalStackInput,
  PartCostResult,
  Breakdown8Bucket,
  OperationResult,
  TraceabilityRecord,
  ValidationResult,
  ValidationIssue,
  RateLibrary,
  LearningCurveApplied,
} from './types.js';
import { computeLearningCurveAdjustment } from './learning-curve.js';

export function validateStackInput(
  input: UniversalStackInput,
  library: RateLibrary
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const rm = input.rawMaterial;

  // Optional per-part adders: NaN passed through Math.max(0, NaN) into a NaN total, and Infinity into an
  // infinite one, with no error (360 review, Oct 2026).
  const optional: Array<[string, unknown]> = [
    ['rawMaterial.consumablesCostPerPart', rm.consumablesCostPerPart],
    ['rawMaterial.energyKwh.gas', rm.energyKwh?.gas],
    ['rawMaterial.energyKwh.electricity', rm.energyKwh?.electricity],
    ['rawMaterial.boughtIn.cost', rm.boughtIn?.cost],
  ];
  for (const [field, v] of optional) {
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0))
      errors.push({ field, message: 'Must be a finite non-negative number' });
  }

  if (rm.directCost !== undefined) {
    // directCost mode: skip weight/utilization checks; only validate the material exists for traceability
    if (!Number.isFinite(rm.directCost) || rm.directCost < 0)
      errors.push({ field: 'rawMaterial.directCost', message: 'Must be a finite non-negative number' });
    const mat = library.materials.find(m => m.id === rm.materialId);
    if (!mat)
      errors.push({ field: 'rawMaterial.materialId', message: `Material '${rm.materialId}' not found in rate library` });
  } else {
    // Note: comparisons are written so NaN also fails (NaN <= 0 is false, but !(NaN > 0) is true)
    if (!(Number.isFinite(rm.netWeightKg) && rm.netWeightKg > 0))
      errors.push({ field: 'rawMaterial.netWeightKg', message: 'Must be a positive finite number' });

    if (!(Number.isFinite(rm.materialUtilization) && rm.materialUtilization > 0 && rm.materialUtilization <= 1))
      errors.push({ field: 'rawMaterial.materialUtilization', message: 'Must be in range (0, 1]' });

    const mat = library.materials.find(m => m.id === rm.materialId);
    if (!mat)
      errors.push({ field: 'rawMaterial.materialId', message: `Material '${rm.materialId}' not found in rate library` });
    else if (mat.confidence !== 'High')
      warnings.push({ field: 'rawMaterial.materialId', message: `Material rate confidence: ${mat.confidence}` });

    if (rm.materialUtilization < 0.3)
      warnings.push({ field: 'rawMaterial.materialUtilization', message: 'Very low utilisation (<30%) — verify strip layout' });
  }

  for (let i = 0; i < input.operations.length; i++) {
    const op = input.operations[i];
    const p = `operations[${i}] (${op.operationName})`;

    // Conditions written positively so NaN and ±Infinity are rejected too
    // A bench operation legitimately has no machine time — it is an operator at
    // a bench, not a machine running. Every other operation must have positive
    // cycle time: zero there means the cycle was never set, which is a real bug
    // this check exists to catch.
    if (op.benchOperation) {
      if (!(Number.isFinite(op.cycleTimeHr) && op.cycleTimeHr >= 0))
        errors.push({ field: `${p}.cycleTimeHr`, message: 'Must be a finite non-negative number' });
    } else if (!(Number.isFinite(op.cycleTimeHr) && op.cycleTimeHr > 0)) {
      errors.push({ field: `${p}.cycleTimeHr`, message: 'Must be a positive finite number' });
    }
    if (!(op.partsPerCycle >= 1)) errors.push({ field: `${p}.partsPerCycle`, message: 'Must be ≥ 1' });
    if (!(op.oee > 0 && op.oee <= 1)) errors.push({ field: `${p}.oee`, message: 'Must be in (0, 1]' });
    if (!(Number.isFinite(op.manning) && op.manning > 0)) errors.push({ field: `${p}.manning`, message: 'Must be a positive finite number' });
    if (op.untended) {
      if (!(Number.isFinite(op.labourTimeHr) && op.labourTimeHr >= 0))
        errors.push({ field: `${p}.labourTimeHr`, message: 'Must be a finite non-negative number' });
    } else if (!(Number.isFinite(op.labourTimeHr) && op.labourTimeHr > 0)) {
      errors.push({ field: `${p}.labourTimeHr`, message: 'Must be a positive finite number' });
    }
    if (!(op.labourEfficiency > 0 && op.labourEfficiency <= 1))
      errors.push({ field: `${p}.labourEfficiency`, message: 'Must be in (0, 1]' });

    if (!library.machines.find(m => m.id === op.machineId))
      errors.push({ field: `${p}.machineId`, message: `Machine '${op.machineId}' not found in rate library` });

    if (!library.labour.find(l => l.id === op.labourId))
      errors.push({ field: `${p}.labourId`, message: `Labour rate '${op.labourId}' not found in rate library` });

    if (op.partsPerCycle > 1) {
      warnings.push({
        field: `${p}.partsPerCycle`,
        message: `Multi-cavity/multi-part (×${op.partsPerCycle}): cost allocated equally across cavities — verify all cavities have identical cycle times`,
      });
    }
  }

  if (!Number.isFinite(input.tooling.totalToolingCost) || input.tooling.totalToolingCost < 0)
    errors.push({ field: 'tooling.totalToolingCost', message: 'Must be a finite non-negative number' });

  if (input.tooling.mode === 'amortized' && !(input.tooling.amortizationVolume > 0))
    errors.push({ field: 'tooling.amortizationVolume', message: 'Must be positive when mode is amortized' });

  if (!Number.isFinite(input.packagingPerPart) || input.packagingPerPart < 0) errors.push({ field: 'packagingPerPart', message: 'Must be a finite non-negative number' });
  if (!Number.isFinite(input.logisticsPerPart) || input.logisticsPerPart < 0) errors.push({ field: 'logisticsPerPart', message: 'Must be a finite non-negative number' });
  if (!Number.isFinite(input.overheadPct) || input.overheadPct < 0) errors.push({ field: 'overheadPct', message: 'Must be a finite non-negative number' });
  if (input.overheadPct > 2.0) warnings.push({ field: 'overheadPct', message: `Value ${(input.overheadPct * 100).toFixed(0)}% looks high — overheadPct is a fraction (e.g. 0.12 = 12%), not a percentage` });
  if (!Number.isFinite(input.marginPct) || input.marginPct < 0) errors.push({ field: 'marginPct', message: 'Must be a finite non-negative number' });
  if (input.marginPct > 1.5) warnings.push({ field: 'marginPct', message: `Value ${(input.marginPct * 100).toFixed(0)}% looks high — marginPct is a fraction (e.g. 0.08 = 8%), not a percentage` });

  return { valid: errors.length === 0, errors, warnings };
}

/** The base overhead is a percentage of: material + process + labour + tooling.
 *  Every display of overhead shows this beside it — shown next to factory cost
 *  (which adds packaging and logistics) the rate looked wrong when it wasn't. */
export function overheadBaseOf(r: Pick<PartCostResult, 'breakdown' | 'overheadBase'>): number {
  if (r.overheadBase != null) return r.overheadBase;
  const b = r.breakdown;
  return b.rawMaterial + b.process + b.labour + b.tooling;
}

/** Overhead as a fraction of its own base (0 when the base is 0). */
export function overheadRateOf(r: Pick<PartCostResult, 'breakdown' | 'overheadBase'>): number {
  const base = overheadBaseOf(r);
  return base > 0 ? r.breakdown.overhead / base : 0;
}

export function computeUniversalStack(
  input: UniversalStackInput,
  library: RateLibrary
): PartCostResult {
  const traceability: TraceabilityRecord[] = [];

  // 1. Raw Material
  // directCost bypasses weight-based calculation (used by painting, BIW, PCB)
  let rawMaterialCost: number;
  if (input.rawMaterial.directCost !== undefined) {
    rawMaterialCost = input.rawMaterial.directCost;
    traceability.push({
      field: 'rawMaterial.directCost',
      value: rawMaterialCost,
      unit: '£',
      rateSource: 'Pre-computed by commodity module',
      rateId: input.rawMaterial.materialId,
      confidence: 'Medium',
    });
  } else {
    const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
    if (!mat) throw new Error(`Material '${input.rawMaterial.materialId}' not found`);

    const grossWeight = input.rawMaterial.netWeightKg / input.rawMaterial.materialUtilization;
    const rmGross = grossWeight * mat.pricePerKg;
    const scrapCredit = input.rawMaterial.lossIsNotScrap ? 0 : (grossWeight - input.rawMaterial.netWeightKg) * mat.scrapRecoveryPricePerKg;
    rawMaterialCost = rmGross - scrapCredit;

    traceability.push({
      field: 'material.pricePerKg',
      value: mat.pricePerKg,
      unit: '£/kg',
      rateSource: mat.sourceNote,
      rateId: mat.id,
      confidence: mat.confidence,
    });
    traceability.push({
      field: 'material.scrapRecoveryPricePerKg',
      value: mat.scrapRecoveryPricePerKg,
      unit: '£/kg',
      rateSource: mat.sourceNote,
      rateId: mat.id,
      confidence: mat.confidence,
    });
  }

  // Add recurring consumables (cores, wax, shell, etc.) to raw material cost
  if (input.rawMaterial.consumablesCostPerPart && input.rawMaterial.consumablesCostPerPart > 0) {
    rawMaterialCost += input.rawMaterial.consumablesCostPerPart;
    traceability.push({
      field: 'rawMaterial.consumablesCostPerPart',
      value: input.rawMaterial.consumablesCostPerPart,
      unit: '£',
      // Itemised when the module says what it is made of — a casting's is often mostly services
      // (X-ray, heat treatment, tool wear), not cores (stub axle live run, Oct 2026).
      rateSource: input.rawMaterial.consumablesItems?.length
        ? `Per-part consumables & services: ${input.rawMaterial.consumablesItems.map(i => `${i.label} £${i.gbp.toFixed(2)}`).join(' · ')}`
        : 'Per-part consumable (core/wax/shell)',
      rateId: input.rawMaterial.materialId,
      confidence: 'Medium',
    });
  }

  // Process energy, at the library's tariff (a regional library carries its region's).
  const en = input.rawMaterial.energyKwh;
  if (en && ((en.gas ?? 0) > 0 || (en.electricity ?? 0) > 0)) {
    const tariff = library.energy[0];
    if (!tariff) throw new Error('energyKwh given but the rate library has no energy tariff');
    for (const [kind, kwh, price] of [['gas', en.gas ?? 0, tariff.gasPerKwh], ['electricity', en.electricity ?? 0, tariff.electricityPerKwh]] as const) {
      if (kwh <= 0) continue;
      rawMaterialCost += kwh * price;
      traceability.push({
        field: `rawMaterial.energyKwh.${kind}`, value: kwh * price, unit: '£',
        rateSource: `${kwh.toFixed(4)} kWh × £${price}/kWh ${kind} (${tariff.region} tariff)${en.basis ? ` — ${en.basis}` : ''}`,
        rateId: tariff.id, confidence: tariff.confidence,
      });
    }
  }

  // Bought-in components: in the material line, outside the overhead and margin base.
  const boughtInCost = Math.max(0, input.rawMaterial.boughtIn?.cost ?? 0);
  const boughtInHandling = boughtInCost * Math.max(0, input.rawMaterial.boughtIn?.handlingPct ?? 0);
  if (boughtInCost > 0) {
    rawMaterialCost += boughtInCost;
    traceability.push({
      field: 'rawMaterial.boughtIn', value: boughtInCost, unit: '£',
      rateSource: `Bought-in at supplier price (its overhead + margin included); handling ${((input.rawMaterial.boughtIn?.handlingPct ?? 0) * 100).toFixed(1)}% charged as overhead, no second margin`,
      rateId: input.rawMaterial.materialId, confidence: 'Medium',
    });
  }

  // 2 & 3. Process + Labour
  const operationDetails: OperationResult[] = [];
  let processTotal = 0;
  let labourTotal = 0;

  for (const op of input.operations) {
    const machine = library.machines.find(m => m.id === op.machineId);
    if (!machine) throw new Error(`Machine '${op.machineId}' not found`);

    const labour = library.labour.find(l => l.id === op.labourId);
    if (!labour) throw new Error(`Labour rate '${op.labourId}' not found`);

    const processCost = machine.computedRatePerHr * op.cycleTimeHr / op.partsPerCycle / op.oee;
    const labourCost = labour.fullyLoadedRatePerHr * op.manning * op.labourTimeHr / op.partsPerCycle / op.labourEfficiency;

    processTotal += processCost;
    labourTotal += labourCost;

    operationDetails.push({
      operationName: op.operationName,
      machineId: op.machineId,
      labourId: op.labourId,
      processCost,
      labourCost,
      machineRateUsed: machine.computedRatePerHr,
      labourRateUsed: labour.fullyLoadedRatePerHr,
      cycleTimeHr: op.cycleTimeHr,
      partsPerCycle: op.partsPerCycle,
      oee: op.oee,
      manning: op.manning,
      labourTimeHr: op.labourTimeHr,
      labourEfficiency: op.labourEfficiency,
      ...(op.benchOperation ? { benchOperation: true } : {}),
    });

    // A bench operation buys no machine time, so the machine rate is not one of
    // its drivers. Tracing it anyway put a "Masking: Machine Rate £102/hr" row
    // in the tornado worth £0.25 — the paint line's own lever, listed a second
    // time against an operation that cannot be moved by it. In a negotiation
    // document a phantom lever is worse than a missing one.
    if (!op.benchOperation) {
      traceability.push({
        field: `${op.operationName}.machineRatePerHr`,
        value: machine.computedRatePerHr,
        unit: '£/hr',
        rateSource: machine.sourceNote,
        rateId: machine.id,
        confidence: machine.confidence,
      });
    }
    traceability.push({
      field: `${op.operationName}.labourRatePerHr`,
      value: labour.fullyLoadedRatePerHr,
      unit: '£/hr',
      rateSource: labour.sourceNote,
      rateId: labour.id,
      confidence: labour.confidence,
    });
  }

  // 2b. Learning curve adjustment (Wright's Law) — applied to aggregate labour cost
  let learningCurveApplied: LearningCurveApplied | undefined;
  if (input.learningCurve?.enabled && input.annualVolume && input.annualVolume > 0) {
    const lc = computeLearningCurveAdjustment(labourTotal, {
      annualVolume: input.annualVolume,
      referenceVolume: input.learningCurve.referenceVolume,
      curvePct: input.learningCurve.curvePct,
    });
    learningCurveApplied = {
      adjustmentFactor: lc.adjustmentFactor,
      labourSaving: lc.volumeEffect,          // negative = saving
      curvePct: input.learningCurve.curvePct,
      referenceVolume: input.learningCurve.referenceVolume,
      annualVolume: input.annualVolume,
    };
    labourTotal = lc.adjustedLabourCost;
  }

  // 4. Tooling
  let toolingPerPart = 0;
  let toolingNRE: number | undefined;

  if (input.tooling.mode === 'amortized') {
    toolingPerPart = input.tooling.totalToolingCost / input.tooling.amortizationVolume;
  } else {
    toolingNRE = input.tooling.totalToolingCost;
  }

  // 5 & 6. Packaging + Logistics
  const packaging = input.packagingPerPart;
  const logistics = input.logisticsPerPart;

  // 7. Overhead — base is all factory costs except outbound packaging/logistics.
  // Note: this includes raw material and tooling (not "conversion cost only").
  // Calibrate overheadPct accordingly — industry benchmark of 10–15% is on this broader base.
  const factoryCostBase = rawMaterialCost + processTotal + labourTotal + toolingPerPart;
  // Bought-in content takes handling, not the assembler's overhead (zero when unused).
  const overhead = input.overheadPct * (factoryCostBase - boughtInCost) + boughtInHandling;
  const factoryCost = factoryCostBase + packaging + logistics;
  const subtotal = factoryCost + overhead;

  // 8. Margin — not on bought-in content, which already carries its supplier's.
  const margin = input.marginPct * (subtotal - boughtInCost);
  const total = subtotal + margin;

  // Sanity: no bucket should be negative
  if (rawMaterialCost < 0) throw new Error('Computed raw material cost is negative — check scrap recovery price');
  if (total < 0) throw new Error('Computed total cost is negative — check inputs');

  const breakdown: Breakdown8Bucket = {
    rawMaterial: rawMaterialCost,
    process: processTotal,
    labour: labourTotal,
    tooling: toolingPerPart,
    packaging,
    logistics,
    overhead,
    margin,
  };

  const result: PartCostResult = {
    partName: input.partName,
    breakdown,
    operationDetails,
    factoryCost,
    overheadBase: factoryCostBase - boughtInCost,
    subtotal,
    total,
    traceability,
  };

  if (toolingNRE !== undefined) result.toolingNRE = toolingNRE;
  if (learningCurveApplied !== undefined) result.learningCurveApplied = learningCurveApplied;

  // Carry the validation warnings onto the result. `validateInput` has always
  // computed them — low material-rate confidence, sub-30% utilisation, an
  // overhead/margin entered as a percentage where a fraction was meant — and
  // they were discarded at the door. Nothing downstream could see them, so the
  // PDF could not print them and every saved costing recorded itself as High
  // confidence (main.ts keys that off `result.warnings?.length`).
  const validation = validateStackInput(input, library);
  if (validation.warnings.length > 0) {
    result.warnings = validation.warnings.map((w: ValidationIssue) => `${w.field}: ${w.message}`);
  }

  return result;
}

export function breakdownPercentages(result: PartCostResult): Record<keyof Breakdown8Bucket, number> {
  const t = result.total;
  const b = result.breakdown;
  return {
    rawMaterial: t > 0 ? (b.rawMaterial / t) * 100 : 0,
    process: t > 0 ? (b.process / t) * 100 : 0,
    labour: t > 0 ? (b.labour / t) * 100 : 0,
    tooling: t > 0 ? (b.tooling / t) * 100 : 0,
    packaging: t > 0 ? (b.packaging / t) * 100 : 0,
    logistics: t > 0 ? (b.logistics / t) * 100 : 0,
    overhead: t > 0 ? (b.overhead / t) * 100 : 0,
    margin: t > 0 ? (b.margin / t) * 100 : 0,
  };
}

export function computeResultDelta(
  baseResult: PartCostResult,
  targetResult: PartCostResult
) {
  const b = baseResult.breakdown;
  const t = targetResult.breakdown;
  const deltaTotal = targetResult.total - baseResult.total;
  return {
    delta: {
      rawMaterial: t.rawMaterial - b.rawMaterial,
      process: t.process - b.process,
      labour: t.labour - b.labour,
      tooling: t.tooling - b.tooling,
      packaging: t.packaging - b.packaging,
      logistics: t.logistics - b.logistics,
      overhead: t.overhead - b.overhead,
      margin: t.margin - b.margin,
    },
    deltaTotal,
    deltaPct: baseResult.total > 0 ? (deltaTotal / baseResult.total) * 100 : 0,
  };
}

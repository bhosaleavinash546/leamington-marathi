import type {
  UniversalStackInput,
  PartCostResult,
  Breakdown8Bucket,
  OperationResult,
  TraceabilityRecord,
  ValidationResult,
  ValidationIssue,
  RateLibrary,
} from './types.js';

export function validateStackInput(
  input: UniversalStackInput,
  library: RateLibrary
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const rm = input.rawMaterial;

  if (rm.directCost !== undefined) {
    // directCost mode: skip weight/utilization checks; only validate the material exists for traceability
    if (rm.directCost < 0)
      errors.push({ field: 'rawMaterial.directCost', message: 'Cannot be negative' });
    const mat = library.materials.find(m => m.id === rm.materialId);
    if (!mat)
      errors.push({ field: 'rawMaterial.materialId', message: `Material '${rm.materialId}' not found in rate library` });
  } else {
    if (rm.netWeightKg <= 0)
      errors.push({ field: 'rawMaterial.netWeightKg', message: 'Must be positive' });

    if (rm.materialUtilization <= 0 || rm.materialUtilization > 1)
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

    if (op.cycleTimeHr <= 0) errors.push({ field: `${p}.cycleTimeHr`, message: 'Must be positive' });
    if (op.partsPerCycle < 1) errors.push({ field: `${p}.partsPerCycle`, message: 'Must be ≥ 1' });
    if (op.oee <= 0 || op.oee > 1) errors.push({ field: `${p}.oee`, message: 'Must be in (0, 1]' });
    if (op.manning <= 0) errors.push({ field: `${p}.manning`, message: 'Must be positive' });
    if (op.labourTimeHr <= 0) errors.push({ field: `${p}.labourTimeHr`, message: 'Must be positive' });
    if (op.labourEfficiency <= 0 || op.labourEfficiency > 1)
      errors.push({ field: `${p}.labourEfficiency`, message: 'Must be in (0, 1]' });

    if (!library.machines.find(m => m.id === op.machineId))
      errors.push({ field: `${p}.machineId`, message: `Machine '${op.machineId}' not found in rate library` });

    if (!library.labour.find(l => l.id === op.labourId))
      errors.push({ field: `${p}.labourId`, message: `Labour rate '${op.labourId}' not found in rate library` });
  }

  if (input.tooling.totalToolingCost < 0)
    errors.push({ field: 'tooling.totalToolingCost', message: 'Cannot be negative' });

  if (input.tooling.mode === 'amortized' && input.tooling.amortizationVolume <= 0)
    errors.push({ field: 'tooling.amortizationVolume', message: 'Must be positive when mode is amortized' });

  if (input.packagingPerPart < 0) errors.push({ field: 'packagingPerPart', message: 'Cannot be negative' });
  if (input.logisticsPerPart < 0) errors.push({ field: 'logisticsPerPart', message: 'Cannot be negative' });
  if (input.overheadPct < 0) errors.push({ field: 'overheadPct', message: 'Cannot be negative' });
  if (input.marginPct < 0) errors.push({ field: 'marginPct', message: 'Cannot be negative' });

  return { valid: errors.length === 0, errors, warnings };
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
    const scrapCredit = (grossWeight - input.rawMaterial.netWeightKg) * mat.scrapRecoveryPricePerKg;
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
      rateSource: 'Per-part consumable (core/wax/shell)',
      rateId: input.rawMaterial.materialId,
      confidence: 'Medium',
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
    });

    traceability.push({
      field: `${op.operationName}.machineRatePerHr`,
      value: machine.computedRatePerHr,
      unit: '£/hr',
      rateSource: machine.sourceNote,
      rateId: machine.id,
      confidence: machine.confidence,
    });
    traceability.push({
      field: `${op.operationName}.labourRatePerHr`,
      value: labour.fullyLoadedRatePerHr,
      unit: '£/hr',
      rateSource: labour.sourceNote,
      rateId: labour.id,
      confidence: labour.confidence,
    });
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

  // 7. Overhead — base is conversion cost only (excl. packaging/logistics which are outbound costs)
  const factoryCostBase = rawMaterialCost + processTotal + labourTotal + toolingPerPart;
  const overhead = input.overheadPct * factoryCostBase;
  const factoryCost = factoryCostBase + packaging + logistics;
  const subtotal = factoryCost + overhead;

  // 8. Margin
  const margin = input.marginPct * subtotal;
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
    subtotal,
    total,
    traceability,
  };

  if (toolingNRE !== undefined) result.toolingNRE = toolingNRE;

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

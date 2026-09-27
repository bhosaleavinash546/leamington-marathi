/**
 * Plain-English names for the engine's validation fields.
 *
 * The engine names a field by its path in the input ("rawMaterial.materialId",
 * "operations[0] (Turning).oee"), and the form used to print that path to the
 * user: "rawMaterial.materialId: Material rate confidence: Medium". The engine
 * keeps its paths — they are how tests and logs find a field — and the form
 * shows these names instead.
 */

const FIELDS: Record<string, string> = {
  'rawMaterial.materialId': 'Material',
  'rawMaterial.materialUtilization': 'Material utilisation',
  'rawMaterial.directCost': 'Material cost',
  'rawMaterial.netWeightKg': 'Net weight',
  'rawMaterial.consumablesCostPerPart': 'Consumables',
  'material.pricePerKg': 'Material price',
  'material.scrapRecoveryPricePerKg': 'Scrap recovery price',
  'tooling.totalToolingCost': 'Tooling cost',
  'tooling.amortizationVolume': 'Tooling amortisation volume',
  overheadPct: 'Overhead %',
  marginPct: 'Margin %',
  packagingPerPart: 'Packaging',
  logisticsPerPart: 'Logistics',
};

const OPERATION_FIELDS: Record<string, string> = {
  cycleTimeHr: 'cycle time',
  labourTimeHr: 'labour time',
  labourEfficiency: 'labour efficiency',
  labourId: 'labour grade',
  machineId: 'machine',
  manning: 'manning',
  oee: 'OEE',
  partsPerCycle: 'parts per cycle',
  machineRatePerHr: 'machine rate',
  labourRatePerHr: 'labour rate',
};

/** "operations[0] (Turning).oee" → "Turning (operation 1) — OEE". Unknown paths pass through. */
export function fieldLabel(field: string): string {
  if (FIELDS[field]) return FIELDS[field];
  const dot = field.lastIndexOf('.');
  if (dot > 0) {
    const owner = field.slice(0, dot);
    const leaf = OPERATION_FIELDS[field.slice(dot + 1)];
    if (leaf) {
      const op = /^operations\[(\d+)\](?: \((.+)\))?$/.exec(owner);
      if (op) return `${op[2] ? `${op[2]} (operation ${Number(op[1]) + 1})` : `Operation ${Number(op[1]) + 1}`} — ${leaf}`;
      return `${owner} — ${leaf}`;   // an operation named directly, e.g. "Turning"
    }
  }
  return field;
}

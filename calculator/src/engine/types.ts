// ─── Rate Library ────────────────────────────────────────────────────────────

export type Confidence = 'High' | 'Medium' | 'Low';
export type CommodityType =
  | 'machining'
  | 'sheet_metal'
  | 'injection_moulding'
  | 'blow_moulding'
  | 'extrusion'
  | 'thermoforming'
  | 'rotational_moulding'
  | 'casting'
  | 'forging'
  | 'painting'
  | 'biw_assembly'
  | 'pcb_fab'
  | 'pcba'
  | 'cast_and_machine'
  | 'cad_analysis'
  | 'assembly';
export type ToolingMode = 'amortized' | 'one_time_nre';

export interface MaterialRate {
  id: string;
  grade: string;
  category: string;
  pricePerKg: number;
  scrapRecoveryPricePerKg: number;
  densityKgPerM3: number;
  region: string;
  effectiveDate: string;
  sourceNote: string;
  confidence: Confidence;
}

export interface MachineRateBuildup {
  annualDepreciation: number;
  maintenance: number;
  energy: number;
  floorSpace: number;
  indirectSupport: number;
  financeCost: number;
  annualAvailableHours: number;
  machineUtilization: number;
}

export interface MachineRate {
  id: string;
  machineClass: string;
  buildup: MachineRateBuildup;
  computedRatePerHr: number;
  region: string;
  effectiveDate: string;
  sourceNote: string;
  confidence: Confidence;
}

export interface LabourRate {
  id: string;
  region: string;
  skillLevel: string;
  fullyLoadedRatePerHr: number;
  effectiveDate: string;
  sourceNote: string;
  confidence: Confidence;
}

export interface EnergyRate {
  id: string;
  region: string;
  electricityPerKwh: number;
  gasPerKwh: number;
  effectiveDate: string;
  sourceNote: string;
  confidence: Confidence;
}

export interface FXRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  sourceNote: string;
}

export interface OverheadDefault {
  id: string;
  commodityType: CommodityType;
  supplierTier: string;
  overheadPct: number;
  marginPct: number;
  sourceNote: string;
}

export interface RateLibrary {
  materials: MaterialRate[];
  machines: MachineRate[];
  labour: LabourRate[];
  energy: EnergyRate[];
  fx: FXRate[];
  overheadDefaults: OverheadDefault[];
  version: string;
  lastModified: string;
}

// ─── Universal Stack Inputs ──────────────────────────────────────────────────

export interface RawMaterialInput {
  materialId: string;
  netWeightKg: number;
  materialUtilization: number;
  /** When set, bypasses weight-based cost calculation (used by painting, BIW, PCB). */
  directCost?: number;
  /** Per-part recurring consumable cost (cores, wax patterns, shell, etc.) added to raw material cost line. */
  consumablesCostPerPart?: number;
}

export interface OperationInput {
  operationName: string;
  machineId: string;
  labourId: string;
  cycleTimeHr: number;
  partsPerCycle: number;
  oee: number;
  manning: number;
  labourTimeHr: number;
  labourEfficiency: number;
}

export interface ToolingInput {
  totalToolingCost: number;
  amortizationVolume: number;
  mode: ToolingMode;
}

export interface UniversalStackInput {
  partName: string;
  rawMaterial: RawMaterialInput;
  operations: OperationInput[];
  tooling: ToolingInput;
  packagingPerPart: number;
  logisticsPerPart: number;
  overheadPct: number;
  marginPct: number;
}

// ─── Universal Stack Output ──────────────────────────────────────────────────

export interface OperationResult {
  operationName: string;
  machineId: string;
  labourId: string;
  processCost: number;
  labourCost: number;
  machineRateUsed: number;
  labourRateUsed: number;
  // Input fields retained for downstream display & export
  cycleTimeHr: number;
  partsPerCycle: number;
  oee: number;
  manning: number;
  labourTimeHr: number;
  labourEfficiency: number;
}

export interface Breakdown8Bucket {
  rawMaterial: number;
  process: number;
  labour: number;
  tooling: number;
  packaging: number;
  logistics: number;
  overhead: number;
  margin: number;
}

export interface TraceabilityRecord {
  field: string;
  value: number;
  unit: string;
  rateSource: string;
  rateId: string;
  confidence: Confidence;
}

export interface PartCostResult {
  partName: string;
  breakdown: Breakdown8Bucket;
  operationDetails: OperationResult[];
  factoryCost: number;
  subtotal: number;
  total: number;
  toolingNRE?: number;
  traceability: TraceabilityRecord[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ─── Commodity Module Interface ──────────────────────────────────────────────

export interface CommodityDrivers {
  rawMaterial: RawMaterialInput;
  operations: OperationInput[];
  tooling: ToolingInput;
}

// ─── Supplier Quote ──────────────────────────────────────────────────────────

export interface SupplierQuote {
  supplierName: string;
  quotedPriceGBP: number;
  quoteDate: string;
  leadTimeDays: number;
  currency: string;
  fxRate: number;
  notes: string;
}

// ─── Scenario ────────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  name: string;
  description: string;
  input: UniversalStackInput;
  result: PartCostResult;
  createdAt: string;
}

export interface ScenarioDelta {
  rawMaterial: number;
  process: number;
  labour: number;
  tooling: number;
  packaging: number;
  logistics: number;
  overhead: number;
  margin: number;
  total: number;
  totalPct: number;
}

export interface ScenarioComparison {
  baseline: Scenario;
  target: Scenario;
  delta: ScenarioDelta;
}

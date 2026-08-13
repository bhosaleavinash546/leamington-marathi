// ─── Rate Library ────────────────────────────────────────────────────────────

export type Confidence = 'High' | 'Medium' | 'Low';
export type CommodityType =
  | 'machining'
  | 'sheet_metal'
  | 'sheet_metal_fab'
  | 'injection_moulding'
  | 'blow_moulding'
  | 'extrusion'
  | 'thermoforming'
  | 'rotational_moulding'
  | 'casting'
  | 'forging'
  | 'gear'
  | 'painting'
  | 'biw_assembly'
  | 'pcb_fab'
  | 'pcba'
  | 'cast_and_machine'
  | 'rubber'
  | 'composites'
  | 'wiring_harness'
  | 'cad_analysis'
  | 'assembly'
  | 'automotive_software';
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
  /**
   * Optional itemisation behind `directCost` — the BOM for a PCBA, the wire and
   * connector schedule for a harness, the sub-part list for a BIW assembly.
   *
   * Commodities that price material as a single pass-through used to report it
   * as one opaque `mat-virtual` line, so on a populated ECU the LARGEST cost
   * bucket (72% of the part) was unauditable in the report. Purely for display
   * and audit — no cost path reads this, so it can never move a number.
   */
  lines?: MaterialLineItem[];
}

/** One itemised line behind a `directCost` material bucket. Display only. */
export interface MaterialLineItem {
  /** Reference designator, wire number, or sub-part number. */
  ref: string;
  description: string;
  qty: number;
  /** Unit cost in the costing's base currency (GBP). */
  unitCost: number;
  /** Package / form factor — "BGA", "SOIC-8", "0402", "THT radial". */
  pkg?: string;
  /** Electrical or physical value — "32Mbit", "100V", "10-pin", "0.47uH". */
  value?: string;
  /** Optional provenance — "marking legible in photo", "class median", a quote ref. */
  note?: string;
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
  /**
   * A bench operation: an operator working on the part away from the line, so
   * it consumes labour time but no machine time. Masking and de-masking on a
   * paint line are the case this exists for.
   *
   * Declared explicitly rather than inferred from `cycleTimeHr === 0`, because
   * the validator's "cycle time must be positive" rule catches a real and common
   * bug — a machine operation whose cycle time was never set. Relaxing that rule
   * for every operation would let the bug through; a flag the caller opts into
   * keeps the guard everywhere else.
   */
  benchOperation?: boolean;
}

export interface ToolingInput {
  totalToolingCost: number;
  amortizationVolume: number;
  mode: ToolingMode;
}

export interface LearningCurveConfig {
  enabled: boolean;
  curvePct: number;          // e.g. 85 = Wright's 85% (cost drops 15% per volume doubling)
  referenceVolume: number;   // cumulative volume at which base labour cost was established
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
  /** Optional: when set, adjusts total labour cost using Wright's Law */
  learningCurve?: LearningCurveConfig;
  /** Annual production volume — required when learningCurve is enabled */
  annualVolume?: number;
  /**
   * Programme life in years. Lifetime volume is `annualVolume × programmeYears`.
   *
   * Set this on a multi-year award (an LTA) so that amortising NRE over the
   * whole programme reads as correct rather than as a 5× amortisation error.
   * It does not itself move any number — `tooling.amortizationVolume` is still
   * the figure that divides — it states which of the two bases was intended.
   */
  programmeYears?: number;
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

export interface LearningCurveApplied {
  adjustmentFactor: number;
  labourSaving: number;
  curvePct: number;
  referenceVolume: number;
  annualVolume: number;
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
  learningCurveApplied?: LearningCurveApplied;
  warnings?: string[];
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

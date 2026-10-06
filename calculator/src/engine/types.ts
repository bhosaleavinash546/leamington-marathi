// ─── Rate Library ────────────────────────────────────────────────────────────

export type Confidence = 'High' | 'Medium' | 'Low';
export type CommodityType =
  | 'machining'
  | 'sheet_metal'
  | 'sheet_metal_fab'
  | 'injection_moulding'
  | 'blow_moulding'
  | 'extrusion'
  | 'aluminium_extrusion'
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

/**
 * "Use OUR asset wherever the tool asks for this one."
 *
 * The costing formulas name machines and labour grades by id — the smallest
 * press that covers the tonnage is `press-630t`, the machinist is
 * `lab-uk-skilled`. Those ids are SLOTS, chosen by capability, not by who owns
 * the asset. A plant that renames them breaks every costing, loudly:
 * "Machine 'mach-haas-vf2' not found in rate library".
 *
 * An alias lets a plant keep its own asset register. JLR upload their machines
 * under their own ids and add one row here per slot they cover; the formulas go
 * on choosing slots, and the slot resolves to their asset's economics. The
 * resolved row keeps the JLR description and records which asset stood in, so a
 * report names the real machine rather than ours.
 */
export interface RateAlias {
  kind: 'machine' | 'labour';
  /** The id the formulas ask for, e.g. `mach-haas-vf2`. */
  slot: string;
  /** The id in this library to use instead, e.g. `JLR-SOL-VMC-014`. */
  useId: string;
  note?: string;
}

export interface RateLibrary {
  materials: MaterialRate[];
  machines: MachineRate[];
  labour: LabourRate[];
  energy: EnergyRate[];
  fx: FXRate[];
  overheadDefaults: OverheadDefault[];
  /** Optional. Absent means the ids are used exactly as supplied. */
  aliases?: RateAlias[];
  version: string;
  lastModified: string;
  /**
   * Set by `buildRegionalLibrary`: the country this book was rebuilt for, and the
   * factors applied to rates that live outside the library (the toolroom £/hr).
   * Absent on the UK base library and on an uploaded company library.
   */
  regional?: { code: string; name: string; toolroomFactor: number };
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
  /** What `consumablesCostPerPart` is made of, £ each — printed in the cost trace (it is often mostly services). */
  consumablesItems?: Array<{ label: string; gbp: number }>;
  /**
   * Bought-in components priced at their supplier's price — which already
   * carries that supplier's overhead and margin. Shown in the material line, but
   * the assembler's overhead and margin are NOT applied to it again; only a
   * material-handling / procurement charge (`handlingPct`, typical 2–5%) is,
   * as overhead. Sheet-metal review: a BIW assembly stacked 12% + 8% on its
   * stamped sub-parts' full should-cost.
   */
  boughtIn?: { cost: number; handlingPct: number };
  /**
   * Process energy bought per part, kWh, priced at the rate library's own energy
   * tariff — so a regional library prices it at that region's gas and power
   * (aluminium-extrusion review, Oct 2026: billet heating and ageing gas were a
   * fixed UK £ figure in every region). Added to the material line, with a
   * traceability record each.
   */
  energyKwh?: { gas?: number; electricity?: number; basis?: string };
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
  /** A machine that runs with no crew of its own — an in-line station the
   *  upstream machine's crew tends, counted there. Labour time may be 0. */
  untended?: boolean;
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
  /**
   * 'market_price' when the cost comes from a supplier's price table rather
   * than being built up (PCB fabrication). A price already contains the
   * supplier's overhead and margin; the collector sets both to zero and the
   * displays say why.
   */
  priceBasis?: 'market_price';
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
  /** What overhead is a percentage OF: material + process + labour + tooling.
   *  Not factoryCost, which adds packaging and logistics. Optional only because
   *  results saved before it existed lack it — read it through overheadBaseOf(). */
  overheadBase?: number;
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
  /** Set by a module whose figure is a supplier's price, not a build-up. */
  priceBasis?: 'market_price';
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
  /** Manufacturing country the scenario was costed in (absent on older saves = UK). A
   *  comparison re-costs each scenario in ITS country — it used to re-cost both in
   *  whatever country was selected, so a China scenario was priced at UK rates. */
  region?: string;
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

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
  | 'battery_pack'
  | 'e_motor'
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

/**
 * Overhead and margin for a commodity in a country (rates flow R2, Nov 2026) — read by `regionalShopDefaults`, screen and
 * headless. `commodityType: '*'` is every commodity the country has no own row for; `country` absent / 'UK' is the UK.
 * A country with no row of its own keeps its published default (the BUILT-IN UK row × its overhead multiplier).
 */
export interface OverheadDefault {
  id: string;
  commodityType: CommodityType | '*';
  /** Region code the row applies to (absent = UK). */
  country?: string;
  /** Descriptive only (pre-R2 rows carried a tier; no costing selects by it). */
  supplierTier?: string;
  overheadPct: number;
  marginPct: number;
  sourceNote: string;
}

/**
 * A service, toolroom or tool £ rate a rule or module prices with (rates flow R2, Nov 2026): the UK figure the code used to
 * hold as a literal, with its unit, its country basis (what moves it in a country with no own row — `countryFactor`) and
 * its source. A row with `country` set is that country's own figure, used as given (no country factor).
 */
export interface ServiceRate {
  id: string;
  /** Region code (absent = UK). */
  country?: string;
  label: string;
  value: number;
  /** "£/h", "£ each", "£/kg", "£/min of cut" … */
  unit: string;
  /** The country basis as text: toolroom / engineer / heatTreat / inspection / process / chemical / global, a library
   *  material ("material:mat-…") or a traded share ("global 0.2 + toolroom"). */
  basis: string;
  effectiveDate: string;
  sourceNote: string;
  confidence: Confidence;
}

/** A company's rows for a country other than the UK (rates flow R2): applied ONLY to that country's book. */
export interface CountryRateRows {
  materials?: MaterialRate[];
  machines?: MachineRate[];
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
  /**
   * Service, toolroom and tool £ rates (the Services & toolroom sheet, rates flow R2). Rows with `country` are that
   * country's own; the rest are the UK's. Read through `serviceRate` (service-rates.ts), never the literal.
   */
  services?: ServiceRate[];
  /** A company's Materials / Machines rows for other countries, by region code — `buildRegionalLibrary(…, cc)` only. */
  countryRows?: Record<string, CountryRateRows>;
  /**
   * The BUILT-IN UK rows a company row, an alias or a cell override replaced in this UK book, and the ids the company
   * added (rates flow R2). A country book is rebuilt from the built-in UK basis — never from the company's UK row — so a
   * UK company rate cannot move another country's cost. Set by `resolveActiveLibrary`; absent on the built-in book.
   */
  ukBuiltInBasis?: {
    materials: MaterialRate[]; machines: MachineRate[]; labour: LabourRate[]; energy: EnergyRate[];
    /** `${table}:${id}` of the UK rows the built-in book does not have. */
    added: string[];
  };
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
  /** A scrap credit price, £/kg, in place of the library grade's (a typed scrap price, or a lever's what-if). */
  scrapRecoveryPricePerKgOverride?: number;
  /**
   * The (gross − net) weight is metal LOST, not scrap to sell — no scrap credit on it. A casting buys
   * good part + melt loss (its gating is remelted in-house); crediting the burnt-off metal at scrap
   * value charged only ~82% of it (360 review, Oct 2026).
   */
  lossIsNotScrap?: boolean;
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

/**
 * What KIND of money a tooling item is — how a supplier contracts it (report standard, Nov 2026, register #9):
 *   - 'initial'     the first set of a tool (die, mould, pattern, the tools the volume needs in service) — invoiced up front;
 *   - 'replacement' the sets bought because the first wears out over the programme, and the upkeep of the tool
 *                   (mould / die maintenance) — consumed over the programme, not an up-front investment;
 *   - 'perishable'  cutting tools worn by every part (hobs, grinding wheels, inserts) — a running cost a part;
 *   - 'nre'         one-off engineering and work-holding: fixtures, programming, first article, inspection masters —
 *                   up front, with the initial set.
 * Up-front investment = initial + nre; the rest is running cost carried in the piece price.
 */
export type ToolingKind = 'initial' | 'replacement' | 'perishable' | 'nre';

export interface ToolingItem {
  label: string;
  gbp: number;
  kind?: ToolingKind;
  /** £ of ONE set of this tool (the first set a supplier invoices) — on a tool bought by life. */
  firstSetGbp?: number;
  /** Sets this item counts: 1 on the first set, N − 1 on the replacements (fractional where wear is charged fractionally). */
  sets?: number;
}

export interface ToolingInput {
  totalToolingCost: number;
  amortizationVolume: number;
  mode: ToolingMode;
  /**
   * What `totalToolingCost` is made of, £ (descriptive: the core reads only the total). The knuckle's ₹38.5 lakh was
   * one number in both reports (casting 360 review X13). Every module's items carry a `kind` and add up to the total
   * (`toolingSplit` in tooling-split.ts sums them by kind).
   */
  items?: ToolingItem[];
}

export interface LearningCurveConfig {
  enabled: boolean;
  curvePct: number;          // e.g. 85 = Wright's 85% (cost drops 15% per volume doubling)
  referenceVolume: number;   // cumulative volume at which base labour cost was established
}

/** Incoterm of the should-cost price: delivered to your plant, or ex-works (the buyer collects). */
export type DeliveryTerms = 'DAP' | 'EXW';

export interface UniversalStackInput {
  partName: string;
  rawMaterial: RawMaterialInput;
  operations: OperationInput[];
  tooling: ToolingInput;
  packagingPerPart: number;
  logisticsPerPart: number;
  /**
   * The terms the price is quoted on: 'DAP' (default) = delivered to the buyer's plant, freight in the logistics line;
   * 'EXW' = ex-works, the buyer collects at the supplier's gate — the price carries packaging but no freight, and the
   * logistics line is 0 (country review, Oct 2026). Read by the shop defaults and printed by the reports.
   */
  deliveryTerms?: DeliveryTerms;
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
  /** A bench step — labour only, its machine id a placeholder (exports must not show that machine's rate). */
  benchOperation?: boolean;
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

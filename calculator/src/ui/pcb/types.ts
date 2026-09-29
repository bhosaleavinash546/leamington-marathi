/**
 * Shapes of the PCB image-analysis result as the UI renders it (the server's
 * /api/pcb/analyze-image* payload, plus the fields the client attaches).
 *
 * First slice of splitting src/ui/main.ts (L12): pure declarations, moved
 * verbatim. main.ts imports them by name.
 */
export interface PCBConfidenceBand {
  bomCostLow: number; bomCostMid: number; bomCostHigh: number;
  fabCostLow: number; fabCostMid: number; fabCostHigh: number;
  totalLow: number; totalMid: number; totalHigh: number;
  unconfirmedHighValueCount: number;
  ocrConfirmedCount: number;
  weightedBOMConfidence: number;
  bomConfidenceLabel: 'High' | 'Medium' | 'Low';
  fabConfidenceLabel: 'High' | 'Medium' | 'Low';
  overallLabel: 'High' | 'Medium' | 'Low';
  volumeMultiplier: number;
}

export interface NPIBreakdown {
  stencilCost: number;
  firstArticleCost: number;
  toolingTotal: number;
  unitCostNPI: number;
  unitCostProd: number;
  setupPerUnit50: number;
}

export interface SanityWarning { code: string; message: string; severity: 'warn' | 'error' }

export interface PCBBOMItem {
  refDes: string;
  componentType: string;
  description: string;
  pkg: string;
  value: string;
  voltage: string;
  qty: number;
  unitPriceGBP: number;
  moq: number;
  automotive: boolean;
  highCost: boolean;
  partNumber?: string;
  lineConf?: number;
  ocrExtracted?: boolean;
  unconfirmedHighValue?: boolean;
  volumeAdjusted?: boolean;
  lineTotalGBP?: number;
  livePriced?: boolean;
}
export interface PCBCountryBreakdown {
  countryId: string;
  countryName: string;
  flag: string;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
  bomCostPerBoard: number;
  totalPerBoard: number;
  leadTimeWeeks: number;
  qualityIndex: number;
  certifications: string[];
  bestFor: string;
  breakdown: {
    pcbBase: number; pcbLayers: number; pcbSurface: number;
    pcbVias: number; pcbHDI: number; pcbSetup: number; pcbCopper?: number;
    smtAssembly: number; thAssembly: number; aoi: number;
    logistics: number; importDuty: number;
  };
  panelInfo?: { boardsPerPanel: number; utilisation: number; panelW: number; panelH: number };
}

export interface VolumeCurvePoint {
  qty: number;
  totalPerBoard: number;
  pcbFabPerBoard: number;
  assemblyPerBoard: number;
  logisticsPerBoard: number;
}

export interface PCBComplexityScore {
  score: number;
  ipcClass: 1 | 2 | 3;
  label: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex' | 'Extreme';
  factors: { layers: number; viaDensity: number; bgaScore: number; hdiScore: number; traceScore: number };
}

export interface PCBImageAnalysis {
  partName: string;
  boardSpec: {
    estimatedLayers: number;
    widthMm: number;
    heightMm: number;
    surfaceFinish: string;
    solderMaskColour: string;
    silkscreenSides: number;
    throughVias: number;
    blindVias: number;
    buriedVias: number;
    microVias: number;
    bgaDetected: boolean;
    minTraceSpaceMm: number;
    technologyType: string;
    hdiStructure: string;
    impedanceControlRequired: boolean;
    copperWeightOz: number;
    qualityGrade: string;
    panelUtilisation: number;
    /** 'measured' = read from a label/sheet/ruler or typed by the user (kept exactly); 'estimated' = AI guess (stabilised). */
    dimensionsSource?: 'measured' | 'estimated';
    /** A conformal coat is present (costed only when true). */
    conformalCoating?: boolean;
    /** Per-layer copper, oz (from board data). */
    copperOzByLayer?: number[];
    /** Measured board weight, g. */
    boardWeightG?: number;
  };
  bom: PCBBOMItem[];
  assembly: {
    smtPlacements: number;
    throughHoleJoints: number;
    manualJoints: number;
    bgaCount: number;
    complexity: string;
    reflowSides: number;
    aoiRequired: boolean;
    ictTimeSec: number;
  };
  costEstimates: {
    pcbFabGBP: { min: number; mid: number; max: number };
    totalBOMCostGBP: number;
    smtAssemblyCostGBP: number;
  };
  aiInsights: string[];
  dfmIssues: string[];
  highCostComponents: string[];
  optimisationSuggestions: string[];
  confidenceLevel: 'High' | 'Medium' | 'Low';
  analysisLimitations: string[];
  stage1Classification?: { domain: string; conf: number; hints: string[] };
  ocrExtraction?: { icMarkings: string[]; extractionQuality: string };
  complexityScore?: PCBComplexityScore;
  // Country-aware cost data (added by server Stage 4)
  _selectedCountry?: string;
  _selectedCountryBreakdown?: PCBCountryBreakdown;
  _countryComparison?: PCBCountryBreakdown[];
  _volumeCurves?: Record<string, VolumeCurvePoint[]>;
  _originalAIValues?: PCBImageAnalysis;
  _isReanalyzed?: boolean;
  _costDeltas?: Record<string, number>;
  // Accuracy improvements
  _confidenceBand?: PCBConfidenceBand;
  _volumeMultiplier?: number;
  _npiBreakdown?: NPIBreakdown;
  _sanityWarnings?: SanityWarning[];
  _livePriceHits?: number;
  _previousVersion?: PCBImageAnalysis;  // for revision comparison
  // Automotive domain accuracy improvements
  _asilLevel?: string;
  _asilRationale?: string;
  _asilSafetyFunctions?: string[];
  _automotiveNRE?: AutomotiveNRE;
  _automotiveGradeEnforcedCount?: number;
  _singleSourceWarnings?: SingleSourceWarning[];
  _conformalCoatingCost?: number;
  _automotiveAssemblyCost?: AutomotiveAssemblyCost;
  _automotiveFabAdjustment?: AutomotiveFabAdjustment;
  _bomCompleteness?: BOMCompletenessResult;
  _programPricing?: ProgramPricingResult;
  /** Server returned the stored result for this exact photo+qty+country (repeatable). */
  fromCache?: boolean;
}

export interface AutomotiveNRE {
  ppapCost: number;
  fmeaCost: number;
  dvprCost: number;
  asilAuditCost: number;
  totalNRE: number;
  asilLevel: string;
}

export interface SingleSourceWarning {
  refDes: string;
  partDescription: string;
  vendor: string;
  premium: number;
  unitPriceGBP: number;
  premiumAmountGBP: number;
}

export interface AutomotiveAssemblyCost {
  baseAssemblyGBP: number;
  iatfPremiumGBP: number;
  axiCostGBP: number;
  serialisationGBP: number;
  ipcClass3GBP: number;
  burnInGBP: number;
  totalAutomotiveAssemblyGBP: number;
  standardAssemblyGBP: number;
  premiumPctOverStandard: number;
}

export interface AutomotiveFabAdjustment {
  standardFabGBP: number;
  iatfFabPremiumGBP: number;
  automotiveLaminatePremiumGBP: number;
  ipcClass3InspectionGBP: number;
  couponTestingGBP: number;
  totalAutomotiveFabGBP: number;
  premiumPctOverStandard: number;
}

export interface BOMCompletenessResult {
  identifiedLineCount: number;
  identifiedICCount: number;
  identifiedPassiveCount: number;
  estimatedMissingPassiveCount: number;
  estimatedMissingCostGBP: number;
  missingEstimateBreakdown: { decouplingCaps: number; pullResistors: number; ferriteBeads: number; esdArrays: number };
  completenessScore: number;
}

export interface ProgramPricingResult {
  spotBOMTotal: number;
  programBOMTotal: number;
  savingsGBP: number;
  savingsPct: number;
  annualProgramVolume: number;
  pricingTier: 'distributor_spot' | 'blanket_order' | 'direct_contract' | 'tier1_contract';
  multiplier: number;
}

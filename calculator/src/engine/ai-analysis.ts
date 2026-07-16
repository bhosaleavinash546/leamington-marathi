export interface CADGeometry {
  boundingBoxMm: { x: number; y: number; z: number };
  estimatedVolumeCm3: number;
  estimatedSurfaceAreaCm2: number;
  estimatedWeightKg: { aluminum: number; steel: number; plastic: number };
}

/** Raw output from the OCCT Python geometry engine — present only when the engine succeeded. */
export interface OCCTGeometry {
  status: 'success' | 'error';
  partName?: string;
  boundingBox?: { xMm: number; yMm: number; zMm: number };
  volume?: { mm3: number; cm3: number };
  surfaceArea?: { mm2: number; cm2: number };
  fillRatio?: number;
  wallThickness?: {
    minMm: number; maxMm: number; meanMm: number; stdDevMm: number;
    sampleCount: number; method: 'ray_cast' | 'formula'; uniformity: string;
  } | null;
  draftAnalysis?: {
    drawDirectionXYZ: [number, number, number];
    undercutFaceCount: number;
    zeroDraftFaceCount: number;
    adequateDraftFaceCount: number;
    minPositiveDraftDeg: number | null;
    maxPositiveDraftDeg: number | null;
    analyzedFaceCount: number;
  } | null;
  setupAnalysis?: {
    estimatedSetupCount: number;
    principalDirections: Array<{ directionLabel: string; faceCount: number }>;
  } | null;
  cncCycleTimeEstimate?: {
    setupTimeMins: number;
    planarMillingTimeMins: number;
    drillBoreTimeMins: number;
    estimatedTotalMins: number;
    estimatedTotalHrs: number;
    assumedFeedRateMm2PerMin: number;
    assumedDrillBoreMinPerFeature: number;
    assumedSetupTimeMinsPerSetup: number;
  } | null;
  weights?: {
    aluminiumKg: number; steelKg: number; plasticKg: number;
    castIronKg: number; copperKg: number; titaniumKg: number;
  };
  faces?: { total: number; byType: Record<string, number> };
  edges?: { total: number; byType: Record<string, number>; sampleCircleRadiiMm: number[] };
  features?: {
    cylindricalFaceCount: number;
    cylindricalFaceRadiiMm: number[];
    estimatedHoleCount: number;
    holeRadiiMm: number[];
    bossShaftRadiiMm: number[];
    threadFeaturesDetected: boolean;
    planarFaceCount: number;
    freeFormFaceCount: number;
  };
  /** Exact per-feature rows: hole/boss × Ø × depth × through, axis-deduped counts. */
  featureTable?: Array<{
    kind: 'hole' | 'boss' | 'face' | 'pocket' | 'slot';
    diaMm: number;
    depthMm: number;
    through: boolean | null;
    count: number;
    areaMm2?: number;
  }>;
  error?: string;
  toolingCostEstimates?: {
    hpdcDieCostGBP: number;
    gravityMouldCostGBP: number;
    sandPatternCostGBP: number;
    imMouldCostGBP: number;
    forgeDieCostGBP: number;
    progressiveDieCostGBP: number;
  };
  manufacturabilityScore?: number;
  processSpecificEstimates?: {
    sandCycleTimeHr: number;
    sandCycleTimeHrFerrous: number;
    forgeStrokes: number;
    investWaxCostGBP: number;
    investShellCostGBP: number;
  };
  assemblyWarning?: string | null;
  unitWarning?: string | null;
}

export interface DetectedFeature {
  type: string;
  description: string;
  count: number;
  significance: 'High' | 'Medium' | 'Low';
}

export interface ProcessRecommendation {
  process: string;
  commodityType: string;
  confidencePct: number;
  reasoning: string;
  estimatedCycleTimeHr: number;
}

export interface ManufacturabilityRisk {
  severity: 'High' | 'Medium' | 'Low';
  feature: string;
  description: string;
  suggestion: string;
}

export interface SuggestedOperation {
  name: string;
  machineId: string;
  cycleTimeHr: number;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
}

/** Per-field AI confidence score 0–1. Key = form field ID (e.g. "bm-wall", "imm-cav"). */
export type FieldConfidences = Record<string, number>;

/** Stage 1 fast commodity pre-selection (Haiku model output). */
export interface Stage1Selection {
  primary: string;
  conf: number;
  alt: Array<{ type: string; conf: number }>;
}

/** Cost range low/mid/high for a recommended process. */
export interface CostRange {
  low: number;
  mid: number;
  high: number;
  currency: string;
}

/** DFM (Design for Manufacture) issue raised by the specialist AI. */
export interface DFMIssue {
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  area: string;
  description: string;
  impact: string;
  fix: string;
}

export interface CADAnalysisResult {
  partName: string;
  geometry: CADGeometry;
  detectedFeatures: DetectedFeature[];
  materialAnalysis: {
    fromMetadata: boolean;
    primarySuggestion: { materialId: string; name: string; confidencePct: number; reasoning: string };
    alternatives: Array<{ materialId: string; name: string; confidencePct: number }>;
  };
  processRecommendations: ProcessRecommendation[];
  manufacturabilityScore: number;
  manufacturabilityRisks: ManufacturabilityRisk[];
  costInputSuggestions: {
    recommendedCommodity: string;
    netWeightKg: number;
    materialId: string;
    estimatedCycleTimeHr: number;
    estimatedSetupTimeHr: number;
    estimatedOperations: SuggestedOperation[];
    casting?: {
      subtype: 'hpdc' | 'sand' | 'gravity' | 'investment';
      dieMouldCostGBP: number;
      dieMouldLife: number;
      cavities: number;
      yieldFraction: number;
      cycleTimeHpdcSec: number;
      cycleTimeSandGravHr: number;
    };
    forging?: {
      flashKg: number;
      yieldFraction: number;
      dieCostGBP: number;
      dieLife: number;
      strokes: number;
      timePerBlowSec: number;
    };
    sheetMetal?: {
      thicknessMm: number;
      blankLengthMm: number;
      blankWidthMm: number;
      dieCostGBP: number;
      dieLife: number;
      numOps: number;
    };
    injectionMoulding?: {
      cavities: number;
      projectedAreaCm2: number;
      wallThicknessMm: number;
      mouldCostGBP: number;
      mouldLife: number;
      runnerWeightKg: number;
    };
    blowMoulding?: {
      /** 'ebm' | 'ibm' | 'sbm' */
      subtype: string;
      wallThicknessMm: number;
      flashWeightKg: number;
      cavities: number;
      mouldCostGBP: number;
      mouldLife: number;
      blowTimeSec: number;
      openCloseSec: number;
    };
    thermoforming?: {
      /** 'vacuum' | 'pressure' | 'twin_sheet' */
      method: string;
      sheetWeightKg: number;
      partWeightKg: number;
      toolCostGBP: number;
      heatTimeSec: number;
      formTimeSec: number;
      trimTimeSec: number;
    };
    rotationalMoulding?: {
      numArms: number;
      partsPerArm: number;
      heatTimeSec: number;
      coolTimeSec: number;
      mouldCostGBP: number;
      mouldLife: number;
    };
    rubber?: {
      /** 'compression' | 'transfer' | 'injection' | 'extrusion' | 'calendering' | 'die_cut' */
      process: string;
      flashWeightKg: number;
      cavities: number;
      cycleTimeSec: number;
      mouldCostGBP: number;
      mouldLife: number;
    };
    composites?: {
      /** 'hand_layup' | 'prepreg_autoclave' | 'rtm' | 'infusion' | 'smc' | 'wet_layup' */
      process: string;
      fibreFraction: number;
      wasteFraction: number;
      areaCm2: number;
      plies: number;
      toolCostGBP: number;
      toolLife: number;
      cureTimeSec: number;
    };
    fieldConfidences?: FieldConfidences;
    dfmIssues?: DFMIssue[];
    costRange?: CostRange;
    stage1Selection?: Stage1Selection;
  };
  aiExplanation: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  analysisLimitations: string[];
}

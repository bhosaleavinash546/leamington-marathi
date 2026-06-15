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
  estimatedWallThicknessMm?: number | null;
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
  error?: string;
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
  };
  aiExplanation: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  analysisLimitations: string[];
}

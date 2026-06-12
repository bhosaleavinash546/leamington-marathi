export interface CADGeometry {
  boundingBoxMm: { x: number; y: number; z: number };
  estimatedVolumeCm3: number;
  estimatedSurfaceAreaCm2: number;
  estimatedWeightKg: { aluminum: number; steel: number; plastic: number };
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

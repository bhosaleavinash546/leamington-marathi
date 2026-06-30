export interface FeatureMap {
  solidity: number;
  aspectRatio: number;
  maxDimMm: number;
  minDimMm: number;
  charThicknessMm: number;
  saToVolumeRatio: number;
  flatAreaFraction: number;
  curvedAreaFraction: number;
  dominantOrientations: number;
  prismatic: boolean;
  thinWalled: boolean;
  slender: boolean;
  chunky: boolean;
  hollow: boolean;
  highCurvature: boolean;
}
export interface ProcessGuess { process: string; confidence: 'high' | 'medium' | 'low'; rationale: string; }
export interface DfmaFinding { id: string; severity: 'high' | 'medium' | 'low'; finding: string; metric: string; }
export interface OrientationSummary { flatAreaFraction: number; curvedAreaFraction: number; dominantOrientations: number; }

export function summarizeOrientations(bucketAreas: number[], totalArea: number): OrientationSummary;
export function deriveFeatureMap(a: { volumeCm3?: number; surfaceAreaCm2?: number; bbox?: { x: number; y: number; z: number }; orientation?: OrientationSummary }): FeatureMap;
export function inferProcess(fm: FeatureMap): ProcessGuess[];
export function runDfmaRules(fm: FeatureMap, opts?: { toleranceText?: string }): DfmaFinding[];
export function analyzeFeatures(
  aggregates: { volumeCm3?: number; surfaceAreaCm2?: number; bbox?: { x: number; y: number; z: number }; bucketAreas?: number[]; totalArea?: number; orientation?: OrientationSummary },
  opts?: { toleranceText?: string }
): { featureMap: FeatureMap; processes: ProcessGuess[]; dfma: DfmaFinding[] };

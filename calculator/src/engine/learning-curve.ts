export interface LearningCurveParams {
  annualVolume: number;
  referenceVolume: number;
  /** Wright's Law curve percentage, e.g. 85 = 85% (labour cost drops 15% each doubling of cumulative volume) */
  curvePct: number;
}

export interface LearningCurveResult {
  baseLabourCost: number;
  adjustedLabourCost: number;
  adjustmentFactor: number;
  volumeEffect: number;
  params: LearningCurveParams;
}

/**
 * Wright's Law: every doubling of cumulative volume reduces unit labour cost by (1 - curvePct/100).
 * b = log(curvePct/100) / log(2); factor = (volume/referenceVolume)^b
 */
export function computeLearningCurveAdjustment(
  baseLabourCost: number,
  params: LearningCurveParams
): LearningCurveResult {
  const { annualVolume, referenceVolume, curvePct } = params;
  const curveFraction = Math.max(0.5, Math.min(1, curvePct / 100));
  const b = Math.log(curveFraction) / Math.log(2);
  const factor = referenceVolume > 0 ? Math.pow(annualVolume / referenceVolume, b) : 1;
  const adjustedLabourCost = baseLabourCost * factor;
  return {
    baseLabourCost,
    adjustedLabourCost,
    adjustmentFactor: factor,
    volumeEffect: adjustedLabourCost - baseLabourCost,
    params,
  };
}

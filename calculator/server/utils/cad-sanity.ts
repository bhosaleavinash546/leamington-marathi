/**
 * Deterministic sanity checks for CAD-to-Cost AI analyses.
 *
 * The OCCT / STL geometry engine gives us measured ground truth (volume,
 * bounding box, surface area). The AI's numeric claims are checked against it
 * and against physical plausibility bounds — hallucinated inputs get flagged
 * before they reach the costing form, mirroring the PCB pipeline's board
 * sanity checks. Pure function: no I/O, no AI.
 */

export interface CADSanityWarning {
  code: string;
  message: string;
  severity: 'warn' | 'error';
}

// g/cm³ — representative densities per family used by the weight cross-check.
const FAMILY_DENSITY: Record<string, number> = {
  aluminum: 2.70,
  steel: 7.85,
  plastic: 1.05,
};

interface GeoLike {
  volumeCm3?: number | null;
}

interface AnalysisLike {
  geometry?: {
    estimatedVolumeCm3?: number;
    estimatedWeightKg?: Record<string, number>;
  };
  materialAnalysis?: {
    primarySuggestion?: { name?: string; confidencePct?: number };
  };
  processRecommendations?: Array<{ process?: string; estimatedCycleTimeHr?: number; confidencePct?: number }>;
  manufacturabilityScore?: number;
  costInputSuggestions?: {
    costRange?: { low?: number; mid?: number; high?: number };
    materialUtilization?: number;
  };
}

export function runCADSanityChecks(
  analysis: AnalysisLike,
  measuredVolumeCm3: number | null,
): CADSanityWarning[] {
  const w: CADSanityWarning[] = [];
  const geoVol = analysis.geometry?.estimatedVolumeCm3;

  // 1. AI volume vs measured volume — the AI is told the measured value, so a
  //    big drift means it ignored the geometry it was given.
  if (measuredVolumeCm3 && measuredVolumeCm3 > 0 && typeof geoVol === 'number' && geoVol > 0) {
    const drift = Math.abs(geoVol - measuredVolumeCm3) / measuredVolumeCm3;
    if (drift > 0.25) {
      w.push({
        code: 'volume_drift',
        message: `AI volume ${geoVol.toFixed(1)} cm³ differs ${(drift * 100).toFixed(0)}% from measured ${measuredVolumeCm3.toFixed(1)} cm³ — geometry-derived inputs are preferred.`,
        severity: drift > 0.5 ? 'error' : 'warn',
      });
    }
  }

  // 2. Weight consistency: estimatedWeightKg per family should equal
  //    volume × family density within tolerance.
  const vol = measuredVolumeCm3 ?? geoVol ?? 0;
  const weights = analysis.geometry?.estimatedWeightKg ?? {};
  if (vol > 0) {
    for (const [family, density] of Object.entries(FAMILY_DENSITY)) {
      const aiKg = weights[family];
      if (typeof aiKg !== 'number' || aiKg <= 0) continue;
      const expectedKg = (vol * density) / 1000;
      const drift = Math.abs(aiKg - expectedKg) / expectedKg;
      if (drift > 0.20) {
        w.push({
          code: `weight_inconsistent_${family}`,
          message: `${family} weight ${aiKg.toFixed(3)} kg is ${(drift * 100).toFixed(0)}% off volume x density (${expectedKg.toFixed(3)} kg) — check before quoting.`,
          severity: drift > 0.5 ? 'error' : 'warn',
        });
      }
    }
  }

  // 3. Material confidence — below 50% the material pick is a coin toss;
  //    the UI should push for a part photo.
  const matConf = analysis.materialAnalysis?.primarySuggestion?.confidencePct;
  if (typeof matConf === 'number' && matConf < 50) {
    w.push({
      code: 'material_low_confidence',
      message: `Material suggestion is only ${matConf}% confident — add a part photo or confirm the material manually.`,
      severity: 'warn',
    });
  }

  // 4. Cycle-time plausibility — outside [0.0005h (1.8s), 24h] per operation
  //    is physically implausible for a single part.
  for (const p of analysis.processRecommendations ?? []) {
    const ct = p.estimatedCycleTimeHr;
    if (typeof ct !== 'number') continue;
    if (ct < 0.0005 || ct > 24) {
      w.push({
        code: 'cycle_time_implausible',
        message: `Cycle time ${ct} hr for "${p.process ?? 'process'}" is outside plausible bounds (1.8 s – 24 h).`,
        severity: 'error',
      });
    }
  }

  // 5. Cost range must be ordered low <= mid <= high.
  const cr = analysis.costInputSuggestions?.costRange;
  if (cr && typeof cr.low === 'number' && typeof cr.mid === 'number' && typeof cr.high === 'number') {
    if (!(cr.low <= cr.mid && cr.mid <= cr.high)) {
      w.push({
        code: 'cost_range_disordered',
        message: `AI cost range is not ordered (low ${cr.low}, mid ${cr.mid}, high ${cr.high}).`,
        severity: 'error',
      });
    }
  }

  // 6. Bounded scores and fractions.
  const score = analysis.manufacturabilityScore;
  if (typeof score === 'number' && (score < 0 || score > 100)) {
    w.push({ code: 'score_out_of_range', message: `Manufacturability score ${score} outside 0-100.`, severity: 'error' });
  }
  const util = analysis.costInputSuggestions?.materialUtilization;
  if (typeof util === 'number' && (util <= 0 || util > 1)) {
    w.push({ code: 'utilization_out_of_range', message: `Material utilisation ${util} outside (0, 1].`, severity: 'error' });
  }

  return w;
}

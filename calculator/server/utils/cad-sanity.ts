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

// Optional measured-geometry + selection context for the cross-commodity
// plausibility checks. Everything is optional so existing callers still work.
export interface CADGeometryContext {
  commodity?: string;
  fillRatio?: number | null;
  wallMeanMm?: number | null;
  maxDimMm?: number | null;
  materialName?: string;
}

// A single sealed cavity cannot come out of these bulk/solid metal processes,
// and a large thin-wall part misruns as a casting — used for the geometry↔
// process plausibility flag (a warning, not an override: an open thin-wall part
// could still be legitimate HPDC, so we surface it rather than force it).
const BULK_SOLID_METAL_PROCESSES = new Set([
  'casting', 'forging', 'cast_and_machine', 'machining', 'extrusion', 'biw_assembly',
]);
const PLASTIC_MOULDING_PROCESSES = new Set([
  'injection_moulding', 'blow_moulding', 'rotational_moulding', 'thermoforming',
]);
const THIN_WALL_PROCESSES = new Set([
  ...PLASTIC_MOULDING_PROCESSES, 'sheet_metal', 'sheet_metal_fab',
]);
const METAL_PROCESSES = new Set([
  'casting', 'forging', 'cast_and_machine', 'machining', 'extrusion',
  'sheet_metal', 'sheet_metal_fab', 'biw_assembly', 'stamping',
]);

function looksPlasticMaterial(name: string): boolean {
  return /plastic|polymer|resin|nylon|\bpa6|\bpa66|\babs\b|\bpp\b|\bpom\b|peek|hdpe|ldpe|polyeth|\bpvc\b|\bpet\b|petg|\btpe\b|\btpo\b|acrylic|pmma|polycarbon|\bpc\b|delrin|thermoplast/i.test(name);
}
function looksMetalMaterial(name: string): boolean {
  return /alumin|\bsteel\b|\biron\b|brass|bronze|copper|titanium|magnesium|\bzinc\b|lm25|a356|az91|stainless|\ben8\b|4140|1045|s355|casting alloy|die.?cast|ductile|gjl|gjs/i.test(name);
}

export function runCADSanityChecks(
  analysis: AnalysisLike,
  measuredVolumeCm3: number | null,
  context?: CADGeometryContext,
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

  // 7-9. Cross-commodity geometry↔process plausibility. These generalise the
  //      fuel-tank learning to EVERY commodity: where the measured geometry and
  //      the chosen process disagree we surface a flag, even in the cases we
  //      cannot safely auto-override (an open thin-wall part could be real HPDC).
  if (context?.commodity) {
    const c = context.commodity;
    const fill = context.fillRatio ?? null;
    const wall = context.wallMeanMm ?? null;
    const maxDim = context.maxDimMm ?? null;
    const matName = context.materialName ?? analysis.materialAnalysis?.primarySuggestion?.name ?? '';

    // 7. A bulk/solid-metal process on a thin-wall, low-fill part. A large
    //    thin-wall sand/gravity casting misruns, and a thin shell is rarely
    //    machined from solid — the failure mode behind the fuel-tank mis-cost.
    if (
      BULK_SOLID_METAL_PROCESSES.has(c) &&
      wall != null && wall > 0 && wall <= 4 &&
      fill != null && fill < 0.25 &&
      (maxDim == null || maxDim >= 200)
    ) {
      w.push({
        code: 'process_geometry_implausible',
        message: `A ${wall.toFixed(1)} mm wall at ${(fill * 100).toFixed(0)}% fill is unusual for "${c}" — a large thin-wall casting misruns and a thin shell is rarely machined from solid. Confirm HPDC, or an injection/blow-moulded or sheet-metal process.`,
        severity: 'warn',
      });
    }

    // 8. Material family vs process mismatch (either direction).
    if (matName) {
      if (PLASTIC_MOULDING_PROCESSES.has(c) && looksMetalMaterial(matName) && !looksPlasticMaterial(matName)) {
        w.push({
          code: 'material_process_mismatch',
          message: `Process "${c}" is a plastics process but the material reads as metal ("${matName}") — confirm the material family before quoting.`,
          severity: 'warn',
        });
      } else if (METAL_PROCESSES.has(c) && looksPlasticMaterial(matName) && !looksMetalMaterial(matName)) {
        w.push({
          code: 'material_process_mismatch',
          message: `Process "${c}" is a metal process but the material reads as plastic ("${matName}") — confirm the material family before quoting.`,
          severity: 'warn',
        });
      }
    }

    // 9. A near-solid part costed as a thin-wall/sheet process.
    if (THIN_WALL_PROCESSES.has(c) && fill != null && fill > 0.6) {
      w.push({
        code: 'process_geometry_implausible',
        message: `A near-solid part (${(fill * 100).toFixed(0)}% fill) is inconsistent with the thin-wall process "${c}" — this looks machined, cast or forged. Confirm the process.`,
        severity: 'warn',
      });
    }
  }

  return w;
}

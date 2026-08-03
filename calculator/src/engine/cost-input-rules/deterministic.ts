/**
 * A CAD analysis with no AI in it.
 *
 * Everything else in this directory produces cost-input *values*. This produces
 * the whole `CADAnalysisResult` the client already consumes — the same shape the
 * model returns, built from the measurement and the rules instead. That is the
 * point of the shape choice: `applyCADToForm` needs no branch for it.
 *
 * What is honestly missing, and stays missing rather than being invented:
 *
 *   - **The material**, whenever the rules could not settle it. `materialAnalysis`
 *     comes back empty and the decision says why. A geometry-only analysis that
 *     picked a metal would be doing exactly what the AI path was criticised for.
 *   - **Prose.** `aiExplanation` becomes a derivation — the rules' own `basis`
 *     strings, in order — which is more useful in a supplier meeting than a
 *     paragraph anyway, because every line of it is checkable.
 *   - **DFM issues.** The eight `analyse*DFM` functions exist and are not wired
 *     here yet; `dfmIssues` is empty and `analysisLimitations` says so rather
 *     than letting an empty list read as "no issues found".
 */
import type {
  CADAnalysisResult, CADGeometry, DetectedFeature, OCCTGeometry,
  ProcessRecommendation, SuggestedOperation,
} from '../ai-analysis.js';
import type { CommodityRuleSpec, CostInputRuleResult, RuleContext } from './types.js';
import { runCostInputRules } from './engine.js';
import { applyRuleDecisions, type ApplyResult } from './apply.js';

/** How significant a detected feature is, by how many of them there are. */
function significance(count: number): DetectedFeature['significance'] {
  return count >= 8 ? 'High' : count >= 3 ? 'Medium' : 'Low';
}

/** The measured geometry, in the shape the client's summary panel reads. */
function geometryOf(geo: OCCTGeometry): CADGeometry {
  const bb = geo.boundingBox;
  return {
    boundingBoxMm: { x: bb?.xMm ?? 0, y: bb?.yMm ?? 0, z: bb?.zMm ?? 0 },
    estimatedVolumeCm3: geo.volume?.cm3 ?? 0,
    estimatedSurfaceAreaCm2: geo.surfaceArea?.cm2 ?? 0,
    estimatedWeightKg: {
      aluminum: geo.weights?.aluminiumKg ?? 0,
      steel: geo.weights?.steelKg ?? 0,
      plastic: geo.weights?.plasticKg ?? 0,
    },
  };
}

/** The feature table, as detected features. Counts are exact, not estimated. */
function featuresOf(geo: OCCTGeometry): DetectedFeature[] {
  const rows = geo.featureTable ?? [];
  const out: DetectedFeature[] = rows.map(r => ({
    type: r.kind,
    description: `${r.count}× Ø${r.diaMm.toFixed(1)} × ${r.depthMm.toFixed(0)} mm`
      + (r.through === true ? ' through' : r.through === false ? ' blind' : ''),
    count: r.count,
    significance: significance(r.count),
  }));
  const bends = geo.sheetMetal?.bendCount ?? 0;
  if (bends > 0) {
    out.push({
      type: 'bend',
      description: `${bends} bend(s), ${(geo.sheetMetal?.totalBendLengthMm ?? 0).toFixed(0)} mm total length`,
      count: bends,
      significance: significance(bends),
    });
  }
  return out;
}

/**
 * Confidence, from the rules that actually filled something.
 *
 * An open decision caps it at Low however confident the derived values are —
 * a precisely-computed cost on an unknown material is not a confident estimate,
 * it is a confident-looking one.
 */
function confidenceOf(result: CostInputRuleResult): CADAnalysisResult['confidenceLevel'] {
  if (result.status === 'needs_decision') return 'Low';
  const cs = Object.values(result.fieldConfidences);
  if (cs.length === 0) return 'Low';
  const mean = cs.reduce((a, b) => a + b, 0) / cs.length;
  return mean >= 0.8 ? 'High' : mean >= 0.6 ? 'Medium' : 'Low';
}

/** The derivation, as prose: every filled field and the reasoning behind it. */
function derivationOf(result: CostInputRuleResult, commodity: string): string {
  const lines = Object.entries(result.provenance)
    .map(([fieldId, p]) => `  • ${p.ruleId} = ${String(p.value)} — ${p.basis} [${p.source}, ${fieldId}]`);
  const head = `Derived deterministically for ${commodity} from the measured geometry. `
    + `No AI call was made; every figure below is arithmetic on a measurement or a `
    + `library lookup, and each states its own basis.`;
  const open = result.decisions.length
    ? `\n\nStill open (${result.decisions.length}):\n`
      + result.decisions.map(d => `  • ${d.question} — ${d.why}`).join('\n')
    : '';
  return `${head}\n\n${lines.join('\n')}${open}`;
}

/** The route the rules chose, if any of them chose one. */
function processOf(
  result: CostInputRuleResult, commodity: string,
): ProcessRecommendation[] {
  const s = result.suggestions as Record<string, Record<string, unknown> | undefined>;
  const sub = Object.values(s).find(v => v && typeof v === 'object');
  const chosen = (sub?.process ?? sub?.subtype ?? sub?.dieType) as string | undefined;
  const cycleHr = Number(
    (s.machining?.estimatedCycleTimeHr as number | undefined) ?? 0);
  const basis = Object.values(result.provenance)
    .find(p => /\.(process|subtype|dieType)$/.test(p.ruleId))?.basis;
  return [{
    process: chosen ? String(chosen) : commodity,
    commodityType: commodity,
    // A rule is not a probability. 100 says "this is what the rules chose",
    // and the basis says why; the uncertainty lives in the open decisions.
    confidencePct: result.status === 'complete' ? 100 : 50,
    reasoning: basis ?? 'selected by the deterministic rules for this commodity',
    estimatedCycleTimeHr: cycleHr,
  }];
}

export interface DeterministicAnalysis {
  analysis: CADAnalysisResult;
  result: CostInputRuleResult;
  applied: ApplyResult;
}

/**
 * Build a complete analysis from geometry and rules alone.
 *
 * Returns the rule result alongside it so the route can surface the open
 * decisions and the write log without re-running anything.
 */
export function buildDeterministicAnalysis(
  spec: CommodityRuleSpec,
  ctx: RuleContext,
  partName: string,
): DeterministicAnalysis {
  const result = runCostInputRules(spec, ctx);
  const geo = ctx.geo;

  const analysis: CADAnalysisResult = {
    partName,
    geometry: geometryOf(geo),
    detectedFeatures: featuresOf(geo),
    materialAnalysis: {
      // Measured, not inferred: a filename or an engineer's answer is metadata,
      // a shape is not.
      fromMetadata: !!ctx.answers['material.family'],
      primarySuggestion: { materialId: '', name: '', confidencePct: 0, reasoning: '' },
      alternatives: [],
    },
    processRecommendations: processOf(result, ctx.commodity),
    // Hard-assigned from geometry rather than echoed back by a model.
    manufacturabilityScore: geo.manufacturabilityScore ?? 0,
    manufacturabilityRisks: [],
    costInputSuggestions: {
      recommendedCommodity: ctx.commodity,
      netWeightKg: 0,
      materialId: '',
      estimatedCycleTimeHr: 0,
      estimatedSetupTimeHr: 0,
      estimatedOperations: [] as SuggestedOperation[],
    },
    aiExplanation: derivationOf(result, ctx.commodity),
    confidenceLevel: confidenceOf(result),
    analysisLimitations: [
      ...result.decisions.map(d => `Unanswered: ${d.question}`),
      ...result.notes,
      'DFM issues are not analysed on the deterministic path — an empty list here '
        + 'means "not checked", not "nothing found".',
    ],
  };

  // The same writer the AI path uses, so there is one place that knows how a
  // rule value lands on `costInputSuggestions`.
  const applied = applyRuleDecisions(
    analysis as unknown as Parameters<typeof applyRuleDecisions>[0], result);

  if (applied.notWritten.length) {
    analysis.analysisLimitations.push(
      `Computed but not carried into the form: ${applied.notWritten.join(', ')}`);
  }
  return { analysis, result, applied };
}

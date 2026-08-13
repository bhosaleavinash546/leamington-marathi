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
 *   - **DFM issues** on the two commodities with no analyser in the tree
 *     (machining, composites). Everywhere else the measurement now feeds the
 *     advisor directly. Where no analyser exists, or where the checks it could
 *     run needed a drawing callout the kernel cannot read, `analysisLimitations`
 *     says so — an empty list must never read as a clean bill of health.
 */
import type {
  CADAnalysisResult, CADGeometry, DetectedFeature, OCCTGeometry,
  ProcessRecommendation, SuggestedOperation,
} from '../ai-analysis.js';
import type { CommodityRuleSpec, CostInputRuleResult, RuleContext } from './types.js';
import { runCostInputRules } from './engine.js';
import { applyRuleDecisions, toRuleFields, type ApplyResult, type RuleField } from './apply.js';
import { analyseDFMFromGeometry, DFM_ANALYSED_COMMODITIES } from './dfm.js';

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
    (s.machining?.estimatedCycleTimeHr as number | undefined)
    ?? (s.gear?.cycleTimeHr as number | undefined) ?? 0);
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
  /** Every rule value keyed by form field id — see `toRuleFields`. */
  ruleFields: Record<string, RuleField>;
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
    materialAnalysis: (() => {
      // Measured, not inferred: a filename or an engineer's answer is metadata,
      // a shape is not. But an ANSWERED material is the highest-trust source
      // this pipeline has — reporting it as 0% confident made the sanity layer
      // demand a photo for a material the engineer had just confirmed.
      const answered = ctx.answers['material.family'] ?? ctx.answers['gear.materialClass'];
      return {
        fromMetadata: !!answered,
        primarySuggestion: answered
          ? { materialId: '', name: String(answered).replace(/_/g, ' '), confidencePct: 100,
              reasoning: 'confirmed by the engineer — not inferred from the shape' }
          : { materialId: '', name: '', confidencePct: 0, reasoning: '' },
        alternatives: [],
      };
    })(),
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
      DFM_ANALYSED_COMMODITIES.has(ctx.commodity)
        ? 'DFM checks ran against the measured geometry. Checks that need a drawing '
          + 'callout — tolerances, which face is critical, whether a weld line is in a '
          + 'load path — did not run, so this list is a floor and not a ceiling.'
        : `No DFM analyser exists for ${ctx.commodity}; an empty issue list here means `
          + '"not checked", not "nothing found".',
    ],
  };

  // Run the advisor for the process the rules actually chose, so the checks are
  // against the route being costed rather than a default.
  const sub = Object.values(result.suggestions).find(v => v && typeof v === 'object') as Record<string, unknown> | undefined;
  const dfm = analyseDFMFromGeometry(ctx, {
    process: (sub?.subtype ?? sub?.process) as string | undefined,
    materialFamily: (ctx.answers['material.family'] ?? sub?.materialFamily) as string | undefined,
    materialId: sub?.materialId as string | undefined,
    compoundFamily: sub?.compoundFamily as string | undefined,
  });
  if (dfm.length) analysis.costInputSuggestions.dfmIssues = dfm;

  // The same writer the AI path uses, so there is one place that knows how a
  // rule value lands on `costInputSuggestions`.
  const applied = applyRuleDecisions(
    analysis as unknown as Parameters<typeof applyRuleDecisions>[0], result);

  if (applied.notWritten.length) {
    analysis.analysisLimitations.push(
      `Computed but not carried into the form: ${applied.notWritten.join(', ')}`);
  }
  return { analysis, result, applied, ruleFields: toRuleFields(result) };
}

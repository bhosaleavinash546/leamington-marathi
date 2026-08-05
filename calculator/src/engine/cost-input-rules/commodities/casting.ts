/**
 * Casting cost inputs, derived rather than guessed.
 *
 * Two things change here relative to the prompt these rules came from:
 *
 * 1. `adviseCastingProcess` gets its first production caller. It has been in the
 *    tree, unit-tested, with zero callers — a complete HPDC / gravity / sand /
 *    investment / megacasting selector that nothing ever asked. The prompt
 *    carried a one-line paraphrase of it instead.
 *
 * 2. The yield fraction comes from `CASTING_PROCESS_REFERENCE.yieldBand`, not
 *    from the prompt's constants. Those disagreed: the prompt said 0.90 for
 *    investment against a documented band midpoint of 0.45, and was ~20% out on
 *    sand and gravity. Yield divides into pour weight, so a too-high yield
 *    under-charges metal — investment castings were being costed at roughly half
 *    their true material. Only HPDC happened to agree.
 */
import {
  adviseCastingProcess, CASTING_PROCESS_REFERENCE,
  type CastingProcess, type ComplexityLevel,
} from '../../modules/casting-advisor.js';
import type { CastingSubtype } from '../../modules/casting.js';
import { answeredNumber, decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import {
  estimateHPDCDieCost, estimateGravityMouldCost, estimateSandPatternCost, estimateInvestmentToolCost,
} from '../../casting-tooling.js';
import { projectedAreaCm2 } from '../derive/envelope.js';
import { materialFacts, toCastingAlloyFamily } from '../derive/material.js';
import {
  pressureTightDecision, toleranceClassDecision, safetyCriticalDecision,
  answeredBool, answeredToleranceClass, assumedNote,
  PRESSURE_TIGHT_DECISION_ID, SAFETY_CRITICAL_DECISION_ID, TOLERANCE_CLASS_DECISION_ID,
} from '../derive/service-context.js';

/** Midpoint of a reference band — the honest single number to cost at. */
function bandMid(band: readonly [number, number]): number {
  return Math.round(((band[0] + band[1]) / 2) * 100) / 100;
}

/**
 * Geometric complexity, from what the kernel actually measured.
 *
 * Undercuts need slides, free-form faces need 5-axis or hand finishing, and many
 * distinct setup directions mean an awkward part. Deliberately coarse — the
 * advisor only consumes low/medium/high, so pretending to more precision would
 * be false confidence.
 */
export function complexityBand(ctx: RuleContext): ComplexityLevel {
  const g = ctx.geo;
  const undercuts = g.draftAnalysis?.undercutFaceCount ?? 0;
  const setups = g.setupAnalysis?.estimatedSetupCount ?? 0;
  const total = g.faces?.total ?? 0;
  const freeForm = total > 0 ? (g.features?.freeFormFaceCount ?? 0) / total : 0;

  let score = 0;
  if (undercuts >= 6) score += 2; else if (undercuts >= 2) score += 1;
  if (freeForm >= 0.25) score += 2; else if (freeForm >= 0.10) score += 1;
  if (setups >= 4) score += 1;

  return score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
}

/** The advisor's process, mapped onto the subtype the cost engine models. */
function toSubtype(p: CastingProcess): CastingSubtype {
  return p === 'megacasting' ? 'hpdc' : p;
}

interface Advice {
  process: CastingProcess;
  subtype: CastingSubtype;
  reason: string;
  route: string[];
}

/**
 * Run the advisor, or return the question that is blocking it.
 *
 * All four inputs it cannot get from geometry are asked once; every casting rule
 * then rests on the same answers, so the engineer is questioned once per part
 * rather than once per field.
 */
function advise(ctx: RuleContext): { advice: Advice } | { blocked: RuleOutcome<never> } {
  const mat = materialFacts(ctx);
  if (mat.decision) return { blocked: ask(mat.decision) };

  const alloy = toCastingAlloyFamily(mat.family!);
  if (!alloy) {
    return {
      blocked: ask({
        ...toleranceClassDecision(),
        id: 'casting.alloyUnsupported',
        kind: 'material_family',
        question: `${mat.family} cannot be cast — is the process right?`,
        why: `The chosen material family (${mat.family}) has no casting route.`,
        options: [{ value: 'recheck', label: 'Re-pick the material or the process' }],
      }),
    };
  }

  const pressureTight = answeredBool(ctx, PRESSURE_TIGHT_DECISION_ID);
  if (pressureTight === null) return { blocked: ask(pressureTightDecision(ctx)) };

  const toleranceClass = answeredToleranceClass(ctx);
  if (toleranceClass === null) return { blocked: ask(toleranceClassDecision()) };

  const safetyCritical = answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID);
  if (safetyCritical === null) return { blocked: ask(safetyCriticalDecision(ctx)) };

  const rec = adviseCastingProcess({
    annualVolume: ctx.annualVolume,
    partWeightKg: mat.massKg!,
    // The shell-wall trap: on a very sparse part the ray-cast minimum is
    // unreliable, so fall back to the surface-area estimate 2V/S.
    minWallThicknessMm: minWallMm(ctx),
    complexity: complexityBand(ctx),
    alloyFamily: alloy,
    pressureTight,
    toleranceClass,
    safetyCritical,
  });

  // Anything assumed rather than answered says so, once, on the reason every
  // other casting rule quotes.
  const assumed = [
    assumedNote(ctx, PRESSURE_TIGHT_DECISION_ID) && 'pressure-tight',
    assumedNote(ctx, TOLERANCE_CLASS_DECISION_ID) && 'tolerance class',
    assumedNote(ctx, SAFETY_CRITICAL_DECISION_ID) && 'safety-critical',
  ].filter(Boolean);

  return {
    advice: {
      process: rec.process,
      subtype: toSubtype(rec.process),
      reason: rec.reason
        + (assumed.length ? ` [${assumed.join(', ')} assumed — confirm before quoting]` : ''),
      route: rec.processRoute,
    },
  };
}

/** Minimum wall, guarding the known ray-cast artefact on sparse shells. */
export function minWallMm(ctx: RuleContext): number {
  const g = ctx.geo;
  const measured = g.wallThickness?.minMm;
  const v = g.volume?.mm3 ?? 0;
  const s = g.surfaceArea?.mm2 ?? 0;
  const shell = s > 0 ? (2 * v) / s : 0;
  if (!measured || measured <= 0) return shell > 0 ? Math.round(shell * 100) / 100 : 3;
  // A "minimum wall" thicker than the shell estimate on a sparse part is the
  // documented artefact (the 27 mm bumper). Trust the shell figure there.
  if ((g.fillRatio ?? 1) < 0.08 && shell > 0 && measured > shell * 3) {
    return Math.round(shell * 100) / 100;
  }
  return Math.round(measured * 100) / 100;
}

export const CASTING_RULES: CommodityRuleSpec = {
  commodity: 'casting',
  header: 'CASTING COST INPUT RULES:',
  rules: [
    {
      id: 'casting.subtype',
      path: 'casting.subtype',
      fieldId: 'cast-subtype',
      label: 'subtype',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('casting.subtype', r.advice.subtype, 'advisor',
          `${r.advice.process}: ${r.advice.reason}`, 0.85,
          [PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID]);
      },
    },
    {
      id: 'casting.yieldFraction',
      path: 'casting.yieldFraction',
      fieldId: 'cast-yield',
      label: 'yieldFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const ref = CASTING_PROCESS_REFERENCE[r.advice.process];
        const y = bandMid(ref.yieldBand);
        return decided('casting.yieldFraction', y, 'library',
          `${r.advice.process} yield band ${ref.yieldBand[0]}–${ref.yieldBand[1]}, midpoint`, 0.8);
      },
    },
    {
      id: 'casting.netWeightKg',
      path: 'casting.netWeightKg',
      fieldId: 'cast-part-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        return decided('casting.netWeightKg', mat.massKg!, 'geometry', mat.basis, 1);
      },
    },
    {
      id: 'casting.cycleTimeHpdcSec',
      path: 'casting.cycleTimeHpdcSec',
      fieldId: 'cast-hpdc-ct',
      label: 'cycleTimeHpdcSec',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype === 'hpdc';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const wall = ctx.geo.wallThickness?.meanMm;
        if (wall == null) {
          return decided('casting.cycleTimeHpdcSec', 75, 'rule',
            'no measured wall — HPDC band default', 0.3);
        }
        return decided('casting.cycleTimeHpdcSec', Math.round(45 + 3 * wall), 'rule',
          `45 + 3 × ${wall.toFixed(1)} mm mean wall`, 0.75);
      },
    },
    {
      id: 'casting.dieMouldCostGBP',
      path: 'casting.dieMouldCostGBP',
      fieldId: 'cast-hpdc-die-cost',
      label: 'dieMouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const tc = ctx.geo.toolingCostEstimates;
        const pick: Record<CastingSubtype, number | undefined> = {
          hpdc: tc?.hpdcDieCostGBP,
          gravity: tc?.gravityMouldCostGBP,
          sand: tc?.sandPatternCostGBP,
          // No OCCT parametric for investment tooling — a known gap. Ask rather
          // than fall back to the prompt's flat £12,000, which was a guess
          // wearing the costume of a constant.
          investment: undefined,
        };
        const quoted = answeredNumber(ctx.answers, 'casting.toolingCost');
        if (quoted != null && pick[r.advice.subtype] == null) {
          return decided('casting.dieMouldCostGBP', Math.round(quoted), 'engineer',
            `${r.advice.subtype} tooling quotation supplied by the engineer`, 0.95);
        }
        if (pick[r.advice.subtype] != null) {
          return decided('casting.dieMouldCostGBP', Math.round(pick[r.advice.subtype]!), 'geometry',
            `OCCT parametric ${r.advice.subtype} tooling estimate`, 0.7);
        }
        // Shop-model fallback (tooling deep-dive): the toolmaker build-up in
        // casting-tooling.ts prices the tool from the parting-plane footprint —
        // hours × toolroom rate + steel by the kilogram + bought-outs. This is
        // what closed the investment gap (a wax tool is an aluminium/P20 mould
        // at low pressure) and what answers the STL/manual paths that used to
        // have to ask for every routine die.
        const area = projectedAreaCm2(ctx);
        if (area != null && area > 0) {
          const est = r.advice.subtype === 'hpdc' ? estimateHPDCDieCost({ projectedAreaCm2: area })
            : r.advice.subtype === 'gravity' ? estimateGravityMouldCost({ projectedAreaCm2: area })
            : r.advice.subtype === 'sand' ? estimateSandPatternCost({ projectedAreaCm2: area })
            : estimateInvestmentToolCost({ projectedAreaCm2: area });
          return decided('casting.dieMouldCostGBP', est.total, 'advisor',
            `${r.advice.subtype} toolmaker shop model: ${est.detail.labourHours.toLocaleString()} toolroom hours `
            + `+ steel + bought-outs from a ${Math.round(area)} cm² parting footprint — a quotation overrides this`,
            0.6);
        }
        return ask({
          id: 'casting.toolingCost',
          kind: 'tolerance_class',
          question: `What does the ${r.advice.subtype} tooling cost?`,
          why: 'No measured footprint exists to drive the toolmaker shop model. '
            + 'A quotation is worth more than an invented band.',
          options: [{ value: 'quote', label: 'Toolmaker quotation' }],
          entry: { kind: 'number', unit: '£', placeholder: 'e.g. 14000' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
      },
    },
    {
      id: 'casting.dieMouldLife',
      path: 'casting.dieMouldLife',
      fieldId: 'cast-hpdc-die-life',
      label: 'dieMouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const life: Record<CastingSubtype, number> = {
          hpdc: 150_000, gravity: 50_000, sand: 8_000, investment: 5_000,
        };
        return decided('casting.dieMouldLife', life[r.advice.subtype], 'library',
          `${r.advice.subtype} tool life band`, 0.6);
      },
    },
    {
      id: 'casting.cavities',
      path: 'casting.cavities',
      fieldId: 'cast-hpdc-cav',
      label: 'cavities',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype === 'hpdc';
      },
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        const n = mat.massKg! > 1 ? 1 : 2;
        return decided('casting.cavities', n, 'rule',
          `${mat.massKg!.toFixed(2)} kg ${mat.massKg! > 1 ? '> 1 kg → single cavity' : '≤ 1 kg → 2 cavities'}`, 0.5);
      },
    },
    {
      id: 'casting.cycleTimeSandGravHr',
      path: 'casting.cycleTimeSandGravHr',
      fieldId: 'cast-sand-ct',
      label: 'cycleTimeSandGravHr',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype !== 'hpdc';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.subtype === 'sand') {
          const ps = ctx.geo.processSpecificEstimates?.sandCycleTimeHr;
          if (ps != null) {
            return decided('casting.cycleTimeSandGravHr', ps, 'geometry',
              'OCCT sand cycle estimate from part mass', 0.7);
          }
        }
        const band: Record<CastingSubtype, number> = {
          hpdc: 0.02, gravity: 0.08, sand: 0.5, investment: 0.40,
        };
        return decided('casting.cycleTimeSandGravHr', band[r.advice.subtype], 'library',
          `${r.advice.subtype} cycle band`, 0.4);
      },
    },
  ],
};

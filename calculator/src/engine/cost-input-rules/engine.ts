/**
 * The rule runner and the prompt renderer — two consumers of one rule array.
 *
 * `runCostInputRules` produces values. `renderCommodityRulesPrompt` produces the
 * text the specialist prompt shows the model. Both walk the same `RuleDef[]` and
 * call the same `evaluate()`, so the prompt cannot state a number the engine
 * would not compute. That is the whole point: the rules used to live only in a
 * prompt string, where nothing stopped them drifting from the code.
 */
import type {
  CommodityRuleSpec, CostInputRuleResult, Decided, Decision, RuleContext, RuleDef, RuleOutcome,
} from './types.js';
import { RULE_ENGINE_VERSION } from './types.js';

/** Write `value` into `obj` at a dot path, creating intermediate objects. */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function applicable(rules: RuleDef[], ctx: RuleContext): RuleDef[] {
  return rules.filter(r => (r.appliesWhen ? r.appliesWhen(ctx) : true));
}

/**
 * Evaluate every applicable rule for a commodity.
 *
 * Rules that do not depend on an open decision are still evaluated, so a blocked
 * run yields a mostly-filled form with the missing fields named — not an empty
 * one. Pure: same (geometry, context, answers) always gives the same result,
 * which is what lets the analysis cache stay honest.
 */
export function runCostInputRules(
  spec: CommodityRuleSpec,
  ctx: RuleContext,
): CostInputRuleResult {
  const suggestions: Record<string, unknown> = {};
  const provenance: Record<string, Decided<unknown>> = {};
  const fieldConfidences: Record<string, number> = {};
  const decisionsById = new Map<string, Decision>();
  const notes: string[] = [];

  for (const rule of applicable(spec.rules, ctx)) {
    let outcome: RuleOutcome<unknown>;
    try {
      outcome = rule.evaluate(ctx);
    } catch (e) {
      // A throwing rule must not take the whole costing down — record it and
      // leave the field empty, which the caller surfaces as "not filled".
      notes.push(`${rule.id}: rule threw (${(e as Error).message}) — field left empty`);
      continue;
    }

    if (outcome.ok) {
      setPath(suggestions, rule.path, outcome.decided.value);
      if (rule.fieldId) {
        provenance[rule.fieldId] = outcome.decided;
        fieldConfidences[rule.fieldId] = outcome.decided.confidence;
      }
    } else {
      // De-duplicate: one question, however many rules it blocks.
      const existing = decisionsById.get(outcome.decision.id);
      if (existing) {
        existing.blockedRuleIds = [...new Set([...existing.blockedRuleIds, rule.id])];
        if (rule.fieldId) {
          existing.blockedFieldIds = [...new Set([...existing.blockedFieldIds, rule.fieldId])];
        }
      } else {
        const d = { ...outcome.decision };
        d.blockedRuleIds = [...new Set([...d.blockedRuleIds, rule.id])];
        if (rule.fieldId) d.blockedFieldIds = [...new Set([...d.blockedFieldIds, rule.fieldId])];
        decisionsById.set(d.id, d);
      }
    }
  }

  const decisions = [...decisionsById.values()];
  const blocking = decisions.filter(d => d.severity === 'blocking');

  return {
    status: blocking.length ? 'needs_decision' : 'complete',
    commodity: {
      value: spec.commodity, confidence: 1, source: 'rule',
      ruleId: 'commodity', basis: `commodity = ${spec.commodity}`,
    },
    suggestions,
    provenance,
    fieldConfidences,
    decisions,
    answers: { ...ctx.answers },
    notes,
    engineVersion: RULE_ENGINE_VERSION,
  };
}

/**
 * Render the rules as the prompt block the model sees.
 *
 * Default line for a decided value prints the value the engine computed, so the
 * two can never disagree. An undecided value says so explicitly rather than
 * silently omitting the field — otherwise the model fills the gap with a guess,
 * which is precisely the behaviour we are removing.
 */
export function renderCommodityRulesPrompt(
  spec: CommodityRuleSpec,
  ctx: RuleContext,
): string {
  const lines: string[] = [spec.header];
  const body: string[] = [];
  let anyUndecided = false;

  for (const rule of applicable(spec.rules, ctx)) {
    let outcome: RuleOutcome<string | number | boolean>;
    try {
      outcome = rule.evaluate(ctx);
    } catch {
      continue;
    }

    if (rule.promptLine) {
      body.push(rule.promptLine(outcome, ctx));
      continue;
    }

    if (outcome.ok) {
      const { value, basis } = outcome.decided;
      body.push(`  ${rule.label}=${String(value)}  [${basis} — deterministic, use verbatim]`);
    } else {
      anyUndecided = true;
      const opts = outcome.decision.options.map(o => o.label).join(' | ');
      body.push(`  ${rule.label}: UNDECIDED — needs "${outcome.decision.question}" (${opts})`);
    }
  }

  // Say what the two kinds of line mean. Without this the model has no way to
  // know that half the block is already settled and the other half is the only
  // part it is actually being asked for — and a computed value it "improves"
  // is discarded anyway, which is a waste of everyone's tokens.
  lines.push('  Lines marked deterministic are computed from the measured geometry and will'
    + ' REPLACE whatever you return for them — restate them, do not re-derive them.');
  if (anyUndecided) {
    lines.push('  Lines marked UNDECIDED are yours to answer: nothing in the geometry settles'
      + ' them. Answer from the drawing, the photo or the part name, and say which you used.');
  }

  return [...lines, ...body].join('\n');
}

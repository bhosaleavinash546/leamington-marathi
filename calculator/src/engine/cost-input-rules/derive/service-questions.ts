/**
 * Safety-critical and leak-tight on the routes that do not price them (report standard review, 3 Nov 2026,
 * docs/review/report-standard-2026-11/quality.md rows 27–29).
 *
 * Casting, cast + machine and forging ask both questions and charge what the answer buys (NDT, a ductile grade,
 * impregnation, a leak test). Every other route asked neither, so a seat-anchorage bracket, a battery side rail, a
 * transmission gear and a hydraulic manifold were costed without the question being put — and nothing on the report
 * said that a safety designation or a leak spec was missing from the price.
 *
 * Here they are ADVISORY: the costing proceeds, the answer is recorded (and travels to the route comparison), and a
 * "Yes" this route charges nothing for is stated as NOT COSTED on the rule's basis and listed by `serviceNotCosted`,
 * which a report reads for its "Not included" list. No check is invented as a cost. Where a route does price the
 * answer (the extrusion line's pressure test), the rule that prices it reads the same answer.
 */
import { decided, ask, type Decision, type RuleContext, type RuleDef } from '../types.js';
import {
  PRESSURE_TIGHT_DECISION_ID, SAFETY_CRITICAL_DECISION_ID, pressureTightDecision, safetyCriticalDecision,
} from './service-context.js';
import { materialFacts } from './material.js';

/** The answer given, or null — never the leaning (these questions do not block, so nothing is assumed). */
function answered(ctx: RuleContext, id: string): boolean | null {
  const v = ctx.answers[id];
  if (v === 'yes' || v === true) return true;
  if (v === 'no' || v === false) return false;
  return null;
}

/** The same question, advisory on a route that does not block on it. */
function advisory(d: Decision): Decision {
  return { ...d, severity: 'advisory', blockedFieldIds: [], blockedRuleIds: [] };
}

/** Routes that ask the safety question here (casting, cast + machine and forging ask their own, blocking). */
export const ADVISORY_SAFETY_ROUTES = ['machining', 'sheet_metal', 'sheet_metal_fab', 'aluminium_extrusion', 'gear'] as const;
/** Routes that ask the leak-tight question here (casting and cast + machine ask their own, blocking). */
export const ADVISORY_PRESSURE_ROUTES = ['machining', 'rotational_moulding', 'blow_moulding', 'extrusion'] as const;

/** One item an answer calls for that the route's costing does not carry. */
export interface ServiceNotCosted {
  /** The decision that raised it. */
  decisionId: string;
  /** What is missing from the price. */
  item: string;
  /** Why it is listed. */
  reason: string;
}

/**
 * What the service answers call for that this route does NOT price — the report's "Not included" lines. Empty when
 * nothing was answered "Yes", or when the route prices the answer itself.
 */
export function serviceNotCosted(
  commodity: string, answers: Readonly<Record<string, unknown>>,
  /** A casting that is not a light alloy (iron, steel, copper, nickel): impregnation is asked, not assumed. */
  opts: { heavyAlloyCasting?: boolean } = {},
): ServiceNotCosted[] {
  const ctx = { answers } as RuleContext;
  const out: ServiceNotCosted[] = [];
  if (answered(ctx, SAFETY_CRITICAL_DECISION_ID) === true && (ADVISORY_SAFETY_ROUTES as readonly string[]).includes(commodity)) {
    out.push({
      decisionId: SAFETY_CRITICAL_DECISION_ID,
      item: 'Special-characteristic controls for a safety-critical part (100 % checks of the SC / CC characteristics, '
        + 'traceability marking, the PPAP level they call for)',
      reason: 'answered safety-critical; this route charges no check for it — not costed',
    });
  }
  if (answered(ctx, PRESSURE_TIGHT_DECISION_ID) === true) {
    if (commodity === 'machining') {
      out.push({
        decisionId: PRESSURE_TIGHT_DECISION_ID,
        item: 'Leak / pressure test, cross-hole deburr, gallery plugs and a cleanliness wash',
        reason: 'answered leak-tight; the machining route charges none of them — not costed',
      });
    } else if (commodity === 'rotational_moulding' || commodity === 'blow_moulding') {
      out.push({
        decisionId: PRESSURE_TIGHT_DECISION_ID,
        item: 'Leak test (100 % pressure decay) and any port machining or inserts',
        reason: 'answered leak-tight; this route charges no leak test — not costed',
      });
    } else if ((commodity === 'casting' || commodity === 'cast_and_machine') && opts.heavyAlloyCasting
      && answers[IMPREGNATION_DECISION_ID] === undefined) {
      out.push({
        decisionId: IMPREGNATION_DECISION_ID,
        item: 'Vacuum impregnation (porosity sealing) of a leak-tight iron, steel or copper-alloy casting',
        reason: 'specified case by case on ferrous castings; not costed until "Is impregnation specified?" is answered',
      });
    }
  }
  return out;
}

/** Asked on a leak-tight iron or steel casting: impregnation is a drawing call there, not a default. */
export const IMPREGNATION_DECISION_ID = 'service.impregnation';

export function impregnationDecision(): Decision {
  return {
    id: IMPREGNATION_DECISION_ID,
    kind: 'process_choice',
    question: 'Is vacuum impregnation specified for this leak-tight casting?',
    why: 'Light-alloy castings that must hold pressure are impregnated as a rule. On an iron, steel or copper-alloy casting '
      + 'porosity sealing is specified case by case (pump, valve and compressor bodies often are). Unanswered, it is not '
      + 'costed and is listed as not included.',
    options: [
      { value: 'yes', label: 'Yes — impregnate', consequence: 'vacuum resin impregnation, priced at the casting route\'s impregnation rate' },
      { value: 'no', label: 'No', consequence: 'no impregnation', costed: true },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'advisory',
  };
}

/**
 * The advisory question rules for one commodity pack (`ns` is the pack's path namespace). Each decides "yes" / "no"
 * once answered — with a NOT COSTED note on a "Yes" this route charges nothing for — and asks, advisory, until then.
 */
export function serviceQuestionRules(ns: string, which: { safety?: boolean; pressure?: boolean }): RuleDef[] {
  const out: RuleDef[] = [];
  if (which.safety) {
    out.push({
      id: `${ns}.q.safetyCritical`, path: `${ns}.q.safetyCritical`, label: 'safety-critical question',
      evaluate: (ctx) => {
        const a = answered(ctx, SAFETY_CRITICAL_DECISION_ID);
        // Asked after the route and the material, as the finish is: it waits quietly while they are open.
        if (a === null && materialFacts(ctx).decision) return decided(`${ns}.q.safetyCritical`, 'pending', 'rule', 'pending the material answer', 0.1);
        if (a === null) return ask(advisory(safetyCriticalDecision(ctx)));
        const nc = serviceNotCosted(ctx.commodity, ctx.answers).find(x => x.decisionId === SAFETY_CRITICAL_DECISION_ID);
        return decided(`${ns}.q.safetyCritical`, a ? 'yes' : 'no', 'engineer',
          a ? `answered safety-critical — NOT COSTED: ${nc ? nc.item.charAt(0).toLowerCase() + nc.item.slice(1) : 'special-characteristic controls'}; this route charges no check for it`
            : 'answered: not safety-critical', 1, [SAFETY_CRITICAL_DECISION_ID]);
      },
    });
  }
  if (which.pressure) {
    out.push({
      id: `${ns}.q.pressureTight`, path: `${ns}.q.pressureTight`, label: 'leak-tight question',
      evaluate: (ctx) => {
        const a = answered(ctx, PRESSURE_TIGHT_DECISION_ID);
        if (a === null && materialFacts(ctx).decision) return decided(`${ns}.q.pressureTight`, 'pending', 'rule', 'pending the material answer', 0.1);
        if (a === null) return ask(advisory(pressureTightDecision(ctx)));
        const nc = serviceNotCosted(ctx.commodity, ctx.answers).find(x => x.decisionId === PRESSURE_TIGHT_DECISION_ID);
        return decided(`${ns}.q.pressureTight`, a ? 'yes' : 'no', 'engineer',
          !a ? 'answered: not leak-tight'
            : nc ? `answered leak-tight — NOT COSTED: ${nc.item.charAt(0).toLowerCase() + nc.item.slice(1)}`
              : 'answered leak-tight — the route\'s own test is costed', 1, [PRESSURE_TIGHT_DECISION_ID]);
      },
    });
  }
  return out;
}

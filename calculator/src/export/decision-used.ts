/**
 * What the costing USED for an unanswered advisory question — "not answered — costed as …" — read off what the costing
 * holds, never guessed (report standard round, Nov 2026: an unanswered advisory printed "the rules' value (see the
 * basis)", which tells a buyer nothing).
 *
 * ONE function, called where the decisions are assembled (main.ts `buildChecksApplied`, so the audit pack, the executive
 * page and the core report all print the same words) and by the core report for a caller that did not set `used`
 * (a headless harness). In order:
 *   1. the value the caller already set (`used`);
 *   2. the option the rules mark as the one costed until answered (`costed: true` — the finish's "None — bare part",
 *      the costed grade, impregnation "No");
 *   3. what the costing's own operations show (coating, leak test, NDT present or not);
 *   4. the rule value the question governs (the al-extrusion route / temper / finish / bends, the gear's hardening);
 *   5. a stated assumption the rules make in code (tolerance class: 'standard', `TOLERANCE_CLASS_ASSUMED`).
 * Anything else stays null and the report says the rules' value is in the basis.
 */
import { shortOperationName } from '../engine/operation-names.js';
import { reportNoteText } from './money-text.js';
import { TOLERANCE_CLASS_DECISION_ID, TOLERANCE_CLASS_ASSUMED } from '../engine/cost-input-rules/derive/service-context.js';

export interface DecisionForUsed {
  id: string;
  used?: string | null;
  options?: ReadonlyArray<{ value: string; label: string; costed?: boolean; leaning?: boolean }>;
}

export interface DecisionUsedFacts {
  /** The costing's operation names and consumable / tooling labels — what it actually charges. */
  costedItems: readonly string[];
  /** The rule values on the form: field id, the value applied, its basis. */
  ruleValues: ReadonlyArray<{ fieldId?: string; value: string; basis?: string }>;
}

/** The form field that holds the value each advisory question governs (the rule writes it; the costing reads it). */
const GOVERNED_FIELD: Record<string, RegExp> = {
  'al.route': /^alx-route$/, 'al.temper': /^alx-temper$/, 'al.finish': /^alx-finish$/, 'al.bends': /^alx-bends$/,
  'gear.hardeningRoute': /^gear-caseh$/,
};

export function decisionUsedValue(d: DecisionForUsed, f: DecisionUsedFacts): string | null {
  if (d.used) return d.used;
  const costedOpt = d.options?.find(o => o.costed);
  if (costedOpt) return costedOpt.label;
  const find = (re: RegExp) => f.costedItems.find(t => re.test(t));
  const head = (s: string) => reportNoteText(s.split(/ — |; /)[0]).trim();
  switch (d.id) {
    case 'service.finish': {
      const x = find(/coat|paint|powder|anodis|plat|e-?coat|galvan|phosphat|zinc/i);
      return x ? `${shortOperationName(x)} (in the price)` : 'a bare part (no coating or surface treatment in the price)';
    }
    case 'service.pressureTight': {
      const x = find(/leak|pressure test|pressure-decay|impregnat/i);
      return x ? `${shortOperationName(x)} (in the price)` : 'not leak-tight (no leak or pressure test in the price)';
    }
    case 'service.safetyCritical': {
      const x = find(/\bndt\b|\bmpi\b|magnetic|x-?ray|crack/i);
      return x ? `not safety-critical; ${shortOperationName(x)} is in the price` : 'not safety-critical (no special-characteristic checks in the price)';
    }
    case TOLERANCE_CLASS_DECISION_ID: {
      // The rules' stated assumption when the class is not answered (service-context.ts answeredToleranceClass).
      const label = d.options?.find(o => o.value === TOLERANCE_CLASS_ASSUMED)?.label ?? TOLERANCE_CLASS_ASSUMED;
      return `${label} (the rules' stated assumption)`;
    }
    default: {
      const re = GOVERNED_FIELD[d.id];
      const r = re ? f.ruleValues.find(x => re.test(x.fieldId ?? '')) : undefined;
      return r ? (r.basis ? head(r.basis) : String(r.value)) : null;
    }
  }
}

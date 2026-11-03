/**
 * How a rule's form field is printed in the reports' "values the rules set" table: the value the costing APPLIED, the
 * rule's own value, and whether the engineer changed it.
 *
 * Report standard review (3 Nov 2026): a checkbox's `value` is the literal "on" whether it is ticked or not, so every
 * boolean rule printed "on (edited; rule false)" — the vent pipe "claimed" a pressure test and the thermoformer a rotary
 * former that neither costing carried. A checkbox is read by its ticked state; a boolean rule on a yes / no drop-down
 * (gear "Case hardened") is compared as a boolean, not as the text "true" against "yes".
 *
 * Pure: the screen reads the DOM into a `RuleFieldReading` and calls this.
 */

export interface RuleFieldReading {
  kind: 'checkbox' | 'select' | 'input';
  /** The element's `value` (a checkbox's is meaningless — "on"). */
  value: string;
  /** A checkbox's ticked state. */
  checked?: boolean;
  /** A select's options. */
  options?: Array<{ value: string; text: string }>;
  /** A select's selected option text. */
  selectedText?: string;
}

export interface RuleFieldReport {
  /** What the costing applied, as the report prints it. */
  shown: string;
  /** The rule's own value, printed the same way. */
  ruleShown: string;
  /** The applied value differs from the rule's. */
  edited: boolean;
}

/** A yes / no reading of a form value; null when it is not a boolean word. */
function boolOf(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'on' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === 'off' || s === '0' || s === '') return false;
  return null;
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

export function ruleFieldReport(field: RuleFieldReading, ruleValue: string | number | boolean): RuleFieldReport {
  if (field.kind === 'checkbox') {
    const applied = !!field.checked;
    const rule = typeof ruleValue === 'boolean' ? ruleValue : boolOf(String(ruleValue)) ?? false;
    return { shown: yesNo(applied), ruleShown: yesNo(rule), edited: applied !== rule };
  }
  if (field.kind === 'select') {
    const shown = field.selectedText ?? field.value;
    const opts = field.options ?? [];
    if (typeof ruleValue === 'boolean') {
      const applied = boolOf(field.value);
      const ruleOpt = opts.find(o => boolOf(o.value) === ruleValue);
      return {
        shown,
        ruleShown: ruleOpt?.text ?? yesNo(ruleValue),
        edited: applied === null ? field.value !== String(ruleValue) : applied !== ruleValue,
      };
    }
    return {
      shown,
      ruleShown: opts.find(o => o.value === String(ruleValue))?.text ?? String(ruleValue),
      edited: field.value !== String(ruleValue),
    };
  }
  // A number is compared at the precision the form shows it (setNumericField rounds).
  const dp = (field.value.split('.')[1] ?? '').length;
  const edited = field.value !== String(ruleValue)
    && !(typeof ruleValue === 'number' && field.value !== '' && Number(ruleValue).toFixed(dp) === Number(field.value).toFixed(dp));
  return { shown: field.value, ruleShown: String(ruleValue), edited };
}

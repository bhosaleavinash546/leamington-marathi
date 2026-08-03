/**
 * Rules against the model, field by field.
 *
 * The comparison this does NOT make is the one worth naming first. "Do the
 * rules agree with the AI?" is a meaningless bar — the AI is the thing being
 * replaced, and on four of the six parts in docs/cad-to-cost-learnings.md it
 * was 2–5x wrong, every time on a material class it had guessed. Agreement with
 * it would be a warning sign, not a pass.
 *
 * What this produces is a list of *disagreements* with the size of each, so
 * every one can be argued against the geometry on its own merits. That is the
 * evidence for flipping the default: not "they match" but "here is where they
 * differ, and here is why the rule is right in each case".
 */
import type { CostInputRuleResult } from './types.js';

export interface FieldDiff {
  /** Dot path within `costInputSuggestions`. */
  field: string;
  ruleValue: unknown;
  aiValue: unknown;
  /** Signed relative difference, rule vs AI. Null for non-numeric fields. */
  deltaPct: number | null;
  /** How the rule got its answer. */
  basis: string;
  verdict: 'agree' | 'differ' | 'ai-only' | 'rule-only';
}

export interface AnalysisDiff {
  diffs: FieldDiff[];
  agreed: number;
  differed: number;
  /** Fields only one side produced at all. */
  ruleOnly: number;
  aiOnly: number;
  /** Questions the rules refused to answer; the AI answered them regardless. */
  undecided: string[];
}

function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else if (!Array.isArray(v)) out[key] = v;
  }
  return out;
}

/**
 * A tolerance, not an equality.
 *
 * Both sides round differently — the rules to a stated precision, the model to
 * whatever it felt like — so an exact comparison would report noise as
 * disagreement and bury the real gaps. 1% is well inside any rounding and well
 * outside anything that matters to a cost.
 */
const AGREE_TOLERANCE = 0.01;

export function diffAnalyses(
  ruleSuggestions: Record<string, unknown>,
  aiSuggestions: Record<string, unknown>,
  result: CostInputRuleResult,
): AnalysisDiff {
  const rules = flatten(ruleSuggestions);
  const ai = flatten(aiSuggestions);
  const keys = [...new Set([...Object.keys(rules), ...Object.keys(ai)])].sort();

  const diffs: FieldDiff[] = [];
  for (const field of keys) {
    const ruleValue = rules[field];
    const aiValue = ai[field];
    const basis = result.byRule[field]?.basis ?? '';

    if (ruleValue === undefined) { diffs.push({ field, ruleValue, aiValue, deltaPct: null, basis, verdict: 'ai-only' }); continue; }
    if (aiValue === undefined) { diffs.push({ field, ruleValue, aiValue, deltaPct: null, basis, verdict: 'rule-only' }); continue; }

    if (typeof ruleValue === 'number' && typeof aiValue === 'number') {
      const deltaPct = aiValue === 0
        ? (ruleValue === 0 ? 0 : Infinity)
        : (ruleValue - aiValue) / Math.abs(aiValue);
      diffs.push({
        field, ruleValue, aiValue, deltaPct, basis,
        verdict: Math.abs(deltaPct) <= AGREE_TOLERANCE ? 'agree' : 'differ',
      });
      continue;
    }
    diffs.push({
      field, ruleValue, aiValue, deltaPct: null, basis,
      verdict: String(ruleValue) === String(aiValue) ? 'agree' : 'differ',
    });
  }

  return {
    diffs,
    agreed: diffs.filter(d => d.verdict === 'agree').length,
    differed: diffs.filter(d => d.verdict === 'differ').length,
    ruleOnly: diffs.filter(d => d.verdict === 'rule-only').length,
    aiOnly: diffs.filter(d => d.verdict === 'ai-only').length,
    undecided: result.decisions.map(d => d.id),
  };
}

/** The diff as a fixed-width table, for a terminal or a log. */
export function formatDiff(d: AnalysisDiff): string {
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  const val = (v: unknown) =>
    typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : v === undefined ? '—' : String(v);

  const rows = d.diffs
    .filter(x => x.verdict !== 'agree')
    .map(x => `  ${pad(x.field, 34)} ${pad(val(x.ruleValue), 13)} ${pad(val(x.aiValue), 13)} `
      + `${pad(x.deltaPct === null ? '' : `${(x.deltaPct * 100).toFixed(1)}%`, 9)} ${x.basis.slice(0, 52)}`);

  return [
    `  ${pad('FIELD', 34)} ${pad('RULE', 13)} ${pad('AI', 13)} ${pad('Δ', 9)} BASIS`,
    ...rows,
    '',
    `  ${d.agreed} agree · ${d.differed} differ · ${d.ruleOnly} rule-only · ${d.aiOnly} AI-only`
    + (d.undecided.length ? ` · ${d.undecided.length} the rules refused to answer` : ''),
  ].join('\n');
}

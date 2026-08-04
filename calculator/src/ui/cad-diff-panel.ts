/**
 * The rules against the model, on screen.
 *
 * `mode: 'both'` has been computing a field-by-field comparison since Stage 8
 * and returning it in the response, where nothing read it. The select says
 * "Compare — rules vs AI" and the engineer got back a normal analysis. This is
 * the missing half.
 *
 * ## Why it leads with disagreement
 *
 * The comparison this panel does NOT make is the one worth naming first. "Do
 * the rules agree with the AI?" is a meaningless bar — the AI is the thing
 * being replaced, and on four of the six parts in `docs/cad-to-cost-learnings.md`
 * it was 2–5× wrong, every time on a material class it had guessed. Agreement
 * with it would be a warning sign, not a pass.
 *
 * So the agreements fold away and the disagreements lead, each carrying the
 * rule's own `basis` line, because a gap is only useful if you can argue it
 * against the geometry. "netWeightKg: rule 4.5, AI 13.5, −67%" is an alarm;
 * "…because 1667 cm³ × 0.0027 kg/cm³ (PP, from the filename)" is an argument.
 *
 * ## Why it is a separate module
 *
 * vitest runs `environment: 'node'` with no jsdom, so anything that touches
 * `document` cannot be tested, and anything living inside `main.ts` drags a
 * 19k-line browser monolith into the test run. A pure string builder is
 * testable; the inline-IIFE style the older CAD panels use is not.
 */
import { escHtml } from './toast.js';

/** One field, as both sides answered it. Mirrors `FieldDiff` in the engine. */
export interface CADFieldDiff {
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

/** Mirrors `AnalysisDiff` in `src/engine/cost-input-rules/diff.ts`. */
export interface CADDiff {
  diffs: CADFieldDiff[];
  agreed: number;
  differed: number;
  ruleOnly: number;
  aiOnly: number;
  /** Questions the rules refused to answer; the model answered them regardless. */
  undecided: string[];
}

/**
 * Numbers readable at a glance.
 *
 * The big integers here are tooling costs and tool lives — 96400 against
 * 964000 is one glance away from being read wrong, and that is a decimal order
 * of magnitude on the most expensive line in the estimate. Group them.
 */
function fmtVal(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    if (Number.isInteger(v)) return Math.abs(v) >= 10_000 ? v.toLocaleString('en-GB') : String(v);
    return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return String(v);
}

/**
 * The gap, as a phrase.
 *
 * `deltaPct` is Infinity when the model returned a zero — dividing by it gives
 * a percentage that means nothing, and "Infinity%" on screen reads as a bug.
 * Naming what actually happened is more useful than any number would be.
 */
function fmtDelta(d: number | null): string {
  if (d === null) return 'differs';
  if (!Number.isFinite(d)) return 'AI said 0';
  const pct = d * 100;
  return `${pct > 0 ? '+' : ''}${Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Biggest gap first; unquantified (non-numeric) gaps after the measured ones. */
function bySize(a: CADFieldDiff, b: CADFieldDiff): number {
  const av = a.deltaPct === null ? -1 : Math.abs(a.deltaPct);
  const bv = b.deltaPct === null ? -1 : Math.abs(b.deltaPct);
  if (av === bv) return a.field.localeCompare(b.field);
  return bv - av;
}

const MONO = 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace';

function differRow(d: CADFieldDiff): string {
  return `<div style="padding:7px 0;border-top:1px solid var(--warning-border)">
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <span style="${MONO};font-size:0.72rem;font-weight:600;color:var(--text-primary)">${escHtml(d.field)}</span>
      <span style="font-size:0.72rem;color:var(--text-secondary)">
        rule <strong style="${MONO};color:var(--text-primary)">${escHtml(fmtVal(d.ruleValue))}</strong>
        &nbsp;vs&nbsp; AI <strong style="${MONO};color:var(--text-primary)">${escHtml(fmtVal(d.aiValue))}</strong>
      </span>
      <span style="font-size:0.72rem;font-weight:700;color:var(--warning);margin-left:auto">${escHtml(fmtDelta(d.deltaPct))}</span>
    </div>
    ${d.basis
      ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;line-height:1.45">${escHtml(d.basis)}</div>`
      : ''}
  </div>`;
}

/** A folded list of field names — the counts that are context, not findings. */
function foldedList(label: string, fields: string[], colour: string): string {
  if (!fields.length) return '';
  return `<div style="margin-top:6px">
    <span style="font-size:0.7rem;font-weight:600;color:${colour}">${escHtml(label)}</span>
    <div style="${MONO};font-size:0.66rem;color:var(--text-muted);margin-top:2px;line-height:1.6">${
      fields.map(f => escHtml(f)).join(' · ')}</div>
  </div>`;
}

/**
 * Build the panel. Returns `''` when there is nothing to compare — every mode
 * except `'both'` sends `diff: null`, and an empty panel would imply the
 * comparison ran and found nothing.
 */
export function buildRuleVsAIPanel(diff: CADDiff | null): string {
  if (!diff || !diff.diffs.length) return '';

  const differs = diff.diffs.filter(d => d.verdict === 'differ').sort(bySize);
  const ruleOnly = diff.diffs.filter(d => d.verdict === 'rule-only').map(d => d.field).sort();
  const aiOnly = diff.diffs.filter(d => d.verdict === 'ai-only').map(d => d.field).sort();

  const head = differs.length
    ? `&#9878;&#65039; ${differs.length} field${differs.length === 1 ? '' : 's'} where the rules and the AI disagree`
    : '&#9878;&#65039; Rules vs AI — no numeric disagreement on this part';

  return `<div id="cad-diff-panel" style="margin-bottom:12px;padding:11px 13px;background:var(--warning-bg);border:1px solid var(--warning-border);border-left:3px solid var(--warning);border-radius:8px">
    <div style="font-size:0.76rem;font-weight:700;color:var(--text-primary)">${head}</div>
    <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:3px;line-height:1.5">
      Agreement is not the bar — the AI is what the rules replace, and on four of six documented
      parts it was 2&ndash;5&times; out on the material class alone. Each gap below carries the rule&rsquo;s
      basis so it can be argued against the measured geometry rather than taken on trust.
    </div>

    ${differs.map(differRow).join('')}

    ${diff.undecided.length
      ? `<div style="margin-top:9px;padding:6px 9px;background:var(--info-bg);border-left:3px solid var(--info);border-radius:4px;font-size:0.7rem;color:var(--text-secondary);line-height:1.5">
           <strong style="color:var(--text-primary)">${diff.undecided.length} question${diff.undecided.length === 1 ? '' : 's'} the rules refused to answer</strong>
           &mdash; the model answered ${diff.undecided.length === 1 ? 'it' : 'them'} anyway. That is the difference the whole
           deterministic path is for: an unanswerable input blocks the costing instead of being guessed.
         </div>`
      : ''}

    <details style="margin-top:9px">
      <summary style="font-size:0.7rem;color:var(--text-muted);cursor:pointer;user-select:none">
        <span style="color:var(--success);font-weight:600">${diff.agreed} agree</span>
        &nbsp;·&nbsp; ${ruleOnly.length} rule-only &nbsp;·&nbsp; ${aiOnly.length} AI-only
      </summary>
      <div style="margin-top:6px">
        ${foldedList('Rule-only — derived, with nowhere in the model’s response schema to put it', ruleOnly, 'var(--info)')}
        ${foldedList('AI-only — the model produced these; no rule covers them yet', aiOnly, 'var(--text-secondary)')}
        ${!ruleOnly.length && !aiOnly.length
          ? '<div style="font-size:0.68rem;color:var(--text-muted)">Both paths produced the same set of fields.</div>'
          : ''}
      </div>
    </details>
  </div>`;
}

/**
 * CAD to COST as three steps — Part & context → Confirm → Cost (proposal v2, approved 28 Oct 2026;
 * docs/ui/cad-to-cost-redesign-2026-10.md).
 *
 * Pure (data) → HTML builders: main.ts owns the state and the DOM and passes in what each block shows. Nothing here
 * computes a cost — every figure is read off the costing the engine already produced. Every string from a file, a
 * model or a user is escaped.
 */

export type CadStep = 1 | 2 | 3;

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STEP_LABELS = ['Part & context', 'Confirm', 'Cost'] as const;

/** The step indicator: a labelled list, the current step marked for assistive technology. */
export function cadStepsHtml(current: CadStep): string {
  return `<ol class="cad-steps-list">${STEP_LABELS.map((label, i) => {
    const n = (i + 1) as CadStep;
    const state = n < current ? 'done' : n === current ? 'current' : 'todo';
    return `<li class="cad-step cad-step--${state}"${state === 'current' ? ' aria-current="step"' : ''}>`
      + `<span class="cad-step-n" aria-hidden="true">${state === 'done' ? '✓' : n}</span>`
      + `<span class="cad-step-label">${label}</span>`
      + (state === 'done' ? '<span class="sr-only"> (done)</span>' : '')
      + '</li>';
  }).join('')}</ol>`;
}

export interface CadFacts {
  envelopeMm: [number, number, number] | null;
  /** Largest measured silhouette, cm². */
  silhouetteCm2: number | null;
  faces: number | null;
  /** Measured volume, cm³ — the mass follows the material, which may not be settled yet. */
  volumeCm3: number | null;
}

/** Four measured facts under the model. */
export function cadFactsHtml(f: CadFacts): string {
  const cell = (k: string, v: string | null) => v == null ? '' :
    `<div class="cad-fact"><span class="cad-fact-k">${esc(k)}</span><span class="cad-fact-v">${esc(v)}</span></div>`;
  const env = f.envelopeMm ? f.envelopeMm.map(v => v.toFixed(0)).join(' × ') + ' mm' : null;
  return cell('Envelope', env)
    + cell('Largest silhouette', f.silhouetteCm2 != null ? `${f.silhouetteCm2.toFixed(1)} cm²` : null)
    + cell('B-rep faces', f.faces != null ? String(f.faces) : null)
    + cell('Volume', f.volumeCm3 != null ? `${f.volumeCm3.toFixed(1)} cm³` : null);
}

/**
 * The line under the programme-life field (D3: required on CAD to COST). Before a costing it says what the field does;
 * with a costing it says what the tooling comes to per part.
 */
export function programmeLifeLine(years: number | null, annual: number,
  tooling?: { total: number; fmt: (n: number) => string } | null): string {
  if (!years || years <= 0) {
    return 'Required. Tooling is spread over annual volume × programme life; left blank it used to be loaded onto one year\'s volume.';
  }
  const parts = annual * years;
  if (tooling && tooling.total > 0 && parts > 0) {
    return `Tooling ${tooling.fmt(tooling.total)} over ${years} year${years === 1 ? '' : 's'} × ${annual.toLocaleString('en-GB')} = ${tooling.fmt(tooling.total / parts)} a part.`;
  }
  return `Tooling is spread over ${years} year${years === 1 ? '' : 's'} × ${annual.toLocaleString('en-GB')} = ${parts.toLocaleString('en-GB')} parts.`;
}

/** Short names for the answer chips. */
const ANSWER_NAMES: Record<string, string> = {
  'commodity.route': 'Process',
  'commodity.thinWallRoute': 'Process',
  'material.family': 'Material',
  'material.grade': 'Grade',
  'material.resin': 'Resin',
  'material.alAlloy': 'Alloy',
  'material.elastomer': 'Compound',
  'material.laminate': 'Laminate',
  'service.toleranceClass': 'Tolerance',
  'service.safetyCritical': 'Safety-critical',
  'service.pressureTight': 'Leak-tight',
};

export interface AnswerChip { id: string; name: string; value: string }

/** The engineer's answers as chips, each with its option label (not the code). */
export function answerChips(answers: Record<string, string>,
  asked: Record<string, { question: string; options?: Array<{ value: string; label: string }> }>): AnswerChip[] {
  return Object.entries(answers).filter(([, v]) => String(v ?? '').trim() !== '').map(([id, v]) => {
    const opt = asked[id]?.options?.find(o => o.value === v);
    const label = (opt?.label ?? v).split(' — ')[0];
    return { id, name: ANSWER_NAMES[id] ?? asked[id]?.question ?? id, value: label };
  });
}

/** Chips with a "change" button each (data-change-answer=id); main.ts wires them. */
export function answerChipsHtml(chips: AnswerChip[], withChange: boolean): string {
  if (!chips.length) return '';
  return `<div class="cad-answer-chips" role="list" aria-label="Your answers">${chips.map(c =>
    `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">${esc(c.name)}</span> <strong>${esc(c.value)}</strong>`
    + (withChange ? ` <button type="button" class="cad-answer-change" data-change-answer="${esc(c.id)}" aria-label="Change ${esc(c.name)}">change</button>` : '')
    + '</span>').join('')}</div>`;
}

/**
 * What a costing from CAD does not carry, by route (D4: coating is listed now; a priced finish question is phase 2).
 * Each line is something no rule on this route prices — checked against the rule packs, not guessed.
 */
export function notIncludedFor(commodity: string): string[] {
  const common = [
    'Assembly, sub-components and fasteners',
    'PPAP, first-article inspection, gauges and fixtures for inspection',
    'Freight beyond the default delivery in the costing country; duty and Incoterms',
    'Packaging beyond the size-based default',
    'Engineering changes, prototypes and programme management',
  ];
  const finishNotAsked = ['forging', 'casting', 'cast_and_machine', 'machining', 'gear', 'sheet_metal', 'sheet_metal_fab'];
  return finishNotAsked.includes(commodity)
    ? ['Surface treatment or coating (paint, e-coat, plating, zinc flake) — not asked on this route', ...common]
    : common;
}

export type BasisGrade = 'Measured' | 'Answered' | 'Rule' | 'Default' | 'Typed';
export interface BasisRow { grade: BasisGrade; what: string; value: string }

const GRADE_ORDER: BasisGrade[] = ['Typed', 'Answered', 'Default', 'Rule', 'Measured'];

/** Basis rows grouped so what a person chose or must check comes first; measured facts last. */
export function sortBasis(rows: BasisRow[]): BasisRow[] {
  return [...rows].sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
}

export interface CostCardModel {
  commodityLabel: string;
  chips: AnswerChip[];
  country: string;
  annualVolume: number;
  programmeYears: number | null;
  toolingTotal: number;
  amortisationVolume: number;
  /** The uncertainty band, when the costing has one. */
  band: { pm: number; p10: number | null; p90: number | null } | null;
  confidence: string | null;
  basis: BasisRow[];
  notIncluded: string[];
  stamp: string;
  fmt: (n: number) => string;
}

/** The Cost step's card, under the result headline: tooling investment, what the band means, answers, basis, exclusions. */
export function cadCostCardHtml(m: CostCardModel): string {
  const perPart = m.amortisationVolume > 0 ? m.toolingTotal / m.amortisationVolume : 0;
  const amort = m.programmeYears && m.programmeYears > 0
    ? `${m.programmeYears} year${m.programmeYears === 1 ? '' : 's'} × ${m.annualVolume.toLocaleString('en-GB')} a year`
    : `${m.amortisationVolume.toLocaleString('en-GB')} parts`;
  const counts = m.basis.reduce<Record<string, number>>((acc, r) => { acc[r.grade] = (acc[r.grade] ?? 0) + 1; return acc; }, {});
  const countText = GRADE_ORDER.filter(g => counts[g]).map(g => `${counts[g]} ${g.toLowerCase()}`).join(' · ');
  return `
    <div class="cad-cost-card" id="cad-cost-card">
      <div class="cad-cost-head">
        <span class="cad-cost-step">Step 3 · Cost from CAD</span>
        <button type="button" class="cad-answer-change" id="cad-change-answers">Change answers</button>
      </div>
      <div class="cad-cost-figs">
        <div class="cad-cost-fig">
          <span class="cad-cost-k">Tooling investment (one-off)</span>
          <span class="cad-cost-v">${m.toolingTotal > 0 ? esc(m.fmt(m.toolingTotal)) : 'none'}</span>
          ${m.toolingTotal > 0 ? `<span class="cad-cost-sub">${esc(m.fmt(perPart))} a part over ${esc(amort)}</span>` : ''}
        </div>
        <div class="cad-cost-fig">
          <span class="cad-cost-k">Band${m.confidence ? ` · confidence ${esc(m.confidence)}` : ''}</span>
          <span class="cad-cost-v">${m.band ? `± ${m.band.pm}%` : '—'}</span>
          ${m.band && m.band.p10 != null && m.band.p90 != null ? `<span class="cad-cost-sub">P10 ${esc(m.fmt(m.band.p10))} – P90 ${esc(m.fmt(m.band.p90))}</span>` : ''}
        </div>
      </div>
      <p class="cad-cost-note">The band is the spread of the modelled input ranges, not the model's error. Accuracy against prices actually paid is not yet measured — log an actual price to calibrate it.</p>
      <div class="cad-answer-chips" role="list" aria-label="Costing context">
        ${m.chips.some(c => c.name === 'Process') ? '' : `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Route</span> <strong>${esc(m.commodityLabel)}</strong></span>`}
        <span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Country</span> <strong>${esc(m.country)}</strong></span>
        <span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Volume</span> <strong>${m.annualVolume.toLocaleString('en-GB')} / yr</strong></span>
      </div>
      ${answerChipsHtml(m.chips, false)}
      <details class="cad-cost-more" id="cad-basis">
        <summary>Basis — every input by how it was set <span class="cad-cost-count">${esc(countText)}</span></summary>
        <div class="cad-basis-list" role="table" aria-label="Basis of this costing">
          ${sortBasis(m.basis).map(r => `<div class="cad-basis-row" role="row">
            <span role="cell"><span class="cad-grade cad-grade--${r.grade.toLowerCase()}">${r.grade}</span></span>
            <span role="cell" class="cad-basis-what">${esc(r.what)}</span>
            <span role="cell" class="cad-basis-val">${esc(r.value)}</span>
          </div>`).join('')}
        </div>
        <p class="cad-cost-note">Overhead, margin, packaging and logistics are edited in the form (Edit inputs); each bucket of the breakdown opens how it was computed.</p>
      </details>
      <details class="cad-cost-more" id="cad-not-included">
        <summary>Not included in this cost <span class="cad-cost-count">${m.notIncluded.length}</span></summary>
        <ul class="cad-not-included">${m.notIncluded.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </details>
      <div class="cad-stamp">${esc(m.stamp)}</div>
    </div>`;
}

/** "UK rate book 2026-10-10 · rules v7 · kernel 374f8cebdccb · 28 Oct 2026" — on screen and in every export. */
export function cadStamp(o: { rateBook: string; rules: number | string | null; kernel: string | null; date: Date }): string {
  const d = o.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return [o.rateBook, o.rules != null ? `rules v${o.rules}` : null, o.kernel ? `kernel ${o.kernel}` : null, d]
    .filter(Boolean).join(' · ');
}

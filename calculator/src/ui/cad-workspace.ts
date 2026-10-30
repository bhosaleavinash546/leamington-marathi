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
    return 'Required: tooling is spread over annual volume × programme life.';
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
  'service.finish': 'Finish',
  // Route-specific questions (nine-commodity parity sweep, Oct 2026): a chip printed the whole question
  // ("What is the nominal capacity of this container? I know the exact capacity") where the others print a word.
  'blow.capacityL': 'Capacity',
  'blow.capacityExactL': 'Capacity',
  'blow.barrierWall': 'Barrier wall',
  'gear.helix': 'Helix',
  'gear.qualityClass': 'Quality class',
  'gear.materialClass': 'Gear steel',
  'gear.hardeningRoute': 'Hardening',
  'gear.effectiveCaseDepthMm': 'Case depth',
  'gear.moduleEntry': 'Module',
  'gear.teethEntry': 'Teeth',
  'gear.faceWidthEntry': 'Face width',
  'casting.processChoice': 'Casting process',
  'forging.processChoice': 'Forging process',
  'al.route': 'Press route',
  'al.temper': 'Temper',
  'al.finish': 'Finish',
  'al.bends': 'Bends',
  'machine.oversize': 'Oversize',
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
 * What a costing from CAD does not carry, by route. D4 (phase 2): the routes whose module carries a finish (casting,
 * cast + machine, forging, sheet metal) ASK for it — the line goes once a finish is answered, and says "costed bare"
 * until then; machining and gear have no finishing model, so there it stays "not asked". Each line is something no
 * rule on this route prices — checked against the rule packs, not guessed.
 */
export function notIncludedFor(commodity: string, finishRoute: string | null = null, terms: 'DAP' | 'EXW' = 'DAP'): string[] {
  const common = [
    'Assembly, sub-components and fasteners',
    'PPAP, first-article inspection, gauges and fixtures for inspection',
    terms === 'EXW'
      ? 'Freight to your plant, insurance and duty — the price is ex-works (EXW): the buyer collects at the supplier\'s gate'
      : 'Freight beyond the default delivery in the costing country; duty and Incoterms',
    'Packaging beyond the size-based default',
    'Engineering changes, prototypes and programme management',
  ];
  const finishAsked = ['forging', 'casting', 'cast_and_machine', 'sheet_metal', 'sheet_metal_fab'];
  const finishNotAsked = ['machining', 'gear'];
  if (finishAsked.includes(commodity)) {
    return finishRoute
      ? common
      : ['Surface treatment or coating — costed bare; answer "Is the part coated?" to price one', ...common];
  }
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
  /** What the tooling total is made of (the module's `tooling.items`), when it says — e.g. sets in service v wear replacements. */
  toolingItems?: Array<{ label: string; gbp: number }>;
  amortisationVolume: number;
  /** The uncertainty band, when the costing has one. */
  band: { pm: number; p10: number | null; p90: number | null } | null;
  confidence: string | null;
  basis: BasisRow[];
  notIncluded: string[];
  stamp: string;
  fmt: (n: number) => string;
  /** Why the confidence grade (the traceability mix it is graded on), or null when calibrated. */
  confidenceWhy?: { total: number; high: number; medium: number; low: number; lowFields: string[] } | null;
  /** The grade the material line is priced at, and whether it was answered or is the default. */
  grade?: { label: string; answered: boolean } | null;
  /** The weight the material line is costed on, kg. */
  costedWeightKg?: number | null;
  /** The inputs that move the £ most: each ±10 %, re-costed through the stack (engine sensitivity.ts). */
  topMovers?: Array<{ driver: string; swing: number }>;
  /** The commercial basis, editable here (proposal v2 #4); each writes its form field and re-costs. */
  commercial?: Array<{ id: string; label: string; value: number; unit: '%' | 'money' | 'count'; grade: BasisGrade }>;
}

/**
 * A traceability field as a person reads it: "CNC Machining — 20 features (1×Ø10.0×12, …) [geometry-measured].labourRatePerHr"
 * → "CNC Machining — 20 features: labour rate". The card printed the raw key, feature list and all.
 */
export function traceFieldLabel(field: string): string {
  const name = field.split(' (')[0].split(' [')[0].replace(/\.\w+$/, '').trim();
  const prop = field.match(/\]?\.([a-zA-Z]+)$/)?.[1];
  if (!prop) return name;
  const words = prop.replace(/PerHr$|Hr$|Kg$|Gbp$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words && !name.toLowerCase().includes(words) ? `${name}: ${words}` : name;
}

/** What raises a confidence grade, from the rule `overallConfidence` grades on. */
export function confidenceWhyText(grade: string | null, w: CostCardModel['confidenceWhy']): string {
  if (!grade) return '';
  if (grade === 'calibrated') return 'Calibrated against prices actually paid for this kind of part.';
  if (!w || !w.total) return '';
  const names = [...new Set(w.lowFields.map(traceFieldLabel))];
  const lows = names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '');
  return `${grade}: of ${w.total} data points behind this cost, ${w.high} are High, ${w.medium} Medium and ${w.low} Low`
    + ' (the grade is Low when 40 % or more are Low, High when 70 % or more are High, otherwise their mix).'
    + (w.low ? ` Low: ${lows}.` : '')
    + ' A quote typed in for one of them, or prices paid logged with Log actual £, is what moves it.';
}

/** The Cost step's card, under the result headline: tooling investment, what the band means, answers, basis, exclusions. */
export function cadCostCardHtml(m: CostCardModel): string {
  const perPart = m.amortisationVolume > 0 ? m.toolingTotal / m.amortisationVolume : 0;
  const amort = m.programmeYears && m.programmeYears > 0
    ? `${m.programmeYears} year${m.programmeYears === 1 ? '' : 's'} × ${m.annualVolume.toLocaleString('en-GB')} a year`
    : `${m.amortisationVolume.toLocaleString('en-GB')} parts`;
  const counts = m.basis.reduce<Record<string, number>>((acc, r) => { acc[r.grade] = (acc[r.grade] ?? 0) + 1; return acc; }, {});
  const countText = GRADE_ORDER.filter(g => counts[g]).map(g => `${counts[g]} ${g.toLowerCase()}`).join(' · ');
  const why = confidenceWhyText(m.confidence, m.confidenceWhy ?? null);
  const commercialHtml = m.commercial?.length ? `
        <div class="cad-commercial" role="group" aria-labelledby="cad-commercial-h">
          <div class="cad-commercial-h" id="cad-commercial-h">Commercial basis — change one to re-cost</div>
          ${m.commercial.map(c => `<label class="cad-commercial-f">
            <span>${esc(c.label)} <span class="cad-grade cad-grade--${c.grade.toLowerCase()}">${c.grade}</span></span>
            <input type="number" data-commercial="${esc(c.id)}" value="${esc(String(c.value))}" min="0" step="${c.unit === 'count' ? '1' : c.unit === '%' ? '0.1' : '0.01'}"/>
            ${c.unit === '%' ? '<span class="cad-commercial-u">%</span>' : c.unit === 'money' ? '<span class="cad-commercial-u">£ a part</span>' : '<span class="cad-commercial-u">parts</span>'}
          </label>`).join('')}
        </div>` : '';
  const moversHtml = m.topMovers?.length ? `
        <div class="cad-movers">
          <div class="cad-commercial-h">Moves the cost most — each input ±10 %, re-costed</div>
          <ol class="cad-movers-list">${m.topMovers.map(t => `<li><span>${esc(t.driver)}</span><span class="cad-basis-val">± ${esc(m.fmt(t.swing))}</span></li>`).join('')}</ol>
        </div>` : '';
  const extraChips = [
    m.grade ? `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Grade</span> <strong>${esc(m.grade.label)}</strong>${m.grade.answered ? '' : ' <span class="cad-answer-k">(default)</span>'}</span>` : '',
    m.costedWeightKg && m.costedWeightKg > 0 ? `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Weight</span> <strong>${m.costedWeightKg.toFixed(3)} kg</strong> <span class="cad-answer-k">costed</span></span>` : '',
  ].join('');
  return `
    <div class="cad-cost-card" id="cad-cost-card">
      <nav class="cad-steps" aria-label="Steps to the cost">${cadStepsHtml(3)}</nav>
      <div class="cad-cost-head">
        <span class="cad-cost-step">Step 3 · Cost from CAD</span>
        <button type="button" class="cad-answer-change" id="cad-change-answers">Change answers</button>
      </div>
      <div class="cad-cost-figs">
        <div class="cad-cost-fig">
          <span class="cad-cost-k">Tooling over the programme</span>
          <span class="cad-cost-v">${m.toolingTotal > 0 ? esc(m.fmt(m.toolingTotal)) : 'none'}</span>
          ${m.toolingTotal > 0 ? `<span class="cad-cost-sub">${esc(m.fmt(perPart))} a part over ${esc(amort)}</span>` : ''}
          ${m.toolingTotal > 0 && m.toolingItems?.length ? `<span class="cad-cost-sub">${m.toolingItems.map(i => `${esc(i.label)} ${esc(m.fmt(i.gbp))}`).join(' · ')}</span>` : ''}
        </div>
        <div class="cad-cost-fig">
          <span class="cad-cost-k">Band${m.confidence ? ` · confidence ${esc(m.confidence)}` : ''}</span>
          <span class="cad-cost-v">${m.band ? `± ${m.band.pm}%` : '—'}</span>
          ${m.band && m.band.p10 != null && m.band.p90 != null ? `<span class="cad-cost-sub">P10 ${esc(m.fmt(m.band.p10))} – P90 ${esc(m.fmt(m.band.p90))}</span>` : ''}
        </div>
      </div>
      <p class="cad-cost-note">The band is the spread of the modelled input ranges, not the model's error. Accuracy against prices actually paid is not yet measured — log an actual price to calibrate it.</p>
      ${why ? `<p class="cad-cost-note" id="cad-confidence-why">Confidence ${esc(why)}</p>` : ''}
      <div class="cad-answer-chips" role="list" aria-label="Costing context">
        ${m.chips.some(c => c.name === 'Process') ? '' : `<span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Route</span> <strong>${esc(m.commodityLabel)}</strong></span>`}
        <span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Country</span> <strong>${esc(m.country)}</strong></span>
        <span class="cad-answer-chip" role="listitem"><span class="cad-answer-k">Volume</span> <strong>${m.annualVolume.toLocaleString('en-GB')} / yr</strong></span>
        ${extraChips}
      </div>
      ${answerChipsHtml(m.chips, false)}
      <details class="cad-cost-more" id="cad-basis">
        <summary>Basis — every input by how it was set <span class="cad-cost-count">${esc(countText)}</span></summary>
        ${moversHtml}
        ${commercialHtml}
        <div class="cad-basis-list" role="table" aria-label="Basis of this costing">
          ${sortBasis(m.basis).map(r => `<div class="cad-basis-row" role="row">
            <span role="cell"><span class="cad-grade cad-grade--${r.grade.toLowerCase()}">${r.grade}</span></span>
            <span role="cell" class="cad-basis-what">${esc(r.what)}</span>
            <span role="cell" class="cad-basis-val">${esc(r.value)}</span>
          </div>`).join('')}
        </div>
        <p class="cad-cost-note">Any other input is changed in the form beside the model (Edit inputs); each bucket of the breakdown opens how it was computed.</p>
      </details>
      <details class="cad-cost-more" id="cad-compare">
        <summary>Compare routes — the same part costed on each route it could be made by</summary>
        <p class="cad-cost-note">Each row is the rules and this country's rate book on the measured part, with your answers carried over. Typed changes on the form are not in these rows.</p>
        <div id="cad-compare-host" aria-live="polite"></div>
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

/** The comparison the server returns (server/services/route-compare.ts) — the same shape, type-only. */
export type RouteComparison = import('../../server/services/route-compare.js').RouteComparison;
export type RouteCompareRow = import('../../server/services/route-compare.js').RouteRow;

/** The comparison with every route labelled — what the screen draws and the PDF / Excel print. */
export interface RouteComparisonExport extends RouteComparison {
  current: string;
  currentLabel: string;
  labels: Record<string, string>;
  /** The costing's headline, to call out a typed change on the form. */
  headline: number | null;
}

export function routeComparisonExport(cmp: RouteComparison, o: { current: string; labels: Record<string, string>; headline: number | null }): RouteComparisonExport {
  const labels: Record<string, string> = {};
  for (const r of [...cmp.rows.map(r => r.route), ...cmp.rows.map(r => r.commodity ?? ''), ...cmp.excluded.map(e => e.route), o.current]) {
    if (r) labels[r] = o.labels[r] ?? r.replace(/_/g, ' ');
  }
  return { ...cmp, current: o.current, currentLabel: labels[o.current], labels, headline: o.headline };
}

/** The reference row: the server puts the costing's own route first; by route otherwise. */
export function routeReferenceRow(x: Pick<RouteComparisonExport, 'rows' | 'current'>): RouteCompareRow | null {
  if (x.rows[0]?.route === x.current) return x.rows[0];
  return x.rows.find(r => r.route === x.current) ?? x.rows[0] ?? null;
}

/** A row's name on screen and in the reports: the route's label, with its process when the route has several. */
export function routeRowLabel(r: Pick<RouteCompareRow, 'route' | 'process' | 'label'>, labels: Record<string, string>): string {
  const base = labels[r.route] ?? r.route.replace(/_/g, ' ');
  const proc = r.process ? r.label.split(' — ')[1] : null;
  return proc ? `${base} — ${proc}` : base;
}

const BUCKETS: Array<[string, string]> = [
  ['rawMaterial', 'Material'], ['process', 'Process'], ['labour', 'Labour'], ['tooling', 'Tooling'],
  ['packaging', 'Packaging'], ['logistics', 'Logistics'], ['overhead', 'Overhead'], ['margin', 'Margin'],
];

/** The lines the "Basis" column carries for a row: what was assumed, what is open, what was refused, the notes. */
export function routeRowWhy(r: RouteCompareRow, x: RouteComparisonExport, fmt: (n: number) => string): string[] {
  const why: string[] = [];
  const isRef = r === routeReferenceRow(x);
  if (isRef && r.total != null && x.headline != null && Math.abs(x.headline - r.total) >= 0.005) {
    why.push(`the headline is ${fmt(x.headline)} — the form carries a typed change`);
  }
  if (r.commodity && r.commodity !== r.route) why.push(`costed as ${x.labels[r.commodity] ?? r.commodity}`);
  for (const a of r.assumed) why.push(`assumed: ${a}`);
  for (const q of r.openQuestions) why.push(`needs an answer: ${q}`);
  if (r.refusal) why.push(`not costed: ${r.refusal}`);
  why.push(...r.notes, ...r.caveats);
  if (r.reconciles === false) why.push('CHECK: the buckets do not add to the total');
  if (r.audit && !r.audit.closes) why.push('CHECK: the independent re-add does not close — see the audit');
  const notAsked = r.spec.filter(sp => sp.source === 'not asked');
  if (notAsked.length) why.push(`not read on this route: ${notAsked.map(sp => sp.label.toLowerCase()).join(', ')}`);
  return why;
}

/**
 * The route comparison (D5, rebuilt Oct 2026; second round 29 Oct 2026). The costing's own route comes first and is
 * the reference; the others are sorted cheapest first, then the ones that still need an answer or were refused — each
 * says why, nothing is filled in. Each costed row opens to its 8 buckets with the independent re-add, the specification
 * it was costed to, the material bought, the tooling investment, every operation, the checks it passed, its band and
 * its cost at each ladder volume. Routes and processes the screen refused are listed with the check they failed.
 */
export function routeCompareHtml(x: RouteComparisonExport, o: { fmt: (n: number) => string }): string {
  const ref = routeReferenceRow(x);
  const refTotal = ref?.total ?? null;
  const rank = (r: RouteCompareRow) => (r === ref ? -1 : r.total != null ? 0 : 1);
  const sorted = [...x.rows].sort((a, b) => rank(a) - rank(b) || (a.total ?? Infinity) - (b.total ?? Infinity));
  const label = (r: Pick<RouteCompareRow, 'route' | 'process' | 'label'>) => esc(routeRowLabel(r, x.labels));
  const kg = (v: number | null) => (v == null ? '—' : `${v.toFixed(3)} kg`);
  const money0 = (n: number) => esc(o.fmt(n));
  const body = sorted.map(r => {
    const isRef = r === ref;
    const delta = !isRef && r.total != null && refTotal != null && refTotal > 0
      ? `${r.total >= refTotal ? '+' : '−'}${money0(Math.abs(r.total - refTotal))} (${r.total >= refTotal ? '+' : '−'}${Math.abs((r.total / refTotal - 1) * 100).toFixed(0)}%)`
      : isRef ? 'reference' : '—';
    const why = routeRowWhy(r, x, o.fmt);
    const cross = x.crossovers.find(c => c.route === r.route && c.process === r.process);
    const action = !isRef && r.total != null
      ? `<button type="button" class="cad-answer-change" data-cost-route="${esc(r.route)}"${r.process ? ` data-cost-process="${esc(r.process)}"` : ''}>Cost this route</button>` : '';
    const detail = r.total != null && r.breakdown ? `<details class="cad-compare-detail"><summary>How this row is built</summary>
      <div class="cad-compare-grid">
        <div><h5>Buckets and the independent re-add</h5><table class="cad-compare-mini"><thead><tr><th scope="col">Bucket</th><th scope="col" class="num">Engine</th><th scope="col" class="num">Re-added</th><th scope="col">Closes</th></tr></thead><tbody>${BUCKETS.map(([k, l]) => {
          const a = r.audit?.lines.find(ln => ln.line.toLowerCase().startsWith(l.toLowerCase()));
          return `<tr><th scope="row">${l}</th><td class="num">${money0(r.breakdown![k] ?? 0)}</td><td class="num">${a ? money0(a.recomputed) : '—'}</td><td>${a ? `<span class="cad-compare-${a.closes ? 'ok' : 'fail'}">${a.closes ? 'yes' : 'no'}</span>` : '—'}</td></tr>`;
        }).join('')}
          <tr class="cad-compare-total"><th scope="row">Total</th><td class="num">${money0(r.total)}</td><td class="num">${r.audit ? money0(r.audit.lines.find(ln => ln.line === 'Total')?.recomputed ?? 0) : '—'}</td><td>${r.audit ? `<span class="cad-compare-${r.audit.closes ? 'ok' : 'fail'}">${r.audit.closes ? 'all close' : 'open'}</span>` : (r.reconciles ? '<span class="cad-compare-ok">adds up</span>' : '—')}</td></tr></tbody></table>
          ${r.audit ? `<details class="cad-compare-audit"><summary>How each line was re-added</summary><ul class="cad-compare-checks">${r.audit.lines.map(ln => `<li><strong>${esc(ln.line)}</strong>: ${esc(ln.how)} = ${money0(ln.recomputed)} (engine ${money0(ln.reported)})</li>`).join('')}</ul></details>` : ''}
          ${r.band ? `<h5>Band</h5><p>P10 ${money0(r.band.p10)} – P90 ${money0(r.band.p90)} (± ${r.band.plusMinusPct}% about the median, confidence ${esc(r.band.confidence)}) — the spread of the modelled input ranges, not the model's error</p>` : ''}
        </div>
        <div><h5>Specification costed</h5><table class="cad-compare-mini"><tbody>${r.spec.map(sp => `<tr><th scope="row">${esc(sp.label)}</th><td>${esc(sp.value)}</td><td><span class="cad-compare-src">${esc(sp.source)}</span></td></tr>`).join('') || '<tr><td>—</td></tr>'}</tbody></table>
          <h5>Material</h5>${r.material ? `<p>${esc(r.material.label)}<br>net ${kg(r.material.netKg)} · bought ${kg(r.material.boughtKg)}${r.material.utilisation != null ? ` · ${(r.material.utilisation * 100).toFixed(0)}% utilisation` : ''}</p>` : '<p>—</p>'}
          <h5>Tooling</h5>${r.tooling ? `<p>${money0(r.tooling.investment)} one-off over ${r.tooling.amortisedOver.toLocaleString('en-GB')} parts = ${money0(r.toolingPerPart ?? 0)} a part${r.tooling.items.length ? `<br><span class="cad-compare-items">${r.tooling.items.map(it => `${esc(it.label)} ${money0(it.gbp)}`).join(' · ')}</span>` : ''}</p>` : '<p>—</p>'}
          ${r.programme ? `<h5>Programme (${r.programme.parts.toLocaleString('en-GB')} parts over ${r.programme.years} yr)</h5><p>${money0(r.programme.pieceExTooling)} a part excluding tooling × ${r.programme.parts.toLocaleString('en-GB')} = ${money0(r.programme.pieceSpend)}, + tooling ${money0(r.programme.tooling)} = <strong>${money0(r.programme.total)}</strong></p>` : ''}
          ${r.byVolume.length ? `<h5>By volume (median, P10–P90)</h5><table class="cad-compare-mini"><tbody>${r.byVolume.map(v => `<tr><th scope="row">${v.volume.toLocaleString('en-GB')} / yr</th><td class="num">${v.total != null ? money0(v.total) : `— <span class="cad-compare-note">${esc(v.note ?? '')}</span>`}</td><td class="num cad-compare-note">${v.p10 != null && v.p90 != null ? `${money0(v.p10)}–${money0(v.p90)}` : ''}</td></tr>`).join('')}</tbody></table>${cross ? `<p class="cad-compare-cross">${esc(cross.text)}</p>` : ''}` : ''}
        </div>
        <div><h5>Operations</h5>${r.operations?.length ? `<table class="cad-compare-mini"><thead><tr><th scope="col">Operation</th><th scope="col">Machine</th><th scope="col" class="num">min</th><th scope="col" class="num">Process</th><th scope="col" class="num">Labour</th></tr></thead><tbody>${r.operations.map(op => `<tr><td>${esc(op.name)}</td><td>${esc(op.machine)}</td><td class="num">${op.bench ? '—' : op.cycleMin.toFixed(2)}</td><td class="num">${money0(op.processCost)}</td><td class="num">${money0(op.labourCost)}</td></tr>`).join('')}</tbody></table>` : '<p>—</p>'}
          <h5>Feasibility</h5><ul class="cad-compare-checks">${r.checks.map(c => `<li><span class="cad-compare-${c.pass ? 'ok' : 'fail'}">${c.pass ? 'pass' : 'fail'}</span> ${esc(c.label)}: ${esc(c.measured)} — limit ${esc(c.limit)} <span class="cad-compare-src">(${esc(c.source)})</span></li>`).join('')}</ul>
        </div>
      </div></details>` : '';
    // Two rows a route: the figures on one line, the basis under them full width — the seven-column table used to
    // scroll sideways inside the card (five-part review, Oct 2026).
    return `<tr${isRef ? ' class="cad-compare-ref"' : ''}>
      <th scope="row">${label(r)}${isRef ? ' <span class="cad-cost-count">this costing</span>' : ''}</th>
      <td class="num">${r.total != null ? money0(r.total) : '—'}${r.band ? `<br><span class="cad-compare-note">± ${r.band.plusMinusPct}%</span>` : ''}</td>
      <td class="num">${delta}</td>
      <td class="num">${r.tooling ? money0(r.tooling.investment) : '—'}</td>
      <td class="num">${r.toolingPerPart != null ? money0(r.toolingPerPart) : '—'}</td>
      <td class="num">${r.programme ? money0(r.programme.total) : '—'}</td>
    </tr>
    <tr class="cad-compare-basis${isRef ? ' cad-compare-ref' : ''}"><td colspan="6">${r.audit ? `<span class="cad-compare-${r.audit.closes ? 'ok' : 'fail'}">${r.audit.closes ? 're-add closes' : 're-add open'}</span> ` : ''}${!isRef && cross ? `<div class="cad-compare-cross">${esc(cross.text)}</div>` : ''}${why.length ? `<ul class="cad-compare-why">${why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}${action}${detail}</td></tr>`;
  }).join('');
  const excluded = x.excluded.length ? `<details class="cad-compare-excluded"><summary>Not feasible for this part <span class="cad-cost-count">${x.excluded.length}</span></summary>
    <ul class="cad-compare-checks">${x.excluded.map(e => `<li><strong>${label(e)}</strong>: ${e.reasons.map(c => `${esc(c.label)} — ${esc(c.measured)} against ${esc(c.limit)} <span class="cad-compare-src">(${esc(c.source)})</span>`).join('; ')}</li>`).join('')}</ul></details>` : '';
  const prog = x.programme;
  return `<p class="cad-cost-note">${esc(x.principle)} Programme view: ${prog.annualVolume.toLocaleString('en-GB')} a year over ${prog.years} years${prog.yearsAssumed ? ' (5 years assumed — no programme life given)' : ''}. Every costed row is re-added independently from its own rates and times; a row that does not close is marked, never corrected.</p><div class="cad-compare-wrap"><table class="cad-compare-table">
    <caption class="sr-only">Cost per part by manufacturing route and process</caption>
    <thead><tr><th scope="col">Route · process</th><th scope="col" class="num">Cost / part</th><th scope="col" class="num">vs this costing</th><th scope="col" class="num">Tooling over programme</th><th scope="col" class="num">Tooling / part</th><th scope="col" class="num">Programme spend</th></tr></thead>
    <tbody>${body}</tbody></table></div>${excluded}`;
}

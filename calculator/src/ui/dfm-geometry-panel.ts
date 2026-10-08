/**
 * The geometric DFM findings, on screen — the same evidence the printed pack carries.
 *
 * The panel shipped rendering five fields: title, count, £, the worst instance's
 * detail line, and the standard's name. Everything else the engine had already
 * put on the wire — the measured range against the threshold, the recommended
 * fix, the cost basis or the stated reason there is no figure, what the engine
 * could NOT check, and the DFA half — was dropped on the floor. So the
 * manufacturing engineer marking a printed review pack got MORE to judge from
 * than the engineer sitting in front of the live tool. That is backwards.
 *
 * Two states matter more than the list itself:
 *
 *   - **No pack for this commodity.** Rendering nothing puts the same pixels on
 *     screen as "we checked and it is clean". They are not the same thing, and
 *     confusing them is the most expensive mistake this panel can make.
 *   - **Pack ran, nothing fired.** Same trap, one step in: it means the checks
 *     that RAN found nothing, which is only meaningful next to the list of
 *     checks that did not run.
 *
 * ## Why it is a separate module
 *
 * vitest runs `environment: 'node'` with no jsdom, so anything touching
 * `document` cannot be tested, and anything inside `main.ts` drags an
 * 18k-line browser monolith into the test run. A pure string builder is
 * testable — and this one is tested against a real engine run, not a fixture I
 * wrote to match my own code.
 */
import { escHtml } from './toast.js';
import type { GeometricDFMMeta } from '../export/pdf.js';

type Grouped = GeometricDFMMeta['grouped'][number];

/**
 * Sub-penny findings are real — several land at £0.003/part. Rounding them to
 * £0.00 would print a finding as free, which is not what the engine said.
 */
export function dfmMoney(v: number): string {
  return v >= 0.01 ? `£${v.toFixed(2)}` : `£${v.toFixed(4)}`;
}

function severityClass(s: string): string {
  return s === 'critical' || s === 'major' ? 'danger' : s === 'minor' ? 'warn' : 'muted';
}

/** The severity as a word an engineer reads at a glance — never colour alone (WCAG 1.4.1). */
export function severityBadge(s: string): string {
  const k = ['critical', 'major', 'minor'].includes(s) ? s : 'advisory';
  return `<span class="dfm-sev dfm-sev--${k}">${k.charAt(0).toUpperCase()}${k.slice(1)}</span>`;
}

export { MEASURE_LABELS, measureLabel, fmtMeasureNum, withUnit, measuredText, thresholdText } from '../engine/dfm-geometry/measure-format.js';
import { measureLabel, measuredText, thresholdText } from '../engine/dfm-geometry/measure-format.js';

function measuredRange(x: Grouped): string { return measuredText(x.range, x.count); }

/**
 * The money line, or the reason there is none.
 *
 * These are mutually exclusive by contract — a finding never shows both a
 * number and an explanation of why there is no number, because "here is a
 * figure and here is why there is no figure" is how a report loses its reader.
 */
function costLine(x: Grouped, recosted?: { basis?: string }): string {
  if ((x.totalCostGBP ?? 0) > 0 && x.worst.costImpact) {
    const indicative = x.worst.costImpact.confidence === 'indicative'
      ? ' <em>(indicative — a documented default stood in for an unstated input)</em>'
      : '';
    return `<details class="dfm-geo-how"><summary>How is this £ calculated?</summary>`
      + `<p class="small">${escHtml(x.worst.costImpact.basis)}${indicative}</p>`
      + (recosted?.basis ? `<p class="small"><strong>In this costing:</strong> ${escHtml(recosted.basis)}.</p>` : '')
      + `</details>`;
  }
  if (x.costNotModelled) {
    return `<details class="dfm-geo-how"><summary>Not priced — why?</summary>`
      + `<p class="small">${escHtml(x.costNotModelled)}</p></details>`;
  }
  return '';
}

function sourceLine(src: { standard: string; clause?: string }): string {
  return escHtml(src.standard) + (src.clause ? ` — ${escHtml(src.clause)}` : '');
}

/**
 * What the engine declared out of scope for this geometry.
 *
 * Collapsed, but never omitted: a short finding list is not a clean bill of
 * health, and on most parts this list is longer than the findings.
 */
function limitationsBlock(limitations: readonly string[]): string {
  if (!limitations.length) return '';
  return `<details class="dfm-geo-lims"><summary>What was <strong>not</strong> checked `
    + `(${limitations.length})</summary>`
    + `<ul>${limitations.map(l => `<li class="small">${escHtml(l)}</li>`).join('')}</ul>`
    + `<p class="small muted">Each line is a check the engine declared out of scope for this `
    + `geometry — not a check that passed.</p></details>`;
}

function dfaBlock(dfa: GeometricDFMMeta['dfa']): string {
  if (!dfa?.available) return '';
  const penalties = (dfa.penalties ?? []).map(p =>
    `<li class="small">+${p.addedSec}s — ${escHtml(p.reason)} `
    + `<span class="muted">(${escHtml(p.measured)})</span></li>`).join('');
  return `<details class="dfm-geo-lims"><summary>Assembly (DFA) — handling and insertion from `
    + `geometry</summary>`
    + `<p class="small">Handling ${dfa.handlingTimeSec}s + insertion ${dfa.insertionTimeSec}s = `
    + `<strong>${dfa.totalTimeSec}s</strong>, ${dfa.vsIdealRatio}× the 3 s ideal part.</p>`
    + `<ul>${penalties}</ul>`
    + `<p class="small muted">${sourceLine(dfa.source)}</p></details>`;
}

/** The £ a finding shows, decided by the host (re-costed when this part's costing is on screen). */
export interface DfmAmount { text: string; title: string; basis?: string }

function issueItem(x: Grouped, i: number, amounts?: ReadonlyMap<string, DfmAmount>): string {
  const own: DfmAmount | undefined = (x.totalCostGBP ?? 0) > 0 ? { text: `${dfmMoney(x.totalCostGBP ?? 0)}/part`, title: 'Priced at the finding\u2019s reference rate' } : undefined;
  const amt = amounts ? amounts.get(x.ruleId) : own;
  const faces = x.faceIds.length;
  return `
    <li class="dfm-geo-item ${severityClass(x.severity)}" data-dfm-idx="${i}"
        role="button" tabindex="0" aria-label="${escHtml(`${x.severity} — ${x.title}. Highlight ${faces} face${faces === 1 ? '' : 's'} in the 3D viewer`)}">
      <div class="dfm-geo-top">
        ${severityBadge(x.severity)}
        <strong class="dfm-geo-title">${escHtml(x.title)}${x.count > 1 ? ` <em>×${x.count}</em>` : ''}</strong>
        ${amt ? `<span class="dfm-geo-cost" title="${escHtml(amt.title)}">${escHtml(amt.text)}</span>` : '<span class="dfm-geo-nocost">not priced</span>'}
      </div>
      <div class="small">${escHtml(x.worst.detail)}</div>
      <div class="small dfm-geo-measure">
        <span>${escHtml(measureLabel(x.worst.measured.field))} <strong>${escHtml(measuredRange(x))}</strong></span>
        <span class="muted">${escHtml(thresholdText(x.threshold))}</span>
        <span class="muted">${faces} face${faces === 1 ? '' : 's'}</span>
      </div>
      <div class="small"><strong>Fix:</strong> ${escHtml(x.recommendation)}</div>
      ${costLine(x, amt)}
      <div class="small muted dfm-geo-src">Source: ${sourceLine(x.source)}</div>
    </li>`;
}

const HEADING = '<h3>Geometric DFM — measured from the CAD</h3>';

/** The whole panel as HTML. Returns '' when there is nothing to show at all. */
export function buildGeometricDFMPanel(
  g: GeometricDFMMeta | null,
  opts: { amounts?: ReadonlyMap<string, DfmAmount>; recosted?: boolean } = {},
): string {
  if (!g) return '';

  if (!g.packAvailable) {
    return `${HEADING}
      <p class="muted small">No geometric rule pack covers this commodity yet, so
        <strong>no geometry checks ran</strong>. This is not a clean bill of health — it is an
        absence of coverage. ${g.featuresExamined} feature(s) were measured and are available to
        the cost model regardless.</p>`;
  }

  const priced = (g.totalAddressableGBP ?? 0) > 0;
  const nPriced = opts.amounts ? g.grouped.filter(x => opts.amounts!.has(x.ruleId)).length : g.grouped.filter(x => (x.totalCostGBP ?? 0) > 0).length;
  const money = opts.recosted
    ? (nPriced
      ? `${nPriced} finding${nPriced === 1 ? ' carries' : 's carry'} a £: what each moves <strong>this costing</strong> by, re-costed through its own operations (overhead and margin included). The rest are quality or yield risks with no modelled cost path; each says why.`
      : 'No finding moves this costing by a modelled £ — each says why.')
    : priced
      ? `<strong>${dfmMoney(g.totalAddressableGBP ?? 0)}/part</strong> across ${nPriced} priced finding${nPriced === 1 ? '' : 's'} at the reference rate; Calculate to see what each moves the costing by. The rest are quality or yield risks with no modelled cost path.`
      : 'No finding here has a modelled cost path — each says why.';
  const head = `${HEADING}
    <p class="muted small dfm-geo-lead">${g.grouped.length} issue${g.grouped.length === 1 ? '' : 's'} (${g.findings.length} instance${g.findings.length === 1 ? '' : 's'})
      from ${g.featuresExamined} measured features and ${g.rulesEvaluated} rules. ${money}
      Click an issue to highlight its faces in the 3D viewer.</p>`;

  const tail = `${limitationsBlock(g.limitations ?? [])}${dfaBlock(g.dfa)}
    <div id="dfm-geo-hint" class="small muted" style="margin-top:6px"></div>`;

  if (!g.grouped.length) {
    return `${head}
      <p class="small">No rule in the pack fired. Read that with the list below — it means the
        checks that <em>ran</em> found nothing, not that the part is clean.</p>
      ${tail}`;
  }

  return `${head}
    <ul class="dfm-geo-list">${g.grouped.map((x, i) => issueItem(x, i, opts.amounts)).join('')}</ul>
    ${tail}`;
}

/**
 * What to tell the engineer after a click.
 *
 * The old code logged the face ids to the console when no viewer was open,
 * which nobody reads: the click appeared to do nothing, and a feature that
 * appears to do nothing is indistinguishable from a broken one.
 */
export function dfmHighlightHint(faceIds: readonly number[], highlighted: boolean): string {
  if (highlighted) return `Highlighted ${faceIds.length} face(s) in the 3D viewer.`;
  const shown = faceIds.slice(0, 12).join(', ');
  const more = faceIds.length > 12 ? ` and ${faceIds.length - 12} more` : '';
  return `Open the 3D viewer to see these ${faceIds.length} face(s) highlighted `
    + `(B-rep face ids: ${shown}${more}).`;
}

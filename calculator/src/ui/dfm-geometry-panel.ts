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

/** Measured spread across instances — the range, not one cherry-picked case. */
function measuredRange(x: Grouped): string {
  return x.count > 1
    ? `${x.range.min}–${x.range.max}${x.range.unit}`
    : `${x.range.min}${x.range.unit}`;
}

/**
 * The money line, or the reason there is none.
 *
 * These are mutually exclusive by contract — a finding never shows both a
 * number and an explanation of why there is no number, because "here is a
 * figure and here is why there is no figure" is how a report loses its reader.
 */
function costLine(x: Grouped): string {
  if ((x.totalCostGBP ?? 0) > 0 && x.worst.costImpact) {
    const indicative = x.worst.costImpact.confidence === 'indicative'
      ? ' <em>(indicative — a documented default stood in for an unstated input)</em>'
      : '';
    return `<div class="small muted"><strong>Cost basis:</strong> `
      + `${escHtml(x.worst.costImpact.basis)}${indicative}</div>`;
  }
  if (x.costNotModelled) {
    return `<div class="small muted"><strong>Not priced:</strong> `
      + `${escHtml(x.costNotModelled)}</div>`;
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

function issueItem(x: Grouped, i: number): string {
  const priced = (x.totalCostGBP ?? 0) > 0;
  return `
    <li class="dfm-geo-item ${severityClass(x.severity)}" data-dfm-idx="${i}"
        role="button" tabindex="0">
      <strong>${escHtml(x.title)}</strong>${x.count > 1 ? ` <em>(${x.count})</em>` : ''}
      ${priced ? `<span class="dfm-geo-cost">${dfmMoney(x.totalCostGBP ?? 0)}/part</span>` : ''}
      <div class="small">${escHtml(x.worst.detail)}</div>
      <div class="small dfm-geo-measure">
        <span>measured <strong>${escHtml(x.worst.measured.field)} ${measuredRange(x)}</strong></span>
        <span class="muted">threshold ${escHtml(x.threshold.comparator)} `
          + `${x.threshold.value}${escHtml(x.threshold.unit)}</span>
        <span class="muted">${x.faceIds.length} face(s)</span>
      </div>
      <div class="small"><strong>Fix:</strong> ${escHtml(x.recommendation)}</div>
      ${costLine(x)}
      <div class="small muted">${sourceLine(x.source)}</div>
    </li>`;
}

const HEADING = '<h3>Geometric DFM — measured from the CAD</h3>';

/** The whole panel as HTML. Returns '' when there is nothing to show at all. */
export function buildGeometricDFMPanel(g: GeometricDFMMeta | null): string {
  if (!g) return '';

  if (!g.packAvailable) {
    return `${HEADING}
      <p class="muted small">No geometric rule pack covers this commodity yet, so
        <strong>no geometry checks ran</strong>. This is not a clean bill of health — it is an
        absence of coverage. ${g.featuresExamined} feature(s) were measured and are available to
        the cost model regardless.</p>`;
  }

  const priced = (g.totalAddressableGBP ?? 0) > 0;
  const head = `${HEADING}
    <p class="muted small">${g.grouped.length} issue(s) across ${g.findings.length} instance(s)
      from ${g.featuresExamined} measured feature(s), ${g.rulesEvaluated} rule(s) evaluated,
      ranked by cost. ${priced
        ? `<strong>${dfmMoney(g.totalAddressableGBP ?? 0)}/part</strong> priced; issues without a
           figure are quality or yield risks with no modelled cost path.`
        : 'No finding here has a modelled cost path — each says why.'}
      Click an issue to highlight the faces that caused it.</p>`;

  const tail = `${limitationsBlock(g.limitations ?? [])}${dfaBlock(g.dfa)}
    <div id="dfm-geo-hint" class="small muted" style="margin-top:6px"></div>`;

  if (!g.grouped.length) {
    return `${head}
      <p class="small">No rule in the pack fired. Read that with the list below — it means the
        checks that <em>ran</em> found nothing, not that the part is clean.</p>
      ${tail}`;
  }

  return `${head}
    <ul class="dfm-geo-list">${g.grouped.map(issueItem).join('')}</ul>
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

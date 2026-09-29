// ─────────────────────────────────────────────────────────────────────────────
// Pure decisions behind the analysis reports.
//
// Same pattern as innovation-report-core.mjs and idea-provenance.mjs: plain
// .mjs so node:test can exercise it with no build step, and nothing here knows
// about jsPDF, exceljs or pptxgenjs. The renderers keep the drawing; the
// judgements that can be WRONG live here, where they can be tested once instead
// of re-implemented per exporter.
//
// The August 2026 audit found why that matters. `export-service.ts` carried its
// own private money parser for the business-case ROI ranking, and it disagreed
// with the one the server and the UI use:
//
//   "£350K–£650K at 80,000 units/yr"   PDF 350,000   ·   server/UI 500,000
//   "£1.2M–£2.4M"                      PDF 1,200,000 ·   server/UI 1,800,000
//
// It read the low end of a RANGE where the others take the midpoint — and a
// range is the format the model writes most often. So the "ROI-ranked ideas"
// page of an exported business case could order ideas differently from the
// screen the reader had just been looking at, with no indication why.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Money string → number, taking the MIDPOINT of a range.
 *
 * Deliberately identical in behaviour to parseAnnualValueMid in
 * idea-quality.mjs, which is the server's ranking parser. If these two ever
 * diverge again, the exported ordering silently stops matching the screen —
 * so `tests/report-core.test.mjs` asserts they agree on the same inputs.
 */
export function parseMoney(val) {
  if (!val || typeof val !== 'string') return 0;
  // The FIRST money figure, with its range and its sign — not every number in
  // the string. Splitting on every hyphen averaged "€0.4M ex-works at
  // 10,000,000 units/yr" with the VOLUME (€5.2M), read "Net −€0.6M–€1.2M part
  // cost" as a €0.9M saving, and returned NaN for "cost-neutral" (Analyze
  // review, 29 Sept 2026: 3 of 127 live claims). A minus directly before the
  // currency symbol is a sign; a dash between two figures is a range.
  const t = val.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const SYM = '[€£$¥₹]';
  const NUM = '(\\d+(?:\\.\\d+)?)\\s?([kKmM](?![a-zA-Z]))?';
  const re = new RegExp(`(^|[\\s(~:])([-−]\\s?)?${SYM}\\s?${NUM}(?:\\s?(?:[-–—]|to)\\s?([-−]\\s?)?${SYM}?\\s?${NUM})?`);
  let m = re.exec(t);
  // No currency symbol at all: a figure carrying a K/M suffix ("350K–650K").
  if (!m) m = new RegExp(`(^|[\\s(~:])([-−]\\s?)?(\\d+(?:\\.\\d+)?)\\s?([kKmM])(?![a-zA-Z])(?:\\s?(?:[-–—]|to)\\s?([-−]\\s?)?${NUM})?`).exec(t);
  if (!m) return 0;
  const sc = (s) => (!s ? 1 : /k/i.test(s) ? 1e3 : 1e6);
  const aSuf = m[4] || m[7], bSuf = m[7] || m[4];
  const a = parseFloat(m[3]) * sc(aSuf) * (m[2] ? -1 : 1);
  if (m[6] == null) return Number.isFinite(a) ? a : 0;
  const bSign = m[5] ? -1 : m[2] && !m[5] ? -1 : 1;
  const b = parseFloat(m[6]) * sc(bSuf) * bSign;
  const mid = (a + b) / 2;
  return Number.isFinite(mid) ? mid : 0;
}

/**
 * Implementation difficulty → semantic tone. The renderer picks the colour, so
 * a deck and a PDF cannot drift into disagreeing about what "Medium" looks
 * like, and an unrecognised value degrades to the most cautious reading rather
 * than to green.
 */
export function difficultyTone(difficulty) {
  if (difficulty === 'Low') return 'low';
  if (difficulty === 'Medium') return 'medium';
  return 'high';
}

/**
 * Ideas ordered by annual value, richest first. Ties keep their original order
 * so the output is stable, and an idea with no stated value sorts last rather
 * than sorting as zero-and-therefore-equal to a genuine zero.
 */
export function roiRanked(ideas) {
  return (Array.isArray(ideas) ? ideas : [])
    .map((idea, i) => ({ idea, i, value: parseMoney(idea?.costSavingPotential?.annualValue) }))
    .sort((a, b) => (b.value - a.value) || (a.i - b.i))
    .map(x => x.idea);
}

/**
 * Column x-positions from widths: x[i] = ml + sum(widths before i).
 *
 * Replaces a reduce that mis-seeded its accumulator and scrambled every table's
 * column origins — the root cause of text piling up at the left margin. Kept
 * here so that fix has a test rather than a comment.
 */
export function colPositions(widths, ml) {
  const w = Array.isArray(widths) ? widths : [];
  let x = ml;
  return w.map((width) => { const at = x; x += width; return at; });
}

/**
 * Filename-safe: strips the characters Windows and Excel both reject. A system
 * named "BEV / MHEV" otherwise produces a download the browser cannot save.
 */
export function safeFilename(name) {
  return String(name ?? '').replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Totals for a business-case summary. Returns nulls, never zeros, when nothing
 * could be parsed — a portfolio with no stated values is not a portfolio worth
 * nothing, and the difference matters to whoever reads the total.
 */
export function portfolioValue(ideas) {
  const list = Array.isArray(ideas) ? ideas : [];
  const values = list.map(i => parseMoney(i?.costSavingPotential?.annualValue)).filter(v => v > 0);
  return {
    stated: values.length,
    total: list.length,
    annualTotal: values.length ? values.reduce((a, b) => a + b, 0) : null,
    note: values.length === list.length
      ? null
      : `${list.length - values.length} of ${list.length} ideas state no annual value; the total covers only those that do.`,
  };
}

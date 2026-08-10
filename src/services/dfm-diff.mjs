// WHAT CHANGED BETWEEN TWO REVISIONS OF A PART.
//
// Every report this tool produced was a snapshot: here is rev B, here is what is
// wrong with it. The second question a programme asks is never that one — it is
// "did the changes we agreed last month actually work?" — and nothing in the
// tool could answer it. A reviewer had to open two PDFs side by side and diff
// them by eye, which is how a closed finding gets missed and a regression ships.
//
// This is the comparison, and it is pure: two analyses in, a verdict out. No
// database, no HTTP, no PDF. That matters because the interesting cases are the
// awkward ones — a rule that was NOT EVALUATED on rev A and fails on rev B has
// not regressed, it has become measurable, and calling that a new defect would
// be a lie that costs somebody a redesign.
//
// Four states, and the distinction between them is the whole value:
//
//   CLOSED       failed on A, no longer fails on B
//   NEW          fails on B, did not fail on A
//   PERSISTING   fails on both — with the measured values, so "still failing but
//                 halved" reads differently from "still failing, unchanged"
//   NOW VISIBLE  could not be evaluated on A, evaluated on B
//
// A rule that abstained on BOTH is not reported at all. It has no news in it.

const KEY = (f) => String(f?.id ?? '');

// `Number(null)` is 0 and `Number('')` is 0, so the obvious one-liner turns a
// MISSING measurement into a real zero — and a delta computed against it reads
// as a 30 mm improvement that never happened. Absent stays absent.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Every rule the analysis touched, by id, with the state it ended in. */
function indexRules(analysis) {
  const out = new Map();
  for (const r of (Array.isArray(analysis?.results) ? analysis.results : [])) {
    const add = (f, state) => { if (f && KEY(f)) out.set(KEY(f), { ...f, _state: state }); };
    for (const f of (r.findings || [])) add(f, 'fail');
    for (const f of (r.passed || [])) add(f, 'pass');
    for (const f of (r.notEvaluated || [])) add(f, 'not-evaluated');
  }
  return out;
}

const annualOf = (f) => num(f?.cost?.annualDeltaEur) ?? 0;

/**
 * Compare two analyses of the same part.
 *
 * @param {object} before  the earlier analysis (rev A)
 * @param {object} after   the later analysis (rev B)
 * @returns a verdict object; see the shape below.
 */
export function diffAnalyses(before, after) {
  const a = indexRules(before);
  const b = indexRules(after);

  const closed = [];
  const created = [];
  const persisting = [];
  const nowVisible = [];
  const nowBlind = [];

  for (const [id, fb] of b) {
    const fa = a.get(id);
    if (fb._state === 'fail') {
      if (fa?._state === 'fail') {
        const wasN = num(fa.measured);
        const isN = num(fb.measured);
        persisting.push({
          id, title: fb.title, severity: fb.severity, unit: fb.unit,
          thresholdText: fb.thresholdText,
          was: wasN, now: isN,
          // "Moved" only when BOTH numbers exist. A rule whose measure changed
          // shape between builds must not produce a delta computed from a null.
          delta: wasN != null && isN != null ? Math.round((isN - wasN) * 1000) / 1000 : null,
          annualWas: annualOf(fa), annualNow: annualOf(fb),
          severityChanged: fa.severity !== fb.severity ? { from: fa.severity, to: fb.severity } : null,
        });
      } else if (fa?._state === 'not-evaluated' || !fa) {
        // NOT a regression. The rule could not be judged before; it can now.
        // Reporting this as "new defect" would send someone to undo a change
        // that did nothing wrong.
        nowVisible.push({
          id, title: fb.title, severity: fb.severity, measured: num(fb.measured), unit: fb.unit,
          thresholdText: fb.thresholdText, annual: annualOf(fb),
          reason: fa ? (fa.reason || 'not evaluated on the earlier revision')
            : 'this rule did not run on the earlier revision',
        });
      } else {
        created.push({
          id, title: fb.title, severity: fb.severity, measured: num(fb.measured), unit: fb.unit,
          thresholdText: fb.thresholdText, annual: annualOf(fb),
          wasPassing: fa._state === 'pass',
        });
      }
    } else if (fa?._state === 'fail') {
      closed.push({
        id, title: fa.title, severity: fa.severity,
        was: num(fa.measured), now: num(fb.measured), unit: fa.unit,
        thresholdText: fa.thresholdText,
        annualFreed: annualOf(fa),
        // A finding that stopped failing because the rule stopped being
        // measurable has NOT been fixed, and a report that counts it as a win is
        // worse than one that says nothing.
        how: fb._state === 'pass' ? 'now passes' : 'no longer measurable',
      });
    }
  }

  // A rule that failed on A and does not appear on B at all — a different
  // process family was run, most often. Named, because "it went away" is not a
  // result.
  for (const [id, fa] of a) {
    if (fa._state === 'fail' && !b.has(id)) {
      closed.push({
        id, title: fa.title, severity: fa.severity, was: num(fa.measured), now: null,
        unit: fa.unit, thresholdText: fa.thresholdText, annualFreed: annualOf(fa),
        how: 'rule not run on this revision',
      });
    }
    if (fa._state !== 'not-evaluated' && b.get(id)?._state === 'not-evaluated') {
      nowBlind.push({
        id, title: fa.title,
        reason: b.get(id).reason || 'no measurement available on the later revision',
      });
    }
  }

  const sev = (x) => ({ high: 0, medium: 1, low: 2 }[x?.severity] ?? 3);
  closed.sort((x, y) => sev(x) - sev(y));
  created.sort((x, y) => sev(x) - sev(y));
  persisting.sort((x, y) => sev(x) - sev(y));

  const scoreOf = (an) => {
    const scored = (an?.results || []).filter((r) => r.score != null);
    return scored.length ? scored[0].score : null;
  };
  const annualOfAnalysis = (an) => (an?.results || []).reduce((s, r) => s + (num(r.impact?.annualEur) || 0), 0);

  const beforeAnnual = annualOfAnalysis(before);
  const afterAnnual = annualOfAnalysis(after);

  // Genuinely closed money: what a fixed finding used to be worth. The
  // whole-analysis totals move for reasons that have nothing to do with the
  // redesign — a different route, a changed volume — so they are reported
  // SEPARATELY rather than blended into one flattering number.
  const closedValue = closed.filter((c) => c.how === 'now passes')
    .reduce((s, c) => s + c.annualFreed, 0);
  const createdValue = created.reduce((s, c) => s + c.annual, 0);

  return {
    closed,
    created,
    persisting,
    nowVisible,
    nowBlind,
    counts: {
      closed: closed.length,
      created: created.length,
      persisting: persisting.length,
      nowVisible: nowVisible.length,
      nowBlind: nowBlind.length,
    },
    score: { before: scoreOf(before), after: scoreOf(after) },
    money: {
      closedAnnualEur: Math.round(closedValue),
      createdAnnualEur: Math.round(createdValue),
      pricedBeforeEur: Math.round(beforeAnnual),
      pricedAfterEur: Math.round(afterAnnual),
    },
    // A one-line answer, because that is what gets read out in the meeting.
    headline: headlineOf(closed, created, persisting, nowVisible, closedValue, createdValue),
  };
}

function headlineOf(closed, created, persisting, nowVisible, closedValue, createdValue) {
  const fixed = closed.filter((c) => c.how === 'now passes').length;
  const bits = [];
  bits.push(fixed === 1 ? '1 finding closed' : `${fixed} findings closed`);
  if (created.length) bits.push(`${created.length} new`);
  // Newly-VISIBLE failures belong in the headline too. They are not regressions,
  // but a reader who sees "1 closed, 1 still open" and is not told that two more
  // rules started failing the moment they became measurable has been misled by
  // omission.
  if (nowVisible.length) bits.push(`${nowVisible.length} newly visible`);
  if (persisting.length) bits.push(`${persisting.length} still open`);
  const net = closedValue - createdValue;
  if (net !== 0) {
    bits.push(`${net > 0 ? 'freed' : 'added'} EUR ${Math.abs(Math.round(net)).toLocaleString('en-GB')}/yr`);
  }
  return bits.join(', ');
}

/**
 * Can these two analyses honestly be compared?
 *
 * A diff between a die-cast bracket and a stamped one is arithmetic that means
 * nothing — different rule families, different thresholds, different physics —
 * and printing it would be the tool's most confident lie. So the mismatch is
 * NAMED and the caller decides, rather than silently producing a table.
 */
export function comparability(before, after) {
  const warnings = [];
  const famOf = (an) => (an?.results || []).filter((r) => r.ruleCount > 0).map((r) => r.process).sort().join(',');
  if (famOf(before) !== famOf(after)) {
    warnings.push('The two revisions were judged by DIFFERENT rule families, so a rule missing from one '
      + 'side has not been fixed — it was never asked. Findings are matched by rule id and the unmatched '
      + 'ones are listed as such.');
  }
  const matOf = (an) => an?.subject?.material || an?.material || null;
  if (matOf(before) && matOf(after) && matOf(before) !== matOf(after)) {
    warnings.push(`The material changed (${matOf(before)} -> ${matOf(after)}). Thresholds move with the `
      + 'alloy, so a finding can close or open without the geometry changing at all.');
  }
  const nameOf = (an) => (an?.partName || an?.fileName || '').toLowerCase();
  if (nameOf(before) && nameOf(after) && nameOf(before) !== nameOf(after)) {
    warnings.push(`The part name differs ("${before.partName || before.fileName}" vs `
      + `"${after.partName || after.fileName}"). Check these are two revisions of the same part.`);
  }
  return warnings;
}

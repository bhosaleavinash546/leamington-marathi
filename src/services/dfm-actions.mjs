// FROM FINDINGS TO A LIST SOMEBODY CAN RUN A PROGRAMME ON.
//
// The report said what is wrong and what it costs, and stopped. Nobody leaves a
// design review with "41.2% of the wall area is under-drafted"; they leave with
// "Tooling to confirm slide cost by Friday, Design to add 1.5 deg". The gap
// between those two sentences is where a DFM tool either becomes part of how a
// company works or stays a document that gets forwarded and forgotten.
//
// Two disciplines hold here, and they are the reason this is a module and not a
// paragraph of prose in the exporter:
//
//   1. THE ACTION IS THE ENGINE'S OWN FIX TEXT. Nothing is invented. Each rule
//      already carries the change that clears it, written by whoever wrote the
//      rule; this restates it as an instruction, it does not author it.
//   2. THE OWNER IS A ROLE, NEVER A NAME. The tool does not know who works
//      here. It knows that a slide is a toolmaker's problem and a wall
//      thickness is a designer's, because that follows from what has to change.
//      The person goes in a column the report leaves BLANK for a human to fill.
//
// A row whose decision the engines cannot settle says so, rather than inventing
// a due date or a confidence.

/**
 * Who has to move, derived from WHAT HAS TO CHANGE.
 *
 * Keyed on the rule's measure rather than its id, so a new rule written against
 * an existing measure inherits the right owner instead of silently falling to
 * the default. Ordered most-specific first.
 */
const OWNER_BY_MEASURE = {
  // The die or the press tool has to change; the part may not need to.
  undercutFaceCount: 'Tooling / diemaker',
  wallAreaBelowDraftPct: 'Design + Tooling',
  // Cutter access is a process-planning question before it is a design one.
  unreachableAreaPct: 'Manufacturing engineering',
  setupCount: 'Manufacturing engineering',
  // What the model itself has to become.
  wallP5Mm: 'Design engineering',
  wallP50Mm: 'Design engineering',
  wallSpreadRatio: 'Design engineering',
  minInternalCornerRadiusMm: 'Design engineering',
  maxPocketDepthToWidth: 'Design engineering',
  maxRibThicknessToWall: 'Design engineering',
  minRibThicknessToWall: 'Design engineering',
  maxRibHeightToWall: 'Design engineering',
  // A tolerance is a specification decision, and quality owns half of it.
  tightestToleranceMm: 'Design + Quality',
  // Sheet-metal geometry is settled between design and the press shop.
  minBendRadiusToThickness: 'Design + Press shop',
  minBendToBendToThickness: 'Design + Press shop',
  minFlangeToThickness: 'Design + Press shop',
  holeToBendClearanceMm: 'Design + Press shop',
  minHoleToHoleToThickness: 'Design + Press shop',
  minHoleToEdgeToThickness: 'Design + Press shop',
  minApertureToThickness: 'Design + Press shop',
  minHoleDiaToThickness: 'Design + Press shop',
};

/** Everything hole-shaped: drilled, cored or cast, the change is a feature size. */
const HOLE_ISH = /Hole|Boss/;

function ownerFor(finding) {
  const m = String(finding.measure || '');
  if (OWNER_BY_MEASURE[m]) return OWNER_BY_MEASURE[m];
  if (HOLE_ISH.test(m)) return 'Design engineering';
  // NOT "unknown" dressed as an answer. A measure nobody has classified goes to
  // the person who runs the analysis, which is at least true.
  return 'Cost engineering';
}

/**
 * What the meeting has to settle for this row.
 *
 * Driven by what the ENGINES could and could not price, because that is exactly
 * the boundary between "approve this change" and "go and find out".
 */
function decisionFor(finding) {
  const c = finding.cost || {};
  if (c.priced && c.upperBound) {
    return 'Confirm the full change is achievable — the saving assumes the most aggressive version of it';
  }
  if (c.priced) return 'Approve the change, or state why the geometry has to stay';
  if (c.externalGuideline) return 'Get a quote: the engines do not price this, only cited literature does';
  if (c.reason) return `Decide without a price — ${String(c.reason).replace(/\.$/, '')}`;
  return 'Decide whether to change the geometry or accept the risk';
}

/** `wall 30 mm -> 3.5 mm`, when the engine costed a specific change. */
function changeFor(finding) {
  const c = finding.cost || {};
  if (c.changeDescription) return c.changeDescription;
  const measured = finding.measured;
  if (measured !== null && measured !== undefined && finding.thresholdText) {
    return `${measured}${finding.unit ? ` ${finding.unit}` : ''} -> ${finding.thresholdText}`;
  }
  return finding.thresholdText || '';
}

const SEV_RANK = { high: 0, medium: 1, low: 2 };

/**
 * The action list for an analysis.
 *
 * @param {object} analysis
 * @param {object} [opts] `{ max }` — rows to return; the rest stay in the
 *        findings table, and the caller is told how many were left out.
 * @returns {{ rows: Array, omitted: number, byOwner: Array }}
 */
export function buildActions(analysis, opts = {}) {
  const max = Number.isFinite(opts.max) ? opts.max : 12;
  const findings = (Array.isArray(analysis?.results) ? analysis.results : [])
    .flatMap((r) => (Array.isArray(r.findings) ? r.findings : []))
    .filter((f) => f && f.status !== 'pass' && f.status !== 'not-evaluated');

  const ordered = [...findings].sort((a, b) => (
    (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3)
    || (Number(b.cost?.annualDeltaEur) || 0) - (Number(a.cost?.annualDeltaEur) || 0)
    || String(a.id).localeCompare(String(b.id))
  ));

  const rows = ordered.slice(0, max).map((f, i) => ({
    n: i + 1,
    ruleId: f.id,
    severity: f.severity,
    finding: f.title,
    // The engine's own fix text, trimmed to the instruction. The rules write
    // multi-sentence rationale; the first sentence is the action and the rest is
    // the argument for it, which belongs on the finding's own page.
    action: firstSentence(f.fix) || 'No change text is attached to this rule.',
    change: changeFor(f),
    owner: ownerFor(f),
    decision: decisionFor(f),
    // Blank on purpose. A due date this tool invented would be the least
    // credible column in the document.
    due: '',
    annualEur: Number.isFinite(Number(f.cost?.annualDeltaEur)) ? Number(f.cost.annualDeltaEur) : null,
  }));

  const byOwner = [...rows.reduce((m, r) => {
    const cur = m.get(r.owner) || { owner: r.owner, actions: 0, annualEur: 0, high: 0 };
    cur.actions++;
    cur.annualEur += r.annualEur || 0;
    if (r.severity === 'high') cur.high++;
    return m.set(r.owner, cur);
  }, new Map()).values()].sort((a, b) => b.high - a.high || b.annualEur - a.annualEur);

  return { rows, omitted: Math.max(0, ordered.length - rows.length), byOwner };
}

/** The instruction, without the essay that justifies it. */
function firstSentence(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  // Split on a full stop followed by a space and a capital, so "2.0-3.5 mm" and
  // "e.g." survive intact — a naive split on '.' cut every threshold in half.
  const m = t.match(/^(.+?[.!?])\s+[A-Z]/);
  return (m ? m[1] : t).trim();
}

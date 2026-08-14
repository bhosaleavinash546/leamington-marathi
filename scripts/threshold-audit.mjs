// THE MEASUREMENT-DEBT REPORT FOR THE RULE CATALOGUE.
//
// Every dimension this tool reports is measured from the customer's own file and
// is reproducible. Every GUIDELINE those dimensions are compared against is
// somebody's claim, and the catalogue grades those claims — but a grade is a
// statement ABOUT a citation, not a record that anybody checked it. Until this
// existed, "109 rules rest on industry consensus" was a sentence in the report
// appendix that no process could act on: you could not list them, rank them, or
// tell which had been looked at.
//
// This turns that into a register you can work through. It reads the catalogue
// and docs/threshold-audit.json and prints, worst first, WHICH thresholds are
// unverified — because a number is only as good as the document behind it, and
// this is the single biggest gap between this tool and Boothroyd Dewhurst.
//
//   node scripts/threshold-audit.mjs [--json] [--family hpdc] [--todo]
//
// It is a MEASUREMENT, not a gate. There is no pass mark, because "how much of
// the catalogue has been audited" has an answer rather than a target, and the
// answer is the work list.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DFM_RULES, PROCESS_FAMILIES } from '../dfm-rule-catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = join(ROOT, 'docs', 'threshold-audit.json');
const AS_JSON = process.argv.includes('--json');
const TODO_ONLY = process.argv.includes('--todo');
const FAMILY = (() => {
  const i = process.argv.indexOf('--family');
  return i > 0 ? process.argv[i + 1] : null;
})();

const register = existsSync(REGISTER)
  ? (JSON.parse(readFileSync(REGISTER, 'utf-8')).thresholds || {})
  : {};

// A rule absent from the register is NOT-REVIEWED. Defaulting to anything else
// would be the same fault as scoring an unevaluated rule as a pass.
const statusOf = (id) => register[id]?.status || 'not-reviewed';

// WHAT THE CATALOGUE ITSELF CLAIMS, read from the rule's own source text.
//
// This is a different axis from the register and the two were being conflated —
// including, in the August 2026 audit, by the auditor. The register answers
// "has a curator independently re-verified this?"; absence there says nothing
// about whether the threshold is sourced. This answers "what does the citation
// actually say?", which is the engineering question. Reporting only the first
// and calling it "unaudited citations" produced a finding that was wrong by an
// order of magnitude.
function citationOf(rule) {
  const t = String(rule.source ?? '').replace(/\s+/g, ' ');
  if (!t.trim()) return 'no-citation';
  if (/not been read first-hand|has NOT been read|not read first-hand/i.test(t)) return 'named-not-read';
  if (/READ FIRST-HAND|read first-hand/i.test(t)) return 'read-first-hand';
  if (/NADCA|SFSA|ISO\s*8062|DIN\s*16742|ISO\s*2768|ISO\s*286\b|#402|ASTM|VDI|SAE/i.test(t)) return 'names-standard';
  return 'stated-guidance';
}

const STATUS_RANK = { contested: 0, 'not-reviewed': 1, 'search-corroborated': 2, 'primary-read': 3 };

/**
 * How much a wrong threshold here would cost.
 *
 * Not a money figure — the catalogue has none — but an honest ranking: a rule
 * that many families share, judging a measure many parts have, matters more
 * than one written for a single exotic process. `standard-named` outranks
 * `industry-consensus` because a wrong claim of standing is worse than an
 * admitted one: the report tells a reader to trust it more.
 */
function exposureOf(rule, sharedByMeasure) {
  const shared = sharedByMeasure.get(rule.measure) || 1;
  const gradeWeight = rule.sourceStatus === 'standard-named' ? 3
    : rule.sourceStatus === 'industry-consensus' ? 2
      : 1;
  return shared * gradeWeight;
}

const sharedByMeasure = new Map();
for (const r of DFM_RULES) sharedByMeasure.set(r.measure, (sharedByMeasure.get(r.measure) || 0) + 1);

const rows = DFM_RULES
  .filter((r) => !FAMILY || r.family === FAMILY || r.process === FAMILY)
  .map((r) => ({
    id: r.id,
    family: r.family || r.process || '—',
    measure: r.measure,
    grade: r.sourceStatus || 'industry-consensus',
    status: statusOf(r.id),
    exposure: exposureOf(r, sharedByMeasure),
    source: r.source || '',
    note: register[r.id]?.finding || '',
    recommendation: register[r.id]?.recommendation || '',
    corroboration: register[r.id]?.corroboration || [],
    primaryRead: register[r.id]?.primaryDocumentRead === true,
    citation: citationOf(r),
  }))
  .sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (b.exposure - a.exposure)
    || a.id.localeCompare(b.id));

const byStatus = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
const byGrade = rows.reduce((m, r) => { m[r.grade] = (m[r.grade] || 0) + 1; return m; }, {});

// The claim the report makes on its appendix page, checked against reality.
const claimsStandard = rows.filter((r) => r.grade === 'standard-named');
// The rules whose OWN CITATION admits the document was not read. This used to
// be `!r.primaryRead`, i.e. "absent from the register", which counted 27 rules
// as unread standards when the catalogue records 36 of them as read first-hand.
// That single wrong predicate produced the audit's most incorrect finding.
const standardsNotRead = claimsStandard.filter((r) => r.citation === 'named-not-read');

// The catalogue says it read the document; the register has not recorded it.
// Neither side is wrong on its own — this is bookkeeping drift, and nothing
// used to surface it.
const registerBehindCatalogue = rows.filter(
  (r) => r.citation === 'read-first-hand' && r.status !== 'primary-read',
);
const byCitation = rows.reduce((m, r) => { m[r.citation] = (m[r.citation] || 0) + 1; return m; }, {});

const report = {
  catalogue: { rules: DFM_RULES.length, families: Object.keys(PROCESS_FAMILIES).length },
  scope: FAMILY ? { family: FAMILY, rules: rows.length } : { rules: rows.length },
  byStatus,
  byGrade,
  auditedPct: Math.round((100 * (rows.length - (byStatus.unaudited || 0))) / (rows.length || 1)),
  primaryReadPct: Math.round((100 * rows.filter((r) => r.primaryRead).length) / (rows.length || 1)),
  standardsClaimedButNotRead: standardsNotRead.length,
  byCitation,
  registerBehindCatalogue: registerBehindCatalogue.length,
  contested: rows.filter((r) => r.status === 'contested'),
  worstFirst: rows.slice(0, 25),
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 1));
} else {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log('\n  ─────────────────────────────────────────────────────────────────────────');
  console.log('  THRESHOLD AUDIT\n');
  console.log(`  ${report.scope.rules} rules${FAMILY ? ` in ${FAMILY}` : ''} across `
    + `${report.catalogue.families} families\n`);
  for (const [k, v] of Object.entries(byStatus).sort((a, b) => STATUS_RANK[a[0]] - STATUS_RANK[b[0]])) {
    console.log(`    ${pad(k, 22)} ${String(v).padStart(4)}`);
  }
  // TWO SEPARATE AXES. Printing only the register's view invites the reader to
  // conclude the thresholds are unsourced, which is a different and much more
  // serious claim. The August 2026 audit drew exactly that conclusion.
  console.log('\n  WHAT THE CITATIONS SAY  (the engineering position)');
  const CIT_LABEL = {
    'read-first-hand': 'primary document read first-hand',
    'names-standard': 'names a standard, reading unclear',
    'named-not-read': 'names a standard, NOT read — the real debt',
    'stated-guidance': 'stated as industry consensus / guidance',
    'no-citation': 'no source text at all',
  };
  for (const [k, label] of Object.entries(CIT_LABEL)) {
    if (byCitation[k]) console.log(`    ${pad(label, 44)} ${String(byCitation[k]).padStart(4)}`);
  }
  console.log('\n  WHAT THE REGISTER SAYS  (the independent-review trail)');
  console.log(`    ${pad('rules a curator has reviewed', 44)} ${String(rows.length - (byStatus['not-reviewed'] || 0)).padStart(4)}`);
  console.log(`    ${pad('not yet reviewed', 44)} ${String(byStatus['not-reviewed'] || 0).padStart(4)}`);
  console.log('\n  Not-reviewed is a GAP IN THE AUDIT TRAIL, not a claim that the');
  console.log('  threshold is unsourced. Read the citation block above for that.');

  if (registerBehindCatalogue.length) {
    console.log(`\n  ${registerBehindCatalogue.length} rules cite a document read first-hand but the register has`);
    console.log('  not recorded it. Bookkeeping drift — backfill rather than re-read.');
  }

  if (standardsNotRead.length) {
    console.log(`\n  ${standardsNotRead.length} rules CLAIM A NAMED STANDARD that nobody has read first-hand.`);
    console.log('  These are the most exposed in the catalogue: the report tells a reader to');
    console.log('  trust them more than the rest, on a citation nobody has opened.');
    for (const r of standardsNotRead.slice(0, 10)) {
      console.log(`    ${pad(r.id, 34)} ${r.source.slice(0, 60)}`);
    }
    if (standardsNotRead.length > 10) console.log(`    ... and ${standardsNotRead.length - 10} more`);
  }

  if (report.contested.length) {
    console.log('\n  CONTESTED — sources disagree, or the standard does not say what the rule claims:');
    for (const r of report.contested) {
      console.log(`\n    ${r.id}  (${r.family})`);
      console.log(`      ${r.note}`);
      if (r.recommendation) console.log(`      -> ${r.recommendation}`);
    }
  }

  if (!TODO_ONLY) {
    console.log('\n  WORK LIST, most exposed first:');
    console.log(`    ${pad('rule', 34)} ${pad('family', 16)} ${pad('status', 20)} exp`);
    for (const r of report.worstFirst) {
      console.log(`    ${pad(r.id, 34)} ${pad(r.family, 16)} ${pad(r.status, 20)} ${String(r.exposure).padStart(3)}`);
    }
  }
  console.log('\n  ─────────────────────────────────────────────────────────────────────────\n');
}

// ── Ratchets ────────────────────────────────────────────────────────────────
// Three separate gates, because the three numbers mean different things and a
// single "--max-unaudited" conflated them. The original flag counted rules
// absent from the register and called it citation debt; after the citation axis
// was added it silently began reading a different field and gating on 3 instead
// of 212 — loose enough to catch nothing. Named flags, one per axis.
//
//   --max-unread-standards N   rules whose citation admits the document was
//                              not read. THE REAL DEBT. Today: 2.
//   --max-register-drift N     rules the catalogue says were read first-hand
//                              that the register has not recorded. Bookkeeping.
//   --max-unreviewed N         rules no curator has reviewed. An audit-trail
//                              gap, NOT a claim the threshold is unsourced.
const gate = (flag, actual, label) => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return false;
  const limit = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(limit)) {
    console.error(`  ✗ ${flag} needs a number.`);
    return true;
  }
  if (actual > limit) {
    console.error(`\n  ✗ FAIL: ${actual} ${label} exceeds the allowed ${limit}.`);
    return true;
  }
  console.log(`  ✓ ${label}: ${actual}, within the allowed ${limit}`);
  return false;
};

const failed = [
  gate('--max-unread-standards', standardsNotRead.length, 'rules citing an unread standard'),
  gate('--max-register-drift', registerBehindCatalogue.length, 'rules read but not registered'),
  gate('--max-unreviewed', byStatus['not-reviewed'] || 0, 'rules not yet curator-reviewed'),
].some(Boolean);
if (failed) { console.error(''); process.exit(1); }

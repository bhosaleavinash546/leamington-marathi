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

// A rule absent from the register is UNAUDITED. Defaulting to anything else
// would be the same fault as scoring an unevaluated rule as a pass.
const statusOf = (id) => register[id]?.status || 'unaudited';

const STATUS_RANK = { contested: 0, unaudited: 1, 'search-corroborated': 2, 'primary-read': 3 };

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
  }))
  .sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (b.exposure - a.exposure)
    || a.id.localeCompare(b.id));

const byStatus = rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});
const byGrade = rows.reduce((m, r) => { m[r.grade] = (m[r.grade] || 0) + 1; return m; }, {});

// The claim the report makes on its appendix page, checked against reality.
const claimsStandard = rows.filter((r) => r.grade === 'standard-named');
const standardsNotRead = claimsStandard.filter((r) => !r.primaryRead);

const report = {
  catalogue: { rules: DFM_RULES.length, families: Object.keys(PROCESS_FAMILIES).length },
  scope: FAMILY ? { family: FAMILY, rules: rows.length } : { rules: rows.length },
  byStatus,
  byGrade,
  auditedPct: Math.round((100 * (rows.length - (byStatus.unaudited || 0))) / (rows.length || 1)),
  primaryReadPct: Math.round((100 * rows.filter((r) => r.primaryRead).length) / (rows.length || 1)),
  standardsClaimedButNotRead: standardsNotRead.length,
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
  console.log(`\n  audited at all        ${String(report.auditedPct).padStart(3)}%`);
  console.log(`  primary document read ${String(report.primaryReadPct).padStart(3)}%   <- the only number that retires the debt`);

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

// ── Ratchet ─────────────────────────────────────────────────────────────────
// `--max-unaudited N` exits 1 when the unaudited count exceeds N. Wired into CI
// so the citation debt can only shrink: adding a rule with a fresh unread
// citation now fails the build unless another is retired in the same change.
//
// It is deliberately a ceiling on the COUNT rather than a demand for zero. The
// debt is 212 rules across four standards documents nobody on the team has read
// first-hand; the honest position is to stop it growing while it is worked down,
// not to pretend it can be cleared in one pass.
const maxUnaudited = process.argv.indexOf('--max-unaudited');
if (maxUnaudited !== -1) {
  const limit = parseInt(process.argv[maxUnaudited + 1], 10);
  const n = report.counts?.unaudited ?? report.byStatus?.unaudited ?? null;
  if (n == null) {
    console.error('  ✗ threshold-audit: could not read the unaudited count — ratchet cannot be enforced.');
    process.exit(1);
  }
  if (n > limit) {
    console.error(`\n  ✗ FAIL: ${n} unaudited rules exceeds the allowed ${limit}.`);
    console.error('    A new threshold was added citing a source nobody has read, or an audited one regressed.');
    console.error('    Retire one before adding one, or read the primary document.\n');
    process.exit(1);
  }
  console.log(`  ✓ citation debt ratchet: ${n} unaudited, within the allowed ${limit}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// What actually needs doing about the rule catalogue's sources, in order.
//
//   node scripts/citation-worklist.mjs
//
// threshold-audit.mjs reports two separate axes. This turns them into a work
// list, and the ORDER matters because the three piles need different actions
// and only one of them is real engineering debt:
//
//   1. UNREAD STANDARDS — the citation names a document and admits nobody read
//      it. Genuine debt. Read the document, or demote the grade.
//   2. REGISTER DRIFT — the catalogue records reading the primary document and
//      the curation register never recorded it. Bookkeeping: backfill the
//      register entry, do not re-read anything.
//   3. NOT CURATOR-REVIEWED — no independent second look. An audit-trail gap,
//      not a claim the threshold is unsourced.
//
// The first version of this script conflated 2 with 3 and told the reader that
// buying four standards would settle 22 rules. It would have settled almost
// none: the documents had already been read and encoded, and what was missing
// was register entries. Getting that wrong cost a real ask of a real customer.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(execFileSync('node', [join(root, 'scripts', 'threshold-audit.mjs'), '--json'], { encoding: 'utf8' }));

const rows = report.worstFirst ?? [];
const cit = report.byCitation ?? {};
const total = report.scope?.rules ?? 0;

console.log('\n  CITATION WORK LIST — three piles, three different actions\n  ' + '─'.repeat(74));
console.log(`  ${total} rules · ${cit['read-first-hand'] ?? 0} cite a primary document read first-hand`);
console.log(`  ${cit['stated-guidance'] ?? 0} are stated as industry consensus, which is an honest grade, not debt.\n`);

// ── Pile 1: real debt ───────────────────────────────────────────────────────
const unread = rows.filter(r => r.citation === 'named-not-read');
console.log('  1. UNREAD STANDARDS — the only pile that needs a document');
if (!unread.length && !(cit['named-not-read'] ?? 0)) {
  console.log('     none.\n');
} else {
  console.log(`     ${cit['named-not-read'] ?? unread.length} rule(s). Read the cited document, or drop the grade to`);
  console.log('     industry-consensus and say where the number really came from.');
  for (const r of unread) console.log(`       ${r.id.padEnd(32)} exposure ${String(r.exposure).padStart(3)}`);
  console.log('');
}

// ── Pile 2: bookkeeping ─────────────────────────────────────────────────────
const drift = report.registerBehindCatalogue ?? 0;
console.log('  2. REGISTER DRIFT — bookkeeping, no reading required');
console.log(`     ${drift} rule(s) cite a document read first-hand that the register never`);
console.log('     recorded. Backfill docs/threshold-audit.json from the citation.\n');

// ── Pile 3: audit trail ─────────────────────────────────────────────────────
const unreviewed = rows.filter(r => r.status === 'not-reviewed');
console.log('  3. NOT CURATOR-REVIEWED — an audit-trail gap, not unsourced numbers');
console.log(`     ${report.byStatus?.['not-reviewed'] ?? 0} rule(s) have had no independent second look.`);
if (unreviewed.length) {
  console.log('     Highest-exposure first:');
  for (const r of unreviewed.slice(0, 10)) {
    console.log(`       ${r.id.padEnd(32)} ${String(r.citation).padEnd(16)} exposure ${String(r.exposure).padStart(3)}`);
  }
}

console.log('\n  ' + '─'.repeat(74));
console.log('  Only pile 1 needs a standards document. Pile 2 is a text edit. Pile 3 is');
console.log('  review effort, and the citation column tells you what each rule already');
console.log('  rests on before you spend any of it.\n');

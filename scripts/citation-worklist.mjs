// ─────────────────────────────────────────────────────────────────────────────
// Citation-debt triage: WHICH DOCUMENT retires the most rules.
//
//   node scripts/citation-worklist.mjs
//
// threshold-audit.mjs answers "how bad is it" (212 unaudited of 248, 6% read
// first-hand). This answers the question that actually gets it fixed: if you
// can only obtain three standards, which three, and what do they buy you.
//
// The debt is not spread evenly — it clusters onto a handful of documents,
// because the catalogue was built family by family. Grouping by the cited
// document turns 212 individual chores into a small number of sittings, each of
// which is "read this one standard, then settle these N rules".
//
// Rules are ordered inside each group by the exposure score threshold-audit
// already computes, so the most load-bearing threshold in each document is the
// first one to check.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(execFileSync('node', [join(root, 'scripts', 'threshold-audit.mjs'), '--json'], { encoding: 'utf8' }));

// Which standards body / document does a source string point at? Deliberately
// coarse: the aim is "go and get this document", not a citation parser.
const DOCS = [
  [/ISO\s*8062[-\s]*4/i, 'ISO 8062-4 (castings — geometrical tolerances)'],
  [/ISO\s*8062/i, 'ISO 8062 (other parts)'],
  [/NADCA/i, 'NADCA product standards (P / S / F series)'],
  [/SFSA/i, 'SFSA steel casting handbook + supplements'],
  [/DIN\s*16742/i, 'DIN 16742 (plastics mouldings tolerances)'],
  [/ISO\s*2768/i, 'ISO 2768 (general tolerances)'],
  [/ISO\s*286|IT\s*grade/i, 'ISO 286 (IT grades)'],
];
const docOf = (src) => (DOCS.find(([re]) => re.test(src || ''))?.[1]) ?? null;

// worstFirst carries the full rule records, already ordered by exposure.
// standardsClaimedButNotRead is only a count, so the rules are taken from here.
const unread = (report.worstFirst ?? []).filter(r => r.status === 'unaudited');

const groups = new Map();
for (const r of unread) {
  const doc = docOf(r.source) ?? 'Un-attributed — no named document to fetch';
  if (!groups.has(doc)) groups.set(doc, []);
  groups.get(doc).push(r);
}
const ordered = [...groups.entries()]
  .map(([doc, rules]) => ({ doc, rules: rules.sort((a, b) => b.exposure - a.exposure) }))
  .sort((a, b) => b.rules.length - a.rules.length);

console.log('\n  CITATION WORKLIST — one document at a time\n  ' + '─'.repeat(74));
console.log(`  ${report.byStatus.unaudited} unaudited of ${report.scope.rules} rules · ${report.primaryReadPct}% read first-hand`);
console.log(`  ${report.standardsClaimedButNotRead} of them cite a NAMED standard nobody has opened.`);
console.log(`  Grouping the ${unread.length} HIGHEST-EXPOSURE unaudited rules — the ones whose`);
console.log('  thresholds carry the most weight. Re-run after each sitting for the next batch.\n');

let cum = 0;
for (const { doc, rules } of ordered) {
  cum += rules.length;
  console.log(`  ${doc}`);
  console.log(`    ${rules.length} rule(s) — cumulative ${cum}/${unread.length}`);
  for (const r of rules.slice(0, 6)) {
    console.log(`      ${r.id.padEnd(34)} exposure ${String(r.exposure).padStart(3)}`);
  }
  if (rules.length > 6) console.log(`      … and ${rules.length - 6} more`);
  console.log('');
}

const top3 = ordered.slice(0, 3).reduce((s, g) => s + g.rules.length, 0);
console.log('  ' + '─'.repeat(74));
const unattributed = groups.get('Un-attributed — no named document to fetch')?.length ?? 0;
console.log(`  Top ${Math.min(3, ordered.length)} group(s) cover ${top3} of these ${unread.length} rules.`);
if (unattributed > unread.length / 2) {
  console.log(`\n  READ THIS FIRST: ${unattributed} of ${unread.length} cite NO named document at all.`);
  console.log('  That is the harder debt. A mis-attributed threshold can be checked against');
  console.log('  the standard; an un-attributed one has nothing to check against, and the');
  console.log('  honest options are to source a citation or to drop the rule to a stated');
  console.log('  engine-derived heuristic. Buying standards will not touch these.');
}
console.log('\n  Mark each rule primary-read or contested as you go — the CI ratchet');
console.log('  (--max-unaudited) then locks the gain in.\n');

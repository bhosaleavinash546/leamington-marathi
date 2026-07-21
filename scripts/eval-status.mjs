// ─────────────────────────────────────────────────────────────────────────────
// Measurement-debt report: which accuracy gates and LLM evals have recorded
// results, how old they are, and what has NEVER been measured. The house rule
// is "no asserted improvements" — this script makes it visible when we are
// living on assertions. Always exits 0; it informs, the gates enforce.
//
//   npm run eval:status
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BENCH = join(dirname(fileURLToPath(import.meta.url)), '..', 'benchmark');
const age = (p) => {
  const days = (Date.now() - statSync(p).mtimeMs) / 86_400_000;
  return days < 1 ? 'today' : `${Math.round(days)}d ago`;
};
const row = (label, detail) => console.log(`  ${label.padEnd(34)} ${detail}`);

console.log('\nDeterministic accuracy gates (CI-enforced):');
const mape = (rows, k) => rows?.length ? (rows.reduce((s, r) => s + Math.abs(r[k]), 0) / rows.length * 100).toFixed(1) : '?';
for (const [label, file, pick] of [
  ['Should-cost vs reference parts', 'cost-results.json', r => `hit ${r.hitRate}% · MAPE ${r.mape}% (${r.hits}/${r.total})`],
  ['CAD process inference', 'results.json', () => 'recorded'],
  ['PCB engine v2 vs v1', 'pcb-results.json', r => `v2 MAPE ${mape(r.rows, 'v2Err')}% vs v1 ${mape(r.rows, 'v1Err')}%`],
  ['Feature-based stamping', 'stamping-results.json', () => 'recorded'],
]) {
  try {
    const p = join(BENCH, file);
    const r = JSON.parse(readFileSync(p, 'utf8'));
    let detail; try { detail = pick(r); } catch { detail = 'recorded'; }
    row(label, `OK   ${detail} · ${age(p)}`);
  } catch { row(label, 'MISSING — run the benchmark'); }
}

console.log('\nLLM-layer evals (cost tokens; need ANTHROPIC_API_KEY):');
const ideation = readdirSync(BENCH).filter(f => /^ideation-results-.*\.json$/.test(f));
if (ideation.length === 0) {
  row('Ideation eval', 'NEVER RUN — every generation upgrade since Phase 1 is UNMEASURED.');
  console.log('    → ANTHROPIC_API_KEY=… node benchmark/ideation-eval.mjs --label baseline --legacy');
  console.log('    → ANTHROPIC_API_KEY=… node benchmark/ideation-eval.mjs --label current');
  console.log('    → node benchmark/ideation-eval.mjs --compare baseline current');
} else {
  for (const f of ideation) {
    const p = join(BENCH, f);
    try {
      const r = JSON.parse(readFileSync(p, 'utf8'));
      row(`Ideation "${r.label}"`, `diversity ${r.summary?.diversityScore ?? '?'} · ${r.summary?.meanIdeas ?? '?'} ideas/part · ${age(p)}`);
    } catch { row(f, 'unreadable'); }
  }
  if (!ideation.some(f => f.includes('baseline'))) row('Ideation baseline (--legacy arm)', 'MISSING — A/B has no reference point');
}
try { row('llm-eval (process metrics)', `recorded · ${age(join(BENCH, 'llm-eval-results.json'))}`); }
catch { row('llm-eval (process metrics)', 'never run'); }
console.log('');

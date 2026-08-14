// ─────────────────────────────────────────────────────────────────────────────
// How much of a metric change is real, and how much is the model being random?
//
//   node benchmark/ideation-variance.mjs current-r1 current-r2 -- legacy-r1
//
// Labels before `--` are repeats of one arm; labels after are the other arm.
// With repeats of the SAME configuration you can see the run-to-run spread, and
// only a between-arm gap that clears it means anything.
//
// This exists because the audit nearly shipped a false claim. A two-part
// partial run showed the engine-check rate at 46.4% against a legacy arm's
// 15.4%, which read as proof the generation upgrades had tripled verifiability.
// Re-running the identical configuration on the identical parts returned 20%.
// The metric swings by more than 2x on the same input, and nothing in the
// harness said so — it reported a single number per arm as though it were a
// measurement rather than one draw.
//
// The repo's own rule is "no asserted improvements". A single run per arm
// cannot support one.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pathFor = (label) => join(ROOT, 'benchmark', `ideation-results-${label}.json`);

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const armA = (sep === -1 ? argv : argv.slice(0, sep)).filter(Boolean);
const armB = sep === -1 ? [] : argv.slice(sep + 1).filter(Boolean);

if (!armA.length) {
  console.error('usage: ideation-variance.mjs <labelA1> [labelA2 …] [-- <labelB1> [labelB2 …]]');
  process.exit(1);
}

const METRICS = [
  ['engineCheckRate', 'up'], ['diversityScore', 'up'], ['corpusNoveltyRate', 'up'],
  ['evidenceRate', 'up'], ['contradictedRate', 'down'], ['dupRate', 'down'],
  ['flagRate', 'down'], ['meanIdeas', 'up'],
];

function load(labels, armName) {
  const runs = [];
  for (const l of labels) {
    if (!existsSync(pathFor(l))) { console.error(`  ! ${armName}: no results for "${l}" — skipped`); continue; }
    const d = JSON.parse(readFileSync(pathFor(l), 'utf8'));
    runs.push({ label: l, summary: d.summary ?? {}, parts: d.summary?.parts ?? null, failed: d.summary?.failed ?? null });
  }
  return runs;
}

const stats = (xs) => {
  const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, mean, min: Math.min(...v), max: Math.max(...v), spread: Math.max(...v) - Math.min(...v) };
};

const A = load(armA, 'arm A');
const B = load(armB, 'arm B');
if (!A.length) { console.error('no usable runs in arm A'); process.exit(1); }

const f = (n) => (n == null ? '  —  ' : n.toFixed(1).padStart(6));

console.log('\n  IDEATION EVAL — run-to-run variance\n  ' + '─'.repeat(78));
for (const [name, runs] of [['arm A', A], ['arm B', B]]) {
  if (!runs.length) continue;
  console.log(`  ${name}: ${runs.map(r => `${r.label}(${r.parts ?? '?'} parts${r.failed ? `, ${r.failed} failed` : ''})`).join('  ')}`);
}
console.log('  ' + '─'.repeat(78));
console.log(`  ${'metric'.padEnd(20)} ${'A mean'.padStart(7)} ${'A range'.padStart(15)} ${'B mean'.padStart(7)} ${'B range'.padStart(15)}  verdict`);
console.log('  ' + '─'.repeat(78));

let anyConclusive = false;
for (const [m] of METRICS) {
  const a = stats(A.map(r => r.summary[m]));
  const b = stats(B.map(r => r.summary[m]));
  if (!a && !b) continue;
  const aRange = a && a.n > 1 ? `${a.min.toFixed(1)}–${a.max.toFixed(1)}` : (a ? 'single run' : '—');
  const bRange = b && b.n > 1 ? `${b.min.toFixed(1)}–${b.max.toFixed(1)}` : (b ? 'single run' : '—');

  let verdict = '';
  if (a && b) {
    const gap = Math.abs(b.mean - a.mean);
    // The widest within-arm spread we have actually observed. A between-arm gap
    // has to clear it before it can be called anything but noise.
    const noise = Math.max(a.spread ?? 0, b.spread ?? 0);
    if (a.n < 2 && b.n < 2) verdict = 'no repeats — cannot separate signal from noise';
    else if (gap > noise) { verdict = `gap ${gap.toFixed(1)} > observed noise ${noise.toFixed(1)} — real`; anyConclusive = true; }
    else verdict = `gap ${gap.toFixed(1)} within noise ${noise.toFixed(1)} — NOT shown`;
  } else if (a && a.n > 1) {
    verdict = `spread ${a.spread.toFixed(1)} across ${a.n} identical runs`;
  }
  console.log(`  ${m.padEnd(20)} ${f(a?.mean)} ${aRange.padStart(15)} ${f(b?.mean)} ${bRange.padStart(15)}  ${verdict}`);
}

console.log('  ' + '─'.repeat(78));
if (!anyConclusive && armB.length) {
  console.log('  No metric shows a between-arm gap larger than the run-to-run spread.');
  console.log('  On this evidence the arms are indistinguishable. That is a result, not a');
  console.log('  failure — it is the result that stops an unsupported improvement claim.\n');
} else if (!armB.length) {
  console.log('  Single arm: this is the noise floor. Any future claim of improvement has');
  console.log('  to clear the spread above before it means anything.\n');
} else {
  console.log('  Metrics marked "real" clear the observed noise. Everything else is a draw.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ideation eval harness — the Phase-0 measurement gate for every idea-
// generation change. Extends llm-eval.mjs (process metrics) with the two
// signals the research says actually matter:
//
//   diversityScore   pairwise BM25/TF cosine across each batch (homogeneity is
//                    the documented failure mode of LLM ideation — Si et al.
//                    2409.04109; Wharton/Nature HB 2025). Deterministic.
//   LLM judge        OPTIONAL (--judge): pairwise batch comparison vs a frozen
//                    baseline on novelty/specificity/strategic fit — order-
//                    randomised, 2-judge, agreement reported. Soft axes ONLY;
//                    cost/feasibility stay with the deterministic engine.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-… node benchmark/ideation-eval.mjs --label baseline --legacy   # arm A: pre-Phase-1 pipeline (BRAINSPARK_IDEATION_MODE=legacy)
//   ANTHROPIC_API_KEY=sk-… node benchmark/ideation-eval.mjs --label phase1              # arm B: current pipeline
//   node benchmark/ideation-eval.mjs --compare baseline phase1                          # offline A/B: metric deltas (incl. nulls/regressions)
//   ANTHROPIC_API_KEY=sk-… node benchmark/ideation-eval.mjs --label phase1 --judge baseline
//
// --legacy runs the SAME build with every Phase-1 upgrade switched off, so
// before/after is a true single-variable A/B rather than a cross-commit guess.
//
// Results land in benchmark/ideation-results-<label>.json. The harness skips
// with exit 0 when no API key is present (CI-safe; it costs real tokens).
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchDiversity } from '../idea-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null; };
const resultsPath = (label) => join(ROOT, 'benchmark', `ideation-results-${label}.json`);

// Same golden set as llm-eval.mjs — spread across commodities.
const GOLDEN = [
  { systemName: 'Chassis & Frame', subassemblyName: 'Front Suspension', partName: 'Front Knuckle / Upright' },
  { systemName: 'BIW Body-in-White', subassemblyName: 'Front End Module', partName: 'Front Bumper Beam' },
  { systemName: 'EV Battery System', subassemblyName: 'Battery Pack & BMS', partName: 'Cell Module Housing' },
  { systemName: 'Electric Drivetrain EDU', subassemblyName: 'E-Motor', partName: 'Stator Assembly' },
  { systemName: 'Interior', subassemblyName: 'Seating', partName: 'Front Seat Frame' },
  { systemName: 'Electrical & Electronics', subassemblyName: 'Wiring', partName: 'Body Wiring Harness' },
];

// Deterministic PRNG for order randomisation — a fixed seed keeps judge runs
// reproducible while still shuffling presentation order per part.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Offline compare mode (no server, no tokens) ──────────────────────────────
const compareIdx = process.argv.indexOf('--compare');
if (compareIdx !== -1) {
  const [la, lb] = [process.argv[compareIdx + 1], process.argv[compareIdx + 2]];
  if (!la || !lb) { console.error('usage: --compare <labelA> <labelB>'); process.exit(1); }
  const A = JSON.parse(readFileSync(resultsPath(la), 'utf8'));
  const B = JSON.parse(readFileSync(resultsPath(lb), 'utf8'));
  console.log(`\nA/B: ${la} → ${lb}\n`);
  const keys = [...new Set([...Object.keys(A.summary), ...Object.keys(B.summary)])].filter(k => typeof A.summary[k] === 'number' || typeof B.summary[k] === 'number');
  for (const k of keys) {
    const a = A.summary[k], b = B.summary[k];
    const delta = (typeof a === 'number' && typeof b === 'number') ? (b - a) : NaN;
    const mark = Number.isNaN(delta) ? ' ' : Math.abs(delta) < 1e-9 ? '=' : delta > 0 ? '↑' : '↓';
    console.log(`${k.padEnd(20)} ${String(a ?? '—').padStart(9)} → ${String(b ?? '—').padStart(9)}   ${mark} ${Number.isNaN(delta) ? '' : delta.toFixed(1)}`);
  }
  console.log('\nDeltas are reported raw — a null result is a result. Direction of "better" depends on the metric (diversity/evidence/engine-check up; dup/contradicted/flag down).');
  process.exit(0);
}

// ── Live run ─────────────────────────────────────────────────────────────────
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.log('ideation-eval: ANTHROPIC_API_KEY not set — skipping (this harness costs real tokens).');
  process.exit(0);
}

const legacy = process.argv.includes('--legacy');
const label = arg('--label') || (existsSync(resultsPath('baseline')) ? 'current' : 'baseline');
const judgeAgainst = arg('--judge');   // label of the frozen baseline to judge against
const PORT = 19300 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}`;

const dataDir = mkdtempSync(join(tmpdir(), 'bs-ideation-'));
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'eval-secret', LOG_LEVEL: 'silent',
    ...(legacy ? { BRAINSPARK_IDEATION_MODE: 'legacy' } : {}),
  },
});
if (legacy) console.log('Running LEGACY arm (pre-Phase-1 pipeline: no positive retrieval, taste, KB detail, diversity directive, dedup, or ranking).');
const cleanup = (code) => { server.kill('SIGKILL'); try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ } process.exit(code); };

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ }
    if (i > 75) throw new Error('server never became healthy');
    await new Promise(r => setTimeout(r, 400));
  }
  const su = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Eval', email: 'ideation-eval@test.local', password: 'eval-pass-123' }),
  });
  const { token } = await su.json();

  const perPart = [];
  for (const g of GOLDEN) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        systemName: g.systemName, subassemblyName: g.subassemblyName, partName: g.partName,
        enableSearch: false,
        config: { apiKey: KEY, vehicleType: 'Premium SUV', annualVolume: 80000, plantRegion: 'germany', currency: 'EUR', programmeLengthYears: 5 },
      }),
    });
    if (!r.ok) { perPart.push({ part: g.partName, error: (await r.json()).error }); continue; }
    const d = await r.json();
    const ideas = d.ideas || [];
    const v = d.validation || {};
    const div = batchDiversity(ideas);
    perPart.push({
      part: g.partName,
      ideas: ideas.length,
      flagged: v.flagged ?? 0,
      dropped: v.dropped ?? 0,
      merged: v.intraBatchMerged ?? 0,
      diversityScore: div.diversityScore,
      nearDupPairs: div.nearDupPairs.length,
      engineChecked: ideas.filter(i => i.engineCheck).length,
      contradicted: ideas.filter(i => i.engineCheck?.direction === 'contradicted').length,
      withEvidence: ideas.filter(i => (i.evidenceSources || []).length > 0).length,
      priorArtDup: ideas.filter(i => i.priorArt).length,
      tasteMatched: ideas.filter(i => i.tasteMatch).length,
      seconds: Math.round((Date.now() - t0) / 1000),
      // Kept for the pairwise judge: title + description are what soft axes read.
      ideaDigest: ideas.map(i => ({ title: i.title, description: String(i.technicalDescription || '').slice(0, 400) })),
    });
    const p = perPart.at(-1);
    console.log(`${g.partName}: ${p.ideas} ideas · diversity ${p.diversityScore} (${p.nearDupPairs} near-dup pairs, ${p.merged} merged) · ${p.engineChecked} engine-checked · ${p.withEvidence} evidenced · ${p.seconds}s`);
  }

  const ok = perPart.filter(p => !p.error);
  const sum = (k) => ok.reduce((s, p) => s + p[k], 0);
  const mean = (k) => ok.length ? +(ok.reduce((s, p) => s + p[k], 0) / ok.length).toFixed(1) : 0;
  const totalIdeas = sum('ideas') || 1;
  const summary = {
    parts: perPart.length, failed: perPart.length - ok.length,
    meanIdeas: +(totalIdeas / Math.max(ok.length, 1)).toFixed(1),
    diversityScore: mean('diversityScore'),
    nearDupPairs: sum('nearDupPairs'),
    mergedRate: +((sum('merged') / (totalIdeas + sum('merged'))) * 100).toFixed(1),
    flagRate: +((sum('flagged') / totalIdeas) * 100).toFixed(1),
    dropRate: +((sum('dropped') / (totalIdeas + sum('dropped'))) * 100).toFixed(1),
    engineCheckRate: +((sum('engineChecked') / totalIdeas) * 100).toFixed(1),
    contradictedRate: +((sum('contradicted') / Math.max(sum('engineChecked'), 1)) * 100).toFixed(1),
    evidenceRate: +((sum('withEvidence') / totalIdeas) * 100).toFixed(1),
    dupRate: +((sum('priorArtDup') / totalIdeas) * 100).toFixed(1),
    tasteMatchRate: +((sum('tasteMatched') / totalIdeas) * 100).toFixed(1),
    ranAt: new Date().toISOString(),
  };

  // ── Optional pairwise judge vs a frozen baseline ───────────────────────────
  if (judgeAgainst) {
    const baseline = JSON.parse(readFileSync(resultsPath(judgeAgainst), 'utf8'));
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: KEY });
    const rand = mulberry32(42);
    const AXES = ['novelty', 'specificity', 'strategic fit'];
    const wins = Object.fromEntries(AXES.map(a => [a, 0]));
    let comparisons = 0, agreements = 0;

    for (const p of ok) {
      const basePart = (baseline.perPart || []).find(b => b.part === p.part && Array.isArray(b.ideaDigest));
      if (!basePart) continue;
      const flip = rand() < 0.5;   // order-randomised: baseline is sometimes A, sometimes B
      const [setA, setB] = flip ? [p.ideaDigest, basePart.ideaDigest] : [basePart.ideaDigest, p.ideaDigest];
      const fmt = (set) => set.map((i, n) => `${n + 1}. ${i.title}: ${i.description}`).join('\n');
      const prompt = `Two independent batches of automotive cost-reduction ideas for "${p.part}". Compare them PAIRWISE on each axis and pick a winner per axis (A or B, no ties):
- novelty: which batch contains more genuinely non-obvious mechanisms?
- specificity: which batch is more concrete (named grades, processes, benchmarks)?
- strategic fit: which batch better spans the full lever space for this part?

BATCH A:
${fmt(setA)}

BATCH B:
${fmt(setB)}`;
      const judgeOnce = async () => {
        const msg = await client.messages.create({
          model: 'claude-sonnet-5', max_tokens: 300,
          tools: [{ name: 'verdict', description: 'Return the per-axis winners.', input_schema: { type: 'object', properties: Object.fromEntries(AXES.map(a => [a.replace(' ', '_'), { type: 'string', enum: ['A', 'B'] }])), required: AXES.map(a => a.replace(' ', '_')) } }],
          tool_choice: { type: 'tool', name: 'verdict' },
          messages: [{ role: 'user', content: prompt }],
        });
        return msg.content.find(b => b.type === 'tool_use')?.input || {};
      };
      const [v1, v2] = [await judgeOnce(), await judgeOnce()];
      for (const a of AXES) {
        const k = a.replace(' ', '_');
        comparisons++;
        if (v1[k] === v2[k]) agreements++;
        // Count a win for the CURRENT run only when both judges agree — disagreement is a null.
        const currentIs = flip ? 'A' : 'B';
        if (v1[k] === v2[k] && v1[k] === currentIs) wins[a]++;
      }
      console.log(`judge ${p.part}: ${AXES.map(a => `${a}=${v1[a.replace(' ', '_')]}${v1[a.replace(' ', '_')] === v2[a.replace(' ', '_')] ? '' : '≠' + v2[a.replace(' ', '_')]}`).join(' ')} (current=${flip ? 'A' : 'B'})`);
    }
    summary.judge = {
      vs: judgeAgainst,
      judgedParts: ok.filter(p => (baseline.perPart || []).some(b => b.part === p.part && Array.isArray(b.ideaDigest))).length,
      winRatePct: Object.fromEntries(AXES.map(a => [a, +((wins[a] / Math.max(ok.length, 1)) * 100).toFixed(0)])),
      judgeAgreementPct: +((agreements / Math.max(comparisons, 1)) * 100).toFixed(0),
      note: 'Win requires BOTH judges to agree; disagreements count as null, not wins. Soft axes only — cost/feasibility judged by the deterministic engine, never an LLM.',
    };
  }

  writeFileSync(resultsPath(label), JSON.stringify({ label, summary, perPart }, null, 2));
  console.log(`\nSaved ${resultsPath(label)}\nSummary:`, JSON.stringify(summary, null, 2));
  if (summary.failed > 0) { console.error(`FAIL: ${summary.failed} golden parts errored`); cleanup(1); }
  cleanup(0);
} catch (e) {
  console.error('ideation-eval failed:', e.message);
  cleanup(1);
}

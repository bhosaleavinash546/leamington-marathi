// ─────────────────────────────────────────────────────────────────────────────
// LLM-layer eval harness — the missing third benchmark. The CAD and cost
// benchmarks gate the deterministic layers; nothing scored the LLM output
// itself. This runs a golden set of parts through the REAL /api/analyze
// (search off, deterministic caching disabled by unique part names) and scores
// each batch on the quality signals the pipeline already produces:
//
//   flagRate        % ideas the deterministic critic flagged
//   dropRate        % ideas the critic had to drop
//   engineCheckRate % ideas carrying a machine-verified engineCheck
//   contradictedRate% engine checks that CONTRADICTED the idea
//   evidenceRate    % ideas with ≥1 evidence source
//   dupRate         % ideas flagged as prior-art duplicates
//   meanIdeas       ideas per part
//
//   ANTHROPIC_API_KEY=sk-... node benchmark/llm-eval.mjs [--min-ideas 8]
//
// Skips with exit 0 when no key is present (CI-safe); writes
// benchmark/llm-eval-results.json when it runs.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.log('llm-eval: ANTHROPIC_API_KEY not set — skipping (this harness costs real tokens).');
  process.exit(0);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 19200 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}`;

// Golden set: spread across commodities incl. the newly-added families.
const GOLDEN = [
  { systemName: 'Chassis & Frame', subassemblyName: 'Front Suspension', partName: 'Front Knuckle / Upright' },
  { systemName: 'BIW Body-in-White', subassemblyName: 'Front End Module', partName: 'Front Bumper Beam' },
  { systemName: 'EV Battery System', subassemblyName: 'Battery Pack & BMS', partName: 'Cell Module Housing' },
  { systemName: 'Electric Drivetrain EDU', subassemblyName: 'E-Motor', partName: 'Stator Assembly' },
  { systemName: 'Interior', subassemblyName: 'Seating', partName: 'Front Seat Frame' },
  { systemName: 'Electrical & Electronics', subassemblyName: 'Wiring', partName: 'Body Wiring Harness' },
];

const dataDir = mkdtempSync(join(tmpdir(), 'bs-eval-'));
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, JWT_SECRET: 'eval-secret', LOG_LEVEL: 'silent' },
});
const cleanup = (code) => { server.kill('SIGKILL'); try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ } process.exit(code); };

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ }
    if (i > 75) throw new Error('server never became healthy');
    await new Promise(r => setTimeout(r, 400));
  }
  const su = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Eval', email: 'eval@test.local', password: 'eval-pass-123' }),
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
    perPart.push({
      part: g.partName,
      ideas: ideas.length,
      flagged: v.flagged ?? 0,
      dropped: v.dropped ?? 0,
      engineChecked: ideas.filter(i => i.engineCheck).length,
      contradicted: ideas.filter(i => i.engineCheck?.direction === 'contradicted').length,
      withEvidence: ideas.filter(i => (i.evidenceSources || []).length > 0).length,
      priorArtDup: ideas.filter(i => i.priorArt).length,
      seconds: Math.round((Date.now() - t0) / 1000),
    });
    console.log(`${g.partName}: ${ideas.length} ideas · ${perPart.at(-1).engineChecked} engine-checked (${perPart.at(-1).contradicted} contradicted) · ${perPart.at(-1).withEvidence} evidenced · ${perPart.at(-1).seconds}s`);
  }

  const ok = perPart.filter(p => !p.error);
  const sum = (k) => ok.reduce((s, p) => s + p[k], 0);
  const totalIdeas = sum('ideas') || 1;
  const summary = {
    parts: perPart.length, failed: perPart.length - ok.length,
    meanIdeas: +(totalIdeas / Math.max(ok.length, 1)).toFixed(1),
    flagRate: +((sum('flagged') / totalIdeas) * 100).toFixed(1),
    dropRate: +((sum('dropped') / (totalIdeas + sum('dropped'))) * 100).toFixed(1),
    engineCheckRate: +((sum('engineChecked') / totalIdeas) * 100).toFixed(1),
    contradictedRate: +((sum('contradicted') / Math.max(sum('engineChecked'), 1)) * 100).toFixed(1),
    evidenceRate: +((sum('withEvidence') / totalIdeas) * 100).toFixed(1),
    dupRate: +((sum('priorArtDup') / totalIdeas) * 100).toFixed(1),
    ranAt: new Date().toISOString(),
  };
  writeFileSync(join(ROOT, 'benchmark', 'llm-eval-results.json'), JSON.stringify({ summary, perPart }, null, 2));
  console.log('\nSummary:', JSON.stringify(summary, null, 2));

  const minIdeasIdx = process.argv.indexOf('--min-ideas');
  if (minIdeasIdx !== -1 && summary.meanIdeas < parseFloat(process.argv[minIdeasIdx + 1])) {
    console.error(`FAIL: meanIdeas ${summary.meanIdeas} below gate`);
    cleanup(1);
  }
  if (summary.failed > 0) { console.error(`FAIL: ${summary.failed} golden parts errored`); cleanup(1); }
  cleanup(0);
} catch (e) {
  console.error('llm-eval failed:', e.message);
  cleanup(1);
}

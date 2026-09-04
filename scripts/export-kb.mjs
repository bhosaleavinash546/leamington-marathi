// ─────────────────────────────────────────────────────────────────────────────
// KB export — one knowledge substrate for display AND generation.
//
// ~500KB of curated domain knowledge lives in src/data/*-knowledge-base.ts and
// was display-only (TrendsPage); idea generation used separate abbreviated
// inline lever maps in server.mjs — two drifting sources of truth. This script
// compiles each KB (esbuild), normalises every component's ideas/levers to a
// compact common shape, and writes kb-pack.json, which buildAnalysisPrompt
// reads at generation time (token-budgeted per component).
//
//   node scripts/export-kb.mjs        # regenerate kb-pack.json (committed)
//
// Re-run after editing any src/data/*-knowledge-base.ts file.
// ─────────────────────────────────────────────────────────────────────────────
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data');

// File stem → domain key as returned by detectContextDomain() in server.mjs.
const DOMAIN_BY_STEM = {
  'edu-knowledge-base': 'edu',
  'biw-knowledge-base': 'biw',
  'chassis-knowledge-base': 'chassis',
  'battery-knowledge-base': 'battery',
  'powertrain-ice-knowledge-base': 'ice',
  'hvac-knowledge-base': 'hvac',
  'interior-knowledge-base': 'interior',
  'exterior-knowledge-base': 'exterior',
  'exterior-trim-knowledge-base': 'exterior-trim',
  'transmission-driveline-knowledge-base': 'transmission',
  'ee-knowledge-base': 'ee',
  'adas-knowledge-base': 'adas',
  'fuel-emission-knowledge-base': 'fuel-emission',
};

const trim = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Normalise one component (any KB's shape) to the compact common shape.
// Sources vary: EDU/ADAS-style use `ideas` ({t,save,bench,tech,why,…}),
// BIW-style use `levers` ({t,save,bench,note,conf}), HVAC/transmission-style
// use `levers` ({action,saving,bench,note,conf}).
function normaliseComponent(c) {
  if (!c || typeof c !== 'object' || !c.id) return null;
  const rawItems = Array.isArray(c.ideas) ? c.ideas : Array.isArray(c.levers) ? c.levers : [];
  const items = rawItems
    .filter(i => i && (i.t || i.action))
    .map(i => {
      const out = { t: trim(i.t || i.action, 160) };
      if (i.save || i.saving) out.save = trim(i.save || i.saving, 110);
      if (i.bench) out.bench = trim(i.bench, 90);
      const note = i.note || i.why || i.tech || '';
      if (note) out.note = trim(note, 200);
      if (i.conf) out.conf = trim(i.conf, 12);
      if (i.risk) out.risk = trim(i.risk, 12);
      // Dating and citation carry through when a KB supplies them (Sept 2026
      // review, R-42: no lever carried either, so a 2019 benchmark and a 2026
      // one read identically in a prompt and on the Trends page). Optional by
      // design — the coverage line below reports how many actually have them,
      // so the gap is a measured number rather than an invisible one.
      if (i.asOf) out.asOf = trim(i.asOf, 12);
      if (i.src) out.src = trim(i.src, 160);
      return out;
    });
  if (!items.length) return null;
  const out = { id: String(c.id), name: trim(c.name, 90), items };
  if (c.baseline) out.baseline = trim(c.baseline, 220);
  if (c.fn) out.fn = trim(c.fn, 220);
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), 'kb-export-'));
const domains = {};
try {
  for (const file of readdirSync(DATA).filter(f => f.endsWith('-knowledge-base.ts'))) {
    const stem = basename(file, '.ts');
    const domain = DOMAIN_BY_STEM[stem];
    if (!domain) { console.warn(`SKIP ${file}: no domain mapping — add it to DOMAIN_BY_STEM`); continue; }
    const outfile = join(tmp, `${stem}.mjs`);
    await build({ entryPoints: [join(DATA, file)], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
    const mod = await import(pathToFileURL(outfile).href);
    // Every KB exports exactly one *_COMPONENTS array — find it by shape.
    const componentsExport = Object.entries(mod).find(([k, v]) =>
      k.endsWith('_COMPONENTS') && Array.isArray(v) && v.some(c => c?.id && (c.ideas || c.levers)));
    if (!componentsExport) { console.warn(`SKIP ${file}: no *_COMPONENTS export with ideas/levers`); continue; }
    const comps = componentsExport[1].map(normaliseComponent).filter(Boolean);
    domains[domain] = comps;
    console.log(`${domain.padEnd(14)} ${String(comps.length).padStart(3)} components · ${comps.reduce((s, c) => s + c.items.length, 0)} levers  (${componentsExport[0]})`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ── Vintage and citation coverage (Sept 2026 review, R-42) ─────────────────
//
// Knowledge with no date on it is knowledge you cannot audit. The pack now
// carries WHEN the source TypeScript was last substantively edited — read from
// git, so it cannot be asserted incorrectly — and the per-lever coverage of the
// optional asOf/src fields, which is 0% until the KBs are re-curated. Reporting
// zero is the point: an undated corpus that says so beats one that looks fresh.
function kbVintage() {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', DATA], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch { /* not a git checkout */ }
  return null;
}

const coverage = {};
let totalItems = 0, totalDated = 0, totalSourced = 0;
for (const [domain, comps] of Object.entries(domains)) {
  const items = comps.reduce((a, c) => a.concat(c.items), []);
  const dated = items.filter(i => i.asOf).length;
  const sourced = items.filter(i => i.src).length;
  coverage[domain] = { components: comps.length, levers: items.length, dated, sourced };
  totalItems += items.length; totalDated += dated; totalSourced += sourced;
}
const pct = (n) => (totalItems ? +((n / totalItems) * 100).toFixed(1) : 0);

const pack = {
  generatedAt: new Date().toISOString(),
  knowledgeAsOf: kbVintage(),
  coverage: { levers: totalItems, datedPct: pct(totalDated), sourcedPct: pct(totalSourced), byDomain: coverage },
  domains,
};
const out = join(ROOT, 'kb-pack.json');
writeFileSync(out, JSON.stringify(pack));
const kb = Object.values(domains).reduce((s, d) => s + d.length, 0);
console.log(`\nWrote kb-pack.json: ${Object.keys(domains).length} domains, ${kb} components, ${Math.round(JSON.stringify(pack).length / 1024)} KB`);
console.log(`Knowledge vintage: ${pack.knowledgeAsOf ?? 'UNKNOWN (not a git checkout)'}`);
console.log(`Lever dating: ${totalDated}/${totalItems} carry asOf (${pct(totalDated)}%) · ${totalSourced}/${totalItems} carry a source (${pct(totalSourced)}%)`);

// Depth spread, the other half of R-42: the corpus is 217 levers deep in one
// domain and 15 in another, and nothing said so.
const depths = Object.entries(coverage).map(([d, c]) => [d, c.levers]).sort((a, b) => b[1] - a[1]);
console.log(`Depth spread: ${depths[0][0]} ${depths[0][1]} levers → ${depths.at(-1)[0]} ${depths.at(-1)[1]} levers`);

// Ratchet, same contract as the other measurement gates: a floor that can only
// be raised as the KBs are re-curated. Absent flag = report only.
for (const [flag, actual, label] of [['--min-dated', pct(totalDated), 'levers carrying a date'], ['--min-sourced', pct(totalSourced), 'levers carrying a source']]) {
  const i = process.argv.indexOf(flag);
  if (i === -1) continue;
  const limit = Number(process.argv[i + 1]);
  if (!Number.isFinite(limit)) { console.error(`  ✗ ${flag} needs a number.`); process.exit(1); }
  if (actual < limit) { console.error(`  ✗ FAIL: ${actual}% ${label}, below the required ${limit}%`); process.exit(1); }
  console.log(`  ✓ ${label}: ${actual}% (≥ ${limit}%)`);
}

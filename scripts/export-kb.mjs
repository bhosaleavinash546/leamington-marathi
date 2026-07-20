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

const pack = { generatedAt: new Date().toISOString(), domains };
const out = join(ROOT, 'kb-pack.json');
writeFileSync(out, JSON.stringify(pack));
const kb = Object.values(domains).reduce((s, d) => s + d.length, 0);
console.log(`\nWrote kb-pack.json: ${Object.keys(domains).length} domains, ${kb} components, ${Math.round(JSON.stringify(pack).length / 1024)} KB`);

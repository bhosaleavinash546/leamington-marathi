// UX step 3, "quieter" (docs/UX-REVIEW-2026-10.md): one-line page subtitles,
// a Marketplace filter bar instead of a chip wall, no decorative aurora glows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const pagesDir = new URL('../src/pages/', import.meta.url);
const pages = readdirSync(pagesDir).filter(f => f.endsWith('.tsx')).map(f => [f, readFileSync(new URL(f, pagesDir), 'utf8')]);

/** The visible text of a PageHeader subtitle: JSX tags and {expressions} removed. */
export function subtitleText(src) {
  const out = [];
  for (const m of src.matchAll(/<PageHeader\b[\s\S]*?subtitle=(?:"([^"]*)"|\{<>([\s\S]*?)<\/>\})/g)) {
    const raw = m[1] ?? m[2];
    out.push(raw.replace(/<[^>]+>/g, '').replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, 'NN').replace(/\s+/g, ' ').trim());
  }
  return out;
}

test('subtitleText strips markup and expressions', () => {
  assert.deepEqual(subtitleText('<PageHeader subtitle={<>Cost <span className="x">a</span> board of {MAX} photos.</>} />'), ['Cost a board of NN photos.']);
});

test('every PageHeader subtitle is one line (≤ 90 visible characters)', () => {
  const long = [];
  for (const [f, src] of pages) for (const t of subtitleText(src)) if (t.length > 90) long.push(`${f}: ${t.length} — ${t}`);
  assert.deepEqual(long, [], 'the masthead promise is one line; the page explains itself below');
});

test('Marketplace filters are one labelled bar, not colour-coded chip groups', () => {
  const src = readFileSync(new URL('MarketplacePage.tsx', pagesDir), 'utf8');
  for (const l of ['Search ideas', 'Filter by system', 'Filter by difficulty', 'Filter by level', 'Filter by powertrain', 'Filter by architecture']) {
    assert.ok(src.includes(`aria-label="${l}"`), `missing ${l}`);
  }
  for (const chip of ['bg-purple-500/20 text-purple-300', 'bg-emerald-500/20 text-emerald-300', 'bg-sky-500/20 text-sky-300']) {
    assert.ok(!src.includes(chip), `chip colour still present: ${chip}`);
  }
  assert.ok(!src.includes('Community-submitted, anonymised'), 'the count no longer mislabels a curated library as community-only');
});

test('no decorative aurora glows or drifting motes behind work surfaces', () => {
  for (const [f, src] of pages) assert.ok(!/\b(iv|hz)-(glow|motes)/.test(src), `${f} still renders a glow/mote layer`);
  for (const css of ['innovation.css', 'foresight.css']) {
    const s = readFileSync(new URL(css, pagesDir), 'utf8');
    assert.ok(!/\.(iv|hz)-glow|\.iv-motes|@keyframes (iv|hz)-drift/.test(s), `${css} keeps dead glow CSS`);
  }
});

test('every colour opacity modifier is on the Tailwind scale (else it is never generated)', async () => {
  const cfg = (await import('../tailwind.config.js')).default;
  const scale = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
    ...Object.keys(cfg.theme.extend.opacity ?? {}).map(Number)]);
  const off = new Map();
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? '/' : ''), d);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) for (const m of readFileSync(p, 'utf8').matchAll(/\b(?:border|bg|text|ring|from|to|via|divide|outline|placeholder|fill|stroke|shadow|accent|caret|decoration)-[a-z]+(?:-\d{2,3})?\/(\d+)\b/g)) {
      if (!scale.has(Number(m[1]))) off.set(m[0], (off.get(m[0]) ?? 0) + 1);
    } } };
  walk(new URL('../src/', import.meta.url));
  assert.deepEqual([...off], [], 'add the step to theme.extend.opacity or use a step on the scale');
});

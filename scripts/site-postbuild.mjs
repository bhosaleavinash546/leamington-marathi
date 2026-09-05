#!/usr/bin/env node
/**
 * Finishes the GitHub Pages bundle produced by `vite.site.config.ts`.
 *
 * Three things Pages needs that Vite does not do:
 *   1. `.nojekyll`  — without it Jekyll silently drops any path starting with
 *      an underscore, and Vite's asset names can.
 *   2. `404.html`   — Pages has no SPA rewrite, so a deep link would 404. A
 *      copy of index.html makes any URL under the site land on the page.
 *   3. A size/asset check, so a broken bundle fails the deploy instead of
 *      shipping a page with no fonts.
 */
import { readdirSync, statSync, copyFileSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist-site';
const fail = m => { console.error('site-postbuild: ' + m); process.exit(1); };

if (!existsSync(join(OUT, 'index.html'))) fail('no index.html — did the build run?');

// publicDir brings the whole of public/ across. These belong to pages this
// build does not ship, and ev-diagram.png alone is 1.9 MB — drop them, but
// only after checking nothing in the bundle asks for them.
const bundleText = readdirSync(join(OUT, 'assets'))
  .map(f => readFileSync(join(OUT, 'assets', f), 'utf-8')).join('')
  + readFileSync(join(OUT, 'index.html'), 'utf-8');
for (const unused of ['ev-diagram.png', 'auth-hero.jpg', 'theme-init.js']) {
  if (bundleText.includes(unused)) continue;          // referenced after all — keep it
  if (existsSync(join(OUT, unused))) rmSync(join(OUT, unused));
}

writeFileSync(join(OUT, '.nojekyll'), '');
copyFileSync(join(OUT, 'index.html'), join(OUT, '404.html'));

// The fonts are the failure that would be invisible in review and obvious to a
// visitor: a missing woff2 falls back to the system sans without any error.
const html = readFileSync(join(OUT, 'index.html'), 'utf-8');
const css = readdirSync(join(OUT, 'assets')).filter(f => f.endsWith('.css'));
if (!css.length) fail('no stylesheet in the bundle');
const cssText = css.map(f => readFileSync(join(OUT, 'assets', f), 'utf-8')).join('');

const fontUrls = [...cssText.matchAll(/url\(([^)]*\.woff2)\)/g)].map(m => m[1].replace(/['"]/g, ''));
if (!fontUrls.length) fail('no @font-face urls in the stylesheet');
for (const u of new Set(fontUrls)) {
  const rel = u.replace(/^https?:\/\/[^/]+/, '');
  const path = join(OUT, rel.replace(/^\/[^/]+\//, ''));   // strip the Pages base
  if (!existsSync(path)) fail(`font referenced but not shipped: ${u} (looked for ${path})`);
}

// Pages serves from /<repo>/, so any root-absolute URL must carry that prefix.
// Vite adds it when it rewrites against `base` — this catches the ones it did
// not see (a hand-written href, an asset added later).
const BASE = process.env.SITE_BASE ?? '/leamington-marathi/';
for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
  if (!url.startsWith(BASE)) fail(`index.html points at ${url}, outside the Pages base ${BASE}`);
}

const bytes = (function walk(d) {
  return readdirSync(d).reduce((t, f) => {
    const p = join(d, f); const s = statSync(p);
    return t + (s.isDirectory() ? walk(p) : s.size);
  }, 0);
})(OUT);

console.log(`site-postbuild: ok — ${css.length} stylesheet(s), ${new Set(fontUrls).size} font files verified, ${(bytes / 1e6).toFixed(1)} MB total`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gates for the public shop window (`npm run build:site` → dist-site/).
 *
 * The whole risk of publishing a static build of an app is shipping something
 * that LOOKS like the working product: buttons that do nothing, links into
 * routes that 404, a "Sign In" that cannot sign anyone in. These tests exist so
 * that failure mode cannot reach GitHub Pages unnoticed.
 *
 * They read the built output when it is present, and read the source when it is
 * not, so `npm test` on a clean checkout still checks the source-level rules.
 */

const OUT = 'dist-site';
const built = existsSync(join(OUT, 'index.html'));

test('the shop window says, on the page, that it is not the running tool', () => {
  const src = readFileSync('site/StaticSite.tsx', 'utf-8');
  assert.match(src, /design preview/i,
    'the banner must name this as a preview — a visitor should not have to click to find out');
  assert.match(src, /cannot run on\s*\n?\s*GitHub Pages|cannot run on GitHub Pages/i,
    'the banner must say why nothing is interactive');
});

test('every call to action on the shop window leaves for a real destination', () => {
  const src = readFileSync('src/pages/HomePage.tsx', 'utf-8');
  // The three CTA pairs are chosen by STATIC_SITE; in that branch every one
  // must be external, because there is no route behind it.
  for (const name of ['PRIMARY_CTA', 'SECONDARY_HERO', 'SECONDARY_FOOT']) {
    const block = src.slice(src.indexOf(`const ${name} = STATIC_SITE`));
    const staticArm = block.slice(0, block.indexOf('  : {'));
    assert.match(staticArm, /external: true/,
      `${name}'s static arm must be an external link, not an app route`);
  }
  // And the system tiles must stop being links, since /analyze is not shipped.
  assert.match(src, /STATIC_SITE \? \(\s*\n\s*<div className="flex items-center gap-3 p-3\.5/,
    'the system tiles must render as cards, not links, on the shop window');
});

test('the static build declares itself through the build flag, not a copy of the page', () => {
  const site = readFileSync('site/StaticSite.tsx', 'utf-8');
  assert.match(site, /import HomePage from '\.\.\/src\/pages\/HomePage'/,
    'the shop window must render the REAL HomePage — a copy would drift from the product');
  const mode = readFileSync('src/lib/site-mode.ts', 'utf-8');
  assert.match(mode, /VITE_STATIC_SITE/);
});

test('the built bundle carries no in-app link and no absolute root URL', { skip: !built }, () => {
  const html = readFileSync(join(OUT, 'index.html'), 'utf-8');
  const base = process.env.SITE_BASE ?? `/${JSON.parse(readFileSync('site/site.config.json', 'utf-8')).repo}/`;
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    assert.ok(url.startsWith(base), `${url} sits outside the Pages base ${base}`);
  }
  const js = readdirSync(join(OUT, 'assets')).filter(f => f.endsWith('.js'))
    .map(f => readFileSync(join(OUT, 'assets', f), 'utf-8')).join('');
  // The flag is folded at build time, so the losing arm is eliminated: the
  // app's CTA label can only survive if VITE_STATIC_SITE was not set — the one
  // mistake that would silently publish a page full of dead buttons.
  assert.ok(!js.includes('Generate Ideas Now'),
    'built without VITE_STATIC_SITE=1 — the CTAs point into the app, which is not deployed here');
  assert.ok(js.includes('View the source on GitHub'),
    'the shop-window CTA is missing from the bundle');
  for (const route of ['"/analyze"', '"/trends"', '"/dashboard"']) {
    assert.ok(!js.includes(route), `the bundle still references the app route ${route}`);
  }
});

test('the built bundle ships every font it asks for', { skip: !built }, () => {
  const css = readdirSync(join(OUT, 'assets')).filter(f => f.endsWith('.css'))
    .map(f => readFileSync(join(OUT, 'assets', f), 'utf-8')).join('');
  const urls = [...css.matchAll(/url\(([^)]*\.woff2)\)/g)].map(m => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 8, 'expected the self-hosted Plex faces in the stylesheet');
  for (const u of new Set(urls)) {
    const rel = u.replace(/^\/[^/]+\//, '');
    assert.ok(existsSync(join(OUT, rel)), `${u} is referenced but not shipped`);
  }
});

test('Pages needs the two files Vite does not write', { skip: !built }, () => {
  assert.ok(existsSync(join(OUT, '.nojekyll')), 'without .nojekyll, Jekyll eats underscore paths');
  assert.ok(existsSync(join(OUT, '404.html')), 'Pages has no SPA rewrite; 404.html is the fallback');
});

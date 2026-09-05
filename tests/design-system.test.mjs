// The design-system floor from the September 2026 UX review
// (docs/UX-REVIEW-2026-09.md). These are the regressions that crept in one
// page at a time before, so they are gated the way the cost benchmarks are:
// a new page that ships a 10 px label or a bouncy hover fails CI with the
// file named, instead of being found in the next review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk('src');
const offenders = (re, filter = () => true) =>
  files.filter(filter).filter(f => re.test(readFileSync(f, 'utf8')));

test('no transition-all: transitions name their properties (transition-ui, transition-colors …)', () => {
  assert.deepEqual(offenders(/\btransition-all\b/), []);
});

test('no hover:scale bounces: the house hover is a 1 px lift (hover:-translate-y-0.5)', () => {
  assert.deepEqual(offenders(/hover:scale-/), []);
});

test('type floor is 11 px: no text-[9px|10px|10.5px] utilities and no CSS font-size under 11 px', () => {
  assert.deepEqual(offenders(/text-\[(9|10|10\.5)px\]/), []);
  assert.deepEqual(offenders(/font-size:\s*(?:[0-9]|10|10\.5)px\b/, f => f.endsWith('.css')), []);
});

test('fixed overlays use the stacking scale (z-nav / z-fab / z-popover / z-modal), not raw z-50', () => {
  const shell = ['src/components/mobile/MobileNav.tsx', 'src/components/AiChatbot.tsx', 'src/components/OnboardingChecklist.tsx'];
  for (const f of shell) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/\bz-50\b/.test(s), `${f} uses raw z-50`);
  }
});

test('the motion system lives in src/lib/motion.ts and nothing imports the old dfm path', () => {
  assert.deepEqual(offenders(/components\/dfm\/motion'|from '\.\/motion'/), []);
  const m = readFileSync('src/lib/motion.ts', 'utf8');
  assert.match(m, /EASE_OUT = \[0\.22, 1, 0\.36, 1\]/);
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /--ease-out:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/, 'CSS token must equal the TS curve');
  assert.match(css, /--dur-micro:\s*160ms/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*transition-duration: 0\.01ms/);
});

// ── LIGHT THEME ──────────────────────────────────────────────────────────────
// The light theme is built from token remaps keyed on Tailwind's utilities, so
// anything that hard-codes a DARK-theme colour bypasses it and keeps its dark
// value on a white page. The September 2026 light sweep found the whole mobile
// tab bar invisible that way (white/45 labels on a background the light theme
// remaps to #F7F9FB), plus an invisible skeleton and two settings pages that
// stayed dark under a light header. These gate the pattern, not the symptom.

/** Files allowed to hard-code a colour, each for a stated reason. */
const COLOR_LITERAL_ALLOWLIST = new Map([
  // Renders when React itself has failed — it cannot rely on the token layer.
  ['src/components/ErrorBoundary.tsx', 'crash screen: renders without the app'],
  // Reads the theme and branches on it, which is the correct pattern.
  ['src/components/results/IdeasDashboard.tsx', 'branches on isDark'],
  ['src/components/results/BusinessCaseCalculator.tsx', 'branches on isDark'],
  ['src/pages/DashboardPage.tsx', 'branches on isDark'],
  // Always-dark brand panel, opted out with data-theme="dark".
  ['src/pages/AuthPage.tsx', 'always-dark brand panel'],
]);

/**
 * Every `style={{ … }}` block and every colour-valued JSX attribute, scanned
 * for a hard-coded DARK colour. Scanning the whole block matters: the tab-bar
 * bug wrote the literal inside a TERNARY —
 *   style={{ color: active ? 'rgb(var(--gold-400))' : 'rgba(255,255,255,0.45)' }}
 * — so a rule anchored to `color:` saw nothing. This function is verified
 * against that exact original source below.
 */
export function darkColorLiterals(src) {
  const hits = [];
  const LITERAL = /rgba?\(\s*255\s*,\s*255\s*,\s*255[^)]*\)|#0[0-9a-fA-F]{5}\b/g;
  // style={{ … }} — brace-matched so nested objects are covered.
  for (let i = src.indexOf('style={{'); i !== -1; i = src.indexOf('style={{', i + 1)) {
    let depth = 0, j = i + 'style='.length;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    const block = src.slice(i, j + 1);
    for (const m of block.matchAll(LITERAL)) hits.push(m[0]);
  }
  // stroke="rgba(255,255,255,0.05)" / fill="#0f1629" and their JSX-expression forms.
  for (const m of src.matchAll(/(?:stroke|fill|color|background)=\{?["']([^"']+)["']\}?/g)) {
    for (const lit of m[1].matchAll(LITERAL)) hits.push(lit[0]);
  }
  return hits;
}

test('no dark-theme colour literals in inline styles: they cannot follow the theme', () => {
  const bad = [];
  for (const f of files.filter(f => f.endsWith('.tsx'))) {
    if (COLOR_LITERAL_ALLOWLIST.has(f.split(/[\\/]/).join('/'))) continue;
    for (const hit of darkColorLiterals(readFileSync(f, 'utf8'))) bad.push(`${f}: ${hit}`);
  }
  assert.deepEqual(bad, [], 'use the theme tokens (--hairline, --tint, rgb(var(--navy-950))) or branch on isDark');
});

test('the literal scanner catches the tab-bar bug it was written for', () => {
  // The exact shape that made every inactive tab invisible on a light page.
  const regressed = `<NavLink style={{ color: active ? 'rgb(var(--gold-400))' : 'rgba(255,255,255,0.45)' }} />`;
  assert.equal(darkColorLiterals(regressed).length, 1, 'a literal inside a ternary must still be caught');
  assert.equal(darkColorLiterals(`<CartesianGrid stroke="rgba(255,255,255,0.05)" />`).length, 1);
  assert.equal(darkColorLiterals(`<div style={{ background: 'rgb(var(--navy-950))', borderTop: '1px solid var(--hairline)' }} />`).length, 0,
    'token-based styles must NOT be flagged');
});

test('theme-flipping surface tokens are defined in BOTH themes', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const dark = css.slice(0, css.indexOf('[data-theme="light"]'));
  const light = css.slice(css.indexOf('[data-theme="light"] {'), css.indexOf('@layer base'));
  for (const t of ['--hairline', '--hairline-strong', '--tint', '--tint-strong', '--shimmer-base', '--shimmer-hi']) {
    assert.match(dark, new RegExp(`${t}:`), `${t} missing from the dark root`);
    assert.match(light, new RegExp(`${t}:`), `${t} missing from the light theme`);
  }
  // The categorical palette must exist in both, or category colour inverts.
  for (let i = 1; i <= 8; i++) {
    assert.match(dark, new RegExp(`--cat-${i}:`), `--cat-${i} missing from the dark root`);
    assert.match(light, new RegExp(`--cat-${i}:`), `--cat-${i} missing from the light theme`);
  }
});

test('accent text with an opacity modifier is remapped for light', () => {
  const css = readFileSync('src/index.css', 'utf8');
  // Every fixed-palette accent family that call sites use with an alpha must
  // have a [class*="text-<step>/"] rule, or it keeps its dark tint on white.
  const used = new Set();
  for (const f of files.filter(f => /\.tsx?$/.test(f))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/text-(teal|emerald|green|success|amber|yellow|warning|red|danger|rose|pink|orange|blue|info|sky|cyan|indigo|violet|purple|fuchsia|lime)-(\d{3})\/\d{2,3}/g)) {
      used.add(`${m[1]}-${m[2]}`);
    }
  }
  const missing = [...used].filter(step => !css.includes(`[class*="text-${step}/"]`));
  assert.deepEqual(missing, [], 'add a light-theme remap for these alpha accent steps in index.css');
});

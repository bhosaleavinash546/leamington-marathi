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

/**
 * Every literal type size in the source, as a NUMBER.
 *
 * The first version of this gate enumerated the sizes it had seen — 9, 10 and
 * 10.5 px — as alternatives in a regex. That is a list of yesterday's
 * offenders, not a floor: `text-[8px]` passed it, and two of them were sitting
 * on the PCB page's LIVE and AI price badges the whole time. They never showed
 * in the runtime sweep either, because they only render when a live
 * distributor price comes back. A rule that only catches the examples it was
 * written from is not a rule.
 */
export function literalFontSizes(src) {
  const found = [];
  for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) found.push({ px: parseFloat(m[1]), raw: m[0] });
  for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) found.push({ px: parseFloat(m[1]), raw: m[0] });
  // rem literals resolve against the 16 px root
  for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)rem\]/g)) found.push({ px: parseFloat(m[1]) * 16, raw: m[0] });
  return found;
}

const TYPE_FLOOR_PX = 11;

test(`type floor is ${TYPE_FLOOR_PX} px, tested as a number rather than a list of known offenders`, () => {
  const bad = [];
  for (const f of files) {
    for (const { px, raw } of literalFontSizes(readFileSync(f, 'utf8'))) {
      if (px < TYPE_FLOOR_PX) bad.push(`${f}: ${raw} (${px}px)`);
    }
  }
  assert.deepEqual(bad, [], `nothing may render below ${TYPE_FLOOR_PX}px; use text-2xs`);
});

test('the type-floor scanner catches the size its first version missed', () => {
  assert.equal(literalFontSizes('<span className="text-[8px]">LIVE</span>').length, 1);
  assert.equal(literalFontSizes('<span className="text-[8px]">LIVE</span>')[0].px, 8);
  assert.equal(literalFontSizes('.x { font-size: 9px; }')[0].px, 9);
  assert.equal(literalFontSizes('text-[0.5rem]')[0].px, 8, 'rem literals resolve against the 16px root');
  assert.deepEqual(literalFontSizes('<span className="text-2xs">ok</span>'), [], 'the token is not a literal');
});

/**
 * THE TYPE SCALE, as a set rather than a habit.
 *
 * Before this, 24 distinct sizes rendered across the product: the named
 * Tailwind steps plus 24 arbitrary px values and 6 rem values, including
 * 11.5, 12.5, 13.5, 16.5, 33.6, 38.4 and 53.6 px — half-pixel and
 * rem-derived sizes nobody chose, and three body sizes within 2 px of each
 * other doing the same job. A literal that equals a named step is also a
 * second vocabulary for one size, so those became tokens.
 *
 * What remains as a literal is only what Tailwind has no name for: 13 px (the
 * dense-UI step used by the sidebar, the tab bar and the DFM labels) and the
 * display sizes the marketing and sign-in pages need.
 */
/** Sizes Tailwind names, and therefore sizes a .tsx file must NOT spell out. */
const NAMED_STEPS_PX = new Set([11, 12, 14, 16, 18, 20, 24, 30, 36]);
/** Steps with no token: the dense-UI 13, and the display sizes. */
const EXTRA_STEPS_PX = new Set([13, 28, 32, 40, 44, 48, 50, 60]);
/** A .css file has no tokens to reach for, so px there may be any step. */
const SCALE_PX = new Set([...NAMED_STEPS_PX, ...EXTRA_STEPS_PX]);

test('every literal type size is a member of the scale', () => {
  const off = [];
  for (const f of files) {
    for (const { px, raw } of literalFontSizes(readFileSync(f, 'utf8'))) {
      if (!SCALE_PX.has(px)) off.push(`${f}: ${raw} (${px}px)`);
    }
  }
  assert.deepEqual(off, [], 'use a step from the scale, or add one deliberately');
});

test('a .tsx file never spells out a size Tailwind already names', () => {
  const dupes = [];
  for (const f of files.filter(f => f.endsWith('.tsx'))) {
    for (const { px, raw } of literalFontSizes(readFileSync(f, 'utf8'))) {
      if (NAMED_STEPS_PX.has(px)) dupes.push(`${f}: ${raw} — use the token instead`);
    }
  }
  assert.deepEqual(dupes, [], 'one size, one vocabulary');
});

test('every uppercase label carries tracking, from a set of two', () => {
  // Uppercase without letterspacing reads cramped; seven different values
  // reads as seven different decisions. Two, each with a job: `wider` for
  // labels at 12px and up, `widest` for the smallest eyebrows.
  const ALLOWED = new Set(['tracking-wider', 'tracking-widest']);
  const bad = [];
  for (const f of files.filter(f => f.endsWith('.tsx'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/className="([^"]*\buppercase\b[^"]*)"/g)) {
      const found = m[1].match(/tracking-\[?[\w.-]+\]?/g) || [];
      if (!found.length) bad.push(`${f}: uppercase with no tracking — ${m[1].slice(0, 50)}`);
      for (const t of found) if (!ALLOWED.has(t)) bad.push(`${f}: ${t} — use tracking-wider or tracking-widest`);
    }
  }
  assert.deepEqual(bad, []);
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

test('the always-dark opt-out restores every token the light theme redefines', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const block = (start, end) => css.slice(css.indexOf(start), css.indexOf(end, css.indexOf(start)));
  const light = block('[data-theme="light"] {', '@layer base');
  const optOut = block('[data-theme="light"] [data-theme="dark"] {', '}');
  const declared = [...light.matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]);
  // Shadows and the hero gradient are deliberately shared; everything that
  // carries a light/dark COLOUR decision must be restored inside a dark panel.
  const shared = new Set(['--shadow-card', '--shadow-card-lg', '--shadow-modal', '--shadow-popover', '--gradient-hero']);
  const missing = declared.filter(t => !shared.has(t) && !optOut.includes(`${t}:`));
  assert.deepEqual(missing, [], 'add these to the [data-theme="light"] [data-theme="dark"] block in index.css');
});

test('the always-dark opt-out uses the dark theme\'s CURRENT slate values, not stale ones', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const base = Object.fromEntries([...css.matchAll(/^\.text-slate-(\d00) \{ color: (#[0-9a-f]{6}); \}/gm)].map(m => [m[1], m[2]]));
  const optOut = Object.fromEntries([...css.matchAll(/\[data-theme="light"\] \[data-theme="dark"\] \.text-slate-(\d00) \{ color: (#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  const drifted = Object.entries(optOut).filter(([step, colour]) => base[step] && base[step] !== colour)
    .map(([step, colour]) => `slate-${step}: opt-out ${colour} vs dark ${base[step]}`);
  assert.deepEqual(drifted, [], 'a dark panel on a light page must render exactly like the dark theme');
});

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

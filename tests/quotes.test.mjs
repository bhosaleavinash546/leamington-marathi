// The landing page's quotation band. These are claims printed under a real
// person's name, so they get the same treatment as any other claim in this
// codebase: checked, and checkable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/QuoteRotator.tsx', 'utf8');
const block = src.slice(src.indexOf('export const QUOTES'), src.indexOf('const INTERVAL_MS'));
const quotes = [...block.matchAll(/\{ text: '([^']+)', author: '([^']+)'(?:, role: '([^']+)')? \}/g)]
  .map(m => ({ text: m[1], author: m[2], role: m[3] }));

test('the quote set is present and every entry is attributed', () => {
  assert.ok(quotes.length >= 8, `expected at least 8 quotes, parsed ${quotes.length}`);
  for (const q of quotes) {
    assert.ok(q.text.length > 10, `too short to be a quotation: ${q.text}`);
    assert.ok(q.author.trim().length > 2, `unattributed: ${q.text}`);
    assert.ok(!/^["“]/.test(q.text), 'quote marks are drawn by the component, not baked into the text');
  }
});

test('no duplicate quotations', () => {
  const seen = new Set();
  for (const q of quotes) {
    assert.ok(!seen.has(q.text), `duplicate: ${q.text}`);
    seen.add(q.text);
  }
});

test('the widely misattributed ones stay out', () => {
  // Each of these circulates under a name the evidence does not support.
  const BANNED = [/faster horses/i, /simplicity is the ultimate sophistication/i,
                  /not the strongest of the species/i, /quality is not an act/i];
  for (const q of quotes) {
    for (const re of BANNED) {
      assert.ok(!re.test(q.text), `${q.text} — commonly misattributed; leave it out`);
    }
  }
});

test('rotation is pausable and honours reduced motion', () => {
  assert.match(src, /onMouseEnter=\{\(\) => setPaused\(true\)\}/, 'must pause on hover (WCAG 2.2.2)');
  assert.match(src, /onFocusCapture=\{\(\) => setPaused\(true\)\}/, 'must pause on keyboard focus');
  assert.match(src, /if \(reduced \|\| paused/, 'must not auto-rotate under prefers-reduced-motion');
  assert.match(src, /aria-live="off"/, 're-announcing every 4s would make a screen reader unusable');
});

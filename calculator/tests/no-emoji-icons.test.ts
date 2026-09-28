/**
 * The UI uses its own SVG icon set, not emoji (I4).
 *
 * There were 660 emoji and text symbols in the UI source — 284 colour
 * pictographs and 107 country flags among them. Colour emoji draw differently
 * on every operating system, and Windows, where the app is deployed at JLR,
 * has no flag emoji at all: 🇬🇧 shows as the letters "GB". They were replaced
 * with sprite icons (<use href="#i-…">) or removed where the words carried the
 * meaning. Plain text symbols (✓ ✕ ⚠ ⚙ ⌘) render as text and are allowed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const EMOJI = /[\u{1F100}-\u{1F1FF}\u{1F200}-\u{1FAFF}\u{2328}\u{23F1}\u{23F3}\u{23F8}]|[\u{2600}-\u{27BF}]\u{FE0F}/u;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('no emoji as icons in the UI', () => {
  it('index.html and every src/ui module use sprite icons instead', () => {
    const hits: string[] = [];
    for (const f of [join(ROOT, 'index.html'), ...files(join(ROOT, 'src/ui'))]) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // comments may say anything
        if (EMOJI.test(line)) hits.push(`${f.replace(ROOT + '/', '')}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('every sprite icon the markup uses exists', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    const used = new Set<string>();
    for (const f of [join(ROOT, 'index.html'), ...files(join(ROOT, 'src/ui'))]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/href="#(i-[\w-]+)"/g)) used.add(m[1]);
    }
    expect([...used].filter(u => !defined.has(u))).toEqual([]);
  });
});

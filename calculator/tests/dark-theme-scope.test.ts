/**
 * The black + green dark theme (src/ui/styles/dark-green.css, Oct 2026) must never reach the
 * light theme: every selector in it is scoped to html:not([data-theme="light"]). Proven by pixel
 * on five screens with e2e/theme-shots.ts; this keeps the file honest as it grows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/ui/styles/dark-green.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);

describe('dark theme stylesheet', () => {
  it('has rules', () => expect(selectors.length).toBeGreaterThan(10));
  it('scopes every selector to the dark theme', () => {
    const bad = selectors.flatMap(s => s.split(',').map(x => x.trim())).filter(x => !x.startsWith('html:not([data-theme="light"])'));
    expect(bad).toEqual([]);
  });
  it('is loaded after the other stylesheets', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main.indexOf("import './styles/dark-green.css'")).toBeGreaterThan(main.indexOf("import './styles/saas-polish.css'"));
  });
});

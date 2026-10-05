/**
 * UI/UX review (Oct 2026) — docs/ui/ui-ux-review-2026-10.md.
 *  - The "More" menu moves the action bar's buttons by id: every id must exist, once.
 *  - The sign-in page's numbers must be the product's (it once said 52+ commodities,
 *    20 regions and 10 currencies against 21 cost models, 39 countries, 28 currencies).
 *  - Controls axe found unnamed stay named.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTION_GROUPS } from '../src/ui/saas-shell.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { CURRENCY_SYMBOL } from '../src/engine/insights.js';

const index = readFileSync('index.html', 'utf8');
const auth = readFileSync('auth.html', 'utf8');
const main = readFileSync('src/ui/main.ts', 'utf8');

describe('action bar → More menu', () => {
  it('every grouped button exists exactly once in the page', () => {
    for (const id of ACTION_GROUPS.flatMap(g => g.ids)) {
      expect(index.match(new RegExp(`id="${id}"`, 'g'))?.length, id).toBe(1);
    }
  });
  it('Calculate and Load Example stay in the bar', () => {
    const ids = ACTION_GROUPS.flatMap(g => g.ids);
    expect(ids).not.toContain('calc-btn');
    expect(ids).not.toContain('load-ref-btn');
  });
});

describe('sign-in page states what the product does', () => {
  const stat = (label: string) => auth.match(new RegExp(`<span class="stat-val">([^<]+)</span>\\s*<span class="stat-label">${label}</span>`))?.[1];
  it('countries = REGIONAL_DATA', () => {
    const n = Object.keys(REGIONAL_DATA).length;
    expect(stat('Countries')).toBe(String(n));
    expect(auth).toContain(`${n} countries`);
  });
  it('currencies = CURRENCY_SYMBOL', () => {
    expect(stat('Currencies')).toBe(String(Object.keys(CURRENCY_SYMBOL).length));
  });
  it('cost models = the costing tiles on the picker (not the AI / CAD entry points)', () => {
    const grid = index.slice(index.indexOf('<div class="cpicker-grid">'), index.indexOf('cpicker-ai-row'));
    const n = new Set(Array.from(grid.matchAll(/class="cpicker-tile[^"]*" data-commodity="([a-z_]+)"/g), m => m[1])).size;
    expect(stat('Cost models')).toBe(String(n));
  });
  it('no stale claims', () => {
    for (const s of ['52+', '20 regions', 'battery packs', 'NMC']) expect(auth, s).not.toContain(s);
  });
});

describe('controls axe flagged keep a name', () => {
  it('password toggles', () => {
    const toggles = auth.match(/<button[^>]*class="toggle-pw"[^>]*>/g) ?? [];
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) expect(t).toMatch(/aria-label="/);
  });
  it('portfolio what-if select and slider', () => {
    expect(main).toMatch(/id="wf-cat"[^>]*aria-label=/);
    expect(main).toMatch(/id="wf-delta"[^>]*aria-label=/);
  });
});

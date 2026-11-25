/**
 * Phase 2 · F-26 (polish): the dashboard's in-page jumps ("Details" → data quality, …) scroll instantly when the
 * user asks for reduced motion, and smoothly otherwise. Phase 1 measured `scrollIntoView({ behavior: 'smooth' })`
 * ignoring the preference (live check in phase2-evidence/block3: scrollY mid-way 40 ms after the click).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
afterEach(() => { delete g.matchMedia; });

describe('F-26: smooth scrolling respects prefers-reduced-motion', () => {
  it('auto (instant) under reduced motion, smooth otherwise', async () => {
    const { scrollBehavior } = await import('../src/ui/kpi-dashboard/kpi-view');
    const asked: string[] = [];
    g.matchMedia = q => { asked.push(q); return { matches: true }; };
    expect(scrollBehavior()).toBe('auto');
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
    g.matchMedia = () => ({ matches: false });
    expect(scrollBehavior()).toBe('smooth');
    delete g.matchMedia;
    expect(scrollBehavior()).toBe('smooth');
  });
  it('no dashboard file hard-codes a smooth scroll', () => {
    const dir = new URL('../src/ui/kpi-dashboard/', import.meta.url);
    for (const f of readdirSync(dir)) expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/behavior:\s*'smooth'/);
  });
});

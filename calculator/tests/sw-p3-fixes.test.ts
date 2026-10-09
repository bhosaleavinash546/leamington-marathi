/**
 * Software costing review — P3 fixes (Oct 2026, docs/review/software-costing-360-2026-10.md §6).
 * One describe block per fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSWProgram, defaultSWProgramInputs } from '../src/engine/sw-should-cost.js';
import type { SWProgramInputs } from '../src/engine/sw-should-cost.js';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const prog = (mut: (p: SWProgramInputs) => void = () => {}) => { const p = defaultSWProgramInputs(); mut(p); return p; };

describe('#19 the headline states where it sits in its own band', () => {
  it('headlinePercentile is the share of trials at or below the headline', () => {
    const r = computeSWProgram(prog());
    const mc = r.monteCarlo;
    expect(mc.headlinePercentile).toBeGreaterThan(0);
    expect(mc.headlinePercentile).toBeLessThan(50);                      // skewed-up ranges → below the median
    expect(r.summary.grandTotal).toBeLessThan(mc.p50);
    if (mc.headlinePercentile > 10) expect(r.summary.grandTotal).toBeGreaterThanOrEqual(mc.p10);
  });
  it('screen, PDF and Excel print it', () => {
    const ui = src('src/ui/panels/sw-should-cost-ui.ts');
    expect(ui).toMatch(/id="sw-headline-pct"/);
    expect(ui.match(/headlinePercentile/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

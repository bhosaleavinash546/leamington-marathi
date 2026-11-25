/**
 * Phase 2 · F-23 (polish): the sticky filter bar sits directly under the app header. It stuck at top: 64px under a
 * 56px header, leaving an 8px seam that the scrolling content showed through (measured live at 768–1920 px in
 * phase2-evidence/block3). The bar's sticky offset must equal the header height.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const kd = readFileSync(new URL('../src/ui/styles/kpi-dashboard.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/ui/styles/calculator.css', import.meta.url), 'utf8');

describe('F-23: no seam under the sticky filter bar', () => {
  it('the filter bar sticks at the header height', () => {
    const header = app.match(/\n\.header \{[^}]*?height:\s*(\d+)px/)?.[1];
    const bar = kd.match(/\.kd-filters \{[^}]*?position:\s*sticky;\s*top:\s*(\d+)px/)?.[1];
    expect(header).toBe('56');
    expect(bar).toBe(header);
  });
});

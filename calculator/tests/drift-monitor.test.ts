import { describe, it, expect } from 'vitest';
import { scanForDrift } from '../src/engine/drift-monitor.js';
import type { KnowledgeCase } from '../src/engine/part-similarity.js';

const NOW = Date.UTC(2026, 6, 1);
const DAY = 86_400_000;
let _id = 0;
const kase = (partName: string, totalCost: number, actualCost: number | undefined, annualVolume: number, savedAt = NOW - 10 * DAY): KnowledgeCase =>
  ({ id: String(_id++), savedAt, partName, fingerprint: { commodity: 'machining', annualVolume }, totalCost, currency: 'GBP', actualCost });

describe('autonomous drift monitor', () => {
  it('opens a renegotiation finding with quantified £/yr impact', () => {
    // £46.5 paid vs £41.2 should-cost at 10k pcs → +12.9%, ≈ £53k/yr
    const f = scanForDrift([kase('Bracket', 41.2, 46.5, 10000)], { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('renegotiation');
    expect(f[0].gapPct).toBeCloseTo(12.9, 1);
    expect(f[0].annualImpactGBP).toBe(53000);
    expect(f[0].severity).toBe('medium');
    expect(f[0].message).toMatch(/renegotiation opportunity/);
  });

  it('flags underwater pricing as a risk, not an opportunity', () => {
    const f = scanForDrift([kase('Housing', 50, 38, 5000)], { now: NOW });   // −24%
    expect(f[0].kind).toBe('underwater');
    expect(f[0].severity).toBe('high');
    expect(f[0].message).toMatch(/BELOW should-cost/);
  });

  it('stays silent inside the threshold (no noise)', () => {
    const f = scanForDrift([kase('Seal', 10, 10.5, 100000)], { now: NOW });  // +5% < 8%
    expect(f).toHaveLength(0);
  });

  it('nudges on stale never-validated estimates only after the window', () => {
    const stale = kase('Old Part', 20, undefined, 1000, NOW - 120 * DAY);
    const fresh = kase('New Part', 20, undefined, 1000, NOW - 10 * DAY);
    const f = scanForDrift([stale, fresh], { now: NOW });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('stale-estimate');
    expect(f[0].partName).toBe('Old Part');
  });

  it('ranks findings by annual £ impact (biggest money first)', () => {
    const f = scanForDrift([
      kase('Small', 10, 12, 1000),       // £2k/yr
      kase('Big', 40, 48, 50000),        // £400k/yr
    ], { now: NOW });
    expect(f[0].partName).toBe('Big');
    expect(f[0].annualImpactGBP).toBeGreaterThan(f[1].annualImpactGBP);
  });
});

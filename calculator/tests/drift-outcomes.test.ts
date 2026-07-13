import { describe, it, expect } from 'vitest';
import {
  scanForDrift, rankFindings, computeHitRates, hitRateFor,
  type FindingOutcome, type DriftFinding,
} from '../src/engine/drift-monitor.js';
import type { KnowledgeCase } from '../src/engine/part-similarity.js';

const kase = (partName: string, commodity: string, total: number, actual: number | undefined, vol: number, savedAt = Date.now()): KnowledgeCase => ({
  partName, totalCost: total, actualCost: actual, savedAt,
  fingerprint: { commodity, annualVolume: vol } as KnowledgeCase['fingerprint'],
} as KnowledgeCase);

describe('outcome-weighted findings', () => {
  it('neutral prior (0.5) when no outcomes logged', () => {
    const rates = computeHitRates([]);
    expect(hitRateFor('machining', 'renegotiation', rates)).toBe(0.5);
  });

  it('learns a higher hit-rate where findings converted', () => {
    const outcomes: FindingOutcome[] = [
      { commodity: 'machining', kind: 'renegotiation', actioned: true, realizedGBP: 5000, at: 0 },
      { commodity: 'machining', kind: 'renegotiation', actioned: true, realizedGBP: 4000, at: 0 },
      { commodity: 'machining', kind: 'renegotiation', actioned: true, realizedGBP: 3000, at: 0 },
    ];
    const rates = computeHitRates(outcomes);
    const r = hitRateFor('machining', 'renegotiation', rates);
    expect(r).toBeGreaterThan(0.5);          // shifted up from prior
    expect(r).toBeLessThan(1);               // shrunk (not a naive 3/3=1.0)
  });

  it('learns a lower hit-rate where findings were dismissed', () => {
    const outcomes: FindingOutcome[] = Array.from({ length: 5 }, () =>
      ({ commodity: 'casting', kind: 'renegotiation', actioned: false, realizedGBP: 0, at: 0 } as FindingOutcome));
    const r = hitRateFor('casting', 'renegotiation', computeHitRates(outcomes));
    expect(r).toBeLessThan(0.5);
  });

  it('re-ranks a smaller high-convert gap above a bigger low-convert gap', () => {
    const findings: DriftFinding[] = [
      { kind: 'renegotiation', partName: 'Big Casting', commodity: 'casting', message: '', annualImpactGBP: 100000, gapPct: 25, severity: 'high' },
      { kind: 'renegotiation', partName: 'Small Machined', commodity: 'machining', message: '', annualImpactGBP: 40000, gapPct: 15, severity: 'medium' },
    ];
    const outcomes: FindingOutcome[] = [
      // casting never converts, machining always does
      ...Array.from({ length: 6 }, () => ({ commodity: 'casting', kind: 'renegotiation', actioned: false, realizedGBP: 0, at: 0 } as FindingOutcome)),
      ...Array.from({ length: 6 }, () => ({ commodity: 'machining', kind: 'renegotiation', actioned: true, realizedGBP: 20000, at: 0 } as FindingOutcome)),
    ];
    const ranked = rankFindings(findings, outcomes);
    expect(ranked[0].partName).toBe('Small Machined');   // expected realizable value wins over raw gap
    expect(ranked[0].expectedRealizableGBP).toBeGreaterThan(ranked[1].expectedRealizableGBP);
  });

  it('falls back to raw impact ordering with no outcomes', () => {
    const findings = scanForDrift([
      kase('A', 'machining', 100, 130, 1000),   // 30% over, 30k impact
      kase('B', 'casting', 100, 115, 1000),     // 15% over, 15k impact
    ]);
    const ranked = rankFindings(findings, []);
    expect(ranked[0].partName).toBe('A');       // both hit-rate 0.5 → impact ordering preserved
  });

  it('stale nudges (no impact) sink to the bottom', () => {
    const findings = scanForDrift([
      kase('Fresh Gap', 'machining', 100, 140, 500),
      kase('Old One', 'casting', 100, undefined, 100, Date.now() - 200 * 86400000),
    ]);
    const ranked = rankFindings(findings, []);
    expect(ranked[ranked.length - 1].kind).toBe('stale-estimate');
  });
});

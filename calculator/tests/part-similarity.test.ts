import { describe, it, expect } from 'vitest';
import {
  fingerprintSimilarity, findSimilarCases, deriveSuggestions, proactiveInsights,
  type KnowledgeCase, type PartFingerprint,
} from '../src/engine/part-similarity.js';

let _id = 0;
const kase = (partName: string, fp: PartFingerprint, totalCost: number, extra: Partial<KnowledgeCase> = {}): KnowledgeCase =>
  ({ id: String(_id++), savedAt: 0, partName, fingerprint: fp, totalCost, currency: 'GBP', ...extra });

const bracketFp: PartFingerprint = { commodity: 'machining', materialId: 'mat-al6061', materialFamily: 'Aluminium', region: 'UK', netWeightKg: 0.85, annualVolume: 10000 };

const KB: KnowledgeCase[] = [
  kase('Bracket A', { ...bracketFp, netWeightKg: 0.9 }, 41.0, { actualCost: 44.0 }),
  kase('Bracket B', { ...bracketFp, netWeightKg: 0.7 }, 38.5, { userAdjusted: true }),
  kase('Bracket C', { ...bracketFp, netWeightKg: 1.0, region: 'DE' }, 45.2, { userAdjusted: true }),
  kase('Huge Housing', { ...bracketFp, netWeightKg: 60 }, 620, {}),                       // same family, wildly different size
  kase('PCB Board', { commodity: 'pcba', netWeightKg: 0.2, annualVolume: 10000 }, 55, {}), // different commodity
];

describe('part similarity — fingerprint matching', () => {
  it('different commodity scores zero (hard gate)', () => {
    expect(fingerprintSimilarity(bracketFp, { commodity: 'pcba' }).score).toBe(0);
  });

  it('near-identical part scores high and explains the match', () => {
    const { score, matchedOn } = fingerprintSimilarity(bracketFp, KB[0].fingerprint);
    expect(score).toBeGreaterThan(0.9);
    expect(matchedOn).toContain('material family');
    expect(matchedOn).toContain('weight');
  });

  it('same family but 70x the weight scores much lower', () => {
    const near = fingerprintSimilarity(bracketFp, KB[0].fingerprint).score;
    const far = fingerprintSimilarity(bracketFp, KB[3].fingerprint).score;
    expect(far).toBeLessThan(near - 0.2);
  });

  it('findSimilarCases returns the brackets, not the housing or the PCB', () => {
    const hits = findSimilarCases(bracketFp, KB, 3, 0.55);
    expect(hits.length).toBe(3);
    expect(hits.map(h => h.partName)).toEqual(expect.arrayContaining(['Bracket A', 'Bracket B', 'Bracket C']));
    expect(hits[0].similarity).toBeGreaterThanOrEqual(hits[2].similarity);
  });
});

describe('part similarity — suggestions & proactive insights', () => {
  const similar = findSimilarCases(bracketFp, KB, 3, 0.55);

  it('derives a median benchmark, material consensus and logged actuals', () => {
    const sugg = deriveSuggestions(similar, 40);
    expect(sugg.some(s => s.kind === 'benchmark' && s.text.includes('41.00'))).toBe(true);   // median of 41.0/38.5/45.2
    expect(sugg.some(s => s.kind === 'material' && s.text.includes('mat-al6061'))).toBe(true);
    expect(sugg.some(s => s.kind === 'actual' && s.text.includes('44.00'))).toBe(true);
    expect(sugg.every(s => s.sourceParts.length > 0)).toBe(true);                            // every suggestion cites sources
  });

  it('warns when the current estimate deviates >=15% from history', () => {
    const far = deriveSuggestions(similar, 60);   // vs median 41 → +46%
    expect(far.some(s => s.kind === 'warning')).toBe(true);
    const close = deriveSuggestions(similar, 42);
    expect(close.some(s => s.kind === 'warning')).toBe(false);
  });

  it('proactive insights flag deviation with the differing bucket, and note correction history', () => {
    const withBk = similar.map(s => ({ ...s, breakdown: { rawMaterial: 12, process: 20 } }));
    const ins = proactiveInsights(withBk, { totalCost: 60, breakdown: { rawMaterial: 12.5, process: 34 } }, KB.length);
    expect(ins.some(i => i.severity === 'attention' && i.text.includes('process'))).toBe(true);
    expect(ins.some(i => i.text.includes('manual corrections'))).toBe(true);   // 2 of 3 were userAdjusted
  });

  it('reports a cold-start message when nothing matches', () => {
    const ins = proactiveInsights([], { totalCost: 10 }, 12);
    expect(ins[0].text).toMatch(/No close matches/);
  });
});

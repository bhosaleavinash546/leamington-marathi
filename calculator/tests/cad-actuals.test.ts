/**
 * The real-prices sheet for the real CAD parts (scripts/cad-actuals.ts): every part it offers can be re-costed — it has
 * recorded geometry and stated answers — and the committed input carries no price (prices are entered by a person,
 * never by the tool).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REAL_PARTS } from '../scripts/cad-actuals.js';
import { ANSWERS } from '../scripts/real-parts-baseline.js';

describe('CAD actuals sheet', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string }>;
  it('offers only parts with recorded geometry and stated answers', () => {
    for (const p of REAL_PARTS) {
      expect(baseline.some(b => b.part === p), p).toBe(true);
      expect(ANSWERS[p], p).toBeDefined();
    }
  });
  it('the input lists exactly those parts, with no price filled in by the tool', () => {
    const rows = readFileSync('scripts/actuals/cad-actuals-input.csv', 'utf8').split('\n')
      .filter(l => l.trim() && !l.startsWith('#')).slice(1).map(l => l.split(','));
    expect(rows.map(r => r[0]).sort()).toEqual([...REAL_PARTS].sort());
    for (const r of rows) expect(r[5] ?? '', r[0]).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { parseActualsCsv, splitCsvLine } from '../src/engine/actuals-import.js';
import { computeCalibration } from '../src/engine/calibration.js';

const NOW = 1_700_000_000_000;

describe('splitCsvLine', () => {
  it('honours quoted fields containing commas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(splitCsvLine('x,"he said ""hi""",y')).toEqual(['x', 'he said "hi"', 'y']);
  });
});

describe('parseActualsCsv', () => {
  it('parses a flexible-header CSV into calibration records', () => {
    const csv = [
      'Part,Commodity,Region,Material,Estimate,Actual,Currency',
      'Knuckle,casting,CN,Aluminium,16.20,18.00,GBP',
      'Bracket,Injection Moulding,DE,PA6-GF,4.10,3.90,EUR',
    ].join('\n');
    const r = parseActualsCsv(csv, NOW);
    expect(r.imported).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.records[0]).toMatchObject({ commodity: 'casting', region: 'CN', materialFamily: 'Aluminium', shouldCost: 16.2, actualCost: 18, currency: 'GBP', note: 'Knuckle' });
    // commodity label normalised to the engine key
    expect(r.records[1].commodity).toBe('injection_moulding');
    expect(r.records[1].currency).toBe('EUR');
  });

  it('strips currency symbols and thousands separators from numbers', () => {
    const csv = 'commodity,estimate,actual\nmachining,"£1,234.50","£1,300"';
    const r = parseActualsCsv(csv, NOW);
    expect(r.records[0].shouldCost).toBeCloseTo(1234.5, 2);
    expect(r.records[0].actualCost).toBe(1300);
  });

  it('skips bad rows with a row-numbered error but keeps the good ones', () => {
    const csv = [
      'commodity,estimate,actual',
      'casting,100,120',
      'casting,,90',        // bad estimate
      'casting,100,abc',    // bad actual
      ',100,110',           // missing commodity
      'casting,100,130',
    ].join('\n');
    const r = parseActualsCsv(csv, NOW);
    expect(r.imported).toBe(2);
    expect(r.skipped).toBe(3);
    expect(r.errors.some(e => /Row 3/.test(e))).toBe(true);
    expect(r.errors.some(e => /Row 5.*commodity/.test(e))).toBe(true);
  });

  it('reports missing required columns instead of silently importing nothing', () => {
    const r = parseActualsCsv('commodity,price\ncasting,120', NOW);
    expect(r.imported).toBe(0);
    expect(r.errors[0]).toMatch(/Missing required column/);
    expect(r.errors[0]).toMatch(/estimate/);
  });

  it('preserves file order via savedAt when no date column, and parses a date when present', () => {
    const r1 = parseActualsCsv('commodity,estimate,actual\nforging,100,110\nforging,100,120', NOW);
    expect(r1.records[0].savedAt).toBeLessThan(r1.records[1].savedAt);
    const r2 = parseActualsCsv('commodity,estimate,actual,date\nforging,100,110,2026-01-15', NOW);
    expect(r2.records[0].savedAt).toBe(Date.parse('2026-01-15'));
  });

  it('imported actuals feed calibration — a segment crosses the threshold', () => {
    const csv = [
      'commodity,estimate,actual',
      'casting,100,118', 'casting,100,120', 'casting,100,122',
    ].join('\n');
    const { records } = parseActualsCsv(csv, NOW);
    const stats = computeCalibration(records, 'casting');
    expect(stats.applied).toBe(true);
    expect(stats.biasFactor).toBeCloseTo(1.2, 2);
  });
});

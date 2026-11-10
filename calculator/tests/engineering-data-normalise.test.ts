/**
 * Layer 3 — normalisation: numbers, units and comparison text.
 * A conversion is exact arithmetic on a defined factor; the text that was read is never altered; a roughness
 * parameter is never converted into another one.
 */
import { describe, it, expect } from 'vitest';
import {
  parseNumber, convertUnit, canonicalUnit, normaliseRoughness, canonicalText, comparisonKey, designationKey, normaliseParameter,
} from '../src/engine/engineering-data/normalise.js';
import { holeOf, threadOf, rangeOf, flagOf } from '../src/engine/engineering-data/values.js';
import { dp } from './engineering-data-helpers.js';

describe('numbers as a drawing writes them', () => {
  it.each([
    ['12,5', 12.5], ['12.5', 12.5], ['0,05', 0.05], ['.005', 0.005], ['1.234,5', 1234.5], ['1,234.5', 1234.5],
    ['−0,2', -0.2], ['+0.02', 0.02], [' 25 ', 25], [7, 7],
  ])('%s → %s', (text, n) => expect(parseNumber(text as string | number)).toBeCloseTo(n as number, 12));

  it.each(['', '  ', 'abc', '1,2,3', '1.2.3', 'M8', '±0.1', null, undefined])('%s is not a number — null, never 0', (text) => {
    expect(parseNumber(text as string)).toBeNull();
  });
});

describe('units', () => {
  it('inch → mm is exact (1 in = 25.4 mm)', () => {
    expect(convertUnit(1, 'in', 'mm')).toBe(25.4);
    expect(convertUnit(0.5, '"', 'mm')).toBe(12.7);
    expect(convertUnit(5, 'thou', 'mm')).toBeCloseTo(0.127, 12);
  });
  it('µin → µm is exact (× 0.0254)', () => {
    expect(convertUnit(125, 'µin', 'µm')).toBeCloseTo(3.175, 10);
    expect(convertUnit(32, 'uin', 'um')).toBeCloseTo(0.8128, 10);
  });
  it('mass, volume, area, density', () => {
    expect(convertUnit(1, 'lb', 'kg')).toBe(0.45359237);
    expect(convertUnit(1000, 'mm3', 'cm3')).toBeCloseTo(1, 12);
    expect(convertUnit(100, 'mm2', 'cm2')).toBeCloseTo(1, 12);
    expect(convertUnit(7850, 'kg/m3', 'g/cm3')).toBeCloseTo(7.85, 12);
  });
  it('refuses a conversion between different quantities, or from a unit it does not know', () => {
    expect(convertUnit(1, 'mm', 'kg')).toBeNull();
    expect(convertUnit(1, 'furlong', 'mm')).toBeNull();
    expect(convertUnit(1, undefined, 'mm')).toBeNull();
  });
  it('spells a unit one way', () => {
    expect(canonicalUnit('μm')).toBe('µm');
    expect(canonicalUnit('inch')).toBe('in');
    expect(canonicalUnit('°')).toBe('deg');
  });
});

describe('roughness', () => {
  it('Ra in µin becomes Ra in µm', () => {
    expect(normaliseRoughness({ parameter: 'Ra', value: 250, unit: 'µin' })).toEqual({ parameter: 'Ra', value: 6.35, unit: 'µm' });
    expect(normaliseRoughness({ parameter: 'Ra', value: 63, unit: 'µin' })!.value).toBeCloseTo(1.6002, 12);
  });
  it('Rz stays Rz — it is never converted to Ra', () => {
    const r = normaliseRoughness({ parameter: 'Rz', value: '6,3', unit: 'µm' })!;
    expect(r.parameter).toBe('Rz');
    expect(r.value).toBe(6.3);
  });
  it('an unreadable value is null', () => expect(normaliseRoughness({ parameter: 'Ra', value: 'N7' })).toBeNull());
});

describe('text for comparison', () => {
  it('ignores case, spacing and separators', () => {
    expect(comparisonKey('EN-GJS-500-7')).toBe(comparisonKey('en gjs 500 7'));
    expect(canonicalText('  iso   2768 - mK ')).toBe('ISO 2768 - MK');
  });
  it('a designation is the same with or without its standards prefix', () => {
    expect(designationKey('EN-GJS-500-7')).toBe(designationKey('GJS-500-7'));
    expect(designationKey('EN AW-6082')).toBe(designationKey('6082'));
    expect(designationKey('AA5754')).toBe(designationKey('5754'));
    expect(designationKey('EN-GJS-500-7')).not.toBe(designationKey('EN-GJS-500-14'));
  });
});

describe('a parameter in the dictionary unit', () => {
  it('a wall in inches becomes mm; what was read is kept', () => {
    const p = dp('part.wallThickness', 0.25, '.250 WALL', { unit: 'in' });
    const n = normaliseParameter(p);
    expect(n.value).toBe(6.35);
    expect(n.unit).toBe('mm');
    expect(n.rawText).toBe('.250 WALL');
    expect(n.note).toMatch(/converted from in to mm/);
    expect(p.value).toBe(0.25);            // the input is untouched
  });
  it('a hole callout in inches: the diameter and depth move, the count does not', () => {
    const n = normaliseParameter(dp('hole.diameter', { diameterMm: 0.5, depthMm: 1, count: 4 }, '4X Ø.500', { unit: 'in' }));
    expect(n.value).toEqual({ diameterMm: 12.7, depthMm: 25.4, count: 4 });
  });
  it('a roughness in µin moves to µm and keeps its parameter', () => {
    const n = normaliseParameter(dp('finish.roughnessGeneral', { parameter: 'Rz', value: 250 }, 'Rz 250', { unit: 'µin' }));
    expect(n.value).toEqual({ parameter: 'Rz', value: 6.35 });
    expect(n.unit).toBe('µm');
  });
  it('a value already in the dictionary unit, a text and an unknown unit are returned as they are', () => {
    const mm = dp('part.wallThickness', 3, '3', { unit: 'mm' });
    expect(normaliseParameter(mm)).toBe(mm);
    const t = dp('material.designation', 'EN-GJS-500-7');
    expect(normaliseParameter(t)).toBe(t);
    const odd = dp('part.wallThickness', 3, '3 cubits', { unit: 'cubit' });
    expect(normaliseParameter(odd).value).toBe(3);
  });
});

describe('reading structured values', () => {
  it('a hole callout in several spellings', () => {
    expect(holeOf(dp('hole.diameter', { diameterMm: 8.5, count: 4 }, '4x Ø8.5'))).toEqual({ diameterMm: 8.5, count: 4 });
    expect(holeOf(dp('hole.diameter', { diameter: '8,5', quantity: 4, through: true }, '4x Ø8,5 THRU'))).toEqual({ diameterMm: 8.5, count: 4, through: true });
    expect(holeOf(dp('hole.diameter', 25, 'Ø25 H7'))).toEqual({ diameterMm: 25, toleranced: true });
    expect(holeOf(dp('hole.diameter', 'Ø10', '2 HOLES Ø10'))).toEqual({ diameterMm: 10, count: 2 });
    expect(holeOf(dp('hole.diameter', { note: 'see view' }, 'SEE VIEW'))).toBeNull();
  });
  it('a thread callout', () => {
    expect(threadOf(dp('thread', 'M8', '4x M8'))).toEqual({ designation: 'M8', nominalMm: 8, count: 4 });
    expect(threadOf(dp('thread', { designation: 'M10x1', count: 2, depth: 15 }, '2x M10x1'))).toEqual({ designation: 'M10', nominalMm: 10, pitchMm: 1, count: 2, depthMm: 15 });
    expect(threadOf(dp('thread', 'G1/4', 'G1/4'))).toBeNull();
  });
  it('a figure or a range', () => {
    expect(rangeOf(0.8)).toEqual({ min: 0.8, max: 0.8 });
    expect(rangeOf('0,8-1,2')).toEqual({ min: 0.8, max: 1.2 });
    expect(rangeOf({ min: 0.8, max: 1.2 })).toEqual({ min: 0.8, max: 1.2 });
    expect(rangeOf('deep')).toBeNull();
  });
  it('a flag', () => {
    expect(flagOf(true)).toBe(true);
    expect(flagOf('NO')).toBe(false);
    expect(flagOf('maybe')).toBeNull();
  });
});

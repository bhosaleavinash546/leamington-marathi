/**
 * The CAD screen's annual volume survives the swap to the commodity form (7-country review, 3 Nov 2026): a part costed at
 * 200,000 a year had its route comparison — and any re-analysis — run at 100,000, because #cad-annual-volume is not in the
 * page after Get cost and every reader fell back to a literal '100000'.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cadAnnualVolumeText, CAD_VOLUME_DEFAULT } from '../src/ui/cad-volume.js';

describe('the CAD annual volume', () => {
  it('the field when the CAD screen is drawn', () => {
    expect(cadAnnualVolumeText({ value: '200000' }, '150000')).toBe('200000');
  });
  it('the value the engineer gave when the screen is swapped out — never the default', () => {
    expect(cadAnnualVolumeText(null, '200000')).toBe('200000');
    expect(cadAnnualVolumeText(undefined, ' 200000 ')).toBe('200000');
  });
  it('the field\'s own default only when nothing was given', () => {
    expect(cadAnnualVolumeText(null, undefined)).toBe(CAD_VOLUME_DEFAULT);
    expect(cadAnnualVolumeText({ value: '' }, undefined)).toBe(CAD_VOLUME_DEFAULT);
  });
  it('no reader takes the field with a literal fallback (the route comparison did)', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).not.toMatch(/getElementById\('cad-annual-volume'\)[^\n]*\?\.value[^\n]*\?\?\s*'100000'/);
    expect(main).toMatch(/annualVolume: cadAnnualVolume\(\)/);
  });
});

/**
 * Fixes from the live end-to-end run on a real 77 GHz radar board (NXP S32R294 +
 * TEF8105, 8 layers, 87.8 × 48.9 mm, immersion silver, 328 placements, 250k/yr CN).
 * Each test is one thing that board exposed.
 */
import { describe, it, expect } from 'vitest';
import { stabiliseBoardSpec } from '../server/utils/pcb-boardspec-stabilise.js';
import { computePCBCountryCost, normaliseFinish } from '../server/data/pcb-country-rates.js';
import { capUnconfirmedPrices } from '../server/utils/pcb-bom-grounding.js';
import { icKnownRange } from '../server/routes/pcb.js';

const radarAsm = { smtPlacements: 328, bgaCount: 2, throughHoleJoints: 0 };
const radarSpec = () => ({ widthMm: 87.8, heightMm: 48.9, estimatedLayers: 8, throughVias: 1000,
  surfaceFinish: 'imag', hdiStructure: 'none', impedanceControlRequired: true, bgaDetected: true });

describe('board size: measured is kept, estimated is stabilised', () => {
  it('keeps a measured 87.8 × 48.9 mm board exactly (it became 161 × 89)', () => {
    const s = { ...radarSpec(), dimensionsSource: 'measured' };
    stabiliseBoardSpec(s, radarAsm, 'automotive_adas');
    expect([s.widthMm, s.heightMm]).toEqual([87.8, 48.9]);
  });
  it('still stabilises the same size when it is only an AI estimate', () => {
    const s = { ...radarSpec(), dimensionsSource: 'estimated' };
    stabiliseBoardSpec(s, radarAsm, 'automotive_adas');
    expect(Number(s.widthMm) * Number(s.heightMm)).toBeGreaterThan(87.8 * 48.9 * 1.5);
  });
});

describe('surface finish', () => {
  it('keeps immersion silver on a BGA board, and moves only HASL to ENIG', () => {
    const silver = radarSpec(); stabiliseBoardSpec(silver, radarAsm, 'automotive_adas');
    expect(silver.surfaceFinish).toBe('imag');
    const hasl = { ...radarSpec(), surfaceFinish: 'hasl' }; stabiliseBoardSpec(hasl, radarAsm, 'automotive_adas');
    expect(hasl.surfaceFinish).toBe('enig');
  });
  it('resolves every spelling of immersion silver to one price, below ENIG', () => {
    for (const f of ['imag', 'iteq', 'Immersion Silver', 'immersion_silver', 'SILVER']) expect(normaliseFinish(f)).toBe('iteq');
    const base = { widthMm: 87.8, heightMm: 48.9, layers: 8, throughVias: 500, blindVias: 0, microVias: 0,
      hdiStructure: 'none', impedanceControlled: true, smtPlacements: 328, throughHoleJoints: 0, manualJoints: 0,
      bgaCount: 2, aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 0, totalBOMCostGBP: 40, orderQuantity: 250000 };
    const imag = computePCBCountryCost({ ...base, surfaceFinish: 'Immersion Silver' }, 'cn');
    const enig = computePCBCountryCost({ ...base, surfaceFinish: 'enig' }, 'cn');
    expect(imag.breakdown.pcbSurface).toBeLessThan(enig.breakdown.pcbSurface);
  });
});

describe('price grounding', () => {
  const line = (o: Record<string, unknown>) => ({ qty: 1, needsVerification: false, ...o });
  it('holds an OCR-confirmed S32R294 in the tool’s own £22–48 range, not the £18 BGA median', () => {
    const { bom } = capUnconfirmedPrices([line({ partNumber: 'FS32R294KCMJD', description: 'radar MCU', componentType: 'ic_bga',
      unitPriceGBP: 22.88, ocrExtracted: true, lineConf: 1 })], icKnownRange);
    expect(bom[0].unitPriceGBP).toBe(22.88);
    expect(bom[0].priceSource).toBe('known-range');
    expect(bom[0].needsVerification).toBe(true);   // a range is still not a quote
  });
  it('still caps the same part to the class median when it was not read off the chip', () => {
    const { bom } = capUnconfirmedPrices([line({ partNumber: 'FS32R294KCMJD', componentType: 'ic_bga',
      unitPriceGBP: 26, ocrExtracted: false, lineConf: 0.6 })], icKnownRange);
    expect(bom[0].unitPriceGBP).toBe(18);
  });
  it('does not cap a power inductor at a chip capacitor’s £0.08', () => {
    const { bom } = capUnconfirmedPrices([line({ description: 'Power inductors (molded 4x4 mm)', componentType: 'passive_0805',
      unitPriceGBP: 0.158, partNumber: '' })]);
    expect(bom[0].unitPriceGBP).toBe(0.158);
  });
  it('the radar transceiver range agrees with the automotive prompt (£9–22, was £25–90)', () => {
    expect(icKnownRange({ partNumber: 'TEF8105' })).toMatchObject({ lo: 9, hi: 22 });
  });
});

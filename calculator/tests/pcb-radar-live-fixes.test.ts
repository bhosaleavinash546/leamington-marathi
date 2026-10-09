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
  it('an AI-estimated size that is physically plausible is kept too (it used to be inflated >1.5×)', () => {
    const s = { ...radarSpec(), dimensionsSource: 'estimated' };
    stabiliseBoardSpec(s, radarAsm, 'automotive_adas');
    expect(Number(s.widthMm) * Number(s.heightMm)).toBeCloseTo(88 * 49, -2);
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
  it('prices an OCR-confirmed S32R294 at the tool point of its own range (£18–34), not the model’s figure', () => {
    const { bom } = capUnconfirmedPrices([line({ partNumber: 'FS32R294KCMJD', description: 'radar MCU', componentType: 'ic_bga',
      unitPriceGBP: 22.88, ocrExtracted: true, lineConf: 1 })], icKnownRange);
    expect(bom[0].unitPriceGBP).toBe(22);             // £18–34: the tool's lower-half midpoint, not the model's £22.88
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
    expect(bom[0].unitPriceGBP).toBeGreaterThan(0.08);   // its own row (power inductor), at the table point
    expect(bom[0].priceBasis).toMatch(/passive_0805\.ind/);
  });
  it('the radar transceiver range agrees with the automotive prompt (£9–22, was £25–90)', () => {
    expect(icKnownRange({ partNumber: 'TEF8105' })).toMatchObject({ lo: 9, hi: 22 });
  });
});

// ── Round 2: the open items from the live run ────────────────────────────────
import { anchorBandToHeadline, computeAutomotiveAssemblyCost, enforceAutomotiveGrading, runSanityChecks } from '../server/routes/pcb.js';
import { copperLayersFromSpec } from '../server/utils/pcb-boardspec-stabilise.js';

const radarInput = (o: Record<string, unknown> = {}) => ({ widthMm: 87.8, heightMm: 48.9, layers: 8, surfaceFinish: 'imag',
  throughVias: 1000, blindVias: 0, microVias: 0, hdiStructure: 'none', impedanceControlled: true, smtPlacements: 328,
  throughHoleJoints: 0, manualJoints: 0, bgaCount: 2, aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 0,
  totalBOMCostGBP: 47, orderQuantity: 250000, ...o });

describe('one total on every panel', () => {
  it('the confidence band mid IS the headline country total, spread kept', () => {
    const bd = computePCBCountryCost(radarInput(), 'cn');
    const band = { bomCostLow: 40, bomCostMid: 47, bomCostHigh: 70, fabCostLow: 7, fabCostMid: 10, fabCostHigh: 14, totalLow: 47, totalMid: 57, totalHigh: 84 };
    const a = anchorBandToHeadline(band, bd)!;
    expect(a.totalMid).toBe(Math.round(bd.totalPerBoard * 100) / 100);
    expect(a.totalLow).toBeLessThan(a.totalMid);
    expect(a.totalHigh).toBeGreaterThan(a.totalMid);
  });
});

describe('heavy copper is costed, per layer', () => {
  it('70/70/35/35/35/35/70/70 µm costs more than all-1 oz, by the 25 CNY/m²-per-0.5 oz surcharge', () => {
    const one = computePCBCountryCost(radarInput(), 'cn');
    const heavy = computePCBCountryCost(radarInput({ copperOzByLayer: [2, 2, 1, 1, 1, 1, 2, 2] }), 'cn');
    expect(one.breakdown.pcbCopper).toBe(0);
    expect(heavy.breakdown.pcbCopper).toBeGreaterThan(0.05);
    expect(heavy.pcbFabPerBoard).toBeGreaterThan(one.pcbFabPerBoard);
  });
  it('a single copperWeightOz applies to the two outer layers', () => {
    expect(copperLayersFromSpec({ copperWeightOz: 2, estimatedLayers: 4 })).toEqual([2, 1, 1, 2]);
    expect(copperLayersFromSpec({ copperWeightOz: 1, estimatedLayers: 4 })).toBeUndefined();
    expect(copperLayersFromSpec({ copperOzByLayer: [2, 1, 1, 2], copperWeightOz: 1 })).toEqual([2, 1, 1, 2]);
  });
  it('a measured weight drives freight (26.4 g, not the ~96 g estimate)', () => {
    const est = computePCBCountryCost(radarInput({ orderQuantity: 100 }), 'cn');
    const meas = computePCBCountryCost(radarInput({ orderQuantity: 100, weightKg: 0.0264 }), 'cn');
    expect(meas.breakdown.logistics).toBeLessThanOrEqual(est.breakdown.logistics);
  });
});

describe('via fences are not clamped away', () => {
  it('keeps ~1,000 vias on the 43 cm² radar board (was cut to 556)', () => {
    const s = { ...radarSpec(), dimensionsSource: 'measured' };
    stabiliseBoardSpec(s, radarAsm, 'automotive_adas');
    expect(s.throughVias).toBe(1000);
  });
});

describe('automotive re-grading', () => {
  it('uplifts only a line the model priced as consumer grade', () => {
    const { bom } = enforceAutomotiveGrading([
      { componentType: 'ic_soic', unitPriceGBP: 0.5, qty: 1, automotive: false },
      { componentType: 'ic_soic', unitPriceGBP: 0.5, qty: 1, automotive: false, automotiveUnstated: true },
      { componentType: 'ic_soic', unitPriceGBP: 0.5, qty: 1, automotive: false, ocrExtracted: true },
    ], 'automotive_adas');
    expect(bom.map(l => l.unitPriceGBP)).toEqual([1.75, 0.5, 0.5]);
  });
});

describe('automotive assembly panel at volume', () => {
  it('builds on the country assembly with no second X-ray and no burn-in for ASIL-B', () => {
    const c = computeAutomotiveAssemblyCost({ smtPlacements: 328, bgaCount: 2 }, 'ASIL-B', 250000, 5.33);
    expect(c.axiCostGBP).toBe(0);
    expect(c.burnInGBP).toBe(0);
    expect(c.serialisationGBP).toBe(0.05);
    expect(c.totalAutomotiveAssemblyGBP).toBeLessThan(5.33 * 1.3);
  });
});

describe('annual volume', () => {
  it('warns that quantity 1 is a prototype price, not a should-cost', () => {
    const w = runSanityChecks({ widthMm: 87.8, heightMm: 48.9 }, { smtPlacements: 328 }, [], 0, 1);
    expect(w.some(x => x.code === 'PROTOTYPE_VOLUME')).toBe(true);
    expect(runSanityChecks({ widthMm: 87.8, heightMm: 48.9 }, { smtPlacements: 328 }, [], 0, 250000).some(x => x.code === 'PROTOTYPE_VOLUME')).toBe(false);
  });
});

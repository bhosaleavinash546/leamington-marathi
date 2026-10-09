/**
 * PCB photo → BOM → cost pipeline fixes (review of 9 Oct 2026, docs/pcb/pcb-pipeline-review-2026-10-09.md).
 * Every test runs the real Stage 4 (runStage4) on the committed radar fixture and changes ONE thing the model said:
 * the headline must not move unless evidence moved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4 } from '../server/routes/pcb.js';
import { gateIdentities } from '../server/utils/pcb-identity.js';

const R = JSON.parse(readFileSync(new URL('../e2e/fixtures/pcb-radar-replies.json', import.meta.url), 'utf8'));
const ocr = { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] };

async function radar(mut?: (a: any) => void, opts: { qty?: number; country?: string } = {}) {
  const a = JSON.parse(JSON.stringify(R.analysis));
  mut?.(a);
  const log = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {};
  try {
    const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'ASIL-C' as never, ocrResult: ocr,
      country: opts.country ?? 'cn', orderQty: opts.qty ?? 200_000, tag: '/test' });
    return { a, s4, total: s4.selectedCountryBreakdown!.totalPerBoard };
  } finally { console.log = log; console.warn = warn; }
}

describe('F1 — a part number counts only with evidence', () => {
  it('a part number the model invents is shown as a suggestion and never priced from the catalogue', async () => {
    const base = await radar();
    for (const ocrClaim of [false, true]) {
      const r = await radar(a => Object.assign(a.bom[1], { partNumber: 'TDA4VH', ocrExtracted: ocrClaim, lineConf: ocrClaim ? 1 : 0.7 }));
      expect(r.total).toBe(base.total);                                   // was £144.57 against £53.31
      // the suggestion is kept for the engineer; the line then takes the marking OCR read on its chip (TEF8105)
      const u2 = r.a.bom.find((l: any) => l.suggestedPartNumber === 'TDA4VH');
      expect(u2?.partNumber).toBe('TEF8105');
      expect(r.a.bom.some((l: any) => l.catalogueMpn && /TDA4VH/.test(l.catalogueMpn))).toBe(false);
      expect(r.s4.sanityWarnings.some((w: any) => w.code === 'PART_NUMBER_NOT_EVIDENCED')).toBe(true);
    }
  });

  it('OCR-agreed, BOM-file and user-corrected part numbers stay', () => {
    const { bom, withheld } = gateIdentities([
      { refDes: 'U1', partNumber: 'S32R294', ocrExtracted: true },
      { refDes: 'U2', partNumber: 'TJA1044GT', bomSource: 'file' },
      { refDes: 'U3', partNumber: 'TJA1044GT', bomSource: 'image' },
      { refDes: 'U4', partNumber: 'TCAN1044', userCorrected: true },
      { refDes: 'U5', partNumber: 'TDA4VH' },
      { refDes: 'C1', partNumber: '' },
    ]);
    expect(bom.map(l => l.identityEvidence)).toEqual(['ocr', 'bom-file', 'bom-file', 'user', 'none', undefined]);
    expect(bom[4].partNumber).toBe('');
    expect(bom[4].suggestedPartNumber).toBe('TDA4VH');
    expect(withheld).toEqual(['U5 TDA4VH']);
  });
});

import { capUnconfirmedPrices } from '../server/utils/pcb-bom-grounding.js';
import { classMedianCap } from '../server/utils/pcb-price-catalogue.js';

describe('F2 / F12 / F15 — the model\'s price estimate never chooses the price', () => {
  it('random model prices and automotive flags leave the headline unchanged', async () => {
    const base = await radar();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 4; i++) {
      const r = await radar(a => a.bom.forEach((l: any) => { l.unitPriceGBP = rnd() < 0.5 ? rnd() * 1e6 : rnd() * 1e-3; l.automotive = rnd() < 0.5; }));
      expect(r.total).toBe(base.total);
    }
  });

  it('an unread IC the model calls an "ADAS radar processor" is bounded by the unidentified-BGA median', () => {
    const { bom } = capUnconfirmedPrices([{ refDes: 'U2', componentType: 'ic_bga', description: 'ADAS radar processor', partNumber: '', qty: 1, unitPriceGBP: 400 }]);
    expect(bom[0].unitPriceGBP).toBeLessThanOrEqual(classMedianCap('ic_bga', Infinity));   // was the £60–400 row
  });

  it('an imager takes the imager rule whatever component type the model gave it', () => {
    const at = (ct: string) => capUnconfirmedPrices([{ refDes: 'U1', componentType: ct, description: 'AR0233AT image sensor', partNumber: '', qty: 1, unitPriceGBP: 20 }], undefined, { automotive: true }).bom[0];
    const bga = at('ic_bga'), qfn = at('ic_qfn'), soic = at('ic_soic');
    expect(qfn.unitPriceGBP).toBe(bga.unitPriceGBP);                 // was £3.52 v £13.20
    expect(soic.unitPriceGBP).toBe(bga.unitPriceGBP);
    expect(String(bga.priceBasis)).toMatch(/imager/);
  });

  it('a named imager range (Sony IMX) does not override the imager rule', () => {
    const named = () => ({ lo: 8, hi: 35, label: 'Sony IMX image sensor' });
    const { bom } = capUnconfirmedPrices([{ refDes: 'U1', componentType: 'ic_bga', description: 'Sony IMX390', partNumber: 'IMX390', ocrExtracted: true, lineConf: 1, qty: 1, unitPriceGBP: 30 }], named, { automotive: true });
    expect(bom[0].priceSource).toBe('class-range');
    expect(String(bom[0].priceBasis)).toMatch(/imager/);
    expect(bom[0].unitPriceGBP).toBeLessThanOrEqual(15);
  });
});

import { gateBoardEvidence } from '../server/utils/pcb-boardspec-stabilise.js';

describe('F3 / F4 — board figures the model gives stand only with evidence', () => {
  it('model vias, joints, copper and weight with no evidence leave the headline unchanged', async () => {
    const base = await radar();
    for (const mut of [
      (a: any) => { a.boardSpec.microVias = 5000; },
      (a: any) => { a.boardSpec.blindVias = 3000; },
      (a: any) => { a.boardSpec.copperOzByLayer = [6, 6, 6, 6, 6, 6, 6, 6]; },
      (a: any) => { a.boardSpec.boardWeightG = 3000; },
      (a: any) => { a.assembly.manualJoints = 3000; },
      (a: any) => { a.assembly.throughHoleJoints = 5000; },
    ]) expect((await radar(mut)).total).toBe(base.total);
  });

  it('a "measured" size the model claims is an estimate unless the OCR board text shows it', () => {
    const s1: Record<string, unknown> = { widthMm: 240, heightMm: 240, dimensionsSource: 'measured' };
    expect(gateBoardEvidence(s1, ['PCB REV 2.1']).length).toBe(1);
    expect(s1.dimensionsSource).toBe('estimated');
    const s2: Record<string, unknown> = { widthMm: 20, heightMm: 20, dimensionsSource: 'measured' };
    expect(gateBoardEvidence(s2, ['BOARD 20.0 x 20.0 mm'])).toEqual([]);
    expect(s2.dimensionsEvidence).toBe('board-text');
    // a size the fab files or the user gave is kept without asking the board text
    const s3: Record<string, unknown> = { widthMm: 87.8, heightMm: 48.9, dimensionsSource: 'measured', dimensionsEvidence: 'fab-data' };
    expect(gateBoardEvidence(s3, [])).toEqual([]);
    expect(s3.dimensionsSource).toBe('measured');
  });

  it('copper read from a board-data table stands when the table is in the board text', () => {
    const s: Record<string, unknown> = { copperOzByLayer: [2, 1, 1, 2] };
    expect(gateBoardEvidence(s, ['Stack-up: 70um / 35um / 35um / 70um'])).toEqual([]);
    expect(s.copperEvidence).toBe('board-text');
    const t: Record<string, unknown> = { copperOzByLayer: [6, 6] };
    gateBoardEvidence(t, ['PCB REV A']);
    expect(t.copperOzByLayer).toEqual([]);
  });
});

import { catalogueEntry, isExactCatalogueMatch } from '../server/utils/pcb-price-catalogue.js';
import { groundAndSplit, offlineCataloguePrices } from '../server/utils/pcb-bom-grounding.js';

describe('F5 / F19 — a device variant is not priced as its sibling', () => {
  it('a variant letter the catalogue does not show after the stem is another device', () => {
    for (const k of ['TDA4VEN', 'TDA4VEN-Q1', 'TCAN1042A', 'SJA1110C', 'L9963Z']) expect(catalogueEntry(k), k).toBeNull();
  });
  it('packaging and temperature suffixes the catalogue does show still resolve', () => {
    expect(catalogueEntry('W25Q32JWSSIM')?.family).toBe('W25Q32JW');
    expect(catalogueEntry('TJA1044GT/3Z')?.family).toBe('TJA1044');
    expect(catalogueEntry('MAX20431AATIF/V+')?.family).toBe('MAX20431');
    expect(isExactCatalogueMatch('TJA1044GT/3Z', catalogueEntry('TJA1044GT/3Z')!)).toBe(true);   // a packing tail
  });
  it('the short form of a "-Q1" family finds it (DS90UB953)', () => {
    expect(catalogueEntry('DS90UB953')?.mpn).toBe(catalogueEntry('DS90UB953-Q1')?.mpn);
  });
  it('a family price is labelled and listed to verify', () => {
    const out = groundAndSplit([{ refDes: 'U1', partNumber: 'STM32F407VGT6', componentType: 'ic_tqfp', qty: 1, unitPriceGBP: 5, ocrExtracted: true, lineConf: 1 }],
      offlineCataloguePrices(['STM32F407VGT6'], 200_000));
    expect(out.bom[0].priceSource).toBe('catalogue');
    expect(out.bom[0].catalogueExact).toBe(false);
    expect(out.bom[0].needsVerification).toBe(true);
    expect(String(out.bom[0].priceNote)).toMatch(/^Family price/);
  });
});

import { getVolumeMultiplier } from '../server/routes/pcb.js';
import { materialBurdenFor } from '../server/data/pcb-country-rates.js';

describe('F6 / F7 / F8 — volume is continuous and the curve agrees with a re-run', () => {
  it('no cliff at 100,000 boards', async () => {
    const [a, b] = [await radar(undefined, { qty: 99_999 }), await radar(undefined, { qty: 100_001 })];
    expect(Math.abs(a.total - b.total) / a.total).toBeLessThan(0.001);   // was −4.2 %
    for (const q of [9_999, 99_999]) expect(Math.abs(materialBurdenFor(q) - materialBurdenFor(q + 2))).toBeLessThan(0.0005);
  });
  it('table prices fall continuously with parts bought, flat above 300k, 1.00 at the 10k basis', () => {
    expect(getVolumeMultiplier(10_000)).toBe(1);
    expect(getVolumeMultiplier(100_000)).toBeCloseTo(0.85, 3);              // the catalogue's franchise curve
    expect(getVolumeMultiplier(300_000)).toBeLessThan(getVolumeMultiplier(200_000));
    expect(getVolumeMultiplier(3_000_000)).toBe(getVolumeMultiplier(300_000));
    expect(getVolumeMultiplier(1_000)).toBeGreaterThan(getVolumeMultiplier(5_000));
  });
  it('the volume curve point at 100k equals a run at 100k, whatever volume was analysed', async () => {
    const run100 = (await radar(undefined, { qty: 100_000 })).total;
    for (const q of [200_000, 300_000]) {
      const r = await radar(undefined, { qty: q });
      const pt = (r.s4.volumeCurves.cn as Array<{ qty: number; totalPerBoard: number }>).find(p => p.qty === 100_000)!;
      expect(Math.abs(pt.totalPerBoard - run100)).toBeLessThanOrEqual(0.02);   // was £58.21 / £57.40 against £56.19
    }
  });
});

describe('F20 — no "Program BOM saving" on top of volume prices', () => {
  it('Stage 4 no longer computes a programme discount', async () => {
    const r = await radar();
    expect(r.s4.programPricing).toBeNull();
  });
});

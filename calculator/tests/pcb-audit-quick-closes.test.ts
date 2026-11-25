/**
 * EDU audit quick closes (Nov 2026): G-10 delivery terms, G-11 first-pass yield, G-16 / M-06 the two ranges apart,
 * G-18 the information request, G-19 a contract exchange rate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computePCBCountryCost, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { runStage4 } from '../server/routes/pcb.js';
import { pcbInfoRequest } from '../src/export/pcb-info-request.js';
import { buildPcbaReport } from '../src/export/pcba-report-data.js';
import { FX_TO_GBP_TABLE } from '../src/engine/insights.js';

const base: PCBCostInput = { widthMm: 100, heightMm: 80, layers: 4, surfaceFinish: 'enig', throughVias: 0, blindVias: 0, microVias: 0, hdiStructure: 'none',
  impedanceControlled: false, smtPlacements: 400, throughHoleJoints: 0, manualJoints: 0, bgaCount: 0, aoiRequired: true, ictTimeSec: 0,
  conformalCoatAreaCm2: 0, totalBOMCostGBP: 30, orderQuantity: 10_000 };

describe('G-10 delivery terms', () => {
  it('ex-works: no freight, no UK duty; delivered: the unpriced legs are listed', () => {
    const dap = computePCBCountryCost(base, 'cn'), exw = computePCBCountryCost({ ...base, deliveryTerms: 'EXW' }, 'cn');
    expect(exw.logisticsPerBoard).toBe(0);
    expect(exw.deliveryTerms).toBe('EXW');
    expect(exw.totalPerBoard).toBeCloseTo(dap.totalPerBoard - dap.logisticsPerBoard, 1);
    expect(exw.basis!.some(l => l.item === 'Freight and UK duty' && l.gbp === 0)).toBe(true);
    expect(dap.basis!.find(l => l.item === 'Not in the freight (delivered terms)')!.source).toMatch(/customs broker/);
  });
  it('the report follows the terms: no freight, duty or delivered rows ex-works', async () => {
    const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
    const a = JSON.parse(JSON.stringify(src.analysis)); a.boardSpec.deliveryTerms = 'EXW';
    const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' });
    const bd = s4.selectedCountryBreakdown!;
    expect(bd.logisticsPerBoard).toBe(0);
    const rep = buildPcbaReport({ ...a, _selectedCountryBreakdown: bd, _countryComparison: s4.countryComparison, _confidenceBand: s4.confidenceBand, _orderQty: 10_000 } as never);
    expect(rep.termsLabel).toMatch(/ex-works/);
    expect(rep.stack.some(r => r.key === 'delivered' || r.key === 'freight' || r.key === 'duty')).toBe(false);
    expect(rep.basis).toMatch(/ex-works at the factory gate/);
  }, 60_000);
});

describe('G-11 first-pass yield', () => {
  it('a typed FPY sets the boards reworked; without it the dppm table, said to be unsourced', () => {
    const t = computePCBCountryCost(base, 'cn'), f = computePCBCountryCost({ ...base, firstPassYield: 0.97 }, 'cn');
    const lineT = t.basis!.find(l => l.item === 'Cost of quality')!, lineF = f.basis!.find(l => l.item === 'Cost of quality')!;
    expect(lineF.formula).toMatch(/λ = 1 − FPY 0\.97 = 0\.0300/);
    expect(lineT.source).toMatch(/no source — type a first-pass yield/);
    expect(computePCBCountryCost({ ...base, firstPassYield: 0.2 }, 'cn').breakdown.yieldLoss).toBe(t.breakdown.yieldLoss);   // out of range: ignored
  });
});

describe('G-16 / M-06 the two ranges, G-19 contract FX (Stage 4 on the EDU board)', () => {
  const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
  const run = (patch: Record<string, unknown> = {}) => {
    const a = JSON.parse(JSON.stringify(src.analysis)); Object.assign(a.boardSpec, patch);
    return runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' })
      .then(s4 => ({ s4, a }));
  };
  it('on global prices the sourced range carries the China market below; at the market, global above', async () => {
    const g = await run(), l = await run({ componentMarket: 'local' });
    const cg = g.s4.confidenceBand!.conditional!, cl = l.s4.confidenceBand!.conditional!;
    expect(cg.items[0].label).toMatch(/China market/);
    expect(cg.low).toBeLessThan(g.s4.selectedCountryBreakdown!.totalPerBoard);
    expect(cg.high).toBe(g.s4.selectedCountryBreakdown!.totalPerBoard);
    expect(cl.items[0].label).toMatch(/global distributor/);
    expect(cl.high).toBeGreaterThan(l.s4.selectedCountryBreakdown!.totalPerBoard);
    expect(g.s4.confidenceBand!.totalLow).toBeLessThan(cg.low);   // the judgement corridor is the wider one
  }, 90_000);
  it('a contract US$ / £ re-prices catalogue and class lines; the engineer\'s line keeps its price', async () => {
    const g = await run(), f = await run({ contractUsdPerGbp: 1.25 });
    const factor = (1 / 1.25) / FX_TO_GBP_TABLE.USD;
    expect(f.s4.contractFx).toEqual({ usdPerGbp: 1.25, factor: Math.round(factor * 10000) / 10000 });
    const by = (x: typeof g, ref: string) => (x.a.bom as Array<Record<string, unknown>>).find(l => l.refDes === ref)!;
    expect(Number(by(f, 'AURIX pair').unitPriceGBP)).toBe(13.4);
    expect(Number(by(f, 'C 0603 group').unitPriceGBP)).toBeCloseTo(Number(by(g, 'C 0603 group').unitPriceGBP) * factor, 4);
    expect(String(by(f, 'C 0603 group').priceNote)).toMatch(/contract FX/);
  }, 90_000);
});

describe('G-18 information request', () => {
  it('ten items, ticked from what the costing holds', () => {
    const none = pcbInfoRequest({ bom: [{}], boardSpec: {} });
    expect(none).toHaveLength(10);
    expect(none.every(i => !i.have)).toBe(true);
    const some = pcbInfoRequest({ bom: [{ bomSource: 'file' }], boardSpec: { dimensionsSource: 'measured', boardWeightG: 552, asilConfirmed: 'ASIL-B', programmeYears: 6, lotSize: 1000, deliveryTerms: 'EXW', firstPassYield: 0.97 },
      _verifyList: [{ rank: 1, status: 'confirmed' }, { rank: 2, status: 'confirmed' }, { rank: 3, status: 'confirmed' }] });
    expect(some.filter(i => i.have).map(i => i.n)).toEqual([1, 3, 4, 5, 6, 9, 10]);
  });
});

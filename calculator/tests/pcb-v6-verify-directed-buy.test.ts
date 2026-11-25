/**
 * EDU v6 — the lines to verify first, and parts the customer supplies (directed buy / consignment).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyList, customerSuppliedGBP } from '../server/utils/pcb-verify-list.js';
import { computePCBCountryCost, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { runStage4 } from '../server/routes/pcb.js';

describe('verify list', () => {
  const bom = [
    { refDes: 'U1', description: 'MCU', qty: 2, lineTotalGBP: 26.8, priceSource: 'user', userCorrected: true },
    { refDes: 'C1', description: 'MLCC', qty: 300, lineTotalGBP: 4.2, priceSource: 'class-range' },
    { refDes: 'U2', description: 'PMIC', qty: 2, lineTotalGBP: 6.1, priceSource: 'catalogue', catalogueExact: true, identityEvidence: 'ocr' },
    { refDes: 'U3', description: 'op-amp', qty: 3, lineTotalGBP: 0.5, priceSource: 'catalogue', catalogueExact: false },
    { refDes: 'R1', description: 'res', qty: 10, lineTotalGBP: 0, priceSource: 'not-fitted' },
  ];
  it('ranks the dearest lines, with what stands behind each price', () => {
    const v = verifyList(bom, 3);
    expect(v.map(l => l.refDes)).toEqual(['U1', 'U2', 'C1']);
    expect(v[0]).toMatchObject({ rank: 1, status: 'confirmed', why: "the engineer's price" });
    expect(v[1]).toMatchObject({ status: 'confirmed' });
    expect(v[2]).toMatchObject({ status: 'to verify' });
    expect(v[2].why).toMatch(/class range/);
    expect(v[0].share).toBeCloseTo(26.8 / 37.6, 6);
  });
  it('a family price is to verify; a £0 line is not listed', () => {
    const v = verifyList(bom);
    expect(v.find(l => l.refDes === 'U3')!.why).toMatch(/family price/);
    expect(v.some(l => l.refDes === 'R1')).toBe(false);
  });
  it('sums the customer-supplied parts', () => {
    expect(customerSuppliedGBP([{ lineTotalGBP: 26.8, customerSupplied: true }, { lineTotalGBP: 5 }])).toBe(26.8);
  });
});

describe('customer-supplied parts: no EMS burden, off the EMS invoice', () => {
  const base: PCBCostInput = { widthMm: 100, heightMm: 80, layers: 4, surfaceFinish: 'enig', throughVias: 200, blindVias: 0, microVias: 0,
    hdiStructure: 'none', impedanceControlled: false, smtPlacements: 300, throughHoleJoints: 0, manualJoints: 0, bgaCount: 0, aoiRequired: true,
    ictTimeSec: 0, conformalCoatAreaCm2: 0, totalBOMCostGBP: 50, orderQuantity: 10_000 };
  it('the burden is on the parts the EMS buys; the invoice is the board less the customer\'s parts', () => {
    const a = computePCBCountryCost(base, 'cn');
    const b = computePCBCountryCost({ ...base, customerSuppliedGBP: 20 }, 'cn');
    const pct = a.breakdown.materialBurdenPct!;
    expect(a.breakdown.materialBurden).toBeCloseTo(50 * pct, 2);
    expect(b.breakdown.materialBurden).toBeCloseTo(30 * pct, 2);
    expect(b.breakdown.customerSupplied).toBe(20);
    expect(b.emsInvoicePerBoard).toBeCloseTo(b.totalPerBoard - 20, 2);
    expect(a.emsInvoicePerBoard).toBe(a.totalPerBoard);
    expect(b.basis!.find(l => l.item === 'EMS material burden')!.formula).toMatch(/customer-supplied/);
  });
  it('on the EDU board, the AURIX pair supplied by the customer: off the invoice, kept through a re-price', async () => {
    const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
    const a = JSON.parse(JSON.stringify(src.analysis));
    a.userCorrections = a.userCorrections.map((c: Record<string, unknown>) => c.refDes === 'AURIX pair' ? { ...c, customerSupplied: true } : c);
    const run = () => runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' });
    const s4 = await run();
    const bd = s4.selectedCountryBreakdown!;
    expect(bd.breakdown.customerSupplied).toBe(26.8);
    expect(bd.emsInvoicePerBoard).toBeCloseTo(bd.totalPerBoard - 26.8, 2);
    expect(s4.verifyList[0]).toMatchObject({ refDes: 'AURIX pair', customerSupplied: true, status: 'confirmed' });
    const again = await run();   // a re-price restarts from rawBom: the flag rides on userCorrections
    expect(again.selectedCountryBreakdown!.breakdown.customerSupplied).toBe(26.8);
  }, 60_000);
});

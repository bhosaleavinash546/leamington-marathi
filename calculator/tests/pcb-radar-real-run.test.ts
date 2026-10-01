/**
 * The 2026-09-29 real-model run of the 77 GHz radar board (the user's two PDFs),
 * against the stand-in run. Each test pins one gap found in that comparison.
 */
import { describe, it, expect } from 'vitest';
import { reconcileOcrMarkings } from '../server/utils/pcb-ocr-reconcile.js';
import { capUnconfirmedPrices } from '../server/utils/pcb-bom-grounding.js';
import { descriptionCap, isNotFitted } from '../server/utils/pcb-price-catalogue.js';
import { prepareBOMFromOCR, icKnownRange, knownRangeAtVolume, markingLabel } from '../server/routes/pcb.js';
import { pcbCostOverview } from '../src/ui/pcb/cost-overview.js';
import type { PCBImageAnalysis } from '../src/ui/pcb/types.js';

// The real run's BOM lines, as printed in the master report (unit prices ÷ 0.88 back to 100K).
const realBOM = () => [
  { refDes: 'U1', componentType: 'ic_bga', description: 'NXP S32R294 automotive radar MCU (ASIL-B), 77GHz FMCW signal processing', qty: 1, unitPriceGBP: 32, partNumber: 'S32R294', ocrExtracted: true, lineConf: 1 },
  { refDes: 'U2', componentType: 'ic_qfn', description: '77/79GHz FMCW radar transceiver MMIC (glob-top epoxy near antenna feed)', qty: 1, unitPriceGBP: 4, partNumber: '', lineConf: 0.6 },
  { refDes: 'U3', componentType: 'ic_soic', description: '32Mbit SPI serial flash memory, automotive grade', qty: 1, unitPriceGBP: 2.2, partNumber: '', lineConf: 0.7 },
  { refDes: 'U4, U5', componentType: 'ic_soic', description: 'Automotive op-amp/LDO regulator IC', qty: 2, unitPriceGBP: 1.4, partNumber: '', lineConf: 0.6 },
  { refDes: 'U6, U7', componentType: 'ic_tqfp', description: 'Automotive PMIC/safety supervisor IC', qty: 2, unitPriceGBP: 5.5, partNumber: '', lineConf: 0.6 },
  { refDes: 'U8', componentType: 'ic_qfn', description: 'Unidentified automotive QFN IC (likely CAN/LIN transceiver or interface controller), top side', qty: 1, unitPriceGBP: 3.2, partNumber: '', lineConf: 0.5 },
  { refDes: 'U9', componentType: 'ic_qfn', description: 'Unidentified automotive QFN IC, bottom side near label 31', qty: 1, unitPriceGBP: 3.2, partNumber: '', lineConf: 0.5 },
];
const MARKINGS = ['FS32R294KCMJD', 'TEF8105', 'MAX20431A', 'W25Q32JWSSIM', 'TCAN1044AV', '31'];

describe('chip markings read by OCR reach the BOM', () => {
  const rec = reconcileOcrMarkings(realBOM(), MARKINGS, markingLabel, l => icKnownRange(l, { specificOnly: true }) != null);
  const by = (ref: string) => rec.bom.find(l => l.refDes === ref)!;

  it('attaches each nameable marking to the line with the same function', () => {
    expect(by('U2').partNumber).toBe('TEF8105');
    expect(by('U3').partNumber).toBe('W25Q32JWSSIM');
    expect(by('U6, U7').partNumber).toBe('MAX20431A');   // PMIC line, not the LDO line
    expect(by('U8').partNumber).toBe('TCAN1044AV');
    expect(by('U2').ocrExtracted).toBe(true);
    expect(by('U2').ocrMatchedByFunction).toBe(true);
  });
  it('leaves the S32R294 (already named) and silkscreen numbers alone', () => {
    expect(by('U1').partNumber).toBe('S32R294');
    expect(rec.attached.map(a => a.marking)).not.toContain('FS32R294KCMJD');
    expect(rec.missing).toEqual([]);
  });
  it('reports a marking no line can take', () => {
    const r2 = reconcileOcrMarkings(realBOM().filter(l => l.refDes !== 'U3'), ['W25Q32JWSSIM'], markingLabel, l => icKnownRange(l, { specificOnly: true }) != null);
    expect(r2.missing).toEqual(['W25Q32JWSSIM']);
  });
});

describe('prices held inside the tool\'s own ranges', () => {
  const at250k = knownRangeAtVolume(0.88);

  it('an OCR-matched TEF8105 guessed at £4 is raised to the £9 floor (at volume)', () => {
    const { bom } = capUnconfirmedPrices([{ refDes: 'U2', componentType: 'ic_qfn', description: 'radar transceiver MMIC', partNumber: 'TEF8105', ocrExtracted: true, lineConf: 0.95, qty: 1, unitPriceGBP: 3.52 }], at250k);
    expect(bom[0].unitPriceGBP).toBeCloseTo(9 * 0.88, 2);
    expect(bom[0].priceSource).toBe('known-range');
    expect(bom[0].priceRaised).toBe(true);
    expect(bom[0].needsVerification).toBe(true);
  });
  it('an unread 77 GHz transceiver is held in the TEF810x-class range', () => {
    const { bom } = capUnconfirmedPrices([{ refDes: 'U2', componentType: 'ic_qfn', description: '77/79GHz FMCW radar transceiver MMIC (glob-top)', partNumber: '', qty: 1, unitPriceGBP: 3.52 }], at250k);
    expect(bom[0].unitPriceGBP).toBeCloseTo(9 * 0.88, 2);
    expect(bom[0].priceSource).toBe('function-range');
  });
  it('the radar MCU description does not trip the transceiver range', () => {
    expect(icKnownRange({ description: 'NXP S32R294 automotive radar MCU (ASIL-B), 77GHz FMCW signal processing' })?.label).toMatch(/S32R294/);
  });
  it('an OCR-confirmed S32R294 above the range is still cut to its ceiling', () => {
    const { bom } = capUnconfirmedPrices([{ partNumber: 'FS32R294KCMJD', componentType: 'ic_bga', ocrExtracted: true, lineConf: 1, qty: 1, unitPriceGBP: 60 }], at250k);
    expect(bom[0].unitPriceGBP).toBeCloseTo(34 * 0.88, 2);   // range ceiling £34 (Arrow/Mouser/Avnet @1k, 2026-10-01)
  });
});

describe('lines with no part, and over-priced commodity parts', () => {
  it('header pads are not a part; a sealed connector is', () => {
    expect(isNotFitted({ componentType: 'connector_smt', description: 'Automotive test/board-to-board header pads, left and bottom edges', value: '' })).toBe(true);
    expect(isNotFitted({ componentType: 'connector_smt', description: 'Sealed automotive SMT board-to-board/antenna connector, right edge' })).toBe(false);
    expect(isNotFitted({ componentType: 'ic_qfn', description: 'QFN-24 with exposed thermal pad' })).toBe(false);
    expect(isNotFitted({ componentType: 'passive_0402', description: 'MLCC', value: '100 nF' })).toBe(false);
    const { bom } = capUnconfirmedPrices([{ refDes: 'J2, J3', componentType: 'connector_smt', description: 'Automotive test/board-to-board header pads', qty: 2, unitPriceGBP: 4.4 }]);
    expect(bom[0].unitPriceGBP).toBe(0);
    expect(bom[0].priceSource).toBe('not-fitted');
  });
  it('electrolytics and SOT-23 discretes are capped by what they are', () => {
    expect(descriptionCap('Electrolytic capacitor 100V, power supply filtering')).toBe(0.60);
    expect(descriptionCap('Automotive AEC-Q101 TVS diodes / small-signal transistors, SOT-23/SOD-123')).toBe(0.12);
    expect(descriptionCap('LDO regulator IC SOT-23-5')).toBeNull();
    const { bom } = capUnconfirmedPrices([
      { componentType: 'through_hole', description: 'Electrolytic capacitor 100V (JW 100V series)', qty: 2, unitPriceGBP: 1.584 },
      { componentType: 'fuse_tvs', description: 'Automotive AEC-Q101 TVS diodes / small-signal transistors, SOT-23/SOD-123', qty: 10, unitPriceGBP: 0.176 },
    ]);
    expect(bom[0].unitPriceGBP).toBe(0.60);
    expect(bom[1].unitPriceGBP).toBe(0.12);
  });
});

describe('prepareBOMFromOCR', () => {
  it('corrects single-sided reflow when the BOM has bottom-side parts, and warns', () => {
    const asm: Record<string, unknown> = { reflowSides: 1 };
    const { bom, warnings } = prepareBOMFromOCR(realBOM(), MARKINGS, asm);
    expect(asm.reflowSides).toBe(2);
    expect(bom.find(l => l.refDes === 'U2')!.partNumber).toBe('TEF8105');
    expect(warnings.map(w => w.code)).toEqual(expect.arrayContaining(['OCR_MATCHED_BY_FUNCTION', 'REFLOW_SIDES_CORRECTED']));
  });
});

describe('report cost overview = the screen headline', () => {
  const base = {
    costEstimates: { pcbFabGBP: { min: 5, mid: 6.25, max: 8.13 }, totalBOMCostGBP: 77.09, smtAssemblyCostGBP: 18 },
  } as unknown as PCBImageAnalysis;

  it('uses the selected country breakdown, not the AI first pass', () => {
    const r = { ...base,
      _selectedCountryBreakdown: { countryId: 'cn', countryName: 'China (Shenzhen / Suzhou)', pcbFabPerBoard: 0.94, assemblyPerBoard: 5.03, bomCostPerBoard: 67.84, logisticsPerBoard: 2.74, totalPerBoard: 77.75 },
      _programPricing: { annualProgramVolume: 250000 },
      _confidenceBand: { totalLow: 62.1, totalHigh: 113.4 },
    } as unknown as PCBImageAnalysis;
    const ov = pcbCostOverview(r);
    expect(ov.fromCountry).toBe(true);
    expect(ov.total).toBe(77.75);
    expect(ov.basis).toBe('China (Shenzhen / Suzhou) · 250,000 boards/yr');
    const sum = ov.rows.reduce((t, x) => t + x.value, 0);
    expect(sum).toBeCloseTo(77.75, 2);
    expect(ov.low).toBe(62.1);
  });
  it('falls back to the first pass, labelled as such', () => {
    const ov = pcbCostOverview(base);
    expect(ov.fromCountry).toBe(false);
    expect(ov.total).toBeCloseTo(101.34, 2);
    expect(ov.basis).toMatch(/first-pass/);
  });
});

describe('chip-top markings as the photos actually show them', () => {
  it('names the TI and Winbond parts from their abbreviated top marks', () => {
    expect(markingLabel('TI 1044AV 4AB ARYS')).toMatch(/TCAN10xx/);
    expect(markingLabel('winbond 25Q32JWNSM 2438')).toMatch(/Winbond/);
    expect(markingLabel('MAX20431A R/V 446 +BVFK')).toMatch(/PMIC/);
    expect(markingLabel('TEF8105 TR7YC228 sKN2437')).toMatch(/TEF810x/);
    expect(markingLabel('2434')).toBeNull();
  });
});

describe('part number keeps the part, not the lot code', () => {
  it('strips maker names and date codes from the attached marking', () => {
    const rec = reconcileOcrMarkings(realBOM(), ['TEF8105 TR7YC228 sKN2437', 'TI 1044AV 4AB ARYS', 'winbond 25Q32JWNSM 2438'], markingLabel, l => icKnownRange(l, { specificOnly: true }) != null);
    const pn = (ref: string) => rec.bom.find(l => l.refDes === ref)!.partNumber;
    expect(pn('U2')).toBe('TEF8105');
    expect(pn('U8')).toBe('1044AV');
    expect(pn('U3')).toBe('25Q32JWNSM');
  });
});

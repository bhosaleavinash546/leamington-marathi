/**
 * PCB Image → BOM → Cost review (Oct 2026) — docs/pcb/pcb-review-2026-10.md.
 * Each test pins one defect found by the review so it cannot return.
 */
import { classDefaultPrice, classRange } from '../server/utils/pcb-class-pricing.js';
import { describe, it, expect } from 'vitest';
import { groundAndSplit, offlineCataloguePrices } from '../server/utils/pcb-bom-grounding.js';

describe('golden rule: the model never sets a price', () => {
  it('a confident, part-numbered, sub-£10 line NOT in the catalogue is priced from the table and is not "confirmed"', () => {
    // Before: kept £9.50, priceSource ai-estimate, needsVerification false → counted as confirmed.
    const bom = [{ refDes: 'U7', partNumber: 'XYZ9921', componentType: 'ic_qfn', description: 'buck regulator', qty: 1, unitPriceGBP: 9.5, lineConf: 0.8 }];
    const g = groundAndSplit(bom, []);
    const l = g.bom[0]!;
    expect(l.priceSource).not.toBe('ai-estimate');
    expect(['class-range', 'known-range', 'function-range']).toContain(l.priceSource);
    expect(l.aiEstimatedPriceGBP).toBe(9.5);
    // No line priced by the model alone counts toward the confirmed subtotal.
    expect(g.bom.filter(x => x.priceSource === 'ai-estimate' && x.needsVerification !== true)).toHaveLength(0);
  });
});

describe('offline catalogue is not "live"', () => {
  it('a catalogue hit is badged catalogue, not live; specs come from the catalogue', () => {
    const prices = offlineCataloguePrices(['TJA1044GT'], 10_000);
    const g = groundAndSplit([{ refDes: 'U2', partNumber: 'TJA1044GT', componentType: 'ic_soic', qty: 1, unitPriceGBP: 3 }], prices);
    const l = g.bom[0]!;
    expect(l.priceSource).toBe('catalogue');
    expect(l.livePriced).toBe(false);
    expect(l.specSource).toBe('catalogue');
    expect(l.catalogueMfr).toMatch(/^NXP/);
    expect(l.cataloguePkg).toMatch(/^SO(IC)?-8$/);   // the catalogue's own package text (round 3 re-keyed TJA1044GT)
    expect(l.catalogueExact).toBe(true);
  });
});

describe('arithmetic', () => {
  it('cheap passives are not rounded away: 200 single-resistor lines sum to 200 × the table point, not £0', () => {
    const bom = Array.from({ length: 200 }, (_, i) => ({ refDes: `R${i + 1}`, partNumber: '', componentType: 'passive_0402', description: 'resistor', qty: 1, unitPriceGBP: 0.002 }));
    const g = groundAndSplit(bom, []);
    expect(g.bomTotal).toBeCloseTo(200 * classDefaultPrice(classRange({ componentType: 'passive_0402', description: 'resistor' })), 1);
    expect(g.bomTotal).toBeGreaterThan(0.1);
  });
  it('the class range follows the order volume (a 100-board order is not clamped to 100K prices)', () => {
    const line = { refDes: 'L1', partNumber: '', componentType: 'inductor_smd', description: 'power inductor', qty: 1, unitPriceGBP: 0 };
    const at100k = groundAndSplit([line], [], undefined, { volumeMultiplier: 1 }).bom[0]!.unitPriceGBP as number;
    const at100 = groundAndSplit([line], [], undefined, { volumeMultiplier: 6 }).bom[0]!.unitPriceGBP as number;
    expect(at100).toBeCloseTo(at100k * 6, 4);
  });
  it('the "to verify" count equals the lines flagged', () => {
    const bom = [
      { refDes: 'U1', partNumber: '', componentType: 'ic_bga', description: 'processor', qty: 1, unitPriceGBP: 30, lineConf: 0.9 },
      { refDes: 'U2', partNumber: 'QQ123', componentType: 'ic_qfn', description: 'sensor', qty: 1, unitPriceGBP: 4, lineConf: 0.9 },
      { refDes: 'C1', partNumber: '', componentType: 'passive_0402', description: 'capacitor', qty: 1, unitPriceGBP: 0.002, lineConf: 0.9 },
    ];
    const g = groundAndSplit(bom, []);
    expect(g.needsVerification).toBe(g.bom.filter(l => l.needsVerification === true).length);
  });
});

import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';
describe('catalogue matching does not price a different variant', () => {
  it.each(['MT53E1G32D2FW', 'MB85RS4MTPF', 'DF40C-100DS', '43045-2400', '744043471', 'GCM155R71H103', 'FS2600'])(
    '%s (a value / density / pin-count code after the family) is not matched', mpn => {
      expect(catalogueEntry(mpn)).toBeNull();
    });
  it.each([['TJA1044GT/3', 'TJA1044GT'], ['STM32F407VGT6', 'STM32F407'], ['TJA1044GTK', 'TJA1044GT']])(
    '%s (an ordering suffix) still resolves to %s', (mpn, want) => {
      const e = catalogueEntry(mpn)!;
      expect([e.mpn, ...(e.aliases ?? [])]).toContain(want);   // the orderable or an alias (round 3 keyed TJA1044GT/3Z)
    });
});

import { consolidateBom } from '../server/utils/pcb-bom-consolidate.js';
describe('8 views of one board: a part is counted once', () => {
  it('a line repeating a designator from another photo is removed', () => {
    const r = consolidateBom([
      { refDes: 'U1', partNumber: 'TJA1044GT', qty: 1 },
      { refDes: 'U1', partNumber: 'TJA1044GT', qty: 1, description: 'seen again in close-up 2' },
    ]);
    expect(r.bom).toHaveLength(1);
    expect(r.warnings.map(w => w.code)).toContain('BOM_DUPLICATE_VIEWS');
  });
  it('lines with no legible designator ("—", "N/A", "U?") are never read as duplicates of each other', () => {
    // A live board (Oct 2026): the model wrote "—" on 14 lines; 13 were dropped as "repeated from
    // another photo" and the board costed at 1 placement instead of ~80.
    const bom = Array.from({ length: 14 }, (_, i) => ({ refDes: i % 3 ? '—' : i % 2 ? 'N/A' : 'U?', description: `part ${i}`, qty: 2 }));
    const r = consolidateBom(bom);
    expect(r.bom).toHaveLength(14);
    expect(r.bom.reduce((a, l) => a + Number(l.qty), 0)).toBe(28);
    expect(r.warnings.map(w => w.code)).not.toContain('BOM_DUPLICATE_VIEWS');
  });
  it('a duplicate warning names the part, never a placeholder', () => {
    const r = consolidateBom([{ refDes: 'U1', partNumber: 'TJA1044GT', qty: 1 }, { refDes: 'U1', partNumber: 'TJA1044GT', qty: 1 }]);
    expect(r.warnings[0].message).toContain('U1');
    expect(r.warnings[0].message).not.toMatch(/—/);
  });
  it('overlapping ranges count each designator once', () => {
    const r = consolidateBom([{ refDes: 'C1-C10', qty: 10 }, { refDes: 'C8-C12', qty: 5 }]);
    expect(r.bom.reduce((s, l) => s + Number(l.qty), 0)).toBe(12);
  });
  it('quantity follows the designators and is a whole number', () => {
    const r = consolidateBom([{ refDes: 'R1-R10', qty: 12 }, { refDes: 'L1', qty: 1.5 }, { refDes: 'D1', qty: -2 }]);
    expect(r.bom.map(l => l.qty)).toEqual([10, 2, 1]);
    expect(r.warnings.map(w => w.code)).toEqual(expect.arrayContaining(['BOM_QTY_FROM_REFDES', 'BOM_QTY_NOT_WHOLE']));
  });
  it('a clean BOM is returned unchanged with no warnings', () => {
    const bom = [{ refDes: 'U1', qty: 1 }, { refDes: 'R1, R2', qty: 2 }, { refDes: '', partNumber: 'X', qty: 1 }];
    const r = consolidateBom(bom);
    expect(r.bom).toEqual(bom);
    expect(r.warnings).toHaveLength(0);
  });
  it('a quantity no designator shows is kept but listed to verify (pipeline review F16)', () => {
    const r = consolidateBom([{ refDes: '', partNumber: 'X', qty: 3 }, { refDes: 'C47', qty: 90 }]);
    expect(r.bom.map(l => [l.qty, l.qtyUnverified])).toEqual([[3, true], [90, true]]);
    expect(r.warnings.map(w => w.code)).toContain('BOM_QTY_NOT_COUNTABLE');
  });
});

import { parseBOMFile } from '../server/utils/pcb-bom-parser.js';
describe('BOM file quantities', () => {
  it('reads "1,000", "2 pcs" and "1.5" as whole part counts (1.5 was read as 15)', () => {
    const csv = 'RefDes,PartNumber,Description,Qty\nJ1,ABC123,connector,"1,000"\nU1,XYZ9,ic,2 pcs\nL1,IND1,inductor,1.5\n';
    const q = Object.fromEntries(parseBOMFile(csv, 'bom.csv').map(l => [l.refDes, l.qty]));
    expect(q).toEqual({ J1: 1000, U1: 2, L1: 2 });
  });
});

import { ocrChipCounts, crossCheckWithOcr } from '../server/utils/pcb-ocr-reconcile.js';
describe('what OCR saw vs the parts list (real radar reading)', () => {
  const markings = ['NXP FS32R294KCMJD 0P68C QMR2445D', 'TEF8105 TR7YC228 sKN2437', 'MAX20431A R/V 446 +BVFK', 'winbond 25Q32JWNSM 2438', 'TI 1044AV 4AB ARYS', 'TI 1044AV 4AB ARYS', 'S32R294 radar'];
  it('counts physical chips: two CAN chips, one S32R294 (described twice)', () => {
    const c = ocrChipCounts(markings);
    expect(c.get('1044AV')).toBe(2);
    expect(c.get('FS32R294KCMJD')).toBe(1);
    expect(c.has('S32R294')).toBe(false);
  });
  it('flags the PMIC listed twice and the CAN listed once; leaves the S32R294 alone', () => {
    const x = crossCheckWithOcr([
      { refDes: 'U1', partNumber: 'S32R294', qty: 1 }, { refDes: 'U6, U7', partNumber: 'MAX20431A', qty: 2 },
      { refDes: 'U8', partNumber: '1044AV', qty: 1 }, { refDes: 'U3', partNumber: '25Q32JWNSM', qty: 1 },
    ], markings, []);
    expect(x.map(c => c.refDes).sort()).toEqual(['U6, U7', 'U8']);
  });
  it('flags a priced connector when the photos show only pads and unpopulated holes', () => {
    const x = crossCheckWithOcr([{ refDes: 'J1', componentType: 'connector_smt', description: 'Sealed automotive SMT connector', qty: 1, unitPriceGBP: 5.28 }], [],
      ['Edge pad row, 2 x 10 contacts (board-to-board / spring contacts)', '2 x 7 plated through-holes, unpopulated']);
    expect(x.map(c => c.code)).toEqual(['OCR_NO_CONNECTOR_SEEN']);
  });
});

/**
 * BMW rear-axle inverter control board review (26 Nov 2026): the tool fixes the should-cost of that board asked for.
 * Each block pins one fix, with the board's own line as the case.
 */
import { describe, it, expect } from 'vitest';
import { classRange, classDefaultPrice } from '../server/utils/pcb-class-pricing.js';
import { getVolumeMultiplier, volumeRuleOf } from '../server/routes/pcb.js';
import { cataloguePriceAt, catalogueEntry, VOLUME_CAP_PARTS } from '../server/utils/pcb-price-catalogue.js';
import { offlineCataloguePrices, capUnconfirmedPrices } from '../server/utils/pcb-bom-grounding.js';
import { priceFromObservations } from '../scripts/pcb-catalogue-research-merge.js';
import { marketFactor, marketPart } from '../server/data/pcb-component-market.js';
import { parseBOMFile } from '../server/utils/pcb-bom-parser.js';
import { reconcileBomWithCatalogue } from '../server/utils/pcb-bom-grounding.js';
import { scaleBoardFromReference, packageBodyMm } from '../server/utils/pcb-boardspec-stabilise.js';
import { coatedShare } from '../src/engine/pcb-coating.js';
import { readFileSync } from 'node:fs';
import { runStage4, applyGroundTruth } from '../server/routes/pcb.js';

const auto = (line: Record<string, unknown>) => classRange(line, true);

describe('class rows: discretes, magnetics, power resistor, 1210 (fix A)', () => {
  it('a power MOSFET in DFN is a discrete, never "QFN IC (unidentified)"', () => {
    const r = auto({ componentType: 'ic_soic', description: 'Transistor 1: Automotive N-channel MOSFET', pkg: 'DFN3333-8' });
    expect(r.key).toBe('discrete.power MOSFET DFN / SO-8 class.automotive');
    expect(classDefaultPrice(r)).toBeLessThan(0.7);
    const dual = auto({ componentType: 'ic_soic', description: 'Transistor 2: Automotive dual N-channel MOSFET', pkg: 'DFN5060-8' });
    expect(dual.key).toBe(r.key);
  });

  it('a MOSFET with no package: power words → power row, else small-signal; an eFuse / driver stays an IC', () => {
    expect(auto({ componentType: 'transistor', description: 'power MOSFET 40 V 2 mOhm' }).key).toMatch(/^discrete\.power MOSFET/);
    expect(auto({ componentType: 'transistor', description: 'N-channel MOSFET' }).key).toMatch(/^discrete\.SOT-23/);
    expect(auto({ componentType: 'ic_qfn', description: '60V 6A eFuse, 31 mOhm integrated FET', pkg: 'VQFN-24' }).key).toMatch(/^ic_qfn/);
    expect(auto({ componentType: 'ic_soic', description: 'MOSFET gate driver', pkg: 'SOIC-8' }).key).toMatch(/^ic_soic\.driver/);
    expect(auto({ componentType: 'through_hole', description: 'Power MOSFET', pkg: 'TO-220' }).key).toMatch(/^through_hole\.to220/);
  });

  it('an isolated gate-driver supply transformer takes the sourced gate-drive row', () => {
    const r = auto({ componentType: 'transformer', description: 'Inductor 2: Isolated gate-driver supply transformer, 8 pins', pkg: 'SMD 8-pin ~12x10' });
    expect(r.key).toBe('transformer.gd.automotive');
    expect([r.lo, r.hi]).toEqual([1.17, 2.63]);
    expect(auto({ componentType: 'transformer', description: 'Signal transformer' }).key).toBe('transformer.sig.automotive');
  });

  it('a TO-220 power resistor is a resistor, not a "power device"', () => {
    const r = auto({ componentType: 'through_hole', description: 'Resistor 1: Power resistor (active-discharge)', pkg: 'TO-220 full pack (through-hole)' });
    expect(r.key).toBe('through_hole.res_pwr.automotive');
    expect(r.hi).toBe(2.01);
  });

  it('a 1210 MLCC has its own row; a 1206 keeps the 1206 row', () => {
    expect(auto({ componentType: 'passive_1206', description: 'Capacitor 3 (1210): MLCC X7R bulk', pkg: '1210' }).key).toBe('passive_1206.cap1210.automotive');
    expect(auto({ componentType: 'capacitor', description: 'MLCC 10uF', pkg: '1206' }).key).toBe('passive_1206.cap.automotive');
  });
});


describe('rule 7: every line carried to the parts bought (cap 10M); flat-at-300k reported beside it', () => {
  it('the class table and the catalogue keep falling past 300k along their slope, and stop at 10M', () => {
    expect(getVolumeMultiplier(2_400_000)).toBeCloseTo(getVolumeMultiplier(300_000) * Math.pow(8, -0.0706), 4);
    expect(getVolumeMultiplier(VOLUME_CAP_PARTS * 3)).toBe(getVolumeMultiplier(VOLUME_CAP_PARTS));
    const e = catalogueEntry('ADUM4135WBRWZ')!;
    expect(cataloguePriceAt(e.mpn, 1_200_000)!).toBeLessThan(e.gbp.q300k!);
  });
  it('volumeRuleOf re-adds the lines held flat at 300k; a user price and a line under 300k are untouched', () => {
    const lines = [
      { lineTotalGBP: 1, partsBought: 2_400_000, priceSource: 'class-range' },
      { lineTotalGBP: 2, partsBought: 100_000, priceSource: 'class-range' },
      { lineTotalGBP: 3, partsBought: 2_400_000, priceSource: 'user', userCorrected: true },
    ];
    const v = volumeRuleOf(lines, 6);
    expect(v.linesBeyond300k).toBe(1);
    expect(v.componentsFlat300kGBP).toBeCloseTo(1 * Math.pow(8, 0.0706) + 2 + 3, 2);
  });
});

describe('rule 8: the maker\'s own store price (TI.com) is a source, lower price taken, never the slope', () => {
  const ti = { distributor: 'TI.com', qty: 1000, price: 5.141, currency: 'USD', url: 'https://www.ti.com/product/UCC5880-Q1/part-details/UCC5880QDFCRQ1', date: '2026-11-26' };
  const dk = { distributor: 'Digi-Key', qty: 2000, price: 6, currency: 'USD', url: 'https://www.digikey.com/x', date: '2026-10-06' };
  it('below the distributor: the maker price sets the breaks and says so', () => {
    const p = priceFromObservations([dk, ti])!;
    const d = priceFromObservations([dk])!;
    expect(p.gbp.q1k).toBeLessThan(d.gbp.q1k);
    expect(p.b).toBe(d.b);
    expect(p.maker).toBe('TI.com');
    expect(p.basis).toMatch(/rule 10/);
  });
  it('a maker row alone prices the part along the franchise curve; a maker name on another host is not the maker', () => {
    expect(priceFromObservations([ti])!.basis).toMatch(/^franchise curve/);
    expect(priceFromObservations([{ ...ti, url: 'https://www.example.com/ti' }])).toBeNull();
  });
  it('the merged catalogue carries the TI store price on the board\'s TI parts', () => {
    for (const m of ['UCC5880QDFCRQ1', 'TPS7B8401QWDRBRQ1', 'LM5155QDSSRQ1']) expect(catalogueEntry(m)?.makerPrice).toBe('TI.com');
  });
});

describe('rule 9: a China build prices a line with no China price at the global price × the measured factor', () => {
  it('the factors come from the data, by group, with quartiles', () => {
    const f = marketFactor('cn', 'ic-other')!;
    expect(f.n).toBeGreaterThanOrEqual(5);
    expect(f.q1).toBeLessThan(f.median); expect(f.median).toBeLessThan(f.q3);
    expect(marketFactor(undefined, 'ic-other')).toBeNull();
  });
  it('a distributor-priced IC with no China price: × the IC factor, the factor on the line', () => {
    expect(marketPart('cn', 'ADUM4135WBRWZ')).toBeNull();
    const [g] = offlineCataloguePrices(['ADUM4135WBRWZ'], 100_000);
    const [c] = offlineCataloguePrices(['ADUM4135WBRWZ'], 100_000, 'cn');
    expect(c.unitPriceGBP).toBeCloseTo(g.unitPriceGBP * marketFactor('cn', 'ic-other')!.median, 5);
    expect(c.marketFactor?.group).toBe('ic-other');
    expect(c.sourceNote).toMatch(/China-market factor/);
  });
  it('a maker price and an engineering estimate are never scaled', () => {
    const [m] = offlineCataloguePrices(['TPS7B8401QWDRBRQ1'], 100_000, 'cn');
    expect(m.marketFactor).toBeUndefined();
    const est = ['TRANSFORMER SMD'].filter(k => catalogueEntry(k)?.confidence === 'estimate');
    for (const k of est) expect(offlineCataloguePrices([k], 100_000, 'cn')[0].marketFactor).toBeUndefined();
  });
  it('a class-range line with no China row takes the factor; a China row is not scaled twice', () => {
    const line = { refDes: 'Q1', description: 'Transistor 1: Automotive N-channel MOSFET', pkg: 'DFN3333-8', componentType: 'ic_soic', qty: 1, bomSource: 'file', volumeMultiplier: 1 };
    const g = capUnconfirmedPrices([line], undefined, { automotive: true }).bom[0];
    const c = capUnconfirmedPrices([line], undefined, { automotive: true, market: 'cn' }).bom[0];
    expect(Number(c.unitPriceGBP)).toBeCloseTo(Number(g.unitPriceGBP) * marketFactor('cn', 'discrete-magnetic-passive')!.median, 5);
    const cap = { refDes: 'C1', description: 'MLCC 100 nF X7R', pkg: '0402', componentType: 'passive_0402', qty: 1, volumeMultiplier: 1 };
    const cc = capUnconfirmedPrices([cap], undefined, { automotive: true, market: 'cn' }).bom[0];
    expect(String(cc.priceBasis)).toMatch(/@cn/);
    expect(cc.marketFactor).toBeUndefined();
  });
});


describe('fix B: BOM intake, package, board scale, coated area', () => {
  it('a teardown row name in the designator column is ONE line with the file\'s quantity', () => {
    const csv = 'RefDes,Description,Manufacturer,MPN,Package,Quantity\nIntegrated Circuit 11,Gate driver,Texas Instruments,UCC5880QDFCRQ1,SSOP-32,6\nCapacitor 3 (0402),MLCC,,,0402,220\n"C1, C2, C3",MLCC,,,0402,3';
    const l = parseBOMFile(csv, 'bom.csv');
    expect(l.map(x => [x.refDes, x.qty])).toEqual([['Integrated Circuit 11', 6], ['Capacitor 3 (0402)', 220], ['C1', 1], ['C2', 1], ['C3', 1]]);
  });

  it('an exact part number whose catalogued package has another pin count: priced, and the BOM package flagged', () => {
    const hit = offlineCataloguePrices(['UCC5880QDFCRQ1'], 10_000);
    const out = reconcileBomWithCatalogue([{ partNumber: 'UCC5880QDFCRQ1', pkg: 'SSOP-24', qty: 1, description: 'gate driver' }], hit).bom[0];
    expect(out.priceSource).toBe('catalogue');
    expect(out.packageConflict).toEqual({ bom: 'SSOP-24', catalogue: 'SSOP-32' });
    expect(String(out.priceNote)).toMatch(/check the package/);
  });

  it('board size scaled off a known body: the tool\'s mm, the model\'s pixels; a measured size is never replaced', () => {
    expect(packageBodyMm('LFBGA-516 (25 × 25 mm)')).toBe(25);
    expect(packageBodyMm('SOIC-8')).toBe(4.9);
    const bom = [{ refDes: 'IC1', partNumber: 'SAK-TC389QP-160F300S AE', pkg: 'LFBGA-516 (25 × 25 mm)' }];
    const spec: Record<string, unknown> = { widthMm: 194, heightMm: 155, dimensionsSource: 'estimated', scaleReference: { partRef: 'IC1', partPx: 250, boardWidthPx: 2800, boardHeightPx: 2200 } };
    expect(scaleBoardFromReference(spec, bom)).toMatch(/280 × 220 mm/);
    expect([spec.widthMm, spec.heightMm, spec.dimensionsEvidence]).toEqual([280, 220, 'photo-scale']);
    const typed: Record<string, unknown> = { widthMm: 100, heightMm: 80, dimensionsSource: 'measured', dimensionsEvidence: 'user', scaleReference: spec.scaleReference };
    expect(scaleBoardFromReference(typed, bom)).toBeNull();
    expect(typed.widthMm).toBe(100);
    const noBody: Record<string, unknown> = { widthMm: 100, heightMm: 80, scaleReference: { partRef: 'R1', partPx: 20, boardWidthPx: 900, boardHeightPx: 700 } };
    expect(scaleBoardFromReference(noBody, [{ refDes: 'R1', pkg: '0402' }])).toBeNull();
  });

  it('a partly coated board pays for its coated share; blank or out of range = the whole side', () => {
    expect(coatedShare(40)).toBe(0.4);
    expect(coatedShare('')).toBe(1);
    expect(coatedShare(undefined)).toBe(1);
    expect(coatedShare(0)).toBe(1);
    expect(coatedShare(150)).toBe(1);
  });
});


describe('the BMW inverter board through Stage 4 — its A2Mac1 BOM file (row names in the designator column), China, 400k', () => {
  const dir = 'scripts/bmw-rear-inverter-2026-11-26';
  const replies = JSON.parse(readFileSync(`${dir}/replies.json`, 'utf8'));
  const run = async (market: 'global' | 'local') => {
    const a = JSON.parse(JSON.stringify(replies.analysis));
    Object.assign(a.boardSpec, { componentMarket: market, programmeYears: 6, conformalCoatSides: 1 });
    applyGroundTruth(a, parseBOMFile(readFileSync(`${dir}/bom-a2mac1.csv`, 'utf8'), 'bom-a2mac1.csv'), null, 'automotive_adas');
    return runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: [], refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 400_000, tag: '/bmw' })
      .then(s4 => ({ s4, bom: a.bom as Array<Record<string, unknown>> }));
  };
  it('every part of the file is costed at its own quantity; discretes, the transformer and the TC389 are priced as what they are', async () => {
    const { s4, bom } = await run('local');
    expect(bom.reduce((t, l) => t + Number(l.qty), 0)).toBe(1189);
    const by = (pn: string) => bom.find(l => String(l.partNumber).replace(/\s/g, '') === pn.replace(/\s/g, ''))!;
    expect(by('UCC5880QDFCRQ1').qty).toBe(6);
    expect(by('SAK-TC389QP-160F300S AE').priceSource).toBe('catalogue');
    expect(Number(by('SAK-TC389QP-160F300S AE').unitPriceGBP)).toBeLessThan(15);
    expect(String(by('PJQ5948-AU').priceSource)).toBe('catalogue');
    const xf = bom.find(l => /gate-driver supply transformer/i.test(String(l.description)))!;
    expect(String(xf.priceBasis)).toMatch(/^transformer\.gd/);
    expect(s4.volumeRule!.linesBeyond300k).toBeGreaterThan(30);
    expect(s4.volumeRule!.componentsFlat300kGBP).toBeGreaterThan(s4.volumeRule!.componentsGBP);
    const cm = s4.componentMarket!;
    expect(cm.linesAtFactor).toBeGreaterThan(0);
    expect(cm.factorBand!.lowGBP).toBeLessThan(cm.componentsGBP);
    expect(cm.factorBand!.highGBP).toBeGreaterThan(cm.componentsGBP);
    expect(cm.componentsGBP).toBeLessThan(cm.globalComponentsGBP);
    expect(s4.sanityWarnings.some(w => w.code === 'BOM_PACKAGE_CONFLICT')).toBe(false);
    expect(xf.customPart).toBe(true);
    expect(s4.verifyList.find(v => /transformer/i.test(v.description))?.why).toMatch(/customer-specific/);
    expect(s4.sanityWarnings.some(w => w.code === 'CUSTOM_PART_QUOTE')).toBe(true);
  }, 120_000);
});

describe('rule 9, widened (27 Nov 2026): an LCSC.com row is the part\'s own China price; the factor is measured on both sources', () => {
  it('the szlcsc / LCSC multiple comes from the parts the research read on both', async () => {
    const { lcscConversion } = await import('../server/data/pcb-component-market.js');
    const c = lcscConversion('cn')!;
    expect(c.n).toBeGreaterThan(300);
    expect(c.cnyExVatPerLcscUsd).toBeGreaterThan(c.min); expect(c.cnyExVatPerLcscUsd).toBeLessThan(c.max);
    expect(c.gbpPerLcscUsd).toBeCloseTo(c.cnyExVatPerLcscUsd / c.cnyPerGbp, 4);
  });
  it('a part with an LCSC row at 1,000+ takes it, converted, on a China build — and no group factor', () => {
    const e = catalogueEntry('TJA1057GT/3J')!;
    const row = e.observations!.find(o => /^lcsc/i.test(o.distributor) && o.qty >= 1000)!;
    const [c] = offlineCataloguePrices(['TJA1057GT/3J'], 1000, 'cn');
    expect(c.sourceNote).toMatch(/LCSC\.com US\$/);
    expect(c.marketFactor).toBeUndefined();
    expect(c.unitPriceGBP).toBeLessThan(cataloguePriceAt('TJA1057GT/3J', 1000)!);
    expect(c.unitPriceGBP).toBeCloseTo(row.price * 5.355 / 8.88, 3);
    expect(offlineCataloguePrices(['TJA1057GT/3J'], 1000)[0].sourceNote).not.toMatch(/LCSC\.com US\$.*×/);   // global: untouched
  });
  it('each group says how many pairs came from each source', async () => {
    const f = JSON.parse(readFileSync('server/data/pcb-market-factors.json', 'utf8'));
    for (const g of Object.values<any>(f.markets.cn)) expect(Object.keys(g.bySource).length).toBeGreaterThan(0);
    expect(f.markets.cn['ic-other'].n).toBeGreaterThanOrEqual(30);
  });
});

import { isCustomerSpecific } from '../server/utils/pcb-custom-parts.js';
describe('customer-specific parts are a placeholder to quote (27 Nov 2026)', () => {
  it('BOM wording or a vehicle maker\'s name in the part number marks one; a catalogued exact code or a memory size does not', () => {
    expect(isCustomerSpecific({ partNumber: 'XFMRS2539BMW-8-15T', description: 'transformer', priceSource: 'class-range' })).toBe(true);
    expect(isCustomerSpecific({ partNumber: 'X1', description: 'Custom-wound choke', priceSource: 'class-range' })).toBe(true);
    expect(isCustomerSpecific({ partNumber: 'W25Q128JV 16MB', description: 'NOR flash', priceSource: 'class-range' })).toBe(false);
    expect(isCustomerSpecific({ partNumber: 'TJA1057GT/3J', description: 'CAN transceiver', priceSource: 'catalogue', catalogueExact: true })).toBe(false);
  });
});

import { icKnownRange } from '../server/routes/pcb.js';
describe('named-IC ranges follow the sourced catalogue parts they match (27 Nov 2026)', () => {
  const ev = JSON.parse(readFileSync('server/data/pcb-named-range-evidence.json', 'utf8')).ranges;
  it('3+ sourced parts: the range is theirs and carries their median; AURIX TC3xx is no longer £15–60', () => {
    const r = icKnownRange({ partNumber: 'SAK-TC399XP-256F300S BD' })!;
    const e = ev['Infineon AURIX TC3xx/TC4xx (ASIL-D lockstep)'];
    expect(e.n).toBeGreaterThanOrEqual(3);
    expect([r.lo, r.hi, r.p50]).toEqual([e.min, e.max, e.median]);
    expect(r.label).toMatch(/sourced catalogue parts/);
  });
  it('1–2 sourced parts widen the stated range; none leave it as stated', () => {
    const one = Object.entries<any>(ev).find(([, v]) => v.n === 1 && (v.min < v.stated[0] || v.max > v.stated[1]))!;
    const none = Object.entries<any>(ev).find(([, v]) => v.n === 0)!;
    expect(one).toBeTruthy(); expect(none).toBeTruthy();
    expect(icKnownRange({ partNumber: 'MPC5748GVMN2' })!.lo).toBeLessThan(22);   // one sourced MPC574x below the stated £22
    expect(icKnownRange({ partNumber: 'TEF8105EN' })).toMatchObject({ lo: 9, hi: 22 });   // no sourced part: as stated
  });
  it('a named-range line is priced at the lower-half point, never above the sourced median', () => {
    const line = { partNumber: 'SPC584B60E3', description: 'automotive MCU', bomSource: 'file', qty: 1, componentType: 'ic_tqfp', volumeMultiplier: 1 };
    const out = capUnconfirmedPrices([line], l => icKnownRange(l as never), { automotive: true }).bom[0];
    const e = ev['STM SPC5xxx/SPC58x automotive MCU'];
    expect(Number(out.unitPriceGBP)).toBeLessThanOrEqual(e.median + 1e-6);
    expect(out.priceSource).toBe('known-range');
  });
});

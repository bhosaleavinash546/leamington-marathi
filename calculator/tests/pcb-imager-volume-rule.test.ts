/**
 * Decision of 9 Oct 2026 (docs/pcb/adas-component-research-2026-10.md §6): image sensors are priced at AUTOMOTIVE
 * VOLUME (the imager class rule) whether or not the BOM names them; a distributor listing is a reference only.
 * A named AR0233AT used to take its catalogue listing (≈ £24) while an unnamed imager took £3–15.
 */
import { describe, it, expect } from 'vitest';
import { groundAndSplit, offlineCataloguePrices, IMAGER_RE } from '../server/utils/pcb-bom-grounding.js';
import { catalogueEntry } from '../server/utils/pcb-price-catalogue.js';

const line = (partNumber: string, description: string, unitPriceGBP = 0) =>
  ({ refDes: 'U1', partNumber, description, qty: 1, unitPriceGBP, lineTotalGBP: unitPriceGBP, lineConf: 0.9, componentType: 'ic_bga' });

const ground = (bom: ReturnType<typeof line>[], automotive = true) =>
  groundAndSplit(bom as never, offlineCataloguePrices(bom.map(l => l.partNumber), 100_000), undefined, { automotive }).bom as Array<Record<string, unknown>>;

describe('named imagers are priced at automotive volume, not at their distributor listing', () => {
  it('the catalogue still holds the AR0233AT listing (the reference)', () => {
    const e = catalogueEntry('AR0233ATSC17XUEA1-DRBR')!;
    expect(e.confidence).toBe('distributor');
    expect(e.gbp.q1k).toBeGreaterThan(15);
    expect(IMAGER_RE.test(e.desc)).toBe(true);
  });

  it.each(['AR0233ATSC17XUEA1-DRBR', 'AR0820ATSC18XMEA0-DPBR', 'AR0147ATSC00XUEA5-DPBR'])('%s: imager range, listing as a reference', mpn => {
    const [l] = ground([line(mpn, '')]);
    const listing = catalogueEntry(mpn)!;
    expect(l.priceSource).toBe('class-range');
    expect(l.imagerVolumeRule).toBe(true);
    expect(l.livePriced).not.toBe(true);
    expect(Number(l.unitPriceGBP)).toBeGreaterThanOrEqual(3);
    expect(Number(l.unitPriceGBP)).toBeLessThanOrEqual(15);
    expect(Number(l.distributorListingGBP)).toBeGreaterThan(Number(l.unitPriceGBP));
    expect(String(l.priceNote)).toMatch(/CMOS image sensor/);
    expect(String(l.priceNote)).toMatch(/distributor listing £[\d.]+ shown for reference only/);
    expect(listing.mpn).toBe(l.catalogueMpn);
  });

  it('named and unnamed imagers now land on the same basis', () => {
    const [named] = ground([line('AR0233ATSC17XUEA1-DRBR', '', 6)]);
    const [unnamed] = ground([line('', 'CMOS image sensor 2.6 MP', 6)]);
    expect(named.priceBasis).toBe(unnamed.priceBasis);
    expect(Number(named.unitPriceGBP)).toBeCloseTo(Number(unnamed.unitPriceGBP), 6);
  });

  it('a non-imager catalogue part still takes its catalogue price', () => {
    const [ser] = ground([line('DS90UB953TRHBRQ1', 'FPD-Link III serializer')]);
    expect(ser.priceSource).toBe('catalogue');
    expect(ser.imagerVolumeRule).toBeUndefined();
    // the AP0101AT is an image SIGNAL PROCESSOR, not a sensor
    const [isp] = ground([line('AP0101AT2L00XPGA0-DR', '')]);
    expect(isp.priceSource).toBe('catalogue');
  });
});

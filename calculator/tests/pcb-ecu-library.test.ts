/**
 * The vehicle-electronics library (Oct 2026 research): which ECUs each powertrain carries
 * and their key ICs, each claim sourced or marked engineering judgement, and named chips
 * linked to their catalogue price at the requested annual volume.
 */
import { describe, it, expect } from 'vitest';
import { ecuLibrary, linkExample } from '../server/utils/pcb-ecu-library.js';
import { cataloguePriceAt } from '../server/utils/pcb-price-catalogue.js';

const L = ecuLibrary(300_000);

describe('ECU library', () => {
  it('covers ICE, MHEV, HEV, PHEV and BEV with their ECUs', () => {
    const ids = L.powertrains.map(p => String(p.id));
    for (const pt of ['ICE', 'MHEV', 'HEV', 'PHEV']) expect(ids).toContain(pt);
    expect(ids.some(i => i.startsWith('BEV'))).toBe(true);
    expect(L.ecus.length).toBeGreaterThanOrEqual(30);
    const of = (pt: string) => L.ecus.filter(e => e.powertrains.includes(pt)).map(e => e.ecu);
    expect(of('ICE')).toContain('ECM');                 // engine control only where there is an engine
    expect(L.ecus.find(e => e.ecu === 'ECM')!.powertrains).not.toContain('BEV400');
    expect(of('BEV400')).toEqual(expect.arrayContaining(['TINV', 'OBC', 'BMS_BMU']));
    expect(of('MHEV')).toEqual(expect.arrayContaining(['BSG_INV', 'DCDC48']));
  });
  it('every key-IC claim and board figure states its basis: a URL or "engineering judgement"', () => {
    for (const e of L.ecus) {
      for (const k of e.keyIcs) expect(String(k.source ?? ''), `${e.ecu} ${k.role}`).toMatch(/^https?:\/\/|engineering judgement/i);
      if (e.pcb) expect(String(e.pcb.basis ?? ''), e.ecu).toMatch(/^https?:\/\/|engineering judgement/i);
    }
  });
  it('a named chip links to its catalogue price at the volume asked; an unnamed family stays text', () => {
    const p = linkExample('NXP S32K344', 300_000);
    expect(p.length).toBe(1);
    expect(p[0].unitGBP).toBeCloseTo(cataloguePriceAt(p[0].mpn, 300_000)!, 6);
    expect(linkExample('Infineon AURIX TC3xx', 300_000)).toHaveLength(0);
    expect(linkExample('supplier ASIC (Bosch/Continental in-house)', 300_000)).toHaveLength(0);
  });
});

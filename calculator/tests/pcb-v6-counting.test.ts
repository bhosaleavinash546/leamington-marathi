/**
 * EDU v6 — counting what is on the board: how each quantity was got, its range, the band it adds, and a count copied by
 * symmetry. A reading that does not say how it counted keeps its quantities exact (nothing invented).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseCount, quantityBand, symmetryLines } from '../server/utils/pcb-counting.js';
import { PCB_ANALYSIS_JSON_SCHEMA } from '../server/utils/pcb-analysis-schema.js';
import { runStage4 } from '../server/routes/pcb.js';

describe('count fields', () => {
  it('a counted line is exact; a designator range keeps the fitted count it can defend; ranges are bounded', () => {
    const c = { qty: 40, countMethod: 'counted', qtyMin: 30, qtyMax: 50 } as Record<string, unknown>; normaliseCount(c);
    expect([c.qtyMin, c.qtyMax]).toEqual([40, 40]);
    const d = { qty: 100, countMethod: 'designator-range', qtyMin: 80, qtyMax: 100 } as Record<string, unknown>; normaliseCount(d);
    expect([d.qtyMin, d.qtyMax]).toEqual([80, 100]);
    const e = { qty: 10, countMethod: 'estimated', qtyMin: 50, qtyMax: 999 } as Record<string, unknown>; normaliseCount(e);
    expect([e.qtyMin, e.qtyMax]).toEqual([10, 30]);   // min never above qty, max at most 3 × qty
  });
  it('a BOM-file line or an engineer\'s edit is counted exactly; an unstated method stays exact', () => {
    const b = { qty: 12, bomSource: 'file', countMethod: 'estimated', qtyMin: 2, qtyMax: 40 } as Record<string, unknown>; normaliseCount(b);
    expect(b).toMatchObject({ countMethod: 'bom', qtyMin: 12, qtyMax: 12 });
    const u = { qty: 7 } as Record<string, unknown>; normaliseCount(u);
    expect(u).toMatchObject({ countMethod: 'unstated', qtyMin: 7, qtyMax: 7, side: 'unknown' });
  });
});

describe('quantity band', () => {
  it('moves the components by each line\'s own price over its range', () => {
    const bom = [
      { qty: 100, unitPriceGBP: 0.01, countMethod: 'designator-range', qtyMin: 80, qtyMax: 100 },
      { qty: 2, unitPriceGBP: 13.4, countMethod: 'counted', qtyMin: 2, qtyMax: 2 },
      { qty: 10, unitPriceGBP: 0.5, countMethod: 'estimated', qtyMin: 8, qtyMax: 14 },
    ];
    const q = quantityBand(bom, 25);
    expect(q).toMatchObject({ parts: 112, partsLow: 90, partsHigh: 116, emptyFootprints: 25 });
    expect(q.gbpLow).toBeCloseTo(-20 * 0.01 - 2 * 0.5, 6);
    expect(q.gbpHigh).toBeCloseTo(4 * 0.5, 6);
    expect(q.note).toMatch(/25 bare footprints/);
  });
  it('says when the reading did not state how it counted', () => {
    expect(quantityBand([{ qty: 5, unitPriceGBP: 1, countMethod: 'unstated' }]).note).toMatch(/did not say how/);
  });
});

describe('a count copied by symmetry', () => {
  it('is found in a line or the reading\'s limitations', () => {
    expect(symmetryLines([{ refDes: 'U20-U25', description: 'Op-amps, channel 2 by symmetry with channel 1' }]).lines).toEqual(['U20-U25']);
    expect(symmetryLines([{ description: 'quad op-amp' }], ['Bottom half assumed identical to the top half']).limitation).toBe(true);
    expect(symmetryLines([{ description: 'mirror-image connector J2' }]).lines).toEqual([]);   // a mirrored PART is not a mirrored count
  });
});

describe('schema and Stage 4', () => {
  it('the model is asked for side, count method, range and photos per line, and bare footprints per board', () => {
    const item = PCB_ANALYSIS_JSON_SCHEMA.properties.bom.items;
    for (const k of ['side', 'countMethod', 'qtyMin', 'qtyMax', 'seenIn']) expect(item.required).toContain(k);
    expect(PCB_ANALYSIS_JSON_SCHEMA.properties.assembly.required).toContain('emptyFootprints');
  });
  it('a reading with ranges widens the band; one without leaves the headline and band as they were', async () => {
    const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
    const run = async (mut?: (a: Record<string, unknown>) => void) => {
      const a = JSON.parse(JSON.stringify(src.analysis));
      mut?.(a);
      return runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
        ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' });
    };
    const plain = await run();
    expect(plain.quantityBand!.partsLow).toBe(plain.quantityBand!.partsHigh);
    const ranged = await run(a => {
      for (const l of a.rawBom as Array<Record<string, unknown>>) if (/^R 0402/.test(String(l.refDes))) Object.assign(l, { countMethod: 'designator-range', qtyMin: 400, qtyMax: 540 });
    });
    expect(ranged.selectedCountryBreakdown!.totalPerBoard).toBe(plain.selectedCountryBreakdown!.totalPerBoard);
    expect(ranged.quantityBand!.partsLow).toBeLessThan(ranged.quantityBand!.parts);
    expect(ranged.confidenceBand!.totalLow).toBeLessThan(plain.confidenceBand!.totalLow);
    expect(ranged.confidenceBand!.totalHigh).toBeGreaterThan(plain.confidenceBand!.totalHigh);
    expect(ranged.sanityWarnings.some(w => w.code === 'COUNT_RANGE')).toBe(true);
  }, 60_000);
});

import { photoSlotsHtml } from '../src/ui/pcb/photo-slots.js';
describe('photo slots (24: sides, chip close-ups, zooms)', () => {
  it('every slot is drawn once, zooms in their own group', () => {
    const labels = ['Top side', 'Bottom side', ...Array.from({ length: 6 }, (_, i) => `Close-up ${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `Zoom of top side ${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `Zoom of bottom side ${i + 1}`)];
    const html = photoSlotsHtml(labels);
    const ids = [...html.matchAll(/id="pcb-img-input-(\d+)"/g)].map(m => Number(m[1]));
    expect(ids.length).toBe(24);
    expect(new Set(ids).size).toBe(24);
    expect(html).toMatch(/Zooms for counting/);
    expect((html.match(/pcb-slot--zoom/g) ?? []).length).toBe(16);
  });
});

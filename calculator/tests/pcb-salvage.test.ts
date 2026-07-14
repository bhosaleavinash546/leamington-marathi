import { describe, it, expect } from 'vitest';
import { salvageBomFromRaw, salvageAnalysisFromRaw } from '../server/utils/pcb-salvage.js';

// A realistic Stage-3 response that the model produced up to the point where it
// hit the output-token ceiling: valid prefix, three complete BOM lines, then a
// fourth line cut off mid-object. JSON.parse would throw on this whole string.
const TRUNCATED = `{
  "partName": "Automotive ECU",
  "confidenceLevel": "High",
  "boardSpec": { "estimatedLayers": 6, "widthMm": 120 },
  "bom": [
    { "refDes": "U1", "componentType": "mcu", "description": "AURIX MCU", "qty": 1, "unitPriceGBP": 12.4, "partNumber": "TC397" },
    { "refDes": "C1-C40", "componentType": "mlcc", "description": "MLCC 100nF", "qty": 40, "unitPriceGBP": 0.012 },
    { "refDes": "R1-R20", "componentType": "resistor", "description": "10k 0402", "qty": 20, "unitPriceGBP": 0.004 },
    { "refDes": "U2", "componentType": "ic_bga", "description": "power modu`;

describe('salvageBomFromRaw', () => {
  it('recovers every complete BOM line before the truncation point', () => {
    const bom = salvageBomFromRaw(TRUNCATED);
    expect(bom).not.toBeNull();
    expect(bom!.length).toBe(3);                 // the 4th (cut-off) line is dropped
    expect(bom![0].refDes).toBe('U1');
    expect(bom![1].qty).toBe(40);
    expect(bom![2].partNumber).toBeUndefined();  // absent field stays absent, not invented
  });

  it('reads a complete, well-formed bom array too', () => {
    const good = '{"bom":[{"refDes":"U1","qty":1,"unitPriceGBP":2}],"partName":"X"}';
    const bom = salvageBomFromRaw(good);
    expect(bom!.length).toBe(1);
    expect(bom![0].unitPriceGBP).toBe(2);
  });

  it('returns null when there is no bom array at all', () => {
    expect(salvageBomFromRaw('{"partName":"X","boardSpec":{}}')).toBeNull();
    expect(salvageBomFromRaw('not json at all')).toBeNull();
  });

  it('returns null when the array is present but the first object is already cut off', () => {
    expect(salvageBomFromRaw('{"bom":[{"refDes":"U1","desc')).toBeNull();
  });

  it('skips one malformed object without losing the rest', () => {
    // second object has an invalid number literal — it is dropped, others kept
    const raw = '{"bom":[{"refDes":"U1","qty":1},{"refDes":"U2","qty":0x1},{"refDes":"U3","qty":3}]}';
    const bom = salvageBomFromRaw(raw);
    expect(bom!.map(l => l.refDes)).toEqual(['U1', 'U3']);
  });

  it('does not mistake a brace inside a string value for structure', () => {
    const raw = '{"bom":[{"refDes":"U1","description":"buck {3.3V} regulator","qty":1}]}';
    const bom = salvageBomFromRaw(raw);
    expect(bom!.length).toBe(1);
    expect(bom![0].description).toBe('buck {3.3V} regulator');
  });
});

describe('salvageAnalysisFromRaw', () => {
  it('wraps the salvaged BOM in a renderable analysis with a truncation limitation', () => {
    const a = salvageAnalysisFromRaw(TRUNCATED);
    expect(a).not.toBeNull();
    expect((a!.bom as unknown[]).length).toBe(3);
    expect(a!.partName).toBe('Automotive ECU');
    expect(a!.confidenceLevel).toBe('Low');
    expect(Array.isArray(a!.analysisLimitations)).toBe(true);
    expect((a!.analysisLimitations as string[])[0]).toMatch(/truncated/i);
  });

  it('returns null (not an empty analysis) when nothing can be recovered', () => {
    expect(salvageAnalysisFromRaw('{"partName":"X"}')).toBeNull();
  });
});

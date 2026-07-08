import { describe, it, expect } from 'vitest';
import {
  inferComponentType, defaultUnitPriceGBP, normalizeMPN, isPlausibleMPN,
  lineConfidence, postProcessBom, bomLinesToItems,
  parsePickAndPlace, placementsToItems, mergeBomExtractions,
  type EnrichedBomItem,
} from '../server/utils/pcb-bom-postprocess.js';
import type { BomItem } from '../server/utils/pcb-vision-accuracy.js';
import type { ParsedBOMLine } from '../server/utils/pcb-bom-parser.js';

// ─── B: component-type inference ──────────────────────────────────────────────

describe('PCB-B — footprint / ref-des component-type inference', () => {
  it('classifies by ref-des prefix and carries chip size', () => {
    expect(inferComponentType({ refDes: 'R12', pkg: '0402' })).toBe('resistor_0402');
    expect(inferComponentType({ refDes: 'C3', pkg: '0603' })).toBe('capacitor_0603');
    expect(inferComponentType({ refDes: 'U1', pkg: 'QFN-32' })).toBe('ic');
    expect(inferComponentType({ refDes: 'J2', pkg: 'USB-C' })).toBe('connector');
    expect(inferComponentType({ refDes: 'Y1', pkg: 'SMD-4' })).toBe('crystal');
  });

  it('falls back to footprint/description when ref-des is unknown', () => {
    expect(inferComponentType({ pkg: 'SOIC-8' })).toBe('ic');
    expect(inferComponentType({ pkg: '0805' })).toBe('resistor_0805');
    expect(inferComponentType({ description: 'Electrolytic capacitor 100uF', refDes: 'C9' })).toBe('capacitor_electrolytic');
  });

  it('default unit price falls back by class', () => {
    expect(defaultUnitPriceGBP('resistor_0402')).toBeLessThan(defaultUnitPriceGBP('ic'));
    expect(defaultUnitPriceGBP('connector')).toBeGreaterThan(defaultUnitPriceGBP('capacitor_0603'));
  });
});

// ─── B: MPN normalise / validate ──────────────────────────────────────────────

describe('PCB-B — MPN normalise & validate', () => {
  it('normalises case/whitespace', () => {
    expect(normalizeMPN(' grm188r71c104ka01 ')).toBe('GRM188R71C104KA01');
  });
  it('accepts real MPNs, rejects value/footprint tokens', () => {
    expect(isPlausibleMPN('GRM188R71C104KA01')).toBe(true);
    expect(isPlausibleMPN('STM32F103C8T6')).toBe(true);
    expect(isPlausibleMPN('10K')).toBe(false);
    expect(isPlausibleMPN('100NF')).toBe(false);
    expect(isPlausibleMPN('0402')).toBe(false);
    expect(isPlausibleMPN('resistor')).toBe(false);  // no digit
    expect(isPlausibleMPN('12')).toBe(false);         // too short / no letter
  });
});

// ─── B: post-processor ────────────────────────────────────────────────────────

describe('PCB-B — postProcessBom (confidence + cost range + passive fallback)', () => {
  const raw: BomItem[] = [
    { refDes: 'U1', partNumber: 'STM32F103C8T6', componentType: 'ic', unitPriceGBP: 2.1, qty: 1 },
    { refDes: 'R1-R8', componentType: 'resistor_0402' },  // no price → fallback, qty from expansion
    { refDes: 'C1', partNumber: '0402' },                 // bogus MPN (footprint) → not plausible
  ];

  it('fills passive price fallback, expands qty, scores confidence and a cost range', () => {
    const r = postProcessBom(raw);
    const u1 = r.items.find(i => i.refDes === 'U1')!;
    const rr = r.items.find(i => i.refDes === 'R1-R8')!;
    expect(u1.confidence).toBeGreaterThan(rr.confidence);          // has real MPN + price
    expect(rr.qty).toBe(8);                                        // expanded from R1-R8
    expect(rr.priceEstimated).toBe(true);
    expect(rr.unitPriceGBP).toBeGreaterThan(0);
    expect(r.totalHighGBP).toBeGreaterThanOrEqual(r.totalMidGBP);
    expect(r.totalMidGBP).toBeGreaterThanOrEqual(r.totalLowGBP);
    expect(r.estimatedPriceCount).toBeGreaterThanOrEqual(2);
    expect(r.lowConfidenceCount).toBeGreaterThanOrEqual(1);
  });

  it('a fully-specified line scores higher than a bare one', () => {
    const full = lineConfidence({ refDes: 'U1', partNumber: 'STM32F103C8T6', componentType: 'ic', value: 'MCU', confidence: 0 } as EnrichedBomItem);
    const bare = lineConfidence({ refDes: 'C1', confidence: 0 } as EnrichedBomItem);
    expect(full).toBeGreaterThan(bare);
  });
});

// ─── A: BOM line → item converter ─────────────────────────────────────────────

describe('PCB-A — bomLinesToItems', () => {
  it('converts parsed BOM lines, inferring type and qty from ref-des', () => {
    const lines: ParsedBOMLine[] = [
      { refDes: 'R1,R2,R3', partNumber: 'RC0402FR-0710KL', description: 'RES 10K', value: '10K', pkg: '0402', qty: 3 },
      { refDes: 'U5', partNumber: 'LM358', description: 'Op-amp', value: '', pkg: 'SOIC-8', qty: 1 },
    ];
    const items = bomLinesToItems(lines);
    expect(items[0].componentType).toBe('resistor_0402');
    expect(items[0].qty).toBe(3);
    expect(items[1].componentType).toBe('ic');
    expect(items[1].partNumber).toBe('LM358');
  });
});

// ─── A: pick-and-place parser ─────────────────────────────────────────────────

describe('PCB-A — parsePickAndPlace', () => {
  it('parses an Altium-style centroid with side split', () => {
    const cpl = [
      'Designator,Footprint,Mid X,Mid Y,Rotation,Layer',
      'R1,0402,10.5,20.1,90,TopLayer',
      'C1,0603,12.0,20.1,0,TopLayer',
      'U1,QFN-32,30.0,25.0,270,TopLayer',
      'R2,0402,10.5,-5.0,90,BottomLayer',
    ].join('\n');
    const r = parsePickAndPlace(cpl);
    expect(r.totalPlacements).toBe(4);
    expect(r.topCount).toBe(3);
    expect(r.bottomCount).toBe(1);
    expect(r.placements[0].refDes).toBe('R1');
    expect(r.placements[3].side).toBe('bottom');
  });

  it('parses a whitespace KiCad .pos and never throws on junk', () => {
    const pos = [
      '# Ref   Val   Package   PosX   PosY   Rot   Side',
      'R1     10K   0402      10.5   20.1   90    top',
      'U1     MCU   QFP-48    30.0   25.0   0     top',
    ].join('\n');
    const r = parsePickAndPlace(pos);
    expect(r.totalPlacements).toBe(2);
    expect(parsePickAndPlace('').totalPlacements).toBe(0);
    expect(parsePickAndPlace('garbage\nno header here').totalPlacements).toBe(0);
    const items = placementsToItems(r.placements);
    expect(items.find(i => i.refDes === 'R1')!.componentType).toBe('resistor_0402');
  });
});

// ─── C: self-consistency merge ────────────────────────────────────────────────

describe('PCB-C — mergeBomExtractions', () => {
  it('votes per ref-des and sets confidence from agreement across runs', () => {
    const runA: BomItem[] = [
      { refDes: 'U1', partNumber: 'STM32F103C8T6', componentType: 'ic', unitPriceGBP: 2.0 },
      { refDes: 'R1', componentType: 'resistor_0402', unitPriceGBP: 0.01 },
    ];
    const runB: BomItem[] = [
      { refDes: 'U1', partNumber: 'STM32F103C8T6', componentType: 'ic', unitPriceGBP: 2.2 },
      { refDes: 'R1', componentType: 'resistor_0402', unitPriceGBP: 0.011 },
      { refDes: 'C9', componentType: 'capacitor_0603' },   // only in run B
    ];
    const runC: BomItem[] = [
      { refDes: 'U1', partNumber: 'STM32F103C8T7', componentType: 'ic', unitPriceGBP: 2.1 }, // MPN typo — minority
      { refDes: 'R1', componentType: 'resistor_0402', unitPriceGBP: 0.009 },
    ];
    const merged = mergeBomExtractions([runA, runB, runC]);
    const u1 = merged.find(m => m.refDes === 'U1')!;
    const c9 = merged.find(m => m.refDes === 'C9')!;
    expect(u1.partNumber).toBe('STM32F103C8T6');   // majority vote beats the typo
    expect(u1.confidence).toBe(1);                 // in all 3 runs
    expect(u1.unitPriceGBP).toBeCloseTo(2.1, 3);   // median price
    expect(c9.confidence).toBeLessThan(0.5);       // only 1 of 3 runs → low-confidence
  });
});

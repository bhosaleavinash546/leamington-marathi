import { describe, it, expect } from 'vitest';
import {
  pickStampingPressId, pickForgePressId, pickHPDCMachineId, sizeProcessMachine, SIZE_TIERED_COMMODITIES,
} from '../src/engine/machine-sizing.js';
import { estimateForgingTonnage } from '../src/engine/modules/forging-advisor.js';
import { estimateTonnageTonnes } from '../src/engine/modules/sheet-metal.js';

describe('stamping press sizing', () => {
  it('picks the smallest press that covers the force × safety', () => {
    expect(pickStampingPressId(50)).toBe('press-100t');     // 50×1.25=62.5 → 100t
    expect(pickStampingPressId(200)).toBe('press-400t');    // 200×1.25=250 → 400t (630 too far, 400 covers)
    expect(pickStampingPressId(700)).toBe('press-1000t');   // 700×1.25=875 → 1000t
    expect(pickStampingPressId(5000)).toBe('press-1250t');  // beyond ladder → biggest
  });
});

describe('forge press sizing', () => {
  it('picks the smallest forge press that covers the die-fill force', () => {
    expect(pickForgePressId(300)).toBe('forge-press-500t');   // 300×1.2=360 → 500t
    expect(pickForgePressId(1500)).toBe('forge-press-2500t'); // 1500×1.2=1800 → 2500t
    expect(pickForgePressId(9000)).toBe('forge-press-8000t'); // beyond ladder → biggest
  });
});

describe('HPDC machine sizing', () => {
  it('picks the smallest die-casting machine covering the clamp force', () => {
    expect(pickHPDCMachineId(120)).toBe('hpdc-160t');    // 120×1.2=144 → 160t
    expect(pickHPDCMachineId(600)).toBe('hpdc-800t');    // 600×1.2=720 → 800t
    expect(pickHPDCMachineId(5000)).toBe('hpdc-giga-6100t'); // megacasting territory
  });
});

describe('sizeProcessMachine dispatcher', () => {
  it('routes each size-tiered commodity to its picker', () => {
    expect(sizeProcessMachine('injection_moulding', { clampTonnes: 180 })).toBe('imm-200t');
    expect(sizeProcessMachine('blow_moulding', { shotKg: 13 })).toBe('blow-ebm-large');
    expect(sizeProcessMachine('forging', { forgeTonnes: 1500 })).toBe('forge-press-2500t');
    expect(sizeProcessMachine('sheet_metal', { stampTonnes: 200 })).toBe('press-400t');
    expect(sizeProcessMachine('casting', { hpdcTonnes: 600 })).toBe('hpdc-800t');
    expect(sizeProcessMachine('cast_and_machine', { hpdcTonnes: 120 })).toBe('hpdc-160t');
  });
  it('returns null when the commodity is not size-tiered or the driver is missing', () => {
    expect(sizeProcessMachine('rubber', { forgeTonnes: 1000 })).toBeNull();
    expect(sizeProcessMachine('forging', {})).toBeNull();
    expect(sizeProcessMachine('casting', {})).toBeNull();
  });
  it('registry lists exactly the commodities the dispatcher handles', () => {
    expect(Object.keys(SIZE_TIERED_COMMODITIES).sort())
      .toEqual(['blow_moulding', 'cast_and_machine', 'casting', 'forging', 'injection_moulding', 'sheet_metal']);
  });
});

describe('end-to-end: real parts land on a sane press', () => {
  it('a forged alloy-steel stub axle needs a mid forge press, not the smallest', () => {
    const tonnes = estimateForgingTonnage({ projectedAreaCm2: 150, alloyFamily: 'alloy-steel', shapeComplexity: 'moderate' });
    expect(tonnes).toBeGreaterThan(500);                     // not a tiny press
    const press = sizeProcessMachine('forging', { forgeTonnes: tonnes });
    expect(press).toMatch(/^forge-press-(1600|2500|4000)t$/);
  });
  it('a large steel stamping picks a real stamping press', () => {
    const tonnes = estimateTonnageTonnes({ perimeterMm: 3600, thicknessMm: 1.5, shearStrengthMPa: 350 });
    expect(tonnes).toBeGreaterThan(100);
    const press = sizeProcessMachine('sheet_metal', { stampTonnes: tonnes });
    expect(press).toMatch(/^press-(400|630)t$/);
  });
});

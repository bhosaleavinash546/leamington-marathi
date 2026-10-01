/**
 * Coil nesting (src/engine/nesting.ts) on shapes whose best layout is known.
 */
import { describe, it, expect } from 'vitest';
import { nestOnCoil, polygonArea, decimateOutline, type Pt } from '../src/engine/nesting.js';

/** The research L-blank: 100 × 60 outer, 40 wide legs. */
const L: Pt[] = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 60], [0, 60]];
const RECT: Pt[] = [[0, 0], [120, 0], [120, 50], [0, 50]];

describe('a rectangle nests as a rectangle', () => {
  const r = nestOnCoil(RECT, { webMm: 3, edgeMarginMm: 3 });
  it('picks the orientation with the smaller strip cell: here across the coil', () => {
    // Along the coil: (120 + 3) × (50 + 6) = 6,888 mm² a part. Across: (50 + 3) × (120 + 6) = 6,678.
    expect(r.oneUp.pitchMm).toBeCloseTo(53, 1);
    expect(r.oneUp.stripWidthMm).toBeCloseTo(126, 1);
    expect(r.oneUp.partsPerStroke).toBe(1);
    expect(r.oneUp.utilisation).toBeCloseTo(6000 / (53 * 126), 3);
    expect(r.rectangleUtilisation).toBeCloseTo(r.oneUp.utilisation, 3);
    expect(r.coilFits).toBe(true);
  });
  it('offers no 2-up: nothing to interlock', () => {
    expect(r.twoUp).toBeNull();
  });
});

describe('an L-blank interlocks 2-up', () => {
  const r = nestOnCoil(L, { webMm: 3, edgeMarginMm: 3 });
  it('beats the rectangle by a wide margin, as the September prototype found (94.6% vs 71.7%)', () => {
    expect(polygonArea(L)).toBe(4800);
    expect(r.rectangleUtilisation).toBeGreaterThan(0.68);
    expect(r.rectangleUtilisation).toBeLessThan(0.74);
    expect(r.twoUp).not.toBeNull();
    expect(r.twoUp!.partsPerStroke).toBe(2);
    expect(r.twoUp!.utilisation).toBeGreaterThan(0.85);
    expect(r.twoUp!.utilisation).toBeGreaterThan(r.rectangleUtilisation + 0.1);
    expect(r.twoUp!.utilisation).toBeGreaterThan(r.oneUp.utilisation + 0.03);
  });
  it('the 1-up on its own already beats the rectangle by nesting into the notch', () => {
    // Blanks following each other along the coil can tuck the short leg under the previous notch.
    expect(r.oneUp.utilisation).toBeGreaterThanOrEqual(r.rectangleUtilisation - 1e-9);
    expect(r.oneUp.pitchMm).toBeGreaterThan(0);
    expect(r.oneUp.stripWidthMm).toBeGreaterThanOrEqual(r.oneUp.acrossMm + 6);
  });
  it('never lets two blanks overlap: the pitch clears the web on every scanline', () => {
    // A pitch below the leg width + web would overlap the 40 mm legs.
    expect(r.twoUp!.pitchMm / 2).toBeGreaterThan(40);
  });
});

describe('constraints', () => {
  it('honours the coil widths available', () => {
    // 126 mm across fits no coil, so the blank runs along the coil on the 75 mm one.
    const r = nestOnCoil(RECT, { webMm: 3, edgeMarginMm: 3, coilWidthsMm: [50, 75, 100] });
    expect(r.oneUp.stripWidthMm).toBe(75);
    expect(r.oneUp.pitchMm).toBeCloseTo(123, 1);
    expect(r.oneUp.utilisation).toBeCloseTo(6000 / (123 * 75), 3);
    expect(r.coilFits).toBe(true);
    const none = nestOnCoil(RECT, { webMm: 3, edgeMarginMm: 3, coilWidthsMm: [30] });
    expect(none.coilFits).toBe(false);
    expect(none.oneUp.stripWidthMm).toBeCloseTo(126, 1);
  });
  it('honours a fixed orientation (grain)', () => {
    const r = nestOnCoil(RECT, { webMm: 3, edgeMarginMm: 3, allowedAngles: [90] });
    expect(r.oneUp.angleDeg).toBe(90);
    expect(r.oneUp.pitchMm).toBeCloseTo(53, 1);
    expect(r.oneUp.stripWidthMm).toBeCloseTo(126, 1);
  });
  it('decimates a dense outline without moving it', () => {
    const circle: Pt[] = Array.from({ length: 5000 }, (_, i) => [50 * Math.cos((i / 5000) * 2 * Math.PI), 50 * Math.sin((i / 5000) * 2 * Math.PI)]);
    const d = decimateOutline(circle, 400);
    expect(d.length).toBeLessThanOrEqual(400);
    expect(d.length).toBeGreaterThan(40);
    expect(polygonArea(d) / polygonArea(circle)).toBeCloseTo(1, 2);
  });
});

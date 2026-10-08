/** A drawing read's coating thickness / masks reach the cost only when credible (AI-path audit, Oct 2026). */
import { describe, it, expect } from 'vitest';
import { boundDrawingCoating } from '../src/engine/coating-drawing-read.js';

describe('drawing-read coating values are bounded', () => {
  it('an in-range zinc deposit is used and said to be a read', () => {
    const b = boundDrawingCoating({ route: 'zinc_plate', thicknessUm: 8 });
    expect(b.thicknessUm).toBe(8);
    expect(b.notes[0]).toMatch(/read from the drawing/);
  });
  it('an out-of-range deposit (a misread 80 µm zinc) is not used', () => {
    const b = boundDrawingCoating({ route: 'zinc_plate', thicknessUm: 80 });
    expect(b.thicknessUm).toBeNull();
    expect(b.notes[0]).toMatch(/outside 5–25 µm/);
  });
  it('a route that does not price by thickness never takes it', () => {
    expect(boundDrawingCoating({ route: 'powder_coat', thicknessUm: 70 }).thicknessUm).toBeNull();
  });
  it('masks are capped by the holes and bosses measured, and refused with no feature table', () => {
    expect(boundDrawingCoating({ route: 'zinc_plate', maskedFeatureCount: 4, measuredMaskableFeatures: 6 }).maskedFeatureCount).toBe(4);
    expect(boundDrawingCoating({ route: 'zinc_plate', maskedFeatureCount: 40, measuredMaskableFeatures: 6 }).maskedFeatureCount).toBeNull();
    expect(boundDrawingCoating({ route: 'zinc_plate', maskedFeatureCount: 2 }).maskedFeatureCount).toBeNull();
  });
});

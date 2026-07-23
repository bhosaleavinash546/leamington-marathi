import { describe, it, expect } from 'vitest';
import { runCADSanityChecks, type CADGeometryContext } from '../server/utils/cad-sanity.js';

// A clean base analysis so only the context-driven checks fire.
const clean = {
  geometry: { estimatedVolumeCm3: 100, estimatedWeightKg: { aluminum: 0.27, steel: 0.785, plastic: 0.105 } },
  materialAnalysis: { primarySuggestion: { name: 'PP', confidencePct: 90 } },
  costInputSuggestions: { costRange: { low: 1, mid: 2, high: 3 }, materialUtilization: 0.8 },
} as const;

const codes = (ctx: CADGeometryContext) =>
  runCADSanityChecks(clean as never, 100, ctx).map(w => w.code);

describe('cross-commodity geometry↔process plausibility (generalised fuel-tank learning)', () => {
  it('flags a thin-wall low-fill part costed as CASTING (the open-shell case we cannot auto-override)', () => {
    // e.g. a plastic bumper mis-called an aluminium casting: 3 mm wall, 12% fill.
    const c = codes({ commodity: 'casting', wallMeanMm: 3, fillRatio: 0.12, maxDimMm: 900, materialName: 'LM25 aluminium' });
    expect(c).toContain('process_geometry_implausible');
  });

  it('flags the same implausibility for forging, machining and extrusion', () => {
    for (const commodity of ['forging', 'machining', 'extrusion', 'cast_and_machine']) {
      const c = codes({ commodity, wallMeanMm: 2.5, fillRatio: 0.1, maxDimMm: 600, materialName: 'steel' });
      expect(c).toContain('process_geometry_implausible');
    }
  });

  it('does NOT flag a chunky casting (normal solid part)', () => {
    const c = codes({ commodity: 'casting', wallMeanMm: 18, fillRatio: 0.62, maxDimMm: 300, materialName: 'LM25' });
    expect(c).not.toContain('process_geometry_implausible');
  });

  it('flags a plastics process paired with a metal material', () => {
    const c = codes({ commodity: 'blow_moulding', fillRatio: 0.02, wallMeanMm: 4, materialName: 'LM25 / A356 aluminium' });
    expect(c).toContain('material_process_mismatch');
  });

  it('flags a metal process paired with a plastic material', () => {
    const c = codes({ commodity: 'casting', fillRatio: 0.5, wallMeanMm: 10, materialName: 'HDPE' });
    expect(c).toContain('material_process_mismatch');
  });

  it('does NOT flag a matched pair (blow_moulding + HDPE)', () => {
    const c = codes({ commodity: 'blow_moulding', fillRatio: 0.02, wallMeanMm: 4, materialName: 'HMW-HDPE' });
    expect(c).not.toContain('material_process_mismatch');
  });

  it('flags a near-solid part costed as a thin-wall process', () => {
    const c = codes({ commodity: 'sheet_metal', fillRatio: 0.72, wallMeanMm: null, materialName: 'DC01 steel' });
    expect(c).toContain('process_geometry_implausible');
  });

  it('emits nothing extra when no context is supplied (back-compat)', () => {
    expect(runCADSanityChecks(clean as never, 100)).toEqual([]);
  });

  it('flags the lightest-metal trap: a solid part costed as aluminium that could be steel (the stub-axle bug)', () => {
    // Real PRCR002 numbers: fill 0.092, Al 2.80 kg vs steel 8.14 kg, LM25 @ 68%.
    const c = codes({ commodity: 'casting', fillRatio: 0.092, materialName: 'LM25 (A356-equiv) Aluminium Casting Alloy',
      materialConfidencePct: 68, aluminiumKg: 2.80, steelKg: 8.14 });
    expect(c).toContain('material_assumed_lightest_metal');
  });

  it('does NOT flag when the aluminium call is high-confidence', () => {
    const c = codes({ commodity: 'casting', fillRatio: 0.092, materialName: 'A356 aluminium',
      materialConfidencePct: 95, aluminiumKg: 2.80, steelKg: 8.14 });
    expect(c).not.toContain('material_assumed_lightest_metal');
  });

  it('does NOT flag a thin-wall HPDC aluminium part (fill too low = genuine Al casting)', () => {
    const c = codes({ commodity: 'casting', fillRatio: 0.02, materialName: 'ADC12 aluminium',
      materialConfidencePct: 70, aluminiumKg: 0.5, steelKg: 1.45 });
    expect(c).not.toContain('material_assumed_lightest_metal');
  });

  it('does NOT flag a steel part (already steel)', () => {
    const c = codes({ commodity: 'forging', fillRatio: 0.3, materialName: 'EN8 steel',
      materialConfidencePct: 70, aluminiumKg: 2.80, steelKg: 8.14 });
    expect(c).not.toContain('material_assumed_lightest_metal');
  });
});

import { describe, it, expect } from 'vitest';
import { runCADSanityChecks } from '../server/utils/cad-sanity.js';

const goodAnalysis = {
  geometry: {
    estimatedVolumeCm3: 342,
    // 342 cm³ × 2.70 / 7.85 / 1.05 g/cm³
    estimatedWeightKg: { aluminum: 0.923, steel: 2.685, plastic: 0.359 },
  },
  materialAnalysis: { primarySuggestion: { name: 'Al 6061-T6', confidencePct: 89 } },
  processRecommendations: [{ process: '5-Axis CNC', estimatedCycleTimeHr: 0.72 }],
  manufacturabilityScore: 78,
  costInputSuggestions: { costRange: { low: 30, mid: 42, high: 55 }, materialUtilization: 0.77 },
};

describe('CAD sanity checks', () => {
  it('passes a consistent analysis with no warnings', () => {
    expect(runCADSanityChecks(goodAnalysis, 342)).toEqual([]);
  });

  it('flags AI volume drifting from measured volume', () => {
    const w = runCADSanityChecks({ ...goodAnalysis, geometry: { ...goodAnalysis.geometry, estimatedVolumeCm3: 500 } }, 342);
    expect(w.some(x => x.code === 'volume_drift')).toBe(true);
  });

  it('flags weight inconsistent with volume x density', () => {
    const w = runCADSanityChecks({
      ...goodAnalysis,
      geometry: { estimatedVolumeCm3: 342, estimatedWeightKg: { aluminum: 2.0, steel: 2.685, plastic: 0.359 } },
    }, 342);
    expect(w.some(x => x.code === 'weight_inconsistent_aluminum')).toBe(true);
    expect(w.some(x => x.code === 'weight_inconsistent_steel')).toBe(false);
  });

  it('flags low material confidence', () => {
    const w = runCADSanityChecks({
      ...goodAnalysis,
      materialAnalysis: { primarySuggestion: { name: '?', confidencePct: 35 } },
    }, 342);
    expect(w.some(x => x.code === 'material_low_confidence')).toBe(true);
  });

  it('flags implausible cycle times and disordered cost ranges as errors', () => {
    const w = runCADSanityChecks({
      ...goodAnalysis,
      processRecommendations: [{ process: 'CNC', estimatedCycleTimeHr: 200 }],
      costInputSuggestions: { costRange: { low: 50, mid: 40, high: 60 }, materialUtilization: 0.8 },
    }, 342);
    expect(w.find(x => x.code === 'cycle_time_implausible')?.severity).toBe('error');
    expect(w.find(x => x.code === 'cost_range_disordered')?.severity).toBe('error');
  });

  it('handles missing measured volume gracefully', () => {
    expect(() => runCADSanityChecks(goodAnalysis, null)).not.toThrow();
  });

  it('flags out-of-range utilisation', () => {
    const w = runCADSanityChecks({
      ...goodAnalysis,
      costInputSuggestions: { ...goodAnalysis.costInputSuggestions, materialUtilization: 1.4 },
    }, 342);
    expect(w.some(x => x.code === 'utilization_out_of_range')).toBe(true);
  });
});

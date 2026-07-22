import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { printPDF, type CADReportMeta } from '../src/export/pdf.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import type { FeatureMachiningLine } from '../src/engine/feature-machining.js';

/**
 * Smoke guard for the CAD-provenance report path (Stages 1 & 4): the geometry
 * provenance box, key-assumptions box, per-feature machining audit (§4C),
 * machine-rate derivation note, alloy/spec callout, what's-excluded box and the
 * confidence-driver line must all render without throwing, for both a MEASURED
 * and an ESTIMATED (text-parse fallback) geometry.
 */

const lib = DEFAULT_RATE_LIBRARY;

function castingResult() {
  const input: UniversalStackInput = {
    partName: 'RH Steering Knuckle',
    // ADC12 on a casting → triggers the alloy/spec advisory
    rawMaterial: { materialId: 'mat-adc12', netWeightKg: 1.13, materialUtilization: 0.72 },
    operations: [{
      operationName: 'HPDC Casting', machineId: 'hpdc-800t', labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.0161, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.0161, labourEfficiency: 0.9,
    }],
    tooling: { totalToolingCost: 120000, amortizationVolume: 150000, mode: 'amortized' },
    packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.09, marginPct: 0.08,
  };
  return { input, result: computeUniversalStack(input, lib) };
}

const featureLines: FeatureMachiningLine[] = [
  { kind: 'hole', diaMm: 12, depthMm: 20, through: true, count: 10, operation: 'Drill', minutesEach: 0.55, totalMinutes: 5.5, volumeCm3: 22, included: true, autoIncluded: true },
  { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 2, areaMm2: 4200, operation: 'Face mill', minutesEach: 0.72, totalMinutes: 1.44, volumeCm3: 0, included: false, autoIncluded: false },
];

describe('CAD-provenance report path renders (Stages 1 & 4)', () => {
  it('renders with MEASURED geometry + per-feature audit', () => {
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const origSave = api.save;
    let saveCalls = 0;
    api.save = function (this: jsPDF) { saveCalls++; return this; };
    try {
      const { input, result } = castingResult();
      const cadMeta: CADReportMeta = {
        geometrySource: 'occt', measuredVolumeCm3: 356.1, measuredWeightKg: 0.961,
        featureLines, featureMachineRatePerHr: 45, featureStock: 'near_net',
        userSpecifiedMaterial: true, userSpecifiedProcess: true, annualVolume: 50000,
      };
      expect(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], cadMeta)).not.toThrow();
      expect(saveCalls).toBe(1);
    } finally {
      api.save = origSave;
    }
  });

  it('renders with ESTIMATED geometry (text-parse fallback → widened band)', () => {
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const origSave = api.save;
    let saveCalls = 0;
    api.save = function (this: jsPDF) { saveCalls++; return this; };
    try {
      const { input, result } = castingResult();
      const cadMeta: CADReportMeta = {
        geometrySource: 'text_parsing', measuredVolumeCm3: null, measuredWeightKg: null,
        featureLines: null, annualVolume: 50000,
      };
      expect(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], cadMeta)).not.toThrow();
    } finally {
      api.save = origSave;
    }
  });

  it('renders unchanged for a non-CAD costing (empty cadMeta)', () => {
    const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
    const origSave = api.save;
    let saveCalls = 0;
    api.save = function (this: jsPDF) { saveCalls++; return this; };
    try {
      const { input, result } = castingResult();
      expect(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], {})).not.toThrow();
    } finally {
      api.save = origSave;
    }
  });
});

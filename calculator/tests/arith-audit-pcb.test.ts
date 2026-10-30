/**
 * Arithmetic audit — PCB FAB and PCBA (Oct 2026, docs/review/arith-audit/pcb.md). Each test failed before its fix.
 * The full independent re-add of the radar and camera boards is scripts/arith-audit/pcb.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4, NPI_RUN_QTY } from '../server/routes/pcb.js';
import { computePCBCountryCost, PCB_COUNTRY_RATES, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { deriveTechnology } from '../server/utils/pcb-boardspec-stabilise.js';
import { computePCBADrivers, type PCBAInputs } from '../src/engine/modules/pcba.js';
import { computePCBFabDrivers, layerFactorFor, type PCBFabInputs } from '../src/engine/modules/pcb-fab.js';

const QTY = 250_000;
async function stage4(fixture: string) {
  const R = JSON.parse(readFileSync(`e2e/fixtures/${fixture}`, 'utf8'));
  const a = JSON.parse(JSON.stringify(R.analysis));
  const s4 = await runStage4({ analysis: a, domain: R.stage1?.domain ?? 'general', asilLevel: R.asil?.asilLevel ?? 'Unknown',
    ocrResult: { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] },
    country: 'cn', orderQty: QTY, tag: '/test' });
  return { a, s4 };
}
let radar: Awaited<ReturnType<typeof stage4>>, camera: Awaited<ReturnType<typeof stage4>>;
beforeAll(async () => { radar = await stage4('pcb-radar-replies.json'); camera = await stage4('pcb-camera-replies.json'); });

const RADAR: PCBCostInput = {
  widthMm: 87.8, heightMm: 48.9, layers: 8, surfaceFinish: 'imag', throughVias: 220, blindVias: 0, microVias: 0,
  hdiStructure: 'none', impedanceControlled: true, smtPlacements: 222, throughHoleJoints: 4, manualJoints: 0, bgaCount: 1,
  aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 0, totalBOMCostGBP: 66.84, orderQuantity: 1000,
};

describe('P1 (H) PCBA: parallel SMT lines add capacity, not speed per board', () => {
  const base: PCBAInputs = { pcbCostPerBoard: 2, smtMachineId: 'smt', smtLabourId: 'lab', smtLines: 1, smtLineRatePerHr: 0, smtOee: 0.85,
    throughHoleCount: 0, manualSolderCount: 0, thLabourId: 'lab', thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20,
    assemblyYield: 1, reworkCostPerFailure: 0, amortizationVolume: 10_000, smtSides: 2,
    bom: [{ refDes: 'C1-C100', componentType: 'passive_0402', description: 'MLCC', qty: 100, unitPriceGBP: 0.002, moq: 1 }] };
  it('the SMT time a board is the same on 1 and on 2 lines (it was halved)', () => {
    const t = (smtLines: number) => computePCBADrivers({ ...base, smtLines }).operations.find(o => o.machineId === 'smt')!.cycleTimeHr;
    expect(t(2)).toBeCloseTo(t(1), 12);
    expect(t(1)).toBeCloseTo(100 / 25_000 + 30 / 3600, 12);
  });
});

describe('P2 (H) NPI: the 50-board figure is the tool\'s own costing at 50 boards', () => {
  it('radar: NPI ≥ the volume curve at 100 boards (it was the 250k headline × 1.38, £92 beside £221)', () => {
    const npi = radar.s4.npiBreakdown!;
    const at100 = radar.s4.volumeCurves.cn.find(p => p.qty === 100)!.totalPerBoard;
    expect(npi.unitCostNPI).toBeGreaterThan(at100);
    expect(npi.unitCostProd).toBeCloseTo(radar.s4.selectedCountryBreakdown!.totalPerBoard, 2);
    expect(NPI_RUN_QTY).toBe(50);
    expect(npi.basis).toMatch(/costed at 50 boards/);
    expect(npi.basis).toMatch(/engineering figures/);
    // The printed arithmetic is the arithmetic: costing at 50 + tooling ÷ 50.
    const m = /£([0-9.]+) \+ \(stencil £(\d+) \+ first article £(\d+)\) ÷ 50 = £([0-9.]+)/.exec(npi.basis!)!;
    expect(Number(m[1]) + (Number(m[2]) + Number(m[3])) / 50).toBeCloseTo(Number(m[4]), 2);
    expect(Number(m[4])).toBeCloseTo(npi.unitCostNPI, 2);
  });
});

describe('P3 (M) UK duty on the CIF value (goods + freight)', () => {
  it('duty = (fab + assembly + components + freight) × rate', () => {
    const bd = computePCBCountryCost(RADAR, 'cn');
    const freight = bd.basis!.find(b => b.item.startsWith('Freight'))!.gbp;
    const fab = bd.basis!.filter(b => b.item.startsWith('Bare board')).reduce((t, b) => t + b.gbp, 0);
    const asm = bd.basis!.filter(b => /SMT|Through-hole|AOI|X-ray|In-circuit|Conformal/.test(b.item)).reduce((t, b) => t + b.gbp, 0);
    const comp = bd.basis!.filter(b => /Components|EMS material/.test(b.item)).reduce((t, b) => t + b.gbp, 0);
    expect(freight).toBeGreaterThan(0.1);   // air at 1,000 boards
    expect(bd.breakdown.importDuty).toBeCloseTo((fab + asm + comp + freight) * PCB_COUNTRY_RATES.cn.logistics.importDutyFraction, 2);
  });
});

describe('P4 (M) the confidence band never collapses to a point', () => {
  it('camera (no model fab figure): fab + assembly is a range', () => {
    const cb = camera.s4.confidenceBand!;
    expect(cb.fabCostLow).toBeLessThan(cb.fabCostMid);
    expect(cb.fabCostHigh).toBeGreaterThan(cb.fabCostMid);
    expect(cb.basis).toMatch(/engineering ratios — not sourced/);
  });
  it('the "PCB fab est." range uses the band\'s own ratios (×0.70 / ×1.40)', () => {
    const f = (radar.a.costEstimates as { pcbFabGBP: { min: number; mid: number; max: number } }).pcbFabGBP;
    expect(f.min).toBeCloseTo(f.mid * 0.7, 1);   // mid is rounded to the penny before the ratio is shown
    expect(f.max).toBeCloseTo(f.mid * 1.4, 1);
  });
});

describe('P5 (M) no RF laminate invented from impedance control', () => {
  it('6+ layers with impedance control is not RF_MICRO without a Rogers / PTFE laminate named', () => {
    expect(deriveTechnology(8, 0, 'none', true, true, false)).toBe('FR4_HTg');
    expect(deriveTechnology(6, 0, 'none', true, false, false)).toBe('FR4_STD');
    expect(deriveTechnology(6, 0, 'none', true, false, false, true)).toBe('RF_MICRO');
  });
  it('camera: no "RF laminate not costed" warning for a laminate nobody read', () => {
    expect(camera.s4.sanityWarnings.map(w => w.code)).not.toContain('LAMINATE_NOT_COSTED');
    expect((camera.a.boardSpec as Record<string, unknown>).technologyType).not.toBe('RF_MICRO');
  });
});

describe('P6 (L) pcb-fab: the layer factor rises with the layer count', () => {
  it('3 layers below 4, 5 below 6 (they were 1.95 > 1.85 and 3.25 > 2.80)', () => {
    expect(layerFactorFor(3)).toBeLessThan(layerFactorFor(4));
    expect(layerFactorFor(5)).toBeLessThan(layerFactorFor(6));
    expect(layerFactorFor(3)).toBeCloseTo((1.0 + 1.85) / 2, 10);
    for (let k = 2; k <= 30; k++) expect(layerFactorFor(k)).toBeGreaterThan(layerFactorFor(k - 1));
  });
});

describe('P7 (M) every £ carries its arithmetic and the class of its figures', () => {
  it('the selected country breakdown: each basis line prints the £ it holds, and the lines add to the headline', () => {
    const bd = radar.s4.selectedCountryBreakdown!;
    expect(bd.basis!.length).toBeGreaterThan(15);
    for (const b of bd.basis!) {
      expect(b.source.length).toBeGreaterThan(10);
      const m = /= £(-?[0-9.]+)\s*$/.exec(b.formula);
      if (m) expect(Number(m[1])).toBeCloseTo(b.gbp, 3);
    }
    const sum = bd.basis!.filter(b => !/^UK import duty on the grade$/.test(b.item)).reduce((t, b) => t + b.gbp, 0)
      + bd.basis!.find(b => b.item === 'UK import duty on the grade')!.gbp;
    expect(sum).toBeCloseTo(bd.totalPerBoard, 1);
    expect(bd.basis!.find(b => b.item === 'EMS material burden')!.source).toMatch(/engineering figure — not sourced/);
    expect(bd.basis!.find(b => b.item === 'UK import duty')!.source).toMatch(/not confirmed/);
    // Printed for the selected country only.
    expect(radar.s4.countryComparison.filter(c => c.basis).map(c => c.countryId)).toEqual(['cn']);
  });
  it('pcb-fab: the build-up lines sum to the board cost and each says what it is', () => {
    const inp: PCBFabInputs = { layers: 6, boardWidthMm: 100, boardHeightMm: 80, panelWidthMm: 500, panelHeightMm: 600, panelUtilization: 0.72,
      technology: 'FR4_STD', baseMaterialTg: 150, copperWeightOz: 1, outerCopperWeightOz: 1, viaType: 'through_only', throughViaCount: 200,
      blindViaCount: 0, buriedViaCount: 0, microViaCount: 0, hdiStructure: 'none', minTraceSpaceMm: 0.1, impedanceControlled: false,
      hasFinePitchBGA: false, solderMaskColor: 'green', silkscreenSides: 2, surfaceFinish: 'enig', testMethod: 'flying_probe',
      qualityGrade: 'industrial', region: 'uk', nreCost: 0, amortizationVolume: 10_000 };
    const d = computePCBFabDrivers(inp);
    const lines = d.rawMaterial.lines!;
    expect(lines.reduce((t, l) => t + l.qty * l.unitCost, 0)).toBeCloseTo(d.rawMaterial.directCost!, 10);
    for (const l of lines) expect(l.description).toMatch(/CostVision engineering figure, not sourced/);
  });
});

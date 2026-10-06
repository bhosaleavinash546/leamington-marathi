/**
 * The director-review trace (docs/pcb/traced-example-radar.md): every step from
 * photo to pound is deterministic and adds up, the automotive grade is in the
 * headline, and the model is only ever asked to read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computePCBCountryCost, PCB_COUNTRY_RATES, ICT_FIXTURE_GBP, XRAY_SECONDS_PER_BOARD, XRAY_SETUP_GBP, AOI_SECONDS_PER_BOARD, AOI_PROGRAM_GBP, materialBurdenFor, type PCBCostInput } from '../server/data/pcb-country-rates.js';
const ICT_SEC = 90;   // the radar input's ictTimeSec
import { applyAutomotiveGrade, derivePlacementsFromBOM, setDeterministicCostEstimates, gradeVolumeCurve, EXTRACT_MODEL, DEEP_EXTRACT_MODEL, OCR_MODEL } from '../server/routes/pcb.js';

// The radar board as the corrected pipeline saw it (real-model run, 2026-09-29).
const radar: PCBCostInput = {
  widthMm: 87.8, heightMm: 48.9, layers: 8, surfaceFinish: 'imag', throughVias: 220, blindVias: 0, microVias: 0,
  hdiStructure: 'none', impedanceControlled: true, smtPlacements: 222, throughHoleJoints: 4, manualJoints: 0, bgaCount: 1,
  aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 0, totalBOMCostGBP: 66.84, orderQuantity: 250000,
};
const boardSpec = { widthMm: 87.8, heightMm: 48.9, estimatedLayers: 8 };
const assemblyData = { smtPlacements: 222, throughHoleJoints: 4, manualJoints: 0, bgaCount: 1 };

describe('China breakdown by hand (rates as of 2026-09-29)', () => {
  const r = PCB_COUNTRY_RATES.cn;
  const bd = computePCBCountryCost(radar, 'cn');
  const area = 87.8 * 48.9 / 10000;                              // 0.4293 dm²
  const waste = 1 / bd.panelInfo.utilisation;                    // panel waste on a 480×350 panel
  it('bare board: base + layers + finish + vias + impedance + setup', () => {
    const base = area * r.pcbFab.baseCostPerDm2_2L * waste;
    const layers = area * r.pcbFab.layerAdderPerDm2 * 6 * waste;
    const finish = (base + layers) * (r.pcbFab.surfaceFinishMultiplier.iteq - 1);   // immersion silver
    const vias = 2.2 * r.pcbFab.viaAdderPer100Through;
    const imp = (base + layers) * r.pcbFab.impedanceUpliftPct / 100;
    const setup = r.pcbFab.setupCostGBP / 250000;
    expect(bd.pcbFabPerBoard).toBeCloseTo(base + layers + finish + vias + imp + setup, 2);
    expect(bd.breakdown.pcbImpedance).toBeCloseTo(imp, 2);      // was in the total, missing from the table
    const table = bd.breakdown.pcbBase + bd.breakdown.pcbLayers + bd.breakdown.pcbSurface + bd.breakdown.pcbVias + bd.breakdown.pcbHDI + bd.breakdown.pcbSetup + bd.breakdown.pcbImpedance + bd.breakdown.pcbCopper;
    expect(table).toBeCloseTo(bd.pcbFabPerBoard, 1);
  });
  it('assembly: placements at the line rate + AOI + X-ray + ICT', () => {
    const smt = 222 / 3600 * r.assembly.smtLineRatePerHr + r.assembly.batchSetupGBP / 250000;
    const th = 4 * r.assembly.thRatePerJoint;
    // ICT at volume: test time × (2 × labour £/h) + the fixture over the order, capped at the table price.
    const ict = Math.min(r.assembly.ictPerBoard, ICT_SEC / 3600 * 2 * r.assembly.labourRatePerHr + ICT_FIXTURE_GBP / 250000);
    const xray = Math.min(r.assembly.xrayPerBoard, XRAY_SECONDS_PER_BOARD / 3600 * 2 * r.assembly.labourRatePerHr + XRAY_SETUP_GBP / 250000);
    const aoi = Math.min(r.assembly.aoiPerBoard, AOI_SECONDS_PER_BOARD / 3600 * 2 * r.assembly.labourRatePerHr + AOI_PROGRAM_GBP / 250000);
    const test = aoi + xray + ict;
    expect(bd.assemblyPerBoard).toBeCloseTo(smt + th + test, 2);
  });
  it('components sourced in China at the country multiplier; duty on the customs value', () => {
    expect(bd.bomCostPerBoard).toBeCloseTo(66.84 * r.components.priceMultiplier * (1 + materialBurdenFor(250000)), 2);   // + EMS material burden
    expect(bd.breakdown.importDuty).toBeCloseTo((bd.pcbFabPerBoard + bd.assemblyPerBoard + bd.bomCostPerBoard) * r.logistics.importDutyFraction, 2);
  });
  it('the total is the sum of its parts', () => {
    const b = bd.breakdown;
    const sum = bd.pcbFabPerBoard + bd.assemblyPerBoard + bd.bomCostPerBoard + bd.logisticsPerBoard + b.energy + b.packaging + b.yieldLoss;
    expect(bd.totalPerBoard).toBeCloseTo(sum, 1);
  });
});

describe('automotive grade is in the headline', () => {
  it('folds IATF / class 3 / burn-in / laminate premiums into fab and assembly, and re-bases duty', () => {
    const bd = computePCBCountryCost(radar, 'cn');
    const before = { fab: bd.pcbFabPerBoard, asm: bd.assemblyPerBoard, total: bd.totalPerBoard, duty: bd.breakdown.importDuty };
    const g = applyAutomotiveGrade(bd, boardSpec, assemblyData, 'ASIL-C', 250000, 'automotive_adas')!;
    expect(g).not.toBeNull();
    const fabP = g.fab.totalAutomotiveFabGBP - g.fab.standardFabGBP;
    const asmP = g.assembly.totalAutomotiveAssemblyGBP - g.assembly.standardAssemblyGBP;
    expect(bd.pcbFabPerBoard).toBeCloseTo(before.fab + fabP, 2);
    expect(bd.assemblyPerBoard).toBeCloseTo(before.asm + asmP, 2);
    expect(bd.breakdown.importDuty).toBeCloseTo(before.duty + (fabP + asmP) * 0.037, 2);
    expect(bd.totalPerBoard).toBeCloseTo(before.total + fabP + asmP + (fabP + asmP) * 0.037, 1);
    expect(bd.automotiveGrade).toEqual({ asil: 'ASIL-C', fabPremiumGBP: Math.round(fabP * 100) / 100, assemblyPremiumGBP: Math.round(asmP * 100) / 100 });
    expect(g.assembly.burnInGBP).toBeGreaterThan(0);              // ASIL-C carries burn-in
    // The side panels now report exactly what the headline contains.
    expect(g.assembly.totalAutomotiveAssemblyGBP).toBeCloseTo(bd.assemblyPerBoard, 2);
    expect(g.fab.totalAutomotiveFabGBP).toBeCloseTo(bd.pcbFabPerBoard, 2);
  });
  it('a consumer board is untouched', () => {
    const bd = computePCBCountryCost(radar, 'cn');
    const t = bd.totalPerBoard;
    expect(applyAutomotiveGrade(bd, boardSpec, assemblyData, 'Unknown', 250000, 'consumer_iot')).toBeNull();
    expect(bd.totalPerBoard).toBe(t);
    expect(bd.automotiveGrade).toBeUndefined();
  });
  it('the volume curve carries the same grade', () => {
    const pts = [{ qty: 250000, totalPerBoard: 68.21, pcbFabPerBoard: 0.82, assemblyPerBoard: 5.03, logisticsPerBoard: 2.43 }];
    const g = gradeVolumeCurve(pts, boardSpec, assemblyData, 'ASIL-C', 'automotive_adas', 30);
    expect(g[0].totalPerBoard).toBeGreaterThan(71);
    expect(gradeVolumeCurve(pts, boardSpec, assemblyData, 'ASIL-C', 'consumer_iot', 30)[0].totalPerBoard).toBe(68.21);
  });
});

describe('the model only reads', () => {
  it('placements come from the priced lines, not the model\'s separate count', () => {
    const bom = [
      { refDes: 'U1', componentType: 'ic_bga', qty: 1 }, { refDes: 'R1-R70', componentType: 'passive_0402', qty: 70 },
      { refDes: 'C1,C2', componentType: 'through_hole', qty: 2 }, { refDes: 'J2,J3', componentType: 'connector_smt', qty: 2, priceSource: 'not-fitted' },
      { refDes: 'SH1', componentType: 'mechanical', qty: 1 },
    ];
    const asm: Record<string, unknown> = { smtPlacements: 224, bgaCount: 0 };
    const w = derivePlacementsFromBOM(bom, asm);
    expect(asm.smtPlacements).toBe(71);
    expect(asm.aiSmtPlacements).toBe(224);
    expect(asm.bgaCount).toBe(1);
    expect(asm.throughHoleJoints).toBe(4);
    expect(w[0].code).toBe('PLACEMENTS_FROM_BOM');
  });
  it('costEstimates is the deterministic country figure; the model\'s first pass is kept for audit only', () => {
    const a: Record<string, unknown> = { costEstimates: { pcbFabGBP: { min: 4.88, mid: 6.1, max: 7.92 }, totalBOMCostGBP: 77.09, smtAssemblyCostGBP: 18 } };
    const bd = computePCBCountryCost(radar, 'cn');
    setDeterministicCostEstimates(a, bd, 66.84);
    const ce = a.costEstimates as Record<string, unknown>;
    expect((ce.pcbFabGBP as { mid: number }).mid).toBe(bd.pcbFabPerBoard);
    expect(ce.smtAssemblyCostGBP).toBe(bd.assemblyPerBoard);
    expect(ce.totalBOMCostGBP).toBe(66.84);
    expect(String(ce.basis)).toMatch(/deterministic/);
    expect((ce.aiFirstPass as { smtAssemblyCostGBP: number }).smtAssemblyCostGBP).toBe(18);
  });
  it('the Stage 3 prompt asks for no cost figures', () => {
    const src = readFileSync(new URL('../server/routes/pcb.ts', import.meta.url), 'utf8');
    const tmplStart = src.indexOf('Return ONLY this JSON structure');
    const tmpl = src.slice(tmplStart, src.indexOf('INSTRUCTIONS:', tmplStart));
    expect(tmpl).not.toMatch(/costEstimates|pcbFabGBP|smtAssemblyCostGBP|totalBOMCostGBP/);
    expect(src).toMatch(/Do NOT estimate board fabrication, assembly or total costs/);
  });
  it('current models; no sampling parameters on the 5.x calls', () => {
    expect(EXTRACT_MODEL).toBe('claude-sonnet-5-5');
    expect(DEEP_EXTRACT_MODEL).toBe('claude-opus-5-5');
    expect(OCR_MODEL).toBe('claude-sonnet-5-5');
    const src = readFileSync(new URL('../server/routes/pcb.ts', import.meta.url), 'utf8');
    // Every call that sets temperature must be a Haiku call (Sonnet/Opus 5.x reject it).
    for (const m of src.matchAll(/messages\.create\(\{ temperature: 0,\s*\n\s*model: ([^,\n]+)/g)) expect(m[1]).toMatch(/haiku/);
    expect(src).toMatch(/messages\.stream\(\{ \.\.\.params, output_config: pcbAnalysisOutputConfig\(\) \}\)\.finalMessage\(\)/);
  });
});

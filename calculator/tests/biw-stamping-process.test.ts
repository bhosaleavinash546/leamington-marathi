/**
 * The BIW stamping process (phase 4 of docs/sheet-metal/blank-development-
 * research-2026-10.md): blanks cut before a transfer or tandem line, one press
 * per operation on a tandem line, the binder + addendum a drawn panel carries,
 * and a tailor-welded blank's premium — in the module, the rules and the
 * outline offset the nesting uses.
 */
import { describe, it, expect } from 'vitest';
import { computeSheetMetalDrivers, type SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import { estimateStampingDieCost } from '../src/engine/modules/sheet-metal-advisor.js';
import { offsetOutline, polygonArea, type Pt } from '../src/engine/nesting.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { SHEET_METAL_RULES, pressProcess, blankDims, stripLayout } from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const BASE: SheetMetalInputs = {
  materialId: 'mat-dc01', netWeightKg: 1.2, blankLengthMm: 600, blankWidthMm: 400,
  thicknessMm: 0.8, perimeterMm: 2000, shearStrengthMPa: 280, stripWidthMm: 410, pitchMm: 610,
  partsPerStroke: 1, pressId: 'press-800t', labourId: 'lab-uk-semiskilled', strokesPerMin: 12,
  oee: 0.85, manning: 1, labourEfficiency: 0.95, numOperations: 5, dieType: 'single_stage',
  dieLife: 0, dieCostEstimate: 0, amortizationVolume: 300_000,
};
const pressOp = (d: ReturnType<typeof computeSheetMetalDrivers>) => d.operations.find(o => /press|line/i.test(o.operationName ?? ''))!;

describe('the module: press line, blanking and the tailor-welded blank', () => {
  it('a coil-fed die is the old behaviour: one press stroke, no blanking op', () => {
    const d = computeSheetMetalDrivers(BASE);
    expect(d.operations.map(o => o.operationName)).toEqual(['Press (single stage)']);
    expect(pressOp(d).cycleTimeHr).toBeCloseTo(1 / (12 * 60), 9);
  });
  it('a tandem line counts the stroke once per press and adds a blanking press', () => {
    const d = computeSheetMetalDrivers({ ...BASE, pressLine: 'tandem', pressesInLine: 5, blanking: { method: 'die', blanksPerMin: 45 } });
    const names = d.operations.map(o => o.operationName);
    expect(names).toEqual(['Blanking press (coil → blanks)', 'Tandem press line (5 presses)']);
    expect(d.operations[0].machineId).toBe('press-200t');
    expect(d.operations[0].cycleTimeHr).toBeCloseTo(1 / (45 * 60), 9);
    expect(d.operations[1].cycleTimeHr).toBeCloseTo(5 / (12 * 60), 9);
    expect(d.operations[1].labourTimeHr).toBeCloseTo(5 / (12 * 60), 9);
  });
  it('a transfer press strokes once; a laser blanking line needs no blanking die', () => {
    const d = computeSheetMetalDrivers({ ...BASE, pressLine: 'transfer', dieType: 'transfer', blanking: { method: 'laser', blanksPerMin: 20 } });
    expect(d.operations.map(o => o.operationName)).toEqual(['Laser blanking line', 'Transfer press']);
    expect(d.operations[0].machineId).toBe('laser-trumpf-5030');
    expect(d.operations[1].cycleTimeHr).toBeCloseTo(1 / (12 * 60), 9);
  });
  it('tandem tooling is one single-stage die per press', () => {
    const d = computeSheetMetalDrivers({ ...BASE, pressLine: 'tandem', pressesInLine: 5 });
    const one = estimateStampingDieCost({ dieType: 'single_stage', stations: 1, blankAreaCm2: 2400, shearStrengthMPa: 280 }).total;
    expect(d.tooling.totalToolingCost).toBeCloseTo(5 * one, 0);
  });
  it('a tailor-welded blank adds its premium on the metal bought and the weld', () => {
    const plain = computeSheetMetalDrivers({ ...BASE, densityKgPerM3: 7850 });
    const twb = computeSheetMetalDrivers({ ...BASE, densityKgPerM3: 7850, tailorWeldedBlank: { premiumPerKg: 0.3, weldLengthMm: 400 } });
    const grossKg = plain.rawMaterial.netWeightKg / plain.rawMaterial.materialUtilization;
    expect(twb.rawMaterial.consumablesCostPerPart).toBeCloseTo(0.3 * grossKg + 400 * 0.006, 6);
    expect(plain.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
  });
});

describe('the outline offset', () => {
  it('grows a rectangle by the addendum on every side', () => {
    const R: Pt[] = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const g = offsetOutline(R, 10);
    expect(polygonArea(g)).toBeCloseTo(120 * 70, 6);
    expect(Math.min(...g.map(p => p[0]))).toBeCloseTo(-10, 6);
    expect(Math.max(...g.map(p => p[1]))).toBeCloseTo(60, 6);
    // Clockwise input gives the same result.
    expect(polygonArea(offsetOutline(R.slice().reverse(), 10))).toBeCloseTo(120 * 70, 6);
  });
  it('grows a circle by its radius: area ≈ A + P·d + π·d²', () => {
    const C: Pt[] = Array.from({ length: 360 }, (_, i) => [50 * Math.cos((i / 360) * 2 * Math.PI), 50 * Math.sin((i / 360) * 2 * Math.PI)]);
    expect(polygonArea(offsetOutline(C, 20)) / (Math.PI * 70 * 70)).toBeCloseTo(1, 3);
  });
});

/** A drawn door-inner-sized panel, as the unfold + forming solve would record it. */
const DRAWN_PANEL = {
  status: 'success', partName: 'door inner',
  boundingBox: { xMm: 900, yMm: 700, zMm: 120 },
  volume: { mm3: 480_000, cm3: 480 }, surfaceArea: { mm2: 1_210_000, cm2: 12_100 },
  wallThickness: { minMm: 0.7, maxMm: 0.9, meanMm: 0.8, stdDevMm: 0.05, sampleCount: 300, method: 'ray_cast', uniformity: 'good' },
  sheetMetal: { bendCount: 6, totalBendLengthMm: 2400, thicknessMm: 0.8, thicknessSource: 'bend-pairs', gaugeSamples: 6 },
  featureTable: [{ kind: 'hole', diaMm: 12, depthMm: 0.8, through: true, count: 8 }],
  features: { freeFormFaceCount: 40, planarFaceCount: 12 },
  blank: {
    grossAreaMm2: 640_000, netAreaMm2: 600_000, outerPerimeterMm: 3300, holePerimeterMm: 300, holeCount: 8,
    boundingRectMm: { lengthMm: 950, widthMm: 760 }, rectangleFill: 0.886, source: 'developed from the solid — drawn (28.0% stretch), forming solve applied',
    developedFrom: 'solid', developable: false, maxStrainPct: 28,
    outline: [[0, 0], [950, 0], [950, 760], [0, 760]],
    forming: { method: 'one-step inverse', nValue: 1, blankAreaUnfoldMm2: 600_000, blankAreaSolvedMm2: 640_000, thinningP95Pct: 12, maxThinningPct: 22, maxThickeningPct: 6, strainPoints: [[0.25, -0.05]] },
  },
} as unknown as OCCTGeometry;
const BRACKET = { ...DRAWN_PANEL, boundingBox: { xMm: 256, yMm: 226, zMm: 31 }, blank: { ...(DRAWN_PANEL as { blank: object }).blank, developable: false, maxStrainPct: 8, grossAreaMm2: 48_600, boundingRectMm: { lengthMm: 279, widthMm: 210 }, outline: [[0, 0], [279, 0], [279, 210], [0, 210]] } } as unknown as OCCTGeometry;
const ctx = (geo: OCCTGeometry, over: Partial<RuleContext> = {}): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'sheet_metal', annualVolume: 120_000, filename: 'panel.step',
  answers: { 'material.family': 'steel' }, ...over,
});

describe('the rules: a drawn panel is blanked first and drawn on a line', () => {
  it('reads the process from the blank', () => {
    const p = pressProcess(ctx(DRAWN_PANEL));
    expect(p.kind).toBe('drawn');
    expect(p.pressLine).toBe('tandem');          // 6,400 cm² blank
    expect(p.operations).toEqual(['draw', 'trim', 'pierce', 'flange', 'restrike']);
    expect(p.blanking).toBe('die');
    expect(p.blanksPerMin).toBe(45);
    expect(p.addendumMm).toBe(60);               // ½ × (120 − 0.8) → 60
    expect(p.drawDepthMm).toBeCloseTo(119.2, 6);
  });
  it('the blank rectangle and the strip carry the addendum', () => {
    const b = blankDims(ctx(DRAWN_PANEL))!;
    expect(b.lengthMm).toBe(950 + 120);
    expect(b.widthMm).toBe(760 + 120);
    expect(b.basis).toContain('60 mm binder and draw addendum each side');
    const l = stripLayout(ctx(DRAWN_PANEL))!;
    expect(l.pitchMm).toBeGreaterThanOrEqual(760 + 120 + 3);   // the grown outline, across or along
    expect(l.pitchBasis).toContain('grown by the 60 mm addendum');
  });
  it('fills every process field and they reach the cost parameters', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(DRAWN_PANEL));
    const sm = r.suggestions.sheetMetal as Record<string, unknown>;
    expect(sm.pressLine).toBe('tandem');
    expect(sm.pressesInLine).toBe(5);
    expect(sm.blankingMethod).toBe('die');
    expect(sm.blanksPerMin).toBe(45);
    expect(sm.drawAddendumMm).toBe(60);
    expect(sm.numOps).toBe(5);
    expect(sm.dieType).toBe('single_stage');
    expect(r.provenance['sm-press-line'].basis).toContain('tandem line');
    const p = toCostParams('sheet_metal', r.suggestions as unknown as Parameters<typeof toCostParams>[1], 120_000, 'steel', DRAWN_PANEL)!;
    const params = p.params as unknown as SheetMetalInputs;
    expect(params.pressLine).toBe('tandem');
    expect(params.pressesInLine).toBe(5);
    expect(params.blanking).toEqual({ method: 'die', blanksPerMin: 45 });
    expect(params.drawAddendumMm).toBe(60);
  });
  it('a small drawn part goes on a transfer press; low volume blanks by laser', () => {
    const small = { ...DRAWN_PANEL, blank: { ...(DRAWN_PANEL as { blank: object }).blank, grossAreaMm2: 90_000 } } as unknown as OCCTGeometry;
    const p = pressProcess(ctx(small, { annualVolume: 20_000 }));
    expect(p.pressLine).toBe('transfer');
    expect(p.blanking).toBe('laser');
    expect(p.blanksPerMin).toBe(20);
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(small, { annualVolume: 20_000 }));
    expect((r.suggestions.sheetMetal as Record<string, unknown>).dieType).toBe('transfer');
    expect((r.suggestions.sheetMetal as Record<string, unknown>).pressesInLine).toBe(1);
  });
  it('a stretch-formed bracket stays coil-fed with a 10 mm trim allowance; a bent part carries nothing', () => {
    const p = pressProcess(ctx(BRACKET));
    expect(p.kind).toBe('stretch-formed');
    expect(p.pressLine).toBe('coil-fed');
    expect(p.addendumMm).toBe(10);
    expect(blankDims(ctx(BRACKET))!.lengthMm).toBe(279 + 20);
    const bent = { ...BRACKET, blank: { ...(BRACKET as { blank: object }).blank, developable: true, maxStrainPct: 1 } } as unknown as OCCTGeometry;
    expect(pressProcess(ctx(bent)).addendumMm).toBe(0);
    expect(pressProcess(ctx(bent)).kind).toBe('bent');
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(bent));
    expect((r.suggestions.sheetMetal as Record<string, unknown>).blankingMethod).toBe('none');
    expect((r.suggestions.sheetMetal as Record<string, unknown>).blanksPerMin).toBe(0);
  });
});

/**
 * PCB photo → BOM → cost 360 review (12 Oct 2026, docs/review/pcb-360-review-2026-10-12.md). Each test pins a defect
 * the code trace or the live run found: what a re-price forgets, what the cache replays, what a cut-off reply loses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4, isCacheableRun } from '../server/routes/pcb.js';
import { parseOcrReply } from '../server/utils/pcb-ocr-parse.js';
import { salvageAnalysisFromRaw } from '../server/utils/pcb-salvage.js';
import { buildAutomotiveSearchVariants } from '../server/utils/pcb-live-pricing.js';

const R = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
const ocr = { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] };
const stage4 = (analysis: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  runStage4({ analysis, domain: 'automotive_adas', asilLevel: 'ASIL-B', ocrResult: ocr, country: 'cn', orderQty: 250_000, tag: '/test', ...extra } as never);
const line = (a: Record<string, unknown>, rd: string) => (a.bom as Array<Record<string, unknown>>).find(l => l.refDes === rd)!;

describe("an engineer's correction survives every re-price", () => {
  it('a price typed on /reanalyze is kept on the next /reprice (it went back to the class range)', async () => {
    const a = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    await stage4(a);
    const j1 = line(a, 'J1');
    const corrected = await stage4(a, { correctedBOM: [{ ...j1, unitPriceGBP: 0.5, priceEdited: true }] });
    expect(line(a, 'J1').unitPriceGBP).toBe(0.5);
    const head = corrected.selectedCountryBreakdown!.totalPerBoard;
    // /reprice: the client sends the analysis back, no corrections (a new country / quantity / form edit)
    const again = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    const re = await stage4(again);
    expect(line(again, 'J1').unitPriceGBP).toBe(0.5);
    expect(line(again, 'J1').priceSource).toBe('user');
    expect(re.selectedCountryBreakdown!.totalPerBoard).toBeCloseTo(head, 2);
  });
  it('a quantity-only edit changes the count and leaves the price to the tool (it froze the price as the engineer\'s)', async () => {
    const a = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    await stage4(a);
    const j1 = line(a, 'J1');
    await stage4(a, { correctedBOM: [{ ...j1, qty: 2, priceEdited: false }] });
    const l = line(a, 'J1');
    expect(l.qty).toBe(2);
    expect(l.priceSource).not.toBe('user');
    expect(l.userCorrected).not.toBe(true);
  });
  it('the placements follow a corrected count', async () => {
    const a = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    await stage4(a);
    const before = Number((a.assembly as Record<string, unknown>).smtPlacements);
    const c = (a.bom as Array<Record<string, unknown>>).find(l => String(l.componentType).startsWith('passive'))!;
    await stage4(a, { correctedBOM: [{ ...c, qty: Number(c.qty) + 10, priceEdited: false }] });
    expect(Number((a.assembly as Record<string, unknown>).smtPlacements)).toBe(before + 10);
  });
});

describe("the model's first pass is kept for audit — not the tool's figures", () => {
  it('aiFirstPass holds what the model wrote before Stage 4', async () => {
    const a = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    const modelBom = (a.costEstimates as Record<string, unknown>).totalBOMCostGBP;
    await stage4(a);
    const first = (a.costEstimates as Record<string, unknown>).aiFirstPass as Record<string, unknown>;
    expect(first.totalBOMCostGBP).toBe(modelBom);
    expect((a.costEstimates as Record<string, unknown>).totalBOMCostGBP).not.toBe(modelBom);
  });
});

describe('a cut-off OCR reply keeps the markings it read in full', () => {
  it('max_tokens mid-array: the complete strings are kept, the cut one is not', () => {
    const raw = '{"icMarkings":["S32R294 1N82J","TEF8105 EN/0","TJA1043"],"refDesGroups":["U1","C1-C40"],"connectors":["J1: FAKRA"],"boardText":["REV A","CUT HE';
    const r = parseOcrReply(raw, raw, 'max_tokens');
    expect(r.icMarkings).toEqual(['S32R294 1N82J', 'TEF8105 EN/0', 'TJA1043']);
    expect(r.boardText).toEqual(['REV A']);
    expect(r.extractionQuality).toBe('truncated');
  });
  it('a whole reply parses as before; nothing readable still throws (the stage reports "failed")', () => {
    expect(parseOcrReply('{"icMarkings":["A1"],"extractionQuality":"high"}', '').extractionQuality).toBe('high');
    expect(() => parseOcrReply('{"icMarkings":["TPS6', '{"icMarkings":["TPS6', 'max_tokens')).toThrow();
  });
});

describe('only a whole run is cached', () => {
  const a = { bom: [{ refDes: 'U1', qty: 1 }] };
  it('a run whose classifier or OCR failed told the user to run again — it is not replayed for 30 days', () => {
    expect(isCacheableRun(a, false, false, 'high')).toBe(true);
    expect(isCacheableRun(a, false, true, 'high')).toBe(false);
    expect(isCacheableRun(a, false, false, 'failed')).toBe(false);
    expect(isCacheableRun(a, false, false, 'truncated')).toBe(false);
    expect(isCacheableRun({ ...a, _salvaged: true }, false, false, 'high')).toBe(false);
  });
});

describe('a cut-off parts list keeps a complete board spec, or says the board figures are defaults', () => {
  it('board spec before the cut is kept', () => {
    const raw = '{"partName":"Cam","boardSpec":{"widthMm":20,"heightMm":20,"estimatedLayers":8},"bom":[{"refDes":"U1","componentType":"ic_qfn","qty":1,"unitPriceGBP":1},{"refDes":"C1","qty":4';
    const s = salvageAnalysisFromRaw(raw)!;
    expect((s.boardSpec as Record<string, unknown>).estimatedLayers).toBe(8);
    expect(s._boardSpecLost).toBeUndefined();
  });
  it('board spec after the cut: flagged, so the warning says size and layers are defaults', () => {
    const raw = '{"partName":"Cam","bom":[{"refDes":"U1","componentType":"ic_qfn","qty":1,"unitPriceGBP":1},{"refDes":"C1","qty":4';
    const s = salvageAnalysisFromRaw(raw)!;
    expect(s._boardSpecLost).toBe(true);
  });
});

describe('live pricing reaches every part before any variant', () => {
  it('originals first; a part already carrying its AEC-Q qualifier gets no extra variants', () => {
    const pns = ['TPS62422QDRCRQ1', 'LM53600MQDSXRQ1', 'BQ24025DRCR', 'DS90UB935', 'TLV70233QDSERQ1', 'A1', 'A2', 'A3'];
    const v = buildAutomotiveSearchVariants(pns);
    expect(v.slice(0, pns.length)).toEqual(pns);
    expect(v).not.toContain('TPS62422QDRCRQ1Q');
    expect(v).toContain('BQ24025DRCR-Q1');
    expect(v.length).toBeLessThanOrEqual(20);
  });
});

describe('copper typed from the board data sheet is costed', () => {
  it('2 oz outer with user evidence prices heavy copper; the same figure from the model alone is struck to 1 oz', async () => {
    const user = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    Object.assign(user.boardSpec as object, { copperWeightOz: 2, copperEvidence: 'user', copperOzByLayer: [] });
    const u = await stage4(user);
    const model = JSON.parse(JSON.stringify(R.analysis)) as Record<string, unknown>;
    Object.assign(model.boardSpec as object, { copperWeightOz: 2, copperOzByLayer: [2, 1, 1, 1, 1, 1, 1, 2] });
    const m = await stage4(model);
    expect(Number((u.selectedCountryBreakdown!.breakdown as unknown as Record<string, number>).pcbCopper)).toBeGreaterThan(0);
    expect(Number((m.selectedCountryBreakdown!.breakdown as unknown as Record<string, number>).pcbCopper)).toBe(0);
  });
});

describe('the exports say what each price is (360 review line read)', async () => {
  const { buildPcbaReport } = await import('../src/export/pcba-report-data.js');
  const camera = {
    partName: 'camera module', boardSpec: { widthMm: 20, heightMm: 20, estimatedLayers: 8, throughVias: 115, copperWeightOz: 1, surfaceFinish: 'osp', qualityGrade: 'auto_grade2' },
    assembly: { smtPlacements: 80, bgaCount: 1, reflowSides: 2, ictTimeSec: 60 },
    bom: [
      { description: 'FPD-Link III Serializer', partNumber: 'DS90UB935-Q1', qty: 1, unitPriceGBP: 2.1315, priceSource: 'catalogue', catalogueConfidence: 'distributor', catalogueExact: false, needsVerification: true, priceNote: 'Family price … DERIVED above the largest published break (3,000)' },
      { description: 'Image sensor', qty: 1, unitPriceGBP: 4.78062, priceSource: 'class-range', needsVerification: true },
      { description: 'Ceramic capacitor', qty: 49, unitPriceGBP: 0.01888, priceSource: 'class-range', needsVerification: false },
    ],
    _selectedCountryBreakdown: { countryId: 'cn', countryName: 'China', pcbFabPerBoard: 0.38, assemblyPerBoard: 0.62, logisticsPerBoard: 0.33, bomCostPerBoard: 8.14, totalPerBoard: 9.47,
      breakdown: { materialBurden: 0.39, materialBurdenPct: 0.05, importDuty: 0.32 } },
  } as never;
  const rep = buildPcbaReport(camera, { annualVolume: 250_000 });
  it('a family match is not called a range price; a derived catalogue price says so', () => {
    const ser = rep.bom.find(l => l.partNumber === 'DS90UB935-Q1')!;
    expect(ser.source).toMatch(/derived at volume/);
    expect(ser.source).toMatch(/family match/);
    expect(ser.verifyWhy).toMatch(/family match/);
    expect(rep.bom.find(l => l.description === 'Image sensor')!.verifyWhy).toMatch(/range/);
  });
  it('lines print at their own price (no × 0.9997 scaling) and the accuracy note is there', () => {
    expect(rep.bom.find(l => l.partNumber === 'DS90UB935-Q1')!.unit).toBe(2.1315);
    expect(rep.accuracyNote).toMatch(/not yet measured/);
  });
  it('estimated board figures are marked; the quality grade reads as the form says it', () => {
    const rows = Object.fromEntries(rep.boardRows);
    expect(rows['Vias (through / blind / micro)']).toMatch(/estimated/);
    expect(rows['Finish · copper']).toMatch(/assumed/);
    expect(rows['In-circuit test']).toMatch(/60 s .*estimated/);
  });
});

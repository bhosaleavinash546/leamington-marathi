/**
 * The radar board through the ONE Stage 4 every route now uses (PCB review, Oct 2026),
 * from the model's real 2026-09-29 reading (e2e/fixtures/pcb-radar-replies.json) to
 * the pound — checked by independent arithmetic, not by re-running the same code.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { runStage4, applyAutomotiveGrade, bomAtQty } from '../server/routes/pcb.js';
import { computePCBCountryCost, materialBurdenFor } from '../server/data/pcb-country-rates.js';

const R = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
const QTY = 250_000;
type S4 = Awaited<ReturnType<typeof runStage4>>;
let s4: S4;
let a: Record<string, unknown>;
const bom = () => a.bom as Array<Record<string, unknown>>;

beforeAll(async () => {
  a = JSON.parse(JSON.stringify(R.analysis));
  s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'ASIL-C',
    ocrResult: { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] },
    country: 'cn', orderQty: QTY, tag: '/test' });
});

describe('radar board, China, 250k, ASIL-C — every figure from the headline', () => {
  it('Stage 4 completed', () => { expect(s4.failed).toBe(false); expect(s4.selectedCountryBreakdown).not.toBeNull(); });

  it('no line is priced by the model alone', () => {
    const allowed = new Set(['catalogue', 'known-range', 'function-range', 'class-range', 'not-fitted', 'user']);
    for (const l of bom()) expect(allowed.has(String(l.priceSource)), `${l.refDes} ${l.priceSource}`).toBe(true);
  });

  it('BOM total = Σ line totals; country BOM = BOM × the sourcing factor × (1 + the EMS material burden)', () => {
    const sum = bom().reduce((t, l) => t + Number(l.lineTotalGBP), 0);
    const ce = a.costEstimates as Record<string, number>;
    expect(ce.totalBOMCostGBP).toBeCloseTo(sum, 2);
    expect(ce.confirmedBOMCostGBP + ce.unverifiedBOMCostGBP).toBeCloseTo(ce.totalBOMCostGBP, 2);
    expect(s4.selectedCountryBreakdown!.bomCostPerBoard).toBeCloseTo(ce.totalBOMCostGBP * (1 + materialBurdenFor(250000)), 2);
  });

  it('the headline is the sum of its parts', () => {
    const bd = s4.selectedCountryBreakdown!;
    const b = bd.breakdown;
    expect(bd.totalPerBoard).toBeCloseTo(bd.pcbFabPerBoard + bd.assemblyPerBoard + bd.bomCostPerBoard + bd.logisticsPerBoard + b.energy + b.packaging + b.yieldLoss, 1);
  });

  it('the selected country row, the volume curve at 250k and the NPI production figure all equal the headline', () => {
    const h = s4.selectedCountryBreakdown!.totalPerBoard;
    expect(s4.countryComparison.find(c => c.countryId === 'cn')!.totalPerBoard).toBeCloseTo(h, 2);
    const pt = s4.volumeCurves.cn.find(p => p.qty === QTY)!;
    expect(pt).toBeDefined();
    expect(pt.totalPerBoard).toBeCloseTo(h, 2);
    expect(s4.npiBreakdown!.unitCostProd).toBeCloseTo(h, 2);
  });

  it('an unchanged what-if scenario (the /scenario arithmetic) equals the headline — no false saving', () => {
    const bs = a.boardSpec as Record<string, unknown>, as = a.assembly as Record<string, unknown>;
    const bd0 = s4.selectedCountryBreakdown!;
    const input = { widthMm: Number(bs.widthMm), heightMm: Number(bs.heightMm), layers: Number(bs.estimatedLayers),
      surfaceFinish: String(bs.surfaceFinish), throughVias: Number(bs.throughVias), blindVias: Number(bs.blindVias) || 0, microVias: Number(bs.microVias) || 0,
      hdiStructure: String(bs.hdiStructure || 'none'), impedanceControlled: Boolean(bs.impedanceControlRequired),
      smtPlacements: Number(as.smtPlacements), throughHoleJoints: Number(as.throughHoleJoints) || 0, manualJoints: Number(as.manualJoints) || 0,
      bgaCount: Number(as.bgaCount) || 0, aoiRequired: Boolean(as.aoiRequired), ictTimeSec: Number(as.ictTimeSec) || 0,
      conformalCoatAreaCm2: s4.conformalCoatingCost > 0 ? Number(bs.widthMm) * Number(bs.heightMm) / 100 : 0,
      totalBOMCostGBP: bomAtQty(bom(), QTY, QTY), orderQuantity: QTY };
    const sc = computePCBCountryCost(input, 'cn');
    applyAutomotiveGrade(sc, bs, as, 'ASIL-C', QTY, 'automotive_adas');
    expect(sc.totalPerBoard).toBeCloseTo(bd0.totalPerBoard, 2);
  });

  it('every country row adds up when the energy / packaging / yield column is shown', () => {
    for (const c of s4.countryComparison) {
      const other = c.totalPerBoard - c.pcbFabPerBoard - c.assemblyPerBoard - c.logisticsPerBoard - c.bomCostPerBoard;
      expect(other).toBeCloseTo(c.breakdown.energy + c.breakdown.packaging + c.breakdown.yieldLoss, 1);
    }
  });

  it('"to verify" count = the lines flagged; no designator counted twice', () => {
    expect(s4.needsVerificationCount).toBe(bom().filter(l => l.needsVerification === true).length);
    const refs = bom().flatMap(l => String(l.refDes ?? '').split(/[,\s]+/).filter(Boolean));
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('re-pricing the result (Fetch Live Prices / country change) gives the same headline — nothing applied twice', async () => {
    const again = JSON.parse(JSON.stringify(a));
    const s4b = await runStage4({ analysis: again, domain: 'automotive_adas', asilLevel: 'ASIL-C',
      ocrResult: { ...R.ocr, refDesGroups: [], connectors: [], boardText: [] }, country: 'cn', orderQty: QTY, tag: '/test' });
    expect(s4b.selectedCountryBreakdown!.totalPerBoard).toBeCloseTo(s4.selectedCountryBreakdown!.totalPerBoard, 2);
  });

  it('prints the trace for the review document', () => {
    const bd = s4.selectedCountryBreakdown!, b = bd.breakdown, ce = a.costEstimates as Record<string, number>;
    const by: Record<string, number> = {};
    for (const l of bom()) by[String(l.priceSource)] = (by[String(l.priceSource)] ?? 0) + Number(l.lineTotalGBP);
    console.log(JSON.stringify({ lines: bom().length, bomDistributor: ce.totalBOMCostGBP, bySource: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v * 100) / 100])),
      bomChina: bd.bomCostPerBoard, fab: bd.pcbFabPerBoard, asm: bd.assemblyPerBoard, log: bd.logisticsPerBoard, energy: b.energy, pack: b.packaging, yield: b.yieldLoss,
      autoFab: b.automotiveFab, autoAsm: b.automotiveAssembly, headline: bd.totalPerBoard, verify: s4.needsVerificationCount,
      warnings: s4.sanityWarnings.map(w => w.code) }));
  });
});

describe('placements', () => {
  it('not-fitted pads are not placed (222 on the radar, as the real run counted)', () => {
    expect(Number((a.assembly as Record<string, unknown>).smtPlacements)).toBe(222);
  });
});

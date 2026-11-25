/**
 * EDU audit G-17 (fab specification inputs) and G-07 remainder (selective / hand solder, staking, potting), Nov 2026.
 * An option is costed only with a published adder; the rest are listed. Research: scripts/pcb-research/2026-11-26-g17-g07/.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fabOptionsFromSpec, fabOptionsCost, FAB_OPTION_EVIDENCE as E } from '../server/data/pcb-fab-options.js';
import { thtMethodCost, operationsCost, OPS } from '../server/data/pcb-operations.js';
import { computePCBCountryCost, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { copperLayersFromSpec } from '../server/utils/pcb-boardspec-stabilise.js';
import { runStage4, computeAutomotiveFabAdjustment } from '../server/routes/pcb.js';
import { FAB_FIELDS } from '../src/ui/pcb/analysis-link.js';

const base: PCBCostInput = { widthMm: 100, heightMm: 80, layers: 4, surfaceFinish: 'enig', throughVias: 0, blindVias: 0, microVias: 0, hdiStructure: 'none',
  impedanceControlled: false, smtPlacements: 400, throughHoleJoints: 40, manualJoints: 0, bgaCount: 0, aoiRequired: true, ictTimeSec: 0,
  conformalCoatAreaCm2: 0, totalBOMCostGBP: 30, orderQuantity: 10_000, programmeYears: 5 };

describe('G-17 fab options: reading the form', () => {
  it('keeps only valid values; nothing set → no options', () => {
    expect(fabOptionsFromSpec({})).toBeUndefined();
    expect(fabOptionsFromSpec({ boardThicknessMm: 2.4, laminateTg: '170', viaFill: 'pofv', enigGoldUin: 2, impedanceTolPct: 5 }))
      .toEqual({ thicknessMm: 2.4, laminate: 'tg170', viaFill: 'pofv', enigGoldUin: 2, impedanceTolPct: 5 });
    expect(fabOptionsFromSpec({ boardThicknessMm: 40, laminateTg: 'FR5', viaFill: 'glue', enigGoldUin: 9, impedanceTolPct: 50 })).toBeUndefined();
  });
});

describe('G-17 fab options: the arithmetic', () => {
  const ctx = { coreGBP: 10, gbpPerCnyM2: 0.001, layers: 4, finish: 'enig', basis: 'table' as const };
  it('thickness: standard 0.8–1.6 mm free; above, linear to Würth\'s +37 % at 3.2 mm; below, to +7 % at 0.5 mm', () => {
    expect(fabOptionsCost({ thicknessMm: 1.2 }, ctx).total).toBe(0);
    expect(fabOptionsCost({ thicknessMm: 1.2 }, ctx).included[0]).toMatch(/standard 0\.8–1\.6 mm/);
    expect(fabOptionsCost({ thicknessMm: 2.4 }, ctx).total).toBeCloseTo(10 * 0.37 * 0.5, 10);
    expect(fabOptionsCost({ thicknessMm: 3.2 }, ctx).total).toBeCloseTo(3.7, 10);
    expect(fabOptionsCost({ thicknessMm: 4.0 }, ctx).total).toBeCloseTo(3.7, 10);   // held at the last published point
    expect(fabOptionsCost({ thicknessMm: 0.5 }, ctx).total).toBeCloseTo(0.7, 10);
  });
  it('laminate: Tg150 +8 %, Tg170 +15 % on the table; inside an automotive market ASP; high CTI listed, not costed', () => {
    expect(fabOptionsCost({ laminate: 'tg150' }, ctx).total).toBeCloseTo(0.8, 10);
    expect(fabOptionsCost({ laminate: 'tg170' }, ctx).total).toBeCloseTo(1.5, 10);
    const m = fabOptionsCost({ laminate: 'tg170' }, { ...ctx, basis: 'market' });
    expect(m.total).toBe(0); expect(m.included[0]).toMatch(/inside the automotive market price/);
    expect(fabOptionsCost({ laminate: 'cti600' }, ctx).notCosted[0]).toMatch(/no fab publishes a price/);
  });
  it('via fill: ¥500/m² below 6 layers, free on 6+; mask plugging free on 4+', () => {
    expect(fabOptionsCost({ viaFill: 'resin' }, ctx).total).toBeCloseTo(500 * 0.001, 10);
    expect(fabOptionsCost({ viaFill: 'pofv' }, { ...ctx, layers: 6 }).total).toBe(0);
    expect(fabOptionsCost({ viaFill: 'mask' }, ctx).included[0]).toMatch(/free on 4\+ layers/);
    expect(fabOptionsCost({ viaFill: 'mask' }, { ...ctx, layers: 2 }).notCosted).toHaveLength(1);
  });
  it('ENIG gold: ¥100/m² a µ" above 1 µ", only on an ENIG board; a tight impedance tolerance is listed', () => {
    expect(fabOptionsCost({ enigGoldUin: 3 }, ctx).total).toBeCloseTo(2 * 100 * 0.001, 10);
    expect(fabOptionsCost({ enigGoldUin: 2 }, { ...ctx, finish: 'osp' }).total).toBe(0);
    expect(fabOptionsCost({ impedanceTolPct: 5 }, ctx).notCosted[0]).toMatch(/±5 %/);
  });
  it('every adder carries its source and URL on the basis line', () => {
    const r = fabOptionsCost({ thicknessMm: 2.0, laminate: 'tg150', viaFill: 'resin', enigGoldUin: 2 }, ctx);
    expect(r.lines).toHaveLength(4);
    for (const l of r.lines) { expect(l.source).toMatch(/https?:\/\//); expect(l.formula).toMatch(/= .*£[0-9.]+$/); }
    expect(E.viaInPad.quote).toMatch(/500元/);
  });
});

describe('G-17 in the country costing', () => {
  it('the options are a separate fab line and add to the bare board', () => {
    const a = computePCBCountryCost(base, 'cn'), b = computePCBCountryCost({ ...base, fabOptions: { thicknessMm: 3.2, enigGoldUin: 2 } }, 'cn');
    expect(b.breakdown.pcbOptions).toBeGreaterThan(0);
    expect(b.pcbFabPerBoard).toBeCloseTo(a.pcbFabPerBoard + b.breakdown.pcbOptions!, 1);
    expect(b.basis!.some(l => l.item === 'Bare board — thickness 3.2 mm')).toBe(true);
    expect(computePCBCountryCost({ ...base, fabOptions: { impedanceTolPct: 5 } }, 'cn').fabOptionNotes!.notCosted).toHaveLength(1);
  });
  it('inner copper feeds the per-layer copper rule (outer layers keep the outer weight)', () => {
    expect(copperLayersFromSpec({ estimatedLayers: 6, innerCopperOz: 2 })).toEqual([1, 2, 2, 2, 2, 1]);
    expect(copperLayersFromSpec({ estimatedLayers: 6, copperWeightOz: 2, innerCopperOz: 1 })).toEqual([2, 1, 1, 1, 1, 2]);
    expect(copperLayersFromSpec({ estimatedLayers: 2, innerCopperOz: 2 })).toBeUndefined();   // no inner layers
  });
  it('an automotive board on the table basis drops the generic laminate premium when the engineer sets the laminate', () => {
    const spec = { estimatedLayers: 4, widthMm: 100, heightMm: 80 };
    const a = computeAutomotiveFabAdjustment(spec, 10, 'automotive_adas', 2, 'gb');
    const b = computeAutomotiveFabAdjustment({ ...spec, laminateTg: '170' }, 10, 'automotive_adas', 2, 'gb');
    expect(a.automotiveLaminatePremiumGBP).toBeGreaterThan(0);
    expect(b.automotiveLaminatePremiumGBP).toBe(0);
  });
});

describe('G-07: through-hole method, staking, potting', () => {
  it('selective = (joints × 0.706 s + 20 s pallet) on a station + pallets over the programme; hand = 3.5 s a joint × operator', () => {
    const sel = thtMethodCost('selective', 84, 4, 50_000)!;
    expect(sel.gbp).toBeCloseTo((84 * 59.3 / 84 + 20) / 3600 * 2 * 4 + 3 * (600 / 1.27) / 50_000, 10);
    const hand = thtMethodCost('hand', 10, 4, 50_000)!;
    expect(hand.gbp).toBeCloseTo(10 * 3.5 / 3600 * 4, 10);
    expect(thtMethodCost('table', 10, 4, 50_000)).toBeNull();
    expect(thtMethodCost(undefined, 10, 4, 50_000)).toBeNull();
  });
  it('the method replaces the table rate on the through-hole line', () => {
    const t = computePCBCountryCost(base, 'cn'), s = computePCBCountryCost({ ...base, operations: { thtMethod: 'selective' } }, 'cn');
    expect(t.basis!.some(l => l.item === 'Through-hole and hand-soldered joints')).toBe(true);
    expect(s.basis!.some(l => l.item === 'Through-hole joints — selective solder')).toBe(true);
    expect(s.basis!.some(l => l.item === 'Through-hole and hand-soldered joints')).toBe(false);
  });
  it('staking: dots × (3 s operator + 0.05 g DOWSIL 3145); potting: g × SYLGARD 170 £/kg + 30 s station', () => {
    const lines = operationsCost({ stakingDots: 10, pottingGrams: 50 }, 4, 50_000, 1000, 50, 0);
    const st = lines.find(l => l.item === 'Staking (silicone)')!, po = lines.find(l => l.item === 'Potting')!;
    expect(st.gbp).toBeCloseTo(10 * 3 / 3600 * 4 + 10 * 0.05 / 1000 * OPS.stakeAdhesiveGBPPerKg.value, 10);
    expect(po.gbp).toBeCloseTo(50 / 1000 * 2456.87 / 40 + 30 / 3600 * 2 * 4, 10);
    expect(st.source).toMatch(/engineering estimate/); expect(po.source).toMatch(/Silmid/);
  });
});

describe('the PCB form carries the new fields to the analysis', () => {
  it('every new board-spec key has a form field', () => {
    const keys = FAB_FIELDS.map(f => f.key);
    for (const k of ['boardThicknessMm', 'laminateTg', 'innerCopperOz', 'viaFill', 'enigGoldUin', 'impedanceTolPct', 'thtMethod', 'stakingDots', 'pottingGrams']) expect(keys).toContain(k);
  });
  it('Stage 4 on the radar board: the options and operations reach the headline and the operations as costed', async () => {
    const R = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
    const run = async (patch: Record<string, unknown>) => {
      const a = JSON.parse(JSON.stringify(R.analysis)); a.boardSpec = { ...a.boardSpec, ...patch };
      const s4 = await runStage4({ analysis: a, domain: R.stage1?.domain ?? 'general', asilLevel: R.asil?.asilLevel ?? 'Unknown',
        ocrResult: { ...R.ocr, refDesGroups: [], connectors: [], boardText: [] } as never, country: 'gb', orderQty: 1000, tag: '/t' });
      return { s4, a };
    };
    const b0 = await run({}), b1 = await run({ boardThicknessMm: 2.4, thtMethod: 'selective', stakingDots: 12, pottingGrams: 40 });
    expect(b1.s4.selectedCountryBreakdown!.totalPerBoard).toBeGreaterThan(b0.s4.selectedCountryBreakdown!.totalPerBoard);
    expect(b1.s4.selectedCountryBreakdown!.breakdown.pcbOptions).toBeGreaterThan(0);
    expect(b1.a.operationsCosted).toMatchObject({ thtMethod: 'selective', stakingDots: 12, pottingGrams: 40 });
  }, 60_000);
  it('on the China automotive market price the laminate is inside the price, and the notes say so; a tight tolerance warns', async () => {
    const R = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
    const a = JSON.parse(JSON.stringify(R.analysis)); a.boardSpec = { ...a.boardSpec, laminateTg: '170', impedanceTolPct: 5 };
    const s4 = await runStage4({ analysis: a, domain: R.stage1?.domain ?? 'general', asilLevel: R.asil?.asilLevel ?? 'Unknown',
      ocrResult: { ...R.ocr, refDesGroups: [], connectors: [], boardText: [] } as never, country: 'cn', orderQty: 250_000, tag: '/t' });
    const bd = s4.selectedCountryBreakdown!;
    expect(bd.fabOptionNotes!.included.join(' ')).toMatch(/Tg170: inside the automotive market price/);
    expect(bd.fabOptionNotes!.notCosted.join(' ')).toMatch(/±5 %/);
    expect(s4.sanityWarnings.some(w => w.code === 'FAB_OPTION_NOT_COSTED')).toBe(true);
  }, 60_000);
});

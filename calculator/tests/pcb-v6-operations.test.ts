/**
 * EDU v6 (audit package B) — the operations the costing left out: second reflow side, second coated side, coating
 * inspection / masking, press-fit, programming, functional + HV test; and the full-economic figure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OPS, operationsCost, operationsFromBom, programmingSecFor } from '../server/data/pcb-operations.js';
import { computePCBCountryCost, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { runStage4 } from '../server/routes/pcb.js';

describe('figures say what they are', () => {
  it('every figure is sourced or an engineering estimate, with its basis', () => {
    for (const [k, f] of Object.entries(OPS)) { expect(['sourced', 'engineering'], k).toContain(f.kind); expect(f.basis.length, k).toBeGreaterThan(15); }
    expect(OPS.pressFitSecPerConnector.kind).toBe('sourced');
    expect(OPS.functionalTestSec.kind).toBe('engineering');
  });
});

describe('what the BOM says', () => {
  it('press-fit connectors and pins, MCU flash, HV parts', () => {
    const b = operationsFromBom([
      { componentType: 'connector', description: 'Motor connector 20-way, press-fit', qty: 2 },
      { componentType: 'mechanical', description: 'Single press-fit / solder pin', qty: 7 },
      { componentType: 'ic_bga', description: 'AURIX TC387 MCU', catalogueDesc: 'AURIX TC3 quad-core TriCore 300 MHz, 10 MB flash', qty: 2 },
      { componentType: 'ic_soic', description: 'Isolated amplifier / HV-bus voltage sense', qty: 2 },
    ]);
    expect(b).toMatchObject({ pressFitConnectors: 2, pressFitPins: 7, pressFitLines: 1, mcuFlashMB: [10, 10], hv: true });
    expect(programmingSecFor(b.mcuFlashMB)).toBe(2 * 10 * 2 + OPS.programmingHandlingSec.value);
    expect(programmingSecFor([])).toBe(0);
  });
});

describe('the arithmetic', () => {
  it('station seconds × 2 × labour + one-offs ÷ programme boards', () => {
    const lines = operationsCost({ reflowSides: 2, coatSides: 2, pressFitConnectors: 3, pressFitPins: 9, pressFitLines: 2, programmingSec: 50, functionalTestSec: 60, hvTest: true }, 4, 60_000, 1000, 19, 2.24);
    const by = (k: RegExp) => lines.find(l => k.test(l.item))!.gbp;
    const st = (s: number) => s / 3600 * 2 * 4;
    expect(by(/Second reflow/)).toBeCloseTo(19 / 1000 + OPS.stencilGBPPerSide.value / 60_000, 8);
    expect(by(/coating/)).toBeCloseTo(2.24 + st(2 * 25) + st(3 * 10), 8);
    expect(by(/Press-fit/)).toBeCloseTo(st(3 * 4 + 9 * 0.5) + 2 * 1500 / 60_000, 8);
    expect(by(/Programming/)).toBeCloseTo(st(50) + OPS.programmerGBP.value / 60_000, 8);
    expect(by(/Functional/)).toBeCloseTo(st(66) + (8000 + OPS.hipotTesterGBP.value) / 60_000, 8);
  });
  it('nothing is charged without an operation; the country cost carries them in assembly and on its basis', () => {
    expect(operationsCost({}, 4, 1000, 1000, 19, 1)).toEqual([]);
    const base: PCBCostInput = { widthMm: 100, heightMm: 80, layers: 4, surfaceFinish: 'enig', throughVias: 0, blindVias: 0, microVias: 0, hdiStructure: 'none',
      impedanceControlled: false, smtPlacements: 300, throughHoleJoints: 0, manualJoints: 0, bgaCount: 0, aoiRequired: true, ictTimeSec: 0,
      conformalCoatAreaCm2: 0, totalBOMCostGBP: 20, orderQuantity: 10_000 };
    const a = computePCBCountryCost(base, 'cn'), b = computePCBCountryCost({ ...base, operations: { programmingSec: 40, functionalTestSec: 60 } }, 'cn');
    expect(b.breakdown.operations).toBeGreaterThan(0);
    expect(b.assemblyPerBoard - a.assemblyPerBoard).toBeCloseTo(b.breakdown.operations!, 1);
    expect(b.basis!.some(l => l.item === 'Programming (MCU flash)')).toBe(true);
  });
});

describe('on the EDU board', () => {
  const src = JSON.parse(readFileSync('tests/fixtures/pcb-boards/edu-ctrl.analysis.json', 'utf8'));
  const run = (mut?: (a: Record<string, unknown>) => void) => {
    const a = JSON.parse(JSON.stringify(src.analysis)); mut?.(a);
    return runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
      ocrResult: { icMarkings: src.ocrMarkings, refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10_000, tag: '/t' })
      .then(s4 => ({ s4, a }));
  };
  it('reads the operations off the board, keeps them on the analysis, and a typed figure wins', async () => {
    const { s4, a } = await run();
    const ops = a.operationsCosted as Record<string, unknown>;
    expect(ops).toMatchObject({ reflowSides: 2, coatSides: 2, functionalTestSec: 60, hvTest: true });
    expect(Number(ops.programmingSec)).toBeGreaterThan(OPS.programmingHandlingSec.value);
    expect(s4.selectedCountryBreakdown!.breakdown.operations).toBeGreaterThan(0);
    const typed = await run(x => { (x.boardSpec as Record<string, unknown>).functionalTestSec = 0; (x.boardSpec as Record<string, unknown>).programmingSec = ''; });
    expect((typed.a.operationsCosted as Record<string, unknown>).functionalTestSec).toBe(0);
    expect((typed.a.operationsCosted as Record<string, unknown>).programmingSec).toBe(ops.programmingSec);   // blank = the tool's figure
  }, 60_000);
  it('full-economic = delivered + the programme NRE over annual × years', async () => {
    const { s4 } = await run();
    const bd = s4.selectedCountryBreakdown!;
    expect(bd.fullEconomicPerBoard).toBeCloseTo(bd.totalPerBoard + s4.automotiveNRE!.totalNRE / 60_000, 2);
  }, 60_000);
});

import { marketAspClass, marketLocalPerGbp } from '../server/data/pcb-market-evidence.js';
describe('bare-board market prices beyond China (EDU v6)', () => {
  it('Thailand (KCE, 2026 — rises inside) and Japan (METI 2025) by layer class, in their own currency', () => {
    expect(marketAspClass('th', 4)!.cls.aspLocalPerM2).toBe(133.7);
    expect(marketAspClass('th', 8)!.cls).toMatchObject({ aspLocalPerM2: 181.9, anchorLayers: 6 });
    expect(marketAspClass('th', 4)!.ev.rise.used).toBe(0);
    expect(marketAspClass('jp', 6)!.cls.aspLocalPerM2).toBe(110711);
    expect(marketAspClass('tw', 6)).toBeNull();   // no country-only source: the table + premium
    expect(marketLocalPerGbp('CNY')).toBe(8.88);
    expect(marketLocalPerGbp('USD')).toBeCloseTo(1 / 0.7553, 6);
  });
});

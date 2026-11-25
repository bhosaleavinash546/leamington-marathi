/**
 * The EDU control board audit (25 Nov 2026) — packages A and C, one test per gap, on this board's own lines and figures.
 * Review: scripts/edu-ctrl-2026-11-25/audit-review/; doc: docs/pcb/edu-audit-fixes-2026-11-25.md.
 */
import { describe, it, expect } from 'vitest';
import { isNotFitted, packagePins, packagePinsConflict } from '../server/utils/pcb-price-catalogue.js';
import { classRange, tableTypeOf, classDefaultPrice, EVIDENCE_ROWS } from '../server/utils/pcb-class-pricing.js';
import { bestPanelFit, computePCBCountryCost, VIA_HOLES_INCLUDED_PER_DM2, CNY_PER_GBP_2026_09, PCB_COUNTRY_RATES, ICT_FIXTURE_GBP, type PCBCostInput } from '../server/data/pcb-country-rates.js';
import { computeAutomotiveFabAdjustment, applyAutomotiveGrade } from '../server/routes/pcb.js';
import { PCB_FAB_MARKET } from '../server/data/pcb-market-evidence.js';

const EDU: PCBCostInput = {
  widthMm: 395, heightMm: 215, layers: 6, surfaceFinish: 'enig', throughVias: 4500, blindVias: 0, microVias: 0, hdiStructure: 'none',
  impedanceControlled: true, smtPlacements: 2008, throughHoleJoints: 43, manualJoints: 0, bgaCount: 2, aoiRequired: true, ictTimeSec: 90,
  conformalCoatAreaCm2: 849.25, totalBOMCostGBP: 120, orderQuantity: 10_000,
};
const SPEC = { estimatedLayers: 6, widthMm: 395, heightMm: 215 };

describe('G-01 — fitted test points are priced; bare pads stay free', () => {
  it('50 SMD test loops are a part', () => {
    const tp = { componentType: 'testpoint', description: 'SMD test point (metal loop terminal)', pkg: 'SMD', qty: 50 };
    expect(isNotFitted(tp)).toBe(false);
    const r = classRange(tp, true);
    expect(r.key).toBe('testpoint.any.automotive');
    // EDU v5: the range is the page-read prices — RH-5015 szlcsc reel £0.0322 to Keystone 5015 Digi-Key £0.142 at 5,000.
    expect(r.lo).toBe(0.032); expect(r.hi).toBe(0.142);
    expect(classDefaultPrice(r)).toBeCloseTo(0.032 + 0.11 * 0.25, 5);
  });
  it('test PADS and DNP stay not fitted', () => {
    expect(isNotFitted({ componentType: 'testpoint', description: 'Test pads on the bottom side' })).toBe(true);
    expect(isNotFitted({ componentType: 'connector', description: 'Programming header pads (DNP)' })).toBe(true);
  });
});

describe('G-02 — class collisions found on this board', () => {
  it('a PMIC described beside "test points" is a part', () => {
    expect(isNotFitted({ componentType: 'ic_qfn', description: 'Safety PMIC beside the test points and probe pads', pkg: 'VQFN-48' })).toBe(false);
  });
  it('"CAN common-mode choke" typed inductor is not a shield can', () => {
    expect(tableTypeOf('inductor', 'SMD 4.5x3.2', 'CAN common-mode choke')).not.toBe('mechanical');
  });
  it('an "SMD 6x6" power inductor is a large part, never the 0603 row', () => {
    expect(tableTypeOf('inductor', 'SMD 6x6', 'Shielded power inductor 4.7 uH')).toBe('passive_1206');
    expect(tableTypeOf('inductor', '1812', 'Signal-line filter inductor')).toBe('passive_1206');
  });
  it('a group label starting with R is not a resistor designator', () => {
    const r = classRange({ componentType: 'inductor', description: 'Power inductor for the excitation boost converter', pkg: 'SMD 4x4', refDes: 'Resolver boost inductor pair' }, true);
    expect(r.key).toMatch(/\.ind\./);
  });
  it('current-sense shunts have their own row', () => {
    expect(classRange({ componentType: 'resistor', description: 'Current sense shunt 2 mOhm', pkg: '1206', refDes: 'R5' }, true).key).toBe('passive_1206.shunt.automotive');
  });
});

describe('G-03 — production panels', () => {
  it('395 × 215 mm runs 2-up on 18 × 24 in (457 × 610 mm)', () => {
    const p = bestPanelFit(395, 215);
    expect([p.panelW, p.panelH, p.boardsPerPanel]).toEqual([457, 610, 2]);
    expect(p.utilisation).toBeCloseTo(2 * 395 * 215 / (457 * 610), 6);
  });
});

describe('G-05 — drilling inside the per-area price', () => {
  it('4,500 vias on 8.49 dm² are under the 1,000 holes/dm² allowance: no via adder', () => {
    expect(VIA_HOLES_INCLUDED_PER_DM2).toBe(1000);
    expect(computePCBCountryCost(EDU, 'cn').breakdown.pcbVias).toBe(0);
    const dense = computePCBCountryCost({ ...EDU, throughVias: 10_000 }, 'cn').breakdown.pcbVias;
    expect(dense).toBeCloseTo((10_000 - Math.round(1000 * 8.4925)) / 100 * PCB_COUNTRY_RATES.cn.pcbFab.viaAdderPer100Through, 2);
  });
});

describe('G-08 — lot size and programme life', () => {
  it('one-offs over the programme, set-ups per lot', () => {
    const one = computePCBCountryCost(EDU, 'cn');
    const six = computePCBCountryCost({ ...EDU, programmeYears: 6 }, 'cn');
    expect(six.breakdown.pcbSetup).toBeCloseTo(one.breakdown.pcbSetup / 6, 3);
    const lots = computePCBCountryCost({ ...EDU, lotSize: 1000 }, 'cn');
    const smtDelta = lots.breakdown.smtAssembly - one.breakdown.smtAssembly;
    expect(smtDelta).toBeCloseTo(PCB_COUNTRY_RATES.cn.assembly.batchSetupGBP * (1 / 1000 - 1 / 10_000), 2);
    expect(ICT_FIXTURE_GBP).toBeGreaterThan(0);
  });
});

describe('G-04 — sampling cadence (table basis: a country without market evidence)', () => {
  it('per lot divides the microsection by the lot, not the panel', () => {
    const fab = 20;
    const panel = computeAutomotiveFabAdjustment(SPEC, fab, 'automotive_adas', 2, 'vn', { orderQty: 10_000 });
    const lot = computeAutomotiveFabAdjustment({ ...SPEC, samplingCadence: 'lot', lotSize: 1000 }, fab, 'automotive_adas', 2, 'vn', { orderQty: 10_000 });
    expect(panel.basis).toBe('table');
    expect(lot.ipcClass3InspectionGBP).toBeCloseTo(panel.ipcClass3InspectionGBP * 2 / 1000, 2);
    expect(lot.sampling).toBe('lot');
  });
});

describe('G-06 — a China automotive board at the market price per m²', () => {
  it('the ASP arithmetic, by hand', () => {
    const ev = PCB_FAB_MARKET.cn, c = ev.classes[0], r = PCB_COUNTRY_RATES.cn.pcbFab;
    const shape = (r.baseCostPerDm2_2L + r.layerAdderPerDm2 * 4) / (r.baseCostPerDm2_2L + r.layerAdderPerDm2 * 3);
    const core = 0.084925 * (c.aspLocalPerM2 * (1 + ev.rise.used) * shape + ev.class3ExtrasPerM2.value) / CNY_PER_GBP_2026_09;
    const f = computeAutomotiveFabAdjustment(SPEC, 9, 'automotive_adas', 2, 'cn', { extras: { pcbSetup: 0.002 } });
    expect(f.basis).toBe('market');
    expect(f.marketCoreGBP).toBeCloseTo(core, 2);
    expect(f.totalAutomotiveFabGBP).toBeCloseTo(core + 0.002, 2);
    expect(f.iatfFabPremiumGBP + f.automotiveLaminatePremiumGBP + f.ipcClass3InspectionGBP + f.couponTestingGBP).toBe(0);
    expect(f.totalAutomotiveFabGBP).toBeGreaterThan(10); expect(f.totalAutomotiveFabGBP).toBeLessThan(17);   // audit range £12–16 (£12–22 working)
  });
  it('the graded headline carries it, with its formula', () => {
    const bd = computePCBCountryCost({ ...EDU, programmeYears: 6 }, 'cn');
    applyAutomotiveGrade(bd, SPEC, {}, 'Unknown' as never, 10_000, 'automotive_adas');
    const line = bd.basis!.find(b => b.item === 'Automotive fab grade')!;
    expect(line.formula).toMatch(/automotive ASP 2024/);
    expect(bd.pcbFabPerBoard).toBeLessThan(17);
  });
});

describe('G-12 — class rows from the catalogue', () => {
  it('a CAN transceiver SOIC at the catalogue p10–p90', () => {
    const r = classRange({ componentType: 'ic_soic', description: 'CAN FD transceiver', pkg: 'SOIC-8' }, true);
    expect([r.lo, r.hi]).toEqual([EVIDENCE_ROWS['ic_soic.can.automotive'].lo, EVIDENCE_ROWS['ic_soic.can.automotive'].hi]);
    expect(classDefaultPrice(r)).toBeLessThan(0.7);   // was £1.13 against a 55-part catalogue median of £0.50
  });
  it('every evidence row has ≥ 10 parts from ≥ 2 distributors, and none is a plain resistor or the imager', () => {
    for (const [k, v] of Object.entries(EVIDENCE_ROWS)) {
      expect(v.n, k).toBeGreaterThanOrEqual(10); expect(v.distributors, k).toBeGreaterThanOrEqual(2);
      expect(k).not.toMatch(/^passive_\d+\.res\.|\.imager\./);
      expect(v.lo).toBeLessThan(v.hi);
    }
  });
});

describe('G-14 — a family price in another package is not used', () => {
  it('pin counts', () => {
    expect(packagePins('VQFN-HR 12')).toBe(12); expect(packagePins('QFN-16')).toBe(16); expect(packagePins('SOIC (DW) 16')).toBe(16);
    expect(packagePinsConflict('QFN-16', 'VQFN-HR 12')).toBe(true);
    expect(packagePinsConflict('TSSOP-20', 'SOIC-16')).toBe(true);
    expect(packagePinsConflict('SOIC-8 wide', 'SOIC-8')).toBe(false);
    expect(packagePinsConflict('SMD', 'QFN-16')).toBe(false);
  });
});

describe('G-19 — the FX behind catalogue prices is printed', () => {
  it('on the Components basis line', () => {
    const c = computePCBCountryCost(EDU, 'cn').basis!.find(b => b.item === 'Components')!;
    expect(c.source).toMatch(/FX snapshot of 29 Sep 2026 \(US\$1 = £0\.7553/);
  });
});

describe('G-02 — logic before the package row', () => {
  it('a single-gate buffer in SC-70 is a logic IC; a gate driver is not', () => {
    expect(classRange({ componentType: 'ic_soic', description: 'Single-gate logic / buffer', pkg: 'SC-70-5' }, true).key).toBe('ic_soic.logic.automotive');
    expect(classRange({ componentType: 'ic_soic', description: 'Gate driver', pkg: 'SOIC-8' }, true).key).not.toBe('ic_soic.logic.automotive');
  });
});

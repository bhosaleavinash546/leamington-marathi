/**
 * Four defects found while re-costing a real Bosch IPB2.0 ECU PCBA from board
 * photographs. Each `it` pins the corrected behaviour so it cannot regress.
 *
 *   1. `smtSides: 2` multiplied every placement by two — a component is placed
 *      once, and the BOM already counts it once.
 *   2. BGA X-ray had no model other than 100% offline inspection, which at
 *      150,000 boards/yr implies three dedicated machines.
 *   3. The PCB forms inherited the mechanical-part packaging/logistics defaults.
 *   4. The material-dominance insight gave casting and forging advice on a PCB.
 */
import { describe, it, expect } from 'vitest';
import {
  computePCBADrivers,
  SECOND_SIDE_PASS_OVERHEAD_SEC,
  INLINE_AXI_CYCLE_TIME_SEC,
  estimatePCBAPackagingPerPart,
  estimatePCBALogisticsPerPart,
  estimatePCBFabPackagingPerPart,
  estimatePCBFabLogisticsPerPart,
  CPH_BY_TYPE,
} from '../src/engine/modules/pcba.js';
import type { PCBAInputs } from '../src/engine/modules/pcba.js';
import { generateInsights } from '../src/engine/insights.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

// A board dense enough that placement time dominates — the case where the
// doubling bug did the most damage.
const DENSE: PCBAInputs = {
  pcbCostPerBoard: 22.31,
  bom: [
    { refDes: 'R/C-SML', componentType: 'passive_0402', description: 'Passives', qty: 620, unitPriceGBP: 0.009, moq: 1000 },
    { refDes: 'D/Q-SML', componentType: 'ic_qfn', description: 'Small semis', qty: 90, unitPriceGBP: 0.09, moq: 100 },
    { refDes: 'U-BGA', componentType: 'ic_bga', description: 'BGA', qty: 3, unitPriceGBP: 8.0, moq: 10 },
  ],
  smtMachineId: 'smt-high-speed-line',
  smtLabourId: 'lab-uk-semiskilled',
  smtLines: 1,
  smtLineRatePerHr: 0,
  smtOee: 0.82,
  throughHoleCount: 8,
  manualSolderCount: 0,
  thLabourId: 'lab-uk-semiskilled',
  thLabourTimeSecPerJoint: 12,
  manualLabourTimeSecPerJoint: 20,
  assemblyYield: 0.985,
  reworkCostPerFailure: 12,
  amortizationVolume: 150_000,
  assemblyComplexity: 'high',
  qualityGrade: 'auto_grade1',
};

const placementHrOf = (i: PCBAInputs) =>
  computePCBADrivers(i).operations.find(o => o.operationName.startsWith('SMT'))!.cycleTimeHr;

// ─── Defect 1 — smtSides double-counted every placement ──────────────────────

describe('smtSides adds a line pass, not a second set of placements', () => {
  it('does not double placement time on a double-sided board', () => {
    const single = placementHrOf({ ...DENSE, smtSides: 1 });
    const double = placementHrOf({ ...DENSE, smtSides: 2 });
    // The old bug made this exactly 2. Anything near it is the bug returning.
    expect(double / single).toBeLessThan(1.15);
  });

  it('charges exactly the second-pass overhead, and nothing more', () => {
    const single = placementHrOf({ ...DENSE, smtSides: 1 });
    const double = placementHrOf({ ...DENSE, smtSides: 2 });
    expect(double - single).toBeCloseTo(SECOND_SIDE_PASS_OVERHEAD_SEC / 3600, 10);
  });

  it('still costs more than single-sided (the property the old test pinned)', () => {
    expect(placementHrOf({ ...DENSE, smtSides: 2 }))
      .toBeGreaterThan(placementHrOf({ ...DENSE, smtSides: 1 }));
  });

  it('splits the second pass across parallel lines, as placement time is', () => {
    const oneLine = placementHrOf({ ...DENSE, smtSides: 2, smtLines: 1 })
      - placementHrOf({ ...DENSE, smtSides: 1, smtLines: 1 });
    const twoLines = placementHrOf({ ...DENSE, smtSides: 2, smtLines: 2 })
      - placementHrOf({ ...DENSE, smtSides: 1, smtLines: 2 });
    expect(twoLines).toBeCloseTo(oneLine / 2, 10);
  });

  it('placement time still reconciles to the BOM, one placement per component', () => {
    const expected = DENSE.bom.reduce(
      (acc, l) => acc + (CPH_BY_TYPE[l.componentType] > 0 ? l.qty / CPH_BY_TYPE[l.componentType] : 0), 0,
    ) * 1.7;   // 'high' complexity multiplier
    expect(placementHrOf({ ...DENSE, smtSides: 1 })).toBeCloseTo(expected, 10);
  });
});

// ─── Defect 2 — X-ray had only a 100%-offline model ──────────────────────────

describe('BGA X-ray inspection mode', () => {
  const withXray = (mode?: PCBAInputs['xrayMode'], extra: Partial<PCBAInputs> = {}) =>
    computePCBADrivers({
      ...DENSE, bgaCount: 3, xrayMachineId: 'xray-bga-inspection', xrayMode: mode, ...extra,
    }).operations.find(o => o.operationName.startsWith('BGA X-Ray'))!;

  it('defaults to 100% offline — existing estimates do not silently move', () => {
    expect(withXray().cycleTimeHr).toBeCloseTo(withXray('offline_100pct').cycleTimeHr, 12);
    // 2 min base + 0.8 min × 3 BGAs = 4.4 min, × 1.8 auto_grade1 = 7.92 min
    expect(withXray().cycleTimeHr * 60).toBeCloseTo(7.92, 6);
  });

  it('names the mode in the operation, so the report cannot hide the assumption', () => {
    expect(withXray('offline_100pct').operationName).toContain('100% offline');
    expect(withXray('inline_axi').operationName).toContain('inline AXI');
    expect(withXray('sample', { xraySampleRate: 0.05 }).operationName).toContain('5% sample');
  });

  it('inline AXI runs at line takt, independent of BGA count', () => {
    const three = withXray('inline_axi').cycleTimeHr;
    const twelve = computePCBADrivers({
      ...DENSE, bgaCount: 12, xrayMachineId: 'xray-bga-inspection', xrayMode: 'inline_axi',
    }).operations.find(o => o.operationName.startsWith('BGA X-Ray'))!.cycleTimeHr;
    expect(twelve).toBeCloseTo(three, 12);
    expect(three).toBeCloseTo((INLINE_AXI_CYCLE_TIME_SEC / 3600) * 1.8, 12);
  });

  it('inline AXI is much cheaper than 100% offline on a 3-BGA board', () => {
    expect(withXray('inline_axi').cycleTimeHr).toBeLessThan(withXray('offline_100pct').cycleTimeHr * 0.25);
  });

  it('sample mode scales the offline time by the sample rate', () => {
    expect(withXray('sample', { xraySampleRate: 0.25 }).cycleTimeHr)
      .toBeCloseTo(withXray('offline_100pct').cycleTimeHr * 0.25, 12);
  });

  it('clamps a nonsense sample rate instead of producing a negative cycle', () => {
    expect(withXray('sample', { xraySampleRate: -1 }).cycleTimeHr).toBe(0);
    expect(withXray('sample', { xraySampleRate: 9 }).cycleTimeHr)
      .toBeCloseTo(withXray('offline_100pct').cycleTimeHr, 12);
  });
});

// ─── Defect 3 — packaging and logistics ──────────────────────────────────────

describe('PCB packaging and logistics estimators', () => {
  const AREA = 187;   // 170 × 110 mm ECU

  it('charges a populated board more than the generic £0.15 mechanical default', () => {
    expect(estimatePCBAPackagingPerPart(AREA, 'auto_grade1')).toBeGreaterThan(0.15);
  });

  it('charges a bare board less than a populated one — no tray, no MBB per board', () => {
    expect(estimatePCBFabPackagingPerPart(AREA)).toBeLessThan(estimatePCBAPackagingPerPart(AREA));
    expect(estimatePCBFabLogisticsPerPart(AREA)).toBeLessThan(estimatePCBALogisticsPerPart(AREA));
  });

  it('scales with board footprint', () => {
    expect(estimatePCBAPackagingPerPart(400)).toBeGreaterThan(estimatePCBAPackagingPerPart(50));
    expect(estimatePCBALogisticsPerPart(400)).toBeGreaterThan(estimatePCBALogisticsPerPart(50));
  });

  it('scales with quality grade — aerospace trays cost more than consumer', () => {
    expect(estimatePCBAPackagingPerPart(AREA, 'aerospace'))
      .toBeGreaterThan(estimatePCBAPackagingPerPart(AREA, 'consumer'));
  });

  it('stays inside sane bounds for absurd or negative inputs', () => {
    for (const f of [estimatePCBAPackagingPerPart, estimatePCBALogisticsPerPart,
      estimatePCBFabPackagingPerPart, estimatePCBFabLogisticsPerPart]) {
      expect(f(-500)).toBeGreaterThan(0);
      expect(f(1e9)).toBeLessThanOrEqual(4);
      expect(Number.isFinite(f(0))).toBe(true);
    }
  });
});

// ─── Defect 4 — wrong-commodity optimisation advice ──────────────────────────

describe('material-dominance advice is gated to the commodity', () => {
  const stackFor = (directCost: number): UniversalStackInput => ({
    partName: 'Board',
    rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost },
    operations: [{
      operationName: 'SMT Placement & Reflow', machineId: 'smt-high-speed-line',
      labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.08, partsPerCycle: 1,
      oee: 0.82, manning: 1, labourTimeHr: 0.08, labourEfficiency: 1,
    }],
    tooling: { totalToolingCost: 46_000, amortizationVolume: 150_000, mode: 'amortized' },
    packagingPerPart: 0.35, logisticsPerPart: 0.55, overheadPct: 0.09, marginPct: 0.08,
  });

  const actionsFor = (commodity: Parameters<typeof generateInsights>[3]) => {
    const input = stackFor(134.23);
    const result = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
    const insight = generateInsights(result, input, DEFAULT_RATE_LIBRARY, commodity)
      .find(i => i.title === 'Material is the dominant cost driver');
    expect(insight, `expected material dominance to fire for ${commodity}`).toBeDefined();
    return insight!.actions.join(' | ');
  };

  it('never offers casting or forging routes on a PCBA', () => {
    const actions = actionsFor('pcba');
    expect(actions).not.toMatch(/lost foam|closed-die|HPDC|near-net|alloy|swarf|billet|nesting/i);
  });

  it('offers PCBA-relevant levers instead', () => {
    expect(actionsFor('pcba')).toMatch(/BOM|second-source|AEC-Q|layer count/i);
  });

  it('never offers a material-utilisation lever where material is a pass-through', () => {
    // utilisation is 1 by construction on these — quoting "+5% utilisation" is noise.
    for (const c of ['pcba', 'pcb_fab', 'wiring_harness', 'painting', 'biw_assembly'] as const) {
      expect(actionsFor(c), c).not.toMatch(/utilisation at/i);
    }
  });

  it('still gives metal-forming advice where it belongs', () => {
    expect(actionsFor('machining')).toMatch(/near-net-shape|billet|swarf/i);
    expect(actionsFor('casting')).toMatch(/gating|riser|yield/i);
    expect(actionsFor('sheet_metal')).toMatch(/nest/i);
    expect(actionsFor('injection_moulding')).toMatch(/wall thickness|regrind|resin/i);
  });

  it('every commodity gets at least three actions, and none are empty', () => {
    for (const c of ['pcba', 'pcb_fab', 'machining', 'casting', 'forging', 'sheet_metal',
      'injection_moulding', 'composites', 'rubber', 'wiring_harness', 'painting',
      'biw_assembly', 'cast_and_machine'] as const) {
      const input = stackFor(134.23);
      const result = computeUniversalStack(input, DEFAULT_RATE_LIBRARY);
      const insight = generateInsights(result, input, DEFAULT_RATE_LIBRARY, c)
        .find(i => i.title === 'Material is the dominant cost driver');
      expect(insight!.actions.length, c).toBeGreaterThanOrEqual(3);
      expect(insight!.actions.every(a => a.trim().length > 0), c).toBe(true);
    }
  });
});

/**
 * Gear routing and costing — the behaviours a cost engineer would challenge.
 *
 * These are not "does it return a number" tests. Each one pins a claim the
 * manufacturing plant head would push back on, and the whole point of the
 * commodity is that the tool answers the way a gear engineer would:
 *
 *   - A tight quality class ADDS operations. It is not a multiplier.
 *   - An internal gear cannot be hobbed. Geometry decides, not difficulty.
 *   - A gear beyond the machine envelope is refused, not costed on the biggest
 *     machine with an extrapolated feed.
 *   - An estimate resting on representative data says so, every time.
 */
import { describe, it, expect } from 'vitest';
import {
  analyseGear, computeGearDrivers, toolCostPerPart, gearOuterDiameterMm,
  type GearInputs,
} from '../src/engine/modules/gear.js';
import { adviseGearRoute, GEAR_PROCESS_REFERENCE } from '../src/engine/modules/gear-advisor.js';
import { pickGearMachineId } from '../src/engine/machine-sizing.js';
import { gearDataWarning, activeGearShopData, resolveCutting } from '../src/engine/gear-shop-data.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

/** A real-shaped automotive transmission gear: helical, case-hardened, ground. */
const transmissionGear = (over: Partial<GearInputs> = {}): GearInputs => ({
  normalModuleMm: 2.5, teeth: 38, helixAngleDeg: 25, faceWidthMm: 22,
  internal: false, qualityClass: 6, materialClass: 'case_hardening_steel',
  caseHardened: true, blankCostPerPart: 3.20, netWeightKg: 0.65,
  materialId: 'mat-steel-20mncr5',
  annualVolume: 200_000, amortizationVolume: 200_000, batchSize: 500,
  setupTimeHrPerOperation: 1.5,
  ...over,
});

describe('quality class adds operations rather than scaling a number', () => {
  it('an as-cut class gets no finishing operation', () => {
    // Class 8 is inside what hobbing holds, so nothing is added.
    const a = analyseGear(transmissionGear({ qualityClass: 8, caseHardened: false }));
    const processes = a.operations.map(o => o.process);
    expect(processes).toContain('hobbing');
    expect(processes).not.toContain('grinding');
    expect(processes).not.toContain('shaving');
  });

  it('a tight class on a hardened gear ADDS heat treat and grinding', () => {
    const loose = analyseGear(transmissionGear({ qualityClass: 8, caseHardened: true }));
    const tight = analyseGear(transmissionGear({ qualityClass: 5, caseHardened: true }));

    expect(tight.operations.map(o => o.process)).toContain('grinding');
    expect(loose.operations.map(o => o.process)).not.toContain('grinding');
    // The route is LONGER, not merely dearer — that is the whole claim.
    expect(tight.operations.length).toBeGreaterThan(loose.operations.length);
  });

  it('grinding comes AFTER hardening, because hardening distorts', () => {
    const a = analyseGear(transmissionGear({ qualityClass: 5, caseHardened: true }));
    const order = a.route.steps.map(s => s.process);
    expect(order.indexOf('case_hardening')).toBeGreaterThan(-1);
    expect(order.indexOf('grinding')).toBeGreaterThan(order.indexOf('case_hardening'));
  });

  it('an unhardened gear gets the cheap soft finish, not grinding', () => {
    const a = analyseGear(transmissionGear({ qualityClass: 6, caseHardened: false }));
    const processes = a.operations.map(o => o.process);
    expect(processes).toContain('shaving');
    expect(processes).not.toContain('grinding');
  });

  it('every added step says WHY it was added', () => {
    const a = analyseGear(transmissionGear({ qualityClass: 5 }));
    for (const s of a.route.steps) {
      expect(s.reason.length, `${s.process} has no reason`).toBeGreaterThan(20);
    }
    const grind = a.route.steps.find(s => s.process === 'grinding');
    expect(grind?.reason).toMatch(/class 5/);
    expect(grind?.reason).toMatch(/distort/i);
  });

  it('NVH buys a honing pass that geometry alone would not', () => {
    const quiet = analyseGear(transmissionGear({ qualityClass: 5, nvhCritical: true }));
    const plain = analyseGear(transmissionGear({ qualityClass: 5, nvhCritical: false }));
    expect(quiet.operations.map(o => o.process)).toContain('honing');
    expect(plain.operations.map(o => o.process)).not.toContain('honing');
  });
});

describe('geometry decides the cutting process, not preference', () => {
  it('an internal gear is never hobbed — a hob cannot reach into a bore', () => {
    const a = analyseGear(transmissionGear({ internal: true }));
    expect(a.route.cuttingProcess).not.toBe('hobbing');
    expect(['skiving', 'shaping', 'broaching']).toContain(a.route.cuttingProcess);
  });

  it('an internal gear at automotive volume goes to skiving over shaping', () => {
    const a = analyseGear(transmissionGear({ internal: true, annualVolume: 200_000 }));
    expect(a.route.cuttingProcess).toBe('skiving');
    expect(a.route.steps[0].reason).toMatch(/hob cannot reach/i);
  });

  it('an internal gear at very high volume justifies a dedicated broach', () => {
    const a = analyseGear(transmissionGear({ internal: true, annualVolume: 400_000 }));
    expect(a.route.cuttingProcess).toBe('broaching');
  });

  it('an internal gear beyond the skiving envelope falls back to shaping', () => {
    // Skiving tops out at module 8; shaping runs to 12.
    const a = analyseGear(transmissionGear({
      internal: true, normalModuleMm: 10, teeth: 40, annualVolume: 5_000,
      qualityClass: 8, caseHardened: false,
    }));
    expect(a.route.cuttingProcess).toBe('shaping');
  });

  it('a prototype volume drops dedicated tooling for milling', () => {
    const r = adviseGearRoute({
      normalModuleMm: 3, teeth: 40, helixAngleDeg: 0, faceWidthMm: 25,
      internal: false, qualityClass: 9, caseHardened: false, annualVolume: 50,
    });
    expect(r.cuttingProcess).toBe('milling_5ax');
    expect(r.steps[0].reason).toMatch(/amortise/);
  });

  it('external at volume is hobbed', () => {
    const a = analyseGear(transmissionGear());
    expect(a.route.cuttingProcess).toBe('hobbing');
  });
});

describe('the model refuses rather than guesses', () => {
  it('blocks an internal gear no catalogued process can cut', () => {
    const r = adviseGearRoute({
      normalModuleMm: 20, teeth: 40, helixAngleDeg: 0, faceWidthMm: 40,
      internal: true, qualityClass: 8, caseHardened: false, annualVolume: 1000,
    });
    expect(r.blocked).toBeTruthy();
    expect(r.blocked).toMatch(/internal module 20/);
  });

  it('blocks a gear outside every machine envelope instead of using the biggest', () => {
    const pick = pickGearMachineId('hobbing', {
      normalModuleMm: 40, outerDiameterMm: 3000, faceWidthMm: 900,
    });
    expect(pick.blocked).toBeTruthy();
    expect(pick.blocked).toMatch(/largest is/);
  });

  it('blocks a gear outside the shop data module bands rather than extrapolating', () => {
    // Bronze has no cutting band at all in the representative data.
    const a = analyseGear(transmissionGear({ materialClass: 'bronze' }));
    expect(a.blocked).toBeTruthy();
    expect(a.blocked).toMatch(/Extrapolating a feed/);
  });

  it('computeGearDrivers throws on a blocked gear rather than returning a partial cost', () => {
    expect(() => computeGearDrivers(transmissionGear({ materialClass: 'bronze' })))
      .toThrow(/Gear cannot be costed/);
  });

  it('picks the SMALLEST machine that fits, not the first in the list', () => {
    const small = pickGearMachineId('hobbing',
      { normalModuleMm: 2, outerDiameterMm: 120, faceWidthMm: 20 });
    const medium = pickGearMachineId('hobbing',
      { normalModuleMm: 2, outerDiameterMm: 450, faceWidthMm: 20 });
    expect(small.machineId).toBe('gear-hob-small');
    expect(medium.machineId).toBe('gear-hob-medium');
  });

  it('sizes on module even when the diameter would fit a smaller machine', () => {
    // A coarse module on a small diameter still needs the drive of a bigger
    // machine. Sizing on diameter alone is the bug this pins.
    const pick = pickGearMachineId('hobbing',
      { normalModuleMm: 10, outerDiameterMm: 150, faceWidthMm: 40 });
    expect(pick.machineId).toBe('gear-hob-large');
  });
});

describe('honesty about the data', () => {
  it('every estimate on representative data carries the warning', () => {
    const a = analyseGear(transmissionGear());
    expect(a.dataWarning).toBeTruthy();
    expect(a.dataWarning).toMatch(/NOT a quotable number/);
  });

  it('the warning names how many parameters are unverified', () => {
    const w = gearDataWarning(activeGearShopData());
    expect(w).toMatch(/\d+ of \d+ gear shop parameters/);
  });

  it('every process in the reference table cites a source', () => {
    for (const [id, ref] of Object.entries(GEAR_PROCESS_REFERENCE)) {
      expect(ref.source.length, `${id} has no source`).toBeGreaterThan(30);
    }
  });

  it('every cycle carries a printable basis', () => {
    const a = analyseGear(transmissionGear({ qualityClass: 5 }));
    for (const o of a.operations) {
      expect(o.basis.length, `${o.process} has no basis`).toBeGreaterThan(10);
    }
  });
});

describe('tool cost per part uses the whole tool life', () => {
  it('spreads purchase + regrinds over every part the tool will ever cut', () => {
    // £1400 hob + 12 regrinds x £180 = £3560 over 1200 x 13 = 15,600 parts
    const r = toolCostPerPart({
      toolCostGBP: 1400, partsBetweenRegrinds: 1200,
      regrindCostGBP: 180, regrindsBeforeScrap: 12,
    });
    expect(r.perPart).toBeCloseTo(3560 / 15600, 9);
    expect(r.perPart).toBeCloseTo(0.2282, 4);
  });

  it('a tool with no regrinds costs its full price over one life', () => {
    const r = toolCostPerPart({
      toolCostGBP: 1000, partsBetweenRegrinds: 500,
      regrindCostGBP: 0, regrindsBeforeScrap: 0,
    });
    expect(r.perPart).toBeCloseTo(2, 9);
  });

  it('ignoring regrinds would over-state tooling by an order of magnitude', () => {
    // The failure this function exists to prevent, pinned so it cannot come back.
    const naive = 1400 / 1200;
    const real = toolCostPerPart({
      toolCostGBP: 1400, partsBetweenRegrinds: 1200,
      regrindCostGBP: 180, regrindsBeforeScrap: 12,
    }).perPart;
    expect(naive / real).toBeGreaterThan(5);
  });
});

describe('end to end through the universal stack', () => {
  // No `as unknown as` cast: an invented stack shape once made every total NaN
  // and the cast hid it from the compiler. Let TypeScript check the contract.
  const toStack = (g: GearInputs): UniversalStackInput => {
    const d = computeGearDrivers(g);
    return {
      partName: 'test gear',
      rawMaterial: d.rawMaterial,
      operations: d.operations,
      tooling: d.tooling,
      packagingPerPart: 0.10,
      logisticsPerPart: 0.12,
      // Fractions, not percentages — the core multiplies these directly.
      overheadPct: 0.12,
      marginPct: 0.08,
      annualVolume: g.annualVolume,
    };
  };

  it('produces a complete 8-bucket breakdown', () => {
    const r = computeUniversalStack(toStack(transmissionGear()), DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(r.breakdown.process).toBeGreaterThan(0);
    expect(Number.isFinite(r.total)).toBe(true);
  });

  it('a ground gear costs materially more than the same gear as-cut', () => {
    const asCut = computeUniversalStack(
      toStack(transmissionGear({ qualityClass: 8, caseHardened: false })), DEFAULT_RATE_LIBRARY);
    const ground = computeUniversalStack(
      toStack(transmissionGear({ qualityClass: 5, caseHardened: true })), DEFAULT_RATE_LIBRARY);
    expect(ground.total).toBeGreaterThan(asCut.total);
    // Grinding plus heat treat is a step change, not a rounding difference.
    expect(ground.total / asCut.total).toBeGreaterThan(1.2);
  });

  it('a 90-tooth gear costs more to cut than a 30-tooth one on the same blank', () => {
    const few = computeUniversalStack(
      toStack(transmissionGear({ teeth: 30, qualityClass: 8, caseHardened: false })),
      DEFAULT_RATE_LIBRARY);
    const many = computeUniversalStack(
      toStack(transmissionGear({ teeth: 90, qualityClass: 8, caseHardened: false })),
      DEFAULT_RATE_LIBRARY);
    expect(many.breakdown.process).toBeGreaterThan(few.breakdown.process);

    // The 3x kinematic relationship lives in the CUTTING operation. Asserting it
    // on the process bucket would be wrong: deburr, inspection and amortised
    // setup are flat, so they dilute the ratio — and a test that demanded 3x on
    // the total would be pinning an untrue claim.
    const cutFew = analyseGear(transmissionGear({ teeth: 30, qualityClass: 8, caseHardened: false }))
      .operations.find(o => o.process === 'hobbing')!;
    const cutMany = analyseGear(transmissionGear({ teeth: 90, qualityClass: 8, caseHardened: false }))
      .operations.find(o => o.process === 'hobbing')!;
    const cuttingOnly = (o: { cycleSec: number }) => o.cycleSec - 18;   // strip handling
    expect(cuttingOnly(cutMany) / cuttingOnly(cutFew)).toBeCloseTo(3, 6);
  });

  it('heat treat rides in material as a per-part consumable, not as machine time', () => {
    const d = computeGearDrivers(transmissionGear({ qualityClass: 5, caseHardened: true }));
    expect(d.rawMaterial.consumablesCostPerPart).toBeGreaterThan(0);
    expect(d.operations.some(o => /carburise/i.test(o.operationName))).toBe(false);
  });

  it('the blank arrives as directCost, not re-derived from weight', () => {
    const d = computeGearDrivers(transmissionGear({ blankCostPerPart: 3.20 }));
    expect(d.rawMaterial.directCost).toBeCloseTo(3.20, 9);
  });
});

describe('geometry helpers used by machine sizing', () => {
  it('outer diameter is pitch + two addenda, and grows with helix', () => {
    expect(gearOuterDiameterMm({ teeth: 40, normalModuleMm: 3, helixAngleDeg: 0 }))
      .toBeCloseTo(126, 9);
    expect(gearOuterDiameterMm({ teeth: 40, normalModuleMm: 3, helixAngleDeg: 30 }))
      .toBeCloseTo(138.5640646 + 6, 5);
  });

  it('the shop data resolves a band for the automotive default material', () => {
    expect(resolveCutting('case_hardening_steel', 2.5)).not.toBeNull();
    expect(resolveCutting('case_hardening_steel', 30)).toBeNull();
  });
});

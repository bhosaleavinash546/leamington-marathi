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
  validateGearInputs, CANNOT_BE_CARBURISED,
  type GearInputs,
} from '../src/engine/modules/gear.js';
import { adviseGearRoute, GEAR_PROCESS_REFERENCE } from '../src/engine/modules/gear-advisor.js';
import { pickGearMachineId } from '../src/engine/machine-sizing.js';
import { gearDataWarning, activeGearShopData, resolveCutting } from '../src/engine/gear-shop-data.js';
import { computeHeatTreatRate } from '../src/engine/gear-heat-treat-rate.js';
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
    // The loose case is class 9, not 8. Carburising costs TWO ISO classes of
    // distortion (workbook grades oil-quench carburising "High", the worst of
    // the 35 processes it surveys), so hobbing's as-cut class 7 delivers class 9
    // out of the furnace. Class 8 therefore now needs grinding where the earlier
    // 1-class assumption let it ship as-quenched — the boundary moved on
    // evidence, and this test moved with it rather than pinning the old guess.
    const loose = analyseGear(transmissionGear({ qualityClass: 9, caseHardened: true }));
    const tight = analyseGear(transmissionGear({ qualityClass: 5, caseHardened: true }));

    expect(tight.operations.map(o => o.process)).toContain('grinding');
    expect(loose.operations.map(o => o.process)).not.toContain('grinding');
    // The route is LONGER, not merely dearer — that is the whole claim.
    expect(tight.operations.length).toBeGreaterThan(loose.operations.length);
  });

  it('carburising costs two classes, so class 8 no longer ships as-quenched', () => {
    // Pins the change itself, so a future edit that quietly reverts the
    // distortion allowance fails here with the reason attached.
    const c8 = analyseGear(transmissionGear({ qualityClass: 8, caseHardened: true }));
    expect(c8.operations.map(o => o.process)).toContain('grinding');
    // Nitriding costs none, so the SAME class 8 ships straight off the hobber.
    const n8 = analyseGear(transmissionGear({
      qualityClass: 8, caseHardened: false,
      materialClass: 'through_hardening_steel', hardeningRoute: 'nitriding',
    }));
    expect(n8.operations.map(o => o.process)).not.toContain('grinding');
  });

  it('a class EQUAL to the as-cut class still grinds when hardened — distortion eats a class', () => {
    // Hobbing holds class 7 as-cut, but carburising loses at least one class:
    // as-hardened this gear delivers class 8, so a requested class 7 must buy
    // grinding after the furnace. The old rule shipped it as-hobbed with only
    // a warning — a plant head caught the implausibly small process bucket on
    // the live report.
    const hardened = analyseGear(transmissionGear({ qualityClass: 7, caseHardened: true }));
    expect(hardened.operations.map(o => o.process)).toContain('grinding');
    const grind = hardened.route.steps.find(s => s.process === 'grinding');
    expect(grind?.reason).toMatch(/distort/i);
    // Unhardened, the same class 7 is exactly what hobbing holds — no finishing.
    const soft = analyseGear(transmissionGear({ qualityClass: 7, caseHardened: false }));
    expect(soft.operations.map(o => o.process)).not.toContain('grinding');
    expect(soft.operations.map(o => o.process)).not.toContain('shaving');
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
    // Bronze has no cutting band at all in the representative data. (caseHardened
    // must be off: a bronze gear cannot be carburised, and that guard would
    // legitimately refuse it one step earlier — a different, also-correct stop.)
    const a = analyseGear(transmissionGear({ materialClass: 'bronze', caseHardened: false }));
    expect(a.blocked).toBeTruthy();
    expect(a.blocked).toMatch(/Extrapolating a feed/);
  });

  it('computeGearDrivers throws on a blocked gear rather than returning a partial cost', () => {
    expect(() => computeGearDrivers(transmissionGear({ materialClass: 'bronze', caseHardened: false })))
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

/**
 * The furnace pass: which one, and what it costs.
 *
 * A plant head asked how the tool decides the heat-treat process and how it
 * prices it. Tracing it found a real hole: only CARBURISING existed, so a
 * through-hardened 42CrMo4 gear — a completely normal industrial gear — carried
 * £0 of heat treat and no distortion allowance, silently. These pin the fix.
 */
describe('the heat-treat route follows the material, and is priced by weight', () => {
  const kg = 0.65;   // transmissionGear netWeightKg

  it('case-hardening steel carburises, priced by the bottom-up build-up', () => {
    const a = analyseGear(transmissionGear({ qualityClass: 6, caseHardened: true }));
    const ht = a.operations.find(o => o.process === 'case_hardening');
    expect(ht).toBeTruthy();
    // Costed from energy + labour + capital + overhead + QC at the region's own
    // tariffs, not a flat GBP/kg. The furnace step alone must equal the engine.
    const furnace = computeHeatTreatRate('gas_carburise', 'UK').ratePerKg * kg;
    const line = a.heatTreatBreakdown.find(x => /carburise/i.test(x.step));
    expect(line!.costPerPart).toBeCloseTo(furnace, 9);
    // The PACKAGE is larger, because washing and tempering are unbundled — the
    // whole point of the workbook's "compare like scopes" warning.
    expect(a.heatTreatCostPerPart).toBeGreaterThan(furnace);
    expect(a.heatTreatBreakdown.map(x => x.step).join(' ')).toMatch(/[Ww]ash/);
    expect(a.heatTreatBreakdown.map(x => x.step).join(' ')).toMatch(/[Tt]emper/);
    // The basis prints the derivation, not an assertion.
    expect(ht!.basis).toMatch(/energy .* labour .* capital/);
    // It is a purchased service, not a machine: no cycle time, no machine row.
    expect(ht!.cycleSec).toBe(0);
    expect(ht!.machineId).toBe('furnace-subcontract');
  });

  it('through-hardening steel gets quench-and-temper, NOT £0 and NOT carburising', () => {
    const a = analyseGear(transmissionGear({
      materialClass: 'through_hardening_steel', caseHardened: false, qualityClass: 8,
    }));
    expect(a.route.steps.map(s => s.process)).toContain('quench_temper');
    expect(a.route.steps.map(s => s.process)).not.toContain('case_hardening');
    const furnace = computeHeatTreatRate('quench_temper', 'UK').ratePerKg * kg;
    const line = a.heatTreatBreakdown.find(x => /harden and temper/i.test(x.step));
    expect(line!.costPerPart).toBeCloseTo(furnace, 9);
    // The hole this closes: it used to be exactly zero.
    expect(a.heatTreatCostPerPart).toBeGreaterThan(0);
    // And cheaper than carburising — no long carbon-diffusion cycle.
    const carb = analyseGear(transmissionGear({ qualityClass: 8, caseHardened: true }));
    expect(a.heatTreatCostPerPart).toBeLessThan(carb.heatTreatCostPerPart);
  });

  it('quench-and-temper distortion forces grinding on a tight class, like carburising', () => {
    const tight = analyseGear(transmissionGear({
      materialClass: 'through_hardening_steel', caseHardened: false, qualityClass: 6,
    }));
    const loose = analyseGear(transmissionGear({
      materialClass: 'through_hardening_steel', caseHardened: false, qualityClass: 8,
    }));
    expect(tight.route.steps.map(s => s.process)).toContain('grinding');
    expect(loose.route.steps.map(s => s.process)).not.toContain('grinding');
    // And it comes AFTER the furnace — grinding a gear before hardening it
    // throws the accuracy away in the quench tank.
    const order = tight.route.steps.map(s => s.process);
    expect(order.indexOf('grinding')).toBeGreaterThan(order.indexOf('quench_temper'));
  });

  it('cast iron / ADI carries no furnace line, and SAYS why', () => {
    const a = analyseGear(transmissionGear({
      materialClass: 'cast_iron', caseHardened: false, qualityClass: 9,
    }));
    expect(a.heatTreatCostPerPart).toBe(0);
    // Zero with no explanation is indistinguishable from a missing cost.
    expect(a.warnings.join(' ')).toMatch(/austempering is included in the .* material price/i);
  });

  it('a carburising callout on a material that cannot be carburised is refused', () => {
    for (const mc of Object.keys(CANNOT_BE_CARBURISED)) {
      const errs = validateGearInputs(transmissionGear({
        materialClass: mc as never, caseHardened: true,
      }));
      expect(errs.join(' '), `${mc} was allowed to carburise`).toMatch(/cannot be carburised/);
    }
    // The legitimate case still passes.
    expect(validateGearInputs(transmissionGear({ caseHardened: true }))).toEqual([]);
  });

  it('every furnace pass is a purchased consumable in material, never a machine row', () => {
    for (const over of [
      { caseHardened: true },
      { materialClass: 'through_hardening_steel' as const, caseHardened: false },
    ]) {
      const d = computeGearDrivers(transmissionGear({ qualityClass: 8, ...over }));
      expect(d.rawMaterial.consumablesCostPerPart).toBeGreaterThan(0);
      expect(d.operations.some(o => /carburise|harden|temper/i.test(o.operationName))).toBe(false);
    }
  });
});

/**
 * Nitriding and induction hardening.
 *
 * Added after a plant head asked what the model does about them. Each is a real
 * route with a real cost consequence, and neither is "carburising with a
 * different rate":
 *
 *   - Nitriding runs below the transformation temperature, so it costs ZERO ISO
 *     classes of distortion. That reverses the route order: the gear is ground
 *     to size BEFORE the furnace (grinding after would remove the thin case),
 *     and at a class the cutter already holds it skips finishing entirely.
 *   - Induction hardening is the one hardening route that is a MACHINE, not a
 *     purchased service — seconds on a rated cell, with a geometry-specific coil
 *     as programme cost.
 */
describe('nitriding and induction hardening', () => {
  const nitridable = (over: Partial<GearInputs> = {}): GearInputs => transmissionGear({
    materialClass: 'through_hardening_steel', caseHardened: false, ...over,
  });

  it('nitriding costs no distortion, so a class the cutter holds skips finishing', () => {
    // Hobbing holds class 7. Carburising would lose a class and force grinding;
    // nitriding does not, so the gear ships off the hobber.
    const nit = analyseGear(nitridable({ hardeningRoute: 'nitriding', qualityClass: 7 }));
    expect(nit.route.steps.map(s => s.process)).toContain('nitriding');
    expect(nit.route.steps.map(s => s.process)).not.toContain('grinding');

    const carb = analyseGear(transmissionGear({ qualityClass: 7, caseHardened: true }));
    expect(carb.route.steps.map(s => s.process)).toContain('grinding');
  });

  it('a tight class grinds BEFORE nitriding, not after', () => {
    const a = analyseGear(nitridable({ hardeningRoute: 'nitriding', qualityClass: 6 }));
    const order = a.route.steps.map(s => s.process);
    expect(order).toContain('grinding');
    expect(order.indexOf('grinding')).toBeLessThan(order.indexOf('nitriding'));
    // And it says why — grinding a nitrided flank removes the case.
    const grind = a.route.steps.find(s => s.process === 'grinding');
    expect(grind?.reason).toMatch(/remove the thin case|precedes the furnace/i);
  });

  it('nitriding is dearer per kg at the FURNACE than carburising', () => {
    // Per kg of furnace time nitriding is far dearer — a 45 h cycle against 7 h.
    expect(computeHeatTreatRate('nitride', 'UK').ratePerKg)
      .toBeGreaterThan(computeHeatTreatRate('gas_carburise', 'UK').ratePerKg * 2);
    const nit = analyseGear(nitridable({ hardeningRoute: 'nitriding', qualityClass: 7 }));
    const line = nit.heatTreatBreakdown.find(x => /nitride/i.test(x.step));
    expect(line!.costPerPart)
      .toBeCloseTo(computeHeatTreatRate('nitride', 'UK').ratePerKg * 0.65, 9);
    // But the PACKAGES are closer than the furnace rates suggest, because
    // carburising drags two washes and a temper behind it while nitriding needs
    // one pre-clean and nothing after. Unbundling is what makes that visible.
    const carb = analyseGear(transmissionGear({ qualityClass: 7, caseHardened: true }));
    expect(nit.heatTreatBreakdown.length).toBeLessThan(carb.heatTreatBreakdown.length);
  });

  it('a coarse-module gear warns that the nitrided case is too thin to carry it', () => {
    const a = analyseGear(nitridable({
      hardeningRoute: 'nitriding', normalModuleMm: 10, teeth: 30, qualityClass: 8,
    }));
    expect(a.warnings.join(' ')).toMatch(/crush/i);
  });

  it('induction hardening is a MACHINE operation, not a purchased service', () => {
    const a = analyseGear(nitridable({ hardeningRoute: 'induction_hardening', qualityClass: 8 }));
    const op = a.operations.find(o => o.process === 'induction_hardening');
    expect(op).toBeTruthy();
    expect(op!.machineId).toBe('gear-induction');
    expect(op!.cycleSec).toBeGreaterThan(0);                 // real seconds
    expect(a.heatTreatCostPerPart).toBe(0);                  // nothing by weight
    // So it lands in the process bucket, with machine hours, not in material.
    const d = computeGearDrivers(nitridable({ hardeningRoute: 'induction_hardening', qualityClass: 8 }));
    expect(d.operations.some(o => /induction/i.test(o.operationName))).toBe(true);
    expect(d.rawMaterial.consumablesCostPerPart ?? 0).toBe(0);
  });

  it('the induction coil is programme cost, charged only on that route', () => {
    const ind = analyseGear(nitridable({ hardeningRoute: 'induction_hardening', qualityClass: 8 }));
    const qt = analyseGear(nitridable({ hardeningRoute: 'quench_temper', qualityClass: 8 }));
    expect(ind.nreLines.some(l => /coil/i.test(l.item))).toBe(true);
    expect(qt.nreLines.some(l => /coil/i.test(l.item))).toBe(false);
    expect(ind.nreCostGBP).toBeGreaterThan(qt.nreCostGBP);
  });

  it('a large gear is hardened tooth-by-tooth, and the cycle scales with tooth count', () => {
    // m2.5 x z38 -> OD 100 mm (single shot); z140 -> OD 355 mm (past the coil limit).
    const small = analyseGear(nitridable({ hardeningRoute: 'induction_hardening', qualityClass: 8 }));
    const large = analyseGear(nitridable({
      hardeningRoute: 'induction_hardening', qualityClass: 8, teeth: 140,
    }));
    const secs = (a: typeof small) =>
      a.operations.find(o => o.process === 'induction_hardening')!.cycleSec;
    expect(secs(large)).toBeGreaterThan(secs(small));
    expect(large.operations.find(o => o.process === 'induction_hardening')!.basis)
      .toMatch(/tooth-by-tooth/);
    expect(small.operations.find(o => o.process === 'induction_hardening')!.basis)
      .toMatch(/single-shot/);
  });

  it('refuses a route the metallurgy cannot support, naming the reason', () => {
    // 20MnCr5 is 0.20% C: nothing to quench on induction heating, and too little
    // nitride-forming alloy for a useful nitrided case.
    for (const route of ['induction_hardening', 'nitriding'] as const) {
      const errs = validateGearInputs(transmissionGear({
        materialClass: 'case_hardening_steel', caseHardened: false, hardeningRoute: route,
      }));
      expect(errs.join(' '), route).toMatch(/cannot be (induction hardened|nitrided)/);
    }
    // 42CrMo4 takes both.
    for (const route of ['induction_hardening', 'nitriding'] as const) {
      expect(validateGearInputs(nitridable({ hardeningRoute: route }))).toEqual([]);
    }
  });

  it('an explicit route overrides the material-class default', () => {
    const dflt = analyseGear(nitridable({ qualityClass: 8 }));
    expect(dflt.route.steps.map(s => s.process)).toContain('quench_temper');
    const forced = analyseGear(nitridable({ hardeningRoute: 'none', qualityClass: 8 }));
    expect(forced.route.steps.map(s => s.process)).not.toContain('quench_temper');
    expect(forced.heatTreatCostPerPart).toBe(0);
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

/**
 * Gear model — the defects found by the 360° audit, pinned so they cannot return.
 *
 * Every test here corresponds to something the shipped model got WRONG in a way
 * that produced a confident, plausible-looking number rather than an error. That
 * is the failure mode a should-cost tool has to be hardest against: a cost
 * engineer can argue with a number that looks odd, but not with one that looks
 * fine and is not.
 *
 * The defects, in the order they were found:
 *
 *   1. Volume did nothing. A gear cost £13.051 at 1,000/yr and £13.051 at
 *      1,000,000/yr, because only perishable tooling was modelled and per-part
 *      tool cost is volume-independent by construction. No fixture, no
 *      programming, no PPAP, no broach capital.
 *   2. A gear with ZERO teeth costed at £11.12. So did negative teeth, zero face
 *      width and zero weight. `amortizationVolume: 0` returned a total of NaN.
 *   3. ISO class 99 was accepted and silently treated as very loose, skipping all
 *      finishing — the cheapest possible answer to a meaningless input.
 *   4. An internal ring gear was routed to a GENERATING grinder, which runs a
 *      threaded wheel from outside and cannot enter a bore at all.
 *   5. Grinding took an identical 39.3 s at ISO class 6, 5 and 4 — quietly
 *      contradicting the feature's central claim that quality drives cost.
 *   6. The removal-rate cross-check compared against a flat 500,000 mm³/min and
 *      never fired on anything, in either direction.
 *   7. Omitting setup time silently priced setup at zero.
 */
import { describe, it, expect } from 'vitest';
import {
  analyseGear, computeGearDrivers, checkRemovalRate, validateGearInputs,
  ISO_1328_CLASS_MIN, ISO_1328_CLASS_MAX,
  MRR_PER_MODULE_SQ_MIN, MRR_PER_MODULE_SQ_MAX,
  type GearInputs,
} from '../src/engine/modules/gear.js';
import { pickGearMachineId } from '../src/engine/machine-sizing.js';
import { DEFAULT_GEAR_SHOP_DATA } from '../src/engine/gear-shop-data.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const gear = (over: Partial<GearInputs> = {}): GearInputs => ({
  normalModuleMm: 2.5, teeth: 38, helixAngleDeg: 25, faceWidthMm: 22,
  internal: false, qualityClass: 6, materialClass: 'case_hardening_steel',
  caseHardened: true, blankCostPerPart: 3.20, netWeightKg: 0.65,
  materialId: 'mat-steel-20mncr5',
  annualVolume: 200_000, amortizationVolume: 200_000, batchSize: 500,
  setupTimeHrPerOperation: 1.5,
  ...over,
});

const total = (g: GearInputs): number => {
  const d = computeGearDrivers(g);
  const stack: UniversalStackInput = {
    partName: 'gear', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    packagingPerPart: 0.10, logisticsPerPart: 0.12,
    overheadPct: 0.12, marginPct: 0.08, annualVolume: g.annualVolume,
  };
  return computeUniversalStack(stack, DEFAULT_RATE_LIBRARY).total;
};

describe('defect 1 — volume must move the piece price', () => {
  it('a low-volume gear costs materially more per part than a high-volume one', () => {
    const low = total(gear({ annualVolume: 1_000, amortizationVolume: 1_000 }));
    const high = total(gear({ annualVolume: 1_000_000, amortizationVolume: 1_000_000 }));
    expect(low).toBeGreaterThan(high);
    // Not a rounding difference — programme cost dominates at 1k/yr.
    expect(low / high).toBeGreaterThan(2);
  });

  it('piece price falls monotonically as the amortisation volume rises', () => {
    const vols = [1_000, 10_000, 100_000, 1_000_000];
    const costs = vols.map(v => total(gear({ annualVolume: v, amortizationVolume: v })));
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i], `${vols[i]} should be cheaper than ${vols[i - 1]}`)
        .toBeLessThan(costs[i - 1]);
    }
  });

  it('every gear carries fixture, programming and inspection-master NRE', () => {
    const a = analyseGear(gear());
    expect(a.nreCostGBP).toBeGreaterThan(0);
    const items = a.nreLines.map(l => l.item);
    expect(items).toContain('Dedicated fixture');
    expect(items).toContain('Programming & first article');
    expect(items).toContain('Inspection master');
    for (const l of a.nreLines) expect(l.reason.length).toBeGreaterThan(15);
  });

  it('a broached gear carries the broach capital — the routing rationale demands it', () => {
    // The advisor sends internal gears to broaching above 250k/yr because "the
    // volume carries the tool cost". With no broach cost that reasoning was empty.
    const broached = analyseGear(gear({
      internal: true, teeth: 78, helixAngleDeg: 0, annualVolume: 400_000,
    }));
    expect(broached.route.cuttingProcess).toBe('broaching');
    expect(broached.nreLines.map(l => l.item)).toContain('Broach');

    const skived = analyseGear(gear({
      internal: true, teeth: 78, helixAngleDeg: 0, annualVolume: 200_000,
    }));
    expect(skived.route.cuttingProcess).toBe('skiving');
    expect(skived.nreLines.map(l => l.item)).not.toContain('Broach');
    expect(broached.nreCostGBP).toBeGreaterThan(skived.nreCostGBP);
  });

  it('warns when the programme cost is a material share of the piece price', () => {
    const a = analyseGear(gear({ annualVolume: 500, amortizationVolume: 500 }));
    expect(a.warnings.some(w => /One-time cost/.test(w))).toBe(true);
  });
});

describe('defect 2 & 3 — a gear that cannot exist must not get a price', () => {
  const impossible: Array<[string, Partial<GearInputs>]> = [
    ['zero teeth', { teeth: 0 }],
    ['negative teeth', { teeth: -5 }],
    ['fractional teeth', { teeth: 38.5 }],
    ['undercutting tooth count', { teeth: 5 }],
    ['zero module', { normalModuleMm: 0 }],
    ['negative module', { normalModuleMm: -2 }],
    ['NaN module', { normalModuleMm: NaN }],
    ['zero face width', { faceWidthMm: 0 }],
    ['zero weight', { netWeightKg: 0 }],
    ['zero amortisation volume', { amortizationVolume: 0 }],
    ['zero batch', { batchSize: 0 }],
    ['negative blank cost', { blankCostPerPart: -5 }],
    ['class below the standard', { qualityClass: ISO_1328_CLASS_MIN - 1 }],
    ['class above the standard', { qualityClass: ISO_1328_CLASS_MAX + 1 }],
    ['helix at 90°', { helixAngleDeg: 90 }],
    ['reject rate of 1', { rejectRate: 1 }],
  ];

  for (const [name, over] of impossible) {
    it(`blocks ${name}`, () => {
      const a = analyseGear(gear(over));
      expect(a.blocked, `${name} produced a costable gear`).toBeTruthy();
      expect(() => computeGearDrivers(gear(over))).toThrow(/cannot be costed/);
    });
  }

  it('the block names the offending field, not just that something is wrong', () => {
    expect(validateGearInputs(gear({ teeth: 0 }))[0]).toMatch(/Tooth count/);
    expect(validateGearInputs(gear({ qualityClass: 99 }))[0]).toMatch(/ISO 1328/);
  });

  it('a valid gear passes validation cleanly', () => {
    expect(validateGearInputs(gear())).toEqual([]);
  });

  it('an amortisation volume of zero can no longer produce NaN downstream', () => {
    // This one reached the 8-bucket breakdown as NaN before the fix.
    expect(() => total(gear({ amortizationVolume: 0 }))).toThrow();
  });
});

describe('defect 4 — a machine that cannot reach the teeth is not a machine choice', () => {
  it('an internal gear never lands on a generating grinder', () => {
    const a = analyseGear(gear({ internal: true, teeth: 78, helixAngleDeg: 0, qualityClass: 4 }));
    const grind = a.operations.find(o => o.process === 'grinding');
    expect(grind).toBeDefined();
    expect(grind!.machineId).toBe('gear-grind-profile');
  });

  it('an external gear may still use the cheaper generating grinder', () => {
    const pick = pickGearMachineId('grinding',
      { normalModuleMm: 2.5, outerDiameterMm: 110, faceWidthMm: 22, internal: false });
    expect(pick.machineId).toBe('gear-grind-generating');
  });

  it('honing and shaving are refused on an internal gear, not downsized', () => {
    for (const proc of ['honing', 'shaving']) {
      const pick = pickGearMachineId(proc,
        { normalModuleMm: 2.5, outerDiameterMm: 110, faceWidthMm: 22, internal: true });
      expect(pick.blocked, `${proc} was allowed on an internal gear`).toBeTruthy();
    }
  });
});

describe('defect 5 — quality class must move the grinding time', () => {
  it('a tighter class grinds for longer', () => {
    const times = [7, 6, 5, 4].map(q => {
      const a = analyseGear(gear({ qualityClass: q }));
      return a.operations.find(o => o.process === 'grinding')?.cycleSec ?? 0;
    });
    for (let i = 1; i < times.length; i++) {
      expect(times[i], `class ${[7, 6, 5, 4][i]} should grind longer`).toBeGreaterThan(times[i - 1]);
    }
  });

  it('the extra time is spark-out, and the basis says so', () => {
    const a = analyseGear(gear({ qualityClass: 4 }));
    const grind = a.operations.find(o => o.process === 'grinding')!;
    expect(grind.basis).toMatch(/spark-out/);
  });
});

describe('defect 6 — the removal-rate cross-check must actually discriminate', () => {
  it('stays silent across the whole legitimate module range', () => {
    for (const [m, z, b] of [[0.5, 20, 5], [1, 30, 10], [2.5, 38, 22], [4, 60, 40], [6, 80, 80]] as const) {
      const a = analyseGear(gear({
        normalModuleMm: m, teeth: z, faceWidthMm: b, helixAngleDeg: 0,
        qualityClass: 8, caseHardened: false,
      }));
      expect(a.warnings.filter(w => /cm³\/min/.test(w)),
        `module ${m} tripped the guard`).toHaveLength(0);
    }
  });

  it('fires when the shop data carries a 10x-wrong feed', () => {
    const bad = structuredClone(DEFAULT_GEAR_SHOP_DATA);
    bad.cutting[0].hobFeedMmPerRev.value *= 10;
    const a = analyseGear(gear({
      normalModuleMm: 2.5, helixAngleDeg: 0, qualityClass: 8, caseHardened: false, shopData: bad,
    }));
    expect(a.warnings.some(w => /far above the plausible roughing band/.test(w))).toBe(true);
  });

  it('fires when the cutting speed is an order of magnitude too slow', () => {
    const slow = structuredClone(DEFAULT_GEAR_SHOP_DATA);
    slow.cutting[0].hobSpeedMPerMin.value = 8;
    const a = analyseGear(gear({
      normalModuleMm: 2.5, helixAngleDeg: 0, qualityClass: 8, caseHardened: false, shopData: slow,
    }));
    expect(a.warnings.some(w => /far below the plausible roughing band/.test(w))).toBe(true);
  });

  it('does NOT flag grinding, which legitimately removes 30x less metal', () => {
    // The first version of this guard fired on the grinding pass of a perfectly
    // normal transmission gear, on the very first worked example. A finishing
    // process removes 0.08 mm of stock, not the whole tooth space.
    const a = analyseGear(gear({ qualityClass: 5 }));
    expect(a.operations.some(o => o.process === 'grinding')).toBe(true);
    expect(a.warnings.filter(w => /cm³\/min/.test(w))).toHaveLength(0);
  });

  it('applies the finishing band to grinding and the roughing band to hobbing', () => {
    // 1.8 cm³/min on module 2.5 is right for grinding and absurd for hobbing.
    expect(checkRemovalRate(1_800, 2.5, 'grinding')).toBeNull();
    expect(checkRemovalRate(1_800, 2.5, 'hobbing')).toMatch(/far below/);
  });

  it('the band is expressed per mm² of module, not as a flat rate', () => {
    // 56 cm³/min on a module 2.5 gear is in band; the same rate on a module 0.5
    // pinion is not, and a flat threshold could never tell them apart.
    expect(checkRemovalRate(56_100, 2.5)).toBeNull();
    expect(checkRemovalRate(56_100, 0.5)).toMatch(/far above/);
    expect(MRR_PER_MODULE_SQ_MIN).toBeLessThan(MRR_PER_MODULE_SQ_MAX);
  });
});

describe('defect 7 — an omitted input is stated, never priced at zero', () => {
  it('says setup is EXCLUDED when no setup time was given', () => {
    const a = analyseGear(gear({ setupTimeHrPerOperation: undefined }));
    expect(a.warnings.some(w => /setup is EXCLUDED/.test(w))).toBe(true);
  });

  it('does not warn when setup was supplied', () => {
    const a = analyseGear(gear({ setupTimeHrPerOperation: 1.5 }));
    expect(a.warnings.some(w => /setup is EXCLUDED/.test(w))).toBe(false);
  });

  it('flags an implausible reject rate rather than quietly multiplying by it', () => {
    const a = analyseGear(gear({ rejectRate: 0.5 }));
    expect(a.warnings.some(w => /reject rate is far outside/.test(w))).toBe(true);
  });
});

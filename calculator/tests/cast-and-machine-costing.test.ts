/**
 * Cast-then-machine reaches a price.
 *
 * The rules pack for this commodity has existed and worked: it composes
 * CASTING_RULES with MACHINING_RULES, asks four questions — material, route,
 * pressure-tight, tolerance class, safety-critical — and accepts every answer.
 * Then it refused, with `no_cost_mapping`. `toCostParams` had no case for it and
 * `COSTABLE_COMMODITIES` no entry, so a part walked the whole flow and
 * dead-ended. Two of the six real parts in `cad-audit/parts/` are
 * cast-then-machined, which is ordinary for automotive.
 *
 * What is asserted here is the mapping, in three ways that fail differently:
 *
 *   1. the money reconciles to a hand-calculation, so the numbers are not
 *      merely self-consistent;
 *   2. the two halves are both actually present — a casting tool AND cutting
 *      operations — because the failure mode of a composed mapping is silently
 *      dropping one side;
 *   3. the foundry pours and a machinist cuts, which is the one thing a
 *      copy-paste from `casting` would get wrong.
 */
import { describe, it, expect } from 'vitest';
import { toCostParams, COSTABLE_COMMODITIES } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { meltFactsFor, MELT_SHOP } from '../src/engine/casting-melt.js';
import { ukElectricityPerKwh } from '../src/engine/uk-tariff.js';
import type { CADAnalysisResult } from '../src/engine/ai-analysis.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const VOLUME = 50_000;

/** What the cast_and_machine rules produce for Casting_Braket.stp, verbatim. */
const SUGGESTIONS = {
  recommendedCommodity: 'cast_and_machine',
  netWeightKg: 2.512,
  materialId: 'mat-steel1045',
  estimatedCycleTimeHr: 0.1836,
  estimatedSetupTimeHr: 1,
  estimatedOperations: [
    { name: 'Milling — +Z (108 faces)', machineId: 'mach-haas-vf2', cycleTimeHr: 0.0437 },
    { name: 'Milling — +X (70 faces)', machineId: 'mach-haas-vf2', cycleTimeHr: 0.0283 },
    { name: 'Milling — +Y (52 faces)', machineId: 'mach-haas-vf2', cycleTimeHr: 0.021 },
    { name: 'Drilling — 10 holes', machineId: 'mach-drill', cycleTimeHr: 0.0905 },
  ],
  casting: {
    subtype: 'sand', yieldFraction: 0.65,
    dieMouldCostGBP: 14_500, dieMouldLife: 8_000, cycleTimeSandGravHr: 0.1846,
  },
  machining: { setupCount: 4, machineId: 'mach-haas-vf2' },
} as unknown as CADAnalysisResult['costInputSuggestions'];

const mapped = toCostParams('cast_and_machine', SUGGESTIONS, VOLUME, 'steel')!;
const params = mapped.params as unknown as Parameters<typeof computeCastAndMachineDrivers>[0];

/**
 * Cost it the way the product does.
 *
 * `computeUniversalStack` alone leaves overhead and margin null — they are the
 * shop's percentages, supplied by the caller — and a null overhead makes the
 * total NaN. Going through the executor is both correct and the point: this
 * asserts the chain that actually runs, not a hand-assembled approximation of
 * it.
 */
const cost = executeCalculateCost({
  commodity: 'cast_and_machine', params: params as unknown as Record<string, unknown>,
  partName: 'Casting_Braket',
  rateLibrary: LIB,
  overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
  packagingPerPart: SHOP_DEFAULTS.packagingPerPart,
  logisticsPerPart: SHOP_DEFAULTS.logisticsPerPart,
});

describe('the commodity can be costed at all', () => {
  it('is on the costable list', () => {
    expect(COSTABLE_COMMODITIES).toContain('cast_and_machine');
  });

  it('maps to parameters instead of returning null', () => {
    expect(mapped).not.toBeNull();
    expect(mapped.commodity).toBe('cast_and_machine');
  });

  it('reaches a total through the real engine', () => {
    expect(cost.success, cost.error).toBe(true);
    expect(cost.total).toBeGreaterThan(0);
    // All eight buckets present and finite — a null overhead silently makes the
    // total NaN rather than raising, which is how this first went unnoticed.
    for (const [k, v] of Object.entries(cost.breakdown as Record<string, number>)) {
      expect(Number.isFinite(v), `${k} is ${v}`).toBe(true);
    }
  });
});

describe('the money reconciles by hand', () => {
  const r = { breakdown: cost.breakdown as unknown as Record<string, number> };

  it('raw material is the metal kept or lost, plus melting every kg poured', () => {
    // The arithmetic, in full, so a change to any step of it shows up here
    // rather than as a total that moved for no stated reason:
    //
    //   effective net = finished / (1 - rejectRate)   — cast extra to yield the target
    //   poured        = effective net / castingYield  — runners and risers
    //   returns       = poured - good part            — gating AND rejects, remelted
    //   lost          = returns x meltLoss            — dross / oxidation per remelt
    //   metal         = (good part + lost) x price - lost x scrap
    //   melt energy   = poured x kWh/kg x £/kWh
    //
    // Until 2 Oct 2026 the returns were credited at the scrap price, as if sold:
    // £3.48 here against £2.13 now (casting review).
    const mat = LIB.materials.find(m => m.id === 'mat-steel1045')!;
    const melt = meltFactsFor('mat-steel1045')!;
    const effectiveNet = 2.512 / (1 - 0.03);
    const poured = effectiveNet / 0.65;
    const lost = (poured - 2.512) * melt.lossFraction;
    const byHand = (2.512 + lost) * mat.pricePerKg - lost * mat.scrapRecoveryPricePerKg
      + poured * melt.energyKwhPerKg * ukElectricityPerKwh()
      + (params.sand ? poured * MELT_SHOP.greenSandAdditionsPerKgPoured : 0);   // green-sand additions

    expect(poured).toBeCloseTo(3.98414, 4);
    expect(melt.lossFraction).toBe(0.03);
    expect(r.breakdown.rawMaterial).toBeCloseTo(byHand, 2);
  });

  it('charges the pattern once, amortised over its life', () => {
    // £14,500 of pattern over an 8,000 life. The module adds casting
    // consumables on top, so the floor is the bare amortisation.
    expect(r.breakdown.tooling).toBeGreaterThanOrEqual(14_500 / 8_000);
    expect(r.breakdown.tooling).toBeLessThan(3);
  });
});

describe('both halves survive the composition', () => {
  const drivers = computeCastAndMachineDrivers(params);

  it('keeps the casting tool AND the cutting operations', () => {
    // The failure mode of a composed mapping is quietly dropping one side and
    // still returning a plausible number.
    expect(drivers.tooling!.totalToolingCost).toBeGreaterThan(0);
    const names = drivers.operations.map(o => o.operationName);
    expect(names.some(n => /setup/i.test(n)), 'the amortised setup op').toBe(true);
    expect(names.some(n => /milling/i.test(n)), 'the milling ops').toBe(true);
    expect(names.some(n => /drilling/i.test(n)), 'the drilling op').toBe(true);
  });

  it('bills the cutting time the rules measured, not a re-estimate', () => {
    const cutting = drivers.operations
      .filter(o => /milling|drilling/i.test(o.operationName))
      .reduce((s, o) => s + o.cycleTimeHr, 0);
    // 0.0437 + 0.0283 + 0.021 + 0.0905. The rules already put this through
    // `capNearNetMachiningHr` — the near-net finish envelope — so the mapping
    // must not apply the billet removal ceiling on top and cap a capped number.
    expect(cutting).toBeCloseTo(0.1835, 4);
  });

  it('has the foundry pour and a machinist cut', () => {
    // `LABOUR.cast_and_machine` is `lab-uk-foundry`, which is right for the
    // pour and wrong for the milling. A copy-paste from `casting` would put a
    // foundry operative on the machining centre.
    const setup = params.machiningSetup;
    expect(setup.labourId).toBe('lab-uk-skilled');
    expect(params.castingLabourId).toBe('lab-uk-foundry');
    for (const op of params.machiningOps) expect(op.labourId).toBe('lab-uk-skilled');
  });

  it('sizes the setup from the setups the geometry actually needs', () => {
    // 4 principal directions measured -> complexity 4, and the module's setup
    // factor table is indexed 1-5. An out-of-range index silently falls back
    // to 1.0, so this is clamped rather than passed through.
    expect(params.geometryComplexity).toBe(4);
    expect(params.machiningSetup.batchSize).toBe(2_500);   // 50,000 / 20
  });
});

describe('what it does not know, it says', () => {
  it('declares when no machining allowance was decided', () => {
    // The STEP is the finished part. With no cast-weight rule in the analysis
    // (the rules add drilled-hole stock — casting-review.test.ts), the two are
    // taken as equal, and that must be stated.
    expect(params.castPartWeightKg).toBe(params.finishedWeightKg);
    expect(mapped.assumed.join(' ')).toMatch(/no machining allowance decided/);
  });

  it('refuses when there is no casting block to work from', () => {
    const noCasting = { ...SUGGESTIONS, casting: undefined } as unknown as CADAnalysisResult['costInputSuggestions'];
    expect(toCostParams('cast_and_machine', noCasting, VOLUME, 'steel')).toBeNull();
  });
});

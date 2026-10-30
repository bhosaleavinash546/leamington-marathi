/**
 * Arithmetic audit — gears (30 Oct 2026). Each test fails on the code before the audit and passes after.
 * Write-up: docs/review/arith-audit/gear.md; independent shadow: scripts/arith-audit/gear.ts.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  GEAR_RULES, GEAR_HELIX_DECISION_ID, GEAR_QUALITY_DECISION_ID, GEAR_MATERIAL_DECISION_ID,
  GEAR_HARDENING_DECISION_ID,
} from '../src/engine/cost-input-rules/commodities/gear.js';
import {
  analyseGear, computeGearDrivers, GEAR_OEE, type GearInputs,
} from '../src/engine/modules/gear.js';
import { GEAR_PROCESS_REFERENCE } from '../src/engine/modules/gear-advisor.js';
import { DEFAULT_GEAR_SHOP_DATA } from '../src/engine/gear-shop-data.js';
import { DEFAULT_HT_SHOP } from '../src/engine/gear-heat-treat-data.js';
import { computeHeatTreatRate } from '../src/engine/gear-heat-treat-rate.js';
import { SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/** The real m3 × z38 spur gear as the kernel measured it (tests/fixtures/real-parts-baseline.json). */
const GEO = {
  status: 'success', boundingBox: { xMm: 120, yMm: 119.76, zMm: 30 },
  volume: { mm3: 265_959.5, cm3: 265.959 }, surfaceArea: { mm2: 42_968.1, cm2: 429.681 },
  turning: { fraction: 0.561, maxDiaMm: 120, externalMaxDiaMm: 120, axis: [0, 0, -1] },
  gear: { likelyGear: true, teeth: 38, tipDiameterMm: 120, faceWidthMm: 30, boreDiameterMm: 40,
    derivedNormalModuleMm: 3, moduleBasis: '', teethBasis: 'counted 38', helixAngleDeg: null, internal: false },
} as unknown as OCCTGeometry;

const ctx = (answers: Record<string, unknown>): RuleContext => ({
  geo: GEO, geometryQuality: 'occt', commodity: 'gear', commoditySource: 'engineer',
  annualVolume: 50_000, filename: 'test-gear-m3-z38.step', answers,
} as RuleContext);
const ANSWERED = { [GEAR_HELIX_DECISION_ID]: '0', [GEAR_QUALITY_DECISION_ID]: '8',
  [GEAR_MATERIAL_DECISION_ID]: 'case_hardening_steel' };

const gear = (over: Partial<GearInputs> = {}): GearInputs => ({
  normalModuleMm: 3, teeth: 38, helixAngleDeg: 0, faceWidthMm: 30, internal: false, qualityClass: 8,
  materialClass: 'case_hardening_steel', caseHardened: true, blankCostPerPart: 4.76, netWeightKg: 2.088,
  materialId: 'mat-steel-20mncr5', annualVolume: 50_000, amortizationVolume: 250_000, batchSize: 4170,
  setupTimeHrPerOperation: 0.75, rejectRate: 0.02, effectiveCaseDepthMm: 0.7, blankPrepCycleSec: 190, ...over,
});

describe('G1 — perishable tool wear carries the reject uplift like every other per-part line', () => {
  it('tooling total = (hob + wheel wear) ÷ (1 − reject) × programme + NRE, to the penny', () => {
    const T = DEFAULT_GEAR_SHOP_DATA.tools;
    const hob = (T.hobCostGBP.value + T.hobRegrindsBeforeScrap.value * T.hobRegrindCostGBP.value)
      / (T.hobPartsBetweenRegrinds.value * (1 + T.hobRegrindsBeforeScrap.value));   // £3,560 / 15,600 parts
    const wheel = T.grindingWheelCostGBP.value / T.grindingWheelPartsPerWheel.value;  // £1,100 / 3,000
    const nre = 8000 + 6500 + 4000;
    const d = computeGearDrivers(gear());
    expect(d.tooling.totalToolingCost).toBeCloseTo((hob + wheel) / 0.98 * 250_000 + nre, 4);
    // Was (hob + wheel) × 250,000 + NRE = £167,217.95 — the scrapped 2 % wore the hob for nothing.
    expect(d.tooling.totalToolingCost).not.toBeCloseTo((hob + wheel) * 250_000 + nre, 0);
  });

  it('tooling is itemised and the items add to the total', () => {
    const d = computeGearDrivers(gear());
    const items = d.tooling.items ?? [];
    expect(items.map(i => i.label.split(':')[0])).toEqual(
      ['Hob wear', 'Grinding wheel wear', 'Dedicated fixture', 'Programming & first article', 'Inspection master']);
    expect(items.reduce((s, i) => s + i.gbp, 0)).toBeCloseTo(d.tooling.totalToolingCost, 6);
  });
});

describe('G2 — the heat-treat package reaches the trace itemised', () => {
  it('consumablesItems list each furnace step with rate × kg and sum to the consumable', () => {
    const a = analyseGear(gear());
    const d = computeGearDrivers(gear());
    const items = d.rawMaterial.consumablesItems ?? [];
    expect(items).toHaveLength(a.heatTreatBreakdown.length);
    expect(items.reduce((s, i) => s + i.gbp, 0)).toBeCloseTo(d.rawMaterial.consumablesCostPerPart!, 9);
    expect(items[1].label).toMatch(/carburise.*£0\.\d{4}\/kg × 2\.088 kg ÷ \(1 − 2% reject\)/i);
  });
});

describe('G3 — the ISO class question says what the costing does', () => {
  const qd = runCostInputRules(GEAR_RULES, ctx({ [GEAR_HELIX_DECISION_ID]: '0',
    [GEAR_MATERIAL_DECISION_ID]: 'case_hardening_steel' })).decisions.find(d => d.id === GEAR_QUALITY_DECISION_ID)!;
  const opt = (v: string) => qd.options.find(o => o.value === v)!.consequence ?? '';

  it('no claim of shaving after heat treat, a "light finish" at class 8, or a 2× ground-v-shaved premium', () => {
    expect(qd.why).not.toMatch(/twice|hobbed-and-shaved/);
    expect(opt('7')).not.toMatch(/skive|shave/);
    expect(opt('8')).not.toMatch(/light finish/);
  });

  it('each option matches the route the module costs for a carburised gear', () => {
    for (const q of [6, 7, 8, 9]) {
      const grinds = analyseGear(gear({ qualityClass: q })).operations.some(o => o.process === 'grinding');
      const text = opt(String(q));
      if (grinds) expect(text, `class ${q}`).toMatch(/ground after heat treat/);
      else expect(text, `class ${q}`).toMatch(/no finishing pass/);
    }
  });

  it('material classes the shop data cannot cut say the costing stops, as the module does', () => {
    const md = runCostInputRules(GEAR_RULES, ctx({ [GEAR_HELIX_DECISION_ID]: '0', [GEAR_QUALITY_DECISION_ID]: '8' }))
      .decisions.find(d => d.id === GEAR_MATERIAL_DECISION_ID)!;
    for (const mc of ['alloy_steel_prehardened', 'stainless', 'bronze', 'plastic'] as const) {
      expect(analyseGear(gear({ materialClass: mc, caseHardened: false })).blocked).toMatch(/No cutting parameters/);
      expect(md.options.find(o => o.value === mc)!.consequence).toMatch(/costing stops/);
    }
    expect(md.options.find(o => o.value === 'case_hardening_steel')!.consequence)
      .toMatch(/ground after heat treat at class 8 and tighter/);
  });
});

describe('G4 — printed bases re-add to their values and state their constants', () => {
  const r = runCostInputRules(GEAR_RULES, ctx(ANSWERED));

  it('blank material basis prints the chip weight and the result (£5.05 − £0.29 → £4.76)', () => {
    const b = r.byRule['gear.blankCostPerPart'];
    expect(b.value).toBe(4.76);
    expect(b.basis).toContain('= 3.413 kg');
    expect(b.basis).toContain('1.325 kg × £0.22/kg = £0.29 → £4.76');
    expect(b.basis).toMatch(/engineering-typical allowances, not sourced/);
    expect(b.basis).toMatch(/saw cut-off itself is not costed/);
  });

  it('blank turning basis prints bar − blank = removal and the seconds', () => {
    const b = r.byRule['gear.blankPrepCycleSec'];
    expect(b.value).toBe(190);
    expect(b.basis).toContain('bar 434.7 cm³ − turned blank 301.6 cm³');
    expect(b.basis).toContain('= 3.16 min = 190 s');
  });

  it('set-up basis names every operation it is charged on and the OEE / crew / efficiency', () => {
    const b = r.byRule['gear.setupTimeHrPerOperation'].basis;
    expect(b).toMatch(/blank turning.*deburr.*gear checker/);
    expect(b).toContain(`OEE ${GEAR_OEE}`);
    expect(b).toMatch(/crew 0\.5/);
  });

  it('reject basis states its basis, not a stale screen-v-headless note', () => {
    const b = r.byRule['gear.rejectRate'].basis;
    expect(b).not.toMatch(/screen said/);
    expect(b).toMatch(/not sourced/);
  });

  it('quality basis prints the costed route', () => {
    expect(r.byRule['gear.qualityClass'].basis).toMatch(/costed route: gear hobbing → .*carburise and quench.* → gear grinding/);
  });
});

describe('G5 — labels and constants', () => {
  it('the carburise step does not claim the temper that is charged as its own step', () => {
    const steps = analyseGear(gear()).route.steps.map(s => s.label);
    expect(steps).toContain('Temper');
    expect(GEAR_PROCESS_REFERENCE.case_hardening.label).not.toMatch(/temper/i);
  });

  it('inspection text does not claim a class-driven sampling rate the cost does not carry', () => {
    expect(GEAR_PROCESS_REFERENCE.inspection.source).not.toMatch(/Sampling rate rises/);
  });

  it('every operation runs at GEAR_OEE, which is the shop default', () => {
    expect(GEAR_OEE).toBe(SHOP_DEFAULTS.oee);
    for (const o of computeGearDrivers(gear()).operations) expect(o.oee).toBe(GEAR_OEE);
  });

  it('the cycle rule lists the route the answered hardening route costs', () => {
    const r = runCostInputRules(GEAR_RULES, ctx({ ...ANSWERED, [GEAR_HARDENING_DECISION_ID]: 'none' }));
    // Left soft at class 8: hobbing holds 7 — no furnace, no grinding. It listed carburise + grinding.
    expect(r.byRule['gear.cycleTimeHr'].basis).not.toMatch(/grinding|carburise/i);
  });
});

describe('G6 — one round trip to the heat-treater, not one per furnace step', () => {
  it('sub-contract freight is charged on the furnace step only', () => {
    const a = analyseGear(gear());
    const steps = a.heatTreatBreakdown;
    expect(steps).toHaveLength(4);   // wash, carburise + quench, wash, temper
    const freight = DEFAULT_HT_SHOP.subcontractLogisticsGBPPerKg.value;   // UK: freight multiplier 1
    const full = (k: string) => computeHeatTreatRate(k, 'UK', { effectiveCaseDepthMm: 0.7 }).ratePerKg;
    expect(steps[0].ratePerKg).toBeCloseTo(full('wash') - freight, 9);
    expect(steps[1].ratePerKg).toBeCloseTo(full('gas_carburise'), 9);
    expect(steps[2].ratePerKg).toBeCloseTo(full('wash') - freight, 9);
    expect(steps[3].ratePerKg).toBeCloseTo(full('temper_standalone') - freight, 9);
    expect(steps[3].basis).toMatch(/one round trip/);
    // The package on the real gear: was Σ full rates × 2.088 kg = £3.108; now 3 × freight × 2.088 kg less.
    const was = (2 * full('wash') + full('gas_carburise') + full('temper_standalone')) * 2.088;
    expect(a.heatTreatCostPerPart).toBeCloseTo(was - 3 * freight * 2.088, 9);
  });

  it('a captive line carries no freight, so nothing is taken off', () => {
    const a = analyseGear(gear({ heatTreatSourcing: 'captive' }));
    const full = (k: string) => computeHeatTreatRate(k, 'UK', { effectiveCaseDepthMm: 0.7, sourcing: 'captive' }).ratePerKg;
    expect(a.heatTreatBreakdown[3].ratePerKg).toBeCloseTo(full('temper_standalone'), 9);
  });
});

describe('G7 — the representative-data warning reaches the printed basis, not only the screen note', () => {
  it('the quality-class basis says the shop data is representative', () => {
    const r = runCostInputRules(GEAR_RULES, ctx(ANSWERED));
    expect(r.byRule['gear.qualityClass'].basis).toMatch(/representative values .* not quotable until replaced/);
  });
});

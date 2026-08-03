/**
 * Machining cost inputs, and the cast-and-machine composition.
 *
 * Machining is the commodity where the geometry already did the work and the
 * model was still in the loop supplying labels for numbers it did not produce.
 * These tests pin the routing being built from the setup analysis instead, the
 * stock weight coming off the envelope instead of a flat x1.4, and the two caps
 * that stop a small part and a near-net part from being billed as if they were
 * cut from solid.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import {
  MACHINING_RULES, machiningOperationPlan, cuttingHours, stockFacts,
  principalDirections, isAxisymmetric,
} from '../src/engine/cost-input-rules/commodities/machining.js';
import {
  CAST_AND_MACHINE_RULES, finishMachiningHours, castAndMachineOperationPlan,
} from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import {
  PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/service-context.js';
import { pickMachiningCentreId } from '../src/engine/machine-sizing.js';
import { nearNetMachiningCeilingHr } from '../src/engine/near-net-machining.js';
import { RULE_SPECS, specForCommodity } from '../src/engine/cost-input-rules/index.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/**
 * The 25T servo horn from docs/cad-to-cost-learnings.md — 3 g of aluminium cut
 * from a small block, which the tool first billed 0.836 hr (~50 min) of cutting
 * and a £333 feature card against a manual ~£2.2.
 */
const SERVO_HORN = {
  status: 'success',
  partName: 'servo horn 25T',
  boundingBox: { xMm: 60, yMm: 20, zMm: 6 },
  volume: { mm3: 1_100, cm3: 1.1 },
  surfaceArea: { mm2: 5_500, cm2: 55 },
  fillRatio: 0.153,
  wallThickness: { minMm: 1.8, maxMm: 6, meanMm: 3, stdDevMm: 1, sampleCount: 120, method: 'ray_cast', uniformity: 'fair' },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 8, adequateDraftFaceCount: 112, analyzedFaceCount: 120 },
  setupAnalysis: {
    estimatedSetupCount: 3,
    principalDirections: [
      { directionLabel: '+Z', faceCount: 40 },
      { directionLabel: '-Z', faceCount: 30 },
      { directionLabel: '+X', faceCount: 26 },
    ],
  },
  cncCycleTimeEstimate: {
    setupTimeMins: 135, planarMillingTimeMins: 45.4, drillBoreTimeMins: 4.8,
    estimatedTotalMins: 50.2, estimatedTotalHrs: 0.836,
    assumedFeedRateMm2PerMin: 3000, assumedDrillBoreMinPerFeature: 0.4,
    assumedSetupTimeMinsPerSetup: 45,
  },
  features: { freeFormFaceCount: 24, planarFaceCount: 96, estimatedHoleCount: 12 },
  faces: { total: 120, byType: {} },
  featureTable: [{ kind: 'hole', diaMm: 2, depthMm: 6, through: true, count: 12 }],
} as unknown as OCCTGeometry;

/**
 * The RH steering knuckle — 2.8 kg of aluminium, cast then machined, manual
 * ~£16-18. Its from-solid cutting estimate of 0.9 hr is what made a comparable
 * stub axle come out at ~£116.
 */
const KNUCKLE = {
  status: 'success',
  partName: 'RH steering knuckle',
  boundingBox: { xMm: 220, yMm: 180, zMm: 140 },
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 120_000, cm2: 1200 },
  fillRatio: 0.187,
  wallThickness: { minMm: 6, maxMm: 22, meanMm: 11, stdDevMm: 4, sampleCount: 300, method: 'ray_cast', uniformity: 'fair' },
  draftAnalysis: { undercutFaceCount: 3, zeroDraftFaceCount: 5, adequateDraftFaceCount: 82, analyzedFaceCount: 90 },
  setupAnalysis: {
    estimatedSetupCount: 2,
    principalDirections: [
      { directionLabel: '+Z', faceCount: 30 },
      { directionLabel: '+Y', faceCount: 20 },
    ],
  },
  cncCycleTimeEstimate: {
    setupTimeMins: 90, planarMillingTimeMins: 50, drillBoreTimeMins: 4,
    estimatedTotalMins: 54, estimatedTotalHrs: 0.9,
    assumedFeedRateMm2PerMin: 3000, assumedDrillBoreMinPerFeature: 0.4,
    assumedSetupTimeMinsPerSetup: 45,
  },
  features: { freeFormFaceCount: 12, planarFaceCount: 50, estimatedHoleCount: 10 },
  faces: { total: 90, byType: {} },
  featureTable: [{ kind: 'hole', diaMm: 12, depthMm: 30, through: true, count: 10 }],
  toolingCostEstimates: {
    hpdcDieCostGBP: 118_000, gravityMouldCostGBP: 30_000, sandPatternCostGBP: 8_000,
    imMouldCostGBP: 45_000, forgeDieCostGBP: 70_000, progressiveDieCostGBP: 100_000,
  },
  processSpecificEstimates: {
    sandCycleTimeHr: 0.26, sandCycleTimeHrFerrous: 0.45, forgeStrokes: 6,
    investWaxCostGBP: 2, investShellCostGBP: 6,
  },
} as unknown as OCCTGeometry;

const AL = { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' };
const CAM_ANSWERS = {
  ...AL,
  [PRESSURE_TIGHT_DECISION_ID]: 'no',
  [TOLERANCE_CLASS_DECISION_ID]: 'standard',
  [SAFETY_CRITICAL_DECISION_ID]: 'yes',
};

const ctx = (
  geo: OCCTGeometry = SERVO_HORN,
  answers: Record<string, unknown> = {},
  over: Partial<RuleContext> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'machining', commoditySource: 'engineer',
  annualVolume: 20_000, filename: 'servo-horn-25t.step', answers, ...over,
});

const camCtx = (answers: Record<string, unknown> = {}): RuleContext => ({
  geo: KNUCKLE, geometryQuality: 'occt', commodity: 'cast_and_machine',
  commoditySource: 'engineer', annualVolume: 100_000,
  filename: 'rh-steering-knuckle.step', answers,
});

describe('stock weight', () => {
  it('measures the billet instead of assuming the part is 40% of it', () => {
    const s = stockFacts(ctx(), 'aluminium', 0.003)!;
    // 60 x 20 x 6 mm of aluminium is 19.4 g. The browser's flat net x 1.4 says
    // 4.2 g — it would buy a quarter of the metal this part is actually cut from.
    expect(s.stockKg).toBe(0.019);
    expect(s.utilisation).toBe(0.154);
    expect(s.clamped).toBe(false);
    expect(0.003 * 1.4).toBeCloseTo(0.0042, 4);
    expect(s.stockKg / 0.0042).toBeGreaterThan(4);
    expect(s.basis).toContain('60×20×6 mm solid billet');
  });

  it('clamps an implausible envelope rather than buying a block nobody cuts', () => {
    // A thin shell in a large box is not a machined billet — it is a moulded
    // part that has been routed here by mistake.
    const shell = {
      ...SERVO_HORN,
      boundingBox: { xMm: 1800, yMm: 500, zMm: 450 },
      volume: { mm3: 5_000_000, cm3: 5000 },
    } as unknown as OCCTGeometry;
    const s = stockFacts(ctx(shell), 'aluminium', 13.5)!;
    expect(s.clamped).toBe(true);
    expect(s.utilisation).toBe(0.05);
    expect(s.basis).toContain('Check the commodity');
  });
});

describe('cutting time', () => {
  it('caps a small part to what its stock envelope can physically give up', () => {
    const c = cuttingHours(ctx(), 'aluminium');
    // The bottom-up B-rep estimate was 0.836 hr of cutting on a 3 g part.
    expect(c.rawHours).toBe(0.836);
    expect(c.capped).toBe(true);
    expect(c.hours).toBe(0.151);
    expect(c.hours / c.rawHours!).toBeLessThan(0.2);
  });

  it('leaves a plausible estimate alone', () => {
    const c = cuttingHours({ ...ctx(KNUCKLE), commodity: 'machining' }, 'aluminium');
    expect(c.capped).toBe(false);
    expect(c.hours).toBe(0.9);
  });

  it('scales the ceiling with how hard the metal is to cut', () => {
    const al = cuttingHours(ctx(), 'aluminium');
    const ti = cuttingHours(ctx(), 'titanium');
    expect(ti.ceilingHr!).toBeCloseTo(al.ceilingHr! * 2.5, 4);
  });
});

describe('the routing', () => {
  it('builds one operation per approach direction plus the measured drilling', () => {
    const ops = machiningOperationPlan(ctx(), 'aluminium');
    expect(ops.map(o => o.name)).toEqual([
      'Milling — +Z (40 faces)',
      'Milling — -Z (30 faces)',
      'Milling — +X (26 faces)',
      'Drilling — 12 holes (12×Ø2.0×6) [geometry-measured]',
    ]);
    expect(ops[3].machineId).toBe('mach-drill');
  });

  it('apportions cutting time by face count and sums to the capped cycle', () => {
    const ops = machiningOperationPlan(ctx(), 'aluminium');
    const total = ops.reduce((s, o) => s + o.cycleTimeHr, 0);
    // 0.151 hr capped, less 0.08 hr of measured drilling, split 40/30/26.
    expect(ops[0].cycleTimeHr).toBe(0.0296);
    expect(ops[1].cycleTimeHr).toBe(0.0222);
    expect(ops[2].cycleTimeHr).toBe(0.0192);
    expect(ops[3].cycleTimeHr).toBe(0.08);
    expect(total).toBeCloseTo(0.151, 3);
    // Nothing is rescaled after the fact — the parts add up to the whole by
    // construction, which is what the AI-op-list-then-rescale path could not say.
    expect(ops[0].basis).toContain('40 of 96 faces');
  });

  it('does not let drilling swallow the whole cycle', () => {
    const allHoles = {
      ...SERVO_HORN,
      cncCycleTimeEstimate: { ...SERVO_HORN.cncCycleTimeEstimate!, drillBoreTimeMins: 600 },
    } as unknown as OCCTGeometry;
    const ops = machiningOperationPlan(ctx(allHoles), 'aluminium');
    const milling = ops.filter(o => o.type !== 'drilling').reduce((s, o) => s + o.cycleTimeHr, 0);
    expect(milling).toBeGreaterThan(0);
  });

  it('falls back to a single operation when there is no setup analysis', () => {
    const noSetup = { ...SERVO_HORN, setupAnalysis: null } as unknown as OCCTGeometry;
    const ops = machiningOperationPlan(ctx(noSetup), 'aluminium');
    expect(ops.filter(o => o.type !== 'drilling')).toHaveLength(1);
    expect(ops[0].basis).toContain('no setup analysis');
  });
});

describe('machine choice', () => {
  it('picks by capability, since the library has no size tiers for machining', () => {
    expect(pickMachiningCentreId({ principalDirections: 2, axisymmetric: false })).toBe('mach-vmc3');
    expect(pickMachiningCentreId({ principalDirections: 5, axisymmetric: false })).toBe('mach-vmc5');
    expect(pickMachiningCentreId({ principalDirections: 5, axisymmetric: true })).toBe('mach-lathe-cnc');
  });

  it('reads the approach directions off the geometry', () => {
    expect(principalDirections(ctx()).count).toBe(3);
    expect(isAxisymmetric(ctx())).toBe(false);          // 60 x 20 is not round
    const r = runCostInputRules(MACHINING_RULES, ctx(SERVO_HORN, AL));
    expect((r.suggestions.machining as Record<string, string>).machineId).toBe('mach-vmc3');
  });
});

describe('machining end to end', () => {
  it('asks which metal, because six of them can be machined', () => {
    const r = runCostInputRules(MACHINING_RULES, ctx(SERVO_HORN, {}, { filename: 'horn.step' }));
    expect(r.status).toBe('needs_decision');
    expect(r.decisions[0].id).toBe(MATERIAL_FAMILY_DECISION_ID);
  });

  it('fills the form once the metal is known', () => {
    const r = runCostInputRules(MACHINING_RULES, ctx(SERVO_HORN, AL));
    expect(r.status).toBe('complete');
    const m = r.suggestions.machining as Record<string, number | string>;
    expect(m.netWeightKg).toBe(0.003);
    expect(m.stockWeightKg).toBe(0.019);
    expect(m.materialUtilization).toBe(0.154);
    expect(m.estimatedCycleTimeHr).toBe(0.151);
    expect(m.setupCount).toBe(3);
    expect(m.setupTimeHr).toBe(2.25);                    // 3 × 45 min
    expect(m.operationCount).toBe(4);
    expect(r.provenance['mach-net-wt'].source).toBe('geometry');
  });

  it('says on the record when it capped the cycle', () => {
    const r = runCostInputRules(MACHINING_RULES, ctx(SERVO_HORN, AL));
    const basis = r.provenance['mach-net-wt'].basis;
    expect(basis).toContain('aluminium');
    const cycle = r.decisions.length === 0
      ? renderCommodityRulesPrompt(MACHINING_RULES, ctx(SERVO_HORN, AL))
      : '';
    expect(cycle).toContain('capped at');
  });
});

describe('cast_and_machine — the composition', () => {
  it('joins both specs without losing a rule', () => {
    const castingIds = CASTING_RULES.rules.map(r => r.id);
    const camIds = CAST_AND_MACHINE_RULES.rules.map(r => r.id);
    for (const id of castingIds) expect(camIds, `casting rule ${id} survived`).toContain(id);
    expect(camIds).toContain('castAndMachine.machiningCycleTimeHr');
    expect(camIds).toContain('machining.machineId');
    // ...and drops the machining rules the casting half already owns.
    expect(camIds).not.toContain('machining.stockWeightKg');
    expect(camIds).not.toContain('machining.netWeightKg');
    expect(new Set(camIds).size).toBe(camIds.length);   // no duplicate ids
  });

  it('re-labels every field it keeps onto the combined form', () => {
    for (const r of CAST_AND_MACHINE_RULES.rules) {
      if (!r.fieldId) continue;
      expect(r.fieldId, `${r.id} field id`).toMatch(/^cam-/);
    }
    // The renaming is irregular, which is why the map is explicit: `cast-part-wt`
    // becomes `cam-cast-wt`, and `cast-hpdc-ct` drops its prefix rather than
    // gaining one.
    const byId = Object.fromEntries(CAST_AND_MACHINE_RULES.rules.map(r => [r.id, r.fieldId]));
    expect(byId['casting.netWeightKg']).toBe('cam-cast-wt');
    expect(byId['casting.cycleTimeHpdcSec']).toBe('cam-hpdc-ct');
  });

  it('caps the knuckle to the near-net finish envelope', () => {
    const f = finishMachiningHours(camCtx(CAM_ANSWERS))!;
    // 0.10 hr setup + 0.07 hr/kg on 2.8 kg = 0.296 hr. The from-solid estimate
    // was 0.9 hr — three times the finish machining a casting actually needs,
    // and the reason a comparable stub axle came out at ~£116 against ~£30.
    expect(f.rawHours).toBe(0.9);
    expect(f.capped).toBe(true);
    expect(f.hours).toBe(0.296);
    expect(f.ceilingHr).toBeCloseTo(nearNetMachiningCeilingHr(2.8), 4);
    expect(f.rawHours / f.hours).toBeCloseTo(3.04, 1);
  });

  it('scales the routing down with the cap so the two agree', () => {
    const ops = castAndMachineOperationPlan(camCtx(CAM_ANSWERS));
    const total = ops.reduce((s, o) => s + o.cycleTimeHr, 0);
    expect(total).toBeCloseTo(0.296, 3);
    expect(ops.every(o => o.basis.includes('scaled to the near-net finish envelope'))).toBe(true);
  });

  it('costs a knuckle end to end once its four questions are answered', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, camCtx(CAM_ANSWERS));
    expect(r.status).toBe('complete');
    const casting = r.suggestions.casting as Record<string, number | string>;
    const machining = r.suggestions.machining as Record<string, number | string>;
    expect(casting.netWeightKg).toBe(2.8);
    expect(machining.estimatedCycleTimeHr).toBe(0.296);
    expect(machining.setupTimeHr).toBe(1.5);            // 2 setups × 45 min
    expect(r.provenance['cam-cast-wt']).toBeDefined();
    expect(r.provenance['cam-mach-setup-time']).toBeDefined();
  });

  it('asks the casting questions, not a second set of its own', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, camCtx({}));
    expect(r.status).toBe('needs_decision');
    expect(r.decisions.map(d => d.id)).toEqual([MATERIAL_FAMILY_DECISION_ID]);
  });
});

describe('the registry', () => {
  it('resolves every converted commodity, and nothing else', () => {
    expect(Object.keys(RULE_SPECS).sort()).toEqual([
      'blow_moulding', 'cast_and_machine', 'casting', 'composites', 'forging',
      'injection_moulding', 'machining', 'rotational_moulding', 'rubber',
      'sheet_metal', 'sheet_metal_fab', 'thermoforming',
    ]);
    expect(specForCommodity('machining')).toBe(MACHINING_RULES);
    // Extrusion, painting, BIW, PCB and harness still take their inputs from
    // the model — the registry says so rather than pretending otherwise.
    expect(specForCommodity('extrusion')).toBeNull();
  });

  it('gives sheet-metal fabrication the same measured blank', () => {
    expect(specForCommodity('sheet_metal_fab')).toBe(specForCommodity('sheet_metal'));
  });
});

describe('the prompt cannot say anything the engine would not compute', () => {
  it('renders every machining value with its own basis attached', () => {
    const c = ctx(SERVO_HORN, AL);
    const text = renderCommodityRulesPrompt(MACHINING_RULES, c);
    for (const rule of MACHINING_RULES.rules) {
      const out = rule.evaluate(c);
      expect(out.ok, `${rule.id} should be decided`).toBe(true);
      if (!out.ok) continue;
      const line = text.split('\n').find(l => l.trim().startsWith(`${rule.label}=`));
      expect(line, `no rendered line for ${rule.label}`).toBeDefined();
      expect(line).toContain(String(out.decided.value));
      expect(line).toContain(out.decided.basis);
    }
  });
});

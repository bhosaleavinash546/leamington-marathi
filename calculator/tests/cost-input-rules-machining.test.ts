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
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import {
  PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/service-context.js';
import { pickMachiningCentreId } from '../src/engine/machine-sizing.js';
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
    // Kernel-true semantics: estimatedTotal INCLUDES the setup allowance
    // (total = setup + mill + drill). The original fixture had setup 135 min
    // against a 50.2 min "total", which is impossible from the real kernel —
    // and it hid the setup double-count that inflated small parts +186%.
    setupTimeMins: 135, planarMillingTimeMins: 45.36, drillBoreTimeMins: 4.8,
    estimatedTotalMins: 185.16, estimatedTotalHrs: 3.086,
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
    estimatedTotalMins: 144, estimatedTotalHrs: 2.4,
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
  it('buys a stocked plate, not the finished part\'s bounding box', () => {
    const s = stockFacts(ctx(), 'aluminium', 0.003)!;
    // 60 × 20 × 6 mm part: 68 × 25 mm sawn from 8 mm plate (2.5 mm a side to
    // square the edges, a 3 mm saw cut, 1 mm skim a face → next stocked
    // thickness). 13.6 cm³ = 37 g. The bounding box alone (7.2 cm³) is a block
    // nobody can buy; the old browser net × 1.4 (4.2 g) a quarter of even that.
    expect(s.stockKg).toBe(0.037);
    expect(s.utilisation).toBe(0.082);
    expect(s.clamped).toBe(false);
    expect(s.basis).toContain('cut from 8 mm plate');
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

describe('cutting time — the measured build-up, not the kernel\'s area rate', () => {
  it('times a small part by the metal it removes and the area it finishes', () => {
    const c = cuttingHours(ctx(), 'aluminium');
    // The kernel billed 0.836 hr (50 min) on a 3 g part; the old cap 0.095 hr.
    // Built up: rough 13 cm³ at 120 cm³/min, finish 40 cm² at 40 cm²/min,
    // surface 10 cm² at 10 cm²/min, 12 micro-holes, 5 tools.
    expect(c.rawHours).toBeCloseTo(0.836, 3);
    expect(c.hours).toBe(0.0605);
    expect(c.cut!.detail.basis).toContain('rough 13 cm³ ÷ 120 cm³/min');
  });

  it('a large part removes a lot of metal, and that takes time', () => {
    // The 220 × 180 × 140 mm knuckle cut from solid: 5.3 dm³ of aluminium to
    // rough out. The kernel's 0.9 hr never looked at it.
    const c = cuttingHours({ ...ctx(KNUCKLE), commodity: 'machining' }, 'aluminium');
    expect(c.hours).toBeCloseTo(1.41, 2);
    expect(c.cut!.detail.roughMin).toBeCloseTo(44.1, 1);
  });

  it('a harder metal cuts slower', () => {
    const al = cuttingHours(ctx(), 'aluminium');
    const ti = cuttingHours(ctx(), 'titanium');
    expect(ti.hours / al.hours).toBeGreaterThan(3);
  });
});

describe('the routing', () => {
  it('one operation per approach direction, the measured drilling, handling and the bench deburr', () => {
    const ops = machiningOperationPlan(ctx(), 'aluminium');
    expect(ops.map(o => o.name)).toEqual([
      'Milling — +Z (40 faces)',
      'Milling — -Z (30 faces)',
      'Milling — +X (26 faces)',
      'Drilling — 12 holes (12×Ø2.0×6) [geometry-measured]',
      'Load / clamp / unload — 4 fixturing(s)',
      'Deburr and gauge check (bench)',
    ]);
    expect(ops[3].machineId).toBe('mach-drill');
    expect(ops[5].benchOperation).toBe(true);
  });

  it('apportions milling by face count; each op states its crew', () => {
    const ops = machiningOperationPlan(ctx(), 'aluminium');
    expect(ops[0].cycleTimeHr).toBe(0.0182);
    expect(ops[1].cycleTimeHr).toBe(0.0136);
    expect(ops[2].cycleTimeHr).toBe(0.0118);
    expect(ops[3].cycleTimeHr).toBe(0.0168);
    expect(ops[0].basis).toContain('40 of 96 faces');
    // One operator tends two machines while they cut; loading takes a whole one.
    expect(ops[0].manning).toBe(0.5);
    expect(ops[4].manning).toBe(1);
    expect(ops[4].cycleTimeHr).toBe(0.02);              // 4 × 0.3 min for a 37 g blank
  });

  it('falls back to a single milling operation when there is no setup analysis', () => {
    const noSetup = { ...SERVO_HORN, setupAnalysis: null } as unknown as OCCTGeometry;
    const ops = machiningOperationPlan(ctx(noSetup), 'aluminium');
    expect(ops.filter(o => o.type !== 'drilling' && !o.benchOperation && !o.name.startsWith('Load'))).toHaveLength(1);
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
    // The routing optimiser reaches the CHEAPER capable 3-axis machine: the
    // 60x20x6 horn fits a HAAS VF-2 (£45/hr), which the £55/hr generic VMC
    // ladder could never select. Split routing wins over 5-axis consolidation
    // at this batch (see routing-optimiser.test.ts for the arithmetic).
    expect((r.suggestions.machining as Record<string, string>).machineId).toBe('mach-haas-vf2');
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
    expect(m.stockWeightKg).toBe(0.037);
    expect(m.materialUtilization).toBe(0.082);
    expect(m.estimatedCycleTimeHr).toBe(0.0804);          // cutting + handling, machine time
    // Setups follow the chosen split routing: 3 milling fixturings (one per
    // approach direction) + 1 drill-press fixturing for the drilling op.
    expect(m.setupCount).toBe(4);
    expect(m.setupTimeHr).toBe(3);                       // 4 × 45 min change-over
    expect(m.operationCount).toBe(6);
    expect(m.batchSize).toBe(1000);                      // 20,000 / 20
    expect(m.rejectRate).toBe(0.02);
    expect(m.toolingCost).toBe(10_000);                  // 4 dedicated fixtures (100k parts over 5 years)
    expect(m.programmingNRE).toBe(353);
    expect(m.toolWearCostPerPart).toBe(0.145);
    expect(r.provenance['mach-net-wt'].source).toBe('geometry');
  });

  it('says on the record what the kernel claimed, and that it was not used', () => {
    const r = runCostInputRules(MACHINING_RULES, ctx(SERVO_HORN, AL));
    const basis = r.provenance['mach-net-wt'].basis;
    expect(basis).toContain('aluminium');
    const text = renderCommodityRulesPrompt(MACHINING_RULES, ctx(SERVO_HORN, AL));
    expect(text).toContain("the kernel's planar-area rate said 50.2 min (not used)");
  });
});

describe('cast_and_machine — the composition', () => {
  it('joins both specs without losing a rule', () => {
    const castingIds = CASTING_RULES.rules.map(r => r.id);
    const camIds = CAST_AND_MACHINE_RULES.rules.map(r => r.id);
    for (const id of castingIds) expect(camIds, `casting rule ${id} survived`).toContain(id);
    expect(camIds).toContain('machining.estimatedCycleTimeHr');
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
    // The STEP's weight is the FINISHED weight; the as-cast weight adds the
    // drilled-hole stock (casting review, second pass).
    expect(byId['casting.netWeightKg']).toBe('cam-finish-wt');
    expect(byId['castAndMachine.castPartWeightKg']).toBe('cam-cast-wt');
    expect(byId['casting.cycleTimeHpdcSec']).toBe('cam-hpdc-ct');
  });

  it('the machining half is the machining rule set on a near-net cut', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, camCtx(CAM_ANSWERS));
    expect(r.status).toBe('complete');
    const casting = r.suggestions.casting as Record<string, number | string>;
    const machining = r.suggestions.machining as Record<string, unknown>;
    expect(casting.netWeightKg).toBe(2.8);
    // Near-net: the holes (no face table on this fixture), nothing roughed —
    // 10 × Ø12 × 30 drilled from solid, 2.3 min, not a capped from-solid cycle.
    const ops = machining.operations as Array<{ name: string; cycleTimeHr: number }>;
    expect(ops.find(o => o.name.startsWith('Drilling'))!.cycleTimeHr).toBe(0.0375);
    // 2 datum directions + the drill-press fixturing of the chosen split routing.
    expect(machining.setupCount).toBe(3);
    expect(machining.setupTimeHr).toBe(2.25);           // 3 × 45 min
    expect(r.provenance['cam-cast-wt']).toBeDefined();
    expect(r.provenance['cam-mach-setup-time']).toBeDefined();
    expect(r.provenance['cam-mach-tooling']).toBeDefined();
    expect(r.provenance['cam-tool-wear']).toBeDefined();
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
      'aluminium_extrusion', 'blow_moulding', 'cast_and_machine', 'casting', 'composites', 'extrusion', 'forging',
      'gear', 'injection_moulding', 'machining', 'rotational_moulding', 'rubber',
      'sheet_metal', 'sheet_metal_fab', 'thermoforming',
    ]);
    expect(specForCommodity('machining')).toBe(MACHINING_RULES);
    // Painting, BIW, PCB and harness still take their inputs from the model —
    // the registry says so rather than pretending otherwise. (Extrusion was
    // converted in the extrusion build.)
    expect(specForCommodity('painting')).toBeNull();
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
      // The operations rule decides a STRUCTURED plan; its promptLine renders
      // the summary prose, so value-containment is asserted via the basis only.
      if (rule.id !== 'machining.operations') expect(line).toContain(String(out.decided.value));
      expect(line).toContain(out.decided.basis);
    }
  });
});

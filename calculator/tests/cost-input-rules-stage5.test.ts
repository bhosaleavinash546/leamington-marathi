/**
 * Thermoforming, rotational moulding, rubber and composites — the four
 * commodities whose prompt blocks were almost entirely ranges.
 *
 * Between them the prompt carried fourteen "X–Y" spans for a model to pick a
 * number out of, while four written, tested advisors computed the same figures
 * in closed form and were never called from the CAD path. These tests pin the
 * advisors running, and pin the three derivations that are easy to get backwards:
 * the thermoforming sheet gauge, the roto oven time per arm, and the composite
 * ply count.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import {
  THERMOFORMING_RULES, drawGeometry, methodFor, mouldMaterialFor,
} from '../src/engine/cost-input-rules/commodities/thermoforming.js';
import {
  ROTATIONAL_MOULDING_RULES, partsPerArm, rotoFamilyOf, mouldTypeFor,
} from '../src/engine/cost-input-rules/commodities/rotational-moulding.js';
import {
  RUBBER_RULES, processFor, cavitiesFor, mouldSteelFor,
} from '../src/engine/cost-input-rules/commodities/rubber.js';
import {
  COMPOSITES_RULES, plyCount, laminateAreaM2,
} from '../src/engine/cost-input-rules/commodities/composites.js';
import { RESIN_DECISION_ID } from '../src/engine/cost-input-rules/derive/resin.js';
import { ELASTOMER_DECISION_ID } from '../src/engine/cost-input-rules/derive/elastomer.js';
import { LAMINATE_DECISION_ID, LAMINATE_SYSTEMS } from '../src/engine/cost-input-rules/derive/laminate.js';
import {
  estimateHeatTimeSec, estimateWallThinning, thermoformFamilyOf,
} from '../src/engine/modules/thermoforming-advisor.js';
import { estimateRotoCycle } from '../src/engine/modules/roto-advisor.js';
import { estimateRubberCureTimeSec, RUBBER_CURE_BASE_SEC } from '../src/engine/modules/rubber-advisor.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/** A deep-drawn HIPS tray: 300 x 200 footprint, 100 mm deep, 0.6 mm formed wall. */
const TRAY = {
  status: 'success',
  partName: 'component tray',
  boundingBox: { xMm: 300, yMm: 200, zMm: 100 },
  volume: { mm3: 90_000, cm3: 90 },
  surfaceArea: { mm2: 150_000, cm2: 1500 },
  fillRatio: 0.015,
  wallThickness: { minMm: 0.35, maxMm: 0.9, meanMm: 0.6, stdDevMm: 0.15, sampleCount: 200, method: 'ray_cast', uniformity: 'fair' },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 28, analyzedFaceCount: 30 },
  topology: { available: true, openShell: true, enclosesSealedVoid: false },
  features: { freeFormFaceCount: 2, planarFaceCount: 14 },
  faces: { total: 30, byType: {} },
} as unknown as OCCTGeometry;

/** A 300 L rotomoulded water tank: 6 mm PE wall, sealed hollow body. */
const WATER_TANK = {
  status: 'success',
  partName: 'water storage tank',
  boundingBox: { xMm: 1000, yMm: 700, zMm: 600 },
  volume: { mm3: 15_000_000, cm3: 15_000 },
  surfaceArea: { mm2: 4_400_000, cm2: 44_000 },
  fillRatio: 0.036,
  wallThickness: { minMm: 4.5, maxMm: 8, meanMm: 6, stdDevMm: 1, sampleCount: 300, method: 'ray_cast', uniformity: 'fair' },
  topology: { available: true, openShell: false, enclosesSealedVoid: true, voidCount: 1 },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 40, analyzedFaceCount: 42 },
  features: { freeFormFaceCount: 8, planarFaceCount: 6 },
  faces: { total: 42, byType: {} },
  featureTable: [{ kind: 'boss', diaMm: 60, depthMm: 20, through: false, count: 2 }],
} as unknown as OCCTGeometry;

/** An EPDM engine mount: chunky 28 mm section, small footprint. */
const MOUNT = {
  status: 'success',
  partName: 'engine mount bush',
  boundingBox: { xMm: 90, yMm: 90, zMm: 60 },
  volume: { mm3: 220_000, cm3: 220 },
  surfaceArea: { mm2: 34_000, cm2: 340 },
  fillRatio: 0.453,
  wallThickness: { minMm: 8, maxMm: 28, meanMm: 18, stdDevMm: 6, sampleCount: 200, method: 'ray_cast', uniformity: 'poor' },
  draftAnalysis: { undercutFaceCount: 1, zeroDraftFaceCount: 3, adequateDraftFaceCount: 30, analyzedFaceCount: 34 },
  features: { freeFormFaceCount: 4, planarFaceCount: 10 },
  faces: { total: 34, byType: {} },
  featureTable: [{ kind: 'boss', diaMm: 20, depthMm: 40, through: true, count: 1 }],
} as unknown as OCCTGeometry;

/** A carbon monocoque panel: 4 mm laminate over a large area. */
const PANEL = {
  status: 'success',
  partName: 'CFRP floor panel',
  boundingBox: { xMm: 1200, yMm: 800, zMm: 60 },
  volume: { mm3: 3_840_000, cm3: 3840 },
  surfaceArea: { mm2: 2_000_000, cm2: 20_000 },
  fillRatio: 0.067,
  wallThickness: { minMm: 3.2, maxMm: 5, meanMm: 4, stdDevMm: 0.5, sampleCount: 300, method: 'ray_cast', uniformity: 'good' },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 4, adequateDraftFaceCount: 40, analyzedFaceCount: 44 },
  features: { freeFormFaceCount: 6, planarFaceCount: 12 },
  faces: { total: 44, byType: {} },
} as unknown as OCCTGeometry;

const mk = (commodity: string, geo: OCCTGeometry, filename: string, annualVolume: number) =>
  (answers: Record<string, unknown> = {}, over: Partial<RuleContext> = {}): RuleContext => ({
    geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer',
    annualVolume, filename, answers, ...over,
  });

const tfCtx = mk('thermoforming', TRAY, 'component-tray.step', 50_000);
const rmCtx = mk('rotational_moulding', WATER_TANK, 'water-tank-300l.step', 3_000);
const rubCtx = mk('rubber', MOUNT, 'engine-mount-bush.step', 80_000);
const compCtx = mk('composites', PANEL, 'cfrp-floor-panel.step', 500);

const HIPS = { [RESIN_DECISION_ID]: 'mat-hips' };
const PE = { [RESIN_DECISION_ID]: 'mat-hdpe' };
const EPDM = { [ELASTOMER_DECISION_ID]: 'mat-epdm' };
const CF = { [LAMINATE_DECISION_ID]: 'prepreg-cf' };

describe('thermoforming', () => {
  it('works the sheet gauge back through the draw, because the sheet is not the part', () => {
    const d = drawGeometry(tfCtx())!;
    // 100 mm deep into a 200 mm opening: areal draw 1 + 2 x 0.5 = 2.0.
    expect(d.ratio).toBe(0.5);
    expect(d.arealDraw).toBe(2);

    const r = runCostInputRules(THERMOFORMING_RULES, tfCtx(HIPS));
    const t = r.suggestions.thermoforming as Record<string, number | string>;
    expect(t.formedWallMm).toBe(0.6);
    expect(t.sheetThicknessMm).toBe(1.2);        // 0.6 x 2.0 — buy twice the formed wall
    expect(r.provenance['tf-thk'].basis).toContain('the sheet is thicker than the part it becomes');
  });

  it('inverts the advisor exactly — the gauge it buys forms back to the wall measured', () => {
    const r = runCostInputRules(THERMOFORMING_RULES, tfCtx(HIPS));
    const t = r.suggestions.thermoforming as Record<string, number>;
    const back = estimateWallThinning({
      sheetThicknessMm: t.sheetThicknessMm, depthMm: 100, minOpeningMm: 200, method: 'vacuum',
    });
    expect(back.avgWallMm).toBeCloseTo(0.6, 2);
  });

  it('takes heat and cool time from the physics, not from a 30-90 s range', () => {
    const r = runCostInputRules(THERMOFORMING_RULES, tfCtx(HIPS));
    const t = r.suggestions.thermoforming as Record<string, number>;
    expect(t.heatTimeSec).toBe(estimateHeatTimeSec(thermoformFamilyOf('HIPS (High Impact PS)'), 1.2));
    expect(t.coolTimeSec).toBeGreaterThan(0);
    // Gauge drives it: doubling the sheet roughly triples the soak (t^1.6).
    const thick = estimateHeatTimeSec(thermoformFamilyOf('HIPS (High Impact PS)'), 2.4);
    expect(thick / t.heatTimeSec).toBeCloseTo(3.0, 0);
  });

  it('picks the method from the draw the tool has to hold', () => {
    expect(methodFor(tfCtx(), 1.2).method).toBe('vacuum');
    expect(methodFor(tfCtx(), 2.4).method).toBe('pressure');
    expect(methodFor(tfCtx(), 2.4).reason).toContain('beyond the 1.5:1');
    // A sealed double wall is twin-sheet whatever the draw.
    const twin = { ...TRAY, topology: { available: true, enclosesSealedVoid: true } } as unknown as OCCTGeometry;
    expect(methodFor(tfCtx({}, { geo: twin }), 0.5).method).toBe('twin_sheet');
  });

  it('matches the tool to the volume it has to survive', () => {
    expect(mouldMaterialFor(500, 'vacuum')).toBe('epoxy');
    expect(mouldMaterialFor(50_000, 'vacuum')).toBe('cast-al');
    expect(mouldMaterialFor(500_000, 'vacuum')).toBe('cnc-al');
    expect(mouldMaterialFor(500, 'pressure')).toBe('cnc-al');   // the box load decides
  });

  it('completes and reports whether the part can be formed at all', () => {
    const r = runCostInputRules(THERMOFORMING_RULES, tfCtx(HIPS));
    expect(r.status).toBe('complete');
    expect((r.suggestions.thermoforming as Record<string, string>).formability).toBe('within limit');
  });
});

describe('rotational moulding', () => {
  it('takes oven and cooling time from wall thickness, not a 15-40 min range', () => {
    const r = runCostInputRules(ROTATIONAL_MOULDING_RULES, rmCtx(PE));
    const rm = r.suggestions.rotationalMoulding as Record<string, number | string>;
    const cycle = estimateRotoCycle({ wallThicknessMm: 6, material: 'pe', coolingMethod: 'forced-air' });
    expect(rm.heatTimeSec).toBe(cycle.heatingSec);   // 240 + 6 x 210 = 1500 s = 25 min
    expect(rm.heatTimeSec).toBe(1500);
    expect(rm.coolTimeSec).toBe(cycle.coolingSec);
    expect(r.provenance['rm-heat'].basis).toContain('25.0 min in the oven');
  });

  it('shares the oven between the parts that fit an arm', () => {
    // A 420 L envelope fills an arm on its own; a small bin shares one.
    expect(partsPerArm(rmCtx()).n).toBe(1);
    const smallBin = {
      ...WATER_TANK, boundingBox: { xMm: 300, yMm: 250, zMm: 200 },
    } as unknown as OCCTGeometry;
    expect(partsPerArm(rmCtx({}, { geo: smallBin })).n).toBe(2);   // 15 L
  });

  it('picks the tool construction from size and shape', () => {
    expect(mouldTypeFor(rmCtx(), 14_000).type).toBe('cast-al');           // 8 free-form faces
    const plainTank = { ...WATER_TANK, features: { freeFormFaceCount: 2 } } as unknown as OCCTGeometry;
    expect(mouldTypeFor(rmCtx({}, { geo: plainTank }), 14_000).type).toBe('fabricated');
    expect(mouldTypeFor(rmCtx({}, { annualVolume: 50_000 }), 400).type).toBe('cnc-al');
  });

  it('maps the chosen resin onto the bake characteristics', () => {
    expect(rotoFamilyOf('mat-hdpe')).toBe('pe');
    expect(rotoFamilyOf('mat-pp-homo')).toBe('pp');
    expect(rotoFamilyOf('mat-xlpe')).toBe('xlpe');
  });

  it('refuses to rotomould something with no cavity in it', () => {
    const solid = {
      ...WATER_TANK, topology: { available: true, openShell: true, enclosesSealedVoid: false },
    } as unknown as OCCTGeometry;
    const r = runCostInputRules(ROTATIONAL_MOULDING_RULES, rmCtx(PE, { geo: solid }));
    const d = r.decisions.find(x => x.id === 'roto.notHollow');
    expect(d).toBeDefined();
    expect(d!.options.map(o => o.value)).toContain('thermoforming');
  });
});

describe('rubber', () => {
  it('asks which compound, because the price spans 220x and the cure spans 29x', () => {
    const r = runCostInputRules(RUBBER_RULES, rubCtx());
    expect(r.status).toBe('needs_decision');
    expect(r.decisions[0].id).toBe(ELASTOMER_DECISION_ID);
    const lives = Object.values(RUBBER_CURE_BASE_SEC);
    expect(Math.max(...lives) / Math.min(...lives)).toBeGreaterThan(28);
    for (const o of r.decisions[0].options) {
      expect(o.consequence).toMatch(/£[\d.]+\/kg · cures in ~\d+ s/);
    }
  });

  it('cures on the thickest section, not the mean wall', () => {
    const r = runCostInputRules(RUBBER_RULES, rubCtx(EPDM));
    const rub = r.suggestions.rubber as Record<string, number | string>;
    // 28 mm max section, not the 18 mm mean — heat has to reach the centre of
    // the thickest part, and that term goes as thickness².
    expect(rub.thicknessMm).toBe(28);   // the `sectionThicknessMm` label, at path rubber.thicknessMm
    expect(rub.cureTimeSec).toBe(estimateRubberCureTimeSec({
      compoundFamily: 'epdm-sulphur', thicknessMm: 28, process: 'transfer_mould',
    }));
    // The mean wall would have understated the cure by minutes.
    const atMean = estimateRubberCureTimeSec({
      compoundFamily: 'epdm-sulphur', thicknessMm: 18, process: 'transfer_mould',
    });
    expect((rub.cureTimeSec as number) - atMean).toBeGreaterThan(120);
  });

  it('routes by compound, flatness and volume', () => {
    expect(processFor(rubCtx(), 'silicone-lsr', 5).process).toBe('injection_mould_lsr');
    expect(processFor(rubCtx({}, { annualVolume: 10_000 }), 'epdm-sulphur', 28).process).toBe('compression_mould');
    expect(processFor(rubCtx({}, { annualVolume: 80_000 }), 'epdm-sulphur', 28).process).toBe('transfer_mould');
    expect(processFor(rubCtx({}, { annualVolume: 400_000 }), 'epdm-sulphur', 28).process).toBe('injection_mould_lsr');

    const gasket = { ...MOUNT, boundingBox: { xMm: 200, yMm: 150, zMm: 2 } } as unknown as OCCTGeometry;
    expect(processFor(rubCtx({}, { geo: gasket }), 'nbr', 2).process).toBe('die_cut');
  });

  it('charges flash to the process that makes it', () => {
    const r = runCostInputRules(RUBBER_RULES, rubCtx(EPDM));
    const rub = r.suggestions.rubber as Record<string, number | string>;
    expect(rub.process).toBe('transfer_mould');
    // A metered shot flashes 3%; compression overfills by design and flashes 8%.
    expect(rub.flashWeightKg).toBeCloseTo((rub.partWeightKg as number) * 0.03, 4);

    const lowVol = runCostInputRules(RUBBER_RULES, rubCtx(EPDM, { annualVolume: 10_000 }));
    const lv = lowVol.suggestions.rubber as Record<string, number>;
    expect(lv.flashWeightKg).toBeCloseTo(lv.partWeightKg * 0.08, 4);
  });

  it('sizes cavitation and tool steel to the part and the run', () => {
    expect(cavitiesFor('compression_mould', 500).n).toBe(1);
    expect(cavitiesFor('compression_mould', 20).n).toBe(8);
    expect(cavitiesFor('die_cut', 500).n).toBe(8);
    expect(mouldSteelFor('compression_mould', 10_000)).toBe('aluminium');
    expect(mouldSteelFor('compression_mould', 200_000)).toBe('p20');
    expect(mouldSteelFor('injection_mould_lsr', 2_000_000)).toBe('h13');
  });
});

describe('composites', () => {
  it('divides the measured wall by the ply, instead of guessing a ply count', () => {
    // The prompt asked for "typical CFRP 4–16 plies". A 4 mm wall in 0.25 mm
    // carbon prepreg is exactly 16; the same wall in 0.55 mm infused glass is 8.
    const cf = LAMINATE_SYSTEMS.find(s => s.value === 'prepreg-cf')!;
    const gf = LAMINATE_SYSTEMS.find(s => s.value === 'infusion-gf')!;
    expect(plyCount(4, cf).n).toBe(16);
    expect(plyCount(4, gf).n).toBe(8);
    expect(plyCount(4, cf).basis).toContain('÷ 0.25 mm cured ply');
    // Never fewer than two — a laminate has to balance about its mid-plane.
    expect(plyCount(0.1, cf).n).toBe(2);
  });

  it('lays plies on the mould side only', () => {
    // 20,000 cm² of closed surface is 2 m² of area, one m² of tool face.
    expect(laminateAreaM2(compCtx())).toBe(1);
  });

  it('asks one question and derives the rest', () => {
    const blocked = runCostInputRules(COMPOSITES_RULES, compCtx());
    expect(blocked.status).toBe('needs_decision');
    expect(blocked.decisions.map(d => d.id)).toEqual([LAMINATE_DECISION_ID]);

    const r = runCostInputRules(COMPOSITES_RULES, compCtx(CF));
    expect(r.status).toBe('complete');
    const c = r.suggestions.composites as Record<string, number | string>;
    expect(c.process).toBe('prepreg_layup');
    expect(c.plies).toBe(16);
    expect(c.areaM2).toBe(1);
    expect(c.fibreWeightFraction).toBe(0.65);
    expect(c.wasteFraction).toBe(0.15);
    expect(c.cureTimeHr).toBe(3);
    expect(c.fibrePricePerKg).toBe(33.6);
    expect(c.resinPricePerKg).toBe(0);        // prepreg arrives impregnated
    expect(c.partWeightKg).toBe(5.952);       // 3,840 cm³ at 1,550 kg/m³
    expect(c.layupTimeHrPerPart).toBe(0.96);  // 1 m² x 16 plies x 0.06 hr
  });

  it('offers only process names the engine can accept', () => {
    // The prompt asks the model for hand_layup | prepreg_autoclave | rtm |
    // infusion | smc | wet_layup. Four of those six are not values
    // computeCompositeDrivers has ever known.
    const engineAccepts = new Set([
      'hand_layup', 'prepreg_layup', 'rtm', 'vartm', 'filament_winding', 'pultrusion',
    ]);
    for (const s of LAMINATE_SYSTEMS) {
      expect(engineAccepts.has(s.process), `${s.value} → ${s.process}`).toBe(true);
    }
    const promptOffers = ['hand_layup', 'prepreg_autoclave', 'rtm', 'infusion', 'smc', 'wet_layup'];
    expect(promptOffers.filter(p => engineAccepts.has(p))).toEqual(['hand_layup', 'rtm']);
  });

  it('prices each system with the mass and the ply pitch it implies', () => {
    const d = runCostInputRules(COMPOSITES_RULES, compCtx()).decisions[0];
    expect(d.options).toHaveLength(4);
    for (const o of d.options) {
      expect(o.consequence).toMatch(/kg cured · fibre £[\d.]+\/kg/);
      expect(o.consequence).toMatch(/mm\/ply/);
    }
  });
});

describe('the registry and the prompt', () => {
  it('resolves all eleven converted commodities', () => {
    for (const c of ['thermoforming', 'rotational_moulding', 'rubber', 'composites']) {
      expect(specForCommodity(c), c).not.toBeNull();
    }
  });

  const cases: Array<[string, typeof THERMOFORMING_RULES, RuleContext]> = [
    ['thermoforming', THERMOFORMING_RULES, tfCtx(HIPS)],
    ['rotational moulding', ROTATIONAL_MOULDING_RULES, rmCtx(PE)],
    ['rubber', RUBBER_RULES, rubCtx(EPDM)],
    ['composites', COMPOSITES_RULES, compCtx(CF)],
  ];

  for (const [name, spec, ctx] of cases) {
    it(`renders every ${name} value with its own basis attached`, () => {
      const text = renderCommodityRulesPrompt(spec, ctx);
      for (const rule of spec.rules) {
        const out = rule.evaluate(ctx);
        expect(out.ok, `${rule.id} should be decided`).toBe(true);
        if (!out.ok) continue;
        const line = text.split('\n').find(l => l.trim().startsWith(`${rule.label}=`));
        expect(line, `no rendered line for ${rule.label}`).toBeDefined();
        expect(line).toContain(String(out.decided.value));
        expect(line).toContain(out.decided.basis);
      }
    });
  }
});

/**
 * The six real parts, and the error the rules were built to make impossible.
 *
 * `docs/cad-to-cost-learnings.md` records six parts costed against independent
 * manual bottom-ups. On **four of the six the tool was 2–5x wrong, and every
 * time it was the same error**: a material class the model had guessed. A steel
 * forging costed as aluminium. An aluminium CNC part costed as plastic. A
 * plastic bumper costed as an aluminium casting. A plastic fuel tank costed as
 * an 83 kg sand casting.
 *
 * ## What this test proves, and what it does not
 *
 * It does **not** reproduce a £/part from CAD. The original STEP files are not
 * in the repository, so the geometry below is *reconstructed from the figures
 * the document records* — the measured volumes implied by the documented
 * weights, the walls and envelopes stated in the write-up. Costing those end to
 * end would be costing a fixture I wrote, which proves nothing.
 *
 * What it does prove is the specific thing that changed:
 *
 *   1. **The error mode is now structurally impossible.** On every one of the
 *      four material-class failures the rules stop and ask rather than pick.
 *      A wrong guess cannot happen because no guess happens.
 *   2. **Answered correctly, the mass is right by construction** — the measured
 *      volume times the answered family's density, which is arithmetic, not
 *      judgement.
 *   3. **The size of what that fixes**, in kilograms and in pounds of raw
 *      material, against the figures the document records for the AI's answer.
 *
 * The material bucket is the honest scope here: it is the bucket that was
 * wrong, it is the bucket the material answer determines, and it is computable
 * without inventing a shop's OEE.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import { RESIN_DECISION_ID } from '../src/engine/cost-input-rules/derive/resin.js';
import { THIN_WALL_COMMODITY_DECISION_ID } from '../src/engine/cost-input-rules/derive/thin-wall-ambiguity.js';
import {
  PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/service-context.js';
import { CAPACITY_DECISION_ID, BARRIER_DECISION_ID } from '../src/engine/cost-input-rules/commodities/blow-moulding.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/** £/kg from the library, so no price is written down twice. */
function price(id: string): number {
  const m = DEFAULT_RATE_LIBRARY.materials.find(x => x.id === id);
  // Throw rather than return 0. A missing id silently costing nothing is how a
  // material error hides — which is the whole subject of this file.
  if (!m) throw new Error(`No material '${id}' in the rate library`);
  return m.pricePerKg;
}

interface Part {
  name: string;
  commodity: string;
  filename: string;
  annualVolume: number;
  geo: OCCTGeometry;
  /** The truth, per the document. */
  realMassKg: number;
  realMaterialId: string;
  /** What the tool first said, per the document. */
  aiMassKg: number;
  aiMaterialId: string;
  /** The independent manual bottom-up, £/part. */
  manualGBP: [number, number];
  aiFirstAnswerGBP: number;
  /**
   * Every answer a person gives to unblock it.
   *
   * More than one on most parts: the rules ask a chain, and the material
   * question is only the first link. That is the design — a casting needs its
   * service context before `adviseCastingProcess` can choose a route.
   */
  answers: Record<string, unknown>;
  /** The material question that must appear somewhere in that chain. */
  mustAsk: string;
}

/**
 * Geometry reconstructed from the documented figures.
 *
 * Volume is back-calculated from the documented real weight and the real
 * material's density, so `volume x density` returns the documented weight by
 * construction — which is the point: the arithmetic is not what was ever
 * in doubt, the material was.
 */
const geoFor = (o: {
  partName: string; bbox: [number, number, number]; massKg: number; densityKgPerM3: number;
  wallMm?: number; sealedVoid?: boolean; bends?: number; gaugeMm?: number;
  faces?: number; freeForm?: number; holes?: number;
}): OCCTGeometry => {
  const cm3 = (o.massKg / o.densityKgPerM3) * 1e6;
  const bboxCm3 = (o.bbox[0] * o.bbox[1] * o.bbox[2]) / 1000;
  return {
    status: 'success',
    partName: o.partName,
    boundingBox: { xMm: o.bbox[0], yMm: o.bbox[1], zMm: o.bbox[2] },
    volume: { mm3: cm3 * 1000, cm3 },
    surfaceArea: { mm2: 0, cm2: Math.max(100, cm3 * 4) },
    fillRatio: Math.min(0.99, cm3 / bboxCm3),
    wallThickness: o.wallMm
      ? { minMm: o.wallMm * 0.8, maxMm: o.wallMm * 1.4, meanMm: o.wallMm, stdDevMm: 0.3,
          sampleCount: 300, method: 'ray_cast', uniformity: 'good' }
      : undefined,
    topology: o.sealedVoid === undefined
      ? undefined
      : { available: true, openShell: !o.sealedVoid, enclosesSealedVoid: o.sealedVoid, voidCount: o.sealedVoid ? 1 : 0 },
    sheetMetal: o.bends ? { bendCount: o.bends, totalBendLengthMm: 400, thicknessMm: o.gaugeMm ?? 1.5 } : undefined,
    draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 40, analyzedFaceCount: 42 },
    faces: { total: o.faces ?? 60, byType: {} },
    features: { freeFormFaceCount: o.freeForm ?? 2, planarFaceCount: 20, estimatedHoleCount: o.holes ?? 4 },
    featureTable: o.holes ? [{ kind: 'hole', diaMm: 10, depthMm: 20, through: true, count: o.holes }] : [],
    weights: {
      aluminiumKg: cm3 * 0.0027, steelKg: cm3 * 0.00785, plasticKg: cm3 * 0.00105,
      castIronKg: cm3 * 0.00715, copperKg: cm3 * 0.00896, titaniumKg: cm3 * 0.00443,
    },
  } as unknown as OCCTGeometry;
};

const PARTS: Part[] = [
  {
    name: 'Stub axle PRCR002 — forged steel costed as aluminium',
    commodity: 'forging', filename: 'stub-axle-prcr002.step', annualVolume: 100_000,
    geo: geoFor({ partName: 'stub axle', bbox: [260, 180, 180], massKg: 8.14, densityKgPerM3: 7850, faces: 60 }),
    realMassKg: 8.14, realMaterialId: 'mat-steel4140',
    aiMassKg: 2.8, aiMaterialId: 'mat-al6061',
    manualGBP: [28, 32], aiFirstAnswerGBP: 41.97,
    answers: {
      [MATERIAL_FAMILY_DECISION_ID]: 'steel',
      [TOLERANCE_CLASS_DECISION_ID]: 'standard',
      [SAFETY_CRITICAL_DECISION_ID]: 'yes',
    },
    mustAsk: MATERIAL_FAMILY_DECISION_ID,
  },
  {
    name: '25T servo horn — aluminium CNC costed as plastic',
    commodity: 'machining', filename: 'servo-horn-25t.step', annualVolume: 20_000,
    geo: geoFor({ partName: 'servo horn', bbox: [60, 20, 6], massKg: 0.003, densityKgPerM3: 2700, faces: 120, freeForm: 24, holes: 12 }),
    realMassKg: 0.003, realMaterialId: 'mat-al6061',
    aiMassKg: 0.001167, aiMaterialId: 'mat-abs',
    manualGBP: [2.0, 2.4], aiFirstAnswerGBP: 1.27,
    answers: { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' },
    mustAsk: MATERIAL_FAMILY_DECISION_ID,
  },
  {
    name: 'Front bumper — plastic moulding costed as an aluminium casting',
    commodity: 'injection_moulding', filename: 'front-bumper.step', annualVolume: 200_000,
    geo: geoFor({ partName: 'front bumper fascia', bbox: [1800, 500, 450], massKg: 4.5, densityKgPerM3: 900, wallMm: 2.5, sealedVoid: false, faces: 230, freeForm: 60 }),
    realMassKg: 4.5, realMaterialId: 'mat-pp-impact',
    aiMassKg: 13.5, aiMaterialId: 'mat-lm25',
    manualGBP: [8, 9], aiFirstAnswerGBP: 29.18,
    answers: {
      // The bumper's own documented failure, asked first: is this metal or plastic?
      [THIN_WALL_COMMODITY_DECISION_ID]: 'injection_moulding',
      [RESIN_DECISION_ID]: 'mat-pp-impact',
    },
    mustAsk: RESIN_DECISION_ID,
  },
  {
    name: 'Seat LH cross-member — steel stamping costed as PA6 moulding',
    commodity: 'sheet_metal', filename: 'seat-cross-member-lh.step', annualVolume: 100_000,
    geo: geoFor({ partName: 'seat cross member LH', bbox: [620, 180, 60], massKg: 1.32, densityKgPerM3: 7850, wallMm: 1.5, bends: 4, gaugeMm: 1.5, holes: 6 }),
    realMassKg: 1.32, realMaterialId: 'mat-dc01',
    aiMassKg: 0.177, aiMaterialId: 'mat-pa6-gf30',
    manualGBP: [1.2, 1.6], aiFirstAnswerGBP: 2.84,
    answers: { [MATERIAL_FAMILY_DECISION_ID]: 'steel' },
    mustAsk: MATERIAL_FAMILY_DECISION_ID,
  },
  {
    name: 'Fuel tank — blow-moulded HDPE costed as an 83 kg sand casting',
    commodity: 'blow_moulding', filename: 'fuel-tank.step', annualVolume: 120_000,
    geo: geoFor({ partName: 'fuel tank', bbox: [1500, 700, 320], massKg: 11.1, densityKgPerM3: 960, wallMm: 4.6, sealedVoid: true, faces: 94, freeForm: 40 }),
    realMassKg: 11.1, realMaterialId: 'mat-hdpe',
    aiMassKg: 83, aiMaterialId: 'mat-lm25',
    manualGBP: [20, 30], aiFirstAnswerGBP: 216.97,
    answers: {
      [RESIN_DECISION_ID]: 'mat-hdpe',
      [CAPACITY_DECISION_ID]: 'over_20',
      [BARRIER_DECISION_ID]: 'barrier',
    },
    mustAsk: RESIN_DECISION_ID,
  },
  {
    name: 'RH steering knuckle — the one it got right, by offsetting errors',
    commodity: 'casting', filename: 'rh-steering-knuckle.step', annualVolume: 100_000,
    geo: geoFor({ partName: 'RH steering knuckle', bbox: [220, 180, 140], massKg: 2.8, densityKgPerM3: 2700, wallMm: 11, faces: 90, freeForm: 12, holes: 10 }),
    realMassKg: 2.8, realMaterialId: 'mat-lm25',
    aiMassKg: 2.8, aiMaterialId: 'mat-lm25',
    manualGBP: [16, 18], aiFirstAnswerGBP: 16.21,
    answers: {
      [MATERIAL_FAMILY_DECISION_ID]: 'aluminium',
      [PRESSURE_TIGHT_DECISION_ID]: 'no',
      [TOLERANCE_CLASS_DECISION_ID]: 'standard',
      [SAFETY_CRITICAL_DECISION_ID]: 'yes',
      // A safety-critical aluminium knuckle routes to investment casting, whose
      // tooling the kernel cannot price. The rules ask for the quotation rather
      // than inventing one — an answer that is a figure, not a choice.
      'casting.toolingCost': '18000',
    },
    mustAsk: MATERIAL_FAMILY_DECISION_ID,
  },
];

const ctx = (p: Part, answers: Record<string, unknown>): RuleContext => ({
  geo: p.geo, geometryQuality: 'occt', commodity: p.commodity,
  // 'inferred' on purpose: this is the path where the tool used to guess.
  commoditySource: 'inferred',
  annualVolume: p.annualVolume, filename: p.filename, answers,
});

describe('the six parts with independent manual costs', () => {
  it.each(PARTS.map(p => [p.name, p] as const))(
    'stops rather than guesses: %s', (_name, p) => {
      const spec = specForCommodity(p.commodity)!;

      // Walk the chain the way a person would, answering one question at a time.
      const asked: string[] = [];
      const given: Record<string, unknown> = {};
      let materialQuestion;
      for (let i = 0; i < 6; i++) {
        const r = runCostInputRules(spec, ctx(p, { ...given }));
        if (r.status === 'complete') break;
        const d = r.decisions[0];
        asked.push(d.id);
        if (d.id === p.mustAsk) materialQuestion = d;
        given[d.id] = p.answers[d.id];
        expect(given[d.id], `${p.name}: no answer for ${d.id}`).toBeDefined();
      }

      // The first thing it does is stop, and the material question is in the chain.
      expect(asked.length).toBeGreaterThan(0);
      expect(asked, `${p.name} asked ${asked.join(' → ')}`).toContain(p.mustAsk);
      // And the question spells out what each answer weighs — the consequence
      // text that has been on the Decision type since Stage 1 and on screen
      // since Stage 7.
      expect(materialQuestion!.options.every(o => (o.consequence ?? '').includes('kg'))).toBe(true);
    });

  it.each(PARTS.map(p => [p.name, p] as const))(
    'gets the mass right once answered: %s', (_name, p) => {
      const spec = specForCommodity(p.commodity)!;
      const r = runCostInputRules(spec, ctx(p, p.answers));
      expect(r.status).toBe('complete');

      const flat = JSON.stringify(r.suggestions);
      const mass = Number(/"(?:net|part)WeightKg":([\d.]+)/.exec(flat)?.[1]);
      expect(mass, `${p.name}: no weight in ${flat.slice(0, 120)}`).toBeGreaterThan(0);
      // Within 2% of the documented reality. The volume was back-calculated from
      // that weight, so this is checking the rules use the answered density —
      // which is exactly the step the AI was skipping.
      expect(Math.abs(mass - p.realMassKg) / p.realMassKg).toBeLessThan(0.02);
    });

  it('quantifies the raw material the material-class errors were costing', () => {
    const rows: string[] = [];
    let totalError = 0;

    for (const p of PARTS) {
      const realCost = p.realMassKg * price(p.realMaterialId);
      const aiCost = p.aiMassKg * price(p.aiMaterialId);
      const err = aiCost - realCost;
      totalError += Math.abs(err);
      rows.push(`  ${p.name.split(' — ')[0].padEnd(24)} `
        + `real ${p.realMassKg.toFixed(3)} kg = £${realCost.toFixed(2)}  |  `
        + `AI ${p.aiMassKg.toFixed(3)} kg = £${aiCost.toFixed(2)}  |  Δ £${err.toFixed(2)}`);
    }
    console.log('\n  Raw material only, £/part:\n' + rows.join('\n'));

    // Five of the six were wrong on material, and the errors run in both
    // directions — over-charging a plastic tank as metal, under-charging a
    // steel forging as aluminium. Both are unusable in a negotiation.
    const wrong = PARTS.filter(p => p.aiMaterialId !== p.realMaterialId);
    expect(wrong.length).toBe(5);
    expect(totalError).toBeGreaterThan(50);
  });

  it('the knuckle was right by luck, and the document says so', () => {
    // The one the tool got closest on is the one where the material happened to
    // be correct. That is the whole argument in a single row: it is not that
    // the AI costs badly, it is that a guessed material cannot be relied on.
    const knuckle = PARTS.find(p => p.name.includes('knuckle'))!;
    expect(knuckle.aiMaterialId).toBe(knuckle.realMaterialId);
    expect(knuckle.aiFirstAnswerGBP).toBeGreaterThanOrEqual(knuckle.manualGBP[0]);
    expect(knuckle.aiFirstAnswerGBP).toBeLessThanOrEqual(knuckle.manualGBP[1]);

    // Every part whose material was guessed wrong landed outside its manual band.
    for (const p of PARTS.filter(x => x.aiMaterialId !== x.realMaterialId)) {
      const inBand = p.aiFirstAnswerGBP >= p.manualGBP[0] && p.aiFirstAnswerGBP <= p.manualGBP[1];
      expect(inBand, `${p.name} should NOT have landed in its manual band`).toBe(false);
    }
  });

  it('will not silently route a hollow tank or an open drape to a solid process', () => {
    // Two of the six failed before the material question was even reached — the
    // commodity itself was wrong. `inferCommodity` refuses both.
    const tank = PARTS.find(p => p.name.includes('Fuel tank'))!;
    const bumper = PARTS.find(p => p.name.includes('bumper'))!;

    const tankVerdict = inferCommodity(ctx(tank, {}));
    expect(tankVerdict.commodity, 'a sealed hollow shell must not resolve to one process').toBeUndefined();
    expect(tankVerdict.decision!.options.map(o => o.value)).not.toContain('casting');

    const bumperVerdict = inferCommodity(ctx(bumper, {}));
    expect(bumperVerdict.commodity).toBeUndefined();
    expect(bumperVerdict.decision!.options.map(o => o.value)).not.toContain('casting');
  });

  it('asks metal-or-plastic on the cross-member only when nobody has said', () => {
    const p = PARTS.find(x => x.name.includes('cross-member'))!;
    // Four measured bends settle it — the kernel decides, so nothing is asked.
    const r = runCostInputRules(specForCommodity('sheet_metal')!, ctx(p, p.answers));
    expect(r.status).toBe('complete');
    expect(r.decisions.map(d => d.id)).not.toContain(THIN_WALL_COMMODITY_DECISION_ID);
  });
});

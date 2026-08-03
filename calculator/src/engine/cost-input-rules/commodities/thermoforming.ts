/**
 * Thermoforming cost inputs, derived from the measured drape.
 *
 * `thermoforming-advisor.ts` is the most physics-complete advisor in the tool —
 * heat time from specific heat and forming temperature, cooling from tool
 * conduction, sag from self-weight plate deflection, wall thinning from the
 * draw ratio, and a parametric tool with a life and an upkeep rate. None of it
 * was reachable from CAD. The prompt instead carried:
 *
 *     sheetWeightKg = partWeightKg / (1 - wasteFraction)
 *     wasteFraction = 0.25–0.45 depending on draw ratio
 *     heatTimeSec: 30–90s (depends on gauge and material)
 *     formTimeSec: 5–20s vacuum; 10–30s pressure
 *     trimTimeSec: 10–30s per part
 *
 * — five ranges for a model to pick a number out of, when four closed-form
 * functions were sitting unused.
 *
 * The one derivation worth explaining: **the measured wall is not the sheet
 * gauge.** Thermoforming stretches a flat sheet into a cavity, so the formed
 * wall is thinner than the stock it came from — by the areal draw, which
 * `estimateWallThinning` computes as `1 + 2 x (depth / opening)`. That is
 * independent of the sheet thickness, so it inverts in closed form: buy
 * `measured wall x areal draw` of sheet. A 1.5 mm wall on a 2:1 draw is a 7.5 mm
 * sheet, and getting that backwards under-buys the stock five-fold.
 */
import {
  thermoformFamilyOf, estimateHeatTimeSec, estimateCoolTimeSec, estimateSagRisk,
  estimateWallThinning, estimateThermoformToolCost, estimateThermoformSpecificEnergy,
  formingPressureBar,
  type ThermoformMethod, type FormComplexity, type MouldMaterial,
} from '../../modules/thermoforming-advisor.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { bboxSortedMm, projectedAreaCm2 } from '../derive/envelope.js';

/** Forming complexity from what the kernel can see of the shape. */
export function formComplexity(ctx: RuleContext): FormComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  let score = 0;
  if (freeForm >= 10) score += 2; else if (freeForm >= 4) score += 1;
  if (undercuts >= 2) score += 1;
  return score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
}

/**
 * Draw geometry: depth, the smallest mouth dimension, and the areal draw that
 * links the sheet gauge to the formed wall.
 */
export function drawGeometry(ctx: RuleContext): { depthMm: number; openingMm: number; arealDraw: number; ratio: number } | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  const depthMm = d[2];              // the drape's depth is its smallest dimension
  const openingMm = d[1];            // the narrower of the two footprint dimensions
  return {
    depthMm, openingMm,
    arealDraw: 1 + 2 * (depthMm / Math.max(1, openingMm)),
    ratio: Math.round(depthMm / Math.max(1, openingMm) * 100) / 100,
  };
}

/**
 * Method.
 *
 * Vacuum manages a 1.5:1 draw; a plug assist reaches 3:1 and pressure 4:1. So a
 * deep part needs pressure forming whether or not anyone asked for the detail
 * it also brings. Twin-sheet is for hollow double-wall parts, which the topology
 * tells us outright.
 */
export function methodFor(ctx: RuleContext, ratio: number): { method: ThermoformMethod; reason: string } {
  if (ctx.geo.topology?.enclosesSealedVoid === true) {
    return { method: 'twin_sheet', reason: 'encloses a sealed void — two webs welded at the perimeter' };
  }
  if (ratio > 1.5) {
    return {
      method: 'pressure',
      reason: `${ratio.toFixed(2)}:1 draw is beyond the 1.5:1 a vacuum tool holds — pressure forming`,
    };
  }
  return { method: 'vacuum', reason: `${ratio.toFixed(2)}:1 draw is within the 1.5:1 vacuum limit` };
}

/** Tool material follows the volume the tool has to survive. */
export function mouldMaterialFor(annualVolume: number, method: ThermoformMethod): MouldMaterial {
  if (method === 'pressure') return 'cnc-al';   // pressure box needs a machined tool
  if (annualVolume < 2_000) return 'epoxy';
  return annualVolume >= 200_000 ? 'cnc-al' : 'cast-al';
}

interface TfAdvice {
  resin: ResinFacts;
  family: ReturnType<typeof thermoformFamilyOf>;
  wallMm: number;
  sheetMm: number;
  draw: NonNullable<ReturnType<typeof drawGeometry>>;
  method: ThermoformMethod;
  methodReason: string;
  areaCm2: number;
  complexity: FormComplexity;
  mouldMaterial: MouldMaterial;
  partKg: number;
  sheetKg: number;
}

function advise(ctx: RuleContext): { advice: TfAdvice } | { blocked: RuleOutcome<never> } {
  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };

  const wallMm = ctx.geo.wallThickness?.meanMm ?? 0;
  const draw = drawGeometry(ctx);
  const areaCm2 = projectedAreaCm2(ctx);
  if (!wallMm || !draw || !areaCm2) {
    return {
      blocked: ask({
        id: 'thermoforming.envelope', kind: 'geometry_gap',
        question: 'What is the formed wall and the part footprint?',
        why: 'No wall thickness or bounding box was measured, so the sheet gauge cannot '
          + 'be worked back from the draw — and the sheet is the material buy.',
        options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const m = methodFor(ctx, draw.ratio);
  const family = thermoformFamilyOf(resin.grade ?? resin.materialId ?? '');
  const sheetMm = Math.round(wallMm * draw.arealDraw * 100) / 100;
  const partKg = resin.massKg!;
  // The sheet blank is the footprint plus a clamp-frame margin, at full gauge.
  const blankAreaCm2 = areaCm2 * 1.25;
  const sheetKg = Math.round(
    blankAreaCm2 * (sheetMm / 10) * (resin.densityKgPerM3! / 1e6) * 10_000) / 10_000;

  return {
    advice: {
      resin, family, wallMm, sheetMm, draw,
      method: m.method, methodReason: m.reason,
      areaCm2, complexity: formComplexity(ctx),
      mouldMaterial: mouldMaterialFor(ctx.annualVolume, m.method),
      partKg, sheetKg,
    },
  };
}

export const THERMOFORMING_RULES: CommodityRuleSpec = {
  commodity: 'thermoforming',
  header: 'THERMOFORMING COST INPUT RULES:',
  rules: [
    {
      id: 'thermoforming.materialId',
      path: 'thermoforming.materialId',
      fieldId: 'tf-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('thermoforming.materialId', r.advice.resin.materialId!, 'engineer',
          r.advice.resin.basis, 1);
      },
    },
    {
      id: 'thermoforming.method',
      path: 'thermoforming.method',
      fieldId: 'tf-method',
      label: 'method',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('thermoforming.method', r.advice.method, 'rule', r.advice.methodReason, 0.75);
      },
    },
    {
      // The measured wall, for the DFM panel — NOT the material buy.
      id: 'thermoforming.formedWallMm',
      path: 'thermoforming.formedWallMm',
      label: 'formedWallMm',
      evaluate: (ctx) => {
        const wall = ctx.geo.wallThickness?.meanMm;
        if (!wall) return ask({
          id: 'thermoforming.envelope', kind: 'geometry_gap',
          question: 'What is the formed wall and the part footprint?',
          why: 'No wall thickness was measured.',
          options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('thermoforming.formedWallMm', Math.round(wall * 100) / 100, 'geometry',
          'ray-cast mean wall of the formed part', 0.85);
      },
    },
    {
      // The sheet gauge, worked back through the draw. This is the buy.
      id: 'thermoforming.sheetThicknessMm',
      path: 'thermoforming.sheetThicknessMm',
      fieldId: 'tf-thk',
      label: 'sheetThicknessMm',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('thermoforming.sheetThicknessMm', a.sheetMm, 'rule',
          `${fmt(a.wallMm, 2)} mm formed wall × areal draw `
          + `${fmt(a.draw.arealDraw, 2)} (1 + 2 × ${a.draw.depthMm.toFixed(0)}/${a.draw.openingMm.toFixed(0)}) `
          + '— the sheet is thicker than the part it becomes', 0.65);
      },
    },
    {
      id: 'thermoforming.drawRatio',
      path: 'thermoforming.drawRatio',
      fieldId: 'tf-index',
      label: 'drawRatio',
      evaluate: (ctx) => {
        const d = drawGeometry(ctx);
        if (!d) return ask({
          id: 'thermoforming.envelope', kind: 'geometry_gap',
          question: 'What is the formed wall and the part footprint?',
          why: 'No bounding box was measured, so the draw ratio is unknown.',
          options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('thermoforming.drawRatio', d.ratio, 'geometry',
          `${d.depthMm.toFixed(0)} mm depth ÷ ${d.openingMm.toFixed(0)} mm smallest opening`, 0.8);
      },
    },
    {
      id: 'thermoforming.partWeightKg',
      path: 'thermoforming.partWeightKg',
      fieldId: 'tf-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('thermoforming.partWeightKg', r.advice.partKg, 'geometry',
          r.advice.resin.basis, 0.9);
      },
    },
    {
      id: 'thermoforming.sheetWeightKg',
      path: 'thermoforming.sheetWeightKg',
      fieldId: 'tf-sheet-wt',
      label: 'sheetWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const waste = 1 - a.partKg / a.sheetKg;
        return decided('thermoforming.sheetWeightKg', a.sheetKg, 'rule',
          `${a.areaCm2.toFixed(0)} cm² footprint × 1.25 clamp margin at ${fmt(a.sheetMm, 2)} mm gauge `
          + `= ${fmt(a.sheetKg, 3)} kg; ${(waste * 100).toFixed(0)}% of it becomes web and trim`, 0.6);
      },
    },
    {
      id: 'thermoforming.heatTimeSec',
      path: 'thermoforming.heatTimeSec',
      fieldId: 'tf-heat',
      label: 'heatTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('thermoforming.heatTimeSec', estimateHeatTimeSec(a.family, a.sheetMm), 'advisor',
          `${a.family} sheet at ${fmt(a.sheetMm, 2)} mm — radiant soak goes as gauge^1.6`, 0.75);
      },
    },
    {
      id: 'thermoforming.coolTimeSec',
      path: 'thermoforming.coolTimeSec',
      fieldId: 'tf-cool',
      label: 'coolTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('thermoforming.coolTimeSec',
          estimateCoolTimeSec(a.family, a.sheetMm, 'water'), 'advisor',
          `${a.family} on a water-cooled tool — contact cooling goes as gauge²`, 0.75);
      },
    },
    {
      id: 'thermoforming.formTimeSec',
      path: 'thermoforming.formTimeSec',
      fieldId: 'tf-form',
      label: 'formTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const bar = formingPressureBar(r.advice.method);
        // The stroke is the time to move the air. Higher pressure forms faster
        // but takes longer to charge; both land in the prompt's 5-30 s window.
        const sec = r.advice.method === 'vacuum' ? 6 : r.advice.method === 'pressure' ? 12 : 18;
        return decided('thermoforming.formTimeSec', sec, 'rule',
          `${r.advice.method} forming at ${bar} bar`, 0.55);
      },
    },
    {
      id: 'thermoforming.trimTimeSec',
      path: 'thermoforming.trimTimeSec',
      fieldId: 'tf-trim',
      label: 'trimTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // Routing follows the perimeter, so it scales with the footprint rather
        // than being one number for a cup and a bath panel alike.
        const perimeterMm = 2 * (r.advice.draw.openingMm + (bboxSortedMm(ctx)![0]));
        const sec = Math.max(8, Math.round(perimeterMm / 1000 * 12));
        return decided('thermoforming.trimTimeSec', sec, 'rule',
          `${(perimeterMm / 1000).toFixed(2)} m of trim path at ~12 s/m on a CNC router`, 0.55);
      },
    },
    {
      id: 'thermoforming.projectedAreaCm2',
      path: 'thermoforming.projectedAreaCm2',
      fieldId: 'tf-area',
      label: 'projectedAreaCm2',
      evaluate: (ctx) => {
        const a = projectedAreaCm2(ctx);
        if (a === null) return ask({
          id: 'thermoforming.envelope', kind: 'geometry_gap',
          question: 'What is the formed wall and the part footprint?',
          why: 'No bounding box was measured.',
          options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('thermoforming.projectedAreaCm2', a, 'geometry',
          'two largest bounding-box dimensions', 0.8);
      },
    },
    {
      id: 'thermoforming.mouldMaterial',
      path: 'thermoforming.mouldMaterial',
      fieldId: 'tf-mould-mat',
      label: 'mouldMaterial',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('thermoforming.mouldMaterial', r.advice.mouldMaterial, 'rule',
          r.advice.method === 'pressure'
            ? 'pressure forming needs a machined aluminium tool to take the box load'
            : `${ctx.annualVolume.toLocaleString('en-GB')}/yr: `
              + (r.advice.mouldMaterial === 'epoxy' ? 'epoxy is enough below 2,000/yr'
                : r.advice.mouldMaterial === 'cnc-al' ? 'machined aluminium at high volume'
                : 'cast aluminium — the production workhorse'),
          0.7);
      },
    },
    {
      id: 'thermoforming.toolCost',
      path: 'thermoforming.toolCost',
      fieldId: 'tf-tool-cost',
      label: 'toolCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const est = estimateThermoformToolCost({
          projectedAreaCm2: a.areaCm2, mouldMaterial: a.mouldMaterial,
          method: a.method, complexity: a.complexity, cavities: 1, trim: 'cnc-router',
        });
        return decided('thermoforming.toolCost', est.total, 'advisor',
          `${a.mouldMaterial} ${a.method} tool over ${a.areaCm2.toFixed(0)} cm², ${a.complexity} form: `
          + `£${est.mould} mould + £${est.vacuumHoles} vacuum holes; ${est.lifeCycles.toLocaleString('en-GB')} cycle life`,
          0.65);
      },
    },
    {
      id: 'thermoforming.energyKwhPerKg',
      path: 'thermoforming.energyKwhPerKg',
      fieldId: 'tf-kwh',
      label: 'energyKwhPerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('thermoforming.energyKwhPerKg',
          estimateThermoformSpecificEnergy(r.advice.family, r.advice.method), 'advisor',
          `cp·ΔT to forming temperature for ${r.advice.family}, plus ${r.advice.method} air work`, 0.7);
      },
    },
    {
      // Advisory, not a cost input: it tells the engineer whether the part can
      // be formed at all before anyone argues about the price.
      id: 'thermoforming.formability',
      path: 'thermoforming.formability',
      label: 'formability',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const thin = estimateWallThinning({
          sheetThicknessMm: a.sheetMm, depthMm: a.draw.depthMm,
          minOpeningMm: a.draw.openingMm, method: a.method,
          plugAssist: a.draw.ratio > 1.5,
        });
        const sag = estimateSagRisk(a.family, a.sheetMm, bboxSortedMm(ctx)![0]);
        return decided('thermoforming.formability',
          thin.withinLimit ? 'within limit' : 'exceeds draw limit', 'advisor',
          `${thin.drawRatio}:1 draw against a ${thin.drawLimit}:1 limit; corners thin to `
          + `${fmt(thin.minWallMm, 2)} mm; sag risk ${sag.risk}`, 0.7);
      },
    },
  ],
};

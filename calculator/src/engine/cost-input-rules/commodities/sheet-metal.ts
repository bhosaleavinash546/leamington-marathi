/**
 * Sheet-metal cost inputs, derived from the measured blank.
 *
 * This is the most geometry-dominated commodity in the tool — the blank, the
 * gauge, the perimeter, the press tonnage and the bend count are all measured
 * rather than estimated. Two things change relative to the prompt these rules
 * came from:
 *
 * 1. **Gauge comes from the bend detector, not the ray-cast minimum.** The
 *    prompt used `wallThickness.minMm`, which is the thinnest wall found by
 *    casting rays through the solid — on a formed part that can land on a
 *    radius or a coined edge and read low. `sheetMetal.thicknessMm` is derived
 *    from the cylindrical bend faces and is the actual coil gauge.
 *
 * 2. **`adviseSheetMetalProcess` and the die estimators are fed from geometry.**
 *    They already existed and were already called — but from form fields the
 *    engineer had typed, which meant they could not run before the form was
 *    filled. Now they run from the measurement.
 *
 * 3. **Die life is predicted, not looked up.** The prompt carried a flat ladder
 *    (`progressive→1000000; single-stage→300000`) that ignored both the material
 *    and the gauge. `estimateStampingDieLife` already models both and was only
 *    ever reachable from a hand-typed form.
 */
import {
  adviseSheetMetalProcess, classifyVolume,
  estimateStampingDieCost, estimateStampingDieLife,
  type StampingDieType, type HoleDensityLevel, type ComplexityLevel,
} from '../../modules/sheet-metal-advisor.js';
import { decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { materialFacts } from '../derive/material.js';
import { thinWallAmbiguity } from '../derive/thin-wall-ambiguity.js';
import type { MaterialFamily } from '../../material-family.js';

/** Shear strength MPa by family — drives die hardness and press tonnage. */
const SHEAR_MPA: Partial<Record<MaterialFamily, number>> = {
  steel: 280,
  aluminium: 170,
};

/** Blank footprint: the two largest bbox dimensions with a trim allowance. */
export function blankDims(ctx: RuleContext): { lengthMm: number; widthMm: number } | null {
  const bb = ctx.geo.boundingBox;
  if (!bb) return null;
  const sorted = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
  return {
    lengthMm: Math.round(sorted[0] * 1.05),
    widthMm: Math.round(sorted[1] * 1.05),
  };
}

/**
 * Sheet gauge.
 *
 * Prefers the bend-derived thickness — that is the coil gauge. Falls back to the
 * ray-cast minimum only when no bends were found, and says so in the basis so
 * the weaker source is visible on the report.
 */
export function gaugeMm(ctx: RuleContext): { mm: number; basis: string; confidence: number } | null {
  const sm = ctx.geo.sheetMetal;
  if (sm?.thicknessMm && sm.thicknessMm > 0) {
    return {
      mm: Math.round(sm.thicknessMm * 100) / 100,
      basis: `measured from ${sm.bendCount ?? 0} bend face(s) — coil gauge`,
      confidence: 0.9,
    };
  }
  const min = ctx.geo.wallThickness?.minMm;
  if (min && min > 0) {
    return {
      mm: Math.round(min * 100) / 100,
      basis: 'ray-cast minimum wall — no bends detected, so this may read low on a radius',
      confidence: 0.5,
    };
  }
  return null;
}

/** Hole count from the exact feature table. */
function holeCount(ctx: RuleContext): number {
  return (ctx.geo.featureTable ?? [])
    .filter(r => r.kind === 'hole')
    .reduce((s, r) => s + (r.count ?? 0), 0);
}

/** The advisor grades hole density as a binary — turret punching or not. */
export function holeDensity(ctx: RuleContext): HoleDensityLevel {
  const b = blankDims(ctx);
  if (!b) return 'low';
  const areaCm2 = (b.lengthMm * b.widthMm) / 100;
  if (areaCm2 <= 0) return 'low';
  // 5 holes per 100 cm² is roughly where punching each one individually starts
  // to beat a die station per hole.
  return (holeCount(ctx) / areaCm2) * 100 >= 5 ? 'high' : 'low';
}

/** Forming complexity — bends and holes, not free-form area. */
export function formingComplexity(ctx: RuleContext): ComplexityLevel {
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  const holes = holeCount(ctx);
  let score = 0;
  if (bends >= 6) score += 2; else if (bends >= 3) score += 1;
  if (holes >= 12) score += 1;
  if ((ctx.geo.features?.freeFormFaceCount ?? 0) >= 4) score += 1;
  return score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
}

/** Map the advisor's prose process onto a die type the estimators understand. */
function dieTypeFor(primaryProcess: string): StampingDieType {
  const p = primaryProcess.toLowerCase();
  if (p.includes('transfer')) return 'transfer';
  if (p.includes('fine')) return 'fine_blanking';
  if (p.includes('progressive')) return 'progressive';
  return 'single_stage';
}

interface SmAdvice {
  primaryProcess: string;
  dieType: StampingDieType;
  reason: string;
  gauge: number;
  gaugeBasis: string;
  gaugeConfidence: number;
  shearMPa: number;
  family: MaterialFamily;
  massKg: number | null;
  massBasis: string;
}

function advise(ctx: RuleContext): { advice: SmAdvice } | { blocked: RuleOutcome<never> } {
  // Before anything: is this even a metal part?
  const amb = thinWallAmbiguity(ctx);
  if (amb.decision) return { blocked: ask(amb.decision) };

  const mat = materialFacts(ctx);
  if (mat.decision) return { blocked: ask(mat.decision) };

  const g = gaugeMm(ctx);
  if (!g) {
    return {
      blocked: ask({
        id: 'sheetMetal.gauge',
        kind: 'tolerance_class',
        question: 'What gauge is the sheet?',
        why: 'No bends were detected and no wall thickness could be measured, so the coil '
          + 'gauge is unknown — and it drives the blank weight, the press tonnage and the die.',
        options: [{ value: 'enter', label: 'Enter the gauge from the drawing' }],
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const family = mat.family!;
  const shearMPa = SHEAR_MPA[family] ?? 280;
  const rec = adviseSheetMetalProcess({
    annualVolume: ctx.annualVolume,
    thicknessMm: g.mm,
    complexity: formingComplexity(ctx),
    holeDensity: holeDensity(ctx),
    materialFamily: family === 'aluminium' ? 'aluminium' : 'steel',
  });

  return {
    advice: {
      primaryProcess: rec.primaryProcess,
      dieType: dieTypeFor(rec.primaryProcess),
      reason: rec.reason,
      gauge: g.mm,
      gaugeBasis: g.basis,
      gaugeConfidence: g.confidence,
      shearMPa,
      family,
      massKg: mat.massKg,
      massBasis: mat.basis,
    },
  };
}

/** Die stations: one to blank, one per bend, one to pierce if there are holes. */
function stations(ctx: RuleContext): number {
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  return Math.max(2, 1 + bends + (holeCount(ctx) > 0 ? 1 : 0));
}

export const SHEET_METAL_RULES: CommodityRuleSpec = {
  commodity: 'sheet_metal',
  header: 'SHEET METAL COST INPUT RULES:',
  rules: [
    {
      id: 'sheetMetal.thicknessMm',
      path: 'sheetMetal.thicknessMm',
      fieldId: 'sm-thick',
      label: 'thicknessMm',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('sheetMetal.thicknessMm', r.advice.gauge, 'geometry',
          r.advice.gaugeBasis, r.advice.gaugeConfidence);
      },
    },
    {
      id: 'sheetMetal.blankLengthMm',
      path: 'sheetMetal.blankLengthMm',
      fieldId: 'sm-blank-l',
      label: 'blankLengthMm',
      evaluate: (ctx) => {
        const b = blankDims(ctx);
        if (!b) return ask({
          id: 'sheetMetal.blank', kind: 'tolerance_class',
          question: 'What are the blank dimensions?',
          why: 'No bounding box was measured, so the developed blank cannot be derived.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('sheetMetal.blankLengthMm', b.lengthMm, 'geometry',
          'largest bounding-box dimension × 1.05 trim allowance', 0.8);
      },
    },
    {
      id: 'sheetMetal.blankWidthMm',
      path: 'sheetMetal.blankWidthMm',
      fieldId: 'sm-blank-w',
      label: 'blankWidthMm',
      evaluate: (ctx) => {
        const b = blankDims(ctx);
        if (!b) return ask({
          id: 'sheetMetal.blank', kind: 'tolerance_class',
          question: 'What are the blank dimensions?',
          why: 'No bounding box was measured, so the developed blank cannot be derived.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('sheetMetal.blankWidthMm', b.widthMm, 'geometry',
          'second-largest bounding-box dimension × 1.05 trim allowance', 0.8);
      },
    },
    {
      id: 'sheetMetal.numOps',
      path: 'sheetMetal.numOps',
      fieldId: 'sm-num-ops',
      label: 'numOps',
      evaluate: (ctx) => {
        const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
        const holes = holeCount(ctx);
        return decided('sheetMetal.numOps', stations(ctx), 'geometry',
          `1 blank + ${bends} bend(s)${holes > 0 ? ' + 1 pierce' : ''} = ${stations(ctx)} stations`,
          bends > 0 ? 0.75 : 0.4);
      },
    },
    {
      id: 'sheetMetal.dieCostGBP',
      path: 'sheetMetal.dieCostGBP',
      fieldId: 'sm-die-cost',
      label: 'dieCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const b = blankDims(ctx)!;
        const blankAreaCm2 = (b.lengthMm * b.widthMm) / 100;
        const est = estimateStampingDieCost({
          dieType: r.advice.dieType,
          stations: stations(ctx),
          blankAreaCm2,
          shearStrengthMPa: r.advice.shearMPa,
        });
        // The kernel's own progressive-die number is an independent estimate off
        // the same blank. Show it next to ours — a wide gap is worth a look, and
        // the prompt used to quote it as the answer with nothing to compare against.
        const occt = ctx.geo.toolingCostEstimates?.progressiveDieCostGBP;
        const crossCheck = occt ? `; OCCT parametric says £${occt.toFixed(0)}` : '';
        return decided('sheetMetal.dieCostGBP', est.total, 'advisor',
          `${r.advice.dieType} die, ${stations(ctx)} stations, ${blankAreaCm2.toFixed(0)} cm² blank, `
          + `${r.advice.shearMPa} MPa shear${crossCheck}`, 0.65);
      },
    },
    {
      id: 'sheetMetal.dieLife',
      path: 'sheetMetal.dieLife',
      fieldId: 'sm-die-life',
      label: 'dieLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const life = estimateStampingDieLife({
          shearStrengthMPa: r.advice.shearMPa,
          thicknessMm: r.advice.gauge,
          dieType: r.advice.dieType,
        });
        return decided('sheetMetal.dieLife', life, 'advisor',
          `${r.advice.shearMPa} MPa shear at ${r.advice.gauge} mm on a ${r.advice.dieType} die`, 0.6);
      },
    },
    {
      id: 'sheetMetal.dieType',
      path: 'sheetMetal.dieType',
      fieldId: 'sm-die-type',
      label: 'dieType',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('sheetMetal.dieType', r.advice.dieType, 'advisor',
          `${classifyVolume(ctx.annualVolume)} volume at ${r.advice.gauge} mm: ${r.advice.reason}`, 0.8);
      },
    },
    {
      // Prose for the report. No form field — the die type above is what the
      // costing actually reads.
      id: 'sheetMetal.process',
      path: 'sheetMetal.process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('sheetMetal.process', r.advice.primaryProcess, 'advisor',
          `${classifyVolume(ctx.annualVolume)} volume: ${r.advice.reason}`, 0.8);
      },
    },
    {
      id: 'sheetMetal.netWeightKg',
      path: 'sheetMetal.netWeightKg',
      fieldId: 'sm-net-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.massKg === null) {
          return ask({
            id: 'sheetMetal.mass', kind: 'material_family',
            question: 'What is the part weight?',
            why: 'No volume was measured, so the blank weight cannot be derived.',
            options: [{ value: 'enter', label: 'Enter the net weight' }],
            blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
          });
        }
        return decided('sheetMetal.netWeightKg', r.advice.massKg, 'geometry', r.advice.massBasis, 0.9);
      },
    },
    {
      id: 'sheetMetal.shearStrengthMPa',
      path: 'sheetMetal.shearStrengthMPa',
      fieldId: 'sm-shear',
      label: 'shearStrengthMPa',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('sheetMetal.shearStrengthMPa', r.advice.shearMPa, 'library',
          `reference shear strength for ${r.advice.family} sheet`, 0.7);
      },
    },
  ],
};

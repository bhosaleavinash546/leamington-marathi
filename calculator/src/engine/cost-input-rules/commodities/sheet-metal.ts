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
  let read: { mm: number; basis: string; confidence: number } | null = null;
  const sm = ctx.geo.sheetMetal;
  if (sm?.thicknessMm && sm.thicknessMm > 0) {
    read = {
      mm: Math.round(sm.thicknessMm * 100) / 100,
      basis: `measured from ${sm.bendCount ?? 0} bend face(s) — coil gauge`,
      confidence: 0.9,
    };
  } else {
    const min = ctx.geo.wallThickness?.minMm;
    if (min && min > 0) {
      read = {
        mm: Math.round(min * 100) / 100,
        basis: 'ray-cast minimum wall — no bends detected, so this may read low on a radius',
        confidence: 0.5,
      };
    }
  }
  if (!read) return null;

  // Mass-consistency floor. A gauge read off a coined edge or a radius can come
  // back far below the true coil thickness — the live audit's seat bracket read
  // 0.53 mm against a true ~1.5 mm coil, which priced a 0.558 kg part out of a
  // 0.265 kg blank (utilisation 210%). You cannot stamp a part heavier than its
  // blank: the measured solid volume spread over the blank footprint is the
  // thinnest gauge the mass allows, so anything below it is a misread.
  const volMm3 = ctx.geo.volume?.mm3 ?? (ctx.geo.volume?.cm3 ? ctx.geo.volume.cm3 * 1000 : 0);
  const b = blankDims(ctx);
  if (volMm3 > 0 && b) {
    const massFloorMm = volMm3 / (b.lengthMm * b.widthMm);
    // Fire only on an EGREGIOUS shortfall. A formed part's unfolded flat
    // pattern is larger than the bbox blank this footprint approximates, so a
    // read up to ~35% under the bbox floor can still be a true coil gauge
    // (deep drape, tall flanges). A read at HALF the floor cannot — the seat
    // bracket's 0.53 mm vs a 1.11 mm floor (2.1×) is a misread, the trim
    // panel's 1.9 mm vs a 2.27 mm floor (1.19×) is a drape.
    if (read.mm * 1.35 < massFloorMm) {
      return {
        // Ceil, not round: rounding 1.1149 down to 1.11 re-breaks the very
        // invariant this branch exists to hold.
        mm: Math.ceil(massFloorMm * 100) / 100,
        basis: `raised from ${read.mm.toFixed(2)} mm (${read.basis.split(' — ')[0]}) to the ` +
          `mass-consistent floor — measured ${(volMm3 / 1000).toFixed(0)} cm³ over a ` +
          `${b.lengthMm}×${b.widthMm} blank needs ≥${massFloorMm.toFixed(2)} mm; ` +
          `a thinner read means the blank could not weigh as much as the part`,
        confidence: 0.6,
      };
    }
  }
  return read;
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
        kind: 'geometry_gap',
        question: 'What gauge is the sheet?',
        why: 'No bends were detected and no wall thickness could be measured, so the coil '
          + 'gauge is unknown — and it drives the blank weight, the press tonnage and the die.',
        options: [{ value: 'enter', label: 'Enter the gauge from the drawing' }],
        entry: { kind: 'number' },
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

/**
 * Die stations: one to blank, bends, one to pierce — CAPPED at 12.
 *
 * The kernel counts bend FACES, and a rolled channel reads 25 of them; a
 * station-per-bend model then prices a 27-station £299k transfer die for a
 * seat cross-member whose real progressive die is ~£25-60k. Real dies form
 * several bends per station past a handful; twelve stations is already a big
 * transfer die, and beyond that the count is a face-count artefact, not a
 * tooling requirement.
 */
function stations(ctx: RuleContext): number {
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  return Math.min(12, Math.max(2, 1 + bends + (holeCount(ctx) > 0 ? 1 : 0)));
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
          id: 'sheetMetal.blank', kind: 'geometry_gap',
          question: 'What are the blank dimensions?',
          why: 'No bounding box was measured, so the developed blank cannot be derived.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' },
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
          id: 'sheetMetal.blank', kind: 'geometry_gap',
          question: 'What are the blank dimensions?',
          why: 'No bounding box was measured, so the developed blank cannot be derived.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' },
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
      // Strip layout: how the blank nests on the coil. Blank + a web between
      // parts (pitch) and an edge margin per side (strip width). These were
      // blind mapper defaults until the A/B showed them costing real money.
      id: 'sheetMetal.pitchMm',
      path: 'sheetMetal.pitchMm',
      label: 'pitchMm',
      appliesWhen: (ctx) => !!blankDims(ctx) && !!gaugeMm(ctx),
      evaluate: (ctx) => {
        const b = blankDims(ctx)!;
        const g = gaugeMm(ctx)!;
        const web = Math.max(3, 2 * g.mm);
        return decided('sheetMetal.pitchMm', Math.round(b.lengthMm + web), 'rule',
          `blank ${b.lengthMm} mm + ${web.toFixed(0)} mm web (max(3, 2 × gauge))`, 0.7);
      },
    },
    {
      id: 'sheetMetal.stripWidthMm',
      path: 'sheetMetal.stripWidthMm',
      label: 'stripWidthMm',
      appliesWhen: (ctx) => !!blankDims(ctx) && !!gaugeMm(ctx),
      evaluate: (ctx) => {
        const b = blankDims(ctx)!;
        const g = gaugeMm(ctx)!;
        const edge = Math.max(3, 2 * g.mm);
        return decided('sheetMetal.stripWidthMm', Math.round(b.widthMm + 2 * edge), 'rule',
          `blank ${b.widthMm} mm + 2 × ${edge.toFixed(0)} mm edge margin`, 0.7);
      },
    },
    {
      // Press speed is feed-limited, not press-limited, on progressive work:
      // the coil advances one pitch per stroke at ~18 m/min, de-rated as the
      // forming content grows. This exact formula ran in the browser for months
      // while the headless path sat on a blind 20 SPM — a 4.5× cycle error on
      // the seat cross-member.
      id: 'sheetMetal.strokesPerMin',
      path: 'sheetMetal.strokesPerMin',
      fieldId: 'sm-spm',
      label: 'strokesPerMin',
      appliesWhen: (ctx) => !!blankDims(ctx) && !!gaugeMm(ctx),
      evaluate: (ctx) => {
        const b = blankDims(ctx)!;
        const g = gaugeMm(ctx)!;
        const pitch = b.lengthMm + Math.max(3, 2 * g.mm);
        const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
        let spm = 18_000 / pitch;
        if (bends >= 4) spm *= 0.8;
        if (bends >= 8) spm *= 0.8;
        if (bends >= 14) spm *= 0.8;
        const clamped = Math.round(Math.min(120, Math.max(10, spm)));
        return decided('sheetMetal.strokesPerMin', clamped, 'rule',
          `feed-limited: 18 m/min ÷ ${pitch.toFixed(0)} mm pitch`
          + (bends >= 4 ? `, de-rated for ${bends} bends` : ''), 0.65);
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
            id: 'sheetMetal.mass', kind: 'geometry_gap',
            question: 'What is the part weight?',
            why: 'No volume was measured, so the blank weight cannot be derived.',
            options: [{ value: 'enter', label: 'Enter the net weight' }],
            entry: { kind: 'number' },
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

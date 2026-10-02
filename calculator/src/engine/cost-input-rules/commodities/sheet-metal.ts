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
import { materialFacts, representativeMaterialId } from '../derive/material.js';
import { holeRows } from '../derive/facts.js';
import { thinWallAmbiguity } from '../derive/thin-wall-ambiguity.js';
import { analyticBlank } from '../derive/blank.js';
import { nestOnCoil, offsetOutline, type NestResult } from '../../nesting.js';
import { formingPropertiesFor, formingLimitCheck } from '../../forming-properties.js';
import { pickStampingPressId } from '../../machine-sizing.js';
import type { MaterialFamily } from '../../material-family.js';

/** Shear strength MPa by family — drives die hardness and press tonnage. */
const SHEAR_MPA: Partial<Record<MaterialFamily, number>> = {
  steel: 280,
  aluminium: 170,
};

/** Blank footprint: the two largest bbox dimensions with a trim allowance. */
export interface BlankDims {
  lengthMm: number;
  widthMm: number;
  /** How it was arrived at, for the report. */
  basis: string;
  confidence: number;
  /** True when a developed blank was supplied rather than estimated. */
  developed: boolean;
}

/**
 * The blank rectangle every strip figure is built on.
 *
 * Prefers a DEVELOPED blank — the flat profile CAPPe produces in FASTBLANK,
 * supplied as a DXF. That profile is the answer to the question this function
 * asks; everything else here is an estimate of it.
 *
 * The fall-back is the bounding box of the FORMED part plus 5%, and it should be
 * read as what it is. A formed part's footprint is not its developed shape: on
 * the recorded audit geometry the bumper beam's bbox blank is 48% larger than
 * the metal the part contains and the seat bracket's is 39% larger, while a deep
 * drawn panel with tall walls goes the other way and the footprint understates
 * it. Wrong in both directions is worse than wrong in one, which is why the
 * confidence on the estimate is low and the basis says so out loud.
 *
 * This one function feeds the blank size, the strip pitch, the strip width, the
 * press feed rate and the die footprint — so a real blank fixes material cost,
 * cycle time and tooling together.
 */
export function blankDims(ctx: RuleContext): BlankDims | null {
  const dev = ctx.geo.blank;
  if (dev && dev.boundingRectMm.lengthMm > 0 && dev.boundingRectMm.widthMm > 0) {
    // The tool's own unfold is exact on a bent part and only a geometric
    // approximation on a drawn one (the metal stretched; no flattening is
    // distortion-free), so its confidence follows what the flattening found.
    const own = dev.developedFrom === 'solid';
    const strain = dev.maxStrainPct ?? 0;
    const solved = own && !!dev.forming;
    const stretched = own && dev.developable === false && strain <= 15;
    const drawn = own && dev.developable === false && strain > 15;
    const add = pressProcess(ctx).addendumMm;
    return {
      lengthMm: Math.round(dev.boundingRectMm.lengthMm + 2 * add),
      widthMm: Math.round(dev.boundingRectMm.widthMm + 2 * add),
      basis: `${own ? 'blank ' : 'developed blank from '}${dev.source} — ${(dev.grossAreaMm2 / 100).toFixed(0)} cm² profile `
        + `filling ${(dev.rectangleFill * 100).toFixed(0)}% of its ${Math.round(dev.boundingRectMm.lengthMm)}`
        + `×${Math.round(dev.boundingRectMm.widthMm)} mm rectangle`
        + (add > 0 ? ` + ${add} mm ${drawn ? 'binder and draw addendum' : 'trim allowance'} each side` : '')
        + (stretched && !solved ? '. Parts of the pressing are stretch-formed, so the unfold slightly understates the blank where the '
          + 'metal thinned; upload the FASTBLANK DXF for the formed-process profile' : '')
        + (drawn && !solved ? '. The skin stretched when flattened, so this part was drawn, not bent: the outline '
          + 'understates the blank where the metal thinned; upload the FASTBLANK DXF for the formed-process answer' : '')
        + (solved ? formingNote(ctx, dev) : ''),
      confidence: solved ? (drawn ? 0.75 : 0.8) : drawn ? 0.6 : stretched ? 0.75 : own ? 0.85 : 0.95,
      developed: true,
    };
  }
  const bb = ctx.geo.boundingBox;
  if (!bb) return null;
  const sorted = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a);
  const lengthMm = Math.round(sorted[0] * 1.05);
  const widthMm = Math.round(sorted[1] * 1.05);
  let basis = 'ESTIMATED from the formed part\u2019s bounding box × 1.05 — no developed blank was '
    + 'supplied. A formed part\u2019s footprint is not its flat pattern, so this can be well out '
    + 'in either direction; upload the FASTBLANK DXF to replace it with the real profile';
  let confidence = 0.45;
  // The B-rep says how much metal the part actually needs. When the rectangle
  // guess is more than 15% away from that, say so — the seat bracket's box buys
  // 637 cm² for a part whose blank is 444 cm² of metal. Only on a gauge measured
  // between bend pairs: with the bulk-wall read V/t is S/2 by construction, and
  // on a misread gauge (the mass floor's case) it would accuse the right rectangle.
  const ab = analyticBlank(ctx);
  if (ab && ab.gaugeSource === 'bend-pairs' && ab.grossAreaMm2 > 0) {
    const rect = lengthMm * widthMm;
    const ratio = rect / ab.grossAreaMm2;
    if (Math.abs(ratio - 1) > 0.15) {
      const pct = Math.round(Math.abs(ratio - 1) * 100);
      basis += `. CHECK: this ${(rect / 100).toFixed(0)} cm² rectangle is ${pct}% ${ratio > 1 ? 'more' : 'less'} than the `
        + `${(ab.grossAreaMm2 / 100).toFixed(0)} cm² the part\u2019s metal needs (volume ÷ gauge + holes)`
        + (ratio > 1 ? '; the real blank nests inside a smaller rectangle than this' : '; a drawn or tall-flanged part unfolds larger than its footprint');
      confidence = 0.35;
    }
  }
  return { lengthMm, widthMm, basis, confidence, developed: false };
}

/**
 * What the forming solve found, and whether the grade survives it — the
 * Keeler–Brazier check against the grade's n (typical published value until
 * JLR's coil data replaces it) at the measured gauge. Advisory on the blank's
 * basis; it moves no money.
 */
function formingNote(ctx: RuleContext, dev: NonNullable<RuleContext['geo']['blank']>): string {
  const f = dev.forming!;
  let note = `. Forming solve: ${(f.blankAreaUnfoldMm2 / 100).toFixed(0)} → ${(f.blankAreaSolvedMm2 / 100).toFixed(0)} cm² once the stretched metal is `
    + `put back; thinning ${f.thinningP95Pct.toFixed(0)}% at the 95th percentile, ${f.maxThinningPct.toFixed(0)}% at the worst well-shaped element`;
  const mat = materialFacts(ctx);
  const props = formingPropertiesFor(typeof ctx.answers['material.id'] === 'string' ? ctx.answers['material.id'] : null, mat.family ?? null);
  const t = ctx.geo.sheetMetal?.thicknessMm ?? 0;
  if (props && t > 0 && f.strainPoints?.length) {
    const chk = formingLimitCheck(f.strainPoints, props.nValue, t);
    note += `. Formability (Keeler–Brazier, n = ${props.nValue}${props.gradeSpecific ? '' : ' family typical'}, t = ${t.toFixed(2)} mm, `
      + `FLC₀ = ${chk.flc0.toFixed(2)}): worst point at ${chk.worstRatio.toFixed(2)} of the limit — `
      + (chk.verdict === 'pass' ? 'forms' : chk.verdict === 'marginal' ? 'MARGINAL, inside the usual safety band' : 'SPLITS; expect an extra draw stage or a different grade');
  }
  return note;
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
    read = sm.thicknessSource === 'bend-pairs'
      ? {
        mm: Math.round(sm.thicknessMm * 100) / 100,
        basis: `measured between ${sm.gaugeSamples ?? 0} bend pair(s) — the radius step from a bend\u2019s inner to its outer face is the coil gauge`,
        confidence: 0.95,
      }
      : {
        mm: Math.round(sm.thicknessMm * 100) / 100,
        basis: `bulk wall 2·V/S over ${sm.bendCount ?? 0} bend face(s) — coil gauge, reads a little low on a part with much cut edge`,
        confidence: 0.85,
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

/**
 * How the pressing is made, from what the blank told us. A bent or lightly
 * stretch-formed part runs from coil through one die; a drawn panel is blanked
 * first and drawn on a transfer press or, when it is big, a tandem line — one
 * press each for draw, trim, pierce, flange and restrike. The blank of a drawn
 * panel also carries the binder and draw addendum the trim die cuts off.
 */
export interface PressProcess {
  kind: 'bent' | 'stretch-formed' | 'drawn';
  pressLine: 'coil-fed' | 'transfer' | 'tandem';
  /** Operations on the line: 1 blank + bends + pierce for a die, or draw / trim / pierce / flange / restrike. */
  operations: string[];
  pressesInLine: number;
  blanking: 'none' | 'die' | 'laser';
  blanksPerMin: number;
  /** Binder + addendum around the outline, mm. */
  addendumMm: number;
  /** Draw depth, mm — the part's smallest extent less the gauge. */
  drawDepthMm: number;
  basis: string;
}

export function pressProcess(ctx: RuleContext): PressProcess {
  const dev = ctx.geo.blank;
  const strain = dev?.maxStrainPct ?? 0;
  const kind: PressProcess['kind'] = dev?.developedFrom === 'solid' && dev.developable === false
    ? (strain > 15 ? 'drawn' : 'stretch-formed') : 'bent';
  const bb = ctx.geo.boundingBox;
  const t = ctx.geo.sheetMetal?.thicknessMm ?? 0;
  const drawDepth = bb ? Math.max(0, Math.min(bb.xMm, bb.yMm, bb.zMm) - t) : 0;
  const blankCm2 = dev ? dev.grossAreaMm2 / 100 : (bb ? ([bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a).slice(0, 2).reduce((p, q) => p * q, 1) / 100) : 0);
  if (kind === 'drawn') {
    // Addendum: about half the draw depth, never under 20 mm nor over 80 — the
    // range die designers quote for a binder plus addendum on a body panel.
    const addendum = Math.round(Math.min(80, Math.max(20, 0.5 * drawDepth)));
    const tandem = blankCm2 >= 1500;
    return {
      kind, pressLine: tandem ? 'tandem' : 'transfer',
      operations: ['draw', 'trim', 'pierce', 'flange', 'restrike'], pressesInLine: 5,
      blanking: ctx.annualVolume < 30_000 ? 'laser' : 'die', blanksPerMin: ctx.annualVolume < 30_000 ? 20 : 45,
      addendumMm: addendum, drawDepthMm: drawDepth,
      basis: `drawn panel (${strain.toFixed(0)}% stretch): blanked first (${ctx.annualVolume < 30_000 ? 'laser, 20' : 'blanking press, 45'} blanks/min), `
        + `then ${tandem ? 'a tandem line, one press per operation' : 'a transfer press'} — draw, trim, pierce, flange, restrike; `
        + `${addendum} mm binder + addendum around the outline (½ × ${drawDepth.toFixed(0)} mm draw depth, 20–80 mm) is trimmed off`,
    };
  }
  if (kind === 'stretch-formed') {
    return {
      kind, pressLine: 'coil-fed', operations: [], pressesInLine: 1, blanking: 'none', blanksPerMin: 0,
      addendumMm: 10, drawDepthMm: drawDepth,
      basis: `stretch-formed in places (${strain.toFixed(0)}% stretch): run from coil through one die, with a 10 mm trim allowance around the outline`,
    };
  }
  return {
    kind, pressLine: 'coil-fed', operations: [], pressesInLine: 1, blanking: 'none', blanksPerMin: 0,
    addendumMm: 0, drawDepthMm: drawDepth,
    basis: 'bent part: run from coil through one die, no addendum',
  };
}

/** The strip layout: how the blank sits on the coil, and what that costs in metal. */
export interface StripLayout {
  pitchMm: number;
  stripWidthMm: number;
  webMm: number;
  edgeMm: number;
  /** Present when the blank's outline was nested; absent on the rectangle fall-back. */
  nested?: NestResult;
  pitchBasis: string;
  stripBasis: string;
  confidence: number;
}

const nestCache = new WeakMap<object, NestResult>();

/**
 * Pitch and strip width. With a developed blank's outline the blank is nested
 * on the coil (src/engine/nesting.ts): best orientation, the next blank as
 * close as the web allows on every scanline. Without one, the rectangle plus a
 * web and two edge margins — which cannot see the scrap inside the rectangle.
 * A 2-up interlock that saves 3 points or more is reported on the basis, not
 * applied: it needs a two-blank die, which is a tooling decision.
 */
export function stripLayout(ctx: RuleContext): StripLayout | null {
  const b = blankDims(ctx);
  const g = gaugeMm(ctx);
  if (!b || !g) return null;
  const web = Math.max(3, 2 * g.mm);
  const edge = Math.max(3, 2 * g.mm);
  const dev = ctx.geo.blank;
  if (dev?.outline && dev.outline.length >= 3) {
    const add = pressProcess(ctx).addendumMm;
    let nested = nestCache.get(dev);
    if (!nested) {
      try {
        nested = nestOnCoil(add > 0 ? offsetOutline(dev.outline, add) : dev.outline, { webMm: web, edgeMarginMm: edge });
        nestCache.set(dev, nested);
      } catch { nested = undefined; }
    }
    if (nested) {
      const one = nested.oneUp;
      const pct = (u: number) => `${Math.round(u * 100)}%`;
      const twoUp = nested.twoUp
        ? `; 2-up ${nested.twoUp.layout === '2-up-rotated' ? 'turned 180°' : 'mirrored'} would reach ${pct(nested.twoUp.utilisation)} `
          + `at ${Math.round(nested.twoUp.pitchMm)} mm per pair, but needs a two-blank die — shown, not applied`
        : '';
      const common = `blank outline${add > 0 ? ` grown by the ${add} mm addendum` : ''} nested on the coil, 1-up at ${Math.round(one.angleDeg)}°: pitch ${Math.round(one.pitchMm)} mm × `
        + `strip ${Math.round(one.stripWidthMm)} mm = ${pct(one.utilisation)} utilisation (the rectangle would give `
        + `${pct(nested.rectangleUtilisation)})${twoUp}`;
      return {
        pitchMm: Math.round(one.pitchMm), stripWidthMm: Math.round(one.stripWidthMm), webMm: web, edgeMm: edge, nested,
        pitchBasis: `${common} — ${web.toFixed(0)} mm web (max(3, 2 × gauge))`,
        stripBasis: `${common} — ${edge.toFixed(0)} mm edge margin each side`,
        confidence: 0.85,
      };
    }
  }
  return {
    pitchMm: Math.round(b.lengthMm + web), stripWidthMm: Math.round(b.widthMm + 2 * edge), webMm: web, edgeMm: edge,
    pitchBasis: `blank ${b.lengthMm} mm + ${web.toFixed(0)} mm web (max(3, 2 × gauge))`,
    stripBasis: `blank ${b.widthMm} mm + 2 × ${edge.toFixed(0)} mm edge margin`,
    confidence: 0.7,
  };
}

/** Hole count from the exact feature table — or the engineer's figure on a mesh upload. */
function holeCount(ctx: RuleContext): number {
  const h = holeRows(ctx);
  return 'decision' in h ? 0 : h.fact.value;
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
          why: 'No developed blank was supplied and no bounding box was measured, so the blank '
            + 'cannot be derived. Upload the FASTBLANK DXF, or enter the blank size.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('sheetMetal.blankLengthMm', b.lengthMm, 'geometry', b.basis, b.confidence);
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
          why: 'No developed blank was supplied and no bounding box was measured, so the blank '
            + 'cannot be derived. Upload the FASTBLANK DXF, or enter the blank size.',
          options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('sheetMetal.blankWidthMm', b.widthMm, 'geometry', b.basis, b.confidence);
      },
    },
    {
      // Cut length — what the blanking force and the press pick are sized on.
      // The rectangle's 2(L+W) ignores every hole: the seat bracket cuts
      // 1,939 mm (954 outline + 985 of holes) against the 1,012 mm the box gave,
      // half the press. The FASTBLANK profile is the answer when it exists; the
      // B-rep identity (S − 2V/t)/t reproduces it to 0.1% on a bent part.
      id: 'sheetMetal.perimeterMm',
      path: 'sheetMetal.perimeterMm',
      fieldId: 'sm-perim',
      label: 'perimeterMm',
      appliesWhen: (ctx) => !!blankDims(ctx),
      evaluate: (ctx) => {
        const dev = ctx.geo.blank;
        if (dev && dev.outerPerimeterMm > 0) {
          const total = dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0);
          const own = dev.developedFrom === 'solid';
          return decided('sheetMetal.perimeterMm', Math.round(total), 'geometry',
            `${Math.round(dev.outerPerimeterMm)} mm outline + ${Math.round(dev.holePerimeterMm ?? 0)} mm of `
            + `${dev.holeCount} hole edge(s), measured on ${own ? 'the blank unfolded from the solid' : dev.source}`, own ? 0.85 : 0.95);
        }
        const ab = analyticBlank(ctx);
        if (ab?.cutLengthMm) {
          return decided('sheetMetal.perimeterMm', ab.cutLengthMm, 'geometry',
            `outline + hole edges from the solid: (surface ${(ctx.geo.surfaceArea!.mm2 / 100).toFixed(0)} cm² − 2 × `
            + `${(ab.netAreaMm2 / 100).toFixed(0)} cm² blank) ÷ ${ab.gaugeMm.toFixed(2)} mm gauge`, 0.85);
        }
        const b = blankDims(ctx)!;
        return decided('sheetMetal.perimeterMm', 2 * (b.lengthMm + b.widthMm), 'rule',
          `2 × (${b.lengthMm} + ${b.widthMm}) of the blank rectangle — ignores the outline shape and every `
          + `hole, so the blanking force is understated; upload the FASTBLANK DXF for the real cut length`, 0.4);
      },
    },
    {
      // The press, from the blanking force the cut length implies — decided here
      // so the screen and the headless path pick the same press. The screen used
      // to size it from the rectangle's 2(L+W) before the rules' cut length had
      // reached the form, and landed a tier low.
      id: 'sheetMetal.pressId',
      path: 'sheetMetal.pressId',
      fieldId: 'sm-press',
      label: 'pressId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const b = blankDims(ctx);
        if (!b) return ask({
          id: 'sheetMetal.blank', kind: 'geometry_gap', question: 'What are the blank dimensions?',
          why: 'No blank, so no cut length to size the press on.', options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' }, blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        const dev = ctx.geo.blank;
        const ab = analyticBlank(ctx);
        const cut = dev && dev.outerPerimeterMm > 0 ? dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0)
          : ab?.cutLengthMm ?? 2 * (b.lengthMm + b.widthMm);
        const tonnes = (cut * r.advice.gauge * r.advice.shearMPa) / 9807;
        const id = pickStampingPressId(tonnes);
        return decided('sheetMetal.pressId', id, 'rule',
          `blanking force ≈ ${Math.round(cut)} mm cut × ${r.advice.gauge.toFixed(2)} mm × ${r.advice.shearMPa} MPa = ${tonnes.toFixed(0)} t, `
          + `× 1.25 safety → the smallest press over ${Math.round(tonnes * 1.25)} t`, 0.75);
      },
    },
    {
      id: 'sheetMetal.numOps',
      path: 'sheetMetal.numOps',
      fieldId: 'sm-num-ops',
      label: 'numOps',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        if (proc.kind === 'drawn') {
          return decided('sheetMetal.numOps', proc.operations.length, 'geometry',
            `${proc.operations.join(', ')} — the operations of a drawn panel`, 0.7);
        }
        const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
        const holes = holeCount(ctx);
        return decided('sheetMetal.numOps', stations(ctx), 'geometry',
          `1 blank + ${bends} bend(s)${holes > 0 ? ' + 1 pierce' : ''} = ${stations(ctx)} stations`,
          bends > 0 ? 0.75 : 0.4);
      },
    },
    {
      // BIW process: how the pressing is made. From the blank's own evidence —
      // a drawn panel is blanked first and drawn on a transfer press or a
      // tandem line; everything else runs from coil through one die.
      id: 'sheetMetal.pressLine',
      path: 'sheetMetal.pressLine',
      fieldId: 'sm-press-line',
      label: 'pressLine',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        return decided('sheetMetal.pressLine', proc.pressLine, 'geometry', proc.basis, proc.kind === 'drawn' ? 0.7 : 0.8);
      },
    },
    {
      id: 'sheetMetal.pressesInLine',
      path: 'sheetMetal.pressesInLine',
      fieldId: 'sm-presses',
      label: 'pressesInLine',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        return proc.pressLine === 'tandem'
          ? decided('sheetMetal.pressesInLine', proc.pressesInLine, 'rule', `one press per operation: ${proc.operations.join(', ')}`, 0.7)
          : decided('sheetMetal.pressesInLine', 1, 'rule', proc.pressLine === 'transfer' ? 'one transfer press' : 'one press, coil-fed', 0.8);
      },
    },
    {
      id: 'sheetMetal.blankingMethod',
      path: 'sheetMetal.blankingMethod',
      fieldId: 'sm-blanking',
      label: 'blankingMethod',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        return decided('sheetMetal.blankingMethod', proc.blanking, 'rule',
          proc.blanking === 'none' ? 'coil-fed die — the blank is cut in the die'
            : proc.blanking === 'laser' ? 'laser blanking line — no blanking die at this volume'
            : 'blanking press from coil, feeding the line', 0.7);
      },
    },
    {
      id: 'sheetMetal.blanksPerMin',
      path: 'sheetMetal.blanksPerMin',
      fieldId: 'sm-blank-bpm',
      label: 'blanksPerMin',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        return decided('sheetMetal.blanksPerMin', proc.blanksPerMin, 'rule',
          proc.blanking === 'none' ? 'none — the blank is cut in the die'
            : proc.blanking === 'laser' ? 'a coil-fed laser blanking line at ~20 blanks/min on a body-panel blank'
            : 'a blanking press at ~45 blanks/min', 0.6);
      },
    },
    {
      id: 'sheetMetal.drawAddendumMm',
      path: 'sheetMetal.drawAddendumMm',
      fieldId: 'sm-addendum',
      label: 'drawAddendumMm',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        return decided('sheetMetal.drawAddendumMm', proc.addendumMm, 'rule', proc.basis, 0.6);
      },
    },
    {
      // Strip layout: how the blank nests on the coil. Blank + a web between
      // parts (pitch) and an edge margin per side (strip width). These were
      // blind mapper defaults until the A/B showed them costing real money.
      id: 'sheetMetal.pitchMm',
      path: 'sheetMetal.pitchMm',
      fieldId: 'sm-pitch',
      label: 'pitchMm',
      appliesWhen: (ctx) => !!stripLayout(ctx),
      evaluate: (ctx) => {
        const l = stripLayout(ctx)!;
        return decided('sheetMetal.pitchMm', l.pitchMm, l.nested ? 'geometry' : 'rule', l.pitchBasis, l.confidence);
      },
    },
    {
      id: 'sheetMetal.stripWidthMm',
      path: 'sheetMetal.stripWidthMm',
      fieldId: 'sm-strip-w',
      label: 'stripWidthMm',
      appliesWhen: (ctx) => !!stripLayout(ctx),
      evaluate: (ctx) => {
        const l = stripLayout(ctx)!;
        return decided('sheetMetal.stripWidthMm', l.stripWidthMm, l.nested ? 'geometry' : 'rule', l.stripBasis, l.confidence);
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
      appliesWhen: (ctx) => !!stripLayout(ctx),
      evaluate: (ctx) => {
        const pitch = stripLayout(ctx)!.pitchMm;
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
        const proc = pressProcess(ctx);
        if (proc.kind === 'drawn') {
          return decided('sheetMetal.dieType', proc.pressLine === 'tandem' ? 'single_stage' : 'transfer', 'geometry',
            proc.pressLine === 'tandem' ? 'a tandem line: one single-stage die per press' : 'a transfer die, one station per operation', 0.7);
        }
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
      // The grade. Without it the screen kept the drop-down's first entry (DC01,
      // a small-lot delivered price, £0.91/kg) while headless costed the
      // representative coil grade (DC04, £0.77/kg) — 16% apart on the same
      // seat bracket's material (2 Oct 2026). Same pattern as casting.materialId.
      id: 'sheetMetal.materialId',
      path: 'sheetMetal.materialId',
      fieldId: 'sm-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        // Is it sheet metal at all? Asked before the material, as in advise().
        const amb = thinWallAmbiguity(ctx);
        if (amb.decision) return ask(amb.decision);
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        const id = representativeMaterialId(ctx.commodity, mat.family!);
        return decided('sheetMetal.materialId', id ?? mat.family!, 'geometry',
          `${mat.family} → ${id ?? mat.family} (representative coil grade — not a drawing callout)`, 0.85);
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

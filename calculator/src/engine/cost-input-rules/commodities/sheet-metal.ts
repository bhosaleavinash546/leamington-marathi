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
import { countryFactor, countryNote } from '../../regional-services.js';
import { activeMachineRate, activeLabourRate } from '../../rate-context.js';
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
import { pickStampingPressId, stampingPressFacts } from '../../machine-sizing.js';
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { estimateBlankingCycleSec } from '../../modules/sheet-metal-fab.js';
import { standardBatchSize } from '../../routing-optimiser.js';
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
/** The thickest gauge costed as cold-rolled coil; heavier steel is hot-rolled (CostVision engineering heuristic). */
export const SHEET_COLD_ROLLED_MAX_MM = 3;

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
  // A bent blank too wide for a progressive strip carrier is blanked first and
  // run on a transfer press (sheet-metal review: a 1 m bent part was put on a
  // coil-fed progressive die).
  const shortSide = dev?.boundingRectMm ? Math.min(dev.boundingRectMm.lengthMm, dev.boundingRectMm.widthMm) : (bb ? [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a)[1] : 0);
  if (shortSide > LARGE_BLANK_MM) {
    const laser = ctx.annualVolume < 30_000;
    return {
      kind, pressLine: 'transfer', operations: [], pressesInLine: 1,
      blanking: laser ? 'laser' : 'die', blanksPerMin: laser ? 20 : 45,
      addendumMm: 0, drawDepthMm: drawDepth,
      basis: `bent part with a ${shortSide.toFixed(0)} mm blank — wider than a progressive strip carries (${LARGE_BLANK_MM} mm), `
        + `so blanked first (${laser ? 'laser, 20' : 'blanking press, 45'} blanks/min) and formed on a transfer press`,
    };
  }
  return {
    kind, pressLine: 'coil-fed', operations: [], pressesInLine: 1, blanking: 'none', blanksPerMin: 0,
    addendumMm: 0, drawDepthMm: drawDepth,
    basis: 'bent part: run from coil through one die, no addendum',
  };
}

/** Widest blank a progressive die's strip carries before a transfer press is the norm, mm (engineering-typical). */
export const LARGE_BLANK_MM = 600;

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
 * Die stations for a coil-fed die. It was one per measured bend FACE + blank +
 * pierce, capped at 12: the 15-"bend" seat bracket got a 12-station die and,
 * at a 233 mm pitch, a 2.8 m die. A progressive station forms several bends
 * at once — about three is engineering-typical — so: pierce (if holes) + one
 * station per three bends + cut-off, + a restrike on a stretch-formed part.
 */
function stations(ctx: RuleContext): number {
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  const proc = pressProcess(ctx);
  if (proc.kind === 'drawn') return proc.operations.length;
  return Math.min(12, Math.max(1, (holeCount(ctx) > 0 ? 1 : 0) + Math.ceil(bends / BENDS_PER_STATION) + 1
    + (proc.kind === 'stretch-formed' ? 1 : 0)));
}
export const BENDS_PER_STATION = 3;

/** UTS from shear (typical UTS ≈ shear ÷ 0.8) — the forming forces run on UTS. */
const UTS_PER_SHEAR = 1 / 0.8;

export interface StampingPlan {
  pressLine: 'coil-fed' | 'transfer' | 'tandem';
  dieType: StampingDieType;
  stations: number;
  presses: number;
  tonnes: number;
  forceBasis: string;
  bolsterMm: number;
  bolsterBasis: string;
  pressId: string;
  spm: number;
  spmBasis: string;
  dieCostGBP: number;
  dieBasis: string;
}

/**
 * The whole stamping plan, decided once so every rule agrees. Before the review
 * the die type came from the advisor, the press line from the blank, the die
 * cost from the advisor again and the press from blanking force alone — so a
 * part could be a "transfer" die fed from coil, a "single-stage" die with 12
 * stations, or a tandem line priced as a progressive die.
 */
export function stampingPlan(ctx: RuleContext): StampingPlan | null {
  const r = advise(ctx);
  if ('blocked' in r) return null;
  const b = blankDims(ctx);
  if (!b) return null;
  const proc = pressProcess(ctx);
  const t = r.advice.gauge;
  const shear = r.advice.shearMPa;
  const uts = Math.round(shear * UTS_PER_SHEAR);
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  const bendLen = ctx.geo.sheetMetal?.totalBendLengthMm ?? 0;
  const dev = ctx.geo.blank;
  const ab = analyticBlank(ctx);
  const cut = dev && dev.outerPerimeterMm > 0 ? dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0)
    : ab?.cutLengthMm ?? 2 * (b.lengthMm + b.widthMm);
  const cutT = cut * t * shear / 9807;
  // V-bend force F = 1.33·L·t²·UTS / W at a die opening W ≈ 8t → 0.166·L·t·UTS.
  const bendT = 0.166 * bendLen * t * uts / 9807;
  const bb = ctx.geo.boundingBox;
  const foot = bb ? [bb.xMm, bb.yMm, bb.zMm].sort((x, y) => y - x) : [b.lengthMm, b.widthMm, 0];
  // Drawing: punch perimeter × t × UTS, + the blank holder: binder pressure ×
  // the binder area (blank outside the punch footprint). A flat +30% stood in
  // for the binder, which on a large panel is the bigger force.
  const punchT = proc.kind === 'drawn' ? 2 * (foot[0] + foot[1]) * t * uts / 9807 : 0;
  const binderAreaMm2 = Math.max(0, b.lengthMm * b.widthMm - foot[0] * foot[1]);
  const binderT = proc.kind === 'drawn' ? BINDER_PRESSURE_MPA * binderAreaMm2 / 9807 : 0;
  const drawT = punchT + binderT;
  const longSide = Math.max(b.lengthMm, b.widthMm);
  const layout = stripLayout(ctx);

  let pressLine: StampingPlan['pressLine'] = proc.pressLine;
  let dieType: StampingDieType;
  let st: number;
  let presses = 1;
  let tonnes: number;
  let forceBasis: string;
  let bolsterMm: number;
  let bolsterBasis: string;
  if (proc.kind === 'drawn') {
    st = proc.operations.length;
    presses = pressLine === 'tandem' ? proc.pressesInLine : 1;
    dieType = pressLine === 'tandem' ? 'single_stage' : 'transfer';
    tonnes = pressLine === 'tandem' ? Math.max(drawT, cutT) : drawT + cutT + bendT;
    forceBasis = pressLine === 'tandem'
      ? `the draw press sizes the line: ${Math.round(2 * (foot[0] + foot[1]))} mm punch perimeter × ${t} mm × ${uts} MPa UTS = ${Math.round(punchT)} t `
        + `+ blank holder ${BINDER_PRESSURE_MPA} MPa × ${Math.round(binderAreaMm2 / 100)} cm² binder = ${Math.round(binderT)} t → ${Math.round(drawT)} t (trim ${Math.round(cutT)} t)`
      : `draw ${Math.round(drawT)} t + trim/pierce ${Math.round(cutT)} t + flange ${Math.round(bendT)} t, all in one transfer press`;
    bolsterMm = pressLine === 'tandem' ? Math.round(longSide + 600) : Math.round(st * (longSide + 100) + 400);
    bolsterBasis = pressLine === 'tandem' ? `one die per press: ${Math.round(longSide)} mm blank + 600 mm`
      : `${st} stations × (${Math.round(longSide)} + 100) mm + 400 mm`;
  } else if (pressLine === 'transfer') {
    st = Math.min(12, Math.max(2, 1 + Math.ceil(bends / BENDS_PER_STATION) + (holeCount(ctx) > 0 ? 1 : 0)));
    dieType = 'transfer';
    tonnes = cutT + bendT;
    forceBasis = `pierce/trim ${Math.round(cutT)} t + bending ${Math.round(bendT)} t in one transfer press`;
    bolsterMm = Math.round(st * (longSide + 100) + 400);
    bolsterBasis = `${st} stations × (${Math.round(longSide)} + 100) mm + 400 mm`;
  } else {
    st = stations(ctx);
    dieType = st <= 2 ? 'single_stage' : 'progressive';
    tonnes = 1.1 * (cutT + bendT);
    forceBasis = `cut ${Math.round(cut)} mm × ${t} mm × ${shear} MPa = ${Math.round(cutT)} t + bending 0.166 × ${Math.round(bendLen)} mm × ${t} mm × ${uts} MPa = ${Math.round(bendT)} t, + 10% stripper`;
    const pitch = layout?.pitchMm ?? b.lengthMm;
    bolsterMm = Math.round(st * pitch + 400);
    bolsterBasis = `${st} station(s) × ${Math.round(pitch)} mm pitch + 400 mm`;
  }
  const pressId = pickStampingPressId(tonnes, 1.25, { bolsterMm });
  const pf = stampingPressFacts(pressId);

  let spm: number;
  let spmBasis: string;
  if (pressLine === 'tandem') {
    spm = TANDEM_LINE_SPM;
    spmBasis = `tandem line rate ${TANDEM_LINE_SPM} SPM (engineering-typical 8–15 with automated transfer between presses)`;
  } else if (pressLine === 'transfer') {
    spm = Math.min(pf.maxSpm, TRANSFER_SPM);
    spmBasis = `transfer press: the feeder limits it to ~${TRANSFER_SPM} SPM (press max ${pf.maxSpm})`;
  } else {
    const pitch = layout?.pitchMm ?? b.lengthMm;
    let v = Math.min(18_000 / pitch, pf.maxSpm);
    if (bends >= 4) v *= 0.8;
    if (bends >= 8) v *= 0.8;
    if (bends >= 14) v *= 0.8;
    spm = Math.max(5, Math.round(v));
    spmBasis = `min(feed 18 m/min ÷ ${Math.round(pitch)} mm pitch, ${pressId} max ${pf.maxSpm} SPM)`
      + (bends >= 4 ? `, de-rated for ${bends} bends` : '');
  }

  const blankAreaCm2 = (b.lengthMm * b.widthMm) / 100;
  const soft = dieClassFor(ctx).soft;
  const dieRaw = pressLine === 'tandem'
    ? presses * estimateStampingDieCost({ dieType: 'single_stage', stations: 1, blankAreaCm2, shearStrengthMPa: shear }).total
    : estimateStampingDieCost({ dieType, stations: st, blankAreaCm2, shearStrengthMPa: shear }).total;
  const die = Math.round(dieRaw * (soft ? SOFT_TOOL.costFactor : 1));
  const occt = ctx.geo.toolingCostEstimates?.progressiveDieCostGBP;
  const dieBasis = (pressLine === 'tandem'
    ? `${presses} single-stage dies, one per press (${proc.operations.join(', ')}), ${Math.round(blankAreaCm2)} cm² blank`
    : `${dieType.replace('_', '-')} die, ${st} station(s), ${Math.round(blankAreaCm2)} cm² blank`)
    + `, ${shear} MPa shear — toolmaker build-up`
    + (soft ? `; SOFT TOOLING (${SOFT_TOOL.label}) at ${SOFT_TOOL.costFactor} × the £${Math.round(dieRaw).toLocaleString()} production die — ${dieClassFor(ctx).basis}` : '')
    + (occt ? `; kernel face-count parametric said £${Math.round(occt).toLocaleString()} (not used)` : '');
  return { pressLine, dieType, stations: st, presses, tonnes: Math.round(tonnes), forceBasis, bolsterMm, bolsterBasis,
    pressId, spm, spmBasis, dieCostGBP: die, dieBasis };
}
export const TANDEM_LINE_SPM = 10;
/** Blank-holder (binder) pressure on a drawn steel panel, MPa (engineering-typical 2–3). */
export const BINDER_PRESSURE_MPA = 2.5;

/**
 * Soft tooling for a short programme. A production die set for a part made
 * 2,000 a year put £117–423 a part of tooling on a drawn panel; a press shop
 * builds zinc-alloy (Kirksite) or soft-steel dies for that — engineering-typical
 * ~⅓ of the production die, good for ~10–25k hits.
 */
export const SOFT_TOOL = { costFactor: 0.35, life: 25_000, label: 'zinc-alloy / soft-steel dies', maxProgrammeParts: 25_000 };
export const PROGRAMME_YEARS_SM = 5;
export function dieClassFor(ctx: RuleContext): { soft: boolean; basis: string } {
  const parts = ctx.annualVolume * PROGRAMME_YEARS_SM;
  return parts <= SOFT_TOOL.maxProgrammeParts
    ? { soft: true, basis: `${parts.toLocaleString('en-GB')} parts over ${PROGRAMME_YEARS_SM} years — within a soft tool's life` }
    : { soft: false, basis: `${parts.toLocaleString('en-GB')} parts over ${PROGRAMME_YEARS_SM} years — production steel dies` };
}
// ── Route: stamping, or laser cutting + press brake ──────────────────────────

/**
 * Laser + press brake, priced the way the fabrication module prices it. The
 * advisor's route was a volume rule (under 50,000/yr → laser), and the CAD path
 * never followed it: it announced "Laser Cutting" and costed a stamping die —
 * £57.95 a part for the seat bracket at 2,000/yr, £47 of it a die nobody would
 * build. Constants are engineering-typical and stated on the rules.
 */
export const FAB = {
  laserId: 'laser-trumpf-3030', brakeSmallId: 'brake-trumpf-trubend3100', brakeLargeId: 'brake-trumpf-5230',
  bendSec: 12, handlingSec: 10, toolChanges: 2, toolChangeSec: 900, toolingGBP: 1500,
  laserLabourId: 'lab-uk-semiskilled', brakeLabourId: 'lab-uk-skilled',
} as const;

/** Nest + brake programming and first-off in the costed country: engineering time (regional-services.ts). */
export function fabToolingGBP(): number { return Math.round(FAB.toolingGBP * countryFactor('engineer')); }

export interface FabPlan {
  feasible: boolean;
  why: string;
  laserCycleSec: number;
  bends: number;
  brakeId: string;
  batch: number;
  perPartGBP: number;
}

// The route price (stamping v laser + brake) in the costed country — it used to be
// priced at UK rates whatever the country, so the route could flip on the wrong economics.
const machineRate = (id: string) => activeMachineRate(id);
const labourRate = (id: string) => activeLabourRate(id);

export function fabPlan(ctx: RuleContext): FabPlan | null {
  const r = advise(ctx);
  if ('blocked' in r) return null;
  const b = blankDims(ctx);
  if (!b) return null;
  const proc = pressProcess(ctx);
  const t = r.advice.gauge;
  const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
  const holes = holeCount(ctx);
  const batch = standardBatchSize(ctx.annualVolume);
  const big = Math.max(b.lengthMm, b.widthMm) > 1500;
  const brakeId = big ? FAB.brakeLargeId : FAB.brakeSmallId;
  let feasible = true; let why = '';
  if (proc.kind !== 'bent') { feasible = false; why = `${proc.kind} — a press brake cannot stretch or draw metal; it needs a die`; }
  else if (t > 12) { feasible = false; why = `${t} mm is beyond a fibre laser's economic range`; }
  else if (Math.max(b.lengthMm, b.widthMm) > 3000 || Math.min(b.lengthMm, b.widthMm) > 1500) { feasible = false; why = 'blank larger than a 3 × 1.5 m laser bed'; }
  const dev = ctx.geo.blank;
  const ab = analyticBlank(ctx);
  const cut = dev && dev.outerPerimeterMm > 0 ? dev.outerPerimeterMm + (dev.holePerimeterMm ?? 0)
    : ab?.cutLengthMm ?? 2 * (b.lengthMm + b.widthMm);
  const fam = r.advice.family === 'aluminium' ? 'aluminium' : 'mild_steel';
  const laserCycleSec = Math.round(estimateBlankingCycleSec({
    method: 'laser', materialFamily: fam, thicknessMm: t, cutLengthMm: cut, pierceCount: holes + 1,
  }) * 10) / 10;
  const brakeSec = bends * FAB.bendSec + (bends > 0 ? FAB.handlingSec : 0) + (bends > 0 ? FAB.toolChanges * FAB.toolChangeSec / batch : 0);
  const oee = 0.8;
  const gas = fam === 'aluminium' ? 9.0 : 1.8;
  const perPart = laserCycleSec / 3600 * (machineRate(FAB.laserId) / oee + gas + labourRate(FAB.laserLabourId) / 0.92)
    + brakeSec / 3600 * (machineRate(brakeId) / oee + labourRate(FAB.brakeLabourId) / 0.92)
    + fabToolingGBP() / Math.max(1, ctx.annualVolume);
  return { feasible, why, laserCycleSec, bends, brakeId, batch, perPartGBP: Math.round(perPart * 10_000) / 10_000 };
}

/** Stamping per part on the plan: press (+ blanking) time, crew, die amortised over a year. */
export function stampingPerPartGBP(ctx: RuleContext, plan: StampingPlan): number {
  const proc = pressProcess(ctx);
  const floor = plan.dieType === 'transfer' ? 3.0 : plan.dieType === 'progressive' ? 0.75 : 1.5;
  const strokeSec = Math.max(60 / plan.spm, floor) * plan.presses;
  const man = pressManning(plan).n;
  let v = strokeSec / 3600 * (machineRate(plan.pressId) / 0.8 + labourRate('lab-uk-semiskilled') * man / 0.92);
  if (proc.blanking !== 'none' && proc.blanksPerMin > 0) {
    v += 60 / proc.blanksPerMin / 3600 * (machineRate(proc.blanking === 'laser' ? 'laser-trumpf-5030' : 'press-200t') / 0.8
      + labourRate('lab-uk-semiskilled') / 0.92);
  }
  const r = advise(ctx);
  const life = dieClassFor(ctx).soft ? SOFT_TOOL.life
    : 'blocked' in r ? 1_000_000 : estimateStampingDieLife({ shearStrengthMPa: r.advice.shearMPa, thicknessMm: r.advice.gauge, dieType: plan.dieType });
  const sets = Math.max(1, Math.ceil(ctx.annualVolume / life));
  return Math.round((v + plan.dieCostGBP * sets / Math.max(1, ctx.annualVolume)) * 10_000) / 10_000;
}

/** Operators per press: an automatic coil line ≤ 400 t is tended one to two presses; larger, transfer and tandem lines one a press. */
export function pressManning(plan: StampingPlan): { n: number; basis: string } {
  const t = Number(/(\d+)t/.exec(plan.pressId)?.[1] ?? 0);
  return plan.pressLine === 'coil-fed' && t <= 400
    ? { n: 0.5, basis: `coil-fed ${plan.pressId}: one operator tends two automatic presses (engineering-typical)` }
    : { n: 1, basis: `${plan.pressLine} line on a ${plan.pressId}: one operator per press (engineering-typical)` };
}
/** Press-shop scrap (start-up, coil ends, splits): 1–2% typical; 1.5% is used. */
export const PRESS_REJECT = 0.015;

export interface RouteChoice { route: 'stamping' | 'fab'; basis: string; fab: FabPlan | null; stampGBP: number | null }

/**
 * Stamping or laser + brake, by the arithmetic. An engineer who chose
 * sheet_metal_fab gets the fab route when the part can be brake-formed.
 */
export function routeChoice(ctx: RuleContext): RouteChoice | null {
  const plan = stampingPlan(ctx);
  const fab = fabPlan(ctx);
  if (!plan || !fab) return null;
  const stamp = stampingPerPartGBP(ctx, plan);
  if (!fab.feasible) {
    return { route: 'stamping', fab, stampGBP: stamp,
      basis: `stamping — laser + brake is not an option: ${fab.why}` };
  }
  const chosenFab = ctx.commodity === 'sheet_metal_fab' || fab.perPartGBP < stamp;
  return { route: chosenFab ? 'fab' : 'stamping', fab, stampGBP: stamp,
    basis: `${ctx.commodity === 'sheet_metal_fab' ? 'fabrication chosen by the engineer; ' : ''}`
      + `at ${ctx.annualVolume.toLocaleString('en-GB')}/yr: stamping £${stamp.toFixed(3)}/part `
      + `(${plan.dieType.replace('_', '-')} die £${Math.round(plan.dieCostGBP).toLocaleString()} amortised over the year) `
      + `vs laser + brake £${fab.perPartGBP.toFixed(3)}/part (${fab.laserCycleSec} s laser, ${fab.bends} bend(s), £${fabToolingGBP()} programming) `
      + `— machine + labour + tooling; material is taken as equal` };
}

export const TRANSFER_SPM = 20;

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
        const plan = stampingPlan(ctx);
        if (!plan) return ask({
          id: 'sheetMetal.blank', kind: 'geometry_gap', question: 'What are the blank dimensions?',
          why: 'No blank, so no cut length to size the press on.', options: [{ value: 'enter', label: 'Enter blank length and width' }],
          entry: { kind: 'number' }, blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        const pf = stampingPressFacts(plan.pressId);
        return decided('sheetMetal.pressId', plan.pressId, 'rule',
          `${plan.forceBasis} = ${plan.tonnes} t, × 1.25 safety; die ${plan.bolsterMm} mm long (${plan.bolsterBasis}) — `
          + `the smallest press over ${Math.round(plan.tonnes * 1.25)} t with a bolster that takes it (${plan.pressId}: ${pf.bolsterMm} mm, typical)`, 0.7);
      },
    },
    {
      id: 'sheetMetal.numOps',
      path: 'sheetMetal.numOps',
      fieldId: 'sm-num-ops',
      label: 'numOps',
      evaluate: (ctx) => {
        const proc = pressProcess(ctx);
        const plan = stampingPlan(ctx);
        if (proc.kind === 'drawn') {
          return decided('sheetMetal.numOps', proc.operations.length, 'geometry',
            `${proc.operations.join(', ')} — the operations of a drawn panel`, 0.7);
        }
        const bends = ctx.geo.sheetMetal?.bendCount ?? 0;
        const holes = holeCount(ctx);
        const n = plan?.stations ?? stations(ctx);
        return decided('sheetMetal.numOps', n, 'geometry',
          `${holes > 0 ? 'pierce + ' : ''}${Math.ceil(bends / BENDS_PER_STATION)} forming station(s) for ${bends} bend(s) at ~${BENDS_PER_STATION} a station + cut-off`
          + `${proc.kind === 'stretch-formed' ? ' + restrike' : ''} = ${n}`, bends > 0 ? 0.65 : 0.4);
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
        const plan = stampingPlan(ctx);
        if (!plan) {
          const pitch = stripLayout(ctx)!.pitchMm;
          return decided('sheetMetal.strokesPerMin', Math.round(Math.min(60, Math.max(10, 18_000 / pitch))), 'rule',
            `feed-limited: 18 m/min ÷ ${pitch.toFixed(0)} mm pitch (no press plan yet)`, 0.4);
        }
        return decided('sheetMetal.strokesPerMin', plan.spm, 'rule', plan.spmBasis, 0.6);
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
        const plan = stampingPlan(ctx)!;
        return decided('sheetMetal.dieCostGBP', plan.dieCostGBP, 'advisor', plan.dieBasis, 0.6);
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
        if (dieClassFor(ctx).soft) {
          return decided('sheetMetal.dieLife', SOFT_TOOL.life, 'rule',
            `soft tooling (${SOFT_TOOL.label}): ~${SOFT_TOOL.life.toLocaleString('en-GB')} hits, engineering-typical`, 0.5);
        }
        const life = estimateStampingDieLife({
          shearStrengthMPa: r.advice.shearMPa,
          thicknessMm: r.advice.gauge,
          dieType: stampingPlan(ctx)?.dieType ?? r.advice.dieType,
        });
        return decided('sheetMetal.dieLife', life, 'advisor',
          `${r.advice.shearMPa} MPa shear at ${r.advice.gauge} mm on a ${stampingPlan(ctx)?.dieType ?? r.advice.dieType} die`, 0.6);
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
        const plan = stampingPlan(ctx)!;
        return decided('sheetMetal.dieType', plan.dieType, 'geometry',
          plan.pressLine === 'tandem' ? 'a tandem line: one single-stage die per press'
            : plan.pressLine === 'transfer' ? 'blanks fed to a transfer press, one station per operation'
            : plan.dieType === 'progressive' ? `coil-fed progressive die, ${plan.stations} stations`
            : 'coil-fed single-stage (compound) die', 0.75);
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
        // Above 3 mm a steel pressing is bought hot-rolled (pickled & oiled), not as cold-rolled deep-drawing coil —
        // a 5 mm plate sprocket was costed in DC04 (uploaded-parts review, Oct 2026).
        const g = gaugeMm(ctx);
        const heavySteel = mat.family === 'steel' && g != null && g.mm > SHEET_COLD_ROLLED_MAX_MM;
        const id = heavySteel ? 'mat-hrpo' : representativeMaterialId(ctx.commodity, mat.family!);
        return decided('sheetMetal.materialId', id ?? mat.family!, 'geometry',
          `${mat.family} → ${id ?? mat.family} (representative ${heavySteel ? `hot-rolled grade for a ${g!.mm.toFixed(1)} mm gauge — cold-rolled coil stops at ~${SHEET_COLD_ROLLED_MAX_MM} mm` : 'coil grade'} — not a drawing callout)`, 0.85);
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
        // Detected weld nuts / studs are bought, not blanked from the strip: their
        // steel comes off the part's weight here, once, for both screen and
        // headless (the screen did it on its own, headless not at all).
        const hw = ctx.geo.detectedHardware;
        const hwCm3 = hw?.available && hw.detected?.length ? (hw.totalVolumeCm3 ?? 0) : 0;
        const dens = r.advice.massKg && ctx.geo.volume?.cm3 ? r.advice.massKg / ctx.geo.volume.cm3 : 0;
        const kg = hwCm3 > 0 && dens > 0 ? Math.round((r.advice.massKg - hwCm3 * dens) * 10_000) / 10_000 : r.advice.massKg;
        return decided('sheetMetal.netWeightKg', kg, 'geometry',
          r.advice.massBasis + (hwCm3 > 0 ? `, less ${hwCm3.toFixed(1)} cm³ of detected hardware (bought, not blanked)` : ''), 0.9);
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
    {
      // Stamping or laser + press brake — by the arithmetic, both routes priced.
      id: 'sheetMetal.route',
      path: 'sheetMetal.route',
      label: 'route',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const rc = routeChoice(ctx);
        if (!rc) return decided('sheetMetal.route', 'stamping', 'rule', 'no blank to price the fabrication route on — stamping', 0.4);
        return decided('sheetMetal.route', rc.route, 'rule', rc.basis, 0.6);
      },
    },
    {
      id: 'sheetMetal.manning',
      path: 'sheetMetal.manning',
      fieldId: 'sm-manning',
      label: 'manning',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const plan = stampingPlan(ctx);
        if (!plan) return decided('sheetMetal.manning', 1, 'rule', 'no press plan — one operator', 0.4);
        const m = pressManning(plan);
        return decided('sheetMetal.manning', m.n, 'rule', m.basis, 0.5);
      },
    },
    {
      id: 'sheetMetal.rejectRate',
      path: 'sheetMetal.rejectRate',
      fieldId: 'sm-reject',
      label: 'rejectRate',
      evaluate: () => decided('sheetMetal.rejectRate', PRESS_REJECT, 'rule',
        'press-shop scrap (start-up, coil ends, splits), engineering-typical 1–2%', 0.5),
    },
    {
      id: 'sheetMetal.fabBlankingCycleSec',
      path: 'sheetMetal.fabBlankingCycleSec',
      fieldId: 'smf-blank-ct',
      label: 'fabBlankingCycleSec',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const f = routeChoice(ctx)!.fab!;
        return decided('sheetMetal.fabBlankingCycleSec', f.laserCycleSec, 'geometry',
          `laser: measured cut length ÷ the fibre-laser feed for the gauge + pierces + 8 s sheet handling (estimateBlankingCycleSec)`, 0.6);
      },
    },
    {
      id: 'sheetMetal.fabBendCount',
      path: 'sheetMetal.fabBendCount',
      fieldId: 'smf-bends',
      label: 'fabBendCount',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const f = routeChoice(ctx)!.fab!;
        return decided('sheetMetal.fabBendCount', f.bends, 'geometry', `${f.bends} bend(s) measured on the solid`, 0.75);
      },
    },
    {
      id: 'sheetMetal.fabBendSec',
      path: 'sheetMetal.fabBendSec',
      fieldId: 'smf-bend-t',
      label: 'fabBendSec',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const f = routeChoice(ctx)!.fab!;
        const v = f.bends > 0 ? Math.round((FAB.bendSec + FAB.handlingSec / f.bends) * 10) / 10 : FAB.bendSec;
        return decided('sheetMetal.fabBendSec', v, 'rule',
          `${FAB.bendSec} s a bend on a CNC brake + ${FAB.handlingSec} s handling a part spread over the bends (engineering-typical; the form's 45 s is a large-part figure)`, 0.5);
      },
    },
    {
      id: 'sheetMetal.fabToolChanges',
      path: 'sheetMetal.fabToolChanges',
      fieldId: 'smf-tool-chg',
      label: 'fabToolChanges',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabToolChanges', FAB.toolChanges, 'rule', 'two brake tool set-ups a batch (engineering-typical)', 0.5);
      },
    },
    {
      id: 'sheetMetal.fabToolChangeSec',
      path: 'sheetMetal.fabToolChangeSec',
      fieldId: 'smf-tool-chg-t',
      label: 'fabToolChangeSec',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabToolChangeSec', FAB.toolChangeSec, 'rule', '15 min a brake tool set-up (engineering-typical)', 0.5);
      },
    },
    {
      id: 'sheetMetal.fabBatchSize',
      path: 'sheetMetal.fabBatchSize',
      fieldId: 'smf-batch',
      label: 'fabBatchSize',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const f = routeChoice(ctx)!.fab!;
        return decided('sheetMetal.fabBatchSize', f.batch, 'rule', `${ctx.annualVolume.toLocaleString('en-GB')}/yr ÷ 20 runs, 50–5,000`, 0.5);
      },
    },
    {
      id: 'sheetMetal.fabToolingGBP',
      path: 'sheetMetal.fabToolingGBP',
      fieldId: 'smf-tooling',
      label: 'fabToolingGBP',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabToolingGBP', fabToolingGBP(), 'rule',
          `nest + brake programming and first-off, £${FAB.toolingGBP} UK (advisor band £500–3k)${countryNote('engineer')} — no die; it was set to the stamping die cost`, 0.5);
      },
    },
    {
      id: 'sheetMetal.fabUtilization',
      path: 'sheetMetal.fabUtilization',
      fieldId: 'smf-mat-util',
      label: 'fabUtilization',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const l = stripLayout(ctx);
        const dev = ctx.geo.blank;
        const b = blankDims(ctx)!;
        const area = dev?.netAreaMm2 ?? b.lengthMm * b.widthMm;
        const u = l ? Math.min(0.95, Math.round(area / (l.pitchMm * l.stripWidthMm) * 100) / 100) : 0.8;
        return decided('sheetMetal.fabUtilization', u, 'geometry',
          `blank ${Math.round(area / 100)} cm² nested on the sheet at the coil layout's cell (${l ? `${Math.round(l.pitchMm)} × ${Math.round(l.stripWidthMm)} mm` : 'none'}), max 0.95`, 0.55);
      },
    },
    {
      id: 'sheetMetal.fabRejectRate',
      path: 'sheetMetal.fabRejectRate',
      fieldId: 'smf-reject',
      label: 'fabRejectRate',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabRejectRate', PRESS_REJECT, 'rule', 'fabrication scrap 1–2% typical', 0.5);
      },
    },
    {
      id: 'sheetMetal.setupHoursPerChange',
      path: 'sheetMetal.setupHoursPerChange',
      fieldId: 'sm-die-chg',
      label: 'setupHoursPerChange',
      evaluate: (ctx) => {
        const plan = stampingPlan(ctx);
        if (!plan) return decided('sheetMetal.setupHoursPerChange', 1, 'rule', 'no press plan — 1 h a die change', 0.3);
        const t = Number(/(\d+)t/.exec(plan.pressId)?.[1] ?? 0);
        const h = plan.pressLine === 'tandem' ? 0.5 : plan.pressLine === 'transfer' ? 1.5 : t > 400 ? 1.5 : 1.0;
        return decided('sheetMetal.setupHoursPerChange', h, 'rule',
          plan.pressLine === 'tandem' ? `${h} h a die change on each press of a quick-die-change tandem line (engineering-typical)`
            : `${h} h to change a ${plan.pressLine} die on a ${plan.pressId} (engineering-typical)`, 0.5);
      },
    },
    {
      id: 'sheetMetal.batchSize',
      path: 'sheetMetal.batchSize',
      fieldId: 'sm-batch',
      label: 'batchSize',
      evaluate: (ctx) => decided('sheetMetal.batchSize', standardBatchSize(ctx.annualVolume), 'rule',
        `${ctx.annualVolume.toLocaleString('en-GB')}/yr ÷ 20 runs a year, 50–5,000 — the shop's standard batch`, 0.5),
    },
    {
      id: 'sheetMetal.dieMaintenanceFraction',
      path: 'sheetMetal.dieMaintenanceFraction',
      fieldId: 'sm-maint',
      label: 'dieMaintenanceFraction',
      evaluate: (ctx) => dieClassFor(ctx).soft
        ? decided('sheetMetal.dieMaintenanceFraction', 0, 'rule', 'soft tooling is replaced, not maintained', 0.5)
        : decided('sheetMetal.dieMaintenanceFraction', 0.05, 'rule',
          'die maintenance (sharpening, springs, inserts) 5% of the die a year — engineering-typical 5–10%', 0.5),
    },
    {
      id: 'sheetMetal.fabLaserId',
      path: 'sheetMetal.fabLaserId',
      fieldId: 'smf-blank-mach',
      label: 'fabLaserId',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabLaserId', FAB.laserId, 'rule', '6 kW fibre laser, 3 × 1.5 m bed', 0.6);
      },
    },
    {
      id: 'sheetMetal.fabBrakeId',
      path: 'sheetMetal.fabBrakeId',
      fieldId: 'smf-brake-mach',
      label: 'fabBrakeId',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const f = routeChoice(ctx)!.fab!;
        return decided('sheetMetal.fabBrakeId', f.brakeId, 'rule',
          f.brakeId === FAB.brakeLargeId ? 'blank over 1.5 m — 230 t, 4 m brake' : '100 t CNC press brake', 0.6);
      },
    },
    {
      id: 'sheetMetal.fabBrakeLabourId',
      path: 'sheetMetal.fabBrakeLabourId',
      fieldId: 'smf-brake-lab',
      label: 'fabBrakeLabourId',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabBrakeLabourId', FAB.brakeLabourId, 'rule', 'CNC press-brake operator sets and runs the bend sequence — skilled', 0.55);
      },
    },
    {
      id: 'sheetMetal.fabAssistGas',
      path: 'sheetMetal.fabAssistGas',
      fieldId: 'smf-gas',
      label: 'fabAssistGas',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: (ctx) => {
        const fam = (DEFAULT_RATE_LIBRARY.materials.find(m => m.id === representativeMaterialId(ctx.commodity, materialFacts(ctx).family ?? 'steel'))?.category ?? '').toLowerCase();
        const n2 = /alumin|stainless/.test(fam);
        return decided('sheetMetal.fabAssistGas', n2 ? 'nitrogen' : 'oxygen', 'rule',
          n2 ? 'stainless / aluminium are cut with nitrogen for a clean, oxide-free edge' : 'mild steel is cut with oxygen (the form defaulted to nitrogen, ~5× the gas cost)', 0.6);
      },
    },
    {
      id: 'sheetMetal.fabToleranceMm',
      path: 'sheetMetal.fabToleranceMm',
      fieldId: 'smf-tolerance',
      label: 'fabToleranceMm',
      appliesWhen: (ctx) => routeChoice(ctx)?.route === 'fab',
      evaluate: () => {
        return decided('sheetMetal.fabToleranceMm', 0.5, 'rule',
          'no drawing tolerance in the CAD — general tolerance (ISO 2768-m class), no cycle multiplier; the form defaulted to 0.2 mm, a ×1.3 multiplier nobody specified', 0.4);
      },
    },
  ],
};

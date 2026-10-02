/**
 * Forging cost inputs, derived from the measured envelope.
 *
 * This module is almost pure wiring. `src/engine/modules/forging-advisor.ts`
 * already contains everything needed — a process advisor with a documented
 * reference table, a die-fill tonnage calculation, parametric die cost, an
 * alloy-keyed die-life predictor, alloy-keyed heating energy and a secondary-op
 * estimator. All of it is already imported by the browser. What is new here is
 * that it runs FIRST rather than as a fallback.
 *
 * That distinction is the point. In `applyCADToForm` the advisors sit in the
 * `else` branch: they only run when the model returned no `forging` sub-object.
 * When the model does answer, its `flashKg`, `yieldFraction` and `dieLife` win
 * and the parametric suite never executes. The deterministic path is currently
 * the fallback for the guess.
 *
 * Three things change relative to the prompt text these rules came from:
 *
 * 1. **Yield comes from `FORGING_PROCESS_REFERENCE`, per process.** The prompt
 *    said `yieldFraction=0.90` for every forging ever made. Combined with its
 *    flat 10% flash that implies an overall stock yield of 0.818 — outside the
 *    documented closed-die band of 0.55–0.80 entirely, and 21% above its
 *    midpoint. Yield divides into billet weight, so too high under-charges
 *    material. On the stub axle (8.14 kg of forged steel) that is 9.95 kg of
 *    billet charged against a documented 12.06 kg.
 *
 * 2. **Die life comes from the alloy.** The prompt said `dieLife=20000` flat.
 *    `FORGING_DIE_LIFE_BASE` runs from 80,000 for aluminium to 3,500 for a
 *    nickel superalloy — so the flat figure over-charges tooling ~2-4x on
 *    aluminium and carbon steel and under-charges it ~5.7x on a superalloy.
 *
 * 3. **Flash is charged only to processes that make flash.** Cold forming,
 *    ring rolling and open-die forging produce none — the advisor's own route
 *    text says so ("no flash"). The prompt charged all five routes 10%.
 */
import { representativeMaterialId } from '../derive/material.js';
import type { MaterialFamily } from '../../material-family.js';
import {
  adviseForgingProcess, estimateForgingTonnage, estimateForgingDieCost,
  estimateForgingDieLife, estimateForgingSecondaryAdders, forgingHeatKwhPerKg,
  FORGING_PROCESS_REFERENCE, FORGING_FLOW_STRESS_MPA,
  type ForgingProcess, type ForgingAlloyFamily, type ShapeComplexity,
  type DieSteel, type ComplexityLevel,
} from '../../modules/forging-advisor.js';
import { pickForgePressId, pickStampingPressId } from '../../machine-sizing.js';
import { nearNetStockCm3, CORED_ABOVE_MM } from '../../machining-time.js';
import type { FeatureRow } from '../../feature-ops.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { materialFacts, toForgingAlloyFamily } from '../derive/material.js';
import { projectedAreaCm2, projectedAreaBasis, isRingShape } from '../derive/envelope.js';
import { isAxisymmetric } from './machining.js';
import {
  toleranceClassDecision, safetyCriticalDecision,
  answeredBool, answeredToleranceClass, assumedNote,
  SAFETY_CRITICAL_DECISION_ID, TOLERANCE_CLASS_DECISION_ID,
} from '../derive/service-context.js';

/**
 * Flash and scale as a fraction of part weight, by route.
 *
 * Flash is the metal squeezed out of the impression at the parting line, so a
 * route with no impression makes none. `adviseForgingProcess` says as much in
 * its own text for cold forming; ring rolling punches a slug rather than
 * flashing, and open-die forging leaves machining stock instead. For those three
 * the stock loss is already inside the reference yield band and charging flash
 * on top would count it twice.
 */
const FLASH_FRACTION: Record<ForgingProcess, number> = {
  'closed-die': 0.10,
  precision: 0.04,       // near-net: a narrow flash land, trimmed close
  'ring-rolling': 0,
  'open-die': 0,
  'cold-forming': 0,
};

/** Die impressions to sink: blocker + finisher on an impression die. */
const IMPRESSIONS: Record<ForgingProcess, number> = {
  'closed-die': 2,
  precision: 2,
  'cold-forming': 4,     // multi-station cold tooling
  'ring-rolling': 1,
  'open-die': 1,
};

/** Post-forge route, taken from the advisor's own `suggestedSecondary` text. */
const NDT_BY_PROCESS: Record<ForgingProcess, 'mpi' | 'ut' | 'ct' | 'none'> = {
  'closed-die': 'mpi',
  precision: 'ct',
  'open-die': 'ut',
  'ring-rolling': 'ut',
  'cold-forming': 'none',
};

const HEAT_TREAT: Record<ForgingAlloyFamily, 'normalise' | 'quench-temper' | 'anneal' | 'solution-age'> = {
  'carbon-steel': 'normalise',
  'microalloyed-steel': 'normalise',
  'alloy-steel': 'quench-temper',
  'stainless-steel': 'anneal',
  copper: 'anneal',
  aluminium: 'solution-age',      // T6
  titanium: 'solution-age',
  superalloy: 'solution-age',
};


/** Surfaces of revolution dominate the face census — a turned/round part. */
export function isRevolutionDominant(ctx: RuleContext): boolean {
  const by = (ctx.geo.faces?.byType ?? {}) as Record<string, number>;
  const total = ctx.geo.faces?.total ?? 0;
  if (!total) return false;
  const rev = (by['CYLINDER'] ?? 0) + (by['CONE'] ?? 0) + (by['TORUS'] ?? 0);
  return rev / total >= 0.55;
}

/** Shape complexity for the tonnage, die-cost and die-life estimators. */
export function shapeComplexity(ctx: RuleContext): ShapeComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  const faces = ctx.geo.faces?.total ?? 0;
  let score = 0;
  if (freeForm >= 8) score += 2; else if (freeForm >= 3) score += 1;
  if (undercuts >= 4) score += 1;
  if (faces >= 120) score += 1;
  const raw: ShapeComplexity = score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
  // A turned part is all curvature, and the free-form face count cannot tell a
  // blend fillet from a styling surface — the real stub axle scored `complex`
  // (3 impressions, £81k die) while its face census reads CYLINDER 132 +
  // CONE 55 + TORUS 34 of 364 faces: 61% surfaces of revolution. A
  // revolution-dominant forging forms in round dies, upset-and-finish — the
  // moderate case whatever its fillet count says. The bbox-squareness test
  // alone misses it (277×223 is not "square"), so both signals are used.
  if (raw === 'complex' && (isAxisymmetric(ctx) || isRevolutionDominant(ctx))) return 'moderate';
  return raw;
}

/** The advisor grades complexity on a three-point scale of its own. */
function advisorComplexity(s: ShapeComplexity): ComplexityLevel {
  return s === 'complex' ? 'high' : s === 'simple' ? 'low' : 'medium';
}

/**
 * Die steel.
 *
 * Hot-hard premium grades (1.2367 / PM) are what a titanium or nickel forging
 * needs — H13 tempers out at those die-face temperatures. Everything else runs
 * on H13, the workhorse.
 */
export function dieSteelFor(alloy: ForgingAlloyFamily): DieSteel {
  return alloy === 'titanium' || alloy === 'superalloy' ? 'premium' : 'h13';
}

/**
 * The forging's plan area at the parting line, cm².
 *
 * A forging parts round its largest periphery — the standard die-design rule —
 * so the press closes across the LARGEST of the kernel's three measured
 * silhouettes. The moulding "draw direction" it used before is chosen by the
 * fewest undercuts on a one-way pull, which a forging (two die halves, parted
 * mid-height) does not have: the drafted yoke was pressed across 74.5 cm² of its
 * side instead of its 84.3 cm² plan, and the undrafted one across its 15 cm² end.
 */
export function forgingPlanAreaCm2(ctx: RuleContext): { cm2: number | null; basis: string } {
  const p = ctx.geo.projectedArea;
  const sil = [p?.xMm2, p?.yMm2, p?.zMm2].filter((v): v is number => typeof v === 'number' && v > 0);
  if (sil.length) {
    return { cm2: Math.round(Math.max(...sil) / 100 * 10) / 10,
      basis: 'largest of the three measured silhouettes — a forging parts round its largest periphery' };
  }
  return { cm2: projectedAreaCm2(ctx), basis: projectedAreaBasis(ctx) };
}

/**
 * The forge line (forging review, 2 Oct 2026).
 *
 * The cycle was "strokes × 10 s", with the stroke count a face-count heuristic
 * in the kernel (4–12) labelled as measured. A crank-press line is paced by its
 * hits: one per impression, an extra finisher hit for a moderate shape and two
 * for a complex one, each hit plus its transfer ~4 s on a mechanical press
 * (~8 s on a hydraulic press), plus ~3 s to take the billet from the heater.
 * The trim press sits in line and works to the same takt. All values are
 * engineering-typical and printed on the basis.
 */
export const FORGE_LINE = {
  loadSec: 3,
  hitSec: { mechanical: 4, hydraulic: 8 },
  /** Ring mill: upset + punch + roll; open die: manipulated blows. */
  ringRollingSec: (kg: number) => 30 + 10 * kg,
  openDieSec: (kg: number) => 60 + 20 * kg,
  coldFormingSec: 2,
} as const;

/** Crew on the forge line, by route; one operator on the trim press. */
export const FORGE_CREW: Record<ForgingProcess, number> = {
  'closed-die': 2,        // forger + heater / handler
  precision: 2,
  'ring-rolling': 2,
  'open-die': 3,          // forger + manipulator + crane
  'cold-forming': 0.5,    // automatic multi-station header, one setter to two
};
export const TRIM_CREW = 1;

/** Forging scrap (laps, underfill, cracks found at inspection), fraction. */
export const FORGING_REJECT = 0.02;

/** Per-side machining stock on a machined face, mm, by route (as-forged allowance). */
export const FORGING_MACHINING_STOCK_MM: Record<ForgingProcess, number> = {
  'closed-die': 2.0, precision: 0.75, 'open-die': 5.0, 'ring-rolling': 3.0, 'cold-forming': 0,
};

const isHydraulic = (forgeId: string) => /4000t|8000t/.test(forgeId);

export function forgeLine(a: { process: ForgingProcess; impressions: number; shape: ShapeComplexity; partKg: number; forgeId: string }): {
  hits: number; hitSec: number; cycleSec: number; basis: string;
} {
  if (a.process === 'ring-rolling') {
    const sec = FORGE_LINE.ringRollingSec(a.partKg);
    return { hits: 1, hitSec: sec, cycleSec: sec, basis: `ring mill: 30 s upset / punch / roll + 10 s/kg × ${fmt(a.partKg, 2)} kg` };
  }
  if (a.process === 'open-die') {
    const sec = FORGE_LINE.openDieSec(a.partKg);
    return { hits: 1, hitSec: sec, cycleSec: sec, basis: `open die: 60 s + 20 s/kg × ${fmt(a.partKg, 2)} kg of manipulated blows` };
  }
  if (a.process === 'cold-forming') {
    return { hits: a.impressions, hitSec: FORGE_LINE.coldFormingSec / a.impressions, cycleSec: FORGE_LINE.coldFormingSec,
      basis: `multi-station cold former: ${a.impressions} stations, one part every ${FORGE_LINE.coldFormingSec} s` };
  }
  const extra = a.shape === 'complex' ? 2 : a.shape === 'moderate' ? 1 : 0;
  const hits = a.impressions + extra;
  const hitSec = isHydraulic(a.forgeId) ? FORGE_LINE.hitSec.hydraulic : FORGE_LINE.hitSec.mechanical;
  const cycleSec = FORGE_LINE.loadSec + hits * hitSec;
  return {
    hits, hitSec, cycleSec,
    basis: `${FORGE_LINE.loadSec} s billet from the heater + ${hits} hit(s) (${a.impressions} impression(s)`
      + `${extra ? ` + ${extra} extra finisher hit(s), ${a.shape} shape` : ''}) × ${hitSec} s `
      + `${isHydraulic(a.forgeId) ? 'hydraulic' : 'mechanical'} press hit + transfer = ${cycleSec} s takt`,
  };
}

/**
 * Flash at the parting line, from the silhouette: thickness ≈ 0.015 √A
 * (A in mm², ASM closed-die practice), land ≈ 3 × the thickness, and a
 * perimeter of ≈ 4.4 √A (a rounded rectangle; the kernel measures the area,
 * not its outline). Used for the die-fill force over the flash land and the
 * trim-press force.
 */
export function flashGeometry(areaCm2: number): { perimeterMm: number; thicknessMm: number; landMm: number; landAreaCm2: number } {
  const aMm2 = areaCm2 * 100;
  const perimeterMm = 4.4 * Math.sqrt(aMm2);
  const thicknessMm = Math.max(1, 0.015 * Math.sqrt(aMm2));
  const landMm = 3 * thicknessMm;
  return { perimeterMm, thicknessMm, landMm, landAreaCm2: perimeterMm * landMm / 100 };
}

/** The trim press: perimeter × flash thickness × hot flow stress, on the mechanical press ladder. */
export function trimPress(areaCm2: number, alloy: ForgingAlloyFamily): { pressId: string; tonnes: number; basis: string } {
  const f = flashGeometry(areaCm2);
  const flow = FORGING_FLOW_STRESS_MPA[alloy];
  const tonnes = f.perimeterMm * f.thicknessMm * flow / 9806.65;
  return {
    pressId: pickStampingPressId(tonnes),
    tonnes: Math.round(tonnes * 10) / 10,
    basis: `${f.perimeterMm.toFixed(0)} mm flash line × ${f.thicknessMm.toFixed(1)} mm flash × ${flow} MPa hot flow stress `
      + `= ${(tonnes).toFixed(1)} t → the smallest mechanical press with 1.25× margin`,
  };
}

/**
 * `yieldFraction` for `computeForgingDrivers`, from the documented band.
 *
 * The module computes `billet = (part + flash) / yieldFraction`, so its
 * `yieldFraction` is a post-flash number. `FORGING_PROCESS_REFERENCE.yieldBand`
 * is the OVERALL ratio of finished weight to input stock. Scaling the band by
 * `(1 + flashFraction)` makes the two agree exactly: the billet the engine buys
 * comes out at `part / yieldBand`, which is what the reference says it should be.
 * Getting this wrong in the other direction would charge the flash twice.
 */
export function yieldFractionFor(process: ForgingProcess): { value: number; bandMid: number; flashFrac: number } {
  const [lo, hi] = FORGING_PROCESS_REFERENCE[process].yieldBand;
  const bandMid = (lo + hi) / 2;
  const flashFrac = FLASH_FRACTION[process];
  return {
    value: Math.round(bandMid * (1 + flashFrac) * 1000) / 1000,
    bandMid,
    flashFrac,
  };
}

interface ForgeAdvice {
  alloy: ForgingAlloyFamily;
  familyLabel: string;
  partKg: number;
  massBasis: string;
  areaCm2: number;
  shape: ShapeComplexity;
  process: ForgingProcess;
  processReason: string;
  ring: boolean;
  safetyCritical: boolean;
  tonnes: number;
  yieldFraction: number;
  yieldBandMid: number;
  flashFrac: number;
  flashKg: number;
  dieSteel: DieSteel;
  impressions: number;
  /** As-forged weight: finished + holes drilled from solid + per-side machining stock. */
  forgedKg: number;
  forgedBasis: string;
}

function advise(ctx: RuleContext): { advice: ForgeAdvice } | { blocked: RuleOutcome<never> } {
  const mat = materialFacts(ctx);
  if (mat.decision) return { blocked: ask(mat.decision) };

  const alloy = toForgingAlloyFamily(mat.family!);
  if (!alloy) {
    return {
      blocked: ask({
        id: 'forging.notForgeable', kind: 'commodity',
        question: `${mat.family} cannot be forged — what is this part?`,
        why: 'Forging works metal in the plastic range. Cast iron fractures rather than '
          + 'flowing, and a plastic has no forging route at all. The commodity is wrong.',
        options: [
          { value: 'casting', label: 'Re-route to casting' },
          { value: 'machining', label: 'Re-route to machining from solid' },
        ],
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const areaCm2 = forgingPlanAreaCm2(ctx).cm2;
  if (!areaCm2 || mat.massKg === null) {
    return {
      blocked: ask({
        id: 'forging.envelope', kind: 'geometry_gap',
        question: 'What is the part weight and plan area?',
        why: 'No bounding box or volume was measured, so neither the die-fill force nor '
          + 'the billet weight can be derived.',
        options: [{ value: 'enter', label: 'Enter part weight and projected area' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  // The advisor needs two facts a drawing carries and a CAD file does not. These
  // are the SAME decisions the casting rules ask, so a part re-routed from
  // casting to forging keeps its answers rather than asking twice.
  const tol = answeredToleranceClass(ctx);
  if (tol === null) return { blocked: ask(toleranceClassDecision()) };
  const safety = answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID);
  if (safety === null) return { blocked: ask(safetyCriticalDecision(ctx)) };

  const shape = shapeComplexity(ctx);
  const ring = isRingShape(ctx);
  const rec = adviseForgingProcess({
    annualVolume: ctx.annualVolume,
    partWeightKg: mat.massKg,
    complexity: advisorComplexity(shape),
    alloyFamily: alloy,
    toleranceClass: tol,
    isRingShape: ring,
    safetyCritical: safety,
  });

  const y = yieldFractionFor(rec.process);
  // As-forged weight. The STEP is the FINISHED part; the forging carries the
  // stock the machining removes — measured off the feature table, as the
  // cast + machine route does (machining review).
  const density = mat.massKg / Math.max(1e-9, ctx.geo.volume?.cm3 ?? 0);
  const rows = (ctx.geo.featureTable ?? []) as FeatureRow[];
  // Bores above the pierce size are punched out (impression forgings punch the
  // wad, a ring is punched before rolling); an open-die forging is drilled.
  const pierce = rec.process === 'open-die' ? Infinity : CORED_ABOVE_MM.forging;
  const drilledCm3 = rows.filter(r => r.kind === 'hole' && r.diaMm <= pierce)
    .reduce((s2, r) => s2 + Math.PI * r.diaMm ** 2 / 4 * Math.max(r.depthMm, 0) * r.count, 0) / 1000;
  const stockMm = FORGING_MACHINING_STOCK_MM[rec.process];
  const faceCm3 = stockMm > 0 ? nearNetStockCm3(rows, stockMm, pierce) : 0;
  const forgedKg = Math.round((mat.massKg + (drilledCm3 + faceCm3) * density) * 1000) / 1000;
  const forgedBasis = `${fmt(mat.massKg, 3)} kg finished + ${fmt(drilledCm3, 1)} cm³ of holes drilled from solid`
    + `${pierce < Infinity ? ` (≤ Ø${pierce}; larger bores pierced)` : ''} + ${fmt(faceCm3, 1)} cm³ machining stock `
    + `(${stockMm} mm a side on the machined faces, ${rec.process}) — ${mat.basis}`;
  return {
    advice: {
      alloy, familyLabel: mat.family!,
      partKg: mat.massKg, massBasis: mat.basis,
      areaCm2, shape,
      process: rec.process,
      processReason: rec.reason + ([
        assumedNote(ctx, TOLERANCE_CLASS_DECISION_ID) && 'tolerance class',
        assumedNote(ctx, SAFETY_CRITICAL_DECISION_ID) && 'safety-critical',
      ].filter(Boolean).length
        ? ` [${[
            assumedNote(ctx, TOLERANCE_CLASS_DECISION_ID) && 'tolerance class',
            assumedNote(ctx, SAFETY_CRITICAL_DECISION_ID) && 'safety-critical',
          ].filter(Boolean).join(', ')} assumed — confirm before quoting]`
        : ''),
      ring,
      safetyCritical: safety,
      // Die-fill force acts over the flash land too, where the pressure is
      // highest — the impression area alone under-sized the press.
      tonnes: Math.round(estimateForgingTonnage({
        projectedAreaCm2: areaCm2 + (FLASH_FRACTION[rec.process] > 0 ? flashGeometry(areaCm2).landAreaCm2 : 0),
        alloyFamily: alloy, shapeComplexity: shape,
      })),
      yieldFraction: y.value, yieldBandMid: y.bandMid, flashFrac: y.flashFrac,
      flashKg: Math.round(forgedKg * y.flashFrac * 1000) / 1000,
      dieSteel: dieSteelFor(alloy),
      impressions: IMPRESSIONS[rec.process] + (shape === 'complex' && rec.process === 'closed-die' ? 1 : 0),
      forgedKg, forgedBasis,
    },
  };
}

/** The secondary-op adders, keyed off the route and the safety answer. */
function secondaries(a: ForgeAdvice) {
  return estimateForgingSecondaryAdders({
    alloyFamily: a.alloy,
    partWeightKg: a.forgedKg,
    heatTreat: HEAT_TREAT[a.alloy],
    descale: a.process !== 'cold-forming',          // hot routes grow scale
    shotBlast: a.process === 'closed-die',
    coining: false,                                  // a tolerance call, asked separately
    ndt: a.safetyCritical ? NDT_BY_PROCESS[a.process] : 'none',
  });
}

function adderUnit(a: ForgeAdvice, match: RegExp): number {
  return secondaries(a).adders.find(x => match.test(x.label))?.unitCostGbp ?? 0;
}

function adderPerPart(a: ForgeAdvice, match: RegExp): number {
  return Math.round((secondaries(a).adders.find(x => match.test(x.label))?.costPerPartGbp ?? 0) * 100) / 100;
}

export const FORGING_RULES: CommodityRuleSpec = {
  commodity: 'forging',
  header: 'FORGING COST INPUT RULES:',
  rules: [
    {
      id: 'forging.materialId',
      path: 'forging.materialId',
      fieldId: 'forge-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // A GRADE, not the family word: the form's drop-down lists grade ids and
        // refused "steel", keeping its first billet while the headless path
        // priced the representative grade — two numbers for one part.
        const id = representativeMaterialId('forging', r.advice.familyLabel as MaterialFamily);
        return decided('forging.materialId', id ?? r.advice.familyLabel, 'engineer',
          `${r.advice.massBasis}; ${r.advice.familyLabel} → ${id ?? r.advice.familyLabel} (representative forging billet — not a drawing callout)`, 1);
      },
    },
    {
      id: 'forging.partWeightKg',
      path: 'forging.partWeightKg',
      fieldId: 'forge-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.partWeightKg', r.advice.forgedKg, 'geometry',
          r.advice.forgedBasis, 0.9);
      },
    },
    {
      id: 'forging.process',
      path: 'forging.process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.process', r.advice.process, 'advisor',
          r.advice.processReason, 0.8);
      },
    },
    {
      id: 'forging.projectedAreaCm2',
      path: 'forging.projectedAreaCm2',
      fieldId: 'forge-proj-area',
      label: 'projectedAreaCm2',
      evaluate: (ctx) => {
        const fa = forgingPlanAreaCm2(ctx);
        const a = fa.cm2;
        if (a === null) return ask({
          id: 'forging.envelope', kind: 'geometry_gap',
          question: 'What is the part weight and plan area?',
          why: 'No bounding box was measured, so the die-fill force cannot be derived.',
          options: [{ value: 'enter', label: 'Enter part weight and projected area' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('forging.projectedAreaCm2', a, 'geometry',
          fa.basis, ctx.geo.projectedArea ? 0.85 : 0.6);
      },
    },
    {
      id: 'forging.shapeComplexity',
      path: 'forging.shapeComplexity',
      fieldId: 'forge-shape',
      label: 'shapeComplexity',
      evaluate: (ctx) => {
        const s = shapeComplexity(ctx);
        return decided('forging.shapeComplexity', s, 'geometry',
          `${ctx.geo.features?.freeFormFaceCount ?? 0} free-form face(s), `
          + `${ctx.geo.draftAnalysis?.undercutFaceCount ?? 0} undercut face(s), `
          + `${ctx.geo.faces?.total ?? 0} faces total`, 0.65);
      },
    },
    {
      // THE YIELD FIX. See the module header for what this replaces.
      id: 'forging.yieldFraction',
      path: 'forging.yieldFraction',
      fieldId: 'forge-yield',
      label: 'yieldFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const [lo, hi] = FORGING_PROCESS_REFERENCE[r.advice.process].yieldBand;
        return decided('forging.yieldFraction', r.advice.yieldFraction, 'library',
          `${r.advice.process} stock yield band ${lo}–${hi}, midpoint ${r.advice.yieldBandMid.toFixed(3)}`
          + (r.advice.flashFrac > 0
            ? `, scaled by the ${(r.advice.flashFrac * 100).toFixed(0)}% flash so the billet lands at part ÷ ${r.advice.yieldBandMid.toFixed(3)}`
            : ' — this route makes no flash'),
          0.75);
      },
    },
    {
      id: 'forging.flashAndScaleKg',
      path: 'forging.flashAndScaleKg',
      fieldId: 'forge-flash',
      label: 'flashAndScaleKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.flashFrac === 0) {
          return decided('forging.flashAndScaleKg', 0, 'rule',
            `${r.advice.process} has no impression parting line — it makes no flash; `
            + 'the stock loss is inside the yield band', 0.8);
        }
        return decided('forging.flashAndScaleKg', r.advice.flashKg, 'rule',
          `${(r.advice.flashFrac * 100).toFixed(0)}% of part weight squeezed out at the flash land`, 0.6);
      },
    },
    {
      id: 'forging.forgeId',
      path: 'forging.forgeId',
      fieldId: 'forge-mach',
      label: 'forgeId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.process === 'open-die') {
          const id = r.advice.forgedKg > 50 ? 'forge-hammer-10t' : 'forge-hammer-5t';
          return decided('forging.forgeId', id, 'advisor',
            `open-die: drawn and upset under a hammer (${fmt(r.advice.forgedKg, 1)} kg) — no impression to fill`, 0.7);
        }
        if (r.advice.process === 'ring-rolling') {
          return decided('forging.forgeId', 'forge-ring-mill', 'advisor',
            'seamless ring: upset and punched, then rolled on the ring mill', 0.8);
        }
        return decided('forging.forgeId', pickForgePressId(r.advice.tonnes), 'advisor',
          `F = Kt × σflow × A: ${r.advice.shape} shape in ${r.advice.alloy} over `
          + `${r.advice.areaCm2} cm²${r.advice.flashFrac > 0 ? ` + ${fmt(flashGeometry(r.advice.areaCm2).landAreaCm2, 0)} cm² flash land` : ''}`
          + ` = ${r.advice.tonnes} t (1.2 safety)`, 0.85);
      },
    },
    {
      // Hits, not "blows": one per impression plus the finisher hits the shape
      // needs. Was the kernel's face-count heuristic (4–12) labelled measured.
      id: 'forging.strokesToForm',
      path: 'forging.strokesToForm',
      fieldId: 'forge-strokes',
      label: 'strokesToForm',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const l = forgeLine({ ...r.advice, forgeId: pickForgePressId(r.advice.tonnes) });
        return decided('forging.strokesToForm', l.hits, 'rule', l.basis, 0.6);
      },
    },
    {
      id: 'forging.timePerBlowSec',
      path: 'forging.timePerBlowSec',
      fieldId: 'forge-time-per-blow',
      label: 'timePerBlowSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const l = forgeLine({ ...r.advice, forgeId: pickForgePressId(r.advice.tonnes) });
        return decided('forging.timePerBlowSec', Math.round(l.hitSec * 100) / 100, 'rule',
          'hit + transfer on the press (informational — the cycle below is the line takt)', 0.6);
      },
    },
    {
      id: 'forging.cycleTimeHr',
      path: 'forging.cycleTimeHr',
      fieldId: 'forge-ct',
      label: 'cycleTimeHr',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const l = forgeLine({ ...r.advice, forgeId: pickForgePressId(r.advice.tonnes) });
        return decided('forging.cycleTimeHr', Math.round(l.cycleSec / 3600 * 1e6) / 1e6, 'rule', l.basis, 0.6);
      },
    },
    {
      id: 'forging.labourId',
      path: 'forging.labourId',
      fieldId: 'forge-lab',
      label: 'labourId',
      evaluate: () => decided('forging.labourId', 'lab-uk-forge', 'rule',
        'forge-shop operative (the screen defaulted to a skilled machinist)', 0.8),
    },
    {
      id: 'forging.manning',
      path: 'forging.manning',
      fieldId: 'forge-manning',
      label: 'manning',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.manning', FORGE_CREW[r.advice.process], 'rule',
          `${r.advice.process} line crew (forger + heater / handler; open die adds a manipulator) — `
          + 'engineering typical; the screen said 2, headless 1', 0.55);
      },
    },
    {
      id: 'forging.rejectRate',
      path: 'forging.rejectRate',
      fieldId: 'forge-reject',
      label: 'rejectRate',
      evaluate: () => decided('forging.rejectRate', FORGING_REJECT, 'rule',
        `${FORGING_REJECT * 100}% forging scrap (laps, underfill, cracks at inspection) — engineering typical`, 0.5),
    },
    {
      id: 'forging.furnaceType',
      path: 'forging.furnaceType',
      fieldId: 'forge-furnace',
      label: 'furnaceType',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const gas = r.advice.alloy === 'aluminium' || r.advice.alloy === 'copper' || r.advice.process === 'open-die';
        return decided('forging.furnaceType', gas ? 'gas' : 'induction', 'rule',
          gas ? (r.advice.process === 'open-die' ? 'large open-die stock heats in a gas furnace'
            : `${r.advice.alloy} forges warm — billets soak in a gas furnace`)
            : 'steel / titanium billets for an impression line heat in-line by induction', 0.6);
      },
    },
    {
      id: 'forging.trimMachineId',
      path: 'forging.trimMachineId',
      fieldId: 'forge-trim-mach',
      label: 'trimMachineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.flashFrac === 0) return decided('forging.trimMachineId', '', 'rule', `${r.advice.process} makes no flash — no trim press`, 0.8);
        const t = trimPress(r.advice.areaCm2, r.advice.alloy);
        return decided('forging.trimMachineId', t.pressId, 'rule', t.basis, 0.6);
      },
    },
    {
      id: 'forging.trimCycleHr',
      path: 'forging.trimCycleHr',
      fieldId: 'forge-trim-ct',
      label: 'trimCycleHr',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.flashFrac === 0) return decided('forging.trimCycleHr', 0, 'rule', 'no flash to trim', 0.8);
        const l = forgeLine({ ...r.advice, forgeId: pickForgePressId(r.advice.tonnes) });
        return decided('forging.trimCycleHr', Math.round(l.cycleSec / 3600 * 1e6) / 1e6, 'rule',
          `the trim press stands in line and works to the forge takt (${l.cycleSec} s)`, 0.6);
      },
    },
    {
      id: 'forging.trimLabourId',
      path: 'forging.trimLabourId',
      fieldId: 'forge-trim-lab',
      label: 'trimLabourId',
      evaluate: () => decided('forging.trimLabourId', 'lab-uk-forge', 'rule', 'forge-shop operative', 0.8),
    },
    {
      id: 'forging.trimManning',
      path: 'forging.trimManning',
      fieldId: 'forge-trim-manning',
      label: 'trimManning',
      evaluate: () => decided('forging.trimManning', TRIM_CREW, 'rule', 'one operator on the trim press', 0.6),
    },
    {
      id: 'forging.dieSteel',
      path: 'forging.dieSteel',
      fieldId: 'forge-die-steel',
      label: 'dieSteel',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.dieSteel', r.advice.dieSteel, 'rule',
          r.advice.dieSteel === 'premium'
            ? `${r.advice.alloy} forges hot enough to temper H13 out — premium hot-hard die steel`
            : 'H13 — the impression-die workhorse', 0.7);
      },
    },
    {
      id: 'forging.dieImpressions',
      path: 'forging.dieImpressions',
      fieldId: 'forge-die-impr',
      label: 'dieImpressions',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.dieImpressions', r.advice.impressions, 'rule',
          r.advice.process === 'closed-die'
            ? `blocker + finisher${r.advice.impressions > 2 ? ' + edger (complex shape)' : ''}`
            : `${r.advice.process} tooling`, 0.6);
      },
    },
    {
      id: 'forging.dieCost',
      path: 'forging.dieCost',
      fieldId: 'forge-die-cost',
      label: 'dieCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const est = estimateForgingDieCost({
          projectedAreaCm2: r.advice.areaCm2,
          partWeightKg: r.advice.forgedKg,
          dieSteel: r.advice.dieSteel,
          impressions: r.advice.impressions,
          complexity: r.advice.shape,
        });
        const occt = ctx.geo.toolingCostEstimates?.forgeDieCostGBP;
        return decided('forging.dieCost', est.total, 'advisor',
          `${r.advice.impressions}-impression ${r.advice.dieSteel} die over ${r.advice.areaCm2} cm²: `
          + `£${est.block} block + £${est.machining} sinking + £${est.heatTreat} HT + £${est.polish} polish`
          + (occt ? `; OCCT parametric says £${occt.toFixed(0)}` : ''), 0.65);
      },
    },
    {
      // THE DIE-LIFE FIX. The prompt said 20000 whatever the metal.
      id: 'forging.dieLife',
      path: 'forging.dieLife',
      fieldId: 'forge-die-life',
      label: 'dieLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const life = estimateForgingDieLife({
          alloyFamily: r.advice.alloy,
          projectedAreaCm2: r.advice.areaCm2,
          complexity: r.advice.shape,
        });
        return decided('forging.dieLife', life, 'advisor',
          `${r.advice.alloy} at ${r.advice.areaCm2} cm², ${r.advice.shape} impression`, 0.6);
      },
    },
    {
      id: 'forging.heatingEnergyKwhPerKg',
      path: 'forging.heatingEnergyKwhPerKg',
      fieldId: 'forge-heat-energy',
      label: 'heatingEnergyKwhPerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.process === 'cold-forming') {
          return decided('forging.heatingEnergyKwhPerKg', 0, 'rule',
            'cold forming — the billet is never heated', 0.9);
        }
        return decided('forging.heatingEnergyKwhPerKg', forgingHeatKwhPerKg(r.advice.alloy), 'library',
          `energy to bring ${r.advice.alloy} to forging temperature`, 0.7);
      },
    },
    {
      id: 'forging.heatTreatCostPerKg',
      path: 'forging.heatTreatCostPerKg',
      fieldId: 'forge-ht-cost',
      label: 'heatTreatCostPerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.heatTreatCostPerKg', adderUnit(r.advice, /Heat treat/), 'library',
          `${HEAT_TREAT[r.advice.alloy]} for a ${r.advice.alloy} forging`, 0.6);
      },
    },
    {
      id: 'forging.descaleCostPerKg',
      path: 'forging.descaleCostPerKg',
      fieldId: 'forge-descale',
      label: 'descaleCostPerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.descaleCostPerKg', adderUnit(r.advice, /Descale/), 'library',
          r.advice.process === 'cold-forming'
            ? 'cold formed — no scale to remove'
            : 'forge scale pickled off before machining', 0.6);
      },
    },
    {
      id: 'forging.ndtCostPerPart',
      path: 'forging.ndtCostPerPart',
      fieldId: 'forge-ndt',
      label: 'ndtCostPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const ndt = r.advice.safetyCritical ? NDT_BY_PROCESS[r.advice.process] : 'none';
        return decided('forging.ndtCostPerPart', adderPerPart(r.advice, /NDT/), 'library',
          ndt === 'none'
            ? 'not safety-critical — no NDT'
            : `${ndt.toUpperCase()} on a safety-critical ${r.advice.process} forging`, 0.65);
      },
    },
  ],
};

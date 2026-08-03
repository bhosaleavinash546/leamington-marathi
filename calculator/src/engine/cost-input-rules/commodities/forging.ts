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
import {
  adviseForgingProcess, estimateForgingTonnage, estimateForgingDieCost,
  estimateForgingDieLife, estimateForgingSecondaryAdders, forgingHeatKwhPerKg,
  FORGING_PROCESS_REFERENCE,
  type ForgingProcess, type ForgingAlloyFamily, type ShapeComplexity,
  type DieSteel, type ComplexityLevel,
} from '../../modules/forging-advisor.js';
import { pickForgePressId } from '../../machine-sizing.js';
import { decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { materialFacts, toForgingAlloyFamily } from '../derive/material.js';
import { projectedAreaCm2, isRingShape } from '../derive/envelope.js';
import {
  toleranceClassDecision, safetyCriticalDecision,
  answeredBool, answeredToleranceClass, SAFETY_CRITICAL_DECISION_ID,
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

/** Shape complexity for the tonnage, die-cost and die-life estimators. */
export function shapeComplexity(ctx: RuleContext): ShapeComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  const faces = ctx.geo.faces?.total ?? 0;
  let score = 0;
  if (freeForm >= 8) score += 2; else if (freeForm >= 3) score += 1;
  if (undercuts >= 4) score += 1;
  if (faces >= 120) score += 1;
  return score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
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

  const areaCm2 = projectedAreaCm2(ctx);
  if (!areaCm2 || mat.massKg === null) {
    return {
      blocked: ask({
        id: 'forging.envelope', kind: 'geometry_gap',
        question: 'What is the part weight and plan area?',
        why: 'No bounding box or volume was measured, so neither the die-fill force nor '
          + 'the billet weight can be derived.',
        options: [{ value: 'enter', label: 'Enter part weight and projected area' }],
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
  return {
    advice: {
      alloy, familyLabel: mat.family!,
      partKg: mat.massKg, massBasis: mat.basis,
      areaCm2, shape,
      process: rec.process, processReason: rec.reason, ring,
      safetyCritical: safety,
      tonnes: Math.round(estimateForgingTonnage({
        projectedAreaCm2: areaCm2, alloyFamily: alloy, shapeComplexity: shape,
      })),
      yieldFraction: y.value, yieldBandMid: y.bandMid, flashFrac: y.flashFrac,
      flashKg: Math.round(mat.massKg * y.flashFrac * 1000) / 1000,
      dieSteel: dieSteelFor(alloy),
      impressions: IMPRESSIONS[rec.process] + (shape === 'complex' && rec.process === 'closed-die' ? 1 : 0),
    },
  };
}

/** The secondary-op adders, keyed off the route and the safety answer. */
function secondaries(a: ForgeAdvice) {
  return estimateForgingSecondaryAdders({
    alloyFamily: a.alloy,
    partWeightKg: a.partKg,
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
      label: 'materialFamily',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('forging.materialId', r.advice.familyLabel, 'engineer',
          r.advice.massBasis, 1);
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
        return decided('forging.partWeightKg', r.advice.partKg, 'geometry',
          r.advice.massBasis, 0.95);
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
        const a = projectedAreaCm2(ctx);
        if (a === null) return ask({
          id: 'forging.envelope', kind: 'geometry_gap',
          question: 'What is the part weight and plan area?',
          why: 'No bounding box was measured, so the die-fill force cannot be derived.',
          options: [{ value: 'enter', label: 'Enter part weight and projected area' }],
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('forging.projectedAreaCm2', a, 'geometry',
          'two largest bounding-box dimensions at the parting plane', 0.8);
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
        return decided('forging.forgeId', pickForgePressId(r.advice.tonnes), 'advisor',
          `F = Kt × σflow × A: ${r.advice.shape} shape in ${r.advice.alloy} over `
          + `${r.advice.areaCm2} cm² = ${r.advice.tonnes} t (1.2 safety)`, 0.85);
      },
    },
    {
      id: 'forging.strokesToForm',
      path: 'forging.strokesToForm',
      fieldId: 'forge-strokes',
      label: 'strokesToForm',
      evaluate: (ctx) => {
        const measured = ctx.geo.processSpecificEstimates?.forgeStrokes;
        if (measured && measured > 0) {
          return decided('forging.strokesToForm', measured, 'geometry',
            'blows to fill the impression, from the measured shape', 0.7);
        }
        const s = shapeComplexity(ctx);
        const n = s === 'complex' ? 8 : s === 'moderate' ? 5 : 3;
        return decided('forging.strokesToForm', n, 'rule',
          `${s} shape — no measured stroke count, so 3 simple / 5 moderate / 8 complex`, 0.45);
      },
    },
    {
      id: 'forging.timePerBlowSec',
      path: 'forging.timePerBlowSec',
      fieldId: 'forge-time-per-blow',
      label: 'timePerBlowSec',
      evaluate: () => decided('forging.timePerBlowSec', 10, 'rule',
        'ram travel + dwell per blow on a mechanical press', 0.6),
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
          partWeightKg: r.advice.partKg,
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

/**
 * Injection-moulding cost inputs, derived from the measured shell.
 *
 * Four things change relative to the prompt these rules came from:
 *
 * 1. **Projected area is the largest projection, not `bbox X x Y`.** The prompt
 *    assumed the draw runs along Z. It often does not — a bumper modelled with
 *    its length along Z would have been projected onto its small end face, and
 *    projected area sets clamp tonnage, which sets the press. Undersizing the
 *    press is the documented bumper failure. Taking the two largest bbox
 *    dimensions can only over-size, never under-size.
 *
 * 2. **The press is sized here.** `estimateClampingTonnage` -> `pickIMMPressId`
 *    already existed but only ran in the browser after the form was filled.
 *
 * 3. **Mould cost, steel class and mould life are computed, not quoted.**
 *    `estimateMouldCost` was written, tested and unreachable from the CAD path;
 *    the prompt carried a flat `mouldLife=1000000` for every part ever moulded.
 *    Life now follows the steel class, and the steel class follows the shots the
 *    programme actually needs.
 *
 * 4. **Cavitation is capped by clamp force.** The prompt's weight ladder could
 *    ask for four cavities of a part whose four-up tool no press in the library
 *    can close.
 */
import {
  estimateClampingTonnage, pickIMMPressId, steelClassFor,
  thermodynamicCoolFactor, dryCycleSeconds, injectionRateCm3PerSec, TAKE_OUT_S,
  type MouldSteelClass,
} from '../../modules/injection-moulding.js';
import { optimiseCavitation, type CavitationChoice } from '../../cavitation-optimiser.js';
import { decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { thinWallAmbiguity } from '../derive/thin-wall-ambiguity.js';
import { projectedAreaCm2, projectedAreaBasis, governingWallMm } from '../derive/envelope.js';

/** Largest press in the rate library, tonnes — the hard cavitation ceiling. */
const MAX_CLAMP_TONNES = 3500;

/** A typical automotive programme, years. Turns an annual volume into a tool life. */
const PROGRAMME_YEARS = 5;

/**
 * Projected area of one cavity, cm² — the two largest bounding-box dimensions.
 * Shared with forging, which needs the same footprint for its die-fill force.
 */
export { projectedAreaCm2 };

/**
 * Cavity count.
 *
 * The weight ladder is the prompt's, and it reflects real economics: a heavy
 * part gets a single cavity because the tool and the press both scale with the
 * shot. The clamp cap is new — cavitation that no press can close is not a
 * cavitation.
 */
export function cavityCount(ctx: RuleContext, resin: ResinFacts): { n: number; basis: string } {
  const choice = cavitationChoiceFor(ctx, resin);
  return choice
    ? { n: choice.chosen.n, basis: choice.basis }
    : { n: 1, basis: 'no measured wall/area — single cavity assumed' };
}

/**
 * The cavitation decision, ranked in pounds (see cavitation-optimiser.ts).
 * The old mass ladder (>50 g -> 1, 10–50 g -> 2, <10 g -> 4) was volume-blind:
 * annual volume never entered the one decision that trades mould NRE against
 * cycle share. Null when the geometry cannot support the arithmetic.
 */
export function cavitationChoiceFor(ctx: RuleContext, resin: ResinFacts): CavitationChoice | null {
  const wall = mouldWallMm(ctx);
  const areaCm2 = projectedAreaCm2(ctx);
  if (!wall || !areaCm2) return null;
  const runner = runnerChoice(ctx, resin, areaCm2);
  return optimiseCavitation({
    areaPerCavityCm2: areaCm2,
    cavityPressureMPa: resin.cavityPressureMPa ?? 50,
    shotSeconds: shotSecondsFor(ctx, resin, 'imm-200t', 1),
    cycleSecondsFor: (pressId, n) => shotSecondsFor(ctx, resin, pressId, n),
    annualVolume: ctx.annualVolume,
    sideActionsLifters: sideActions(ctx).n,
    maxClampTonnes: MAX_CLAMP_TONNES,
    programmeYears: PROGRAMME_YEARS,
    runnerSystem: runner.system,
    dropsPerCavity: runner.dropsPerCavity,
    manning: mouldManning(pickIMMPressId(estimateClampingTonnage({
      projectedAreaCm2: areaCm2, cavityPressureMPa: resin.cavityPressureMPa ?? 50 }))).n,
    rejectRate: MOULDING_REJECT,
    // Depth is NOT passed: the build-up's depth law was calibrated with its own
    // footprint-derived depth against the one quoted tool (the bumper, £420k), and
    // the measured depth would move that anchor +13% with nothing to check it by.
  });
}

/**
 * The wall that governs the cycle, mm: the measured wall after the thin-shell
 * correction (2·V/S when the ray-cast overshot the cavity), p95-capped when the
 * ray cast is trusted. Fill, pack and cool all read THIS one figure now; fill
 * and pack used the raw ray-cast mean, which on a shelled cover read 29.5 mm.
 */
export function mouldWallMm(ctx: RuleContext): number | null {
  return governingWallMm(ctx.geo.wallThickness)?.mm ?? null;
}

/** Part depth along the draw, cm — the cavity block depth in the tool build-up. */
export function partDepthCm(ctx: RuleContext): number | null {
  const b = ctx.geo.boundingBox;
  if (!b) return null;
  const dims = [b.xMm, b.yMm, b.zMm];
  const d = ctx.geo.draftAnalysis?.drawDirectionXYZ;
  const axis = d ? d.findIndex(c => Math.abs(c) > 0.99) : -1;
  const mm = axis >= 0 ? dims[axis] : Math.min(...dims);
  return mm > 0 ? Math.round(mm / 10 * 10) / 10 : null;
}

/** Fill and pack, from the shot volume and the press, and the wall. */
export function fillSeconds(shotCm3: number, pressId: string): number {
  return Math.max(1.5, Math.round(shotCm3 / injectionRateCm3PerSec(pressId) * 10) / 10);
}
export function packSeconds(wallMm: number): number {
  return Math.max(2.0, Math.round(wallMm * 0.8 * 10) / 10);
}
/** Mould open, eject, take-out and close: the press dry cycle plus take-out. */
export function ejectSeconds(pressId: string): number {
  return Math.round((dryCycleSeconds(pressId) + TAKE_OUT_S) * 10) / 10;
}
export function coolFactorFor(resin: ResinFacts): number {
  return thermodynamicCoolFactor(resin.materialId ?? '')?.factorSPerMm2
    ?? resin.coolFactorSPerMm2!;
}

/** Shot volume, cm³: n parts plus the cold runner (none on a hot runner). */
function shotCm3(ctx: RuleContext, resin: ResinFacts, n: number): number {
  const part = ctx.geo.volume?.cm3 ?? 0;
  const runner = runnerChoice(ctx, resin, projectedAreaCm2(ctx) ?? 0);
  const runnerKg = runner.system === 'hot' ? 0 : coldRunnerKgPerShot(resin.massKg ?? 0, n);
  return n * part + runnerKg / ((resin.densityKgPerM3 ?? 1000) / 1e6);
}

/** The whole shot on a press, s — what the cycle rules print and the optimiser ranks. */
export function shotSecondsFor(ctx: RuleContext, resin: ResinFacts, pressId: string, n: number): number {
  const wall = mouldWallMm(ctx) ?? 0;
  return fillSeconds(shotCm3(ctx, resin, n), pressId) + packSeconds(wall)
    + coolFactorFor(resin) * wall ** 2 + ejectSeconds(pressId);
}

/** Typical moulding scrap (start-up, short shots, cosmetics): 1–3%; 2% is used. */
export const MOULDING_REJECT = 0.02;

/**
 * Cold runner and sprue per SHOT, kg: 15% of the shot, but never under 3 g a
 * cavity — a small part's runner is a large share of it (an 8-up 5 g clip
 * carries ~25 g of runner, not 6 g).
 */
export function coldRunnerKgPerShot(partKg: number, n: number): number {
  return Math.round(Math.max(0.15 * partKg * n, 0.003 * n) * 10_000) / 10_000;
}

/**
 * Hot or cold runner. Large parts (≥ 250 g) are hot-runnered as a matter of
 * course — a cold runner on a bumper is kilograms of waste a shot — and so is
 * high-volume work (≥ 1M a year), where the runner's material and cooling time
 * outweigh the manifold. A large footprint takes several drops: one per ~1,500 cm².
 * Stated engineering practice; the engineer can change it on the form.
 */
export function runnerChoice(ctx: RuleContext, resin: ResinFacts, areaCm2: number):
  { system: 'hot' | 'cold'; dropsPerCavity: number; basis: string } {
  const kg = resin.massKg ?? 0;
  // Large automotive skins run 4–8 sequential valve gates: one per ~1,500 cm².
  const drops = Math.max(1, Math.ceil(areaCm2 / 1500));
  if (kg >= 0.25) {
    return { system: 'hot', dropsPerCavity: drops,
      basis: `${(kg * 1000).toFixed(0)} g part — hot runner, ${drops} drop(s) a cavity (one per ~1,500 cm² of ${areaCm2.toFixed(0)} cm²)` };
  }
  if (ctx.annualVolume >= 1_000_000) {
    return { system: 'hot', dropsPerCavity: 1,
      basis: `${ctx.annualVolume.toLocaleString('en-GB')}/yr — hot runner: the runner's material and cooling time outweigh the manifold at this volume` };
  }
  return { system: 'cold', dropsPerCavity: 0,
    basis: `${(kg * 1000).toFixed(0)} g part at ${ctx.annualVolume.toLocaleString('en-GB')}/yr — cold runner and sprue` };
}

/**
 * Operators per press. An automatic press with a picker or robot is tended
 * one operator to two presses (0.5); above 500 t the parts are large and are
 * taken off, trimmed and packed by hand — one per press. Headless charged 1.0
 * on every press and the screen 0.25: labour 4x apart on the same part.
 */
export function mouldManning(pressId: string): { n: number; basis: string } {
  const t = Number(/(\d+)t/.exec(pressId)?.[1] ?? 0);
  return t > 500
    ? { n: 1, basis: `${pressId}: large parts taken off, trimmed and packed by hand — one operator a press` }
    : { n: 0.5, basis: `${pressId}: automatic press with picker / robot — one operator tends two presses` };
}

/**
 * Side actions.
 *
 * The kernel counts undercut faces, not mechanisms; one slide typically clears a
 * cluster of faces on the same side. Six faces per slide is a working ratio, and
 * the confidence says how much to trust it. What matters is that a part with
 * undercuts never gets a zero-slide tool cost, which is what happened when this
 * number came back from a model that could not see the draft analysis.
 */
export function sideActions(ctx: RuleContext): { n: number; basis: string } {
  const faces = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  if (faces === 0) return { n: 0, basis: 'no undercut faces — straight-pull tool' };
  const n = Math.min(6, Math.ceil(faces / 6));
  return { n, basis: `${faces} undercut face(s) -> ${n} slide/lifter(s) at ~6 faces each` };
}

// steelClassFor now lives beside `mouldSteelClassFactor` in the module so the
// life ladder and the cost multiplier cannot drift; re-exported for callers.
export { steelClassFor };

interface ImAdvice {
  resin: ResinFacts;
  wallMm: number;
  areaCm2: number;
  choice: CavitationChoice;
  cavities: number;
  cavitiesBasis: string;
  slides: number;
  slidesBasis: string;
  clampTonnes: number;
  pressId: string;
  steel: { cls: MouldSteelClass; life: number };
  shots: number;
}

function advise(ctx: RuleContext): { advice: ImAdvice } | { blocked: RuleOutcome<never> } {
  // Is this a moulding at all, or a pressing? Same stop the sheet-metal rules use.
  const amb = thinWallAmbiguity(ctx);
  if (amb.decision) return { blocked: ask(amb.decision) };

  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };

  const wallMm = mouldWallMm(ctx) ?? 0;
  const areaCm2 = projectedAreaCm2(ctx);
  if (!wallMm || !areaCm2) {
    return {
      blocked: ask({
        id: 'injectionMoulding.envelope', kind: 'geometry_gap',
        question: 'What is the nominal wall and the projected area?',
        why: 'No wall thickness or bounding box was measured, so neither the cooling '
          + 'time nor the clamp force can be derived — and those are the cycle and the press.',
        options: [{ value: 'enter', label: 'Enter wall thickness and projected area' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const choice = cavitationChoiceFor(ctx, resin)!;   // wall+area guaranteed above
  const slides = sideActions(ctx);
  const n = choice.chosen.n;
  const clampTonnes = estimateClampingTonnage({
    projectedAreaCm2: areaCm2 * n,
    cavityPressureMPa: resin.cavityPressureMPa!,
  });
  const shots = (ctx.annualVolume * PROGRAMME_YEARS) / n;

  return {
    advice: {
      resin, wallMm, areaCm2, choice,
      cavities: n, cavitiesBasis: choice.basis,
      slides: slides.n, slidesBasis: slides.basis,
      clampTonnes: Math.round(clampTonnes),
      pressId: choice.chosen.pressId,
      steel: { cls: choice.chosen.steelClass, life: choice.chosen.mouldLife },
      shots: Math.round(shots),
    },
  };
}

export const INJECTION_MOULDING_RULES: CommodityRuleSpec = {
  commodity: 'injection_moulding',
  header: 'INJECTION MOULDING COST INPUT RULES:',
  rules: [
    {
      id: 'injectionMoulding.wallThicknessMm',
      path: 'injectionMoulding.wallThicknessMm',
      fieldId: 'imm-wall',
      label: 'wallThicknessMm',
      evaluate: (ctx) => {
        const gw = governingWallMm(ctx.geo.wallThickness);
        if (!gw) return ask({
          id: 'injectionMoulding.envelope', kind: 'geometry_gap',
          question: 'What is the nominal wall and the projected area?',
          why: 'No wall thickness was measured, and cooling time goes as wall squared.',
          options: [{ value: 'enter', label: 'Enter wall thickness and projected area' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        const u = ctx.geo.wallThickness?.uniformity;
        return decided('injectionMoulding.wallThicknessMm', gw.mm, 'geometry',
          gw.basis + (u ? ` (${u} uniformity)` : ''), 0.9);
      },
    },
    {
      id: 'injectionMoulding.projectedAreaCm2',
      path: 'injectionMoulding.projectedAreaCm2',
      fieldId: 'imm-area',
      label: 'projectedAreaCm2',
      evaluate: (ctx) => {
        const a = projectedAreaCm2(ctx);
        if (a === null) return ask({
          id: 'injectionMoulding.envelope', kind: 'geometry_gap',
          question: 'What is the nominal wall and the projected area?',
          why: 'No bounding box was measured, so the clamp force cannot be derived.',
          options: [{ value: 'enter', label: 'Enter wall thickness and projected area' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('injectionMoulding.projectedAreaCm2', a, 'geometry',
          projectedAreaBasis(ctx), ctx.geo.projectedArea?.alongDrawMm2 ? 0.95 : 0.6);
      },
    },
    {
      id: 'injectionMoulding.materialId',
      path: 'injectionMoulding.materialId',
      fieldId: 'imm-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.materialId', r.advice.resin.materialId!, 'engineer',
          r.advice.resin.basis, 1);
      },
    },
    {
      id: 'injectionMoulding.partWeightKg',
      path: 'injectionMoulding.partWeightKg',
      fieldId: 'imm-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.partWeightKg', r.advice.resin.massKg!, 'geometry',
          r.advice.resin.basis, 0.95);
      },
    },
    {
      id: 'injectionMoulding.cavities',
      path: 'injectionMoulding.cavities',
      fieldId: 'imm-cav',
      label: 'cavities',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.cavities', r.advice.cavities, 'rule',
          r.advice.cavitiesBasis, 0.7);
      },
    },
    {
      id: 'injectionMoulding.cavityPressureMPa',
      path: 'injectionMoulding.cavityPressureMPa',
      fieldId: 'imm-cav-press',
      label: 'cavityPressureMPa',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.cavityPressureMPa', r.advice.resin.cavityPressureMPa!, 'library',
          `peak cavity pressure for ${r.advice.resin.grade}`, 0.7);
      },
    },
    {
      id: 'injectionMoulding.machineId',
      path: 'injectionMoulding.machineId',
      fieldId: 'imm-mach',
      label: 'machineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.machineId', r.advice.pressId, 'advisor',
          `${r.advice.areaCm2} cm² x ${r.advice.cavities} cavity at `
          + `${r.advice.resin.cavityPressureMPa} MPa = ${r.advice.clampTonnes} t clamp (1.15 safety)`, 0.85);
      },
    },
    {
      id: 'injectionMoulding.coolTimeFactorSPerMm2',
      path: 'injectionMoulding.coolTimeFactorSPerMm2',
      fieldId: 'imm-cool-f',
      label: 'coolTimeFactorSPerMm2',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const wall = governingWallMm(ctx.geo.wallThickness)?.mm ?? r.advice.wallMm;
        const thermo = thermodynamicCoolFactor(r.advice.resin.materialId ?? '');
        if (thermo) {
          const f = thermo.factorSPerMm2;
          return decided('injectionMoulding.coolTimeFactorSPerMm2', f, 'library',
            `transient conduction t = wall²/(π²·α)·ln[(4/π)(Tm−Tw)/(Te−Tw)]: `
            + `α_eff ${thermo.alphaEffMm2S} mm²/s, melt ${thermo.meltC}°C / mould ${thermo.mouldC}°C / eject ${thermo.ejectC}°C `
            + `→ ${f} s/mm²; cool ≈ ${(f * wall ** 2).toFixed(1)} s at ${wall.toFixed(1)} mm`, 0.8);
        }
        const f = r.advice.resin.coolFactorSPerMm2!;
        return decided('injectionMoulding.coolTimeFactorSPerMm2', f, 'library',
          `${r.advice.resin.grade}: curated ${f} s/mm² (no thermal reference for this resin); `
          + `cool = ${(f * wall ** 2).toFixed(1)} s at ${wall.toFixed(1)} mm`, 0.8);
      },
    },
    {
      // Fill and pack scale with wall — the melt has further to travel and longer
      // to hold. Floors stop a 0.8 mm wall asking for a half-second injection.
      id: 'injectionMoulding.fillTimeSec',
      path: 'injectionMoulding.fillTimeSec',
      fieldId: 'imm-fill',
      label: 'fillTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const cm3 = shotCm3(ctx, r.advice.resin, r.advice.cavities);
        const v = fillSeconds(cm3, r.advice.pressId);
        return decided('injectionMoulding.fillTimeSec', v, 'rule',
          `${cm3.toFixed(0)} cm³ shot ÷ ${injectionRateCm3PerSec(r.advice.pressId)} cm³/s injection rate on the `
          + `${r.advice.pressId} (engineering-typical), floored at 1.5 s`, 0.55);
      },
    },
    {
      id: 'injectionMoulding.packTimeSec',
      path: 'injectionMoulding.packTimeSec',
      fieldId: 'imm-pack',
      label: 'packTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const v = packSeconds(r.advice.wallMm);
        return decided('injectionMoulding.packTimeSec', v, 'rule',
          `hold to gate freeze, 0.8 s per mm of wall (${r.advice.wallMm.toFixed(1)} mm), floored at 2.0 s`, 0.55);
      },
    },
    {
      id: 'injectionMoulding.ejectTimeSec',
      path: 'injectionMoulding.ejectTimeSec',
      fieldId: 'imm-eject',
      label: 'ejectTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.ejectTimeSec', ejectSeconds(r.advice.pressId), 'rule',
          `${r.advice.pressId} dry cycle (open, close, clamp build) ${dryCycleSeconds(r.advice.pressId)} s + `
          + `${TAKE_OUT_S} s take-out — engineering-typical, was a flat 2 s on every press`, 0.55);
      },
    },
    {
      // Cold runner assumed. It is the cheaper tool and the more expensive shot,
      // so a should-cost that assumes it is the conservative one to take into a
      // negotiation. A hot runner removes this waste and adds roughly
      // £4,000 + £2,500 per drop to the mould.
      id: 'injectionMoulding.runnerWeightKg',
      path: 'injectionMoulding.runnerWeightKg',
      fieldId: 'imm-runner-wt',
      label: 'runnerWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // TOTAL per shot: the cost model divides the runner by cavities, so a
        // per-part figure at n>1 under-counted the waste by n (a live defect).
        const rc = runnerChoice(ctx, r.advice.resin, r.advice.areaCm2);
        if (rc.system === 'hot') {
          return decided('injectionMoulding.runnerWeightKg', 0, 'rule',
            'hot runner — the melt stays in the manifold, no runner waste', 0.6);
        }
        const v = coldRunnerKgPerShot(r.advice.resin.massKg!, r.advice.cavities);
        return decided('injectionMoulding.runnerWeightKg', v, 'rule',
          `cold runner and sprue per SHOT: 15% of the ${r.advice.cavities}-cavity shot, min 3 g a cavity `
          + '(the cost model allocates it per cavity)', 0.55);
      },
    },
    {
      id: 'injectionMoulding.sideActionsLifters',
      path: 'injectionMoulding.sideActionsLifters',
      fieldId: 'imm-side-actions',
      label: 'sideActionsLifters',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.sideActionsLifters', r.advice.slides, 'geometry',
          r.advice.slidesBasis, r.advice.slides === 0 ? 0.8 : 0.5);
      },
    },
    {
      id: 'injectionMoulding.steelClass',
      path: 'injectionMoulding.steelClass',
      fieldId: 'imm-steel-class',
      label: 'steelClass',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.steelClass', r.advice.steel.cls, 'rule',
          `${ctx.annualVolume.toLocaleString('en-GB')}/yr over ${PROGRAMME_YEARS} years in `
          + `${r.advice.cavities} cavity = ${r.advice.shots.toLocaleString('en-GB')} shots`, 0.7);
      },
    },
    {
      id: 'injectionMoulding.mouldLife',
      path: 'injectionMoulding.mouldLife',
      fieldId: 'imm-mould-life',
      label: 'mouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('injectionMoulding.mouldLife', r.advice.steel.life, 'library',
          `documented life for a ${r.advice.steel.cls} tool`, 0.7);
      },
    },
    {
      id: 'injectionMoulding.mouldCostGBP',
      path: 'injectionMoulding.mouldCostGBP',
      fieldId: 'imm-mould-cost',
      label: 'mouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const occt = ctx.geo.toolingCostEstimates?.imMouldCostGBP;
        // The toolmaker build-up alone (see cavitation-optimiser.ts): the old
        // geometric mean with the kernel's face-count figure (capped at £200k)
        // pulled the one quoted tool — the bumper, £420k — about 30% low.
        const tool = r.advice.choice.chosen.mouldCostGBP;
        const rc = runnerChoice(ctx, r.advice.resin, r.advice.areaCm2);
        return decided('injectionMoulding.mouldCostGBP', tool, 'advisor',
          `toolmaker build-up: ${r.advice.cavities}-cavity ${r.advice.steel.cls} tool, ${r.advice.areaCm2} cm²/cavity, `
          + `${r.advice.slides} slide(s), ${rc.system} runner`
          + `${rc.system === 'hot' ? ` (${rc.dropsPerCavity * r.advice.cavities} drop(s))` : ''}`
          + (occt ? `; kernel face-count parametric said £${Math.round(occt).toLocaleString()} (not used)` : ''),
          0.65);
      },
    },
    {
      id: 'injectionMoulding.runnerSystem',
      path: 'injectionMoulding.runnerSystem',
      fieldId: 'imm-runner-sys',
      label: 'runnerSystem',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const rc = runnerChoice(ctx, r.advice.resin, r.advice.areaCm2);
        return decided('injectionMoulding.runnerSystem', rc.system, 'rule', rc.basis, 0.6);
      },
    },
    {
      // Runner regrind blended back into the virgin. Headless assumed 80% and the
      // screen 20%; the honest ceiling is the blend limit — most automotive
      // specifications cap regrind at ~20% of the shot (less on glass-filled
      // grades, whose fibres shorten every pass) — less ~20% lost to fines.
      id: 'injectionMoulding.regrindFraction',
      path: 'injectionMoulding.regrindFraction',
      fieldId: 'imm-regrind',
      label: 'regrindFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const rc = runnerChoice(ctx, r.advice.resin, r.advice.areaCm2);
        if (rc.system === 'hot') {
          return decided('injectionMoulding.regrindFraction', 0, 'rule', 'hot runner — no runner to regrind', 0.7);
        }
        const runner = coldRunnerKgPerShot(r.advice.resin.massKg!, r.advice.cavities);
        const shot = r.advice.resin.massKg! * r.advice.cavities + runner;
        const v = Math.round(Math.min(0.8, 0.20 * shot / runner) * 100) / 100;
        return decided('injectionMoulding.regrindFraction', v, 'rule',
          `runner reused up to a 20% regrind blend in the shot, less 20% fines: min(0.8, 0.20 × ${(shot * 1000).toFixed(0)} g ÷ `
          + `${(runner * 1000).toFixed(0)} g) — set 0 where the specification forbids regrind`, 0.5);
      },
    },
    {
      id: 'injectionMoulding.manning',
      path: 'injectionMoulding.manning',
      fieldId: 'imm-manning',
      label: 'manning',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const m = mouldManning(r.advice.pressId);
        return decided('injectionMoulding.manning', m.n, 'rule', `${m.basis} (engineering-typical)`, 0.5);
      },
    },
    {
      id: 'injectionMoulding.rejectRate',
      path: 'injectionMoulding.rejectRate',
      fieldId: 'imm-reject',
      label: 'rejectRate',
      evaluate: () => decided('injectionMoulding.rejectRate', MOULDING_REJECT, 'rule',
        'moulding scrap (start-up, short shots, cosmetic rejects), engineering-typical 1–3% — the screen had none, headless 3%', 0.5),
    },
  ],
};

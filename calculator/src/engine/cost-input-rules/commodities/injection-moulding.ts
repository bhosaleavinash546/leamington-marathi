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
  estimateClampingTonnage, estimateMouldCost, pickIMMPressId, thermodynamicCoolFactor,
  type MouldSteelClass,
} from '../../modules/injection-moulding.js';
import { decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { thinWallAmbiguity } from '../derive/thin-wall-ambiguity.js';
import { projectedAreaCm2, governingWallMm } from '../derive/envelope.js';

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
  const kg = resin.massKg ?? 0;
  const ladder = kg > 0.05 ? 1 : kg >= 0.01 ? 2 : 4;
  const area = projectedAreaCm2(ctx) ?? 0;
  const pressure = resin.cavityPressureMPa ?? 50;

  let n = ladder;
  while (n > 1 && estimateClampingTonnage({ projectedAreaCm2: area * n, cavityPressureMPa: pressure }) > MAX_CLAMP_TONNES) {
    n--;
  }
  const capped = n < ladder;
  return {
    n,
    basis: `${(kg * 1000).toFixed(0)} g part`
      + (capped
        ? ` would take ${ladder} cavities, but ${ladder}-up needs more than the ${MAX_CLAMP_TONNES} t largest press — capped at ${n}`
        : ` (>50 g -> 1, 10–50 g -> 2, <10 g -> 4)`),
  };
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

/**
 * Tool steel class from the shots the programme needs.
 *
 * The life figures are the ones documented against `mouldSteelClassFactor` in
 * modules/injection-moulding.ts — prototype ~10–50k, standard P20 ~500k,
 * hardened H13 ~1M+, high-wear ~5M+. Reading them off the same ladder that sets
 * the cost multiplier keeps the two from drifting.
 */
export function steelClassFor(shots: number): { cls: MouldSteelClass; life: number } {
  if (shots <= 25_000) return { cls: 'prototype', life: 50_000 };
  if (shots <= 100_000) return { cls: 'standard', life: 500_000 };
  if (shots <= 1_000_000) return { cls: 'production', life: 1_000_000 };
  return { cls: 'high_volume', life: 5_000_000 };
}

interface ImAdvice {
  resin: ResinFacts;
  wallMm: number;
  areaCm2: number;
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

  const wallMm = ctx.geo.wallThickness?.meanMm ?? 0;
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

  const cav = cavityCount(ctx, resin);
  const slides = sideActions(ctx);
  const clampTonnes = estimateClampingTonnage({
    projectedAreaCm2: areaCm2 * cav.n,
    cavityPressureMPa: resin.cavityPressureMPa!,
  });
  const shots = (ctx.annualVolume * PROGRAMME_YEARS) / cav.n;

  return {
    advice: {
      resin, wallMm, areaCm2,
      cavities: cav.n, cavitiesBasis: cav.basis,
      slides: slides.n, slidesBasis: slides.basis,
      clampTonnes: Math.round(clampTonnes),
      pressId: pickIMMPressId(clampTonnes),
      steel: steelClassFor(shots),
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
          'projection: bbox face × √fill for a solid, bbox face (worst case) for a shell', 0.75);
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
        const v = Math.max(1.5, Math.round(r.advice.wallMm * 0.5 * 10) / 10);
        return decided('injectionMoulding.fillTimeSec', v, 'rule',
          `0.5 s per mm of wall (${r.advice.wallMm.toFixed(1)} mm), floored at 1.5 s`, 0.6);
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
        const v = Math.max(2.0, Math.round(r.advice.wallMm * 0.8 * 10) / 10);
        return decided('injectionMoulding.packTimeSec', v, 'rule',
          `0.8 s per mm of wall (${r.advice.wallMm.toFixed(1)} mm), floored at 2.0 s`, 0.6);
      },
    },
    {
      id: 'injectionMoulding.ejectTimeSec',
      path: 'injectionMoulding.ejectTimeSec',
      fieldId: 'imm-eject',
      label: 'ejectTimeSec',
      evaluate: () => decided('injectionMoulding.ejectTimeSec', 2, 'rule',
        'mould open + eject + close, standard toggle press', 0.6),
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
        const v = Math.round(r.advice.resin.massKg! * 0.15 * 10_000) / 10_000;
        return decided('injectionMoulding.runnerWeightKg', v, 'rule',
          '15% of part weight — cold runner and sprue; a hot runner would make this 0', 0.6);
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
        const est = estimateMouldCost({
          cavities: r.advice.cavities,
          projectedAreaCm2: r.advice.areaCm2 * r.advice.cavities,
          steelClass: r.advice.steel.cls,
          sideActionsLifters: r.advice.slides,
          runnerSystem: 'cold',
        });
        const occt = ctx.geo.toolingCostEstimates?.imMouldCostGBP;
        // Two independent parametrics exist: the area-driven advisor estimate
        // and the kernel's B-rep-derived figure. On the real bumper they said
        // £828k and £200k, the advisor number stood alone, and tooling carried
        // the whole +30% residual. When both exist, take the geometric mean —
        // the standard combination for multiplicative estimators — and show
        // both inputs in the basis so the blend is arguable, not hidden.
        // (The explainer deck's own bumper-class example uses £420k; the blend
        // lands at £407k.)
        const blended = occt && occt > 0
          ? Math.round(Math.sqrt(est.total * occt))
          : est.total;
        return decided('injectionMoulding.mouldCostGBP', blended, 'advisor',
          `${r.advice.cavities}-cavity ${r.advice.steel.cls} tool, ${r.advice.areaCm2} cm²/cavity, `
          + `${r.advice.slides} slide(s)`
          + (occt ? ` — advisor £${est.total.toFixed(0)} ⊕ OCCT £${occt.toFixed(0)} (geometric mean)` : ''),
          0.65);
      },
    },
  ],
};

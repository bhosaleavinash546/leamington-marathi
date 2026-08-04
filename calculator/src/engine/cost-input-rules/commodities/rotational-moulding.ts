/**
 * Rotational-moulding cost inputs, derived from the measured shell.
 *
 * Roto is the slowest process in the tool — a 6 mm PE wall bakes for over 20
 * minutes and cools for nearly half an hour — so the cycle IS the cost, and the
 * prompt left both halves of it as ranges for a model to choose from:
 *
 *     heatTimeSec: 900–2400s (15–40 min oven time; scales with wall and volume)
 *     coolTimeSec: 600–1800s (10–30 min; forced air or water mist)
 *     mouldCostGBP: simple Al → 8000–20000; complex with inserts → 20000–60000
 *
 * `estimateRotoCycle` computes both from wall thickness, material and cooling
 * method, and `estimateRotoMouldCost` prices the tool from the footprint. Both
 * were written and never called from CAD.
 *
 * The roto-specific derivation: **oven time is per-arm, not per-part.** A
 * carousel machine indexes several arms through the oven, and how many parts sit
 * on an arm depends on the part's size against the arm's swing. Getting that
 * wrong is the difference between one part carrying a 25-minute bake and four
 * parts sharing it.
 */
import {
  estimateRotoCycle, estimateRotoMouldCost,
  type RotoMaterialFamily, type RotoCoolingMethod, type RotoMouldType, type RotoComplexity,
} from '../../modules/roto-advisor.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { hollowVerdict } from '../derive/hollow.js';
import { bboxSortedMm, projectedAreaCm2 } from '../derive/envelope.js';

/** Map the chosen resin onto the roto advisor's material families. */
export function rotoFamilyOf(materialId: string): RotoMaterialFamily {
  const s = materialId.toLowerCase();
  if (/xlpe|cross/.test(s)) return 'xlpe';
  if (/pa12|nylon/.test(s)) return 'pa12';
  if (/\bpp\b|polyprop/.test(s)) return 'pp';
  return 'pe';
}

/**
 * Parts per arm.
 *
 * A carousel arm swings through a fixed envelope; a big tank fills it, small
 * parts share it. The tiers below are the swing volumes a standard three- and
 * four-arm machine offers, and they carry the oven and cooling time between
 * them — which is why the number matters far more here than on a press.
 */
export function partsPerArm(ctx: RuleContext): { n: number; basis: string } {
  const d = bboxSortedMm(ctx);
  if (!d) return { n: 1, basis: 'no bounding box — assuming one part per arm' };
  const envelopeL = Math.round(d[0] * d[1] * d[2] / 1e6 * 10) / 10;
  const n = envelopeL > 200 ? 1 : envelopeL > 50 ? 1 : envelopeL > 12 ? 2 : envelopeL > 3 ? 4 : 8;
  return {
    n,
    basis: `${envelopeL.toFixed(1)} L swept envelope — `
      + (n === 1 ? 'fills an arm on its own'
        : `${n} fit an arm, so they share the oven and cooling time`),
  };
}

/** Mould construction: cast aluminium is the workhorse; big simple tanks get fabricated steel. */
export function mouldTypeFor(ctx: RuleContext, areaCm2: number): { type: RotoMouldType; reason: string } {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  if (areaCm2 > 10_000 && freeForm < 6) {
    return { type: 'fabricated', reason: 'large and simple — welded sheet is cheaper than casting a tool this size' };
  }
  return ctx.annualVolume >= 20_000
    ? { type: 'cnc-al', reason: 'high volume — machined aluminium holds tolerance over the run' }
    : { type: 'cast-al', reason: 'cast aluminium — the roto workhorse for shaped tools' };
}

export function rotoComplexity(ctx: RuleContext): RotoComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  let score = 0;
  if (freeForm >= 10) score += 2; else if (freeForm >= 4) score += 1;
  if (undercuts >= 2) score += 1;
  return score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
}

interface RmAdvice {
  resin: ResinFacts;
  family: RotoMaterialFamily;
  wallMm: number;
  areaCm2: number;
  partKg: number;
  cooling: RotoCoolingMethod;
  cycle: ReturnType<typeof estimateRotoCycle>;
  mouldType: RotoMouldType;
  mouldReason: string;
  complexity: RotoComplexity;
  arms: number;
  perArm: number;
  perArmBasis: string;
  vents: number;
}

function advise(ctx: RuleContext): { advice: RmAdvice } | { blocked: RuleOutcome<never> } {
  // A rotomoulded part is hollow by definition — the powder tumbles inside a
  // closed cavity. But a tank with a filler neck reports "no sealed void" too:
  // block only for genuine surface models or solids, and honour the answer.
  const hv = hollowVerdict(ctx.geo);
  if ((hv === 'open-surface' || hv === 'solid')
      && ctx.answers['roto.notHollow'] !== 'rotational_moulding') {
    return {
      blocked: ask({
        id: 'roto.notHollow', kind: 'commodity',
        question: 'This model encloses no cavity — is it really rotomoulded?',
        why: 'Rotational moulding tumbles powder inside a closed mould; the part is a '
          + 'hollow shell by construction. The kernel found no enclosed void, so either '
          + 'the model is a surface or half-section, or the commodity is wrong.',
        options: [
          { value: 'rotational_moulding', label: 'It is rotomoulded — the model is a half/surface model' },
          { value: 'injection_moulding', label: 'Re-route to injection moulding' },
          { value: 'thermoforming', label: 'Re-route to thermoforming' },
        ],
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };

  const wallMm = ctx.geo.wallThickness?.meanMm ?? 0;
  const areaCm2 = projectedAreaCm2(ctx);
  if (!wallMm || !areaCm2) {
    return {
      blocked: ask({
        id: 'roto.envelope', kind: 'geometry_gap',
        question: 'What is the wall thickness and the part footprint?',
        why: 'No wall or bounding box was measured. Oven time scales directly with wall '
          + 'thickness, and it is most of the cycle.',
        options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const family = rotoFamilyOf(resin.materialId!);
  // Water spray is fastest but warps thick PE; forced air is the production
  // default and what the advisor assumes when nothing else is known.
  const cooling: RotoCoolingMethod = 'forced-air';
  const mould = mouldTypeFor(ctx, areaCm2);
  const perArm = partsPerArm(ctx);
  const d = bboxSortedMm(ctx)!;
  const envelopeL = d[0] * d[1] * d[2] / 1e6;

  return {
    advice: {
      resin, family, wallMm, areaCm2, partKg: resin.massKg!,
      cooling,
      cycle: estimateRotoCycle({ wallThicknessMm: wallMm, material: family, coolingMethod: cooling }),
      mouldType: mould.type, mouldReason: mould.reason,
      complexity: rotoComplexity(ctx),
      // A big part needs the swing clearance, so fewer arms fit the carousel.
      arms: envelopeL > 200 ? 2 : envelopeL > 50 ? 3 : 4,
      perArm: perArm.n, perArmBasis: perArm.basis,
      vents: 1 + (ctx.geo.featureTable ?? []).filter(r => r.kind === 'boss').length,
    },
  };
}

export const ROTATIONAL_MOULDING_RULES: CommodityRuleSpec = {
  commodity: 'rotational_moulding',
  header: 'ROTATIONAL MOULDING COST INPUT RULES:',
  rules: [
    {
      id: 'roto.materialId',
      path: 'rotationalMoulding.materialId',
      fieldId: 'rm-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.materialId', r.advice.resin.materialId!, 'engineer', r.advice.resin.basis, 1);
      },
    },
    {
      id: 'roto.materialFamily',
      path: 'rotationalMoulding.materialFamily',
      fieldId: 'rm-mat-fam',
      label: 'materialFamily',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.materialFamily', r.advice.family, 'rule',
          `${r.advice.resin.grade} → ${r.advice.family} bake characteristics`, 0.85);
      },
    },
    {
      id: 'roto.wallThicknessMm',
      path: 'rotationalMoulding.wallThicknessMm',
      fieldId: 'rm-wall',
      label: 'wallThicknessMm',
      evaluate: (ctx) => {
        const wall = ctx.geo.wallThickness?.meanMm;
        if (!wall) return ask({
          id: 'roto.envelope', kind: 'geometry_gap',
          question: 'What is the wall thickness and the part footprint?',
          why: 'No wall was measured, and oven time scales directly with it.',
          options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('roto.wallThicknessMm', Math.round(wall * 10) / 10, 'geometry',
          `ray-cast mean wall over ${ctx.geo.wallThickness?.sampleCount ?? 0} samples`, 0.85);
      },
    },
    {
      id: 'roto.partWeightKg',
      path: 'rotationalMoulding.partWeightKg',
      fieldId: 'rm-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.partWeightKg', r.advice.partKg, 'geometry', r.advice.resin.basis, 0.9);
      },
    },
    {
      id: 'roto.heatTimeSec',
      path: 'rotationalMoulding.heatTimeSec',
      fieldId: 'rm-heat',
      label: 'heatTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('roto.heatTimeSec', a.cycle.heatingSec, 'advisor',
          `240 s mould soak + ${fmt(a.wallMm, 1)} mm of ${a.family} at its per-mm bake rate `
          + `= ${(a.cycle.heatingSec / 60).toFixed(1)} min in the oven`, 0.75);
      },
    },
    {
      id: 'roto.coolTimeSec',
      path: 'rotationalMoulding.coolTimeSec',
      fieldId: 'rm-cool',
      label: 'coolTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('roto.coolTimeSec', a.cycle.coolingSec, 'advisor',
          `${a.cooling} at ${(a.cycle.coolingSec / a.cycle.heatingSec).toFixed(2)}× the bake `
          + `= ${(a.cycle.coolingSec / 60).toFixed(1)} min`, 0.7);
      },
    },
    {
      id: 'roto.coolingMethod',
      path: 'rotationalMoulding.coolingMethod',
      fieldId: 'rm-cool-method',
      label: 'coolingMethod',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.coolingMethod', r.advice.cooling, 'rule',
          'forced air — water spray is faster but warps a thick polyethylene wall', 0.6);
      },
    },
    {
      id: 'roto.numArms',
      path: 'rotationalMoulding.numArms',
      fieldId: 'rm-num-arms',
      label: 'numArms',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.numArms', r.advice.arms, 'rule',
          r.advice.arms === 4 ? 'standard four-arm carousel'
            : r.advice.arms === 3 ? 'three arms — the part needs the swing clearance'
            : 'two arms — a large part on a shuttle or rock-and-roll machine', 0.6);
      },
    },
    {
      id: 'roto.partsPerArm',
      path: 'rotationalMoulding.partsPerArm',
      fieldId: 'rm-parts-per-arm',
      label: 'partsPerArm',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.partsPerArm', r.advice.perArm, 'geometry', r.advice.perArmBasis, 0.6);
      },
    },
    {
      id: 'roto.projectedAreaCm2',
      path: 'rotationalMoulding.projectedAreaCm2',
      fieldId: 'rm-proj-area',
      label: 'projectedAreaCm2',
      evaluate: (ctx) => {
        const a = projectedAreaCm2(ctx);
        if (a === null) return ask({
          id: 'roto.envelope', kind: 'geometry_gap',
          question: 'What is the wall thickness and the part footprint?',
          why: 'No bounding box was measured, so the tool cannot be sized.',
          options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('roto.projectedAreaCm2', a, 'geometry',
          'two largest bounding-box dimensions', 0.8);
      },
    },
    {
      id: 'roto.mouldType',
      path: 'rotationalMoulding.mouldType',
      fieldId: 'rm-mould-type',
      label: 'mouldType',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('roto.mouldType', r.advice.mouldType, 'rule', r.advice.mouldReason, 0.7);
      },
    },
    {
      id: 'roto.mouldCost',
      path: 'rotationalMoulding.mouldCostGBP',
      fieldId: 'rm-mould-cost',
      label: 'mouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const est = estimateRotoMouldCost({
          projectedAreaCm2: a.areaCm2, mouldType: a.mouldType,
          complexity: a.complexity, ventsAndInserts: a.vents,
        });
        return decided('roto.mouldCost', est.total, 'advisor',
          `${a.mouldType} tool over ${a.areaCm2.toFixed(0)} cm², ${a.complexity}: `
          + `£${est.base} base + £${est.size} size + £${est.details} vents and insulation`, 0.65);
      },
    },
    {
      id: 'roto.mouldLife',
      path: 'rotationalMoulding.mouldLife',
      fieldId: 'rm-mould-life',
      label: 'mouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // Roto tools see no pressure — they wear from handling and thermal
        // cycling, so aluminium lasts far longer here than it would on a press.
        const life = r.advice.mouldType === 'fabricated' ? 20_000
          : r.advice.mouldType === 'cnc-al' ? 10_000 : 5_000;
        return decided('roto.mouldLife', life, 'library',
          `${r.advice.mouldType} — roto tools carry no injection pressure, so life is `
          + 'set by thermal cycling and handling', 0.6);
      },
    },
  ],
};

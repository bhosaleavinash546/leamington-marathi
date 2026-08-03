/**
 * Composites cost inputs, derived from the measured laminate.
 *
 * The plan expected this one to stay engineer-input, because composites is the
 * only commodity with no parametric advisor. That turned out to be half right:
 * there is no advisor, but there did not need to be one. Once the fibre/resin
 * system is chosen, everything the costing wants falls out of the measurement
 * and the published characteristics of the system:
 *
 *   plies          = measured wall ÷ cured ply thickness
 *   areaM2         = measured surface area
 *   layup hours    = area × plies × the system's layup rate
 *   fibre fraction, waste fraction, cure time = properties of the system
 *   tool cost      = area × the tool rate for the process
 *
 * The prompt asked the model for `plies: estimate from structural requirement
 * (typical CFRP 4–16 plies; GFRP 3–8 plies)` — a guess at a number the kernel
 * has already measured. A 4 mm wall in 0.25 mm carbon prepreg is sixteen plies;
 * the same wall in 0.55 mm infused glass is seven. That is not a judgement call,
 * it is a division.
 *
 * A defect found on the way in: the prompt offers the model six process names
 * (`hand_layup | prepreg_autoclave | rtm | infusion | smc | wet_layup`) and the
 * engine accepts six different ones (`hand_layup | prepreg_layup | rtm | vartm |
 * filament_winding | pultrusion`). Only two words overlap. A model that
 * obediently answered "infusion" was returning a value nothing downstream could
 * use. See `derive/laminate.ts`.
 */
import type { CompositeProcess } from '../../modules/composites.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { laminateFacts, type LaminateSystem } from '../derive/laminate.js';
import { projectedAreaCm2 } from '../derive/envelope.js';

/** Tool cost per m² of moulding surface, by process — the ranges the prompt carried. */
const TOOL_RATE_PER_M2: Record<CompositeProcess, { base: number; perM2: number; life: number }> = {
  prepreg_layup:    { base: 12_000, perM2: 14_000, life: 500 },   // autoclave-capable, invar or tooling prepreg
  vartm:            { base: 4_000,  perM2: 5_000,  life: 300 },   // one-sided infusion tool
  rtm:              { base: 25_000, perM2: 30_000, life: 5_000 }, // matched steel die, both faces
  hand_layup:       { base: 3_000,  perM2: 4_000,  life: 200 },
  filament_winding: { base: 8_000,  perM2: 6_000,  life: 2_000 },
  pultrusion:       { base: 15_000, perM2: 2_000,  life: 20_000 },
};

/**
 * Ply count from the measured wall.
 *
 * Rounded up: you cannot lay two-thirds of a ply, and a laminate is always at
 * least two so it can be balanced about its mid-plane.
 */
export function plyCount(wallMm: number, system: LaminateSystem): { n: number; basis: string } {
  const exact = wallMm / system.plyThicknessMm;
  const n = Math.max(2, Math.ceil(exact));
  return {
    n,
    basis: `${fmt(wallMm, 2)} mm measured wall ÷ ${system.plyThicknessMm} mm cured ply `
      + `= ${fmt(exact, 1)}, rounded up to ${n}`,
  };
}

/** Laminated area in m² — the surface the plies actually cover. */
export function laminateAreaM2(ctx: RuleContext): number | null {
  const cm2 = ctx.geo.surfaceArea?.cm2;
  if (!cm2) return null;
  // A laminate is laid on one face of the tool, so the mould-side area is about
  // half the closed surface the kernel measures.
  return Math.round(cm2 / 2 / 10_000 * 1000) / 1000;
}

interface CompAdvice {
  system: LaminateSystem;
  massKg: number;
  fibrePrice: number;
  resinPrice: number;
  basis: string;
  wallMm: number;
  plies: number;
  pliesBasis: string;
  areaM2: number;
  layupHr: number;
}

function advise(ctx: RuleContext): { advice: CompAdvice } | { blocked: RuleOutcome<never> } {
  const lam = laminateFacts(ctx);
  if (lam.decision) return { blocked: ask(lam.decision) };

  const wallMm = ctx.geo.wallThickness?.meanMm ?? 0;
  const areaM2 = laminateAreaM2(ctx);
  if (!wallMm || !areaM2) {
    return {
      blocked: ask({
        id: 'composites.envelope', kind: 'geometry_gap',
        question: 'What is the laminate thickness and the moulded area?',
        why: 'No wall thickness or surface area was measured, so the ply count and the '
          + 'layup hours cannot be derived — and layup is most of the labour.',
        options: [{ value: 'enter', label: 'Enter laminate thickness and area' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const s = lam.system!;
  const p = plyCount(wallMm, s);
  return {
    advice: {
      system: s, massKg: lam.massKg!,
      fibrePrice: lam.fibrePricePerKg!, resinPrice: lam.resinPricePerKg!,
      basis: lam.basis, wallMm,
      plies: p.n, pliesBasis: p.basis,
      areaM2,
      layupHr: Math.round(areaM2 * p.n * s.layupHrPerM2PerPly * 1000) / 1000,
    },
  };
}

export const COMPOSITES_RULES: CommodityRuleSpec = {
  commodity: 'composites',
  header: 'COMPOSITES COST INPUT RULES:',
  rules: [
    {
      id: 'composites.process',
      path: 'composites.process',
      fieldId: 'comp-process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.process', r.advice.system.process, 'engineer',
          `${r.advice.system.label} — ${r.advice.system.note}`, 1);
      },
    },
    {
      id: 'composites.fibrePricePerKg',
      path: 'composites.fibrePricePerKg',
      fieldId: 'comp-fibre-price',
      label: 'fibrePricePerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.fibrePricePerKg', r.advice.fibrePrice, 'library',
          `${r.advice.system.fibreId} list price`, 0.9);
      },
    },
    {
      id: 'composites.resinPricePerKg',
      path: 'composites.resinPricePerKg',
      fieldId: 'comp-resin-price',
      label: 'resinPricePerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.resinPricePerKg', r.advice.resinPrice, 'library',
          r.advice.system.resinId
            ? `${r.advice.system.resinId} list price`
            : 'prepreg arrives impregnated — there is no separate resin buy', 0.9);
      },
    },
    {
      id: 'composites.partWeightKg',
      path: 'composites.partWeightKg',
      fieldId: 'comp-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.partWeightKg', r.advice.massKg, 'geometry', r.advice.basis, 0.9);
      },
    },
    {
      id: 'composites.fibreWeightFraction',
      path: 'composites.fibreWeightFraction',
      fieldId: 'comp-fibre-frac',
      label: 'fibreWeightFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.fibreWeightFraction', r.advice.system.fibreWeightFraction, 'library',
          `${r.advice.system.label} consolidates to this fibre mass fraction`, 0.75);
      },
    },
    {
      id: 'composites.wasteFraction',
      path: 'composites.wasteFraction',
      fieldId: 'comp-waste-frac',
      label: 'wasteFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.wasteFraction', r.advice.system.wasteFraction, 'library',
          `${r.advice.system.label}: nested ply cutting and trim offcuts`, 0.7);
      },
    },
    {
      // THE PLY FIX. The prompt asked the model to guess a number the kernel
      // has already measured.
      id: 'composites.plies',
      path: 'composites.plies',
      fieldId: 'comp-plies',
      label: 'plies',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.plies', r.advice.plies, 'geometry', r.advice.pliesBasis, 0.8);
      },
    },
    {
      id: 'composites.areaM2',
      path: 'composites.areaM2',
      fieldId: 'comp-area',
      label: 'areaM2',
      evaluate: (ctx) => {
        const a = laminateAreaM2(ctx);
        if (a === null) return ask({
          id: 'composites.envelope', kind: 'geometry_gap',
          question: 'What is the laminate thickness and the moulded area?',
          why: 'No surface area was measured.',
          options: [{ value: 'enter', label: 'Enter laminate thickness and area' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('composites.areaM2', a, 'geometry',
          `${(ctx.geo.surfaceArea?.cm2 ?? 0).toFixed(0)} cm² measured surface, halved — `
          + 'plies cover the mould side only', 0.75);
      },
    },
    {
      id: 'composites.layupTimeHrPerPart',
      path: 'composites.layupTimeHrPerPart',
      fieldId: 'comp-layup-time',
      label: 'layupTimeHrPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('composites.layupTimeHrPerPart', a.layupHr, 'rule',
          `${fmt(a.areaM2, 3)} m² × ${a.plies} plies × ${a.system.layupHrPerM2PerPly} hr/m²/ply `
          + `for ${a.system.label}`, 0.6);
      },
    },
    {
      id: 'composites.cureTimeHr',
      path: 'composites.cureTimeHr',
      fieldId: 'comp-cure-time',
      label: 'cureTimeHr',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.cureTimeHr', r.advice.system.cureHr, 'library',
          `${r.advice.system.label} cure cycle including ramp and dwell`, 0.7);
      },
    },
    {
      id: 'composites.toolingCost',
      path: 'composites.toolingCost',
      fieldId: 'comp-tool-cost',
      label: 'toolingCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const rate = TOOL_RATE_PER_M2[a.system.process];
        // The tool is sized to the part's footprint, not its laminated area — a
        // deep part covers more cloth than it occupies on the shop floor.
        const footprintM2 = (projectedAreaCm2(ctx) ?? 0) / 10_000;
        const total = Math.round(rate.base + footprintM2 * rate.perM2);
        return decided('composites.toolingCost', total, 'rule',
          `${a.system.process} tool: £${rate.base.toLocaleString('en-GB')} base + `
          + `${fmt(footprintM2, 3)} m² footprint × £${rate.perM2.toLocaleString('en-GB')}/m²`, 0.55);
      },
    },
    {
      id: 'composites.toolingLife',
      path: 'composites.toolingLife',
      fieldId: 'comp-tool-life',
      label: 'toolingLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const rate = TOOL_RATE_PER_M2[r.advice.system.process];
        return decided('composites.toolingLife', rate.life, 'library',
          r.advice.system.process === 'rtm'
            ? 'matched steel die — the only composite tool that runs like a press tool'
            : 'composite/invar tool — life is set by thermal cycling and surface degradation',
          0.6);
      },
    },
  ],
};

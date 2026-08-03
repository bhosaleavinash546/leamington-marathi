/**
 * Rubber cost inputs, derived from the measured section.
 *
 * The prompt's rubber block was the vaguest in the file — five lines, every one
 * a range:
 *
 *     cycleTimeSec: compression 120–600s; transfer 90–300s; injection 45–120s
 *     mouldCostGBP: compression simple → 2500–8000; transfer → 5000–20000; ...
 *     cavities: compression → 1–4; transfer/injection → 2–12; die_cut → 6+
 *
 * A 5x span on cycle time is a 5x span on the process bucket. `rubber-advisor.ts`
 * computes it: `estimateRubberCureTimeSec` takes the compound, the section
 * thickness and the mould temperature and returns one number, because cure is
 * physics — an Arrhenius rate against a heat-penetration term in thickness².
 *
 * Two things this module is careful about:
 *
 * 1. **Section thickness, not part size, drives the cure.** Heat has to reach
 *    the centre of the thickest section, and that term goes as thickness². A
 *    3 mm gasket and a 30 mm mount in the same compound differ by minutes.
 * 2. **The compound is asked, never inferred.** Price spans £1.45/kg to £320/kg
 *    across the compounds this tool stocks, and cure base time spans 25 s to
 *    720 s. Guessing that is not an estimate, it is a coin toss with two orders
 *    of magnitude on it.
 */
import {
  estimateRubberCureTimeSec, estimateRubberMouldCost, RUBBER_CURE_BASE_SEC,
  type RubberProc, type RubberMouldSteel, type RubberComplexity, type RubberCompoundFamily,
} from '../../modules/rubber-advisor.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { elastomerFacts, type ElastomerFacts } from '../derive/elastomer.js';
import { projectedAreaCm2, bboxSortedMm } from '../derive/envelope.js';

/**
 * Process route.
 *
 * Liquid silicone is injected — that is what LSR is for. A flat part with no
 * depth is die-cut from sheet. Otherwise volume decides: compression is cheap
 * tooling and a long cycle, injection is the reverse, transfer sits between and
 * is what you use when there are inserts to position.
 */
export function processFor(
  ctx: RuleContext, family: RubberCompoundFamily, thicknessMm: number,
): { process: RubberProc; reason: string } {
  if (family === 'silicone-lsr') {
    return { process: 'injection_mould_lsr', reason: 'liquid silicone — pumped and injected, not compressed' };
  }
  const d = bboxSortedMm(ctx);
  const flat = d ? d[2] <= 3 && d[2] / Math.max(1, d[1]) < 0.1 : false;
  if (flat && thicknessMm <= 3) {
    return { process: 'die_cut', reason: `flat ${fmt(thicknessMm, 1)} mm section — cut from calendered sheet` };
  }
  if (ctx.annualVolume >= 250_000) {
    return {
      process: 'injection_mould_lsr',
      reason: `${ctx.annualVolume.toLocaleString('en-GB')}/yr — injection carries the tooling and wins on cycle`,
    };
  }
  if (ctx.annualVolume >= 50_000) {
    return { process: 'transfer_mould', reason: 'medium volume — transfer fills a complex section without flash-heavy compression' };
  }
  return { process: 'compression_mould', reason: 'low volume — compression has the cheapest tool and the longest cycle' };
}

/** Cavitation: small parts run many-up, big mounts one-up. */
export function cavitiesFor(process: RubberProc, areaCm2: number): { n: number; basis: string } {
  if (process === 'die_cut') return { n: 8, basis: 'die-cut sheet — multiple parts per stroke' };
  const n = areaCm2 > 400 ? 1 : areaCm2 > 100 ? 2 : areaCm2 > 25 ? 4 : 8;
  return { n, basis: `${areaCm2.toFixed(0)} cm² per cavity — ${n}-up on a standard platen` };
}

/** Rubber sees low pressure, so tools are softer than a plastics mould. */
export function mouldSteelFor(process: RubberProc, annualVolume: number): RubberMouldSteel {
  if (process === 'injection_mould_lsr') return annualVolume >= 1_000_000 ? 'h13' : 'p20';
  return annualVolume >= 100_000 ? 'p20' : 'aluminium';
}

export function rubberComplexity(ctx: RuleContext): RubberComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  let score = 0;
  if (freeForm >= 8) score += 2; else if (freeForm >= 3) score += 1;
  if (undercuts >= 3) score += 1;
  return score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
}

interface RubAdvice {
  elastomer: ElastomerFacts;
  family: RubberCompoundFamily;
  thicknessMm: number;
  areaCm2: number;
  partKg: number;
  process: RubberProc;
  processReason: string;
  cavities: number;
  cavitiesBasis: string;
  steel: RubberMouldSteel;
  complexity: RubberComplexity;
  cureSec: number;
  inserts: number;
}

function advise(ctx: RuleContext): { advice: RubAdvice } | { blocked: RuleOutcome<never> } {
  const elastomer = elastomerFacts(ctx);
  if (elastomer.decision) return { blocked: ask(elastomer.decision) };

  // The cure has to reach the centre of the THICKEST section, so the mean wall
  // would flatter a part with one heavy boss. Take the max the kernel found.
  const thicknessMm = ctx.geo.wallThickness?.maxMm ?? ctx.geo.wallThickness?.meanMm ?? 0;
  const areaCm2 = projectedAreaCm2(ctx);
  if (!thicknessMm || !areaCm2) {
    return {
      blocked: ask({
        id: 'rubber.envelope', kind: 'geometry_gap',
        question: 'What is the thickest section and the part footprint?',
        why: 'No wall thickness or bounding box was measured. Cure time goes as section '
          + 'thickness squared, and cure time is the cycle.',
        options: [{ value: 'enter', label: 'Enter section thickness and footprint' }],
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const family = elastomer.family!;
  const p = processFor(ctx, family, thicknessMm);
  const cav = cavitiesFor(p.process, areaCm2);
  return {
    advice: {
      elastomer, family, thicknessMm, areaCm2, partKg: elastomer.massKg!,
      process: p.process, processReason: p.reason,
      cavities: cav.n, cavitiesBasis: cav.basis,
      steel: mouldSteelFor(p.process, ctx.annualVolume),
      complexity: rubberComplexity(ctx),
      cureSec: estimateRubberCureTimeSec({
        compoundFamily: family, thicknessMm, process: p.process,
      }),
      inserts: (ctx.geo.featureTable ?? []).filter(r => r.kind === 'boss').length,
    },
  };
}

export const RUBBER_RULES: CommodityRuleSpec = {
  commodity: 'rubber',
  header: 'RUBBER MOULDING COST INPUT RULES:',
  rules: [
    {
      id: 'rubber.materialId',
      path: 'rubber.materialId',
      fieldId: 'rub-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.materialId', r.advice.elastomer.materialId!, 'engineer',
          r.advice.elastomer.basis, 1);
      },
    },
    {
      id: 'rubber.partWeightKg',
      path: 'rubber.partWeightKg',
      fieldId: 'rub-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.partWeightKg', r.advice.partKg, 'geometry',
          r.advice.elastomer.basis, 0.9);
      },
    },
    {
      id: 'rubber.thicknessMm',
      path: 'rubber.thicknessMm',
      fieldId: 'rub-thickness',
      label: 'sectionThicknessMm',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.thicknessMm', Math.round(r.advice.thicknessMm * 10) / 10, 'geometry',
          'thickest measured section — the cure has to reach its centre, and that term '
          + 'goes as thickness²', 0.8);
      },
    },
    {
      id: 'rubber.process',
      path: 'rubber.process',
      fieldId: 'rub-process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.process', r.advice.process, 'rule', r.advice.processReason, 0.75);
      },
    },
    {
      id: 'rubber.cureTimeSec',
      path: 'rubber.cureTimeSec',
      fieldId: 'rub-cure-sec',
      label: 'cureTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('rubber.cureTimeSec', a.cureSec, 'advisor',
          `${a.family} cures in ${RUBBER_CURE_BASE_SEC[a.family]} s thin-section, plus `
          + `4 s/mm² to reach the centre of a ${fmt(a.thicknessMm, 1)} mm section, plus `
          + `${a.process.replace(/_/g, ' ')} handling`, 0.75);
      },
    },
    {
      id: 'rubber.cycleTimeSec',
      path: 'rubber.cycleTimeSec',
      fieldId: 'rub-cycle-sec',
      label: 'cycleTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.cycleTimeSec', r.advice.cureSec, 'advisor',
          `the cure IS the cycle — ${(r.advice.cureSec / 60).toFixed(1)} min per shot, `
          + `divided by ${r.advice.cavities} cavities`, 0.75);
      },
    },
    {
      id: 'rubber.cavities',
      path: 'rubber.cavities',
      fieldId: 'rub-cavities',
      label: 'cavities',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.cavities', r.advice.cavities, 'rule', r.advice.cavitiesBasis, 0.6);
      },
    },
    {
      id: 'rubber.projectedAreaCm2',
      path: 'rubber.projectedAreaCm2',
      fieldId: 'rub-proj-area',
      label: 'projectedAreaCm2',
      evaluate: (ctx) => {
        const a = projectedAreaCm2(ctx);
        if (a === null) return ask({
          id: 'rubber.envelope', kind: 'geometry_gap',
          question: 'What is the thickest section and the part footprint?',
          why: 'No bounding box was measured, so the tool cannot be sized.',
          options: [{ value: 'enter', label: 'Enter section thickness and footprint' }],
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('rubber.projectedAreaCm2', a, 'geometry',
          'two largest bounding-box dimensions', 0.8);
      },
    },
    {
      id: 'rubber.flashWeightKg',
      path: 'rubber.flashWeightKg',
      fieldId: 'rub-flash-wt',
      label: 'flashWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // Compression overfills the cavity by design and squeezes the excess out;
        // transfer and injection meter the shot, so they flash far less. Die
        // cutting has no flash at all — the skeleton is a nesting loss.
        const frac = r.advice.process === 'compression_mould' ? 0.08
          : r.advice.process === 'die_cut' ? 0 : 0.03;
        return decided('rubber.flashWeightKg',
          Math.round(r.advice.partKg * frac * 10_000) / 10_000, 'rule',
          frac === 0 ? 'die cutting makes no flash — the skeleton is a nesting loss'
            : `${(frac * 100).toFixed(0)}% of part weight — `
              + (frac === 0.08 ? 'compression overfills by design' : 'a metered shot flashes little'),
          0.6);
      },
    },
    {
      id: 'rubber.mouldSteel',
      path: 'rubber.mouldSteel',
      fieldId: 'rub-mold-steel',
      label: 'mouldSteel',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.mouldSteel', r.advice.steel, 'rule',
          r.advice.steel === 'aluminium'
            ? 'rubber sees low mould pressure, so aluminium is enough at this volume'
            : `${r.advice.steel} — ${ctx.annualVolume.toLocaleString('en-GB')}/yr through the tool`,
          0.7);
      },
    },
    {
      id: 'rubber.mouldCost',
      path: 'rubber.mouldCostGBP',
      fieldId: 'rub-mould-cost',
      label: 'mouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const est = estimateRubberMouldCost({
          process: a.process, cavities: a.cavities, projectedAreaCm2: a.areaCm2,
          moldSteel: a.steel, complexity: a.complexity, metalInserts: a.inserts,
        });
        return decided('rubber.mouldCost', est.total, 'advisor',
          `${a.cavities}-cavity ${a.process.replace(/_/g, ' ')} tool in ${a.steel}, ${a.complexity}: `
          + `£${est.base} base + £${est.cavityBlock} cavities`
          + (est.inserts ? ` + £${est.inserts} insert nests` : ''), 0.65);
      },
    },
    {
      id: 'rubber.mouldLife',
      path: 'rubber.mouldLife',
      fieldId: 'rub-mould-life',
      label: 'mouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // Rubber is abrasive but the pressures are low; the tool dies of
        // flash-land wear and cleaning, not of the metal being pushed.
        const life = r.advice.steel === 'h13' ? 1_000_000
          : r.advice.steel === 'p20' ? 500_000 : 200_000;
        return decided('rubber.mouldLife', life, 'library',
          `${r.advice.steel} rubber tool — life is set by flash-land wear and cleaning, `
          + 'not by injection pressure', 0.6);
      },
    },
  ],
};

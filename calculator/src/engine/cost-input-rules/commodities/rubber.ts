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
import { projectedAreaCm2, projectedAreaBasis, bboxSortedMm } from '../derive/envelope.js';
import { standardBatchSize } from '../../routing-optimiser.js';
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';

/**
 * An extruded profile, measured: long against its section, and its volume is
 * its cross-section (the kernel's silhouette along the length) times the length
 * — a constant section. Door, glass-run and boot seals, hoses: the commonest
 * rubber spend on a vehicle, and the route the rules never chose (rubber
 * review, Oct 2026 — a 1 m door seal was "injection moulded" with a 25-minute
 * cure).
 */
export function extrusionProfile(ctx: RuleContext): { lengthMm: number; sectionCm2: number; basis: string } | null {
  const bb = ctx.geo.boundingBox; const p = ctx.geo.projectedArea; const v = ctx.geo.volume?.cm3;
  if (!bb || !p || !v) return null;
  const dims: Array<[number, number | undefined]> = [[bb.xMm, p.xMm2], [bb.yMm, p.yMm2], [bb.zMm, p.zMm2]];
  dims.sort((x, y) => y[0] - x[0]);
  const [[L, sil], [d1]] = dims;
  if (!sil || L < 8 * d1) return null;
  const sectionCm2 = sil / 100;
  const fill = v / (sectionCm2 * L / 10);
  if (fill < 0.9 || fill > 1.1) return null;
  return { lengthMm: L, sectionCm2: Math.round(sectionCm2 * 100) / 100,
    basis: `${fmt(L, 0)} mm long, ${fmt(sectionCm2, 2)} cm² section; volume = section × length to ${(Math.abs(1 - fill) * 100).toFixed(0)}% — a constant section` };
}

/**
 * The section the cure has to penetrate, mm.
 *
 * The ray-cast MAX wall is an artefact on a profile — the door seal read 18 mm
 * against a 2–3 mm wall, and a grommet read none at all, so the rules blocked.
 * The 95th-percentile ray wall governs, capped at twice the solid's mean section
 * 2·V/S; with no ray reading, 1.5 × 2·V/S (a moulded part's thickest section
 * against its mean).
 */
export function cureSectionMm(ctx: RuleContext): { mm: number; basis: string } | null {
  const v = ctx.geo.volume?.mm3; const sa = ctx.geo.surfaceArea?.mm2;
  const mean = v && sa ? 2 * v / sa : null;
  const wt = ctx.geo.wallThickness;
  const ray = wt?.p95Mm ?? wt?.maxMm ?? null;
  if (ray && mean) {
    const mm = Math.min(ray, 2 * mean);
    return { mm: Math.round(mm * 10) / 10,
      basis: `95th-percentile ray-cast section ${fmt(ray, 1)} mm, capped at 2 × the mean section 2·V/S (${fmt(mean, 1)} mm)` };
  }
  if (mean) return { mm: Math.round(1.5 * mean * 10) / 10, basis: `no ray-cast reading: 1.5 × the mean section 2·V/S (${fmt(mean, 1)} mm)` };
  if (ray) return { mm: ray, basis: 'ray-cast section' };
  return null;
}

/**
 * Process route.
 *
 * Liquid silicone is injected — that is what LSR is for, and only LSR. A
 * constant-section profile is extruded and cured in line. A flat part with no
 * depth is die-cut from sheet. Otherwise volume decides between compression
 * (cheap tool, long cycle) and transfer (metered shot, less flash, inserts).
 * A solid-rubber (HCR) compound at high volume would run on a rubber injection
 * press; the rate library has none, so transfer is the costed proxy and the
 * basis says so. It used to send every compound above 250k/yr to the LSR
 * machine — an EPDM seal costed as liquid silicone.
 */
export function processFor(
  ctx: RuleContext, family: RubberCompoundFamily, thicknessMm: number,
): { process: RubberProc; reason: string } {
  if (family === 'silicone-lsr') {
    return { process: 'injection_mould_lsr', reason: 'liquid silicone — pumped and injected, not compressed' };
  }
  const prof = extrusionProfile(ctx);
  if (prof) return { process: 'extrusion_vulcanise', reason: `extruded and cured in line — ${prof.basis}` };
  const d = bboxSortedMm(ctx);
  const flat = d ? d[2] <= 3 && d[2] / Math.max(1, d[1]) < 0.1 : false;
  if (flat && thicknessMm <= 3) {
    return { process: 'die_cut', reason: `flat ${fmt(thicknessMm, 1)} mm section — cut from calendered sheet` };
  }
  if (ctx.annualVolume >= 50_000) {
    return { process: 'transfer_mould',
      reason: `${ctx.annualVolume.toLocaleString('en-GB')}/yr — a metered shot, less flash than compression`
        + (ctx.annualVolume >= 250_000 ? '; a rubber injection press would suit this volume but the rate library has none, so transfer is the costed proxy' : '') };
  }
  return { process: 'compression_mould', reason: 'low volume — compression has the cheapest tool and the longest cycle' };
}

/** Extrusion line speed, m/min, by section — a small seal runs faster than a heavy profile. */
export function extrusionLineSpeedMPerMin(sectionCm2: number): number {
  return sectionCm2 <= 2 ? 12 : sectionCm2 <= 6 ? 8 : 4;
}

/** The press (or line) each route runs on — the same map headless uses. */
export const RUBBER_MACHINE_FOR: Record<RubberProc, string> = {
  compression_mould: 'compression-mould-std',
  transfer_mould: 'transfer-mould-std',
  injection_mould_lsr: 'lsr-injection-machine',
  extrusion_vulcanise: 'extruder-rubber-60mm',
  calendering: 'die-cut-press-rubber',
  die_cut: 'die-cut-press-rubber',
};
/** Crew: two presses to an operator on hand-loaded compression / transfer; LSR is automatic. */
export const RUBBER_CREW: Record<RubberProc, number> = {
  compression_mould: 0.5, transfer_mould: 0.5, injection_mould_lsr: 0.25,
  extrusion_vulcanise: 2, calendering: 1, die_cut: 1,
};
/** Deflash / trim and visual check at the bench, s a part. */
export const RUBBER_DEFLASH_SEC: Record<RubberProc, number> = {
  compression_mould: 10, transfer_mould: 5, injection_mould_lsr: 2,
  extrusion_vulcanise: 0, calendering: 0, die_cut: 2,
};
/** Compounds that need a post-cure, h at temperature (modern fast grades; FFKM far longer). */
export const POST_CURE_HOURS: Partial<Record<RubberCompoundFamily, number>> = {
  fkm: 4, ffkm: 24, 'silicone-hcr': 4, 'silicone-lsr': 4, acm: 4, aem: 4, hnbr: 4,
};
export const POST_CURE_LOAD_KG = 100;
export const RUBBER_REJECT = 0.03;
/** Mould change and heat-up, h a batch (an extrusion die change is quicker). */
export const RUBBER_SETUP_HR: Record<RubberProc, number> = {
  compression_mould: 1.5, transfer_mould: 1.5, injection_mould_lsr: 1.5,
  extrusion_vulcanise: 1, calendering: 0.5, die_cut: 0.5,
};

/** Usable platen area, cm² (half the platen, for runners, sprues and spacing), by press. */
export const RUBBER_PLATEN_USABLE_CM2: Partial<Record<RubberProc, number>> = {
  compression_mould: 1800, transfer_mould: 1500, injection_mould_lsr: 1000,
};
/** Press hours a year (two shifts) and OEE — the cavitation sizing basis. */
const PRESS_HOURS_A_YEAR = 4000;
const PRESS_OEE = 0.8;
const MAX_RUBBER_CAVITIES = 32;

/**
 * Cavitation, chosen on cost.
 *
 * At least enough cavities to make the year's volume on one press, at most what
 * fits the platen (each cavity takes 2.5× its footprint with runner and land),
 * capped at 32 — and between those, the count that makes the part cheapest:
 * press and crew time per shot ÷ cavities, plus the tool (base + cavities^0.9)
 * amortised over the year. It was a footprint bucket that capped any small part
 * at 8-up (rubber review, Oct 2026). Without a cycle and volume it returns the
 * platen fit.
 */
export function cavitiesFor(
  process: RubberProc, areaCm2: number, cycleSec = 0, annualVolume = 0,
  cost?: { pressPerHrGBP: number; toolGBP: (n: number) => number },
): { n: number; basis: string } {
  if (process === 'die_cut') return { n: 8, basis: 'die-cut sheet — multiple parts per stroke' };
  const platen = RUBBER_PLATEN_USABLE_CM2[process] ?? 1500;
  const fit = Math.min(MAX_RUBBER_CAVITIES, Math.max(1, Math.floor(platen / Math.max(1, areaCm2 * 2.5))));
  if (!(cycleSec > 0 && annualVolume > 0)) {
    return { n: fit, basis: `${fit}-up: what the platen fits at ${areaCm2.toFixed(0)} cm² × 2.5 for runner and land` };
  }
  const needed = Math.max(1, Math.ceil(annualVolume * cycleSec / (PRESS_HOURS_A_YEAR * 3600 * PRESS_OEE)));
  const lo = Math.min(needed, fit);
  let n = lo; let best = Infinity;
  if (cost) {
    for (let k = lo; k <= fit; k++) {
      const c = cost.pressPerHrGBP * cycleSec / 3600 / PRESS_OEE / k + cost.toolGBP(k) / annualVolume;
      if (c < best - 1e-9) { best = c; n = k; }
    }
  }
  return { n, basis: `${n}-up: at least ${lo} to make ${annualVolume.toLocaleString('en-GB')}/yr on one press `
    + `(${Math.round(cycleSec)} s cure, ${PRESS_HOURS_A_YEAR} h × ${PRESS_OEE} OEE), at most ${fit} on the platen; `
    + (cost ? `${n} is the cheapest — press time ÷ cavities against the tool amortised over the year (£${best.toFixed(3)} a part)` : 'the capacity minimum') };
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
  sectionBasis: string;
  profile: ReturnType<typeof extrusionProfile>;
  /** Extrusion: seconds a part on the line (length ÷ line speed). */
  lineSec: number | null;
}

function advise(ctx: RuleContext): { advice: RubAdvice } | { blocked: RuleOutcome<never> } {
  const elastomer = elastomerFacts(ctx);
  if (elastomer.decision) return { blocked: ask(elastomer.decision) };

  // The cure has to reach the centre of the thickest section — measured as the
  // governing section, not the ray-cast max (an artefact on a profile).
  const section = cureSectionMm(ctx);
  const thicknessMm = section?.mm ?? 0;
  const areaCm2 = projectedAreaCm2(ctx);
  if (!thicknessMm || !areaCm2) {
    return {
      blocked: ask({
        id: 'rubber.envelope', kind: 'geometry_gap',
        question: 'What is the thickest section and the part footprint?',
        why: 'No wall thickness or bounding box was measured. Cure time goes as section '
          + 'thickness squared, and cure time is the cycle.',
        options: [{ value: 'enter', label: 'Enter section thickness and footprint' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const family = elastomer.family!;
  const p = processFor(ctx, family, thicknessMm);
  const cureForCav = estimateRubberCureTimeSec({ compoundFamily: family, thicknessMm, process: p.process });
  const steelForCav = mouldSteelFor(p.process, ctx.annualVolume);
  const lib = DEFAULT_RATE_LIBRARY;
  const pressRate = (lib.machines.find(m => m.id === RUBBER_MACHINE_FOR[p.process])?.computedRatePerHr ?? 20)
    + (lib.labour.find(l => l.id === 'lab-uk-semiskilled')?.fullyLoadedRatePerHr ?? 20) * RUBBER_CREW[p.process];
  const cav = p.process === 'extrusion_vulcanise'
    ? { n: 1, basis: 'one profile through the die' }
    : cavitiesFor(p.process, areaCm2, cureForCav, ctx.annualVolume, {
        pressPerHrGBP: pressRate,
        toolGBP: (k) => estimateRubberMouldCost({ process: p.process, cavities: k, projectedAreaCm2: areaCm2,
          moldSteel: steelForCav, complexity: rubberComplexity(ctx) }).total,
      });
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
      // Metal inserts are separate parts the rubber CAD does not carry — a
      // cylindrical boss on the rubber is not one. Counted from the engineer's
      // answer, else none (it used to count bosses as inserts).
      inserts: Math.max(0, Math.round(Number(ctx.answers['rubber.metalInserts']) || 0)),
      sectionBasis: section!.basis,
      profile: p.process === 'extrusion_vulcanise' ? extrusionProfile(ctx) : null,
      lineSec: (() => {
        const pr = p.process === 'extrusion_vulcanise' ? extrusionProfile(ctx) : null;
        return pr ? Math.round(pr.lengthMm / 1000 / extrusionLineSpeedMPerMin(pr.sectionCm2) * 60 * 10) / 10 : null;
      })(),
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
          `${r.advice.sectionBasis} — the cure has to reach the centre of the thickest section`, 0.75);
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
      // A SEPARATE cure: the in-line tunnel on an extrusion line. A moulded
      // part cures in the mould — its cure IS the cycle — so 0 here; the rule
      // used to put the mould cure in this field too, and with a cure oven
      // selected the screen added a second cure on top of the cycle.
      id: 'rubber.cureTimeSec',
      path: 'rubber.cureTimeSec',
      fieldId: 'rub-cure-sec',
      label: 'cureTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        if (a.process === 'extrusion_vulcanise' && a.lineSec) {
          return decided('rubber.cureTimeSec', a.lineSec, 'rule',
            'in-line cure tunnel (hot air / UHF) at the line takt — the profile cures as it travels', 0.6);
        }
        return decided('rubber.cureTimeSec', 0, 'rule', 'cured in the mould — the cure is the moulding cycle', 0.8);
      },
    },
    {
      id: 'rubber.cureOvenMachineId',
      path: 'rubber.cureOvenMachineId',
      fieldId: 'rub-cure-mach',
      label: 'cureOvenMachineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.cureOvenMachineId', r.advice.process === 'extrusion_vulcanise' ? 'cure-oven-rubber' : '', 'rule',
          r.advice.process === 'extrusion_vulcanise' ? 'the cure tunnel behind the extruder' : 'no separate cure', 0.7);
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
        const a = r.advice;
        if (a.process === 'extrusion_vulcanise' && a.lineSec && a.profile) {
          return decided('rubber.cycleTimeSec', a.lineSec, 'rule',
            `${fmt(a.profile.lengthMm / 1000, 2)} m ÷ ${extrusionLineSpeedMPerMin(a.profile.sectionCm2)} m/min line speed `
            + `(${fmt(a.profile.sectionCm2, 2)} cm² section) = ${fmt(a.lineSec, 1)} s a part`, 0.6);
        }
        return decided('rubber.cycleTimeSec', a.cureSec, 'advisor',
          `${a.family} cures in ${RUBBER_CURE_BASE_SEC[a.family]} s thin-section, plus `
          + `(${fmt(a.thicknessMm, 1)} mm)² ÷ (4 × 0.1 mm²/s) = ${fmt(a.thicknessMm ** 2 / 0.4, 0)} s for heat to reach the centre `
          + `(slab conduction from both faces), plus ${a.process.replace(/_/g, ' ')} handling — the cure IS the cycle, `
          + `${(a.cureSec / 60).toFixed(1)} min a shot over ${a.cavities} cavities`, 0.7);
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
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('rubber.projectedAreaCm2', a, 'geometry', projectedAreaBasis(ctx), 0.8);
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
          : r.advice.process === 'die_cut' || r.advice.process === 'extrusion_vulcanise' ? 0 : 0.03;
        return decided('rubber.flashWeightKg',
          Math.round(r.advice.partKg * frac * 10_000) / 10_000, 'rule',
          frac === 0 ? (r.advice.process === 'extrusion_vulcanise' ? 'an extrusion makes no flash; start-up and cut-off waste is in the scrap rate'
            : 'die cutting makes no flash — the skeleton is a nesting loss')
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
          process: a.process, cavities: a.cavities,
          // An extrusion die is sized on the profile section, not the part's footprint.
          projectedAreaCm2: a.profile ? a.profile.sectionCm2 : a.areaCm2,
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
    {
      id: 'rubber.machineId',
      path: 'rubber.machineId',
      fieldId: 'rub-mach',
      label: 'machineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.machineId', RUBBER_MACHINE_FOR[r.advice.process], 'rule',
          `the ${r.advice.process.replace(/_/g, ' ')} route's machine (the screen took its first drop-down option)`, 0.75);
      },
    },
    {
      id: 'rubber.labourId',
      path: 'rubber.labourId',
      fieldId: 'rub-lab',
      label: 'labourId',
      evaluate: () => decided('rubber.labourId', 'lab-uk-semiskilled', 'rule', 'press / line operative', 0.7),
    },
    {
      id: 'rubber.manning',
      path: 'rubber.manning',
      fieldId: 'rub-manning',
      label: 'manning',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.manning', RUBBER_CREW[r.advice.process], 'rule',
          r.advice.process === 'extrusion_vulcanise' ? 'extrusion line: extruder operator + cut-off / packer'
            : r.advice.process === 'injection_mould_lsr' ? 'automatic LSR cell, one setter to four'
            : 'hand-loaded presses, two to an operator', 0.55);
      },
    },
    {
      id: 'rubber.labourEfficiency',
      path: 'rubber.labourEfficiency',
      fieldId: 'rub-lab-eff',
      label: 'labourEfficiency',
      evaluate: () => decided('rubber.labourEfficiency', 0.92, 'rule', 'the shop convention (the form defaulted 0.90)', 0.7),
    },
    {
      id: 'rubber.rejectRate',
      path: 'rubber.rejectRate',
      fieldId: 'rub-reject',
      label: 'rejectRate',
      evaluate: () => decided('rubber.rejectRate', RUBBER_REJECT, 'rule',
        `${RUBBER_REJECT * 100}% (flash defects, porosity, dimensions) — vulcanised scrap cannot be reground`, 0.5),
    },
    {
      id: 'rubber.deflashCycleSec',
      path: 'rubber.deflashCycleSec',
      fieldId: 'rub-deflash-sec',
      label: 'deflashCycleSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const sec = RUBBER_DEFLASH_SEC[r.advice.process];
        return decided('rubber.deflashCycleSec', sec, 'rule',
          sec ? `${sec} s a part to trim the flash and check it by eye at a bench` : 'no flash to trim', 0.5);
      },
    },
    {
      id: 'rubber.postCureHours',
      path: 'rubber.postCureHours',
      fieldId: 'rub-postcure-hr',
      label: 'postCureHours',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const h = POST_CURE_HOURS[r.advice.family] ?? 0;
        return decided('rubber.postCureHours', h, 'rule',
          h ? `${r.advice.family} is post-cured ${h} h in a batch oven (${POST_CURE_LOAD_KG} kg a load) to drive off volatiles and set compression set`
            : `${r.advice.family} needs no post-cure`, 0.6);
      },
    },
    {
      id: 'rubber.setupHoursPerChange',
      path: 'rubber.setupHoursPerChange',
      fieldId: 'rub-setup-hr',
      label: 'setupHoursPerChange',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.setupHoursPerChange', RUBBER_SETUP_HR[r.advice.process], 'rule',
          `${RUBBER_SETUP_HR[r.advice.process]} h to change and heat the ${r.advice.process === 'extrusion_vulcanise' ? 'die' : 'mould'}`, 0.5);
      },
    },
    {
      id: 'rubber.batchSize',
      path: 'rubber.batchSize',
      fieldId: 'rub-batch',
      label: 'batchSize',
      evaluate: (ctx) => decided('rubber.batchSize', standardBatchSize(ctx.annualVolume), 'rule',
        `${ctx.annualVolume.toLocaleString('en-GB')}/yr ÷ 20 runs, held between 50 and 5,000`, 0.6),
    },
    {
      id: 'rubber.metalInserts',
      path: 'rubber.metalInserts',
      fieldId: 'rub-inserts',
      label: 'metalInserts',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('rubber.metalInserts', r.advice.inserts, ctx.answers['rubber.metalInserts'] !== undefined ? 'engineer' : 'rule',
          r.advice.inserts ? `${r.advice.inserts} bonded metal insert(s), stated` : 'rubber only — a bonded part\'s inserts are separate parts; state how many', 0.6);
      },
    },
    {
      id: 'rubber.oee',
      path: 'rubber.oee',
      fieldId: 'rub-oee',
      label: 'oee',
      evaluate: () => decided('rubber.oee', 0.80, 'rule', 'the shop convention (the form defaulted 0.78)', 0.7),
    },
  ],
};

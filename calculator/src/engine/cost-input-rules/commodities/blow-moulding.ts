/**
 * Blow-moulding cost inputs, derived from the measured shell.
 *
 * The honest limit of this commodity: **the kernel measures the plastic, not the
 * capacity.** A blow-moulded part is a container, and every ladder in the
 * process — the machine head, the cavitation, the mould size, the blow time —
 * is keyed on how many litres it holds. OCCT reports the volume of the wall
 * material; the void inside is not a solid and is not measured. The bounding box
 * gives an upper bound on the capacity and nothing gives a lower one.
 *
 * So capacity is asked, not guessed. It is the one number a person always knows
 * about a container — it is the product — and inventing it would push straight
 * into the mould cost, where `estimateBlowMouldCost` charges £900 per litre per
 * cavity.
 *
 * What is derived: wall, weight, flash, process, cavitation, machine, mould
 * material, mould cost and mould life. Two improvements over the prompt these
 * rules came from:
 *
 * 1. **Flash scales with the part.** The prompt used a flat 12%. A large
 *    accumulator-head parison sheds far more than a small bottle, and the
 *    browser already knew this (0.22 above 3 kg) while the prompt did not.
 * 2. **Mould life follows the mould material** rather than being one of two
 *    constants attached to a process name.
 */
import {
  estimateBlowMouldCost, type BlowProcess, type BlowMouldMaterial,
} from '../../modules/blow-advisor.js';
import { pickEBMMachineId, barrierMaterialId } from '../../modules/blow-moulding.js';
import { decided, ask, type CommodityRuleSpec, type Decision, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { hollowVerdict } from '../derive/hollow.js';

export const CAPACITY_DECISION_ID = 'blow.capacityL';
export const BARRIER_DECISION_ID = 'blow.barrierWall';

/** Nominal-capacity bands, and the litre figure each one costs at. */
const CAPACITY_BANDS: Array<{ value: string; label: string; litres: number }> = [
  { value: 'under_0p25', label: 'Under 250 ml', litres: 0.15 },
  { value: '0p25_2', label: '250 ml – 2 L', litres: 1.1 },
  { value: '2_20', label: '2 – 20 L', litres: 10 },
  { value: 'over_20', label: 'Over 20 L', litres: 60 },
];

/**
 * The largest capacity that fits inside the measured envelope, litres.
 *
 * Bounding-box volume less the plastic. A true upper bound — a container is
 * never boxy — used only to highlight a band, never to answer for the engineer.
 */
export function envelopeCapacityL(ctx: RuleContext): number | null {
  const bb = ctx.geo.boundingBox;
  const fill = ctx.geo.fillRatio;
  if (!bb || fill == null) return null;
  const bboxMm3 = bb.xMm * bb.yMm * bb.zMm;
  return Math.round(bboxMm3 * (1 - fill) / 1e6 * 100) / 100;
}

export function capacityDecision(ctx: RuleContext): Decision {
  const bound = envelopeCapacityL(ctx);
  const leaningValue = bound === null ? null
    : CAPACITY_BANDS.find(b => bound <= b.litres * 2)?.value ?? 'over_20';
  return {
    id: CAPACITY_DECISION_ID,
    kind: 'capacity',
    question: 'What is the nominal capacity of this container?',
    why: 'The kernel measures the plastic in the wall, not the space inside it — a void '
      + 'is not a solid, so there is nothing to measure. Capacity sets the machine head, '
      + 'the cavitation and the mould size, and the mould is charged per litre per cavity.'
      + (bound !== null
        ? ` The measured envelope could not hold more than about ${bound.toFixed(1)} L.`
        : ''),
    options: CAPACITY_BANDS.map(b => ({
      value: b.value,
      label: b.label,
      consequence: `costed at ${b.litres} L`,
      leaning: leaningValue === b.value,
    })),
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/**
 * Mono-layer or co-extruded barrier wall?
 *
 * Only asked where it can change the answer: a large polyethylene container. A
 * fuel or AdBlue tank is a 6-layer HDPE/tie/EVOH/tie/HDPE wall priced at
 * £1.55/kg against £1.06 for mono HDPE, and it needs a co-ex head rather than a
 * single-layer one. On a 12 kg tank that is roughly £6 of material per part.
 */
export function barrierDecision(ctx: RuleContext, resinId: string): Decision {
  const likely = /fuel|adblue|urea|def\b|tank/i.test(`${ctx.filename} ${ctx.geo.partName ?? ''}`);
  return {
    id: BARRIER_DECISION_ID,
    kind: 'barrier_wall',
    question: 'Is the wall mono-layer or a co-extruded barrier?',
    why: 'A permeation spec is a requirement, not a shape — the two walls are '
      + 'geometrically identical. A co-ex barrier wall adds an EVOH layer and two tie '
      + 'layers, needs a multi-layer head, and costs about 50% more per kg.'
      + (likely ? ' The part name suggests a fuel or fluid tank.' : ''),
    options: [
      { value: 'barrier', label: 'Co-extruded barrier (EVOH)', consequence: 'coex grade at £1.55/kg', leaning: likely },
      { value: 'mono', label: 'Mono-layer', consequence: `${resinId} at its list price`, leaning: !likely },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/** Which granular form process, and which coarse process the estimator wants. */
export function processFor(
  capacityL: number, resinId: string, barrier: boolean, annualVolume: number,
): { formValue: string; process: BlowProcess; reason: string } {
  if (/pet/i.test(resinId)) {
    // PET is stretch-blown, always. Two-stage reheat is the high-speed line;
    // single-stage keeps the preform hot and suits shorter runs and jars.
    return capacityL >= 0.25 && annualVolume >= 5_000_000
      ? { formValue: 'sbm_2stage', process: 'sbm', reason: 'PET at high volume — two-stage reheat SBM' }
      : { formValue: 'sbm_1stage', process: 'sbm', reason: 'PET — single-stage stretch blow' };
  }
  if (capacityL < 0.25) {
    // IBM injects the neck and body preform, so there is no pinch-off flash —
    // that is why it wins on small precision containers. Rotary machines are a
    // throughput choice above roughly 10 M/yr.
    return annualVolume >= 10_000_000
      ? { formValue: 'ibm_rotary', process: 'ibm', reason: 'under 250 ml at very high volume — rotary IBM, no flash' }
      : { formValue: 'ibm_linear', process: 'ibm', reason: 'under 250 ml — linear IBM, no pinch-off flash' };
  }
  if (barrier) {
    return { formValue: 'ebm_coex5', process: 'ebm', reason: 'co-extruded barrier wall — 5-layer EBM head' };
  }
  if (capacityL > 20) {
    return { formValue: 'ebm_large', process: 'ebm', reason: 'over 20 L — accumulator-head EBM' };
  }
  return { formValue: 'ebm_2head', process: 'ebm', reason: '250 ml – 20 L — 2-head extrusion blow' };
}

/** Mould life in cycles by mould material. Aluminium is the EBM workhorse. */
const MOULD_LIFE: Record<BlowMouldMaterial, number> = {
  aluminium: 500_000,
  'steel-p20': 1_000_000,
  'steel-h13': 2_000_000,
};

interface BmAdvice {
  resin: ResinFacts;
  materialId: string;
  barrier: boolean;
  capacityL: number;
  capacityLabel: string;
  wallMm: number;
  partKg: number;
  flashKg: number;
  grossKg: number;
  cavities: number;
  formValue: string;
  process: BlowProcess;
  processReason: string;
  mouldMaterial: BlowMouldMaterial;
}

function advise(ctx: RuleContext): { advice: BmAdvice } | { blocked: RuleOutcome<never> } {
  // A blow-moulded part encloses a void by definition. But "no sealed void" from
  // the kernel does NOT mean "not hollow": a real tank has a filler neck, so its
  // cavity communicates with the outside and topology reports zero sealed voids.
  // `hollowVerdict` separates that (near-enclosed: proceed, with a basis) from a
  // genuine surface/half model or a solid (ask). And the ask is resumable — the
  // engineer's answer is honoured, like every other gate in this file.
  const hv = hollowVerdict(ctx.geo);
  if ((hv === 'open-surface' || hv === 'solid')
      && ctx.answers['blow.notHollow'] !== 'blow_moulding') {
    return {
      blocked: ask({
        id: 'blow.notHollow', kind: 'commodity',
        question: 'This model does not enclose a sealed void — is it really blow moulded?',
        why: 'The kernel found no enclosed cavity: every shell on this solid is an outer '
          + 'shell. A blow-moulded container has an inside. Either the model is a surface '
          + 'or half-section rather than the finished part, or this is an injection-moulded '
          + 'or thermoformed part.',
        options: [
          { value: 'blow_moulding', label: 'It is blow moulded — the model is a half/surface model' },
          { value: 'injection_moulding', label: 'Re-route to injection moulding' },
          { value: 'thermoforming', label: 'Re-route to thermoforming' },
        ],
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };

  const answeredBand = ctx.answers[CAPACITY_DECISION_ID];
  const band = CAPACITY_BANDS.find(b => b.value === answeredBand);
  if (!band) return { blocked: ask(capacityDecision(ctx)) };

  // Only a large polyethylene container can be a barrier tank; anywhere else the
  // question is noise and the answer is mono.
  const barrierApplies = band.litres > 20 && /hdpe|lldpe|pe-bm|pe100/i.test(resin.materialId!);
  let barrier = false;
  if (barrierApplies) {
    const ans = ctx.answers[BARRIER_DECISION_ID];
    if (ans !== 'barrier' && ans !== 'mono') {
      return { blocked: ask(barrierDecision(ctx, resin.materialId!)) };
    }
    barrier = ans === 'barrier';
  }

  const wallMm = ctx.geo.wallThickness?.meanMm ?? 0;
  if (!wallMm) {
    return {
      blocked: ask({
        id: 'blow.wall', kind: 'geometry_gap',
        question: 'What is the nominal wall thickness?',
        why: 'No wall was measured, and cooling — most of the blow cycle — goes as wall squared.',
        options: [{ value: 'enter', label: 'Enter the nominal wall' }],
        entry: { kind: 'number' },
        blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
      }),
    };
  }

  const materialId = barrierMaterialId(resin.materialId!, barrier);
  const partKg = resin.massKg!;
  const proc = processFor(band.litres, resin.materialId!, barrier, ctx.annualVolume);
  // Only extrusion blow has a pinch-off. IBM and SBM start from an injected
  // preform, which is the whole reason they are chosen for small precision
  // containers — the prompt's flat 12% charged them for flash they never make.
  const flashFrac = proc.process !== 'ebm' ? 0 : partKg > 3 ? 0.22 : 0.12;
  const flashKg = Math.round(partKg * flashFrac * 10_000) / 10_000;
  const mouldMaterial: BlowMouldMaterial = proc.process === 'ebm' ? 'aluminium' : 'steel-p20';

  return {
    advice: {
      resin, materialId, barrier,
      capacityL: band.litres, capacityLabel: band.label,
      wallMm, partKg, flashKg, grossKg: partKg + flashKg,
      cavities: band.litres < 0.25 ? 4 : band.litres <= 2 ? 2 : 1,
      formValue: proc.formValue, process: proc.process, processReason: proc.reason,
      mouldMaterial,
    },
  };
}

export const BLOW_MOULDING_RULES: CommodityRuleSpec = {
  commodity: 'blow_moulding',
  header: 'BLOW MOULDING COST INPUT RULES:',
  rules: [
    {
      id: 'blowMoulding.wallThicknessMm',
      path: 'blowMoulding.wallThicknessMm',
      fieldId: 'bm-wall',
      label: 'wallThicknessMm',
      evaluate: (ctx) => {
        const wall = ctx.geo.wallThickness?.meanMm;
        if (!wall) return ask({
          id: 'blow.wall', kind: 'geometry_gap',
          question: 'What is the nominal wall thickness?',
          why: 'No wall was measured, and cooling goes as wall squared.',
          options: [{ value: 'enter', label: 'Enter the nominal wall' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('blowMoulding.wallThicknessMm', Math.round(wall * 10) / 10, 'geometry',
          `ray-cast mean wall over ${ctx.geo.wallThickness?.sampleCount ?? 0} samples`, 0.85);
      },
    },
    {
      id: 'blowMoulding.materialId',
      path: 'blowMoulding.materialId',
      fieldId: 'bm-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.materialId', r.advice.materialId, 'engineer',
          r.advice.barrier
            ? `${r.advice.resin.grade} upgraded to the 6-layer EVOH barrier grade`
            : r.advice.resin.basis, 1);
      },
    },
    {
      id: 'blowMoulding.partVolumeL',
      path: 'blowMoulding.partVolumeL',
      fieldId: 'bm-part-vol',
      label: 'partVolumeL',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const bound = envelopeCapacityL(ctx);
        return decided('blowMoulding.partVolumeL', r.advice.capacityL, 'engineer',
          `${r.advice.capacityLabel} confirmed by the engineer`
          + (bound !== null ? `; the measured envelope holds at most ${bound.toFixed(1)} L` : ''), 0.7);
      },
    },
    {
      id: 'blowMoulding.partWeightKg',
      path: 'blowMoulding.partWeightKg',
      fieldId: 'bm-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.partWeightKg', r.advice.partKg, 'geometry',
          r.advice.resin.basis, 0.95);
      },
    },
    {
      id: 'blowMoulding.flashWeightKg',
      path: 'blowMoulding.flashWeightKg',
      fieldId: 'bm-flash-wt',
      label: 'flashWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.process !== 'ebm') {
          return decided('blowMoulding.flashWeightKg', 0, 'rule',
            `${r.advice.process.toUpperCase()} blows an injected preform — there is no pinch-off to trim`, 0.8);
        }
        const pct = r.advice.partKg > 3 ? 22 : 12;
        return decided('blowMoulding.flashWeightKg', r.advice.flashKg, 'rule',
          `${pct}% of part weight — pinch-off and neck trim`
          + (pct === 22 ? '; a large accumulator parison sheds more than a bottle' : ''), 0.6);
      },
    },
    {
      id: 'blowMoulding.process',
      path: 'blowMoulding.process',
      fieldId: 'bm-process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.process', r.advice.formValue, 'rule',
          r.advice.processReason, 0.8);
      },
    },
    {
      // The coarse route, which is what the costing reads — `process` above is
      // the granular machine choice the form's select carries.
      id: 'blowMoulding.subtype',
      path: 'blowMoulding.subtype',
      label: 'subtype',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.subtype', r.advice.process, 'rule',
          r.advice.processReason, 0.8);
      },
    },
    {
      // Answered by the engineer where it can matter, and a plain false where it
      // cannot — a mono-layer bottle is not "undecided", it is mono-layer.
      id: 'blowMoulding.barrierMultilayer',
      path: 'blowMoulding.barrierMultilayer',
      label: 'barrierMultilayer',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.barrierMultilayer', r.advice.barrier,
          r.advice.barrier ? 'engineer' : 'rule',
          r.advice.barrier
            ? 'confirmed as a co-extruded EVOH barrier wall'
            : 'mono-layer — no permeation spec on this part', 0.85);
      },
    },
    {
      id: 'blowMoulding.cavities',
      path: 'blowMoulding.cavities',
      fieldId: 'bm-cav',
      label: 'cavities',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.cavities', r.advice.cavities, 'rule',
          `${r.advice.capacityLabel}: under 250 ml -> 4, up to 2 L -> 2, above -> 1`, 0.7);
      },
    },
    {
      id: 'blowMoulding.machineId',
      path: 'blowMoulding.machineId',
      fieldId: 'bm-mach',
      label: 'machineId',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.machineId', pickEBMMachineId(r.advice.grossKg), 'advisor',
          `${r.advice.grossKg.toFixed(3)} kg gross shot (part + flash)`, 0.85);
      },
    },
    {
      id: 'blowMoulding.coolTimeFactorSPerMm2',
      path: 'blowMoulding.coolTimeFactorSPerMm2',
      fieldId: 'bm-cool-f',
      label: 'coolTimeFactorSPerMm2',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const f = r.advice.resin.coolFactorSPerMm2!;
        return decided('blowMoulding.coolTimeFactorSPerMm2', f, 'library',
          `${r.advice.resin.grade}: cool = ${f} x wall² = `
          + `${(f * r.advice.wallMm ** 2).toFixed(1)} s at ${r.advice.wallMm.toFixed(1)} mm`, 0.8);
      },
    },
    {
      // Pressurise-and-hold scales with the volume of air to move and the wall to
      // set against the mould. The prompt gave "3–8 s for bottles, 8–20 s for
      // large industrial parts"; this is that range made continuous.
      id: 'blowMoulding.blowTimeSec',
      path: 'blowMoulding.blowTimeSec',
      fieldId: 'bm-blow-t',
      label: 'blowTimeSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const v = Math.round(Math.min(20, Math.max(3, 3 + r.advice.capacityL * 0.8)) * 10) / 10;
        return decided('blowMoulding.blowTimeSec', v, 'rule',
          `3 s + 0.8 s per litre at ${r.advice.capacityL} L, capped at 20 s`, 0.6);
      },
    },
    {
      id: 'blowMoulding.openCloseSec',
      path: 'blowMoulding.openCloseSec',
      fieldId: 'bm-open-close',
      label: 'openCloseSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const v = Math.round(Math.min(8, Math.max(4, 4 + r.advice.capacityL * 0.1)) * 10) / 10;
        return decided('blowMoulding.openCloseSec', v, 'rule',
          `4 s + 0.1 s per litre at ${r.advice.capacityL} L, capped at 8 s`, 0.6);
      },
    },
    {
      id: 'blowMoulding.mouldMaterial',
      path: 'blowMoulding.mouldMaterial',
      fieldId: 'bm-mould-mat',
      label: 'mouldMaterial',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.mouldMaterial', r.advice.mouldMaterial, 'rule',
          r.advice.process === 'ebm'
            ? 'cast/CNC aluminium — the EBM workhorse, and it conducts heat out faster than steel'
            : `${r.advice.process.toUpperCase()} injects the preform, so the tool carries injection pressure — P20 steel`,
          0.75);
      },
    },
    {
      id: 'blowMoulding.mouldLife',
      path: 'blowMoulding.mouldLife',
      fieldId: 'bm-mould-life',
      label: 'mouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('blowMoulding.mouldLife', MOULD_LIFE[r.advice.mouldMaterial], 'library',
          `documented cycle life for a ${r.advice.mouldMaterial} blow mould`, 0.7);
      },
    },
    {
      id: 'blowMoulding.mouldCostGBP',
      path: 'blowMoulding.mouldCostGBP',
      fieldId: 'bm-mould-cost',
      label: 'mouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const est = estimateBlowMouldCost({
          process: r.advice.process,
          cavities: r.advice.cavities,
          partVolumeL: r.advice.capacityL,
          mouldMaterial: r.advice.mouldMaterial,
        });
        return decided('blowMoulding.mouldCostGBP', est.total, 'advisor',
          `${r.advice.cavities}-cavity ${r.advice.process.toUpperCase()} ${r.advice.mouldMaterial} `
          + `tool at ${r.advice.capacityL} L`, 0.6);
      },
    },
  ],
};

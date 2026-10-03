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
import { thermodynamicCoolFactor } from '../../modules/injection-moulding.js';
import { decided, ask, answeredNumber, type CommodityRuleSpec, type Decision, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { hollowVerdict } from '../derive/hollow.js';
import { shellWallMm } from '../derive/shell-wall.js';

export const CAPACITY_DECISION_ID = 'blow.capacityL';
export const EXACT_CAPACITY_DECISION_ID = 'blow.capacityExactL';
export const BARRIER_DECISION_ID = 'blow.barrierWall';

/** Nominal-capacity bands, and the litre figure each one costs at. */
const CAPACITY_BANDS: Array<{ value: string; label: string; litres: number; lo: number }> = [
  { value: 'under_0p25', label: 'Under 250 ml', litres: 0.15, lo: 0 },
  { value: '0p25_2', label: '250 ml – 2 L', litres: 1.1, lo: 0.25 },
  { value: '2_20', label: '2 – 20 L', litres: 10, lo: 2 },
  { value: 'over_20', label: 'Over 20 L', litres: 60, lo: 20 },
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
    options: [
      ...CAPACITY_BANDS.map(b => ({
        value: b.value,
        label: b.label,
        consequence: `costed at ${b.litres} L, or less if the measured envelope cannot hold that`,
        leaning: leaningValue === b.value,
      })),
      { value: 'exact', label: 'I know the exact capacity', consequence: 'asked next, costed at that figure' },
    ],
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

function exactCapacityDecision(): Decision {
  return {
    id: EXACT_CAPACITY_DECISION_ID,
    kind: 'capacity',
    question: 'What is the nominal capacity, in litres?',
    why: 'The capacity sizes the blow mould, which is charged per litre per cavity.',
    options: [{ value: 'enter', label: 'Capacity' }],
    entry: { kind: 'number', unit: 'L', placeholder: 'e.g. 3.8' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  };
}

/**
 * The litres the tool is costed at, or the question that settles it.
 *
 * A band used to be costed at its one figure whatever the part: a 3.8 L washer
 * reservoir answered "2 – 20 L" was tooled as a 10 L container. The envelope is
 * a true upper bound on what the part can hold, so the band's figure is capped
 * at it (never below the band's floor — the engineer's band stands).
 */
export function capacityOf(ctx: RuleContext):
  { litres: number; label: string; basis: string } | { decision: Decision } {
  const answered = ctx.answers[CAPACITY_DECISION_ID];
  if (answered === 'exact') {
    const typed = answeredNumber(ctx.answers, EXACT_CAPACITY_DECISION_ID);
    if (typed === null) return { decision: exactCapacityDecision() };
    return { litres: typed, label: `${typed} L`, basis: `${typed} L, entered by the engineer` };
  }
  const band = CAPACITY_BANDS.find(b => b.value === answered);
  if (!band) return { decision: capacityDecision(ctx) };
  const bound = envelopeCapacityL(ctx);
  if (bound !== null && bound < band.litres) {
    const litres = Math.round(Math.max(band.lo, bound) * 100) / 100;
    return { litres, label: band.label,
      basis: `${band.label} confirmed by the engineer; costed at ${litres} L, the most the measured envelope can hold `
        + `(the band's ${band.litres} L would not fit)` };
  }
  return { litres: band.litres, label: band.label,
    basis: `${band.label} confirmed by the engineer, costed at ${band.litres} L`
      + (bound !== null ? `; the measured envelope holds at most ${bound.toFixed(1)} L` : '') };
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

/**
 * The extrusion head on each EBM machine in the library, engineering-typical.
 *
 * A **continuous** head extrudes the next parison while the mould is closed, so
 * the parison costs no cycle time unless the extruder cannot keep up. An
 * **accumulator** head fills a ram while the mould cools, then pushes the whole
 * parison out in one stroke — that push is in series. Before this the cycle
 * carried a flat 6 s "parison" in series on every machine (headless), or the
 * form's 6–20 s per process (screen).
 */
export const EBM_HEADS: Record<string, { head: 'continuous' | 'accumulator'; extruderKgPerH: number; pushKgPerS?: number }> = {
  'blow-ebm-2head': { head: 'continuous', extruderKgPerH: 90 },
  'blow-ebm-100l': { head: 'continuous', extruderKgPerH: 120 },
  'blow-ebm-coex3': { head: 'continuous', extruderKgPerH: 300 },
  'blow-ebm-500l': { head: 'accumulator', extruderKgPerH: 250, pushKgPerS: 1.5 },
  'blow-ebm-large': { head: 'accumulator', extruderKgPerH: 450, pushKgPerS: 2.5 },
  'blow-ebm-coex5': { head: 'accumulator', extruderKgPerH: 500, pushKgPerS: 2 },
};

/** Preform injection / reheat in series on IBM and SBM — the form's process defaults. */
const PREFORM_SERIAL_SEC: Record<string, number> = {
  ibm_rotary: 2, ibm_linear: 2, sbm_1stage: 15, sbm_2stage: 4,
};
const PREFORM_MACHINE: Record<string, string> = {
  ibm_rotary: 'blow-ibm-rotary', ibm_linear: 'blow-ibm-linear',
  sbm_1stage: 'blow-sbm-1stage', sbm_2stage: 'blow-sbm-2stage',
};

/** Blow machine, from the process and the shot per cycle (part + flash × cavities). */
export function blowMachineFor(formValue: string, shotKg: number, barrier: boolean): { id: string; basis: string } {
  if (PREFORM_MACHINE[formValue]) return { id: PREFORM_MACHINE[formValue], basis: `${formValue.replace('_', ' ').toUpperCase()} — preform process` };
  if (barrier) return { id: 'blow-ebm-coex5', basis: 'co-extruded EVOH barrier wall — multi-layer head' };
  return { id: pickEBMMachineId(shotKg), basis: `${shotKg.toFixed(3)} kg shot a cycle (part + flash × cavities)` };
}

/** Operators per machine. */
export const BLOW_CREW = { continuous: 0.5, accumulator: 1, preform: 0.5 } as const;
/** Scrap after leak / wall-thickness checks. */
export const BLOW_REJECT = { ebm: 0.025, barrier: 0.03, preform: 0.015 } as const;

interface BmAdvice {
  resin: ResinFacts;
  materialId: string;
  barrier: boolean;
  capacityL: number;
  capacityLabel: string;
  capacityBasis: string;
  wallMm: number;
  wallBasis: string;
  partKg: number;
  flashKg: number;
  grossKg: number;
  cavities: number;
  formValue: string;
  process: BlowProcess;
  processReason: string;
  mouldMaterial: BlowMouldMaterial;
  machineId: string;
  machineBasis: string;
  coolFactor: number;
  coolBasis: string;
  blowSec: number;
  openCloseSec: number;
  parisonSec: number;
  parisonBasis: string;
  cycleSec: number;
  crew: number;
  crewBasis: string;
  reject: number;
}

function wallQuestion(): RuleOutcome<never> {
  return ask({
    id: 'blow.wall', kind: 'geometry_gap',
    question: 'What is the nominal wall thickness?',
    why: 'No wall was measured, and cooling — most of the blow cycle — goes as wall squared.',
    options: [{ value: 'enter', label: 'Enter the nominal wall' }],
    entry: { kind: 'number', unit: 'mm' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

/** Wall: 2·V/S, else the ray mean, else the engineer's figure. */
function blowWall(ctx: RuleContext): { mm: number; basis: string } | null {
  const w = shellWallMm(ctx.geo);
  if (w) return { mm: w.mm, basis: w.basis };
  const typed = answeredNumber(ctx.answers, 'blow.wall');
  return typed !== null ? { mm: typed, basis: `${typed} mm, entered by the engineer` } : null;
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

  const cap = capacityOf(ctx);
  if ('decision' in cap) return { blocked: ask(cap.decision) };

  // Only a large polyethylene container can be a barrier tank; anywhere else the
  // question is noise and the answer is mono.
  const barrierApplies = cap.litres > 20 && /hdpe|lldpe|pe-bm|pe100/i.test(resin.materialId!);
  let barrier = false;
  if (barrierApplies) {
    const ans = ctx.answers[BARRIER_DECISION_ID];
    if (ans !== 'barrier' && ans !== 'mono') {
      return { blocked: ask(barrierDecision(ctx, resin.materialId!)) };
    }
    barrier = ans === 'barrier';
  }

  const wall = blowWall(ctx);
  if (!wall) return { blocked: wallQuestion() };
  const wallMm = Math.round(wall.mm * 100) / 100;

  const materialId = barrierMaterialId(resin.materialId!, barrier);
  const partKg = resin.massKg!;
  const proc = processFor(cap.litres, resin.materialId!, barrier, ctx.annualVolume);
  // Only extrusion blow has a pinch-off. IBM and SBM start from an injected
  // preform, which is the whole reason they are chosen for small precision
  // containers — the prompt's flat 12% charged them for flash they never make.
  const flashFrac = proc.process !== 'ebm' ? 0 : partKg > 3 ? 0.22 : 0.12;
  const flashKg = Math.round(partKg * flashFrac * 10_000) / 10_000;
  const grossKg = partKg + flashKg;
  const mouldMaterial: BlowMouldMaterial = proc.process === 'ebm' ? 'aluminium' : 'steel-p20';
  const cavities = cap.litres < 0.25 ? 4 : cap.litres <= 2 ? 2 : 1;
  const machine = blowMachineFor(proc.formValue, grossKg * cavities, barrier);

  // Cooling: transient conduction where the resin has a thermal reference.
  const thermo = thermodynamicCoolFactor(resin.materialId ?? '');
  const coolFactor = thermo ? thermo.factorSPerMm2 : resin.coolFactorSPerMm2!;
  const coolBasis = thermo
    ? `transient conduction t = wall²/(π²·α)·ln[(4/π)(Tm−Tw)/(Te−Tw)]: `
      + `α_eff ${thermo.alphaEffMm2S} mm²/s, melt ${thermo.meltC}°C / mould ${thermo.mouldC}°C / eject ${thermo.ejectC}°C `
      + `→ ${coolFactor} s/mm²; cool ≈ ${(coolFactor * wallMm ** 2).toFixed(1)} s at ${wallMm.toFixed(2)} mm`
    : `${resin.grade}: curated ${coolFactor} s/mm² (no thermal reference for this resin); `
      + `cool = ${(coolFactor * wallMm ** 2).toFixed(1)} s at ${wallMm.toFixed(2)} mm`;
  const blowSec = Math.round(Math.min(20, Math.max(3, 3 + cap.litres * 0.8)) * 10) / 10;
  const openCloseSec = Math.round(Math.min(8, Math.max(4, 4 + cap.litres * 0.1)) * 10) / 10;
  const mouldSeq = blowSec + coolFactor * wallMm ** 2 + openCloseSec;

  // Parison time in series with the mould.
  let parisonSec: number;
  let parisonBasis: string;
  let crew: number;
  let crewBasis: string;
  const head = EBM_HEADS[machine.id];
  if (proc.process !== 'ebm' || !head) {
    parisonSec = PREFORM_SERIAL_SEC[proc.formValue] ?? 0;
    parisonBasis = `${proc.process.toUpperCase()}: preform injection / reheat ${parisonSec} s in series (process default)`;
    crew = BLOW_CREW.preform;
    crewBasis = 'one operator across two preform blow machines';
  } else {
    const shotKg = grossKg * cavities;
    const extrudeSec = shotKg / head.extruderKgPerH * 3600;
    const pushSec = head.head === 'accumulator' ? shotKg / head.pushKgPerS! : 0;
    parisonSec = Math.round(Math.max(pushSec, extrudeSec - mouldSeq) * 10) / 10;
    parisonBasis = head.head === 'accumulator'
      ? `accumulator head: ${shotKg.toFixed(2)} kg pushed out at ${head.pushKgPerS} kg/s = ${pushSec.toFixed(1)} s in series; `
        + `the ${head.extruderKgPerH} kg/h extruder refills it in ${extrudeSec.toFixed(0)} s while the mould runs (${mouldSeq.toFixed(0)} s)`
        + (extrudeSec - mouldSeq > pushSec ? ' — the extruder sets the pace' : '')
      : `continuous head: the next ${shotKg.toFixed(2)} kg parison extrudes in ${extrudeSec.toFixed(0)} s at ${head.extruderKgPerH} kg/h `
        + `while the mould runs (${mouldSeq.toFixed(0)} s)`
        + (parisonSec > 0 ? ` — the extruder sets the pace, +${parisonSec} s` : ' — nothing in series');
    crew = head.head === 'accumulator' ? BLOW_CREW.accumulator : BLOW_CREW.continuous;
    crewBasis = head.head === 'accumulator'
      ? 'one operator on a large-part line (take-out, trim and check)'
      : 'one operator across two automatic machines with in-line trim';
  }
  const cycleSec = Math.round((mouldSeq + parisonSec) * 10) / 10;
  const reject = proc.process !== 'ebm' ? BLOW_REJECT.preform : barrier ? BLOW_REJECT.barrier : BLOW_REJECT.ebm;

  return {
    advice: {
      resin, materialId, barrier,
      capacityL: cap.litres, capacityLabel: cap.label, capacityBasis: cap.basis,
      wallMm, wallBasis: wall.basis, partKg, flashKg, grossKg, cavities,
      formValue: proc.formValue, process: proc.process, processReason: proc.reason,
      mouldMaterial, machineId: machine.id, machineBasis: machine.basis,
      coolFactor, coolBasis, blowSec, openCloseSec, parisonSec, parisonBasis, cycleSec,
      crew, crewBasis, reject,
    },
  };
}

/** A rule that reads one value off the advice. */
function fromAdvice<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: BmAdvice) => { value: T; source: 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer'; basis: string; confidence: number },
) {
  return {
    id, path: id, ...(fieldId ? { fieldId } : {}), label,
    evaluate: (ctx: RuleContext) => {
      const r = advise(ctx);
      if ('blocked' in r) return r.blocked;
      const v = pick(r.advice);
      return decided(id, v.value, v.source, v.basis, v.confidence);
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
        // The AREA-MEAN wall, 2·V/S — the wall a programmed EBM parison sets,
        // and measured rather than sampled. The ray-cast mean overshoots on a
        // hollow part (rays cross the cavity: a 2.5 mm reservoir read 25.3 mm)
        // and is used only when the solid has no volume or area.
        const w = blowWall(ctx);
        if (!w) return wallQuestion();
        return decided('blowMoulding.wallThicknessMm', Math.round(w.mm * 100) / 100, 'geometry', w.basis, 0.85);
      },
    },
    fromAdvice('blowMoulding.materialId', 'bm-mat', 'materialId', a => ({
      value: a.materialId, source: 'engineer', confidence: 1,
      basis: a.barrier ? `${a.resin.grade} upgraded to the 6-layer EVOH barrier grade` : a.resin.basis,
    })),
    fromAdvice('blowMoulding.partVolumeL', 'bm-part-vol', 'partVolumeL', a => ({
      value: a.capacityL, source: 'engineer', confidence: 0.7, basis: a.capacityBasis,
    })),
    fromAdvice('blowMoulding.partWeightKg', 'bm-part-wt', 'partWeightKg', a => ({
      value: a.partKg, source: 'geometry', confidence: 0.95, basis: a.resin.basis,
    })),
    fromAdvice('blowMoulding.flashWeightKg', 'bm-flash-wt', 'flashWeightKg', a => a.process !== 'ebm'
      ? { value: 0, source: 'rule', confidence: 0.8,
          basis: `${a.process.toUpperCase()} blows an injected preform — there is no pinch-off to trim` }
      : { value: a.flashKg, source: 'rule', confidence: 0.6,
          basis: `${a.partKg > 3 ? 22 : 12}% of part weight — pinch-off and neck trim`
            + (a.partKg > 3 ? '; a large accumulator parison sheds more than a bottle' : '') }),
    // Extrusion-blow flash is granulated at the machine and fed back into the
    // wall (into the regrind layer of a co-ex tank). It was bought as virgin
    // resin and credited at scrap value — £3.20 of resin on every fuel tank.
    fromAdvice('blowMoulding.flashRegrindFraction', 'bm-flash-regrind', 'flashRegrindFraction', a => a.process !== 'ebm'
      ? { value: 0, source: 'rule', confidence: 0.8, basis: 'no flash' }
      : { value: 1, source: 'rule', confidence: 0.75,
          basis: `all pinch-off flash granulated in line and fed back — ${a.partKg > 3 ? 22 : 12}% of the shot is within the ~30% a blown wall takes`
            + (a.barrier ? ' (into the co-ex regrind layer)' : '') }),
    fromAdvice('blowMoulding.process', 'bm-process', 'process', a => ({
      value: a.formValue, source: 'rule', confidence: 0.8, basis: a.processReason,
    })),
    // The coarse route, which is what the costing reads — `process` above is
    // the granular machine choice the form's select carries.
    fromAdvice('blowMoulding.subtype', undefined, 'subtype', a => ({
      value: a.process, source: 'rule', confidence: 0.8, basis: a.processReason,
    })),
    // Answered by the engineer where it can matter, and a plain false where it
    // cannot — a mono-layer bottle is not "undecided", it is mono-layer.
    fromAdvice('blowMoulding.barrierMultilayer', undefined, 'barrierMultilayer', a => ({
      value: a.barrier, source: a.barrier ? 'engineer' : 'rule', confidence: 0.85,
      basis: a.barrier ? 'confirmed as a co-extruded EVOH barrier wall' : 'mono-layer — no permeation spec on this part',
    })),
    fromAdvice('blowMoulding.cavities', 'bm-cav', 'cavities', a => ({
      value: a.cavities, source: 'rule', confidence: 0.7,
      basis: `${a.capacityL} L: under 250 ml -> 4, up to 2 L -> 2, above -> 1`,
    })),
    fromAdvice('blowMoulding.machineId', 'bm-mach', 'machineId', a => ({
      value: a.machineId, source: 'advisor', confidence: 0.85, basis: a.machineBasis,
    })),
    fromAdvice('blowMoulding.coolTimeFactorSPerMm2', 'bm-cool-f', 'coolTimeFactorSPerMm2', a => ({
      value: a.coolFactor, source: 'library', confidence: 0.8, basis: a.coolBasis,
    })),
    // Pressurise-and-hold scales with the volume of air to move and the wall to
    // set against the mould: "3–8 s for bottles, 8–20 s for large industrial
    // parts", made continuous.
    fromAdvice('blowMoulding.blowTimeSec', 'bm-blow-t', 'blowTimeSec', a => ({
      value: a.blowSec, source: 'rule', confidence: 0.6, basis: `3 s + 0.8 s per litre at ${a.capacityL} L, capped at 20 s`,
    })),
    fromAdvice('blowMoulding.openCloseSec', 'bm-open-close', 'openCloseSec', a => ({
      value: a.openCloseSec, source: 'rule', confidence: 0.6, basis: `4 s + 0.1 s per litre at ${a.capacityL} L, capped at 8 s`,
    })),
    fromAdvice('blowMoulding.parisonExtrusionTimeSec', 'bm-parison-t', 'parisonExtrusionTimeSec', a => ({
      value: a.parisonSec, source: 'rule', confidence: 0.6,
      basis: `${a.parisonBasis}; cycle ${a.cycleSec} s`,
    })),
    fromAdvice('blowMoulding.labourId', 'bm-lab', 'labourId', () => ({
      value: 'lab-uk-blow', source: 'library', confidence: 0.8, basis: 'blow-moulding machine operator',
    })),
    fromAdvice('blowMoulding.manning', 'bm-manning', 'manning', a => ({
      value: a.crew, source: 'rule', confidence: 0.6, basis: a.crewBasis,
    })),
    fromAdvice('blowMoulding.oee', 'bm-oee', 'oee', () => ({
      value: 0.80, source: 'rule', confidence: 0.6, basis: 'shop OEE, as every moulding route',
    })),
    fromAdvice('blowMoulding.labourEfficiency', 'bm-lab-eff', 'labourEfficiency', () => ({
      value: 0.92, source: 'rule', confidence: 0.6, basis: 'shop labour efficiency, as every route',
    })),
    fromAdvice('blowMoulding.rejectRate', 'bm-reject', 'rejectRate', a => ({
      value: a.reject, source: 'rule', confidence: 0.6,
      basis: a.process !== 'ebm' ? 'preform process: 1.5% (no pinch-off, tool-formed neck)'
        : a.barrier ? 'co-ex barrier tank: 3% after leak and layer checks' : 'extrusion blow: 2.5% after leak and wall checks',
    })),
    // Trimming: every EBM part leaves the mould with its pinch-off, neck and
    // tail flash on. The station runs in line, dedicated to the blow machine,
    // so it is occupied for the machine's whole cycle per set of cavities; the
    // line's own crew tends it. Before this neither path trimmed anything.
    fromAdvice('blowMoulding.deflashMachineId', 'bm-deflash-mach', 'deflashMachineId', a => ({
      value: a.process === 'ebm' ? 'blow-deflash-trimmer' : '', source: 'rule', confidence: 0.7,
      basis: a.process === 'ebm' ? 'in-line deflash / trim station' : 'no flash to trim',
    })),
    fromAdvice('blowMoulding.deflashLabourId', 'bm-deflash-lab', 'deflashLabourId', a => ({
      value: a.process === 'ebm' ? 'lab-uk-blow' : '', source: 'rule', confidence: 0.7,
      basis: a.process === 'ebm' ? 'tended by the blow-machine operator' : 'no flash to trim',
    })),
    fromAdvice('blowMoulding.deflashCycleSec', 'bm-deflash-ct', 'deflashCycleSec', a => {
      const v = a.process === 'ebm' ? Math.round(a.cycleSec / a.cavities * 10) / 10 : 0;
      return { value: v, source: 'rule', confidence: 0.6,
        basis: a.process === 'ebm' ? `in line at the blow takt: ${a.cycleSec} s ÷ ${a.cavities} cavit${a.cavities === 1 ? 'y' : 'ies'}` : 'no flash to trim' };
    }),
    fromAdvice('blowMoulding.deflashManning', 'bm-deflash-man', 'deflashManning', a => ({
      value: 0, source: 'rule', confidence: 0.6,
      basis: a.process === 'ebm' ? 'no crew of its own — the blow crew tends the station (counted on the machine)' : 'no flash to trim',
    })),
    fromAdvice('blowMoulding.mouldMaterial', 'bm-mould-mat', 'mouldMaterial', a => ({
      value: a.mouldMaterial, source: 'rule', confidence: 0.75,
      basis: a.process === 'ebm'
        ? 'cast/CNC aluminium — the EBM workhorse, and it conducts heat out faster than steel'
        : `${a.process.toUpperCase()} injects the preform, so the tool carries injection pressure — P20 steel`,
    })),
    fromAdvice('blowMoulding.mouldLife', 'bm-mould-life', 'mouldLife', a => ({
      value: MOULD_LIFE[a.mouldMaterial], source: 'library', confidence: 0.7,
      basis: `documented cycle life for a ${a.mouldMaterial} blow mould`,
    })),
    fromAdvice('blowMoulding.mouldCostGBP', 'bm-mould-cost', 'mouldCostGBP', a => {
      const est = estimateBlowMouldCost({
        process: a.process, cavities: a.cavities, partVolumeL: a.capacityL, mouldMaterial: a.mouldMaterial,
      });
      return { value: est.total, source: 'advisor', confidence: 0.6,
        basis: `${a.cavities}-cavity ${a.process.toUpperCase()} ${a.mouldMaterial} tool at ${a.capacityL} L` };
    }),
  ],
};

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
import { inCountry, countryNote } from '../../regional-services.js';
import { activeToolroomFactor } from '../../rate-context.js';
import type { CompositeProcess } from '../../modules/composites.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { laminateFacts, type LaminateSystem } from '../derive/laminate.js';
import { planAreaCm2, bboxSortedMm } from '../derive/envelope.js';
import { shellWallMm } from '../derive/shell-wall.js';

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

/**
 * Where each system cures, and the bed it cures on (usable length × width, m).
 * An autoclave or oven cures a LOAD of tools; an RTM part cures in its die on
 * the press, one at a time. The screen used to batch 4 to a cure and headless
 * did not cost composites at all.
 */
export const CURE_CELLS: Record<string, { machineId: string; bedM: [number, number] | null; label: string }> = {
  'prepreg-cf': { machineId: 'autoclave-1200mm', bedM: [2.8, 1.0], label: '1200 mm autoclave' },
  'prepreg-gf': { machineId: 'oven-composite-cure', bedM: [3.0, 2.0], label: 'cure oven' },
  'infusion-gf': { machineId: 'oven-composite-cure', bedM: [3.0, 2.0], label: 'cure oven (post-cure on the tool)' },
  'rtm-gf': { machineId: 'rtm-press-std', bedM: null, label: 'RTM press — cures in the die' },
};
/** Tool flange around the part on a layup tool, each side, m. */
const TOOL_MARGIN_M = 0.05;
/** Hours a year a layup tool can work: two shifts. */
export const COMP_TOOL_HOURS = 4000;
export const COMP_OEE = 0.80;
/** Debag, demould, clean and release-coat a tool between parts, hr. */
const TOOL_TURNAROUND_HR = 0.5;
/** Waterjet trim: load and fixture, then the outline at a cutting speed. */
const TRIM_LOAD_HR = 0.1;
const TRIM_M_PER_MIN = 1.5;

/** Parts on one cure load: tools (plan + flange) across the bed. */
export function partsPerCure(lM: number, wM: number, bed: [number, number] | null): { n: number; basis: string } {
  if (!bed) return { n: 1, basis: 'cures in its own die, one part a press cycle' };
  const a = lM + 2 * TOOL_MARGIN_M, b = wM + 2 * TOOL_MARGIN_M;
  const fit = (x: number, y: number) => Math.floor(bed[0] / x) * Math.floor(bed[1] / y);
  const n = Math.min(20, Math.max(fit(a, b), fit(b, a)));
  if (n < 1) return { n: 1, basis: `a ${a.toFixed(2)} × ${b.toFixed(2)} m tool does not fit the ${bed[0]} × ${bed[1]} m bed — costed one to a load; a larger cure cell is needed` };
  return { n, basis: `${n} tools of ${a.toFixed(2)} × ${b.toFixed(2)} m on the ${bed[0]} × ${bed[1]} m bed — each part carries 1/${n} of the cure` };
}

interface CompAdvice {
  system: LaminateSystem;
  massKg: number;
  fibrePrice: number;
  resinPrice: number;
  basis: string;
  wallMm: number;
  wallBasis: string;
  plies: number;
  pliesBasis: string;
  areaM2: number;
  layupHr: number;
  planM2: number;
  planBasis: string;
  cureMachineId: string;
  cureLabel: string;
  perCure: number;
  perCureBasis: string;
  tools: number;
  toolsBasis: string;
  trimHr: number;
  trimBasis: string;
  ndi: number;
}

function envelopeAsk(): RuleOutcome<never> {
  return ask({
    id: 'composites.envelope', kind: 'geometry_gap',
    question: 'What is the laminate thickness and the moulded area?',
    why: 'No wall thickness or surface area was measured, so the ply count and the '
      + 'layup hours cannot be derived — and layup is most of the labour.',
    options: [{ value: 'enter', label: 'Enter laminate thickness and area' }],
    entry: { kind: 'number' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

function advise(ctx: RuleContext): { advice: CompAdvice } | { blocked: RuleOutcome<never> } {
  const lam = laminateFacts(ctx);
  if (lam.decision) return { blocked: ask(lam.decision) };

  // 2·V/S, the area-mean laminate thickness: the ray mean reads across an
  // open shell's cavity (the same fault the moulding reviews found).
  const w = shellWallMm(ctx.geo);
  const areaM2 = laminateAreaM2(ctx);
  const plan = planAreaCm2(ctx);
  const d = bboxSortedMm(ctx);
  if (!w || !areaM2 || !plan || !d) return { blocked: envelopeAsk() };
  const wallMm = Math.round(w.mm * 100) / 100;

  const s = lam.system!;
  const p = plyCount(wallMm, s);
  const layupHr = Math.round(areaM2 * p.n * s.layupHrPerM2PerPly * 1000) / 1000;
  const cell = CURE_CELLS[s.value];
  const cure = partsPerCure(d[0] / 1000, d[1] / 1000, cell.bedM);

  // Layup tools the volume needs: a tool is tied up through layup, cure and
  // turnaround, so the year's parts need volume × that ÷ the hours a tool can
  // work. The module bought only as many as tool LIFE demanded.
  const toolCycleHr = layupHr + s.cureHr + TOOL_TURNAROUND_HR;
  const needed = ctx.annualVolume * toolCycleHr / (COMP_TOOL_HOURS * COMP_OEE);
  const tools = Math.max(1, Math.ceil(needed));
  const toolsBasis = `${ctx.annualVolume.toLocaleString('en-GB')}/yr × ${toolCycleHr.toFixed(2)} h a tool is tied up `
    + `(layup ${layupHr.toFixed(2)} + cure ${s.cureHr} + turnaround ${TOOL_TURNAROUND_HR}) ÷ ${COMP_TOOL_HOURS} h × ${COMP_OEE} OEE `
    + `= ${needed.toFixed(2)} → ${tools} tool${tools === 1 ? '' : 's'}`;

  const perimM = 2 * (d[0] + d[1]) / 1000;
  const trimHr = Math.round((TRIM_LOAD_HR + perimM / TRIM_M_PER_MIN / 60) * 1000) / 1000;
  const trimBasis = `5-axis waterjet: ${TRIM_LOAD_HR} h load and fixture + ${perimM.toFixed(2)} m of edge at ${TRIM_M_PER_MIN} m/min`;

  return {
    advice: {
      system: s, massKg: lam.massKg!,
      fibrePrice: lam.fibrePricePerKg!, resinPrice: lam.resinPricePerKg!,
      basis: lam.basis, wallMm, wallBasis: w.basis,
      plies: p.n, pliesBasis: p.basis,
      areaM2, layupHr,
      planM2: plan.cm2 / 10_000, planBasis: plan.basis,
      cureMachineId: cell.machineId, cureLabel: cell.label,
      perCure: cure.n, perCureBasis: cure.basis,
      tools, toolsBasis, trimHr, trimBasis,
      // Structural carbon is ultrasonically scanned; glass covers are not.
      ndi: s.value === 'prepreg-cf' ? inCountry(25, 'inspection') : 0,   // £25 UK C-scan, in the costed country
    },
  };
}

type Src = 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer';
function fromAdvice<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: CompAdvice) => { value: T; source: Src; basis: string; confidence: number },
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
        const footprintM2 = a.planM2;
        // Built where the part is made: × the country's toolroom factor (1 in the UK).
        const tf = activeToolroomFactor();
        const total = Math.round((rate.base + footprintM2 * rate.perM2) * tf);
        return decided('composites.toolingCost', total, 'rule',
          `${a.system.process} tool: £${rate.base.toLocaleString('en-GB')} base + `
          + `${fmt(footprintM2, 3)} m² plan (${a.planBasis}) × £${rate.perM2.toLocaleString('en-GB')}/m²`
          + (tf !== 1 ? ` × toolroom factor ${tf}` : ''), 0.55);
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
    fromAdvice('composites.cureMachineId', 'comp-cure-mach', 'cureMachineId', a => ({
      value: a.cureMachineId, source: 'rule', confidence: 0.7, basis: `${a.system.label} cures in the ${a.cureLabel}` })),
    fromAdvice('composites.partsPerCureCycle', 'comp-cure-batch', 'partsPerCureCycle', a => ({
      value: a.perCure, source: 'rule', confidence: 0.6, basis: a.perCureBasis })),
    fromAdvice('composites.toolsInService', 'comp-tools', 'toolsInService', a => ({
      value: a.tools, source: 'rule', confidence: 0.6, basis: a.toolsBasis })),
    fromAdvice('composites.trimMachineId', 'comp-trim-mach', 'trimMachineId', () => ({
      value: 'waterjet-5ax-composite', source: 'rule', confidence: 0.7, basis: 'laminates are trimmed and drilled on a 5-axis waterjet — no delamination, no tool wear' })),
    fromAdvice('composites.trimTimeHr', 'comp-trim-time', 'trimTimeHr', a => ({
      value: a.trimHr, source: 'rule', confidence: 0.55, basis: a.trimBasis })),
    fromAdvice('composites.ndiCostPerPart', 'comp-ndi', 'ndiCostPerPart', a => ({
      value: a.ndi, source: 'rule', confidence: 0.5,
      basis: a.ndi > 0 ? `structural carbon: ultrasonic C-scan, £25 a part (UK)${countryNote('inspection')}` : 'glass laminate: visual and tap test, no scan' })),
    fromAdvice('composites.layupLabourId', 'comp-layup-lab', 'layupLabourId', () => ({
      value: 'lab-uk-skilled', source: 'library', confidence: 0.7, basis: 'skilled laminator' })),
    fromAdvice('composites.cureLabourId', 'comp-cure-lab', 'cureLabourId', () => ({
      value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'loads, bags and monitors the cure' })),
    fromAdvice('composites.trimLabourId', 'comp-trim-lab', 'trimLabourId', () => ({
      value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'waterjet operator' })),
    fromAdvice('composites.manning', 'comp-manning', 'manning', () => ({
      value: 1, source: 'rule', confidence: 0.6, basis: 'the layup hours are laminator-hours — one laminator per hour of them' })),
    fromAdvice('composites.oee', 'comp-oee', 'oee', () => ({
      value: COMP_OEE, source: 'rule', confidence: 0.6, basis: 'shop OEE, as every route' })),
    fromAdvice('composites.labourEfficiency', 'comp-lab-eff', 'labourEfficiency', () => ({
      value: 0.92, source: 'rule', confidence: 0.6, basis: 'shop labour efficiency, as every route' })),
    fromAdvice('composites.rejectRate', 'comp-reject', 'rejectRate', () => ({
      value: 0.04, source: 'rule', confidence: 0.55, basis: 'porosity, delamination, dimensional: 4%' })),
  ],
};

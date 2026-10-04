/**
 * Thermoforming cost inputs, derived from the measured drape.
 *
 * `thermoforming-advisor.ts` is the most physics-complete advisor in the tool —
 * heat time from specific heat and forming temperature, cooling from tool
 * conduction, sag from self-weight plate deflection, wall thinning from the
 * draw ratio, and a parametric tool with a life and an upkeep rate. None of it
 * was reachable from CAD. The prompt instead carried:
 *
 *     sheetWeightKg = partWeightKg / (1 - wasteFraction)
 *     wasteFraction = 0.25–0.45 depending on draw ratio
 *     heatTimeSec: 30–90s (depends on gauge and material)
 *     formTimeSec: 5–20s vacuum; 10–30s pressure
 *     trimTimeSec: 10–30s per part
 *
 * — five ranges for a model to pick a number out of, when four closed-form
 * functions were sitting unused.
 *
 * The one derivation worth explaining: **the measured wall is not the sheet
 * gauge.** Thermoforming stretches a flat sheet into a cavity, so the formed
 * wall is thinner than the stock it came from — by the areal draw, which
 * `estimateWallThinning` computes as `1 + 2 x (depth / opening)`. That is
 * independent of the sheet thickness, so it inverts in closed form: buy
 * `measured wall x areal draw` of sheet. A 1.5 mm wall on a 2:1 draw is a 7.5 mm
 * sheet, and getting that backwards under-buys the stock five-fold.
 */
import {
  thermoformFamilyOf, estimateHeatTimeSec, estimateCoolTimeSec, estimateSagRisk,
  estimateWallThinning, estimateThermoformToolCost, estimateThermoformSpecificEnergy,
  formingPressureBar,
  type ThermoformMethod, type FormComplexity, type MouldMaterial,
} from '../../modules/thermoforming-advisor.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { bboxSortedMm, planAreaCm2 } from '../derive/envelope.js';
export { planAreaCm2 } from '../derive/envelope.js';
import { shellWallMm } from '../derive/shell-wall.js';
import { enclosedShell } from '../derive/hollow.js';
import { tariffElectricityPerKwh } from '../../uk-tariff.js';

/** Forming complexity from what the kernel can see of the shape. */
export function formComplexity(ctx: RuleContext): FormComplexity {
  const freeForm = ctx.geo.features?.freeFormFaceCount ?? 0;
  const undercuts = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
  let score = 0;
  if (freeForm >= 10) score += 2; else if (freeForm >= 4) score += 1;
  if (undercuts >= 2) score += 1;
  return score >= 3 ? 'complex' : score >= 1 ? 'moderate' : 'simple';
}

/**
 * Draw geometry: depth, the smallest mouth dimension, and the areal draw that
 * links the sheet gauge to the formed wall.
 */
export function drawGeometry(ctx: RuleContext): { depthMm: number; openingMm: number; arealDraw: number; ratio: number } | null {
  const d = bboxSortedMm(ctx);
  if (!d) return null;
  const depthMm = d[2];              // the drape's depth is its smallest dimension
  const openingMm = d[1];            // the narrower of the two footprint dimensions
  return {
    depthMm, openingMm,
    arealDraw: 1 + 2 * (depthMm / Math.max(1, openingMm)),
    ratio: Math.round(depthMm / Math.max(1, openingMm) * 100) / 100,
  };
}

/**
 * Method.
 *
 * Vacuum manages a 1.5:1 draw; a plug assist reaches 3:1 and pressure 4:1. So a
 * deep part needs pressure forming whether or not anyone asked for the detail
 * it also brings. Twin-sheet is for hollow double-wall parts, which the topology
 * tells us outright.
 */
export function methodFor(ctx: RuleContext, ratio: number): { method: ThermoformMethod; reason: string } {
  if (ctx.geo.topology?.enclosesSealedVoid === true || enclosedShell(ctx.geo)) {
    return { method: 'twin_sheet', reason: 'encloses a sealed void — two webs welded at the perimeter' };
  }
  if (ratio > 1.5) {
    return {
      method: 'pressure',
      reason: `${ratio.toFixed(2)}:1 draw is beyond the 1.5:1 a vacuum tool holds — pressure forming`,
    };
  }
  return { method: 'vacuum', reason: `${ratio.toFixed(2)}:1 draw is within the 1.5:1 vacuum limit` };
}

/** Tool material follows the volume the tool has to survive. */
export function mouldMaterialFor(annualVolume: number, method: ThermoformMethod): MouldMaterial {
  if (method === 'pressure') return 'cnc-al';   // pressure box needs a machined tool
  if (annualVolume < 2_000) return 'epoxy';
  return annualVolume >= 200_000 ? 'cnc-al' : 'cast-al';
}

/** Sheet window of each former, mm, and whether its oven is a separate station. */
export const TF_MACHINES: Record<string, { windowMm: [number, number]; rotary: boolean; loadSec: number }> = {
  'thermoform-small': { windowMm: [800, 600], rotary: false, loadSec: 15 },
  'thermoform-large': { windowMm: [1500, 1200], rotary: true, loadSec: 20 },
  'thermoform-pressure': { windowMm: [1200, 1000], rotary: false, loadSec: 20 },
  'thermoform-twinsheet': { windowMm: [1500, 1200], rotary: false, loadSec: 30 },
};
/** Clamp frame + trim allowance on each side of the formed outline, mm. */
export const TF_CLAMP_MARGIN_MM = 50;
/** A rotary former indexes its table between stations. */
const TF_ROTATE_SEC = 5;
/** Multi-up tools pay back above this; below it one part a sheet. */
const TF_MULTI_UP_FROM = 10_000;

/** Parts on one sheet: the formed outlines with a web gap of max(25 mm, depth). */
export function nestOnSheet(L: number, W: number, depth: number, window: [number, number], annualVolume: number):
  { n: number; sheetMm: [number, number]; basis: string } {
  const m = TF_CLAMP_MARGIN_MM;
  const one: [number, number] = [L + 2 * m, W + 2 * m];
  if (annualVolume < TF_MULTI_UP_FROM) {
    return { n: 1, sheetMm: one, basis: `one up below ${TF_MULTI_UP_FROM.toLocaleString('en-GB')}/yr — a single-cavity tool` };
  }
  const gap = Math.max(25, depth);
  const fit = (a: number, b: number) =>
    Math.max(0, Math.floor((window[0] - 2 * m + gap) / (a + gap))) * Math.max(0, Math.floor((window[1] - 2 * m + gap) / (b + gap)));
  const n1 = fit(L, W), n2 = fit(W, L);
  const n = Math.max(1, Math.min(8, Math.max(n1, n2)));
  if (n === 1) return { n: 1, sheetMm: one, basis: 'one fits the machine window' };
  const [a, b] = n1 >= n2 ? [L, W] : [W, L];
  const nx = Math.max(1, Math.floor((window[0] - 2 * m + gap) / (a + gap)));
  const ny = Math.ceil(n / nx);
  const sheetMm: [number, number] = [nx * a + (nx - 1) * gap + 2 * m, ny * b + (ny - 1) * gap + 2 * m];
  return { n, sheetMm, basis: `${n} up on a ${sheetMm[0].toFixed(0)} × ${sheetMm[1].toFixed(0)} mm sheet, ${gap.toFixed(0)} mm web between cavities` };
}

interface TfAdvice {
  resin: ResinFacts;
  family: ReturnType<typeof thermoformFamilyOf>;
  wallMm: number;
  wallBasis: string;
  sheetMm: number;
  sheetBasis: string;
  draw: NonNullable<ReturnType<typeof drawGeometry>>;
  method: ThermoformMethod;
  methodReason: string;
  areaCm2: number;
  areaBasis: string;
  complexity: FormComplexity;
  mouldMaterial: MouldMaterial;
  partKg: number;
  sheetKg: number;
  perSheet: number;
  nestBasis: string;
  machineId: string;
  heatSec: number;
  formSec: number;
  coolSec: number;
  loadSec: number;
  cycleSec: number;
  cycleBasis: string;
  routerTrim: boolean;
  trimSec: number;
  trimBasis: string;
}

function envelopeAsk(): RuleOutcome<never> {
  return ask({
    id: 'thermoforming.envelope', kind: 'geometry_gap',
    question: 'What is the formed wall and the part footprint?',
    why: 'No wall, volume or bounding box was measured, so the sheet gauge cannot '
      + 'be worked back from the part — and the sheet is the material buy.',
    options: [{ value: 'enter', label: 'Enter wall thickness and footprint' }],
    entry: { kind: 'number' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

function advise(ctx: RuleContext): { advice: TfAdvice } | { blocked: RuleOutcome<never> } {
  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };

  const w = shellWallMm(ctx.geo);
  const draw = drawGeometry(ctx);
  const plan = planAreaCm2(ctx);
  const vCm3 = ctx.geo.volume?.cm3 ?? 0;
  if (!w || !draw || !plan || !vCm3) return { blocked: envelopeAsk() };
  const wallMm = Math.round(w.mm * 100) / 100;

  const m = methodFor(ctx, draw.ratio);
  const family = thermoformFamilyOf(resin.grade ?? resin.materialId ?? '');
  // The sheet gauge by mass balance: the plastic in the part came from the
  // sheet over its plan, so gauge = volume ÷ plan area. Measured, not the
  // bounding-box formula 1 + 2·depth/opening, which under-bought the deep lid
  // (7.5 mm against the 9.4 mm its plastic needs). Twin-sheet: two sheets.
  const sheets = m.method === 'twin_sheet' ? 2 : 1;
  const sheetMm = Math.round(vCm3 / sheets / plan.cm2 * 10 * 100) / 100;
  const sheetBasis = `${vCm3.toFixed(0)} cm³ of part ÷ ${plan.cm2.toFixed(0)} cm² plan`
    + (sheets === 2 ? ' ÷ 2 sheets' : '') + ` = ${sheetMm.toFixed(2)} mm sheet (mass balance); `
    + `the formed wall averages ${wallMm.toFixed(2)} mm (2·V/S), an areal stretch of ${(sheetMm / wallMm).toFixed(2)}`;

  const d = bboxSortedMm(ctx)!;
  const machineId = m.method === 'pressure' ? 'thermoform-pressure'
    : m.method === 'twin_sheet' ? 'thermoform-twinsheet'
    : (d[0] + 2 * TF_CLAMP_MARGIN_MM <= 800 && d[1] + 2 * TF_CLAMP_MARGIN_MM <= 600) ? 'thermoform-small' : 'thermoform-large';
  const mach = TF_MACHINES[machineId];
  const nest = nestOnSheet(d[0], d[1], draw.depthMm, mach.windowMm, ctx.annualVolume);
  const partKg = resin.massKg!;
  const sheetKg = Math.round(nest.sheetMm[0] * nest.sheetMm[1] / 100 * (sheetMm / 10) * sheets
    * (resin.densityKgPerM3! / 1e6) * 10_000) / 10_000;

  // Cycle. A single-station former heats, forms, cools and unloads in series;
  // a rotary has its oven at another station, so the slowest station paces it.
  const heatSec = estimateHeatTimeSec(family, sheetMm);
  const formSec = m.method === 'vacuum' ? 6 : m.method === 'pressure' ? 12 : 18;
  const coolSec = estimateCoolTimeSec(family, sheetMm, 'water');
  const loadSec = mach.loadSec;
  const cycleSec = mach.rotary
    ? Math.max(heatSec, formSec + coolSec, loadSec) + TF_ROTATE_SEC
    : heatSec + formSec + coolSec + loadSec;
  const cycleBasis = mach.rotary
    ? `rotary: oven ${heatSec} s / form + cool ${formSec + coolSec} s / load ${loadSec} s in parallel + ${TF_ROTATE_SEC} s index = ${cycleSec} s`
    : `single station: heat ${heatSec} + form ${formSec} + cool ${coolSec} + load ${loadSec} s in series = ${cycleSec} s`;

  // Trim. Heavy gauge (≥ 1.5 mm) is trimmed off the former on a 5-axis
  // router — the former does not stand idle while it routes. Thin gauge is
  // cut in the machine (steel rule), inside the cycle.
  const routerTrim = sheetMm >= 1.5;
  const perimM = 2 * (d[0] + d[1]) / 1000;
  const trimSec = routerTrim ? Math.round(20 + perimM * 12) : 0;
  const trimBasis = routerTrim
    ? `5-axis router: 20 s load + ${perimM.toFixed(2)} m of trim path at ~12 s/m, per part, off the former`
    : 'thin gauge — cut in the machine inside the forming cycle';

  return {
    advice: {
      resin, family, wallMm, wallBasis: w.basis, sheetMm, sheetBasis, draw,
      method: m.method, methodReason: m.reason,
      areaCm2: plan.cm2, areaBasis: plan.basis, complexity: formComplexity(ctx),
      mouldMaterial: mouldMaterialFor(ctx.annualVolume, m.method),
      partKg, sheetKg, perSheet: nest.n, nestBasis: nest.basis,
      machineId, heatSec, formSec, coolSec, loadSec, cycleSec, cycleBasis,
      routerTrim, trimSec, trimBasis,
    },
  };
}

type Src = 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer';
/** A rule that reads one value off the advice. */
function fromAdvice<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: TfAdvice, ctx: RuleContext) => { value: T; source: Src; basis: string; confidence: number },
) {
  return {
    id, path: id, ...(fieldId ? { fieldId } : {}), label,
    evaluate: (ctx: RuleContext) => {
      const r = advise(ctx);
      if ('blocked' in r) return r.blocked;
      const v = pick(r.advice, ctx);
      return decided(id, v.value, v.source, v.basis, v.confidence);
    },
  };
}

export const THERMOFORMING_RULES: CommodityRuleSpec = {
  commodity: 'thermoforming',
  header: 'THERMOFORMING COST INPUT RULES:',
  rules: [
    fromAdvice('thermoforming.materialId', 'tf-mat', 'materialId', a => ({
      value: a.resin.materialId!, source: 'engineer', basis: a.resin.basis, confidence: 1 })),
    fromAdvice('thermoforming.method', 'tf-method', 'method', a => ({
      value: a.method, source: 'rule', basis: a.methodReason, confidence: 0.75 })),
    // The measured wall, for the DFM panel — NOT the material buy.
    fromAdvice('thermoforming.formedWallMm', undefined, 'formedWallMm', a => ({
      value: a.wallMm, source: 'geometry', basis: a.wallBasis, confidence: 0.85 })),
    // The sheet gauge, by mass balance. This is the buy.
    fromAdvice('thermoforming.sheetThicknessMm', 'tf-thk', 'sheetThicknessMm', a => ({
      value: a.sheetMm, source: 'geometry', basis: a.sheetBasis, confidence: 0.75 })),
    fromAdvice('thermoforming.drawRatio', undefined, 'drawRatio', a => ({
      value: a.draw.ratio, source: 'geometry', confidence: 0.8,
      basis: `${a.draw.depthMm.toFixed(0)} mm depth ÷ ${a.draw.openingMm.toFixed(0)} mm smallest opening` })),
    fromAdvice('thermoforming.drawDepthMm', 'tf-depth', 'drawDepthMm', a => ({
      value: Math.round(a.draw.depthMm), source: 'geometry', basis: 'smallest bounding-box dimension', confidence: 0.8 })),
    fromAdvice('thermoforming.minOpeningMm', 'tf-open', 'minOpeningMm', a => ({
      value: Math.round(a.draw.openingMm), source: 'geometry', basis: 'narrower footprint dimension', confidence: 0.8 })),
    fromAdvice('thermoforming.partWeightKg', 'tf-part-wt', 'partWeightKg', a => ({
      value: a.partKg, source: 'geometry', basis: a.resin.basis, confidence: 0.9 })),
    fromAdvice('thermoforming.partsPerSheet', 'tf-pps', 'partsPerSheet', a => ({
      value: a.perSheet, source: 'rule', basis: a.nestBasis, confidence: 0.65 })),
    fromAdvice('thermoforming.sheetWeightKg', 'tf-sheet-wt', 'sheetWeightKg', a => {
      const web = 1 - a.partKg * a.perSheet / a.sheetKg;
      return { value: a.sheetKg, source: 'rule', confidence: 0.65,
        basis: `the sheet for ${a.perSheet} part${a.perSheet === 1 ? '' : 's'} at ${fmt(a.sheetMm, 2)} mm, `
          + `${TF_CLAMP_MARGIN_MM} mm clamp and trim margin each side = ${fmt(a.sheetKg, 3)} kg; `
          + `${(web * 100).toFixed(0)}% becomes web and trim (credited at its scrap value)` };
    }),
    fromAdvice('thermoforming.machineId', 'tf-mach', 'machineId', a => ({
      value: a.machineId, source: 'rule', confidence: 0.7,
      basis: a.machineId === 'thermoform-small' ? 'the sheet fits an 800 × 600 mm single-station former'
        : a.machineId === 'thermoform-large' ? 'beyond 800 × 600 mm — a rotary former'
        : `${a.method} forming` })),
    fromAdvice('thermoforming.heatTimeSec', 'tf-heat', 'heatTimeSec', a => ({
      value: a.heatSec, source: 'advisor', confidence: 0.75,
      basis: `${a.family} sheet at ${fmt(a.sheetMm, 2)} mm — radiant soak goes as gauge^1.6` })),
    fromAdvice('thermoforming.coolTimeSec', 'tf-cool', 'coolTimeSec', a => ({
      value: a.coolSec, source: 'advisor', confidence: 0.75,
      basis: `${a.family} on a water-cooled tool — contact cooling goes as gauge²` })),
    fromAdvice('thermoforming.toolCooling', 'tf-tool-cool', 'toolCooling', () => ({
      value: 'water', source: 'rule', confidence: 0.7, basis: 'water-cooled production tool, as the cool time assumes' })),
    // The stroke is the time to move the air: higher pressure forms faster
    // but takes longer to charge.
    fromAdvice('thermoforming.formTimeSec', 'tf-form', 'formTimeSec', a => ({
      value: a.formSec, source: 'rule', confidence: 0.55, basis: `${a.method} forming at ${formingPressureBar(a.method)} bar` })),
    fromAdvice('thermoforming.indexTimeSec', 'tf-index', 'indexTimeSec', a => ({
      value: a.loadSec, source: 'rule', confidence: 0.55, basis: `load the sheet and unload the forming — ${a.cycleBasis}` })),
    fromAdvice('thermoforming.rotaryIndex', 'tf-rotary', 'rotaryIndex', a => ({
      value: TF_MACHINES[a.machineId].rotary, source: 'rule', confidence: 0.6,
      basis: TF_MACHINES[a.machineId].rotary ? 'oven at its own station — the slowest station paces the machine' : 'single station — heat, form, cool and load in series' })),
    fromAdvice('thermoforming.trimTimeSec', 'tf-trim', 'trimTimeSec', a => ({
      value: a.trimSec, source: 'rule', confidence: 0.55, basis: a.trimBasis })),
    fromAdvice('thermoforming.trimMachineId', 'tf-trim-mach', 'trimMachineId', a => ({
      value: a.routerTrim ? 'thermoform-trim-router' : '', source: 'rule', confidence: 0.6, basis: a.trimBasis })),
    fromAdvice('thermoforming.trimType', 'tf-trim-type', 'trimType', a => ({
      value: a.routerTrim ? 'cnc-router' : 'steel-rule', source: 'rule', confidence: 0.6, basis: a.trimBasis })),
    fromAdvice('thermoforming.projectedAreaCm2', 'tf-area', 'projectedAreaCm2', a => ({
      value: a.areaCm2, source: 'geometry', confidence: 0.8, basis: a.areaBasis })),
    fromAdvice('thermoforming.complexity', 'tf-cx', 'complexity', a => ({
      value: a.complexity, source: 'rule', confidence: 0.6, basis: 'free-form faces and undercuts the kernel measured' })),
    fromAdvice('thermoforming.mouldMaterial', 'tf-mould-mat', 'mouldMaterial', (a, ctx) => ({
      value: a.mouldMaterial, source: 'rule', confidence: 0.7,
      basis: a.method === 'pressure'
        ? 'pressure forming needs a machined aluminium tool to take the box load'
        : `${ctx.annualVolume.toLocaleString('en-GB')}/yr: `
          + (a.mouldMaterial === 'epoxy' ? 'epoxy is enough below 2,000/yr'
            : a.mouldMaterial === 'cnc-al' ? 'machined aluminium at high volume'
            : 'cast aluminium — the production workhorse') })),
    fromAdvice('thermoforming.toolCost', 'tf-tool-cost', 'toolCostGBP', a => {
      const est = estimateThermoformToolCost({
        projectedAreaCm2: a.areaCm2, mouldMaterial: a.mouldMaterial,
        method: a.method, complexity: a.complexity, cavities: a.perSheet, trim: a.routerTrim ? 'cnc-router' : 'steel-rule',
      });
      return { value: est.total, source: 'advisor', confidence: 0.65,
        basis: `${a.perSheet}-up ${a.mouldMaterial} ${a.method} tool over ${a.areaCm2.toFixed(0)} cm², ${a.complexity} form: `
          + `£${est.mould} mould + £${est.vacuumHoles} vacuum holes; ${est.lifeCycles.toLocaleString('en-GB')} cycle life` };
    }),
    // Display: the module derives the specific energy itself from family and method.
    fromAdvice('thermoforming.energyKwhPerKg', undefined, 'energyKwhPerKg', a => ({
      value: estimateThermoformSpecificEnergy(a.family, a.method), source: 'advisor', confidence: 0.7,
      basis: `cp·ΔT to forming temperature for ${a.family}, plus ${a.method} air work` })),
    // The electricity price — the field the energy figure above used to be
    // written into (kWh/kg read as £/kWh).
    fromAdvice('thermoforming.energyPricePerKwh', 'tf-kwh', 'energyPricePerKwh', () => ({
      value: Math.round(tariffElectricityPerKwh() * 10_000) / 10_000, source: 'library', confidence: 0.8, basis: 'UK industrial electricity tariff' })),
    fromAdvice('thermoforming.labourId', 'tf-lab', 'labourId', () => ({
      value: 'lab-uk-thermoform', source: 'library', confidence: 0.8, basis: 'thermoforming operator' })),
    fromAdvice('thermoforming.manning', 'tf-manning', 'manning', () => ({
      value: 1, source: 'rule', confidence: 0.6, basis: 'one operator loads the former and stacks the parts' })),
    fromAdvice('thermoforming.oee', 'tf-oee', 'oee', () => ({
      value: 0.80, source: 'rule', confidence: 0.6, basis: 'shop OEE, as every moulding route' })),
    fromAdvice('thermoforming.labourEfficiency', 'tf-lab-eff', 'labourEfficiency', () => ({
      value: 0.92, source: 'rule', confidence: 0.6, basis: 'shop labour efficiency, as every route' })),
    fromAdvice('thermoforming.rejectRatePct', 'tf-reject', 'rejectRatePct', () => ({
      value: 3, source: 'rule', confidence: 0.55, basis: 'webbing, thin corners, sag marks: 3%' })),
    // Advisory, not a cost input: it tells the engineer whether the part can
    // be formed at all before anyone argues about the price.
    fromAdvice('thermoforming.formability', undefined, 'formability', (a, ctx) => {
      const thin = estimateWallThinning({
        sheetThicknessMm: a.sheetMm, depthMm: a.draw.depthMm,
        minOpeningMm: a.draw.openingMm, method: a.method, plugAssist: a.draw.ratio > 1.5,
      });
      const sag = estimateSagRisk(a.family, a.sheetMm, bboxSortedMm(ctx)![0]);
      return { value: thin.withinLimit ? 'within limit' : 'exceeds draw limit', source: 'advisor', confidence: 0.7,
        basis: `${thin.drawRatio}:1 draw against a ${thin.drawLimit}:1 limit; corners thin to `
          + `${fmt(thin.minWallMm, 2)} mm; sag risk ${sag.risk}` };
    }),
  ],
};

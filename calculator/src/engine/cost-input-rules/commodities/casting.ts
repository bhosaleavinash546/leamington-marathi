/**
 * Casting cost inputs, derived rather than guessed.
 *
 * Two things change here relative to the prompt these rules came from:
 *
 * 1. `adviseCastingProcess` gets its first production caller. It has been in the
 *    tree, unit-tested, with zero callers — a complete HPDC / gravity / sand /
 *    investment / megacasting selector that nothing ever asked. The prompt
 *    carried a one-line paraphrase of it instead.
 *
 * 2. The yield fraction comes from `CASTING_PROCESS_REFERENCE.yieldBand`, not
 *    from the prompt's constants. Those disagreed: the prompt said 0.90 for
 *    investment against a documented band midpoint of 0.45, and was ~20% out on
 *    sand and gravity. Yield divides into pour weight, so a too-high yield
 *    under-charges metal — investment castings were being costed at roughly half
 *    their true material. Only HPDC happened to agree.
 */
import { finishRules } from '../derive/finish.js';
import { IMPREGNATION_DECISION_ID, impregnationDecision } from '../derive/service-questions.js';
import { heatTreatServiceFactor, ndtServiceFactor, processServiceFactor, inCountry as countryGbp, countryNote, type CountryBasis } from '../../regional-services.js';

/** A sand core: ~30% sand and binder (traded, held), the rest core-shop labour and machine time. ESTIMATE split. */
const CORE_BASIS: CountryBasis = { globalShare: 0.3, rest: 'process' };
/** Investment wax pattern and ceramic shell: ~35% wax and slurry materials (traded), the rest dipping / injection labour. ESTIMATE split. */
const INVEST_BASIS: CountryBasis = { globalShare: 0.35, rest: 'process' };
import { activeLabourRate, activeRates } from '../../rate-context.js';
import {
  adviseCastingProcess, CASTING_PROCESS_REFERENCE, SAND_GRAVITY_YIELD_BY_ALLOY, SAND_YIELD_BASIS,
  FETTLING_MINUTES, FETTLING_MINUTES_BASIS, FETTLING_CELL, HEAT_TREAT_COST_PER_KG, NDT_COST_PER_PART,
  SAND_LINE_CLASSES, AUTO_LINE_MIN_MOULDS_PER_YEAR, SAND_LINE_MAX_LOADING, SAND_PATTERN_LIFE_MOULDS,
  type AlloyFamily, type CastingProcess, type ComplexityLevel, type SandLineClass, ndtStationCostPerPart,
} from '../../modules/casting-advisor.js';
import { pickHPDCMachineId } from '../../machine-sizing.js';
import { libraryMachineRate } from '../../uk-tariff.js';
import type { ToolComplexity } from '../../toolmaking.js';
import type { CastingSubtype } from '../../modules/casting.js';
import { answeredNumber, decided, ask, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import {
  estimateHPDCDieCost, estimateGravityMouldCost, estimateSandPatternCost, estimateInvestmentToolCost,
} from '../../casting-tooling.js';
import { projectedAreaCm2 } from '../derive/envelope.js';
import { toCastingAlloyFamily, representativeMaterialId, materialGradeName } from '../derive/material.js';
import { gradedMaterialFacts as materialFacts, castingAlloyForGrade, gradeDecision, GRADE_DECISION_ID, BRITTLE_IRON, castIronDefaultGrade, namedGradeNote } from '../derive/grade.js';
import {
  pressureTightDecision, toleranceClassDecision, safetyCriticalDecision,
  answeredBool, answeredToleranceClass, assumedNote,
  PRESSURE_TIGHT_DECISION_ID, SAFETY_CRITICAL_DECISION_ID, TOLERANCE_CLASS_DECISION_ID,
} from '../derive/service-context.js';

/** Midpoint of a reference band — the honest single number to cost at. Kept to 3 dp: the basis prints "midpoint",
 *  and 0.45–0.60 rounded to 2 dp costed 0.53, not 0.525 (arithmetic audit, Oct 2026). */
export function bandMid(band: readonly [number, number]): number {
  return Math.round(((band[0] + band[1]) / 2) * 1000) / 1000;
}

/**
 * Geometric complexity, from what the kernel actually measured.
 *
 * Undercuts need slides, free-form faces need 5-axis or hand finishing, and many
 * distinct setup directions mean an awkward part. Deliberately coarse — the
 * advisor only consumes low/medium/high, so pretending to more precision would
 * be false confidence.
 */
export function complexityBand(ctx: RuleContext): ComplexityLevel {
  const g = ctx.geo;
  const undercuts = g.draftAnalysis?.undercutFaceCount ?? 0;
  const setups = g.setupAnalysis?.estimatedSetupCount ?? 0;
  const total = g.faces?.total ?? 0;
  const freeForm = total > 0 ? (g.features?.freeFormFaceCount ?? 0) / total : 0;

  let score = 0;
  if (undercuts >= 6) score += 2; else if (undercuts >= 2) score += 1;
  if (freeForm >= 0.25) score += 2; else if (freeForm >= 0.10) score += 1;
  if (setups >= 4) score += 1;

  return score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
}

/** The advisor's process, mapped onto the subtype the cost engine models. */
/** The engineer's (or the route comparison's) choice of casting process — an answer, never asked by the rules. */
export const CASTING_PROCESS_CHOICE_ID = 'casting.processChoice';

function toSubtype(p: CastingProcess): CastingSubtype {
  return p === 'megacasting' ? 'hpdc' : p;
}

interface Advice {
  process: CastingProcess;
  subtype: CastingSubtype;
  reason: string;
  route: string[];
  alloy: AlloyFamily;
  pressureTight: boolean;
  safetyCritical: boolean;
  massKg: number;
}

/** A die casting or an aluminium casting that must hold pressure is impregnated as a rule; any other alloy is asked. */
function lightAlloyImpregnation(a: Pick<Advice, 'subtype' | 'alloy'>): boolean {
  return a.subtype === 'hpdc' || a.alloy === 'aluminium';
}

/**
 * Run the advisor, or return the question that is blocking it.
 *
 * All four inputs it cannot get from geometry are asked once; every casting rule
 * then rests on the same answers, so the engineer is questioned once per part
 * rather than once per field.
 */
function advise(ctx: RuleContext): { advice: Advice } | { blocked: RuleOutcome<never> } {
  const mat = materialFacts(ctx);
  if (mat.decision) return { blocked: ask(mat.decision) };

  // An answered or declared GRADE names the alloy exactly (grey v ductile iron,
  // stainless, superalloy); the family alone falls back to its default alloy.
  // Cast iron with no grade answered: the default grade costed (grey, or ductile when safety-critical)
  // also names the alloy, so the process plan and the £/kg are the same iron.
  const alloy = castingAlloyForGrade(mat.gradeId ?? (mat.family === 'cast iron' ? castIronDefaultGrade(ctx).id : null))
    ?? toCastingAlloyFamily(mat.family!);
  if (!alloy) {
    return {
      blocked: ask({
        ...toleranceClassDecision(),
        id: 'casting.alloyUnsupported',
        kind: 'material_family',
        question: `${mat.family} cannot be cast — is the process right?`,
        why: `The chosen material family (${mat.family}) has no casting route.`,
        options: [{ value: 'recheck', label: 'Re-pick the material or the process' }],
      }),
    };
  }

  const pressureTight = answeredBool(ctx, PRESSURE_TIGHT_DECISION_ID);
  if (pressureTight === null) return { blocked: ask(pressureTightDecision(ctx)) };

  const toleranceClass = answeredToleranceClass(ctx);
  if (toleranceClass === null) return { blocked: ask(toleranceClassDecision()) };

  const safetyCritical = answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID);
  if (safetyCritical === null) return { blocked: ask(safetyCriticalDecision(ctx)) };

  // A process the engineer (or the route comparison) chose is costed as chosen when the alloy allows it — the
  // advisor's ladder otherwise (compare-routes review, Oct 2026).
  const chosen = ctx.answers[CASTING_PROCESS_CHOICE_ID];
  const processOverride = chosen === 'sand' || chosen === 'gravity' || chosen === 'hpdc' || chosen === 'investment' ? chosen : undefined;
  const rec = adviseCastingProcess({
    ...(processOverride ? { processOverride } : {}),
    annualVolume: ctx.annualVolume,
    partWeightKg: mat.massKg!,
    // The shell-wall trap: on a very sparse part the ray-cast minimum is
    // unreliable, so fall back to the surface-area estimate 2V/S.
    minWallThicknessMm: minWallMm(ctx),
    ...(castingSectionMm(ctx) != null ? { sectionMm: castingSectionMm(ctx)! } : {}),
    complexity: complexityBand(ctx),
    alloyFamily: alloy,
    pressureTight,
    toleranceClass,
    safetyCritical,
  });

  // Anything assumed rather than answered says so, once, on the reason every
  // other casting rule quotes.
  const assumed = [
    assumedNote(ctx, PRESSURE_TIGHT_DECISION_ID) && 'pressure-tight',
    assumedNote(ctx, TOLERANCE_CLASS_DECISION_ID) && 'tolerance class',
    assumedNote(ctx, SAFETY_CRITICAL_DECISION_ID) && 'safety-critical',
  ].filter(Boolean);

  return {
    advice: {
      process: rec.process,
      subtype: toSubtype(rec.process),
      reason: rec.reason
        + (assumed.length ? ` [${assumed.join(', ')} assumed — confirm before quoting]` : ''),
      route: rec.processRoute,
      alloy,
      pressureTight,
      safetyCritical,
      massKg: mat.massKg!,
    },
  };
}

/** The advisor's process for this part, or null while a question blocks it. */
export function castingSubtypeFor(ctx: RuleContext): CastingSubtype | null {
  const r = advise(ctx);
  return 'blocked' in r ? null : r.advice.subtype;
}

/**
 * Investment castings are poured as a tree of parts, not one at a time. TREE_POUR_KG
 * of metal a tree (engineering-typical 10–30 kg for steel shell work) at the
 * investment yield gives the parts a tree carries; the pour / knockout band is
 * per TREE. Charging it per part put ~£21 of furnace time on a small part.
 */
export const INVESTMENT_TREE = { POUR_KG: 20, HR_PER_TREE: 0.40, MAX_PARTS: 60 };

/**
 * Shot blast by mass: a tumble / hanger blast runs ~0.5–2 t/h; BLAST_KG_PER_HR
 * is the low end. £ = kg ÷ throughput × (the library blast machine + one foundry
 * operator). The flat £0.35 charged a 50 kg casting what it charged a 0.5 kg one.
 */
export const BLAST_KG_PER_HR = 600;
/** Shot-blast minimum charge per casting, UK £ (CostVision engineering heuristic) — × the process-service factor abroad. */
export const BLAST_MIN_CHARGE_UK = 0.10;

/**
 * The section that governs filling and freezing: the casting modulus 2·V/S, mm.
 *
 * Chvorinov: freezing time goes as (V/A)². It is also immune to the ray-cast
 * artefacts that broke the old inputs — the MINIMUM wall reads a fillet edge
 * (0.45 mm on PRCR002) and the MEAN wall reads across cavities on a sparse part
 * (34 mm on the same housing, whose sections are ~15 mm).
 */
export function castingSectionMm(ctx: RuleContext): number | null {
  const v = ctx.geo.volume?.mm3 ?? 0;
  const s = ctx.geo.surfaceArea?.mm2 ?? 0;
  return v > 0 && s > 0 ? Math.round((2 * v / s) * 10) / 10 : null;
}

/**
 * The part's footprint in the mould, mm — the two box sides across the draw
 * direction when the pull is along an axis, else the two largest sides.
 */
export function mouldFootprintMm(ctx: RuleContext): [number, number] | null {
  const b = ctx.geo.boundingBox;
  if (!b) return null;
  const dims = [b.xMm, b.yMm, b.zMm];
  const d = ctx.geo.draftAnalysis?.drawDirectionXYZ;
  const axis = d ? d.findIndex(c => Math.abs(c) > 0.99) : -1;
  const across = axis >= 0 ? dims.filter((_, i) => i !== axis) : [...dims].sort((a, c) => c - a).slice(0, 2);
  return [Math.max(...across), Math.min(...across)];
}

/**
 * Each impression takes the part plus IMPRESSION_MARGIN_MM all round for gating and sand (engineering-typical, not
 * sourced). The line's mould face comes from the line class chosen (`sandLinePlan`).
 */
export const IMPRESSION_MARGIN_MM = 50;

/** Impressions of a footprint on a mould face (either orientation). The default face is the semi-automatic line's. */
export function sandImpressions(footprint: [number, number], face: readonly [number, number] = SAND_LINE_CLASSES['semi-auto'].faceMm): number {
  const [L, W] = footprint.map(x => x + IMPRESSION_MARGIN_MM);
  const [FL, FW] = face;
  const fit = (a: number, b: number) => Math.floor(FL / a) * Math.floor(FW / b);
  return Math.max(fit(L, W), fit(W, L));
}

/** A line time, hours: 6 dp below 0.01 h (what the screen writes into the field), 4 dp above. */
const lineHrRounded = (h: number) => h < 0.01 ? Math.round(h * 1e6) / 1e6 : Math.round(h * 10_000) / 10_000;

/** A sand casting has a core when the core rule charges one: an undercut along the pull, a sealed cavity, or no draft read. */
function sandCored(ctx: RuleContext): boolean {
  const under = ctx.geo.draftAnalysis?.undercutFaceCount ?? null;
  const sealed = ctx.geo.topology?.available && ctx.geo.topology.enclosesSealedVoid === true;
  return sealed || under === null || under >= 1;
}

export interface SandLinePlan {
  line: SandLineClass;
  /** Impressions a mould on the chosen line (0 = floor-moulded: does not fit the face). */
  impressions: number;
  cored: boolean;
  mouldsPerHr: number;
  /** Castings a year ÷ impressions on the chosen line (rejects not included). */
  mouldsPerYear: number;
  /** The part's moulds a year on the SEMI-AUTOMATIC line — what the line choice reads. */
  semiMouldsPerYear: number;
  /** Rated hours the part takes ÷ the line's available hours × utilisation (its rate-book entry), or null. */
  loading: number | null;
  availableHr: number | null;
  /** One sentence: which line and why, the threshold, the loading. */
  why: string;
}

/**
 * The moulding line (foundry at volume, P1 — 3 Nov 2026): the semi-automatic flask line (`sand-cast-line`) until the
 * part's moulds on it reach AUTO_LINE_MIN_MOULDS_PER_YEAR (CostVision engineering judgement — no source gives a
 * threshold), then the automatic vertical line, when an impression fits its mould face. The rate is the class's rated
 * cored / uncored output; the loading (rated hours ÷ the line's book hours × utilisation) is printed, and a part that
 * would load one line beyond SAND_LINE_MAX_LOADING (the case studies' realised 83–97 %) is said to need more than one.
 * Null with no footprint measured.
 */
export function sandLinePlan(ctx: RuleContext): SandLinePlan | null {
  const fp = mouldFootprintMm(ctx);
  if (!fp) return null;
  const semi = SAND_LINE_CLASSES['semi-auto'];
  const auto = SAND_LINE_CLASSES['auto-vertical'];
  const castings = Math.max(0, ctx.annualVolume || 0);
  const impsSemi = sandImpressions(fp, semi.faceMm);
  const impsAuto = sandImpressions(fp, auto.faceMm);
  const semiMoulds = castings / Math.max(1, impsSemi);
  const onAuto = impsAuto >= 1 && semiMoulds >= AUTO_LINE_MIN_MOULDS_PER_YEAR;
  const line = onAuto ? auto : semi;
  const impressions = onAuto ? impsAuto : impsSemi;
  const cored = sandCored(ctx);
  const mouldsPerHr = cored ? line.mouldsPerHr.cored : line.mouldsPerHr.uncored;
  const mouldsPerYear = castings / Math.max(1, impressions);
  const m = (ctx.rates ?? activeRates()).machines.find(x => x.id === line.machineId);
  const availableHr = m?.buildup ? m.buildup.annualAvailableHours * m.buildup.machineUtilization : null;
  const ratedHr = impressions >= 1 ? mouldsPerYear / mouldsPerHr : null;
  const loading = availableHr && ratedHr != null ? ratedHr / availableHr : null;
  const n = (x: number) => Math.round(x).toLocaleString('en-GB');
  const choice = castings <= 0
    ? `no annual volume given — the ${semi.label}`
    : onAuto
      ? `${n(castings)} castings a year = ${n(semiMoulds)} moulds a year on the ${semi.label} (${impsSemi || 1} a mould) ≥ ${n(AUTO_LINE_MIN_MOULDS_PER_YEAR)} → the ${auto.label}`
      : `${n(castings)} castings a year = ${n(semiMoulds)} moulds a year on the ${semi.label} (${impsSemi || 1} a mould)`
        + (impsAuto < 1 ? ` — too big for the automatic line's ${auto.faceMm[0]} × ${auto.faceMm[1]} mm mould` : ` < ${n(AUTO_LINE_MIN_MOULDS_PER_YEAR)}`);
  const load = loading == null ? '' : `; loading ${n(mouldsPerYear)} moulds ÷ ${mouldsPerHr} moulds/h = ${n(ratedHr!)} h of the line's ${n(availableHr!)} h a year `
    + `(book hours × utilisation) = ${(loading * 100).toFixed(1)} %`
    + (loading > SAND_LINE_MAX_LOADING ? ` — beyond one line's planned ${Math.round(SAND_LINE_MAX_LOADING * 100)} % (realised 83–97 % in the case studies): about ${Math.ceil(loading / SAND_LINE_MAX_LOADING)} lines` : '');
  const why = `${choice} (the line threshold is CostVision engineering judgement, not sourced — no published source gives one; `
    + `${n(AUTO_LINE_MIN_MOULDS_PER_YEAR)} follows AFS: metal pattern equipment over ~5,000 castings a year)${load}`;
  return { line, impressions, cored, mouldsPerHr, mouldsPerYear, semiMouldsPerYear: semiMoulds, loading, availableHr, why };
}

/**
 * Whether the casting is fettled on the robotic cell (P4), and why — or null for bench minutes. A ferrous casting
 * ≤ FETTLING_CELL.maxKg off the AUTOMATIC line; a steel casting over 10 kg keeps the bench (its risers are cut by disc
 * or torch, which the sourced iron time study does not cover). Line class from `sandLinePlan`; no source sets a volume
 * of its own for the cell, so it follows the line.
 */
function fettlingOnCell(ctx: RuleContext, a: Pick<Advice, 'subtype' | 'alloy' | 'massKg'>): string | null {
  if (a.subtype !== 'sand') return null;
  const plan = sandLinePlan(ctx);
  if (!plan || plan.line.id !== 'auto-vertical') return null;
  const iron = a.alloy === 'grey-iron' || a.alloy === 'ductile-iron';
  const steel = a.alloy === 'carbon-steel' || a.alloy === 'stainless-steel';
  if (!(iron || steel) || a.massKg > FETTLING_CELL.maxKg || (steel && a.massKg > 10)) return null;
  return `a ${a.massKg.toFixed(1)} kg ${a.alloy.replace('-', ' ')} casting off the ${plan.line.label} is fettled on a robotic grinding cell`;
}

/** Minimum wall, guarding the known ray-cast artefact on sparse shells. */
/**
 * Shot blast of the CASTING, by the mass blasted. The casting route blasts the part as cast; cast + machine blasts the
 * as-cast casting (finished + machining stock) before it is machined, so it passes that mass (arithmetic audit, Oct
 * 2026: it blasted the finished mass, 7.36 kg of a 9.08 kg stub-axle casting).
 */
export function shotBlastOutcome(subtype: CastingSubtype, massKg: number, massLabel: string): RuleOutcome<number> {
  const rate = libraryMachineRate('blast-machine');
  const lab = activeLabourRate('lab-uk-foundry');   // the costed country's (rate-context.ts)
  // The minimum charge is a UK £ figure: it follows the country like any bought-in process service (casting 360
  // review X40 — the UK £0.10 bound in India, where the blast itself costs less).
  const floor = Math.round(BLAST_MIN_CHARGE_UK * processServiceFactor() * 10_000) / 10_000;
  // £ to 4 dp, not the UK penny: a penny-rounded value broke its own printed arithmetic once converted (CN ¥2.34 shown,
  // ¥2.31 costed — 7-country review, 3 Nov 2026). The result is printed so the line can be re-done.
  const blast = massKg / BLAST_KG_PER_HR * (rate + lab);
  const v = Math.max(floor, Math.round(blast * 10_000) / 10_000);
  return decided('casting.shotBlastCostPerPart', v, 'library',
    `${subtype} castings are blasted to remove sand / scale / flash — ${massKg.toFixed(2)} ${massLabel} ÷ `
    + `${BLAST_KG_PER_HR} kg/h (the low end of a 0.5–2 t/h tumble / hanger blast; engineering-typical, not sourced) × `
    + `(blast machine £${rate.toFixed(2)}/h + operator £${lab.toFixed(2)}/h), `
    + `min £${floor === BLAST_MIN_CHARGE_UK ? floor.toFixed(2) : `${floor.toFixed(3)} (UK £${BLAST_MIN_CHARGE_UK.toFixed(2)}${countryNote('process')})`}`
    + ` = £${v.toFixed(4)}${v === floor && blast < floor ? ' (the minimum)' : ''} (CostVision engineering heuristic)`, 0.5);
}

export function minWallMm(ctx: RuleContext): number {
  const g = ctx.geo;
  const measured = g.wallThickness?.minMm;
  const v = g.volume?.mm3 ?? 0;
  const s = g.surfaceArea?.mm2 ?? 0;
  const shell = s > 0 ? (2 * v) / s : 0;
  if (!measured || measured <= 0) return shell > 0 ? Math.round(shell * 100) / 100 : 3;
  // A "minimum wall" thicker than the shell estimate on a sparse part is the
  // documented artefact (the 27 mm bumper). Trust the shell figure there.
  if ((g.fillRatio ?? 1) < 0.08 && shell > 0 && measured > shell * 3) {
    return Math.round(shell * 100) / 100;
  }
  return Math.round(measured * 100) / 100;
}

export const CASTING_RULES: CommodityRuleSpec = {
  commodity: 'casting',
  header: 'CASTING COST INPUT RULES:',
  rules: [
    {
      // The material GRADE, derived from the confirmed family. Casting used to
      // emit only the weight from the family and leave the grade as the AI's —
      // so a cast-iron confirmation produced cast-iron MASS priced at the AI's
      // aluminium GRADE (found in the final verification run: mat-lm25 @ 2.288
      // kg). The grade must track the family the engineer confirmed.
      id: 'casting.materialId',
      path: 'casting.materialId',
      fieldId: 'cast-mat',
      label: 'materialId',
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        // The engineer's grade, or one the file declares, is the grade (review, Oct 2026).
        if (mat.gradeId) {
          // Honoured as chosen — but grey / malleable / white iron on a part answered safety-critical is said.
          const brittle = BRITTLE_IRON.test(mat.gradeId) && answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID) === true;
          return decided('casting.materialId', mat.gradeId, 'engineer', `${materialGradeName(mat.gradeId, ctx.rates)}: ${mat.basis}`
            + (brittle ? ' — CHECK: a brittle iron on a part answered safety-critical; ductile EN-GJS-500-7 is the norm for steering / suspension parts' : ''),
            brittle ? 0.6 : 1);
        }
        // Cast iron: grey unless the part is safety-critical, then ductile (stub axle live run, Oct 2026).
        if (mat.family === 'cast iron') {
          const g = castIronDefaultGrade(ctx);
          return decided('casting.materialId', g.id, 'geometry', `cast iron → ${materialGradeName(g.id, ctx.rates)} (${g.why})`
            + namedGradeNote(ctx, 'cast iron', g.id), 0.85);
        }
        // The aluminium grade follows the process: ADC12 is a die-casting alloy
        // and is not solution-treatable, so a gravity or sand casting — which is
        // T6 treated — gets the A356 / LM25 family. One grade for every route
        // priced a T6 gravity housing in an alloy that cannot take T6.
        const r = advise(ctx);
        if (mat.family === 'aluminium' && !('blocked' in r) && r.advice.subtype !== 'hpdc') {
          return decided('casting.materialId', 'mat-lm25', 'geometry',
            `aluminium ${r.advice.subtype} casting → ${materialGradeName('mat-lm25', ctx.rates)} (A356 / LM25, the heat-treatable gravity / sand alloy — not a drawing callout)`
            + namedGradeNote(ctx, 'aluminium', 'mat-lm25'), 0.8);
        }
        const id = representativeMaterialId('casting', mat.family!);
        return decided('casting.materialId', id ?? mat.family!, 'geometry',
          `${mat.family} → ${id ? materialGradeName(id, ctx.rates) : mat.family} (representative casting grade — not a drawing callout)`
          + namedGradeNote(ctx, mat.family!, id ?? null), 0.85);
      },
    },
    {
      // The grade question (casting & forging materials review): advisory — the
      // representative grade is costed until it is answered.
      id: 'casting.q.grade', path: 'casting.q.grade', label: 'grade',
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        if (ctx.answers[GRADE_DECISION_ID] !== undefined) return decided('casting.q.grade', String(ctx.answers[GRADE_DECISION_ID]), 'engineer', 'answered', 1);
        const r = advise(ctx);
        const subtype = 'blocked' in r ? null : r.advice.subtype;
        // Cast iron: whether the part is safety-critical decides grey v ductile, so that is asked first.
        if (mat.family === 'cast iron' && !mat.gradeId && answeredBool(ctx, SAFETY_CRITICAL_DECISION_ID) === null) {
          return ask(safetyCriticalDecision(ctx));
        }
        const def = mat.gradeId
          ?? (mat.family === 'cast iron' ? castIronDefaultGrade(ctx).id
            : mat.family === 'aluminium' && subtype && subtype !== 'hpdc' ? 'mat-lm25' : representativeMaterialId('casting', mat.family!) ?? '');
        const d = gradeDecision(ctx, mat.family!, def, subtype);
        return d ? ask(d) : decided('casting.q.grade', def, 'rule', 'one grade for this route', 1);
      },
    },
    {
      id: 'casting.subtype',
      path: 'casting.subtype',
      fieldId: 'cast-subtype',
      label: 'subtype',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('casting.subtype', r.advice.subtype, 'advisor',
          `${r.advice.process}: ${r.advice.reason}`, 0.85,
          [PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID]);
      },
    },
    {
      id: 'casting.yieldFraction',
      path: 'casting.yieldFraction',
      fieldId: 'cast-yield',
      label: 'yieldFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const ref = CASTING_PROCESS_REFERENCE[r.advice.process];
        const byAlloy = (r.advice.process === 'sand' || r.advice.process === 'gravity')
          ? SAND_GRAVITY_YIELD_BY_ALLOY[r.advice.alloy] : undefined;
        const band = byAlloy ?? ref.yieldBand;
        const y = bandMid(band);
        return decided('casting.yieldFraction', y, 'library',
          byAlloy
            ? `${r.advice.process} ${r.advice.alloy} yield band ${band[0]}–${band[1]}, midpoint (feeding scales with the alloy's shrinkage; `
              + (SAND_YIELD_BASIS[r.advice.alloy] ?? 'engineering-typical band, not sourced — the foundry\'s method yield replaces it') + ')'
            : `${r.advice.process} yield band ${band[0]}–${band[1]}, midpoint (engineering-typical band, not sourced)`, 0.8);
      },
    },
    {
      // Sand cores: what the pattern cannot draw. The screen used to keep its
      // £1.50 form default on every sand casting while the headless path
      // assumed £0 — a £1.50 gap on the Casting Bracket and no rule behind
      // either. Undercuts along the best pull are what a core forms; the bands
      // are the form's own (simple cavity core £0.50–2, complex £2–8), stated
      // as defaults, not measured core costs.
      id: 'casting.coreCostPerPart',
      path: 'casting.coreCostPerPart',
      fieldId: 'cast-sand-core',
      label: 'coreCostPerPart',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.process === 'sand';
      },
      evaluate: (ctx) => {
        const d = ctx.geo.draftAnalysis;
        const under = d?.undercutFaceCount ?? null;
        const sealed = ctx.geo.topology?.available && ctx.geo.topology.enclosesSealedVoid === true;
        if (under === null && !sealed) {
          return decided('casting.coreCostPerPart', countryGbp(1.5, CORE_BASIS), 'rule',
            `no draft analysis measured — the mid simple-core figure (£0.50–2, UK)${countryNote(CORE_BASIS)} stands until someone checks the pattern`, 0.4);
        }
        const n = under ?? 0;
        const [cost, band] = sealed ? [6, 'an enclosed cavity — a complex core (£2–8)']
          : n >= 20 ? [3, `${n} undercut faces — a complex multi-core (£2–8)`]
          : n >= 6 ? [1.5, `${n} undercut faces — a simple cavity core (£0.50–2)`]
          : n >= 1 ? [0.75, `${n} undercut face(s) — a small core or loose piece (£0.50–2)`]
          : [0, 'no undercut along the best pull — the pattern draws cleanly, no core'];
        return decided('casting.coreCostPerPart', countryGbp(cost, CORE_BASIS), 'geometry',
          `${band}; per-part core (sand, binder, labour), material consumable — a default band (UK, engineering-typical, not sourced)${countryNote(CORE_BASIS)}, not a core-shop quote`, 0.55);
      },
    },
    {
      id: 'casting.netWeightKg',
      path: 'casting.netWeightKg',
      fieldId: 'cast-part-wt',
      label: 'netWeightKg',
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        return decided('casting.netWeightKg', mat.massKg!, 'geometry', mat.basis, 1);
      },
    },
    {
      id: 'casting.cycleTimeHpdcSec',
      path: 'casting.cycleTimeHpdcSec',
      fieldId: 'cast-hpdc-ct',
      label: 'cycleTimeHpdcSec',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype === 'hpdc';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        // The casting modulus, not the ray-cast mean wall: on a sparse part the
        // mean measures across cavities (34 mm on PRCR002 → 147 s a shot).
        const wall = castingSectionMm(ctx);
        if (wall == null) {
          return decided('casting.cycleTimeHpdcSec', 75, 'rule',
            'no measured volume / surface — HPDC band default', 0.3);
        }
        return decided('casting.cycleTimeHpdcSec', Math.round(45 + 3 * wall), 'rule',
          `45 s dry cycle + 3 s/mm × ${wall.toFixed(1)} mm casting section (2·V/S, the modulus freezing time scales with; CostVision engineering heuristic, not sourced)`, 0.7);
      },
    },
    {
      id: 'casting.dieMouldCostGBP',
      path: 'casting.dieMouldCostGBP',
      fieldId: 'cast-hpdc-die-cost',
      label: 'dieMouldCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const tc = ctx.geo.toolingCostEstimates;
        const pick: Record<CastingSubtype, number | undefined> = {
          hpdc: tc?.hpdcDieCostGBP,
          gravity: tc?.gravityMouldCostGBP,
          sand: tc?.sandPatternCostGBP,
          // No OCCT parametric for investment tooling — a known gap. Ask rather
          // than fall back to the prompt's flat £12,000, which was a guess
          // wearing the costume of a constant.
          investment: undefined,
        };
        const quoted = answeredNumber(ctx.answers, 'casting.toolingCost');
        if (quoted != null) {
          return decided('casting.dieMouldCostGBP', Math.round(quoted), 'engineer',
            `${r.advice.subtype} tooling quotation supplied by the engineer`, 0.95);
        }
        // The toolmaker build-up (casting-tooling.ts) is now the primary source:
        // hours × toolroom rate + steel by the kilogram + bought-outs, from the
        // parting footprint, with slides / cores from the measured undercuts.
        // The kernel's parametric figure was B-rep FACE COUNT × £150 plus
        // £10,000 per undercut FACE — fillets multiply faces, and 20 undercut
        // faces are a few slides, not twenty — which put a £300,000 die (its
        // cap) on a 2.8 kg housing the shop model prices at ~£40,000. It is
        // kept as a cross-check in the basis, not used.
        const area = projectedAreaCm2(ctx);
        if (area != null && area > 0) {
          const under = ctx.geo.draftAnalysis?.undercutFaceCount ?? 0;
          const slides = Math.ceil(under / 6);
          const complexity: ToolComplexity = slides >= 3 ? 'complex' : slides >= 1 ? 'moderate' : 'simple';
          const cores = ctx.geo.topology?.enclosesSealedVoid ? 2 : under >= 20 ? 2 : under >= 1 ? 1 : 0;
          // A sand pattern plate carries every impression the chosen line's mould face holds.
          const imps = r.advice.subtype === 'sand' ? Math.max(1, sandLinePlan(ctx)?.impressions ?? 0) : 1;
          const est = r.advice.subtype === 'hpdc' ? estimateHPDCDieCost({ projectedAreaCm2: area, complexity })
            : r.advice.subtype === 'gravity' ? estimateGravityMouldCost({ projectedAreaCm2: area, complexity })
            : r.advice.subtype === 'sand' ? estimateSandPatternCost({ projectedAreaCm2: area * imps, coreCount: cores })
            : estimateInvestmentToolCost({ projectedAreaCm2: area, complexity, coreCount: cores });
          return decided('casting.dieMouldCostGBP', est.total, 'advisor',
            `${r.advice.subtype} toolmaker shop model: ${est.detail.labourHours.toLocaleString()} toolroom hours `
            + `+ ${r.advice.subtype === 'sand' ? 'aluminium plate' : 'steel'} + bought-outs from a ${Math.round(area)} cm² parting footprint${imps > 1 ? ` × ${imps} impressions on the plate` : ''}, `
            // A sand pattern has no slides and the sand model takes no complexity: it printed "complex (32 undercut
            // face(s) ≈ 6 slide(s))" on a pattern costed with core boxes only (arithmetic audit, Oct 2026).
            + (r.advice.subtype === 'sand'
              ? `${cores} core box(es) (${under} undercut face(s))`
              : `${complexity} (${under} undercut face(s) ≈ ${slides} slide(s)${r.advice.subtype === 'investment' ? `, ${cores} core box(es)` : ''})`)
            + ' — a quotation overrides this', 0.6);
        }
        if (pick[r.advice.subtype] != null) {
          return decided('casting.dieMouldCostGBP', Math.round(pick[r.advice.subtype]!), 'geometry',
            `kernel face-count parametric ${r.advice.subtype} tooling estimate (no footprint for the shop model) — low confidence`, 0.4);
        }
        return ask({
          id: 'casting.toolingCost',
          kind: 'tolerance_class',
          question: `What does the ${r.advice.subtype} tooling cost?`,
          why: 'No measured footprint exists to drive the toolmaker shop model. '
            + 'A quotation is worth more than an invented band.',
          options: [{ value: 'quote', label: 'Toolmaker quotation' }],
          entry: { kind: 'number', unit: '£', placeholder: 'e.g. 14000' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
      },
    },
    {
      id: 'casting.dieMouldLife',
      path: 'casting.dieMouldLife',
      fieldId: 'cast-hpdc-die-life',
      label: 'dieMouldLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const life: Record<CastingSubtype, number> = {
          hpdc: 150_000, gravity: 50_000, sand: 8_000, investment: 5_000,
        };
        // A pattern wears per MOULD rammed on it; each mould yields every
        // impression on the plate. The module counts life in castings.
        if (r.advice.subtype === 'sand') {
          // P3 (foundry research, 3 Nov 2026): the life follows the pattern material PRICED — the toolmaker build-up
          // prices an aluminium match plate (casting-tooling.ts), so it lasts as aluminium does, not as wood.
          const plan = sandLinePlan(ctx);
          const imps = Math.max(1, plan?.impressions ?? 0);
          const pl = SAND_PATTERN_LIFE_MOULDS.aluminium;
          return decided('casting.dieMouldLife', pl.moulds * imps, 'library',
            `aluminium match-plate life ${pl.moulds.toLocaleString('en-GB')} moulds × ${imps} impression(s) a mould`
            + `${plan ? ` on the ${plan.line.label}` : ''} = ${(pl.moulds * imps).toLocaleString('en-GB')} castings — `
            + `the pattern priced is an aluminium plate, so its life is ${pl.basis}. A steel plate lasts up to 500,000 moulds `
            + '(DISA, said of an aluminium-casting foundry) but none is priced; a foundry\'s pattern life replaces this', 0.5);
        }
        return decided('casting.dieMouldLife', life[r.advice.subtype], 'library',
          `${r.advice.subtype} tool life band ${life[r.advice.subtype].toLocaleString()} ${r.advice.subtype === 'hpdc' ? 'shots' : 'castings'} (engineering-typical, not sourced)`, 0.6);
      },
    },
    {
      id: 'casting.cavities',
      path: 'casting.cavities',
      fieldId: 'cast-hpdc-cav',
      label: 'cavities',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype === 'hpdc';
      },
      evaluate: (ctx) => {
        const mat = materialFacts(ctx);
        if (mat.decision) return ask(mat.decision);
        const n = mat.massKg! > 1 ? 1 : 2;
        return decided('casting.cavities', n, 'rule',
          `${mat.massKg!.toFixed(2)} kg ${mat.massKg! > 1 ? '> 1 kg → single cavity' : '≤ 1 kg → 2 cavities'}`, 0.5);
      },
    },
    {
      id: 'casting.cycleTimeSandGravHr',
      path: 'casting.cycleTimeSandGravHr',
      fieldId: 'cast-sand-ct',
      label: 'cycleTimeSandGravHr',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return 'blocked' in r || r.advice.subtype !== 'hpdc';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.subtype === 'sand') {
          // Moulding-line time per casting = one mould's share ÷ impressions per
          // mould. The kernel's "0.15 + 0.04 h/kg" charged pour, solidify and
          // knockout as line time — castings cool on the conveyor while the
          // line keeps moulding — at aluminium density for every alloy: 11 min a
          // part, £13 of moulding on a 2.5 kg steel bracket.
          // P1 (foundry at volume, 3 Nov 2026): the line is chosen by the part's moulds a year and its mould size.
          const plan = sandLinePlan(ctx);
          const fp = mouldFootprintMm(ctx);
          if (plan && fp) {
            const L = plan.line;
            const n = plan.impressions;
            const m = IMPRESSION_MARGIN_MM;
            const hrPerMould = 1 / plan.mouldsPerHr;
            const rate = `${plan.mouldsPerHr} ${plan.cored ? 'cored' : 'uncored'} moulds/h (${L.rateBasis})`;
            if (n >= 1) {
              // 6 dp below 0.01 h, as the screen writes the field (formatRuleValue): on the automatic line a casting
              // takes ~1.6 s, and 4 dp (0.0004 for 0.000444 h) cut the moulding 10 % (shadow model, 3 Nov 2026).
              const h = lineHrRounded(hrPerMould / n);
              return decided('casting.cycleTimeSandGravHr', h, 'geometry',
                `${L.label}: ${n} impression(s) of ${fp[0].toFixed(0)} × ${fp[1].toFixed(0)} mm (+${m} mm gating) on a ${L.faceMm[0]} × ${L.faceMm[1]} mm mould, `
                + `${rate} — 1 ÷ ${plan.mouldsPerHr} ÷ ${n} = ${h} h, the line's time per casting, not the cooling time. Line: ${plan.why}`, 0.55);
            }
            // Too big for the flask: floor-moulded, one per mould, time scaling
            // with the mould area against the flask's.
            const [FL, FW] = L.faceMm;
            const ratio = ((fp[0] + m) * (fp[1] + m)) / (FL * FW);
            return decided('casting.cycleTimeSandGravHr', lineHrRounded(hrPerMould * ratio), 'geometry',
              `${fp[0].toFixed(0)} × ${fp[1].toFixed(0)} mm does not fit a ${FL} × ${FW} mm flask — floor-moulded, `
              + `${ratio.toFixed(1)}× a flask's moulding time at ${rate}. Line: ${plan.why}`, 0.4);
          }
        }
        if (r.advice.subtype === 'investment') {
          const y = bandMid(CASTING_PROCESS_REFERENCE.investment.yieldBand);
          const n = Math.max(1, Math.min(INVESTMENT_TREE.MAX_PARTS, Math.floor(INVESTMENT_TREE.POUR_KG * y / r.advice.massKg)));
          return decided('casting.cycleTimeSandGravHr', Math.round(INVESTMENT_TREE.HR_PER_TREE / n * 10_000) / 10_000, 'rule',
            `${INVESTMENT_TREE.HR_PER_TREE} h pour / knockout a tree ÷ ${n} part(s) on a ${INVESTMENT_TREE.POUR_KG} kg tree `
            + `at ${y} yield (${r.advice.massKg.toFixed(2)} kg part)`, 0.45);
        }
        const band: Record<CastingSubtype, number> = {
          hpdc: 0.02, gravity: 0.08, sand: 0.5, investment: 0.40,
        };
        return decided('casting.cycleTimeSandGravHr', band[r.advice.subtype], 'library',
          `${r.advice.subtype} cycle band`, 0.4);
      },
    },
    {
      // P1 (foundry at volume, 3 Nov 2026): the moulding line the plan chose — it was always the semi-automatic line
      // (the screen pinned it, headless hard-coded it).
      id: 'casting.sandLineId',
      path: 'casting.sandLineId',
      fieldId: 'cast-sand-line',
      label: 'sandLineId',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.subtype === 'sand';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const plan = sandLinePlan(ctx);
        const L = plan?.line ?? SAND_LINE_CLASSES['semi-auto'];
        return decided('casting.sandLineId', L.machineId, 'rule',
          plan ? `${L.label}: ${plan.why}` : `${L.label} — no footprint measured to size the mould`, plan ? 0.6 : 0.4);
      },
    },
    {
      // The die-casting machine, from the clamp force the part needs. It was
      // picked from `weight × 220` read as tonnes — a mass passed where a force
      // was expected — and only on the headless path; the screen kept the
      // drop-down's first machine.
      id: 'casting.hpdcMachineId',
      path: 'casting.hpdcMachineId',
      fieldId: 'cast-hpdc-mach',
      label: 'hpdcMachineId',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.subtype === 'hpdc';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const area = projectedAreaCm2(ctx);
        const cav = r.advice.massKg > 1 ? 1 : 2;
        if (area == null || area <= 0) {
          return decided('casting.hpdcMachineId', pickHPDCMachineId(r.advice.massKg * 220), 'rule',
            'no footprint measured — sized from mass (× 220 t/kg), low confidence', 0.3);
        }
        // Locking force = projected area × intensification pressure. 0.8 t/cm²
        // is ~800 bar, mid of the 600–1,000 bar aluminium HPDC runs at; runners
        // and overflows add ~25% to the area the die opens against.
        const tonnes = area * cav * 1.25 * 0.8;
        return decided('casting.hpdcMachineId', pickHPDCMachineId(tonnes), 'geometry',
          `${Math.round(area)} cm² × ${cav} cavit${cav === 1 ? 'y' : 'ies'} × 1.25 (runners, overflows) × 0.8 t/cm² (≈800 bar) `
          + `= ${Math.round(tonnes)} t, × 1.2 safety → the smallest machine over ${Math.round(tonnes * 1.2)} t`, 0.65);
      },
    },
    {
      // Foundry labour on the casting line. The screen kept the drop-down's
      // first entry — a skilled machinist at £26/h — while headless used the
      // foundry operative at £19/h: the Casting Bracket's labour differed 21%.
      id: 'casting.labourId',
      path: 'casting.labourId',
      fieldId: 'cast-lab',
      label: 'labourId',
      evaluate: () => decided('casting.labourId', 'lab-uk-foundry', 'library',
        'foundry operative on the moulding / die-casting line and at the fettling bench', 0.8),
    },
    {
      id: 'casting.fettlingMinutes',
      path: 'casting.fettlingMinutes',
      fieldId: 'cast-fettle-min',
      label: 'fettlingMinutes',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const cell = fettlingOnCell(ctx, r.advice);
        if (cell) {
          return decided('casting.fettlingMinutes', 0, 'rule',
            `none at the bench — ${cell} (see the robotic fettling cell)`, 0.55);
        }
        const ferrousSteel = r.advice.alloy === 'carbon-steel' || r.advice.alloy === 'stainless-steel';
        const levels = ['light', 'medium', 'heavy'] as const;
        // Trimmed die castings are light; sand and investment are medium; one
        // step heavier for a big casting, or a steel sand casting over 10 kg
        // whose risers come off by disc or torch.
        let i = r.advice.subtype === 'hpdc' || r.advice.subtype === 'gravity' ? 0 : 1;
        const heavySteel = ferrousSteel && r.advice.subtype === 'sand' && r.advice.massKg > 10;
        const big = r.advice.massKg > 25;
        if (heavySteel || big) i = Math.min(2, i + 1);
        const level = levels[i];
        return decided('casting.fettlingMinutes', FETTLING_MINUTES[level], 'rule',
          `${level} fettling — ${r.advice.subtype} ${r.advice.alloy}, ${r.advice.massKg.toFixed(1)} kg`
          + `${heavySteel ? ' (steel risers cut by disc / torch)' : big ? ' (large casting)' : ''}: `
          + `gate / riser removal and grind at the foundry rate, ${FETTLING_MINUTES[level]} min (${FETTLING_MINUTES_BASIS})`, 0.5);
      },
    },
    {
      // P4 (foundry at volume, 3 Nov 2026): a ferrous casting ≤ 30 kg off the AUTOMATIC line is fettled on a robotic
      // grinding cell — 40 s a casting, one operator to two cells (sourced); the semi-automatic line keeps bench minutes.
      id: 'casting.fettlingCellSec',
      path: 'casting.fettlingCellSec',
      fieldId: 'cast-fettle-cell-sec',
      label: 'fettlingCellSec',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.subtype === 'sand';
      },
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const cell = fettlingOnCell(ctx, r.advice);
        return cell
          ? decided('casting.fettlingCellSec', FETTLING_CELL.secPerCasting, 'rule', `${cell}: ${FETTLING_CELL.basis}`, 0.55)
          : decided('casting.fettlingCellSec', 0, 'rule', 'bench fettling (not on the automatic line, or outside the cell\'s ferrous ≤ 30 kg range)', 0.55);
      },
    },
    {
      id: 'casting.heatTreatCostPerKg',
      path: 'casting.heatTreatCostPerKg',
      fieldId: 'cast-ht-cost',
      label: 'heatTreatCostPerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice.alloy;
        const steel = a === 'carbon-steel' || a === 'stainless-steel';
        const iron = a === 'grey-iron' || a === 'ductile-iron';
        const al = a === 'aluminium';
        // UK £/kg × the costed country's heat-treat factor (regional-services.ts) — it was the UK's everywhere.
        const hf = heatTreatServiceFactor();
        const inCountry = (v: number) => Math.round(v * hf * 10_000) / 10_000;
        const fNote = hf !== 1 ? ` × country heat-treat factor ${hf}` : '';
        if (steel) {
          return decided('casting.heatTreatCostPerKg', inCountry(HEAT_TREAT_COST_PER_KG['stress-relieve']), 'library',
            `cast steel is normalised to refine the as-cast grain — £${HEAT_TREAT_COST_PER_KG['stress-relieve']}/kg × the as-cast kg (the advisor's stress-relieve / normalise rate, UK; engineering-typical, not sourced — a heat treater's quote replaces it)${fNote}`, 0.6);
        }
        if (iron) {
          // Pilot rule pack (30 Oct 2026): grey and ductile iron are supplied as-cast — EN 1561 / EN 1563 grades are
          // specified in the as-cast condition. A safety-critical part changes the grade (ductile) and the NDT, not the
          // heat treatment; it used to charge a stress relief at £0.35/kg on every safety-critical iron casting. ADI's
          // austempering is in the grade price (the book says so on each ADI grade).
          // Standards wording (report standard review, 3 Nov 2026): EN 1563 (ductile) and EN 1561 (grey) set mechanical
          // properties, not the delivery condition — heat treatment is the foundry's choice unless the order says
          // otherwise. "Specified as-cast" was wrong, and EN 1561 is grey iron only. ADI is EN 1564.
          const gid = materialFacts(ctx).gradeId ?? castIronDefaultGrade(ctx).id;
          const gname = materialGradeName(gid, ctx.rates);
          const ferritic = /-(LT|RT)\b/i.test(gname);
          const adi = /ADI|austempered/i.test(gname);
          const std = /GJV|compacted/i.test(gname) ? 'EN 16079' : 'EN 1563';
          return decided('casting.heatTreatCostPerKg', 0, 'rule',
            a === 'ductile-iron'
              ? (adi
                ? `${gname}: the austempering (EN 1564) is in the grade's £/kg — no separate heat treatment`
                : `${gname} is normally met as-cast — ${std} sets the mechanical properties and leaves heat treatment to the `
                  + 'foundry unless the order says otherwise; none costed'
                  + (ferritic ? '. A -LT / -RT grade usually needs a ferritising anneal — NOT COSTED (add it if the foundry anneals)' : '')
                  + ' — add a stress relief if the drawing calls for one')
              : `${gname} is supplied as-cast — EN 1561 sets the mechanical properties and leaves heat treatment to the `
                + 'foundry unless the order says otherwise; none costed — add a stress relief if the drawing calls for one', 0.6,
            [SAFETY_CRITICAL_DECISION_ID]);
        }
        if (al && r.advice.process !== 'hpdc') {
          const t = r.advice.process === 'megacasting' ? 'T7 (priced at the T6 rate)' : 'T6';
          return decided('casting.heatTreatCostPerKg', inCountry(HEAT_TREAT_COST_PER_KG.t6), 'library',
            `${r.advice.process} aluminium is solution treated and aged, ${t} — £${HEAT_TREAT_COST_PER_KG.t6}/kg × the as-cast kg (advisor rate, UK; engineering-typical, not sourced)${fNote}`, 0.55);
        }
        return decided('casting.heatTreatCostPerKg', 0, 'rule',
          al ? 'conventional HPDC is not solution treated (entrapped gas blisters) — none; enter a T5 age if specified'
            : `${a} cast as-cast — none unless the drawing calls for it`, 0.6);
      },
    },
    {
      id: 'casting.shotBlastCostPerPart',
      path: 'casting.shotBlastCostPerPart',
      fieldId: 'cast-shot-blast',
      label: 'shotBlastCostPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return shotBlastOutcome(r.advice.subtype, r.advice.massKg, 'kg');
      },
    },
    {
      id: 'casting.impregnationCostPerPart',
      path: 'casting.impregnationCostPerPart',
      fieldId: 'cast-impreg',
      label: 'impregnationCostPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const sf = processServiceFactor();   // a bought-in process service: labour + equipment, in the costed country
        const gbp = Math.round(0.9 * sf * 10_000) / 10_000;
        const rate = `£0.90 a part (advisor rate, UK; engineering-typical, not sourced)${sf !== 1 ? ` × country process-service factor ${sf}` : ''}`;
        if (!r.advice.pressureTight) {
          return decided('casting.impregnationCostPerPart', 0, 'rule', 'not pressure-tight — no impregnation', 0.6, [PRESSURE_TIGHT_DECISION_ID]);
        }
        if (lightAlloyImpregnation(r.advice)) {
          return decided('casting.impregnationCostPerPart', gbp, 'rule',
            `pressure-tight light-alloy casting — vacuum resin impregnation seals porosity, ${rate}`, 0.6, [PRESSURE_TIGHT_DECISION_ID]);
        }
        // Iron, steel and copper-alloy castings that must hold pressure are impregnated case by case (pump, valve and
        // compressor bodies often are). It was excluded outright — "not pressure-tight (or ferrous)" — so a leak-tight
        // iron casting was costed without it and nothing said so (report standard review, 3 Nov 2026): it is asked.
        const ans = ctx.answers[IMPREGNATION_DECISION_ID];
        if (ans === 'yes' || ans === true) {
          return decided('casting.impregnationCostPerPart', gbp, 'engineer',
            `pressure-tight ${r.advice.alloy.replace('-', ' ')} casting, impregnation specified (answered) — vacuum resin impregnation, ${rate}`, 0.6,
            [PRESSURE_TIGHT_DECISION_ID, IMPREGNATION_DECISION_ID]);
        }
        return decided('casting.impregnationCostPerPart', 0, ans === undefined ? 'rule' : 'engineer',
          ans === undefined
            ? `pressure-tight ${r.advice.alloy.replace('-', ' ')} casting — impregnation NOT COSTED: it is specified case by case on iron, steel and copper-alloy castings; answer "Is vacuum impregnation specified?" to price it`
            : `pressure-tight ${r.advice.alloy.replace('-', ' ')} casting — answered: no impregnation`, 0.6,
          [PRESSURE_TIGHT_DECISION_ID, IMPREGNATION_DECISION_ID]);
      },
    },
    {
      // The impregnation question (report standard review): advisory, on a leak-tight casting that is not a light alloy.
      id: 'casting.q.impregnation', path: 'casting.q.impregnation', label: 'impregnation question',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (!r.advice.pressureTight || lightAlloyImpregnation(r.advice)) {
          return decided('casting.q.impregnation', 'no', 'rule', r.advice.pressureTight ? 'light alloy — impregnated as a rule, not asked' : 'not pressure-tight — not asked', 1);
        }
        const ans = ctx.answers[IMPREGNATION_DECISION_ID];
        if (ans === undefined) return ask(impregnationDecision());
        return decided('casting.q.impregnation', ans === 'yes' || ans === true ? 'yes' : 'no', 'engineer', 'answered', 1, [IMPREGNATION_DECISION_ID]);
      },
    },
    {
      id: 'casting.ndtCostPerPart',
      path: 'casting.ndtCostPerPart',
      fieldId: 'cast-ndt',
      label: 'ndtCostPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (!r.advice.safetyCritical) {
          return decided('casting.ndtCostPerPart', 0, 'rule', 'not safety-critical — no radiography', 0.6,
            [SAFETY_CRITICAL_DECISION_ID]);
        }
        const a = r.advice.alloy;
        if (a === 'superalloy') {
          const nf = ndtServiceFactor();   // inspector + CT cell, in the costed country
          return decided('casting.ndtCostPerPart', Math.round(NDT_COST_PER_PART.ct * nf * 10_000) / 10_000, 'library',
            `safety-critical — industrial CT at £${NDT_COST_PER_PART.ct} a part (advisor rate, UK; engineering-typical, not sourced)${nf !== 1 ? ` × country service factor ${nf}` : ''}`, 0.55,
            [SAFETY_CRITICAL_DECISION_ID]);
        }
        // Pilot rule pack (30 Oct 2026): a safety-critical ferrous casting is 100 % magnetic-particle inspected with a
        // sample radiographed; a light-alloy one is 100 % X-rayed in line. It used to charge a £5 radiograph on every part.
        const ferrous = a === 'grey-iron' || a === 'ductile-iron' || a === 'carbon-steel' || a === 'stainless-steel';
        const st = ndtStationCostPerPart(ferrous ? 'mpi' : 'rtr');
        return decided('casting.ndtCostPerPart', st.gbp, 'rule', `safety-critical ${a} — ${st.basis}`, 0.55,
          [SAFETY_CRITICAL_DECISION_ID]);
      },
    },
    {
      // Investment wax and shell were costed at £0 headless while the kernel
      // computed them from the surface area on every upload.
      id: 'casting.investWaxCostPerPart',
      path: 'casting.investWaxCostPerPart',
      fieldId: 'cast-inv-wax',
      label: 'investWaxCostPerPart',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.subtype === 'investment';
      },
      evaluate: (ctx) => {
        const sa = (ctx.geo.surfaceArea?.mm2 ?? 0) / 100;
        const v = ctx.geo.processSpecificEstimates?.investWaxCostGBP ?? Math.round(Math.max(0.30, sa * 0.015) * 100) / 100;
        return decided('casting.investWaxCostPerPart', countryGbp(v, INVEST_BASIS), 'geometry',
          `wax pattern from ${Math.round(sa)} cm² surface at £0.015/cm² (min £0.30), UK basis${countryNote(INVEST_BASIS)} — kernel estimate`, 0.45);
      },
    },
    {
      id: 'casting.investShellCostPerPart',
      path: 'casting.investShellCostPerPart',
      fieldId: 'cast-inv-shell',
      label: 'investShellCostPerPart',
      appliesWhen: (ctx) => {
        const r = advise(ctx);
        return !('blocked' in r) && r.advice.subtype === 'investment';
      },
      evaluate: (ctx) => {
        const sa = (ctx.geo.surfaceArea?.mm2 ?? 0) / 100;
        const v = ctx.geo.processSpecificEstimates?.investShellCostGBP ?? Math.round(Math.max(0.80, sa * 0.045) * 100) / 100;
        return decided('casting.investShellCostPerPart', countryGbp(v, INVEST_BASIS), 'geometry',
          `ceramic shell from ${Math.round(sa)} cm² surface at £0.045/cm² (min £0.80), UK basis${countryNote(INVEST_BASIS)} — kernel estimate`, 0.45);
      },
    },
    {
      // A sand line is run by a crew, not one person. Manning 1 charged a
      // moulding line's output at a single operator's time.
      id: 'casting.manning',
      path: 'casting.manning',
      fieldId: 'cast-manning',
      label: 'manning',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        if (r.advice.subtype === 'sand') {
          // P2 (foundry at volume, 3 Nov 2026): the crew of the line class chosen. Cored or not: on a coreless part the
          // semi-automatic line's fourth hand closes and handles moulds.
          const L = sandLinePlan(ctx)?.line ?? SAND_LINE_CLASSES['semi-auto'];
          return decided('casting.manning', L.crew, 'rule', `${L.label} crew of ${L.crew}: ${L.crewBasis}`, L.id === 'semi-auto' ? 0.5 : 0.6);
        }
        return decided('casting.manning', 1, 'rule',
          `one operator to a ${r.advice.subtype} cell`, 0.6);
      },
    },
    {
      id: 'casting.leakTestSec',
      path: 'casting.leakTestSec',
      fieldId: 'cast-leak-sec',
      label: 'leakTestSec',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return r.advice.pressureTight
          ? decided('casting.leakTestSec', 45, 'rule',
            'pressure-tight — 100% air-decay leak test, 45 s a part on the pressure & leak test rig (engineering-typical 30–60 s)', 0.5,
            [PRESSURE_TIGHT_DECISION_ID])
          : decided('casting.leakTestSec', 0, 'rule', 'not pressure-tight — no leak test', 0.6, [PRESSURE_TIGHT_DECISION_ID]);
      },
    },
    // The finish question (CAD to COST D4) — asked last: a coating follows the process and the metal.
    ...finishRules('casting', 'cast'),
  ],
};

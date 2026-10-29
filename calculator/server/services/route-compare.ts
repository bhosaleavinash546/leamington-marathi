/**
 * Compare routes — D5 of CAD to COST v2 (decided 28 Oct 2026), rebuilt in the compare-routes review (Oct 2026,
 * docs/cad/compare-routes-review-2026-10.md) and extended in its second round (29 Oct 2026, §5 of the same doc).
 *
 * A cost engineer's first challenge to a forging quote is "what if it were cast?". This costs the SAME measured part on
 * every route — and every casting or forging PROCESS — that can make it, in its own material family, to the same finished
 * scope, through `costMeasuredPart`, the headless chain the bulk runs and the real-parts baseline use, proven equal to
 * the screen to the penny, with the engineer's answers carried over.
 *
 * What a row carries, so the arithmetic can be checked line by line:
 *   - the 8 buckets and an INDEPENDENT re-add (`audit`): every operation re-priced from its own rate × time ÷ OEE ÷
 *     parts a cycle, the material from kg × £/kg − scrap credit + energy + consumables, tooling ÷ amortisation,
 *     overhead and margin at their stated percentages — each line against the engine's figure, and whether it closes;
 *   - the specification the row was costed to (`spec`): every service and material answer with its source, so two rows
 *     are compared on the same spec or the difference is printed;
 *   - the material: net kg, kg bought, utilisation, the grade costed;
 *   - the tooling: the one-off investment, what it is spread over, and the £ a part;
 *   - every operation: machine class, cycle, £ process and £ labour;
 *   - the feasibility checks the route passed, with their sources, and any caveat;
 *   - the Monte-Carlo band (P10 / P90) of the row at the costing's volume;
 *   - the same route re-costed on a volume ladder, with its band at each point, from which the crossover with the
 *     costing's route is read — and where the bands overlap the two are reported as indistinguishable;
 *   - the tooling payback against the costing's route, and the programme cost (parts × piece cost + tooling).
 *
 * Nothing is estimated here: a route that needs an answer nobody has given is assumed only when its question shows a
 * leaning (and the row says so), otherwise the row stops and names the question. A route the screen refuses is listed
 * with the check it failed and its source, and is not costed. The crossover volume is interpolated between two real
 * re-costs, never from a straight-line formula and never extrapolated beyond the ladder.
 */
import type { OCCTGeometry } from '../utils/geometry-bridge.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';
import type { RateLibrary } from '../../src/engine/types.js';
import type { RuleContext } from '../../src/engine/cost-input-rules/types.js';
import { costMeasuredPart, regionalBook, type BulkPartResult } from './bulk-run.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { inMaterialScope } from '../../src/engine/material-scope.js';
import { POLYMER_TAXONOMIES } from '../../src/engine/polymer-material-taxonomy.js';
import { computeCostUncertainty, type DriverProvenance, type DriverSource } from '../../src/engine/uncertainty.js';
import { overheadBaseOf } from '../../src/engine/core.js';
import { shortOperationName } from '../../src/engine/operation-names.js';
import { FINISH_PREFIX_BY_COMMODITY } from '../../src/engine/surface-finish-routes.js';
import {
  screenRoutes, materialFamilyOf, familyOfCategory, COMPARISON_PRINCIPLE, type FeasibilityCheck, type RouteScreen,
} from '../../src/engine/route-feasibility.js';
import { DENSITY_KG_PER_CM3, representativeMaterialId } from '../../src/engine/cost-input-rules/derive/material.js';
import type { MaterialFamily } from '../../src/engine/material-family.js';
import { castingProcessRefusal, type CastingProcess, type AlloyFamily } from '../../src/engine/modules/casting-advisor.js';
import { forgingProcessRefusal, type ForgingProcess } from '../../src/engine/modules/forging-advisor.js';
import { castingAlloyForGrade, forgingAlloyForGrade } from '../../src/engine/cost-input-rules/derive/grade.js';
import { CASTING_PROCESS_CHOICE_ID, castingSectionMm } from '../../src/engine/cost-input-rules/commodities/casting.js';
import { FORGING_PROCESS_CHOICE_ID, shapeComplexity, advisorComplexity } from '../../src/engine/cost-input-rules/commodities/forging.js';
import { isRingShape } from '../../src/engine/cost-input-rules/derive/envelope.js';
import { INVESTMENT_TREE } from '../../src/engine/cost-input-rules/commodities/casting.js';

/** Answers that pick the route itself — each row forces its own. */
const ROUTE_ANSWER_IDS = ['commodity.route', 'commodity.thinWallRoute'];

/** Material answers that name a grade on ONE route's scope (an alloy code is only meaningful to aluminium extrusion). */
const MATERIAL_ANSWER_IDS = ['material.grade', 'material.resin', 'material.elastomer', 'material.laminate'];

/** The service and material answers a row is costed to — printed as its specification. */
const SPEC_IDS: Array<[string, string]> = [
  ['material.family', 'Material family'], ['material.grade', 'Grade'], ['material.resin', 'Resin'],
  ['material.elastomer', 'Compound'], ['material.laminate', 'Laminate'], ['material.alAlloy', 'Alloy'],
  ['service.pressureTight', 'Leak-tight / pressure'], ['service.toleranceClass', 'Tolerance class'],
  ['service.safetyCritical', 'Safety-critical'], ['service.finish', 'Finish'],
  [CASTING_PROCESS_CHOICE_ID, 'Casting process'], [FORGING_PROCESS_CHOICE_ID, 'Forging process'],
];

/** The most rows costed in one comparison (the costing's own included). */
export const MAX_COSTED_ROUTES = 8;

/** The volumes every costed route is re-costed at, parts a year. The costing's own volume is added when not on it. */
export const VOLUME_LADDER = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000] as const;

/** Monte-Carlo trials: the full band at the costing's volume, a lighter one at each ladder point. */
const BAND_TRIALS = 4000;
const LADDER_TRIALS = 1000;

/** Half a penny: the tolerance every arithmetic check closes to. */
const CLOSE_GBP = 0.005;

export const CASTING_PROCESS_LABEL: Record<string, string> = {
  sand: 'sand casting', gravity: 'gravity die casting', hpdc: 'high-pressure die casting', investment: 'investment casting',
};
export const FORGING_PROCESS_LABEL: Record<string, string> = {
  'closed-die': 'closed-die forging', precision: 'precision forging', 'cold-forming': 'cold forming',
  'ring-rolling': 'ring rolling', 'open-die': 'open-die forging',
};

export interface RouteMaterial {
  materialId: string | null;
  /** The grade's name in the book. */
  label: string;
  netKg: number | null;
  boughtKg: number | null;
  utilisation: number | null;
}

export interface RouteTooling {
  /** The one-off investment, £. */
  investment: number;
  /** Parts it is spread over (annual × programme years, or the life the rules set). */
  amortisedOver: number;
  items: Array<{ label: string; gbp: number }>;
}

export interface RouteOperation {
  name: string;
  /** The machine CLASS (never a library id). */
  machine: string;
  cycleMin: number;
  processCost: number;
  labourCost: number;
  bench: boolean;
}

/** One line of the independent re-add: what was recomputed, from what, against the engine's figure. */
export interface AuditLine {
  line: string;
  /** The arithmetic, in words and numbers. */
  how: string;
  recomputed: number;
  reported: number;
  closes: boolean;
}

export interface RouteSpecItem {
  id: string;
  label: string;
  value: string;
  /** answered by the engineer · assumed from the question's leaning · not asked on this route · chosen by the comparison */
  source: 'answered' | 'assumed' | 'not asked' | 'comparison';
}

export interface RouteBand {
  p10: number; p50: number; p90: number;
  /** Half the P10–P90 spread as a percentage of the median. */
  plusMinusPct: number;
  confidence: string;
}

export interface RouteRow {
  /** The route asked for. */
  route: string;
  /** The casting or forging process this row is costed by, when the route has more than one. */
  process: string | null;
  /** The row's name: the route, with its process when it has one. */
  label: string;
  /** The route costed — a stamping the rules price cheaper as laser + brake comes back as sheet_metal_fab. */
  commodity: string | null;
  status: BulkPartResult['status'];
  total: number | null;
  toolingPerPart: number | null;
  /** The 8 buckets, £ a part. */
  breakdown: Record<string, number> | null;
  /** The buckets add to the total within half a penny. */
  reconciles: boolean | null;
  /** The independent re-add, line by line, and whether every line closes. */
  audit: { lines: AuditLine[]; closes: boolean } | null;
  spec: RouteSpecItem[];
  material: RouteMaterial | null;
  tooling: RouteTooling | null;
  operations: RouteOperation[] | null;
  /** The Monte-Carlo band at the costing's volume. */
  band: RouteBand | null;
  /** The feasibility checks this route passed (and, on the costing's own route, failed) with their sources. */
  checks: FeasibilityCheck[];
  caveats: string[];
  /** Answers this row assumed from a question's visible leaning, as "question → option". */
  assumed: string[];
  /** Questions this route asks that nobody has answered and that have no leaning. */
  openQuestions: string[];
  /** Answers carried from the costing that this route cannot use, and what it did instead. */
  notes: string[];
  /** Why a route was refused by the costing chain (a sanity check or no rules). */
  refusal: string | null;
  /** The same route at each ladder volume with its band (null where it needed an answer or was refused there). */
  byVolume: Array<{ volume: number; total: number | null; p10: number | null; p90: number | null; note: string | null }>;
  /** Programme view at the costing's volume and life: parts, piece cost without tooling, tooling, the total spend. */
  programme: { parts: number; years: number; pieceExTooling: number; pieceSpend: number; tooling: number; total: number } | null;
}

export interface RouteCrossover {
  route: string;
  process: string | null;
  label: string;
  /** The volume at which the route's median cost equals the costing's own, interpolated between two re-costs; null when it never crosses on the ladder. */
  atVolume: number | null;
  /** True when the route is the cheaper one ABOVE the crossover. */
  cheaperAbove: boolean | null;
  /** The ladder range over which the two routes' P10–P90 bands overlap around the crossover (indistinguishable there). */
  indistinguishable: { from: number; to: number } | null;
  /** Tooling payback against the costing's route at the costing's volume, when this route costs more tooling and a lower piece price. */
  payback: { extraTooling: number; pieceSaving: number; parts: number; months: number } | null;
  text: string;
}

export interface RouteComparison {
  principle: string;
  rows: RouteRow[];
  /** Routes (and processes) the screen refused, each with the checks it failed. */
  excluded: Array<{ route: string; process: string | null; label: string; reasons: FeasibilityCheck[] }>;
  ladder: number[];
  crossovers: RouteCrossover[];
  /** The costing's volume and programme life the programme view is built on. */
  programme: { annualVolume: number; years: number; yearsAssumed: boolean };
}

export interface CompareRoutesInput {
  geo: OCCTGeometry;
  filename: string;
  /** The costing's commodity — its row is the reference. */
  current: string;
  answers: Record<string, unknown>;
  region: ManufacturingRegion;
  annualVolume: number;
  programmeYears?: number;
  acknowledge?: string[];
  baseBook: RateLibrary;
  /** Re-cost every route on the volume ladder (default true). */
  ladder?: boolean;
  /** Run the Monte-Carlo band on every row and ladder point (default true). */
  bands?: boolean;
  /** The costing's own band as the screen shows it — printed on the reference row, so one costing has one band. */
  referenceBand?: RouteBand | null;
}

type ScreenArgs = Pick<CompareRoutesInput, 'geo' | 'filename' | 'current' | 'answers' | 'annualVolume' | 'baseBook'>;

/** The feasibility screen of every comparable route for this part, the costing's own first. */
export function screenCandidates(i: ScreenArgs): RouteScreen[] {
  const fam = materialFamilyOf(i.answers, i.baseBook);
  return screenRoutes(i.current, { geo: i.geo, filename: i.filename, family: fam.family, annualVolume: i.annualVolume })
    .filter(s => !!specForCommodity(s.route));
}

/** The routes worth costing: the costing's own, then every route the screen passes, at most MAX_COSTED_ROUTES. */
export function candidateRoutes(i: ScreenArgs): string[] {
  return screenCandidates(i).filter(s => s.feasible).map(s => s.route).slice(0, MAX_COSTED_ROUTES);
}

// ─── Process variants of a route ────────────────────────────────────────────────────────────────────────────────────

export interface ProcessVariant { process: string; label: string; refusal: string | null; source: string }

/**
 * The casting or forging processes this part could take on a route — each screened by the advisor's own material and
 * shape rules (`castingProcessRefusal`, `forgingProcessRefusal`), so a steel part is never offered a pressure die and a
 * 9 kg hub is never offered a cold former. A route with one process returns none.
 */
export function processVariants(route: string, i: ScreenArgs): ProcessVariant[] {
  const fam = materialFamilyOf(i.answers, i.baseBook).family;
  if (!fam || fam === 'rubber' || fam === 'composite' || fam === 'plastic') return [];
  const ctx = { geo: i.geo, answers: i.answers, annualVolume: i.annualVolume, filename: i.filename, rates: i.baseBook, commodity: route, geometryQuality: 'occt' } as RuleContext;
  const grade = typeof i.answers['material.grade'] === 'string' ? i.answers['material.grade'] as string : null;
  const volCm3 = i.geo.volume?.cm3 ?? 0;
  const massKg = volCm3 * (DENSITY_KG_PER_CM3[fam as MaterialFamily] ?? 0);
  if (route === 'casting' || route === 'cast_and_machine') {
    const alloy: AlloyFamily | null = castingAlloyForGrade(grade ?? representativeMaterialId('casting', fam as MaterialFamily) ?? null);
    if (!alloy) return [];
    const section = castingSectionMm(ctx);
    const src = 'casting advisor ladder (casting-advisor.ts: DIE_CASTABLE alloys, HPDC_SECTION_MAX_MM; INVESTMENT_TREE.POUR_KG for the tree)';
    return (['sand', 'gravity', 'hpdc', 'investment'] as CastingProcess[]).map(p => {
      let refusal = castingProcessRefusal(p, alloy, section);
      if (!refusal && p === 'investment' && massKg > INVESTMENT_TREE.POUR_KG) {
        refusal = `${massKg.toFixed(1)} kg is more than the ${INVESTMENT_TREE.POUR_KG} kg tree an investment foundry pours`;
      }
      return { process: p, label: CASTING_PROCESS_LABEL[p], refusal, source: src };
    });
  }
  if (route === 'forging') {
    const alloy = forgingAlloyForGrade(grade ?? representativeMaterialId('forging', fam as MaterialFamily) ?? null);
    if (!alloy) return [];
    const complexity = advisorComplexity(shapeComplexity(ctx));
    const ring = isRingShape(ctx);
    const src = 'forging advisor ladder (forging-advisor.ts: ring shape, COLD_FORMER_MAX_SLUG_MM, 5 kg cold / 100 kg precision)';
    return (['closed-die', 'precision', 'cold-forming', 'ring-rolling'] as ForgingProcess[]).map(p => ({
      process: p, label: FORGING_PROCESS_LABEL[p],
      refusal: forgingProcessRefusal(p, { partWeightKg: massKg, alloyFamily: alloy, complexity, isRingShape: ring }), source: src,
    }));
  }
  return [];
}

const PROCESS_ANSWER: Record<string, string> = { casting: CASTING_PROCESS_CHOICE_ID, cast_and_machine: CASTING_PROCESS_CHOICE_ID, forging: FORGING_PROCESS_CHOICE_ID };

// ─── Helpers reading a costed result ────────────────────────────────────────────────────────────────────────────────

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * The same POLYMER on another plastics route: an ABS thermoforming sheet compared as a moulding is costed in the
 * moulding's ABS grade, not left at "which resin?" — the assumption is stated on the row. Null when the route has no
 * grade of that polymer.
 */
export function samePolymerGrade(fromId: string, toRoute: string, book: RateLibrary): { id: string; label: string; polymer: string } | null {
  const polymer = Object.values(POLYMER_TAXONOMIES).map(t => t.facts(fromId)?.polymer).find(Boolean);
  const tax = POLYMER_TAXONOMIES[toRoute];
  if (!polymer || !tax) return null;
  for (const m of book.materials) {
    if (!inMaterialScope(toRoute, m.category)) continue;
    const f = tax.facts(m.id);
    if (f?.polymer === polymer) return { id: m.id, label: m.grade, polymer };
  }
  return null;
}

function materialOf(r: BulkPartResult, book: RateLibrary): RouteMaterial | null {
  const rm = r.trace?.drivers?.rawMaterial;
  if (!rm) return null;
  const net = Number.isFinite(rm.netWeightKg) ? rm.netWeightKg : null;
  const util = Number.isFinite(rm.materialUtilization) && rm.materialUtilization > 0 ? rm.materialUtilization : null;
  const m = book.materials.find(x => x.id === rm.materialId);
  return {
    materialId: rm.materialId ?? null,
    label: m?.grade ?? rm.materialId ?? 'material',
    netKg: net != null ? round(net, 3) : null,
    boughtKg: net != null && util != null ? round(net / util, 3) : null,
    utilisation: util != null ? round(util, 3) : null,
  };
}

function toolingOf(r: BulkPartResult): RouteTooling | null {
  const t = r.trace?.drivers?.tooling;
  if (!t) return null;
  return {
    investment: round(t.totalToolingCost ?? 0, 2),
    amortisedOver: Math.round(t.amortizationVolume ?? 0),
    items: (t.items ?? []).map(x => ({ label: x.label, gbp: round(x.gbp, 2) })),
  };
}

function operationsOf(r: BulkPartResult, book: RateLibrary): RouteOperation[] | null {
  const ops = r.trace?.operations;
  if (!ops) return null;
  return ops.map(op => ({
    name: shortOperationName(op.operationName),
    machine: op.benchOperation ? 'bench' : (book.machines.find(m => m.id === op.machineId)?.machineClass ?? 'machine'),
    cycleMin: round((op.cycleTimeHr ?? 0) * 60 / Math.max(1, op.partsPerCycle ?? 1), 3),
    processCost: round(op.processCost ?? 0),
    labourCost: round(op.labourCost ?? 0),
    bench: !!op.benchOperation,
  }));
}

function reconciles(r: BulkPartResult): boolean | null {
  if (r.total == null || !r.breakdown) return null;
  const sum = Object.values(r.breakdown).reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.abs(sum - r.total) < CLOSE_GBP;
}

/**
 * The independent re-add. Every figure is recomputed from the stack input the engine was handed and the rates it
 * recorded — never by calling the engine again — and set against the engine's own line. A row that does not close is
 * printed as such; it is never corrected.
 */
export function auditRow(r: BulkPartResult): { lines: AuditLine[]; closes: boolean } | null {
  const si = r.trace?.stackInput, res = r.trace?.result, bd = r.breakdown;
  if (!si || !res || !bd) return null;
  const f = (n: number) => `£${n.toFixed(4)}`;
  const lines: AuditLine[] = [];
  const line = (name: string, how: string, recomputed: number, reported: number) =>
    lines.push({ line: name, how, recomputed: round(recomputed), reported: round(reported), closes: Math.abs(recomputed - reported) < CLOSE_GBP });

  // Operations: process = machine £/hr × cycle h ÷ OEE ÷ parts a cycle; labour = labour £/hr × crew × labour h ÷ efficiency ÷ parts a cycle.
  let proc = 0, lab = 0;
  for (const op of res.operationDetails) {
    const ppc = Math.max(1, op.partsPerCycle || 1);
    const p = op.benchOperation ? 0 : op.machineRateUsed * op.cycleTimeHr / Math.max(1e-9, op.oee || 1) / ppc;
    const l = op.labourRateUsed * (op.manning ?? 1) * (op.labourTimeHr ?? op.cycleTimeHr) / Math.max(1e-9, op.labourEfficiency || 1) / ppc;
    proc += p; lab += l;
  }
  const lc = res.learningCurveApplied;
  line('Process (machines)', `Σ over ${res.operationDetails.length} operations of machine £/hr × cycle h ÷ OEE ÷ parts a cycle`, proc, bd.process);
  line('Labour', `Σ of labour £/hr × crew × labour h ÷ efficiency ÷ parts a cycle${lc ? ` − learning-curve saving ${f(lc.labourSaving)}` : ''}`, lab - (lc?.labourSaving ?? 0), bd.labour);

  // Material: gross kg × £/kg − scrap credit + energy + consumables + direct + bought-in.
  const rm = si.rawMaterial;
  const tr = res.traceability;
  const traced = (re: RegExp) => tr.filter(t => re.test(t.field)).reduce((s, t) => s + (Number(t.value) || 0), 0);
  const price = tr.find(t => t.field === 'material.pricePerKg')?.value ?? 0;
  const scrapPrice = tr.find(t => t.field === 'material.scrapRecoveryPricePerKg')?.value ?? 0;
  const gross = rm.materialUtilization > 0 ? rm.netWeightKg / rm.materialUtilization : rm.netWeightKg;
  const scrapKg = Math.max(0, gross - rm.netWeightKg);
  const credit = rm.lossIsNotScrap ? 0 : scrapKg * scrapPrice;
  const direct = rm.directCost ?? 0;
  const metal = rm.directCost !== undefined ? direct : gross * price - credit;
  const energy = traced(/^rawMaterial\.energyKwh\./);
  const consumables = rm.consumablesCostPerPart ?? 0;
  const boughtIn = Math.max(0, rm.boughtIn?.cost ?? 0);
  line('Material', rm.directCost !== undefined
    ? `direct material ${f(direct)} + energy ${f(energy)} + consumables ${f(consumables)} + bought-in ${f(boughtIn)}`
    : `${gross.toFixed(4)} kg bought (${rm.netWeightKg.toFixed(4)} net ÷ ${(rm.materialUtilization * 100).toFixed(1)}%) × £${price.toFixed(4)}/kg − ${rm.lossIsNotScrap ? 'no scrap credit (melt loss)' : `${scrapKg.toFixed(4)} kg × £${scrapPrice.toFixed(4)} credit`} + energy ${f(energy)} + consumables ${f(consumables)}${boughtIn ? ` + bought-in ${f(boughtIn)}` : ''}`,
    metal + energy + consumables + boughtIn, bd.rawMaterial);

  // Tooling: investment ÷ amortisation.
  const t = si.tooling;
  const toolPer = t.mode === 'amortized' && t.amortizationVolume > 0 ? t.totalToolingCost / t.amortizationVolume : (t.mode === 'amortized' ? 0 : t.totalToolingCost);
  line('Tooling', `£${t.totalToolingCost.toFixed(2)} ÷ ${t.amortizationVolume.toLocaleString('en-GB')} parts`, toolPer, bd.tooling);
  line('Packaging', 'the packaging figure handed to the stack', si.packagingPerPart, bd.packaging);
  line('Logistics', 'the logistics figure handed to the stack', si.logisticsPerPart, bd.logistics);

  // Overhead and margin, as the core applies them (bought-in content takes handling, not overhead, and no margin).
  const base = overheadBaseOf(res);
  const handling = boughtIn * Math.max(0, rm.boughtIn?.handlingPct ?? 0);
  const overhead = si.overheadPct * base + handling;
  line('Overhead', `${(si.overheadPct * 100).toFixed(1)}% × £${base.toFixed(4)} (material + process + labour + tooling${boughtIn ? ', bought-in excluded' : ''})${handling ? ` + bought-in handling ${f(handling)}` : ''}`, overhead, bd.overhead);
  const subtotal = bd.rawMaterial + bd.process + bd.labour + bd.tooling + bd.packaging + bd.logistics + bd.overhead;
  const margin = si.marginPct * (subtotal - boughtIn);
  line('Margin', `${(si.marginPct * 100).toFixed(1)}% × £${(subtotal - boughtIn).toFixed(4)} (the subtotal${boughtIn ? ' excluding bought-in' : ''})`, margin, bd.margin);
  const sum = Object.values(bd).reduce((s, v) => s + (Number(v) || 0), 0);
  line('Total', 'the eight buckets added', sum, r.total ?? NaN);
  return { lines, closes: lines.every(l => l.closes) };
}

/** Driver provenance for the Monte-Carlo band, read off the headless rule provenance (the screen reads its own fields). */
function provenanceOf(r: BulkPartResult, geometryQuality: 'occt' | 'stl'): DriverProvenance {
  const prov = r.provenance ?? {};
  const srcOf = (suffixes: string[]): DriverSource | undefined => {
    const key = Object.keys(prov).find(k => suffixes.some(s => k.endsWith(s)));
    if (!key) return undefined;
    const basis = String(prov[key].basis ?? '').toLowerCase();
    if (/measured|counted off the b-rep|kernel|geometry/.test(basis)) return geometryQuality === 'stl' ? 'geometry_mesh' : 'geometry_exact';
    if (/engineer|answered|typed/.test(basis)) return 'engineer';
    return 'rule';
  };
  const ops = r.trace?.operations ?? [];
  return {
    netWeightKg: srcOf(['-net-wt', '-part-wt', '-finish-wt', '-weight']) ?? (geometryQuality === 'stl' ? 'geometry_mesh' : 'geometry_exact'),
    materialUtilization: srcOf(['-mat-util', '-yield', '-util']) ?? 'rule',
    cycleTimeHr: ops.map(() => srcOf(['-ct', '-cycle', '-cycle-time']) ?? 'rule'),
    toolingCost: srcOf(['-tooling', '-die-cost', '-mould-cost', '-tool-cost']) ?? 'rule',
    packaging: 'default',
    logistics: 'default',
  };
}

function bandOf(r: BulkPartResult, book: RateLibrary, geometryQuality: 'occt' | 'stl', trials: number): RouteBand | null {
  const si = r.trace?.stackInput, res = r.trace?.result;
  if (!si || !res) return null;
  try {
    const u = computeCostUncertainty(res, si, { trials, library: book, provenance: provenanceOf(r, geometryQuality), seed: 20261029 });
    return { p10: round(u.p10), p50: round(u.p50), p90: round(u.p90), plusMinusPct: round(u.plusMinusPct, 1), confidence: u.overallConfidence };
  } catch {
    return null;
  }
}

/** Cost one route once, resolving leanings on its own questions (each one recorded). */
async function costRoute(
  i: CompareRoutesInput, route: string, answers: Record<string, unknown>, annualVolume: number,
  assumed: string[] | null,
): Promise<{ r: BulkPartResult | null; open: string[] }> {
  let open: string[] = [];
  let r: BulkPartResult | null = null;
  for (let pass = 0; pass < 5; pass++) {
    r = await costMeasuredPart(
      i.geo, i.filename,
      { partNumber: i.filename, file: i.filename, commodity: route, annualVolume },
      answers, i.region,
      { annualVolume, ...(i.programmeYears ? { programmeYears: i.programmeYears } : {}), acknowledge: i.acknowledge ?? [] },
      i.baseBook,
      { partNumber: i.filename, file: i.filename, status: 'error' },
    );
    if (r.status !== 'needs_answer') break;
    open = [];
    let progressed = false;
    for (const q of r.questions ?? []) {
      const lean = q.options.find(o => o.leaning);
      if (lean && answers[q.id] === undefined) {
        answers[q.id] = lean.value;
        assumed?.push(`${q.question} → ${lean.label}`);
        progressed = true;
      } else {
        open.push(q.question);
      }
    }
    if (!progressed) break;
  }
  return { r, open: r?.status === 'needs_answer' ? open : [] };
}

function specOf(answers: Record<string, unknown>, original: Record<string, unknown>, assumedIds: Set<string>, route: string, book: RateLibrary): RouteSpecItem[] {
  const out: RouteSpecItem[] = [];
  for (const [id, label] of SPEC_IDS) {
    const v = answers[id];
    if (v === undefined || v === null || v === '') continue;
    let value = String(v);
    const m = book.materials.find(x => x.id === value);
    if (m) value = m.grade;
    if (id === CASTING_PROCESS_CHOICE_ID) value = CASTING_PROCESS_LABEL[value] ?? value;
    if (id === FORGING_PROCESS_CHOICE_ID) value = FORGING_PROCESS_LABEL[value] ?? value;
    const source: RouteSpecItem['source'] = id === CASTING_PROCESS_CHOICE_ID || id === FORGING_PROCESS_CHOICE_ID ? 'comparison'
      : assumedIds.has(id) ? 'assumed' : original[id] !== undefined ? 'answered' : 'comparison';
    out.push({ id, label, value, source });
  }
  // A service answer the costing carries that this route never reads is said, so a "cheaper" row is not read as a
  // tighter one: pressure-tight on a forging, finish on machining.
  const reads: Record<string, string[]> = {
    'service.pressureTight': ['casting', 'cast_and_machine'],
    'service.toleranceClass': ['casting', 'cast_and_machine', 'forging'],
    'service.safetyCritical': ['casting', 'cast_and_machine', 'forging'],
    'service.finish': Object.keys(FINISH_PREFIX_BY_COMMODITY),
  };
  for (const item of out) {
    const r = reads[item.id];
    if (r && !r.includes(route)) item.source = 'not asked';
  }
  return out;
}

export async function compareRoutes(i: CompareRoutesInput, routes?: string[]): Promise<RouteComparison> {
  const screens = screenCandidates(i);
  const feasible = routes ?? screens.filter(s => s.feasible).map(s => s.route);
  const excluded: RouteComparison['excluded'] = screens.filter(s => !s.feasible && !feasible.includes(s.route))
    .map(s => ({ route: s.route, process: null, label: s.route.replace(/_/g, ' '), reasons: s.checks.filter(c => !c.pass) }));
  const ladder = i.ladder === false ? [] : [...new Set([...VOLUME_LADDER, i.annualVolume])].sort((a, b) => a - b);
  const years = i.programmeYears && i.programmeYears > 0 ? i.programmeYears : 5;
  const yearsAssumed = !(i.programmeYears && i.programmeYears > 0);
  const geometryQuality: 'occt' | 'stl' = i.geo.status === 'success' && (i.geo as { topology?: { available?: boolean } }).topology?.available ? 'occt' : 'stl';
  const book = regionalBook(i.baseBook, i.region, new Map());
  const fam = materialFamilyOf(i.answers, i.baseBook);

  // The rows to cost: each feasible route, split into its feasible processes where the route has several.
  const plan: Array<{ route: string; process: string | null }> = [];
  for (const route of feasible) {
    const variants = processVariants(route, i);
    if (!variants.length) { plan.push({ route, process: null }); continue; }
    for (const v of variants) {
      if (v.refusal) {
        excluded.push({ route, process: v.process, label: `${route.replace(/_/g, ' ')} — ${v.label}`,
          reasons: [{ id: 'process', label: 'Process', measured: v.refusal, limit: 'the advisor\'s own material and shape rules', pass: false, source: v.source }] });
      } else {
        plan.push({ route, process: v.process });
      }
    }
  }
  // The costing's own route is costed as the engine chose it (no process forced) — that is the reference row.
  const planned = [{ route: i.current, process: null }, ...plan.filter(p => !(p.route === i.current && p.process === null))].slice(0, MAX_COSTED_ROUTES + 4);

  const rows: RouteRow[] = [];
  for (const { route, process } of planned) {
    const screen = screens.find(s => s.route === route);
    const answers: Record<string, unknown> = { ...i.answers };
    for (const id of ROUTE_ANSWER_IDS) delete answers[id];
    const notes: string[] = [];
    if (route !== i.current) {
      // The family travels to every route (a rail answered "6063" asked machining "what is this part made of?");
      // a grade, resin, compound or laminate is bought on ONE route's scope — a ductile-iron casting grade is not a
      // forging billet, a moulding resin is not a thermoforming sheet — so off its scope it is dropped and the row
      // says the route's representative grade for the same family is costed.
      if (answers['material.family'] === undefined && fam.family && fam.family !== 'rubber' && fam.family !== 'composite') {
        answers['material.family'] = fam.family;
      }
      delete answers['material.alAlloy'];
      for (const id of MATERIAL_ANSWER_IDS) {
        const v = typeof answers[id] === 'string' ? answers[id] as string : null;
        if (!v) continue;
        const cat = i.baseBook.materials.find(m => m.id === v)?.category ?? '';
        if (!cat || !inMaterialScope(route, cat)) {
          delete answers[id];
          const same = id === 'material.resin' ? samePolymerGrade(v, route, i.baseBook) : null;
          if (same) {
            answers['material.resin'] = same.id;
            notes.push(`resin assumed: ${same.label} — the same polymer (${same.polymer}) as ${v}, in the grade this route buys`);
          } else {
            const gradeName = i.baseBook.materials.find(m => m.id === v)?.grade ?? v;
            notes.push(`${gradeName} is not bought on this route — its representative ${familyOfCategory(cat) ?? fam.family ?? ''} grade is costed`.replace(/\s+grade/, ' grade'));
          }
        }
      }
    }
    const finish = answers['service.finish'];
    if (finish !== undefined && finish !== 'none' && !FINISH_PREFIX_BY_COMMODITY[route]) {
      notes.push('the finish answered is not modelled on this route — costed bare');
    }
    if (process) {
      delete answers[CASTING_PROCESS_CHOICE_ID]; delete answers[FORGING_PROCESS_CHOICE_ID];
      answers[PROCESS_ANSWER[route]] = process;
    } else {
      // The reference row and single-process routes take the engine's own choice.
      delete answers[CASTING_PROCESS_CHOICE_ID]; delete answers[FORGING_PROCESS_CHOICE_ID];
    }
    const assumed: string[] = [];
    const before = new Set(Object.keys(answers));
    const { r, open } = await costRoute(i, route, answers, i.annualVolume, assumed);
    const assumedIds = new Set(Object.keys(answers).filter(k => !before.has(k)));
    const costed = r?.status === 'costed';
    const byVolume: RouteRow['byVolume'] = [];
    const bands = i.bands !== false;
    const band = costed && bands ? bandOf(r!, book, geometryQuality, BAND_TRIALS) : null;
    if (costed) {
      for (const v of ladder) {
        if (v === i.annualVolume) { byVolume.push({ volume: v, total: round(r!.total!), p10: band?.p10 ?? null, p90: band?.p90 ?? null, note: null }); continue; }
        const at = await costRoute(i, route, { ...answers }, v, null);
        const ok = at.r?.status === 'costed' && at.r.total != null;
        const b = ok && bands ? bandOf(at.r!, book, geometryQuality, LADDER_TRIALS) : null;
        byVolume.push({
          volume: v, total: ok ? round(at.r!.total!) : null, p10: b?.p10 ?? null, p90: b?.p90 ?? null,
          note: ok ? null : at.open.length ? `needs an answer at this volume: ${at.open.join('; ')}` : (at.r?.error ?? at.r?.code ?? 'not costed'),
        });
      }
    }
    const tooling = costed && r ? toolingOf(r) : null;
    const total = costed && r?.total != null ? round(r.total) : null;
    const toolingPerPart = costed && r?.breakdown?.tooling != null ? round(Number(r.breakdown.tooling)) : null;
    const parts = i.annualVolume * years;
    const processLabel = process ? (CASTING_PROCESS_LABEL[process] ?? FORGING_PROCESS_LABEL[process] ?? process) : null;
    rows.push({
      route, process,
      label: processLabel ? `${route.replace(/_/g, ' ')} — ${processLabel}` : route.replace(/_/g, ' '),
      commodity: r?.commodity ?? null,
      status: r?.status ?? 'error',
      total, toolingPerPart,
      breakdown: costed && r?.breakdown ? Object.fromEntries(Object.entries(r.breakdown).map(([k, v]) => [k, round(Number(v))])) : null,
      reconciles: costed && r ? reconciles(r) : null,
      audit: costed && r ? auditRow(r) : null,
      spec: specOf(answers, i.answers, assumedIds, route, i.baseBook),
      material: costed && r ? materialOf(r, i.baseBook) : null,
      tooling,
      operations: costed && r ? operationsOf(r, i.baseBook) : null,
      band,
      checks: [...(screen?.checks ?? [])],
      caveats: [...(screen?.caveats ?? [])],
      assumed,
      openQuestions: open,
      notes,
      refusal: r && (r.status === 'refused' || r.status === 'error') ? (r.error ?? r.code ?? 'refused') : null,
      byVolume,
      programme: total != null && tooling && toolingPerPart != null ? {
        parts, years, pieceExTooling: round(total - toolingPerPart),
        pieceSpend: round((total - toolingPerPart) * parts, 2), tooling: tooling.investment,
        total: round((total - toolingPerPart) * parts + tooling.investment, 2),
      } : null,
    });
  }

  // The reference row names the process the engine chose: the variant whose figures equal the reference IS the
  // reference, so it is folded in and the reference row carries that process.
  const ref = rows[0];
  if (i.referenceBand && ref.status === 'costed') {
    ref.band = { ...i.referenceBand };
    const at = ref.byVolume.find(p => p.volume === i.annualVolume);
    if (at) { at.p10 = i.referenceBand.p10; at.p90 = i.referenceBand.p90; }
  }
  // A process row the rules price with the SAME operations and tooling as the reference differs only in material
  // (yield, machining stock): the row says so, so a "cheaper" process is read as a yield effect, not a process one
  // (the hub flange's precision forging: same press, same die, same CNC minutes — 0.81 against 0.675 yield).
  for (const row of rows) {
    if (row === ref || row.route !== ref.route || !row.process || !row.operations || !ref.operations || !row.tooling || !ref.tooling) continue;
    const sameOps = row.operations.length === ref.operations.length
      && row.operations.every((op, k) => Math.abs(op.processCost - ref.operations![k].processCost) < CLOSE_GBP && Math.abs(op.labourCost - ref.operations![k].labourCost) < CLOSE_GBP);
    const sameTool = Math.abs(row.tooling.investment - ref.tooling.investment) <= 0.01 * Math.max(1, ref.tooling.investment);
    if (sameOps && sameTool) {
      row.caveats.push('the rules price this process with the same operations and tooling as the costed process; the difference is '
        + 'in the material line (yield, machining stock, per-part services such as NDT), not in the process');
    }
  }
  const kept = rows.filter(row => {
    if (row === ref) return true;
    if (row.route === ref.route && row.process && row.total != null && ref.total != null && Math.abs(row.total - ref.total) < 1e-6) {
      ref.process = row.process; ref.label = row.label;
      ref.notes.push(`${row.label.split(' — ')[1]} is the process the advisor chose for this costing`);
      return false;
    }
    // A route the rules re-price as another one already on the table is the same costing — say so on that row.
    if (!row.commodity || row.commodity === row.route) return true;
    const twin = rows.find(o => o.route === row.commodity && !o.process);
    if (!twin) return true;
    twin.notes.push(`${row.route.replace(/_/g, ' ')} was also priced: the rules choose this route at this volume`);
    return false;
  }).slice(0, MAX_COSTED_ROUTES);

  return {
    principle: COMPARISON_PRINCIPLE, rows: kept, excluded, ladder,
    crossovers: crossovers(kept, ref, ladder, i.annualVolume),
    programme: { annualVolume: i.annualVolume, years, yearsAssumed },
  };
}

/**
 * Where each alternative's cost meets the costing's own on the ladder: the volume is interpolated linearly between the
 * two re-costs either side of the sign change, and the text says so. Where the two routes' P10–P90 bands overlap the
 * routes are indistinguishable and the text says that too. No crossing on the ladder is reported as such — never
 * extrapolated. The tooling payback is read at the costing's volume.
 */
export function crossovers(rows: RouteRow[], ref: RouteRow, ladder: number[], annualVolume: number): RouteCrossover[] {
  if (!ref || !ladder.length) return [];
  const out: RouteCrossover[] = [];
  const fmtV = (v: number) => Math.round(v).toLocaleString('en-GB');
  for (const row of rows) {
    if (row === ref || row.total == null) continue;
    const pts = ladder.map(v => {
      const a = row.byVolume.find(p => p.volume === v), b = ref.byVolume.find(p => p.volume === v);
      return a?.total != null && b?.total != null ? { v, d: a.total - b.total, a, b } : null;
    }).filter((p): p is NonNullable<typeof p> => !!p);
    // Overlapping bands: the alternative's P10 below the reference's P90 and its P90 above the reference's P10.
    const overlap = pts.filter(p => p.a.p10 != null && p.a.p90 != null && p.b.p10 != null && p.b.p90 != null && p.a.p10 <= p.b.p90! && p.a.p90 >= p.b.p10!);
    const indistinguishable = overlap.length ? { from: overlap[0].v, to: overlap[overlap.length - 1].v } : null;
    // Payback at the costing's volume: more tooling, lower piece price.
    let payback: RouteCrossover['payback'] = null;
    if (row.tooling && ref.tooling && row.toolingPerPart != null && ref.toolingPerPart != null && ref.total != null) {
      const extra = row.tooling.investment - ref.tooling.investment;
      const saving = (ref.total - ref.toolingPerPart) - (row.total - row.toolingPerPart);
      if (extra > 0 && saving > 0) {
        const parts = extra / saving;
        payback = { extraTooling: round(extra, 2), pieceSaving: round(saving), parts: Math.round(parts), months: round(parts / annualVolume * 12, 1) };
      }
    }
    const base = { route: row.route, process: row.process, label: row.label, indistinguishable, payback };
    if (pts.length < 2) {
      out.push({ ...base, atVolume: null, cheaperAbove: null, text: 'not re-costed across the ladder' });
      continue;
    }
    let found: RouteCrossover | null = null;
    for (let k = 1; k < pts.length; k++) {
      const p0 = pts[k - 1], p1 = pts[k];
      if ((p0.d < 0 && p1.d > 0) || (p0.d > 0 && p1.d < 0) || p1.d === 0) {
        const v = p1.d === 0 ? p1.v : p0.v + (p1.v - p0.v) * (-p0.d) / (p1.d - p0.d);
        const cheaperAbove = p1.d < 0 || (p1.d === 0 && p0.d > 0);
        found = {
          ...base, atVolume: Math.round(v), cheaperAbove,
          text: `${cheaperAbove ? 'cheaper' : 'dearer'} than the costed route above ~${fmtV(v)} a year on the central estimate `
            + `(interpolated between re-costs at ${fmtV(p0.v)} and ${fmtV(p1.v)})`,
        };
        break;
      }
    }
    if (!found) {
      const allCheaper = pts.every(p => p.d < 0);
      found = {
        ...base, atVolume: null, cheaperAbove: null,
        text: `${allCheaper ? 'cheaper' : 'dearer'} than the costed route at every volume from ${fmtV(pts[0].v)} to ${fmtV(pts[pts.length - 1].v)} a year`,
      };
    }
    if (indistinguishable) {
      found.text += indistinguishable.from === indistinguishable.to
        ? `; at ${fmtV(indistinguishable.from)} the two bands overlap — indistinguishable there`
        : `; between ${fmtV(indistinguishable.from)} and ${fmtV(indistinguishable.to)} the two P10–P90 bands overlap — the routes are indistinguishable there`;
    }
    if (payback) {
      found.text += `; its extra £${payback.extraTooling.toLocaleString('en-GB')} of tooling is paid back by a £${payback.pieceSaving.toFixed(4)} lower piece price after ${payback.parts.toLocaleString('en-GB')} parts (${payback.months} months at ${fmtV(annualVolume)} a year)`;
    }
    out.push(found);
  }
  return out;
}

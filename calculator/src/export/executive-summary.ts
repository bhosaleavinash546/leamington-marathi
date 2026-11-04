/**
 * The executive summary of a costing — ONE model, drawn as page 2 of the PDF and the first sheet of the workbook
 * (Nov 2026, after the seven-country review: the reports were built for cost engineers; a President needs one page).
 *
 * It answers four questions about the part, each with figures the costing already produced:
 *   what does it cost       — the headline, the screen's band, the confidence grade and why
 *   where does the money go — the three largest cost lines (material, each operation, tooling, overhead, margin …)
 *   what would change it    — the three inputs whose ±10 % moves the cost most (`runSensitivity` — re-costed through the
 *                             stack), and the inputs still to confirm (unanswered questions, Low-graded rates)
 *   what can be done        — the three largest levers RE-COSTED through the stack (`rankOpportunities`, re-costed only)
 * Nothing here is new arithmetic: lines are the costing's own buckets / operation costs, movers are stack re-runs, levers
 * are stack re-runs. A renderer only formats.
 */
import type { PartCostResult, UniversalStackInput, RateLibrary, CommodityType } from '../engine/types.js';
import { runSensitivity } from '../engine/sensitivity.js';
import { confidenceWhy } from '../engine/uncertainty.js';
import { generateDFMDFA } from '../engine/dfm-dfa.js';
import { rankOpportunities } from '../engine/opportunity-ranking.js';
import { shortOperationName, isFeatureCutOperation } from '../engine/operation-names.js';
import { traceFieldLabel } from '../ui/cad-workspace.js';
import { COMMODITY_REPORT_LABELS } from '../ui/data/commodity-meta.js';
import { REGIONAL_DATA, regionalShopDefaults, deliveryTermsLine, computeRegionalComparison, alBilletMaterialFactors,
  type ManufacturingRegion, type RegionalComparisonRow } from '../engine/regional-rates.js';
import { computeRegionalComparisonExact } from '../engine/regional-comparison.js';
import { AL_ALLOY_LIST } from '../engine/al-extrusion-data.js';
import { computeUniversalStack } from '../engine/core.js';
import { computeCostUncertainty, overallConfidence } from '../engine/uncertainty.js';
import { labourRoleLabel } from '../engine/labour-roles.js';
import type { FeatureMachiningLine } from '../engine/feature-machining.js';
import { routeRowLabel, routeReferenceRow, type RouteComparisonExport } from '../ui/cad-workspace.js';
import { decisionAnswerLabel, decisionAnswerText } from './decision-text.js';
import { decisionUsedValue, type DecisionForUsed, type DecisionUsedFacts } from './decision-used.js';
import { reportNoteText, directMaterialNames } from './money-text.js';
import { reportStandardFor, dfmRuleApplies, type NotIncludedItem } from './report-standard.js';
import { toolingSplit as engineToolingSplit } from '../engine/tooling-split.js';
import { routeMaterialCheck } from '../engine/route-material-guard.js';
import { familyOfCategory } from '../engine/route-feasibility.js';
import { normaliseSeverity, SEVERITY_LABEL, SEVERITY_RANK } from '../engine/dfm-geometry/types.js';
import { serviceNotCosted } from '../engine/cost-input-rules/derive/service-questions.js';
import { compositesRouteAlert } from '../engine/cost-input-rules/commodities/composites.js';
import { ruleReportNotes, type RuleReportNotes } from '../engine/cost-input-rules/report-notes.js';
import type { RuleContext } from '../engine/cost-input-rules/types.js';
import type { CompositeProcess } from '../engine/modules/composites.js';

export interface ExecutiveLine {
  label: string; gbp: number; sharePct: number;
  /** On the material line: the metal (or resin / compound) itself, net of scrap — the index-linked part — and its share of
   *  the price, printed beside the bucket's share (fresh review, 4 Nov 2026: the stub axle's "Material 44 %" held £2.71
   *  of metal; an index clause written on 44 % over-indexes four times). `metalWord` names it. */
  metalGbp?: number; metalSharePct?: number; metalWord?: string;
}
export interface ExecutiveMover { label: string; minusGbp: number; plusGbp: number }
export interface ExecutiveLever { action: string; savingGbp: number; savingPct: number; basis: string }

export interface ExecutiveSummary {
  part: string;
  commodity: string | null;
  country: string;
  /** £ a part. */
  total: number;
  band: { p10: number; p90: number; plusMinusPct: number } | null;
  confidence: { grade: string; reason: string };
  /** What the figure assumes: volume, programme, terms, rate book. */
  basis: string[];
  /** total × annual volume, £ a year (null without an annual volume). */
  annualSpend: number | null;
  tooling: { investmentGbp: number; amortisedOver: number } | null;
  /** Where the money goes by kind of cost, largest first; the lines add to the total. */
  lines: ExecutiveLine[];
  /** The single largest operation (machine + labour) — null when the costing has none. */
  largestOperation: ExecutiveLine | null;
  /** The three inputs whose ±10 % moves the cost most, as a change in £ a part (re-costed). */
  movers: ExecutiveMover[];
  moverPct: number;
  /** What the costing assumed that someone should confirm. */
  toConfirm: string[];
  /** The three largest re-costed levers (none when nothing could be re-costed). */
  levers: ExecutiveLever[];
  /** Suggestions with only a rule-of-thumb percentage — counted, not shown. */
  leversNotRecosted: number;
  notIncluded: string[];
  /** Where each figure on the page comes from in the full report. */
  sources: string;
}

export interface ExecutiveSummaryArgs {
  result: PartCostResult;
  input: UniversalStackInput;
  library: RateLibrary;
  commodity?: CommodityType | null;
  region?: ManufacturingRegion | string | null;
  band?: { p10: number; p90: number; plusMinusPct: number } | null;
  stamp?: string | null;
  decisions?: ReadonlyArray<{ id?: string; question: string; severity: string; answer: string | null; used?: string | null; options?: DecisionForUsed['options'] }> | null;
  /** The rule values on the form — what an unanswered advisory question was costed as is read from them (decision-used.ts). */
  ruleValues?: DecisionUsedFacts['ruleValues'] | null;
  volumeProvided?: boolean;
  pkgLogisticsEstimated?: boolean;
}

const TOP = 3;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Where the money goes by KIND of cost — material, machine time, labour, tooling, overhead + margin, packaging +
 *  logistics — the costing's own buckets, so the lines add to the total exactly. (Per-operation lines left the largest
 *  three at under half the cost on a 13-operation part, with "everything else" the biggest line.) */
function costLines(result: PartCostResult, input: UniversalStackInput, library: RateLibrary): ExecutiveLine[] {
  const b = result.breakdown;
  const total = result.total > 0 ? result.total : 1;
  const grade = library.materials.find(m => m.id === input.rawMaterial.materialId)?.grade;
  const itemised = /^mat-virtual/.test(input.rawMaterial.materialId);
  const raw: Array<{ label: string; gbp: number }> = [
    { label: itemised ? 'Material (itemised lines)' : `Material${grade ? ` — ${grade}` : ''}`, gbp: b.rawMaterial },
    { label: 'Machine time (process)', gbp: b.process },
    { label: 'Direct labour', gbp: b.labour },
    { label: 'Tooling over the programme', gbp: b.tooling },
    { label: 'Overhead and supplier margin', gbp: b.overhead + b.margin },
    { label: input.deliveryTerms === 'EXW' ? 'Packaging' : 'Packaging and logistics', gbp: b.packaging + b.logistics },
  ].filter(l => l.gbp > 0.00005);
  raw.sort((a, c) => c.gbp - a.gbp);
  const metal = metalOfMaterial(result, input, library);
  return raw.map(l => ({ label: l.label, gbp: r4(l.gbp), sharePct: Math.round(l.gbp / total * 1000) / 10,
    ...(metal && l.gbp === b.rawMaterial ? { metalGbp: r4(metal.gbp), metalSharePct: Math.round(metal.gbp / total * 1000) / 10, metalWord: metal.word } : {}) }));
}

/**
 * The metal (resin, compound) inside the material bucket, net of scrap — what an index clause follows — or null when the
 * bucket is that alone or is priced by itemised lines. `word` is what to call it.
 */
export function metalOfMaterial(result: PartCostResult, input: UniversalStackInput, library: RateLibrary): { gbp: number; word: string } | null {
  if (input.rawMaterial.directCost !== undefined) return null;
  const split = materialSplit(result, input, library);
  if (!(split.metalGbp > 0) || Math.abs(split.metalGbp - result.breakdown.rawMaterial) < 0.005) return null;
  const fam = familyOfCategory(library.materials.find(m => m.id === input.rawMaterial.materialId)?.category ?? '');
  return { gbp: split.metalGbp, word: fam === 'plastic' ? 'resin' : fam === 'rubber' ? 'compound' : 'metal' };
}

/** The single largest operation (machine + labour), named as the reports name it. */
function largestOperation(result: PartCostResult): ExecutiveLine | null {
  const total = result.total > 0 ? result.total : 1;
  const ops = result.operationDetails.map(o => ({ label: shortOperationName(o.operationName), gbp: (o.processCost ?? 0) + (o.labourCost ?? 0) }));
  if (!ops.length) return null;
  const top = ops.reduce((a, o) => o.gbp > a.gbp ? o : a);
  return { label: top.label, gbp: r4(top.gbp), sharePct: Math.round(top.gbp / total * 1000) / 10 };
}

/** A sensitivity driver as a reader names it: "Labour Rate — shared by 9 ops (op, op, …)" becomes "Labour rate, shared by 9 operations". */
function moverLabel(driver: string): string {
  return driver.replace(/\s*\(.*\)\s*$/, '').replace(/ — shared by (\d+) ops?\b/, ', shared by $1 operations')
    .replace(/^Labour Rate\b/, 'Labour rate').replace(/^Machine Rate\b/, 'Machine rate');
}

export function buildExecutiveSummary(a: ExecutiveSummaryArgs): ExecutiveSummary {
  const { result, input, library } = a;
  const regionCode = String(a.region ?? library.regional?.code ?? 'UK');
  const country = (REGIONAL_DATA as Record<string, { name: string } | undefined>)[regionCode]?.name ?? regionCode;
  const annual = input.annualVolume && input.annualVolume > 0 ? input.annualVolume : null;
  const years = input.programmeYears && input.programmeYears > 0 ? input.programmeYears : null;

  // Confidence: the grade and the data behind it (uncertainty.ts — the same grade the cover and §7 print).
  const why = confidenceWhy(result);
  const lowLabels = why.lowFields.slice(0, 3).map(f => traceFieldLabel(shortOperationName(f)));
  const reason = why.total
    ? `${why.high} of ${why.total} data points are graded High, ${why.medium} Medium, ${why.low} Low`
      + (lowLabels.length ? `; the Low ones include ${lowLabels.join(', ')}` : '')
    : 'no traced data points';

  const basis = [
    `${country} — every rate from this country's own rate book${a.stamp ? ` (${a.stamp})` : ''}`,
    annual ? `${annual.toLocaleString('en-GB')} parts a year${years ? `, ${years}-year programme (${(annual * years).toLocaleString('en-GB')} parts)` : ''}` : 'No annual volume entered',
    input.deliveryTerms === 'EXW' ? 'Ex-works: the price at the supplier\'s gate, freight not included' : 'Delivered to your plant: freight included',
  ];

  // What moves it: ±10 % on each driver, the stack re-run (sensitivity.ts — §8 of the PDF prints the full table).
  let movers: ExecutiveMover[] = [];
  const moverPct = 10;
  try {
    const sens = runSensitivity(input, library, moverPct);
    movers = sens.drivers.slice(0, TOP).map(d => ({
      label: moverLabel(d.driver), minusGbp: r4(d.minusCost - result.total), plusGbp: r4(d.plusCost - result.total),
    }));
  } catch { /* a costing the sensitivity cannot vary — no movers listed */ }

  // What to confirm: open or defaulted questions, Low-graded rates, and the standing statement on accuracy.
  const toConfirm: string[] = [];
  const costedItems = [...input.operations.map(o => o.operationName), ...(input.rawMaterial.consumablesItems ?? []).map(i => i.label)];
  for (const d of a.decisions ?? []) {
    if (d.answer == null || d.answer === '') {
      const used = d.severity === 'blocking' ? null : decisionUsedValue({ ...d, id: d.id ?? '' }, { costedItems, ruleValues: a.ruleValues ?? [] });
      toConfirm.push(d.severity === 'blocking' ? `OPEN — ${d.question}` : `${d.question} — not answered${used ? `; costed as ${used}` : '; the rules\' value is used'}`);
    }
  }
  if (why.low > 0) toConfirm.push(`${why.low} rate${why.low === 1 ? ' is' : 's are'} graded Low confidence — each is listed with how to close it (Inputs to Confirm).`);
  toConfirm.push('Accuracy: this figure has not yet been compared with a price paid for this part.');

  // What can be done: re-costed levers only (opportunity-ranking.ts).
  let levers: ExecutiveLever[] = [];
  let leversNotRecosted = 0;
  if (a.commodity) {
    try {
      const safetyCritical = (a.decisions ?? []).some(d => d.id === 'service.safetyCritical' && /^yes$/i.test(String(d.answer ?? '')));
      const ctx = { region: regionCode, volumeProvided: a.volumeProvided ?? !!annual, pkgLogisticsEstimated: !!a.pkgLogisticsEstimated, library, safetyCritical };
      const ranked = rankOpportunities(generateDFMDFA(result, input, a.commodity, ctx), result.total);
      levers = ranked.all.slice(0, TOP).map(o => ({
        action: o.action, savingGbp: r4(o.savingPerPart), savingPct: o.savingPct,
        basis: (o.recostBasis ?? '').split(' \u2192 ')[0],
      }));
      leversNotRecosted = ranked.notRecostedCount;
    } catch { /* no DFM / lever model for this commodity */ }
  }

  const tl = input.tooling;
  const tooling = tl.totalToolingCost > 0 && tl.mode !== 'one_time_nre'
    ? { investmentGbp: r4(tl.totalToolingCost), amortisedOver: Math.round(tl.amortizationVolume) } : null;
  const notIncluded = [
    ...(input.deliveryTerms === 'EXW' ? ['Freight to your plant (the price is ex-works)'] : []),
    'Import duty, customs and cross-border shipping',
    ...(tl.totalToolingCost > 0 && tl.mode === 'one_time_nre' ? ['Tooling — charged once, separately'] : []),
  ];

  return {
    part: result.partName,
    commodity: a.commodity ? (COMMODITY_REPORT_LABELS[a.commodity] ?? String(a.commodity).replace(/_/g, ' ')) : null,
    country,
    total: result.total,
    band: a.band ? { p10: a.band.p10, p90: a.band.p90, plusMinusPct: a.band.plusMinusPct } : null,
    confidence: { grade: why.grade, reason },
    basis,
    annualSpend: annual ? r4(result.total * annual) : null,
    tooling,
    lines: costLines(result, input, library),
    largestOperation: largestOperation(result),
    movers,
    moverPct,
    toConfirm,
    levers,
    leversNotRecosted,
    notIncluded,
    sources: 'Every figure here is in the full report: the cost lines in the cost breakdown and operations, the band in the '
      + 'uncertainty section, the movers in the sensitivity table, the levers in the cost-reduction table.',
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  THE CORE SHOULD-COST REPORT (report standard, Nov 2026 — docs/review/report-standard-2026-11/README.md §3)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// ONE model, drawn by the core PDF (core-report-pdf.ts, 7 pages) and the workbook's first sheet. Every figure is the
// costing's own or an engine re-run (the sensitivity, the levers, the piece price without tooling, the country rows);
// the model adds only sums, shares and the capacity count, and states each one's formula where it prints it.
//
// Money in TEXT is written in £ ("£1.63 a part") and converted by the renderer (the PDF's `hardenPdfText`, the
// workbook's per-cell `localiseGbpText`): a bare number beside a "(£)" label is never printed — a China report read
// "Cores 1.6293 (Core Cost/Part (¥))" against ¥14.47 on the page before (fresh review N1, 3 Nov 2026).

/** The parts of the CAD report metadata the core report reads (structurally the same as pdf.ts's CADReportMeta). */
export interface CoreReportMeta {
  routeComparison?: RouteComparisonExport | null;
  stamp?: string | null;
  uncertainty?: { p10: number; p90: number; plusMinusPct: number } | null;
  volumeProvided?: boolean;
  pkgLogisticsEstimated?: boolean;
  geometrySource?: 'occt' | 'stl_parser' | 'text_parsing' | null;
  measuredWeightKg?: number | null;
  featureLines?: FeatureMachiningLine[] | null;
  featureLinesInCost?: boolean;
  featureMachineRatePerHr?: number | null;
  featureMachineOee?: number | null;
  featureTurningOp?: string | null;
  geometricDFM?: {
    grouped: Array<{ ruleId: string; severity: string; title: string; count: number; totalCostGBP?: number; recommendation: string;
      worst?: { detail?: string } }>;
    limitations: string[];
  } | null;
  geometricDFMAmounts?: Record<string, { text: string; basis?: string }> | null;
  geometricDFMPending?: boolean;
  annualVolume?: number | null;
  checks?: {
    decisions: Array<{ id: string; question: string; severity: 'blocking' | 'advisory'; answer: string | null; used?: string | null;
      /** The question's options: the one marked `costed` is what an unanswered advisory was costed as. */
      options?: DecisionForUsed['options'] }>;
    ruleValues?: Array<{ label: string; value: string; ruleValue?: string; basis: string; source?: string; edited?: boolean; fieldId?: string }>;
  } | null;
  /** The rules' context of the costing (geometry, answers, volume), when the caller has it: a commodity's own "not
   *  costed" list and route alert are read from it (composites: `compositesNotCosted` / `compositesAlert`). */
  ruleContext?: RuleContext | null;
  /** The same notes as the server read them off its rule context (the CAD response's `reportNotes`) — what the browser
   *  has, since it never holds a RuleContext. Used when `ruleContext` is absent, and only for the commodity they were
   *  made for. */
  reportNotes?: RuleReportNotes | null;
}

export interface CoreReportArgs {
  result: PartCostResult;
  input: UniversalStackInput;
  library: RateLibrary;
  commodity?: CommodityType | null;
  region?: ManufacturingRegion | string | null;
  cadMeta?: CoreReportMeta | null;
  /** The UK-basis book the country was rebuilt from (the country rows re-cost the part in each country). */
  baseLibrary?: RateLibrary;
  /** The screen's country rows — printed as they are when given. */
  regionalRows?: RegionalComparisonRow[];
  /** The report currency (units per £) and its symbol: money the model writes into TEXT (alerts, the verdict, the
   *  re-add parts) is converted from the exact £ here, never pre-rounded in £ and converted after (¥0.04 drift). */
  fx?: number;
  sym?: string;
}

export type ToolingKind = 'initial' | 'replacement' | 'perishable' | 'unsplit';
export interface CoreToolingRow {
  label: string;
  gbp: number;
  /** £ of this item that is the first set (the up-front investment), replacements, perishables, or not split. */
  initialGbp: number; replacementGbp: number; perishableGbp: number; unsplitGbp: number;
  /** How the split was read: a structured `kind` on the item, or what its label states. */
  basis: 'structured' | 'as labelled' | 'not itemised';
}
export interface CoreTooling {
  mode: 'amortized' | 'one_time_nre';
  totalGbp: number;
  amortisationVolume: number;
  rows: CoreToolingRow[];
  initialGbp: number; replacementGbp: number; perishableGbp: number; unsplitGbp: number;
  /** (replacements + perishables) ÷ the amortisation volume, £ a part before overhead and margin. */
  replacementPerPartGbp: number;
  /** The tooling bucket, £ a part. */
  bucketPerPartGbp: number;
}

/**
 * The price as a supplier quotes it (fresh review N2): a piece price with the RUNNING tooling inside it (replacement sets
 * and perishable tools are consumed with the parts) plus the UP-FRONT tooling as a lump sum. The piece price is the stack
 * re-run with only the running tooling; the lump sum's share of the headline is what is left, so
 * piece price + lump sum ÷ amortisation volume × its overhead and margin = the headline, exactly.
 */
export interface CorePrice {
  mode: 'amortized' | 'one_time_nre' | 'none';
  pieceAsQuotedGbp: number;
  /** First sets + NRE (fixtures, programming, masters); a tooling figure that is not split is counted here. */
  upfrontGbp: number;
  /** The up-front tooling's share of the headline, a part, with its overhead and margin (headline - piece as quoted). */
  upfrontPerPartGbp: number;
  /** upfrontPerPart ÷ (upfront ÷ amortisation volume): the overhead and margin the amortised tooling carries. */
  upfrontFactor: number | null;
  amortisationVolume: number;
  /** Replacement and perishable tooling a part, with overhead and margin (piece as quoted - the piece with no tooling). */
  runningPerPartGbp: number;
  /** Cutting-tool wear the costing carries as a consumable in material (bucket 1), before overhead and margin. */
  toolWearInMaterialGbp: number;
  /** A not-split tooling figure was counted as up-front. */
  unsplitCountedUpfront: boolean;
}

export interface CoreMaterialLine { group: 'metal' | 'direct' | 'consumable' | 'energy' | 'boughtIn'; label: string; gbp: number; note?: string }
export interface CoreUnsourcedItem { label: string; value: string; basis: string; gbp: number | null; drives: string[] }
export interface CoreAlert { kind: 'blocking' | 'route' | 'scope'; title: string; lines: string[] }
export interface CoreOperation {
  name: string; machine: string; bench: boolean; cycleMin: number; partsPerCycle: number;
  /** OEE the machine time is divided by (null on a bench operation). */
  oee: number | null;
  /** Crew on the operation as entered, and the crew the labour line CHARGES (crew × labour time ÷ cycle). */
  crew: number; crewCharged: number;
  labourEfficiency: number;
  machinePerHr: number | null;
  /** Labour £ an hour of cycle: labour rate × crew charged ÷ labour efficiency. */
  labourPerHr: number;
  /** machine £/h ÷ OEE + labour £/h: × cycle ÷ 60 ÷ parts a cycle = A part. */
  ratePerHr: number;
  gbp: number;
}
export interface CoreCapacityRow { machine: string; operations: number; hoursPerYear: number; availableHours: number; machines: number; line: boolean }
export interface CoreParam { name: string; label: string; value: string; display: string; basis: string; question: string }
export interface CoreRouteRow {
  name: string; total: number; deltaGbp: number; deltaPct: number; band: { p10: number; p90: number; plusMinusPct: number } | null;
  /** The FIRST SET (up-front tooling), as page 1 defines the investment — not the programme total. */
  toolingGbp: number | null;
  /** Tooling over the programme (first sets + replacements + perishables). */
  toolingProgrammeGbp: number | null;
  note: string | null;
}
export interface CoreCountryRow { name: string; total: number; vsBasePct: number; isBase: boolean; approx: boolean }
export interface CoreDfmFinding { ruleId: string; severity: string; title: string; count: number; amount: string | null; fix: string }
/** Cast + machine / forge + machine: the two prices a buyer is quoted (fresh review N23). */
export interface CoreFormMachineSplit {
  form: 'Casting' | 'Forging';
  /** Ex-foundry / ex-forge, a part, with its overhead and margin. */
  formGbp: number;
  kg: number;
  kgLabel: string;
  formPerKg: number;
  machiningGbp: number;
  /** The machining's direct cost before overhead and margin, and what it is made of. */
  machiningDirectGbp: number;
  machiningParts: string[];
}

export interface CoreReport {
  exec: ExecutiveSummary;
  part: string;
  commodity: string | null;
  commodityId: string | null;
  country: string;
  region: string;
  stamp: string | null;
  total: number;
  /** One line at the top of page 1: the price, the confidence and what to ask first (£ in text, converted by the renderer). */
  verdict: string;
  annualVolume: number | null;
  programmeYears: number | null;
  annualSpend: number | null;
  /** The stack re-run with no tooling: the tooling's own overhead and margin come out with it. */
  pieceExToolingGbp: number;
  price: CorePrice;
  tooling: CoreTooling;
  band: { p10: number; p90: number; plusMinusPct: number } | null;
  bandNote: string;
  confidence: {
    /** Graded on the DISTINCT inputs printed (the same thresholds as `overallConfidence`). */
    grade: string;
    /** The screen's grade (every traced row) — kept for the audit pack, never printed beside `grade`; `gradeNote` says why
     *  the grade is capped (a BLOCKING DFM finding), null otherwise. */
    screenGrade: string;
    gradeNote: string | null;
    /** Distinct inputs (a rate shared by 9 operations counts once), by grade. */
    distinct: { total: number; high: number; medium: number; low: number };
    lowInputs: Array<{ label: string; value: number; unit: string; operations: number }>;
    sentence: string;
  };
  /** `ruleBasis` false: the costing carries no rule values (not a CAD costing), so the form's inputs are not graded. */
  unsourced: {
    items: CoreUnsourcedItem[]; totalGbp: number; sharePct: number; method: string; ruleBasis: boolean;
    /** Overhead, margin and packaging that are CostVision defaults — NOT in the share above, stated beside it. */
    defaults: Array<{ label: string; gbp: number }>;
    defaultsGbp: number;
    defaultsNote: string;
  };
  alerts: CoreAlert[];
  openQuestions: string[];
  notIncluded: string[];
  /** Costs the model does not carry that a supplier will charge (a gap in the cost model, not a scope item). */
  notModelled: string[];
  terms: string;
  /** The 8 buckets; the material one carries its metal (net of scrap) £ and share of the price (`metalOfMaterial`). */
  buckets: Array<{ label: string; gbp: number; sharePct: number; metalGbp?: number; metalSharePct?: number; metalWord?: string }>;
  material: { lines: CoreMaterialLine[]; metalGbp: number; consumablesGbp: number; energyGbp: number; boughtInGbp: number; totalGbp: number };
  /** ONE weight set for a casting or forging, labelled the same on every page (`formWeights`), or null. */
  weights: CoreWeights | null;
  perKg: { kg: number; kgLabel: string; pricePerKg: number; metalPerKg: number } | null;
  formMachine: CoreFormMachineSplit | null;
  commercial: Array<{ label: string; value: string; source: string }>;
  spec: Array<{ question: string; answer: string }>;
  operations: CoreOperation[];
  capacity: { formula: string; rows: CoreCapacityRow[]; warnings: string[] } | null;
  keyParams: CoreParam[];
  sensitivity: Array<{ label: string; base: number; unit: string; minusGbp: number; plusGbp: number }>;
  sensitivityPct: number;
  /** Movers left out: < 0.5 % of the price either way, or a zero base (nothing to vary). */
  sensitivityDropped: number;
  volumeLine: string | null;
  negotiation: Array<{ driver: string; ours: string; question: string }>;
  quoteBreakdown: string[];
  levers: ExecutiveLever[];
  routes: { reference: string; rows: CoreRouteRow[]; notShown: number; principle: string } | null;
  countries: { rows: CoreCountryRow[]; note: string; basis: string };
  dfm: { findings: CoreDfmFinding[]; considered: number; notChecked: string; status: 'ran' | 'pending' | 'not run' };
}

/** Labels that say a value has no source: "not sourced", "engineering-typical", a heuristic, a HELD figure, an ESTIMATE. */
const UNSOURCED_RE = /not sourced|engineering[- ]typical|heuristic|\bheld\b/i;
const ESTIMATE_RE = /\bESTIMATE\b/;
export const isUnsourcedText = (t: string) => UNSOURCED_RE.test(t) || ESTIMATE_RE.test(t);
/** Operations that are not the primary forming / moulding step (a crew or a cycle rule drives the primary step). */
const SECONDARY_OP_RE = /trim|deflash|inspect|\bndt\b|\bndi\b|fettl|blast|set-?up|change|load|pallet|deburr|wash|heat|machin|drill|bor(e|ing)\b|turn|mill|grind|cut-to|\bsaw|ageing|age\b|melt|pack|descale|c-scan|gauge|cure oven|post-?cure/i;
/** More machines than this for ONE part is a dedicated line — CostVision engineering heuristic, not sourced. */
export const CAPACITY_DEDICATED_LINE = 5;
/** A mover below this share of the price either way is not printed among the top movers. */
const MOVER_MIN_SHARE = 0.005;

type ToolFamily = 'tool' | 'fixture' | 'programming' | 'inspection';
interface CostLine { id: string; label: string; gbp: number; text: string; family?: ToolFamily; kind?: 'initial' | 'replacement' | 'perishable' }

/** What a tooling item is: a die / mould / pattern / cutter, a fixture, the programming, or inspection equipment. */
function toolFamily(label: string): ToolFamily {
  if (/fixture/i.test(label)) return 'fixture';
  if (/\bprogramming\b|\bCAM\b|prove-?out|\(NRE\)/i.test(label)) return 'programming';
  if (/inspection master|first[- ]article|\bgauges?\b|\bCMM\b|\bmasters?\b/i.test(label)) return 'inspection';
  return 'tool';
}

/** The cost lines a rule value can drive, each a £ a part before overhead and margin. */
function costLinesOf(result: PartCostResult, input: UniversalStackInput): {
  consumables: CostLine[]; energy: CostLine[]; ops: Array<{ i: number; name: string; bench: boolean; process: CostLine; labour: CostLine }>; tooling: CostLine[];
} {
  const rm = input.rawMaterial;
  const consumables: CostLine[] = (rm.consumablesItems ?? []).map((c, i) => ({ id: `cons:${i}`, label: c.label, gbp: c.gbp, text: c.label }));
  const energy: CostLine[] = result.traceability.filter(t => /^rawMaterial\.energyKwh\./.test(t.field))
    .map((t, i) => ({ id: `energy:${i}`, label: traceFieldLabel(t.field), gbp: t.value, text: t.rateSource }));
  const ops = result.operationDetails.map((o, i) => ({
    i, name: o.operationName, bench: !!o.benchOperation,
    process: { id: `op:${i}:p`, label: `${shortOperationName(o.operationName)} (machine)`, gbp: o.processCost, text: o.operationName },
    labour: { id: `op:${i}:l`, label: `${shortOperationName(o.operationName)} (labour)`, gbp: o.labourCost, text: o.operationName },
  }));
  // Each tooling item a part, split by KIND (first set / replacements / perishables): a life drives the replacements, a
  // price the sets it buys. The stub axle's £0.71 of pattern replacements was attributed to "Programming NRE" because
  // "over the programme" matched /program/ (fresh review N3).
  const tl = input.tooling;
  const vol = tl.mode === 'amortized' && tl.amortizationVolume > 0 ? tl.amortizationVolume : 0;
  const tooling: CostLine[] = [];
  if (vol) {
    const items = tl.items?.length ? tl.items : [{ label: 'Tooling (not itemised)', gbp: tl.totalToolingCost }];
    items.forEach((t, i) => {
      const s = splitToolingItem(t);
      const name = t.label.split(':')[0].split(' (')[0].split(' — ')[0];
      const family = toolFamily(t.label);
      for (const [kind, g] of [['initial', s.initialGbp], ['replacement', s.replacementGbp], ['perishable', s.perishableGbp]] as const) {
        if (!(g > 0)) continue;
        const word = kind === 'initial' ? (family === 'tool' ? 'first set' : 'up front') : kind === 'replacement' ? 'replacements' : 'perishable';
        tooling.push({ id: `tool:${i}:${kind}`, label: `${name} (${word}) a part`, gbp: g / vol, text: t.label, family, kind });
      }
    });
  }
  return { consumables, energy, ops, tooling };
}

/** Which cost lines a rule value drives, matched by name; null = it moves the whole cost (yield, scrap, OEE, batch …). */
function attributeRule(key: string, c: ReturnType<typeof costLinesOf>): CostLine[] | null {
  const cons = (re: RegExp) => c.consumables.filter(l => re.test(l.text));
  const opsAll = (re: RegExp) => c.ops.filter(o => re.test(o.name)).flatMap(o => [o.process, o.labour]);
  const tools = (families: ToolFamily[], kinds?: Array<CostLine['kind']>) =>
    c.tooling.filter(l => families.includes(l.family!) && (!kinds || kinds.includes(l.kind)));
  const casting = /^cam[\s-]|cast/i.test(key);
  // A casting's primary step is the moulding / pouring — never the fettling cell, whose name says "40 s a casting" (fresh
  // review, 4 Nov 2026: the bracket's "Moulding line rate" drove £0.48 on page 4 = moulding £0.04 + fettling £0.44).
  const primary = c.ops.filter(o => !o.bench && (casting ? /cast|mould|pour/i.test(o.name) && !SECONDARY_OP_RE.test(o.name) : !SECONDARY_OP_RE.test(o.name)));
  const nonEmpty = (ls: CostLine[]) => (ls.length ? ls : null);
  // A value that moves the whole cost is listed without a figure — "Reject Rate" was given £ because " rate" matched the
  // cycle pattern below (fresh review N3).
  if (/yield|reject|scrap|\boee\b|efficien|batch|utili[sz]|weight|[\s-]wt\b/i.test(key) && !/set[\s-]?up/i.test(key)) return null;
  if (/\bcores?\b|sand[\s-]?core/i.test(key)) return nonEmpty(cons(/\bcores?\b/i));
  if (/blast/i.test(key)) return nonEmpty([...cons(/blast/i), ...opsAll(/blast/i)]);
  if (/\bndt\b|\bndi\b|inspect/i.test(key)) return nonEmpty([...cons(/\bndt\b|\bndi\b|inspect|x-?ray|magnetic|\bmpi\b/i), ...opsAll(/\bndt\b|\bndi\b|inspect|c-scan|ultrason/i)]);
  if (/tool[\s-]?wear/i.test(key)) return nonEmpty(cons(/tool[\s-]?wear/i));
  if (/heat[\s-]?treat|ht[\s-]?cost|carburi|normalis/i.test(key)) return nonEmpty([...cons(/heat|normalis|carburi|temper|quench|anneal/i), ...opsAll(/heat treat|normalis|carburi|temper|quench|anneal/i)]);
  if (/descale/i.test(key)) return nonEmpty([...cons(/descale|scale/i), ...opsAll(/descale/i)]);
  if (/fettl/i.test(key)) return nonEmpty(opsAll(/fettl/i));
  if (/deflash/i.test(key)) return nonEmpty(opsAll(/deflash/i));
  if (/trim/i.test(key)) return nonEmpty(opsAll(/trim|router|waterjet/i));
  if (/lay[\s-]?up/i.test(key)) return nonEmpty(opsAll(/lay[\s-]?up/i));
  if (/cure[\s-]?time/i.test(key)) return nonEmpty(opsAll(/cure|autoclave|oven/i));
  // the set-up / change-over operation ("Machining Setup (amortised)", "Machining change-over, amortised", a die or mould
  // change) — not the twin-pallet cell's "Pallet change", which the pallet-change time drives, not the set-up time
  if (/set[\s-]?up[\s-]?time|setup[\s-]?hr|die[\s-]?chg|change[\s-]?over/i.test(key)) return nonEmpty(opsAll(/set-?up|change/i).filter(l => !/^pallet change/i.test(l.label)));
  if (/fixture|mach[\s-]?tooling/i.test(key)) return nonEmpty(tools(['fixture']));
  if (/\bprog(ramming)?\b|prog[\s-]?nre|-prog/i.test(key)) return nonEmpty(tools(['programming']));
  // a tool's LIFE drives how many replacement sets are bought; its PRICE drives every set
  if (/(die|mould|mold|tool|pattern)[\s-]?life|\blife\b/i.test(key)) return nonEmpty(tools(['tool'], ['replacement', 'perishable']));
  if (/tools in service|comp[\s-]?tools$/i.test(key)) return nonEmpty(tools(['tool'], ['initial']));
  if (/(die|mould|mold|tool|pattern|mandrel)[\s-]?(cost|price)|pattern/i.test(key)) return nonEmpty(tools(['tool']));
  if (/manning|crew/i.test(key)) return nonEmpty(primary.map(o => o.labour));
  if (/cycle|[\s-]ct\b|^ct\b|heat\b|cool|\bfill\b|\bpack\b|eject|blow[\s-]?t\b|open[\s-]?close|\bspm\b|strokes|index|[\s-]rate\b|\bload\b|parison/i.test(key)) return nonEmpty(primary.flatMap(o => [o.process, o.labour]));
  if (/kwh|energy|furnace/i.test(key)) return nonEmpty(c.energy);
  if (/press|[\s-]mach\b|machine/i.test(key)) return nonEmpty(primary.map(o => o.process));
  return null;
}

/** A tooling item split into first set / replacements / perishables, from its structured kind or its label. */
export function splitToolingItem(item: { label: string; gbp: number; kind?: 'initial' | 'replacement' | 'perishable' | 'nre' }): CoreToolingRow {
  const row = (initial: number, replacement: number, perishable: number, basis: CoreToolingRow['basis']): CoreToolingRow =>
    ({ label: item.label, gbp: item.gbp, initialGbp: initial, replacementGbp: replacement, perishableGbp: perishable, unsplitGbp: 0, basis });
  const g = item.gbp;
  // 'nre' (fixtures, programming, first article, masters) is up front, with the first set (types.ts ToolingKind)
  if (item.kind === 'initial' || item.kind === 'nre') return row(g, 0, 0, 'structured');
  if (item.kind === 'replacement') return row(0, g, 0, 'structured');
  if (item.kind === 'perishable') return row(0, 0, g, 'structured');
  const l = item.label;
  // "£10,003 a set (the up-front investment) × 174.66 sets worn out over the programme"
  const aSet = /£\s?([\d,]+(?:\.\d+)?) a set\b/i.exec(l);
  if (aSet) { const one = Math.min(g, Number(aSet[1].replace(/,/g, ''))); return row(one, g - one, 0, 'as labelled'); }
  // "Pattern equipment: 65 set(s) (life 16,000 castings each …)"
  const sets = /(\d[\d,]*(?:\.\d+)?)\s+set\(s\)/i.exec(l);
  if (sets) { const n = Number(sets[1].replace(/,/g, '')); if (n > 1) return row(g / n, g - g / n, 0, 'as labelled'); return row(g, 0, 0, 'as labelled'); }
  if (/tools? in service/i.test(l)) return row(g, 0, 0, 'as labelled');
  if (/replace|as (it|they) wears?|worn out/i.test(l)) return row(0, g, 0, 'as labelled');
  if (/\bwear\b/i.test(l)) return row(0, 0, g, 'as labelled');
  return row(g, 0, 0, 'as labelled');
}

function toolingSplit(input: UniversalStackInput, result: PartCostResult): CoreTooling {
  const tl = input.tooling;
  const rows: CoreToolingRow[] = (tl.items ?? []).map(i => splitToolingItem(i));
  const itemised = rows.reduce((s, r) => s + r.gbp, 0);
  const rest = tl.totalToolingCost - itemised;
  if (rest > 0.5) rows.push({ label: rows.length ? 'Tooling not itemised' : 'Tooling over the programme (not itemised)', gbp: rest,
    initialGbp: 0, replacementGbp: 0, perishableGbp: 0, unsplitGbp: rest, basis: 'not itemised' });
  const sum = (k: 'initialGbp' | 'replacementGbp' | 'perishableGbp' | 'unsplitGbp') => rows.reduce((s, r) => s + r[k], 0);
  const vol = tl.amortizationVolume > 0 ? tl.amortizationVolume : 1;
  // Every item kinded by its module: the engine's own split (up front = initial + nre). Older items without a kind fall
  // back to what their labels state.
  const kinded = (tl.items?.length ?? 0) > 0 && tl.items!.every(i => !!i.kind);
  const es = kinded ? engineToolingSplit(tl) : null;
  const initial = es ? es.initial + es.nre : sum('initialGbp');
  const replacement = es ? es.replacement : sum('replacementGbp');
  const perishable = es ? es.perishable : sum('perishableGbp');
  const unsplit = es ? es.unclassified : sum('unsplitGbp');
  return {
    mode: tl.mode, totalGbp: tl.totalToolingCost, amortisationVolume: tl.amortizationVolume, rows,
    initialGbp: initial, replacementGbp: replacement, perishableGbp: perishable, unsplitGbp: unsplit,
    replacementPerPartGbp: tl.mode === 'amortized' ? (replacement + perishable) / vol : 0,
    bucketPerPartGbp: result.breakdown.tooling,
  };
}

/** Cutting-tool wear carried as a consumable (in material): a perishable tool, wherever the costing put it. */
const TOOL_WEAR_RE = /tool[\s-]?wear|cutting[\s-]?tool|\binserts?\b/i;

/** The piece price as quoted and the up-front tooling (see CorePrice). */
export function quotedPrice(result: PartCostResult, input: UniversalStackInput, library: RateLibrary, tooling: CoreTooling, pieceExTooling: number): CorePrice {
  const tl = input.tooling;
  const toolWear = (input.rawMaterial.consumablesItems ?? []).filter(i => TOOL_WEAR_RE.test(i.label)).reduce((s, i) => s + i.gbp, 0);
  const base = { toolWearInMaterialGbp: toolWear, unsplitCountedUpfront: false };
  if (!(tl.totalToolingCost > 0)) {
    return { ...base, mode: 'none', pieceAsQuotedGbp: result.total, upfrontGbp: 0, upfrontPerPartGbp: 0, upfrontFactor: null, amortisationVolume: tl.amortizationVolume, runningPerPartGbp: 0 };
  }
  if (tl.mode !== 'amortized') {
    return { ...base, mode: 'one_time_nre', pieceAsQuotedGbp: result.total, upfrontGbp: tl.totalToolingCost, upfrontPerPartGbp: 0, upfrontFactor: null, amortisationVolume: tl.amortizationVolume, runningPerPartGbp: 0 };
  }
  const running = tooling.replacementGbp + tooling.perishableGbp;
  const upfront = Math.max(0, tl.totalToolingCost - running);
  let piece = result.total - (upfront / tl.amortizationVolume);
  try { piece = computeUniversalStack({ ...input, tooling: { ...tl, totalToolingCost: running } }, library).total; } catch { /* keep the bucket difference */ }
  const upPerPart = result.total - piece;
  return {
    ...base, mode: 'amortized', pieceAsQuotedGbp: piece, upfrontGbp: upfront, upfrontPerPartGbp: upPerPart,
    upfrontFactor: upfront > 0 ? upPerPart / (upfront / tl.amortizationVolume) : null,
    amortisationVolume: tl.amortizationVolume, runningPerPartGbp: piece - pieceExTooling,
    unsplitCountedUpfront: tooling.unsplitGbp > 0.5,
  };
}

/** The material bucket split into metal (index-linked) / consumables & bought services / energy / bought-in — adds to bucket 1. */
export function materialSplit(result: PartCostResult, input: UniversalStackInput, library: RateLibrary): CoreReport['material'] {
  const rm = input.rawMaterial;
  const lines: CoreMaterialLine[] = [];
  let metal = 0;
  if (rm.directCost !== undefined) {
    metal = rm.directCost;
    // what the line IS, not which code priced it ("Material priced by the commodity module", live run 3 Nov 2026)
    const names = directMaterialNames(rm.lines);
    lines.push({ group: 'direct', label: names ? `Material: ${names}${/itemised lines$/.test(names) ? '' : ' build-up'} (see the material lines)` : 'Material: a supplied figure (not weight × price per kg)', gbp: metal });
  } else {
    const mat = library.materials.find(m => m.id === rm.materialId);
    const gross = rm.materialUtilization > 0 ? rm.netWeightKg / rm.materialUtilization : rm.netWeightKg;
    const price = mat?.pricePerKg ?? 0;
    const ov = rm.scrapRecoveryPricePerKgOverride;
    const scrapPrice = ov !== undefined && Number.isFinite(ov) && ov >= 0 ? ov : (mat?.scrapRecoveryPricePerKg ?? 0);
    const credit = rm.lossIsNotScrap ? 0 : (gross - rm.netWeightKg) * scrapPrice;
    metal = gross * price - credit;
    lines.push({ group: 'metal', label: `${mat?.grade ?? 'Material'}: ${gross.toFixed(3)} kg bought × £${price.toFixed(4)}/kg`, gbp: gross * price });
    if (credit > 0) lines.push({ group: 'metal', label: `Scrap credit: ${(gross - rm.netWeightKg).toFixed(3)} kg × £${scrapPrice.toFixed(4)}/kg`, gbp: -credit });
    else if (rm.lossIsNotScrap && gross > rm.netWeightKg) lines.push({ group: 'metal', label: `No scrap credit: the ${(gross - rm.netWeightKg).toFixed(3)} kg is metal lost, not scrap sold`, gbp: 0 });
  }
  const cons = rm.consumablesCostPerPart && rm.consumablesCostPerPart > 0 ? rm.consumablesCostPerPart : 0;
  if (cons > 0) {
    const items = rm.consumablesItems ?? [];
    const itemised = items.reduce((s, i) => s + i.gbp, 0);
    for (const i of items) lines.push({ group: 'consumable', label: i.label.replace(/^./, ch => ch.toUpperCase()), gbp: i.gbp });
    if (Math.abs(cons - itemised) > 0.00005) lines.push({ group: 'consumable', label: items.length ? 'Consumables not itemised' : 'Consumables (the commodity does not itemise them)', gbp: cons - itemised });
  }
  let energy = 0;
  for (const t of result.traceability.filter(x => /^rawMaterial\.energyKwh\./.test(x.field))) {
    energy += t.value;
    const kwh = /^([\d.]+) kWh/.exec(t.rateSource)?.[1];
    lines.push({ group: 'energy', label: `${traceFieldLabel(t.field)}${kwh ? `: ${Number(kwh).toFixed(2)} kWh` : ''}`, gbp: t.value });
  }
  const bought = Math.max(0, rm.boughtIn?.cost ?? 0);
  if (bought > 0) lines.push({ group: 'boughtIn', label: 'Bought-in components (their supplier\'s price)', gbp: bought });
  return { lines, metalGbp: metal, consumablesGbp: cons, energyGbp: energy, boughtInGbp: bought, totalGbp: metal + cons + energy + bought };
}

/** A machine that runs as one LINE (a moulding line, a carousel, a press line): a second one is a second line. */
const LINE_RE = /\bline\b|carousel|transfer press|tandem/i;

/** Machines implied at the annual volume: Σ annual × cycle ÷ parts a cycle ÷ OEE over the operations on a machine, ÷ its annual hours. */
export function capacityImplied(input: UniversalStackInput, library: RateLibrary, annual: number): CoreCapacityRow[] {
  const by = new Map<string, CoreCapacityRow>();
  for (const op of input.operations) {
    if (op.benchOperation || !(op.cycleTimeHr > 0)) continue;
    const m = library.machines.find(x => x.id === op.machineId);
    const avail = m?.buildup?.annualAvailableHours ?? 0;
    if (!m || !(avail > 0)) continue;
    const hrs = annual * op.cycleTimeHr / (op.partsPerCycle > 0 ? op.partsPerCycle : 1) / (op.oee > 0 ? op.oee : 1);
    const row = by.get(m.id) ?? { machine: m.machineClass, operations: 0, hoursPerYear: 0, availableHours: avail, machines: 0, line: LINE_RE.test(m.machineClass) };
    row.operations += 1; row.hoursPerYear += hrs; row.machines = row.hoursPerYear / avail;
    by.set(m.id, row);
  }
  return [...by.values()].sort((a, b) => b.machines - a.machines);
}

/** What the capacity rows call for a remark on: a dedicated line (> 5 machines) or one line over 100 % loaded. */
export function capacityWarnings(rows: CoreCapacityRow[], annual: number): string[] {
  const out: string[] = [];
  let dedicated = false;
  for (const r of rows) {
    if (r.line && r.machines > 1) {
      out.push(`${r.machine} loaded ${(r.machines * 100).toFixed(0)} % at ${annual.toLocaleString('en-GB')} a year on its ${r.availableHours.toLocaleString('en-GB')} h: one line cannot make the volume — a second line, more shifts or a faster cycle; ask the supplier which.`);
    } else if (r.machines > CAPACITY_DEDICATED_LINE) {
      dedicated = true;
      out.push(`${r.machines.toFixed(1)} × ${r.machine} for this one part: a supplier would run a dedicated line or transfer cell at this volume.`);
    }
  }
  if (dedicated) out.push(`The cycle times are the costing's — machining minutes are engineering-typical and conservative; confirm with a supplier cycle sheet (more than ${CAPACITY_DEDICATED_LINE} machines for one part: CostVision engineering heuristic, not sourced).`);
  return out;
}

/** The confidence grade of a set of graded inputs — the same thresholds as `overallConfidence` (uncertainty.ts). */
export function gradeOfCounts(high: number, medium: number, low: number): 'High' | 'Medium' | 'Low' {
  const n = high + medium + low;
  if (!n) return 'Medium';
  if (low / n >= 0.4) return 'Low';
  if (high / n >= 0.7) return 'High';
  return (high + medium / 2) / n >= 0.45 ? 'Medium' : 'Low';
}

const ruleKey = (r: { label: string; fieldId?: string }) => `${r.label} ${r.fieldId ?? ''}`.trim();
/** A form field's label without its hints: "Mould / Die Cost (£, 0=estimate)" gives "Mould / Die Cost". */
/**
 * A form label as the screen's DOM gives it, without its info glyph and the hint after it: "NDT (£/part) ⓘ",
 * "Blank Material (£/part) ℹ", "Die Life (shots) ⓘ — affects total die cost". The glyph sat after the unit, so the unit
 * was never read and a China report printed "NDT 0.1341" for £0.1341 (¥1.19) and "Machining fixtures 4,270" for ¥37,918
 * (fresh review, 4 Nov 2026).
 */
export function formLabelCore(label: string): string {
  return String(label ?? '').replace(/\s*[ⓘℹ][\s\S]*$/u, '').trim();
}

export function cleanFieldLabel(label: string): string {
  let s = formLabelCore(label);
  for (let k = 0; k < 3 && /\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/.test(s); k++) s = s.replace(/\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/, '').trim();
  return s || label.trim();
}
const fmtNum = (v: number) => {
  const a = Math.abs(v);
  return a >= 1000 ? Math.round(v).toLocaleString('en-GB') : a >= 100 ? (+v.toFixed(1)).toLocaleString('en-GB') : `${+v.toFixed(a < 1 ? 4 : 2)}`;
};
const fmtGbp = (v: number) => {
  const a = Math.abs(v);
  return a >= 100 ? `£${Math.round(v).toLocaleString('en-GB')}` : a >= 1 ? `£${v.toFixed(2)}` : `£${v.toFixed(4)}`;
};
/**
 * A rule value as a buyer reads it — its unit from the form label, money written in £ (converted by the renderer), no
 * form hints: "Core Cost/Part (£)" 1.6293 gives "£1.63 a part"; "Cycle Time (hr)" 0.0167 gives "1.00 min (60 an hour)";
 * "Casting Yield (0–1)" 0.625 gives "62.5 %"; "Die Cost (£)" 11025 gives "£11,025".
 */
export function paramDisplay(label: string, value: string): string {
  const raw = String(value ?? '').trim();
  if (/^(true|false)$/i.test(raw)) return /^true$/i.test(raw) ? 'Yes' : 'No';
  const n = Number(raw.replace(/,/g, ''));
  if (raw === '' || !Number.isFinite(n)) return reportNoteText(/^[a-z]+(?:_[a-z]+)+$/.test(raw) ? raw.replace(/_/g, ' ') : raw);
  const core = formLabelCore(label);
  const unitM = /\(([^()]*)\)\s*\)?\s*$/.exec(core) ?? /(£\s*\/\s*[A-Za-z]+)\s*$/.exec(core);
  const unit = (unitM?.[1] ?? '').replace(/,?\s*0\s*=.*$/, '').replace(/\bopt\.?$/, '').trim();
  if (/£/.test(unit)) {
    if (n === 0) return 'none costed (£0)';
    const per = unit.replace(/^£\s*/, '');
    if (/^\/\s*(part|pc)\b/i.test(per) || (!per && /\/\s*part\b|per part|a part/i.test(cleanFieldLabel(core)))) return `${fmtGbp(n)} a part`;
    if (/^\/\s*(hr|h|hour)\b/i.test(per)) return `${fmtGbp(n)}/h`;
    if (/^\//.test(per)) return `${fmtGbp(n)}${per.replace(/\s+/g, '')}`;
    return fmtGbp(n);
  }
  if (/^(hr|h|hours?)$/i.test(unit) || /\(hr\)/.test(core)) {
    return `${(n * 60).toFixed(2)} min${n > 0 && n <= 1 ? ` (${fmtNum(1 / n)} an hour)` : ''}`;
  }
  if (/^0\s*[–-]\s*1$/.test(unit)) return `${+(n * 100).toFixed(1)} %`;
  if (/^%$/.test(unit)) return `${+n.toFixed(2)} %`;
  if (/^(sec|s)$/i.test(unit)) return `${fmtNum(n)} s`;
  if (/min\s*\/\s*part/i.test(unit)) return `${fmtNum(n)} min a part`;
  if (!unit || /^(shots|cycles|strokes|parts|sets)$/i.test(unit)) return `${fmtNum(n)}${unit ? ` ${unit}` : ''}`;
  return `${fmtNum(n)} ${unit}`;
}

/** What the costing did for an unanswered advisory question — the reader is told, not sent to "the basis". */
function usedFor(d: DecisionForUsed, input: UniversalStackInput, rvs: NonNullable<NonNullable<CoreReportMeta['checks']>['ruleValues']>): string | null {
  // ONE resolver with the screen's checks (decision-used.ts): what the costing holds for an unanswered advisory.
  const costedItems = [...input.operations.map(o => o.operationName), ...(input.rawMaterial.consumablesItems ?? []).map(i => i.label)];
  return decisionUsedValue(d, { costedItems, ruleValues: rvs });
}

/**
 * Machining inside a cast + machine or forge + machine costing: the machine is a cutting machine (the library's `mach-`
 * machines, or a class that says machining centre / lathe), or a bench deburr / gauge. The class test read "machin" and
 * "grind" anywhere: "Gravity Die Casting Machine", "Shot Blast Machine" and the "Robotic fettling / grinding cell" were
 * counted as machining, and page 1 put the casting route's robotic fettling (£0.44 on the bracket) in the machining half.
 */
function isMachiningOp(o: { operationName: string; machineId: string; benchOperation?: boolean }, library: RateLibrary): boolean {
  if (o.benchOperation) return /deburr|gauge|machin/i.test(o.operationName);
  const m = library.machines.find(x => x.id === o.machineId);
  return /^mach-/.test(o.machineId) || /\bmachining\b|\blathe\b/i.test(m?.machineClass ?? '');
}

/**
 * May a page-1 "cheaper route" alert rest on this comparison row? Only when its material price is neither held nor
 * implausible (`routeMaterialCheck`, read off the costing's book against the costing's own grade) and the comparison did
 * not mark it so. A withheld row stays in the routes table; it raises no alert.
 */
export function routeAlertEligible(r: { material?: { materialId: string | null } | null; materialCheck?: { status: string } | null; credible?: boolean },
  refMaterialId: string | null | undefined, library: RateLibrary): boolean {
  if (r.credible === false) return false;
  if (r.materialCheck && r.materialCheck.status !== 'ok') return false;
  return routeMaterialCheck(r.material?.materialId ?? null, refMaterialId ?? null, library).status === 'ok';
}

/** A casting's or forging's weights, each named once: what is made, what is bought, what is sold back as scrap. */
export interface CoreWeights {
  form: 'forged' | 'cast';
  /** The finished (machined) part, kg — when the costing states it. */
  finishedKg: number | null;
  /** One forging / casting as it leaves the press or the mould (machining stock and drilled metal on), kg. */
  asFormedKg: number;
  /** Flash a forging, kg (forging only). */
  flashKg: number | null;
  /** Billet a forging = (as forged + flash) ÷ stock yield, kg (forging only). */
  billetKg: number | null;
  yieldFraction: number | null;
  /** Scrap forgings / castings, 0–1 (the stack buys and makes 1 ÷ (1 - r) a good part). */
  rejectRate: number;
  /** Bought a GOOD part (billet / poured charge ÷ (1 - reject)), kg — the material line's kg. */
  boughtKg: number;
  /** Sold back as scrap a good part, kg — the scrap-credit line's kg (0 when the loss is not scrap). */
  scrapKg: number;
  /** The set as one sentence, printed under the material split. */
  line: string;
}

/**
 * The weight set of a casting or forging read off the values the rules set (as-formed, flash, yield, reject) and the
 * stack's own net / utilisation — so page 2 (material, £/kg), page 4 (descale on the forging) and page 5 (stock yield,
 * flash) print the same weights under the same names. Null for other commodities or without the rules' as-formed weight.
 */
export function formWeights(rvs: ReadonlyArray<{ label: string; value: unknown; fieldId?: string; ruleValue?: unknown }>,
  input: UniversalStackInput, commodity: string | null): CoreWeights | null {
  const c = String(commodity ?? '');
  const forged = /forg/.test(c);
  if (!forged && !/cast/.test(c)) return null;
  const num = (re: RegExp): number | null => {
    const r = rvs.find(x => re.test(x.fieldId ?? ''));
    if (!r) return null;
    const v = Number(String(r.ruleValue ?? r.value ?? '').replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  };
  // as-formed: the forging's part weight (as forged, CLAUDE forging notes); cast + machine's as-cast weight, the casting
  // route's part weight (as cast, machining stock on). Finished: cast + machine's finished weight (the STEP's).
  const asFormed = forged ? num(/^forge-part-wt$/) : num(/^(cam-cast-wt|cast-part-wt)$/);
  if (!(asFormed && asFormed > 0)) return null;
  const finished = forged ? null : num(/^cam-finish-wt$/);
  // the forging stack buys and makes 1 ÷ (1 − reject) a good part (modules/forging.ts); the casting stack does not fold
  // its reject into the material weights
  const reject = forged ? Math.max(0, Math.min(0.9, num(/^forge-reject$/) ?? 0)) : 0;
  const flash = forged ? Math.max(0, num(/^forge-flash$/) ?? 0) : null;
  const yieldF = forged ? num(/^forge-yield$/) : null;
  const billet = forged && yieldF && yieldF > 0 ? (asFormed + (flash ?? 0)) / yieldF : null;
  const rm = input.rawMaterial;
  const bought = rm.materialUtilization > 0 ? rm.netWeightKg / rm.materialUtilization : rm.netWeightKg;
  const scrap = rm.lossIsNotScrap ? 0 : Math.max(0, bought - rm.netWeightKg);
  const k = (v: number) => `${v.toFixed(3)} kg`;
  const one = forged ? 'a forging' : 'a casting';
  const per = reject > 0 ? ` (÷ ${(1 - reject).toFixed(2)} for ${+(reject * 100).toFixed(1)} % scrap ${forged ? 'forgings' : 'castings'})` : '';
  const line = `Weights: ${finished ? `finished ${k(finished)} · ` : ''}as ${forged ? 'forged' : 'cast'} ${k(asFormed)} ${one}`
    + (forged && flash ? ` + flash ${k(flash)}` : '')
    + (billet ? ` · billet ${k(billet)} ${one} = (${k(asFormed)} + ${k(flash ?? 0)} flash) ÷ ${yieldF!.toFixed(3)} stock yield` : '')
    + ` · bought ${k(bought)} a good part${per}`
    + (scrap > 0 ? ` · scrap sold ${k(scrap)} a good part (bought - ${k(rm.netWeightKg)} made a good part)` : rm.lossIsNotScrap ? ' · the metal lost is not sold as scrap' : '')
    + '. The £/kg figures are on the weight of ONE ' + (forged ? 'forging as forged' : 'casting as cast') + '.';
  return { form: forged ? 'forged' : 'cast', finishedKg: finished, asFormedKg: asFormed, flashKg: flash, billetKg: billet, yieldFraction: yieldF,
    rejectRate: reject, boughtKg: bought, scrapKg: scrap, line };
}

export function buildCoreReport(a: CoreReportArgs): CoreReport {
  const { result, input, library } = a;
  const meta = a.cadMeta ?? {};
  const commodity = a.commodity ?? null;
  const regionCode = String(a.region ?? library.regional?.code ?? 'UK');
  const std = reportStandardFor(commodity);
  const total = result.total;
  const share = (gbp: number) => (total > 0 ? Math.round(gbp / total * 1000) / 10 : 0);
  const annual = input.annualVolume && input.annualVolume > 0 ? input.annualVolume : (meta.annualVolume && meta.annualVolume > 0 ? meta.annualVolume : null);
  const years = input.programmeYears && input.programmeYears > 0 ? input.programmeYears : null;
  const geomEstimated = meta.geometrySource === 'text_parsing';
  const u = !geomEstimated && meta.uncertainty ? meta.uncertainty : computeCostUncertainty(result, input, geomEstimated ? { baseCvOverride: 0.28 } : {});
  const exec = buildExecutiveSummary({ result, input, library, commodity, region: regionCode, band: u, stamp: meta.stamp ?? null,
    decisions: meta.checks?.decisions ?? null, volumeProvided: meta.volumeProvided, pkgLogisticsEstimated: meta.pkgLogisticsEstimated });
  const omFactor = (1 + input.overheadPct) * (1 + input.marginPct);
  const rvs = meta.checks?.ruleValues ?? [];
  const fx = a.fx && a.fx > 0 ? a.fx : 1;
  const sym = a.sym ?? '£';
  const M = (g: number, dp = 2) => `${sym}${(g * fx).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const MW = (g: number) => `${sym}${Math.round(g * fx).toLocaleString('en-GB')}`;

  // Piece price without tooling — the stack re-run (the tooling's overhead and margin leave with it).
  let pieceEx = total - result.breakdown.tooling;
  try { pieceEx = computeUniversalStack({ ...input, tooling: { ...input.tooling, totalToolingCost: 0 } }, library).total; } catch { /* keep the bucket difference */ }
  const tooling = toolingSplit(input, result);
  const price = quotedPrice(result, input, library, tooling, pieceEx);

  // Confidence by DISTINCT input: a rate shared by nine operations is one input — and graded on those inputs.
  const distinct = new Map<string, { label: string; value: number; unit: string; conf: string; ops: number }>();
  const rank = { Low: 0, Medium: 1, High: 2 } as Record<string, number>;
  for (const t of result.traceability) {
    const prop = /\.([A-Za-z]+)$/.exec(t.field)?.[1] ?? t.field;
    const key = `${t.rateId}|${prop}`;
    const m = library.machines.find(x => x.id === t.rateId);
    const mat = library.materials.find(x => x.id === t.rateId);
    const label = /labourRatePerHr/.test(t.field) ? `${labourRoleLabel(t.rateId).replace(/ \(role\)$/, '')} labour rate`
      : /machineRatePerHr/.test(t.field) ? `${m?.machineClass ?? 'machine'} rate`
      : /pricePerKg/.test(t.field) ? `${mat?.grade ?? 'material'} price`
      : /scrapRecovery/.test(t.field) ? `${mat?.grade ?? 'material'} scrap price`
      : traceFieldLabel(t.field);
    const d = distinct.get(key);
    if (!d) distinct.set(key, { label, value: t.value, unit: t.unit, conf: t.confidence, ops: /PerHr$/.test(prop) ? 1 : 0 });
    else { d.ops += /PerHr$/.test(prop) ? 1 : 0; if ((rank[t.confidence] ?? 1) < (rank[d.conf] ?? 1)) d.conf = t.confidence; }
  }
  const dl = [...distinct.values()];
  const cnt = (c: string) => dl.filter(d => d.conf === c).length;
  const lowInputs = dl.filter(d => d.conf === 'Low').map(d => ({ label: d.label, value: d.value, unit: d.unit, operations: d.ops }));
  const screenGrade = overallConfidence(result);
  const inputGrade = dl.length ? gradeOfCounts(cnt('High'), cnt('Medium'), cnt('Low')) : screenGrade;
  // ONE grade (fresh review, 4 Nov 2026: the knuckle printed "Medium" and "the costing screen grades Low" on page 1, beside
  // a finding that the part cannot be made as drawn). A BLOCKING DFM finding caps it at Low and says so beside it.
  const blockingDfm = (meta.geometricDFM?.grouped ?? [])
    .filter(x => dfmRuleApplies(commodity, x.ruleId) && normaliseSeverity(x.severity, (x.totalCostGBP ?? 0) > 0) === 'blocking');
  const grade: string = blockingDfm.length ? 'Low' : inputGrade;
  const gradeNote = blockingDfm.length
    ? `Capped at Low: a BLOCKING DFM finding (${blockingDfm[0].title}${blockingDfm.length > 1 ? ` and ${blockingDfm.length - 1} more` : ''}) says the route as costed cannot be made as drawn — the price assumes it can.`
    : null;

  // The £ resting on figures labelled "not sourced / engineering-typical / ESTIMATE / held": each cost line such a value
  // drives (matched by name and, for tooling, by kind) or whose own basis says so, counted once, before overhead and margin.
  const cl = costLinesOf(result, input);
  const counted = new Map<string, CostLine>();
  const unsourcedItems: CoreUnsourcedItem[] = [];
  const driverName = (r: { label: string; fieldId?: string }) => std.keyDrivers.find(d => d.match.test(ruleKey(r)))?.name;
  for (const rv of rvs) {
    if (!isUnsourcedText(rv.basis)) continue;
    const lines = attributeRule(ruleKey(rv), cl);
    for (const l of lines ?? []) counted.set(l.id, l);
    const gbp = lines ? lines.reduce((s, l) => s + l.gbp, 0) : null;
    unsourcedItems.push({ label: driverName(rv) ?? cleanFieldLabel(rv.label), value: paramDisplay(rv.label, String(rv.value)), basis: reportNoteText(rv.basis), gbp,
      drives: (lines ?? []).map(l => l.label) });
  }
  const selfLabelled: CostLine[] = [
    ...cl.consumables.filter(l => isUnsourcedText(l.text)),
    ...cl.energy.filter(l => isUnsourcedText(l.text)),
    ...cl.tooling.filter(l => isUnsourcedText(l.text)),
    ...cl.ops.filter(o => isUnsourcedText(o.name)).flatMap(o => [o.process, o.labour]).filter(l => l.gbp > 0),
  ].filter(l => !counted.has(l.id));
  for (const l of selfLabelled) {
    counted.set(l.id, l);
    unsourcedItems.push({ label: l.label, value: '—', basis: reportNoteText(l.text), gbp: l.gbp, drives: [l.label] });
  }
  unsourcedItems.sort((x, y) => (y.gbp ?? -1) - (x.gbp ?? -1));
  const unsourcedGbp = [...counted.values()].reduce((s, l) => s + l.gbp, 0);

  const defaultOverhead = regionalShopDefaults(regionCode as ManufacturingRegion).overheadPct;
  const overheadDefault = Math.abs(input.overheadPct - defaultOverhead) < 1e-9;
  const pkgDefault = meta.pkgLogisticsEstimated !== false;
  const bk = result.breakdown;
  const defaults = [
    ...(overheadDefault && bk.overhead > 0 ? [{ label: `overhead ${(input.overheadPct * 100).toFixed(1)} %`, gbp: bk.overhead }] : []),
    ...(bk.margin > 0 ? [{ label: `margin ${(input.marginPct * 100).toFixed(1)} %`, gbp: bk.margin }] : []),
    ...(pkgDefault && bk.packaging > 0 ? [{ label: 'packaging', gbp: bk.packaging }] : []),
  ];
  const defaultsGbp = defaults.reduce((s, d) => s + d.gbp, 0);
  const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const defaultsNote = defaults.length
    ? `Not in this share: ${listAnd(defaults.map(d => `${d.label} ${M(d.gbp)}`))} — CostVision defaults, not sourced (section 2). `
      + `With them, ${M(unsourcedGbp + defaultsGbp)} a part (${share(unsourcedGbp + defaultsGbp).toFixed(1)} %) rests on unsourced figures or defaults.`
    : 'Overhead, margin and packaging were entered on the costing; they are not in this share.';

  // Alerts: a blocking DFM finding; a feasible route ≥ 20 % cheaper at the programme volume; uncosted scope.
  const alerts: CoreAlert[] = [];
  const g = meta.geometricDFM;
  if (g) {
    for (const gr of (g.grouped ?? []).filter(x => dfmRuleApplies(commodity, x.ruleId) && normaliseSeverity(x.severity, (x.totalCostGBP ?? 0) > 0) === 'blocking')) {
      alerts.push({ kind: 'blocking', title: `This route as costed cannot be made as drawn: ${gr.title}${gr.count > 1 ? ` (${gr.count})` : ''}`,
        lines: [`${gr.recommendation} — the price assumes it can (Design to cost).`] });
    }
  }
  const x = meta.routeComparison && meta.routeComparison.rows.length ? meta.routeComparison : null;
  const ref = x ? routeReferenceRow(x) : null;
  const refTotal = ref?.total ?? null;
  let routes: CoreReport['routes'] = null;
  if (x && ref && refTotal != null && refTotal > 0) {
    // only rows the comparison judges credible (route-compare.ts notCredibleReasons: brittle iron on a safety part, machining
    // from solid below the material-use floor …); the audit pack prints the others with their reasons
    const costed = x.rows.filter(r => r !== ref && r.total != null && !r.refusal && r.credible !== false);
    const firstSet = (r: typeof x.rows[number]): number | null => {
      const t = r.tooling as (typeof r.tooling & { split?: { upFront: number } }) | null | undefined;
      if (!t) return null;
      if (t.split && Number.isFinite(t.split.upFront)) return t.split.upFront;
      if (t.items?.length) return t.items.reduce((s, it) => s + splitToolingItem(it as never).initialGbp, 0);
      return t.investment;
    };
    const rows: CoreRouteRow[] = costed
      .map(r => ({ r, d: r.total! / refTotal - 1 }))
      .filter(({ d }) => d <= 0.5)
      .sort((p, q) => p.d - q.d)
      .map(({ r, d }) => ({
        name: routeRowLabel(r, x.labels), total: r.total!, deltaGbp: r.total! - refTotal, deltaPct: Math.round(d * 1000) / 10,
        band: r.band ? { p10: r.band.p10, p90: r.band.p90, plusMinusPct: r.band.plusMinusPct } : null,
        toolingGbp: firstSet(r), toolingProgrammeGbp: r.tooling?.investment ?? null,
        note: x.crossovers.find(k => k.route === r.route && k.process === r.process)?.text ?? null,
      }));
    routes = { reference: routeRowLabel(ref, x.labels), rows, notShown: x.excluded.length + (costed.length - rows.length) + x.rows.filter(r => r !== ref && (r.total == null || r.refusal || r.credible === false)).length, principle: x.principle };
    // A page-1 alert never rests on a row whose material price is held or implausible (route-material-guard.ts, fresh
    // review 4 Nov 2026: the knuckle's and hub flange's "casting is cheaper" rested on a cast-steel charge at merchant
    // scrap) — read again here off the costing's own book, so a comparison made before the guard cannot raise one either.
    // ONE alert per costing: two rows at the same £ are the same costing (the hub flange printed "Casting" and "Cast and
    // machine", £8.69 both).
    const alertRows: CoreRouteRow[] = [];
    for (const row of rows.filter(r => r.deltaPct <= -20)) {
      const src = costed.find(r => r.total === row.total && routeRowLabel(r, x.labels) === row.name);
      if (!src || !routeAlertEligible(src, input.rawMaterial.materialId, library)) continue;
      if (alertRows.some(a => Math.abs(a.total - row.total) < 0.005)) continue;
      alertRows.push(row);
    }
    for (const row of alertRows) {
      alerts.push({ kind: 'route', title: `A feasible route is ${Math.abs(row.deltaPct).toFixed(0)} % cheaper: ${row.name}`,
        lines: [`${row.name} costs ${M(row.total)} a part against ${M(refTotal)} for the costed route at ${x.programme.annualVolume.toLocaleString('en-GB')} a year`
          + (annual ? ` — ${MW(Math.abs(row.deltaGbp * annual))} a year less` : '') + '. Both are re-costs of the same part in the same material (Alternatives; an alert at 20 % or more cheaper).'] });
    }
  }
  // The commodity's own notes from its rules: read off the rule context when the caller has one (headless), else the
  // CAD response's copy (the app) — one function makes both (report-notes.ts).
  const notes = meta.ruleContext ? ruleReportNotes(commodity, meta.ruleContext)
    : meta.reportNotes && meta.reportNotes.commodity === commodity ? meta.reportNotes : null;
  // The commodity's own route alert (composites: prepreg in an autoclave above 25,000 a year — an industry quote).
  if (commodity === 'composites') {
    let text: string | null = null;
    try {
      if (notes) text = notes.alert;
      else {
        const proc = rvs.find(r => /(^|\s)comp-process$/.test(r.fieldId ?? ''))?.value as CompositeProcess | undefined;
        const cure = input.operations.find(o => /autoclave|oven|cure/i.test(`${o.machineId} ${o.operationName}`))?.machineId ?? '';
        if (proc && annual) text = compositesRouteAlert(annual, cure, proc);
      }
    } catch { /* no alert */ }
    if (text) alerts.push({ kind: 'route', title: 'The costed route does not suit this volume: prepreg cured in an autoclave', lines: [text.replace(/^ROUTE ALERT \(industry quote\): /, '').replace(/ROUTE ALERT \(industry quote\): /, '(industry quote) ')] });
  } else if (notes?.alert) {
    alerts.push({ kind: 'route', title: 'The costed route does not suit this volume', lines: [notes.alert] });
  }
  if (meta.featureLinesInCost && meta.featureLines?.length) {
    const turned = (l: FeatureMachiningLine) => !!meta.featureTurningOp && (l.kind === 'boss' || /turn/i.test(l.operation));
    const not = meta.featureLines.filter(l => !l.included && !turned(l));
    if (not.length) alerts.push(uncostedScopeAlert(not, meta, result, library, annual, omFactor, M, MW));
  }

  const decisionsAll = meta.checks?.decisions ?? [];
  // Scope: the commodity's "Not included until answered" list, without the items the costing does price.
  const costedText = [...input.operations.map(o => o.operationName), ...(input.rawMaterial.consumablesItems ?? []).map(i => i.label), ...(input.tooling.items ?? []).map(i => i.label)].join(' | ');
  // An answer as the rules read it: the screen prints the option's label ("No — structural or cosmetic only").
  const answerValue = (v: string) => (/^yes\b/i.test(v) ? 'yes' : /^no\b/i.test(v) ? 'no' : /^none\b/i.test(v) ? 'none' : v);
  const answers: Record<string, unknown> = Object.fromEntries(decisionsAll.filter(d => d.answer != null && d.answer !== '')
    .map(d => [d.id, answerValue(String(d.answer))]));
  const matCat = library.materials.find(m => m.id === input.rawMaterial.materialId)?.category ?? '';
  let fromAnswers: string[] = [];
  try {
    fromAnswers = serviceNotCosted(String(commodity ?? ''), answers, { heavyAlloyCasting: /iron|steel|copper|bronze|brass|nickel/i.test(matCat) })
      .map(n => `${n.item} — ${n.reason}`);
  } catch { /* no service questions for this commodity */ }
  if (notes) fromAnswers = [...fromAnswers, ...notes.notCosted.map(n => `${n.item} — ${n.reason}`)];
  const answeredAway = (i: NotIncludedItem) => !!i.unlessAnswered && i.unlessAnswered.answer.test(String(answers[i.unlessAnswered.id] ?? ''));
  const notIncluded = [
    ...fromAnswers,
    ...(input.deliveryTerms === 'EXW' ? ['Freight to your plant — the price is ex-works (EXW)'] : []),
    'Import duty, customs and cross-border shipping',
    ...(input.tooling.totalToolingCost > 0 && input.tooling.mode === 'one_time_nre' ? ['Tooling — charged once, separately'] : []),
    ...std.notIncluded.filter(i => !(i.costedIf && i.costedIf.test(costedText)) && !answeredAway(i) && (!i.materialIf || i.materialIf.test(matCat)))
      .map(i => (i.requiredIf && i.requiredText && i.requiredIf.answer.test(String(answers[i.requiredIf.id] ?? '')) ? i.requiredText : i.text)),
  ];

  const answerOf = (d: typeof decisionsAll[number]) => decisionAnswerLabel(d.id, d.answer, { routeLabels: COMMODITY_REPORT_LABELS, grades: library.materials });
  const withUsed = (d: typeof decisionsAll[number]) => ({ ...d, used: d.answer == null || d.answer === '' ? usedFor(d, input, rvs) : d.used });
  const openQuestions = decisionsAll.filter(d => d.answer == null || d.answer === '')
    .map(d => `${d.question} — ${decisionAnswerText({ severity: d.severity, answer: null, used: withUsed(d).used })}`);
  const spec = decisionsAll.map(d => ({ question: d.question, answer: decisionAnswerText({ severity: d.severity, answer: answerOf(d), used: withUsed(d).used }) }));

  const buckets = ([
    ['1. Material', bk.rawMaterial], ['2. Process (machine)', bk.process], ['3. Direct labour', bk.labour], ['4. Tooling (amortised)', bk.tooling],
    ['5. Packaging', bk.packaging], ['6. Logistics', bk.logistics], ['7. Overhead', bk.overhead], ['8. Margin', bk.margin],
  ] as Array<[string, number]>).map(([label, gbp]) => ({ label, gbp, sharePct: share(gbp) }) as CoreReport['buckets'][number]);
  const metalIn = metalOfMaterial(result, input, library);
  if (metalIn) Object.assign(buckets[0], { metalGbp: metalIn.gbp, metalSharePct: share(metalIn.gbp), metalWord: metalIn.word });

  const material = materialSplit(result, input, library);
  const weights = formWeights(rvs, input, commodity);
  // £/kg as cast / as forged is on ONE forging's (casting's) weight — the knuckle printed "as forged (3.434 kg)", its
  // as-forged 3.365 kg with the 2 % scrap forgings folded in, while page 4 and page 5 read 3.365 (fresh review, 4 Nov 2026).
  const kgCostedOn = weights?.asFormedKg ?? input.rawMaterial.netWeightKg;
  const castOrForge = /cast|forg/.test(String(commodity ?? ''));
  const perKg = castOrForge && kgCostedOn > 0 ? {
    kg: kgCostedOn, kgLabel: /forg/.test(String(commodity)) ? 'as forged' : 'as cast',
    pricePerKg: total / kgCostedOn, metalPerKg: material.metalGbp / kgCostedOn,
  } : null;

  // Cast + machine / forge + machine: the casting (or forging) ex-works and the machining, each with its overhead and margin.
  let formMachine: CoreFormMachineSplit | null = null;
  if (castOrForge && kgCostedOn > 0) {
    const machOps = result.operationDetails.filter(o => isMachiningOp(o, library));
    if (machOps.length) {
      const vol = input.tooling.mode === 'amortized' && input.tooling.amortizationVolume > 0 ? input.tooling.amortizationVolume : 0;
      const opsGbp = machOps.reduce((s, o) => s + o.processCost + o.labourCost, 0);
      const wear = (input.rawMaterial.consumablesItems ?? []).filter(i => TOOL_WEAR_RE.test(i.label) || /cell consumables|coolant/i.test(i.label));
      const wearGbp = wear.reduce((s, i) => s + i.gbp, 0);
      const toolItems = vol ? (input.tooling.items ?? []).filter(i => ['fixture', 'programming'].includes(toolFamily(i.label))) : [];
      const toolGbp = toolItems.reduce((s, i) => s + i.gbp, 0) / (vol || 1);
      const direct = opsGbp + wearGbp + toolGbp;
      const machining = direct * omFactor;
      const form = total - machining;
      const isForge = /forg/.test(String(commodity));
      formMachine = {
        form: isForge ? 'Forging' : 'Casting', formGbp: form, kg: kgCostedOn, kgLabel: isForge ? 'as forged' : 'as cast', formPerKg: form / kgCostedOn,
        machiningGbp: machining, machiningDirectGbp: direct,
        machiningParts: [`${machOps.length} machining operation(s) ${M(opsGbp)}`, ...(wearGbp > 0 ? [`cutting-tool wear ${M(wearGbp)}`] : []),
          ...(toolGbp > 0 ? [`fixtures and programming ${M(toolGbp, 4)} a part`] : [])],
      };
    }
  }

  const commercial = [
    { label: 'Overhead', value: `${(input.overheadPct * 100).toFixed(1)} % of material + process + labour + tooling`,
      source: overheadDefault ? 'CostVision default, not sourced — not a market benchmark' : 'as entered on the costing' },
    { label: 'Margin', value: `${(input.marginPct * 100).toFixed(1)} % of the subtotal`, source: 'the figure on the costing form (CostVision default unless typed), not sourced' },
    { label: 'Packaging', value: `£${input.packagingPerPart.toFixed(4)} a part`,
      source: pkgDefault ? 'CostVision default from the part\'s size, not sourced — replace with the supplier\'s pack' : 'as entered on the costing' },
    { label: 'Terms', value: deliveryTermsLine(input.deliveryTerms), source: 'as selected on the costing' },
  ];

  const operations: CoreOperation[] = result.operationDetails.map(o => {
    const m = library.machines.find(x2 => x2.id === o.machineId);
    const bench = !!o.benchOperation;
    const machinePerHr = bench ? null : o.machineRateUsed;
    const eff = o.labourEfficiency > 0 ? o.labourEfficiency : 1;
    const crewCharged = bench ? o.manning : (o.cycleTimeHr > 0 ? o.manning * o.labourTimeHr / o.cycleTimeHr : 0);
    const labourPerHr = o.labourRateUsed * crewCharged / eff;
    const oee = bench ? null : (o.oee > 0 ? o.oee : 1);
    return { name: shortOperationName(o.operationName), machine: bench ? 'Bench (labour only)' : (m?.machineClass ?? 'machine'), bench,
      cycleMin: (bench ? o.labourTimeHr : o.cycleTimeHr) * 60, partsPerCycle: o.partsPerCycle, oee, crew: o.manning, crewCharged,
      labourEfficiency: eff, machinePerHr, labourPerHr, ratePerHr: (machinePerHr ?? 0) / (oee ?? 1) + labourPerHr, gbp: o.processCost + o.labourCost };
  });
  const capRows = annual ? capacityImplied(input, library, annual) : [];
  const capacity = annual ? {
    formula: `machines = ${annual.toLocaleString('en-GB')} a year × cycle ÷ parts a cycle ÷ OEE, summed over the operations on the machine, ÷ that machine's own annual available hours (its shift pattern in the rate book)`,
    rows: capRows, warnings: capacityWarnings(capRows, annual),
  } : null;

  // Key process parameters and the negotiation sheet: the commodity's drivers, matched to the values the rules set.
  const used = new Set<number>();
  const keyParams: CoreParam[] = [];
  // The subtype the casting rules chose: a SAND pattern's life is counted in castings (moulds × impressions), not shots.
  const subRv = rvs.find(r => /(^|-)cast-subtype$/.test(r.fieldId ?? ''));
  const castSubtype = String((subRv as { ruleValue?: unknown } | undefined)?.ruleValue ?? subRv?.value ?? '');
  const isZero = (v: unknown) => String(v ?? '').trim() !== '' && Number(String(v).replace(/,/g, '')) === 0;
  for (const d of std.keyDrivers) {
    const matching = rvs.map((_r, k) => k).filter(k => !used.has(k) && d.match.test(ruleKey(rvs[k])));
    if (!matching.length) continue;
    // A driver two fields can carry prints the one the costing USED: fettling on the robotic cell is its seconds, not the
    // bench minutes' 0 (fresh review, 4 Nov 2026 — "Fettling 0" printed beside a costed 40 s cell).
    const i = matching.find(k => !isZero(rvs[k].value)) ?? matching[0];
    used.add(i);
    let shown = paramDisplay(rvs[i].label, String(rvs[i].value));
    if (d.name === 'Pattern life' && /\bsand\b/i.test(castSubtype)) shown = shown.replace(/\b(shots|cycles)\b/, 'castings');
    // the forging weights under the names page 2 uses (formWeights)
    if (weights?.billetKg && /^Stock yield/.test(d.name)) shown = `${shown} — billet ${weights.billetKg.toFixed(3)} kg a forging = (as forged ${weights.asFormedKg.toFixed(3)} kg + flash ${(weights.flashKg ?? 0).toFixed(3)} kg) ÷ ${weights.yieldFraction!.toFixed(3)}`;
    if (weights && d.name === 'Flash' && weights.flashKg != null) shown = `${weights.flashKg.toFixed(3)} kg a forging (as forged ${weights.asFormedKg.toFixed(3)} kg)`;
    const basisHead = reportNoteText(rvs[i].basis).split(/; | \(engineering|\. /)[0].trim();
    keyParams.push({ name: d.name, label: rvs[i].label, value: reportNoteText(String(rvs[i].value)),
      display: d.display === 'basis' && basisHead ? `${shown} — ${basisHead}` : shown,
      basis: reportNoteText(rvs[i].basis), question: d.question });
  }
  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const topOp = [...operations].filter(o => !o.bench).sort((p, q) => q.gbp - p.gbp)[0];
  const negotiation = [
    ...(mat && input.rawMaterial.directCost === undefined ? [{ driver: 'Material price', ours: `${mat.grade}: £${mat.pricePerKg.toFixed(4)}/kg (rate book)`, question: 'What price a kg do you buy at, and which index does it follow?' }] : []),
    ...keyParams.map(p => ({ driver: p.name, ours: p.display, question: p.question })),
    ...(topOp ? [{ driver: `Largest operation: ${topOp.name}`, ours: `${topOp.cycleMin.toFixed(2)} min on ${topOp.machine}; machine ${M(topOp.machinePerHr ?? 0)}/h ÷ OEE ${+(topOp.oee ?? 1).toFixed(3)} + crew ${M(topOp.labourPerHr)}/h`, question: 'What is your cycle and your machine-hour rate for it?' }] : []),
    ...(tooling.totalGbp > 0 ? [{ driver: 'Tooling', ours: price.mode === 'amortized'
      ? `up front ${MW(price.upfrontGbp)} (lump sum); replacements and wear ${M(price.runningPerPartGbp)} a part in the piece price`
      : `${MW(tooling.totalGbp)} charged once`, question: 'Tooling as a lump sum (first set) and replacements in the piece price — which do you quote?' }] : []),
    { driver: 'Overhead and margin', ours: `${(input.overheadPct * 100).toFixed(1)} % + ${(input.marginPct * 100).toFixed(1)} %`, question: 'What overhead and margin do you apply, and on what base?' },
  ];

  let sensitivity: CoreReport['sensitivity'] = [];
  let sensitivityDropped = 0;
  const sensitivityPct = 10;
  try {
    const all = runSensitivity(input, library, sensitivityPct).drivers;
    const kept = all.filter(d => d.baseValue !== 0 && Math.max(Math.abs(d.minusCost - total), Math.abs(d.plusCost - total)) >= MOVER_MIN_SHARE * total);
    sensitivityDropped = Math.min(all.length, 5) - Math.min(kept.length, 5);
    sensitivity = kept.slice(0, 5).map(d => ({
      label: moverLabel(d.driver), base: d.baseValue, unit: d.unit, minusGbp: r4(d.minusCost - total), plusGbp: r4(d.plusCost - total) }));
  } catch { /* nothing to vary */ }
  const volumeLine = ref && ref.byVolume.length
    ? ref.byVolume.filter(p => p.total != null).map(p => `${M(p.total!)} at ${p.volume.toLocaleString('en-GB')}/yr`).join(' · ') : null;

  // Country rows: the screen's, or the part re-costed in each country's book, as §9 of the audit pack prints them.
  let countries: CoreReport['countries'] = { rows: [], note: '', basis: '' };
  try {
    const alAlloy = commodity === 'aluminium_extrusion' ? AL_ALLOY_LIST.find(al => `mat-al-billet-${al.toLowerCase()}` === input.rawMaterial.materialId) : undefined;
    const rc = a.regionalRows?.length ? a.regionalRows
      : a.baseLibrary ? computeRegionalComparisonExact(input, a.baseLibrary, { landed: false, sourceRegion: regionCode as ManufacturingRegion, sourceResult: result })
      : computeRegionalComparison(result.breakdown, { landed: false, sourceRegion: regionCode as ManufacturingRegion, ...(alAlloy ? { materialFactorByRegion: alBilletMaterialFactors(alAlloy) } : {}) });
    countries = {
      rows: rc.map(r => ({ name: r.name, total: r.total, vsBasePct: r.vsBasePct, isBase: r.isBase, approx: r.basis === 'stack-reprice' || r.basis === 'scaled' })),
      note: input.deliveryTerms === 'EXW'
        ? 'Each row is ex-works in that country: no freight to your plant, no import duty. Indicative — confirm with an RFQ.'
        : 'Each row carries that country\'s packaging and delivery allowance; import duty and cross-border freight are out. Indicative — confirm with an RFQ.',
      basis: 'Basis: each row is this part re-costed in that country\'s OWN rate book — its labour (statutory on-costs included), machine-hour '
        + 'rates on its own shift pattern and annual hours, energy tariff, material markets and services; an item a book could not price is at par '
        + 'with the UK (no factor). A gap between two countries is the gap between their books: compare their labour £/h and annual hours in the audit pack.',
    };
  } catch { /* no country table */ }

  // Design to cost: at most five geometric findings that apply to the costed process and carry a re-costed £ or a
  // blocking / cost / risk severity.
  let dfm: CoreReport['dfm'];
  if (g) {
    const amounts = meta.geometricDFMAmounts ?? {};
    const applies = (g.grouped ?? []).filter(gr => dfmRuleApplies(commodity, gr.ruleId));
    // BLOCKING / COST / RISK / INFO (dfm-geometry/types.ts): a re-costed £, or blocking / cost / risk — never INFO
    const sev = (gr: { severity: string; totalCostGBP?: number }) => normaliseSeverity(gr.severity, (gr.totalCostGBP ?? 0) > 0);
    const rankOf = (gr: { severity: string; totalCostGBP?: number }) => SEVERITY_RANK[sev(gr)];
    const pick = applies.filter(gr => amounts[gr.ruleId] || rankOf(gr) <= 2)
      .sort((p, q) => rankOf(p) - rankOf(q) || (amounts[q.ruleId] ? 1 : 0) - (amounts[p.ruleId] ? 1 : 0));
    dfm = {
      findings: pick.slice(0, 5).map(gr => ({ ruleId: gr.ruleId, severity: SEVERITY_LABEL[sev(gr)], title: gr.title, count: gr.count,
        amount: amounts[gr.ruleId]?.text ?? null, fix: gr.recommendation ?? '' })),
      considered: (g.grouped ?? []).length,
      notChecked: `Not checked: tolerances, datums and finish call-outs (no drawing is read)${g.limitations.length ? `. ${g.limitations.length} other limit${g.limitations.length === 1 ? '' : 's'} of the DFM check ${g.limitations.length === 1 ? 'is' : 'are'} listed in the audit pack` : ''}.`,
      status: 'ran',
    };
  } else {
    dfm = { findings: [], considered: 0, status: meta.geometricDFMPending ? 'pending' : 'not run',
      notChecked: meta.geometricDFMPending ? 'DFM pending: the geometric check had not finished when this report was made — export again for its findings.'
        : 'No geometric DFM check ran for this costing (no CAD model, or geometric DFM checks are not available for this process).' };
  }

  // The verdict: one line a President reads first.
  const askFirst = unsourcedItems.filter(i => (i.gbp ?? 0) > 0).slice(0, 3).map(i => i.label.replace(/ a part$/, '').toLowerCase());
  const flags = [
    ...alerts.filter(al => al.kind === 'blocking').map(() => 'a DFM finding says the route as costed cannot be made'),
    ...alerts.filter(al => al.kind === 'route').slice(0, 1).map(al => al.title.replace(/^./, ch => ch.toLowerCase()).replace(/:/, ' —')),
    ...alerts.filter(al => al.kind === 'scope').map(al => al.title.replace(/^Uncosted scope: /, '').replace(/ detected and NOT in this price/, ' not in the price')),
  ];
  const verdict = `Should-cost ${M(total)} a part, ${grade} confidence`
    + (rvs.length ? ` — ${share(unsourcedGbp).toFixed(0)} % of it rests on unsourced figures` : '')
    + (flags.length ? `; ${flags.join('; ')}` : '')
    + (openQuestions.length ? `. ${openQuestions.length} question${openQuestions.length === 1 ? '' : 's'} open` : '')
    + (askFirst.length ? `. Ask the supplier first for: ${askFirst.join(', ')}.` : '.');

  return {
    exec, part: result.partName, commodity: exec.commodity, commodityId: commodity, country: exec.country, region: regionCode,
    stamp: meta.stamp ?? null, total, verdict, annualVolume: annual, programmeYears: years, annualSpend: annual ? r4(total * annual) : null,
    pieceExToolingGbp: pieceEx, price, tooling,
    band: { p10: u.p10, p90: u.p90, plusMinusPct: u.plusMinusPct },
    bandNote: 'the spread of the inputs, not the model\'s error — accuracy not yet measured against a price paid',
    confidence: {
      grade, screenGrade, gradeNote, distinct: { total: dl.length, high: cnt('High'), medium: cnt('Medium'), low: cnt('Low') }, lowInputs,
      sentence: `${dl.length} distinct inputs: ${cnt('High')} High, ${cnt('Medium')} Medium, ${cnt('Low')} Low (a rate shared by several operations counts once) — `
        + (blockingDfm.length ? 'the grade is capped at Low by a BLOCKING DFM finding' : `graded ${grade} on these`),
    },
    unsourced: {
      items: unsourcedItems, totalGbp: unsourcedGbp, sharePct: share(unsourcedGbp), ruleBasis: rvs.length > 0,
      defaults, defaultsGbp, defaultsNote,
      method: 'Each cost line (an operation\'s machine or labour, a consumable or service line, an energy line, a tooling item a part by kind — a life '
        + 'drives the replacement sets, a price every set) that a value labelled "not sourced", "engineering-typical", "heuristic", "held" or ESTIMATE drives — '
        + 'matched by name — or whose own basis says so, counted once, before overhead and margin. A value that moves the whole cost (yield, scrap, '
        + 'reject rate, OEE, batch, weight) is listed without a figure.',
    },
    alerts, openQuestions, notIncluded, notModelled: std.notModelled ?? [], terms: deliveryTermsLine(input.deliveryTerms),
    buckets, material, weights, perKg, formMachine, commercial, spec, operations, capacity, keyParams,
    sensitivity, sensitivityPct, sensitivityDropped, volumeLine, negotiation, quoteBreakdown: std.quoteBreakdown, levers: exec.levers.length ? exec.levers : [],
    routes, countries, dfm,
  };
}

/**
 * Detected features as a reader counts them — grouped by kind and size, "5 pockets, 4 holes Ø10.0" (live run, 4 Nov
 * 2026: the knuckle printed "1× pocket, 1× pocket, 1× pocket, 1× pocket, 1× pocket", one line of the table each).
 */
export function featureCountsText(lines: ReadonlyArray<{ kind: string; count: number; diaMm?: number }>): string {
  const groups = new Map<string, { kind: string; dia: string; n: number }>();
  for (const l of lines) {
    const dia = l.diaMm ? l.diaMm.toFixed(1) : '';
    const key = `${l.kind}|${dia}`;
    const g = groups.get(key) ?? { kind: l.kind, dia, n: 0 };
    g.n += l.count;
    groups.set(key, g);
  }
  const plural = (k: string, n: number) => (n === 1 ? k : /(s|x|sh|ch)$/.test(k) ? `${k}es` : `${k}s`);
  return [...groups.values()].map(g => `${g.n} ${plural(g.kind, g.n)}${g.dia ? ` Ø${g.dia}` : ''}`).join(', ');
}
/**
 * Uncosted scope, ALL-IN (fresh review N6): the features' minutes priced at the costing's own rates for the operation they
 * would join (machine ÷ OEE + crew ÷ labour efficiency), with overhead and margin — and which time model gave the minutes.
 * The knuckle's alert said "£13.05 of machine time … operator, overhead and margin come on top" from a per-feature time
 * ten times the costing's own.
 */
function uncostedScopeAlert(not: FeatureMachiningLine[], meta: CoreReportMeta, result: PartCostResult,
  library: RateLibrary, annual: number | null, omFactor: number, M: (g: number) => string, MW: (g: number) => string): CoreAlert {
  const min = not.reduce((s, l) => s + l.totalMinutes, 0);
  const n = not.reduce((s, l) => s + l.count, 0);
  const rate = meta.featureMachineRatePerHr ?? 0;
  // the op the features would join: the costing's machining operation on that machine (else its largest machining op)
  const machOps = result.operationDetails.filter(o => !o.benchOperation && isMachiningOp(o, library) && o.cycleTimeHr > 0);
  const onMachine = machOps.filter(o => rate > 0 && Math.abs(o.machineRateUsed - rate) < 0.01);
  const host = (onMachine.length ? onMachine : machOps).sort((p, q) => (q.processCost + q.labourCost) - (p.processCost + p.labourCost))[0];
  let perHr: number, how: string;
  if (host) {
    const oee = host.oee > 0 ? host.oee : 1;
    const crew = host.manning * host.labourTimeHr / host.cycleTimeHr;
    const eff = host.labourEfficiency > 0 ? host.labourEfficiency : 1;
    perHr = host.machineRateUsed / oee + host.labourRateUsed * crew / eff;
    how = `at the rates of "${shortOperationName(host.operationName)}": machine ${M(host.machineRateUsed)}/h ÷ OEE ${+oee.toFixed(3)} + labour ${M(host.labourRateUsed)}/h × crew ${+crew.toFixed(2)} ÷ efficiency ${+eff.toFixed(2)}`;
  } else {
    const oee = meta.featureMachineOee != null && meta.featureMachineOee > 0 && meta.featureMachineOee <= 1 ? meta.featureMachineOee : 1;
    perHr = rate / oee;
    how = `at the feature machine's ${M(rate)}/h ÷ OEE ${+oee.toFixed(3)} (no machining operation in the costing to take a crew from)`;
  }
  const direct = (min / 60) * perHr;
  const allIn = direct * omFactor;
  // Do the two time models agree? Compared LIKE FOR LIKE (secondary-machining parity, Nov 2026): the costing's own minutes
  // for the rows it machines — its operations that cut features (`isFeatureCutOperation`: the change-over, handling,
  // spindle turning and bench excluded) — against the feature table's minutes for the SAME rows (the lines it costs). It
  // compared minutes a feature only on operations named "N features / holes / bores": on the near-net plan ("Finish
  // machining — +X side", "Drilling — 8 holes", "Finish boring — 4 cored bore(s)") the faces dropped out, and the
  // knuckle's 12 holes and bores (0.27 min each) were set against its uncosted pockets (0.83 min each) as "two time
  // models" — one catalogue, different features. No costed row, or no minutes on either side: no comparison is printed.
  const costedLines = (meta.featureLines ?? []).filter(l => l.included);
  const costedN = costedLines.reduce((s, l) => s + l.count, 0);
  const tableMin = costedLines.reduce((s, l) => s + l.totalMinutes, 0);
  const costingMin = machOps.filter(o => isFeatureCutOperation(o.operationName))
    .reduce((s, o) => s + o.cycleTimeHr * 60 / Math.max(1, o.partsPerCycle || 1), 0);
  const ratio = costedN > 0 && tableMin > 0 && costingMin > 0 ? costingMin / tableMin : null;
  const differs = ratio != null && (ratio > 1.5 || ratio < 1 / 1.5);
  const per = n > 0 ? min / n : 0;
  const lines = [
    `${n} feature instance(s), ${min.toFixed(1)} min from the feature-machining table (standard minutes a feature, ${per.toFixed(2)} min each) `
      + `${how}, × overhead and margin ${omFactor.toFixed(4)}: about ${M(allIn)} a part all-in${annual ? ` (${MW(allIn * annual)} a year)` : ''}. Confirm which are machined before using this price.`,
    ...(differs ? [`The two time models differ on the same features: the ${costedN} feature instance(s) this costing machines take `
      + `${costingMin.toFixed(2)} min in its own machining build-up and ${tableMin.toFixed(2)} min in the feature table (× ${ratio!.toFixed(2)}) — `
      + `at that ratio these would take about ${(min * ratio!).toFixed(1)} min and add about ${M((min * ratio! / 60) * perHr * omFactor)} a part.`] : []),
    `Features: ${featureCountsText(not)}.`,
  ];
  return { kind: 'scope', title: `Uncosted scope: ${n} machinable feature${n === 1 ? '' : 's'} detected and NOT in this price`, lines };
}

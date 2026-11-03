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
import { shortOperationName } from '../engine/operation-names.js';
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
import { reportNoteText } from './money-text.js';
import { reportStandardFor, dfmRuleApplies } from './report-standard.js';
import { toolingSplit as engineToolingSplit } from '../engine/tooling-split.js';
import { normaliseSeverity, SEVERITY_LABEL, SEVERITY_RANK } from '../engine/dfm-geometry/types.js';
import { serviceNotCosted } from '../engine/cost-input-rules/derive/service-questions.js';

export interface ExecutiveLine { label: string; gbp: number; sharePct: number }
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
  decisions?: ReadonlyArray<{ id?: string; question: string; severity: string; answer: string | null; used?: string | null }> | null;
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
  return raw.map(l => ({ label: l.label, gbp: r4(l.gbp), sharePct: Math.round(l.gbp / total * 1000) / 10 }));
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
  for (const d of a.decisions ?? []) {
    if (d.answer == null || d.answer === '') {
      toConfirm.push(d.severity === 'blocking' ? `OPEN — ${d.question}` : `${d.question} — not answered${d.used ? `; costed as ${d.used}` : '; the rules\' value is used'}`);
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
    decisions: Array<{ id: string; question: string; severity: 'blocking' | 'advisory'; answer: string | null; used?: string | null }>;
    ruleValues?: Array<{ label: string; value: string; ruleValue?: string; basis: string; source?: string; edited?: boolean; fieldId?: string }>;
  } | null;
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

export interface CoreMaterialLine { group: 'metal' | 'direct' | 'consumable' | 'energy' | 'boughtIn'; label: string; gbp: number; note?: string }
export interface CoreUnsourcedItem { label: string; value: string; basis: string; gbp: number | null; drives: string[] }
export interface CoreAlert { kind: 'route' | 'scope'; title: string; lines: string[] }
export interface CoreOperation { name: string; machine: string; bench: boolean; cycleMin: number; partsPerCycle: number; crew: number;
  machinePerHr: number | null; labourPerHr: number; ratePerHr: number; gbp: number }
export interface CoreCapacityRow { machine: string; operations: number; hoursPerYear: number; availableHours: number; machines: number }
export interface CoreParam { name: string; label: string; value: string; basis: string; question: string }
export interface CoreRouteRow { name: string; total: number; deltaGbp: number; deltaPct: number; band: { p10: number; p90: number; plusMinusPct: number } | null; toolingGbp: number | null; note: string | null }
export interface CoreCountryRow { name: string; total: number; vsBasePct: number; isBase: boolean; approx: boolean }
export interface CoreDfmFinding { ruleId: string; severity: string; title: string; count: number; amount: string | null; fix: string }

export interface CoreReport {
  exec: ExecutiveSummary;
  part: string;
  commodity: string | null;
  commodityId: string | null;
  country: string;
  region: string;
  stamp: string | null;
  total: number;
  annualVolume: number | null;
  programmeYears: number | null;
  annualSpend: number | null;
  /** The stack re-run with no tooling: the tooling's own overhead and margin come out with it. */
  pieceExToolingGbp: number;
  tooling: CoreTooling;
  band: { p10: number; p90: number; plusMinusPct: number } | null;
  bandNote: string;
  confidence: {
    grade: string;
    /** Distinct inputs (a rate shared by 9 operations counts once), by grade. */
    distinct: { total: number; high: number; medium: number; low: number };
    lowInputs: Array<{ label: string; value: number; unit: string; operations: number }>;
    sentence: string;
  };
  /** `ruleBasis` false: the costing carries no rule values (not a CAD costing), so the form's inputs are not graded. */
  unsourced: { items: CoreUnsourcedItem[]; totalGbp: number; sharePct: number; method: string; ruleBasis: boolean };
  alerts: CoreAlert[];
  openQuestions: string[];
  notIncluded: string[];
  terms: string;
  buckets: Array<{ label: string; gbp: number; sharePct: number }>;
  material: { lines: CoreMaterialLine[]; metalGbp: number; consumablesGbp: number; energyGbp: number; boughtInGbp: number; totalGbp: number };
  perKg: { kg: number; kgLabel: string; pricePerKg: number; metalPerKg: number } | null;
  commercial: Array<{ label: string; value: string; source: string }>;
  spec: Array<{ question: string; answer: string }>;
  operations: CoreOperation[];
  capacity: { formula: string; rows: CoreCapacityRow[] } | null;
  keyParams: CoreParam[];
  sensitivity: Array<{ label: string; base: number; unit: string; minusGbp: number; plusGbp: number }>;
  sensitivityPct: number;
  volumeLine: string | null;
  negotiation: Array<{ driver: string; ours: string; question: string }>;
  quoteBreakdown: string[];
  levers: ExecutiveLever[];
  routes: { reference: string; rows: CoreRouteRow[]; notShown: number; principle: string } | null;
  countries: { rows: CoreCountryRow[]; note: string };
  dfm: { findings: CoreDfmFinding[]; considered: number; notChecked: string; status: 'ran' | 'pending' | 'not run' };
}

const UNSOURCED_RE = /not sourced|engineering[- ]typical|heuristic/i;
/** Operations that are not the primary forming / moulding step (a crew or a cycle rule drives the primary step). */
const SECONDARY_OP_RE = /trim|deflash|inspect|\bndt\b|\bndi\b|fettl|blast|set-?up|change|load|pallet|deburr|wash|heat|machin|drill|bor(e|ing)\b|turn|mill|grind|cut-to|\bsaw|ageing|age\b|melt|pack|descale|c-scan|gauge|cure oven|post-?cure/i;

interface CostLine { id: string; label: string; gbp: number; text: string }

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
  const tl = input.tooling;
  const vol = tl.mode === 'amortized' && tl.amortizationVolume > 0 ? tl.amortizationVolume : 0;
  const tooling: CostLine[] = vol ? ((tl.items?.length ? tl.items : [{ label: 'Tooling (not itemised)', gbp: tl.totalToolingCost }])
    .map((t, i) => ({ id: `tool:${i}`, label: `${t.label.split(':')[0].split(' (')[0]} a part`, gbp: t.gbp / vol, text: t.label }))) : [];
  return { consumables, energy, ops, tooling };
}

/** Which cost lines a rule value drives, matched by name; null = it moves the whole cost (yield, scrap, OEE, batch …). */
function attributeRule(key: string, c: ReturnType<typeof costLinesOf>): CostLine[] | null {
  const cons = (re: RegExp) => c.consumables.filter(l => re.test(l.text));
  const opsAll = (re: RegExp) => c.ops.filter(o => re.test(o.name)).flatMap(o => [o.process, o.labour]);
  const casting = /^cam[\s-]|cast/i.test(key);
  const primary = c.ops.filter(o => !o.bench && (casting ? /cast|mould|pour/i.test(o.name) : !SECONDARY_OP_RE.test(o.name)));
  const nonEmpty = (ls: CostLine[]) => (ls.length ? ls : null);
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
  if (/set[\s-]?up[\s-]?time|setup[\s-]?hr|die[\s-]?chg|change[\s-]?over/i.test(key)) return nonEmpty(opsAll(/set-?up|change/i));
  if (/fixture|mach[\s-]?tooling/i.test(key)) return nonEmpty(c.tooling.filter(l => /fixture/i.test(l.text)));
  if (/prog/i.test(key)) return nonEmpty(c.tooling.filter(l => /program/i.test(l.text)));
  if (/(die|mould|mold|tool)[\s-]?(life|cost)|pattern/i.test(key)) return nonEmpty(c.tooling.filter(l => !/fixture|program|inspection master|first article/i.test(l.text)));
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

/** The material bucket split into metal (index-linked) / consumables & bought services / energy / bought-in — adds to bucket 1. */
export function materialSplit(result: PartCostResult, input: UniversalStackInput, library: RateLibrary): CoreReport['material'] {
  const rm = input.rawMaterial;
  const lines: CoreMaterialLine[] = [];
  let metal = 0;
  if (rm.directCost !== undefined) {
    metal = rm.directCost;
    const names = (rm.lines ?? []).map(l => l.ref || l.description).filter(Boolean).slice(0, 4).join(', ');
    lines.push({ group: 'direct', label: `Material priced by the commodity module${names ? ` (${names})` : ''}`, gbp: metal });
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

/** Machines implied at the annual volume: Σ annual × cycle ÷ parts a cycle ÷ OEE over the operations on a machine, ÷ its annual hours. */
export function capacityImplied(input: UniversalStackInput, library: RateLibrary, annual: number): CoreCapacityRow[] {
  const by = new Map<string, CoreCapacityRow>();
  for (const op of input.operations) {
    if (op.benchOperation || !(op.cycleTimeHr > 0)) continue;
    const m = library.machines.find(x => x.id === op.machineId);
    const avail = m?.buildup?.annualAvailableHours ?? 0;
    if (!m || !(avail > 0)) continue;
    const hrs = annual * op.cycleTimeHr / (op.partsPerCycle > 0 ? op.partsPerCycle : 1) / (op.oee > 0 ? op.oee : 1);
    const row = by.get(m.id) ?? { machine: m.machineClass, operations: 0, hoursPerYear: 0, availableHours: avail, machines: 0 };
    row.operations += 1; row.hoursPerYear += hrs; row.machines = row.hoursPerYear / avail;
    by.set(m.id, row);
  }
  return [...by.values()].sort((a, b) => b.machines - a.machines);
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n).replace(/[\s,;:(—–-]+$/, '')}…`);
const ruleKey = (r: { label: string; fieldId?: string }) => `${r.label} ${r.fieldId ?? ''}`.trim();

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

  // Piece price without tooling — the stack re-run (the tooling's overhead and margin leave with it).
  let pieceEx = total - result.breakdown.tooling;
  try { pieceEx = computeUniversalStack({ ...input, tooling: { ...input.tooling, totalToolingCost: 0 } }, library).total; } catch { /* keep the bucket difference */ }
  const tooling = toolingSplit(input, result);

  // Confidence by DISTINCT input: a rate shared by nine operations is one input.
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
  const grade = overallConfidence(result);

  // The £ resting on figures labelled "not sourced / engineering-typical": each cost line such a value drives (matched
  // by name) or whose own basis says so, counted once, before overhead and margin.
  const cl = costLinesOf(result, input);
  const counted = new Map<string, CostLine>();
  const unsourcedItems: CoreUnsourcedItem[] = [];
  for (const rv of meta.checks?.ruleValues ?? []) {
    if (!UNSOURCED_RE.test(rv.basis)) continue;
    const lines = attributeRule(ruleKey(rv), cl);
    for (const l of lines ?? []) counted.set(l.id, l);
    const gbp = lines ? lines.reduce((s, l) => s + l.gbp, 0) : null;
    unsourcedItems.push({ label: rv.label, value: reportNoteText(String(rv.value)), basis: clip(reportNoteText(rv.basis), 150), gbp, drives: (lines ?? []).map(l => l.label) });
  }
  const selfLabelled: CostLine[] = [
    ...cl.consumables.filter(l => UNSOURCED_RE.test(l.text)),
    ...cl.energy.filter(l => UNSOURCED_RE.test(l.text)),
    ...cl.ops.filter(o => UNSOURCED_RE.test(o.name)).flatMap(o => [o.process, o.labour]).filter(l => l.gbp > 0),
  ].filter(l => !counted.has(l.id));
  for (const l of selfLabelled) {
    counted.set(l.id, l);
    unsourcedItems.push({ label: l.label, value: '—', basis: clip(reportNoteText(l.text), 150), gbp: l.gbp, drives: [l.label] });
  }
  unsourcedItems.sort((x, y) => (y.gbp ?? -1) - (x.gbp ?? -1));
  const unsourcedGbp = [...counted.values()].reduce((s, l) => s + l.gbp, 0);

  // Alerts: a feasible route ≥ 20 % cheaper at the programme volume; uncosted scope.
  const alerts: CoreAlert[] = [];
  const x = meta.routeComparison && meta.routeComparison.rows.length ? meta.routeComparison : null;
  const ref = x ? routeReferenceRow(x) : null;
  const refTotal = ref?.total ?? null;
  let routes: CoreReport['routes'] = null;
  if (x && ref && refTotal != null && refTotal > 0) {
    // only rows the comparison judges credible (route-compare.ts notCredibleReasons: brittle iron on a safety part, machining
    // from solid below the material-use floor …); the audit pack prints the others with their reasons
    const costed = x.rows.filter(r => r !== ref && r.total != null && !r.refusal && r.credible !== false);
    const rows: CoreRouteRow[] = costed
      .map(r => ({ r, d: r.total! / refTotal - 1 }))
      .filter(({ d }) => d <= 0.5)
      .sort((p, q) => p.d - q.d)
      .map(({ r, d }) => ({
        name: routeRowLabel(r, x.labels), total: r.total!, deltaGbp: r.total! - refTotal, deltaPct: Math.round(d * 1000) / 10,
        band: r.band ? { p10: r.band.p10, p90: r.band.p90, plusMinusPct: r.band.plusMinusPct } : null,
        toolingGbp: r.tooling?.investment ?? null,
        note: x.crossovers.find(k => k.route === r.route && k.process === r.process)?.text ?? null,
      }));
    routes = { reference: routeRowLabel(ref, x.labels), rows, notShown: x.excluded.length + (costed.length - rows.length) + x.rows.filter(r => r !== ref && (r.total == null || r.refusal || r.credible === false)).length, principle: x.principle };
    for (const row of rows.filter(r => r.deltaPct <= -20)) {
      alerts.push({ kind: 'route', title: `A feasible route is ${Math.abs(row.deltaPct).toFixed(0)} % cheaper: ${row.name}`,
        lines: [`${row.name} costs £${row.total.toFixed(2)} a part against £${refTotal.toFixed(2)} for the costed route at ${x.programme.annualVolume.toLocaleString('en-GB')} a year`
          + (annual ? ` — £${Math.round(Math.abs(row.deltaGbp * annual)).toLocaleString('en-GB')} a year less` : '') + '. Both are re-costs of the same part in the same material (Alternatives).'] });
    }
  }
  if (meta.featureLinesInCost && meta.featureLines?.length) {
    const rate = meta.featureMachineRatePerHr ?? 0;
    const oee = meta.featureMachineOee != null && meta.featureMachineOee > 0 && meta.featureMachineOee <= 1 ? meta.featureMachineOee : 1;
    const turned = (l: FeatureMachiningLine) => !!meta.featureTurningOp && (l.kind === 'boss' || /turn/i.test(l.operation));
    const not = meta.featureLines.filter(l => !l.included && !turned(l));
    if (not.length) {
      const min = not.reduce((s, l) => s + l.totalMinutes, 0);
      const n = not.reduce((s, l) => s + l.count, 0);
      const gbp = (min / 60) * rate / oee;
      alerts.push({ kind: 'scope', title: `Uncosted scope: ${n} machinable feature${n === 1 ? '' : 's'} detected and NOT in this price`,
        lines: [`${n} feature instance(s), ${min.toFixed(1)} min, could add up to £${gbp.toFixed(2)} of machine time (minutes ÷ 60 × £${rate.toFixed(2)}/h ÷ OEE ${+oee.toFixed(3)}); `
          + 'operator, overhead and margin come on top. Confirm which are machined before using this price.',
          `Features: ${not.slice(0, 6).map(l => `${l.count}× ${l.kind}${l.diaMm ? ` Ø${l.diaMm.toFixed(1)}` : ''}`).join(', ')}${not.length > 6 ? ', …' : ''}.`] });
    }
  }

  const decisionsAll = meta.checks?.decisions ?? [];
  // Scope: the commodity's "Not included until answered" list, without the items the costing does price.
  const costedText = [...input.operations.map(o => o.operationName), ...(input.rawMaterial.consumablesItems ?? []).map(i => i.label), ...(input.tooling.items ?? []).map(i => i.label)].join(' | ');
  // + what an answered "Yes" calls for that this route does not price (service-questions.ts serviceNotCosted)
  const answers: Record<string, unknown> = Object.fromEntries(decisionsAll.filter(d => d.answer != null && d.answer !== '')
    .map(d => [d.id, /^yes$/i.test(String(d.answer)) ? 'yes' : /^no$/i.test(String(d.answer)) ? 'no' : d.answer]));
  const matCat = library.materials.find(m => m.id === input.rawMaterial.materialId)?.category ?? '';
  let fromAnswers: string[] = [];
  try {
    fromAnswers = serviceNotCosted(String(commodity ?? ''), answers, { heavyAlloyCasting: /iron|steel|copper|bronze|brass|nickel/i.test(matCat) })
      .map(n => `${n.item} — ${n.reason}`);
  } catch { /* no service questions for this commodity */ }
  const notIncluded = [
    ...fromAnswers,
    ...(input.deliveryTerms === 'EXW' ? ['Freight to your plant — the price is ex-works (EXW)'] : []),
    'Import duty, customs and cross-border shipping',
    ...(input.tooling.totalToolingCost > 0 && input.tooling.mode === 'one_time_nre' ? ['Tooling — charged once, separately'] : []),
    ...std.notIncluded.filter(i => !(i.costedIf && i.costedIf.test(costedText))).map(i => i.text),
  ];

  const decisions = meta.checks?.decisions ?? [];
  const answerOf = (d: typeof decisions[number]) => decisionAnswerLabel(d.id, d.answer, { routeLabels: COMMODITY_REPORT_LABELS, grades: library.materials });
  const openQuestions = decisions.filter(d => d.answer == null || d.answer === '')
    .map(d => `${d.question} — ${decisionAnswerText({ severity: d.severity, answer: null, used: d.used })}`);
  const spec = decisions.map(d => ({ question: d.question, answer: decisionAnswerText({ severity: d.severity, answer: answerOf(d), used: d.used }) }));

  const b = result.breakdown;
  const buckets = ([
    ['1. Material', b.rawMaterial], ['2. Process (machine)', b.process], ['3. Direct labour', b.labour], ['4. Tooling (amortised)', b.tooling],
    ['5. Packaging', b.packaging], ['6. Logistics', b.logistics], ['7. Overhead', b.overhead], ['8. Margin', b.margin],
  ] as Array<[string, number]>).map(([label, gbp]) => ({ label, gbp, sharePct: share(gbp) }));

  const material = materialSplit(result, input, library);
  const kgCostedOn = input.rawMaterial.netWeightKg;
  const castOrForge = /cast|forg/.test(String(commodity ?? ''));
  const perKg = castOrForge && kgCostedOn > 0 ? {
    kg: kgCostedOn, kgLabel: /forg/.test(String(commodity)) ? 'as forged' : 'as cast',
    pricePerKg: total / kgCostedOn, metalPerKg: material.metalGbp / kgCostedOn,
  } : null;

  const defaultOverhead = regionalShopDefaults(regionCode as ManufacturingRegion).overheadPct;
  const commercial = [
    { label: 'Overhead', value: `${(input.overheadPct * 100).toFixed(1)} % of material + process + labour + tooling`,
      source: Math.abs(input.overheadPct - defaultOverhead) < 1e-9 ? 'CostVision default, not sourced — not a market benchmark' : 'as entered on the costing' },
    { label: 'Margin', value: `${(input.marginPct * 100).toFixed(1)} % of the subtotal`, source: 'the figure on the costing form (CostVision default unless typed), not sourced' },
    { label: 'Packaging', value: `£${input.packagingPerPart.toFixed(4)} a part`,
      source: meta.pkgLogisticsEstimated === false ? 'as entered on the costing' : 'CostVision default from the part\'s size, not sourced — replace with the supplier\'s pack' },
    { label: 'Terms', value: deliveryTermsLine(input.deliveryTerms), source: 'as selected on the costing' },
  ];

  const operations: CoreOperation[] = result.operationDetails.map(o => {
    const m = library.machines.find(x2 => x2.id === o.machineId);
    const bench = !!o.benchOperation;
    const machinePerHr = bench ? null : o.machineRateUsed;
    const labourPerHr = o.labourRateUsed * o.manning;
    return { name: shortOperationName(o.operationName), machine: bench ? 'Bench (labour only)' : (m?.machineClass ?? 'machine'), bench,
      cycleMin: (bench ? o.labourTimeHr : o.cycleTimeHr) * 60, partsPerCycle: o.partsPerCycle, crew: o.manning,
      machinePerHr, labourPerHr, ratePerHr: (machinePerHr ?? 0) + labourPerHr, gbp: o.processCost + o.labourCost };
  });
  const capacity = annual ? {
    formula: `machines = ${annual.toLocaleString('en-GB')} a year × cycle ÷ parts a cycle ÷ OEE, summed over the operations on the machine, ÷ the machine's annual available hours (rate book)`,
    rows: capacityImplied(input, library, annual),
  } : null;

  // Key process parameters and the negotiation sheet: the commodity's drivers, matched to the values the rules set.
  const rvs = meta.checks?.ruleValues ?? [];
  const used = new Set<number>();
  const keyParams: CoreParam[] = [];
  for (const d of std.keyDrivers) {
    const i = rvs.findIndex((r, k) => !used.has(k) && d.match.test(ruleKey(r)));
    if (i < 0) continue;
    used.add(i);
    keyParams.push({ name: d.name, label: rvs[i].label, value: clip(reportNoteText(String(rvs[i].value)), 60), basis: clip(reportNoteText(rvs[i].basis), 140), question: d.question });
  }
  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const topOp = [...operations].filter(o => !o.bench).sort((p, q) => q.gbp - p.gbp)[0];
  const negotiation = [
    ...(mat && input.rawMaterial.directCost === undefined ? [{ driver: 'Material price', ours: `${mat.grade}: £${mat.pricePerKg.toFixed(4)}/kg (rate book)`, question: 'What price a kg do you buy at, and which index does it follow?' }] : []),
    ...keyParams.map(p => ({ driver: p.name, ours: `${p.value} (${p.label})`, question: p.question })),
    ...(topOp ? [{ driver: `Largest operation: ${clip(topOp.name, 50)}`, ours: `${topOp.cycleMin.toFixed(2)} min on ${topOp.machine}; machine + crew £${topOp.ratePerHr.toFixed(2)}/h`, question: 'What is your cycle and your machine-hour rate for it?' }] : []),
    ...(tooling.totalGbp > 0 ? [{ driver: 'Tooling', ours: `£${Math.round(tooling.totalGbp).toLocaleString('en-GB')} over the programme${tooling.unsplitGbp > 0.5 ? ' (not split into first set and replacements)' : ` (first set £${Math.round(tooling.initialGbp).toLocaleString('en-GB')})`}`, question: 'Tooling as a lump sum (first set) and replacements in the piece price — which do you quote?' }] : []),
    { driver: 'Overhead and margin', ours: `${(input.overheadPct * 100).toFixed(1)} % + ${(input.marginPct * 100).toFixed(1)} %`, question: 'What overhead and margin do you apply, and on what base?' },
  ];

  let sensitivity: CoreReport['sensitivity'] = [];
  const sensitivityPct = 10;
  try {
    sensitivity = runSensitivity(input, library, sensitivityPct).drivers.slice(0, 5).map(d => ({
      label: moverLabel(d.driver), base: d.baseValue, unit: d.unit, minusGbp: r4(d.minusCost - total), plusGbp: r4(d.plusCost - total) }));
  } catch { /* nothing to vary */ }
  const volumeLine = ref && ref.byVolume.length
    ? ref.byVolume.filter(p => p.total != null).map(p => `£${p.total!.toFixed(2)} at ${p.volume.toLocaleString('en-GB')}/yr`).join(' · ') : null;

  // Country rows: the screen's, or the part re-costed in each country's book, as §9 of the audit pack prints them.
  let countries: CoreReport['countries'] = { rows: [], note: '' };
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
    };
  } catch { /* no country table */ }

  // Design to cost: at most five geometric findings that apply to the costed process and carry a re-costed £ or a
  // blocking / major severity.
  const g = meta.geometricDFM;
  let dfm: CoreReport['dfm'];
  if (g) {
    const amounts = meta.geometricDFMAmounts ?? {};
    const applies = (g.grouped ?? []).filter(gr => dfmRuleApplies(commodity, gr.ruleId));
    // BLOCKING / COST / RISK / INFO (dfm-geometry/types.ts): a re-costed £, or blocking / cost / risk — never INFO
    const grade = (gr: { severity: string; totalCostGBP?: number }) => normaliseSeverity(gr.severity, (gr.totalCostGBP ?? 0) > 0);
    const rank = (gr: { severity: string; totalCostGBP?: number }) => SEVERITY_RANK[grade(gr)];
    const pick = applies.filter(gr => amounts[gr.ruleId] || rank(gr) <= 2)
      .sort((p, q) => (amounts[q.ruleId] ? 1 : 0) - (amounts[p.ruleId] ? 1 : 0) || rank(p) - rank(q));
    dfm = {
      findings: pick.slice(0, 5).map(gr => ({ ruleId: gr.ruleId, severity: SEVERITY_LABEL[grade(gr)], title: gr.title, count: gr.count,
        amount: amounts[gr.ruleId]?.text ?? null, fix: clip(gr.recommendation ?? '', 150) })),
      considered: (g.grouped ?? []).length,
      notChecked: `Not checked: tolerances, datums and finish call-outs (no drawing is read)${g.limitations.length ? `; ${g.limitations.length} further limit${g.limitations.length === 1 ? '' : 's'} of the check in the audit pack` : ''}.`,
      status: 'ran',
    };
  } else {
    dfm = { findings: [], considered: 0, status: meta.geometricDFMPending ? 'pending' : 'not run',
      notChecked: meta.geometricDFMPending ? 'The geometric DFM check had not finished when this report was made — export again for its findings.'
        : 'No geometric DFM check ran for this costing (no CAD model, or no rule pack for the commodity).' };
  }

  return {
    exec, part: result.partName, commodity: exec.commodity, commodityId: commodity, country: exec.country, region: regionCode,
    stamp: meta.stamp ?? null, total, annualVolume: annual, programmeYears: years, annualSpend: annual ? r4(total * annual) : null,
    pieceExToolingGbp: pieceEx, tooling,
    band: { p10: u.p10, p90: u.p90, plusMinusPct: u.plusMinusPct },
    bandNote: 'the spread of the inputs, not the model\'s error — accuracy not yet measured against a price paid',
    confidence: {
      grade, distinct: { total: dl.length, high: cnt('High'), medium: cnt('Medium'), low: cnt('Low') }, lowInputs,
      sentence: `${dl.length} distinct inputs: ${cnt('High')} High, ${cnt('Medium')} Medium, ${cnt('Low')} Low (a rate shared by several operations counts once)`,
    },
    unsourced: {
      items: unsourcedItems, totalGbp: unsourcedGbp, sharePct: share(unsourcedGbp), ruleBasis: (meta.checks?.ruleValues?.length ?? 0) > 0,
      method: 'Each cost line (an operation\'s machine or labour, a consumable or service line, an energy line, a tooling item a part) that a value '
        + 'labelled "not sourced", "engineering-typical" or "heuristic" drives — matched by name — or whose own basis says so, counted once, before '
        + 'overhead and margin. A value that moves the whole cost (yield, scrap, OEE, batch) is listed without a figure.',
    },
    alerts, openQuestions, notIncluded, terms: deliveryTermsLine(input.deliveryTerms),
    buckets, material, perKg, commercial, spec, operations, capacity, keyParams,
    sensitivity, sensitivityPct, volumeLine, negotiation, quoteBreakdown: std.quoteBreakdown, levers: exec.levers.length ? exec.levers : [],
    routes, countries, dfm,
  };
}

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
import { REGIONAL_DATA, type ManufacturingRegion } from '../engine/regional-rates.js';

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
  decisions?: ReadonlyArray<{ question: string; severity: string; answer: string | null; used?: string | null }> | null;
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

/** A sensitivity driver as a reader names it: "Labour Rate — shared by 9 ops (op, op, …)" → "Labour rate, shared by 9 operations". */
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
      const ctx = { region: regionCode, volumeProvided: a.volumeProvided ?? !!annual, pkgLogisticsEstimated: !!a.pkgLogisticsEstimated, library };
      const ranked = rankOpportunities(generateDFMDFA(result, input, a.commodity, ctx), result.total);
      levers = ranked.all.slice(0, TOP).map(o => ({
        action: o.action, savingGbp: r4(o.savingPerPart), savingPct: o.savingPct,
        basis: (o.recostBasis ?? '').split(' → ')[0],
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

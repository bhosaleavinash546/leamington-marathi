/**
 * Negotiation intelligence — automatic supplier-quote teardown.
 *
 * The agent ingests a supplier quote, runs a parameter-level comparison against
 * the should-cost, and produces a deep, DEFENSIBLE negotiation report:
 *   • gap teardown       — where the money is, ranked in £
 *   • benchmark flags     — cost elements above their normal industry range
 *   • causal diagnosis    — "the gap implies aluminium ~14% above spot"
 *   • negotiation levers  — the precise move to pull for each gap
 *   • supplier questions  — targeted, per detected discrepancy
 *   • closing plays        — how to actually close each gap, with £ recovery
 *
 * Two honest modes:
 *   A. LINE-BY-LINE  — the supplier disclosed a breakdown → compare each of their
 *      lines to our should-cost bucket. True parameter-level teardown.
 *   B. ATTRIBUTION    — only a total was given (the common case) → we cannot see
 *      their lines, so we ATTRIBUTE the gap: is it inside our empirical band?
 *      what commodity move would it imply? which of our buckets, if inflated,
 *      would explain it? Deep, but honestly labelled as attribution.
 *
 * Fully deterministic and glass-box: every number is arithmetic on the
 * should-cost the engine already produced; the LLM (if used) only helps read a
 * pasted quote into these fields, it never decides a number.
 */

import type { Breakdown8Bucket } from './types.js';

export type Bucket = keyof Breakdown8Bucket;

const BUCKET_LABEL: Record<Bucket, string> = {
  rawMaterial: 'Raw Material', process: 'Process', labour: 'Labour', tooling: 'Tooling',
  packaging: 'Packaging', logistics: 'Logistics', overhead: 'Overhead (SG&A)', margin: 'Margin',
};

export type QuoteBreakdown = Partial<Record<Bucket, number>>;

export interface TeardownInput {
  commodity: string;
  shouldCost: number;                 // our total should-cost
  shouldBreakdown: Breakdown8Bucket;  // our 8-bucket model
  supplierQuoteGBP: number;           // supplier's total
  supplierBreakdown?: QuoteBreakdown; // supplier's line items, if disclosed (Case A)
  annualVolume?: number;              // to annualise the opportunity
  materialFamily?: string;
  /** Optional causal signal: how far above today's index the total gap implies (%). */
  impliedIndexPremiumPct?: number | null;
  indexCategory?: string | null;      // e.g. 'Aluminium'
  /** Optional empirical band: ± half-width % from the conformal model. */
  conformalHalfWidthPct?: number | null;
}

export interface GapLine {
  bucket: Bucket;
  label: string;
  shouldGBP: number;
  quoteGBP: number | null;            // present in line-by-line mode
  gapGBP: number;                     // quote − should (per part)
  gapPct: number;                     // vs the should-cost bucket (or vs total in attribution)
  benchmark: { loPct: number; hiPct: number; sharePct: number; over: boolean } | null;
  severity: 'high' | 'medium' | 'low';
}

export interface Lever { area: string; lever: string; expectedRecoveryGBP: number }
export interface ClosingPlay { gap: string; play: string }

export interface NegotiationReport {
  mode: 'line-by-line' | 'attribution';
  verdict: {
    ppvGBP: number;                   // quote − should (per part)
    ppvPct: number;
    annualImpactGBP: number;
    rag: 'green' | 'amber' | 'red';
    withinConformal: boolean | null;  // is the quote inside our empirical band?
  };
  causalDiagnosis: string | null;
  gaps: GapLine[];
  benchmarkFlags: string[];
  levers: Lever[];
  supplierQuestions: string[];
  closingPlays: ClosingPlay[];
  totalOpportunityGBP: number;        // annualised, ranked opportunities summed
  headline: string;                   // one-line summary for cards
}

// Universal commercial benchmark ranges (share of total). These are sector norms
// that hold regardless of commodity — the most defensible flags.
const COMMERCIAL_BENCHMARK: Partial<Record<Bucket, { lo: number; hi: number }>> = {
  overhead: { lo: 0.08, hi: 0.18 },
  margin:   { lo: 0.05, hi: 0.12 },
};

// Deterministic negotiation playbook keyed by bucket — precise, defensible.
const PLAYBOOK: Record<Bucket, { lever: string; question: string; closing: string }> = {
  rawMaterial: {
    lever: 'Index-link material to a published benchmark (LME/CRU) and challenge any grade over-specification.',
    question: 'What material grade and index basis underlie your price — and will you index-link future changes to LME/CRU spot?',
    closing: 'Agree an index-linked material clause; recover the premium above spot from the next PO.',
  },
  process: {
    lever: 'Request the process routing and challenge cycle-time / machine-rate assumptions; explore multi-cavity or a lower-rate machine class.',
    question: 'What cycle time, machine class and hourly rate are assumed? Can you share the routing so we can validate it?',
    closing: 'Hold process cost at the validated cycle × rate from our model; book the delta as the saving.',
  },
  labour: {
    lever: 'Validate manning and the fully-loaded labour rate against the regional benchmark; challenge single-operator vs multi-machine assumptions.',
    question: 'What manning level and loaded labour rate are assumed, and in which region is the work performed?',
    closing: 'Re-rate labour at the benchmark region rate and agreed manning.',
  },
  tooling: {
    lever: 'Split tooling from piece price and amortise over the full programme volume, or move to OEM-owned tooling with a one-time payment; obtain a competitive toolroom quote.',
    question: 'What tool cost and amortisation volume are assumed? Is the tooling OEM-owned, and can it be quoted separately?',
    closing: 'Separate tooling from piece price; amortise over the agreed volume — drops the per-part charge immediately.',
  },
  packaging: {
    lever: 'Move to returnable dunnage and challenge one-way packaging cost per part.',
    question: 'Is packaging one-way or returnable, and what is the per-trip cost basis?',
    closing: 'Switch to returnable packaging pooled across the programme.',
  },
  logistics: {
    lever: 'Re-quote the inbound freight lane; consolidate shipments or move to Ex-Works with our nominated carrier.',
    question: 'What Incoterm, lane and shipment frequency underlie the logistics cost?',
    closing: 'Re-base freight on our carrier rate for the lane; consolidate to cut per-part cost.',
  },
  overhead: {
    lever: 'Benchmark SG&A against sector norms; request open-book or a volume-based overhead rebate.',
    question: 'What overhead rate is applied, and on what base? Can we move to open-book above a volume threshold?',
    closing: 'Cap overhead at the sector benchmark; step it down against volume commitments.',
  },
  margin: {
    lever: 'Negotiate margin toward the sector norm in exchange for a volume commitment or a multi-year LTA.',
    question: 'What margin is included, and what volume or contract term would move it toward benchmark?',
    closing: 'Trade a longer term / higher volume for a margin step-down into the benchmark band.',
  },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round0 = (n: number) => Math.round(n);
const BUCKETS: Bucket[] = ['rawMaterial', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'];

function severityFor(gapPct: number): GapLine['severity'] {
  return gapPct >= 20 ? 'high' : gapPct >= 8 ? 'medium' : 'low';
}

/** Run the full teardown. Deterministic — every field is arithmetic on the inputs. */
export function analyzeQuote(input: TeardownInput): NegotiationReport {
  const { shouldCost, shouldBreakdown, supplierQuoteGBP } = input;
  const vol = Math.max(1, input.annualVolume ?? 1);
  const ppvGBP = round2(supplierQuoteGBP - shouldCost);
  const ppvPct = shouldCost > 0 ? round1((ppvGBP / shouldCost) * 100) : 0;
  const annualImpactGBP = round0(ppvGBP * vol);
  const rag: NegotiationReport['verdict']['rag'] =
    Math.abs(ppvPct) <= 5 ? 'green' : ppvPct > 15 || ppvPct < -15 ? 'red' : 'amber';
  const withinConformal = input.conformalHalfWidthPct != null && shouldCost > 0
    ? Math.abs(ppvPct) <= input.conformalHalfWidthPct
    : null;

  const hasBreakdown = !!input.supplierBreakdown && Object.values(input.supplierBreakdown).some(v => (v ?? 0) > 0);
  const mode: NegotiationReport['mode'] = hasBreakdown ? 'line-by-line' : 'attribution';

  const gaps: GapLine[] = [];
  const benchmarkFlags: string[] = [];

  if (hasBreakdown) {
    // ── Case A: true parameter-level teardown ──────────────────────────────
    const sb = input.supplierBreakdown!;
    for (const b of BUCKETS) {
      const should = shouldBreakdown[b] ?? 0;
      const quote = sb[b];
      if (quote == null) continue;
      const gapGBP = round2(quote - should);
      const gapPct = should > 0 ? round1((gapGBP / should) * 100) : (quote > 0 ? 100 : 0);
      const sharePct = supplierQuoteGBP > 0 ? round1((quote / supplierQuoteGBP) * 100) : 0;
      const bm = COMMERCIAL_BENCHMARK[b];
      let benchmark: GapLine['benchmark'] = null;
      if (bm) {
        const over = sharePct > bm.hi * 100;
        benchmark = { loPct: bm.lo * 100, hiPct: bm.hi * 100, sharePct, over };
        if (over) benchmarkFlags.push(`${BUCKET_LABEL[b]} is ${sharePct}% of the quote — above the ${bm.lo * 100}–${bm.hi * 100}% norm.`);
      }
      gaps.push({ bucket: b, label: BUCKET_LABEL[b], shouldGBP: round2(should), quoteGBP: round2(quote), gapGBP, gapPct, benchmark, severity: severityFor(gapPct) });
    }
  } else {
    // ── Case B: attribution (total only) ───────────────────────────────────
    // We cannot see supplier lines; surface OUR bucket shares so the buyer knows
    // where cost normally sits, and flag commercial buckets whose SHOULD-COST
    // share already sits high (a supplier will only be higher).
    for (const b of BUCKETS) {
      const should = shouldBreakdown[b] ?? 0;
      if (should <= 0) continue;
      const sharePct = shouldCost > 0 ? round1((should / shouldCost) * 100) : 0;
      const bm = COMMERCIAL_BENCHMARK[b];
      let benchmark: GapLine['benchmark'] = null;
      if (bm) benchmark = { loPct: bm.lo * 100, hiPct: bm.hi * 100, sharePct, over: sharePct > bm.hi * 100 };
      gaps.push({ bucket: b, label: BUCKET_LABEL[b], shouldGBP: round2(should), quoteGBP: null, gapGBP: 0, gapPct: 0, benchmark, severity: 'low' });
    }
  }

  // Rank gaps by £ (line-by-line) or by should-cost share (attribution).
  gaps.sort((a, b) => (hasBreakdown ? b.gapGBP - a.gapGBP : b.shouldGBP - a.shouldGBP));

  // ── Causal diagnosis ────────────────────────────────────────────────────
  let causalDiagnosis: string | null = null;
  if (ppvGBP > 0 && input.impliedIndexPremiumPct != null && input.impliedIndexPremiumPct > 0 && input.indexCategory) {
    causalDiagnosis = `The £${ppvGBP.toLocaleString()} gap is only justified if ${input.indexCategory} were ~${input.impliedIndexPremiumPct}% above today's index. Ask the supplier to evidence that, or the premium is margin.`;
  }

  // ── Levers, questions, closing plays for the buckets that matter ─────────
  const levers: Lever[] = [];
  const supplierQuestions: string[] = [];
  const closingPlays: ClosingPlay[] = [];

  // Which buckets to act on: over-benchmark, or (line-by-line) a positive gap.
  const actionable = gaps.filter(g =>
    (g.benchmark?.over) || (hasBreakdown && g.gapGBP > 0));
  // Always include material when there's an overall gap (the usual lever) in attribution mode.
  if (!hasBreakdown && ppvGBP > 0 && !actionable.some(g => g.bucket === 'rawMaterial')) {
    const rm = gaps.find(g => g.bucket === 'rawMaterial');
    if (rm) actionable.unshift(rm);
  }

  const seen = new Set<Bucket>();
  for (const g of actionable) {
    if (seen.has(g.bucket)) continue;
    seen.add(g.bucket);
    const pb = PLAYBOOK[g.bucket];
    // Expected recovery: the line gap (Case A), else a share of the total gap
    // attributed to this bucket by its should-cost weight (Case B).
    let recoveryPerPart = 0;
    if (hasBreakdown) recoveryPerPart = Math.max(0, g.gapGBP);
    else if (ppvGBP > 0 && shouldCost > 0) recoveryPerPart = round2(ppvGBP * (g.shouldGBP / shouldCost));
    const expectedRecoveryGBP = round0(recoveryPerPart * vol);
    if (expectedRecoveryGBP > 0 || g.benchmark?.over) {
      levers.push({ area: g.label, lever: pb.lever, expectedRecoveryGBP });
      supplierQuestions.push(pb.question);
      closingPlays.push({ gap: g.label, play: pb.closing });
    }
  }

  // If nothing flagged but there IS a gap, still give the top-level material lever.
  if (!levers.length && ppvGBP > 0) {
    const pb = PLAYBOOK.rawMaterial;
    levers.push({ area: 'Overall gap', lever: pb.lever, expectedRecoveryGBP: annualImpactGBP });
    supplierQuestions.push('Please provide a full cost breakdown (material, process, labour, tooling, overhead, margin) so we can validate the quote line-by-line.');
    closingPlays.push({ gap: 'Overall gap', play: pb.closing });
  }

  // Positive bucket gaps can exceed the net PPV when other buckets are BELOW
  // should-cost; a supplier will never concede past their net position, so cap
  // the headline opportunity at the net annual impact.
  const grossOpportunityGBP = round0(levers.reduce((s, l) => s + l.expectedRecoveryGBP, 0));
  const totalOpportunityGBP = Math.min(grossOpportunityGBP, Math.max(0, annualImpactGBP)) || Math.max(0, annualImpactGBP);

  const headline = ppvPct <= 5
    ? `Quote is within ${Math.abs(ppvPct)}% of should-cost — competitive; hold and confirm.`
    : `Quote is ${ppvPct}% above should-cost (£${ppvGBP.toLocaleString()}/part). Opportunity ≈ £${totalOpportunityGBP.toLocaleString()}/yr across ${levers.length} lever${levers.length === 1 ? '' : 's'}.`;

  return {
    mode,
    verdict: { ppvGBP, ppvPct, annualImpactGBP, rag, withinConformal },
    causalDiagnosis,
    gaps,
    benchmarkFlags,
    levers: levers.sort((a, b) => b.expectedRecoveryGBP - a.expectedRecoveryGBP),
    supplierQuestions,
    closingPlays,
    totalOpportunityGBP,
    headline,
  };
}

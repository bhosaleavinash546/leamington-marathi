/**
 * Savings-ranked opportunity view over the DFM/DFA engine.
 *
 * The rule engine internally grades findings (critical / major / minor) and
 * scores manufacturability out of 10 — useful arithmetic, but a poor way to
 * TALK to the people who designed the part: a score reads as a report card and
 * a "critical" tag reads as an accusation. Engineering teams disengage, and the
 * saving never gets implemented.
 *
 * This module re-presents exactly the same deterministic findings as a ranked
 * list of opportunities: what to do, what it is worth in money per part, how
 * long it takes and what it risks — grouped by category, biggest saving first.
 * No scores, no severities, nothing that grades the design.
 *
 * Nothing here re-derives cost. It reads the DFMDFAResult the engine already
 * produced and the part total the engine already calculated.
 */
import type { DFMDFAResult, DFMIssue, CostOptimisation, LeverCategory } from './dfm-dfa.js';

export interface RankedOpportunity {
  category: LeverCategory;
  /** Imperative, neutral: the action to take. */
  action: string;
  /** The observed fact in the costing that put this on the list. */
  basis: string;
  /** Supporting engineering/commercial reasoning, where the source carries it. */
  detail?: string;
  savingPct: number;
  /** Money per part — partTotal × savingPct. The number the ranking uses. */
  savingPerPart: number;
  risk: 'Low' | 'Medium' | 'High';
  timeframe: 'Quick Win' | 'Medium Term' | 'Long Term';
  /** Who can actually pull this lever. */
  owner?: 'design' | 'supplier' | 'sourcing' | 'assumption' | 'verified';
  /** Internal de-duplication key — the cost signal this opportunity acts on. */
  signal: string;
}

/** A finding that carries no saving: an input to confirm, or a decision the
 *  tool already took. Never ranked, never presented as a shortfall. */
export interface VerificationCheck {
  category: LeverCategory;
  title: string;
  detail: string;
  action: string;
  owner?: RankedOpportunity['owner'];
}

export interface OpportunityGroup {
  category: LeverCategory;
  label: string;
  opportunities: RankedOpportunity[];
  /** Indicative sum within the category — the headline never sums (see below). */
  groupSavingPerPart: number;
  topSavingPerPart: number;
}

export interface RankedOpportunities {
  /** Categories ordered by their biggest single opportunity. */
  groups: OpportunityGroup[];
  /** Every opportunity, flat, biggest saving first. */
  all: RankedOpportunity[];
  verificationChecks: VerificationCheck[];
  /** Root-sum-square of the top three — the same honest headline as before. */
  headlineSavingPct: number;
  headlineSavingPerPart: number;
  partTotal: number;
}

export const CATEGORY_LABELS: Record<LeverCategory, string> = {
  material: 'Material',
  design: 'Design & Geometry',
  process: 'Process & Automation',
  tooling: 'Tooling',
  logistics: 'Packaging & Logistics',
  commercial: 'Commercial & Sourcing',
  quality: 'Quality & Inspection',
  sustainability: 'Sustainability & Energy',
};

const CATEGORY_ORDER: LeverCategory[] = [
  'material', 'design', 'process', 'tooling', 'logistics', 'commercial', 'quality', 'sustainability',
];

/**
 * The cost signal a finding acts on, matched on the TITLE only — titles are
 * short and specific, whereas a recommendation sentence name-checks half a
 * dozen levers and would collapse unrelated rows together.
 *
 * Order is specificity order: the first pattern that matches wins, so the
 * narrow keys (labour efficiency, labour-vs-cycle, manning) must precede the
 * broad one they would otherwise be swallowed by (labour/automation).
 */
const SIGNAL_PATTERNS: Array<[string, RegExp]> = [
  ['routing',      /split routing|separate stations|multi-axis|consolidat|re-quote machining|operation count|forming operations|forming stages|assembly operations|assembly stages|secondary operations|complexity harness|re-fixtur/i],
  ['bottleneck',   /one operation dominates|bottleneck/i],
  ['labour-eff',   /labour efficiency/i],
  ['labour-cycle', /exceeds the machine cycle/i],
  ['manning',      /manning/i],
  ['inspection',   /inspection/i],
  ['finishing',    /finishing/i],
  ['cavity',       /cavity|multi-up/i],
  ['mat-util',     /material utilisation|nesting|near-net|runner|sprue|regrind|scrap revenue|offcut/i],
  ['mat-grade',    /alloy grade|material grade|lightweight|wall optimisation|recycled/i],
  ['oee',          /oee|manual pacing|tpm/i],
  ['labour-auto',  /labour|automat|lights-out|layup|smt/i],
  ['tooling-cost', /tooling amortisation|die cost|mould cost|tooling is|tooling-dominated|nre|bridge tooling|tool-life|tooling ownership/i],
  ['consumables',  /consumable/i],
  ['overhead',     /overhead|facility/i],
  ['margin',       /margin|rfq/i],
  ['packaging',    /packaging|pack density/i],
  ['logistics',    /logistic|freight|near-shore/i],
  ['region',       /regional sourcing/i],
  ['tolerance',    /tolerance|distortion|seam weld/i],
  ['part-count',   /part-count|fastener/i],
  ['energy',       /energy/i],
  ['process-cost', /process cost|cure|oven cycle|conversion cost|paint material|fab complexity|material content/i],
];

function signalOf(title: string): string {
  for (const [key, rx] of SIGNAL_PATTERNS) if (rx.test(title)) return key;
  return `other:${title.slice(0, 32).toLowerCase()}`;
}

/** DFM/DFA finding categories are diagnostic; map them onto the 360° lever set. */
function categoryOf(issue: DFMIssue): LeverCategory {
  switch (issue.category) {
    case 'material': return 'material';
    case 'geometry': return 'design';
    case 'tolerance': return 'design';
    case 'assembly': return 'design';
    case 'process': return 'process';
    case 'automation': return 'process';
    case 'tooling': return 'tooling';
    case 'commercial': return 'commercial';
    default: return 'process';
  }
}

/** A finding carries no timeframe of its own — take it from the risk it runs. */
function timeframeOf(risk: DFMIssue['risk']): RankedOpportunity['timeframe'] {
  return risk === 'Low' ? 'Quick Win' : risk === 'Medium' ? 'Medium Term' : 'Long Term';
}

function fromLever(o: CostOptimisation, partTotal: number): RankedOpportunity {
  return {
    category: o.category ?? 'process',
    action: o.title,
    basis: o.description,
    detail: o.technicalJustification,
    savingPct: o.expectedSavingPct,
    savingPerPart: (partTotal * o.expectedSavingPct) / 100,
    risk: o.risk,
    timeframe: o.timeframe,
    owner: o.lever,
    signal: signalOf(o.title),
  };
}

function fromIssue(i: DFMIssue, partTotal: number): RankedOpportunity {
  return {
    category: categoryOf(i),
    // The recommendation IS the action — the finding title only says what was
    // observed, and leading with an observation is what reads as criticism.
    action: i.recommendation,
    basis: `${i.title} — ${i.description}`,
    savingPct: i.savingPct,
    savingPerPart: (partTotal * i.savingPct) / 100,
    risk: i.risk,
    timeframe: timeframeOf(i.risk),
    owner: i.lever,
    signal: signalOf(i.title),
  };
}

/**
 * Re-present a DFMDFA result as opportunities ranked by money per part.
 *
 * Levers are never deduplicated against each other — the catalogue authors them
 * as distinct actions, and four different things to do about tooling are four
 * rows. Rule findings ARE folded into a lever on the same signal: the lever
 * already says what to do, with a timeframe and a justification, so keeping
 * both would show one saving twice inside one category.
 */
export function rankOpportunities(dfm: DFMDFAResult, partTotal: number): RankedOpportunities {
  const total = partTotal > 0 ? partTotal : 0;

  const opportunities: RankedOpportunity[] = [];
  const verificationChecks: VerificationCheck[] = [];

  // 1 · Every lever, as authored.
  const leverSignals = new Set<string>();
  for (const lever of dfm.costOptimisations) {
    const o = fromLever(lever, total);
    leverSignals.add(o.signal);
    if (o.savingPct <= 0) continue;
    opportunities.push(o);
  }

  // 2 · Rule findings no lever already covers (and not each other twice over —
  //     "Low OEE" and "Manual pacing" are one conversation, not two).
  const findingSignals = new Set<string>();
  for (const issue of [...dfm.dfm.issues, ...dfm.dfa.issues]) {
    if (issue.savingPct <= 0) {
      // Zero-saving findings are inputs to confirm or decisions already taken.
      // They are never ranked and never framed as a shortfall.
      verificationChecks.push({
        category: categoryOf(issue),
        title: issue.title,
        detail: issue.description,
        action: issue.recommendation,
        owner: issue.lever,
      });
      continue;
    }
    const o = fromIssue(issue, total);
    if (leverSignals.has(o.signal) || findingSignals.has(o.signal)) continue;
    findingSignals.add(o.signal);
    opportunities.push(o);
  }

  opportunities.sort((a, b) => b.savingPerPart - a.savingPerPart || b.savingPct - a.savingPct);

  // 3 · Group by category; within a group biggest first, groups by their best.
  const groups: OpportunityGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCat = opportunities.filter(o => o.category === category);
    if (inCat.length === 0) continue;
    groups.push({
      category,
      label: CATEGORY_LABELS[category],
      opportunities: inCat,
      groupSavingPerPart: inCat.reduce((s, o) => s + o.savingPerPart, 0),
      topSavingPerPart: inCat[0].savingPerPart,
    });
  }
  groups.sort((a, b) => b.topSavingPerPart - a.topSavingPerPart);

  // 4 · Headline: root-sum-square of the top three ROWS SHOWN, capped at 40%.
  //     It must be computed from the ranked list, not from the engine's
  //     issue-based totalPotentialSavingPct — those are different populations,
  //     and on a real part the issue-based figure came out SMALLER than the
  //     biggest row in the list (12.8% against an 18% lever). A total that is
  //     less than one of its own components is indefensible in front of an
  //     engineer. Still root-sum-square rather than a sum, so overlapping
  //     actions never claim to save twice.
  const headlineSavingPct = opportunities.length === 0 ? 0 : Math.round(
    Math.min(40, Math.sqrt(
      opportunities.slice(0, 3).reduce((acc, o) => acc + o.savingPct ** 2, 0),
    )) * 10) / 10;

  return {
    groups,
    all: opportunities,
    verificationChecks,
    headlineSavingPct,
    headlineSavingPerPart: (total * headlineSavingPct) / 100,
    partTotal: total,
  };
}

import type { KnowledgeCase } from './part-similarity.js';

/**
 * Autonomous drift monitor — the unattended agent.
 *
 * Runs in the background (server scheduler) over the knowledge base and OPENS
 * FINDINGS on its own — no user action required:
 *   • renegotiation  — the supplier's actual price sits above should-cost →
 *                      quantified £/yr recovery opportunity
 *   • underwater     — the actual sits below should-cost → supply/quality risk
 *                      (unsustainable pricing or scope mismatch)
 *   • stale-estimate — an analysis is old and never validated with an actual →
 *                      confidence decays; nudge to refresh or log a quote
 *
 * Deterministic and fully explainable: every finding carries its arithmetic.
 */

export type DriftKind = 'renegotiation' | 'underwater' | 'stale-estimate';

export interface DriftFinding {
  kind: DriftKind;
  partName: string;
  commodity: string;
  message: string;
  /** Absolute £/yr impact (0 for stale-estimate nudges). */
  annualImpactGBP: number;
  gapPct: number;             // (actual − shouldCost) / shouldCost × 100 (0 when no actual)
  severity: 'high' | 'medium' | 'low';
}

export interface DriftOptions {
  /** Gap (fraction) before a price difference becomes a finding. */
  gapThreshold?: number;        // default 0.08 = 8%
  /** Days after which an actual-less estimate counts as stale. */
  staleAfterDays?: number;      // default 90
  now?: number;                 // injectable clock for tests
}

const round0 = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function scanForDrift(cases: KnowledgeCase[], opts: DriftOptions = {}): DriftFinding[] {
  const gapThreshold = opts.gapThreshold ?? 0.08;
  const staleAfterDays = opts.staleAfterDays ?? 90;
  const now = opts.now ?? Date.now();
  const out: DriftFinding[] = [];

  for (const c of cases) {
    if (!(c.totalCost > 0)) continue;
    const vol = Math.max(1, c.fingerprint.annualVolume ?? 1);

    if (c.actualCost && c.actualCost > 0) {
      const gap = (c.actualCost - c.totalCost) / c.totalCost;
      const gapPct = round1(gap * 100);
      const annualImpactGBP = round0(Math.abs(c.actualCost - c.totalCost) * vol);
      if (gap >= gapThreshold) {
        out.push({
          kind: 'renegotiation', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct, annualImpactGBP,
          severity: gap >= 0.20 ? 'high' : gap >= 0.12 ? 'medium' : 'low',
          message: `Supplier price £${c.actualCost.toFixed(2)} is ${gapPct}% above should-cost £${c.totalCost.toFixed(2)} — renegotiation opportunity ≈ £${annualImpactGBP.toLocaleString()}/yr at ${vol.toLocaleString()} pcs.`,
        });
      } else if (gap <= -gapThreshold) {
        out.push({
          kind: 'underwater', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct, annualImpactGBP,
          severity: gap <= -0.20 ? 'high' : 'medium',
          message: `Supplier price £${c.actualCost.toFixed(2)} is ${Math.abs(gapPct)}% BELOW should-cost £${c.totalCost.toFixed(2)} — verify scope/quality; pricing may be unsustainable (exposure ≈ £${annualImpactGBP.toLocaleString()}/yr).`,
        });
      }
    } else {
      const ageDays = (now - c.savedAt) / 86_400_000;
      if (ageDays >= staleAfterDays) {
        out.push({
          kind: 'stale-estimate', partName: c.partName, commodity: c.fingerprint.commodity,
          gapPct: 0, annualImpactGBP: 0, severity: 'low',
          message: `Estimate is ${Math.round(ageDays)} days old and never validated against a real quote — refresh it or log an actual (🎯) to keep the model calibrated.`,
        });
      }
    }
  }

  // Biggest money first; nudges last.
  return out.sort((a, b) => b.annualImpactGBP - a.annualImpactGBP);
}

// ── Outcome learning: the agent learns which findings actually earn money ─────
/**
 * A closed loop on the autonomous agent. Raw findings rank by gap × volume, but
 * not every renegotiation lead converts — some commodities/suppliers are simply
 * harder to move. When a user marks a finding actioned (with the £ actually
 * saved) or dismisses it as not worth pursuing, we log the OUTCOME. From those
 * outcomes we learn a per-(commodity,kind) hit-rate and re-rank findings by
 * EXPECTED REALIZABLE value — the agent stops shouting about theoretically-large
 * gaps that history says never close, and surfaces the money it can actually get.
 *
 * Smoothed toward a neutral 0.5 prior so a single outcome doesn't over-swing the
 * ranking (Bayesian shrinkage); fully explainable — the hit-rate is just
 * actioned ÷ total for that segment.
 */
export interface FindingOutcome {
  commodity: string;
  kind: DriftKind;
  actioned: boolean;      // true = pursued and saved money; false = dismissed as not worth it
  realizedGBP: number;    // £/yr actually saved (0 for dismissals)
  at: number;
}

export interface HitRate { rate: number; n: number; realizedTotal: number }
export interface RankedFinding extends DriftFinding {
  hitRate: number;                 // learned P(this kind of finding converts) for the commodity
  expectedRealizableGBP: number;   // annualImpactGBP × hitRate — what the agent expects to actually recover
}

const PRIOR_RATE = 0.5;            // neutral belief before any evidence
const PRIOR_STRENGTH = 2;         // pseudo-counts — how much to trust the prior vs data

const rateKey = (commodity: string, kind: DriftKind) => `${commodity}::${kind}`;

/** Smoothed hit-rate per (commodity, kind) from logged outcomes. */
export function computeHitRates(outcomes: FindingOutcome[]): Map<string, HitRate> {
  const grouped = new Map<string, FindingOutcome[]>();
  for (const o of outcomes) {
    const k = rateKey(o.commodity, o.kind);
    (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(o);
  }
  const out = new Map<string, HitRate>();
  for (const [k, os] of grouped) {
    const actioned = os.filter(o => o.actioned).length;
    const n = os.length;
    // Bayesian shrinkage toward PRIOR_RATE with PRIOR_STRENGTH pseudo-observations.
    const rate = (actioned + PRIOR_RATE * PRIOR_STRENGTH) / (n + PRIOR_STRENGTH);
    const realizedTotal = os.reduce((s, o) => s + (o.realizedGBP || 0), 0);
    out.set(k, { rate: Math.round(rate * 1000) / 1000, n, realizedTotal: Math.round(realizedTotal) });
  }
  return out;
}

/** Look up the learned hit-rate for a finding, falling back to the neutral prior. */
export function hitRateFor(commodity: string, kind: DriftKind, rates: Map<string, HitRate>): number {
  return rates.get(rateKey(commodity, kind))?.rate ?? PRIOR_RATE;
}

/**
 * Re-rank findings by expected realizable value (impact × learned hit-rate).
 * Stale-estimate nudges (no £ impact) always sort last, unchanged.
 */
export function rankFindings(findings: DriftFinding[], outcomes: FindingOutcome[]): RankedFinding[] {
  const rates = computeHitRates(outcomes);
  return findings
    .map(f => {
      const hitRate = hitRateFor(f.commodity, f.kind, rates);
      const expectedRealizableGBP = Math.round(f.annualImpactGBP * hitRate);
      return { ...f, hitRate, expectedRealizableGBP };
    })
    .sort((a, b) => b.expectedRealizableGBP - a.expectedRealizableGBP || b.annualImpactGBP - a.annualImpactGBP);
}
